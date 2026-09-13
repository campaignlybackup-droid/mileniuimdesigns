import "server-only";
import { z } from "zod";
import { registerHandler } from "@/lib/jobs";
import { runRecalcApply } from "@/lib/pricing/recalc";
import { reconcileInventory } from "@/lib/inventory";

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

/**
 * R01's early-warning signal (09 P19, §5 launch blocker).
 *
 * `systemPermitted: true` and `dedupeKey: 'kind'` — it runs with a NULL creator because no
 * human enqueues it, and only one may be queued at a time.
 *
 * **It REPORTS into `jobs.result` and heals nothing.** A counter silently rewritten is an
 * oversell whose evidence was destroyed: the divergence is the only trace that something went
 * wrong, and a job that corrects it means the next one happens with nothing left to find.
 */
registerHandler("reconcile_inventory", async () => {
  const result = await reconcileInventory();
  return {
    itemsChecked: result.itemsChecked,
    divergenceCount: result.divergences.length,
    // Capped: a systemic drift would otherwise write ten thousand rows into a jobs.result
    // column that an admin screen then has to render. The count above is the alarm.
    divergences: result.divergences.slice(0, 50),
    healed: result.healed,
  };
});

export const REGISTERED_AT_BOOT = ["recalc_apply", "reconcile_inventory"] as const;
