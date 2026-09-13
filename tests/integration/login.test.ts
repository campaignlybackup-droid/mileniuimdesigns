import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { hashPassword } from "@/lib/auth/password";
import { staffLogin, staffLogout, completeStaffLoginWithTotp } from "@/lib/auth/login";
import { resolveStaffSession } from "@/lib/auth/session";
import { RateLimitedError } from "@/lib/errors";

/** Commissioned by 07 §1.6 and 09 P03A. */
const PASSWORD = "a-perfectly-ordinary-password-42";
const stamp = Date.now();
/**
 * Every call gets a DISTINCT ip, because the per-IP limiter would otherwise put every
 * test in this file into one bucket and the later ones would fail on the earlier ones'
 * attempts. That is not a test artefact — it is how the limiter behaves in production for
 * everyone behind one NAT, and it is why the per-EMAIL limiter exists alongside it.
 */
let ipSeq = 0;
const nextIp = () => `203.0.113.${(ipSeq++ % 250) + 1}`;
const plainEmail = `plain-${stamp}@test.invalid`;
const ownerEmail = `owner-${stamp}@test.invalid`;
let plainId: string;
let ownerId: string;

beforeAll(async () => {
  const hash = await hashPassword(PASSWORD);
  const analyst = await db.role.findUniqueOrThrow({ where: { key: "analyst" } });
  const owner = await db.role.findUniqueOrThrow({ where: { key: "owner" } });

  const a = await db.user.create({
    data: {
      email: plainEmail, passwordHash: hash, firstName: "Below", lastName: "Line",
      isActive: true, passwordChangedAt: new Date(Date.now() - 86_400_000), totpRecoveryCodes: [],
      roles: { create: { roleId: analyst.id } },
    },
    select: { id: true },
  });
  plainId = a.id;

  const o = await db.user.create({
    data: {
      email: ownerEmail, passwordHash: hash, firstName: "Above", lastName: "Line",
      isActive: true, passwordChangedAt: new Date(Date.now() - 86_400_000), totpRecoveryCodes: [],
      roles: { create: { roleId: owner.id } },
    },
    select: { id: true },
  });
  ownerId = o.id;
});

afterAll(async () => {
  await db.session.deleteMany({ where: { userId: { in: [plainId, ownerId] } } });
  await db.userRole.deleteMany({ where: { userId: { in: [plainId, ownerId] } } });
  // SOFT delete, which is what every real flow does. These users appear in audit_logs,
  // and audit_logs.actor_user_id is ON DELETE RESTRICT precisely so that an append-only
  // log cannot be quietly orphaned by a hard delete.
  await db.user.updateMany({
    where: { id: { in: [plainId, ownerId] } },
    data: { deletedAt: new Date(), isActive: false },
  });
  await db.$executeRaw`DELETE FROM rate_limits WHERE key LIKE 'login:%'`;
});

describe("staff sign-in", () => {
  it("signs in a role BELOW the privilege line without a second factor", async () => {
    const r = await staffLogin({ email: plainEmail, password: PASSWORD, ipAddress: nextIp() });
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    const session = await resolveStaffSession(r.token);
    expect(session?.userId).toBe(plainId);
  });

  it("demands a second factor for a role ABOVE the line, even with the right password", async () => {
    // 09 P03A criterion (a). `owner` holds order.refund, so TOTP is not optional —
    // "optional" for a role that can issue a refund means "off" (07 §1.9).
    const r = await staffLogin({ email: ownerEmail, password: PASSWORD, ipAddress: nextIp() });
    expect(r.status).toBe("totp_required");
  });

  it("gives the SAME answer for a wrong password and an unknown account", async () => {
    // Both are enumeration oracles if they differ.
    const wrong = await staffLogin({ email: plainEmail, password: "not-the-password", ipAddress: nextIp() });
    const unknown = await staffLogin({ email: `nobody-${stamp}@test.invalid`, password: PASSWORD, ipAddress: nextIp() });
    expect(wrong).toEqual({ status: "failed" });
    expect(unknown).toEqual({ status: "failed" });
  });

  it("costs comparable time for an unknown account — timing must not enumerate staff", async () => {
    // Clear the limiter first: earlier tests in this file have already spent this
    // account's per-email window, and a 429 is not the code path under test.
    await db.$executeRaw`DELETE FROM rate_limits WHERE key LIKE 'login:%'`;
    const t = async (email: string) => {
      const s = process.hrtime.bigint();
      await staffLogin({ email, password: "wrong-password-here" });
      return Number(process.hrtime.bigint() - s) / 1e6;
    };
    const known = await t(plainEmail);
    const unknown = await t(`ghost-${stamp}@test.invalid`);
    // The dummy verification for a missing user means these are the same order of
    // magnitude. A missing-user path that skipped it would be ~100x faster.
    const ratio = Math.max(known, unknown) / Math.max(1, Math.min(known, unknown));
    expect(ratio).toBeLessThan(10);
  }, 30_000);

  it("refuses a deactivated account", async () => {
    await db.user.update({ where: { id: plainId }, data: { isActive: false } });
    expect(await staffLogin({ email: plainEmail, password: PASSWORD, ipAddress: nextIp() })).toEqual({ status: "failed" });
    await db.user.update({ where: { id: plainId }, data: { isActive: true } });
  });
});

describe("failure bookkeeping survives the failure", () => {
  it("increments failed_login_count and COMMITS it", async () => {
    // THE property of 07 §1.6. The natural implementation wraps the attempt in one
    // transaction, and then the increment, the limiter row and the audit row all roll
    // back with the throw — leaving the counter at 0 after ten thousand guesses.
    await db.user.update({ where: { id: plainId }, data: { failedLoginCount: 0 } });

    for (let i = 0; i < 3; i++) {
      await staffLogin({ email: plainEmail, password: "wrong", ipAddress: nextIp() });
    }

    const after = await db.user.findUniqueOrThrow({
      where: { id: plainId },
      select: { failedLoginCount: true },
    });
    expect(after.failedLoginCount).toBe(3);
  }, 30_000);

  it("writes an audit row for a failed attempt, and does not record the typed address", async () => {
    const ghost = `ghost2-${stamp}@test.invalid`;
    await staffLogin({ email: ghost, password: "wrong", ipAddress: nextIp() });
    const rows = await db.auditLog.findMany({
      where: { action: "auth.login_failed" },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { summary: true, actorUserId: true },
    });
    expect(rows.length).toBeGreaterThan(0);
    // An audit log of every address anyone ever typed is a list of guesses, readable by
    // anyone holding audit.read (07 §7.2).
    expect(rows.some((r) => r.summary?.includes(ghost))).toBe(false);
  }, 30_000);

  it("locks the account after ten failures", async () => {
    await db.user.update({ where: { id: plainId }, data: { failedLoginCount: 9, lockedUntil: null } });
    await staffLogin({ email: plainEmail, password: "wrong", ipAddress: nextIp() });
    const after = await db.user.findUniqueOrThrow({
      where: { id: plainId },
      select: { lockedUntil: true },
    });
    expect(after.lockedUntil).not.toBeNull();

    // And a LOCKED account is indistinguishable from a wrong password.
    expect(await staffLogin({ email: plainEmail, password: PASSWORD, ipAddress: nextIp() })).toEqual({ status: "failed" });
    await db.user.update({ where: { id: plainId }, data: { lockedUntil: null, failedLoginCount: 0 } });
  }, 30_000);
});

describe("rate limiting", () => {
  it("throws RateLimitedError once the per-email window is exhausted", async () => {
    const email = `flood-${stamp}@test.invalid`;
    let threw = false;
    for (let i = 0; i < 15; i++) {
      try {
        await staffLogin({ email, password: "wrong" });
      } catch (e) {
        if (e instanceof RateLimitedError) { threw = true; break; }
      }
    }
    expect(threw).toBe(true);
  }, 60_000);
});

describe("second factor completes the login", () => {
  it("mints a session stamped totp_verified_at and burns the step", async () => {
    const step = Math.floor(Date.now() / 1000 / 30);
    const { token } = await completeStaffLoginWithTotp({ userId: ownerId, acceptedStep: step });
    const session = await resolveStaffSession(token);
    expect(session?.userId).toBe(ownerId);
    expect(session?.totpVerifiedAt).not.toBeNull();

    const user = await db.user.findUniqueOrThrow({
      where: { id: ownerId },
      select: { totpLastStep: true },
    });
    expect(Number(user.totpLastStep)).toBe(step);
  });
});

describe("sign out", () => {
  it("revokes the session and records it", async () => {
    const r = await staffLogin({ email: plainEmail, password: PASSWORD, ipAddress: nextIp() });
    if (r.status !== "ok") throw new Error("expected sign-in to succeed");
    const s = await resolveStaffSession(r.token);
    await staffLogout(s!.sessionId, plainId);
    expect(await resolveStaffSession(r.token)).toBeNull();
  });
});
