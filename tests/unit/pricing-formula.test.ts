import { describe, expect, it } from "vitest";
import { applyBpSigned, roundToIncrement } from "@/lib/money";
import { evaluateFormula, type FormulaInputs } from "@/lib/pricing/formula";

/**
 * Commissioned by 04 §2.3 and the fully worked example of 04 §9.
 *
 * §9 prices ONE physical ring in two markets from the same formula version, and prints every
 * intermediate figure. That makes it the highest-value test in the pricing work: it pins the
 * arithmetic against numbers written down before the code existed, rather than against
 * whatever the code happens to produce.
 *
 * The headline of §9.3: **$160.00 and ₹10,000.00 are not a conversion of one another and no
 * code path relates them.** Four of the six inputs are configured separately per currency and
 * the two rounding increments differ.
 */

/** The §9.1 piece, with the terms that are currency-free. */
const PIECE = {
  weightMilligrams: 6400n,
  purityBp: 9250,
  rateScale: 4,
  makingChargeMode: "percent_of_metal" as const,
  makingChargeBp: 15000,
  makingChargeMinor: null,
  makingChargePerGramMinor: null,
  includeStoneCost: true,
  includeOtherMaterialCost: true,
  markupMode: "percent_of_subtotal" as const,
  markupMinor: null,
  marketAdjustmentDeltaMinor: 0n,
  marketAdjustmentBp: null,
  roundingMode: "half_up" as const,
  floorMinor: null,
};

const US: FormulaInputs = {
  ...PIECE,
  rateMinorPerGram: 1_050_000n,
  stoneCostMinor: 4500n,
  otherMaterialCostMinor: 1200n,
  markupBp: 12000,
  roundingIncrementMinor: 100n,
};

const INDIA: FormulaInputs = {
  ...PIECE,
  rateMinorPerGram: 92_500_000n,
  stoneCostMinor: 300_000n,
  otherMaterialCostMinor: 90_000n,
  markupBp: 9000,
  roundingIncrementMinor: 10_000n,
};

describe("04 §9.3 — the US figures, exactly", () => {
  const r = evaluateFormula(US);

  it("produces every snapshot column the document prints", () => {
    expect(r.metalComponentMinor).toBe(622n);
    expect(r.makingChargeComputedMinor).toBe(932n);
    expect(r.stoneCostMinor).toBe(4500n);
    expect(r.otherMaterialCostMinor).toBe(1200n);
    expect(r.markupMinor).toBe(8705n);
    expect(r.marketAdjustmentDeltaMinor).toBe(0n);
    expect(r.computedBaseMinor).toBe(15959n);
    expect(r.roundingAdjustmentMinor).toBe(41n);
    expect(r.listMinor).toBe(16000n); // $160.00
  });

  it("satisfies chk_prices_components_sum", () => {
    // The components sum EXACTLY to the base — which is why the constraint can be a CHECK
    // rather than a hope, and why a rounding bug fails an INSERT instead of shipping.
    const sum =
      r.metalComponentMinor +
      r.makingChargeComputedMinor +
      r.stoneCostMinor +
      r.otherMaterialCostMinor +
      r.markupMinor +
      r.marketAdjustmentDeltaMinor +
      r.floorAdjustmentMinor;
    expect(sum).toBe(r.computedBaseMinor);
  });

  it("satisfies chk_prices_list_identity", () => {
    expect(r.computedBaseMinor + r.roundingAdjustmentMinor).toBe(r.listMinor);
  });

  it("allocates the two leftover minor units to markup and metal, as §9.3 works through", () => {
    // Floors are 621 + 932 + 4500 + 1200 + 8704 = 15957, two short. The largest fractional
    // remainders are markup (.800) and metal (.600), so each takes one.
    expect(r.markupMinor).toBe(8705n); // 8704 + 1
    expect(r.metalComponentMinor).toBe(622n); // 621 + 1
    expect(r.makingChargeComputedMinor).toBe(932n); // unchanged
  });
});

describe("04 §9.3 — the India figures, exactly", () => {
  const r = evaluateFormula(INDIA);

  it("produces every snapshot column the document prints", () => {
    expect(r.metalComponentMinor).toBe(54_760n);
    expect(r.makingChargeComputedMinor).toBe(82_140n);
    expect(r.stoneCostMinor).toBe(300_000n);
    expect(r.otherMaterialCostMinor).toBe(90_000n);
    expect(r.markupMinor).toBe(474_210n);
    expect(r.computedBaseMinor).toBe(1_001_110n);
    expect(r.roundingAdjustmentMinor).toBe(-1110n);
    expect(r.listMinor).toBe(1_000_000n); // ₹10,000.00
  });

  it("rounds DOWN to the nearest ₹100 while the US rounds UP to the dollar", () => {
    // Same formula version, same piece, opposite rounding directions — because the increments
    // and the bases differ, not because anything knows about currencies.
    expect(r.roundingAdjustmentMinor).toBeLessThan(0n);
    expect(evaluateFormula(US).roundingAdjustmentMinor).toBeGreaterThan(0n);
  });
});

describe("the two markets are not a conversion of one another", () => {
  it("no ratio relates the two list prices", () => {
    const us = evaluateFormula(US).listMinor; // 16000
    const india = evaluateFormula(INDIA).listMinor; // 1000000
    // If India were derived from the US figure at ANY single rate, the same rate would have to
    // relate the components too. It does not: the markup alone differs by 120% vs 90%.
    expect(us).toBe(16_000n);
    expect(india).toBe(1_000_000n);
    const impliedRate = Number(india) / Number(us); // 62.5
    const stoneRate = Number(INDIA.stoneCostMinor) / Number(US.stoneCostMinor); // 66.67
    expect(Math.abs(impliedRate - stoneRate)).toBeGreaterThan(1);
  });

  it("changing one market's input leaves the other's output untouched", () => {
    const before = evaluateFormula(INDIA).listMinor;
    const usRaised = evaluateFormula({ ...US, rateMinorPerGram: 2_100_000n });
    expect(usRaised.listMinor).not.toBe(16_000n);
    expect(evaluateFormula(INDIA).listMinor).toBe(before);
  });
});

describe("the floor is a floor AFTER the increment", () => {
  it("does not let `down` rounding walk back through it", () => {
    // 04 §2.3 step 7b, the exact case it names: floor 10000, base 10000, increment 3000,
    // mode 'down' → 9000, which is below the floor the admin set to stop precisely that.
    const r = evaluateFormula({
      ...US,
      rateMinorPerGram: 0n,
      stoneCostMinor: 10_000n,
      otherMaterialCostMinor: 0n,
      makingChargeMode: "none",
      makingChargeBp: null,
      markupMode: "none",
      markupBp: null,
      roundingIncrementMinor: 3000n,
      roundingMode: "down",
      floorMinor: 10_000n,
    });
    expect(r.computedBaseMinor).toBe(10_000n);
    expect(r.listMinor).toBeGreaterThanOrEqual(10_000n);
    expect(r.listMinor).toBe(12_000n); // roundToIncrement(10000, 3000, 'up')
  });

  it("records the clamp so the components still sum", () => {
    const r = evaluateFormula({
      ...US,
      rateMinorPerGram: 0n,
      stoneCostMinor: 100n,
      otherMaterialCostMinor: 0n,
      makingChargeMode: "none",
      makingChargeBp: null,
      markupMode: "none",
      markupBp: null,
      roundingIncrementMinor: 1n,
      floorMinor: 50_000n,
    });
    expect(r.floorAdjustmentMinor).toBe(49_900n);
    const sum =
      r.metalComponentMinor +
      r.makingChargeComputedMinor +
      r.stoneCostMinor +
      r.otherMaterialCostMinor +
      r.markupMinor +
      r.marketAdjustmentDeltaMinor +
      r.floorAdjustmentMinor;
    // Without floor_adjustment_minor the components sum to the UNCLAMPED figure and the
    // INSERT fails on exactly the lines the floor exists to protect.
    expect(sum).toBe(r.computedBaseMinor);
  });
});

describe("applyBpSigned, because applyBp is not signed", () => {
  it("is symmetric about zero", () => {
    // The assertion that matters (04 §2.3). With `applyBp`, BigInt division truncates toward
    // zero and the +5000 pushes a negative product further wrong — a −1500 bp adjustment is
    // off by a minor unit in the merchant's favour on roughly half of all bases, forever.
    for (const amount of [1n, 7n, 99n, 333n, 15_959n, 1_001_110n]) {
      for (const bp of [1, 250, 1500, 3333, 9999]) {
        expect(applyBpSigned(-amount, bp)).toBe(-applyBpSigned(amount, bp));
      }
    }
  });

  it("rounds away from zero on a .5", () => {
    // 10 × 500bp = 0.5 exactly.
    expect(applyBpSigned(10n, 500)).toBe(1n);
    expect(applyBpSigned(-10n, 500)).toBe(-1n);
  });
});

describe("roundToIncrement", () => {
  it("implements the three modes as 04 §2.3 defines them", () => {
    expect(roundToIncrement(15_959n, 100n, "half_up")).toBe(16_000n);
    expect(roundToIncrement(15_949n, 100n, "half_up")).toBe(15_900n);
    expect(roundToIncrement(15_901n, 100n, "up")).toBe(16_000n);
    expect(roundToIncrement(15_999n, 100n, "down")).toBe(15_900n);
    expect(roundToIncrement(1_001_110n, 10_000n, "half_up")).toBe(1_000_000n);
  });

  it("refuses a negative amount and a non-positive increment", () => {
    // Defined for x >= 0 only, which step 6's clamp guarantees. Saying so out loud beats
    // returning a plausible number for an input the caller should never have produced.
    expect(() => roundToIncrement(-1n, 100n, "half_up")).toThrow();
    expect(() => roundToIncrement(100n, 0n, "half_up")).toThrow();
  });
});
