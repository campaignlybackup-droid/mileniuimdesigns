"use client";

import React, { type JSX } from "react";
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
 * Shows a single primary image. Swipe-to-browse is reserved for the product detail page.
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

  const primarySrc = primaryUrl ?? fallbacks.primary;

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
      {/* 4:5 Media container */}
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
          aria-label={product.title}
        >
          <img
            src={primarySrc}
            alt={product.primaryImage?.altText ?? product.title}
            loading={priority ? "eager" : "lazy"}
            decoding="async"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
            }}
          />

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
