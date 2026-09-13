"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { listActiveMarkets } from "@/lib/market";

/**
 * The market switcher — 01 §1.4.
 *
 * **PUBLIC ACTION.** A signed-out shopper is meant to call this: choosing a market is not a
 * privileged operation and gating it behind a session would make the switcher useless to the
 * visitors who most need it. It reads no customer data, writes nothing but a preference
 * cookie, and its only effect is a redirect to a URL the shopper could have typed. Listed with
 * this reason in `tests/unit/actions-shape.test.ts`, which also asserts this marker is here —
 * so the file and the list cannot drift apart.
 *
 * **It sets a cookie and REDIRECTS. It does not change how the current page renders.** The
 * cookie's entire job is remembering the shopper's choice so the switch banner stops being
 * offered; the market of any rendered page is its `[market]` URL segment and nothing else.
 *
 * The reason is the CDN. A product page is ISR-cached for 900 seconds; a switcher that
 * re-rendered the current page under a cookie would put one shopper's currency into the cached
 * object every other shopper receives. A redirect changes the URL, and the URL is the cache
 * key.
 */

export const MARKET_COOKIE = "md_market";
const MARKET_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

const schema = z
  .object({
    /** Where the shopper is now, so the switch lands on the same page in the new market. */
    path: z.string().startsWith("/").max(2048),
    marketCode: z.string().regex(/^[A-Za-z]{2}$/),
  })
  .strict();

export async function switchMarketAction(raw: unknown): Promise<void> {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) redirect("/");

  const markets = await listActiveMarkets();
  const target = markets.find((m) => m.code === parsed.data.marketCode.toUpperCase());
  // An unknown or inactive code is not an error page — it is a switcher pointed at a market
  // that was turned off since the page rendered. Sending the shopper home beats a 500.
  if (!target) redirect("/");

  const primary = markets[0]!;
  // Strip any existing market prefix so switching twice does not produce `/in/us/rings`.
  const bare = stripMarketPrefix(
    parsed.data.path,
    markets.map((m) => m.code.toLowerCase()),
  );
  const destination =
    target.code === primary.code ? bare : `/${target.code.toLowerCase()}${bare}`;

  const jar = await cookies();
  jar.set(MARKET_COOKIE, target.code, {
    maxAge: MARKET_COOKIE_MAX_AGE,
    httpOnly: false, // read by the banner in the browser; it carries no authority
    sameSite: "lax",
    path: "/",
    secure: true,
  });

  redirect(destination === "" ? "/" : destination);
}

export function stripMarketPrefix(path: string, segments: string[]): string {
  const parts = path.split("/").filter((s) => s.length > 0);
  const first = parts[0]?.toLowerCase() ?? "";
  if (segments.includes(first)) return `/${parts.slice(1).join("/")}`;
  return path;
}
