import { mediaConfig } from "@/lib/config/env";
import { AppError } from "@/lib/errors";

/**
 * Image URL construction — 06 §7.
 *
 * NO URL IS EVER STORED. `media` holds a provider and a `public_id`; the URL is built
 * here, at render time. A stored URL bakes in a provider, a transformation and a CDN
 * host, and changing any of the three then means a data migration instead of a config
 * change (02 §2.8).
 */

/** The nine fixed derivative widths (06 §7). Fixed, not arbitrary: an open width
 *  parameter is an unbounded transformation surface someone else pays the CDN bill for. */
export const DERIVATIVE_WIDTHS = [320, 480, 640, 768, 1024, 1280, 1536, 1920, 2560] as const;
export type DerivativeWidth = (typeof DERIVATIVE_WIDTHS)[number];

/**
 * `INTERNAL`, not a validation error: reaching it means CODE forgot a width, not that a
 * customer typed something wrong. The shopper sees the generic message; the log carries
 * the detail. Extends the one base class (11 §2.1) — the fourth time this session that
 * the taxonomy guard caught a class of mine extending the built-in Error.
 */
export class UnsizedImageUrlError extends AppError {
  readonly code = "INTERNAL" as const;
  readonly httpStatus = 500;
  readonly copyKey = "copy.error.internal";
  constructor() {
    super(
      "Refused to build an image URL with no width. An unsized delivery URL serves the " +
        "original — which on a jewellery catalogue is a 10 MB master file on a phone " +
        "(06 §7, 09 P06 exit criterion (a)).",
    );
  }
}

export type ImageUrlOptions = {
  width: number;
  /** Omit to preserve the source aspect ratio. */
  height?: number;
  /** `fill` crops to the box; `fit` letterboxes inside it. */
  crop?: "fill" | "fit";
  quality?: number | "auto";
  /** `auto` lets the CDN negotiate AVIF/WebP per browser. */
  format?: "auto" | "webp" | "avif" | "jpg" | "png";
  /** Applies Cloudinary's `fl_sanitize`. Always true for vectors (06 §7.10 layer 4). */
  sanitize?: boolean;
};

/** Snap an arbitrary width up to the nearest fixed derivative. */
export function nearestWidth(requested: number): DerivativeWidth {
  for (const w of DERIVATIVE_WIDTHS) if (requested <= w) return w;
  return DERIVATIVE_WIDTHS[DERIVATIVE_WIDTHS.length - 1]!;
}

/**
 * Build a delivery URL.
 *
 * Throws rather than falling back when no width is supplied. A fallback to the original
 * is the failure mode this function exists to prevent, and it is invisible in review —
 * the image renders correctly and only the transfer size is wrong.
 */
export function buildImageUrl(
  input: { provider: string; publicId: string; version?: string | null },
  opts: ImageUrlOptions,
): string {
  if (!opts.width || !Number.isFinite(opts.width) || opts.width <= 0) {
    throw new UnsizedImageUrlError();
  }
  if (input.provider !== "cloudinary") {
    throw new Error(`Unknown media provider '${input.provider}'.`);
  }

  const cloud = cloudName();
  const w = nearestWidth(opts.width);

  const parts = [
    `w_${w}`,
    opts.height ? `h_${opts.height}` : null,
    `c_${opts.crop ?? "fill"}`,
    `q_${opts.quality ?? "auto"}`,
    `f_${opts.format ?? "auto"}`,
    // Applied on every SVG delivery URL. Layer 4 of the SVG defence: even a file that
    // somehow reached storage unsanitised is sanitised again on the way out (06 §7.10).
    opts.sanitize ? "fl_sanitize" : null,
  ].filter(Boolean);

  const version = input.version ? `v${input.version}/` : "";
  return `https://res.cloudinary.com/${cloud}/image/upload/${parts.join(",")}/${version}${input.publicId}`;
}

/** The `srcset` for a responsive image. Only the widths at or below `maxWidth`, so a
 *  thumbnail never offers a 2560px candidate. */
export function buildSrcSet(
  input: { provider: string; publicId: string; version?: string | null },
  opts: Omit<ImageUrlOptions, "width"> & { maxWidth?: number },
): string {
  const cap = opts.maxWidth ?? DERIVATIVE_WIDTHS[DERIVATIVE_WIDTHS.length - 1]!;
  return DERIVATIVE_WIDTHS.filter((w) => w <= cap)
    .map((w) => `${buildImageUrl(input, { ...opts, width: w })} ${w}w`)
    .join(", ");
}

function cloudName(): string {
  const name = mediaConfig().cloudName;
  if (!name) {
    // The caller should have checked integrationStatus() first. This message says which
    // check was skipped rather than failing with `undefined` in a URL.
    throw new Error(
      "CLOUDINARY_CLOUD_NAME is not set. Check integrationStatus().cloudinary before " +
        "building a media URL; the admin must show 'Media storage not configured' " +
        "rather than rendering a broken image (09 P06 exit criterion (c)).",
    );
  }
  return name;
}

/** Formats accepted for upload. A deliberately short list (06 §7). */
export const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg", "image/png", "image/webp", "image/avif",
] as const;
export const ACCEPTED_VECTOR_TYPES = ["image/svg+xml"] as const;
export const ACCEPTED_VIDEO_TYPES = ["video/mp4", "video/webm"] as const;
export const ACCEPTED_DOCUMENT_TYPES = ["application/pdf"] as const;

/**
 * GIF is rejected deliberately, and it is worth writing down why, because it looks
 * arbitrary: an animated GIF of a rotating ring is an order of magnitude larger than the
 * equivalent MP4 or WebM, cannot be transcoded to a modern format by the CDN, and is the
 * single most common way a "quick product video" becomes a 14 MB page weight. TIFF and
 * HEIC are rejected for a simpler reason — no browser renders them.
 */
export const REJECTED_TYPES = [
  "image/gif", "image/tiff", "image/heic", "image/heif", "image/bmp", "image/x-icon",
] as const;

export function isAcceptedUploadType(mime: string): boolean {
  return (
    (ACCEPTED_IMAGE_TYPES as readonly string[]).includes(mime) ||
    (ACCEPTED_VECTOR_TYPES as readonly string[]).includes(mime) ||
    (ACCEPTED_VIDEO_TYPES as readonly string[]).includes(mime) ||
    (ACCEPTED_DOCUMENT_TYPES as readonly string[]).includes(mime)
  );
}

export function mediaKindForMime(mime: string): "image" | "video" | "document" | "vector" | null {
  if ((ACCEPTED_VECTOR_TYPES as readonly string[]).includes(mime)) return "vector";
  if ((ACCEPTED_IMAGE_TYPES as readonly string[]).includes(mime)) return "image";
  if ((ACCEPTED_VIDEO_TYPES as readonly string[]).includes(mime)) return "video";
  if ((ACCEPTED_DOCUMENT_TYPES as readonly string[]).includes(mime)) return "document";
  return null;
}
