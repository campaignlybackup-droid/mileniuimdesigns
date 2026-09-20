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

  // Has any filter applied?
  const hasActiveFilters = Array.from(searchParams.keys()).some(
    (k) => k !== "sort" && k !== "page",
  );

  return (
    <aside
      className={className}
      style={{
        width: "100%",
        maxWidth: 260,
        display: "flex",
        flexDirection: "column",
        gap: "var(--md-space-6)",
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
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            fontWeight: 500,
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
              color: "var(--md-fg-secondary)",
              fontSize: "0.75rem",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              cursor: "pointer",
              padding: 0,
            }}
          >
            Clear all
          </button>
        )}
      </div>

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
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "var(--md-space-2)",
                      fontSize: "0.875rem",
                      cursor: "pointer",
                      color: selected ? "var(--md-fg)" : "var(--md-fg-secondary)",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleFilter(group.key, opt.slug)}
                      style={{
                        accentColor: "var(--md-fg)",
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
