/**
 * Cookie names, TTLs and other fixed values — 07 §1.1, §1.3.
 * No secrets here; this module is importable from the edge.
 */

export const COOKIE = {
  adminSession: "md_admin",
  customerSession: "md_session",
  totpChallenge: "md_totp",
  cart: "md_cart",
  market: "md_market",
  consent: "md_consent",
} as const;

export type CookieKey = keyof typeof COOKIE;

/**
 * `__Host-` is a BROWSER-ENFORCED guarantee that the cookie was set by this exact origin,
 * over HTTPS, with `Path=/` and no `Domain`. That is precisely the defence against a
 * subdomain — a preview deployment, a mis-parked marketing host — writing a cookie the
 * production origin will then read and trust.
 *
 * It cannot be used on plain HTTP, so local development gets the bare name.
 * `md_totp` keeps `Path=/admin` and therefore can never carry the prefix; it is five
 * minutes long and grants nothing but the second step of a login whose first step
 * already passed (07 §1.3).
 */
export function cookieName(key: CookieKey, appEnv: string): string {
  const base = COOKIE[key];
  if (appEnv === "local") return base;
  if (key === "totpChallenge") return base; // Path=/admin — prefix impossible
  return `__Host-${base}`;
}

/** 07 §1.1. Staff sessions are short and idle out; customer sessions are long and do not. */
export const SESSION_TTL = {
  /** Absolute lifetime of a staff session. */
  adminHours: 12,
  /**
   * Staff idle window. A shop-floor machine left unlocked is the realistic threat in a
   * retail business, and it is the reason `md_admin` is also a browser-session cookie.
   */
  adminIdleMinutes: 60,
  /** Absolute lifetime of a customer session. No idle timeout: signing a shopper out
   *  mid-browse to save nothing is a worse trade than the marginal risk. */
  customerHours: 720,
  /** The staff TOTP challenge between password and second factor. */
  totpChallengeSeconds: 300,
} as const;

export const CART_TOKEN_DAYS = 90;
export const MARKET_COOKIE_DAYS = 365;

/** Token lifetimes — 07 §1.5. */
export const TOKEN_TTL = {
  emailVerificationHours: 24,
  passwordResetMinutes: 30,
  staffInviteHours: 72,
  customerOtpMinutes: 10,
  adminRecoveryMinutes: 10,
  dataExportHours: 24,
} as const;

/** 32 bytes of entropy for every opaque token in the system (07 §1.5). */
export const TOKEN_BYTES = 32;
