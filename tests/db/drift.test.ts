import { afterAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { PERF_PREFIX } from "../../prisma/fixtures/perf-catalog";
import { tablesInSchema } from "./schema-coverage";

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

async function tables(): Promise<Set<string>> {
  await ready;
  const { rows } = await client.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
  );
  return new Set(rows.map((r) => r.tablename));
}

describe("migration drift", () => {
  it("every table the Prisma schema declares actually exists", async () => {
    // DERIVED from the models, never a hand-typed list. The hand-typed version passed for
    // four phases while `media_tags` was declared and never created, because nobody had
    // remembered to add `media_tags` to it (tests/db/schema-coverage.ts).
    const present = await tables();
    const declared = [...tablesInSchema()].sort();
    expect(declared.length).toBeGreaterThanOrEqual(106);
    expect(declared.filter((t) => !present.has(t))).toEqual([]);
  });

  it("every table in the database is declared by the Prisma schema", async () => {
    // The converse, which catches the other direction: a table created by a hand-written
    // migration and never modelled is a table Prisma will propose DROPPING on the next diff.
    const declared = tablesInSchema();
    const orphans = [...(await tables())]
      .filter((t) => !declared.has(t))
      // Prisma's own bookkeeping, which is deliberately not a model.
      .filter((t) => t !== "_prisma_migrations");
    expect(orphans).toEqual([]);
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

  it("seeds NO metal rate — P10 exit criterion (d)", async () => {
    // A seeded rate is a FABRICATED BUSINESS FACT: it is the price of silver on a particular
    // day, and nobody here knows what the client pays. Worse than the fabrication, it would
    // let P12's headline test — "a rate change moves nothing" — pass against a rate nobody
    // entered, which is the R03 mitigation appearing to work while proving nothing.
    //
    // The table stays empty until a human types a number. Every formula that needs one
    // returns RateUnavailableError, and the recalc preview reports the line as skipped.
    await ready;
    const { rows } = await client.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM metal_rates`,
    );
    expect(rows[0]!.n, "a seeded metal rate is an invented business fact").toBe(0);
  });

  it("seeds no pricing formula, binding, coupon, gift card or tax rule either", async () => {
    // The same rule as the catalogue and for the same reason. A making charge, a markup, a
    // GST rate and a discount are all commercial decisions; every one of them would be
    // invented, and each would then be quietly correct-looking on an admin screen.
    await ready;
    for (const table of [
      "pricing_formulas",
      "pricing_formula_versions",
      "pricing_formula_market_terms",
      "price_formula_bindings",
      "pricing_rules",
      "coupons",
      "gift_cards",
      "tax_rules",
      "recalc_runs",
      "variant_component_costs",
    ]) {
      const { rows } = await client.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM ${table}`,
      );
      expect(rows[0]!.n, `${table} should be empty after the seed`).toBe(0);
    }
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
