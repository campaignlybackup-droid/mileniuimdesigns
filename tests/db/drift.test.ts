import { afterAll, describe, expect, it } from "vitest";
import { Client } from "pg";

/**
 * Commissioned by 09 P03 criterion (e) and §2.6.
 *
 * Run HERE, not at P30. An operations table discovered missing by the phase that needs it
 * is a migration written under pressure; discovered at P03 it is a one-line addition.
 */
const url = process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"]!;
const client = new Client({ connectionString: url });
const ready = client.connect();
afterAll(async () => { await client.end(); });

/** Every table Schema I is responsible for (09 P03 "Builds"). */
const SCHEMA_I_TABLES = [
  // markets
  "currencies", "markets", "inventory_locations", "market_locations", "order_counters",
  // identity and access
  "users", "roles", "permissions", "role_permissions", "user_roles",
  "sessions", "otp_requests", "rate_limits",
  // customers
  "customer_groups", "customers", "customer_currency_totals", "newsletter_subscribers",
  // operations — every later phase writes into these
  "settings", "audit_logs", "jobs", "saved_views", "import_jobs", "import_job_rows",
  "search_queries", "analytics_events", "email_templates", "email_logs",
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
    const { rows } = await client.query<{ migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }>(
      `SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY started_at`,
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.filter((r) => r.finished_at === null)).toEqual([]);
    expect(rows.filter((r) => r.rolled_back_at !== null)).toEqual([]);
  });

  it("seeds the 73 permissions and grants owner all of them", async () => {
    await ready;
    const { rows: p } = await client.query<{ n: number }>(`SELECT count(*)::int AS n FROM permissions`);
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

  it("seeds NO product, price, order or customer — structure only", async () => {
    // The seed ships structure. Inventing a catalogue for a real jewellery house is
    // exactly what hard rule 8 forbids.
    const present = await tables();
    for (const t of ["customers", "newsletter_subscribers", "analytics_events", "audit_logs"]) {
      if (!present.has(t)) continue;
      if (t === "audit_logs") continue; // create:admin legitimately writes one row here
      const { rows } = await client.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${t}`);
      expect(rows[0]!.n, `${t} should be empty after seeding`).toBe(0);
    }
  });
});
