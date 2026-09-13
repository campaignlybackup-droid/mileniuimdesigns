import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { codeOf, sourceFiles } from "../support/source";
import {
  MARKETS,
  PRIMARY_CODE,
  PRIMARY_SEGMENT,
  isMarketSegment,
  marketForSegment,
  routeForPath,
} from "@/lib/edge/markets";

/**
 * Commissioned by 01 §1.4 and 09 P13 criteria (a), (b), (d2).
 *
 * The edge module is the one place in the system that decides which URL belongs to which
 * market, and it runs before anything else. Its two standing risks are that someone adds a
 * `fetch(` to it — reintroducing the 60-second staleness window, the fail-open branch and the
 * public endpoint that enumerated inactive markets — and that someone hand-edits the generated
 * snapshot rather than the `markets` rows.
 */
const ROOT = process.cwd();

describe("(d2) the edge never fetches", () => {
  const files = sourceFiles(resolve(ROOT, "src/lib/edge"));

  it("scans the edge directory", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("contains no fetch(", () => {
    for (const f of files) {
      const src = readFileSync(f, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
      expect(src, `${f} fetches`).not.toMatch(/\bfetch\s*\(/);
    }
  });

  it("and imports the snapshot statically", () => {
    const src = readFileSync(resolve(ROOT, "src/lib/edge/markets.ts"), "utf8");
    expect(src).toContain('import snapshot from "@/generated/market-snapshot.json"');
  });

  it("imports no database client", () => {
    // Prisma cannot run in the Edge runtime at all, so this fails at deploy rather than in a
    // test — but it fails on a Friday, in a middleware that every request goes through.
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      expect(src, `${f} imports the database`).not.toMatch(/@\/lib\/db|PrismaClient/);
    }
  });
});

describe("the snapshot is generated, never hand-edited", () => {
  const path = resolve(ROOT, "src/generated/market-snapshot.json");
  const checksumPath = resolve(ROOT, "src/generated/market-snapshot.checksum");

  it("exists alongside its checksum", () => {
    expect(existsSync(path), "run `npm run gen:markets`").toBe(true);
    expect(existsSync(checksumPath)).toBe(true);
  });

  it("matches its checksum", () => {
    // A hand-edit to add a market would put the edge and the database out of step in the one
    // direction that is invisible: middleware would route a market that does not exist.
    const json = readFileSync(path, "utf8");
    const actual = createHash("sha256").update(json).digest("hex");
    expect(actual).toBe(readFileSync(checksumPath, "utf8").trim());
  });

  it("carries at least one market and names a primary among them", () => {
    expect(MARKETS.length).toBeGreaterThan(0);
    expect(MARKETS.map((m) => m.segment)).toContain(PRIMARY_SEGMENT);
    expect(MARKETS.map((m) => m.code)).toContain(PRIMARY_CODE);
  });

  it("is ranked, and the primary is the lowest rank", () => {
    const ranks = MARKETS.map((m) => m.rank);
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
    expect(MARKETS[0]!.code).toBe(PRIMARY_CODE);
  });
});

describe("(a) and (b) — routing", () => {
  it("301s an explicit primary prefix to the bare path", () => {
    // /us/rings → /rings. Serving one page at two URLs splits its ranking between them.
    expect(routeForPath("/us/rings")).toEqual({ kind: "redirect", to: "/rings" });
    expect(routeForPath("/us")).toEqual({ kind: "redirect", to: "/" });
    expect(routeForPath("/us/products/a-ring")).toEqual({
      kind: "redirect",
      to: "/products/a-ring",
    });
  });

  it("rewrites a bare path into the primary market", () => {
    expect(routeForPath("/rings")).toEqual({
      kind: "rewrite",
      to: `/${PRIMARY_SEGMENT}/rings`,
      marketCode: PRIMARY_CODE,
    });
  });

  it("passes a non-primary market through unchanged", () => {
    const india = marketForSegment("in");
    if (!india) return;
    expect(routeForPath("/in/rings")).toEqual({
      kind: "rewrite",
      to: "/in/rings",
      marketCode: "IN",
    });
  });

  it("(b) treats an unknown segment as a PATH, not a market", () => {
    // /xx/rings is not a market — it rewrites into the primary market, where the route tree
    // has no `/xx` category and returns 404. Middleware does not get to decide that.
    expect(routeForPath("/xx/rings")).toEqual({
      kind: "rewrite",
      to: `/${PRIMARY_SEGMENT}/xx/rings`,
      marketCode: PRIMARY_CODE,
    });
    expect(isMarketSegment("xx")).toBe(false);
  });

  it("is case-insensitive about the segment", () => {
    expect(routeForPath("/US/rings")).toEqual({ kind: "redirect", to: "/rings" });
  });
});

describe("the cookie cannot select a market", () => {
  it("resolveMarket takes one parameter and it is not a cookie", () => {
    // 01 §1.4: the signature does not accept the thing that would cause the bug, so no call
    // site can pass it by accident. Asserted on the source, because the type disappears at
    // runtime and this is exactly the signature someone would "helpfully" extend.
    const src = codeOf(resolve(ROOT, "src/lib/market/index.ts"));
    expect(src).toMatch(/resolveMarket = cache\(async \(marketSegment: string\)/);
    expect(src).not.toMatch(/cookieMarket|md_market/);
  });

  it("(c) no module under src/app reads the market cookie", () => {
    // The cookie is read in exactly two places: middleware, and the switcher action.
    const offenders = sourceFiles(resolve(ROOT, "src/app")).filter((f) =>
      codeOf(f).includes("md_market"),
    );
    expect(offenders).toEqual([]);
  });
});
