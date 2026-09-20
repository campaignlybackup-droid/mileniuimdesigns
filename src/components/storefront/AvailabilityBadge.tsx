import type { JSX } from "react";
import type { AvailabilityBand } from "@/types/inventory";

/**
 * AvailabilityBadge — 03 §8.1, 11 §7.1.
 * Five bands: in_stock | low | out | made_to_order | sold.
 */

export type AvailabilityBadgeProps = {
  band: AvailabilityBand;
  availableQuantity?: number | null;
  leadTimeDays?: number | null;
  className?: string;
};

export function AvailabilityBadge({
  band,
  availableQuantity,
  leadTimeDays,
  className,
}: AvailabilityBadgeProps): JSX.Element {
  switch (band) {
    case "sold":
      return (
        <span
          className={className}
          style={{
            display: "inline-block",
            fontSize: "var(--md-t-label)",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            color: "var(--md-sold, var(--md-fg-secondary))",
            border: "1px solid var(--md-sold, var(--md-rule))",
            borderRadius: "var(--md-radius-sm)",
            padding: "var(--md-space-1) var(--md-space-2)",
          }}
        >
          Sold
        </span>
      );

    case "out":
      return (
        <span
          className={className}
          style={{
            fontSize: "0.875rem",
            color: "var(--md-fg-secondary)",
          }}
        >
          Currently unavailable
        </span>
      );

    case "low":
      return (
        <span
          className={className}
          style={{
            fontSize: "0.875rem",
            color: "var(--md-fg-accent, var(--md-fg))",
            fontWeight: 500,
          }}
        >
          {availableQuantity !== null && availableQuantity !== undefined && availableQuantity > 0
            ? `Only ${availableQuantity} remaining`
            : "Low stock"}
        </span>
      );

    case "made_to_order":
      return (
        <span
          className={className}
          style={{
            fontSize: "0.875rem",
            color: "var(--md-fg-secondary)",
          }}
        >
          Made to order{leadTimeDays ? ` · ${leadTimeDays} days lead time` : ""}
        </span>
      );

    case "in_stock":
    default:
      return (
        <span
          className={className}
          style={{
            fontSize: "0.875rem",
            color: "var(--md-fg-secondary)",
          }}
        >
          In stock
        </span>
      );
  }
}
