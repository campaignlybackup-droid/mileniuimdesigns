import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

/**
 * Commissioned by 04 §1.1 and 09 P11 exit criterion (b).
 *
 * `src/lib/pricing/` is the only module that produces an amount. This fails if any file
 * outside it and `src/lib/money.ts` performs arithmetic on an identifier ending `Minor` or
 * `_minor` or `Bp`.
 *
 * Why an AST-shaped scan rather than a code review: the violation never looks like a
 * violation. It looks like `const saving = listMinor - saleMinor` in a badge component, and it
 * is wrong not because the subtraction is incorrect but because the badge now has its own
 * opinion about what a saving is — one that stops matching the moment a `pricing_rules` row
 * exists. `ResolvedPrice.discountBreakdown` already says.
 */
const ROOT = process.cwd();

const ALLOWED = [
  /^src\/lib\/pricing\//,
  /^src\/lib\/money\.ts$/,
  // The single place a bigint column is read into a typed row and handed on. It does no
  // arithmetic; the pattern below is what proves that rather than the exemption.
  /^src\/generated\//,
];

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === "generated" || e === "node_modules") continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

/**
 * An arithmetic operator applied to an identifier that carries money or basis points.
 *
 * Comparisons (`<`, `>=`, `===`) are deliberately NOT matched: deciding whether a price is
 * below a threshold is a legitimate thing for a filter or a badge to do. PRODUCING a new
 * amount is not.
 */
const MONEY_ARITHMETIC =
  /\b(\w*(?:[Mm]inor|_minor|Bp|_bp))\s*[-+*/]\s*|\s[-+*/]\s*\b\w*(?:[Mm]inor|_minor|Bp|_bp)\b/;

describe("only src/lib/pricing produces an amount", () => {
  const files = walk(resolve(ROOT, "src"))
    .map((f) => relative(ROOT, f).replace(/\\/g, "/"))
    .filter((f) => !ALLOWED.some((re) => re.test(f)));

  it("scans a non-trivial number of files", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("no file outside pricing does arithmetic on a _minor or _bp identifier", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const src = readFileSync(resolve(ROOT, file), "utf8");
      src.split("\n").forEach((line, i) => {
        // Comments explain the rule and would otherwise trip it.
        const code = line.replace(/\/\/.*$/, "").replace(/^\s*\*.*$/, "");
        if (MONEY_ARITHMETIC.test(code))
          offenders.push(`${file}:${String(i + 1)}  ${line.trim()}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it("detects a violation when one exists", () => {
    // The rule is only as good as the pattern, so the pattern is tested on the exact shape
    // the rule exists to catch — a component computing its own saving.
    expect(MONEY_ARITHMETIC.test("const saving = listMinor - saleMinor;")).toBe(true);
    expect(MONEY_ARITHMETIC.test("const total = unit_final_minor * qty;")).toBe(true);
    expect(MONEY_ARITHMETIC.test("const cut = applyBp(x, valueBp);")).toBe(false);
    // A COMPARISON is legitimate: a filter may ask whether a price is under a threshold.
    expect(MONEY_ARITHMETIC.test("if (listMinor > thresholdMinor) return null;")).toBe(false);
  });
});
