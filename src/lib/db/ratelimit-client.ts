import "server-only";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "@/lib/config/env";

/**
 * A SECOND, deliberately separate Prisma client, for the rate limiter only.
 *
 * It lives in the data layer because that is the only layer permitted to import the
 * generated client — but it is separate from `db` on purpose, and the separation is the
 * security property:
 *
 * 07 §1.6's failed-login sequence increments a counter, writes a rate-limit row and
 * writes an audit row, then throws. Wrapped in one transaction — the natural way to write
 * it — all three roll back and the counter reads 0 after ten thousand guesses. A limiter
 * sharing the caller's client can be enrolled in the caller's transaction by accident;
 * one with its own connection cannot.
 *
 * The pool is tiny (2): this must remain writable when every other table is contended,
 * and it must never starve the application pool — which matters more on the local
 * `prisma dev` server, whose ceiling is about ten connections in total.
 */
const globalForRateLimit = globalThis as unknown as { rateLimitPrisma?: PrismaClient };

export function rateLimitDb(): PrismaClient {
  if (!globalForRateLimit.rateLimitPrisma) {
    globalForRateLimit.rateLimitPrisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: env().DATABASE_URL, max: 2 }),
    });
  }
  return globalForRateLimit.rateLimitPrisma;
}
