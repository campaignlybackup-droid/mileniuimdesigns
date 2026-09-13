import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";

/**
 * Commissioned by 09 P10 exit criterion (c) — and by hard rule 2, which is the reason the
 * criterion exists.
 *
 * "$50 off" and "₹50 off" are not the same offer. At the time of writing they differ by a
 * factor of about eighty-five, and a `coupon_amounts` table that stored one number and
 * converted at read time would turn a modest American discount into a giveaway in India on the
 * day someone changed an FX rate nobody was reviewing. So a `fixed_amount` coupon has ONE ROW
 * PER CURRENCY, each entered by a person, and there is no conversion anywhere in the schema or
 * the code that reads it.
 */

const stamp = Date.now();
const code = `ZZP10${String(stamp).slice(-8)}`;
let couponId = "";

beforeAll(async () => {
  const rows = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO coupons (id, code, trigger, name, type, applies_to, redemption_count,
                         is_active, is_stackable, priority, version, created_at, updated_at)
    VALUES (gen_random_uuid(), ${code}, 'code', 'ZZ P10 PROBE', 'fixed_amount', 'order',
            0, true, false, 0, 1, now(), now())
    RETURNING id::text AS id
  `;
  couponId = rows[0]!.id;
});

afterAll(async () => {
  await db.$executeRaw`DELETE FROM coupons WHERE code = ${code}`;
});

describe("P10 (c) — a coupon amount cannot name a currency the system does not have", () => {
  it("refuses a currency absent from `currencies`", async () => {
    await expect(
      db.$executeRaw`
        INSERT INTO coupon_amounts (coupon_id, currency_code, amount_minor, created_at, updated_at)
        VALUES (${couponId}::uuid, 'GBP', 5000, now(), now())
      `,
    ).rejects.toThrow();

    const rows = await db.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM coupon_amounts WHERE coupon_id = ${couponId}::uuid
    `;
    expect(rows[0]!.n).toBe(0);
  });

  it("accepts the currencies that do exist", async () => {
    // The converse. A foreign key that refused everything would pass the test above.
    await db.$executeRaw`
      INSERT INTO coupon_amounts (coupon_id, currency_code, amount_minor, created_at, updated_at)
      VALUES (${couponId}::uuid, 'USD', 5000, now(), now())
    `;
    await db.$executeRaw`
      INSERT INTO coupon_amounts (coupon_id, currency_code, amount_minor, created_at, updated_at)
      VALUES (${couponId}::uuid, 'INR', 400000, now(), now())
    `;
    const rows = await db.$queryRaw<{ currency_code: string; amount_minor: bigint }[]>`
      SELECT currency_code, amount_minor FROM coupon_amounts
      WHERE coupon_id = ${couponId}::uuid ORDER BY currency_code
    `;
    expect(rows.map((r) => r.currency_code)).toEqual(["INR", "USD"]);
  });

  it("holds two amounts that are not a conversion of one another", async () => {
    // The point of the table, asserted as a property rather than left to a comment. $50 is
    // 5000 minor units; ₹4000 is 400000. If either were derived from the other by any rate,
    // the merchandiser's second decision would not exist — and the first FX move would
    // silently reprice a market nobody was looking at.
    const rows = await db.$queryRaw<{ currency_code: string; amount_minor: bigint }[]>`
      SELECT currency_code, amount_minor FROM coupon_amounts
      WHERE coupon_id = ${couponId}::uuid ORDER BY currency_code
    `;
    const byCurrency = new Map(rows.map((r) => [r.currency_code, BigInt(r.amount_minor)]));
    expect(byCurrency.get("USD")).toBe(5000n);
    expect(byCurrency.get("INR")).toBe(400000n);
  });

  it("refuses a second row for the same (coupon, currency)", async () => {
    // The primary key. Two USD amounts for one coupon and the discount is whichever row the
    // query happened to return.
    await expect(
      db.$executeRaw`
        INSERT INTO coupon_amounts (coupon_id, currency_code, amount_minor, created_at, updated_at)
        VALUES (${couponId}::uuid, 'USD', 9900, now(), now())
      `,
    ).rejects.toThrow();
  });

  it("refuses a zero or negative amount", async () => {
    await expect(
      db.$executeRaw`
        INSERT INTO coupon_amounts (coupon_id, currency_code, amount_minor, created_at, updated_at)
        VALUES (${couponId}::uuid, 'USD', 0, now(), now())
      `,
    ).rejects.toThrow();
  });
});

describe("P10 — a coupon's code and trigger agree", () => {
  it("refuses a code-triggered coupon with no code", async () => {
    await expect(
      db.$executeRaw`
        INSERT INTO coupons (id, code, trigger, name, type, applies_to, redemption_count,
                             is_active, is_stackable, priority, version, created_at, updated_at)
        VALUES (gen_random_uuid(), NULL, 'code', 'ZZ', 'percentage', 'order', 0, true, false, 0, 1, now(), now())
      `,
    ).rejects.toThrow();
  });

  it("refuses an automatic coupon that carries one", async () => {
    // Both directions, because `(trigger = 'code') = (code IS NOT NULL)` is an equivalence and
    // a test of one side would pass against a one-way implication.
    await expect(
      db.$executeRaw`
        INSERT INTO coupons (id, code, trigger, name, type, applies_to, redemption_count,
                             is_active, is_stackable, priority, version, created_at, updated_at)
        VALUES (gen_random_uuid(), ${`${code}X`}, 'automatic', 'ZZ', 'percentage', 'order', 0, true, false, 0, 1, now(), now())
      `,
    ).rejects.toThrow();
  });

  it("refuses a percentage coupon with no percentage", async () => {
    await expect(
      db.$executeRaw`
        INSERT INTO coupons (id, code, trigger, name, type, applies_to, redemption_count,
                             is_active, is_stackable, priority, version, created_at, updated_at)
        VALUES (gen_random_uuid(), ${`${code}Y`}, 'code', 'ZZ', 'percentage', 'order', 0, true, false, 0, 1, now(), now())
      `,
    ).rejects.toThrow();
  });
});
