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
          const fallbacks = getProductFallbackImages(title);
          const fallbackImg = idx % 2 === 0 ? fallbacks.primary : fallbacks.alternate;
          const imgUrl = imageUrl(item.publicId, { width: 768, crop: "fill" }) ?? fallbackImg;
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
            </div>
          );
        })}
      </div>

      {/* Photo counter pill (e.g. 1 / 4) in bottom-right corner */}
      {items.length > 1 && (
        <div
          style={{
            position: "absolute",
            bottom: "12px",
            right: "12px",
            background: "rgba(6, 19, 13, 0.72)",
            backdropFilter: "blur(4px)",
            WebkitBackdropFilter: "blur(4px)",
            color: "var(--md-ivory-soft)",
            padding: "3px 9px",
            borderRadius: "999px",
            fontSize: "0.6875rem",
            fontWeight: 600,
            letterSpacing: "0.08em",
            zIndex: 3,
            pointerEvents: "none",
            boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
          }}
        >
          {activeIndex + 1} / {items.length}
        </div>
      )}

      {/* Minimal progress bar at bottom */}
      {items.length > 1 && (
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
      )}
    </div>
  );
}
