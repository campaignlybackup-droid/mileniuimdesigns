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

  const firstCategorySlug = categories[0]?.slug ?? "rings";
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
      {/* ── 1. HAUTE JOAILLERIE HERO ─────────────────────────────────────── */}
      <section
        style={{
          position: "relative",
          width: "100%",
          minHeight: "clamp(540px, 78vh, 860px)",
          background: "radial-gradient(ellipse at 50% 30%, var(--md-emerald-deep) 0%, var(--md-forest) 55%, var(--md-green-black) 100%)",
          color: "var(--md-fg-inverse)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          textAlign: "center",
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
            backgroundSize: "32px 32px",
            pointerEvents: "none",
          }}
        />

        <div
          style={{
            position: "relative",
            zIndex: 2,
            maxWidth: "920px",
            marginInline: "auto",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "var(--md-space-5)",
          }}
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "var(--md-space-3)",
              padding: "6px 16px",
              borderRadius: "999px",
              border: "1px solid color-mix(in srgb, var(--md-champagne) 32%, transparent)",
              background: "color-mix(in srgb, var(--md-green-black) 60%, transparent)",
              fontSize: "0.6875rem",
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "var(--md-champagne)",
              fontWeight: 500,
            }}
          >
            HAUTE JOAILLERIE · ATELIER EST. 1984
          </div>

          <h1
            style={{
              margin: 0,
              fontFamily: "var(--md-font-display)",
              fontSize: "clamp(2.4rem, 6vw, 4.75rem)",
              lineHeight: 1.08,
              fontWeight: 400,
              letterSpacing: "-0.01em",
              color: "var(--md-fg-inverse)",
            }}
          >
            Timeless Artistry &amp; Exceptional Gemstones
          </h1>

          <p
            style={{
              margin: 0,
              maxWidth: "640px",
              fontSize: "clamp(1rem, 1.8vw, 1.1875rem)",
              lineHeight: 1.6,
              color: "var(--md-fg-inverse-muted)",
              fontWeight: 300,
            }}
          >
            Sculpted from certified 18-karat hallmarked gold, ethical solitaires, and vivid natural emeralds. Four decades of bespoke legacy.
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
            <Link
              href={`${prefix}/${firstCategorySlug}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                height: 48,
                paddingInline: "28px",
                background: "var(--md-green)",
                color: "var(--md-ivory-soft)",
                fontSize: "0.8125rem",
                fontWeight: 600,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                textDecoration: "none",
                borderRadius: "2px",
                transition: "opacity 200ms ease",
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
                paddingInline: "26px",
                border: "1px solid color-mix(in srgb, var(--md-fg-inverse) 36%, transparent)",
                background: "color-mix(in srgb, var(--md-green-black) 40%, transparent)",
                color: "var(--md-fg-inverse)",
                fontSize: "0.8125rem",
                fontWeight: 500,
                letterSpacing: "0.08em",
                textDecoration: "none",
                borderRadius: "2px",
                transition: "border-color 200ms ease",
              }}
            >
              Private Atelier Consultation
            </a>
          </div>

          {/* Quick Assurance Badges */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "center",
              gap: "clamp(16px, 3vw, 36px)",
              marginTop: "var(--md-space-8)",
              paddingTop: "var(--md-space-6)",
              borderTop: "1px solid color-mix(in srgb, var(--md-fg-inverse) 14%, transparent)",
              fontSize: "0.75rem",
              letterSpacing: "0.06em",
              color: "var(--md-fg-inverse-muted)",
            }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              ✦ BIS Hallmarked Gold
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              ✦ GIA &amp; IGI Certified
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              ✦ Insured Global Courier
            </span>
          </div>
        </div>
      </section>

      {/* ── 2. SIGNATURE CREATIONS ─────────────────────────────────────── */}
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
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                color: "var(--md-green)",
                fontWeight: 600,
                marginBottom: 6,
              }}
            >
              THE PRIVATE SUITE
            </span>
            <h2
              style={{
                margin: 0,
                fontFamily: "var(--md-font-display)",
                fontSize: "clamp(1.75rem, 3.2vw, 2.75rem)",
                fontWeight: 400,
                color: "var(--md-fg)",
              }}
            >
              Signature Creations
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
              Exceptional pieces individually hallmarked and authenticated for the connoisseur.
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

      {/* ── 3. CURATED CATEGORY PORTALS ───────────────────────────────── */}
      {categories.length > 0 && (
        <section
          style={{
            maxWidth: "var(--md-container)",
            marginInline: "auto",
            paddingInline: "var(--md-gutter)",
            paddingBlock: "var(--md-space-10) var(--md-space-10)",
            borderTop: "1px solid var(--md-rule)",
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
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                color: "var(--md-green)",
                fontWeight: 600,
                marginBottom: 6,
              }}
            >
              THE HOUSE PORTFOLIO
            </span>
            <h2
              style={{
                margin: 0,
                fontFamily: "var(--md-font-display)",
                fontSize: "clamp(1.75rem, 3.2vw, 2.75rem)",
                fontWeight: 400,
                color: "var(--md-fg)",
              }}
            >
              Curated Collections
            </h2>
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
                  borderRadius: "2px",
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
                    transition: "transform var(--md-dur, 500ms) var(--md-ease)",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    background: "linear-gradient(to top, color-mix(in srgb, var(--md-bg-inverse) 88%, transparent) 0%, color-mix(in srgb, var(--md-bg-inverse) 20%, transparent) 55%, transparent 100%)",
                    pointerEvents: "none",
                  }}
                />
                <div style={{ position: "relative", zIndex: 2 }}>
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
                      marginTop: 4,
                      fontSize: "0.75rem",
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      color: "var(--md-champagne)",
                      fontWeight: 500,
                    }}
                  >
                    View Selection →
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ── 4. THE MILLENNIUM ATELIER & CRAFTSMANSHIP ─────────────────── */}
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
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 460px), 1fr))",
            gap: "clamp(32px, 5vw, 64px)",
            alignItems: "center",
          }}
        >
          <div
            style={{
              position: "relative",
              aspectRatio: "4 / 5",
              overflow: "hidden",
              borderRadius: "2px",
              boxShadow: "0 16px 40px -12px color-mix(in srgb, var(--md-charcoal) 16%, transparent)",
            }}
          >
            <Image
              src="/images/categories/pendants.jpg"
              alt="Millennium Designs Master Craftsman Setting Fine Gemstones"
              fill
              sizes="(max-width: 768px) 100vw, 50vw"
              style={{ objectFit: "cover" }}
            />
            <div
              style={{
                position: "absolute",
                bottom: 16,
                left: 16,
                right: 16,
                padding: "12px 18px",
                background: "color-mix(in srgb, var(--md-bg-inverse) 86%, transparent)",
                backdropFilter: "blur(6px)",
                color: "var(--md-fg-inverse)",
                fontSize: "0.75rem",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span>THE BENCH ATELIER</span>
              <span style={{ color: "var(--md-champagne)" }}>HAND-SET PAVÉ</span>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "var(--md-space-5)" }}>
            <span
              style={{
                fontSize: "0.75rem",
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: "var(--md-green)",
                fontWeight: 600,
              }}
            >
              THE ATELIER HERITAGE
            </span>

            <h2
              style={{
                margin: 0,
                fontFamily: "var(--md-font-display)",
                fontSize: "clamp(2rem, 3.5vw, 3rem)",
                lineHeight: 1.15,
                fontWeight: 400,
                color: "var(--md-fg)",
              }}
            >
              Four Decades of Master Goldsmithing
            </h2>

            <p
              style={{
                margin: 0,
                fontSize: "1rem",
                lineHeight: 1.7,
                color: "var(--md-fg-secondary)",
              }}
            >
              Founded in 1984, Millennium Designs creates high jewellery that transcends fleeting trends. Every piece is brought to life by master artisans who cut, sculpt, and hand-set each rare natural stone with exacting precision.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "var(--md-space-4)", marginTop: "var(--md-space-2)" }}>
              <div style={{ display: "flex", gap: "var(--md-space-4)", alignItems: "flex-start" }}>
                <span style={{ color: "var(--md-green)", fontSize: "1.125rem", lineHeight: 1 }}>✦</span>
                <div>
                  <div style={{ fontWeight: 600, color: "var(--md-fg)", fontSize: "0.9375rem" }}>
                    Uncompromising Authenticity
                  </div>
                  <div style={{ fontSize: "0.875rem", color: "var(--md-fg-secondary)", marginTop: 2 }}>
                    Every diamond and colored gemstone is ethically sourced and independently graded by international gemological institutes.
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: "var(--md-space-4)", alignItems: "flex-start" }}>
                <span style={{ color: "var(--md-green)", fontSize: "1.125rem", lineHeight: 1 }}>✦</span>
                <div>
                  <div style={{ fontWeight: 600, color: "var(--md-fg)", fontSize: "0.9375rem" }}>
                    Artisanal Bench Execution
                  </div>
                  <div style={{ fontSize: "0.875rem", color: "var(--md-fg-secondary)", marginTop: 2 }}>
                    Hand-finished in our dedicated workshops using traditional gold alloy formulations and mirror-finished settings.
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: "var(--md-space-4)", alignItems: "flex-start" }}>
                <span style={{ color: "var(--md-green)", fontSize: "1.125rem", lineHeight: 1 }}>✦</span>
                <div>
                  <div style={{ fontWeight: 600, color: "var(--md-fg)", fontSize: "0.9375rem" }}>
                    Lifetime Stewardship
                  </div>
                  <div style={{ fontSize: "0.875rem", color: "var(--md-fg-secondary)", marginTop: 2 }}>
                    Complimentary ultrasonic cleansing, annual prong inspection, and bespoke resizing for all family acquisitions.
                  </div>
                </div>
              </div>
            </div>

            <div style={{ marginTop: "var(--md-space-3)" }}>
              <a
                href={whatsappConsultationUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  color: "var(--md-green)",
                  textDecoration: "none",
                  letterSpacing: "0.04em",
                }}
              >
                Inquire with Our Master Artisans →
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── 5. THE GEMSTONE UNIVERSE ─────────────────────────────────── */}
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
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                color: "var(--md-green)",
                fontWeight: 600,
                marginBottom: 6,
              }}
            >
              THE EARTH’S RARITIES
            </span>
            <h2
              style={{
                margin: 0,
                fontFamily: "var(--md-font-display)",
                fontSize: "clamp(1.75rem, 3.2vw, 2.75rem)",
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
              Explore creations by their signature stone, from deep Colombian emeralds to celestial sapphires.
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

      {/* ── 6. THE FOUR HALLMARKS OF ASSURANCE ───────────────────────── */}
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
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))",
              gap: "var(--md-space-6)",
            }}
          >
            <div
              style={{
                padding: "var(--md-space-6)",
                background: "var(--md-bg)",
                border: "1px solid var(--md-rule)",
                borderRadius: "2px",
                display: "flex",
                flexDirection: "column",
                gap: "var(--md-space-2)",
              }}
            >
              <div style={{ color: "var(--md-green)", fontSize: "1.25rem" }}>✦</div>
              <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 600, color: "var(--md-fg)" }}>
                Government Hallmarked
              </h3>
              <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--md-fg-secondary)", lineHeight: 1.5 }}>
                Every precious metal piece bears official BIS Hallmark accreditation verifying precise 18K and 22K alloy purity.
              </p>
            </div>

            <div
              style={{
                padding: "var(--md-space-6)",
                background: "var(--md-bg)",
                border: "1px solid var(--md-rule)",
                borderRadius: "2px",
                display: "flex",
                flexDirection: "column",
                gap: "var(--md-space-2)",
              }}
            >
              <div style={{ color: "var(--md-green)", fontSize: "1.25rem" }}>✦</div>
              <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 600, color: "var(--md-fg)" }}>
                Armored Transit Courier
              </h3>
              <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--md-fg-secondary)", lineHeight: 1.5 }}>
                Complimentary 100% insured delivery in tamper-evident security cases across India and the United States.
              </p>
            </div>

            <div
              style={{
                padding: "var(--md-space-6)",
                background: "var(--md-bg)",
                border: "1px solid var(--md-rule)",
                borderRadius: "2px",
                display: "flex",
                flexDirection: "column",
                gap: "var(--md-space-2)",
              }}
            >
              <div style={{ color: "var(--md-green)", fontSize: "1.25rem" }}>✦</div>
              <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 600, color: "var(--md-fg)" }}>
                Certified Gemological Dossier
              </h3>
              <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--md-fg-secondary)", lineHeight: 1.5 }}>
                Solitaires and colored center gems are accompanied by genuine GIA or IGI certificates detailing color, cut, and clarity.
              </p>
            </div>

            <div
              style={{
                padding: "var(--md-space-6)",
                background: "var(--md-bg)",
                border: "1px solid var(--md-rule)",
                borderRadius: "2px",
                display: "flex",
                flexDirection: "column",
                gap: "var(--md-space-2)",
              }}
            >
              <div style={{ color: "var(--md-green)", fontSize: "1.25rem" }}>✦</div>
              <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 600, color: "var(--md-fg)" }}>
                Private Concierge Access
              </h3>
              <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--md-fg-secondary)", lineHeight: 1.5 }}>
                Direct access to our senior gemologists for bespoke requests, private salon appointments, and anniversary commissions.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── 7. BESPOKE ATELIER CALL TO ACTION ─────────────────────────── */}
      <section
        style={{
          background: "var(--md-bg-inverse, #003d1f)",
          color: "var(--md-fg-inverse)",
          paddingInline: "var(--md-gutter)",
          paddingBlock: "var(--md-space-10) var(--md-space-10)",
          textAlign: "center",
        }}
      >
        <div
          style={{
            maxWidth: "720px",
            marginInline: "auto",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "var(--md-space-4)",
          }}
        >
          <span
            style={{
              fontSize: "0.6875rem",
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "var(--md-champagne)",
              fontWeight: 500,
            }}
          >
            BESPOKE COMMISSIONS
          </span>

          <h2
            style={{
              margin: 0,
              fontFamily: "var(--md-font-display)",
              fontSize: "clamp(2rem, 4vw, 3.25rem)",
              fontWeight: 400,
              color: "var(--md-fg-inverse)",
            }}
          >
            Commission a One-of-a-Kind Masterpiece
          </h2>

          <p
            style={{
              margin: 0,
              fontSize: "1rem",
              lineHeight: 1.6,
              color: "var(--md-fg-inverse-muted)",
            }}
          >
            Collaborate directly with our master designers to bring your personal vision to life — from anniversary suites to bespoke engagement rings.
          </p>

          <div style={{ marginTop: "var(--md-space-4)" }}>
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
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                textDecoration: "none",
                borderRadius: "2px",
                transition: "opacity 200ms ease",
              }}
            >
              <span>Chat with Us on WhatsApp</span>
              <span>→</span>
            </a>
          </div>
        </div>
      </section>

      {/* ── 8. PRIVATE SALON INVITATION (NEWSLETTER) ──────────────────── */}
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
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: "var(--md-green)",
            fontWeight: 600,
          }}
        >
          THE PRIVATE SALON
        </span>
        <h2
          style={{
            margin: "8px 0 0",
            fontFamily: "var(--md-font-display)",
            fontSize: "clamp(1.75rem, 3vw, 2.5rem)",
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
            lineHeight: 1.5,
          }}
        >
          Receive private invitations to confidential high jewelry viewings, new gemstone acquisitions, and atelier news.
        </p>

        <form
          action="#"
          style={{
            display: "flex",
            maxWidth: "440px",
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
              height: 46,
              paddingInline: "16px",
              border: "1px solid var(--md-rule-strong)",
              background: "var(--md-bg)",
              color: "var(--md-fg)",
              fontSize: "0.875rem",
              borderRadius: "2px",
              outline: "none",
            }}
          />
          <button
            type="submit"
            style={{
              height: 46,
              paddingInline: "24px",
              background: "var(--md-fg)",
              color: "var(--md-ivory-soft)",
              border: "none",
              borderRadius: "2px",
              fontSize: "0.75rem",
              fontWeight: 600,
              letterSpacing: "0.1em",
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
