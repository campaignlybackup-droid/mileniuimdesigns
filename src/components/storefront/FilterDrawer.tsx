"use client";

import { useState, type JSX } from "react";
import { FilterSidebar, type FilterGroup } from "@/components/storefront/FilterSidebar";
import { Button } from "@/components/ui/Button";

export type FilterDrawerProps = {
  groups: FilterGroup[];
  className?: string;
};

export function FilterDrawer({ groups, className }: FilterDrawerProps): JSX.Element {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className={className}>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        style={{ width: "100%", justifyContent: "space-between" }}
      >
        <span>Filters</span>
        <span>{isOpen ? "−" : "+"}</span>
      </Button>

      {isOpen && (
        <div
          style={{
            marginTop: "var(--md-space-4)",
            padding: "var(--md-space-4)",
            border: "1px solid var(--md-rule)",
            background: "var(--md-bg-subtle, var(--md-bg))",
          }}
        >
          <FilterSidebar groups={groups} />
        </div>
      )}
    </div>
  );
}
