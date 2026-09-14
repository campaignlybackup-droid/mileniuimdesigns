import type { JSX } from "react";
import type { Metadata } from "next";
import { resolveMarket } from "@/lib/market";
import { getStorefrontStones } from "@/lib/stones";
import { buildCanonicalAndAlternates, getSeoMetadataOverride } from "@/lib/seo";
import { Breadcrumbs } from "@/components/storefront/Breadcrumbs";
import { StoneCard } from "@/components/storefront/StoneCard";
import { EmptyState } from "@/components/storefront/EmptyState";

export const revalidate = 1800;

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
            paddingBlock: "var(--md-space-8) var(--md-space-6)",
            borderBottom: "1px solid var(--md-rule)",
          }}
        >
          <span
            style={{
              fontSize: "var(--md-t-label, 0.75rem)",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--md-fg-muted)",
            }}
          >
            Gemmology & Craft
          </span>
          <h1
            style={{
              margin: "var(--md-space-2) 0 0 0",
              fontSize: "var(--md-t-display, 2rem)",
              fontWeight: 400,
              letterSpacing: "-0.01em",
            }}
          >
            Stones
          </h1>
        </header>

        <div style={{ paddingTop: "var(--md-space-8)" }}>
          {stones.length > 0 ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 280px), 1fr))",
                gap: "var(--md-space-8) var(--md-space-6)",
              }}
            >
              {stones.map((stone) => (
                <StoneCard
                  key={stone.id}
                  stone={stone}
                  marketSegment={resolvedMarket.code.toLowerCase() === "us" ? "" : resolvedMarket.code.toLowerCase()}
                />
              ))}
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
