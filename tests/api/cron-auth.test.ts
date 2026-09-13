import { beforeAll, describe, expect, it } from "vitest";
import { assertCronRequest } from "@/lib/security/cron";
import { UnauthenticatedError } from "@/lib/errors";

/**
 * Commissioned by 09 P04A exit criterion (c):
 * "every cron route rejects a request lacking BOTH CRON_SECRET and x-vercel-cron with 401".
 */
beforeAll(() => {
  process.env["CRON_SECRET"] = "s".repeat(48);
});

const req = (headers: Record<string, string> = {}) =>
  new Request("https://millenniumdesigns.test/api/cron/run-jobs", { headers });

describe("cron authentication", () => {
  it("accepts the platform scheduler's own header", () => {
    expect(() => assertCronRequest(req({ "x-vercel-cron": "1" }))).not.toThrow();
  });

  it("accepts a correct bearer secret", () => {
    expect(() =>
      assertCronRequest(req({ authorization: `Bearer ${"s".repeat(48)}` })),
    ).not.toThrow();
  });

  it("REFUSES a request with neither", () => {
    // A cron route is a publicly reachable URL that does privileged work with no user.
    expect(() => assertCronRequest(req())).toThrow(UnauthenticatedError);
  });

  it("refuses a wrong secret", () => {
    expect(() => assertCronRequest(req({ authorization: `Bearer ${"x".repeat(48)}` }))).toThrow(
      UnauthenticatedError,
    );
  });

  it("refuses a secret of the wrong length without leaking that fact by timing", () => {
    // The length check short-circuits before timingSafeEqual, which would throw on a
    // length mismatch. Both paths are a plain refusal.
    expect(() => assertCronRequest(req({ authorization: "Bearer short" }))).toThrow(
      UnauthenticatedError,
    );
  });

  it("refuses a bare secret with no Bearer scheme", () => {
    expect(() => assertCronRequest(req({ authorization: "s".repeat(48) }))).toThrow(
      UnauthenticatedError,
    );
  });

  it("returns 401, not 403 — the caller is unidentified, not under-privileged", () => {
    try {
      assertCronRequest(req());
    } catch (e) {
      expect((e as UnauthenticatedError).httpStatus).toBe(401);
    }
  });
});
