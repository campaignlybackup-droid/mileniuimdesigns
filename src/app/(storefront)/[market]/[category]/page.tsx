import type { JSX } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { resolveMarket } from "@/lib/market";
import {
  getStorefrontCategory,
  listStorefrontCategoryProducts,
  listPublishedCategories,
  getCategoryFilterOptions,
} from "@/lib/catalog";
import { parseCatalogFilters } from "@/lib/catalog/filters";
import { buildCanonicalAndAlternates, getSeoMetadataOverride } from "@/lib/seo";
import { Breadcrumbs } from "@/components/storefront/Breadcrumbs";
import { ProductGrid } from "@/components/storefront/ProductGrid";
import { EmptyState } from "@/components/storefront/EmptyState";
import { SortSelect } from "@/components/storefront/SortSelect";
import { Pagination } from "@/components/storefront/Pagination";
import { FilterSidebar, type FilterGroup } from "@/components/storefront/FilterSidebar";
import { FilterDrawer } from "@/components/storefront/FilterDrawer";

export const revalidate = 900;

export async function generateStaticParams(): Promise<{ category: string }[]> {
  try {
    const categories = await listPublishedCategories();
    return categories.map((c) => ({ category: c.slug }));
  } catch {
    return [];
  }
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ market: string; category: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const { market, category } = await params;
  const sParams = await searchParams;
  const resolvedMarket = await resolveMarket(market);
  const cat = await getStorefrontCategory(category);

  if (!cat) return {};

  const hasFilters = Object.keys(sParams).some((k) => k !== "sort" && k !== "page");
  const { canonical, languages } = await buildCanonicalAndAlternates({
    pathname: `/${cat.slug}`,
    marketCode: resolvedMarket.code,
  });


  const override = await getSeoMetadataOverride("category", cat.id, resolvedMarket.code);

  return {
    title: override?.title ?? `${cat.name} | Millennium Designs`,
    description: override?.description ?? undefined,
    robots: hasFilters
      ? { index: false, follow: true }
      : { index: !override?.robotsNoindex, follow: !override?.robotsNofollow },
    alternates: {
      canonical: override?.canonicalPath ?? canonical,
      languages,
    },
  };
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ market: string; category: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<JSX.Element> {
  const { market, category } = await params;
  const sParams = await searchParams;
  const resolvedMarket = await resolveMarket(market);

  const cat = await getStorefrontCategory(category);
  if (!cat) {
    notFound();
  }

  // Parse filters from search params
  const urlParams = new URLSearchParams();
  for (const [k, v] of Object.entries(sParams)) {
    if (Array.isArray(v)) {
      for (const item of v) urlParams.append(k, item);
    } else if (typeof v === "string") {
      urlParams.set(k, v);
    }
  }
  const parsed = await parseCatalogFilters(urlParams);
  const sort = typeof sParams["sort"] === "string" ? sParams["sort"] : undefined;
  const page = typeof sParams["page"] === "string" ? Math.max(1, parseInt(sParams["page"], 10) || 1) : 1;
  const pageSize = 24;
  const offset = (page - 1) * pageSize;

  const { products, totalCount } = await listStorefrontCategoryProducts(
    cat.id,
    resolvedMarket.code,
    {
      filters: parsed.filters,
      sort,
      limit: pageSize,
      offset,
    },
  );

  const totalPages = Math.ceil(totalCount / pageSize);
  const prefix = resolvedMarket.code.toLowerCase() === "us" ? "" : `/${resolvedMarket.code.toLowerCase()}`;
  const isOneOfAKind = cat.slug === "one-of-a-kind";

  // Build facet options for sidebar
  const filterGroups: FilterGroup[] = [];
  try {
    const { stones, materials } = await getCategoryFilterOptions();
    if (stones.length > 0) {
      filterGroups.push({
        key: "stone",
        title: "Stone",
        options: stones.map((s) => ({ id: s.id, label: s.name, slug: s.slug })),
      });
    }

    if (materials.length > 0) {
      filterGroups.push({
        key: "material",
        title: "Material",
        options: materials.map((m) => ({ id: m.id, label: m.name, slug: m.slug })),
      });
    }
  } catch {
    // Database tables might not be seeded in early stages
  }


  const hasActiveFilters = Object.keys(sParams).some((k) => k !== "sort" && k !== "page");

  const activeStoneSlug = typeof sParams["stone"] === "string" ? sParams["stone"] : undefined;

  // Curated quick-filter stones for One of a Kind pieces
  const ONE_OF_A_KIND_STONES = [
    { slug: "amber", name: "Amber" },
    { slug: "larimar", name: "Larimar" },
    { slug: "labradorite", name: "Labradorite" },
    { slug: "turquoise", name: "Turquoise" },
    { slug: "malachite", name: "Malachite" },
    { slug: "rutilated-quartz", name: "Rutilated Quartz" },
    { slug: "coral", name: "Coral" },
    { slug: "moonstone", name: "Moonstone" },
  ];

  return (
    <main
      id="main"
      style={{
        width: "100%",
        maxWidth: "100%",
        paddingInline: "var(--md-gutter)",
        paddingBottom: "var(--md-space-16, 64px)",
        boxSizing: "border-box",
        background: "var(--md-bg, #ffffff)",
        color: "var(--md-fg, #182c23)",
        minHeight: "80vh",
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
            { label: cat.name },
          ]}
        />

        {/* Bespoke Header for One of a Kind vs Standard Categories */}
        {isOneOfAKind ? (
          <header
            style={{
              padding: "clamp(24px, 3.5vw, 44px) clamp(20px, 3vw, 36px)",
              background: "linear-gradient(180deg, #faf7f2 0%, #f4eee3 100%)",
              border: "1px solid var(--md-rule, #e7e2d7)",
              borderRadius: 8,
              marginTop: "var(--md-space-4, 16px)",
              marginBottom: "var(--md-space-8, 32px)",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div style={{ maxWidth: 840 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <span
                  style={{
                    fontSize: "0.6875rem",
                    letterSpacing: "0.22em",
                    textTransform: "uppercase",
                    color: "var(--md-gold-antique, #a88448)",
                    fontWeight: 700,
                    fontFamily: "var(--md-font-crest), Georgia, serif",
                  }}
                >
                  THE SOVEREIGN ARCHIVE · JAIPUR ATELIER
                </span>
                <span
                  style={{
                    padding: "2px 8px",
                    borderRadius: 3,
                    background: "#182c23",
                    color: "#fcfaf5",
                    fontSize: "0.65rem",
                    letterSpacing: "0.1em",
                    fontWeight: 600,
                    textTransform: "uppercase",
                  }}
                >
                  1 of 1 Edition
                </span>
              </div>

              <h1
                style={{
                  margin: "0 0 12px 0",
                  fontSize: "clamp(2.25rem, 4.5vw, 3.5rem)",
                  fontFamily: "var(--md-font-display)",
                  fontWeight: 400,
                  letterSpacing: "-0.02em",
                  lineHeight: 1.1,
                  color: "#182c23",
                }}
              >
                One of a Kind
              </h1>

              <p
                style={{
                  margin: "0 0 20px 0",
                  fontSize: "clamp(0.95rem, 1.2vw, 1.05rem)",
                  lineHeight: 1.6,
                  color: "#4a463d",
                  maxWidth: 680,
                }}
              >
                Singular, unrepeatable natural gemstone formations individually bezel-set in solid 925 sterling silver. Every matrix, inclusion, and crystalline depth is entirely unique — once claimed, each masterwork can never be recreated.
              </p>

              {/* Authenticity Pillars */}
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "clamp(12px, 2vw, 24px)",
                  paddingTop: 14,
                  borderTop: "1px solid rgba(168, 132, 72, 0.25)",
                  fontSize: "0.8rem",
                  color: "#6e675b",
                  fontWeight: 500,
                  letterSpacing: "0.03em",
                }}
              >
                <span>✦ Individually Photographed Pieces</span>
                <span>✦ Authentic Natural Minerals</span>
                <span>✦ Solid 925 Hallmarked Silver</span>
                <span>✦ Direct Atelier Provenance</span>
              </div>
            </div>

            {/* Quick Gemstone Pills Bar */}
            <div
              style={{
                marginTop: 24,
                paddingTop: 18,
                borderTop: "1px solid var(--md-rule, #e7e2d7)",
                display: "flex",
                alignItems: "center",
                gap: 8,
                overflowX: "auto",
                scrollbarWidth: "none",
                WebkitOverflowScrolling: "touch",
              }}
            >
              <span
                style={{
                  fontSize: "0.7rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  color: "#8a8375",
                  fontWeight: 600,
                  flexShrink: 0,
                  marginRight: 4,
                }}
              >
                Filter by Mineral:
              </span>

              <Link
                href={`${prefix}/one-of-a-kind`}
                style={{
                  padding: "6px 14px",
                  borderRadius: 20,
                  fontSize: "0.8rem",
                  fontWeight: !activeStoneSlug ? 600 : 400,
                  textDecoration: "none",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                  background: !activeStoneSlug ? "#182c23" : "#ffffff",
                  color: !activeStoneSlug ? "#ffffff" : "#4a463d",
                  border: !activeStoneSlug ? "1px solid #182c23" : "1px solid #dcd5c7",
                  transition: "all 0.15s ease",
                }}
              >
                All Pieces ({totalCount})
              </Link>

              {ONE_OF_A_KIND_STONES.map((stone) => {
                const isActive = activeStoneSlug === stone.slug;
                return (
                  <Link
                    key={stone.slug}
                    href={isActive ? `${prefix}/one-of-a-kind` : `${prefix}/one-of-a-kind?stone=${stone.slug}`}
                    style={{
                      padding: "6px 14px",
                      borderRadius: 20,
                      fontSize: "0.8rem",
                      fontWeight: isActive ? 600 : 400,
                      textDecoration: "none",
                      whiteSpace: "nowrap",
                      flexShrink: 0,
                      background: isActive ? "#182c23" : "#ffffff",
                      color: isActive ? "#ffffff" : "#4a463d",
                      border: isActive ? "1px solid #182c23" : "1px solid #dcd5c7",
                      transition: "all 0.15s ease",
                    }}
                  >
                    {stone.name}
                  </Link>
                );
              })}
            </div>
          </header>
        ) : (
          <header
            style={{
              paddingBlock: "clamp(20px, 3.5vw, 40px) clamp(14px, 2.5vw, 24px)",
              borderBottom: "1px solid var(--md-rule, #e7e2d7)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: "8px", marginBottom: "6px" }}>
              <span
                style={{
                  fontSize: "0.6875rem",
                  letterSpacing: "0.2em",
                  textTransform: "uppercase",
                  color: "var(--md-gold-antique, #a88448)",
                  fontWeight: 600,
                  fontFamily: "var(--md-font-crest), Georgia, serif",
                }}
              >
                JAIPUR · PURE 925 STERLING SILVER
              </span>
              <span
                style={{
                  fontSize: "0.75rem",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "var(--md-fg-muted, #6e675b)",
                }}
              >
                {totalCount} {totalCount === 1 ? "Creation" : "Creations"}
              </span>
            </div>

            <h1
              style={{
                margin: 0,
                fontSize: "clamp(2rem, 4vw, 3.25rem)",
                fontFamily: "var(--md-font-display)",
                fontWeight: 400,
                letterSpacing: "-0.015em",
                lineHeight: 1.1,
              }}
            >
              {cat.name}
            </h1>
          </header>
        )}

        {/* Controls bar: mobile filter toggle + sort */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: "clamp(12px, 2vw, 20px)",
            flexWrap: "wrap",
            gap: "var(--md-space-3)",
          }}
        >
          <div className="md-mobile-only" style={{ display: filterGroups.length > 0 ? "block" : "none" }}>
            <FilterDrawer groups={filterGroups} />
          </div>

          <div style={{ marginLeft: "auto" }}>
            <SortSelect currentSort={sort} />
          </div>
        </div>

        {/* Body section: sidebar + products grid */}
        <div
          style={{
            display: "flex",
            gap: "var(--md-space-8)",
            paddingTop: "clamp(16px, 2.5vw, 32px)",
            alignItems: "flex-start",
          }}
        >
          {filterGroups.length > 0 && (
            <div className="md-desktop-only">
              <FilterSidebar groups={filterGroups} />
            </div>
          )}

          <div style={{ flex: 1, minWidth: 0, width: "100%" }}>
            {products.length > 0 ? (
              <>
                <ProductGrid
                  products={products}
                  marketSegment={resolvedMarket.code.toLowerCase() === "us" ? "" : resolvedMarket.code.toLowerCase()}
                  locale={resolvedMarket.locale}
                  columns={3}
                />
                <Pagination
                  currentPage={page}
                  totalPages={totalPages}
                  basePath={`${prefix}/${cat.slug}`}
                  searchParams={sParams}
                />
              </>
            ) : (
              <EmptyState
                headline={hasActiveFilters ? "Nothing matched these filters." : `The ${cat.name} Collection Is Coming Soon`}
                body={
                  hasActiveFilters
                    ? "Try clearing some filters or browse all creations."
                    : `Our master silversmiths are currently handcrafting new pieces in our Jaipur atelier. In the meantime, discover our exclusive One-of-a-Kind creations and handcrafted Sterling Silver Bracelets.`
                }
                actionLabel={hasActiveFilters ? "CLEAR FILTERS" : "EXPLORE ONE OF A KIND"}
                actionHref={hasActiveFilters ? `${prefix}/${cat.slug}` : `${prefix}/one-of-a-kind`}
              />
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
