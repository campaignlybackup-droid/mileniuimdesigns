import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { db } from "@/lib/db/client";
import { Prisma } from "@/generated/prisma/client";
import { requireStaffSession } from "@/lib/auth/actor";
import { withTransaction } from "@/lib/db/transaction";
import { revalidatePath } from "next/cache";

export async function GET(request: NextRequest) {
  try {
    await requireStaffSession();

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search")?.trim().toLowerCase() || "";
    const category = searchParams.get("category") || "";
    const status = searchParams.get("status") || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(10, parseInt(searchParams.get("limit") || "50", 10)));
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {
      deletedAt: null,
    };

    if (status && (status === "active" || status === "draft" || status === "archived")) {
      where.status = status;
    }

    if (category && category !== "all") {
      where.primaryCategoryId = category;
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { slug: { contains: search, mode: "insensitive" } },
        { subtitle: { contains: search, mode: "insensitive" } },
        {
          variants: {
            some: {
              sku: { contains: search, mode: "insensitive" },
            },
          },
        },
      ];
    }

    const [products, totalCount, categories] = await Promise.all([
      db.product.findMany({
        where,
        select: {
          id: true,
          slug: true,
          title: true,
          subtitle: true,
          status: true,
          updatedAt: true,
          primaryCategory: {
            select: { id: true, name: true, slug: true },
          },
          variants: {
            take: 1,
            select: {
              id: true,
              sku: true,
              grossWeightGrams: true,
              prices: {
                where: { validTo: null, deletedAt: null },
                select: { marketCode: true, currencyCode: true, listMinor: true },
              },
              inventoryItems: {
                select: { onHandQuantity: true, reservedQuantity: true },
              },
            },
          },
        },
        orderBy: { updatedAt: "desc" },
        skip,
        take: limit,
      }),
      db.product.count({ where }),
      db.category.findMany({
        where: { isPublished: true, deletedAt: null },
        select: { id: true, name: true, slug: true },
        orderBy: { name: "asc" },
      }),
    ]);

    return NextResponse.json({
      ok: true,
      products,
      pagination: {
        total: totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit),
      },
      categories,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to load products.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireStaffSession();
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = await request.json();
    const {
      title,
      subtitle,
      slug: customSlug,
      sku: customSku,
      categoryId,
      collectionIds = [],
      status = "active",
      inrPrice = 0, // In rupees (e.g. 4500)
      usdPrice = 0, // In dollars (e.g. 55)
      stock = 10,
      description,
      careInstructions,
      weightGrams = 12.5,
    } = body;

    if (!title || typeof title !== "string" || !title.trim()) {
      return NextResponse.json({ error: "Product title is required." }, { status: 400 });
    }

    const cleanTitle = title.trim();
    const baseSlug = customSlug?.trim()
      ? customSlug.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-")
      : cleanTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

    const sku = customSku?.trim()
      ? customSku.trim().toUpperCase()
      : `MD-${baseSlug.slice(0, 3).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const slug = `${baseSlug}-${sku.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

    const productId = crypto.randomUUID();
    const variantId = crypto.randomUUID();

    const inrMinor = BigInt(Math.max(100, Math.round(Number(inrPrice) * 100)));
    const usdMinor = BigInt(Math.max(100, Math.round(Number(usdPrice) * 100)));

    await withTransaction(async (tx) => {
      // 1. Create Product
      await tx.product.create({
        data: {
          id: productId,
          title: cleanTitle,
          slug,
          subtitle: subtitle?.trim() || null,
          descriptionJson: description ? { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: description }] }] } : Prisma.DbNull,
          careInstructionsJson: careInstructions ? { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: careInstructions }] }] } : Prisma.DbNull,
          primaryCategoryId: categoryId || null,
          status: status === "draft" ? "draft" : status === "archived" ? "archived" : "active",
          publishedAt: status === "active" ? new Date() : null,
          defaultVariantId: variantId,
        },
      });

      // 2. Associate with collections if selected
      if (Array.isArray(collectionIds) && collectionIds.length > 0) {
        for (const colId of collectionIds) {
          if (colId) {
            await tx.productCollection.create({
              data: {
                productId,
                collectionId: colId,
                rank: 0,
                source: "manual",
              },
            }).catch(() => undefined);
          }
        }
      }

      // 3. Create Default Variant
      await tx.productVariant.create({
        data: {
          id: variantId,
          productId,
          sku,
          title: "Standard Edition",
          isActive: true,
          grossWeightGrams: weightGrams ? Number(weightGrams) : null,
        },
      });

      // 4. Create India (INR) Price
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

      // 5. Create US (USD) Price
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

      // 6. Set Inventory Ledger
      const location = await tx.inventoryLocation.findFirst({ select: { id: true } });
      if (location) {
        const onHand = Math.max(0, parseInt(String(stock), 10) || 0);
        await tx.inventoryItem.create({
          data: {
            variantId,
            locationId: location.id,
            isOneOfAKind: false,
            onHandQuantity: onHand,
            reservedQuantity: 0,
            availableQuantity: onHand,
          },
        });
      }

      // 7. Audit Log
      await tx.auditLog.create({
        data: {
          actorType: "staff",
          actorUserId: actor.userId,
          entity: "products",
          entityId: productId,
          action: "product.create",
          summary: `Created product "${cleanTitle}" (${sku})`,
        },
      });
    });

    revalidatePath("/admin/products");
    revalidatePath("/[market]/products", "page");

    return NextResponse.json({
      ok: true,
      productId,
      slug,
      sku,
      message: `Product "${cleanTitle}" created successfully.`,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to create product.";
    console.error("[CREATE PRODUCT ERROR]:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
