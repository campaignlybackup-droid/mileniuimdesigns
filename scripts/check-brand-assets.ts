/**
 * Fail the build if the brand artwork is missing — 09 P14 criterion (c), 01 §5.10.
 *
 * The alternative, and the reason this exists: a missing logo becomes a styled
 * `<span>MILLENNIUM DESIGNS</span>`. It looks deliberate, so it passes review; it ships; and
 * it is a wordmark nobody designed, on every page, eventually on a printed invoice. A build
 * that stops costs an afternoon. A plausible substitute costs a rebrand.
 *
 * Runs inside `npm run build`, before `next build`, so it fails in seconds rather than after
 * a full compile.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const REQUIRED = ["wordmark.svg", "monogram.svg"] as const;
const BRAND = resolve(process.cwd(), "public/brand");

function main(): void {
  const problems: string[] = [];

  for (const file of REQUIRED) {
    const path = resolve(BRAND, file);
    if (!existsSync(path)) {
      problems.push(`  ✗ public/brand/${file} — missing`);
      continue;
    }
    if (statSync(path).size === 0) {
      problems.push(`  ✗ public/brand/${file} — zero bytes`);
      continue;
    }
    const head = readFileSync(path, "utf8").slice(0, 400).toLowerCase();
    if (!head.includes("<svg")) {
      // `.svg` is a filename, not a format. A renamed PNG passes "exists" and then fails to
      // scale, which is the whole reason vector artwork was asked for.
      problems.push(`  ✗ public/brand/${file} — not an SVG (no <svg> root)`);
    }
  }

  if (problems.length > 0) {
    console.error(
      `\n✗ Brand artwork is missing. The build stops here deliberately.\n\n` +
        problems.join("\n") +
        `\n\n  This is CLIENT INPUT, outstanding since P01: the original vector files for the\n` +
        `  MILLENNIUM DESIGNS wordmark and the M monogram (.ai, .eps or .svg).\n\n` +
        `  Do NOT trace or approximate them from the raster images — that is a redesign, and\n` +
        `  the brief forbids it. See public/brand/README.md.\n\n` +
        `  The build is failing instead of substituting a text logo, because a text logo looks\n` +
        `  deliberate and would ship.\n`,
    );
    process.exit(1);
  }

  console.log(`✓ brand artwork: ${String(REQUIRED.length)} marks present`);
}

main();
