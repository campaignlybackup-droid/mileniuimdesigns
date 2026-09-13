import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { VisuallyHidden } from "@/components/ui/VisuallyHidden";

/**
 * The header shell — 10 §5.1. P14 builds the SHELL; P15 fills the navigation from
 * `navigation_items` and P19 wires the bag count.
 *
 * **No navigation labels are hardcoded here, and that is deliberate.** The menu is
 * `navigation_items` rows (08 §4.1) — nine categories plus a `/stones` link — and typing them
 * into this file would make the client's own menu a code change. It renders what it is given
 * and nothing when it is given nothing.
 */
export function SiteHeader({
  marketSegment,
  navigation = [],
}: {
  /** "" for the primary market, which has no prefix. */
  marketSegment: string;
  navigation?: { label: string; href: string }[];
}): React.ReactElement {
  const prefix = marketSegment === "" ? "" : `/${marketSegment}`;
  return (
    <header
      data-surface="ivory-soft"
      style={{
        borderBottom: "1px solid var(--md-rule)",
        paddingInline: "var(--md-gutter)",
      }}
    >
      {/* The first focusable element on every page (10 §8.2). */}
      <a
        href="#main"
        className="md-label"
        style={{
          position: "absolute",
          left: "-9999px",
          top: 0,
          padding: "var(--md-space-3) var(--md-space-4)",
          background: "var(--md-bg-inverse)",
          color: "var(--md-fg-inverse)",
        }}
        data-skip-link
      >
        Skip to content
      </a>

      <div
        style={{
          maxWidth: "var(--md-container)",
          marginInline: "auto",
          display: "flex",
          alignItems: "center",
          gap: "var(--md-space-6)",
          minHeight: 72,
        }}
      >
        <Link href={prefix === "" ? "/" : prefix} aria-label="MILLENNIUM DESIGNS — home">
          <Logo variant="wordmark" tone="green" size="md" priority />
        </Link>

        <nav aria-label="Primary" style={{ marginInlineStart: "auto" }}>
          <VisuallyHidden>Primary navigation</VisuallyHidden>
          <ul
            style={{
              display: "flex",
              gap: "var(--md-space-5)",
              listStyle: "none",
              margin: 0,
              padding: 0,
            }}
          >
            {navigation.map((item) => (
              <li key={item.href}>
                <Link href={`${prefix}${item.href}`} className="md-label">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
