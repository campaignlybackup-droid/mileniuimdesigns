import type { PrismaClient } from "@/generated/prisma/client";

type SettingSeed = {
  key: string;
  marketCode?: string | null;
  value: unknown;
  valueType: string;
  groupKey: string;
  label: string;
  description?: string;
};

/**
 * Settings — 02 §6, plus the branded error and empty-state copy of 08 §4.4.
 *
 * `copy.error.*` (group `copy_errors`) and `copy.state.*` (group `copy_states`) are two
 * vocabularies and do not overlap. Each state is THREE rows — headline, body, action —
 * not one string, because 10 §5.6 owns the voice and this owns the storage.
 *
 * Nothing here asserts a business fact. Thresholds that would be a commercial decision
 * are seeded NULL and the feature is off until the client names a number.
 */
const SETTINGS: SettingSeed[] = [
  // ── Feature flags ───────────────────────────────────────────────────────────────
  {
    key: "feature.gift_cards_enabled",
    value: false,
    valueType: "boolean",
    groupKey: "features",
    label: "Gift cards",
    description: "Off until the client confirms scope and per-market expiry policy.",
  },
  {
    key: "pricing.enable_hybrid",
    value: false,
    valueType: "boolean",
    groupKey: "features",
    label: "Hybrid pricing",
    description:
      "Calculated base plus a stored per-market adjustment. Off for release 1 (04 §2.2).",
  },

  // ── Security ────────────────────────────────────────────────────────────────────
  // NEEDS INPUT: the figure above which a paid order is held for manual review. 09 §5.1
  // makes 'a figure the client named in writing' a hard launch blocker. NULL = no hold;
  // no number is invented here.
  {
    key: "security.high_value_review_threshold",
    marketCode: "US",
    value: null,
    valueType: "money",
    groupKey: "security",
    label: "High-value review threshold (US)",
    description:
      "Paid orders at or above this are held in pending_review. NULL disables the hold.",
  },
  {
    key: "security.high_value_review_threshold",
    marketCode: "IN",
    value: null,
    valueType: "money",
    groupKey: "security",
    label: "High-value review threshold (India)",
    description:
      "Paid orders at or above this are held in pending_review. NULL disables the hold.",
  },

  // ── Catalogue ───────────────────────────────────────────────────────────────────
  // Not a business fact: a threshold below which a curated facet page is too thin to be
  // worth indexing, named with its default in 03 §4.2. Seeded so a merchandiser can raise
  // it without a deploy, which is the whole reason it is a settings row.
  {
    key: "catalog.curated_facet_min_products",
    value: 4,
    valueType: "number",
    groupKey: "catalog",
    label: "Minimum products for a curated facet page",
    description:
      "Below this, /rings/labradorite is not activated in that market — it would compete with its own parent category. Counted PER MARKET (03 §4.2).",
  },
  {
    key: "catalog.stone_section_min_products",
    value: 1,
    valueType: "number",
    groupKey: "catalog",
    label: "Minimum products for a stone page section",
    description: "A /stones/<slug> jewellery-type section is hidden below this count.",
  },

  // ── Retention ───────────────────────────────────────────────────────────────────
  // NULL means never prune. The safe default: audit rows are evidence, and a retention
  // period is a legal decision, not an engineering one (07 §7.5).
  {
    key: "audit.retention_days",
    value: null,
    valueType: "number",
    groupKey: "retention",
    label: "Audit log retention (days)",
    description: "NULL retains forever. Requires a legal decision.",
  },

  // ── Branded error copy (08 §4.4) ────────────────────────────────────────────────
  {
    key: "copy.error.generic.headline",
    value: "SOMETHING WENT WRONG",
    valueType: "string",
    groupKey: "copy_errors",
    label: "Generic error — headline",
  },
  {
    key: "copy.error.generic.body",
    value: "We have been notified. Please try again shortly.",
    valueType: "string",
    groupKey: "copy_errors",
    label: "Generic error — body",
  },
  {
    key: "copy.error.generic.action",
    value: "RETURN HOME",
    valueType: "string",
    groupKey: "copy_errors",
    label: "Generic error — action",
  },

  // ── Branded empty and error states (10 §5.6 owns the voice) ─────────────────────
  {
    key: "copy.state.not_found.headline",
    value: "NOTHING FOUND",
    valueType: "string",
    groupKey: "copy_states",
    label: "404 — headline",
  },
  {
    key: "copy.state.not_found.body",
    value: "Some pieces are rare. Some pages are simply elsewhere.",
    valueType: "string",
    groupKey: "copy_states",
    label: "404 — body",
  },
  {
    key: "copy.state.not_found.action",
    value: "RETURN HOME",
    valueType: "string",
    groupKey: "copy_states",
    label: "404 — action",
  },

  {
    key: "copy.state.empty_cart.headline",
    value: "YOUR BAG IS WAITING.",
    valueType: "string",
    groupKey: "copy_states",
    label: "Empty bag — headline",
  },
  {
    key: "copy.state.empty_cart.body",
    value: "",
    valueType: "string",
    groupKey: "copy_states",
    label: "Empty bag — body",
  },
  {
    key: "copy.state.empty_cart.action",
    value: "EXPLORE THE COLLECTION",
    valueType: "string",
    groupKey: "copy_states",
    label: "Empty bag — action",
  },

  {
    key: "copy.state.empty_wishlist.headline",
    value: "YOUR COLLECTION BEGINS HERE.",
    valueType: "string",
    groupKey: "copy_states",
    label: "Empty wishlist — headline",
  },
  {
    key: "copy.state.empty_wishlist.body",
    value: "",
    valueType: "string",
    groupKey: "copy_states",
    label: "Empty wishlist — body",
  },
  {
    key: "copy.state.empty_wishlist.action",
    value: "EXPLORE THE COLLECTION",
    valueType: "string",
    groupKey: "copy_states",
    label: "Empty wishlist — action",
  },

  {
    key: "copy.state.no_results.headline",
    value: "NOTHING MATCHED YOUR SEARCH.",
    valueType: "string",
    groupKey: "copy_states",
    label: "No search results — headline",
  },
  {
    key: "copy.state.no_results.body",
    value: "",
    valueType: "string",
    groupKey: "copy_states",
    label: "No search results — body",
  },
  {
    key: "copy.state.no_results.action",
    value: "",
    valueType: "string",
    groupKey: "copy_states",
    label: "No search results — action",
  },

  {
    key: "copy.state.out_of_stock.headline",
    value: "CURRENTLY UNAVAILABLE",
    valueType: "string",
    groupKey: "copy_states",
    label: "Out of stock — headline",
  },
  {
    key: "copy.state.out_of_stock.body",
    value: "",
    valueType: "string",
    groupKey: "copy_states",
    label: "Out of stock — body",
  },
  {
    key: "copy.state.out_of_stock.action",
    value: "",
    valueType: "string",
    groupKey: "copy_states",
    label: "Out of stock — action",
  },

  // AvailabilityBand has five values; `sold` is the one-of-a-kind case and it is NOT the
  // same as out of stock. A sold piece has found its owner and stays visible as archive.
  {
    key: "copy.state.sold.headline",
    value: "SOLD",
    valueType: "string",
    groupKey: "copy_states",
    label: "Sold (one of a kind) — headline",
  },
  {
    key: "copy.state.sold.body",
    value: "This piece has found its owner.",
    valueType: "string",
    groupKey: "copy_states",
    label: "Sold (one of a kind) — body",
  },
  {
    key: "copy.state.sold.action",
    value: "",
    valueType: "string",
    groupKey: "copy_states",
    label: "Sold (one of a kind) — action",
  },
];

export async function seedSettings(db: PrismaClient): Promise<void> {
  for (const s of SETTINGS) {
    const marketCode = s.marketCode ?? null;
    // The natural key is (key, market_code) NULLS NOT DISTINCT, which Prisma cannot
    // express — so find-then-write rather than upsert on a compound unique.
    const existing = await db.setting.findFirst({ where: { key: s.key, marketCode } });
    const data = {
      key: s.key,
      marketCode,
      value: s.value as never,
      valueType: s.valueType,
      groupKey: s.groupKey,
      label: s.label,
      description: s.description ?? null,
      isSecret: false,
    };
    if (existing) {
      // Do NOT overwrite `value`: the client may have edited it in the admin. Only the
      // descriptive metadata converges. A seed that resets a merchant's setting on every
      // deploy is a seed that gets deleted.
      await db.setting.update({
        where: { id: existing.id },
        data: {
          valueType: data.valueType,
          groupKey: data.groupKey,
          label: data.label,
          description: data.description,
        },
      });
    } else {
      await db.setting.create({ data });
    }
  }
}
