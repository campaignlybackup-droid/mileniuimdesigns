"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { getProductFallbackImages } from "@/lib/media/categoryImages";

type ProductRow = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  status: string;
  updatedAt: string;
  primaryCategory: { id: string; name: string; slug: string } | null;
  variants: Array<{
    id: string;
    sku: string;
    grossWeightGrams: number | null;
    prices: Array<{ marketCode: string; currencyCode: string; listMinor: string | number }>;
    inventoryItems: Array<{ onHandQuantity: number; reservedQuantity: number }>;
  }>;
};

type CategoryOption = { id: string; name: string; slug: string };

export default function AdminProductsPage() {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (category && category !== "all") params.set("category", category);
      if (status && status !== "all") params.set("status", status);
      params.set("page", String(page));
      params.set("limit", "50");

      const res = await fetch(`/api/admin/products?${params.toString()}`);
      const data = await res.json();
      if (data.ok) {
        setProducts(data.products);
        setCategories(data.categories || []);
        setTotalCount(data.pagination.total);
        setTotalPages(data.pagination.totalPages);
      }
    } catch (err) {
      console.error("Failed to load products:", err);
    } finally {
      setLoading(false);
    }
  }, [search, category, status, page]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchProducts();
    }, 200);
    return () => clearTimeout(timer);
  }, [fetchProducts]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Top Header & Actions */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 16 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: "1.5rem" }}>💍</span>
            <h1
              style={{
                fontFamily: "var(--md-font-display)",
                fontSize: "1.75rem",
                margin: 0,
                fontWeight: 600,
                color: "#182c23",
              }}
            >
              Product Catalogue
            </h1>
            <span
              style={{
                fontSize: "0.75rem",
                padding: "2px 8px",
                borderRadius: 4,
                background: "#f0ebe1",
                color: "#182c23",
                fontWeight: 600,
              }}
            >
              {totalCount} Active Creations
            </span>
          </div>
          <p style={{ fontSize: "0.85rem", color: "#6e6b63", marginTop: 4, margin: 0 }}>
            Manage product titles, silver weights, independent INR (₹) &amp; USD ($) prices, inventory, and categories.
          </p>
        </div>

        {/* Action Buttons */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <a
            href="/api/admin/products/export"
            download
            style={{
              padding: "9px 16px",
              borderRadius: 6,
              border: "1px solid #d5cfc1",
              background: "#ffffff",
              color: "#182c23",
              fontSize: "0.85rem",
              fontWeight: 600,
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span>⬇</span> Export CSV
          </a>

          <Link
            href="/admin/products/import"
            style={{
              padding: "9px 16px",
              borderRadius: 6,
              border: "1px solid #d5cfc1",
              background: "#ffffff",
              color: "#182c23",
              fontSize: "0.85rem",
              fontWeight: 600,
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span>📦</span> Bulk CSV Import
          </Link>

          <Link
            href="/admin/products/new"
            style={{
              padding: "9px 18px",
              borderRadius: 6,
              border: "none",
              background: "#182c23",
              color: "#ffffff",
              fontSize: "0.85rem",
              fontWeight: 600,
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              boxShadow: "0 2px 6px rgba(24, 44, 35, 0.15)",
            }}
          >
            <span>+</span> Add New Product
          </Link>
        </div>
      </div>

      {/* Filter and Search Toolbar */}
      <div
        style={{
          background: "#ffffff",
          borderRadius: 8,
          border: "1px solid #e7e2d7",
          padding: 16,
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <div style={{ flex: 1, minWidth: 240, position: "relative" }}>
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search by title, SKU, or keywords (e.g. Celestial, MD-RNG)..."
            style={{
              width: "100%",
              padding: "9px 14px 9px 34px",
              borderRadius: 6,
              border: "1px solid #d5cfc1",
              fontSize: "0.875rem",
              outline: "none",
              background: "#faf9f6",
            }}
          />
          <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#8a857b", fontSize: "0.85rem" }}>
            🔍
          </span>
        </div>

        <select
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setPage(1);
          }}
          style={{
            padding: "9px 12px",
            borderRadius: 6,
            border: "1px solid #d5cfc1",
            fontSize: "0.85rem",
            background: "#ffffff",
            outline: "none",
            minWidth: 150,
          }}
        >
          <option value="all">All Categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          style={{
            padding: "9px 12px",
            borderRadius: 6,
            border: "1px solid #d5cfc1",
            fontSize: "0.85rem",
            background: "#ffffff",
            outline: "none",
            minWidth: 130,
          }}
        >
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="draft">Draft</option>
          <option value="archived">Archived</option>
        </select>

        {(search || category !== "all" || status !== "all") && (
          <button
            onClick={() => {
              setSearch("");
              setCategory("all");
              setStatus("all");
              setPage(1);
            }}
            style={{
              padding: "8px 12px",
              borderRadius: 6,
              border: "1px solid #d5cfc1",
              background: "#f4f1ea",
              color: "#555",
              fontSize: "0.8rem",
              cursor: "pointer",
            }}
          >
            Reset Filters
          </button>
        )}
      </div>

      {/* Products Table Card */}
      <section
        style={{
          background: "#ffffff",
          border: "1px solid #e7e2d7",
          borderRadius: 8,
          overflow: "hidden",
          boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
        }}
      >
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #e7e2d7", background: "#faf8f4", textAlign: "left", color: "#6e6b63", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                <th style={{ padding: "12px 16px" }}>Creation</th>
                <th style={{ padding: "12px 14px" }}>SKU</th>
                <th style={{ padding: "12px 14px" }}>Category</th>
                <th style={{ padding: "12px 14px" }}>India (INR ₹)</th>
                <th style={{ padding: "12px 14px" }}>Global (USD $)</th>
                <th style={{ padding: "12px 14px" }}>Stock</th>
                <th style={{ padding: "12px 14px" }}>Status</th>
                <th style={{ padding: "12px 16px", textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} style={{ padding: "48px 16px", textAlign: "center", color: "#8a857b" }}>
                    Loading product catalogue...
                  </td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: "48px 16px", textAlign: "center", color: "#8a857b" }}>
                    No products found matching the criteria.
                  </td>
                </tr>
              ) : (
                products.map((p) => {
                  const variant = p.variants[0];
                  const inrRow = variant?.prices.find((pr) => pr.currencyCode === "INR");
                  const usdRow = variant?.prices.find((pr) => pr.currencyCode === "USD");
                  const inrFormatted = inrRow
                    ? `₹${(Number(inrRow.listMinor) / 100).toLocaleString("en-IN")}`
                    : "—";
                  const usdFormatted = usdRow
                    ? `$${(Number(usdRow.listMinor) / 100).toLocaleString("en-US")}`
                    : "—";
                  const stock = variant?.inventoryItems.reduce((acc, curr) => acc + curr.onHandQuantity, 0) ?? 0;
                  const fallback = getProductFallbackImages(p.slug, p.primaryCategory?.slug);

                  return (
                    <tr
                      key={p.id}
                      style={{
                        borderBottom: "1px solid #f0ebe1",
                        transition: "background 0.15s ease",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "#faf8f4")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <td style={{ padding: "12px 16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <div
                            style={{
                              position: "relative",
                              width: 44,
                              height: 52,
                              background: "#f4f1ea",
                              borderRadius: 4,
                              flexShrink: 0,
                              overflow: "hidden",
                              border: "1px solid #e7e2d7",
                            }}
                          >
                            <Image src={fallback.primary} alt={p.title} fill sizes="44px" style={{ objectFit: "cover" }} />
                          </div>
                          <div>
                            <Link
                              href={`/admin/products/${p.id}`}
                              style={{ fontWeight: 600, color: "#182c23", textDecoration: "none" }}
                            >
                              {p.title}
                            </Link>
                            <div style={{ fontSize: "0.75rem", color: "#8a857b", marginTop: 2 }}>{p.slug}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: "12px 14px", fontFamily: "monospace", fontSize: "0.8rem", color: "#444" }}>
                        {variant?.sku ?? "—"}
                      </td>
                      <td style={{ padding: "12px 14px", color: "#444" }}>
                        {p.primaryCategory?.name ?? "General"}
                      </td>
                      <td style={{ padding: "12px 14px", fontWeight: 700, color: "#182c23" }}>
                        {inrFormatted}
                      </td>
                      <td style={{ padding: "12px 14px", fontWeight: 700, color: "#182c23" }}>
                        {usdFormatted}
                      </td>
                      <td style={{ padding: "12px 14px" }}>
                        <span
                          style={{
                            fontWeight: stock <= 2 ? 700 : 500,
                            color: stock <= 0 ? "#b91c1c" : stock <= 2 ? "#b45309" : "#166534",
                          }}
                        >
                          {stock} in stock
                        </span>
                      </td>
                      <td style={{ padding: "12px 14px" }}>
                        <span
                          style={{
                            padding: "3px 8px",
                            borderRadius: 4,
                            fontSize: "0.7rem",
                            fontWeight: 600,
                            textTransform: "uppercase",
                            background: p.status === "active" ? "#dcfce7" : p.status === "draft" ? "#fef3c7" : "#f3f4f6",
                            color: p.status === "active" ? "#15803d" : p.status === "draft" ? "#b45309" : "#4b5563",
                          }}
                        >
                          {p.status}
                        </span>
                      </td>
                      <td style={{ padding: "12px 16px", textAlign: "right" }}>
                        <div style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                          <Link
                            href={`/admin/products/${p.id}`}
                            style={{
                              padding: "4px 10px",
                              borderRadius: 4,
                              border: "1px solid #d5cfc1",
                              background: "#ffffff",
                              color: "#182c23",
                              fontSize: "0.75rem",
                              fontWeight: 600,
                              textDecoration: "none",
                            }}
                          >
                            Edit
                          </Link>
                          <Link
                            href={`/us/products/${p.slug}`}
                            target="_blank"
                            title="View on live storefront"
                            style={{
                              padding: "4px 8px",
                              borderRadius: 4,
                              background: "#f4f1ea",
                              color: "#6e6b63",
                              fontSize: "0.75rem",
                              textDecoration: "none",
                            }}
                          >
                            ↗
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination bar */}
        {totalPages > 1 && (
          <div
            style={{
              padding: "12px 16px",
              borderTop: "1px solid #e7e2d7",
              background: "#faf8f4",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: "0.8rem",
              color: "#6e6b63",
            }}
          >
            <div>
              Page <strong>{page}</strong> of <strong>{totalPages}</strong> ({totalCount} items)
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                style={{
                  padding: "4px 10px",
                  borderRadius: 4,
                  border: "1px solid #d5cfc1",
                  background: page <= 1 ? "#f4f1ea" : "#ffffff",
                  cursor: page <= 1 ? "not-allowed" : "pointer",
                }}
              >
                Previous
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                style={{
                  padding: "4px 10px",
                  borderRadius: 4,
                  border: "1px solid #d5cfc1",
                  background: page >= totalPages ? "#f4f1ea" : "#ffffff",
                  cursor: page >= totalPages ? "not-allowed" : "pointer",
                }}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
