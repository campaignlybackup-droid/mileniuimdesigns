import { afterAll, describe, expect, it } from "vitest";
import { Client } from "pg";

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
 * ADD TO THIS LIST whenever you hand-write a constraint or index.
 */
const url = process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"]!;
const client = new Client({ connectionString: url });
const ready = client.connect();
afterAll(async () => { await client.end(); });

/** Indexes Prisma cannot express: partial, expression, NULLS NOT DISTINCT, GIN, BRIN. */
const HANDWRITTEN_INDEXES = [
  // Schema I — identity, settings, operations
  "idx_users_email_live", "idx_users_active", "idx_sessions_expiry", "idx_sessions_customer",
  "idx_sessions_user", "idx_otp_expiry", "idx_customers_email", "idx_customers_group",
  "idx_customers_search", "idx_newsletter_email", "idx_newsletter_sendable",
  "idx_inventory_locations_code", "uq_settings_key_market", "uq_email_templates",
  "idx_email_logs_order_partial", "idx_saved_views_name", "idx_saved_views_default",
  "idx_jobs_claim", "idx_jobs_stuck", "idx_jobs_singleton", "uq_jobs_dedupe",
  "idx_search_no_results", "idx_analytics_occurred_brin",
  // Schema II — catalogue
  "idx_categories_slug_live", "idx_products_slug_live", "idx_stones_slug_live",
  "idx_materials_slug_live", "idx_collections_slug_live", "idx_variants_sku_live",
  "idx_attributes_key_live", "idx_categories_parent_rank", "idx_categories_path",
  "idx_products_published", "idx_products_title_trgm", "idx_products_ooak",
  "idx_products_completeness", "idx_products_sold", "idx_products_updated",
  "idx_products_search_vector", "idx_variants_product", "idx_variants_ooak_single",
  "idx_variants_option_signature", "idx_variants_sku_prefix", "uq_product_options",
  "uq_option_values", "idx_product_stones_primary", "idx_variant_materials_primary",
  "idx_product_categories_primary", "idx_product_categories_rank",
  "idx_product_collections_rank", "uq_attribute_options", "idx_pav_unique",
  "idx_pav_filter", "idx_pav_numeric", "idx_pav_product", "idx_media_public_id",
  "idx_media_checksum", "idx_media_folder", "idx_media_search_trgm",
  "idx_media_missing_alt", "uq_media_folders_name", "uq_product_media",
  "idx_product_media_hero", "idx_pmc_market_published", "idx_pms_price", "idx_pms_units",
  "idx_curated_facets_active", "idx_curated_facets_auto", "uq_seo_metadata_entity",
  "uq_redirects_from",
] as const;

/** CHECK and UNIQUE constraints written by hand. */
const HANDWRITTEN_CONSTRAINTS = [
  // Schema I
  "chk_currencies_code_upper", "chk_markets_code_upper", "chk_markets_incoterm",
  "chk_markets_country_upper", "chk_users_totp_pair", "chk_sessions_one_principal",
  "chk_sessions_impersonation", "chk_cct_nonneg", "chk_newsletter_status",
  "chk_import_jobs_resource", "chk_import_jobs_price_market", "chk_analytics_currency",
  "chk_analytics_occurred_sane",
  // Schema II
  "chk_categories_not_self_parent", "chk_categories_sku_token_upper", "uq_products_id_ooak",
  "uq_variants_id_ooak", "chk_variant_materials_weight", "chk_materials_purity",
  "chk_attributes_scope", "chk_attributes_filterable_type", "chk_attributes_range",
  "chk_attributes_decimal_places", "chk_attributes_max_length", "chk_pav_one_value",
  "chk_collections_window", "chk_collections_rule_match", "chk_collections_sort_order",
  "chk_product_collections_source", "chk_collection_rules_value",
  "chk_collection_rules_price_market", "chk_pms_amounts", "fk_pms_market",
  "chk_curated_facets_target", "chk_redirects_not_self", "chk_redirects_status",
  "chk_redirects_paths",
  // P08
  "chk_stones_sku_token_upper", "chk_materials_sku_token_upper",
] as const;

/** Triggers and generated columns. */
const HANDWRITTEN_TRIGGERS = ["trg_audit_logs_no_update", "trg_audit_logs_no_delete"] as const;

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

  it("the manifest is not empty and has no duplicates", () => {
    // A manifest that silently emptied would pass every assertion above.
    expect(HANDWRITTEN_INDEXES.length).toBeGreaterThan(60);
    expect(new Set(HANDWRITTEN_INDEXES).size).toBe(HANDWRITTEN_INDEXES.length);
    expect(new Set(HANDWRITTEN_CONSTRAINTS).size).toBe(HANDWRITTEN_CONSTRAINTS.length);
  });
});
