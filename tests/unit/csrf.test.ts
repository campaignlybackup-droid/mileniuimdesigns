import { beforeAll, describe, expect, it } from "vitest";
import { assertSameOrigin, requiresSameOrigin } from "@/lib/security/origin";
import { ForbiddenError } from "@/lib/errors";

beforeAll(() => {
  process.env["NEXT_PUBLIC_APP_URL"] = "https://millenniumdesigns.test";
  process.env["DATABASE_URL"] ??= "postgres://x/y";
  process.env["DIRECT_URL"] ??= "postgres://x/y";
  process.env["NEXT_PUBLIC_DEFAULT_MARKET"] ??= "US";
});

const req = (headers: Record<string, string>) =>
  new Request("https://millenniumdesigns.test/api/cart", { method: "POST", headers });

/** Commissioned by 07 §5.4. */
describe("assertSameOrigin", () => {
  it("allows a matching Origin", () => {
    expect(() => assertSameOrigin(req({ origin: "https://millenniumdesigns.test" }))).not.toThrow();
  });

  it("refuses a foreign Origin", () => {
    expect(() => assertSameOrigin(req({ origin: "https://evil.test" }))).toThrow(ForbiddenError);
  });

  it("refuses a look-alike Origin", () => {
    // Substring matching would pass all three of these. Origin comparison is exact.
    for (const o of [
      "https://millenniumdesigns.test.evil.test",
      "https://evil.test/?x=https://millenniumdesigns.test",
      "http://millenniumdesigns.test", // scheme differs
    ]) {
      expect(() => assertSameOrigin(req({ origin: o })), o).toThrow(ForbiddenError);
    }
  });

  it("falls back to Referer when Origin is absent", () => {
    expect(() =>
      assertSameOrigin(req({ referer: "https://millenniumdesigns.test/cart" })),
    ).not.toThrow();
  });

  it("refuses a foreign Referer", () => {
    expect(() => assertSameOrigin(req({ referer: "https://evil.test/page" }))).toThrow(
      ForbiddenError,
    );
  });

  it("REFUSES a request with neither header — the default is deny", () => {
    // The load-bearing case. Allowing it would undo the control for exactly the client an
    // attacker controls.
    expect(() => assertSameOrigin(req({}))).toThrow(ForbiddenError);
  });

  it("refuses an unparseable Referer rather than ignoring it", () => {
    expect(() => assertSameOrigin(req({ referer: "not a url" }))).toThrow(ForbiddenError);
  });

  it("prefers Origin over Referer when both are present and disagree", () => {
    expect(() =>
      assertSameOrigin(
        req({ origin: "https://evil.test", referer: "https://millenniumdesigns.test/" }),
      ),
    ).toThrow(ForbiddenError);
  });
});

describe("which routes are subject to the check", () => {
  it("covers every cookie-authenticated kind", () => {
    for (const k of ["cart", "customer", "staff"] as const) {
      expect(requiresSameOrigin(k)).toBe(true);
    }
  });

  it("exempts the kinds that are cross-origin or non-browser by construction", () => {
    // Stripe does not send an Origin header. A webhook authenticates by HMAC instead,
    // and subjecting it to this check would simply break payments (07 §5.4).
    for (const k of ["signature", "cron", "secret", "public"] as const) {
      expect(requiresSameOrigin(k)).toBe(false);
    }
  });
});
