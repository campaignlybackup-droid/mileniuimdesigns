import "server-only";
import { withTransaction } from "@/lib/db/transaction";
import { requirePermission, type Actor } from "@/lib/rbac";
import { ConflictError, ManualOverrideError, ValidationError } from "@/lib/errors";
import type { MarketCode, PriceRecord } from "@/lib/pricing/types";

/**
 * The manual price write path — 04 §1.3, §2.2.
 *
 * **ONE MARKET PER CALL. There is no multi-market write, and that is a design decision rather
 * than an omission.** A single call taking `{ US: 18900, IN: 1590000 }` is one form submission
 * away from a UI that shows one number and writes two, and the whole point of hard rule 2 is
 * that the second number is a separate commercial decision by a person. The admin's per-market
 * editors each call this once.
 *
 * A change is a NEW ROW plus a `valid_to` on the old one — never an UPDATE of an amount.
 * An order placed last March has to stay explicable from rows that exist today, and
 * `prices.id` is logged onto the order line for exactly that.
 */

export type SetManualPriceInput = {
  productId: string;
  /** `null` = the product-level default row, which is always `manual` by construction. */
  variantId: string | null;
  marketCode: MarketCode;
  listMinor: bigint;
  saleMinor: bigint | null;
  compareAtMinor: bigint | null;
  costMinor: bigint | null;
  /** The `prices.id` being superseded. `null` = this is the first price in this market. */
  expectedPriceId: string | null;
  reason: string;
  note?: string;
};

export async function setManualPrice(
  actor: Actor,
  input: SetManualPriceInput,
): Promise<PriceRecord> {
  // Checked BEFORE any read of the input's amounts (hard rule 9).
  requirePermission(actor, "price.update");

  if (input.listMinor < 0n) throw new ValidationError("A list price cannot be negative.");
  if (input.saleMinor !== null && input.saleMinor > input.listMinor) {
    // The database says this too (chk_prices_sale_lte_list). Saying it here first is the
    // difference between a sentence and a constraint violation.
    throw new ValidationError("A sale price cannot exceed the list price.");
  }

  return withTransaction(async (tx) => {
    const market = await tx.$queryRaw<{ currency_code: string }[]>`
      SELECT currency_code FROM markets WHERE code = ${input.marketCode} AND is_active
    `;
    const currencyCode = market[0]?.currency_code;
    if (currencyCode === undefined) {
      throw new ValidationError(`No active market '${input.marketCode}'.`);
    }

    // A manual price and an active formula binding are mutually exclusive per
    // (variant, market) — 04 §2.2. Without this, a merchandiser types a holiday price over a
    // formula-priced ring, the binding stays active, and that night's approved recalc run
    // silently reverts it. Nobody looks at the SKU again until the campaign report.
    if (input.variantId !== null) {
      const bound = await tx.$queryRaw<{ id: string }[]>`
        SELECT id::text AS id FROM price_formula_bindings
         WHERE variant_id = ${input.variantId}::uuid
           AND market_code = ${input.marketCode}
           AND is_active
      `;
      if (bound[0]) {
        throw new ManualOverrideError(
          "This variant is priced by a formula in this market. Either unbind it (the current price stays), or override it as a hybrid fixed price, which keeps the piece tracked against its metal content.",
          {
            context: {
              bindingId: bound[0].id,
              variantId: input.variantId,
              marketCode: input.marketCode,
            },
          },
        );
      }
    }

    // Close the current row. The conditional UPDATE is the optimistic lock: if someone else
    // superseded it between the editor loading and saving, zero rows match and the write is
    // refused rather than silently creating a second live price that `idx_prices_active` would
    // then reject with a message naming an index the merchandiser never heard of.
    const closed = await closeCurrent(tx, input);
    if (input.expectedPriceId !== null && closed === 0) {
      throw new ConflictError(
        "This price changed while you were editing it. Reload to see the current figure before reapplying your change.",
      );
    }

    const rows = await tx.$queryRaw<Record<string, unknown>[]>`
      INSERT INTO prices (id, product_id, variant_id, market_code, currency_code,
                          list_minor, sale_minor, compare_at_minor, cost_minor,
                          price_source, valid_from, created_by_user_id, created_at)
      VALUES (gen_random_uuid(), ${input.productId}::uuid, ${input.variantId}::uuid,
              ${input.marketCode}, ${currencyCode},
              ${input.listMinor}, ${input.saleMinor}, ${input.compareAtMinor}, ${input.costMinor},
              'manual', now(), ${actor.kind === "staff" ? actor.userId : null}::uuid, now())
      RETURNING id::text AS id, product_id::text AS product_id, variant_id::text AS variant_id,
                market_code, currency_code, list_minor, sale_minor, compare_at_minor,
                price_source::text AS price_source, valid_from
    `;
    const row = rows[0]!;

    await tx.$executeRaw`
      INSERT INTO price_history (id, price_id, previous_price_id, product_id, variant_id,
                                 market_code, currency_code, previous_list_minor, new_list_minor,
                                 previous_sale_minor, new_sale_minor, reason, actor_type,
                                 actor_user_id, note, created_at)
      SELECT gen_random_uuid(), ${String(row["id"])}::uuid, ${input.expectedPriceId}::uuid,
             ${input.productId}::uuid, ${input.variantId}::uuid, ${input.marketCode},
             ${currencyCode}, prev.list_minor, ${input.listMinor},
             prev.sale_minor, ${input.saleMinor}, ${input.reason}::price_change_reason,
             ${actor.kind === "staff" ? "staff" : "system"}::actor_type,
             ${actor.kind === "staff" ? actor.userId : null}::uuid, ${input.note ?? null}, now()
      FROM (SELECT list_minor, sale_minor FROM prices WHERE id = ${input.expectedPriceId}::uuid
            UNION ALL SELECT NULL, NULL WHERE ${input.expectedPriceId}::uuid IS NULL) AS prev
      LIMIT 1
    `;

    return {
      id: String(row["id"]),
      productId: String(row["product_id"]),
      variantId: (row["variant_id"] as string | null) ?? null,
      marketCode: String(row["market_code"]),
      currencyCode: String(row["currency_code"]),
      listMinor: BigInt(row["list_minor"] as bigint),
      saleMinor: row["sale_minor"] === null ? null : BigInt(row["sale_minor"] as bigint),
      compareAtMinor:
        row["compare_at_minor"] === null ? null : BigInt(row["compare_at_minor"] as bigint),
      priceSource: "manual",
      validFrom: row["valid_from"] as Date,
    };
  });
}

type Tx = Parameters<Parameters<typeof withTransaction>[0]>[0];

/** Close whichever row is live for this (scope, market), if any. */
async function closeCurrent(tx: Tx, input: SetManualPriceInput): Promise<number> {
  if (input.expectedPriceId !== null) {
    return tx.$executeRaw`
      UPDATE prices SET valid_to = now()
       WHERE id = ${input.expectedPriceId}::uuid
         AND valid_to IS NULL AND deleted_at IS NULL
    `;
  }
  // `expectedPriceId = null` claims there is no live row. If there IS one, closing it here
  // would silently overwrite a price the caller did not know about — so the claim is checked
  // rather than trusted, and a stale editor gets a conflict instead of a surprise.
  const live =
    input.variantId === null
      ? await tx.$queryRaw<{ id: string }[]>`
        SELECT id::text AS id FROM prices
         WHERE product_id = ${input.productId}::uuid AND variant_id IS NULL
           AND market_code = ${input.marketCode} AND valid_to IS NULL AND deleted_at IS NULL`
      : await tx.$queryRaw<{ id: string }[]>`
        SELECT id::text AS id FROM prices
         WHERE variant_id = ${input.variantId}::uuid
           AND market_code = ${input.marketCode} AND valid_to IS NULL AND deleted_at IS NULL`;
  if (live[0]) {
    throw new ConflictError(
      "A price already exists for this item in this market. Reload to edit it rather than creating a second one.",
      { context: { existingPriceId: live[0].id } },
    );
  }
  return 0;
}
