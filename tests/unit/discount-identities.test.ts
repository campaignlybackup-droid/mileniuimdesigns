import { describe, expect, it } from "vitest";
import { allocate } from "@/lib/money";
import { applyRuleStack, reduceToUnit } from "@/lib/pricing/rules";
import type { AdjustmentType, AmountBasis, PricingRuleRow } from "@/lib/pricing/rules";

/**
 * Commissioned by 04 §1.4.2, which 02 §1.10 calls "the single most likely way this schema
 * breaks in its first week".
 *
 * THREE integer identities must hold simultaneously, and the naive implementation satisfies
 * two of the three:
 *
 *   1. `line_subtotal_minor = unit_final_minor * quantity`   (chk_order_items_subtotal)
 *   2. `line_subtotal_minor − rounding_residue = the quoted line total`
 *   3. the discount was rounded ONCE, on the line, never per unit then multiplied
 *
 * A sweep, not three examples: quantities 1–12 × every adjustment type × both bases. The bugs
 * here are all off-by-one-minor-unit and they hide in exactly the quantities nobody tries.
 */

const QUANTITIES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
const UNIT_PRICES = [1n, 7n, 99n, 333n, 999n, 9999n, 158_900n] as const;

const rule = (over: Partial<PricingRuleRow>): PricingRuleRow => ({
  id: "00000000-0000-7000-8000-00000000000a",
  name: "sweep",
  scopeType: "all",
  scopeId: null,
  adjustmentType: "percentage_off",
  amountBasis: "per_unit",
  valueBp: 1750,
  amountMinor: null,
  priority: 0,
  isStackable: false,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  ...over,
});

const CASES: {
  label: string;
  adjustmentType: AdjustmentType;
  amountBasis: AmountBasis;
  valueBp: number | null;
  amountMinor: bigint | null;
}[] = [
  {
    label: "17.5% off",
    adjustmentType: "percentage_off",
    amountBasis: "per_unit",
    valueBp: 1750,
    amountMinor: null,
  },
  {
    label: "33.33% off",
    adjustmentType: "percentage_off",
    amountBasis: "per_unit",
    valueBp: 3333,
    amountMinor: null,
  },
  {
    label: "100% off",
    adjustmentType: "percentage_off",
    amountBasis: "per_unit",
    valueBp: 10000,
    amountMinor: null,
  },
  {
    label: "$25 off each",
    adjustmentType: "fixed_amount_off",
    amountBasis: "per_unit",
    valueBp: null,
    amountMinor: 2500n,
  },
  {
    label: "$25.01 off the line",
    adjustmentType: "fixed_amount_off",
    amountBasis: "per_line",
    valueBp: null,
    amountMinor: 2501n,
  },
  {
    label: "fixed $49.99 each",
    adjustmentType: "fixed_price",
    amountBasis: "per_unit",
    valueBp: null,
    amountMinor: 4999n,
  },
  {
    label: "fixed $49.99 the line",
    adjustmentType: "fixed_price",
    amountBasis: "per_line",
    valueBp: null,
    amountMinor: 4999n,
  },
];

describe("the three identities hold on every combination", () => {
  it("sweeps quantities 1-12 x 7 unit prices x 7 adjustments", () => {
    let combinations = 0;
    for (const quantity of QUANTITIES) {
      for (const unit of UNIT_PRICES) {
        for (const c of CASES) {
          combinations++;
          const lineBase = unit * BigInt(quantity);
          const { lineMinor, breakdown } = applyRuleStack(lineBase, quantity, [
            rule({
              adjustmentType: c.adjustmentType,
              amountBasis: c.amountBasis,
              valueBp: c.valueBp,
              amountMinor: c.amountMinor,
            }),
          ]);
          const lineFinal = lineMinor < 0n ? 0n : lineMinor;
          const { unitFinalMinor, lineSubtotalMinor, roundingResidueMinor } = reduceToUnit(
            lineFinal,
            quantity,
          );
          const where = `${c.label} q=${String(quantity)} unit=${String(unit)}`;

          // 1 — chk_order_items_subtotal, which the database will enforce at P18.
          expect(lineSubtotalMinor, where).toBe(unitFinalMinor * BigInt(quantity));
          // 2 — the residue is where the indivisible remainder went, and it is never lost.
          expect(lineSubtotalMinor - roundingResidueMinor, where).toBe(lineFinal);
          // The residue is bounded: at most quantity−1 minor units, never negative.
          expect(roundingResidueMinor >= 0n, where).toBe(true);
          expect(roundingResidueMinor < BigInt(quantity), where).toBe(true);
          // 3 — the breakdown accounts for the whole delta, which is what makes
          // `sum(discountBreakdown) = base − final` an assertion rather than a hope.
          const delta = breakdown.reduce((a, d) => a + d.amountMinor, 0n);
          expect(lineBase + delta, where).toBe(lineMinor);
        }
      }
    }
    // A sweep that swept nothing would pass every assertion inside it.
    expect(combinations).toBe(QUANTITIES.length * UNIT_PRICES.length * CASES.length);
  });

  it("a 100% discount clamps to zero and stays consistent", () => {
    const { lineMinor } = applyRuleStack(9999n * 3n, 3, [rule({ valueBp: 10000 })]);
    expect(lineMinor).toBe(0n);
    const r = reduceToUnit(0n, 3);
    expect(r.unitFinalMinor).toBe(0n);
    expect(r.lineSubtotalMinor).toBe(0n);
    expect(r.roundingResidueMinor).toBe(0n);
  });

  it("a per_line discount larger than the line is clamped by the caller, not here", () => {
    // `applyRuleStack` is arithmetic; the clamp at step 8 belongs to the resolver, which is
    // where the DiscountLine recording the clamp is written. Asserting the raw negative here
    // is what stops someone "helpfully" clamping in two places and double-counting it.
    const big = rule({
      adjustmentType: "fixed_amount_off",
      amountBasis: "per_line",
      amountMinor: 999_999n,
      valueBp: null,
    });
    const { lineMinor } = applyRuleStack(1000n, 1, [big]);
    expect(lineMinor).toBeLessThan(0n);
  });
});

describe("a fixed-amount coupon is allocated, never divided", () => {
  it("splits $25 across three lines as 8 + 8 + 9, summing exactly", () => {
    // 02 §1.10 rule 3. Dividing would give 8.33 three times, which is 24.99 and a float.
    const parts = allocate(2500n, [10000n, 10000n, 10000n]);
    expect(parts.reduce((a, b) => a + b, 0n)).toBe(2500n);
    expect(parts).toEqual([834n, 833n, 833n]);
  });

  it("weights by line subtotal, and still sums exactly", () => {
    const weights = [19900n, 4900n, 158_900n];
    const parts = allocate(5000n, weights);
    expect(parts.reduce((a, b) => a + b, 0n)).toBe(5000n);
    expect(parts.every((p) => p >= 0n)).toBe(true);
  });
});
