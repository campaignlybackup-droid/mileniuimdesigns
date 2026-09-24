import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { Prisma } from "@/generated/prisma/client";
import { requireStaffSession } from "@/lib/auth/actor";
import { withTransaction } from "@/lib/db/transaction";
import { revalidatePath } from "next/cache";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireStaffSession();
    const { id } = await params;

    const product = await db.product.findUnique({
      where: { id },
      include: {
        primaryCategory: true,
        collections: {
          include: { collection: true },
        },
        stones: {
          include: { stone: true },
        },
        variants: {
          include: {
            prices: {
              where: { validTo: null, deletedAt: null },
            },
            inventoryItems: true,
          },
        },
        marketContent: true,
      },
    });

    if (!product || product.deletedAt) {
      return NextResponse.json({ error: "Product not found." }, { status: 404 });
    }

    const [allCategories, allCollections, allStones] = await Promise.all([
      db.category.findMany({
        where: { isPublished: true, deletedAt: null },
        select: { id: true, name: true, slug: true },
        orderBy: { name: "asc" },
      }),
      db.collection.findMany({
        where: { deletedAt: null },
        select: { id: true, title: true, slug: true },
        orderBy: { title: "asc" },
      }),
      db.stone.findMany({
        where: { deletedAt: null },
        select: { id: true, name: true, slug: true, colourHex: true },
        orderBy: { name: "asc" },
      }),
    ]);

    const defaultVariant = product.variants[0];
    const inrPriceRow = defaultVariant?.prices.find((p) => p.marketCode === "IN");
    const usdPriceRow = defaultVariant?.prices.find((p) => p.marketCode === "US");

    const inrPrice = inrPriceRow ? Number(inrPriceRow.listMinor) / 100 : 0;
    const usdPrice = usdPriceRow ? Number(usdPriceRow.listMinor) / 100 : 0;
    const stock = defaultVariant?.inventoryItems.reduce((acc, i) => acc + i.onHandQuantity, 0) ?? 0;

    // Extract text from JSON if exists
    let descriptionText = "";
    if (product.descriptionJson && typeof product.descriptionJson === "object") {
      try {
        const json = product.descriptionJson as Record<string, unknown>;
        const content = (json.content as Array<{ content?: Array<{ text?: string }> }>) || [];
        descriptionText = content
          .map((c) => c.content?.map((t) => t.text).join("") || "")
          .join("\n\n");
      } catch {
        descriptionText = "";
      }
    }

    let careText = "";
    if (product.careInstructionsJson && typeof product.careInstructionsJson === "object") {
      try {
        const json = product.careInstructionsJson as Record<string, unknown>;
        const content = (json.content as Array<{ content?: Array<{ text?: string }> }>) || [];
        careText = content
          .map((c) => c.content?.map((t) => t.text).join("") || "")
          .join("\n\n");
      } catch {
        careText = "";
      }
    }

    return NextResponse.json({
      ok: true,
      product: {
        id: product.id,
        title: product.title,
        subtitle: product.subtitle,
        slug: product.slug,
        status: product.status,
        primaryCategoryId: product.primaryCategoryId,
        collectionIds: product.collections.map((c) => c.collectionId),
        stoneIds: product.stones.map((s) => s.stoneId),
        sku: defaultVariant?.sku || "",
        inrPrice,
        usdPrice,
        stock,
        weightGrams: defaultVariant?.grossWeightGrams ? Number(defaultVariant.grossWeightGrams) : 12.5,
        description: descriptionText,
        careInstructions: careText,
        updatedAt: product.updatedAt,
      },
      availableCategories: allCategories,
      availableCollections: allCollections,
      availableStones: allStones,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to load product details.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireStaffSession();
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const {
      title,
      subtitle,
      slug,
      sku,
      categoryId,
      collectionIds,
      stoneIds,
      status,
      inrPrice,
      usdPrice,
      stock,
      description,
      careInstructions,
      weightGrams,
    } = body;

    const existing = await db.product.findUnique({
      where: { id },
      include: {
        variants: {
          include: {
            prices: { where: { validTo: null, deletedAt: null } },
            inventoryItems: true,
          },
        },
      },
    });

    if (!existing || existing.deletedAt) {
      return NextResponse.json({ error: "Product not found." }, { status: 404 });
    }

    const defaultVariant = existing.variants[0];

    await withTransaction(async (tx) => {
      // 1. Update Product Core
      await tx.product.update({
        where: { id },
        data: {
          title: title ? String(title).trim() : existing.title,
          subtitle: subtitle !== undefined ? String(subtitle).trim() || null : existing.subtitle,
          slug: slug ? String(slug).trim().toLowerCase() : existing.slug,
          primaryCategoryId: categoryId !== undefined ? categoryId || null : existing.primaryCategoryId,
          status: status ? (status === "draft" ? "draft" : status === "archived" ? "archived" : "active") : existing.status,
          descriptionJson: description !== undefined
            ? (description ? { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: description }] }] } : Prisma.DbNull)
            : (existing.descriptionJson ? (existing.descriptionJson as Prisma.InputJsonValue) : Prisma.DbNull),
          careInstructionsJson: careInstructions !== undefined
            ? (careInstructions ? { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: careInstructions }] }] } : Prisma.DbNull)
            : (existing.careInstructionsJson ? (existing.careInstructionsJson as Prisma.InputJsonValue) : Prisma.DbNull),
          updatedAt: new Date(),
        },
      });

      // 2. Update Collections mapping
      if (Array.isArray(collectionIds)) {
        await tx.productCollection.deleteMany({ where: { productId: id } });
        for (const colId of collectionIds) {
          if (colId) {
            await tx.productCollection.create({
              data: { productId: id, collectionId: colId, rank: 0, source: "manual" },
            }).catch(() => undefined);
          }
        }
      }

      // 3. Update Gemstones mapping
      if (Array.isArray(stoneIds)) {
        await tx.productStone.deleteMany({ where: { productId: id } });
        for (const stoneId of stoneIds) {
          if (stoneId) {
            await tx.productStone.create({
              data: { productId: id, stoneId },
            }).catch(() => undefined);
          }
        }
      }

      // 4. Update Variant info & inventory
      if (defaultVariant) {
        await tx.productVariant.update({
          where: { id: defaultVariant.id },
          data: {
            sku: sku ? String(sku).trim().toUpperCase() : defaultVariant.sku,
            grossWeightGrams: weightGrams ? Number(weightGrams) : defaultVariant.grossWeightGrams,
            updatedAt: new Date(),
          },
        });

        // Update INR Price
        if (inrPrice !== undefined) {
          const inrMinor = BigInt(Math.max(100, Math.round(Number(inrPrice) * 100)));
          await tx.price.updateMany({
            where: { variantId: defaultVariant.id, marketCode: "IN", validTo: null, deletedAt: null },
            data: { validTo: new Date() },
          });
          await tx.price.create({
            data: {
              productId: id,
              variantId: defaultVariant.id,
              marketCode: "IN",
              currencyCode: "INR",
              listMinor: inrMinor,
              priceSource: "manual",
              validFrom: new Date(),
            },
          });
        }

        // Update USD Price
        if (usdPrice !== undefined) {
          const usdMinor = BigInt(Math.max(100, Math.round(Number(usdPrice) * 100)));
          await tx.price.updateMany({
            where: { variantId: defaultVariant.id, marketCode: "US", validTo: null, deletedAt: null },
            data: { validTo: new Date() },
          });
          await tx.price.create({
            data: {
              productId: id,
              variantId: defaultVariant.id,
              marketCode: "US",
              currencyCode: "USD",
              listMinor: usdMinor,
              priceSource: "manual",
              validFrom: new Date(),
            },
          });
        }

        // Update Stock
        if (stock !== undefined) {
          const onHand = Math.max(0, parseInt(String(stock), 10) || 0);
          const firstItem = defaultVariant.inventoryItems[0];
          if (firstItem) {
            await tx.inventoryItem.update({
              where: { id: firstItem.id },
              data: { onHandQuantity: onHand, updatedAt: new Date() },
            });
          } else {
            const loc = await tx.inventoryLocation.findFirst({ select: { id: true } });
            if (loc) {
              await tx.inventoryItem.create({
                data: {
                  variantId: defaultVariant.id,
                  locationId: loc.id,
                  isOneOfAKind: false,
                  onHandQuantity: onHand,
                  reservedQuantity: 0,
                  availableQuantity: onHand,
                },
              });
            }
          }
        }
      }

      // Audit Log
      await tx.auditLog.create({
        data: {
          actorType: "staff",
          actorUserId: actor.userId,
          entity: "products",
          entityId: id,
          action: "product.update",
          summary: `Updated product "${title || existing.title}"`,
        },
      });
    });

    revalidatePath("/admin/products");
    revalidatePath(`/[market]/products/${existing.slug}`, "page");
    if (slug && slug !== existing.slug) {
      revalidatePath(`/[market]/products/${slug}`, "page");
    }

    return NextResponse.json({ ok: true, message: "Product updated successfully." });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to update product.";
    console.error("[UPDATE PRODUCT ERROR]:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireStaffSession();
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { id } = await params;
    const existing = await db.product.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) {
      return NextResponse.json({ error: "Product not found." }, { status: 404 });
    }

    await withTransaction(async (tx) => {
      await tx.product.update({
        where: { id },
        data: { deletedAt: new Date(), status: "archived" },
      });

      await tx.auditLog.create({
        data: {
          actorType: "staff",
          actorUserId: actor.userId,
          entity: "products",
          entityId: id,
          action: "product.delete",
          summary: `Archived/deleted product "${existing.title}"`,
        },
      });
    });

    revalidatePath("/admin/products");

    return NextResponse.json({ ok: true, message: `Product "${existing.title}" archived successfully.` });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to delete product.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
