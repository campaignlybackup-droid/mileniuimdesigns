import "server-only";
import { withTransaction, type Tx } from "@/lib/db/transaction";
import { InsufficientStockError, ValidationError } from "@/lib/errors";
import type { Actor } from "@/lib/rbac";
import { writeInventoryTransaction } from "@/lib/inventory/ledger";

/**
 * Reservations — 05 §1.5, §1.6. **R01's mitigation, in depth order.**
 *
 * Three mechanisms, each sufficient for the common case, all three present because the
 * failure — two customers paying for one ring — is unrecoverable:
 *
 *  1. `SELECT … FOR UPDATE` in ascending `inventory_items.id` order, which makes the
 *     contended pair take turns and makes two multi-line carts deadlock-free.
 *  2. A conditional `UPDATE` whose `WHERE` re-evaluates availability — correct at
 *     ReadCommitted even with no lock, because Postgres re-checks the `WHERE` against the
 *     freshly-committed row version when it unblocks.
 *  3. `chk_inventory_no_oversell`, the floor under a service bug: an oversold row is not
 *     rejected by policy, it cannot be written.
 *
 * **ReadCommitted, not Serializable.** The row lock serialises the contended pair;
 * Serializable would additionally abort one transaction in EVERY concurrent checkout with
 * SQLSTATE 40001, including uncontended ones, turning "just sold" into a 500.
 */

export const RESERVATION_TTL_MINUTES = 30;
export const PAYMENT_WINDOW_MINUTES = 30;

export type ReserveLine = { variantId: string; quantity: number };
export type ReserveRef = { kind: "cart" | "order"; id: string };
export type ReleaseReason = "expired" | "cart_changed" | "payment_failed" | "admin";

export type Reservation = {
  id: string;
  lines: { inventoryItemId: string; variantId: string; quantity: number }[];
  expiresAt: Date;
};

type Candidate = {
  id: string;
  variant_id: string;
  location_id: string;
  priority: number;
  rank: number;
};

/**
 * Take a reservation, or fail.
 *
 * **Step 0 — drop the lines that never reserve.** `made_to_order` and `untracked` variants
 * have no `inventory_items` row at all. Without this filter step 1 returns zero rows for a
 * made-to-order piece, step 2 allocates nothing, "zero rows means you lost the race" fires,
 * and EVERY made-to-order product in the catalogue becomes permanently unbuyable with
 * `InsufficientStockError` at the last click of checkout. A bag entirely of made-to-order
 * pieces yields a reservation with zero lines, not an error.
 */
export async function reserveStock(
  tx: Tx,
  lines: ReserveLine[],
  ref: ReserveRef & { expiresAt?: Date },
): Promise<Reservation> {
  const wanted = lines.filter((l) => l.quantity > 0);
  if (wanted.length === 0) throw new ValidationError("A reservation needs at least one line.");

  const variantIds = [...new Set(wanted.map((l) => l.variantId))];

  // Step 0.
  const tracked = await tx.$queryRaw<{ id: string }[]>`
    SELECT id::text AS id FROM product_variants
     WHERE id = ANY(${variantIds}::uuid[]) AND deleted_at IS NULL
       AND inventory_policy = 'tracked'
  `;
  const trackedIds = new Set(tracked.map((t) => t.id));
  const toReserve = wanted.filter((l) => trackedIds.has(l.variantId));

  const marketCode = await marketFor(tx, ref);

  // Step 1a — candidates, with the allocation order. Filtering lives here so the LOCKING
  // statement can be single-table.
  const candidates =
    toReserve.length === 0
      ? []
      : await tx.$queryRaw<Candidate[]>`
    SELECT ii.id::text AS id, ii.variant_id::text AS variant_id,
           ii.location_id::text AS location_id, ml.priority, il.rank
      FROM inventory_items ii
      JOIN market_locations ml ON ml.location_id = ii.location_id AND ml.market_code = ${marketCode}
      JOIN inventory_locations il ON il.id = ii.location_id
     WHERE ii.variant_id = ANY(${toReserve.map((l) => l.variantId)}::uuid[])
       AND il.is_fulfillable AND il.is_active AND il.deleted_at IS NULL
  `;

  // Step 1b — lock them, SINGLE-TABLE, in ascending id order.
  //
  // The lock is a second statement because `ORDER BY … FOR UPDATE` guarantees lock order only
  // when Postgres puts `LockRows` above the node producing the ordering. On a single-table
  // primary-key scan that is stable. On the three-table join above, the planner may choose a
  // join order that locks rows as the join emits them — and a plan flip under a changed row
  // estimate then silently removes the deadlock-freedom this whole design rests on, with the
  // only symptom a 40P01 at checkout under load. Splitting makes it a property of the query
  // SHAPE rather than of a plan.
  const ids = [...new Set(candidates.map((c) => c.id))].sort();
  const locked =
    ids.length === 0
      ? []
      : await tx.$queryRaw<
          {
            id: string;
            variant_id: string;
            location_id: string;
            on_hand_quantity: number;
            reserved_quantity: number;
            safety_stock_quantity: number;
          }[]
        >`
    SELECT id::text AS id, variant_id::text AS variant_id, location_id::text AS location_id,
           on_hand_quantity, reserved_quantity, safety_stock_quantity
      FROM inventory_items
     WHERE id = ANY(${ids}::uuid[])
     ORDER BY id
       FOR UPDATE
  `;

  const byId = new Map(locked.map((l) => [l.id, l]));
  const order = new Map(candidates.map((c) => [c.id, c]));

  // Allocate: one location per line. **No split fulfilment at launch** (05 §1.3) — a line of
  // quantity 3 must be satisfiable from ONE location, because splitting produces two shipments
  // and two tracking numbers for an order that is typically one to three pieces, and makes
  // "what did shipping cost" ambiguous at the moment the customer is being quoted.
  const allocation: { inventoryItemId: string; variantId: string; quantity: number }[] = [];
  for (const line of toReserve) {
    const options = candidates
      .filter((c) => c.variant_id === line.variantId)
      .sort((a, b) => a.priority - b.priority || a.rank - b.rank || (a.id < b.id ? -1 : 1));
    const chosen = options.find((c) => {
      const row = byId.get(c.id);
      if (!row) return false;
      return (
        row.on_hand_quantity - row.reserved_quantity - row.safety_stock_quantity >=
        line.quantity
      );
    });
    if (!chosen) {
      throw new InsufficientStockError(
        `Not enough stock in one location for variant ${line.variantId}.`,
        { context: { variantId: line.variantId, quantity: line.quantity } },
      );
    }
    allocation.push({
      inventoryItemId: chosen.id,
      variantId: line.variantId,
      quantity: line.quantity,
    });
    void order;
  }

  // Step 2 — one conditional UPDATE per allocated line. **Zero rows means you lost the race.**
  for (const a of allocation) {
    const updated = await tx.$executeRaw`
      UPDATE inventory_items
         SET reserved_quantity = reserved_quantity + ${a.quantity},
             available_quantity = on_hand_quantity - (reserved_quantity + ${a.quantity}),
             version = version + 1,
             updated_at = now()
       WHERE id = ${a.inventoryItemId}::uuid
         AND on_hand_quantity - reserved_quantity - safety_stock_quantity >= ${a.quantity}
    `;
    if (updated === 0) {
      throw new InsufficientStockError(`That piece was taken while you were checking out.`, {
        context: { variantId: a.variantId },
      });
    }
  }

  // Step 3 — the header and its lines, same transaction.
  const expiresAt = ref.expiresAt ?? new Date(Date.now() + RESERVATION_TTL_MINUTES * 60_000);
  const header = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO reservations (id, ref_kind, cart_id, order_id, status, expires_at,
                              created_at, updated_at)
    VALUES (gen_random_uuid(), ${ref.kind}::reservation_ref_kind,
            ${ref.kind === "cart" ? ref.id : null}::uuid,
            ${ref.kind === "order" ? ref.id : null}::uuid,
            'active', ${expiresAt}, now(), now())
    RETURNING id::text AS id
  `;
  const reservationId = header[0]!.id;

  for (const a of allocation) {
    await tx.$executeRaw`
      INSERT INTO reservation_lines (id, reservation_id, inventory_item_id, variant_id,
                                     quantity, created_at)
      VALUES (gen_random_uuid(), ${reservationId}::uuid, ${a.inventoryItemId}::uuid,
              ${a.variantId}::uuid, ${a.quantity}, now())
    `;
  }

  return { id: reservationId, lines: allocation, expiresAt };
}

async function marketFor(tx: Tx, ref: ReserveRef): Promise<string> {
  const rows =
    ref.kind === "cart"
      ? await tx.$queryRaw<{ market_code: string }[]>`
        SELECT market_code FROM carts WHERE id = ${ref.id}::uuid`
      : await tx.$queryRaw<{ market_code: string }[]>`
        SELECT market_code FROM orders WHERE id = ${ref.id}::uuid`;
  const code = rows[0]?.market_code;
  if (code === undefined) throw new ValidationError(`No such ${ref.kind} ${ref.id}.`);
  return code;
}

/**
 * Release a reservation. **The reason is REQUIRED and undefaulted** (05 §1.6).
 *
 * A default would be written by whichever call site forgot, and "why did this come back on
 * sale" is the first question asked when a piece reappears unexpectedly.
 *
 * **Idempotent by guard.** The header transition is conditional on `status = 'active'`; zero
 * rows means someone already released it, and the counters are then LEFT ALONE — decrementing
 * twice is exactly how phantom-available stock is created.
 */
export async function releaseStock(
  tx: Tx,
  reservationId: string,
  reason: ReleaseReason,
): Promise<{ released: boolean }> {
  const header = await tx.$executeRaw`
    UPDATE reservations
       SET status = 'released', released_at = now(), release_reason = ${reason}, updated_at = now()
     WHERE id = ${reservationId}::uuid AND status = 'active'
  `;
  if (header === 0) return { released: false };

  const lines = await tx.$queryRaw<{ inventory_item_id: string; quantity: number }[]>`
    SELECT inventory_item_id::text AS inventory_item_id, quantity
      FROM reservation_lines WHERE reservation_id = ${reservationId}::uuid
  `;
  for (const line of lines) {
    await tx.$executeRaw`
      UPDATE inventory_items
         SET reserved_quantity = reserved_quantity - ${line.quantity},
             available_quantity = on_hand_quantity - (reserved_quantity - ${line.quantity}),
             version = version + 1,
             updated_at = now()
       WHERE id = ${line.inventory_item_id}::uuid
    `;
  }
  return { released: true };
}

/**
 * Commit a reservation on payment — 05 §1.6.
 *
 * Both counters move: `on_hand` and `reserved` are decremented, and one `sale` ledger row is
 * written per line. And for a one-of-a-kind piece, `products.sold_at` is stamped IN THE SAME
 * TRANSACTION — this is the only writer of that column outside an audited admin correction,
 * and it is what the `sold` band keys on. In the same transaction so a paid unique piece reads
 * SOLD on the next render, not thirty minutes later when a reservation lapses.
 */
export async function commitStock(
  actor: Actor,
  tx: Tx,
  reservationId: string,
  opts?: { orderId?: string },
): Promise<{ committed: boolean; soldOutOfAKind: string[] }> {
  const header = await tx.$executeRaw`
    UPDATE reservations
       SET status = 'committed', committed_at = now(), updated_at = now()
     WHERE id = ${reservationId}::uuid AND status = 'active'
  `;
  if (header === 0) return { committed: false, soldOutOfAKind: [] };

  const lines = await tx.$queryRaw<
    { inventory_item_id: string; variant_id: string; location_id: string; quantity: number }[]
  >`
    SELECT rl.inventory_item_id::text AS inventory_item_id, rl.variant_id::text AS variant_id,
           ii.location_id::text AS location_id, rl.quantity
      FROM reservation_lines rl
      JOIN inventory_items ii ON ii.id = rl.inventory_item_id
     WHERE rl.reservation_id = ${reservationId}::uuid
  `;

  const sold: string[] = [];
  for (const line of lines) {
    // Release the promise first, so the ledger's conditional UPDATE sees the right reserved
    // figure and `chk_inventory_no_oversell` holds at every intermediate step.
    await tx.$executeRaw`
      UPDATE inventory_items
         SET reserved_quantity = reserved_quantity - ${line.quantity},
             version = version + 1, updated_at = now()
       WHERE id = ${line.inventory_item_id}::uuid
    `;
    await writeInventoryTransaction(actor, tx, {
      inventoryItemId: line.inventory_item_id,
      variantId: line.variant_id,
      locationId: line.location_id,
      type: "sale",
      quantityDelta: -line.quantity,
      reservationId,
      orderId: opts?.orderId ?? null,
    });

    const stamped = await tx.$queryRaw<{ id: string }[]>`
      UPDATE products SET sold_at = now(), updated_at = now()
       WHERE id = (SELECT product_id FROM product_variants WHERE id = ${line.variant_id}::uuid)
         AND is_one_of_a_kind AND sold_at IS NULL
      RETURNING id::text AS id
    `;
    if (stamped[0]) sold.push(stamped[0].id);
  }

  return { committed: true, soldOutOfAKind: sold };
}

/**
 * Release every reservation past its expiry — `/api/cron/release-reservations`, every 5 min.
 *
 * Opens its own transaction. A route may not: `boundaries/dependencies` refuses
 * `app -> data`, and the reason is the same one that applies to every other service — a
 * route that owns a transaction is a route that decides isolation level, timeout and retry
 * policy, none of which belong in an HTTP handler.
 */
export async function releaseExpired(at: Date): Promise<{ released: number }> {
  return withTransaction((tx) => releaseExpiredIn(tx, at));
}

/** The transactional body, exported so `placeOrder` can compose it. */
export async function releaseExpiredIn(tx: Tx, at: Date): Promise<{ released: number }> {
  const expired = await tx.$queryRaw<{ id: string }[]>`
    SELECT id::text AS id FROM reservations
     WHERE status = 'active' AND expires_at < ${at}
     ORDER BY expires_at
     LIMIT 500
  `;
  let released = 0;
  for (const row of expired) {
    const result = await releaseStock(tx, row.id, "expired");
    if (result.released) released++;
  }
  return { released };
}
