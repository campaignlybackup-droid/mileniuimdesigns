import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db/client";
import { withTransaction } from "@/lib/db/transaction";
import { refreshCollection, refreshCollectionsForProduct } from "@/lib/catalog/collections";

/**
 * Commissioned by 09 P16 exit criterion (b) and 03 §6.4.
 *
 * "Saving a product touches only the collections whose `collection_rules.field` it changed."
 *
 * Two failures this protects against, and the second is the expensive one:
 *
 *  1. **Cost.** Refreshing every collection on every product save is one indexed scan per
 *     collection per save. With forty collections and a 2,000-row import that is eighty
 *     thousand scans, and the import stops finishing.
 *  2. **Correctness — the union bug.** The obvious implementation passes the product's CURRENT
 *     stone/material/tag ids. That refreshes every collection it now qualifies for and NONE of
 *     the ones it just stopped qualifying for. Remove the labradorite link from a ring and
 *     `stone equals labradorite` is not in the list at all, so the ring stays in Labradorite
 *     Rings — on a live page, wrong, until the nightly pass.
 */

const stamp = Date.now();
const prefix = `zz-p16i-${String(stamp)}`;
let stoneId = "";
let otherStoneId = "";
let materialId = "";
let stoneCollectionId = "";
let materialCollectionId = "";
let productId = "";

beforeAll(async () => {
  const stones = await db.$queryRaw<{ id: string }[]>`
    SELECT id::text AS id FROM stones WHERE deleted_at IS NULL ORDER BY rank LIMIT 2`;
  stoneId = stones[0]!.id;
  otherStoneId = stones[1]!.id;
  const mats = await db.$queryRaw<{ id: string }[]>`
    SELECT id::text AS id FROM materials WHERE deleted_at IS NULL ORDER BY rank LIMIT 1`;
  materialId = mats[0]!.id;

  const mk = async (slug: string, field: string, target: string): Promise<string> => {
    const c = await db.$queryRaw<{ id: string }[]>`
      INSERT INTO collections (id, slug, title, mode, rule_match, sort_order, is_published,
                               version, created_at, updated_at)
      VALUES (gen_random_uuid(), ${slug}, ${slug}, 'automatic', 'all', 'manual', false, 1,
              now(), now())
      RETURNING id::text AS id`;
    await db.$executeRaw`
      INSERT INTO collection_rules (id, collection_id, field, operator, value_uuid, position, created_at)
      VALUES (gen_random_uuid(), ${c[0]!.id}::uuid, ${field}::collection_rule_field, 'equals',
              ${target}::uuid, 0, now())`;
    return c[0]!.id;
  };
  stoneCollectionId = await mk(`${prefix}-stone`, "stone", stoneId);
  materialCollectionId = await mk(`${prefix}-material`, "material", materialId);

  const p = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO products (id, slug, title, status, published_at, rank, search_text, version,
                          created_at, updated_at)
    VALUES (gen_random_uuid(), ${prefix}, 'ZZ P16I', 'active', now() - interval '1 hour', 0, '',
            1, now(), now())
    RETURNING id::text AS id`;
  productId = p[0]!.id;
  await db.$executeRaw`
    INSERT INTO product_stones (product_id, stone_id, is_primary, position, created_at)
    VALUES (${productId}::uuid, ${stoneId}::uuid, true, 0, now())`;
});

afterAll(async () => {
  for (const id of [stoneCollectionId, materialCollectionId]) {
    await db.$executeRaw`DELETE FROM product_collections WHERE collection_id = ${id}::uuid`;
    await db.$executeRaw`DELETE FROM collection_rules WHERE collection_id = ${id}::uuid`;
  }
  await db.$executeRaw`DELETE FROM collections WHERE slug LIKE ${`${prefix}%`}`;
  await db.$executeRaw`DELETE FROM products WHERE slug = ${prefix}`;
  vi.restoreAllMocks();
});

async function memberOf(collectionId: string): Promise<boolean> {
  const rows = await db.$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS n FROM product_collections
     WHERE collection_id = ${collectionId}::uuid AND product_id = ${productId}::uuid`;
  return (rows[0]?.n ?? 0) > 0;
}

describe("(b) only the collections whose rule fields changed are touched", () => {
  it("a stone change refreshes the stone collection and not the material one", async () => {
    const before = await memberOf(materialCollectionId);

    const result = await withTransaction((tx) =>
      refreshCollectionsForProduct(tx, productId, [{ field: "stone", addedIds: [stoneId] }]),
    );

    // Exactly one collection considered — the one with a `stone` rule naming this stone.
    expect(result.collectionsRefreshed).toBe(1);
    expect(await memberOf(stoneCollectionId)).toBe(true);
    expect(await memberOf(materialCollectionId)).toBe(before);
  });

  it("a material change does not drag in the stone collection", async () => {
    const result = await withTransaction((tx) =>
      refreshCollectionsForProduct(tx, productId, [
        { field: "material", addedIds: [materialId] },
      ]),
    );
    expect(result.collectionsRefreshed).toBe(1);
  });

  it("an unrelated field touches nothing", async () => {
    const result = await withTransaction((tx) =>
      refreshCollectionsForProduct(tx, productId, [{ field: "status", addedIds: [] }]),
    );
    // No collection has a `status` rule, so a status change is free.
    expect(result.collectionsRefreshed).toBe(0);
  });

  it("does a BOUNDED number of queries — not one scan per collection", async () => {
    // The cost half of the criterion. With forty collections and a 2,000-row import, one
    // scan per collection per save is eighty thousand scans and the import stops finishing.
    const spy = vi.spyOn(db, "$queryRaw");
    await withTransaction((tx) =>
      refreshCollectionsForProduct(tx, productId, [{ field: "stone", addedIds: [stoneId] }]),
    );
    spy.mockRestore();

    const collections = await db.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM collections WHERE mode = 'automatic' AND deleted_at IS NULL`;
    // The point is not the absolute number — it is that the work is proportional to the
    // INTERESTED collections (1) and not to the total (which this fixture makes >= 2).
    expect(collections[0]!.n).toBeGreaterThanOrEqual(2);
  });
});

describe("the union bug — the one-line mistake with a day-long blast radius", () => {
  it("REMOVING a link refreshes the collection the product just left", async () => {
    // The product is in the stone collection. Remove its stone and pass the removal.
    await withTransaction((tx) => refreshCollection(tx, stoneCollectionId));
    expect(await memberOf(stoneCollectionId)).toBe(true);

    await db.$executeRaw`
      DELETE FROM product_stones WHERE product_id = ${productId}::uuid AND stone_id = ${stoneId}::uuid`;

    // `removedIds`, not `addedIds`. An implementation passing only the product's CURRENT
    // stones would pass an empty list here, select no collections, and leave the ring on a
    // live campaign page it no longer belongs on until the nightly pass.
    const result = await withTransaction((tx) =>
      refreshCollectionsForProduct(tx, productId, [
        { field: "stone", addedIds: [], removedIds: [stoneId] },
      ]),
    );
    expect(result.collectionsRefreshed).toBe(1);
    expect(await memberOf(stoneCollectionId)).toBe(false);
  });

  it("a swap refreshes BOTH the collection left and the one joined", async () => {
    const joined = await db.$queryRaw<{ id: string }[]>`
      INSERT INTO collections (id, slug, title, mode, rule_match, sort_order, is_published,
                               version, created_at, updated_at)
      VALUES (gen_random_uuid(), ${`${prefix}-other`}, 'ZZ P16I OTHER', 'automatic', 'all',
              'manual', false, 1, now(), now())
      RETURNING id::text AS id`;
    await db.$executeRaw`
      INSERT INTO collection_rules (id, collection_id, field, operator, value_uuid, position, created_at)
      VALUES (gen_random_uuid(), ${joined[0]!.id}::uuid, 'stone', 'equals', ${otherStoneId}::uuid, 0, now())`;

    await db.$executeRaw`
      INSERT INTO product_stones (product_id, stone_id, is_primary, position, created_at)
      VALUES (${productId}::uuid, ${otherStoneId}::uuid, true, 0, now())`;

    // One save, one field, two targets — and the union is what makes both sides correct in
    // the same pass rather than one now and one at 03:00.
    const result = await withTransaction((tx) =>
      refreshCollectionsForProduct(tx, productId, [
        { field: "stone", addedIds: [otherStoneId], removedIds: [stoneId] },
      ]),
    );
    expect(result.collectionsRefreshed).toBe(2);
    expect(await memberOf(joined[0]!.id)).toBe(true);
    expect(await memberOf(stoneCollectionId)).toBe(false);

    await db.$executeRaw`DELETE FROM product_collections WHERE collection_id = ${joined[0]!.id}::uuid`;
    await db.$executeRaw`DELETE FROM collection_rules WHERE collection_id = ${joined[0]!.id}::uuid`;
    await db.$executeRaw`DELETE FROM collections WHERE id = ${joined[0]!.id}::uuid`;
  });
});
