import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { withTransaction } from "@/lib/db/transaction";
import { issueOtp, verifyOtpCode, verifyOtpLink } from "@/lib/auth/otp";
import {
  assertNotImpersonated,
  endImpersonation,
  impersonationBanner,
  startImpersonation,
} from "@/lib/auth/impersonation";
import { resolveCustomerSession } from "@/lib/auth/session";
import { permissionsForRoles } from "@/lib/rbac";
import { ForbiddenError, ValidationError } from "@/lib/errors";
import type { StaffActor, CustomerActor } from "@/lib/rbac";

const stamp = Date.now();
let customerId: string;
let staffId: string;
let owner: StaffActor;

beforeAll(async () => {
  const group = await db.customerGroup.findFirstOrThrow();
  const c = await db.customer.create({
    data: { email: `otp-${stamp}@test.invalid`, customerGroupId: group.id },
    select: { id: true },
  });
  customerId = c.id;

  const u = await db.user.create({
    data: {
      email: `imp-${stamp}@test.invalid`, passwordHash: "x", firstName: "Imp", lastName: "Staff",
      isActive: true, passwordChangedAt: new Date(), totpRecoveryCodes: [],
    },
    select: { id: true },
  });
  staffId = u.id;

  owner = {
    kind: "staff",
    userId: staffId,
    roles: ["owner"],
    permissions: permissionsForRoles(["owner"]),
    totpVerifiedAt: new Date(),
  };
});

afterAll(async () => {
  await db.otpRequest.deleteMany({ where: { customerId } });
  await db.session.deleteMany({ where: { OR: [{ customerId }, { impersonatorUserId: staffId }] } });
  await db.customer.update({ where: { id: customerId }, data: { anonymizedAt: new Date() } });
  await db.user.update({ where: { id: staffId }, data: { deletedAt: new Date(), isActive: false } });
});

/** Commissioned by 07 §1.5, §1.7, §1.8. */
describe("one-time codes", () => {
  it("issues a 6-digit code for a login and verifies it once", async () => {
    const issued = await withTransaction((tx) =>
      issueOtp(tx, { purpose: "customer_login", identifier: `otp-${stamp}@test.invalid`, customerId }),
    );
    expect(issued.deliverable).toMatch(/^\d{6}$/);

    const ok = await verifyOtpCode({
      purpose: "customer_login",
      identifier: `otp-${stamp}@test.invalid`,
      code: issued.deliverable,
    });
    expect(ok.ok).toBe(true);

    // Single use.
    const replay = await verifyOtpCode({
      purpose: "customer_login",
      identifier: `otp-${stamp}@test.invalid`,
      code: issued.deliverable,
    });
    expect(replay).toEqual({ ok: false, reason: "consumed" });
  }, 30_000);

  it("stores a HASH — the code is not in the database", async () => {
    const id = `hash-${stamp}@test.invalid`;
    const issued = await withTransaction((tx) =>
      issueOtp(tx, { purpose: "customer_login", identifier: id, customerId }),
    );
    const rows = await db.otpRequest.findMany({ where: { identifier: id }, select: { codeHash: true } });
    expect(rows[0]!.codeHash).toContain("$argon2");
    expect(rows[0]!.codeHash).not.toContain(issued.deliverable);
  }, 30_000);

  it("INVALIDATES the previous code when a new one is requested", async () => {
    // Otherwise 'resend' doubles the attacker's guessing surface instead of replacing it.
    const id = `resend-${stamp}@test.invalid`;
    const first = await withTransaction((tx) =>
      issueOtp(tx, { purpose: "customer_login", identifier: id, customerId }),
    );
    await withTransaction((tx) =>
      issueOtp(tx, { purpose: "customer_login", identifier: id, customerId }),
    );
    const old = await verifyOtpCode({ purpose: "customer_login", identifier: id, code: first.deliverable });
    expect(old.ok).toBe(false);
  }, 40_000);

  it("caps attempts, and the cap SURVIVES a failed verification", async () => {
    // Five guesses at six digits, then the row is spent. A cap that rolled back with the
    // failed attempt would be 10 minutes of unlimited guessing.
    const id = `cap-${stamp}@test.invalid`;
    await withTransaction((tx) =>
      issueOtp(tx, { purpose: "customer_login", identifier: id, customerId }),
    );
    for (let i = 0; i < 5; i++) {
      await verifyOtpCode({ purpose: "customer_login", identifier: id, code: "000001" });
    }
    const after = await verifyOtpCode({ purpose: "customer_login", identifier: id, code: "000002" });
    expect(after).toEqual({ ok: false, reason: "too_many_attempts" });
  }, 60_000);

  it("refuses an expired code", async () => {
    const id = `exp-${stamp}@test.invalid`;
    const issued = await withTransaction((tx) =>
      issueOtp(tx, { purpose: "customer_login", identifier: id, customerId }),
    );
    await db.otpRequest.updateMany({
      where: { identifier: id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await verifyOtpCode({ purpose: "customer_login", identifier: id, code: issued.deliverable }))
      .toEqual({ ok: false, reason: "expired" });
  }, 30_000);

  it("is transport-agnostic — an E.164 phone is just another identifier", async () => {
    // Email stays the account key in every market; phone is an additional login method
    // bound to the same customers row (07 §1.8).
    const phone = "+919876500000";
    const issued = await withTransaction((tx) =>
      issueOtp(tx, { purpose: "customer_login", identifier: phone, customerId }),
    );
    const ok = await verifyOtpCode({ purpose: "customer_login", identifier: phone, code: issued.deliverable });
    expect(ok.ok).toBe(true);
  }, 30_000);
});

describe("emailed link tokens", () => {
  it("issues `<id>.<token>` and verifies it", async () => {
    const id = `link-${stamp}@test.invalid`;
    const issued = await withTransaction((tx) =>
      issueOtp(tx, { purpose: "password_reset", identifier: id, customerId }),
    );
    expect(issued.deliverable).toContain(".");
    expect(issued.deliverable.split(".")[0]).toBe(issued.requestId);

    const ok = await verifyOtpLink({ purpose: "password_reset", value: issued.deliverable });
    expect(ok.ok).toBe(true);
  }, 30_000);

  it("refuses a token used for the WRONG purpose", async () => {
    // A reset link must not double as an email-verification link.
    const id = `purpose-${stamp}@test.invalid`;
    const issued = await withTransaction((tx) =>
      issueOtp(tx, { purpose: "password_reset", identifier: id, customerId }),
    );
    expect(await verifyOtpLink({ purpose: "email_verification", value: issued.deliverable }))
      .toEqual({ ok: false, reason: "not_found" });
  }, 30_000);

  it("refuses a bare token with no selector, and an injected selector", async () => {
    for (const v of ["justatoken", "' OR 1=1 --.tok", "../../x.tok"]) {
      expect(await verifyOtpLink({ purpose: "password_reset", value: v }))
        .toEqual({ ok: false, reason: "not_found" });
    }
  });
});

/** Commissioned by 07 §1.11. */
describe("impersonation", () => {
  it("requires a substantive reason", async () => {
    await expect(
      startImpersonation(owner, { customerId, reason: "why" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("requires a verified second factor", async () => {
    const noTotp: StaffActor = { ...owner, totpVerifiedAt: null };
    await expect(
      startImpersonation(noTotp, { customerId, reason: "support ticket 4182" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("refuses a role without user.impersonate", async () => {
    const analyst: StaffActor = {
      kind: "staff", userId: staffId, roles: ["analyst"],
      permissions: permissionsForRoles(["analyst"]), totpVerifiedAt: new Date(),
    };
    await expect(
      startImpersonation(analyst, { customerId, reason: "support ticket 4182" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("mints a session carrying BOTH principals, and audits the reason", async () => {
    const { token, expiresAt } = await startImpersonation(owner, {
      customerId,
      reason: "support ticket 4182 — customer cannot see their order",
    });

    const session = await resolveCustomerSession(token);
    expect(session?.customerId).toBe(customerId);
    expect(session?.impersonatorUserId).toBe(staffId);

    // Thirty minutes, not the customer default of 720 hours: the staff member is
    // reproducing a problem, not shopping.
    expect(expiresAt.getTime() - Date.now()).toBeLessThan(31 * 60_000);

    const audit = await db.auditLog.findFirst({
      where: { action: "impersonate_start", entityId: customerId },
      orderBy: { createdAt: "desc" },
    });
    expect(audit?.summary).toContain("4182");
    expect(audit?.impersonatorUserId).toBe(staffId);

    await endImpersonation(session!.sessionId, staffId, customerId);
    expect(await resolveCustomerSession(token)).toBeNull();
  }, 30_000);

  it("renders a banner from the session row, not from the client", async () => {
    const actor: CustomerActor = { kind: "customer", customerId, impersonatorUserId: staffId };
    const banner = await impersonationBanner(actor);
    expect(banner?.customerEmail).toContain("otp-");
    expect(banner?.staffEmail).toContain("imp-");

    // A normal customer gets no banner.
    expect(await impersonationBanner({ kind: "customer", customerId })).toBeNull();
  });

  it("refuses the writes that do not LOOK like writes", async () => {
    const impersonated: CustomerActor = { kind: "customer", customerId, impersonatorUserId: staffId };
    const plain: CustomerActor = { kind: "customer", customerId };

    // The obvious ones.
    for (const a of ["order.place", "customer.change_password", "address.delete"] as const) {
      expect(() => assertNotImpersonated(impersonated, a)).toThrow(ForbiddenError);
    }

    // The four that are easy to miss. A consent record created by a staff member acting
    // as the customer is a FABRICATED consent record, and consent is the one audit
    // question with a regulator attached to it (07 §1.11).
    for (const a of [
      "marketing.set_consent", "newsletter.subscribe", "review.submit", "wishlist.share",
    ] as const) {
      expect(() => assertNotImpersonated(impersonated, a), a).toThrow(ForbiddenError);
    }

    // And a real customer is unaffected.
    for (const a of ["order.place", "marketing.set_consent"] as const) {
      expect(() => assertNotImpersonated(plain, a)).not.toThrow();
    }
  });
});
