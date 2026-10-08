import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { requireStaffSession } from "@/lib/auth/actor";
import { ProductMediaRole } from "@/generated/prisma/client";
import { revalidatePath } from "next/cache";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireStaffSession();
    const { id } = await params;

    const items = await db.productMedia.findMany({
      where: { productId: id, media: { deletedAt: null } },
      include: { media: true },
      orderBy: { position: "asc" },
    });

    const cloudName = process.env["CLOUDINARY_CLOUD_NAME"] || "gm6dexkj";

    const media = items.map((pm) => ({
      id: pm.id,
      mediaId: pm.mediaId,
      publicId: pm.media.publicId,
      format: pm.media.format,
      width: pm.media.width,
      height: pm.media.height,
      bytes: Number(pm.media.bytes),
      altText: pm.media.altText,
      role: pm.role,
      position: pm.position,
      url: pm.media.publicId.startsWith("http") || pm.media.publicId.startsWith("/")
        ? pm.media.publicId
        : `https://res.cloudinary.com/${cloudName}/image/upload/${pm.media.publicId}`,
    }));

    return NextResponse.json({ ok: true, media });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to load product media.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * PUT: Reorder or update roles/alt texts of product media
 * Body: { items: Array<{ id: string; position: number; role?: string; altText?: string }> }
 */
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
    const { items } = body as {
      items: Array<{ id: string; position: number; role?: string; altText?: string }>;
    };

    if (!Array.isArray(items)) {
      return NextResponse.json({ error: "Expected an array of media items." }, { status: 400 });
    }

    for (const item of items) {
      const roleEnum = item.role
        ? (ProductMediaRole as Record<string, ProductMediaRole>)[item.role] || ProductMediaRole.gallery
        : undefined;

      await db.productMedia.update({
        where: { id: item.id },
        data: {
          position: item.position,
          ...(roleEnum ? { role: roleEnum } : {}),
        },
      });

      if (item.altText !== undefined) {
        const pm = await db.productMedia.findUnique({
          where: { id: item.id },
          select: { mediaId: true },
        });
        if (pm?.mediaId) {
          await db.media.update({
            where: { id: pm.mediaId },
            data: { altText: item.altText },
          });
        }
      }
    }

    revalidatePath(`/admin/products/${id}`);
    revalidatePath("/admin/products");

    return NextResponse.json({ ok: true, message: "Product media arrangement updated." });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to update media.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * DELETE: Remove a photo from product_media
 * Query or body: productMediaId
 */
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
    const { searchParams } = new URL(request.url);
    const productMediaId = searchParams.get("productMediaId");

    if (!productMediaId) {
      return NextResponse.json({ error: "productMediaId query parameter is required." }, { status: 400 });
    }

    const existing = await db.productMedia.findFirst({
      where: { id: productMediaId, productId: id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Media item not found on this product." }, { status: 404 });
    }

    await db.productMedia.delete({
      where: { id: productMediaId },
    });

    // If the deleted item was the hero, ensure another image becomes hero
    if (existing.role === "hero") {
      const nextFirst = await db.productMedia.findFirst({
        where: { productId: id },
        orderBy: { position: "asc" },
      });
      if (nextFirst) {
        await db.productMedia.update({
          where: { id: nextFirst.id },
          data: { role: "hero" },
        });
      }
    }

    revalidatePath(`/admin/products/${id}`);
    revalidatePath("/admin/products");

    return NextResponse.json({ ok: true, message: "Photo removed from product." });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to delete media.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
