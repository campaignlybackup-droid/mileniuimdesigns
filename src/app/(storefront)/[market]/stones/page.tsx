import type { JSX } from "react";
import type { Metadata } from "next";
import { resolveMarket, marketParams } from "@/lib/market";
import { getStorefrontStones } from "@/lib/stones";
import { buildCanonicalAndAlternates, getSeoMetadataOverride } from "@/lib/seo";
import { Breadcrumbs } from "@/components/storefront/Breadcrumbs";
import { StoneCard } from "@/components/storefront/StoneCard";
import { EmptyState } from "@/components/storefront/EmptyState";

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
  const resolvedMarket = await resolveMarket(market);

  const { canonical, languages } = await buildCanonicalAndAlternates({
    pathname: "/stones",
    marketCode: resolvedMarket.code,
  });


  const override = await getSeoMetadataOverride("stone", null, resolvedMarket.code);

  return {
    title: override?.title ?? "Stones | Millennium Designs",
    description: override?.description ?? "Discover our gemstones and minerals.",
    robots: {
      index: !override?.robotsNoindex,
      follow: !override?.robotsNofollow,
    },
    alternates: {
      canonical: override?.canonicalPath ?? canonical,
      languages,
    },
  };
}

export default async function StonesIndexPage({
  params,
}: {
  params: Promise<{ market: string }>;
}): Promise<JSX.Element> {
  const { market } = await params;
  const resolvedMarket = await resolveMarket(market);
  const stones = await getStorefrontStones();

  const prefix = resolvedMarket.code.toLowerCase() === "us" ? "" : `/${resolvedMarket.code.toLowerCase()}`;

  return (
    <main
      id="main"
      style={{
        width: "100%",
        maxWidth: "100%",
        paddingInline: "var(--md-gutter)",
        paddingBottom: "var(--md-space-16, 64px)",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          maxWidth: "var(--md-container)",
          marginInline: "auto",
          width: "100%",
        }}
      >
        <Breadcrumbs
          items={[
            { label: "Home", href: prefix === "" ? "/" : prefix },
            { label: "Stones" },
          ]}
        />

        <header
          style={{
            paddingBlock: "clamp(24px, 4vw, 48px) clamp(16px, 3vw, 32px)",
            borderBottom: "1px solid var(--md-rule)",
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
              fontFamily: "var(--md-font-crest), Georgia, serif",
              marginBottom: "8px",
            }}
          >
            NATURAL GEMMOLOGY &amp; ARCHIVAL MINERALS · JAIPUR, EST. 1961
          </span>
          <h1
            style={{
              margin: "0 0 12px 0",
              fontFamily: "var(--md-font-display)",
              fontSize: "clamp(2rem, 4vw, 3.5rem)",
              fontWeight: 400,
              letterSpacing: "-0.015em",
              lineHeight: 1.1,
              color: "var(--md-fg)",
            }}
          >
            Untreated Natural Gemstones
          </h1>
          <p
            style={{
              margin: 0,
              fontSize: "clamp(0.9375rem, 1.4vw, 1.0625rem)",
              lineHeight: 1.7,
              color: "var(--md-fg-secondary)",
              maxWidth: "680px",
            }}
          >
            Sourced directly from historic veins in Colombia, Zambia, Sri Lanka, and Rajasthan &mdash; cut and faceted in our Jaipur lapidary for chromatic fire and authentic optical character.
          </p>
        </header>

        <div style={{ paddingTop: "var(--md-space-8)" }}>
          {stones.length > 0 ? (
            <div className="md-stones-mosaic">
              {stones.map((stone, idx) => {
                const rem = idx % 7;
                const variant =
                  rem === 0 ? "featured" : rem === 1 || rem === 5 || rem === 6 ? "wide" : "standard";
                return (
                  <StoneCard
                    key={stone.id}
                    stone={stone}
                    variant={variant}
                    marketSegment={resolvedMarket.code.toLowerCase() === "us" ? "" : resolvedMarket.code.toLowerCase()}
                  />
                );
              })}
            </div>
          ) : (
            <EmptyState
              headline="Nothing found"
              actionLabel="EXPLORE THE COLLECTION"
              actionHref={prefix === "" ? "/" : prefix}
            />
          )}
        </div>
      </div>
    </main>
  );
}
