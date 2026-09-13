import "server-only";

/**
 * **CAPABILITY AUTHORIZATION.** A guest shopper has no account and therefore no actor, so
 * `requirePermission()` has nothing to ask about. What authorizes a cart mutation is
 * possession of the cart token: it is 256 bits of CSPRNG output, only its SHA-256 hash is
 * stored, and every mutator here resolves the cart through `requireCart(tx, token)` before
 * touching a row. A caller holding no token can reach no cart; a caller holding one reaches
 * exactly that cart and no other — `updateItemQuantity` and `removeItem` additionally scope
 * their writes with `AND cart_id = ...` so a valid token for cart A cannot address a line of
 * cart B by id.
 *
 * This is NOT an exemption from server-side authorization. It is a different authority with
 * the same standard: checked on the server, on every call, before the write.
 * `tests/unit/services-authorized.test.ts` names each function this covers and asserts the
 * property, so neither this comment nor that list can drift alone.
 */
import { db } from "@/lib/db/client";
import { withTransaction, type Tx } from "@/lib/db/transaction";
import { MarketChangedError, ValidationError } from "@/lib/errors";
import { lineSubtotal, resolvePriceBatch } from "@/lib/pricing";
import { hashCartToken, mintCartToken } from "@/lib/cart/token";
import { applyRepairs, evaluateCart, type CartLine } from "@/lib/cart/revalidate";
import type { CartNotice } from "@/lib/cart/messages";

/**
 * The cart — 05 §2, 08 §1.3.
 *
 * **`getCart(token)` takes no market parameter, by construction.** A cart's market is
 * `carts.market_code` and nothing else. A `marketCode` argument here would be a second,
 * caller-supplied source for it, and the first caller that passed the URL segment instead of
 * the row would render a US-quoted bag under `/in/` — 145000 minor units displayed as
 * ₹1,450.00, an implicit conversion at a rate of 1.
 *
 * **And a `cartId` is never a lookup key.** Every entry point here takes a TOKEN or a customer
 * id. A request body carrying `{ cartId }` would be an IDOR: anyone who guessed or observed
 * another visitor's cart id could read their bag, change it, or empty it. The token is in an
 * `HttpOnly` cookie and only its hash is stored.
 */

export const CART_MAX_QUANTITY = 10;
export const CART_MAX_LINES = 40;

export type CartView = {
  id: string;
  marketCode: string;
  currencyCode: string;
  lines: {
    id: string;
    variantId: string;
    quantity: number;
    unitListMinor: bigint;
    unitFinalMinor: bigint;
    lineSubtotalMinor: bigint;
  }[];
  subtotalMinor: bigint;
  notices: CartNotice[];
};

type CartRow = { id: string; market_code: string; currency_code: string };

async function findByToken(tx: Tx, token: string): Promise<CartRow | null> {
  const rows = await tx.$queryRaw<CartRow[]>`
    SELECT id::text AS id, market_code, currency_code
      FROM carts
     WHERE token_hash = ${hashCartToken(token)} AND status = 'active'
  `;
  // A cookie whose hash matches nothing yields an empty cart and a fresh token. It never 500s
  // and never leaks whether a token ever existed.
  return rows[0] ?? null;
}

async function linesOf(tx: Tx, cartId: string): Promise<CartLine[]> {
  const rows = await tx.$queryRaw<
    {
      id: string;
      variant_id: string;
      quantity: number;
      unit_list_minor: bigint;
      unit_final_minor: bigint;
    }[]
  >`
    SELECT id::text AS id, variant_id::text AS variant_id, quantity,
           unit_list_minor, unit_final_minor
      FROM cart_items WHERE cart_id = ${cartId}::uuid ORDER BY created_at
  `;
  return rows.map((r) => ({
    id: r.id,
    variantId: r.variant_id,
    quantity: r.quantity,
    unitListMinor: BigInt(r.unit_list_minor),
    unitFinalMinor: BigInt(r.unit_final_minor),
  }));
}

function viewOf(cart: CartRow, lines: CartLine[], notices: CartNotice[]): CartView {
  const enriched = lines.map((l) => ({
    id: l.id,
    variantId: l.variantId,
    quantity: l.quantity,
    unitListMinor: l.unitListMinor,
    unitFinalMinor: l.unitFinalMinor,
    lineSubtotalMinor: lineSubtotal(l.unitFinalMinor, l.quantity),
  }));
  return {
    id: cart.id,
    marketCode: cart.market_code,
    currencyCode: cart.currency_code,
    lines: enriched,
    subtotalMinor: enriched.reduce((a, l) => a + l.lineSubtotalMinor, 0n),
    notices,
  };
}

/**
 * Read a cart, revalidating and repairing it.
 *
 * **This read WRITES**, and that is accepted (05 §2.4): a cart read that clamps a quantity
 * performs an UPDATE, so `GET /api/cart` mutates. The alternative is a cart that displays a
 * corrected figure and then submits the stale one. It is `no-store` and never cached, which is
 * also why `cached()` is lint-banned in this directory.
 */
export async function getCart(token: string): Promise<CartView | null> {
  return withTransaction(async (tx) => {
    const cart = await findByToken(tx, token);
    if (!cart) return null;

    const lines = await linesOf(tx, cart.id);
    const result = await evaluateCart(tx, { lines, marketCode: cart.market_code });
    await applyRepairs(tx, result.outcomes);

    const fresh = result.changed ? await linesOf(tx, cart.id) : lines;
    await tx.$executeRaw`
      UPDATE carts SET last_activity_at = now(), updated_at = now() WHERE id = ${cart.id}::uuid`;
    return viewOf(cart, fresh, result.notices);
  });
}

/** Create a cart and return its plaintext token ONCE. Only the hash is stored. */
export async function createCart(
  marketCode: string,
  opts?: { customerId?: string },
): Promise<{ token: string; cartId: string }> {
  const { token, hash } = mintCartToken();
  const cartId = await withTransaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO carts (id, token_hash, customer_id, market_code, currency_code, status,
                         last_activity_at, expires_at, version, created_at, updated_at)
      SELECT gen_random_uuid(), ${hash}, ${opts?.customerId ?? null}::uuid, m.code,
             m.currency_code, 'active', now(), now() + interval '90 days', 1, now(), now()
        FROM markets m WHERE m.code = ${marketCode} AND m.is_active
      RETURNING id::text AS id`;
    if (!rows[0]) throw new ValidationError(`No active market '${marketCode}'.`);
    return rows[0].id;
  });
  return { token, cartId };
}

export async function addItem(
  token: string,
  input: { variantId: string; quantity: number },
): Promise<CartView> {
  const quantity = Math.min(Math.max(Math.trunc(input.quantity), 1), CART_MAX_QUANTITY);

  return withTransaction(async (tx) => {
    const cart = await requireCart(tx, token);

    const existing = await tx.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM cart_items WHERE cart_id = ${cart.id}::uuid`;
    if ((existing[0]?.n ?? 0) >= CART_MAX_LINES) {
      throw new ValidationError(
        `A bag holds at most ${String(CART_MAX_LINES)} different items.`,
      );
    }

    // Priced HERE, server-side, from the cart's OWN market — never from anything the request
    // supplied. Hard rule 9: never trust a frontend price.
    const priced = await resolvePriceBatch(
      [{ variantId: input.variantId, marketCode: cart.market_code, quantity }],
      { client: tx },
    );
    const price = priced.get(input.variantId);
    if (!price) {
      throw new ValidationError("That piece is not sold in this market.");
    }

    // `uq_cart_items (cart_id, variant_id)` makes this an UPSERT rather than an append, which
    // is why adding the same piece twice raises the quantity instead of creating a second line.
    await tx.$executeRaw`
      INSERT INTO cart_items (id, cart_id, market_code, variant_id, quantity, unit_list_minor,
                              unit_final_minor, price_record_id, priced_at, created_at, updated_at)
      VALUES (gen_random_uuid(), ${cart.id}::uuid, ${cart.market_code}, ${input.variantId}::uuid,
              ${quantity}, ${price.unitListMinor}, ${price.unitFinalMinor},
              ${price.priceRecordId}::uuid, now(), now(), now())
      ON CONFLICT (cart_id, variant_id) DO UPDATE
        SET quantity = LEAST(cart_items.quantity + ${quantity}, ${CART_MAX_QUANTITY}),
            unit_list_minor = EXCLUDED.unit_list_minor,
            unit_final_minor = EXCLUDED.unit_final_minor,
            priced_at = now(), updated_at = now()`;

    return viewOf(cart, await linesOf(tx, cart.id), []);
  });
}

export async function updateItemQuantity(
  token: string,
  lineId: string,
  quantity: number,
): Promise<CartView> {
  return withTransaction(async (tx) => {
    const cart = await requireCart(tx, token);
    const n = Math.trunc(quantity);
    if (n <= 0) {
      await tx.$executeRaw`
        DELETE FROM cart_items WHERE id = ${lineId}::uuid AND cart_id = ${cart.id}::uuid`;
    } else {
      // `AND cart_id = …` is the authorisation, not a filter: without it a line id from
      // another visitor's bag would be updatable by anyone who had one.
      await tx.$executeRaw`
        UPDATE cart_items
           SET quantity = ${Math.min(n, CART_MAX_QUANTITY)}, updated_at = now()
         WHERE id = ${lineId}::uuid AND cart_id = ${cart.id}::uuid`;
    }
    return viewOf(cart, await linesOf(tx, cart.id), []);
  });
}

export async function removeItem(token: string, lineId: string): Promise<CartView> {
  return updateItemQuantity(token, lineId, 0);
}

/**
 * Switch a cart to another market — 05 §2.2, 02 §5.3. ONE transaction.
 *
 * **The statement order is forced by the schema and is not a style choice.** `cart_items` has
 * `FK (cart_id, market_code) → carts (id, market_code) ON UPDATE RESTRICT`, so
 * `UPDATE carts SET market_code = …` FAILS while any line exists. The obvious reading —
 * change the market, then re-price the lines — raises a foreign-key error on every switch,
 * which is the correct outcome but arrives as a 500 rather than a switch.
 *
 * So: delete the lines, move the cart, re-insert what survives at the NEW market's prices.
 * There is no conversion. A line with no price in the destination is dropped and reported.
 */
export async function switchMarket(
  token: string,
  toMarketCode: string,
): Promise<{ view: CartView; dropped: string[] }> {
  return withTransaction(async (tx) => {
    const cart = await requireCart(tx, token);
    if (cart.market_code === toMarketCode) {
      return { view: viewOf(cart, await linesOf(tx, cart.id), []), dropped: [] };
    }

    const market = await tx.$queryRaw<{ code: string; currency_code: string }[]>`
      SELECT code, currency_code FROM markets WHERE code = ${toMarketCode} AND is_active`;
    if (!market[0]) throw new MarketChangedError(`No active market '${toMarketCode}'.`);

    const lines = await linesOf(tx, cart.id);
    const repriced =
      lines.length === 0
        ? new Map()
        : await resolvePriceBatch(
            lines.map((l) => ({
              variantId: l.variantId,
              marketCode: toMarketCode,
              quantity: l.quantity,
            })),
            { client: tx },
          );

    // (a) lines out, (b) cart moved, (c) survivors back in — in that order, because the FK
    // says so.
    await tx.$executeRaw`DELETE FROM cart_items WHERE cart_id = ${cart.id}::uuid`;
    await tx.$executeRaw`
      UPDATE carts SET market_code = ${market[0].code}, currency_code = ${market[0].currency_code},
                       updated_at = now()
       WHERE id = ${cart.id}::uuid`;

    const dropped: string[] = [];
    for (const line of lines) {
      const price = repriced.get(line.variantId);
      if (!price) {
        dropped.push(line.variantId);
        continue;
      }
      await tx.$executeRaw`
        INSERT INTO cart_items (id, cart_id, market_code, variant_id, quantity, unit_list_minor,
                                unit_final_minor, price_record_id, priced_at, created_at, updated_at)
        VALUES (gen_random_uuid(), ${cart.id}::uuid, ${market[0]!.code}, ${line.variantId}::uuid,
                ${line.quantity}, ${price.unitListMinor}, ${price.unitFinalMinor},
                ${price.priceRecordId}::uuid, now(), now(), now())`;
    }

    const moved: CartRow = {
      id: cart.id,
      market_code: market[0].code,
      currency_code: market[0].currency_code,
    };
    const notices: CartNotice[] = [
      {
        key: "cart.market_changed",
        params: {
          currency: market[0].currency_code,
          n: dropped.length,
          market: market[0].code,
        },
        severity: "warning",
      },
    ];
    return { view: viewOf(moved, await linesOf(tx, cart.id), notices), dropped };
  });
}

async function requireCart(tx: Tx, token: string): Promise<CartRow> {
  const cart = await findByToken(tx, token);
  if (!cart) throw new ValidationError("That bag is no longer available.");
  return cart;
}

/** Exported for the drawer badge, which is client-rendered after hydration from a no-store
 *  endpoint so no cached HTML ever contains a cart. */
export async function getCartSummary(
  token: string,
): Promise<{ itemCount: number; subtotalMinor: bigint }> {
  // The rows, not a SUM. Summing in SQL restated the line-subtotal definition a third time,
  // in a language the typechecker does not read — so the header badge and the cart page could
  // disagree and nothing would catch it. A cart holds at most CART_MAX_LINES lines, so this
  // is a bounded read, and the two figures now come from one function by construction.
  const rows = await db.$queryRaw<{ quantity: number; unit_final_minor: bigint }[]>`
    SELECT ci.quantity, ci.unit_final_minor
      FROM cart_items ci
      JOIN carts c ON c.id = ci.cart_id
     WHERE c.token_hash = ${hashCartToken(token)} AND c.status = 'active'`;
  return {
    itemCount: rows.reduce((a, r) => a + r.quantity, 0),
    subtotalMinor: rows.reduce((a, r) => a + lineSubtotal(r.unit_final_minor, r.quantity), 0n),
  };
}

export { evaluateCart, applyRepairs } from "@/lib/cart/revalidate";
export type { CartLine, LineOutcome, RevalidateResult } from "@/lib/cart/revalidate";
export { CART_COOKIE, mintCartToken, hashCartToken } from "@/lib/cart/token";
export { CART_MESSAGE_DEFAULTS, CART_MESSAGE_KEYS } from "@/lib/cart/messages";
export type { CartNotice, CartMessageKey } from "@/lib/cart/messages";
