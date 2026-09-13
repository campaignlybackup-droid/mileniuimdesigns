import "server-only";

/**
 * **CAPABILITY AUTHORIZATION.** See `src/lib/cart/index.ts`. `applyRepairs()` is exported for
 * the cart module's own use and takes an open transaction rather than a token: it never
 * locates a cart, it only writes repairs to lines its caller already resolved through
 * `requireCart()`. It cannot be reached with an attacker-supplied identifier because it takes
 * none — `LineOutcome.lineId` values come from the rows the caller just read.
 */
import type { Tx } from "@/lib/db/transaction";
import { resolvePriceBatch } from "@/lib/pricing";
import { getAvailability } from "@/lib/inventory";
import type { CartNotice } from "@/lib/cart/messages";

/**
 * Cart revalidation — 05 §2.4. Runs on EVERY cart read, and again as the first step of
 * `placeOrder`.
 *
 * **Two modes, and the difference is the whole point.** At read time the pass may REPAIR the
 * cart — clamp a quantity, drop a dead line — and always reports what it did. At checkout time
 * it is the authority and **stops** on any change rather than repairing silently: a bag that
 * changed under a customer's finger between "Review" and "Pay" must be looked at again, not
 * quietly corrected and charged.
 *
 * **THREE queries, never N.** One `resolvePriceBatch`, one catalogue-status read, one
 * `getAvailability`. A per-line implementation is 40 round trips on the cart drawer, which is
 * rendered on every page.
 */

export type RevalidateMode = "read" | "checkout";

export type CartLine = {
  id: string;
  variantId: string;
  quantity: number;
  unitListMinor: bigint;
  unitFinalMinor: bigint;
};

export type LineOutcome =
  | { kind: "unchanged"; lineId: string }
  | { kind: "repriced"; lineId: string; unitListMinor: bigint; unitFinalMinor: bigint }
  | { kind: "clamped"; lineId: string; quantity: number }
  | { kind: "removed"; lineId: string; reason: CartNotice["key"] };

export type RevalidateResult = {
  outcomes: LineOutcome[];
  notices: CartNotice[];
  /** True when anything at all moved. At checkout this is what stops the order. */
  changed: boolean;
};

type StatusRow = {
  variant_id: string;
  product_title: string;
  variant_title: string | null;
  product_live: boolean;
  variant_live: boolean;
};

/**
 * Evaluate a cart's lines against the live catalogue, prices and stock.
 *
 * PURE of side effects: it decides what should happen and returns it. The caller applies the
 * repairs at read time, or refuses at checkout time. Keeping the decision separate from the
 * write is what lets both modes share one implementation — and what stops a "checkout-time"
 * path accidentally repairing because it reused the read-time function.
 */
export async function evaluateCart(
  tx: Tx,
  input: { lines: CartLine[]; marketCode: string; customerId?: string | null },
): Promise<RevalidateResult> {
  const outcomes: LineOutcome[] = [];
  const notices: CartNotice[] = [];
  if (input.lines.length === 0) return { outcomes, notices, changed: false };

  const variantIds = [...new Set(input.lines.map((l) => l.variantId))];

  // Query 1 — catalogue status. A line whose product was unpublished is row 2; a line whose
  // variant was deleted is row 3. They produce different copy because the shopper's next
  // action differs: one is gone, the other has another option to choose.
  const status = await tx.$queryRaw<StatusRow[]>`
    SELECT v.id::text AS variant_id,
           p.title AS product_title,
           v.title AS variant_title,
           (p.deleted_at IS NULL AND p.status = 'active'
            AND p.published_at IS NOT NULL AND p.published_at <= now()
            AND coalesce(pmc.is_published, true)) AS product_live,
           (v.deleted_at IS NULL AND v.is_active) AS variant_live
      FROM product_variants v
      JOIN products p ON p.id = v.product_id
      LEFT JOIN product_market_content pmc
             ON pmc.product_id = p.id AND pmc.market_code = ${input.marketCode}
     WHERE v.id = ANY(${variantIds}::uuid[])
  `;
  const byVariant = new Map(status.map((s) => [s.variant_id, s]));

  // Queries 2 and 3 — prices and availability, both batched.
  const [prices, availability] = await Promise.all([
    resolvePriceBatch(
      input.lines.map((l) => ({
        variantId: l.variantId,
        marketCode: input.marketCode,
        quantity: l.quantity,
      })),
      { customerId: input.customerId ?? undefined, client: tx },
    ),
    getAvailability(variantIds, input.marketCode, tx),
  ]);

  for (const line of input.lines) {
    const s = byVariant.get(line.variantId);
    const product = s?.product_title ?? "This piece";

    // 3 — the variant is gone. Checked BEFORE the product, because "choose another option"
    // is only sensible advice if the product itself still exists.
    if (!s || !s.variant_live) {
      outcomes.push({ kind: "removed", lineId: line.id, reason: "cart.line.variant_gone" });
      notices.push({
        key: "cart.line.variant_gone",
        params: { product, variant: s?.variant_title ?? "selected" },
        severity: "warning",
      });
      continue;
    }

    // 2 — the product is unpublished, archived or not visible in this market.
    if (!s.product_live) {
      outcomes.push({ kind: "removed", lineId: line.id, reason: "cart.line.unavailable" });
      notices.push({ key: "cart.line.unavailable", params: { product }, severity: "warning" });
      continue;
    }

    // 4 — no price in this market. Distinct from "unavailable": the piece exists and is
    // published, it is simply not sold here, and the copy says so rather than implying it
    // was withdrawn.
    const price = prices.get(line.variantId);
    if (!price) {
      outcomes.push({ kind: "removed", lineId: line.id, reason: "cart.line.not_sold_here" });
      notices.push({
        key: "cart.line.not_sold_here",
        params: { product, market: input.marketCode },
        severity: "warning",
      });
      continue;
    }

    // 7 and 8 — sold out, and the one-of-a-kind wording. A unique piece that has just sold
    // gets its own sentence, because "has just sold and has been removed" reads as a stock
    // problem while "is one of a kind and has just been sold" reads as what it is.
    const stock = availability.get(line.variantId);
    if (stock && stock.availableQuantity !== null && stock.availableQuantity <= 0) {
      const ooak = stock.band === "sold";
      const reason = ooak ? "cart.line.ooak_sold" : "cart.line.sold_out";
      outcomes.push({ kind: "removed", lineId: line.id, reason });
      notices.push({ key: reason, params: { product }, severity: "warning" });
      continue;
    }

    // 6 — partial: some are available, fewer than asked for.
    if (stock && stock.availableQuantity !== null && stock.availableQuantity < line.quantity) {
      outcomes.push({ kind: "clamped", lineId: line.id, quantity: stock.availableQuantity });
      notices.push({
        key: "cart.line.quantity_reduced",
        params: { product, n: stock.availableQuantity },
        severity: "warning",
      });
      continue;
    }

    // 1 — the price moved. ZERO TOLERANCE, on both the list and the charged figure: a line
    // whose list price fell but whose charged price did not has still changed, and the card
    // beside it says something different from the bag.
    if (
      price.unitFinalMinor !== line.unitFinalMinor ||
      price.unitListMinor !== line.unitListMinor
    ) {
      outcomes.push({
        kind: "repriced",
        lineId: line.id,
        unitListMinor: price.unitListMinor,
        unitFinalMinor: price.unitFinalMinor,
      });
      notices.push({
        key: "cart.line.price_changed",
        params: { product, price: price.unitFinalMinor.toString() },
        severity: "info",
      });
      continue;
    }

    outcomes.push({ kind: "unchanged", lineId: line.id });
  }

  return {
    outcomes,
    notices,
    changed: outcomes.some((o) => o.kind !== "unchanged"),
  };
}

/** Apply a read-time pass's repairs. Never called on the checkout path. */
export async function applyRepairs(tx: Tx, outcomes: LineOutcome[]): Promise<void> {
  for (const outcome of outcomes) {
    if (outcome.kind === "removed") {
      await tx.$executeRaw`DELETE FROM cart_items WHERE id = ${outcome.lineId}::uuid`;
    } else if (outcome.kind === "clamped") {
      await tx.$executeRaw`
        UPDATE cart_items SET quantity = ${outcome.quantity}, updated_at = now()
         WHERE id = ${outcome.lineId}::uuid`;
    } else if (outcome.kind === "repriced") {
      // `priced_at` moves with the amounts. A line carrying new figures and an old timestamp
      // is a line nobody can date, which matters when a customer disputes what they were shown.
      await tx.$executeRaw`
        UPDATE cart_items
           SET unit_list_minor = ${outcome.unitListMinor},
               unit_final_minor = ${outcome.unitFinalMinor},
               priced_at = now(), updated_at = now()
         WHERE id = ${outcome.lineId}::uuid`;
    }
  }
}
