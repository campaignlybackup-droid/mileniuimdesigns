import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { env } from "@/lib/config/env";
import { db } from "@/lib/db/client";
import { listActiveMarkets } from "@/lib/market";
import { priceVisibility } from "@/lib/catalog/visibility";
import type { PdpProduct } from "@/lib/catalog/products";

export type AlternateOptions = {
  pathname: string;
  marketCode: string;
  availableMarketCodes?: string[];
};

/**
 * Builds canonical URL and alternates for Next.js metadata — 01 §1.4, 04 §5.4.
 */
export async function buildCanonicalAndAlternates(opts: AlternateOptions): Promise<{
  canonical: string;
  languages: Record<string, string>;
}> {
  let domain = "https://millenniumdesigns.com";
  try {
    domain = env().NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  } catch {
    // fallback
  }

  const markets = await listActiveMarkets();
  const primary = markets[0];
  const primaryCode = primary?.code ?? "US";

  const cleanPath = opts.pathname.startsWith("/") ? opts.pathname : `/${opts.pathname}`;
  const isPrimary = opts.marketCode.toUpperCase() === primaryCode.toUpperCase();
  const currentMarket = markets.find((m) => m.code.toUpperCase() === opts.marketCode.toUpperCase());

  const canonical = isPrimary
    ? `${domain}${cleanPath}`
    : `${domain}/${currentMarket?.code.toLowerCase() ?? opts.marketCode.toLowerCase()}${cleanPath}`;

  const languages: Record<string, string> = {};
  const activeMarkets = opts.availableMarketCodes
    ? markets.filter((m) =>
        opts.availableMarketCodes!.some((c) => c.toUpperCase() === m.code.toUpperCase()),
      )
    : markets;

  let primaryAvailable = false;
  for (const m of activeMarkets) {
    const isMPrimary = m.code.toUpperCase() === primaryCode.toUpperCase();
    if (isMPrimary) primaryAvailable = true;

    const href = isMPrimary
      ? `${domain}${cleanPath}`
      : `${domain}/${m.code.toLowerCase()}${cleanPath}`;

    languages[m.locale] = href;
  }

  if (primaryAvailable) {
    languages["x-default"] = `${domain}${cleanPath}`;
  }

  return {
    canonical,
    languages,
  };
}

/**
 * Query SEO metadata overrides from seo_metadata table.
 */
const VALID_SEO_ENTITY_TYPES = new Set([
  "product",
  "category",
  "collection",
  "stone",
  "material",
  "cms_page",
  "journal_post",
  "curated_facet",
  "home",
]);

async function loadSeoMetadataOverrideFromDb(
  entityType: string,
  entityId: string | null,
  marketCode?: string,
): Promise<{
  title: string | null;
  description: string | null;
  canonicalPath: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  robotsNoindex: boolean;
  robotsNofollow: boolean;
} | null> {
  if (!VALID_SEO_ENTITY_TYPES.has(entityType)) {
    return null;
  }
  try {
    const rows = await db.seoMetadata.findFirst({
      where: {
        entityType: entityType as never,
        ...(entityId ? { entityId } : {}),
        ...(marketCode ? { OR: [{ marketCode }, { marketCode: null }] } : {}),
      },
      orderBy: { marketCode: "desc" },
    });

    if (!rows) return null;
    return {
      title: rows.title,
      description: rows.description,
      canonicalPath: rows.canonicalPath,
      ogTitle: rows.ogTitle,
      ogDescription: rows.ogDescription,
      robotsNoindex: rows.robotsNoindex,
      robotsNofollow: rows.robotsNofollow,
    };
  } catch {
    return null;
  }
}

const getCachedSeoOverride = unstable_cache(
  loadSeoMetadataOverrideFromDb,
  ["seo-metadata-override"],
  { tags: ["seo"], revalidate: 3600 },
);

export const getSeoMetadataOverride = cache(
  async (
    entityType: string,
    entityId: string | null,
    marketCode?: string,
  ): Promise<{
    title: string | null;
    description: string | null;
    canonicalPath: string | null;
    ogTitle: string | null;
    ogDescription: string | null;
    robotsNoindex: boolean;
    robotsNofollow: boolean;
  } | null> => {
    return getCachedSeoOverride(entityType, entityId, marketCode);
  },
);

/**
 * Build JSON-LD for Product detail page — 04 §5.4.
 */
export function buildProductJsonLd(product: PdpProduct, marketCode: string): Record<string, unknown> {
  let domain = "https://millenniumdesigns.com";
  try {
    domain = env().NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  } catch {
    // fallback
  }

  const isPrimary = marketCode.toUpperCase() === "US";
  const url = isPrimary
    ? `${domain}/products/${product.slug}`
    : `${domain}/${marketCode.toLowerCase()}/products/${product.slug}`;

  const images = product.media.map((m) => m.publicId);

  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    description: product.subtitle ?? undefined,
    image: images.length > 0 ? images : undefined,
    sku: product.variants[0]?.sku,
    url,
  };

  const pricedVariant = product.variants.find((v) => v.price !== null);
  if (pricedVariant && pricedVariant.price) {
    const p = pricedVariant.price;
    const finalAmount = Number(p.saleMinor) / 100;

    let availability = "https://schema.org/InStock";
    if (product.soldAt) {
      availability = "https://schema.org/SoldOut";
    }

    jsonLd.offers = {
      "@type": "Offer",
      url,
      priceCurrency: p.currencyCode,
      price: finalAmount.toString(),
      availability,
    };
  }

  return jsonLd;
}

/**
 * Build JSON-LD for BreadcrumbList.
 */
export function buildBreadcrumbJsonLd(
  items: { name: string; url: string }[],
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, idx) => ({
      "@type": "ListItem",
      position: idx + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

export type SitemapUrlEntry = {
  loc: string;
  lastmod?: string;
  changefreq?: string;
  priority?: string;
};

/**
 * Enumerate sitemap URLs for a shard — 08 §4.
 */
export async function enumerateSitemap(shard: string): Promise<SitemapUrlEntry[]> {
  const shardName = shard.replace(/\.xml$/, "");

  let domain = "https://millenniumdesigns.com";
  try {
    domain = env().NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  } catch {
    // fallback
  }

  const urls: SitemapUrlEntry[] = [];
  const markets = await listActiveMarkets();

  if (shardName === "static" || shardName === "categories") {
    for (const m of markets) {
      const prefix = m.code.toLowerCase() === "us" ? "" : `/${m.code.toLowerCase()}`;
      urls.push({ loc: `${domain}${prefix}/`, changefreq: "daily", priority: "1.0" });
      urls.push({ loc: `${domain}${prefix}/stones`, changefreq: "weekly", priority: "0.8" });
    }

    const categories = await db.category.findMany({
      where: { deletedAt: null, isPublished: true },
      select: { slug: true, updatedAt: true },
    });

    for (const cat of categories) {
      for (const m of markets) {
        const prefix = m.code.toLowerCase() === "us" ? "" : `/${m.code.toLowerCase()}`;
        urls.push({
          loc: `${domain}${prefix}/${cat.slug}`,
          lastmod: cat.updatedAt.toISOString(),
          changefreq: "weekly",
          priority: "0.8",
        });
      }
    }

    const stones = await db.stone.findMany({
      where: { deletedAt: null, isPublished: true },
      select: { slug: true, updatedAt: true },
    });

    for (const stone of stones) {
      for (const m of markets) {
        const prefix = m.code.toLowerCase() === "us" ? "" : `/${m.code.toLowerCase()}`;
        urls.push({
          loc: `${domain}${prefix}/stones/${stone.slug}`,
          lastmod: stone.updatedAt.toISOString(),
          changefreq: "weekly",
          priority: "0.7",
        });
      }
    }
  } else if (shardName.startsWith("products")) {
    for (const m of markets) {
      const prefix = m.code.toLowerCase() === "us" ? "" : `/${m.code.toLowerCase()}`;
      const prods = await db.$queryRaw<{ slug: string; updated_at: Date }[]>`
        SELECT p.slug, p.updated_at
          FROM products p
          LEFT JOIN product_market_content pmc
                 ON pmc.product_id = p.id AND pmc.market_code = ${m.code}
         WHERE p.deleted_at IS NULL
           AND p.status = 'active'
           AND p.published_at IS NOT NULL
           AND p.published_at <= now()
           AND coalesce(pmc.is_published, true)
           ${priceVisibility(m.code)}
         ORDER BY p.id ASC
         LIMIT 40000
      `;

      for (const p of prods) {
        urls.push({
          loc: `${domain}${prefix}/products/${p.slug}`,
          lastmod: p.updated_at.toISOString(),
          changefreq: "daily",
          priority: "0.9",
        });
      }
    }
  }

  return urls;
}
