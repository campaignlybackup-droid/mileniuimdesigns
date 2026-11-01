/**
 * Curated high-res luxury jewellery imagery mapping.
 * Connects storefront category tiles and gemstone archive cards directly to
 * authentic Millennium Designs original product assets in Cloudinary.
 */

export const CATEGORY_IMAGE_MAP: Record<string, { hero: string; product1: string; product2: string }> = {
  bracelets: {
    hero: "https://res.cloudinary.com/gm6dexkj/image/upload/w_800,c_fill,q_auto,f_auto/v1/md_catalog/bracelets/bl_1_a.jpg",
    product1: "https://res.cloudinary.com/gm6dexkj/image/upload/w_640,c_fill,q_auto,f_auto/v1/md_catalog/bracelets/bl_1_a.jpg",
    product2: "https://res.cloudinary.com/gm6dexkj/image/upload/w_640,c_fill,q_auto,f_auto/v1/md_catalog/bracelets/bl_2_a.jpg",
  },
  "one-of-a-kind": {
    hero: "https://res.cloudinary.com/gm6dexkj/image/upload/w_800,c_fill,q_auto,f_auto/v1/md_catalog/one-of-a-kind/bl_8_a.jpg",
    product1: "https://res.cloudinary.com/gm6dexkj/image/upload/w_640,c_fill,q_auto,f_auto/v1/md_catalog/one-of-a-kind/bl_8_a.jpg",
    product2: "https://res.cloudinary.com/gm6dexkj/image/upload/w_640,c_fill,q_auto,f_auto/v1/md_catalog/one-of-a-kind/bl_9_a.jpg",
  },
  pendants: {
    hero: "https://res.cloudinary.com/gm6dexkj/image/upload/w_800,c_fill,q_auto,f_auto/v1/md_catalog/pendants/ok_22_a.jpg",
    product1: "https://res.cloudinary.com/gm6dexkj/image/upload/w_640,c_fill,q_auto,f_auto/v1/md_catalog/pendants/ok_22_a.jpg",
    product2: "https://res.cloudinary.com/gm6dexkj/image/upload/w_640,c_fill,q_auto,f_auto/v1/md_catalog/pendants/ok_23_a.jpg",
  },
  earrings: {
    hero: "https://res.cloudinary.com/gm6dexkj/image/upload/w_800,c_fill,q_auto,f_auto/v1/md_catalog/earrings/er_1_a.jpg",
    product1: "https://res.cloudinary.com/gm6dexkj/image/upload/w_640,c_fill,q_auto,f_auto/v1/md_catalog/earrings/er_1_a.jpg",
    product2: "https://res.cloudinary.com/gm6dexkj/image/upload/w_640,c_fill,q_auto,f_auto/v1/md_catalog/earrings/er_2_a.jpg",
  },
  rings: {
    hero: "/images/products/cpx/rings/117459.jpg",
    product1: "/images/products/cpx/rings/101312.jpg",
    product2: "/images/products/cpx/rings/117426.jpg",
  },
  chains: {
    hero: "https://res.cloudinary.com/gm6dexkj/image/upload/w_800,c_fill,q_auto,f_auto/v1/md_catalog/bracelets/bl_7_a.jpg",
    product1: "https://res.cloudinary.com/gm6dexkj/image/upload/w_640,c_fill,q_auto,f_auto/v1/md_catalog/bracelets/bl_7_a.jpg",
    product2: "https://res.cloudinary.com/gm6dexkj/image/upload/w_640,c_fill,q_auto,f_auto/v1/md_catalog/bracelets/bl_1_a.jpg",
  },
  "jewellery-sets": {
    hero: "/images/products/cpx/jewellery-sets/100802.jpg",
    product1: "/images/products/cpx/jewellery-sets/100796.jpg",
    product2: "/images/products/cpx/jewellery-sets/100771.jpg",
  },
  closeouts: {
    hero: "https://res.cloudinary.com/gm6dexkj/image/upload/w_800,c_fill,q_auto,f_auto/v1/md_catalog/pendants/ok_23_a.jpg",
    product1: "https://res.cloudinary.com/gm6dexkj/image/upload/w_640,c_fill,q_auto,f_auto/v1/md_catalog/pendants/ok_23_a.jpg",
    product2: "https://res.cloudinary.com/gm6dexkj/image/upload/w_640,c_fill,q_auto,f_auto/v1/md_catalog/earrings/er_2_a.jpg",
  },
  "14k-gold": {
    hero: "https://res.cloudinary.com/gm6dexkj/image/upload/w_800,c_fill,q_auto,f_auto/v1/md_catalog/one-of-a-kind/ok_38_a.jpg",
    product1: "https://res.cloudinary.com/gm6dexkj/image/upload/w_640,c_fill,q_auto,f_auto/v1/md_catalog/one-of-a-kind/ok_38_a.jpg",
    product2: "https://res.cloudinary.com/gm6dexkj/image/upload/w_640,c_fill,q_auto,f_auto/v1/md_catalog/bracelets/bl_1_a.jpg",
  },
  "lab-grown-diamonds": {
    hero: "https://res.cloudinary.com/gm6dexkj/image/upload/w_800,c_fill,q_auto,f_auto/v1/md_catalog/earrings/er_3_a.jpg",
    product1: "https://res.cloudinary.com/gm6dexkj/image/upload/w_640,c_fill,q_auto,f_auto/v1/md_catalog/earrings/er_3_a.jpg",
    product2: "https://res.cloudinary.com/gm6dexkj/image/upload/w_640,c_fill,q_auto,f_auto/v1/md_catalog/bracelets/bl_1_a.jpg",
  },
};

export function getCategoryImage(categorySlug: string): string {
  const norm = categorySlug.toLowerCase().trim();
  return (
    CATEGORY_IMAGE_MAP[norm]?.hero ??
    "https://res.cloudinary.com/gm6dexkj/image/upload/w_800,c_fill,q_auto,f_auto/v1/md_catalog/bracelets/bl_1_a.jpg"
  );
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
  const key = keys[index] ?? "bracelets";
  const matched = CATEGORY_IMAGE_MAP[key]!;
  return { primary: matched.product1, alternate: matched.product2 };
}

/**
 * Maps each genuine natural gemstone to an authentic Millennium Designs catalog piece.
 */
export const STONE_IMAGE_MAP: Record<string, string> = {
  citrine: "https://res.cloudinary.com/gm6dexkj/image/upload/w_800,c_fill,q_auto,f_auto/v1/md_catalog/one-of-a-kind/ok_38_a.jpg",
  "lapis-lazuli": "https://res.cloudinary.com/gm6dexkj/image/upload/w_800,c_fill,q_auto,f_auto/v1/md_catalog/one-of-a-kind/ok_14_a.jpg",
  malachite: "https://res.cloudinary.com/gm6dexkj/image/upload/w_800,c_fill,q_auto,f_auto/v1/md_catalog/one-of-a-kind/ok_43_a.jpg",
  "rutilated-quartz": "https://res.cloudinary.com/gm6dexkj/image/upload/w_800,c_fill,q_auto,f_auto/v1/md_catalog/pendants/ok_32_a.jpg",
  turquoise: "https://res.cloudinary.com/gm6dexkj/image/upload/w_800,c_fill,q_auto,f_auto/v1/md_catalog/pendants/ok_22_a.jpg",
  moonstone: "https://res.cloudinary.com/gm6dexkj/image/upload/w_800,c_fill,q_auto,f_auto/v1/md_catalog/one-of-a-kind/ok_16_a.jpg",
  amethyst: "https://res.cloudinary.com/gm6dexkj/image/upload/w_800,c_fill,q_auto,f_auto/v1/md_catalog/bracelets/bl_2_a.jpg",
  labradorite: "https://res.cloudinary.com/gm6dexkj/image/upload/w_800,c_fill,q_auto,f_auto/v1/md_catalog/one-of-a-kind/bl_9_a.jpg",
  "blue-topaz": "https://res.cloudinary.com/gm6dexkj/image/upload/w_800,c_fill,q_auto,f_auto/v1/md_catalog/pendants/ok_24_a.jpg",
  larimar: "https://res.cloudinary.com/gm6dexkj/image/upload/w_800,c_fill,q_auto,f_auto/v1/md_catalog/bracelets/bl_6_a.jpg",
  pearl: "https://res.cloudinary.com/gm6dexkj/image/upload/w_800,c_fill,q_auto,f_auto/v1/md_catalog/one-of-a-kind/ok_11_a.jpg",
  opal: "https://res.cloudinary.com/gm6dexkj/image/upload/w_800,c_fill,q_auto,f_auto/v1/md_catalog/pendants/ok_27_a.jpg",
  tourmaline: "https://res.cloudinary.com/gm6dexkj/image/upload/w_800,c_fill,q_auto,f_auto/v1/md_catalog/one-of-a-kind/ok_17_a.jpg",
  coral: "https://res.cloudinary.com/gm6dexkj/image/upload/w_800,c_fill,q_auto,f_auto/v1/md_catalog/one-of-a-kind/ok_40_a.jpg",
  kyanite: "https://res.cloudinary.com/gm6dexkj/image/upload/w_800,c_fill,q_auto,f_auto/v1/md_catalog/bracelets/bl_3_a.jpg",
  amber: "https://res.cloudinary.com/gm6dexkj/image/upload/w_800,c_fill,q_auto,f_auto/v1/md_catalog/one-of-a-kind/bl_11_a.jpg",
  garnet: "https://res.cloudinary.com/gm6dexkj/image/upload/w_800,c_fill,q_auto,f_auto/v1/md_catalog/bracelets/bl_1_a.jpg",
};

/**
 * Cloudinary public IDs for genuine stones.
 */
export const STONE_PUBLIC_ID_MAP: Record<string, string> = {
  citrine: "md_catalog/one-of-a-kind/ok_38_a",
  "lapis-lazuli": "md_catalog/one-of-a-kind/ok_14_a",
  malachite: "md_catalog/one-of-a-kind/ok_43_a",
  "rutilated-quartz": "md_catalog/pendants/ok_32_a",
  turquoise: "md_catalog/pendants/ok_22_a",
  moonstone: "md_catalog/one-of-a-kind/ok_16_a",
  amethyst: "md_catalog/bracelets/bl_2_a",
  labradorite: "md_catalog/one-of-a-kind/bl_9_a",
  "blue-topaz": "md_catalog/pendants/ok_24_a",
  larimar: "md_catalog/bracelets/bl_6_a",
  pearl: "md_catalog/one-of-a-kind/ok_11_a",
  opal: "md_catalog/pendants/ok_27_a",
  tourmaline: "md_catalog/one-of-a-kind/ok_17_a",
  coral: "md_catalog/one-of-a-kind/ok_40_a",
  kyanite: "md_catalog/bracelets/bl_3_a",
  amber: "md_catalog/one-of-a-kind/bl_11_a",
  garnet: "md_catalog/bracelets/bl_1_a",
};

export function getStoneImage(stoneSlug: string): string {
  const norm = stoneSlug.toLowerCase().trim();
  return (
    STONE_IMAGE_MAP[norm] ??
    "https://res.cloudinary.com/gm6dexkj/image/upload/w_800,c_fill,q_auto,f_auto/v1/md_catalog/pendants/ok_22_a.jpg"
  );
}
