-- CreateEnum
CREATE TYPE "product_status" AS ENUM ('draft', 'active', 'archived');

-- CreateEnum
CREATE TYPE "inventory_policy" AS ENUM ('tracked', 'made_to_order', 'untracked');

-- CreateEnum
CREATE TYPE "collection_mode" AS ENUM ('manual', 'automatic');

-- CreateEnum
CREATE TYPE "collection_rule_field" AS ENUM ('category', 'stone', 'material', 'tag', 'attribute', 'price', 'status', 'created_at', 'is_one_of_a_kind', 'stone_is_lab_grown', 'is_on_sale');

-- CreateEnum
CREATE TYPE "collection_rule_operator" AS ENUM ('equals', 'not_equals', 'in', 'not_in', 'contains', 'not_contains', 'starts_with', 'gt', 'gte', 'lt', 'lte', 'is_true', 'is_false');

-- CreateEnum
CREATE TYPE "attribute_data_type" AS ENUM ('text', 'number', 'decimal', 'boolean', 'select', 'multi_select', 'measurement', 'currency', 'date');

-- CreateEnum
CREATE TYPE "media_kind" AS ENUM ('image', 'video', 'document', 'vector');

-- CreateEnum
CREATE TYPE "product_media_role" AS ENUM ('hero', 'gallery', 'detail', 'lifestyle', 'mobile', 'video_thumbnail');

-- CreateEnum
CREATE TYPE "seo_entity_type" AS ENUM ('product', 'category', 'collection', 'stone', 'material', 'cms_page', 'journal_post', 'curated_facet', 'home');

-- (removed) Prisma proposed dropping a hand-written index it cannot express.
-- DROP INDEX "idx_analytics_occurred_brin";   <- refused by scripts/guard-migration.ts

-- (removed) Prisma proposed dropping a hand-written index it cannot express.
-- DROP INDEX "uq_email_templates";   <- refused by scripts/guard-migration.ts

-- (removed) Prisma proposed dropping a hand-written index it cannot express.
-- DROP INDEX "uq_settings_key_market";   <- refused by scripts/guard-migration.ts

-- CreateTable
CREATE TABLE "attributes" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "data_type" "attribute_data_type" NOT NULL,
    "unit" TEXT,
    "is_filterable" BOOLEAN NOT NULL DEFAULT false,
    "is_comparable" BOOLEAN NOT NULL DEFAULT false,
    "applies_to_category_id" UUID,
    "scope" TEXT NOT NULL DEFAULT 'product',
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "value_min" DECIMAL(14,4),
    "value_max" DECIMAL(14,4),
    "decimal_places" SMALLINT,
    "max_length" INTEGER,
    "help_text" TEXT,
    "rank" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "attributes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attribute_options" (
    "id" UUID NOT NULL,
    "attribute_id" UUID NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "swatch_media_id" UUID,
    "rank" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "attribute_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_attribute_values" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "variant_id" UUID,
    "attribute_id" UUID NOT NULL,
    "option_id" UUID,
    "value_text" TEXT,
    "value_numeric" DECIMAL(14,4),
    "value_bool" BOOLEAN,
    "value_date" DATE,
    "value_json" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "product_attribute_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "parent_id" UUID,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "materialized_path" TEXT NOT NULL,
    "depth" SMALLINT NOT NULL,
    "description_json" JSONB,
    "hero_media_id" UUID,
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "rank" INTEGER NOT NULL,
    "tax_code" TEXT,
    "sku_token" CHAR(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "description_json" JSONB,
    "care_instructions_json" JSONB,
    "status" "product_status" NOT NULL DEFAULT 'draft',
    "published_at" TIMESTAMPTZ(6),
    "primary_category_id" UUID,
    "is_one_of_a_kind" BOOLEAN NOT NULL DEFAULT false,
    "is_made_to_order" BOOLEAN NOT NULL DEFAULT false,
    "lead_time_days" SMALLINT,
    "default_variant_id" UUID,
    "rank" INTEGER NOT NULL DEFAULT 0,
    "search_text" TEXT NOT NULL DEFAULT '',
    "completeness_score" SMALLINT NOT NULL DEFAULT 0,
    "completeness_checks" JSONB NOT NULL DEFAULT '{}',
    "seo_score" SMALLINT NOT NULL DEFAULT 0,
    "seo_checks" JSONB NOT NULL DEFAULT '{}',
    "scored_at" TIMESTAMPTZ(6),
    "ooak_quantity_override" BOOLEAN NOT NULL DEFAULT false,
    "sold_at" TIMESTAMPTZ(6),
    "tax_code" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_variants" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "is_one_of_a_kind" BOOLEAN NOT NULL DEFAULT false,
    "sku" TEXT NOT NULL,
    "title" TEXT,
    "position" SMALLINT NOT NULL DEFAULT 0,
    "inventory_policy" "inventory_policy" NOT NULL DEFAULT 'tracked',
    "barcode" TEXT,
    "hs_code" TEXT,
    "country_of_origin" CHAR(2),
    "gross_weight_grams" DECIMAL(10,3),
    "ring_size" DECIMAL(6,2),
    "length_mm" DECIMAL(6,2),
    "option_signature" TEXT NOT NULL DEFAULT '',
    "tax_code" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_options" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "position" SMALLINT NOT NULL DEFAULT 0,

    CONSTRAINT "product_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_option_values" (
    "id" UUID NOT NULL,
    "option_id" UUID NOT NULL,
    "value" TEXT NOT NULL,
    "swatch_media_id" UUID,
    "material_id" UUID,
    "position" SMALLINT NOT NULL DEFAULT 0,

    CONSTRAINT "product_option_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "variant_option_values" (
    "variant_id" UUID NOT NULL,
    "option_id" UUID NOT NULL,
    "option_value_id" UUID NOT NULL,

    CONSTRAINT "variant_option_values_pkey" PRIMARY KEY ("variant_id","option_id")
);

-- CreateTable
CREATE TABLE "stones" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "short_description" TEXT,
    "description_json" JSONB,
    "hero_media_id" UUID,
    "swatch_media_id" UUID,
    "colour_hex" CHAR(7),
    "hardness_mohs" DECIMAL(3,1),
    "is_lab_grown" BOOLEAN NOT NULL DEFAULT false,
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "rank" INTEGER NOT NULL DEFAULT 0,
    "sku_token" CHAR(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "stones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_stones" (
    "product_id" UUID NOT NULL,
    "stone_id" UUID NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "carat_weight" DECIMAL(8,3),
    "stone_count" SMALLINT,
    "cut" TEXT,
    "position" SMALLINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_stones_pkey" PRIMARY KEY ("product_id","stone_id")
);

-- CreateTable
CREATE TABLE "materials" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "purity_label" TEXT,
    "purity_ratio" DECIMAL(6,5),
    "is_rate_linked" BOOLEAN NOT NULL DEFAULT false,
    "colour_hex" CHAR(7),
    "swatch_media_id" UUID,
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "rank" INTEGER NOT NULL DEFAULT 0,
    "sku_token" CHAR(4),
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "variant_materials" (
    "variant_id" UUID NOT NULL,
    "material_id" UUID NOT NULL,
    "weight_grams" DECIMAL(10,3) NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "variant_materials_pkey" PRIMARY KEY ("variant_id","material_id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_visible" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_tags" (
    "product_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_tags_pkey" PRIMARY KEY ("product_id","tag_id")
);

-- CreateTable
CREATE TABLE "product_categories" (
    "product_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "rank" INTEGER NOT NULL DEFAULT 0,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_categories_pkey" PRIMARY KEY ("product_id","category_id")
);

-- CreateTable
CREATE TABLE "product_market_content" (
    "product_id" UUID NOT NULL,
    "market_code" CHAR(2) NOT NULL,
    "title" TEXT,
    "subtitle" TEXT,
    "description_json" JSONB,
    "is_published" BOOLEAN NOT NULL DEFAULT true,
    "unavailable_reason" TEXT,
    "rank_override" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "product_market_content_pkey" PRIMARY KEY ("product_id","market_code")
);

-- CreateTable
CREATE TABLE "category_market_content" (
    "category_id" UUID NOT NULL,
    "market_code" CHAR(2) NOT NULL,
    "name" TEXT,
    "description_json" JSONB,
    "isPublished" BOOLEAN,
    "rank_override" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "category_market_content_pkey" PRIMARY KEY ("category_id","market_code")
);

-- CreateTable
CREATE TABLE "product_market_sort" (
    "product_id" UUID NOT NULL,
    "market_code" CHAR(2) NOT NULL,
    "currency_code" CHAR(3) NOT NULL,
    "min_price_minor" BIGINT NOT NULL,
    "max_price_minor" BIGINT NOT NULL,
    "units_90d" INTEGER NOT NULL DEFAULT 0,
    "refreshed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_market_sort_pkey" PRIMARY KEY ("product_id","market_code")
);

-- CreateTable
CREATE TABLE "collections" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description_json" JSONB,
    "hero_media_id" UUID,
    "mode" "collection_mode" NOT NULL DEFAULT 'manual',
    "rule_match" TEXT NOT NULL DEFAULT 'all',
    "sort_order" TEXT NOT NULL DEFAULT 'manual',
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "starts_at" TIMESTAMPTZ(6),
    "ends_at" TIMESTAMPTZ(6),
    "last_refreshed_at" TIMESTAMPTZ(6),
    "requires_sale_in_market" BOOLEAN NOT NULL DEFAULT false,
    "rank" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "collections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collection_rules" (
    "id" UUID NOT NULL,
    "collection_id" UUID NOT NULL,
    "field" "collection_rule_field" NOT NULL,
    "operator" "collection_rule_operator" NOT NULL,
    "value_text" TEXT,
    "value_uuid" UUID,
    "value_numeric" DECIMAL(14,4),
    "value_market_code" CHAR(2),
    "attribute_id" UUID,
    "position" SMALLINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collection_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_collections" (
    "product_id" UUID NOT NULL,
    "collection_id" UUID NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'rule',
    "rank" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_collections_pkey" PRIMARY KEY ("product_id","collection_id")
);

-- CreateTable
CREATE TABLE "collection_market_content" (
    "collection_id" UUID NOT NULL,
    "market_code" CHAR(2) NOT NULL,
    "title" TEXT,
    "description_json" JSONB,
    "isPublished" BOOLEAN,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "collection_market_content_pkey" PRIMARY KEY ("collection_id","market_code")
);

-- CreateTable
CREATE TABLE "curated_facets" (
    "id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "facet_type" TEXT NOT NULL,
    "stone_id" UUID,
    "material_id" UUID,
    "attribute_option_id" UUID,
    "tag_id" UUID,
    "title" TEXT NOT NULL,
    "intro_json" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_auto" BOOLEAN NOT NULL DEFAULT false,
    "product_count_cached" INTEGER NOT NULL DEFAULT 0,
    "rank" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "curated_facets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "curated_facet_markets" (
    "facet_id" UUID NOT NULL,
    "market_code" CHAR(2) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "product_count" INTEGER NOT NULL DEFAULT 0,
    "refreshed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "curated_facet_markets_pkey" PRIMARY KEY ("facet_id","market_code")
);

-- CreateTable
CREATE TABLE "seo_metadata" (
    "id" UUID NOT NULL,
    "entity_type" "seo_entity_type" NOT NULL,
    "entity_id" UUID,
    "market_code" CHAR(2),
    "title" TEXT,
    "description" TEXT,
    "canonical_path" TEXT,
    "og_title" TEXT,
    "og_description" TEXT,
    "og_media_id" UUID,
    "robots_noindex" BOOLEAN NOT NULL DEFAULT false,
    "robots_nofollow" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "seo_metadata_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "redirects" (
    "id" UUID NOT NULL,
    "from_path" TEXT NOT NULL,
    "to_path" TEXT NOT NULL,
    "status_code" SMALLINT NOT NULL DEFAULT 301,
    "market_code" CHAR(2),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "hit_count" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "redirects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_folders" (
    "id" UUID NOT NULL,
    "parent_id" UUID,
    "name" TEXT NOT NULL,
    "materialized_path" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "media_folders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media" (
    "id" UUID NOT NULL,
    "folder_id" UUID,
    "kind" "media_kind" NOT NULL,
    "provider" TEXT NOT NULL,
    "public_id" TEXT NOT NULL,
    "version" TEXT,
    "format" TEXT NOT NULL,
    "bytes" BIGINT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "duration_seconds" DECIMAL(8,2),
    "alt_text" TEXT,
    "title" TEXT,
    "credit" TEXT,
    "dominant_colour_hex" CHAR(7),
    "blur_data_url" TEXT,
    "checksum_sha256" BYTEA,
    "uploaded_by_user_id" UUID,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_media" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "variant_id" UUID,
    "media_id" UUID NOT NULL,
    "role" "product_media_role" NOT NULL,
    "position" SMALLINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_media_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_product_variants_id_product" ON "product_variants"("id", "product_id");

-- CreateIndex
CREATE INDEX "idx_variant_option_values_value" ON "variant_option_values"("option_value_id", "variant_id");

-- CreateIndex
CREATE INDEX "idx_product_stones" ON "product_stones"("stone_id", "product_id");

-- CreateIndex
CREATE INDEX "idx_variant_materials_material" ON "variant_materials"("material_id", "variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_tags_slug" ON "tags"("slug");

-- CreateIndex
CREATE INDEX "idx_product_tags_tag" ON "product_tags"("tag_id", "product_id");

-- CreateIndex
CREATE INDEX "idx_collection_rules_collection" ON "collection_rules"("collection_id", "position");

-- CreateIndex
CREATE INDEX "idx_collection_rules_field_target" ON "collection_rules"("field", "value_uuid");

-- CreateIndex
CREATE UNIQUE INDEX "uq_curated_facets" ON "curated_facets"("category_id", "slug");

-- CreateIndex
CREATE INDEX "idx_product_media_product" ON "product_media"("product_id", "position");

-- AddForeignKey
ALTER TABLE "attributes" ADD CONSTRAINT "attributes_applies_to_category_id_fkey" FOREIGN KEY ("applies_to_category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attribute_options" ADD CONSTRAINT "attribute_options_attribute_id_fkey" FOREIGN KEY ("attribute_id") REFERENCES "attributes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_attribute_values" ADD CONSTRAINT "product_attribute_values_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_attribute_values" ADD CONSTRAINT "product_attribute_values_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_attribute_values" ADD CONSTRAINT "product_attribute_values_attribute_id_fkey" FOREIGN KEY ("attribute_id") REFERENCES "attributes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_attribute_values" ADD CONSTRAINT "product_attribute_values_option_id_fkey" FOREIGN KEY ("option_id") REFERENCES "attribute_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_primary_category_id_fkey" FOREIGN KEY ("primary_category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_options" ADD CONSTRAINT "product_options_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_option_values" ADD CONSTRAINT "product_option_values_option_id_fkey" FOREIGN KEY ("option_id") REFERENCES "product_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_option_values" ADD CONSTRAINT "product_option_values_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "variant_option_values" ADD CONSTRAINT "variant_option_values_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "variant_option_values" ADD CONSTRAINT "variant_option_values_option_value_id_fkey" FOREIGN KEY ("option_value_id") REFERENCES "product_option_values"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_stones" ADD CONSTRAINT "product_stones_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_stones" ADD CONSTRAINT "product_stones_stone_id_fkey" FOREIGN KEY ("stone_id") REFERENCES "stones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "variant_materials" ADD CONSTRAINT "variant_materials_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "variant_materials" ADD CONSTRAINT "variant_materials_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_tags" ADD CONSTRAINT "product_tags_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_tags" ADD CONSTRAINT "product_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_market_content" ADD CONSTRAINT "product_market_content_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_market_content" ADD CONSTRAINT "category_market_content_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_market_sort" ADD CONSTRAINT "product_market_sort_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_rules" ADD CONSTRAINT "collection_rules_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_collections" ADD CONSTRAINT "product_collections_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_collections" ADD CONSTRAINT "product_collections_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_market_content" ADD CONSTRAINT "collection_market_content_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curated_facets" ADD CONSTRAINT "curated_facets_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curated_facets" ADD CONSTRAINT "curated_facets_stone_id_fkey" FOREIGN KEY ("stone_id") REFERENCES "stones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curated_facets" ADD CONSTRAINT "curated_facets_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curated_facets" ADD CONSTRAINT "curated_facets_attribute_option_id_fkey" FOREIGN KEY ("attribute_option_id") REFERENCES "attribute_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curated_facets" ADD CONSTRAINT "curated_facets_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curated_facet_markets" ADD CONSTRAINT "curated_facet_markets_facet_id_fkey" FOREIGN KEY ("facet_id") REFERENCES "curated_facets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_folders" ADD CONSTRAINT "media_folders_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "media_folders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media" ADD CONSTRAINT "media_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "media_folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_media" ADD CONSTRAINT "product_media_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_media" ADD CONSTRAINT "product_media_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_media" ADD CONSTRAINT "product_media_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ═══════════════════════════════════════════════════════════════════════════════════
-- HAND-WRITTEN ADDENDUM — Schema II
-- Partial uniques, expression indexes, CHECK constraints and the search vector.
-- ═══════════════════════════════════════════════════════════════════════════════════

-- ── Live-slug uniqueness. Partial, so a soft-deleted row does not reserve its slug
--    forever — and a re-created product can take its old URL back.
DROP INDEX IF EXISTS "categories_slug_key";
CREATE UNIQUE INDEX "idx_categories_slug_live" ON "categories" (slug) WHERE deleted_at IS NULL;
DROP INDEX IF EXISTS "products_slug_key";
CREATE UNIQUE INDEX "idx_products_slug_live" ON "products" (slug) WHERE deleted_at IS NULL;
DROP INDEX IF EXISTS "stones_slug_key";
CREATE UNIQUE INDEX "idx_stones_slug_live" ON "stones" (slug) WHERE deleted_at IS NULL;
DROP INDEX IF EXISTS "materials_slug_key";
CREATE UNIQUE INDEX "idx_materials_slug_live" ON "materials" (slug) WHERE deleted_at IS NULL;
DROP INDEX IF EXISTS "collections_slug_key";
CREATE UNIQUE INDEX "idx_collections_slug_live" ON "collections" (slug) WHERE deleted_at IS NULL;
DROP INDEX IF EXISTS "product_variants_sku_key";
CREATE UNIQUE INDEX "idx_variants_sku_live" ON "product_variants" (sku) WHERE deleted_at IS NULL;
DROP INDEX IF EXISTS "attributes_key_key";
CREATE UNIQUE INDEX "idx_attributes_key_live" ON "attributes" (key) WHERE deleted_at IS NULL;

-- ── Categories ───────────────────────────────────────────────────────────────────
ALTER TABLE "categories" ADD CONSTRAINT "chk_categories_not_self_parent"
  CHECK (parent_id IS NULL OR parent_id <> id);
CREATE INDEX "idx_categories_parent_rank" ON "categories" (parent_id, rank) WHERE deleted_at IS NULL;
-- text_pattern_ops so `materialized_path LIKE '<id>/%'` — "everything under RINGS" — is
-- an index range scan rather than a recursive CTE on every listing page.
CREATE INDEX "idx_categories_path" ON "categories" (materialized_path text_pattern_ops);
ALTER TABLE "categories" ADD CONSTRAINT "chk_categories_sku_token_upper"
  CHECK (sku_token IS NULL OR sku_token = upper(sku_token));

-- ── Products ─────────────────────────────────────────────────────────────────────
CREATE INDEX "idx_products_published" ON "products" (status, published_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX "idx_products_title_trgm" ON "products" USING GIN (title gin_trgm_ops);
CREATE INDEX "idx_products_ooak" ON "products" (id) WHERE is_one_of_a_kind AND deleted_at IS NULL;
CREATE INDEX "idx_products_completeness" ON "products" (completeness_score, id) WHERE deleted_at IS NULL;
CREATE INDEX "idx_products_sold" ON "products" (sold_at DESC) WHERE sold_at IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX "idx_products_updated" ON "products" (updated_at DESC) WHERE deleted_at IS NULL;

-- The composite-unique target that lets another table's denormalised `is_one_of_a_kind`
-- be provably THIS product's own rather than a value someone passed in.
ALTER TABLE "products" ADD CONSTRAINT "uq_products_id_ooak" UNIQUE (id, is_one_of_a_kind);

-- The search vector: a STORED generated column, which Prisma cannot express at all. It is
-- weighted — a match on the title outranks a match on a category name — and it is the
-- reason `search_text` is denormalised from seven sources rather than joined at query time.
ALTER TABLE "products"
  ADD COLUMN "search_vector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(subtitle, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(search_text, '')), 'C')
  ) STORED;
CREATE INDEX "idx_products_search_vector" ON "products" USING GIN (search_vector);

-- ── Variants ─────────────────────────────────────────────────────────────────────
CREATE INDEX "idx_variants_product" ON "product_variants" (product_id, position) WHERE deleted_at IS NULL;
-- A one-of-a-kind product has exactly ONE variant. Without this, a second variant makes
-- "quantity 1" meaningless and the piece is sellable twice by construction.
CREATE UNIQUE INDEX "idx_variants_ooak_single" ON "product_variants" (product_id)
  WHERE is_one_of_a_kind AND deleted_at IS NULL;
ALTER TABLE "product_variants" ADD CONSTRAINT "uq_variants_id_ooak" UNIQUE (id, is_one_of_a_kind);
CREATE UNIQUE INDEX "idx_variants_option_signature" ON "product_variants" (product_id, option_signature)
  WHERE deleted_at IS NULL AND option_signature <> '';
CREATE INDEX "idx_variants_sku_prefix" ON "product_variants" (sku text_pattern_ops) WHERE deleted_at IS NULL;

-- ── Options and their values ─────────────────────────────────────────────────────
CREATE UNIQUE INDEX "uq_product_options" ON "product_options" (product_id, lower(name));
CREATE UNIQUE INDEX "uq_option_values" ON "product_option_values" (option_id, lower(value));

-- ── Stones and materials ─────────────────────────────────────────────────────────
-- Exactly one primary stone per product, and one primary material per variant. Without
-- these, "the stone" on a product page is whichever row the query happened to return.
CREATE UNIQUE INDEX "idx_product_stones_primary" ON "product_stones" (product_id) WHERE is_primary;
CREATE UNIQUE INDEX "idx_variant_materials_primary" ON "variant_materials" (variant_id) WHERE is_primary;
ALTER TABLE "variant_materials" ADD CONSTRAINT "chk_variant_materials_weight"
  CHECK (weight_grams > 0);
ALTER TABLE "materials" ADD CONSTRAINT "chk_materials_purity"
  CHECK (purity_ratio IS NULL OR (purity_ratio > 0 AND purity_ratio <= 1));

-- ── Categories on products ───────────────────────────────────────────────────────
CREATE UNIQUE INDEX "idx_product_categories_primary" ON "product_categories" (product_id) WHERE is_primary;
CREATE INDEX "idx_product_categories_rank" ON "product_categories" (category_id, rank) INCLUDE (product_id);
CREATE INDEX "idx_product_collections_rank" ON "product_collections" (collection_id, rank) INCLUDE (product_id);

-- ── Attributes ───────────────────────────────────────────────────────────────────
ALTER TABLE "attributes" ADD CONSTRAINT "chk_attributes_scope"
  CHECK (scope IN ('product','variant','both'));
-- Only these types can be a storefront filter. A free-text attribute as a filter is a
-- facet with one option per typo.
ALTER TABLE "attributes" ADD CONSTRAINT "chk_attributes_filterable_type"
  CHECK (NOT is_filterable OR data_type IN ('select','multi_select','boolean','number'));
ALTER TABLE "attributes" ADD CONSTRAINT "chk_attributes_range"
  CHECK (value_min IS NULL OR value_max IS NULL OR value_max >= value_min);
ALTER TABLE "attributes" ADD CONSTRAINT "chk_attributes_decimal_places"
  CHECK (decimal_places IS NULL OR decimal_places BETWEEN 0 AND 4);
ALTER TABLE "attributes" ADD CONSTRAINT "chk_attributes_max_length"
  CHECK (max_length IS NULL OR max_length BETWEEN 1 AND 10000);
CREATE UNIQUE INDEX "uq_attribute_options" ON "attribute_options" (attribute_id, lower(value));

-- EXACTLY ONE value column. Without it a row carries both a number and a string and the
-- reader picks whichever it looks at first — one product, two carat weights, two screens.
ALTER TABLE "product_attribute_values" ADD CONSTRAINT "chk_pav_one_value"
  CHECK (num_nonnulls(option_id, value_text, value_numeric, value_bool, value_date, value_json) = 1);
CREATE UNIQUE INDEX "idx_pav_unique" ON "product_attribute_values"
  (product_id, attribute_id,
   coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid),
   coalesce(option_id,  '00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX "idx_pav_filter" ON "product_attribute_values" (attribute_id, option_id, product_id)
  WHERE option_id IS NOT NULL;
CREATE INDEX "idx_pav_numeric" ON "product_attribute_values" (attribute_id, value_numeric)
  WHERE value_numeric IS NOT NULL;
CREATE INDEX "idx_pav_product" ON "product_attribute_values" (product_id);

-- ── Collections ──────────────────────────────────────────────────────────────────
ALTER TABLE "collections" ADD CONSTRAINT "chk_collections_window"
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at);
ALTER TABLE "collections" ADD CONSTRAINT "chk_collections_rule_match"
  CHECK (rule_match IN ('all','any'));
-- `best_selling`, never `bestselling` (11 §7.9).
ALTER TABLE "collections" ADD CONSTRAINT "chk_collections_sort_order"
  CHECK (sort_order IN ('manual','newest','price_asc','price_desc','rank','best_selling'));
ALTER TABLE "product_collections" ADD CONSTRAINT "chk_product_collections_source"
  CHECK (source IN ('manual','rule'));

ALTER TABLE "collection_rules" ADD CONSTRAINT "chk_collection_rules_value"
  CHECK (num_nonnulls(value_text, value_uuid, value_numeric) >= 1
         OR operator IN ('is_true','is_false'));
-- A price rule with no market compares $400 against ₹40,000 (hard rule 2).
ALTER TABLE "collection_rules" ADD CONSTRAINT "chk_collection_rules_price_market"
  CHECK (field NOT IN ('price','is_on_sale') OR value_market_code IS NOT NULL);

-- ── Media ────────────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX "idx_media_public_id" ON "media" (provider, public_id) WHERE deleted_at IS NULL;
CREATE INDEX "idx_media_checksum" ON "media" (checksum_sha256) WHERE deleted_at IS NULL;
CREATE INDEX "idx_media_folder" ON "media" (folder_id, created_at DESC) WHERE deleted_at IS NULL;
-- Trigram rather than tsvector because `md-larimar-drop-02` is not a word (06 §7.3).
CREATE INDEX "idx_media_search_trgm" ON "media" USING GIN (
  (coalesce(title,'') || ' ' || coalesce(alt_text,'') || ' ' || coalesce(credit,'') || ' ' || public_id)
  gin_trgm_ops
) WHERE deleted_at IS NULL;
CREATE INDEX "idx_media_missing_alt" ON "media" (created_at DESC)
  WHERE alt_text IS NULL AND deleted_at IS NULL AND kind = 'image';
CREATE UNIQUE INDEX "uq_media_folders_name" ON "media_folders" (parent_id, lower(name));

CREATE UNIQUE INDEX "uq_product_media" ON "product_media"
  (product_id, media_id, coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid));
-- Exactly one hero per product, or the PDP's lead image is whichever row sorts first.
CREATE UNIQUE INDEX "idx_product_media_hero" ON "product_media" (product_id)
  WHERE role = 'hero' AND variant_id IS NULL;

-- ── Market content and sort cache ────────────────────────────────────────────────
CREATE INDEX "idx_pmc_market_published" ON "product_market_content" (market_code, product_id)
  WHERE is_published;
ALTER TABLE "product_market_sort" ADD CONSTRAINT "chk_pms_amounts"
  CHECK (min_price_minor >= 0 AND max_price_minor >= min_price_minor);
-- The composite FK that stops a row claiming a currency its market does not use.
ALTER TABLE "product_market_sort"
  ADD CONSTRAINT "fk_pms_market" FOREIGN KEY (market_code, currency_code)
  REFERENCES "markets" (code, currency_code) ON DELETE RESTRICT;
CREATE INDEX "idx_pms_price" ON "product_market_sort" (market_code, min_price_minor, product_id);
CREATE INDEX "idx_pms_units" ON "product_market_sort" (market_code, units_90d DESC, product_id);

-- ── Curated facets ───────────────────────────────────────────────────────────────
ALTER TABLE "curated_facets" ADD CONSTRAINT "chk_curated_facets_target"
  CHECK (num_nonnulls(stone_id, material_id, attribute_option_id, tag_id) = 1);
CREATE INDEX "idx_curated_facets_active" ON "curated_facets" (category_id) WHERE is_active;
CREATE INDEX "idx_curated_facets_auto" ON "curated_facets" (facet_type, is_auto) WHERE is_active;

-- ── SEO and redirects ────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX "uq_seo_metadata_entity" ON "seo_metadata"
  (entity_type, coalesce(entity_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(market_code, '**'))
  NULLS NOT DISTINCT;
CREATE UNIQUE INDEX "uq_redirects_from" ON "redirects"
  (lower(from_path), coalesce(market_code, '**')) WHERE is_active;
-- Catches the one-hop loop. Chain flattening is the service layer's job, because a
-- multi-row cycle cannot be a row-level CHECK.
ALTER TABLE "redirects" ADD CONSTRAINT "chk_redirects_not_self"
  CHECK (lower(from_path) <> lower(to_path));
ALTER TABLE "redirects" ADD CONSTRAINT "chk_redirects_status"
  CHECK (status_code IN (301, 302, 307, 308));
ALTER TABLE "redirects" ADD CONSTRAINT "chk_redirects_paths"
  CHECK (from_path LIKE '/%' AND to_path LIKE '/%');
