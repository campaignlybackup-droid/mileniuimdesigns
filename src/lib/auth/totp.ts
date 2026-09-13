import "server-only";
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";
import { hash as argonHash, verify as argonVerify } from "@node-rs/argon2";
import { secret } from "@/lib/config/env";

/**
 * TOTP — RFC 6238, 6 digits, 30-second step (07 §1.5, §1.9).
 *
 * Two things here are not standard and both are deliberate:
 *
 *  1. **The secret is encrypted at rest with a VERSIONED, self-describing ciphertext.**
 *     `users.totp_secret_encrypted` is AES-256-GCM under a key HKDF'd from `AUTH_SECRET`.
 *     Without the version prefix, rotating `AUTH_SECRET` would lock out every enrolled
 *     staff member simultaneously — including every holder of `user.manage`, which is the
 *     permission `resetTotp()` needs, so the recovery path would die with the same change.
 *     `AUTH_SECRET_PREVIOUS` lets a rotation decrypt old rows while new writes use the
 *     new key.
 *
 *  2. **Single use is enforced by `users.totp_last_step`,** not by hope. A code is valid
 *     for 30 seconds and a ±1 step window, which means a shoulder-surfed or
 *     phished code is replayable for up to 90 seconds unless the accepted step is
 *     recorded and `step <= totp_last_step` is rejected. That column is what makes
 *     "single use" a mechanism rather than a claim.
 */

const STEP_SECONDS = 30;
const DIGITS = 6;
/** ±1 step tolerates clock skew between the server and the authenticator. */
const WINDOW = 1;

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buf: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/=+$/, "").replace(/\s/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const c of clean) {
    const idx = B32.indexOf(c);
    if (idx === -1) throw new Error("Invalid base32 in TOTP secret");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function keyFor(version: number): Buffer {
  const base =
    version === 1
      ? secret("AUTH_SECRET")
      : (secret("AUTH_SECRET_PREVIOUS") ?? secret("AUTH_SECRET"));
  if (!base) throw new Error("AUTH_SECRET is required to encrypt or read a TOTP secret.");
  return Buffer.from(hkdfSync("sha256", Buffer.from(base), Buffer.alloc(0), Buffer.from("md-totp-v" + version), 32));
}

/** `v<n>:<iv b64>:<tag b64>:<ciphertext b64>` — self-describing, so a rotation is survivable. */
export function encryptSecret(plaintextBase32: string, version = 1): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFor(version), iv);
  const enc = Buffer.concat([cipher.update(plaintextBase32, "utf8"), cipher.final()]);
  return `v${version}:${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${enc.toString("base64")}`;
}

export function decryptSecret(stored: string): string {
  const m = /^v(\d+):([^:]+):([^:]+):(.+)$/.exec(stored);
  if (!m) throw new Error("Unrecognised TOTP ciphertext format.");
  const version = Number(m[1]);
  const decipher = createDecipheriv("aes-256-gcm", keyFor(version), Buffer.from(m[2]!, "base64"));
  decipher.setAuthTag(Buffer.from(m[3]!, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(m[4]!, "base64")), decipher.final()]).toString("utf8");
}

export function generateSecret(): string {
  return base32Encode(randomBytes(20));
}

/** The step counter for a given instant. Exported so callers can persist the accepted one. */
export function stepFor(at: Date): number {
  return Math.floor(at.getTime() / 1000 / STEP_SECONDS);
}

/** The code an authenticator app would show at `at`. Test seam — see below. */
export function generateCode(secretBase32: string, at: Date = new Date()): string {
  return generateCodeForStep(secretBase32, stepFor(at));
}

/**
 * Derive the code for a given step.
 *
 * Nothing in PRODUCTION calls this — the authenticator app generates codes and the server
 * only verifies them. It is exported so that tests can act as the authenticator, which is
 * the only honest way to test verification: a test that cannot produce a valid code ends
 * up asserting only that invalid ones fail.
 */
export function generateCodeForStep(secretBase32: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac("sha1", base32Decode(secretBase32)).update(counter).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    (digest[offset + 1]! << 16) |
    (digest[offset + 2]! << 8) |
    digest[offset + 3]!;
  return String(binary % 10 ** DIGITS).padStart(DIGITS, "0");
}

export type TotpResult =
  | { ok: true; step: number }
  | { ok: false; reason: "malformed" | "mismatch" | "replayed" };

/**
 * Verify a code against the ±1 step window, refusing any step at or below the last
 * accepted one.
 *
 * `lastStep` is `users.totp_last_step`. Without it a code stays replayable for its whole
 * validity window, which is the difference between a second factor and a second field.
 */
export function verifyTotp(
  secretBase32: string,
  code: string,
  opts: { at?: Date; lastStep?: bigint | number | null } = {},
): TotpResult {
  if (!/^\d{6}$/.test(code)) return { ok: false, reason: "malformed" };
  const now = opts.at ?? new Date();
  const current = stepFor(now);
  const last = opts.lastStep == null ? null : Number(opts.lastStep);

  for (let delta = -WINDOW; delta <= WINDOW; delta++) {
    const step = current + delta;
    const expected = generateCodeForStep(secretBase32, step);
    // Constant-time: a character-by-character comparison leaks a prefix over enough tries.
    const a = Buffer.from(expected);
    const b = Buffer.from(code);
    if (a.length === b.length && timingSafeEqual(a, b)) {
      if (last !== null && step <= last) return { ok: false, reason: "replayed" };
      return { ok: true, step };
    }
  }
  return { ok: false, reason: "mismatch" };
}

/** The `otpauth://` URI an authenticator app scans. The secret never leaves the server
 *  except inside this URI, shown once at enrolment. */
export function provisioningUri(secretBase32: string, accountEmail: string): string {
  const issuer = encodeURIComponent("Millennium Designs");
  const account = encodeURIComponent(accountEmail);
  return `otpauth://totp/${issuer}:${account}?secret=${secretBase32}&issuer=${issuer}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;
}

const RECOVERY_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford: no I, L, O, U

/** Ten codes, shown once. Stored as argon2id hashes — they are passwords, not lookups. */
export function generateRecoveryCodes(count = 10, length = 10): string[] {
  return Array.from({ length: count }, () => {
    const bytes = randomBytes(length);
    return Array.from(bytes, (b) => RECOVERY_ALPHABET[b % 32]).join("");
  });
}

export async function hashRecoveryCodes(codes: string[]): Promise<string[]> {
  return Promise.all(codes.map((c) => argonHash(c, { memoryCost: 19_456, timeCost: 2, parallelism: 1 })));
}

/**
 * Consume a recovery code. Returns the REMAINING hashes with the used one spliced out —
 * a recovery code that survives its use is a password with extra steps.
 */
export async function consumeRecoveryCode(
  storedHashes: string[],
  supplied: string,
): Promise<{ ok: boolean; remaining: string[] }> {
  const normalised = supplied.toUpperCase().replace(/[\s-]/g, "");
  for (let i = 0; i < storedHashes.length; i++) {
    let matched = false;
    try {
      matched = await argonVerify(storedHashes[i]!, normalised);
    } catch {
      matched = false;
    }
    if (matched) {
      const remaining = [...storedHashes.slice(0, i), ...storedHashes.slice(i + 1)];
      return { ok: true, remaining };
    }
  }
  return { ok: false, remaining: storedHashes };
}
