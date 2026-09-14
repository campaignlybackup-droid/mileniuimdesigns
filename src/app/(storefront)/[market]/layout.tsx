import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { env } from "@/lib/config/env";
import { alternatesFor, listActiveMarkets, marketParams, resolveMarket } from "@/lib/market";
import { listPublishedCategories } from "@/lib/catalog";
import { SiteHeader } from "@/components/storefront/SiteHeader";
import { SiteFooter } from "@/components/storefront/SiteFooter";
import { CartProvider } from "@/components/storefront/CartContext";
import { CartDrawer } from "@/components/storefront/CartDrawer";

/**
 * The storefront's market layout — 01 §1.4. Owned by P13; the pages inside it are P15's.
 *
 * **The market is the `[market]` segment and nothing else.** Middleware rewrites `/rings` to
 * `/us/rings`, so by the time any page renders the market is explicit in the URL — which is
 * also the CDN cache key. No component below this point asks "which market is this?", and
 * none could answer it from a cookie if it did.
 */

export const revalidate = 900;

/** QUERIES the `markets` table. Never a hand-written array — that is what would make "adding
 *  the UK is one row" false the first time anyone tried it. */
export async function generateStaticParams(): Promise<{ market: string }[]> {
  return marketParams();
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ market: string }>;
}): Promise<Metadata> {
  const { market } = await params;
  try {
    const resolved = await resolveMarket(market);
    const { NEXT_PUBLIC_APP_URL } = env();
    // `hreflang` alternates for every ACTIVE market, `x-default` → the primary, all derived
    // from the rows so a third market gains its alternate with no code change.
    const alt = await alternatesFor("/", NEXT_PUBLIC_APP_URL);
    return {
      metadataBase: new URL(NEXT_PUBLIC_APP_URL),
      alternates: {
        canonical: alt.canonical,
        languages: { ...alt.languages, "x-default": alt.xDefault },
      },
      other: { "md-market": resolved.code },
    };
  } catch {
    // An inactive or unknown market has no metadata to emit, and inventing some would make a
    // 404 page look canonical.
    return {};
  }
}

export default async function MarketLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ market: string }>;
}): Promise<React.ReactElement> {
  const { market } = await params;
  let resolved;
  try {
    // Reads the DATABASE, not the edge snapshot: deactivating a market 404s immediately
    // rather than at the next deployment.
    resolved = await resolveMarket(market);
  } catch {
    notFound();
  }

  const [activeMarkets, categories] = await Promise.all([
    listActiveMarkets(),
    listPublishedCategories(),
  ]);

  const primary = activeMarkets[0];
  const isPrimary = primary ? resolved.code === primary.code : false;
  const marketSegment = isPrimary ? "" : resolved.code.toLowerCase();

  const navigation = [
    ...categories.map((c) => ({
      label: c.name.toUpperCase(),
      href: `/${c.slug}`,
    })),
    { label: "STONES", href: "/stones" },
  ];

  const marketOptions = activeMarkets.map((m) => {
    const mIsPrimary = primary ? m.code === primary.code : false;
    const mHref = mIsPrimary ? "/" : `/${m.code.toLowerCase()}`;
    return {
      code: m.code,
      label: `${m.code} · ${m.currencyCode}`,
      href: mHref,
      active: m.code === resolved.code,
    };
  });

  const prefix = marketSegment === "" ? "" : `/${marketSegment}`;
  const footerColumns = [
    {
      heading: "COLLECTIONS",
      links: categories.map((c) => ({
        label: c.name,
        href: `${prefix}/${c.slug}`,
      })),
    },
    {
      heading: "EXPLORE",
      links: [
        { label: "Stones Explorer", href: `${prefix}/stones` },
        { label: "One of a Kind", href: `${prefix}/one-of-a-kind` },
        { label: "Closeouts", href: `${prefix}/closeouts` },
      ],
    },
  ];

  return (
    <CartProvider>
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
        <SiteHeader
          marketSegment={marketSegment}
          navigation={navigation}
          markets={marketOptions}
        />
        <main id="main" style={{ flexGrow: 1 }}>
          {children}
        </main>
        <SiteFooter year={2026} columns={footerColumns} />
        <CartDrawer marketCode={resolved.code} />
      </div>
    </CartProvider>
  );
}
