export interface HeroSlideConfig {
  id: string;
  tag: string;
  subhead: string;
  title: string;
  standfirst: string;
  ctaText: string;
  ctaHref: string;
  imageSrc: string;
  imageAlt: string;
}

export interface TrustPillarConfig {
  id: string;
  label: string;
  detail: string;
  icon: string;
}

export interface TestimonialConfig {
  id: string;
  clientName: string;
  location: string;
  rating: number;
  reviewText: string;
  quote?: string;
  piecePurchased: string;
  dateStr?: string;
}

export interface FooterLinkItem {
  label: string;
  href: string;
}

export interface FooterColumnConfig {
  heading: string;
  links: FooterLinkItem[];
}

export interface StorefrontCustomizationConfig {
  // 1. Header & Top Ribbon
  announcementVisible: boolean;
  announcementText: string;
  announcementLink: string;
  announcementBgColor: string;
  announcementTextColor: string;
  ribbonProvenanceTag: string;
  ribbonRightTag: string;
  headerLogoMode: "wordmark" | "monogram" | "custom";
  headerCustomLogoUrl: string;
  headerSticky: boolean;
  headerShowSearch: boolean;
  headerShowAccount: boolean;
  headerShowCurrency: boolean;

  // 2. Hero Slider
  heroSlides: HeroSlideConfig[];
  heroAutoIntervalMs: number;
  heroAutoplayEnabled: boolean;
  heroTextAlign: "left" | "center";
  heroOverlayOpacity: number;

  // 3. Trust Pillars
  trustPillarsVisible: boolean;
  trustPillars: TrustPillarConfig[];
  foundingYear: string;
  silverPurityBadge: string;
  hallmarkText: string;
  guaranteeBadgeTitle: string;

  // 4. Homepage Sections & Editorial Story
  sectionHeroVisible: boolean;
  sectionTrustVisible: boolean;
  sectionCategoriesVisible: boolean;
  sectionSignatureVisible: boolean;
  sectionFeaturedVisible?: boolean;
  sectionStonesVisible: boolean;
  sectionHeritageVisible: boolean;
  sectionBespokeVisible?: boolean;
  sectionTestimonialsVisible: boolean;
  sectionNewsletterVisible: boolean;
  categoriesSectionTitle: string;
  categoriesSectionSubtitle: string;
  signatureSectionTitle: string;
  signatureSectionSubtitle: string;
  stonesSectionTitle: string;
  stonesSectionSubtitle: string;
  heritageStoryHeadline: string;
  heritageStoryStandfirst: string;
  heritageStoryQuote: string;
  heritageStorySignature: string;
  heritageStoryImageUrl: string;
  testimonials: TestimonialConfig[];
  newsletterHeadline: string;
  newsletterSubtitle: string;
  newsletterButtonText: string;

  // 5. Navigation
  navShowDiamondSeparator: boolean;
  navMobileRailVisible: boolean;
  customNavHighlightLabel: string;
  customNavHighlightSlug: string;

  // 6. Checkout & Bank Transfer
  bankAccountName: string;
  bankName: string;
  bankAccountNumber: string;
  bankIfscCode: string;
  bankAccountType: string;
  bankBranchName: string;
  bankBranchAddress: string;
  bankUpiId: string;
  enableBankTransfer: boolean;
  enableRazorpay: boolean;
  enableStripe: boolean;
  enableCod: boolean;
  codMaxAmount: number;
  freeShippingThresholdInr: number;
  freeShippingThresholdUsd: number;

  // 7. Atelier Contact & WhatsApp
  atelierAddressName: string;
  atelierAddressLine1: string;
  atelierAddressLine2: string;
  atelierCity: string;
  atelierState: string;
  atelierPostalCode: string;
  atelierCountry: string;
  directPhonePrimary: string;
  directPhoneSecondary: string;
  supportEmail: string;
  wholesaleEmail: string;
  whatsappConciergeNumber: string;
  whatsappConciergeGreeting: string;
  atelierHours: string;
  gmailUser: string;
  gmailAppPassword: string;

  // 8. Footer, Hallmarks & Social
  footerBrandStatement: string;
  footerCopyrightNotice: string;
  footerHallmarkStrip: string;
  socialInstagramUrl: string;
  socialFacebookUrl: string;
  socialPinterestUrl: string;
  socialYoutubeUrl: string;
  socialTwitterUrl: string;
  deliveryPromiseText: string;
  returnPolicySummary: string;

  // 9. Global Styling & Custom Code
  colorAccentGold: string;
  colorGreenBlack: string;
  colorEmeraldDeep: string;
  colorBgIvory: string;
  luxuryCursorEnabled: boolean;
  customCss: string;
  customHeadHtml: string;
  customBodyScripts: string;

  // 10. Seasonal Notices & Policies
  seasonalNoticeEnabled: boolean;
  seasonalNoticeTitle: string;
  seasonalNoticeMessage: string;
  seasonalNoticeDismissible: boolean;
  maintenanceModeEnabled: boolean;
  maintenanceModeMessage: string;

  // 11. SEO & Metadata
  seoGlobalTitleTemplate: string;
  seoDefaultDescriptionUs: string;
  seoDefaultDescriptionIn: string;
  seoDefaultOgImage: string;
  seoTwitterHandle: string;
}

export const DEFAULT_STOREFRONT_CONFIG: StorefrontCustomizationConfig = {
  // 1. Header & Top Ribbon
  announcementVisible: true,
  announcementText: "COMPLIMENTARY INSURED COURIER ON ALL ORDERS",
  announcementLink: "/our-story",
  announcementBgColor: "var(--md-forest, #062319)",
  announcementTextColor: "var(--md-champagne, #e8d8b9)",
  ribbonProvenanceTag: "✦ EST. 1961 JAIPUR",
  ribbonRightTag: "",
  headerLogoMode: "wordmark",
  headerCustomLogoUrl: "",
  headerSticky: true,
  headerShowSearch: true,
  headerShowAccount: true,
  headerShowCurrency: true,

  // 2. Hero Slider
  heroSlides: [
    {
      id: "slide-1",
      tag: "ATELIER SIGNATURE · EST. 1961 JAIPUR",
      subhead: "Unheated Mineral Sovereignty",
      title: "Natural Gems, Cold-Forged in Pure 925 Silver.",
      standfirst:
        "Every master ring, pendant, and talisman is hand-fabricated by master silversmiths using generational lost-wax methods and conflict-free courtly stones.",
      ctaText: "Acquire Selected Work",
      ctaHref: "/rings",
      imageSrc: "/images/hero/campaign_hero_1.jpg",
      imageAlt: "Millennium Designs Signature High Jewellery Archive",
    },
    {
      id: "slide-2",
      tag: "THE SOVEREIGN MOONSTONE SUITE",
      subhead: "Blue Flash Sri Lankan Adularescence",
      title: "Celestial Light, Set in Sculptural Silver.",
      standfirst:
        "Natural unheated cabochons hand-selected for hypnotic optical blue schiller. Each bezel is hand-burnished to mirror polish.",
      ctaText: "Explore Moonstones",
      ctaHref: "/moonstone",
      imageSrc: "/images/hero/campaign_hero_2.jpg",
      imageAlt: "Natural Blue Flash Moonstone High Jewellery Collection",
    },
    {
      id: "slide-3",
      tag: "THE REGAL PENDANT VAULT",
      subhead: "Handcrafted Statement Talismans",
      title: "Crown Jewels for Modern Connoisseurs.",
      standfirst:
        "Archival Jaipur filigree wirework cradling vibrant emeralds, amethysts, and tourmalines in heavy sterling mounts.",
      ctaText: "View Pendants",
      ctaHref: "/pendants",
      imageSrc: "/images/hero/campaign_hero_3.jpg",
      imageAlt: "Imperial Sterling Silver Statement Gemstone Pendants",
    },
  ],
  heroAutoIntervalMs: 5500,
  heroAutoplayEnabled: true,
  heroTextAlign: "left",
  heroOverlayOpacity: 0.45,

  // 3. Trust Pillars
  trustPillarsVisible: true,
  trustPillars: [
    { id: "tp-1", label: "EST. 1961 JAIPUR", detail: "100% In-House Atelier", icon: "✦" },
    { id: "tp-2", label: "SOLID 925 STERLING SILVER", detail: "Permanent Anti-Tarnish Alloy", icon: "✦" },
    { id: "tp-3", label: "NATURAL COURTLY GEMSTONES", detail: "Unheated Mineral Character", icon: "✦" },
    { id: "tp-4", label: "INSURED WORLDWIDE DELIVERY", detail: "Hallmarked & Certified", icon: "✦" },
  ],
  foundingYear: "1961",
  silverPurityBadge: "925 Sterling Silver",
  hallmarkText: "Jaipur Atelier Hallmarked",
  guaranteeBadgeTitle: "Certified Anti-Tarnish Alloy",

  // 4. Homepage Sections & Editorial Story
  sectionHeroVisible: true,
  sectionTrustVisible: true,
  sectionCategoriesVisible: true,
  sectionSignatureVisible: true,
  sectionFeaturedVisible: true,
  sectionStonesVisible: true,
  sectionHeritageVisible: true,
  sectionBespokeVisible: true,
  sectionTestimonialsVisible: false,
  sectionNewsletterVisible: true,
  categoriesSectionTitle: "The Curated Collections",
  categoriesSectionSubtitle: "Explore our archive of master-crafted sterling silver designs by category.",
  signatureSectionTitle: "Signature Creations",
  signatureSectionSubtitle: "Our benchmark high jewellery, hallmarked with the atelier emblem.",
  stonesSectionTitle: "The Gemstone Archive",
  stonesSectionSubtitle: "Natural, unheated, courtly minerals certified by veteran gemmologists.",
  heritageStoryHeadline: "Lost-Wax Casting & Micro-Prong Setting",
  heritageStoryStandfirst:
    "Every master model is shaped in wax, cast in pure anti-tarnish 925 sterling silver, and hand-set with natural untreated minerals entirely inside our Jaipur atelier.",
  heritageStoryQuote:
    "We do not plate base metals, nor do we set laboratory simulants. Every stone is earth-mined; every setting is solid silver.",
  heritageStorySignature: "Master Jeweller, Millennium Designs Atelier, Jaipur",
  heritageStoryImageUrl: "/images/story/atelier_bench_silversmith.jpg",
  testimonials: [
    {
      id: "t-1",
      clientName: "Eleanor Vance",
      location: "Mayfair, London",
      rating: 5,
      reviewText:
        "The blue adularescence in the Sovereign Moonstone ring is extraordinary. The silver work feels heavy, balanced, and unmistakably bespoke.",
      quote:
        "The blue adularescence in the Sovereign Moonstone ring is extraordinary. The silver work feels heavy, balanced, and unmistakably bespoke.",
      piecePurchased: "Sovereign Oval Moonstone Ring",
    },
    {
      id: "t-2",
      clientName: "Devika Singhania",
      location: "South Mumbai",
      rating: 5,
      reviewText:
        "Direct bank transfer payment was smooth, and verification on WhatsApp took under ten minutes. The unheated Zambian emerald pendant arrived beautifully boxed.",
      quote:
        "Direct bank transfer payment was smooth, and verification on WhatsApp took under ten minutes. The unheated Zambian emerald pendant arrived beautifully boxed.",
      piecePurchased: "Raw Emerald Pendant",
    },
    {
      id: "t-3",
      clientName: "Marcus Sterling",
      location: "Upper East Side, New York",
      rating: 5,
      reviewText:
        "Finding true solid 925 sterling jewellery with authentic unheated courtly gems is nearly impossible in New York. Millennium Designs is in a class of its own.",
      quote:
        "Finding true solid 925 sterling jewellery with authentic unheated courtly gems is nearly impossible in New York. Millennium Designs is in a class of its own.",
      piecePurchased: "Archival Lapis Signet Ring",
    },
  ],
  newsletterHeadline: "The Atelier Journal",
  newsletterSubtitle: "Receive private previews of rare mineral acquisitions and seasonal collector releases.",
  newsletterButtonText: "Subscribe",

  // 5. Navigation
  navShowDiamondSeparator: true,
  navMobileRailVisible: true,
  customNavHighlightLabel: "NEW",
  customNavHighlightSlug: "rings",

  // 6. Checkout & Bank Transfer
  bankAccountName: "MILLENNIUM DESIGNS",
  bankName: "ICICI Bank",
  bankAccountNumber: "001205013891",
  bankIfscCode: "ICIC0000012",
  bankAccountType: "Current Account",
  bankBranchName: "Jaipur - C Scheme Branch",
  bankBranchAddress: "C-101, Ridhi Sidhi Complex, Subhash Marg, Ahinsa Circle, C-Scheme, Jaipur, Rajasthan - 302001",
  bankUpiId: "millenniumdesigns@icici",
  enableBankTransfer: true,
  enableRazorpay: true,
  enableStripe: true,
  enableCod: false,
  codMaxAmount: 25000,
  freeShippingThresholdInr: 0,
  freeShippingThresholdUsd: 0,

  // 7. Atelier Contact & WhatsApp
  atelierAddressName: "Millennium Designs Jaipur Atelier",
  atelierAddressLine1: "5, Noor Plaza, Chameliwala Market",
  atelierAddressLine2: "Opp. G.P.O., M.I. Road",
  atelierCity: "Jaipur",
  atelierState: "Rajasthan",
  atelierPostalCode: "302001",
  atelierCountry: "India",
  directPhonePrimary: "+91 98290 56597",
  directPhoneSecondary: "+91 98281 56465",
  supportEmail: "concierge@millenniumdesigns.in",
  wholesaleEmail: "wholesale@millenniumdesigns.in",
  whatsappConciergeNumber: "919829056597",
  whatsappConciergeGreeting:
    "Namaste. I am inquiring about a fine jewellery creation from the Millennium Designs Jaipur atelier archive.",
  atelierHours: "Monday – Saturday: 11:00 AM – 7:30 PM IST (Sundays by private appointment)",
  gmailUser: "",
  gmailAppPassword: "",

  // 8. Footer, Hallmarks & Social
  footerBrandStatement:
    "Millennium Designs is a courtly jewellery atelier established in Johari Bazaar, Jaipur in 1961. We specialize exclusively in anti-tarnish 925 sterling silver, 14k gold, and unheated natural earth-mined gemstones.",
  footerCopyrightNotice: "MILLENNIUM DESIGNS",
  footerHallmarkStrip: "SOLID 925 STERLING SILVER · PERMANENT ANTI-TARNISH ALLOY · JAIPUR BENCH CRAFTSMANSHIP",
  socialInstagramUrl: "https://instagram.com/millenniumdesigns",
  socialFacebookUrl: "https://facebook.com/millenniumdesigns",
  socialPinterestUrl: "https://pinterest.com/millenniumdesigns",
  socialYoutubeUrl: "https://youtube.com/@millenniumdesigns",
  socialTwitterUrl: "https://twitter.com/millenniumdes",
  deliveryPromiseText: "Complimentary Insured Courier · Signature Required",
  returnPolicySummary: "7-day return policy for unused creations with original hallmarks intact.",

  // 9. Global Styling & Custom Code
  colorAccentGold: "#c9a86a",
  colorGreenBlack: "#062319",
  colorEmeraldDeep: "#051811",
  colorBgIvory: "#fbf9f5",
  luxuryCursorEnabled: true,
  customCss: "",
  customHeadHtml: "",
  customBodyScripts: "",

  // 10. Seasonal Notices & Policies
  seasonalNoticeEnabled: false,
  seasonalNoticeTitle: "Atelier Annual Holiday Salon Notice",
  seasonalNoticeMessage:
    "Commissions placed between October 20 and November 5 will receive priority dispatch with complimentary insured express courier.",
  seasonalNoticeDismissible: true,
  maintenanceModeEnabled: false,
  maintenanceModeMessage:
    "The atelier website is undergoing scheduled refinement. Please contact our WhatsApp concierge directly for bespoke inquiries.",

  // 11. SEO & Metadata
  seoGlobalTitleTemplate: "%s · Millennium Designs | Jaipur Bench High Jewellery",
  seoDefaultDescriptionUs:
    "Handcrafted in our Jaipur atelier since 1961. Solid 925 sterling silver, unheated natural gemstones, and bespoke commissions with insured worldwide courier.",
  seoDefaultDescriptionIn:
    "Courtly fine jewellery, natural gemstones, and solid 925 sterling silver handcrafted in Johari Bazaar, Jaipur since 1961.",
  seoDefaultOgImage: "/images/brand/crest-gold.svg",
  seoTwitterHandle: "@millenniumdes",
};
