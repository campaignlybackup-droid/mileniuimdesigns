-- sku_token uniqueness and case — 03 §2.6's SCHEMA ADDITION, missed at P05.
--
-- Without these, two stones can both claim `LAB` and the SKU generator produces the same
-- SKU for two different products. `idx_variants_sku_live` would then refuse the second
-- variant with a unique violation naming a column the merchandiser never typed.
--
-- Partial: `NST` and `NMTL` are reserved sentinels for "no stone" and "no metal", and the
-- partial unique stops a real row claiming one while leaving NULLs free.
ALTER TABLE "stones" ADD CONSTRAINT "chk_stones_sku_token_upper"
  CHECK (sku_token IS NULL OR sku_token = upper(sku_token));
ALTER TABLE "materials" ADD CONSTRAINT "chk_materials_sku_token_upper"
  CHECK (sku_token IS NULL OR sku_token = upper(sku_token));

CREATE UNIQUE INDEX "idx_categories_sku_token" ON "categories" (sku_token)
  WHERE sku_token IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX "idx_stones_sku_token" ON "stones" (sku_token)
  WHERE sku_token IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX "idx_materials_sku_token" ON "materials" (sku_token)
  WHERE sku_token IS NOT NULL AND deleted_at IS NULL;
