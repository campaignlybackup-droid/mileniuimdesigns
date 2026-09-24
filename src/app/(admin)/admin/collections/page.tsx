"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";

type CollectionItem = {
  id: string;
  title: string;
  slug: string;
  rank: number;
  isPublished: boolean;
  productCount: number;
  updatedAt: string;
};

type ProductMinimal = { id: string; title: string; slug: string };

export default function AdminCollectionsPage() {
  const [collections, setCollections] = useState<CollectionItem[]>([]);
  const [allProducts, setAllProducts] = useState<ProductMinimal[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [rank, setRank] = useState("0");
  const [isPublished, setIsPublished] = useState(true);
  const [description, setDescription] = useState("");
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);

  async function loadCollections() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/collections");
      const data = await res.json();
      if (data.ok) {
        setCollections(data.collections);
      }
    } catch (err) {
      console.error("Failed to load collections:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadCollections();
  }, []);

  async function openCreateModal() {
    setEditingId(null);
    setTitle("");
    setSlug("");
    setRank("0");
    setIsPublished(true);
    setDescription("");
    setSelectedProductIds([]);

    try {
      const pRes = await fetch("/api/admin/products?limit=100");
      const pData = await pRes.json();
      if (pData.ok) {
        setAllProducts(pData.products.map((p: { id: string; title: string; slug: string }) => ({ id: p.id, title: p.title, slug: p.slug })));
      }
    } catch {
      // fallback
    }

    setShowModal(true);
  }

  async function openEditModal(col: CollectionItem) {
    setEditingId(col.id);
    setTitle(col.title);
    setSlug(col.slug);
    setRank(String(col.rank));
    setIsPublished(col.isPublished);

    try {
      const res = await fetch(`/api/admin/collections/${col.id}`);
      const data = await res.json();
      if (data.ok) {
        setDescription(data.collection.description || "");
        setSelectedProductIds(data.collection.productIds || []);
        if (data.availableProducts) setAllProducts(data.availableProducts);
      }
    } catch {
      setDescription("");
    }

    setShowModal(true);
  }

  function toggleProduct(pid: string) {
    setSelectedProductIds((prev) =>
      prev.includes(pid) ? prev.filter((p) => p !== pid) : [...prev, pid],
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      const url = editingId ? `/api/admin/collections/${editingId}` : "/api/admin/collections";
      const method = editingId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          slug,
          rank: parseInt(rank, 10) || 0,
          isPublished,
          description,
          productIds: selectedProductIds,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save collection");

      setSuccess(editingId ? "Collection updated successfully!" : "Collection created successfully!");
      setShowModal(false);
      void loadCollections();
      setTimeout(() => setSuccess(null), 3500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error saving collection");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(col: CollectionItem) {
    if (!confirm(`Are you sure you want to archive collection "${col.title}"?`)) return;

    try {
      const res = await fetch(`/api/admin/collections/${col.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to archive");
      void loadCollections();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Error archiving collection");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 16 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: "1.5rem" }}>⚜️</span>
            <h1
              style={{
                fontFamily: "var(--md-font-display)",
                fontSize: "1.75rem",
                margin: 0,
                fontWeight: 600,
                color: "#182c23",
              }}
            >
              Curated Collections
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
              {collections.length} Collections
            </span>
          </div>
          <p style={{ fontSize: "0.85rem", color: "#6e6b63", marginTop: 4, margin: 0 }}>
            Curate thematic product showcases (e.g. Royal Heritage, Solitaire Edit, Celebration Edit).
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
          <span>+</span> Add New Collection
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
              <th style={{ padding: "12px 16px" }}>Collection Title</th>
              <th style={{ padding: "12px 14px" }}>Slug / URL</th>
              <th style={{ padding: "12px 14px" }}>Rank</th>
              <th style={{ padding: "12px 14px" }}>Curated Pieces</th>
              <th style={{ padding: "12px 14px" }}>Status</th>
              <th style={{ padding: "12px 16px", textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} style={{ padding: "40px", textAlign: "center", color: "#8a857b" }}>
                  Loading collections...
                </td>
              </tr>
            ) : collections.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: "40px", textAlign: "center", color: "#8a857b" }}>
                  No collections created yet. Click "+ Add New Collection" to get started.
                </td>
              </tr>
            ) : (
              collections.map((col) => (
                <tr
                  key={col.id}
                  style={{ borderBottom: "1px solid #f0ebe1", transition: "background 0.15s ease" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#faf8f4")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <td style={{ padding: "14px 16px", fontWeight: 600, color: "#182c23" }}>
                    {col.title}
                  </td>
                  <td style={{ padding: "14px 14px", fontFamily: "monospace", fontSize: "0.8rem", color: "#6e6b63" }}>
                    /collections/{col.slug}
                  </td>
                  <td style={{ padding: "14px 14px", color: "#444" }}>
                    {col.rank}
                  </td>
                  <td style={{ padding: "14px 14px" }}>
                    <span style={{ fontWeight: 600, color: "#182c23" }}>{col.productCount}</span> items
                  </td>
                  <td style={{ padding: "14px 14px" }}>
                    <span
                      style={{
                        padding: "3px 8px",
                        borderRadius: 4,
                        fontSize: "0.7rem",
                        fontWeight: 600,
                        textTransform: "uppercase",
                        background: col.isPublished ? "#dcfce7" : "#fef3c7",
                        color: col.isPublished ? "#15803d" : "#b45309",
                      }}
                    >
                      {col.isPublished ? "Active" : "Draft"}
                    </span>
                  </td>
                  <td style={{ padding: "14px 16px", textAlign: "right" }}>
                    <div style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                      <button
                        onClick={() => openEditModal(col)}
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
                        href={`/us/collections/${col.slug}`}
                        target="_blank"
                        title="View collection on live site"
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
                        onClick={() => handleDelete(col)}
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
              maxWidth: 580,
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 20px 40px rgba(0,0,0,0.15)",
              display: "flex",
              flexDirection: "column",
              gap: 20,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 600, color: "#182c23" }}>
                {editingId ? "Edit Collection" : "Add New Collection"}
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
                  Collection Title *
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    if (!editingId && !slug) {
                      setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
                    }
                  }}
                  required
                  placeholder="e.g. Royal Silver Heirlooms"
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
                    placeholder="royal-heirlooms"
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
                    <option value="true">Active (Visible)</option>
                    <option value="false">Draft (Hidden)</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#444", marginBottom: 6 }}>
                  Editorial Description
                </label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Curated masterworks in 925 sterling silver..."
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 6, border: "1px solid #d5cfc1", fontSize: "0.85rem", fontFamily: "inherit" }}
                />
              </div>

              {/* Product assignment */}
              {allProducts.length > 0 && (
                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#444", marginBottom: 6 }}>
                    Assign Products to Collection ({selectedProductIds.length} selected)
                  </label>
                  <div
                    style={{
                      maxHeight: 180,
                      overflowY: "auto",
                      border: "1px solid #d5cfc1",
                      borderRadius: 6,
                      padding: 8,
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                      background: "#faf9f6",
                    }}
                  >
                    {allProducts.map((p) => {
                      const checked = selectedProductIds.includes(p.id);
                      return (
                        <label
                          key={p.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            padding: "4px 8px",
                            borderRadius: 4,
                            cursor: "pointer",
                            background: checked ? "#ede8df" : "transparent",
                            fontSize: "0.825rem",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleProduct(p.id)}
                          />
                          <span>{p.title}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

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
                  {saving ? "Saving..." : editingId ? "Update Collection" : "Create Collection"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
