import { describe, expect, it, beforeAll, afterAll } from "vitest";
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
  const INTEGRATION_ENV_KEYS = [
    "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET",
    "RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET",
    "CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET",
    "RESEND_API_KEY", "SENTRY_DSN",
    "NEXT_PUBLIC_GA4_MEASUREMENT_ID", "NEXT_PUBLIC_GTM_CONTAINER_ID",
    "NEXT_PUBLIC_META_PIXEL_ID", "META_CAPI_ACCESS_TOKEN", "NEXT_PUBLIC_GOOGLE_ADS_ID",
    "OTP_SMS_PROVIDER", "OTP_SMS_API_KEY",
    "METAL_RATE_API_URL", "METAL_RATE_API_KEY", "INDEXNOW_KEY"
  ];
  const saved: Record<string, string | undefined> = {};

  beforeAll(() => {
    for (const k of INTEGRATION_ENV_KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterAll(() => {
    for (const k of INTEGRATION_ENV_KEYS) {
      if (saved[k] !== undefined) process.env[k] = saved[k];
      else delete process.env[k];
    }
  });

  const getStatus = () => integrationStatus();
  const getKeys = () => Object.keys(getStatus());

  it("is closed at fourteen", () => {
    expect(getKeys().length).toBe(14);
  });

  it("contains exactly the registry's members", () => {
    expect([...getKeys()].sort()).toEqual(
      [
        "cloudinary",
        "ga4",
        "google_ads",
        "gtm",
        "indexnow",
        "meta_capi",
        "meta_pixel",
        "metal_rate_api",
        "otp_sms",
        "razorpay",
        "resend",
        "sentry",
        "stripe",
        "stripe_tax",
      ].sort(),
    );
  });

  it("names at least one env var for every member", () => {
    // A member with no keys is permanently 'configured', which is a silent lie about a
    // feature that does not work (hard rule 7).
    for (const k of getKeys()) {
      const missing = missingKeysFor(k as Parameters<typeof missingKeysFor>[0]);
      expect(missing.length, `${k} names no env vars`).toBeGreaterThan(0);
    }
  });

  it("reports every integration as unconfigured in a bare test environment", () => {
    // Proves the default is 'unconfigured', not 'configured'. A default of configured
    // would let an unconfigured payment provider look ready.
    const currentStatus = getStatus();
    for (const k of getKeys()) {
      expect(currentStatus[k as keyof typeof currentStatus]).toBe("unconfigured");
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
    for (const k of getKeys()) {
      for (const v of missingKeysFor(k as Parameters<typeof missingKeysFor>[0])) {
        if (!documented.has(v)) undocumented.push(`${k}: ${v}`);
      }
    }
    expect(undocumented).toEqual([]);
  });
});
