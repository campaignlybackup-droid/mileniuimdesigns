import { Suspense, type JSX } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { resolveMarket, isAvailableInMarket, listActiveMarkets } from "@/lib/market";
import {
  getStorefrontPdpProduct,
  listStorefrontCategoryProducts,
  listTopProductSlugs,
  type PdpProduct,
} from "@/lib/catalog";
import { getStorefrontAvailability } from "@/lib/inventory/availability";
import { buildCanonicalAndAlternates, getSeoMetadataOverride, buildProductJsonLd } from "@/lib/seo";
import { Breadcrumbs } from "@/components/storefront/Breadcrumbs";
import { ProductGallery } from "@/components/storefront/ProductGallery";
import { ProductGalleryMobile } from "@/components/storefront/ProductGalleryMobile";
import { ProductInfo } from "@/components/storefront/ProductInfo";
import { StickyAddToBag } from "@/components/storefront/StickyAddToBag";
import { RelatedRail } from "@/components/storefront/RelatedRail";

export const revalidate = 900;

export async function generateStaticParams(): Promise<{ slug: string }[]> {
  try {
    const slugs = await listTopProductSlugs(50);
    return slugs.map((slug) => ({ slug }));
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
  const product = await getStorefrontPdpProduct(slug, resolvedMarket.code);

  if (!product) return {};

  // 04 §5.4: Alternates are emitted ONLY for markets where product exists and is priced
  const markets = await listActiveMarkets();
  const availableMarkets: string[] = [];
  for (const m of markets) {
    const isAvail = await isAvailableInMarket(product.id, m.code);
    if (isAvail) {
      availableMarkets.push(m.code);
    }
  }

  const { canonical, languages } = await buildCanonicalAndAlternates({
    pathname: `/products/${product.slug}`,
    marketCode: resolvedMarket.code,
    availableMarketCodes: availableMarkets,
  });


  const override = await getSeoMetadataOverride("product", product.id, resolvedMarket.code);

  return {
    title: override?.title ?? `${product.title} | Millennium Designs`,
    description: override?.description ?? product.subtitle ?? undefined,
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

/**
 * Dynamic Availability Island — 01 §2.4.
 * Rendered inside <Suspense> with fresh stock read from DB (never baked into 900s ISR shell).
 */
async function DynamicAvailabilitySection({
  product,
  marketCode,
  marketSegment,
  locale,
}: {
  product: PdpProduct;
  marketCode: string;
  marketSegment: string;
  locale: string;
}) {
  let initialBand = "in_stock" as const;
  const variantIds = product.variants.map((v) => v.id);

  if (variantIds.length > 0) {
    try {
      const availMap = await getStorefrontAvailability(variantIds, marketCode);
      const defaultVariant = product.variants.find((v) => v.isDefault) ?? product.variants[0];
      if (defaultVariant) {
        const avail = availMap.get(defaultVariant.id);
        if (avail) {
          initialBand = avail.band as typeof initialBand;
        }
      }
    } catch {
      // Fallback to in_stock or made_to_order
    }
  }

  return (
    <ProductInfo
      product={product}
      marketCode={marketCode}
      marketSegment={marketSegment}
      locale={locale}
      initialBand={product.isMadeToOrder ? "made_to_order" : initialBand}
    />
  );
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ market: string; slug: string }>;
}): Promise<JSX.Element> {
  const { market, slug } = await params;
  const resolvedMarket = await resolveMarket(market);

  const product = await getStorefrontPdpProduct(slug, resolvedMarket.code);
  if (!product) {
    notFound();
  }

  const prefix = resolvedMarket.code.toLowerCase() === "us" ? "" : `/${resolvedMarket.code.toLowerCase()}`;
  const marketSegment = resolvedMarket.code.toLowerCase() === "us" ? "" : resolvedMarket.code.toLowerCase();

  // Related products from same category
  let relatedProducts: Awaited<ReturnType<typeof listStorefrontCategoryProducts>>["products"] = [];
  if (product.primaryCategoryId) {
    try {
      const related = await listStorefrontCategoryProducts(
        product.primaryCategoryId,
        resolvedMarket.code,
        { limit: 5 },
      );
      relatedProducts = related.products.filter((p) => p.id !== product.id).slice(0, 4);
    } catch {
      // Graceful empty
    }
  }


  const jsonLd = buildProductJsonLd(product, resolvedMarket.code);

  const defaultVariant = product.variants.find((v) => v.isDefault) ?? product.variants[0] ?? null;
  const isPriced = defaultVariant?.price !== null;

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
      {/* JSON-LD structured data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

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
            ...(product.primaryCategoryName
              ? [
                  {
                    label: product.primaryCategoryName,
                    href: product.primaryCategorySlug ? `${prefix}/${product.primaryCategorySlug}` : undefined,
                  },
                ]
              : []),
            { label: product.title },
          ]}
        />

        {/* 7/5 Two-column desktop layout, single-column mobile */}
        <div
          className="md-pdp-layout"
          style={{
            paddingTop: "var(--md-space-6)",
          }}
        >
          {/* Mobile Gallery */}
          <div className="md-mobile-only">
            <ProductGalleryMobile
              media={product.media}
              title={product.title}
              selectedVariantId={defaultVariant?.id}
            />
          </div>

          {/* Desktop Gallery */}
          <div className="md-desktop-only" style={{ width: "100%" }}>
            <ProductGallery
              media={product.media}
              title={product.title}
              selectedVariantId={defaultVariant?.id}
            />
          </div>

          {/* Information panel wrapped in Suspense for dynamic availability */}
          <div style={{ width: "100%" }}>
            <Suspense
              fallback={
                <ProductInfo
                  product={product}
                  marketCode={resolvedMarket.code}
                  marketSegment={marketSegment}
                  locale={resolvedMarket.locale}
                  initialBand="in_stock"
                />
              }
            >
              <DynamicAvailabilitySection
                product={product}
                marketCode={resolvedMarket.code}
                marketSegment={marketSegment}
                locale={resolvedMarket.locale}
              />
            </Suspense>
          </div>
        </div>

        {/* Related rail */}
        {relatedProducts.length > 0 && (
          <RelatedRail
            products={relatedProducts}
            marketSegment={marketSegment}
            locale={resolvedMarket.locale}
          />
        )}

        {/* Sticky add-to-bag bar */}
        <StickyAddToBag
          title={product.title}
          price={defaultVariant?.price ?? null}
          locale={resolvedMarket.locale}
          variantId={defaultVariant?.id ?? null}
          marketCode={resolvedMarket.code}
          isAvailable={!product.soldAt && isPriced}
        />
      </div>
    </main>
  );
}
