import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db/client";
import { AppError } from "@/lib/errors";

/**
 * The transaction primitives (01 §1.2).
 *
 * `Tx` is the type every service function that writes must accept, so that a caller can
 * compose several writes into one consistency boundary. A service that opens its own
 * transaction internally cannot be composed, and order creation needs inventory
 * reservation, coupon redemption and order insertion to commit or fail together.
 */
export type Tx = Prisma.TransactionClient;

/** Postgres serialization failure. The only error class worth retrying blindly. */
const SERIALIZATION_FAILURE = "40001";
/** Postgres deadlock detected. Also safe to retry — one side is chosen as victim. */
const DEADLOCK_DETECTED = "40P01";

function isRetryable(e: unknown): boolean {
  const code = (e as { code?: string } | null)?.code;
  return code === SERIALIZATION_FAILURE || code === DEADLOCK_DETECTED;
}

/**
 * The default transaction wrapper. **`ReadCommitted` deliberately.**
 *
 * The checkout transaction reserves stock with `SELECT … FOR UPDATE` on
 * `inventory_items`, which serialises the two buyers of a one-of-a-kind piece by itself.
 * Raising the level to `Serializable` adds nothing on top of the explicit row lock and
 * aborts one transaction under EVERY concurrent checkout — so the losing customer sees a
 * 500 rather than simply waiting. The coupon cap and the order number are single-row
 * counters, correct at `ReadCommitted`, and Postgres allows one isolation level per
 * transaction, so they could not be raised independently even if it helped (01 §1.2,
 * 05 §8.5).
 *
 * `timeout` is 8s: long enough for a checkout that touches a dozen rows, short enough
 * that a stuck transaction releases its locks before the function times out around it.
 */
export function withTransaction<T>(
  fn: (tx: Tx) => Promise<T>,
  opts?: { timeout?: number; maxWait?: number },
): Promise<T> {
  return db.$transaction(fn, {
    isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    timeout: opts?.timeout ?? 8_000,
    maxWait: opts?.maxWait ?? 5_000,
  });
}

/**
 * `Serializable` **with a retry loop** — the only place in the codebase permitted to
 * name that isolation level (enforced by `no-restricted-syntax` in eslint.config.mjs).
 *
 * Callers are out-of-checkout counter repair ONLY: admin coupon-cap edits,
 * `order_counters` repair, bulk redemption imports. Nothing on the checkout path may
 * call this — see `withTransaction` above for why.
 *
 * Without the retry, a serialization failure reaches the customer as a 500. With it,
 * the operation simply takes slightly longer. That is the entire reason this function
 * exists rather than an inline `isolationLevel` option.
 */
export async function withSerializableRetry<T>(
  fn: (tx: Tx) => Promise<T>,
  opts?: { attempts?: number; timeout?: number },
): Promise<T> {
  const attempts = opts?.attempts ?? 5;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await db.$transaction(fn, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: opts?.timeout ?? 8_000,
      });
    } catch (e) {
      if (!isRetryable(e)) throw e;
      lastError = e;
      // Exponential backoff with jitter. Without jitter, two retrying transactions
      // re-collide on the same schedule and the retry loop reproduces the conflict.
      const backoff = Math.min(2 ** attempt * 10, 200);
      await new Promise((r) => setTimeout(r, backoff + Math.floor(Math.random() * 20)));
    }
  }

  throw new SerializationRetryExhaustedError(attempts, lastError);
}

/**
 * Extends the ONE base class (11 §2.1), with code `CONCURRENCY` — which is precisely what
 * this is. `retryable` is inherited as true from the taxonomy, so a caller that surfaces
 * it can honestly offer "try again".
 */
export class SerializationRetryExhaustedError extends AppError {
  readonly code = "CONCURRENCY" as const;
  readonly httpStatus = 409;
  readonly copyKey = "copy.error.concurrency";
  override readonly retryable = true;
  constructor(attempts: number, cause: unknown) {
    super(
      `Transaction still conflicting after ${attempts} serializable attempts. This is ` +
        `contention on a counter row, not a bug in the caller — investigate what else ` +
        `writes it concurrently.`,
      { context: { attempts }, cause },
    );
  }
}
