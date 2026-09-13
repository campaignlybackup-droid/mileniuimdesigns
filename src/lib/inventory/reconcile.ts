import "server-only";
import { db } from "@/lib/db/client";

/**
 * `reconcile_inventory` — R01's EARLY-WARNING SIGNAL, and a launch blocker (09 §5).
 *
 * Two invariants, checked nightly against the whole table:
 *
 *   1. `reserved_quantity` equals `SUM(reservation_lines.quantity)` over ACTIVE reservations.
 *   2. `on_hand_quantity` equals `SUM(inventory_transactions.quantity_delta)`.
 *
 * **It REPORTS and does not self-heal, and that is the design.** Rewriting a divergent counter
 * makes the symptom disappear and destroys the evidence: the divergence is the only trace that
 * an oversell happened, and a job that quietly corrects it means the next one happens with
 * nothing to find. The report lands in `jobs.result` and is visible at `/admin/system/jobs`;
 * a human decides what the true figure is and writes it through the ledger with a `recount`
 * movement and a mandatory note.
 */

export type Divergence = {
  inventoryItemId: string;
  variantId: string;
  sku: string | null;
  kind: "reserved" | "on_hand";
  counter: number;
  derived: number;
};

export type ReconcileResult = {
  itemsChecked: number;
  divergences: Divergence[];
  /** Always false. Present so the shape says out loud that nothing was rewritten. */
  healed: false;
};

export async function reconcileInventory(): Promise<ReconcileResult> {
  const counted = await db.$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS n FROM inventory_items
  `;

  const reserved = await db.$queryRaw<
    { id: string; variant_id: string; sku: string | null; counter: number; derived: number }[]
  >`
    SELECT ii.id::text AS id, ii.variant_id::text AS variant_id, v.sku,
           ii.reserved_quantity AS counter,
           coalesce((
             SELECT sum(rl.quantity)::int
               FROM reservation_lines rl
               JOIN reservations r ON r.id = rl.reservation_id
              WHERE rl.inventory_item_id = ii.id AND r.status = 'active'
           ), 0) AS derived
      FROM inventory_items ii
      LEFT JOIN product_variants v ON v.id = ii.variant_id
  `;

  const onHand = await db.$queryRaw<
    { id: string; variant_id: string; sku: string | null; counter: number; derived: number }[]
  >`
    SELECT ii.id::text AS id, ii.variant_id::text AS variant_id, v.sku,
           ii.on_hand_quantity AS counter,
           coalesce((
             SELECT sum(t.quantity_delta)::int
               FROM inventory_transactions t WHERE t.inventory_item_id = ii.id
           ), 0) AS derived
      FROM inventory_items ii
      LEFT JOIN product_variants v ON v.id = ii.variant_id
  `;

  const divergences: Divergence[] = [];
  for (const r of reserved) {
    if (r.counter !== r.derived) {
      divergences.push({
        inventoryItemId: r.id,
        variantId: r.variant_id,
        sku: r.sku,
        kind: "reserved",
        counter: r.counter,
        derived: r.derived,
      });
    }
  }
  for (const r of onHand) {
    if (r.counter !== r.derived) {
      divergences.push({
        inventoryItemId: r.id,
        variantId: r.variant_id,
        sku: r.sku,
        kind: "on_hand",
        counter: r.counter,
        derived: r.derived,
      });
    }
  }

  return { itemsChecked: counted[0]?.n ?? 0, divergences, healed: false };
}

/** Items at or below the low-stock threshold — `/api/cron/low-stock-digest`. */
export async function lowStockItems(
  threshold = 2,
): Promise<{ sku: string | null; locationCode: string; available: number }[]> {
  return db.$queryRaw<{ sku: string | null; locationCode: string; available: number }[]>`
    SELECT v.sku, il.code AS "locationCode",
           (ii.on_hand_quantity - ii.reserved_quantity)::int AS available
      FROM inventory_items ii
      JOIN inventory_locations il ON il.id = ii.location_id
      LEFT JOIN product_variants v ON v.id = ii.variant_id
     WHERE il.is_fulfillable AND il.is_active AND il.deleted_at IS NULL
       AND ii.on_hand_quantity - ii.reserved_quantity <= ${threshold}
       -- A one-of-a-kind piece at zero is SOLD, not low. Listing it every night trains
       -- whoever reads the digest to ignore it.
       AND NOT ii.is_one_of_a_kind
     ORDER BY available, v.sku
     LIMIT 500
  `;
}
