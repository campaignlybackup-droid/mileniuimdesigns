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
      {/* ── 1. HAUTE JOAILLERIE FLAGSHIP HERO ───────────────────────── */}
      <section
        style={{
          position: "relative",
          width: "100%",
          minHeight: "clamp(620px, 85vh, 920px)",
          background: "radial-gradient(ellipse at 50% 25%, var(--md-emerald-deep) 0%, var(--md-forest) 50%, var(--md-green-black) 100%)",
          color: "var(--md-fg-inverse)",
          display: "flex",
          alignItems: "center",
          paddingInline: "var(--md-gutter)",
          paddingBlock: "var(--md-space-10) var(--md-space-8)",
          overflow: "hidden",
        }}
      >
        {/* Subtle decorative background watermark glow */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            opacity: 0.04,
            backgroundImage: "radial-gradient(circle at 50% 50%, var(--md-champagne) 1px, transparent 1px)",
            backgroundSize: "36px 36px",
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
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 480px), 1fr))",
            gap: "clamp(36px, 6vw, 72px)",
            alignItems: "center",
          }}
        >
          {/* Left Column: Regal Atelier Copy & Actions */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--md-space-5)",
              textAlign: "left",
            }}
          >
            {/* Heritage Monogram Badge */}
            <div
              style={{
                alignSelf: "flex-start",
                display: "inline-flex",
                alignItems: "center",
                gap: "var(--md-space-3)",
                padding: "8px 18px",
                borderRadius: "var(--md-radius-sm)",
                border: "1px solid color-mix(in srgb, var(--md-champagne) 36%, transparent)",
                background: "color-mix(in srgb, var(--md-green-black) 70%, transparent)",
                fontSize: "0.6875rem",
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: "var(--md-champagne)",
                fontWeight: 600,
                fontFamily: "var(--md-font-crest), Georgia, serif",
              }}
            >
              <span>PUSHPAK JEWELS 1961</span>
              <span style={{ opacity: 0.4 }}>·</span>
              <span>JAIPUR ATELIER</span>
            </div>

            <h1
              style={{
                margin: 0,
                fontFamily: "var(--md-font-display)",
                fontSize: "clamp(2.75rem, 5.5vw, 4.75rem)",
                lineHeight: 1.06,
                fontWeight: 400,
                letterSpacing: "-0.015em",
                color: "var(--md-fg-inverse)",
                textWrap: "balance",
              }}
            >
              Generations of Emerald Mastery &amp; Handcrafted 925 Silver
            </h1>

            <p
              style={{
                margin: 0,
                fontSize: "clamp(1rem, 1.5vw, 1.1875rem)",
                lineHeight: 1.65,
                color: "var(--md-fg-inverse-muted)",
                maxWidth: "600px",
              }}
            >
              Rooted in Jaipur’s historic Johari Bazaar since 1961, our family atelier shapes rare natural gemstones and anti-tarnish 925 sterling silver into heirlooms of enduring distinction. 100% in-house manufacturing, BIS hallmarked, and delivered directly to collectors worldwide.
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
                  height: 52,
                  paddingInline: "36px",
                  background: "var(--md-bg-inverse)",
                  color: "var(--md-ivory-soft)",
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  textDecoration: "none",
                  borderRadius: "var(--md-radius-sm)",
                  border: "1px solid color-mix(in srgb, var(--md-champagne) 40%, transparent)",
                  boxShadow: "0 8px 24px -6px rgba(0, 61, 31, 0.5)",
                  transition: "transform 200ms ease, box-shadow 200ms ease",
                }}
              >
                Explore Catalogue →
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
                  height: 52,
                  paddingInline: "28px",
                  border: "1px solid color-mix(in srgb, var(--md-fg-inverse) 32%, transparent)",
                  background: "color-mix(in srgb, var(--md-green-black) 45%, transparent)",
                  color: "var(--md-fg-inverse)",
                  fontSize: "0.8125rem",
                  fontWeight: 500,
                  letterSpacing: "0.08em",
                  textDecoration: "none",
                  borderRadius: "var(--md-radius-sm)",
                  transition: "border-color 200ms ease, background 200ms ease",
                }}
              >
                <span>Private Atelier Consultation</span>
              </a>
            </div>

            {/* Quick Assurance Strip */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "clamp(14px, 2.5vw, 28px)",
                marginTop: "var(--md-space-6)",
                paddingTop: "var(--md-space-5)",
                borderTop: "1px solid color-mix(in srgb, var(--md-fg-inverse) 14%, transparent)",
                fontSize: "0.75rem",
                letterSpacing: "0.08em",
                color: "var(--md-fg-inverse-muted)",
              }}
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                ✦ BIS 925 Hallmarked
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                ✦ Anti-Tarnish Metallurgy
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                ✦ Johari In-House Atelier
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                ✦ 60+ Year Heritage
              </span>
            </div>
          </div>

          {/* Right Column: Signature Editorial Showcase */}
          <div
            style={{
              position: "relative",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            {/* Visual Frame */}
            <div
              style={{
                position: "relative",
                width: "100%",
                maxWidth: "480px",
                aspectRatio: "3 / 4",
                borderRadius: "var(--md-radius-sm)",
                overflow: "hidden",
                boxShadow: "0 24px 60px -12px rgba(6, 19, 13, 0.7), 0 0 0 1px rgba(200, 178, 122, 0.25)",
              }}
            >
              <Image
                src="/images/categories/rings.jpg"
                alt="Millennium Designs Signature Emerald and Sterling Silver Ring"
                fill
                priority
                sizes="(max-width: 768px) 100vw, 480px"
                style={{ objectFit: "cover" }}
              />

              {/* Gradient Scrim */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "linear-gradient(to top, rgba(6, 19, 13, 0.9) 0%, rgba(6, 19, 13, 0.15) 50%, transparent 100%)",
                  pointerEvents: "none",
                }}
              />

              {/* Floating Atelier Medallion */}
              <div
                style={{
                  position: "absolute",
                  bottom: "var(--md-space-6)",
                  left: "var(--md-space-6)",
                  right: "var(--md-space-6)",
                  padding: "var(--md-space-4) var(--md-space-5)",
                  background: "color-mix(in srgb, var(--md-green-black) 82%, transparent)",
                  backdropFilter: "blur(12px)",
                  borderRadius: "var(--md-radius-sm)",
                  border: "1px solid color-mix(in srgb, var(--md-champagne) 30%, transparent)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ fontSize: "0.6875rem", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--md-champagne)" }}>
                    SIGNATURE SUITE
                  </div>
                  <div style={{ fontFamily: "var(--md-font-display)", fontSize: "1.125rem", color: "var(--md-fg-inverse)", marginTop: 2 }}>
                    Jaipur Emerald Solitaire
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "0.6875rem", letterSpacing: "0.1em", color: "var(--md-fg-inverse-muted)" }}>
                    PURITY
                  </div>
                  <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--md-champagne)", letterSpacing: "0.06em" }}>
                    925 SILVER
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 2. SIGNATURE MASTERPIECES ─────────────────────────────────── */}
      {featuredProducts.length > 0 && (
        <section
          style={{
            maxWidth: "var(--md-container)",
            marginInline: "auto",
            paddingInline: "var(--md-gutter)",
            paddingBlock: "var(--md-space-10) var(--md-space-8)",
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
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: "var(--md-green)",
                fontWeight: 600,
                fontFamily: "var(--md-font-crest), Georgia, serif",
                marginBottom: 6,
              }}
            >
              THE PRIVATE SUITE
            </span>
            <h2
              style={{
                margin: 0,
                fontFamily: "var(--md-font-display)",
                fontSize: "clamp(1.875rem, 3.5vw, 2.875rem)",
                fontWeight: 400,
                color: "var(--md-fg)",
              }}
            >
              Signature Masterpieces
            </h2>
            <p
              style={{
                margin: "8px 0 0",
                maxWidth: "540px",
                fontSize: "0.9375rem",
                color: "var(--md-fg-secondary)",
                lineHeight: 1.6,
              }}
            >
              Individual creations hand-finished by senior Jaipur goldsmiths, authenticated and hallmarked for the discerning collector.
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

      {/* ── 3. THE FOUR PILLARS OF MILLENNIUM MASTERY ──────────────────── */}
      <section
        style={{
          background: "var(--md-bg-raised)",
          borderTop: "1px solid var(--md-rule)",
          borderBottom: "1px solid var(--md-rule)",
          paddingInline: "var(--md-gutter)",
          paddingBlock: "var(--md-space-10) var(--md-space-10)",
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
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: "var(--md-green)",
                fontWeight: 600,
                fontFamily: "var(--md-font-crest), Georgia, serif",
              }}
            >
              SIX DECADES OF TRUST
            </span>
            <h2
              style={{
                margin: "8px 0 0",
                fontFamily: "var(--md-font-display)",
                fontSize: "clamp(1.875rem, 3.2vw, 2.75rem)",
                fontWeight: 400,
                color: "var(--md-fg)",
              }}
            >
              The Four Pillars of Millennium Mastery
            </h2>
            <p
              style={{
                margin: "8px auto 0",
                maxWidth: "560px",
                fontSize: "0.9375rem",
                color: "var(--md-fg-secondary)",
                lineHeight: 1.6,
              }}
            >
              How our grandfather’s 1961 founding principles in Johari Bazaar continue to govern every piece we cast today.
            </p>
          </div>

          {/* Asymmetric Luxury Editorial 4-Pillar Grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))",
              gap: "var(--md-space-6)",
            }}
          >
            {/* Pillar 1 */}
            <div
              style={{
                background: "var(--md-bg)",
                border: "1px solid var(--md-rule)",
                borderRadius: "var(--md-radius-sm)",
                padding: "var(--md-space-6)",
                display: "flex",
                flexDirection: "column",
                gap: "var(--md-space-3)",
                boxShadow: "0 4px 16px -4px rgba(0, 0, 0, 0.03)",
              }}
            >
              <div
                style={{
                  fontFamily: "var(--md-font-crest), Georgia, serif",
                  fontSize: "1.25rem",
                  color: "var(--md-champagne)",
                  fontWeight: 600,
                }}
              >
                01
              </div>
              <h3 style={{ margin: 0, fontSize: "1.0625rem", fontWeight: 600, color: "var(--md-fg)" }}>
                Jaipur Emerald Dynasty
              </h3>
              <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--md-fg-secondary)", lineHeight: 1.6 }}>
                Founded as Pushpak Jewels in 1961 by B. L. Agarwal, our roots began in Jaipur’s world-famous emerald trade. We personally source and hand-select each natural gemstone from certified ethical origins.
              </p>
            </div>

            {/* Pillar 2 */}
            <div
              style={{
                background: "var(--md-bg)",
                border: "1px solid var(--md-rule)",
                borderRadius: "var(--md-radius-sm)",
                padding: "var(--md-space-6)",
                display: "flex",
                flexDirection: "column",
                gap: "var(--md-space-3)",
                boxShadow: "0 4px 16px -4px rgba(0, 0, 0, 0.03)",
              }}
            >
              <div
                style={{
                  fontFamily: "var(--md-font-crest), Georgia, serif",
                  fontSize: "1.25rem",
                  color: "var(--md-champagne)",
                  fontWeight: 600,
                }}
              >
                02
              </div>
              <h3 style={{ margin: 0, fontSize: "1.0625rem", fontWeight: 600, color: "var(--md-fg)" }}>
                Proprietary Anti-Tarnish Alloy
              </h3>
              <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--md-fg-secondary)", lineHeight: 1.6 }}>
                Our 925 sterling silver is alloyed with advanced metallurgical science to resist oxidation and discoloration. Your jewellery maintains its pristine, luminous mirror finish year after year.
              </p>
            </div>

            {/* Pillar 3 */}
            <div
              style={{
                background: "var(--md-bg)",
                border: "1px solid var(--md-rule)",
                borderRadius: "var(--md-radius-sm)",
                padding: "var(--md-space-6)",
                display: "flex",
                flexDirection: "column",
                gap: "var(--md-space-3)",
                boxShadow: "0 4px 16px -4px rgba(0, 0, 0, 0.03)",
              }}
            >
              <div
                style={{
                  fontFamily: "var(--md-font-crest), Georgia, serif",
                  fontSize: "1.25rem",
                  color: "var(--md-champagne)",
                  fontWeight: 600,
                }}
              >
                03
              </div>
              <h3 style={{ margin: 0, fontSize: "1.0625rem", fontWeight: 600, color: "var(--md-fg)" }}>
                100% In-House Atelier
              </h3>
              <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--md-fg-secondary)", lineHeight: 1.6 }}>
                Every single piece is designed, 3D modelled, cast, stone-set, and hallmarked under one single roof in our Jaipur workshop. We never outsource crafting, ensuring uncompromising quality control.
              </p>
            </div>

            {/* Pillar 4 */}
            <div
              style={{
                background: "var(--md-bg)",
                border: "1px solid var(--md-rule)",
                borderRadius: "var(--md-radius-sm)",
                padding: "var(--md-space-6)",
                display: "flex",
                flexDirection: "column",
                gap: "var(--md-space-3)",
                boxShadow: "0 4px 16px -4px rgba(0, 0, 0, 0.03)",
              }}
            >
              <div
                style={{
                  fontFamily: "var(--md-font-crest), Georgia, serif",
                  fontSize: "1.25rem",
                  color: "var(--md-champagne)",
                  fontWeight: 600,
                }}
              >
                04
              </div>
              <h3 style={{ margin: 0, fontSize: "1.0625rem", fontWeight: 600, color: "var(--md-fg)" }}>
                Direct Manufacturer Access
              </h3>
              <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--md-fg-secondary)", lineHeight: 1.6 }}>
                Serving prestigious trade shows and discerning buyers in the US, Europe, and Asia for over 25 years. You acquire genuine fine jewellery directly from the creator at direct manufacturer pricing.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── 4. CURATED CATEGORY PORTALS ───────────────────────────────── */}
      {categories.length > 0 && (
        <section
          style={{
            maxWidth: "var(--md-container)",
            marginInline: "auto",
            paddingInline: "var(--md-gutter)",
            paddingBlock: "var(--md-space-10) var(--md-space-10)",
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
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: "var(--md-green)",
                fontWeight: 600,
                fontFamily: "var(--md-font-crest), Georgia, serif",
                marginBottom: 6,
              }}
            >
              THE HOUSE PORTFOLIO
            </span>
            <h2
              style={{
                margin: 0,
                fontFamily: "var(--md-font-display)",
                fontSize: "clamp(1.875rem, 3.2vw, 2.75rem)",
                fontWeight: 400,
                color: "var(--md-fg)",
              }}
            >
              Curated Collections
            </h2>
            <p
              style={{
                margin: "8px 0 0",
                maxWidth: "520px",
                fontSize: "0.9375rem",
                color: "var(--md-fg-secondary)",
                lineHeight: 1.5,
              }}
            >
              Explore our master-crafted categories, from Venetian box links to hand-set emerald medallions.
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
                  boxShadow: "0 8px 24px -6px rgba(0, 0, 0, 0.08)",
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
                    transition: "transform 600ms var(--md-ease)",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    background: "linear-gradient(to top, rgba(6, 19, 13, 0.92) 0%, rgba(6, 19, 13, 0.3) 55%, transparent 100%)",
                    pointerEvents: "none",
                  }}
                />
                <div style={{ position: "relative", zIndex: 2 }}>
                  <div
                    style={{
                      fontSize: "0.6875rem",
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                      color: "var(--md-champagne)",
                      fontWeight: 600,
                      marginBottom: 4,
                      fontFamily: "var(--md-font-crest), Georgia, serif",
                    }}
                  >
                    COLLECTION
                  </div>
                  <h3
                    style={{
                      margin: 0,
                      fontFamily: "var(--md-font-display)",
                      fontSize: "clamp(1.5rem, 2.2vw, 2.125rem)",
                      fontWeight: 400,
                      letterSpacing: "0.02em",
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
                    <span>View Creations</span>
                    <span>→</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ── 5. THE AGARWAL HERITAGE TIMELINE ─────────────────────────── */}
      <section
        style={{
          background: "var(--md-bg-inverse)",
          color: "var(--md-fg-inverse)",
          paddingInline: "var(--md-gutter)",
          paddingBlock: "var(--md-space-10) var(--md-space-11)",
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
            gap: "clamp(36px, 6vw, 72px)",
            alignItems: "center",
          }}
        >
          {/* Heritage Timeline Narrative */}
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--md-space-5)" }}>
            <span
              style={{
                fontSize: "0.75rem",
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: "var(--md-champagne)",
                fontWeight: 600,
                fontFamily: "var(--md-font-crest), Georgia, serif",
              }}
            >
              SINCE 1961 · JAIPUR
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
              The Story of Millennium Designs
            </h2>

            <p
              style={{
                margin: 0,
                fontSize: "1.0625rem",
                lineHeight: 1.7,
                color: "var(--md-fg-inverse-muted)",
              }}
            >
              The story began in 1961, when our grandfather B. L. Agarwal founded Pushpak Jewels in Jaipur. Specializing in emerald jewelry, he built a business rooted in trust, authenticity, and exceptional quality.
            </p>

            <p
              style={{
                margin: 0,
                fontSize: "0.9375rem",
                lineHeight: 1.7,
                color: "var(--md-fg-inverse-muted)",
              }}
            >
              In 1999, the next generation—Amit Agarwal and Saket Agarwal—expanded the family business into fine 925 silver jewelry. Showcasing at premier international exhibitions in Europe and the United States, Pushpak Jewels evolved into Millennium Designs: uniting generational stone mastery with world-class design.
            </p>

            <div style={{ marginTop: "var(--md-space-3)", display: "flex", gap: "var(--md-space-4)", flexWrap: "wrap" }}>
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
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  textDecoration: "none",
                  borderRadius: "var(--md-radius-sm)",
                }}
              >
                Read The Full Story →
              </Link>
            </div>
          </div>

          {/* Heritage Archival Image Frame */}
          <div
            style={{
              position: "relative",
              aspectRatio: "4 / 5",
              borderRadius: "var(--md-radius-sm)",
              overflow: "hidden",
              boxShadow: "0 24px 60px -12px rgba(0, 0, 0, 0.6)",
              border: "1px solid color-mix(in srgb, var(--md-champagne) 30%, transparent)",
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
                background: "linear-gradient(to top, rgba(6, 19, 13, 0.85) 0%, rgba(6, 19, 13, 0.15) 50%, transparent 100%)",
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
                background: "rgba(6, 19, 13, 0.85)",
                backdropFilter: "blur(12px)",
                borderRadius: "var(--md-radius-sm)",
                border: "1px solid rgba(200, 178, 122, 0.3)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                color: "var(--md-fg-inverse)",
              }}
            >
              <div>
                <div style={{ fontSize: "0.6875rem", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--md-champagne)" }}>
                  ARCHIVAL ATELIER
                </div>
                <div style={{ fontFamily: "var(--md-font-display)", fontSize: "1.0625rem", marginTop: 2 }}>
                  Pushpak Jewels to Millennium Designs
                </div>
              </div>
              <span style={{ fontSize: "0.8125rem", color: "var(--md-champagne)", fontWeight: 600 }}>
                1961 · 2026
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ── 6. THE GEMSTONE UNIVERSE ─────────────────────────────────── */}
      {stones.length > 0 && (
        <section
          style={{
            maxWidth: "var(--md-container)",
            marginInline: "auto",
            paddingInline: "var(--md-gutter)",
            paddingBlock: "var(--md-space-10) var(--md-space-10)",
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
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: "var(--md-green)",
                fontWeight: 600,
                fontFamily: "var(--md-font-crest), Georgia, serif",
                marginBottom: 6,
              }}
            >
              THE EARTH’S RARITIES
            </span>
            <h2
              style={{
                margin: 0,
                fontFamily: "var(--md-font-display)",
                fontSize: "clamp(1.875rem, 3.2vw, 2.75rem)",
                fontWeight: 400,
                color: "var(--md-fg)",
              }}
            >
              The Gemstone Universe
            </h2>
            <p
              style={{
                margin: "8px 0 0",
                maxWidth: "520px",
                fontSize: "0.9375rem",
                color: "var(--md-fg-secondary)",
                lineHeight: 1.5,
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

      {/* ── 7. BESPOKE COMMISSION SALON & CONCIERGE ───────────────────── */}
      <section
        style={{
          background: "radial-gradient(ellipse at 50% 50%, var(--md-forest) 0%, var(--md-green-black) 100%)",
          color: "var(--md-fg-inverse)",
          paddingInline: "var(--md-gutter)",
          paddingBlock: "var(--md-space-10) var(--md-space-10)",
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
              letterSpacing: "0.24em",
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
            Commission a One-of-a-Kind Masterpiece
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
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                textDecoration: "none",
                borderRadius: "var(--md-radius-sm)",
                boxShadow: "0 8px 24px -4px rgba(0, 156, 23, 0.4)",
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
          paddingBlock: "var(--md-space-10) var(--md-space-10)",
          textAlign: "center",
        }}
      >
        <span
          style={{
            fontSize: "0.75rem",
            letterSpacing: "0.22em",
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
