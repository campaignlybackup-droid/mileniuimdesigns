import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { withTransaction } from "@/lib/db/transaction";
import { attributeSchema, setAttributeValues, toScaled } from "@/lib/catalog/attributes";
import { getFacetCounts, listFilteredProducts } from "@/lib/catalog/facets";
import { parseCatalogFilters, type CatalogFilters } from "@/lib/catalog/filters";
import { AttributeValidationError } from "@/lib/errors";
import { permissionsForRoles, type StaffActor } from "@/lib/rbac";

/**
 * Commissioned by 09 P09 — exit criteria (b) and (c), plus 03 §3.5's leave-one-out rule.
 *
 * The twelve products are synthetic and named so (hard rule 8). Their finishes and settings
 * are `zz-p09-*`, not jewellery vocabulary, because nothing here should be readable as a
 * statement about the client's catalogue.
 */

const stamp = Date.now();
const owner: StaffActor = {
  kind: "staff",
  userId: "00000000-0000-7000-8000-000000000001",
  roles: ["owner"],
  permissions: permissionsForRoles(["owner"]),
  totpVerifiedAt: new Date(),
};
const key = (n: string) => `zz_p09_${n}_${String(stamp)}`;
const MARKET = "US";

const TEXT = key("text");
const NUMBER = key("number");
const FINISH = key("finish");
const SETTING = key("setting");

let categoryId = "";
let currencyCode = "";
let productIds: string[] = [];
const attributeIds = new Map<string, string>();
/** option value → id */
const optionIds = new Map<string, string>();

const FINISH_VALUES = ["zz-a", "zz-b", "zz-c"] as const;
const SETTING_VALUES = ["zz-x", "zz-y"] as const;
const PRODUCT_COUNT = 12;

/** The assignment under test, mirrored here so brute force never reads the same code path. */
const finishOf = (i: number) => FINISH_VALUES[i % 3]!;
const settingOf = (i: number) => SETTING_VALUES[i % 2]!;

async function makeAttribute(
  k: string,
  dataType: string,
  opts: {
    filterable?: boolean;
    values?: readonly string[];
    decimalPlaces?: number;
    min?: string;
    max?: string;
  } = {},
): Promise<string> {
  const rows = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO attributes (id, key, label, data_type, is_filterable, is_comparable, scope,
                            is_required, decimal_places, value_min, value_max,
                            rank, version, created_at, updated_at)
    VALUES (gen_random_uuid(), ${k}, ${"ZZ " + k}, ${dataType}::attribute_data_type,
            ${opts.filterable ?? false}, false, 'product', false,
            ${opts.decimalPlaces ?? null}, ${opts.min ?? null}::numeric, ${opts.max ?? null}::numeric,
            9100, 1, now(), now())
    RETURNING id::text AS id
  `;
  const id = rows[0]!.id;
  attributeIds.set(k, id);
  for (const [rank, value] of (opts.values ?? []).entries()) {
    const o = await db.$queryRaw<{ id: string }[]>`
      INSERT INTO attribute_options (id, attribute_id, value, label, rank)
      VALUES (gen_random_uuid(), ${id}::uuid, ${value}, ${"ZZ " + value}, ${rank})
      RETURNING id::text AS id
    `;
    optionIds.set(`${k}:${value}`, o[0]!.id);
  }
  return id;
}

beforeAll(async () => {
  const market = await db.$queryRaw<{ currency_code: string }[]>`
    SELECT currency_code FROM markets WHERE code = ${MARKET}
  `;
  currencyCode = market[0]!.currency_code;

  const cat = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO categories (id, slug, name, materialized_path, depth, is_published, rank,
                            version, created_at, updated_at)
    VALUES (gen_random_uuid(), ${`zz-p09-${String(stamp)}`}, 'ZZ P09 SCOPE', '', 0, false, 9100,
            1, now(), now())
    RETURNING id::text AS id
  `;
  categoryId = cat[0]!.id;
  await db.$executeRaw`UPDATE categories SET materialized_path = id::text WHERE id = ${categoryId}::uuid`;

  await makeAttribute(TEXT, "text");
  await makeAttribute(NUMBER, "number", { decimalPlaces: 2, min: "0", max: "10" });
  await makeAttribute(FINISH, "select", { filterable: true, values: FINISH_VALUES });
  await makeAttribute(SETTING, "select", { filterable: true, values: SETTING_VALUES });

  for (let i = 0; i < PRODUCT_COUNT; i++) {
    const p = await db.$queryRaw<{ id: string }[]>`
      INSERT INTO products (id, slug, title, status, published_at, primary_category_id, rank,
                            search_text, version, created_at, updated_at)
      VALUES (gen_random_uuid(), ${`zz-p09-${String(stamp)}-${String(i)}`},
              ${`ZZ P09 FIXTURE ${String(i)}`}, 'active', now() - interval '1 hour',
              ${categoryId}::uuid, ${i}, '', 1, now(), now())
      RETURNING id::text AS id
    `;
    const productId = p[0]!.id;
    productIds.push(productId);
    await db.$executeRaw`
      INSERT INTO product_categories (product_id, category_id, rank, is_primary, created_at)
      VALUES (${productId}::uuid, ${categoryId}::uuid, 0, true, now())
    `;
    // Every listing and every facet count is gated on a live price in the market (03 §4.2,
    // wired at P10). An unpriced product is not visible, so a fixture without prices would
    // make every count below zero — and the brute-force comparison would agree, for the
    // wrong reason.
    await db.$executeRaw`
      INSERT INTO prices (id, product_id, variant_id, market_code, currency_code, list_minor,
                          price_source, valid_from, created_at)
      VALUES (gen_random_uuid(), ${productId}::uuid, NULL, ${MARKET}, ${currencyCode},
              ${BigInt(20000 + i * 100)}, 'manual', now(), now())
    `;
    await withTransaction(async (tx) => {
      await setAttributeValues(owner, tx, {
        productId,
        values: [
          {
            attributeId: attributeIds.get(FINISH)!,
            variantId: null,
            optionIds: [optionIds.get(`${FINISH}:${finishOf(i)}`)!],
          },
          {
            attributeId: attributeIds.get(SETTING)!,
            variantId: null,
            optionIds: [optionIds.get(`${SETTING}:${settingOf(i)}`)!],
          },
        ],
      });
    });
  }
});

afterAll(async () => {
  await db.$executeRaw`
    DELETE FROM prices WHERE product_id IN (
      SELECT id FROM products WHERE slug LIKE ${`zz-p09-${String(stamp)}%`}
    )`;
  await db.$executeRaw`DELETE FROM products WHERE slug LIKE ${`zz-p09-${String(stamp)}%`}`;
  await db.$executeRaw`DELETE FROM attributes WHERE key LIKE ${`zz_p09_%_${String(stamp)}`}`;
  await db.$executeRaw`DELETE FROM categories WHERE slug = ${`zz-p09-${String(stamp)}`}`;
  productIds = [];
});

/** The independent implementation criterion (c) compares against: one plain query per option,
 *  built from the assignment table above rather than from the code under test. */
async function bruteForceCount(
  attributeKey: string,
  value: string,
  otherPredicates: { attributeKey: string; values: string[] }[],
): Promise<number> {
  let matching = 0;
  for (let i = 0; i < PRODUCT_COUNT; i++) {
    const has = (k: string) => (k === FINISH ? finishOf(i) : settingOf(i));
    if (has(attributeKey) !== value) continue;
    if (otherPredicates.every((p) => p.values.includes(has(p.attributeKey)))) matching++;
  }
  return matching;
}

const filtersFor = (attributeKey: string, values: string[]): CatalogFilters => ({
  stoneIds: [],
  materialIds: [],
  attributes: [
    {
      attributeId: attributeIds.get(attributeKey)!,
      key: attributeKey,
      optionIds: values.map((v) => optionIds.get(`${attributeKey}:${v}`)!),
    },
  ],
});

describe("P09 (b) — a value of the wrong type is refused by Zod, before any statement", () => {
  it("refuses a number written into a text attribute", async () => {
    await expect(
      withTransaction((tx) =>
        setAttributeValues(owner, tx, {
          productId: productIds[0]!,
          values: [{ attributeId: attributeIds.get(TEXT)!, variantId: null, numeric: "4.25" }],
        }),
      ),
    ).rejects.toThrow(AttributeValidationError);
  });

  it("writes nothing when it refuses", async () => {
    const before = await db.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM product_attribute_values
      WHERE product_id = ${productIds[0]!}::uuid AND attribute_id = ${attributeIds.get(TEXT)!}::uuid
    `;
    await expect(
      withTransaction((tx) =>
        setAttributeValues(owner, tx, {
          productId: productIds[0]!,
          values: [{ attributeId: attributeIds.get(TEXT)!, variantId: null, numeric: "4.25" }],
        }),
      ),
    ).rejects.toThrow();
    const after = await db.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM product_attribute_values
      WHERE product_id = ${productIds[0]!}::uuid AND attribute_id = ${attributeIds.get(TEXT)!}::uuid
    `;
    expect(after[0]!.n).toBe(before[0]!.n);
    expect(after[0]!.n).toBe(0);
  });

  it("refuses text written into a number attribute, and an option id into either", async () => {
    for (const bad of [
      { text: "four and a quarter" },
      { optionIds: [optionIds.get(`${FINISH}:zz-a`)!] },
    ]) {
      await expect(
        withTransaction((tx) =>
          setAttributeValues(owner, tx, {
            productId: productIds[0]!,
            values: [{ attributeId: attributeIds.get(NUMBER)!, variantId: null, ...bad }],
          }),
        ),
      ).rejects.toThrow(AttributeValidationError);
    }
  });

  it("enforces decimal_places and range without going through a float", async () => {
    const schema = attributeSchema(
      {
        id: "x",
        key: NUMBER,
        dataType: "number",
        scope: "product",
        isRequired: false,
        unit: null,
        valueMin: "0",
        valueMax: "10",
        decimalPlaces: 2,
        maxLength: null,
      },
      new Set(),
    );
    expect(schema.safeParse({ numeric: "4.25" }).success).toBe(true);
    expect(schema.safeParse({ numeric: "4.253" }).success).toBe(false); // three places
    expect(schema.safeParse({ numeric: "10.01" }).success).toBe(false); // over max
    expect(schema.safeParse({ numeric: "-0.01" }).success).toBe(false); // under min
    // The comparison itself: 0.1 + 0.2 is not 0.3, and a scaled integer does not care.
    expect(toScaled("0.1") + toScaled("0.2")).toBe(toScaled("0.3"));
  });

  it("refuses an option that belongs to a different attribute", async () => {
    await expect(
      withTransaction((tx) =>
        setAttributeValues(owner, tx, {
          productId: productIds[0]!,
          values: [
            {
              attributeId: attributeIds.get(FINISH)!,
              variantId: null,
              optionIds: [optionIds.get(`${SETTING}:zz-x`)!],
            },
          ],
        }),
      ),
    ).rejects.toThrow(AttributeValidationError);
  });

  it("refuses a variant-scoped value on a product-scoped attribute", async () => {
    const v = await db.$queryRaw<{ id: string }[]>`SELECT gen_random_uuid()::text AS id`;
    await expect(
      withTransaction((tx) =>
        setAttributeValues(owner, tx, {
          productId: productIds[0]!,
          values: [
            {
              attributeId: attributeIds.get(FINISH)!,
              variantId: v[0]!.id,
              optionIds: [optionIds.get(`${FINISH}:zz-a`)!],
            },
          ],
        }),
      ),
    ).rejects.toThrow(AttributeValidationError);
  });
});

describe("P09 (c) — facet counts equal a brute-force count over the same predicate", () => {
  const scope = () => ({ kind: "category" as const, id: categoryId });

  it("matches brute force with no filters applied", async () => {
    const counts = await getFacetCounts({
      scope: scope(),
      marketCode: MARKET,
      filters: { stoneIds: [], materialIds: [], attributes: [] },
    });
    for (const value of FINISH_VALUES) {
      const id = optionIds.get(`${FINISH}:${value}`)!;
      const got =
        counts.attributes[attributeIds.get(FINISH)!]?.find((c) => c.valueId === id)?.count ?? 0;
      expect(got).toBe(await bruteForceCount(FINISH, value, []));
    }
    for (const value of SETTING_VALUES) {
      const id = optionIds.get(`${SETTING}:${value}`)!;
      const got =
        counts.attributes[attributeIds.get(SETTING)!]?.find((c) => c.valueId === id)?.count ??
        0;
      expect(got).toBe(await bruteForceCount(SETTING, value, []));
    }
  });

  it("leaves a dimension's own selection out of its own counts", async () => {
    const filters = filtersFor(FINISH, ["zz-a"]);
    const counts = await getFacetCounts({ scope: scope(), marketCode: MARKET, filters });

    // The FINISH dimension is counted as if nothing in FINISH were selected. Without this,
    // zz-b and zz-c both read (0) and the shopper concludes there are none — a multi-select
    // facet that can never be built past its first chip.
    for (const value of FINISH_VALUES) {
      const id = optionIds.get(`${FINISH}:${value}`)!;
      const got =
        counts.attributes[attributeIds.get(FINISH)!]?.find((c) => c.valueId === id)?.count ?? 0;
      expect(got).toBe(await bruteForceCount(FINISH, value, []));
      expect(got).toBeGreaterThan(0);
    }

    // SETTING is a different dimension, so the FINISH selection DOES narrow it.
    for (const value of SETTING_VALUES) {
      const id = optionIds.get(`${SETTING}:${value}`)!;
      const got =
        counts.attributes[attributeIds.get(SETTING)!]?.find((c) => c.valueId === id)?.count ??
        0;
      expect(got).toBe(
        await bruteForceCount(SETTING, value, [{ attributeKey: FINISH, values: ["zz-a"] }]),
      );
    }
  });

  it("counts a multi-value selection within one dimension as OR", async () => {
    const filters = filtersFor(FINISH, ["zz-a", "zz-b"]);
    const counts = await getFacetCounts({ scope: scope(), marketCode: MARKET, filters });
    for (const value of SETTING_VALUES) {
      const id = optionIds.get(`${SETTING}:${value}`)!;
      const got =
        counts.attributes[attributeIds.get(SETTING)!]?.find((c) => c.valueId === id)?.count ??
        0;
      expect(got).toBe(
        await bruteForceCount(SETTING, value, [
          { attributeKey: FINISH, values: ["zz-a", "zz-b"] },
        ]),
      );
    }
  });

  it("drops a product whose price has been superseded", async () => {
    // The price gate, asserted at the facet layer rather than only in visibility.ts. The
    // product is still published, still in the category and still carries the option — the
    // only thing that changed is that its price ended.
    const target = productIds[0]!;
    const finish = finishOf(0);
    const before = await getFacetCounts({
      scope: scope(),
      marketCode: MARKET,
      filters: { stoneIds: [], materialIds: [], attributes: [] },
    });
    const countOf = (c: Awaited<ReturnType<typeof getFacetCounts>>) =>
      c.attributes[attributeIds.get(FINISH)!]?.find(
        (x) => x.valueId === optionIds.get(`${FINISH}:${finish}`)!,
      )?.count ?? 0;

    await db.$executeRaw`UPDATE prices SET valid_to = now() WHERE product_id = ${target}::uuid`;
    const after = await getFacetCounts({
      scope: scope(),
      marketCode: MARKET,
      filters: { stoneIds: [], materialIds: [], attributes: [] },
    });
    expect(countOf(after)).toBe(countOf(before) - 1);

    await db.$executeRaw`UPDATE prices SET valid_to = NULL WHERE product_id = ${target}::uuid`;
    const restored = await getFacetCounts({
      scope: scope(),
      marketCode: MARKET,
      filters: { stoneIds: [], materialIds: [], attributes: [] },
    });
    expect(countOf(restored)).toBe(countOf(before));
  });

  it("agrees with the listing it is rendered beside", async () => {
    const filters = filtersFor(FINISH, ["zz-a"]);
    const listed = await listFilteredProducts({
      scope: scope(),
      marketCode: MARKET,
      filters,
      limit: 100,
    });
    const expected = Array.from({ length: PRODUCT_COUNT }, (_, i) => i).filter(
      (i) => finishOf(i) === "zz-a",
    );
    expect(listed).toHaveLength(expected.length);

    // A count printed above a grid must be the size of that grid. This is the assertion that
    // would fail if the facet CTE and the listing ever stopped sharing a base predicate.
    const counts = await getFacetCounts({ scope: scope(), marketCode: MARKET, filters });
    const own = counts.attributes[attributeIds.get(FINISH)!]!.find(
      (c) => c.valueId === optionIds.get(`${FINISH}:zz-a`)!,
    )!.count;
    expect(own).toBe(listed.length);
  });
});

describe("P09 — an unresolvable facet is dropped, and says so", () => {
  it("reports a misspelt option instead of silently returning everything", async () => {
    const { filters, dropped } = await parseCatalogFilters(
      new URLSearchParams([
        [`attr_${FINISH}`, "zz-a"],
        [`attr_${FINISH}`, "zz-nonexistent"],
      ]),
    );
    expect(dropped).toEqual([`attr_${FINISH}=zz-nonexistent`]);
    expect(filters.attributes[0]!.optionIds).toHaveLength(1);
  });

  it("resolves case-insensitively, the way uq_attribute_options does", async () => {
    const { filters, dropped } = await parseCatalogFilters(
      new URLSearchParams([[`attr_${FINISH}`, "ZZ-A"]]),
    );
    expect(dropped).toEqual([]);
    expect(filters.attributes[0]!.optionIds).toEqual([optionIds.get(`${FINISH}:zz-a`)!]);
  });

  it("refuses to build a facet from a non-filterable attribute", async () => {
    const { filters, dropped } = await parseCatalogFilters(
      new URLSearchParams([[`attr_${TEXT}`, "anything"]]),
    );
    expect(filters.attributes).toEqual([]);
    expect(dropped).toEqual([`attr_${TEXT}=anything`]);
  });
});
