import { describe, expect, it } from "vitest";
import {
  applyRule,
  applyRuleStack,
  compareRules,
  reduceToUnit,
  ruleMatches,
  scopeKeysFor,
  SCOPE_NARROWNESS,
} from "@/lib/pricing/rules";
import type { PricingRuleRow, ScopeType } from "@/lib/pricing/rules";

/**
 * Commissioned by 04 §1.3 — the canonical `ResolvedPrice` key set — and §1.4.1's precedence.
 *
 * 01 §2.3 flags two CONTRACT EXTENSIONS rather than leaving them implicit:
 * `roundingResidueMinor` on `ResolvedPrice` (which 05 §3.6 depends on at order build time) and
 * `compareAtMinor` on the display map. A reader of 01 alone would have written a ten-field type
 * and a three-key map and discovered the difference at P23, in the middle of checkout.
 */

/** The eleven keys, in the order 01 §2.3 declares them. */
const RESOLVED_PRICE_KEYS = [
  "currencyCode",
  "unitListMinor",
  "unitSaleMinor",
  "unitFinalMinor",
  "lineSubtotalMinor",
  "discountBreakdown",
  "priceSource",
  "metalRateId",
  "priceRecordId",
  "roundingResidueMinor",
  "computedAt",
] as const;

const rule = (over: Partial<PricingRuleRow>): PricingRuleRow => ({
  id: "00000000-0000-7000-8000-000000000001",
  name: "ZZ rule",
  scopeType: "all",
  scopeId: null,
  adjustmentType: "percentage_off",
  amountBasis: "per_unit",
  valueBp: 1000,
  amountMinor: null,
  priority: 0,
  isStackable: false,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  ...over,
});

describe("the ResolvedPrice contract", () => {
  it("declares exactly eleven keys, including both flagged extensions", async () => {
    // Read from the type's own declaration file rather than a constructed object, so a field
    // that is optional-and-never-set still counts.
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("src/lib/pricing/types.ts", "utf8");
    const block = /export type ResolvedPrice = \{([\s\S]*?)\n\};/.exec(src)?.[1] ?? "";
    const keys = [...block.matchAll(/^\s{2}(\w+)[?]?:/gm)].map((m) => m[1]!);
    expect(keys).toEqual([...RESOLVED_PRICE_KEYS]);
  });

  it("declares compareAtMinor on the display type", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("src/lib/pricing/types.ts", "utf8");
    const block = /export type DisplayPrice = \{([\s\S]*?)\n\};/.exec(src)?.[1] ?? "";
    const keys = [...block.matchAll(/^\s{2}(\w+)[?]?:/gm)].map((m) => m[1]!);
    expect(keys).toEqual(["currencyCode", "listMinor", "saleMinor", "compareAtMinor"]);
  });
});

describe("rule precedence is total and deterministic", () => {
  it("ranks all eight scope types, narrowest first", () => {
    // A table, not the enum's declaration order. Relying on the enum would make adding a
    // ninth scope type silently reorder precedence for every rule already in the database.
    const order = (Object.keys(SCOPE_NARROWNESS) as ScopeType[]).sort(
      (a, b) => SCOPE_NARROWNESS[a] - SCOPE_NARROWNESS[b],
    );
    expect(order).toEqual([
      "product",
      "customer_group",
      "collection",
      "stone",
      "material",
      "tag",
      "category",
      "all",
    ]);
  });

  it("puts lower priority first", () => {
    const a = rule({ id: "a", priority: 1 });
    const b = rule({ id: "b", priority: 5 });
    expect([b, a].sort(compareRules).map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("breaks a priority tie by narrower scope", () => {
    const broad = rule({ id: "broad", scopeType: "category", scopeId: "c" });
    const narrow = rule({ id: "narrow", scopeType: "product", scopeId: "p" });
    expect([broad, narrow].sort(compareRules).map((r) => r.id)).toEqual(["narrow", "broad"]);
  });

  it("breaks a scope tie by the newer rule", () => {
    const older = rule({ id: "older", createdAt: new Date("2026-01-01T00:00:00Z") });
    const newer = rule({ id: "newer", createdAt: new Date("2026-06-01T00:00:00Z") });
    expect([older, newer].sort(compareRules).map((r) => r.id)).toEqual(["newer", "older"]);
  });

  it("is TOTAL — two otherwise-identical rules still order stably", () => {
    // Without the final id tiebreak, the same bag prices differently on two requests
    // depending on what the database happened to return first.
    const a = rule({ id: "aaaa" });
    const b = rule({ id: "bbbb" });
    expect([a, b].sort(compareRules).map((r) => r.id)).toEqual(["aaaa", "bbbb"]);
    expect([b, a].sort(compareRules).map((r) => r.id)).toEqual(["aaaa", "bbbb"]);
  });
});

describe("scope matching", () => {
  const keys = scopeKeysFor(
    [
      { scopeType: "product", scopeId: "p1" },
      { scopeType: "stone", scopeId: "s1" },
    ],
    "grp",
  );

  it("always matches an `all` rule", () => {
    expect(ruleMatches(rule({ scopeType: "all", scopeId: null }), keys)).toBe(true);
  });

  it("matches a scope the line belongs to and not one it does not", () => {
    expect(ruleMatches(rule({ scopeType: "product", scopeId: "p1" }), keys)).toBe(true);
    expect(ruleMatches(rule({ scopeType: "product", scopeId: "p2" }), keys)).toBe(false);
    expect(ruleMatches(rule({ scopeType: "stone", scopeId: "s1" }), keys)).toBe(true);
    expect(ruleMatches(rule({ scopeType: "category", scopeId: "c1" }), keys)).toBe(false);
  });

  it("never matches an anonymous shopper to a customer-group rule", () => {
    // Step 6 is skipped entirely for an anonymous request; it never inherits `retail`.
    const anon = scopeKeysFor([{ scopeType: "product", scopeId: "p1" }], null);
    expect(ruleMatches(rule({ scopeType: "customer_group", scopeId: "grp" }), anon)).toBe(
      false,
    );
    expect(ruleMatches(rule({ scopeType: "customer_group", scopeId: "grp" }), keys)).toBe(true);
  });
});

describe("a non-stackable rule is the only non-coupon discount applied", () => {
  it("stops after the winner", () => {
    const winner = rule({ id: "w", priority: 0, valueBp: 1000, isStackable: false });
    const other = rule({ id: "o", priority: 1, valueBp: 5000, isStackable: true });
    const { lineMinor, breakdown } = applyRuleStack(10000n, 1, [winner, other]);
    expect(breakdown).toHaveLength(1);
    expect(lineMinor).toBe(9000n);
  });

  it("composes stackable rules on the running amount, in order", () => {
    const first = rule({ id: "a", priority: 0, valueBp: 1000, isStackable: true });
    const second = rule({ id: "b", priority: 1, valueBp: 1000, isStackable: true });
    const { lineMinor } = applyRuleStack(10000n, 1, [first, second]);
    // 10% then 10% of the REMAINDER — 9000 then 8100. Not 20%, which is what adding the
    // percentages first would give (8000) and is a different, larger discount.
    expect(lineMinor).toBe(8100n);
  });
});

describe("fixed_price is a price, not a subtraction", () => {
  it("can raise the line", () => {
    // "Fixed price ₹4,999" means ₹4,999 whatever the list was. Clamping it to a reduction
    // would quietly make a repricing rule a no-op in exactly the cases it was created for.
    const r = rule({ adjustmentType: "fixed_price", amountMinor: 49900n, valueBp: null });
    expect(applyRule(10000n, 1, r)).toBe(49900n);
  });

  it("multiplies by quantity on per_unit and does not on per_line", () => {
    const perUnit = rule({
      adjustmentType: "fixed_price",
      amountBasis: "per_unit",
      amountMinor: 5000n,
      valueBp: null,
    });
    const perLine = rule({
      adjustmentType: "fixed_price",
      amountBasis: "per_line",
      amountMinor: 5000n,
      valueBp: null,
    });
    expect(applyRule(99999n, 3, perUnit)).toBe(15000n);
    expect(applyRule(99999n, 3, perLine)).toBe(5000n);
  });
});

describe("the worked example of 04 §1.4.2", () => {
  it("puts the cent where round-once actually puts it", () => {
    // Unit list 9999 ($99.99), quantity 3, a 17.5% rule.
    //
    // 04 §1.4.2's printed table gives the line discount as 5250 and the residue as 0. That is
    // WRONG, and wrong in the one way that matters here: 5250 is applyBp(9999, 1750) × 3 —
    // the PER-UNIT-THEN-MULTIPLY figure the example exists to argue against. Rounding once on
    // the line is applyBp(29997, 1750) = 5249 (exactly 5249.475, half-up). The document has
    // been corrected; this asserts the arithmetic, which is the thing orders reconcile against.
    const r = rule({ valueBp: 1750 });
    const { lineMinor } = applyRuleStack(9999n * 3n, 3, [r]);
    expect(lineMinor).toBe(24748n);

    const reduced = reduceToUnit(lineMinor, 3);
    expect(reduced.unitFinalMinor).toBe(8250n);
    expect(reduced.lineSubtotalMinor).toBe(24750n);
    expect(reduced.roundingResidueMinor).toBe(2n);
    // All three identities hold simultaneously, which is the whole point of the step.
    expect(reduced.lineSubtotalMinor - reduced.roundingResidueMinor).toBe(lineMinor);
  });

  it("and differs from per-unit-then-multiply on exactly this example", () => {
    // With the document's own numbers corrected, the example finally demonstrates what it was
    // written to demonstrate: the two methods give different answers.
    const lineFirst = 29997n - 5249n;
    const unitFirst = (9999n - 1750n) * 3n;
    expect(lineFirst).toBe(24748n);
    expect(unitFirst).toBe(24747n);
    expect(lineFirst).not.toBe(unitFirst);
  });

  it("carries the residue when the discount does not divide", () => {
    // Quantity 2, per_line fixed_amount_off of 2501.
    const r = rule({
      adjustmentType: "fixed_amount_off",
      amountBasis: "per_line",
      amountMinor: 2501n,
      valueBp: null,
    });
    const { lineMinor } = applyRuleStack(9999n * 2n, 2, [r]);
    expect(lineMinor).toBe(17497n);
    const reduced = reduceToUnit(lineMinor, 2);
    expect(reduced.unitFinalMinor).toBe(8749n);
    expect(reduced.lineSubtotalMinor).toBe(17498n);
    expect(reduced.roundingResidueMinor).toBe(1n);
    // The identity the order builder relies on: subtotal − residue is the quoted figure.
    expect(reduced.lineSubtotalMinor - reduced.roundingResidueMinor).toBe(17497n);
  });

  it("is NOT per-unit-then-multiply, which is the wrong answer", () => {
    // Same inputs, the naive way: applyBp per unit gives 1750 each → 8249 × 3 = 24747 here,
    // which coincides. The case that separates them is one where the per-unit rounding
    // accumulates: unit 333, quantity 3, 50%.
    const half = rule({ valueBp: 5000 });
    const { lineMinor } = applyRuleStack(333n * 3n, 3, [half]);
    // Line-then-reduce: applyBp(999, 5000) = 500 (half-up), so 499.
    expect(lineMinor).toBe(499n);
    // Per-unit-then-multiply: applyBp(333, 5000) = 167 → 166 × 3 = 498. One minor unit
    // different, on every line, in the customer's favour or not depending on the rounding.
    expect(lineMinor).not.toBe(498n);
  });
});
