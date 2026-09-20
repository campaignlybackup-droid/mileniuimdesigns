import type { JSX } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { resolveMarket } from "@/lib/market";
import { buildCanonicalAndAlternates } from "@/lib/seo";
import { listPublishedCategories } from "@/lib/catalog";
import { listStorefrontFeaturedProducts } from "@/lib/catalog/products";
import { getStorefrontStones } from "@/lib/stones";
import { StoneCard } from "@/components/storefront/StoneCard";
import { ProductCard } from "@/components/storefront/ProductCard";
import { getCategoryImage } from "@/lib/media/categoryImages";
import { buildWhatsAppInquiryUrl } from "@/lib/whatsapp";

export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ market: string }>;
}): Promise<Metadata> {
  const { market } = await params;
  const resolved = await resolveMarket(market);
  const { canonical, languages } = await buildCanonicalAndAlternates({
    pathname: "/",
    marketCode: resolved.code,
  });

  return {
    title: "MILLENNIUM DESIGNS | Haute Joaillerie & Handcrafted 925 Silver · Jaipur 1961",
    description:
      "Generations of courtly emerald curation and anti-tarnish 925 sterling silver craftsmanship. Handcrafted entirely in-house in our Jaipur atelier since 1961.",
    alternates: {
      canonical,
      languages,
    },
  };
}

export default async function StorefrontHomePage({
  params,
}: {
  params: Promise<{ market: string }>;
}): Promise<JSX.Element> {
  const { market } = await params;
  const resolved = await resolveMarket(market);
  const prefix = resolved.code.toLowerCase() === "us" ? "" : `/${resolved.code.toLowerCase()}`;

  // Read published categories from DB
  const categories = await listPublishedCategories();

  // Read featured signature products from DB for active market
  const featuredResult = await listStorefrontFeaturedProducts(resolved.code, 4);
  const featuredProducts = featuredResult.products;

  // Read featured stones from DB
  const stones = await getStorefrontStones();

  const whatsappConsultationUrl = buildWhatsAppInquiryUrl({ topic: "bespoke" });

  return (
    <main
      id="main"
      style={{
        width: "100%",
        maxWidth: "100%",
        boxSizing: "border-box",
      }}
    >
      {/* ── 1. HAUTE JOAILLERIE ARCHITECTURAL HERO ───────────────────── */}
      <section
        style={{
          position: "relative",
          width: "100%",
          minHeight: "clamp(480px, 68vh, 660px)",
          background: "radial-gradient(ellipse at 50% 15%, #00381c 0%, #062416 50%, #030e08 100%)",
          color: "var(--md-fg-inverse)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          paddingInline: "var(--md-gutter)",
          paddingBlock: "clamp(36px, 5vw, 56px)",
          overflow: "hidden",
          borderBottom: "1px solid color-mix(in srgb, var(--md-champagne) 24%, transparent)",
        }}
      >
        {/* Sacred Geometry Celestial Grid Watermark */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            opacity: 0.035,
            backgroundImage: "radial-gradient(circle at 50% 50%, var(--md-champagne) 1px, transparent 1px)",
            backgroundSize: "36px 36px",
            pointerEvents: "none",
          }}
        />

        {/* Ambient Warm Golden Ray */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            top: "-10%",
            left: "50%",
            transform: "translateX(-50%)",
            width: "clamp(320px, 60vw, 700px)",
            height: "260px",
            background: "radial-gradient(ellipse at 50% 50%, color-mix(in srgb, var(--md-champagne) 18%, transparent) 0%, transparent 70%)",
            filter: "blur(40px)",
            pointerEvents: "none",
          }}
        />

        <div
          style={{
            position: "relative",
            zIndex: 2,
            width: "100%",
            maxWidth: "var(--md-container)",
            marginInline: "auto",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
          }}
        >
          {/* Heritage Archival Seal */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "5px 14px",
              borderRadius: "var(--md-radius-sm)",
              border: "1px solid color-mix(in srgb, var(--md-champagne) 38%, transparent)",
              background: "color-mix(in srgb, var(--md-green-black) 75%, transparent)",
              fontSize: "0.6875rem",
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "var(--md-champagne)",
              fontWeight: 600,
              fontFamily: "var(--md-font-crest), Georgia, serif",
              marginBottom: "var(--md-space-3)",
            }}
          >
            <span>✦ JOHARI BAZAAR, JAIPUR · EST. 1961 ✦</span>
          </div>

          <h1
            style={{
              margin: 0,
              fontFamily: "var(--md-font-display)",
              fontSize: "clamp(2.35rem, 5.2vw, 4.25rem)",
              lineHeight: 1.08,
              fontWeight: 400,
              letterSpacing: "-0.015em",
              color: "var(--md-fg-inverse)",
              maxWidth: "920px",
              textWrap: "balance",
            }}
          >
            The Haute Joaillerie Atelier of Jaipur
          </h1>

          <p
            style={{
              margin: "var(--md-space-3) auto 0",
              fontSize: "clamp(0.9375rem, 1.3vw, 1.0625rem)",
              lineHeight: 1.65,
              color: "var(--md-fg-inverse-muted)",
              maxWidth: "560px",
            }}
          >
            Courtly Colombian emeralds and cold-forged anti-tarnish 925 silver. Cast, set, and hallmarked under our own roof since 1961.
          </p>

          {/* Primary Action Buttons */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "var(--md-space-3)",
              justifyContent: "center",
              paddingTop: "var(--md-space-4)",
            }}
          >
            <Link
              href={`${prefix}/rings`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                height: 48,
                paddingInline: "32px",
                background: "var(--md-champagne)",
                color: "var(--md-green-black)",
                fontSize: "0.75rem",
                fontWeight: 600,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                textDecoration: "none",
                borderRadius: "var(--md-radius-sm)",
                transition: "transform 180ms ease, box-shadow 180ms ease",
                boxShadow: "0 8px 24px -6px rgba(200, 178, 122, 0.45)",
              }}
            >
              Explore Creations →
            </Link>

            <a
              href={whatsappConsultationUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                height: 48,
                paddingInline: "24px",
                border: "1px solid color-mix(in srgb, var(--md-fg-inverse) 32%, transparent)",
                background: "color-mix(in srgb, var(--md-green-black) 50%, transparent)",
                color: "var(--md-fg-inverse)",
                fontSize: "0.75rem",
                fontWeight: 500,
                letterSpacing: "0.08em",
                textDecoration: "none",
                borderRadius: "var(--md-radius-sm)",
                transition: "border-color 180ms ease, background 180ms ease",
              }}
            >
              <span>WhatsApp Atelier Consultation</span>
            </a>
          </div>

          {/* Integrated Three-Door Architectural Discovery Portal */}
          <div className="md-hero-doors" style={{ marginTop: "clamp(28px, 4vw, 44px)" }}>
            <Link href={`${prefix}/rings`} className="md-hero-door-card">
              <div>
                <span style={{ fontSize: "0.5625rem", letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--md-champagne)", fontFamily: "var(--md-font-crest), Georgia, serif", display: "block", marginBottom: "4px" }}>
                  01 · FINE JEWELLERY
                </span>
                <h3 style={{ margin: 0, fontFamily: "var(--md-font-display)", fontSize: "1.125rem", color: "var(--md-fg-inverse)", fontWeight: 400 }}>
                  High Jewellery Rings
                </h3>
                <p style={{ margin: "4px 0 0", fontSize: "0.75rem", color: "var(--md-fg-inverse-muted)", lineHeight: 1.4 }}>
                  Colombian emeralds &amp; sculpted silver
                </p>
              </div>
              <span style={{ marginTop: "12px", fontSize: "0.6875rem", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--md-champagne)", fontWeight: 600 }}>
                Shop Rings →
              </span>
            </Link>

            <Link href={`${prefix}/pendants`} className="md-hero-door-card">
              <div>
                <span style={{ fontSize: "0.5625rem", letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--md-champagne)", fontFamily: "var(--md-font-crest), Georgia, serif", display: "block", marginBottom: "4px" }}>
                  02 · FINE JEWELLERY
                </span>
                <h3 style={{ margin: 0, fontFamily: "var(--md-font-display)", fontSize: "1.125rem", color: "var(--md-fg-inverse)", fontWeight: 400 }}>
                  Courtly Pendants &amp; Chains
                </h3>
                <p style={{ margin: "4px 0 0", fontSize: "0.75rem", color: "var(--md-fg-inverse-muted)", lineHeight: 1.4 }}>
                  Byzantine weaves &amp; royal seals
                </p>
              </div>
              <span style={{ marginTop: "12px", fontSize: "0.6875rem", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--md-champagne)", fontWeight: 600 }}>
                Shop Pendants →
              </span>
            </Link>

            <Link href={`${prefix}/stones`} className="md-hero-door-card">
              <div>
                <span style={{ fontSize: "0.5625rem", letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--md-champagne)", fontFamily: "var(--md-font-crest), Georgia, serif", display: "block", marginBottom: "4px" }}>
                  03 · NATURAL MINERALS
                </span>
                <h3 style={{ margin: 0, fontFamily: "var(--md-font-display)", fontSize: "1.125rem", color: "var(--md-fg-inverse)", fontWeight: 400 }}>
                  Natural Gemstones
                </h3>
                <p style={{ margin: "4px 0 0", fontSize: "0.75rem", color: "var(--md-fg-inverse-muted)", lineHeight: 1.4 }}>
                  Archival unheated stones &amp; minerals
                </p>
              </div>
              <span style={{ marginTop: "12px", fontSize: "0.6875rem", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--md-champagne)", fontWeight: 600 }}>
                Explore Stones →
              </span>
            </Link>
          </div>
        </div>
      </section>

      {/* ── 2. THE MASTERPIECE CREATIONS ───────────────────────── */}
      {featuredProducts.length > 0 && (
        <section
          style={{
            maxWidth: "var(--md-container)",
            marginInline: "auto",
            paddingInline: "var(--md-gutter)",
            paddingBlock: "clamp(40px, 5vw, 68px)",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
              marginBottom: "clamp(24px, 3.5vw, 36px)",
            }}
          >
            <span
              style={{
                fontSize: "0.75rem",
                letterSpacing: "0.26em",
                textTransform: "uppercase",
                color: "var(--md-green)",
                fontWeight: 600,
                fontFamily: "var(--md-font-crest), Georgia, serif",
                marginBottom: 8,
              }}
            >
              HAUTE JOAILLERIE · MASTERPIECES
            </span>
            <h2
              style={{
                margin: 0,
                fontFamily: "var(--md-font-display)",
                fontSize: "clamp(2rem, 3.8vw, 3rem)",
                fontWeight: 400,
                color: "var(--md-fg)",
              }}
            >
              The Archival Masterpieces
            </h2>
            <p
              style={{
                margin: "10px 0 0",
                maxWidth: "560px",
                fontSize: "0.9375rem",
                color: "var(--md-fg-secondary)",
                lineHeight: 1.6,
              }}
            >
              Individually documented creations, hallmarked and archived for private collectors and connoisseurs.
            </p>
          </div>

          <div className="md-product-grid">
            {featuredProducts.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                marketSegment={resolved.code.toLowerCase() === "us" ? "" : resolved.code.toLowerCase()}
                locale={resolved.locale}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── 3. THE FOUR PILLARS OF HIGH GOLDSMITHING ── */}
      <section
        style={{
          background: "var(--md-bg-raised)",
          borderTop: "1px solid var(--md-rule)",
          borderBottom: "1px solid var(--md-rule)",
          paddingInline: "var(--md-gutter)",
          paddingBlock: "clamp(40px, 5vw, 68px)",
        }}
      >
        <div
          style={{
            maxWidth: "var(--md-container)",
            marginInline: "auto",
          }}
        >
          <div
            style={{
              textAlign: "center",
              marginBottom: "clamp(24px, 3.5vw, 36px)",
            }}
          >
            <span
              style={{
                fontSize: "0.75rem",
                letterSpacing: "0.26em",
                textTransform: "uppercase",
                color: "var(--md-green)",
                fontWeight: 600,
                fontFamily: "var(--md-font-crest), Georgia, serif",
              }}
            >
              SIXTY-FIVE YEARS OF COURTLY METALLURGY
            </span>
            <h2
              style={{
                margin: "8px 0 0",
                fontFamily: "var(--md-font-display)",
                fontSize: "clamp(2rem, 3.5vw, 3rem)",
                fontWeight: 400,
                color: "var(--md-fg)",
              }}
            >
              The Four Pillars of High Goldsmithing
            </h2>
            <p
              style={{
                margin: "10px auto 0",
                maxWidth: "540px",
                fontSize: "0.9375rem",
                color: "var(--md-fg-secondary)",
                lineHeight: 1.6,
              }}
            >
              How our 1961 founding doctrine in Johari Bazaar continues to govern every creation forged in our Jaipur atelier.
            </p>
          </div>

          {/* Symmetrical Four Pillars Grid (4 cols on desktop, 2x2 on tablet, 1 on mobile) */}
          <div className="md-four-pillars-grid">
            {/* Pillar 01 */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "var(--md-space-3)",
                paddingTop: "var(--md-space-4)",
                borderTop: "1px solid color-mix(in srgb, var(--md-champagne) 35%, transparent)",
              }}
            >
              <div
                style={{
                  fontFamily: "var(--md-font-display)",
                  fontSize: "1.75rem",
                  color: "var(--md-champagne)",
                  lineHeight: 1,
                  fontStyle: "italic",
                }}
              >
                I.
              </div>
              <h3
                style={{
                  margin: 0,
                  fontFamily: "var(--md-font-display)",
                  fontSize: "1.1875rem",
                  fontWeight: 500,
                  color: "var(--md-fg)",
                }}
              >
                The Johari Emerald Lineage
              </h3>
              <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--md-fg-secondary)", lineHeight: 1.65 }}>
                Founded in 1961 in Jaipur’s historic jewel quarter, curating rare Colombian and Zambian emeralds with uncompromising authenticity.
              </p>
            </div>

            {/* Pillar 02 */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "var(--md-space-3)",
                paddingTop: "var(--md-space-4)",
                borderTop: "1px solid color-mix(in srgb, var(--md-champagne) 35%, transparent)",
              }}
            >
              <div
                style={{
                  fontFamily: "var(--md-font-display)",
                  fontSize: "1.75rem",
                  color: "var(--md-champagne)",
                  lineHeight: 1,
                  fontStyle: "italic",
                }}
              >
                II.
              </div>
              <h3
                style={{
                  margin: 0,
                  fontFamily: "var(--md-font-display)",
                  fontSize: "1.1875rem",
                  fontWeight: 500,
                  color: "var(--md-fg)",
                }}
              >
                Cold-Forged Anti-Tarnish Alloy
              </h3>
              <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--md-fg-secondary)", lineHeight: 1.65 }}>
                A proprietary 925 sterling alloy shielding the mirror brilliance of fine silver indefinitely from atmospheric oxidation.
              </p>
            </div>

            {/* Pillar 03 */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "var(--md-space-3)",
                paddingTop: "var(--md-space-4)",
                borderTop: "1px solid color-mix(in srgb, var(--md-champagne) 35%, transparent)",
              }}
            >
              <div
                style={{
                  fontFamily: "var(--md-font-display)",
                  fontSize: "1.75rem",
                  color: "var(--md-champagne)",
                  lineHeight: 1,
                  fontStyle: "italic",
                }}
              >
                III.
              </div>
              <h3
                style={{
                  margin: 0,
                  fontFamily: "var(--md-font-display)",
                  fontSize: "1.1875rem",
                  fontWeight: 500,
                  color: "var(--md-fg)",
                }}
              >
                Single-Roof Jaipur Atelier
              </h3>
              <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--md-fg-secondary)", lineHeight: 1.65 }}>
                From hand-drawn gouache sketches and lost-wax casting to microscopic claw setting, every creation is forged entirely under our own roof.
              </p>
            </div>

            {/* Pillar 04 */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "var(--md-space-3)",
                paddingTop: "var(--md-space-4)",
                borderTop: "1px solid color-mix(in srgb, var(--md-champagne) 35%, transparent)",
              }}
            >
              <div
                style={{
                  fontFamily: "var(--md-font-display)",
                  fontSize: "1.75rem",
                  color: "var(--md-champagne)",
                  lineHeight: 1,
                  fontStyle: "italic",
                }}
              >
                IV.
              </div>
              <h3
                style={{
                  margin: 0,
                  fontFamily: "var(--md-font-display)",
                  fontSize: "1.1875rem",
                  fontWeight: 500,
                  color: "var(--md-fg)",
                }}
              >
                Direct Bench Provenance
              </h3>
              <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--md-fg-secondary)", lineHeight: 1.65 }}>
                Over 25 years presenting at Basel, Vicenza, and New York. Collectors acquire museum-grade pieces directly from our master bench.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── 4. THE HOUSE ATELIER SUITES (CURATED CATEGORIES) ───────── */}
      {categories.length > 0 && (
        <section
          style={{
            maxWidth: "var(--md-container)",
            marginInline: "auto",
            paddingInline: "var(--md-gutter)",
            paddingBlock: "clamp(40px, 5vw, 68px)",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
              marginBottom: "clamp(24px, 3.5vw, 36px)",
            }}
          >
            <span
              style={{
                fontSize: "0.75rem",
                letterSpacing: "0.26em",
                textTransform: "uppercase",
                color: "var(--md-green)",
                fontWeight: 600,
                fontFamily: "var(--md-font-crest), Georgia, serif",
                marginBottom: 8,
              }}
            >
              SIGNATURE COLLECTIONS
            </span>
            <h2
              style={{
                margin: 0,
                fontFamily: "var(--md-font-display)",
                fontSize: "clamp(2rem, 3.5vw, 3rem)",
                fontWeight: 400,
                color: "var(--md-fg)",
              }}
            >
              Curated Archival Collections
            </h2>
            <p
              style={{
                margin: "10px 0 0",
                maxWidth: "520px",
                fontSize: "0.9375rem",
                color: "var(--md-fg-secondary)",
                lineHeight: 1.6,
              }}
            >
              From Venetian box link weaves to courtly emerald solitaires, explore our signature collections.
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 320px), 1fr))",
              gap: "clamp(16px, 2.5vw, 24px)",
            }}
          >
            {categories.map((c) => (
              <Link
                key={c.id}
                href={`${prefix}/${c.slug}`}
                className="md-product-card"
                style={{
                  position: "relative",
                  aspectRatio: "3 / 4",
                  overflow: "hidden",
                  textDecoration: "none",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "flex-end",
                  padding: "var(--md-space-6)",
                  background: "var(--md-bg-raised)",
                  borderRadius: "var(--md-radius-sm)",
                  boxShadow: "0 12px 32px -8px rgba(0, 0, 0, 0.12)",
                }}
              >
                <img
                  src={getCategoryImage(c.slug)}
                  alt={c.name}
                  loading="lazy"
                  decoding="async"
                  className="md-card-primary-image"
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    transition: "transform 700ms var(--md-ease)",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    background: "linear-gradient(to top, rgba(4, 14, 9, 0.94) 0%, rgba(4, 14, 9, 0.35) 55%, transparent 100%)",
                    pointerEvents: "none",
                  }}
                />
                <div style={{ position: "relative", zIndex: 2 }}>
                  <div
                    style={{
                      fontSize: "0.6875rem",
                      letterSpacing: "0.16em",
                      textTransform: "uppercase",
                      color: "var(--md-champagne)",
                      fontWeight: 600,
                      marginBottom: 4,
                      fontFamily: "var(--md-font-crest), Georgia, serif",
                    }}
                  >
                    SIGNATURE ARCHIVE
                  </div>
                  <h3
                    style={{
                      margin: 0,
                      fontFamily: "var(--md-font-display)",
                      fontSize: "clamp(1.5rem, 2.2vw, 2.125rem)",
                      fontWeight: 400,
                      letterSpacing: "0.01em",
                      color: "var(--md-fg-inverse)",
                    }}
                  >
                    {c.name}
                  </h3>
                  <div
                    style={{
                      marginTop: 8,
                      fontSize: "0.75rem",
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      color: "var(--md-ivory-soft)",
                      fontWeight: 500,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <span>Shop Collection</span>
                    <span>→</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ── 5. THE ATELIER HERITAGE TEASER (NON-DUPLICATIVE) ─────── */}
      <section
        style={{
          background: "var(--md-bg-inverse)",
          color: "var(--md-fg-inverse)",
          paddingInline: "var(--md-gutter)",
          paddingBlock: "clamp(44px, 6vw, 76px)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            maxWidth: "var(--md-container)",
            marginInline: "auto",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))",
            gap: "clamp(32px, 5vw, 64px)",
            alignItems: "center",
          }}
        >
          {/* Historical Teaser & Philosophy */}
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--md-space-4)" }}>
            <span
              style={{
                fontSize: "0.75rem",
                letterSpacing: "0.26em",
                textTransform: "uppercase",
                color: "var(--md-champagne)",
                fontWeight: 600,
                fontFamily: "var(--md-font-crest), Georgia, serif",
              }}
            >
              THE JAIPUR MAISON · EST. 1961
            </span>

            <h2
              style={{
                margin: 0,
                fontFamily: "var(--md-font-display)",
                fontSize: "clamp(2rem, 3.6vw, 3.125rem)",
                lineHeight: 1.15,
                fontWeight: 400,
                color: "var(--md-fg-inverse)",
                fontStyle: "italic",
              }}
            >
              “We do not forge for fleeting seasons. We sculpt sovereign heirlooms for generations.”
            </h2>

            <p
              style={{
                margin: 0,
                fontSize: "1rem",
                lineHeight: 1.7,
                color: "var(--md-fg-inverse-muted)",
              }}
            >
              From our grandfather&apos;s 1961 beginnings in Jaipur&apos;s Johari Bazaar to international salons across Basel and New York, our family has practiced single-roof goldsmithing for over six decades.
            </p>

            <div style={{ marginTop: "var(--md-space-2)", display: "flex", gap: "var(--md-space-4)", flexWrap: "wrap" }}>
              <Link
                href={`${prefix}/our-story`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  height: 48,
                  paddingInline: "28px",
                  background: "var(--md-champagne)",
                  color: "var(--md-green-black)",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  textDecoration: "none",
                  borderRadius: "var(--md-radius-sm)",
                  transition: "transform 180ms ease, box-shadow 180ms ease",
                }}
              >
                Read The Full Heritage Monograph →
              </Link>
            </div>
          </div>

          {/* Archival Illustration & Framing */}
          <div
            style={{
              position: "relative",
              aspectRatio: "4 / 5",
              borderRadius: "var(--md-radius-sm)",
              overflow: "hidden",
              boxShadow: "0 28px 70px -16px rgba(0, 0, 0, 0.7)",
              border: "1px solid color-mix(in srgb, var(--md-champagne) 32%, transparent)",
            }}
          >
            <Image
              src="/images/categories/pendants.jpg"
              alt="Pushpak Jewels to Millennium Designs Archival Craftsmanship"
              fill
              sizes="(max-width: 768px) 100vw, 500px"
              style={{ objectFit: "cover" }}
            />
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "linear-gradient(to top, rgba(4, 14, 9, 0.9) 0%, rgba(4, 14, 9, 0.15) 50%, transparent 100%)",
                pointerEvents: "none",
              }}
            />
            <div
              style={{
                position: "absolute",
                bottom: 20,
                left: 20,
                right: 20,
                padding: "16px 20px",
                background: "rgba(4, 14, 9, 0.88)",
                backdropFilter: "blur(14px)",
                borderRadius: "var(--md-radius-sm)",
                border: "1px solid rgba(200, 178, 122, 0.35)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                color: "var(--md-fg-inverse)",
              }}
            >
              <div>
                <div style={{ fontSize: "0.625rem", letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--md-champagne)" }}>
                  JOHARI BAZAAR ARCHIVES
                </div>
                <div style={{ fontFamily: "var(--md-font-display)", fontSize: "1.0625rem", marginTop: 2 }}>
                  Pushpak Jewels to Millennium Designs
                </div>
              </div>
              <span style={{ fontSize: "0.8125rem", color: "var(--md-champagne)", fontWeight: 600, fontFamily: "var(--md-font-crest), Georgia, serif" }}>
                EST. 1961
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ── 6. THE GEMSTONE CABINET OF CURIOSITIES ───────────────────── */}
      {stones.length > 0 && (
        <section
          style={{
            maxWidth: "var(--md-container)",
            marginInline: "auto",
            paddingInline: "var(--md-gutter)",
            paddingBlock: "clamp(40px, 5vw, 68px)",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
              marginBottom: "clamp(24px, 3.5vw, 36px)",
            }}
          >
            <span
              style={{
                fontSize: "0.75rem",
                letterSpacing: "0.26em",
                textTransform: "uppercase",
                color: "var(--md-green)",
                fontWeight: 600,
                fontFamily: "var(--md-font-crest), Georgia, serif",
                marginBottom: 8,
              }}
            >
              NATURAL GEMSTONE COLLECTION
            </span>
            <h2
              style={{
                margin: 0,
                fontFamily: "var(--md-font-display)",
                fontSize: "clamp(2rem, 3.5vw, 3rem)",
                fontWeight: 400,
                color: "var(--md-fg)",
              }}
            >
              The Gemstone Cabinet of Curiosities
            </h2>
            <p
              style={{
                margin: "10px 0 0",
                maxWidth: "540px",
                fontSize: "0.9375rem",
                color: "var(--md-fg-secondary)",
                lineHeight: 1.6,
              }}
            >
              Explore creations by signature stone, from deep Colombian emeralds to celestial sapphires and rainbow moonstones.
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 140px), 1fr))",
              gap: "clamp(10px, 1.8vw, 16px)",
            }}
          >
            {stones.map((stone) => (
              <StoneCard
                key={stone.id}
                stone={stone}
                marketSegment={resolved.code.toLowerCase() === "us" ? "" : resolved.code.toLowerCase()}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── 7. BESPOKE COMMISSION SALON & VIP CONCIERGE ───────────────── */}
      <section
        style={{
          background: "radial-gradient(ellipse at 50% 50%, #062e1b 0%, #040e09 100%)",
          color: "var(--md-fg-inverse)",
          paddingInline: "var(--md-gutter)",
          paddingBlock: "clamp(44px, 6vw, 76px)",
          borderTop: "1px solid color-mix(in srgb, var(--md-champagne) 24%, transparent)",
          borderBottom: "1px solid color-mix(in srgb, var(--md-champagne) 24%, transparent)",
        }}
      >
        <div
          style={{
            maxWidth: "880px",
            marginInline: "auto",
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "clamp(16px, 2.5vw, 24px)",
          }}
        >
          <span
            style={{
              fontSize: "0.6875rem",
              letterSpacing: "0.26em",
              textTransform: "uppercase",
              color: "var(--md-champagne)",
              fontWeight: 600,
              fontFamily: "var(--md-font-crest), Georgia, serif",
            }}
          >
            HAUTE JOAILLERIE BESPOKE
          </span>

          <h2
            style={{
              margin: 0,
              fontFamily: "var(--md-font-display)",
              fontSize: "clamp(2.25rem, 4.5vw, 3.5rem)",
              fontWeight: 400,
              color: "var(--md-fg-inverse)",
              lineHeight: 1.12,
            }}
          >
            Commission a Sovereign Masterpiece
          </h2>

          <p
            style={{
              margin: 0,
              fontSize: "1.0625rem",
              lineHeight: 1.7,
              color: "var(--md-fg-inverse-muted)",
              maxWidth: "680px",
            }}
          >
            Collaborate directly with Amit &amp; Saket Agarwal and our master bench goldsmiths. Whether creating a custom bridal jewellery set, resetting an heirloom emerald, or crafting a bespoke signature piece, our Jaipur atelier brings your vision to life.
          </p>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "var(--md-space-3)",
              justifyContent: "center",
              marginTop: "var(--md-space-2)",
            }}
          >
            <a
              href={whatsappConsultationUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
                height: 50,
                paddingInline: "32px",
                background: "var(--md-green)",
                color: "var(--md-ivory-soft)",
                fontSize: "0.8125rem",
                fontWeight: 600,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                textDecoration: "none",
                borderRadius: "var(--md-radius-sm)",
                boxShadow: "0 10px 28px -6px rgba(0, 156, 23, 0.45)",
              }}
            >
              <span>WhatsApp Atelier Concierge</span>
              <span>→</span>
            </a>

            <Link
              href={`${prefix}/our-story`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                height: 50,
                paddingInline: "28px",
                border: "1px solid color-mix(in srgb, var(--md-champagne) 40%, transparent)",
                color: "var(--md-champagne)",
                fontSize: "0.8125rem",
                fontWeight: 500,
                letterSpacing: "0.08em",
                textDecoration: "none",
                borderRadius: "var(--md-radius-sm)",
              }}
            >
              Explore Atelier Techniques
            </Link>
          </div>

          {/* Official Atelier Address & Direct Phone Card */}
          <div
            style={{
              marginTop: "var(--md-space-3)",
              padding: "16px 24px",
              borderRadius: "var(--md-radius-sm)",
              background: "rgba(4, 14, 9, 0.65)",
              border: "1px solid color-mix(in srgb, var(--md-champagne) 24%, transparent)",
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "center",
              gap: "clamp(12px, 3vw, 28px)",
              fontSize: "0.8125rem",
              color: "var(--md-fg-inverse-muted)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ color: "var(--md-champagne)" }}>📍</span>
              <span>Millenium Designs, 5, Noor Plaza, Chameliwala Market, M.I. Road, Jaipur, 302001</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <a href="tel:+919828156465" style={{ color: "var(--md-champagne)", textDecoration: "none", fontWeight: 600 }}>
                📞 +91 98281 56465
              </a>
              <span>·</span>
              <a href="tel:+919829056597" style={{ color: "var(--md-champagne)", textDecoration: "none", fontWeight: 600 }}>
                +91 98290 56597
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── 8. THE PRIVATE SALON (VIP PREVIEWS) ───────────────────────── */}
      <section
        style={{
          maxWidth: "var(--md-container-text)",
          marginInline: "auto",
          paddingInline: "var(--md-gutter)",
          paddingBlock: "clamp(40px, 5vw, 68px)",
          textAlign: "center",
        }}
      >
        <span
          style={{
            fontSize: "0.75rem",
            letterSpacing: "0.26em",
            textTransform: "uppercase",
            color: "var(--md-green)",
            fontWeight: 600,
            fontFamily: "var(--md-font-crest), Georgia, serif",
          }}
        >
          THE PRIVATE SALON
        </span>
        <h2
          style={{
            margin: "8px 0 0",
            fontFamily: "var(--md-font-display)",
            fontSize: "clamp(1.875rem, 3vw, 2.5rem)",
            fontWeight: 400,
            color: "var(--md-fg)",
          }}
        >
          Private Previews &amp; Atelier Releases
        </h2>
        <p
          style={{
            margin: "10px auto 24px",
            maxWidth: "480px",
            fontSize: "0.9375rem",
            color: "var(--md-fg-secondary)",
            lineHeight: 1.6,
          }}
        >
          Receive private invitations to confidential high jewellery viewings, rare Jaipur gemstone acquisitions, and atelier news.
        </p>

        <form
          action="#"
          style={{
            display: "flex",
            maxWidth: "460px",
            marginInline: "auto",
            gap: "var(--md-space-2)",
          }}
        >
          <input
            type="email"
            placeholder="Enter your email address"
            required
            style={{
              flex: 1,
              height: 48,
              paddingInline: "18px",
              border: "1px solid var(--md-rule-strong)",
              background: "var(--md-bg)",
              color: "var(--md-fg)",
              fontSize: "0.875rem",
              borderRadius: "var(--md-radius-sm)",
              outline: "none",
            }}
          />
          <button
            type="submit"
            style={{
              height: 48,
              paddingInline: "28px",
              background: "var(--md-fg)",
              color: "var(--md-ivory-soft)",
              border: "none",
              borderRadius: "var(--md-radius-sm)",
              fontSize: "0.75rem",
              fontWeight: 600,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            Join
          </button>
        </form>
      </section>
    </main>
  );
}
