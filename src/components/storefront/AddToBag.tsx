"use client";

import { useState, type JSX } from "react";
import { Button } from "@/components/ui/Button";
import { WishlistButton } from "@/components/storefront/WishlistButton";
import { useCart } from "@/components/storefront/CartContext";
import type { AvailabilityBand } from "@/types/inventory";

export type AddToBagProps = {
  productId: string;
  variantId: string | null;
  marketCode: string;
  availabilityBand?: AvailabilityBand | null;
  isSold?: boolean;
  unavailableReason?: string | null;
  isPriced?: boolean;
  className?: string;
};

export function AddToBag({
  productId,
  variantId,
  marketCode,
  availabilityBand = "in_stock",
  isSold = false,
  unavailableReason,
  isPriced = true,
  className,
}: AddToBagProps): JSX.Element {
  const [loading, setLoading] = useState(false);
  const [added, setAdded] = useState(false);
  const [showNotifyModal, setShowNotifyModal] = useState(false);
  const [notifyEmail, setNotifyEmail] = useState("");
  const [notifySuccess, setNotifySuccess] = useState(false);
  const { addItem } = useCart();

  // Case 1: Sold piece (Archive)
  if (isSold || availabilityBand === "sold") {
    return (
      <div className={className} style={{ display: "flex", flexDirection: "column", gap: "var(--md-space-3)" }}>
        <div
          style={{
            padding: "var(--md-space-3) var(--md-space-4)",
            background: "var(--md-bg-subtle, var(--md-rule))",
            color: "var(--md-sold, var(--md-fg-secondary))",
            fontSize: "var(--md-t-label)",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            textAlign: "center",
          }}
        >
          This piece has found its owner.
        </div>
      </div>
    );
  }

  // Case 2: Unpriced / unavailable in market
  if (!isPriced) {
    return (
      <div className={className} style={{ display: "flex", flexDirection: "column", gap: "var(--md-space-3)" }}>
        <div
          style={{
            padding: "var(--md-space-3) var(--md-space-4)",
            background: "var(--md-bg-subtle, var(--md-rule))",
            color: "var(--md-fg-secondary)",
            fontSize: "0.875rem",
            textAlign: "center",
          }}
        >
          {unavailableReason ?? "Currently unavailable in this region."}
        </div>
      </div>
    );
  }

  // Case 3: Out of stock
  if (availabilityBand === "out") {
    return (
      <div className={className} style={{ display: "flex", flexDirection: "column", gap: "var(--md-space-3)" }}>
        {!notifySuccess ? (
          <div>
            {!showNotifyModal ? (
              <Button
                variant="outline"
                size="lg"
                style={{ width: "100%" }}
                onClick={() => setShowNotifyModal(true)}
              >
                Notify Me When Available
              </Button>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (notifyEmail) setNotifySuccess(true);
                }}
                style={{ display: "flex", gap: "var(--md-space-2)" }}
              >
                <input
                  type="email"
                  required
                  placeholder="Enter your email"
                  value={notifyEmail}
                  onChange={(e) => setNotifyEmail(e.target.value)}
                  style={{
                    flex: 1,
                    padding: "var(--md-space-3)",
                    border: "1px solid var(--md-rule)",
                    background: "transparent",
                    color: "var(--md-fg)",
                    fontSize: "0.875rem",
                    borderRadius: "var(--md-radius-sm)",
                  }}
                />
                <Button type="submit" variant="primary" size="md">
                  Notify Me
                </Button>
              </form>
            )}
          </div>
        ) : (
          <div style={{ fontSize: "0.875rem", color: "var(--md-fg-secondary)", textAlign: "center" }}>
            We will email you when this piece returns.
          </div>
        )}
      </div>
    );
  }

  // Case 4: In stock / Made to order
  const handleAddToCart = async () => {
    if (!variantId) return;
    setLoading(true);
    try {
      const ok = await addItem(variantId, 1, marketCode, productId);
      if (ok) {
        setAdded(true);
        setTimeout(() => setAdded(false), 2500);
      }
    } catch {
      // Error handled by context
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className={className}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--md-space-3)",
      }}
    >
      <Button
        variant="primary"
        size="lg"
        onClick={handleAddToCart}
        disabled={loading || !variantId}
        style={{ flex: 1 }}
      >
        {added ? "Added to Bag" : loading ? "Adding…" : "Add to Bag"}
      </Button>

      <div style={{ border: "1px solid var(--md-rule)", borderRadius: "var(--md-radius-sm)", padding: "var(--md-space-2)", height: 48, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <WishlistButton productId={productId} variantId={variantId ?? undefined} size="md" />
      </div>
    </div>
  );
}
