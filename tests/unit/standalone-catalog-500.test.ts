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

describe("authentic 82-piece catalogue suite", () => {
  it("hosts exactly 82 distinct authentic handcrafted products", () => {
    expect(STANDALONE_PRODUCTS.length).toBe(82);
    const uniqueSlugs = new Set(STANDALONE_PRODUCTS.map((p) => p.slug));
    expect(uniqueSlugs.size).toBe(82);
    const uniqueIds = new Set(STANDALONE_PRODUCTS.map((p) => p.id));
    expect(uniqueIds.size).toBe(82);
  });

  it("covers key jewellery categories with original pieces", () => {
    const featured = getStandaloneFeaturedProducts("US", 10);
    expect(featured.products.length).toBe(10);
    expect(featured.totalCount).toBe(82);

    const bracelets = getStandaloneCategoryProducts("bracelets", "US", { limit: 50 });
    expect(bracelets.products.length).toBeGreaterThanOrEqual(9);
  });

  it("covers gemstones with authentic natural mineral pieces", () => {
    const opalRes = getStandaloneStoneProducts("opal", "US", { limit: 50 });
    expect(opalRes.products.length).toBeGreaterThan(0);

    const moonstoneRes = getStandaloneStoneProducts("moonstone", "US", { limit: 50 });
    expect(moonstoneRes.products.length).toBeGreaterThan(0);
  });

  it("provides independent USD and INR pricing for every authentic piece", () => {
    for (const p of STANDALONE_PRODUCTS) {
      expect(p.priceUsdMinor).toBeGreaterThan(0n);
      expect(p.priceInrMinor).toBeGreaterThan(0n);
    }
  });

  it("returns null for unknown product slugs (enabling clean 404s)", () => {
    const res = getStandalonePdpProduct("nonexistent-piece-xyz-404", "US");
    expect(res).toBeNull();
  });

  it("returns full PDP details for original authentic pieces", () => {
    const piece = getStandalonePdpProduct("natural-opal-silver-bracelet-bl-1", "US");
    expect(piece).not.toBeNull();
    expect(piece?.title).toBe("Natural Opal Silver Bracelet (BL 1)");
    expect(piece?.variants.length).toBeGreaterThan(0);
    expect(piece?.media.length).toBeGreaterThan(0);

    const inPiece = getStandalonePdpProduct(STANDALONE_PRODUCTS[10]!.slug, "IN");
    expect(inPiece).not.toBeNull();
    expect(inPiece?.variants[0]?.price?.currencyCode).toBe("INR");
  });

  it("sorts category products accurately", () => {
    const asc = getStandaloneCategoryProducts("bracelets", "US", { sort: "price_asc", limit: 20 });
    for (let i = 1; i < asc.products.length; i++) {
      const prev = asc.products[i - 1]!.priceRange?.minListMinor ?? 0n;
      const curr = asc.products[i]!.priceRange?.minListMinor ?? 0n;
      expect(curr >= prev).toBe(true);
    }

    const desc = getStandaloneCategoryProducts("bracelets", "US", { sort: "price_desc", limit: 20 });
    for (let i = 1; i < desc.products.length; i++) {
      const prev = desc.products[i - 1]!.priceRange?.minListMinor ?? 0n;
      const curr = desc.products[i]!.priceRange?.minListMinor ?? 0n;
      expect(prev >= curr).toBe(true);
    }
  });
});
