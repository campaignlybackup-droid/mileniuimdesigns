import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

/**
 * Commissioned by 09 §1: *"`tests/setup/collect-audit.ts` asserts the collected file count
 * equals the count of files on disk under those four trees."*
 *
 * **The defect this exists for.** 09 §1 is normative that several files commissioned in 03-08
 * are named `.spec.ts` inside the Vitest trees, that those names are kept, and that
 * `vitest.config` must therefore collect `{test,spec}`. The conventional `*.test.ts`-only glob
 * shipped at P02 anyway and survived to P20, when `market-switch-cart.spec.ts` was written
 * against it. That file would have existed on disk, been listed as delivered in the phase
 * table, and been collected by nothing.
 *
 * A test that does not run is worse than a test that does not exist. A missing test is visible;
 * a silently uncollected one is recorded as coverage, and 09 calls this particular file "the
 * single test that stops an INR line surviving into a USD bag".
 *
 * This asserts the property directly: every test file on disk under the four Vitest trees
 * matches a pattern the runner actually collects. It reads `vitest.config.mts` rather than
 * hard-coding the globs, so narrowing the config fails here instead of going quiet.
 */
const ROOT = process.cwd();
const TREES = ["unit", "db", "integration", "api"] as const;

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

describe("every test file on disk is collected by the runner", () => {
  it("the four Vitest trees exist and hold tests", () => {
    // A guard pointed at a path that does not exist passes forever and proves nothing.
    for (const t of TREES) {
      const files = walk(resolve(ROOT, "tests", t));
      expect(files.length, `tests/${t} is empty or missing`).toBeGreaterThan(0);
    }
  });

  it("the config collects BOTH .test.ts and .spec.ts under those trees", () => {
    // Read the config as text: importing it would execute the React plugin for no reason,
    // and the thing under test is the literal glob an engineer edits.
    const cfg = readdirSync(ROOT).filter((f) => /^vitest\.config\.[cm]?[jt]s$/.test(f));
    expect(cfg, "vitest.config has moved or been renamed").not.toHaveLength(0);
    const src = readFileSync(resolve(ROOT, cfg[0]!), "utf8");
    const include = /include:\s*\[([\s\S]*?)\]/.exec(src);
    expect(include, "no `include` array found in the Vitest config").not.toBeNull();
    const globs = include![1]!;
    for (const t of TREES) {
      expect(
        globs.includes(t),
        `tests/${t} is not named in the Vitest include globs, so nothing there runs`,
      ).toBe(true);
    }
    expect(
      /\{test,spec\}|\.spec\./.test(globs),
      "the include globs collect only `.test.ts`. 09 §1 keeps the `.spec.ts` names " +
        "commissioned in 03-08 inside the Vitest trees, so those files would be collected " +
        "by nothing while appearing green in the phase table.",
    ).toBe(true);
  });

  it("no test file under those trees is orphaned by its own extension", () => {
    const orphans: string[] = [];
    for (const t of TREES) {
      for (const file of walk(resolve(ROOT, "tests", t))) {
        const rel = relative(ROOT, file).replace(/\\/g, "/");
        if (!/\.[cm]?tsx?$/.test(rel)) continue;
        // Helpers and fixtures are imported BY tests and are not tests themselves.
        if (/\.(test|spec|bench)\.[cm]?tsx?$/.test(rel)) continue;
        // A HELPER, identified by what it is rather than where it sits. A module that
        // declares no `describe`/`it`/`bench` contains no assertions, so it cannot be a test
        // that silently fails to run — it is support code imported by one that does.
        // `tests/db/schema-coverage.ts` is the case that forced this: it lives beside the db
        // suites rather than under `support/`, and a path-convention check called it an
        // orphan. Convention describes where helpers usually go; this describes what a test is.
        const code = readFileSync(resolve(ROOT, rel), "utf8");
        if (!/\b(?:describe|it|test|bench)\s*(?:\.\w+\s*)?\(/.test(code)) continue;
        orphans.push(rel);
      }
    }
    // Every remaining file is a .ts under a test tree that is neither a test nor a helper —
    // which usually means someone wrote `cart-merge.ts` instead of `cart-merge.test.ts`.
    expect(
      orphans,
      "these files sit in a test tree but match no test or helper pattern, so they run never",
    ).toEqual([]);
  });

  it("the spec file 09 calls out by name is on disk AND matches a collected pattern", () => {
    // Named explicitly rather than left to the general rule: 09 singles this one out, and a
    // general property is easy to satisfy while the specific commissioned file is missing.
    const rel = "tests/integration/market-switch-cart.spec.ts";
    const files = walk(resolve(ROOT, "tests/integration")).map((f) =>
      relative(ROOT, f).replace(/\\/g, "/"),
    );
    expect(files, `${rel} is commissioned by 09 P20 criterion (b)`).toContain(rel);
  });
});
