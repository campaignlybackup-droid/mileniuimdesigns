import "server-only";
import { withTransaction, type Tx } from "@/lib/db/transaction";
import { resolvePriceBatch } from "@/lib/pricing";
import { CART_MAX_QUANTITY } from "@/lib/cart";
import type { CartNotice } from "@/lib/cart/messages";

/**
 * Merge a guest cart into a customer's on sign-in — 05 §2.2. ONE transaction.
 *
 * **The upsert is the whole point.** `uq_cart_items (cart_id, variant_id)` plus
 * `ON CONFLICT … DO UPDATE` is what makes this a merge rather than an append — which is why
 * two tabs and one sign-in do not double the bag. An append would be invisible until the
 * customer noticed they were about to buy two of something.
 */

export type MergeResult = {
  cartId: string;
  claimed: boolean;
  droppedVariantIds: string[];
  notices: CartNotice[];
};

export async function mergeCartsOnLogin(
  guestCartId: string,
  customerId: string,
): Promise<MergeResult> {
  return withTransaction(async (tx) => {
    // Both rows, in ascending id order. Two sign-ins racing on the same pair would otherwise
    // be a deadlock, and the ordering is what makes them take turns instead.
    const carts = await tx.$queryRaw<
      { id: string; customer_id: string | null; market_code: string; currency_code: string }[]
    >`
      SELECT id::text AS id, customer_id::text AS customer_id, market_code, currency_code
        FROM carts
       WHERE (id = ${guestCartId}::uuid OR (customer_id = ${customerId}::uuid AND status = 'active'))
         AND status = 'active'
       ORDER BY id
         FOR UPDATE
    `;

    const guest = carts.find((c) => c.id === guestCartId);
    const target = carts.find((c) => c.id !== guestCartId && c.customer_id === customerId);
    if (!guest) {
      // Nothing to merge. Not an error: the guest cart may have expired between the click and
      // the callback, and a sign-in that 500s because a bag lapsed is worse than a sign-in.
      return { cartId: target?.id ?? "", claimed: false, droppedVariantIds: [], notices: [] };
    }

    // No customer cart: CLAIM the guest cart. No line churn, no re-quote, nothing to drop —
    // the shopper keeps exactly the bag they were looking at.
    if (!target) {
      await tx.$executeRaw`
        UPDATE carts SET customer_id = ${customerId}::uuid, updated_at = now()
         WHERE id = ${guest.id}::uuid`;
      return { cartId: guest.id, claimed: true, droppedVariantIds: [], notices: [] };
    }

    const crossMarket = guest.market_code !== target.market_code;
    const guestLines = await tx.$queryRaw<{ variant_id: string; quantity: number }[]>`
      SELECT variant_id::text AS variant_id, quantity
        FROM cart_items WHERE cart_id = ${guest.id}::uuid`;

    if (crossMarket) {
      // **The GUEST cart's market wins**, because it is the market the shopper is browsing
      // right now. The saved cart is not translated — there is no conversion (hard rule 2) —
      // its lines are dropped and reported.
      //
      // The statement order is forced by the schema: `cart_items` has
      // `FK (cart_id, market_code) → carts (id, market_code) ON UPDATE RESTRICT`, so moving
      // the cart while lines exist raises a foreign-key error. Lines out, cart moved, guest
      // lines in.
      await tx.$executeRaw`DELETE FROM cart_items WHERE cart_id = ${target.id}::uuid`;
      await tx.$executeRaw`
        UPDATE carts SET market_code = ${guest.market_code}, currency_code = ${guest.currency_code},
                         updated_at = now()
         WHERE id = ${target.id}::uuid`;
    }

    const marketCode = crossMarket ? guest.market_code : target.market_code;
    const dropped: string[] = [];

    for (const line of guestLines) {
      await tx.$executeRaw`
        INSERT INTO cart_items (id, cart_id, market_code, variant_id, quantity, unit_list_minor,
                                unit_final_minor, priced_at, created_at, updated_at)
        VALUES (gen_random_uuid(), ${target.id}::uuid, ${marketCode}, ${line.variant_id}::uuid,
                ${line.quantity}, 0, 0, now(), now(), now())
        ON CONFLICT (cart_id, variant_id) DO UPDATE
          SET quantity = LEAST(cart_items.quantity + EXCLUDED.quantity, ${CART_MAX_QUANTITY}),
              updated_at = now()`;
    }

    // Step 5 — EVERY surviving line is re-quoted before the transaction commits, so the
    // amounts are the customer's prices, not the guest's. Inserting at zero above and
    // repricing here is deliberate: the upsert has to happen first to combine quantities, and
    // the price depends on the combined quantity.
    const merged = await tx.$queryRaw<{ id: string; variant_id: string; quantity: number }[]>`
      SELECT id::text AS id, variant_id::text AS variant_id, quantity
        FROM cart_items WHERE cart_id = ${target.id}::uuid`;

    if (merged.length > 0) {
      const prices = await resolvePriceBatch(
        merged.map((m) => ({ variantId: m.variant_id, marketCode, quantity: m.quantity })),
        { customerId, client: tx },
      );
      for (const line of merged) {
        const price = prices.get(line.variant_id);
        if (!price) {
          dropped.push(line.variant_id);
          await tx.$executeRaw`DELETE FROM cart_items WHERE id = ${line.id}::uuid`;
          continue;
        }
        await tx.$executeRaw`
          UPDATE cart_items
             SET unit_list_minor = ${price.unitListMinor},
                 unit_final_minor = ${price.unitFinalMinor},
                 price_record_id = ${price.priceRecordId}::uuid,
                 priced_at = now(), updated_at = now()
           WHERE id = ${line.id}::uuid`;
      }
    }

    await markMerged(tx, guest.id, target.id);

    const notices: CartNotice[] = crossMarket
      ? [
          {
            key: "cart.market_changed",
            params: { currency: guest.currency_code, n: dropped.length, market: marketCode },
            severity: "warning",
          },
        ]
      : [];

    return { cartId: target.id, claimed: false, droppedVariantIds: dropped, notices };
  });
}

async function markMerged(tx: Tx, guestCartId: string, intoCartId: string): Promise<void> {
  await tx.$executeRaw`DELETE FROM cart_items WHERE cart_id = ${guestCartId}::uuid`;
  await tx.$executeRaw`
    UPDATE carts SET status = 'merged', merged_into_cart_id = ${intoCartId}::uuid, updated_at = now()
     WHERE id = ${guestCartId}::uuid`;
}
