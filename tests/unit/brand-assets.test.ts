import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Commissioned by 09 P14 exit criterion (c) and 01 §5.10.
 *
 * "The wordmark and monogram render from `public/brand/` — **or the build fails loudly if
 * absent, rather than substituting a text logo.**"
 *
 * The failure this prevents is quiet and expensive: a missing logo file becomes a styled
 * `<span>MILLENNIUM DESIGNS</span>` that looks deliberate, passes review because it looks
 * deliberate, and ships — a wordmark nobody designed, on every page, and eventually on a
 * printed invoice. A loud failure costs an afternoon; a plausible substitute costs a rebrand.
 *
 * **This test is currently EXPECTED TO FAIL, and that is the point.** The client has supplied
 * raster images of both marks; the original vector artwork is still outstanding
 * (`public/brand/README.md`). The marks must not be traced or approximated from the rasters —
 * that is a redesign, which the brief forbids in as many words.
 */
const BRAND = resolve(process.cwd(), "public/brand");
const REQUIRED = ["wordmark.svg", "monogram.svg"] as const;

describe("the brand marks are present and usable", () => {
  it("both files exist", () => {
    const missing = REQUIRED.filter((f) => !existsSync(resolve(BRAND, f)));
    expect(
      missing,
      `Missing brand artwork: ${missing.join(", ")}. See public/brand/README.md — this is ` +
        `client input, outstanding since P01. Do NOT trace the marks from the raster images.`,
    ).toEqual([]);
  });

  it("neither is zero-byte", () => {
    // A zero-byte placeholder is worse than a missing file: it satisfies "exists", renders as
    // nothing, and reads as a CSS bug.
    for (const f of REQUIRED) {
      const path = resolve(BRAND, f);
      if (!existsSync(path)) continue;
      expect(statSync(path).size, `${f} is empty`).toBeGreaterThan(0);
    }
  });

  it("each is real SVG, not a renamed raster", () => {
    // `.svg` is a filename, not a format. A PNG renamed to .svg passes the two checks above
    // and then fails to scale — which is the entire reason vector artwork was asked for.
    for (const f of REQUIRED) {
      const path = resolve(BRAND, f);
      if (!existsSync(path)) continue;
      const head = readFileSync(path, "utf8").slice(0, 400).toLowerCase();
      expect(head, `${f} does not contain an <svg> root`).toContain("<svg");
    }
  });

  it("the Logo component exposes no prop that could distort a mark", () => {
    // The component IS the enforcement mechanism (10 §3.1): `variant` and `tone` and nothing
    // else. A `className` or `style` prop is how a mark gets stretched at one breakpoint on
    // one page that nobody opens again.
    const src = readFileSync(resolve(process.cwd(), "src/components/ui/Logo.tsx"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    const props = /}: \{([\s\S]*?)\}\): React\.ReactElement/.exec(src)?.[1] ?? "";
    const names = [...props.matchAll(/^\s*(\w+)\??:/gm)].map((m) => m[1]!);
    expect(names.sort()).toEqual(["priority", "size", "tone", "variant"]);
    for (const banned of ["className", "style", "color", "fill", "transform", "filter"]) {
      expect(props, `Logo must not accept ${banned}`).not.toContain(banned);
    }
  });
});
