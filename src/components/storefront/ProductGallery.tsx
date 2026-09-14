"use client";

import { useState, type JSX } from "react";
import { imageUrl } from "@/lib/media/url";
import { getProductFallbackImages } from "@/lib/media/categoryImages";
import type { PdpMediaItem } from "@/lib/catalog/products";

export type ProductGalleryProps = {
  media: PdpMediaItem[];
  title: string;
  selectedVariantId?: string | null;
  className?: string;
};

/**
 * ProductGallery — 10 §5.3.
 *
 * Desktop: Vertical stack of large images that scroll naturally, with a sticky thumbnail rail.
 * Mobile: Full-bleed / horizontal swipeable gallery with dot indicator.
 */
export function ProductGallery({
  media,
  title,
  selectedVariantId,
  className,
}: ProductGalleryProps): JSX.Element {
  const [activeIndex, setActiveIndex] = useState(0);

  // Filter or sort media by selected variant if variant-specific media exists
  const fallbackMedia: PdpMediaItem[] = [
    {
      id: "fallback-1",
      mediaId: "fallback-media-1",
      publicId: getProductFallbackImages(title).primary,
      format: "jpg",
      width: 800,
      height: 1000,
      role: "hero",
      altText: title,
      position: 0,
      variantId: null,
    },
    {
      id: "fallback-2",
      mediaId: "fallback-media-2",
      publicId: getProductFallbackImages(title).alternate,
      format: "jpg",
      width: 800,
      height: 1000,
      role: "gallery",
      altText: `${title} alternate view`,
      position: 1,
      variantId: null,
    },
  ];
  const sourceMedia = media.length > 0 ? media : fallbackMedia;
  const displayMedia = sourceMedia.filter((m) => !m.variantId || m.variantId === selectedVariantId);
  const items = displayMedia.length > 0 ? displayMedia : sourceMedia;

  const scrollToImage = (index: number) => {
    setActiveIndex(index);
    const element = document.getElementById(`pdp-image-${index}`);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  };

  return (
    <div
      className={`md-product-gallery ${className ?? ""}`}
      style={{
        display: "flex",
        gap: "var(--md-space-4)",
        width: "100%",
        maxWidth: "100%",
        position: "relative",
      }}
    >
      {/* Thumbnail rail (Desktop) */}
      {items.length > 1 && (
        <div
          className="md-gallery-thumbs"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--md-space-2)",
            position: "sticky",
            top: "var(--md-space-8, 32px)",
            alignSelf: "flex-start",
            maxHeight: "80vh",
            overflowY: "auto",
          }}
        >
          {items.map((item, idx) => {
            const thumbUrl = imageUrl(item.publicId, { width: 320, height: 400, crop: "fill" });
            const isSelected = idx === activeIndex;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => scrollToImage(idx)}
                aria-label={`View image ${idx + 1}`}
                style={{
                  width: 64,
                  aspectRatio: "4 / 5",
                  padding: 0,
                  border: `1px solid ${isSelected ? "var(--md-fg)" : "transparent"}`,
                  background: "var(--md-bg-subtle, var(--md-rule))",
                  cursor: "pointer",
                  overflow: "hidden",
                  opacity: isSelected ? 1 : 0.7,
                  transition: "opacity var(--md-dur-fast) ease, border-color var(--md-dur-fast) ease",
                }}
              >
                {thumbUrl && (
                  <img
                    src={thumbUrl}
                    alt=""
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Main image vertical stack */}
      <div
        className="md-gallery-main"
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: "var(--md-space-4)",
          width: "100%",
          maxWidth: "100%",
        }}
      >
        {items.map((item, idx) => {
          const mainUrl = imageUrl(item.publicId, { width: 1024, crop: "fill" });
          return (
            <div
              key={item.id}
              id={`pdp-image-${idx}`}
              style={{
                width: "100%",
                maxWidth: "100%",
                aspectRatio: "4 / 5",
                background: "var(--md-bg-subtle, var(--md-rule))",
                overflow: "hidden",
                position: "relative",
              }}
            >
              {mainUrl && (
                <img
                  src={mainUrl}
                  alt={item.altText ?? `${title} - Image ${idx + 1}`}
                  loading={idx === 0 ? "eager" : "lazy"}
                  decoding="async"
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    display: "block",
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
