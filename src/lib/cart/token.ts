import "server-only";
import { createHash, randomBytes } from "node:crypto";

/**
 * The cart token — 05 §2.1.
 *
 * **The client holds one opaque token in a cookie and nothing else.** No cart in
 * `localStorage`, no cart in a store, no cart line whose price the browser computed. The cart
 * IS `carts` + `cart_items`; the cookie is a pointer to it.
 *
 * Only the SHA-256 is stored. `carts.token_hash` never holds the plaintext, so a database dump
 * does not hand anyone a working session on every open bag — the same reasoning as
 * `sessions.token_hash` (07 §4.2).
 */

export const CART_COOKIE = "md_cart";
export const CART_TOKEN_BYTES = 32;

export function mintCartToken(): { token: string; hash: Buffer } {
  const token = randomBytes(CART_TOKEN_BYTES).toString("base64url");
  return { token, hash: hashCartToken(token) };
}

export function hashCartToken(token: string): Buffer {
  return createHash("sha256").update(token, "utf8").digest();
}
