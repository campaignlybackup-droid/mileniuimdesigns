"use client";

import { useState, useEffect, type JSX } from "react";
import { useSearchParams } from "next/navigation";
import { FilterSidebar, type FilterGroup } from "@/components/storefront/FilterSidebar";
import { Button } from "@/components/ui/Button";

export type FilterDrawerProps = {
  groups: FilterGroup[];
  className?: string;
};

export function FilterDrawer({ groups, className }: FilterDrawerProps): JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const searchParams = useSearchParams();

  // Count active filters
  let activeCount = 0;
  for (const group of groups) {
    activeCount += searchParams.getAll(group.key).length;
  }

  // Lock body scroll when bottom sheet is open
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

  return (
    <div className={className}>
      {/* Mobile Filter Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label="Open filter menu"
        style={{
          width: "100%",
          minHeight: 44,
          padding: "10px var(--md-space-4)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          border: "1px solid var(--md-rule-strong)",
          borderRadius: "var(--md-radius-sm)",
          background: "var(--md-bg-raised)",
          color: "var(--md-fg)",
          fontSize: "0.8125rem",
          fontWeight: 600,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          cursor: "pointer",
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <line x1="4" y1="6" x2="20" y2="6" />
            <line x1="8" y1="12" x2="20" y2="12" />
            <line x1="14" y1="18" x2="20" y2="18" />
            <circle cx="6" cy="12" r="2" fill="currentColor" />
            <circle cx="12" cy="18" r="2" fill="currentColor" />
          </svg>
          <span>Refine &amp; Filter</span>
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          {activeCount > 0 && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 20,
                height: 20,
                borderRadius: "50%",
                background: "var(--md-emerald-deep)",
                color: "var(--md-ivory-soft)",
                fontSize: "0.6875rem",
                fontWeight: 700,
              }}
            >
              {activeCount}
            </span>
          )}
          <span style={{ fontSize: "1rem", color: "var(--md-fg-muted)" }}>+</span>
        </span>
      </button>

      {/* Slide-Up Bottom Sheet Modal */}
      {isOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 950,
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-end",
          }}
        >
          {/* Backdrop overlay */}
          <div
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
            style={{
              position: "fixed",
              inset: 0,
              background: "color-mix(in srgb, var(--md-charcoal) 60%, transparent)",
              backdropFilter: "blur(4px)",
              WebkitBackdropFilter: "blur(4px)",
              transition: "opacity 240ms ease",
            }}
          />

          {/* Bottom Sheet Card */}
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Filter products"
            style={{
              position: "relative",
              width: "100%",
              maxHeight: "85vh",
              background: "var(--md-bg)",
              borderRadius: "16px 16px 0 0",
              borderTop: "1px solid var(--md-rule)",
              display: "flex",
              flexDirection: "column",
              zIndex: 951,
              boxShadow: "0 -8px 32px rgba(0, 0, 0, 0.2)",
              animation: "slideUp 280ms cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          >
            {/* Sheet Handle */}
            <div style={{ width: "100%", display: "flex", justifyContent: "center", paddingTop: 10 }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--md-rule-strong)" }} />
            </div>

            {/* Header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "var(--md-space-3) var(--md-gutter)",
                borderBottom: "1px solid var(--md-rule)",
              }}
            >
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <h3
                  style={{
                    fontFamily: "var(--md-font-display)",
                    fontSize: "1.125rem",
                    margin: 0,
                    fontWeight: 600,
                    color: "var(--md-fg)",
                  }}
                >
                  Refine Creations
                </h3>
                {activeCount > 0 && (
                  <span style={{ fontSize: "0.75rem", color: "var(--md-green)", fontWeight: 600 }}>
                    ({activeCount} active)
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="Close filter sheet"
                style={{
                  width: 44,
                  height: 44,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "1.125rem",
                  color: "var(--md-fg)",
                }}
              >
                ✕
              </button>
            </div>

            {/* Scrollable Filter Options */}
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                WebkitOverflowScrolling: "touch",
                padding: "var(--md-space-4) var(--md-gutter)",
              }}
            >
              <FilterSidebar groups={groups} />
            </div>

            {/* Sticky Safe-Area Footer */}
            <div
              style={{
                padding: "var(--md-space-3) var(--md-gutter) calc(var(--md-space-3) + env(safe-area-inset-bottom, 0px))",
                borderTop: "1px solid var(--md-rule)",
                background: "var(--md-bg-raised)",
                display: "flex",
                gap: "var(--md-space-3)",
              }}
            >
              <Button
                variant="primary"
                size="md"
                onClick={() => setIsOpen(false)}
                style={{ width: "100%", minHeight: 48, letterSpacing: "0.08em" }}
              >
                Apply &amp; View Creations
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
