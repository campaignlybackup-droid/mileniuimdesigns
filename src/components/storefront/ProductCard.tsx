"use client";

import React, { useState, useRef, type JSX } from "react";
import Link from "next/link";
import { imageUrl } from "@/lib/media/url";
import { PriceDisplay } from "@/components/storefront/PriceDisplay";
import { WishlistButton } from "@/components/storefront/WishlistButton";
import type { StorefrontCard } from "@/lib/catalog/products";
import { getProductFallbackImages } from "@/lib/media/categoryImages";

export type ProductCardProps = {
  product: StorefrontCard;
  marketSegment?: string;
  locale?: string;
  priority?: boolean;
};

/**
 * ProductCard — Timeless High-Jewellery Showcase Card.
 *
 * Implements interactive touch/tap product image slider, strictly uniform dimensions
 * across all cards, and crisp typographic hierarchy.
 */
export function ProductCard({
  product,
  marketSegment = "",
  locale = "en-US",
  priority = false,
}: ProductCardProps): JSX.Element {
  const prefix = marketSegment === "" ? "" : `/${marketSegment}`;
  const href = `${prefix}/products/${product.slug}`;

  const fallbacks = getProductFallbackImages(product.id, product.slug);

  const primaryUrl = product.primaryImage
    ? imageUrl(product.primaryImage.publicId, { width: 480, height: 600, crop: "fill" })
    : null;

  const alternateUrl = product.alternateImage
    ? imageUrl(product.alternateImage.publicId, { width: 480, height: 600, crop: "fill" })
    : null;

  const primarySrc = primaryUrl ?? fallbacks.primary;
  // If alternateUrl is not provided in DB, provide the alternate catalog view
  const alternateSrc =
    alternateUrl ??
    (fallbacks.alternate !== primarySrc ? fallbacks.alternate : null);

  // Collect available images for the interactive slider (guaranteed 2 angles for interactive sliding)
  const images = Array.from(new Set([primarySrc, alternateSrc].filter(Boolean) as string[]));
  const [currentIdx, setCurrentIdx] = useState(0);

  // Touch Swipe tracking for smartphone image sliding
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const isSwiping = useRef<boolean>(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    isSwiping.current = false;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const diffX = touchStartX.current - e.touches[0].clientX;
    const diffY = touchStartY.current - e.touches[0].clientY;

    if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 8) {
      isSwiping.current = true;
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || images.length <= 1) return;
    const diffX = touchStartX.current - e.changedTouches[0].clientX;
    const threshold = 30; // px threshold for swipe

    if (diffX > threshold) {
      // Swiped left -> next image
      setCurrentIdx((prev) => (prev + 1) % images.length);
    } else if (diffX < -threshold) {
      // Swiped right -> prev image
      setCurrentIdx((prev) => (prev - 1 + images.length) % images.length);
    }

    touchStartX.current = null;
    touchStartY.current = null;
  };

  const handlePrevImage = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCurrentIdx((prev) => (prev - 1 + images.length) % images.length);
  };

  const handleNextImage = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCurrentIdx((prev) => (prev + 1) % images.length);
  };

  const handleDotClick = (e: React.MouseEvent, idx: number) => {
    e.preventDefault();
    e.stopPropagation();
    setCurrentIdx(idx);
  };

  const stoneOrMaterial = [product.stonesText, product.materialsText]
    .filter(Boolean)
    .join(" · ");

  const isSold = Boolean(product.soldAt);

  return (
    <div
      className="md-product-card"
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        height: "100%",
        width: "100%",
        boxSizing: "border-box",
        opacity: isSold ? 0.75 : 1,
      }}
    >
      {/* 4:5 Media container with interactive image slider */}
      <div
        style={{
          position: "relative",
          width: "100%",
          aspectRatio: "4 / 5",
          background: "var(--md-bg-raised)",
          overflow: "hidden",
          borderRadius: "var(--md-radius-sm, 2px)",
          flexShrink: 0,
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <Link
          href={href}
          style={{
            position: "absolute",
            inset: 0,
            display: "block",
            textDecoration: "none",
            zIndex: 1,
          }}
          onClick={(e) => {
            if (isSwiping.current) {
              e.preventDefault();
            }
          }}
          aria-label={product.title}
        >
          {/* Smooth Sliding Image Track */}
          <div
            style={{
              width: `${images.length * 100}%`,
              height: "100%",
              display: "flex",
              transform: `translateX(-${(currentIdx * 100) / images.length}%)`,
              transition: "transform 320ms cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          >
            {images.map((src, idx) => (
              <div
                key={idx}
                style={{
                  width: `${100 / images.length}%`,
                  height: "100%",
                  position: "relative",
                  flexShrink: 0,
                }}
              >
                <img
                  src={src}
                  alt={idx === 0 ? product.primaryImage?.altText ?? product.title : `${product.title} alternate view`}
                  loading={priority && idx === 0 ? "eager" : "lazy"}
                  decoding="async"
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    display: "block",
                  }}
                />
              </div>
            ))}
          </div>

          {/* Archived Piece Hallmark Badge */}
          {isSold && (
            <div
              style={{
                position: "absolute",
                bottom: "var(--md-space-2)",
                left: "var(--md-space-2)",
                background: "color-mix(in srgb, var(--md-green-black) 92%, transparent)",
                padding: "3px 8px",
                fontSize: "0.5625rem",
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "var(--md-sold, var(--md-champagne))",
                zIndex: 3,
                backdropFilter: "blur(4px)",
              }}
            >
              Private Archive
            </div>
          )}
        </Link>

        {/* Wishlist Button */}
        <div
          style={{
            position: "absolute",
            top: "var(--md-space-2)",
            right: "var(--md-space-2)",
            zIndex: 4,
          }}
        >
          <WishlistButton productId={product.id} />
        </div>

        {/* Left & Right Subtle Slider Arrows (when images.length > 1) */}
        {images.length > 1 && (
          <>
            <button
              type="button"
              onClick={handlePrevImage}
              aria-label="Previous image"
              style={{
                position: "absolute",
                left: 6,
                top: "50%",
                transform: "translateY(-50%)",
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: "color-mix(in srgb, var(--md-bg) 92%, transparent)",
                border: "1px solid var(--md-rule)",
                backdropFilter: "blur(6px)",
                color: "var(--md-fg)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                zIndex: 4,
                padding: 0,
                opacity: currentIdx === 0 ? 0.35 : 0.95,
                transition: "opacity 180ms ease",
                touchAction: "manipulation",
                boxShadow: "0 2px 6px rgba(0, 0, 0, 0.12)",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>

            <button
              type="button"
              onClick={handleNextImage}
              aria-label="Next image"
              style={{
                position: "absolute",
                right: 6,
                top: "50%",
                transform: "translateY(-50%)",
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: "color-mix(in srgb, var(--md-bg) 92%, transparent)",
                border: "1px solid var(--md-rule)",
                backdropFilter: "blur(6px)",
                color: "var(--md-fg)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                zIndex: 4,
                padding: 0,
                opacity: currentIdx === images.length - 1 ? 0.35 : 0.95,
                transition: "opacity 180ms ease",
                touchAction: "manipulation",
                boxShadow: "0 2px 6px rgba(0, 0, 0, 0.12)",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>

            {/* Slider Dots Indicator */}
            <div
              style={{
                position: "absolute",
                bottom: 8,
                left: "50%",
                transform: "translateX(-50%)",
                display: "flex",
                alignItems: "center",
                gap: 5,
                zIndex: 4,
                pointerEvents: "auto",
                background: "rgba(0, 0, 0, 0.4)",
                padding: "3px 8px",
                borderRadius: "var(--md-radius-pill)",
                backdropFilter: "blur(4px)",
              }}
            >
              {images.map((_, dotIdx) => (
                <button
                  key={dotIdx}
                  type="button"
                  onClick={(e) => handleDotClick(e, dotIdx)}
                  aria-label={`View image ${dotIdx + 1}`}
                  style={{
                    width: dotIdx === currentIdx ? 12 : 5,
                    height: 5,
                    borderRadius: "var(--md-radius-pill)",
                    background: dotIdx === currentIdx ? "var(--md-champagne)" : "rgba(255, 255, 255, 0.5)",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                    transition: "all 200ms ease",
                  }}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Typographic Details below image — 100% UNIFORM PROPORTIONS */}
      <div
        style={{
          paddingTop: "clamp(8px, 1.8vw, 14px)",
          display: "flex",
          flexDirection: "column",
          flexGrow: 1,
          justifyContent: "space-between",
          boxSizing: "border-box",
        }}
      >
        <div>
          {/* Material/Stone line: exact uniform height of 1.25rem */}
          <div
            style={{
              fontSize: "clamp(0.5625rem, 1.6vw, 0.6875rem)",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--md-fg-secondary)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              height: "1.25rem",
              lineHeight: "1.25rem",
              marginBottom: 2,
            }}
          >
            {stoneOrMaterial || "\u00A0"}
          </div>

          {/* Title line: exact uniform 2-line clamp height of 2.7em */}
          <h3
            style={{
              margin: 0,
              fontFamily: "var(--md-font-display)",
              fontSize: "clamp(0.8125rem, 2.2vw, 0.9375rem)",
              fontWeight: 400,
              lineHeight: 1.35,
              height: "2.7em",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              letterSpacing: "-0.01em",
            }}
          >
            <Link
              href={href}
              className="md-title-clamp"
              style={{
                color: "var(--md-fg)",
                textDecoration: "none",
                transition: "color 180ms ease",
              }}
            >
              {product.title}
            </Link>
          </h3>
        </div>

        {/* Price / Archive status: fixed uniform baseline */}
        <div
          style={{
            marginTop: "auto",
            paddingTop: 4,
            fontSize: "clamp(0.8125rem, 2vw, 0.9375rem)",
            height: "1.5em",
            display: "flex",
            alignItems: "center",
          }}
        >
          {isSold ? (
            <span
              style={{
                color: "var(--md-sold, var(--md-fg-secondary))",
                fontSize: "0.6875rem",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                fontWeight: 500,
              }}
            >
              Private Archive
            </span>
          ) : (
            <PriceDisplay priceRange={product.priceRange} locale={locale} />
          )}
        </div>
      </div>
    </div>
  );
}
