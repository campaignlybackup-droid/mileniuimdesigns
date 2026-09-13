import "server-only";
import type { Tx } from "@/lib/db/transaction";
import { ValidationError } from "@/lib/errors";
import type { Actor } from "@/lib/rbac";

/**
 * The inventory ledger — 05 §1.4.
 *
 * `inventory_transactions` is append-only and is **the only thing permitted to change
 * `on_hand_quantity`**. There is no path in `src/lib/inventory/` that moves the counter
 * without writing the row in the same transaction, and
 * `tests/integration/inventory-ledger.test.ts` asserts
 * `SUM(quantity_delta) = on_hand_quantity` per item after a randomised sequence.
 *
 * `balance_before` is a GENERATED column, so the two ends of a movement cannot disagree.
 * Storing both independently invites exactly that.
 */

export type LedgerType =
  | "initial"
  | "receipt"
  | "adjustment"
  | "sale"
  | "return_restock"
  | "transfer_in"
  | "transfer_out"
  | "write_off"
  | "recount";

/**
 * The three types that exist to EXPLAIN a discrepancy, and therefore may not be written
 * without one. A `sale` is self-explanatory; an `adjustment` of −3 with no note is a number
 * nobody can account for at stocktake, and the person who wrote it will not remember.
 */
export const NOTE_REQUIRED: ReadonlySet<LedgerType> = new Set<LedgerType>([
  "adjustment",
  "write_off",
  "recount",
]);

export type LedgerEntry = {
  inventoryItemId: string;
  variantId: string;
  locationId: string;
  type: LedgerType;
  /** Signed, and never zero — `chk_inventory_tx_nonzero`. */
  quantityDelta: number;
  note?: string | null;
  orderId?: string | null;
  orderItemId?: string | null;
  returnId?: string | null;
  reservationId?: string | null;
};

/**
 * Move physical stock and record why, in one statement pair.
 *
 * The UPDATE is conditional on the result staying non-negative, so a movement that would
 * drive stock below zero writes NOTHING — neither the counter nor the ledger row — rather
 * than writing a ledger row for a movement that the CHECK then refuses.
 */
export async function writeInventoryTransaction(
  actor: Actor,
  tx: Tx,
  entry: LedgerEntry,
): Promise<{ balanceAfter: number }> {
  if (entry.quantityDelta === 0) {
    throw new ValidationError("A stock movement of zero is either a bug or a lie.");
  }
  if (NOTE_REQUIRED.has(entry.type) && !entry.note?.trim()) {
    throw new ValidationError(
      `A '${entry.type}' movement must carry a note. These three types exist to explain a discrepancy, and one without an explanation is a number nobody can account for at stocktake.`,
    );
  }

  const updated = await tx.$queryRaw<{ on_hand_quantity: number }[]>`
    UPDATE inventory_items
       SET on_hand_quantity = on_hand_quantity + ${entry.quantityDelta},
           available_quantity = on_hand_quantity + ${entry.quantityDelta} - reserved_quantity,
           version = version + 1,
           updated_at = now()
     WHERE id = ${entry.inventoryItemId}::uuid
       AND on_hand_quantity + ${entry.quantityDelta} >= 0
       AND on_hand_quantity + ${entry.quantityDelta} >= reserved_quantity
    RETURNING on_hand_quantity
  `;
  if (!updated[0]) {
    // Either the row is gone, or the movement would break `chk_inventory_no_oversell` /
    // `chk_inventory_on_hand_nonneg`. Refusing here means the ledger never records a
    // movement the counter did not make.
    throw new ValidationError(
      `That movement would leave stock negative or promised beyond what exists.`,
    );
  }
  const balanceAfter = updated[0].on_hand_quantity;

  await tx.$executeRaw`
    INSERT INTO inventory_transactions (id, inventory_item_id, variant_id, location_id, type,
                                        quantity_delta, balance_after, order_id, order_item_id,
                                        return_id, reservation_id, actor_type, actor_user_id,
                                        note, created_at)
    VALUES (gen_random_uuid(), ${entry.inventoryItemId}::uuid, ${entry.variantId}::uuid,
            ${entry.locationId}::uuid, ${entry.type}::inventory_transaction_type,
            ${entry.quantityDelta}, ${balanceAfter}, ${entry.orderId ?? null}::uuid,
            ${entry.orderItemId ?? null}::uuid, ${entry.returnId ?? null}::uuid,
            ${entry.reservationId ?? null}::uuid,
            ${actor.kind === "staff" ? "staff" : actor.kind}::actor_type,
            ${actor.kind === "staff" ? actor.userId : null}::uuid,
            ${entry.note ?? null}, now())
  `;

  return { balanceAfter };
}

/**
 * Create an inventory row AND its opening ledger entry, together.
 *
 * **An `inventory_items` row created without an `initial` movement is permanently divergent**
 * — `reconcile_inventory` will report it every night forever, because `on_hand_quantity` will
 * never equal `SUM(quantity_delta)`. Found by the reconciler's own baseline test, whose
 * fixture had inserted stock directly and which the reconciler duly flagged.
 *
 * That makes this the only supported way to bring stock into existence: a row with an opening
 * balance nobody recorded is indistinguishable, at stocktake, from stock that appeared through
 * a bug.
 */
export async function openInventoryItem(
  actor: Actor,
  tx: Tx,
  input: {
    variantId: string;
    locationId: string;
    isOneOfAKind: boolean;
    onHandQuantity: number;
    safetyStockQuantity?: number;
    note?: string;
  },
): Promise<{ inventoryItemId: string }> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO inventory_items (id, variant_id, is_one_of_a_kind, location_id, on_hand_quantity,
                                 reserved_quantity, available_quantity, incoming_quantity,
                                 safety_stock_quantity, version, created_at, updated_at)
    VALUES (gen_random_uuid(), ${input.variantId}::uuid, ${input.isOneOfAKind},
            ${input.locationId}::uuid, 0, 0, 0, 0, ${input.safetyStockQuantity ?? 0}, 1,
            now(), now())
    RETURNING id::text AS id
  `;
  const inventoryItemId = rows[0]!.id;

  // Zero opening stock is legitimate — a variant stocked at a location that has none yet —
  // and a zero movement is refused, so there is nothing to record.
  if (input.onHandQuantity !== 0) {
    await writeInventoryTransaction(actor, tx, {
      inventoryItemId,
      variantId: input.variantId,
      locationId: input.locationId,
      type: "initial",
      quantityDelta: input.onHandQuantity,
      note: input.note ?? null,
    });
  }
  return { inventoryItemId };
}
