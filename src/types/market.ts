/**
 * Market and currency codes — 01 §1.4.
 *
 * **Branded strings, not a `'US' | 'IN'` union.** Markets are ROWS. A literal union looks
 * harmless and then makes adding Canada a type change, a code review, a build and a deploy —
 * which contradicts hard rule 1 and the claim that a new market is rows only.
 *
 * The brand is one-directional on purpose: a `MarketCode` IS assignable to `string`, so every
 * existing `marketCode: string` signature keeps working; a bare `string` is NOT assignable to
 * `MarketCode`, so a new boundary cannot accept an unvalidated segment from a URL. The only
 * way to produce one is `toMarketCode()`, which checks it against the live rows.
 */
declare const marketBrand: unique symbol;
declare const currencyBrand: unique symbol;

export type MarketCode = string & { readonly [marketBrand]: "MarketCode" };
export type CurrencyCode = string & { readonly [currencyBrand]: "CurrencyCode" };

/** ISO 3166-1 alpha-2, upper case. Shape only — existence is a database question. */
export const MARKET_CODE_SHAPE = /^[A-Z]{2}$/;
export const CURRENCY_CODE_SHAPE = /^[A-Z]{3}$/;

/**
 * Assert a string is a market code WITHOUT checking it exists.
 *
 * Used only where existence has already been established by a query — `resolveMarket`'s
 * return, a `markets` row, the snapshot. Anywhere a user-supplied segment arrives,
 * `resolveMarket()` is the boundary, not this.
 */
export function unsafeMarketCode(code: string): MarketCode {
  return code as MarketCode;
}

export function unsafeCurrencyCode(code: string): CurrencyCode {
  return code as CurrencyCode;
}
