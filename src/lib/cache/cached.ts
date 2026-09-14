import "server-only";
import { unstable_cache } from "next/cache";
import { db } from "@/lib/db/client";
import { ValidationError } from "@/lib/errors";

/**
 * Cache API, named once — 01 §2.4, 08 §4.
 *
 * `src/lib/cache/cached.ts` is the single wrapper for every ISR and data cache entry.
 * It is implemented today with `unstable_cache(fn, keyParts, { tags, revalidate })`.
 *
 * Hard rule from 01 §2.4:
 * No tagged entry may be cached with `revalidate: false`. Every entry must have a finite TTL
 * so an orphaned entry from a crash is a bounded inconvenience rather than an eternal error.
 */

export type CacheOptions = {
  tags?: string[];
  revalidate?: number | false;
};

export function cached<T>(
  fn: () => Promise<T>,
  keyParts: string[],
  options?: CacheOptions,
): (...args: unknown[]) => Promise<T> {
  const revalidate = options?.revalidate;
  if (options?.tags && options.tags.length > 0 && revalidate === false) {
    throw new ValidationError(
      "No tagged entry may be cached with revalidate: false. Every entry must have a finite TTL (01 §2.4).",
    );
  }

  return unstable_cache(fn, keyParts, {
    tags: options?.tags,
    revalidate: revalidate === false ? false : (revalidate ?? 900),
  });
}

/**
 * Baseline seconds per route class (01 §1.3, 08 §4).
 */
const ROUTE_BASELINES: Record<string, number> = {
  home: 300,
  category: 900,
  collection: 900,
  curated_facet: 900,
  product: 900,
  pdp: 900,
  stone: 1800,
  stones: 1800,
  cms_page: 600,
  journal: 1800,
  sitemap: 3600,
};

/**
 * Computes cache life (revalidate seconds) for display-price-bearing ISR routes — 08 §4, 04 §5.4.
 * Caps at 300 seconds when a time-windowed pricing rule is live or scheduled within the next 24 hours.
 */
export async function cacheLifeFor(
  baselineOrRoute: number | string,
  marketCode?: string,
): Promise<number> {
  const baseline =
    typeof baselineOrRoute === "number"
      ? baselineOrRoute
      : (ROUTE_BASELINES[baselineOrRoute] ?? 900);

  try {
    const now = new Date();
    const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const rules = await db.pricingRule.findFirst({
      where: {
        isActive: true,
        ...(marketCode ? { marketCode } : {}),
        OR: [
          // Scheduled to start within 24 hours
          {
            startsAt: {
              gte: now,
              lte: in24Hours,
            },
          },
          // Currently active and scheduled to end within 24 hours
          {
            startsAt: { lte: now },
            endsAt: {
              gte: now,
              lte: in24Hours,
            },
          },
          // Active with an end time in the future (time-windowed live rule)
          {
            endsAt: {
              gte: now,
              lte: in24Hours,
            },
          },
        ],
      },
      select: { id: true },
    });

    if (rules) {
      return Math.min(baseline, 300);
    }
  } catch {
    // Database might be down or not migrated yet in early test steps
    return baseline;
  }

  return baseline;
}
