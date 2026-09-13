import { afterAll, describe, expect, it } from "vitest";
import { Client } from "pg";

/**
 * Commissioned by 09 P03 (§2.6).
 *
 * A CHECK that lives only in a document is not a CHECK. Each of these asserts the
 * database REFUSES the row — not that the service layer remembers to.
 */
const url = process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"]!;
const client = new Client({ connectionString: url });
const ready = client.connect();

afterAll(async () => {
  await client.end();
});

/** Run inside a transaction that always rolls back, so tests leave no residue. */
async function rejects(sql: string, params: unknown[] = []): Promise<string> {
  await ready;
  await client.query("BEGIN");
  try {
    await client.query(sql, params as never[]);
    await client.query("ROLLBACK");
    return "";
  } catch (e) {
    await client.query("ROLLBACK");
    return (e as { constraint?: string; message: string }).constraint ?? (e as Error).message;
  }
}

describe("sessions — exactly one principal", () => {
  it("refuses a session with BOTH a staff user and a customer", async () => {
    // The load-bearing constraint of the auth model: whichever resolver ran first would
    // decide whether the request acts as a shopper or as an admin (09 P03 criterion (d)).
    const c = await rejects(`
      INSERT INTO sessions (id, token_hash, user_id, customer_id, expires_at, last_seen_at, created_at)
      VALUES (gen_random_uuid(), '\\x01'::bytea,
              (SELECT id FROM users LIMIT 1),
              gen_random_uuid(), now() + interval '1 day', now(), now())
    `);
    expect(c).toContain("chk_sessions_one_principal");
  });

  it("refuses a session with NEITHER principal", async () => {
    const c = await rejects(`
      INSERT INTO sessions (id, token_hash, expires_at, last_seen_at, created_at)
      VALUES (gen_random_uuid(), '\\x02'::bytea, now() + interval '1 day', now(), now())
    `);
    expect(c).toContain("chk_sessions_one_principal");
  });

  it("refuses an impersonator on a staff-principal session", async () => {
    const c = await rejects(`
      INSERT INTO sessions (id, token_hash, user_id, impersonator_user_id, expires_at, last_seen_at, created_at)
      VALUES (gen_random_uuid(), '\\x03'::bytea,
              (SELECT id FROM users LIMIT 1), (SELECT id FROM users LIMIT 1),
              now() + interval '1 day', now(), now())
    `);
    expect(c).toContain("chk_sessions_impersonation");
  });
});

describe("users — TOTP enrolment is a pair", () => {
  it("refuses a secret with no enrolment timestamp", async () => {
    const c = await rejects(`
      UPDATE users SET totp_secret_encrypted = 'v1:abc', totp_enrolled_at = NULL
    `);
    expect(c).toContain("chk_users_totp_pair");
  });
});

describe("markets and currencies", () => {
  it("refuses a lower-case currency code", async () => {
    const c = await rejects(
      `INSERT INTO currencies (code, name, symbol, minor_unit, is_active, created_at, updated_at)
       VALUES ('gbp', 'Pound', '£', 2, true, now(), now())`,
    );
    expect(c).toContain("chk_currencies_code_upper");
  });

  it("refuses an unknown incoterm", async () => {
    const c = await rejects(`UPDATE markets SET incoterm = 'EXW' WHERE code = 'US'`);
    expect(c).toContain("chk_markets_incoterm");
  });
});

describe("settings — (key, market_code) NULLS NOT DISTINCT", () => {
  it("refuses a second GLOBAL row for the same key", async () => {
    // Without NULLS NOT DISTINCT, two global rows for one key are insertable and
    // whichever the query happens to return wins.
    const c = await rejects(`
      INSERT INTO settings (id, key, market_code, value, value_type, group_key, label, is_secret, created_at, updated_at)
      VALUES (gen_random_uuid(), 'audit.retention_days', NULL, 'null'::jsonb, 'number', 'retention', 'dup', false, now(), now())
    `);
    expect(c).toContain("uq_settings_key_market");
  });

  it("ALLOWS the same key for two different markets", async () => {
    await ready;
    const { rows } = await client.query(
      `SELECT count(*)::int AS n FROM settings WHERE key = 'security.high_value_review_threshold'`,
    );
    expect(rows[0].n).toBe(2);
  });
});

describe("import jobs — a price import must name its market", () => {
  it("refuses resource='prices' with no market or currency", async () => {
    // Otherwise the importer has to guess which market's price column it is writing, and
    // there is no defensible guess (hard rule 2).
    const c = await rejects(`
      INSERT INTO import_jobs (id, resource, mode, file_name, mapping, is_dry_run, status,
                               total_rows, valid_rows, invalid_rows, applied_rows, created_at, updated_at)
      VALUES (gen_random_uuid(), 'prices', 'upsert', 'p.csv', '{}'::jsonb, true, 'queued', 0,0,0,0, now(), now())
    `);
    expect(c).toContain("chk_import_jobs_price_market");
  });

  it("refuses an unknown resource", async () => {
    const c = await rejects(`
      INSERT INTO import_jobs (id, resource, mode, file_name, mapping, is_dry_run, status,
                               total_rows, valid_rows, invalid_rows, applied_rows, created_at, updated_at)
      VALUES (gen_random_uuid(), 'invoices', 'upsert', 'p.csv', '{}'::jsonb, true, 'queued', 0,0,0,0, now(), now())
    `);
    expect(c).toContain("chk_import_jobs_resource");
  });
});

describe("analytics — the public writer cannot lie about revenue", () => {
  it("refuses revenue with no currency", async () => {
    const c = await rejects(`
      INSERT INTO analytics_events (id, event_name, occurred_at, market_code, revenue_minor, properties, created_at)
      VALUES (gen_random_uuid(), 'purchase', now(), 'US', 1000, '{}'::jsonb, now())
    `);
    expect(c).toContain("chk_analytics_currency");
  });

  it("refuses an event backdated outside the sane window", async () => {
    // occurred_at is client-supplied; clamping stops a browser backdating events into a
    // closed reporting period.
    const c = await rejects(`
      INSERT INTO analytics_events (id, event_name, occurred_at, market_code, properties, created_at)
      VALUES (gen_random_uuid(), 'view_item', now() - interval '3 days', 'US', '{}'::jsonb, now())
    `);
    expect(c).toContain("chk_analytics_occurred_sane");
  });
});

describe("jobs — singleton and dedupe", () => {
  it("refuses a second queued sitemap_rebuild", async () => {
    await ready;
    await client.query("BEGIN");
    try {
      const ins = `INSERT INTO jobs (id, kind, status, payload, priority, attempts, max_attempts, run_after, created_at, updated_at)
                   VALUES (gen_random_uuid(), 'sitemap_rebuild', 'queued', '{}'::jsonb, 100, 0, 3, now(), now(), now())`;
      await client.query(ins);
      let constraint = "";
      try {
        await client.query(ins);
      } catch (e) {
        constraint = (e as { constraint?: string }).constraint ?? "";
      }
      expect(constraint).toContain("idx_jobs_singleton");
    } finally {
      await client.query("ROLLBACK");
    }
  });

  it("ALLOWS two feed_rebuilds with different dedupe keys — per-market is legal", async () => {
    await ready;
    await client.query("BEGIN");
    try {
      for (const key of ["market:US", "market:IN"]) {
        await client.query(
          `INSERT INTO jobs (id, kind, status, payload, priority, attempts, max_attempts, run_after, dedupe_key, created_at, updated_at)
           VALUES (gen_random_uuid(), 'feed_rebuild', 'queued', '{}'::jsonb, 100, 0, 3, now(), $1, now(), now())`,
          [key],
        );
      }
      const { rows } = await client.query(
        `SELECT count(*)::int AS n FROM jobs WHERE kind = 'feed_rebuild' AND status = 'queued'`,
      );
      expect(rows[0].n).toBe(2);
    } finally {
      await client.query("ROLLBACK");
    }
  });
});
