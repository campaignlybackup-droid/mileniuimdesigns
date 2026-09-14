import "server-only";
import { cache } from "react";
import { db } from "@/lib/db/client";
import { MarketNotFoundError } from "@/lib/errors";
import {
  unsafeCurrencyCode,
  unsafeMarketCode,
  type CurrencyCode,
  type MarketCode,
} from "@/types/market";

/**
 * Market resolution — 01 §1.4, §2.3; 04 §6.1.
 *
 * ```ts
 * resolveMarket(marketSegment: string): Promise<Market>
 * ```
 *
 * **There is no `cookieMarket` parameter, and its absence is the design.** A product page is
 * ISR-cached for 900 seconds and served from a CDN. If market resolution could prefer a
 * cookie, the first request from a visitor carrying `md_market=IN` would bake ₹ prices into
 * the object served to every US visitor for the next fifteen minutes. The signature does not
 * accept the thing that would cause it, so no call site can pass it by accident.
 *
 * It reads the DATABASE, not the edge snapshot. That is what makes deactivation immediate:
 * `/in/rings` 404s the moment `markets.is_active` flips, whether or not middleware still
 * recognises `in` as a segment. Turning a market off is the emergency direction and it needs
 * no deployment.
 */

export type Market = {
  code: MarketCode;
  name: string;
  currencyCode: CurrencyCode;
  locale: string;
  countryCode: string;
  timezone: string;
  taxMode: string;
  pricesIncludeTax: boolean;
  paymentProviderKey: string | null;
  incoterm: string;
  weightUnit: string;
  rank: number;
};

function toMarket(r: Record<string, unknown>): Market {
  return {
    code: unsafeMarketCode(String(r["code"])),
    name: String(r["name"]),
    currencyCode: unsafeCurrencyCode(String(r["currency_code"])),
    locale: String(r["locale"]),
    countryCode: String(r["country_code"]),
    timezone: String(r["timezone"]),
    taxMode: String(r["tax_mode"]),
    pricesIncludeTax: r["prices_include_tax"] === true,
    paymentProviderKey: (r["payment_provider_key"] as string | null) ?? null,
    incoterm: String(r["incoterm"]),
    weightUnit: String(r["weight_unit"]),
    rank: Number(r["rank"]),
  };
}

const SELECT = `code, name, currency_code, locale, country_code, timezone,
                tax_mode::text AS tax_mode, prices_include_tax, payment_provider_key,
                incoterm, weight_unit, rank`;

/** Every active market, rank ascending. Memoised per request. */
export const listActiveMarkets = cache(async (): Promise<Market[]> => {
  const rows = await db.$queryRawUnsafe<Record<string, unknown>[]>(
    `SELECT ${SELECT} FROM markets WHERE is_active ORDER BY rank`,
  );
  return rows.map(toMarket);
});

/**
 * Resolve a URL segment to a market, or throw.
 *
 * **Never falls back to `NEXT_PUBLIC_DEFAULT_MARKET`.** A wrong or inactive segment is a 404.
 * Substituting a default would serve one market's prices under another market's URL, which is
 * the same failure as a conversion with a different cause.
 */
export const resolveMarket = cache(async (marketSegment: string): Promise<Market> => {
  const code = marketSegment.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) {
    throw new MarketNotFoundError(`'${marketSegment}' is not a market code.`);
  }
  const rows = await db.$queryRawUnsafe<Record<string, unknown>[]>(
    `SELECT ${SELECT} FROM markets WHERE code = $1 AND is_active`,
    code,
  );
  const row = rows[0];
  if (!row) throw new MarketNotFoundError(`No active market '${code}'.`);
  return toMarket(row);
});

/** `generateStaticParams()` for `[market]` — QUERIES the table, never a hand-written array. */
export async function marketParams(): Promise<{ market: string }[]> {
  const markets = await listActiveMarkets();
  return markets.map((m) => ({ market: m.code.toLowerCase() }));
}

/**
 * Whether a product is purchasable in a market — 04 §6.1.
 *
 * The same three facts the live-product predicate uses, stated once here so the storefront,
 * the cart and the availability badge cannot disagree: published, not unpublished for this
 * market, and priced in it. A product failing this is not hidden — it renders as
 * "not available in this market", which is a state the storefront has copy for, because the
 * alternative is a shopper finding a page that quietly omits its price.
 */
export async function isAvailableInMarket(
  productId: string,
  marketCode: string,
): Promise<boolean> {
  const rows = await db.$queryRaw<{ ok: boolean }[]>`
    SELECT EXISTS (
      SELECT 1
        FROM products p
        LEFT JOIN product_market_content pmc
               ON pmc.product_id = p.id AND pmc.market_code = ${marketCode}
       WHERE p.id = ${productId}::uuid
         AND p.deleted_at IS NULL
         AND p.status = 'active'
         AND p.published_at IS NOT NULL AND p.published_at <= now()
         AND coalesce(pmc.is_published, true)
         AND EXISTS (SELECT 1 FROM prices pr
                      WHERE pr.product_id = p.id AND pr.market_code = ${marketCode}
                        AND pr.valid_to IS NULL AND pr.deleted_at IS NULL)
    ) AS ok
  `;
  return rows[0]?.ok === true;
}

/**
 * `hreflang` alternates — 01 §1.4. Emitted for every ACTIVE market; `x-default` → the primary.
 *
 * Derived from the rows, so a third market gains its alternate with no code change. A
 * hand-written map would be the thing that makes "adding UK is rows only" false.
 */
export async function alternatesFor(
  path: string,
  baseUrl: string,
): Promise<{ languages: Record<string, string>; canonical: string; xDefault: string }> {
  const markets = await listActiveMarkets();
  const primary = markets[0];
  if (!primary) throw new MarketNotFoundError("No active markets.");

  const clean = path.startsWith("/") ? path : `/${path}`;
  const urlFor = (m: Market): string =>
    m.code === primary.code
      ? `${baseUrl}${clean}`
      : `${baseUrl}/${m.code.toLowerCase()}${clean}`;

  const languages: Record<string, string> = {};
  for (const m of markets) languages[m.locale] = urlFor(m);

  return { languages, canonical: urlFor(primary), xDefault: urlFor(primary) };
}

export async function listAdminCurrenciesAndMarkets() {
  const currencies = await db.currency.findMany({
    orderBy: { code: "asc" },
  });
  const markets = await db.market.findMany({
    orderBy: { rank: "asc" },
  });
  return { currencies, markets };
}
