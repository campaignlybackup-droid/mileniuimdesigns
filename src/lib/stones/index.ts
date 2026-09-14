import "server-only";
import { db } from "@/lib/db/client";
import { priceVisibility } from "@/lib/catalog/visibility";

export type StoneRecord = {
  id: string;
  slug: string;
  name: string;
  shortDescription: string | null;
  descriptionJson: unknown;
  heroMediaId: string | null;
  heroPublicId: string | null;
  swatchMediaId: string | null;
  colourHex: string | null;
  hardnessMohs: string | null;
  isLabGrown: boolean;
  rank: number;
};

export type StoneCategoryLink = {
  id: string;
  slug: string;
  name: string;
  productCount: number;
};

export type ReadContext = {
  client: Pick<typeof db, "$queryRaw">;
};

/**
 * List all published stones for the /stones index.
 */
export async function listPublishedStones(ctx: ReadContext): Promise<StoneRecord[]> {
  const rows = await ctx.client.$queryRaw<
    {
      id: string;
      slug: string;
      name: string;
      short_description: string | null;
      description_json: unknown;
      hero_media_id: string | null;
      hero_public_id: string | null;
      swatch_media_id: string | null;
      colour_hex: string | null;
      hardness_mohs: string | null;
      is_lab_grown: boolean;
      rank: number;
    }[]
  >`
    SELECT s.id::text, s.slug, s.name, s.short_description, s.description_json,
           s.hero_media_id::text, m.public_id AS hero_public_id,
           s.swatch_media_id::text, s.colour_hex, s.hardness_mohs::text,
           s.is_lab_grown, s.rank
      FROM stones s
      LEFT JOIN media m ON m.id = s.hero_media_id AND m.deleted_at IS NULL
     WHERE s.deleted_at IS NULL
       AND s.is_published = true
     ORDER BY s.rank ASC, s.name ASC
  `;

  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    shortDescription: r.short_description,
    descriptionJson: r.description_json,
    heroMediaId: r.hero_media_id,
    heroPublicId: r.hero_public_id,
    swatchMediaId: r.swatch_media_id,
    colourHex: r.colour_hex,
    hardnessMohs: r.hardness_mohs,
    isLabGrown: r.is_lab_grown,
    rank: r.rank,
  }));
}

/**
 * Get a single published stone by slug.
 */
export async function getStoneBySlug(
  slug: string,
  ctx: ReadContext,
): Promise<StoneRecord | null> {
  const rows = await ctx.client.$queryRaw<
    {
      id: string;
      slug: string;
      name: string;
      short_description: string | null;
      description_json: unknown;
      hero_media_id: string | null;
      hero_public_id: string | null;
      swatch_media_id: string | null;
      colour_hex: string | null;
      hardness_mohs: string | null;
      is_lab_grown: boolean;
      rank: number;
    }[]
  >`
    SELECT s.id::text, s.slug, s.name, s.short_description, s.description_json,
           s.hero_media_id::text, m.public_id AS hero_public_id,
           s.swatch_media_id::text, s.colour_hex, s.hardness_mohs::text,
           s.is_lab_grown, s.rank
      FROM stones s
      LEFT JOIN media m ON m.id = s.hero_media_id AND m.deleted_at IS NULL
     WHERE s.slug = ${slug}
       AND s.deleted_at IS NULL
       AND s.is_published = true
     LIMIT 1
  `;

  const r = rows[0];
  if (!r) return null;

  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    shortDescription: r.short_description,
    descriptionJson: r.description_json,
    heroMediaId: r.hero_media_id,
    heroPublicId: r.hero_public_id,
    swatchMediaId: r.swatch_media_id,
    colourHex: r.colour_hex,
    hardnessMohs: r.hardness_mohs,
    isLabGrown: r.is_lab_grown,
    rank: r.rank,
  };
}

/**
 * Get categories that have products with this stone in this market.
 */
export async function getStoneCategories(
  stoneId: string,
  marketCode: string,
  ctx: ReadContext,
): Promise<StoneCategoryLink[]> {
  const rows = await ctx.client.$queryRaw<
    {
      id: string;
      slug: string;
      name: string;
      product_count: bigint;
    }[]
  >`
    SELECT c.id::text, c.slug, c.name, count(DISTINCT p.id)::bigint AS product_count
      FROM categories c
      JOIN product_categories pc ON pc.category_id = c.id
      JOIN products p ON p.id = pc.product_id
      JOIN product_stones ps ON ps.product_id = p.id AND ps.stone_id = ${stoneId}::uuid
      LEFT JOIN product_market_content pmc ON pmc.product_id = p.id AND pmc.market_code = ${marketCode}
     WHERE c.deleted_at IS NULL
       AND c.is_published = true
       AND p.deleted_at IS NULL
       AND p.status = 'active'
       AND p.published_at IS NOT NULL
       AND p.published_at <= now()
       AND coalesce(pmc.is_published, true)
       ${priceVisibility(marketCode)}
     GROUP BY c.id, c.slug, c.name, c.rank
    HAVING count(DISTINCT p.id) > 0
     ORDER BY c.rank ASC, c.name ASC
  `;

  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    productCount: Number(r.product_count),
  }));
}

/** Storefront route helpers */
export async function getStorefrontStones(): Promise<StoneRecord[]> {
  return listPublishedStones({ client: db });
}

export async function getStorefrontStone(slug: string): Promise<StoneRecord | null> {
  return getStoneBySlug(slug, { client: db });
}

export async function getStorefrontStoneCategories(
  stoneId: string,
  marketCode: string,
): Promise<StoneCategoryLink[]> {
  return getStoneCategories(stoneId, marketCode, { client: db });
}

export async function listPublishedStoneSlugs(): Promise<{ slug: string }[]> {
  return db.stone.findMany({
    where: { deletedAt: null, isPublished: true },
    select: { slug: true },
    orderBy: { rank: "asc" },
  });
}

