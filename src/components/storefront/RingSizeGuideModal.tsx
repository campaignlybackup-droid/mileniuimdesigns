"use client";

import type { JSX } from "react";
import { useEffect } from "react";

export type RingSizeGuideModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function RingSizeGuideModal({ isOpen, onClose }: RingSizeGuideModalProps): JSX.Element | null {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const sizeChart = [
    { inSize: "10", usSize: "5.25", ukSize: "K½", euSize: "50", diamMm: "15.9", circMm: "50.0" },
    { inSize: "12", usSize: "6.0", ukSize: "L½", euSize: "52", diamMm: "16.5", circMm: "51.9" },
    { inSize: "14", usSize: "6.75", ukSize: "N", euSize: "54", diamMm: "17.2", circMm: "54.0" },
    { inSize: "16", usSize: "7.5", ukSize: "P", euSize: "56", diamMm: "17.8", circMm: "56.0" },
    { inSize: "18", usSize: "8.25", ukSize: "Q½", euSize: "58", diamMm: "18.5", circMm: "58.1" },
    { inSize: "20", usSize: "9.0", ukSize: "S", euSize: "60", diamMm: "19.1", circMm: "60.0" },
    { inSize: "22", usSize: "10.0", ukSize: "T½", euSize: "62", diamMm: "19.8", circMm: "62.2" },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Ring Size Guide"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 120,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "var(--md-gutter)",
        boxSizing: "border-box",
      }}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(4, 14, 9, 0.72)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
        }}
        aria-hidden="true"
      />

      {/* Modal Card */}
      <div
        style={{
          position: "relative",
          zIndex: 2,
          width: "100%",
          maxWidth: "640px",
          maxHeight: "90vh",
          overflowY: "auto",
          background: "var(--md-bg)",
          borderRadius: "var(--md-radius-sm)",
          border: "1px solid color-mix(in srgb, var(--md-champagne) 30%, transparent)",
          boxShadow: "0 24px 64px -12px rgba(0, 0, 0, 0.4)",
          padding: "clamp(24px, 4vw, 36px)",
          boxSizing: "border-box",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px" }}>
          <div>
            <span
              style={{
                fontSize: "0.6875rem",
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                color: "var(--md-gold-antique)",
                fontWeight: 600,
                fontFamily: "var(--md-font-crest), Georgia, serif",
                display: "block",
                marginBottom: "4px",
              }}
            >
              ✦ ATELIER SIZING ✦
            </span>
            <h2
              style={{
                margin: 0,
                fontFamily: "var(--md-font-display)",
                fontSize: "1.75rem",
                fontWeight: 400,
                color: "var(--md-fg)",
              }}
            >
              International Ring Size Guide
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close size guide"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--md-fg-secondary)",
              fontSize: "1.5rem",
              cursor: "pointer",
              padding: "4px 8px",
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        <p style={{ margin: "0 0 20px", fontSize: "0.875rem", lineHeight: 1.6, color: "var(--md-fg-secondary)" }}>
          Every Millennium Designs ring is calibrated to global precision standards. If you are between
          sizes, we recommend ordering the larger size or contacting our atelier for bespoke custom sizing.
        </p>

        {/* Size Table */}
        <div style={{ overflowX: "auto", marginBottom: "24px", border: "1px solid var(--md-rule)", borderRadius: "var(--md-radius-sm)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem", textAlign: "left" }}>
            <thead>
              <tr style={{ background: "var(--md-ivory)", borderBottom: "1px solid var(--md-rule)" }}>
                <th style={{ padding: "10px 12px", fontWeight: 600, color: "var(--md-fg)" }}>India</th>
                <th style={{ padding: "10px 12px", fontWeight: 600, color: "var(--md-fg)" }}>US / Canada</th>
                <th style={{ padding: "10px 12px", fontWeight: 600, color: "var(--md-fg)" }}>UK / Aus</th>
                <th style={{ padding: "10px 12px", fontWeight: 600, color: "var(--md-fg)" }}>EU</th>
                <th style={{ padding: "10px 12px", fontWeight: 600, color: "var(--md-fg)" }}>Diameter (mm)</th>
              </tr>
            </thead>
            <tbody>
              {sizeChart.map((row, idx) => (
                <tr
                  key={row.inSize}
                  style={{
                    borderBottom: idx === sizeChart.length - 1 ? "none" : "1px solid var(--md-rule)",
                    background: idx % 2 === 0 ? "transparent" : "var(--md-ivory)",
                  }}
                >
                  <td style={{ padding: "8px 12px", fontWeight: 600, color: "var(--md-forest)" }}>{row.inSize}</td>
                  <td style={{ padding: "8px 12px", color: "var(--md-fg)" }}>{row.usSize}</td>
                  <td style={{ padding: "8px 12px", color: "var(--md-fg)" }}>{row.ukSize}</td>
                  <td style={{ padding: "8px 12px", color: "var(--md-fg)" }}>{row.euSize}</td>
                  <td style={{ padding: "8px 12px", color: "var(--md-fg-secondary)" }}>{row.diamMm} mm</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Measuring Guide */}
        <div
          style={{
            padding: "16px",
            background: "var(--md-ivory)",
            borderRadius: "var(--md-radius-sm)",
            border: "1px solid var(--md-rule)",
            fontSize: "0.8125rem",
            lineHeight: 1.6,
            color: "var(--md-fg-secondary)",
          }}
        >
          <strong style={{ color: "var(--md-fg)", display: "block", marginBottom: "4px" }}>
            How to Measure at Home:
          </strong>
          Wrap a strip of paper or string around the base of the intended finger. Mark where the ends
          overlap, then measure the length in millimeters with a ruler. Match that measurement to the
          circumference in the chart above.
        </div>
      </div>
    </div>
  );
}
