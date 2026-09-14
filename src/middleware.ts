import { NextResponse, type NextRequest } from "next/server";
import { routeForPath } from "@/lib/edge/markets";

/**
 * Market routing — 01 §1.4. Runs on the Edge runtime.
 *
 * **The cookie never selects the market for a rendered page.** `md_market` is read in exactly
 * two places: here, to decide whether to offer a switch banner, and the market-switcher server
 * action, which turns it into a `redirect()` to the other market's URL. Inside the app tree
 * the market is the `[market]` segment and nothing else.
 *
 * This is not stylistic. A product page is ISR-cached for 900 seconds. If market resolution
 * preferred a cookie, the first request from a visitor carrying `md_market=IN` would bake ₹
 * prices into the CDN object served to every US visitor for the next fifteen minutes — and
 * every subsequent US visitor would see a correct-looking page with the wrong currency and the
 * wrong number. `tests/e2e/cache-leak.spec.ts` is the test; this is the reason.
 *
 * **Market is never chosen by IP.** Geo may render a dismissible "Shopping from India?"
 * banner, but a crawler always gets the market its URL asked for. A geo-redirect is cloaking
 * and costs rankings.
 */

/** Paths middleware must not touch: they are not storefront pages and have no market. */
const BYPASS = [
  "/api",
  "/admin",
  "/_next",
  "/_vercel",
  "/brand",
  "/images",
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml",
  "/opengraph-image",
  "/icon",
  "/apple-icon",
];

export const config = {
  // Excluding static assets here as well as in BYPASS: the matcher stops the function being
  // invoked at all, which is the difference between a cheap no-op and a billed invocation on
  // every image request.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

/** The cookie's ONLY job: deciding whether to offer a switch. It never selects a market. */
export const MARKET_COOKIE = "md_market";

export function middleware(req: NextRequest): NextResponse {
  const { pathname, search } = req.nextUrl;

  if (
    BYPASS.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ||
    /\.(?:svg|png|jpg|jpeg|gif|webp|ico|avif|css|js|woff2?)$/.test(pathname)
  ) {
    return NextResponse.next();
  }

  const routing = routeForPath(pathname);

  if (routing.kind === "redirect") {
    const url = req.nextUrl.clone();
    url.pathname = routing.to === "" ? "/" : routing.to;
    // 301, not 307: this is a permanent canonicalisation, and a temporary redirect leaves
    // both URLs indexable, which is the duplicate content the redirect exists to prevent.
    return NextResponse.redirect(url, 301);
  }

  if (routing.kind === "rewrite") {
    const url = req.nextUrl.clone();
    url.pathname = routing.to;
    url.search = search;
    const res = NextResponse.rewrite(url);
    // Advisory only. Read by the switch banner, never by anything that prices.
    res.headers.set("x-md-market", routing.marketCode);
    return res;
  }

  return NextResponse.next();
}
