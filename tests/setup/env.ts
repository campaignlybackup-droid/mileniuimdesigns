/**
 * Loads the local environment before any test module imports `src/lib/config/env.ts`.
 *
 * `setupFiles` runs before test files, which matters: `src/lib/db/client.ts` calls
 * `env()` at module scope, so the variables must exist by import time, not by test time.
 *
 * In CI the variables come from the workflow's `env:` block and `.env.local` does not
 * exist — hence `override: false` and the missing-file tolerance.
 */
import { config } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

for (const file of [".env.local", ".env"]) {
  const path = resolve(process.cwd(), file);
  if (existsSync(path)) config({ path, override: false, quiet: true });
}
