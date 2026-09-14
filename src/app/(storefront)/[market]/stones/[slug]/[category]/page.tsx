import type { JSX } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { resolveMarket } from "@/lib/market";
import { getStorefrontStone, getStorefrontStoneCategories } from "@/lib/stones";
import {
  getStorefrontCategory,
  getCuratedFacetForCategoryAndStone,
  listStorefrontStoneProducts,
} from "@/lib/catalog";
import { buildCanonicalAndAlternates } from "@/lib/seo";
import { Breadcrumbs } from "@/components/storefront/Breadcrumbs";
import { StoneExplorer } from "@/components/storefront/StoneExplorer";
import { ProductGrid } from "@/components/storefront/ProductGrid";
import { Pagination } from "@/components/storefront/Pagination";
import { SortSelect } from "@/components/storefront/SortSelect";
import { EmptyState } from "@/components/storefront/EmptyState";

export const revalidate = 1800;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ market: string; slug: string; category: string }>;
}): Promise<Metadata> {
  const { market, slug, category } = await params;
  const resolvedMarket = await resolveMarket(market);
  const stone = await getStorefrontStone(slug);
  const cat = await getStorefrontCategory(category);

  if (!stone || !cat) return {};

  // 08 §4.2: Check if matching curated facet exists for category + stone
  const curatedFacet = await getCuratedFacetForCategoryAndStone(cat.id, stone.id);

  if (curatedFacet) {
    // Canonical points to the curated facet URL (e.g. /rings/moonstone)
    const { canonical, languages } = await buildCanonicalAndAlternates({
      pathname: `/${cat.slug}/${curatedFacet.slug}`,
      marketCode: resolvedMarket.code,
    });
    return {
      title: `${stone.name} ${cat.name} | Millennium Designs`,
      alternates: {
        canonical,
        languages,
      },
    };
  }

  // No curated facet exists -> noindex, follow to prevent duplicate content
  const { canonical, languages } = await buildCanonicalAndAlternates({
    pathname: `/stones/${stone.slug}/${cat.slug}`,
    marketCode: resolvedMarket.code,
  });


  return {
    title: `${stone.name} ${cat.name} | Millennium Designs`,
    robots: { index: false, follow: true },
    alternates: {
      canonical,
      languages,
    },
  };
}

export default async function StoneCategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ market: string; slug: string; category: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<JSX.Element> {
  const { market, slug, category } = await params;
  const sParams = await searchParams;
  const resolvedMarket = await resolveMarket(market);

  const stone = await getStorefrontStone(slug);
  const cat = await getStorefrontCategory(category);

  if (!stone || !cat) {
    notFound();
  }

  const categories = await getStorefrontStoneCategories(stone.id, resolvedMarket.code);

  const sort = typeof sParams["sort"] === "string" ? sParams["sort"] : undefined;
  const page = typeof sParams["page"] === "string" ? Math.max(1, parseInt(sParams["page"], 10) || 1) : 1;
  const pageSize = 24;
  const offset = (page - 1) * pageSize;

  const { products, totalCount } = await listStorefrontStoneProducts(
    stone.id,
    resolvedMarket.code,
    {
      categoryId: cat.id,
      sort,
      limit: pageSize,
      offset,
    },
  );

  const totalPages = Math.ceil(totalCount / pageSize);
  const prefix = resolvedMarket.code.toLowerCase() === "us" ? "" : `/${resolvedMarket.code.toLowerCase()}`;
  const marketSegment = resolvedMarket.code.toLowerCase() === "us" ? "" : resolvedMarket.code.toLowerCase();

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
            { label: "Stones", href: `${prefix}/stones` },
            { label: stone.name, href: `${prefix}/stones/${stone.slug}` },
            { label: cat.name },
          ]}
        />

        <div style={{ paddingTop: "var(--md-space-6)" }}>
          <StoneExplorer
            stone={stone}
            categories={categories}
            activeCategorySlug={cat.slug}
            marketSegment={marketSegment}
          />
        </div>

        <div style={{ paddingTop: "var(--md-space-10, 40px)" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              marginBottom: "var(--md-space-4)",
            }}
          >
            <SortSelect currentSort={sort} />
          </div>

          {products.length > 0 ? (
            <>
              <ProductGrid
                products={products}
                marketSegment={marketSegment}
                locale={resolvedMarket.locale}
              />
              <Pagination
                currentPage={page}
                totalPages={totalPages}
                basePath={`${prefix}/stones/${stone.slug}/${cat.slug}`}
                searchParams={sParams}
              />
            </>
          ) : (
            <EmptyState
              headline="Nothing found"
              body={`No ${stone.name.toLowerCase()} ${cat.name.toLowerCase()} currently available.`}
              actionLabel={`EXPLORE ALL ${stone.name.toUpperCase()} PIECES`}
              actionHref={`${prefix}/stones/${stone.slug}`}
            />
          )}
        </div>
      </div>
    </main>
  );
}
