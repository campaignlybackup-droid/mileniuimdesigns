import "dotenv/config";
import fs from "node:fs";
import crypto from "node:crypto";
import pg from "pg";

const { Client } = pg;

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  console.log("Connected to PostgreSQL database.");

  const catalog = JSON.parse(
    fs.readFileSync(
      "/Users/anshbhatt/.gemini/antigravity-ide/brain/4a8a88c2-2b7f-4629-bf26-4ae1239bb1c3/scratch/catalog_prepared.json",
      "utf8",
    ),
  );
  const cldCache = JSON.parse(
    fs.readFileSync(
      "/Users/anshbhatt/.gemini/antigravity-ide/brain/4a8a88c2-2b7f-4629-bf26-4ae1239bb1c3/scratch/cloudinary_cache.json",
      "utf8",
    ),
  );

  console.log(`Starting ingestion of ${catalog.length} products...`);

  // Begin transaction
  await client.query("BEGIN;");

  try {
    // 1. Purge all current dummy products and media
    console.log("Purging dummy products and mock media...");
    await client.query("DELETE FROM cart_items;");
    await client.query("DELETE FROM wishlist_items;");
    await client.query("DELETE FROM back_in_stock_requests;");
    await client.query("DELETE FROM product_media;");
    await client.query("DELETE FROM media;");
    await client.query("DELETE FROM prices;");
    await client.query("DELETE FROM inventory_items;");
    await client.query("DELETE FROM product_stones;");
    await client.query("DELETE FROM product_categories;");
    await client.query("DELETE FROM product_variants;");
    await client.query("DELETE FROM products;");

    console.log("✓ Dummy data purged successfully.");

    // 2. Publish target categories
    await client.query(`
      UPDATE categories 
      SET is_published = true 
      WHERE slug IN ('bracelets', 'earrings', 'pendants', 'one-of-a-kind');
    `);

    // Fetch categories map
    const catRows = await client.query("SELECT id, slug FROM categories;");
    const categoryMap = new Map(catRows.rows.map((r) => [r.slug, r.id]));

    // 3. Ensure Stones
    const additionalStones = [
      { slug: "opal", name: "Opal", skuToken: "OPL" },
      { slug: "kyanite", name: "Kyanite", skuToken: "KYA" },
      { slug: "tourmaline", name: "Tourmaline", skuToken: "TRM" },
      { slug: "coral", name: "Coral", skuToken: "CRL" },
      { slug: "amber", name: "Amber", skuToken: "AMB" },
    ];

    for (const st of additionalStones) {
      const existing = await client.query("SELECT id FROM stones WHERE slug = $1;", [st.slug]);
      if (existing.rows.length === 0) {
        await client.query(
          `INSERT INTO stones (id, slug, name, sku_token, is_published, rank, created_at, updated_at)
           VALUES ($1, $2, $3, $4, false, 10, NOW(), NOW());`,
          [crypto.randomUUID(), st.slug, st.name, st.skuToken],
        );
      }
    }

    const stoneRows = await client.query("SELECT id, slug, name FROM stones;");
    const stoneMap = new Map(stoneRows.rows.map((r) => [r.name.toLowerCase(), r.id]));

    // Inventory location
    const locRes = await client.query("SELECT id FROM inventory_locations LIMIT 1;");
    const locationId = locRes.rows[0]?.id;

    // 4. Ingest Products
    let productIndex = 0;
    for (const item of catalog) {
      productIndex++;
      const productId = crypto.randomUUID();
      const variantId = crypto.randomUUID();
      const catId = categoryMap.get(item.category_slug);

      if (!catId) {
        throw new Error(`Category not found: ${item.category_slug}`);
      }

      const searchText = `${item.title} ${item.code} ${item.sku} ${item.stone_name || ""} ${item.category_slug}`.trim();

      // Insert Product
      await client.query(
        `INSERT INTO products (
          id, slug, title, subtitle, primary_category_id, status, 
          published_at, is_one_of_a_kind, default_variant_id, rank, 
          search_text, completeness_score, seo_score, version, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, 'active', 
          NOW(), $6, $7, $8, 
          $9, 100, 100, 1, NOW(), NOW()
        );`,
        [
          productId,
          item.slug,
          item.title,
          item.code,
          catId,
          item.is_one_of_a_kind,
          variantId,
          productIndex,
          searchText,
        ],
      );

      // Insert Variant
      await client.query(
        `INSERT INTO product_variants (
          id, product_id, sku, title, position, is_active, 
          is_one_of_a_kind, gross_weight_grams, inventory_policy, 
          version, created_at, updated_at
        ) VALUES (
          $1, $2, $3, 'Standard Edition', 1, true, 
          $4, $5, 'tracked', 
          1, NOW(), NOW()
        );`,
        [variantId, productId, item.sku, item.is_one_of_a_kind, item.gross_weight_grams],
      );

      // Insert Price (INR Paise) - note: prices table has created_at, NO updated_at
      await client.query(
        `INSERT INTO prices (
          id, product_id, variant_id, market_code, currency_code, 
          list_minor, price_source, valid_from, created_at
        ) VALUES (
          $1, $2, $3, 'IN', 'INR', 
          $4, 'manual', NOW(), NOW()
        );`,
        [crypto.randomUUID(), productId, variantId, item.amount_inr_minor],
      );

      // Insert Inventory
      if (locationId) {
        const qty = item.is_one_of_a_kind ? 1 : 5;
        await client.query(
          `INSERT INTO inventory_items (
            id, variant_id, location_id, is_one_of_a_kind, 
            on_hand_quantity, available_quantity, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, 
            $5, $5, NOW(), NOW()
          );`,
          [crypto.randomUUID(), variantId, locationId, item.is_one_of_a_kind, qty],
        );
      }

      // Link Product Category
      await client.query(
        `INSERT INTO product_categories (
          product_id, category_id, rank, is_primary, created_at
        ) VALUES ($1, $2, 0, true, NOW());`,
        [productId, catId],
      );

      // Link Stone if applicable
      if (item.stone_name) {
        let sId = null;
        for (const [stName, id] of stoneMap.entries()) {
          if (item.stone_name.toLowerCase().includes(stName) || stName.includes(item.stone_name.toLowerCase())) {
            sId = id;
            break;
          }
        }
        if (sId) {
          await client.query(
            `INSERT INTO product_stones (
              product_id, stone_id, is_primary, position, created_at
            ) VALUES ($1, $2, true, 0, NOW());`,
            [productId, sId],
          );
        }
      }

      // Insert Media and ProductMedia - note: product_media table has created_at, NO updated_at
      for (let mIdx = 0; mIdx < item.images.length; mIdx++) {
        const img = item.images[mIdx];
        const cld = cldCache[img.public_id];
        if (!cld) {
          throw new Error(`Missing Cloudinary metadata for ${img.public_id}`);
        }

        const mediaId = crypto.randomUUID();
        const role = mIdx === 0 ? "hero" : "gallery";

        await client.query(
          `INSERT INTO media (
            id, kind, provider, public_id, version, format, 
            bytes, width, height, alt_text, title, is_demo, created_at, updated_at
          ) VALUES (
            $1, 'image', 'cloudinary', $2, $3, $4, 
            $5, $6, $7, $8, $9, false, NOW(), NOW()
          );`,
          [
            mediaId,
            cld.public_id,
            cld.version,
            cld.format,
            cld.bytes,
            cld.width,
            cld.height,
            `${item.title} - Angle ${img.angle.toUpperCase()}`,
            item.title,
          ],
        );

        await client.query(
          `INSERT INTO product_media (
            id, product_id, variant_id, media_id, role, position, created_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, NOW()
          );`,
          [crypto.randomUUID(), productId, variantId, mediaId, role, mIdx],
        );
      }
    }

    await client.query("COMMIT;");
    console.log("✓ Ingestion transaction committed successfully!");
  } catch (err) {
    await client.query("ROLLBACK;");
    console.error("Ingestion failed, rolled back:", err);
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
