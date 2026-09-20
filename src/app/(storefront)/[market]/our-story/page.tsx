import type { JSX } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
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
    title: "Our Story · The 1961 Jaipur Atelier Chronicle | Millennium Designs",
    description:
      "The archival chronicle of Millennium Designs. Founded in 1961 by B. L. Agarwal as Pushpak Jewels, now led by Amit & Saket Agarwal — 60+ years of natural emeralds and proprietary anti-tarnish 925 silver craftsmanship, 100% in-house in Jaipur.",
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
    customMessage: "Hello Amit & Saket, I am reading your atelier chronicle and would love to enquire about your jewellery creations.",
  });

  return (
    <div
      style={{
        width: "100%",
        maxWidth: "100%",
        boxSizing: "border-box",
        background: "var(--md-bg)",
        color: "var(--md-fg)",
      }}
    >
      {/* ── PROLOGUE: THE JAIPUR MONOGRAPH HERO ───────────────────────── */}
      <section
        data-surface="green-black"
        style={{
          position: "relative",
          width: "100%",
          minHeight: "clamp(520px, 75vh, 840px)",
          background:
            "radial-gradient(ellipse at 50% 30%, var(--md-emerald-deep) 0%, var(--md-forest) 55%, var(--md-green-black) 100%)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          paddingInline: "var(--md-gutter)",
          paddingBlock: "clamp(64px, 8vw, 120px)",
          overflow: "hidden",
          borderBottom: "1px solid color-mix(in srgb, var(--md-champagne) 18%, transparent)",
        }}
      >
        {/* Subtle Archival Grid lines */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            opacity: 0.04,
            backgroundImage:
              "radial-gradient(circle at 50% 50%, var(--md-champagne) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
            pointerEvents: "none",
          }}
        />
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            top: 0,
            left: "clamp(24px, 8vw, 140px)",
            bottom: 0,
            width: "1px",
            background:
              "linear-gradient(to bottom, transparent, color-mix(in srgb, var(--md-champagne) 30%, transparent), transparent)",
          }}
        />

        <div
          style={{
            position: "relative",
            zIndex: 2,
            maxWidth: "var(--md-container)",
            marginInline: "auto",
            width: "100%",
          }}
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "12px",
              padding: "6px 16px",
              borderRadius: "var(--md-radius-sm)",
              border: "1px solid color-mix(in srgb, var(--md-champagne) 32%, transparent)",
              background: "rgba(4, 14, 9, 0.5)",
              fontSize: "0.6875rem",
              letterSpacing: "0.26em",
              textTransform: "uppercase",
              color: "var(--md-champagne)",
              fontFamily: "var(--md-font-crest), Georgia, serif",
              marginBottom: "var(--md-space-6)",
            }}
          >
            <span>ARCHIVAL MONOGRAPH</span>
            <span style={{ opacity: 0.4 }}>·</span>
            <span>JAIPUR, EST. 1961</span>
          </div>

          <h1
            style={{
              margin: "0 0 var(--md-space-5)",
              fontFamily: "var(--md-font-display)",
              fontSize: "clamp(2.5rem, 6vw, 5.25rem)",
              lineHeight: 1.08,
              fontWeight: 400,
              letterSpacing: "-0.015em",
              color: "var(--md-fg-inverse)",
              maxWidth: "960px",
            }}
          >
            A Six-Decade Dialogue Between Earth, Fire &amp; Sterling Silver
          </h1>

          <p
            style={{
              margin: "0 0 var(--md-space-8)",
              maxWidth: "680px",
              fontSize: "clamp(1.0625rem, 1.8vw, 1.25rem)",
              lineHeight: 1.75,
              color: "var(--md-fg-inverse-muted)",
              fontWeight: 300,
            }}
          >
            From a solitary emerald cutting atelier in Jaipur’s historic Johari corridors to
            heirloom 925 sterling silver cherished across six continents — the story of
            Millennium Designs is written in stone, fire, and an unbroken commitment to
            crafting every single jewel under our own roof.
          </p>

          {/* Archival Ledger Strip */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "clamp(20px, 4vw, 48px)",
              paddingTop: "var(--md-space-7)",
              borderTop: "1px solid color-mix(in srgb, var(--md-champagne) 20%, transparent)",
            }}
          >
            {[
              {
                period: "1961",
                label: "Pushpak Jewels Founded",
                detail: "B. L. Agarwal establishes the family's emerald lapidary in Jaipur.",
              },
              {
                period: "1999",
                label: "Global Expansion",
                detail: "Amit & Saket Agarwal introduce anti-tarnish 925 silver to international buyers.",
              },
              {
                period: "100%",
                label: "In-House Foundry",
                detail: "From rough stone faceting to final hallmarking — zero outsourcing.",
              },
              {
                period: "30+ Yrs",
                label: "Global Connoisseurs",
                detail: "Crafted specifically for the exacting standards of clients worldwide.",
              },
            ].map((col) => (
              <div key={col.period} style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <span
                  style={{
                    fontFamily: "var(--md-font-display)",
                    fontSize: "clamp(1.75rem, 2.5vw, 2.25rem)",
                    fontWeight: 400,
                    color: "var(--md-champagne)",
                    lineHeight: 1,
                  }}
                >
                  {col.period}
                </span>
                <span
                  style={{
                    fontSize: "0.6875rem",
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    color: "var(--md-fg-inverse)",
                    fontWeight: 600,
                  }}
                >
                  {col.label}
                </span>
                <span
                  style={{
                    fontSize: "0.8125rem",
                    color: "var(--md-fg-inverse-muted)",
                    lineHeight: 1.5,
                  }}
                >
                  {col.detail}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CHAPTER I: THE FOUNDATION (1961) ─────────────────────────── */}
      <section
        style={{
          paddingInline: "var(--md-gutter)",
          paddingBlock: "clamp(64px, 8vw, 112px)",
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
            alignItems: "center",
          }}
        >
          {/* Left: Archival Prose */}
          <div>
            <div
              style={{
                fontSize: "0.6875rem",
                letterSpacing: "0.24em",
                textTransform: "uppercase",
                color: "var(--md-gold-antique)",
                fontWeight: 600,
                marginBottom: "var(--md-space-3)",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <span>CHAPTER I</span>
              <span>·</span>
              <span>1961 : THE PUSHPAK ORIGINS</span>
            </div>

            <h2
              style={{
                margin: "0 0 var(--md-space-5)",
                fontFamily: "var(--md-font-display)",
                fontSize: "clamp(2rem, 3.8vw, 3.25rem)",
                lineHeight: 1.14,
                fontWeight: 400,
                color: "var(--md-fg)",
                letterSpacing: "-0.01em",
              }}
            >
              The Lapidary of Jaipur &amp; The Emerald Benchmark
            </h2>

            <p
              style={{
                margin: "0 0 var(--md-space-4)",
                fontSize: "var(--md-t-body-lg)",
                lineHeight: 1.85,
                color: "var(--md-fg-secondary)",
              }}
            >
              In the winter of 1961, our grandfather, <strong>B. L. Agarwal</strong>, founded
              Pushpak Jewels amidst the centuries-old gemstone alleys of Jaipur. At a time when
              the city was celebrated as the world’s lapidary capital for rough emeralds, he set
              apart his workshop by cultivating direct relationships with miners in Zambia and
              Colombia, cutting each crystal not for maximum carats, but for chromatic fire and
              inner luminosity.
            </p>

            <p
              style={{
                margin: "0 0 var(--md-space-6)",
                fontSize: "var(--md-t-body)",
                lineHeight: 1.85,
                color: "var(--md-fg-secondary)",
              }}
            >
              He operated under three unyielding principles: <em>Satya</em> (gemological truth),{" "}
              <em>Vishwas</em> (unconditional trade trust), and <em>Parishodhan</em> (relentless
              lapidary refinement). Every emerald parcel that passed across his bench was examined
              under northern daylight with a handheld brass loupe. Over four decades, Pushpak
              Jewels became a quiet cornerstone for royal houses and discerning jewel merchants
              who demanded unheated, ethically cut gemstones.
            </p>

            <div className="md-editorial-pullquote">
              <p
                style={{
                  margin: 0,
                  fontSize: "clamp(1.0625rem, 1.5vw, 1.25rem)",
                  color: "var(--md-charcoal)",
                }}
              >
                &ldquo;A jeweler’s standing is never built on a showroom facade. It is forged in the
                geometry of the facet, the integrity of the alloy, and the word given to the patron.&rdquo;
              </p>
              <cite
                style={{
                  display: "block",
                  marginTop: "10px",
                  fontSize: "0.75rem",
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  fontStyle: "normal",
                  color: "var(--md-gold-antique)",
                  fontWeight: 600,
                }}
              >
                — B. L. Agarwal · Founder, Pushpak Jewels (1961)
              </cite>
            </div>
          </div>

          {/* Right: Authentic Lapidary Visual Plate */}
          <div style={{ position: "relative" }}>
            <div className="md-editorial-frame" style={{ aspectRatio: "4/3", width: "100%" }}>
              <Image
                src="/images/story/atelier_emerald_lapidary.jpg"
                alt="Master lapidary craftsman examining an emerald rough at a traditional wooden workbench in Jaipur"
                fill
                sizes="(max-width: 768px) 100vw, 50vw"
                style={{ objectFit: "cover" }}
                priority
              />
            </div>
            <div
              style={{
                marginTop: "14px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                fontSize: "0.75rem",
                color: "var(--md-fg-muted)",
                borderTop: "1px solid var(--md-rule)",
                paddingTop: "8px",
              }}
            >
              <span style={{ fontStyle: "italic", fontFamily: "var(--md-font-display)" }}>
                Plate I: Natural emerald stone grading at our Jaipur lapidary
              </span>
              <span style={{ letterSpacing: "0.1em", textTransform: "uppercase", fontSize: "0.6875rem" }}>
                Archival Record · BL-1961
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ── CHAPTER II: THE NEXT GENERATION (1999) ───────────────────── */}
      <section
        data-surface="ivory-soft"
        style={{
          paddingInline: "var(--md-gutter)",
          paddingBlock: "clamp(64px, 8vw, 112px)",
          background: "var(--md-ivory-soft)",
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
          <div style={{ maxWidth: "780px", marginBottom: "var(--md-space-8)" }}>
            <div
              style={{
                fontSize: "0.6875rem",
                letterSpacing: "0.24em",
                textTransform: "uppercase",
                color: "var(--md-gold-antique)",
                fontWeight: 600,
                marginBottom: "var(--md-space-3)",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <span>CHAPTER II</span>
              <span>·</span>
              <span>1999 : THE GLOBAL HORIZON</span>
            </div>

            <h2
              style={{
                margin: "0 0 var(--md-space-5)",
                fontFamily: "var(--md-font-display)",
                fontSize: "clamp(2rem, 3.8vw, 3.25rem)",
                lineHeight: 1.14,
                fontWeight: 400,
                color: "var(--md-fg)",
                letterSpacing: "-0.01em",
              }}
            >
              Amit &amp; Saket Agarwal: Bridging Jaipur Craftsmanship to the World
            </h2>

            <p
              style={{
                margin: "0 0 var(--md-space-4)",
                fontSize: "var(--md-t-body-lg)",
                lineHeight: 1.85,
                color: "var(--md-fg-secondary)",
              }}
            >
              By the close of the twentieth century, the global jewelry landscape was undergoing
              a quiet transformation. Discerning buyers in the United States, Europe, and Australia
              were seeking the architectural permanence of fine jewelry without the speculative
              artifice of five-figure retail markups.
            </p>

            <p
              style={{
                margin: 0,
                fontSize: "var(--md-t-body)",
                lineHeight: 1.85,
                color: "var(--md-fg-secondary)",
              }}
            >
              Taking the helm in 1999, <strong>Amit Agarwal and Saket Agarwal</strong> recognized
              that Jaipur’s centuries-old bench techniques — lost-wax casting, micro-filigree,
              chased metalwork, and precision prong setting — could be unified with modern Western
              silhouettes. They christened this global vision <strong>Millennium Designs</strong>,
              presenting collections at private expositions in Milan, London, and New York.
            </p>
          </div>

          {/* Editorial Monograph Grid: 3 Pillars of Global Design */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: "clamp(24px, 4vw, 48px)",
              paddingTop: "var(--md-space-6)",
              borderTop: "1px solid var(--md-rule)",
            }}
          >
            <div>
              <span
                style={{
                  fontSize: "0.75rem",
                  fontFamily: "var(--md-font-crest), Georgia, serif",
                  color: "var(--md-gold-antique)",
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  display: "block",
                  marginBottom: "8px",
                }}
              >
                01 · THE WESTERN SILHOUETTE
              </span>
              <h3
                style={{
                  margin: "0 0 10px",
                  fontFamily: "var(--md-font-display)",
                  fontSize: "1.25rem",
                  fontWeight: 400,
                  color: "var(--md-fg)",
                }}
              >
                Ergonomics &amp; Daily Wear
              </h3>
              <p
                style={{
                  margin: 0,
                  fontSize: "0.875rem",
                  lineHeight: 1.7,
                  color: "var(--md-fg-secondary)",
                }}
              >
                Low-profile bezel settings, smooth interior comfort-bands, and balanced center of
                gravity designed specifically for Western lifestyles, professional settings, and daily wear.
              </p>
            </div>

            <div>
              <span
                style={{
                  fontSize: "0.75rem",
                  fontFamily: "var(--md-font-crest), Georgia, serif",
                  color: "var(--md-gold-antique)",
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  display: "block",
                  marginBottom: "8px",
                }}
              >
                02 · NATURAL COLOR HARMONY
              </span>
              <h3
                style={{
                  margin: "0 0 10px",
                  fontFamily: "var(--md-font-display)",
                  fontSize: "1.25rem",
                  fontWeight: 400,
                  color: "var(--md-fg)",
                }}
              >
                Untreated Earth Minerals
              </h3>
              <p
                style={{
                  margin: 0,
                  fontSize: "0.875rem",
                  lineHeight: 1.7,
                  color: "var(--md-fg-secondary)",
                }}
              >
                Pairing vibrant royal blue lapis, deep African amethysts, iridescent rainbow
                moonstones, and Zambian emeralds directly with anti-tarnish precious metals.
              </p>
            </div>

            <div>
              <span
                style={{
                  fontSize: "0.75rem",
                  fontFamily: "var(--md-font-crest), Georgia, serif",
                  color: "var(--md-gold-antique)",
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  display: "block",
                  marginBottom: "8px",
                }}
              >
                03 · FACTORY-DIRECT HONESTY
              </span>
              <h3
                style={{
                  margin: "0 0 10px",
                  fontFamily: "var(--md-font-display)",
                  fontSize: "1.25rem",
                  fontWeight: 400,
                  color: "var(--md-fg)",
                }}
              >
                Direct Jaipur Atelier Value
              </h3>
              <p
                style={{
                  margin: 0,
                  fontSize: "0.875rem",
                  lineHeight: 1.7,
                  color: "var(--md-fg-secondary)",
                }}
              >
                Eliminating domestic distributors, overseas importers, and middleman traders.
                Connoisseurs receive atelier-direct pricing with pure metallurgical transparency.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── CHAPTER III: THE METALLURGICAL CODEX (PURE 925) ───────────── */}
      <section
        style={{
          paddingInline: "var(--md-gutter)",
          paddingBlock: "clamp(64px, 8vw, 112px)",
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
            alignItems: "center",
          }}
        >
          {/* Left: Authentic Bench Silversmith Visual Plate */}
          <div style={{ position: "relative", order: 2 }}>
            <div className="md-editorial-frame" style={{ aspectRatio: "4/3", width: "100%" }}>
              <Image
                src="/images/story/atelier_bench_silversmith.jpg"
                alt="Master bench silversmith hand-filing and shaping a 925 sterling silver ring in Jaipur"
                fill
                sizes="(max-width: 768px) 100vw, 50vw"
                style={{ objectFit: "cover" }}
              />
            </div>
            <div
              style={{
                marginTop: "14px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                fontSize: "0.75rem",
                color: "var(--md-fg-muted)",
                borderTop: "1px solid var(--md-rule)",
                paddingTop: "8px",
              }}
            >
              <span style={{ fontStyle: "italic", fontFamily: "var(--md-font-display)" }}>
                Plate II: Hand-carving 925 anti-tarnish silver at the bench pin
              </span>
              <span style={{ letterSpacing: "0.1em", textTransform: "uppercase", fontSize: "0.6875rem" }}>
                Atelier Chameliwala · MD-JAIPUR
              </span>
            </div>
          </div>

          {/* Right: Technical Metallurgical Narrative */}
          <div style={{ order: 1 }}>
            <div
              style={{
                fontSize: "0.6875rem",
                letterSpacing: "0.24em",
                textTransform: "uppercase",
                color: "var(--md-gold-antique)",
                fontWeight: 600,
                marginBottom: "var(--md-space-3)",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <span>CHAPTER III</span>
              <span>·</span>
              <span>METALLURGY &amp; ALLOY INTEGRITY</span>
            </div>

            <h2
              style={{
                margin: "0 0 var(--md-space-5)",
                fontFamily: "var(--md-font-display)",
                fontSize: "clamp(2rem, 3.8vw, 3.25rem)",
                lineHeight: 1.14,
                fontWeight: 400,
                color: "var(--md-fg)",
                letterSpacing: "-0.01em",
              }}
            >
              Pure 925 Sterling Silver &amp; The Anti-Tarnish Formulation
            </h2>

            <p
              style={{
                margin: "0 0 var(--md-space-4)",
                fontSize: "var(--md-t-body-lg)",
                lineHeight: 1.85,
                color: "var(--md-fg-secondary)",
              }}
            >
              Standard commercial sterling silver is alloyed with raw copper, which reacts rapidly
              with airborne sulphur and moisture, causing dark oxide discolouration within months of
              exposure. Many mass brands mask this flaw with ephemeral flash-coatings that wear off
              with gentle friction.
            </p>

            <p
              style={{
                margin: "0 0 var(--md-space-5)",
                fontSize: "var(--md-t-body)",
                lineHeight: 1.85,
                color: "var(--md-fg-secondary)",
              }}
            >
              At Millennium Designs, our foundry casts strictly with certified <strong>92.5% pure elemental silver</strong>,
              bonded with a proprietary metallurgical anti-tarnish alloy developed over two decades.
              This formulation creates an enduring micro-crystalline barrier against oxidation,
              preserving a mirror-white, moonlit sheen even in humid seaside climates.
            </p>

            {/* Technical Checklist */}
            <div style={{ display: "flex", flexDirection: "column", gap: "14px", marginTop: "24px" }}>
              {[
                {
                  title: "100% Hypoallergenic & Skin-Safe",
                  desc: "Completely devoid of nickel, lead, or toxic cadmium fillers commonly used in mass-market commercial jewelry.",
                },
                {
                  title: "Micro-Pore Free Lost-Wax Vacuum Casting",
                  desc: "Induction melted in inert atmosphere to prevent porosity, ensuring tensile strength and heirloom resilience.",
                },
                {
                  title: "Molecular Anti-Tarnish Longevity",
                  desc: "Tested under accelerated climatic chambers to maintain luminous luster without requiring aggressive chemical dips.",
                },
              ].map((spec) => (
                <div key={spec.title} style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                  <div
                    style={{
                      width: "6px",
                      height: "6px",
                      borderRadius: "50%",
                      background: "var(--md-champagne)",
                      marginTop: "7px",
                      flexShrink: 0,
                    }}
                  />
                  <div>
                    <strong style={{ fontSize: "0.875rem", color: "var(--md-fg)", display: "block" }}>
                      {spec.title}
                    </strong>
                    <span style={{ fontSize: "0.8125rem", color: "var(--md-fg-muted)", lineHeight: 1.5 }}>
                      {spec.desc}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── CHAPTER IV: 100% IN-HOUSE ATELIER CODEX ────────────────────── */}
      <section
        data-surface="forest"
        style={{
          paddingInline: "var(--md-gutter)",
          paddingBlock: "clamp(72px, 9vw, 120px)",
          background: "var(--md-forest)",
          color: "var(--md-fg-inverse)",
        }}
      >
        <div
          style={{
            maxWidth: "var(--md-container)",
            marginInline: "auto",
          }}
        >
          <div style={{ maxWidth: "820px", marginBottom: "var(--md-space-9)" }}>
            <div
              style={{
                fontSize: "0.6875rem",
                letterSpacing: "0.26em",
                textTransform: "uppercase",
                color: "var(--md-champagne)",
                fontWeight: 600,
                marginBottom: "var(--md-space-3)",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <span>CHAPTER IV</span>
              <span>·</span>
              <span>THE CODEX OF COMPLETE CUSTODY</span>
            </div>

            <h2
              style={{
                margin: "0 0 var(--md-space-5)",
                fontFamily: "var(--md-font-display)",
                fontSize: "clamp(2.25rem, 4.5vw, 3.75rem)",
                lineHeight: 1.1,
                fontWeight: 400,
                letterSpacing: "-0.015em",
                color: "var(--md-fg-inverse)",
              }}
            >
              Nothing is Outsourced.
              <br />
              Every Gram Formed Under One Roof.
            </h2>

            <p
              style={{
                margin: 0,
                fontSize: "clamp(1rem, 1.6vw, 1.1875rem)",
                lineHeight: 1.75,
                color: "var(--md-fg-inverse-muted)",
                fontWeight: 300,
              }}
            >
              In an industry where over 90% of commercial labels outsource production to distant
              job-work factories, Millennium Designs retains complete custody of every creation.
              Inside our Jaipur atelier at Noor Plaza, master artisans who have inherited family
              techniques work in direct coordination with our design directors.
            </p>
          </div>

          {/* Archival Ledger Format (No AI Cards) */}
          <div
            style={{
              borderTop: "1px solid color-mix(in srgb, var(--md-fg-inverse) 14%, transparent)",
            }}
          >
            {[
              {
                code: "CODEX 01",
                title: "Lapidary Selection & Gem Calibrations",
                description:
                  "Rough mineral specimens of natural emerald, royal amethyst, and rainbow moonstone are cut, faceted, and measured in our in-house lapidary. We never purchase pre-calibrated factory commercial lots.",
              },
              {
                code: "CODEX 02",
                title: "Precision Lost-Wax Metallurgy",
                description:
                  "Sculpted wax models are encased in fine ceramic investment and cast in certified 925 silver with anti-tarnish alloy using computer-regulated vacuum induction casting chambers.",
              },
              {
                code: "CODEX 03",
                title: "Micro-Bench Fabrication & Prong Dressing",
                description:
                  "Every gemstone seat is individually cut into the solid silver mounting by a master bench jeweler using hardened tungsten carbide gravers, ensuring flush stone stability without glue or fillers.",
              },
              {
                code: "CODEX 04",
                title: "Multi-Stage Mirror Finish & Anti-Tarnish Bath",
                description:
                  "Jewels undergo progressive hand-buffing with Tripoli and diamond rouge compounds, followed by an electro-chemical anti-tarnish bonding pass that protects deep recesses from atmospheric oxidation.",
              },
              {
                code: "CODEX 05",
                title: "Optical Loupe Inspection & Certification",
                description:
                  "Every finished ring, pendant, and bracelet is independently weighed, hallmarked, and examined under 10x gemological magnification before receiving clearance for client dispatch.",
              },
            ].map((entry) => (
              <div
                key={entry.code}
                style={{
                  display: "grid",
                  gridTemplateColumns: "clamp(90px, 12vw, 140px) 1fr",
                  gap: "clamp(16px, 4vw, 40px)",
                  paddingBlock: "clamp(20px, 3vw, 32px)",
                  borderBottom: "1px solid color-mix(in srgb, var(--md-fg-inverse) 12%, transparent)",
                  alignItems: "baseline",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--md-font-crest), Georgia, serif",
                    fontSize: "0.75rem",
                    letterSpacing: "0.2em",
                    textTransform: "uppercase",
                    color: "var(--md-champagne)",
                    fontWeight: 600,
                  }}
                >
                  {entry.code}
                </span>
                <div>
                  <h3
                    style={{
                      margin: "0 0 8px",
                      fontFamily: "var(--md-font-display)",
                      fontSize: "clamp(1.125rem, 1.8vw, 1.4rem)",
                      fontWeight: 400,
                      color: "var(--md-fg-inverse)",
                      lineHeight: 1.25,
                    }}
                  >
                    {entry.title}
                  </h3>
                  <p
                    style={{
                      margin: 0,
                      fontSize: "0.875rem",
                      lineHeight: 1.7,
                      color: "var(--md-fg-inverse-muted)",
                      maxWidth: "760px",
                    }}
                  >
                    {entry.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CHAPTER V: GLOBAL CONNOISSEURS & THE JAIPUR ATELIER ───────── */}
      <section
        style={{
          paddingInline: "var(--md-gutter)",
          paddingBlock: "clamp(72px, 8vw, 120px)",
          background: "var(--md-bg)",
        }}
      >
        <div
          style={{
            maxWidth: "var(--md-container)",
            marginInline: "auto",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 460px), 1fr))",
            gap: "clamp(36px, 6vw, 72px)",
            alignItems: "start",
          }}
        >
          {/* Left: Global Demographics & Craft Identity */}
          <div>
            <div
              style={{
                fontSize: "0.6875rem",
                letterSpacing: "0.24em",
                textTransform: "uppercase",
                color: "var(--md-gold-antique)",
                fontWeight: 600,
                marginBottom: "var(--md-space-3)",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <span>CHAPTER V</span>
              <span>·</span>
              <span>PATRONS ACROSS SIX CONTINENTS</span>
            </div>

            <h2
              style={{
                margin: "0 0 var(--md-space-4)",
                fontFamily: "var(--md-font-display)",
                fontSize: "clamp(2rem, 3.8vw, 3.25rem)",
                lineHeight: 1.14,
                fontWeight: 400,
                color: "var(--md-fg)",
                letterSpacing: "-0.01em",
              }}
            >
              Adored in New York, Milan, Sydney &amp; Beyond
            </h2>

            <p
              style={{
                margin: "0 0 var(--md-space-4)",
                fontSize: "var(--md-t-body-lg)",
                lineHeight: 1.85,
                color: "var(--md-fg-secondary)",
              }}
            >
              While our bench rests in Jaipur, our creations adorn collectors in thirty nations.
              Our primary patronage comes from jewelry lovers aged thirty and above across the
              United States, Canada, the United Kingdom, Italy, Germany, Australia, Ukraine, and
              Russia — connoisseurs who appreciate the tactile density of pure sterling silver
              and the timeless narrative of untreated natural gems.
            </p>

            <p
              style={{
                margin: "0 0 var(--md-space-6)",
                fontSize: "var(--md-t-body)",
                lineHeight: 1.85,
                color: "var(--md-fg-secondary)",
              }}
            >
              Whether providing custom bridal jewellery sets or single heirloom statement rings,
              we conduct each transaction with direct factory integrity. You are speaking directly
              with the artisans and directors who cast the metal and hand-finish each setting.
            </p>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "10px",
                paddingTop: "var(--md-space-4)",
                borderTop: "1px solid var(--md-rule)",
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
              ].map((c) => (
                <span
                  key={c}
                  style={{
                    fontSize: "0.75rem",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "var(--md-fg-secondary)",
                    padding: "4px 10px",
                    border: "1px solid var(--md-rule)",
                    borderRadius: "var(--md-radius-sm)",
                    background: "var(--md-ivory)",
                    fontFamily: "var(--md-font-crest), Georgia, serif",
                  }}
                >
                  {c}
                </span>
              ))}
            </div>
          </div>

          {/* Right: Atelier Location & Contact Card */}
          <div
            style={{
              padding: "clamp(24px, 4vw, 40px)",
              background: "var(--md-ivory)",
              borderRadius: "var(--md-radius-sm)",
              border: "1px solid color-mix(in srgb, var(--md-champagne) 35%, transparent)",
              boxShadow: "0 12px 32px -8px rgba(0, 0, 0, 0.06)",
            }}
          >
            <div
              style={{
                fontSize: "0.6875rem",
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: "var(--md-gold-antique)",
                fontFamily: "var(--md-font-crest), Georgia, serif",
                marginBottom: "8px",
              }}
            >
              VISIT OUR JAIPUR WORKSHOP
            </div>

            <h3
              style={{
                margin: "0 0 16px",
                fontFamily: "var(--md-font-display)",
                fontSize: "1.75rem",
                fontWeight: 400,
                color: "var(--md-fg)",
                lineHeight: 1.2,
              }}
            >
              Millenium Designs Atelier
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
              <strong>Millenium Designs</strong>
              <br />
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
                paddingTop: "16px",
                borderTop: "1px solid var(--md-rule)",
                marginBottom: "28px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "0.75rem", color: "var(--md-fg-muted)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  Primary Concierge
                </span>
                <a
                  href={`tel:+${MILLENNIUM_WHATSAPP_NUMBER}`}
                  style={{
                    color: "var(--md-fg)",
                    fontWeight: 600,
                    textDecoration: "none",
                    fontSize: "0.875rem",
                  }}
                >
                  +91 98281 56465
                </a>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "0.75rem", color: "var(--md-fg-muted)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  Secondary Direct Line
                </span>
                <a
                  href={`tel:+${MILLENNIUM_SECONDARY_PHONE}`}
                  style={{
                    color: "var(--md-fg)",
                    fontWeight: 600,
                    textDecoration: "none",
                    fontSize: "0.875rem",
                  }}
                >
                  +91 98290 56597
                </a>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "0.75rem", color: "var(--md-fg-muted)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  Principals
                </span>
                <span style={{ fontSize: "0.875rem", color: "var(--md-fg)" }}>
                  Amit Agarwal &amp; Saket Agarwal
                </span>
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
                <span>WhatsApp Founders Consultation</span>
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
                Shop High Jewellery Creations
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
