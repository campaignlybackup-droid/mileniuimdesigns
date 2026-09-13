import type { PrismaClient } from "@/generated/prisma/client";

/**
 * The seven launch stones — 00-CONTEXT §6, 02 §6.
 *
 * Names and slugs only. `short_description`, `description_json`, `colour_hex` and
 * `hardness_mohs` are ALL left null, and `is_published` is false.
 *
 * That is deliberate and it is the rule, not an omission: stone copy is editorial claim
 * about origin, meaning and care, and writing it for a real jewellery house would be
 * inventing provenance. `sku_token` is structural and safe to set; everything a customer
 * reads is the client's (hard rule 8).
 *
 * `NST` is reserved for "no stone" and is not a row.
 */
const STONES = [
  { slug: "moonstone", name: "Moonstone", skuToken: "MST", rank: 1 },
  { slug: "amethyst", name: "Amethyst", skuToken: "AME", rank: 2 },
  { slug: "labradorite", name: "Labradorite", skuToken: "LAB", rank: 3 },
  { slug: "blue-topaz", name: "Blue Topaz", skuToken: "BTZ", rank: 4 },
  { slug: "larimar", name: "Larimar", skuToken: "LAR", rank: 5 },
  { slug: "garnet", name: "Garnet", skuToken: "GAR", rank: 6 },
  { slug: "pearl", name: "Pearl", skuToken: "PRL", rank: 7 },
] as const;

export async function seedStones(db: PrismaClient): Promise<void> {
  for (const s of STONES) {
    const existing = await db.stone.findFirst({ where: { slug: s.slug, deletedAt: null } });
    if (existing) continue;
    await db.stone.create({
      data: {
        slug: s.slug,
        name: s.name,
        skuToken: s.skuToken,
        isLabGrown: false,
        isPublished: false,
        rank: s.rank,
      },
    });
  }
}
