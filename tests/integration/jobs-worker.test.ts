import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { withTransaction } from "@/lib/db/transaction";
import {
  claimNext,
  drainJobs,
  enqueue,
  markFailed,
  registerHandler,
  reportProgress,
  requeueStale,
} from "@/lib/jobs";
import { JOB_KINDS, SINGLETON_KINDS } from "@/lib/jobs/kinds";
import { ForbiddenError } from "@/lib/errors";

/** Commissioned by 09 P04A criteria (a), (b) and (d). */
const clean = () => db.$executeRaw`DELETE FROM jobs WHERE payload->>'probe' = 'true'`;

beforeEach(clean);
afterAll(async () => {
  await clean();
});

const probe = (extra: Record<string, unknown> = {}) => ({ probe: "true", ...extra });

describe("enqueue", () => {
  it("refuses a human-only kind with no originating user", async () => {
    // Otherwise the job runs as a system actor, and the queue becomes a permission
    // escalator: anyone able to enqueue an import holds every permission (11 §3.3).
    await expect(
      withTransaction((tx) => enqueue(tx, { kind: "import_apply", payload: probe() })),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("ALLOWS send_email with no user — a webhook writes that row", async () => {
    // THE regression this flag exists for. Under a closed three-kind allowlist this was
    // refused, so no order-confirmation email would ever have sent, from the first paid
    // order, silently.
    const r = await withTransaction((tx) =>
      enqueue(tx, { kind: "send_email", payload: probe(), dedupeValue: `order:${Date.now()}` }),
    );
    expect(r.deduped).toBe(false);
  });

  it("dedupes a singleton kind globally", async () => {
    const a = await withTransaction((tx) =>
      enqueue(tx, { kind: "sitemap_rebuild", payload: probe() }),
    );
    const b = await withTransaction((tx) =>
      enqueue(tx, { kind: "sitemap_rebuild", payload: probe() }),
    );
    expect(b.deduped).toBe(true);
    expect(b.id).toBe(a.id);
  });

  it("dedupes per market, not globally, for a market-scoped kind", async () => {
    // Two markets may rebuild their feeds concurrently; one market may not rebuild twice.
    const us = await withTransaction((tx) =>
      enqueue(tx, { kind: "feed_rebuild", payload: probe(), dedupeValue: "market:US" }),
    );
    const inr = await withTransaction((tx) =>
      enqueue(tx, { kind: "feed_rebuild", payload: probe(), dedupeValue: "market:IN" }),
    );
    const usAgain = await withTransaction((tx) =>
      enqueue(tx, { kind: "feed_rebuild", payload: probe(), dedupeValue: "market:US" }),
    );

    expect(inr.id).not.toBe(us.id);
    expect(usAgain.deduped).toBe(true);
    expect(usAgain.id).toBe(us.id);
  });

  it("the singleton index list matches the kinds declared as globally unique", async () => {
    const rows = await db.$queryRaw<{ indexdef: string }[]>`
      SELECT indexdef FROM pg_indexes WHERE indexname = 'idx_jobs_singleton'
    `;
    const def = rows[0]!.indexdef;
    for (const k of SINGLETON_KINDS) {
      expect(def, `${k} declared dedupeKey 'kind' but is not in idx_jobs_singleton`).toContain(
        k,
      );
    }
  });
});

describe("claiming is exactly-once under concurrency", () => {
  it("two overlapping workers never claim the same job", async () => {
    // 09 P04A criterion (a). FOR UPDATE SKIP LOCKED is the whole design: the second
    // worker SKIPS a locked row instead of blocking on it. A plain SELECT ... LIMIT 1
    // followed by an UPDATE lets both read the same row and run it twice.
    const ids: string[] = [];
    for (let i = 0; i < 12; i++) {
      const r = await withTransaction((tx) =>
        enqueue(tx, {
          kind: "send_email",
          payload: probe({ n: i }),
          dedupeValue: `probe:${i}`,
        }),
      );
      ids.push(r.id);
    }

    // Twenty concurrent claims against twelve jobs.
    const claims = await Promise.all(
      Array.from({ length: 20 }, (_, i) => claimNext(`worker-${i}`)),
    );
    const claimed = claims.filter(Boolean).map((c) => c!.id);

    expect(claimed.length).toBe(12);
    expect(new Set(claimed).size).toBe(12); // no job claimed twice
  }, 60_000);

  it("a claimed job is not re-claimable", async () => {
    const { id } = await withTransaction((tx) =>
      enqueue(tx, { kind: "send_email", payload: probe(), dedupeValue: `once:${Date.now()}` }),
    );
    const first = await claimNext("w1");
    expect(first?.id).toBe(id);
    const second = await claimNext("w2");
    expect(second?.id).not.toBe(id);
  });

  it("respects run_after — a delayed job is not claimed early", async () => {
    await withTransaction((tx) =>
      enqueue(tx, {
        kind: "send_email",
        payload: probe(),
        dedupeValue: `later:${Date.now()}`,
        runAfter: new Date(Date.now() + 3_600_000),
      }),
    );
    expect(await claimNext("w1")).toBeNull();
  });
});

describe("failure is recorded, never lost", () => {
  it("requeues with backoff while attempts remain", async () => {
    const { id } = await withTransaction((tx) =>
      enqueue(tx, { kind: "send_email", payload: probe(), dedupeValue: `fail:${Date.now()}` }),
    );
    await claimNext("w1");
    const outcome = await markFailed(id, new Error("provider timeout"));
    expect(outcome).toBe("requeued");

    const row = await db.job.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe("queued");
    expect(row.error).toContain("provider timeout");
    expect(row.runAfter.getTime()).toBeGreaterThan(Date.now());
  });

  it("fails terminally after maxAttempts, with the error on the row", async () => {
    // 09 P04A criterion (d). A job that throws and vanishes is worse than one that fails
    // loudly — nobody knows the confirmation email was never sent.
    const { id } = await withTransaction((tx) =>
      enqueue(tx, { kind: "consistency_check", payload: probe() }),
    );
    const meta = JOB_KINDS.consistency_check;
    for (let i = 0; i < meta.maxAttempts; i++) {
      await claimNext("w1");
      await markFailed(id, new Error(`attempt ${i + 1} failed`));
      if (i < meta.maxAttempts - 1) {
        await db.job.update({ where: { id }, data: { runAfter: new Date(Date.now() - 1000) } });
      }
    }
    const row = await db.job.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe("failed");
    expect(row.finishedAt).not.toBeNull();
    expect(JSON.stringify(row.result)).toContain("failed");
  }, 30_000);
});

describe("the watchdog resumes, it does not restart", () => {
  it("requeues a job whose worker died, KEEPING progress_current", async () => {
    // 09 P04A criterion (b). A serverless function killed at its timeout writes nothing.
    // Resetting progress to zero would re-send the first 4,000 emails of a 5,000-row batch.
    const { id } = await withTransaction((tx) =>
      enqueue(tx, {
        kind: "email_batch",
        payload: probe(),
        createdByUserId: null,
        dedupeValue: null,
      }).catch(() => enqueue(tx, { kind: "analytics_dispatch", payload: probe() })),
    );

    await claimNext("doomed-worker");
    await reportProgress(id, 4000, 5000);

    // Simulate the kill: the row stays 'running' with a stale lock.
    await db.job.update({
      where: { id },
      data: { lockedAt: new Date(Date.now() - 3600_000) },
    });

    const requeued = await requeueStale();
    expect(requeued).toBeGreaterThan(0);

    const row = await db.job.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe("queued");
    expect(row.progressCurrent).toBe(4000);
    expect(row.progressTotal).toBe(5000);
    expect(row.error).toContain("watchdog");
  }, 30_000);

  it("does not touch a job that IS progressing", async () => {
    const { id } = await withTransaction((tx) =>
      enqueue(tx, { kind: "analytics_dispatch", payload: probe() }),
    );
    await claimNext("healthy-worker");
    await reportProgress(id, 1, 10); // touches locked_at
    await requeueStale();
    const row = await db.job.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe("running");
  });
});

describe("draining", () => {
  it("runs registered handlers and records success", async () => {
    const seen: string[] = [];
    registerHandler("analytics_dispatch", async ({ job }) => {
      seen.push(job.id);
      return { forwarded: 1 };
    });

    const { id } = await withTransaction((tx) =>
      enqueue(tx, { kind: "analytics_dispatch", payload: probe() }),
    );
    const stats = await drainJobs({ workerId: "w1", maxMs: 5000, maxJobs: 5 });

    expect(stats.succeeded).toBeGreaterThan(0);
    expect(seen).toContain(id);
    const row = await db.job.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe("succeeded");
    expect(JSON.stringify(row.result)).toContain("forwarded");
  }, 30_000);

  it("fails a kind with NO registered handler loudly instead of looping on it", async () => {
    const { id } = await withTransaction((tx) =>
      enqueue(tx, { kind: "media_orphan_scan", payload: probe() }),
    );
    await drainJobs({ workerId: "w1", maxMs: 5000, maxJobs: 5 });
    const row = await db.job.findUniqueOrThrow({ where: { id } });
    expect(row.error).toContain("No handler registered");
  }, 30_000);
});
