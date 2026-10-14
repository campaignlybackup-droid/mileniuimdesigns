import "dotenv/config";
import pg from "pg";

const { Client } = pg;

// Comprehensive audited mapping of items to stones and titles
const CATALOG_STONE_CORRECTIONS = [
  // --- PENDANTS (OK 22 - OK 36) ---
  {
    code: "OK 22",
    title: "Turquoise & Blue Topaz Sterling Silver Pendant (OK 22)",
    stones: [
      { slug: "turquoise", isPrimary: true },
      { slug: "blue-topaz", isPrimary: false },
    ],
    description:
      "Handcrafted in our Jaipur atelier from solid 925 sterling silver hallmarked alloy, this graduated pendant (OK 22) showcases pure natural turquoise cabochons complemented by sparkling faceted blue topaz side accents. Weighing 5.20g with an anti-tarnish protective lustre.",
  },
  {
    code: "OK 23",
    title: "Turquoise & Blue Topaz Sterling Silver Pendant (OK 23)",
    stones: [
      { slug: "turquoise", isPrimary: true },
      { slug: "blue-topaz", isPrimary: false },
    ],
    description:
      "Handcrafted in our Jaipur atelier from solid 925 sterling silver hallmarked alloy, this cascading tier pendant (OK 23) features radiant sky-blue natural turquoise cabochons with brilliant-cut blue topaz accents. Weighing 4.90g with an anti-tarnish protective lustre.",
  },
  {
    code: "OK 24",
    title: "Turquoise & Blue Topaz Sterling Silver Pendant (OK 24)",
    stones: [
      { slug: "turquoise", isPrimary: true },
      { slug: "blue-topaz", isPrimary: false },
    ],
    description:
      "Handcrafted in our Jaipur atelier from solid 925 sterling silver hallmarked alloy, this statement pendant (OK 24) presents hand-selected natural turquoise stones set with faceted blue topaz gems. Weighing 5.60g with an anti-tarnish protective lustre.",
  },
  {
    code: "OK 25",
    title: "Turquoise & Blue Topaz Sterling Silver Pendant (OK 25)",
    stones: [
      { slug: "turquoise", isPrimary: true },
      { slug: "blue-topaz", isPrimary: false },
    ],
    description:
      "Handcrafted in our Jaipur atelier from solid 925 sterling silver hallmarked alloy, this luminous pendant (OK 25) pairs smooth oval turquoise cabochons with faceted blue topaz accents in a bespoke bezel setting. Weighing 5.00g with an anti-tarnish protective lustre.",
  },
  {
    code: "OK 26",
    title: "Turquoise & Blue Topaz Sterling Silver Pendant (OK 26)",
    stones: [
      { slug: "turquoise", isPrimary: true },
      { slug: "blue-topaz", isPrimary: false },
    ],
    description:
      "Handcrafted in our Jaipur atelier from solid 925 sterling silver hallmarked alloy, this dramatic drop pendant (OK 26) highlights cascading vibrant turquoise cabochons framed by faceted blue topaz gems. Weighing 4.90g with an anti-tarnish protective finish.",
  },
  {
    code: "OK 27",
    title: "Natural Opal Sterling Silver Pendant (OK 27)",
    stones: [{ slug: "opal", isPrimary: true }],
    description:
      "Handcrafted in our Jaipur atelier from solid 925 sterling silver hallmarked alloy, this mystical pendant (OK 27) showcases an oval cabochon and an organic freeform slice of natural Ethiopian Opal displaying radiant neon fire and play-of-colour. Weighing 3.60g with an anti-tarnish protective finish.",
  },
  {
    code: "OK 28",
    title: "Natural Opal Sterling Silver Pendant (OK 28)",
    stones: [{ slug: "opal", isPrimary: true }],
    description:
      "Handcrafted in our Jaipur atelier from solid 925 sterling silver hallmarked alloy, this delicate multi-tier pendant (OK 28) features three graduated natural Ethiopian Opals glowing with spectral fire and violet-green luminescence. Weighing 3.50g with an anti-tarnish protective lustre.",
  },
  {
    code: "OK 29",
    title: "Natural Opal Sterling Silver Pendant (OK 29)",
    stones: [{ slug: "opal", isPrimary: true }],
    description:
      "Handcrafted in our Jaipur atelier from solid 925 sterling silver hallmarked alloy, this two-tier pendant (OK 29) pairs a luminous oval opal cabochon with a polished freeform natural Ethiopian Opal with electric violet-blue fire. Weighing 3.90g with an anti-tarnish protective finish.",
  },
  {
    code: "OK 30",
    title: "Natural Opal Sterling Silver Pendant (OK 30)",
    stones: [{ slug: "opal", isPrimary: true }],
    description:
      "Handcrafted in our Jaipur atelier from solid 925 sterling silver hallmarked alloy, this elegant pendant (OK 30) presents a square cushion and teardrop natural Ethiopian Opal radiating warm fiery sunset flashes. Weighing 3.40g with an anti-tarnish protective lustre.",
  },
  {
    code: "OK 31",
    title: "Natural Opal Sterling Silver Pendant (OK 31)",
    stones: [{ slug: "opal", isPrimary: true }],
    description:
      "Handcrafted in our Jaipur atelier from solid 925 sterling silver hallmarked alloy, this refined pendant (OK 31) features two harmonious tiers of natural Ethiopian Opal with delicate green and golden spectral iridescence. Weighing 2.90g with an anti-tarnish protective finish.",
  },
  {
    code: "OK 32",
    title: "Rutilated Quartz Sterling Silver Pendant (OK 32)",
    stones: [{ slug: "rutilated-quartz", isPrimary: true }],
    description:
      "Handcrafted in our Jaipur atelier from solid 925 sterling silver hallmarked alloy, this navette-cut pendant (OK 32) highlights clear natural Rutilated Quartz displaying dense black rutile needle inclusions beneath a faceted black gemstone stud. Weighing 4.50g with an anti-tarnish protective lustre.",
  },
  {
    code: "OK 33",
    title: "Rutilated Quartz Sterling Silver Pendant (OK 33)",
    stones: [{ slug: "rutilated-quartz", isPrimary: true }],
    description:
      "Handcrafted in our Jaipur atelier from solid 925 sterling silver hallmarked alloy, this bold oval pendant (OK 33) showcases hand-selected natural Rutilated Quartz with dramatic needle clusters suspended from a faceted black gemstone accent. Weighing 5.20g with an anti-tarnish protective finish.",
  },
  {
    code: "OK 34",
    title: "Rutilated Quartz Sterling Silver Pendant (OK 34)",
    stones: [{ slug: "rutilated-quartz", isPrimary: true }],
    description:
      "Handcrafted in our Jaipur atelier from solid 925 sterling silver hallmarked alloy, this pear-cut pendant (OK 34) presents natural Rutilated Quartz with delicate rutile needles topped by two articulated faceted black gemstones. Weighing 3.40g with an anti-tarnish protective finish.",
  },
  {
    code: "OK 35",
    title: "Rutilated Quartz Sterling Silver Pendant (OK 35)",
    stones: [{ slug: "rutilated-quartz", isPrimary: true }],
    description:
      "Handcrafted in our Jaipur atelier from solid 925 sterling silver hallmarked alloy, this three-tier statement pendant (OK 35) combines a faceted black gemstone with an oval and round natural Rutilated Quartz displaying criss-cross rutile networks. Weighing 5.50g with an anti-tarnish protective lustre.",
  },
  {
    code: "OK 36",
    title: "Rutilated Quartz Sterling Silver Pendant (OK 36)",
    stones: [{ slug: "rutilated-quartz", isPrimary: true }],
    description:
      "Handcrafted in our Jaipur atelier from solid 925 sterling silver hallmarked alloy, this teardrop pendant (OK 36) highlights natural Rutilated Quartz with fine golden-black rutile needles below a faceted black gemstone stud. Weighing 4.20g with an anti-tarnish protective finish.",
  },

  // --- BRACELET BL 6 ---
  {
    code: "BL 6",
    title: "Larimar Silver Bracelet (BL 6)",
    stones: [{ slug: "larimar", isPrimary: true }],
  },

  // --- ONE OF A KIND BRACELETS ---
  {
    code: "BL 9",
    title: "Labradorite Silver One-of-a-Kind Bracelet (BL 9)",
    stones: [{ slug: "labradorite", isPrimary: true }],
  },
  {
    code: "BL 13",
    title: "Turquoise & Blue Topaz Silver One-of-a-Kind Bracelet (BL 13)",
    stones: [
      { slug: "turquoise", isPrimary: true },
      { slug: "blue-topaz", isPrimary: false },
    ],
  },
  {
    code: "BL 15",
    title: "Baroque Pearl Silver One-of-a-Kind Bracelet (BL 15)",
    stones: [{ slug: "pearl", isPrimary: true }],
  },
  {
    code: "BL 18",
    title: "Natural Opal Silver One-of-a-Kind Bracelet (BL 18)",
    stones: [{ slug: "opal", isPrimary: true }],
  },
  {
    code: "BL 19",
    title: "Turquoise & Blue Topaz Silver One-of-a-Kind Bracelet (BL 19)",
    stones: [
      { slug: "turquoise", isPrimary: true },
      { slug: "blue-topaz", isPrimary: false },
    ],
  },

  // --- ONE OF A KIND PENDANTS ---
  {
    code: "OK 11",
    title: "Baroque Pearl Silver One-of-a-Kind Pendant (OK 11)",
    stones: [{ slug: "pearl", isPrimary: true }],
  },
  {
    code: "OK 13",
    title: "Baroque Pearl Silver One-of-a-Kind Pendant (OK 13)",
    stones: [{ slug: "pearl", isPrimary: true }],
  },
  {
    code: "OK 14",
    title: "Lapis Lazuli & Pearl Silver One-of-a-Kind Pendant (OK 14)",
    stones: [
      { slug: "lapis-lazuli", isPrimary: true },
      { slug: "pearl", isPrimary: false },
    ],
  },
  {
    code: "OK 15",
    title: "Larimar Silver One-of-a-Kind Pendant (OK 15)",
    stones: [{ slug: "larimar", isPrimary: true }],
  },
  {
    code: "OK 16",
    title: "Moonstone Silver One-of-a-Kind Pendant (OK 16)",
    stones: [{ slug: "moonstone", isPrimary: true }],
  },
  {
    code: "OK 17",
    title: "Tourmaline Silver One-of-a-Kind Pendant (OK 17)",
    stones: [{ slug: "tourmaline", isPrimary: true }],
  },
  {
    code: "OK 18",
    title: "Baroque Pearl Silver One-of-a-Kind Pendant (OK 18)",
    stones: [{ slug: "pearl", isPrimary: true }],
  },
  {
    code: "OK 19",
    title: "Rutilated Quartz Silver One-of-a-Kind Pendant (OK 19)",
    stones: [{ slug: "rutilated-quartz", isPrimary: true }],
  },
  {
    code: "OK 20",
    title: "Lapis Lazuli Silver One-of-a-Kind Pendant (OK 20)",
    stones: [{ slug: "lapis-lazuli", isPrimary: true }],
  },
  {
    code: "OK 21",
    title: "Baroque Pearl Silver One-of-a-Kind Pendant (OK 21)",
    stones: [{ slug: "pearl", isPrimary: true }],
  },
  {
    code: "OK 37",
    title: "Tourmaline Silver One-of-a-Kind Pendant (OK 37)",
    stones: [{ slug: "tourmaline", isPrimary: true }],
  },
  {
    code: "OK 38",
    title: "Citrine & Pearl Silver One-of-a-Kind Pendant (OK 38)",
    stones: [
      { slug: "citrine", isPrimary: true },
      { slug: "pearl", isPrimary: false },
    ],
  },
  {
    code: "OK 39",
    title: "Tourmaline Silver One-of-a-Kind Pendant (OK 39)",
    stones: [{ slug: "tourmaline", isPrimary: true }],
  },
  {
    code: "OK 40",
    title: "Coral Silver One-of-a-Kind Pendant (OK 40)",
    stones: [{ slug: "coral", isPrimary: true }],
  },
  {
    code: "OK 41",
    title: "Lapis Lazuli & Pearl Silver One-of-a-Kind Pendant (OK 41)",
    stones: [
      { slug: "lapis-lazuli", isPrimary: true },
      { slug: "pearl", isPrimary: false },
    ],
  },
  {
    code: "OK 42",
    title: "Tourmaline & Pearl Silver One-of-a-Kind Pendant (OK 42)",
    stones: [
      { slug: "tourmaline", isPrimary: true },
      { slug: "pearl", isPrimary: false },
    ],
  },
  {
    code: "OK 43",
    title: "Malachite Silver One-of-a-Kind Pendant (OK 43)",
    stones: [{ slug: "malachite", isPrimary: true }],
  },
  {
    code: "OK 44",
    title: "Citrine Silver One-of-a-Kind Pendant (OK 44)",
    stones: [{ slug: "citrine", isPrimary: true }],
  },
  {
    code: "OK 45",
    title: "Citrine Silver One-of-a-Kind Pendant (OK 45)",
    stones: [{ slug: "citrine", isPrimary: true }],
  },
  {
    code: "OK 46",
    title: "Citrine & Pearl Silver One-of-a-Kind Pendant (OK 46)",
    stones: [
      { slug: "citrine", isPrimary: true },
      { slug: "pearl", isPrimary: false },
    ],
  },
];

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  console.log("Connected to PostgreSQL for pendants & stones catalog update...");

  // Load stones map
  const stoneRows = await client.query("SELECT id, name, slug FROM stones;");
  const stoneMap = new Map();
  for (const s of stoneRows.rows) {
    stoneMap.set(s.slug.toLowerCase(), s.id);
    stoneMap.set(s.name.toLowerCase(), s.id);
  }

  const careText =
    "Clean gently with a soft microfibre or silver polishing cloth. Avoid contact with perfumes, chlorine, hairsprays, and harsh chemicals. Store in the provided Millennium Designs velvet presentation case in a cool, dry place to maintain its radiant high-polish lustre.";

  for (const item of CATALOG_STONE_CORRECTIONS) {
    const prodRes = await client.query(
      "SELECT p.id, p.subtitle, c.slug as cat_slug FROM products p JOIN categories c ON c.id = p.primary_category_id WHERE p.subtitle = $1;",
      [item.code]
    );
    if (prodRes.rows.length === 0) {
      console.warn(`Product not found for ${item.code}`);
      continue;
    }
    const product = prodRes.rows[0];
    const productId = product.id;

    const stoneNames = item.stones
      .map((st) => {
        const row = stoneRows.rows.find((r) => r.slug === st.slug);
        return row ? row.name : st.slug;
      })
      .join(" ");

    const searchText =
      `${item.title} ${item.code} ${stoneNames} 925 silver sterling jaipur ${product.cat_slug}`.toLowerCase();

    // 1. Update Product
    const desc =
      item.description ||
      `Handcrafted in our Jaipur atelier from solid 925 sterling silver hallmarked alloy, this exquisite piece (${item.code}) showcases hand-selected natural ${stoneNames}. Meticulously bezel-set by master silversmiths with anti-tarnish protective lustre.`;

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
        JSON.stringify({ text: desc }),
        JSON.stringify({ text: careText }),
        searchText,
        productId,
      ]
    );

    // 2. Clear old product_stones
    await client.query("DELETE FROM product_stones WHERE product_id = $1;", [
      productId,
    ]);

    // 3. Insert correct product_stones
    for (let i = 0; i < item.stones.length; i++) {
      const st = item.stones[i];
      const sId = stoneMap.get(st.slug);
      if (!sId) {
        console.error(`Stone not found in DB: ${st.slug}`);
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

    console.log(`✓ Updated ${item.code}: ${item.title} -> [${stoneNames}]`);
  }

  console.log("All catalog stone updates successfully completed in database!");
  await client.end();
}

main().catch(console.error);
