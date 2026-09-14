import type { JSX } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { resolveMarket } from "@/lib/market";
import {
  getStorefrontCollection,
  listStorefrontCollectionProducts,
  listPublishedCollectionSlugs,
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

export async function generateStaticParams(): Promise<{ slug: string }[]> {
  try {
    const collections = await listPublishedCollectionSlugs();
    return collections.map((c) => ({ slug: c.slug }));
  } catch {
    return [];
  }
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ market: string; slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const { market, slug } = await params;
  const sParams = await searchParams;
  const resolvedMarket = await resolveMarket(market);

  const col = await getStorefrontCollection(slug);

  if (!col) return {};

  const hasFilters = Object.keys(sParams).some((k) => k !== "sort" && k !== "page");
  const { canonical, languages } = await buildCanonicalAndAlternates({
    pathname: `/collections/${col.slug}`,
    marketCode: resolvedMarket.code,
  });


  const override = await getSeoMetadataOverride("collection", col.id, resolvedMarket.code);

  return {
    title: override?.title ?? `${col.title} | Millennium Designs`,
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

export default async function CollectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ market: string; slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<JSX.Element> {
  const { market, slug } = await params;
  const sParams = await searchParams;
  const resolvedMarket = await resolveMarket(market);

  const col = await getStorefrontCollection(slug);

  if (!col) {
    notFound();
  }

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

  const { products, totalCount } = await listStorefrontCollectionProducts(
    col.id,
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

  let descText = "";
  if (typeof col.descriptionJson === "string") {
    descText = col.descriptionJson;
  }

  // Facet options for collection
  const filterGroups: FilterGroup[] = [];
  try {
    const { stones } = await getCategoryFilterOptions();
    if (stones.length > 0) {
      filterGroups.push({
        key: "stone",
        title: "Stone",
        options: stones.map((s) => ({ id: s.id, label: s.name, slug: s.slug })),
      });
    }
  } catch {
    // Database fallback
  }


  const hasActiveFilters = Object.keys(sParams).some((k) => k !== "sort" && k !== "page");

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
            { label: col.title },
          ]}
        />

        <header
          style={{
            paddingBlock: "var(--md-space-8) var(--md-space-6)",
            borderBottom: "1px solid var(--md-rule)",
          }}
        >
          <h1
            style={{
              margin: 0,
              fontSize: "var(--md-t-display, 2rem)",
              fontWeight: 400,
              letterSpacing: "-0.01em",
            }}
          >
            {col.title}
          </h1>

          {descText && (
            <p
              style={{
                margin: "var(--md-space-3) 0 0 0",
                fontSize: "1.125rem",
                color: "var(--md-fg-muted)",
                maxWidth: "60ch",
                lineHeight: 1.5,
              }}
            >
              {descText}
            </p>
          )}

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginTop: "var(--md-space-6)",
              flexWrap: "wrap",
              gap: "var(--md-space-4)",
            }}
          >
            <div className="md-mobile-only" style={{ display: filterGroups.length > 0 ? "block" : "none" }}>
              <FilterDrawer groups={filterGroups} />
            </div>

            <div style={{ marginLeft: "auto" }}>
              <SortSelect currentSort={sort} />
            </div>
          </div>
        </header>

        <div
          style={{
            display: "flex",
            gap: "var(--md-space-8)",
            paddingTop: "var(--md-space-8)",
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
                />
                <Pagination
                  currentPage={page}
                  totalPages={totalPages}
                  basePath={`${prefix}/collections/${col.slug}`}
                  searchParams={sParams}
                />
              </>
            ) : (
              <EmptyState
                headline={hasActiveFilters ? "Nothing matched these filters." : "Nothing found"}
                actionLabel={hasActiveFilters ? "CLEAR FILTERS" : "EXPLORE THE COLLECTION"}
                actionHref={`${prefix}/collections/${col.slug}`}
              />
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
