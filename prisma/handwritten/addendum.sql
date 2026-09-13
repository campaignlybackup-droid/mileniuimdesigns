-- ═══════════════════════════════════════════════════════════════════════════════════
-- THE HAND-WRITTEN ADDENDUM — every database object Prisma cannot express.
--
-- THIS FILE IS IDEMPOTENT AND IS RE-APPLIED AFTER EVERY MIGRATION.
--
-- Why it exists as a separate, re-runnable file rather than living only inside the
-- migrations that created it:
--
--   `prisma migrate dev` diffs the DATABASE against the PRISMA SCHEMA. Anything in the
--   database the schema does not describe reads as drift, so the generated migration
--   DROPS it. Every object here is hand-written precisely BECAUSE Prisma cannot express
--   it — partial indexes, expression indexes, NULLS NOT DISTINCT, GIN, BRIN, CHECK
--   constraints, composite foreign keys, triggers, generated columns.
--
--   This was not theoretical. Generating the Schema II migration dropped three of them.
--   Generating a migration that added ONE TABLE proposed dropping FOURTEEN, including the
--   composite FK that stops a row claiming a currency its market does not use.
--
-- The workflow is therefore:  prisma migrate deploy  &&  npm run db:addendum
-- and `scripts/guard-migration.ts` refuses a generated migration that drops anything
-- named here.
-- ═══════════════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════════════
-- HAND-WRITTEN ADDENDUM
--
-- Everything below is a constraint or index Prisma cannot express. These are not
-- workarounds — 01 §1.2 names them as the designed escape hatches. Without them the
-- schema is documentation: a CHECK that lives only in a comment is not a CHECK, and a
-- unique index that is not partial rejects rows it should accept.
-- ═══════════════════════════════════════════════════════════════════════════════════

-- ── Currency and market invariants (02 §7.2) ──────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE "currencies" ADD CONSTRAINT "chk_currencies_code_upper" CHECK (code = upper(code));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "markets" ADD CONSTRAINT "chk_markets_code_upper" CHECK (code = upper(code));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "markets" ADD CONSTRAINT "chk_markets_incoterm" CHECK (incoterm IN ('DDP','DAP'));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "markets" ADD CONSTRAINT "chk_markets_country_upper" CHECK (country_code = upper(country_code));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

-- ── Users ─────────────────────────────────────────────────────────────────────────
-- A TOTP secret without an enrolment timestamp (or the reverse) is a half-enrolled
-- account: the privilege-line check reads one field and the recovery path reads the
-- other, so the pair must move together.
DO $$ BEGIN
  ALTER TABLE "users" ADD CONSTRAINT "chk_users_totp_pair" CHECK ((totp_secret_encrypted IS NULL) = (totp_enrolled_at IS NULL));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

-- Email uniqueness applies to LIVE users only. A soft-deleted user must not block
-- re-hiring the same person, and lower() makes it case-insensitive without relying on
-- every call site remembering to normalise.
DROP INDEX IF EXISTS "users_email_key";
CREATE UNIQUE INDEX IF NOT EXISTS "idx_users_email_live" ON "users" (lower(email))
  WHERE deleted_at IS NULL;

DROP INDEX IF EXISTS "idx_users_active";
CREATE INDEX IF NOT EXISTS "idx_users_active" ON "users" (is_active, last_name)
  WHERE deleted_at IS NULL;

-- ── Sessions: exactly one principal (02 §7.3) ─────────────────────────────────────
-- THE load-bearing constraint of the auth model. A session carrying both a staff user
-- and a customer is a confused deputy waiting to happen: whichever resolver runs first
-- decides whether the request prices as a shopper or acts as an admin.
DO $$ BEGIN
  ALTER TABLE "sessions" ADD CONSTRAINT "chk_sessions_one_principal" CHECK ((user_id IS NOT NULL)::int + (customer_id IS NOT NULL)::int = 1);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

-- Impersonation is a STAFF member acting as a CUSTOMER. An impersonator on a
-- staff-principal session is meaningless and would defeat the dual-actor audit.
DO $$ BEGIN
  ALTER TABLE "sessions" ADD CONSTRAINT "chk_sessions_impersonation" CHECK (impersonator_user_id IS NULL OR customer_id IS NOT NULL);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "idx_sessions_expiry" ON "sessions" (expires_at) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS "idx_sessions_customer" ON "sessions" (customer_id, created_at DESC)
  WHERE customer_id IS NOT NULL;
-- Without this, revokeAllForUser() scans every customer session in the database (07 §1.3).
CREATE INDEX IF NOT EXISTS "idx_sessions_user" ON "sessions" (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

-- ── OTP ───────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "idx_otp_expiry" ON "otp_requests" (expires_at) WHERE consumed_at IS NULL;

-- ── Customers ─────────────────────────────────────────────────────────────────────
-- Uniqueness applies to non-anonymised rows: an erasure request must not permanently
-- burn the address for anyone who later shops under it.
DROP INDEX IF EXISTS "customers_email_key";
CREATE UNIQUE INDEX IF NOT EXISTS "idx_customers_email" ON "customers" (lower(email))
  WHERE anonymized_at IS NULL;

DROP INDEX IF EXISTS "idx_customers_group";
CREATE INDEX IF NOT EXISTS "idx_customers_group" ON "customers" (customer_group_id)
  WHERE anonymized_at IS NULL;

-- Admin customer search. GIN over a name+email tsvector: 'simple' rather than 'english'
-- because stemming a proper noun is wrong (02 §7.4).
CREATE INDEX IF NOT EXISTS "idx_customers_search" ON "customers"
  USING GIN (to_tsvector('simple',
    coalesce(first_name,'') || ' ' || coalesce(last_name,'') || ' ' || email));

DO $$ BEGIN
  ALTER TABLE "customer_currency_totals" ADD CONSTRAINT "chk_cct_nonneg" CHECK (total_spent_minor >= 0 AND total_refunded_minor >= 0 AND orders_count >= 0);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

-- ── Newsletter ────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE "newsletter_subscribers" ADD CONSTRAINT "chk_newsletter_status" CHECK (status IN ('pending','subscribed','unsubscribed','bounced'));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "idx_newsletter_email" ON "newsletter_subscribers" (lower(email));
CREATE INDEX IF NOT EXISTS "idx_newsletter_sendable" ON "newsletter_subscribers" (market_code)
  WHERE status = 'subscribed';

-- ── Inventory locations ───────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS "idx_inventory_locations_code" ON "inventory_locations" (code)
  WHERE deleted_at IS NULL;

-- ── Settings: the real identity (02 §7.11) ────────────────────────────────────────
-- NULLS NOT DISTINCT is what makes a market_code of NULL mean "the global row" and
-- collide with itself. Without it, two global rows for one key are insertable and
-- whichever the query happens to return wins.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_settings_key_market" ON "settings" (key, market_code)
  NULLS NOT DISTINCT;

-- ── Email templates ───────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS "uq_email_templates" ON "email_templates" (key, market_code)
  NULLS NOT DISTINCT;
-- No button with no destination, and no destination with no button (06 §12.3).
DO $$ BEGIN
  ALTER TABLE "email_templates" ADD CONSTRAINT "chk_email_templates_cta" CHECK ((cta_label IS NULL) = (cta_url_template IS NULL));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "idx_email_logs_order_partial" ON "email_logs" (order_id)
  WHERE order_id IS NOT NULL;

-- ── Saved views ───────────────────────────────────────────────────────────────────
-- The coalesce is what lets one row mean "the shared view" (owner NULL) and another
-- "this user's view", under one unique index.
CREATE UNIQUE INDEX IF NOT EXISTS "idx_saved_views_name" ON "saved_views"
  (resource, coalesce(owner_user_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));
CREATE UNIQUE INDEX IF NOT EXISTS "idx_saved_views_default" ON "saved_views"
  (resource, coalesce(owner_user_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE is_default;

-- ── Jobs ──────────────────────────────────────────────────────────────────────────
DROP INDEX IF EXISTS "idx_jobs_claim";
CREATE INDEX IF NOT EXISTS "idx_jobs_claim" ON "jobs" (priority, run_after) WHERE status = 'queued';
DROP INDEX IF EXISTS "idx_jobs_stuck";
CREATE INDEX IF NOT EXISTS "idx_jobs_stuck" ON "jobs" (locked_at) WHERE status = 'running';

-- One in flight at a time, for the kinds where a second concurrent run would interleave
-- over the same source table.
CREATE UNIQUE INDEX IF NOT EXISTS "idx_jobs_singleton" ON "jobs" (kind)
  WHERE status IN ('queued','running')
    AND kind IN ('sitemap_rebuild','collection_refresh','reindex_search','media_orphan_scan',
                 'product_metrics_refresh','consistency_check','reconcile_inventory','audit_archive');

-- The per-entity and per-market form the singleton index cannot express: two
-- feed_rebuilds for different markets are fine, two for the same market are not.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_jobs_dedupe" ON "jobs" (kind, dedupe_key)
  WHERE dedupe_key IS NOT NULL AND status IN ('queued','running');

-- ── Import jobs ───────────────────────────────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE "import_jobs" ADD CONSTRAINT "chk_import_jobs_resource" CHECK (resource IN ('products','variants','prices','inventory','customers','redirects'));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
-- A price import without a market and currency would have to guess which market's price
-- column it is writing. There is no defensible guess (hard rule 2).
DO $$ BEGIN
  ALTER TABLE "import_jobs" ADD CONSTRAINT "chk_import_jobs_price_market" CHECK (resource <> 'prices' OR (market_code IS NOT NULL AND currency_code IS NOT NULL));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

-- ── Search ────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "idx_search_no_results" ON "search_queries"
  (market_code, normalized_query, created_at DESC) WHERE result_count = 0;

-- ── Analytics ─────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE "analytics_events" ADD CONSTRAINT "chk_analytics_currency" CHECK (revenue_minor IS NULL OR currency_code IS NOT NULL);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
-- occurred_at is client-supplied. Clamping it to a sane window around the server's own
-- clock stops a browser backdating events into a closed reporting period.
DO $$ BEGIN
  ALTER TABLE "analytics_events" ADD CONSTRAINT "chk_analytics_occurred_sane" CHECK (occurred_at BETWEEN created_at - interval '30 minutes'
                         AND created_at + interval '5 minutes');
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
-- BRIN, not BTREE: the table is append-ordered by time and reaches tens of millions of
-- rows. A BTREE over occurred_at costs orders of magnitude more space for the same
-- range scans (02 §7.11).
CREATE INDEX IF NOT EXISTS "idx_analytics_occurred_brin" ON "analytics_events"
  USING BRIN (occurred_at) WITH (pages_per_range = 32);

-- ── Audit log immutability (07 §7.4; P03 exit criterion (f)) ──────────────────────
-- The architecture specifies INSERT/SELECT-only grants for the application role. A grant
-- alone is not testable on a superuser development database and silently does nothing if
-- the role is ever changed, so the invariant is ALSO enforced by a trigger: an audit log
-- the audited party can edit is decoration.
CREATE OR REPLACE FUNCTION "audit_logs_immutable"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only: % is not permitted (07 §7.4)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_audit_logs_no_update" ON "audit_logs";
CREATE TRIGGER "trg_audit_logs_no_update"
  BEFORE UPDATE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION "audit_logs_immutable"();

DROP TRIGGER IF EXISTS "trg_audit_logs_no_delete" ON "audit_logs";
CREATE TRIGGER "trg_audit_logs_no_delete"
  BEFORE DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION "audit_logs_immutable"();


-- ═══════════════════════════════════════════════════════════════════════════════════
-- HAND-WRITTEN ADDENDUM — Schema II
-- Partial uniques, expression indexes, CHECK constraints and the search vector.
-- ═══════════════════════════════════════════════════════════════════════════════════

-- ── Live-slug uniqueness. Partial, so a soft-deleted row does not reserve its slug
--    forever — and a re-created product can take its old URL back.
DROP INDEX IF EXISTS "categories_slug_key";
CREATE UNIQUE INDEX IF NOT EXISTS "idx_categories_slug_live" ON "categories" (slug) WHERE deleted_at IS NULL;
DROP INDEX IF EXISTS "products_slug_key";
CREATE UNIQUE INDEX IF NOT EXISTS "idx_products_slug_live" ON "products" (slug) WHERE deleted_at IS NULL;
DROP INDEX IF EXISTS "stones_slug_key";
CREATE UNIQUE INDEX IF NOT EXISTS "idx_stones_slug_live" ON "stones" (slug) WHERE deleted_at IS NULL;
DROP INDEX IF EXISTS "materials_slug_key";
CREATE UNIQUE INDEX IF NOT EXISTS "idx_materials_slug_live" ON "materials" (slug) WHERE deleted_at IS NULL;
DROP INDEX IF EXISTS "collections_slug_key";
CREATE UNIQUE INDEX IF NOT EXISTS "idx_collections_slug_live" ON "collections" (slug) WHERE deleted_at IS NULL;
DROP INDEX IF EXISTS "product_variants_sku_key";
CREATE UNIQUE INDEX IF NOT EXISTS "idx_variants_sku_live" ON "product_variants" (sku) WHERE deleted_at IS NULL;
DROP INDEX IF EXISTS "attributes_key_key";
CREATE UNIQUE INDEX IF NOT EXISTS "idx_attributes_key_live" ON "attributes" (key) WHERE deleted_at IS NULL;

-- ── Categories ───────────────────────────────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE "categories" ADD CONSTRAINT "chk_categories_not_self_parent" CHECK (parent_id IS NULL OR parent_id <> id);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "idx_categories_parent_rank" ON "categories" (parent_id, rank) WHERE deleted_at IS NULL;
-- text_pattern_ops so `materialized_path LIKE '<id>/%'` — "everything under RINGS" — is
-- an index range scan rather than a recursive CTE on every listing page.
CREATE INDEX IF NOT EXISTS "idx_categories_path" ON "categories" (materialized_path text_pattern_ops);
DO $$ BEGIN
  ALTER TABLE "categories" ADD CONSTRAINT "chk_categories_sku_token_upper" CHECK (sku_token IS NULL OR sku_token = upper(sku_token));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

-- ── Products ─────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "idx_products_published" ON "products" (status, published_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS "idx_products_title_trgm" ON "products" USING GIN (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "idx_products_ooak" ON "products" (id) WHERE is_one_of_a_kind AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS "idx_products_completeness" ON "products" (completeness_score, id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS "idx_products_sold" ON "products" (sold_at DESC) WHERE sold_at IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS "idx_products_updated" ON "products" (updated_at DESC) WHERE deleted_at IS NULL;

-- The composite-unique target that lets another table's denormalised `is_one_of_a_kind`
-- be provably THIS product's own rather than a value someone passed in.
DO $$ BEGIN
  ALTER TABLE "products" ADD CONSTRAINT "uq_products_id_ooak" UNIQUE (id, is_one_of_a_kind);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

-- The search vector: a STORED generated column, which Prisma cannot express at all. It is
-- weighted — a match on the title outranks a match on a category name — and it is the
-- reason `search_text` is denormalised from seven sources rather than joined at query time.
ALTER TABLE "products"
  ADD COLUMN IF NOT EXISTS "search_vector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(subtitle, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(search_text, '')), 'C')
  ) STORED;
CREATE INDEX IF NOT EXISTS "idx_products_search_vector" ON "products" USING GIN (search_vector);

-- ── Variants ─────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "idx_variants_product" ON "product_variants" (product_id, position) WHERE deleted_at IS NULL;
-- A one-of-a-kind product has exactly ONE variant. Without this, a second variant makes
-- "quantity 1" meaningless and the piece is sellable twice by construction.
CREATE UNIQUE INDEX IF NOT EXISTS "idx_variants_ooak_single" ON "product_variants" (product_id)
  WHERE is_one_of_a_kind AND deleted_at IS NULL;
DO $$ BEGIN
  ALTER TABLE "product_variants" ADD CONSTRAINT "uq_variants_id_ooak" UNIQUE (id, is_one_of_a_kind);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "idx_variants_option_signature" ON "product_variants" (product_id, option_signature)
  WHERE deleted_at IS NULL AND option_signature <> '';
CREATE INDEX IF NOT EXISTS "idx_variants_sku_prefix" ON "product_variants" (sku text_pattern_ops) WHERE deleted_at IS NULL;

-- ── Options and their values ─────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS "uq_product_options" ON "product_options" (product_id, lower(name));
CREATE UNIQUE INDEX IF NOT EXISTS "uq_option_values" ON "product_option_values" (option_id, lower(value));

-- ── Stones and materials ─────────────────────────────────────────────────────────
-- Exactly one primary stone per product, and one primary material per variant. Without
-- these, "the stone" on a product page is whichever row the query happened to return.
CREATE UNIQUE INDEX IF NOT EXISTS "idx_product_stones_primary" ON "product_stones" (product_id) WHERE is_primary;
CREATE UNIQUE INDEX IF NOT EXISTS "idx_variant_materials_primary" ON "variant_materials" (variant_id) WHERE is_primary;
DO $$ BEGIN
  ALTER TABLE "variant_materials" ADD CONSTRAINT "chk_variant_materials_weight" CHECK (weight_grams > 0);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "materials" ADD CONSTRAINT "chk_materials_purity" CHECK (purity_ratio IS NULL OR (purity_ratio > 0 AND purity_ratio <= 1));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

-- ── Categories on products ───────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS "idx_product_categories_primary" ON "product_categories" (product_id) WHERE is_primary;
CREATE INDEX IF NOT EXISTS "idx_product_categories_rank" ON "product_categories" (category_id, rank) INCLUDE (product_id);
CREATE INDEX IF NOT EXISTS "idx_product_collections_rank" ON "product_collections" (collection_id, rank) INCLUDE (product_id);

-- ── Attributes ───────────────────────────────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE "attributes" ADD CONSTRAINT "chk_attributes_scope" CHECK (scope IN ('product','variant','both'));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
-- Only these types can be a storefront filter. A free-text attribute as a filter is a
-- facet with one option per typo.
DO $$ BEGIN
  ALTER TABLE "attributes" ADD CONSTRAINT "chk_attributes_filterable_type" CHECK (NOT is_filterable OR data_type IN ('select','multi_select','boolean','number'));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "attributes" ADD CONSTRAINT "chk_attributes_range" CHECK (value_min IS NULL OR value_max IS NULL OR value_max >= value_min);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "attributes" ADD CONSTRAINT "chk_attributes_decimal_places" CHECK (decimal_places IS NULL OR decimal_places BETWEEN 0 AND 4);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "attributes" ADD CONSTRAINT "chk_attributes_max_length" CHECK (max_length IS NULL OR max_length BETWEEN 1 AND 10000);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "uq_attribute_options" ON "attribute_options" (attribute_id, lower(value));

-- EXACTLY ONE value column. Without it a row carries both a number and a string and the
-- reader picks whichever it looks at first — one product, two carat weights, two screens.
DO $$ BEGIN
  ALTER TABLE "product_attribute_values" ADD CONSTRAINT "chk_pav_one_value" CHECK (num_nonnulls(option_id, value_text, value_numeric, value_bool, value_date, value_json) = 1);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "idx_pav_unique" ON "product_attribute_values"
  (product_id, attribute_id,
   coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid),
   coalesce(option_id,  '00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX IF NOT EXISTS "idx_pav_filter" ON "product_attribute_values" (attribute_id, option_id, product_id)
  WHERE option_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS "idx_pav_numeric" ON "product_attribute_values" (attribute_id, value_numeric)
  WHERE value_numeric IS NOT NULL;
CREATE INDEX IF NOT EXISTS "idx_pav_product" ON "product_attribute_values" (product_id);

-- ── Collections ──────────────────────────────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE "collections" ADD CONSTRAINT "chk_collections_window" CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "collections" ADD CONSTRAINT "chk_collections_rule_match" CHECK (rule_match IN ('all','any'));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
-- `best_selling`, never `bestselling` (11 §7.9).
DO $$ BEGIN
  ALTER TABLE "collections" ADD CONSTRAINT "chk_collections_sort_order" CHECK (sort_order IN ('manual','newest','price_asc','price_desc','rank','best_selling'));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "product_collections" ADD CONSTRAINT "chk_product_collections_source" CHECK (source IN ('manual','rule'));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "collection_rules" ADD CONSTRAINT "chk_collection_rules_value" CHECK (num_nonnulls(value_text, value_uuid, value_numeric) >= 1
         OR operator IN ('is_true','is_false'));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
-- A price rule with no market compares $400 against ₹40,000 (hard rule 2).
DO $$ BEGIN
  ALTER TABLE "collection_rules" ADD CONSTRAINT "chk_collection_rules_price_market" CHECK (field NOT IN ('price','is_on_sale') OR value_market_code IS NOT NULL);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

-- ── Media ────────────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS "idx_media_public_id" ON "media" (provider, public_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS "idx_media_checksum" ON "media" (checksum_sha256) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS "idx_media_folder" ON "media" (folder_id, created_at DESC) WHERE deleted_at IS NULL;
-- Trigram rather than tsvector because `md-larimar-drop-02` is not a word (06 §7.3).
CREATE INDEX IF NOT EXISTS "idx_media_search_trgm" ON "media" USING GIN (
  (coalesce(title,'') || ' ' || coalesce(alt_text,'') || ' ' || coalesce(credit,'') || ' ' || public_id)
  gin_trgm_ops
) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS "idx_media_missing_alt" ON "media" (created_at DESC)
  WHERE alt_text IS NULL AND deleted_at IS NULL AND kind = 'image';
CREATE UNIQUE INDEX IF NOT EXISTS "uq_media_folders_name" ON "media_folders" (parent_id, lower(name));

CREATE UNIQUE INDEX IF NOT EXISTS "uq_product_media" ON "product_media"
  (product_id, media_id, coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid));
-- Exactly one hero per product, or the PDP's lead image is whichever row sorts first.
CREATE UNIQUE INDEX IF NOT EXISTS "idx_product_media_hero" ON "product_media" (product_id)
  WHERE role = 'hero' AND variant_id IS NULL;

-- ── Market content and sort cache ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "idx_pmc_market_published" ON "product_market_content" (market_code, product_id)
  WHERE is_published;
DO $$ BEGIN
  ALTER TABLE "product_market_sort" ADD CONSTRAINT "chk_pms_amounts" CHECK (min_price_minor >= 0 AND max_price_minor >= min_price_minor);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
-- The composite FK that stops a row claiming a currency its market does not use.
DO $$ BEGIN
  ALTER TABLE "product_market_sort" ADD CONSTRAINT "fk_pms_market" FOREIGN KEY (market_code, currency_code) REFERENCES "markets" (code, currency_code) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "idx_pms_price" ON "product_market_sort" (market_code, min_price_minor, product_id);
CREATE INDEX IF NOT EXISTS "idx_pms_units" ON "product_market_sort" (market_code, units_90d DESC, product_id);

-- ── Curated facets ───────────────────────────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE "curated_facets" ADD CONSTRAINT "chk_curated_facets_target" CHECK (num_nonnulls(stone_id, material_id, attribute_option_id, tag_id) = 1);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "idx_curated_facets_active" ON "curated_facets" (category_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS "idx_curated_facets_auto" ON "curated_facets" (facet_type, is_auto) WHERE is_active;

-- ── SEO and redirects ────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS "uq_seo_metadata_entity" ON "seo_metadata"
  (entity_type, coalesce(entity_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(market_code, '**'))
  NULLS NOT DISTINCT;
CREATE UNIQUE INDEX IF NOT EXISTS "uq_redirects_from" ON "redirects"
  (lower(from_path), coalesce(market_code, '**')) WHERE is_active;
-- Catches the one-hop loop. Chain flattening is the service layer's job, because a
-- multi-row cycle cannot be a row-level CHECK.
DO $$ BEGIN
  ALTER TABLE "redirects" ADD CONSTRAINT "chk_redirects_not_self" CHECK (lower(from_path) <> lower(to_path));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "redirects" ADD CONSTRAINT "chk_redirects_status" CHECK (status_code IN (301, 302, 307, 308));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "redirects" ADD CONSTRAINT "chk_redirects_paths" CHECK (from_path LIKE '/%' AND to_path LIKE '/%');
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;


-- Restore three hand-written objects that `prisma migrate dev` silently dropped.
--
-- WHAT HAPPENED. The Schema II migration was generated with `prisma migrate dev
-- --create-only`. Prisma diffs the DATABASE against the PRISMA SCHEMA, and anything in
-- the database that the schema does not describe reads as drift — so it emitted
-- DROP statements for three objects created by the Schema I hand-written addendum:
--
--   uq_settings_key_market      -- (key, market_code) NULLS NOT DISTINCT
--   uq_email_templates          -- (key, market_code) NULLS NOT DISTINCT
--   idx_analytics_occurred_brin -- BRIN over occurred_at
--
-- None of the three is expressible in Prisma, which is exactly why they were
-- hand-written — and exactly why Prisma proposes to remove them. 01 §6.8 predicted this
-- ("the addendum must be re-appended whenever the schema changes, or the constraints are
-- silently dropped"). It then happened on the very next migration, and it was found by a
-- test failing rather than by anyone reading the generated SQL.
--
-- The durable fix is tests/db/handwritten-constraints.test.ts, which enumerates every
-- hand-written object and asserts it exists. A future migration may still drop one; it
-- can no longer do so quietly.

CREATE UNIQUE INDEX IF NOT EXISTS "uq_settings_key_market"
  ON "settings" (key, market_code) NULLS NOT DISTINCT;

CREATE UNIQUE INDEX IF NOT EXISTS "uq_email_templates"
  ON "email_templates" (key, market_code) NULLS NOT DISTINCT;

CREATE INDEX IF NOT EXISTS "idx_analytics_occurred_brin"
  ON "analytics_events" USING BRIN (occurred_at) WITH (pages_per_range = 32);


-- ── sku_token uniqueness and case (03 §2.6, added at P08) ────────────────────────
DO $$ BEGIN
  ALTER TABLE "stones" ADD CONSTRAINT "chk_stones_sku_token_upper" CHECK (sku_token IS NULL OR sku_token = upper(sku_token));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "materials" ADD CONSTRAINT "chk_materials_sku_token_upper" CHECK (sku_token IS NULL OR sku_token = upper(sku_token));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "idx_categories_sku_token" ON "categories" (sku_token) WHERE sku_token IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "idx_stones_sku_token" ON "stones" (sku_token) WHERE sku_token IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "idx_materials_sku_token" ON "materials" (sku_token) WHERE sku_token IS NOT NULL AND deleted_at IS NULL;

-- ── Pricing, discounts and tax — P10 ─────────────────────────────────────────────
-- 02 §2.5, §7.13; 04 §2.2, §3.3, §8.3. Everything Prisma cannot express: the partial
-- uniques that make "which price is live" have exactly one answer, the composite foreign
-- keys that make a currency/market mismatch unwritable, and the two arithmetic identities
-- that turn a rounding bug into a failed INSERT rather than a plausible wrong number.

-- THE constraint of this phase. One live price per (variant, market): without it "the
-- current price" is a most-recent-wins ORDER BY that two concurrent writers can disagree
-- about, and the losing row stays live forever with no error anywhere.
CREATE UNIQUE INDEX IF NOT EXISTS "idx_prices_active" ON "prices" (variant_id, market_code)
  WHERE valid_to IS NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "idx_prices_active_product" ON "prices" (product_id, market_code)
  WHERE variant_id IS NULL AND valid_to IS NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS "idx_prices_history" ON "prices" (product_id, market_code, valid_from DESC);
CREATE INDEX IF NOT EXISTS "idx_prices_recalc" ON "prices" (recalc_run_id) WHERE recalc_run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS "idx_prices_metal_rate" ON "prices" (metal_rate_id) WHERE metal_rate_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS "idx_prices_live_product" ON "prices" (product_id, market_code)
  WHERE valid_to IS NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS "idx_prices_on_sale" ON "prices" (product_id, market_code)
  WHERE sale_minor IS NOT NULL AND valid_to IS NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS "idx_prices_market_list" ON "prices" (market_code, list_minor)
  WHERE valid_to IS NULL AND deleted_at IS NULL;

DO $$ BEGIN
  ALTER TABLE "prices" ADD CONSTRAINT "chk_prices_amounts" CHECK (list_minor >= 0 AND (sale_minor IS NULL OR sale_minor >= 0) AND (cost_minor IS NULL OR cost_minor >= 0));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "prices" ADD CONSTRAINT "chk_prices_sale_lte_list" CHECK (sale_minor IS NULL OR sale_minor <= list_minor);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "prices" ADD CONSTRAINT "chk_prices_currency_upper" CHECK (currency_code = upper(currency_code));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "prices" ADD CONSTRAINT "chk_prices_linked_inputs" CHECK (price_source = 'manual' OR (material_id IS NOT NULL AND metal_rate_id IS NOT NULL AND metal_weight_grams IS NOT NULL));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "prices" ADD CONSTRAINT "chk_prices_making_charge_bp" CHECK (making_charge_bp IS NULL OR making_charge_bp BETWEEN 0 AND 1000000);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "prices" ADD CONSTRAINT "chk_prices_window" CHECK (valid_to IS NULL OR valid_to > valid_from);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

-- A product-level row is ALWAYS manual: weight lives on variant_materials, and
-- recalc_run_lines.variant_id is NOT NULL, so a product-level formula price is not
-- representable as a preview line at all — it would claim to be metal-linked and never move.
DO $$ BEGIN
  ALTER TABLE "prices" ADD CONSTRAINT "chk_prices_variant_level_formula" CHECK (price_source = 'manual' OR variant_id IS NOT NULL);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "prices" ADD CONSTRAINT "chk_prices_formula_source" CHECK (price_source = 'manual' OR formula_version_id IS NOT NULL);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "prices" ADD CONSTRAINT "chk_prices_hybrid_adjustment" CHECK ((price_source = 'hybrid') = (hybrid_adjustment_delta_minor IS NOT NULL));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

-- The two identities. They are why "explain this price" is a row read rather than a
-- re-computation, and why a rounding bug in evaluateFormula fails an INSERT instead of
-- shipping a plausible wrong number.
DO $$ BEGIN
  ALTER TABLE "prices" ADD CONSTRAINT "chk_prices_components_sum" CHECK (price_source = 'manual' OR (computed_base_minor = metal_component_minor + making_charge_computed_minor + coalesce(stone_cost_minor, 0) + coalesce(other_material_cost_minor, 0) + coalesce(markup_minor, 0) + coalesce(market_adjustment_delta_minor, 0) + coalesce(floor_adjustment_minor, 0)));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "prices" ADD CONSTRAINT "chk_prices_list_identity" CHECK (price_source = 'manual' OR (list_minor = computed_base_minor + coalesce(rounding_adjustment_minor, 0) + coalesce(hybrid_adjustment_delta_minor, 0)));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "price_history" ADD CONSTRAINT "chk_price_history_signed_delta" CHECK (change_bp IS NULL OR change_bp BETWEEN -100000 AND 1000000);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "idx_price_history_product" ON "price_history" (product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS "idx_price_history_run" ON "price_history" (recalc_run_id) WHERE recalc_run_id IS NOT NULL;

DO $$ BEGIN
  ALTER TABLE "metal_rates" ADD CONSTRAINT "chk_metal_rates_positive" CHECK (rate_minor_per_gram > 0);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "metal_rates" ADD CONSTRAINT "chk_metal_rates_scale" CHECK (rate_scale BETWEEN 0 AND 6);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "idx_metal_rates_latest" ON "metal_rates" (material_id, currency_code, effective_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_pricing_formulas_slug_live" ON "pricing_formulas" (slug) WHERE deleted_at IS NULL;

DO $$ BEGIN
  ALTER TABLE "pricing_formula_versions" ADD CONSTRAINT "chk_pfv_purity_source" CHECK (purity_source IN ('material','override'));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "pricing_formula_versions" ADD CONSTRAINT "chk_pfv_purity" CHECK ((purity_source = 'override') = (purity_ratio_bp IS NOT NULL));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "pricing_formula_versions" ADD CONSTRAINT "chk_pfv_purity_range" CHECK (purity_ratio_bp IS NULL OR purity_ratio_bp BETWEEN 1 AND 10000);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "pricing_formula_versions" ADD CONSTRAINT "chk_pfv_weight_source" CHECK (weight_source IN ('variant_primary','variant_material','fixed'));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "pricing_formula_versions" ADD CONSTRAINT "chk_pfv_weight" CHECK ((weight_source = 'fixed') = (fixed_weight_milligrams IS NOT NULL));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "pricing_formula_versions" ADD CONSTRAINT "chk_pfv_weight_positive" CHECK (fixed_weight_milligrams IS NULL OR fixed_weight_milligrams > 0);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "pricing_formula_versions" ADD CONSTRAINT "chk_pfv_making_mode" CHECK (making_charge_mode IN ('none','percent_of_metal','fixed_per_gram','fixed'));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "pricing_formula_versions" ADD CONSTRAINT "chk_pfv_making_bp" CHECK ((making_charge_mode = 'percent_of_metal') = (making_charge_bp IS NOT NULL));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "pricing_formula_versions" ADD CONSTRAINT "chk_pfv_making_bp_range" CHECK (making_charge_bp IS NULL OR making_charge_bp BETWEEN 0 AND 1000000);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "pricing_formula_versions" ADD CONSTRAINT "chk_pfv_markup_mode" CHECK (markup_mode IN ('none','percent_of_subtotal','fixed'));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "pricing_formula_versions" ADD CONSTRAINT "chk_pfv_markup_bp" CHECK ((markup_mode = 'percent_of_subtotal') = (markup_bp IS NOT NULL));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "pricing_formula_versions" ADD CONSTRAINT "chk_pfv_markup_bp_range" CHECK (markup_bp IS NULL OR markup_bp BETWEEN 0 AND 1000000);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "pricing_formula_market_terms" ADD CONSTRAINT "chk_pfmt_adjustment_one" CHECK (NOT (market_adjustment_delta_minor IS NOT NULL AND market_adjustment_bp IS NOT NULL));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "pricing_formula_market_terms" ADD CONSTRAINT "chk_pfmt_adjustment_bp" CHECK (market_adjustment_bp IS NULL OR market_adjustment_bp BETWEEN -10000 AND 1000000);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "pricing_formula_market_terms" ADD CONSTRAINT "chk_pfmt_rounding" CHECK (rounding_increment_minor > 0);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "pricing_formula_market_terms" ADD CONSTRAINT "chk_pfmt_rounding_mode" CHECK (rounding_mode IN ('half_up','up','down'));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "price_formula_bindings" ADD CONSTRAINT "chk_pfb_mode" CHECK (mode IN ('metal_linked','hybrid'));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "price_formula_bindings" ADD CONSTRAINT "chk_pfb_hybrid" CHECK ((mode = 'hybrid') = (hybrid_adjustment_type IS NOT NULL));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "price_formula_bindings" ADD CONSTRAINT "chk_pfb_hybrid_type" CHECK (hybrid_adjustment_type IS NULL OR hybrid_adjustment_type IN ('percent','fixed_delta','fixed_override'));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "price_formula_bindings" ADD CONSTRAINT "chk_pfb_hybrid_value" CHECK (num_nonnulls(hybrid_adjustment_bp, hybrid_adjustment_delta_minor, hybrid_override_minor) = CASE WHEN mode = 'hybrid' THEN 1 ELSE 0 END);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "price_formula_bindings" ADD CONSTRAINT "chk_pfb_hybrid_bp" CHECK (hybrid_adjustment_bp IS NULL OR hybrid_adjustment_bp BETWEEN -10000 AND 1000000);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "price_formula_bindings" ADD CONSTRAINT "chk_pfb_override_positive" CHECK (hybrid_override_minor IS NULL OR hybrid_override_minor >= 0);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
-- The composite FK that makes the denormalised product_id provably the variant's own.
-- Without it a binding can name variant A and product B, the recalc scope filter silently
-- includes or excludes the wrong variants, and nothing anywhere complains.
DO $$ BEGIN
  ALTER TABLE "price_formula_bindings" ADD CONSTRAINT "fk_pfb_variant_product" FOREIGN KEY (variant_id, product_id) REFERENCES "product_variants" (id, product_id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "idx_pfb_variant" ON "price_formula_bindings" (variant_id, market_code) WHERE is_active;
CREATE INDEX IF NOT EXISTS "idx_pfb_formula" ON "price_formula_bindings" (formula_id, market_code) WHERE is_active;
CREATE INDEX IF NOT EXISTS "idx_pfb_product" ON "price_formula_bindings" (product_id, market_code) WHERE is_active;

DO $$ BEGIN
  ALTER TABLE "variant_component_costs" ADD CONSTRAINT "chk_vcc_currency_upper" CHECK (currency_code = upper(currency_code));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "variant_component_costs" ADD CONSTRAINT "chk_vcc_amount" CHECK (amount_minor >= 0);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "variant_component_costs" ADD CONSTRAINT "chk_vcc_kind" CHECK (component_kind IN ('stone','other_material','finishing','certification'));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

-- A run cannot leave the preview states without a NAMED approver. This is R03's floor: the
-- cron produces previewing → pending_approval and has no path to applied at all.
DO $$ BEGIN
  ALTER TABLE "recalc_runs" ADD CONSTRAINT "chk_recalc_approved" CHECK ((status IN ('approved','applying','applied')) = (approved_by_user_id IS NOT NULL));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "recalc_runs" ADD CONSTRAINT "chk_recalc_totals_market" CHECK ((total_increase_minor = 0 AND total_decrease_minor = 0) OR market_code IS NOT NULL);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "idx_recalc_runs_status" ON "recalc_runs" (status, created_at DESC);

DO $$ BEGIN
  ALTER TABLE "pricing_rules" ADD CONSTRAINT "chk_pricing_rules_value" CHECK ((adjustment_type = 'percentage_off' AND value_bp IS NOT NULL AND amount_minor IS NULL) OR (adjustment_type <> 'percentage_off' AND amount_minor IS NOT NULL AND value_bp IS NULL));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "pricing_rules" ADD CONSTRAINT "chk_pricing_rules_scope" CHECK ((scope_type = 'all') = (scope_id IS NULL));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "pricing_rules" ADD CONSTRAINT "chk_pricing_rules_bp" CHECK (value_bp IS NULL OR value_bp BETWEEN 0 AND 10000);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "idx_pricing_rules_live" ON "pricing_rules" (market_code, scope_type, scope_id, priority) WHERE is_active;

CREATE UNIQUE INDEX IF NOT EXISTS "idx_coupons_code_live" ON "coupons" (upper(code)) WHERE code IS NOT NULL AND deleted_at IS NULL;
DO $$ BEGIN
  ALTER TABLE "coupons" ADD CONSTRAINT "chk_coupons_code_trigger" CHECK ((trigger = 'code') = (code IS NOT NULL));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "coupons" ADD CONSTRAINT "chk_coupons_percentage" CHECK (type <> 'percentage' OR (value_bp IS NOT NULL AND value_bp BETWEEN 1 AND 10000));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "coupons" ADD CONSTRAINT "chk_coupons_redemptions" CHECK (redemption_count >= 0 AND (max_redemptions IS NULL OR redemption_count <= max_redemptions));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "idx_coupons_automatic" ON "coupons" (priority) WHERE trigger = 'automatic' AND is_active AND deleted_at IS NULL;

DO $$ BEGIN
  ALTER TABLE "coupon_amounts" ADD CONSTRAINT "chk_coupon_amounts_positive" CHECK (amount_minor > 0);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "coupon_conditions" ADD CONSTRAINT "chk_coupon_conditions_money" CHECK (value_minor IS NULL OR currency_code IS NOT NULL);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "gift_cards" ADD CONSTRAINT "chk_gift_cards_balance" CHECK (balance_minor >= 0);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "gift_cards" ADD CONSTRAINT "chk_gift_cards_initial" CHECK (initial_balance_minor > 0);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "tax_rules" ADD CONSTRAINT "chk_tax_rules_window" CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "tax_rules" ADD CONSTRAINT "chk_tax_rules_rate" CHECK (rate_bp BETWEEN 0 AND 10000);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "idx_tax_rules_lookup" ON "tax_rules" (market_code, country_code, tax_code, priority) WHERE is_active;

-- 04 §1.4.1 — P11's two schema additions to pricing_rules.
DO $$ BEGIN
  ALTER TABLE "pricing_rules" ADD CONSTRAINT "chk_pricing_rules_amount_basis" CHECK (amount_basis IN ('per_unit','per_line'));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
-- A rule that sets the price IS the price. Composing it with a further percentage is an
-- argument about which the merchandiser meant, resolved at runtime on a customer's bag.
DO $$ BEGIN
  ALTER TABLE "pricing_rules" ADD CONSTRAINT "chk_pricing_rules_fixed_price_not_stackable" CHECK (NOT (adjustment_type = 'fixed_price' AND is_stackable));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

-- 04 §3.3 — a skipped line has no proposal, and a line with a proposal is not skipped.
-- Without it a `skipped` row can carry a `proposed_list_minor` that the apply would then
-- insert, which is the one way a line the reviewer was told was skipped still ships.
DO $$ BEGIN
  ALTER TABLE "recalc_run_lines" ADD CONSTRAINT "chk_rrl_proposed" CHECK ((status = 'skipped') = (proposed_list_minor IS NULL));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

-- 03 §6.3 — a rule value is exactly one of a uuid or a text, never both and never neither.
-- Without it an `in` list can carry a row that names nothing, which evaluates as a silently
-- narrower rule: the collection is missing pieces and the rule looks correct on screen.
DO $$ BEGIN
  ALTER TABLE "collection_rule_values" ADD CONSTRAINT "chk_crv_one_value" CHECK (num_nonnulls(value_uuid, value_text) = 1);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

-- ── Schema IV — inventory and commerce. P18 ──────────────────────────────────────
-- 02 §2.6–§2.7. Everything Prisma cannot express, and the three risks it closes.

-- R01's floor. Whatever the service layer believes about availability, the database refuses
-- to promise more of a thing than exists. This is the constraint `one-of-a-kind.test.ts`
-- hammers at repeats: 200 per commit.
DO $$ BEGIN
  ALTER TABLE "inventory_items" ADD CONSTRAINT "chk_inventory_on_hand_nonneg" CHECK (on_hand_quantity >= 0);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "inventory_items" ADD CONSTRAINT "chk_inventory_reserved_nonneg" CHECK (reserved_quantity >= 0);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "inventory_items" ADD CONSTRAINT "chk_inventory_no_oversell" CHECK (reserved_quantity <= on_hand_quantity);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
-- A one-of-a-kind piece is one piece. Not one per location.
DO $$ BEGIN
  ALTER TABLE "inventory_items" ADD CONSTRAINT "chk_inventory_ooak_qty" CHECK (NOT is_one_of_a_kind OR (on_hand_quantity <= 1 AND incoming_quantity = 0));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "idx_inventory_items_ooak_single_row" ON "inventory_items" (variant_id) WHERE is_one_of_a_kind;
-- The denormalised flag is provably the variant's own.
DO $$ BEGIN
  ALTER TABLE "inventory_items" ADD CONSTRAINT "fk_inventory_items_variant_ooak" FOREIGN KEY (variant_id, is_one_of_a_kind) REFERENCES "product_variants" (id, is_one_of_a_kind) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "idx_inventory_items_variant_location" ON "inventory_items" (variant_id, location_id);
CREATE INDEX IF NOT EXISTS "idx_inventory_low_stock" ON "inventory_items" (location_id, available_quantity) WHERE available_quantity <= 2;

DO $$ BEGIN
  ALTER TABLE "inventory_transactions" ADD CONSTRAINT "chk_inventory_tx_nonzero" CHECK (quantity_delta <> 0);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
-- A generated column, so the ledger's two ends cannot disagree: Prisma cannot express
-- GENERATED ALWAYS AS … STORED at all (01 §1.2).
ALTER TABLE "inventory_transactions" DROP COLUMN IF EXISTS "balance_before";
ALTER TABLE "inventory_transactions" ADD COLUMN "balance_before" INTEGER
  GENERATED ALWAYS AS (balance_after - quantity_delta) STORED;
CREATE INDEX IF NOT EXISTS "idx_inventory_tx_item" ON "inventory_transactions" (inventory_item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS "idx_inventory_tx_variant" ON "inventory_transactions" (variant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS "idx_inventory_tx_order" ON "inventory_transactions" (order_id) WHERE order_id IS NOT NULL;

DO $$ BEGIN
  ALTER TABLE "reservations" ADD CONSTRAINT "chk_reservations_ref" CHECK ((ref_kind = 'cart' AND cart_id IS NOT NULL AND order_id IS NULL) OR (ref_kind = 'order' AND order_id IS NOT NULL));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "idx_reservations_active_cart" ON "reservations" (cart_id) WHERE status = 'active' AND cart_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS "idx_reservations_expiry" ON "reservations" (expires_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS "idx_reservations_order" ON "reservations" (order_id) WHERE order_id IS NOT NULL;
DO $$ BEGIN
  ALTER TABLE "reservation_lines" ADD CONSTRAINT "chk_reservation_lines_qty" CHECK (quantity > 0);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "addresses" ADD CONSTRAINT "chk_addresses_country_upper" CHECK (country_code = upper(country_code));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "idx_addresses_customer" ON "addresses" (customer_id) WHERE NOT is_archived;

CREATE UNIQUE INDEX IF NOT EXISTS "idx_wishlists_default" ON "wishlists" (customer_id) WHERE is_default;
CREATE UNIQUE INDEX IF NOT EXISTS "idx_wishlists_share" ON "wishlists" (share_token_hash) WHERE share_token_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "uq_wishlist_items" ON "wishlist_items"
  (wishlist_id, product_id, coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid));

DO $$ BEGIN
  ALTER TABLE "back_in_stock_requests" ADD CONSTRAINT "chk_bisr_email" CHECK (email = lower(btrim(email)));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "idx_bisr_pending" ON "back_in_stock_requests"
  (lower(email), product_id, coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid), market_code)
  WHERE notified_at IS NULL;
CREATE INDEX IF NOT EXISTS "idx_bisr_variant" ON "back_in_stock_requests" (variant_id) WHERE notified_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "idx_carts_token_hash" ON "carts" (token_hash);
CREATE INDEX IF NOT EXISTS "idx_carts_customer_active" ON "carts" (customer_id, updated_at DESC) WHERE status = 'active' AND customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS "idx_carts_abandoned" ON "carts" (last_activity_at) WHERE status = 'active' AND email IS NOT NULL AND abandoned_email_sent_at IS NULL;
CREATE INDEX IF NOT EXISTS "idx_carts_drafts" ON "carts" (created_by_user_id, updated_at DESC) WHERE created_by_user_id IS NOT NULL AND status = 'active';
DO $$ BEGIN
  ALTER TABLE "cart_items" ADD CONSTRAINT "chk_cart_items_qty" CHECK (quantity > 0);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "cart_items" ADD CONSTRAINT "chk_cart_items_amounts" CHECK (unit_list_minor >= 0 AND unit_final_minor >= 0 AND unit_final_minor <= unit_list_minor);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
-- ON UPDATE RESTRICT: a cart's market may not be edited out from under its items.
DO $$ BEGIN
  ALTER TABLE "cart_items" ADD CONSTRAINT "fk_cart_items_cart_market" FOREIGN KEY (cart_id, market_code) REFERENCES "carts" (id, market_code) ON DELETE CASCADE ON UPDATE RESTRICT;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "checkout_sessions" ADD CONSTRAINT "fk_checkout_sessions_cart_market" FOREIGN KEY (cart_id, market_code) REFERENCES "carts" (id, market_code) ON DELETE CASCADE ON UPDATE RESTRICT;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "checkout_sessions" ADD CONSTRAINT "fk_checkout_sessions_market" FOREIGN KEY (market_code, currency_code) REFERENCES "markets" (code, currency_code) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "idx_checkout_sessions_expiry" ON "checkout_sessions" (expires_at) WHERE order_id IS NULL;

-- BOTH composite FKs. With only the card-side one, an INR card attaches to a USD session and
-- ₹10,000 is read by the USD order as $10,000.00 — a rupee instrument discharging a dollar
-- liability at an invented rate, arrived at by omission.
DO $$ BEGIN
  ALTER TABLE "checkout_gift_cards" ADD CONSTRAINT "fk_cgc_card_currency" FOREIGN KEY (gift_card_id, currency_code) REFERENCES "gift_cards" (id, currency_code) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "checkout_gift_cards" ADD CONSTRAINT "fk_cgc_session_currency" FOREIGN KEY (checkout_session_id, currency_code) REFERENCES "checkout_sessions" (id, currency_code) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "checkout_gift_cards" ADD CONSTRAINT "chk_cgc_amount" CHECK (applied_amount_minor > 0);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "idx_orders_idempotency_key" ON "orders" (idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_orders_number" ON "orders" (order_number);
DO $$ BEGIN
  ALTER TABLE "orders" ADD CONSTRAINT "chk_orders_amounts" CHECK (subtotal_minor >= 0 AND discount_total_minor >= 0 AND shipping_total_minor >= 0 AND tax_total_minor >= 0 AND gift_card_total_minor >= 0 AND total_minor >= 0 AND refunded_total_minor >= 0);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "orders" ADD CONSTRAINT "chk_orders_refund_cap" CHECK (refunded_total_minor <= total_minor + gift_card_total_minor);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
-- Both directions: paid means a timestamp, and a timestamp means paid.
DO $$ BEGIN
  ALTER TABLE "orders" ADD CONSTRAINT "chk_orders_paid_at" CHECK ((payment_status IN ('paid','partially_refunded','refunded')) = (paid_at IS NOT NULL));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "idx_orders_list" ON "orders" (market_code, status, created_at DESC);
CREATE INDEX IF NOT EXISTS "idx_orders_customer" ON "orders" (customer_id, created_at DESC) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS "idx_orders_email" ON "orders" (lower(email), created_at DESC);
CREATE INDEX IF NOT EXISTS "idx_orders_number_trgm" ON "orders" USING GIN (order_number gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "idx_orders_unfulfilled" ON "orders" (market_code, placed_at) WHERE fulfillment_status IN ('unfulfilled','partially_fulfilled') AND status <> 'cancelled';
CREATE INDEX IF NOT EXISTS "idx_orders_unfulfillable" ON "orders" (created_at DESC) WHERE status = 'paid_unfulfillable';
CREATE INDEX IF NOT EXISTS "idx_orders_paid_at" ON "orders" (paid_at) WHERE paid_at IS NOT NULL;

-- The composite FK every order child carries. A line in another currency is refused.
DO $$ BEGIN
  ALTER TABLE "order_items" ADD CONSTRAINT "fk_order_items_order_money" FOREIGN KEY (order_id, market_code, currency_code) REFERENCES "orders" (id, market_code, currency_code) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "order_items" ADD CONSTRAINT "chk_order_items_qty" CHECK (quantity > 0);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "order_items" ADD CONSTRAINT "chk_order_items_counters" CHECK (fulfilled_quantity BETWEEN 0 AND quantity AND returned_quantity BETWEEN 0 AND quantity);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
-- The identity 04 §1.4.2's ceil-and-carry step exists to keep true.
DO $$ BEGIN
  ALTER TABLE "order_items" ADD CONSTRAINT "chk_order_items_subtotal" CHECK (line_subtotal_minor = unit_final_minor * quantity);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "order_items" ADD CONSTRAINT "chk_order_items_total" CHECK (line_total_minor = line_subtotal_minor - line_discount_minor + line_tax_minor + line_shipping_minor);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "order_items" ADD CONSTRAINT "chk_order_items_refund_cap" CHECK (refunded_minor <= line_total_minor);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "idx_order_items_order" ON "order_items" (order_id, line_number);
CREATE INDEX IF NOT EXISTS "idx_order_items_variant" ON "order_items" (variant_id, created_at DESC) WHERE variant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS "idx_order_events_customer" ON "order_events" (order_id, created_at) WHERE is_customer_visible;

DO $$ BEGIN
  ALTER TABLE "payments" ADD CONSTRAINT "fk_payments_order_money" FOREIGN KEY (order_id, market_code, currency_code) REFERENCES "orders" (id, market_code, currency_code) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "payments" ADD CONSTRAINT "chk_payments_amounts" CHECK (amount_minor >= 0 AND captured_minor >= 0 AND refunded_minor >= 0 AND captured_minor <= amount_minor AND refunded_minor <= captured_minor);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "idx_payments_provider_payment" ON "payments" (provider_key, provider_payment_id) WHERE provider_payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS "idx_payments_order" ON "payments" (order_id, created_at DESC);

-- The dedupe. A provider that retries a delivery must not capture twice.
CREATE UNIQUE INDEX IF NOT EXISTS "idx_webhook_events_event" ON "webhook_events" (provider, provider_event_id);
CREATE INDEX IF NOT EXISTS "idx_webhook_events_retry" ON "webhook_events" (next_attempt_at) WHERE status = 'failed';
CREATE INDEX IF NOT EXISTS "idx_webhook_events_order" ON "webhook_events" (order_id) WHERE order_id IS NOT NULL;

DO $$ BEGIN
  ALTER TABLE "refunds" ADD CONSTRAINT "fk_refunds_order_money" FOREIGN KEY (order_id, market_code, currency_code) REFERENCES "orders" (id, market_code, currency_code) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "refunds" ADD CONSTRAINT "chk_refunds_amount" CHECK (amount_minor > 0);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "idx_refunds_order" ON "refunds" (order_id, created_at DESC);
-- A PENDING refund still holds its share of the remainder, so the over-refund predicate
-- cannot be served by a succeeded-only index (05 §9.4).
CREATE INDEX IF NOT EXISTS "idx_refunds_payment_open" ON "refunds" (payment_id) WHERE status IN ('pending','succeeded');

DO $$ BEGIN
  ALTER TABLE "shipments" ADD CONSTRAINT "chk_shipments_insured_currency" CHECK (insured_value_minor IS NULL OR currency_code IS NOT NULL);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "returns" ADD CONSTRAINT "fk_returns_order_money" FOREIGN KEY (order_id, market_code, currency_code) REFERENCES "orders" (id, market_code, currency_code) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "returns" ADD CONSTRAINT "chk_returns_reason" CHECK (reason_code IN ('not_as_described','damaged','wrong_size','changed_mind','other'));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "idx_returns_tracking" ON "returns" (tracking_number) WHERE tracking_number IS NOT NULL;
DO $$ BEGIN
  ALTER TABLE "return_items" ADD CONSTRAINT "chk_return_items_qty" CHECK (quantity > 0);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "coupon_usages" ADD CONSTRAINT "fk_coupon_usages_order_money" FOREIGN KEY (order_id, market_code, currency_code) REFERENCES "orders" (id, market_code, currency_code) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "idx_coupon_usages_customer" ON "coupon_usages" (coupon_id, customer_id) WHERE customer_id IS NOT NULL;

DO $$ BEGIN
  ALTER TABLE "gift_card_transactions" ADD CONSTRAINT "chk_gct_amount" CHECK (amount_delta_minor <> 0);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "gift_card_transactions" ADD CONSTRAINT "chk_gct_type" CHECK (type IN ('issue','redeem','refund','adjust','expire'));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "idx_shipping_zones_name_live" ON "shipping_zones" (market_code, lower(name)) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS "idx_shipping_zones_market" ON "shipping_zones" (market_code, rank) WHERE is_active AND deleted_at IS NULL;
DO $$ BEGIN
  ALTER TABLE "shipping_zone_rules" ADD CONSTRAINT "chk_szr_match_type" CHECK (match_type IN ('country','region','postal_prefix','postal_range'));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "shipping_zone_rules" ADD CONSTRAINT "chk_szr_country_upper" CHECK (country_code = upper(country_code));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "shipping_methods" ADD CONSTRAINT "fk_shipping_methods_zone_market" FOREIGN KEY (zone_id, market_code) REFERENCES "shipping_zones" (id, market_code) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "shipping_methods" ADD CONSTRAINT "chk_shipping_methods_strategy" CHECK (rate_strategy IN ('flat','by_order_value','by_weight','free'));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "idx_shipping_methods_code_live" ON "shipping_methods" (zone_id, upper(code)) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS "idx_shipping_methods_zone" ON "shipping_methods" (zone_id, rank) WHERE is_active AND deleted_at IS NULL;
DO $$ BEGIN
  ALTER TABLE "shipping_rates" ADD CONSTRAINT "fk_shipping_rates_method_market" FOREIGN KEY (method_id, market_code) REFERENCES "shipping_methods" (id, market_code) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "shipping_rates" ADD CONSTRAINT "fk_shipping_rates_market" FOREIGN KEY (market_code, currency_code) REFERENCES "markets" (code, currency_code) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "shipping_rates" ADD CONSTRAINT "chk_shipping_rates_amount" CHECK (amount_minor >= 0);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "shipping_rates" ADD CONSTRAINT "chk_shipping_rates_band" CHECK (max_value_minor IS NULL OR max_value_minor > min_value_minor);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
-- Two rates whose value bands overlap make the quoted price depend on row order, which is
-- how one customer is charged £8 and the next £12 for the same basket.
DO $$ BEGIN
  ALTER TABLE "shipping_rates" ADD CONSTRAINT "ex_shipping_rates_no_overlap" EXCLUDE USING gist (
    method_id WITH =, currency_code WITH =,
    int8range(min_value_minor, coalesce(max_value_minor, 9223372036854775807)) WITH &&
  );
EXCEPTION WHEN duplicate_object OR duplicate_table OR undefined_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "payment_links" ADD CONSTRAINT "chk_payment_links_ref" CHECK (num_nonnulls(cart_id, order_id) = 1);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "payment_links" ADD CONSTRAINT "chk_payment_links_status" CHECK (status IN ('active','used','expired','cancelled'));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "idx_payment_links_open" ON "payment_links" (expires_at) WHERE status = 'active';

-- trg_orders_totals_match — DEFERRED to commit, and that is the whole point. P18 criterion (c).
--
-- `orders.subtotal_minor` must equal the sum of its lines. That cannot be a CHECK, because a
-- CHECK cannot read another table; and it cannot fire per statement, because
-- `createOrderFromCart()` inserts the order row BEFORE its items — an immediate trigger would
-- reject every order at the moment it is created, so the only way to ship would be to delete
-- the constraint.
--
-- CONSTRAINT TRIGGER … INITIALLY DEFERRED runs once, at COMMIT, when the whole order exists.
-- What it catches is the case that actually happens: a line inserted, updated or deleted
-- without the header being recomputed — a refund that adjusted one line, a draft edited in the
-- admin — leaving an order whose printed total is not the sum of what is on it.
CREATE OR REPLACE FUNCTION md_orders_totals_match() RETURNS trigger AS $$
DECLARE
  expected BIGINT;
  actual   BIGINT;
BEGIN
  SELECT coalesce(sum(line_subtotal_minor), 0) INTO expected
    FROM order_items WHERE order_id = NEW.id;
  SELECT subtotal_minor INTO actual FROM orders WHERE id = NEW.id;
  IF actual IS DISTINCT FROM expected THEN
    RAISE EXCEPTION
      'orders.subtotal_minor (%) does not equal the sum of its line subtotals (%) for order %',
      actual, expected, NEW.id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'trg_orders_totals_match';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_orders_totals_match" ON "orders";
CREATE CONSTRAINT TRIGGER "trg_orders_totals_match"
  AFTER INSERT OR UPDATE OF subtotal_minor ON "orders"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION md_orders_totals_match();

CREATE OR REPLACE FUNCTION md_order_items_totals_match() RETURNS trigger AS $$
DECLARE
  target   UUID;
  expected BIGINT;
  actual   BIGINT;
BEGIN
  target := coalesce(NEW.order_id, OLD.order_id);
  -- The order may have been deleted in the same transaction; nothing to reconcile then.
  SELECT subtotal_minor INTO actual FROM orders WHERE id = target;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT coalesce(sum(line_subtotal_minor), 0) INTO expected
    FROM order_items WHERE order_id = target;
  IF actual IS DISTINCT FROM expected THEN
    RAISE EXCEPTION
      'order_items sum (%) does not equal orders.subtotal_minor (%) for order %',
      expected, actual, target
      USING ERRCODE = 'check_violation', CONSTRAINT = 'trg_order_items_totals_match';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- The same check from the other side: a line written after the header was settled.
DROP TRIGGER IF EXISTS "trg_order_items_totals_match" ON "order_items";
CREATE CONSTRAINT TRIGGER "trg_order_items_totals_match"
  AFTER INSERT OR UPDATE OR DELETE ON "order_items"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION md_order_items_totals_match();
