import "dotenv/config";
import pg from "pg";
import crypto from "node:crypto";

const { Client } = pg;

const EARRING_UPDATES = [
  {
    code: "ER 1",
    title: "Rutilated Quartz Sterling Silver Earrings (ER 1)",
    stones: [
      { name: "Rutilated Quartz", slug: "rutilated-quartz", isPrimary: true },
    ],
    description:
      "Handcrafted in our Jaipur atelier from solid 925 sterling silver hallmarked alloy, this captivating pair of earrings (ER 1) showcases natural Rutilated Quartz displaying delicate golden-black rutile needle inclusions beneath a faceted black gemstone stud. Weighing 5.10g with an anti-tarnish protective lustre, this piece embodies the timeless elegance of authentic artisan silverwork.",
  },
  {
    code: "ER 2",
    title: "Honey Amber Sterling Silver Earrings (ER 2)",
    stones: [
      { name: "Amber", slug: "amber", isPrimary: true },
    ],
    description:
      "Handcrafted in our Jaipur atelier from solid 925 sterling silver hallmarked alloy, this delicate pair of earrings (ER 2) features luminous natural cognac honey Amber cabochons in a graceful drop silhouette. Weighing 2.20g with an anti-tarnish protective lustre, this piece radiates warm organic luminescence.",
  },
  {
    code: "ER 3",
    title: "Rutilated Quartz Sterling Silver Earrings (ER 3)",
    stones: [
      { name: "Rutilated Quartz", slug: "rutilated-quartz", isPrimary: true },
    ],
    description:
      "Handcrafted in our Jaipur atelier from solid 925 sterling silver hallmarked alloy, this architectural pair of earrings (ER 3) highlights hand-cut natural Rutilated Quartz crowned by a faceted black gemstone accent. Weighing 4.80g with an anti-tarnish protective lustre, it captures pure mineral artistry.",
  },
  {
    code: "ER 4",
    title: "Rutilated Quartz Sterling Silver Earrings (ER 4)",
    stones: [
      { name: "Rutilated Quartz", slug: "rutilated-quartz", isPrimary: true },
    ],
    description:
      "Handcrafted in our Jaipur atelier from solid 925 sterling silver hallmarked alloy, this pair of earrings (ER 4) features an elongated shepherd hook with a faceted black top stone and a natural Rutilated Quartz drop showing striking needle inclusions. Weighing 5.10g with an anti-tarnish protective lustre.",
  },
  {
    code: "ER 5",
    title: "Kyanite & Amethyst Sterling Silver Earrings (ER 5)",
    stones: [
      { name: "Kyanite", slug: "kyanite", isPrimary: true },
      { name: "Amethyst", slug: "amethyst", isPrimary: false },
    ],
    description:
      "Handcrafted in our Jaipur atelier from solid 925 sterling silver hallmarked alloy, this royal pair of earrings (ER 5) features deep indigo blue natural Kyanite cabochons paired with faceted purple Amethyst accents. Weighing 3.90g with an anti-tarnish protective lustre, this color harmony echoes Rajasthani heritage jewellery.",
  },
  {
    code: "ER 6",
    title: "Kyanite & Amethyst Sterling Silver Earrings (ER 6)",
    stones: [
      { name: "Kyanite", slug: "kyanite", isPrimary: true },
      { name: "Amethyst", slug: "amethyst", isPrimary: false },
    ],
    description:
      "Handcrafted in our Jaipur atelier from solid 925 sterling silver hallmarked alloy, this vibrant pair of earrings (ER 6) showcases intense natural Kyanite cabochons crowned with faceted round Amethyst gems. Weighing 3.00g with an anti-tarnish protective lustre, designed for lightweight comfort and striking presence.",
  },
  {
    code: "ER 7",
    title: "Honey Amber Sterling Silver Earrings (ER 7)",
    stones: [
      { name: "Amber", slug: "amber", isPrimary: true },
    ],
    description:
      "Handcrafted in our Jaipur atelier from solid 925 sterling silver hallmarked alloy, this two-tier geometric pair of earrings (ER 7) features natural honey Amber stones with a round top cabochon and a square amber drop. Weighing 4.00g with an anti-tarnish protective lustre.",
  },
  {
    code: "ER 8",
    title: "Turquoise & Blue Topaz Sterling Silver Earrings (ER 8)",
    stones: [
      { name: "Turquoise", slug: "turquoise", isPrimary: true },
      { name: "Blue Topaz", slug: "blue-topaz", isPrimary: false },
    ],
    description:
      "Handcrafted in our Jaipur atelier from solid 925 sterling silver hallmarked alloy, this magnificent pair of earrings (ER 8) pairs faceted Swiss Blue Topaz studs with vivid sky-blue natural Turquoise cabochon drops. Weighing 3.50g with an anti-tarnish protective lustre.",
  },
  {
    code: "ER 9",
    title: "Rutilated Quartz Sterling Silver Earrings (ER 9)",
    stones: [
      { name: "Rutilated Quartz", slug: "rutilated-quartz", isPrimary: true },
    ],
    description:
      "Handcrafted in our Jaipur atelier from solid 925 sterling silver hallmarked alloy, this statement pair of earrings (ER 9) showcases clear natural Rutilated Quartz displaying bold needle clusters suspended below a faceted black gemstone. Weighing 5.00g with an anti-tarnish protective finish.",
  },
  {
    code: "ER 10",
    title: "Turquoise & Blue Topaz Sterling Silver Earrings (ER 10)",
    stones: [
      { name: "Turquoise", slug: "turquoise", isPrimary: true },
      { name: "Blue Topaz", slug: "blue-topaz", isPrimary: false },
    ],
    description:
      "Handcrafted in our Jaipur atelier from solid 925 sterling silver hallmarked alloy, this cascading pair of earrings (ER 10) features faceted Blue Topaz top studs and double graduated tiers of pure natural Turquoise. Weighing 4.50g with an anti-tarnish protective lustre.",
  },
  {
    code: "ER 11",
    title: "Rutilated Quartz Sterling Silver Earrings (ER 11)",
    stones: [
      { name: "Rutilated Quartz", slug: "rutilated-quartz", isPrimary: true },
    ],
    description:
      "Handcrafted in our Jaipur atelier from solid 925 sterling silver hallmarked alloy, this elegant pair of earrings (ER 11) presents teardrop natural Rutilated Quartz gems suspended from faceted black gemstone studs. Weighing 4.90g with an anti-tarnish protective finish.",
  },
  {
    code: "ER 12",
    title: "Turquoise & Blue Topaz Sterling Silver Earrings (ER 12)",
    stones: [
      { name: "Turquoise", slug: "turquoise", isPrimary: true },
      { name: "Blue Topaz", slug: "blue-topaz", isPrimary: false },
    ],
    description:
      "Handcrafted in our Jaipur atelier from solid 925 sterling silver hallmarked alloy, this refined pair of earrings (ER 12) pairs brilliant-cut Blue Topaz with smooth natural Turquoise teardrop cabochons. Weighing 3.10g with an anti-tarnish protective finish.",
  },
  {
    code: "ER 13",
    title: "Honey Amber Sterling Silver Earrings (ER 13)",
    stones: [
      { name: "Amber", slug: "amber", isPrimary: true },
    ],
    description:
      "Handcrafted in our Jaipur atelier from solid 925 sterling silver hallmarked alloy, this luminous pair of earrings (ER 13) features two articulated tiers of radiant golden-cognac natural Amber cabochons. Weighing 2.40g with an anti-tarnish protective lustre.",
  },
  {
    code: "ER 14",
    title: "Turquoise & Blue Topaz Sterling Silver Earrings (ER 14)",
    stones: [
      { name: "Turquoise", slug: "turquoise", isPrimary: true },
      { name: "Blue Topaz", slug: "blue-topaz", isPrimary: false },
    ],
    description:
      "Handcrafted in our Jaipur atelier from solid 925 sterling silver hallmarked alloy, this dramatic pair of earrings (ER 14) showcases large elongated natural Turquoise drops crowned by faceted sparkling Blue Topaz gemstones. Weighing 3.70g with an anti-tarnish protective finish.",
  },
];

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  console.log("Connected to PostgreSQL for earring updates...");

  // Load stones map
  const stoneRows = await client.query("SELECT id, name, slug FROM stones;");
  const stoneMap = new Map();
  for (const s of stoneRows.rows) {
    stoneMap.set(s.slug.toLowerCase(), s.id);
    stoneMap.set(s.name.toLowerCase(), s.id);
  }

  const careText =
    "Clean gently with a soft microfibre or silver polishing cloth. Avoid contact with perfumes, chlorine, hairsprays, and harsh chemicals. Store in the provided Millennium Designs velvet presentation case in a cool, dry place to maintain its radiant high-polish lustre.";

  for (const item of EARRING_UPDATES) {
    const prodRes = await client.query(
      "SELECT id, subtitle FROM products WHERE subtitle = $1;",
      [item.code]
    );
    if (prodRes.rows.length === 0) {
      console.warn(`Product not found for ${item.code}`);
      continue;
    }
    const productId = prodRes.rows[0].id;

    const stoneNames = item.stones.map((s) => s.name).join(" ");
    const searchText =
      `${item.title} ${item.code} ${stoneNames} 925 silver sterling jaipur earrings`.toLowerCase();

    // 1. Update Product
    await client.query(
      `
      UPDATE products
      SET title = $1,
          description_json = $2,
          care_instructions_json = $3,
          search_text = $4,
          updated_at = NOW()
      WHERE id = $5;
    `,
      [
        item.title,
        JSON.stringify({ text: item.description }),
        JSON.stringify({ text: careText }),
        searchText,
        productId,
      ]
    );

    // 2. Remove old product_stones
    await client.query("DELETE FROM product_stones WHERE product_id = $1;", [
      productId,
    ]);

    // 3. Insert correct product_stones
    for (let i = 0; i < item.stones.length; i++) {
      const st = item.stones[i];
      const sId = stoneMap.get(st.slug) || stoneMap.get(st.name.toLowerCase());
      if (!sId) {
        console.error(`Stone not found in DB: ${st.name} (${st.slug})`);
        continue;
      }
      await client.query(
        `
        INSERT INTO product_stones (product_id, stone_id, is_primary, position, created_at)
        VALUES ($1, $2, $3, $4, NOW());
      `,
        [productId, sId, st.isPrimary, i]
      );
    }

    console.log(`✓ Updated ${item.code}: ${item.title} (${stoneNames})`);
  }

  console.log("All 14 earrings successfully updated in database!");
  await client.end();
}

main().catch(console.error);
