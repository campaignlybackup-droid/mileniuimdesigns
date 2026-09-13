import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { withTransaction } from "@/lib/db/transaction";
import { openInventoryItem, reconcileInventory, reserveStock } from "@/lib/inventory";
import { permissionsForRoles, type StaffActor } from "@/lib/rbac";

/**
 * Commissioned by 09 P19 exit criterion (d) — **"`reconcile_inventory` run against a
 * deliberately corrupted `reserved_quantity` reports the divergence and does NOT self-heal
 * it."**
 *
 * The criterion states its own reason: *a counter silently rewritten is an oversell whose
 * evidence was destroyed.* The divergence is the only trace that something went wrong; a job
 * that quietly corrects it means the next oversell happens with nothing left to find, and the
 * nightly report goes green on the morning it most needed to be red.
 *
 * This is R01's early-warning signal and a launch blocker — the thing that tells an operator a
 * reservation counter has drifted BEFORE two customers pay for one ring.
 */

const stamp = Date.now();
const prefix = `zz-p19r-${String(stamp)}`;
let variantId = "";
let itemId = "";
let cartId = "";
let actor: StaffActor;
const actorFor = (userId: string): StaffActor => ({
  kind: "staff",
  userId,
  roles: ["owner"],
  permissions: permissionsForRoles(["owner"]),
  totpVerifiedAt: new Date(),
});

beforeAll(async () => {
  const u = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO users (id, email, password_hash, first_name, last_name, is_active,
                       totp_recovery_codes, password_changed_at, created_at, updated_at)
    VALUES (gen_random_uuid(), ${`${prefix}@example.invalid`}, 'x', 'ZZ', 'P19R', true,
            ARRAY[]::text[], now(), now(), now())
    RETURNING id::text AS id`;
  actor = actorFor(u[0]!.id);

  const loc = await db.$queryRaw<{ id: string }[]>`
    SELECT id::text AS id FROM inventory_locations WHERE is_fulfillable ORDER BY rank LIMIT 1`;
  const p = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO products (id, slug, title, status, rank, search_text, version, created_at, updated_at)
    VALUES (gen_random_uuid(), ${prefix}, 'ZZ P19R', 'draft', 0, '', 1, now(), now())
    RETURNING id::text AS id`;
  const v = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO product_variants (id, product_id, sku, position, inventory_policy,
                                  option_signature, is_active, version, created_at, updated_at)
    VALUES (gen_random_uuid(), ${p[0]!.id}::uuid, ${`MD-ZZR-ZZR-R${String(stamp).slice(-3)}-NA`},
            0, 'tracked', '', true, 1, now(), now())
    RETURNING id::text AS id`;
  variantId = v[0]!.id;

  // Through the LEDGER, not a direct INSERT. A row created with an opening balance nobody
  // recorded is permanently divergent — which is what the reconciler flagged when this fixture
  // inserted stock directly, correctly, on the first run.
  const opened = await withTransaction((tx) =>
    openInventoryItem(actor, tx, {
      variantId,
      locationId: loc[0]!.id,
      isOneOfAKind: false,
      onHandQuantity: 10,
      note: "ZZ P19R opening balance",
    }),
  );
  itemId = opened.inventoryItemId;

  const c = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO carts (id, token_hash, market_code, currency_code, status, last_activity_at,
                       expires_at, version, created_at, updated_at)
    SELECT gen_random_uuid(), decode(md5(${prefix}), 'hex'), m.code, m.currency_code, 'active',
           now(), now() + interval '1 day', 1, now(), now()
      FROM markets m WHERE m.is_active ORDER BY m.rank LIMIT 1
    RETURNING id::text AS id`;
  cartId = c[0]!.id;
});

afterAll(async () => {
  await db.$executeRaw`DELETE FROM reservation_lines WHERE variant_id = ${variantId}::uuid`;
  await db.$executeRaw`DELETE FROM reservations WHERE cart_id = ${cartId}::uuid`;
  await db.$executeRaw`DELETE FROM inventory_transactions WHERE variant_id = ${variantId}::uuid`;
  await db.$executeRaw`DELETE FROM inventory_items WHERE variant_id = ${variantId}::uuid`;
  await db.$executeRaw`DELETE FROM carts WHERE id = ${cartId}::uuid`;
  await db.$executeRaw`DELETE FROM products WHERE slug = ${prefix}`;
  await db.$executeRaw`DELETE FROM users WHERE email = ${`${prefix}@example.invalid`}`;
});

const divergencesFor = (result: Awaited<ReturnType<typeof reconcileInventory>>) =>
  result.divergences.filter((d) => d.inventoryItemId === itemId);

describe("(d) a corrupted counter is REPORTED, not repaired", () => {
  it("reports nothing when the counters agree", async () => {
    // The baseline. A reconciler that reported everything would "pass" the corruption test
    // below for the wrong reason.
    await withTransaction((tx) =>
      reserveStock(tx, [{ variantId, quantity: 3 }], { kind: "cart", id: cartId }),
    );
    const clean = await reconcileInventory();
    expect(divergencesFor(clean)).toEqual([]);
    expect(clean.itemsChecked).toBeGreaterThan(0);
  });

  it("reports a reserved_quantity that no longer matches its reservation lines", async () => {
    // The corruption: the counter says 7, the active reservation lines say 3. This is exactly
    // the shape a lost release or a double-decrement leaves behind.
    await db.$executeRaw`
      UPDATE inventory_items SET reserved_quantity = 7 WHERE id = ${itemId}::uuid`;

    const result = await reconcileInventory();
    const found = divergencesFor(result).filter((d) => d.kind === "reserved");
    expect(found).toHaveLength(1);
    expect(found[0]!.counter).toBe(7);
    expect(found[0]!.derived).toBe(3);
    // It names the SKU, because the person reading the nightly report is looking for a piece,
    // not a uuid.
    expect(found[0]!.sku).toContain("MD-ZZR");
  });

  it("does NOT rewrite the counter", async () => {
    // THE criterion. The divergence is the only evidence that something went wrong; a job
    // that corrects it makes the symptom vanish and the next oversell untraceable.
    const rows = await db.$queryRaw<{ reserved_quantity: number }[]>`
      SELECT reserved_quantity FROM inventory_items WHERE id = ${itemId}::uuid`;
    expect(rows[0]!.reserved_quantity).toBe(7);
  });

  it("says out loud that it healed nothing", async () => {
    // The shape carries the promise, so a future implementation that started healing would
    // have to change the type — which is a diff a reviewer sees.
    const result = await reconcileInventory();
    expect(result.healed).toBe(false);
  });

  it("reports an on_hand that no longer matches the ledger", async () => {
    // The second invariant. A counter moved without a ledger row is stock that appeared from
    // nowhere — and at stocktake nobody can say which of the two numbers is true.
    await db.$executeRaw`
      UPDATE inventory_items SET on_hand_quantity = 99 WHERE id = ${itemId}::uuid`;
    const result = await reconcileInventory();
    const found = divergencesFor(result).filter((d) => d.kind === "on_hand");
    expect(found).toHaveLength(1);
    expect(found[0]!.counter).toBe(99);
    // 10, the opening balance recorded through the ledger — which is the whole point: the
    // ledger is the true figure and the counter is the one that drifted.
    expect(found[0]!.derived).toBe(10);
  });

  it("reports BOTH kinds independently when both have drifted", async () => {
    const result = await reconcileInventory();
    const kinds = divergencesFor(result)
      .map((d) => d.kind)
      .sort();
    // Not one combined "this item is wrong" — the two invariants fail for different reasons
    // and are fixed in different places.
    expect(kinds).toEqual(["on_hand", "reserved"]);
  });
});
