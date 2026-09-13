import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  PERMISSIONS,
  PERMISSION_KEYS,
  ROLE_KEYS,
  ROLE_MATRIX,
  grantedKeys,
} from "@/lib/rbac/catalogue";

/**
 * Commissioned by 09 P03 and 07 §3.7.
 *
 * Three copies of one list — the catalogue, the `permissions` rows and every
 * `requirePermission()` literal — is how a permission ends up enforced in the UI and not
 * in the service. This asserts they cannot diverge silently.
 */
describe("permission catalogue", () => {
  it("has exactly 73 keys — the count is pinned on purpose", () => {
    // Pinned as a literal so that adding a key without seeding it fails HERE, at P03,
    // rather than at P29 where the same failure is expensive. It has already done its
    // job once: the catalogue grew to 73 when `review.moderate` was added during the
    // reviews reconciliation, while 09, 02 and 07 still said 72.
    expect(PERMISSION_KEYS.length).toBe(73);
    expect(PERMISSIONS.length).toBe(73);
  });

  it("has no duplicate keys", () => {
    expect(new Set(PERMISSION_KEYS).size).toBe(PERMISSION_KEYS.length);
  });

  it("keys are `resource.action` and match their parsed columns", () => {
    for (const p of PERMISSIONS) {
      expect(p.key).toMatch(/^[a-z_]+\.[a-z_]+$/);
      expect(`${p.resource}.${p.action}`).toBe(p.key);
      expect(p.description.length).toBeGreaterThan(0);
    }
  });

  it("has seven roles", () => {
    expect(ROLE_KEYS.length).toBe(7);
    expect(Object.keys(ROLE_MATRIX).sort()).toEqual([...ROLE_KEYS].sort());
  });

  it("grants owner every key by EXPLICIT rows, not a runtime short-circuit", () => {
    // A short-circuit cannot be audited, cannot be revoked for one key, and silently
    // grants every permission added in future.
    expect([...ROLE_MATRIX.owner].sort()).toEqual([...PERMISSION_KEYS].sort());
  });

  it("grants every catalogue key to at least one role", () => {
    const granted = grantedKeys();
    const orphans = PERMISSION_KEYS.filter((k) => !granted.has(k));
    expect(orphans).toEqual([]);
  });

  it("grants nothing that is not in the catalogue", () => {
    const known = new Set<string>(PERMISSION_KEYS);
    for (const [role, keys] of Object.entries(ROLE_MATRIX)) {
      for (const k of keys) {
        expect(known.has(k), `${role} grants unknown key ${k}`).toBe(true);
      }
    }
  });

  it("keeps analyst read-only — no write permission anywhere", () => {
    // An "analyst" that can write is not an analyst. `export.run` is deliberately NOT
    // treated as a write: it reaches the export TOOL, and each resource additionally
    // requires its own read permission (plus `customer.export` for PII), so it can only
    // ever emit rows the holder could already see. `import.run` is the opposite — it
    // writes — and the assertion below proves analyst does not hold it.
    const READ_ONLY_EXCEPTIONS = new Set(["export.run"]);
    const writes = ROLE_MATRIX.analyst
      .filter((k) => !READ_ONLY_EXCEPTIONS.has(k))
      .filter((k) =>
        /\.(create|update|delete|publish|approve|refund|manage|adjust|transfer|fulfil|cancel|restore|hard_delete|anonymize|impersonate|retry|run|moderate)$/.test(
          k,
        ),
      );
    expect(writes).toEqual([]);
    expect(ROLE_MATRIX.analyst).not.toContain("import.run");
    // And it must not reach cost or PII export, which are the two things a read-only
    // reporting role could otherwise quietly exfiltrate.
    expect(ROLE_MATRIX.analyst).not.toContain("price.read_cost");
    expect(ROLE_MATRIX.analyst).not.toContain("customer.export");
    expect(ROLE_MATRIX.analyst).not.toContain("customer.read");
  });

  it("withholds supplier cost from every role below admin", () => {
    // prices.cost_minor and every derived margin. A merchandiser auditing prices does not
    // need to see what the house pays (04 §4).
    for (const role of ROLE_KEYS) {
      if (role === "owner" || role === "admin") continue;
      expect(ROLE_MATRIX[role]).not.toContain("price.read_cost");
    }
  });

  it("withholds hard media deletion from everyone but owner", () => {
    // It destroys the provider asset — there is nothing to restore afterwards.
    for (const role of ROLE_KEYS) {
      if (role === "owner") continue;
      expect(ROLE_MATRIX[role]).not.toContain("media.hard_delete");
    }
  });

  it("withholds refunds from roles with no financial responsibility", () => {
    for (const role of ["catalog_manager", "content_editor", "analyst", "inventory_manager"] as const) {
      expect(ROLE_MATRIX[role]).not.toContain("order.refund");
    }
  });
});

describe("no permission literal in src/ is missing from the catalogue", () => {
  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      if (entry === "generated" || entry === "node_modules") continue;
      const p = join(dir, entry);
      if (statSync(p).isDirectory()) walk(p, out);
      else if (/\.(ts|tsx)$/.test(p)) out.push(p);
    }
    return out;
  }

  it("finds every requirePermission()/can() literal in the catalogue", () => {
    const known = new Set<string>(PERMISSION_KEYS);
    const offenders: string[] = [];
    for (const file of walk(resolve(process.cwd(), "src"))) {
      if (file.endsWith("rbac/catalogue.ts")) continue;
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(
        /(?:requirePermission|can|requireAll)\s*\([^)]*?["']([a-z_]+\.[a-z_]+)["']/g,
      )) {
        if (!known.has(m[1]!)) offenders.push(`${file}: ${m[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
