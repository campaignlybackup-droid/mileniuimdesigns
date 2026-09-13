import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { withTransaction } from "@/lib/db/transaction";
import { commitStock, releaseStock, reserveStock } from "@/lib/inventory";
import { getAvailability } from "@/lib/inventory";
import { InsufficientStockError } from "@/lib/errors";
import { permissionsForRoles, type StaffActor } from "@/lib/rbac";

/**
 * Commissioned by 09 P19 exit criterion (a) and R01 — **"if only one item exists, two
 * customers must not both be able to purchase it."**
 *
 * This is the test the whole inventory phase exists for. Two transactions race for one ring;
 * exactly one may win, and the loser must get `InsufficientStockError` rather than a second
 * reservation. It runs REPEATEDLY, because a concurrency bug that reproduces one time in fifty
 * passes a single-run test and then happens on a Saturday.
 *
 * The three mechanisms under test are layered: the row lock serialises the pair, the
 * conditional UPDATE re-evaluates availability when it unblocks, and
 * `chk_inventory_no_oversell` refuses the row if both are somehow bypassed.
 */

const stamp = Date.now();
const prefix = `zz-p19k-${String(stamp)}`;
/** 200 per 09 P19 (a). Lowered only if the local engine cannot sustain it — see the report. */
const REPEATS = 200;

/** Built once the real `users` row exists. `StaffActor` is readonly deliberately: an actor
 *  whose identity can be reassigned after construction is an actor a later line can change. */
let actor: StaffActor;
const actorFor = (userId: string): StaffActor => ({
  kind: "staff",
  userId,
  roles: ["owner"],
  permissions: permissionsForRoles(["owner"]),
  totpVerifiedAt: new Date(),
});

let productId = "";
let variantId = "";
let itemId = "";
let locationId = "";
let cartA = "";
let cartB = "";

beforeAll(async () => {
  const u = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO users (id, email, password_hash, first_name, last_name, is_active,
                       totp_recovery_codes, password_changed_at, created_at, updated_at)
    VALUES (gen_random_uuid(), ${`${prefix}@example.invalid`}, 'x', 'ZZ', 'P19', true,
            ARRAY[]::text[], now(), now(), now())
    RETURNING id::text AS id`;
  actor = actorFor(u[0]!.id);

  const loc = await db.$queryRaw<{ id: string }[]>`
    SELECT id::text AS id FROM inventory_locations
     WHERE is_fulfillable AND is_active AND deleted_at IS NULL ORDER BY rank LIMIT 1`;
  locationId = loc[0]!.id;

  const p = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO products (id, slug, title, status, published_at, is_one_of_a_kind, rank,
                          search_text, version, created_at, updated_at)
    VALUES (gen_random_uuid(), ${prefix}, 'ZZ P19 UNIQUE', 'active', now() - interval '1 hour',
            true, 0, '', 1, now(), now())
    RETURNING id::text AS id`;
  productId = p[0]!.id;

  const v = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO product_variants (id, product_id, is_one_of_a_kind, sku, position,
                                  inventory_policy, option_signature, is_active, version,
                                  created_at, updated_at)
    VALUES (gen_random_uuid(), ${productId}::uuid, true, ${`MD-ZZK-ZZK-K${String(stamp).slice(-3)}-NA`},
            0, 'tracked', '', true, 1, now(), now())
    RETURNING id::text AS id`;
  variantId = v[0]!.id;

  // Two carts in the same market, so both races are legitimate attempts.
  for (const ref of ["a", "b"] as const) {
    const c = await db.$queryRaw<{ id: string }[]>`
      INSERT INTO carts (id, token_hash, market_code, currency_code, status, last_activity_at,
                         expires_at, version, created_at, updated_at)
      SELECT gen_random_uuid(), decode(md5(${`${prefix}-${ref}`}), 'hex'), m.code, m.currency_code,
             'active', now(), now() + interval '1 day', 1, now(), now()
        FROM markets m WHERE m.is_active ORDER BY m.rank LIMIT 1
      RETURNING id::text AS id`;
    if (ref === "a") cartA = c[0]!.id;
    else cartB = c[0]!.id;
  }
});

afterAll(async () => {
  await db.$executeRaw`DELETE FROM reservation_lines WHERE variant_id = ${variantId}::uuid`;
  await db.$executeRaw`DELETE FROM reservations WHERE cart_id IN (${cartA}::uuid, ${cartB}::uuid)`;
  await db.$executeRaw`DELETE FROM inventory_transactions WHERE variant_id = ${variantId}::uuid`;
  await db.$executeRaw`DELETE FROM inventory_items WHERE variant_id = ${variantId}::uuid`;
  await db.$executeRaw`DELETE FROM carts WHERE id IN (${cartA}::uuid, ${cartB}::uuid)`;
  await db.$executeRaw`DELETE FROM products WHERE slug = ${prefix}`;
  await db.$executeRaw`DELETE FROM users WHERE email = ${`${prefix}@example.invalid`}`;
});

/** One ring, on hand, unreserved, unsold. */
async function resetToOne(): Promise<void> {
  await db.$executeRaw`DELETE FROM reservation_lines WHERE variant_id = ${variantId}::uuid`;
  await db.$executeRaw`DELETE FROM reservations WHERE cart_id IN (${cartA}::uuid, ${cartB}::uuid)`;
  await db.$executeRaw`DELETE FROM inventory_transactions WHERE variant_id = ${variantId}::uuid`;
  await db.$executeRaw`DELETE FROM inventory_items WHERE variant_id = ${variantId}::uuid`;
  await db.$executeRaw`UPDATE products SET sold_at = NULL WHERE id = ${productId}::uuid`;
  const i = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO inventory_items (id, variant_id, is_one_of_a_kind, location_id, on_hand_quantity,
                                 reserved_quantity, available_quantity, incoming_quantity,
                                 safety_stock_quantity, version, created_at, updated_at)
    VALUES (gen_random_uuid(), ${variantId}::uuid, true, ${locationId}::uuid, 1, 0, 1, 0, 0, 1,
            now(), now())
    RETURNING id::text AS id`;
  itemId = i[0]!.id;
}

describe("(a) two transactions race for one ring — exactly one wins", () => {
  it(`survives ${String(REPEATS)} consecutive runs`, async () => {
    let wins = 0;
    let losses = 0;

    for (let run = 0; run < REPEATS; run++) {
      await resetToOne();

      // Both transactions open and attempt the same piece. They are started together so the
      // second is genuinely contending, not merely sequenced after the first.
      const attempt = (cartId: string) =>
        withTransaction((tx) =>
          reserveStock(tx, [{ variantId, quantity: 1 }], { kind: "cart", id: cartId }),
        )
          .then(() => "won" as const)
          .catch((e: unknown) =>
            e instanceof InsufficientStockError ? ("lost" as const) : Promise.reject(e),
          );

      const [a, b] = await Promise.all([attempt(cartA), attempt(cartB)]);
      const outcomes = [a, b];
      wins += outcomes.filter((o) => o === "won").length;
      losses += outcomes.filter((o) => o === "lost").length;

      // EXACTLY one winner, every single run.
      expect(
        outcomes.filter((o) => o === "won"),
        `run ${String(run)}`,
      ).toHaveLength(1);

      // And the counter agrees: one reserved, never two.
      const rows = await db.$queryRaw<
        { reserved_quantity: number; on_hand_quantity: number }[]
      >`
        SELECT reserved_quantity, on_hand_quantity FROM inventory_items WHERE id = ${itemId}::uuid`;
      expect(rows[0]!.reserved_quantity, `run ${String(run)}`).toBe(1);
      expect(rows[0]!.on_hand_quantity).toBe(1);
    }

    expect(wins).toBe(REPEATS);
    expect(losses).toBe(REPEATS);
  }, 600_000);
});

describe("the piece is sold once, and says so", () => {
  it("stamps sold_at in the SAME transaction as the commit", async () => {
    await resetToOne();
    const reservation = await withTransaction((tx) =>
      reserveStock(tx, [{ variantId, quantity: 1 }], { kind: "cart", id: cartA }),
    );
    const result = await withTransaction((tx) => commitStock(actor, tx, reservation.id));
    expect(result.committed).toBe(true);
    expect(result.soldOutOfAKind).toEqual([productId]);

    const rows = await db.$queryRaw<{ sold_at: Date | null }[]>`
      SELECT sold_at FROM products WHERE id = ${productId}::uuid`;
    // In the same transaction, so a paid unique piece reads SOLD on the next render — not
    // thirty minutes later when the reservation would have lapsed.
    expect(rows[0]!.sold_at).not.toBeNull();
  });

  it("renders as `sold`, NOT as `out`", async () => {
    // The band that matters. A sold unique piece has zero available, so any implementation
    // that checked quantity before `sold_at` would render the archive as out-of-stock and the
    // One of a Kind edit would quietly become a list of unavailable products.
    const market = await db.$queryRaw<{ code: string }[]>`
      SELECT code FROM markets WHERE is_active ORDER BY rank LIMIT 1`;
    const availability = await getAvailability([variantId], market[0]!.code);
    expect(availability.get(variantId)!.band).toBe("sold");
  });

  it("moved the stock through the LEDGER, not around it", async () => {
    const rows = await db.$queryRaw<
      { type: string; quantity_delta: number; balance_after: number; balance_before: number }[]
    >`
      SELECT type::text AS type, quantity_delta, balance_after, balance_before
        FROM inventory_transactions WHERE variant_id = ${variantId}::uuid`;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.type).toBe("sale");
    expect(rows[0]!.quantity_delta).toBe(-1);
    expect(rows[0]!.balance_after).toBe(0);
    // The generated column, computed by the database rather than supplied by the caller.
    expect(rows[0]!.balance_before).toBe(1);
  });

  it("cannot be reserved again once sold", async () => {
    await expect(
      withTransaction((tx) =>
        reserveStock(tx, [{ variantId, quantity: 1 }], { kind: "cart", id: cartB }),
      ),
    ).rejects.toThrow(InsufficientStockError);
  });
});

describe("releasing is idempotent by guard", () => {
  it("a second release does not decrement the counter twice", async () => {
    await resetToOne();
    const reservation = await withTransaction((tx) =>
      reserveStock(tx, [{ variantId, quantity: 1 }], { kind: "cart", id: cartA }),
    );

    const first = await withTransaction((tx) =>
      releaseStock(tx, reservation.id, "cart_changed"),
    );
    expect(first.released).toBe(true);

    const second = await withTransaction((tx) => releaseStock(tx, reservation.id, "expired"));
    // Zero rows on the guarded header update means someone already released it, and the
    // counters are LEFT ALONE — decrementing twice is exactly how phantom-available stock
    // is created, and it would let the piece be sold twice from one reservation.
    expect(second.released).toBe(false);

    const rows = await db.$queryRaw<{ reserved_quantity: number }[]>`
      SELECT reserved_quantity FROM inventory_items WHERE id = ${itemId}::uuid`;
    expect(rows[0]!.reserved_quantity).toBe(0);
  });

  it("records WHY it was released", async () => {
    const rows = await db.$queryRaw<{ release_reason: string | null }[]>`
      SELECT release_reason FROM reservations WHERE cart_id = ${cartA}::uuid
       ORDER BY created_at DESC LIMIT 1`;
    // The reason is required and undefaulted: "why did this come back on sale" is the first
    // question asked when a piece reappears unexpectedly.
    expect(rows[0]!.release_reason).toBe("cart_changed");
  });
});
