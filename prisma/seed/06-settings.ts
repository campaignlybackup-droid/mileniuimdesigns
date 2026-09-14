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
    value: "Something went wrong",
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

  // ── Branded empty and error states (10 §5.6 owns the voice, 08 §4.4 owns storage) ──
  // 1. not_found
  {
    key: "copy.state.not_found.headline",
    value: "Nothing found",
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

  // 2. gone (410)
  {
    key: "copy.state.gone.headline",
    value: "No longer available",
    valueType: "string",
    groupKey: "copy_states",
    label: "410 gone — headline",
  },
  {
    key: "copy.state.gone.body",
    value: "This piece is no longer available.",
    valueType: "string",
    groupKey: "copy_states",
    label: "410 gone — body",
  },
  {
    key: "copy.state.gone.action",
    value: "SEE SIMILAR PIECES",
    valueType: "string",
    groupKey: "copy_states",
    label: "410 gone — action",
  },

  // 3. server_error (500)
  {
    key: "copy.state.server_error.headline",
    value: "Something went wrong",
    valueType: "string",
    groupKey: "copy_states",
    label: "500 server error — headline",
  },
  {
    key: "copy.state.server_error.body",
    value: "We have been notified. Please try again shortly.",
    valueType: "string",
    groupKey: "copy_states",
    label: "500 server error — body",
  },
  {
    key: "copy.state.server_error.action",
    value: "RETURN HOME",
    valueType: "string",
    groupKey: "copy_states",
    label: "500 server error — action",
  },

  // 4. global_error
  {
    key: "copy.state.global_error.headline",
    value: "Something went wrong",
    valueType: "string",
    groupKey: "copy_states",
    label: "Global error — headline",
  },
  {
    key: "copy.state.global_error.body",
    value: "We have been notified. Please reload the page.",
    valueType: "string",
    groupKey: "copy_states",
    label: "Global error — body",
  },
  {
    key: "copy.state.global_error.action",
    value: "RELOAD",
    valueType: "string",
    groupKey: "copy_states",
    label: "Global error — action",
  },

  // 5. cart_empty
  {
    key: "copy.state.cart_empty.headline",
    value: "Your bag is waiting.",
    valueType: "string",
    groupKey: "copy_states",
    label: "Empty bag — headline",
  },
  {
    key: "copy.state.cart_empty.body",
    value: "",
    valueType: "string",
    groupKey: "copy_states",
    label: "Empty bag — body",
  },
  {
    key: "copy.state.cart_empty.action",
    value: "EXPLORE THE COLLECTION",
    valueType: "string",
    groupKey: "copy_states",
    label: "Empty bag — action",
  },

  // 6. wishlist_empty
  {
    key: "copy.state.wishlist_empty.headline",
    value: "Your collection begins here.",
    valueType: "string",
    groupKey: "copy_states",
    label: "Empty wishlist — headline",
  },
  {
    key: "copy.state.wishlist_empty.body",
    value: "Select the outline heart on any piece to keep it here.",
    valueType: "string",
    groupKey: "copy_states",
    label: "Empty wishlist — body",
  },
  {
    key: "copy.state.wishlist_empty.action",
    value: "EXPLORE THE COLLECTION",
    valueType: "string",
    groupKey: "copy_states",
    label: "Empty wishlist — action",
  },

  // 7. search_empty
  {
    key: "copy.state.search_empty.headline",
    value: "Nothing matched your search.",
    valueType: "string",
    groupKey: "copy_states",
    label: "No search results — headline",
  },
  {
    key: "copy.state.search_empty.body",
    value: "No pieces match your query.",
    valueType: "string",
    groupKey: "copy_states",
    label: "No search results — body",
  },
  {
    key: "copy.state.search_empty.action",
    value: "",
    valueType: "string",
    groupKey: "copy_states",
    label: "No search results — action",
  },

  // 8. filters_empty
  {
    key: "copy.state.filters_empty.headline",
    value: "Nothing matched these filters.",
    valueType: "string",
    groupKey: "copy_states",
    label: "Filtered empty — headline",
  },
  {
    key: "copy.state.filters_empty.body",
    value: "",
    valueType: "string",
    groupKey: "copy_states",
    label: "Filtered empty — body",
  },
  {
    key: "copy.state.filters_empty.action",
    value: "CLEAR FILTERS",
    valueType: "string",
    groupKey: "copy_states",
    label: "Filtered empty — action",
  },

  // 9. out_of_stock
  {
    key: "copy.state.out_of_stock.headline",
    value: "Currently unavailable",
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
    value: "NOTIFY ME",
    valueType: "string",
    groupKey: "copy_states",
    label: "Out of stock — action",
  },

  // 10. sold
  {
    key: "copy.state.sold.headline",
    value: "Sold",
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

  // 11. made_to_order
  {
    key: "copy.state.made_to_order.headline",
    value: "Made to order",
    valueType: "string",
    groupKey: "copy_states",
    label: "Made to order — headline",
  },
  {
    key: "copy.state.made_to_order.body",
    value: "",
    valueType: "string",
    groupKey: "copy_states",
    label: "Made to order — body",
  },
  {
    key: "copy.state.made_to_order.action",
    value: "",
    valueType: "string",
    groupKey: "copy_states",
    label: "Made to order — action",
  },

  // 12. unavailable_in_market
  {
    key: "copy.state.unavailable_in_market.headline",
    value: "Not sold in this market",
    valueType: "string",
    groupKey: "copy_states",
    label: "Unavailable in market — headline",
  },
  {
    key: "copy.state.unavailable_in_market.body",
    value: "",
    valueType: "string",
    groupKey: "copy_states",
    label: "Unavailable in market — body",
  },
  {
    key: "copy.state.unavailable_in_market.action",
    value: "",
    valueType: "string",
    groupKey: "copy_states",
    label: "Unavailable in market — action",
  },

  // 13. insufficient_stock
  {
    key: "copy.state.insufficient_stock.headline",
    value: "This piece has just been taken.",
    valueType: "string",
    groupKey: "copy_states",
    label: "Insufficient stock — headline",
  },
  {
    key: "copy.state.insufficient_stock.body",
    value: "It has been removed from your bag.",
    valueType: "string",
    groupKey: "copy_states",
    label: "Insufficient stock — body",
  },
  {
    key: "copy.state.insufficient_stock.action",
    value: "REVIEW BAG",
    valueType: "string",
    groupKey: "copy_states",
    label: "Insufficient stock — action",
  },

  // 14. price_changed
  {
    key: "copy.state.price_changed.headline",
    value: "Prices have been updated.",
    valueType: "string",
    groupKey: "copy_states",
    label: "Price changed — headline",
  },
  {
    key: "copy.state.price_changed.body",
    value: "Please review your bag before continuing.",
    valueType: "string",
    groupKey: "copy_states",
    label: "Price changed — body",
  },
  {
    key: "copy.state.price_changed.action",
    value: "REVIEW BAG",
    valueType: "string",
    groupKey: "copy_states",
    label: "Price changed — action",
  },

  // 15. market_changed
  {
    key: "copy.state.market_changed.headline",
    value: "Your bag has been repriced for {market}.",
    valueType: "string",
    groupKey: "copy_states",
    label: "Market changed — headline",
  },
  {
    key: "copy.state.market_changed.body",
    value: "",
    valueType: "string",
    groupKey: "copy_states",
    label: "Market changed — body",
  },
  {
    key: "copy.state.market_changed.action",
    value: "CONTINUE",
    valueType: "string",
    groupKey: "copy_states",
    label: "Market changed — action",
  },

  // 16. payments_unconfigured
  {
    key: "copy.state.payments_unconfigured.headline",
    value: "Payment is not yet available here.",
    valueType: "string",
    groupKey: "copy_states",
    label: "Payments unconfigured — headline",
  },
  {
    key: "copy.state.payments_unconfigured.body",
    value: "Online payment is not yet available for this region. No order has been created.",
    valueType: "string",
    groupKey: "copy_states",
    label: "Payments unconfigured — body",
  },
  {
    key: "copy.state.payments_unconfigured.action",
    value: "RETURN TO BAG",
    valueType: "string",
    groupKey: "copy_states",
    label: "Payments unconfigured — action",
  },

  // 17. payment_pending
  {
    key: "copy.state.payment_pending.headline",
    value: "We are still confirming your payment.",
    valueType: "string",
    groupKey: "copy_states",
    label: "Payment pending — headline",
  },
  {
    key: "copy.state.payment_pending.body",
    value: "You will receive an email as soon as it completes.",
    valueType: "string",
    groupKey: "copy_states",
    label: "Payment pending — body",
  },
  {
    key: "copy.state.payment_pending.action",
    value: "CHECK AGAIN",
    valueType: "string",
    groupKey: "copy_states",
    label: "Payment pending — action",
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
