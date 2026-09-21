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

      {/* Left & Right subtle navigation buttons on mobile */}
      {items.length > 1 && (
        <>
          <button
            type="button"
            onClick={() => {
              if (scrollRef.current) {
                const newIdx = Math.max(0, activeIndex - 1);
                scrollRef.current.scrollTo({
                  left: newIdx * scrollRef.current.clientWidth,
                  behavior: "smooth",
                });
              }
            }}
            aria-label="Previous product image"
            style={{
              position: "absolute",
              left: 8,
              top: "50%",
              transform: "translateY(-50%)",
              width: 40,
              height: 40,
              display: activeIndex > 0 ? "flex" : "none",
              alignItems: "center",
              justifyContent: "center",
              background: "color-mix(in srgb, var(--md-bg) 80%, transparent)",
              backdropFilter: "blur(6px)",
              border: "1px solid var(--md-rule)",
              borderRadius: "50%",
              color: "var(--md-fg)",
              cursor: "pointer",
              zIndex: 3,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>

          <button
            type="button"
            onClick={() => {
              if (scrollRef.current) {
                const newIdx = Math.min(items.length - 1, activeIndex + 1);
                scrollRef.current.scrollTo({
                  left: newIdx * scrollRef.current.clientWidth,
                  behavior: "smooth",
                });
              }
            }}
            aria-label="Next product image"
            style={{
              position: "absolute",
              right: 8,
              top: "50%",
              transform: "translateY(-50%)",
              width: 40,
              height: 40,
              display: activeIndex < items.length - 1 ? "flex" : "none",
              alignItems: "center",
              justifyContent: "center",
              background: "color-mix(in srgb, var(--md-bg) 80%, transparent)",
              backdropFilter: "blur(6px)",
              border: "1px solid var(--md-rule)",
              borderRadius: "50%",
              color: "var(--md-fg)",
              cursor: "pointer",
              zIndex: 3,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </>
      )}

      {/* Luxury Slide Pill Counter & Progress Indicator */}
      {items.length > 1 && (
        <>
          <div
            style={{
              position: "absolute",
              bottom: "var(--md-space-3)",
              right: "var(--md-space-3)",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 10px",
              background: "color-mix(in srgb, var(--md-charcoal) 75%, transparent)",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
              border: "1px solid color-mix(in srgb, var(--md-champagne) 25%, transparent)",
              borderRadius: "var(--md-radius-pill)",
              color: "var(--md-ivory-soft)",
              fontSize: "0.6875rem",
              fontWeight: 600,
              letterSpacing: "0.12em",
              zIndex: 2,
            }}
          >
            <span>{String(activeIndex + 1).padStart(2, "0")}</span>
            <span style={{ color: "var(--md-champagne)", opacity: 0.6 }}>/</span>
            <span style={{ opacity: 0.7 }}>{String(items.length).padStart(2, "0")}</span>
          </div>

          {/* Progress bar line at bottom */}
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: 2,
              background: "var(--md-rule)",
              zIndex: 2,
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${((activeIndex + 1) / items.length) * 100}%`,
                background: "var(--md-green)",
                transition: "width 280ms cubic-bezier(0.16, 1, 0.3, 1)",
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}
