"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";

export type CampaignSlide = {
  id: string;
  subhead: string;
  title: string;
  standfirst: string;
  ctaText?: string;
  ctaHref?: string;
  imageSrc: string;
  imageAlt: string;
  tag: string;
};

const CAMPAIGN_SLIDES: CampaignSlide[] = [
  {
    id: "emerald-solitaire",
    tag: "HAUTE JOAILLERIE · EST. 1961",
    subhead: "Unheated Mineral Sovereignty",
    title: "Courtly Emeralds & Cold-Forged Silver",
    standfirst:
      "Rare unheated Colombian emeralds cradled in our proprietary anti-tarnish 925 sterling silver alloy. Hand-cast, faceted, and hallmarked on the bench.",
    imageSrc: "/images/hero/campaign_hero_1.jpg",
    imageAlt: "Courtly Colombian emerald solitaire ring forged in 925 sterling silver",
  },
  {
    id: "moonstone-signature",
    tag: "THE SOVEREIGN MOONSTONE SUITE",
    subhead: "Celestial Adularescence",
    title: "Celestial Light, Set in Sculptural Silver",
    standfirst:
      "Natural hand-cut rainbow moonstones exhibiting otherworldly blue adularescence, set in architectural sovereign silver mounts.",
    imageSrc: "/images/hero/campaign_hero_2.jpg",
    imageAlt: "Natural blue flash rainbow moonstone fine jewellery collection",
  },
  {
    id: "royal-pendants",
    tag: "THE REGAL PENDANT VAULT",
    subhead: "Archival Talismans",
    title: "Crown Jewels for Modern Connoisseurs",
    standfirst:
      "Courtly cushion and brilliant-cut heirloom minerals captured in cold-forged silhouettes. Generational Jaipur lost-wax bench mastery.",
    imageSrc: "/images/hero/campaign_hero_3.jpg",
    imageAlt: "Imperial royal amethyst and gemstone sterling silver pendants",
  },
];

export function HeroCampaignSlider({
  slides = CAMPAIGN_SLIDES,
  autoIntervalMs = 6000,
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
  const [isPaused, setIsPaused] = useState(false);

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

  // Autoplay cycle with pause on hover
  useEffect(() => {
    if (!autoplayEnabled || totalSlides <= 1 || isPaused) return;
    const interval = setInterval(nextSlide, autoIntervalMs);
    return () => clearInterval(interval);
  }, [nextSlide, autoIntervalMs, autoplayEnabled, totalSlides, isPaused]);

  // Touch handlers for mobile swipe
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.targetTouches[0]?.clientX ?? null;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndXRef.current = e.targetTouches[0]?.clientX ?? null;
  };

  const handleTouchEnd = () => {
    if (touchStartXRef.current === null || touchEndXRef.current === null) return;
    const diff = touchStartXRef.current - touchEndXRef.current;
    const minSwipeDistance = 40;

    if (diff > minSwipeDistance) {
      nextSlide();
    } else if (diff < -minSwipeDistance) {
      prevSlide();
    }

    touchStartXRef.current = null;
    touchEndXRef.current = null;
  };

  const activeSlide = activeSlides[currentIdx] || activeSlides[0]!;
  const isCentered = textAlign === "center";

  // Compute refined scrim opacity based on admin setting
  const effectiveOpacity = Math.max(0.2, Math.min(overlayOpacity, 0.85));

  return (
    <section
      data-surface="emerald-deep"
      aria-label="Millennium Designs Haute Joaillerie Showcase"
      className="md-hero-section"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{
        position: "relative",
        width: "100%",
        minHeight: "clamp(460px, 66vh, 840px)",
        background: "var(--md-green-black)",
        color: "var(--md-fg-inverse)",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
      }}
    >
      {/* ── Background Campaign Imagery with Ken Burns subtle drift ── */}
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
              transition: "opacity 1100ms cubic-bezier(0.16, 1, 0.3, 1)",
              zIndex: 1,
              pointerEvents: "none",
            }}
          >
            <Image
              src={slide.imageSrc}
              alt={slide.imageAlt}
              fill
              priority={idx === 0}
              sizes="100vw"
              style={{
                objectFit: "cover",
                objectPosition: "center 42%",
                transform: isActive ? "scale(1.04)" : "scale(1.0)",
                transition: "transform 8500ms cubic-bezier(0.16, 1, 0.3, 1)",
                filter: "brightness(0.92) contrast(1.04)",
              }}
            />

            {/* Haute Joaillerie Luxury Vignette Gradient:
                Keeps the jewelry piece radiant while providing crisp contrast for typography */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: isCentered
                  ? `radial-gradient(ellipse at center, rgba(3, 15, 10, ${effectiveOpacity * 0.7}) 0%, rgba(3, 15, 10, ${effectiveOpacity * 1.3}) 100%)`
                  : `linear-gradient(90deg, rgba(3, 15, 10, ${effectiveOpacity * 1.55}) 0%, rgba(3, 15, 10, ${effectiveOpacity * 1.1}) 38%, rgba(3, 15, 10, ${effectiveOpacity * 0.35}) 70%, transparent 100%)`,
                transition: "background 500ms ease",
              }}
            />

            {/* Subtle bottom edge shadow uniting with next section */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "linear-gradient(to top, rgba(3, 15, 10, 0.65) 0%, transparent 22%)",
              }}
            />
          </div>
        );
      })}

      {/* ── Foreground Editorial Typography ───────────────────────── */}
      <div
        className="md-hero-content"
        style={{
          position: "relative",
          zIndex: 3,
          width: "100%",
          maxWidth: "var(--md-container)",
          marginInline: "auto",
          paddingInline: "var(--md-gutter)",
          paddingBlock: "clamp(36px, 7vw, 100px)",
          display: "flex",
          flexDirection: "column",
          alignItems: isCentered ? "center" : "flex-start",
          textAlign: isCentered ? "center" : "left",
        }}
      >
        <div
          style={{
            maxWidth: isCentered ? "800px" : "660px",
            display: "flex",
            flexDirection: "column",
            alignItems: isCentered ? "center" : "flex-start",
            gap: "clamp(12px, 2.2vw, 22px)",
          }}
        >
          {/* Prestige Provenance Tag & Subhead */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: isCentered ? "center" : "flex-start",
              gap: "clamp(8px, 1.5vw, 12px)",
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 10px",
                background: "color-mix(in srgb, var(--md-champagne) 14%, transparent)",
                border: "1px solid color-mix(in srgb, var(--md-champagne) 38%, transparent)",
                color: "var(--md-champagne)",
                fontSize: "clamp(0.5625rem, 1.5vw, 0.625rem)",
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                fontWeight: 600,
                fontFamily: "var(--md-font-crest), Georgia, serif",
                lineHeight: 1,
              }}
            >
              <span style={{ color: "var(--md-gold)", fontSize: "0.6875rem" }}>✦</span>
              <span>{activeSlide.tag}</span>
            </span>

            <span
              style={{
                display: "inline-block",
                width: 20,
                height: 1,
                background: "color-mix(in srgb, var(--md-champagne) 45%, transparent)",
              }}
            />

            <span
              style={{
                fontSize: "clamp(0.625rem, 1.6vw, 0.6875rem)",
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "color-mix(in srgb, var(--md-champagne) 85%, transparent)",
                fontWeight: 500,
              }}
            >
              {activeSlide.subhead}
            </span>
          </div>

          {/* Grand Haute Joaillerie Headline */}
          <h1
            key={activeSlide.id}
            className="md-hero-title"
            style={{
              margin: 0,
              fontFamily: "var(--md-font-display)",
              fontSize: "clamp(1.85rem, 4.8vw, 3.85rem)",
              lineHeight: 1.08,
              fontWeight: 400,
              letterSpacing: "-0.02em",
              color: "var(--md-fg-inverse)",
              textWrap: "balance",
              textShadow: "0 3px 20px rgba(0, 0, 0, 0.65)",
              animation: "fadeIn 600ms cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          >
            {activeSlide.title}
          </h1>

          {/* Editorial Standfirst Narrative */}
          <p
            key={`p-${activeSlide.id}`}
            className="md-hero-standfirst"
            style={{
              margin: 0,
              fontSize: "clamp(0.84rem, 1.8vw, 0.98rem)",
              lineHeight: 1.7,
              color: "color-mix(in srgb, var(--md-fg-inverse) 88%, transparent)",
              maxWidth: "540px",
              textShadow: "0 2px 14px rgba(0, 0, 0, 0.5)",
              animation: "fadeIn 700ms cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          >
            {activeSlide.standfirst}
          </p>
        </div>
      </div>
    </section>
  );
}
