import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { addItem, createCart, CART_MAX_QUANTITY } from "@/lib/cart";
import { mergeCartsOnLogin } from "@/lib/cart/merge";

/**
 * Commissioned by 09 P20 criterion (c) and 05 §2.2.
 *
 * **Merging is an UPSERT, never an append.** `uq_cart_items (cart_id, variant_id)` plus
 * `ON CONFLICT … DO UPDATE` is what makes two tabs and one sign-in not double the bag. An
 * append would be invisible until the customer noticed they were about to buy two.
 *
 * The cross-market case is here because 05 §2.2 puts it here explicitly. Criterion (b), the
 * market SWITCH, lives in `market-switch-cart.spec.ts`.
 */

const stamp = Date.now();
const prefix = `zz-p20m-${String(stamp)}`;
let customerId = "";
let bothMarkets: { code: string; currency: string }[] = [];
/** Priced in BOTH markets. */
let sharedVariant = "";
/** Priced in the FIRST market only — the line a switch must drop. */
let homeOnlyVariant = "";
let productIds: string[] = [];

async function makePriced(
  slug: string,
  markets: { code: string; currency: string }[],
): Promise<string> {
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
    VALUES (gen_random_uuid(), ${p[0]!.id}::uuid, ${`MD-ZZG-ZZG-${slug.slice(-4).toUpperCase()}-NA`},
            0, 'untracked', '', true, 1, now(), now())
    RETURNING id::text AS id`;
  for (const m of markets) {
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
  bothMarkets = ms.map((m) => ({ code: m.code, currency: m.currency_code }));
  expect(bothMarkets).toHaveLength(2);

  const g = await db.$queryRaw<{ id: string }[]>`
    SELECT id::text AS id FROM customer_groups ORDER BY created_at LIMIT 1`;
  const c = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO customers (id, email, customer_group_id, accepts_marketing, created_at, updated_at)
    VALUES (gen_random_uuid(), ${`${prefix}@example.invalid`}, ${g[0]!.id}::uuid, false, now(), now())
    RETURNING id::text AS id`;
  customerId = c[0]!.id;

  sharedVariant = await makePriced(`${prefix}-shared`, bothMarkets);
  homeOnlyVariant = await makePriced(`${prefix}-home`, [bothMarkets[0]!]);
});

afterAll(async () => {
  await db.$executeRaw`DELETE FROM cart_items WHERE cart_id IN (SELECT id FROM carts WHERE customer_id = ${customerId}::uuid)`;
  await db.$executeRaw`DELETE FROM carts WHERE customer_id = ${customerId}::uuid OR customer_id IS NULL AND market_code IS NOT NULL AND id IN (SELECT cart_id FROM cart_items)`;
  await db.$executeRaw`DELETE FROM cart_items WHERE variant_id IN (SELECT id FROM product_variants WHERE product_id = ANY(${productIds}::uuid[]))`;
  await db.$executeRaw`DELETE FROM carts WHERE token_hash IN (SELECT token_hash FROM carts WHERE customer_id IS NULL) AND id NOT IN (SELECT cart_id FROM cart_items)`;
  await db.$executeRaw`DELETE FROM prices WHERE product_id = ANY(${productIds}::uuid[])`;
  await db.$executeRaw`DELETE FROM products WHERE slug LIKE ${`${prefix}%`}`;
  await db.$executeRaw`DELETE FROM customers WHERE email = ${`${prefix}@example.invalid`}`;
  productIds = [];
});

beforeEach(async () => {
  await db.$executeRaw`
    DELETE FROM cart_items WHERE cart_id IN
      (SELECT id FROM carts WHERE customer_id = ${customerId}::uuid)`;
  await db.$executeRaw`DELETE FROM carts WHERE customer_id = ${customerId}::uuid`;
});

const linesOf = async (cartId: string) =>
  db.$queryRaw<
    { variant_id: string; quantity: number; unit_final_minor: bigint; market_code: string }[]
  >`
    SELECT variant_id::text AS variant_id, quantity, unit_final_minor, market_code
      FROM cart_items WHERE cart_id = ${cartId}::uuid ORDER BY created_at`;

describe("(c) merging is an upsert, never an append", () => {
  it("combines quantities for the same variant instead of adding a second line", async () => {
    // Two tabs, one sign-in. An append here is the bug that is invisible until the customer
    // notices they are about to buy two of something.
    const guest = await createCart(bothMarkets[0]!.code);
    await addItem(guest.token, { variantId: sharedVariant, quantity: 2 });

    const target = await createCart(bothMarkets[0]!.code, { customerId });
    await addItem(target.token, { variantId: sharedVariant, quantity: 1 });

    const result = await mergeCartsOnLogin(guest.cartId, customerId);
    expect(result.cartId).toBe(target.cartId);

    const lines = await linesOf(target.cartId);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.quantity).toBe(3);
  });

  it("caps the combined quantity rather than exceeding the maximum", async () => {
    const guest = await createCart(bothMarkets[0]!.code);
    await addItem(guest.token, { variantId: sharedVariant, quantity: CART_MAX_QUANTITY });
    const target = await createCart(bothMarkets[0]!.code, { customerId });
    await addItem(target.token, { variantId: sharedVariant, quantity: CART_MAX_QUANTITY });

    await mergeCartsOnLogin(guest.cartId, customerId);
    expect((await linesOf(target.cartId))[0]!.quantity).toBe(CART_MAX_QUANTITY);
  });

  it("CLAIMS the guest cart when the customer has none — no line churn", async () => {
    // The cheapest correct path, and the one that keeps the bag the shopper was looking at.
    const guest = await createCart(bothMarkets[0]!.code);
    await addItem(guest.token, { variantId: sharedVariant, quantity: 2 });

    const result = await mergeCartsOnLogin(guest.cartId, customerId);
    expect(result.claimed).toBe(true);
    expect(result.cartId).toBe(guest.cartId);

    const owner = await db.$queryRaw<{ customer_id: string | null; status: string }[]>`
      SELECT customer_id::text AS customer_id, status::text AS status FROM carts WHERE id = ${guest.cartId}::uuid`;
    expect(owner[0]!.customer_id).toBe(customerId);
    expect(owner[0]!.status).toBe("active");
  });

  it("re-quotes every surviving line at the CUSTOMER's prices", async () => {
    const guest = await createCart(bothMarkets[0]!.code);
    await addItem(guest.token, { variantId: sharedVariant, quantity: 1 });
    const target = await createCart(bothMarkets[0]!.code, { customerId });
    await addItem(target.token, { variantId: sharedVariant, quantity: 1 });

    // The guest's line carries a stale figure. The merge must not trust it.
    await db.$executeRaw`
      UPDATE cart_items SET unit_final_minor = 1 WHERE cart_id = ${guest.cartId}::uuid`;

    await mergeCartsOnLogin(guest.cartId, customerId);
    const lines = await linesOf(target.cartId);
    expect(lines[0]!.unit_final_minor).toBe(24800n);
  });

  it("leaves the guest cart merged and empty, not lingering as active", async () => {
    const guest = await createCart(bothMarkets[0]!.code);
    await addItem(guest.token, { variantId: sharedVariant, quantity: 1 });
    const target = await createCart(bothMarkets[0]!.code, { customerId });
    await addItem(target.token, { variantId: sharedVariant, quantity: 1 });

    await mergeCartsOnLogin(guest.cartId, customerId);
    const rows = await db.$queryRaw<{ status: string; merged_into_cart_id: string | null }[]>`
      SELECT status::text AS status, merged_into_cart_id::text AS merged_into_cart_id
        FROM carts WHERE id = ${guest.cartId}::uuid`;
    expect(rows[0]!.status).toBe("merged");
    expect(rows[0]!.merged_into_cart_id).toBe(target.cartId);
  });
});

describe("the GUEST market wins a cross-market merge", () => {
  it("moves the customer cart and drops what is not sold there", async () => {
    // The guest is browsing market B right now; that is the market they mean. The saved cart
    // is NOT translated — there is no conversion — and what cannot follow is reported.
    const [home, away] = bothMarkets;
    const guest = await createCart(away!.code);
    await addItem(guest.token, { variantId: sharedVariant, quantity: 1 });

    const target = await createCart(home!.code, { customerId });
    await addItem(target.token, { variantId: homeOnlyVariant, quantity: 1 });

    const result = await mergeCartsOnLogin(guest.cartId, customerId);
    expect(result.notices[0]!.key).toBe("cart.market_changed");

    const lines = await linesOf(target.cartId);
    // The home-only line is gone; the shared one survived, in the guest's market.
    expect(lines).toHaveLength(1);
    expect(lines[0]!.variant_id).toBe(sharedVariant);
    expect(lines[0]!.market_code).toBe(away!.code);

    const cart = await db.$queryRaw<{ market_code: string; currency_code: string }[]>`
      SELECT market_code, currency_code FROM carts WHERE id = ${target.cartId}::uuid`;
    expect(cart[0]!.market_code).toBe(away!.code);
    expect(cart[0]!.currency_code).toBe(away!.currency);
  });
});
