/**
 * Curated high-res luxury jewellery imagery mapping.
 * Provides fallback imagery when Cloudinary is not configured or assets are pending.
 */

export const CATEGORY_IMAGE_MAP: Record<string, { hero: string; product1: string; product2: string }> = {
  rings: {
    hero: "/images/categories/rings.jpg",
    product1: "https://res.cloudinary.com/drda4d5p4/image/upload/f_auto,q_auto/v1/md_catalog/rings/rg_1_a",
    product2: "https://res.cloudinary.com/drda4d5p4/image/upload/f_auto,q_auto/v1/md_catalog/rings/rg_2_a",
  },
  chains: {
    hero: "/images/categories/chains.jpg",
    product1: "https://res.cloudinary.com/drda4d5p4/image/upload/f_auto,q_auto/v1/md_catalog/pendants/pd_1_a",
    product2: "https://res.cloudinary.com/drda4d5p4/image/upload/f_auto,q_auto/v1/md_catalog/bracelets/bl_1_a",
  },
  pendants: {
    hero: "/images/categories/pendants.jpg",
    product1: "https://res.cloudinary.com/drda4d5p4/image/upload/f_auto,q_auto/v1/md_catalog/pendants/pd_1_a",
    product2: "https://res.cloudinary.com/drda4d5p4/image/upload/f_auto,q_auto/v1/md_catalog/pendants/pd_2_a",
  },
  bracelets: {
    hero: "/images/categories/bracelets.jpg",
    product1: "https://res.cloudinary.com/drda4d5p4/image/upload/f_auto,q_auto/v1/md_catalog/bracelets/bl_1_a",
    product2: "https://res.cloudinary.com/drda4d5p4/image/upload/f_auto,q_auto/v1/md_catalog/bracelets/bl_2_a",
  },
  earrings: {
    hero: "/images/categories/earrings.jpg",
    product1: "https://res.cloudinary.com/drda4d5p4/image/upload/f_auto,q_auto/v1/md_catalog/earrings/er_1_a",
    product2: "https://res.cloudinary.com/drda4d5p4/image/upload/f_auto,q_auto/v1/md_catalog/earrings/er_2_a",
  },
  closeouts: {
    hero: "/images/categories/closeouts.jpg",
    product1: "https://res.cloudinary.com/drda4d5p4/image/upload/f_auto,q_auto/v1/md_catalog/earrings/er_1_a",
    product2: "https://res.cloudinary.com/drda4d5p4/image/upload/f_auto,q_auto/v1/md_catalog/bracelets/bl_2_a",
  },
  "one-of-a-kind": {
    hero: "/images/categories/one-of-a-kind.jpg",
    product1: "https://res.cloudinary.com/drda4d5p4/image/upload/f_auto,q_auto/v1/md_catalog/one-of-a-kind/ok_1_a",
    product2: "https://res.cloudinary.com/drda4d5p4/image/upload/f_auto,q_auto/v1/md_catalog/one-of-a-kind/ok_2_a",
  },
  "14k-gold": {
    hero: "/images/categories/14k-gold.jpg",
    product1: "https://res.cloudinary.com/drda4d5p4/image/upload/f_auto,q_auto/v1/md_catalog/pendants/pd_1_a",
    product2: "https://res.cloudinary.com/drda4d5p4/image/upload/f_auto,q_auto/v1/md_catalog/rings/rg_1_a",
  },
  "lab-grown-diamonds": {
    hero: "/images/categories/lab-grown-diamonds.jpg",
    product1: "https://res.cloudinary.com/drda4d5p4/image/upload/f_auto,q_auto/v1/md_catalog/earrings/er_3_a",
    product2: "https://res.cloudinary.com/drda4d5p4/image/upload/f_auto,q_auto/v1/md_catalog/rings/rg_1_a",
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

