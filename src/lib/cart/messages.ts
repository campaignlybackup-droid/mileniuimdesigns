/**
 * Customer-facing cart copy — 05 §2.4.
 *
 * **The service returns a KEY and parameters; it never formats copy.** Every string here is a
 * default that ships in the seed and is overridable per market through `settings`
 * (`group_key = 'checkout.messages'`), because "isn't sold in India" is a sentence the client
 * may want to write differently, and a string baked into a service is one they cannot change
 * without a deploy.
 */

export const CART_MESSAGE_KEYS = [
  "cart.line.price_changed",
  "cart.line.unavailable",
  "cart.line.variant_gone",
  "cart.line.not_sold_here",
  "cart.market_changed",
  "cart.line.quantity_reduced",
  "cart.line.sold_out",
  "cart.line.ooak_sold",
  "cart.coupon.removed",
  "cart.giftcard.reduced",
] as const;

export type CartMessageKey = (typeof CART_MESSAGE_KEYS)[number];

/** The ten defaults of 05 §2.4, verbatim. */
export const CART_MESSAGE_DEFAULTS: Record<CartMessageKey, string> = {
  "cart.line.price_changed":
    "The price of {product} has changed to {price}. Please review your bag before continuing.",
  "cart.line.unavailable":
    "{product} is no longer available and has been removed from your bag.",
  "cart.line.variant_gone":
    "The {variant} option for {product} is no longer available. Choose another option to add it back.",
  "cart.line.not_sold_here":
    "{product} isn't sold in {market} and has been removed from your bag.",
  "cart.market_changed":
    "Your bag is now priced in {currency}. {n} item(s) not sold in {market} were removed.",
  "cart.line.quantity_reduced":
    "Only {n} of {product} are available. We've updated the quantity in your bag.",
  "cart.line.sold_out": "{product} has just sold and has been removed from your bag.",
  "cart.line.ooak_sold": "{product} is one of a kind and has just been sold.",
  "cart.coupon.removed":
    "The code {code} is no longer valid and has been removed. Your total is now {total}.",
  "cart.giftcard.reduced":
    "The gift card ending {last4} now has {balance} available. Your remaining balance to pay is {amount}.",
};

export type CartNotice = {
  key: CartMessageKey;
  params: Record<string, string | number>;
  severity: "info" | "warning";
};
