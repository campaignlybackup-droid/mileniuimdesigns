import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { resolvePrice } from "@/lib/pricing";

/**
 * Commissioned by 03 and 09 P11 — customer-group pricing is a `pricing_rules` row with
 * `scope_type = 'customer_group'`, and **there is no second price table** (02 §2.3).
 *
 * The thing this protects: an anonymous shopper never inherits a group's price. `retail` looks
 * like a harmless default until the client creates a `trade` group at 30% off and a
 * mis-defaulted anonymous session starts quoting it on the open storefront.
 */

const stamp = Date.now();
const prefix = `zz-p11g-${String(stamp)}`;
let productId = "";
let variantId = "";
let customerId = "";
let groupId = "";
let market = { code: "US", currency: "USD" };

beforeAll(async () => {
  const m = await db.$queryRaw<{ code: string; currency_code: string }[]>`
    SELECT code, currency_code FROM markets WHERE is_active ORDER BY rank LIMIT 1
  `;
  market = { code: m[0]!.code, currency: m[0]!.currency_code };

  const g = await db.$queryRaw<{ id: string }[]>`
    SELECT id::text AS id FROM customer_groups ORDER BY created_at LIMIT 1
  `;
  groupId = g[0]!.id;

  const c = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO customers (id, email, customer_group_id, accepts_marketing, created_at, updated_at)
    VALUES (gen_random_uuid(), ${`${prefix}@example.invalid`}, ${groupId}::uuid, false, now(), now())
    RETURNING id::text AS id
  `;
  customerId = c[0]!.id;

  const p = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO products (id, slug, title, status, published_at, rank, search_text, version,
                          created_at, updated_at)
    VALUES (gen_random_uuid(), ${prefix}, 'ZZ P11G', 'active', now() - interval '1 hour', 0, '',
            1, now(), now())
    RETURNING id::text AS id
  `;
  productId = p[0]!.id;

  const v = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO product_variants (id, product_id, sku, position, inventory_policy,
                                  option_signature, is_active, version, created_at, updated_at)
    VALUES (gen_random_uuid(), ${productId}::uuid, ${`MD-ZZG-ZZG-G001-NA`}, 0, 'tracked', '',
            true, 1, now(), now())
    RETURNING id::text AS id
  `;
  variantId = v[0]!.id;

  await db.$executeRaw`
    INSERT INTO prices (id, product_id, variant_id, market_code, currency_code, list_minor,
                        price_source, valid_from, created_at)
    VALUES (gen_random_uuid(), ${productId}::uuid, ${variantId}::uuid, ${market.code},
            ${market.currency}, 100000, 'manual', now() - interval '1 hour', now())
  `;
  await db.$executeRaw`
    INSERT INTO pricing_rules (id, name, scope_type, scope_id, market_code, currency_code,
                               adjustment_type, amount_basis, value_bp, priority, is_stackable,
                               is_active, version, created_at, updated_at)
    VALUES (gen_random_uuid(), ${`${prefix}-group`}, 'customer_group', ${groupId}::uuid,
            ${market.code}, ${market.currency}, 'percentage_off', 'per_unit', 3000, 0, false,
            true, 1, now(), now())
  `;
});

afterAll(async () => {
  await db.$executeRaw`DELETE FROM pricing_rules WHERE name LIKE ${`${prefix}%`}`;
  await db.$executeRaw`
    DELETE FROM prices WHERE product_id IN (SELECT id FROM products WHERE slug = ${prefix})`;
  await db.$executeRaw`DELETE FROM products WHERE slug = ${prefix}`;
  await db.$executeRaw`DELETE FROM customers WHERE email = ${`${prefix}@example.invalid`}`;
});

describe("customer-group pricing is a rule, not a second price table", () => {
  it("an anonymous shopper gets the undiscounted price", async () => {
    // Step 6 is skipped entirely with no customerId. It never inherits a group implicitly.
    const anon = await resolvePrice({ variantId, marketCode: market.code, quantity: 1 });
    expect(anon.unitFinalMinor).toBe(100000n);
    expect(anon.discountBreakdown).toEqual([]);
  });

  it("a customer in the group gets the group price", async () => {
    const member = await resolvePrice({
      variantId,
      marketCode: market.code,
      quantity: 1,
      customerId,
    });
    expect(member.unitFinalMinor).toBe(70000n);
    expect(member.discountBreakdown).toHaveLength(1);
    expect(member.discountBreakdown[0]!.kind).toBe("customer_group");
    expect(member.discountBreakdown[0]!.amountMinor).toBe(-30000n);
  });

  it("the two differ — which is what makes the anonymous assertion mean something", async () => {
    const anon = await resolvePrice({ variantId, marketCode: market.code, quantity: 1 });
    const member = await resolvePrice({
      variantId,
      marketCode: market.code,
      quantity: 1,
      customerId,
    });
    expect(member.unitFinalMinor).toBeLessThan(anon.unitFinalMinor);
  });

  it("there is no second price table — the discount comes from pricing_rules", async () => {
    // If a group price were ever stored as its own `prices` row, this count would be 2 and
    // `idx_prices_active` would have refused it. Asserting the count is what stops a future
    // "customer_group_prices" table from being added quietly.
    const rows = await db.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM prices
       WHERE variant_id = ${variantId}::uuid AND valid_to IS NULL AND deleted_at IS NULL
    `;
    expect(rows[0]!.n).toBe(1);
  });

  it("the group rule does not leak into the other market", async () => {
    const other = await db.$queryRaw<{ code: string }[]>`
      SELECT code FROM markets WHERE is_active AND code <> ${market.code} LIMIT 1
    `;
    if (!other[0]) return;
    await db.$executeRaw`
      INSERT INTO prices (id, product_id, variant_id, market_code, currency_code, list_minor,
                          price_source, valid_from, created_at)
      SELECT gen_random_uuid(), ${productId}::uuid, ${variantId}::uuid, m.code, m.currency_code,
             8400000, 'manual', now() - interval '1 hour', now()
      FROM markets m WHERE m.code = ${other[0].code}
    `;
    const elsewhere = await resolvePrice({
      variantId,
      marketCode: other[0].code,
      quantity: 1,
      customerId,
    });
    // The rule names one market. A currency-blind implementation would apply 30% here too.
    expect(elsewhere.unitFinalMinor).toBe(8400000n);
    expect(elsewhere.discountBreakdown).toEqual([]);
  });
});
