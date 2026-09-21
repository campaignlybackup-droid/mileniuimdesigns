"use client";

import React, { useState, useRef } from "react";
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
  const [viewMode, setViewMode] = useState<"slider" | "grid">("grid");
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  if (products.length === 0) return null;

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
    setCanScrollLeft(scrollLeft > 10);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 10);
  };

  const scrollBy = (offset: number) => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollBy({ left: offset, behavior: "smooth" });
  };

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
      {/* Header with Title and View/Navigation Controls */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          marginBottom: "clamp(20px, 3.5vw, 40px)",
          flexWrap: "wrap",
          gap: "var(--md-space-3)",
        }}
      >
        <div style={{ maxWidth: "560px" }}>
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
            CURATED SELECTIONS
          </span>
          <h2
            style={{
              margin: 0,
              fontFamily: "var(--md-font-display)",
              fontSize: "clamp(1.75rem, 3.4vw, 3rem)",
              fontWeight: 400,
              color: "var(--md-fg)",
              letterSpacing: "-0.01em",
              lineHeight: 1.15,
            }}
          >
            Archival Masterpieces
          </h2>
          <p
            style={{
              margin: "8px 0 0",
              fontSize: "clamp(0.875rem, 1.2vw, 0.9375rem)",
              color: "var(--md-fg-secondary)",
              lineHeight: 1.6,
            }}
          >
            Individually documented creations, hallmarked in solid sterling silver and archived for connoisseurs worldwide.
          </p>
        </div>

        {/* View Switcher & Carousel Controls */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          {/* Mode Switcher on mobile: Grid vs Slider */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              background: "var(--md-bg-raised)",
              borderRadius: "var(--md-radius-sm, 2px)",
              border: "1px solid var(--md-rule)",
              padding: 2,
            }}
          >
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              aria-label="Grid view"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "6px 12px",
                border: "none",
                background: viewMode === "grid" ? "var(--md-bg)" : "transparent",
                color: viewMode === "grid" ? "var(--md-fg)" : "var(--md-fg-secondary)",
                boxShadow: viewMode === "grid" ? "0 1px 4px rgba(0, 0, 0, 0.08)" : "none",
                fontSize: "0.6875rem",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                fontWeight: 600,
                cursor: "pointer",
                borderRadius: "var(--md-radius-sm, 2px)",
                transition: "all 180ms ease",
              }}
            >
              Grid ⊞
            </button>

            <button
              type="button"
              onClick={() => setViewMode("slider")}
              aria-label="Slider carousel view"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "6px 12px",
                border: "none",
                background: viewMode === "slider" ? "var(--md-bg)" : "transparent",
                color: viewMode === "slider" ? "var(--md-fg)" : "var(--md-fg-secondary)",
                boxShadow: viewMode === "slider" ? "0 1px 4px rgba(0, 0, 0, 0.08)" : "none",
                fontSize: "0.6875rem",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                fontWeight: 600,
                cursor: "pointer",
                borderRadius: "var(--md-radius-sm, 2px)",
                transition: "all 180ms ease",
              }}
            >
              Slider ↔
            </button>
          </div>

          {/* If in slider mode, show carousel left/right buttons */}
          {viewMode === "slider" && (
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <button
                type="button"
                onClick={() => scrollBy(-260)}
                disabled={!canScrollLeft}
                aria-label="Previous products"
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  border: "1px solid var(--md-rule)",
                  background: "var(--md-bg)",
                  color: "var(--md-fg)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: canScrollLeft ? "pointer" : "default",
                  opacity: canScrollLeft ? 1 : 0.4,
                  transition: "opacity 180ms ease",
                }}
              >
                ←
              </button>
              <button
                type="button"
                onClick={() => scrollBy(260)}
                disabled={!canScrollRight}
                aria-label="Next products"
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  border: "1px solid var(--md-rule)",
                  background: "var(--md-bg)",
                  color: "var(--md-fg)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: canScrollRight ? "pointer" : "default",
                  opacity: canScrollRight ? 1 : 0.4,
                  transition: "opacity 180ms ease",
                }}
              >
                →
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Grid Mode: perfectly uniform 2-column on mobile, auto-fill on desktop */}
      {viewMode === "grid" ? (
        <div className="md-product-grid">
          {products.map((p) => (
            <div key={p.id} style={{ display: "flex", flexDirection: "column", height: "100%" }}>
              <ProductCard
                product={p}
                marketSegment={marketSegment}
                locale={locale}
              />
            </div>
          ))}
        </div>
      ) : (
        /* Slider Mode: smooth horizontal touch-swipeable track */
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          style={{
            display: "flex",
            gap: 14,
            overflowX: "auto",
            scrollSnapType: "x mandatory",
            scrollbarWidth: "none",
            msOverflowStyle: "none",
            WebkitOverflowScrolling: "touch",
            paddingBottom: 8,
          }}
        >
          {products.map((p) => (
            <div
              key={p.id}
              style={{
                flex: "0 0 clamp(220px, 68vw, 290px)",
                scrollSnapAlign: "start",
                display: "flex",
                flexDirection: "column",
                height: "100%",
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
      )}
    </section>
  );
}
