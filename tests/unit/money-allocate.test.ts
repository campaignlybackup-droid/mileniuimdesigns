import { describe, expect, it } from "vitest";
import { addMoney, allocate, applyBp, CurrencyMismatchError, money } from "@/lib/money";

/**
 * Commissioned by docs/architecture/02-database-schema.md §1.10 rule 3.
 *
 * The postcondition `sum(result) === totalMinor` is what makes
 * `SUM(order_items.line_discount_minor) = orders.discount_total_minor` true by
 * construction. If it fails, `chk_orders_total` rejects the INSERT and the order is
 * lost at the till — so this is swept, not spot-checked.
 */
describe("allocate", () => {
  it("always sums to the total (property sweep)", () => {
    // 09 P04 exit criterion (a) asks for 10 000 pairs, including negative totals and
    // zero weights. Deterministic rather than random: a property sweep that cannot be
    // reproduced from a failure message is a sweep nobody can debug.
    let cases = 0;
    for (let total = -600; total <= 600; total += 3) {
      for (let n = 1; n <= 8; n++) {
        for (let seed = 1; seed <= 5; seed++) {
          const weights = Array.from({ length: n }, (_, i) =>
            BigInt(((i * 37 + seed * 13) % 11) + (seed % 3)),
          );
          const out = allocate(BigInt(total), weights);
          expect(out).toHaveLength(n);
          expect(out.reduce((a, b) => a + b, 0n)).toBe(BigInt(total));
          cases++;
        }
      }
    }
    expect(cases).toBeGreaterThanOrEqual(10_000);
  });

  it("breaks ties by lowest index — the caller's ordering is load-bearing", () => {
    // Three equal weights, one leftover minor unit. It must land on index 0.
    expect(allocate(10n, [1n, 1n, 1n])).toEqual([4n, 3n, 3n]);
    // Two equal weights, one leftover.
    expect(allocate(3n, [1n, 1n])).toEqual([2n, 1n]);
  });

  it("is stable under permutation of equal weights — catches a 'tidy-up' sort", () => {
    // The same equal-weight input must always favour the earliest position, which is the
    // property that breaks the day someone sorts the array for neatness.
    const a = allocate(7n, [5n, 5n, 5n]);
    expect(a[0]).toBeGreaterThanOrEqual(a[1]!);
    expect(a[1]).toBeGreaterThanOrEqual(a[2]!);
  });

  it("handles the degenerate cases the spec names", () => {
    expect(allocate(0n, [1n, 2n, 3n])).toEqual([0n, 0n, 0n]);
    expect(allocate(100n, [])).toEqual([]);
    expect(allocate(10n, [7n])).toEqual([10n]);
    // All-zero weights spread evenly rather than dividing by zero.
    expect(allocate(5n, [0n, 0n]).reduce((a, b) => a + b, 0n)).toBe(5n);
  });

  it("allocates a negative total — a refund is an allocation too", () => {
    const out = allocate(-10n, [1n, 1n, 1n]);
    expect(out.reduce((a, b) => a + b, 0n)).toBe(-10n);
  });
});

describe("applyBp", () => {
  it("rounds half-up away from zero, currency-independently (02 §1.10 rule 5)", () => {
    expect(applyBp(100n, 1750n)).toBe(18n); // 17.5 -> 18
    expect(applyBp(-100n, 1750n)).toBe(-18n);
    expect(applyBp(29997n, 1750n)).toBe(5249n);
  });

  it("applied to a LINE total, not per-unit-then-multiplied", () => {
    // The bug this guards: 3 units at 9999 with a 17.5% rule.
    const unit = 9999n;
    const qty = 3n;
    const perUnitThenMultiply = applyBp(unit, 1750n) * qty;
    const onTheLine = applyBp(unit * qty, 1750n);
    // They differ by exactly one minor unit — which is the whole reason only one of
    // them is permitted. Per-unit-then-multiply yields 5250; the line total yields 5249.
    // That single unit is what makes SUM(line_discount) != discount_total, which
    // chk_orders_total rejects, which loses the order at the till (04 §1.4).
    expect(perUnitThenMultiply).toBe(5250n);
    expect(onTheLine).toBe(5249n);
    expect(perUnitThenMultiply - onTheLine).toBe(1n);
  });
});

describe("currency safety", () => {
  it("refuses to add two currencies — there is no conversion anywhere (hard rule 2)", () => {
    expect(() => addMoney(money(100n, "USD"), money(100n, "INR"))).toThrow(
      CurrencyMismatchError,
    );
  });

  it("adds within one currency", () => {
    expect(addMoney(money(100n, "USD"), money(250n, "USD")).minor).toBe(350n);
  });
});
