import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { CRON_JOBS, CRON_PATHS } from "@/lib/config/crons";

/**
 * Commissioned by 09 P04A exit criterion (e).
 *
 * Three copies of one list must agree. The failure is silent in BOTH directions: a
 * handler with no schedule never runs and reads fine; a schedule with no handler 404s on
 * a timer nobody watches. 01 §5.6 shipped with nine entries while the system needed ten.
 */
const ROOT = process.cwd();

function scheduledPaths(): string[] {
  const raw = readFileSync(resolve(ROOT, "vercel.json"), "utf8");
  const json = JSON.parse(raw) as { crons?: { path: string; schedule: string }[] };
  return (json.crons ?? []).map((c) => c.path);
}

function handlerPaths(): string[] {
  const dir = resolve(ROOT, "src/app/api/cron");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((d) => existsSync(resolve(dir, d, "route.ts")))
    .map((d) => `/api/cron/${d}`);
}

describe("cron registry", () => {
  it("has ten entries, not nine", () => {
    // Pinned: 01 §5.6 tabulated nine while 04 §5.4 cited a tenth that was absent.
    expect(CRON_JOBS.length).toBe(10);
  });

  it("vercel.json and the constant are the same set", () => {
    expect([...scheduledPaths()].sort()).toEqual([...CRON_PATHS].sort());
  });

  it("every scheduled path has a handler", () => {
    const handlers = new Set(handlerPaths());
    const missing = scheduledPaths().filter((p) => !handlers.has(p));
    expect(missing).toEqual([]);
  });

  it("every handler is scheduled", () => {
    const scheduled = new Set(scheduledPaths());
    const unregistered = handlerPaths().filter((p) => !scheduled.has(p));
    expect(unregistered).toEqual([]);
  });

  it("every schedule is a valid five-field cron expression", () => {
    const raw = readFileSync(resolve(ROOT, "vercel.json"), "utf8");
    const json = JSON.parse(raw) as { crons: { path: string; schedule: string }[] };
    for (const c of json.crons) {
      const fields = c.schedule.trim().split(/\s+/);
      expect(fields, `${c.path}: "${c.schedule}"`).toHaveLength(5);
    }
  });

  it("states what breaks for every job — a cron nobody can justify is a cron nobody maintains", () => {
    for (const c of CRON_JOBS) {
      expect(c.breaksIfMissing.length, c.path).toBeGreaterThan(40);
      expect(c.maxRuntimeSeconds).toBeGreaterThan(0);
    }
  });

  it("every handler authenticates — a cron route is a public URL doing privileged work", () => {
    const dir = resolve(ROOT, "src/app/api/cron");
    for (const d of readdirSync(dir)) {
      const file = resolve(dir, d, "route.ts");
      if (!existsSync(file)) continue;
      const src = readFileSync(file, "utf8");
      expect(src, `${d} does not call assertCronRequest`).toContain("assertCronRequest");
    }
  });
});
