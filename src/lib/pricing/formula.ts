import { allocate, applyBpSigned, roundToIncrement } from "@/lib/money";

/**
 * `evaluateFormula` — 04 §2.3. Pure, synchronous, no database, no side effect.
 *
 * ONE implementation, used by the admin formula editor's live preview, by the recalc preview
 * and by the apply job — so the preview a human approves is arithmetically IDENTICAL to the row
 * that ships. A second implementation anywhere is how "the number I approved" and "the number
 * that shipped" become two different numbers that are each individually defensible.
 *
 * **One rounding, and it is at the end.** Every term is evaluated in nano-minor units — one
 * millionth of a cent — and the single rounding to the minor unit happens once, on the total.
 * Rounding per term and adding is a different number, and the difference grows with the number
 * of terms.
 */

/** One millionth of a minor unit. Wide enough that no intermediate term loses a cent. */
export const SCALE = 1_000_000n;

export type PuritySource = "material" | "override";
export type WeightSource = "variant_primary" | "variant_material" | "fixed";
export type MakingChargeMode = "none" | "percent_of_metal" | "fixed_per_gram" | "fixed";
export type MarkupMode = "none" | "percent_of_subtotal" | "fixed";
export type RoundingMode = "half_up" | "up" | "down";

export type FormulaInputs = {
  /** `metal_rates.rate_minor_per_gram`, scaled by `10^rateScale`. */
  rateMinorPerGram: bigint;
  /** 0..6. Silver at ₹94.3782/g is not expressible in paise per gram without it. */
  rateScale: number;
  /** `variant_materials.weight_grams × 1000`, or the version's fixed weight. */
  weightMilligrams: bigint;
  /** `materials.purity_ratio × 10000`, or the version's override. 9250 = .925. */
  purityBp: number;

  makingChargeMode: MakingChargeMode;
  makingChargeBp: number | null;
  makingChargeMinor: bigint | null;
  makingChargePerGramMinor: bigint | null;

  includeStoneCost: boolean;
  includeOtherMaterialCost: boolean;
  stoneCostMinor: bigint;
  otherMaterialCostMinor: bigint;

  markupMode: MarkupMode;
  markupBp: number | null;
  markupMinor: bigint | null;

  /** Signed. Exactly one of these is non-null (chk_pfmt_adjustment_one). */
  marketAdjustmentDeltaMinor: bigint | null;
  marketAdjustmentBp: number | null;

  roundingIncrementMinor: bigint;
  roundingMode: RoundingMode;
  floorMinor: bigint | null;
};

export type FormulaResult = {
  /** The six components, which sum EXACTLY to `computedBaseMinor`. */
  metalComponentMinor: bigint;
  makingChargeComputedMinor: bigint;
  stoneCostMinor: bigint;
  otherMaterialCostMinor: bigint;
  markupMinor: bigint;
  marketAdjustmentDeltaMinor: bigint;
  /** Signed. How far the floor (or the zero clamp) moved the base; 0 when neither fired. */
  floorAdjustmentMinor: bigint;
  computedBaseMinor: bigint;
  /** Signed. The residue of the commercial increment. */
  roundingAdjustmentMinor: bigint;
  listMinor: bigint;
};

export function evaluateFormula(input: FormulaInputs): FormulaResult {
  // 1. Metal. Multiply everything first, divide ONCE — dividing per factor loses a digit at
  //    each step and the loss is systematic, not random.
  const divisor = 10n ** BigInt(input.rateScale) * 1000n * 10_000n;
  const metalNano =
    (input.rateMinorPerGram * input.weightMilligrams * BigInt(input.purityBp) * SCALE) /
    divisor;

  // 2. Making charge — exactly one branch, by mode.
  const makingNano =
    input.makingChargeMode === "none"
      ? 0n
      : input.makingChargeMode === "percent_of_metal"
        ? (metalNano * BigInt(input.makingChargeBp ?? 0)) / 10_000n
        : input.makingChargeMode === "fixed_per_gram"
          ? ((input.makingChargePerGramMinor ?? 0n) * input.weightMilligrams * SCALE) / 1000n
          : (input.makingChargeMinor ?? 0n) * SCALE;

  // 3. Components, already integral minor units. `include*` false contributes zero rather
  //    than omitting the column, so the components still sum to the base.
  const stoneNano = input.includeStoneCost ? input.stoneCostMinor * SCALE : 0n;
  const otherNano = input.includeOtherMaterialCost ? input.otherMaterialCostMinor * SCALE : 0n;

  // 4. Markup on the SUBTOTAL, never on the metal alone.
  const subtotalNano = metalNano + makingNano + stoneNano + otherNano;
  const markupNano =
    input.markupMode === "none"
      ? 0n
      : input.markupMode === "percent_of_subtotal"
        ? (subtotalNano * BigInt(input.markupBp ?? 0)) / 10_000n
        : (input.markupMinor ?? 0n) * SCALE;

  // 5. Market adjustment — SIGNED, applied last, in this market's own currency.
  const adjustmentNano =
    input.marketAdjustmentDeltaMinor !== null
      ? input.marketAdjustmentDeltaMinor * SCALE
      : input.marketAdjustmentBp !== null
        ? applyBpSigned(subtotalNano + markupNano, input.marketAdjustmentBp)
        : 0n;

  // 6. THE rounding. Half-up to the minor unit, once, on the whole expression.
  const totalNano = subtotalNano + markupNano + adjustmentNano;
  const rawMinor = (totalNano + SCALE / 2n) / SCALE;

  let baseMinor = rawMinor;
  if (baseMinor < 0n) baseMinor = 0n;
  if (input.floorMinor !== null && baseMinor < input.floorMinor) baseMinor = input.floorMinor;
  const floorAdjustmentMinor = baseMinor - rawMinor;

  // 7. Commercial rounding to the market's increment — a second, deliberate, per-market step,
  //    recorded separately so a price ending in a round number can still be explained.
  let listMinor = roundToIncrement(baseMinor, input.roundingIncrementMinor, input.roundingMode);

  // 7b. The floor is a floor AFTER the increment, not before it. `down` with an increment
  //     coarser than the gap walks straight back through it: floor 10000, base 10000,
  //     increment 3000, 'down' → 9000, which is below the floor set to stop exactly that.
  if (input.floorMinor !== null && listMinor < input.floorMinor) {
    listMinor = roundToIncrement(input.floorMinor, input.roundingIncrementMinor, "up");
  }

  // The six component snapshots are ALLOCATED, not re-rounded. They must sum exactly to
  // `computedBaseMinor` (chk_prices_components_sum), and flooring each independently loses
  // the fractional remainders. `allocate` hands the leftovers out by largest remainder,
  // LOWEST INDEX FIRST — so the caller's order is the tie-break, and this order is the fixed
  // one 04 §2.3 names: metal → making → stone → other_material → markup.
  const positives = [metalNano, makingNano, stoneNano, otherNano, markupNano];
  const positiveTotalNano = positives.reduce((a, b) => a + b, 0n);
  const adjustmentMinor = adjustmentNano / SCALE;
  // Everything the adjustment and the clamps did not account for is what the five components
  // must add up to.
  const componentTotalMinor = baseMinor - adjustmentMinor - floorAdjustmentMinor;
  const parts =
    positiveTotalNano === 0n ? [0n, 0n, 0n, 0n, 0n] : allocate(componentTotalMinor, positives);

  return {
    metalComponentMinor: parts[0]!,
    makingChargeComputedMinor: parts[1]!,
    stoneCostMinor: parts[2]!,
    otherMaterialCostMinor: parts[3]!,
    markupMinor: parts[4]!,
    marketAdjustmentDeltaMinor: adjustmentMinor,
    floorAdjustmentMinor,
    computedBaseMinor: baseMinor,
    roundingAdjustmentMinor: listMinor - baseMinor,
    listMinor,
  };
}
