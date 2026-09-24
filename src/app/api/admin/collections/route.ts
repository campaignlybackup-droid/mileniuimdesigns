import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { db } from "@/lib/db/client";
import { Prisma } from "@/generated/prisma/client";
import { requireStaffSession } from "@/lib/auth/actor";
import { withTransaction } from "@/lib/db/transaction";
import { revalidatePath } from "next/cache";

export async function GET() {
  try {
    await requireStaffSession();

    const collections = await db.collection.findMany({
      where: { deletedAt: null },
      include: {
        _count: {
          select: { products: true },
        },
      },
      orderBy: { rank: "asc" },
    });

    return NextResponse.json({
      ok: true,
      collections: collections.map((col) => ({
        id: col.id,
        title: col.title,
        slug: col.slug,
        rank: col.rank,
        isPublished: col.isPublished,
        productCount: col._count.products,
        updatedAt: col.updatedAt,
      })),
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to load collections.";
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
    const { title, slug: customSlug, description, rank = 0, isPublished = true, productIds = [] } = body;

    if (!title || typeof title !== "string" || !title.trim()) {
      return NextResponse.json({ error: "Collection title is required." }, { status: 400 });
    }

    const cleanTitle = title.trim();
    const slug = customSlug?.trim()
      ? customSlug.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-")
      : cleanTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

    const collectionId = crypto.randomUUID();

    await withTransaction(async (tx) => {
      await tx.collection.create({
        data: {
          id: collectionId,
          title: cleanTitle,
          slug,
          rank: Number(rank) || 0,
          isPublished: Boolean(isPublished),
          descriptionJson: description ? { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: description }] }] } : Prisma.DbNull,
        },
      });

      if (Array.isArray(productIds) && productIds.length > 0) {
        for (let i = 0; i < productIds.length; i++) {
          const pid = productIds[i];
          if (pid) {
            await tx.productCollection.create({
              data: {
                productId: pid,
                collectionId,
                rank: i,
                source: "manual",
              },
            }).catch(() => undefined);
          }
        }
      }

      await tx.auditLog.create({
        data: {
          actorType: "staff",
          actorUserId: actor.userId,
          entity: "collections",
          entityId: collectionId,
          action: "collection.create",
          summary: `Created collection "${cleanTitle}" (${slug})`,
        },
      });
    });

    revalidatePath("/admin/collections");
    revalidatePath("/admin/products");
    revalidatePath("/[market]/collections", "page");

    return NextResponse.json({ ok: true, collectionId, message: `Collection "${cleanTitle}" created.` });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to create collection.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
