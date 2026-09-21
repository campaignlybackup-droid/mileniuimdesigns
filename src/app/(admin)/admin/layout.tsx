import React from "react";
import Link from "next/link";
import { Logo } from "@/components/ui/Logo";

export const metadata = {
  title: "Millennium Designs — Atelier Administration",
  description: "Executive e-commerce administration and currency governance for Millennium Designs.",
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const navItems = [
    { label: "Executive Dashboard", href: "/admin" },
    { label: "✦ CMS & Customization (100+)", href: "/admin/customization" },
    { label: "Catalogue & Products", href: "/admin/products" },
    { label: "Bulk Product Import", href: "/admin/products/import" },
    { label: "Orders & Acquisitions", href: "/admin/orders" },
    { label: "Currency & Markets", href: "/admin/currency" },
  ];

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--md-bg-subtle, #fcfaf5)" }}>
      {/* Sidebar */}
      <aside
        style={{
          width: 260,
          background: "var(--md-bg)",
          borderRight: "1px solid var(--md-rule)",
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
        }}
      >
        {/* Brand Monogram Header */}
        <div
          style={{
            padding: "var(--md-space-5) var(--md-space-6)",
            borderBottom: "1px solid var(--md-rule)",
            display: "flex",
            alignItems: "center",
            gap: "var(--md-space-3)",
          }}
        >
          <Logo variant="monogram" tone="green" size="sm" />
          <div>
            <div style={{ fontFamily: "var(--md-font-display)", fontWeight: 600, fontSize: "1rem" }}>
              MILLENNIUM
            </div>
            <div style={{ fontSize: "0.6875rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--md-fg-muted)" }}>
              Atelier Admin
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav style={{ flex: 1, padding: "var(--md-space-4) var(--md-space-3)" }}>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 4 }}>
            {navItems.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  style={{
                    display: "block",
                    padding: "8px 12px",
                    borderRadius: 4,
                    fontSize: "0.875rem",
                    color: "var(--md-fg)",
                    textDecoration: "none",
                    fontWeight: 500,
                  }}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* Storefront Link Footer */}
        <div style={{ padding: "var(--md-space-4) var(--md-space-6)", borderTop: "1px solid var(--md-rule)" }}>
          <Link
            href="/"
            target="_blank"
            style={{
              fontSize: "0.8125rem",
              color: "var(--md-green)",
              textDecoration: "none",
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontWeight: 500,
            }}
          >
            <span>↗</span> View Live Storefront
          </Link>
        </div>
      </aside>

      {/* Main Content Area */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <header
          style={{
            height: 64,
            background: "var(--md-bg)",
            borderBottom: "1px solid var(--md-rule)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingInline: "var(--md-space-8)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "var(--md-space-3)", fontSize: "0.8125rem", color: "var(--md-fg-secondary)" }}>
            <span>Dual-Market Mode:</span>
            <span style={{ fontWeight: 600, color: "var(--md-green)" }}>IN (INR ₹)</span>
            <span>•</span>
            <span style={{ fontWeight: 600, color: "var(--md-green)" }}>US (USD $)</span>
          </div>

          <div style={{ fontSize: "0.8125rem", color: "var(--md-fg-muted)" }}>
            Staff Role: <strong>Super Administrator</strong>
          </div>
        </header>

        <main style={{ flex: 1, padding: "var(--md-space-8)", overflowY: "auto" }}>
          {children}
        </main>
      </div>
    </div>
  );
}
