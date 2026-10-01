"use client";

import React, { useState, useEffect, useCallback } from "react";
import Image from "next/image";

export interface ExhibitionPhoto {
  id: string;
  image: string;
  fullImage: string;
  alt: string;
}

const EXHIBITION_PHOTOS: ExhibitionPhoto[] = [
  {
    id: "tucson-usa-booth",
    image: "/images/exhibitions/tucson-usa-booth.webp",
    fullImage: "/images/exhibitions/tucson-usa-booth.webp",
    alt: "Millennium Designs Silver Reflections exhibition showcase at Tucson Gem Show, USA",
  },
  {
    id: "italy-europe-gemstones",
    image: "/images/exhibitions/italy-europe-gemstones.webp",
    fullImage: "/images/exhibitions/italy-europe-gemstones.webp",
    alt: "Exhibition display of sterling silver jewellery and natural gemstones in Italy",
  },
  {
    id: "international-pavilion-aisle",
    image: "/images/exhibitions/international-pavilion-aisle-landscape.webp",
    fullImage: "/images/exhibitions/international-pavilion-aisle.webp",
    alt: "International jewellery trade salon showcase in Europe",
  },
  {
    id: "tucson-usa-salon",
    image: "/images/exhibitions/tucson-usa-booth.webp",
    fullImage: "/images/exhibitions/tucson-usa-booth.webp",
    alt: "Handcrafted 925 sterling silver fine jewellery at international exhibition",
  },
  {
    id: "italy-mediterranean-forum",
    image: "/images/exhibitions/italy-europe-gemstones.webp",
    fullImage: "/images/exhibitions/italy-europe-gemstones.webp",
    alt: "Artisan silversmithing and gemstones presented at European trade fairs",
  },
  {
    id: "continental-trade-fair",
    image: "/images/exhibitions/international-pavilion-aisle-landscape.webp",
    fullImage: "/images/exhibitions/international-pavilion-aisle.webp",
    alt: "Millennium Designs trade salon booth and jewelry showcases",
  },
];

export function ExhibitionShowcase(): React.JSX.Element {
  const [activePhotoIndex, setActivePhotoIndex] = useState<number | null>(null);

  const activePhoto = activePhotoIndex !== null ? EXHIBITION_PHOTOS[activePhotoIndex] : null;

  // Keyboard navigation for lightbox (Esc to close, Left/Right arrows to browse)
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setActivePhotoIndex(null);
      } else if (e.key === "ArrowRight") {
        setActivePhotoIndex((prev) =>
          prev !== null ? (prev + 1) % EXHIBITION_PHOTOS.length : null
        );
      } else if (e.key === "ArrowLeft") {
        setActivePhotoIndex((prev) =>
          prev !== null ? (prev - 1 + EXHIBITION_PHOTOS.length) % EXHIBITION_PHOTOS.length : null
        );
      }
    },
    []
  );

  useEffect(() => {
    if (activePhotoIndex !== null) {
      window.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [activePhotoIndex, handleKeyDown]);

  return (
    <section
      id="exhibitions"
      aria-label="International Exhibitions & Trade Salons"
      style={{
        width: "100%",
        borderTop: "1px solid var(--md-rule)",
        borderBottom: "1px solid var(--md-rule)",
        background: "var(--md-bg-raised)",
        paddingBlock: "clamp(48px, 6vw, 80px)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* ── Section Header ────────────────────────────────────────────── */}
      <div
        style={{
          maxWidth: "var(--md-container)",
          marginInline: "auto",
          paddingInline: "var(--md-gutter)",
          marginBottom: "clamp(24px, 3.5vw, 40px)",
          textAlign: "center",
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
            marginBottom: 8,
            fontFamily: "var(--md-font-crest), Georgia, serif",
          }}
        >
          ✦ GLOBAL PRESENCE · USA · ITALY · EUROPE ✦
        </span>
        <h2
          style={{
            margin: "0 0 10px",
            fontFamily: "var(--md-font-display)",
            fontSize: "clamp(1.6rem, 3.5vw, 2.75rem)",
            fontWeight: 400,
            color: "var(--md-fg)",
            letterSpacing: "-0.01em",
            lineHeight: 1.18,
          }}
        >
          International Exhibitions &amp; Trade Salons
        </h2>
        <p
          style={{
            margin: "0 auto",
            fontSize: "clamp(0.875rem, 1.1vw, 0.9375rem)",
            lineHeight: 1.65,
            color: "var(--md-fg-secondary)",
            maxWidth: "680px",
          }}
        >
          Showcasing sixty-five years of Jaipur bench silversmithing across premier international jewellery salons in Tucson (USA), Vicenza &amp; Tuscany (Italy), and Europe.
        </p>
      </div>

      {/* ── Seamless Moving Photos Marquee (Right to Left) ─────────────── */}
      <div
        className="md-exhibition-marquee-wrapper"
        style={{
          position: "relative",
          width: "100%",
          overflow: "hidden",
          paddingBlock: "10px",
        }}
      >
        {/* Soft edge fade masks for smooth entrance/exit */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            bottom: 0,
            width: "clamp(24px, 6vw, 100px)",
            background: "linear-gradient(to right, var(--md-bg-raised), transparent)",
            zIndex: 3,
            pointerEvents: "none",
          }}
        />
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            width: "clamp(24px, 6vw, 100px)",
            background: "linear-gradient(to left, var(--md-bg-raised), transparent)",
            zIndex: 3,
            pointerEvents: "none",
          }}
        />

        {/* Marquee Track: Two identical sequences for continuous, seamless right-to-left glide */}
        <div
          className="md-exhibition-marquee-track"
          style={{
            display: "flex",
            width: "max-content",
          }}
        >
          {/* Primary Sequence */}
          <div
            className="md-exhibition-marquee-sequence"
            style={{
              display: "flex",
              gap: 24,
              paddingRight: 24,
              willChange: "transform",
            }}
          >
            {EXHIBITION_PHOTOS.map((item, index) => (
              <div
                key={`${item.id}-seq1-${index}`}
                role="button"
                tabIndex={0}
                aria-label={`View exhibition photo: ${item.alt}`}
                onClick={() => setActivePhotoIndex(index)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setActivePhotoIndex(index);
                  }
                }}
                className="md-exhibition-card"
                style={{
                  position: "relative",
                  flex: "0 0 clamp(320px, 36vw, 520px)",
                  height: "clamp(240px, 28vw, 360px)",
                  background: "var(--md-forest)",
                  borderRadius: "var(--md-radius-sm)",
                  overflow: "hidden",
                  border: "1px solid var(--md-rule)",
                  boxShadow: "0 4px 20px rgba(0,0,0,0.06)",
                  cursor: "pointer",
                  transition: "transform 280ms ease, border-color 280ms ease, box-shadow 280ms ease",
                }}
              >
                <Image
                  src={item.image}
                  alt={item.alt}
                  fill
                  sizes="(max-width: 640px) 320px, (max-width: 1024px) 40vw, 520px"
                  style={{
                    objectFit: "cover",
                    objectPosition: "center center",
                    transition: "transform 400ms ease",
                  }}
                  className="md-exhibition-img"
                  loading={index < 3 ? "eager" : "lazy"}
                  priority={index === 0}
                />
              </div>
            ))}
          </div>

          {/* Secondary Duplicate Sequence (Seamless loop) */}
          <div
            aria-hidden="true"
            className="md-exhibition-marquee-sequence"
            style={{
              display: "flex",
              gap: 24,
              paddingRight: 24,
              willChange: "transform",
            }}
          >
            {EXHIBITION_PHOTOS.map((item, index) => (
              <div
                key={`${item.id}-seq2-${index}`}
                role="button"
                tabIndex={-1}
                onClick={() => setActivePhotoIndex(index)}
                className="md-exhibition-card"
                style={{
                  position: "relative",
                  flex: "0 0 clamp(320px, 36vw, 520px)",
                  height: "clamp(240px, 28vw, 360px)",
                  background: "var(--md-forest)",
                  borderRadius: "var(--md-radius-sm)",
                  overflow: "hidden",
                  border: "1px solid var(--md-rule)",
                  boxShadow: "0 4px 20px rgba(0,0,0,0.06)",
                  cursor: "pointer",
                  transition: "transform 280ms ease, border-color 280ms ease, box-shadow 280ms ease",
                }}
              >
                <Image
                  src={item.image}
                  alt={item.alt}
                  fill
                  sizes="(max-width: 640px) 320px, (max-width: 1024px) 40vw, 520px"
                  style={{
                    objectFit: "cover",
                    objectPosition: "center center",
                    transition: "transform 400ms ease",
                  }}
                  className="md-exhibition-img"
                  loading="lazy"
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── High-Definition Lightbox Modal ─────────────────────────────── */}
      {activePhoto && activePhotoIndex !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={activePhoto.alt}
          onClick={() => setActivePhotoIndex(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(4, 19, 13, 0.94)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "clamp(16px, 4vw, 40px)",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "relative",
              width: "100%",
              maxWidth: "1080px",
              maxHeight: "90vh",
              background: "transparent",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            {/* Minimal Close Button */}
            <button
              type="button"
              onClick={() => setActivePhotoIndex(null)}
              aria-label="Close modal"
              style={{
                position: "absolute",
                top: 8,
                right: 8,
                zIndex: 10,
                background: "rgba(0, 0, 0, 0.65)",
                border: "1px solid var(--md-rule-strong)",
                borderRadius: "50%",
                color: "var(--md-fg-inverse)",
                width: 36,
                height: 36,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                fontSize: "1.1rem",
                lineHeight: 1,
                transition: "background 150ms ease",
              }}
            >
              ✕
            </button>

            {/* Previous Photo Button */}
            <button
              type="button"
              onClick={() =>
                setActivePhotoIndex((prev) =>
                  prev !== null
                    ? (prev - 1 + EXHIBITION_PHOTOS.length) % EXHIBITION_PHOTOS.length
                    : null
                )
              }
              aria-label="Previous exhibition photo"
              style={{
                position: "absolute",
                left: 8,
                top: "50%",
                transform: "translateY(-50%)",
                zIndex: 10,
                background: "rgba(0, 0, 0, 0.65)",
                border: "1px solid var(--md-rule-strong)",
                borderRadius: "50%",
                color: "var(--md-fg-inverse)",
                width: 44,
                height: 44,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "1.25rem",
                transition: "background 150ms ease",
              }}
            >
              ‹
            </button>

            {/* Next Photo Button */}
            <button
              type="button"
              onClick={() =>
                setActivePhotoIndex((prev) =>
                  prev !== null ? (prev + 1) % EXHIBITION_PHOTOS.length : null
                )
              }
              aria-label="Next exhibition photo"
              style={{
                position: "absolute",
                right: 8,
                top: "50%",
                transform: "translateY(-50%)",
                zIndex: 10,
                background: "rgba(0, 0, 0, 0.65)",
                border: "1px solid var(--md-rule-strong)",
                borderRadius: "50%",
                color: "var(--md-fg-inverse)",
                width: 44,
                height: 44,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "1.25rem",
                transition: "background 150ms ease",
              }}
            >
              ›
            </button>

            {/* Full Uncropped Photo Frame */}
            <div
              style={{
                position: "relative",
                width: "100%",
                height: "82vh",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Image
                src={activePhoto.fullImage}
                alt={activePhoto.alt}
                fill
                priority
                sizes="(max-width: 1200px) 100vw, 1080px"
                style={{
                  objectFit: "contain",
                }}
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
