import "server-only";
import { db } from "@/lib/db/client";
import { empty, sql, unsafeRaw, type Sql } from "@/lib/db/sql";

/**
 * Storefront filters — 09 P09, 03 §3.5.
 *
 * Two rules decide every predicate here:
 *
 *  - **Within a dimension the values are OR'd, across dimensions they are AND'd.** Picking
 *    two stones widens; picking a stone and a finish narrows. Anything else and a multi-select
 *    facet can never be built past its first chip.
 *  - **`EXISTS`, never `JOIN`.** A join against a table with N rows per product multiplies the
 *    driving row set and then needs a `DISTINCT` to undo it; an `EXISTS` short-circuits on the
 *    first matching index entry (03 §3.6).
 */

export type AttributeFilter = {
  attributeId: string;
  /** The URL key, kept so a facet chip can be rendered without a second lookup. */
  key: string;
  optionIds: string[];
};

export type CatalogFilters = {
  stoneIds: string[];
  materialIds: string[];
  attributes: AttributeFilter[];
};

export const EMPTY_FILTERS: CatalogFilters = { stoneIds: [], materialIds: [], attributes: [] };

export type ParsedFilters = {
  filters: CatalogFilters;
  /**
   * The `key=value` pairs that did not resolve, in the order they appeared.
   *
   * The caller renders facet chips from `filters`, NEVER from the URL. This list is the
   * difference between the two, and it exists because dropping an unresolvable value and
   * saying nothing is how a listing ends up claiming a filter it did not apply: a
   * merchandiser renames an option from `matte` to `matt`, every link carrying
   * `?attr_finish=matte` silently returns the entire unfiltered category, and the page above
   * it still says Matte. Any URL carrying searchParams is already `no-store` and
   * `noindex, follow` (01 §1.3), so nothing is at stake for a crawler — what is at stake is
   * a shopper being shown 500 rings under a heading that promised four.
   */
  dropped: string[];
};

/** `?attr_<key>=<value>` — 03 §3.5. */
export const ATTR_PREFIX = "attr_";

/**
 * Resolve a query string to filters, dropping everything that does not resolve.
 *
 * An unparseable facet is ignored — never a 500, and never an UNFILTERED listing pretending to
 * be filtered, which is the failure mode that matters. `/rings?stone=labradroite` (misspelt,
 * from a stale link or a crawler) must not quietly return every ring under a heading that says
 * Labradorite. Resolution is to ids, so a value that does not resolve is dropped together with
 * its key rather than widening the query to everything.
 *
 * One round trip, not one per dimension: this runs on every filtered listing render.
 */
export async function parseCatalogFilters(params: URLSearchParams): Promise<ParsedFilters> {
  const stoneSlugs = params.getAll("stone").filter(Boolean);
  const materialSlugs = params.getAll("material").filter(Boolean);

  const attrPairs: { key: string; value: string }[] = [];
  for (const [rawKey, value] of params.entries()) {
    if (!rawKey.startsWith(ATTR_PREFIX) || value === "") continue;
    attrPairs.push({ key: rawKey.slice(ATTR_PREFIX.length), value });
  }

  if (stoneSlugs.length === 0 && materialSlugs.length === 0 && attrPairs.length === 0) {
    return { filters: EMPTY_FILTERS, dropped: [] };
  }

  const rows = await db.$queryRaw<
    {
      kind: string;
      id: string;
      attribute_id: string | null;
      attr_key: string | null;
      matched: string;
    }[]
  >`
    SELECT 'stone' AS kind, s.id::text AS id, NULL::text AS attribute_id, NULL::text AS attr_key,
           s.slug AS matched
    FROM stones s
    WHERE s.deleted_at IS NULL AND s.slug = ANY(${stoneSlugs}::text[])
    UNION ALL
    SELECT 'material', m.id::text, NULL, NULL, m.slug
    FROM materials m
    WHERE m.deleted_at IS NULL AND m.slug = ANY(${materialSlugs}::text[])
    UNION ALL
    -- lower(value) matches uq_attribute_options, so the URL is case-insensitive in exactly
    -- the same way the uniqueness constraint is. Only filterable attributes resolve: a text
    -- attribute reaching this point would build a predicate no index can serve.
    SELECT 'attribute', o.id::text, a.id::text, a.key, req.v
    FROM attribute_options o
    JOIN attributes a ON a.id = o.attribute_id
    JOIN unnest(${attrPairs.map((p) => p.key)}::text[], ${attrPairs.map((p) => p.value)}::text[])
         AS req(k, v) ON req.k = a.key AND lower(req.v) = lower(o.value)
    WHERE a.deleted_at IS NULL AND a.is_filterable
  `;

  const byAttribute = new Map<string, AttributeFilter>();
  for (const r of rows) {
    if (r.kind !== "attribute" || r.attribute_id === null || r.attr_key === null) continue;
    const existing = byAttribute.get(r.attribute_id);
    if (existing) existing.optionIds.push(r.id);
    else
      byAttribute.set(r.attribute_id, {
        attributeId: r.attribute_id,
        key: r.attr_key,
        optionIds: [r.id],
      });
  }

  // Exactly what resolved, keyed the way the URL spelled it. Matching on the request's own
  // value rather than recounting per key keeps a partially-resolved key honest: `?attr_finish`
  // with `matte` and `polshed` reports only the misspelt one.
  const resolved = new Set<string>();
  for (const r of rows) {
    const prefix = r.kind === "attribute" ? `${ATTR_PREFIX}${r.attr_key ?? ""}` : r.kind;
    resolved.add(`${prefix}=${r.matched.toLowerCase()}`);
  }

  const dropped: string[] = [];
  for (const slug of stoneSlugs) {
    if (!resolved.has(`stone=${slug.toLowerCase()}`)) dropped.push(`stone=${slug}`);
  }
  for (const slug of materialSlugs) {
    if (!resolved.has(`material=${slug.toLowerCase()}`)) dropped.push(`material=${slug}`);
  }
  for (const { key, value } of attrPairs) {
    if (!resolved.has(`${ATTR_PREFIX}${key}=${value.toLowerCase()}`)) {
      dropped.push(`${ATTR_PREFIX}${key}=${value}`);
    }
  }

  return {
    filters: {
      stoneIds: rows.filter((r) => r.kind === "stone").map((r) => r.id),
      materialIds: rows.filter((r) => r.kind === "material").map((r) => r.id),
      attributes: [...byAttribute.values()],
    },
    dropped,
  };
}

/**
 * The product-id expression the EXISTS clauses correlate against — `p.id` in the listing
 * query, `b.id` inside the facet CTE. A literal this codebase wrote, never a request value.
 */
export type ProductRef = "p.id" | "b.id" | "live.id";

export function stoneFilter(ref: ProductRef, stoneIds: readonly string[]): Sql {
  if (stoneIds.length === 0) return empty;
  return sql`AND EXISTS (SELECT 1 FROM product_stones ps
                          WHERE ps.product_id = ${unsafeRaw(ref)}
                            AND ps.stone_id = ANY(${stoneIds}::uuid[]))`;
}

export function materialFilter(ref: ProductRef, materialIds: readonly string[]): Sql {
  if (materialIds.length === 0) return empty;
  return sql`AND EXISTS (SELECT 1 FROM product_variants v
                          JOIN variant_materials vm ON vm.variant_id = v.id
                          WHERE v.product_id = ${unsafeRaw(ref)}
                            AND v.deleted_at IS NULL
                            AND vm.material_id = ANY(${materialIds}::uuid[]))`;
}

/** The indexed EXISTS of 03 §3.5, served by `idx_pav_filter`. */
export function attributeFilter(ref: ProductRef, f: AttributeFilter): Sql {
  if (f.optionIds.length === 0) return empty;
  return sql`AND EXISTS (SELECT 1 FROM product_attribute_values pav
                          WHERE pav.product_id = ${unsafeRaw(ref)}
                            AND pav.attribute_id = ${f.attributeId}::uuid
                            AND pav.option_id = ANY(${f.optionIds}::uuid[]))`;
}

/**
 * Every filter clause, optionally omitting ONE dimension — the leave-one-out primitive the
 * facet counter is built from (03 §3.5).
 *
 * `omit` names the dimension whose own selection must not constrain its own counts. Counting a
 * dimension over a set already narrowed by that dimension makes every unselected option in it
 * read `0`: select Moonstone and Amethyst shows `(0)`, so the shopper concludes there are no
 * amethyst rings.
 */
export function allFilters(
  ref: ProductRef,
  filters: CatalogFilters,
  omit?: { kind: "stone" } | { kind: "material" } | { kind: "attribute"; attributeId: string },
): Sql {
  const parts: Sql[] = [];
  if (omit?.kind !== "stone") parts.push(stoneFilter(ref, filters.stoneIds));
  if (omit?.kind !== "material") parts.push(materialFilter(ref, filters.materialIds));
  for (const a of filters.attributes) {
    if (omit?.kind === "attribute" && omit.attributeId === a.attributeId) continue;
    parts.push(attributeFilter(ref, a));
  }
  return parts.reduce<Sql>((acc, part) => sql`${acc} ${part}`, empty);
}
