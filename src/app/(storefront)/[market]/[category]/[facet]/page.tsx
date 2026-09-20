import type { JSX } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { resolveMarket } from "@/lib/market";
import { getStorefrontCuratedFacet, listStorefrontCategoryProducts } from "@/lib/catalog";
import { buildCanonicalAndAlternates, getSeoMetadataOverride } from "@/lib/seo";
import { Breadcrumbs } from "@/components/storefront/Breadcrumbs";
import { ProductGrid } from "@/components/storefront/ProductGrid";
import { Pagination } from "@/components/storefront/Pagination";
import { SortSelect } from "@/components/storefront/SortSelect";
import type { CatalogFilters } from "@/lib/catalog/filters";

export const revalidate = 900;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ market: string; category: string; facet: string }>;
}): Promise<Metadata> {
  const { market, category, facet } = await params;
  const resolvedMarket = await resolveMarket(market);
  const curated = await getStorefrontCuratedFacet(category, facet, resolvedMarket.code);

  if (!curated) return {};

  const { canonical, languages } = await buildCanonicalAndAlternates({
    pathname: `/${category}/${facet}`,
    marketCode: resolvedMarket.code,
  });


  const override = await getSeoMetadataOverride("curated_facet", curated.id, resolvedMarket.code);

  return {
    title: override?.title ?? `${curated.title} | Millennium Designs`,
    description: override?.description ?? undefined,
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

export default async function CuratedFacetPage({
  params,
  searchParams,
}: {
  params: Promise<{ market: string; category: string; facet: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<JSX.Element> {
  const { market, category, facet } = await params;
  const sParams = await searchParams;
  const resolvedMarket = await resolveMarket(market);

  const curated = await getStorefrontCuratedFacet(category, facet, resolvedMarket.code);
  if (!curated) {
    notFound();
  }

  // Construct target filter
  const filters: CatalogFilters = {
    stoneIds: curated.stoneId ? [curated.stoneId] : [],
    materialIds: curated.materialId ? [curated.materialId] : [],
    attributes: curated.attributeOptionId
      ? [{ attributeId: "", key: "", optionIds: [curated.attributeOptionId] }]
      : [],
  };

  const sort = typeof sParams["sort"] === "string" ? sParams["sort"] : undefined;
  const page = typeof sParams["page"] === "string" ? Math.max(1, parseInt(sParams["page"], 10) || 1) : 1;
  const pageSize = 24;
  const offset = (page - 1) * pageSize;

  const { products, totalCount } = await listStorefrontCategoryProducts(
    curated.categoryId,
    resolvedMarket.code,
    {
      filters,
      sort,
      limit: pageSize,
      offset,
    },
  );

  // 04 §6.2: A facet page whose product set is empty in a market returns notFound()
  // rather than an empty indexable page to prevent thin-content penalties
  if (totalCount === 0) {
    notFound();
  }

  const totalPages = Math.ceil(totalCount / pageSize);
  const prefix = resolvedMarket.code.toLowerCase() === "us" ? "" : `/${resolvedMarket.code.toLowerCase()}`;

  let introText = "";
  if (typeof curated.introJson === "string") {
    introText = curated.introJson;
  } else if (
    curated.introJson &&
    typeof curated.introJson === "object" &&
    "text" in (curated.introJson as Record<string, unknown>)
  ) {
    introText = String((curated.introJson as Record<string, unknown>).text);
  }

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
            { label: curated.categoryName, href: `${prefix}/${curated.categorySlug}` },
            { label: curated.title },
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
              fontFamily: "var(--md-font-display)",
              fontSize: "var(--md-t-display, 2rem)",
              fontWeight: 400,
              letterSpacing: "-0.01em",
            }}
          >
            {curated.title}
          </h1>

          {introText && (
            <p
              style={{
                margin: "var(--md-space-3) 0 0 0",
                fontSize: "1.125rem",
                color: "var(--md-fg-secondary)",
                maxWidth: "60ch",
                lineHeight: 1.5,
              }}
            >
              {introText}
            </p>
          )}

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              marginTop: "var(--md-space-6)",
            }}
          >
            <SortSelect currentSort={sort} />
          </div>
        </header>

        <div style={{ paddingTop: "var(--md-space-8)" }}>
          <ProductGrid
            products={products}
            marketSegment={resolvedMarket.code.toLowerCase() === "us" ? "" : resolvedMarket.code.toLowerCase()}
            locale={resolvedMarket.locale}
          />
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            basePath={`${prefix}/${curated.categorySlug}/${curated.slug}`}
            searchParams={sParams}
          />
        </div>
      </div>
    </main>
  );
}
