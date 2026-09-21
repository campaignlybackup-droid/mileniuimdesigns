import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { VisuallyHidden } from "@/components/ui/VisuallyHidden";
import { HeaderActions } from "@/components/storefront/HeaderActions";
import { MobileNav } from "@/components/storefront/MobileNav";
import { CurrencyToggle } from "@/components/storefront/CurrencyToggle";

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

  // Core high-jewellery editorial navigation
  const primaryLinks = [
    { label: "High Jewellery", href: `${prefix}/rings` },
    { label: "Collections", href: `${prefix}/jewellery-sets` },
    { label: "Gemstones", href: `${prefix}/stones` },
    { label: "Atelier 1961", href: resolvedStoryHref },
  ];

  return (
    <header
      data-surface="ivory-soft"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        background: "var(--md-bg)",
        borderBottom: "1px solid var(--md-rule)",
        transition: "background 200ms ease, border-color 200ms ease",
      }}
    >
      {/* Skip to content accessibility link */}
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

      {/* Quiet, refined top announcement line */}
      <div
        style={{
          background: "var(--md-bg-raised)",
          borderBottom: "1px solid var(--md-rule)",
          paddingBlock: "6px",
          paddingInline: "var(--md-gutter)",
          textAlign: "center",
          fontSize: "0.6875rem",
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--md-fg-secondary)",
          fontFamily: "var(--md-font-sans), sans-serif",
        }}
      >
        <span>Complimentary Insured Courier Worldwide · Handcrafted In-House in Jaipur since 1961</span>
      </div>

      {/* Main Luxury Navigation Bar */}
      <div
        style={{
          maxWidth: "var(--md-container)",
          marginInline: "auto",
          paddingInline: "var(--md-gutter)",
          height: "clamp(60px, 7vw, 76px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          boxSizing: "border-box",
        }}
      >
        {/* Mobile: Hamburger Drawer Trigger */}
        <div className="md-mobile-trigger" style={{ display: "flex", alignItems: "center" }}>
          <MobileNav marketPrefix={prefix} navigation={navigation} markets={markets} />
        </div>

        {/* Desktop Left: Refined Editorial Menu Links */}
        <nav
          aria-label="Primary"
          className="md-desktop-only"
          style={{ display: "flex", alignItems: "center", gap: "clamp(16px, 2.5vw, 32px)" }}
        >
          {primaryLinks.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="md-nav-link"
              style={{
                fontSize: "0.75rem",
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "var(--md-fg)",
                fontWeight: 500,
                paddingBlock: "8px",
                whiteSpace: "nowrap",
              }}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Center: Millennium Designs Prestige Brand Wordmark */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Link
            href={prefix === "" ? "/" : prefix}
            aria-label="MILLENNIUM DESIGNS — Home"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              textDecoration: "none",
            }}
          >
            <Logo variant="wordmark" tone="green" size="md" priority />
          </Link>
        </div>

        {/* Right Section: Currency Toggle & Essential Minimal Utilities */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "clamp(10px, 1.8vw, 20px)",
            justifyContent: "flex-end",
          }}
        >
          <CurrencyToggle activeCode={marketSegment === "" ? "US" : marketSegment.toUpperCase()} />
          <HeaderActions marketPrefix={prefix} />
        </div>
      </div>
    </header>
  );
}

