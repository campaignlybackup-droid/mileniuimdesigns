import type { PrismaClient } from "../../src/generated/prisma/client";
import { env } from "@/lib/config/env";

/** Everything here needs is raw SQL. Taking the client as a parameter keeps this file out of
 *  `server-only`'s reach, so the same code runs under Vitest and under a plain tsx script. */
type Client = Pick<PrismaClient, "$executeRaw" | "$executeRawUnsafe" | "$queryRaw">;

/**
 * The 5,000-product performance fixture — 09 §2.10, required by P09 exit criterion (a).
 *
 * **This is not a catalogue and must never be mistaken for one (hard rule 8).** Every row it
 * writes is prefixed `zz-perf-fixture-` / `ZZ PERF FIXTURE`, sorts to the end of every admin
 * list, and names no stone setting, no finish and no jewellery type that a merchandiser could
 * read as a real specification. The attribute keys are `zz_perf_*` for the same reason. What a
 * performance fixture has to reproduce is CARDINALITY and DISTRIBUTION — 5,000 products, a
 * 12-option select, a 4-option select, seven stones, five metals — and none of that requires
 * inventing a fact about the client's business.
 *
 * `dropPerfCatalog()` removes every row it created, keyed on the same prefix.
 */

export const PERF_PREFIX = "zz-perf-fixture-";
export const PERF_PRODUCTS = 5_000;
/** The `select` attribute of exit criterion (a): twelve options over 5,000 products. */
export const PERF_ATTR_12 = "zz_perf_select_12";
export const PERF_ATTR_4 = "zz_perf_select_4";
/**
 * All 5,000 products sit in ONE category, not spread over the nine seeded ones.
 *
 * The budget in 09 §2.10 is a filter over a 5,000-product catalogue, and a PLP is always
 * scoped to a category — spread round-robin over nine, the scope a bench could actually
 * measure would hold 555 products and the number it reported would be the cost of a
 * catalogue the client does not have. It also keeps every synthetic row out of the real
 * category listings, which is the hygiene hard rule 8 asks for anyway.
 */
export const PERF_CATEGORY_SLUG = "zz-perf-fixture-category";

async function assertSafeTarget(db: Client): Promise<void> {
  if (env().APP_ENV === "production") {
    throw new Error(
      "The performance fixture writes 5,000 synthetic products. It must never run against production.",
    );
  }
  // A second gate that does NOT depend on APP_ENV being set correctly, because the one thing
  // an environment variable is guaranteed to be at some point is wrong. A database holding
  // even one real product is not a database this may write to — and "real" is decided by the
  // absence of the fixture's own prefix, not by a name or a URL that can be copied.
  const real = await db.$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS n FROM products WHERE slug NOT LIKE ${PERF_PREFIX + "%"}
  `;
  if ((real[0]?.n ?? 0) > 0) {
    throw new Error(
      `This database holds ${String(real[0]!.n)} product(s) that are not fixture rows. The performance fixture only runs against a database with no real catalogue.`,
    );
  }
}

/** Idempotent: running it twice leaves 5,000 products, not 10,000. */
export async function seedPerfCatalog(db: Client): Promise<{ products: number }> {
  await assertSafeTarget(db);

  const existing = await db.$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS n FROM products WHERE slug LIKE ${PERF_PREFIX + "%"}
  `;
  if ((existing[0]?.n ?? 0) >= PERF_PRODUCTS) return { products: existing[0]!.n };

  // ── Attributes ────────────────────────────────────────────────────────────────────
  for (const [key, count] of [
    [PERF_ATTR_12, 12],
    [PERF_ATTR_4, 4],
  ] as const) {
    await db.$executeRaw`
      INSERT INTO attributes (id, key, label, data_type, is_filterable, is_comparable,
                              scope, is_required, rank, version, created_at, updated_at)
      VALUES (gen_random_uuid(), ${key}, ${"ZZ PERF " + key}, 'select', true, false,
              'product', false, 9000, 1, now(), now())
      ON CONFLICT DO NOTHING
    `;
    await db.$executeRaw`
      INSERT INTO attribute_options (id, attribute_id, value, label, rank)
      SELECT gen_random_uuid(), a.id, ${key} || '-' || lpad(i::text, 2, '0'),
             'ZZ PERF option ' || i, i
      FROM attributes a, generate_series(0, ${count - 1}) AS i
      WHERE a.key = ${key}
      ON CONFLICT DO NOTHING
    `;
  }

  // ── The fixture's own category, created BEFORE the products ────────────────────
  await db.$executeRaw`
    INSERT INTO categories (id, slug, name, materialized_path, depth, is_published, rank,
                            version, created_at, updated_at)
    VALUES (gen_random_uuid(), ${PERF_CATEGORY_SLUG}, 'ZZ PERF FIXTURE', '', 0, false, 9000,
            1, now(), now())
    ON CONFLICT DO NOTHING
  `;
  await db.$executeRaw`
    UPDATE categories SET materialized_path = id::text
    WHERE slug = ${PERF_CATEGORY_SLUG} AND materialized_path = ''
  `;
  // ── Products ──────────────────────────────────────────────────────────────────────
  // The ordinal lives in the slug, so every join below derives the same deterministic
  // assignment from it without carrying a temporary table.
  //
  // `primary_category_id` is set in the INSERT, not by a follow-up UPDATE. Postgres has no
  // in-place update: a second pass over 5,000 rows leaves 5,000 DEAD tuples, and the local
  // `prisma dev` server does not autovacuum (`last_autoanalyze` is null on every table), so
  // nothing ever reclaims them. The full-table aggregate in `getFacetCounts` then walks 10,000
  // heap tuples for a 5,000-row catalogue, and the perf baseline drifts upward every time the
  // fixture is rebuilt — a benchmark measuring its own setup history.
  await db.$executeRaw`
    INSERT INTO products (id, slug, title, status, published_at, primary_category_id, rank,
                          search_text, version, created_at, updated_at)
    SELECT gen_random_uuid(),
           ${PERF_PREFIX} || lpad(i::text, 5, '0'),
           'ZZ PERF FIXTURE ' || lpad(i::text, 5, '0'),
           'active', now() - interval '1 day',
           (SELECT id FROM categories WHERE slug = ${PERF_CATEGORY_SLUG}), i, '',
           1, now(), now()
    FROM generate_series(1, ${PERF_PRODUCTS}) AS i
    ON CONFLICT DO NOTHING
  `;

  await db.$executeRaw`
    INSERT INTO product_categories (product_id, category_id, rank, is_primary, created_at)
    SELECT p.id, c.id, 0, true, now()
    FROM products p, categories c
    WHERE p.slug LIKE ${PERF_PREFIX + "%"} AND c.slug = ${PERF_CATEGORY_SLUG}
    ON CONFLICT DO NOTHING
  `;

  await db.$executeRaw`
    WITH perf AS (
      SELECT id, right(slug, 5)::int AS i FROM products WHERE slug LIKE ${PERF_PREFIX + "%"}
    ), st AS (
      SELECT id, (row_number() OVER (ORDER BY rank, id) - 1) AS k, count(*) OVER () AS n
      FROM stones WHERE deleted_at IS NULL
    )
    INSERT INTO product_stones (product_id, stone_id, is_primary, position, created_at)
    SELECT perf.id, st.id, true, 0, now()
    FROM perf JOIN st ON st.k = perf.i % st.n
    ON CONFLICT DO NOTHING
  `;

  await db.$executeRaw`
    WITH perf AS (
      SELECT id, right(slug, 5)::int AS i FROM products WHERE slug LIKE ${PERF_PREFIX + "%"}
    )
    INSERT INTO product_variants (id, product_id, sku, position, inventory_policy,
                                  option_signature, is_active, version, created_at, updated_at)
    SELECT gen_random_uuid(), perf.id,
           'MD-ZZP-ZZP-' || lpad(perf.i::text, 4, '0') || '-NA',
           0, 'tracked', '', true, 1, now(), now()
    FROM perf
    ON CONFLICT DO NOTHING
  `;

  await db.$executeRaw`
    WITH perf AS (
      SELECT v.id AS variant_id, right(p.slug, 5)::int AS i
      FROM product_variants v JOIN products p ON p.id = v.product_id
      WHERE p.slug LIKE ${PERF_PREFIX + "%"}
    ), mat AS (
      SELECT id, (row_number() OVER (ORDER BY rank, id) - 1) AS k, count(*) OVER () AS n
      FROM materials WHERE deleted_at IS NULL
    )
    INSERT INTO variant_materials (variant_id, material_id, weight_grams, is_primary, created_at)
    SELECT perf.variant_id, mat.id, 3.500, true, now()
    FROM perf JOIN mat ON mat.k = perf.i % mat.n
    ON CONFLICT DO NOTHING
  `;

  for (const key of [PERF_ATTR_12, PERF_ATTR_4]) {
    await db.$executeRaw`
      WITH perf AS (
        SELECT id, right(slug, 5)::int AS i FROM products WHERE slug LIKE ${PERF_PREFIX + "%"}
      ), opt AS (
        SELECT o.id, (row_number() OVER (ORDER BY o.rank, o.id) - 1) AS k, count(*) OVER () AS n
        FROM attribute_options o JOIN attributes a ON a.id = o.attribute_id
        WHERE a.key = ${key}
      )
      INSERT INTO product_attribute_values
        (id, product_id, variant_id, attribute_id, option_id, created_at, updated_at)
      SELECT gen_random_uuid(), perf.id, NULL,
             (SELECT id FROM attributes WHERE key = ${key}), opt.id, now(), now()
      FROM perf JOIN opt ON opt.k = perf.i % opt.n
      ON CONFLICT DO NOTHING
    `;
  }

  await vacuumPerfTables(db);

  const after = await db.$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS n FROM products WHERE slug LIKE ${PERF_PREFIX + "%"}
  `;
  return { products: after[0]?.n ?? 0 };
}

/**
 * Reclaim dead tuples and refresh planner statistics over the fixture's tables.
 *
 * Called at seed time and again by the bench before it measures. Both are necessary: the
 * planner needs statistics or the first run reports the cost of a sequential scan it would
 * never have chosen, and the local `prisma dev` server runs NO autovacuum — so without an
 * explicit VACUUM a measurement is a function of how much test churn happened since the
 * fixture was built, which is not a property of the query under test.
 *
 * VACUUM cannot run inside a transaction, hence `$executeRawUnsafe` with a literal.
 */
export async function vacuumPerfTables(db: Client): Promise<void> {
  await db.$executeRawUnsafe(
    "VACUUM ANALYZE products, product_categories, product_stones, product_variants, variant_materials, product_attribute_values",
  );
}

export async function dropPerfCatalog(db: Client): Promise<void> {
  await assertSafeTarget(db);
  // Products cascade to categories, stones, variants and attribute values.
  await db.$executeRaw`DELETE FROM products WHERE slug LIKE ${PERF_PREFIX + "%"}`;
  await db.$executeRaw`DELETE FROM attributes WHERE key IN (${PERF_ATTR_12}, ${PERF_ATTR_4})`;
  await db.$executeRaw`DELETE FROM categories WHERE slug = ${PERF_CATEGORY_SLUG}`;
}
