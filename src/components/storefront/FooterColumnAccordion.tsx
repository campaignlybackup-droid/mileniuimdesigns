"use client";

import { useState } from "react";

export type FooterColumnProps = {
  column: {
    heading: string;
    links: { label: string; href: string }[];
  };
};

export function FooterColumnAccordion({ column }: FooterColumnProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <nav aria-label={column.heading} className="md-footer-col">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="md-footer-heading-btn"
        aria-expanded={isOpen}
        style={{
          width: "100%",
          background: "none",
          border: "none",
          padding: 0,
          textAlign: "left",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          cursor: "pointer",
        }}
      >
        <h2
          className="md-label"
          style={{
            color: "var(--md-champagne)",
            letterSpacing: "0.18em",
            margin: 0,
          }}
        >
          {column.heading}
        </h2>
        <span className="md-footer-toggle-icon" aria-hidden="true">
          {isOpen ? "−" : "+"}
        </span>
      </button>
      <ul
        className={`md-footer-content ${isOpen ? "is-open" : ""}`}
        style={{ listStyle: "none", margin: "var(--md-space-4) 0 0", padding: 0 }}
      >
        {column.links.map((link) => (
          <li key={link.href} style={{ marginBlockEnd: "var(--md-space-2)" }}>
            <a
              href={link.href}
              className="md-nav-link"
              style={{
                color: "var(--md-fg-inverse-muted)",
                textDecoration: "none",
                fontSize: "var(--md-t-small)",
                display: "inline-flex",
                alignItems: "center",
                minHeight: 40,
                transition: "color var(--md-dur-fast) ease",
              }}
            >
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
