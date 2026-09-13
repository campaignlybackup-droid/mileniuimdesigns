import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { RESERVED_SLUGS } from "../../prisma/seed/03-categories";

/**
 * Commissioned by 08 §4.1 and 09 P05 exit criterion (a).
 *
 * This test settles a contradiction the review found: 02 §6 and 03 §7.1 seeded TEN
 * categories including `STONES`, while 08 §4.1 routes `/stones/[slug]` as a first path
 * segment and therefore refuses a category with that slug. The seed would have either
 * failed its own validator or bypassed it.
 *
 * Nine category rows plus one `navigation_items` row is ten menu entries.
 */
const ROOT = process.cwd();

/** Every first path segment the App Router owns, read from the filesystem. */
function routeSegments(): Set<string> {
  const out = new Set<string>();
  const appDir = resolve(ROOT, "src/app");
  const walk = (dir: string) => {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      if (!statSync(p).isDirectory()) continue;
      // Route groups `(name)` are not URL segments.
      if (e.startsWith("(") || e.startsWith("_") || e.startsWith("[")) {
        walk(p);
        continue;
      }
      out.add(e);
    }
  };
  if (existsSync(appDir)) walk(appDir);
  return out;
}

describe("reserved slugs", () => {
  it("no seeded category takes a reserved first segment", () => {
    const seed = readFileSync(resolve(ROOT, "prisma/seed/03-categories.ts"), "utf8");
    const slugs = [...seed.matchAll(/slug:\s*"([a-z0-9-]+)"/g)].map((m) => m[1]!);
    expect(slugs.length).toBe(9);
    const collisions = slugs.filter((s) => (RESERVED_SLUGS as readonly string[]).includes(s));
    expect(collisions).toEqual([]);
  });

  it("`stones` IS reserved — it is a route, not a category", () => {
    expect(RESERVED_SLUGS).toContain("stones");
  });

  it("seeds nine categories, not ten", () => {
    const seed = readFileSync(resolve(ROOT, "prisma/seed/03-categories.ts"), "utf8");
    const slugs = [...seed.matchAll(/slug:\s*"([a-z0-9-]+)"/g)].map((m) => m[1]!);
    expect(slugs).not.toContain("stones");
    expect(slugs).toEqual([
      "rings",
      "chains",
      "pendants",
      "bracelets",
      "earrings",
      "closeouts",
      "one-of-a-kind",
      "14k-gold",
      "lab-grown-diamonds",
    ]);
  });

  it("every real route segment is in the reserved list", () => {
    // Catches the reverse drift: adding `src/app/(storefront)/gifts/` without reserving
    // `gifts` would let a merchandiser create a category that shadows a real page.
    const missing = [...routeSegments()].filter(
      (s) => !(RESERVED_SLUGS as readonly string[]).includes(s) && !s.includes("."),
    );
    expect(missing, `route segments not reserved: ${missing.join(", ")}`).toEqual([]);
  });

  it("ONE OF A KIND lives at /one-of-a-kind, not /collections/one-of-a-kind", () => {
    // Two URLs for one idea. 08 §4.3 refuses the second; 03 §6.6 was corrected from five
    // launch rule sets to four.
    const seed = readFileSync(resolve(ROOT, "prisma/seed/03-categories.ts"), "utf8");
    expect(seed).toContain('slug: "one-of-a-kind"');
  });
});
