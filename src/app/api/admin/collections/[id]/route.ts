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

    const collection = await db.collection.findUnique({
      where: { id },
      include: {
        products: {
          include: {
            product: {
              select: { id: true, title: true, slug: true },
            },
          },
        },
      },
    });

    if (!collection || collection.deletedAt) {
      return NextResponse.json({ error: "Collection not found." }, { status: 404 });
    }

    let descriptionText = "";
    if (collection.descriptionJson && typeof collection.descriptionJson === "object") {
      try {
        const json = collection.descriptionJson as Record<string, unknown>;
        const content = (json.content as Array<{ content?: Array<{ text?: string }> }>) || [];
        descriptionText = content
          .map((c) => c.content?.map((t) => t.text).join("") || "")
          .join("\n\n");
      } catch {
        descriptionText = "";
      }
    }

    const allProducts = await db.product.findMany({
      where: { deletedAt: null },
      select: { id: true, title: true, slug: true },
      orderBy: { title: "asc" },
      take: 200,
    });

    return NextResponse.json({
      ok: true,
      collection: {
        id: collection.id,
        title: collection.title,
        slug: collection.slug,
        rank: collection.rank,
        isPublished: collection.isPublished,
        description: descriptionText,
        productIds: collection.products.map((p) => p.productId),
        updatedAt: collection.updatedAt,
      },
      availableProducts: allProducts,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to load collection.";
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
    const { title, slug, description, rank, isPublished, productIds } = body;

    const existing = await db.collection.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) {
      return NextResponse.json({ error: "Collection not found." }, { status: 404 });
    }

    await withTransaction(async (tx) => {
      await tx.collection.update({
        where: { id },
        data: {
          title: title ? String(title).trim() : existing.title,
          slug: slug ? String(slug).trim().toLowerCase() : existing.slug,
          rank: rank !== undefined ? Number(rank) : existing.rank,
          isPublished: isPublished !== undefined ? Boolean(isPublished) : existing.isPublished,
          descriptionJson: description !== undefined
            ? (description ? { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: description }] }] } : Prisma.DbNull)
            : (existing.descriptionJson ? (existing.descriptionJson as Prisma.InputJsonValue) : Prisma.DbNull),
          updatedAt: new Date(),
        },
      });

      if (Array.isArray(productIds)) {
        await tx.productCollection.deleteMany({ where: { collectionId: id } });
        for (let i = 0; i < productIds.length; i++) {
          const pid = productIds[i];
          if (pid) {
            await tx.productCollection.create({
              data: {
                productId: pid,
                collectionId: id,
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
          entityId: id,
          action: "collection.update",
          summary: `Updated collection "${title || existing.title}"`,
        },
      });
    });

    revalidatePath("/admin/collections");
    revalidatePath("/admin/products");
    revalidatePath("/[market]/collections", "page");

    return NextResponse.json({ ok: true, message: "Collection updated successfully." });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to update collection.";
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
    const existing = await db.collection.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) {
      return NextResponse.json({ error: "Collection not found." }, { status: 404 });
    }

    await withTransaction(async (tx) => {
      await tx.collection.update({
        where: { id },
        data: { deletedAt: new Date(), isPublished: false },
      });

      await tx.auditLog.create({
        data: {
          actorType: "staff",
          actorUserId: actor.userId,
          entity: "collections",
          entityId: id,
          action: "collection.delete",
          summary: `Archived collection "${existing.title}"`,
        },
      });
    });

    revalidatePath("/admin/collections");
    return NextResponse.json({ ok: true, message: `Collection "${existing.title}" archived.` });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to archive collection.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
