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
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
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
    if (clientWidth === 0) return;
    const index = Math.round(scrollLeft / clientWidth);
    if (index !== activeIndex && index >= 0 && index < items.length) {
      setActiveIndex(index);
    }
  };

  const scrollToSlide = (index: number) => {
    setActiveIndex(index);
    if (scrollRef.current) {
      const targetLeft = index * scrollRef.current.clientWidth;
      scrollRef.current.scrollTo({ left: targetLeft, behavior: "smooth" });
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
          borderRadius: "var(--md-radius-sm, 2px)",
          background: "var(--md-bg-subtle, var(--md-rule))",
        }}
      >
        {items.map((item, idx) => {
          const fallbacks = getProductFallbackImages(title);
          const fallbackImg = idx % 2 === 0 ? fallbacks.primary : fallbacks.alternate;
          const imgUrl = imageUrl(item.publicId, { width: 768, crop: "fill" }) ?? fallbackImg;
          return (
            <div
              key={item.id}
              onClick={() => setLightboxIndex(idx)}
              style={{
                flex: "0 0 100%",
                width: "100%",
                height: "100%",
                scrollSnapAlign: "start",
                position: "relative",
                cursor: "zoom-in",
              }}
            >
              <img
                src={imgUrl}
                alt={item.altText ?? `${title} - Angle ${idx + 1}`}
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

      {/* Angle indicator badge (top-left) */}
      <div
        style={{
          position: "absolute",
          top: "12px",
          left: "12px",
          background: "rgba(0, 0, 0, 0.5)",
          backdropFilter: "blur(4px)",
          color: "var(--md-fg-inverse, #ffffff)",
          padding: "2px 8px",
          borderRadius: "2px",
          fontSize: "0.625rem",
          fontWeight: 600,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          pointerEvents: "none",
          zIndex: 3,
        }}
      >
        Angle {String.fromCharCode(65 + activeIndex)}
      </div>

      {/* Photo counter pill (e.g. 1 / 3) in bottom-right corner */}
      {items.length > 1 && (
        <div
          style={{
            position: "absolute",
            bottom: "12px",
            right: "12px",
            background: "rgba(6, 19, 13, 0.72)",
            backdropFilter: "blur(4px)",
            WebkitBackdropFilter: "blur(4px)",
            color: "var(--md-ivory-soft, #ffffff)",
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
          {activeIndex + 1} / {items.length} · Tap to zoom
        </div>
      )}

      {/* Minimal progress bar at bottom of image */}
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

      {/* Mobile Thumbnail Selector Strip below main image */}
      {items.length > 1 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            paddingTop: "10px",
            overflowX: "auto",
            scrollbarWidth: "none",
          }}
        >
          {items.map((item, idx) => {
            const isCur = activeIndex === idx;
            const thumbUrl =
              imageUrl(item.publicId, { width: 120, height: 150, crop: "fill" }) ??
              getProductFallbackImages(title).primary;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => scrollToSlide(idx)}
                aria-label={`View angle ${String.fromCharCode(65 + idx)}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "4px 8px",
                  background: isCur ? "var(--md-bg-subtle, #f0f0f0)" : "transparent",
                  border: `1px solid ${isCur ? "var(--md-fg)" : "var(--md-rule)"}`,
                  borderRadius: "2px",
                  cursor: "pointer",
                  flexShrink: 0,
                  opacity: isCur ? 1 : 0.65,
                  transition: "opacity 150ms ease, border-color 150ms ease",
                }}
              >
                <img
                  src={thumbUrl}
                  alt=""
                  style={{ width: 24, height: 30, objectFit: "cover", borderRadius: "1px" }}
                />
                <span
                  style={{
                    fontSize: "0.6875rem",
                    fontWeight: isCur ? 600 : 400,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "var(--md-fg)",
                  }}
                >
                  Angle {String.fromCharCode(65 + idx)}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Fullscreen Mobile Lightbox */}
      {lightboxIndex !== null && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setLightboxIndex(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(4, 15, 10, 0.96)",
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "16px",
            boxSizing: "border-box",
          }}
        >
          {/* Header */}
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              color: "#ffffff",
              paddingBottom: "8px",
            }}
          >
            <div>
              <span
                style={{
                  fontSize: "0.625rem",
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "rgba(255, 255, 255, 0.6)",
                }}
              >
                Jaipur Fine Jewellery
              </span>
              <h3
                style={{
                  margin: "2px 0 0 0",
                  fontFamily: "var(--md-font-display)",
                  fontSize: "0.9375rem",
                  fontWeight: 400,
                  color: "#ffffff",
                }}
              >
                {title} · Angle {String.fromCharCode(65 + lightboxIndex)}
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setLightboxIndex(null)}
              aria-label="Close fullscreen view"
              style={{
                background: "rgba(255, 255, 255, 0.15)",
                border: "none",
                color: "#ffffff",
                borderRadius: "50%",
                width: 36,
                height: 36,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "1.2rem",
                cursor: "pointer",
              }}
            >
              ✕
            </button>
          </div>

          {/* Image */}
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
            }}
          >
            <img
              src={
                imageUrl(items[lightboxIndex].publicId, { width: 1200, crop: "fill" }) ??
                getProductFallbackImages(title).primary
              }
              alt=""
              style={{
                maxWidth: "100%",
                maxHeight: "80vh",
                objectFit: "contain",
                borderRadius: "2px",
              }}
            />
          </div>

          {/* Bottom Thumbnails Strip */}
          {items.length > 1 && (
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                display: "flex",
                justifyContent: "center",
                gap: "8px",
                paddingTop: "12px",
              }}
            >
              {items.map((it, idx) => {
                const isCur = lightboxIndex === idx;
                const thumb =
                  imageUrl(it.publicId, { width: 120, height: 150, crop: "fill" }) ??
                  getProductFallbackImages(title).primary;
                return (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => setLightboxIndex(idx)}
                    style={{
                      width: 44,
                      aspectRatio: "4 / 5",
                      padding: 0,
                      border: `2px solid ${isCur ? "#d4af37" : "rgba(255, 255, 255, 0.3)"}`,
                      background: "transparent",
                      borderRadius: "2px",
                      overflow: "hidden",
                      opacity: isCur ? 1 : 0.5,
                      cursor: "pointer",
                    }}
                  >
                    <img
                      src={thumb}
                      alt=""
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

