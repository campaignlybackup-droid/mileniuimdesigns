import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { env } from "@/lib/config/env";

/**
 * The single Prisma client for the whole application (01 §1.2).
 *
 * Everything about this file is deliberate:
 *
 *  - **`@prisma/adapter-pg`, not the Rust data proxy.** The app owns its own `pg` pool,
 *    which is the only way to bound connection count — and the local `prisma dev` server
 *    caps at ~10 connections (00-CONTEXT §3), so an unbounded pool fails locally in ways
 *    that look like application bugs.
 *
 *  - **`DATABASE_URL`, the POOLED endpoint.** Migrations use `DIRECT_URL` via
 *    `prisma7.config.ts`. They must not share an endpoint: migrations take
 *    session-level advisory locks that a transaction pooler does not preserve
 *    (01 §5.4, §6.2).
 *
 *  - **`max` from `DATABASE_CONNECTION_LIMIT`, not a literal.** `@prisma/adapter-pg`
 *    ignores `?connection_limit=` in the URL — that parameter is read by Prisma's Rust
 *    engine, which this adapter replaces. Setting it in the URL and believing it is how
 *    a pool silently grows past its ceiling.
 *
 *  - **A global singleton in development.** Next's dev server re-evaluates modules on
 *    every hot reload; without this, each reload leaks a pool and the tenth reload
 *    exhausts `prisma dev`.
 */
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  pgAdapter?: PrismaPg;
};

function createClient(): PrismaClient {
  const { DATABASE_URL, DATABASE_CONNECTION_LIMIT, APP_ENV } = env();

  const adapter =
    globalForPrisma.pgAdapter ??
    new PrismaPg({
      connectionString: DATABASE_URL,
      max: DATABASE_CONNECTION_LIMIT,
      // Kept small and explicit for the same reason as `max`: a connection held open
      // against prisma dev is one of ten.
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
    });

  if (APP_ENV !== "production") globalForPrisma.pgAdapter = adapter;

  return new PrismaClient({
    adapter,
    log: APP_ENV === "local" ? ["warn", "error"] : ["error"],
  });
}

export const db: PrismaClient = globalForPrisma.prisma ?? createClient();

if (env().APP_ENV !== "production") globalForPrisma.prisma = db;
