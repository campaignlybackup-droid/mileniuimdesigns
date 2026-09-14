import type { PrismaClient } from "@/generated/prisma/client";

/**
 * The NINE seeded categories — 02 §6, 03 §7.1, 08 §4.1.
 *
 * `STONES` is deliberately NOT here. It is a reserved first route segment
 * (`/stones/labradorite`), so `saveCategory()` would reject a category with that slug and
 * a seed that created it anyway would be bypassing its own writer. The tenth
 * customer-facing menu entry is a `navigation_items` row of `link_type='url'` pointing at
 * `/stones` — nine category rows plus one nav row is ten menu entries.
 *
 * Every description is EMPTY. The customer-facing spelling is the client's to write, and
 * inventing category copy for a real jewellery house is what hard rule 8 forbids.
 */
const CATEGORIES = [
  { slug: "rings", name: "RINGS", skuToken: "RNG", rank: 1 },
  { slug: "chains", name: "CHAINS", skuToken: "CHN", rank: 2 },
  { slug: "pendants", name: "PENDANTS", skuToken: "PND", rank: 3 },
  { slug: "bracelets", name: "BRACELETS", skuToken: "BRC", rank: 4 },
  { slug: "earrings", name: "EARRINGS", skuToken: "EAR", rank: 5 },
  // Four of these are not merchandise categories in the ordinary sense — they are
  // curated edits that happen to be routed as categories (03 §7.1).
  { slug: "closeouts", name: "CLOSEOUTS", skuToken: "CLO", rank: 6 },
  { slug: "one-of-a-kind", name: "ONE OF A KIND", skuToken: "OOK", rank: 7 },
  { slug: "14k-gold", name: "14K GOLD", skuToken: "G14", rank: 8 },
  { slug: "lab-grown-diamonds", name: "LAB GROWN DIAMONDS", skuToken: "LGD", rank: 9 },
] as const;

/** First path segments the router owns. A category may never take one of these. */
export const RESERVED_SLUGS = [
  "stones", "collections", "products", "search", "cart", "checkout", "account", "login",
  "orders", "wishlist", "heritage", "about", "journal", "api", "admin", "_preview",
  "pages", "sitemaps", "sitemap.xml", "robots.txt",
] as const;


export async function seedCategories(db: PrismaClient): Promise<void> {
  for (const c of CATEGORIES) {
    if ((RESERVED_SLUGS as readonly string[]).includes(c.slug)) {
      throw new Error(
        `Category slug '${c.slug}' collides with a reserved route segment. ` +
          `saveCategory() would reject it, so seeding it would bypass the writer.`,
      );
    }
    const existing = await db.category.findFirst({ where: { slug: c.slug, deletedAt: null } });
    if (existing) continue;
    await db.category.create({
      data: {
        slug: c.slug,
        name: c.name,
        materializedPath: "",
        depth: 0,
        skuToken: c.skuToken,
        // Unpublished until the client writes the copy. An empty category page that is
        // live and indexable is worse than one that does not exist yet.
        isPublished: false,
        rank: c.rank,
      },
    });
  }

  // materialized_path is the row's own id for a root category. Set after insert because
  // it needs the generated id.
  await db.$executeRaw`
    UPDATE categories SET materialized_path = id::text
    WHERE parent_id IS NULL AND materialized_path = ''
  `;
}
