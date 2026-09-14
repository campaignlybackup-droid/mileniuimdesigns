import React from "react";
import Link from "next/link";
import Image from "next/image";
import { listAdminCatalogProducts } from "@/lib/catalog/products";
import { formatMoney, money } from "@/lib/money";
import { getProductFallbackImages } from "@/lib/media/categoryImages";
import { Button } from "@/components/ui/Button";

export const dynamic = "force-dynamic";

export default async function AdminProductsPage() {
  const products = await listAdminCatalogProducts(100);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--md-space-8)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
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
            Product Catalogue
          </h1>
          <p style={{ fontSize: "0.875rem", color: "var(--md-fg-muted)", marginTop: 4 }}>
            Review and govern luxury creations, independent INR/USD prices, and stock allocations.
          </p>
        </div>

        <Link href="/admin/products/import">
          <Button variant="primary" size="md">
            + Bulk Import CSV
          </Button>
        </Link>
      </div>

      <section
        style={{
          background: "var(--md-bg)",
          border: "1px solid var(--md-rule)",
          borderRadius: 6,
          padding: "var(--md-space-6)",
        }}
      >
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--md-rule)", textAlign: "left", color: "var(--md-fg-muted)" }}>
                <th style={{ padding: "10px 12px" }}>Product</th>
                <th style={{ padding: "10px 12px" }}>SKU</th>
                <th style={{ padding: "10px 12px" }}>Category</th>
                <th style={{ padding: "10px 12px" }}>India (INR ₹)</th>
                <th style={{ padding: "10px 12px" }}>Global (USD $)</th>
                <th style={{ padding: "10px 12px" }}>Stock</th>
                <th style={{ padding: "10px 12px" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const variant = p.variants[0];
                const inrPriceRow = variant?.prices.find((pr) => pr.currencyCode === "INR");
                const usdPriceRow = variant?.prices.find((pr) => pr.currencyCode === "USD");
                const inrDisplay = inrPriceRow
                  ? formatMoney(money(inrPriceRow.listMinor, "INR"), { locale: "en-IN" })
                  : "—";
                const usdDisplay = usdPriceRow
                  ? formatMoney(money(usdPriceRow.listMinor, "USD"), { locale: "en-US" })
                  : "—";
                const stock = variant?.inventoryItems.reduce((acc, curr) => acc + curr.onHandQuantity, 0) ?? 0;
                const fallback = getProductFallbackImages(p.slug, p.primaryCategory?.slug);

                return (
                  <tr key={p.id} style={{ borderBottom: "1px solid var(--md-rule)" }}>
                    <td style={{ padding: "12px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "var(--md-space-3)" }}>
                        <div
                          style={{
                            position: "relative",
                            width: 44,
                            height: 52,
                            background: "var(--md-surface, #f5f2eb)",
                            flexShrink: 0,
                            overflow: "hidden",
                          }}
                        >
                          <Image src={fallback.primary} alt={p.title} fill sizes="44px" style={{ objectFit: "cover" }} />
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, color: "var(--md-fg)" }}>{p.title}</div>
                          <div style={{ fontSize: "0.75rem", color: "var(--md-fg-muted)" }}>{p.slug}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: "12px", fontFamily: "monospace", fontSize: "0.8125rem" }}>
                      {variant?.sku ?? "—"}
                    </td>
                    <td style={{ padding: "12px" }}>{p.primaryCategory?.name ?? "General"}</td>
                    <td style={{ padding: "12px", fontWeight: 600, color: "var(--md-fg)" }}>{inrDisplay}</td>
                    <td style={{ padding: "12px", fontWeight: 600, color: "var(--md-fg)" }}>{usdDisplay}</td>
                    <td style={{ padding: "12px" }}>
                      <span style={{ fontWeight: stock <= 2 ? 700 : 400, color: stock <= 2 ? "var(--md-sold)" : "var(--md-fg)" }}>
                        {stock} units
                      </span>
                    </td>
                    <td style={{ padding: "12px" }}>
                      <span
                        style={{
                          padding: "2px 8px",
                          borderRadius: 3,
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          background: p.status === "active" ? "var(--md-bg-subtle, var(--md-rule))" : "transparent",
                          color: p.status === "active" ? "var(--md-green)" : "var(--md-fg-muted)",
                        }}
                      >
                        {p.status.toUpperCase()}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
