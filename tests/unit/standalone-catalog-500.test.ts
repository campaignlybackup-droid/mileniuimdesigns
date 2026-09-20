import { describe, it, expect } from "vitest";
import {
  STANDALONE_PRODUCTS,
  STANDALONE_CATEGORIES,
  STANDALONE_STONES,
  getStandalonePdpProduct,
  getStandaloneCategoryProducts,
  getStandaloneStoneProducts,
  getStandaloneFeaturedProducts,
} from "@/lib/storage/standalone-catalog";

describe("500+ luxury catalogue suite", () => {
  it("hosts 520+ distinct handcrafted products", () => {
    expect(STANDALONE_PRODUCTS.length).toBeGreaterThanOrEqual(500);
    const uniqueSlugs = new Set(STANDALONE_PRODUCTS.map((p) => p.slug));
    expect(uniqueSlugs.size).toBe(STANDALONE_PRODUCTS.length);
    const uniqueIds = new Set(STANDALONE_PRODUCTS.map((p) => p.id));
    expect(uniqueIds.size).toBe(STANDALONE_PRODUCTS.length);
  });

  it("covers all 9 categories with abundant pieces", () => {
    for (const cat of STANDALONE_CATEGORIES) {
      const res = getStandaloneCategoryProducts(cat.slug, "US", { limit: 100 });
      expect(res.totalCount).toBeGreaterThanOrEqual(40);
    }
  });

  it("covers all 7 gemstones with rich selections", () => {
    for (const stone of STANDALONE_STONES) {
      const res = getStandaloneStoneProducts(stone.slug, "US", { limit: 100 });
      expect(res.totalCount).toBeGreaterThanOrEqual(35);
    }
  });

  it("provides independent USD and INR pricing for every piece", () => {
    for (const p of STANDALONE_PRODUCTS) {
      expect(p.priceUsdMinor).toBeGreaterThan(0n);
      expect(p.priceInrMinor).toBeGreaterThan(0n);
    }
  });

  it("returns null for unknown product slugs (enabling clean 404s)", () => {
    const res = getStandalonePdpProduct("nonexistent-piece-xyz-404", "US");
    expect(res).toBeNull();
  });

  it("returns full PDP details for flagship and generated pieces", () => {
    const flagship = getStandalonePdpProduct("sovereign-oval-moonstone-ring", "US");
    expect(flagship).not.toBeNull();
    expect(flagship?.title).toBe("The Sovereign Oval Moonstone Ring");
    expect(flagship?.variants.length).toBeGreaterThan(0);
    expect(flagship?.media.length).toBeGreaterThan(0);

    const generated = getStandalonePdpProduct(STANDALONE_PRODUCTS[50]!.slug, "IN");
    expect(generated).not.toBeNull();
    expect(generated?.variants[0]?.price?.currencyCode).toBe("INR");
  });

  it("sorts category products accurately", () => {
    const asc = getStandaloneCategoryProducts("rings", "US", { sort: "price_asc", limit: 20 });
    for (let i = 1; i < asc.products.length; i++) {
      const prev = asc.products[i - 1]!.priceRange?.minListMinor ?? 0n;
      const curr = asc.products[i]!.priceRange?.minListMinor ?? 0n;
      expect(curr >= prev).toBe(true);
    }

    const desc = getStandaloneCategoryProducts("rings", "US", { sort: "price_desc", limit: 20 });
    for (let i = 1; i < desc.products.length; i++) {
      const prev = desc.products[i - 1]!.priceRange?.minListMinor ?? 0n;
      const curr = desc.products[i]!.priceRange?.minListMinor ?? 0n;
      expect(prev >= curr).toBe(true);
    }
  });
});
