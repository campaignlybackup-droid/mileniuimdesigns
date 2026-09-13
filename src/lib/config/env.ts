/**
 * The ONLY module permitted to read `process.env` (01 §2.2).
 *
 * The bug that rule prevents: an unvalidated, possibly-`undefined` secret read at
 * request time — which fails in production, on a real order, rather than at boot.
 *
 * Two tiers, deliberately:
 *   - `server` keys are required to BOOT. A missing one is a startup failure.
 *   - `integrations` are OPTIONAL and degrade to a visible `unconfigured` state.
 *     They never fake success (hard rule 7).
 */
import { z } from "zod";

const bootSchema = z.object({
  APP_ENV: z.enum(["local", "preview", "production"]).default("local"),
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_DEFAULT_MARKET: z.string().length(2),
  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().min(1),
  DATABASE_CONNECTION_LIMIT: z.coerce.number().int().positive().default(5),
});

export type BootEnv = z.infer<typeof bootSchema>;

let cached: BootEnv | undefined;

export function env(): BootEnv {
  if (cached) return cached;
  const parsed = bootSchema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(
      `Environment is not valid. Offending keys: ${missing}. ` +
        `See docs/architecture/01-stack-and-structure.md §4 and run scripts/check-env.ts.`,
    );
  }
  cached = parsed.data;
  return cached;
}

/**
 * Every optional integration and what its absence means for the customer.
 * A screen reading `unconfigured` says so; it never shows a zero dressed as a
 * measurement, a sample, or a fake success (hard rule 7).
 */
export type IntegrationKey =
  | "stripe"
  | "razorpay"
  | "cloudinary"
  | "resend"
  | "sentry"
  | "ga4"
  | "gtm"
  | "meta_pixel"
  | "meta_capi"
  | "google_ads"
  | "otp_sms"
  | "metal_rate_api"
  | "stripe_tax"
  | "indexnow";

export type IntegrationState = "configured" | "unconfigured";

/** Which env keys each integration needs before it may be called at all. */
const INTEGRATION_KEYS: Record<IntegrationKey, readonly string[]> = {
  stripe: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
  razorpay: ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"],
  cloudinary: ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"],
  resend: ["RESEND_API_KEY"],
  sentry: ["SENTRY_DSN"],
  ga4: ["NEXT_PUBLIC_GA4_MEASUREMENT_ID"],
  gtm: ["NEXT_PUBLIC_GTM_CONTAINER_ID"],
  meta_pixel: ["NEXT_PUBLIC_META_PIXEL_ID"],
  meta_capi: ["META_CAPI_ACCESS_TOKEN"],
  google_ads: ["NEXT_PUBLIC_GOOGLE_ADS_ID"],
  otp_sms: ["OTP_SMS_PROVIDER", "OTP_SMS_API_KEY"],
  metal_rate_api: ["METAL_RATE_API_URL", "METAL_RATE_API_KEY"],
  stripe_tax: ["STRIPE_SECRET_KEY"],
  indexnow: ["INDEXNOW_KEY"],
};

export function integrationStatus(): Record<IntegrationKey, IntegrationState> {
  const out = {} as Record<IntegrationKey, IntegrationState>;
  for (const [key, needs] of Object.entries(INTEGRATION_KEYS) as [
    IntegrationKey,
    readonly string[],
  ][]) {
    out[key] = needs.every((k) => Boolean(process.env[k])) ? "configured" : "unconfigured";
  }
  return out;
}

/**
 * Optional server secrets. Not in the boot schema because their absence is a designed
 * state in local and test — a developer machine should not need a production secret to
 * run a test — but `check-env.ts` requires them when APP_ENV=production.
 *
 * They live HERE because env.ts is the only module permitted to read process.env, and
 * that rule is worth more than the convenience of reading them where they are used.
 */
export function secret(name: "PASSWORD_PEPPER" | "AUTH_SECRET" | "GIFT_CARD_CODE_PEPPER" | "OTP_HASH_PEPPER"): string | undefined {
  return process.env[name];
}

export function appEnv(): string {
  return process.env["APP_ENV"] ?? "local";
}

export function missingKeysFor(key: IntegrationKey): string[] {
  return INTEGRATION_KEYS[key].filter((k) => !process.env[k]);
}
