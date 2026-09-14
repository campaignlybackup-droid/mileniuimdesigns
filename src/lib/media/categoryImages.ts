/**
 * Curated high-res luxury jewellery imagery mapping.
 * Provides fallback imagery when Cloudinary is not configured or assets are pending.
 */

export const CATEGORY_IMAGE_MAP: Record<string, { hero: string; product1: string; product2: string }> = {
  rings: {
    hero: "/images/categories/rings.jpg",
    product1: "/images/products/rings-1.jpg",
    product2: "/images/products/rings-2.jpg",
  },
  chains: {
    hero: "/images/categories/chains.jpg",
    product1: "/images/products/chains-1.jpg",
    product2: "/images/products/chains-2.jpg",
  },
  pendants: {
    hero: "/images/categories/pendants.jpg",
    product1: "/images/products/pendants-1.jpg",
    product2: "/images/products/pendants-2.jpg",
  },
  bracelets: {
    hero: "/images/categories/bracelets.jpg",
    product1: "/images/products/bracelets-1.jpg",
    product2: "/images/products/bracelets-2.jpg",
  },
  earrings: {
    hero: "/images/categories/earrings.jpg",
    product1: "/images/products/earrings-1.jpg",
    product2: "/images/products/earrings-2.jpg",
  },
  closeouts: {
    hero: "/images/categories/closeouts.jpg",
    product1: "/images/products/closeouts-1.jpg",
    product2: "/images/products/closeouts-2.jpg",
  },
  "one-of-a-kind": {
    hero: "/images/categories/one-of-a-kind.jpg",
    product1: "/images/products/one-of-a-kind-1.jpg",
    product2: "/images/products/one-of-a-kind-2.jpg",
  },
  "14k-gold": {
    hero: "/images/categories/14k-gold.jpg",
    product1: "/images/products/14k-gold-1.jpg",
    product2: "/images/products/14k-gold-2.jpg",
  },
  "lab-grown-diamonds": {
    hero: "/images/categories/lab-grown-diamonds.jpg",
    product1: "/images/products/lab-grown-diamonds-1.jpg",
    product2: "/images/products/lab-grown-diamonds-2.jpg",
  },
};

export function getCategoryImage(categorySlug: string): string {
  const norm = categorySlug.toLowerCase().trim();
  return CATEGORY_IMAGE_MAP[norm]?.hero ?? "/images/categories/rings.jpg";
}

export function getProductFallbackImages(identifier: string, categorySlug?: string | null): {
  primary: string;
  alternate: string;
} {
  if (categorySlug) {
    const entry = CATEGORY_IMAGE_MAP[categorySlug.toLowerCase().trim()];
    if (entry) {
      return { primary: entry.product1, alternate: entry.product2 };
    }
  }

  // Stable hashing over available category entries
  const keys = Object.keys(CATEGORY_IMAGE_MAP);
  let hash = 0;
  for (let i = 0; i < identifier.length; i++) {
    hash = (hash << 5) - hash + identifier.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % keys.length;
  const key = keys[index] ?? "rings";
  const matched = CATEGORY_IMAGE_MAP[key]!;
  return { primary: matched.product1, alternate: matched.product2 };
}

export const STONE_IMAGE_MAP: Record<string, string> = {
  moonstone: "/images/stones/moonstone.jpg",
  amethyst: "/images/stones/amethyst.jpg",
  labradorite: "/images/stones/labradorite.jpg",
  "blue-topaz": "/images/stones/blue-topaz.jpg",
  larimar: "/images/stones/larimar.jpg",
  garnet: "/images/stones/garnet.jpg",
  pearl: "/images/stones/pearl.jpg",
};

export function getStoneImage(stoneSlug: string): string {
  const norm = stoneSlug.toLowerCase().trim();
  return STONE_IMAGE_MAP[norm] ?? "/images/categories/stones.jpg";
}

