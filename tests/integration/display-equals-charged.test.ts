import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { getDisplayPrice, getProductPriceRanges, resolvePrice } from "@/lib/pricing";

/**
 * Commissioned by 04 §1.1 and 09 P11 exit criterion (e).
 *
 * **A card that says $248 over a bag that says $198 is a wrong price even though both numbers
 * are individually correct.** This is the gate nobody thinks of until a customer does, and the
 * way it breaks is entirely mundane: the card reads `prices.list_minor` because that is one
 * cheap query, the bag goes through the rule stack, and the two agree perfectly right up until
 * someone adds the first `pricing_rules` row — at which point every listing on the site
 * overstates its prices and nothing fails.
 *
 * `getDisplayPrice` is therefore `resolvePriceBatch` at quantity 1, not a cheaper query that
 * happens to agree. This asserts the integers match across a sweep of markets and rules.
 *
 * (09 names this `tests/unit/`. It needs products, variants, prices and live rules in two
 * markets, so it is an integration test — calling it a unit test would either make
 * `npm run verify` require a database or make the test a mock of the thing under test.)
 */

const stamp = Date.now();
const prefix = `zz-p11d-${String(stamp)}`;
let productId = "";
let variantIds: string[] = [];
let ruleId = "";
const markets: { code: string; currency: string }[] = [];

beforeAll(async () => {
  const ms = await db.$queryRaw<{ code: string; currency_code: string }[]>`
    SELECT code, currency_code FROM markets WHERE is_active ORDER BY code
  `;
  for (const m of ms) markets.push({ code: m.code, currency: m.currency_code });
  expect(markets.length).toBeGreaterThanOrEqual(2);

  const p = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO products (id, slug, title, status, published_at, rank, search_text, version,
                          created_at, updated_at)
    VALUES (gen_random_uuid(), ${prefix}, 'ZZ P11D FIXTURE', 'active', now() - interval '1 hour',
            0, '', 1, now(), now())
    RETURNING id::text AS id
  `;
  productId = p[0]!.id;

  // Three variants at different list prices, so a RANGE has something to range over.
  for (const [i, listMinor] of [24800, 19800, 31200].entries()) {
    const v = await db.$queryRaw<{ id: string }[]>`
      INSERT INTO product_variants (id, product_id, sku, position, inventory_policy,
                                    option_signature, is_active, version, created_at, updated_at)
      VALUES (gen_random_uuid(), ${productId}::uuid,
              ${`MD-ZZD-ZZD-D${String(i)}01-NA`}, ${i}, 'tracked', '', true, 1, now(), now())
      RETURNING id::text AS id
    `;
    variantIds.push(v[0]!.id);
    for (const m of markets) {
      await db.$executeRaw`
        INSERT INTO prices (id, product_id, variant_id, market_code, currency_code, list_minor,
                            sale_minor, compare_at_minor, price_source, valid_from, created_at)
        VALUES (gen_random_uuid(), ${productId}::uuid, ${v[0]!.id}::uuid, ${m.code}, ${m.currency},
                ${BigInt(listMinor)}, ${BigInt(listMinor - 1000)}, ${BigInt(listMinor + 5000)},
                'manual', now() - interval '1 hour', now())
      `;
    }
  }
});

afterAll(async () => {
  await db.$executeRaw`DELETE FROM pricing_rules WHERE name LIKE ${`${prefix}%`}`;
  await db.$executeRaw`
    DELETE FROM prices WHERE product_id IN (SELECT id FROM products WHERE slug = ${prefix})`;
  await db.$executeRaw`DELETE FROM products WHERE slug = ${prefix}`;
  variantIds = [];
});

async function assertAgreement(label: string): Promise<void> {
  for (const m of markets) {
    const display = await getDisplayPrice(variantIds, m.code);
    expect(display.size, `${label}: ${m.code} display map`).toBe(variantIds.length);

    for (const variantId of variantIds) {
      const charged = await resolvePrice({ variantId, marketCode: m.code, quantity: 1 });
      const shown = display.get(variantId)!;
      expect(shown.currencyCode, `${label}: ${m.code} currency`).toBe(charged.currencyCode);
      expect(shown.listMinor, `${label}: ${m.code} ${variantId} list`).toBe(
        charged.unitListMinor,
      );
      // The one that matters: what the card advertises is what the bag charges.
      expect(shown.saleMinor, `${label}: ${m.code} ${variantId} sale`).toBe(
        charged.unitFinalMinor,
      );
    }

    const ranges = await getProductPriceRanges([productId], m.code);
    const range = ranges.get(productId)!;
    const finals = await Promise.all(
      variantIds.map(
        async (variantId) =>
          (await resolvePrice({ variantId, marketCode: m.code })).unitFinalMinor,
      ),
    );
    expect(range.minSaleMinor, `${label}: ${m.code} "from" price`).toBe(
      finals.reduce((a, b) => (b < a ? b : a)),
    );
    expect(range.pricedVariantCount).toBe(variantIds.length);
    expect(range.totalVariantCount).toBe(variantIds.length);
  }
}

describe("P11 (e) — what the card says is what the bag charges", () => {
  it("agrees with no rules live", async () => {
    await assertAgreement("no rules");
  });

  it("still agrees once a percentage rule is live", async () => {
    // The exact moment the naive implementation diverges. Before this row both read
    // `prices.sale_minor` and match; after it, only a display built on the resolver does.
    const m = markets[0]!;
    const rows = await db.$queryRaw<{ id: string }[]>`
      INSERT INTO pricing_rules (id, name, scope_type, scope_id, market_code, currency_code,
                                 adjustment_type, amount_basis, value_bp, priority, is_stackable,
                                 is_active, version, created_at, updated_at)
      VALUES (gen_random_uuid(), ${`${prefix}-pct`}, 'product', ${productId}::uuid, ${m.code},
              ${m.currency}, 'percentage_off', 'per_unit', 1500, 0, false, true, 1, now(), now())
      RETURNING id::text AS id
    `;
    ruleId = rows[0]!.id;

    const display = await getDisplayPrice(variantIds, m.code);
    const charged = await resolvePrice({ variantId: variantIds[0]!, marketCode: m.code });
    // The rule really did move the number, so the agreement below is not two copies of the
    // undiscounted figure agreeing with each other.
    expect(charged.unitFinalMinor).toBeLessThan(charged.unitSaleMinor);
    expect(display.get(variantIds[0]!)!.saleMinor).toBe(charged.unitFinalMinor);

    await assertAgreement("percentage rule live");
  });

  it("leaves the OTHER market untouched — a rule is per market", async () => {
    // The rule above names markets[0]. If a currency-blind implementation applied it
    // everywhere, this is where a 15% American markdown would appear on Indian prices.
    const other = markets[1]!;
    const charged = await resolvePrice({ variantId: variantIds[0]!, marketCode: other.code });
    expect(charged.unitFinalMinor).toBe(charged.unitSaleMinor);
    expect(charged.currencyCode).toBe(other.currency);
  });

  it("carries compare_at through to the card without recomputing it", async () => {
    const m = markets[0]!;
    const display = await getDisplayPrice(variantIds, m.code);
    const shown = display.get(variantIds[0]!)!;
    // The struck-through figure is a stored merchandising claim, not `listMinor` with
    // something added — a component computing it would be inventing a former price.
    expect(shown.compareAtMinor).toBe(24800n + 5000n);
  });

  it("reports an unpriced variant as absent rather than as zero", async () => {
    await db.$executeRaw`
      UPDATE prices SET valid_to = now()
       WHERE variant_id = ${variantIds[2]!}::uuid AND market_code = ${markets[0]!.code}
    `;
    const display = await getDisplayPrice(variantIds, markets[0]!.code);
    expect(display.has(variantIds[2]!)).toBe(false);
    expect(display.size).toBe(variantIds.length - 1);

    // And the surrounding cards still render. This is why the batch omits instead of throwing.
    expect(display.has(variantIds[0]!)).toBe(true);

    const ranges = await getProductPriceRanges([productId], markets[0]!.code);
    const range = ranges.get(productId)!;
    expect(range.pricedVariantCount).toBe(2);
    expect(range.totalVariantCount).toBe(3);

    await db.$executeRaw`
      UPDATE prices SET valid_to = NULL
       WHERE variant_id = ${variantIds[2]!}::uuid AND market_code = ${markets[0]!.code}
    `;
  });

  it("reports a product with nothing priced, rather than omitting it", async () => {
    // "Exists and is not purchasable here" is a state the storefront renders. Omitting it
    // would make it indistinguishable from a product that does not exist.
    await db.$executeRaw`
      UPDATE prices SET valid_to = now() WHERE product_id = ${productId}::uuid
        AND market_code = ${markets[0]!.code}`;
    const ranges = await getProductPriceRanges([productId], markets[0]!.code);
    expect(ranges.has(productId)).toBe(true);
    expect(ranges.get(productId)!.pricedVariantCount).toBe(0);
    expect(ranges.get(productId)!.totalVariantCount).toBe(3);
    await db.$executeRaw`
      UPDATE prices SET valid_to = NULL WHERE product_id = ${productId}::uuid
        AND market_code = ${markets[0]!.code}`;
    expect(ruleId.length).toBeGreaterThan(0);
  });
});
