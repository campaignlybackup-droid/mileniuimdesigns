import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { VisuallyHidden } from "@/components/ui/VisuallyHidden";
import { HeaderActions } from "@/components/storefront/HeaderActions";
import { MobileNav } from "@/components/storefront/MobileNav";
import { CurrencyToggle } from "@/components/storefront/CurrencyToggle";

import { type StorefrontCustomizationConfig, DEFAULT_STOREFRONT_CONFIG } from "@/lib/cms/storefrontConfig";

/**
 * The header shell — 10 §5.1.
 * Restored 2-tier luxury navbar with top prestige ribbon, brand lockup, 1-tap currency toggle,
 * header actions, and dynamic category navigation rail with diamond separators.
 * Now fully customizable via Atelier CMS (100+ settings).
 */
export function SiteHeader({
  marketSegment,
  navigation = [],
  markets = [],
  config = DEFAULT_STOREFRONT_CONFIG,
}: {
  /** "" for the primary market, which has no prefix. */
  marketSegment: string;
  navigation?: { label: string; href: string }[];
  markets?: { code: string; label: string; href: string; active: boolean }[];
  ourStoryHref?: string;
  config?: StorefrontCustomizationConfig;
}): React.ReactElement {
  const prefix = marketSegment === "" ? "" : `/${marketSegment}`;
  const isSticky = config?.headerSticky !== false;

  return (
    <header
      data-surface="ivory-soft"
      style={{
        borderBottom: "1px solid color-mix(in srgb, var(--md-champagne) 22%, var(--md-rule))",
        background: "color-mix(in srgb, var(--md-bg) 94%, transparent)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        position: isSticky ? "sticky" : "relative",
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

      {/* MINIMAL ATELIER ANNOUNCEMENT BAR */}
      {config?.announcementVisible !== false && (
        <div
          style={{
            background: config?.announcementBgColor || "var(--md-green-black)",
            color: config?.announcementTextColor || "var(--md-champagne)",
            borderBottom: "1px solid color-mix(in srgb, var(--md-champagne) 18%, transparent)",
            paddingBlock: "7px",
            paddingInline: "var(--md-gutter)",
            fontSize: "clamp(0.625rem, 1.8vw, 0.6875rem)",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            fontFamily: "var(--md-font-sans)",
            fontWeight: 500,
            textAlign: "center",
          }}
        >
          <div
            style={{
              maxWidth: "var(--md-container)",
              marginInline: "auto",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
            }}
          >
            <span
              style={{
                textAlign: "center",
                letterSpacing: "0.14em",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                paddingInline: "8px",
              }}
            >
              {config?.announcementLink ? (
                <Link href={config.announcementLink} style={{ color: "inherit", textDecoration: "none" }}>
                  {config.announcementText || "Complimentary Insured Courier on All Orders"}
                </Link>
              ) : (
                config?.announcementText || "Complimentary Insured Courier on All Orders"
              )}
            </span>
          </div>
        </div>
      )}

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
              {config?.ribbonProvenanceTag && config.ribbonProvenanceTag.trim() !== ""
                ? config.ribbonProvenanceTag.replace(/✦?\s*JAIPUR ATELIER\s*·?\s*1961/i, "✦ EST. 1961 JAIPUR")
                : "✦ EST. 1961 JAIPUR"}
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
                <Logo variant={config?.headerLogoMode === "monogram" ? "monogram" : "wordmark"} tone="green" size="sm" priority />
              </span>
              <span className="md-header-logo-desktop">
                <Logo variant={config?.headerLogoMode === "monogram" ? "monogram" : "wordmark"} tone="green" size="md" priority />
              </span>
            </Link>
          </div>

          {/* Right Section: Desktop Currency Switcher + Header Actions */}
          <div className="md-header-right" style={{ display: "flex", alignItems: "center", gap: "clamp(8px, 1.5vw, 16px)" }}>
            {config?.headerShowCurrency !== false && (
              <div className="md-desktop-currency">
                <CurrencyToggle activeCode={marketSegment === "" ? "US" : marketSegment.toUpperCase()} />
              </div>
            )}

            <HeaderActions
              marketPrefix={prefix}
              showSearch={config?.headerShowSearch !== false}
              showAccount={config?.headerShowAccount !== false}
            />
          </div>
        </div>
      </div>

      {/* TIER 2-MOBILE: HORIZONTAL SCROLLABLE CATEGORY QUICK-RAIL FOR SMARTPHONES */}
      {config?.navMobileRailVisible !== false && (
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
                  padding: "7px 14px",
                  borderRadius: "var(--md-radius-pill)",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  textDecoration: "none",
                  color: "var(--md-fg)",
                  background: "var(--md-bg)",
                  border: "1px solid var(--md-rule)",
                  flexShrink: 0,
                  minHeight: 38,
                }}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      )}

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
                {idx > 0 && config?.navShowDiamondSeparator !== false && (
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
          </ul>
        </nav>
      </div>
    </header>
  );
}
