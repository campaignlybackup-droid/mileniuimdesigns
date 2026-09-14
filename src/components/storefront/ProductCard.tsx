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
        opacity: isSold ? 0.75 : 1,
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
              color: "var(--md-sold, var(--md-fg-muted))",
            }}
          >
            Sold
          </div>
        )}
      </Link>

      {/* Wishlist control on top right */}
      <div
        style={{
          position: "absolute",
          top: "var(--md-space-2)",
          right: "var(--md-space-2)",
          zIndex: 2,
        }}
      >
        <WishlistButton productId={product.id} />
      </div>

      {/* Details below image */}
      <div style={{ paddingTop: "var(--md-space-2)", display: "flex", flexDirection: "column", gap: "2px" }}>
        <h3
          style={{
            margin: 0,
            fontSize: "clamp(0.8125rem, 1.2vw, 0.9375rem)",
            fontWeight: 400,
            lineHeight: 1.35,
          }}
        >
          <Link
            href={href}
            style={{
              color: "var(--md-fg)",
              textDecoration: "none",
            }}
          >
            {product.title}
          </Link>
        </h3>

        {stoneOrMaterial && (
          <div
            style={{
              fontSize: "0.875rem",
              color: "var(--md-fg-muted)",
              lineHeight: 1.3,
            }}
          >
            {stoneOrMaterial}
          </div>
        )}

        <div style={{ marginTop: "var(--md-space-1)", fontSize: "0.9375rem" }}>
          {isSold ? (
            <span style={{ color: "var(--md-sold, var(--md-fg-muted))", fontSize: "var(--md-t-label)", textTransform: "uppercase" }}>
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
