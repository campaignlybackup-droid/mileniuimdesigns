import "server-only";
import { timingSafeEqual } from "node:crypto";
import { UnauthenticatedError } from "@/lib/errors";
import { hostInfo } from "@/lib/config/env";

/**
 * Cron route authentication — 09 P04A criterion (c).
 *
 * A cron route is a publicly reachable URL that does privileged work with no user. It
 * must therefore authenticate, and it must reject a request carrying NEITHER credential:
 *
 *  - `x-vercel-cron` is set by the platform's own scheduler and cannot be set by an
 *    external caller reaching the deployment.
 *  - `Authorization: Bearer <CRON_SECRET>` covers every other host, local invocation and
 *    manual re-run.
 *
 * It is deliberately NOT subject to the same-origin check: a scheduler sends no Origin,
 * and applying that control here would simply break every cron (07 §5.4).
 */
export function assertCronRequest(req: Request): void {
  const expected = hostInfo().cronSecret;

  if (req.headers.get("x-vercel-cron")) return;

  const auth = req.headers.get("authorization");
  if (expected && auth?.startsWith("Bearer ")) {
    const supplied = Buffer.from(auth.slice(7));
    const want = Buffer.from(expected);
    if (supplied.length === want.length && timingSafeEqual(supplied, want)) return;
  }

  throw new UnauthenticatedError(
    "This endpoint is invoked by the scheduler. Supply x-vercel-cron or a CRON_SECRET bearer token.",
  );
}

/** A stable id for the worker instance, so `jobs.locked_by` says who holds a row. */
export function workerId(): string {
  const { region, deploymentId } = hostInfo();
  return `${region}:${deploymentId}`;
}
