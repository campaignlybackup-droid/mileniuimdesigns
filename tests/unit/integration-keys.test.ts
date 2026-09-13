import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { integrationStatus, missingKeysFor } from "@/lib/config/env";

/**
 * Commissioned by 11 §6 and 09 P04.
 *
 * 01 §4.9 presented the IntegrationKey union as complete while five documents widened it
 * by prose. The registry closed it at fourteen. This asserts the code agrees, and — more
 * usefully — that every member actually names the env vars it needs, so
 * `/admin/settings/integrations` can tell an owner what to go and get.
 */
describe("integration keys", () => {
  const status = integrationStatus();
  const keys = Object.keys(status);

  it("is closed at fourteen", () => {
    expect(keys.length).toBe(14);
  });

  it("contains exactly the registry's members", () => {
    expect([...keys].sort()).toEqual(
      [
        "cloudinary", "ga4", "google_ads", "gtm", "indexnow", "meta_capi", "meta_pixel",
        "metal_rate_api", "otp_sms", "razorpay", "resend", "sentry", "stripe", "stripe_tax",
      ].sort(),
    );
  });

  it("names at least one env var for every member", () => {
    // A member with no keys is permanently 'configured', which is a silent lie about a
    // feature that does not work (hard rule 7).
    for (const k of keys) {
      const missing = missingKeysFor(k as Parameters<typeof missingKeysFor>[0]);
      expect(missing.length, `${k} names no env vars`).toBeGreaterThan(0);
    }
  });

  it("reports every integration as unconfigured in a bare test environment", () => {
    // Proves the default is 'unconfigured', not 'configured'. A default of configured
    // would let an unconfigured payment provider look ready.
    for (const k of keys) {
      expect(status[k as keyof typeof status]).toBe("unconfigured");
    }
  });

  it("documents every named env var in .env.example", () => {
    const example = readFileSync(resolve(process.cwd(), ".env.example"), "utf8");
    const documented = new Set(
      example
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("#"))
        .map((l) => l.split("=")[0]!.trim()),
    );
    const undocumented: string[] = [];
    for (const k of keys) {
      for (const v of missingKeysFor(k as Parameters<typeof missingKeysFor>[0])) {
        if (!documented.has(v)) undocumented.push(`${k}: ${v}`);
      }
    }
    expect(undocumented).toEqual([]);
  });
});
