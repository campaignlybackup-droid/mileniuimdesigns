"use client";

import React, { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSearchParams, useParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import type { OrderSummary } from "@/lib/orders";

function OrderConfirmationContent() {
  const searchParams = useSearchParams();
  const params = useParams();
  const marketParam = (params?.market as string) || "us";
  const marketCode = marketParam.toUpperCase();
  const orderNumber = searchParams.get("order");

  const [order, setOrder] = useState<OrderSummary | null>(null);
  const [loading, setLoading] = useState(Boolean(orderNumber));

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

  const supportPhone = "+91 98200 00000";
  const whatsappMessage = encodeURIComponent(
    `Hello Millennium Designs, I have placed an order (${orderNumber ?? "MD-ORDER"}) and would like assistance.`,
  );
  const whatsappUrl = `https://wa.me/919820000000?text=${whatsappMessage}`;

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
        maxWidth: 720,
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
          boxShadow: "0 4px 20px rgba(0, 0, 0, 0.03)",
        }}
      >
        {/* Success Icon */}
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            background: "var(--md-green)",
            color: "var(--md-fg-inverse)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: "var(--md-space-4)",
          }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>

        <p
          style={{
            fontSize: "0.8125rem",
            textTransform: "uppercase",
            letterSpacing: "0.15em",
            color: "var(--md-green)",
            fontWeight: 600,
            margin: "0 0 var(--md-space-2)",
          }}
        >
          Order Confirmed
        </p>

        <h1
          style={{
            fontFamily: "var(--md-font-display)",
            fontSize: "2.5rem",
            fontWeight: 500,
            margin: "0 0 var(--md-space-3)",
            color: "var(--md-fg)",
          }}
        >
          ORDER PLACED SUCCESSFULLY
        </h1>

        <p
          style={{
            fontSize: "1.125rem",
            color: "var(--md-fg-secondary)",
            margin: "0 0 var(--md-space-6)",
            lineHeight: 1.6,
          }}
        >
          Thank you for choosing <strong>Millennium Designs</strong>. Your bespoke piece is now entered into our atelier schedule for precision inspection, hallmark verification, and luxury presentation preparation.
        </p>

        {/* Order Details Pill */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "var(--md-space-4)",
            background: "var(--md-bg-subtle, #f8f6f0)",
            padding: "var(--md-space-3) var(--md-space-6)",
            borderRadius: 4,
            border: "1px solid var(--md-rule)",
            marginBottom: "var(--md-space-6)",
          }}
        >
          <div>
            <div style={{ fontSize: "0.75rem", color: "var(--md-fg-muted)", textTransform: "uppercase" }}>
              Order Number
            </div>
            <div style={{ fontSize: "1.125rem", fontWeight: 700, color: "var(--md-fg)" }}>
              {order?.orderNumber ?? orderNumber ?? "MD-2026-CONFIRMED"}
            </div>
          </div>
          <div style={{ width: 1, height: 32, background: "var(--md-rule)" }} />
          <div>
            <div style={{ fontSize: "0.75rem", color: "var(--md-fg-muted)", textTransform: "uppercase" }}>
              Total Paid
            </div>
            <div style={{ fontSize: "1.125rem", fontWeight: 700, color: "var(--md-fg)" }}>
              {order?.formattedTotal ?? "Confirmed"}
            </div>
          </div>
        </div>

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
                      background: "var(--md-surface, #f5f2eb)",
                      overflow: "hidden",
                      flexShrink: 0,
                    }}
                  >
                    <Image src={item.imageUrl} alt={item.productTitle} fill sizes="56px" style={{ objectFit: "cover" }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, fontSize: "0.9375rem" }}>{item.productTitle}</div>
                    {item.variantTitle && (
                      <div style={{ fontSize: "0.75rem", color: "var(--md-fg-muted)" }}>{item.variantTitle}</div>
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

        {/* Support & WhatsApp — Prompt §28 & §29 */}
        <div
          style={{
            background: "var(--md-bg-subtle, #fcfaf5)",
            border: "1px solid var(--md-rule)",
            padding: "var(--md-space-6)",
            marginBlock: "var(--md-space-6)",
            textAlign: "center",
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
            Need help with your order?
          </h3>
          <p
            style={{
              fontSize: "0.875rem",
              color: "var(--md-fg-muted)",
              maxWidth: 460,
              margin: "0 auto var(--md-space-4)",
            }}
          >
            Our dedicated concierge is at your service for delivery coordination, sizing adjustments, or certification details.
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
                Chat with us on WhatsApp
              </Button>
            </a>

            <Link href={marketCode.toLowerCase() === "us" ? "/" : `/${marketCode.toLowerCase()}`}>
              <Button variant="outline" size="lg">
                Continue Exploring
              </Button>
            </Link>
          </div>

          <div style={{ marginTop: "var(--md-space-3)", fontSize: "0.8125rem", color: "var(--md-fg-muted)" }}>
            Concierge Direct: <strong>{supportPhone}</strong> (10:00 – 19:00 IST)
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
