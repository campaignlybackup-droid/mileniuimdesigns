import type { JSX } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { resolveMarket } from "@/lib/market";
import {
  getStorefrontStone,
  getStorefrontStoneCategories,
  listPublishedStoneSlugs,
} from "@/lib/stones";
import { listStorefrontStoneProducts } from "@/lib/catalog";
import { buildCanonicalAndAlternates, getSeoMetadataOverride } from "@/lib/seo";
import { Breadcrumbs } from "@/components/storefront/Breadcrumbs";
import { StoneExplorer } from "@/components/storefront/StoneExplorer";
import { ProductGrid } from "@/components/storefront/ProductGrid";
import { Pagination } from "@/components/storefront/Pagination";
import { SortSelect } from "@/components/storefront/SortSelect";
import { EmptyState } from "@/components/storefront/EmptyState";

export const revalidate = 1800;

export async function generateStaticParams(): Promise<{ slug: string }[]> {
  try {
    const stones = await listPublishedStoneSlugs();
    return stones.map((s) => ({ slug: s.slug }));
  } catch {
    return [];
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ market: string; slug: string }>;
}): Promise<Metadata> {
  const { market, slug } = await params;
  const resolvedMarket = await resolveMarket(market);
  const stone = await getStorefrontStone(slug);

  if (!stone) return {};

  const { canonical, languages } = await buildCanonicalAndAlternates({
    pathname: `/stones/${stone.slug}`,
    marketCode: resolvedMarket.code,
  });


  const override = await getSeoMetadataOverride("stone", stone.id, resolvedMarket.code);

  return {
    title: override?.title ?? `${stone.name} Jewellery | Millennium Designs`,
    description: override?.description ?? stone.shortDescription ?? undefined,
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

export default async function StoneDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ market: string; slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<JSX.Element> {
  const { market, slug } = await params;
  const sParams = await searchParams;
  const resolvedMarket = await resolveMarket(market);

  const stone = await getStorefrontStone(slug);
  if (!stone) {
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
            { label: stone.name },
          ]}
        />

        <div style={{ paddingTop: "var(--md-space-6)" }}>
          <StoneExplorer
            stone={stone}
            categories={categories}
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
                basePath={`${prefix}/stones/${stone.slug}`}
                searchParams={sParams}
              />
            </>
          ) : (
            <EmptyState
              headline="Nothing found"
              body="No pieces currently available for this stone."
              actionLabel="EXPLORE ALL STONES"
              actionHref={`${prefix}/stones`}
            />
          )}
        </div>
      </div>
    </main>
  );
}
