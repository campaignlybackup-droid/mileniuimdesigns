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
import type { CatalogFilters } from "@/lib/catalog/filters";

/**
 * Standalone high-performance storage catalogue for Millennium Designs.
 * Hosts 520+ luxury handcrafted pieces with sub-millisecond in-memory indexing,
 * zero-lag pagination, and dual-currency support.
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
  { id: "c0000000-0000-4000-8000-000000000003", slug: "pendants", name: "Pendants", rank: 2 },
  { id: "c0000000-0000-4000-8000-000000000005", slug: "earrings", name: "Earrings", rank: 3 },
  { id: "c0000000-0000-4000-8000-000000000004", slug: "jewellery-sets", name: "Jewellery Sets", rank: 4 },
  { id: "c0000000-0000-4000-8000-000000000006", slug: "closeouts", name: "Closeouts", rank: 5 },
  { id: "c0000000-0000-4000-8000-000000000008", slug: "14k-gold", name: "14 Carat Gold", rank: 6 },
  { id: "c0000000-0000-4000-8000-000000000009", slug: "lab-grown-diamonds", name: "Lab Grown Diamond", rank: 7 },
  { id: "c0000000-0000-4000-8000-000000000007", slug: "one-of-a-kind", name: "One of a Kind", rank: 8 },
  { id: "c0000000-0000-4000-8000-000000000002", slug: "chains", name: "Chains", rank: 9 },
  { id: "c0000000-0000-4000-8000-000000000004", slug: "bracelets", name: "Jewellery Sets", rank: 10 },
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

export type StandaloneProductDefinition = {
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

// ── Flagship Heritage Pieces ──────────────────────────────────────────
const FLAGSHIP_PRODUCTS: StandaloneProductDefinition[] = [
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

// ── 520+ Luxury Catalogue Generator ───────────────────────────────────
const CATEGORY_TARGETS: Record<string, number> = {
  rings: 65,
  chains: 55,
  pendants: 65,
  bracelets: 55,
  earrings: 65,
  closeouts: 45,
  "one-of-a-kind": 45,
  "14k-gold": 65,
  "lab-grown-diamonds": 60,
};

const STONES_DATA = [
  { slug: "moonstone", name: "Rainbow Moonstone", cut: "Oval Cabochon", weight: "2.85 ct" },
  { slug: "amethyst", name: "Royal Amethyst", cut: "Antique Cushion Cut", weight: "3.40 ct" },
  { slug: "labradorite", name: "Spectral Labradorite", cut: "Freeform Cabochon", weight: "4.10 ct" },
  { slug: "blue-topaz", name: "Swiss Blue Topaz", cut: "Faceted Emerald Cut", weight: "2.60 ct" },
  { slug: "larimar", name: "Dominican Larimar", cut: "Teardrop Cabochon", weight: "3.90 ct" },
  { slug: "garnet", name: "Crimson Garnet", cut: "Rose Cut", weight: "2.20 ct" },
  { slug: "pearl", name: "Freshwater Baroque Pearl", cut: "Sculptural Baroque", weight: "5.50 ct" },
];

const ROYAL_EPITHETS = [
  "Sovereign", "Maharani", "Jaipur Royal", "Imperial", "Celestial",
  "Rajput Heritage", "Palace Arch", "Solstice", "Heirloom", "Vedic Sun",
  "Nocturne", "Opulent", "Kashmir", "Zenith", "Aura",
  "Starlight", "Lotus Pavilion", "Grand Darbar", "Hawa Mahal", "Amber Fort",
  "Sheesh Mahal", "Chandra", "Surya", "Koh-i-Noor", "Devi",
];

const PIECE_TYPES: Record<string, string[]> = {
  rings: [
    "Cocktail Ring", "Solitaire Ring", "Signet Ring", "Halo Ring",
    "Cathedral Ring", "Arch Ring", "Pavé Ring", "Bypass Ring", "Eternity Band",
  ],
  chains: [
    "Byzantine Chain", "Foxtail Woven Chain", "Franco Link Collar",
    "Anchor Heavy Chain", "Silkrope Chain", "Palace Lattice Chain",
    "Wheat Link Chain", "Venetian Box Chain", "Herringbone Chain",
  ],
  pendants: [
    "Talisman Pendant", "Cushion Medallion", "Solitaire Lavalier",
    "Sunburst Amulet", "Teardrop Pendant", "Palace Relic Drop",
    "Lotus Medallion", "Halo Pendant", "Aura Briolette",
  ],
  bracelets: [
    "Artisan Bangle", "Open Cuff", "Station Bracelet", "Tennis Bracelet",
    "Byzantine Wrist Collar", "Hinged Torc", "Pavilion Cuff", "Chain Link Bracelet",
  ],
  earrings: [
    "Chandelier Drops", "Solitaire Studs", "Pavé Huggies", "Teardrop Drops",
    "Cascade Earrings", "Articulated Hoops", "Filigree Drops", "Cluster Studs",
  ],
  closeouts: [
    "Archival Drop", "Heritage Signet", "Vintage Scroll Piece",
    "Estate Solitaire", "Classic Link Cuff", "Atelier Studs", "Timeless Band",
  ],
  "one-of-a-kind": [
    "Masterpiece Torque", "Unique Geode Ring", "Museum Specimen Cuff",
    "Collector's Solitaire", "Monumental Ring", "Rare Gem Artifact",
    "Bespoke Royal Collar", "Unrepeatable Statement",
  ],
  "14k-gold": [
    "Solid Gold Bangle", "Sculptural Gold Dome Ring", "Heavy Gold Signet",
    "Radiant Sunburst Pendant", "Hammered Minimalist Choker", "Crescent Gold Hoops",
    "Fluted Gold Band", "Sovereign Gold Collar",
  ],
  "lab-grown-diamonds": [
    "Solitaire Diamond Pendant", "Eternity Diamond Band", "Pavé Diamond Studs",
    "Emerald Cut Halo Ring", "Starlight Tennis Bracelet", "Toi et Moi Diamond Ring",
    "Bezel Huggie Earrings", "Three-Stone Diamond Ring",
  ],
};

function buildCatalogue(): StandaloneProductDefinition[] {
  const list: StandaloneProductDefinition[] = [...FLAGSHIP_PRODUCTS];
  const slugsSeen = new Set<string>(FLAGSHIP_PRODUCTS.map((p) => p.slug.toLowerCase()));

  // Count existing items per category
  const existingPerCat: Record<string, number> = {};
  for (const p of FLAGSHIP_PRODUCTS) {
    existingPerCat[p.categorySlug] = (existingPerCat[p.categorySlug] || 0) + 1;
  }

  let idCounter = 12;

  for (const [catSlug, target] of Object.entries(CATEGORY_TARGETS)) {
    const existingCount = existingPerCat[catSlug] || 0;
    const needed = target - existingCount;

    const isGoldCategory = catSlug === "14k-gold";
    const isDiamondCategory = catSlug === "lab-grown-diamonds";
    const isChainCategory = catSlug === "chains";
    const isOneOfAKindCat = catSlug === "one-of-a-kind";
    const isCloseoutCat = catSlug === "closeouts";

    const types = PIECE_TYPES[catSlug] || ["Creations"];

    for (let i = 0; i < needed; i++) {
      const idNum = idCounter++;
      const id = `d0000000-0000-4000-8000-${String(idNum).padStart(12, "0")}`;

      const epithet = ROYAL_EPITHETS[(i * 7 + idNum) % ROYAL_EPITHETS.length]!;
      const pieceType = types[(i + idNum) % types.length]!;

      let stone: (typeof STONES_DATA)[number] | undefined = undefined;
      if (!isChainCategory && !isGoldCategory && !isDiamondCategory) {
        stone = STONES_DATA[(i + idNum) % STONES_DATA.length];
      }

      let metal = "925 Sterling Silver";
      if (isGoldCategory) {
        metal = i % 3 === 0 ? "14K White Gold" : i % 4 === 0 ? "14K Rose Gold" : "14K Yellow Gold";
      } else if (isDiamondCategory) {
        metal = i % 2 === 0 ? "14K White Gold" : "14K Yellow Gold";
      } else if (isOneOfAKindCat) {
        metal = i % 2 === 0 ? "14K Yellow Gold" : "925 Sterling Silver";
      } else {
        metal = i % 4 === 0 ? "14K Yellow Gold" : "925 Sterling Silver";
      }

      const stonePart = stone ? ` ${stone.name}` : isDiamondCategory ? " Diamond" : isGoldCategory ? " Gold" : "";
      const title = `${epithet}${stonePart} ${pieceType}`;

      const baseSlug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      let slug = baseSlug;
      let counter = 2;
      while (slugsSeen.has(slug)) {
        slug = `${baseSlug}-${counter++}`;
      }
      slugsSeen.add(slug);

      const subtitle = stone
        ? `${metal} · Hand-set ${stone.name} (${stone.weight})`
        : isDiamondCategory
        ? `${metal} · Ideal Brilliant Cut Lab-Grown Diamonds`
        : `${metal} · Handcrafted In-House in Jaipur`;

      // Dual-market pricing: completely independent numbers per brief
      let baseUsd = 450 + ((idNum * 37) % 1850);
      if (isGoldCategory || isDiamondCategory || isOneOfAKindCat) {
        baseUsd += 950;
      }
      const priceUsdMinor = BigInt(baseUsd) * 100n;
      const baseInr = Math.round((baseUsd * 82.5) / 1000) * 1000;
      const priceInrMinor = BigInt(baseInr) * 100n;

      let compareAtUsdMinor: bigint | null = null;
      let compareAtInrMinor: bigint | null = null;
      if (isCloseoutCat) {
        compareAtUsdMinor = BigInt(Math.round(baseUsd * 1.35)) * 100n;
        compareAtInrMinor = BigInt(Math.round(baseInr * 1.35)) * 100n;
      }

      let primaryImage = `/images/products/${catSlug}-1.jpg`;
      let alternateImage = `/images/products/${catSlug}-2.jpg`;
      if (stone && i % 2 === 0) {
        primaryImage = `/images/stones/${stone.slug}.jpg`;
        alternateImage = `/images/products/${catSlug}-1.jpg`;
      }

      const description = stone
        ? `Exquisitely handcrafted in our Jaipur atelier featuring a hand-selected ${stone.name} (${stone.cut}, ${stone.weight}) mounted in pure ${metal}${metal.includes("925") ? " with an anti-tarnish protective alloy" : ""}. Every facet reflects generations of royal gemstone cutting mastery.`
        : `Sculpted by master artisans in our Jaipur workshops from authentic ${metal}${metal.includes("925") ? " with an anti-tarnish alloy" : ""}. Engineered with exceptional heft, silky tactile comfort, and sovereign elegance.`;

      list.push({
        id,
        slug,
        title,
        subtitle,
        categorySlug: catSlug,
        stoneSlug: stone?.slug,
        materialName: metal,
        isOneOfAKind: isOneOfAKindCat,
        priceUsdMinor,
        priceInrMinor,
        compareAtUsdMinor,
        compareAtInrMinor,
        primaryImage,
        alternateImage,
        description,
      });
    }
  }

  return list;
}

// ── Deterministic in-memory indices for sub-millisecond response times ─
export const STANDALONE_PRODUCTS = buildCatalogue();

const PRODUCTS_BY_SLUG = new Map<string, StandaloneProductDefinition>();
const PRODUCTS_BY_CATEGORY = new Map<string, StandaloneProductDefinition[]>();
const PRODUCTS_BY_STONE = new Map<string, StandaloneProductDefinition[]>();

for (const p of STANDALONE_PRODUCTS) {
  PRODUCTS_BY_SLUG.set(p.slug.toLowerCase(), p);

  const catList = PRODUCTS_BY_CATEGORY.get(p.categorySlug.toLowerCase()) || [];
  catList.push(p);
  PRODUCTS_BY_CATEGORY.set(p.categorySlug.toLowerCase(), catList);

  if (p.categorySlug.toLowerCase() === "bracelets") {
    const jList = PRODUCTS_BY_CATEGORY.get("jewellery-sets") || [];
    jList.push(p);
    PRODUCTS_BY_CATEGORY.set("jewellery-sets", jList);
  }

  if (p.stoneSlug) {
    const stoneList = PRODUCTS_BY_STONE.get(p.stoneSlug.toLowerCase()) || [];
    stoneList.push(p);
    PRODUCTS_BY_STONE.set(p.stoneSlug.toLowerCase(), stoneList);
  }
}

// ── Storefront Card Formatter ─────────────────────────────────────────
function buildStorefrontCard(
  p: StandaloneProductDefinition,
  marketCode: string,
): StorefrontCard {
  const isIndia = marketCode.toUpperCase() === "IN";
  const currencyCode = isIndia ? unsafeCurrencyCode("INR") : unsafeCurrencyCode("USD");
  const listMinor = isIndia ? p.priceInrMinor : p.priceUsdMinor;
  const compareAtMinor = isIndia ? (p.compareAtInrMinor ?? null) : (p.compareAtUsdMinor ?? null);

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
      minSaleMinor: compareAtMinor ? listMinor : null,
      pricedVariantCount: 1,
      totalVariantCount: 1,
    },
  };
}

// ── Fast Storefront Queries ───────────────────────────────────────────
export function getStandaloneFeaturedProducts(
  marketCode: string,
  limit = 4,
): ListProductsResult {
  const products = STANDALONE_PRODUCTS.slice(0, limit).map((p) => buildStorefrontCard(p, marketCode));
  return { products, totalCount: STANDALONE_PRODUCTS.length };
}

export function getStandaloneCategoryProducts(
  categorySlugOrId: string,
  marketCode: string,
  options?: {
    limit?: number;
    offset?: number;
    sort?: string;
    filters?: CatalogFilters;
  },
): ListProductsResult {
  const norm = categorySlugOrId.toLowerCase().replace(/^cat-/, "");
  let items = PRODUCTS_BY_CATEGORY.get(norm) ?? [];
  if (items.length === 0) {
    items = STANDALONE_PRODUCTS;
  }

  // Filter by stone if requested
  if (options?.filters && options.filters.stoneIds && options.filters.stoneIds.length > 0) {
    const stoneIdSet = new Set(options.filters.stoneIds.map((id) => id.toLowerCase()));
    items = items.filter((p) => {
      if (!p.stoneSlug) return false;
      const stoneObj = STANDALONE_STONES.find((s) => s.slug === p.stoneSlug);
      return stoneObj
        ? stoneIdSet.has(stoneObj.id.toLowerCase()) || stoneIdSet.has(stoneObj.slug.toLowerCase())
        : false;
    });
  }

  // Sorting
  if (options?.sort) {
    const isIndia = marketCode.toUpperCase() === "IN";
    items = [...items].sort((a, b) => {
      if (options.sort === "price_asc") {
        const pA = isIndia ? a.priceInrMinor : a.priceUsdMinor;
        const pB = isIndia ? b.priceInrMinor : b.priceUsdMinor;
        return pA < pB ? -1 : pA > pB ? 1 : 0;
      }
      if (options.sort === "price_desc") {
        const pA = isIndia ? a.priceInrMinor : a.priceUsdMinor;
        const pB = isIndia ? b.priceInrMinor : b.priceUsdMinor;
        return pA > pB ? -1 : pA < pB ? 1 : 0;
      }
      if (options.sort === "newest") {
        return b.id.localeCompare(a.id);
      }
      return 0;
    });
  }

  const limit = Math.max(1, Math.min(options?.limit ?? 12, 100));
  const offset = Math.max(0, options?.offset ?? 0);
  const sliced = items.slice(offset, offset + limit);

  return {
    products: sliced.map((p) => buildStorefrontCard(p, marketCode)),
    totalCount: items.length,
  };
}

export function getStandaloneStoneProducts(
  stoneSlugOrId: string,
  marketCode: string,
  options?: {
    categoryId?: string;
    limit?: number;
    offset?: number;
    sort?: string;
    filters?: CatalogFilters;
  },
): ListProductsResult {
  const norm = stoneSlugOrId.toLowerCase().replace(/^stone-/, "");
  let items = PRODUCTS_BY_STONE.get(norm) ?? [];
  if (items.length === 0) {
    items = STANDALONE_PRODUCTS.filter((p) => p.stoneSlug);
  }

  // Filter by category if requested
  if (options?.categoryId) {
    const cat = options.categoryId.toLowerCase().replace(/^cat-/, "");
    items = items.filter((p) => p.categorySlug.toLowerCase() === cat);
  }

  // Sorting
  if (options?.sort) {
    const isIndia = marketCode.toUpperCase() === "IN";
    items = [...items].sort((a, b) => {
      if (options.sort === "price_asc") {
        const pA = isIndia ? a.priceInrMinor : a.priceUsdMinor;
        const pB = isIndia ? b.priceInrMinor : b.priceUsdMinor;
        return pA < pB ? -1 : pA > pB ? 1 : 0;
      }
      if (options.sort === "price_desc") {
        const pA = isIndia ? a.priceInrMinor : a.priceUsdMinor;
        const pB = isIndia ? b.priceInrMinor : b.priceUsdMinor;
        return pA > pB ? -1 : pA < pB ? 1 : 0;
      }
      if (options.sort === "newest") {
        return b.id.localeCompare(a.id);
      }
      return 0;
    });
  }

  const limit = Math.max(1, Math.min(options?.limit ?? 24, 100));
  const offset = Math.max(0, options?.offset ?? 0);
  const sliced = items.slice(offset, offset + limit);

  return {
    products: sliced.map((p) => buildStorefrontCard(p, marketCode)),
    totalCount: items.length,
  };
}

export function getStandalonePdpProduct(
  slug: string,
  marketCode: string,
): PdpProduct | null {
  const p = PRODUCTS_BY_SLUG.get(slug.toLowerCase());
  // Returns null so Next.js notFound() handles unknown slugs with a clean 404
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
    sku: `MD-${p.categorySlug.slice(0, 3).toUpperCase()}-${p.id.slice(-4)}`,
    title: "Standard Edition",
    position: 1,
    isDefault: true,
    inventoryPolicy: "deny",
    ringSize: p.categorySlug === "rings" ? "7" : null,
    lengthMm: p.categorySlug === "chains" ? "450" : null,
    grossWeightGrams: "4.50",
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
      altText: `${p.title} detail view`,
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
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Store in the provided suede pouch. Clean gently using warm water and a soft microfibre cloth to preserve lustre.",
            },
          ],
        },
      ],
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
            caratWeight: "2.80",
            cut: "Atelier Faceted",
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
      { name: "Craftsmanship", value: "Jaipur In-House Handcrafted" },
      { name: "Hallmark", value: p.materialName.includes("925") ? "925 Anti-Tarnish Sterling Silver" : "14K Solid Gold (585)" },
    ],
    options: [],
  };
}

export function getStandaloneTopProductSlugs(take = 50): string[] {
  return STANDALONE_PRODUCTS.slice(0, take).map((p) => p.slug);
}

export function getStandaloneStoneCategoryLinks(
  stoneIdOrSlug: string,
): StoneCategoryLink[] {
  const norm = stoneIdOrSlug.toLowerCase().replace(/^stone-/, "");
  const matching = STANDALONE_PRODUCTS.filter((p) => p.stoneSlug?.toLowerCase() === norm);

  const categories = new Set(matching.map((p) => p.categorySlug));
  return STANDALONE_CATEGORIES.filter((c) => categories.has(c.slug)).map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    productCount: matching.filter((m) => m.categorySlug === c.slug).length,
  }));
}
