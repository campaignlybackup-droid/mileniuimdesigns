"use client";

import React, { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSearchParams, useParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import type { OrderSummary } from "@/lib/orders";
import { BANK_TRANSFER_DETAILS } from "@/lib/config/bankDetails";

function OrderConfirmationContent() {
  const searchParams = useSearchParams();
  const params = useParams();
  const marketParam = (params?.market as string) || "us";
  const marketCode = marketParam.toUpperCase();
  const orderNumber = searchParams.get("order");

  const [order, setOrder] = useState<OrderSummary | null>(null);
  const [loading, setLoading] = useState(Boolean(orderNumber));
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = (text: string, key: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    }
  };

  useEffect(() => {
    if (!orderNumber) return;
    let ignore = false;
    fetch(`/api/checkout/order?order=${encodeURIComponent(orderNumber)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!ignore && data?.order) setOrder(data.order);
      })
      .catch((err) => console.error(err))
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [orderNumber]);

  const isBankTransfer = order?.paymentMethod === "bank_transfer" || order?.paymentStatus === "unpaid" || !order?.paymentStatus || order?.paymentStatus === "pending_payment";
  const currentOrderNum = order?.orderNumber ?? orderNumber ?? "MD-ORDER";
  const currentTotal = order?.formattedTotal ?? "—";

  const whatsappMessage = encodeURIComponent(
    `Hello Millennium Designs, I have placed Order ${currentOrderNum} (${currentTotal}) and am sharing my bank transfer details / UTR screenshot.`,
  );
  const whatsappUrl = `https://wa.me/${BANK_TRANSFER_DETAILS.whatsappNumber}?text=${whatsappMessage}`;

  if (loading) {
    return (
      <div style={{ padding: "80px var(--md-gutter)", textAlign: "center" }}>
        <p style={{ color: "var(--md-fg-muted)" }}>Retrieving order confirmation…</p>
      </div>
    );
  }

  return (
    <div
      style={{
        maxWidth: 760,
        marginInline: "auto",
        padding: "var(--md-space-8) var(--md-gutter)",
      }}
    >
      <div
        style={{
          background: "var(--md-bg)",
          border: "1px solid var(--md-rule)",
          padding: "var(--md-space-8) var(--md-space-6)",
          textAlign: "center",
          borderRadius: "var(--md-radius-sm)",
        }}
      >
        {/* Status Icon */}
        <div
          style={{
            width: 60,
            height: 60,
            borderRadius: "50%",
            background: isBankTransfer ? "var(--md-gold, #c9a86a)" : "var(--md-green)",
            color: "var(--md-fg-inverse)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: "var(--md-space-4)",
          }}
        >
          {isBankTransfer ? (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v4M12 14v4M16 14v4" />
            </svg>
          ) : (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </div>

        <p
          style={{
            fontSize: "0.8125rem",
            textTransform: "uppercase",
            letterSpacing: "0.15em",
            color: isBankTransfer ? "var(--md-gold, #8a6a24)" : "var(--md-green)",
            fontWeight: 600,
            margin: "0 0 var(--md-space-2)",
          }}
        >
          {isBankTransfer ? "Order Reserved • Awaiting Bank Transfer" : "Order Confirmed"}
        </p>

        <h1
          style={{
            fontFamily: "var(--md-font-display)",
            fontSize: "clamp(1.75rem, 4vw, 2.5rem)",
            fontWeight: 500,
            margin: "0 0 var(--md-space-3)",
            color: "var(--md-fg)",
          }}
        >
          {isBankTransfer ? "Thank You For Your Acquisition" : "Order Confirmed"}
        </h1>

        <p
          style={{
            fontSize: "1.0625rem",
            color: "var(--md-fg-secondary)",
            margin: "0 auto var(--md-space-6)",
            maxWidth: 580,
            lineHeight: 1.6,
          }}
        >
          {isBankTransfer
            ? "Your jewellery order has been received. Please complete your payment via direct bank transfer using the ICICI Bank details below to initiate hallmarking and dispatch."
            : "Thank you for shopping with Millennium Designs. Your order is now being processed for quality inspection, hallmark verification, and dispatch."}
        </p>

        {/* Order Details Pill */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "var(--md-space-4)",
            background: "var(--md-bg-raised)",
            padding: "var(--md-space-3) var(--md-space-6)",
            borderRadius: "var(--md-radius-sm)",
            border: "1px solid var(--md-rule)",
            marginBottom: "var(--md-space-6)",
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          <div>
            <div style={{ fontSize: "0.6875rem", color: "var(--md-fg-secondary)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Order Number
            </div>
            <div style={{ fontSize: "1.125rem", fontWeight: 700, color: "var(--md-fg)", letterSpacing: "0.02em" }}>
              {currentOrderNum}
            </div>
          </div>
          <div style={{ width: 1, height: 32, background: "var(--md-rule)" }} />
          <div>
            <div style={{ fontSize: "0.6875rem", color: "var(--md-fg-secondary)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              {isBankTransfer ? "Total Payable" : "Total Paid"}
            </div>
            <div style={{ fontSize: "1.125rem", fontWeight: 700, color: "var(--md-fg)" }}>
              {currentTotal}
            </div>
          </div>
          <div style={{ width: 1, height: 32, background: "var(--md-rule)" }} />
          <div>
            <div style={{ fontSize: "0.6875rem", color: "var(--md-fg-secondary)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Payment Method
            </div>
            <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--md-fg)", marginTop: 2 }}>
              {isBankTransfer ? "Direct Bank Transfer" : "Online Payment"}
            </div>
          </div>
        </div>

        {/* Bank Transfer Instructions Card (Shown prominently for Bank Transfer) */}
        {isBankTransfer && (
          <div
            style={{
              textAlign: "left",
              background: "var(--md-bg-raised)",
              border: "1.5px solid var(--md-gold, #c9a86a)",
              borderRadius: "var(--md-radius-sm)",
              padding: "var(--md-space-6)",
              marginBottom: "var(--md-space-6)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--md-rule)", paddingBottom: "var(--md-space-3)", marginBottom: "var(--md-space-4)" }}>
              <div>
                <h3
                  style={{
                    fontFamily: "var(--md-font-display)",
                    fontSize: "1.25rem",
                    margin: 0,
                    color: "var(--md-fg)",
                  }}
                >
                  ICICI Bank Transfer Details
                </h3>
                <span style={{ fontSize: "0.75rem", color: "var(--md-fg-muted)" }}>
                  Direct account wire transfer (IMPS / NEFT / RTGS)
                </span>
              </div>
              <span
                style={{
                  fontSize: "0.6875rem",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  padding: "4px 8px",
                  background: "var(--md-bg)",
                  border: "1px solid var(--md-rule)",
                  color: "var(--md-fg)",
                  fontWeight: 600,
                  borderRadius: 3,
                }}
              >
                Official Current A/c
              </span>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: "var(--md-space-4)",
                fontSize: "0.875rem",
                marginBottom: "var(--md-space-4)",
              }}
            >
              <div>
                <div style={{ color: "var(--md-fg-secondary)", fontSize: "0.6875rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Beneficiary Name
                </div>
                <div style={{ fontWeight: 700, color: "var(--md-fg)", marginTop: 2 }}>
                  {BANK_TRANSFER_DETAILS.accountName}
                </div>
              </div>

              <div>
                <div style={{ color: "var(--md-fg-secondary)", fontSize: "0.6875rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Bank Name &amp; Branch
                </div>
                <div style={{ fontWeight: 600, color: "var(--md-fg)", marginTop: 2 }}>
                  {BANK_TRANSFER_DETAILS.bankName}, {BANK_TRANSFER_DETAILS.branchName}
                </div>
              </div>

              <div>
                <div style={{ color: "var(--md-fg-secondary)", fontSize: "0.6875rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Account Number
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
                  <span style={{ fontWeight: 700, fontFamily: "monospace", letterSpacing: "0.06em", color: "var(--md-fg)", fontSize: "1.0625rem" }}>
                    {BANK_TRANSFER_DETAILS.accountNumber}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy(BANK_TRANSFER_DETAILS.accountNumber, "acc_conf")}
                    style={{
                      border: "1px solid var(--md-rule)",
                      background: "var(--md-bg)",
                      padding: "2px 8px",
                      fontSize: "0.6875rem",
                      borderRadius: 3,
                      cursor: "pointer",
                      color: copiedKey === "acc_conf" ? "var(--md-green)" : "var(--md-fg)",
                    }}
                  >
                    {copiedKey === "acc_conf" ? "✓ Copied" : "Copy"}
                  </button>
                </div>
              </div>

              <div>
                <div style={{ color: "var(--md-fg-secondary)", fontSize: "0.6875rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  RTGS / NEFT IFS Code
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
                  <span style={{ fontWeight: 700, fontFamily: "monospace", letterSpacing: "0.06em", color: "var(--md-fg)", fontSize: "1.0625rem" }}>
                    {BANK_TRANSFER_DETAILS.ifscCode}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy(BANK_TRANSFER_DETAILS.ifscCode, "ifsc_conf")}
                    style={{
                      border: "1px solid var(--md-rule)",
                      background: "var(--md-bg)",
                      padding: "2px 8px",
                      fontSize: "0.6875rem",
                      borderRadius: 3,
                      cursor: "pointer",
                      color: copiedKey === "ifsc_conf" ? "var(--md-green)" : "var(--md-fg)",
                    }}
                  >
                    {copiedKey === "ifsc_conf" ? "✓ Copied" : "Copy"}
                  </button>
                </div>
              </div>

              <div>
                <div style={{ color: "var(--md-fg-secondary)", fontSize: "0.6875rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Account Type
                </div>
                <div style={{ fontWeight: 600, color: "var(--md-fg)", marginTop: 2 }}>
                  {BANK_TRANSFER_DETAILS.accountType}
                </div>
              </div>

              <div>
                <div style={{ color: "var(--md-fg-secondary)", fontSize: "0.6875rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Payment Remark / Reference
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
                  <span style={{ fontWeight: 700, fontFamily: "monospace", color: "var(--md-fg)" }}>
                    {currentOrderNum}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy(currentOrderNum, "order_rem")}
                    style={{
                      border: "1px solid var(--md-rule)",
                      background: "var(--md-bg)",
                      padding: "2px 8px",
                      fontSize: "0.6875rem",
                      borderRadius: 3,
                      cursor: "pointer",
                      color: copiedKey === "order_rem" ? "var(--md-green)" : "var(--md-fg)",
                    }}
                  >
                    {copiedKey === "order_rem" ? "✓ Copied" : "Copy"}
                  </button>
                </div>
              </div>
            </div>

            {/* Steps to complete */}
            <div
              style={{
                background: "var(--md-bg)",
                border: "1px solid var(--md-rule)",
                borderRadius: "var(--md-radius-sm)",
                padding: "var(--md-space-4)",
                fontSize: "0.8125rem",
                lineHeight: 1.6,
                color: "var(--md-fg-secondary)",
              }}
            >
              <div style={{ fontWeight: 600, color: "var(--md-fg)", marginBottom: 6 }}>
                How to finalize your acquisition:
              </div>
              <ol style={{ margin: 0, paddingLeft: 18 }}>
                <li>Log in to your banking app or net banking portal.</li>
                <li>Add beneficiary or transfer <strong>{currentTotal}</strong> to Millennium Designs ICICI current account using the details above.</li>
                <li>Mention <strong>{currentOrderNum}</strong> in the remarks/description.</li>
                <li>Tap the WhatsApp button below to share your UTR or transaction confirmation screenshot with our dedicated concierge team.</li>
              </ol>
            </div>
          </div>
        )}

        {/* Items Purchased List */}
        {order && order.items && order.items.length > 0 && (
          <div
            style={{
              textAlign: "left",
              borderTop: "1px solid var(--md-rule)",
              borderBottom: "1px solid var(--md-rule)",
              paddingBlock: "var(--md-space-6)",
              marginBlock: "var(--md-space-6)",
            }}
          >
            <h3
              style={{
                fontFamily: "var(--md-font-display)",
                fontSize: "1.25rem",
                margin: "0 0 var(--md-space-4)",
                color: "var(--md-fg)",
              }}
            >
              Acquisition Summary
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--md-space-4)" }}>
              {order.items.map((item) => (
                <div key={item.id} style={{ display: "flex", alignItems: "center", gap: "var(--md-space-4)" }}>
                  <div
                    style={{
                      position: "relative",
                      width: 56,
                      height: 70,
                      background: "var(--md-bg-raised)",
                      overflow: "hidden",
                      flexShrink: 0,
                    }}
                  >
                    <Image src={item.imageUrl} alt={item.productTitle} fill sizes="56px" style={{ objectFit: "cover" }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, fontSize: "0.9375rem" }}>{item.productTitle}</div>
                    {item.variantTitle && (
                      <div style={{ fontSize: "0.75rem", color: "var(--md-fg-secondary)" }}>{item.variantTitle}</div>
                    )}
                    <div style={{ fontSize: "0.8125rem", color: "var(--md-fg-secondary)" }}>
                      Qty: {item.quantity} • SKU: {item.sku}
                    </div>
                  </div>
                  <div style={{ fontWeight: 600, fontSize: "0.9375rem" }}>
                    {item.formattedLineSubtotal}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Support & WhatsApp Concierge */}
        <div
          style={{
            background: "var(--md-bg)",
            border: "1px solid var(--md-rule)",
            padding: "var(--md-space-6)",
            marginBlock: "var(--md-space-6)",
            textAlign: "center",
            borderRadius: "var(--md-radius-sm)",
          }}
        >
          <h3
            style={{
              fontFamily: "var(--md-font-display)",
              fontSize: "1.375rem",
              margin: "0 0 var(--md-space-2)",
              color: "var(--md-fg)",
            }}
          >
            {isBankTransfer ? "Share Payment Confirmation" : "Need help with your order?"}
          </h3>
          <p
            style={{
              fontSize: "0.875rem",
              color: "var(--md-fg-muted)",
              maxWidth: 480,
              margin: "0 auto var(--md-space-4)",
              lineHeight: 1.5,
            }}
          >
            {isBankTransfer
              ? "Click below to connect directly with our support team on WhatsApp to share your bank transfer UTR or transaction screenshot for instant verification."
              : "Our customer support team is at your service for delivery coordination, sizing assistance, or order details."}
          </p>

          <div style={{ display: "flex", justifyContent: "center", gap: "var(--md-space-4)", flexWrap: "wrap" }}>
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                textDecoration: "none",
              }}
            >
              <Button
                variant="primary"
                size="lg"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "var(--md-space-2)",
                  backgroundColor: "var(--md-green)",
                  color: "var(--md-fg-inverse)",
                  borderColor: "var(--md-green)",
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.77-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.299.045-.677.063-1.092-.069-.252-.08-.575-.187-.988-.365-1.739-.751-2.874-2.502-2.961-2.617-.087-.116-.708-.94-.708-1.793s.448-1.273.607-1.446c.159-.173.346-.217.462-.217l.332.006c.106.005.249-.04.39.298.144.347.491 1.2.534 1.287.043.087.072.188.014.304-.058.116-.087.188-.173.289l-.26.304c-.087.086-.177.18-.076.354.101.174.449.741.964 1.201.662.591 1.221.774 1.394.86s.275.072.376-.043c.101-.116.433-.506.549-.68.116-.173.231-.145.39-.087s1.011.477 1.184.564.289.13.332.202c.043.073.043.419-.101.824z" />
                </svg>
                {isBankTransfer ? "Share Transfer Details on WhatsApp" : "Chat with us on WhatsApp"}
              </Button>
            </a>

            <Link href={marketCode.toLowerCase() === "us" ? "/" : `/${marketCode.toLowerCase()}`}>
              <Button variant="outline" size="lg">
                Continue Exploring
              </Button>
            </Link>
          </div>

          <div style={{ marginTop: "var(--md-space-3)", fontSize: "0.8125rem", color: "var(--md-fg-muted)" }}>
            Concierge Direct: <strong>{BANK_TRANSFER_DETAILS.whatsappDisplay}</strong> (10:00 – 19:00 IST)
          </div>
        </div>
      </div>
    </div>
  );
}

export default function OrderConfirmationPage() {
  return (
    <Suspense fallback={<div style={{ padding: "80px var(--md-gutter)", textAlign: "center" }}>Loading confirmation…</div>}>
      <OrderConfirmationContent />
    </Suspense>
  );
}
