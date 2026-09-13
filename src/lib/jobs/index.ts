import "server-only";
import { db } from "@/lib/db/client";
import { withTransaction } from "@/lib/db/transaction";
import type { Tx } from "@/lib/db/transaction";
import { JOB_KINDS, type JobKindKey } from "@/lib/jobs/kinds";
import { ForbiddenError } from "@/lib/errors";

/**
 * The job queue — 09 P04A.
 *
 * Built HERE rather than at P29 because its first consumers are seventeen phases earlier.
 * Without it, "enqueue this" degrades to "apply it inline, just for now" — and for
 * `recalc_apply` that is hard rule 6 violated: a price recalculation applied inline is a
 * metal-rate change reaching live customer prices with no approval step. Risk R03.
 */

export type EnqueueInput = {
  kind: JobKindKey;
  payload: Record<string, unknown>;
  /** The staff user who asked. Required unless the kind is systemPermitted. */
  createdByUserId?: string | null;
  /** Distinguishes two jobs of the same kind: an entity id, a market code. */
  dedupeValue?: string | null;
  runAfter?: Date;
  priority?: number;
};

/**
 * Enqueue, honouring the kind's dedupe rule.
 *
 * Returns the EXISTING job when one is already queued or running for the same dedupe key,
 * rather than throwing — a caller that enqueues "rebuild the US feed" twice wants one
 * rebuild, not an error.
 */
export async function enqueue(
  tx: Tx,
  input: EnqueueInput,
): Promise<{ id: string; deduped: boolean }> {
  const meta = JOB_KINDS[input.kind];

  if (!meta.systemPermitted && !input.createdByUserId) {
    // A human-only kind with no human would run as a system actor, which is how the job
    // queue becomes a permission escalator (11 §3.3).
    throw new ForbiddenError(
      `Job kind '${input.kind}' requires an originating user and none was supplied.`,
      { context: { kind: input.kind } },
    );
  }

  const dedupeKey =
    meta.dedupeKey === "kind"
      ? input.kind
      : meta.dedupeKey === null
        ? null
        : (input.dedupeValue ?? null);

  if (dedupeKey !== null) {
    const existing = await tx.job.findFirst({
      where: { kind: input.kind, dedupeKey, status: { in: ["queued", "running"] } },
      select: { id: true },
    });
    if (existing) return { id: existing.id, deduped: true };
  }

  const job = await tx.job.create({
    data: {
      kind: input.kind,
      status: "queued",
      payload: input.payload as never,
      priority: input.priority ?? 100,
      maxAttempts: meta.maxAttempts,
      runAfter: input.runAfter ?? new Date(),
      createdByUserId: input.createdByUserId ?? null,
      dedupeKey,
    },
    select: { id: true },
  });
  return { id: job.id, deduped: false };
}

export type ClaimedJob = {
  id: string;
  kind: JobKindKey;
  payload: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
  progressCurrent: number | null;
  progressTotal: number | null;
  createdByUserId: string | null;
};

/**
 * Claim one job for exclusive execution.
 *
 * `FOR UPDATE SKIP LOCKED` is the entire concurrency design. Two overlapping cron
 * invocations both run this; the first locks the row, and the second SKIPS it rather than
 * blocking on it — so it moves on to the next job instead of waiting, and no job is ever
 * executed twice. A plain `SELECT … LIMIT 1` followed by an `UPDATE` lets both workers
 * read the same row and run it twice (09 P04A criterion (a)).
 */
export async function claimNext(workerId: string): Promise<ClaimedJob | null> {
  const rows = await db.$queryRaw<
    {
      id: string;
      kind: JobKindKey;
      payload: Record<string, unknown>;
      attempts: number;
      max_attempts: number;
      progress_current: number | null;
      progress_total: number | null;
      created_by_user_id: string | null;
    }[]
  >`
    WITH next AS (
      SELECT id FROM jobs
      WHERE status = 'queued' AND run_after <= now()
      ORDER BY priority ASC, run_after ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE jobs j
       SET status     = 'running',
           locked_at  = now(),
           locked_by  = ${workerId},
           started_at = coalesce(j.started_at, now()),
           attempts   = j.attempts + 1,
           updated_at = now()
      FROM next
     WHERE j.id = next.id
    RETURNING j.id, j.kind, j.payload, j.attempts, j.max_attempts,
              j.progress_current, j.progress_total, j.created_by_user_id
  `;
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    kind: r.kind,
    payload: r.payload,
    attempts: r.attempts,
    maxAttempts: r.max_attempts,
    progressCurrent: r.progress_current,
    progressTotal: r.progress_total,
    createdByUserId: r.created_by_user_id,
  };
}

/** Record progress so a killed invocation resumes from here rather than from zero. */
export async function reportProgress(
  jobId: string,
  current: number,
  total?: number,
): Promise<void> {
  await db.job.update({
    where: { id: jobId },
    data: {
      progressCurrent: current,
      ...(total === undefined ? {} : { progressTotal: total }),
      // Touching locked_at keeps the watchdog from reclaiming a job that IS progressing.
      lockedAt: new Date(),
    },
  });
}

export async function markSucceeded(
  jobId: string,
  result?: Record<string, unknown>,
): Promise<void> {
  await db.job.update({
    where: { id: jobId },
    data: {
      status: "succeeded",
      finishedAt: new Date(),
      result: (result ?? {}) as never,
      error: null,
    },
  });
}

/**
 * Record a failure. Requeues with backoff while attempts remain; otherwise terminal.
 *
 * The error is stored on the row either way. A job that throws and vanishes is worse than
 * one that fails loudly — nobody knows the confirmation email was never sent
 * (09 P04A criterion (d)).
 */
export async function markFailed(
  jobId: string,
  error: unknown,
): Promise<"requeued" | "failed"> {
  const message = error instanceof Error ? error.message : String(error);
  const job = await db.job.findUniqueOrThrow({
    where: { id: jobId },
    select: { attempts: true, maxAttempts: true },
  });

  if (job.attempts < job.maxAttempts) {
    const backoffSeconds = Math.min(2 ** job.attempts * 30, 3600);
    await db.job.update({
      where: { id: jobId },
      data: {
        status: "queued",
        error: message.slice(0, 4000),
        lockedAt: null,
        lockedBy: null,
        runAfter: new Date(Date.now() + backoffSeconds * 1000),
      },
    });
    return "requeued";
  }

  await db.job.update({
    where: { id: jobId },
    data: {
      status: "failed",
      error: message.slice(0, 4000),
      finishedAt: new Date(),
      lockedAt: null,
      lockedBy: null,
      result: { error: message.slice(0, 2000) } as never,
    },
  });
  return "failed";
}

/**
 * The watchdog. Requeues jobs claimed by an invocation that died — a serverless function
 * killed at its timeout has no chance to write anything.
 *
 * `progress_current` is deliberately NOT reset: the handler resumes from where it got to
 * (09 P04A criterion (b)).
 */
export async function requeueStale(): Promise<number> {
  const n = await db.$executeRaw`
    UPDATE jobs j
       SET status = CASE WHEN j.attempts >= j.max_attempts THEN 'failed'::job_status
                         ELSE 'queued'::job_status END,
           locked_at = NULL,
           locked_by = NULL,
           error = coalesce(j.error, 'Worker died before reporting (watchdog requeue)'),
           finished_at = CASE WHEN j.attempts >= j.max_attempts THEN now() ELSE NULL END,
           updated_at = now()
     WHERE j.status = 'running'
       AND j.locked_at < now() - make_interval(secs => 900)
  `;
  return Number(n);
}

export type HandlerContext = {
  job: ClaimedJob;
  progress: (current: number, total?: number) => Promise<void>;
};

export type JobHandler = (ctx: HandlerContext) => Promise<Record<string, unknown> | void>;

const handlers = new Map<JobKindKey, JobHandler>();

export function registerHandler(kind: JobKindKey, handler: JobHandler): void {
  handlers.set(kind, handler);
}

export function registeredKinds(): JobKindKey[] {
  return [...handlers.keys()];
}

/**
 * Drain the queue until empty or out of time.
 *
 * `maxMs` is well under the function's own timeout so the worker stops itself cleanly
 * rather than being killed mid-job and leaving a row for the watchdog.
 */
export async function drainJobs(opts: {
  workerId: string;
  maxMs?: number;
  maxJobs?: number;
}): Promise<{ claimed: number; succeeded: number; failed: number; requeued: number }> {
  const deadline = Date.now() + (opts.maxMs ?? 240_000);
  const stats = { claimed: 0, succeeded: 0, failed: 0, requeued: 0 };
  let processed = 0;

  while (Date.now() < deadline && processed < (opts.maxJobs ?? 100)) {
    const job = await claimNext(opts.workerId);
    if (!job) break;
    stats.claimed++;
    processed++;

    const handler = handlers.get(job.kind);
    if (!handler) {
      // An unregistered kind is a deployment error, not a data error. Fail it loudly
      // rather than looping on it forever.
      const outcome = await markFailed(
        job.id,
        new Error(`No handler registered for '${job.kind}'`),
      );
      stats[outcome === "failed" ? "failed" : "requeued"]++;
      continue;
    }

    try {
      const result = await handler({
        job,
        progress: (c, t) => reportProgress(job.id, c, t),
      });
      await markSucceeded(job.id, result ?? {});
      stats.succeeded++;
    } catch (e) {
      const outcome = await markFailed(job.id, e);
      stats[outcome === "failed" ? "failed" : "requeued"]++;
    }
  }

  return stats;
}

export { withTransaction };
