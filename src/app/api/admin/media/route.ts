import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { requireStaffSession } from "@/lib/auth/actor";

export async function GET(request: NextRequest) {
  try {
    await requireStaffSession();

    const { searchParams } = new URL(request.url);
    const limit = Math.min(100, Math.max(10, parseInt(searchParams.get("limit") || "40", 10)));

    const mediaRows = await db.media.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        publicId: true,
        format: true,
        bytes: true,
        width: true,
        height: true,
        altText: true,
        createdAt: true,
      },
    });

    const cloudName = process.env["CLOUDINARY_CLOUD_NAME"] || "gm6dexkj";

    const media = mediaRows.map((m) => ({
      id: m.id,
      publicId: m.publicId,
      format: m.format,
      width: m.width,
      height: m.height,
      bytes: Number(m.bytes),
      altText: m.altText,
      url: m.publicId.startsWith("http") || m.publicId.startsWith("/")
        ? m.publicId
        : `https://res.cloudinary.com/${cloudName}/image/upload/${m.publicId}`,
      createdAt: m.createdAt,
    }));

    return NextResponse.json({ ok: true, media });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to load media.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
