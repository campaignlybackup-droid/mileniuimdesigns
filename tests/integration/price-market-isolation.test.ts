import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { resolvePrice, setManualPrice } from "@/lib/pricing";
import { permissionsForRoles, type StaffActor } from "@/lib/rbac";
import { ConflictError, ManualOverrideError } from "@/lib/errors";

/**
 * Commissioned by 09 P11 exit criteria (a) and (f).
 *
 * (a) "Editing USD leaves the INR `prices` row BYTE-IDENTICAL."
 *
 * Hard rule 2 in its most literal form. The failure this prevents is not a bug in a conversion
 * routine — it is a *form*: one price field, one save button, two rows written. The service
 * takes ONE market per call and there is no multi-market write, so the second row cannot be
 * touched by a caller that only meant to touch the first.
 *
 * (f) A market with `prices_include_tax = true` gets the GROSS, as-displayed figure and no
 * extraction happens here. Extraction is one operation in one place (`src/lib/orders/`, P23);
 * doing it in the resolver would mean every caller had to know whether its number was gross or
 * net, and the first one that guessed wrong would be off by the GST rate.
 */

const stamp = Date.now();
const prefix = `zz-p11m-${String(stamp)}`;
const owner: StaffActor = {
  kind: "staff",
  userId: "00000000-0000-7000-8000-000000000001",
  roles: ["owner"],
  permissions: permissionsForRoles(["owner"]),
  totpVerifiedAt: new Date(),
};

let productId = "";
let variantId = "";
const markets: { code: string; currency: string; includesTax: boolean }[] = [];

beforeAll(async () => {
  const ms = await db.$queryRaw<
    { code: string; currency_code: string; prices_include_tax: boolean }[]
  >`
    SELECT code, currency_code, prices_include_tax FROM markets WHERE is_active ORDER BY code
  `;
  for (const m of ms) {
    markets.push({
      code: m.code,
      currency: m.currency_code,
      includesTax: m.prices_include_tax,
    });
  }
  expect(markets.length).toBeGreaterThanOrEqual(2);

  const p = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO products (id, slug, title, status, published_at, rank, search_text, version,
                          created_at, updated_at)
    VALUES (gen_random_uuid(), ${prefix}, 'ZZ P11M', 'active', now() - interval '1 hour', 0, '',
            1, now(), now())
    RETURNING id::text AS id
  `;
  productId = p[0]!.id;

  const v = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO product_variants (id, product_id, sku, position, inventory_policy,
                                  option_signature, is_active, version, created_at, updated_at)
    VALUES (gen_random_uuid(), ${productId}::uuid, 'MD-ZZM-ZZM-M001-NA', 0, 'tracked', '',
            true, 1, now(), now())
    RETURNING id::text AS id
  `;
  variantId = v[0]!.id;

  for (const [i, m] of markets.entries()) {
    await setManualPrice(owner, {
      productId,
      variantId,
      marketCode: m.code,
      listMinor: BigInt(100000 * (i + 1)),
      saleMinor: null,
      compareAtMinor: null,
      costMinor: null,
      expectedPriceId: null,
      reason: "manual_edit",
    });
  }
});

afterAll(async () => {
  await db.$executeRaw`
    DELETE FROM price_history WHERE product_id IN (SELECT id FROM products WHERE slug = ${prefix})`;
  await db.$executeRaw`
    DELETE FROM prices WHERE product_id IN (SELECT id FROM products WHERE slug = ${prefix})`;
  await db.$executeRaw`DELETE FROM products WHERE slug = ${prefix}`;
});

/** Every column of the live row, so "unchanged" means unchanged and not "same list price". */
async function snapshot(marketCode: string): Promise<Record<string, unknown>> {
  const rows = await db.$queryRaw<Record<string, unknown>[]>`
    SELECT to_jsonb(p.*) AS row FROM prices p
     WHERE p.variant_id = ${variantId}::uuid AND p.market_code = ${marketCode}
       AND p.valid_to IS NULL AND p.deleted_at IS NULL
  `;
  return rows[0]!["row"] as Record<string, unknown>;
}

describe("P11 (a) — a per-market edit touches one market", () => {
  it("leaves the other market's row byte-identical", async () => {
    const [first, second] = markets;
    const before = await snapshot(second!.code);
    const currentFirst = await snapshot(first!.code);

    await setManualPrice(owner, {
      productId,
      variantId,
      marketCode: first!.code,
      listMinor: 123456n,
      saleMinor: 99999n,
      compareAtMinor: null,
      costMinor: null,
      expectedPriceId: String(currentFirst["id"]),
      reason: "manual_edit",
    });

    const after = await snapshot(second!.code);
    // EVERY column, compared as JSON. Asserting only `list_minor` would pass while a
    // currency_code, a valid_from or a price_source quietly changed underneath.
    expect(after).toEqual(before);
  });

  it("did change the market that was edited — so the assertion above means something", async () => {
    const edited = await snapshot(markets[0]!.code);
    expect(BigInt(edited["list_minor"] as string)).toBe(123456n);
    expect(BigInt(edited["sale_minor"] as string)).toBe(99999n);
  });

  it("supersedes rather than updating — the old row is still readable", async () => {
    const rows = await db.$queryRaw<{ n: number; live: number }[]>`
      SELECT count(*)::int AS n,
             count(*) FILTER (WHERE valid_to IS NULL)::int AS live
        FROM prices
       WHERE variant_id = ${variantId}::uuid AND market_code = ${markets[0]!.code}
    `;
    // Two rows, one live. An order placed against the old price stays explicable because the
    // row it names still exists.
    expect(rows[0]!.n).toBe(2);
    expect(rows[0]!.live).toBe(1);
  });

  it("writes a price_history row naming the actor and the previous figure", async () => {
    const rows = await db.$queryRaw<
      {
        previous_list_minor: string | null;
        new_list_minor: string;
        actor_user_id: string | null;
      }[]
    >`
      SELECT previous_list_minor, new_list_minor, actor_user_id::text AS actor_user_id
        FROM price_history
       WHERE variant_id = ${variantId}::uuid AND market_code = ${markets[0]!.code}
       ORDER BY created_at DESC LIMIT 1
    `;
    expect(BigInt(rows[0]!.new_list_minor)).toBe(123456n);
    expect(
      rows[0]!.previous_list_minor === null ? null : BigInt(rows[0]!.previous_list_minor),
    ).toBe(100000n);
    expect(rows[0]!.actor_user_id).toBe(owner.userId);
  });

  it("refuses a stale edit rather than creating a second live row", async () => {
    await expect(
      setManualPrice(owner, {
        productId,
        variantId,
        marketCode: markets[0]!.code,
        listMinor: 1n,
        saleMinor: null,
        compareAtMinor: null,
        costMinor: null,
        // The id that was superseded a moment ago.
        expectedPriceId: "00000000-0000-7000-8000-0000000000ff",
        reason: "manual_edit",
      }),
    ).rejects.toThrow(ConflictError);
  });

  it("refuses a first-price write when a price already exists", async () => {
    // `expectedPriceId: null` claims there is no live row. The claim is checked, not trusted:
    // closing whatever is live would silently overwrite a price the caller did not know about.
    await expect(
      setManualPrice(owner, {
        productId,
        variantId,
        marketCode: markets[0]!.code,
        listMinor: 1n,
        saleMinor: null,
        compareAtMinor: null,
        costMinor: null,
        expectedPriceId: null,
        reason: "manual_edit",
      }),
    ).rejects.toThrow(ConflictError);
  });
});

describe("P11 — a manual price and a formula binding are mutually exclusive", () => {
  it("refuses a manual price on a formula-bound variant", async () => {
    // Without this the merchandiser's holiday price survives until that night's approved
    // recalc run reverts it, with no error raised and nobody looking at the SKU again until
    // the campaign report (04 §2.2).
    const f = await db.$queryRaw<{ id: string }[]>`
      INSERT INTO pricing_formulas (id, name, slug, is_active, version, created_at, updated_at)
      VALUES (gen_random_uuid(), 'ZZ P11M', ${`${prefix}-f`}, true, 1, now(), now())
      RETURNING id::text AS id
    `;
    await db.$executeRaw`
      INSERT INTO price_formula_bindings (id, product_id, variant_id, market_code, currency_code,
                                          formula_id, mode, is_active, version, created_at, updated_at)
      VALUES (gen_random_uuid(), ${productId}::uuid, ${variantId}::uuid, ${markets[0]!.code},
              ${markets[0]!.currency}, ${f[0]!.id}::uuid, 'metal_linked', true, 1, now(), now())
    `;

    const current = await snapshot(markets[0]!.code);
    await expect(
      setManualPrice(owner, {
        productId,
        variantId,
        marketCode: markets[0]!.code,
        listMinor: 18900n,
        saleMinor: null,
        compareAtMinor: null,
        costMinor: null,
        expectedPriceId: String(current["id"]),
        reason: "manual_edit",
      }),
    ).rejects.toThrow(ManualOverrideError);

    await db.$executeRaw`DELETE FROM price_formula_bindings WHERE variant_id = ${variantId}::uuid`;
    await db.$executeRaw`DELETE FROM pricing_formulas WHERE slug = ${`${prefix}-f`}`;
  });
});

describe("P11 (f) — a tax-inclusive market returns the gross figure, unextracted", () => {
  it("returns exactly the stored amount in every market, whatever its tax mode", async () => {
    // India displays tax-inclusive, the US tax-exclusive. The resolver always returns GROSS,
    // which here means: exactly what is stored. If it extracted GST, the Indian number would
    // come back smaller than its own `prices` row and every caller would have to know which
    // of the two it was holding.
    const taxInclusive = markets.filter((m) => m.includesTax);
    expect(taxInclusive.length, "no tax-inclusive market to test").toBeGreaterThan(0);

    for (const m of markets) {
      const stored = await snapshot(m.code);
      const resolved = await resolvePrice({
        variantId,
        marketCode: m.code,
        quantity: 1,
        client: db,
      });
      expect(resolved.unitListMinor, `${m.code} list`).toBe(
        BigInt(stored["list_minor"] as string),
      );
      expect(resolved.currencyCode, `${m.code} currency`).toBe(m.currency);
    }
  });

  it("performs no extraction anywhere in the pricing module", async () => {
    // The static half. Extraction is one operation in one place; a second implementation in
    // the resolver would be the thing that makes two numbers both plausible.
    const { readFileSync, readdirSync } = await import("node:fs");
    const files = readdirSync("src/lib/pricing").filter((f) => f.endsWith(".ts"));
    for (const f of files) {
      const src = readFileSync(`src/lib/pricing/${f}`, "utf8").replace(/\/\/.*$/gm, "");
      expect(src, `${f} extracts tax`).not.toMatch(/extractTax|netOf|exTax|taxExclusive/);
    }
  });
});
