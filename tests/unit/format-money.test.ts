import { describe, expect, it } from "vitest";
import { formatMoney, money, roundHalfUp } from "@/lib/money";

/**
 * Commissioned by 09 P04 exit criterion (b) and 04 §9.
 *
 * The grouping is pinned CHARACTER FOR CHARACTER. That is the assertion that catches the
 * day someone "simplifies" the formatter to a hardcoded locale.
 */
describe("formatMoney", () => {
  const US = { locale: "en-US" };
  const IN = { locale: "en-IN" };

  it("groups a US amount in thousands", () => {
    expect(formatMoney(money(10_000_000n, "USD"), US)).toBe("$100,000.00");
  });

  it("groups an Indian amount in lakhs — ₹1,00,000.00, not ₹100,000.00", () => {
    // THE bug. Intl.NumberFormat("en-US", { currency: "INR" }) renders ₹100,000.00, which
    // is a visibly wrong number on a jewellery-sized amount in the secondary market.
    expect(formatMoney(money(10_000_000n, "INR"), IN)).toBe("₹1,00,000.00");
  });

  it("proves the wrong locale produces the wrong grouping", () => {
    // Not a test of our code — a test of the CLAIM. If this ever stops differing, the
    // rule above has become unnecessary and the comment is lying.
    const wrong = formatMoney(money(10_000_000n, "INR"), US);
    const right = formatMoney(money(10_000_000n, "INR"), IN);
    expect(wrong).not.toBe(right);
    expect(wrong).toContain("100,000");
    expect(right).toContain("1,00,000");
  });

  it("groups an Indian crore correctly", () => {
    // ₹1,00,00,000.00 — two lakh groups then a crore group.
    expect(formatMoney(money(1_000_000_000n, "INR"), IN)).toBe("₹1,00,00,000.00");
  });

  it("always shows trailing minor digits", () => {
    // $160 on the card and $160.00 in the bag read as two different numbers to a shopper
    // comparing them (04 §9).
    expect(formatMoney(money(16_000n, "USD"), US)).toBe("$160.00");
    expect(formatMoney(money(0n, "USD"), US)).toBe("$0.00");
    expect(formatMoney(money(1n, "USD"), US)).toBe("$0.01");
    expect(formatMoney(money(99n, "USD"), US)).toBe("$0.99");
  });

  it("handles a negative amount — a refund is money too", () => {
    expect(formatMoney(money(-5_000n, "USD"), US)).toContain("50.00");
  });

  it("formats the boundary values the spec pins", () => {
    for (const [minor, expected] of [
      [0n, "$0.00"],
      [1n, "$0.01"],
      [9_900n, "$99.00"],
      [10_000n, "$100.00"],
      [9_999_900n, "$99,999.00"],
    ] as const) {
      expect(formatMoney(money(minor, "USD"), US)).toBe(expected);
    }
  });
});

describe("roundHalfUp", () => {
  it("rounds .5 AWAY from zero, in both directions", () => {
    expect(roundHalfUp(5n, 2n)).toBe(3n); // 2.5 -> 3
    expect(roundHalfUp(-5n, 2n)).toBe(-3n); // -2.5 -> -3, not -2
    expect(roundHalfUp(3n, 2n)).toBe(2n); // 1.5 -> 2
    expect(roundHalfUp(1n, 2n)).toBe(1n); // 0.5 -> 1
  });

  it("is currency-independent — the direction never varies by market", () => {
    // A rounding direction that changes by currency is one nobody can reason about
    // (02 §1.10 rule 5).
    expect(roundHalfUp(7n, 3n)).toBe(2n);
    expect(roundHalfUp(8n, 3n)).toBe(3n);
  });

  it("refuses division by zero rather than returning something plausible", () => {
    expect(() => roundHalfUp(1n, 0n)).toThrow();
  });
});
