import "dotenv/config";
import pg from "pg";
import crypto from "node:crypto";

const { Client } = pg;

// Stone mappings based on visual analysis and handwritten atelier sheets
const ITEM_STONES = {
  "BL 1": "Opal",
  "BL 2": "Amethyst",
  "BL 3": "Kyanite",
  "BL 4": "Kyanite",
  "BL 5": "Tourmaline",
  "BL 6": "Moonstone",
  "BL 7": "Coral",
  "BL 8": "Larimar",
  "BL 9": "Amber",
  "BL 10": "Labradorite",
  "BL 11": "Larimar",
  "BL 12": "Amber",
  "BL 13": "Labradorite",
  "BL 14": "Larimar",
  "BL 15": "Amber",
  "BL 16": "Larimar",
  "BL 17": "Larimar",
  "BL 18": "Amber",
  "BL 19": "Larimar",
  "BL 20": "Opal",
  "BL 21": "Opal",
  "BL 22": "Kyanite",
  "OK 1": "Larimar",
  "OK 2": "Larimar",
  "OK 3": "Larimar",
  "OK 4": "Larimar",
  "OK 5": "Larimar",
  "OK 6": "Larimar",
  "OK 7": "Larimar",
  "OK 8": "Larimar",
  "OK 9": "Larimar",
  "OK 10": "Larimar",
  "OK 11": "Amber",
  "OK 12": "Labradorite",
  "OK 13": "Larimar",
  "OK 14": "Moonstone",
  "OK 15": "Amber",
  "OK 16": "Labradorite",
  "OK 17": "Turquoise",
  "OK 18": "Larimar",
  "OK 19": "Amber",
  "OK 20": "Moonstone",
  "OK 21": "Turquoise",
  "OK 22": "Turquoise",
  "OK 23": "Malachite",
  "OK 24": "Rutilated Quartz",
  "OK 25": "Turquoise",
  "OK 26": "Amber",
  "OK 27": "Larimar",
  "OK 28": "Moonstone",
  "OK 29": "Turquoise",
  "OK 30": "Amber",
  "OK 31": "Labradorite",
  "OK 32": "Larimar",
  "OK 33": "Moonstone",
  "OK 34": "Turquoise",
  "OK 35": "Amber",
  "OK 36": "Larimar",
  "OK 37": "Turquoise",
  "OK 38": "Amber",
  "OK 39": "Larimar",
  "OK 40": "Labradorite",
  "OK 41": "Moonstone",
  "OK 42": "Amber",
  "OK 43": "Turquoise",
  "OK 44": "Larimar",
  "OK 45": "Labradorite",
  "OK 46": "Amber",
  "ER 1": "Rutilated Quartz",
  "ER 2": "Amber",
  "ER 3": "Rutilated Quartz",
  "ER 4": "Rutilated Quartz",
  "ER 5": "Kyanite",
  "ER 6": "Kyanite",
  "ER 7": "Amber",
  "ER 8": "Turquoise",
  "ER 9": "Rutilated Quartz",
  "ER 10": "Turquoise",
  "ER 11": "Rutilated Quartz",
  "ER 12": "Turquoise",
  "ER 13": "Amber",
  "ER 14": "Turquoise",
};

const EXTRA_STONES = [
  { name: "Turquoise", slug: "turquoise" },
  { name: "Malachite", slug: "malachite" },
  { name: "Rutilated Quartz", slug: "rutilated-quartz" },
  { name: "Lapis Lazuli", slug: "lapis-lazuli" },
  { name: "Citrine", slug: "citrine" },
];

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  console.log("Connected to PostgreSQL database for product enrichment.");

  // 1. Ensure extra stones exist
  for (const es of EXTRA_STONES) {
    const existing = await client.query("SELECT id FROM stones WHERE slug = $1;", [es.slug]);
    if (existing.rows.length === 0) {
      await client.query(
        "INSERT INTO stones (id, name, slug, created_at, updated_at) VALUES ($1, $2, $3, NOW(), NOW());",
        [crypto.randomUUID(), es.name, es.slug]
      );
      console.log(`Inserted stone: ${es.name}`);
    }
  }

  // Load stones map
  const stoneRows = await client.query("SELECT id, name, slug FROM stones;");
  const stoneMap = new Map();
  for (const s of stoneRows.rows) {
    stoneMap.set(s.name.toLowerCase(), s.id);
    stoneMap.set(s.slug.toLowerCase(), s.id);
  }

  // Load all 82 products
  const productsRes = await client.query(`
    SELECT p.id, p.slug, p.title, p.subtitle, p.is_one_of_a_kind, c.slug as category_slug, v.gross_weight_grams
    FROM products p
    JOIN categories c ON c.id = p.primary_category_id
    JOIN product_variants v ON v.product_id = p.id;
  `);

  console.log(`Found ${productsRes.rows.length} products to enrich.`);

  const careText = "Clean gently with a soft microfibre or silver polishing cloth. Avoid contact with perfumes, chlorine, hairsprays, and harsh chemicals. Store in the provided Millennium Designs velvet presentation case in a cool, dry place to maintain its radiant high-polish lustre.";

  for (const p of productsRes.rows) {
    const code = p.subtitle?.trim();
    const stoneName = ITEM_STONES[code] || "Fine Gemstone";
    const weightStr = p.gross_weight_grams ? `${Number(p.gross_weight_grams).toFixed(2)}g` : "solid";
    
    // Enrich Title if generic
    let newTitle = p.title;
    if (newTitle.startsWith("Silver One-of-a-Kind") || newTitle.startsWith("Sterling Silver")) {
      if (p.category_slug === "bracelets") {
        newTitle = `${stoneName} Silver Bracelet (${code})`;
      } else if (p.category_slug === "earrings") {
        newTitle = `${stoneName} Sterling Silver Earrings (${code})`;
      } else if (p.category_slug === "pendants") {
        newTitle = `${stoneName} Sterling Silver Pendant (${code})`;
      } else if (p.category_slug === "one-of-a-kind") {
        const itemType = code.startsWith("BL") ? "Bracelet" : "Pendant";
        newTitle = `${stoneName} Silver One-of-a-Kind ${itemType} (${code})`;
      }
    }

    const descriptionText = `Handcrafted in our Jaipur atelier from solid 925 sterling silver hallmarked alloy, this exquisite ${p.category_slug.replace("-", " ")} (${code}) showcases hand-selected natural ${stoneName}. Each stone is meticulously bezel-set by master silversmiths using generational bench techniques honed over six decades. Weighing ${weightStr} with an anti-tarnish protective lustre, this piece embodies the timeless elegance and mineral sovereignty of authentic Rajasthan jewellery artistry.`;

    // Update Product Record
    await client.query(`
      UPDATE products
      SET title = $1,
          description_json = $2,
          care_instructions_json = $3,
          search_text = $4,
          updated_at = NOW()
      WHERE id = $5;
    `, [
      newTitle,
      JSON.stringify({ text: descriptionText }),
      JSON.stringify({ text: careText }),
      `${newTitle} ${code} ${stoneName} 925 silver jaipur ${p.category_slug}`.toLowerCase(),
      p.id
    ]);

    // Link stone in product_stones if not linked
    const sId = stoneMap.get(stoneName.toLowerCase());
    if (sId) {
      const existingPs = await client.query("SELECT * FROM product_stones WHERE product_id = $1;", [p.id]);
      if (existingPs.rows.length === 0) {
        await client.query(`
          INSERT INTO product_stones (product_id, stone_id, is_primary, position, created_at)
          VALUES ($1, $2, true, 0, NOW());
        `, [p.id, sId]);
      } else {
        await client.query(`
          UPDATE product_stones
          SET stone_id = $1, is_primary = true
          WHERE product_id = $2;
        `, [sId, p.id]);
      }
    }
  }

  console.log("✓ Successfully enriched all 82 products with descriptions, care instructions, and stone relationships!");
  await client.end();
}

main().catch(console.error);
