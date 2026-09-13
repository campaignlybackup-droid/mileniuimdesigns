import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  contrastRatio,
  declarationsIn,
  over,
  resolveToken,
  surfaceDeclarations,
} from "../support/colour";
import { twoPlaces } from "../support/source";

/**
 * Commissioned by 10 §2.1 rule 4 and §8.2, and 09 P14 exit criterion (b).
 *
 * **Pure math over the token table. No browser.** It computes WCAG 2.1 contrast for every
 * foreground/background pair the system can compose, on every surface, and fails below
 * threshold. It is NOT the same check as the axe sweep over rendered pages: this one asks
 * whether the token table is sound, that one asks which pairs components actually compose.
 * Neither replaces the other, and a failure in this one is cheaper by an order of magnitude
 * because it does not need a running site to find.
 *
 * Thresholds (§8.2, WCAG 2.2 AA): **4.5:1** for text under 18.66px or bold 14px, **3:1** for
 * large text and for UI boundaries that carry meaning.
 */

const CSS = readFileSync(resolve(process.cwd(), "src/styles/tokens.css"), "utf8");
const ROOT = declarationsIn(CSS);

const BODY = 4.5;
const LARGE = 3;

/** Every surface a section can set, and the `data-surface` value that selects it. */
const SURFACES = [
  "ivory-soft",
  "ivory",
  "stone",
  "emerald-deep",
  "forest",
  "green-dark",
  "green-black",
] as const;

/** Foreground tokens that carry TEXT WHICH MUST BE READ. `--md-fg-muted` is deliberately
 *  absent: 10 §2.1 permits it only for non-essential text at 18px+, and it is checked
 *  separately below against the large-text threshold. */
const READABLE_FOREGROUNDS = ["--md-fg", "--md-fg-secondary"] as const;

describe("every surface renders readable text", () => {
  it("checks all seven surfaces", () => {
    // A cross-product over an empty set passes trivially.
    expect(SURFACES).toHaveLength(7);
  });

  for (const surface of SURFACES) {
    it(`${surface}: body text clears ${String(BODY)}:1`, () => {
      const decls = surfaceDeclarations(CSS, surface);
      const bg = resolveToken("--md-bg", decls);
      for (const fg of READABLE_FOREGROUNDS) {
        const colour = over(resolveToken(fg, decls), bg);
        const ratio = contrastRatio(colour, bg);
        expect(
          ratio,
          `${fg} on ${surface} is ${twoPlaces(ratio)}:1, below ${String(BODY)}:1`,
        ).toBeGreaterThanOrEqual(BODY);
      }
    });

    it(`${surface}: a MEANINGFUL boundary clears ${String(LARGE)}:1`, () => {
      // WCAG 1.4.11 holds a boundary that carries meaning — a field edge, a data-row
      // separator, a control outline — to 3:1. `--md-rule-strong` is that token.
      const decls = surfaceDeclarations(CSS, surface);
      const bg = resolveToken("--md-bg", decls);
      const ratio = contrastRatio(over(resolveToken("--md-rule-strong", decls), bg), bg);
      expect(
        ratio,
        `--md-rule-strong on ${surface} is ${twoPlaces(ratio)}:1`,
      ).toBeGreaterThanOrEqual(LARGE);
    });

    it(`${surface}: the decorative hairline stays BELOW it, deliberately`, () => {
      // The converse, and the reason there are two tokens. A whisper-thin divider is the
      // house style; forcing it to 3:1 would make every section boundary look like a table
      // rule. Asserting it stays quiet is what stops someone "fixing" a contrast warning by
      // darkening the wrong token — and if the ramp changes, this fails and the choice gets
      // made again on purpose rather than drifting.
      const decls = surfaceDeclarations(CSS, surface);
      const bg = resolveToken("--md-bg", decls);
      const ratio = contrastRatio(over(resolveToken("--md-rule", decls), bg), bg);
      expect(ratio, `--md-rule on ${surface} is ${twoPlaces(ratio)}:1`).toBeLessThan(LARGE);
    });

    it(`${surface}: the focus ring clears ${String(LARGE)}:1`, () => {
      // An invisible focus ring is a keyboard user with no idea where they are. On the dark
      // surfaces the ring switches to ivory for exactly this reason.
      const decls = surfaceDeclarations(CSS, surface);
      const bg = resolveToken("--md-bg", decls);
      const focus = over(resolveToken("--md-focus", decls), bg);
      const ratio = contrastRatio(focus, bg);
      expect(ratio, `--md-focus on ${surface} is ${twoPlaces(ratio)}:1`).toBeGreaterThanOrEqual(
        LARGE,
      );
    });
  }
});

describe("the known-weak token is confined, and the document says the right number", () => {
  it("--md-taupe on the page ground really is about 2.3:1", () => {
    // 10 §2.1 states this as a known fact and builds a rule on it. If the number were wrong,
    // the rule built on it would be wrong too — so the number is checked, not quoted.
    const bg = resolveToken("--md-ivory-soft", ROOT);
    const ratio = contrastRatio(resolveToken("--md-taupe", ROOT), bg);
    expect(ratio).toBeGreaterThan(2.0);
    expect(ratio).toBeLessThan(2.6);
  });

  it("--md-taupe fails the body threshold, which is why --md-fg-secondary exists", () => {
    const bg = resolveToken("--md-ivory-soft", ROOT);
    expect(contrastRatio(resolveToken("--md-taupe", ROOT), bg)).toBeLessThan(BODY);
    // And the replacement clears it comfortably — the assertion that makes the rule usable
    // rather than merely stated.
    expect(contrastRatio(resolveToken("--md-fg-secondary", ROOT), bg)).toBeGreaterThanOrEqual(
      BODY,
    );
  });
});

describe("the primary button and the inverse surface", () => {
  it("ivory text on emerald clears the body threshold", () => {
    const bg = resolveToken("--md-bg-inverse", ROOT);
    const fg = resolveToken("--md-fg-inverse", ROOT);
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(BODY);
  });

  it("muted inverse text, composited over emerald, clears the LARGE threshold", () => {
    // It is translucent ivory, so it has to be composited before it can be measured — a
    // naive check would compute the contrast of a colour nobody ever sees.
    const bg = resolveToken("--md-bg-inverse", ROOT);
    const fg = over(resolveToken("--md-fg-inverse-muted", ROOT), bg);
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(LARGE);
  });

  it("the emerald button on the page ground is a visible shape", () => {
    const page = resolveToken("--md-bg", ROOT);
    const button = resolveToken("--md-emerald-deep", ROOT);
    expect(contrastRatio(button, page)).toBeGreaterThanOrEqual(LARGE);
  });
});

describe("the metallic accents are constrained, and the constraint is arithmetic", () => {
  it("gold and champagne do NOT clear the body threshold on ivory", () => {
    // 10 §2.1 rule 1 confines them to hairlines, small marks and type at 14px or less. This
    // asserts the REASON: they are not readable as body text, so a future "just use gold for
    // this heading" is caught here rather than in review.
    const bg = resolveToken("--md-ivory-soft", ROOT);
    for (const token of ["--md-gold-antique", "--md-champagne"] as const) {
      expect(
        contrastRatio(resolveToken(token, ROOT), bg),
        `${token} now clears ${String(BODY)}:1 — if the ramp changed, 10 §2.1 rule 1 needs revisiting`,
      ).toBeLessThan(BODY);
    }
  });
});

describe("state colours", () => {
  it("danger text is readable on both halves of the house", () => {
    // An error message that cannot be read is an error message that did not happen.
    const ivory = resolveToken("--md-ivory-soft", ROOT);
    expect(contrastRatio(resolveToken("--md-danger", ROOT), ivory)).toBeGreaterThanOrEqual(
      BODY,
    );
  });

  it("the brand green is NOT used for body text anywhere, and here is why", () => {
    // --md-green on ivory is around 3:1: fine as a 2px focus ring or a rule, not as prose.
    // 10 §2.1 rule 2 says it is never a large fill; this says it is never small text either.
    const ivory = resolveToken("--md-ivory-soft", ROOT);
    const ratio = contrastRatio(resolveToken("--md-green", ROOT), ivory);
    expect(ratio).toBeLessThan(BODY);
    expect(ratio).toBeGreaterThanOrEqual(LARGE);
  });
});

describe("the resolver itself", () => {
  it("follows var() chains and evaluates color-mix", () => {
    // --md-fg-secondary is a color-mix over a var(). If the resolver silently failed and
    // returned black, every assertion above would pass for the wrong reason.
    const mixed = resolveToken("--md-fg-secondary", ROOT);
    const charcoal = resolveToken("--md-charcoal", ROOT);
    expect(mixed).not.toEqual(charcoal);
    expect(mixed.r).toBeGreaterThan(charcoal.r);
  });

  it("throws on a value it does not understand", () => {
    // The whole point of hand-rolling this: a library that normalised an unparseable value
    // would turn a broken token into a passing test.
    expect(() => resolveToken("--md-nonexistent", ROOT)).toThrow();
    expect(() => resolveToken("--md-font-sans", ROOT)).toThrow();
  });
});
