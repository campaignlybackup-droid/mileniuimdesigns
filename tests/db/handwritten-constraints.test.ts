import { afterAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { handWrittenObjects } from "./schema-coverage";

/**
 * THE MANIFEST of every database object Prisma cannot express.
 *
 * Why this exists, in one paragraph. Prisma diffs the DATABASE against the PRISMA SCHEMA,
 * so anything the schema does not describe reads as drift — and `prisma migrate dev`
 * emits a DROP for it. Every object below is hand-written precisely BECAUSE Prisma cannot
 * express it, which means every one of them is a standing candidate for silent deletion.
 *
 * This is not hypothetical. Generating the Schema II migration dropped
 * `uq_settings_key_market`, `uq_email_templates` and `idx_analytics_occurred_brin` — the
 * first of which is the index that makes a setting per-market rather than global. Nobody
 * read the DROP lines in 650 lines of generated SQL. A test failed instead, which is the
 * only reason it was noticed.
 *
 * The list is DERIVED from prisma/handwritten/addendum.sql — the same extraction
 * scripts/guard-migration.ts performs — so adding an object to the addendum adds it here, and
 * the guard and this test cannot disagree about what is protected. Hand-maintaining it was the
 * defect that let `media_tags` go missing for four phases (tests/db/schema-coverage.ts).
 */
const url = process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"]!;
const client = new Client({ connectionString: url });
const ready = client.connect();
afterAll(async () => {
  await client.end();
});

const {
  indexes: HANDWRITTEN_INDEXES,
  constraints: HANDWRITTEN_CONSTRAINTS,
  triggers: HANDWRITTEN_TRIGGERS,
} = handWrittenObjects();

/**
 * Floors, raised deliberately when a phase adds objects.
 *
 * The lists above are DERIVED from addendum.sql (see tests/db/schema-coverage.ts for why),
 * which means deleting a declaration would also delete the assertion that it exists. These
 * numbers are what makes that fail: they are the one thing here a person still has to type,
 * and they only ever move up.
 */
const FLOORS = { indexes: 93, constraints: 94, triggers: 2 };

describe("hand-written database objects still exist", () => {
  it("every index in the manifest is present", async () => {
    await ready;
    const { rows } = await client.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`,
    );
    const present = new Set(rows.map((r) => r.indexname));
    const missing = HANDWRITTEN_INDEXES.filter((i) => !present.has(i));
    expect(
      missing,
      `Dropped by a migration. Prisma proposes a DROP for anything the schema does not ` +
        `describe, and these are hand-written precisely because it cannot describe them.`,
    ).toEqual([]);
  });

  it("every constraint in the manifest is present", async () => {
    await ready;
    const { rows } = await client.query<{ conname: string }>(
      `SELECT conname FROM pg_constraint`,
    );
    const present = new Set(rows.map((r) => r.conname));
    const missing = HANDWRITTEN_CONSTRAINTS.filter((c) => !present.has(c));
    expect(missing).toEqual([]);
  });

  it("the audit immutability triggers are present", async () => {
    await ready;
    const { rows } = await client.query<{ tgname: string }>(
      `SELECT tgname FROM pg_trigger WHERE NOT tgisinternal`,
    );
    const present = new Set(rows.map((r) => r.tgname));
    const missing = HANDWRITTEN_TRIGGERS.filter((t) => !present.has(t));
    expect(missing).toEqual([]);
  });

  it("products.search_vector is still a GENERATED column", async () => {
    await ready;
    const { rows } = await client.query<{ is_generated: string }>(
      `SELECT is_generated FROM information_schema.columns
       WHERE table_name = 'products' AND column_name = 'search_vector'`,
    );
    expect(rows[0]?.is_generated).toBe("ALWAYS");
  });

  it("the manifest has not shrunk", () => {
    // A manifest derived from a file someone emptied would pass every assertion above, because
    // nothing would be expected. These floors are the counterweight, and they only move up.
    expect(HANDWRITTEN_INDEXES.length).toBeGreaterThanOrEqual(FLOORS.indexes);
    expect(HANDWRITTEN_CONSTRAINTS.length).toBeGreaterThanOrEqual(FLOORS.constraints);
    expect(HANDWRITTEN_TRIGGERS.length).toBeGreaterThanOrEqual(FLOORS.triggers);
  });
});
