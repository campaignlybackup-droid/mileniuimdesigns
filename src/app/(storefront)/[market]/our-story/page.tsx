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
  const prefix =
    resolved.code.toLowerCase() === "us" ? "" : `/${resolved.code.toLowerCase()}`;
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
            we are a family-owned jewellery maison in Jaipur. We melt our own silver,
            hand-set natural gemstones, and create fine jewellery with zero outsourcing.
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
          paddingBlock: "clamp(64px, 8vw, 112px)",
          background: "var(--md-bg)",
        }}
      >
        <div
          style={{
            maxWidth: "var(--md-container)",
            marginInline: "auto",
          }}
        >
          <div style={{ textAlign: "center", maxWidth: "700px", marginInline: "auto", marginBottom: "clamp(40px, 6vw, 72px)" }}>
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
                fontSize: "clamp(2rem, 4vw, 3.25rem)",
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
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))",
              gap: "clamp(24px, 3.5vw, 40px)",
            }}
          >
            {/* Step 1: 1961 */}
            <div
              style={{
                padding: "clamp(24px, 4vw, 36px)",
                background: "var(--md-ivory)",
                borderRadius: "var(--md-radius-sm)",
                border: "1px solid color-mix(in srgb, var(--md-champagne) 24%, transparent)",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                position: "relative",
              }}
            >
              <div>
                <span
                  style={{
                    fontFamily: "var(--md-font-display)",
                    fontSize: "2.5rem",
                    color: "var(--md-gold-antique)",
                    lineHeight: 1,
                    display: "block",
                    marginBottom: "12px",
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
                  }}
                >
                  The Beginning · Pushpak Jewels
                </span>
                <h3
                  style={{
                    margin: "0 0 14px",
                    fontFamily: "var(--md-font-display)",
                    fontSize: "1.375rem",
                    fontWeight: 400,
                    lineHeight: 1.25,
                    color: "var(--md-fg)",
                  }}
                >
                  Grandfather B. L. Agarwal
                </h3>
                <p
                  style={{
                    margin: 0,
                    fontSize: "0.9375rem",
                    lineHeight: 1.75,
                    color: "var(--md-fg-secondary)",
                  }}
                >
                  Our story began in the gemstone corridors of Jaipur. Grandfather B. L. Agarwal
                  founded Pushpak Jewels with a focus on natural emeralds. He built the brand on three
                  unshakeable pillars: authentic gemstones, trust with patrons, and meticulous
                  hand-craftsmanship.
                </p>
              </div>
            </div>

            {/* Step 2: 1999 */}
            <div
              style={{
                padding: "clamp(24px, 4vw, 36px)",
                background: "var(--md-ivory)",
                borderRadius: "var(--md-radius-sm)",
                border: "1px solid color-mix(in srgb, var(--md-champagne) 24%, transparent)",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                position: "relative",
              }}
            >
              <div>
                <span
                  style={{
                    fontFamily: "var(--md-font-display)",
                    fontSize: "2.5rem",
                    color: "var(--md-gold-antique)",
                    lineHeight: 1,
                    display: "block",
                    marginBottom: "12px",
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
                  }}
                >
                  The Next Generation · Going Global
                </span>
                <h3
                  style={{
                    margin: "0 0 14px",
                    fontFamily: "var(--md-font-display)",
                    fontSize: "1.375rem",
                    fontWeight: 400,
                    lineHeight: 1.25,
                    color: "var(--md-fg)",
                  }}
                >
                  Amit &amp; Saket Agarwal
                </h3>
                <p
                  style={{
                    margin: 0,
                    fontSize: "0.9375rem",
                    lineHeight: 1.75,
                    color: "var(--md-fg-secondary)",
                  }}
                >
                  Brothers Amit &amp; Saket expanded into international 925 sterling silver fine jewellery.
                  They developed our proprietary anti-tarnish alloy and presented collections at private
                  expositions in New York, London, and Milan &mdash; earning the trust of fine jewellery
                  collectors worldwide.
                </p>
              </div>
            </div>

            {/* Step 3: Today */}
            <div
              style={{
                padding: "clamp(24px, 4vw, 36px)",
                background: "var(--md-ivory)",
                borderRadius: "var(--md-radius-sm)",
                border: "1px solid color-mix(in srgb, var(--md-champagne) 36%, transparent)",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                position: "relative",
              }}
            >
              <div>
                <span
                  style={{
                    fontFamily: "var(--md-font-display)",
                    fontSize: "2.5rem",
                    color: "var(--md-forest)",
                    lineHeight: 1,
                    display: "block",
                    marginBottom: "12px",
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
                  }}
                >
                  Millennium Designs · In-House Atelier
                </span>
                <h3
                  style={{
                    margin: "0 0 14px",
                    fontFamily: "var(--md-font-display)",
                    fontSize: "1.375rem",
                    fontWeight: 400,
                    lineHeight: 1.25,
                    color: "var(--md-fg)",
                  }}
                >
                  Complete In-House Facility
                </h3>
                <p
                  style={{
                    margin: 0,
                    fontSize: "0.9375rem",
                    lineHeight: 1.75,
                    color: "var(--md-fg-secondary)",
                  }}
                >
                  Operating from our own dedicated workshop at Noor Plaza, Chameliwala Market in Jaipur.
                  Every single design is sketched, cast in silver, stone-set, and polished under one roof.
                  Nothing is ever outsourced.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 3. FOUR CLEAR DIFFERENTIATORS (WHAT MAKES US SPECIAL) ─────── */}
      <section
        data-surface="forest"
        style={{
          paddingInline: "var(--md-gutter)",
          paddingBlock: "clamp(64px, 8vw, 112px)",
          background: "var(--md-forest)",
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
          <div style={{ textAlign: "center", maxWidth: "700px", marginInline: "auto", marginBottom: "clamp(40px, 6vw, 64px)" }}>
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
              THE MILLENNIUM DIFFERENCE
            </span>
            <h2
              style={{
                margin: 0,
                fontFamily: "var(--md-font-display)",
                fontSize: "clamp(2rem, 4vw, 3.25rem)",
                lineHeight: 1.15,
                fontWeight: 400,
                color: "var(--md-fg-inverse)",
                letterSpacing: "-0.01em",
              }}
            >
              Why Connoisseurs Choose Our Jewellery
            </h2>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))",
              gap: "clamp(24px, 3.5vw, 40px)",
            }}
          >
            {[
              {
                number: "01",
                title: "Anti-Tarnish 925 Silver",
                desc: "Certified 92.5% pure elemental silver formulated with our proprietary anti-tarnish alloy. It stays lustrous and bright without darkening, and is 100% nickel-free and hypoallergenic.",
              },
              {
                number: "02",
                title: "100% In-House Made",
                desc: "Everything is crafted in our Jaipur factory. From lost-wax casting to stone setting and hand polishing, our artisans control every step so quality is never compromised.",
              },
              {
                number: "03",
                title: "Natural Untreated Gems",
                desc: "Authentic earth minerals — unheated emeralds, glowing rainbow moonstones, and deep royal amethysts — faceted by hand in our Jaipur lapidary for chromatic vibrancy.",
              },
              {
                number: "04",
                title: "Direct Factory Pricing",
                desc: "You purchase directly from the creators in Jaipur. With no middlemen, retail distributors, or showroom markups, you receive exceptional fine jewellery at genuine manufacturer prices.",
              },
            ].map((col) => (
              <div
                key={col.number}
                style={{
                  padding: "clamp(24px, 3vw, 32px)",
                  background: "color-mix(in srgb, var(--md-green-black) 60%, transparent)",
                  borderRadius: "var(--md-radius-sm)",
                  border: "1px solid color-mix(in srgb, var(--md-champagne) 22%, transparent)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--md-font-crest), Georgia, serif",
                    fontSize: "0.875rem",
                    color: "var(--md-champagne)",
                    fontWeight: 600,
                    letterSpacing: "0.14em",
                  }}
                >
                  {col.number}
                </span>
                <h3
                  style={{
                    margin: 0,
                    fontFamily: "var(--md-font-display)",
                    fontSize: "1.25rem",
                    fontWeight: 400,
                    color: "var(--md-fg-inverse)",
                  }}
                >
                  {col.title}
                </h3>
                <p
                  style={{
                    margin: 0,
                    fontSize: "0.875rem",
                    lineHeight: 1.7,
                    color: "var(--md-fg-inverse-muted)",
                  }}
                >
                  {col.desc}
                </p>
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
          paddingBlock: "clamp(64px, 8vw, 100px)",
          background: "var(--md-ivory)",
          borderBottom: "1px solid var(--md-rule)",
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
                margin: "0 0 16px",
                fontFamily: "var(--md-font-display)",
                fontSize: "clamp(2rem, 3.8vw, 3.25rem)",
                lineHeight: 1.15,
                fontWeight: 400,
                color: "var(--md-fg)",
              }}
            >
              Crafted in Jaipur, Cherished Globally
            </h2>
            <p
              style={{
                margin: "0 0 16px",
                fontSize: "var(--md-t-body-lg)",
                lineHeight: 1.8,
                color: "var(--md-fg-secondary)",
              }}
            >
              Our pieces are designed according to the aesthetic preferences of international
              buyers &mdash; with clean lines, comfortable daily-wear silhouettes, and substantial
              heft. Our primary patrons are women and collectors aged 30 and above who value genuine
              gemstones and enduring precious metalwork.
            </p>
            <p
              style={{
                margin: 0,
                fontSize: "var(--md-t-body)",
                lineHeight: 1.75,
                color: "var(--md-fg-secondary)",
              }}
            >
              We proudly ship to discerning clients and fine boutiques across:
            </p>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "8px",
                marginTop: "18px",
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
                    padding: "6px 14px",
                    borderRadius: "var(--md-radius-sm)",
                    background: "var(--md-bg)",
                    border: "1px solid var(--md-rule)",
                    fontSize: "0.8125rem",
                    color: "var(--md-fg)",
                    fontWeight: 500,
                  }}
                >
                  {country}
                </span>
              ))}
            </div>
          </div>

          {/* Quick Fact Callout */}
          <div
            style={{
              padding: "clamp(28px, 4vw, 44px)",
              background: "var(--md-bg)",
              borderRadius: "var(--md-radius-sm)",
              border: "1px solid color-mix(in srgb, var(--md-champagne) 30%, transparent)",
              boxShadow: "0 8px 24px -6px rgba(0, 0, 0, 0.04)",
              display: "flex",
              flexDirection: "column",
              gap: "18px",
            }}
          >
            <h3
              style={{
                margin: 0,
                fontFamily: "var(--md-font-display)",
                fontSize: "1.5rem",
                fontWeight: 400,
                color: "var(--md-fg)",
              }}
            >
              Direct From The Agarwal Family
            </h3>
            <p
              style={{
                margin: 0,
                fontSize: "0.9375rem",
                lineHeight: 1.75,
                color: "var(--md-fg-secondary)",
              }}
            >
              &ldquo;Unlike commercial brands that broker mass-produced stock, we remain craftsmen
              first. Every customer receives our personal guarantee of pure 925 silver, authentic
              gemstones, and transparent workshop pricing.&rdquo;
            </p>
            <div style={{ paddingTop: "12px", borderTop: "1px solid var(--md-rule)" }}>
              <span style={{ fontFamily: "var(--md-font-display)", fontSize: "1.125rem", fontStyle: "italic", display: "block" }}>
                Amit Agarwal &amp; Saket Agarwal
              </span>
              <span style={{ fontSize: "0.75rem", color: "var(--md-gold-antique)", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600 }}>
                Managing Directors · Millennium Designs
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ── 5. VISIT THE ATELIER & DIRECT CONCIERGE ───────────────────── */}
      <section
        data-surface="ivory-soft"
        style={{
          paddingInline: "var(--md-gutter)",
          paddingBlock: "clamp(64px, 8vw, 100px)",
          background: "var(--md-bg)",
        }}
      >
        <div
          style={{
            maxWidth: "960px",
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
            VISIT OR CONNECT
          </span>

          <h2
            style={{
              margin: "0 0 16px",
              fontFamily: "var(--md-font-display)",
              fontSize: "clamp(2rem, 4vw, 3.25rem)",
              lineHeight: 1.15,
              fontWeight: 400,
              color: "var(--md-fg)",
            }}
          >
            Our Atelier in Jaipur
          </h2>

          <p
            style={{
              margin: "0 0 28px",
              fontSize: "1.0625rem",
              lineHeight: 1.7,
              color: "var(--md-fg-secondary)",
              maxWidth: "600px",
            }}
          >
            Whether you are inquiring about a custom commission, wholesale catalog, or an heirloom
            emerald piece, Amit &amp; Saket Agarwal are available to assist you directly.
          </p>

          {/* Physical Address Card */}
          <div
            style={{
              padding: "20px 32px",
              background: "var(--md-ivory)",
              borderRadius: "var(--md-radius-sm)",
              border: "1px solid color-mix(in srgb, var(--md-champagne) 30%, transparent)",
              marginBottom: "32px",
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
              <strong>Millenium Designs</strong>
              <br />
              5, Noor Plaza, Chameliwala Market, M.I. Road, Jaipur, 302001
              <br />
              Rajasthan, India
            </address>

            <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", justifyContent: "center", fontSize: "0.875rem", marginTop: "4px" }}>
              <a href="tel:+919828156465" style={{ color: "var(--md-forest)", textDecoration: "none", fontWeight: 600 }}>
                📞 +91 98281 56465
              </a>
              <span>·</span>
              <a href="tel:+919829056597" style={{ color: "var(--md-forest)", textDecoration: "none", fontWeight: 600 }}>
                📞 +91 98290 56597
              </a>
            </div>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "14px", justifyContent: "center" }}>
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
                paddingInline: "28px",
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
                height: "48px",
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
