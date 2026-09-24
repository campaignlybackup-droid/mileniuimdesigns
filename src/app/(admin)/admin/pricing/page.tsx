"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  TrendingUp,
  Sparkles,
  ArrowRight,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Layers,
  DollarSign,
  Percent,
  Sliders,
  History,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/Button";

interface SampleItem {
  id: string;
  title: string;
  sku: string;
  category: string;
  marketCode: string;
  currency: string;
  currentPrice: number;
  newPrice: number;
  diff: number;
  diffPercent: string;
}

interface AuditItem {
  id: string;
  summary: string;
  createdAt: string;
}

export default function AdminPricingPage() {
  const [loading, setLoading] = useState(true);
  const [silverRateInr, setSilverRateInr] = useState<number>(98.5);
  const [silverRateUsd, setSilverRateUsd] = useState<number>(1.15);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [totalProducts, setTotalProducts] = useState<number>(0);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [recentAudit, setRecentAudit] = useState<AuditItem[]>([]);

  // Adjustment form state
  const [activeMode, setActiveMode] = useState<"silver_rate" | "percentage" | "fixed">("silver_rate");
  const [newSilverRate, setNewSilverRate] = useState<string>("98.50");
  const [percentChange, setPercentChange] = useState<string>("3.0");
  const [fixedAmount, setFixedAmount] = useState<string>("100");
  const [marketCode, setMarketCode] = useState<"ALL" | "IN" | "US">("ALL");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [rounding, setRounding] = useState<string>("nearest_10");

  // Preview state
  const [previewLoading, setPreviewLoading] = useState(false);
  const [totalAffected, setTotalAffected] = useState<number>(0);
  const [sampleItems, setSampleItems] = useState<SampleItem[]>([]);
  const [applying, setApplying] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Load pricing facts
  const loadPricingData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/pricing");
      const data = await res.json();
      if (data.ok) {
        setSilverRateInr(data.silverRateInr);
        setSilverRateUsd(data.silverRateUsd);
        setNewSilverRate(String(data.silverRateInr));
        setLastUpdatedAt(data.lastUpdatedAt);
        setTotalProducts(data.totalProducts);
        setCategories(data.categories || []);
        setRecentAudit(data.recentAudit || []);
      }
    } catch (err) {
      console.error("Failed to load pricing metadata:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPricingData();
  }, [loadPricingData]);

  // Fetch live preview of price change
  const fetchPreview = useCallback(async () => {
    try {
      setPreviewLoading(true);
      const res = await fetch("/api/admin/pricing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "preview",
          mode: activeMode,
          marketCode,
          categoryId: selectedCategory,
          percentChange: parseFloat(percentChange) || 0,
          fixedAmount: parseFloat(fixedAmount) || 0,
          newSilverRateInr: parseFloat(newSilverRate) || silverRateInr,
          currentSilverRateInr: silverRateInr,
          rounding,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setTotalAffected(data.totalAffected);
        setSampleItems(data.sampleItems || []);
      }
    } catch (err) {
      console.error("Preview fetch error:", err);
    } finally {
      setPreviewLoading(false);
    }
  }, [
    activeMode,
    marketCode,
    selectedCategory,
    percentChange,
    fixedAmount,
    newSilverRate,
    silverRateInr,
    rounding,
  ]);

  useEffect(() => {
    if (!loading) {
      const timer = setTimeout(() => {
        void fetchPreview();
      }, 250);
      return () => clearTimeout(timer);
    }
  }, [fetchPreview, loading]);

  // Execute price update
  const handleApplyUpdate = async () => {
    setApplying(true);
    setMessage(null);
    setShowConfirmModal(false);

    try {
      const res = await fetch("/api/admin/pricing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "apply",
          mode: activeMode,
          marketCode,
          categoryId: selectedCategory,
          percentChange: parseFloat(percentChange) || 0,
          fixedAmount: parseFloat(fixedAmount) || 0,
          newSilverRateInr: parseFloat(newSilverRate) || silverRateInr,
          currentSilverRateInr: silverRateInr,
          rounding,
        }),
      });

      const data = await res.json();
      if (data.ok) {
        setMessage({ text: data.message, type: "success" });
        await loadPricingData();
        await fetchPreview();
      } else {
        setMessage({ text: data.error || "Update failed.", type: "error" });
      }
    } catch (err) {
      setMessage({
        text: err instanceof Error ? err.message : "Failed to execute bulk update.",
        type: "error",
      });
    } finally {
      setApplying(false);
    }
  };

  // Helper calculating silver delta %
  const currentRateNum = silverRateInr || 98.5;
  const newRateNum = parseFloat(newSilverRate) || currentRateNum;
  const silverDeltaPct = (((newRateNum - currentRateNum) / currentRateNum) * 100).toFixed(2);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
      {/* Page Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: "0.75rem", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--md-gold-antique)", fontWeight: 600 }}>
              ✦ Pricing Governance
            </span>
          </div>
          <h1
            className="md-editorial-title"
            style={{ fontSize: "2rem", margin: 0, fontWeight: 500, color: "var(--md-fg)" }}
          >
            Daily Silver &amp; Bulk Price Manager
          </h1>
          <p style={{ fontSize: "0.875rem", color: "var(--md-fg-secondary)", marginTop: 6, maxWidth: 640 }}>
            Adjust product pricing seamlessly as daily silver bullion rates fluctuate. Preview exact price changes before updating live storefront prices.
          </p>
        </div>

        <div style={{ display: "flex", gap: 12 }}>
          <Link href="/admin/products">
            <Button variant="outline" size="sm">
              View All Products
            </Button>
          </Link>
          <Link href="/admin/customization">
            <Button variant="outline" size="sm">
              Store Customization
            </Button>
          </Link>
        </div>
      </div>

      {/* Alert banner */}
      {message && (
        <div
          style={{
            padding: "14px 18px",
            borderRadius: 4,
            background: message.type === "success" ? "color-mix(in srgb, var(--md-emerald-deep) 12%, var(--md-bg))" : "color-mix(in srgb, var(--md-danger) 12%, var(--md-bg))",
            border: `1px solid ${message.type === "success" ? "var(--md-emerald-deep)" : "var(--md-danger)"}`,
            color: message.type === "success" ? "var(--md-emerald-deep)" : "var(--md-danger)",
            display: "flex",
            alignItems: "center",
            gap: 12,
            fontSize: "0.875rem",
            fontWeight: 500,
          }}
        >
          {message.type === "success" ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}
          <span>{message.text}</span>
        </div>
      )}

      {/* Top 3 KPI Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 16,
        }}
      >
        {/* Card 1: Today's Recorded Silver Rate */}
        <div
          style={{
            background: "var(--md-bg-raised)",
            border: "1px solid var(--md-rule)",
            borderRadius: 4,
            padding: 20,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--md-fg-muted)", fontWeight: 600 }}>
              Current Silver Rate
            </span>
            <TrendingUp className="w-4 h-4 text-[var(--md-gold-antique)]" />
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ fontSize: "1.75rem", fontWeight: 600, color: "var(--md-fg)" }}>
              ₹{silverRateInr.toFixed(2)}
            </span>
            <span style={{ fontSize: "0.8125rem", color: "var(--md-fg-secondary)" }}>/ gram (925)</span>
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--md-fg-muted)", marginTop: 6 }}>
            {lastUpdatedAt ? `Updated ${new Date(lastUpdatedAt).toLocaleDateString()}` : "Base rate active"} · Global: ${silverRateUsd.toFixed(2)}/g
          </div>
        </div>

        {/* Card 2: Active Catalogue Volume */}
        <div
          style={{
            background: "var(--md-bg-raised)",
            border: "1px solid var(--md-rule)",
            borderRadius: 4,
            padding: 20,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--md-fg-muted)", fontWeight: 600 }}>
              Live Catalogue
            </span>
            <Layers className="w-4 h-4 text-[var(--md-emerald-deep)]" />
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ fontSize: "1.75rem", fontWeight: 600, color: "var(--md-fg)" }}>
              {totalProducts}
            </span>
            <span style={{ fontSize: "0.8125rem", color: "var(--md-fg-secondary)" }}>Products</span>
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--md-fg-muted)", marginTop: 6 }}>
            Across India (₹ INR) and Global ($ USD) storefronts
          </div>
        </div>

        {/* Card 3: Live Protection */}
        <div
          style={{
            background: "var(--md-bg-raised)",
            border: "1px solid var(--md-rule)",
            borderRadius: 4,
            padding: 20,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--md-fg-muted)", fontWeight: 600 }}>
              Audit &amp; Safety
            </span>
            <ShieldCheck className="w-4 h-4 text-[var(--md-emerald-deep)]" />
          </div>
          <div style={{ fontSize: "1.125rem", fontWeight: 600, color: "var(--md-fg)", marginTop: 4 }}>
            Instant Revalidation
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--md-fg-muted)", marginTop: 6 }}>
            Cache updates automatically; audit log preserved
          </div>
        </div>
      </div>

      {/* Main Pricing Tool Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 24,
        }}
      >
        {/* Left Column: Adjustment Controls */}
        <div
          style={{
            background: "var(--md-bg-raised)",
            border: "1px solid var(--md-rule)",
            borderRadius: 4,
            padding: 24,
            display: "flex",
            flexDirection: "column",
            gap: 20,
          }}
        >
          <h2 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 600, color: "var(--md-fg)" }}>
            Configure Price Adjustment
          </h2>

          {/* Mode Selector Tabs */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 4,
              background: "var(--md-bg)",
              padding: 4,
              borderRadius: 4,
              border: "1px solid var(--md-rule)",
            }}
          >
            <button
              type="button"
              onClick={() => setActiveMode("silver_rate")}
              style={{
                padding: "8px 10px",
                fontSize: "0.75rem",
                fontWeight: activeMode === "silver_rate" ? 600 : 500,
                border: "none",
                borderRadius: 3,
                cursor: "pointer",
                background: activeMode === "silver_rate" ? "var(--md-bg-raised)" : "transparent",
                color: activeMode === "silver_rate" ? "var(--md-fg)" : "var(--md-fg-muted)",
                boxShadow: activeMode === "silver_rate" ? "0 1px 3px rgba(0,0,0,0.06)" : "none",
              }}
            >
              Silver Rate (₹/g)
            </button>

            <button
              type="button"
              onClick={() => setActiveMode("percentage")}
              style={{
                padding: "8px 10px",
                fontSize: "0.75rem",
                fontWeight: activeMode === "percentage" ? 600 : 500,
                border: "none",
                borderRadius: 3,
                cursor: "pointer",
                background: activeMode === "percentage" ? "var(--md-bg-raised)" : "transparent",
                color: activeMode === "percentage" ? "var(--md-fg)" : "var(--md-fg-muted)",
                boxShadow: activeMode === "percentage" ? "0 1px 3px rgba(0,0,0,0.06)" : "none",
              }}
            >
              Percentage (%)
            </button>

            <button
              type="button"
              onClick={() => setActiveMode("fixed")}
              style={{
                padding: "8px 10px",
                fontSize: "0.75rem",
                fontWeight: activeMode === "fixed" ? 600 : 500,
                border: "none",
                borderRadius: 3,
                cursor: "pointer",
                background: activeMode === "fixed" ? "var(--md-bg-raised)" : "transparent",
                color: activeMode === "fixed" ? "var(--md-fg)" : "var(--md-fg-muted)",
                boxShadow: activeMode === "fixed" ? "0 1px 3px rgba(0,0,0,0.06)" : "none",
              }}
            >
              Flat Amount (₹)
            </button>
          </div>

          {/* Mode 1: Daily Silver Rate Input */}
          {activeMode === "silver_rate" && (
            <div style={{ background: "var(--md-bg)", padding: 16, borderRadius: 4, border: "1px solid var(--md-rule)" }}>
              <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, color: "var(--md-fg)", marginBottom: 6 }}>
                Today&apos;s Silver Rate per Gram (INR ₹)
              </label>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <div style={{ position: "relative", flex: 1 }}>
                  <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--md-fg-muted)", fontWeight: 600 }}>
                    ₹
                  </span>
                  <input
                    type="number"
                    step="0.1"
                    value={newSilverRate}
                    onChange={(e) => setNewSilverRate(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "10px 12px 10px 28px",
                      background: "var(--md-bg-raised)",
                      border: "1px solid var(--md-rule-strong)",
                      borderRadius: 4,
                      fontSize: "1rem",
                      fontWeight: 600,
                      color: "var(--md-fg)",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
                <div
                  style={{
                    padding: "8px 12px",
                    borderRadius: 4,
                    background: parseFloat(silverDeltaPct) >= 0 ? "color-mix(in srgb, var(--md-green) 12%, transparent)" : "color-mix(in srgb, var(--md-danger) 12%, transparent)",
                    color: parseFloat(silverDeltaPct) >= 0 ? "var(--md-green)" : "var(--md-danger)",
                    fontSize: "0.8125rem",
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                  }}
                >
                  {parseFloat(silverDeltaPct) >= 0 ? `+${silverDeltaPct}%` : `${silverDeltaPct}%`}
                </div>
              </div>
              <p style={{ margin: "8px 0 0", fontSize: "0.75rem", color: "var(--md-fg-muted)", lineHeight: 1.4 }}>
                Calculates ratio against current benchmark (₹{currentRateNum}/g) and updates product prices proportionally.
              </p>
            </div>
          )}

          {/* Mode 2: Percentage Change Input */}
          {activeMode === "percentage" && (
            <div style={{ background: "var(--md-bg)", padding: 16, borderRadius: 4, border: "1px solid var(--md-rule)" }}>
              <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, color: "var(--md-fg)", marginBottom: 6 }}>
                Percentage Change (+ or -)
              </label>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <input
                  type="number"
                  step="0.5"
                  value={percentChange}
                  onChange={(e) => setPercentChange(e.target.value)}
                  placeholder="e.g. 3.5 or -2"
                  style={{
                    flex: 1,
                    padding: "10px 12px",
                    background: "var(--md-bg-raised)",
                    border: "1px solid var(--md-rule-strong)",
                    borderRadius: 4,
                    fontSize: "1rem",
                    fontWeight: 600,
                    color: "var(--md-fg)",
                  }}
                />
                <span style={{ fontSize: "1.125rem", fontWeight: 600, color: "var(--md-fg-muted)" }}>%</span>
              </div>
              <p style={{ margin: "8px 0 0", fontSize: "0.75rem", color: "var(--md-fg-muted)" }}>
                e.g. Enter <code>3.5</code> to raise prices by 3.5%, or <code>-2</code> for a 2% price cut.
              </p>
            </div>
          )}

          {/* Mode 3: Fixed Amount Input */}
          {activeMode === "fixed" && (
            <div style={{ background: "var(--md-bg)", padding: 16, borderRadius: 4, border: "1px solid var(--md-rule)" }}>
              <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, color: "var(--md-fg)", marginBottom: 6 }}>
                Flat Amount Addition (+ or -)
              </label>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <input
                  type="number"
                  step="10"
                  value={fixedAmount}
                  onChange={(e) => setFixedAmount(e.target.value)}
                  placeholder="e.g. 150 or -100"
                  style={{
                    flex: 1,
                    padding: "10px 12px",
                    background: "var(--md-bg-raised)",
                    border: "1px solid var(--md-rule-strong)",
                    borderRadius: 4,
                    fontSize: "1rem",
                    fontWeight: 600,
                    color: "var(--md-fg)",
                  }}
                />
                <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--md-fg-muted)" }}>₹ / $</span>
              </div>
              <p style={{ margin: "8px 0 0", fontSize: "0.75rem", color: "var(--md-fg-muted)" }}>
                Adds or subtracts a fixed rupee/dollar amount from every product price.
              </p>
            </div>
          )}

          {/* Filters: Market & Category */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--md-fg-secondary)", marginBottom: 4 }}>
                Target Market
              </label>
              <select
                value={marketCode}
                onChange={(e) => setMarketCode(e.target.value as "ALL" | "IN" | "US")}
                style={{
                  width: "100%",
                  padding: "9px 10px",
                  background: "var(--md-bg)",
                  border: "1px solid var(--md-rule-strong)",
                  borderRadius: 4,
                  fontSize: "0.8125rem",
                  color: "var(--md-fg)",
                }}
              >
                <option value="ALL">All Markets (INR &amp; USD)</option>
                <option value="IN">India Only (₹ INR)</option>
                <option value="US">International Only ($ USD)</option>
              </select>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--md-fg-secondary)", marginBottom: 4 }}>
                Target Category
              </label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                style={{
                  width: "100%",
                  padding: "9px 10px",
                  background: "var(--md-bg)",
                  border: "1px solid var(--md-rule-strong)",
                  borderRadius: 4,
                  fontSize: "0.8125rem",
                  color: "var(--md-fg)",
                }}
              >
                <option value="ALL">All Categories ({totalProducts} items)</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Rounding Options */}
          <div>
            <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--md-fg-secondary)", marginBottom: 4 }}>
              Psychological Rounding Rule
            </label>
            <select
              value={rounding}
              onChange={(e) => setRounding(e.target.value)}
              style={{
                width: "100%",
                padding: "9px 10px",
                background: "var(--md-bg)",
                border: "1px solid var(--md-rule-strong)",
                borderRadius: 4,
                fontSize: "0.8125rem",
                color: "var(--md-fg)",
              }}
            >
              <option value="none">Exact (No Rounding)</option>
              <option value="nearest_10">Round to Nearest ₹10 / 10¢ (e.g. ₹4,990)</option>
              <option value="nearest_50">Round to Nearest ₹50 / 50¢ (e.g. ₹4,950)</option>
              <option value="nearest_100">Round to Nearest ₹100 / $1 (e.g. ₹5,000)</option>
              <option value="charm_99">Charm Pricing (Ends in 99, e.g. ₹4,999)</option>
            </select>
          </div>

          {/* CTA Action */}
          <div style={{ marginTop: 8 }}>
            <Button
              type="button"
              variant="primary"
              size="lg"
              disabled={applying || totalAffected === 0}
              onClick={() => setShowConfirmModal(true)}
              style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
            >
              {applying ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Applying Price Updates…</span>
                </>
              ) : (
                <>
                  <span>Apply Price Update to {totalAffected} Items</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Right Column: Live Simulation / Before & After Table */}
        <div
          style={{
            background: "var(--md-bg-raised)",
            border: "1px solid var(--md-rule)",
            borderRadius: 4,
            padding: 24,
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h2 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 600, color: "var(--md-fg)" }}>
                Live Before &amp; After Simulation
              </h2>
              <p style={{ margin: "2px 0 0", fontSize: "0.75rem", color: "var(--md-fg-muted)" }}>
                Previewing real items from your database before applying
              </p>
            </div>

            <div
              style={{
                fontSize: "0.75rem",
                padding: "4px 8px",
                borderRadius: 4,
                background: "var(--md-bg)",
                border: "1px solid var(--md-rule)",
                fontWeight: 600,
                color: "var(--md-fg-secondary)",
              }}
            >
              {totalAffected} items will update
            </div>
          </div>

          {/* Sample Table */}
          <div style={{ overflowX: "auto", border: "1px solid var(--md-rule)", borderRadius: 4 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
              <thead>
                <tr style={{ background: "var(--md-bg)", borderBottom: "1px solid var(--md-rule)", textAlign: "left", color: "var(--md-fg-muted)" }}>
                  <th style={{ padding: "8px 10px" }}>Product</th>
                  <th style={{ padding: "8px 10px" }}>Market</th>
                  <th style={{ padding: "8px 10px" }}>Current</th>
                  <th style={{ padding: "8px 10px" }}>New Price</th>
                  <th style={{ padding: "8px 10px" }}>Change</th>
                </tr>
              </thead>
              <tbody>
                {previewLoading ? (
                  <tr>
                    <td colSpan={5} style={{ padding: 24, textAlign: "center", color: "var(--md-fg-muted)" }}>
                      <RefreshCw className="w-5 h-5 animate-spin inline-block mr-2" />
                      Calculating prices…
                    </td>
                  </tr>
                ) : sampleItems.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: 24, textAlign: "center", color: "var(--md-fg-muted)" }}>
                      No matching products found for this filter.
                    </td>
                  </tr>
                ) : (
                  sampleItems.map((item) => (
                    <tr key={item.id} style={{ borderBottom: "1px solid var(--md-rule)" }}>
                      <td style={{ padding: "10px", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        <span style={{ fontWeight: 500, color: "var(--md-fg)" }}>{item.title}</span>
                        <span style={{ display: "block", fontSize: "0.6875rem", color: "var(--md-fg-muted)" }}>{item.category}</span>
                      </td>
                      <td style={{ padding: "10px", fontWeight: 600 }}>
                        <span style={{ padding: "2px 6px", borderRadius: 3, fontSize: "0.6875rem", background: item.marketCode === "IN" ? "color-mix(in srgb, var(--md-gold) 15%, transparent)" : "color-mix(in srgb, var(--md-emerald-deep) 15%, transparent)", color: "var(--md-fg)" }}>
                          {item.marketCode} ({item.currency})
                        </span>
                      </td>
                      <td style={{ padding: "10px", color: "var(--md-fg-secondary)" }}>
                        {item.currency === "INR" ? `₹${item.currentPrice.toLocaleString("en-IN")}` : `$${item.currentPrice.toLocaleString("en-US")}`}
                      </td>
                      <td style={{ padding: "10px", fontWeight: 600, color: "var(--md-fg)" }}>
                        {item.currency === "INR" ? `₹${item.newPrice.toLocaleString("en-IN")}` : `$${item.newPrice.toLocaleString("en-US")}`}
                      </td>
                      <td style={{ padding: "10px" }}>
                        <span
                          style={{
                            padding: "2px 6px",
                            borderRadius: 3,
                            fontSize: "0.75rem",
                            fontWeight: 600,
                            background: item.diff >= 0 ? "color-mix(in srgb, var(--md-green) 12%, transparent)" : "color-mix(in srgb, var(--md-danger) 12%, transparent)",
                            color: item.diff >= 0 ? "var(--md-green)" : "var(--md-danger)",
                          }}
                        >
                          {item.diff >= 0 ? `+${item.diffPercent}%` : `${item.diffPercent}%`}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Quick Note */}
          <div style={{ fontSize: "0.75rem", color: "var(--md-fg-muted)", lineHeight: 1.4 }}>
            💡 <strong>Daily Routine:</strong> When silver metal rates rise or fall each morning, enter today&apos;s bullion rate in INR/gram. The system computes the delta, previews all catalog items, and applies changes with full database auditing.
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.6)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            padding: 16,
          }}
        >
          <div
            style={{
              background: "var(--md-bg-raised)",
              border: "1px solid var(--md-rule)",
              borderRadius: 6,
              maxWidth: 480,
              width: "100%",
              padding: 28,
              boxShadow: "0 20px 50px rgba(0,0,0,0.3)",
            }}
          >
            <h3 style={{ margin: "0 0 10px", fontSize: "1.25rem", color: "var(--md-fg)" }}>
              Confirm Price Update
            </h3>
            <p style={{ margin: "0 0 20px", fontSize: "0.875rem", color: "var(--md-fg-secondary)", lineHeight: 1.5 }}>
              Are you sure you want to update <strong>{totalAffected} price records</strong> across the store? This will adjust active product prices immediately on the live website.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
              <Button
                variant="outline"
                size="md"
                onClick={() => setShowConfirmModal(false)}
                disabled={applying}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="md"
                onClick={handleApplyUpdate}
                disabled={applying}
              >
                {applying ? "Applying…" : "Confirm & Update Prices"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Audit History */}
      {recentAudit.length > 0 && (
        <div
          style={{
            background: "var(--md-bg-raised)",
            border: "1px solid var(--md-rule)",
            borderRadius: 4,
            padding: 24,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <History className="w-4 h-4 text-[var(--md-gold-antique)]" />
            <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 600, color: "var(--md-fg)" }}>
              Recent Price Adjustment History
            </h3>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {recentAudit.map((log) => (
              <div
                key={log.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  fontSize: "0.8125rem",
                  padding: "8px 12px",
                  background: "var(--md-bg)",
                  border: "1px solid var(--md-rule)",
                  borderRadius: 4,
                }}
              >
                <span style={{ color: "var(--md-fg)" }}>{log.summary}</span>
                <span style={{ color: "var(--md-fg-muted)", fontSize: "0.75rem" }}>
                  {new Date(log.createdAt).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
