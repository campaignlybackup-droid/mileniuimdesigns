import "server-only";
import type { Tx } from "@/lib/db/transaction";
import { db } from "@/lib/db/client";
import { withTransaction } from "@/lib/db/transaction";
import { generateToken, hashToken } from "@/lib/auth/tokens";
import { SESSION_TTL } from "@/lib/config/constants";

/**
 * Session lifecycle — 07 §1.2, §1.10.
 *
 * The session predicate is evaluated PER REQUEST, not cached on the cookie. That is what
 * makes every revocation trigger take effect on the very next request rather than at the
 * next login: deactivating a staff member, changing a password, anonymising a customer.
 */

export type StaffSessionRow = {
  sessionId: string;
  userId: string;
  totpVerifiedAt: Date | null;
  roles: string[];
};

export type CustomerSessionRow = {
  sessionId: string;
  customerId: string;
  impersonatorUserId: string | null;
};

/**
 * Resolve a staff session from its raw cookie value.
 *
 * Every clause is a revocation trigger from 07 §1.10, and each is here rather than in
 * application code because a predicate is impossible to forget:
 *
 *   revoked_at IS NULL          — signed out, or signed out everywhere
 *   expires_at > now()          — absolute TTL
 *   last_seen_at > now() - idle — staff idle window (customers have none)
 *   u.is_active                 — deactivated staff, effective immediately
 *   u.deleted_at IS NULL        — soft-deleted staff
 *   s.created_at >= u.password_changed_at — every session minted before a password
 *                                 change dies with it, including the attacker's
 */
export async function resolveStaffSession(rawToken: string): Promise<StaffSessionRow | null> {
  const tokenHash = hashToken(rawToken);
  const rows = await db.$queryRaw<
    { session_id: string; user_id: string; totp_verified_at: Date | null; roles: string[] }[]
  >`
    SELECT s.id            AS session_id,
           s.user_id       AS user_id,
           s.totp_verified_at,
           coalesce(array_agg(r.key) FILTER (WHERE r.key IS NOT NULL), '{}') AS roles
    FROM sessions s
    JOIN users u            ON u.id = s.user_id
    LEFT JOIN user_roles ur ON ur.user_id = u.id
    LEFT JOIN roles r       ON r.id = ur.role_id
    WHERE s.token_hash   = ${tokenHash}
      AND s.user_id      IS NOT NULL
      AND s.revoked_at   IS NULL
      AND s.expires_at   > now()
      AND s.last_seen_at > now() - make_interval(mins => ${SESSION_TTL.adminIdleMinutes})
      AND u.is_active
      AND u.deleted_at   IS NULL
      AND s.created_at  >= u.password_changed_at
    GROUP BY s.id, s.user_id, s.totp_verified_at
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    sessionId: row.session_id,
    userId: row.user_id,
    totpVerifiedAt: row.totp_verified_at,
    roles: row.roles,
  };
}

export async function resolveCustomerSession(
  rawToken: string,
): Promise<CustomerSessionRow | null> {
  const tokenHash = hashToken(rawToken);
  const rows = await db.$queryRaw<
    { session_id: string; customer_id: string; impersonator_user_id: string | null }[]
  >`
    SELECT s.id AS session_id, s.customer_id, s.impersonator_user_id
    FROM sessions s
    JOIN customers c ON c.id = s.customer_id
    WHERE s.token_hash    = ${tokenHash}
      AND s.customer_id   IS NOT NULL
      AND s.revoked_at    IS NULL
      AND s.expires_at    > now()
      AND c.anonymized_at IS NULL
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    sessionId: row.session_id,
    customerId: row.customer_id,
    impersonatorUserId: row.impersonator_user_id,
  };
}

type CreateInput = {
  userId?: string;
  customerId?: string;
  impersonatorUserId?: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  totpVerifiedAt?: Date | null;
};

function cleanInet(raw: string | null | undefined): string | null {
  if (!raw) return null;
  // If x-forwarded-for contains a chain of IPs, take the first client IP
  const first = raw.split(",")[0]?.trim();
  if (!first) return null;
  // Basic IPv4 or IPv6 pattern check to avoid invalid inet syntax errors
  const isIpv4 = /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/.test(first);
  const isIpv6 = /^[0-9a-fA-F:]+$/.test(first) && first.includes(":");
  return isIpv4 || isIpv6 ? first : null;
}

/**
 * Mint a session and return the PLAINTEXT token, which exists only in transit — the
 * database holds its SHA-256 and nothing else, so a database dump is not a set of live
 * sessions.
 */
export async function createSession(
  tx: Tx,
  input: CreateInput,
): Promise<{ token: string; sessionId: string; expiresAt: Date }> {
  const isStaff = Boolean(input.userId);
  if (isStaff === Boolean(input.customerId)) {
    // Mirrors chk_sessions_one_principal. Failing here gives a usable stack; failing at
    // the constraint gives a Postgres error from three frames away.
    throw new Error("A session carries exactly one principal (07 §1.2).");
  }

  const token = generateToken();
  const hours = isStaff ? SESSION_TTL.adminHours : SESSION_TTL.customerHours;
  const expiresAt = new Date(Date.now() + hours * 3_600_000);

  const row = await tx.session.create({
    data: {
      tokenHash: hashToken(token),
      userId: input.userId ?? null,
      customerId: input.customerId ?? null,
      impersonatorUserId: input.impersonatorUserId ?? null,
      ipAddress: cleanInet(input.ipAddress),
      userAgent: input.userAgent ?? null,
      totpVerifiedAt: input.totpVerifiedAt ?? null,
      expiresAt,
      lastSeenAt: new Date(),
    },
    select: { id: true },
  });

  return { token, sessionId: row.id, expiresAt };
}

/**
 * Rotate: mint a new session and revoke the old one in ONE transaction.
 *
 * Called on login, on TOTP completion, on a mid-session step-up, on claiming a guest
 * cart, on impersonation start and stop, and on password change. It kills session
 * fixation — a token planted before authentication is not the token that ends up
 * authenticated — and it means a token captured before a step-up cannot inherit the
 * authority the step-up granted (07 §1.10).
 */
export async function rotateSession(
  tx: Tx,
  oldSessionId: string,
  input: CreateInput,
): Promise<{ token: string; sessionId: string; expiresAt: Date }> {
  const created = await createSession(tx, input);
  await tx.session.update({
    where: { id: oldSessionId },
    data: { revokedAt: new Date() },
  });
  return created;
}

export async function revokeSession(sessionId: string): Promise<void> {
  await db.session.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** "Sign out everywhere". `except` keeps the session doing the signing-out alive. */
export async function revokeAllForUser(userId: string, except?: string): Promise<number> {
  const r = await db.session.updateMany({
    where: { userId, revokedAt: null, ...(except ? { id: { not: except } } : {}) },
    data: { revokedAt: new Date() },
  });
  return r.count;
}

export async function revokeAllForCustomer(
  customerId: string,
  except?: string,
): Promise<number> {
  const r = await db.session.updateMany({
    where: { customerId, revokedAt: null, ...(except ? { id: { not: except } } : {}) },
    data: { revokedAt: new Date() },
  });
  return r.count;
}

/**
 * Stamp `last_seen_at`. Throttled to once a minute: writing on every request turns a
 * read-only page load into a write and makes the sessions table the hottest in the
 * system for no benefit.
 */
export async function touchSession(sessionId: string): Promise<void> {
  await db.$executeRaw`
    UPDATE sessions SET last_seen_at = now()
    WHERE id = ${sessionId}::uuid AND last_seen_at < now() - interval '1 minute'
  `;
}

/** Mark the second factor satisfied ON THE SESSION, never on the user (07 §1.9). */
export async function markTotpVerified(tx: Tx, sessionId: string): Promise<void> {
  await tx.session.update({
    where: { id: sessionId },
    data: { totpVerifiedAt: new Date() },
  });
}

/** Delete expired rows. Called by /api/cron/cleanup-sessions. */
export async function pruneExpiredSessions(): Promise<number> {
  return withTransaction(async (tx) => {
    const r = await tx.$executeRaw`
      DELETE FROM sessions
      WHERE expires_at < now() - interval '7 days'
         OR (revoked_at IS NOT NULL AND revoked_at < now() - interval '7 days')
    `;
    return Number(r);
  });
}
