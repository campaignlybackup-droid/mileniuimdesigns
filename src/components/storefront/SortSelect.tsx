"use client";

import type { JSX } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

export type SortOption = {
  value: string;
  label: string;
};

const SORT_OPTIONS: SortOption[] = [
  { value: "", label: "Featured" },
  { value: "price_asc", label: "Price: Low to High" },
  { value: "price_desc", label: "Price: High to Low" },
  { value: "newest", label: "Newest" },
];

export function SortSelect({
  currentSort = "",
  className,
}: {
  currentSort?: string;
  className?: string;
}): JSX.Element {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    const nextParams = new URLSearchParams(searchParams.toString());
    if (val) {
      nextParams.set("sort", val);
    } else {
      nextParams.delete("sort");
    }
    nextParams.delete("page"); // Reset page on sort change
    const qs = nextParams.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  return (
    <div
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "var(--md-space-2)",
        fontSize: "var(--md-t-label, 0.75rem)",
        letterSpacing: "0.08em",
        textTransform: "uppercase",
      }}
    >
      <label htmlFor="plp-sort-select" style={{ color: "var(--md-fg-muted)" }}>
        Sort by
      </label>
      <select
        id="plp-sort-select"
        value={currentSort}
        onChange={handleSortChange}
        style={{
          background: "transparent",
          border: "1px solid var(--md-rule)",
          color: "var(--md-fg)",
          padding: "var(--md-space-2) var(--md-space-3)",
          fontSize: "inherit",
          letterSpacing: "inherit",
          cursor: "pointer",
          borderRadius: 0,
        }}
      >
        {SORT_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
