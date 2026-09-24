"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

type CategoryOption = { id: string; name: string; slug: string };
type CollectionOption = { id: string; title: string; slug: string };
type StoneOption = { id: string; name: string; slug: string; color: string | null };

export default function EditProductPage() {
  const params = useParams();
  const router = useRouter();
  const productId = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [collections, setCollections] = useState<CollectionOption[]>([]);
  const [stones, setStones] = useState<StoneOption[]>([]);

  // Form State
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [slug, setSlug] = useState("");
  const [sku, setSku] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [selectedCollections, setSelectedCollections] = useState<string[]>([]);
  const [selectedStones, setSelectedStones] = useState<string[]>([]);
  const [status, setStatus] = useState("active");
  const [inrPrice, setInrPrice] = useState("0");
  const [usdPrice, setUsdPrice] = useState("0");
  const [stock, setStock] = useState("0");
  const [weightGrams, setWeightGrams] = useState("12.5");
  const [description, setDescription] = useState("");
  const [careInstructions, setCareInstructions] = useState("");

  useEffect(() => {
    async function loadProduct() {
      if (!productId) return;
      setLoading(true);
      try {
        const res = await fetch(`/api/admin/products/${productId}`);
        const data = await res.json();
        if (!res.ok || !data.ok) {
          throw new Error(data.error || "Failed to load product");
        }

        const p = data.product;
        setTitle(p.title || "");
        setSubtitle(p.subtitle || "");
        setSlug(p.slug || "");
        setSku(p.sku || "");
        setCategoryId(p.primaryCategoryId || "");
        setSelectedCollections(p.collectionIds || []);
        setSelectedStones(p.stoneIds || []);
        setStatus(p.status || "active");
        setInrPrice(String(p.inrPrice || "0"));
        setUsdPrice(String(p.usdPrice || "0"));
        setStock(String(p.stock || "0"));
        setWeightGrams(String(p.weightGrams || "12.5"));
        setDescription(p.description || "");
        setCareInstructions(p.careInstructions || "");

        setCategories(data.availableCategories || []);
        setCollections(data.availableCollections || []);
        setStones(data.availableStones || []);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Error loading product");
      } finally {
        setLoading(false);
      }
    }
    void loadProduct();
  }, [productId]);

  function toggleCollection(id: string) {
    setSelectedCollections((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );
  }

  function toggleStone(id: string) {
    setSelectedStones((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSaving(true);

    try {
      const res = await fetch(`/api/admin/products/${productId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          subtitle,
          slug,
          sku,
          categoryId,
          collectionIds: selectedCollections,
          stoneIds: selectedStones,
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
        throw new Error(data.error || "Failed to update product");
      }

      setSuccess("Product modifications saved successfully!");
      setTimeout(() => setSuccess(null), 4000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error saving product");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Are you sure you want to archive "${title}"? It will be hidden from the storefront.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/admin/products/${productId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to archive product");
      router.push("/admin/products");
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to archive");
    }
  }

  if (loading) {
    return (
      <div style={{ padding: "60px 16px", textAlign: "center", color: "#8a857b" }}>
        Loading product details...
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 920, margin: "0 auto", display: "flex", flexDirection: "column", gap: 24, paddingBottom: 60 }}>
      {/* Top Header with Breadcrumb & Quick Actions */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.85rem", color: "#6e6b63", marginBottom: 6 }}>
            <Link href="/admin/products" style={{ color: "#6e6b63", textDecoration: "none" }}>
              Products
            </Link>
            <span>/</span>
            <span style={{ color: "#182c23", fontWeight: 600 }}>{title || "Edit Product"}</span>
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
            {title}
          </h1>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <Link
            href={`/us/products/${slug}`}
            target="_blank"
            style={{
              padding: "8px 14px",
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
            <span>↗</span> View Live
          </Link>

          <button
            type="button"
            onClick={handleDelete}
            style={{
              padding: "8px 14px",
              borderRadius: 6,
              border: "1px solid #fecaca",
              background: "#fef2f2",
              color: "#b91c1c",
              fontSize: "0.85rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Archive Product
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: "12px 16px", borderRadius: 6, background: "#fdf2f2", border: "1px solid #f8b4b4", color: "#991b1b", fontSize: "0.85rem" }}>
          {error}
        </div>
      )}

      {success && (
        <div style={{ padding: "12px 16px", borderRadius: 6, background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#166534", fontSize: "0.85rem" }}>
          {success}
        </div>
      )}

      <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        {/* Section 1: Basic Information */}
        <div style={{ background: "#ffffff", padding: 24, borderRadius: 8, border: "1px solid #e7e2d7", display: "flex", flexDirection: "column", gap: 16 }}>
          <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 600, color: "#182c23" }}>
            1. Core Details
          </h3>

          <div>
            <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#444", marginBottom: 6 }}>
              Product Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              style={{ width: "100%", padding: "10px 14px", borderRadius: 6, border: "1px solid #d5cfc1", fontSize: "0.95rem" }}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#444", marginBottom: 6 }}>
                Subtitle / Marketing Hook
              </label>
              <input
                type="text"
                value={subtitle}
                onChange={(e) => setSubtitle(e.target.value)}
                style={{ width: "100%", padding: "10px 14px", borderRadius: 6, border: "1px solid #d5cfc1", fontSize: "0.875rem" }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#444", marginBottom: 6 }}>
                URL Slug
              </label>
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                required
                style={{ width: "100%", padding: "10px 14px", borderRadius: 6, border: "1px solid #d5cfc1", fontSize: "0.875rem" }}
              />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
            <div>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#444", marginBottom: 6 }}>
                Category
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
                SKU
              </label>
              <input
                type="text"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
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
          <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 600, color: "#182c23" }}>
            2. Dual Market Pricing &amp; Stock
          </h3>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 16 }}>
            <div>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#444", marginBottom: 6 }}>
                India Price (INR ₹)
              </label>
              <input
                type="number"
                min="0"
                step="50"
                value={inrPrice}
                onChange={(e) => setInrPrice(e.target.value)}
                style={{ width: "100%", padding: "10px 14px", borderRadius: 6, border: "1px solid #d5cfc1", fontSize: "0.95rem", fontWeight: 700 }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#444", marginBottom: 6 }}>
                Global Price (USD $)
              </label>
              <input
                type="number"
                min="0"
                step="1"
                value={usdPrice}
                onChange={(e) => setUsdPrice(e.target.value)}
                style={{ width: "100%", padding: "10px 14px", borderRadius: 6, border: "1px solid #d5cfc1", fontSize: "0.95rem", fontWeight: 700 }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#444", marginBottom: 6 }}>
                Stock On-Hand Units
              </label>
              <input
                type="number"
                min="0"
                value={stock}
                onChange={(e) => setStock(e.target.value)}
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
                style={{ width: "100%", padding: "10px 14px", borderRadius: 6, border: "1px solid #d5cfc1", fontSize: "0.95rem" }}
              />
            </div>
          </div>
        </div>

        {/* Section 3: Collections Assignment */}
        {collections.length > 0 && (
          <div style={{ background: "#ffffff", padding: 24, borderRadius: 8, border: "1px solid #e7e2d7", display: "flex", flexDirection: "column", gap: 14 }}>
            <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 600, color: "#182c23" }}>
              3. Assigned Collections
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

        {/* Section 4: Gemstones Assignment */}
        {stones.length > 0 && (
          <div style={{ background: "#ffffff", padding: 24, borderRadius: 8, border: "1px solid #e7e2d7", display: "flex", flexDirection: "column", gap: 14 }}>
            <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 600, color: "#182c23" }}>
              4. Gemstone Minerals
            </h3>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {stones.map((st) => {
                const active = selectedStones.includes(st.id);
                return (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => toggleStone(st.id)}
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
                    {st.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Section 5: Descriptions & Care */}
        <div style={{ background: "#ffffff", padding: 24, borderRadius: 8, border: "1px solid #e7e2d7", display: "flex", flexDirection: "column", gap: 16 }}>
          <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 600, color: "#182c23" }}>
            5. Editorial Story &amp; Silver Care
          </h3>

          <div>
            <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#444", marginBottom: 6 }}>
              Product Narrative / Description
            </label>
            <textarea
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
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

        {/* Submit & Save Bar */}
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
            Back to Products
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
            {saving ? "Saving Changes..." : "Save Product Modifications"}
          </button>
        </div>
      </form>
    </div>
  );
}
