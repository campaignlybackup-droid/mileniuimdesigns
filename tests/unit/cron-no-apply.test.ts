import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Commissioned by R03 and 04 §3.3 — **no cron may change a price.**
 *
 * The whole recalculation design rests on there being no edge from an automated rate refresh
 * to a changed price. `chk_recalc_approved` enforces the database half. This is the code half:
 * a scheduled handler that imports `applyRecalcRun`, `runRecalcApply` or `setManualPrice` has
 * that edge, whatever it currently chooses to call.
 *
 * Written as a scan over EVERY cron route rather than a check on the one route that refreshes
 * rates, because the next person to need "just this once, apply it automatically" will reach
 * for whichever handler is nearest.
 */
const ROOT = process.cwd();
const CRON_DIR = resolve(ROOT, "src/app/api/cron");

/** Names that write, or lead to something that writes, a price. */
const FORBIDDEN = [
  "applyRecalcRun",
  "runRecalcApply",
  "approveRecalcRun",
  "setManualPrice",
  "INSERT INTO prices",
  "UPDATE prices",
] as const;

/** The worker route legitimately reaches the apply — through the QUEUE, which is the point:
 *  a job carries `created_by_user_id`, and `recalc_apply` is `systemPermitted: false`, so the
 *  only way one exists is that a person with `price.approve_recalc` created it. */
const WORKER = "run-jobs";

function codeOf(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}

describe("no scheduled handler can change a price", () => {
  const routes = readdirSync(CRON_DIR)
    .filter((d) => d !== WORKER)
    .map((d) => ({ name: d, file: resolve(CRON_DIR, d, "route.ts") }))
    .filter((r) => existsSync(r.file));

  it("scans every cron route", () => {
    // A scan over an empty directory passes forever.
    expect(routes.length).toBeGreaterThanOrEqual(8);
    expect(routes.map((r) => r.name)).toContain("metal-rate-refresh");
  });

  it("none of them reaches a price writer", () => {
    const offenders: string[] = [];
    for (const route of routes) {
      const src = codeOf(route.file);
      for (const f of FORBIDDEN) {
        if (src.includes(f)) offenders.push(`${route.name}: ${f}`);
      }
    }
    expect(
      offenders,
      "R03: a rate refresh that can reach a price writer is one merge away from repricing the catalogue at 03:00 with no approver.",
    ).toEqual([]);
  });

  it("the worker route is exempt for a reason that is itself checked", async () => {
    // It reaches the apply THROUGH the queue. That is safe only because `recalc_apply` is
    // systemPermitted: false — so a job of that kind cannot exist without a human behind it.
    // Asserting the exemption's PREMISE is what stops the exemption outliving its reason.
    const { JOB_KINDS } = await import("@/lib/jobs/kinds");
    expect(JOB_KINDS.recalc_apply.systemPermitted).toBe(false);
  });

  it("detects a violation when one exists", () => {
    const sample = "await applyRecalcRun(actor, id);";
    expect(FORBIDDEN.some((f) => sample.includes(f))).toBe(true);
  });
});
