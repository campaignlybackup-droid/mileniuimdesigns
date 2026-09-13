import "server-only";
import { env } from "@/lib/config/env";
import { ForbiddenError } from "@/lib/errors";

/**
 * Same-origin assertion — 07 §5.4, control 4.
 *
 * There is NO CSRF token in this system. Four overlapping controls replace it, and the
 * argument is that none of them can be forgotten on a new endpoint whereas a token can:
 *
 *   1. No mutation is reachable by GET, so `<img src=".../delete?id=1">` has no target.
 *   2. SameSite on both session cookies — Strict for md_admin, Lax for md_session.
 *      Lax already withholds the cookie from a cross-site POST, which is what a server
 *      action is.
 *   3. Next's server-action origin check, pinned to NEXT_PUBLIC_APP_URL's host.
 *   4. This function, on every cookie-authenticated non-GET route handler.
 *
 * The load-bearing detail: a request with NEITHER `Origin` nor `Referer` is REFUSED, not
 * allowed. A missing Origin on a cookie-authenticated POST is not a browser we recognise,
 * and defaulting to "allow" there would quietly undo the control for exactly the client
 * an attacker controls.
 */
export function assertSameOrigin(req: Request): void {
  const expected = new URL(env().NEXT_PUBLIC_APP_URL).origin;

  const origin = req.headers.get("origin");
  if (origin) {
    if (origin !== expected) {
      throw new ForbiddenError("Cross-origin request refused.", {
        context: { origin, expected },
      });
    }
    return;
  }

  // Some browsers omit Origin on same-origin form posts; Referer is the documented
  // fallback. It is a fallback, not an alternative — a forged Referer needs a controlled
  // client, which already defeats the threat model this control addresses.
  const referer = req.headers.get("referer");
  if (referer) {
    let refOrigin: string;
    try {
      refOrigin = new URL(referer).origin;
    } catch {
      throw new ForbiddenError("Unparseable Referer on a cookie-authenticated request.");
    }
    if (refOrigin !== expected) {
      throw new ForbiddenError("Cross-origin request refused.", {
        context: { referer: refOrigin, expected },
      });
    }
    return;
  }

  throw new ForbiddenError(
    "A cookie-authenticated, state-changing request arrived with neither Origin nor " +
      "Referer. That is not a browser we recognise, and allowing it would undo the " +
      "control for precisely the client an attacker controls (07 §5.4).",
  );
}

/**
 * Which auth kinds are subject to the check. `signature`, `cron` and `secret` routes are
 * outside it BY CONSTRUCTION: they are cross-origin or non-browser by definition and
 * authenticate with an HMAC or a bearer secret instead. Stripe does not send an Origin.
 */
export function requiresSameOrigin(
  authKind: "public" | "cart" | "customer" | "staff" | "signature" | "cron" | "secret" | "any",
): boolean {
  return authKind === "cart" || authKind === "customer" || authKind === "staff";
}
