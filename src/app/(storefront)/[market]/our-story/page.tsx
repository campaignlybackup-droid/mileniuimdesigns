import type { JSX } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { resolveMarket } from "@/lib/market";
import { buildCanonicalAndAlternates } from "@/lib/seo";
import { buildWhatsAppInquiryUrl } from "@/lib/whatsapp";

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
    title: "Our Story · Over 60 Years of Heritage in Jaipur | Millennium Designs",
    description:
      "From Pushpak Jewels in 1961 to Millennium Designs today. Discover our family's sixty-year legacy of handcrafted natural gemstone and anti-tarnish 925 sterling silver jewellery, made 100% in-house in Jaipur.",
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
  const prefix = resolved.code.toLowerCase() === "us" ? "" : `/${resolved.code.toLowerCase()}`;
  const whatsappUrl = buildWhatsAppInquiryUrl({
    topic: "bespoke",
    customMessage:
      "Hello Amit & Saket, I am reading your brand story and would love to enquire about your jewellery creations.",
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
      {/* ── 1. HERO: CLASSY, WELCOMING, HIGH-HERITAGE ───────────────────── */}
      <section
        data-surface="green-black"
        style={{
          position: "relative",
          width: "100%",
          minHeight: "clamp(460px, 62vh, 640px)",
          background:
            "radial-gradient(ellipse at 50% 25%, var(--md-emerald-deep) 0%, var(--md-forest) 55%, var(--md-green-black) 100%)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          textAlign: "center",
          paddingInline: "var(--md-gutter)",
          paddingBlock: "clamp(56px, 8vw, 100px)",
          borderBottom: "1px solid color-mix(in srgb, var(--md-champagne) 24%, transparent)",
        }}
      >
        <div
          style={{
            maxWidth: "920px",
            marginInline: "auto",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            position: "relative",
            zIndex: 2,
          }}
        >
          {/* Subtle Crest Badge */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "10px",
              padding: "6px 16px",
              borderRadius: "var(--md-radius-sm)",
              border: "1px solid color-mix(in srgb, var(--md-champagne) 36%, transparent)",
              background: "rgba(4, 14, 9, 0.6)",
              fontSize: "0.6875rem",
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "var(--md-champagne)",
              fontFamily: "var(--md-font-crest), Georgia, serif",
              marginBottom: "clamp(16px, 3vw, 28px)",
            }}
          >
            <span>✦ JAIPUR · ESTABLISHED 1961 ✦</span>
          </div>

          <h1
            style={{
              margin: "0 0 clamp(16px, 2.5vw, 24px)",
              fontFamily: "var(--md-font-display)",
              fontSize: "clamp(2.4rem, 5.8vw, 5rem)",
              lineHeight: 1.08,
              fontWeight: 400,
              letterSpacing: "-0.02em",
              color: "var(--md-fg-inverse)",
            }}
          >
            Sixty Years of Craftsmanship.
            <br />
            <span
              style={{
                fontStyle: "italic",
                color: "var(--md-champagne)",
                fontFamily: "var(--md-font-display)",
              }}
            >
              Handmade Under One Roof.
            </span>
          </h1>

          <p
            style={{
              margin: "0 0 clamp(28px, 4vw, 44px)",
              maxWidth: "680px",
              fontSize: "clamp(1.0625rem, 1.6vw, 1.25rem)",
              lineHeight: 1.7,
              color: "var(--md-fg-inverse-muted)",
              fontWeight: 300,
            }}
          >
            Founded in 1961 by our grandfather <strong>B. L. Agarwal</strong> as Pushpak Jewels,
            we are a family-owned jewellery maison in Jaipur. We melt our own silver, hand-set
            natural gemstones, and create fine jewellery with zero outsourcing.
          </p>

          {/* Quick Pillar Strip */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "center",
              gap: "clamp(16px, 3vw, 36px)",
              paddingTop: "24px",
              borderTop: "1px solid color-mix(in srgb, var(--md-champagne) 20%, transparent)",
              fontSize: "0.8125rem",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--md-champagne)",
              fontFamily: "var(--md-font-crest), Georgia, serif",
            }}
          >
            <span>1961 Heritage</span>
            <span>·</span>
            <span>Pure 925 Anti-Tarnish Silver</span>
            <span>·</span>
            <span>100% In-House Workshop</span>
            <span>·</span>
            <span>Direct Maker Pricing</span>
          </div>
        </div>
      </section>

      {/* ── 2. THE THREE GENERATIONS STORY (EASY TO UNDERSTAND) ────────── */}
      <section
        data-surface="ivory-soft"
        style={{
          paddingInline: "var(--md-gutter)",
          paddingBlock: "clamp(56px, 7vw, 96px)",
          background: "var(--md-bg)",
        }}
      >
        <div className="md-story-container">
          <div
            style={{
              textAlign: "center",
              maxWidth: "680px",
              marginInline: "auto",
              marginBottom: "clamp(36px, 5vw, 56px)",
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
              OUR HERITAGE
            </span>
            <h2
              style={{
                margin: 0,
                fontFamily: "var(--md-font-display)",
                fontSize: "clamp(1.85rem, 3.5vw, 2.75rem)",
                lineHeight: 1.15,
                fontWeight: 400,
                color: "var(--md-fg)",
                letterSpacing: "-0.01em",
              }}
            >
              The Story of Three Generations
            </h2>
          </div>

          {/* Three Clean Milestone Cards */}
          <div className="md-milestones-grid">
            {/* Step 1: 1961 */}
            <div className="md-milestone-card">
              <span
                style={{
                  fontFamily: "var(--md-font-display)",
                  fontSize: "2.25rem",
                  color: "var(--md-gold-antique)",
                  lineHeight: 1,
                  display: "block",
                  marginBottom: "10px",
                }}
              >
                1961
              </span>
              <span
                style={{
                  fontSize: "0.6875rem",
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  color: "var(--md-fg-muted)",
                  display: "block",
                  marginBottom: "8px",
                  fontWeight: 600,
                  minHeight: "1.2em",
                }}
              >
                The Beginning · Pushpak Jewels
              </span>
              <h3
                style={{
                  margin: "0 0 12px",
                  fontFamily: "var(--md-font-display)",
                  fontSize: "1.25rem",
                  fontWeight: 400,
                  lineHeight: 1.25,
                  color: "var(--md-fg)",
                  minHeight: "1.4em",
                }}
              >
                Grandfather B. L. Agarwal
              </h3>
              <p
                style={{
                  margin: 0,
                  fontSize: "0.875rem",
                  lineHeight: 1.7,
                  color: "var(--md-fg-secondary)",
                }}
              >
                Our story began in the gemstone corridors of Jaipur. Grandfather B. L. Agarwal
                founded Pushpak Jewels with a focus on natural emeralds. He built the brand on
                three unshakeable pillars: authentic gemstones, trust with patrons, and
                meticulous hand-craftsmanship.
              </p>
            </div>

            {/* Step 2: 1999 */}
            <div className="md-milestone-card">
              <span
                style={{
                  fontFamily: "var(--md-font-display)",
                  fontSize: "2.25rem",
                  color: "var(--md-gold-antique)",
                  lineHeight: 1,
                  display: "block",
                  marginBottom: "10px",
                }}
              >
                1999
              </span>
              <span
                style={{
                  fontSize: "0.6875rem",
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  color: "var(--md-fg-muted)",
                  display: "block",
                  marginBottom: "8px",
                  fontWeight: 600,
                  minHeight: "1.2em",
                }}
              >
                The Next Generation · Going Global
              </span>
              <h3
                style={{
                  margin: "0 0 12px",
                  fontFamily: "var(--md-font-display)",
                  fontSize: "1.25rem",
                  fontWeight: 400,
                  lineHeight: 1.25,
                  color: "var(--md-fg)",
                  minHeight: "1.4em",
                }}
              >
                Amit &amp; Saket Agarwal
              </h3>
              <p
                style={{
                  margin: 0,
                  fontSize: "0.875rem",
                  lineHeight: 1.7,
                  color: "var(--md-fg-secondary)",
                }}
              >
                Brothers Amit &amp; Saket expanded into international 925 sterling silver fine
                jewellery. They developed our proprietary anti-tarnish alloy and presented
                collections at private expositions across New York, London, and Milan &mdash;
                earning the trust of fine jewellery collectors worldwide.
              </p>
            </div>

            {/* Step 3: Today */}
            <div
              className="md-milestone-card"
              style={{ borderTop: "2px solid var(--md-forest)" }}
            >
              <span
                style={{
                  fontFamily: "var(--md-font-display)",
                  fontSize: "2.25rem",
                  color: "var(--md-forest)",
                  lineHeight: 1,
                  display: "block",
                  marginBottom: "10px",
                }}
              >
                Today
              </span>
              <span
                style={{
                  fontSize: "0.6875rem",
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  color: "var(--md-forest)",
                  display: "block",
                  marginBottom: "8px",
                  fontWeight: 600,
                  minHeight: "1.2em",
                }}
              >
                Millennium Designs · In-House Atelier
              </span>
              <h3
                style={{
                  margin: "0 0 12px",
                  fontFamily: "var(--md-font-display)",
                  fontSize: "1.25rem",
                  fontWeight: 400,
                  lineHeight: 1.25,
                  color: "var(--md-fg)",
                  minHeight: "1.4em",
                }}
              >
                Complete In-House Facility
              </h3>
              <p
                style={{
                  margin: 0,
                  fontSize: "0.875rem",
                  lineHeight: 1.7,
                  color: "var(--md-fg-secondary)",
                }}
              >
                Operating from our own dedicated workshop at Noor Plaza, Chameliwala Market in
                Jaipur. Every single design is sketched, cast in silver, stone-set, and hand
                polished under one roof. Nothing is ever outsourced.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── 2b. MEET THE FAMILY ─────────────────────────────────────────── */}
      <section
        style={{
          paddingInline: "var(--md-gutter)",
          paddingBlock: "clamp(56px, 7vw, 96px)",
          background: "var(--md-bg-raised, var(--md-ivory-soft, #f9f7f4))",
          borderTop: "1px solid var(--md-rule)",
          borderBottom: "1px solid var(--md-rule)",
        }}
      >
        <div
          style={{
            maxWidth: "var(--md-container)",
            marginInline: "auto",
          }}
        >
          {/* Section header */}
          <div
            style={{
              textAlign: "center",
              marginBottom: "clamp(36px, 5vw, 60px)",
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
              ✦ THE AGARWAL FAMILY ✦
            </span>
            <h2
              style={{
                margin: 0,
                fontFamily: "var(--md-font-display)",
                fontSize: "clamp(1.75rem, 3.2vw, 2.5rem)",
                fontWeight: 400,
                color: "var(--md-fg)",
                letterSpacing: "-0.01em",
                lineHeight: 1.15,
              }}
            >
              The Makers Behind Every Piece
            </h2>
          </div>

          {/* Portrait trio */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: "clamp(20px, 3vw, 36px)",
              alignItems: "start",
            }}
          >
            {/* B. L. Agarwal — Founder */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "18px",
              }}
            >
              <div
                style={{
                  position: "relative",
                  width: "100%",
                  maxWidth: "320px",
                  aspectRatio: "3 / 4",
                  overflow: "hidden",
                  borderRadius: "var(--md-radius-sm, 2px)",
                  background: "var(--md-bg-raised)",
                  boxShadow: "0 12px 36px -8px rgba(0,0,0,0.14)",
                }}
              >
                <Image
                  src="/images/story/bl-agarwal.jpg"
                  alt="B.L. Agarwal, Founder of Millennium Designs, Jaipur"
                  fill
                  sizes="(max-width: 768px) 90vw, 320px"
                  style={{ objectFit: "cover", objectPosition: "center top" }}
                  priority
                />
              </div>
              <div style={{ textAlign: "center" }}>
                <p
                  style={{
                    margin: "0 0 3px",
                    fontFamily: "var(--md-font-display)",
                    fontSize: "1.125rem",
                    fontWeight: 400,
                    color: "var(--md-fg)",
                    letterSpacing: "-0.01em",
                  }}
                >
                  B.L. Agarwal
                </p>
                <p
                  style={{
                    margin: "0 0 8px",
                    fontSize: "0.6875rem",
                    letterSpacing: "0.16em",
                    textTransform: "uppercase",
                    color: "var(--md-gold-antique)",
                    fontWeight: 600,
                  }}
                >
                  Founder · Est. 1961
                </p>
                <p
                  style={{
                    margin: 0,
                    fontSize: "0.8125rem",
                    lineHeight: 1.65,
                    color: "var(--md-fg-secondary)",
                    maxWidth: "260px",
                    marginInline: "auto",
                  }}
                >
                  Founded Pushpak Jewels in the gemstone corridors of Jaipur, setting the
                  cornerstone of our family legacy in natural emeralds.
                </p>
              </div>
            </div>

            {/* Amit Agarwal — Director */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "18px",
              }}
            >
              <div
                style={{
                  position: "relative",
                  width: "100%",
                  maxWidth: "320px",
                  aspectRatio: "3 / 4",
                  overflow: "hidden",
                  borderRadius: "var(--md-radius-sm, 2px)",
                  background: "var(--md-bg-raised)",
                  boxShadow: "0 12px 36px -8px rgba(0,0,0,0.14)",
                }}
              >
                <Image
                  src="/images/story/amit-agarwal.jpg"
                  alt="Amit Agarwal, Director of Millennium Designs"
                  fill
                  sizes="(max-width: 768px) 90vw, 320px"
                  style={{ objectFit: "cover", objectPosition: "center top" }}
                />
              </div>
              <div style={{ textAlign: "center" }}>
                <p
                  style={{
                    margin: "0 0 3px",
                    fontFamily: "var(--md-font-display)",
                    fontSize: "1.125rem",
                    fontWeight: 400,
                    color: "var(--md-fg)",
                    letterSpacing: "-0.01em",
                  }}
                >
                  Amit Agarwal
                </p>
                <p
                  style={{
                    margin: "0 0 8px",
                    fontSize: "0.6875rem",
                    letterSpacing: "0.16em",
                    textTransform: "uppercase",
                    color: "var(--md-gold-antique)",
                    fontWeight: 600,
                  }}
                >
                  Director
                </p>
                <p
                  style={{
                    margin: 0,
                    fontSize: "0.8125rem",
                    lineHeight: 1.65,
                    color: "var(--md-fg-secondary)",
                    maxWidth: "260px",
                    marginInline: "auto",
                  }}
                >
                  Expanded the atelier globally, developing our proprietary anti-tarnish alloy
                  and presenting collections across New York, London and Milan.
                </p>
              </div>
            </div>

            {/* Saket Agarwal — Director */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "18px",
              }}
            >
              <div
                style={{
                  position: "relative",
                  width: "100%",
                  maxWidth: "320px",
                  aspectRatio: "3 / 4",
                  overflow: "hidden",
                  borderRadius: "var(--md-radius-sm, 2px)",
                  background: "var(--md-bg-raised)",
                  boxShadow: "0 12px 36px -8px rgba(0,0,0,0.14)",
                }}
              >
                <Image
                  src="/images/story/saket-agarwal.jpg"
                  alt="Saket Agarwal, Director of Millennium Designs"
                  fill
                  sizes="(max-width: 768px) 90vw, 320px"
                  style={{ objectFit: "cover", objectPosition: "center top" }}
                />
              </div>
              <div style={{ textAlign: "center" }}>
                <p
                  style={{
                    margin: "0 0 3px",
                    fontFamily: "var(--md-font-display)",
                    fontSize: "1.125rem",
                    fontWeight: 400,
                    color: "var(--md-fg)",
                    letterSpacing: "-0.01em",
                  }}
                >
                  Saket Agarwal
                </p>
                <p
                  style={{
                    margin: "0 0 8px",
                    fontSize: "0.6875rem",
                    letterSpacing: "0.16em",
                    textTransform: "uppercase",
                    color: "var(--md-gold-antique)",
                    fontWeight: 600,
                  }}
                >
                  Director
                </p>
                <p
                  style={{
                    margin: 0,
                    fontSize: "0.8125rem",
                    lineHeight: 1.65,
                    color: "var(--md-fg-secondary)",
                    maxWidth: "260px",
                    marginInline: "auto",
                  }}
                >
                  Leads product design and collector relationships, bringing a contemporary
                  vision to six decades of Jaipur master-craft.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 3. FOUR CLEAR DIFFERENTIATORS (WHY CONNOISSEURS CHOOSE US) ─── */}
      <section
        data-surface="forest"
        style={{
          paddingInline: "var(--md-gutter)",
          paddingBlock: "clamp(56px, 6.5vw, 84px)",
          background: "var(--md-forest)",
          color: "var(--md-fg-inverse)",
          borderTop: "1px solid color-mix(in srgb, var(--md-champagne) 20%, transparent)",
          borderBottom: "1px solid color-mix(in srgb, var(--md-champagne) 20%, transparent)",
        }}
      >
        <div className="md-story-container">
          <div
            style={{
              textAlign: "center",
              maxWidth: "680px",
              marginInline: "auto",
              marginBottom: "clamp(32px, 4.5vw, 48px)",
            }}
          >
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
              ✦ THE MILLENNIUM ADVANTAGE ✦
            </span>
            <h2
              style={{
                margin: "0 0 10px",
                fontFamily: "var(--md-font-display)",
                fontSize: "clamp(1.85rem, 3.5vw, 2.75rem)",
                lineHeight: 1.15,
                fontWeight: 400,
                color: "var(--md-fg-inverse)",
                letterSpacing: "-0.01em",
              }}
            >
              Why Connoisseurs Choose Our Jewellery
            </h2>
            <p
              style={{
                margin: 0,
                fontSize: "0.875rem",
                lineHeight: 1.65,
                color: "var(--md-fg-inverse-muted)",
              }}
            >
              Four defining principles that set our Jaipur family atelier apart from commercial
              distributors.
            </p>
          </div>

          <div className="md-connoisseur-grid">
            {[
              {
                number: "01",
                title: "Anti-Tarnish 925 Silver",
                desc: "Certified 92.5% pure elemental silver formulated with our proprietary anti-tarnish alloy. It stays lustrous and bright without darkening, and is 100% nickel-free and hypoallergenic.",
              },
              {
                number: "02",
                title: "100% In-House Atelier",
                desc: "Every step is performed in our Jaipur workshop. From lost-wax casting and lapidary gem cutting to hand setting and final polishing, our artisans control complete quality.",
              },
              {
                number: "03",
                title: "Natural Earth Gems",
                desc: "Hand-selected authentic natural gems — untreated emeralds, glowing rainbow moonstones, and royal amethysts — faceted for maximum chromatic vibrancy and fire.",
              },
              {
                number: "04",
                title: "Direct Workshop Pricing",
                desc: "Acquire directly from the makers in Jaipur. With no middlemen, licensing tiers, or showroom overheads, you receive genuine master-jeweller pricing.",
              },
            ].map((col) => (
              <div key={col.number} className="md-connoisseur-card">
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "12px",
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--md-font-crest), Georgia, serif",
                      fontSize: "0.75rem",
                      color: "var(--md-champagne)",
                      fontWeight: 600,
                      letterSpacing: "0.18em",
                    }}
                  >
                    {col.number}
                  </span>
                  <span
                    style={{
                      fontSize: "0.625rem",
                      color: "color-mix(in srgb, var(--md-champagne) 40%, transparent)",
                    }}
                  >
                    ✦
                  </span>
                </div>
                <h3
                  style={{
                    margin: "0 0 10px",
                    fontFamily: "var(--md-font-display)",
                    fontSize: "1.0625rem",
                    fontWeight: 400,
                    lineHeight: 1.3,
                    color: "var(--md-fg-inverse)",
                  }}
                >
                  {col.title}
                </h3>
                <div
                  style={{
                    borderTop:
                      "1px solid color-mix(in srgb, var(--md-champagne) 15%, transparent)",
                    paddingTop: "12px",
                    flexGrow: 1,
                  }}
                >
                  <p
                    style={{
                      margin: 0,
                      fontSize: "0.8125rem",
                      lineHeight: 1.65,
                      color: "var(--md-fg-inverse-muted)",
                    }}
                  >
                    {col.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 4. GLOBAL CLIENTELE & TASTE (EASY & IMPRESSIVE) ───────────── */}
      <section
        data-surface="ivory"
        style={{
          paddingInline: "var(--md-gutter)",
          paddingBlock: "clamp(56px, 7vw, 90px)",
          background: "var(--md-ivory)",
          borderBottom: "1px solid var(--md-rule)",
        }}
      >
        <div className="md-story-container">
          <div className="md-global-presence-grid">
            <div>
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
                INTERNATIONAL PRESENCE
              </span>
              <h2
                style={{
                  margin: "0 0 14px",
                  fontFamily: "var(--md-font-display)",
                  fontSize: "clamp(1.85rem, 3.5vw, 2.75rem)",
                  lineHeight: 1.15,
                  fontWeight: 400,
                  color: "var(--md-fg)",
                }}
              >
                Crafted in Jaipur, Cherished Globally
              </h2>
              <p
                style={{
                  margin: "0 0 14px",
                  fontSize: "0.9375rem",
                  lineHeight: 1.75,
                  color: "var(--md-fg-secondary)",
                }}
              >
                Our pieces are tailored according to the discerning taste of international
                patrons &mdash; clean contemporary lines, substantial silver heft, and durable
                anti-tarnish finishes. Our primary collectors are women and connoisseurs aged 30
                and above across the world.
              </p>
              <p
                style={{
                  margin: 0,
                  fontSize: "0.875rem",
                  lineHeight: 1.6,
                  color: "var(--md-fg-secondary)",
                }}
              >
                We proudly ship our handcrafted creations directly to collectors in:
              </p>

              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "8px",
                  marginTop: "16px",
                }}
              >
                {[
                  "United States",
                  "United Kingdom",
                  "Australia",
                  "Germany",
                  "Italy",
                  "Canada",
                  "Russia",
                  "Ukraine",
                  "India",
                ].map((country) => (
                  <span
                    key={country}
                    style={{
                      padding: "5px 12px",
                      borderRadius: "var(--md-radius-sm)",
                      background: "var(--md-bg)",
                      border: "1px solid var(--md-rule)",
                      fontSize: "0.75rem",
                      color: "var(--md-fg)",
                      fontWeight: 500,
                    }}
                  >
                    {country}
                  </span>
                ))}
              </div>
            </div>

            {/* Founders Guarantee Card */}
            <div
              style={{
                padding: "clamp(24px, 3.5vw, 36px)",
                background: "var(--md-bg)",
                borderRadius: "var(--md-radius-sm)",
                border: "1px solid color-mix(in srgb, var(--md-champagne) 30%, transparent)",
                borderTop: "2px solid var(--md-gold-antique)",
                boxShadow: "0 10px 24px -8px rgba(0, 0, 0, 0.04)",
                display: "flex",
                flexDirection: "column",
                gap: "14px",
              }}
            >
              <span
                style={{
                  fontFamily: "var(--md-font-crest), Georgia, serif",
                  fontSize: "0.6875rem",
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: "var(--md-gold-antique)",
                  fontWeight: 600,
                }}
              >
                ✦ FOUNDERS PLEDGE ✦
              </span>
              <h3
                style={{
                  margin: 0,
                  fontFamily: "var(--md-font-display)",
                  fontSize: "1.375rem",
                  fontWeight: 400,
                  color: "var(--md-fg)",
                }}
              >
                Direct From The Agarwal Family
              </h3>
              <p
                style={{
                  margin: 0,
                  fontSize: "0.875rem",
                  lineHeight: 1.7,
                  color: "var(--md-fg-secondary)",
                }}
              >
                &ldquo;Unlike commercial brands that broker mass-produced stock, we remain
                craftsmen first. Every customer receives our personal guarantee of pure 925
                silver, authentic gemstones, and transparent workshop pricing.&rdquo;
              </p>
              <div style={{ paddingTop: "12px", borderTop: "1px solid var(--md-rule)" }}>
                <span
                  style={{
                    fontFamily: "var(--md-font-display)",
                    fontSize: "1.0625rem",
                    fontStyle: "italic",
                    display: "block",
                  }}
                >
                  Amit Agarwal &amp; Saket Agarwal
                </span>
                <span
                  style={{
                    fontSize: "0.6875rem",
                    color: "var(--md-gold-antique)",
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    fontWeight: 600,
                  }}
                >
                  Directors · Millennium Designs
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 5. VISIT THE ATELIER & DIRECT CONCIERGE ───────────────────── */}
      <section
        data-surface="ivory-soft"
        style={{
          paddingInline: "var(--md-gutter)",
          paddingBlock: "clamp(56px, 7vw, 90px)",
          background: "var(--md-bg)",
        }}
      >
        <div
          style={{
            maxWidth: "760px",
            marginInline: "auto",
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
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
            ✦ VISIT OR CONNECT ✦
          </span>

          <h2
            style={{
              margin: "0 0 12px",
              fontFamily: "var(--md-font-display)",
              fontSize: "clamp(1.85rem, 3.5vw, 2.75rem)",
              lineHeight: 1.15,
              fontWeight: 400,
              color: "var(--md-fg)",
            }}
          >
            Our Atelier in Jaipur
          </h2>

          <p
            style={{
              margin: "0 0 24px",
              fontSize: "0.9375rem",
              lineHeight: 1.7,
              color: "var(--md-fg-secondary)",
              maxWidth: "580px",
            }}
          >
            Whether you are inquiring about a custom commission, wholesale catalog, or an
            heirloom emerald piece, our Jaipur workshop welcomes your inquiry.
          </p>

          {/* Physical Address Card */}
          <div
            className="md-atelier-card"
            style={{
              width: "100%",
              marginBottom: "28px",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              alignItems: "center",
            }}
          >
            <address
              style={{
                fontStyle: "normal",
                fontSize: "0.9375rem",
                lineHeight: 1.6,
                color: "var(--md-fg)",
                fontWeight: 500,
              }}
            >
              <strong style={{ fontSize: "1.0625rem", color: "var(--md-forest)" }}>
                Millenium Designs
              </strong>
              <br />
              5, Noor Plaza, Chameliwala Market, M.I. Road, Jaipur, 302001
              <br />
              Rajasthan, India
            </address>

            <div
              style={{
                display: "flex",
                gap: "16px",
                flexWrap: "wrap",
                justifyContent: "center",
                fontSize: "0.875rem",
                marginTop: "6px",
              }}
            >
              <a
                href="tel:+919829056597"
                style={{ color: "var(--md-forest)", textDecoration: "none", fontWeight: 600 }}
              >
                📞 +91 98290 56597
              </a>
              <span>·</span>
              <a
                href="tel:+919828156465"
                style={{ color: "var(--md-forest)", textDecoration: "none", fontWeight: 600 }}
              >
                +91 98281 56465
              </a>
            </div>
          </div>

          <div
            style={{ display: "flex", flexWrap: "wrap", gap: "14px", justifyContent: "center" }}
          >
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
                height: "46px",
                paddingInline: "26px",
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
              <span>WhatsApp Founders Consultation</span>
            </a>

            <Link
              href={`${prefix}/rings`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                height: "46px",
                paddingInline: "24px",
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
              Shop Curated Creations
            </Link>
          </div>
        </div>
      </section>
    </article>
  );
}
