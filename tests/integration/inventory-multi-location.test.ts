import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { withTransaction } from "@/lib/db/transaction";
import { getAvailability, openInventoryItem, reserveStock } from "@/lib/inventory";
import { InsufficientStockError } from "@/lib/errors";
import { releaseStock } from "@/lib/inventory";
import type { Tx } from "@/lib/db/transaction";
import { permissionsForRoles, type StaffActor } from "@/lib/rbac";

/**
 * Commissioned by 05 §1.3 — **multi-location from day one, with one active location.**
 *
 * At launch `market_locations` resolves to one row per variant per market. This test seeds
 * TWO anyway, because retrofitting locations later means rewriting every availability query,
 * every reservation, the CSV importer and the returns restock path at once. Carrying the join
 * now costs one index lookup; adding it later costs all of that, under time pressure.
 *
 * Two launch policies are asserted here rather than left as prose: allocation order is
 * deterministic, and **there is no split fulfilment**.
 */

const stamp = Date.now();
const prefix = `zz-p19m-${String(stamp)}`;
let actor: StaffActor;
let variantId = "";
let cartId = "";
let marketCode = "";
let primaryLocation = "";
let secondaryLocation = "";
let quarantineLocation = "";

beforeAll(async () => {
  const u = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO users (id, email, password_hash, first_name, last_name, is_active,
                       totp_recovery_codes, password_changed_at, created_at, updated_at)
    VALUES (gen_random_uuid(), ${`${prefix}@example.invalid`}, 'x', 'ZZ', 'P19M', true,
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

  // Three locations: two fulfillable at different priorities, one quarantine.
  const mk = async (code: string, fulfillable: boolean, rank: number): Promise<string> => {
    const l = await db.$queryRaw<{ id: string }[]>`
      INSERT INTO inventory_locations (id, code, name, country_code, address_json,
                                       is_fulfillable, is_active, rank, created_at, updated_at)
      VALUES (gen_random_uuid(), ${code}, ${code}, 'US', '{}'::jsonb, ${fulfillable}, true,
              ${rank}, now(), now())
      RETURNING id::text AS id`;
    return l[0]!.id;
  };
  primaryLocation = await mk(`${prefix}-A`, true, 10);
  secondaryLocation = await mk(`${prefix}-B`, true, 20);
  // Damaged and unsellable returned stock lives here: visible in reports, excluded from every
  // sellable figure, and never written off silently (05 §1.3).
  quarantineLocation = await mk(`${prefix}-Q`, false, 30);

  for (const [id, priority] of [
    [primaryLocation, 1],
    [secondaryLocation, 2],
    [quarantineLocation, 9],
  ] as const) {
    await db.$executeRaw`
      INSERT INTO market_locations (market_code, location_id, priority, created_at)
      VALUES (${marketCode}, ${id}::uuid, ${priority}, now())`;
  }

  const p = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO products (id, slug, title, status, rank, search_text, version, created_at, updated_at)
    VALUES (gen_random_uuid(), ${prefix}, 'ZZ P19M', 'draft', 0, '', 1, now(), now())
    RETURNING id::text AS id`;
  const v = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO product_variants (id, product_id, sku, position, inventory_policy,
                                  option_signature, is_active, version, created_at, updated_at)
    VALUES (gen_random_uuid(), ${p[0]!.id}::uuid, ${`MD-ZZM-ZZM-M${String(stamp).slice(-3)}-NA`},
            0, 'tracked', '', true, 1, now(), now())
    RETURNING id::text AS id`;
  variantId = v[0]!.id;

  // 2 at the primary, 3 at the secondary, 5 in quarantine.
  await withTransaction(async (tx) => {
    await openInventoryItem(actor, tx, {
      variantId,
      locationId: primaryLocation,
      isOneOfAKind: false,
      onHandQuantity: 2,
    });
    await openInventoryItem(actor, tx, {
      variantId,
      locationId: secondaryLocation,
      isOneOfAKind: false,
      onHandQuantity: 3,
    });
    await openInventoryItem(actor, tx, {
      variantId,
      locationId: quarantineLocation,
      isOneOfAKind: false,
      onHandQuantity: 5,
    });
  });

  const c = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO carts (id, token_hash, market_code, currency_code, status, last_activity_at,
                       expires_at, version, created_at, updated_at)
    VALUES (gen_random_uuid(), decode(md5(${prefix}), 'hex'), ${marketCode}, ${m[0]!.currency_code},
            'active', now(), now() + interval '1 day', 1, now(), now())
    RETURNING id::text AS id`;
  cartId = c[0]!.id;
});

afterAll(async () => {
  await db.$executeRaw`DELETE FROM reservation_lines WHERE variant_id = ${variantId}::uuid`;
  await db.$executeRaw`DELETE FROM reservations WHERE cart_id = ${cartId}::uuid`;
  await db.$executeRaw`DELETE FROM inventory_transactions WHERE variant_id = ${variantId}::uuid`;
  await db.$executeRaw`DELETE FROM inventory_items WHERE variant_id = ${variantId}::uuid`;
  await db.$executeRaw`DELETE FROM carts WHERE id = ${cartId}::uuid`;
  await db.$executeRaw`DELETE FROM products WHERE slug LIKE ${`${prefix}%`}`;
  await db.$executeRaw`
    DELETE FROM market_locations WHERE location_id IN
      (${primaryLocation}::uuid, ${secondaryLocation}::uuid, ${quarantineLocation}::uuid)`;
  await db.$executeRaw`
    DELETE FROM inventory_locations WHERE id IN
      (${primaryLocation}::uuid, ${secondaryLocation}::uuid, ${quarantineLocation}::uuid)`;
  await db.$executeRaw`DELETE FROM users WHERE email = ${`${prefix}@example.invalid`}`;
});

/** Release whatever this cart is currently holding, if anything. */
async function releaseActiveFor(tx: Tx, cart: string): Promise<void> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id::text AS id FROM reservations WHERE cart_id = ${cart}::uuid AND status = 'active'`;
  for (const row of rows) await releaseStock(tx, row.id, "cart_changed");
}

describe("availability sums the FULFILLABLE locations only", () => {
  it("counts 5, not 10 — quarantine stock is real and is not for sale", async () => {
    // Damaged and unsellable returned stock is visible in reports and excluded from every
    // sellable figure. Counting it would advertise pieces nobody can send.
    const availability = await getAvailability([variantId], marketCode);
    expect(availability.get(variantId)!.availableQuantity).toBe(5);
    expect(availability.get(variantId)!.band).toBe("in_stock");
  });
});

describe("allocation order is deterministic", () => {
  it("takes from the lowest market_locations.priority first", async () => {
    // Deterministic ordering is what makes a reservation reproducible in a test — and what
    // stops two identical carts allocating differently for no discoverable reason.
    const reservation = await withTransaction((tx) =>
      reserveStock(tx, [{ variantId, quantity: 2 }], { kind: "cart", id: cartId }),
    );
    const rows = await db.$queryRaw<{ location_id: string }[]>`
      SELECT ii.location_id::text AS location_id
        FROM reservation_lines rl JOIN inventory_items ii ON ii.id = rl.inventory_item_id
       WHERE rl.reservation_id = ${reservation.id}::uuid`;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.location_id).toBe(primaryLocation);
  });
});

describe("NO SPLIT FULFILMENT at launch", () => {
  it("refuses a line no single location can cover, even when the sum would suffice", async () => {
    // 5 are available across two locations and none has 4. Splitting would produce two
    // shipments, two labels and two tracking numbers for an order that is typically one to
    // three pieces — and would make "what did shipping cost" ambiguous at the exact moment
    // the customer is being quoted.
    await db.$executeRaw`DELETE FROM reservation_lines WHERE variant_id = ${variantId}::uuid`;
    await db.$executeRaw`DELETE FROM reservations WHERE cart_id = ${cartId}::uuid`;
    await db.$executeRaw`UPDATE inventory_items SET reserved_quantity = 0 WHERE variant_id = ${variantId}::uuid`;

    const availability = await getAvailability([variantId], marketCode);
    expect(availability.get(variantId)!.availableQuantity).toBe(5);

    await expect(
      withTransaction((tx) =>
        reserveStock(tx, [{ variantId, quantity: 4 }], { kind: "cart", id: cartId }),
      ),
    ).rejects.toThrow(InsufficientStockError);
  });

  it("accepts a line the SECONDARY location can cover alone", async () => {
    // The converse, and the thing that makes the refusal above a policy rather than a bug:
    // 3 fits at the secondary, so allocation falls through to it.
    const reservation = await withTransaction((tx) =>
      reserveStock(tx, [{ variantId, quantity: 3 }], { kind: "cart", id: cartId }),
    );
    const rows = await db.$queryRaw<{ location_id: string }[]>`
      SELECT ii.location_id::text AS location_id
        FROM reservation_lines rl JOIN inventory_items ii ON ii.id = rl.inventory_item_id
       WHERE rl.reservation_id = ${reservation.id}::uuid`;
    expect(rows[0]!.location_id).toBe(secondaryLocation);
  });
});

describe("made-to-order and untracked variants never reserve", () => {
  it("a made-to-order piece yields a reservation with no lines, not an error", async () => {
    // Without the step-0 filter, step 1 returns zero rows for a made-to-order piece, step 2
    // allocates nothing, "zero rows means you lost the race" fires, and EVERY made-to-order
    // product in the catalogue becomes permanently unbuyable at the last click of checkout.
    const p = await db.$queryRaw<{ id: string }[]>`
      INSERT INTO products (id, slug, title, status, rank, search_text, version, created_at, updated_at)
      VALUES (gen_random_uuid(), ${`${prefix}-mto`}, 'ZZ MTO', 'draft', 0, '', 1, now(), now())
      RETURNING id::text AS id`;
    const v = await db.$queryRaw<{ id: string }[]>`
      INSERT INTO product_variants (id, product_id, sku, position, inventory_policy,
                                    option_signature, is_active, version, created_at, updated_at)
      VALUES (gen_random_uuid(), ${p[0]!.id}::uuid, ${`MD-ZZM-ZZM-T${String(stamp).slice(-3)}-NA`},
              0, 'made_to_order', '', true, 1, now(), now())
      RETURNING id::text AS id`;

    // One ACTIVE reservation per cart — `idx_reservations_active_cart`. A reservation
    // describes a specific bag, so a mutated bag releases and re-takes (05 §1.6). The
    // constraint caught this test holding a reservation from the previous case.
    await withTransaction((tx) => releaseActiveFor(tx, cartId));

    const reservation = await withTransaction((tx) =>
      reserveStock(tx, [{ variantId: v[0]!.id, quantity: 1 }], { kind: "cart", id: cartId }),
    );
    expect(reservation.lines).toEqual([]);

    // And it renders as `made_to_order`, not `out` — it has no inventory row at all.
    const availability = await getAvailability([v[0]!.id], marketCode);
    expect(availability.get(v[0]!.id)!.band).toBe("made_to_order");
    expect(availability.get(v[0]!.id)!.availableQuantity).toBeNull();

    await db.$executeRaw`DELETE FROM reservations WHERE id = ${reservation.id}::uuid`;
    // The product row is cleaned in afterAll, not here: cleanup at the end of a test body
    // does not run when the test throws, and three failed runs of this case leaked three
    // 'ZZ MTO' products that drift.test.ts then correctly reported as an unmarked catalogue.
  });
});
