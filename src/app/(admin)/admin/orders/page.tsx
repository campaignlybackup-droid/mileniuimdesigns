import React from "react";
import { listRecentOrders } from "@/lib/orders";

export const dynamic = "force-dynamic";

export default async function AdminOrdersPage() {
  const orders = await listRecentOrders(50);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--md-space-8)" }}>
      <div>
        <h1
          style={{
            fontFamily: "var(--md-font-display)",
            fontSize: "2rem",
            margin: 0,
            fontWeight: 500,
            color: "var(--md-fg)",
          }}
        >
          Customer Orders & Acquisitions
        </h1>
        <p style={{ fontSize: "0.875rem", color: "var(--md-fg-muted)", marginTop: 4 }}>
          Comprehensive ledger of all client orders across Indian (INR) and Global (USD) markets.
        </p>
      </div>

      <section
        style={{
          background: "var(--md-bg)",
          border: "1px solid var(--md-rule)",
          borderRadius: 6,
          padding: "var(--md-space-6)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--md-space-5)" }}>
          <h2 style={{ fontFamily: "var(--md-font-display)", fontSize: "1.25rem", margin: 0 }}>
            Master Order Ledger ({orders.length})
          </h2>
        </div>

        {orders.length === 0 ? (
          <p style={{ color: "var(--md-fg-muted)", fontSize: "0.875rem", margin: 0 }}>
            No orders recorded in the system.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--md-rule)", textAlign: "left", color: "var(--md-fg-muted)" }}>
                  <th style={{ padding: "10px 12px" }}>Order Number</th>
                  <th style={{ padding: "10px 12px" }}>Market</th>
                  <th style={{ padding: "10px 12px" }}>Date</th>
                  <th style={{ padding: "10px 12px" }}>Customer Email</th>
                  <th style={{ padding: "10px 12px" }}>Pieces</th>
                  <th style={{ padding: "10px 12px" }}>Total Amount</th>
                  <th style={{ padding: "10px 12px" }}>Payment</th>
                  <th style={{ padding: "10px 12px" }}>Fulfillment</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} style={{ borderBottom: "1px solid var(--md-rule)" }}>
                    <td style={{ padding: "14px 12px", fontWeight: 600 }}>{o.orderNumber}</td>
                    <td style={{ padding: "14px 12px" }}>
                      <span
                        style={{
                          padding: "3px 8px",
                          borderRadius: 3,
                          fontSize: "0.6875rem",
                          fontWeight: 700,
                          background: o.marketCode === "IN" ? "var(--md-bg-subtle, var(--md-rule))" : "var(--md-surface, #e8e2d7)",
                          color: "var(--md-fg)",
                        }}
                      >
                        {o.marketCode} ({o.currencyCode})
                      </span>
                    </td>
                    <td style={{ padding: "14px 12px", color: "var(--md-fg-secondary)" }}>
                      {new Date(o.placedAt).toLocaleDateString()}
                    </td>
                    <td style={{ padding: "14px 12px" }}>{o.email}</td>
                    <td style={{ padding: "14px 12px" }}>{o.items.length} items</td>
                    <td style={{ padding: "14px 12px", fontWeight: 600 }}>{o.formattedTotal}</td>
                    <td style={{ padding: "14px 12px" }}>
                      <span style={{ color: "var(--md-green)", fontWeight: 600 }}>{o.paymentStatus}</span>
                    </td>
                    <td style={{ padding: "14px 12px" }}>
                      <span
                        style={{
                          padding: "2px 8px",
                          borderRadius: 3,
                          fontSize: "0.75rem",
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          background: "var(--md-bg-subtle, var(--md-rule))",
                          color: "var(--md-fg)",
                        }}
                      >
                        {o.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
