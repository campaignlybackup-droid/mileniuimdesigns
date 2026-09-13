import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { withTransaction } from "@/lib/db/transaction";
import { consume, enforce, hashKeyMaterial, LIMITS, pruneExpired } from "@/lib/ratelimit";
import { RateLimitedError } from "@/lib/errors";

/**
 * Commissioned by 09 P03A criterion (c) and 07 §1.6, §5.5.
 */
const probe = (n: string) => `probe-${n}-${process.pid}`;

afterAll(async () => {
  await db.$executeRaw`DELETE FROM rate_limits WHERE key LIKE '%probe-%'`;
});

describe("counting", () => {
  it("allows up to the limit and refuses beyond it", async () => {
    const spec = {
      prefix: "login:ip",
      limit: 3,
      windowSeconds: 900,
      onFailure: "closed",
    } as const;
    const key = probe("count");
    const results = [];
    for (let i = 0; i < 5; i++) results.push(await consume(spec, key));
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false, false]);
    expect(results[2]!.remaining).toBe(0);
  });

  it("reports Retry-After so a client knows when to come back", async () => {
    const spec = {
      prefix: "login:ip",
      limit: 1,
      windowSeconds: 900,
      onFailure: "closed",
    } as const;
    const key = probe("retry");
    await consume(spec, key);
    const denied = await consume(spec, key);
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterSeconds).toBeGreaterThan(0);
    expect(denied.retryAfterSeconds).toBeLessThanOrEqual(900);
  });

  it("throws RateLimitedError with a 429 from enforce()", async () => {
    const spec = {
      prefix: "login:ip",
      limit: 1,
      windowSeconds: 900,
      onFailure: "closed",
    } as const;
    const key = probe("enforce");
    await enforce(spec, key);
    await expect(enforce(spec, key)).rejects.toBeInstanceOf(RateLimitedError);
    try {
      await enforce(spec, key);
    } catch (e) {
      expect((e as RateLimitedError).httpStatus).toBe(429);
    }
  });

  it("keeps separate keys separate", async () => {
    const spec = {
      prefix: "login:ip",
      limit: 1,
      windowSeconds: 900,
      onFailure: "closed",
    } as const;
    expect((await consume(spec, probe("a"))).allowed).toBe(true);
    expect((await consume(spec, probe("b"))).allowed).toBe(true);
  });

  it("is atomic under concurrency — two racers cannot both take the last slot", async () => {
    // A read-then-write would let both read `count = limit - 1` and both proceed. The
    // conditional INSERT ... ON CONFLICT DO UPDATE is one statement.
    const spec = {
      prefix: "login:ip",
      limit: 5,
      windowSeconds: 900,
      onFailure: "closed",
    } as const;
    const key = probe("race");
    const results = await Promise.all(Array.from({ length: 20 }, () => consume(spec, key)));
    expect(results.filter((r) => r.allowed).length).toBe(5);
  });
});

describe("the limiter survives the caller's rollback", () => {
  it("a failed-login transaction that ROLLS BACK does not un-count the attempt", async () => {
    // THE property. 07 §1.6's sequence increments the counter, writes the rate-limit row
    // and writes an audit row, then throws. Wrapped in one transaction — the natural way
    // to write it — all three roll back and the counter reads 0 after ten thousand
    // guesses. `consume()` holds its own connection precisely so that cannot happen.
    const spec = {
      prefix: "login:email",
      limit: 3,
      windowSeconds: 900,
      onFailure: "closed",
    } as const;
    const key = probe("rollback");

    // Warm the limiter's own connection BEFORE opening the caller's transaction. The
    // limiter deliberately holds a separate client, and creating it lazily inside a
    // transaction means its first connect competes with the transaction's own
    // connection for the local server's small ceiling. Warming isolates the property
    // under test from connection setup — it does not weaken it: the counting below
    // still happens entirely inside the aborted transaction.
    await consume(spec, probe("rollback-warm"));

    await expect(
      withTransaction(async () => {
        await consume(spec, key);
        await consume(spec, key);
        await consume(spec, key);
        throw new Error("login failed — transaction aborts");
      }),
    ).rejects.toThrow("login failed");

    // Three attempts were counted, and the rollback did not erase them.
    const next = await consume(spec, key);
    expect(next.allowed).toBe(false);
  }, 20_000);
});

describe("key material never identifies a person", () => {
  it("HMACs an email rather than storing it", async () => {
    // rate_limits has no foreign key and must hold nothing that resolves to someone —
    // otherwise the table is an enumerable list of everyone who ever tried to sign in
    // (11 §4.1).
    const email = "shopper@example.test";
    const hashed = hashKeyMaterial(email);
    expect(hashed).not.toContain("shopper");
    expect(hashed).not.toContain("@");
    expect(hashed).toHaveLength(32);

    await consume(
      { prefix: "login:email", limit: 5, windowSeconds: 900, onFailure: "closed" },
      hashed,
    );
    const rows = await db.$queryRaw<{ n: bigint }[]>`
      SELECT count(*)::bigint AS n FROM rate_limits WHERE key LIKE ${"%" + email + "%"}
    `;
    expect(Number(rows[0]!.n)).toBe(0);
  });

  it("is case-insensitive — Shopper@ and shopper@ are one person", () => {
    expect(hashKeyMaterial("Shopper@Example.test")).toBe(
      hashKeyMaterial("shopper@example.test"),
    );
  });
});

describe("the declared limits", () => {
  it("fails CLOSED on every credential, money and token-oracle endpoint", () => {
    // A limiter that fails open on a login endpoint is not a limiter.
    for (const name of [
      "loginIp",
      "loginEmail",
      "otpRequest",
      "passwordReset",
      "checkout",
      "couponApply",
      "wishlistShare",
      "backInStockIp",
      "backInStockEmail",
    ] as const) {
      expect(LIMITS[name].onFailure, `${name} must fail closed`).toBe("closed");
    }
  });

  it("fails open only where losing data costs more than the abuse", () => {
    expect(LIMITS.search.onFailure).toBe("open");
  });

  it("prunes expired windows", async () => {
    await expect(pruneExpired()).resolves.toBeTypeOf("number");
  });
});
