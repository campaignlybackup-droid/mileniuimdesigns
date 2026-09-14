import "server-only";
import type {
  StorefrontCard,
  ListProductsResult,
  PdpProduct,
  PdpVariant,
  PdpMediaItem,
} from "@/lib/catalog/products";
import type { StoneRecord, StoneCategoryLink } from "@/lib/stones";
import type { Market } from "@/lib/market";
import { unsafeCurrencyCode, unsafeMarketCode } from "@/types/market";

/**
 * Standalone storage catalogue for local previews and Hostinger hosting storage.
 * Active whenever the remote PostgreSQL database is unconfigured or in offline test mode.
 */

export const STANDALONE_MARKETS: Market[] = [
  {
    code: unsafeMarketCode("US"),
    name: "United States",
    currencyCode: unsafeCurrencyCode("USD"),
    locale: "en-US",
    countryCode: "US",
    timezone: "America/New_York",
    taxMode: "exclusive",
    pricesIncludeTax: false,
    paymentProviderKey: "stripe",
    incoterm: "DAP",
    weightUnit: "g",
    rank: 1,
  },
  {
    code: unsafeMarketCode("IN"),
    name: "India",
    currencyCode: unsafeCurrencyCode("INR"),
    locale: "en-IN",
    countryCode: "IN",
    timezone: "Asia/Kolkata",
    taxMode: "inclusive",
    pricesIncludeTax: true,
    paymentProviderKey: "razorpay",
    incoterm: "DDP",
    weightUnit: "g",
    rank: 2,
  },
];

export const STANDALONE_CATEGORIES = [
  { id: "c0000000-0000-4000-8000-000000000001", slug: "rings", name: "Rings", rank: 1 },
  { id: "c0000000-0000-4000-8000-000000000002", slug: "chains", name: "Chains", rank: 2 },
  { id: "c0000000-0000-4000-8000-000000000003", slug: "pendants", name: "Pendants", rank: 3 },
  { id: "c0000000-0000-4000-8000-000000000004", slug: "bracelets", name: "Bracelets", rank: 4 },
  { id: "c0000000-0000-4000-8000-000000000005", slug: "earrings", name: "Earrings", rank: 5 },
  { id: "c0000000-0000-4000-8000-000000000006", slug: "closeouts", name: "Close Outs", rank: 6 },
  { id: "c0000000-0000-4000-8000-000000000007", slug: "one-of-a-kind", name: "One of a Kind", rank: 7 },
  { id: "c0000000-0000-4000-8000-000000000008", slug: "14k-gold", name: "14K Gold", rank: 8 },
  { id: "c0000000-0000-4000-8000-000000000009", slug: "lab-grown-diamonds", name: "Lab Grown Diamonds", rank: 9 },
] as const;

export const STANDALONE_STONES: StoneRecord[] = [
  {
    id: "a0000000-0000-4000-8000-000000000001",
    slug: "moonstone",
    name: "Moonstone",
    shortDescription: "Luminous adularescence evoking celestial serenity and ethereal light.",
    descriptionJson: null,
    heroMediaId: null,
    heroPublicId: null,
    swatchMediaId: null,
    colourHex: "#E2E8F0",
    hardnessMohs: "6.0 - 6.5",
    isLabGrown: false,
    rank: 1,
  },
  {
    id: "a0000000-0000-4000-8000-000000000002",
    slug: "amethyst",
    name: "Amethyst",
    shortDescription: "Royal purple crystalline elegance embodying clarity, intuition, and sovereign poise.",
    descriptionJson: null,
    heroMediaId: null,
    heroPublicId: null,
    swatchMediaId: null,
    colourHex: "#7C3AED",
    hardnessMohs: "7.0",
    isLabGrown: false,
    rank: 2,
  },
  {
    id: "a0000000-0000-4000-8000-000000000003",
    slug: "labradorite",
    name: "Labradorite",
    shortDescription: "Spectacular iridescent play-of-colour reflecting mystical northern auroras.",
    descriptionJson: null,
    heroMediaId: null,
    heroPublicId: null,
    swatchMediaId: null,
    colourHex: "#0D9488",
    hardnessMohs: "6.0 - 6.5",
    isLabGrown: false,
    rank: 3,
  },
  {
    id: "a0000000-0000-4000-8000-000000000004",
    slug: "blue-topaz",
    name: "Blue Topaz",
    shortDescription: "Vibrant azure clarity reminiscent of tranquil Mediterranean waters.",
    descriptionJson: null,
    heroMediaId: null,
    heroPublicId: null,
    swatchMediaId: null,
    colourHex: "#0284C7",
    hardnessMohs: "8.0",
    isLabGrown: false,
    rank: 4,
  },
  {
    id: "a0000000-0000-4000-8000-000000000005",
    slug: "larimar",
    name: "Larimar",
    shortDescription: "Rare Caribbean sea-blue gemstone with swirling volcanic ocean hues.",
    descriptionJson: null,
    heroMediaId: null,
    heroPublicId: null,
    swatchMediaId: null,
    colourHex: "#38BDF8",
    hardnessMohs: "4.5 - 5.0",
    isLabGrown: false,
    rank: 5,
  },
  {
    id: "a0000000-0000-4000-8000-000000000006",
    slug: "garnet",
    name: "Garnet",
    shortDescription: "Deep crimson fire radiating timeless passion and enduring strength.",
    descriptionJson: null,
    heroMediaId: null,
    heroPublicId: null,
    swatchMediaId: null,
    colourHex: "#991B1B",
    hardnessMohs: "6.5 - 7.5",
    isLabGrown: false,
    rank: 6,
  },
  {
    id: "a0000000-0000-4000-8000-000000000007",
    slug: "pearl",
    name: "Pearl",
    shortDescription: "Classic organic lustre born of pristine waters, capturing understated luxury.",
    descriptionJson: null,
    heroMediaId: null,
    heroPublicId: null,
    swatchMediaId: null,
    colourHex: "#F8FAFC",
    hardnessMohs: "2.5 - 4.5",
    isLabGrown: false,
    rank: 7,
  },
];

type StandaloneProductDefinition = {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  categorySlug: string;
  stoneSlug?: string;
  materialName: string;
  isOneOfAKind?: boolean;
  priceUsdMinor: bigint;
  priceInrMinor: bigint;
  compareAtUsdMinor?: bigint | null;
  compareAtInrMinor?: bigint | null;
  primaryImage: string;
  alternateImage: string;
  description: string;
};

const RAW_PRODUCTS: StandaloneProductDefinition[] = [
  {
    id: "d0000000-0000-4000-8000-000000000001",
    slug: "sovereign-oval-moonstone-ring",
    title: "The Sovereign Oval Moonstone Ring",
    subtitle: "14K Solid Gold · Hand-faceted Rainbow Moonstone",
    categorySlug: "rings",
    stoneSlug: "moonstone",
    materialName: "14K Yellow Gold",
    priceUsdMinor: 145000n,
    priceInrMinor: 12500000n,
    primaryImage: "/images/products/rings-1.jpg",
    alternateImage: "/images/products/rings-2.jpg",
    description: "An extraordinary oval cabochon rainbow moonstone nestled in a bezel of recycled 14K solid yellow gold. Handcrafted by master artisans to capture celestial blue iridescence.",
  },
  {
    id: "d0000000-0000-4000-8000-000000000002",
    slug: "celestial-royal-amethyst-pendant",
    title: "Celestial Royal Amethyst Pendant",
    subtitle: "Handcrafted 14K Gold · Deep Purple Cushion Amethyst",
    categorySlug: "pendants",
    stoneSlug: "amethyst",
    materialName: "14K Yellow Gold",
    priceUsdMinor: 128000n,
    priceInrMinor: 10800000n,
    primaryImage: "/images/products/pendants-1.jpg",
    alternateImage: "/images/products/pendants-2.jpg",
    description: "Deep royal purple amethyst faceted with an antique cushion cut, suspended gracefully from an architectural 14K gold bail.",
  },
  {
    id: "d0000000-0000-4000-8000-000000000003",
    slug: "heirloom-byzantine-gold-chain",
    title: "Heirloom Byzantine Gold Chain",
    subtitle: "Solid 14K Gold · Hand-woven Heavy Gauge Links",
    categorySlug: "chains",
    materialName: "14K Yellow Gold",
    priceUsdMinor: 285000n,
    priceInrMinor: 24500000n,
    primaryImage: "/images/products/chains-1.jpg",
    alternateImage: "/images/products/chains-2.jpg",
    description: "Woven entirely by hand link by link in our heritage atelier. A weighty, silky drape of solid 14K gold featuring a bespoke integrated clasp.",
  },
  {
    id: "d0000000-0000-4000-8000-000000000004",
    slug: "aurora-borealis-labradorite-cuff",
    title: "Aurora Borealis Labradorite Cuff",
    subtitle: "Hand-forged Gold · Iridescent Spectral Schiller",
    categorySlug: "bracelets",
    stoneSlug: "labradorite",
    materialName: "14K Yellow Gold",
    priceUsdMinor: 192000n,
    priceInrMinor: 16500000n,
    primaryImage: "/images/products/bracelets-1.jpg",
    alternateImage: "/images/products/bracelets-2.jpg",
    description: "An evocative open cuff holding twin freeform labradorites that flash with vivid electric peacock blues and emerald greens under evening light.",
  },
  {
    id: "d0000000-0000-4000-8000-000000000005",
    slug: "lumina-pave-diamond-stud-earrings",
    title: "Lumina Pavé Diamond Stud Earrings",
    subtitle: "Lab Grown Diamonds · 14K White Gold Atelier Setting",
    categorySlug: "earrings",
    materialName: "14K White Gold",
    priceUsdMinor: 98000n,
    priceInrMinor: 8200000n,
    primaryImage: "/images/products/earrings-1.jpg",
    alternateImage: "/images/products/earrings-2.jpg",
    description: "Brilliant round ideal-cut lab-grown diamonds set with precision four-prong collets in high-polish 14K white gold. Unmatched fiery scintillation.",
  },
  {
    id: "d0000000-0000-4000-8000-000000000006",
    slug: "solstice-azure-blue-topaz-signet",
    title: "Solstice Azure Blue Topaz Signet",
    subtitle: "Faceted Ocean Topaz · Hand-engraved Gallery",
    categorySlug: "rings",
    stoneSlug: "blue-topaz",
    materialName: "14K Yellow Gold",
    priceUsdMinor: 165000n,
    priceInrMinor: 14200000n,
    primaryImage: "/images/products/rings-2.jpg",
    alternateImage: "/images/products/rings-1.jpg",
    description: "A commanding modern signet ring crowning an azure Swiss blue topaz cut to mirror the midday Mediterranean sun. Finished with a subtle brushed exterior.",
  },
  {
    id: "d0000000-0000-4000-8000-000000000007",
    slug: "sovereign-one-of-a-kind-larimar-statement",
    title: "Sovereign One of a Kind Larimar Statement",
    subtitle: "Unique Volcanic Caribbean Gem · 18K Atelier Mount",
    categorySlug: "one-of-a-kind",
    stoneSlug: "larimar",
    materialName: "14K Yellow Gold",
    isOneOfAKind: true,
    priceUsdMinor: 340000n,
    priceInrMinor: 29000000n,
    primaryImage: "/images/products/one-of-a-kind-1.jpg",
    alternateImage: "/images/products/one-of-a-kind-2.jpg",
    description: "A singular piece created around an unrepeatable gemological specimen of Dominican larimar with swirling sea-foam inclusions. Completely unique.",
  },
  {
    id: "d0000000-0000-4000-8000-000000000008",
    slug: "garnet-fire-drop-earrings",
    title: "Garnet Fire Drop Earrings",
    subtitle: "Deep Crimson Faceted Garnet · 14K Yellow Gold",
    categorySlug: "closeouts",
    stoneSlug: "garnet",
    materialName: "14K Yellow Gold",
    priceUsdMinor: 72000n,
    priceInrMinor: 6000000n,
    compareAtUsdMinor: 95000n,
    compareAtInrMinor: 7800000n,
    primaryImage: "/images/products/closeouts-1.jpg",
    alternateImage: "/images/products/closeouts-2.jpg",
    description: "Deep crimson almandine garnets suspended from articulated 14K gold shepherd hooks. Catching light with every movement with rich garnet embers.",
  },
  {
    id: "d0000000-0000-4000-8000-000000000009",
    slug: "baroque-pearl-luminary-necklace",
    title: "Baroque Pearl Luminary Necklace",
    subtitle: "Lustrous Natural Freshwater Pearl · Hand-knotted Silk & Gold",
    categorySlug: "pendants",
    stoneSlug: "pearl",
    materialName: "14K Yellow Gold",
    priceUsdMinor: 115000n,
    priceInrMinor: 9500000n,
    primaryImage: "/images/products/pendants-2.jpg",
    alternateImage: "/images/products/pendants-1.jpg",
    description: "Organic sculptural baroque freshwater pearl featuring warm orient overtones, framed by a tactile hand-textured 14K solid gold cup.",
  },
  {
    id: "d0000000-0000-4000-8000-000000000010",
    slug: "atelier-14k-solid-gold-bangle",
    title: "Atelier 14K Solid Gold Bangle",
    subtitle: "Satin Brushed Finish · Heavy 14K Yellow Gold Core",
    categorySlug: "14k-gold",
    materialName: "14K Yellow Gold",
    priceUsdMinor: 210000n,
    priceInrMinor: 17800000n,
    primaryImage: "/images/products/14k-gold-1.jpg",
    alternateImage: "/images/products/14k-gold-2.jpg",
    description: "Purity of silhouette meets substantial gold weight. Seamless oval profile designed to comfortably rest against the wrist with an invisible safety hinge.",
  },
  {
    id: "d0000000-0000-4000-8000-000000000011",
    slug: "eternity-lab-grown-diamond-band",
    title: "Eternity Lab Grown Diamond Band",
    subtitle: "1.50 Total Carat Weight · VS1 Clarity · 14K White Gold",
    categorySlug: "lab-grown-diamonds",
    materialName: "14K White Gold",
    priceUsdMinor: 245000n,
    priceInrMinor: 21000000n,
    primaryImage: "/images/products/lab-grown-diamonds-1.jpg",
    alternateImage: "/images/products/lab-grown-diamonds-2.jpg",
    description: "Continuous sparkle engineered with low-profile shared-prong settings. Each lab-grown diamond is hand-matched for colorless clarity and brilliance.",
  },
];

function buildStorefrontCard(
  p: StandaloneProductDefinition,
  marketCode: string,
): StorefrontCard {
  const isIndia = marketCode.toUpperCase() === "IN";
  const currencyCode = isIndia ? unsafeCurrencyCode("INR") : unsafeCurrencyCode("USD");
  const listMinor = isIndia ? p.priceInrMinor : p.priceUsdMinor;

  const category = STANDALONE_CATEGORIES.find((c) => c.slug === p.categorySlug);
  const stone = p.stoneSlug ? STANDALONE_STONES.find((s) => s.slug === p.stoneSlug) : null;

  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    subtitle: p.subtitle,
    primaryCategoryId: category?.id ?? null,
    isOneOfAKind: p.isOneOfAKind ?? false,
    soldAt: null,
    primaryImage: {
      publicId: p.primaryImage,
      altText: p.title,
    },
    alternateImage: {
      publicId: p.alternateImage,
      altText: `${p.title} alternate view`,
    },
    stonesText: stone?.name ?? null,
    materialsText: p.materialName,
    priceRange: {
      currencyCode,
      minListMinor: listMinor,
      maxListMinor: listMinor,
      minSaleMinor: null,
      pricedVariantCount: 1,
      totalVariantCount: 1,
    },
  };
}

export function getStandaloneFeaturedProducts(
  marketCode: string,
  limit = 4,
): ListProductsResult {
  const products = RAW_PRODUCTS.slice(0, limit).map((p) => buildStorefrontCard(p, marketCode));
  return { products, totalCount: products.length };
}

export function getStandaloneCategoryProducts(
  categorySlugOrId: string,
  marketCode: string,
  options?: { limit?: number; offset?: number; sort?: string },
): ListProductsResult {
  const norm = categorySlugOrId.toLowerCase().replace(/^cat-/, "");
  const matching = RAW_PRODUCTS.filter((p) => p.categorySlug.toLowerCase() === norm);
  const pool = matching.length > 0 ? matching : RAW_PRODUCTS;

  const limit = options?.limit ?? 12;
  const offset = options?.offset ?? 0;
  const sliced = pool.slice(offset, offset + limit);

  const products = sliced.map((p) => buildStorefrontCard(p, marketCode));
  return { products, totalCount: pool.length };
}

export function getStandaloneStoneProducts(
  stoneSlugOrId: string,
  marketCode: string,
): ListProductsResult {
  const norm = stoneSlugOrId.toLowerCase().replace(/^stone-/, "");
  const matching = RAW_PRODUCTS.filter((p) => p.stoneSlug?.toLowerCase() === norm);
  const pool = matching.length > 0 ? matching : RAW_PRODUCTS;

  const products = pool.map((p) => buildStorefrontCard(p, marketCode));
  return { products, totalCount: pool.length };
}

export function getStandalonePdpProduct(
  slug: string,
  marketCode: string,
): PdpProduct | null {
  const p = RAW_PRODUCTS.find((item) => item.slug.toLowerCase() === slug.toLowerCase()) ?? RAW_PRODUCTS[0];
  if (!p) return null;

  const isIndia = marketCode.toUpperCase() === "IN";
  const currencyCode = isIndia ? unsafeCurrencyCode("INR") : unsafeCurrencyCode("USD");
  const listMinor = isIndia ? p.priceInrMinor : p.priceUsdMinor;
  const compareAtMinor = isIndia ? (p.compareAtInrMinor ?? null) : (p.compareAtUsdMinor ?? null);

  const category = STANDALONE_CATEGORIES.find((c) => c.slug === p.categorySlug);
  const stone = p.stoneSlug ? STANDALONE_STONES.find((s) => s.slug === p.stoneSlug) : null;

  const variantId = `var-${p.id}-default`;

  const variant: PdpVariant = {
    id: variantId,
    sku: `MD-${p.slug.toUpperCase().slice(0, 8)}`,
    title: "Standard",
    position: 1,
    isDefault: true,
    inventoryPolicy: "deny",
    ringSize: p.categorySlug === "rings" ? "7" : null,
    lengthMm: p.categorySlug === "chains" ? "450" : null,
    grossWeightGrams: "4.5",
    optionValues: [],
    price: {
      currencyCode,
      listMinor,
      saleMinor: listMinor,
      compareAtMinor,
    },
  };

  const media: PdpMediaItem[] = [
    {
      id: `media-${p.id}-1`,
      mediaId: `m-${p.id}-1`,
      publicId: p.primaryImage,
      format: "jpg",
      altText: p.title,
      width: 800,
      height: 1000,
      role: "hero",
      position: 1,
      variantId: null,
    },
    {
      id: `media-${p.id}-2`,
      mediaId: `m-${p.id}-2`,
      publicId: p.alternateImage,
      format: "jpg",
      altText: `${p.title} detail`,
      width: 800,
      height: 1000,
      role: "gallery",
      position: 2,
      variantId: null,
    },
  ];

  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    subtitle: p.subtitle,
    descriptionJson: {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: p.description }] }],
    },
    careInstructionsJson: {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Store in the provided suede pouch. Clean gently using warm soapy water and a soft microfibre cloth." }] }],
    },
    primaryCategoryId: category?.id ?? null,
    primaryCategoryName: category?.name ?? null,
    primaryCategorySlug: category?.slug ?? null,
    isOneOfAKind: p.isOneOfAKind ?? false,
    isMadeToOrder: false,
    leadTimeDays: 3,
    soldAt: null,
    defaultVariantId: variantId,
    unavailableReason: null,
    variants: [variant],
    media,
    stones: stone
      ? [
          {
            stoneId: stone.id,
            name: stone.name,
            slug: stone.slug,
            isPrimary: true,
            caratWeight: "2.10",
            cut: "Faceted Cushion",
            stoneCount: 1,
          },
        ]
      : [],
    materials: [
      {
        materialId: `mat-${p.id}`,
        name: p.materialName,
        slug: p.materialName.toLowerCase().replace(/\s+/g, "-"),
        isPrimary: true,
      },
    ],
    attributes: [
      { name: "Craftsmanship", value: "Atelier Handcrafted" },
      { name: "Gold Purity", value: "14 Karat (585/1000)" },
    ],
    options: [],
  };
}

export function getStandaloneTopProductSlugs(take = 50): string[] {
  return RAW_PRODUCTS.slice(0, take).map((p) => p.slug);
}

export function getStandaloneStoneCategoryLinks(
  stoneIdOrSlug: string,
): StoneCategoryLink[] {
  const norm = stoneIdOrSlug.toLowerCase().replace(/^stone-/, "");
  const matching = RAW_PRODUCTS.filter((p) => p.stoneSlug?.toLowerCase() === norm);

  const categories = new Set(matching.map((p) => p.categorySlug));
  return STANDALONE_CATEGORIES.filter((c) => categories.has(c.slug)).map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    productCount: matching.filter((m) => m.categorySlug === c.slug).length,
  }));
}
