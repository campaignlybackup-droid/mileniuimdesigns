"use client";

import { useState, useEffect, useCallback, type JSX, type MouseEvent } from "react";
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
 * ProductGallery — World-Class High-Jewellery Digital Exhibition Gallery.
 *
 * Implements:
 * 1. Precision 2.4× Loupe Magnifier inspection on cursor hover.
 * 2. High-Resolution Full-Screen Lightbox Modal with keyboard (Esc, Arrows) navigation.
 * 3. Sticky desktop thumbnail strip with instant scroll synchronization.
 * 4. Angle indicators (Angle A, B, C) and direct expansion.
 */
export function ProductGallery({
  media,
  title,
  selectedVariantId,
  className,
}: ProductGalleryProps): JSX.Element {
  const [activeIndex, setActiveIndex] = useState(0);
  const [zoomState, setZoomState] = useState<{ [key: number]: { x: number; y: number; active: boolean } }>({});
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

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

  const handleMouseMove = (idx: number, e: MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setZoomState((prev) => ({
      ...prev,
      [idx]: { x, y, active: true },
    }));
  };

  const handleMouseLeave = (idx: number) => {
    setZoomState((prev) => ({
      ...prev,
      [idx]: { x: 50, y: 50, active: false },
    }));
  };

  const openLightbox = (idx: number) => {
    setLightboxIndex(idx);
  };

  const closeLightbox = useCallback(() => {
    setLightboxIndex(null);
  }, []);

  const nextLightboxImage = useCallback(() => {
    setLightboxIndex((curr) => (curr !== null ? (curr + 1) % items.length : null));
  }, [items.length]);

  const prevLightboxImage = useCallback(() => {
    setLightboxIndex((curr) =>
      curr !== null ? (curr - 1 + items.length) % items.length : null,
    );
  }, [items.length]);

  // Keyboard navigation for lightbox
  useEffect(() => {
    if (lightboxIndex === null) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeLightbox();
      else if (e.key === "ArrowRight") nextLightboxImage();
      else if (e.key === "ArrowLeft") prevLightboxImage();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lightboxIndex, closeLightbox, nextLightboxImage, prevLightboxImage]);

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
            const fallbacks = getProductFallbackImages(title);
            const fallbackImg = idx % 2 === 0 ? fallbacks.primary : fallbacks.alternate;
            const thumbUrl =
              imageUrl(item.publicId, { width: 160, height: 200, crop: "fill" }) ?? fallbackImg;
            const isSelected = activeIndex === idx;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => scrollToImage(idx)}
                aria-label={`View angle ${idx + 1}`}
                style={{
                  width: 68,
                  aspectRatio: "4 / 5",
                  padding: 0,
                  border: `1px solid ${isSelected ? "var(--md-fg)" : "var(--md-rule)"}`,
                  background: "var(--md-bg-subtle, var(--md-rule))",
                  cursor: "pointer",
                  overflow: "hidden",
                  opacity: isSelected ? 1 : 0.6,
                  transition: "opacity 180ms ease, border-color 180ms ease, transform 180ms ease",
                  transform: isSelected ? "scale(1.02)" : "scale(1)",
                  borderRadius: "var(--md-radius-sm, 2px)",
                }}
              >
                <img
                  src={thumbUrl}
                  alt={`Thumbnail ${idx + 1}`}
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                />
              </button>
            );
          })}
        </div>
      )}

      {/* Main Exhibition Container */}
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
          const fallbacks = getProductFallbackImages(title);
          const fallbackImg = idx % 2 === 0 ? fallbacks.primary : fallbacks.alternate;
          const mainUrl = imageUrl(item.publicId, { width: 1200, crop: "fill" }) ?? fallbackImg;
          const zoom = zoomState[idx];
          const isZoomed = zoom?.active ?? false;
          const originX = zoom ? `${zoom.x}%` : "50%";
          const originY = zoom ? `${zoom.y}%` : "50%";

          return (
            <div
              key={item.id}
              id={`pdp-image-${idx}`}
              onMouseMove={(e) => handleMouseMove(idx, e)}
              onMouseLeave={() => handleMouseLeave(idx)}
              onClick={() => openLightbox(idx)}
              style={{
                width: "100%",
                maxWidth: "100%",
                aspectRatio: "4 / 5",
                background: "var(--md-bg-subtle, var(--md-rule))",
                overflow: "hidden",
                position: "relative",
                cursor: "zoom-in",
                borderRadius: "var(--md-radius-sm, 2px)",
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
                    transformOrigin: `${originX} ${originY}`,
                    transform: isZoomed ? "scale(2.2)" : "scale(1)",
                    transition: isZoomed ? "transform 100ms ease-out" : "transform 350ms ease-out",
                  }}
                />
              )}

              {/* Action Badges: Loupe and Fullscreen */}
              <div
                style={{
                  position: "absolute",
                  bottom: 14,
                  right: 14,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  pointerEvents: "none",
                }}
              >
                <div
                  style={{
                    padding: "4px 10px",
                    background: "rgba(0, 0, 0, 0.55)",
                    backdropFilter: "blur(8px)",
                    color: "var(--md-fg-inverse, #ffffff)",
                    fontSize: "0.625rem",
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    fontWeight: 500,
                    opacity: isZoomed ? 0 : 0.85,
                    transition: "opacity 200ms ease",
                    borderRadius: "2px",
                  }}
                >
                  Click to Expand · 2.2× Loupe
                </div>
              </div>

              {/* Angle Indicator Pill */}
              <div
                style={{
                  position: "absolute",
                  top: 14,
                  left: 14,
                  padding: "3px 8px",
                  background: "rgba(0, 0, 0, 0.45)",
                  backdropFilter: "blur(6px)",
                  color: "var(--md-fg-inverse, #ffffff)",
                  fontSize: "0.5625rem",
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  fontWeight: 600,
                  borderRadius: "2px",
                }}
              >
                Angle {String.fromCharCode(65 + idx)}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── World-Class Fullscreen Lightbox Modal ── */}
      {lightboxIndex !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${title} - Angle ${lightboxIndex + 1}`}
          onClick={closeLightbox}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(4, 15, 10, 0.94)",
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "clamp(16px, 3vw, 32px)",
            boxSizing: "border-box",
            cursor: "zoom-out",
          }}
        >
          {/* Top Bar with Title and Close Button */}
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: "1280px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              color: "#ffffff",
              paddingBottom: "12px",
              cursor: "default",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: "0.6875rem",
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "rgba(255, 255, 255, 0.65)",
                }}
              >
                Jaipur Fine Jewellery Atelier
              </div>
              <h2
                style={{
                  margin: "2px 0 0 0",
                  fontFamily: "var(--md-font-display)",
                  fontSize: "1.125rem",
                  fontWeight: 400,
                  color: "#ffffff",
                }}
              >
                {title} · Angle {String.fromCharCode(65 + lightboxIndex)}
              </h2>
            </div>

            <button
              type="button"
              onClick={closeLightbox}
              aria-label="Close fullscreen view"
              style={{
                background: "rgba(255, 255, 255, 0.12)",
                border: "1px solid rgba(255, 255, 255, 0.2)",
                color: "#ffffff",
                borderRadius: "50%",
                width: 40,
                height: 40,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                fontSize: "1.25rem",
                transition: "background 150ms ease, transform 150ms ease",
              }}
            >
              ✕
            </button>
          </div>

          {/* Central High-Res Master Image */}
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "relative",
              flex: 1,
              width: "100%",
              maxWidth: "1080px",
              maxHeight: "78vh",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "default",
            }}
          >
            {/* Prev Button */}
            {items.length > 1 && (
              <button
                type="button"
                onClick={prevLightboxImage}
                aria-label="Previous angle"
                style={{
                  position: "absolute",
                  left: 12,
                  zIndex: 5,
                  background: "rgba(0, 0, 0, 0.6)",
                  border: "1px solid rgba(255, 255, 255, 0.2)",
                  color: "#ffffff",
                  borderRadius: "50%",
                  width: 44,
                  height: 44,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  fontSize: "1.5rem",
                }}
              >
                ‹
              </button>
            )}

            {/* Next Button */}
            {items.length > 1 && (
              <button
                type="button"
                onClick={nextLightboxImage}
                aria-label="Next angle"
                style={{
                  position: "absolute",
                  right: 12,
                  zIndex: 5,
                  background: "rgba(0, 0, 0, 0.6)",
                  border: "1px solid rgba(255, 255, 255, 0.2)",
                  color: "#ffffff",
                  borderRadius: "50%",
                  width: 44,
                  height: 44,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  fontSize: "1.5rem",
                }}
              >
                ›
              </button>
            )}

            {/* High-Res Image (1536px delivery) */}
            <img
              src={
                imageUrl(items[lightboxIndex].publicId, { width: 1536, crop: "fill" }) ??
                getProductFallbackImages(title).primary
              }
              alt={`${title} - Angle ${lightboxIndex + 1}`}
              style={{
                maxWidth: "100%",
                maxHeight: "100%",
                objectFit: "contain",
                borderRadius: "2px",
                boxShadow: "0 20px 60px rgba(0, 0, 0, 0.6)",
              }}
            />
          </div>

          {/* Bottom Thumbnails Strip in Lightbox */}
          {items.length > 1 && (
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                display: "flex",
                gap: "10px",
                paddingTop: "14px",
                cursor: "default",
              }}
            >
              {items.map((it, idx) => {
                const isCur = lightboxIndex === idx;
                const thumb =
                  imageUrl(it.publicId, { width: 160, height: 200, crop: "fill" }) ??
                  getProductFallbackImages(title).primary;
                return (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => setLightboxIndex(idx)}
                    style={{
                      width: 52,
                      aspectRatio: "4 / 5",
                      padding: 0,
                      border: `2px solid ${isCur ? "#d4af37" : "rgba(255, 255, 255, 0.3)"}`,
                      background: "transparent",
                      cursor: "pointer",
                      opacity: isCur ? 1 : 0.5,
                      borderRadius: "2px",
                      overflow: "hidden",
                      transition: "opacity 150ms ease, border-color 150ms ease",
                    }}
                  >
                    <img
                      src={thumb}
                      alt=""
                      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
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

