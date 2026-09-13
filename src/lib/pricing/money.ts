import "server-only";

/**
 * Pricing's arithmetic surface — 09 P04.
 *
 * These are RE-EXPORTS, not reimplementations. `src/lib/money.ts` owns the definitions;
 * this module exists so that pricing code has a local import path without a second
 * implementation appearing under it. A second `allocate()` that rounds differently is
 * precisely how `SUM(order_items.line_discount_minor)` stops equalling
 * `orders.discount_total_minor`, which `chk_orders_total` then rejects — losing the
 * order at the till (02 §1.10).
 *
 * Note what is NOT re-exported: `formatMoney`. Pricing resolves amounts; it never
 * renders them. Formatting belongs to the component layer, which receives a fully
 * resolved object and displays it (01 §2.3).
 */
export { allocate, applyBp, roundHalfUp, addMoney, subMoney, money } from "@/lib/money";
export type { Money, CurrencyCode } from "@/lib/money";
export { CurrencyMismatchError } from "@/lib/money";
