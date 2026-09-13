/**
 * Remove integration-test fixtures stranded in the local development database.
 *
 * **Why this exists.** `tests/db/drift.test.ts` asserts that the development database holds no
 * products but the marked performance fixture — it is the leak detector that has caught a real
 * cleanup bug in most phases since P09. Suites clean up in `afterAll`, which survives a failing
 * assertion. What it does NOT survive is the database process dying mid-suite: the local engine
 * crashes outright when a statement runs inside an already-aborted transaction, and when it
 * goes down every remaining suite fails and none of their `afterAll` hooks reach a live
 * connection. One such cascade strands dozens of rows, and the drift test then fails on every
 * subsequent run until someone clears them by hand.
 *
 * Clearing them by hand is how a leak detector gets ignored. This is the supported way.
 *
 * **Scope.** Only slugs matching a test-fixture prefix, and never the performance fixture,
 * which is legitimate and expensive to rebuild. It does not touch the nine seeded categories,
 * any market, or anything a person could have entered through the admin.
 *
 * DRY RUN BY DEFAULT. Pass --apply to delete.
 *
 *   npm run test:clean          # report only
 *   npm run test:clean -- --apply
 */
import "dotenv/config";
import { Client } from "pg";

/** A slug only an integration fixture can have — `p7-…`, `zz-p19k-…`, and so on. */
const TEST_FIXTURE = "slug ~ '^(p[0-9]+-|zz-p[0-9])' AND slug NOT LIKE 'zz-perf-fixture-%'";
/** The domain reserved by RFC 2606 for exactly this. No real customer can hold one. */
const TEST_EMAIL = "email LIKE '%@example.invalid'";

const APPLY = process.argv.includes("--apply");

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  if (!/localhost|127\.0\.0\.1/.test(url)) {
    // A maintenance script that deletes rows must not be able to reach production by
    // inheriting whatever DATABASE_URL happened to be exported.
    throw new Error(
      `Refusing to run against a non-local database: ${url.replace(/:[^:@]*@/, ":***@")}`,
    );
  }

  const c = new Client({ connectionString: url });
  await c.connect();
  try {
    const products = await c.query<{ id: string; slug: string }>(
      `SELECT id, slug FROM products WHERE ${TEST_FIXTURE} ORDER BY slug`,
    );
    const cats = await c.query<{ slug: string }>(
      `SELECT slug FROM categories WHERE ${TEST_FIXTURE} ORDER BY slug`,
    );
    const custs = await c.query<{ email: string }>(
      `SELECT email FROM customers WHERE ${TEST_EMAIL} ORDER BY email`,
    );

    console.log(`${APPLY ? "DELETING" : "WOULD DELETE"}:`);
    console.log(`  products   ${String(products.rowCount)}`);
    for (const r of products.rows) console.log(`    ${r.slug}`);
    console.log(`  categories ${String(cats.rowCount)}`);
    for (const r of cats.rows) console.log(`    ${r.slug}`);
    console.log(`  customers  ${String(custs.rowCount)}`);

    if (products.rowCount === 0 && cats.rowCount === 0 && custs.rowCount === 0) {
      console.log("\nNothing stranded. The database is clean.");
      return;
    }
    if (!APPLY) {
      console.log("\nDry run. Re-run with --apply to delete.");
      return;
    }

    const pids = products.rows.map((r) => r.id);
    await c.query("BEGIN");
    const vids = (
      await c.query<{ id: string }>(
        "SELECT id FROM product_variants WHERE product_id = ANY($1::uuid[])",
        [pids],
      )
    ).rows.map((r) => r.id);

    // ON DELETE RESTRICT children, deepest first. Everything else cascades from `products`.
    const byVariant = [
      `DELETE FROM inventory_transactions WHERE inventory_item_id IN
         (SELECT id FROM inventory_items WHERE variant_id = ANY($1::uuid[]))`,
      "DELETE FROM inventory_items WHERE variant_id = ANY($1::uuid[])",
      "DELETE FROM cart_items WHERE variant_id = ANY($1::uuid[])",
      "DELETE FROM recalc_run_lines WHERE variant_id = ANY($1::uuid[])",
      "DELETE FROM price_formula_bindings WHERE variant_id = ANY($1::uuid[])",
    ];
    for (const sql of byVariant) await c.query(sql, [vids]);
    await c.query("DELETE FROM price_formula_bindings WHERE product_id = ANY($1::uuid[])", [
      pids,
    ]);
    await c.query("DELETE FROM prices WHERE product_id = ANY($1::uuid[])", [pids]);

    const dp = await c.query(`DELETE FROM products WHERE ${TEST_FIXTURE}`);
    const dc = await c.query(`DELETE FROM categories WHERE ${TEST_FIXTURE}`);
    const du = await c.query(`DELETE FROM customers WHERE ${TEST_EMAIL}`);
    await c.query("COMMIT");
    console.log(
      `\nDeleted ${String(dp.rowCount)} products, ${String(dc.rowCount)} categories, ${String(du.rowCount)} customers.`,
    );
  } finally {
    await c.end();
  }
}

void main();
