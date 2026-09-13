import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  AppError,
  ERROR_CODES,
  ERROR_META,
  NotFoundError,
  ForbiddenError,
  ProviderError,
  SkuConflictError,
  ValidationError,
  toWireError,
} from "@/lib/errors";

/** Commissioned by 11 §2.3 and 09 §2.5. */
describe("error taxonomy", () => {
  it("is closed at 52 codes", () => {
    expect(ERROR_CODES.length).toBe(52);
    expect(new Set(ERROR_CODES).size).toBe(52);
  });

  it("gives every code exactly one status and one copy key", () => {
    for (const code of ERROR_CODES) {
      const meta = ERROR_META[code];
      expect(meta, `${code} has no metadata`).toBeDefined();
      expect(meta.httpStatus).toBeGreaterThanOrEqual(400);
      expect(meta.httpStatus).toBeLessThan(600);
      expect(meta.copyKey).toMatch(/^copy\.error\.[a-z_]+$/);
    }
  });

  it("derives the copy key from the code, with no exceptions", () => {
    for (const code of ERROR_CODES) {
      expect(ERROR_META[code].copyKey).toBe(`copy.error.${code.toLowerCase()}`);
    }
  });

  it("extends one base class — there is no second taxonomy", () => {
    expect(new NotFoundError("x")).toBeInstanceOf(AppError);
    expect(new ForbiddenError("x")).toBeInstanceOf(AppError);
    expect(new ValidationError("x")).toBeInstanceOf(AppError);
  });

  it("never puts the exception's own message or context on the wire", () => {
    // The wire carries a CODE and a COPY KEY — never the thrown message. This is the
    // assertion that matters: `safe` governs whether the resolved copy.error.* STRING may
    // be shown, and even a safe code must not ship the provider's raw payload.
    const wire = toWireError(
      new ProviderError("Stripe: card_declined — raw provider payload", {
        context: { secret: "sk_live_xxx" },
      }),
    );
    const json = JSON.stringify(wire);
    expect(json).not.toContain("sk_live");
    expect(json).not.toContain("card_declined");
    expect(json).not.toContain("Stripe");
    expect(Object.keys(wire).sort()).toEqual(["code", "copyKey", "httpStatus"]);
  });

  it("falls an UNSAFE code back to the generic copy key", () => {
    // 21 of the 52 are unsafe. `SKU_CONFLICT` tells a shopper which SKUs exist; the
    // merchandiser sees the detail in the admin, the shopper sees the generic message.
    const wire = toWireError(new SkuConflictError("SKU LBR-14YG-07 already exists"));
    expect(ERROR_META.SKU_CONFLICT.safe).toBe(false);
    expect(wire.copyKey).toBe("copy.error.internal");
    expect(JSON.stringify(wire)).not.toContain("LBR-14YG-07");
  });

  it("passes a SAFE code's own copy key through", () => {
    expect(toWireError(new NotFoundError("no such product")).copyKey).toBe(
      "copy.error.not_found",
    );
  });

  it("turns a non-AppError into INTERNAL rather than exposing it", () => {
    const wire = toWireError(new Error("connection string postgres://u:p@host/db"));
    expect(wire.code).toBe("INTERNAL");
    expect(wire.httpStatus).toBe(500);
    expect(JSON.stringify(wire)).not.toContain("postgres://");
  });

  it("never serialises context or cause", () => {
    const wire = toWireError(
      new NotFoundError("x", { context: { customerEmail: "a@b.test" } }),
    );
    expect(JSON.stringify(wire)).not.toContain("a@b.test");
  });
});

describe("no error code literal in src/ is missing from the taxonomy", () => {
  function walk(dir: string, out: string[] = []): string[] {
    for (const e of readdirSync(dir)) {
      if (e === "generated") continue;
      const p = join(dir, e);
      if (statSync(p).isDirectory()) walk(p, out);
      else if (/\.tsx?$/.test(p)) out.push(p);
    }
    return out;
  }

  it("finds every SCREAMING_SNAKE code literal in ERROR_CODES", () => {
    const known = new Set<string>(ERROR_CODES);
    const offenders: string[] = [];
    for (const file of walk(resolve(process.cwd(), "src"))) {
      if (file.endsWith("lib/errors.ts")) continue;
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(/readonly code = "([A-Z_]+)"/g)) {
        if (!known.has(m[1]!)) offenders.push(`${file}: ${m[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
