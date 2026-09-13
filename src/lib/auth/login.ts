import "server-only";
import { db } from "@/lib/db/client";
import { withTransaction } from "@/lib/db/transaction";
import { hashPassword, needsRehash, verifyPassword } from "@/lib/auth/password";
import { createSession, rotateSession } from "@/lib/auth/session";
import { consume, hashKeyMaterial, LIMITS } from "@/lib/ratelimit";
import { permissionsForRoles } from "@/lib/rbac";
import { requiresTotp } from "@/lib/rbac/catalogue";
import type { RoleKey } from "@/lib/rbac";
import { RateLimitedError, UnauthenticatedError } from "@/lib/errors";

/**
 * Staff sign-in — 07 §1.6.
 *
 * THE ORDERING IS THE SUBSTANCE, and it is the opposite of the obvious one.
 *
 * The obvious implementation wraps the whole attempt in a transaction: increment
 * `failed_login_count`, write the rate-limit row, write the audit row, then throw. All
 * three then roll back with the throw, and the counter reads 0 after ten thousand
 * guesses — the lockout, the audit trail and the limiter are all silently void.
 *
 * So the bookkeeping COMMITS BEFORE the failure is raised, and only the success path
 * shares a transaction.
 */

export type LoginOutcome =
  | { status: "ok"; token: string; expiresAt: Date }
  | { status: "totp_required"; challengeUserId: string }
  | { status: "failed" };

/** Uniform failure. Never distinguishes "no such account" from "wrong password", and
 *  never reveals that an account is locked — all three are enumeration oracles. */
const FAILED: LoginOutcome = { status: "failed" };

export async function staffLogin(input: {
  email: string;
  password: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<LoginOutcome> {
  const emailKey = hashKeyMaterial(input.email);

  // Both limiters BEFORE any database work. Per-email stops a targeted attack; per-IP
  // stops a spray across many accounts. Neither alone is sufficient.
  const byEmail = await consume(LIMITS.loginEmail, emailKey);
  const byIp = await consume(LIMITS.loginIp, hashKeyMaterial(input.ipAddress ?? "unknown"));
  if (!byEmail.allowed || !byIp.allowed) {
    throw new RateLimitedError("Too many sign-in attempts.", {
      context: {
        retryAfterSeconds: Math.max(byEmail.retryAfterSeconds, byIp.retryAfterSeconds),
      },
    });
  }

  const user = await db.user.findFirst({
    where: { email: { equals: input.email, mode: "insensitive" }, deletedAt: null },
    select: {
      id: true,
      passwordHash: true,
      isActive: true,
      lockedUntil: true,
      totpEnrolledAt: true,
      roles: { select: { role: { select: { key: true } } } },
    },
  });

  // A missing user still costs a password verification, so that response time does not
  // separate "no such account" from "wrong password". Without this, timing alone
  // enumerates the staff list.
  if (!user) {
    await verifyPassword(
      "$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHRzb21lc2FsdA$0000000000000000000000000000000000000000000",
      input.password,
    );
    await recordFailure(null, input);
    return FAILED;
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await recordFailure(user.id, input);
    return FAILED; // deliberately indistinguishable from a wrong password
  }

  const valid = await verifyPassword(user.passwordHash, input.password);
  if (!valid || !user.isActive) {
    await recordFailure(user.id, input);
    return FAILED;
  }

  const roles = user.roles.map((r) => r.role.key) as RoleKey[];
  const needsSecondFactor = requiresTotp(permissionsForRoles(roles));

  if (needsSecondFactor) {
    if (!user.totpEnrolledAt) {
      // Above the privilege line and not enrolled: the account must enrol before it can
      // hold a session at all. "Optional" for a role that can issue a refund means "off",
      // because nobody enrols voluntarily (07 §1.9).
      return { status: "totp_required", challengeUserId: user.id };
    }
    return { status: "totp_required", challengeUserId: user.id };
  }

  // SUCCESS is the only path that shares a transaction — here rolling back is correct,
  // because a session that exists without its bookkeeping is worse than no session.
  return withTransaction(async (tx) => {
    const created = await createSession(tx, {
      userId: user.id,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    });

    await tx.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        failedLoginCount: 0,
        lockedUntil: null,
        // Raising the argon2 cost later is then a constant change plus time — never a
        // migration and never a forced reset (07 §1.4).
        ...(needsRehash(user.passwordHash)
          ? { passwordHash: await hashPassword(input.password) }
          : {}),
      },
    });

    await tx.auditLog.create({
      data: {
        actorType: "staff",
        actorUserId: user.id,
        entity: "sessions",
        entityId: created.sessionId,
        action: "auth.login",
        summary: "Staff signed in",
        ipAddress: input.ipAddress ?? null,
      },
    });

    return { status: "ok" as const, token: created.token, expiresAt: created.expiresAt };
  });
}

/**
 * Failure bookkeeping, on its OWN transaction, committed before the caller returns.
 *
 * This is the function that must not be folded into the caller's transaction. It is
 * separate so that it cannot be.
 */
async function recordFailure(
  userId: string | null,
  input: { email: string; ipAddress?: string | null },
): Promise<void> {
  if (userId) {
    const updated = await db.user.update({
      where: { id: userId },
      data: { failedLoginCount: { increment: 1 } },
      select: { failedLoginCount: true },
    });
    // Ten failures locks the account for fifteen minutes. The limiter already throttles;
    // the lock is the second line, and it is per account rather than per IP.
    if (updated.failedLoginCount >= 10) {
      await db.user.update({
        where: { id: userId },
        data: { lockedUntil: new Date(Date.now() + 15 * 60_000), failedLoginCount: 0 },
      });
    }
  }

  await db.auditLog.create({
    data: {
      actorType: "system",
      actorUserId: userId,
      entity: "users",
      entityId: userId,
      action: "auth.login_failed",
      // The EMAIL IS NOT RECORDED for an unknown account. An audit log of every address
      // anyone ever typed is a list of guesses, and it is readable by anyone with
      // audit.read (07 §7.2).
      summary: userId ? "Failed sign-in" : "Failed sign-in for an unknown account",
      ipAddress: input.ipAddress ?? null,
    },
  });
}

/** Sign out: revoke, and record it. */
export async function staffLogout(sessionId: string, userId: string): Promise<void> {
  await withTransaction(async (tx) => {
    await tx.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await tx.auditLog.create({
      data: {
        actorType: "staff",
        actorUserId: userId,
        entity: "sessions",
        entityId: sessionId,
        action: "auth.logout",
        summary: "Staff signed out",
      },
    });
  });
}

/** Complete a staff login after the second factor. Mints a NEW session — the pre-2FA
 *  state never held one, and rotation here kills fixation (07 §1.10). */
export async function completeStaffLoginWithTotp(input: {
  userId: string;
  acceptedStep: number;
  ipAddress?: string | null;
  userAgent?: string | null;
  replaceSessionId?: string;
}): Promise<{ token: string; expiresAt: Date }> {
  return withTransaction(async (tx) => {
    const created = input.replaceSessionId
      ? await rotateSession(tx, input.replaceSessionId, {
          userId: input.userId,
          ipAddress: input.ipAddress ?? null,
          userAgent: input.userAgent ?? null,
          totpVerifiedAt: new Date(),
        })
      : await createSession(tx, {
          userId: input.userId,
          ipAddress: input.ipAddress ?? null,
          userAgent: input.userAgent ?? null,
          totpVerifiedAt: new Date(),
        });

    // Burn the step so the same code cannot be replayed within its ±1 window.
    await tx.user.update({
      where: { id: input.userId },
      data: {
        totpLastStep: BigInt(input.acceptedStep),
        lastLoginAt: new Date(),
        failedLoginCount: 0,
        lockedUntil: null,
      },
    });

    await tx.auditLog.create({
      data: {
        actorType: "staff",
        actorUserId: input.userId,
        entity: "sessions",
        entityId: created.sessionId,
        action: "auth.login_totp",
        summary: "Staff completed second factor",
        ipAddress: input.ipAddress ?? null,
      },
    });

    return { token: created.token, expiresAt: created.expiresAt };
  });
}

export { UnauthenticatedError };
