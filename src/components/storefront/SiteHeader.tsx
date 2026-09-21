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
        paddingTop: "env(safe-area-inset-top, 0px)",
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
          paddingBlock: "5px",
          paddingInline: "var(--md-gutter)",
          fontSize: "clamp(0.5625rem, 1.8vw, 0.625rem)",
          letterSpacing: "0.16em",
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
            overflow: "hidden",
          }}
        >
          <span className="md-top-ribbon-desktop" style={{ color: "var(--md-champagne)", gap: "6px", whiteSpace: "nowrap" }}>
            <span>✦</span> JOHARI BAZAAR, JAIPUR · EST. 1961
          </span>
          <span
            style={{
              marginInline: "auto",
              textAlign: "center",
              letterSpacing: "0.12em",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              paddingInline: "8px",
            }}
          >
            COMPLIMENTARY INSURED WHITE-GLOVE COURIER ON ALL ORDERS
          </span>
          <span className="md-top-ribbon-desktop" style={{ color: "var(--md-champagne)", whiteSpace: "nowrap" }}>
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

          {/* Desktop Left: Quiet Provenance Hallmark */}
          <div className="md-desktop-left-tag" style={{ display: "flex", alignItems: "center" }}>
            <span
              style={{
                fontSize: "0.6875rem",
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: "var(--md-fg-secondary)",
                fontWeight: 500,
                fontFamily: "var(--md-font-crest), Georgia, serif",
              }}
            >
              ✦ JAIPUR ATELIER · 1961
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

          {/* Right Section: Desktop Currency Switcher + Header Actions */}
          <div className="md-header-right" style={{ display: "flex", alignItems: "center", gap: "clamp(8px, 1.5vw, 16px)" }}>
            <div className="md-desktop-currency">
              <CurrencyToggle activeCode={marketSegment === "" ? "US" : marketSegment.toUpperCase()} />
            </div>

            <HeaderActions marketPrefix={prefix} />
          </div>
        </div>
      </div>

      {/* TIER 2-MOBILE: HORIZONTAL SCROLLABLE CATEGORY QUICK-RAIL FOR SMARTPHONES */}
      <div className="md-mobile-nav-rail">
        <nav
          aria-label="Mobile Categories"
          style={{
            overflowX: "auto",
            scrollbarWidth: "none",
            msOverflowStyle: "none",
            WebkitOverflowScrolling: "touch",
            padding: "6px var(--md-gutter)",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            borderTop: "1px solid color-mix(in srgb, var(--md-champagne) 18%, var(--md-rule))",
            background: "color-mix(in srgb, var(--md-bg-raised) 75%, transparent)",
          }}
        >
          {navigation.map((item) => (
            <Link
              key={item.href}
              href={`${prefix}${item.href}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                whiteSpace: "nowrap",
                padding: "4px 10px",
                borderRadius: "var(--md-radius-pill)",
                fontSize: "0.625rem",
                fontWeight: 600,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                textDecoration: "none",
                color: "var(--md-fg)",
                background: "var(--md-bg)",
                border: "1px solid var(--md-rule)",
                flexShrink: 0,
                minHeight: 28,
              }}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>

      {/* TIER 2-DESKTOP: CATEGORY NAVIGATION RAIL */}
      <div className="md-desktop-nav-tier">
        <nav
          aria-label="Primary"
          style={{
            width: "100%",
            maxWidth: "100%",
            overflowX: "auto",
            scrollbarWidth: "none",
            msOverflowStyle: "none",
            WebkitOverflowScrolling: "touch",
          }}
        >
          <VisuallyHidden>Primary navigation</VisuallyHidden>
          <ul
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "safe center",
              gap: "clamp(6px, 1.15vw, 18px)",
              listStyle: "none",
              margin: "0 auto",
              padding: "0 var(--md-gutter)",
              width: "max-content",
              minWidth: "100%",
              boxSizing: "border-box",
              flexWrap: "nowrap",
            }}
          >
            {navigation.map((item, idx) => (
              <li
                key={item.href}
                style={{ display: "inline-flex", alignItems: "center", gap: "clamp(6px, 1.15vw, 18px)" }}
              >
                {idx > 0 && (
                  <span
                    aria-hidden="true"
                    style={{
                      color: "color-mix(in srgb, var(--md-champagne) 45%, transparent)",
                      fontSize: "0.375rem",
                      userSelect: "none",
                      lineHeight: 1,
                    }}
                  >
                    ✦
                  </span>
                )}
                <Link
                  href={`${prefix}${item.href}`}
                  className="md-label md-nav-rail-link"
                  style={{
                    fontSize: "clamp(0.65625rem, 0.72vw, 0.71875rem)",
                    letterSpacing: "clamp(0.08em, 0.1vw, 0.12em)",
                    textDecoration: "none",
                    color: "var(--md-fg)",
                    fontWeight: 600,
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
            {/* Our Story option in the primary navigation rail */}
            <li style={{ display: "inline-flex", alignItems: "center", gap: "clamp(6px, 1.15vw, 18px)" }}>
              <span
                aria-hidden="true"
                style={{
                  color: "color-mix(in srgb, var(--md-champagne) 45%, transparent)",
                  fontSize: "0.375rem",
                  userSelect: "none",
                  lineHeight: 1,
                }}
              >
                ✦
              </span>
              <Link
                href={resolvedStoryHref}
                className="md-label md-nav-rail-link"
                style={{
                  fontSize: "clamp(0.65625rem, 0.72vw, 0.71875rem)",
                  letterSpacing: "clamp(0.08em, 0.1vw, 0.12em)",
                  textDecoration: "none",
                  color: "var(--md-green)",
                  fontWeight: 600,
                  paddingBlock: "4px",
                  display: "inline-block",
                  whiteSpace: "nowrap",
                  transition: "color 150ms ease",
                }}
              >
                OUR STORY
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </header>
  );
}
