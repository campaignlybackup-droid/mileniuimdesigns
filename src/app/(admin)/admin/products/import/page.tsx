"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/Button";
import type { ImportResult } from "@/lib/catalog/bulk-import";

const SAMPLE_CSV = `sku,title,category,inr_price,usd_price,stock,subtitle
MD-RNG-001,Emerald Crown Solitaire Ring,rings,145000,1650,5,Handcrafted in 18K Yellow Gold
MD-CHN-002,Venetian Box Link Chain,chains,82000,950,12,Solid Italian Craftsmanship
MD-PND-003,Crescent Diamond Medallion,pendants,115000,1350,8,Signature Millennium Crescent Motif
MD-BRC-004,Royal Tennis Diamond Bracelet,bracelets,295000,3400,3,Lab-grown certified VVS diamonds
MD-EAR-005,Pavé Halo Drop Earrings,earrings,68000,790,15,Brilliant-cut stones set in 14K white gold`;

export default function BulkImportPage() {
  const [csvContent, setCsvContent] = useState(SAMPLE_CSV);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);
    setLoading(true);

    try {
      const res = await fetch("/api/admin/products/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csvContent }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to process import");
      }

      setResult(data.result);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) setCsvContent(text);
    };
    reader.readAsText(file);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--md-space-8)", maxWidth: 960 }}>
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
          Bulk Catalogue Import
        </h1>
        <p style={{ fontSize: "0.875rem", color: "var(--md-fg-muted)", marginTop: 4 }}>
          Upload or paste CSV catalogue data to create or update products, independent INR and USD prices, and inventory ledgers.
        </p>
      </div>

      {error && (
        <div
          style={{
            background: "var(--md-bg-subtle, var(--md-rule))",
            border: "1px solid var(--md-rule)",
            color: "var(--md-sold, var(--md-fg))",
            padding: "var(--md-space-3) var(--md-space-4)",
            borderRadius: 4,
            fontSize: "0.875rem",
          }}
        >
          {error}
        </div>
      )}

      {/* Result Metrics */}
      {result && (
        <div
          style={{
            background: "var(--md-bg)",
            border: "1px solid var(--md-rule)",
            borderRadius: 6,
            padding: "var(--md-space-6)",
          }}
        >
          <h2 style={{ fontFamily: "var(--md-font-display)", fontSize: "1.25rem", margin: "0 0 var(--md-space-4)" }}>
            Import Execution Report
          </h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              gap: "var(--md-space-4)",
              marginBottom: "var(--md-space-5)",
            }}
          >
            <div style={{ padding: "var(--md-space-3)", border: "1px solid var(--md-rule)", borderRadius: 4 }}>
              <div style={{ fontSize: "0.75rem", color: "var(--md-fg-muted)", textTransform: "uppercase" }}>Processed</div>
              <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>{result.total}</div>
            </div>
            <div style={{ padding: "var(--md-space-3)", border: "1px solid var(--md-green)", borderRadius: 4 }}>
              <div style={{ fontSize: "0.75rem", color: "var(--md-green)", textTransform: "uppercase" }}>New Created</div>
              <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--md-green)" }}>{result.imported}</div>
            </div>
            <div style={{ padding: "var(--md-space-3)", border: "1px solid var(--md-rule)", borderRadius: 4 }}>
              <div style={{ fontSize: "0.75rem", color: "var(--md-fg-muted)", textTransform: "uppercase" }}>Updated</div>
              <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>{result.updated}</div>
            </div>
            <div style={{ padding: "var(--md-space-3)", border: "1px solid var(--md-rule)", borderRadius: 4 }}>
              <div style={{ fontSize: "0.75rem", color: "var(--md-fg-muted)", textTransform: "uppercase" }}>Duplicates</div>
              <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>{result.duplicates}</div>
            </div>
            <div style={{ padding: "var(--md-space-3)", border: "1px solid var(--md-rule)", borderRadius: 4 }}>
              <div style={{ fontSize: "0.75rem", color: "var(--md-fg-muted)", textTransform: "uppercase" }}>Failed / Invalid</div>
              <div style={{ fontSize: "1.5rem", fontWeight: 700, color: result.failed > 0 ? "var(--md-sold)" : "var(--md-fg)" }}>
                {result.failed + result.invalid}
              </div>
            </div>
          </div>

          {result.errors.length > 0 && (
            <div>
              <h3 style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "var(--md-space-2)" }}>Issues Encountered</h3>
              <ul style={{ fontSize: "0.8125rem", color: "var(--md-fg-secondary)", paddingLeft: "var(--md-space-4)", margin: 0 }}>
                {result.errors.map((err, idx) => (
                  <li key={idx}>
                    Row {err.row}: {err.sku ? `[${err.sku}] ` : ""}
                    {err.error}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Import Form */}
      <form onSubmit={handleImport} style={{ display: "flex", flexDirection: "column", gap: "var(--md-space-5)" }}>
        <div
          style={{
            background: "var(--md-bg)",
            border: "1px solid var(--md-rule)",
            borderRadius: 6,
            padding: "var(--md-space-6)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--md-space-4)" }}>
            <h2 style={{ fontFamily: "var(--md-font-display)", fontSize: "1.25rem", margin: 0 }}>
              CSV Catalogue Data
            </h2>
            <div style={{ display: "flex", gap: "var(--md-space-3)" }}>
              <label
                style={{
                  cursor: "pointer",
                  fontSize: "0.8125rem",
                  border: "1px solid var(--md-rule)",
                  padding: "6px 12px",
                  borderRadius: 4,
                  fontWeight: 500,
                }}
              >
                Upload File (.csv)
                <input type="file" accept=".csv" onChange={handleFileUpload} style={{ display: "none" }} />
              </label>
              <button
                type="button"
                onClick={() => setCsvContent(SAMPLE_CSV)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--md-green)",
                  fontSize: "0.8125rem",
                  cursor: "pointer",
                  fontWeight: 500,
                }}
              >
                Reset to Sample
              </button>
            </div>
          </div>

          <p style={{ fontSize: "0.8125rem", color: "var(--md-fg-muted)", margin: "0 0 var(--md-space-3)" }}>
            Supported columns: <code>sku, title, category, inr_price, usd_price, stock, subtitle</code>.
          </p>

          <textarea
            rows={12}
            value={csvContent}
            onChange={(e) => setCsvContent(e.target.value)}
            style={{
              width: "100%",
              fontFamily: "monospace",
              fontSize: "0.8125rem",
              padding: "var(--md-space-4)",
              border: "1px solid var(--md-rule)",
              background: "var(--md-bg-subtle, #faf8f3)",
              color: "var(--md-fg)",
              lineHeight: 1.5,
              borderRadius: 4,
            }}
          />

          <Button type="submit" variant="primary" size="lg" disabled={loading} style={{ marginTop: "var(--md-space-4)" }}>
            {loading ? "Validating & Importing…" : "Execute Bulk Import"}
          </Button>
        </div>
      </form>
    </div>
  );
}
