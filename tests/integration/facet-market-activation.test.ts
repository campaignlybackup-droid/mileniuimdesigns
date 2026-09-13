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
let currencyOf = new Map<string, string>();

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

  const ms = await db.$queryRaw<{ code: string; currency_code: string }[]>`
    SELECT code, currency_code FROM markets WHERE is_active ORDER BY code
  `;
  markets = ms.map((m) => m.code);
  currencyOf = new Map(ms.map((m) => [m.code, m.currency_code]));
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
    // Priced in the FIRST market only. A product-level manual row, which is the only kind a
    // product-level price may be (chk_prices_variant_level_formula).
    await db.$executeRaw`
      INSERT INTO prices (id, product_id, variant_id, market_code, currency_code, list_minor,
                          price_source, valid_from, created_at)
      VALUES (gen_random_uuid(), ${p[0]!.id}::uuid, NULL, ${markets[0]!},
              ${currencyOf.get(markets[0]!)!}, 18900, 'manual', now(), now())
    `;
  }
});

afterAll(async () => {
  await db.$executeRaw`
    DELETE FROM prices WHERE product_id IN (
      SELECT id FROM products WHERE slug LIKE ${`zz-p09fm-${String(stamp)}%`}
    )`;
  await db.$executeRaw`DELETE FROM products WHERE slug LIKE ${`zz-p09fm-${String(stamp)}%`}`;
  await db.$executeRaw`DELETE FROM curated_facets WHERE slug LIKE ${`zz-p09fm-${String(stamp)}%`}`;
  await db.$executeRaw`DELETE FROM categories WHERE slug LIKE ${`zz-p09fm-${String(stamp)}%`}`;
});

describe("per-market activation is computed per market", () => {
  it("refuses an indexable page in a market where nothing is priced", async () => {
    // THE named property of 03 §4.2. The products exist, are published, are in the category
    // and carry the stone — they differ from the priced market in exactly one fact.
    await withTransaction((tx) => recomputeFacetMarketActivation(tx, { facetId }));

    expect(
      await withTransaction((tx) => isFacetIndexable(tx, facetId, markets[0]!)),
      `${markets[0]!} is priced and should be indexable`,
    ).toBe(true);
    expect(
      await withTransaction((tx) => isFacetIndexable(tx, facetId, markets[1]!)),
      `${markets[1]!} has no prices and must not get an indexable page with nothing on it`,
    ).toBe(false);

    const rows = await db.$queryRaw<{ market_code: string; product_count: number }[]>`
      SELECT market_code, product_count FROM curated_facet_markets
      WHERE facet_id = ${facetId}::uuid ORDER BY market_code
    `;
    const counts = new Map(rows.map((r) => [r.market_code, Number(r.product_count)]));
    expect(counts.get(markets[0]!)).toBe(DEFAULT_MIN_PRODUCTS + 1);
    expect(counts.get(markets[1]!)).toBe(0);
  });

  it("activates the second market as soon as it is priced, and deactivates it again", async () => {
    // The count is the only thing that changed, so this is the clause under test and not a
    // side effect of some other predicate.
    await db.$executeRaw`
      INSERT INTO prices (id, product_id, variant_id, market_code, currency_code, list_minor,
                          price_source, valid_from, created_at)
      SELECT gen_random_uuid(), id, NULL, ${markets[1]!}, ${currencyOf.get(markets[1]!)!},
             1590000, 'manual', now(), now()
      FROM products WHERE slug LIKE ${`zz-p09fm-${String(stamp)}%`}
    `;
    await withTransaction((tx) => recomputeFacetMarketActivation(tx, { facetId }));
    expect(await withTransaction((tx) => isFacetIndexable(tx, facetId, markets[1]!))).toBe(
      true,
    );

    // Superseding every row — `valid_to` set — takes the market back out. A price that ENDED
    // is not a price, and this is the path a seasonal or withdrawn line actually takes.
    await db.$executeRaw`
      UPDATE prices SET valid_to = now()
      WHERE market_code = ${markets[1]!} AND product_id IN (
        SELECT id FROM products WHERE slug LIKE ${`zz-p09fm-${String(stamp)}%`}
      )`;
    await withTransaction((tx) => recomputeFacetMarketActivation(tx, { facetId }));
    expect(await withTransaction((tx) => isFacetIndexable(tx, facetId, markets[1]!))).toBe(
      false,
    );
  });

  it("refuses an indexable page in a market where the products are unpublished", async () => {
    // The OTHER per-market lever: product_market_content.is_published. Asserted separately
    // from the price gate because they fail for different reasons — this one is an editorial
    // decision, the other is an incomplete catalogue — and a test that conflated them would
    // keep passing if either were removed.
    const second = markets[0]!;
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
    for (const clause of LIVE_PRODUCT_CLAUSES) {
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
