"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";

type CategoryItem = {
  id: string;
  name: string;
  slug: string;
  rank: number;
  isPublished: boolean;
  skuToken: string | null;
  productCount: number;
  updatedAt: string;
};

export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // New Category Form Modal / Drawer State
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [skuToken, setSkuToken] = useState("");
  const [rank, setRank] = useState("0");
  const [isPublished, setIsPublished] = useState(true);
  const [description, setDescription] = useState("");

  async function loadCategories() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/categories");
      const data = await res.json();
      if (data.ok) {
        setCategories(data.categories);
      }
    } catch (err) {
      console.error("Failed to load categories:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadCategories();
  }, []);

  function openCreateModal() {
    setEditingId(null);
    setName("");
    setSlug("");
    setSkuToken("");
    setRank("0");
    setIsPublished(true);
    setDescription("");
    setShowModal(true);
  }

  async function openEditModal(cat: CategoryItem) {
    setEditingId(cat.id);
    setName(cat.name);
    setSlug(cat.slug);
    setSkuToken(cat.skuToken || "");
    setRank(String(cat.rank));
    setIsPublished(cat.isPublished);

    try {
      const res = await fetch(`/api/admin/categories/${cat.id}`);
      const data = await res.json();
      if (data.ok) {
        setDescription(data.category.description || "");
      }
    } catch {
      setDescription("");
    }

    setShowModal(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      const url = editingId ? `/api/admin/categories/${editingId}` : "/api/admin/categories";
      const method = editingId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          slug,
          skuToken,
          rank: parseInt(rank, 10) || 0,
          isPublished,
          description,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save category");

      setSuccess(editingId ? "Category updated successfully!" : "Category created successfully!");
      setShowModal(false);
      void loadCategories();
      setTimeout(() => setSuccess(null), 3500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error saving category");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(cat: CategoryItem) {
    if (!confirm(`Are you sure you want to archive category "${cat.name}"?`)) return;

    try {
      const res = await fetch(`/api/admin/categories/${cat.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to archive");
      void loadCategories();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Error archiving category");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 16 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: "1.5rem" }}>🏷️</span>
            <h1
              style={{
                fontFamily: "var(--md-font-display)",
                fontSize: "1.75rem",
                margin: 0,
                fontWeight: 600,
                color: "#182c23",
              }}
            >
              Categories Management
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
              {categories.length} Categories
            </span>
          </div>
          <p style={{ fontSize: "0.85rem", color: "#6e6b63", marginTop: 4, margin: 0 }}>
            Govern jewellery classification, navigation paths, category descriptions, and SKU prefixes.
          </p>
        </div>

        <button
          onClick={openCreateModal}
          style={{
            padding: "9px 18px",
            borderRadius: 6,
            border: "none",
            background: "#182c23",
            color: "#ffffff",
            fontSize: "0.85rem",
            fontWeight: 600,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            boxShadow: "0 2px 6px rgba(24, 44, 35, 0.15)",
          }}
        >
          <span>+</span> Add New Category
        </button>
      </div>

      {success && (
        <div style={{ padding: "12px 16px", borderRadius: 6, background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#166534", fontSize: "0.85rem" }}>
          {success}
        </div>
      )}

      {/* Table Card */}
      <section
        style={{
          background: "#ffffff",
          border: "1px solid #e7e2d7",
          borderRadius: 8,
          overflow: "hidden",
          boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #e7e2d7", background: "#faf8f4", textAlign: "left", color: "#6e6b63", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              <th style={{ padding: "12px 16px" }}>Category Name</th>
              <th style={{ padding: "12px 14px" }}>Slug / URL</th>
              <th style={{ padding: "12px 14px" }}>SKU Prefix</th>
              <th style={{ padding: "12px 14px" }}>Rank</th>
              <th style={{ padding: "12px 14px" }}>Products</th>
              <th style={{ padding: "12px 14px" }}>Status</th>
              <th style={{ padding: "12px 16px", textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} style={{ padding: "40px", textAlign: "center", color: "#8a857b" }}>
                  Loading categories...
                </td>
              </tr>
            ) : categories.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: "40px", textAlign: "center", color: "#8a857b" }}>
                  No categories found. Click "+ Add New Category" to create one.
                </td>
              </tr>
            ) : (
              categories.map((cat) => (
                <tr
                  key={cat.id}
                  style={{ borderBottom: "1px solid #f0ebe1", transition: "background 0.15s ease" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#faf8f4")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <td style={{ padding: "14px 16px", fontWeight: 600, color: "#182c23" }}>
                    {cat.name}
                  </td>
                  <td style={{ padding: "14px 14px", fontFamily: "monospace", fontSize: "0.8rem", color: "#6e6b63" }}>
                    /{cat.slug}
                  </td>
                  <td style={{ padding: "14px 14px", fontFamily: "monospace", fontWeight: 600, color: "#182c23" }}>
                    {cat.skuToken || "—"}
                  </td>
                  <td style={{ padding: "14px 14px", color: "#444" }}>
                    {cat.rank}
                  </td>
                  <td style={{ padding: "14px 14px" }}>
                    <span style={{ fontWeight: 600, color: "#182c23" }}>{cat.productCount}</span> creations
                  </td>
                  <td style={{ padding: "14px 14px" }}>
                    <span
                      style={{
                        padding: "3px 8px",
                        borderRadius: 4,
                        fontSize: "0.7rem",
                        fontWeight: 600,
                        textTransform: "uppercase",
                        background: cat.isPublished ? "#dcfce7" : "#fef3c7",
                        color: cat.isPublished ? "#15803d" : "#b45309",
                      }}
                    >
                      {cat.isPublished ? "Published" : "Draft"}
                    </span>
                  </td>
                  <td style={{ padding: "14px 16px", textAlign: "right" }}>
                    <div style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                      <button
                        onClick={() => openEditModal(cat)}
                        style={{
                          padding: "4px 10px",
                          borderRadius: 4,
                          border: "1px solid #d5cfc1",
                          background: "#ffffff",
                          color: "#182c23",
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        Edit
                      </button>
                      <Link
                        href={`/us/${cat.slug}`}
                        target="_blank"
                        title="View category page on live site"
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
                      <button
                        onClick={() => handleDelete(cat)}
                        style={{
                          padding: "4px 8px",
                          borderRadius: 4,
                          border: "1px solid #fecaca",
                          background: "#fef2f2",
                          color: "#b91c1c",
                          fontSize: "0.75rem",
                          cursor: "pointer",
                        }}
                      >
                        Archive
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      {/* Modal Dialog for Create & Edit */}
      {showModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            padding: 16,
          }}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: 12,
              padding: 28,
              width: "100%",
              maxWidth: 520,
              boxShadow: "0 20px 40px rgba(0,0,0,0.15)",
              display: "flex",
              flexDirection: "column",
              gap: 20,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 600, color: "#182c23" }}>
                {editingId ? "Edit Category" : "Add New Category"}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                style={{ border: "none", background: "transparent", fontSize: "1.2rem", cursor: "pointer", color: "#6e6b63" }}
              >
                ✕
              </button>
            </div>

            {error && (
              <div style={{ padding: "10px 14px", borderRadius: 6, background: "#fdf2f2", color: "#991b1b", fontSize: "0.85rem" }}>
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#444", marginBottom: 6 }}>
                  Category Name *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (!editingId && !slug) {
                      setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
                    }
                  }}
                  required
                  placeholder="e.g. Brooches & Pins"
                  style={{ width: "100%", padding: "9px 12px", borderRadius: 6, border: "1px solid #d5cfc1", fontSize: "0.9rem" }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#444", marginBottom: 6 }}>
                    URL Slug
                  </label>
                  <input
                    type="text"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    placeholder="brooches"
                    style={{ width: "100%", padding: "9px 12px", borderRadius: 6, border: "1px solid #d5cfc1", fontSize: "0.85rem" }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#444", marginBottom: 6 }}>
                    SKU Prefix (3 letters)
                  </label>
                  <input
                    type="text"
                    maxLength={3}
                    value={skuToken}
                    onChange={(e) => setSkuToken(e.target.value.toUpperCase())}
                    placeholder="BRC"
                    style={{ width: "100%", padding: "9px 12px", borderRadius: 6, border: "1px solid #d5cfc1", fontSize: "0.85rem", textTransform: "uppercase" }}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#444", marginBottom: 6 }}>
                    Display Rank
                  </label>
                  <input
                    type="number"
                    value={rank}
                    onChange={(e) => setRank(e.target.value)}
                    style={{ width: "100%", padding: "9px 12px", borderRadius: 6, border: "1px solid #d5cfc1", fontSize: "0.85rem" }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#444", marginBottom: 6 }}>
                    Visibility
                  </label>
                  <select
                    value={isPublished ? "true" : "false"}
                    onChange={(e) => setIsPublished(e.target.value === "true")}
                    style={{ width: "100%", padding: "9px 12px", borderRadius: 6, border: "1px solid #d5cfc1", fontSize: "0.85rem", background: "#fff" }}
                  >
                    <option value="true">Published</option>
                    <option value="false">Draft (Unpublished)</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#444", marginBottom: 6 }}>
                  Category Description / Editorial Hook
                </label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Masterfully hand-finished pure 925 sterling silver..."
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 6, border: "1px solid #d5cfc1", fontSize: "0.85rem", fontFamily: "inherit" }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 10 }}>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  style={{ padding: "9px 16px", borderRadius: 6, border: "1px solid #d5cfc1", background: "#ffffff", color: "#6e6b63", fontSize: "0.85rem", cursor: "pointer" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  style={{ padding: "9px 20px", borderRadius: 6, border: "none", background: "#182c23", color: "#ffffff", fontSize: "0.85rem", fontWeight: 600, cursor: saving ? "wait" : "pointer" }}
                >
                  {saving ? "Saving..." : editingId ? "Update Category" : "Create Category"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
