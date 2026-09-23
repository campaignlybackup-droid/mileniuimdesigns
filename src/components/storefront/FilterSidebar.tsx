"use client";

import type { JSX } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

export type FilterOption = {
  id: string;
  label: string;
  slug: string;
  count?: number;
};

export type FilterGroup = {
  key: string; // "stone" | "material" | "attr_<name>"
  title: string;
  options: FilterOption[];
};

export type FilterSidebarProps = {
  groups: FilterGroup[];
  className?: string;
};

export function FilterSidebar({ groups, className }: FilterSidebarProps): JSX.Element {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Check which filters are currently active in searchParams
  const isSelected = (groupKey: string, slug: string): boolean => {
    const values = searchParams.getAll(groupKey);
    return values.includes(slug.toLowerCase());
  };

  const toggleFilter = (groupKey: string, slug: string) => {
    const nextParams = new URLSearchParams(searchParams.toString());
    const lowerSlug = slug.toLowerCase();
    const currentValues = nextParams.getAll(groupKey);

    if (currentValues.includes(lowerSlug)) {
      // Remove it
      nextParams.delete(groupKey);
      for (const val of currentValues) {
        if (val !== lowerSlug) {
          nextParams.append(groupKey, val);
        }
      }
    } else {
      // Add it
      nextParams.append(groupKey, lowerSlug);
    }

    nextParams.delete("page"); // Reset pagination on filter change
    const qs = nextParams.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  const clearAllFilters = () => {
    const nextParams = new URLSearchParams();
    // Preserve sort if present
    const sort = searchParams.get("sort");
    if (sort) nextParams.set("sort", sort);
    const qs = nextParams.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  // Find all active filters with their group key and label
  const activeFilters: { groupKey: string; slug: string; label: string }[] = [];
  for (const group of groups) {
    const activeSlugs = searchParams.getAll(group.key);
    for (const slug of activeSlugs) {
      const opt = group.options.find((o) => o.slug.toLowerCase() === slug.toLowerCase());
      if (opt) {
        activeFilters.push({ groupKey: group.key, slug: opt.slug, label: opt.label });
      }
    }
  }

  // Has any filter applied?
  const hasActiveFilters = activeFilters.length > 0;

  return (
    <aside
      className={className}
      style={{
        width: "100%",
        maxWidth: 260,
        display: "flex",
        flexDirection: "column",
        gap: "var(--md-space-5)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid var(--md-rule)",
          paddingBottom: "var(--md-space-3)",
        }}
      >
        <span
          style={{
            fontSize: "var(--md-t-label, 0.75rem)",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            fontWeight: 600,
            fontFamily: "var(--md-font-crest), Georgia, serif",
            color: "var(--md-fg)",
          }}
        >
          Filters
        </span>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearAllFilters}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--md-gold-antique)",
              fontSize: "0.75rem",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              cursor: "pointer",
              padding: 0,
              fontWeight: 600,
            }}
          >
            Clear all
          </button>
        )}
      </div>

      {/* Active Filter Chips */}
      {activeFilters.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
          {activeFilters.map((af) => (
            <button
              key={`${af.groupKey}-${af.slug}`}
              type="button"
              onClick={() => toggleFilter(af.groupKey, af.slug)}
              title="Remove filter"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "4px 10px",
                borderRadius: "var(--md-radius-sm)",
                background: "var(--md-forest)",
                color: "var(--md-champagne)",
                border: "1px solid color-mix(in srgb, var(--md-champagne) 30%, transparent)",
                fontSize: "0.75rem",
                cursor: "pointer",
                transition: "opacity 160ms ease",
              }}
            >
              <span>{af.label}</span>
              <span style={{ fontSize: "0.7rem", lineHeight: 1 }}>✕</span>
            </button>
          ))}
        </div>
      )}

      {groups.map((group) => {
        if (group.options.length === 0) return null;
        return (
          <div key={group.key} style={{ display: "flex", flexDirection: "column", gap: "var(--md-space-2)" }}>
            <span
              style={{
                fontSize: "var(--md-t-label, 0.75rem)",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--md-fg-secondary)",
                marginBottom: "var(--md-space-1)",
              }}
            >
              {group.title}
            </span>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--md-space-1)" }}>
              {group.options.map((opt) => {
                const selected = isSelected(group.key, opt.slug);
                return (
                  <label
                    key={opt.id}
                    className="md-filter-option"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "var(--md-space-3)",
                      fontSize: "0.875rem",
                      cursor: "pointer",
                      color: selected ? "var(--md-fg)" : "var(--md-fg-secondary)",
                      minHeight: 44,
                      padding: "4px 0",
                      userSelect: "none",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleFilter(group.key, opt.slug)}
                      style={{
                        width: 18,
                        height: 18,
                        accentColor: "var(--md-emerald-deep)",
                        cursor: "pointer",
                      }}
                    />
                    <span>{opt.label}</span>
                    {opt.count !== undefined && (
                      <span style={{ fontSize: "0.75rem", opacity: 0.6 }}>
                        ({opt.count})
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}
    </aside>
  );
}
