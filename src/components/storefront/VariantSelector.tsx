"use client";

import type { JSX } from "react";
import type { PdpProduct, PdpVariant } from "@/lib/catalog/products";

export type VariantSelectorProps = {
  product: PdpProduct;
  selectedVariant: PdpVariant | null;
  onSelectVariant: (variant: PdpVariant) => void;
  className?: string;
};

export function VariantSelector({
  product,
  selectedVariant,
  onSelectVariant,
  className,
}: VariantSelectorProps): JSX.Element | null {
  if (product.variants.length <= 1 && product.options.length === 0) {
    return null;
  }

  // If options structure exists (e.g. Size, Metal)
  if (product.options.length > 0) {
    return (
      <div className={className} style={{ display: "flex", flexDirection: "column", gap: "var(--md-space-4)" }}>
        {product.options.map((option) => {
          return (
            <div key={option.id} style={{ display: "flex", flexDirection: "column", gap: "var(--md-space-2)" }}>
              <span
                style={{
                  fontSize: "var(--md-t-label, 0.75rem)",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--md-fg-muted)",
                }}
              >
                {option.name}
              </span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--md-space-2)" }}>
                {option.values.map((val) => {
                  // Find if there is a variant matching this option value
                  const matchingVariant = product.variants.find((v) =>
                    v.optionValues.some((ov) => ov.valueId === val.id),
                  );
                  const isSelected = selectedVariant?.optionValues.some(
                    (ov) => ov.valueId === val.id,
                  );
                  const isAvailable = matchingVariant && matchingVariant.price !== null;

                    return (
                      <button
                        key={val.id}
                        type="button"
                        onClick={() => {
                          if (matchingVariant) onSelectVariant(matchingVariant);
                        }}
                        style={{
                          minWidth: 44,
                          minHeight: 44,
                          padding: "8px 14px",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          border: `1px solid ${isSelected ? "var(--md-fg)" : "var(--md-rule)"}`,
                          background: isSelected ? "var(--md-fg)" : "transparent",
                          color: isSelected ? "var(--md-bg)" : "var(--md-fg)",
                          fontSize: "0.875rem",
                          fontWeight: isSelected ? 600 : 400,
                          cursor: "pointer",
                          opacity: isAvailable ? 1 : 0.45,
                          textDecoration: isAvailable ? "none" : "line-through",
                          transition: "all var(--md-dur-fast) ease",
                        }}
                        title={!isAvailable ? "Currently unavailable" : undefined}
                      >
                        {val.value}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      );
    }

    // Flat variants list if no explicit product_options
    return (
      <div className={className} style={{ display: "flex", flexDirection: "column", gap: "var(--md-space-2)" }}>
        <span
          style={{
            fontSize: "var(--md-t-label, 0.75rem)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--md-fg-muted)",
          }}
        >
          Select Option
        </span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--md-space-2)" }}>
          {product.variants.map((v) => {
            const isSelected = selectedVariant?.id === v.id;
            const isAvailable = v.price !== null;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => onSelectVariant(v)}
                style={{
                  minWidth: 44,
                  minHeight: 44,
                  padding: "8px 14px",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: `1px solid ${isSelected ? "var(--md-fg)" : "var(--md-rule)"}`,
                  background: isSelected ? "var(--md-fg)" : "transparent",
                  color: isSelected ? "var(--md-bg)" : "var(--md-fg)",
                  fontSize: "0.875rem",
                  fontWeight: isSelected ? 600 : 400,
                  cursor: "pointer",
                  opacity: isAvailable ? 1 : 0.45,
                  textDecoration: isAvailable ? "none" : "line-through",
                  transition: "all var(--md-dur-fast) ease",
                }}
              >
                {v.title ?? v.sku}
              </button>
            );
          })}
        </div>
      </div>
    );
  }
