"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type CategoryOption = { id: string; name: string; slug: string };
type CollectionOption = { id: string; title: string; slug: string };

export default function NewProductPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [collections, setCollections] = useState<CollectionOption[]>([]);

  // Form State
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [slug, setSlug] = useState("");
  const [sku, setSku] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [selectedCollections, setSelectedCollections] = useState<string[]>([]);
  const [status, setStatus] = useState("active");
  const [inrPrice, setInrPrice] = useState("4500");
  const [usdPrice, setUsdPrice] = useState("55");
  const [stock, setStock] = useState("10");
  const [weightGrams, setWeightGrams] = useState("12.5");
  const [description, setDescription] = useState("");
  const [careInstructions, setCareInstructions] = useState(
    "Store in a tarnish-resistant pouch. Clean gently with a soft microfibre cloth. Avoid direct contact with perfumes and harsh pool chemicals.",
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadMeta() {
      try {
        const [catRes, colRes] = await Promise.all([
          fetch("/api/admin/categories"),
          fetch("/api/admin/collections"),
        ]);
        const catData = await catRes.json();
        const colData = await colRes.json();
        if (catData.ok) {
          setCategories(catData.categories);
          if (catData.categories[0]) setCategoryId(catData.categories[0].id);
        }
        if (colData.ok) {
          setCollections(colData.collections);
        }
      } catch (err) {
        console.error("Failed to load metadata:", err);
      }
    }
    void loadMeta();
  }, []);

  // Auto generate slug & SKU preview if blank
  function handleTitleChange(val: string) {
    setTitle(val);
    if (!slug) {
      const generated = val.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      setSlug(generated);
    }
  }

  function toggleCollection(id: string) {
    setSelectedCollections((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      const res = await fetch("/api/admin/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          subtitle,
          slug,
          sku,
          categoryId,
          collectionIds: selectedCollections,
          status,
          inrPrice: parseFloat(inrPrice) || 0,
          usdPrice: parseFloat(usdPrice) || 0,
          stock: parseInt(stock, 10) || 0,
          weightGrams: parseFloat(weightGrams) || 12.5,
          description,
          careInstructions,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create product.");
      }

      router.push(`/admin/products/${data.productId}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error creating product.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", flexDirection: "column", gap: 24, paddingBottom: 60 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.85rem", color: "#6e6b63", marginBottom: 6 }}>
            <Link href="/admin/products" style={{ color: "#6e6b63", textDecoration: "none" }}>
              Products
            </Link>
            <span>/</span>
            <span style={{ color: "#182c23", fontWeight: 600 }}>New Product</span>
          </div>
          <h1
            style={{
              fontFamily: "var(--md-font-display)",
              fontSize: "1.75rem",
              fontWeight: 600,
              color: "#182c23",
              margin: 0,
            }}
          >
            Create New Product
          </h1>
        </div>

        <Link
          href="/admin/products"
          style={{
            padding: "8px 14px",
            borderRadius: 6,
            border: "1px solid #d5cfc1",
            background: "#ffffff",
            color: "#6e6b63",
            fontSize: "0.85rem",
            textDecoration: "none",
          }}
        >
          Cancel
        </Link>
      </div>

      {error && (
        <div style={{ padding: "12px 16px", borderRadius: 6, background: "#fdf2f2", border: "1px solid #f8b4b4", color: "#991b1b", fontSize: "0.85rem" }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        {/* Section 1: Basic Information */}
        <div style={{ background: "#ffffff", padding: 24, borderRadius: 8, border: "1px solid #e7e2d7", display: "flex", flexDirection: "column", gap: 16 }}>
          <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 600, color: "#182c23" }}>
            1. Essential Details
          </h3>

          <div>
            <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#444", marginBottom: 6 }}>
              Product Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="e.g. Celestial Amethyst Cushion Ring"
              required
              style={{ width: "100%", padding: "10px 14px", borderRadius: 6, border: "1px solid #d5cfc1", fontSize: "0.95rem" }}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#444", marginBottom: 6 }}>
                Subtitle / One-line Hook
              </label>
              <input
                type="text"
                value={subtitle}
                onChange={(e) => setSubtitle(e.target.value)}
                placeholder="e.g. Pure 925 Sterling Silver with Natural African Amethyst"
                style={{ width: "100%", padding: "10px 14px", borderRadius: 6, border: "1px solid #d5cfc1", fontSize: "0.875rem" }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#444", marginBottom: 6 }}>
                Custom URL Slug (leave blank to auto-generate)
              </label>
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="e.g. celestial-amethyst-cushion-ring"
                style={{ width: "100%", padding: "10px 14px", borderRadius: 6, border: "1px solid #d5cfc1", fontSize: "0.875rem" }}
              />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
            <div>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#444", marginBottom: 6 }}>
                Primary Category *
              </label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                style={{ width: "100%", padding: "10px 12px", borderRadius: 6, border: "1px solid #d5cfc1", fontSize: "0.875rem", background: "#fff" }}
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#444", marginBottom: 6 }}>
                SKU (Stock Keeping Unit)
              </label>
              <input
                type="text"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="e.g. MD-RNG-1049"
                style={{ width: "100%", padding: "10px 14px", borderRadius: 6, border: "1px solid #d5cfc1", fontSize: "0.875rem" }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#444", marginBottom: 6 }}>
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                style={{ width: "100%", padding: "10px 12px", borderRadius: 6, border: "1px solid #d5cfc1", fontSize: "0.875rem", background: "#fff" }}
              >
                <option value="active">Active (Visible)</option>
                <option value="draft">Draft (Hidden)</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>
        </div>

        {/* Section 2: Dual Market Pricing & Inventory */}
        <div style={{ background: "#ffffff", padding: 24, borderRadius: 8, border: "1px solid #e7e2d7", display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 600, color: "#182c23" }}>
              2. Independent Dual-Market Pricing &amp; Stock
            </h3>
            <span style={{ fontSize: "0.75rem", color: "#6e6b63" }}>
              Strictly separate prices (no auto-conversion)
            </span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 16 }}>
            <div>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#444", marginBottom: 6 }}>
                India Price (INR ₹) *
              </label>
              <input
                type="number"
                min="100"
                step="50"
                value={inrPrice}
                onChange={(e) => setInrPrice(e.target.value)}
                placeholder="4500"
                required
                style={{ width: "100%", padding: "10px 14px", borderRadius: 6, border: "1px solid #d5cfc1", fontSize: "0.95rem", fontWeight: 700 }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#444", marginBottom: 6 }}>
                Global Price (USD $) *
              </label>
              <input
                type="number"
                min="5"
                step="1"
                value={usdPrice}
                onChange={(e) => setUsdPrice(e.target.value)}
                placeholder="55"
                required
                style={{ width: "100%", padding: "10px 14px", borderRadius: 6, border: "1px solid #d5cfc1", fontSize: "0.95rem", fontWeight: 700 }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#444", marginBottom: 6 }}>
                Available Stock Quantity
              </label>
              <input
                type="number"
                min="0"
                value={stock}
                onChange={(e) => setStock(e.target.value)}
                placeholder="10"
                style={{ width: "100%", padding: "10px 14px", borderRadius: 6, border: "1px solid #d5cfc1", fontSize: "0.95rem" }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#444", marginBottom: 6 }}>
                Silver Weight (Grams)
              </label>
              <input
                type="number"
                min="0.1"
                step="0.1"
                value={weightGrams}
                onChange={(e) => setWeightGrams(e.target.value)}
                placeholder="12.5"
                style={{ width: "100%", padding: "10px 14px", borderRadius: 6, border: "1px solid #d5cfc1", fontSize: "0.95rem" }}
              />
            </div>
          </div>
        </div>

        {/* Section 3: Collections Assignment */}
        {collections.length > 0 && (
          <div style={{ background: "#ffffff", padding: 24, borderRadius: 8, border: "1px solid #e7e2d7", display: "flex", flexDirection: "column", gap: 14 }}>
            <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 600, color: "#182c23" }}>
              3. Curated Collections
            </h3>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {collections.map((col) => {
                const active = selectedCollections.includes(col.id);
                return (
                  <button
                    key={col.id}
                    type="button"
                    onClick={() => toggleCollection(col.id)}
                    style={{
                      padding: "8px 16px",
                      borderRadius: 999,
                      border: "1px solid",
                      borderColor: active ? "#182c23" : "#d5cfc1",
                      background: active ? "#182c23" : "#faf9f6",
                      color: active ? "#ffffff" : "#444",
                      fontSize: "0.85rem",
                      fontWeight: active ? 600 : 500,
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                  >
                    {active ? "✓ " : "+ "}
                    {col.title}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Section 4: Descriptions & Silver Care Guide */}
        <div style={{ background: "#ffffff", padding: 24, borderRadius: 8, border: "1px solid #e7e2d7", display: "flex", flexDirection: "column", gap: 16 }}>
          <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 600, color: "#182c23" }}>
            4. Editorial Story &amp; Silver Care
          </h3>

          <div>
            <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#444", marginBottom: 6 }}>
              Product Narrative / Description
            </label>
            <textarea
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Handcrafted in 925 sterling silver featuring bezel-set natural gemstones cut with precision in Jaipur..."
              style={{ width: "100%", padding: "12px 14px", borderRadius: 6, border: "1px solid #d5cfc1", fontSize: "0.875rem", fontFamily: "inherit" }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#444", marginBottom: 6 }}>
              Silver Care &amp; Maintenance Instructions
            </label>
            <textarea
              rows={3}
              value={careInstructions}
              onChange={(e) => setCareInstructions(e.target.value)}
              style={{ width: "100%", padding: "12px 14px", borderRadius: 6, border: "1px solid #d5cfc1", fontSize: "0.875rem", fontFamily: "inherit" }}
            />
          </div>
        </div>

        {/* Submit Bar */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
          <Link
            href="/admin/products"
            style={{
              padding: "12px 20px",
              borderRadius: 6,
              border: "1px solid #d5cfc1",
              background: "#ffffff",
              color: "#6e6b63",
              fontSize: "0.9rem",
              textDecoration: "none",
            }}
          >
            Cancel
          </Link>

          <button
            type="submit"
            disabled={saving}
            style={{
              padding: "12px 28px",
              borderRadius: 6,
              border: "none",
              background: "#182c23",
              color: "#ffffff",
              fontSize: "0.9rem",
              fontWeight: 600,
              cursor: saving ? "wait" : "pointer",
              boxShadow: "0 2px 8px rgba(24, 44, 35, 0.2)",
            }}
          >
            {saving ? "Creating Product..." : "Save & Publish Product"}
          </button>
        </div>
      </form>
    </div>
  );
}
