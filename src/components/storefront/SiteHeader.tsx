import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { VisuallyHidden } from "@/components/ui/VisuallyHidden";
import { HeaderActions } from "@/components/storefront/HeaderActions";
import { MobileNav } from "@/components/storefront/MobileNav";
import { CurrencyToggle } from "@/components/storefront/CurrencyToggle";

/**
 * The header shell — 10 §5.1.
 * Restored 2-tier luxury navbar with top prestige ribbon, brand lockup, 1-tap currency toggle,
 * header actions, and dynamic category navigation rail with diamond separators.
 */
export function SiteHeader({
  marketSegment,
  navigation = [],
  markets = [],
  ourStoryHref,
}: {
  /** "" for the primary market, which has no prefix. */
  marketSegment: string;
  navigation?: { label: string; href: string }[];
  markets?: { code: string; label: string; href: string; active: boolean }[];
  ourStoryHref?: string;
}): React.ReactElement {
  const prefix = marketSegment === "" ? "" : `/${marketSegment}`;
  const resolvedStoryHref = ourStoryHref || `${prefix}/our-story`;

  return (
    <header
      data-surface="ivory-soft"
      style={{
        borderBottom: "1px solid color-mix(in srgb, var(--md-champagne) 22%, var(--md-rule))",
        background: "color-mix(in srgb, var(--md-bg) 94%, transparent)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        position: "sticky",
        top: 0,
        zIndex: 50,
        boxShadow: "0 4px 24px -10px rgba(0, 0, 0, 0.05)",
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

      {/* PRESTIGE ATELIER TOP RIBBON */}
      <div
        style={{
          background: "var(--md-green-black)",
          color: "var(--md-fg-inverse)",
          borderBottom: "1px solid color-mix(in srgb, var(--md-champagne) 24%, transparent)",
          paddingBlock: "6px",
          paddingInline: "var(--md-gutter)",
          fontSize: "0.625rem",
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          fontFamily: "var(--md-font-crest), Georgia, serif",
        }}
      >
        <div
          style={{
            maxWidth: "var(--md-container)",
            marginInline: "auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span className="md-top-ribbon-desktop" style={{ color: "var(--md-champagne)", gap: "6px" }}>
            <span>✦</span> JOHARI BAZAAR, JAIPUR · EST. 1961
          </span>
          <span style={{ marginInline: "auto", textAlign: "center", letterSpacing: "0.14em" }}>
            COMPLIMENTARY INSURED WHITE-GLOVE COURIER ON ALL ORDERS
          </span>
          <span className="md-top-ribbon-desktop" style={{ color: "var(--md-champagne)" }}>
            ANTI-TARNISH 925 SILVER
          </span>
        </div>
      </div>

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

          {/* Desktop Left: Refined Our Story Crest Button */}
          <div className="md-desktop-left-tag" style={{ display: "flex", alignItems: "center" }}>
            <Link
              href={resolvedStoryHref}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "5px 12px",
                borderRadius: "var(--md-radius-sm, 0px)",
                border: "1px solid color-mix(in srgb, var(--md-champagne) 36%, transparent)",
                background: "color-mix(in srgb, var(--md-champagne) 8%, transparent)",
                color: "var(--md-fg)",
                fontSize: "0.6875rem",
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                textDecoration: "none",
                fontWeight: 600,
                fontFamily: "var(--md-font-crest), Georgia, serif",
                transition: "all 180ms ease",
                lineHeight: 1,
              }}
            >
              <span style={{ color: "var(--md-champagne)", fontSize: "0.6875rem", lineHeight: 1 }}>✦</span>
              <span>Our Story · 1961</span>
            </Link>
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

          {/* Right Section: Direct Currency Switcher + Header Actions */}
          <div className="md-header-right" style={{ display: "flex", alignItems: "center", gap: "clamp(8px, 1.5vw, 16px)" }}>
            <CurrencyToggle activeCode={marketSegment === "" ? "US" : marketSegment.toUpperCase()} />

            <HeaderActions marketPrefix={prefix} />
          </div>
        </div>
      </div>

      {/* TIER 2: DESKTOP CATEGORY NAVIGATION RAIL */}
      <div className="md-desktop-nav-tier">
        <nav aria-label="Primary" style={{ width: "100%", maxWidth: "var(--md-container)", marginInline: "auto" }}>
          <VisuallyHidden>Primary navigation</VisuallyHidden>
          <ul
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "clamp(12px, 2.2vw, 28px)",
              listStyle: "none",
              margin: 0,
              padding: 0,
              flexWrap: "nowrap",
            }}
          >
            {navigation.map((item, idx) => (
              <li
                key={item.href}
                style={{ display: "inline-flex", alignItems: "center", gap: "clamp(12px, 2.2vw, 28px)" }}
              >
                {idx > 0 && (
                  <span
                    aria-hidden="true"
                    style={{
                      color: "color-mix(in srgb, var(--md-champagne) 45%, transparent)",
                      fontSize: "0.4375rem",
                      userSelect: "none",
                      lineHeight: 1,
                    }}
                  >
                    ✦
                  </span>
                )}
                <Link
                  href={`${prefix}${item.href}`}
                  className="md-label"
                  style={{
                    fontSize: "0.71875rem",
                    letterSpacing: "0.18em",
                    textDecoration: "none",
                    color: "var(--md-fg)",
                    paddingBlock: "4px",
                    display: "inline-block",
                    whiteSpace: "nowrap",
                    transition: "color 150ms ease, transform 150ms ease",
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
