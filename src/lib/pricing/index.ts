/**
 * `src/lib/pricing/` — THE only module in the repository that produces an amount (04 §1.1).
 *
 * Every other layer receives a fully-resolved object and renders it. Nothing else computes,
 * converts, re-rounds, adjusts, estimates, starts-from, discounts or re-derives a price, in
 * any language, on any runtime, for any reason including "just for display".
 *
 * That is not a convention. It is `eslint-plugin-boundaries`, the `Intl.NumberFormat` ban
 * outside `src/lib/money.ts`, the `cached()` ban inside this directory, and three tests:
 * `no-fx`, `pricing-sole-authority` and `display-equals-charged`.
 */
export { resolvePrice, resolvePriceBatch } from "@/lib/pricing/resolve";
export type { ResolveLine, ResolveContext } from "@/lib/pricing/resolve";
export { getDisplayPrice, getProductPriceRanges } from "@/lib/pricing/display";
export { setManualPrice } from "@/lib/pricing/manual";
export type { SetManualPriceInput } from "@/lib/pricing/manual";
export {
  applyRule,
  applyRuleStack,
  compareRules,
  reduceToUnit,
  ruleMatches,
  scopeKeysFor,
  SCOPE_NARROWNESS,
} from "@/lib/pricing/rules";
export type {
  AdjustmentType,
  AmountBasis,
  PricingRuleRow,
  ScopeType,
} from "@/lib/pricing/rules";
export type {
  CurrencyCode,
  DiscountLine,
  DisplayPrice,
  MarketCode,
  PriceRange,
  PriceRecord,
  PriceSourceValue,
  ResolvedPrice,
} from "@/lib/pricing/types";
