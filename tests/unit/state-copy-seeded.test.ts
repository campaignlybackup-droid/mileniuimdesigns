import { describe, expect, it } from "vitest";
import { codeOf } from "../support/source";

/**
 * 08 §4.4, 10 §5.6:
 * All 17 states seeded in prisma/seed/06-settings.ts with headline, body, and action.
 * Headlines must be in sentence case, not ALL CAPS (10 §5.6).
 */

const STATE_KEYS = [
  "not_found",
  "gone",
  "server_error",
  "global_error",
  "cart_empty",
  "wishlist_empty",
  "search_empty",
  "filters_empty",
  "out_of_stock",
  "sold",
  "made_to_order",
  "unavailable_in_market",
  "insufficient_stock",
  "price_changed",
  "market_changed",
  "payments_unconfigured",
  "payment_pending",
] as const;

describe("state copy seeded in settings", () => {
  const seedCode = codeOf("prisma/seed/06-settings.ts");

  for (const stateKey of STATE_KEYS) {
    it(`seeds copy.state.${stateKey}.headline, .body and .action`, () => {
      expect(
        seedCode.includes(`copy.state.${stateKey}.headline`),
        `Missing copy.state.${stateKey}.headline in 06-settings.ts`,
      ).toBe(true);

      expect(
        seedCode.includes(`copy.state.${stateKey}.body`),
        `Missing copy.state.${stateKey}.body in 06-settings.ts`,
      ).toBe(true);

      expect(
        seedCode.includes(`copy.state.${stateKey}.action`),
        `Missing copy.state.${stateKey}.action in 06-settings.ts`,
      ).toBe(true);
    });

    it(`headline for ${stateKey} is in sentence case, not ALL CAPS`, () => {
      // Find the headline row
      const regex = new RegExp(
        `key:\\s*["']copy\\.state\\.${stateKey}\\.headline["'][\\s\\S]*?value:\\s*["']([^"']+)["']`,
      );
      const match = regex.exec(seedCode);
      expect(match, `Could not find headline value for ${stateKey}`).not.toBeNull();

      const headline = match![1];
      // Headline must not be ALL CAPS (if longer than 4 chars, or check uppercase letters ratio)
      const words = headline.split(/\s+/).filter((w) => w.length > 1);
      const allUpper = words.every((w) => w === w.toUpperCase() && /[A-Z]/.test(w));

      expect(
        allUpper,
        `Headline '${headline}' for '${stateKey}' is in ALL CAPS. 10 §5.6 requires sentence case.`,
      ).toBe(false);
    });
  }
});
