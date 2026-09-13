import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    setupFiles: ["tests/setup/env.ts"],
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
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
