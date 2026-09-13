import "server-only";
import type { CustomerActor, StaffActor } from "@/lib/rbac";
import { requirePermission } from "@/lib/rbac";
import { db } from "@/lib/db/client";
import { withTransaction } from "@/lib/db/transaction";
import { createSession } from "@/lib/auth/session";
import { ForbiddenError, ValidationError, NotFoundError } from "@/lib/errors";

/**
 * Impersonation — 07 §1.11.
 *
 * A staff member views the storefront as a customer, to reproduce what that customer is
 * seeing. Three things make it auditable rather than a backdoor:
 *
 *  1. It requires `user.impersonate`, which is ABOVE the TOTP privilege line — so the
 *     staff member has proved a second factor before they can act as anyone.
 *  2. `sessions.impersonator_user_id` records BOTH principals, so every audit row written
 *     during the session answers "who actually did this" rather than naming the customer.
 *  3. The session is short (30 minutes) and READ-MOSTLY — see `assertNotImpersonated`.
 */

const IMPERSONATION_MINUTES = 30;

export async function startImpersonation(
  actor: StaffActor,
  input: { customerId: string; reason: string },
): Promise<{ token: string; expiresAt: Date }> {
  requirePermission(actor, "user.impersonate");

  // A non-empty reason is required because the audit row's only value is answering WHY
  // six months later. "Support ticket 4182" is an answer; an empty string is not.
  const reason = input.reason?.trim() ?? "";
  if (reason.length < 8) {
    throw new ValidationError(
      "A reason of at least 8 characters is required to impersonate a customer.",
    );
  }

  // Above the line means enrolled — but assert it rather than assuming the matrix has
  // not changed since this actor signed in.
  if (!actor.totpVerifiedAt) {
    throw new ForbiddenError("user.impersonate");
  }

  const customer = await db.customer.findFirst({
    where: { id: input.customerId, anonymizedAt: null },
    select: { id: true, email: true },
  });
  if (!customer) throw new NotFoundError("No such customer.");

  return withTransaction(async (tx) => {
    const created = await createSession(tx, {
      customerId: customer.id,
      impersonatorUserId: actor.userId,
    });

    // Shorter than a normal customer session by design: the staff member is reproducing
    // a problem, not shopping.
    const expiresAt = new Date(Date.now() + IMPERSONATION_MINUTES * 60_000);
    await tx.session.update({ where: { id: created.sessionId }, data: { expiresAt } });

    await tx.auditLog.create({
      data: {
        actorType: "staff",
        actorUserId: actor.userId,
        actorCustomerId: customer.id,
        impersonatorUserId: actor.userId,
        entity: "customers",
        entityId: customer.id,
        action: "impersonate_start",
        summary: reason,
      },
    });

    return { token: created.token, expiresAt };
  });
}

export async function endImpersonation(
  sessionId: string,
  impersonatorUserId: string,
  customerId: string,
): Promise<void> {
  await withTransaction(async (tx) => {
    await tx.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await tx.auditLog.create({
      data: {
        actorType: "staff",
        actorUserId: impersonatorUserId,
        actorCustomerId: customerId,
        impersonatorUserId,
        entity: "customers",
        entityId: customerId,
        action: "impersonate_end",
        summary: "Impersonation ended",
      },
    });
  });
}

/**
 * Refuse an action that must not be performed while impersonating.
 *
 * 07 §1.11 lists the obvious ones — place an order, save a payment method, change email
 * or password, delete an address, request a data export, start another impersonation.
 *
 * It then names four that are easy to miss BECAUSE THEY DO NOT LOOK LIKE WRITES, and
 * those are the ones this function exists for:
 *
 *  - **Marketing consent.** `accepts_marketing` carries `marketing_consent_at` and
 *    `marketing_consent_source`. A consent record created by a staff member acting as the
 *    customer is a FABRICATED consent record — and consent is the one audit question with
 *    a regulator attached to it.
 *  - **Newsletter subscription**, for the same reason.
 *  - **Review submission**, which would attribute an opinion to a person who never held it.
 *  - **Wishlist sharing**, which mints a public token over someone else's choices.
 */
export const IMPERSONATION_FORBIDDEN = [
  "order.place",
  "payment_method.save",
  "payment_method.use",
  "customer.change_email",
  "customer.change_password",
  "address.delete",
  "customer.request_export",
  "impersonate.start",
  "marketing.set_consent",
  "newsletter.subscribe",
  "review.submit",
  "wishlist.share",
] as const;

export type ImpersonationForbiddenAction = (typeof IMPERSONATION_FORBIDDEN)[number];

export function assertNotImpersonated(
  actor: CustomerActor,
  action: ImpersonationForbiddenAction,
): void {
  if (actor.impersonatorUserId) {
    throw new ForbiddenError(
      `${action} is not permitted while impersonating a customer (07 §1.11).`,
    );
  }
}

/** The banner's content, rendered SERVER-SIDE from the session row so it cannot be
 *  removed client-side. A dismissible banner is a banner that gets dismissed. */
export async function impersonationBanner(
  actor: CustomerActor,
): Promise<{ customerEmail: string; staffEmail: string } | null> {
  if (!actor.impersonatorUserId) return null;
  const [customer, staff] = await Promise.all([
    db.customer.findUnique({ where: { id: actor.customerId }, select: { email: true } }),
    db.user.findUnique({ where: { id: actor.impersonatorUserId }, select: { email: true } }),
  ]);
  if (!customer || !staff) return null;
  return { customerEmail: customer.email, staffEmail: staff.email };
}
