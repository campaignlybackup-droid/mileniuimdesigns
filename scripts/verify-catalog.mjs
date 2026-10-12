import "dotenv/config";
import fs from "node:fs";
import pg from "pg";

const { Client } = pg;

async function runVerification(passNumber) {
  console.log(`\n======================================================`);
  console.log(`>>> STARTING VERIFICATION PASS ${passNumber} OF 2 <<<`);
  console.log(`======================================================\n`);

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const originalSheetItems = JSON.parse(
    fs.readFileSync(
      "/Users/anshbhatt/.gemini/antigravity-ide/brain/4a8a88c2-2b7f-4629-bf26-4ae1239bb1c3/scratch/sheet_items.json",
      "utf8",
    ),
  );

  console.log(`Total original spreadsheet items to verify: ${originalSheetItems.length}`);

  // 1. Check Product table count
  const countRes = await client.query("SELECT count(*) FROM products WHERE deleted_at IS NULL;");
  const productCount = parseInt(countRes.rows[0].count, 10);
  console.log(`Live DB Product Count: ${productCount}`);
  if (productCount !== 82) {
    throw new Error(`FAIL: Expected exactly 82 products in DB, found ${productCount}`);
  }

  // 2. Fetch all products with variants, prices, categories, and media
  const query = `
    SELECT 
      p.id AS product_id,
      p.slug,
      p.title,
      p.subtitle AS item_code,
      p.is_one_of_a_kind,
      c.slug AS category_slug,
      c.name AS category_name,
      pv.id AS variant_id,
      pv.sku,
      pv.gross_weight_grams,
      pr.market_code,
      pr.currency_code,
      pr.list_minor,
      ii.on_hand_quantity,
      ii.available_quantity,
      count(pm.id) AS media_count
    FROM products p
    JOIN categories c ON p.primary_category_id = c.id
    JOIN product_variants pv ON pv.product_id = p.id
    LEFT JOIN prices pr ON pr.product_id = p.id AND pr.market_code = 'IN'
    LEFT JOIN inventory_items ii ON ii.variant_id = pv.id
    LEFT JOIN product_media pm ON pm.product_id = p.id
    WHERE p.deleted_at IS NULL
    GROUP BY p.id, c.id, pv.id, pr.id, ii.id
    ORDER BY p.rank ASC;
  `;

  const { rows } = await client.query(query);
  console.log(`Retrieved ${rows.length} product/variant join records from live DB.`);

  if (rows.length !== 82) {
    throw new Error(`FAIL: Expected 82 joined rows, got ${rows.length}`);
  }

  const dbByCode = new Map();
  for (const r of rows) {
    dbByCode.set(r.item_code, r);
  }

  let errorCount = 0;
  let verifiedCount = 0;

  for (const item of originalSheetItems) {
    const code = item.code;
    const dbItem = dbByCode.get(code);

    if (!dbItem) {
      console.error(`[FAIL] Item ${code} NOT FOUND in database!`);
      errorCount++;
      continue;
    }

    // Check Grams Weight
    const dbWeight = parseFloat(dbItem.gross_weight_grams);
    const expectedWeight = parseFloat(item.weight_gm);
    const weightDiff = Math.abs(dbWeight - expectedWeight);
    if (weightDiff > 0.001) {
      console.error(
        `[FAIL] ${code} Weight mismatch: DB has ${dbWeight}g, Excel sheet has ${expectedWeight}g`,
      );
      errorCount++;
    }

    // Check INR Amount
    const expectedMinor = BigInt(Math.round(item.amount_inr * 100));
    const dbMinor = BigInt(dbItem.list_minor);
    if (dbMinor !== expectedMinor) {
      console.error(
        `[FAIL] ${code} INR Price mismatch: DB has ${dbMinor} paise (₹${Number(dbMinor) / 100}), Excel has ${expectedMinor} paise (₹${item.amount_inr})`,
      );
      errorCount++;
    }

    // Check Category
    let expectedCategorySlug = "";
    if (item.category_sheet === "Bracelet") expectedCategorySlug = "bracelets";
    else if (item.category_sheet === "One of A Kind") expectedCategorySlug = "one-of-a-kind";
    else if (item.category_sheet === "EARING") expectedCategorySlug = "earrings";
    else if (item.category_sheet === "Pendant") expectedCategorySlug = "pendants";

    if (dbItem.category_slug !== expectedCategorySlug) {
      console.error(
        `[FAIL] ${code} Category mismatch: DB has '${dbItem.category_slug}', expected '${expectedCategorySlug}'`,
      );
      errorCount++;
    }

    // Check Media Count
    const mediaCount = parseInt(dbItem.media_count, 10);
    if (mediaCount < 1) {
      console.error(`[FAIL] ${code} has NO media attached!`);
      errorCount++;
    }

    // Check Inventory
    if (dbItem.available_quantity < 1) {
      console.error(`[FAIL] ${code} has no inventory available!`);
      errorCount++;
    }

    verifiedCount++;
  }

  console.log(`\n--- Pass ${passNumber} Summary ---`);
  console.log(`Total Checked: ${originalSheetItems.length}`);
  console.log(`Successfully Verified: ${verifiedCount}`);
  console.log(`Errors Found: ${errorCount}`);

  if (errorCount > 0) {
    throw new Error(`Verification Pass ${passNumber} FAILED with ${errorCount} errors.`);
  }

  console.log(`>>> VERIFICATION PASS ${passNumber} COMPLETED WITH ZERO ERRORS! <<<\n`);
  await client.end();
}

async function main() {
  await runVerification(1);
  await runVerification(2);
  console.log("\n==================================================================");
  console.log(">>> DOUBLE VERIFICATION (2x) COMPLETE: 100% ACCURACY CONFIRMED! <<<");
  console.log("==================================================================\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
