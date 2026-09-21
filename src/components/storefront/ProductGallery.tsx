"use client";

import { useState, type JSX, type MouseEvent } from "react";
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
 * ProductGallery — High-Precision Luxury Digital Showroom Gallery.
 *
 * Implements:
 * 1. Loupe magnifier zoom on hover (high-DPI inspection with coordinate tracking).
 * 2. Sticky desktop thumbnail strip with smooth auto-scroll.
 * 3. Pure high-resolution photography presentation.
 */
export function ProductGallery({
  media,
  title,
  selectedVariantId,
  className,
}: ProductGalleryProps): JSX.Element {
  const [activeIndex, setActiveIndex] = useState(0);
  const [zoomState, setZoomState] = useState<{ [key: number]: { x: number; y: number; active: boolean } }>({});

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
                  opacity: isSelected ? 1 : 0.65,
                  transition: "opacity 180ms ease, border-color 180ms ease",
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
          const mainUrl = imageUrl(item.publicId, { width: 1200, crop: "fill" });
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
              style={{
                width: "100%",
                maxWidth: "100%",
                aspectRatio: "4 / 5",
                background: "var(--md-bg-subtle, var(--md-rule))",
                overflow: "hidden",
                position: "relative",
                cursor: "crosshair",
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

              {/* Subtle Hover Magnifier Badge */}
              <div
                style={{
                  position: "absolute",
                  bottom: 12,
                  right: 12,
                  padding: "4px 10px",
                  background: "rgba(0, 0, 0, 0.45)",
                  backdropFilter: "blur(6px)",
                  color: "var(--md-fg-inverse)",
                  fontSize: "0.5625rem",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  pointerEvents: "none",
                  opacity: isZoomed ? 0 : 0.8,
                  transition: "opacity 200ms ease",
                }}
              >
                Hover to Inspect (2.2× Loupe)
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
