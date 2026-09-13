import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

/**
 * Commissioned by 04 §1.1 and 09 P11 exit criterion (c).
 *
 * "No FX rate, conversion constant or multiplication between two currency amounts exists
 * anywhere in `src/`."
 *
 * **A grep cannot prove the absence of cross-currency arithmetic**, and this file does not
 * pretend otherwise. It catches the person who names it honestly. The person who does not is
 * caught by the runtime and the schema: `addMoney`/`subtractMoney` throw on mixed currency,
 * and every currency-denominated column is reachable only through a composite
 * `(market_code, currency_code) → markets` FK, so a rupee term on a US row is UNWRITABLE
 * rather than merely untested. Three mechanisms, deliberately overlapping.
 */
const ROOT = process.cwd();

/** Named in 04 §1.1. Each is what someone reaches for when they decide to convert. */
const BANNED_IDENTIFIERS = [
  "exchangeRate",
  "fxRate",
  "convertCurrency",
  "usdToInr",
  "inrToUsd",
  "toBaseCurrency",
  "baseAmountMinor",
] as const;

/** Spellings of the same idea that the list above would miss. */
const BANNED_PATTERNS: Array<[RegExp, string]> = [
  [/\bFX_RATE\b/, "an FX rate constant"],
  [/\bexchange_rate\b/, "an FX rate column"],
  [/\bconversionRate\b/, "a conversion rate"],
  [/\bUSD_TO_INR\b|\bINR_TO_USD\b/, "a hardcoded pair rate"],
  [/\bconvertMinor\b|\bconvertAmount\b/, "an amount converter"],
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

/** This file names every banned identifier, so it must not scan itself. */
const SELF = /tests\//;

describe("no currency conversion exists anywhere in src/", () => {
  const files = walk(resolve(ROOT, "src")).filter((f) => !SELF.test(relative(ROOT, f)));

  it("scans a non-trivial number of files", () => {
    // A scan pointed at an empty set passes forever. This is the assertion that says the
    // scan ran at all.
    expect(files.length).toBeGreaterThan(30);
  });

  it("contains none of the identifiers 04 §1.1 names", () => {
    const hits: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      for (const id of BANNED_IDENTIFIERS) {
        if (new RegExp(`\\b${id}\\b`).test(src)) hits.push(`${relative(ROOT, file)}: ${id}`);
      }
      for (const [re, what] of BANNED_PATTERNS) {
        if (re.test(src)) hits.push(`${relative(ROOT, file)}: ${what}`);
      }
    }
    expect(
      hits,
      "USD and INR prices are INDEPENDENT. A converted price is a price nobody decided.",
    ).toEqual([]);
  });

  it("detects a violation when one exists", () => {
    // A scan that matched nothing would pass the test above for the wrong reason.
    const sample = "const fxRate = 85;";
    const matched = BANNED_IDENTIFIERS.some((id) => new RegExp(`\\b${id}\\b`).test(sample));
    expect(matched).toBe(true);
  });
});

describe("the runtime guarantee behind the scan", () => {
  it("addMoney throws on mixed currency", async () => {
    const { addMoney, money } = await import("@/lib/money");
    expect(() => addMoney(money(100n, "USD"), money(100n, "INR"))).toThrow();
    // And the same currency composes normally, so the throw is about the mismatch and not
    // about the function refusing everything.
    expect(addMoney(money(100n, "USD"), money(250n, "USD")).minor).toBe(350n);
  });
});
