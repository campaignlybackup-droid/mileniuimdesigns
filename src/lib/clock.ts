import "server-only";
import { cache } from "react";

/**
 * The request's instant — ONE per request, memoised.
 *
 * `new Date()` is a lint error inside `src/lib/pricing/**` (01 §2.2), and the reason is not
 * style: a checkout that calls the resolver twice a millisecond apart must not price two lines
 * of the same bag on two sides of a sale boundary. 04 §1.4 says `at` "defaults to `now()`" —
 * this is what that default has to be to keep the promise. It lives OUTSIDE pricing because
 * pricing is the one module forbidden to invent an instant.
 *
 * React's `cache()` scopes it to the render/request. Outside one — a job, a script, a test —
 * it degrades to a fresh value per call, which is correct for those callers because each of
 * them passes `at` explicitly anyway (`recalc`, the apply job, forensic replay).
 */
export const requestNow = cache((): Date => new Date());
