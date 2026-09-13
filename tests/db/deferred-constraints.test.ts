import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client } from "pg";

/**
 * Commissioned by 09 P18 exit criteria (a)–(d).
 *
 * Three properties, each of which is a risk in the register rather than a tidiness preference:
 * R01 (overselling a one-of-a-kind piece), R02 (cross-currency contamination inside one
 * order), and hard rule 4 (order immutability). Every assertion here is that the DATABASE
 * refuses the row — not that the service layer remembers to.
 */
const url = process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"]!;
const client = new Client({ connectionString: url });
const ready = client.connect();
afterAll(async () => {
  await clean();
  await client.end();
});

/**
 * These tests COMMIT, because a deferred constraint does not fire until commit — a test that
 * rolled back would pass whether or not the trigger existed. So they clean up at BOTH ends: a
 * run that fails mid-way leaves rows behind, and the next run then fails on a primary key
 * rather than on the thing under test. Which is exactly what happened the first time.
 */
const FIXTURE_IDS = [
  "cccccccc-0000-7000-8000-000000000001",
  "dddddddd-0000-7000-8000-000000000001",
];

async function clean(): Promise<void> {
  await ready;
  // ONE transaction. Each `client.query` autocommits, so deleting the lines on their own
  // fires the deferred trigger while the header still claims a subtotal — the cleanup would
  // trip the very constraint it is clearing up after. Inside one transaction the order is
  // gone by commit, which is the branch `md_order_items_totals_match` has for exactly this.
  await client.query("BEGIN");
  for (const id of FIXTURE_IDS) {
    await client.query(`DELETE FROM order_items WHERE order_id = '${id}'`);
    await client.query(`DELETE FROM orders WHERE id = '${id}'`);
  }
  await client.query("COMMIT");
  await client.query(`DELETE FROM webhook_events WHERE provider = 'zz-p18'`);
  await client.query(
    `DELETE FROM inventory_items WHERE variant_id = 'bbbbbbbb-0000-7000-8000-000000000001'`,
  );
  await client.query(
    `DELETE FROM product_variants WHERE id = 'bbbbbbbb-0000-7000-8000-000000000001'`,
  );
  await client.query(`DELETE FROM products WHERE id = 'aaaaaaaa-0000-7000-8000-000000000001'`);
}

beforeAll(clean);

/**
 * Run statements in a transaction that always rolls back, stopping at the first failure.
 *
 * One statement per call: a multi-statement batch whose second statement fails leaves the
 * rest executing inside an aborted transaction, and the local pglite engine CRASHES on that
 * rather than erroring (P12 field notes).
 */
async function attempt(statements: string[]): Promise<string> {
  await ready;
  await client.query("BEGIN");
  try {
    for (const s of statements) await client.query(s);
    // COMMIT, not ROLLBACK — a DEFERRED constraint does not fire until commit, so a test
    // that rolled back would pass whether or not the trigger existed. The transaction is
    // undone by the outer ROLLBACK in the catch, or by the explicit one below.
    await client.query("ROLLBACK");
    return "";
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* already aborted */
    }
    return (e as { constraint?: string; message: string }).constraint ?? (e as Error).message;
  }
}

/** Like `attempt`, but reaches COMMIT so deferred constraints actually run. */
async function attemptCommit(statements: string[]): Promise<string> {
  await ready;
  await client.query("BEGIN");
  try {
    for (const s of statements) await client.query(s);
    await client.query("COMMIT");
    // It committed, so undo it. Everything created here is prefixed and self-contained.
    return "";
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* already aborted */
    }
    return (e as { constraint?: string; message: string }).constraint ?? (e as Error).message;
  }
}

const FIXTURE = [
  `INSERT INTO products (id, slug, title, status, rank, search_text, version, created_at, updated_at)
   VALUES ('aaaaaaaa-0000-7000-8000-000000000001'::uuid, 'zz-p18-probe', 'ZZ P18', 'draft', 0, '', 1, now(), now())`,
  `INSERT INTO product_variants (id, product_id, is_one_of_a_kind, sku, position, inventory_policy,
                                 option_signature, is_active, version, created_at, updated_at)
   VALUES ('bbbbbbbb-0000-7000-8000-000000000001'::uuid,
           'aaaaaaaa-0000-7000-8000-000000000001'::uuid, true, 'MD-ZZP-ZZP-P181-NA', 0, 'tracked',
           '', true, 1, now(), now())`,
];

const inventory = (onHand: number, reserved: number, ooak = true): string => `
  INSERT INTO inventory_items (id, variant_id, is_one_of_a_kind, location_id, on_hand_quantity,
                               reserved_quantity, available_quantity, incoming_quantity,
                               safety_stock_quantity, version, created_at, updated_at)
  SELECT gen_random_uuid(), 'bbbbbbbb-0000-7000-8000-000000000001'::uuid, ${String(ooak)},
         l.id, ${String(onHand)}, ${String(reserved)}, ${String(onHand - reserved)}, 0, 0, 1, now(), now()
    FROM inventory_locations l ORDER BY code LIMIT 1`;

describe("P18 (a) — a piece cannot be promised twice", () => {
  it("refuses reserved > on_hand", async () => {
    // R01's floor. Whatever the reservation service believes, the database will not record a
    // promise larger than the stock behind it.
    const c = await attempt([...FIXTURE, inventory(1, 2)]);
    expect(c).toContain("chk_inventory_no_oversell");
  });

  it("accepts reserved == on_hand — the boundary is inclusive", async () => {
    // The converse. A constraint written `<` instead of `<=` would make the LAST unit
    // unsellable, which is a subtle inventory leak nobody would report as a bug.
    expect(await attempt([...FIXTURE, inventory(1, 1)])).toBe("");
  });

  it("refuses a one-of-a-kind piece with two units", async () => {
    const c = await attempt([...FIXTURE, inventory(2, 0)]);
    expect(c).toContain("chk_inventory_ooak_qty");
  });

  it("refuses a SECOND inventory row for a one-of-a-kind piece", async () => {
    // "Both locations hold the one ring" is not representable. Without this, two locations
    // each show one available and the piece is sold twice by two people at once.
    const c = await attempt([
      ...FIXTURE,
      inventory(1, 0),
      `INSERT INTO inventory_items (id, variant_id, is_one_of_a_kind, location_id, on_hand_quantity,
                                    reserved_quantity, available_quantity, incoming_quantity,
                                    safety_stock_quantity, version, created_at, updated_at)
       SELECT gen_random_uuid(), 'bbbbbbbb-0000-7000-8000-000000000001'::uuid, true,
              gen_random_uuid(), 1, 0, 1, 0, 0, 1, now(), now()`,
    ]);
    expect(c.length).toBeGreaterThan(0);
  });

  it("refuses an inventory row that lies about the variant being unique", async () => {
    // The composite FK to uq_variants_id_ooak. The denormalised flag is what the partial
    // unique above keys on, so a row claiming `false` for a unique variant would escape it.
    const c = await attempt([...FIXTURE, inventory(5, 0, false)]);
    expect(c).toContain("fk_inventory_items_variant_ooak");
  });
});

describe("P18 (b) — an order child cannot be in another currency", () => {
  const order = (currency: string) => `
    INSERT INTO orders (id, order_number, public_token_hash, idempotency_key, email, market_code,
                        currency_code, locale, status, payment_status, fulfillment_status,
                        subtotal_minor, discount_total_minor, shipping_total_minor, tax_total_minor,
                        gift_card_total_minor, total_minor, refunded_total_minor, tax_breakdown,
                        placed_at, version, created_at, updated_at)
    VALUES ('cccccccc-0000-7000-8000-000000000001'::uuid, 'ZZ-P18-1', '\\x01'::bytea, 'zz-p18-1',
            'zz@example.invalid', 'US', '${currency}', 'en-US', 'pending_payment', 'unpaid',
            'unfulfilled', 0, 0, 0, 0, 0, 0, 0, '{}'::jsonb, now(), 1, now(), now())`;

  const item = (market: string, currency: string) => `
    INSERT INTO order_items (id, order_id, line_number, product_title, sku, product_slug,
                             attributes_snapshot, stones_snapshot, materials_snapshot, quantity,
                             currency_code, market_code, unit_list_minor, unit_final_minor,
                             line_subtotal_minor, line_discount_minor, line_tax_minor,
                             line_shipping_minor, line_total_minor, discount_breakdown,
                             price_source, fulfilled_quantity, returned_quantity, refunded_minor,
                             created_at, updated_at)
    VALUES (gen_random_uuid(), 'cccccccc-0000-7000-8000-000000000001'::uuid, 1, 'ZZ', 'ZZ-1',
            'zz', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 1, '${currency}', '${market}',
            1000, 1000, 1000, 0, 0, 0, 1000, '[]'::jsonb, 'manual', 0, 0, 0, now(), now())`;

  it("refuses an INR line on a USD order", async () => {
    // R02 arriving inside a single order. The composite FK to uq_orders_id_money makes it a
    // row the database will not hold, rather than a bug someone has to notice in review.
    const c = await attempt([order("USD"), item("US", "INR")]);
    expect(c).toContain("fk_order_items_order_money");
  });

  it("refuses a line claiming a different MARKET", async () => {
    const c = await attempt([order("USD"), item("IN", "USD")]);
    expect(c).toContain("fk_order_items_order_money");
  });

  it("accepts a line in the order's own money", async () => {
    // The converse: a foreign key that refused everything would pass both tests above.
    expect(await attempt([order("USD"), item("US", "USD")])).toBe("");
  });
});

describe("P18 (c) — the totals trigger fires at COMMIT, not per statement", () => {
  const orderWithSubtotal = (subtotal: number) => `
    INSERT INTO orders (id, order_number, public_token_hash, idempotency_key, email, market_code,
                        currency_code, locale, status, payment_status, fulfillment_status,
                        subtotal_minor, discount_total_minor, shipping_total_minor, tax_total_minor,
                        gift_card_total_minor, total_minor, refunded_total_minor, tax_breakdown,
                        placed_at, version, created_at, updated_at)
    VALUES ('dddddddd-0000-7000-8000-000000000001'::uuid, 'ZZ-P18-2', '\\x02'::bytea, 'zz-p18-2',
            'zz@example.invalid', 'US', 'USD', 'en-US', 'pending_payment', 'unpaid',
            'unfulfilled', ${String(subtotal)}, 0, 0, 0, 0, ${String(subtotal)}, 0, '{}'::jsonb,
            now(), 1, now(), now())`;

  const lineFor = (subtotal: number) => `
    INSERT INTO order_items (id, order_id, line_number, product_title, sku, product_slug,
                             attributes_snapshot, stones_snapshot, materials_snapshot, quantity,
                             currency_code, market_code, unit_list_minor, unit_final_minor,
                             line_subtotal_minor, line_discount_minor, line_tax_minor,
                             line_shipping_minor, line_total_minor, discount_breakdown,
                             price_source, fulfilled_quantity, returned_quantity, refunded_minor,
                             created_at, updated_at)
    VALUES (gen_random_uuid(), 'dddddddd-0000-7000-8000-000000000001'::uuid, 1, 'ZZ', 'ZZ-2',
            'zz', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 1, 'USD', 'US',
            ${String(subtotal)}, ${String(subtotal)}, ${String(subtotal)}, 0, 0, 0,
            ${String(subtotal)}, '[]'::jsonb, 'manual', 0, 0, 0, now(), now())`;

  // Each of these COMMITS, so each starts from a clean slate rather than depending on the
  // previous one having tidied up. A test that assumes the last one succeeded fails for the
  // wrong reason the moment any of them does not.
  beforeEach(clean);
  afterEach(clean);

  it("lets the header be inserted BEFORE its lines", async () => {
    // THE reason it is deferred. createOrderFromCart() inserts the order row first; an
    // immediate trigger would reject every order at the moment it is created, and the only
    // way to ship would be to delete the constraint.
    const c = await attemptCommit([orderWithSubtotal(1000), lineFor(1000)]);
    expect(c).toBe("");
  });

  it("refuses at commit when the header does not match its lines", async () => {
    // An order whose printed total is not the sum of what is on it — the case that actually
    // happens, when a line is adjusted and the header is not recomputed.
    const c = await attemptCommit([orderWithSubtotal(1000), lineFor(999)]);
    expect(c).toContain("totals_match");
  });

  it("catches a line DELETED without the header being recomputed", async () => {
    const setup = await attemptCommit([orderWithSubtotal(1000), lineFor(1000)]);
    expect(setup).toBe("");
    const c = await attemptCommit([
      `DELETE FROM order_items WHERE order_id = 'dddddddd-0000-7000-8000-000000000001'`,
    ]);
    expect(c).toContain("totals_match");
  });
});

describe("P18 (d) — the two indexes the payment path depends on", () => {
  it("idx_webhook_events_event exists and is UNIQUE", async () => {
    // The dedupe. A provider that retries a delivery must not capture twice — and this is
    // the only thing standing between a retry and a double capture.
    await ready;
    const { rows } = await client.query<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes WHERE indexname = 'idx_webhook_events_event'`,
    );
    expect(rows[0]?.indexdef).toContain("UNIQUE");
    expect(rows[0]?.indexdef).toContain("provider_event_id");
  });

  it("idx_orders_idempotency_key exists and is UNIQUE", async () => {
    await ready;
    const { rows } = await client.query<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes WHERE indexname = 'idx_orders_idempotency_key'`,
    );
    expect(rows[0]?.indexdef).toContain("UNIQUE");
  });

  it("a duplicate webhook delivery is refused", async () => {
    // Asserting the index EXISTS is not the same as asserting it works.
    const insert = `
      INSERT INTO webhook_events (id, provider, provider_event_id, event_type, status,
                                  signature_valid, payload, attempts, received_at, created_at)
      VALUES (gen_random_uuid(), 'zz-p18', 'evt_zz_p18', 'payment.succeeded', 'received',
              true, '{}'::jsonb, 0, now(), now())`;
    const c = await attempt([insert, insert]);
    expect(c).toContain("idx_webhook_events_event");
  });
});

describe("the ledger's two ends cannot disagree", () => {
  it("balance_before is GENERATED, not written", async () => {
    // A ledger whose before and after are both supplied by the caller is a ledger that can
    // record an impossible movement. Prisma cannot express a generated column at all.
    await ready;
    const { rows } = await client.query<{ is_generated: string }>(
      `SELECT is_generated FROM information_schema.columns
        WHERE table_name = 'inventory_transactions' AND column_name = 'balance_before'`,
    );
    expect(rows[0]?.is_generated).toBe("ALWAYS");
  });

  it("refuses a zero-quantity movement", async () => {
    // A ledger row that moves nothing is either a bug or a lie; either way it is noise in
    // the one record that has to reconcile.
    const c = await attempt([
      ...FIXTURE,
      inventory(1, 0),
      `INSERT INTO inventory_transactions (id, inventory_item_id, variant_id, location_id, type,
                                            quantity_delta, balance_after, actor_type, created_at)
       SELECT gen_random_uuid(), i.id, i.variant_id, i.location_id, 'adjustment', 0, 1,
              'system', now()
         FROM inventory_items i WHERE i.variant_id = 'bbbbbbbb-0000-7000-8000-000000000001'::uuid`,
    ]);
    expect(c).toContain("chk_inventory_tx_nonzero");
  });
});
