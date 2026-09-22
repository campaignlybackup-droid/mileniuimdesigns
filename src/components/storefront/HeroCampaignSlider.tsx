"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import Link from "next/link";

export type CampaignSlide = {
  id: string;
  subhead: string;
  title: string;
  standfirst: string;
  ctaText: string;
  ctaHref: string;
  imageSrc: string;
  imageAlt: string;
  tag: string;
};

const CAMPAIGN_SLIDES: CampaignSlide[] = [
  {
    id: "emerald-solitaire",
    tag: "HAUTE JOAILLERIE",
    subhead: "JOHARI BAZAAR, JAIPUR · ATELIER 1961",
    title: "Courtly Emeralds & Cold-Forged Silver",
    standfirst:
      "Rare unheated Colombian emeralds cradled in our proprietary anti-tarnish 925 sterling silver alloy. Hand-cast, faceted, and hallmarked on the bench.",
    ctaText: "Explore High Jewellery",
    ctaHref: "/rings",
    imageSrc: "/images/hero-emerald-ring.jpg",
    imageAlt: "Courtly emerald solitaire ring forged in 925 sterling silver",
  },
  {
    id: "moonstone-signature",
    tag: "THE NEW SIGNATURE",
    subhead: "CELESTIAL ADULARESCENCE",
    title: "The Art of the Light",
    standfirst:
      "Natural hand-cut rainbow moonstones exhibiting otherworldly blue adularescence, set in architectural sovereign silver mounts.",
    ctaText: "Discover Natural Moonstone",
    ctaHref: "/stones/moonstone",
    imageSrc: "/images/categories/rings.jpg",
    imageAlt: "Natural rainbow moonstone fine jewellery collection",
  },
  {
    id: "royal-pendants",
    tag: "ARCHIVAL CREATIONS",
    subhead: "ONE-OF-A-KIND ARCHIVAL MOUNTS",
    title: "Made to Be Remembered",
    standfirst:
      "Courtly cushion and brilliant-cut heirloom minerals captured in cold-forged silhouettes. Zero middlemen markups; direct from master silversmiths.",
    ctaText: "View Royal Pendants",
    ctaHref: "/pendants",
    imageSrc: "/images/categories/pendants.jpg",
    imageAlt: "Royal archival fine silver pendants and natural gemstones",
  },
];

export function HeroCampaignSlider({
  marketPrefix = "",
  slides = CAMPAIGN_SLIDES,
  autoIntervalMs = 5500,
  autoplayEnabled = true,
  textAlign = "left",
  overlayOpacity = 0.45,
}: {
  marketPrefix?: string;
  slides?: CampaignSlide[];
  autoIntervalMs?: number;
  autoplayEnabled?: boolean;
  textAlign?: "left" | "center";
  overlayOpacity?: number;
}): React.JSX.Element {
  const [currentIdx, setCurrentIdx] = useState(0);

  // Touch Swipe tracking for smartphones
  const touchStartXRef = useRef<number | null>(null);
  const touchEndXRef = useRef<number | null>(null);

  const activeSlides = slides && slides.length > 0 ? slides : CAMPAIGN_SLIDES;
  const totalSlides = activeSlides.length;

  const nextSlide = useCallback(() => {
    setCurrentIdx((prev) => (prev + 1) % totalSlides);
  }, [totalSlides]);

  const prevSlide = useCallback(() => {
    setCurrentIdx((prev) => (prev - 1 + totalSlides) % totalSlides);
  }, [totalSlides]);

  // Autoplay cycle
  useEffect(() => {
    if (!autoplayEnabled || totalSlides <= 1) return;
    const interval = setInterval(nextSlide, autoIntervalMs);
    return () => clearInterval(interval);
  }, [nextSlide, autoIntervalMs, autoplayEnabled, totalSlides]);

  // Touch handlers for seamless swipe gestures on mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.targetTouches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndXRef.current = e.targetTouches[0].clientX;
  };

  const handleTouchEnd = () => {
    if (touchStartXRef.current === null || touchEndXRef.current === null) return;
    const diff = touchStartXRef.current - touchEndXRef.current;
    const minSwipeDistance = 45; // 45px threshold

    if (diff > minSwipeDistance) {
      nextSlide();
    } else if (diff < -minSwipeDistance) {
      prevSlide();
    }

    touchStartXRef.current = null;
    touchEndXRef.current = null;
  };

  const activeSlide = activeSlides[currentIdx] || activeSlides[0]!;

  return (
    <section
      data-surface="emerald-deep"
      aria-label="Featured Fine Jewellery Campaigns"
      className="md-hero-section"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{
        position: "relative",
        width: "100%",
        minHeight: "clamp(340px, 50vh, 780px)",
        background: "var(--md-green-black)",
        color: "var(--md-fg-inverse)",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
      }}
    >
      {/* ── Background Campaign Photography with Ken Burns slow zoom ── */}
      {activeSlides.map((slide, idx) => {
        const isActive = idx === currentIdx;
        return (
          <div
            key={slide.id}
            aria-hidden={!isActive}
            style={{
              position: "absolute",
              inset: 0,
              opacity: isActive ? 1 : 0,
              transition: "opacity 900ms cubic-bezier(0.16, 1, 0.3, 1)",
              zIndex: 1,
              pointerEvents: isActive ? "auto" : "none",
            }}
          >
            <Image
              src={slide.imageSrc}
              alt={slide.imageAlt}
              fill
              priority={idx === 0}
              sizes="(max-width: 768px) 100vw, 100vw"
              style={{
                objectFit: "cover",
                objectPosition: "center 38%",
                transform: isActive ? "scale(1.05)" : "scale(1.0)",
                transition: "transform 7000ms cubic-bezier(0.1, 1, 0.3, 1)",
                filter: "brightness(0.68) contrast(1.08)",
              }}
            />
            {/* Cinematic Gradient Overlays: Rich Studio Vignette for perfect text readability on mobile */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "linear-gradient(to right, rgba(4, 18, 12, 0.92) 0%, rgba(4, 18, 12, 0.72) 55%, rgba(4, 18, 12, 0.32) 100%)",
              }}
            />
            <div
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "linear-gradient(to top, rgba(3, 15, 10, 0.9) 0%, transparent 50%, rgba(3, 15, 10, 0.45) 100%)",
              }}
            />
          </div>
        );
      })}

      {/* ── Foreground Editorial Typography & Content ──────────────── */}
      <div
        className="md-hero-content"
        style={{
          position: "relative",
          zIndex: 3,
          width: "100%",
          maxWidth: "var(--md-container)",
          marginInline: "auto",
          paddingInline: "var(--md-gutter)",
          paddingBlock: "clamp(28px, 6vw, 96px)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
        <div style={{ maxWidth: "680px", display: "flex", flexDirection: "column", gap: "clamp(10px, 2vw, 18px)" }}>
          {/* Tag & Subhead */}
          <div style={{ display: "flex", alignItems: "center", gap: "clamp(6px, 1.5vw, 10px)", flexWrap: "wrap" }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "2px 8px",
                borderRadius: 0,
                background: "color-mix(in srgb, var(--md-champagne) 18%, transparent)",
                border: "1px solid color-mix(in srgb, var(--md-champagne) 42%, transparent)",
                color: "var(--md-champagne)",
                fontSize: "clamp(0.5625rem, 1.6vw, 0.625rem)",
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                fontWeight: 600,
                fontFamily: "var(--md-font-crest), Georgia, serif",
                lineHeight: 1,
              }}
            >
              <span>✦</span>
              <span>{activeSlide.tag}</span>
            </span>

            <span
              style={{
                fontSize: "clamp(0.5625rem, 1.6vw, 0.65625rem)",
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "color-mix(in srgb, var(--md-champagne) 85%, transparent)",
                fontWeight: 500,
              }}
            >
              {activeSlide.subhead}
            </span>
          </div>

          {/* Headline: Mobile-tuned clamp to prevent 4-line wrapping */}
          <h1
            key={activeSlide.id}
            className="md-hero-title"
            style={{
              margin: 0,
              fontFamily: "var(--md-font-display)",
              fontSize: "clamp(1.45rem, 4.8vw, 3.75rem)",
              lineHeight: 1.1,
              fontWeight: 400,
              letterSpacing: "-0.015em",
              color: "var(--md-fg-inverse)",
              textWrap: "balance",
              animation: "fadeIn 550ms cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          >
            {activeSlide.title}
          </h1>

          {/* Standfirst narrative — hidden on mobile via .md-hero-standfirst for sleek spaciousness */}
          <p
            key={`p-${activeSlide.id}`}
            className="md-hero-standfirst"
            style={{
              margin: 0,
              fontSize: "clamp(0.8125rem, 2vw, 0.9375rem)",
              lineHeight: 1.6,
              color: "color-mix(in srgb, var(--md-fg-inverse) 86%, transparent)",
              maxWidth: "520px",
              animation: "fadeIn 650ms cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          >
            {activeSlide.standfirst}
          </p>

          {/* Editorial Custom CTAs */}
          <div
            style={{
              display: "flex",
              alignItems: "stretch",
              gap: "clamp(10px, 2vw, 20px)",
              paddingTop: "clamp(4px, 1.2vw, 12px)",
              flexWrap: "wrap",
            }}
          >
            <Link
              href={`${marketPrefix}${activeSlide.ctaHref}`}
              className="md-hero-cta"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                padding: "clamp(10px, 2.2vw, 14px) clamp(18px, 3.5vw, 28px)",
                background: "var(--md-champagne)",
                color: "var(--md-green-black)",
                fontSize: "clamp(0.6875rem, 2vw, 0.75rem)",
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                fontWeight: 600,
                textDecoration: "none",
                borderRadius: 0,
                minHeight: 44,
                boxShadow: "0 8px 24px -6px rgba(0, 0, 0, 0.45)",
                transition: "transform 180ms ease, background 180ms ease",
              }}
            >
              <span>{activeSlide.ctaText}</span>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
