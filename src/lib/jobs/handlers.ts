import "server-only";
import { z } from "zod";
import { registerHandler } from "@/lib/jobs";
import { runRecalcApply } from "@/lib/pricing/recalc";

/**
 * Job handler registrations — imported once, for its side effects, by the worker route.
 *
 * Separate from `jobs/index.ts` so the queue machinery does not import every service in the
 * application: `index.ts` is imported by `enqueue` call sites all over the codebase, and a
 * registry that pulled in pricing, CMS and imports would make every one of them do the same.
 */

const recalcPayload = z.object({ recalcRunId: z.uuid() }).strict();

registerHandler("recalc_apply", async ({ job }) => {
  // `.strict()` because a payload that grew a field — `skipValidation`, say — would otherwise
  // be silently dropped here and the job would do something other than what enqueued it asked.
  const { recalcRunId } = recalcPayload.parse(job.payload);
  const { applied, failed } = await runRecalcApply(recalcRunId);
  return { recalcRunId, applied, failed };
});

export const REGISTERED_AT_BOOT = ["recalc_apply"] as const;
