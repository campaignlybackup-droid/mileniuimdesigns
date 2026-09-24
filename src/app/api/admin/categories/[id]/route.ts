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

    const category = await db.category.findUnique({
      where: { id },
      include: {
        _count: {
          select: { primaryFor: true },
        },
      },
    });

    if (!category || category.deletedAt) {
      return NextResponse.json({ error: "Category not found." }, { status: 404 });
    }

    let descriptionText = "";
    if (category.descriptionJson && typeof category.descriptionJson === "object") {
      try {
        const json = category.descriptionJson as Record<string, unknown>;
        const content = (json.content as Array<{ content?: Array<{ text?: string }> }>) || [];
        descriptionText = content
          .map((c) => c.content?.map((t) => t.text).join("") || "")
          .join("\n\n");
      } catch {
        descriptionText = "";
      }
    }

    return NextResponse.json({
      ok: true,
      category: {
        id: category.id,
        name: category.name,
        slug: category.slug,
        skuToken: category.skuToken,
        rank: category.rank,
        isPublished: category.isPublished,
        description: descriptionText,
        productCount: category._count.primaryFor,
        updatedAt: category.updatedAt,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to load category.";
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
    const { name, slug, description, rank, isPublished, skuToken } = body;

    const existing = await db.category.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) {
      return NextResponse.json({ error: "Category not found." }, { status: 404 });
    }

    await withTransaction(async (tx) => {
      await tx.category.update({
        where: { id },
        data: {
          name: name ? String(name).trim() : existing.name,
          slug: slug ? String(slug).trim().toLowerCase() : existing.slug,
          skuToken: skuToken ? String(skuToken).trim().slice(0, 3).toUpperCase() : existing.skuToken,
          rank: rank !== undefined ? Number(rank) : existing.rank,
          isPublished: isPublished !== undefined ? Boolean(isPublished) : existing.isPublished,
          descriptionJson: description !== undefined
            ? (description ? { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: description }] }] } : Prisma.DbNull)
            : (existing.descriptionJson ? (existing.descriptionJson as Prisma.InputJsonValue) : Prisma.DbNull),
          updatedAt: new Date(),
        },
      });

      await tx.auditLog.create({
        data: {
          actorType: "staff",
          actorUserId: actor.userId,
          entity: "categories",
          entityId: id,
          action: "category.update",
          summary: `Updated category "${name || existing.name}"`,
        },
      });
    });

    revalidatePath("/admin/categories");
    revalidatePath("/admin/products");
    revalidatePath("/[market]/[category]", "page");

    return NextResponse.json({ ok: true, message: "Category updated successfully." });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to update category.";
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
    const existing = await db.category.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) {
      return NextResponse.json({ error: "Category not found." }, { status: 404 });
    }

    await withTransaction(async (tx) => {
      await tx.category.update({
        where: { id },
        data: { deletedAt: new Date(), isPublished: false },
      });

      await tx.auditLog.create({
        data: {
          actorType: "staff",
          actorUserId: actor.userId,
          entity: "categories",
          entityId: id,
          action: "category.delete",
          summary: `Archived category "${existing.name}"`,
        },
      });
    });

    revalidatePath("/admin/categories");
    return NextResponse.json({ ok: true, message: `Category "${existing.name}" archived.` });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to archive category.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
