import { NextResponse } from "next/server";
import { assertCronRequest, workerId } from "@/lib/security/cron";
import { drainJobs, requeueStale } from "@/lib/jobs";
import { toWireError } from "@/lib/errors";
// Imported for its side effects: this is what puts the handlers in the registry before the
// worker starts claiming. Without it every job fails with "no handler registered".
import "@/lib/jobs/handlers";

export const dynamic = "force-dynamic";
/** 300s, matching 11 §5.2. `drainJobs` stops itself at 240s so the worker finishes
 *  cleanly rather than being killed mid-job and leaving a row for the watchdog. */
export const maxDuration = 300;

/**
 * The queue worker — 09 P04A.
 *
 * Runs every five minutes, and two invocations CAN overlap: a slow drain plus the next
 * tick. That is expected and safe, because `claimNext()` uses `FOR UPDATE SKIP LOCKED` —
 * the second invocation skips rows the first holds rather than blocking on them.
 */
export async function GET(req: Request): Promise<Response> {
  try {
    assertCronRequest(req);
  } catch (e) {
    const w = toWireError(e);
    return NextResponse.json({ error: w.code }, { status: w.httpStatus });
  }

  // The watchdog runs FIRST, so a job orphaned by a killed invocation is back in the
  // queue before this one starts draining — rather than waiting a further five minutes.
  const watchdogRequeued = await requeueStale();

  const stats = await drainJobs({ workerId: workerId(), maxMs: 240_000 });

  // Two different "requeued" counts, deliberately named apart: the watchdog's (jobs
  // orphaned by a dead invocation) and the drain's (jobs that threw and have attempts
  // left). Collapsing them into one field silently overwrote the first.
  return NextResponse.json({ ok: true, watchdogRequeued, ...stats });
}
