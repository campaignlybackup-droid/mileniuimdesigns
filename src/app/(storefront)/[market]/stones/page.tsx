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
              color: "var(--md-fg-secondary)",
              fontWeight: 500,
            }}
          >
            Gemmology & Craft
          </span>
          <h1
            style={{
              margin: "var(--md-space-2) 0 0 0",
              fontFamily: "var(--md-font-display)",
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
