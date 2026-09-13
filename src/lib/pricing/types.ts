/**
 * The pricing contract — 01 §2.3, 04 §1.3, §1.4.
 *
 * `ResolvedPrice` is ELEVEN fields and `tests/unit/pricing-contract.test.ts` pins the key set.
 * Two of them are contract EXTENSIONS that 01 §2.3 flags rather than leaves implicit:
 * `roundingResidueMinor` (04 §1.4 step 9, which 05 §3.6 then depends on at order build time)
 * and `compareAtMinor` on the display map. A reader of 01 alone would have written a ten-field
 * type and a three-key map and found out at P23.
 */

export type CurrencyCode = string;
export type MarketCode = string;

export type PriceSourceValue = "manual" | "metal_linked" | "hybrid";

/** One step of the discount stack. `amountMinor` is the DELTA this step caused, signed. */
export type DiscountLine = {
  kind: "pricing_rule" | "customer_group" | "coupon";
  /** `pricing_rules.id` or the coupon code — whatever a merchandiser would search for. */
  ref: string;
  label: string;
  /** Signed. `fixed_price` can be positive: "fixed price ₹4,999" may be a rise. */
  amountMinor: bigint;
};

export type ResolvedPrice = {
  currencyCode: CurrencyCode;
  /** Pre-discount, integer minor units. */
  unitListMinor: bigint;
  /** Post product-level discount — `coalesce(prices.sale_minor, prices.list_minor)`. */
  unitSaleMinor: bigint;
  /** Post rule / customer-group / percentage-coupon. */
  unitFinalMinor: bigint;
  lineSubtotalMinor: bigint;
  discountBreakdown: DiscountLine[];
  priceSource: PriceSourceValue;
  metalRateId: string | null;
  /** `prices.id` used — logged onto the order line, so an order can be explained. */
  priceRecordId: string;
  /**
   * 0 … quantity−1. `createOrderFromCart()` adds it to that line's `line_discount_minor`, so
   * the sum of the lines equals the figure the shopper was shown (04 §1.4 step 9).
   */
  roundingResidueMinor: bigint;
  computedAt: Date;
};

/** What a listing card needs, and nothing that would let it compute. */
export type DisplayPrice = {
  currencyCode: CurrencyCode;
  listMinor: bigint;
  saleMinor: bigint;
  /** `prices.compare_at_minor` — the struck-through figure. */
  compareAtMinor: bigint | null;
};

export type PriceRange = {
  currencyCode: CurrencyCode;
  minListMinor: bigint;
  maxListMinor: bigint;
  minSaleMinor: bigint | null;
  /** 0 ⇒ not purchasable in this market. */
  pricedVariantCount: number;
  /** `pricedVariantCount < totalVariantCount` ⇒ partially priced. */
  totalVariantCount: number;
};

export type PriceRecord = {
  id: string;
  productId: string;
  variantId: string | null;
  marketCode: MarketCode;
  currencyCode: CurrencyCode;
  listMinor: bigint;
  saleMinor: bigint | null;
  compareAtMinor: bigint | null;
  priceSource: PriceSourceValue;
  validFrom: Date;
};
