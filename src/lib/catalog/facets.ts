import "server-only";
import { db } from "@/lib/db/client";
import { empty, sql, type Sql } from "@/lib/db/sql";
import { allFilters, type CatalogFilters } from "@/lib/catalog/filters";
import { priceVisibility } from "@/lib/catalog/visibility";

/**
 * Facet counting and the filtered listing — 09 P09, 03 §3.5, §3.6.
 *
 * ONE statement computes every dimension's counts. Never one query per facet: a page with a
 * stone facet, a material facet and four attribute facets is six round trips that all read the
 * same base set, and the six answers are taken at six different instants.
 */

export type FacetScope =
  | { kind: "category"; id: string }
  | { kind: "collection"; id: string }
  | { kind: "stone"; id: string };

export type FacetCount = { valueId: string; count: number };

export type FacetCounts = {
  stones: FacetCount[];
  materials: FacetCount[];
  /** Keyed by attribute id; each entry is that attribute's option counts. */
  attributes: Record<string, FacetCount[]>;
};

/**
 * The scope predicate. A category scope is SUBTREE-inclusive, resolved by
 * `materialized_path LIKE :path || '%'` — the same index range scan the PLP uses rather than a
 * recursive CTE per request (02 §2.4). A product filed only under `RINGS → Stacking` belongs on
 * `/rings`, and a scope that matched the category row exactly would leave it off the page it
 * most obviously belongs on.
 */
function scopeFilter(scope: FacetScope): Sql {
  switch (scope.kind) {
    case "category":
      return sql`AND EXISTS (
        SELECT 1 FROM product_categories pc
        JOIN categories c ON c.id = pc.category_id AND c.deleted_at IS NULL
        WHERE pc.product_id = p.id
          AND c.materialized_path LIKE
              (SELECT t.materialized_path FROM categories t WHERE t.id = ${scope.id}::uuid) || '%'
      )`;
    case "collection":
      return sql`AND EXISTS (
        SELECT 1 FROM product_collections pcol
        WHERE pcol.product_id = p.id AND pcol.collection_id = ${scope.id}::uuid
      )`;
    case "stone":
      return sql`AND EXISTS (
        SELECT 1 FROM product_stones ps
        WHERE ps.product_id = p.id AND ps.stone_id = ${scope.id}::uuid
      )`;
  }
}

/** The non-facet predicates: live in this market, inside this scope. Facet selections are
 *  deliberately NOT here — each dimension applies its own subset. */
function baseCte(scope: FacetScope, marketCode: string): Sql {
  return sql`
    SELECT p.id
    FROM products p
    LEFT JOIN product_market_content pmc
           ON pmc.product_id = p.id AND pmc.market_code = ${marketCode}
    WHERE p.deleted_at IS NULL
      AND p.status = 'active'
      AND p.published_at IS NOT NULL
      AND p.published_at <= now()
      AND coalesce(pmc.is_published, true)
      ${priceVisibility(marketCode)}
      ${scopeFilter(scope)}
  `;
}

/**
 * Counts for every dimension, in one pass over one CTE.
 *
 * **A dimension's own selection is excluded from its own counts** — leave-one-out, 03 §3.5.
 * The attribute dimension needs this per ATTRIBUTE, not per dimension class: selecting
 * `setting=bezel` must not zero the other settings, but must still narrow `finish`. That is
 * what the `pav.attribute_id = … OR EXISTS(…)` shape below does — the clause for attribute A
 * is waived on exactly the rows being counted for A, and applies to every other attribute's
 * rows in the same aggregate.
 *
 * `count(DISTINCT b.id)` everywhere and never `count(*)`: materials are reached through
 * variants, so a ring in three sizes all in 14K yellow produces three rows, and a `count(*)`
 * would print `(3)` next to a facet that returns one card. The same reasoning as 03 §4.2's
 * "count products, not memberships".
 */
export async function getFacetCounts(input: {
  scope: FacetScope;
  marketCode: string;
  filters: CatalogFilters;
}): Promise<FacetCounts> {
  const { scope, marketCode, filters } = input;

  // Each attribute dimension waives its own clause for its own rows. Built once here so the
  // aggregate stays a single statement regardless of how many attributes are selected.
  const attributeClauses = filters.attributes.map(
    (a) => sql`AND (pav.attribute_id = ${a.attributeId}::uuid OR EXISTS (
                 SELECT 1 FROM product_attribute_values x
                 WHERE x.product_id = b.id
                   AND x.attribute_id = ${a.attributeId}::uuid
                   AND x.option_id = ANY(${a.optionIds}::uuid[])))`,
  );
  const attributeLeaveOneOut = attributeClauses.reduce<Sql>(
    (acc, c) => sql`${acc} ${c}`,
    empty,
  );

  const rows = await db.$queryRaw<
    { dim: string; attribute_id: string | null; value_id: string; n: number }[]
  >`
    WITH base AS (${baseCte(scope, marketCode)})
    SELECT 'stone' AS dim, NULL::text AS attribute_id, ps.stone_id::text AS value_id,
           count(DISTINCT b.id)::int AS n
      FROM base b
      JOIN product_stones ps ON ps.product_id = b.id
     WHERE true ${allFilters("b.id", filters, { kind: "stone" })}
     GROUP BY ps.stone_id
    UNION ALL
    SELECT 'material', NULL, vm.material_id::text, count(DISTINCT b.id)::int
      FROM base b
      JOIN product_variants v ON v.product_id = b.id AND v.deleted_at IS NULL
      JOIN variant_materials vm ON vm.variant_id = v.id
     WHERE true ${allFilters("b.id", filters, { kind: "material" })}
     GROUP BY vm.material_id
    UNION ALL
    SELECT 'attribute', pav.attribute_id::text, pav.option_id::text, count(DISTINCT b.id)::int
      FROM base b
      JOIN product_attribute_values pav ON pav.product_id = b.id AND pav.option_id IS NOT NULL
      JOIN attributes a ON a.id = pav.attribute_id AND a.deleted_at IS NULL AND a.is_filterable
     WHERE true
           ${allFilters("b.id", { ...filters, attributes: [] }, undefined)}
           ${attributeLeaveOneOut}
     GROUP BY pav.attribute_id, pav.option_id
  `;

  const out: FacetCounts = { stones: [], materials: [], attributes: {} };
  for (const r of rows) {
    const entry = { valueId: r.value_id, count: Number(r.n) };
    if (r.dim === "stone") out.stones.push(entry);
    else if (r.dim === "material") out.materials.push(entry);
    else if (r.attribute_id !== null) (out.attributes[r.attribute_id] ??= []).push(entry);
  }
  return out;
}

export type FilteredProduct = { id: string; slug: string; title: string; rank: number };

/**
 * The filtered listing itself — the query the facet counts must agree with.
 *
 * Keyset by `(rank, id)`, not OFFSET: a shopper paging through a category while a merchandiser
 * re-ranks it would otherwise see a product twice and never see another. `limit` is capped, so
 * a crafted `?limit=100000` is a bounded read.
 */
export async function listFilteredProducts(input: {
  scope: FacetScope;
  marketCode: string;
  filters: CatalogFilters;
  cursor?: { rank: number; id: string };
  limit?: number;
}): Promise<FilteredProduct[]> {
  const limit = Math.min(Math.max(input.limit ?? 24, 1), 100);
  const cursor = input.cursor;
  const keyset = cursor
    ? sql`AND (p.rank, p.id) > (${cursor.rank}, ${cursor.id}::uuid)`
    : empty;

  const rows = await db.$queryRaw<FilteredProduct[]>`
    SELECT p.id::text AS id, p.slug, p.title, p.rank
    FROM products p
    LEFT JOIN product_market_content pmc
           ON pmc.product_id = p.id AND pmc.market_code = ${input.marketCode}
    WHERE p.deleted_at IS NULL
      AND p.status = 'active'
      AND p.published_at IS NOT NULL
      AND p.published_at <= now()
      AND coalesce(pmc.is_published, true)
      ${priceVisibility(input.marketCode)}
      ${scopeFilter(input.scope)}
      ${allFilters("p.id", input.filters, undefined)}
      ${keyset}
    ORDER BY p.rank, p.id
    LIMIT ${limit}
  `;
  return rows.map((r) => ({ ...r, rank: Number(r.rank) }));
}
