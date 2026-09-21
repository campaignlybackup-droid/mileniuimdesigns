"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
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
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);

  const updateScrollState = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
    setCanScrollLeft(scrollLeft > 10);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 10);

    // Calculate approximate active card index for indicator
    if (products.length > 0 && scrollWidth > clientWidth) {
      const cardWidth = (scrollWidth - (products.length - 1) * 16) / products.length;
      const idx = Math.min(
        products.length - 1,
        Math.max(0, Math.round(scrollLeft / (cardWidth + 16)))
      );
      setActiveIndex(idx);
    }
  }, [products.length]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateScrollState();
    el.addEventListener("scroll", updateScrollState, { passive: true });
    window.addEventListener("resize", updateScrollState, { passive: true });
    return () => {
      el.removeEventListener("scroll", updateScrollState);
      window.removeEventListener("resize", updateScrollState);
    };
  }, [updateScrollState]);

  if (products.length === 0) return null;

  const scrollByAmount = (direction: "prev" | "next") => {
    if (!scrollRef.current) return;
    const cardEl = scrollRef.current.firstElementChild as HTMLElement | null;
    const cardWidth = cardEl ? cardEl.offsetWidth + 16 : 280;
    const offset = direction === "next" ? cardWidth : -cardWidth;
    scrollRef.current.scrollBy({ left: offset, behavior: "smooth" });
  };

  const scrollToIndex = (index: number) => {
    if (!scrollRef.current) return;
    const cardEl = scrollRef.current.firstElementChild as HTMLElement | null;
    const cardWidth = cardEl ? cardEl.offsetWidth + 16 : 280;
    scrollRef.current.scrollTo({ left: index * cardWidth, behavior: "smooth" });
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
      {/* Header with Title, Editorial Context, and Carousel Navigation */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          marginBottom: "clamp(20px, 3.5vw, 36px)",
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
            CURATED ARCHIVE
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

        {/* Carousel Controls (Previous / Next chevrons) */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span
            style={{
              fontSize: "0.6875rem",
              letterSpacing: "0.12em",
              color: "var(--md-fg-secondary)",
              fontFamily: "var(--md-font-mono, monospace)",
              textTransform: "uppercase",
              marginRight: 2,
            }}
          >
            {String(activeIndex + 1).padStart(2, "0")} / {String(products.length).padStart(2, "0")}
          </span>

          <button
            type="button"
            onClick={() => scrollByAmount("prev")}
            disabled={!canScrollLeft}
            aria-label="Previous archival piece"
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
              opacity: canScrollLeft ? 1 : 0.35,
              transition: "all 180ms ease",
              touchAction: "manipulation",
              boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>

          <button
            type="button"
            onClick={() => scrollByAmount("next")}
            disabled={!canScrollRight}
            aria-label="Next archival piece"
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
              opacity: canScrollRight ? 1 : 0.35,
              transition: "all 180ms ease",
              touchAction: "manipulation",
              boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
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

      {/* Slide Position Indicator Dots for Mobile & Desktop */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          gap: 6,
          marginTop: 12,
        }}
      >
        {products.map((_, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => scrollToIndex(idx)}
            aria-label={`Go to piece ${idx + 1}`}
            style={{
              width: idx === activeIndex ? 22 : 6,
              height: 6,
              borderRadius: "var(--md-radius-pill, 9999px)",
              background: idx === activeIndex ? "var(--md-gold)" : "var(--md-rule)",
              border: "none",
              padding: 0,
              cursor: "pointer",
              transition: "all 240ms cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          />
        ))}
      </div>
    </section>
  );
}
