import type { JSX } from "react";
import type { Metadata } from "next";
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
    title: "Our Story | Millennium Designs — Over 60 Years of Jewellery Heritage",
    description:
      "From Pushpak Jewels in 1961 to Millennium Designs today — discover the Agarwal family's six-decade legacy of emerald and silver jewellery craftsmanship, made entirely in-house in Jaipur.",
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
  const whatsappUrl = buildWhatsAppInquiryUrl({ topic: "bespoke" });

  return (
    <div
      style={{
        width: "100%",
        maxWidth: "100%",
        boxSizing: "border-box",
      }}
    >
      {/* HERO */}
      <section
        data-surface="green-black"
        style={{
          position: "relative",
          width: "100%",
          minHeight: "clamp(560px, 82vh, 920px)",
          background:
            "radial-gradient(ellipse at 60% 20%, var(--md-emerald-deep) 0%, var(--md-forest) 45%, var(--md-green-black) 100%)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "flex-start",
          paddingInline: "var(--md-gutter)",
          paddingBlock: "var(--md-space-10) var(--md-space-9)",
          overflow: "hidden",
        }}
      >
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            opacity: 0.03,
            backgroundImage:
              "radial-gradient(circle at 50% 50%, var(--md-champagne) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
            pointerEvents: "none",
          }}
        />
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            top: 0,
            right: "clamp(60px, 18vw, 280px)",
            width: "1px",
            height: "100%",
            background:
              "linear-gradient(to bottom, transparent 0%, var(--md-champagne) 30%, var(--md-gold-antique) 70%, transparent 100%)",
            opacity: 0.18,
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
              gap: "var(--md-space-3)",
              padding: "6px 18px",
              borderRadius: "var(--md-radius-sm)",
              border:
                "1px solid color-mix(in srgb, var(--md-champagne) 30%, transparent)",
              background:
                "color-mix(in srgb, var(--md-emerald-deep) 50%, transparent)",
              fontSize: "0.6875rem",
              letterSpacing: "0.24em",
              textTransform: "uppercase",
              color: "var(--md-champagne)",
              fontWeight: 500,
              marginBottom: "var(--md-space-6)",
            }}
          >
            JAIPUR · EST. 1961
          </div>

          <h1
            style={{
              margin: "0 0 var(--md-space-5)",
              fontFamily: "var(--md-font-display)",
              fontSize: "clamp(2.8rem, 6.5vw, 5.5rem)",
              lineHeight: 1.06,
              fontWeight: 400,
              letterSpacing: "-0.015em",
              color: "var(--md-fg-inverse)",
              maxWidth: "820px",
            }}
          >
            A Legacy Shaped
            <br />
            by Three Generations
          </h1>

          <p
            style={{
              margin: "0 0 var(--md-space-8)",
              maxWidth: "580px",
              fontSize: "clamp(1rem, 1.6vw, 1.125rem)",
              lineHeight: 1.72,
              color: "var(--md-fg-inverse-muted)",
              fontWeight: 300,
            }}
          >
            From a single emerald atelier in the Pink City, to silver jewellery
            admired across six continents &mdash; the story of Millennium Designs is
            one of heritage, craft, and unwavering dedication to exceptional quality.
          </p>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "clamp(28px, 5vw, 64px)",
              paddingTop: "var(--md-space-6)",
              borderTop:
                "1px solid color-mix(in srgb, var(--md-fg-inverse) 12%, transparent)",
            }}
          >
            {[
              { value: "60+", label: "Years of Heritage" },
              { value: "925", label: "Sterling Silver Standard" },
              { value: "100%", label: "In-house Manufacturing" },
              { value: "Global", label: "Reach Across Continents" },
            ].map((stat) => (
              <div key={stat.label}>
                <div
                  style={{
                    fontFamily: "var(--md-font-display)",
                    fontSize: "clamp(2rem, 3.5vw, 3rem)",
                    fontWeight: 400,
                    color: "var(--md-champagne)",
                    lineHeight: 1,
                    marginBottom: "6px",
                  }}
                >
                  {stat.value}
                </div>
                <div
                  style={{
                    fontSize: "0.6875rem",
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    color: "var(--md-fg-inverse-muted)",
                    fontWeight: 500,
                  }}
                >
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* MISSION BANNER */}
      <section
        data-surface="emerald-deep"
        style={{
          paddingInline: "var(--md-gutter)",
          paddingBlock: "var(--md-space-8)",
        }}
      >
        <div
          style={{
            maxWidth: "var(--md-container)",
            marginInline: "auto",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "var(--md-space-6)",
            justifyContent: "space-between",
          }}
        >
          <p
            style={{
              margin: 0,
              fontFamily: "var(--md-font-display)",
              fontSize: "clamp(1.25rem, 2.2vw, 1.75rem)",
              fontWeight: 400,
              fontStyle: "italic",
              color: "var(--md-fg-inverse)",
              maxWidth: "700px",
              lineHeight: 1.5,
            }}
          >
            &ldquo;To bring the finest jewellery of Jaipur to every corner of
            the world &mdash; crafted by hand, priced with integrity.&rdquo;
          </p>
          <div
            style={{
              width: "clamp(60px, 8vw, 120px)",
              height: "1px",
              background:
                "linear-gradient(to right, var(--md-champagne), transparent)",
              flexShrink: 0,
            }}
            aria-hidden="true"
          />
        </div>
      </section>

      {/* TIMELINE */}
      <section
        data-surface="ivory-soft"
        style={{
          paddingInline: "var(--md-gutter)",
          paddingBlock: "var(--md-space-10)",
        }}
      >
        <div
          style={{
            maxWidth: "var(--md-container-text)",
            marginInline: "auto",
          }}
        >
          <div style={{ marginBottom: "var(--md-space-9)" }}>
            <p
              style={{
                margin: "0 0 var(--md-space-3)",
                fontSize: "var(--md-t-label)",
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: "var(--md-gold-antique)",
                fontWeight: 600,
              }}
            >
              Our Story
            </p>
            <h2
              style={{
                margin: 0,
                fontFamily: "var(--md-font-display)",
                fontSize: "var(--md-t-display)",
                fontWeight: 400,
                lineHeight: 1.12,
                letterSpacing: "-0.01em",
                color: "var(--md-fg)",
              }}
            >
              Three Generations,
              <br />
              One Enduring Vision
            </h2>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--md-space-9)",
              position: "relative",
            }}
          >
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                left: "clamp(28px, 5vw, 48px)",
                top: 0,
                bottom: 0,
                width: "1px",
                background:
                  "linear-gradient(to bottom, var(--md-champagne), var(--md-stone) 60%, transparent)",
                opacity: 0.5,
              }}
            />

            {(
              [
                {
                  year: "1961",
                  title: "The Foundation",
                  subtitle: "Pushpak Jewels is born",
                  body: "Our grandfather, B. L. Agarwal, founded Pushpak Jewels in the heart of Jaipur. Specialising in emerald jewellery, he built the business on three unshakeable pillars: trust, authenticity, and exceptional quality. Every piece that left the atelier carried his personal guarantee.",
                  featured: false,
                },
                {
                  year: "1999",
                  title: "The Next Generation",
                  subtitle: "Silver and the world stage",
                  body: "Amit Agarwal and Saket Agarwal expanded the family business into the world of silver jewellery. With a vision to carry Jaipur's jewellery heritage to a global audience, they showcased collections at prestigious trade shows across Europe and the United States, forging lasting relationships with international buyers.",
                  featured: false,
                },
                {
                  year: "Today",
                  title: "Millennium Designs",
                  subtitle: "A new name, the same soul",
                  body: "What began as Pushpak Jewels has evolved into Millennium Designs — combining over six decades of craftsmanship with contemporary design and international standards. We operate from our own in-house manufacturing facility in Jaipur, with every stage from design to finishing managed under one roof.",
                  featured: true,
                },
              ] as const
            ).map((entry) => (
              <div
                key={entry.year}
                style={{
                  display: "grid",
                  gridTemplateColumns: "clamp(56px, 10vw, 96px) 1fr",
                  gap: "var(--md-space-5)",
                  alignItems: "flex-start",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "var(--md-space-2)",
                    paddingTop: "4px",
                    position: "relative",
                    zIndex: 2,
                  }}
                >
                  <div
                    style={{
                      width: entry.featured ? 14 : 10,
                      height: entry.featured ? 14 : 10,
                      borderRadius: "999px",
                      background: entry.featured
                        ? "var(--md-champagne)"
                        : "var(--md-gold-antique)",
                      border: "2px solid var(--md-ivory-soft)",
                      outline: entry.featured
                        ? "2px solid color-mix(in srgb, var(--md-champagne) 30%, transparent)"
                        : "none",
                      outlineOffset: 2,
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      fontFamily: "var(--md-font-display)",
                      fontSize: "clamp(0.9rem, 1.5vw, 1.1rem)",
                      fontWeight: 400,
                      color: "var(--md-gold-antique)",
                      lineHeight: 1,
                      textAlign: "center",
                    }}
                  >
                    {entry.year}
                  </span>
                </div>

                <div
                  style={{
                    background: "var(--md-ivory)",
                    borderRadius: "var(--md-radius-sm)",
                    padding: "var(--md-space-6)",
                    borderLeft: "3px solid var(--md-champagne)",
                  }}
                >
                  <p
                    style={{
                      margin: "0 0 var(--md-space-1)",
                      fontSize: "var(--md-t-label)",
                      letterSpacing: "0.18em",
                      textTransform: "uppercase",
                      color: "var(--md-gold-antique)",
                      fontWeight: 600,
                    }}
                  >
                    {entry.subtitle}
                  </p>
                  <h3
                    style={{
                      margin: "0 0 var(--md-space-4)",
                      fontFamily: "var(--md-font-display)",
                      fontSize: "var(--md-t-title)",
                      fontWeight: 400,
                      lineHeight: 1.2,
                      color: "var(--md-fg)",
                    }}
                  >
                    {entry.title}
                  </h3>
                  <p
                    style={{
                      margin: 0,
                      fontSize: "var(--md-t-body-lg)",
                      lineHeight: 1.8,
                      color: "var(--md-fg-secondary)",
                    }}
                  >
                    {entry.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* DIFFERENTIATORS */}
      <section
        data-surface="forest"
        style={{
          paddingInline: "var(--md-gutter)",
          paddingBlock: "var(--md-space-10)",
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
            <p
              style={{
                margin: "0 0 var(--md-space-3)",
                fontSize: "var(--md-t-label)",
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: "var(--md-champagne)",
                fontWeight: 600,
              }}
            >
              Why Millennium Designs
            </p>
            <h2
              style={{
                margin: 0,
                fontFamily: "var(--md-font-display)",
                fontSize: "var(--md-t-display)",
                fontWeight: 400,
                lineHeight: 1.1,
                letterSpacing: "-0.01em",
                color: "var(--md-fg-inverse)",
                maxWidth: "700px",
                marginInline: "auto",
              }}
            >
              Crafted Differently.
              <br />
              Always In-house.
            </h2>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: "var(--md-space-5)",
            }}
          >
            {[
              {
                icon: "⬡",
                title: "Pure 925 Sterling Silver",
                body: "Every silver piece is crafted from certified 925 sterling silver with a proprietary anti-tarnish alloy, so the beauty you buy is the beauty that lasts.",
              },
              {
                icon: "◈",
                title: "100% In-house Manufacturing",
                body: "Nothing is outsourced. Every design is born, developed, crafted, and finished under one roof in our Jaipur facility by artisans who have spent lifetimes perfecting their craft.",
              },
              {
                icon: "◇",
                title: "Made for the World's Taste",
                body: "Every silhouette and stone combination is designed for global buyers with deep insight into the preferences of customers in the USA, Europe, Australia, and beyond.",
              },
              {
                icon: "✦",
                title: "Legacy Pricing",
                body: "Premium quality at honest prices. Six decades of direct, in-house manufacturing means we pass every saving on to you — no middlemen, no mark-ups.",
              },
            ].map((pillar) => (
              <div
                key={pillar.title}
                style={{
                  background:
                    "color-mix(in srgb, var(--md-ivory-soft) 6%, transparent)",
                  border:
                    "1px solid color-mix(in srgb, var(--md-fg-inverse) 10%, transparent)",
                  borderRadius: "var(--md-radius-sm)",
                  padding: "var(--md-space-7) var(--md-space-6)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "var(--md-space-4)",
                }}
              >
                <div
                  style={{
                    fontFamily: "var(--md-font-display)",
                    fontSize: "2rem",
                    color: "var(--md-champagne)",
                    lineHeight: 1,
                  }}
                  aria-hidden="true"
                >
                  {pillar.icon}
                </div>
                <h3
                  style={{
                    margin: 0,
                    fontFamily: "var(--md-font-display)",
                    fontSize: "var(--md-t-subtitle)",
                    fontWeight: 400,
                    lineHeight: 1.25,
                    color: "var(--md-fg-inverse)",
                  }}
                >
                  {pillar.title}
                </h3>
                <p
                  style={{
                    margin: 0,
                    fontSize: "var(--md-t-body)",
                    lineHeight: 1.8,
                    color: "var(--md-fg-inverse-muted)",
                  }}
                >
                  {pillar.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* JAIPUR TO THE WORLD */}
      <section
        data-surface="ivory"
        style={{
          paddingInline: "var(--md-gutter)",
          paddingBlock: "var(--md-space-10)",
        }}
      >
        <div
          style={{
            maxWidth: "var(--md-container)",
            marginInline: "auto",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            gap: "var(--md-space-9)",
            alignItems: "center",
          }}
        >
          <div>
            <p
              style={{
                margin: "0 0 var(--md-space-3)",
                fontSize: "var(--md-t-label)",
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: "var(--md-gold-antique)",
                fontWeight: 600,
              }}
            >
              Our Mission
            </p>
            <h2
              style={{
                margin: "0 0 var(--md-space-5)",
                fontFamily: "var(--md-font-display)",
                fontSize: "var(--md-t-display)",
                fontWeight: 400,
                lineHeight: 1.1,
                letterSpacing: "-0.01em",
                color: "var(--md-fg)",
              }}
            >
              Jaipur to
              <br />
              the World
            </h2>
            <p
              style={{
                margin: "0 0 var(--md-space-6)",
                fontSize: "var(--md-t-body-lg)",
                lineHeight: 1.8,
                color: "var(--md-fg-secondary)",
                maxWidth: "480px",
              }}
            >
              Our mission is to bring the finest jewellery of Jaipur to as many
              buyers as possible &mdash; in India and across the globe. From the
              boutiques of New York to the markets of Moscow, our pieces carry
              the spirit of Rajasthan.
            </p>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "var(--md-space-2)",
              }}
            >
              {[
                "🇺🇸 USA",
                "🇷🇺 Russia",
                "🇦🇺 Australia",
                "🇬🇧 UK",
                "🇩🇪 Germany",
                "🇨🇦 Canada",
                "🇮🇹 Italy",
                "🇺🇦 Ukraine",
                "🇮🇳 India",
              ].map((country) => (
                <span
                  key={country}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "5px 14px",
                    borderRadius: "var(--md-radius-sm)",
                    border: "1px solid var(--md-rule)",
                    fontSize: "var(--md-t-small)",
                    color: "var(--md-fg-secondary)",
                    background: "var(--md-ivory-soft)",
                    fontWeight: 500,
                    letterSpacing: "0.04em",
                  }}
                >
                  {country}
                </span>
              ))}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--md-space-4)",
            }}
          >
            {[
              {
                label: "Primary Market",
                value: "United States & major cities",
                icon: "◎",
              },
              {
                label: "Target Customer",
                value: "Jewellery lovers, 30 years and above",
                icon: "◈",
              },
              {
                label: "Brand Positioning",
                value: "Affordable luxury — premium without pretension",
                icon: "◇",
              },
              {
                label: "Handcrafted",
                value: "Every piece made in our Jaipur factory",
                icon: "✦",
              },
            ].map((item) => (
              <div
                key={item.label}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "var(--md-space-4)",
                  padding: "var(--md-space-5)",
                  background: "var(--md-ivory-soft)",
                  borderRadius: "var(--md-radius-sm)",
                  border: "1px solid var(--md-rule)",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--md-font-display)",
                    fontSize: "1.25rem",
                    color: "var(--md-gold-antique)",
                    flexShrink: 0,
                    marginTop: "2px",
                  }}
                  aria-hidden="true"
                >
                  {item.icon}
                </span>
                <div>
                  <p
                    style={{
                      margin: "0 0 4px",
                      fontSize: "var(--md-t-label)",
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      color: "var(--md-gold-antique)",
                      fontWeight: 600,
                    }}
                  >
                    {item.label}
                  </p>
                  <p
                    style={{
                      margin: 0,
                      fontSize: "var(--md-t-body-lg)",
                      color: "var(--md-fg)",
                      fontWeight: 400,
                      lineHeight: 1.5,
                    }}
                  >
                    {item.value}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* BRAND VALUES */}
      <section
        data-surface="green-dark"
        style={{
          paddingInline: "var(--md-gutter)",
          paddingBlock: "var(--md-space-10)",
        }}
      >
        <div
          style={{
            maxWidth: "var(--md-container)",
            marginInline: "auto",
            textAlign: "center",
          }}
        >
          <p
            style={{
              margin: "0 0 var(--md-space-3)",
              fontSize: "var(--md-t-label)",
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "var(--md-champagne)",
              fontWeight: 600,
            }}
          >
            Brand Values
          </p>
          <h2
            style={{
              margin: "0 0 var(--md-space-9)",
              fontFamily: "var(--md-font-display)",
              fontSize: "var(--md-t-display)",
              fontWeight: 400,
              lineHeight: 1.1,
              letterSpacing: "-0.01em",
              color: "var(--md-fg-inverse)",
            }}
          >
            The Principles We Never Compromise
          </h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "1px",
              background:
                "color-mix(in srgb, var(--md-fg-inverse) 8%, transparent)",
              border:
                "1px solid color-mix(in srgb, var(--md-fg-inverse) 8%, transparent)",
              borderRadius: "var(--md-radius-sm)",
              overflow: "hidden",
            }}
          >
            {[
              {
                value: "Purity",
                detail:
                  "925 sterling silver with anti-tarnish alloy — every time, no exceptions",
              },
              {
                value: "Integrity",
                detail:
                  "Lowest possible prices through direct, in-house manufacturing",
              },
              {
                value: "Heritage",
                detail: "Over 60 years of family-led craftsmanship from Jaipur",
              },
              {
                value: "Global Vision",
                detail: "Designed for the world, made with Indian mastery",
              },
            ].map((val) => (
              <div
                key={val.value}
                style={{
                  padding: "var(--md-space-7) var(--md-space-5)",
                  background:
                    "color-mix(in srgb, var(--md-ivory-soft) 4%, transparent)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "var(--md-space-3)",
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 1,
                    background: "var(--md-champagne)",
                    opacity: 0.6,
                  }}
                  aria-hidden="true"
                />
                <h3
                  style={{
                    margin: 0,
                    fontFamily: "var(--md-font-display)",
                    fontSize: "var(--md-t-subtitle)",
                    fontWeight: 400,
                    color: "var(--md-champagne)",
                    letterSpacing: "0.02em",
                  }}
                >
                  {val.value}
                </h3>
                <p
                  style={{
                    margin: 0,
                    fontSize: "var(--md-t-body)",
                    color: "var(--md-fg-inverse-muted)",
                    lineHeight: 1.7,
                    maxWidth: "240px",
                  }}
                >
                  {val.detail}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CRAFT PROCESS */}
      <section
        data-surface="ivory-soft"
        style={{
          paddingInline: "var(--md-gutter)",
          paddingBlock: "var(--md-space-10)",
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
            <p
              style={{
                margin: "0 0 var(--md-space-3)",
                fontSize: "var(--md-t-label)",
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: "var(--md-gold-antique)",
                fontWeight: 600,
              }}
            >
              The Process
            </p>
            <h2
              style={{
                margin: 0,
                fontFamily: "var(--md-font-display)",
                fontSize: "var(--md-t-display)",
                fontWeight: 400,
                lineHeight: 1.1,
                letterSpacing: "-0.01em",
                color: "var(--md-fg)",
              }}
            >
              From Sketch to Finished Jewel
            </h2>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "1px",
              background: "var(--md-rule)",
            }}
          >
            {[
              {
                step: "01",
                title: "Design",
                body: "Each collection begins with our design team — drawing inspiration from global trends and buyer preferences.",
              },
              {
                step: "02",
                title: "Development",
                body: "Prototypes are carved, refined and reviewed in our workshop before any production begins.",
              },
              {
                step: "03",
                title: "Manufacturing",
                body: "Skilled artisans cast, shape and set stones by hand in our in-house Jaipur facility.",
              },
              {
                step: "04",
                title: "Finishing",
                body: "Polishing, plating, and quality inspection ensure every piece meets our exacting standards.",
              },
              {
                step: "05",
                title: "Dispatch",
                body: "Carefully packed and shipped directly to buyers worldwide — no middlemen, no compromise.",
              },
            ].map((step) => (
              <div
                key={step.step}
                style={{
                  padding: "var(--md-space-6) var(--md-space-5)",
                  background: "var(--md-ivory)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "var(--md-space-3)",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--md-font-display)",
                    fontSize: "3rem",
                    fontWeight: 400,
                    color:
                      "color-mix(in srgb, var(--md-champagne) 35%, transparent)",
                    lineHeight: 1,
                    userSelect: "none",
                  }}
                  aria-hidden="true"
                >
                  {step.step}
                </span>
                <h3
                  style={{
                    margin: 0,
                    fontFamily: "var(--md-font-display)",
                    fontSize: "var(--md-t-subtitle)",
                    fontWeight: 400,
                    color: "var(--md-fg)",
                    lineHeight: 1.2,
                  }}
                >
                  {step.title}
                </h3>
                <p
                  style={{
                    margin: 0,
                    fontSize: "var(--md-t-body)",
                    lineHeight: 1.75,
                    color: "var(--md-fg-secondary)",
                  }}
                >
                  {step.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section
        data-surface="stone"
        style={{
          paddingInline: "var(--md-gutter)",
          paddingBlock: "var(--md-space-9)",
        }}
      >
        <div
          style={{
            maxWidth: "var(--md-container)",
            marginInline: "auto",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "var(--md-space-6)",
          }}
        >
          <div>
            <h2
              style={{
                margin: "0 0 var(--md-space-2)",
                fontFamily: "var(--md-font-display)",
                fontSize: "var(--md-t-title)",
                fontWeight: 400,
                color: "var(--md-fg)",
                lineHeight: 1.2,
              }}
            >
              Explore the Collections
            </h2>
            <p
              style={{
                margin: 0,
                fontSize: "var(--md-t-body-lg)",
                color: "var(--md-fg-secondary)",
              }}
            >
              Rings, pendants, earrings, sets, stones, and more &mdash; all crafted in Jaipur.
            </p>
          </div>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "var(--md-space-3)",
            }}
          >
            <Link
              href={`${prefix}/rings`}
              id="our-story-shop-cta"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                height: 48,
                paddingInline: "28px",
                background: "var(--md-charcoal)",
                color: "var(--md-ivory-soft)",
                fontSize: "0.8125rem",
                fontWeight: 600,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                textDecoration: "none",
                borderRadius: "var(--md-radius-sm)",
              }}
            >
              Shop Now &rarr;
            </Link>
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              id="our-story-wholesale-cta"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                height: 48,
                paddingInline: "26px",
                border: "1px solid var(--md-rule-strong)",
                background: "transparent",
                color: "var(--md-fg)",
                fontSize: "0.8125rem",
                fontWeight: 500,
                letterSpacing: "0.08em",
                textDecoration: "none",
                borderRadius: "var(--md-radius-sm)",
              }}
            >
              Wholesale Enquiry
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
