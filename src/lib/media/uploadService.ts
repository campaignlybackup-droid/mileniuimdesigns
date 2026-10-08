import "server-only";
import { v2 as cloudinary, type UploadApiResponse } from "cloudinary";
import crypto from "node:crypto";
import { db } from "@/lib/db/client";
import { mediaConfig } from "@/lib/config/env";
import { ProductMediaRole } from "@/generated/prisma/client";

// Configure Cloudinary
function getCloudinary() {
  const { cloudName, apiKey, apiSecret } = mediaConfig();
  if (cloudName && apiKey && apiSecret) {
    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true,
    });
  }
  return cloudinary;
}

export type UploadOptions = {
  folder?: string;
  altText?: string;
  productId?: string;
  role?: "hero" | "gallery" | "detail" | "lifestyle" | "mobile" | "video_thumbnail";
  userId?: string;
};

export type MediaResult = {
  id: string;
  mediaId: string;
  publicId: string;
  url: string;
  format: string;
  width: number | null;
  height: number | null;
  bytes: number;
  altText: string | null;
  role: string;
  position: number;
};

/**
 * Upload an image buffer directly to Cloudinary and register in PostgreSQL media library.
 */
export async function uploadImageBuffer(
  buffer: Buffer,
  filename: string,
  options: UploadOptions = {},
): Promise<MediaResult> {
  const cld = getCloudinary();
  const folder = options.folder || "products";

  // Upload buffer to Cloudinary via upload_stream
  const uploadRes = await new Promise<UploadApiResponse>((resolve, reject) => {
    const stream = cld.uploader.upload_stream(
      {
        folder,
        resource_type: "image",
        overwrite: true,
      },
      (error, result) => {
        if (error || !result) {
          reject(error || new Error("Failed to receive upload result from Cloudinary"));
        } else {
          resolve(result);
        }
      },
    );
    stream.end(buffer);
  });

  return registerMediaItem(uploadRes, options);
}

/**
 * Upload an external image URL to Cloudinary and register in PostgreSQL media library.
 */
export async function uploadImageUrl(
  imageUrl: string,
  options: UploadOptions = {},
): Promise<MediaResult> {
  const cld = getCloudinary();
  const folder = options.folder || "products";

  const uploadRes = await cld.uploader.upload(imageUrl, {
    folder,
    resource_type: "image",
  });

  return registerMediaItem(uploadRes, options);
}

/**
 * Helper to register Cloudinary Upload result in media & product_media tables.
 */
async function registerMediaItem(
  uploadRes: UploadApiResponse,
  options: UploadOptions,
): Promise<MediaResult> {
  const mediaId = crypto.randomUUID();

  // Create Media record
  const media = await db.media.create({
    data: {
      id: mediaId,
      kind: "image",
      provider: "cloudinary",
      publicId: uploadRes.public_id,
      version: String(uploadRes.version || ""),
      format: uploadRes.format || "jpg",
      bytes: BigInt(uploadRes.bytes || 0),
      width: uploadRes.width || null,
      height: uploadRes.height || null,
      altText: options.altText || null,
      uploadedByUserId: options.userId || null,
    },
  });

  let productMediaId = "";
  let role = options.role || "gallery";
  let position = 0;

  // If a productId is provided, attach to product_media
  if (options.productId) {
    const existingMedia = await db.productMedia.findMany({
      where: { productId: options.productId },
      orderBy: { position: "desc" },
      take: 1,
    });

    const hasHero = await db.productMedia.findFirst({
      where: { productId: options.productId, role: "hero" },
    });

    // If there is no hero image yet, default this one to hero
    if (!hasHero && (!options.role || options.role === "gallery")) {
      role = "hero";
    }

    position = existingMedia.length > 0 ? existingMedia[0]!.position + 1 : 0;
    productMediaId = crypto.randomUUID();

    const roleEnum = (ProductMediaRole as Record<string, ProductMediaRole>)[role] || ProductMediaRole.gallery;

    await db.productMedia.create({
      data: {
        id: productMediaId,
        productId: options.productId,
        mediaId: media.id,
        role: roleEnum,
        position,
      },
    });
  }

  const cloudName = process.env["CLOUDINARY_CLOUD_NAME"] || "gm6dexkj";
  const url = uploadRes.secure_url || `https://res.cloudinary.com/${cloudName}/image/upload/${uploadRes.public_id}`;

  return {
    id: productMediaId || media.id,
    mediaId: media.id,
    publicId: media.publicId,
    url,
    format: media.format,
    width: media.width,
    height: media.height,
    bytes: Number(media.bytes),
    altText: media.altText,
    role,
    position,
  };
}
