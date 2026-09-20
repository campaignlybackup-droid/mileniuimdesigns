"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function CurrencyToggle({
  activeCode,
  className,
}: {
  activeCode: string;
  className?: string;
}): React.ReactElement {
  const pathname = usePathname() || "/";

  // Calculate destination for USD (primary, no prefix)
  // If pathname starts with /in, strip /in
  const usdHref = pathname.startsWith("/in")
    ? pathname.replace(/^\/in(\/|$)/, "/") || "/"
    : pathname;

  // Calculate destination for INR (prefix /in)
  // If pathname doesn't start with /in, prepend /in
  const inrHref = pathname.startsWith("/in")
    ? pathname
    : pathname === "/"
      ? "/in"
      : `/in${pathname}`;

  const isUSD = activeCode.toUpperCase() === "US";

  return (
    <div
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        background: "color-mix(in srgb, var(--md-fg) 6%, transparent)",
        borderRadius: "999px",
        padding: "2px",
        border: "1px solid color-mix(in srgb, var(--md-champagne) 32%, var(--md-rule))",
      }}
      role="group"
      aria-label="Currency selection"
    >
      <Link
        href={usdHref}
        aria-label="Switch currency to US Dollar ($)"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "3px",
          padding: "4px 8px",
          borderRadius: "999px",
          fontSize: "0.6875rem",
          fontWeight: isUSD ? 600 : 500,
          letterSpacing: "0.06em",
          textDecoration: "none",
          background: isUSD ? "var(--md-fg)" : "transparent",
          color: isUSD ? "var(--md-ivory-soft)" : "var(--md-fg-secondary)",
          transition: "all 150ms ease",
          lineHeight: 1,
          whiteSpace: "nowrap",
        }}
      >
        <span>$</span>
        <span style={{ fontSize: "0.625rem" }}>USD</span>
      </Link>

      <Link
        href={inrHref}
        aria-label="Switch currency to Indian Rupee (₹)"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "3px",
          padding: "4px 8px",
          borderRadius: "999px",
          fontSize: "0.6875rem",
          fontWeight: !isUSD ? 600 : 500,
          letterSpacing: "0.06em",
          textDecoration: "none",
          background: !isUSD ? "var(--md-fg)" : "transparent",
          color: !isUSD ? "var(--md-ivory-soft)" : "var(--md-fg-secondary)",
          transition: "all 150ms ease",
          lineHeight: 1,
          whiteSpace: "nowrap",
        }}
      >
        <span>₹</span>
        <span style={{ fontSize: "0.625rem" }}>INR</span>
      </Link>
    </div>
  );
}
