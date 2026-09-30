"use client";

import React, { useState, useEffect, useCallback } from "react";
import Image from "next/image";

export interface ExhibitionItem {
  id: string;
  city: string;
  country: string;
  badge: string;
  title: string;
  category: string;
  image: string;
  fullImage: string;
  blurDataUrl: string;
  alt: string;
  description: string;
  highlight: string;
}

const EXHIBITION_ITEMS: ExhibitionItem[] = [
  {
    id: "tucson-usa-gem-show",
    city: "Tucson (Tuscan Show), Arizona",
    country: "USA",
    badge: "USA · TUCSON / TUSCAN",
    title: "Tucson Gem & Mineral Showcase",
    category: "World's Premier Mineral & Gem Expo",
    image: "/images/exhibitions/tucson-usa-booth.webp",
    fullImage: "/images/exhibitions/tucson-usa-booth.webp",
    blurDataUrl:
      "data:image/webp;base64,UklGRlIAAABXRUJQVlA4IEYAAACwAQCdASoQAAkABABoJZQAAq9QroEgAP6+hY6TkLsNfCofqAzz5sg9htYE0tKajb1/TrfSH2kh7+u+xrJ/ToZoqRWrKCgA",
    alt: "Millennium Designs Silver Reflections exhibition booth at Tucson Gem Show, Arizona, USA",
    description:
      "Presenting our signature anti-tarnish 925 sterling silver collections and unheated natural gemstone jewelry at the world-renowned Tucson Gem & Mineral Showcase in Arizona, USA. Meeting American boutique curators, gallery owners, and wholesale gem collectors.",
    highlight: "Silver Reflections Booth · Tucson, AZ (USA)",
  },
  {
    id: "vicenza-italy-expo",
    city: "Vicenza & Tuscany",
    country: "Italy",
    badge: "ITALY · VICENZA & TUSCANY",
    title: "Vicenzaoro Fine Jewellery Expo",
    category: "European Gold & Silver Fair",
    image: "/images/exhibitions/italy-europe-gemstones.webp",
    fullImage: "/images/exhibitions/italy-europe-gemstones.webp",
    blurDataUrl:
      "data:image/webp;base64,UklGRl4AAABXRUJQVlA4IFIAAACwAQCdASoQAAkABABoJZwAAcbXFWwAAP7ZqwGUD3+jO+zhmI1zxQTmVMqjXoCfG84BS2FkowyzQLUluFXGHmW4iQ7P33uPZ/gHQmkZBQhAAAAA",
    alt: "Natural gemstone collections and silver jewelry at Vicenzaoro exhibition in Italy",
    description:
      "Exhibiting handcrafted natural gemstone jewelry, chakra stones, and solid sterling silver to European boutique owners and luxury collectors at Italy's historic jewellery capital.",
    highlight: "European Lapidary Pavilion · Vicenza, Italy",
  },
  {
    id: "europe-continental-pavilion",
    city: "Milan & Munich",
    country: "Europe",
    badge: "EUROPEAN SHOWCASE",
    title: "Continental European Trade Fair",
    category: "International Fine Jewellery Salon",
    image: "/images/exhibitions/international-pavilion-aisle.webp",
    fullImage: "/images/exhibitions/international-pavilion-aisle.webp",
    blurDataUrl:
      "data:image/webp;base64,UklGRmIAAABXRUJQVlA4IFYAAACwAQCdASoQAAoABABoJZwAAaX1wdnYAP3jZZ21RWzcUni/uI8L9/FUEOe0YC+QB/uJxIteWXG31hCgX1riL8ekidmPe9fK4htNPNp827YnSDYcQ+BAAA==",
    alt: "Exhibition aisle showcasing handcrafted sterling silver collections in Europe",
    description:
      "Bringing sixty-five years of Jaipur bench silversmithing to prestigious European trade halls, connecting family-run atelier craftsmanship directly with continental jewellery houses.",
    highlight: "Continental Trade Circuit · Europe",
  },
  {
    id: "tucson-usa-grand-salon",
    city: "Tucson, Arizona",
    country: "USA",
    badge: "USA · WHOLESALE SALON",
    title: "Tucson International Showcase",
    category: "Wholesale & Collector Exchange",
    image: "/images/exhibitions/tucson-usa-booth.webp",
    fullImage: "/images/exhibitions/tucson-usa-booth.webp",
    blurDataUrl:
      "data:image/webp;base64,UklGRlIAAABXRUJQVlA4IEYAAACwAQCdASoQAAkABABoJZQAAq9QroEgAP6+hY6TkLsNfCofqAzz5sg9htYE0tKajb1/TrfSH2kh7+u+xrJ/ToZoqRWrKCgA",
    alt: "Millennium Designs international showcase at Tucson Gem Show, Arizona",
    description:
      "Direct from our Jaipur foundry to American retail partners, showcasing thousand-piece collections of natural emeralds, rainbow moonstones, and untreated sapphires in solid silver.",
    highlight: "Annual US Gem Circuit · Arizona, USA",
  },
  {
    id: "italy-mediterranean-forum",
    city: "Vicenza & Arezzo",
    country: "Italy",
    badge: "ITALY · MEDITERRANEAN",
    title: "Italian Lapidary & Gem Forum",
    category: "Mediterranean Artisan Showcase",
    image: "/images/exhibitions/italy-europe-gemstones.webp",
    fullImage: "/images/exhibitions/italy-europe-gemstones.webp",
    blurDataUrl:
      "data:image/webp;base64,UklGRl4AAABXRUJQVlA4IFIAAACwAQCdASoQAAkABABoJZwAAcbXFWwAAP7ZqwGUD3+jO+zhmI1zxQTmVMqjXoCfG84BS2FkowyzQLUluFXGHmW4iQ7P33uPZ/gHQmkZBQhAAAAA",
    alt: "Exhibition display of silver jewelry and gemstones in Italy",
    description:
      "Curating certified natural minerals and anti-tarnish sterling silver creations tailored for Italian and European fine jewellery connoisseurs seeking direct-from-source authenticity.",
    highlight: "Mediterranean Jewellery Fair · Italy",
  },
  {
    id: "international-artisan-aisle",
    city: "Global Pavilions",
    country: "USA · Europe · Italy",
    badge: "GLOBAL CIRCUIT",
    title: "International Silver & Lapidary Expo",
    category: "Global Trade Delegation",
    image: "/images/exhibitions/international-pavilion-aisle.webp",
    fullImage: "/images/exhibitions/international-pavilion-aisle.webp",
    blurDataUrl:
      "data:image/webp;base64,UklGRmIAAABXRUJQVlA4IFYAAACwAQCdASoQAAoABABoJZwAAaX1wdnYAP3jZZ21RWzcUni/uI8L9/FUEOe0YC+QB/uJxIteWXG31hCgX1riL8ekidmPe9fK4htNPNp827YnSDYcQ+BAAA==",
    alt: "Exhibition booth showcasing Jaipur bench craftsmanship internationally",
    description:
      "Three generations of fine jewellery excellence presented annually across premier exhibitions in the United States, Italy, and Europe. Family-owned and handmade under one roof in Jaipur since 1961.",
    highlight: "Worldwide Collector Salons",
  },
];

export function ExhibitionShowcase(): React.JSX.Element {
  const [isPaused, setIsPaused] = useState(false);
  const [activeItemIndex, setActiveItemIndex] = useState<number | null>(null);

  const activeItem = activeItemIndex !== null ? EXHIBITION_ITEMS[activeItemIndex] : null;

  // Keyboard navigation for modal (Esc to close, Left/Right arrows to navigate)
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setActiveItemIndex(null);
      } else if (e.key === "ArrowRight") {
        setActiveItemIndex((prev) =>
          prev !== null ? (prev + 1) % EXHIBITION_ITEMS.length : null
        );
      } else if (e.key === "ArrowLeft") {
        setActiveItemIndex((prev) =>
          prev !== null ? (prev - 1 + EXHIBITION_ITEMS.length) % EXHIBITION_ITEMS.length : null
        );
      }
    },
    []
  );

  useEffect(() => {
    if (activeItemIndex !== null) {
      window.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [activeItemIndex, handleKeyDown]);

  return (
    <section
      id="exhibitions"
      aria-label="Global Exhibitions & Trade Fairs"
      style={{
        width: "100%",
        borderTop: "1px solid var(--md-rule)",
        borderBottom: "1px solid var(--md-rule)",
        background: "var(--md-bg-raised)",
        paddingBlock: "clamp(48px, 6vw, 84px)",
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
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          flexWrap: "wrap",
          gap: "16px",
        }}
      >
        <div style={{ maxWidth: "720px" }}>
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
              margin: "0 0 12px",
              fontFamily: "var(--md-font-display)",
              fontSize: "clamp(1.5rem, 3.4vw, 2.75rem)",
              fontWeight: 400,
              color: "var(--md-fg)",
              letterSpacing: "-0.01em",
              lineHeight: 1.15,
            }}
          >
            International Exhibitions &amp; Trade Salons
          </h2>
          <p
            style={{
              margin: 0,
              fontSize: "clamp(0.875rem, 1.1vw, 0.9375rem)",
              lineHeight: 1.68,
              color: "var(--md-fg-secondary)",
              maxWidth: "620px",
            }}
          >
            From our family bench in Jaipur to premier exhibitions in Tucson (USA), Vicenza &amp; Tuscany (Italy),
            and across Europe. Discover our international booths where collectors and fine jewellery
            boutiques meet three generations of lapidary mastery.
          </p>
        </div>

        {/* Animation Play/Pause & Speed indicator */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
          }}
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "6px 14px",
              borderRadius: "var(--md-radius-pill)",
              background: "var(--md-bg)",
              border: "1px solid var(--md-rule)",
              fontSize: "0.6875rem",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--md-fg-secondary)",
              fontWeight: 600,
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: isPaused ? "var(--md-taupe)" : "var(--md-green)",
                boxShadow: isPaused ? "none" : "0 0 8px var(--md-green)",
                transition: "background 200ms ease",
              }}
            />
            <span>{isPaused ? "Paused" : "Live Showcase"}</span>
          </div>

          <button
            type="button"
            onClick={() => setIsPaused((prev) => !prev)}
            aria-label={isPaused ? "Resume exhibition animation" : "Pause exhibition animation"}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              height: 36,
              paddingInline: "16px",
              background: "var(--md-bg)",
              border: "1px solid var(--md-rule)",
              borderRadius: "var(--md-radius-sm)",
              fontSize: "0.6875rem",
              fontWeight: 600,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--md-fg)",
              cursor: "pointer",
              transition: "border-color 160ms ease, background 160ms ease",
            }}
          >
            {isPaused ? "▶ Resume" : "❚❚ Pause"}
          </button>
        </div>
      </div>

      {/* ── Mathematically Seamless Infinite Marquee (Right to Left) ───── */}
      <div
        className="md-exhibition-marquee-wrapper"
        style={{
          position: "relative",
          width: "100%",
          overflow: "hidden",
          paddingBlock: "8px",
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

        {/* Marquee Track: Two identical sequences moving -100% for 100% seamless continuity */}
        <div
          className="md-exhibition-marquee-track"
          style={{
            display: "flex",
            width: "max-content",
          }}
        >
          {/* Primary Sequence */}
          <div
            className={`md-exhibition-marquee-sequence ${isPaused ? "is-paused" : ""}`}
            style={{
              display: "flex",
              gap: 20,
              paddingRight: 20,
              willChange: "transform",
            }}
          >
            {EXHIBITION_ITEMS.map((item, index) => (
              <ExhibitionCard
                key={`${item.id}-seq1-${index}`}
                item={item}
                onSelect={() => setActiveItemIndex(index)}
              />
            ))}
          </div>

          {/* Secondary Duplicate Sequence (Seamless loop) */}
          <div
            aria-hidden="true"
            className={`md-exhibition-marquee-sequence ${isPaused ? "is-paused" : ""}`}
            style={{
              display: "flex",
              gap: 20,
              paddingRight: 20,
              willChange: "transform",
            }}
          >
            {EXHIBITION_ITEMS.map((item, index) => (
              <ExhibitionCard
                key={`${item.id}-seq2-${index}`}
                item={item}
                isDuplicate
                onSelect={() => setActiveItemIndex(index)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ── Provenance Badges Ribbon ─────────────────────────────────── */}
      <div
        style={{
          maxWidth: "var(--md-container)",
          marginInline: "auto",
          paddingInline: "var(--md-gutter)",
          marginTop: "clamp(24px, 3.5vw, 36px)",
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          alignItems: "center",
          gap: "clamp(16px, 3.5vw, 36px)",
          fontSize: "0.75rem",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "var(--md-fg-secondary)",
          fontWeight: 500,
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ color: "var(--md-gold-antique)" }}>✦</span>
          <span>Tucson Gem Show, Arizona · USA</span>
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ color: "var(--md-gold-antique)" }}>✦</span>
          <span>Vicenzaoro Fair &amp; Tuscany · Italy</span>
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ color: "var(--md-gold-antique)" }}>✦</span>
          <span>European Continental Pavilions</span>
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ color: "var(--md-gold-antique)" }}>✦</span>
          <span>Solid 925 Sterling Silver</span>
        </span>
      </div>

      {/* ── Interactive Lightbox Modal ───────────────────────────────── */}
      {activeItem && activeItemIndex !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={activeItem.title}
          onClick={() => setActiveItemIndex(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(4, 19, 13, 0.92)",
            backdropFilter: "blur(12px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "clamp(16px, 4vw, 40px)",
            animation: "fadeIn 200ms ease",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "relative",
              width: "100%",
              maxWidth: "920px",
              maxHeight: "92vh",
              background: "var(--md-bg)",
              borderRadius: "var(--md-radius-sm)",
              border: "1px solid color-mix(in srgb, var(--md-champagne) 35%, transparent)",
              boxShadow: "0 24px 64px -12px rgba(0,0,0,0.6)",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "14px 20px",
                borderBottom: "1px solid var(--md-rule)",
                background: "var(--md-bg-raised)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span
                  style={{
                    fontSize: "0.625rem",
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    padding: "4px 10px",
                    background: "var(--md-forest)",
                    color: "var(--md-champagne)",
                    borderRadius: "var(--md-radius-pill)",
                    fontWeight: 600,
                  }}
                >
                  {activeItem.badge}
                </span>
                <span
                  style={{
                    fontSize: "0.8125rem",
                    color: "var(--md-fg)",
                    fontWeight: 600,
                    letterSpacing: "0.02em",
                  }}
                >
                  {activeItem.city}, {activeItem.country}
                </span>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  type="button"
                  onClick={() =>
                    setActiveItemIndex((prev) =>
                      prev !== null
                        ? (prev - 1 + EXHIBITION_ITEMS.length) % EXHIBITION_ITEMS.length
                        : null
                    )
                  }
                  aria-label="Previous exhibition photo"
                  style={{
                    background: "transparent",
                    border: "1px solid var(--md-rule)",
                    borderRadius: "var(--md-radius-sm)",
                    color: "var(--md-fg)",
                    width: 32,
                    height: 32,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "0.875rem",
                  }}
                >
                  ←
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setActiveItemIndex((prev) =>
                      prev !== null ? (prev + 1) % EXHIBITION_ITEMS.length : null
                    )
                  }
                  aria-label="Next exhibition photo"
                  style={{
                    background: "transparent",
                    border: "1px solid var(--md-rule)",
                    borderRadius: "var(--md-radius-sm)",
                    color: "var(--md-fg)",
                    width: 32,
                    height: 32,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "0.875rem",
                  }}
                >
                  →
                </button>
                <button
                  type="button"
                  onClick={() => setActiveItemIndex(null)}
                  aria-label="Close modal"
                  style={{
                    background: "transparent",
                    border: "none",
                    fontSize: "1.25rem",
                    lineHeight: 1,
                    color: "var(--md-fg)",
                    cursor: "pointer",
                    padding: 8,
                    borderRadius: "var(--md-radius-sm)",
                  }}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Modal Photo Frame */}
            <div
              style={{
                position: "relative",
                width: "100%",
                height: "56vh",
                background: "var(--md-forest)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Image
                src={activeItem.fullImage}
                alt={activeItem.alt}
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 920px"
                style={{
                  objectFit: "contain",
                }}
              />
            </div>

            {/* Modal Info Footer */}
            <div
              style={{
                padding: "16px 20px",
                background: "var(--md-bg)",
                borderTop: "1px solid var(--md-rule)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  flexWrap: "wrap",
                  gap: 8,
                  marginBottom: 6,
                }}
              >
                <h3
                  style={{
                    margin: 0,
                    fontFamily: "var(--md-font-display)",
                    fontSize: "1.25rem",
                    fontWeight: 400,
                    color: "var(--md-fg)",
                  }}
                >
                  {activeItem.title}
                </h3>
                <span
                  style={{
                    fontSize: "0.6875rem",
                    color: "var(--md-fg-secondary)",
                    letterSpacing: "0.1em",
                  }}
                >
                  Photo {activeItemIndex + 1} of {EXHIBITION_ITEMS.length}
                </span>
              </div>
              <p
                style={{
                  margin: 0,
                  fontSize: "0.875rem",
                  lineHeight: 1.6,
                  color: "var(--md-fg-secondary)",
                }}
              >
                {activeItem.description}
              </p>
              <div
                style={{
                  marginTop: 10,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  fontSize: "0.75rem",
                  color: "var(--md-gold-antique)",
                  fontWeight: 600,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                <span>✦ {activeItem.highlight}</span>
                <span>·</span>
                <span>Direct Jaipur Silversmithing</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

interface ExhibitionCardProps {
  item: ExhibitionItem;
  isDuplicate?: boolean;
  onSelect: () => void;
}

function ExhibitionCard({ item, isDuplicate, onSelect }: ExhibitionCardProps): React.JSX.Element {
  return (
    <article
      tabIndex={isDuplicate ? -1 : 0}
      aria-hidden={isDuplicate}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className="md-exhibition-card"
      style={{
        flex: "0 0 clamp(280px, 28vw, 360px)",
        background: "var(--md-bg)",
        border: "1px solid var(--md-rule)",
        borderRadius: "var(--md-radius-sm)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        cursor: "pointer",
        transition: "transform 240ms ease, border-color 240ms ease, box-shadow 240ms ease",
        outline: "none",
        userSelect: "none",
      }}
    >
      {/* Photo with Overlay Badge */}
      <div
        style={{
          position: "relative",
          width: "100%",
          aspectRatio: "16 / 10",
          overflow: "hidden",
          background: "var(--md-forest)",
        }}
      >
        <Image
          src={item.image}
          alt={item.alt}
          fill
          placeholder="blur"
          blurDataURL={item.blurDataUrl}
          loading="lazy"
          sizes="(max-width: 640px) 280px, (max-width: 1024px) 34vw, 360px"
          style={{
            objectFit: "cover",
            objectPosition: "center 28%",
            transition: "transform 360ms ease",
          }}
          className="md-exhibition-img"
        />

        {/* Location Badge (Dark Frosted Glass) */}
        <div
          style={{
            position: "absolute",
            top: 12,
            left: 12,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "4px 10px",
            background: "rgba(4, 19, 13, 0.82)",
            backdropFilter: "blur(6px)",
            borderRadius: "var(--md-radius-pill)",
            border: "1px solid color-mix(in srgb, var(--md-champagne) 30%, transparent)",
            color: "var(--md-champagne)",
            fontSize: "0.625rem",
            fontWeight: 600,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            zIndex: 2,
          }}
        >
          <span style={{ color: "var(--md-gold-antique)", fontSize: "0.5rem" }}>✦</span>
          <span>{item.badge}</span>
        </div>

        {/* Expand Icon Cue */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            bottom: 10,
            right: 10,
            width: 28,
            height: 28,
            borderRadius: "50%",
            background: "rgba(4, 19, 13, 0.72)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--md-ivory-soft)",
            fontSize: "0.75rem",
            border: "1px solid color-mix(in srgb, var(--md-champagne) 25%, transparent)",
            zIndex: 2,
          }}
        >
          ⤢
        </div>
      </div>

      {/* Card Text Content */}
      <div
        style={{
          padding: "16px 18px",
          display: "flex",
          flexDirection: "column",
          flexGrow: 1,
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <div>
          <span
            style={{
              fontSize: "0.625rem",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--md-fg-secondary)",
              fontWeight: 600,
              display: "block",
              marginBottom: 4,
            }}
          >
            {item.category}
          </span>
          <h3
            style={{
              margin: 0,
              fontFamily: "var(--md-font-display)",
              fontSize: "1.0625rem",
              fontWeight: 400,
              letterSpacing: "-0.01em",
              color: "var(--md-fg)",
              lineHeight: 1.3,
            }}
          >
            {item.title}
          </h3>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingTop: 8,
            borderTop: "1px solid var(--md-rule)",
            fontSize: "0.6875rem",
          }}
        >
          <span style={{ color: "var(--md-fg-secondary)", fontWeight: 500 }}>
            {item.city}
          </span>
          <span
            style={{
              color: "var(--md-gold-antique)",
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            View Gallery →
          </span>
        </div>
      </div>
    </article>
  );
}
