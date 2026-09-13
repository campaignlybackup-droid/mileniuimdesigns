import snapshot from "@/generated/market-snapshot.json";

/**
 * The ONLY module middleware reads market shape from — 01 §1.4.
 *
 * A **static import**, never a fetch. `src/lib/edge/**` runs in the Edge runtime, where Prisma
 * cannot go; the alternative design fetched a public JSON route with a 60-second module cache
 * and a fail-open branch, and that route enumerated inactive markets to anyone who asked.
 * `tests/unit/market-snapshot.test.ts` asserts this directory contains no `fetch(`.
 *
 * Everything here is pure data and pure functions. No database, no I/O, no `async`.
 */

export type EdgeMarket = {
  code: string;
  segment: string;
  currencyCode: string;
  locale: string;
  rank: number;
};

export const MARKETS: readonly EdgeMarket[] = snapshot.markets;
/** The segment served at the ROOT — `markets.rank` ascending, active only. */
export const PRIMARY_SEGMENT: string = snapshot.primary;
export const PRIMARY_CODE: string = snapshot.primaryCode;

const BY_SEGMENT = new Map(MARKETS.map((m) => [m.segment, m]));

export function marketForSegment(segment: string): EdgeMarket | null {
  return BY_SEGMENT.get(segment.toLowerCase()) ?? null;
}

/** Whether the first path segment names a market at all. */
export function isMarketSegment(segment: string): boolean {
  return BY_SEGMENT.has(segment.toLowerCase());
}

export type MarketRouting =
  | { kind: "redirect"; to: string }
  | { kind: "rewrite"; to: string; marketCode: string }
  | { kind: "pass" };

/**
 * What middleware should do with a storefront path — 01 §1.4.
 *
 * Three cases, and the order matters:
 *
 *  1. `/us/rings` **301s** to `/rings`. The primary market has no prefix, so serving it at both
 *     URLs is duplicate content that splits ranking between two addresses for one page.
 *  2. `/in/rings` **rewrites** to the app tree unchanged — the market is already explicit.
 *  3. `/rings` **rewrites** to `/us/rings`. The market is always explicit INSIDE the app, so no
 *     page component ever has to ask "which market is this?" and none can answer it from a
 *     cookie.
 *
 * An unknown first segment is NOT a market and is passed through as a path — `/rings` is a
 * category, `/xx` is a 404 from the route tree, and neither is middleware's decision to make.
 */
export function routeForPath(pathname: string): MarketRouting {
  const segments = pathname.split("/").filter((s) => s.length > 0);
  const first = segments[0] ?? "";

  if (first.toLowerCase() === PRIMARY_SEGMENT) {
    // Strip the redundant prefix, preserving the rest of the path exactly.
    const rest = segments.slice(1).join("/");
    return { kind: "redirect", to: `/${rest}` };
  }

  const market = marketForSegment(first);
  if (market) return { kind: "rewrite", to: pathname, marketCode: market.code };

  return { kind: "rewrite", to: `/${PRIMARY_SEGMENT}${pathname}`, marketCode: PRIMARY_CODE };
}
