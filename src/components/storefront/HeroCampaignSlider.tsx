"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import Link from "next/link";

export type CampaignSlide = {
  id: string;
  subhead?: string;
  title?: string;
  standfirst?: string;
  ctaText?: string;
  ctaHref?: string;
  imageSrc: string;
  imageAlt: string;
  tag?: string;
  isVideo?: boolean;
  videoSrc?: string;
  videoMobileSrc?: string;
  videoPoster?: string;
};

const CAMPAIGN_SLIDES: CampaignSlide[] = [
  {
    id: "factory-craftsmanship-video",
    tag: "SILVERSMITHING & CRAFTSMANSHIP · EST. 1961",
    subhead: "Pure 925 Sterling Silver Factory Insights",
    title: "Pure 925 Sterling Silver Artistry",
    standfirst:
      "Watch our authentic silversmithing process: casting, rolling, precise filing, ultrasonic cleaning, and hand gemstone setting.",
    imageSrc: "/videos/banner-poster.jpg",
    imageAlt: "Millennium Designs 925 Sterling Silver Factory Craftsmanship Video",
    isVideo: true,
    videoSrc: "/videos/banner-1080p.mp4",
    videoMobileSrc: "/videos/banner-mobile.mp4",
    videoPoster: "/videos/banner-poster.jpg",
    ctaText: "Explore Pure Silver Collection",
    ctaHref: "/rings",
  },
  {
    id: "emerald-solitaire",
    tag: "HAUTE JOAILLERIE · EST. 1961",
    subhead: "Unheated Mineral Sovereignty",
    title: "Courtly Emeralds & Cold-Forged Silver",
    standfirst:
      "Rare unheated Colombian emeralds cradled in our proprietary anti-tarnish 925 sterling silver alloy. Hand-cast, faceted, and hallmarked on the bench.",
    imageSrc: "/images/hero/campaign_hero_1.jpg",
    imageAlt: "Courtly Colombian emerald solitaire ring forged in 925 sterling silver",
    ctaText: "View Emerald Collection",
    ctaHref: "/emerald",
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
    ctaText: "Explore Moonstones",
    ctaHref: "/moonstone",
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
    ctaText: "View Pendants",
    ctaHref: "/pendants",
  },
];

export function HeroCampaignSlider({
  slides = CAMPAIGN_SLIDES,
  autoIntervalMs = 7000,
  autoplayEnabled = true,
  textAlign = "left",
  overlayOpacity = 0.45,
  marketPrefix = "",
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
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Touch Swipe tracking for smartphones & tablets
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

  // Keyboard navigation (ArrowLeft / ArrowRight)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        prevSlide();
      } else if (e.key === "ArrowRight") {
        nextSlide();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [nextSlide, prevSlide]);

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
    const minSwipeDistance = 35;

    if (diff > minSwipeDistance) {
      nextSlide();
    } else if (diff < -minSwipeDistance) {
      prevSlide();
    }

    touchStartXRef.current = null;
    touchEndXRef.current = null;
  };

  const currentSlide = activeSlides[currentIdx] || activeSlides[0]!;
  const isCurrentVideo = Boolean(currentSlide?.isVideo || currentSlide?.videoSrc);
  const isCentered = textAlign === "center";
  const effectiveOpacity = Math.max(0.2, Math.min(overlayOpacity, 0.85));

  // Prefix CTA links with market if needed
  const resolveHref = (href?: string) => {
    if (!href) return "/";
    if (href.startsWith("http")) return href;
    const cleanHref = href.startsWith("/") ? href : `/${href}`;
    if (!marketPrefix) return cleanHref;
    const cleanPrefix = marketPrefix.replace(/\/$/, "");
    return `${cleanPrefix}${cleanHref}`;
  };

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
        maxWidth: "100vw",
        overflow: "hidden",
        background: isCurrentVideo ? "#F6F3EE" : "var(--md-green-black)",
        color: isCurrentVideo ? "#1a2a22" : "var(--md-fg-inverse)",
        transition: "background 500ms ease",
        // Perfect 16:9 adaptive aspect ratio ensures zero cropping/cutting on all screens
        aspectRatio: isCurrentVideo ? "16 / 9" : undefined,
        minHeight: isCurrentVideo ? "auto" : "clamp(460px, 66vh, 840px)",
        maxHeight: isCurrentVideo ? "calc(100vh - 80px)" : undefined,
        margin: "0 auto",
        display: "flex",
        alignItems: "center",
      }}
    >
      {/* ── Slide Media (Videos and Images) ─────────────────────────── */}
      {activeSlides.map((slide, idx) => {
        const isActive = idx === currentIdx;
        const isSlideVideo = Boolean(slide.isVideo || slide.videoSrc);

        return (
          <div
            key={slide.id || idx}
            aria-hidden={!isActive}
            style={{
              position: "absolute",
              inset: 0,
              opacity: isActive ? 1 : 0,
              visibility: isActive ? "visible" : "hidden",
              transition: "opacity 900ms cubic-bezier(0.16, 1, 0.3, 1), visibility 900ms",
              zIndex: isActive ? 2 : 1,
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: isSlideVideo ? "#F6F3EE" : "transparent",
            }}
          >
            {isSlideVideo ? (
              // Edge-to-Edge Uncropped Streamable Video Banner
              <div
                style={{
                  position: "relative",
                  width: "100%",
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <video
                  ref={isActive ? videoRef : undefined}
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="metadata"
                  poster={slide.videoPoster || "/videos/banner-poster.jpg"}
                  aria-label={slide.imageAlt || "Millennium Designs Pure 925 Sterling Silver Factory Insights"}
                  style={{
                    width: "100%",
                    height: "100%",
                    // Object-fit contain ensures ZERO cropping or cut edges on all aspect ratios
                    objectFit: "contain",
                    display: "block",
                  }}
                >
                  {slide.videoMobileSrc && (
                    <source
                      src={slide.videoMobileSrc}
                      media="(max-width: 768px)"
                      type="video/mp4"
                    />
                  )}
                  {slide.videoSrc && (
                    <source src={slide.videoSrc} type="video/mp4" />
                  )}
                  {/* Fallback Poster */}
                  <img
                    src={slide.videoPoster || "/videos/banner-poster.jpg"}
                    alt={slide.imageAlt}
                    style={{ width: "100%", height: "100%", objectFit: "contain" }}
                  />
                </video>

                {/* Subtle Luxury Floating Watermark Tag (Bottom Left) */}
                <div
                  style={{
                    position: "absolute",
                    bottom: "clamp(12px, 2.5vw, 24px)",
                    left: "clamp(12px, 3vw, 32px)",
                    zIndex: 5,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 14px",
                    borderRadius: 20,
                    background: "rgba(6, 35, 25, 0.85)",
                    backdropFilter: "blur(12px)",
                    WebkitBackdropFilter: "blur(12px)",
                    border: "1px solid rgba(232, 216, 185, 0.35)",
                    color: "var(--md-champagne, #e8d8b9)",
                    fontSize: "clamp(0.625rem, 1.4vw, 0.725rem)",
                    letterSpacing: "0.15em",
                    textTransform: "uppercase",
                    fontWeight: 600,
                    fontFamily: "var(--md-font-crest), Georgia, serif",
                    boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
                    pointerEvents: "auto",
                  }}
                >
                  <span style={{ color: "var(--md-gold, #c5a059)" }}>✦</span>
                  <span>{slide.tag || "CRAFTSMANSHIP & MASTERY · 925 STERLING SILVER"}</span>
                  {slide.ctaHref && (
                    <Link
                      href={resolveHref(slide.ctaHref)}
                      style={{
                        marginLeft: 6,
                        paddingLeft: 8,
                        borderLeft: "1px solid rgba(232, 216, 185, 0.35)",
                        color: "var(--md-champagne, #e8d8b9)",
                        textDecoration: "underline",
                        textUnderlineOffset: "3px",
                      }}
                    >
                      {slide.ctaText || "Shop Collection ↗"}
                    </Link>
                  )}
                </div>
              </div>
            ) : (
              // Luxury Haute Joaillerie Image Slide with Ken Burns Effect
              <>
                <Image
                  src={slide.imageSrc}
                  alt={slide.imageAlt}
                  fill
                  priority={idx <= 1}
                  sizes="100vw"
                  style={{
                    objectFit: "cover",
                    objectPosition: "center 42%",
                    transform: isActive ? "scale(1.04)" : "scale(1.0)",
                    transition: "transform 8500ms cubic-bezier(0.16, 1, 0.3, 1)",
                    filter: "brightness(0.92) contrast(1.04)",
                  }}
                />

                {/* Haute Joaillerie Luxury Vignette Gradient */}
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

                {/* Subtle bottom edge shadow */}
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    background:
                      "linear-gradient(to top, rgba(3, 15, 10, 0.65) 0%, transparent 22%)",
                  }}
                />
              </>
            )}
          </div>
        );
      })}

      {/* ── Foreground Editorial Typography (For Image Slides Only) ──── */}
      {!isCurrentVideo && (
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
              {currentSlide.tag && (
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
                  <span>{currentSlide.tag}</span>
                </span>
              )}

              {currentSlide.subhead && (
                <>
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
                    {currentSlide.subhead}
                  </span>
                </>
              )}
            </div>

            {/* Headline */}
            {currentSlide.title && (
              <h1
                key={currentSlide.id}
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
                {currentSlide.title}
              </h1>
            )}

            {/* Standfirst Narrative */}
            {currentSlide.standfirst && (
              <p
                key={`p-${currentSlide.id}`}
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
                {currentSlide.standfirst}
              </p>
            )}

            {/* Call to Action Button */}
            {currentSlide.ctaHref && (
              <div style={{ marginTop: 8 }}>
                <Link
                  href={resolveHref(currentSlide.ctaHref)}
                  className="md-btn-gold"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "12px 24px",
                    background: "var(--md-gold, #c5a059)",
                    color: "#062319",
                    fontWeight: 600,
                    fontSize: "0.8125rem",
                    letterSpacing: "0.15em",
                    textTransform: "uppercase",
                    border: "none",
                    borderRadius: 2,
                    textDecoration: "none",
                    transition: "all 300ms ease",
                    boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
                  }}
                >
                  <span>{currentSlide.ctaText || "Acquire Selected Work"}</span>
                  <span style={{ fontSize: "0.95rem" }}>→</span>
                </Link>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Slideable Controls: Next & Prev Arrows ───────────────────── */}
      {totalSlides > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              prevSlide();
            }}
            aria-label="Previous slide"
            style={{
              position: "absolute",
              left: "clamp(8px, 2vw, 24px)",
              top: "50%",
              transform: "translateY(-50%)",
              zIndex: 10,
              width: "clamp(36px, 4.2vw, 46px)",
              height: "clamp(36px, 4.2vw, 46px)",
              borderRadius: "50%",
              background: "rgba(6, 35, 25, 0.7)",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              border: "1px solid rgba(232, 216, 185, 0.4)",
              color: "var(--md-champagne, #e8d8b9)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              transition: "transform 200ms ease, background 200ms ease",
              boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-50%) scale(1.08)";
              e.currentTarget.style.background = "rgba(6, 35, 25, 0.95)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(-50%) scale(1.0)";
              e.currentTarget.style.background = "rgba(6, 35, 25, 0.7)";
            }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              nextSlide();
            }}
            aria-label="Next slide"
            style={{
              position: "absolute",
              right: "clamp(8px, 2vw, 24px)",
              top: "50%",
              transform: "translateY(-50%)",
              zIndex: 10,
              width: "clamp(36px, 4.2vw, 46px)",
              height: "clamp(36px, 4.2vw, 46px)",
              borderRadius: "50%",
              background: "rgba(6, 35, 25, 0.7)",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              border: "1px solid rgba(232, 216, 185, 0.4)",
              color: "var(--md-champagne, #e8d8b9)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              transition: "transform 200ms ease, background 200ms ease",
              boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-50%) scale(1.08)";
              e.currentTarget.style.background = "rgba(6, 35, 25, 0.95)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(-50%) scale(1.0)";
              e.currentTarget.style.background = "rgba(6, 35, 25, 0.7)";
            }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </>
      )}

      {/* ── Slideable Controls: Bottom Dots / Pills Indicator ────────── */}
      {totalSlides > 1 && (
        <div
          style={{
            position: "absolute",
            bottom: "clamp(12px, 2vw, 22px)",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 10,
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "5px 12px",
            borderRadius: 24,
            background: "rgba(6, 35, 25, 0.85)",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
            border: "1px solid rgba(232, 216, 185, 0.3)",
            boxShadow: "0 4px 14px rgba(0,0,0,0.3)",
          }}
        >
          {activeSlides.map((s, i) => {
            const isSlideActive = i === currentIdx;
            return (
              <button
                key={s.id || i}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setCurrentIdx(i);
                }}
                aria-label={`Go to slide ${i + 1}`}
                style={{
                  width: isSlideActive ? 24 : 7,
                  height: 7,
                  borderRadius: 4,
                  background: isSlideActive
                    ? "var(--md-gold, #c5a059)"
                    : "rgba(255, 255, 255, 0.35)",
                  border: "none",
                  cursor: "pointer",
                  transition: "all 300ms cubic-bezier(0.16, 1, 0.3, 1)",
                  padding: 0,
                }}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}
