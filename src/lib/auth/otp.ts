import "server-only";
import { hash as argonHash, verify as argonVerify } from "@node-rs/argon2";
import type { Tx } from "@/lib/db/transaction";
import { db } from "@/lib/db/client";
import { generateNumericCode, generateToken } from "@/lib/auth/tokens";
import { secret } from "@/lib/config/env";
import { TOKEN_TTL } from "@/lib/config/constants";

/**
 * One-time codes and emailed link tokens — 07 §1.5, §1.7, §1.8.
 *
 * Transport-agnostic by construction. `otp_requests.identifier` takes an email or an
 * E.164 phone number, so the SAME service serves the US email/password market and the
 * India phone/OTP expectation without a second implementation.
 *
 * **Email remains the account key in every market.** Phone is an additional login method
 * bound to the same `customers` row — it never becomes a second account identity, because
 * two identity columns means two accounts for one person the first time someone changes
 * their number (07 §1.8).
 */

export type OtpChannel = "email" | "sms";
export type OtpPurpose =
  | "customer_login"
  | "email_verification"
  | "password_reset"
  | "admin_2fa_recovery"
  | "staff_invite"
  | "data_export";

const ARGON = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

function peppered(code: string): string {
  // The pepper means a stolen `otp_requests` table is not a set of usable codes.
  return `${code}${secret("OTP_HASH_PEPPER") ?? ""}`;
}

const TTL_MINUTES: Record<OtpPurpose, number> = {
  customer_login: TOKEN_TTL.customerOtpMinutes,
  email_verification: TOKEN_TTL.emailVerificationHours * 60,
  password_reset: TOKEN_TTL.passwordResetMinutes,
  admin_2fa_recovery: TOKEN_TTL.adminRecoveryMinutes,
  staff_invite: TOKEN_TTL.staffInviteHours * 60,
  data_export: TOKEN_TTL.dataExportHours * 60,
};

/** A 6-digit code is typed by a human; a link token is clicked. Codes are short-lived
 *  and attempt-capped precisely because six digits is brute-forceable. */
const IS_NUMERIC: Record<OtpPurpose, boolean> = {
  customer_login: true,
  admin_2fa_recovery: true,
  email_verification: false,
  password_reset: false,
  staff_invite: false,
  data_export: false,
};

export type IssuedOtp = {
  /** The value to send. For a link purpose this is `<requestId>.<token>` (07 §4.2). */
  deliverable: string;
  requestId: string;
  expiresAt: Date;
};

/**
 * Issue a code or link token.
 *
 * Any live, unconsumed request for the same (purpose, identifier) is invalidated first.
 * Without that, requesting a second code leaves the first one valid — so "resend" doubles
 * the attacker's guessing surface rather than replacing it.
 */
export async function issueOtp(
  tx: Tx,
  input: {
    purpose: OtpPurpose;
    identifier: string;
    customerId?: string | null;
    userId?: string | null;
    maxAttempts?: number;
  },
): Promise<IssuedOtp> {
  const identifier = input.identifier.trim().toLowerCase();
  const numeric = IS_NUMERIC[input.purpose];
  const plain = numeric ? generateNumericCode() : generateToken();
  const expiresAt = new Date(Date.now() + TTL_MINUTES[input.purpose] * 60_000);

  await tx.otpRequest.updateMany({
    where: { purpose: input.purpose, identifier, consumedAt: null },
    data: { consumedAt: new Date() },
  });

  const row = await tx.otpRequest.create({
    data: {
      purpose: input.purpose,
      identifier,
      codeHash: await argonHash(peppered(plain), ARGON),
      customerId: input.customerId ?? null,
      userId: input.userId ?? null,
      // Five guesses at a six-digit code, then the row is spent. That is what keeps a
      // 10-minute window from being 10 minutes of unlimited guessing.
      maxAttempts: input.maxAttempts ?? (numeric ? 5 : 3),
      expiresAt,
    },
    select: { id: true },
  });

  return {
    deliverable: numeric ? plain : `${row.id}.${plain}`,
    requestId: row.id,
    expiresAt,
  };
}

export type OtpVerification =
  | { ok: true; requestId: string; customerId: string | null; userId: string | null }
  | { ok: false; reason: "not_found" | "expired" | "consumed" | "too_many_attempts" | "mismatch" };

/**
 * Verify a 6-digit code, found by (purpose, identifier) and THEN verified.
 *
 * The row is never looked up by its hash — argon2id salts per row, so a lookup by hash
 * matches nothing, ever. That distinction is why `otp_requests.code_hash` is argon2id
 * while `sessions.token_hash` is SHA-256 (07 §1.5).
 */
export async function verifyOtpCode(input: {
  purpose: OtpPurpose;
  identifier: string;
  code: string;
}): Promise<OtpVerification> {
  const identifier = input.identifier.trim().toLowerCase();
  const row = await db.otpRequest.findFirst({
    where: { purpose: input.purpose, identifier },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, codeHash: true, attempts: true, maxAttempts: true,
      consumedAt: true, expiresAt: true, customerId: true, userId: true,
    },
  });
  if (!row) return { ok: false, reason: "not_found" };
  if (row.consumedAt) return { ok: false, reason: "consumed" };
  if (row.expiresAt <= new Date()) return { ok: false, reason: "expired" };
  if (row.attempts >= row.maxAttempts) return { ok: false, reason: "too_many_attempts" };

  // The attempt is counted BEFORE the comparison and outside any caller transaction —
  // same reason as the login counter: a failed verification that rolls back its own
  // attempt count is unlimited guessing (07 §1.6).
  await db.otpRequest.update({
    where: { id: row.id },
    data: { attempts: { increment: 1 } },
  });

  let matched = false;
  try {
    matched = await argonVerify(row.codeHash, peppered(input.code));
  } catch {
    matched = false;
  }
  if (!matched) return { ok: false, reason: "mismatch" };

  // Single use: mark consumed conditionally, so two concurrent verifications of the same
  // code cannot both succeed.
  const claimed = await db.otpRequest.updateMany({
    where: { id: row.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  if (claimed.count === 0) return { ok: false, reason: "consumed" };

  return { ok: true, requestId: row.id, customerId: row.customerId, userId: row.userId };
}

/**
 * Verify an emailed `<requestId>.<token>` link.
 *
 * The id half is a PUBLIC SELECTOR that finds the row; the token half is the secret that
 * is then verified against it. A bare token would be unfindable, because argon2id salts
 * per row (07 §4.2).
 */
export async function verifyOtpLink(input: {
  purpose: OtpPurpose;
  value: string;
}): Promise<OtpVerification> {
  const i = input.value.indexOf(".");
  if (i <= 0) return { ok: false, reason: "not_found" };
  const id = input.value.slice(0, i);
  const token = input.value.slice(i + 1);
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, reason: "not_found" };

  const row = await db.otpRequest.findUnique({
    where: { id },
    select: {
      id: true, purpose: true, codeHash: true, attempts: true, maxAttempts: true,
      consumedAt: true, expiresAt: true, customerId: true, userId: true,
    },
  });
  if (!row || row.purpose !== input.purpose) return { ok: false, reason: "not_found" };
  if (row.consumedAt) return { ok: false, reason: "consumed" };
  if (row.expiresAt <= new Date()) return { ok: false, reason: "expired" };
  if (row.attempts >= row.maxAttempts) return { ok: false, reason: "too_many_attempts" };

  await db.otpRequest.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } });

  let matched = false;
  try {
    matched = await argonVerify(row.codeHash, peppered(token));
  } catch {
    matched = false;
  }
  if (!matched) return { ok: false, reason: "mismatch" };

  const claimed = await db.otpRequest.updateMany({
    where: { id: row.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  if (claimed.count === 0) return { ok: false, reason: "consumed" };

  return { ok: true, requestId: row.id, customerId: row.customerId, userId: row.userId };
}
