import "server-only";
import crypto from "node:crypto";
import { db } from "@/lib/db/client";
import { withTransaction } from "@/lib/db/transaction";

export type ImportRow = {
  sku: string;
  title: string;
  category?: string;
  inrPriceMinor?: bigint;
  usdPriceMinor?: bigint;
  stock?: number;
  subtitle?: string;
  description?: string;
};

export type ImportResult = {
  total: number;
  imported: number;
  updated: number;
  failed: number;
  duplicates: number;
  invalid: number;
  errors: { row: number; sku?: string; error: string }[];
};

function parseMinorFromString(raw: string | undefined): bigint | undefined {
  if (!raw) return undefined;
  const clean = raw.trim().replace(/['",]/g, "");
  if (!clean || !/^\d+(\.\d{1,2})?$/.test(clean)) return undefined;
  const [whole, fraction = ""] = clean.split(".");
  const paddedFraction = (fraction + "00").slice(0, 2);
  return BigInt(whole) * 100n + BigInt(paddedFraction);
}

export function parseCsvContent(csv: string): ImportRow[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  // Parse header
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/['"]/g, ""));
  const skuIdx = header.findIndex((h) => h === "sku");
  const titleIdx = header.findIndex((h) => h === "title" || h === "name" || h === "product_name");
  const catIdx = header.findIndex((h) => h === "category" || h === "category_slug");
  const inrIdx = header.findIndex((h) => h === "inr_price" || h === "price_inr" || h === "inr");
  const usdIdx = header.findIndex((h) => h === "usd_price" || h === "price_usd" || h === "usd");
  const stockIdx = header.findIndex((h) => h === "stock" || h === "inventory" || h === "qty");
  const subIdx = header.findIndex((h) => h === "subtitle");
  const descIdx = header.findIndex((h) => h === "description");

  const rows: ImportRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    // Split CSV handling simple quotes
    const parts: string[] = [];
    let inQuotes = false;
    let cur = "";
    for (let c = 0; c < line.length; c++) {
      const ch = line[c];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) {
        parts.push(cur.trim());
        cur = "";
      } else {
        cur += ch;
      }
    }
    parts.push(cur.trim());

    const sku = skuIdx >= 0 ? parts[skuIdx]?.replace(/['"]/g, "") : "";
    const title = titleIdx >= 0 ? parts[titleIdx]?.replace(/['"]/g, "") : "";
    if (!sku || !title) continue;

    rows.push({
      sku,
      title,
      category: catIdx >= 0 ? parts[catIdx]?.replace(/['"]/g, "") : undefined,
      inrPriceMinor: inrIdx >= 0 ? parseMinorFromString(parts[inrIdx]) : undefined,
      usdPriceMinor: usdIdx >= 0 ? parseMinorFromString(parts[usdIdx]) : undefined,
      stock: stockIdx >= 0 ? parseInt(parts[stockIdx], 10) : 10,
      subtitle: subIdx >= 0 ? parts[subIdx]?.replace(/['"]/g, "") : undefined,
      description: descIdx >= 0 ? parts[descIdx]?.replace(/['"]/g, "") : undefined,
    });
  }

  return rows;
}

export async function processBulkImport(rows: ImportRow[]): Promise<ImportResult> {
  const result: ImportResult = {
    total: rows.length,
    imported: 0,
    updated: 0,
    failed: 0,
    duplicates: 0,
    invalid: 0,
    errors: [],
  };

  if (rows.length === 0) return result;

  // Track duplicates within file
  const seenSkus = new Set<string>();

  // Fetch category mappings
  const categories = await db.category.findMany({
    select: { id: true, slug: true },
  });
  const categoryMap = new Map(categories.map((c) => [c.slug.toLowerCase(), c.id]));
  const defaultCategoryId = categories[0]?.id;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;

    if (!row.sku || row.sku.length < 2) {
      result.invalid++;
      result.errors.push({ row: rowNum, error: "Missing or invalid SKU" });
      continue;
    }

    if (!row.title) {
      result.invalid++;
      result.errors.push({ row: rowNum, sku: row.sku, error: "Missing product title" });
      continue;
    }

    if (seenSkus.has(row.sku.toUpperCase())) {
      result.duplicates++;
      result.errors.push({ row: rowNum, sku: row.sku, error: "Duplicate SKU in import file" });
      continue;
    }
    seenSkus.add(row.sku.toUpperCase());

    const catSlug = (row.category ?? "").toLowerCase().trim();
    const primaryCategoryId = categoryMap.get(catSlug) ?? defaultCategoryId;

    try {
      await withTransaction(async (tx) => {
        // Check if variant with SKU already exists
        const existingVariant = await tx.productVariant.findFirst({
          where: { sku: row.sku },
          select: { id: true, productId: true },
        });

        if (existingVariant) {
          // Update existing product and variant
          await tx.product.update({
            where: { id: existingVariant.productId },
            data: {
              title: row.title,
              subtitle: row.subtitle ?? undefined,
            },
          });

          // Update prices if provided
          if (row.inrPriceMinor && row.inrPriceMinor > 0n) {
            const inrMinor = row.inrPriceMinor;
            await tx.price.updateMany({
              where: {
                variantId: existingVariant.id,
                marketCode: "IN",
                validTo: null,
                deletedAt: null,
              },
              data: { validTo: new Date() },
            });
            await tx.price.create({
              data: {
                productId: existingVariant.productId,
                variantId: existingVariant.id,
                marketCode: "IN",
                currencyCode: "INR",
                listMinor: inrMinor,
                priceSource: "manual",
                validFrom: new Date(),
              },
            });
          }

          if (row.usdPriceMinor && row.usdPriceMinor > 0n) {
            const usdMinor = row.usdPriceMinor;
            await tx.price.updateMany({
              where: {
                variantId: existingVariant.id,
                marketCode: "US",
                validTo: null,
                deletedAt: null,
              },
              data: { validTo: new Date() },
            });
            await tx.price.create({
              data: {
                productId: existingVariant.productId,
                variantId: existingVariant.id,
                marketCode: "US",
                currencyCode: "USD",
                listMinor: usdMinor,
                priceSource: "manual",
                validFrom: new Date(),
              },
            });
          }

          result.updated++;
        } else {
          // Create new Product & Variant
          const slugBase = row.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
          const slug = `${slugBase}-${row.sku.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

          const productId = crypto.randomUUID();
          const variantId = crypto.randomUUID();

          await tx.product.create({
            data: {
              id: productId,
              title: row.title,
              slug,
              subtitle: row.subtitle ?? null,
              primaryCategoryId,
              status: "active",
              publishedAt: new Date(),
              defaultVariantId: variantId,
            },
          });

          await tx.productVariant.create({
            data: {
              id: variantId,
              productId,
              sku: row.sku,
              title: "Standard Edition",
              isActive: true,
            },
          });

          // Insert INR price
          const inrMinor = row.inrPriceMinor && row.inrPriceMinor > 0n ? row.inrPriceMinor : 1500000n;
          await tx.price.create({
            data: {
              productId,
              variantId,
              marketCode: "IN",
              currencyCode: "INR",
              listMinor: inrMinor,
              priceSource: "manual",
              validFrom: new Date(),
            },
          });

          // Insert USD price (independent price, never converted!)
          const usdMinor = row.usdPriceMinor && row.usdPriceMinor > 0n ? row.usdPriceMinor : 18000n;
          await tx.price.create({
            data: {
              productId,
              variantId,
              marketCode: "US",
              currencyCode: "USD",
              listMinor: usdMinor,
              priceSource: "manual",
              validFrom: new Date(),
            },
          });

          // Set default inventory
          const loc = await tx.inventoryLocation.findFirst({ select: { id: true } });
          if (loc) {
            await tx.inventoryItem.create({
              data: {
                variantId,
                locationId: loc.id,
                isOneOfAKind: false,
                onHandQuantity: row.stock ?? 10,
                availableQuantity: row.stock ?? 10,
              },
            });
          }

          result.imported++;
        }
      });
    } catch (err: unknown) {
      result.failed++;
      const message = err instanceof Error ? err.message : "Unknown database error";
      result.errors.push({ row: rowNum, sku: row.sku, error: message });
    }
  }

  return result;
}
