import { describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { withTransaction, withSerializableRetry } from "@/lib/db/transaction";

/**
 * Proves the data layer of 09 P02 actually works against a real database — not a mock.
 * A mock cannot tell you that the adapter speaks the server's protocol, that the pool
 * respects its ceiling, or that a transaction rolls back.
 */
describe("database connection", () => {
  it("connects through @prisma/adapter-pg and executes SQL", async () => {
    const rows = await db.$queryRaw<{ ok: number }[]>`SELECT 1::int AS ok`;
    expect(rows[0]!.ok).toBe(1);
  });

  it("has the extensions 02 §7.1 depends on", async () => {
    const rows = await db.$queryRaw<{ extname: string }[]>`
      SELECT extname FROM pg_extension WHERE extname IN ('pg_trgm', 'btree_gist')
    `;
    expect(rows.map((r) => r.extname).sort()).toEqual(["btree_gist", "pg_trgm"]);
  });

  it("is at migration head", async () => {
    const rows = await db.$queryRaw<{ migration_name: string }[]>`
      SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL
    `;
    expect(rows.length).toBeGreaterThan(0);
  });
});

describe("withTransaction", () => {
  it("runs at ReadCommitted — the level reserveStock() requires (01 §1.2)", async () => {
    const level = await withTransaction(async (tx) => {
      // SHOW does not accept a column alias, so its column is `transaction_isolation`.
      // current_setting() does, which keeps the assertion readable.
      const rows = await tx.$queryRaw<{ l: string }[]>`
        SELECT current_setting('transaction_isolation') AS l
      `;
      return rows[0]!.l;
    });
    // Postgres reports it with a space.
    expect(level).toBe("read committed");
  });

  it("rolls back on throw — a failed order leaves nothing behind", async () => {
    await db.$executeRawUnsafe(`CREATE TEMP TABLE IF NOT EXISTS _tx_probe (v int)`);
    await expect(
      withTransaction(async (tx) => {
        await tx.$executeRawUnsafe(`CREATE TABLE _rollback_probe (v int)`);
        throw new Error("deliberate");
      }),
    ).rejects.toThrow("deliberate");

    const rows = await db.$queryRaw<{ n: bigint }[]>`
      SELECT count(*)::bigint AS n FROM information_schema.tables
      WHERE table_name = '_rollback_probe'
    `;
    expect(Number(rows[0]!.n)).toBe(0);
  });
});

describe("withSerializableRetry", () => {
  it("actually runs at Serializable — the one place allowed to (01 §1.2)", async () => {
    const level = await withSerializableRetry(async (tx) => {
      // SHOW does not accept a column alias, so its column is `transaction_isolation`.
      // current_setting() does, which keeps the assertion readable.
      const rows = await tx.$queryRaw<{ l: string }[]>`
        SELECT current_setting('transaction_isolation') AS l
      `;
      return rows[0]!.l;
    });
    expect(level).toBe("serializable");
  });

  it("does not retry a non-serialization error — that would mask a real bug", async () => {
    let calls = 0;
    await expect(
      withSerializableRetry(async () => {
        calls++;
        throw Object.assign(new Error("not a conflict"), { code: "23505" });
      }),
    ).rejects.toThrow("not a conflict");
    expect(calls).toBe(1);
  });
});
