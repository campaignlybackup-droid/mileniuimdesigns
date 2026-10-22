import "dotenv/config";
import pg from "pg";
import crypto from "node:crypto";

const { Client } = pg;

const STONE_MEDIA_MAP = {
  citrine: "md_catalog/one-of-a-kind/ok_38_a",
  "lapis-lazuli": "md_catalog/one-of-a-kind/ok_14_a",
  malachite: "md_catalog/one-of-a-kind/ok_43_a",
  "rutilated-quartz": "md_catalog/pendants/ok_32_a",
  turquoise: "md_catalog/pendants/ok_22_a",
  moonstone: "md_catalog/one-of-a-kind/ok_16_a",
  amethyst: "md_catalog/bracelets/bl_2_a",
  labradorite: "md_catalog/one-of-a-kind/bl_9_a",
  "blue-topaz": "md_catalog/pendants/ok_24_a",
  larimar: "md_catalog/bracelets/bl_6_a",
  pearl: "md_catalog/one-of-a-kind/ok_11_a",
  opal: "md_catalog/pendants/ok_27_a",
  tourmaline: "md_catalog/one-of-a-kind/ok_17_a",
  coral: "md_catalog/one-of-a-kind/ok_40_a",
  kyanite: "md_catalog/bracelets/bl_3_a",
  amber: "md_catalog/one-of-a-kind/bl_11_a",
  garnet: "md_catalog/bracelets/bl_1_a",
};

const CATEGORY_MEDIA_MAP = {
  bracelets: "md_catalog/bracelets/bl_1_a",
  "one-of-a-kind": "md_catalog/one-of-a-kind/bl_8_a",
  pendants: "md_catalog/pendants/ok_22_a",
  earrings: "md_catalog/earrings/er_1_a",
  rings: "md_catalog/one-of-a-kind/ok_16_a",
  chains: "md_catalog/bracelets/bl_7_a",
  "jewellery-sets": "md_catalog/bracelets/bl_2_a",
  closeouts: "md_catalog/pendants/ok_23_a",
  "14k-gold": "md_catalog/one-of-a-kind/ok_38_a",
  "lab-grown-diamonds": "md_catalog/earrings/er_3_a",
};

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log("No DATABASE_URL found, skipping DB media update.");
    return;
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  console.log("Connected to PostgreSQL database...");

  try {
    await client.query("BEGIN;");

    // Helper to get or insert media record
    async function getOrCreateMedia(publicId, title) {
      const existing = await client.query(
        "SELECT id FROM media WHERE public_id = $1 AND deleted_at IS NULL LIMIT 1;",
        [publicId]
      );
      if (existing.rows.length > 0) {
        return existing.rows[0].id;
      }
      const mediaId = crypto.randomUUID();
      await client.query(
        `INSERT INTO media (
          id, kind, provider, public_id, format, width, height, title, is_demo, created_at, updated_at
        ) VALUES (
          $1, 'image', 'cloudinary', $2, 'jpg', 800, 800, $3, false, NOW(), NOW()
        );`,
        [mediaId, publicId, title]
      );
      return mediaId;
    }

    // 1. Update Stones
    console.log("Updating stone hero media...");
    for (const [slug, publicId] of Object.entries(STONE_MEDIA_MAP)) {
      const stoneRes = await client.query("SELECT id, name FROM stones WHERE slug = $1 LIMIT 1;", [slug]);
      if (stoneRes.rows.length > 0) {
        const stone = stoneRes.rows[0];
        const mediaId = await getOrCreateMedia(publicId, `${stone.name} Genuine Gemstone`);
        await client.query("UPDATE stones SET hero_media_id = $1, updated_at = NOW() WHERE id = $2;", [
          mediaId,
          stone.id,
        ]);
        console.log(`✓ Linked stone '${slug}' -> '${publicId}'`);
      }
    }

    // 2. Update Categories
    console.log("Updating category hero media...");
    for (const [slug, publicId] of Object.entries(CATEGORY_MEDIA_MAP)) {
      const catRes = await client.query("SELECT id, name FROM categories WHERE slug = $1 LIMIT 1;", [slug]);
      if (catRes.rows.length > 0) {
        const cat = catRes.rows[0];
        const mediaId = await getOrCreateMedia(publicId, `${cat.name} Collection`);
        await client.query("UPDATE categories SET hero_media_id = $1, updated_at = NOW() WHERE id = $2;", [
          mediaId,
          cat.id,
        ]);
        console.log(`✓ Linked category '${slug}' -> '${publicId}'`);
      }
    }

    await client.query("COMMIT;");
    console.log("Database successfully updated with original product media!");
  } catch (err) {
    await client.query("ROLLBACK;");
    console.error("Error updating DB media:", err);
  } finally {
    await client.end();
  }
}

main();
