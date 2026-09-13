-- CreateEnum
CREATE TYPE "actor_type" AS ENUM ('staff', 'customer', 'system', 'webhook', 'cron');

-- CreateEnum
CREATE TYPE "otp_purpose" AS ENUM ('customer_login', 'email_verification', 'password_reset', 'admin_2fa_recovery', 'staff_invite', 'data_export');

-- CreateEnum
CREATE TYPE "job_kind" AS ENUM ('import_apply', 'export', 'bulk_edit', 'recalc_apply', 'collection_refresh', 'sitemap_rebuild', 'email_batch', 'reindex_search', 'publish_scheduled', 'media_orphan_scan', 'product_metrics_refresh', 'consistency_check', 'reconcile_inventory', 'send_email', 'analytics_dispatch', 'feed_rebuild', 'audit_archive', 'account_export', 'customer_group_refresh');

-- CreateEnum
CREATE TYPE "job_status" AS ENUM ('queued', 'running', 'succeeded', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "import_mode" AS ENUM ('create', 'update', 'upsert');

-- CreateEnum
CREATE TYPE "import_row_status" AS ENUM ('pending', 'valid', 'invalid', 'applied', 'skipped', 'failed');

-- CreateEnum
CREATE TYPE "saved_view_resource" AS ENUM ('products', 'variants', 'orders', 'customers', 'inventory', 'prices', 'returns', 'media');

-- CreateEnum
CREATE TYPE "email_log_status" AS ENUM ('queued', 'sent', 'delivered', 'bounced', 'complained', 'failed', 'skipped_unconfigured', 'skipped_sandbox');

-- CreateEnum
CREATE TYPE "tax_mode" AS ENUM ('provider_stripe_tax', 'rules_table', 'none');

-- CreateTable
CREATE TABLE "customer_groups" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_default" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "customer_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "email_verified_at" TIMESTAMPTZ(6),
    "password_hash" TEXT,
    "first_name" TEXT,
    "last_name" TEXT,
    "phone" TEXT,
    "phone_verified_at" TIMESTAMPTZ(6),
    "customer_group_id" UUID NOT NULL,
    "default_market_code" CHAR(2),
    "default_shipping_address_id" UUID,
    "default_billing_address_id" UUID,
    "accepts_marketing" BOOLEAN NOT NULL DEFAULT false,
    "marketing_consent_at" TIMESTAMPTZ(6),
    "marketing_consent_source" TEXT,
    "is_guest" BOOLEAN NOT NULL DEFAULT false,
    "total_orders_count" INTEGER NOT NULL DEFAULT 0,
    "last_order_at" TIMESTAMPTZ(6),
    "internal_note" TEXT,
    "anonymized_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_currency_totals" (
    "customer_id" UUID NOT NULL,
    "currency_code" CHAR(3) NOT NULL,
    "total_spent_minor" BIGINT NOT NULL DEFAULT 0,
    "total_refunded_minor" BIGINT NOT NULL DEFAULT 0,
    "orders_count" INTEGER NOT NULL DEFAULT 0,
    "last_order_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "customer_currency_totals_pkey" PRIMARY KEY ("customer_id","currency_code")
);

-- CreateTable
CREATE TABLE "newsletter_subscribers" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "customer_id" UUID,
    "market_code" CHAR(2),
    "status" TEXT NOT NULL,
    "confirmed_at" TIMESTAMPTZ(6),
    "unsubscribed_at" TIMESTAMPTZ(6),
    "source" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "newsletter_subscribers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "avatar_media_id" UUID,
    "is_active" BOOLEAN NOT NULL,
    "totp_secret_encrypted" TEXT,
    "totp_enrolled_at" TIMESTAMPTZ(6),
    "totp_recovery_codes" TEXT[],
    "totp_last_step" BIGINT,
    "last_login_at" TIMESTAMPTZ(6),
    "password_changed_at" TIMESTAMPTZ(6) NOT NULL,
    "failed_login_count" SMALLINT NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL,
    "rank" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "key" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_key" TEXT NOT NULL,
    "granted_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_key")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "granted_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "token_hash" BYTEA NOT NULL,
    "user_id" UUID,
    "customer_id" UUID,
    "impersonator_user_id" UUID,
    "ip_address" INET,
    "user_agent" TEXT,
    "totp_verified_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otp_requests" (
    "id" UUID NOT NULL,
    "purpose" "otp_purpose" NOT NULL,
    "identifier" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "customer_id" UUID,
    "user_id" UUID,
    "attempts" SMALLINT NOT NULL DEFAULT 0,
    "max_attempts" SMALLINT NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limits" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "window_start" TIMESTAMPTZ(6) NOT NULL,
    "count" INTEGER NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "currencies" (
    "code" CHAR(3) NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "minor_unit" SMALLINT NOT NULL,
    "is_active" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "currencies_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "markets" (
    "code" CHAR(2) NOT NULL,
    "name" TEXT NOT NULL,
    "currency_code" CHAR(3) NOT NULL,
    "locale" TEXT NOT NULL,
    "country_code" CHAR(2) NOT NULL,
    "timezone" TEXT NOT NULL,
    "payment_provider_key" TEXT,
    "tax_mode" "tax_mode" NOT NULL,
    "prices_include_tax" BOOLEAN NOT NULL,
    "default_location_id" UUID,
    "weight_unit" TEXT NOT NULL,
    "incoterm" TEXT NOT NULL DEFAULT 'DAP',
    "is_active" BOOLEAN NOT NULL,
    "rank" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "markets_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "inventory_locations" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country_code" CHAR(2) NOT NULL,
    "address_json" JSONB,
    "is_fulfillable" BOOLEAN NOT NULL,
    "is_active" BOOLEAN NOT NULL,
    "rank" INTEGER NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "inventory_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_locations" (
    "market_code" CHAR(2) NOT NULL,
    "location_id" UUID NOT NULL,
    "priority" SMALLINT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "market_locations_pkey" PRIMARY KEY ("market_code","location_id")
);

-- CreateTable
CREATE TABLE "order_counters" (
    "market_code" CHAR(2) NOT NULL,
    "prefix" TEXT NOT NULL,
    "next_value" BIGINT NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "order_counters_pkey" PRIMARY KEY ("market_code")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_type" "actor_type" NOT NULL,
    "actor_user_id" UUID,
    "actor_customer_id" UUID,
    "impersonator_user_id" UUID,
    "entity" TEXT NOT NULL,
    "entity_id" UUID,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "summary" TEXT,
    "request_id" TEXT,
    "ip_address" INET,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "market_code" CHAR(2),
    "value" JSONB NOT NULL,
    "value_type" TEXT NOT NULL,
    "group_key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "is_secret" BOOLEAN NOT NULL DEFAULT false,
    "updated_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_views" (
    "id" UUID NOT NULL,
    "resource" "saved_view_resource" NOT NULL,
    "name" TEXT NOT NULL,
    "owner_user_id" UUID,
    "is_shared" BOOLEAN NOT NULL,
    "is_default" BOOLEAN NOT NULL,
    "filters" JSONB NOT NULL,
    "column_config" JSONB NOT NULL,
    "sort" JSONB NOT NULL,
    "position" SMALLINT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "saved_views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" UUID NOT NULL,
    "kind" "job_kind" NOT NULL,
    "status" "job_status" NOT NULL,
    "payload" JSONB NOT NULL,
    "priority" SMALLINT NOT NULL DEFAULT 100,
    "attempts" SMALLINT NOT NULL DEFAULT 0,
    "max_attempts" SMALLINT NOT NULL DEFAULT 3,
    "run_after" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_at" TIMESTAMPTZ(6),
    "locked_by" TEXT,
    "progress_current" INTEGER,
    "progress_total" INTEGER,
    "result" JSONB,
    "error" TEXT,
    "started_at" TIMESTAMPTZ(6),
    "finished_at" TIMESTAMPTZ(6),
    "created_by_user_id" UUID,
    "dedupe_key" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_jobs" (
    "id" UUID NOT NULL,
    "job_id" UUID,
    "resource" TEXT NOT NULL,
    "mode" "import_mode" NOT NULL,
    "file_media_id" UUID,
    "file_name" TEXT NOT NULL,
    "mapping" JSONB NOT NULL,
    "market_code" CHAR(2),
    "currency_code" CHAR(3),
    "is_dry_run" BOOLEAN NOT NULL,
    "status" "job_status" NOT NULL,
    "total_rows" INTEGER NOT NULL DEFAULT 0,
    "valid_rows" INTEGER NOT NULL DEFAULT 0,
    "invalid_rows" INTEGER NOT NULL DEFAULT 0,
    "applied_rows" INTEGER NOT NULL DEFAULT 0,
    "created_by_user_id" UUID,
    "started_at" TIMESTAMPTZ(6),
    "finished_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "import_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_job_rows" (
    "id" UUID NOT NULL,
    "import_job_id" UUID NOT NULL,
    "row_number" INTEGER NOT NULL,
    "raw" JSONB NOT NULL,
    "normalized" JSONB,
    "status" "import_row_status" NOT NULL,
    "errors" JSONB NOT NULL DEFAULT '[]',
    "entity_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_job_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "search_queries" (
    "id" UUID NOT NULL,
    "query_text" TEXT NOT NULL,
    "normalized_query" TEXT NOT NULL,
    "market_code" CHAR(2) NOT NULL,
    "result_count" INTEGER NOT NULL,
    "clicked_product_id" UUID,
    "customer_id" UUID,
    "session_id" UUID,
    "filters_applied" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "search_queries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_events" (
    "id" UUID NOT NULL,
    "event_name" TEXT NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "market_code" CHAR(2) NOT NULL,
    "session_id" UUID,
    "customer_id" UUID,
    "product_id" UUID,
    "variant_id" UUID,
    "order_id" UUID,
    "revenue_minor" BIGINT,
    "currency_code" CHAR(3),
    "properties" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_templates" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "market_code" CHAR(2),
    "subject" TEXT NOT NULL,
    "preheader" TEXT,
    "heading" TEXT,
    "body_json" JSONB NOT NULL,
    "cta_label" TEXT,
    "cta_url_template" TEXT,
    "footer_json" JSONB NOT NULL DEFAULT '{}',
    "logo_media_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "email_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_logs" (
    "id" UUID NOT NULL,
    "template_key" TEXT NOT NULL,
    "to_email" TEXT NOT NULL,
    "status" "email_log_status" NOT NULL,
    "provider_message_id" TEXT,
    "order_id" UUID,
    "customer_id" UUID,
    "market_code" CHAR(2),
    "subject" TEXT NOT NULL,
    "error" TEXT,
    "sent_at" TIMESTAMPTZ(6),
    "delivered_at" TIMESTAMPTZ(6),
    "bounced_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_customer_groups_key" ON "customer_groups"("key");

-- CreateIndex
CREATE INDEX "idx_customers_created" ON "customers"("created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_customers_group" ON "customers"("customer_group_id");

-- CreateIndex
CREATE INDEX "idx_cct_currency_spend" ON "customer_currency_totals"("currency_code", "total_spent_minor" DESC);

-- CreateIndex
CREATE INDEX "idx_users_active" ON "users"("is_active", "last_name");

-- CreateIndex
CREATE UNIQUE INDEX "uq_roles_key" ON "roles"("key");

-- CreateIndex
CREATE INDEX "idx_role_permissions_permission" ON "role_permissions"("permission_key", "role_id");

-- CreateIndex
CREATE INDEX "idx_user_roles_role" ON "user_roles"("role_id");

-- CreateIndex
CREATE UNIQUE INDEX "idx_sessions_token_hash" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "idx_otp_lookup" ON "otp_requests"("purpose", "identifier", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_rate_limits_expiry" ON "rate_limits"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "idx_rate_limits_key_window" ON "rate_limits"("key", "window_start");

-- CreateIndex
CREATE UNIQUE INDEX "uq_markets_code_currency" ON "markets"("code", "currency_code");

-- CreateIndex
CREATE INDEX "idx_market_locations_location" ON "market_locations"("location_id");

-- CreateIndex
CREATE INDEX "idx_audit_entity" ON "audit_logs"("entity", "entity_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_audit_actor" ON "audit_logs"("actor_user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_audit_created" ON "audit_logs"("created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_audit_action" ON "audit_logs"("action", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_settings_group" ON "settings"("group_key");

-- CreateIndex
CREATE INDEX "idx_saved_views_resource" ON "saved_views"("resource", "position");

-- CreateIndex
CREATE INDEX "idx_jobs_claim" ON "jobs"("priority", "run_after");

-- CreateIndex
CREATE INDEX "idx_jobs_stuck" ON "jobs"("locked_at");

-- CreateIndex
CREATE INDEX "idx_import_jobs_created" ON "import_jobs"("created_at" DESC);

-- CreateIndex
CREATE INDEX "import_job_rows_import_job_id_status_idx" ON "import_job_rows"("import_job_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "import_job_rows_import_job_id_row_number_key" ON "import_job_rows"("import_job_id", "row_number");

-- CreateIndex
CREATE INDEX "idx_search_queries_recent" ON "search_queries"("created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_analytics_event_time" ON "analytics_events"("event_name", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "idx_analytics_product" ON "analytics_events"("product_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "idx_email_logs_status" ON "email_logs"("status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_email_logs_order" ON "email_logs"("order_id");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_customer_group_id_fkey" FOREIGN KEY ("customer_group_id") REFERENCES "customer_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_currency_totals" ADD CONSTRAINT "customer_currency_totals_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_key_fkey" FOREIGN KEY ("permission_key") REFERENCES "permissions"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_granted_by_user_id_fkey" FOREIGN KEY ("granted_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_granted_by_user_id_fkey" FOREIGN KEY ("granted_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_impersonator_user_id_fkey" FOREIGN KEY ("impersonator_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "otp_requests" ADD CONSTRAINT "otp_requests_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "otp_requests" ADD CONSTRAINT "otp_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "markets" ADD CONSTRAINT "markets_currency_code_fkey" FOREIGN KEY ("currency_code") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_locations" ADD CONSTRAINT "market_locations_market_code_fkey" FOREIGN KEY ("market_code") REFERENCES "markets"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_locations" ADD CONSTRAINT "market_locations_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "inventory_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_impersonator_user_id_fkey" FOREIGN KEY ("impersonator_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settings" ADD CONSTRAINT "settings_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_job_rows" ADD CONSTRAINT "import_job_rows_import_job_id_fkey" FOREIGN KEY ("import_job_id") REFERENCES "import_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ═══════════════════════════════════════════════════════════════════════════════════
-- HAND-WRITTEN ADDENDUM
--
-- Everything below is a constraint or index Prisma cannot express. These are not
-- workarounds — 01 §1.2 names them as the designed escape hatches. Without them the
-- schema is documentation: a CHECK that lives only in a comment is not a CHECK, and a
-- unique index that is not partial rejects rows it should accept.
-- ═══════════════════════════════════════════════════════════════════════════════════

-- ── Currency and market invariants (02 §7.2) ──────────────────────────────────────
ALTER TABLE "currencies" ADD CONSTRAINT "chk_currencies_code_upper"
  CHECK (code = upper(code));
ALTER TABLE "markets" ADD CONSTRAINT "chk_markets_code_upper"
  CHECK (code = upper(code));
ALTER TABLE "markets" ADD CONSTRAINT "chk_markets_incoterm"
  CHECK (incoterm IN ('DDP','DAP'));
ALTER TABLE "markets" ADD CONSTRAINT "chk_markets_country_upper"
  CHECK (country_code = upper(country_code));

-- ── Users ─────────────────────────────────────────────────────────────────────────
-- A TOTP secret without an enrolment timestamp (or the reverse) is a half-enrolled
-- account: the privilege-line check reads one field and the recovery path reads the
-- other, so the pair must move together.
ALTER TABLE "users" ADD CONSTRAINT "chk_users_totp_pair"
  CHECK ((totp_secret_encrypted IS NULL) = (totp_enrolled_at IS NULL));

-- Email uniqueness applies to LIVE users only. A soft-deleted user must not block
-- re-hiring the same person, and lower() makes it case-insensitive without relying on
-- every call site remembering to normalise.
DROP INDEX IF EXISTS "users_email_key";
CREATE UNIQUE INDEX "idx_users_email_live" ON "users" (lower(email))
  WHERE deleted_at IS NULL;

DROP INDEX IF EXISTS "idx_users_active";
CREATE INDEX "idx_users_active" ON "users" (is_active, last_name)
  WHERE deleted_at IS NULL;

-- ── Sessions: exactly one principal (02 §7.3) ─────────────────────────────────────
-- THE load-bearing constraint of the auth model. A session carrying both a staff user
-- and a customer is a confused deputy waiting to happen: whichever resolver runs first
-- decides whether the request prices as a shopper or acts as an admin.
ALTER TABLE "sessions" ADD CONSTRAINT "chk_sessions_one_principal"
  CHECK ((user_id IS NOT NULL)::int + (customer_id IS NOT NULL)::int = 1);

-- Impersonation is a STAFF member acting as a CUSTOMER. An impersonator on a
-- staff-principal session is meaningless and would defeat the dual-actor audit.
ALTER TABLE "sessions" ADD CONSTRAINT "chk_sessions_impersonation"
  CHECK (impersonator_user_id IS NULL OR customer_id IS NOT NULL);

CREATE INDEX "idx_sessions_expiry" ON "sessions" (expires_at) WHERE revoked_at IS NULL;
CREATE INDEX "idx_sessions_customer" ON "sessions" (customer_id, created_at DESC)
  WHERE customer_id IS NOT NULL;
-- Without this, revokeAllForUser() scans every customer session in the database (07 §1.3).
CREATE INDEX "idx_sessions_user" ON "sessions" (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

-- ── OTP ───────────────────────────────────────────────────────────────────────────
CREATE INDEX "idx_otp_expiry" ON "otp_requests" (expires_at) WHERE consumed_at IS NULL;

-- ── Customers ─────────────────────────────────────────────────────────────────────
-- Uniqueness applies to non-anonymised rows: an erasure request must not permanently
-- burn the address for anyone who later shops under it.
DROP INDEX IF EXISTS "customers_email_key";
CREATE UNIQUE INDEX "idx_customers_email" ON "customers" (lower(email))
  WHERE anonymized_at IS NULL;

DROP INDEX IF EXISTS "idx_customers_group";
CREATE INDEX "idx_customers_group" ON "customers" (customer_group_id)
  WHERE anonymized_at IS NULL;

-- Admin customer search. GIN over a name+email tsvector: 'simple' rather than 'english'
-- because stemming a proper noun is wrong (02 §7.4).
CREATE INDEX "idx_customers_search" ON "customers"
  USING GIN (to_tsvector('simple',
    coalesce(first_name,'') || ' ' || coalesce(last_name,'') || ' ' || email));

ALTER TABLE "customer_currency_totals" ADD CONSTRAINT "chk_cct_nonneg"
  CHECK (total_spent_minor >= 0 AND total_refunded_minor >= 0 AND orders_count >= 0);

-- ── Newsletter ────────────────────────────────────────────────────────────────────
ALTER TABLE "newsletter_subscribers" ADD CONSTRAINT "chk_newsletter_status"
  CHECK (status IN ('pending','subscribed','unsubscribed','bounced'));
CREATE UNIQUE INDEX "idx_newsletter_email" ON "newsletter_subscribers" (lower(email));
CREATE INDEX "idx_newsletter_sendable" ON "newsletter_subscribers" (market_code)
  WHERE status = 'subscribed';

-- ── Inventory locations ───────────────────────────────────────────────────────────
CREATE UNIQUE INDEX "idx_inventory_locations_code" ON "inventory_locations" (code)
  WHERE deleted_at IS NULL;

-- ── Settings: the real identity (02 §7.11) ────────────────────────────────────────
-- NULLS NOT DISTINCT is what makes a market_code of NULL mean "the global row" and
-- collide with itself. Without it, two global rows for one key are insertable and
-- whichever the query happens to return wins.
CREATE UNIQUE INDEX "uq_settings_key_market" ON "settings" (key, market_code)
  NULLS NOT DISTINCT;

-- ── Email templates ───────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX "uq_email_templates" ON "email_templates" (key, market_code)
  NULLS NOT DISTINCT;
-- No button with no destination, and no destination with no button (06 §12.3).
ALTER TABLE "email_templates" ADD CONSTRAINT "chk_email_templates_cta"
  CHECK ((cta_label IS NULL) = (cta_url_template IS NULL));

CREATE INDEX "idx_email_logs_order_partial" ON "email_logs" (order_id)
  WHERE order_id IS NOT NULL;

-- ── Saved views ───────────────────────────────────────────────────────────────────
-- The coalesce is what lets one row mean "the shared view" (owner NULL) and another
-- "this user's view", under one unique index.
CREATE UNIQUE INDEX "idx_saved_views_name" ON "saved_views"
  (resource, coalesce(owner_user_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));
CREATE UNIQUE INDEX "idx_saved_views_default" ON "saved_views"
  (resource, coalesce(owner_user_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE is_default;

-- ── Jobs ──────────────────────────────────────────────────────────────────────────
DROP INDEX IF EXISTS "idx_jobs_claim";
CREATE INDEX "idx_jobs_claim" ON "jobs" (priority, run_after) WHERE status = 'queued';
DROP INDEX IF EXISTS "idx_jobs_stuck";
CREATE INDEX "idx_jobs_stuck" ON "jobs" (locked_at) WHERE status = 'running';

-- One in flight at a time, for the kinds where a second concurrent run would interleave
-- over the same source table.
CREATE UNIQUE INDEX "idx_jobs_singleton" ON "jobs" (kind)
  WHERE status IN ('queued','running')
    AND kind IN ('sitemap_rebuild','collection_refresh','reindex_search','media_orphan_scan',
                 'product_metrics_refresh','consistency_check','reconcile_inventory','audit_archive');

-- The per-entity and per-market form the singleton index cannot express: two
-- feed_rebuilds for different markets are fine, two for the same market are not.
CREATE UNIQUE INDEX "uq_jobs_dedupe" ON "jobs" (kind, dedupe_key)
  WHERE dedupe_key IS NOT NULL AND status IN ('queued','running');

-- ── Import jobs ───────────────────────────────────────────────────────────────────
ALTER TABLE "import_jobs" ADD CONSTRAINT "chk_import_jobs_resource"
  CHECK (resource IN ('products','variants','prices','inventory','customers','redirects'));
-- A price import without a market and currency would have to guess which market's price
-- column it is writing. There is no defensible guess (hard rule 2).
ALTER TABLE "import_jobs" ADD CONSTRAINT "chk_import_jobs_price_market"
  CHECK (resource <> 'prices' OR (market_code IS NOT NULL AND currency_code IS NOT NULL));

-- ── Search ────────────────────────────────────────────────────────────────────────
CREATE INDEX "idx_search_no_results" ON "search_queries"
  (market_code, normalized_query, created_at DESC) WHERE result_count = 0;

-- ── Analytics ─────────────────────────────────────────────────────────────────────
ALTER TABLE "analytics_events" ADD CONSTRAINT "chk_analytics_currency"
  CHECK (revenue_minor IS NULL OR currency_code IS NOT NULL);
-- occurred_at is client-supplied. Clamping it to a sane window around the server's own
-- clock stops a browser backdating events into a closed reporting period.
ALTER TABLE "analytics_events" ADD CONSTRAINT "chk_analytics_occurred_sane"
  CHECK (occurred_at BETWEEN created_at - interval '30 minutes'
                         AND created_at + interval '5 minutes');
-- BRIN, not BTREE: the table is append-ordered by time and reaches tens of millions of
-- rows. A BTREE over occurred_at costs orders of magnitude more space for the same
-- range scans (02 §7.11).
CREATE INDEX "idx_analytics_occurred_brin" ON "analytics_events"
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

CREATE TRIGGER "trg_audit_logs_no_update"
  BEFORE UPDATE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION "audit_logs_immutable"();

CREATE TRIGGER "trg_audit_logs_no_delete"
  BEFORE DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION "audit_logs_immutable"();
