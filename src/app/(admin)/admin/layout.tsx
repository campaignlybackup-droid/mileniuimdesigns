import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/ui/Logo";
import { getStaffActor } from "@/lib/auth/actor";
import { db } from "@/lib/db/client";
import { AdminSignOutButton } from "@/components/admin/AdminSignOutButton";

export const metadata = {
  title: "Millennium Designs — Store Administration",
  description: "Executive e-commerce administration and currency governance for Millennium Designs.",
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const staff = await getStaffActor();

  // Airtight security guard: redirect immediately if not authenticated
  if (!staff) {
    redirect("/admin/login");
  }

  const staffUser = await db.user.findUnique({
    where: { id: staff.userId },
    select: { email: true, firstName: true, lastName: true },
  }).catch(() => null);

  const navItems = [
    { label: "Executive Dashboard", href: "/admin", icon: "📊" },
    { label: "Daily Silver & Bulk Pricing", href: "/admin/pricing", icon: "💎", badge: "Daily Silver" },
    { label: "Product Catalogue", href: "/admin/products", icon: "💍" },
    { label: "Categories", href: "/admin/categories", icon: "🏷️" },
    { label: "Collections", href: "/admin/collections", icon: "⚜️" },
    { label: "Bulk Product Import", href: "/admin/products/import", icon: "📦" },
    { label: "CMS & Customization (100+)", href: "/admin/customization", icon: "✦" },
    { label: "Orders & Acquisitions", href: "/admin/orders", icon: "🛍️" },
    { label: "Currency & Markets", href: "/admin/currency", icon: "🌐" },
  ];

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--md-bg-subtle, #fcfaf5)" }}>
      {/* Sidebar */}
      <aside
        style={{
          width: 270,
          background: "var(--md-bg, #ffffff)",
          borderRight: "1px solid var(--md-rule, #e7e2d7)",
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
        }}
      >
        {/* Brand Monogram Header */}
        <div
          style={{
            padding: "var(--md-space-5, 20px) var(--md-space-6, 24px)",
            borderBottom: "1px solid var(--md-rule, #e7e2d7)",
            display: "flex",
            alignItems: "center",
            gap: "var(--md-space-3, 12px)",
          }}
        >
          <Logo variant="monogram" tone="green" size="sm" />
          <div>
            <div style={{ fontFamily: "var(--md-font-display)", fontWeight: 600, fontSize: "1rem", color: "#182c23" }}>
              MILLENNIUM
            </div>
            <div style={{ fontSize: "0.6875rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--md-fg-muted, #6e6b63)" }}>
              Admin Portal
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav style={{ flex: 1, padding: "16px 12px", overflowY: "auto" }}>
          <div style={{ fontSize: "0.6875rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#8a857b", padding: "0 8px 8px 8px" }}>
            Management
          </div>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 4 }}>
            {navItems.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "9px 12px",
                    borderRadius: 6,
                    fontSize: "0.85rem",
                    color: item.badge ? "#182c23" : "var(--md-fg, #222)",
                    textDecoration: "none",
                    fontWeight: item.badge ? 600 : 500,
                    background: item.badge ? "rgba(24, 44, 35, 0.05)" : "transparent",
                    transition: "all 0.15s ease",
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: "1rem" }}>{item.icon}</span>
                    <span>{item.label}</span>
                  </span>
                  {item.badge && (
                    <span
                      style={{
                        fontSize: "0.65rem",
                        padding: "2px 6px",
                        borderRadius: 4,
                        background: "#182c23",
                        color: "#ffffff",
                        fontWeight: 600,
                        textTransform: "uppercase",
                      }}
                    >
                      Active
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* Authenticated Staff Card & Storefront Link Footer */}
        <div style={{ padding: "16px", borderTop: "1px solid var(--md-rule, #e7e2d7)", background: "#faf8f4", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "#182c23", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {staffUser?.email || "Admin User"}
              </div>
              <div style={{ fontSize: "0.65rem", color: "#6e6b63", textTransform: "capitalize" }}>
                Role: {staff.roles.join(", ")}
              </div>
            </div>
            <AdminSignOutButton />
          </div>

          <Link
            href="/"
            target="_blank"
            style={{
              fontSize: "0.75rem",
              color: "var(--md-green, #182c23)",
              textDecoration: "none",
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontWeight: 500,
              paddingTop: 6,
              borderTop: "1px dashed #e0dad0",
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
            background: "var(--md-bg, #ffffff)",
            borderBottom: "1px solid var(--md-rule, #e7e2d7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingInline: "var(--md-space-8, 32px)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "var(--md-space-3, 12px)", fontSize: "0.8125rem", color: "var(--md-fg-secondary, #555)" }}>
            <span style={{ fontWeight: 500 }}>Markets:</span>
            <span style={{ fontWeight: 600, color: "#182c23", background: "#f0ebe1", padding: "2px 8px", borderRadius: 4 }}>IN (INR ₹)</span>
            <span>•</span>
            <span style={{ fontWeight: 600, color: "#182c23", background: "#f0ebe1", padding: "2px 8px", borderRadius: 4 }}>US (USD $)</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <span
              style={{
                fontSize: "0.75rem",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "3px 10px",
                borderRadius: 999,
                background: "#e8f5e9",
                color: "#2e7d32",
                fontWeight: 600,
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#2e7d32" }}></span>
              Authenticated Session
            </span>
          </div>
        </header>

        <main style={{ flex: 1, padding: "var(--md-space-8, 32px)", overflowY: "auto" }}>
          {children}
        </main>
      </div>
    </div>
  );
}
