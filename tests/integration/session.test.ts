import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { withTransaction } from "@/lib/db/transaction";
import {
  createSession,
  resolveCustomerSession,
  resolveStaffSession,
  revokeAllForUser,
  revokeSession,
  rotateSession,
} from "@/lib/auth/session";
import { hashPassword } from "@/lib/auth/password";

/**
 * Commissioned by 09 P03A criteria (a) and (b).
 *
 * Every clause of the session predicate is a revocation trigger from 07 §1.10. These
 * assert each one takes effect ON THE NEXT REQUEST — which is the entire reason the
 * predicate is evaluated per request rather than cached on the cookie.
 */
let userId: string;
let customerId: string;
const made: string[] = [];

beforeAll(async () => {
  const user = await db.user.create({
    data: {
      email: `sess-${Date.now()}@test.invalid`,
      passwordHash: await hashPassword("test-password-1234"),
      firstName: "Session",
      lastName: "Probe",
      isActive: true,
      passwordChangedAt: new Date(Date.now() - 86_400_000),
      totpRecoveryCodes: [],
    },
    select: { id: true },
  });
  userId = user.id;

  const group = await db.customerGroup.findFirstOrThrow();
  const customer = await db.customer.create({
    data: { email: `cust-${Date.now()}@test.invalid`, customerGroupId: group.id },
    select: { id: true },
  });
  customerId = customer.id;
});

afterAll(async () => {
  await db.session.deleteMany({ where: { OR: [{ userId }, { customerId }] } });
  await db.user.delete({ where: { id: userId } });
  await db.customer.delete({ where: { id: customerId } });
});

async function mintStaff(): Promise<string> {
  const { token, sessionId } = await withTransaction((tx) => createSession(tx, { userId }));
  made.push(sessionId);
  return token;
}

describe("session resolution", () => {
  it("resolves a freshly minted staff session", async () => {
    const token = await mintStaff();
    const s = await resolveStaffSession(token);
    expect(s?.userId).toBe(userId);
  });

  it("stores only the HASH — the raw token is not in the database", async () => {
    const token = await mintStaff();
    const rows = await db.$queryRaw<{ n: bigint }[]>`
      SELECT count(*)::bigint AS n FROM sessions WHERE encode(token_hash, 'base64') = ${token}
    `;
    expect(Number(rows[0]!.n)).toBe(0);
  });

  it("rejects a token that was never issued", async () => {
    expect(await resolveStaffSession("not-a-real-token")).toBeNull();
  });

  it("refuses to mint a session with two principals", async () => {
    // Mirrors chk_sessions_one_principal, but fails with a usable stack.
    await expect(
      withTransaction((tx) => createSession(tx, { userId, customerId })),
    ).rejects.toThrow(/exactly one principal/);
  });

  it("refuses to mint a session with no principal", async () => {
    await expect(withTransaction((tx) => createSession(tx, {}))).rejects.toThrow(
      /exactly one principal/,
    );
  });
});

describe("revocation takes effect on the next request", () => {
  it("sign out", async () => {
    const token = await mintStaff();
    const s = await resolveStaffSession(token);
    await revokeSession(s!.sessionId);
    expect(await resolveStaffSession(token)).toBeNull();
  });

  it("sign out everywhere, keeping the current session alive", async () => {
    const keep = await mintStaff();
    const other = await mintStaff();
    const keepId = (await resolveStaffSession(keep))!.sessionId;
    await revokeAllForUser(userId, keepId);
    expect(await resolveStaffSession(keep)).not.toBeNull();
    expect(await resolveStaffSession(other)).toBeNull();
  });

  it("deactivating the staff member", async () => {
    const token = await mintStaff();
    await db.user.update({ where: { id: userId }, data: { isActive: false } });
    expect(await resolveStaffSession(token)).toBeNull();
    await db.user.update({ where: { id: userId }, data: { isActive: true } });
  });

  it("soft-deleting the staff member", async () => {
    const token = await mintStaff();
    await db.user.update({ where: { id: userId }, data: { deletedAt: new Date() } });
    expect(await resolveStaffSession(token)).toBeNull();
    await db.user.update({ where: { id: userId }, data: { deletedAt: null } });
  });

  it("changing the password kills every session minted before it", async () => {
    // The predicate is `s.created_at >= u.password_changed_at`. This is what makes a
    // password change end the ATTACKER's session too, which is the entire point of
    // changing it.
    const token = await mintStaff();
    expect(await resolveStaffSession(token)).not.toBeNull();
    await db.user.update({
      where: { id: userId },
      data: { passwordChangedAt: new Date(Date.now() + 1000) },
    });
    expect(await resolveStaffSession(token)).toBeNull();
    await db.user.update({
      where: { id: userId },
      data: { passwordChangedAt: new Date(Date.now() - 86_400_000) },
    });
  });

  it("expiry", async () => {
    const token = await mintStaff();
    const s = await resolveStaffSession(token);
    await db.session.update({
      where: { id: s!.sessionId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await resolveStaffSession(token)).toBeNull();
  });

  it("the staff IDLE window — customers have none", async () => {
    const token = await mintStaff();
    const s = await resolveStaffSession(token);
    await db.session.update({
      where: { id: s!.sessionId },
      data: { lastSeenAt: new Date(Date.now() - 2 * 3_600_000) },
    });
    expect(await resolveStaffSession(token)).toBeNull();
  });

  it("anonymising the customer", async () => {
    const { token } = await withTransaction((tx) => createSession(tx, { customerId }));
    expect(await resolveCustomerSession(token)).not.toBeNull();
    await db.customer.update({
      where: { id: customerId },
      data: { anonymizedAt: new Date() },
    });
    expect(await resolveCustomerSession(token)).toBeNull();
    await db.customer.update({ where: { id: customerId }, data: { anonymizedAt: null } });
  });
});

describe("rotation kills session fixation", () => {
  it("the OLD token is unusable after rotation — not merely absent from the cookie", async () => {
    // 09 P03A criterion (b). A token planted before authentication must not be the token
    // that ends up authenticated.
    const before = await mintStaff();
    const beforeId = (await resolveStaffSession(before))!.sessionId;

    const { token: after } = await withTransaction((tx) =>
      rotateSession(tx, beforeId, { userId }),
    );

    expect(await resolveStaffSession(before)).toBeNull();
    expect(await resolveStaffSession(after)).not.toBeNull();
    expect(after).not.toBe(before);
  });

  it("a cross-population token does not resolve", async () => {
    // A staff token must never resolve as a customer, or vice versa. The two resolvers
    // never consult each other's cookie, and the predicates make it impossible anyway.
    const staffToken = await mintStaff();
    expect(await resolveCustomerSession(staffToken)).toBeNull();

    const { token: customerToken } = await withTransaction((tx) =>
      createSession(tx, { customerId }),
    );
    expect(await resolveStaffSession(customerToken)).toBeNull();
  });
});
