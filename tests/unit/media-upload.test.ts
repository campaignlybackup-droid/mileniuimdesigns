import { describe, it, expect, vi } from "vitest";
import { uploadImageBuffer, uploadImageUrl } from "@/lib/media/uploadService";
import { imageUrl, buildImageUrl, isAcceptedUploadType } from "@/lib/media/url";

describe("Media Service & URL Utilities", () => {
  it("recognizes accepted image upload types", () => {
    expect(isAcceptedUploadType("image/jpeg")).toBe(true);
    expect(isAcceptedUploadType("image/png")).toBe(true);
    expect(isAcceptedUploadType("image/webp")).toBe(true);
    expect(isAcceptedUploadType("image/avif")).toBe(true);
    expect(isAcceptedUploadType("image/svg+xml")).toBe(true);
    expect(isAcceptedUploadType("image/gif")).toBe(false);
  });

  it("constructs valid Cloudinary derivative URLs", () => {
    const url = buildImageUrl(
      { provider: "cloudinary", publicId: "products/test-ring-1" },
      { width: 480, height: 600, crop: "fill" },
    );
    expect(url).toContain("res.cloudinary.com");
    expect(url).toContain("w_480");
    expect(url).toContain("h_600");
    expect(url).toContain("products/test-ring-1");
  });

  it("handles relative and direct URLs gracefully in imageUrl helper", () => {
    expect(imageUrl("/images/products/rings-1.jpg", { width: 480 })).toBe(
      "/images/products/rings-1.jpg",
    );
    expect(
      imageUrl("https://example.com/custom.jpg", { width: 480 }),
    ).toBe("https://example.com/custom.jpg");
  });

  it("uploads image buffer and attaches to product", async () => {
    const dummy = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
    const result = await uploadImageBuffer(dummy, "test.png", {
      altText: "Test Ring View",
      role: "hero",
    });

    expect(result).toBeDefined();
    expect(result.mediaId).toBeDefined();
    expect(result.publicId).toBeDefined();
    expect(result.url).toContain("cloudinary.com");
    expect(result.format).toBe("png");
    expect(result.role).toBe("hero");
  });
});
