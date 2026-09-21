"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useParams } from "next/navigation";
import { useCart } from "@/components/storefront/CartContext";
import { Button } from "@/components/ui/Button";
import { BANK_TRANSFER_DETAILS } from "@/lib/config/bankDetails";

export default function CheckoutPage() {
  const router = useRouter();
  const params = useParams();
  const marketParam = (params?.market as string) || "us";
  const marketCode = marketParam.toUpperCase();
  const isIndia = marketCode === "IN";
  const currencySymbol = isIndia ? "₹" : "$";
  const currencyCode = isIndia ? "INR" : "USD";

  const { cart, refreshCart } = useCart();
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form state
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [address1, setAddress1] = useState("");
  const [address2, setAddress2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [countryCode, setCountryCode] = useState(isIndia ? "IN" : "US");
  const [paymentMethod, setPaymentMethod] = useState<"bank_transfer" | "razorpay" | "stripe">("bank_transfer");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = (text: string, key: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    }
  };

  useEffect(() => {
    void refreshCart();
  }, [refreshCart]);

  const lines = cart?.lines ?? [];
  const hasItems = lines.length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSubmitting(true);

    try {
      const fullName = `${firstName} ${lastName}`.trim();
      const res = await fetch("/api/checkout/place-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer: {
            name: fullName,
            email,
            phone,
          },
          shippingAddress: {
            name: fullName,
            phone,
            line1: address1,
            line2: address2,
            city,
            state,
            postalCode,
            countryCode,
          },
          paymentMethod,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to place order");
      }

      const confirmationUrl =
        marketCode.toLowerCase() === "us"
          ? `/checkout/confirmation?order=${encodeURIComponent(data.order.orderNumber)}`
          : `/${marketCode.toLowerCase()}/checkout/confirmation?order=${encodeURIComponent(data.order.orderNumber)}`;

      router.push(confirmationUrl);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "An error occurred during checkout";
      setErrorMessage(message);
      setSubmitting(false);
    }
  };

  if (!hasItems && !submitting) {
    return (
      <div
        style={{
          maxWidth: 600,
          margin: "80px auto",
          padding: "var(--md-space-8) var(--md-space-6)",
          textAlign: "center",
          background: "var(--md-bg)",
          border: "1px solid var(--md-rule)",
        }}
      >
        <h1 style={{ fontFamily: "var(--md-font-display)", fontSize: "2rem", marginBottom: "var(--md-space-3)" }}>
          Your Shopping Bag is Empty
        </h1>
        <p style={{ color: "var(--md-fg-muted)", marginBottom: "var(--md-space-6)" }}>
          Please add a handcrafted jewellery piece to your bag before proceeding to checkout.
        </p>
        <Link href={marketCode.toLowerCase() === "us" ? "/" : `/${marketCode.toLowerCase()}`}>
          <Button variant="primary" size="lg">
            Return to Store
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div
      style={{
        maxWidth: "var(--md-container)",
        marginInline: "auto",
        padding: "var(--md-space-8) var(--md-gutter)",
      }}
    >
      {/* Checkout Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          borderBottom: "1px solid var(--md-rule)",
          paddingBottom: "var(--md-space-4)",
          marginBottom: "var(--md-space-8)",
        }}
      >
        <div>
          <h1
            style={{
              fontFamily: "var(--md-font-display)",
              fontSize: "2.25rem",
              margin: 0,
              fontWeight: 500,
              color: "var(--md-fg)",
            }}
          >
            Secure Checkout
          </h1>
          <p style={{ fontSize: "0.875rem", color: "var(--md-fg-secondary)", margin: "4px 0 0" }}>
            Direct from our Jaipur workshop · Anti-tarnish 925 sterling silver
          </p>
        </div>

        {/* Currency Lock Badge - Prompt §25 */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--md-space-2)",
            background: "var(--md-bg-subtle, var(--md-rule))",
            padding: "var(--md-space-2) var(--md-space-4)",
            borderRadius: "var(--md-radius-sm)",
            fontSize: "0.8125rem",
            color: "var(--md-fg)",
            fontWeight: 500,
          }}
        >
          <span>🔒 Market & Currency Locked:</span>
          <span style={{ color: "var(--md-green)", fontWeight: 700 }}>
            {currencyCode} ({currencySymbol})
          </span>
        </div>
      </div>

      {errorMessage && (
        <div
          style={{
            background: "var(--md-bg-subtle, var(--md-rule))",
            border: "1px solid var(--md-rule)",
            color: "var(--md-sold, var(--md-fg))",
            padding: "var(--md-space-3) var(--md-space-4)",
            borderRadius: "var(--md-radius-sm)",
            marginBottom: "var(--md-space-6)",
            fontSize: "0.875rem",
          }}
        >
          {errorMessage}
        </div>
      )}

      {/* Main Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: "var(--md-space-8)",
          alignItems: "start",
        }}
      >
        {/* Left Column: Form */}
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "var(--md-space-6)" }}>
          {/* 1. Contact Information */}
          <section
            style={{
              background: "var(--md-bg)",
              border: "1px solid var(--md-rule)",
              padding: "var(--md-space-6)",
            }}
          >
            <h2
              style={{
                fontFamily: "var(--md-font-display)",
                fontSize: "1.25rem",
                margin: "0 0 var(--md-space-4)",
                color: "var(--md-fg)",
              }}
            >
              1. Contact Information
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--md-space-4)" }}>
              <div style={{ gridColumn: "span 2" }}>
                <label style={{ display: "block", fontSize: "0.8125rem", marginBottom: 6, color: "var(--md-fg-secondary)" }}>
                  Email Address *
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    border: "1px solid var(--md-rule)",
                    background: "transparent",
                    color: "var(--md-fg)",
                    fontSize: "0.875rem",
                  }}
                />
              </div>
              <div style={{ gridColumn: "span 2" }}>
                <label style={{ display: "block", fontSize: "0.8125rem", marginBottom: 6, color: "var(--md-fg-secondary)" }}>
                  Mobile Phone Number (for delivery updates) *
                </label>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder={isIndia ? "+91 98200 00000" : "+1 (555) 000-0000"}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    border: "1px solid var(--md-rule)",
                    background: "transparent",
                    color: "var(--md-fg)",
                    fontSize: "0.875rem",
                  }}
                />
              </div>
            </div>
          </section>

          {/* 2. Shipping Address */}
          <section
            style={{
              background: "var(--md-bg)",
              border: "1px solid var(--md-rule)",
              padding: "var(--md-space-6)",
            }}
          >
            <h2
              style={{
                fontFamily: "var(--md-font-display)",
                fontSize: "1.25rem",
                margin: "0 0 var(--md-space-4)",
                color: "var(--md-fg)",
              }}
            >
              2. Shipping Address
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--md-space-4)" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.8125rem", marginBottom: 6, color: "var(--md-fg-secondary)" }}>
                  First Name *
                </label>
                <input
                  type="text"
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    border: "1px solid var(--md-rule)",
                    background: "transparent",
                    color: "var(--md-fg)",
                    fontSize: "0.875rem",
                  }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "0.8125rem", marginBottom: 6, color: "var(--md-fg-secondary)" }}>
                  Last Name *
                </label>
                <input
                  type="text"
                  required
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    border: "1px solid var(--md-rule)",
                    background: "transparent",
                    color: "var(--md-fg)",
                    fontSize: "0.875rem",
                  }}
                />
              </div>
              <div style={{ gridColumn: "span 2" }}>
                <label style={{ display: "block", fontSize: "0.8125rem", marginBottom: 6, color: "var(--md-fg-secondary)" }}>
                  Address Line 1 *
                </label>
                <input
                  type="text"
                  required
                  value={address1}
                  onChange={(e) => setAddress1(e.target.value)}
                  placeholder="Street address, suite, apartment"
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    border: "1px solid var(--md-rule)",
                    background: "transparent",
                    color: "var(--md-fg)",
                    fontSize: "0.875rem",
                  }}
                />
              </div>
              <div style={{ gridColumn: "span 2" }}>
                <label style={{ display: "block", fontSize: "0.8125rem", marginBottom: 6, color: "var(--md-fg-secondary)" }}>
                  Address Line 2 (Optional)
                </label>
                <input
                  type="text"
                  value={address2}
                  onChange={(e) => setAddress2(e.target.value)}
                  placeholder="Apartment, suite, unit, etc."
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    border: "1px solid var(--md-rule)",
                    background: "transparent",
                    color: "var(--md-fg)",
                    fontSize: "0.875rem",
                  }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "0.8125rem", marginBottom: 6, color: "var(--md-fg-secondary)" }}>
                  City *
                </label>
                <input
                  type="text"
                  required
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    border: "1px solid var(--md-rule)",
                    background: "transparent",
                    color: "var(--md-fg)",
                    fontSize: "0.875rem",
                  }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "0.8125rem", marginBottom: 6, color: "var(--md-fg-secondary)" }}>
                  State / Province *
                </label>
                <input
                  type="text"
                  required
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    border: "1px solid var(--md-rule)",
                    background: "transparent",
                    color: "var(--md-fg)",
                    fontSize: "0.875rem",
                  }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "0.8125rem", marginBottom: 6, color: "var(--md-fg-secondary)" }}>
                  PIN / Postal Code *
                </label>
                <input
                  type="text"
                  required
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    border: "1px solid var(--md-rule)",
                    background: "transparent",
                    color: "var(--md-fg)",
                    fontSize: "0.875rem",
                  }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "0.8125rem", marginBottom: 6, color: "var(--md-fg-secondary)" }}>
                  Country *
                </label>
                <select
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    border: "1px solid var(--md-rule)",
                    background: "transparent",
                    color: "var(--md-fg)",
                    fontSize: "0.875rem",
                  }}
                >
                  {isIndia ? (
                    <option value="IN">India</option>
                  ) : (
                    <>
                      <option value="US">United States</option>
                      <option value="CA">Canada</option>
                      <option value="GB">United Kingdom</option>
                    </>
                  )}
                </select>
              </div>
            </div>
          </section>

          {/* 3. Delivery Method */}
          <section
            style={{
              background: "var(--md-bg)",
              border: "1px solid var(--md-rule)",
              padding: "var(--md-space-6)",
            }}
          >
            <h2
              style={{
                fontFamily: "var(--md-font-display)",
                fontSize: "1.25rem",
                margin: "0 0 var(--md-space-4)",
                color: "var(--md-fg)",
              }}
            >
              3. Delivery Method
            </h2>
            <div
              style={{
                border: "1px solid var(--md-green)",
                background: "var(--md-bg-raised)",
                padding: "var(--md-space-4)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: "0.9375rem" }}>
                  Complimentary Insured Courier
                </div>
                <div style={{ fontSize: "0.8125rem", color: "var(--md-fg-muted)" }}>
                  Dispatched in tamper-evident security packaging with signature on delivery
                </div>
              </div>
              <div style={{ fontWeight: 600, color: "var(--md-green)" }}>
                FREE
              </div>
            </div>
          </section>

          {/* 4. Payment */}
          <section
            style={{
              background: "var(--md-bg)",
              border: "1px solid var(--md-rule)",
              padding: "var(--md-space-6)",
            }}
          >
            <h2
              style={{
                fontFamily: "var(--md-font-display)",
                fontSize: "1.25rem",
                margin: "0 0 var(--md-space-4)",
                color: "var(--md-fg)",
              }}
            >
              4. Payment
            </h2>

            {/* Payment Option 1: Direct Bank Transfer (Primary / Recommended) */}
            <div
              style={{
                border: paymentMethod === "bank_transfer" ? "1.5px solid var(--md-gold, #c9a86a)" : "1px solid var(--md-rule)",
                borderRadius: "var(--md-radius-sm)",
                background: paymentMethod === "bank_transfer" ? "var(--md-bg-raised)" : "transparent",
                padding: "var(--md-space-4)",
                marginBottom: "var(--md-space-4)",
                transition: "border-color 0.2s, background 0.2s",
                cursor: "pointer",
              }}
              onClick={() => setPaymentMethod("bank_transfer")}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--md-space-2)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--md-space-3)" }}>
                  <input
                    type="radio"
                    id="bank_transfer"
                    name="payment"
                    checked={paymentMethod === "bank_transfer"}
                    onChange={() => setPaymentMethod("bank_transfer")}
                  />
                  <label htmlFor="bank_transfer" style={{ fontWeight: 600, fontSize: "0.9375rem", cursor: "pointer" }}>
                    Direct Bank Transfer (NEFT / RTGS / IMPS)
                  </label>
                </div>
                <span
                  style={{
                    fontSize: "0.6875rem",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    padding: "2px 8px",
                    background: "rgba(201, 168, 106, 0.15)",
                    color: "var(--md-gold, #8a6a24)",
                    fontWeight: 600,
                    borderRadius: 3,
                  }}
                >
                  Recommended
                </span>
              </div>
              <p style={{ fontSize: "0.8125rem", color: "var(--md-fg-muted)", margin: "0 0 0 24px", lineHeight: 1.5 }}>
                Direct bank transfer to Millennium Designs official ICICI Bank current account. Zero transaction fees.
              </p>

              {paymentMethod === "bank_transfer" && (
                <div
                  style={{
                    marginTop: "var(--md-space-4)",
                    marginLeft: 24,
                    padding: "var(--md-space-4)",
                    background: "var(--md-bg)",
                    border: "1px solid var(--md-rule)",
                    borderRadius: "var(--md-radius-sm)",
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, borderBottom: "1px solid var(--md-rule)", paddingBottom: 8 }}>
                    <span style={{ fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--md-fg)" }}>
                      Beneficiary Account Details
                    </span>
                    <span style={{ fontSize: "0.6875rem", color: "var(--md-fg-muted)" }}>
                      ICICI Bank • Jaipur
                    </span>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, fontSize: "0.8125rem" }}>
                    <div>
                      <div style={{ color: "var(--md-fg-secondary)", fontSize: "0.6875rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Account Name</div>
                      <div style={{ fontWeight: 600, color: "var(--md-fg)", marginTop: 2 }}>{BANK_TRANSFER_DETAILS.accountName}</div>
                    </div>

                    <div>
                      <div style={{ color: "var(--md-fg-secondary)", fontSize: "0.6875rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Bank &amp; Branch</div>
                      <div style={{ fontWeight: 600, color: "var(--md-fg)", marginTop: 2 }}>{BANK_TRANSFER_DETAILS.bankName} ({BANK_TRANSFER_DETAILS.branchName})</div>
                    </div>

                    <div>
                      <div style={{ color: "var(--md-fg-secondary)", fontSize: "0.6875rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Account Number</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
                        <span style={{ fontWeight: 700, fontFamily: "monospace", letterSpacing: "0.05em", color: "var(--md-fg)", fontSize: "0.9375rem" }}>
                          {BANK_TRANSFER_DETAILS.accountNumber}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopy(BANK_TRANSFER_DETAILS.accountNumber, "acc")}
                          style={{
                            border: "1px solid var(--md-rule)",
                            background: "var(--md-bg-raised)",
                            padding: "2px 8px",
                            fontSize: "0.6875rem",
                            borderRadius: 3,
                            cursor: "pointer",
                            color: copiedKey === "acc" ? "var(--md-green)" : "var(--md-fg)",
                          }}
                        >
                          {copiedKey === "acc" ? "✓ Copied" : "Copy"}
                        </button>
                      </div>
                    </div>

                    <div>
                      <div style={{ color: "var(--md-fg-secondary)", fontSize: "0.6875rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>RTGS / NEFT / IFSC Code</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
                        <span style={{ fontWeight: 700, fontFamily: "monospace", letterSpacing: "0.05em", color: "var(--md-fg)", fontSize: "0.9375rem" }}>
                          {BANK_TRANSFER_DETAILS.ifscCode}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopy(BANK_TRANSFER_DETAILS.ifscCode, "ifsc")}
                          style={{
                            border: "1px solid var(--md-rule)",
                            background: "var(--md-bg-raised)",
                            padding: "2px 8px",
                            fontSize: "0.6875rem",
                            borderRadius: 3,
                            cursor: "pointer",
                            color: copiedKey === "ifsc" ? "var(--md-green)" : "var(--md-fg)",
                          }}
                        >
                          {copiedKey === "ifsc" ? "✓ Copied" : "Copy"}
                        </button>
                      </div>
                    </div>

                    <div>
                      <div style={{ color: "var(--md-fg-secondary)", fontSize: "0.6875rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Account Type</div>
                      <div style={{ fontWeight: 600, color: "var(--md-fg)", marginTop: 2 }}>{BANK_TRANSFER_DETAILS.accountType}</div>
                    </div>

                    <div>
                      <div style={{ color: "var(--md-fg-secondary)", fontSize: "0.6875rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Concierge Verification</div>
                      <div style={{ fontWeight: 600, color: "var(--md-fg)", marginTop: 2 }}>{BANK_TRANSFER_DETAILS.whatsappDisplay}</div>
                    </div>
                  </div>

                  <div style={{ marginTop: 12, padding: "8px 12px", background: "var(--md-bg-raised)", borderRadius: "var(--md-radius-sm)", fontSize: "0.75rem", color: "var(--md-fg-secondary)", lineHeight: 1.4 }}>
                    ✦ Your bespoke jewellery will be immediately reserved upon clicking &quot;Place Order&quot;. You can then transfer via bank app and share your UTR or confirmation with our atelier on WhatsApp.
                  </div>
                </div>
              )}
            </div>

            {/* Payment Option 2: Online Gateway */}
            {isIndia ? (
              <div
                style={{
                  border: paymentMethod === "razorpay" ? "1.5px solid var(--md-gold, #c9a86a)" : "1px solid var(--md-rule)",
                  borderRadius: "var(--md-radius-sm)",
                  background: paymentMethod === "razorpay" ? "var(--md-bg-raised)" : "transparent",
                  padding: "var(--md-space-4)",
                  marginBottom: "var(--md-space-4)",
                  cursor: "pointer",
                }}
                onClick={() => setPaymentMethod("razorpay")}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "var(--md-space-3)", marginBottom: "var(--md-space-2)" }}>
                  <input
                    type="radio"
                    id="rzp"
                    name="payment"
                    checked={paymentMethod === "razorpay"}
                    onChange={() => setPaymentMethod("razorpay")}
                  />
                  <label htmlFor="rzp" style={{ fontWeight: 600, fontSize: "0.9375rem", cursor: "pointer" }}>
                    Razorpay — UPI, Cards, NetBanking (INR)
                  </label>
                </div>
                <p style={{ fontSize: "0.8125rem", color: "var(--md-fg-muted)", margin: "0 0 0 24px" }}>
                  Pay securely via PhonePe, Google Pay, Paytm, Credit/Debit cards, or NetBanking.
                </p>
              </div>
            ) : (
              <div
                style={{
                  border: paymentMethod === "stripe" ? "1.5px solid var(--md-gold, #c9a86a)" : "1px solid var(--md-rule)",
                  borderRadius: "var(--md-radius-sm)",
                  background: paymentMethod === "stripe" ? "var(--md-bg-raised)" : "transparent",
                  padding: "var(--md-space-4)",
                  marginBottom: "var(--md-space-4)",
                  cursor: "pointer",
                }}
                onClick={() => setPaymentMethod("stripe")}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "var(--md-space-3)", marginBottom: "var(--md-space-2)" }}>
                  <input
                    type="radio"
                    id="stripe"
                    name="payment"
                    checked={paymentMethod === "stripe"}
                    onChange={() => setPaymentMethod("stripe")}
                  />
                  <label htmlFor="stripe" style={{ fontWeight: 600, fontSize: "0.9375rem", cursor: "pointer" }}>
                    Stripe — Credit / Debit Card (USD)
                  </label>
                </div>
                <p style={{ fontSize: "0.8125rem", color: "var(--md-fg-muted)", margin: "0 0 0 24px" }}>
                  All major cards accepted: Visa, Mastercard, American Express. Encrypted via Stripe.
                </p>
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              size="lg"
              disabled={submitting}
              style={{ width: "100%", marginTop: "var(--md-space-2)" }}
            >
              {submitting ? "Placing Order…" : `Place Order • ${cart?.formattedSubtotal}`}
            </Button>
          </section>
        </form>

        {/* Right Column: Order Summary */}
        <aside
          style={{
            background: "var(--md-bg)",
            border: "1px solid var(--md-rule)",
            padding: "var(--md-space-6)",
            position: "sticky",
            top: 96,
          }}
        >
          <h2
            style={{
              fontFamily: "var(--md-font-display)",
              fontSize: "1.25rem",
              margin: "0 0 var(--md-space-4)",
              color: "var(--md-fg)",
            }}
          >
            Order Summary ({cart?.totalQuantity})
          </h2>

          <div style={{ display: "flex", flexDirection: "column", gap: "var(--md-space-4)", marginBottom: "var(--md-space-5)" }}>
            {lines.map((line) => (
              <div key={line.id} style={{ display: "flex", gap: "var(--md-space-3)", alignItems: "center" }}>
                <div
                  style={{
                    position: "relative",
                    width: 56,
                    height: 68,
                    background: "var(--md-bg-raised)",
                    flexShrink: 0,
                    overflow: "hidden",
                  }}
                >
                  <Image src={line.imageUrl} alt={line.productTitle} fill sizes="56px" style={{ objectFit: "cover" }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "0.875rem", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {line.productTitle}
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--md-fg-muted)" }}>
                    Qty: {line.quantity}
                  </div>
                </div>
                <div style={{ fontSize: "0.875rem", fontWeight: 500, whiteSpace: "nowrap" }}>
                  {line.formattedLineSubtotal}
                </div>
              </div>
            ))}
          </div>

          <div style={{ borderTop: "1px solid var(--md-rule)", paddingTop: "var(--md-space-4)", display: "flex", flexDirection: "column", gap: "var(--md-space-2)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.875rem", color: "var(--md-fg-secondary)" }}>
              <span>Subtotal</span>
              <span>{cart?.formattedSubtotal}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.875rem", color: "var(--md-fg-secondary)" }}>
              <span>Insured Shipping</span>
              <span style={{ color: "var(--md-green)", fontWeight: 500 }}>Complimentary</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.875rem", color: "var(--md-fg-secondary)" }}>
              <span>Estimated Tax</span>
              <span>{isIndia ? "Included" : "$0.00"}</span>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: "1.125rem",
                fontWeight: 600,
                color: "var(--md-fg)",
                borderTop: "1px solid var(--md-rule)",
                paddingTop: "var(--md-space-3)",
                marginTop: "var(--md-space-2)",
              }}
            >
              <span>Total</span>
              <span style={{ fontFamily: "var(--md-font-display)", fontSize: "1.375rem" }}>
                {cart?.formattedSubtotal}
              </span>
            </div>
          </div>

          {/* Trust Guarantees */}
          <div
            style={{
              marginTop: "var(--md-space-6)",
              paddingTop: "var(--md-space-4)",
              borderTop: "1px solid var(--md-rule)",
              display: "flex",
              flexDirection: "column",
              gap: "var(--md-space-2)",
              fontSize: "0.75rem",
              color: "var(--md-fg-muted)",
            }}
          >
            <div>🛡️ <strong>Certified Authenticity:</strong> Every gemstone & metal is hallmarked.</div>
            <div>📦 <strong>Fully Insured Courier:</strong> Doorstep delivery with tamper-seal.</div>
            <div>💬 <strong>Concierge Support:</strong> Dedicated assistance on WhatsApp.</div>
          </div>
        </aside>
      </div>
    </div>
  );
}
