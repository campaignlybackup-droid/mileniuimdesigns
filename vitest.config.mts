import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    setupFiles: ["tests/setup/env.ts"],
    // 09 §1 is normative on BOTH halves of this: several files commissioned in 03-08 are
    // named `.spec.ts` inside the Vitest trees, those names are kept, and the glob must
    // therefore collect `{test,spec}` — otherwise `market-switch-cart.spec.ts` is collected
    // by nothing, and the single test that stops an INR line surviving into a USD bag is
    // absent from every CI run while appearing green in the plan. The conventional
    // `*.test.ts`-only glob shipped anyway at P02 and was still here at P20.
    //
    // Scoped to the four Vitest trees rather than `tests/**`, because `tests/e2e/` and
    // `tests/a11y/` are PLAYWRIGHT's `.spec.ts` files. A bare `tests/**/*.spec.ts` would hand
    // them to the wrong runner, where they would fail for reasons having nothing to do with
    // the thing under test.
    include: [
      "tests/{unit,db,integration,api}/**/*.{test,spec}.{ts,tsx}",
      "tests/perf/**/*.bench.ts",
    ],
    // The local Prisma dev server caps at ~10 connections (00-CONTEXT §3). Integration
    // tests therefore run single-file to avoid exhausting the pool and failing in ways
    // that look like application bugs.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // `server-only` ships two entries: ./empty.js under the "react-server" condition,
      // and ./index.js — which THROWS — under "default". Vitest resolves through the
      // CJS require path, so the condition never applies and every server module fails
      // to import. We point at the package's OWN server entry rather than stubbing the
      // package out, so the guard stays real in the production build and these tests
      // exercise exactly the module the server would load.
      "server-only": fileURLToPath(
        new URL("./node_modules/server-only/empty.js", import.meta.url),
      ),
    },
    // `server-only` exports an empty module under the "react-server" condition and a
    // module that THROWS under "default". Server code is exactly what these tests
    // exercise, so we resolve the same entry the server build would — rather than
    // stubbing the package out, which would disable a real protection in production code
    // just to make a test pass.
    conditions: ["react-server", "node", "import"],
  },
});
