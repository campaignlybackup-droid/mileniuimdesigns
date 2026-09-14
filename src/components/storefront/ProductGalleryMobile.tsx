"use client";

import { useState, useRef, type JSX } from "react";
import { imageUrl } from "@/lib/media/url";
import { getProductFallbackImages } from "@/lib/media/categoryImages";
import type { PdpMediaItem } from "@/lib/catalog/products";

export type ProductGalleryMobileProps = {
  media: PdpMediaItem[];
  title: string;
  selectedVariantId?: string | null;
  className?: string;
};

export function ProductGalleryMobile({
  media,
  title,
  selectedVariantId,
  className,
}: ProductGalleryMobileProps): JSX.Element {
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

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

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollLeft, clientWidth } = scrollRef.current;
    const index = Math.round(scrollLeft / clientWidth);
    if (index !== activeIndex) {
      setActiveIndex(index);
    }
  };

  return (
    <div
      className={className}
      style={{
        position: "relative",
        width: "100%",
        maxWidth: "100%",
        overflow: "hidden",
      }}
    >
      {/* Scrollable image container */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        style={{
          display: "flex",
          overflowX: "auto",
          scrollSnapType: "x mandatory",
          scrollbarWidth: "none",
          msOverflowStyle: "none",
          width: "100%",
          aspectRatio: "4 / 5",
        }}
      >
        {items.map((item, idx) => {
          const imgUrl = imageUrl(item.publicId, { width: 768, crop: "fill" });
          return (
            <div
              key={item.id}
              style={{
                flex: "0 0 100%",
                width: "100%",
                height: "100%",
                scrollSnapAlign: "start",
                position: "relative",
                background: "var(--md-bg-subtle, var(--md-rule))",
              }}
            >
              {imgUrl && (
                <img
                  src={imgUrl}
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

      {/* Dot indicator */}
      {items.length > 1 && (
        <div
          style={{
            position: "absolute",
            bottom: "var(--md-space-3)",
            left: 0,
            right: 0,
            display: "flex",
            justifyContent: "center",
            gap: "var(--md-space-2)",
            zIndex: 2,
          }}
        >
          {items.map((_, idx) => (
            <span
              key={idx}
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: idx === activeIndex ? "var(--md-fg)" : "var(--md-rule)",
                opacity: idx === activeIndex ? 1 : 0.6,
                transition: "background var(--md-dur-fast) ease",
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
