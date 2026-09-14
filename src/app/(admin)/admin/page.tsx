import React from "react";
import Link from "next/link";
import { getDashboardMetrics } from "@/lib/reporting/dashboard";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const { inrKpi, usdKpi, totalCustomers, lowStockCount, recentOrders } = await getDashboardMetrics();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--md-space-8)" }}>
      {/* Title */}
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
          Executive Overview
        </h1>
        <p style={{ fontSize: "0.875rem", color: "var(--md-fg-muted)", marginTop: 4 }}>
          Real-time performance across India (INR) and International (USD) markets.
        </p>
      </div>

      {/* KPI Cards Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: "var(--md-space-6)",
        }}
      >
        {/* INR Revenue Card */}
        <div
          style={{
            background: "var(--md-bg)",
            border: "1px solid var(--md-rule)",
            padding: "var(--md-space-6)",
            borderRadius: 6,
          }}
        >
          <div style={{ fontSize: "0.75rem", color: "var(--md-fg-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            India Revenue (INR ₹)
          </div>
          <div
            style={{
              fontFamily: "var(--md-font-display)",
              fontSize: "2rem",
              fontWeight: 600,
              color: "var(--md-fg)",
              marginBlock: "var(--md-space-2)",
            }}
          >
            {inrKpi.formattedRevenue}
          </div>
          <div style={{ fontSize: "0.8125rem", color: "var(--md-fg-secondary)" }}>
            {inrKpi.orderCount} orders • AOV: <strong>{inrKpi.formattedAov}</strong>
          </div>
        </div>

        {/* USD Revenue Card */}
        <div
          style={{
            background: "var(--md-bg)",
            border: "1px solid var(--md-rule)",
            padding: "var(--md-space-6)",
            borderRadius: 6,
          }}
        >
          <div style={{ fontSize: "0.75rem", color: "var(--md-fg-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            US & Global Revenue (USD $)
          </div>
          <div
            style={{
              fontFamily: "var(--md-font-display)",
              fontSize: "2rem",
              fontWeight: 600,
              color: "var(--md-fg)",
              marginBlock: "var(--md-space-2)",
            }}
          >
            {usdKpi.formattedRevenue}
          </div>
          <div style={{ fontSize: "0.8125rem", color: "var(--md-fg-secondary)" }}>
            {usdKpi.orderCount} orders • AOV: <strong>{usdKpi.formattedAov}</strong>
          </div>
        </div>

        {/* Customers Count */}
        <div
          style={{
            background: "var(--md-bg)",
            border: "1px solid var(--md-rule)",
            padding: "var(--md-space-6)",
            borderRadius: 6,
          }}
        >
          <div style={{ fontSize: "0.75rem", color: "var(--md-fg-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Registered Clients
          </div>
          <div
            style={{
              fontFamily: "var(--md-font-display)",
              fontSize: "2rem",
              fontWeight: 600,
              color: "var(--md-fg)",
              marginBlock: "var(--md-space-2)",
            }}
          >
            {totalCustomers}
          </div>
          <div style={{ fontSize: "0.8125rem", color: "var(--md-fg-secondary)" }}>
            Private clients with saved addresses & orders
          </div>
        </div>

        {/* Inventory Alert */}
        <div
          style={{
            background: "var(--md-bg)",
            border: "1px solid var(--md-rule)",
            padding: "var(--md-space-6)",
            borderRadius: 6,
          }}
        >
          <div style={{ fontSize: "0.75rem", color: "var(--md-fg-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Inventory Watchlist
          </div>
          <div
            style={{
              fontFamily: "var(--md-font-display)",
              fontSize: "2rem",
              fontWeight: 600,
              color: lowStockCount > 0 ? "var(--md-gold, #c49a45)" : "var(--md-fg)",
              marginBlock: "var(--md-space-2)",
            }}
          >
            {lowStockCount} items
          </div>
          <div style={{ fontSize: "0.8125rem", color: "var(--md-fg-secondary)" }}>
            Low stock / one-of-a-kind pieces
          </div>
        </div>
      </div>

      {/* Recent Orders Section */}
      <section
        style={{
          background: "var(--md-bg)",
          border: "1px solid var(--md-rule)",
          borderRadius: 6,
          padding: "var(--md-space-6)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "var(--md-space-5)",
          }}
        >
          <h2
            style={{
              fontFamily: "var(--md-font-display)",
              fontSize: "1.375rem",
              margin: 0,
              color: "var(--md-fg)",
            }}
          >
            Recent Acquisitions ({recentOrders.length})
          </h2>
          <Link
            href="/admin/orders"
            style={{ fontSize: "0.8125rem", color: "var(--md-green)", textDecoration: "none", fontWeight: 500 }}
          >
            View All Orders →
          </Link>
        </div>

        {recentOrders.length === 0 ? (
          <p style={{ color: "var(--md-fg-muted)", fontSize: "0.875rem", margin: 0 }}>
            No customer orders placed yet.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--md-rule)", textAlign: "left", color: "var(--md-fg-muted)" }}>
                  <th style={{ padding: "8px 12px" }}>Order</th>
                  <th style={{ padding: "8px 12px" }}>Market</th>
                  <th style={{ padding: "8px 12px" }}>Date</th>
                  <th style={{ padding: "8px 12px" }}>Customer</th>
                  <th style={{ padding: "8px 12px" }}>Total</th>
                  <th style={{ padding: "8px 12px" }}>Payment</th>
                  <th style={{ padding: "8px 12px" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((o) => (
                  <tr key={o.id} style={{ borderBottom: "1px solid var(--md-rule)" }}>
                    <td style={{ padding: "12px", fontWeight: 600 }}>{o.orderNumber}</td>
                    <td style={{ padding: "12px" }}>
                      <span
                        style={{
                          padding: "2px 6px",
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
                    <td style={{ padding: "12px", color: "var(--md-fg-secondary)" }}>
                      {new Date(o.placedAt).toLocaleDateString()}
                    </td>
                    <td style={{ padding: "12px" }}>{o.email}</td>
                    <td style={{ padding: "12px", fontWeight: 600 }}>{o.formattedTotal}</td>
                    <td style={{ padding: "12px" }}>
                      <span style={{ color: "var(--md-green)", fontWeight: 600 }}>{o.paymentStatus}</span>
                    </td>
                    <td style={{ padding: "12px" }}>{o.status}</td>
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
