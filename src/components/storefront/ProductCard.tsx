import type { JSX } from "react";
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
 * Implements pure luxury aesthetics: smooth image hover transitions,
 * frosted archival hallmark tag, and crisp typographical hierarchy.
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
  const alternateSrc = alternateUrl ?? (primaryUrl ? null : fallbacks.alternate);

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
        opacity: isSold ? 0.7 : 1,
      }}
    >
      {/* 4:5 Media container — pure photographic presentation, no visible card border */}
      <Link
        href={href}
        style={{
          position: "relative",
          aspectRatio: "4 / 5",
          background: "var(--md-bg-raised)",
          overflow: "hidden",
          display: "block",
          textDecoration: "none",
          borderRadius: 0,
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
            transition: "opacity 400ms ease",
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
              transition: "opacity 400ms ease",
            }}
          />
        )}

        {isSold && (
          <div
            style={{
              position: "absolute",
              bottom: "var(--md-space-3)",
              left: "var(--md-space-3)",
              background: "var(--md-bg)",
              padding: "4px 10px",
              fontSize: "0.625rem",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--md-sold, var(--md-fg-secondary))",
              zIndex: 2,
            }}
          >
            Archived Piece
          </div>
        )}
      </Link>

      {/* Understated Wishlist control */}
      <div
        style={{
          position: "absolute",
          top: "var(--md-space-2)",
          right: "var(--md-space-2)",
          zIndex: 3,
        }}
      >
        <WishlistButton productId={product.id} />
      </div>

      {/* Typographic Details below image */}
      <div style={{ paddingTop: "var(--md-space-4)", display: "flex", flexDirection: "column", gap: "4px" }}>
        {stoneOrMaterial && (
          <div
            style={{
              fontSize: "0.6875rem",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--md-fg-secondary)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {stoneOrMaterial}
          </div>
        )}

        <h3
          style={{
            margin: 0,
            fontFamily: "var(--md-font-display)",
            fontSize: "clamp(0.9375rem, 1.25vw, 1.0625rem)",
            fontWeight: 400,
            lineHeight: 1.35,
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

        <div style={{ marginTop: "2px", fontSize: "0.9375rem" }}>
          {isSold ? (
            <span style={{ color: "var(--md-sold, var(--md-fg-secondary))", fontSize: "0.75rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>
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
