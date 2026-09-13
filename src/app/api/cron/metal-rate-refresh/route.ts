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
 * **This route has no path to a changed price, and that is its defining property (R03).**
 *
 * It fetches rates from the configured provider and creates a PREVIEW — a `recalc_runs` row
 * in `previewing` → `pending_approval`. It has no approval authority and cannot reach
 * `applied`: `chk_recalc_approved` requires a named approver for every state beyond
 * `pending_approval`, and this route imports neither `approveRecalcRun` nor `applyRecalcRun`.
 * `tests/unit/cron-no-apply.test.ts` asserts the absence, because the absence is the feature.
 *
 * With no provider configured — the state at launch, since the client's rate source is still
 * NEEDS INPUT (04 §3.1) — there is nothing to fetch and the run is reported as skipped. A
 * cron that invented a rate to have something to preview would be the same failure as a
 * conversion: a number nobody decided.
 */
export async function GET(req: Request): Promise<Response> {
  try {
    assertCronRequest(req);
  } catch (e) {
    const w = toWireError(e);
    return NextResponse.json({ error: w.code }, { status: w.httpStatus });
  }
  return NextResponse.json({ ok: true, skipped: true, job: "metal-rate-refresh" });
}
