"use client";

import React, { useRef } from "react";
import { ProductCard } from "@/components/storefront/ProductCard";
import type { StorefrontCard } from "@/lib/catalog/products";

export type ArchivalShowcaseProps = {
  products: StorefrontCard[];
  marketSegment?: string;
  locale?: string;
};

export function ArchivalShowcase({
  products,
  marketSegment = "",
  locale = "en-US",
}: ArchivalShowcaseProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  if (products.length === 0) return null;

  return (
    <section
      style={{
        maxWidth: "var(--md-container)",
        marginInline: "auto",
        paddingInline: "var(--md-gutter)",
        paddingBlock: "clamp(36px, 5vw, 80px)",
        borderTop: "1px solid var(--md-rule)",
      }}
    >
      {/* Header */}
      <div
        style={{
          marginBottom: "clamp(20px, 3.5vw, 36px)",
        }}
      >
        <span
          style={{
            fontSize: "0.6875rem",
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "var(--md-fg-secondary)",
            fontWeight: 600,
            display: "block",
            marginBottom: 6,
          }}
        >
          Curated Archive
        </span>
        <h2
          style={{
            margin: 0,
            fontFamily: "var(--md-font-display)",
            fontSize: "clamp(1.25rem, 3.4vw, 2.75rem)",
            fontWeight: 400,
            color: "var(--md-fg)",
            letterSpacing: "-0.01em",
            lineHeight: 1.15,
          }}
        >
          Archival Masterpieces
        </h2>
      </div>

      {/* Horizontal Slider Track: Smooth Touch & Mouse Carousel */}
      <div
        ref={scrollRef}
        className="md-archival-slider"
        style={{
          display: "flex",
          gap: 12,
          overflowX: "auto",
          scrollSnapType: "x mandatory",
          scrollbarWidth: "none",
          msOverflowStyle: "none",
          WebkitOverflowScrolling: "touch",
          paddingBottom: 14,
          paddingTop: 4,
          scrollBehavior: "smooth",
        }}
      >
        {products.map((p) => (
          <div
            key={p.id}
            style={{
              flex: "0 0 clamp(180px, 54vw, 260px)",
              scrollSnapAlign: "start",
              display: "flex",
              flexDirection: "column",
              height: "100%",
              minWidth: 0,
            }}
          >
            <ProductCard
              product={p}
              marketSegment={marketSegment}
              locale={locale}
            />
          </div>
        ))}
      </div>


    </section>
  );
}
