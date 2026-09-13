/**
 * Environment preflight (01 §4, §5.4; 09 P02 exit criterion (b)).
 *
 * Three jobs:
 *   1. Fail hard when DIRECT_URL points at a pooled endpoint. Migrations take
 *      session-level advisory locks that a transaction pooler does not preserve, so a
 *      pooled DIRECT_URL does not error — it HANGS, on the first production migration,
 *      after forty tables exist. This check is the whole reason the split exists.
 *   2. Fail when .env.example and the Zod boot schema disagree, so the documented
 *      environment and the enforced one cannot drift.
 *   3. Print configured/unconfigured per integration — never guessing, never pretending
 *      an unconfigured integration works (hard rule 7).
 *
 * Run: npm run check:env
 */
import "dotenv/config";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

const failures: string[] = [];
const warnings: string[] = [];

// ── 1. The pooler check ───────────────────────────────────────────────────────────────
// Markers used by the poolers this project may plausibly meet. Neon's pooled host is
// "<endpoint>-pooler.<region>.aws.neon.tech"; pgbouncer is usually signalled explicitly.
const POOLER_MARKERS = ["-pooler", "pgbouncer=true", ":6543"];

const directUrl = process.env["DIRECT_URL"];
const databaseUrl = process.env["DATABASE_URL"];

if (!directUrl) {
  failures.push("DIRECT_URL is not set. Migrations have no endpoint to run against.");
} else {
  const hit = POOLER_MARKERS.find((m) => directUrl.includes(m));
  if (hit) {
    failures.push(
      `DIRECT_URL contains "${hit}", which means it points at a POOLED endpoint.\n` +
        `    Migrations take session-level advisory locks that a transaction pooler does\n` +
        `    not preserve. This does not fail loudly — it hangs. Use the direct endpoint.\n` +
        `    (01 §5.4, §6.2 · 09 P02 exit criterion (b))`,
    );
  }
}

if (!databaseUrl) {
  failures.push("DATABASE_URL is not set. The application has no database.");
}

// In production the two MUST differ: identical URLs mean either the app is unpooled
// (exhausting connections) or migrations are pooled (hanging). Locally, prisma dev
// serves both from one endpoint and that is expected.
const appEnv = process.env["APP_ENV"] ?? "local";
if (appEnv === "production" && directUrl && databaseUrl && directUrl === databaseUrl) {
  failures.push(
    "DATABASE_URL and DIRECT_URL are identical in production. One of them is wrong:\n" +
      "    the app needs the pooled endpoint, migrations need the direct one.",
  );
}
if (appEnv !== "production" && directUrl && databaseUrl && directUrl === databaseUrl) {
  warnings.push(
    `DATABASE_URL and DIRECT_URL are identical. Expected for ${DIM}prisma dev${RESET}${YELLOW}, ` +
      `which serves both from one endpoint. They must differ in production.`,
  );
}

// ── 2. .env.example ←→ Zod schema parity ──────────────────────────────────────────────
const root = resolve(process.cwd());
const examplePath = resolve(root, ".env.example");
const envModulePath = resolve(root, "src/lib/config/env.ts");

if (!existsSync(examplePath)) {
  failures.push(".env.example is missing. It is the only documentation of what to set.");
} else if (existsSync(envModulePath)) {
  const example = readFileSync(examplePath, "utf8");
  const envModule = readFileSync(envModulePath, "utf8");

  const documented = new Set(
    example
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"))
      .map((l) => l.split("=")[0]!.trim())
      .filter(Boolean),
  );

  // Boot keys: the object literal passed to z.object in env.ts.
  const bootBlock = envModule.match(/const bootSchema = z\.object\(\{([\s\S]*?)\n\}\)/);
  const bootKeys = bootBlock
    ? [...bootBlock[1]!.matchAll(/^\s*([A-Z0-9_]+):/gm)].map((m) => m[1]!)
    : [];

  // Integration keys: every string inside INTEGRATION_KEYS' arrays.
  const integBlock = envModule.match(/INTEGRATION_KEYS[\s\S]*?=\s*\{([\s\S]*?)\n\};/);
  const integKeys = integBlock
    ? [...integBlock[1]!.matchAll(/"([A-Z0-9_]+)"/g)].map((m) => m[1]!)
    : [];

  for (const k of bootKeys) {
    if (!documented.has(k)) {
      failures.push(`${k} is required by the boot schema but absent from .env.example.`);
    }
  }
  for (const k of integKeys) {
    if (!documented.has(k)) {
      warnings.push(`${k} gates an integration but is absent from .env.example.`);
    }
  }
  // Read by the Prisma CLI through prisma7.config.ts, never by the app, so they are
  // legitimately absent from env.ts's boot schema.
  const CLI_ONLY = ["SHADOW_DATABASE_URL"];
  const known = new Set([...bootKeys, ...integKeys, ...CLI_ONLY]);
  for (const k of documented) {
    if (!known.has(k)) {
      warnings.push(`${k} is in .env.example but nothing reads it through env.ts.`);
    }
  }
}

// ── 3. Integration status ─────────────────────────────────────────────────────────────
async function reportIntegrations(): Promise<void> {
  const { integrationStatus, missingKeysFor } = await import("../src/lib/config/env");
  const status = integrationStatus();
  console.log("\nIntegrations");
  for (const [key, state] of Object.entries(status)) {
    if (state === "configured") {
      console.log(`  ${GREEN}●${RESET} ${key.padEnd(18)} configured`);
    } else {
      const missing = missingKeysFor(key as Parameters<typeof missingKeysFor>[0]);
      console.log(
        `  ${DIM}○${RESET} ${key.padEnd(18)} ${DIM}unconfigured — needs ${missing.join(", ")}${RESET}`,
      );
    }
  }
  console.log(
    `\n${DIM}An unconfigured integration is a designed state, not an error. The feature it\n` +
      `backs reports its status; it never fakes success (hard rule 7).${RESET}`,
  );
}

async function main(): Promise<void> {
  await reportIntegrations();

  if (warnings.length) {
    console.log(`\n${YELLOW}Warnings${RESET}`);
    for (const w of warnings) console.log(`  ${YELLOW}!${RESET} ${w}`);
  }

  if (failures.length) {
    console.log(`\n${RED}Failures${RESET}`);
    for (const f of failures) console.log(`  ${RED}\u2717${RESET} ${f}`);
    console.log(`\n${RED}check-env failed with ${failures.length} problem(s).${RESET}\n`);
    process.exit(1);
  }

  console.log(`\n${GREEN}\u2713 Environment OK${RESET}\n`);
}

void main();
