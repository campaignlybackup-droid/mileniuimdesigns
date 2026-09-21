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

const SLIDE_DURATION = 6500; // 6.5s per campaign slide

export function HeroCampaignSlider({ marketPrefix = "" }: { marketPrefix?: string }): React.JSX.Element {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const animRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(Date.now());

  const totalSlides = CAMPAIGN_SLIDES.length;

  const nextSlide = useCallback(() => {
    setCurrentIdx((prev) => (prev + 1) % totalSlides);
    setProgress(0);
    startTimeRef.current = Date.now();
  }, [totalSlides]);

  const prevSlide = useCallback(() => {
    setCurrentIdx((prev) => (prev - 1 + totalSlides) % totalSlides);
    setProgress(0);
    startTimeRef.current = Date.now();
  }, [totalSlides]);

  const goToSlide = (idx: number) => {
    setCurrentIdx(idx);
    setProgress(0);
    startTimeRef.current = Date.now();
  };

  // Timer loop with smooth progress bar
  useEffect(() => {
    if (isPaused) return;

    startTimeRef.current = Date.now() - (progress / 100) * SLIDE_DURATION;

    const tick = () => {
      const elapsed = Date.now() - startTimeRef.current;
      const currentProgress = Math.min((elapsed / SLIDE_DURATION) * 100, 100);
      setProgress(currentProgress);

      if (elapsed >= SLIDE_DURATION) {
        nextSlide();
      } else {
        animRef.current = requestAnimationFrame(tick);
      }
    };

    animRef.current = requestAnimationFrame(tick);

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [currentIdx, isPaused, nextSlide, progress]);

  const activeSlide = CAMPAIGN_SLIDES[currentIdx];

  return (
    <section
      data-surface="emerald-deep"
      aria-label="Featured Fine Jewellery Campaigns"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      style={{
        position: "relative",
        width: "100%",
        minHeight: "clamp(580px, 82vh, 860px)",
        background: "var(--md-green-black)",
        color: "var(--md-fg-inverse)",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
      }}
    >
      {/* ── Background Campaign Photography with Ken Burns slow zoom ── */}
      {CAMPAIGN_SLIDES.map((slide, idx) => {
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
              sizes="100vw"
              style={{
                objectFit: "cover",
                objectPosition: "center 42%",
                transform: isActive ? "scale(1.05)" : "scale(1.0)",
                transition: "transform 7000ms cubic-bezier(0.1, 1, 0.3, 1)",
                filter: "brightness(0.72) contrast(1.08)",
              }}
            />
            {/* Cinematic Gradient Overlays: Rich Studio Vignette */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "linear-gradient(to right, rgba(4, 18, 12, 0.88) 0%, rgba(4, 18, 12, 0.65) 45%, rgba(4, 18, 12, 0.25) 100%)",
              }}
            />
            <div
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "linear-gradient(to top, rgba(3, 15, 10, 0.85) 0%, transparent 45%, rgba(3, 15, 10, 0.4) 100%)",
              }}
            />
          </div>
        );
      })}

      {/* ── Foreground Editorial Typography & Content ──────────────── */}
      <div
        style={{
          position: "relative",
          zIndex: 3,
          width: "100%",
          maxWidth: "var(--md-container)",
          marginInline: "auto",
          paddingInline: "var(--md-gutter)",
          paddingBlock: "clamp(64px, 10vw, 128px)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
        <div style={{ maxWidth: "680px", display: "flex", flexDirection: "column", gap: "var(--md-space-4)" }}>
          {/* Tag & Subhead */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 12px",
                borderRadius: 0,
                background: "color-mix(in srgb, var(--md-champagne) 16%, transparent)",
                border: "1px solid color-mix(in srgb, var(--md-champagne) 40%, transparent)",
                color: "var(--md-champagne)",
                fontSize: "0.625rem",
                letterSpacing: "0.18em",
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
                fontSize: "0.6875rem",
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                color: "color-mix(in srgb, var(--md-champagne) 85%, transparent)",
                fontWeight: 500,
              }}
            >
              {activeSlide.subhead}
            </span>
          </div>

          {/* Headline with keyframe crossfade */}
          <h1
            key={activeSlide.id}
            style={{
              margin: 0,
              fontFamily: "var(--md-font-display)",
              fontSize: "clamp(2.5rem, 5.5vw, 4.75rem)",
              lineHeight: 1.06,
              fontWeight: 400,
              letterSpacing: "-0.015em",
              color: "var(--md-fg-inverse)",
              textWrap: "balance",
              animation: "fadeIn 550ms cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          >
            {activeSlide.title}
          </h1>

          {/* Standfirst narrative */}
          <p
            key={`p-${activeSlide.id}`}
            style={{
              margin: 0,
              fontSize: "clamp(0.9375rem, 1.3vw, 1.125rem)",
              lineHeight: 1.75,
              color: "color-mix(in srgb, var(--md-fg-inverse) 88%, transparent)",
              maxWidth: "560px",
              animation: "fadeIn 650ms cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          >
            {activeSlide.standfirst}
          </p>

          {/* Editorial Custom CTAs */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "clamp(16px, 3vw, 32px)",
              paddingTop: "var(--md-space-3)",
              flexWrap: "wrap",
            }}
          >
            <Link
              href={`${marketPrefix}${activeSlide.ctaHref}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 12,
                padding: "15px 32px",
                background: "var(--md-champagne)",
                color: "var(--md-green-black)",
                fontSize: "0.75rem",
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                fontWeight: 600,
                textDecoration: "none",
                borderRadius: 0,
                boxShadow: "0 8px 24px -6px rgba(0, 0, 0, 0.45)",
                transition: "transform 180ms ease, background 180ms ease",
              }}
            >
              <span>{activeSlide.ctaText}</span>
              <span style={{ fontSize: "1rem", lineHeight: 1 }}>→</span>
            </Link>

            <Link
              href={`${marketPrefix}/our-story`}
              style={{
                fontSize: "0.75rem",
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: "var(--md-champagne)",
                textDecoration: "none",
                borderBottom: "1px solid var(--md-champagne)",
                paddingBottom: "3px",
                fontWeight: 500,
                transition: "opacity 180ms ease",
              }}
            >
              The 1961 Heritage · Johari Bazaar
            </Link>
          </div>
        </div>
      </div>

      {/* ── Slide Controls & Progress Dock (Bottom Right) ─────────── */}
      <div
        style={{
          position: "absolute",
          bottom: "clamp(20px, 4vw, 40px)",
          right: "var(--md-gutter)",
          zIndex: 4,
          display: "flex",
          alignItems: "center",
          gap: "clamp(12px, 2vw, 24px)",
          background: "rgba(4, 18, 12, 0.75)",
          backdropFilter: "blur(12px)",
          padding: "10px 20px",
          border: "1px solid color-mix(in srgb, var(--md-champagne) 28%, transparent)",
        }}
      >
        {/* Slide Counter (01 / 03) */}
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 4,
            fontSize: "0.8125rem",
            fontFamily: "var(--md-font-display)",
            letterSpacing: "0.1em",
            color: "var(--md-champagne)",
          }}
        >
          <span style={{ fontWeight: 600 }}>0{currentIdx + 1}</span>
          <span style={{ opacity: 0.5, fontSize: "0.6875rem" }}>/ 0{totalSlides}</span>
        </div>

        {/* Dynamic Progress Timer Line */}
        <div
          style={{
            width: "clamp(60px, 8vw, 110px)",
            height: 2,
            background: "rgba(255, 255, 255, 0.2)",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              height: "100%",
              width: `${progress}%`,
              background: "var(--md-champagne)",
              transition: isPaused ? "none" : "width 80ms linear",
            }}
          />
        </div>

        {/* Slide Selector Buttons */}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {CAMPAIGN_SLIDES.map((s, idx) => {
            const isSel = idx === currentIdx;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => goToSlide(idx)}
                aria-label={`Go to slide ${idx + 1}: ${s.title}`}
                style={{
                  width: isSel ? 22 : 8,
                  height: 6,
                  borderRadius: 0,
                  background: isSel ? "var(--md-champagne)" : "rgba(255, 255, 255, 0.3)",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  transition: "all 250ms ease",
                }}
              />
            );
          })}
        </div>

        {/* Prev / Next Arrows */}
        <div style={{ display: "flex", gap: 4, marginLeft: 8 }}>
          <button
            type="button"
            onClick={prevSlide}
            aria-label="Previous slide"
            style={{
              width: 32,
              height: 32,
              background: "transparent",
              border: "1px solid color-mix(in srgb, var(--md-champagne) 30%, transparent)",
              color: "var(--md-champagne)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "0.875rem",
              transition: "all 150ms ease",
            }}
          >
            ←
          </button>
          <button
            type="button"
            onClick={nextSlide}
            aria-label="Next slide"
            style={{
              width: 32,
              height: 32,
              background: "transparent",
              border: "1px solid color-mix(in srgb, var(--md-champagne) 30%, transparent)",
              color: "var(--md-champagne)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "0.875rem",
              transition: "all 150ms ease",
            }}
          >
            →
          </button>
        </div>
      </div>
    </section>
  );
}
