import type { JSX } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { resolveMarket } from "@/lib/market";
import { buildCanonicalAndAlternates } from "@/lib/seo";
import {
  buildWhatsAppInquiryUrl,
  MILLENNIUM_ADDRESS,
  MILLENNIUM_WHATSAPP_NUMBER,
  MILLENNIUM_SECONDARY_PHONE,
} from "@/lib/whatsapp";

export const revalidate = 3600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ market: string }>;
}): Promise<Metadata> {
  const { market } = await params;
  const resolved = await resolveMarket(market);
  const { canonical, languages } = await buildCanonicalAndAlternates({
    pathname: "/our-story",
    marketCode: resolved.code,
  });

  return {
    title: "Our Story · Pushpak Jewels 1961 to Millennium Designs Jaipur",
    description:
      "Three generations of Jaipur fine jewellery craftsmanship. Founded in 1961 by B. L. Agarwal, continued by Amit & Saket Agarwal. 100% in-house manufacturing, natural emeralds, and pure anti-tarnish 925 sterling silver.",
    alternates: {
      canonical,
      languages,
    },
  };
}

export default async function OurStoryPage({
  params,
}: {
  params: Promise<{ market: string }>;
}): Promise<JSX.Element> {
  const { market } = await params;
  const resolved = await resolveMarket(market);
  const prefix =
    resolved.code.toLowerCase() === "us" ? "" : `/${resolved.code.toLowerCase()}`;
  const whatsappUrl = buildWhatsAppInquiryUrl({
    topic: "bespoke",
    customMessage:
      "Hello Amit & Saket, I am reading your atelier chronicle and would like to speak directly with you regarding your jewellery.",
  });

  return (
    <article
      style={{
        width: "100%",
        maxWidth: "100%",
        boxSizing: "border-box",
        background: "var(--md-bg)",
        color: "var(--md-fg)",
        overflowX: "hidden",
      }}
    >
      {/* ── 1. THE HERO BROADSIDE: PURE EDITORIAL TYPOGRAPHY ───────────── */}
      <header
        data-surface="ivory-soft"
        style={{
          borderBottom: "1px solid var(--md-rule-strong)",
          paddingInline: "var(--md-gutter)",
          paddingTop: "clamp(60px, 9vw, 120px)",
          paddingBottom: "clamp(48px, 6vw, 84px)",
          background: "linear-gradient(180deg, var(--md-bg) 0%, var(--md-ivory) 100%)",
        }}
      >
        <div
          style={{
            maxWidth: "var(--md-container)",
            marginInline: "auto",
          }}
        >
          {/* Running Masthead Header */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "16px",
              paddingBottom: "clamp(20px, 3vw, 32px)",
              borderBottom: "1px solid var(--md-rule)",
              fontSize: "0.6875rem",
              letterSpacing: "0.26em",
              textTransform: "uppercase",
              fontFamily: "var(--md-font-crest), Georgia, serif",
              color: "var(--md-fg-muted)",
            }}
          >
            <span>THE AGARWAL CHRONICLE · JAIPUR, INDIA</span>
            <span>FOUNDED 1961 · JOHARI BAZAAR &amp; M.I. ROAD</span>
            <span>EDITION · MCMXI</span>
          </div>

          {/* Grand Hero Statement */}
          <div
            style={{
              paddingBlock: "clamp(36px, 6vw, 72px)",
            }}
          >
            <p
              style={{
                fontSize: "clamp(0.75rem, 1.2vw, 0.875rem)",
                letterSpacing: "0.28em",
                textTransform: "uppercase",
                color: "var(--md-gold-antique)",
                fontWeight: 600,
                margin: "0 0 clamp(16px, 2.5vw, 24px)",
                fontFamily: "var(--md-font-crest), Georgia, serif",
              }}
            >
              Pushpak Jewels · 1961 &mdash; Millennium Designs · Present
            </p>

            <h1
              style={{
                margin: "0 0 clamp(24px, 4vw, 40px)",
                fontFamily: "var(--md-font-display)",
                fontSize: "clamp(2.75rem, 7.5vw, 6.75rem)",
                lineHeight: 0.98,
                letterSpacing: "-0.025em",
                fontWeight: 400,
                color: "var(--md-fg)",
                maxWidth: "1100px",
              }}
            >
              Three generations.
              <br />
              One roof in Jaipur.
              <br />
              <span
                style={{
                  fontStyle: "italic",
                  fontFamily: "var(--md-font-display)",
                  color: "var(--md-forest)",
                }}
              >
                Zero outsourcing.
              </span>
            </h1>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 380px), 1fr))",
                gap: "clamp(24px, 5vw, 64px)",
                alignItems: "baseline",
                paddingTop: "clamp(20px, 3vw, 36px)",
                borderTop: "1px solid var(--md-rule)",
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: "clamp(1.125rem, 2vw, 1.375rem)",
                  lineHeight: 1.65,
                  fontFamily: "var(--md-font-display)",
                  color: "var(--md-fg)",
                  fontWeight: 400,
                }}
              >
                We do not broker jewellery from commercial trading houses.
                We melt our own silver, cut our own natural gemstones, and fabricate
                every setting by hand inside Chameliwala Market.
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <p
                  style={{
                    margin: 0,
                    fontSize: "0.9375rem",
                    lineHeight: 1.8,
                    color: "var(--md-fg-secondary)",
                  }}
                >
                  What grandfather <strong>B. L. Agarwal</strong> began as an emerald atelier in 1961,
                  brothers <strong>Amit &amp; Saket Agarwal</strong> transformed into an international
                  workshop serving collectors across New York, London, Sydney, and Milan.
                </p>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "16px",
                    marginTop: "8px",
                  }}
                >
                  <a
                    href="#the-chronicle"
                    style={{
                      fontSize: "0.75rem",
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                      color: "var(--md-forest)",
                      fontWeight: 600,
                      textDecoration: "none",
                      borderBottom: "1px solid currentColor",
                      paddingBottom: "2px",
                    }}
                  >
                    Read The Chronicle ↓
                  </a>
                  <span style={{ color: "var(--md-fg-muted)" }}>·</span>
                  <a
                    href="#the-manifesto"
                    style={{
                      fontSize: "0.75rem",
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                      color: "var(--md-fg-secondary)",
                      textDecoration: "none",
                    }}
                  >
                    The In-House Manifesto
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ── 2. THE THREE GENERATION CHRONICLE (SWISS ASYMMETRICAL TIMELINE) ─ */}
      <section
        id="the-chronicle"
        data-surface="ivory-soft"
        style={{
          paddingInline: "var(--md-gutter)",
          paddingBlock: "clamp(64px, 9vw, 128px)",
          background: "var(--md-bg)",
        }}
      >
        <div
          style={{
            maxWidth: "var(--md-container)",
            marginInline: "auto",
          }}
        >
          {/* Section Heading */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "space-between",
              alignItems: "flex-end",
              gap: "24px",
              paddingBottom: "clamp(24px, 3vw, 40px)",
              borderBottom: "2px solid var(--md-fg)",
              marginBottom: "clamp(36px, 6vw, 72px)",
            }}
          >
            <div>
              <span
                style={{
                  fontSize: "0.6875rem",
                  letterSpacing: "0.24em",
                  textTransform: "uppercase",
                  color: "var(--md-gold-antique)",
                  fontWeight: 600,
                  display: "block",
                  marginBottom: "8px",
                  fontFamily: "var(--md-font-crest), Georgia, serif",
                }}
              >
                RECORD OF SUCCESSION
              </span>
              <h2
                style={{
                  margin: 0,
                  fontFamily: "var(--md-font-display)",
                  fontSize: "clamp(2rem, 4.5vw, 3.75rem)",
                  lineHeight: 1.05,
                  fontWeight: 400,
                  color: "var(--md-fg)",
                  letterSpacing: "-0.015em",
                }}
              >
                The Chronicle: 1961 to Present
              </h2>
            </div>

            <span
              style={{
                fontFamily: "var(--md-font-display)",
                fontStyle: "italic",
                fontSize: "1.125rem",
                color: "var(--md-fg-secondary)",
              }}
            >
              Over 60 years of continuity
            </span>
          </div>

          {/* Epoch 01: 1961 */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "clamp(120px, 20vw, 240px) 1fr",
              gap: "clamp(24px, 5vw, 64px)",
              paddingBlock: "clamp(32px, 5vw, 64px)",
              borderBottom: "1px solid var(--md-rule)",
            }}
          >
            <div>
              <span
                style={{
                  fontFamily: "var(--md-font-display)",
                  fontSize: "clamp(2.5rem, 5vw, 4.5rem)",
                  lineHeight: 1,
                  fontWeight: 400,
                  color: "var(--md-gold-antique)",
                  display: "block",
                }}
              >
                1961
              </span>
              <span
                style={{
                  fontSize: "0.6875rem",
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: "var(--md-fg-muted)",
                  marginTop: "6px",
                  display: "block",
                  fontFamily: "var(--md-font-crest), Georgia, serif",
                }}
              >
                Jaipur · Johari Bazaar
              </span>
            </div>

            <div>
              <h3
                style={{
                  margin: "0 0 16px",
                  fontFamily: "var(--md-font-display)",
                  fontSize: "clamp(1.5rem, 2.5vw, 2.25rem)",
                  fontWeight: 400,
                  lineHeight: 1.2,
                  color: "var(--md-fg)",
                }}
              >
                Pushpak Jewels &amp; The Natural Emerald Lapidary
              </h3>

              <div
                style={{
                  maxWidth: "760px",
                  fontSize: "clamp(0.9375rem, 1.4vw, 1.0625rem)",
                  lineHeight: 1.85,
                  color: "var(--md-fg-secondary)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "16px",
                }}
              >
                <p style={{ margin: 0 }}>
                  Our grandfather, <strong>B. L. Agarwal</strong>, founded Pushpak Jewels in the
                  historic gemstone heart of the Pink City. Specialising exclusively in high-calibre
                  natural emeralds, he bypassed speculative middle-traders to source rough crystals
                  directly from Colombian and Zambian veins.
                </p>
                <p style={{ margin: 0 }}>
                  His operating creed was austere: examine every facet under northern daylight with a
                  brass loupe; never heat, dye, or chemically alter a crystal; and stake the entire
                  family name on the authenticity of every stone sold. Within two decades, Pushpak
                  Jewels became a private resource for royal families and master jewel houses.
                </p>

                <blockquote
                  style={{
                    margin: "12px 0 0",
                    paddingLeft: "20px",
                    borderLeft: "2px solid var(--md-gold-antique)",
                    fontFamily: "var(--md-font-display)",
                    fontStyle: "italic",
                    fontSize: "1.125rem",
                    color: "var(--md-charcoal)",
                    lineHeight: 1.6,
                  }}
                >
                  &ldquo;A jeweler’s reputation is not won on the street. It is forged on the lapidary wheel, in the purity of the metal, and in keeping one’s word.&rdquo;
                  <cite
                    style={{
                      display: "block",
                      fontStyle: "normal",
                      fontSize: "0.6875rem",
                      letterSpacing: "0.16em",
                      textTransform: "uppercase",
                      color: "var(--md-gold-antique)",
                      marginTop: "8px",
                      fontWeight: 600,
                    }}
                  >
                    &mdash; B. L. Agarwal (1961)
                  </cite>
                </blockquote>
              </div>
            </div>
          </div>

          {/* Epoch 02: 1999 */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "clamp(120px, 20vw, 240px) 1fr",
              gap: "clamp(24px, 5vw, 64px)",
              paddingBlock: "clamp(32px, 5vw, 64px)",
              borderBottom: "1px solid var(--md-rule)",
            }}
          >
            <div>
              <span
                style={{
                  fontFamily: "var(--md-font-display)",
                  fontSize: "clamp(2.5rem, 5vw, 4.5rem)",
                  lineHeight: 1,
                  fontWeight: 400,
                  color: "var(--md-gold-antique)",
                  display: "block",
                }}
              >
                1999
              </span>
              <span
                style={{
                  fontSize: "0.6875rem",
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: "var(--md-fg-muted)",
                  marginTop: "6px",
                  display: "block",
                  fontFamily: "var(--md-font-crest), Georgia, serif",
                }}
              >
                Global Expansion
              </span>
            </div>

            <div>
              <h3
                style={{
                  margin: "0 0 16px",
                  fontFamily: "var(--md-font-display)",
                  fontSize: "clamp(1.5rem, 2.5vw, 2.25rem)",
                  fontWeight: 400,
                  lineHeight: 1.2,
                  color: "var(--md-fg)",
                }}
              >
                Amit &amp; Saket Agarwal: 925 Sterling Silver for the World
              </h3>

              <div
                style={{
                  maxWidth: "760px",
                  fontSize: "clamp(0.9375rem, 1.4vw, 1.0625rem)",
                  lineHeight: 1.85,
                  color: "var(--md-fg-secondary)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "16px",
                }}
              >
                <p style={{ margin: 0 }}>
                  Brothers <strong>Amit Agarwal and Saket Agarwal</strong> took the helm with an
                  ambitious directive: bridge Jaipur’s centuries-old bench silversmithing to the
                  exacting taste of international connoisseurs in the United States, Europe, and
                  Australia. They christened this global identity <strong>Millennium Designs</strong>.
                </p>
                <p style={{ margin: 0 }}>
                  Rather than producing lightweight tourist trinkets, they developed an in-house
                  foundry standard: pure certified 925 sterling silver alloyed with anti-tarnish
                  elements, cast with architectural heft, and hand-fitted with natural untreated
                  gemstones. Collections debuted across trade expositions in Milan, London, and New
                  York, establishing long-term relationships with international boutiques.
                </p>
              </div>
            </div>
          </div>

          {/* Epoch 03: Present */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "clamp(120px, 20vw, 240px) 1fr",
              gap: "clamp(24px, 5vw, 64px)",
              paddingBlock: "clamp(32px, 5vw, 64px)",
            }}
          >
            <div>
              <span
                style={{
                  fontFamily: "var(--md-font-display)",
                  fontSize: "clamp(2.5rem, 5vw, 4.5rem)",
                  lineHeight: 1,
                  fontWeight: 400,
                  color: "var(--md-forest)",
                  display: "block",
                }}
              >
                NOW
              </span>
              <span
                style={{
                  fontSize: "0.6875rem",
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: "var(--md-fg-muted)",
                  marginTop: "6px",
                  display: "block",
                  fontFamily: "var(--md-font-crest), Georgia, serif",
                }}
              >
                5, Noor Plaza · M.I. Road
              </span>
            </div>

            <div>
              <h3
                style={{
                  margin: "0 0 16px",
                  fontFamily: "var(--md-font-display)",
                  fontSize: "clamp(1.5rem, 2.5vw, 2.25rem)",
                  fontWeight: 400,
                  lineHeight: 1.2,
                  color: "var(--md-fg)",
                }}
              >
                Millennium Designs Today: The Sovereign In-House Atelier
              </h3>

              <div
                style={{
                  maxWidth: "760px",
                  fontSize: "clamp(0.9375rem, 1.4vw, 1.0625rem)",
                  lineHeight: 1.85,
                  color: "var(--md-fg-secondary)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "16px",
                }}
              >
                <p style={{ margin: 0 }}>
                  Today, while over 90% of commercial jewellery brands function merely as marketing
                  labels that outsource manufacturing to disparate contract factories, Millennium
                  Designs remains fully self-sufficient.
                </p>
                <p style={{ margin: 0 }}>
                  Every jewel is created inside our facility at <strong>5, Noor Plaza, Chameliwala Market, M.I. Road, Jaipur</strong>.
                  From initial graphite concept and lost-wax vacuum induction casting, to hand-prong
                  setting and microscopic quality audits, our clients acquire jewellery straight from
                  the hands that forged it.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 3. THE MANIFESTO OF COMPLETE CUSTODY (DARK EDITORIAL SPREAD) ── */}
      <section
        id="the-manifesto"
        data-surface="green-black"
        style={{
          paddingInline: "var(--md-gutter)",
          paddingBlock: "clamp(72px, 10vw, 140px)",
          background: "var(--md-green-black)",
          color: "var(--md-fg-inverse)",
          borderTop: "1px solid color-mix(in srgb, var(--md-champagne) 20%, transparent)",
          borderBottom: "1px solid color-mix(in srgb, var(--md-champagne) 20%, transparent)",
        }}
      >
        <div
          style={{
            maxWidth: "var(--md-container)",
            marginInline: "auto",
          }}
        >
          <div style={{ maxWidth: "800px", marginBottom: "clamp(48px, 6vw, 84px)" }}>
            <span
              style={{
                fontSize: "0.6875rem",
                letterSpacing: "0.26em",
                textTransform: "uppercase",
                color: "var(--md-champagne)",
                fontWeight: 600,
                display: "block",
                marginBottom: "12px",
                fontFamily: "var(--md-font-crest), Georgia, serif",
              }}
            >
              OUR UNCOMPROMISED POSITION
            </span>
            <h2
              style={{
                margin: "0 0 24px",
                fontFamily: "var(--md-font-display)",
                fontSize: "clamp(2.5rem, 5.5vw, 4.75rem)",
                lineHeight: 1.05,
                fontWeight: 400,
                letterSpacing: "-0.02em",
                color: "var(--md-fg-inverse)",
              }}
            >
              The Atelier Manifesto
            </h2>
            <p
              style={{
                margin: 0,
                fontSize: "clamp(1rem, 1.6vw, 1.25rem)",
                lineHeight: 1.7,
                color: "var(--md-fg-inverse-muted)",
                fontWeight: 300,
              }}
            >
              Why we refuse modern shortcuts, commercial brokerages, and contract outsourcing.
            </p>
          </div>

          {/* Large Typographic Tenets (Clean Editorial, No Cards) */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              borderTop: "1px solid color-mix(in srgb, var(--md-fg-inverse) 15%, transparent)",
            }}
          >
            {[
              {
                num: "01",
                statement: "We Do Not Outsource",
                detail:
                  "Third-party contract factories dilute metallurgy, compromise stone setting, and inflate costs. We maintain complete custody: the foundry, the lapidary, the bench goldsmiths, and the polishers all work under our own roof in Chameliwala Market.",
              },
              {
                num: "02",
                statement: "Pure 925 Silver With Anti-Tarnish Metallurgy",
                detail:
                  "Commercial silver darkens because of crude copper alloys. We formulate our certified 925 sterling silver with a proprietary anti-tarnish alloy developed for global climates. It remains mirror-bright, 100% hypoallergenic, and nickel-free.",
              },
              {
                num: "03",
                statement: "Untreated Earth Gems Sourced at Origin",
                detail:
                  "We believe jewelry begins in the earth. From unheated Zambian emeralds to genuine rainbow moonstones and African amethysts, our stones are cut in-house to celebrate optical character rather than synthetic perfection.",
              },
              {
                num: "04",
                statement: "Direct Factory Pricing With Zero Speculation",
                detail:
                  "Traditional luxury retail inflates prices by 5x to 8x to pay for prime city avenue leases and multi-tier distributors. We ship directly from our Jaipur workshop to buyers worldwide with transparent, honest manufacturing margins.",
              },
              {
                num: "05",
                statement: "Crafted Specifically for the International Eye",
                detail:
                  "Our collections are calibrated for patrons aged 30+ across the USA, Europe, and Australia. We engineer balanced weight distributions, smooth low-profile bezel settings, and ergonomic bands designed for everyday luxury.",
              },
            ].map((tenet) => (
              <div
                key={tenet.num}
                style={{
                  display: "grid",
                  gridTemplateColumns: "clamp(60px, 10vw, 100px) clamp(240px, 32vw, 380px) 1fr",
                  gap: "clamp(20px, 4vw, 48px)",
                  paddingBlock: "clamp(28px, 4vw, 44px)",
                  borderBottom: "1px solid color-mix(in srgb, var(--md-fg-inverse) 12%, transparent)",
                  alignItems: "baseline",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--md-font-display)",
                    fontSize: "1.5rem",
                    color: "var(--md-champagne)",
                    fontWeight: 400,
                  }}
                >
                  {tenet.num}
                </span>

                <h3
                  style={{
                    margin: 0,
                    fontFamily: "var(--md-font-display)",
                    fontSize: "clamp(1.25rem, 2vw, 1.625rem)",
                    lineHeight: 1.25,
                    fontWeight: 400,
                    color: "var(--md-fg-inverse)",
                  }}
                >
                  {tenet.statement}
                </h3>

                <p
                  style={{
                    margin: 0,
                    fontSize: "0.9375rem",
                    lineHeight: 1.75,
                    color: "var(--md-fg-inverse-muted)",
                    maxWidth: "600px",
                  }}
                >
                  {tenet.detail}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 4. TECHNICAL SPECIFICATION TABLE (SWISS ASSAY LEDGER) ───────── */}
      <section
        data-surface="ivory"
        style={{
          paddingInline: "var(--md-gutter)",
          paddingBlock: "clamp(64px, 9vw, 120px)",
          background: "var(--md-ivory)",
          borderBottom: "1px solid var(--md-rule)",
        }}
      >
        <div
          style={{
            maxWidth: "var(--md-container)",
            marginInline: "auto",
          }}
        >
          <div style={{ maxWidth: "700px", marginBottom: "clamp(36px, 5vw, 60px)" }}>
            <span
              style={{
                fontSize: "0.6875rem",
                letterSpacing: "0.24em",
                textTransform: "uppercase",
                color: "var(--md-gold-antique)",
                fontWeight: 600,
                display: "block",
                marginBottom: "8px",
                fontFamily: "var(--md-font-crest), Georgia, serif",
              }}
            >
              METALLURGICAL ASSAY
            </span>
            <h2
              style={{
                margin: "0 0 12px",
                fontFamily: "var(--md-font-display)",
                fontSize: "clamp(2rem, 4vw, 3.25rem)",
                lineHeight: 1.1,
                fontWeight: 400,
                color: "var(--md-fg)",
              }}
            >
              The Atelier Standard vs. Commercial Market
            </h2>
            <p
              style={{
                margin: 0,
                fontSize: "0.9375rem",
                lineHeight: 1.7,
                color: "var(--md-fg-secondary)",
              }}
            >
              A transparent comparison of metallurgical and lapidary standards practiced in our
              Jaipur facility compared to standard commercial wholesale jewelry.
            </p>
          </div>

          {/* Assay Comparison Table */}
          <div
            style={{
              width: "100%",
              overflowX: "auto",
              borderTop: "2px solid var(--md-fg)",
            }}
          >
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                textAlign: "left",
                minWidth: "640px",
              }}
            >
              <thead>
                <tr style={{ borderBottom: "1px solid var(--md-rule-strong)" }}>
                  <th
                    style={{
                      padding: "16px 12px",
                      fontSize: "0.6875rem",
                      letterSpacing: "0.16em",
                      textTransform: "uppercase",
                      color: "var(--md-fg-muted)",
                      fontWeight: 600,
                      width: "30%",
                    }}
                  >
                    Benchmark Parameter
                  </th>
                  <th
                    style={{
                      padding: "16px 12px",
                      fontSize: "0.6875rem",
                      letterSpacing: "0.16em",
                      textTransform: "uppercase",
                      color: "var(--md-forest)",
                      fontWeight: 700,
                      width: "40%",
                    }}
                  >
                    Millennium Designs Atelier
                  </th>
                  <th
                    style={{
                      padding: "16px 12px",
                      fontSize: "0.6875rem",
                      letterSpacing: "0.16em",
                      textTransform: "uppercase",
                      color: "var(--md-fg-muted)",
                      fontWeight: 500,
                      width: "30%",
                    }}
                  >
                    Commercial Mass Market
                  </th>
                </tr>
              </thead>
              <tbody>
                {[
                  {
                    param: "Precious Alloy Base",
                    millennium: "Certified 92.5% pure elemental silver + anti-tarnish compound",
                    commercial: "Standard 925 alloyed with high-copper (oxidises rapidly)",
                  },
                  {
                    param: "Manufacturing Custody",
                    millennium: "100% in-house at 5 Noor Plaza, Chameliwala Market",
                    commercial: "Outsourced to third-party contract jobbers",
                  },
                  {
                    param: "Skin Biocompatibility",
                    millennium: "100% Nickel-free, Lead-free, Cadmium-free (Hypoallergenic)",
                    commercial: "Often contains trace nickel to add rigidity",
                  },
                  {
                    param: "Gemstone Calibre",
                    millennium: "Natural untreated rough cut & faceted in our own lapidary",
                    commercial: "Bulk pre-faceted commercial lots or synthetic glass",
                  },
                  {
                    param: "Pricing Transparency",
                    millennium: "Direct factory rates; no distributor or storefront markup",
                    commercial: "Multi-tier markups (up to 500% over factory cost)",
                  },
                  {
                    param: "Patron Access",
                    millennium: "Direct dialogue with founders Amit & Saket Agarwal",
                    commercial: "Impersonal call centers or retail intermediaries",
                  },
                ].map((row, idx) => (
                  <tr
                    key={row.param}
                    style={{
                      borderBottom: "1px solid var(--md-rule)",
                      background: idx % 2 === 0 ? "transparent" : "rgba(0, 0, 0, 0.015)",
                    }}
                  >
                    <td
                      style={{
                        padding: "18px 12px",
                        fontSize: "0.875rem",
                        fontWeight: 600,
                        color: "var(--md-fg)",
                      }}
                    >
                      {row.param}
                    </td>
                    <td
                      style={{
                        padding: "18px 12px",
                        fontSize: "0.875rem",
                        color: "var(--md-fg)",
                        lineHeight: 1.5,
                      }}
                    >
                      <strong style={{ color: "var(--md-forest)" }}>✓</strong> {row.millennium}
                    </td>
                    <td
                      style={{
                        padding: "18px 12px",
                        fontSize: "0.875rem",
                        color: "var(--md-fg-muted)",
                        lineHeight: 1.5,
                      }}
                    >
                      {row.commercial}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── 5. FOUNDERS' COLOPHON & ATELIER INVITATION ──────────────────── */}
      <footer
        data-surface="ivory-soft"
        style={{
          paddingInline: "var(--md-gutter)",
          paddingTop: "clamp(64px, 9vw, 120px)",
          paddingBottom: "clamp(64px, 8vw, 100px)",
          background: "var(--md-bg)",
        }}
      >
        <div
          style={{
            maxWidth: "var(--md-container)",
            marginInline: "auto",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 460px), 1fr))",
            gap: "clamp(36px, 6vw, 84px)",
            alignItems: "start",
          }}
        >
          {/* Left: Direct Founder Letter */}
          <div>
            <span
              style={{
                fontSize: "0.6875rem",
                letterSpacing: "0.24em",
                textTransform: "uppercase",
                color: "var(--md-gold-antique)",
                fontWeight: 600,
                display: "block",
                marginBottom: "8px",
                fontFamily: "var(--md-font-crest), Georgia, serif",
              }}
            >
              DIRECT PATRON COMMUNICATION
            </span>

            <h2
              style={{
                margin: "0 0 20px",
                fontFamily: "var(--md-font-display)",
                fontSize: "clamp(2rem, 3.8vw, 3.25rem)",
                lineHeight: 1.15,
                fontWeight: 400,
                color: "var(--md-fg)",
              }}
            >
              An Open Door in Jaipur
            </h2>

            <div
              style={{
                fontSize: "0.9375rem",
                lineHeight: 1.85,
                color: "var(--md-fg-secondary)",
                display: "flex",
                flexDirection: "column",
                gap: "16px",
              }}
            >
              <p style={{ margin: 0 }}>
                Whether you are a private collector acquiring an heirloom emerald ring or a
                boutique owner seeking bespoke sterling silver collections for your showroom,
                we believe high jewellery is an intimate relationship built on integrity.
              </p>
              <p style={{ margin: 0 }}>
                When you contact Millennium Designs, you are not communicating with a third-party
                agency. You are speaking directly with Amit and Saket Agarwal. Our workshop doors
                at Chameliwala Market are always open to those who honour the craft.
              </p>
            </div>

            {/* Signature Block */}
            <div
              style={{
                marginTop: "32px",
                paddingTop: "24px",
                borderTop: "1px solid var(--md-rule)",
                display: "flex",
                flexWrap: "wrap",
                gap: "36px",
              }}
            >
              <div>
                <span
                  style={{
                    fontFamily: "var(--md-font-display)",
                    fontSize: "1.25rem",
                    fontStyle: "italic",
                    color: "var(--md-fg)",
                    display: "block",
                  }}
                >
                  Amit Agarwal
                </span>
                <span
                  style={{
                    fontSize: "0.6875rem",
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    color: "var(--md-fg-muted)",
                    marginTop: "4px",
                    display: "block",
                  }}
                >
                  Principal · Operations &amp; Metallurgy
                </span>
              </div>

              <div>
                <span
                  style={{
                    fontFamily: "var(--md-font-display)",
                    fontSize: "1.25rem",
                    fontStyle: "italic",
                    color: "var(--md-fg)",
                    display: "block",
                  }}
                >
                  Saket Agarwal
                </span>
                <span
                  style={{
                    fontSize: "0.6875rem",
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    color: "var(--md-fg-muted)",
                    marginTop: "4px",
                    display: "block",
                  }}
                >
                  Principal · Design &amp; International Relations
                </span>
              </div>
            </div>
          </div>

          {/* Right: Atelier Certificate & Contacts */}
          <div
            style={{
              padding: "clamp(24px, 4vw, 40px)",
              background: "var(--md-ivory)",
              border: "1px solid var(--md-rule-strong)",
            }}
          >
            <span
              style={{
                fontSize: "0.6875rem",
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: "var(--md-gold-antique)",
                fontWeight: 600,
                display: "block",
                marginBottom: "8px",
                fontFamily: "var(--md-font-crest), Georgia, serif",
              }}
            >
              PHYSICAL ATELIER REGISTRY
            </span>

            <h3
              style={{
                margin: "0 0 16px",
                fontFamily: "var(--md-font-display)",
                fontSize: "1.625rem",
                fontWeight: 400,
                color: "var(--md-fg)",
              }}
            >
              Millenium Designs
            </h3>

            <address
              style={{
                fontStyle: "normal",
                fontSize: "0.9375rem",
                lineHeight: 1.7,
                color: "var(--md-fg-secondary)",
                marginBottom: "24px",
                display: "block",
              }}
            >
              5, Noor Plaza, Chameliwala Market
              <br />
              M.I. Road, Jaipur, 302001
              <br />
              Rajasthan, India
            </address>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "12px",
                paddingBlock: "16px",
                borderTop: "1px solid var(--md-rule)",
                borderBottom: "1px solid var(--md-rule)",
                marginBottom: "28px",
                fontSize: "0.875rem",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "var(--md-fg-muted)" }}>Telephone I</span>
                <a
                  href="tel:+919828156465"
                  style={{ color: "var(--md-fg)", textDecoration: "none", fontWeight: 600 }}
                >
                  +91 98281 56465
                </a>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "var(--md-fg-muted)" }}>Telephone II</span>
                <a
                  href="tel:+919829056597"
                  style={{ color: "var(--md-fg)", textDecoration: "none", fontWeight: 600 }}
                >
                  +91 98290 56597
                </a>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "var(--md-fg-muted)" }}>Factory Direct</span>
                <span style={{ color: "var(--md-forest)", fontWeight: 600 }}>Pure 925 Sterling Silver</span>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="md-btn-luxury"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  height: "48px",
                  paddingInline: "20px",
                  background: "var(--md-forest)",
                  color: "var(--md-champagne)",
                  borderRadius: "var(--md-radius-sm)",
                  fontSize: "0.75rem",
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                <span>WhatsApp Founders Directly</span>
                <span>→</span>
              </a>

              <Link
                href={`${prefix}/rings`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "44px",
                  paddingInline: "20px",
                  background: "transparent",
                  color: "var(--md-fg)",
                  border: "1px solid var(--md-rule-strong)",
                  borderRadius: "var(--md-radius-sm)",
                  fontSize: "0.75rem",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                Explore Curated Collections
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </article>
  );
}
