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

// ═══════════════════════════════════════════════════════════════════════════════════
// Schema II — the catalogue (09 P05 exit criterion (b))
// ═══════════════════════════════════════════════════════════════════════════════════

describe("one-of-a-kind cannot be sold twice by construction", () => {
  it("refuses a SECOND variant on a one-of-a-kind product", async () => {
    // idx_variants_ooak_single. Without it, "quantity 1" is meaningless: two variants
    // each holding one unit make the piece sellable twice with every count looking right.
    await ready;
    await client.query("BEGIN");
    try {
      const { rows } = await client.query<{ id: string }>(`
        INSERT INTO products (id, slug, title, status, is_one_of_a_kind, is_made_to_order,
                              rank, search_text, completeness_score, completeness_checks,
                              seo_score, seo_checks, ooak_quantity_override, version,
                              created_at, updated_at)
        VALUES (gen_random_uuid(), 'probe-ooak', 'Probe', 'draft', true, false, 0, '',
                0, '{}'::jsonb, 0, '{}'::jsonb, false, 1, now(), now())
        RETURNING id`);
      const productId = rows[0]!.id;

      const insertVariant = (sku: string) => client.query(
        `INSERT INTO product_variants (id, product_id, is_one_of_a_kind, sku, position,
                                       inventory_policy, option_signature, is_active,
                                       version, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, true, $2, 0, 'tracked', '', true, 1, now(), now())`,
        [productId, sku]);

      await insertVariant("PROBE-OOAK-1");
      let constraint = "";
      try {
        await insertVariant("PROBE-OOAK-2");
      } catch (e) {
        constraint = (e as { constraint?: string }).constraint ?? "";
      }
      expect(constraint).toContain("idx_variants_ooak_single");
    } finally {
      await client.query("ROLLBACK");
    }
  });
});

describe("attribute values carry exactly one value", () => {
  it("refuses a row with both a number and a string", async () => {
    // chk_pav_one_value. Without it the reader picks whichever column it looks at first,
    // and one product shows two different carat weights on two screens.
    const c = await rejects(`
      INSERT INTO product_attribute_values
        (id, product_id, attribute_id, value_text, value_numeric, created_at, updated_at)
      VALUES (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'two', 2, now(), now())
    `);
    expect(c).toContain("chk_pav_one_value");
  });

  it("refuses a row with NO value at all", async () => {
    const c = await rejects(`
      INSERT INTO product_attribute_values (id, product_id, attribute_id, created_at, updated_at)
      VALUES (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), now(), now())
    `);
    expect(c).toContain("chk_pav_one_value");
  });
});

describe("collection rules cannot compare across currencies", () => {
  it("refuses a price rule with no market", async () => {
    // $400 tested against ₹40,000 is not a comparison (hard rule 2).
    const c = await rejects(`
      INSERT INTO collection_rules (id, collection_id, field, operator, value_numeric, position, created_at)
      VALUES (gen_random_uuid(), gen_random_uuid(), 'price', 'gt', 40000, 0, now())
    `);
    expect(c).toContain("chk_collection_rules_price_market");
  });

  it("refuses the misspelling `bestselling`", async () => {
    // 11 §7.9: the value is `best_selling`. Two spellings in two documents is how a sort
    // silently falls through to its default.
    //
    // The INSERT matters: an UPDATE against an empty table affects zero rows and raises
    // nothing, so the first version of this test passed while proving nothing. A
    // constraint test must produce a row for the constraint to reject.
    const c = await rejects(`
      INSERT INTO collections (id, slug, title, mode, rule_match, sort_order, is_published,
                               requires_sale_in_market, rank, version, created_at, updated_at)
      VALUES (gen_random_uuid(), 'probe-sort', 'Probe', 'automatic', 'all', 'bestselling',
              false, false, 0, 1, now(), now())
    `);
    expect(c).toContain("chk_collections_sort_order");
  });

  it("ACCEPTS the correct spelling `best_selling`", async () => {
    // The converse. Without it, a constraint that rejects everything would also pass.
    const c = await rejects(`
      INSERT INTO collections (id, slug, title, mode, rule_match, sort_order, is_published,
                               requires_sale_in_market, rank, version, created_at, updated_at)
      VALUES (gen_random_uuid(), 'probe-sort-ok', 'Probe', 'automatic', 'all', 'best_selling',
              false, false, 0, 1, now(), now())
    `);
    expect(c).toBe("");
  });
});

describe("materials and weights", () => {
  it("refuses a purity ratio above 1", async () => {
    const c = await rejects(`UPDATE materials SET purity_ratio = 1.5 WHERE slug = '14k-yellow-gold'`);
    expect(c).toContain("chk_materials_purity");
  });

  it("refuses a zero-weight metal component", async () => {
    // A zero weight would price the piece at its making charge alone.
    const c = await rejects(`
      INSERT INTO variant_materials (variant_id, material_id, weight_grams, is_primary, created_at)
      VALUES (gen_random_uuid(), (SELECT id FROM materials LIMIT 1), 0, true, now())
    `);
    expect(c).toContain("chk_variant_materials_weight");
  });
});

describe("redirects cannot point at themselves", () => {
  it("refuses a self-redirect", async () => {
    const c = await rejects(`
      INSERT INTO redirects (id, from_path, to_path, status_code, is_active, hit_count, created_at, updated_at)
      VALUES (gen_random_uuid(), '/rings/x', '/rings/x', 301, true, 0, now(), now())
    `);
    expect(c).toContain("chk_redirects_not_self");
  });

  it("refuses a non-path target", async () => {
    const c = await rejects(`
      INSERT INTO redirects (id, from_path, to_path, status_code, is_active, hit_count, created_at, updated_at)
      VALUES (gen_random_uuid(), '/rings/x', 'https://evil.test/x', 301, true, 0, now(), now())
    `);
    expect(c).toContain("chk_redirects_paths");
  });
});

describe("the search vector is generated, not written", () => {
  it("is populated by the database from the title", async () => {
    await ready;
    await client.query("BEGIN");
    try {
      await client.query(`
        INSERT INTO products (id, slug, title, status, is_one_of_a_kind, is_made_to_order,
                              rank, search_text, completeness_score, completeness_checks,
                              seo_score, seo_checks, ooak_quantity_override, version,
                              created_at, updated_at)
        VALUES (gen_random_uuid(), 'probe-sv', 'Labradorite Drop Earrings', 'draft', false,
                false, 0, 'labradorite silver', 0, '{}'::jsonb, 0, '{}'::jsonb, false, 1, now(), now())`);
      const { rows } = await client.query<{ hit: boolean }>(`
        SELECT search_vector @@ to_tsquery('simple', 'labradorite') AS hit
        FROM products WHERE slug = 'probe-sv'`);
      expect(rows[0]!.hit).toBe(true);
    } finally {
      await client.query("ROLLBACK");
    }
  });

  it("cannot be written directly — the database owns it", async () => {
    const c = await rejects(`UPDATE products SET search_vector = to_tsvector('simple','x')`);
    expect(c.length).toBeGreaterThan(0);
  });
});
