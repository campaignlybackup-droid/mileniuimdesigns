import type { JSX } from "react";
import Link from "next/link";

export type PaginationProps = {
  currentPage: number;
  totalPages: number;
  basePath: string;
  searchParams?: Record<string, string | string[] | undefined>;
  className?: string;
};

export function Pagination({
  currentPage,
  totalPages,
  basePath,
  searchParams = {},
  className,
}: PaginationProps): JSX.Element | null {
  if (totalPages <= 1) return null;

  const buildPageUrl = (page: number) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) {
      if (k === "page") continue;
      if (Array.isArray(v)) {
        for (const item of v) params.append(k, item);
      } else if (v !== undefined) {
        params.append(k, v);
      }
    }
    if (page > 1) {
      params.set("page", page.toString());
    }
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  const pages: (number | "...")[] = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== "...") {
      pages.push("...");
    }
  }

  return (
    <nav
      aria-label="Pagination"
      className={className}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "var(--md-space-2)",
        paddingBlock: "var(--md-space-8)",
        fontSize: "var(--md-t-label, 0.75rem)",
        letterSpacing: "0.08em",
        textTransform: "uppercase",
      }}
    >
      {currentPage > 1 ? (
        <Link
          href={buildPageUrl(currentPage - 1)}
          rel="prev"
          style={{
            minHeight: 44,
            minWidth: 44,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 var(--md-space-4)",
            border: "1px solid var(--md-rule)",
            color: "var(--md-fg)",
            textDecoration: "none",
            borderRadius: "var(--md-radius-sm)",
          }}
        >
          Previous
        </Link>
      ) : (
        <span
          style={{
            minHeight: 44,
            minWidth: 44,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 var(--md-space-4)",
            border: "1px solid var(--md-rule)",
            color: "var(--md-fg-secondary)",
            opacity: 0.4,
            borderRadius: "var(--md-radius-sm)",
          }}
        >
          Previous
        </span>
      )}

      {pages.map((p, idx) => {
        if (p === "...") {
          return (
            <span
              key={`dots-${idx}`}
              style={{
                minHeight: 44,
                minWidth: 32,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--md-fg-secondary)",
              }}
            >
              …
            </span>
          );
        }
        const isActive = p === currentPage;
        return (
          <Link
            key={p}
            href={buildPageUrl(p)}
            aria-current={isActive ? "page" : undefined}
            style={{
              minHeight: 44,
              minWidth: 44,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0 var(--md-space-3)",
              border: `1px solid ${isActive ? "var(--md-fg)" : "var(--md-rule)"}`,
              background: isActive ? "var(--md-fg)" : "transparent",
              color: isActive ? "var(--md-bg)" : "var(--md-fg)",
              textDecoration: "none",
              textAlign: "center",
              borderRadius: "var(--md-radius-sm)",
            }}
          >
            {p}
          </Link>
        );
      })}

      {currentPage < totalPages ? (
        <Link
          href={buildPageUrl(currentPage + 1)}
          rel="next"
          style={{
            minHeight: 44,
            minWidth: 44,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 var(--md-space-4)",
            border: "1px solid var(--md-rule)",
            color: "var(--md-fg)",
            textDecoration: "none",
            borderRadius: "var(--md-radius-sm)",
          }}
        >
          Next
        </Link>
      ) : (
        <span
          style={{
            minHeight: 44,
            minWidth: 44,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 var(--md-space-4)",
            border: "1px solid var(--md-rule)",
            color: "var(--md-fg-secondary)",
            opacity: 0.4,
            borderRadius: "var(--md-radius-sm)",
          }}
        >
          Next
        </span>
      )}
    </nav>
  );
}
