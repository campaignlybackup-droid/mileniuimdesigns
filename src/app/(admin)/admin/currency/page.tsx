import React from "react";
import { listAdminCurrenciesAndMarkets } from "@/lib/market";
import { formatMoney, money } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function AdminCurrencyPage() {
  const { currencies, markets } = await listAdminCurrenciesAndMarkets();

  // Sample prices in INR and USD
  const sampleInr = money(10000000n, "INR"); // ₹1,00,000.00
  const sampleUsd = money(125000n, "USD");   // $1,250.00

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
          Currency & Multi-Market Governance
        </h1>
        <p style={{ fontSize: "0.875rem", color: "var(--md-fg-muted)", marginTop: 4 }}>
          Manage market currency enablement, formatting standards, and independent manual pricing policies.
        </p>
      </div>

      {/* Core Architectural Rule Banner */}
      <div
        style={{
          background: "var(--md-bg)",
          border: "1px solid var(--md-green)",
          borderRadius: 6,
          padding: "var(--md-space-5) var(--md-space-6)",
          display: "flex",
          alignItems: "flex-start",
          gap: "var(--md-space-4)",
        }}
      >
        <span style={{ fontSize: "1.5rem" }}>⚖️</span>
        <div>
          <h3 style={{ margin: "0 0 4px", fontSize: "0.9375rem", fontWeight: 600, color: "var(--md-fg)" }}>
            Strict Dual-Market Independent Pricing Policy (Prompt §5 & §30)
          </h3>
          <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--md-fg-secondary)", lineHeight: 1.5 }}>
            Prices in <strong>INR (₹)</strong> and <strong>USD ($)</strong> are independent commercial values entered separately by the brand. <strong>Live FX automated conversions are strictly forbidden</strong> across the platform to ensure custom duties, international logistics, and market positioning are preserved without arbitrary price fluctuations.
          </p>
        </div>
      </div>

      {/* Enabled Currencies Table */}
      <section
        style={{
          background: "var(--md-bg)",
          border: "1px solid var(--md-rule)",
          borderRadius: 6,
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
          Active Currencies
        </h2>

        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--md-rule)", textAlign: "left", color: "var(--md-fg-muted)" }}>
              <th style={{ padding: "8px 12px" }}>ISO Code</th>
              <th style={{ padding: "8px 12px" }}>Name</th>
              <th style={{ padding: "8px 12px" }}>Symbol</th>
              <th style={{ padding: "8px 12px" }}>Minor Decimals</th>
              <th style={{ padding: "8px 12px" }}>Format Example</th>
              <th style={{ padding: "8px 12px" }}>Manual Override</th>
              <th style={{ padding: "8px 12px" }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {currencies.map((c) => (
              <tr key={c.code} style={{ borderBottom: "1px solid var(--md-rule)" }}>
                <td style={{ padding: "12px", fontWeight: 700 }}>{c.code}</td>
                <td style={{ padding: "12px" }}>{c.name}</td>
                <td style={{ padding: "12px", fontSize: "1.125rem" }}>{c.symbol}</td>
                <td style={{ padding: "12px" }}>{c.minorUnit} decimals</td>
                <td style={{ padding: "12px", fontFamily: "var(--md-font-sans)", fontWeight: 500 }}>
                  {c.code === "INR"
                    ? formatMoney(sampleInr, { locale: "en-IN" })
                    : formatMoney(sampleUsd, { locale: "en-US" })}
                </td>
                <td style={{ padding: "12px" }}>
                  <span style={{ color: "var(--md-green)", fontWeight: 600 }}>Enabled (Per-Product)</span>
                </td>
                <td style={{ padding: "12px" }}>
                  <span
                    style={{
                      padding: "2px 8px",
                      borderRadius: 3,
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      background: c.isActive ? "var(--md-bg-subtle, var(--md-rule))" : "transparent",
                      color: c.isActive ? "var(--md-green)" : "var(--md-fg-muted)",
                    }}
                  >
                    {c.isActive ? "Active" : "Disabled"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Market Routing & Currency Assignment */}
      <section
        style={{
          background: "var(--md-bg)",
          border: "1px solid var(--md-rule)",
          borderRadius: 6,
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
          Market Route Binding
        </h2>

        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--md-rule)", textAlign: "left", color: "var(--md-fg-muted)" }}>
              <th style={{ padding: "8px 12px" }}>Market</th>
              <th style={{ padding: "8px 12px" }}>Route URL</th>
              <th style={{ padding: "8px 12px" }}>Bound Currency</th>
              <th style={{ padding: "8px 12px" }}>Locale Format</th>
              <th style={{ padding: "8px 12px" }}>Tax Mode</th>
              <th style={{ padding: "8px 12px" }}>Payment Provider</th>
            </tr>
          </thead>
          <tbody>
            {markets.map((m) => (
              <tr key={m.code} style={{ borderBottom: "1px solid var(--md-rule)" }}>
                <td style={{ padding: "12px", fontWeight: 600 }}>{m.name} ({m.code})</td>
                <td style={{ padding: "12px", fontFamily: "monospace" }}>{m.code === "US" ? "/" : `/${m.code.toLowerCase()}`}</td>
                <td style={{ padding: "12px", fontWeight: 700, color: "var(--md-green)" }}>{m.currencyCode}</td>
                <td style={{ padding: "12px" }}>{m.locale}</td>
                <td style={{ padding: "12px" }}>{m.pricesIncludeTax ? "Tax Inclusive (MRP)" : "Tax Calculated at Checkout"}</td>
                <td style={{ padding: "12px", fontWeight: 500 }}>
                  {m.code === "IN" ? "Razorpay (UPI / Cards / NetBanking)" : "Stripe (International Credit Cards)"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
