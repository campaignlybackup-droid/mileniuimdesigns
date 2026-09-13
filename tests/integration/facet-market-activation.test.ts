import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { withTransaction } from "@/lib/db/transaction";
import {
  isFacetIndexable,
  recomputeFacetMarketActivation,
  DEFAULT_MIN_PRODUCTS,
} from "@/lib/catalog/facet-activation";
import {
  LIVE_PRODUCT_CLAUSES,
  liveProducts,
  pricesTableExists,
} from "@/lib/catalog/visibility";

/**
 * Commissioned by 09 P09 — `03 §4.2`: an unpriced market must not get an empty indexable
 * facet page.
 *
 * ── The half of this that cannot be tested yet, stated plainly ──────────────────────
 *
 * The property that clause names is defined by the price `EXISTS` in the `live` CTE, and
 * `prices` is created by **P10**, one phase after this one. So today "unpriced market" is
 * every market, and a test of the form "a market with no prices gets no indexable page" would
 * pass against a database where NOTHING is priced — which is the failure this codebase keeps
 * finding in its own tests: an assertion whose subject can be absent passes for the wrong
 * reason, and passes loudest on the day the subject is absent.
 *
 * So it is split. What is provable now is proved now: per-market activation is real, the
 * threshold is applied per market, and a market below it is refused an indexable page. What is
 * not provable now is ARMED rather than deferred — `the live predicate gates on price once
 * prices exist` probes `to_regclass('public.prices')` and becomes a hard requirement the
 * moment P10's migration lands. Nobody has to remember it; it turns on by itself on the day
 * the omission starts being wrong.
 */

const stamp = Date.now();
const slug = (s: string) => `zz-p09fm-${String(stamp)}-${s}`;

let categoryId = "";
let stoneId = "";
let facetId = "";
let markets: string[] = [];

beforeAll(async () => {
  const cat = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO categories (id, slug, name, materialized_path, depth, is_published, rank,
                            version, created_at, updated_at)
    VALUES (gen_random_uuid(), ${slug("cat")}, 'ZZ P09FM', '', 0, true, 9200, 1, now(), now())
    RETURNING id::text AS id
  `;
  categoryId = cat[0]!.id;
  await db.$executeRaw`UPDATE categories SET materialized_path = id::text WHERE id = ${categoryId}::uuid`;

  const stone = await db.$queryRaw<{ id: string }[]>`
    SELECT id::text AS id FROM stones WHERE deleted_at IS NULL ORDER BY rank LIMIT 1
  `;
  stoneId = stone[0]!.id;

  const ms = await db.$queryRaw<
    { code: string }[]
  >`SELECT code FROM markets WHERE is_active ORDER BY code`;
  markets = ms.map((m) => m.code);
  expect(markets.length).toBeGreaterThanOrEqual(2); // US and IN — the whole point is per-market

  const facet = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO curated_facets (id, category_id, slug, facet_type, stone_id, title,
                                is_active, is_auto, product_count_cached, rank, created_at, updated_at)
    VALUES (gen_random_uuid(), ${categoryId}::uuid, ${slug("facet")}, 'stone', ${stoneId}::uuid,
            'ZZ P09FM FACET', true, true, 0, 0, now(), now())
    RETURNING id::text AS id
  `;
  facetId = facet[0]!.id;

  // Enough products to clear the threshold, all carrying the facet's stone.
  for (let i = 0; i < DEFAULT_MIN_PRODUCTS + 1; i++) {
    const p = await db.$queryRaw<{ id: string }[]>`
      INSERT INTO products (id, slug, title, status, published_at, primary_category_id, rank,
                            search_text, version, created_at, updated_at)
      VALUES (gen_random_uuid(), ${slug(`p${String(i)}`)}, ${`ZZ P09FM ${String(i)}`},
              'active', now() - interval '1 hour', ${categoryId}::uuid, ${i}, '', 1, now(), now())
      RETURNING id::text AS id
    `;
    await db.$executeRaw`
      INSERT INTO product_categories (product_id, category_id, rank, is_primary, created_at)
      VALUES (${p[0]!.id}::uuid, ${categoryId}::uuid, 0, true, now())
    `;
    await db.$executeRaw`
      INSERT INTO product_stones (product_id, stone_id, is_primary, position, created_at)
      VALUES (${p[0]!.id}::uuid, ${stoneId}::uuid, true, 0, now())
    `;
  }
});

afterAll(async () => {
  await db.$executeRaw`DELETE FROM products WHERE slug LIKE ${`zz-p09fm-${String(stamp)}%`}`;
  await db.$executeRaw`DELETE FROM curated_facets WHERE slug LIKE ${`zz-p09fm-${String(stamp)}%`}`;
  await db.$executeRaw`DELETE FROM categories WHERE slug LIKE ${`zz-p09fm-${String(stamp)}%`}`;
});

describe("per-market activation is computed per market", () => {
  it("activates in every market where the count clears the threshold", async () => {
    await withTransaction((tx) => recomputeFacetMarketActivation(tx, { facetId }));
    for (const code of markets) {
      const ok = await withTransaction((tx) => isFacetIndexable(tx, facetId, code));
      expect(ok, `facet should be indexable in ${code}`).toBe(true);
    }
  });

  it("refuses an indexable page in the market where the products are unpublished", async () => {
    // The per-market lever that EXISTS today: product_market_content.is_published. It is not
    // the price gate, and it is not a substitute for it — it is the other half of the same
    // predicate, and it is the half P09 can actually prove.
    const second = markets[1]!;
    await db.$executeRaw`
      INSERT INTO product_market_content (product_id, market_code, is_published, created_at, updated_at)
      SELECT id, ${second}, false, now(), now()
      FROM products WHERE slug LIKE ${`zz-p09fm-${String(stamp)}%`}
      ON CONFLICT (product_id, market_code) DO UPDATE SET is_published = false
    `;

    const result = await withTransaction((tx) =>
      recomputeFacetMarketActivation(tx, { facetId }),
    );
    expect(result.deactivated).toBe(1);

    expect(await withTransaction((tx) => isFacetIndexable(tx, facetId, markets[0]!))).toBe(
      true,
    );
    expect(await withTransaction((tx) => isFacetIndexable(tx, facetId, second))).toBe(false);

    // The count is stored, not just the flag — /admin needs to show WHY a page went dark.
    const row = await db.$queryRaw<{ product_count: number; is_active: boolean }[]>`
      SELECT product_count, is_active FROM curated_facet_markets
      WHERE facet_id = ${facetId}::uuid AND market_code = ${second}
    `;
    expect(row[0]!.product_count).toBe(0);
    expect(row[0]!.is_active).toBe(false);
  });

  it("does not touch curated_facets.is_active, which belongs to the merchandiser", async () => {
    const before = await db.$queryRaw<{ is_active: boolean }[]>`
      SELECT is_active FROM curated_facets WHERE id = ${facetId}::uuid
    `;
    await withTransaction((tx) => recomputeFacetMarketActivation(tx, { facetId }));
    const after = await db.$queryRaw<{ is_active: boolean }[]>`
      SELECT is_active FROM curated_facets WHERE id = ${facetId}::uuid
    `;
    expect(after[0]!.is_active).toBe(before[0]!.is_active);
  });

  it("keeps the facet-level kill switch above the per-market one", async () => {
    await db.$executeRaw`UPDATE curated_facets SET is_active = false WHERE id = ${facetId}::uuid`;
    expect(await withTransaction((tx) => isFacetIndexable(tx, facetId, markets[0]!))).toBe(
      false,
    );
    await db.$executeRaw`UPDATE curated_facets SET is_active = true WHERE id = ${facetId}::uuid`;
  });
});

describe("the live-product predicate", () => {
  it("states every clause it enforces", () => {
    const rendered = liveProducts("US").sql;
    const present: Record<string, boolean> = {
      "not soft-deleted": rendered.includes("deleted_at IS NULL"),
      "status = active": rendered.includes("status = 'active'"),
      "published_at has passed": rendered.includes("published_at <= now()"),
      "not unpublished for this market": rendered.includes("coalesce(pmc.is_published, true)"),
      "priced in this market": /FROM prices/i.test(rendered),
    };
    // Every clause the constant claims, except the one openly declared not built yet.
    for (const clause of LIVE_PRODUCT_CLAUSES) {
      if (clause === "priced in this market") continue;
      expect(present[clause], `clause not found in the rendered SQL: ${clause}`).toBe(true);
    }
    // And no clause in the SQL that the constant fails to mention.
    expect(Object.keys(present).sort()).toEqual([...LIVE_PRODUCT_CLAUSES].sort());
  });

  it("gates on price once prices exists — ARMS ITSELF AT P10", async () => {
    const exists = await pricesTableExists();
    const rendered = liveProducts("US").sql;
    if (!exists) {
      // Not skipped, and not passing vacuously: it asserts the CURRENT, known-incomplete
      // state, so if someone adds the clause without the table this fails too.
      expect(/FROM prices/i.test(rendered)).toBe(false);
      return;
    }
    expect(
      /FROM prices/i.test(rendered),
      "prices exists, so the live-product predicate must gate on it — see priceVisibility() in src/lib/catalog/visibility.ts",
    ).toBe(true);
  });
});
