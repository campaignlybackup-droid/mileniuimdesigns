import "server-only";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { requestNow } from "@/lib/clock";
import { resolvePriceBatch } from "@/lib/pricing/resolve";
import type { DisplayPrice, MarketCode, PriceRange } from "@/lib/pricing/types";

/**
 * What a listing card, a PDP or an email is given — 04 §1.3, §1.1.
 *
 * **`getDisplayPrice` returns exactly what `resolvePrice` would charge** an anonymous shopper
 * with no coupon, because it IS `resolvePriceBatch` at quantity 1. It is not a cheaper query
 * that happens to agree; agreeing by construction is the only way it stays agreeing.
 *
 * That is the gate nobody thinks of until a customer does: a card that says $248 over a bag
 * that says $198 is a wrong price even though both numbers are individually correct. The two
 * used to diverge the moment someone added a `pricing_rules` row, because the card read
 * `prices.list_minor` directly and the bag went through the rule stack.
 * `tests/unit/display-equals-charged.test.ts` asserts the integers match.
 */

const idsSchema = z.array(z.uuid()).min(1).max(200);

/** Zod: 1..200, deduped. A crafted request asking for 40,000 ids is a bounded read. */
function parseIds(ids: string[]): string[] {
  return idsSchema.parse([...new Set(ids)]);
}

export async function getDisplayPrice(
  variantIds: string[],
  marketCode: MarketCode,
): Promise<Map<string, DisplayPrice>> {
  const ids = parseIds(variantIds);
  const at = requestNow();

  // ONE batch, not one call per card. `resolvePrice` inside a `.map()` over 48 product cards
  // is 48 round trips on the hottest page on the site (01 §2.3). Unpriced variants are absent
  // from the batch's map, which is exactly the omission this map wants.
  const [resolved, compareAt] = await Promise.all([
    resolvePriceBatch(
      ids.map((variantId) => ({ variantId, marketCode, quantity: 1 })),
      { at },
    ),
    readCompareAt(ids, marketCode),
  ]);

  const out = new Map<string, DisplayPrice>();
  for (const [variantId, price] of resolved) {
    out.set(variantId, {
      currencyCode: price.currencyCode,
      listMinor: price.unitListMinor,
      // The CHARGED figure, not `prices.sale_minor`. A `pricing_rules` markdown is a real
      // discount a shopper will be charged, so a card that ignored it would understate the
      // saving and overstate the price.
      saleMinor: price.unitFinalMinor,
      compareAtMinor: compareAt.get(variantId) ?? null,
    });
  }
  return out;
}

async function readCompareAt(
  variantIds: string[],
  marketCode: MarketCode,
): Promise<Map<string, bigint>> {
  const rows = await db.$queryRaw<{ variant_id: string; compare_at_minor: bigint }[]>`
    SELECT variant_id::text AS variant_id, compare_at_minor
      FROM prices
     WHERE variant_id = ANY(${variantIds}::uuid[])
       AND market_code = ${marketCode}
       AND compare_at_minor IS NOT NULL
       AND valid_to IS NULL AND deleted_at IS NULL
  `;
  return new Map(rows.map((r) => [r.variant_id, BigInt(r.compare_at_minor)]));
}

/**
 * "From $248" on a listing card — 04 §1.3.
 *
 * A product with four variants computed in a component would be four `resolvePrice` calls and
 * a `Math.min` on numbers, which is both N round trips and float money. It is one batch.
 *
 * `pricedVariantCount` and `totalVariantCount` are returned rather than a boolean because the
 * three states differ: none priced (not purchasable here), some priced (a partial catalogue,
 * which the merchandiser needs to see), all priced. A single `isAvailable` flag would collapse
 * the middle one into whichever neighbour the caller guessed.
 */
export async function getProductPriceRanges(
  productIds: string[],
  marketCode: MarketCode,
): Promise<Map<string, PriceRange>> {
  const ids = parseIds(productIds);
  const at = requestNow();

  const variants = await db.$queryRaw<{ product_id: string; variant_id: string }[]>`
    SELECT product_id::text AS product_id, id::text AS variant_id
      FROM product_variants
     WHERE product_id = ANY(${ids}::uuid[]) AND deleted_at IS NULL AND is_active
     ORDER BY product_id, position, id
  `;
  if (variants.length === 0) return new Map();

  const byProduct = new Map<string, string[]>();
  for (const v of variants) {
    const list = byProduct.get(v.product_id) ?? [];
    list.push(v.variant_id);
    byProduct.set(v.product_id, list);
  }

  // ONE batch for every variant of every product asked for — 200 products with four variants
  // each is still three queries, not eight hundred.
  const resolved = await resolvePriceBatch(
    variants.map((v) => ({ variantId: v.variant_id, marketCode, quantity: 1 })),
    { at },
  );

  const out = new Map<string, PriceRange>();
  for (const [productId, all] of byProduct) {
    const priced = all
      .map((id) => resolved.get(id))
      .filter((p): p is NonNullable<typeof p> => p !== undefined);
    if (priced.length === 0) {
      // Deliberately NOT omitted. "This product exists and is not purchasable in this market"
      // is a state the storefront renders (§6); omitting it would make it indistinguishable
      // from a product that does not exist.
      out.set(productId, {
        currencyCode: "",
        minListMinor: 0n,
        maxListMinor: 0n,
        minSaleMinor: null,
        pricedVariantCount: 0,
        totalVariantCount: all.length,
      });
      continue;
    }
    const lists = priced.map((p) => p.unitListMinor);
    const finals = priced.map((p) => p.unitFinalMinor);
    out.set(productId, {
      currencyCode: priced[0]!.currencyCode,
      minListMinor: lists.reduce((a, b) => (b < a ? b : a)),
      maxListMinor: lists.reduce((a, b) => (b > a ? b : a)),
      minSaleMinor: finals.reduce((a, b) => (b < a ? b : a)),
      pricedVariantCount: priced.length,
      totalVariantCount: all.length,
    });
  }
  return out;
}
