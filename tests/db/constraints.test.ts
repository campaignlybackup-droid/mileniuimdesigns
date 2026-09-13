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

/**
 * Run a SEQUENCE of statements in a transaction that always rolls back, stopping at the first
 * failure and returning its constraint name.
 *
 * One statement per `query()` call, deliberately. A multi-statement string goes over the
 * simple query protocol as one batch, so when statement 2 fails, statements 3+ still execute
 * and Postgres answers "current transaction is aborted, commands ignored until end of
 * transaction block". The local `prisma dev` server does not merely error on that — its
 * pglite WASM engine CRASHES, taking the database down for every other test file in the run.
 * Stopping at the first failure means no statement is ever sent into an aborted transaction.
 */
async function rejectsAll(statements: string[]): Promise<string> {
  await ready;
  await client.query("BEGIN");
  try {
    for (const s of statements) await client.query(s);
    await client.query("ROLLBACK");
    return "";
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* the transaction is already aborted; the rollback is what un-aborts it */
    }
    return (e as { constraint?: string; message: string }).constraint ?? (e as Error).message;
  }
}

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

      const insertVariant = (sku: string) =>
        client.query(
          `INSERT INTO product_variants (id, product_id, is_one_of_a_kind, sku, position,
                                       inventory_policy, option_signature, is_active,
                                       version, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, true, $2, 0, 'tracked', '', true, 1, now(), now())`,
          [productId, sku],
        );

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
    const c = await rejects(
      `UPDATE materials SET purity_ratio = 1.5 WHERE slug = '14k-yellow-gold'`,
    );
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

// ── Schema III — pricing. 09 P10 exit criteria (a)–(d). ─────────────────────────────

/**
 * Every price probe needs a real product, variant and market, and none of them may survive
 * the test. `rejectsAll()` already rolls back, so the fixture is created INSIDE the same
 * transaction as the row under test — which also means each assertion is proving the
 * constraint and not the absence of a foreign key target.
 */
const PRICE_FIXTURE = [
  `INSERT INTO products (id, slug, title, status, rank, search_text, version, created_at, updated_at)
   VALUES ('11111111-1111-7111-8111-111111111111'::uuid, 'zz-p10-probe', 'ZZ P10 PROBE',
           'draft', 0, '', 1, now(), now())`,
  `INSERT INTO product_variants (id, product_id, sku, position, inventory_policy,
                                 option_signature, is_active, version, created_at, updated_at)
   VALUES ('22222222-2222-7222-8222-222222222222'::uuid,
           '11111111-1111-7111-8111-111111111111'::uuid, 'MD-ZZP-ZZP-PR01-NA', 0, 'tracked',
           '', true, 1, now(), now())`,
];

/** A manual price row, parameterised where the tests need to vary it. */
function priceRow(opts: { market: string; currency: string; variant?: string | null }): string {
  const variant =
    opts.variant === null
      ? "NULL"
      : `'${opts.variant ?? "22222222-2222-7222-8222-222222222222"}'::uuid`;
  return `
    INSERT INTO prices (id, product_id, variant_id, market_code, currency_code, list_minor,
                        price_source, valid_from, created_at)
    VALUES (gen_random_uuid(), '11111111-1111-7111-8111-111111111111'::uuid, ${variant},
            '${opts.market}', '${opts.currency}', 18900, 'manual', now(), now())
  `;
}

describe("P10 (a) — one live price per variant per market", () => {
  it("refuses a second active row for the same (variant, market)", async () => {
    const c = await rejectsAll([
      ...PRICE_FIXTURE,
      priceRow({ market: "US", currency: "USD" }),
      priceRow({ market: "US", currency: "USD" }),
    ]);
    // Without this, "the current price" is a most-recent-wins ORDER BY that two concurrent
    // writers can disagree about, and the losing row stays live forever with no error.
    expect(c).toContain("idx_prices_active");
  });

  it("allows the same variant to be priced in a DIFFERENT market", async () => {
    // The converse. A unique index over (variant) alone would pass the test above while
    // making the whole multi-market model impossible, so this is the assertion that says
    // which index is actually there.
    const c = await rejectsAll([
      ...PRICE_FIXTURE,
      priceRow({ market: "US", currency: "USD" }),
      priceRow({ market: "IN", currency: "INR" }),
    ]);
    expect(c).toBe("");
  });

  it("allows a superseded row to coexist with the live one", async () => {
    const c = await rejectsAll([
      ...PRICE_FIXTURE,
      priceRow({ market: "US", currency: "USD" }),
      `UPDATE prices SET valid_to = now() + interval '1 second' WHERE market_code = 'US'`,
      priceRow({ market: "US", currency: "USD" }),
    ]);
    expect(c).toBe("");
  });
});

describe("P10 (b) — a price cannot claim a currency its market does not use", () => {
  it("refuses USD in the India market", async () => {
    const c = await rejectsAll([...PRICE_FIXTURE, priceRow({ market: "IN", currency: "USD" })]);
    expect(c.length).toBeGreaterThan(0);
    expect(c).not.toContain("idx_prices_active");
  });

  it("refuses INR in the US market", async () => {
    const c = await rejectsAll([...PRICE_FIXTURE, priceRow({ market: "US", currency: "INR" })]);
    expect(c.length).toBeGreaterThan(0);
  });

  it("accepts each market's own currency", async () => {
    expect(
      await rejectsAll([...PRICE_FIXTURE, priceRow({ market: "US", currency: "USD" })]),
    ).toBe("");
    expect(
      await rejectsAll([...PRICE_FIXTURE, priceRow({ market: "IN", currency: "INR" })]),
    ).toBe("");
  });
});

describe("P10 — a product-level price is always manual", () => {
  it("refuses a product-level metal_linked row", async () => {
    // Weight lives on variant_materials and recalc_run_lines.variant_id is NOT NULL, so a
    // product-level formula price is not representable as a preview line at all: it would
    // claim to be metal-linked and then never move, with no error anywhere.
    const c = await rejectsAll([
      ...PRICE_FIXTURE,
      `INSERT INTO prices (id, product_id, variant_id, market_code, currency_code, list_minor,
                           price_source, valid_from, created_at)
       VALUES (gen_random_uuid(), '11111111-1111-7111-8111-111111111111'::uuid, NULL,
               'US', 'USD', 18900, 'metal_linked', now(), now())`,
    ]);
    expect(c).toContain("chk_prices_");
  });

  it("accepts a product-level manual row", async () => {
    expect(
      await rejectsAll([
        ...PRICE_FIXTURE,
        priceRow({ market: "US", currency: "USD", variant: null }),
      ]),
    ).toBe("");
  });
});

describe("P10 — the arithmetic identities refuse a price that does not add up", () => {
  // Data-modifying CTEs, not LATERAL subqueries: an INSERT is not legal in a FROM clause.
  const computed = (opts: { base: bigint; list: bigint }) => `
    WITH m AS (SELECT id FROM materials WHERE deleted_at IS NULL ORDER BY rank LIMIT 1),
    r AS (
      INSERT INTO metal_rates (id, material_id, currency_code, rate_minor_per_gram, rate_scale,
                               effective_at, source, created_at)
      SELECT gen_random_uuid(), m.id, 'USD', 5000, 4, now(), 'zz-p10-probe', now() FROM m
      RETURNING id, material_id
    ),
    f AS (
      INSERT INTO pricing_formulas (id, name, slug, is_active, version, created_at, updated_at)
      VALUES (gen_random_uuid(), 'ZZ P10', 'zz-p10-probe', true, 1, now(), now())
      RETURNING id
    ),
    v AS (
      INSERT INTO pricing_formula_versions (id, formula_id, version_no, purity_source,
                                            weight_source, making_charge_mode, markup_mode,
                                            include_stone_cost, include_other_material_cost,
                                            created_at)
      SELECT gen_random_uuid(), f.id, 1, 'material', 'variant_primary', 'none', 'none',
             true, true, now() FROM f
      RETURNING id
    )
    INSERT INTO prices (id, product_id, variant_id, market_code, currency_code, list_minor,
                        price_source, valid_from, created_at,
                        material_id, metal_rate_id, metal_weight_grams, formula_version_id,
                        metal_component_minor, making_charge_computed_minor,
                        stone_cost_minor, other_material_cost_minor, markup_minor,
                        market_adjustment_delta_minor, floor_adjustment_minor,
                        computed_base_minor, rounding_adjustment_minor)
    SELECT gen_random_uuid(), '11111111-1111-7111-8111-111111111111'::uuid,
           '22222222-2222-7222-8222-222222222222'::uuid, 'US', 'USD', ${String(opts.list)},
           'metal_linked', now(), now(),
           r.material_id, r.id, 3.500, v.id,
           10000, 5000, 0, 0, 0, 0, 0, ${String(opts.base)}, 0
    FROM r CROSS JOIN v
  `;

  it("accepts a row whose components sum to the base and whose base reaches the list", async () => {
    expect(await rejectsAll([...PRICE_FIXTURE, computed({ base: 15000n, list: 15000n })])).toBe(
      "",
    );
  });

  it("refuses a base that is not the sum of its components", async () => {
    // 10000 + 5000 is 15000, not 15001. A rounding bug in evaluateFormula fails the INSERT
    // instead of shipping a plausible wrong number to a shopper.
    const c = await rejectsAll([...PRICE_FIXTURE, computed({ base: 15001n, list: 15001n })]);
    expect(c).toContain("chk_prices_components_sum");
  });

  it("refuses a list that is not the base plus its adjustments", async () => {
    const c = await rejectsAll([...PRICE_FIXTURE, computed({ base: 15000n, list: 15900n })]);
    expect(c).toContain("chk_prices_list_identity");
  });
});

describe("P10 — a recalc run cannot reach an applying state without a named approver", () => {
  const run = (status: string, approver: string) => `
    INSERT INTO recalc_runs (id, status, triggered_by, line_count, skipped_count, failed_count,
                             total_increase_minor, total_decrease_minor, created_at, updated_at,
                             approved_by_user_id)
    VALUES (gen_random_uuid(), '${status}', 'system', 0, 0, 0, 0, 0, now(), now(), ${approver})
  `;

  it("refuses approved with no approver", async () => {
    // R03's floor. The cron that reads metal rates produces previewing → pending_approval and
    // has no path beyond it; this is what makes that a property of the schema, not of a code
    // path someone could add an edge to.
    expect(await rejectsAll([run("approved", "NULL")])).toContain("chk_recalc_approved");
    expect(await rejectsAll([run("applying", "NULL")])).toContain("chk_recalc_approved");
    expect(await rejectsAll([run("applied", "NULL")])).toContain("chk_recalc_approved");
  });

  it("refuses an approver on a run that has not been approved", async () => {
    const c = await rejectsAll([
      `INSERT INTO users (id, email, password_hash, first_name, last_name, is_active,
                          totp_recovery_codes, password_changed_at, created_at, updated_at)
       VALUES ('33333333-3333-7333-8333-333333333333'::uuid, 'zz-p10@example.invalid', 'x',
               'ZZ', 'PROBE', true, ARRAY[]::text[], now(), now(), now())`,
      run("previewing", "'33333333-3333-7333-8333-333333333333'::uuid"),
    ]);
    expect(c).toContain("chk_recalc_approved");
  });

  it("accepts pending_approval with no approver", async () => {
    expect(await rejectsAll([run("pending_approval", "NULL")])).toBe("");
  });
});

describe("P10 — pricing_formula_versions carries no money at all", () => {
  it("has not one BIGINT column, which is hard rule 2 expressed in the schema", async () => {
    // The structural expression of "USD and INR prices are INDEPENDENT". A single amount on
    // this table would feed both markets from one number, and no CHECK anywhere else in the
    // schema would notice. `fixed_weight_milligrams` is the one BIGINT the design permits —
    // milligrams are not money — so it is named rather than excluded by a pattern.
    await ready;
    const { rows } = await client.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'pricing_formula_versions' AND data_type = 'bigint'`,
    );
    expect(rows.map((r) => r.column_name).sort()).toEqual(["fixed_weight_milligrams"]);
  });

  it("and every currency-denominated term lives on the market-terms child instead", async () => {
    await ready;
    const { rows } = await client.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM information_schema.columns
        WHERE table_name = 'pricing_formula_market_terms' AND column_name LIKE '%_minor'`,
    );
    expect(rows[0]!.n).toBeGreaterThanOrEqual(5);
  });
});

describe("P10 — a binding cannot name one variant and another variant's product", () => {
  it("refuses a mismatched (variant_id, product_id) pair", async () => {
    const c = await rejectsAll([
      ...PRICE_FIXTURE,
      `INSERT INTO products (id, slug, title, status, rank, search_text, version, created_at, updated_at)
       VALUES ('44444444-4444-7444-8444-444444444444'::uuid, 'zz-p10-other', 'ZZ P10 OTHER',
               'draft', 0, '', 1, now(), now())`,
      `INSERT INTO pricing_formulas (id, name, slug, is_active, version, created_at, updated_at)
       VALUES ('55555555-5555-7555-8555-555555555555'::uuid, 'ZZ', 'zz-p10-b', true, 1, now(), now())`,
      `INSERT INTO price_formula_bindings (id, product_id, variant_id, market_code, currency_code,
                                           formula_id, mode, is_active, version, created_at, updated_at)
       VALUES (gen_random_uuid(), '44444444-4444-7444-8444-444444444444'::uuid,
               '22222222-2222-7222-8222-222222222222'::uuid, 'US', 'USD',
               '55555555-5555-7555-8555-555555555555'::uuid, 'metal_linked', true, 1, now(), now())`,
    ]);
    // Without the composite FK the recalc scope filter silently includes or excludes the
    // wrong variants and nothing anywhere complains.
    expect(c).toContain("fk_pfb_variant_product");
  });
});
