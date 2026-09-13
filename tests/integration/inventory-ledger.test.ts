import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { withTransaction } from "@/lib/db/transaction";
import { writeInventoryTransaction, NOTE_REQUIRED } from "@/lib/inventory";
import { ValidationError } from "@/lib/errors";
import { permissionsForRoles, type StaffActor } from "@/lib/rbac";

/**
 * Commissioned by 09 P19 exit criterion (b) — **"the ledger sums to the counter on a
 * 1,000-movement fixture."**
 *
 * `inventory_transactions` is the only thing permitted to change `on_hand_quantity`, and this
 * asserts the property that makes that claim mean something: after a randomised sequence of
 * movements, `SUM(quantity_delta)` equals the counter. If the two can drift, the ledger is a
 * log rather than a record, and at stocktake nobody can say which one is true.
 */

const stamp = Date.now();
const prefix = `zz-p19l-${String(stamp)}`;
const MOVEMENTS = 1000;

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

let variantId = "";
let itemId = "";
let locationId = "";

beforeAll(async () => {
  const u = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO users (id, email, password_hash, first_name, last_name, is_active,
                       totp_recovery_codes, password_changed_at, created_at, updated_at)
    VALUES (gen_random_uuid(), ${`${prefix}@example.invalid`}, 'x', 'ZZ', 'P19L', true,
            ARRAY[]::text[], now(), now(), now())
    RETURNING id::text AS id`;
  actor = actorFor(u[0]!.id);

  const loc = await db.$queryRaw<{ id: string }[]>`
    SELECT id::text AS id FROM inventory_locations WHERE is_fulfillable ORDER BY rank LIMIT 1`;
  locationId = loc[0]!.id;

  const p = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO products (id, slug, title, status, rank, search_text, version, created_at, updated_at)
    VALUES (gen_random_uuid(), ${prefix}, 'ZZ P19L', 'draft', 0, '', 1, now(), now())
    RETURNING id::text AS id`;
  const v = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO product_variants (id, product_id, sku, position, inventory_policy,
                                  option_signature, is_active, version, created_at, updated_at)
    VALUES (gen_random_uuid(), ${p[0]!.id}::uuid, ${`MD-ZZL-ZZL-L${String(stamp).slice(-3)}-NA`},
            0, 'tracked', '', true, 1, now(), now())
    RETURNING id::text AS id`;
  variantId = v[0]!.id;

  const i = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO inventory_items (id, variant_id, is_one_of_a_kind, location_id, on_hand_quantity,
                                 reserved_quantity, available_quantity, incoming_quantity,
                                 safety_stock_quantity, version, created_at, updated_at)
    VALUES (gen_random_uuid(), ${variantId}::uuid, false, ${locationId}::uuid, 0, 0, 0, 0, 0, 1,
            now(), now())
    RETURNING id::text AS id`;
  itemId = i[0]!.id;
});

afterAll(async () => {
  await db.$executeRaw`DELETE FROM inventory_transactions WHERE variant_id = ${variantId}::uuid`;
  await db.$executeRaw`DELETE FROM inventory_items WHERE variant_id = ${variantId}::uuid`;
  await db.$executeRaw`DELETE FROM products WHERE slug = ${prefix}`;
  await db.$executeRaw`DELETE FROM users WHERE email = ${`${prefix}@example.invalid`}`;
});

describe("(b) the ledger sums to the counter", () => {
  it(`holds after ${String(MOVEMENTS)} randomised movements`, async () => {
    // A deterministic pseudo-random sequence: reproducible, so a failure can be replayed.
    let seed = 20260913;
    const next = (): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };

    let expected = 0;
    // BATCHED, not one 1,000-statement transaction. The invariant under test is that the
    // ledger sums to the counter — not that a thousand movements are atomic. One interactive
    // transaction of that length took over two minutes against the local engine and held the
    // whole connection pool, which made every other suite running beside it fail with a
    // connection timeout. Batching is also closer to the truth: real movements arrive as many
    // small transactions, which is the shape that can actually interleave.
    const BATCH = 25;
    for (let start = 0; start < MOVEMENTS; start += BATCH) {
      await withTransaction(async (tx) => {
        for (let n = start; n < Math.min(start + BATCH, MOVEMENTS); n++) {
          // Receipts are larger than sales so the balance drifts upward and never has to be
          // refused for going negative — the refusal path has its own test below.
          const isReceipt = next() < 0.6;
          const delta = isReceipt ? 1 + Math.floor(next() * 5) : -(1 + Math.floor(next() * 3));
          if (expected + delta < 0) continue;
          await writeInventoryTransaction(actor, tx, {
            inventoryItemId: itemId,
            variantId,
            locationId,
            type: isReceipt ? "receipt" : "sale",
            quantityDelta: delta,
          });
          expected += delta;
        }
      });
    }

    const rows = await db.$queryRaw<{ counter: number; ledger: number; movements: number }[]>`
      SELECT ii.on_hand_quantity AS counter,
             coalesce((SELECT sum(t.quantity_delta)::int FROM inventory_transactions t
                        WHERE t.inventory_item_id = ii.id), 0) AS ledger,
             (SELECT count(*)::int FROM inventory_transactions t
               WHERE t.inventory_item_id = ii.id) AS movements
        FROM inventory_items ii WHERE ii.id = ${itemId}::uuid`;

    // A fixture that wrote nothing would satisfy 0 = 0.
    expect(rows[0]!.movements).toBeGreaterThan(MOVEMENTS / 2);
    expect(rows[0]!.counter).toBe(rows[0]!.ledger);
    expect(rows[0]!.counter).toBe(expected);
  }, 300_000);

  it("balance_before is computed by the database on every row", async () => {
    // A ledger whose before and after are both supplied by the caller can record a movement
    // that never happened. This asserts the identity holds for all 1,000 rows, not a sample.
    const rows = await db.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM inventory_transactions
       WHERE inventory_item_id = ${itemId}::uuid
         AND balance_before <> balance_after - quantity_delta`;
    expect(rows[0]!.n).toBe(0);
  });
});

describe("the three types that exist to explain a discrepancy must explain it", () => {
  it("refuses an adjustment, write_off or recount with no note", async () => {
    for (const type of NOTE_REQUIRED) {
      await expect(
        withTransaction((tx) =>
          writeInventoryTransaction(actor, tx, {
            inventoryItemId: itemId,
            variantId,
            locationId,
            type,
            quantityDelta: -1,
          }),
        ),
        `${type} without a note`,
      ).rejects.toThrow(ValidationError);
    }
  });

  it("accepts them WITH a note", async () => {
    // The converse: a service that refused all three unconditionally would pass the test
    // above and make stocktake corrections impossible.
    await withTransaction((tx) =>
      writeInventoryTransaction(actor, tx, {
        inventoryItemId: itemId,
        variantId,
        locationId,
        type: "recount",
        quantityDelta: -1,
        note: "Stocktake 2026-09-13: one piece at the bench.",
      }),
    );
    const rows = await db.$queryRaw<{ note: string | null }[]>`
      SELECT note FROM inventory_transactions WHERE inventory_item_id = ${itemId}::uuid
       ORDER BY created_at DESC LIMIT 1`;
    expect(rows[0]!.note).toContain("Stocktake");
  });

  it("does NOT require a note for a sale — that one explains itself", async () => {
    await withTransaction((tx) =>
      writeInventoryTransaction(actor, tx, {
        inventoryItemId: itemId,
        variantId,
        locationId,
        type: "sale",
        quantityDelta: -1,
      }),
    );
  });
});

describe("a movement that cannot happen writes NOTHING", () => {
  it("refuses to drive stock negative, and leaves no ledger row behind", async () => {
    // The failure mode this prevents: a ledger row for a movement the CHECK then refuses,
    // leaving the log claiming something the counter never did.
    const before = await db.$queryRaw<{ n: number; on_hand: number }[]>`
      SELECT (SELECT count(*)::int FROM inventory_transactions WHERE inventory_item_id = ${itemId}::uuid) AS n,
             on_hand_quantity AS on_hand FROM inventory_items WHERE id = ${itemId}::uuid`;

    await expect(
      withTransaction((tx) =>
        writeInventoryTransaction(actor, tx, {
          inventoryItemId: itemId,
          variantId,
          locationId,
          type: "sale",
          quantityDelta: -(before[0]!.on_hand + 1),
        }),
      ),
    ).rejects.toThrow(ValidationError);

    const after = await db.$queryRaw<{ n: number; on_hand: number }[]>`
      SELECT (SELECT count(*)::int FROM inventory_transactions WHERE inventory_item_id = ${itemId}::uuid) AS n,
             on_hand_quantity AS on_hand FROM inventory_items WHERE id = ${itemId}::uuid`;
    expect(after[0]!.n).toBe(before[0]!.n);
    expect(after[0]!.on_hand).toBe(before[0]!.on_hand);
  });

  it("refuses a zero-quantity movement", async () => {
    await expect(
      withTransaction((tx) =>
        writeInventoryTransaction(actor, tx, {
          inventoryItemId: itemId,
          variantId,
          locationId,
          type: "adjustment",
          quantityDelta: 0,
          note: "nothing",
        }),
      ),
    ).rejects.toThrow(ValidationError);
  });
});
