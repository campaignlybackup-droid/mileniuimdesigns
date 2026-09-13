/**
 * Product completeness, SEO scoring and the publish gate — 03 §1.5, §1.6, §1.7.
 *
 * A SCORE IS ADVICE; THE GATE IS A RULE. They are separate deterministic functions over
 * the same gathered shape, because conflating them produces the worst of both: either a
 * product that cannot be published for want of a care note, or a "100%" that means nothing.
 *
 * Pure — no I/O. The caller gathers `ProductForScoring` in one query. That is what makes
 * this testable now, before pricing and inventory exist, and what stops the scoring logic
 * from quietly becoming fifteen more round trips.
 */

export type ProductForScoring = {
  title: string;
  descriptionWordCount: number;
  careWordCount: number;
  mediaCount: number;
  heroCount: number;
  mediaMissingAltCount: number;
  primaryCategoryId: string | null;
  hasMatchingCategoryRow: boolean;
  /** The primary category's slug, for the non-stone exemption. */
  primaryCategorySlug: string | null;
  stoneCount: number;
  primaryStoneCount: number;
  liveVariantCount: number;
  variantsWithMaterials: number;
  variantsWithPrimaryMaterial: number;
  variantsWithValidSku: number;
  variantsWithWeight: number;
  trackedVariantCount: number;
  trackedVariantsWithInventory: number | null;
  tagCount: number;
  requiredAttributeCount: number;
  satisfiedRequiredAttributeCount: number;
  /**
   * Market codes this product resolves a price in, and the active markets it must cover.
   *
   * `null` means NOT YET EVALUABLE — the `prices` table arrives at P10. It is null rather
   * than an empty array on purpose: an empty array means "priced in no market", which is
   * a real and different failure.
   */
  pricedMarketCodes: string[] | null;
  activeMarketCodes: string[];
};

export type CompletenessCheck = {
  key: string;
  label: string;
  weight: number;
  passed: boolean;
  /** What to do about it, or null when passed. */
  hint: string | null;
};

export type CompletenessResult = { score: number; checks: CompletenessCheck[] };

export type PublishBlocker = { key: string; label: string; hint: string };

/** Categories where a stone is not expected. CHAINS is plain metal (03 §1.6 check 7). */
const NON_STONE_CATEGORIES = new Set(["chains"]);

/** 03 §2.6. A readable, structured SKU rather than a free-text field. */
export const SKU_PATTERN = /^[A-Z0-9]{2,6}(-[A-Z0-9]{1,6}){1,4}$/;

export function scoreProduct(p: ProductForScoring): CompletenessResult {
  const checks: CompletenessCheck[] = [
    check("title", "Title", 8, p.title.trim().length >= 3, "Give the piece a name of at least 3 characters."),
    check("description", "Description", 10, p.descriptionWordCount >= 40, "Write at least 40 words."),
    check("gallery", "Gallery", 12, p.mediaCount >= 3, "Add at least 3 images."),
    check("hero", "Hero image", 6, p.heroCount === 1, p.heroCount === 0 ? "Choose a hero image." : "More than one hero image is set."),
    check("alt_text", "Image alt text", 4, p.mediaMissingAltCount === 0, `${p.mediaMissingAltCount} image(s) have no alt text.`),
    check(
      "primary_category", "Primary category", 6,
      p.primaryCategoryId !== null && p.hasMatchingCategoryRow,
      "Set a primary category, and make sure the product is linked to it.",
    ),
    check(
      "stones", "Stones", 6,
      // A chain has no stone, and marking it incomplete forever is how a score stops
      // being read.
      NON_STONE_CATEGORIES.has(p.primaryCategorySlug ?? "")
        ? true
        : p.stoneCount >= 1 && p.primaryStoneCount === 1,
      "Link at least one stone and mark exactly one as primary.",
    ),
    check(
      "materials", "Materials", 6,
      p.liveVariantCount > 0 &&
        p.variantsWithMaterials === p.liveVariantCount &&
        p.variantsWithPrimaryMaterial === p.liveVariantCount,
      "Every variant needs at least one material with exactly one marked primary.",
    ),
    pricedCheck(p),
    check("skus", "SKUs", 5, p.liveVariantCount > 0 && p.variantsWithValidSku === p.liveVariantCount, "Every variant needs a SKU in the house format."),
    stockCheck(p),
    check("weights", "Weights", 4, p.liveVariantCount > 0 && p.variantsWithWeight === p.liveVariantCount, "Every variant needs a gross weight."),
    check("tags", "Tags", 3, p.tagCount >= 1, "Add at least one tag."),
    check(
      "required_attributes", "Required attributes", 6,
      p.satisfiedRequiredAttributeCount >= p.requiredAttributeCount,
      `${p.requiredAttributeCount - p.satisfiedRequiredAttributeCount} required attribute(s) are unset.`,
    ),
    check("care", "Care instructions", 4, p.careWordCount >= 15, "Write at least 15 words of care guidance."),
  ];

  const total = checks.reduce((a, c) => a + c.weight, 0);
  const earned = checks.reduce((a, c) => a + (c.passed ? c.weight : 0), 0);
  // Integer, and rounded DOWN: a product showing 100% must actually pass everything.
  return { score: Math.floor((earned / total) * 100), checks };
}

function pricedCheck(p: ProductForScoring): CompletenessCheck {
  if (p.pricedMarketCodes === null) {
    // Not evaluable: `prices` arrives at P10. Reported honestly rather than silently
    // passing — a check that passes because its table does not exist is a lie that
    // becomes true-looking the day the table appears.
    return {
      key: "priced_all_markets",
      label: "Priced in every market",
      weight: 14,
      passed: false,
      hint: "Pricing is not available in this build (arrives at P10).",
    };
  }
  const priced = new Set(p.pricedMarketCodes);
  const missing = p.activeMarketCodes.filter((m) => !priced.has(m));
  return {
    key: "priced_all_markets",
    label: "Priced in every market",
    weight: 14,
    passed: missing.length === 0 && p.activeMarketCodes.length > 0,
    hint: missing.length ? `No price in: ${missing.join(", ")}.` : null,
  };
}

function stockCheck(p: ProductForScoring): CompletenessCheck {
  if (p.trackedVariantsWithInventory === null) {
    return {
      key: "stock", label: "Stock records", weight: 6, passed: false,
      hint: "Inventory is not available in this build (arrives at P18).",
    };
  }
  return {
    key: "stock", label: "Stock records", weight: 6,
    passed: p.trackedVariantsWithInventory >= p.trackedVariantCount,
    hint: "Every tracked variant needs an inventory record.",
  };
}

function check(key: string, label: string, weight: number, passed: boolean, hint: string): CompletenessCheck {
  return { key, label, weight, passed, hint: passed ? null : hint };
}

/**
 * The publish gate.
 *
 * A deliberately SHORT list. `110` in the brief is explicit: do not prevent publishing for
 * every optional field — distinguish required, recommended and optional. A gate that
 * refuses a product for want of a care note is a gate people learn to route around.
 *
 * These five are the ones where publishing anyway produces a broken customer experience:
 * an unnamed product, one with no image, one that is unroutable, one that cannot be
 * ordered, and one missing an attribute an editor explicitly marked required.
 */
const BLOCKING_KEYS = new Set([
  "title", "hero", "primary_category", "skus", "required_attributes",
]);

/**
 * Blockers that ACTIVATE once their table exists.
 *
 * `priced_all_markets` is the most consequential check in the list — a published product
 * with no price in a market is an indexable page with a dead add-to-bag — and it MUST
 * block once `prices` exists at P10. It cannot block now, because nothing can satisfy it.
 *
 * > **NEEDS INPUT / ARCHITECTURE:** 03 §1.6's table marks blockers with a "P" column that
 * > the written table does not actually carry, so this set is a decision rather than a
 * > transcription. It is worth one review before P10.
 */
export const DEFERRED_BLOCKING_KEYS = new Set(["priced_all_markets", "stock"]);

export function getPublishBlockers(p: ProductForScoring): PublishBlocker[] {
  const { checks } = scoreProduct(p);
  return checks
    .filter((c) => {
      if (c.passed) return false;
      if (BLOCKING_KEYS.has(c.key)) return true;
      // A deferred blocker blocks only once it is evaluable.
      if (!DEFERRED_BLOCKING_KEYS.has(c.key)) return false;
      if (c.key === "priced_all_markets") return p.pricedMarketCodes !== null;
      if (c.key === "stock") return p.trackedVariantsWithInventory !== null;
      return false;
    })
    .map((c) => ({ key: c.key, label: c.label, hint: c.hint ?? "Incomplete." }));
}

export type SeoForScoring = {
  seoTitle: string | null;
  seoDescription: string | null;
  slug: string;
  heroHasAlt: boolean;
  descriptionWordCount: number;
  hasOgImage: boolean;
};

export function scoreProductSeo(s: SeoForScoring): CompletenessResult {
  const checks: CompletenessCheck[] = [
    check("seo_title", "SEO title", 25, (s.seoTitle ?? "").trim().length >= 15 && (s.seoTitle ?? "").length <= 60, "Write a 15–60 character title."),
    check("meta_description", "Meta description", 25, (s.seoDescription ?? "").trim().length >= 70 && (s.seoDescription ?? "").length <= 160, "Write a 70–160 character description."),
    check("slug", "Slug", 15, /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s.slug) && s.slug.length <= 72, "Use a lower-case hyphenated slug of 72 characters or fewer."),
    check("image_alt", "Hero alt text", 15, s.heroHasAlt, "Give the hero image alt text."),
    check("body_length", "Body copy", 10, s.descriptionWordCount >= 40, "Write at least 40 words of description."),
    check("og_image", "Share image", 10, s.hasOgImage, "Set a share image, or rely on the hero."),
  ];
  const total = checks.reduce((a, c) => a + c.weight, 0);
  const earned = checks.reduce((a, c) => a + (c.passed ? c.weight : 0), 0);
  return { score: Math.floor((earned / total) * 100), checks };
}
