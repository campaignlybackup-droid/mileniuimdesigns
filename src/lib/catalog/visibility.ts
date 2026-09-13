import "server-only";
import { db } from "@/lib/db/client";
import { empty, sql, type Sql } from "@/lib/db/sql";

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
 * `prices` does not exist yet: it is created by P10, and P09 runs before it. This function
 * therefore contributes NOTHING today, and that is a hole in the definition above — a
 * product with no price in India is currently "live" in India, which is exactly the empty
 * indexable page `curated_facet_markets` exists to prevent.
 *
 * It is written as a hole with a name rather than a note in a document because a note is not
 * checked. `facet-market-activation.test.ts` probes `to_regclass('public.prices')` and, from
 * the moment P10's migration lands, REQUIRES the rendered predicate to reference the table.
 * The test does not need to be remembered or re-enabled; it arms itself on the day its
 * subject exists, which is the day the omission starts being wrong.
 */
export function priceVisibility(marketCode: string): Sql {
  void marketCode;
  return empty;
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
