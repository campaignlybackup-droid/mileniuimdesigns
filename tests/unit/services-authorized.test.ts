import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

/**
 * Commissioned by 07 §3.7 and 09 P03A exit criterion (d).
 *
 * "An exported server action, route handler or service function with no
 * requirePermission() fails CI."
 *
 * These pass vacuously today — there are no server actions yet — and that is the point:
 * the guard exists BEFORE the code it guards, so the first unguarded mutator written at
 * P07 fails here rather than shipping. A rule added after the fact has to be
 * retrofitted across everything written in between.
 *
 * Hidden UI is not authorization: a server action is a plain POST endpoint addressed by
 * a generated id, so anything checking only in a component is reachable by anyone who
 * can read the page source.
 */
const ROOT = process.cwd();

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir)) {
    if (e === "generated" || e === "node_modules") continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

/**
 * A mutator by name. Read-only exports are gated by their own read permission at the route,
 * not inside the service, so the heuristic targets verbs that WRITE.
 *
 * `apply` is in the list because `applyRecalcRun` writes prices — but `applyRule` and
 * `applyBp` compute and write nothing, so the verb alone over-matches. See
 * `performsIo()` below for the property that separates them.
 */
const MUTATOR =
  /export\s+(?:async\s+)?function\s+((?:create|update|delete|save|set|apply|approve|reject|publish|unpublish|archive|restore|refund|cancel|adjust|transfer|assign|revoke|grant|import|bulk|enqueue|mint|issue|anonymize|impersonate)[A-Z]\w*)/g;

/** Modules that legitimately hold no permission check. Each entry states why. */
const EXEMPT: Array<[RegExp, string]> = [
  [
    /src\/lib\/auth\//,
    "authentication runs BEFORE an actor exists — it cannot require a permission of one",
  ],
  [/src\/lib\/db\//, "the data layer is called by services that have already authorized"],
  [/src\/lib\/ratelimit\//, "the limiter must run for unauthenticated callers"],
  [/src\/lib\/money\.ts/, "pure arithmetic, no I/O, no actor"],
  [/src\/lib\/errors\.ts/, "type declarations"],
  [/src\/lib\/rbac\//, "this IS the authorization layer"],
  [/src\/lib\/config\//, "configuration, read at boot"],
  [/src\/types\//, "type declarations"],
];

/**
 * Whether a module can touch the database AT ALL.
 *
 * Every database call in this codebase is asynchronous — Prisma exposes no synchronous API
 * and neither does `pg`. So a module with no `async`, no `await` and no `Promise` cannot
 * perform I/O, cannot write a row, and cannot be a mutator whatever its functions are called.
 * `src/lib/pricing/rules.ts` is the case that forced this: it exports `applyRule` and
 * `applyRuleStack`, which are pure arithmetic over `bigint`.
 *
 * Stated as a POSITIVE property of the file rather than as an exemption list, because an
 * exemption list is a second thing to maintain and the failure mode of forgetting to add to
 * one is silence (see tests/db/schema-coverage.ts for what that cost at P06).
 */
function performsIo(src: string): boolean {
  return /\basync\b|\bawait\b|\bPromise\b/.test(src);
}

function exemptReason(file: string): string | null {
  const rel = relative(ROOT, file).replace(/\\/g, "/");
  for (const [pattern, why] of EXEMPT) if (pattern.test(rel)) return why;
  return null;
}

describe("every exported mutator is authorized server-side", () => {
  it("service modules", () => {
    const offenders: string[] = [];
    for (const file of walk(resolve(ROOT, "src/lib"))) {
      if (exemptReason(file)) continue;
      const src = readFileSync(file, "utf8");
      const guarded = /requirePermission|requireAll|requireStaffSession/.test(src);
      if (guarded) continue;
      // A synchronous module cannot write to the database, so its exported verbs cannot be
      // unauthorized mutations.
      if (!performsIo(src)) continue;
      for (const m of src.matchAll(MUTATOR)) {
        offenders.push(`${relative(ROOT, file)}: ${m[1]}()`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("server actions", () => {
    const offenders: string[] = [];
    for (const file of walk(resolve(ROOT, "src/server/actions"))) {
      const src = readFileSync(file, "utf8");
      if (/requirePermission|requireAll|requireStaffSession|requireCustomerSession/.test(src))
        continue;
      if (/export\s+(?:async\s+)?function|export\s+const/.test(src)) {
        offenders.push(relative(ROOT, file));
      }
    }
    expect(offenders).toEqual([]);
  });

  it("admin route handlers", () => {
    const offenders: string[] = [];
    for (const file of walk(resolve(ROOT, "src/app/api"))) {
      if (!/route\.tsx?$/.test(file)) continue;
      const rel = relative(ROOT, file).replace(/\\/g, "/");
      if (!rel.includes("/admin/")) continue;
      const src = readFileSync(file, "utf8");
      if (!/requirePermission|requireAll|requireStaffSession/.test(src)) {
        offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the guard itself is wired to real directories", () => {
    // A guard pointed at a path that does not exist passes forever and proves nothing.
    expect(existsSync(resolve(ROOT, "src/lib"))).toBe(true);
    expect(existsSync(resolve(ROOT, "src/server/actions"))).toBe(true);
    expect(existsSync(resolve(ROOT, "src/app/api"))).toBe(true);
    // And it must actually detect a violation when one exists.
    const sample = "export async function updateThing() { return 1; }";
    expect([...sample.matchAll(MUTATOR)].length).toBe(1);

    // The I/O test must separate the two cases it exists to separate, in both directions.
    expect(performsIo("export async function saveThing() { await db.x(); }")).toBe(true);
    expect(performsIo("export function applyRule(a: bigint) { return a; }")).toBe(false);
  });
});

describe("the TOTP privilege line is derived, not hand-listed", () => {
  it("rolesRequiringTotp() matches the matrix", async () => {
    const { rolesRequiringTotp, ROLE_MATRIX, TOTP_REQUIRED_PERMISSIONS } =
      await import("@/lib/rbac/catalogue");
    const required = rolesRequiringTotp();
    // 07 §1.9: owner, admin, catalog_manager and order_manager must enrol.
    expect([...required].sort()).toEqual(
      ["admin", "catalog_manager", "order_manager", "owner"].sort(),
    );
    // And it is DERIVED: every listed role really does hold a line permission.
    const line = new Set<string>(TOTP_REQUIRED_PERMISSIONS);
    for (const role of required) {
      expect(ROLE_MATRIX[role].some((k) => line.has(k))).toBe(true);
    }
  });
});
