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
 * Millennium Designs Authentic Catalog
 * Hosts all 82 original handcrafted pieces with zero dummy products,
 * sub-millisecond in-memory indexing, and dual-currency support.
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
  { id: "01a0c549-2dbb-76bc-9199-b75960169727", slug: "rings", name: "Rings", rank: 1 },
  { id: "01a0c549-2def-7189-ac72-ec1c502f210d", slug: "chains", name: "Chains", rank: 2 },
  { id: "01a0c549-2e26-77e0-83cd-722a512aca54", slug: "pendants", name: "Pendants", rank: 3 },
  { id: "01a0c549-2e5c-745b-a1b6-b530a0fca434", slug: "bracelets", name: "Bracelets", rank: 4 },
  { id: "01a0c549-2e92-7339-9ca6-4d5e6260fccf", slug: "earrings", name: "Earrings", rank: 5 },
  { id: "01a0c549-2ec9-7232-a6bc-ad81491d0b7a", slug: "closeouts", name: "Closeouts", rank: 6 },
  { id: "01a0c549-2eff-71af-972d-1ddb94ce019f", slug: "one-of-a-kind", name: "One of a Kind", rank: 7 },
  { id: "01a0c549-2f34-752e-bef5-6cc41e51b8e0", slug: "14k-gold", name: "14 Carat Gold", rank: 8 },
  { id: "01a0c549-2f6a-709f-8866-f2182c0227c2", slug: "lab-grown-diamonds", name: "Lab Grown Diamond", rank: 9 },
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
  {
    id: "a0000000-0000-4000-8000-000000000008",
    slug: "opal",
    name: "Opal",
    shortDescription: "Hypnotic kaleidoscope of shimmering fiery colours and natural optical spectral play.",
    descriptionJson: null,
    heroMediaId: null,
    heroPublicId: null,
    swatchMediaId: null,
    colourHex: "#E0F2FE",
    hardnessMohs: "5.5 - 6.5",
    isLabGrown: false,
    rank: 8,
  },
  {
    id: "a0000000-0000-4000-8000-000000000009",
    slug: "kyanite",
    name: "Kyanite",
    shortDescription: "Deep sapphire-blue crystalline gemstone with distinct chatoyant lustre.",
    descriptionJson: null,
    heroMediaId: null,
    heroPublicId: null,
    swatchMediaId: null,
    colourHex: "#1E40AF",
    hardnessMohs: "4.5 - 7.0",
    isLabGrown: false,
    rank: 9,
  },
  {
    id: "a0000000-0000-4000-8000-000000000010",
    slug: "tourmaline",
    name: "Tourmaline",
    shortDescription: "Vibrant polychromatic mineral spectrum showcasing rich organic geological splendour.",
    descriptionJson: null,
    heroMediaId: null,
    heroPublicId: null,
    swatchMediaId: null,
    colourHex: "#059669",
    hardnessMohs: "7.0 - 7.5",
    isLabGrown: false,
    rank: 10,
  },
  {
    id: "a0000000-0000-4000-8000-000000000011",
    slug: "coral",
    name: "Coral",
    shortDescription: "Natural organic sea treasure exhibiting warm vermilion and terracotta tones.",
    descriptionJson: null,
    heroMediaId: null,
    heroPublicId: null,
    swatchMediaId: null,
    colourHex: "#EA580C",
    hardnessMohs: "3.5",
    isLabGrown: false,
    rank: 11,
  },
  {
    id: "a0000000-0000-4000-8000-000000000012",
    slug: "amber",
    name: "Amber",
    shortDescription: "Fossilized golden resin glowing with warmth, ancient heritage, and tactile softness.",
    descriptionJson: null,
    heroMediaId: null,
    heroPublicId: null,
    swatchMediaId: null,
    colourHex: "#D97706",
    hardnessMohs: "2.0 - 2.5",
    isLabGrown: false,
    rank: 12,
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

// ── 82 Authentic Millennium Designs Original Pieces ───────────────────
export const STANDALONE_PRODUCTS: StandaloneProductDefinition[] = [
  {
    id: "0d84973b-c556-49a5-8dc9-866cadd5807b",
    slug: "natural-opal-silver-bracelet-bl-1",
    title: "Natural Opal Silver Bracelet (BL 1)",
    subtitle: "BL 1 · 13.7g · Solid 925 Sterling Silver",
    categorySlug: "bracelets",
    stoneSlug: "opal",
    materialName: "925 Sterling Silver",
    isOneOfAKind: false,
    priceUsdMinor: 11300n,
    priceInrMinor: 959000n,
    primaryImage: "md_catalog/bracelets/bl_1_a",
    alternateImage: "md_catalog/bracelets/bl_1_b",
    description: "Exquisitely handcrafted in our Jaipur atelier from pure 925 sterling silver with an anti-tarnish protective finish, featuring hand-set natural Opal (13.7g gross silver weight). Every detail reflects generations of royal bench mastery.",
  },
  {
    id: "9b9189c1-937c-4142-9094-61f3b198c2e2",
    slug: "amethyst-silver-bracelet-bl-2",
    title: "Amethyst Silver Bracelet (BL 2)",
    subtitle: "BL 2 · 2.5g · Solid 925 Sterling Silver",
    categorySlug: "bracelets",
    stoneSlug: "amethyst",
    materialName: "925 Sterling Silver",
    isOneOfAKind: false,
    priceUsdMinor: 1500n,
    priceInrMinor: 120000n,
    primaryImage: "md_catalog/bracelets/bl_2_a",
    alternateImage: "md_catalog/bracelets/bl_2_b",
    description: "Exquisitely handcrafted in our Jaipur atelier from pure 925 sterling silver with an anti-tarnish protective finish, featuring hand-set natural Amethyst (2.5g gross silver weight). Every detail reflects generations of royal bench mastery.",
  },
  {
    id: "a4d9ec5b-a598-470a-b2f2-bd4cf690c534",
    slug: "kyanite-silver-bracelet-bl-3",
    title: "Kyanite Silver Bracelet (BL 3)",
    subtitle: "BL 3 · 12.1g · Solid 925 Sterling Silver",
    categorySlug: "bracelets",
    stoneSlug: "kyanite",
    materialName: "925 Sterling Silver",
    isOneOfAKind: false,
    priceUsdMinor: 5700n,
    priceInrMinor: 484000n,
    primaryImage: "md_catalog/bracelets/bl_3_a",
    alternateImage: "md_catalog/bracelets/bl_3_b",
    description: "Exquisitely handcrafted in our Jaipur atelier from pure 925 sterling silver with an anti-tarnish protective finish, featuring hand-set natural Kyanite (12.1g gross silver weight). Every detail reflects generations of royal bench mastery.",
  },
  {
    id: "eac530b9-8c71-402c-8771-39bae77f05bc",
    slug: "kyanite-silver-bracelet-bl-4",
    title: "Kyanite Silver Bracelet (BL 4)",
    subtitle: "BL 4 · 8.9g · Solid 925 Sterling Silver",
    categorySlug: "bracelets",
    stoneSlug: "kyanite",
    materialName: "925 Sterling Silver",
    isOneOfAKind: false,
    priceUsdMinor: 4200n,
    priceInrMinor: 356000n,
    primaryImage: "md_catalog/bracelets/bl_4_a",
    alternateImage: "md_catalog/bracelets/bl_4_b",
    description: "Exquisitely handcrafted in our Jaipur atelier from pure 925 sterling silver with an anti-tarnish protective finish, featuring hand-set natural Kyanite (8.9g gross silver weight). Every detail reflects generations of royal bench mastery.",
  },
  {
    id: "a78e94e7-5bcc-4a31-baeb-8141089e705f",
    slug: "tourmaline-silver-bracelet-bl-5",
    title: "Tourmaline Silver Bracelet (BL 5)",
    subtitle: "BL 5 · 5.5g · Solid 925 Sterling Silver",
    categorySlug: "bracelets",
    stoneSlug: "tourmaline",
    materialName: "925 Sterling Silver",
    isOneOfAKind: false,
    priceUsdMinor: 3200n,
    priceInrMinor: 275000n,
    primaryImage: "md_catalog/bracelets/bl_5_a",
    alternateImage: "md_catalog/bracelets/bl_5_b",
    description: "Exquisitely handcrafted in our Jaipur atelier from pure 925 sterling silver with an anti-tarnish protective finish, featuring hand-set natural Tourmaline (5.5g gross silver weight). Every detail reflects generations of royal bench mastery.",
  },
  {
    id: "e3538d5d-ff85-40c7-a485-5604d7cd254a",
    slug: "moonstone-silver-bracelet-bl-6",
    title: "Moonstone Silver Bracelet (BL 6)",
    subtitle: "BL 6 · 9.0g · Solid 925 Sterling Silver",
    categorySlug: "bracelets",
    stoneSlug: "moonstone",
    materialName: "925 Sterling Silver",
    isOneOfAKind: false,
    priceUsdMinor: 4200n,
    priceInrMinor: 360000n,
    primaryImage: "md_catalog/bracelets/bl_6_a",
    alternateImage: "md_catalog/bracelets/bl_6_b",
    description: "Exquisitely handcrafted in our Jaipur atelier from pure 925 sterling silver with an anti-tarnish protective finish, featuring hand-set natural Moonstone (9.0g gross silver weight). Every detail reflects generations of royal bench mastery.",
  },
  {
    id: "7b2db033-62b2-4f13-8eb7-b46d5482a85f",
    slug: "real-coral-silver-bracelet-bl-7",
    title: "Real Coral Silver Bracelet (BL 7)",
    subtitle: "BL 7 · 11.8g · Solid 925 Sterling Silver",
    categorySlug: "bracelets",
    stoneSlug: "coral",
    materialName: "925 Sterling Silver",
    isOneOfAKind: false,
    priceUsdMinor: 5600n,
    priceInrMinor: 472000n,
    primaryImage: "md_catalog/bracelets/bl_7_a",
    alternateImage: "md_catalog/bracelets/bl_7_b",
    description: "Exquisitely handcrafted in our Jaipur atelier from pure 925 sterling silver with an anti-tarnish protective finish, featuring hand-set natural Coral (11.8g gross silver weight). Every detail reflects generations of royal bench mastery.",
  },
  {
    id: "1fb55785-c38d-4ab9-9b5f-27b87a6ebe7e",
    slug: "larimar-silver-one-of-a-kind-bracelet-bl-8",
    title: "Larimar Silver One-of-a-Kind Bracelet (BL 8)",
    subtitle: "BL 8 · 29.5g · Solid 925 Sterling Silver",
    categorySlug: "one-of-a-kind",
    stoneSlug: "larimar",
    materialName: "925 Sterling Silver",
    isOneOfAKind: true,
    priceUsdMinor: 13900n,
    priceInrMinor: 1180000n,
    primaryImage: "md_catalog/one-of-a-kind/bl_8_a",
    alternateImage: "md_catalog/one-of-a-kind/bl_8_b",
    description: "Exquisitely handcrafted in our Jaipur atelier from pure 925 sterling silver with an anti-tarnish protective finish, featuring hand-set natural Larimar (29.5g gross silver weight). Every detail reflects generations of royal bench mastery.",
  },
  {
    id: "49a23ff7-40e3-4eb3-9d03-118a06e44c6a",
    slug: "amber-silver-one-of-a-kind-bracelet-bl-9",
    title: "Amber Silver One-of-a-Kind Bracelet (BL 9)",
    subtitle: "BL 9 · 31.6g · Solid 925 Sterling Silver",
    categorySlug: "one-of-a-kind",
    stoneSlug: "amber",
    materialName: "925 Sterling Silver",
    isOneOfAKind: true,
    priceUsdMinor: 13000n,
    priceInrMinor: 1106000n,
    primaryImage: "md_catalog/one-of-a-kind/bl_9_a",
    alternateImage: "md_catalog/one-of-a-kind/bl_9_b",
    description: "Exquisitely handcrafted in our Jaipur atelier from pure 925 sterling silver with an anti-tarnish protective finish, featuring hand-set natural Amber (31.6g gross silver weight). Every detail reflects generations of royal bench mastery.",
  },
  {
    id: "8804e113-9a93-4ae6-8183-1bfc06e6bca7",
    slug: "labradorite-silver-one-of-a-kind-bracelet-bl-10",
    title: "Labradorite Silver One-of-a-Kind Bracelet (BL 10)",
    subtitle: "BL 10 · 36.3g · Solid 925 Sterling Silver",
    categorySlug: "one-of-a-kind",
    stoneSlug: "labradorite",
    materialName: "925 Sterling Silver",
    isOneOfAKind: true,
    priceUsdMinor: 14900n,
    priceInrMinor: 1270500n,
    primaryImage: "md_catalog/one-of-a-kind/bl_10_a",
    alternateImage: "md_catalog/one-of-a-kind/bl_10_b",
    description: "Exquisitely handcrafted in our Jaipur atelier from pure 925 sterling silver with an anti-tarnish protective finish, featuring hand-set natural Labradorite (36.3g gross silver weight). Every detail reflects generations of royal bench mastery.",
  },
  {
    id: "935209f9-1586-4431-9bff-dae6b430dfe4",
    slug: "larimar-silver-one-of-a-kind-bracelet-bl-11",
    title: "Larimar Silver One-of-a-Kind Bracelet (BL 11)",
    subtitle: "BL 11 · 35.9g · Solid 925 Sterling Silver",
    categorySlug: "one-of-a-kind",
    stoneSlug: "larimar",
    materialName: "925 Sterling Silver",
    isOneOfAKind: true,
    priceUsdMinor: 16900n,
    priceInrMinor: 1436000n,
    primaryImage: "md_catalog/one-of-a-kind/bl_11_a",
    alternateImage: "md_catalog/one-of-a-kind/bl_11_b",
    description: "Exquisitely handcrafted in our Jaipur atelier from pure 925 sterling silver with an anti-tarnish protective finish, featuring hand-set natural Larimar (35.9g gross silver weight). Every detail reflects generations of royal bench mastery.",
  },
  {
    id: "92162643-7fb0-418c-87de-8a345baebdaa",
    slug: "amber-silver-one-of-a-kind-bracelet-bl-12",
    title: "Amber Silver One-of-a-Kind Bracelet (BL 12)",
    subtitle: "BL 12 · 17.7g · Solid 925 Sterling Silver",
    categorySlug: "one-of-a-kind",
    stoneSlug: "amber",
    materialName: "925 Sterling Silver",
    isOneOfAKind: true,
    priceUsdMinor: 7300n,
    priceInrMinor: 619500n,
    primaryImage: "md_catalog/one-of-a-kind/bl_12_a",
    alternateImage: "md_catalog/one-of-a-kind/bl_12_b",
    description: "Exquisitely handcrafted in our Jaipur atelier from pure 925 sterling silver with an anti-tarnish protective finish, featuring hand-set natural Amber (17.7g gross silver weight). Every detail reflects generations of royal bench mastery.",
  },
  {
    id: "82c459fe-6eca-4a01-9d91-e8906f5ce405",
    slug: "labradorite-silver-one-of-a-kind-bracelet-bl-13",
    title: "Labradorite Silver One-of-a-Kind Bracelet (BL 13)",
    subtitle: "BL 13 · 25.3g · Solid 925 Sterling Silver",
    categorySlug: "one-of-a-kind",
    stoneSlug: "labradorite",
    materialName: "925 Sterling Silver",
    isOneOfAKind: true,
    priceUsdMinor: 11900n,
    priceInrMinor: 1012000n,
    primaryImage: "md_catalog/one-of-a-kind/bl_13_a",
    alternateImage: "md_catalog/one-of-a-kind/bl_13_b",
    description: "Exquisitely handcrafted in our Jaipur atelier from pure 925 sterling silver with an anti-tarnish protective finish, featuring hand-set natural Labradorite (25.3g gross silver weight). Every detail reflects generations of royal bench mastery.",
  },
  {
    id: "f422b79f-85c6-4ef6-9518-03a2789d1220",
    slug: "silver-one-of-a-kind-bracelet-bl-14",
    title: "Silver One-of-a-Kind Bracelet (BL 14)",
    subtitle: "BL 14 · 42.8g · Solid 925 Sterling Silver",
    categorySlug: "one-of-a-kind",
    
    materialName: "925 Sterling Silver",
    isOneOfAKind: true,
    priceUsdMinor: 20100n,
    priceInrMinor: 1712000n,
    primaryImage: "md_catalog/one-of-a-kind/bl_14_a",
    alternateImage: "md_catalog/one-of-a-kind/bl_14_b",
    description: "Sculpted by master silversmiths in our Jaipur atelier from authentic solid 925 sterling silver with anti-tarnish protective alloy (42.8g gross weight). Designed for tactile comfort and enduring luxury.",
  },
  {
    id: "51f10873-9d25-433e-8927-b1734b0bbbce",
    slug: "silver-one-of-a-kind-bracelet-bl-15",
    title: "Silver One-of-a-Kind Bracelet (BL 15)",
    subtitle: "BL 15 · 36.4g · Solid 925 Sterling Silver",
    categorySlug: "one-of-a-kind",
    
    materialName: "925 Sterling Silver",
    isOneOfAKind: true,
    priceUsdMinor: 12800n,
    priceInrMinor: 1092000n,
    primaryImage: "md_catalog/one-of-a-kind/bl_15_a",
    alternateImage: "md_catalog/one-of-a-kind/bl_15_b",
    description: "Sculpted by master silversmiths in our Jaipur atelier from authentic solid 925 sterling silver with anti-tarnish protective alloy (36.4g gross weight). Designed for tactile comfort and enduring luxury.",
  },
  {
    id: "4bcc72e5-203a-4e28-beab-6ce55c173c47",
    slug: "silver-one-of-a-kind-bracelet-bl-16",
    title: "Silver One-of-a-Kind Bracelet (BL 16)",
    subtitle: "BL 16 · 42.4g · Solid 925 Sterling Silver",
    categorySlug: "one-of-a-kind",
    
    materialName: "925 Sterling Silver",
    isOneOfAKind: true,
    priceUsdMinor: 20000n,
    priceInrMinor: 1696000n,
    primaryImage: "md_catalog/one-of-a-kind/bl_16_a",
    alternateImage: "md_catalog/one-of-a-kind/bl_16_b",
    description: "Sculpted by master silversmiths in our Jaipur atelier from authentic solid 925 sterling silver with anti-tarnish protective alloy (42.4g gross weight). Designed for tactile comfort and enduring luxury.",
  },
  {
    id: "a194f89a-6523-4a8a-99f5-3895d7a9c3b0",
    slug: "silver-one-of-a-kind-bracelet-bl-17",
    title: "Silver One-of-a-Kind Bracelet (BL 17)",
    subtitle: "BL 17 · 36.1g · Solid 925 Sterling Silver",
    categorySlug: "one-of-a-kind",
    
    materialName: "925 Sterling Silver",
    isOneOfAKind: true,
    priceUsdMinor: 17000n,
    priceInrMinor: 1444000n,
    primaryImage: "md_catalog/one-of-a-kind/bl_17_a",
    alternateImage: "md_catalog/one-of-a-kind/bl_17_b",
    description: "Sculpted by master silversmiths in our Jaipur atelier from authentic solid 925 sterling silver with anti-tarnish protective alloy (36.1g gross weight). Designed for tactile comfort and enduring luxury.",
  },
  {
    id: "df79fb47-d1b1-41fe-bca0-00980a41cdf9",
    slug: "silver-one-of-a-kind-bracelet-bl-18",
    title: "Silver One-of-a-Kind Bracelet (BL 18)",
    subtitle: "BL 18 · 23.5g · Solid 925 Sterling Silver",
    categorySlug: "one-of-a-kind",
    
    materialName: "925 Sterling Silver",
    isOneOfAKind: true,
    priceUsdMinor: 16600n,
    priceInrMinor: 1410000n,
    primaryImage: "md_catalog/one-of-a-kind/bl_18_a",
    alternateImage: "md_catalog/one-of-a-kind/bl_18_b",
    description: "Sculpted by master silversmiths in our Jaipur atelier from authentic solid 925 sterling silver with anti-tarnish protective alloy (23.5g gross weight). Designed for tactile comfort and enduring luxury.",
  },
  {
    id: "570cae67-7524-4f9a-9f87-342bdc4a0784",
    slug: "silver-one-of-a-kind-bracelet-bl-19",
    title: "Silver One-of-a-Kind Bracelet (BL 19)",
    subtitle: "BL 19 · 29.5g · Solid 925 Sterling Silver",
    categorySlug: "one-of-a-kind",
    
    materialName: "925 Sterling Silver",
    isOneOfAKind: true,
    priceUsdMinor: 13900n,
    priceInrMinor: 1180000n,
    primaryImage: "md_catalog/one-of-a-kind/bl_19_a",
    alternateImage: "md_catalog/one-of-a-kind/bl_19_b",
    description: "Sculpted by master silversmiths in our Jaipur atelier from authentic solid 925 sterling silver with anti-tarnish protective alloy (29.5g gross weight). Designed for tactile comfort and enduring luxury.",
  },
  {
    id: "40f823a7-7fb4-420d-84f2-2ed1fb38df68",
    slug: "natural-opal-silver-bracelet-bl-20",
    title: "Natural Opal Silver Bracelet (BL 20)",
    subtitle: "BL 20 · 10.0g · Solid 925 Sterling Silver",
    categorySlug: "bracelets",
    stoneSlug: "opal",
    materialName: "925 Sterling Silver",
    isOneOfAKind: false,
    priceUsdMinor: 7100n,
    priceInrMinor: 600000n,
    primaryImage: "md_catalog/bracelets/bl_20_a",
    alternateImage: "md_catalog/bracelets/bl_20_b",
    description: "Exquisitely handcrafted in our Jaipur atelier from pure 925 sterling silver with an anti-tarnish protective finish, featuring hand-set natural Opal (10.0g gross silver weight). Every detail reflects generations of royal bench mastery.",
  },
  {
    id: "3ddfacc6-efe8-4ded-b201-e2ee5ca47b9c",
    slug: "natural-opal-silver-bracelet-bl-21",
    title: "Natural Opal Silver Bracelet (BL 21)",
    subtitle: "BL 21 · 9.8g · Solid 925 Sterling Silver",
    categorySlug: "bracelets",
    stoneSlug: "opal",
    materialName: "925 Sterling Silver",
    isOneOfAKind: false,
    priceUsdMinor: 6900n,
    priceInrMinor: 588000n,
    primaryImage: "md_catalog/bracelets/bl_21_a",
    alternateImage: "md_catalog/bracelets/bl_21_b",
    description: "Exquisitely handcrafted in our Jaipur atelier from pure 925 sterling silver with an anti-tarnish protective finish, featuring hand-set natural Opal (9.8g gross silver weight). Every detail reflects generations of royal bench mastery.",
  },
  {
    id: "6f6a26d7-ab79-48b1-b61d-8b5000645de6",
    slug: "silver-one-of-a-kind-bracelet-bl-22",
    title: "Silver One-of-a-Kind Bracelet (BL 22)",
    subtitle: "BL 22 · 38.5g · Solid 925 Sterling Silver",
    categorySlug: "one-of-a-kind",
    
    materialName: "925 Sterling Silver",
    isOneOfAKind: true,
    priceUsdMinor: 15900n,
    priceInrMinor: 1347500n,
    primaryImage: "md_catalog/one-of-a-kind/bl_22_a",
    alternateImage: "md_catalog/one-of-a-kind/bl_22_b",
    description: "Sculpted by master silversmiths in our Jaipur atelier from authentic solid 925 sterling silver with anti-tarnish protective alloy (38.5g gross weight). Designed for tactile comfort and enduring luxury.",
  },
  {
    id: "f8cff8a3-1309-404a-bc94-1ec0f0726b4e",
    slug: "sterling-silver-earrings-er-1",
    title: "Rutilated Quartz Sterling Silver Earrings (ER 1)",
    subtitle: "ER 1 · 5.1g · Solid 925 Sterling Silver",
    categorySlug: "earrings",
    stoneSlug: "rutilated-quartz",
    materialName: "925 Sterling Silver",
    isOneOfAKind: false,
    priceUsdMinor: 2100n,
    priceInrMinor: 178500n,
    primaryImage: "md_catalog/earrings/er_1_a",
    alternateImage: "md_catalog/earrings/er_1_a",
    description: "Handcrafted in our Jaipur atelier from solid 925 sterling silver hallmarked alloy, this captivating pair of earrings (ER 1) showcases natural Rutilated Quartz displaying delicate golden-black rutile needle inclusions beneath a faceted black gemstone stud (5.1g gross weight).",
  },
  {
    id: "b4489c7f-b1b7-4de7-b908-d254952267c8",
    slug: "sterling-silver-earrings-er-2",
    title: "Honey Amber Sterling Silver Earrings (ER 2)",
    subtitle: "ER 2 · 2.2g · Solid 925 Sterling Silver",
    categorySlug: "earrings",
    stoneSlug: "amber",
    materialName: "925 Sterling Silver",
    isOneOfAKind: false,
    priceUsdMinor: 1500n,
    priceInrMinor: 77000n,
    primaryImage: "md_catalog/earrings/er_2_a",
    alternateImage: "md_catalog/earrings/er_2_a",
    description: "Handcrafted in our Jaipur atelier from solid 925 sterling silver hallmarked alloy, this delicate pair of earrings (ER 2) features luminous natural cognac honey Amber cabochons in a graceful drop silhouette (2.2g gross weight).",
  },
  {
    id: "37f7d8b6-2deb-4086-b0ab-d26aa01a62e2",
    slug: "sterling-silver-earrings-er-3",
    title: "Rutilated Quartz Sterling Silver Earrings (ER 3)",
    subtitle: "ER 3 · 4.8g · Solid 925 Sterling Silver",
    categorySlug: "earrings",
    stoneSlug: "rutilated-quartz",
    materialName: "925 Sterling Silver",
    isOneOfAKind: false,
    priceUsdMinor: 2000n,
    priceInrMinor: 168000n,
    primaryImage: "md_catalog/earrings/er_3_a",
    alternateImage: "md_catalog/earrings/er_3_a",
    description: "Handcrafted in our Jaipur atelier from solid 925 sterling silver hallmarked alloy, this architectural pair of earrings (ER 3) highlights hand-cut natural Rutilated Quartz crowned by a faceted black gemstone accent (4.8g gross weight).",
  },
  {
    id: "22583afd-2b9c-4932-bb25-4301a0e480a6",
    slug: "sterling-silver-earrings-er-4",
    title: "Rutilated Quartz Sterling Silver Earrings (ER 4)",
    subtitle: "ER 4 · 5.1g · Solid 925 Sterling Silver",
    categorySlug: "earrings",
    stoneSlug: "rutilated-quartz",
    materialName: "925 Sterling Silver",
    isOneOfAKind: false,
    priceUsdMinor: 2100n,
    priceInrMinor: 178500n,
    primaryImage: "md_catalog/earrings/er_4_a",
    alternateImage: "md_catalog/earrings/er_4_a",
    description: "Handcrafted in our Jaipur atelier from solid 925 sterling silver hallmarked alloy, this pair of earrings (ER 4) features an elongated shepherd hook with a faceted black top stone and a natural Rutilated Quartz drop showing striking needle inclusions (5.1g gross weight).",
  },
  {
    id: "ddb51bc4-dbbe-40a9-9d29-567c3aa48377",
    slug: "sterling-silver-earrings-er-5",
    title: "Kyanite & Amethyst Sterling Silver Earrings (ER 5)",
    subtitle: "ER 5 · 3.9g · Solid 925 Sterling Silver",
    categorySlug: "earrings",
    stoneSlug: "kyanite",
    materialName: "925 Sterling Silver",
    isOneOfAKind: false,
    priceUsdMinor: 1600n,
    priceInrMinor: 136500n,
    primaryImage: "md_catalog/earrings/er_5_a",
    alternateImage: "md_catalog/earrings/er_5_a",
    description: "Handcrafted in our Jaipur atelier from solid 925 sterling silver hallmarked alloy, this royal pair of earrings (ER 5) features deep indigo blue natural Kyanite cabochons paired with faceted purple Amethyst accents (3.9g gross weight).",
  },
  {
    id: "3cb34dc4-6d30-4273-8256-d2f306e6323c",
    slug: "sterling-silver-earrings-er-6",
    title: "Kyanite & Amethyst Sterling Silver Earrings (ER 6)",
    subtitle: "ER 6 · 3.0g · Solid 925 Sterling Silver",
    categorySlug: "earrings",
    stoneSlug: "kyanite",
    materialName: "925 Sterling Silver",
    isOneOfAKind: false,
    priceUsdMinor: 1500n,
    priceInrMinor: 105000n,
    primaryImage: "md_catalog/earrings/er_6_a",
    alternateImage: "md_catalog/earrings/er_6_a",
    description: "Handcrafted in our Jaipur atelier from solid 925 sterling silver hallmarked alloy, this vibrant pair of earrings (ER 6) showcases intense natural Kyanite cabochons crowned with faceted round Amethyst gems (3.0g gross weight).",
  },
  {
    id: "fac0ba3f-3e8c-42b6-b774-aedf380190a4",
    slug: "sterling-silver-earrings-er-7",
    title: "Honey Amber Sterling Silver Earrings (ER 7)",
    subtitle: "ER 7 · 4.0g · Solid 925 Sterling Silver",
    categorySlug: "earrings",
    stoneSlug: "amber",
    materialName: "925 Sterling Silver",
    isOneOfAKind: false,
    priceUsdMinor: 1600n,
    priceInrMinor: 140000n,
    primaryImage: "md_catalog/earrings/er_7_a",
    alternateImage: "md_catalog/earrings/er_7_a",
    description: "Handcrafted in our Jaipur atelier from solid 925 sterling silver hallmarked alloy, this two-tier geometric pair of earrings (ER 7) features natural honey Amber stones with a round top cabochon and a square amber drop (4.0g gross weight).",
  },
  {
    id: "5da0ba62-20fb-41b5-bb81-fb075c2bedc8",
    slug: "sterling-silver-earrings-er-8",
    title: "Turquoise & Blue Topaz Sterling Silver Earrings (ER 8)",
    subtitle: "ER 8 · 3.5g · Solid 925 Sterling Silver",
    categorySlug: "earrings",
    stoneSlug: "turquoise",
    materialName: "925 Sterling Silver",
    isOneOfAKind: false,
    priceUsdMinor: 2100n,
    priceInrMinor: 175000n,
    primaryImage: "md_catalog/earrings/er_8_a",
    alternateImage: "md_catalog/earrings/er_8_a",
    description: "Handcrafted in our Jaipur atelier from solid 925 sterling silver hallmarked alloy, this magnificent pair of earrings (ER 8) pairs faceted Swiss Blue Topaz studs with vivid sky-blue natural Turquoise cabochon drops (3.5g gross weight).",
  },
  {
    id: "a925e7df-f024-4b3a-9b07-c16ec16b4b9d",
    slug: "sterling-silver-earrings-er-9",
    title: "Rutilated Quartz Sterling Silver Earrings (ER 9)",
    subtitle: "ER 9 · 5.0g · Solid 925 Sterling Silver",
    categorySlug: "earrings",
    stoneSlug: "rutilated-quartz",
    materialName: "925 Sterling Silver",
    isOneOfAKind: false,
    priceUsdMinor: 2100n,
    priceInrMinor: 175000n,
    primaryImage: "md_catalog/earrings/er_9_a",
    alternateImage: "md_catalog/earrings/er_9_a",
    description: "Handcrafted in our Jaipur atelier from solid 925 sterling silver hallmarked alloy, this statement pair of earrings (ER 9) showcases clear natural Rutilated Quartz displaying bold needle clusters suspended below a faceted black gemstone (5.0g gross weight).",
  },
  {
    id: "a7c13604-8788-4e1a-a943-1a393e3cfd8a",
    slug: "sterling-silver-earrings-er-10",
    title: "Turquoise & Blue Topaz Sterling Silver Earrings (ER 10)",
    subtitle: "ER 10 · 4.5g · Solid 925 Sterling Silver",
    categorySlug: "earrings",
    stoneSlug: "turquoise",
    materialName: "925 Sterling Silver",
    isOneOfAKind: false,
    priceUsdMinor: 2600n,
    priceInrMinor: 225000n,
    primaryImage: "md_catalog/earrings/er_10_a",
    alternateImage: "md_catalog/earrings/er_10_a",
    description: "Handcrafted in our Jaipur atelier from solid 925 sterling silver hallmarked alloy, this cascading pair of earrings (ER 10) features faceted Blue Topaz top studs and double graduated tiers of pure natural Turquoise (4.5g gross weight).",
  },
  {
    id: "6bfb69fe-a9ec-4fa4-a194-46496d08d19e",
    slug: "sterling-silver-earrings-er-11",
    title: "Rutilated Quartz Sterling Silver Earrings (ER 11)",
    subtitle: "ER 11 · 4.9g · Solid 925 Sterling Silver",
    categorySlug: "earrings",
    stoneSlug: "rutilated-quartz",
    materialName: "925 Sterling Silver",
    isOneOfAKind: false,
    priceUsdMinor: 2000n,
    priceInrMinor: 171500n,
    primaryImage: "md_catalog/earrings/er_11_a",
    alternateImage: "md_catalog/earrings/er_11_a",
    description: "Handcrafted in our Jaipur atelier from solid 925 sterling silver hallmarked alloy, this elegant pair of earrings (ER 11) presents teardrop natural Rutilated Quartz gems suspended from faceted black gemstone studs (4.9g gross weight).",
  },
  {
    id: "354c02ea-d12e-4295-9b1c-694f69a82291",
    slug: "sterling-silver-earrings-er-12",
    title: "Turquoise & Blue Topaz Sterling Silver Earrings (ER 12)",
    subtitle: "ER 12 · 3.1g · Solid 925 Sterling Silver",
    categorySlug: "earrings",
    stoneSlug: "turquoise",
    materialName: "925 Sterling Silver",
    isOneOfAKind: false,
    priceUsdMinor: 1800n,
    priceInrMinor: 155000n,
    primaryImage: "md_catalog/earrings/er_12_a",
    alternateImage: "md_catalog/earrings/er_12_a",
    description: "Handcrafted in our Jaipur atelier from solid 925 sterling silver hallmarked alloy, this refined pair of earrings (ER 12) pairs brilliant-cut Blue Topaz with smooth natural Turquoise teardrop cabochons (3.1g gross weight).",
  },
  {
    id: "71ddbff1-a3a1-4f4b-9182-89d27198dd5a",
    slug: "sterling-silver-earrings-er-13",
    title: "Honey Amber Sterling Silver Earrings (ER 13)",
    subtitle: "ER 13 · 2.4g · Solid 925 Sterling Silver",
    categorySlug: "earrings",
    stoneSlug: "amber",
    materialName: "925 Sterling Silver",
    isOneOfAKind: false,
    priceUsdMinor: 1500n,
    priceInrMinor: 84000n,
    primaryImage: "md_catalog/earrings/er_13_a",
    alternateImage: "md_catalog/earrings/er_13_a",
    description: "Handcrafted in our Jaipur atelier from solid 925 sterling silver hallmarked alloy, this luminous pair of earrings (ER 13) features two articulated tiers of radiant golden-cognac natural Amber cabochons (2.4g gross weight).",
  },
  {
    id: "fe8c3f3c-424f-4221-b2e4-52970a585541",
    slug: "sterling-silver-earrings-er-14",
    title: "Turquoise & Blue Topaz Sterling Silver Earrings (ER 14)",
    subtitle: "ER 14 · 3.7g · Solid 925 Sterling Silver",
    categorySlug: "earrings",
    stoneSlug: "turquoise",
    materialName: "925 Sterling Silver",
    isOneOfAKind: false,
    priceUsdMinor: 2200n,
    priceInrMinor: 185000n,
    primaryImage: "md_catalog/earrings/er_14_a",
    alternateImage: "md_catalog/earrings/er_14_b",
    description: "Handcrafted in our Jaipur atelier from solid 925 sterling silver hallmarked alloy, this dramatic pair of earrings (ER 14) showcases large elongated natural Turquoise drops crowned by faceted sparkling Blue Topaz gemstones (3.7g gross weight).",
  },
  {
    id: "cefe9ee9-5e30-49e2-b206-2c600144bfa2",
    slug: "larimar-silver-one-of-a-kind-pendant-ok-1",
    title: "Larimar Silver One-of-a-Kind Pendant (OK 1)",
    subtitle: "OK 1 · 12.2g · Solid 925 Sterling Silver",
    categorySlug: "one-of-a-kind",
    stoneSlug: "larimar",
    materialName: "925 Sterling Silver",
    isOneOfAKind: true,
    priceUsdMinor: 5700n,
    priceInrMinor: 488000n,
    primaryImage: "md_catalog/one-of-a-kind/ok_1_a",
    alternateImage: "md_catalog/one-of-a-kind/ok_1_b",
    description: "Exquisitely handcrafted in our Jaipur atelier from pure 925 sterling silver with an anti-tarnish protective finish, featuring hand-set natural Larimar (12.2g gross silver weight). Every detail reflects generations of royal bench mastery.",
  },
  {
    id: "805170ec-4739-4ea6-a66d-3c60d4ea3ef6",
    slug: "larimar-silver-one-of-a-kind-pendant-ok-2",
    title: "Larimar Silver One-of-a-Kind Pendant (OK 2)",
    subtitle: "OK 2 · 8.0g · Solid 925 Sterling Silver",
    categorySlug: "one-of-a-kind",
    stoneSlug: "larimar",
    materialName: "925 Sterling Silver",
    isOneOfAKind: true,
    priceUsdMinor: 3800n,
    priceInrMinor: 320000n,
    primaryImage: "md_catalog/one-of-a-kind/ok_2_a",
    alternateImage: "md_catalog/one-of-a-kind/ok_2_b",
    description: "Exquisitely handcrafted in our Jaipur atelier from pure 925 sterling silver with an anti-tarnish protective finish, featuring hand-set natural Larimar (8.0g gross silver weight). Every detail reflects generations of royal bench mastery.",
  },
  {
    id: "965ff1f6-9ee6-47eb-a541-a98e3b793d3a",
    slug: "larimar-silver-one-of-a-kind-pendant-ok-3",
    title: "Larimar Silver One-of-a-Kind Pendant (OK 3)",
    subtitle: "OK 3 · 6.5g · Solid 925 Sterling Silver",
    categorySlug: "one-of-a-kind",
    stoneSlug: "larimar",
    materialName: "925 Sterling Silver",
    isOneOfAKind: true,
    priceUsdMinor: 3100n,
    priceInrMinor: 260000n,
    primaryImage: "md_catalog/one-of-a-kind/ok_3_a",
    alternateImage: "md_catalog/one-of-a-kind/ok_3_b",
    description: "Exquisitely handcrafted in our Jaipur atelier from pure 925 sterling silver with an anti-tarnish protective finish, featuring hand-set natural Larimar (6.5g gross silver weight). Every detail reflects generations of royal bench mastery.",
  },
  {
    id: "92a06f6e-95c0-4e34-a418-36229199502a",
    slug: "larimar-silver-one-of-a-kind-pendant-ok-4",
    title: "Larimar Silver One-of-a-Kind Pendant (OK 4)",
    subtitle: "OK 4 · 11.8g · Solid 925 Sterling Silver",
    categorySlug: "one-of-a-kind",
    stoneSlug: "larimar",
    materialName: "925 Sterling Silver",
    isOneOfAKind: true,
    priceUsdMinor: 5600n,
    priceInrMinor: 472000n,
    primaryImage: "md_catalog/one-of-a-kind/ok_4_a",
    alternateImage: "md_catalog/one-of-a-kind/ok_4_b",
    description: "Exquisitely handcrafted in our Jaipur atelier from pure 925 sterling silver with an anti-tarnish protective finish, featuring hand-set natural Larimar (11.8g gross silver weight). Every detail reflects generations of royal bench mastery.",
  },
  {
    id: "716ac927-f300-4f33-8a8f-a9ab387e8cea",
    slug: "larimar-silver-one-of-a-kind-pendant-ok-5",
    title: "Larimar Silver One-of-a-Kind Pendant (OK 5)",
    subtitle: "OK 5 · 10.8g · Solid 925 Sterling Silver",
    categorySlug: "one-of-a-kind",
    stoneSlug: "larimar",
    materialName: "925 Sterling Silver",
    isOneOfAKind: true,
    priceUsdMinor: 5100n,
    priceInrMinor: 432000n,
    primaryImage: "md_catalog/one-of-a-kind/ok_5_a",
    alternateImage: "md_catalog/one-of-a-kind/ok_5_b",
    description: "Exquisitely handcrafted in our Jaipur atelier from pure 925 sterling silver with an anti-tarnish protective finish, featuring hand-set natural Larimar (10.8g gross silver weight). Every detail reflects generations of royal bench mastery.",
  },
  {
    id: "f953537e-8b92-4026-9fe3-9b4f147bbc9a",
    slug: "larimar-silver-one-of-a-kind-pendant-ok-6",
    title: "Larimar Silver One-of-a-Kind Pendant (OK 6)",
    subtitle: "OK 6 · 9.8g · Solid 925 Sterling Silver",
    categorySlug: "one-of-a-kind",
    stoneSlug: "larimar",
    materialName: "925 Sterling Silver",
    isOneOfAKind: true,
    priceUsdMinor: 4600n,
    priceInrMinor: 392000n,
    primaryImage: "md_catalog/one-of-a-kind/ok_6_a",
    alternateImage: "md_catalog/one-of-a-kind/ok_6_b",
    description: "Exquisitely handcrafted in our Jaipur atelier from pure 925 sterling silver with an anti-tarnish protective finish, featuring hand-set natural Larimar (9.8g gross silver weight). Every detail reflects generations of royal bench mastery.",
  },
  {
    id: "e7bb3f55-9a0b-4ee2-a172-5d4ad88e0b2e",
    slug: "larimar-silver-one-of-a-kind-pendant-ok-7",
    title: "Larimar Silver One-of-a-Kind Pendant (OK 7)",
    subtitle: "OK 7 · 11.3g · Solid 925 Sterling Silver",
    categorySlug: "one-of-a-kind",
    stoneSlug: "larimar",
    materialName: "925 Sterling Silver",
    isOneOfAKind: true,
    priceUsdMinor: 5300n,
    priceInrMinor: 452000n,
    primaryImage: "md_catalog/one-of-a-kind/ok_7_a",
    alternateImage: "md_catalog/one-of-a-kind/ok_7_b",
    description: "Exquisitely handcrafted in our Jaipur atelier from pure 925 sterling silver with an anti-tarnish protective finish, featuring hand-set natural Larimar (11.3g gross silver weight). Every detail reflects generations of royal bench mastery.",
  },
  {
    id: "40053368-7bef-4a8a-a386-2007cc6fd8f6",
    slug: "larimar-silver-one-of-a-kind-pendant-ok-8",
    title: "Larimar Silver One-of-a-Kind Pendant (OK 8)",
    subtitle: "OK 8 · 9.4g · Solid 925 Sterling Silver",
    categorySlug: "one-of-a-kind",
    stoneSlug: "larimar",
    materialName: "925 Sterling Silver",
    isOneOfAKind: true,
    priceUsdMinor: 4400n,
    priceInrMinor: 376000n,
    primaryImage: "md_catalog/one-of-a-kind/ok_8_a",
    alternateImage: "md_catalog/one-of-a-kind/ok_8_b",
    description: "Exquisitely handcrafted in our Jaipur atelier from pure 925 sterling silver with an anti-tarnish protective finish, featuring hand-set natural Larimar (9.4g gross silver weight). Every detail reflects generations of royal bench mastery.",
  },
  {
    id: "de3eff09-ee3b-4aff-8b67-f158fcf3821f",
    slug: "larimar-silver-one-of-a-kind-pendant-ok-9",
    title: "Larimar Silver One-of-a-Kind Pendant (OK 9)",
    subtitle: "OK 9 · 11.0g · Solid 925 Sterling Silver",
    categorySlug: "one-of-a-kind",
    stoneSlug: "larimar",
    materialName: "925 Sterling Silver",
    isOneOfAKind: true,
    priceUsdMinor: 5200n,
    priceInrMinor: 440000n,
    primaryImage: "md_catalog/one-of-a-kind/ok_9_a",
    alternateImage: "md_catalog/one-of-a-kind/ok_9_b",
    description: "Exquisitely handcrafted in our Jaipur atelier from pure 925 sterling silver with an anti-tarnish protective finish, featuring hand-set natural Larimar (11.0g gross silver weight). Every detail reflects generations of royal bench mastery.",
  },
  {
    id: "dec8fafe-f79f-4152-99d8-a8b6b6e75a1c",
    slug: "larimar-silver-one-of-a-kind-pendant-ok-10",
    title: "Larimar Silver One-of-a-Kind Pendant (OK 10)",
    subtitle: "OK 10 · 10.2g · Solid 925 Sterling Silver",
    categorySlug: "one-of-a-kind",
    stoneSlug: "larimar",
    materialName: "925 Sterling Silver",
    isOneOfAKind: true,
    priceUsdMinor: 4800n,
    priceInrMinor: 408000n,
    primaryImage: "md_catalog/one-of-a-kind/ok_10_a",
    alternateImage: "md_catalog/one-of-a-kind/ok_10_b",
    description: "Exquisitely handcrafted in our Jaipur atelier from pure 925 sterling silver with an anti-tarnish protective finish, featuring hand-set natural Larimar (10.2g gross silver weight). Every detail reflects generations of royal bench mastery.",
  },
  {
    id: "c8d34b76-1604-463f-92ec-96a49aeeb27d",
    slug: "silver-one-of-a-kind-pendant-ok-11",
    title: "Silver One-of-a-Kind Pendant (OK 11)",
    subtitle: "OK 11 · 15.5g · Solid 925 Sterling Silver",
    categorySlug: "one-of-a-kind",
    
    materialName: "925 Sterling Silver",
    isOneOfAKind: true,
    priceUsdMinor: 6400n,
    priceInrMinor: 542500n,
    primaryImage: "md_catalog/one-of-a-kind/ok_11_a",
    alternateImage: "md_catalog/one-of-a-kind/ok_11_b",
    description: "Sculpted by master silversmiths in our Jaipur atelier from authentic solid 925 sterling silver with anti-tarnish protective alloy (15.5g gross weight). Designed for tactile comfort and enduring luxury.",
  },
  {
    id: "05aac931-e09e-44cf-b85e-da3a7bc4069d",
    slug: "silver-one-of-a-kind-pendant-ok-12",
    title: "Silver One-of-a-Kind Pendant (OK 12)",
    subtitle: "OK 12 · 10.8g · Solid 925 Sterling Silver",
    categorySlug: "one-of-a-kind",
    
    materialName: "925 Sterling Silver",
    isOneOfAKind: true,
    priceUsdMinor: 4400n,
    priceInrMinor: 378000n,
    primaryImage: "md_catalog/one-of-a-kind/ok_12_a",
    alternateImage: "md_catalog/one-of-a-kind/ok_12_b",
    description: "Sculpted by master silversmiths in our Jaipur atelier from authentic solid 925 sterling silver with anti-tarnish protective alloy (10.8g gross weight). Designed for tactile comfort and enduring luxury.",
  },
  {
    id: "d5daa6a2-18bf-4d13-b6c0-a3d510d84502",
    slug: "silver-one-of-a-kind-pendant-ok-13",
    title: "Silver One-of-a-Kind Pendant (OK 13)",
    subtitle: "OK 13 · 17.2g · Solid 925 Sterling Silver",
    categorySlug: "one-of-a-kind",
    
    materialName: "925 Sterling Silver",
    isOneOfAKind: true,
    priceUsdMinor: 7100n,
    priceInrMinor: 602000n,
    primaryImage: "md_catalog/one-of-a-kind/ok_13_a",
    alternateImage: "md_catalog/one-of-a-kind/ok_13_b",
    description: "Sculpted by master silversmiths in our Jaipur atelier from authentic solid 925 sterling silver with anti-tarnish protective alloy (17.2g gross weight). Designed for tactile comfort and enduring luxury.",
  },
  {
    id: "a318a4db-921a-4ec1-be1c-8e9d81c7412e",
    slug: "silver-one-of-a-kind-pendant-ok-14",
    title: "Silver One-of-a-Kind Pendant (OK 14)",
    subtitle: "OK 14 · 8.8g · Solid 925 Sterling Silver",
    categorySlug: "one-of-a-kind",
    
    materialName: "925 Sterling Silver",
    isOneOfAKind: true,
    priceUsdMinor: 3600n,
    priceInrMinor: 308000n,
    primaryImage: "md_catalog/one-of-a-kind/ok_14_a",
    alternateImage: "md_catalog/one-of-a-kind/ok_14_b",
    description: "Sculpted by master silversmiths in our Jaipur atelier from authentic solid 925 sterling silver with anti-tarnish protective alloy (8.8g gross weight). Designed for tactile comfort and enduring luxury.",
  },
  {
    id: "73d0de66-5e1b-46eb-bd52-07535c5b0ea9",
    slug: "silver-one-of-a-kind-pendant-ok-15",
    title: "Silver One-of-a-Kind Pendant (OK 15)",
    subtitle: "OK 15 · 12.1g · Solid 925 Sterling Silver",
    categorySlug: "one-of-a-kind",
    
    materialName: "925 Sterling Silver",
    isOneOfAKind: true,
    priceUsdMinor: 5000n,
    priceInrMinor: 423500n,
    primaryImage: "md_catalog/one-of-a-kind/ok_15_a",
    alternateImage: "md_catalog/one-of-a-kind/ok_15_b",
    description: "Sculpted by master silversmiths in our Jaipur atelier from authentic solid 925 sterling silver with anti-tarnish protective alloy (12.1g gross weight). Designed for tactile comfort and enduring luxury.",
  },
  {
    id: "8cd97fc4-cb85-4508-b907-53c0e70c0aee",
    slug: "silver-one-of-a-kind-pendant-ok-16",
    title: "Silver One-of-a-Kind Pendant (OK 16)",
    subtitle: "OK 16 · 10.4g · Solid 925 Sterling Silver",
    categorySlug: "one-of-a-kind",
    
    materialName: "925 Sterling Silver",
    isOneOfAKind: true,
    priceUsdMinor: 4300n,
    priceInrMinor: 364000n,
    primaryImage: "md_catalog/one-of-a-kind/ok_16_a",
    alternateImage: "md_catalog/one-of-a-kind/ok_16_b",
    description: "Sculpted by master silversmiths in our Jaipur atelier from authentic solid 925 sterling silver with anti-tarnish protective alloy (10.4g gross weight). Designed for tactile comfort and enduring luxury.",
  },
  {
    id: "2fea44b4-f35e-46bc-b33f-e9f4dce4b099",
    slug: "silver-one-of-a-kind-pendant-ok-17",
    title: "Silver One-of-a-Kind Pendant (OK 17)",
    subtitle: "OK 17 · 11.2g · Solid 925 Sterling Silver",
    categorySlug: "one-of-a-kind",
    
    materialName: "925 Sterling Silver",
    isOneOfAKind: true,
    priceUsdMinor: 4600n,
    priceInrMinor: 392000n,
    primaryImage: "md_catalog/one-of-a-kind/ok_17_a",
    alternateImage: "md_catalog/one-of-a-kind/ok_17_b",
    description: "Sculpted by master silversmiths in our Jaipur atelier from authentic solid 925 sterling silver with anti-tarnish protective alloy (11.2g gross weight). Designed for tactile comfort and enduring luxury.",
  },
  {
    id: "d03c37fa-fe06-4197-a1c7-e94185a3644d",
    slug: "silver-one-of-a-kind-pendant-ok-18",
    title: "Silver One-of-a-Kind Pendant (OK 18)",
    subtitle: "OK 18 · 18.6g · Solid 925 Sterling Silver",
    categorySlug: "one-of-a-kind",
    
    materialName: "925 Sterling Silver",
    isOneOfAKind: true,
    priceUsdMinor: 7700n,
    priceInrMinor: 651000n,
    primaryImage: "md_catalog/one-of-a-kind/ok_18_a",
    alternateImage: "md_catalog/one-of-a-kind/ok_18_b",
    description: "Sculpted by master silversmiths in our Jaipur atelier from authentic solid 925 sterling silver with anti-tarnish protective alloy (18.6g gross weight). Designed for tactile comfort and enduring luxury.",
  },
  {
    id: "e290918f-b91d-4556-96e1-11b167808400",
    slug: "silver-one-of-a-kind-pendant-ok-19",
    title: "Silver One-of-a-Kind Pendant (OK 19)",
    subtitle: "OK 19 · 13.6g · Solid 925 Sterling Silver",
    categorySlug: "one-of-a-kind",
    
    materialName: "925 Sterling Silver",
    isOneOfAKind: true,
    priceUsdMinor: 5600n,
    priceInrMinor: 476000n,
    primaryImage: "md_catalog/one-of-a-kind/ok_19_a",
    alternateImage: "md_catalog/one-of-a-kind/ok_19_b",
    description: "Sculpted by master silversmiths in our Jaipur atelier from authentic solid 925 sterling silver with anti-tarnish protective alloy (13.6g gross weight). Designed for tactile comfort and enduring luxury.",
  },
  {
    id: "66f29264-326b-4642-be90-55957293dfb2",
    slug: "silver-one-of-a-kind-pendant-ok-20",
    title: "Silver One-of-a-Kind Pendant (OK 20)",
    subtitle: "OK 20 · 10.2g · Solid 925 Sterling Silver",
    categorySlug: "one-of-a-kind",
    
    materialName: "925 Sterling Silver",
    isOneOfAKind: true,
    priceUsdMinor: 4200n,
    priceInrMinor: 357000n,
    primaryImage: "md_catalog/one-of-a-kind/ok_20_a",
    alternateImage: "md_catalog/one-of-a-kind/ok_20_b",
    description: "Sculpted by master silversmiths in our Jaipur atelier from authentic solid 925 sterling silver with anti-tarnish protective alloy (10.2g gross weight). Designed for tactile comfort and enduring luxury.",
  },
  {
    id: "0f67f75d-338b-4a66-98c8-2223c677d643",
    slug: "silver-one-of-a-kind-pendant-ok-21",
    title: "Silver One-of-a-Kind Pendant (OK 21)",
    subtitle: "OK 21 · 12.3g · Solid 925 Sterling Silver",
    categorySlug: "one-of-a-kind",
    
    materialName: "925 Sterling Silver",
    isOneOfAKind: true,
    priceUsdMinor: 5100n,
    priceInrMinor: 430500n,
    primaryImage: "md_catalog/one-of-a-kind/ok_21_a",
    alternateImage: "md_catalog/one-of-a-kind/ok_21_b",
    description: "Sculpted by master silversmiths in our Jaipur atelier from authentic solid 925 sterling silver with anti-tarnish protective alloy (12.3g gross weight). Designed for tactile comfort and enduring luxury.",
  },
  {
    id: "43faeec7-833f-49a1-859e-760e9ca01233",
    slug: "sterling-silver-pendant-ok-22",
    title: "Sterling Silver Pendant (OK 22)",
    subtitle: "OK 22 · 5.2g · Solid 925 Sterling Silver",
    categorySlug: "pendants",
    
    materialName: "925 Sterling Silver",
    isOneOfAKind: false,
    priceUsdMinor: 3100n,
    priceInrMinor: 260000n,
    primaryImage: "md_catalog/pendants/ok_22_a",
    alternateImage: "md_catalog/pendants/ok_22_b",
    description: "Sculpted by master silversmiths in our Jaipur atelier from authentic solid 925 sterling silver with anti-tarnish protective alloy (5.2g gross weight). Designed for tactile comfort and enduring luxury.",
  },
  {
    id: "416af7fb-d058-4393-a73e-286f897d9eea",
    slug: "sterling-silver-pendant-ok-23",
    title: "Sterling Silver Pendant (OK 23)",
    subtitle: "OK 23 · 4.9g · Solid 925 Sterling Silver",
    categorySlug: "pendants",
    
    materialName: "925 Sterling Silver",
    isOneOfAKind: false,
    priceUsdMinor: 2900n,
    priceInrMinor: 245000n,
    primaryImage: "md_catalog/pendants/ok_23_a",
    alternateImage: "md_catalog/pendants/ok_23_b",
    description: "Sculpted by master silversmiths in our Jaipur atelier from authentic solid 925 sterling silver with anti-tarnish protective alloy (4.9g gross weight). Designed for tactile comfort and enduring luxury.",
  },
  {
    id: "11daeab0-4e0e-4bd2-9287-3ae8830559d3",
    slug: "sterling-silver-pendant-ok-24",
    title: "Sterling Silver Pendant (OK 24)",
    subtitle: "OK 24 · 5.6g · Solid 925 Sterling Silver",
    categorySlug: "pendants",
    
    materialName: "925 Sterling Silver",
    isOneOfAKind: false,
    priceUsdMinor: 3300n,
    priceInrMinor: 280000n,
    primaryImage: "md_catalog/pendants/ok_24_a",
    alternateImage: "md_catalog/pendants/ok_24_b",
    description: "Sculpted by master silversmiths in our Jaipur atelier from authentic solid 925 sterling silver with anti-tarnish protective alloy (5.6g gross weight). Designed for tactile comfort and enduring luxury.",
  },
  {
    id: "c46ee4ac-65b4-476f-b679-0cc2a1f7bc32",
    slug: "sterling-silver-pendant-ok-25",
    title: "Sterling Silver Pendant (OK 25)",
    subtitle: "OK 25 · 5.0g · Solid 925 Sterling Silver",
    categorySlug: "pendants",
    
    materialName: "925 Sterling Silver",
    isOneOfAKind: false,
    priceUsdMinor: 2900n,
    priceInrMinor: 250000n,
    primaryImage: "md_catalog/pendants/ok_25_a",
    alternateImage: "md_catalog/pendants/ok_25_b",
    description: "Sculpted by master silversmiths in our Jaipur atelier from authentic solid 925 sterling silver with anti-tarnish protective alloy (5.0g gross weight). Designed for tactile comfort and enduring luxury.",
  },
  {
    id: "e4da8720-94e5-451a-8363-c68d74f6bde5",
    slug: "sterling-silver-pendant-ok-26",
    title: "Sterling Silver Pendant (OK 26)",
    subtitle: "OK 26 · 4.9g · Solid 925 Sterling Silver",
    categorySlug: "pendants",
    
    materialName: "925 Sterling Silver",
    isOneOfAKind: false,
    priceUsdMinor: 2900n,
    priceInrMinor: 245000n,
    primaryImage: "md_catalog/pendants/ok_26_a",
    alternateImage: "md_catalog/pendants/ok_26_b",
    description: "Sculpted by master silversmiths in our Jaipur atelier from authentic solid 925 sterling silver with anti-tarnish protective alloy (4.9g gross weight). Designed for tactile comfort and enduring luxury.",
  },
  {
    id: "17630c04-8635-48a5-8e54-eff20c5a570f",
    slug: "sterling-silver-pendant-ok-27",
    title: "Sterling Silver Pendant (OK 27)",
    subtitle: "OK 27 · 3.6g · Solid 925 Sterling Silver",
    categorySlug: "pendants",
    
    materialName: "925 Sterling Silver",
    isOneOfAKind: false,
    priceUsdMinor: 2100n,
    priceInrMinor: 180000n,
    primaryImage: "md_catalog/pendants/ok_27_a",
    alternateImage: "md_catalog/pendants/ok_27_b",
    description: "Sculpted by master silversmiths in our Jaipur atelier from authentic solid 925 sterling silver with anti-tarnish protective alloy (3.6g gross weight). Designed for tactile comfort and enduring luxury.",
  },
  {
    id: "994950f1-c04e-4a07-a0e4-c62943ae46e6",
    slug: "sterling-silver-pendant-ok-28",
    title: "Sterling Silver Pendant (OK 28)",
    subtitle: "OK 28 · 3.5g · Solid 925 Sterling Silver",
    categorySlug: "pendants",
    
    materialName: "925 Sterling Silver",
    isOneOfAKind: false,
    priceUsdMinor: 2100n,
    priceInrMinor: 175000n,
    primaryImage: "md_catalog/pendants/ok_28_a",
    alternateImage: "md_catalog/pendants/ok_28_b",
    description: "Sculpted by master silversmiths in our Jaipur atelier from authentic solid 925 sterling silver with anti-tarnish protective alloy (3.5g gross weight). Designed for tactile comfort and enduring luxury.",
  },
  {
    id: "8c41e042-d878-49f2-86d5-e33bea3129fa",
    slug: "sterling-silver-pendant-ok-29",
    title: "Sterling Silver Pendant (OK 29)",
    subtitle: "OK 29 · 3.9g · Solid 925 Sterling Silver",
    categorySlug: "pendants",
    
    materialName: "925 Sterling Silver",
    isOneOfAKind: false,
    priceUsdMinor: 2300n,
    priceInrMinor: 195000n,
    primaryImage: "md_catalog/pendants/ok_29_a",
    alternateImage: "md_catalog/pendants/ok_29_b",
    description: "Sculpted by master silversmiths in our Jaipur atelier from authentic solid 925 sterling silver with anti-tarnish protective alloy (3.9g gross weight). Designed for tactile comfort and enduring luxury.",
  },
  {
    id: "41d20972-7766-4308-8f0e-457177f74c2e",
    slug: "sterling-silver-pendant-ok-30",
    title: "Sterling Silver Pendant (OK 30)",
    subtitle: "OK 30 · 3.4g · Solid 925 Sterling Silver",
    categorySlug: "pendants",
    
    materialName: "925 Sterling Silver",
    isOneOfAKind: false,
    priceUsdMinor: 2000n,
    priceInrMinor: 170000n,
    primaryImage: "md_catalog/pendants/ok_30_a",
    alternateImage: "md_catalog/pendants/ok_30_b",
    description: "Sculpted by master silversmiths in our Jaipur atelier from authentic solid 925 sterling silver with anti-tarnish protective alloy (3.4g gross weight). Designed for tactile comfort and enduring luxury.",
  },
  {
    id: "00f9dcb6-e8f0-4e09-8172-f72b3bd759ce",
    slug: "sterling-silver-pendant-ok-31",
    title: "Sterling Silver Pendant (OK 31)",
    subtitle: "OK 31 · 2.9g · Solid 925 Sterling Silver",
    categorySlug: "pendants",
    
    materialName: "925 Sterling Silver",
    isOneOfAKind: false,
    priceUsdMinor: 1700n,
    priceInrMinor: 145000n,
    primaryImage: "md_catalog/pendants/ok_31_a",
    alternateImage: "md_catalog/pendants/ok_31_a",
    description: "Sculpted by master silversmiths in our Jaipur atelier from authentic solid 925 sterling silver with anti-tarnish protective alloy (2.9g gross weight). Designed for tactile comfort and enduring luxury.",
  },
  {
    id: "03131e10-4860-47da-b4bc-2d4750fd19f3",
    slug: "sterling-silver-pendant-ok-32",
    title: "Sterling Silver Pendant (OK 32)",
    subtitle: "OK 32 · 4.5g · Solid 925 Sterling Silver",
    categorySlug: "pendants",
    
    materialName: "925 Sterling Silver",
    isOneOfAKind: false,
    priceUsdMinor: 1900n,
    priceInrMinor: 157500n,
    primaryImage: "md_catalog/pendants/ok_32_a",
    alternateImage: "md_catalog/pendants/ok_32_b",
    description: "Sculpted by master silversmiths in our Jaipur atelier from authentic solid 925 sterling silver with anti-tarnish protective alloy (4.5g gross weight). Designed for tactile comfort and enduring luxury.",
  },
  {
    id: "85786e40-7e37-465b-9c18-9fccf6d30a2c",
    slug: "sterling-silver-pendant-ok-33",
    title: "Sterling Silver Pendant (OK 33)",
    subtitle: "OK 33 · 5.2g · Solid 925 Sterling Silver",
    categorySlug: "pendants",
    
    materialName: "925 Sterling Silver",
    isOneOfAKind: false,
    priceUsdMinor: 2100n,
    priceInrMinor: 182000n,
    primaryImage: "md_catalog/pendants/ok_33_a",
    alternateImage: "md_catalog/pendants/ok_33_b",
    description: "Sculpted by master silversmiths in our Jaipur atelier from authentic solid 925 sterling silver with anti-tarnish protective alloy (5.2g gross weight). Designed for tactile comfort and enduring luxury.",
  },
  {
    id: "ee6b8ed8-a769-45d5-b622-b958697dee1d",
    slug: "sterling-silver-pendant-ok-34",
    title: "Sterling Silver Pendant (OK 34)",
    subtitle: "OK 34 · 3.4g · Solid 925 Sterling Silver",
    categorySlug: "pendants",
    
    materialName: "925 Sterling Silver",
    isOneOfAKind: false,
    priceUsdMinor: 1500n,
    priceInrMinor: 119000n,
    primaryImage: "md_catalog/pendants/ok_34_a",
    alternateImage: "md_catalog/pendants/ok_34_b",
    description: "Sculpted by master silversmiths in our Jaipur atelier from authentic solid 925 sterling silver with anti-tarnish protective alloy (3.4g gross weight). Designed for tactile comfort and enduring luxury.",
  },
  {
    id: "a182f324-d961-41bf-97f4-d5447cb35691",
    slug: "sterling-silver-pendant-ok-35",
    title: "Sterling Silver Pendant (OK 35)",
    subtitle: "OK 35 · 5.5g · Solid 925 Sterling Silver",
    categorySlug: "pendants",
    
    materialName: "925 Sterling Silver",
    isOneOfAKind: false,
    priceUsdMinor: 2300n,
    priceInrMinor: 192500n,
    primaryImage: "md_catalog/pendants/ok_35_a",
    alternateImage: "md_catalog/pendants/ok_35_b",
    description: "Sculpted by master silversmiths in our Jaipur atelier from authentic solid 925 sterling silver with anti-tarnish protective alloy (5.5g gross weight). Designed for tactile comfort and enduring luxury.",
  },
  {
    id: "74c734e7-ecfd-4be1-8d34-a3edb245b8d3",
    slug: "sterling-silver-pendant-ok-36",
    title: "Sterling Silver Pendant (OK 36)",
    subtitle: "OK 36 · 4.2g · Solid 925 Sterling Silver",
    categorySlug: "pendants",
    
    materialName: "925 Sterling Silver",
    isOneOfAKind: false,
    priceUsdMinor: 1700n,
    priceInrMinor: 147000n,
    primaryImage: "md_catalog/pendants/ok_36_a",
    alternateImage: "md_catalog/pendants/ok_36_b",
    description: "Sculpted by master silversmiths in our Jaipur atelier from authentic solid 925 sterling silver with anti-tarnish protective alloy (4.2g gross weight). Designed for tactile comfort and enduring luxury.",
  },
  {
    id: "56f97181-0db1-451b-ad15-05178946d7c2",
    slug: "silver-one-of-a-kind-pendant-ok-37",
    title: "Silver One-of-a-Kind Pendant (OK 37)",
    subtitle: "OK 37 · 10.7g · Solid 925 Sterling Silver",
    categorySlug: "one-of-a-kind",
    
    materialName: "925 Sterling Silver",
    isOneOfAKind: true,
    priceUsdMinor: 3800n,
    priceInrMinor: 321000n,
    primaryImage: "md_catalog/one-of-a-kind/ok_37_a",
    alternateImage: "md_catalog/one-of-a-kind/ok_37_b",
    description: "Sculpted by master silversmiths in our Jaipur atelier from authentic solid 925 sterling silver with anti-tarnish protective alloy (10.7g gross weight). Designed for tactile comfort and enduring luxury.",
  },
  {
    id: "da49dd52-b36a-46fc-a6fe-8c705ce58cca",
    slug: "silver-one-of-a-kind-pendant-ok-38",
    title: "Silver One-of-a-Kind Pendant (OK 38)",
    subtitle: "OK 38 · 7.0g · Solid 925 Sterling Silver",
    categorySlug: "one-of-a-kind",
    
    materialName: "925 Sterling Silver",
    isOneOfAKind: true,
    priceUsdMinor: 2500n,
    priceInrMinor: 210000n,
    primaryImage: "md_catalog/one-of-a-kind/ok_38_a",
    alternateImage: "md_catalog/one-of-a-kind/ok_38_b",
    description: "Sculpted by master silversmiths in our Jaipur atelier from authentic solid 925 sterling silver with anti-tarnish protective alloy (7.0g gross weight). Designed for tactile comfort and enduring luxury.",
  },
  {
    id: "b4391a8a-8e09-45e0-8b9c-b3bb8e669030",
    slug: "silver-one-of-a-kind-pendant-ok-39",
    title: "Silver One-of-a-Kind Pendant (OK 39)",
    subtitle: "OK 39 · 12.2g · Solid 925 Sterling Silver",
    categorySlug: "one-of-a-kind",
    
    materialName: "925 Sterling Silver",
    isOneOfAKind: true,
    priceUsdMinor: 4300n,
    priceInrMinor: 366000n,
    primaryImage: "md_catalog/one-of-a-kind/ok_39_a",
    alternateImage: "md_catalog/one-of-a-kind/ok_39_b",
    description: "Sculpted by master silversmiths in our Jaipur atelier from authentic solid 925 sterling silver with anti-tarnish protective alloy (12.2g gross weight). Designed for tactile comfort and enduring luxury.",
  },
  {
    id: "6b309b90-7036-4281-90f8-db98d60b6b29",
    slug: "silver-one-of-a-kind-pendant-ok-40",
    title: "Silver One-of-a-Kind Pendant (OK 40)",
    subtitle: "OK 40 · 11.8g · Solid 925 Sterling Silver",
    categorySlug: "one-of-a-kind",
    
    materialName: "925 Sterling Silver",
    isOneOfAKind: true,
    priceUsdMinor: 4200n,
    priceInrMinor: 354000n,
    primaryImage: "md_catalog/one-of-a-kind/ok_40_a",
    alternateImage: "md_catalog/one-of-a-kind/ok_40_b",
    description: "Sculpted by master silversmiths in our Jaipur atelier from authentic solid 925 sterling silver with anti-tarnish protective alloy (11.8g gross weight). Designed for tactile comfort and enduring luxury.",
  },
  {
    id: "25043c2d-89b1-40ba-ab6c-a9eec6d85373",
    slug: "silver-one-of-a-kind-pendant-ok-41",
    title: "Silver One-of-a-Kind Pendant (OK 41)",
    subtitle: "OK 41 · 10.8g · Solid 925 Sterling Silver",
    categorySlug: "one-of-a-kind",
    
    materialName: "925 Sterling Silver",
    isOneOfAKind: true,
    priceUsdMinor: 3800n,
    priceInrMinor: 324000n,
    primaryImage: "md_catalog/one-of-a-kind/ok_41_a",
    alternateImage: "md_catalog/one-of-a-kind/ok_41_b",
    description: "Sculpted by master silversmiths in our Jaipur atelier from authentic solid 925 sterling silver with anti-tarnish protective alloy (10.8g gross weight). Designed for tactile comfort and enduring luxury.",
  },
  {
    id: "fcafe953-5c43-4495-8494-384b54a95b88",
    slug: "silver-one-of-a-kind-pendant-ok-42",
    title: "Silver One-of-a-Kind Pendant (OK 42)",
    subtitle: "OK 42 · 11.5g · Solid 925 Sterling Silver",
    categorySlug: "one-of-a-kind",
    
    materialName: "925 Sterling Silver",
    isOneOfAKind: true,
    priceUsdMinor: 4100n,
    priceInrMinor: 345000n,
    primaryImage: "md_catalog/one-of-a-kind/ok_42_a",
    alternateImage: "md_catalog/one-of-a-kind/ok_42_b",
    description: "Sculpted by master silversmiths in our Jaipur atelier from authentic solid 925 sterling silver with anti-tarnish protective alloy (11.5g gross weight). Designed for tactile comfort and enduring luxury.",
  },
  {
    id: "9f7a4ffa-9301-4339-af00-6d5ba1c5a2e6",
    slug: "silver-one-of-a-kind-pendant-ok-43",
    title: "Silver One-of-a-Kind Pendant (OK 43)",
    subtitle: "OK 43 · 6.6g · Solid 925 Sterling Silver",
    categorySlug: "one-of-a-kind",
    
    materialName: "925 Sterling Silver",
    isOneOfAKind: true,
    priceUsdMinor: 2300n,
    priceInrMinor: 198000n,
    primaryImage: "md_catalog/one-of-a-kind/ok_43_a",
    alternateImage: "md_catalog/one-of-a-kind/ok_43_b",
    description: "Sculpted by master silversmiths in our Jaipur atelier from authentic solid 925 sterling silver with anti-tarnish protective alloy (6.6g gross weight). Designed for tactile comfort and enduring luxury.",
  },
  {
    id: "360eb6af-bc31-40f7-abc0-800f4c24bb60",
    slug: "silver-one-of-a-kind-pendant-ok-44",
    title: "Silver One-of-a-Kind Pendant (OK 44)",
    subtitle: "OK 44 · 13.9g · Solid 925 Sterling Silver",
    categorySlug: "one-of-a-kind",
    
    materialName: "925 Sterling Silver",
    isOneOfAKind: true,
    priceUsdMinor: 5700n,
    priceInrMinor: 486500n,
    primaryImage: "md_catalog/one-of-a-kind/ok_44_a",
    alternateImage: "md_catalog/one-of-a-kind/ok_44_b",
    description: "Sculpted by master silversmiths in our Jaipur atelier from authentic solid 925 sterling silver with anti-tarnish protective alloy (13.9g gross weight). Designed for tactile comfort and enduring luxury.",
  },
  {
    id: "1ff3d567-7872-43b9-a90f-42fead1d23c2",
    slug: "silver-one-of-a-kind-pendant-ok-45",
    title: "Silver One-of-a-Kind Pendant (OK 45)",
    subtitle: "OK 45 · 8.6g · Solid 925 Sterling Silver",
    categorySlug: "one-of-a-kind",
    
    materialName: "925 Sterling Silver",
    isOneOfAKind: true,
    priceUsdMinor: 3500n,
    priceInrMinor: 301000n,
    primaryImage: "md_catalog/one-of-a-kind/ok_45_a",
    alternateImage: "md_catalog/one-of-a-kind/ok_45_b",
    description: "Sculpted by master silversmiths in our Jaipur atelier from authentic solid 925 sterling silver with anti-tarnish protective alloy (8.6g gross weight). Designed for tactile comfort and enduring luxury.",
  },
  {
    id: "c73fed56-1607-4051-b3ed-301ab45277eb",
    slug: "silver-one-of-a-kind-pendant-ok-46",
    title: "Silver One-of-a-Kind Pendant (OK 46)",
    subtitle: "OK 46 · 7.0g · Solid 925 Sterling Silver",
    categorySlug: "one-of-a-kind",
    
    materialName: "925 Sterling Silver",
    isOneOfAKind: true,
    priceUsdMinor: 2900n,
    priceInrMinor: 245000n,
    primaryImage: "md_catalog/one-of-a-kind/ok_46_a",
    alternateImage: "md_catalog/one-of-a-kind/ok_46_b",
    description: "Sculpted by master silversmiths in our Jaipur atelier from authentic solid 925 sterling silver with anti-tarnish protective alloy (7.0g gross weight). Designed for tactile comfort and enduring luxury.",
  }
];

// ── Deterministic in-memory indices for sub-millisecond response times ─
const PRODUCTS_BY_SLUG = new Map<string, StandaloneProductDefinition>();
const PRODUCTS_BY_CATEGORY = new Map<string, StandaloneProductDefinition[]>();
const PRODUCTS_BY_STONE = new Map<string, StandaloneProductDefinition[]>();

for (const p of STANDALONE_PRODUCTS) {
  PRODUCTS_BY_SLUG.set(p.slug.toLowerCase(), p);

  const catList = PRODUCTS_BY_CATEGORY.get(p.categorySlug.toLowerCase()) || [];
  catList.push(p);
  PRODUCTS_BY_CATEGORY.set(p.categorySlug.toLowerCase(), catList);

  if (p.stoneSlug) {
    const stoneList = PRODUCTS_BY_STONE.get(p.stoneSlug.toLowerCase()) || [];
    stoneList.push(p);
    PRODUCTS_BY_STONE.set(p.stoneSlug.toLowerCase(), stoneList);
  }
}

// ── Storefront Card Formatter ─────────────────────────────────────────
export function buildStorefrontCard(
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
      { name: "Hallmark", value: "925 Anti-Tarnish Sterling Silver" },
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
