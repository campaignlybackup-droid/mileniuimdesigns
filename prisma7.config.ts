// Prisma 7.10 moved datasource configuration out of schema.prisma and into this file,
// and its `Datasource` type is `{ url?, shadowDatabaseUrl? }` — there is NO `directUrl`.
//
// docs/architecture/01-stack-and-structure.md §5.4 was written against Prisma 7.9, where
// the pooled/direct split lived in a `datasource { url, directUrl }` block. The rule it
// encodes is unchanged and still load-bearing:
//
//   Migrations take SESSION-LEVEL ADVISORY LOCKS that a transaction pooler does not
//   preserve, so running them through a pooled endpoint hangs or fails.
//
// So the split moves rather than disappearing:
//   - THIS FILE is read by the Prisma CLI, which is what runs migrations → DIRECT_URL.
//   - The application's runtime pool (src/lib/db/client.ts, @prisma/adapter-pg) is
//     constructed from DATABASE_URL → the POOLED endpoint.
//
// scripts/check-env.ts fails the build if DIRECT_URL contains "-pooler".
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  // A DIRECTORY, not a file: the schema is split across prisma/schema/*.prisma so that
  // forty-plus models do not live in one unreviewable file (01 §3).
  schema: "prisma/schema",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"],
    shadowDatabaseUrl: process.env["SHADOW_DATABASE_URL"],
  },
});
