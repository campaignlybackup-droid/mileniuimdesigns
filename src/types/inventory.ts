/**
 * `AvailabilityBand` — 11 §7.1. FIVE values.
 *
 * `sold` is the one that matters and the one most easily lost. It keys on
 * `products.sold_at`, **never** on `available_quantity <= 0`. A one-of-a-kind piece that
 * has found its owner is not "out of stock" — it is an archive entry the house keeps
 * visible, with a price, no add-to-bag, and copy that says so (03 §8.1, 10 §4.2).
 *
 * Collapsing `sold` into `out` silently removes the One of a Kind edit's whole point.
 */
export type AvailabilityBand = "in_stock" | "low" | "out" | "made_to_order" | "sold";

export const AVAILABILITY_BANDS: readonly AvailabilityBand[] = [
  "in_stock",
  "low",
  "out",
  "made_to_order",
  "sold",
] as const;

/** The `settings` copy key each band renders through (08 §4.4). */
export const BAND_COPY_KEY: Record<AvailabilityBand, string | null> = {
  in_stock: null,
  low: "copy.state.low_stock",
  out: "copy.state.out_of_stock",
  made_to_order: "copy.state.made_to_order",
  sold: "copy.state.sold",
};

/** Whether a band permits adding to the bag. `sold` and `out` do not; `made_to_order` does. */
export function isPurchasable(band: AvailabilityBand): boolean {
  return band === "in_stock" || band === "low" || band === "made_to_order";
}
