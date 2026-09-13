import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { db } from "@/lib/db/client";
import { getDisplayPrice } from "@/lib/pricing";
import { recordMetalRate } from "@/lib/pricing/rates";
import { permissionsForRoles, type StaffActor } from "@/lib/rbac";

/**
 * Commissioned by 09 P12 exit criterion (a) and R03 — **"a metal-rate update silently moves
 * live prices"**, the risk this whole phase is shaped around.
 *
 * The scenario: the client raises the silver rate on a Tuesday morning because their supplier
 * did. If that write touches `prices`, then every silver-linked piece on the site is repriced
 * at 09:14 with no preview, no approver and no record of a decision — and nobody finds out
 * until a customer asks why a ring costs £30 more than it did when they added it to a
 * wishlist. The `price_history` row would say `reason = 'metal_rate'` and
 * `recalc_run_id = NULL`: a price nobody approved.
 *
 * **The mitigation is an absence, so the test asserts an absence FOUR ways:** byte-identical
 * price rows, an identical `getDisplayPrice()`, zero new `price_history` rows, and zero cache
 * purges. Plus a structural assertion that `rates.ts` cannot reach a price writer at all —
 * because the first three would all pass on the day someone adds the import and the fourth
 * would not.
 */

const stamp = Date.now();
const prefix = `zz-p12r-${String(stamp)}`;
const owner: StaffActor = {
  kind: "staff",
  userId: "00000000-0000-7000-8000-000000000001",
  roles: ["owner"],
  permissions: permissionsForRoles(["owner"]),
  totpVerifiedAt: new Date(),
};

let productId = "";
let variantId = "";
let materialId = "";
const markets: { code: string; currency: string }[] = [];

beforeAll(async () => {
  const ms = await db.$queryRaw<{ code: string; currency_code: string }[]>`
    SELECT code, currency_code FROM markets WHERE is_active ORDER BY code
  `;
  for (const m of ms) markets.push({ code: m.code, currency: m.currency_code });
  expect(markets.length).toBeGreaterThanOrEqual(2);

  const mat = await db.$queryRaw<{ id: string }[]>`
    SELECT id::text AS id FROM materials WHERE is_rate_linked AND deleted_at IS NULL
    ORDER BY rank LIMIT 1
  `;
  // The seed marks silver rate-linked. Without one the whole test would pass vacuously.
  expect(mat[0], "no rate-linked material seeded").toBeDefined();
  materialId = mat[0]!.id;

  const p = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO products (id, slug, title, status, published_at, rank, search_text, version,
                          created_at, updated_at)
    VALUES (gen_random_uuid(), ${prefix}, 'ZZ P12R', 'active', now() - interval '1 hour', 0, '',
            1, now(), now())
    RETURNING id::text AS id
  `;
  productId = p[0]!.id;

  const v = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO product_variants (id, product_id, sku, position, inventory_policy,
                                  option_signature, is_active, version, created_at, updated_at)
    VALUES (gen_random_uuid(), ${productId}::uuid, 'MD-ZZR-ZZR-R001-NA', 0, 'tracked', '',
            true, 1, now(), now())
    RETURNING id::text AS id
  `;
  variantId = v[0]!.id;
  await db.$executeRaw`
    INSERT INTO variant_materials (variant_id, material_id, weight_grams, is_primary, created_at)
    VALUES (${variantId}::uuid, ${materialId}::uuid, 6.400, true, now())
  `;

  // A METAL-LINKED price in both markets — the kind a rate change would move if anything
  // moved it. A manual-only fixture would pass this test for the wrong reason.
  const f = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO pricing_formulas (id, name, slug, is_active, version, created_at, updated_at)
    VALUES (gen_random_uuid(), 'ZZ P12R', ${`${prefix}-f`}, true, 1, now(), now())
    RETURNING id::text AS id
  `;
  const fv = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO pricing_formula_versions (id, formula_id, version_no, material_id, purity_source,
                                          weight_source, making_charge_mode, making_charge_bp,
                                          include_stone_cost, include_other_material_cost,
                                          markup_mode, markup_bp, created_at)
    VALUES (gen_random_uuid(), ${f[0]!.id}::uuid, 1, ${materialId}::uuid, 'material',
            'variant_primary', 'percent_of_metal', 15000, true, true,
            'percent_of_subtotal', 12000, now())
    RETURNING id::text AS id
  `;
  await db.$executeRaw`
    UPDATE pricing_formulas SET published_version_id = ${fv[0]!.id}::uuid WHERE id = ${f[0]!.id}::uuid
  `;

  for (const m of markets) {
    await db.$executeRaw`
      INSERT INTO pricing_formula_market_terms (formula_version_id, market_code, currency_code,
                                                rounding_increment_minor, rounding_mode, created_at)
      VALUES (${fv[0]!.id}::uuid, ${m.code}, ${m.currency}, 100, 'half_up', now())
    `;
    await db.$executeRaw`
      INSERT INTO price_formula_bindings (id, product_id, variant_id, market_code, currency_code,
                                          formula_id, mode, is_active, version, created_at, updated_at)
      VALUES (gen_random_uuid(), ${productId}::uuid, ${variantId}::uuid, ${m.code}, ${m.currency},
              ${f[0]!.id}::uuid, 'metal_linked', true, 1, now(), now())
    `;
    // The rate the existing price was computed from.
    const rate = await recordMetalRate(owner, {
      materialId,
      currencyCode: m.currency,
      rateMinorPerGram: m.currency === "USD" ? 1_050_000n : 92_500_000n,
      rateScale: 4,
      effectiveAt: new Date(Date.now() - 86_400_000),
      source: "zz-p12r",
    });
    await db.$executeRaw`
      INSERT INTO prices (id, product_id, variant_id, market_code, currency_code, list_minor,
                          price_source, valid_from, created_at,
                          material_id, metal_rate_id, metal_weight_grams, formula_version_id,
                          metal_component_minor, making_charge_computed_minor, stone_cost_minor,
                          other_material_cost_minor, markup_minor, market_adjustment_delta_minor,
                          floor_adjustment_minor, computed_base_minor, rounding_adjustment_minor)
      VALUES (gen_random_uuid(), ${productId}::uuid, ${variantId}::uuid, ${m.code}, ${m.currency},
              16000, 'metal_linked', now() - interval '1 hour', now(),
              ${materialId}::uuid, ${rate.id}::uuid, 6.400, ${fv[0]!.id}::uuid,
              622, 932, 4500, 1200, 8705, 0, 0, 15959, 41)
    `;
  }
});

afterAll(async () => {
  await db.$executeRaw`DELETE FROM price_formula_bindings WHERE product_id IN (SELECT id FROM products WHERE slug = ${prefix})`;
  await db.$executeRaw`DELETE FROM price_history WHERE product_id IN (SELECT id FROM products WHERE slug = ${prefix})`;
  await db.$executeRaw`DELETE FROM prices WHERE product_id IN (SELECT id FROM products WHERE slug = ${prefix})`;
  await db.$executeRaw`DELETE FROM products WHERE slug = ${prefix}`;
  await db.$executeRaw`DELETE FROM metal_rates WHERE source = 'zz-p12r'`;
  await db.$executeRaw`
    DELETE FROM pricing_formula_market_terms WHERE formula_version_id IN (
      SELECT v.id FROM pricing_formula_versions v JOIN pricing_formulas f ON f.id = v.formula_id
      WHERE f.slug = ${`${prefix}-f`})`;
  await db.$executeRaw`UPDATE pricing_formulas SET published_version_id = NULL WHERE slug = ${`${prefix}-f`}`;
  await db.$executeRaw`DELETE FROM pricing_formula_versions WHERE formula_id IN (SELECT id FROM pricing_formulas WHERE slug = ${`${prefix}-f`})`;
  await db.$executeRaw`DELETE FROM pricing_formulas WHERE slug = ${`${prefix}-f`}`;
  vi.restoreAllMocks();
});

async function priceRows(): Promise<unknown[]> {
  const rows = await db.$queryRaw<{ row: unknown }[]>`
    SELECT to_jsonb(p.*) AS row FROM prices p
     WHERE p.product_id = ${productId}::uuid ORDER BY p.market_code
  `;
  return rows.map((r) => r.row);
}

describe("P12 (a) — raising the silver rate 30% moves nothing", () => {
  it("leaves every prices row byte-identical", async () => {
    const before = await priceRows();
    const historyBefore = await db.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM price_history WHERE product_id = ${productId}::uuid`;
    const displayBefore = await Promise.all(
      markets.map(async (m) => [m.code, await getDisplayPrice([variantId], m.code)] as const),
    );

    // The Tuesday morning write. Thirty per cent, in both currencies, independently.
    for (const m of markets) {
      await recordMetalRate(owner, {
        materialId,
        currencyCode: m.currency,
        rateMinorPerGram: m.currency === "USD" ? 1_365_000n : 120_250_000n,
        rateScale: 4,
        effectiveAt: new Date(),
        source: "zz-p12r",
      });
    }

    // 1. Every column of every row, as JSON. Asserting only `list_minor` would pass while a
    //    metal_rate_id or a computed_base_minor quietly moved underneath.
    expect(await priceRows()).toEqual(before);

    // 2. Zero new price_history rows. A repricing that left no history would be worse, not
    //    better, so the absence of history here has to be paired with (1).
    const historyAfter = await db.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM price_history WHERE product_id = ${productId}::uuid`;
    expect(historyAfter[0]!.n).toBe(historyBefore[0]!.n);

    // 3. What a shopper is quoted is unchanged, in both markets.
    for (const [code, expected] of displayBefore) {
      const now = await getDisplayPrice([variantId], code);
      expect([...now], `display changed in ${code}`).toEqual([...expected]);
    }
  });

  it("did record the rates — so the assertions above are about restraint, not failure", async () => {
    // The test would pass identically if recordMetalRate threw every time. This is what
    // separates "moved nothing because it did nothing" from "moved nothing by design".
    const rows = await db.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM metal_rates WHERE source = 'zz-p12r'`;
    expect(rows[0]!.n).toBe(markets.length * 2);
  });

  it("and the new rate really is 30% higher", async () => {
    const rows = await db.$queryRaw<{ rate_minor_per_gram: bigint }[]>`
      SELECT rate_minor_per_gram FROM metal_rates
       WHERE source = 'zz-p12r' AND currency_code = 'USD'
       ORDER BY effective_at DESC LIMIT 1`;
    expect(BigInt(rows[0]!.rate_minor_per_gram)).toBe(1_365_000n);
  });
});

/**
 * Source with BOTH comment forms removed.
 *
 * A scan that reads its own explanation finds itself: `rates.ts`'s header says, in prose, that
 * it contains no `UPDATE prices` — and a `//`-only strip leaves that sentence in the text being
 * searched. That is the third time a guard in this repository has matched a comment about the
 * thing it forbids (the migration guard at P06, the money-arithmetic scan at P11). Stripping
 * both forms is the fix; noticing that the failure mode recurs is the point.
 */
function codeOf(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}

describe("the mitigation is structural, not behavioural", () => {
  it("rates.ts imports nothing that writes a price", () => {
    // The three assertions above would all pass on the day someone adds the import, right up
    // until the first rate is entered. This one fails on the commit that adds it.
    const src = readFileSync("src/lib/pricing/rates.ts", "utf8");
    for (const forbidden of [
      "pricing/recalc",
      "pricing/manual",
      "setManualPrice",
      "applyRecalcRun",
    ]) {
      expect(src, `rates.ts must not reach ${forbidden}`).not.toContain(forbidden);
    }
  });

  it("rates.ts contains no write to prices, price_history or a cache tag", () => {
    const src = codeOf("src/lib/pricing/rates.ts");
    expect(src).not.toMatch(/INSERT\s+INTO\s+prices/i);
    expect(src).not.toMatch(/UPDATE\s+prices/i);
    expect(src).not.toMatch(/INSERT\s+INTO\s+price_history/i);
    expect(src).not.toMatch(/revalidateTag|revalidatePath/);
  });

  it("the only table rates.ts writes is metal_rates", () => {
    const src = codeOf("src/lib/pricing/rates.ts");
    const writes = [...src.matchAll(/INSERT\s+INTO\s+"?(\w+)"?/gi)].map((m) =>
      m[1]!.toLowerCase(),
    );
    expect([...new Set(writes)]).toEqual(["metal_rates"]);
  });
});
