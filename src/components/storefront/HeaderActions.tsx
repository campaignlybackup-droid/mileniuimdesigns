"use client";

import React from "react";
import Link from "next/link";
import { useCart } from "@/components/storefront/CartContext";

export function HeaderActions({
  marketPrefix = "",
  showSearch = true,
  showAccount = true,
}: {
  marketPrefix?: string;
  showSearch?: boolean;
  showAccount?: boolean;
}) {
  const { openCart, totalQuantity } = useCart();

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "clamp(2px, 1vw, 8px)",
      }}
    >
      {/* Quick Search — 44x44px Touch Target */}
      {showSearch && (
        <Link
          href={`${marketPrefix}/search`}
          aria-label="Search creations"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            minWidth: 44,
            minHeight: 44,
            color: "var(--md-fg)",
            textDecoration: "none",
            padding: 0,
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </Link>
      )}

      {/* Customer Account — 44x44px Touch Target */}
      {showAccount && (
        <Link
          href={`${marketPrefix}/account`}
          aria-label="Account"
          className="md-desktop-account"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            minWidth: 44,
            minHeight: 44,
            color: "var(--md-fg)",
            textDecoration: "none",
            padding: 0,
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </Link>
      )}

      {/* Bag / Cart Toggle — 44x44px Touch Target */}
      <button
        onClick={openCart}
        aria-label={`Shopping bag, ${totalQuantity} items`}
        style={{
          background: "transparent",
          border: "none",
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          minWidth: 44,
          minHeight: 44,
          position: "relative",
          color: "var(--md-fg)",
          padding: 0,
        }}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
          <line x1="3" y1="6" x2="21" y2="6" />
          <path d="M16 10a4 4 0 0 1-8 0" />
        </svg>

        {totalQuantity > 0 && (
          <span
            style={{
              position: "absolute",
              top: 4,
              right: 2,
              background: "var(--md-green)",
              color: "var(--md-fg-inverse)",
              fontSize: "0.625rem",
              fontWeight: 700,
              width: 16,
              height: 16,
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              lineHeight: 1,
            }}
          >
            {totalQuantity}
          </span>
        )}
      </button>
    </div>
  );
}
