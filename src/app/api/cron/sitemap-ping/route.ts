import { NextResponse } from "next/server";
import { assertCronRequest } from "@/lib/security/cron";
import { toWireError } from "@/lib/errors";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Registered in vercel.json — tests/unit/cron-registry.test.ts asserts the set of these
 * directories equals the set of scheduled paths EXACTLY, so neither an unregistered
 * handler nor a registered path with no handler can ship.
 *
 * Stub: records the run and returns `skipped`. 09 P04A explicitly allows handlers to be
 * stubs at this phase — what must exist now is the spine: the schedule, the
 * authentication, and the registry check that keeps the two in lockstep.
 */
export async function GET(req: Request): Promise<Response> {
  try {
    assertCronRequest(req);
  } catch (e) {
    const w = toWireError(e);
    return NextResponse.json({ error: w.code }, { status: w.httpStatus });
  }
  return NextResponse.json({ ok: true, skipped: true, job: "sitemap-ping" });
}
