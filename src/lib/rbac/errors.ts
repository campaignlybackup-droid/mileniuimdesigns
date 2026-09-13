/** Authorization failures. Separate module so `requirePermission` can be imported by
 *  code that must not pull in the database client. */

export class UnauthenticatedError extends Error {
  readonly code = "UNAUTHENTICATED" as const;
  readonly status = 401 as const;
  constructor(message = "Not signed in.") {
    super(message);
    this.name = "UnauthenticatedError";
  }
}

export class ForbiddenError extends Error {
  readonly code = "FORBIDDEN" as const;
  readonly status = 403 as const;
  readonly permission: string;
  constructor(permission: string) {
    // The message names the permission because the audience is a STAFF member looking at
    // an admin screen, who needs to tell their owner what to grant. It is never shown to
    // a shopper: a customer-scoped miss raises NotFoundError, so that possessing an id
    // cannot be used to confirm that the id exists (07 §4.2).
    super(`Missing permission: ${permission}`);
    this.name = "ForbiddenError";
    this.permission = permission;
  }
}
