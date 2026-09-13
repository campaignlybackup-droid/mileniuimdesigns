import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import type { PermissionKey, RoleKey, StaffActor, CustomerActor } from "@/lib/rbac";
import { permissionsForRoles } from "@/lib/rbac";
import { requiresTotp } from "@/lib/rbac/catalogue";
import { UnauthenticatedError } from "@/lib/rbac/errors";
import { TotpRequiredError } from "@/lib/errors";
import { cookieName } from "@/lib/config/constants";
import { env } from "@/lib/config/env";
import { resolveCustomerSession, resolveStaffSession, touchSession } from "@/lib/auth/session";

/**
 * TWO resolvers, one per population — 07 §3.2.
 *
 * **There is deliberately no `getActor()`.** A single resolver would have to decide which
 * cookie wins, and whichever it picked would be wrong somewhere: reading `md_admin` first
 * means a staff member SHOPPING on the storefront is priced, cached and audited as an
 * admin; reading `md_session` first means an admin screen could act as a customer. That
 * is a confused deputy, and the defence is that the caller names the population it wants.
 *
 * Neither resolver ever consults the other's cookie.
 */

/**
 * Memoised per REQUEST with React `cache()`, not per module (07 §2.7). A module-level
 * cache would leak one request's actor into the next on a warm serverless instance —
 * which is a session-confusion bug of exactly the kind the two-resolver split exists to
 * prevent.
 */
export const getStaffActor = cache(async (): Promise<StaffActor | null> => {
  const jar = await cookies();
  const raw = jar.get(cookieName("adminSession", env().APP_ENV))?.value;
  if (!raw) return null;

  const session = await resolveStaffSession(raw);
  if (!session) return null;

  const roles = session.roles as RoleKey[];
  const permissions = permissionsForRoles(roles);

  // Fire-and-forget: a failed last_seen_at write must not fail the request.
  void touchSession(session.sessionId).catch(() => undefined);

  return {
    kind: "staff",
    userId: session.userId,
    roles,
    permissions,
    totpVerifiedAt: session.totpVerifiedAt,
  };
});

export const getCustomerActor = cache(async (): Promise<CustomerActor | null> => {
  const jar = await cookies();
  const raw = jar.get(cookieName("customerSession", env().APP_ENV))?.value;
  if (!raw) return null;

  const session = await resolveCustomerSession(raw);
  if (!session) return null;

  return {
    kind: "customer",
    customerId: session.customerId,
    ...(session.impersonatorUserId
      ? { impersonatorUserId: session.impersonatorUserId }
      : {}),
  };
});

/**
 * The staff guard every admin surface goes through.
 *
 * It re-evaluates the TOTP privilege line PER REQUEST, against the actor's CURRENT
 * permissions. That matters: 07 §1.10 deliberately does not treat a permission change as
 * a revocation, so an owner adding `order.refund` to a role at 10am would otherwise hand
 * every already-signed-in holder the most money-adjacent key in the catalogue on a
 * session that never saw a second factor — for up to twelve hours.
 *
 * The response is a step-up challenge, not a logout: the session is valid, it simply has
 * not proved the second factor it now needs.
 */
export async function requireStaffSession(): Promise<StaffActor> {
  const actor = await getStaffActor();
  if (!actor) throw new UnauthenticatedError();

  if (requiresTotp(actor.permissions as Iterable<PermissionKey>) && !actor.totpVerifiedAt) {
    throw new TotpRequiredError(
      "This account holds a permission that requires a second factor.",
    );
  }
  return actor;
}

export async function requireCustomerSession(): Promise<CustomerActor> {
  const actor = await getCustomerActor();
  if (!actor) throw new UnauthenticatedError();
  return actor;
}
