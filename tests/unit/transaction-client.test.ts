import { describe, expect, it } from "vitest";
import { codeOf, sourceFiles } from "../support/source";

/**
 * Commissioned by 01 §1.2 and the defect recorded three times in `ResolveContext.client`.
 *
 * **The defect.** A service that reads the database can be called from a request path (where
 * the global client is right) or from inside an open interactive transaction (where it is
 * wrong). Reaching for the global inside a transaction issues the query on a DIFFERENT
 * connection: on the local single-connection engine that blocks until the transaction times
 * out eight seconds later; on a real Postgres it reads OUTSIDE the transaction's snapshot, so
 * half a cart can be priced against data the other half cannot see. The second is worse,
 * because it does not fail — it just charges the wrong number.
 *
 * It happened at P12 in the recalc preview, at P20 in cart revalidation, and at P20 again in
 * the market switcher. Each time the fix was to thread the client through; each time the
 * lesson was written down as a comment; each time the next author skipped the optional
 * parameter and lost an afternoon to a timeout that names the wrong thing.
 *
 * **The control.** The parameter is required and has NO default, so omitting it is a compile
 * error. That is enforced by the typechecker, not here. What this test pins is the thing the
 * typechecker cannot: that nobody restores the default. `client = db` is a one-character-class
 * edit that looks like tidying up call sites and silently reopens all three defects.
 */

const GUARDED = ["src/lib/pricing/resolve.ts", "src/lib/inventory/availability.ts"] as const;

describe("a transaction-capable read takes its client, and never defaults it", () => {
  for (const file of GUARDED) {
    it(`${file} declares no default client`, () => {
      const code = codeOf(file);
      // `client: X = db` or `client = db`, on one declaration line. The type annotation is
      // `Pick<typeof db, "$queryRaw">` — it contains BOTH a comma and the token `db`, so a
      // character class that stops at a comma never reaches the default and the guard passes
      // vacuously. It did exactly that when first written, and was caught only by deliberately
      // reintroducing the default. Match to end of line instead.
      expect(
        /\bclient\s*(?::[^\n]*?)?=\s*db\b/.test(code),
        `${file} gives the client a default. That is the exact edit that reopens the P12/P20 ` +
          `defects: every existing call site keeps compiling, and the next one written inside ` +
          `a transaction silently reads on another connection.`,
      ).toBe(false);
    });
  }

  it("ResolveContext.client is not optional", () => {
    const code = codeOf("src/lib/pricing/resolve.ts");
    const block = /export type ResolveContext = \{[\s\S]*?\n\};/.exec(code);
    expect(block, "ResolveContext has moved or been renamed").not.toBeNull();
    expect(block![0]).toMatch(/\bclient:\s/);
    expect(
      block![0],
      "`client?:` makes the omission legal again, which is how it was missed three times",
    ).not.toMatch(/\bclient\?:/);
  });

  it("every cart module that opens a transaction passes a client into pricing", () => {
    // The narrow, high-value case stated directly rather than inferred: the cart is the one
    // place where a stale or cross-snapshot figure is CHARGED rather than merely displayed.
    const files = sourceFiles("src/lib/cart");
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const code = codeOf(file);
      if (!code.includes("resolvePriceBatch(") && !code.includes("getAvailability(")) continue;
      expect(
        /\bclient:\s*tx\b/.test(code) || /getAvailability\([^)]*,\s*tx\s*\)/.test(code),
        `${file} calls into pricing or availability but never passes the transaction`,
      ).toBe(true);
    }
  });
});
