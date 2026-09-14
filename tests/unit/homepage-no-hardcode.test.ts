import { describe, expect, it } from "vitest";
import { codeOf } from "../support/source";

/**
 * 09 P15 exit criterion (a):
 * "Every route renders from the DB with zero hardcoded product/category/price/copy strings."
 *
 * Scans src/app/(storefront)/[market]/page.tsx using codeOf() with comments stripped.
 */
describe("homepage has zero hardcoded product/category/price/copy strings", () => {
  it("contains no hardcoded price symbols or numeric currency amounts", () => {
    const code = codeOf("src/app/(storefront)/[market]/page.tsx");

    // No hardcoded dollar or rupee or euro signs in strings/JSX
    expect(code).not.toMatch(/>\s*[\$₹£€]\s*</);
    expect(code).not.toMatch(/["'][\$₹£€]\d+/);
  });

  it("contains no hardcoded placeholder copy or promotional headlines", () => {
    const code = codeOf("src/app/(storefront)/[market]/page.tsx");

    const forbiddenStrings = [
      "lorem ipsum",
      "coming soon",
      "featured collection",
      "best sellers",
      "new arrivals",
      "shop now",
      "discover more",
      "handcrafted jewellery",
      "luxury jewellery",
    ];

    for (const phrase of forbiddenStrings) {
      expect(
        code.toLowerCase().includes(phrase),
        `Found forbidden hardcoded copy '${phrase}' in homepage source`,
      ).toBe(false);
    }
  });

  it("contains no hardcoded category names", () => {
    const code = codeOf("src/app/(storefront)/[market]/page.tsx");

    const forbiddenCategories = [
      ">Rings<",
      ">Necklaces<",
      ">Earrings<",
      ">Bracelets<",
      ">Pendants<",
      ">Chains<",
      ">One of a Kind<",
    ];

    for (const cat of forbiddenCategories) {
      expect(
        code.includes(cat),
        `Found hardcoded category '${cat}' in homepage source`,
      ).toBe(false);
    }
  });
});
