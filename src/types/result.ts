/**
 * `Result<T, E>` — 01 §2.3, 08 §1.4.
 *
 * The taxonomy in `src/lib/errors.ts` marks each failure "Result" or "throw". The rule:
 * a failure a CALLER is expected to handle and render (a taken slug, an invalid coupon,
 * a stale write) is a Result; a failure that means the request cannot proceed at all
 * (not found, forbidden, internal) is thrown, because threading it through every frame
 * only to rethrow it adds noise and loses the stack.
 */
export type Ok<T> = { readonly ok: true; readonly value: T };
export type Err<E> = { readonly ok: false; readonly error: E };
export type Result<T, E> = Ok<T> | Err<E>;

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });
export const err = <E>(error: E): Err<E> => ({ ok: false, error });

export function isOk<T, E>(r: Result<T, E>): r is Ok<T> {
  return r.ok;
}
export function isErr<T, E>(r: Result<T, E>): r is Err<E> {
  return !r.ok;
}

/** Unwrap, or throw the error. Use only where the caller has already narrowed. */
export function unwrap<T, E>(r: Result<T, E>): T {
  if (r.ok) return r.value;
  throw r.error;
}

export function mapOk<T, U, E>(r: Result<T, E>, f: (value: T) => U): Result<U, E> {
  return r.ok ? ok(f(r.value)) : r;
}
