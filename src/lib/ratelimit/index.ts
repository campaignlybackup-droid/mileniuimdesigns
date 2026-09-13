import "server-only";
import { createHmac } from "node:crypto";
import { rateLimitDb } from "@/lib/db/ratelimit-client";
import { secret } from "@/lib/config/env";
import { RateLimitedError } from "@/lib/errors";

/**
 * Fixed-window rate limiting over the `rate_limits` table — 07 §5.5.
 *
 * **`consume()` never joins the caller's transaction.** This is the whole design.
 *
 * 07 §1.6's login sequence increments `failed_login_count`, writes the rate-limit row and
 * writes an audit row, then throws. Wrapped in one `$transaction` — the natural way to
 * write it — all three roll back with the throw, and the counter reads 0 after ten
 * thousand guesses. The lockout, the audit trail and the limiter are all silently void.
 *
 * So this module holds its OWN connection. A caller cannot accidentally enrol it in a
 * transaction that is about to abort.
 */

export type RateLimitSpec = {
  /** A prefix from 11 §4.2. `tests/unit/ratelimit-keys.test.ts` rejects anything else. */
  readonly prefix: string;
  readonly limit: number;
  readonly windowSeconds: number;
  /**
   * What happens when the limiter ITSELF fails (database unreachable).
   *
   *  - `closed` — refuse the request. For anything touching credentials, money or a token
   *    oracle: a limiter that fails open on a login endpoint is not a limiter.
   *  - `open` — allow it. For telemetry and webhooks, where refusing loses data that
   *    matters more than the abuse it prevents.
   */
  readonly onFailure: "open" | "closed";
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

/**
 * Hash any key material that identifies a person.
 *
 * `rate_limits` deliberately has no foreign key and holds no identifier that resolves to
 * someone (11 §4.1). An email in the clear here would make the limiter table an
 * enumerable list of everyone who has ever tried to sign in.
 */
export function hashKeyMaterial(value: string): string {
  const key = secret("AUTH_SECRET") ?? "local-development-only";
  return createHmac("sha256", key).update(value.toLowerCase()).digest("base64url").slice(0, 32);
}

function windowStart(windowSeconds: number): Date {
  const ms = windowSeconds * 1000;
  return new Date(Math.floor(Date.now() / ms) * ms);
}

/**
 * Count one request against a key. Returns whether it is allowed; never throws for a
 * limit breach — see `enforce()` for the throwing form.
 */
export async function consume(
  spec: RateLimitSpec,
  keyMaterial: string,
): Promise<RateLimitResult> {
  const key = `${spec.prefix}:${keyMaterial}`;
  const start = windowStart(spec.windowSeconds);
  const expires = new Date(start.getTime() + spec.windowSeconds * 1000);

  try {
    // One statement, atomic. The conditional increment means two concurrent requests
    // cannot both read `count = limit - 1` and both proceed.
    const rows = await rateLimitDb().$queryRaw<{ count: number }[]>`
      INSERT INTO rate_limits (id, key, window_start, count, expires_at, created_at)
      VALUES (gen_random_uuid(), ${key}, ${start}, 1, ${expires}, now())
      ON CONFLICT (key, window_start)
      DO UPDATE SET count = rate_limits.count + 1
      RETURNING count
    `;
    const count = rows[0]?.count ?? 1;
    const remaining = Math.max(0, spec.limit - count);
    return {
      allowed: count <= spec.limit,
      remaining,
      retryAfterSeconds: Math.max(1, Math.ceil((expires.getTime() - Date.now()) / 1000)),
    };
  } catch {
    // The limiter itself failed. `closed` refuses; `open` allows. Neither is a default.
    return {
      allowed: spec.onFailure === "open",
      remaining: 0,
      retryAfterSeconds: spec.windowSeconds,
    };
  }
}

/** The throwing form. `RateLimitedError` carries the 429 and the Retry-After. */
export async function enforce(spec: RateLimitSpec, keyMaterial: string): Promise<void> {
  const result = await consume(spec, keyMaterial);
  if (!result.allowed) {
    throw new RateLimitedError("Too many requests.", {
      context: { prefix: spec.prefix, retryAfterSeconds: result.retryAfterSeconds },
    });
  }
}

/** Delete expired windows. Called by the cleanup cron. */
export async function pruneExpired(): Promise<number> {
  const n = await rateLimitDb().$executeRaw`DELETE FROM rate_limits WHERE expires_at < now()`;
  return Number(n);
}

/**
 * The specs this codebase uses, from 11 §4.2. Credential, money and token-oracle
 * endpoints fail CLOSED; telemetry fails open.
 */
export const LIMITS = {
  loginIp: { prefix: "login:ip", limit: 20, windowSeconds: 900, onFailure: "closed" },
  loginEmail: { prefix: "login:email", limit: 10, windowSeconds: 900, onFailure: "closed" },
  otpRequest: { prefix: "otp:identifier", limit: 5, windowSeconds: 3600, onFailure: "closed" },
  passwordReset: { prefix: "reset:email", limit: 5, windowSeconds: 3600, onFailure: "closed" },
  checkout: { prefix: "checkout:cart", limit: 30, windowSeconds: 600, onFailure: "closed" },
  couponApply: { prefix: "coupon:cart", limit: 20, windowSeconds: 600, onFailure: "closed" },
  search: { prefix: "search:ip", limit: 120, windowSeconds: 60, onFailure: "open" },
  adminSearch: {
    prefix: "admin-search:user",
    limit: 120,
    windowSeconds: 60,
    onFailure: "closed",
  },
  wishlistShare: {
    prefix: "wishlist-share:ip",
    limit: 60,
    windowSeconds: 3600,
    onFailure: "closed",
  },
  backInStockIp: { prefix: "bisr:ip", limit: 10, windowSeconds: 3600, onFailure: "closed" },
  backInStockEmail: {
    prefix: "bisr:email",
    limit: 5,
    windowSeconds: 86_400,
    onFailure: "closed",
  },
} as const satisfies Record<string, RateLimitSpec>;
