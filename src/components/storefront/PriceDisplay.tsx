import type { JSX } from "react";
import { formatMoney, money } from "@/lib/money";
import type { DisplayPrice, PriceRange } from "@/lib/pricing/types";

/**
 * PriceDisplay — 04 §1.3, 10 §5.3, 10 §5.4.
 *
 * THE ONLY component permitted to render a money value across the storefront.
 * All formatting goes through formatMoney (Intl.NumberFormat with market's locale).
 */

export type PriceDisplayProps = {
  price?: DisplayPrice | null;
  priceRange?: PriceRange | null;
  locale?: string;
  className?: string;
  size?: "sm" | "md" | "lg";
};

export function PriceDisplay({
  price,
  priceRange,
  locale = "en-US",
  className,
  size = "md",
}: PriceDisplayProps): JSX.Element | null {

  const fontSize = size === "sm" ? "0.875rem" : size === "lg" ? "1.25rem" : undefined;

  // Case 1: Range display ("From $248" or "$248 – $490")
  if (priceRange) {
    if (priceRange.pricedVariantCount === 0 || !priceRange.currencyCode) {
      return null;
    }

    const minAmount = money(
      priceRange.minSaleMinor ?? priceRange.minListMinor,
      priceRange.currencyCode,
    );

    const formattedMin = formatMoney(minAmount, { locale });

    const hasDiscount =
      priceRange.minSaleMinor !== null &&
      priceRange.minSaleMinor < priceRange.minListMinor;

    if (!hasDiscount) {
      if (priceRange.minListMinor < priceRange.maxListMinor) {
        return (
          <span className={className} style={{ color: "var(--md-fg)", fontSize }}>
            <span style={{ fontSize: "0.875em", color: "var(--md-fg-muted)", marginRight: "var(--md-space-1)" }}>
              From
            </span>
            {formattedMin}
          </span>
        );
      }
      return (
        <span className={className} style={{ color: "var(--md-fg)", fontSize }}>
          {formattedMin}
        </span>
      );
    }

    // Sale range with genuine markdown/discount
    return (
      <span className={className} style={{ display: "inline-flex", alignItems: "center", gap: "var(--md-space-2)", fontSize }}>
        <span style={{ color: "var(--md-fg-sale, var(--md-fg))", fontWeight: 500 }}>
          {formattedMin}
        </span>
        <s style={{ color: "var(--md-fg-muted)", fontSize: "0.875em" }}>
          {formatMoney(money(priceRange.minListMinor, priceRange.currencyCode), { locale })}
        </s>
      </span>
    );
  }


  // Case 2: Single price (PDP, cart line, etc.)
  if (price) {
    const chargedAmount = money(price.saleMinor, price.currencyCode);
    const formattedCharged = formatMoney(chargedAmount, { locale });

    const isDiscounted =
      price.compareAtMinor !== null && price.compareAtMinor > price.saleMinor;
    const isMarkdown = price.listMinor > price.saleMinor;

    if (isDiscounted && price.compareAtMinor !== null) {
      const originalAmount = money(price.compareAtMinor, price.currencyCode);
      const formattedOriginal = formatMoney(originalAmount, { locale });

      return (
        <span className={className} style={{ display: "inline-flex", alignItems: "center", gap: "var(--md-space-2)" }}>
          <span style={{ color: "var(--md-fg-sale, var(--md-fg))", fontWeight: 500 }}>
            {formattedCharged}
          </span>
          <s style={{ color: "var(--md-fg-muted)", fontSize: "0.875em" }}>
            {formattedOriginal}
          </s>
        </span>
      );
    }

    if (isMarkdown) {
      const listAmount = money(price.listMinor, price.currencyCode);
      const formattedList = formatMoney(listAmount, { locale });

      return (
        <span className={className} style={{ display: "inline-flex", alignItems: "center", gap: "var(--md-space-2)" }}>
          <span style={{ color: "var(--md-fg-sale, var(--md-fg))", fontWeight: 500 }}>
            {formattedCharged}
          </span>
          <s style={{ color: "var(--md-fg-muted)", fontSize: "0.875em" }}>
            {formattedList}
          </s>
        </span>
      );
    }

    return (
      <span className={className} style={{ color: "var(--md-fg)" }}>
        {formattedCharged}
      </span>
    );
  }

  return null;
}
