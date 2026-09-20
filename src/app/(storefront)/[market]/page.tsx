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
      {/* ── 1. HAUTE JOAILLERIE MOTION GRAPHIC HERO ─────────────────── */}
      <section
        style={{
          position: "relative",
          width: "100%",
          minHeight: "clamp(640px, 90vh, 960px)",
          background: "radial-gradient(ellipse at 50% 20%, #003d1f 0%, #062e1b 45%, #040e09 100%)",
          color: "var(--md-fg-inverse)",
          display: "flex",
          alignItems: "center",
          paddingInline: "var(--md-gutter)",
          paddingBlock: "var(--md-space-10) var(--md-space-8)",
          overflow: "hidden",
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
            backgroundSize: "40px 40px",
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
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 460px), 1fr))",
            gap: "clamp(36px, 6vw, 80px)",
            alignItems: "center",
          }}
        >
          {/* Left Column: Minimal, High-Impact Luxury Narrative */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--md-space-4)",
              textAlign: "left",
            }}
          >
            {/* Heritage Archival Seal */}
            <div
              style={{
                alignSelf: "flex-start",
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "6px 16px",
                borderRadius: "var(--md-radius-sm)",
                border: "1px solid color-mix(in srgb, var(--md-champagne) 38%, transparent)",
                background: "color-mix(in srgb, var(--md-green-black) 75%, transparent)",
                fontSize: "0.6875rem",
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: "var(--md-champagne)",
                fontWeight: 600,
                fontFamily: "var(--md-font-crest), Georgia, serif",
              }}
            >
              <span>✦ JOHARI BAZAAR · JAIPUR · EST. 1961</span>
            </div>

            <h1
              style={{
                margin: 0,
                fontFamily: "var(--md-font-display)",
                fontSize: "clamp(2.5rem, 5.2vw, 4.5rem)",
                lineHeight: 1.08,
                fontWeight: 400,
                letterSpacing: "-0.015em",
                color: "var(--md-fg-inverse)",
                textWrap: "balance",
              }}
            >
              Rare Emeralds.
              <br />
              Ancestral Jaipur Fire.
            </h1>

            <p
              style={{
                margin: 0,
                fontSize: "clamp(0.9375rem, 1.3vw, 1.0625rem)",
                lineHeight: 1.65,
                color: "var(--md-fg-inverse-muted)",
                maxWidth: "520px",
              }}
            >
              Sixty-five years of Johari lineage. Forged in sovereign anti-tarnish 925 silver, crowned with courtly Colombian emeralds, and hallmarked under our own Jaipur roof.
            </p>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "var(--md-space-4)",
                paddingTop: "var(--md-space-2)",
              }}
            >
              <Link
                href={`${prefix}/rings`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: 50,
                  paddingInline: "34px",
                  background: "var(--md-bg-inverse)",
                  color: "var(--md-ivory-soft)",
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  textDecoration: "none",
                  borderRadius: "var(--md-radius-sm)",
                  border: "1px solid color-mix(in srgb, var(--md-champagne) 45%, transparent)",
                  boxShadow: "0 10px 30px -8px rgba(0, 61, 31, 0.6)",
                  transition: "transform 200ms ease, box-shadow 200ms ease",
                }}
              >
                Explore The Collections →
              </Link>

              <a
                href={whatsappConsultationUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "10px",
                  height: 50,
                  paddingInline: "26px",
                  border: "1px solid color-mix(in srgb, var(--md-fg-inverse) 32%, transparent)",
                  background: "color-mix(in srgb, var(--md-green-black) 50%, transparent)",
                  color: "var(--md-fg-inverse)",
                  fontSize: "0.8125rem",
                  fontWeight: 500,
                  letterSpacing: "0.08em",
                  textDecoration: "none",
                  borderRadius: "var(--md-radius-sm)",
                  transition: "border-color 200ms ease, background 200ms ease",
                }}
              >
                <span>Private Vault Appointment</span>
              </a>
            </div>

            {/* Archival Lineage Assurance */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "clamp(16px, 2.5vw, 32px)",
                marginTop: "var(--md-space-4)",
                paddingTop: "var(--md-space-4)",
                borderTop: "1px solid color-mix(in srgb, var(--md-fg-inverse) 14%, transparent)",
                fontSize: "0.75rem",
                letterSpacing: "0.08em",
                color: "var(--md-fg-inverse-muted)",
              }}
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                ✦ 1961 Johari Lineage
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                ✦ Anti-Tarnish Metallurgy
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                ✦ Insured Worldwide Delivery
              </span>
            </div>
          </div>

          {/* Right Column: Museum-Grade High Jewelry Showcase */}
          <div
            style={{
              position: "relative",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              width: "100%",
            }}
          >
            {/* Ambient Golden Halo */}
            <div
              style={{
                position: "absolute",
                inset: "-20px",
                background: "radial-gradient(circle at 50% 50%, color-mix(in srgb, var(--md-champagne) 20%, transparent) 0%, transparent 68%)",
                pointerEvents: "none",
                filter: "blur(24px)",
              }}
            />

            <div
              style={{
                position: "relative",
                width: "100%",
                maxWidth: "520px",
                aspectRatio: "4 / 3",
                overflow: "hidden",
                borderRadius: "var(--md-radius-sm)",
                border: "1px solid color-mix(in srgb, var(--md-champagne) 38%, transparent)",
                boxShadow: "0 28px 64px -16px rgba(0, 0, 0, 0.7), 0 0 0 1px color-mix(in srgb, var(--md-champagne) 20%, transparent)",
              }}
            >
              <Image
                src="/images/hero-emerald-ring.jpg"
                alt="The Sovereign Colombian Emerald & Sculpted Silver Ring — Jaipur Atelier 1961"
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 520px"
                style={{
                  objectFit: "cover",
                  objectPosition: "center",
                  transition: "transform 800ms var(--md-ease)",
                }}
              />

              {/* Refined atelier provenance overlay */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "linear-gradient(to top, rgba(6, 19, 13, 0.85) 0%, transparent 40%)",
                  pointerEvents: "none",
                }}
              />

              <div
                style={{
                  position: "absolute",
                  bottom: "16px",
                  left: "20px",
                  right: "20px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-end",
                }}
              >
                <div>
                  <span
                    style={{
                      fontSize: "0.5625rem",
                      letterSpacing: "0.22em",
                      textTransform: "uppercase",
                      color: "var(--md-champagne)",
                      fontFamily: "var(--md-font-crest), Georgia, serif",
                      display: "block",
                      marginBottom: "2px",
                    }}
                  >
                    ARCHIVAL MASTERPIECE
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--md-font-display)",
                      fontSize: "1.0625rem",
                      color: "var(--md-fg-inverse)",
                      fontWeight: 400,
                      letterSpacing: "0.02em",
                    }}
                  >
                    The Sovereign Emerald Ring
                  </span>
                </div>

                <div
                  style={{
                    fontSize: "0.625rem",
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    color: "var(--md-champagne)",
                    background: "rgba(6, 19, 13, 0.85)",
                    border: "1px solid color-mix(in srgb, var(--md-champagne) 30%, transparent)",
                    padding: "3px 8px",
                    borderRadius: "2px",
                    fontFamily: "var(--md-font-crest), Georgia, serif",
                  }}
                >
                  925 Silver · 18K Gold
                </div>
              </div>
            </div>

            {/* Subtle Archival Caption */}
            <div
              style={{
                marginTop: "var(--md-space-3)",
                textAlign: "center",
                fontSize: "0.6875rem",
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: "var(--md-champagne)",
                fontFamily: "var(--md-font-crest), Georgia, serif",
                opacity: 0.9,
              }}
            >
              <span>COLOMBIAN STEP-CUT EMERALD · COLD-FORGED JAIPUR 1961</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── 2. THE MASTERPIECE CREATION SUITES ───────────────────────── */}
      {featuredProducts.length > 0 && (
        <section
          style={{
            maxWidth: "var(--md-container)",
            marginInline: "auto",
            paddingInline: "var(--md-gutter)",
            paddingBlock: "var(--md-space-11) var(--md-space-9)",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
              marginBottom: "var(--md-space-8)",
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
              HAUTE JOAILLERIE · SUITE NO. 01
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
              Individually documented creations, hallmarked and archived for private collectors and haute joaillerie connoisseurs.
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
          paddingBlock: "var(--md-space-11) var(--md-space-11)",
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
              marginBottom: "var(--md-space-9)",
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
              How our grandfather’s 1961 founding doctrine in Johari Bazaar continues to govern every creation forged in our Jaipur atelier.
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
                Founded in 1961 by B. L. Agarwal in Jaipur’s historic jewel quarter, curating rare Colombian and Zambian emeralds with uncompromising authenticity.
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
                Direct Artisan Bench Provenance
              </h3>
              <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--md-fg-secondary)", lineHeight: 1.65 }}>
                Over 25 years presenting at Basel, Vicenza, and New York. Collectors acquire museum-grade jewellery directly from the master bench.
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
            paddingBlock: "var(--md-space-11) var(--md-space-11)",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
              marginBottom: "var(--md-space-9)",
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
              THE ATELIER SUITES
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
              gap: "var(--md-space-6)",
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
                    <span>Explore The Collection</span>
                    <span>→</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ── 5. THE GENERATIONAL MONOGRAPH (HISTORICAL NARRATIVE) ─────── */}
      <section
        style={{
          background: "var(--md-bg-inverse)",
          color: "var(--md-fg-inverse)",
          paddingInline: "var(--md-gutter)",
          paddingBlock: "var(--md-space-11) var(--md-space-11)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            maxWidth: "var(--md-container)",
            marginInline: "auto",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 460px), 1fr))",
            gap: "clamp(36px, 6vw, 80px)",
            alignItems: "center",
          }}
        >
          {/* Historical Narrative */}
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--md-space-5)" }}>
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
              MONOGRAPH · PUSHPAK JEWELS TO MILLENNIUM DESIGNS
            </span>

            <h2
              style={{
                margin: 0,
                fontFamily: "var(--md-font-display)",
                fontSize: "clamp(2.25rem, 4vw, 3.5rem)",
                lineHeight: 1.1,
                fontWeight: 400,
                color: "var(--md-fg-inverse)",
              }}
            >
              A Sixty-Five Year Legacy of Jaipur Mastery
            </h2>

            <p
              style={{
                margin: 0,
                fontSize: "1.0625rem",
                lineHeight: 1.7,
                color: "var(--md-fg-inverse-muted)",
              }}
            >
              The story began in 1961, when our grandfather B. L. Agarwal founded Pushpak Jewels in Jaipur. Specializing in royal court emerald jewelry, he built a business rooted in trust, mineral authenticity, and exceptional craftsmanship.
            </p>

            <p
              style={{
                margin: 0,
                fontSize: "0.9375rem",
                lineHeight: 1.7,
                color: "var(--md-fg-inverse-muted)",
              }}
            >
              In 1999, the next generation—Amit Agarwal and Saket Agarwal—expanded the family dynasty into international fine silver jewelry. Showcasing at Basel, Vicenza, and New York, Pushpak Jewels transformed into Millennium Designs: uniting generational stone mastery with world-class metallurgy and design.
            </p>

            <div style={{ marginTop: "var(--md-space-3)", display: "flex", gap: "var(--md-space-4)", flexWrap: "wrap" }}>
              <Link
                href={`${prefix}/our-story`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  height: 50,
                  paddingInline: "32px",
                  background: "var(--md-champagne)",
                  color: "var(--md-green-black)",
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  textDecoration: "none",
                  borderRadius: "var(--md-radius-sm)",
                }}
              >
                Read The Full Monograph →
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
              alt="Pushpak Jewels and Millennium Designs Archival Craftsmanship"
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
                bottom: 24,
                left: 24,
                right: 24,
                padding: "18px 24px",
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
                <div style={{ fontSize: "0.6875rem", letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--md-champagne)" }}>
                  FOUNDED IN JOHARI BAZAAR
                </div>
                <div style={{ fontFamily: "var(--md-font-display)", fontSize: "1.125rem", marginTop: 2 }}>
                  Pushpak Jewels · 1961
                </div>
              </div>
              <span style={{ fontSize: "0.875rem", color: "var(--md-champagne)", fontWeight: 600, fontFamily: "var(--md-font-crest), Georgia, serif" }}>
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
            paddingBlock: "var(--md-space-11) var(--md-space-11)",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
              marginBottom: "var(--md-space-9)",
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
              THE MINERALOGICAL VAULT
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
              gap: "var(--md-space-4)",
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
          paddingBlock: "var(--md-space-11) var(--md-space-11)",
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
            gap: "var(--md-space-5)",
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
            Collaborate directly with Amit &amp; Saket Agarwal and our master bench goldsmiths. Whether creating a custom bridal suite, resetting an heirloom emerald, or crafting a bespoke signature monogram, our Jaipur atelier brings your distinct vision to life.
          </p>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "var(--md-space-4)",
              justifyContent: "center",
              marginTop: "var(--md-space-3)",
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
                height: 52,
                paddingInline: "36px",
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
              <span>Connect with VIP Concierge</span>
              <span>→</span>
            </a>

            <Link
              href={`${prefix}/our-story`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                height: 52,
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
        </div>
      </section>

      {/* ── 8. THE PRIVATE SALON (VIP PREVIEWS) ───────────────────────── */}
      <section
        style={{
          maxWidth: "var(--md-container-text)",
          marginInline: "auto",
          paddingInline: "var(--md-gutter)",
          paddingBlock: "var(--md-space-11) var(--md-space-11)",
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
          Private Previews &amp; Seasonal Releases
        </h2>
        <p
          style={{
            margin: "10px auto 28px",
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
