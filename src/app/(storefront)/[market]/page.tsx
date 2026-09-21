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
import { ArchivalShowcase } from "@/components/storefront/ArchivalShowcase";
import { getCategoryImage } from "@/lib/media/categoryImages";
import { buildWhatsAppInquiryUrl } from "@/lib/whatsapp";
import { HeroCampaignSlider } from "@/components/storefront/HeroCampaignSlider";

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
      {/* ── 1. CINEMATIC HIGH-FASHION CAMPAIGN SLIDER ───────────────── */}
      <HeroCampaignSlider marketPrefix={prefix} />

      {/* ── 2. THE HOUSE MANIFESTO (EDITORIAL BREATHING SPACE) ─────── */}
      <section
        data-surface="ivory-soft"
        style={{
          maxWidth: "var(--md-container)",
          marginInline: "auto",
          paddingInline: "var(--md-gutter)",
          paddingBlock: "clamp(40px, 6vw, 96px)",
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
            marginBottom: "var(--md-space-3)",
          }}
        >
          THE ATELIER PHILOSOPHY
        </span>

        <blockquote
          style={{
            margin: 0,
            maxWidth: "880px",
            fontFamily: "var(--md-font-display)",
            fontSize: "clamp(1.35rem, 3.2vw, 2.75rem)",
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
            margin: "clamp(14px, 2.5vw, 24px) auto 0",
            maxWidth: "600px",
            fontSize: "clamp(0.875rem, 1.2vw, 1.0625rem)",
            lineHeight: 1.75,
            color: "var(--md-fg-secondary)",
          }}
        >
          Founded in 1961 by B.L. Agarwal in Johari Bazaar, Pushpak Jewels built an international reputation for rare untreated emeralds. Today, under Millennium Designs, Saket and Amit Agarwal continue the bench tradition in Jaipur — marrying courtly gemstones with a proprietary anti-tarnish 925 alloy.
        </p>

        {/* 3 Quiet House Truths */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))",
            gap: "clamp(12px, 2vw, 24px)",
            width: "100%",
            maxWidth: "1000px",
            marginTop: "clamp(28px, 4.5vw, 56px)",
            paddingTop: "clamp(18px, 3vw, 32px)",
            borderTop: "1px solid var(--md-rule)",
            textAlign: "left",
          }}
        >
          {[
            {
              num: "01",
              title: "100% In-House Atelier",
              desc: "From initial sketch and lost-wax casting to hand-prong setting, every piece remains within our Jaipur facility.",
            },
            {
              num: "02",
              title: "Anti-Tarnish 925 Alloy",
              desc: "Pure sterling silver alloyed with precious elements to permanently shield its mirror polish from atmospheric oxidation.",
            },
            {
              num: "03",
              title: "Direct Bench Provenance",
              desc: "Exhibited at Vicenza, Basel, and New York. Global collectors acquire heirloom creations directly from our family atelier.",
            },
          ].map((truth) => (
            <div
              key={truth.num}
              style={{
                padding: "clamp(16px, 2.5vw, 22px)",
                background: "var(--md-bg)",
                borderRadius: "var(--md-radius-sm, 2px)",
                border: "1px solid color-mix(in srgb, var(--md-champagne) 22%, var(--md-rule))",
                boxSizing: "border-box",
                display: "flex",
                flexDirection: "column",
                justifyContent: "flex-start",
                height: "100%",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 8,
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--md-font-crest), Georgia, serif",
                    fontSize: "0.6875rem",
                    color: "var(--md-green)",
                    letterSpacing: "0.18em",
                    fontWeight: 600,
                  }}
                >
                  {truth.num}
                </span>
                <span style={{ fontSize: "0.5625rem", color: "var(--md-champagne)" }}>✦</span>
              </div>
              <h3
                style={{
                  margin: 0,
                  fontFamily: "var(--md-font-display)",
                  fontSize: "1.0625rem",
                  fontWeight: 500,
                  color: "var(--md-fg)",
                }}
              >
                {truth.title}
              </h3>
              <p
                style={{
                  margin: "8px 0 0",
                  fontSize: "0.8125rem",
                  color: "var(--md-fg-secondary)",
                  lineHeight: 1.6,
                }}
              >
                {truth.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── 3. ARCHIVAL MASTERPIECE SHOWCASE (THE SUITE) ───────────── */}
      {featuredProducts.length > 0 && (
        <ArchivalShowcase
          products={featuredProducts}
          marketSegment={resolved.code.toLowerCase() === "us" ? "" : resolved.code.toLowerCase()}
          locale={resolved.locale}
        />
      )}

      {/* ── 3. ART OF THE ATELIER (JAIPUR CRAFTSMANSHIP SPREAD) ───────── */}
      <section
        data-surface="forest"
        style={{
          background: "var(--md-forest)",
          color: "var(--md-fg-inverse)",
          paddingInline: "var(--md-gutter)",
          paddingBlock: "clamp(48px, 6vw, 96px)",
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
            gap: "clamp(24px, 4vw, 72px)",
            alignItems: "center",
          }}
        >
          {/* Craftsmanship Image — compact on mobile */}
          <div className="md-craft-image">
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

          <div className="md-category-grid">
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
                    borderRadius: "var(--md-radius-sm)",
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

                <div
                  style={{
                    paddingTop: "clamp(8px, 1.8vw, 14px)",
                    display: "flex",
                    flexDirection: "column",
                    flexGrow: 1,
                    justifyContent: "space-between",
                  }}
                >
                  <h3
                    style={{
                      margin: 0,
                      fontFamily: "var(--md-font-display)",
                      fontSize: "clamp(0.9375rem, 2.2vw, 1.25rem)",
                      fontWeight: 400,
                      letterSpacing: "-0.01em",
                      color: "var(--md-fg)",
                      minHeight: "1.4em",
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    {c.name}
                  </h3>
                  <span
                    style={{
                      fontSize: "0.625rem",
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                      color: "var(--md-fg-secondary)",
                      marginTop: "auto",
                      paddingTop: "4px",
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
            paddingBlock: "clamp(36px, 5vw, 80px)",
            borderTop: "1px solid var(--md-rule)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-end",
              marginBottom: "clamp(24px, 3.5vw, 40px)",
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
                  fontSize: "clamp(1.75rem, 3.4vw, 3rem)",
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

          <div className="md-stone-grid">
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
          paddingBlock: "clamp(44px, 6vw, 88px)",
          textAlign: "center",
        }}
      >
        <div
          style={{
            maxWidth: "680px",
            marginInline: "auto",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "var(--md-space-3)",
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
            BESPOKE COMMISSIONS
          </span>

          <h2
            style={{
              margin: 0,
              fontFamily: "var(--md-font-display)",
              fontSize: "clamp(1.75rem, 3.4vw, 3rem)",
              fontWeight: 400,
              color: "var(--md-fg)",
              letterSpacing: "-0.015em",
            }}
          >
            Custom Sizing &amp; Mineral Sourcing
          </h2>

          <p
            style={{
              margin: "6px 0 0",
              fontSize: "clamp(0.875rem, 1.2vw, 1rem)",
              lineHeight: 1.7,
              color: "var(--md-fg-secondary)",
            }}
          >
            Request bespoke sizing for an archival sovereign ring, custom chain lengths, or source an unheated gemstone cut directly through our master jewellers.
          </p>

          <div
            style={{
              display: "flex",
              justifyContent: "center",
              marginTop: "var(--md-space-2)",
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
                justifyContent: "center",
                textAlign: "center",
              }}
            >
              Inquire for Bespoke Sizing →
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
