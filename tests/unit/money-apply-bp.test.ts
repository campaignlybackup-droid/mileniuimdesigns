import { describe, expect, it } from "vitest";
import { applyBp } from "@/lib/money";

/** Commissioned by 09 P04 and 04 §2.3. */
describe("applyBp", () => {
  it("treats 10000 bp as 100%", () => {
    expect(applyBp(12_345n, 10_000n)).toBe(12_345n);
    expect(applyBp(12_345n, 0n)).toBe(0n);
  });

  it("rounds half-up away from zero", () => {
    expect(applyBp(100n, 1_750n)).toBe(18n);
    expect(applyBp(-100n, 1_750n)).toBe(-18n);
  });

  it("is exact at the scale a jewellery catalogue actually reaches", () => {
    // ₹12,00,000 in paise with a 17.5% rule. A float here loses precision silently.
    expect(applyBp(120_000_000n, 1_750n)).toBe(21_000_000n);
  });

  it("never produces a fractional minor unit", () => {
    for (let bp = 0n; bp <= 10_000n; bp += 137n) {
      for (const base of [1n, 99n, 12_345n, 999_999n]) {
        const r = applyBp(base, bp);
        expect(typeof r).toBe("bigint");
      }
    }
  });

  it("applied to a line total and to units separately can differ by one minor unit", () => {
    // Which is the entire reason only the LINE form is permitted (04 §1.4).
    const unit = 9_999n;
    const qty = 3n;
    expect(applyBp(unit, 1_750n) * qty).toBe(5_250n);
    expect(applyBp(unit * qty, 1_750n)).toBe(5_249n);
  });
});
