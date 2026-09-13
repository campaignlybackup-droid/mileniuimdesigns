import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { db } from "@/lib/db/client";
import { withTransaction } from "@/lib/db/transaction";
import { addItem, createCart, getCart, evaluateCart, CART_MAX_QUANTITY } from "@/lib/cart";
import { openInventoryItem } from "@/lib/inventory";
import { permissionsForRoles, type StaffActor } from "@/lib/rbac";
import { codeOf } from "../support/source";

/**
 * Commissioned by 09 P20 criteria (a) and (d), and 05 §2.4.
 *
 * The revalidation pass runs on EVERY cart read and again at checkout. At read time it repairs
 * and reports; at checkout time it stops. A bag that changes under a customer's finger between
 * "Review" and "Pay" must be looked at again, not quietly corrected and charged.
 */

const stamp = Date.now();
const prefix = `zz-p20r-${String(stamp)}`;
let actor: StaffActor;
let productId = "";
let variantId = "";
let marketCode = "";
let token = "";
let cartId = "";

beforeAll(async () => {
  const u = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO users (id, email, password_hash, first_name, last_name, is_active,
                       totp_recovery_codes, password_changed_at, created_at, updated_at)
    VALUES (gen_random_uuid(), ${`${prefix}@example.invalid`}, 'x', 'ZZ', 'P20', true,
            ARRAY[]::text[], now(), now(), now())
    RETURNING id::text AS id`;
  actor = {
    kind: "staff",
    userId: u[0]!.id,
    roles: ["owner"],
    permissions: permissionsForRoles(["owner"]),
    totpVerifiedAt: new Date(),
  };

  const m = await db.$queryRaw<{ code: string; currency_code: string }[]>`
    SELECT code, currency_code FROM markets WHERE is_active ORDER BY rank LIMIT 1`;
  marketCode = m[0]!.code;

  const p = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO products (id, slug, title, status, published_at, rank, search_text, version,
                          created_at, updated_at)
    VALUES (gen_random_uuid(), ${prefix}, 'ZZ P20 RING', 'active', now() - interval '1 hour',
            0, '', 1, now(), now())
    RETURNING id::text AS id`;
  productId = p[0]!.id;

  const v = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO product_variants (id, product_id, sku, position, inventory_policy,
                                  option_signature, is_active, version, created_at, updated_at)
    VALUES (gen_random_uuid(), ${productId}::uuid, ${`MD-ZZP-ZZP-P20${String(stamp).slice(-1)}-NA`},
            0, 'tracked', '', true, 1, now(), now())
    RETURNING id::text AS id`;
  variantId = v[0]!.id;

  await db.$executeRaw`
    INSERT INTO prices (id, product_id, variant_id, market_code, currency_code, list_minor,
                        price_source, valid_from, created_at)
    VALUES (gen_random_uuid(), ${productId}::uuid, ${variantId}::uuid, ${marketCode},
            ${m[0]!.currency_code}, 24800, 'manual', now() - interval '1 hour', now())`;

  const loc = await db.$queryRaw<{ id: string }[]>`
    SELECT id::text AS id FROM inventory_locations WHERE is_fulfillable ORDER BY rank LIMIT 1`;
  await withTransaction((tx) =>
    openInventoryItem(actor, tx, {
      variantId,
      locationId: loc[0]!.id,
      isOneOfAKind: false,
      onHandQuantity: 5,
    }),
  );
});

afterAll(async () => {
  await db.$executeRaw`DELETE FROM cart_items WHERE variant_id = ${variantId}::uuid`;
  await db.$executeRaw`DELETE FROM carts WHERE id = ${cartId}::uuid`;
  await db.$executeRaw`DELETE FROM inventory_transactions WHERE variant_id = ${variantId}::uuid`;
  await db.$executeRaw`DELETE FROM inventory_items WHERE variant_id = ${variantId}::uuid`;
  await db.$executeRaw`DELETE FROM prices WHERE product_id = ${productId}::uuid`;
  await db.$executeRaw`DELETE FROM products WHERE slug LIKE ${`${prefix}%`}`;
  await db.$executeRaw`DELETE FROM users WHERE email = ${`${prefix}@example.invalid`}`;
});

beforeEach(async () => {
  await db.$executeRaw`DELETE FROM cart_items WHERE variant_id = ${variantId}::uuid`;
  if (cartId) await db.$executeRaw`DELETE FROM carts WHERE id = ${cartId}::uuid`;
  await db.$executeRaw`UPDATE products SET status = 'active', deleted_at = NULL WHERE id = ${productId}::uuid`;
  await db.$executeRaw`UPDATE product_variants SET is_active = true, deleted_at = NULL WHERE id = ${variantId}::uuid`;
  await db.$executeRaw`UPDATE prices SET valid_to = NULL, list_minor = 24800 WHERE product_id = ${productId}::uuid`;
  await db.$executeRaw`UPDATE inventory_items SET on_hand_quantity = 5, reserved_quantity = 0, available_quantity = 5 WHERE variant_id = ${variantId}::uuid`;
  const created = await createCart(marketCode);
  token = created.token;
  cartId = created.cartId;
  await addItem(token, { variantId, quantity: 2 });
});

const lines = async (): Promise<
  {
    id: string;
    variantId: string;
    quantity: number;
    unitListMinor: bigint;
    unitFinalMinor: bigint;
  }[]
> => {
  const rows = await db.$queryRaw<
    {
      id: string;
      variant_id: string;
      quantity: number;
      unit_list_minor: bigint;
      unit_final_minor: bigint;
    }[]
  >`
    SELECT id::text AS id, variant_id::text AS variant_id, quantity, unit_list_minor, unit_final_minor
      FROM cart_items WHERE cart_id = ${cartId}::uuid`;
  return rows.map((r) => ({
    id: r.id,
    variantId: r.variant_id,
    quantity: r.quantity,
    unitListMinor: BigInt(r.unit_list_minor),
    unitFinalMinor: BigInt(r.unit_final_minor),
  }));
};

describe("the ten revalidation rows", () => {
  it("1 — a price change is detected with ZERO tolerance and the line re-quoted", async () => {
    await db.$executeRaw`
      UPDATE prices SET list_minor = 25900 WHERE product_id = ${productId}::uuid AND valid_to IS NULL`;
    const view = await getCart(token);
    expect(view!.notices.map((n) => n.key)).toContain("cart.line.price_changed");
    expect(view!.lines[0]!.unitListMinor).toBe(25900n);
  });

  it("2 — an unpublished product removes the line", async () => {
    await db.$executeRaw`UPDATE products SET status = 'archived' WHERE id = ${productId}::uuid`;
    const view = await getCart(token);
    expect(view!.lines).toHaveLength(0);
    expect(view!.notices[0]!.key).toBe("cart.line.unavailable");
  });

  it("3 — a deleted variant says CHOOSE ANOTHER OPTION, not `unavailable`", async () => {
    // Different copy on purpose: the shopper's next action differs. One is gone; the other
    // has another option to pick.
    await db.$executeRaw`UPDATE product_variants SET deleted_at = now() WHERE id = ${variantId}::uuid`;
    const view = await getCart(token);
    expect(view!.notices[0]!.key).toBe("cart.line.variant_gone");
  });

  it("4 — a piece with no price HERE says `not sold here`, not `unavailable`", async () => {
    // The piece exists and is published; it is simply not sold in this market. Saying
    // "unavailable" would imply it was withdrawn.
    await db.$executeRaw`UPDATE prices SET valid_to = now() WHERE product_id = ${productId}::uuid`;
    const view = await getCart(token);
    expect(view!.notices[0]!.key).toBe("cart.line.not_sold_here");
    expect(view!.lines).toHaveLength(0);
  });

  it("6 — a partial shortfall CLAMPS the quantity and says so", async () => {
    await db.$executeRaw`
      UPDATE inventory_items SET on_hand_quantity = 1, available_quantity = 1
       WHERE variant_id = ${variantId}::uuid`;
    const view = await getCart(token);
    expect(view!.lines[0]!.quantity).toBe(1);
    expect(view!.notices[0]!.key).toBe("cart.line.quantity_reduced");
    expect(view!.notices[0]!.params["n"]).toBe(1);
  });

  it("7 — zero available removes the line", async () => {
    await db.$executeRaw`
      UPDATE inventory_items SET on_hand_quantity = 0, available_quantity = 0
       WHERE variant_id = ${variantId}::uuid`;
    const view = await getCart(token);
    expect(view!.lines).toHaveLength(0);
    expect(view!.notices[0]!.key).toBe("cart.line.sold_out");
  });

  it("8 — a one-of-a-kind piece gets its OWN sentence", async () => {
    // "has just sold and has been removed" reads as a stock problem; "is one of a kind and
    // has just been sold" reads as what it is.
    await db.$executeRaw`
      UPDATE products SET is_one_of_a_kind = true, sold_at = now() WHERE id = ${productId}::uuid`;
    await db.$executeRaw`
      UPDATE inventory_items SET on_hand_quantity = 0, available_quantity = 0
       WHERE variant_id = ${variantId}::uuid`;
    const view = await getCart(token);
    expect(view!.notices[0]!.key).toBe("cart.line.ooak_sold");
    await db.$executeRaw`
      UPDATE products SET is_one_of_a_kind = false, sold_at = NULL WHERE id = ${productId}::uuid`;
  });

  it("reports nothing when nothing changed", async () => {
    // The baseline. A pass that reported on every read would make every notice meaningless.
    const view = await getCart(token);
    expect(view!.notices).toEqual([]);
    expect(view!.lines[0]!.quantity).toBe(2);
  });
});

describe("read-time repairs, checkout-time refusal", () => {
  it("evaluateCart is side-effect free — it decides, the caller applies", async () => {
    // Keeping the decision separate from the write is what lets both modes share one
    // implementation, and what stops a checkout-time path repairing because it reused the
    // read-time function.
    await db.$executeRaw`
      UPDATE inventory_items SET on_hand_quantity = 1, available_quantity = 1
       WHERE variant_id = ${variantId}::uuid`;
    const before = await lines();
    const result = await withTransaction((tx) =>
      evaluateCart(tx, { lines: before, marketCode }),
    );
    expect(result.changed).toBe(true);
    // Nothing was written.
    expect((await lines())[0]!.quantity).toBe(before[0]!.quantity);
  });
});

describe("(a) a cart read never returns a cached price", () => {
  it("src/lib/cart imports no cache helper", async () => {
    // The lint rule is the gate; this asserts the property directly, because a rule can be
    // disabled inline and a test cannot be disabled invisibly.
    const { sourceFiles } = await import("../support/source");
    for (const file of sourceFiles("src/lib/cart")) {
      const src = codeOf(file);
      expect(src, `${file} caches`).not.toMatch(/from "react"[\s\S]{0,40}cache/);
      expect(src, `${file} caches`).not.toContain("unstable_cache");
    }
  });
});

describe("(d) a cartId is never a lookup key", () => {
  it("every exported entry point takes a token or a customer id", async () => {
    // The IDOR this prevents: a request body carrying `{ cartId }` lets anyone who guessed or
    // observed another visitor's cart id read their bag, change it, or empty it. The token
    // lives in an HttpOnly cookie and only its hash is stored.
    const src = codeOf("src/lib/cart/index.ts");
    const exported = [...src.matchAll(/export async function (\w+)\(\s*([^)]*)/g)];
    expect(exported.length).toBeGreaterThan(4);
    for (const [, name, params] of exported) {
      if (name === "createCart" || name === "mergeCartsOnLogin") continue;
      expect(params, `${name!} must take a token, not a cartId`).toMatch(/token: string/);
      expect(params, `${name!} must not accept a cartId`).not.toMatch(/cartId/);
    }
  });

  it("a line id from another cart cannot be touched", async () => {
    // `AND cart_id = …` on the UPDATE is the authorisation, not a filter.
    const other = await createCart(marketCode);
    await addItem(other.token, { variantId, quantity: 1 });
    const otherLines = await db.$queryRaw<{ id: string }[]>`
      SELECT id::text AS id FROM cart_items WHERE cart_id = ${other.cartId}::uuid`;

    const { updateItemQuantity } = await import("@/lib/cart");
    await updateItemQuantity(token, otherLines[0]!.id, 9);

    const after = await db.$queryRaw<{ quantity: number }[]>`
      SELECT quantity FROM cart_items WHERE id = ${otherLines[0]!.id}::uuid`;
    // Untouched: the victim's line still says 1.
    expect(after[0]!.quantity).toBe(1);

    await db.$executeRaw`DELETE FROM cart_items WHERE cart_id = ${other.cartId}::uuid`;
    await db.$executeRaw`DELETE FROM carts WHERE id = ${other.cartId}::uuid`;
  });

  it("an unknown token yields nothing, and does not reveal whether it ever existed", async () => {
    expect(await getCart("not-a-real-token")).toBeNull();
  });

  it("only the HASH is stored", async () => {
    const rows = await db.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM carts WHERE encode(token_hash, 'escape') = ${token}`;
    expect(rows[0]!.n).toBe(0);
  });
});

describe("adding the same piece twice raises the quantity", () => {
  it("upserts rather than appending", async () => {
    // `uq_cart_items (cart_id, variant_id)`. An append would be invisible until the customer
    // noticed they were about to buy two of something.
    await addItem(token, { variantId, quantity: 1 });
    const rows = await lines();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.quantity).toBe(3);
  });

  it("caps at CART_MAX_QUANTITY rather than refusing", async () => {
    await addItem(token, { variantId, quantity: 99 });
    expect((await lines())[0]!.quantity).toBe(CART_MAX_QUANTITY);
  });
});

describe("the message vocabulary is complete", () => {
  it("every key 05 §2.4 names has a default", async () => {
    const { CART_MESSAGE_KEYS, CART_MESSAGE_DEFAULTS } = await import("@/lib/cart/messages");
    expect(CART_MESSAGE_KEYS).toHaveLength(10);
    for (const key of CART_MESSAGE_KEYS) {
      expect(CART_MESSAGE_DEFAULTS[key], key).toBeTruthy();
    }
  });

  it("the service returns KEYS, never formatted copy", async () => {
    // 05 §2.4: strings are overridable per market through settings. A sentence baked into a
    // service is one the client cannot change without a deploy.
    const src = readFileSync("src/lib/cart/revalidate.ts", "utf8");
    expect(src).not.toContain("has been removed from your bag");
  });
});
