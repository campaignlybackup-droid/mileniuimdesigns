"use client";

import { useEffect, useState, type JSX } from "react";
import { PriceDisplay } from "@/components/storefront/PriceDisplay";
import { Button } from "@/components/ui/Button";
import type { DisplayPrice } from "@/lib/pricing/types";

export type StickyAddToBagProps = {
  title: string;
  price: DisplayPrice | null;
  locale?: string;
  variantId: string | null;
  marketCode: string;
  isAvailable: boolean;
};

export function StickyAddToBag({
  title,
  price,
  locale = "en-US",
  variantId,
  marketCode,
  isAvailable,
}: StickyAddToBagProps): JSX.Element | null {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      // Show when scrolled down past 450px
      if (window.scrollY > 450) {
        setVisible(true);
      } else {
        setVisible(false);
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  if (!visible || !isAvailable) return null;

  const handleAddToCart = async () => {
    if (!variantId) return;
    setLoading(true);
    try {
      const res = await fetch("/api/cart/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variantId, quantity: 1, marketCode }),
      });
      if (res.ok) {
        setAdded(true);
        setTimeout(() => setAdded(false), 2500);
      }
    } catch {
      // Handled
    } finally {
      setLoading(false);
    }
  };

  return (
    <aside
      aria-label="Sticky Add to Bag"
      className="md-sticky-bar"
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 40,
        background: "var(--md-bg)",
        borderTop: "1px solid var(--md-rule)",
        padding: "var(--md-space-3) var(--md-gutter)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "var(--md-space-4)",
        boxShadow: "var(--md-shadow-drawer, 0 -4px 12px rgba(0,0,0,0.05))",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <span
          style={{
            fontSize: "0.875rem",
            fontWeight: 400,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            color: "var(--md-fg)",
          }}
        >
          {title}
        </span>
        <div style={{ fontSize: "0.875rem" }}>
          <PriceDisplay price={price} locale={locale} />
        </div>
      </div>

      <Button
        variant="primary"
        size="md"
        onClick={handleAddToCart}
        disabled={loading || !variantId}
        style={{ flexShrink: 0 }}
      >
        {added ? "Added" : loading ? "…" : "Add to Bag"}
      </Button>
    </aside>
  );
}
