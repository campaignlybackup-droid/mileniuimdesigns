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

    const categories = await db.category.findMany({
      where: { deletedAt: null },
      include: {
        _count: {
          select: { primaryFor: true },
        },
      },
      orderBy: { rank: "asc" },
    });

    return NextResponse.json({
      ok: true,
      categories: categories.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        rank: c.rank,
        isPublished: c.isPublished,
        skuToken: c.skuToken,
        productCount: c._count.primaryFor,
        updatedAt: c.updatedAt,
      })),
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to load categories.";
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
    const { name, slug: customSlug, description, rank = 0, isPublished = true, skuToken } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Category name is required." }, { status: 400 });
    }

    const cleanName = name.trim();
    const slug = customSlug?.trim()
      ? customSlug.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-")
      : cleanName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

    const token = skuToken?.trim()
      ? skuToken.trim().slice(0, 3).toUpperCase()
      : cleanName.slice(0, 3).toUpperCase();

    const categoryId = crypto.randomUUID();

    await withTransaction(async (tx) => {
      await tx.category.create({
        data: {
          id: categoryId,
          name: cleanName,
          slug,
          skuToken: token,
          rank: Number(rank) || 0,
          depth: 0,
          materializedPath: slug,
          isPublished: Boolean(isPublished),
          descriptionJson: description ? { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: description }] }] } : Prisma.DbNull,
        },
      });

      await tx.auditLog.create({
        data: {
          actorType: "staff",
          actorUserId: actor.userId,
          entity: "categories",
          entityId: categoryId,
          action: "category.create",
          summary: `Created category "${cleanName}" (${slug})`,
        },
      });
    });

    revalidatePath("/admin/categories");
    revalidatePath("/admin/products");
    revalidatePath("/[market]/[category]", "page");

    return NextResponse.json({ ok: true, categoryId, message: `Category "${cleanName}" created.` });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to create category.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
