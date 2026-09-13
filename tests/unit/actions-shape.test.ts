import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

/**
 * Commissioned by 09 P07 and 07 §3.7.
 *
 * A server action is a plain POST endpoint addressed by a generated id. Anything checking
 * permissions only in the component that renders the button is reachable by anyone who can
 * read the page source — so the shape of every action is enforced here rather than
 * remembered.
 */
const ROOT = process.cwd();
const ACTIONS = resolve(ROOT, "src/server/actions");

/**
 * Strip comments before matching.
 *
 * The first version of the `getActor()` check failed on this very file's own comment
 * explaining why `getActor()` must not exist. A grep-based guard that reads prose as code
 * produces exactly the false positive that gets guards disabled.
 */
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
}

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".ts")) out.push(p);
  }
  return out;
}

const files = walk(ACTIONS).filter((f) => !f.endsWith(".gitkeep"));

/**
 * Actions a signed-out shopper is MEANT to be able to call.
 *
 * Every other guard in this repository derives its expectations rather than listing them,
 * because a hand-maintained list silently stops covering what it claims to. This one is a
 * list on purpose: "is this action safe to expose anonymously?" is a judgement about the
 * action's effect, and no property of the file can answer it. A derived rule here would
 * either exempt too much (any action with no `requirePermission`) or too little.
 *
 * The list is short, each entry states what the action may do, and every entry must ALSO
 * declare itself in the file — so the list and the code cannot drift apart silently, and
 * adding one is a diff a reviewer sees twice.
 */
const PUBLIC_ACTIONS: Record<string, string> = {
  "src/server/actions/market.ts":
    "Switching market is a shopper choice. It sets the md_market cookie and redirects; it " +
    "reads no customer data and writes nothing but a preference.",
};

function isPublic(file: string): boolean {
  return relative(ROOT, file).replace(/\\/g, "/") in PUBLIC_ACTIONS;
}

describe("server action shape", () => {
  it("there is at least one action to check", () => {
    // A guard pointed at an empty directory passes forever and proves nothing.
    expect(files.length).toBeGreaterThan(0);
  });

  it("every action file declares 'use server'", () => {
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      expect(src.trimStart().startsWith('"use server"'), relative(ROOT, f)).toBe(true);
    }
  });

  it("every public action is declared in the file as well as in the list", () => {
    // The list above is a judgement; this is what stops it becoming a place to hide things.
    // An action cannot be quietly moved into the public set without the file saying so.
    for (const [rel, reason] of Object.entries(PUBLIC_ACTIONS)) {
      const file = resolve(ROOT, rel);
      expect(existsSync(file), `${rel} is listed public but does not exist`).toBe(true);
      expect(
        readFileSync(file, "utf8"),
        `${rel} must carry the marker \`PUBLIC ACTION\` explaining why it needs no actor`,
      ).toContain("PUBLIC ACTION");
      expect(reason.length).toBeGreaterThan(40);
    }
  });

  it("every action resolves a staff or customer actor — never a bare getActor()", () => {
    for (const f of files) {
      if (isPublic(f)) continue;
      const src = code(readFileSync(f, "utf8"));
      expect(src, relative(ROOT, f)).toMatch(/requireStaffSession|requireCustomerSession/);
      // 07 §3.2: the two-resolver split is a confused-deputy defence. A single resolver
      // reading the admin cookie first would price, cache and audit a shopping staff
      // member's session as an admin's.
      expect(src, relative(ROOT, f)).not.toMatch(/\bgetActor\s*\(/);
    }
  });

  it("every input schema is .strict()", () => {
    // Zod's default STRIPS unknown keys silently. For an autosave payload that means a
    // form which grew a `price` field has it quietly dropped, the editor sees "Saved",
    // and the price never changed.
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      const objects = [...code(src).matchAll(/z\s*\.object\(/g)].length;
      const stricts = [...code(src).matchAll(/\.strict\(\)/g)].length;
      expect(
        stricts,
        `${relative(ROOT, f)}: ${objects} z.object( but ${stricts} .strict()`,
      ).toBeGreaterThanOrEqual(objects);
    }
  });

  it("no action returns a raw error message to the client", () => {
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      // toWireError carries a code and a copy key. Returning `e.message` would ship a
      // constraint name or a provider payload to a browser.
      expect(src, relative(ROOT, f)).not.toMatch(
        /message:\s*\(?e(?:rror)?\s*as\s*Error\)?\.message/,
      );
      // A public action that redirects returns no body at all, so there is no error shape
      // for it to get wrong — but the raw-message check above still applies to it.
      if (isPublic(f)) continue;
      expect(src, relative(ROOT, f)).toMatch(/toWireError/);
    }
  });

  it("no action reaches the database directly", () => {
    // Actions delegate to a service, which owns the permission check — so a future
    // non-action caller (a job, an import, a CLI) cannot reach the write unguarded.
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      expect(src, relative(ROOT, f)).not.toMatch(/from "@\/lib\/db\//);
    }
  });
});
