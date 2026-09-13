-- Schema III — pricing, discounts and tax. P10.
--
-- Seventeen tables. Sixteen are P10's own; `media_tags` is a P06 omission this migration
-- also closes — the model was declared in prisma/schema/media.prisma and the table was never
-- created. `tests/db/drift.test.ts` did not catch it because its expected-table list was
-- hand-typed and `media_tags` was never added to it. That list is replaced in this commit by
-- one derived from the Prisma models themselves, so the next omission fails on its own.
--
-- Prisma's generated diff additionally proposed FIFTEEN destructive statements — fourteen
-- DROP INDEX / DROP CONSTRAINT against hand-written objects and one ALTER COLUMN … DROP
-- DEFAULT against the `products.search_vector` generated column. Every one has been removed.
-- This is the third time the same thing has happened (three at P05, fourteen at P06, fifteen
-- here) and it is not a mistake anyone is making: `prisma migrate diff` compares the database
-- against the Prisma schema, and every object in prisma/handwritten/addendum.sql exists
-- PRECISELY BECAUSE Prisma cannot express it, so each one reads as drift. `npm run db:guard`
-- is what refuses the migration if any survive.
--
-- The CHECK constraints, partial indexes and composite foreign keys that carry this phase's
-- actual invariants are in prisma/handwritten/addendum.sql, applied by `npm run db:deploy`
-- immediately after this file.

-- CreateEnum
CREATE TYPE "price_source" AS ENUM ('manual', 'metal_linked', 'hybrid');

-- CreateEnum
CREATE TYPE "price_change_reason" AS ENUM ('manual_edit', 'bulk_edit', 'csv_import', 'recalc_run', 'rule_activation', 'rule_expiry', 'seed');

-- CreateEnum
CREATE TYPE "pricing_rule_scope" AS ENUM ('all', 'product', 'category', 'collection', 'material', 'stone', 'tag', 'customer_group');

-- CreateEnum
CREATE TYPE "pricing_rule_adjustment" AS ENUM ('percentage_off', 'fixed_amount_off', 'fixed_price');

-- CreateEnum
CREATE TYPE "recalc_run_status" AS ENUM ('previewing', 'pending_approval', 'approved', 'applying', 'applied', 'rejected', 'failed');

-- CreateEnum
CREATE TYPE "discount_type" AS ENUM ('percentage', 'fixed_amount', 'free_shipping');

-- CreateEnum
CREATE TYPE "discount_trigger" AS ENUM ('code', 'automatic');

-- CreateEnum
CREATE TYPE "coupon_condition_type" AS ENUM ('min_subtotal', 'product', 'category', 'collection', 'customer_group', 'first_order_only', 'market', 'excludes_discounted');

-- CreateEnum
CREATE TYPE "gift_card_status" AS ENUM ('active', 'redeemed', 'expired', 'cancelled', 'disabled');

-- CreateTable
CREATE TABLE "media_tags" (
    "media_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_tags_pkey" PRIMARY KEY ("media_id","tag_id")
);

-- CreateTable
CREATE TABLE "prices" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "variant_id" UUID,
    "market_code" CHAR(2) NOT NULL,
    "currency_code" CHAR(3) NOT NULL,
    "list_minor" BIGINT NOT NULL,
    "sale_minor" BIGINT,
    "cost_minor" BIGINT,
    "compare_at_minor" BIGINT,
    "price_source" "price_source" NOT NULL,
    "material_id" UUID,
    "metal_rate_id" UUID,
    "metal_weight_grams" DECIMAL(10,3),
    "making_charge_minor" BIGINT,
    "making_charge_bp" INTEGER,
    "formula_version_id" UUID,
    "purity_ratio_bp" INTEGER,
    "metal_component_minor" BIGINT,
    "making_charge_computed_minor" BIGINT,
    "stone_cost_minor" BIGINT,
    "other_material_cost_minor" BIGINT,
    "markup_minor" BIGINT,
    "market_adjustment_delta_minor" BIGINT,
    "floor_adjustment_minor" BIGINT,
    "computed_base_minor" BIGINT,
    "rounding_adjustment_minor" BIGINT,
    "hybrid_adjustment_delta_minor" BIGINT,
    "inputs_digest" BYTEA,
    "valid_from" TIMESTAMPTZ(6) NOT NULL,
    "valid_to" TIMESTAMPTZ(6),
    "created_by_user_id" UUID,
    "recalc_run_id" UUID,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_history" (
    "id" UUID NOT NULL,
    "price_id" UUID NOT NULL,
    "previous_price_id" UUID,
    "product_id" UUID NOT NULL,
    "variant_id" UUID,
    "market_code" CHAR(2) NOT NULL,
    "currency_code" CHAR(3) NOT NULL,
    "previous_list_minor" BIGINT,
    "new_list_minor" BIGINT,
    "previous_sale_minor" BIGINT,
    "new_sale_minor" BIGINT,
    "change_bp" INTEGER,
    "reason" "price_change_reason" NOT NULL,
    "recalc_run_id" UUID,
    "actor_type" "actor_type" NOT NULL,
    "actor_user_id" UUID,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metal_rates" (
    "id" UUID NOT NULL,
    "material_id" UUID NOT NULL,
    "currency_code" CHAR(3) NOT NULL,
    "rate_minor_per_gram" BIGINT NOT NULL,
    "rate_scale" SMALLINT NOT NULL,
    "effective_at" TIMESTAMPTZ(6) NOT NULL,
    "source" TEXT NOT NULL,
    "source_reference" TEXT,
    "entered_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "metal_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing_formulas" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "published_version_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pricing_formulas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing_formula_versions" (
    "id" UUID NOT NULL,
    "formula_id" UUID NOT NULL,
    "version_no" INTEGER NOT NULL,
    "material_id" UUID,
    "purity_source" TEXT NOT NULL,
    "purity_ratio_bp" INTEGER,
    "weight_source" TEXT NOT NULL,
    "fixed_weight_milligrams" BIGINT,
    "making_charge_mode" TEXT NOT NULL,
    "making_charge_bp" INTEGER,
    "include_stone_cost" BOOLEAN NOT NULL DEFAULT true,
    "include_other_material_cost" BOOLEAN NOT NULL DEFAULT true,
    "markup_mode" TEXT NOT NULL,
    "markup_bp" INTEGER,
    "created_by_user_id" UUID,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pricing_formula_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing_formula_market_terms" (
    "formula_version_id" UUID NOT NULL,
    "market_code" CHAR(2) NOT NULL,
    "currency_code" CHAR(3) NOT NULL,
    "making_charge_minor" BIGINT,
    "making_charge_per_gram_minor" BIGINT,
    "markup_minor" BIGINT,
    "market_adjustment_delta_minor" BIGINT,
    "market_adjustment_bp" INTEGER,
    "rounding_increment_minor" BIGINT NOT NULL DEFAULT 1,
    "rounding_mode" TEXT NOT NULL DEFAULT 'half_up',
    "floor_minor" BIGINT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pricing_formula_market_terms_pkey" PRIMARY KEY ("formula_version_id","market_code")
);

-- CreateTable
CREATE TABLE "price_formula_bindings" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "market_code" CHAR(2) NOT NULL,
    "currency_code" CHAR(3) NOT NULL,
    "formula_id" UUID NOT NULL,
    "mode" TEXT NOT NULL,
    "hybrid_adjustment_type" TEXT,
    "hybrid_adjustment_bp" INTEGER,
    "hybrid_adjustment_delta_minor" BIGINT,
    "hybrid_override_minor" BIGINT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "price_formula_bindings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "variant_component_costs" (
    "variant_id" UUID NOT NULL,
    "currency_code" CHAR(3) NOT NULL,
    "component_kind" TEXT NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "variant_component_costs_pkey" PRIMARY KEY ("variant_id","currency_code","component_kind")
);

-- CreateTable
CREATE TABLE "recalc_runs" (
    "id" UUID NOT NULL,
    "status" "recalc_run_status" NOT NULL,
    "market_code" CHAR(2),
    "material_id" UUID,
    "triggered_by" "actor_type" NOT NULL,
    "created_by_user_id" UUID,
    "approved_by_user_id" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "applied_at" TIMESTAMPTZ(6),
    "job_id" UUID,
    "line_count" INTEGER NOT NULL DEFAULT 0,
    "skipped_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "total_increase_minor" BIGINT NOT NULL DEFAULT 0,
    "total_decrease_minor" BIGINT NOT NULL DEFAULT 0,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "recalc_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recalc_run_lines" (
    "id" UUID NOT NULL,
    "recalc_run_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "market_code" CHAR(2) NOT NULL,
    "currency_code" CHAR(3) NOT NULL,
    "current_price_id" UUID,
    "current_list_minor" BIGINT,
    "proposed_list_minor" BIGINT,
    "metal_rate_id" UUID,
    "status" TEXT NOT NULL,
    "skip_reason" TEXT,
    "new_price_id" UUID,
    "proposed_metal_component_minor" BIGINT,
    "proposed_making_charge_computed_minor" BIGINT,
    "proposed_stone_cost_minor" BIGINT,
    "proposed_other_material_cost_minor" BIGINT,
    "proposed_markup_minor" BIGINT,
    "proposed_market_adjustment_delta_minor" BIGINT,
    "proposed_floor_adjustment_minor" BIGINT,
    "proposed_rounding_adjustment_minor" BIGINT,
    "proposed_inputs_digest" BYTEA,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recalc_run_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing_rules" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "scope_type" "pricing_rule_scope" NOT NULL,
    "scope_id" UUID,
    "market_code" CHAR(2) NOT NULL,
    "currency_code" CHAR(3) NOT NULL,
    "adjustment_type" "pricing_rule_adjustment" NOT NULL,
    "value_bp" INTEGER,
    "amount_minor" BIGINT,
    "priority" SMALLINT NOT NULL DEFAULT 0,
    "is_stackable" BOOLEAN NOT NULL DEFAULT false,
    "starts_at" TIMESTAMPTZ(6),
    "ends_at" TIMESTAMPTZ(6),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pricing_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupons" (
    "id" UUID NOT NULL,
    "code" TEXT,
    "trigger" "discount_trigger" NOT NULL,
    "name" TEXT NOT NULL,
    "customer_label" TEXT,
    "type" "discount_type" NOT NULL,
    "value_bp" INTEGER,
    "applies_to" TEXT NOT NULL,
    "max_redemptions" INTEGER,
    "max_redemptions_per_customer" INTEGER,
    "redemption_count" INTEGER NOT NULL DEFAULT 0,
    "starts_at" TIMESTAMPTZ(6),
    "ends_at" TIMESTAMPTZ(6),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_stackable" BOOLEAN NOT NULL DEFAULT false,
    "priority" SMALLINT NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupon_amounts" (
    "coupon_id" UUID NOT NULL,
    "currency_code" CHAR(3) NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "min_subtotal_minor" BIGINT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "coupon_amounts_pkey" PRIMARY KEY ("coupon_id","currency_code")
);

-- CreateTable
CREATE TABLE "coupon_conditions" (
    "id" UUID NOT NULL,
    "coupon_id" UUID NOT NULL,
    "type" "coupon_condition_type" NOT NULL,
    "operator" TEXT NOT NULL,
    "target_id" UUID,
    "market_code" CHAR(2),
    "value_minor" BIGINT,
    "currency_code" CHAR(3),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coupon_conditions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gift_cards" (
    "id" UUID NOT NULL,
    "code_hash" BYTEA NOT NULL,
    "code_last4" CHAR(4) NOT NULL,
    "currency_code" CHAR(3) NOT NULL,
    "initial_balance_minor" BIGINT NOT NULL,
    "balance_minor" BIGINT NOT NULL,
    "status" "gift_card_status" NOT NULL,
    "issued_to_customer_id" UUID,
    "issued_by_order_id" UUID,
    "expires_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "gift_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_rules" (
    "id" UUID NOT NULL,
    "market_code" CHAR(2) NOT NULL,
    "currency_code" CHAR(3) NOT NULL,
    "country_code" CHAR(2) NOT NULL,
    "region_code" TEXT,
    "tax_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rate_bp" INTEGER NOT NULL,
    "is_compound" BOOLEAN NOT NULL DEFAULT false,
    "applies_to_shipping" BOOLEAN NOT NULL DEFAULT true,
    "priority" SMALLINT NOT NULL DEFAULT 0,
    "starts_at" TIMESTAMPTZ(6),
    "ends_at" TIMESTAMPTZ(6),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tax_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_media_tags_tag" ON "media_tags"("tag_id", "media_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_prices_id_market" ON "prices"("id", "market_code");

-- CreateIndex
CREATE UNIQUE INDEX "uq_metal_rates" ON "metal_rates"("material_id", "currency_code", "effective_at");

-- CreateIndex
CREATE UNIQUE INDEX "uq_pricing_formula_versions" ON "pricing_formula_versions"("formula_id", "version_no");

-- CreateIndex
CREATE UNIQUE INDEX "uq_pricing_formula_versions_id_formula" ON "pricing_formula_versions"("id", "formula_id");

-- CreateIndex
CREATE INDEX "idx_vcc_currency" ON "variant_component_costs"("currency_code", "variant_id");

-- CreateIndex
CREATE INDEX "idx_recalc_run_lines_run" ON "recalc_run_lines"("recalc_run_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "uq_recalc_run_lines" ON "recalc_run_lines"("recalc_run_id", "variant_id", "market_code");

-- CreateIndex
CREATE INDEX "idx_coupon_conditions_coupon" ON "coupon_conditions"("coupon_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_gift_cards_code_hash" ON "gift_cards"("code_hash");

-- AddForeignKey
ALTER TABLE "media_tags" ADD CONSTRAINT "media_tags_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prices" ADD CONSTRAINT "prices_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prices" ADD CONSTRAINT "prices_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prices" ADD CONSTRAINT "prices_market_code_currency_code_fkey" FOREIGN KEY ("market_code", "currency_code") REFERENCES "markets"("code", "currency_code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prices" ADD CONSTRAINT "prices_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prices" ADD CONSTRAINT "prices_metal_rate_id_fkey" FOREIGN KEY ("metal_rate_id") REFERENCES "metal_rates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prices" ADD CONSTRAINT "prices_formula_version_id_fkey" FOREIGN KEY ("formula_version_id") REFERENCES "pricing_formula_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prices" ADD CONSTRAINT "prices_recalc_run_id_fkey" FOREIGN KEY ("recalc_run_id") REFERENCES "recalc_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_price_id_fkey" FOREIGN KEY ("price_id") REFERENCES "prices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_previous_price_id_fkey" FOREIGN KEY ("previous_price_id") REFERENCES "prices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_recalc_run_id_fkey" FOREIGN KEY ("recalc_run_id") REFERENCES "recalc_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metal_rates" ADD CONSTRAINT "metal_rates_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metal_rates" ADD CONSTRAINT "metal_rates_currency_code_fkey" FOREIGN KEY ("currency_code") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_formulas" ADD CONSTRAINT "pricing_formulas_published_version_id_fkey" FOREIGN KEY ("published_version_id") REFERENCES "pricing_formula_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_formula_versions" ADD CONSTRAINT "pricing_formula_versions_formula_id_fkey" FOREIGN KEY ("formula_id") REFERENCES "pricing_formulas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_formula_versions" ADD CONSTRAINT "pricing_formula_versions_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_formula_market_terms" ADD CONSTRAINT "pricing_formula_market_terms_formula_version_id_fkey" FOREIGN KEY ("formula_version_id") REFERENCES "pricing_formula_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_formula_market_terms" ADD CONSTRAINT "pricing_formula_market_terms_market_code_currency_code_fkey" FOREIGN KEY ("market_code", "currency_code") REFERENCES "markets"("code", "currency_code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_formula_bindings" ADD CONSTRAINT "price_formula_bindings_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_formula_bindings" ADD CONSTRAINT "price_formula_bindings_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_formula_bindings" ADD CONSTRAINT "price_formula_bindings_market_code_currency_code_fkey" FOREIGN KEY ("market_code", "currency_code") REFERENCES "markets"("code", "currency_code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_formula_bindings" ADD CONSTRAINT "price_formula_bindings_formula_id_fkey" FOREIGN KEY ("formula_id") REFERENCES "pricing_formulas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "variant_component_costs" ADD CONSTRAINT "variant_component_costs_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "variant_component_costs" ADD CONSTRAINT "variant_component_costs_currency_code_fkey" FOREIGN KEY ("currency_code") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recalc_runs" ADD CONSTRAINT "recalc_runs_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recalc_run_lines" ADD CONSTRAINT "recalc_run_lines_recalc_run_id_fkey" FOREIGN KEY ("recalc_run_id") REFERENCES "recalc_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recalc_run_lines" ADD CONSTRAINT "recalc_run_lines_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recalc_run_lines" ADD CONSTRAINT "recalc_run_lines_metal_rate_id_fkey" FOREIGN KEY ("metal_rate_id") REFERENCES "metal_rates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_rules" ADD CONSTRAINT "pricing_rules_market_code_currency_code_fkey" FOREIGN KEY ("market_code", "currency_code") REFERENCES "markets"("code", "currency_code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_amounts" ADD CONSTRAINT "coupon_amounts_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_amounts" ADD CONSTRAINT "coupon_amounts_currency_code_fkey" FOREIGN KEY ("currency_code") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_conditions" ADD CONSTRAINT "coupon_conditions_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gift_cards" ADD CONSTRAINT "gift_cards_currency_code_fkey" FOREIGN KEY ("currency_code") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_rules" ADD CONSTRAINT "tax_rules_market_code_currency_code_fkey" FOREIGN KEY ("market_code", "currency_code") REFERENCES "markets"("code", "currency_code") ON DELETE RESTRICT ON UPDATE CASCADE;

