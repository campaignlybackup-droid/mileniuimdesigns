import { NextRequest, NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/auth/actor";
import { uploadImageBuffer, uploadImageUrl, type MediaResult } from "@/lib/media/uploadService";
import { revalidatePath } from "next/cache";

export async function POST(request: NextRequest) {
  try {
    const actor = await requireStaffSession();
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized. Staff session required." }, { status: 401 });
    }

    const contentType = request.headers.get("content-type") || "";

    // ── 1. Handle multipart/form-data file uploads ──────────────────
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const productId = (formData.get("productId") as string) || undefined;
      const role = (formData.get("role") as any) || undefined;
      const altText = (formData.get("altText") as string) || undefined;

      // Collect all files
      const files: File[] = [];
      for (const [key, value] of formData.entries()) {
        if (value instanceof File && (key === "file" || key === "files" || key.startsWith("file"))) {
          files.push(value);
        }
      }

      if (files.length === 0) {
        return NextResponse.json({ error: "No image files provided in form data." }, { status: 400 });
      }

      const results: MediaResult[] = [];
      const errors: string[] = [];

      for (const file of files) {
        try {
          const buffer = Buffer.from(await file.arrayBuffer());
          const uploaded = await uploadImageBuffer(buffer, file.name, {
            folder: "products",
            productId,
            role,
            altText: altText || file.name.replace(/\.[^/.]+$/, ""),
            userId: actor.userId,
          });
          results.push(uploaded);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Upload failed";
          errors.push(`File ${file.name}: ${msg}`);
        }
      }

      if (results.length === 0 && errors.length > 0) {
        return NextResponse.json({ error: errors.join(", ") }, { status: 500 });
      }

      if (productId) {
        revalidatePath(`/admin/products/${productId}`);
        revalidatePath("/admin/products");
      }

      return NextResponse.json({
        ok: true,
        media: results,
        errors: errors.length > 0 ? errors : undefined,
        count: results.length,
      });
    }

    // ── 2. Handle application/json URL or Public ID uploads ─────────
    if (contentType.includes("application/json")) {
      const body = await request.json();
      const { url, urls, productId, role, altText } = body;

      const urlList: string[] = [];
      if (typeof url === "string" && url.trim()) urlList.push(url.trim());
      if (Array.isArray(urls)) {
        for (const u of urls) {
          if (typeof u === "string" && u.trim()) urlList.push(u.trim());
        }
      }

      if (urlList.length === 0) {
        return NextResponse.json({ error: "No valid image URL provided." }, { status: 400 });
      }

      const results: MediaResult[] = [];
      const errors: string[] = [];

      for (const singleUrl of urlList) {
        try {
          const uploaded = await uploadImageUrl(singleUrl, {
            folder: "products",
            productId,
            role,
            altText,
            userId: actor.userId,
          });
          results.push(uploaded);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Failed to fetch image from URL";
          errors.push(`URL ${singleUrl}: ${msg}`);
        }
      }

      if (results.length === 0 && errors.length > 0) {
        return NextResponse.json({ error: errors.join(", ") }, { status: 500 });
      }

      if (productId) {
        revalidatePath(`/admin/products/${productId}`);
        revalidatePath("/admin/products");
      }

      return NextResponse.json({
        ok: true,
        media: results,
        errors: errors.length > 0 ? errors : undefined,
        count: results.length,
      });
    }

    return NextResponse.json({ error: "Unsupported Content-Type header." }, { status: 400 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Media upload failed.";
    console.error("[ADMIN MEDIA UPLOAD ERROR]:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
