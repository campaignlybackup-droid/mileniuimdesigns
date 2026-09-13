import "server-only";
import type { Tx } from "@/lib/db/transaction";
import { sql, type Sql } from "@/lib/db/sql";
import { priceVisibility } from "@/lib/catalog/visibility";

/**
 * Per-market activation of curated facet pages — 09 P09, 03 §4.2.
 *
 * A `curated_facets` row is what makes `/rings/labradorite` a real, indexable, pre-rendered
 * page. **Activation is per market, because the count is.** Under one global count a pair with
 * nine US-priced pieces and zero INR-priced ones produces `/in/rings/labradorite`: an ISR
 * page, canonical, in the sitemap, with nothing on it — in the market where the catalogue is
 * least complete and an empty indexable page does the most damage.
 *
 * One `curated_facets` row stays correct across markets: the editorial identity, the slug and
 * the hreflang pairing are shared. Only the count and the activation are per market, so only
 * those move to the child table.
 */

/** 03 §4.2: below this a facet page is thin and competes with its own parent category. */
export const DEFAULT_MIN_PRODUCTS = 4;
export const MIN_PRODUCTS_SETTING = "catalog.curated_facet_min_products";

/** The facet's own predicate. Every target type is an EXISTS; none is a join. */
function targetFilter(facet: {
  facetType: string;
  stoneId: string | null;
  materialId: string | null;
  attributeOptionId: string | null;
  tagId: string | null;
}): Sql {
  if (facet.stoneId !== null) {
    return sql`AND EXISTS (SELECT 1 FROM product_stones ps
                            WHERE ps.product_id = p.id AND ps.stone_id = ${facet.stoneId}::uuid)`;
  }
  if (facet.materialId !== null) {
    return sql`AND EXISTS (SELECT 1 FROM product_variants v
                            JOIN variant_materials vm ON vm.variant_id = v.id
                            WHERE v.product_id = p.id AND v.deleted_at IS NULL
                              AND vm.material_id = ${facet.materialId}::uuid)`;
  }
  if (facet.attributeOptionId !== null) {
    return sql`AND EXISTS (SELECT 1 FROM product_attribute_values pav
                            WHERE pav.product_id = p.id
                              AND pav.option_id = ${facet.attributeOptionId}::uuid)`;
  }
  if (facet.tagId !== null) {
    return sql`AND EXISTS (SELECT 1 FROM product_tags pt
                            WHERE pt.product_id = p.id AND pt.tag_id = ${facet.tagId}::uuid)`;
  }
  // chk_curated_facets_target guarantees exactly one target is non-null, so this is
  // unreachable — and it throws rather than returning `empty`, which would silently count the
  // whole category and activate a page for a facet that targets nothing.
  throw new Error(`curated_facets row has no target (facet_type '${facet.facetType}').`);
}

export type ActivationResult = { evaluated: number; activated: number; deactivated: number };

/**
 * Recompute `curated_facet_markets` for every active market.
 *
 * **`curated_facets.is_active` is never written here.** That flag is the merchandiser's: a row
 * with `is_auto = false` belongs to whoever wrote its intro, and 03 §4.2 says it is never
 * touched. Per-market activation is a different claim and is computed for manual rows too —
 * the harm it prevents is an indexable page with nothing on it in a market where the catalogue
 * is thin, and that harm does not become acceptable because someone wrote a good introduction
 * for a different market. Flagged in the phase notes as my reading, not a transcription:
 * 03 §4.2's "never touched" sits in the `ensureStoneFacets` bullet list, which is about the
 * facet row, and the per-market table is introduced in the paragraph after it.
 */
export async function recomputeFacetMarketActivation(
  tx: Tx,
  opts?: { facetId?: string },
): Promise<ActivationResult> {
  const threshold = await minProducts(tx);

  const facets = await tx.$queryRaw<
    {
      id: string;
      category_id: string;
      facet_type: string;
      stone_id: string | null;
      material_id: string | null;
      attribute_option_id: string | null;
      tag_id: string | null;
    }[]
  >`
    SELECT id::text AS id, category_id::text AS category_id, facet_type,
           stone_id::text AS stone_id, material_id::text AS material_id,
           attribute_option_id::text AS attribute_option_id, tag_id::text AS tag_id
    FROM curated_facets
    WHERE ${opts?.facetId ? sql`id = ${opts.facetId}::uuid` : sql`true`}
  `;

  const markets = await tx.$queryRaw<{ code: string }[]>`
    SELECT code FROM markets WHERE is_active ORDER BY code
  `;

  let activated = 0;
  let deactivated = 0;

  for (const facet of facets) {
    for (const { code } of markets) {
      const rows = await tx.$queryRaw<{ n: number }[]>`
        SELECT count(DISTINCT p.id)::int AS n
        FROM products p
        LEFT JOIN product_market_content pmc
               ON pmc.product_id = p.id AND pmc.market_code = ${code}
        WHERE p.deleted_at IS NULL
          AND p.status = 'active'
          AND p.published_at IS NOT NULL
          AND p.published_at <= now()
          AND coalesce(pmc.is_published, true)
          ${priceVisibility(code)}
          AND EXISTS (
            SELECT 1 FROM product_categories pc
            JOIN categories c ON c.id = pc.category_id AND c.deleted_at IS NULL
            WHERE pc.product_id = p.id
              AND c.materialized_path LIKE
                  (SELECT t.materialized_path FROM categories t WHERE t.id = ${facet.category_id}::uuid) || '%'
          )
          ${targetFilter({
            facetType: facet.facet_type,
            stoneId: facet.stone_id,
            materialId: facet.material_id,
            attributeOptionId: facet.attribute_option_id,
            tagId: facet.tag_id,
          })}
      `;
      const count = Number(rows[0]?.n ?? 0);
      const isActive = count >= threshold;

      const before = await tx.$queryRaw<{ is_active: boolean }[]>`
        SELECT is_active FROM curated_facet_markets
        WHERE facet_id = ${facet.id}::uuid AND market_code = ${code}
      `;
      const was = before[0]?.is_active ?? false;
      if (isActive && !was) activated++;
      if (!isActive && was) deactivated++;

      await tx.$executeRaw`
        INSERT INTO curated_facet_markets (facet_id, market_code, is_active, product_count, refreshed_at)
        VALUES (${facet.id}::uuid, ${code}, ${isActive}, ${count}, now())
        ON CONFLICT (facet_id, market_code) DO UPDATE
          SET is_active = EXCLUDED.is_active,
              product_count = EXCLUDED.product_count,
              refreshed_at = EXCLUDED.refreshed_at
      `;
    }
  }

  return { evaluated: facets.length * markets.length, activated, deactivated };
}

async function minProducts(tx: Tx): Promise<number> {
  const rows = await tx.$queryRaw<{ value: unknown }[]>`
    SELECT value FROM settings WHERE key = ${MIN_PRODUCTS_SETTING} AND market_code IS NULL
  `;
  const raw = rows[0]?.value;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MIN_PRODUCTS;
}

/** Whether a facet may be rendered as an indexable page in this market (03 §4.2). */
export async function isFacetIndexable(
  tx: Tx,
  facetId: string,
  marketCode: string,
): Promise<boolean> {
  const rows = await tx.$queryRaw<{ ok: boolean }[]>`
    SELECT (f.is_active AND coalesce(fm.is_active, false)) AS ok
    FROM curated_facets f
    LEFT JOIN curated_facet_markets fm ON fm.facet_id = f.id AND fm.market_code = ${marketCode}
    WHERE f.id = ${facetId}::uuid
  `;
  return rows[0]?.ok === true;
}
