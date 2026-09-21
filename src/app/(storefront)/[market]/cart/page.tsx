"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { useParams } from "next/navigation";
import { useCart } from "@/components/storefront/CartContext";

export default function CartPage() {
  const params = useParams();
  const marketParam = (params?.market as string) || "us";
  const marketPrefix = marketParam.toLowerCase() === "us" ? "" : `/${marketParam.toLowerCase()}`;
  const checkoutHref = `${marketPrefix}/checkout`;

  const { cart, updateQuantity, removeItem, isLoading } = useCart();
  const lines = cart?.lines ?? [];
  const hasItems = lines.length > 0;

  return (
    <main id="main" style={{ minHeight: "70vh", paddingBlock: "clamp(32px, 5vw, 64px)" }}>
      <div style={{ maxWidth: "var(--md-container)", marginInline: "auto", paddingInline: "var(--md-gutter)" }}>
        {/* Header */}
        <div style={{ marginBottom: "clamp(24px, 4vw, 40px)", textAlign: "center" }}>
          <span
            style={{
              fontSize: "0.6875rem",
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: "var(--md-gold)",
              fontFamily: "var(--md-font-crest), Georgia, serif",
              display: "block",
              marginBottom: "8px",
            }}
          >
            ✦ JAIPUR ATELIER 1961
          </span>
          <h1
            style={{
              fontFamily: "var(--md-font-display)",
              fontSize: "clamp(1.75rem, 3.5vw, 2.5rem)",
              letterSpacing: "-0.02em",
              color: "var(--md-fg)",
              margin: 0,
            }}
          >
            Your Shopping Bag
          </h1>
          <p
            style={{
              fontFamily: "var(--md-font-body)",
              fontSize: "0.875rem",
              color: "var(--md-fg-muted)",
              marginTop: "8px",
            }}
          >
            {hasItems
              ? `${cart?.totalQuantity ?? lines.length} ${lines.length === 1 ? "creation" : "creations"} reserved for your review`
              : "Your shopping bag is currently empty"}
          </p>
        </div>

        {!hasItems ? (
          <div
            style={{
              textAlign: "center",
              padding: "clamp(48px, 8vw, 80px) 24px",
              background: "var(--md-bg-subtle)",
              borderRadius: "4px",
              border: "1px dashed var(--md-rule)",
              maxWidth: 560,
              marginInline: "auto",
            }}
          >
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                background: "var(--md-bg)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 20,
                color: "var(--md-gold)",
                border: "1px solid var(--md-rule)",
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <path d="M16 10a4 4 0 0 1-8 0" />
              </svg>
            </div>
            <h2
              style={{
                fontFamily: "var(--md-font-display)",
                fontSize: "1.25rem",
                color: "var(--md-fg)",
                margin: "0 0 12px",
              }}
            >
              No creations in your bag
            </h2>
            <p
              style={{
                fontFamily: "var(--md-font-body)",
                fontSize: "0.875rem",
                color: "var(--md-fg-muted)",
                lineHeight: 1.6,
                marginBottom: 28,
              }}
            >
              Discover handcrafted statement rings, genuine moonstone jewelry, and fine sterling silver masterpieces
              from our master artisans.
            </p>
            <Link
              href={marketPrefix === "" ? "/rings" : `${marketPrefix}/rings`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                background: "var(--md-green-black)",
                color: "var(--md-fg-inverse)",
                padding: "14px 28px",
                borderRadius: "2px",
                textDecoration: "none",
                fontSize: "0.8125rem",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                fontFamily: "var(--md-font-crest), Georgia, serif",
              }}
            >
              Explore Rings & Creations <span>→</span>
            </Link>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))",
              gap: "clamp(24px, 4vw, 48px)",
              alignItems: "start",
            }}
          >
            {/* Bag Items Column */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {lines.map((line) => {
                const imageSrc = line.imageUrl || "/images/brand/crest-gold.svg";

                return (
                  <div
                    key={line.id}
                    style={{
                      display: "flex",
                      gap: 20,
                      padding: 20,
                      background: "var(--md-bg)",
                      border: "1px solid var(--md-rule)",
                      borderRadius: 2,
                    }}
                  >
                    {/* Thumbnail */}
                    <div
                      style={{
                        width: 96,
                        height: 96,
                        flexShrink: 0,
                        background: "var(--md-bg-subtle)",
                        position: "relative",
                        overflow: "hidden",
                        borderRadius: 2,
                      }}
                    >
                      <Image
                        src={imageSrc}
                        alt={line.productTitle}
                        fill
                        sizes="96px"
                        style={{ objectFit: "cover" }}
                      />
                    </div>

                    {/* Details */}
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                          <h3
                            style={{
                              fontFamily: "var(--md-font-display)",
                              fontSize: "1rem",
                              margin: 0,
                              color: "var(--md-fg)",
                              lineHeight: 1.3,
                            }}
                          >
                            {line.productSlug ? (
                              <Link
                                href={`${marketPrefix}/products/${line.productSlug}`}
                                style={{ color: "inherit", textDecoration: "none" }}
                              >
                                {line.productTitle}
                              </Link>
                            ) : (
                              line.productTitle
                            )}
                          </h3>
                          <span
                            style={{
                              fontFamily: "var(--md-font-display)",
                              fontSize: "1rem",
                              color: "var(--md-fg)",
                              whiteSpace: "nowrap",
                              fontWeight: 500,
                            }}
                          >
                            {line.formattedUnitFinal}
                          </span>
                        </div>
                        {line.variantTitle && (
                          <p style={{ fontSize: "0.75rem", color: "var(--md-fg-secondary)", margin: "4px 0 0" }}>
                            {line.variantTitle}
                          </p>
                        )}
                        <span
                          style={{
                            fontSize: "0.6875rem",
                            letterSpacing: "0.12em",
                            textTransform: "uppercase",
                            color: "var(--md-fg-muted)",
                            fontFamily: "var(--md-font-crest), Georgia, serif",
                            display: "block",
                            marginTop: 4,
                          }}
                        >
                          925 Silver · Jaipur Atelier
                        </span>
                      </div>

                      {/* Controls */}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 16 }}>
                        <div
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            border: "1px solid var(--md-rule)",
                            borderRadius: 2,
                            overflow: "hidden",
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => updateQuantity(line.id, Math.max(1, line.quantity - 1))}
                            disabled={isLoading || line.quantity <= 1}
                            style={{
                              width: 32,
                              height: 32,
                              background: "transparent",
                              border: "none",
                              cursor: line.quantity <= 1 ? "not-allowed" : "pointer",
                              color: line.quantity <= 1 ? "var(--md-fg-muted)" : "var(--md-fg)",
                              fontSize: "1rem",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            −
                          </button>
                          <span
                            style={{
                              minWidth: 32,
                              textAlign: "center",
                              fontSize: "0.875rem",
                              fontFamily: "var(--md-font-body)",
                              fontWeight: 500,
                            }}
                          >
                            {line.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateQuantity(line.id, line.quantity + 1)}
                            disabled={isLoading}
                            style={{
                              width: 32,
                              height: 32,
                              background: "transparent",
                              border: "none",
                              cursor: "pointer",
                              color: "var(--md-fg)",
                              fontSize: "1rem",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            +
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => removeItem(line.id)}
                          disabled={isLoading}
                          style={{
                            background: "none",
                            border: "none",
                            color: "var(--md-fg-muted)",
                            fontSize: "0.75rem",
                            cursor: "pointer",
                            textDecoration: "underline",
                            padding: "4px 8px",
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Order Summary Card */}
            <div
              style={{
                background: "var(--md-bg)",
                border: "1px solid var(--md-rule)",
                borderRadius: 2,
                padding: "clamp(20px, 3vw, 32px)",
                position: "sticky",
                top: 96,
              }}
            >
              <h2
                style={{
                  fontFamily: "var(--md-font-display)",
                  fontSize: "1.125rem",
                  margin: "0 0 20px",
                  color: "var(--md-fg)",
                  borderBottom: "1px solid var(--md-rule)",
                  paddingBottom: 12,
                }}
              >
                Order Summary
              </h2>

              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.875rem" }}>
                  <span style={{ color: "var(--md-fg-secondary)" }}>Bag Subtotal</span>
                  <span style={{ fontWeight: 500, color: "var(--md-fg)" }}>
                    {cart?.formattedSubtotal || "—"}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.875rem" }}>
                  <span style={{ color: "var(--md-fg-secondary)" }}>Insured Shipping</span>
                  <span style={{ color: "var(--md-gold)", fontWeight: 500 }}>Complimentary</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.875rem" }}>
                  <span style={{ color: "var(--md-fg-secondary)" }}>Atelier Hallmark</span>
                  <span style={{ color: "var(--md-fg-muted)" }}>Certified 925</span>
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  paddingTop: 16,
                  borderTop: "1px solid var(--md-rule)",
                  marginBottom: 24,
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--md-font-crest), Georgia, serif",
                    fontSize: "0.875rem",
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color: "var(--md-fg)",
                  }}
                >
                  Estimated Total
                </span>
                <span
                  style={{
                    fontFamily: "var(--md-font-display)",
                    fontSize: "1.375rem",
                    fontWeight: 600,
                    color: "var(--md-fg)",
                  }}
                >
                  {cart?.formattedSubtotal || "—"}
                </span>
              </div>

              <Link
                href={checkoutHref}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "center",
                  background: "var(--md-green-black)",
                  color: "var(--md-fg-inverse)",
                  padding: "16px",
                  borderRadius: "2px",
                  textDecoration: "none",
                  fontSize: "0.8125rem",
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  fontWeight: 600,
                  fontFamily: "var(--md-font-crest), Georgia, serif",
                  boxShadow: "0 4px 16px rgba(0, 0, 0, 0.12)",
                  boxSizing: "border-box",
                }}
              >
                Proceed to Secure Checkout →
              </Link>

              <div
                style={{
                  marginTop: 20,
                  padding: "12px",
                  background: "var(--md-bg-subtle)",
                  borderRadius: 2,
                  fontSize: "0.6875rem",
                  color: "var(--md-fg-muted)",
                  lineHeight: 1.5,
                  textAlign: "center",
                  border: "1px solid var(--md-rule)",
                }}
              >
                ✦ Insured Transit by Blue Dart / FedEx · Complimentary Gift Box Included
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
