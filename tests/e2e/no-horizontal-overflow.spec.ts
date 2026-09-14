import { test, expect } from "@playwright/test";

/**
 * 09 §1.2 P15 exit criterion (d), 10 §8.1:
 *
 * "Zero horizontal overflow at all 10 design widths (10 §8.1) on every route class —
 * document.scrollingElement.scrollWidth <= clientWidth — failure blocks the build"
 *
 * The 10 design widths: 390, 393, 412, 430, 768, 1024, 1280, 1440, 1728, 1920.
 */

const TEST_WIDTHS = [390, 393, 412, 430, 768, 1024, 1280, 1440, 1728, 1920] as const;

const ROUTE_CLASSES = [
  { name: "Home", path: "/" },
  { name: "Category PLP", path: "/rings" },
  { name: "One of a Kind", path: "/one-of-a-kind" },
  { name: "Curated Facet", path: "/rings/moonstone" },
  { name: "Stones Index", path: "/stones" },
  { name: "Stone Landing", path: "/stones/moonstone" },
  { name: "Stone x Category", path: "/stones/moonstone/rings" },
  { name: "Collections PLP", path: "/collections/signature" },
  { name: "Not Found", path: "/nonexistent-slug-404" },
];

test.describe("zero horizontal overflow at all 10 design widths", () => {
  for (const width of TEST_WIDTHS) {
    test.describe(`viewport width ${width}px`, () => {
      for (const route of ROUTE_CLASSES) {
        test(`${route.name} (${route.path}) has zero horizontal overflow`, async ({ page }) => {
          await page.setViewportSize({ width, height: 900 });

          // Navigate allowing 404/200 status
          const res = await page.goto(route.path, { waitUntil: "domcontentloaded" });
          expect(res?.status() === 200 || res?.status() === 404).toBe(true);

          // Assert document.scrollingElement.scrollWidth <= clientWidth
          const overflow = await page.evaluate(() => {
            const el = document.scrollingElement || document.documentElement;
            return {
              scrollWidth: el.scrollWidth,
              clientWidth: el.clientWidth,
              hasOverflow: el.scrollWidth > el.clientWidth,
            };
          });

          expect(
            overflow.hasOverflow,
            `Horizontal overflow detected on ${route.name} at ${width}px! scrollWidth: ${overflow.scrollWidth}, clientWidth: ${overflow.clientWidth}`,
          ).toBe(false);
        });
      }
    });
  }
});
