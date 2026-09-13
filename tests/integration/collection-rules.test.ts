import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { withTransaction } from "@/lib/db/transaction";
import {
  buildRulePredicate,
  refreshCollection,
  staleCollections,
  STALE_AFTER_HOURS,
} from "@/lib/catalog/collections";
import { ValidationError } from "@/lib/errors";

/**
 * Commissioned by 09 P16 exit criteria (a) and (c), and 03 §6.4.
 *
 * The headline property: **a rule refresh cannot delete a merchandiser's pin.** That is not a
 * convention anyone has to remember — `source = 'manual'` is outside both refresh statements
 * by construction, so the WHERE clause is what enforces it.
 */

const stamp = Date.now();
const prefix = `zz-p16-${String(stamp)}`;
let collectionId = "";
let stoneId = "";
let otherStoneId = "";
let tagId = "";
const productIds: string[] = [];

async function makeProduct(n: number, stone: string): Promise<string> {
  const p = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO products (id, slug, title, status, published_at, rank, search_text, version,
                          created_at, updated_at)
    VALUES (gen_random_uuid(), ${`${prefix}-${String(n)}`}, ${`ZZ P16 ${String(n)}`},
            'active', now() - interval '1 hour', ${n}, '', 1, now(), now())
    RETURNING id::text AS id
  `;
  await db.$executeRaw`
    INSERT INTO product_stones (product_id, stone_id, is_primary, position, created_at)
    VALUES (${p[0]!.id}::uuid, ${stone}::uuid, true, 0, now())
  `;
  // Every test product carries the fixture tag. The rule set is stone AND tag, which keeps
  // the collection to this test's products — the catalogue it runs against contains 5,000
  // perf-fixture products that legitimately carry stones, so a single-field stone rule
  // matched 716 of them. A test that assumes it owns the database is a test that passes
  // until someone else's fixture exists.
  await db.$executeRaw`
    INSERT INTO product_tags (product_id, tag_id, created_at)
    VALUES (${p[0]!.id}::uuid, ${tagId}::uuid, now())
  `;
  productIds.push(p[0]!.id);
  return p[0]!.id;
}

beforeAll(async () => {
  const stones = await db.$queryRaw<{ id: string }[]>`
    SELECT id::text AS id FROM stones WHERE deleted_at IS NULL ORDER BY rank LIMIT 2
  `;
  expect(stones).toHaveLength(2);
  stoneId = stones[0]!.id;
  otherStoneId = stones[1]!.id;

  const t = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO tags (id, slug, name, created_at, updated_at)
    VALUES (gen_random_uuid(), ${prefix}, 'ZZ P16 TAG', now(), now())
    RETURNING id::text AS id
  `;
  tagId = t[0]!.id;

  const c = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO collections (id, slug, title, mode, rule_match, sort_order, is_published,
                             version, created_at, updated_at)
    VALUES (gen_random_uuid(), ${prefix}, 'ZZ P16 COLLECTION', 'automatic', 'all', 'manual',
            false, 1, now(), now())
    RETURNING id::text AS id
  `;
  collectionId = c[0]!.id;

  await db.$executeRaw`
    INSERT INTO collection_rules (id, collection_id, field, operator, value_uuid, position, created_at)
    VALUES (gen_random_uuid(), ${collectionId}::uuid, 'stone', 'equals', ${stoneId}::uuid, 0, now())
  `;
  await db.$executeRaw`
    INSERT INTO collection_rules (id, collection_id, field, operator, value_text, position, created_at)
    VALUES (gen_random_uuid(), ${collectionId}::uuid, 'tag', 'equals', ${prefix}, 1, now())
  `;

  // Two products with the rule's stone, one with a different stone.
  await makeProduct(1, stoneId);
  await makeProduct(2, stoneId);
  await makeProduct(3, otherStoneId);
});

afterAll(async () => {
  await db.$executeRaw`DELETE FROM product_collections WHERE collection_id = ${collectionId}::uuid`;
  await db.$executeRaw`DELETE FROM collection_rules WHERE collection_id = ${collectionId}::uuid`;
  await db.$executeRaw`DELETE FROM collections WHERE slug = ${prefix}`;
  await db.$executeRaw`DELETE FROM products WHERE slug LIKE ${`${prefix}-%`}`;
  await db.$executeRaw`DELETE FROM tags WHERE slug = ${prefix}`;
});

async function members(): Promise<{ productId: string; source: string }[]> {
  const rows = await db.$queryRaw<{ product_id: string; source: string }[]>`
    SELECT product_id::text AS product_id, source FROM product_collections
     WHERE collection_id = ${collectionId}::uuid ORDER BY product_id
  `;
  return rows.map((r) => ({ productId: r.product_id, source: r.source }));
}

describe("a full evaluation materialises exactly the matching products", () => {
  it("adds the two that match and not the one that does not", async () => {
    const result = await withTransaction((tx) => refreshCollection(tx, collectionId));
    expect(result.added).toBe(2);
    const rows = await members();
    expect(rows.map((r) => r.productId).sort()).toEqual(
      [productIds[0]!, productIds[1]!].sort(),
    );
    expect(rows.every((r) => r.source === "rule")).toBe(true);
  });

  it("is idempotent — running it again changes nothing", async () => {
    const result = await withTransaction((tx) => refreshCollection(tx, collectionId));
    expect(result.added).toBe(0);
    expect(result.removed).toBe(0);
    expect(await members()).toHaveLength(2);
  });

  it("removes a product that stops matching", async () => {
    await db.$executeRaw`DELETE FROM product_stones WHERE product_id = ${productIds[1]!}::uuid`;
    const result = await withTransaction((tx) => refreshCollection(tx, collectionId));
    expect(result.removed).toBe(1);
    expect((await members()).map((r) => r.productId)).toEqual([productIds[0]!]);
    // Put it back for the tests that follow.
    await db.$executeRaw`
      INSERT INTO product_stones (product_id, stone_id, is_primary, position, created_at)
      VALUES (${productIds[1]!}::uuid, ${stoneId}::uuid, true, 0, now())
    `;
    await withTransaction((tx) => refreshCollection(tx, collectionId));
  });
});

describe("(a) a manual pin survives a rule refresh", () => {
  it("keeps a pinned product that the rules do not match", async () => {
    // The merchandiser pins product 3, which has the WRONG stone. This is the thing that
    // must not be silently undone at 03:00 by a job nobody was watching.
    await db.$executeRaw`
      INSERT INTO product_collections (product_id, collection_id, source, rank, created_at)
      VALUES (${productIds[2]!}::uuid, ${collectionId}::uuid, 'manual', 0, now())
    `;

    const result = await withTransaction((tx) => refreshCollection(tx, collectionId));
    const rows = await members();
    expect(rows.map((r) => r.productId)).toContain(productIds[2]!);
    expect(rows.find((r) => r.productId === productIds[2]!)!.source).toBe("manual");
    // And the refresh did not quietly convert it to a rule row either, which would make it
    // deletable by the NEXT refresh.
    expect(result.removed).toBe(0);
  });

  it("survives repeated refreshes, not just the first", async () => {
    for (let i = 0; i < 3; i++)
      await withTransaction((tx) => refreshCollection(tx, collectionId));
    const rows = await members();
    expect(rows.find((r) => r.productId === productIds[2]!)?.source).toBe("manual");
    expect(rows).toHaveLength(3);
  });
});

describe("an empty rule set matches NOTHING, not everything", () => {
  it("refuses to sweep the catalogue into a collection whose rules were deleted", async () => {
    // `AND` over nothing is vacuously TRUE in logic. If the builder took that literally, a
    // collection whose last rule was deleted would match the entire catalogue — five thousand
    // products on a campaign page at 03:00, with no error anywhere.
    const predicate = buildRulePredicate([], "all");
    expect(predicate.sql.trim()).toBe("false");

    const empty = await db.$queryRaw<{ id: string }[]>`
      INSERT INTO collections (id, slug, title, mode, rule_match, sort_order, is_published,
                               version, created_at, updated_at)
      VALUES (gen_random_uuid(), ${`${prefix}-empty`}, 'ZZ P16 EMPTY', 'automatic', 'all',
              'manual', false, 1, now(), now())
      RETURNING id::text AS id
    `;
    const result = await withTransaction((tx) => refreshCollection(tx, empty[0]!.id));
    expect(result.added).toBe(0);
    await db.$executeRaw`DELETE FROM collections WHERE id = ${empty[0]!.id}::uuid`;
  });
});

describe("rule storage is asserted where a CHECK cannot reach", () => {
  it("refuses an `in` rule with no values", async () => {
    // A half-saved `in` rule evaluated silently would make the collection quietly wrong.
    expect(() =>
      buildRulePredicate(
        [
          {
            field: "stone",
            operator: "in",
            valueText: null,
            valueUuid: null,
            valueNumeric: null,
            valueMarketCode: null,
            attributeId: null,
            values: [],
          },
        ],
        "all",
      ),
    ).toThrow(ValidationError);
  });

  it("refuses a single-value operator that carries child values", async () => {
    // The split a CHECK cannot express, because it spans two tables: one of the two storages
    // is what the merchandiser meant and the evaluator cannot tell which.
    expect(() =>
      buildRulePredicate(
        [
          {
            field: "stone",
            operator: "equals",
            valueText: null,
            valueUuid: stoneId,
            valueNumeric: null,
            valueMarketCode: null,
            attributeId: null,
            values: [{ valueUuid: otherStoneId, valueText: null }],
          },
        ],
        "all",
      ),
    ).toThrow(ValidationError);
  });

  it("refuses a price rule with no market", async () => {
    // chk_collection_rules_price_market says the same thing in the database. $400 tested
    // against ₹40,000 is hard rule 2 arriving through a rule builder.
    expect(() =>
      buildRulePredicate(
        [
          {
            field: "price",
            operator: "lt",
            valueText: null,
            valueUuid: null,
            valueNumeric: 50000n,
            valueMarketCode: null,
            attributeId: null,
            values: [],
          },
        ],
        "all",
      ),
    ).toThrow(ValidationError);
  });
});

describe("(c) a stale automatic collection is findable", () => {
  it("reports one whose last full evaluation is older than the window", async () => {
    // A silently stale rule-driven collection looks exactly like a correct empty one, which
    // is why this is surfaced rather than inferred.
    await db.$executeRaw`
      UPDATE collections SET last_refreshed_at = now() - make_interval(hours => ${STALE_AFTER_HOURS + 1})
       WHERE id = ${collectionId}::uuid
    `;
    const stale = await staleCollections();
    expect(stale.map((s) => s.id)).toContain(collectionId);

    await withTransaction((tx) => refreshCollection(tx, collectionId));
    const after = await staleCollections();
    expect(after.map((s) => s.id)).not.toContain(collectionId);
  });

  it("a per-product refresh does NOT stamp last_refreshed_at", async () => {
    // Only a full evaluation may claim the collection is fresh. If a per-product upsert
    // stamped it, a collection could look refreshed for weeks while never being evaluated
    // as a whole — which is exactly the staleness the warning exists to catch.
    await db.$executeRaw`
      UPDATE collections SET last_refreshed_at = now() - make_interval(hours => ${STALE_AFTER_HOURS + 1})
       WHERE id = ${collectionId}::uuid
    `;
    await withTransaction((tx) =>
      refreshCollection(tx, collectionId, { productIds: [productIds[0]!] }),
    );
    expect((await staleCollections()).map((s) => s.id)).toContain(collectionId);
    await withTransaction((tx) => refreshCollection(tx, collectionId));
  });
});
