import type { JSX } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { resolveMarket } from "@/lib/market";
import { searchStorefrontProducts } from "@/lib/catalog/products";
import { ProductCard } from "@/components/storefront/ProductCard";

export const revalidate = 60;

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ market: string }>;
  searchParams: Promise<{ q?: string }>;
}): Promise<Metadata> {
  const { q } = await searchParams;
  const title = q ? `Search: "${q}" · Millennium Designs` : "Search Creations · Millennium Designs";
  return {
    title,
    description: "Search handcrafted 925 sterling silver and natural gemstone fine jewellery from Jaipur.",
  };
}

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ market: string }>;
  searchParams: Promise<{ q?: string }>;
}): Promise<JSX.Element> {
  const { market } = await params;
  const { q = "" } = await searchParams;
  const resolvedMarket = await resolveMarket(market);
  const prefix = resolvedMarket.code.toLowerCase() === "us" ? "" : `/${resolvedMarket.code.toLowerCase()}`;

  const query = q.trim();
  const { products, totalCount } = await searchStorefrontProducts(query, resolvedMarket.code, 32);

  const curatedTerms = [
    { label: "Emerald", query: "emerald" },
    { label: "Rainbow Moonstone", query: "moonstone" },
    { label: "Royal Amethyst", query: "amethyst" },
    { label: "925 Silver Rings", query: "ring" },
    { label: "Handmade Pendants", query: "pendant" },
    { label: "Drop Earrings", query: "earring" },
    { label: "Tennis Bracelets", query: "bracelet" },
  ];

  return (
    <main
      id="main"
      style={{
        width: "100%",
        minHeight: "75vh",
        paddingInline: "var(--md-gutter)",
        paddingBlock: "clamp(36px, 5vw, 64px)",
        background: "var(--md-bg)",
        color: "var(--md-fg)",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          maxWidth: "var(--md-container)",
          marginInline: "auto",
        }}
      >
        {/* Search Header Banner */}
        <div
          style={{
            maxWidth: "760px",
            marginInline: "auto",
            textAlign: "center",
            marginBottom: "clamp(32px, 4.5vw, 48px)",
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
            ✦ DISCOVER THE ARCHIVES ✦
          </span>
          <h1
            style={{
              margin: "0 0 16px",
              fontFamily: "var(--md-font-display)",
              fontSize: "clamp(2rem, 3.8vw, 3rem)",
              lineHeight: 1.15,
              fontWeight: 400,
            }}
          >
            Search Creations
          </h1>

          {/* Form input */}
          <form
            action={`${prefix}/search`}
            method="GET"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              position: "relative",
              marginInline: "auto",
            }}
          >
            <div
              style={{
                position: "relative",
                width: "100%",
                display: "flex",
                alignItems: "center",
              }}
            >
              <input
                type="search"
                name="q"
                defaultValue={query}
                placeholder="Search gemstones, rings, silver pendants…"
                aria-label="Search gemstones and jewellery"
                style={{
                  width: "100%",
                  height: "52px",
                  paddingInline: "48px 20px",
                  background: "var(--md-ivory)",
                  border: "1px solid var(--md-rule-strong)",
                  borderRadius: "var(--md-radius-sm)",
                  color: "var(--md-fg)",
                  fontSize: "1rem",
                  fontFamily: "var(--md-font-sans)",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                  position: "absolute",
                  left: "18px",
                  color: "var(--md-gold-antique)",
                  pointerEvents: "none",
                }}
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </div>
            <button
              type="submit"
              className="md-btn-luxury"
              style={{
                height: "52px",
                paddingInline: "28px",
                background: "var(--md-forest)",
                color: "var(--md-champagne)",
                border: "none",
                borderRadius: "var(--md-radius-sm)",
                fontSize: "0.75rem",
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                fontWeight: 600,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              Search
            </button>
          </form>

          {/* Quick Filter Shortcuts */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "8px",
              justifyContent: "center",
              marginTop: "16px",
            }}
          >
            {curatedTerms.map((item) => (
              <Link
                key={item.label}
                href={`${prefix}/search?q=${encodeURIComponent(item.query)}`}
                style={{
                  padding: "5px 12px",
                  borderRadius: "var(--md-radius-sm)",
                  background: query.toLowerCase() === item.query.toLowerCase()
                    ? "var(--md-forest)"
                    : "var(--md-ivory)",
                  color: query.toLowerCase() === item.query.toLowerCase()
                    ? "var(--md-champagne)"
                    : "var(--md-fg)",
                  border: "1px solid var(--md-rule)",
                  fontSize: "0.75rem",
                  textDecoration: "none",
                  transition: "all 160ms ease",
                }}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>

        {/* Results Header Status */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            paddingBottom: "16px",
            marginBottom: "24px",
            borderBottom: "1px solid var(--md-rule)",
          }}
        >
          <span style={{ fontSize: "0.875rem", color: "var(--md-fg-secondary)" }}>
            {query ? (
              <>
                Showing <strong>{totalCount}</strong> {totalCount === 1 ? "creation" : "creations"} for &ldquo;{query}&rdquo;
              </>
            ) : (
              <>Curated Haute Joaillerie Highlights ({totalCount} pieces)</>
            )}
          </span>

          {query && (
            <Link
              href={`${prefix}/search`}
              style={{
                fontSize: "0.75rem",
                color: "var(--md-gold-antique)",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                textDecoration: "none",
                fontWeight: 600,
              }}
            >
              Clear Search
            </Link>
          )}
        </div>

        {/* Results Grid */}
        {products.length > 0 ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 280px), 1fr))",
              gap: "clamp(20px, 3vw, 32px)",
            }}
          >
            {products.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                marketSegment={resolvedMarket.code.toLowerCase() === "us" ? "" : resolvedMarket.code.toLowerCase()}
                locale={resolvedMarket.locale}
              />
            ))}
          </div>
        ) : (
          <div
            style={{
              textAlign: "center",
              paddingBlock: "64px",
              background: "var(--md-ivory)",
              borderRadius: "var(--md-radius-sm)",
              border: "1px solid var(--md-rule)",
            }}
          >
            <h2
              style={{
                fontFamily: "var(--md-font-display)",
                fontSize: "1.75rem",
                margin: "0 0 8px",
                fontWeight: 400,
              }}
            >
              No Creations Found
            </h2>
            <p
              style={{
                margin: "0 0 24px",
                fontSize: "0.9375rem",
                color: "var(--md-fg-secondary)",
              }}
            >
              We could not find any fine jewellery matching &ldquo;{query}&rdquo;. Try browsing our natural gemstone collections.
            </p>
            <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
              <Link
                href={`${prefix}/rings`}
                className="md-btn-luxury"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  height: "44px",
                  paddingInline: "22px",
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
                Browse Rings
              </Link>
              <Link
                href={`${prefix}/stones`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  height: "44px",
                  paddingInline: "22px",
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
                Explore Natural Stones
              </Link>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
