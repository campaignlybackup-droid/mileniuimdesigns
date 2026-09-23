import type { JSX } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { resolveMarket, marketParams } from "@/lib/market";
import { buildCanonicalAndAlternates } from "@/lib/seo";
import { listPublishedCategories } from "@/lib/catalog";
import { listStorefrontFeaturedProducts } from "@/lib/catalog/products";
import { getStorefrontStones } from "@/lib/stones";
import { StoneCard } from "@/components/storefront/StoneCard";
import { ArchivalShowcase } from "@/components/storefront/ArchivalShowcase";
import { ProductGrid } from "@/components/storefront/ProductGrid";
import { getCategoryImage } from "@/lib/media/categoryImages";
import { HeroCampaignSlider } from "@/components/storefront/HeroCampaignSlider";
import { getStorefrontConfig } from "@/lib/cms/storefrontConfig";

export const revalidate = 3600;

export async function generateStaticParams(): Promise<{ market: string }[]> {
  return marketParams();
}

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
      "Sixty-five years of courtly gemstone curation and anti-tarnish 925 sterling silver craftsmanship. Handcrafted in our Jaipur atelier.",
    alternates: {
      canonical,
      languages,
    },
  };
}

const ATELIER_MAKERS = [
  {
    name: "B.L. Agarwal",
    role: "Founder · Est. 1961",
    image: "/images/story/bl-agarwal.jpg",
    alt: "B.L. Agarwal, Founder of Millennium Designs",
    bio: "Founded our family legacy in the gemstone corridors of Jaipur in 1961, establishing generational standards in unheated natural emeralds.",
  },
  {
    name: "Amit Agarwal",
    role: "Managing Director",
    image: "/images/story/amit-agarwal.jpg",
    alt: "Amit Agarwal, Managing Director of Millennium Designs",
    bio: "Expanded the atelier globally, formulating our signature anti-tarnish 925 sterling silver and presenting collections internationally.",
  },
  {
    name: "Saket Agarwal",
    role: "Director",
    image: "/images/story/saket-agarwal.jpg",
    alt: "Saket Agarwal, Director of Millennium Designs",
    bio: "Leads design architecture and collector commissions, bringing contemporary geometric vision to six decades of Jaipur bench craft.",
  },
];

export default async function StorefrontHomePage({
  params,
}: {
  params: Promise<{ market: string }>;
}): Promise<JSX.Element> {
  const { market } = await params;
  const resolved = await resolveMarket(market);
  const prefix = resolved.code.toLowerCase() === "us" ? "" : `/${resolved.code.toLowerCase()}`;

  // Read published categories, featured products, stones, and live CMS config in parallel
  const [categories, featuredResult, stones, storefrontConfig] = await Promise.all([
    listPublishedCategories(),
    listStorefrontFeaturedProducts(resolved.code, 16),
    getStorefrontStones(),
    getStorefrontConfig(resolved.code),
  ]);

  const allFeatured = featuredResult.products;
  const showcaseProducts = allFeatured.slice(0, 4);
  const signatureGrid = allFeatured.slice(4, 12).length >= 4 ? allFeatured.slice(4, 12) : allFeatured.slice(0, 8);

  return (
    <main
      id="main"
      style={{
        width: "100%",
        maxWidth: "100%",
        boxSizing: "border-box",
      }}
    >
      {/* ── 0. SEASONAL NOTICES / BANNER MODAL ───────────────────────── */}
      {storefrontConfig.seasonalNoticeEnabled && (
        <div
          style={{
            background: "color-mix(in srgb, var(--md-champagne) 15%, var(--md-bg-raised))",
            borderBottom: "1px solid color-mix(in srgb, var(--md-champagne) 35%, transparent)",
            padding: "10px var(--md-gutter)",
            textAlign: "center",
          }}
        >
          <div
            style={{
              maxWidth: "var(--md-container)",
              marginInline: "auto",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              fontSize: "0.8125rem",
            }}
          >
            <span style={{ color: "var(--md-gold)", fontWeight: 600 }}>✦ {storefrontConfig.seasonalNoticeTitle}:</span>
            <span style={{ color: "var(--md-fg)" }}>{storefrontConfig.seasonalNoticeMessage}</span>
          </div>
        </div>
      )}

      {/* ── 1. CINEMATIC CAMPAIGN SLIDER ─────────────────────────────── */}
      {storefrontConfig.sectionHeroVisible !== false && (
        <HeroCampaignSlider
          marketPrefix={prefix}
          slides={storefrontConfig.heroSlides}
          autoIntervalMs={storefrontConfig.heroAutoIntervalMs}
          autoplayEnabled={storefrontConfig.heroAutoplayEnabled}
          textAlign={storefrontConfig.heroTextAlign}
          overlayOpacity={storefrontConfig.heroOverlayOpacity}
        />
      )}

      {/* ── 2. COMPACT ATELIER HALLMARK & TRUST PILLARS ──────────────── */}
      {storefrontConfig.sectionTrustVisible !== false && storefrontConfig.trustPillarsVisible !== false && (
        <section
          className="md-trust-strip"
          style={{
            borderBottom: "1px solid var(--md-rule)",
            background: "var(--md-bg-raised)",
            paddingBlock: "clamp(10px, 1.6vw, 16px)",
            paddingInline: "var(--md-gutter)",
          }}
        >
          <div
            className="md-trust-strip-inner"
            style={{
              maxWidth: "var(--md-container)",
              marginInline: "auto",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "clamp(8px, 1.5vw, 24px)",
              textAlign: "center",
              alignItems: "center",
            }}
          >
            {storefrontConfig.trustPillars.map((item, i) => {
              const label = item.label === "JAIPUR BENCH EST. 1961" ? "EST. 1961 JAIPUR" : item.label;
              return (
                <div
                  key={item.id || i}
                  className="md-trust-item"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    padding: "3px 6px",
                  }}
                >
                  <span style={{ color: "var(--md-gold, #c9a86a)", fontSize: "0.5625rem" }}>{item.icon || "✦"}</span>
                  <div style={{ textAlign: "left" }}>
                    <div className="md-trust-label" style={{ fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.08em", color: "var(--md-fg)" }}>
                      {label}
                    </div>
                    <div className="md-trust-detail" style={{ fontSize: "0.625rem", color: "var(--md-fg-muted)", letterSpacing: "0.02em" }}>
                      {item.detail}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── 3. ARCHIVAL MASTERPIECE SLIDER ──────────────────────────── */}
      {storefrontConfig.sectionFeaturedVisible !== false && showcaseProducts.length > 0 && (
        <ArchivalShowcase
          products={showcaseProducts}
          marketSegment={resolved.code.toLowerCase() === "us" ? "" : resolved.code.toLowerCase()}
          locale={resolved.locale}
        />
      )}

      {/* ── 4. SIGNATURE ATELIER CREATIONS (FEATURED PRODUCT GRID) ──── */}
      {storefrontConfig.sectionFeaturedVisible !== false && signatureGrid.length > 0 && (
        <section
          style={{
            maxWidth: "var(--md-container)",
            marginInline: "auto",
            paddingInline: "var(--md-gutter)",
            paddingBlock: "clamp(36px, 5vw, 64px)",
            borderTop: "1px solid var(--md-rule)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-end",
              marginBottom: "clamp(20px, 3.5vw, 36px)",
              flexWrap: "wrap",
              gap: "var(--md-space-3)",
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
                  marginBottom: 6,
                }}
              >
                FINE JEWELLERY
              </span>
              <h2
                style={{
                  margin: 0,
                  fontFamily: "var(--md-font-display)",
                  fontSize: "clamp(1.25rem, 3.4vw, 2.75rem)",
                  fontWeight: 400,
                  color: "var(--md-fg)",
                  letterSpacing: "-0.01em",
                  lineHeight: 1.15,
                }}
              >
                Signature Creations
              </h2>
            </div>

            <Link
              href={`${prefix}/rings`}
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
              Browse All Creations ({allFeatured.length}+)
            </Link>
          </div>

          <ProductGrid
            products={signatureGrid.slice(0, 8)}
            marketSegment={resolved.code.toLowerCase() === "us" ? "" : resolved.code.toLowerCase()}
            locale={resolved.locale}
            columns={4}
          />
        </section>
      )}

      {/* ── 5. CURATED COLLECTIONS (CATEGORY TILES - FILLS BALANCED 4x2) ─ */}
      {storefrontConfig.sectionCategoriesVisible !== false && categories.length > 0 && (
        <section
          style={{
            maxWidth: "var(--md-container)",
            marginInline: "auto",
            paddingInline: "var(--md-gutter)",
            paddingBlock: "clamp(36px, 5vw, 64px)",
            borderTop: "1px solid var(--md-rule)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-end",
              marginBottom: "clamp(20px, 3.5vw, 36px)",
              flexWrap: "wrap",
              gap: "var(--md-space-3)",
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
                  marginBottom: 6,
                }}
              >
                EXPLORE BY CATEGORY
              </span>
              <h2
                style={{
                  margin: 0,
                  fontFamily: "var(--md-font-display)",
                  fontSize: "clamp(1.25rem, 3.4vw, 2.75rem)",
                  fontWeight: 400,
                  color: "var(--md-fg)",
                  letterSpacing: "-0.01em",
                  lineHeight: 1.15,
                }}
              >
                Curated Collections
              </h2>
            </div>
          </div>

          <div className="md-category-grid">
            {categories.slice(0, 8).map((c) => (
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
                      fontSize: "0.6875rem",
                      fontWeight: 600,
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                      color: "var(--md-fg-secondary)",
                      marginTop: "auto",
                      paddingTop: "4px",
                      display: "block",
                    }}
                  >
                    Explore
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ── 6. ATELIER STORY & THREE GENERATIONS ────────────────────── */}
      {storefrontConfig.sectionHeritageVisible !== false && (
        <section
          data-surface="forest"
          style={{
            background: "var(--md-forest)",
            color: "var(--md-fg-inverse)",
            paddingInline: "var(--md-gutter)",
            paddingBlock: "clamp(48px, 6vw, 84px)",
            position: "relative",
            overflow: "hidden",
            borderTop: "1px solid color-mix(in srgb, var(--md-champagne) 15%, transparent)",
            borderBottom: "1px solid color-mix(in srgb, var(--md-champagne) 15%, transparent)",
          }}
        >
          <div
            style={{
              maxWidth: "var(--md-container)",
              marginInline: "auto",
              display: "flex",
              flexDirection: "column",
              gap: "clamp(32px, 4.5vw, 48px)",
            }}
          >
            {/* Editorial Heading & Story */}
            <div style={{ textAlign: "center", maxWidth: "780px", marginInline: "auto" }}>
              <span
                style={{
                  fontSize: "0.6875rem",
                  letterSpacing: "0.22em",
                  textTransform: "uppercase",
                  color: "var(--md-champagne)",
                  fontWeight: 600,
                  display: "block",
                  marginBottom: "8px",
                  fontFamily: "var(--md-font-crest), Georgia, serif",
                }}
              >
                ✦ ATELIER HERITAGE · EST. 1961 JAIPUR ✦
              </span>

              <h2
                style={{
                  margin: "0 0 12px",
                  fontFamily: "var(--md-font-display)",
                  fontSize: "clamp(1.5rem, 3.2vw, 2.5rem)",
                  fontWeight: 400,
                  lineHeight: 1.2,
                  color: "var(--md-fg-inverse)",
                  letterSpacing: "-0.01em",
                }}
              >
                The Story Behind Every Creation
              </h2>

              <p
                style={{
                  margin: 0,
                  fontSize: "clamp(0.875rem, 1.05vw, 0.9375rem)",
                  lineHeight: 1.7,
                  color: "var(--md-fg-inverse-muted)",
                }}
              >
                Founded in 1961 in the historic gemstone corridors of Jaipur by B.L. Agarwal, Millennium Designs unites generational bench heritage with contemporary silver architecture. Today, led by brothers Amit and Saket Agarwal, every creation remains true to our founding principles of solid 925 sterling silver and unheated natural earth-mined gems.
              </p>
            </div>

            {/* Three Makers / Founders Portraits */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))",
                gap: "clamp(24px, 3.5vw, 40px)",
              }}
            >
              {ATELIER_MAKERS.map((maker) => (
                <div
                  key={maker.name}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    textAlign: "center",
                    gap: "16px",
                  }}
                >
                  <div
                    style={{
                      position: "relative",
                      width: "100%",
                      maxWidth: "280px",
                      aspectRatio: "3 / 4",
                      overflow: "hidden",
                      borderRadius: "var(--md-radius-sm)",
                      border: "1px solid color-mix(in srgb, var(--md-champagne) 25%, transparent)",
                      boxShadow: "0 16px 40px -12px rgba(0,0,0,0.35)",
                      background: "var(--md-forest-deep, #041811)",
                    }}
                  >
                    <Image
                      src={maker.image}
                      alt={maker.alt}
                      fill
                      sizes="(min-width: 1024px) 280px, (min-width: 640px) 45vw, 90vw"
                      style={{ objectFit: "cover", objectPosition: "center top" }}
                    />
                  </div>
                  <div>
                    <h3
                      style={{
                        margin: "0 0 4px",
                        fontFamily: "var(--md-font-display)",
                        fontSize: "1.25rem",
                        fontWeight: 400,
                        color: "var(--md-fg-inverse)",
                        letterSpacing: "-0.01em",
                      }}
                    >
                      {maker.name}
                    </h3>
                    <p
                      style={{
                        margin: "0 0 8px",
                        fontSize: "0.6875rem",
                        letterSpacing: "0.16em",
                        textTransform: "uppercase",
                        color: "var(--md-champagne)",
                        fontWeight: 600,
                      }}
                    >
                      {maker.role}
                    </p>
                    <p
                      style={{
                        margin: 0,
                        fontSize: "0.8125rem",
                        lineHeight: 1.6,
                        color: "var(--md-fg-inverse-muted)",
                        maxWidth: "280px",
                        marginInline: "auto",
                      }}
                    >
                      {maker.bio}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Link to Full Story */}
            <div style={{ textAlign: "center", paddingTop: "var(--md-space-2)" }}>
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
                Our Story &amp; Atelier Archive →
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* ── 7. NATURAL GEMSTONES LAPIDARY ARCHIVE ───────────────────── */}
      {storefrontConfig.sectionStonesVisible !== false && stones.length > 0 && (
        <section
          style={{
            maxWidth: "var(--md-container)",
            marginInline: "auto",
            paddingInline: "var(--md-gutter)",
            paddingBlock: "clamp(36px, 5vw, 64px)",
            borderTop: "1px solid var(--md-rule)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-end",
              marginBottom: "clamp(20px, 3.5vw, 36px)",
              flexWrap: "wrap",
              gap: "var(--md-space-3)",
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
                  marginBottom: 6,
                }}
              >
                UNHEATED NATURAL MINERALS
              </span>
              <h2
                style={{
                  margin: 0,
                  fontFamily: "var(--md-font-display)",
                  fontSize: "clamp(1.25rem, 3.4vw, 2.75rem)",
                  fontWeight: 400,
                  color: "var(--md-fg)",
                  letterSpacing: "-0.01em",
                  lineHeight: 1.15,
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
              View All Stones ({stones.length})
            </Link>
          </div>

          <div className="md-stone-grid">
            {stones.slice(0, 6).map((stone) => (
              <StoneCard
                key={stone.id}
                stone={stone}
                marketSegment={resolved.code.toLowerCase() === "us" ? "" : resolved.code.toLowerCase()}
              />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
