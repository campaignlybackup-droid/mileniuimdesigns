"use client";

import React, { useRef, useState } from "react";
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
 * ProductCard — 3D Interactive Specular Jewellery Showcase.
 *
 * Implements realistic 3D perspective tilt reacting to mouse position, dynamic
 * specular reflection catching surface luster, and physical Z-space layering
 * for hallmarks and actions.
 */
export function ProductCard({
  product,
  marketSegment = "",
  locale = "en-US",
  priority = false,
}: ProductCardProps): React.JSX.Element {
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
  const alternateSrc = alternateUrl ?? (primaryUrl ? null : fallbacks.alternate);

  const stoneOrMaterial = [product.stonesText, product.materialsText]
    .filter(Boolean)
    .join(" · ");

  const isSold = Boolean(product.soldAt);

  // 3D Perspective Tilt & Specular State
  const [tilt, setTilt] = useState({ x: 0, y: 0, glareX: 50, glareY: 50, active: false });
  const cardRef = useRef<HTMLDivElement | null>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    
    // Tilt within subtle luxury bounds (-7deg to +7deg)
    const rotateX = (0.5 - y) * 12;
    const rotateY = (x - 0.5) * 12;
    
    setTilt({
      x: rotateX,
      y: rotateY,
      glareX: Math.round(x * 100),
      glareY: Math.round(y * 100),
      active: true,
    });
  };

  const handleMouseLeave = () => {
    setTilt({ x: 0, y: 0, glareX: 50, glareY: 50, active: false });
  };

  return (
    <div
      ref={cardRef}
      className="md-product-card"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        opacity: isSold ? 0.75 : 1,
        perspective: "1000px",
      }}
    >
      {/* 3D Tilting Media Container */}
      <div
        style={{
          position: "relative",
          transform: tilt.active
            ? `rotateX(${tilt.x.toFixed(2)}deg) rotateY(${tilt.y.toFixed(2)}deg) scale3d(1.025, 1.025, 1.025)`
            : "rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)",
          transformStyle: "preserve-3d",
          transition: tilt.active
            ? "transform 80ms ease-out, box-shadow 80ms ease-out"
            : "transform 550ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow 550ms cubic-bezier(0.16, 1, 0.3, 1)",
          borderRadius: "var(--md-radius-sm)",
          boxShadow: tilt.active
            ? "0 22px 42px -12px rgba(6, 19, 13, 0.25), 0 0 0 1px rgba(200, 178, 122, 0.35)"
            : "0 4px 14px -4px rgba(0, 0, 0, 0.04), 0 0 0 1px rgba(200, 178, 122, 0.12)",
        }}
      >
        {/* 4:5 Media container */}
        <Link
          href={href}
          style={{
            position: "relative",
            aspectRatio: "4 / 5",
            background: "var(--md-bg-raised)",
            overflow: "hidden",
            display: "block",
            textDecoration: "none",
            borderRadius: "inherit",
          }}
          tabIndex={-1}
          aria-hidden="true"
        >
          <img
            src={primarySrc}
            alt={product.primaryImage?.altText ?? product.title}
            loading={priority ? "eager" : "lazy"}
            decoding="async"
            className="md-card-primary-image"
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              transition: "transform var(--md-dur, 320ms) var(--md-ease), opacity var(--md-dur, 300ms) ease",
            }}
          />

          {alternateSrc && (
            <img
              src={alternateSrc}
              alt={product.alternateImage?.altText ?? `${product.title} alternate view`}
              loading="lazy"
              decoding="async"
              className="md-card-alternate-image"
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
                opacity: 0,
                transition: "opacity var(--md-dur, 320ms) var(--md-ease), transform var(--md-dur, 320ms) var(--md-ease)",
              }}
            />
          )}

          {/* Dynamic 3D Specular Sheen Glare */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              zIndex: 3,
              opacity: tilt.active ? 1 : 0,
              transition: "opacity 260ms ease",
              background: `radial-gradient(circle 280px at ${tilt.glareX}% ${tilt.glareY}%, rgba(255, 255, 255, 0.35) 0%, rgba(200, 178, 122, 0.15) 35%, transparent 70%)`,
              mixBlendMode: "screen",
            }}
          />

          {/* Subtle Atelier Hallmark Badge (Floats forward in 3D) */}
          <div
            style={{
              position: "absolute",
              top: "var(--md-space-2)",
              left: "var(--md-space-2)",
              background: "rgba(6, 19, 13, 0.82)",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
              padding: "4px 10px",
              fontSize: "0.625rem",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--md-champagne)",
              borderRadius: "var(--md-radius-sm)",
              border: "1px solid rgba(200, 178, 122, 0.35)",
              zIndex: 4,
              fontFamily: "var(--md-font-crest), Georgia, serif",
              transform: tilt.active ? "translateZ(24px)" : "translateZ(0px)",
              transition: "transform 250ms ease",
              boxShadow: "0 2px 8px rgba(0, 0, 0, 0.2)",
            }}
          >
            925 Silver
          </div>

          {isSold && (
            <div
              style={{
                position: "absolute",
                bottom: "var(--md-space-3)",
                left: "var(--md-space-3)",
                background: "var(--md-bg)",
                padding: "var(--md-space-1) var(--md-space-2)",
                fontSize: "var(--md-t-label)",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "var(--md-sold, var(--md-fg-secondary))",
                borderRadius: "var(--md-radius-sm)",
                zIndex: 4,
              }}
            >
              Sold
            </div>
          )}
        </Link>

        {/* Wishlist control on top right (Floats forward in 3D) */}
        <div
          style={{
            position: "absolute",
            top: "var(--md-space-2)",
            right: "var(--md-space-2)",
            zIndex: 4,
            transform: tilt.active ? "translateZ(26px)" : "translateZ(0px)",
            transition: "transform 250ms ease",
          }}
        >
          <WishlistButton productId={product.id} />
        </div>
      </div>

      {/* Details below image */}
      <div style={{ paddingTop: "var(--md-space-3)", display: "flex", flexDirection: "column", gap: "4px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
          <span
            style={{
              fontSize: "0.625rem",
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "var(--md-fg-muted)",
              fontFamily: "var(--md-font-crest), Georgia, serif",
            }}
          >
            JAIPUR ATELIER
          </span>
          <span
            style={{
              fontSize: "0.625rem",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--md-champagne)",
              fontWeight: 600,
            }}
          >
            925 SILVER
          </span>
        </div>

        <h3
          style={{
            margin: 0,
            fontFamily: "var(--md-font-display)",
            fontSize: "clamp(0.9375rem, 1.3vw, 1.0625rem)",
            fontWeight: 400,
            lineHeight: 1.3,
            letterSpacing: "0.01em",
          }}
        >
          <Link
            href={href}
            style={{
              color: "var(--md-fg)",
              textDecoration: "none",
              transition: "color 200ms ease",
            }}
          >
            {product.title}
          </Link>
        </h3>

        {stoneOrMaterial && (
          <div
            style={{
              fontSize: "0.8125rem",
              color: "var(--md-fg-secondary)",
              lineHeight: 1.3,
              letterSpacing: "0.01em",
            }}
          >
            {stoneOrMaterial}
          </div>
        )}

        <div style={{ marginTop: "var(--md-space-1)", fontSize: "0.9375rem" }}>
          {isSold ? (
            <span style={{ color: "var(--md-sold, var(--md-fg-secondary))", fontSize: "var(--md-t-label)", textTransform: "uppercase" }}>
              Archive
            </span>
          ) : (
            <PriceDisplay priceRange={product.priceRange} locale={locale} />
          )}
        </div>
      </div>
    </div>
  );
}
