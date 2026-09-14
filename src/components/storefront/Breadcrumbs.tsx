import type { JSX } from "react";
import Link from "next/link";

export type BreadcrumbItem = {
  label: string;
  href?: string;
};

export type BreadcrumbsProps = {
  items: BreadcrumbItem[];
  className?: string;
};

export function Breadcrumbs({ items, className }: BreadcrumbsProps): JSX.Element | null {
  if (items.length === 0) return null;

  return (
    <nav
      aria-label="Breadcrumb"
      className={className}
      style={{
        paddingBlock: "var(--md-space-3)",
        fontSize: "var(--md-t-label, 0.75rem)",
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: "var(--md-fg-muted)",
      }}
    >
      <ol
        style={{
          listStyle: "none",
          padding: 0,
          margin: 0,
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "var(--md-space-2)",
        }}
      >
        {items.map((item, idx) => {
          const isLast = idx === items.length - 1;
          return (
            <li
              key={`${item.label}-${idx}`}
              style={{ display: "inline-flex", alignItems: "center", gap: "var(--md-space-2)" }}
            >
              {idx > 0 && <span aria-hidden="true" style={{ opacity: 0.5 }}>/</span>}
              {item.href && !isLast ? (
                <Link
                  href={item.href}
                  style={{
                    color: "inherit",
                    textDecoration: "none",
                  }}
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  aria-current={isLast ? "page" : undefined}
                  style={{ color: isLast ? "var(--md-fg)" : "inherit" }}
                >
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
