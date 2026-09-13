/**
 * The ONLY module permitted to format or parse money.
 *
 * `Intl.NumberFormat`, `.toFixed(`, `parseFloat(` and `Number()` applied to an amount
 * are banned everywhere else by `eslint.config.mjs` (01 §2.2). The bug that rule exists
 * to prevent: four money formatters across the codebase, one of which renders
 * ₹1,00,000 as ₹100,000 — a wrong-looking number on a jewellery-sized amount in the
 * secondary market (01 §2.6).
 *
 * Money is ALWAYS an integer count of minor units plus an explicit ISO currency code.
 * There is no float anywhere in this file and no bare number crosses its boundary.
 */

/** A currency as the database stores it: ISO 4217, upper case. */
export type CurrencyCode = string;

/**
 * An amount, inseparable from its currency.
 *
 * `minor` is a `bigint` because a jewellery catalogue in paise exceeds `Number`'s safe
 * integer range far sooner than anyone expects, and because a `bigint` cannot silently
 * acquire a fractional part. It never crosses a JSON boundary as a `bigint` — see
 * `serialiseMoney` (01 §2.6).
 */
export interface Money {
  readonly minor: bigint;
  readonly currency: CurrencyCode;
}

export class CurrencyMismatchError extends Error {
  constructor(a: CurrencyCode, b: CurrencyCode) {
    super(
      `Refused to combine ${a} and ${b}. There is no conversion between market ` +
        `currencies anywhere in this system (hard rule 2).`,
    );
    this.name = "CurrencyMismatchError";
  }
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) throw new CurrencyMismatchError(a.currency, b.currency);
}

export const money = (minor: bigint, currency: CurrencyCode): Money => ({ minor, currency });

export function addMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { minor: a.minor + b.minor, currency: a.currency };
}

export function subMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { minor: a.minor - b.minor, currency: a.currency };
}

/**
 * Apply a rate in basis points (10000 = 100%), half-up, away from zero on a .5.
 * Rounding direction is deliberately NOT currency-dependent (02 §1.10 rule 5).
 */
export function applyBp(minor: bigint, bp: bigint): bigint {
  const scaled = minor * bp;
  const half = 10000n / 2n;
  return scaled >= 0n ? (scaled + half) / 10000n : -((-scaled + half) / 10000n);
}

/**
 * Distribute `totalMinor` across `weights` by largest remainder.
 *
 * Ties go to the LOWEST INDEX. The function takes weights, not rows: it has no access
 * to a line number and does not need one — the CALLER passes entries in the order the
 * tie-break should favour (order lines in `line_number` order; price components in the
 * fixed order metal → making → stone → other). See 02 §1.10 rule 3.
 *
 * Postcondition, asserted here and property-swept in tests: `sum(result) === totalMinor`.
 * This is what makes `SUM(order_items.line_discount_minor) = orders.discount_total_minor`
 * true by construction rather than by luck.
 */
export function allocate(totalMinor: bigint, weights: readonly bigint[]): bigint[] {
  if (weights.length === 0) return [];
  const weightSum = weights.reduce((a, b) => a + b, 0n);

  // All-zero weights: spread evenly rather than dividing by zero.
  if (weightSum === 0n) {
    const base = totalMinor / BigInt(weights.length);
    const out = weights.map(() => base);
    let rem = totalMinor - base * BigInt(weights.length);
    const step = rem >= 0n ? 1n : -1n;
    for (let i = 0; rem !== 0n; i = (i + 1) % out.length) {
      out[i] += step;
      rem -= step;
    }
    return out;
  }

  const exact = weights.map((w) => (totalMinor * w) / weightSum);
  const remainders = weights.map((w, i) => ({
    i,
    rem: totalMinor * w - exact[i] * weightSum,
  }));
  let leftover = totalMinor - exact.reduce((a, b) => a + b, 0n);

  // Largest remainder first; ties resolved by lowest index, which is why the sort is
  // stable on `i` and why the caller's ordering is load-bearing.
  remainders.sort((a, b) => (b.rem === a.rem ? a.i - b.i : b.rem > a.rem ? 1 : -1));

  const step = leftover >= 0n ? 1n : -1n;
  for (let k = 0; leftover !== 0n; k = (k + 1) % remainders.length) {
    exact[remainders[k].i] += step;
    leftover -= step;
  }
  return exact;
}

/** Money crosses a JSON boundary as a string. `JSON.stringify(1299n)` throws (01 §2.6). */
export function serialiseMoney(m: Money): { minor: string; currency: CurrencyCode } {
  return { minor: m.minor.toString(), currency: m.currency };
}

export function deserialiseMoney(v: { minor: string; currency: CurrencyCode }): Money {
  return { minor: BigInt(v.minor), currency: v.currency };
}
