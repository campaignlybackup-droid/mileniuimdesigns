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
    title: "MILLENNIUM DESIGNS | Fine Jewellery & Gemstones · Jaipur Atelier 1961",
    description:
      "Sixty-five years of courtly emerald curation and anti-tarnish 925 sterling silver craftsmanship. Handcrafted entirely in-house in our Jaipur atelier.",
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
      {/* ── 1. CINEMATIC HAUTE JOAILLERIE HERO ───────────────────────── */}
      <section
        data-surface="emerald-deep"
        style={{
          position: "relative",
          width: "100%",
          minHeight: "clamp(520px, 75vh, 760px)",
          background: "var(--md-emerald-deep)",
          color: "var(--md-fg-inverse)",
          display: "flex",
          alignItems: "center",
          paddingInline: "var(--md-gutter)",
          paddingBlock: "clamp(48px, 6vw, 84px)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            maxWidth: "var(--md-container)",
            marginInline: "auto",
            width: "100%",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 480px), 1fr))",
            gap: "clamp(36px, 6vw, 80px)",
            alignItems: "center",
          }}
        >
          {/* Hero Narrative Column */}
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--md-space-4)" }}>
            <span
              style={{
                fontSize: "0.6875rem",
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: "var(--md-champagne)",
                fontWeight: 600,
                fontFamily: "var(--md-font-sans), sans-serif",
              }}
            >
              JAIPUR ATELIER · ESTABLISHED 1961
            </span>

            <h1
              style={{
                margin: 0,
                fontFamily: "var(--md-font-display)",
                fontSize: "clamp(2.4rem, 5vw, 4.25rem)",
                lineHeight: 1.08,
                fontWeight: 400,
                letterSpacing: "-0.015em",
                color: "var(--md-fg-inverse)",
                textWrap: "balance",
              }}
            >
              Courtly Emeralds &amp; Cold-Forged Silver
            </h1>

            <p
              style={{
                margin: 0,
                fontSize: "clamp(0.9375rem, 1.25vw, 1.0625rem)",
                lineHeight: 1.75,
                color: "var(--md-fg-inverse-muted)",
                maxWidth: "520px",
              }}
            >
              Rare natural Colombian emeralds, celestial moonstones, and anti-tarnish 925 sterling silver. Hand-cast, faceted, and hallmarked entirely in-house in our Noor Plaza workshop.
            </p>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "var(--md-space-4)",
                paddingTop: "var(--md-space-3)",
                alignItems: "center",
              }}
            >
              <Link
                href={`${prefix}/rings`}
                className="md-btn-editorial"
                style={{
                  background: "var(--md-champagne)",
                  color: "var(--md-green-black)",
                }}
              >
                Explore the Creations
              </Link>

              <Link
                href={`${prefix}/our-story`}
                style={{
                  fontSize: "0.75rem",
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "var(--md-fg-inverse)",
                  textDecoration: "underline",
                  textUnderlineOffset: "6px",
                  fontWeight: 500,
                  transition: "opacity 180ms ease",
                }}
              >
                The 1961 Lineage
              </Link>
            </div>
          </div>

          {/* Hero Architectural Photography Showcase */}
          <div
            style={{
              position: "relative",
              width: "100%",
              aspectRatio: "4 / 5",
              maxHeight: "620px",
              overflow: "hidden",
            }}
          >
            <Image
              src="/images/hero-emerald-ring.jpg"
              alt="Handcrafted emerald solitaire ring forged in our Jaipur atelier"
              fill
              sizes="(min-width: 1024px) 50vw, 100vw"
              priority
              style={{
                objectFit: "cover",
              }}
            />
          </div>
        </div>
      </section>

      {/* ── 2. THE HOUSE MANIFESTO (EDITORIAL BREATHING SPACE) ─────── */}
      <section
        data-surface="ivory-soft"
        style={{
          maxWidth: "var(--md-container)",
          marginInline: "auto",
          paddingInline: "var(--md-gutter)",
          paddingBlock: "clamp(64px, 9vw, 120px)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
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
            marginBottom: "var(--md-space-4)",
          }}
        >
          THE ATELIER PHILOSOPHY
        </span>

        <blockquote
          style={{
            margin: 0,
            maxWidth: "880px",
            fontFamily: "var(--md-font-display)",
            fontSize: "clamp(1.75rem, 3.4vw, 2.75rem)",
            fontWeight: 400,
            lineHeight: 1.3,
            letterSpacing: "-0.015em",
            color: "var(--md-fg)",
            textWrap: "balance",
          }}
        >
          “We believe true luxury requires patience, natural minerals, and hands that have shaped silver for generations. Nothing in our collection is ever outsourced.”
        </blockquote>

        <p
          style={{
            margin: "var(--md-space-5) auto 0",
            maxWidth: "600px",
            fontSize: "clamp(0.9375rem, 1.2vw, 1.0625rem)",
            lineHeight: 1.8,
            color: "var(--md-fg-secondary)",
          }}
        >
          Founded in 1961 by B.L. Agarwal in Johari Bazaar, Pushpak Jewels built an international reputation for rare untreated emeralds. Today, under Millennium Designs, Saket and Amit Agarwal continue the bench tradition in Jaipur — marrying courtly gemstones with a proprietary anti-tarnish 925 alloy.
        </p>

        {/* 3 Quiet House Truths */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: "clamp(24px, 4vw, 48px)",
            width: "100%",
            maxWidth: "1000px",
            marginTop: "clamp(48px, 6vw, 80px)",
            paddingTop: "var(--md-space-6)",
            borderTop: "1px solid var(--md-rule)",
            textAlign: "left",
          }}
        >
          <div>
            <h3
              style={{
                margin: 0,
                fontFamily: "var(--md-font-display)",
                fontSize: "1.125rem",
                fontWeight: 500,
                color: "var(--md-fg)",
              }}
            >
              100% In-House Atelier
            </h3>
            <p style={{ margin: "8px 0 0", fontSize: "0.875rem", color: "var(--md-fg-secondary)", lineHeight: 1.65 }}>
              From initial sketch and lost-wax casting to hand-prong setting, every piece remains within our Jaipur facility.
            </p>
          </div>

          <div>
            <h3
              style={{
                margin: 0,
                fontFamily: "var(--md-font-display)",
                fontSize: "1.125rem",
                fontWeight: 500,
                color: "var(--md-fg)",
              }}
            >
              Anti-Tarnish 925 Alloy
            </h3>
            <p style={{ margin: "8px 0 0", fontSize: "0.875rem", color: "var(--md-fg-secondary)", lineHeight: 1.65 }}>
              Pure sterling silver alloyed with precious elements to permanently shield its mirror polish from atmospheric oxidation.
            </p>
          </div>

          <div>
            <h3
              style={{
                margin: 0,
                fontFamily: "var(--md-font-display)",
                fontSize: "1.125rem",
                fontWeight: 500,
                color: "var(--md-fg)",
              }}
            >
              Direct Bench Provenance
            </h3>
            <p style={{ margin: "8px 0 0", fontSize: "0.875rem", color: "var(--md-fg-secondary)", lineHeight: 1.65 }}>
              Exhibited at Vicenza, Basel, and New York. Global collectors acquire heirloom creations directly from our family atelier.
            </p>
          </div>
        </div>
      </section>

      {/* ── 3. ARCHIVAL MASTERPIECE SHOWCASE (THE SUITE) ───────────── */}
      {featuredProducts.length > 0 && (
        <section
          style={{
            maxWidth: "var(--md-container)",
            marginInline: "auto",
            paddingInline: "var(--md-gutter)",
            paddingBlock: "clamp(48px, 6vw, 96px)",
            borderTop: "1px solid var(--md-rule)",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              marginBottom: "clamp(32px, 4vw, 56px)",
            }}
          >
            <span
              style={{
                fontSize: "0.6875rem",
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: "var(--md-fg-secondary)",
                fontWeight: 600,
                marginBottom: 8,
              }}
            >
              CURATED SELECTIONS
            </span>
            <h2
              style={{
                margin: 0,
                fontFamily: "var(--md-font-display)",
                fontSize: "clamp(2rem, 3.6vw, 3rem)",
                fontWeight: 400,
                color: "var(--md-fg)",
                letterSpacing: "-0.01em",
              }}
            >
              Archival Masterpieces
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
              Individually documented creations, hallmarked in solid sterling silver and archived for connoisseurs worldwide.
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

      {/* ── 4. ART OF THE ATELIER (JAIPUR CRAFTSMANSHIP SPREAD) ───────── */}
      <section
        data-surface="forest"
        style={{
          background: "var(--md-forest)",
          color: "var(--md-fg-inverse)",
          paddingInline: "var(--md-gutter)",
          paddingBlock: "clamp(64px, 8vw, 112px)",
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
            gap: "clamp(40px, 6vw, 84px)",
            alignItems: "center",
          }}
        >
          {/* Craftsmanship Image */}
          <div
            style={{
              position: "relative",
              aspectRatio: "4 / 5",
              maxHeight: "580px",
              overflow: "hidden",
            }}
          >
            <Image
              src="/images/story/atelier_bench_silversmith.jpg"
              alt="Master silversmith at work in our Jaipur workshop"
              fill
              sizes="(min-width: 1024px) 50vw, 100vw"
              style={{ objectFit: "cover" }}
            />
          </div>

          {/* Craftsmanship Narrative */}
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--md-space-4)" }}>
            <span
              style={{
                fontSize: "0.6875rem",
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: "var(--md-champagne)",
                fontWeight: 600,
              }}
            >
              HERITAGE OF THE BENCH
            </span>

            <h2
              style={{
                margin: 0,
                fontFamily: "var(--md-font-display)",
                fontSize: "clamp(2rem, 3.5vw, 3rem)",
                fontWeight: 400,
                lineHeight: 1.15,
                color: "var(--md-fg-inverse)",
                letterSpacing: "-0.01em",
              }}
            >
              Preserving the Lost-Wax Casting Tradition
            </h2>

            <p
              style={{
                margin: 0,
                fontSize: "clamp(0.9375rem, 1.2vw, 1.0625rem)",
                lineHeight: 1.8,
                color: "var(--md-fg-inverse-muted)",
              }}
            >
              Every contour begins with a gouache hand-drawing, translated into an intricate wax master model before being cast in molten 925 sterling silver.
            </p>

            <p
              style={{
                margin: 0,
                fontSize: "clamp(0.9375rem, 1.2vw, 1.0625rem)",
                lineHeight: 1.8,
                color: "var(--md-fg-inverse-muted)",
              }}
            >
              Our lapidaries inspect each gemstone under cross-polarised light to ensure natural crystal integrity. No composite stones, no unstable heat treatments — only pure mineral character set by hand with microscopic accuracy.
            </p>

            <div style={{ paddingTop: "var(--md-space-3)" }}>
              <Link
                href={`${prefix}/our-story`}
                style={{
                  fontSize: "0.75rem",
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "var(--md-champagne)",
                  textDecoration: "underline",
                  textUnderlineOffset: "6px",
                  fontWeight: 600,
                }}
              >
                Read Our Story &amp; Heritage →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── 5. CURATED ARCHIVAL COLLECTIONS (GALLERY DISCOVERY) ──────── */}
      {categories.length > 0 && (
        <section
          style={{
            maxWidth: "var(--md-container)",
            marginInline: "auto",
            paddingInline: "var(--md-gutter)",
            paddingBlock: "clamp(64px, 8vw, 108px)",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              marginBottom: "clamp(32px, 4vw, 56px)",
            }}
          >
            <span
              style={{
                fontSize: "0.6875rem",
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: "var(--md-fg-secondary)",
                fontWeight: 600,
                marginBottom: 8,
              }}
            >
              THE TAXONOMY
            </span>
            <h2
              style={{
                margin: 0,
                fontFamily: "var(--md-font-display)",
                fontSize: "clamp(2rem, 3.5vw, 3rem)",
                fontWeight: 400,
                color: "var(--md-fg)",
                letterSpacing: "-0.01em",
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
                lineHeight: 1.6,
              }}
            >
              From Byzantine hand-woven chains to courtly solitaire rings, discover each category forged in our atelier.
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 340px), 1fr))",
              gap: "clamp(20px, 3vw, 36px)",
            }}
          >
            {categories.slice(0, 6).map((c) => (
              <Link
                key={c.id}
                href={`${prefix}/${c.slug}`}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  textDecoration: "none",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    position: "relative",
                    aspectRatio: "4 / 5",
                    overflow: "hidden",
                    background: "var(--md-bg-raised)",
                  }}
                >
                  <img
                    src={getCategoryImage(c.slug)}
                    alt={c.name}
                    loading="lazy"
                    decoding="async"
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      transition: "opacity 300ms ease",
                    }}
                  />
                </div>

                <div style={{ paddingTop: "var(--md-space-3)" }}>
                  <h3
                    style={{
                      margin: 0,
                      fontFamily: "var(--md-font-display)",
                      fontSize: "1.25rem",
                      fontWeight: 400,
                      letterSpacing: "-0.01em",
                      color: "var(--md-fg)",
                    }}
                  >
                    {c.name}
                  </h3>
                  <span
                    style={{
                      fontSize: "0.6875rem",
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                      color: "var(--md-fg-secondary)",
                      marginTop: "4px",
                      display: "block",
                    }}
                  >
                    Explore Collection →
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ── 6. NATURAL GEMSTONES LAPIDARY ARCHIVE ────────────────────── */}
      {stones.length > 0 && (
        <section
          style={{
            maxWidth: "var(--md-container)",
            marginInline: "auto",
            paddingInline: "var(--md-gutter)",
            paddingBlock: "clamp(48px, 6vw, 96px)",
            borderTop: "1px solid var(--md-rule)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-end",
              marginBottom: "clamp(32px, 4vw, 48px)",
              flexWrap: "wrap",
              gap: "var(--md-space-4)",
            }}
          >
            <div>
              <span
                style={{
                  fontSize: "0.6875rem",
                  letterSpacing: "0.22em",
                  textTransform: "uppercase",
                  color: "var(--md-fg-secondary)",
                  fontWeight: 600,
                  display: "block",
                  marginBottom: 8,
                }}
              >
                UNHEATED NATURAL MINERALS
              </span>
              <h2
                style={{
                  margin: 0,
                  fontFamily: "var(--md-font-display)",
                  fontSize: "clamp(2rem, 3.5vw, 3rem)",
                  fontWeight: 400,
                  color: "var(--md-fg)",
                  letterSpacing: "-0.01em",
                }}
              >
                The Gemstone Archive
              </h2>
            </div>

            <Link
              href={`${prefix}/stones`}
              style={{
                fontSize: "0.75rem",
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "var(--md-fg)",
                textDecoration: "underline",
                textUnderlineOffset: "4px",
                fontWeight: 600,
              }}
            >
              View All Stones ({stones.length}) →
            </Link>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 260px), 1fr))",
              gap: "clamp(16px, 2.5vw, 28px)",
            }}
          >
            {stones.slice(0, 4).map((stone) => (
              <StoneCard
                key={stone.id}
                stone={stone}
                marketSegment={resolved.code.toLowerCase() === "us" ? "" : resolved.code.toLowerCase()}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── 7. PRIVATE ATELIER CONCIERGE & BESPOKE INQUIRY ──────────── */}
      <section
        data-surface="ivory"
        style={{
          background: "var(--md-bg-raised)",
          borderTop: "1px solid var(--md-rule)",
          paddingInline: "var(--md-gutter)",
          paddingBlock: "clamp(64px, 8vw, 112px)",
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
              color: "var(--md-fg-secondary)",
              fontWeight: 600,
            }}
          >
            DIRECT ATELIER ACCESS
          </span>

          <h2
            style={{
              margin: 0,
              fontFamily: "var(--md-font-display)",
              fontSize: "clamp(2rem, 3.6vw, 3.25rem)",
              fontWeight: 400,
              color: "var(--md-fg)",
              letterSpacing: "-0.015em",
            }}
          >
            Private Commissions &amp; Sizing
          </h2>

          <p
            style={{
              margin: 0,
              fontSize: "clamp(0.9375rem, 1.2vw, 1.0625rem)",
              lineHeight: 1.75,
              color: "var(--md-fg-secondary)",
            }}
          >
            Whether requesting bespoke sizing for a sovereign ring, custom chain lengths, or sourcing a specific unheated emerald cut, our master jewelers assist you directly from our Jaipur workshop.
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
              className="md-btn-editorial"
              style={{
                background: "var(--md-emerald-deep)",
                color: "var(--md-ivory-soft)",
              }}
            >
              WhatsApp Concierge Consultation
            </a>

            <Link
              href={`${prefix}/our-story`}
              className="md-btn-editorial"
              style={{
                border: "1px solid var(--md-rule-strong)",
                background: "transparent",
                color: "var(--md-fg)",
              }}
            >
              Visit Our Atelier Story
            </Link>
          </div>

          <div
            style={{
              marginTop: "var(--md-space-4)",
              fontSize: "0.8125rem",
              color: "var(--md-fg-secondary)",
              display: "flex",
              alignItems: "center",
              gap: "var(--md-space-4)",
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <span>Direct Atelier Lines:</span>
            <a href="tel:+919828156465" style={{ color: "var(--md-fg)", textDecoration: "none", fontWeight: 600 }}>
              +91 98281 56465
            </a>
            <span>·</span>
            <a href="tel:+919829056597" style={{ color: "var(--md-fg)", textDecoration: "none", fontWeight: 600 }}>
              +91 98290 56597
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
