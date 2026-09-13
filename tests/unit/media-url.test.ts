import { beforeAll, describe, expect, it } from "vitest";
import {
  buildImageUrl,
  buildSrcSet,
  DERIVATIVE_WIDTHS,
  isAcceptedUploadType,
  mediaKindForMime,
  nearestWidth,
  REJECTED_TYPES,
  UnsizedImageUrlError,
} from "@/lib/media/url";

/** Commissioned by 09 P06 exit criteria (a) and (b). */
beforeAll(() => {
  process.env["CLOUDINARY_CLOUD_NAME"] = "millennium-test";
});

const asset = { provider: "cloudinary", publicId: "md/rings/labradorite-01", version: "1712" };

describe("buildImageUrl", () => {
  it("CANNOT emit a URL without a width", () => {
    // 09 P06 criterion (a). An unsized delivery URL serves the original — a 10 MB master
    // file on a phone — and it renders correctly, so only the transfer size is wrong.
    // Falling back would be invisible in review; throwing is not.
    expect(() => buildImageUrl(asset, { width: 0 })).toThrow(UnsizedImageUrlError);
    expect(() => buildImageUrl(asset, { width: NaN })).toThrow(UnsizedImageUrlError);
    expect(() => buildImageUrl(asset, { width: -100 })).toThrow(UnsizedImageUrlError);
    // @ts-expect-error — the runtime guard must hold even when a caller defeats the type
    expect(() => buildImageUrl(asset, {})).toThrow(UnsizedImageUrlError);
  });

  it("always includes w_<digits>", () => {
    for (const w of DERIVATIVE_WIDTHS) {
      expect(buildImageUrl(asset, { width: w })).toMatch(/\/w_\d+[,/]/);
    }
  });

  it("snaps an arbitrary width UP to a fixed derivative", () => {
    // Fixed widths, not arbitrary ones: an open width parameter is an unbounded
    // transformation surface someone else pays the CDN bill for.
    expect(nearestWidth(1)).toBe(320);
    expect(nearestWidth(500)).toBe(640);
    expect(nearestWidth(1280)).toBe(1280);
    expect(nearestWidth(99_999)).toBe(2560);
    expect(buildImageUrl(asset, { width: 500 })).toContain("w_640");
  });

  it("negotiates format and quality by default", () => {
    const url = buildImageUrl(asset, { width: 640 });
    expect(url).toContain("f_auto");
    expect(url).toContain("q_auto");
  });

  it("applies fl_sanitize when asked — layer 4 of the SVG defence", () => {
    expect(buildImageUrl(asset, { width: 640, sanitize: true })).toContain("fl_sanitize");
    expect(buildImageUrl(asset, { width: 640 })).not.toContain("fl_sanitize");
  });

  it("includes the version so a replaced asset busts its cache", () => {
    expect(buildImageUrl(asset, { width: 640 })).toContain("/v1712/");
  });

  it("refuses an unknown provider rather than guessing a URL shape", () => {
    expect(() => buildImageUrl({ ...asset, provider: "imgix" }, { width: 640 })).toThrow(
      /Unknown media provider/,
    );
  });

  it("builds a srcset capped at the layout's largest need", () => {
    const set = buildSrcSet(asset, { maxWidth: 768 });
    expect(set).toContain("320w");
    expect(set).toContain("768w");
    // A thumbnail must not offer a 2560px candidate — the browser may well take it.
    expect(set).not.toContain("2560w");
  });
});

describe("accepted upload types", () => {
  it("rejects GIF before a signature is ever issued", () => {
    // 09 P06 criterion (b). An animated GIF of a rotating ring is an order of magnitude
    // larger than the equivalent MP4, cannot be transcoded by the CDN, and is the most
    // common way a "quick product video" becomes a 14 MB page.
    expect(isAcceptedUploadType("image/gif")).toBe(false);
    expect(mediaKindForMime("image/gif")).toBeNull();
  });

  it("rejects formats no browser renders", () => {
    for (const t of REJECTED_TYPES) {
      expect(isAcceptedUploadType(t), t).toBe(false);
    }
  });

  it("accepts the short list, and classifies each correctly", () => {
    expect(mediaKindForMime("image/jpeg")).toBe("image");
    expect(mediaKindForMime("image/avif")).toBe("image");
    expect(mediaKindForMime("image/svg+xml")).toBe("vector");
    expect(mediaKindForMime("video/mp4")).toBe("video");
    expect(mediaKindForMime("application/pdf")).toBe("document");
  });

  it("rejects a MIME type it has never heard of", () => {
    expect(isAcceptedUploadType("application/x-msdownload")).toBe(false);
    expect(isAcceptedUploadType("text/html")).toBe(false);
  });
});
