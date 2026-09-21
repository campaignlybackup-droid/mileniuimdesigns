import type { PrismaClient } from "@/generated/prisma/client";
import { STANDALONE_PRODUCTS } from "@/lib/storage/standalone-catalog";

/**
 * Seed 500+ luxury catalogue pieces into PostgreSQL.
 * Idempotent: checks for existing product by slug before creating.
 */
export async function seed500Products(db: PrismaClient): Promise<{ count: number }> {
  let created = 0;

  // Pre-fetch categories, stones, and default location
  const categories = await db.category.findMany({ select: { id: true, slug: true } });
  const categoryMap = new Map(categories.map((c) => [c.slug.toLowerCase(), c.id]));

  const stones = await db.stone.findMany({ select: { id: true, slug: true } });
  const stoneMap = new Map(stones.map((s) => [s.slug.toLowerCase(), s.id]));

  const location = await db.inventoryLocation.findFirst({ select: { id: true } });

  for (const item of STANDALONE_PRODUCTS) {
    const existing = await db.product.findFirst({
      where: { slug: item.slug, deletedAt: null },
      select: { id: true },
    });
    if (existing) continue;

    const catId = categoryMap.get(item.categorySlug.toLowerCase()) ?? categories[0]?.id;
    const stoneId = item.stoneSlug ? stoneMap.get(item.stoneSlug.toLowerCase()) : undefined;

    const variantId = item.id.replace(/^00000000/, "00000001");

    await db.product.create({
      data: {
        id: item.id,
        slug: item.slug,
        title: item.title,
        subtitle: item.subtitle,
        primaryCategoryId: catId,
        isOneOfAKind: item.isOneOfAKind ?? false,
        status: "active",
        publishedAt: new Date(),
        rank: 100,
        defaultVariantId: variantId,
        variants: {
          create: {
            id: variantId,
            sku: `MD-${item.categorySlug.slice(0, 3).toUpperCase()}-${item.id.slice(-4)}`,
            title: "Standard Edition",
            position: 1,
            isActive: true,
            isOneOfAKind: item.isOneOfAKind ?? false,
            ...(location
              ? {
                  inventoryItems: {
                    create: {
                      locationId: location.id,
                      isOneOfAKind: item.isOneOfAKind ?? false,
                      onHandQuantity: item.isOneOfAKind ? 1 : 15,
                      availableQuantity: item.isOneOfAKind ? 1 : 15,
                    },
                  },
                }
              : {}),
          },
        },
        ...(stoneId
          ? {
              stones: {
                create: {
                  stoneId,
                  isPrimary: true,
                  position: 0,
                },
              },
            }
          : {}),
      },
    });

    // Create dual-market independent prices
    await db.price.create({
      data: {
        productId: item.id,
        variantId,
        marketCode: "US",
        currencyCode: "USD",
        listMinor: item.priceUsdMinor,
        priceSource: "manual",
        validFrom: new Date(),
      },
    });

    await db.price.create({
      data: {
        productId: item.id,
        variantId,
        marketCode: "IN",
        currencyCode: "INR",
        listMinor: item.priceInrMinor,
        priceSource: "manual",
        validFrom: new Date(),
      },
    });

    created++;
  }

  return { count: created };
}
