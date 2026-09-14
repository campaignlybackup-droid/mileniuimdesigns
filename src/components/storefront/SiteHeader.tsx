import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { VisuallyHidden } from "@/components/ui/VisuallyHidden";
import { HeaderActions } from "@/components/storefront/HeaderActions";
import { MobileNav } from "@/components/storefront/MobileNav";

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
  markets = [],
}: {
  /** "" for the primary market, which has no prefix. */
  marketSegment: string;
  navigation?: { label: string; href: string }[];
  markets?: { code: string; label: string; href: string; active: boolean }[];
}): React.ReactElement {
  const prefix = marketSegment === "" ? "" : `/${marketSegment}`;
  return (
    <header
      data-surface="ivory-soft"
      style={{
        borderBottom: "1px solid var(--md-rule)",
        paddingInline: "var(--md-gutter)",
        background: "var(--md-bg)",
        position: "sticky",
        top: 0,
        zIndex: 40,
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

      {/* TIER 1: BRAND LOCKUP & UTILITIES BAR */}
      <div
        style={{
          paddingInline: "var(--md-gutter)",
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        <div className="md-header-top-row">
          {/* Mobile Left: Hamburger trigger */}
          <div className="md-mobile-trigger" style={{ display: "flex", alignItems: "center" }}>
            <MobileNav marketPrefix={prefix} navigation={navigation} markets={markets} />
          </div>

          {/* Desktop Left: Atelier heritage hallmark */}
          <div className="md-desktop-left-tag" style={{ display: "flex", alignItems: "center" }}>
            <span
              className="md-label"
              style={{
                fontSize: "0.6875rem",
                color: "var(--md-fg-muted)",
                letterSpacing: "0.16em",
              }}
            >
              FINE JEWELLERY · EST. 1984
            </span>
          </div>

          {/* Center Brand Logo (Desktop and Mobile) */}
          <div className="md-header-logo-container">
            <Link
              href={prefix === "" ? "/" : prefix}
              aria-label="MILLENNIUM DESIGNS — home"
              style={{ display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}
            >
              <span className="md-header-logo-mobile">
                <Logo variant="wordmark" tone="green" size="sm" priority />
              </span>
              <span className="md-header-logo-desktop">
                <Logo variant="wordmark" tone="green" size="md" priority />
              </span>
            </Link>
          </div>

          {/* Right Section: Markets Switcher + Header Actions */}
          <div className="md-header-right">
            {markets.length > 1 && (
              <div
                className="md-desktop-markets"
                style={{
                  alignItems: "center",
                  gap: "var(--md-space-2)",
                  paddingRight: "var(--md-space-3)",
                  borderRight: "1px solid var(--md-rule)",
                }}
                aria-label="Market selection"
              >
                {markets.map((m) => (
                  <Link
                    key={m.code}
                    href={m.href}
                    className="md-label"
                    style={{
                      fontSize: "0.6875rem",
                      color: m.active ? "var(--md-fg)" : "var(--md-fg-secondary)",
                      borderBottom: m.active ? "1.5px solid var(--md-fg)" : "1.5px solid transparent",
                      paddingBottom: "1px",
                      textDecoration: "none",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {m.label}
                  </Link>
                ))}
              </div>
            )}

            <HeaderActions marketPrefix={prefix} />
          </div>
        </div>
      </div>

      {/* TIER 2: DESKTOP CATEGORY NAVIGATION RAIL (Visible on desktop >= 1024px) */}
      <div className="md-desktop-nav-tier">
        <nav aria-label="Primary" style={{ width: "100%", maxWidth: "var(--md-container)", marginInline: "auto" }}>
          <VisuallyHidden>Primary navigation</VisuallyHidden>
          <ul
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "clamp(12px, 2.2vw, 32px)",
              listStyle: "none",
              margin: 0,
              padding: 0,
              flexWrap: "wrap",
            }}
          >
            {navigation.map((item) => (
              <li key={item.href}>
                <Link
                  href={`${prefix}${item.href}`}
                  className="md-label"
                  style={{
                    fontSize: "0.75rem",
                    letterSpacing: "0.14em",
                    textDecoration: "none",
                    color: "var(--md-fg)",
                    paddingBlock: "6px",
                    display: "inline-block",
                    whiteSpace: "nowrap",
                    transition: "color 150ms ease",
                  }}
                >
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

