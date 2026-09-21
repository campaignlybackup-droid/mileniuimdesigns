"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useCart } from "@/components/storefront/CartContext";
import { Button } from "@/components/ui/Button";

export function CartDrawer({ marketCode = "US" }: { marketCode?: string }) {
  const { cart, isOpen, closeCart, updateQuantity, removeItem, isLoading } = useCart();
  const checkoutHref = marketCode.toLowerCase() === "us" ? "/checkout" : `/${marketCode.toLowerCase()}/checkout`;

  // Lock background scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const lines = cart?.lines ?? [];
  const hasItems = lines.length > 0;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "flex",
        justifyContent: "flex-end",
      }}
    >
      {/* Backdrop */}
      <div
        onClick={closeCart}
        style={{
          position: "fixed",
          inset: 0,
          background: "color-mix(in srgb, var(--md-green-black) 60%, transparent)",
          backdropFilter: "blur(4px)",
          transition: "opacity 0.3s ease",
        }}
        aria-hidden="true"
      />

      {/* Drawer Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Shopping Bag"
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 460,
          height: "100%",
          background: "var(--md-bg)",
          boxShadow: "var(--md-shadow-drawer)",
          display: "flex",
          flexDirection: "column",
          paddingTop: "env(safe-area-inset-top, 0px)",
          zIndex: 101,
          animation: "slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "var(--md-space-4) var(--md-space-6)",
            borderBottom: "1px solid var(--md-rule)",
            minHeight: 64,
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: "var(--md-space-2)" }}>
            <h2
              style={{
                fontFamily: "var(--md-font-display)",
                fontSize: "1.5rem",
                letterSpacing: "-0.01em",
                margin: 0,
                color: "var(--md-fg)",
              }}
            >
              Shopping Bag
            </h2>
            <span
              style={{
                fontSize: "0.875rem",
                color: "var(--md-fg-secondary)",
              }}
            >
              ({cart?.totalQuantity ?? 0})
            </span>
          </div>

          <button
            onClick={closeCart}
            aria-label="Close bag"
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              width: 44,
              height: 44,
              color: "var(--md-fg)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Content Body */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "var(--md-space-6)",
          }}
        >
          {!hasItems ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
                textAlign: "center",
                gap: "var(--md-space-4)",
              }}
            >
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: "50%",
                  border: "1px solid var(--md-rule)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--md-fg-secondary)",
                }}
              >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
                  <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <path d="M16 10a4 4 0 0 1-8 0" />
                </svg>
              </div>
              <h3
                style={{
                  fontFamily: "var(--md-font-display)",
                  fontSize: "1.25rem",
                  margin: 0,
                  color: "var(--md-fg)",
                }}
              >
                Your bag is empty
              </h3>
              <p style={{ fontSize: "0.875rem", color: "var(--md-fg-secondary)", maxWidth: 260, margin: 0 }}>
                Explore our curated fine jewellery creations and discover your next signature heirloom.
              </p>
              <Button variant="outline" size="md" onClick={closeCart} style={{ marginTop: "var(--md-space-2)" }}>
                Continue Browsing
              </Button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--md-space-6)" }}>
              {lines.map((line) => (
                <div
                  key={line.id}
                  style={{
                    display: "flex",
                    gap: "var(--md-space-4)",
                    paddingBottom: "var(--md-space-5)",
                    borderBottom: "1px solid var(--md-rule)",
                  }}
                >
                  {/* Thumbnail */}
                  <Link
                    href={`/products/${line.productSlug}`}
                    onClick={closeCart}
                    style={{
                      position: "relative",
                      width: 80,
                      height: 100,
                      background: "var(--md-bg-raised)",
                      flexShrink: 0,
                      overflow: "hidden",
                    }}
                  >
                    <Image
                      src={line.imageUrl}
                      alt={line.productTitle}
                      fill
                      sizes="80px"
                      style={{ objectFit: "cover" }}
                    />
                  </Link>

                  {/* Line Details */}
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                    <div>
                      <Link
                        href={`/products/${line.productSlug}`}
                        onClick={closeCart}
                        style={{
                          textDecoration: "none",
                          color: "var(--md-fg)",
                        }}
                      >
                        <h4
                          style={{
                            fontFamily: "var(--md-font-display)",
                            fontSize: "1rem",
                            fontWeight: 500,
                            margin: 0,
                            lineHeight: 1.3,
                          }}
                        >
                          {line.productTitle}
                        </h4>
                      </Link>
                      {line.variantTitle && (
                        <p style={{ fontSize: "0.75rem", color: "var(--md-fg-secondary)", margin: "4px 0 0" }}>
                          {line.variantTitle}
                        </p>
                      )}
                      <p
                        style={{
                          fontSize: "0.875rem",
                          fontWeight: 500,
                          margin: "6px 0 0",
                          color: "var(--md-fg)",
                        }}
                      >
                        {line.formattedUnitFinal}
                      </p>
                    </div>

                    {/* Controls */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginTop: "var(--md-space-3)",
                      }}
                    >
                      <div
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          border: "1px solid var(--md-rule)",
                          borderRadius: "var(--md-radius-sm)",
                          background: "var(--md-bg-raised)",
                        }}
                      >
                        <button
                          onClick={() => updateQuantity(line.id, line.quantity - 1)}
                          disabled={isLoading}
                          aria-label="Decrease quantity"
                          style={{
                            background: "transparent",
                            border: "none",
                            width: 38,
                            height: 38,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            cursor: "pointer",
                            fontSize: "1rem",
                            color: "var(--md-fg)",
                          }}
                        >
                          −
                        </button>
                        <span
                          style={{
                            paddingInline: "var(--md-space-2)",
                            fontSize: "0.875rem",
                            minWidth: 32,
                            textAlign: "center",
                            fontWeight: 600,
                          }}
                        >
                          {line.quantity}
                        </span>
                        <button
                          onClick={() => updateQuantity(line.id, line.quantity + 1)}
                          disabled={isLoading || line.quantity >= 10}
                          aria-label="Increase quantity"
                          style={{
                            background: "transparent",
                            border: "none",
                            width: 38,
                            height: 38,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            cursor: "pointer",
                            fontSize: "1rem",
                            color: "var(--md-fg)",
                          }}
                        >
                          +
                        </button>
                      </div>

                      <button
                        onClick={() => removeItem(line.id)}
                        disabled={isLoading}
                        style={{
                          background: "transparent",
                          border: "none",
                          cursor: "pointer",
                          fontSize: "0.75rem",
                          color: "var(--md-fg-secondary)",
                          textDecoration: "underline",
                          minHeight: 40,
                          display: "inline-flex",
                          alignItems: "center",
                          padding: "var(--md-space-2)",
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer with Subtotal & Checkout */}
        {hasItems && (
          <div
            style={{
              padding: "var(--md-space-5) var(--md-space-6) calc(var(--md-space-5) + env(safe-area-inset-bottom, 0px))",
              borderTop: "1px solid var(--md-rule)",
              background: "var(--md-bg)",
              display: "flex",
              flexDirection: "column",
              gap: "var(--md-space-3)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
              }}
            >
              <span style={{ fontSize: "0.875rem", color: "var(--md-fg-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Subtotal
              </span>
              <span
                style={{
                  fontFamily: "var(--md-font-display)",
                  fontSize: "1.375rem",
                  fontWeight: 600,
                  color: "var(--md-fg)",
                }}
              >
                {cart?.formattedSubtotal}
              </span>
            </div>

            <p style={{ fontSize: "0.75rem", color: "var(--md-fg-secondary)", margin: 0 }}>
              Shipping and taxes calculated at checkout.
            </p>

            <Link href={checkoutHref} onClick={closeCart} style={{ textDecoration: "none" }}>
              <Button variant="primary" size="lg" style={{ width: "100%", minHeight: 48, marginTop: "var(--md-space-2)" }}>
                Proceed to Checkout
              </Button>
            </Link>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "var(--md-space-3)",
                fontSize: "0.6875rem",
                color: "var(--md-fg-secondary)",
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                marginTop: "var(--md-space-1)",
              }}
            >
              <span>🔒 256-Bit SSL</span>
              <span>•</span>
              <span>Verified Authenticity</span>
              <span>•</span>
              <span>Direct Concierge</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
