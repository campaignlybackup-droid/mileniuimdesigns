import "server-only";
import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { TOKEN_BYTES } from "@/lib/config/constants";

/**
 * Opaque token generation and lookup hashing — 07 §1.5.
 *
 * TWO hashing strategies, and the distinction is load-bearing:
 *
 *  - **SHA-256** for tokens looked up BY their hash (session, cart, order view, wishlist
 *    share). The lookup is `WHERE token_hash = $1`, so the hash must be deterministic.
 *    These are 32 bytes of CSPRNG output — 256 bits — so they are not brute-forceable and
 *    do not need a slow hash. A per-row salt would make the unique index uncollidable and
 *    the lookup impossible, which is the bug that Argon2id on `gift_cards.code_hash`
 *    would have caused (02 §2.7).
 *
 *  - **Argon2id** for tokens found by something else and THEN verified (`otp_requests`,
 *    found by `(purpose, identifier)`). Those include 6-digit codes, which are absolutely
 *    brute-forceable and need a slow hash with a per-row salt.
 */

/** 32 bytes, base64url. The plaintext exists only in transit. */
export function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/**
 * Deterministic lookup hash. For tokens the database finds BY hash.
 *
 * Returns a plain `Uint8Array`, not a Node `Buffer`: Prisma's `Bytes` field is typed
 * `Uint8Array<ArrayBuffer>` while `Buffer` is `Uint8Array<ArrayBufferLike>`, which can be
 * backed by a `SharedArrayBuffer`. Converting here rather than at each call site means
 * the distinction is handled once.
 */
export function hashToken(token: string): Uint8Array<ArrayBuffer> {
  const digest = createHash("sha256").update(token, "utf8").digest();
  const out = new Uint8Array(new ArrayBuffer(digest.byteLength));
  out.set(digest);
  return out;
}

/**
 * Constant-time comparison. Used where a hash is compared in application code rather
 * than by the database, so that a timing difference cannot reveal a prefix.
 */
export function tokensEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * An emailed link is `<id>.<token>` — a PUBLIC SELECTOR plus a SECRET.
 *
 * Argon2id salts per row, so `WHERE code_hash = argon2(token)` matches nothing, ever.
 * The only implementations of a bare-token link are "verify against every live row" or a
 * silent switch to an unsalted hash — and the second is exactly the two-hashing-paths bug
 * the rule exists to prevent. The id finds the row; the secret is then verified against
 * it (07 §4.2).
 */
export function formatLinkToken(id: string, token: string): string {
  return `${id}.${token}`;
}

export function parseLinkToken(value: string): { id: string; token: string } | null {
  const i = value.indexOf(".");
  if (i <= 0 || i === value.length - 1) return null;
  const id = value.slice(0, i);
  const token = value.slice(i + 1);
  // The id half must look like a UUID before it reaches the database as a parameter.
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return { id, token };
}

/** 6-digit numeric code, uniformly distributed. `randomInt` is rejection-sampled; `%` is not. */
export function generateNumericCode(digits = 6): string {
  const max = 10 ** digits;
  return String(randomInt(0, max)).padStart(digits, "0");
}
