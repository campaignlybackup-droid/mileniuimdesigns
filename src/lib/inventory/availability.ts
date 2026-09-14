import "server-only";
import { db } from "@/lib/db/client";
import type { AvailabilityBand } from "@/types/inventory";

/**
 * Availability — 03 §8.1, 11 §7.1. FIVE bands.
 *
 * **`sold` keys on `products.sold_at`, NEVER on `available_quantity <= 0`.** A one-of-a-kind
 * piece that has found its owner is not "out of stock" — it is an archive entry the house
 * keeps visible, with a price, no add-to-bag, and copy that says so. Collapsing `sold` into
 * `out` silently removes the One of a Kind edit's whole point.
 */

export const LOW_STOCK_THRESHOLD = 2;

export type Availability = {
  band: AvailabilityBand;
  /** `null` for untracked and made-to-order: there is no number to show. */
  availableQuantity: number | null;
};

export async function getAvailability(
  variantIds: string[],
  marketCode: string,
  /**
   * REQUIRED, and deliberately without a default — see ResolveContext.client for the three
   * defects that bought this. Pass `tx` inside a transaction, `db` on a request path.
   */
  client: Pick<typeof db, "$queryRaw">,
): Promise<Map<string, Availability>> {
  if (variantIds.length === 0) return new Map();

  const rows = await client.$queryRaw<
    {
      variant_id: string;
      inventory_policy: string;
      sold_at: Date | null;
      is_one_of_a_kind: boolean;
      available: number | null;
    }[]
  >`
    SELECT v.id::text AS variant_id,
           v.inventory_policy::text AS inventory_policy,
           p.sold_at,
           p.is_one_of_a_kind,
           -- Summed across the market's FULFILLABLE locations only. Stock in a quarantine
           -- location is real and is not for sale (05 §1.3).
           (SELECT sum(greatest(ii.on_hand_quantity - ii.reserved_quantity
                                - ii.safety_stock_quantity, 0))::int
              FROM inventory_items ii
              JOIN market_locations ml ON ml.location_id = ii.location_id
                                      AND ml.market_code = ${marketCode}
              JOIN inventory_locations il ON il.id = ii.location_id
             WHERE ii.variant_id = v.id
               AND il.is_fulfillable AND il.is_active AND il.deleted_at IS NULL
           ) AS available
      FROM product_variants v
      JOIN products p ON p.id = v.product_id
     WHERE v.id = ANY(${variantIds}::uuid[]) AND v.deleted_at IS NULL
  `;

  const out = new Map<string, Availability>();
  for (const r of rows) {
    out.set(r.variant_id, { band: bandFor(r), availableQuantity: bandQuantity(r) });
  }
  return out;
}

type Row = {
  inventory_policy: string;
  sold_at: Date | null;
  is_one_of_a_kind: boolean;
  available: number | null;
};

export function bandFor(r: Row): AvailabilityBand {
  // FIRST, before any quantity is consulted. A sold unique piece has zero available, so any
  // ordering that checked quantity first would render it as `out` and the archive would
  // silently become an out-of-stock listing.
  if (r.is_one_of_a_kind && r.sold_at !== null) return "sold";
  if (r.inventory_policy === "made_to_order") return "made_to_order";
  if (r.inventory_policy === "untracked") return "in_stock";
  const available = r.available ?? 0;
  if (available <= 0) return "out";
  if (available <= LOW_STOCK_THRESHOLD) return "low";
  return "in_stock";
}

function bandQuantity(r: Row): number | null {
  if (r.inventory_policy !== "tracked") return null;
  return r.available ?? 0;
}

export async function getStorefrontAvailability(
  variantIds: string[],
  marketCode: string,
): Promise<Map<string, Availability>> {
  return getAvailability(variantIds, marketCode, db);
}

