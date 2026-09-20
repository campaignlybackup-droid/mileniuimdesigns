import "server-only";
import { db } from "@/lib/db/client";
import { sql } from "@/lib/db/sql";
import { priceVisibility } from "@/lib/catalog/visibility";
import { allFilters, type CatalogFilters } from "@/lib/catalog/filters";
import { getDisplayPrice, getProductPriceRanges } from "@/lib/pricing/display";
import type { DisplayPrice, MarketCode, PriceRange } from "@/lib/pricing/types";

export type PdpVariantOptionValue = {
  optionId: string;
  optionName: string;
  valueId: string;
  value: string;
  swatchMediaId: string | null;
};

export type PdpVariant = {
  id: string;
  sku: string;
  title: string | null;
  position: number;
  isDefault: boolean;
  inventoryPolicy: string;
  ringSize: string | null;
  lengthMm: string | null;
  grossWeightGrams: string | null;
  optionValues: PdpVariantOptionValue[];
  price: DisplayPrice | null;
};

export type PdpMediaItem = {
  id: string;
  mediaId: string;
  publicId: string;
  format: string;
  altText: string | null;
  width: number | null;
  height: number | null;
  role: string;
  position: number;
  variantId: string | null;
};

export type PdpProduct = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  descriptionJson: unknown;
  careInstructionsJson: unknown;
  primaryCategoryId: string | null;
  primaryCategoryName: string | null;
  primaryCategorySlug: string | null;
  isOneOfAKind: boolean;
  isMadeToOrder: boolean;
  leadTimeDays: number | null;
  soldAt: Date | null;
  defaultVariantId: string | null;
  unavailableReason: string | null;
  variants: PdpVariant[];
  media: PdpMediaItem[];
  stones: {
    stoneId: string;
    name: string;
    slug: string;
    isPrimary: boolean;
    caratWeight: string | null;
    cut: string | null;
    stoneCount: number | null;
  }[];
  materials: {
    materialId: string;
    name: string;
    slug: string;
    isPrimary: boolean;
  }[];
  attributes: {
    name: string;
    value: string;
  }[];
  options: {
    id: string;
    name: string;
    values: {
      id: string;
      value: string;
      swatchMediaId: string | null;
    }[];
  }[];
};

export type StorefrontCard = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  primaryCategoryId: string | null;
  isOneOfAKind: boolean;
  soldAt: Date | null;
  primaryImage: {
    publicId: string;
    altText: string | null;
  } | null;
  alternateImage: {
    publicId: string;
    altText: string | null;
  } | null;
  stonesText: string | null;
  materialsText: string | null;
  priceRange: PriceRange | null;
};

export type ListProductsResult = {
  products: StorefrontCard[];
  totalCount: number;
};

export type ReadContext = {
  client: Pick<typeof db, "$queryRaw">;
};

/**
 * Fetch a product for PDP display.
 * Returns null if the product does not exist or is unpublished/hidden in this market.
 */
export async function getProductForPdp(
  slug: string,
  marketCode: string,
  ctx: ReadContext,
): Promise<PdpProduct | null> {
  const rows = await ctx.client.$queryRaw<
    {
      id: string;
      slug: string;
      title: string;
      subtitle: string | null;
      description_json: unknown;
      care_instructions_json: unknown;
      primary_category_id: string | null;
      primary_category_name: string | null;
      primary_category_slug: string | null;
      is_one_of_a_kind: boolean;
      is_made_to_order: boolean;
      lead_time_days: number | null;
      default_variant_id: string | null;
      sold_at: Date | null;
      pmc_title: string | null;
      pmc_subtitle: string | null;
      pmc_description_json: unknown;
      unavailable_reason: string | null;
    }[]
  >`
    SELECT p.id::text, p.slug, p.title, p.subtitle, p.description_json,
           p.care_instructions_json, p.primary_category_id::text,
           c.name AS primary_category_name, c.slug AS primary_category_slug,
           p.is_one_of_a_kind, p.is_made_to_order, p.lead_time_days,
           p.default_variant_id::text, p.sold_at,
           pmc.title AS pmc_title, pmc.subtitle AS pmc_subtitle,
           pmc.description_json AS pmc_description_json,
           pmc.unavailable_reason
      FROM products p
      LEFT JOIN categories c ON c.id = p.primary_category_id AND c.deleted_at IS NULL
      LEFT JOIN product_market_content pmc
             ON pmc.product_id = p.id AND pmc.market_code = ${marketCode}
     WHERE p.slug = ${slug}
       AND p.deleted_at IS NULL
       AND p.status = 'active'
       AND p.published_at IS NOT NULL
       AND p.published_at <= now()
       AND coalesce(pmc.is_published, true)
     LIMIT 1
  `;

  const prod = rows[0];
  if (!prod) return null;

  // Query variants
  const variantRows = await ctx.client.$queryRaw<
    {
      id: string;
      sku: string;
      title: string | null;
      position: number;
      inventory_policy: string;
      ring_size: string | null;
      length_mm: string | null;
      gross_weight_grams: string | null;
      option_id: string | null;
      option_name: string | null;
      value_id: string | null;
      value: string | null;
      swatch_media_id: string | null;
    }[]
  >`
    SELECT v.id::text, v.sku, v.title, v.position,
           v.inventory_policy::text AS inventory_policy,
           v.ring_size::text, v.length_mm::text, v.gross_weight_grams::text,
           po.id::text AS option_id, po.name AS option_name,
           pov.id::text AS value_id, pov.value, pov.swatch_media_id::text
      FROM product_variants v
      LEFT JOIN variant_option_values vov ON vov.variant_id = v.id
      LEFT JOIN product_option_values pov ON pov.id = vov.option_value_id
      LEFT JOIN product_options po ON po.id = vov.option_id
     WHERE v.product_id = ${prod.id}::uuid
       AND v.deleted_at IS NULL
       AND v.is_active
     ORDER BY v.position, v.id, po.position
  `;

  const variantsMap = new Map<string, PdpVariant>();
  for (const vr of variantRows) {
    let variant = variantsMap.get(vr.id);
    if (!variant) {
      variant = {
        id: vr.id,
        sku: vr.sku,
        title: vr.title,
        position: vr.position,
        isDefault: prod.default_variant_id === vr.id,
        inventoryPolicy: vr.inventory_policy,
        ringSize: vr.ring_size,
        lengthMm: vr.length_mm,
        grossWeightGrams: vr.gross_weight_grams,
        optionValues: [],
        price: null,
      };
      variantsMap.set(vr.id, variant);
    }
    if (vr.option_id && vr.option_name && vr.value_id && vr.value) {
      variant.optionValues.push({
        optionId: vr.option_id,
        optionName: vr.option_name,
        valueId: vr.value_id,
        value: vr.value,
        swatchMediaId: vr.swatch_media_id,
      });
    }
  }

  const variantList = Array.from(variantsMap.values());

  // Attach display prices if any variants exist
  if (variantList.length > 0) {
    try {
      const displayPrices = await getDisplayPrice(
        variantList.map((v) => v.id),
        marketCode as MarketCode,
      );
      for (const v of variantList) {
        v.price = displayPrices.get(v.id) ?? null;
      }
    } catch {
      // Unpriced in market
    }
  }

  // Query media
  const mediaRows = await ctx.client.$queryRaw<
    {
      id: string;
      media_id: string;
      public_id: string;
      format: string;
      alt_text: string | null;
      width: number | null;
      height: number | null;
      role: string;
      position: number;
      variant_id: string | null;
    }[]
  >`
    SELECT pm.id::text, m.id::text AS media_id, m.public_id, m.format,
           m.alt_text, m.width, m.height, pm.role::text AS role,
           pm.position, pm.variant_id::text
      FROM product_media pm
      JOIN media m ON m.id = pm.media_id AND m.deleted_at IS NULL
     WHERE pm.product_id = ${prod.id}::uuid
     ORDER BY pm.position, pm.id
  `;

  // Query stones
  const stoneRows = await ctx.client.$queryRaw<
    {
      stone_id: string;
      name: string;
      slug: string;
      is_primary: boolean;
      carat_weight: string | null;
      cut: string | null;
      stone_count: number | null;
    }[]
  >`
    SELECT s.id::text AS stone_id, s.name, s.slug, ps.is_primary,
           ps.carat_weight::text, ps.cut, ps.stone_count
      FROM product_stones ps
      JOIN stones s ON s.id = ps.stone_id AND s.deleted_at IS NULL
     WHERE ps.product_id = ${prod.id}::uuid
     ORDER BY ps.position, s.rank
  `;

  // Query materials
  const materialRows = await ctx.client.$queryRaw<
    {
      material_id: string;
      name: string;
      slug: string;
      is_primary: boolean;
    }[]
  >`
    SELECT DISTINCT m.id::text AS material_id, m.name, m.slug, vm.is_primary
      FROM product_variants v
      JOIN variant_materials vm ON vm.variant_id = v.id
      JOIN materials m ON m.id = vm.material_id AND m.deleted_at IS NULL
     WHERE v.product_id = ${prod.id}::uuid
       AND v.deleted_at IS NULL
     ORDER BY vm.is_primary DESC, m.name
  `;

  // Query attributes
  const attrRows = await ctx.client.$queryRaw<
    {
      name: string;
      value: string;
    }[]
  >`
    SELECT a.label AS name, coalesce(o.label, o.value, pav.value_text) AS value
      FROM product_attribute_values pav
      JOIN attributes a ON a.id = pav.attribute_id AND a.deleted_at IS NULL
      LEFT JOIN attribute_options o ON o.id = pav.option_id
     WHERE pav.product_id = ${prod.id}::uuid
     ORDER BY a.rank, a.label
  `;


  // Query options structure
  const optionRows = await ctx.client.$queryRaw<
    {
      option_id: string;
      option_name: string;
      value_id: string;
      value: string;
      swatch_media_id: string | null;
    }[]
  >`
    SELECT po.id::text AS option_id, po.name AS option_name,
           pov.id::text AS value_id, pov.value, pov.swatch_media_id::text
      FROM product_options po
      JOIN product_option_values pov ON pov.option_id = po.id
     WHERE po.product_id = ${prod.id}::uuid
     ORDER BY po.position, pov.position
  `;

  const optionsMap = new Map<string, { id: string; name: string; values: { id: string; value: string; swatchMediaId: string | null }[] }>();
  for (const opt of optionRows) {
    let o = optionsMap.get(opt.option_id);
    if (!o) {
      o = { id: opt.option_id, name: opt.option_name, values: [] };
      optionsMap.set(opt.option_id, o);
    }
    o.values.push({
      id: opt.value_id,
      value: opt.value,
      swatchMediaId: opt.swatch_media_id,
    });
  }

  return {
    id: prod.id,
    slug: prod.slug,
    title: prod.pmc_title ?? prod.title,
    subtitle: prod.pmc_subtitle ?? prod.subtitle,
    descriptionJson: prod.pmc_description_json ?? prod.description_json,
    careInstructionsJson: prod.care_instructions_json,
    primaryCategoryId: prod.primary_category_id,
    primaryCategoryName: prod.primary_category_name,
    primaryCategorySlug: prod.primary_category_slug,
    isOneOfAKind: prod.is_one_of_a_kind,
    isMadeToOrder: prod.is_made_to_order,
    leadTimeDays: prod.lead_time_days,
    soldAt: prod.sold_at,
    defaultVariantId: prod.default_variant_id,
    unavailableReason: prod.unavailable_reason,
    variants: variantList,
    media: mediaRows.map((m) => ({
      id: m.id,
      mediaId: m.media_id,
      publicId: m.public_id,
      format: m.format,
      altText: m.alt_text,
      width: m.width,
      height: m.height,
      role: m.role,
      position: m.position,
      variantId: m.variant_id,
    })),
    stones: stoneRows.map((s) => ({
      stoneId: s.stone_id,
      name: s.name,
      slug: s.slug,
      isPrimary: s.is_primary,
      caratWeight: s.carat_weight,
      cut: s.cut,
      stoneCount: s.stone_count,
    })),
    materials: materialRows.map((m) => ({
      materialId: m.material_id,
      name: m.name,
      slug: m.slug,
      isPrimary: m.is_primary,
    })),
    attributes: attrRows.map((a) => ({
      name: a.name,
      value: a.value,
    })),
    options: Array.from(optionsMap.values()),
  };
}

/**
 * List products for a category subtree.
 */
export async function listCategoryProducts(
  categoryId: string,
  marketCode: string,
  options: {
    filters?: CatalogFilters;
    sort?: string;
    limit?: number;
    offset?: number;
  },
  ctx: ReadContext,
): Promise<ListProductsResult> {
  const limit = Math.max(1, Math.min(options.limit ?? 24, 100));
  const offset = Math.max(0, options.offset ?? 0);
  const filterClause = options.filters ? allFilters("p.id", options.filters) : sql``;

  // Category subtree filter
  const categoryClause = sql`
    AND EXISTS (
      SELECT 1 FROM product_categories pc
      JOIN categories c ON c.id = pc.category_id AND c.deleted_at IS NULL
      WHERE pc.product_id = p.id
        AND c.materialized_path LIKE
            (SELECT t.materialized_path FROM categories t WHERE t.id = ${categoryId}::uuid) || '%'
    )
  `;

  return queryProductList(
    marketCode,
    sql`${categoryClause} ${filterClause}`,
    options.sort,
    limit,
    offset,
    ctx,
  );
}

/**
 * List products for a collection.
 */
export async function listCollectionProducts(
  collectionId: string,
  marketCode: string,
  options: {
    filters?: CatalogFilters;
    sort?: string;
    limit?: number;
    offset?: number;
  },
  ctx: ReadContext,
): Promise<ListProductsResult> {
  const limit = Math.max(1, Math.min(options.limit ?? 24, 100));
  const offset = Math.max(0, options.offset ?? 0);
  const filterClause = options.filters ? allFilters("p.id", options.filters) : sql``;

  const collectionClause = sql`
    AND EXISTS (
      SELECT 1 FROM product_collections pcol
      WHERE pcol.product_id = p.id
        AND pcol.collection_id = ${collectionId}::uuid
    )
  `;

  return queryProductList(
    marketCode,
    sql`${collectionClause} ${filterClause}`,
    options.sort,
    limit,
    offset,
    ctx,
  );
}

/**
 * List products for a stone.
 */
export async function listStoneProducts(
  stoneId: string,
  marketCode: string,
  options: {
    categoryId?: string;
    filters?: CatalogFilters;
    sort?: string;
    limit?: number;
    offset?: number;
  },
  ctx: ReadContext,
): Promise<ListProductsResult> {
  const limit = Math.max(1, Math.min(options.limit ?? 24, 100));
  const offset = Math.max(0, options.offset ?? 0);
  const filterClause = options.filters ? allFilters("p.id", options.filters) : sql``;

  let categoryClause = sql``;
  if (options.categoryId) {
    categoryClause = sql`
      AND EXISTS (
        SELECT 1 FROM product_categories pc
        JOIN categories c ON c.id = pc.category_id AND c.deleted_at IS NULL
        WHERE pc.product_id = p.id
          AND c.materialized_path LIKE
              (SELECT t.materialized_path FROM categories t WHERE t.id = ${options.categoryId}::uuid) || '%'
      )
    `;
  }

  const stoneClause = sql`
    AND EXISTS (
      SELECT 1 FROM product_stones ps
      WHERE ps.product_id = p.id
        AND ps.stone_id = ${stoneId}::uuid
    )
  `;

  return queryProductList(
    marketCode,
    sql`${stoneClause} ${categoryClause} ${filterClause}`,
    options.sort,
    limit,
    offset,
    ctx,
  );
}

/**
 * Helper to execute paginated product list queries.
 */
async function queryProductList(
  marketCode: string,
  customClauses: ReturnType<typeof sql>,
  sort: string | undefined,
  limit: number,
  offset: number,
  ctx: ReadContext,
): Promise<ListProductsResult> {
  // Sort ordering
  let orderSql = sql`ORDER BY coalesce(pmc.rank_override, p.rank) ASC, p.id ASC`;
  if (sort === "price_asc") {
    orderSql = sql`ORDER BY pms.min_price_minor ASC NULLS LAST, p.rank ASC, p.id ASC`;
  } else if (sort === "price_desc") {
    orderSql = sql`ORDER BY pms.max_price_minor DESC NULLS LAST, p.rank ASC, p.id ASC`;
  } else if (sort === "newest") {
    orderSql = sql`ORDER BY p.published_at DESC NULLS LAST, p.id ASC`;
  }

  // Count query
  const countRows = await ctx.client.$queryRaw<{ count: bigint }[]>`
    SELECT count(*)::bigint AS count
      FROM products p
      LEFT JOIN product_market_content pmc
             ON pmc.product_id = p.id AND pmc.market_code = ${marketCode}
     WHERE p.deleted_at IS NULL
       AND p.status = 'active'
       AND p.published_at IS NOT NULL
       AND p.published_at <= now()
       AND coalesce(pmc.is_published, true)
       ${priceVisibility(marketCode)}
       ${customClauses}
  `;
  const totalCount = Number(countRows[0]?.count ?? 0n);
  if (totalCount === 0) {
    return { products: [], totalCount: 0 };
  }

  // Items query
  const rows = await ctx.client.$queryRaw<
    {
      id: string;
      slug: string;
      title: string;
      subtitle: string | null;
      primary_category_id: string | null;
      is_one_of_a_kind: boolean;
      sold_at: Date | null;
      pmc_title: string | null;
      pmc_subtitle: string | null;
    }[]
  >`
    SELECT p.id::text, p.slug, p.title, p.subtitle, p.primary_category_id::text,
           p.is_one_of_a_kind, p.sold_at,
           pmc.title AS pmc_title, pmc.subtitle AS pmc_subtitle
      FROM products p
      LEFT JOIN product_market_content pmc
             ON pmc.product_id = p.id AND pmc.market_code = ${marketCode}
      LEFT JOIN product_market_sort pms
             ON pms.product_id = p.id AND pms.market_code = ${marketCode}
     WHERE p.deleted_at IS NULL
       AND p.status = 'active'
       AND p.published_at IS NOT NULL
       AND p.published_at <= now()
       AND coalesce(pmc.is_published, true)
       ${priceVisibility(marketCode)}
       ${customClauses}
     ${orderSql}
     LIMIT ${limit} OFFSET ${offset}
  `;

  if (rows.length === 0) {
    return { products: [], totalCount };
  }

  const productIds = rows.map((r) => r.id);

  // Batch query price ranges
  let priceRanges = new Map<string, PriceRange>();
  try {
    priceRanges = await getProductPriceRanges(productIds, marketCode as MarketCode);
  } catch {
    // Graceful fallback
  }

  // Batch query media (primary and alternate image)
  const mediaRows = await ctx.client.$queryRaw<
    {
      product_id: string;
      public_id: string;
      alt_text: string | null;
      position: number;
    }[]
  >`
    SELECT DISTINCT ON (pm.product_id, pm.position)
           pm.product_id::text, m.public_id, m.alt_text, pm.position
      FROM product_media pm
      JOIN media m ON m.id = pm.media_id AND m.deleted_at IS NULL
     WHERE pm.product_id = ANY(${productIds}::uuid[])
       AND pm.variant_id IS NULL
     ORDER BY pm.product_id, pm.position, pm.id
  `;

  const mediaByProduct = new Map<string, { publicId: string; altText: string | null }[]>();
  for (const m of mediaRows) {
    const list = mediaByProduct.get(m.product_id) ?? [];
    list.push({ publicId: m.public_id, altText: m.alt_text });
    mediaByProduct.set(m.product_id, list);
  }

  // Query stone names
  const stoneRows = await ctx.client.$queryRaw<
    {
      product_id: string;
      name: string;
    }[]
  >`
    SELECT ps.product_id::text, s.name
      FROM product_stones ps
      JOIN stones s ON s.id = ps.stone_id AND s.deleted_at IS NULL
     WHERE ps.product_id = ANY(${productIds}::uuid[])
     ORDER BY ps.is_primary DESC, ps.position
  `;
  const stonesByProduct = new Map<string, string[]>();
  for (const s of stoneRows) {
    const list = stonesByProduct.get(s.product_id) ?? [];
    list.push(s.name);
    stonesByProduct.set(s.product_id, list);
  }

  // Query material names
  const matRows = await ctx.client.$queryRaw<
    {
      product_id: string;
      name: string;
    }[]
  >`
    SELECT DISTINCT v.product_id::text AS product_id, m.name, vm.is_primary
      FROM product_variants v
      JOIN variant_materials vm ON vm.variant_id = v.id
      JOIN materials m ON m.id = vm.material_id AND m.deleted_at IS NULL
     WHERE v.product_id = ANY(${productIds}::uuid[])
       AND v.deleted_at IS NULL
     ORDER BY v.product_id::text, vm.is_primary DESC, m.name
  `;
  const matsByProduct = new Map<string, string[]>();
  for (const m of matRows) {
    const list = matsByProduct.get(m.product_id) ?? [];
    list.push(m.name);
    matsByProduct.set(m.product_id, list);
  }

  const products: StorefrontCard[] = rows.map((r) => {
    const media = mediaByProduct.get(r.id) ?? [];
    const stones = stonesByProduct.get(r.id) ?? [];
    const mats = matsByProduct.get(r.id) ?? [];

    return {
      id: r.id,
      slug: r.slug,
      title: r.pmc_title ?? r.title,
      subtitle: r.pmc_subtitle ?? r.subtitle,
      primaryCategoryId: r.primary_category_id,
      isOneOfAKind: r.is_one_of_a_kind,
      soldAt: r.sold_at,
      primaryImage: media[0] ?? null,
      alternateImage: media[1] ?? null,
      stonesText: stones.length > 0 ? stones.join(" · ") : null,
      materialsText: mats.length > 0 ? mats.join(" · ") : null,
      priceRange: priceRanges.get(r.id) ?? null,
    };
  });

  return {
    products,
    totalCount,
  };
}

/**
 * Resolve a category by slug.
 */
export async function resolveCategoryBySlug(
  slug: string,
  ctx: ReadContext,
): Promise<{
  id: string;
  slug: string;
  name: string;
  materializedPath: string;
  descriptionJson: unknown;
  heroMediaId: string | null;
} | null> {
  const rows = await ctx.client.$queryRaw<
    {
      id: string;
      slug: string;
      name: string;
      materialized_path: string;
      description_json: unknown;
      hero_media_id: string | null;
    }[]
  >`
    SELECT id::text, slug, name, materialized_path, description_json, hero_media_id::text
      FROM categories
     WHERE slug = ${slug}
       AND deleted_at IS NULL
       AND is_published = true
     LIMIT 1
  `;
  const c = rows[0];
  if (!c) return null;
  return {
    id: c.id,
    slug: c.slug,
    name: c.name,
    materializedPath: c.materialized_path,
    descriptionJson: c.description_json,
    heroMediaId: c.hero_media_id,
  };
}

/**
 * Resolve a curated facet by category slug and facet slug.
 */
export async function resolveCuratedFacet(
  categorySlug: string,
  facetSlug: string,
  marketCode: string,
  ctx: ReadContext,
): Promise<{
  id: string;
  slug: string;
  title: string;
  introJson: unknown;
  categoryId: string;
  categorySlug: string;
  categoryName: string;
  stoneId: string | null;
  materialId: string | null;
  attributeOptionId: string | null;
  tagId: string | null;
} | null> {
  const rows = await ctx.client.$queryRaw<
    {
      id: string;
      slug: string;
      title: string;
      intro_json: unknown;
      category_id: string;
      category_slug: string;
      category_name: string;
      stone_id: string | null;
      material_id: string | null;
      attribute_option_id: string | null;
      tag_id: string | null;
    }[]
  >`
    SELECT cf.id::text, cf.slug, cf.title, cf.intro_json,
           c.id::text AS category_id, c.slug AS category_slug, c.name AS category_name,
           cf.stone_id::text, cf.material_id::text,
           cf.attribute_option_id::text, cf.tag_id::text
      FROM curated_facets cf
      JOIN categories c ON c.id = cf.category_id AND c.deleted_at IS NULL
      JOIN curated_facet_markets cfm ON cfm.facet_id = cf.id AND cfm.market_code = ${marketCode}
     WHERE c.slug = ${categorySlug}
       AND cf.slug = ${facetSlug}
       AND cf.is_active = true
       AND cfm.is_active = true
     LIMIT 1
  `;
  const f = rows[0];
  if (!f) return null;
  return {
    id: f.id,
    slug: f.slug,
    title: f.title,
    introJson: f.intro_json,
    categoryId: f.category_id,
    categorySlug: f.category_slug,
    categoryName: f.category_name,
    stoneId: f.stone_id,
    materialId: f.material_id,
    attributeOptionId: f.attribute_option_id,
    tagId: f.tag_id,
  };
}

/** Storefront route helpers (connecting route handlers to service layer) */
export async function getStorefrontCategory(slug: string) {
  try {
    const cat = await resolveCategoryBySlug(slug, { client: db });
    if (cat) return cat;
  } catch {
    // Database unconfigured / offline on host storage
  }
  const { STANDALONE_CATEGORIES } = await import("@/lib/storage/standalone-catalog");
  const found = STANDALONE_CATEGORIES.find((c) => c.slug.toLowerCase() === slug.toLowerCase());
  if (!found) return null;
  return {
    id: found.id,
    slug: found.slug,
    name: found.name,
    description: null,
    parentId: null,
    rank: found.rank,
  };
}

export async function listPublishedCategories() {
  try {
    const rows = await db.category.findMany({
      where: { deletedAt: null, isPublished: true },
      select: { id: true, name: true, slug: true },
      orderBy: { rank: "asc" },
    });
    if (rows && rows.length > 0) return rows;
  } catch {
    // Database unconfigured / offline on host storage
  }
  const { STANDALONE_CATEGORIES } = await import("@/lib/storage/standalone-catalog");
  return STANDALONE_CATEGORIES.map((c) => ({ id: c.id, name: c.name, slug: c.slug }));
}

export async function listStorefrontCategoryProducts(
  categoryId: string,
  marketCode: string,
  options: {
    filters?: CatalogFilters;
    sort?: string;
    limit?: number;
    offset?: number;
  },
) {
  try {
    const res = await listCategoryProducts(categoryId, marketCode, options, { client: db });
    if (res && res.products.length > 0) return res;
  } catch {
    // Database unconfigured / offline on host storage
  }
  const { getStandaloneCategoryProducts } = await import("@/lib/storage/standalone-catalog");
  return getStandaloneCategoryProducts(categoryId, marketCode, options);
}

export async function listStorefrontCollectionProducts(
  collectionId: string,
  marketCode: string,
  options: {
    filters?: CatalogFilters;
    sort?: string;
    limit?: number;
    offset?: number;
  },
) {
  try {
    return await listCollectionProducts(collectionId, marketCode, options, { client: db });
  } catch {
    return { products: [], totalCount: 0 };
  }
}

export async function getStorefrontCollection(slug: string) {
  try {
    return await db.collection.findFirst({
      where: { slug, deletedAt: null, isPublished: true },
    });
  } catch {
    return null;
  }
}

export async function listPublishedCollectionSlugs() {
  try {
    return await db.collection.findMany({
      where: { deletedAt: null, isPublished: true },
      select: { slug: true },
    });
  } catch {
    return [];
  }
}

export async function getStorefrontCuratedFacet(
  categorySlug: string,
  facetSlug: string,
  marketCode: string,
) {
  try {
    return await resolveCuratedFacet(categorySlug, facetSlug, marketCode, { client: db });
  } catch {
    return null;
  }
}

export async function getStorefrontPdpProduct(slug: string, marketCode: string) {
  try {
    const prod = await getProductForPdp(slug, marketCode, { client: db });
    if (prod) return prod;
  } catch {
    // Database unconfigured / offline on host storage
  }
  const { getStandalonePdpProduct } = await import("@/lib/storage/standalone-catalog");
  return getStandalonePdpProduct(slug, marketCode);
}

export async function listTopProductSlugs(take = 50) {
  try {
    const products = await db.product.findMany({
      where: {
        deletedAt: null,
        status: "active",
        publishedAt: { lte: new Date() },
      },
      select: { slug: true },
      orderBy: { rank: "asc" },
      take,
    });
    if (products && products.length > 0) return products.map((p) => p.slug);
  } catch {
    // Database unconfigured / offline on host storage
  }
  const { getStandaloneTopProductSlugs } = await import("@/lib/storage/standalone-catalog");
  return getStandaloneTopProductSlugs(take);
}

export async function getCategoryFilterOptions() {
  try {
    const stones = await db.stone.findMany({
      where: { deletedAt: null, isPublished: true },
      select: { id: true, name: true, slug: true },
      orderBy: { rank: "asc" },
    });
    const materials = await db.material.findMany({
      where: { deletedAt: null, isPublished: true },
      select: { id: true, name: true, slug: true },
      orderBy: { rank: "asc" },
    });
    if (stones.length > 0) return { stones, materials };
  } catch {
    // Database unconfigured / offline on host storage
  }
  const { STANDALONE_STONES } = await import("@/lib/storage/standalone-catalog");
  return {
    stones: STANDALONE_STONES.map((s) => ({ id: s.id, name: s.name, slug: s.slug })),
    materials: [
      { id: "mat-14k-yellow", name: "14K Yellow Gold", slug: "14k-yellow-gold" },
      { id: "mat-14k-white", name: "14K White Gold", slug: "14k-white-gold" },
      { id: "mat-14k-rose", name: "14K Rose Gold", slug: "14k-rose-gold" },
    ],
  };
}

export async function getCuratedFacetForCategoryAndStone(categoryId: string, stoneId: string) {
  try {
    return await db.curatedFacet.findFirst({
      where: {
        categoryId,
        stoneId,
        isActive: true,
      },
      select: { slug: true },
    });
  } catch {
    return null;
  }
}

export async function listStorefrontStoneProducts(
  stoneId: string,
  marketCode: string,
  options: {
    categoryId?: string;
    filters?: CatalogFilters;
    sort?: string;
    limit?: number;
    offset?: number;
  },
) {
  try {
    const res = await listStoneProducts(stoneId, marketCode, options, { client: db });
    if (res && res.products.length > 0) return res;
  } catch {
    // Database unconfigured / offline on host storage
  }
  const { getStandaloneStoneProducts } = await import("@/lib/storage/standalone-catalog");
  return getStandaloneStoneProducts(stoneId, marketCode, options);
}

export async function listAdminCatalogProducts(limit = 100) {
  try {
    return await db.product.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        primaryCategory: true,
        variants: {
          include: {
            prices: true,
            inventoryItems: true,
          },
        },
      },
    });
  } catch {
    return [];
  }
}

export async function listStorefrontFeaturedProducts(
  marketCode: string,
  limit = 4,
): Promise<ListProductsResult> {
  try {
    const res = await queryProductList(
      marketCode,
      sql``,
      undefined,
      limit,
      0,
      { client: db },
    );
    if (res && res.products.length > 0) return res;
  } catch {
    // Database unconfigured / offline on host storage
  }
  const { getStandaloneFeaturedProducts } = await import("@/lib/storage/standalone-catalog");
  return getStandaloneFeaturedProducts(marketCode, limit);
}

