import type { PermissionKey, RoleKey } from "@/lib/rbac/catalogue";
import { ROLE_MATRIX } from "@/lib/rbac/catalogue";
import { ForbiddenError, UnauthenticatedError } from "@/lib/rbac/errors";

export type { PermissionKey, RoleKey };
export { ForbiddenError, UnauthenticatedError };

/**
 * Who is acting. Two populations that never merge: a staff actor and a customer actor
 * are produced by two different resolvers, and neither reads the other's cookie.
 *
 * A single `getActor()` reading the admin cookie first would let the storefront price,
 * cache and audit a shopping staff member's session as an admin's — a confused deputy.
 * There is deliberately no such function (07 §3.2).
 */
export type StaffActor = {
  readonly kind: "staff";
  readonly userId: string;
  readonly roles: readonly RoleKey[];
  readonly permissions: ReadonlySet<PermissionKey>;
  readonly totpVerifiedAt: Date | null;
  readonly impersonatingCustomerId?: string;
};

export type CustomerActor = {
  readonly kind: "customer";
  readonly customerId: string;
  readonly impersonatorUserId?: string;
};

/**
 * A job or webhook with no originating human. Permitted PER JOB KIND by
 * JOB_KINDS[kind].systemPermitted — never by a blanket "system can do anything", which
 * would make the job queue a permission escalator: anyone able to enqueue an import
 * would hold every permission five seconds later (11 §3.3).
 */
export type SystemActor = {
  readonly kind: "system";
  readonly reason: "cron" | "webhook" | "job";
};

export type Actor = StaffActor | CustomerActor | SystemActor;

/** Resolve a role set to its permissions. `owner` holds all 73 by explicit rows. */
export function permissionsForRoles(roles: readonly RoleKey[]): Set<PermissionKey> {
  const out = new Set<PermissionKey>();
  for (const role of roles) for (const key of ROLE_MATRIX[role] ?? []) out.add(key);
  return out;
}

export function can(actor: Actor, permission: PermissionKey): boolean {
  if (actor.kind !== "staff") return false;
  return actor.permissions.has(permission);
}

/**
 * THE choke point. Every admin mutation passes through here, server-side.
 *
 * Hidden UI is not authorization: a server action is a plain POST endpoint addressed by
 * a generated id, so anything that checks only in a component is reachable by anyone who
 * can read the page source. `tests/unit/{routes,services,actions}-authorized.test.ts`
 * fail CI on an exported mutator that never calls this (07 §3.7, 09 P03A criterion (d)).
 */
export function requirePermission(
  actor: Actor,
  permission: PermissionKey,
): asserts actor is StaffActor {
  if (actor.kind === "system") {
    // A system actor is never granted an admin permission implicitly. The job runner
    // builds a STAFF actor from jobs.created_by_user_id for human-originated kinds.
    throw new ForbiddenError(permission);
  }
  if (actor.kind !== "staff") throw new UnauthenticatedError();
  if (!actor.permissions.has(permission)) throw new ForbiddenError(permission);
}

/** Require every one of several permissions — e.g. an export needs its resource's read
 *  permission AND `customer.export` when the resource carries PII (11 §1.5). */
export function requireAll(
  actor: Actor,
  permissions: readonly PermissionKey[],
): asserts actor is StaffActor {
  for (const p of permissions) requirePermission(actor, p);
}
