import "server-only";
import { applyBp } from "@/lib/money";
import type { DiscountLine } from "@/lib/pricing/types";

/**
 * Pricing rule precedence and arithmetic — 04 §1.4.1, §1.4.2.
 *
 * 02 §1.10 calls this "the single most likely way this schema breaks in its first week",
 * because three integer identities have to hold at once — `line_subtotal_minor =
 * unit_final_minor * quantity`, the order total, and "round ONCE on the line total, never per
 * unit then multiplied". The naive implementation satisfies two of the three.
 *
 * Pure functions, no I/O. Everything here is `bigint`; nothing is a `number` that could be a
 * float carrying a fraction of a cent.
 */

export type AdjustmentType = "percentage_off" | "fixed_amount_off" | "fixed_price";
export type AmountBasis = "per_unit" | "per_line";

export type ScopeType =
  | "all"
  | "product"
  | "category"
  | "collection"
  | "material"
  | "stone"
  | "tag"
  | "customer_group";

export type PricingRuleRow = {
  id: string;
  name: string;
  scopeType: ScopeType;
  scopeId: string | null;
  adjustmentType: AdjustmentType;
  amountBasis: AmountBasis;
  valueBp: number | null;
  amountMinor: bigint | null;
  priority: number;
  isStackable: boolean;
  createdAt: Date;
};

/**
 * Narrower scope wins a priority tie, by this FIXED ranking (04 §1.4.1 step 2).
 *
 * Lower is narrower. It is a table and not a comparison on the enum's declaration order,
 * because the enum's order is alphabetical-ish and means nothing — relying on it would make
 * adding a ninth scope type silently reorder precedence for every existing rule.
 */
export const SCOPE_NARROWNESS: Record<ScopeType, number> = {
  product: 1,
  customer_group: 2,
  collection: 3,
  stone: 4,
  material: 5,
  tag: 6,
  category: 7,
  all: 8,
};

/**
 * Total and deterministic (04 §1.4.1): priority ASC, then narrower scope, then newer first.
 *
 * "Total" is the operative word. Two rules that compare equal under every tiebreak would be
 * ordered by whatever the database happened to return, so the same bag could price differently
 * on two requests — and the id is the final, arbitrary-but-stable tiebreak that stops it.
 */
export function compareRules(a: PricingRuleRow, b: PricingRuleRow): number {
  if (a.priority !== b.priority) return a.priority - b.priority;
  const na = SCOPE_NARROWNESS[a.scopeType];
  const nb = SCOPE_NARROWNESS[b.scopeType];
  if (na !== nb) return na - nb;
  const ta = a.createdAt.getTime();
  const tb = b.createdAt.getTime();
  if (ta !== tb) return tb - ta;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** The scopes one line belongs to, as `"<type>:<id>"` plus the bare `"all"`. */
export function scopeKeysFor(
  memberships: { scopeType: ScopeType; scopeId: string }[],
  customerGroupId: string | null,
): Set<string> {
  const keys = new Set<string>(["all"]);
  for (const m of memberships) keys.add(`${m.scopeType}:${m.scopeId}`);
  if (customerGroupId !== null) keys.add(`customer_group:${customerGroupId}`);
  return keys;
}

export function ruleMatches(rule: PricingRuleRow, scopeKeys: ReadonlySet<string>): boolean {
  if (rule.scopeType === "all") return true;
  if (rule.scopeId === null) return false;
  return scopeKeys.has(`${rule.scopeType}:${rule.scopeId}`);
}

/**
 * Apply ONE rule to a line total and return the new total.
 *
 * `fixed_price` is a *price*, not a subtraction, and may be HIGHER than the running amount —
 * "fixed price ₹4,999" means ₹4,999 whatever the list was. Returning it unclamped is
 * deliberate; clamping it to a reduction would quietly make a repricing rule a no-op.
 */
export function applyRule(lineMinor: bigint, quantity: number, rule: PricingRuleRow): bigint {
  const q = BigInt(quantity);
  switch (rule.adjustmentType) {
    case "percentage_off":
      // ONE applyBp on the WHOLE line (02 §1.10 rule 1). Per unit then multiplied is the
      // wrong answer by up to (quantity − 1) minor units.
      return lineMinor - applyBp(lineMinor, BigInt(rule.valueBp ?? 0));
    case "fixed_amount_off":
      return (
        lineMinor -
        (rule.amountBasis === "per_unit"
          ? (rule.amountMinor ?? 0n) * q
          : (rule.amountMinor ?? 0n))
      );
    case "fixed_price":
      return rule.amountBasis === "per_unit"
        ? (rule.amountMinor ?? 0n) * q
        : (rule.amountMinor ?? 0n);
  }
}

export type RuleOutcome = { lineMinor: bigint; breakdown: DiscountLine[] };

/**
 * The rule stack for one line (04 §1.4.1 steps 4–5).
 *
 * A non-stackable winner is the ONLY non-coupon discount applied. `fixed_price` additionally
 * ends the stack — `chk_pricing_rules_fixed_price_not_stackable` makes a stackable one
 * unwritable, so this is belt to the database's braces rather than a second opinion.
 */
export function applyRuleStack(
  lineBaseMinor: bigint,
  quantity: number,
  matching: PricingRuleRow[],
): RuleOutcome {
  const ordered = [...matching].sort(compareRules);
  const breakdown: DiscountLine[] = [];
  let lineMinor = lineBaseMinor;

  for (const rule of ordered) {
    const before = lineMinor;
    lineMinor = applyRule(lineMinor, quantity, rule);
    breakdown.push({
      kind: rule.scopeType === "customer_group" ? "customer_group" : "pricing_rule",
      ref: rule.id,
      label: rule.name,
      amountMinor: lineMinor - before,
    });
    if (!rule.isStackable) break;
  }

  return { lineMinor, breakdown };
}

/**
 * Step 9 — reduce a line total to an integer unit price without losing the residue.
 *
 * CEIL rather than floor, deliberately: it makes the displayed unit price the conservative one
 * and puts the residue on the DISCOUNT side, where it is visible in `discountBreakdown` rather
 * than hidden inside a price. `chk_order_items_subtotal` requires
 * `line_subtotal_minor = unit_final_minor * quantity` exactly, and this is the step that makes
 * that identity and "round once" simultaneously true.
 */
export function reduceToUnit(
  lineFinalMinor: bigint,
  quantity: number,
): { unitFinalMinor: bigint; lineSubtotalMinor: bigint; roundingResidueMinor: bigint } {
  const q = BigInt(quantity);
  const unitFinalMinor = (lineFinalMinor + q - 1n) / q;
  const lineSubtotalMinor = unitFinalMinor * q;
  return {
    unitFinalMinor,
    lineSubtotalMinor,
    roundingResidueMinor: lineSubtotalMinor - lineFinalMinor,
  };
}

/**
 * The percentage-coupon step (04 §1.4 step 7), applied to the line total and rounded once.
 *
 * Lives here rather than in `resolve.ts` because it is arithmetic: no database, no actor, no
 * I/O. Fixed-amount and free-shipping coupons are NOT here and never touch a unit price —
 * they are order-level, read per currency from `coupon_amounts`, and allocated across lines by
 * `quoteOrderDiscounts()` (04 §1.4 step 7b). $25 across three units is 8.333, which is not an
 * integer and therefore not a unit price.
 */
export function applyPercentageCoupon(
  lineMinor: bigint,
  valueBp: number,
  code: string,
): { lineMinor: bigint; line: DiscountLine } {
  const delta = applyBp(lineMinor, BigInt(valueBp));
  return {
    lineMinor: lineMinor - delta,
    line: { kind: "coupon", ref: code, label: code, amountMinor: -delta },
  };
}
