import "server-only";
import { hash, verify } from "@node-rs/argon2";
import { appEnv, secret } from "@/lib/config/env";

/**
 * Password hashing — 07 §1.4. argon2id with a server-side pepper.
 *
 * The pepper is the difference between a stolen database being immediately crackable and
 * being useless without a second breach of the application host. It lives in an env var,
 * not in the database, which is the entire point.
 */

/** OWASP argon2id baseline. Raising these later is a constant change plus time, never a
 *  migration and never a forced reset — because the PHC string carries its parameters. */
export const ARGON2_PARAMS = {
  // `Algorithm.Argon2id` is an ambient CONST enum, which `isolatedModules` (required by
  // Next) forbids importing. The literal is the same value; the mapping is
  // Argon2d = 0, Argon2i = 1, Argon2id = 2, and `tests/unit/password.test.ts` asserts the
  // produced PHC string actually starts `$argon2id$` so a wrong constant cannot pass.
  algorithm: 2,
  memoryCost: 19_456, // KiB = 19 MiB
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
} as const;

function pepper(): Buffer | undefined {
  const raw = secret("PASSWORD_PEPPER");
  if (!raw) {
    // Deliberately not a hard failure in local/test: the pepper is a production control
    // and requiring it would make every developer machine need a secret to run a test.
    // check-env.ts requires it when APP_ENV=production.
    if (appEnv() === "production") {
      throw new Error("PASSWORD_PEPPER is required in production (07 §1.4).");
    }
    return undefined;
  }
  return Buffer.from(raw, "utf8");
}

export async function hashPassword(plaintext: string): Promise<string> {
  const secret = pepper();
  return hash(plaintext, { ...ARGON2_PARAMS, ...(secret ? { secret } : {}) });
}

export async function verifyPassword(hashString: string, plaintext: string): Promise<boolean> {
  const secret = pepper();
  try {
    return await verify(hashString, plaintext, {
      ...ARGON2_PARAMS,
      ...(secret ? { secret } : {}),
    });
  } catch {
    // A malformed stored hash must be a failed login, never a thrown 500 that
    // distinguishes "this account exists but is broken" from "wrong password".
    return false;
  }
}

/**
 * Parse the PHC string's m/t/p and report whether it was made with weaker parameters
 * than today's. Callers rehash on SUCCESSFUL login, inside the transaction that writes
 * `last_login_at` — so raising the cost is gradual and invisible (07 §1.4).
 */
export function needsRehash(hashString: string): boolean {
  const m = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$/.exec(hashString);
  if (!m) return true; // unknown or legacy format — rehash it
  const [memoryCost, timeCost, parallelism] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return (
    memoryCost < ARGON2_PARAMS.memoryCost ||
    timeCost < ARGON2_PARAMS.timeCost ||
    parallelism < ARGON2_PARAMS.parallelism
  );
}
