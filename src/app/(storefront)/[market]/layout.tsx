import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { env } from "@/lib/config/env";
import { alternatesFor, marketParams, resolveMarket } from "@/lib/market";

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
  try {
    // Reads the DATABASE, not the edge snapshot: deactivating a market 404s immediately
    // rather than at the next deployment.
    await resolveMarket(market);
  } catch {
    notFound();
  }
  return <>{children}</>;
}
