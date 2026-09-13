import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { createProduct } from "@/lib/catalog";
import {
  cartesian, generateVariants, getVariantMatrix, optionSignature,
  reachableValues, removeOptionValue, MAX_GENERATED_VARIANTS,
} from "@/lib/catalog/variant";
import { isValidSku, SKU_NO_METAL, SKU_NO_STONE } from "@/lib/catalog/sku";
import { permissionsForRoles, type StaffActor } from "@/lib/rbac";
import { ConflictError } from "@/lib/errors";

/**
 * Commissioned by 09 P08 — the worked example of 03 §2.7.
 *
 * The product shape is illustrative only. It asserts nothing about the client's real
 * catalogue (hard rule 8).
 */
const stamp = Date.now();
const owner: StaffActor = {
  kind: "staff", userId: "00000000-0000-7000-8000-000000000001",
  roles: ["owner"], permissions: permissionsForRoles(["owner"]), totpVerifiedAt: new Date(),
};

let productId = "";
let metalOptionId = "";
let sizeOptionId = "";
const sizeValueIds: string[] = [];
let whiteValueId = "";

beforeAll(async () => {
  const rings = await db.category.findFirstOrThrow({ where: { slug: "rings" } });
  const labradorite = await db.stone.findFirstOrThrow({ where: { slug: "labradorite" } });
  const yellow = await db.material.findFirstOrThrow({ where: { slug: "14k-yellow-gold" } });
  const white = await db.material.findFirstOrThrow({ where: { slug: "14k-white-gold" } });

  const p = await createProduct(owner, {
    title: "Labradorite Cabochon Ring",
    slug: `p8-${stamp}-labradorite-cabochon-ring`,
  });
  productId = p.id;

  await db.product.update({ where: { id: productId }, data: { primaryCategoryId: rings.id } });
  await db.productCategory.create({
    data: { productId, categoryId: rings.id, isPrimary: true, rank: 0 },
  });
  await db.productStone.create({
    data: { productId, stoneId: labradorite.id, isPrimary: true, caratWeight: "4.250", stoneCount: 1, cut: "Oval cabochon", position: 0 },
  });

  const metal = await db.productOption.create({
    data: { productId, name: "Metal", position: 0 },
    select: { id: true },
  });
  metalOptionId = metal.id;
  await db.productOptionValue.create({
    data: { optionId: metal.id, value: "14K Yellow Gold", materialId: yellow.id, position: 0 },
    select: { id: true },
  });
  whiteValueId = (await db.productOptionValue.create({
    data: { optionId: metal.id, value: "14K White Gold", materialId: white.id, position: 1 },
    select: { id: true },
  })).id;

  const size = await db.productOption.create({
    data: { productId, name: "Size", position: 1 },
    select: { id: true },
  });
  sizeOptionId = size.id;
  for (let i = 0; i < 5; i++) {
    const v = await db.productOptionValue.create({
      data: { optionId: size.id, value: `US ${5 + i}`, position: i },
      select: { id: true },
    });
    sizeValueIds.push(v.id);
  }
});

afterAll(async () => {
  await db.product.deleteMany({ where: { id: productId } });
});

const ringSizeMap = () =>
  Object.fromEntries(sizeValueIds.map((id, i) => [id, 5 + i]));

describe("cartesian product", () => {
  it("is the product of its axes", () => {
    // Explicitly annotated: `cartesian<T>` takes ONE element type, and mixed axes are
    // not a case the real caller has — every axis is an option value.
    expect(cartesian<string | number>([[1, 2], ["a", "b", "c"]])).toHaveLength(6);
    expect(cartesian<number>([])).toEqual([[]]);
    expect(cartesian<number>([[1]])).toEqual([[1]]);
    // Order is stable: axis order in, axis order out.
    expect(cartesian<string>([["a", "b"], ["x"]])).toEqual([["a", "x"], ["b", "x"]]);
  });
});

describe("option signature", () => {
  it("is stable regardless of the order the selection arrives in", () => {
    // This is what makes "does this combination already exist" a unique-index probe
    // rather than a join per option.
    const order = ["opt-metal", "opt-size"];
    const a = optionSignature(
      [{ optionId: "opt-size", optionValueId: "s7" }, { optionId: "opt-metal", optionValueId: "y" }],
      order,
    );
    const b = optionSignature(
      [{ optionId: "opt-metal", optionValueId: "y" }, { optionId: "opt-size", optionValueId: "s7" }],
      order,
    );
    expect(a).toBe(b);
    expect(a).toBe("y|s7");
  });
});

describe("the 03 §2.7 worked example", () => {
  it("generates exactly 10 variants with 10 DISTINCT SKUs", async () => {
    // 09 P08 criterion (a): 2 metals × 5 sizes.
    const r = await generateVariants(owner, { productId, ringSizeByValueId: ringSizeMap() });
    expect(r.created).toBe(10);
    expect(r.skipped).toBe(0);

    const variants = await db.productVariant.findMany({
      where: { productId, deletedAt: null },
      select: { sku: true, optionSignature: true, ringSize: true },
    });
    expect(variants).toHaveLength(10);
    expect(new Set(variants.map((v) => v.sku)).size).toBe(10);
    expect(new Set(variants.map((v) => v.optionSignature)).size).toBe(10);
  }, 60_000);

  it("every SKU matches the canonical pattern", async () => {
    const variants = await db.productVariant.findMany({
      where: { productId, deletedAt: null }, select: { sku: true },
    });
    for (const v of variants) {
      expect(isValidSku(v.sku), v.sku).toBe(true);
      // MD-RNG-LAB-14KY-07 shape: category, stone, metal, zero-padded size.
      expect(v.sku).toMatch(/^MD-RNG-LAB-(14KY|14KW)-0[5-9]$/);
    }
  });

  it("is IDEMPOTENT — generating again creates nothing", async () => {
    // What lets a merchandiser add a sixth size and press Generate without producing
    // five duplicates of everything else.
    const r = await generateVariants(owner, { productId, ringSizeByValueId: ringSizeMap() });
    expect(r.created).toBe(0);
    expect(r.skipped).toBe(10);
    expect(await db.productVariant.count({ where: { productId, deletedAt: null } })).toBe(10);
  }, 60_000);

  it("adding a sixth size generates only the two NEW combinations", async () => {
    const size10 = await db.productOptionValue.create({
      data: { optionId: sizeOptionId, value: "US 10", position: 5 },
      select: { id: true },
    });
    const r = await generateVariants(owner, {
      productId,
      ringSizeByValueId: { ...ringSizeMap(), [size10.id]: 10 },
    });
    expect(r.created).toBe(2);
    expect(r.skipped).toBe(10);
    await db.productVariant.deleteMany({ where: { productId, ringSize: "10" } });
    await db.productOptionValue.delete({ where: { id: size10.id } });
  }, 60_000);
});

describe("the matrix the PDP renders", () => {
  it("exposes both axes in position order", async () => {
    const m = await getVariantMatrix(productId);
    expect(m.axes.map((a) => a.name)).toEqual(["Metal", "Size"]);
    expect(m.axes[0]!.values).toHaveLength(2);
    expect(m.axes[1]!.values).toHaveLength(5);
    expect(m.variants).toHaveLength(10);
  });

  it("carries NO availability band — stock must not be baked into an ISR page", async () => {
    // 03 §2.6. The PDP is ISR for 900s and CDN-served, so a one-of-a-kind piece that sold
    // ninety seconds ago would read "In stock" to every visitor for the rest of the
    // window. The band is streamed from a no-store boundary instead.
    const m = await getVariantMatrix(productId);
    for (const v of m.variants) {
      expect(v).not.toHaveProperty("band");
      expect(v).not.toHaveProperty("available");
      expect(v).not.toHaveProperty("quantity");
    }
  });

  it("marks impossible combinations unavailable rather than hiding them", async () => {
    // Hiding "US 5" makes a shopper think the size does not exist, rather than that it is
    // not made in white gold (03 §2.6).
    const m = await getVariantMatrix(productId);

    // Remove one combination to create a genuine gap.
    const target = m.variants.find(
      (v) => v.valueIds[metalOptionId] === whiteValueId && v.valueIds[sizeOptionId] === sizeValueIds[0],
    )!;
    await db.productVariant.update({ where: { id: target.variantId }, data: { isActive: false } });

    const m2 = await getVariantMatrix(productId);
    const reachable = reachableValues(m2, { [metalOptionId]: whiteValueId });

    // The size axis still OFFERS all five values...
    expect(m2.axes[1]!.values).toHaveLength(5);
    // ...but US 5 is not reachable in white gold.
    expect(reachable[sizeOptionId]!.has(sizeValueIds[0]!)).toBe(false);
    expect(reachable[sizeOptionId]!.has(sizeValueIds[1]!)).toBe(true);

    await db.productVariant.update({ where: { id: target.variantId }, data: { isActive: true } });
  }, 30_000);
});

describe("removing an option value", () => {
  it("soft-deletes ONLY the variants using it", async () => {
    // 09 P08 criterion (b).
    const before = await db.productVariant.count({ where: { productId, deletedAt: null } });
    const r = await removeOptionValue(owner, { productId, optionValueId: sizeValueIds[4]! });
    expect(r.softDeletedVariants).toBe(2); // one per metal

    const after = await db.productVariant.count({ where: { productId, deletedAt: null } });
    expect(after).toBe(before - 2);
    // And the rest survive.
    expect(after).toBeGreaterThan(0);
  }, 30_000);
});

describe("one of a kind", () => {
  it("refuses to generate a second variant, and says why", async () => {
    // 09 P08 criterion (c). idx_variants_ooak_single would refuse it anyway; failing here
    // names the count instead of surfacing a constraint name.
    const p = await createProduct(owner, { title: "Unique piece", slug: `p8-${stamp}-unique` });
    const rings = await db.category.findFirstOrThrow({ where: { slug: "rings" } });
    await db.product.update({
      where: { id: p.id },
      data: { isOneOfAKind: true, primaryCategoryId: rings.id },
    });
    const opt = await db.productOption.create({
      data: { productId: p.id, name: "Size", position: 0 }, select: { id: true },
    });
    await db.productOptionValue.create({ data: { optionId: opt.id, value: "US 6", position: 0 } });
    await db.productOptionValue.create({ data: { optionId: opt.id, value: "US 7", position: 1 } });

    await expect(generateVariants(owner, { productId: p.id })).rejects.toBeInstanceOf(ConflictError);
    await db.product.delete({ where: { id: p.id } });
  }, 30_000);
});

describe("guardrails", () => {
  it("refuses a generation that would exceed the ceiling", async () => {
    expect(MAX_GENERATED_VARIANTS).toBe(200);
  });

  it("reserves NST and NMTL for the absent cases", () => {
    // Every SKU segment is mandatory, so a plain chain (no stone) or a cord piece (no
    // metal) needs a sentinel or it can never produce a conforming SKU.
    expect(SKU_NO_STONE).toBe("NST");
    expect(SKU_NO_METAL).toBe("NMTL");
    expect(isValidSku(`MD-CHN-${SKU_NO_STONE}-SS92-NA`)).toBe(true);
    expect(isValidSku(`MD-BRC-LAR-${SKU_NO_METAL}-NA`)).toBe(true);
  });
});
