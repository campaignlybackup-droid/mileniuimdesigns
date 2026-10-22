"use client";

import React, { useState, useEffect, useRef } from "react";
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
  videoMobilePoster?: string;
};

const CAMPAIGN_SLIDES: CampaignSlide[] = [
  {
    id: "factory-craftsmanship-video",
    tag: "SILVERSMITHING & CRAFTSMANSHIP · EST. 1961",
    subhead: "Pure 925 Sterling Silver Factory Insights",
    title: "Pure 925 Sterling Silver Artistry",
    standfirst:
      "Watch our authentic silversmithing process: casting, rolling, precise filing, ultrasonic cleaning, and hand gemstone setting.",
    imageSrc: "/videos/banner-poster.webp",
    imageAlt: "Millennium Designs 925 Sterling Silver Factory Craftsmanship Video",
    isVideo: true,
    videoSrc: "/videos/banner-loop-720p.mp4",
    videoMobileSrc: "/videos/banner-loop-mobile.mp4",
    videoPoster: "/videos/banner-poster.webp",
    videoMobilePoster: "/videos/banner-poster-mobile.webp",
    ctaText: "Explore Pure Silver Collection",
    ctaHref: "/rings",
  },
];

export interface HeroCampaignSliderProps {
  marketPrefix?: string;
  slides?: CampaignSlide[];
  autoIntervalMs?: number;
  autoplayEnabled?: boolean;
  textAlign?: "left" | "center";
  overlayOpacity?: number;
}

export function HeroCampaignSlider({
  slides = CAMPAIGN_SLIDES,
  marketPrefix = "",
}: HeroCampaignSliderProps): React.JSX.Element {
  // Always isolate the video slide, discarding all other slides and carousel state
  const rawSlides = slides && slides.length > 0 ? slides : CAMPAIGN_SLIDES;
  const videoSlide =
    rawSlides.find((s) => Boolean(s.isVideo || s.videoSrc)) ||
    rawSlides[0] ||
    CAMPAIGN_SLIDES[0]!;

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);

  // Responsive device detection for seamless mobile/desktop media serving
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(typeof window !== "undefined" && window.innerWidth <= 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Strict muted autoplay policy execution
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.defaultMuted = true;
      videoRef.current.muted = true;
      videoRef.current.play().catch(() => {
        // Handle browser autoplay policy restrictions gracefully
      });
    }
  }, [isMobile]);

  // Prefix CTA links with market if needed
  const resolveHref = (href?: string) => {
    if (!href) return "/";
    if (href.startsWith("http")) return href;
    const cleanHref = href.startsWith("/") ? href : `/${href}`;
    if (!marketPrefix) return cleanHref;
    const cleanPrefix = marketPrefix.replace(/\/$/, "");
    return `${cleanPrefix}${cleanHref}`;
  };

  const activePoster =
    isMobile && videoSlide.videoMobilePoster
      ? videoSlide.videoMobilePoster
      : videoSlide.videoPoster || "/videos/banner-poster.webp";

  const videoDesktopSrc = videoSlide.videoSrc || "/videos/banner-loop-720p.mp4";
  const videoMobileSrc = videoSlide.videoMobileSrc || "/videos/banner-loop-mobile.mp4";

  return (
    <section
      data-surface="emerald-deep"
      aria-label="Millennium Designs Pure 925 Sterling Silver Factory Video"
      className="md-hero-section is-video-banner"
      style={{
        position: "relative",
        width: "100%",
        maxWidth: "100vw",
        overflow: "hidden",
        background: "var(--md-bg-raised)",
        color: "var(--md-fg)",
        aspectRatio: isMobile ? "1 / 1" : "16 / 9",
        minHeight: "auto",
        maxHeight: isMobile ? "85vh" : "calc(100vh - 80px)",
        margin: "0 auto",
        display: "flex",
        alignItems: "center",
      }}
    >
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        <video
          ref={videoRef}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          poster={activePoster}
          onPlaying={() => {
            setIsVideoPlaying(true);
            setIsBuffering(false);
          }}
          onWaiting={() => setIsBuffering(true)}
          onCanPlay={() => setIsBuffering(false)}
          aria-label={
            videoSlide.imageAlt ||
            "Millennium Designs Pure 925 Sterling Silver Factory Insights"
          }
          className="md-hero-video-element"
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "center center",
            display: "block",
          }}
        >
          {videoMobileSrc && (
            <source
              src={videoMobileSrc}
              media="(max-width: 768px)"
              type="video/mp4"
            />
          )}
          {videoDesktopSrc && (
            <source src={videoDesktopSrc} type="video/mp4" />
          )}
        </video>

        {/* Instant Zero-Delay Preloaded Poster Overlay */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 1,
            pointerEvents: "none",
            opacity: isVideoPlaying ? 0 : 1,
            transition: "opacity 450ms ease",
            background: "var(--md-bg-raised)",
          }}
          aria-hidden="true"
        >
          <img
            src={activePoster}
            alt={videoSlide.imageAlt || "Millennium Designs Silver Craftsmanship"}
            loading="eager"
            decoding="async"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: "center center",
              display: "block",
            }}
          />

          {/* Luxury Loading Indicator during mandatory network buffering */}
          {isBuffering && (
            <div
              style={{
                position: "absolute",
                bottom: "clamp(12px, 2.5vw, 24px)",
                right: "clamp(12px, 3vw, 32px)",
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 14px",
                borderRadius: 20,
                background: "color-mix(in srgb, var(--md-green-dark) 85%, transparent)",
                backdropFilter: "blur(10px)",
                WebkitBackdropFilter: "blur(10px)",
                border: "1px solid color-mix(in srgb, var(--md-champagne) 30%, transparent)",
                color: "var(--md-champagne)",
                fontSize: "0.6875rem",
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                fontFamily: "var(--md-font-crest), Georgia, serif",
                boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "var(--md-champagne)",
                }}
              />
              <span>✦ Loading Reel...</span>
            </div>
          )}
        </div>

        {/* Subtle Luxury Floating Watermark Tag (Bottom Left, Desktop) */}
        <div
          style={{
            position: "absolute",
            bottom: "clamp(12px, 2.5vw, 24px)",
            left: "clamp(12px, 3vw, 32px)",
            zIndex: 5,
            display: isMobile ? "none" : "flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 14px",
            borderRadius: 20,
            background: "color-mix(in srgb, var(--md-green-dark) 85%, transparent)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            border: "1px solid color-mix(in srgb, var(--md-champagne) 35%, transparent)",
            color: "var(--md-champagne)",
            fontSize: "clamp(0.625rem, 1.4vw, 0.725rem)",
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            fontWeight: 600,
            fontFamily: "var(--md-font-crest), Georgia, serif",
            boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
            pointerEvents: "auto",
          }}
        >
          <span style={{ color: "var(--md-champagne)" }}>✦</span>
          <span>{videoSlide.tag || "CRAFTSMANSHIP & MASTERY · 925 STERLING SILVER"}</span>
          {videoSlide.ctaHref && (
            <Link
              href={resolveHref(videoSlide.ctaHref)}
              style={{
                marginLeft: 6,
                paddingLeft: 8,
                borderLeft: "1px solid color-mix(in srgb, var(--md-champagne) 35%, transparent)",
                color: "var(--md-champagne)",
                textDecoration: "underline",
                textUnderlineOffset: "3px",
              }}
            >
              {videoSlide.ctaText || "Shop Collection ↗"}
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}

export const HeroVideoBanner = HeroCampaignSlider;
