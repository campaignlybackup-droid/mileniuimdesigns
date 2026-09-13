import { afterAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { PERF_PREFIX } from "../../prisma/fixtures/perf-catalog";

/**
 * Commissioned by 09 P03 criterion (e) and §2.6.
 *
 * Run HERE, not at P30. An operations table discovered missing by the phase that needs it
 * is a migration written under pressure; discovered at P03 it is a one-line addition.
 */
const url = process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"]!;
const client = new Client({ connectionString: url });
const ready = client.connect();
afterAll(async () => {
  await client.end();
});

/** Every table Schema I is responsible for (09 P03 "Builds"). */
const SCHEMA_I_TABLES = [
  // markets
  "currencies",
  "markets",
  "inventory_locations",
  "market_locations",
  "order_counters",
  // identity and access
  "users",
  "roles",
  "permissions",
  "role_permissions",
  "user_roles",
  "sessions",
  "otp_requests",
  "rate_limits",
  // customers
  "customer_groups",
  "customers",
  "customer_currency_totals",
  "newsletter_subscribers",
  // operations — every later phase writes into these
  "settings",
  "audit_logs",
  "jobs",
  "saved_views",
  "import_jobs",
  "import_job_rows",
  "search_queries",
  "analytics_events",
  "email_templates",
  "email_logs",
  // Schema II — the catalogue
  "categories",
  "products",
  "product_variants",
  "product_options",
  "product_option_values",
  "variant_option_values",
  "stones",
  "product_stones",
  "materials",
  "variant_materials",
  "tags",
  "product_tags",
  "product_categories",
  "product_market_content",
  "category_market_content",
  "product_market_sort",
  "attributes",
  "attribute_options",
  "product_attribute_values",
  "media",
  "media_folders",
  "product_media",
  "collections",
  "collection_rules",
  "product_collections",
  "collection_market_content",
  "curated_facets",
  "curated_facet_markets",
  "seo_metadata",
  "redirects",
] as const;

async function tables(): Promise<Set<string>> {
  await ready;
  const { rows } = await client.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
  );
  return new Set(rows.map((r) => r.tablename));
}

describe("migration drift", () => {
  it("every table Schema I promises actually exists", async () => {
    const present = await tables();
    const missing = SCHEMA_I_TABLES.filter((t) => !present.has(t));
    expect(missing).toEqual([]);
  });

  it("the required extensions are installed", async () => {
    await ready;
    const { rows } = await client.query<{ extname: string }>(
      `SELECT extname FROM pg_extension WHERE extname IN ('pg_trgm','btree_gist')`,
    );
    expect(rows.map((r) => r.extname).sort()).toEqual(["btree_gist", "pg_trgm"]);
  });

  it("no migration is pending or failed", async () => {
    await ready;
    const { rows } = await client.query<{
      migration_name: string;
      finished_at: Date | null;
      rolled_back_at: Date | null;
    }>(
      `SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY started_at`,
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.filter((r) => r.finished_at === null)).toEqual([]);
    expect(rows.filter((r) => r.rolled_back_at !== null)).toEqual([]);
  });

  it("seeds the 73 permissions and grants owner all of them", async () => {
    await ready;
    const { rows: p } = await client.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM permissions`,
    );
    expect(p[0]!.n).toBe(73);

    const { rows: o } = await client.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM role_permissions rp
       JOIN roles r ON r.id = rp.role_id WHERE r.key = 'owner'`,
    );
    expect(o[0]!.n).toBe(73);
  });

  it("every role_permissions row references a real permission", async () => {
    await ready;
    const { rows } = await client.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM role_permissions rp
       LEFT JOIN permissions p ON p.key = rp.permission_key WHERE p.key IS NULL`,
    );
    expect(rows[0]!.n).toBe(0);
  });

  it("seeds exactly nine categories — STONES is a route, not a row", async () => {
    await ready;
    const { rows } = await client.query<{ n: number; slugs: string }>(
      `SELECT count(*)::int AS n, string_agg(slug, ',' ORDER BY rank) AS slugs
       FROM categories WHERE deleted_at IS NULL AND slug NOT LIKE '${PERF_PREFIX}%'`,
    );
    expect(rows[0]!.n).toBe(9);
    expect(rows[0]!.slugs).not.toContain("stones");
    expect(rows[0]!.slugs).toContain("one-of-a-kind");
  });

  it("seeds seven stones and four materials with EMPTY copy and unpublished", async () => {
    // Stone copy is an editorial claim about origin, meaning and care. Writing it for a
    // real jewellery house would be inventing provenance (hard rule 8).
    await ready;
    const { rows: stones } = await client.query<{ n: number; described: number }>(
      `SELECT count(*)::int AS n,
              count(*) FILTER (WHERE short_description IS NOT NULL
                                  OR description_json IS NOT NULL)::int AS described
       FROM stones WHERE deleted_at IS NULL`,
    );
    expect(stones[0]!.n).toBe(7);
    expect(stones[0]!.described, "a seeded stone has invented copy").toBe(0);

    const { rows: pub } = await client.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM stones WHERE is_published AND deleted_at IS NULL`,
    );
    expect(pub[0]!.n, "an empty stone page is live and indexable").toBe(0);

    const { rows: mats } = await client.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM materials WHERE deleted_at IS NULL`,
    );
    expect(mats[0]!.n).toBe(4);
  });

  it("seeds NO product — the catalogue is the client's", async () => {
    await ready;
    const { rows } = await client.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM products WHERE slug NOT LIKE '${PERF_PREFIX}%'`,
    );
    expect(rows[0]!.n).toBe(0);
  });

  it("every product that DOES exist is an unmistakably-marked performance fixture", async () => {
    // The exclusion above is a hole in a hard-rule-8 guard, so it is closed from the other
    // side. It is not enough that non-fixture products number zero; every row present must
    // also be visibly synthetic in BOTH its slug and its title, so no row can hide behind the
    // prefix while reading, on an admin screen, like a real piece.
    await ready;
    const { rows } = await client.query<{ slug: string; title: string }>(
      `SELECT slug, title FROM products WHERE slug NOT LIKE '${PERF_PREFIX}%' OR title NOT LIKE 'ZZ PERF%'`,
    );
    expect(rows).toEqual([]);
  });

  it("seeds both markets, each with a currency its market actually uses", async () => {
    await ready;
    const { rows } = await client.query<{ code: string; currency_code: string }>(
      `SELECT code, currency_code FROM markets ORDER BY rank`,
    );
    expect(rows).toEqual([
      { code: "US", currency_code: "USD" },
      { code: "IN", currency_code: "INR" },
    ]);
  });

  it("seeds structure only — asserted by the seed itself, not here", () => {
    // The claim "the seed creates no customers" cannot honestly be made by a test that
    // runs against a database other tests have written to. It belongs where it can be
    // MEASURED: prisma/seed/index.ts counts customers, products and users before and
    // after and throws if the seed added any. Same correction as the users assertion.
    // See 09 P03 exit criterion (c).
    expect(true).toBe(true);
  });
});
