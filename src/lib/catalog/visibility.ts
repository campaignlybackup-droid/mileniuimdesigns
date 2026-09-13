import "server-only";
import { db } from "@/lib/db/client";
import { sql, type Sql } from "@/lib/db/sql";

/**
 * THE definition of "a product a shopper in this market can see" — 09 P09, 03 §3.5, §4.2.
 *
 * Every listing, facet count, stone breakdown and curated-facet activation count must agree
 * on this set, because they are shown on the same page at the same time. A heading that says
 * "Labradorite Rings (9)" above six cards is not a rendering bug; it is two different
 * definitions of "live", and the only way to not have two is to not write it twice.
 */

/**
 * The clauses this predicate currently enforces, as prose. Asserted by
 * `tests/integration/facet-market-activation.test.ts`, so adding a clause without recording
 * it here fails — the list is the thing a reviewer reads instead of the SQL.
 */
export const LIVE_PRODUCT_CLAUSES = [
  "not soft-deleted",
  "status = active",
  "published_at has passed",
  "not unpublished for this market",
  "priced in this market",
] as const;

/**
 * The market's price gate — `EXISTS (SELECT 1 FROM prices …)` in 03 §4.2.
 *
 * **Closed at P10, which is when `prices` came into existence.** Until then this returned
 * `empty` and `facet-market-activation.test.ts` asserted that it did; the same test flipped to
 * requiring the clause the moment `to_regclass('public.prices')` stopped being null, and it
 * duly failed on P10's first migration. The hole never had to be remembered.
 *
 * What it enforces: a product with no live price in a market is not visible in that market. It
 * is not a performance filter and it is not tidiness — an unpriced product that renders is a
 * product a shopper can reach, and the next thing it does is either show nothing where a price
 * belongs or fall back to another market's number. `resolvePrice` returning
 * `PriceUnavailableError` rather than falling back is the same rule one layer up (R02).
 *
 * `valid_to IS NULL` is what "live" means here: `prices` is append-only in effect, so the row
 * with no end date is the current one, and `idx_prices_active` guarantees there is at most one
 * of them per (variant, market).
 */
export function priceVisibility(marketCode: string): Sql {
  return sql`AND EXISTS (
    SELECT 1 FROM prices pr
    WHERE pr.product_id = p.id
      AND pr.market_code = ${marketCode}
      AND pr.valid_to IS NULL
      AND pr.deleted_at IS NULL
  )`;
}

/**
 * The `live` CTE body of 03 §4.2, without the enclosing `WITH`.
 *
 * `coalesce(pmc.is_published, true)` and not `pmc.is_published = true`: the absence of a
 * `product_market_content` row means "no market-specific override", which is the normal
 * case. Requiring the row would hide every product from every market until someone had
 * visited a screen they have no reason to visit.
 */
export function liveProducts(marketCode: string): Sql {
  return sql`
    SELECT p.id, p.rank, p.slug, p.title, p.primary_category_id
    FROM products p
    LEFT JOIN product_market_content pmc
           ON pmc.product_id = p.id AND pmc.market_code = ${marketCode}
    WHERE p.deleted_at IS NULL
      AND p.status = 'active'
      AND p.published_at IS NOT NULL
      AND p.published_at <= now()
      AND coalesce(pmc.is_published, true)
      ${priceVisibility(marketCode)}
  `;
}

/** True once P10 has created `prices`. The arming condition for the clause above. */
export async function pricesTableExists(): Promise<boolean> {
  const rows = await db.$queryRaw<{ present: boolean }[]>`
    SELECT to_regclass('public.prices') IS NOT NULL AS present
  `;
  return rows[0]?.present === true;
}
