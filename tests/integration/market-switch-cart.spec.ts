import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { addItem, createCart, switchMarket } from "@/lib/cart";

/**
 * Commissioned by 09 P20 criterion (b): *a market switch deletes and re-prices every line in
 * one transaction and reports the drops.*
 *
 * **Named `.spec.ts` deliberately.** 09 §1 keeps the `.spec.ts` names commissioned in 03-08
 * inside the Vitest trees and makes the RUNNER accommodate them. The conventional
 * `*.test.ts`-only glob shipped at P02 regardless, and was still in `vitest.config.mts` when
 * this file was written at P20 — so this file would have existed, looked green in the plan,
 * and been collected by nothing. `tests/unit/test-collection.test.ts` now fails if that
 * regresses. This is the test 09 describes as "the single test that stops an INR line
 * surviving into a USD bag"; a version of it that never runs is worse than none, because the
 * plan records it as covered.
 *
 * **Statement order is forced by the schema, not chosen.** `cart_items` carries
 * `FK (cart_id, market_code) -> carts (id, market_code) ON UPDATE RESTRICT`, so moving the
 * cart while its lines still exist raises a foreign-key error. Lines out, cart moved,
 * survivors re-priced back in — the database refuses any other order.
 */

const prefix = `zz-p20s-${String(Date.now())}`;
let markets: { code: string; currency: string }[] = [];
/** Priced in BOTH markets. */
let shared = "";
/** Priced in the FIRST market only — the line a switch must drop. */
let homeOnly = "";
let productIds: string[] = [];
let cartIds: string[] = [];

async function makePriced(slug: string, on: { code: string; currency: string }[]) {
  const p = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO products (id, slug, title, status, published_at, rank, search_text, version,
                          created_at, updated_at)
    VALUES (gen_random_uuid(), ${slug}, ${slug}, 'active', now() - interval '1 hour', 0, '', 1,
            now(), now())
    RETURNING id::text AS id`;
  productIds.push(p[0]!.id);
  const v = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO product_variants (id, product_id, sku, position, inventory_policy,
                                  option_signature, is_active, version, created_at, updated_at)
    VALUES (gen_random_uuid(), ${p[0]!.id}::uuid, ${`MD-ZZS-ZZS-${slug.slice(-4).toUpperCase()}-NA`},
            0, 'untracked', '', true, 1, now(), now())
    RETURNING id::text AS id`;
  for (const m of on) {
    await db.$executeRaw`
      INSERT INTO prices (id, product_id, variant_id, market_code, currency_code, list_minor,
                          price_source, valid_from, created_at)
      VALUES (gen_random_uuid(), ${p[0]!.id}::uuid, ${v[0]!.id}::uuid, ${m.code}, ${m.currency},
              24800, 'manual', now() - interval '1 hour', now())`;
  }
  return v[0]!.id;
}

beforeAll(async () => {
  const ms = await db.$queryRaw<{ code: string; currency_code: string }[]>`
    SELECT code, currency_code FROM markets WHERE is_active ORDER BY rank LIMIT 2`;
  markets = ms.map((m) => ({ code: m.code, currency: m.currency_code }));
  expect(markets, "this phase needs two active markets").toHaveLength(2);
  shared = await makePriced(`${prefix}-shared`, markets);
  homeOnly = await makePriced(`${prefix}-home`, [markets[0]!]);
});

// In afterAll, NOT at the end of a test body: a body-tail cleanup does not run when the test
// throws, which is how three `ZZ MTO` products leaked at P19.
afterAll(async () => {
  if (cartIds.length > 0) {
    await db.$executeRaw`DELETE FROM cart_items WHERE cart_id = ANY(${cartIds}::uuid[])`;
    await db.$executeRaw`DELETE FROM carts WHERE id = ANY(${cartIds}::uuid[])`;
  }
  await db.$executeRaw`DELETE FROM prices WHERE product_id = ANY(${productIds}::uuid[])`;
  await db.$executeRaw`DELETE FROM product_variants WHERE product_id = ANY(${productIds}::uuid[])`;
  await db.$executeRaw`DELETE FROM products WHERE slug LIKE ${`${prefix}%`}`;
  productIds = [];
  cartIds = [];
});

async function cartWith(marketCode: string, variantIds: string[]) {
  const cart = await createCart(marketCode);
  cartIds.push(cart.cartId);
  for (const v of variantIds) await addItem(cart.token, { variantId: v, quantity: 1 });
  return cart;
}

describe("a market switch re-prices in one transaction and reports the drops", () => {
  it("keeps what is sold in the destination and drops what is not", async () => {
    const [home, away] = markets;
    const cart = await cartWith(home!.code, [shared, homeOnly]);

    const { view, dropped } = await switchMarket(cart.token, away!.code);

    expect(dropped).toEqual([homeOnly]);
    expect(view.marketCode).toBe(away!.code);
    expect(view.currencyCode).toBe(away!.currency);
    expect(view.lines).toHaveLength(1);
    expect(view.lines[0]!.variantId).toBe(shared);
  });

  it("SAYS a line was dropped — a piece vanishing silently is the bug", async () => {
    const [home, away] = markets;
    const cart = await cartWith(home!.code, [shared, homeOnly]);
    const { view } = await switchMarket(cart.token, away!.code);
    expect(view.notices[0]!.key).toBe("cart.market_changed");
    expect(view.notices[0]!.params["n"]).toBe(1);
    expect(view.notices[0]!.params["currency"]).toBe(away!.currency);
  });

  it("re-prices at the DESTINATION market's own figure, never converted", async () => {
    // Both markets price this piece at 24800 minor units, and that is the point: those are
    // different amounts of money. The cart must carry the destination's own number rather
    // than anything derived from the origin's. 04 §1 forbids conversion outright.
    const [home, away] = markets;
    const cart = await cartWith(home!.code, [shared]);
    const { view } = await switchMarket(cart.token, away!.code);
    expect(view.lines[0]!.unitFinalMinor).toBe(24800n);
    expect(view.currencyCode).toBe(away!.currency);
  });

  it("moves the cart row itself, so a later read is in the new market", async () => {
    const [home, away] = markets;
    const cart = await cartWith(home!.code, [shared]);
    await switchMarket(cart.token, away!.code);
    const row = await db.$queryRaw<{ market_code: string; currency_code: string }[]>`
      SELECT market_code, currency_code FROM carts WHERE id = ${cart.cartId}::uuid`;
    expect(row[0]!.market_code).toBe(away!.code);
    expect(row[0]!.currency_code).toBe(away!.currency);
    // And every surviving LINE moved with it — the composite FK would have refused otherwise.
    const lines = await db.$queryRaw<{ market_code: string }[]>`
      SELECT market_code FROM cart_items WHERE cart_id = ${cart.cartId}::uuid`;
    expect(lines.every((l) => l.market_code === away!.code)).toBe(true);
  });

  it("is a no-op when the market has not changed", async () => {
    const cart = await cartWith(markets[0]!.code, [shared]);
    const { dropped, view } = await switchMarket(cart.token, markets[0]!.code);
    expect(dropped).toEqual([]);
    expect(view.lines).toHaveLength(1);
  });

  it("refuses a market that is not active, and changes nothing", async () => {
    const cart = await cartWith(markets[0]!.code, [shared]);
    await expect(switchMarket(cart.token, "ZZ")).rejects.toThrow();
    const row = await db.$queryRaw<{ market_code: string }[]>`
      SELECT market_code FROM carts WHERE id = ${cart.cartId}::uuid`;
    expect(row[0]!.market_code).toBe(markets[0]!.code);
  });
});
