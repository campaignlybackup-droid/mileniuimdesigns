import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db/client";
import { resolvePriceBatch } from "@/lib/pricing";

/**
 * Commissioned by 04 §3 and 09 P11 exit criterion (d).
 *
 * **The invariant is not "three". It is that the number DOES NOT GROW WITH LINE COUNT.**
 *
 * 09's first draft pinned this at "one query", which `04 §3` contradicts — the scope read and
 * the rules read are two more on top of the `prices` read. An assertion pinned to the wrong
 * absolute number gets deleted or weakened on first contact, and the thing that actually
 * matters goes with it. So this measures 1, 48 and 200 lines and asserts they are EQUAL, plus
 * a loose ceiling so a regression to per-line reads cannot hide inside "equal but large".
 *
 * A PLP renders 48 cards. A resolver costing one query per card is 48 round trips on the
 * hottest page on the site, and it looks perfectly fine in development with six products.
 */

const stamp = Date.now();
const MARKET = "US";
const LINE_COUNTS = [1, 48, 200] as const;

let variantIds: string[] = [];
let currencyCode = "";

beforeAll(async () => {
  const market = await db.$queryRaw<{ currency_code: string }[]>`
    SELECT currency_code FROM markets WHERE code = ${MARKET}
  `;
  currencyCode = market[0]!.currency_code;

  // 200 products, each with one variant and one price. Built in three statements rather than
  // six hundred, because the fixture is not what this test is measuring.
  await db.$executeRaw`
    INSERT INTO products (id, slug, title, status, published_at, rank, search_text, version,
                          created_at, updated_at)
    SELECT gen_random_uuid(), ${`zz-p11-${String(stamp)}-`} || i, 'ZZ P11 ' || i,
           'active', now() - interval '1 hour', i, '', 1, now(), now()
    FROM generate_series(0, 199) AS i
  `;
  await db.$executeRaw`
    INSERT INTO product_variants (id, product_id, sku, position, inventory_policy,
                                  option_signature, is_active, version, created_at, updated_at)
    SELECT gen_random_uuid(), p.id,
           'MD-ZZQ-ZZQ-' || lpad(right(p.slug, 3), 4, '0') || '-NA',
           0, 'tracked', '', true, 1, now(), now()
    FROM products p WHERE p.slug LIKE ${`zz-p11-${String(stamp)}-%`}
  `;
  await db.$executeRaw`
    INSERT INTO prices (id, product_id, variant_id, market_code, currency_code, list_minor,
                        price_source, valid_from, created_at)
    SELECT gen_random_uuid(), v.product_id, v.id, ${MARKET}, ${currencyCode},
           19900, 'manual', now() - interval '1 hour', now()
    FROM product_variants v JOIN products p ON p.id = v.product_id
    WHERE p.slug LIKE ${`zz-p11-${String(stamp)}-%`}
  `;

  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT v.id::text AS id FROM product_variants v JOIN products p ON p.id = v.product_id
    WHERE p.slug LIKE ${`zz-p11-${String(stamp)}-%`} ORDER BY p.rank
  `;
  variantIds = rows.map((r) => r.id);
  // An assertion whose subject can be absent passes for the wrong reason: a batch of zero
  // lines issues zero queries for every line count.
  expect(variantIds).toHaveLength(200);
});

afterAll(async () => {
  await db.$executeRaw`
    DELETE FROM prices WHERE product_id IN (
      SELECT id FROM products WHERE slug LIKE ${`zz-p11-${String(stamp)}-%`})`;
  await db.$executeRaw`DELETE FROM products WHERE slug LIKE ${`zz-p11-${String(stamp)}-%`}`;
  variantIds = [];
  vi.restoreAllMocks();
});

/** Count the statements ONE call issues, by wrapping the client's raw entry point. */
async function countQueries(run: () => Promise<unknown>): Promise<number> {
  const spy = vi.spyOn(db, "$queryRaw");
  try {
    await run();
    return spy.mock.calls.length;
  } finally {
    spy.mockRestore();
  }
}

describe("P11 (d) — the query count does not grow with line count", () => {
  const counts = new Map<number, number>();

  it("measures 1, 48 and 200 lines", async () => {
    for (const n of LINE_COUNTS) {
      const lines = variantIds
        .slice(0, n)
        .map((variantId) => ({ variantId, marketCode: MARKET, quantity: 1 }));
      const count = await countQueries(async () => {
        const result = await resolvePriceBatch(lines);
        // The batch must actually have resolved them. A resolver that returned an empty map
        // would issue a constant number of queries too.
        expect(result.size).toBe(n);
      });
      counts.set(n, count);
    }
    expect([...counts.keys()].sort((a, b) => a - b)).toEqual([...LINE_COUNTS]);
  });

  it("issues the same number for every line count", () => {
    const distinct = new Set(counts.values());
    expect(
      [...distinct],
      `query counts by line count: ${JSON.stringify([...counts])}`,
    ).toHaveLength(1);
  });

  it("and that number is small — not merely constant", () => {
    // "Equal but large" is the way this assertion would be satisfied by an implementation
    // that reads everything up front and still does N work. The ceiling is loose on purpose:
    // 04 §3 names three reads, step 0 resolves the market, and an authenticated batch adds
    // the customer's group. Pinning it exactly is the mistake 09 already corrected.
    const count = [...counts.values()][0]!;
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThanOrEqual(6);
  });

  it("stays constant with a customer, which adds the group read and nothing per line", async () => {
    const customer = await db.$queryRaw<
      { id: string }[]
    >`SELECT id::text AS id FROM customers LIMIT 1`;
    if (!customer[0]) return;
    const measured: number[] = [];
    for (const n of [1, 48] as const) {
      const lines = variantIds
        .slice(0, n)
        .map((variantId) => ({ variantId, marketCode: MARKET, quantity: 1 }));
      measured.push(
        await countQueries(() => resolvePriceBatch(lines, { customerId: customer[0]!.id })),
      );
    }
    expect(new Set(measured).size).toBe(1);
  });
});
