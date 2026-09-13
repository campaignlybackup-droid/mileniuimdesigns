import "server-only";
import { db } from "@/lib/db/client";
import { requirePermission, type Actor } from "@/lib/rbac";
import { RateStaleError, RateUnavailableError, ValidationError } from "@/lib/errors";
import type { CurrencyCode } from "@/lib/pricing/types";

/**
 * Metal rates — 04 §3.1, §3.3. **This file is R03's mitigation, and the mitigation is an
 * ABSENCE.**
 *
 * `recordMetalRate()` inserts exactly one `metal_rates` row. It contains no `INSERT INTO
 * prices`, no `UPDATE prices` and no `revalidateTag()` — and it is physically unable to
 * acquire one, because the functions that write prices live in `recalc.ts` and `manual.ts` and
 * **this module does not import them**. That is checked by
 * `tests/integration/rate-change-does-not-move-prices.test.ts`, which raises silver 30% and
 * asserts byte-identical `prices` rows, an identical `getDisplayPrice()` result, zero new
 * `price_history` rows and zero cache purges.
 *
 * The failure it prevents is not dramatic. It is a support ticket three weeks later about a
 * ring that cost £30 more than the customer remembered, and a `price_history` row whose reason
 * says `metal_rate` and whose `recalc_run_id` is null — a price nobody approved.
 */

/** Per gram, ALWAYS. A troy-ounce quote is converted once, by a human or a provider adapter,
 *  at entry. There is no unit column, so there is nothing to misread. */
export type RecordMetalRateInput = {
  materialId: string;
  currencyCode: CurrencyCode;
  rateMinorPerGram: bigint;
  /** 0..6. Silver at ₹92.5000/g is not expressible in paise per gram without it. */
  rateScale: number;
  /** Business-meaningful and distinct from `created_at`: a Friday quote entered on Monday is
   *  dated Friday, and that is the date the preview reports. */
  effectiveAt: Date;
  source: string;
  sourceReference?: string | null;
};

export type MetalRateRecord = {
  id: string;
  materialId: string;
  currencyCode: CurrencyCode;
  rateMinorPerGram: bigint;
  rateScale: number;
  effectiveAt: Date;
};

export async function recordMetalRate(
  actor: Actor,
  input: RecordMetalRateInput,
): Promise<MetalRateRecord> {
  requirePermission(actor, "metal_rate.manage");

  if (input.rateMinorPerGram <= 0n) {
    throw new ValidationError("A metal rate must be positive.");
  }
  if (!Number.isInteger(input.rateScale) || input.rateScale < 0 || input.rateScale > 6) {
    throw new ValidationError("Rate scale must be a whole number between 0 and 6.");
  }

  const material = await db.$queryRaw<{ id: string; is_rate_linked: boolean }[]>`
    SELECT id::text AS id, is_rate_linked FROM materials
     WHERE id = ${input.materialId}::uuid AND deleted_at IS NULL
  `;
  if (!material[0]) throw new ValidationError("No such material.");
  if (!material[0].is_rate_linked) {
    // A rate against a material nothing prices from is a number that will never be used and
    // will still appear on the staleness matrix, where it reads as a problem.
    throw new ValidationError(
      "This material is not rate-linked, so a metal rate against it would never be read.",
    );
  }

  // The currency must exist. A quote filed under a currency the system does not have is a
  // quote that silently prices nothing — and `metal_rates.currency_code` FKs `currencies`,
  // so this is the readable version of what the database would say anyway.
  const currency = await db.$queryRaw<{ code: string }[]>`
    SELECT code FROM currencies WHERE code = ${input.currencyCode} AND is_active
  `;
  if (!currency[0]) throw new ValidationError(`No active currency '${input.currencyCode}'.`);

  const rows = await db.$queryRaw<Record<string, unknown>[]>`
    INSERT INTO metal_rates (id, material_id, currency_code, rate_minor_per_gram, rate_scale,
                             effective_at, source, source_reference, entered_by_user_id, created_at)
    VALUES (gen_random_uuid(), ${input.materialId}::uuid, ${input.currencyCode},
            ${input.rateMinorPerGram}, ${input.rateScale}, ${input.effectiveAt},
            ${input.source}, ${input.sourceReference ?? null},
            ${actor.kind === "staff" ? actor.userId : null}::uuid, now())
    RETURNING id::text AS id, material_id::text AS material_id, currency_code,
              rate_minor_per_gram, rate_scale, effective_at
  `;
  const row = rows[0]!;
  return {
    id: String(row["id"]),
    materialId: String(row["material_id"]),
    currencyCode: String(row["currency_code"]),
    rateMinorPerGram: BigInt(row["rate_minor_per_gram"] as bigint),
    rateScale: Number(row["rate_scale"]),
    effectiveAt: row["effective_at"] as Date,
  };
}

export type LatestRate = MetalRateRecord & { ageHours: number };

/**
 * The latest rate for each (material, currency) at an instant.
 *
 * `at` is passed in rather than read from the clock for the same reason as everywhere else in
 * this module: a recalculation run of eight thousand lines must use ONE rate per pair, not
 * whichever row happened to be latest when each line was evaluated.
 *
 * **`client` is a parameter, and that is not stylistic.** The recalc preview calls this from
 * inside an open interactive transaction. Reaching for the global `db` there issues the query
 * on a DIFFERENT connection — which on the local `prisma dev` server (a single-threaded pglite
 * engine) blocks behind the open transaction until the transaction times out, eight seconds
 * later, with an error naming the transaction rather than the query that stalled it. Against a
 * real Postgres it would not deadlock, it would merely read OUTSIDE the transaction's snapshot
 * — a rate inserted concurrently could be seen by half a run. Both are wrong; the parameter
 * makes neither possible.
 */
export async function getLatestRates(
  client: Pick<typeof db, "$queryRaw">,
  pairs: { materialId: string; currencyCode: CurrencyCode }[],
  at: Date,
): Promise<Map<string, LatestRate>> {
  if (pairs.length === 0) return new Map();
  const materialIds = [...new Set(pairs.map((p) => p.materialId))];
  const currencies = [...new Set(pairs.map((p) => p.currencyCode))];

  const rows = await client.$queryRaw<Record<string, unknown>[]>`
    SELECT DISTINCT ON (material_id, currency_code)
           id::text AS id, material_id::text AS material_id, currency_code,
           rate_minor_per_gram, rate_scale, effective_at
      FROM metal_rates
     WHERE material_id = ANY(${materialIds}::uuid[])
       AND currency_code = ANY(${currencies}::text[])
       AND effective_at <= ${at}
     ORDER BY material_id, currency_code, effective_at DESC
  `;

  const out = new Map<string, LatestRate>();
  for (const r of rows) {
    const effectiveAt = r["effective_at"] as Date;
    out.set(`${String(r["material_id"])}:${String(r["currency_code"])}`, {
      id: String(r["id"]),
      materialId: String(r["material_id"]),
      currencyCode: String(r["currency_code"]),
      rateMinorPerGram: BigInt(r["rate_minor_per_gram"] as bigint),
      rateScale: Number(r["rate_scale"]),
      effectiveAt,
      ageHours: (at.getTime() - effectiveAt.getTime()) / 3_600_000,
    });
  }
  return out;
}

/**
 * Whether a rate may be used to price, and why not if not.
 *
 * A missing rate and a stale one are DIFFERENT errors on purpose. "No USD silver rate" is a
 * setup problem; "the USD silver rate is eleven days old" is an operational one, and the admin
 * fixes them in different places. Both produce a `skipped` preview line rather than an
 * estimate — 04 §3.3 step 2 — because a price computed from a rate nobody trusts is worse than
 * no price at all.
 */
export function assertRateUsable(
  rate: LatestRate | undefined,
  maxAgeHours: number,
  label: string,
): asserts rate is LatestRate {
  if (!rate) throw new RateUnavailableError(`No ${label} rate.`);
  if (rate.ageHours > maxAgeHours) {
    throw new RateStaleError(
      `The ${label} rate is ${String(Math.round(rate.ageHours))} hours old, past the ${String(maxAgeHours)}-hour limit.`,
      { context: { rateId: rate.id, ageHours: rate.ageHours } },
    );
  }
}
