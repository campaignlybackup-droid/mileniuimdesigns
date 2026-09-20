"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Logo } from "@/components/ui/Logo";
import { buildWhatsAppInquiryUrl } from "@/lib/whatsapp";
import { CurrencyToggle } from "@/components/storefront/CurrencyToggle";

const STONES_LIST = [
  { name: "Moonstone", slug: "moonstone" },
  { name: "Amethyst", slug: "amethyst" },
  { name: "Labradorite", slug: "labradorite" },
  { name: "Blue Topaz", slug: "blue-topaz" },
  { name: "Larimar", slug: "larimar" },
  { name: "Garnet", slug: "garnet" },
  { name: "Pearl", slug: "pearl" },
];

export type MobileNavProps = {
  marketPrefix?: string;
  navigation?: { label: string; href: string }[];
  markets?: { code: string; label: string; href: string; active: boolean }[];
};

export function MobileNav({
  marketPrefix = "",
  navigation = [],
  markets = [],
}: MobileNavProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [stonesExpanded, setStonesExpanded] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const pathname = usePathname();
  const router = useRouter();

  // Close drawer on route change using React state comparison
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    setIsOpen(false);
  }

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const whatsappUrl = buildWhatsAppInquiryUrl({ topic: "bespoke" });

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      setIsOpen(false);
      router.push(`${marketPrefix}/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };


  return (
    <div className="md-mobile-trigger">
      {/* Mobile Hamburger Toggle Button (Minimum 44x44 tap target) */}
      <button
        onClick={() => setIsOpen(true)}
        aria-label="Open mobile navigation menu"
        aria-expanded={isOpen}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 44,
          height: 44,
          background: "transparent",
          border: "none",
          cursor: "pointer",
          color: "var(--md-fg)",
          padding: 0,
        }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      {/* Backdrop overlay */}
      {isOpen && (
        <div
          onClick={() => setIsOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "color-mix(in srgb, var(--md-charcoal) 60%, transparent)",
            backdropFilter: "blur(4px)",
            zIndex: 998,
            transition: "opacity 300ms ease",
          }}
          aria-hidden="true"
        />
      )}

      {/* Slide-out Drawer from Left */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          bottom: 0,
          width: "min(88vw, 380px)",
          background: "var(--md-bg)",
          borderRight: "1px solid var(--md-rule)",
          zIndex: 999,
          display: "flex",
          flexDirection: "column",
          transform: isOpen ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 320ms cubic-bezier(0.16, 1, 0.3, 1)",
          boxShadow: isOpen ? "var(--md-shadow-drawer)" : "none",
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Mobile Navigation"
      >
        {/* Drawer Header with Logo and Close */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "var(--md-space-4) var(--md-space-5)",
            borderBottom: "1px solid var(--md-rule)",
            minHeight: 64,
          }}
        >
          <Link href={marketPrefix === "" ? "/" : marketPrefix} onClick={() => setIsOpen(false)}>
            <Logo variant="wordmark" tone="green" size="sm" />
          </Link>

          <button
            onClick={() => setIsOpen(false)}
            aria-label="Close navigation"
            style={{
              width: 44,
              height: 44,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: "var(--md-fg)",
              fontSize: "1.25rem",
            }}
          >
            ✕
          </button>
        </div>

        {/* Search Bar Input */}
        <div style={{ padding: "var(--md-space-4) var(--md-space-5)", borderBottom: "1px solid var(--md-rule)" }}>
          <form onSubmit={handleSearchSubmit} style={{ position: "relative" }}>
            <input
              type="search"
              placeholder="Search fine jewellery or stones…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                height: 42,
                paddingLeft: "36px",
                paddingRight: "12px",
                borderRadius: "var(--md-radius-sm)",
                border: "1px solid var(--md-rule-strong)",
                background: "var(--md-bg-raised)",
                color: "var(--md-fg)",
                fontSize: "0.875rem",
                outline: "none",
              }}
            />
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--md-fg-muted)"
              strokeWidth="2"
              style={{ position: "absolute", left: 12, top: 13 }}
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </form>
        </div>

        {/* Quick Currency Switcher for Mobile Connoisseurs */}
        <div
          style={{
            padding: "10px var(--md-space-5)",
            background: "var(--md-bg-raised)",
            borderBottom: "1px solid var(--md-rule)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span
            style={{
              fontSize: "0.6875rem",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--md-fg-secondary)",
              fontWeight: 600,
            }}
          >
            CURRENCY
          </span>
          <CurrencyToggle activeCode={marketPrefix.replace(/^\//, "").toUpperCase() || "US"} />
        </div>

        {/* Scrollable Navigation Links */}
        <div style={{ flex: 1, overflowY: "auto", padding: "var(--md-space-4) 0" }}>
          {/* Main Categories */}
          <div style={{ paddingInline: "var(--md-space-5)", marginBottom: "var(--md-space-2)" }}>
            <span
              style={{
                fontSize: "0.6875rem",
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "var(--md-fg-muted)",
                fontWeight: 600,
              }}
            >
              COLLECTIONS
            </span>
          </div>

          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {navigation.map((item) => (
              <li key={item.href}>
                <Link
                  href={`${marketPrefix}${item.href}`}
                  onClick={() => setIsOpen(false)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "12px var(--md-space-5)",
                    fontSize: "0.9375rem",
                    fontWeight: 500,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                    color: "var(--md-fg)",
                    textDecoration: "none",
                    borderLeft: "2px solid transparent",
                  }}
                >
                  <span>{item.label}</span>
                  <span style={{ color: "var(--md-fg-muted)", fontSize: "0.75rem" }}>→</span>
                </Link>
              </li>
            ))}
          </ul>

          {/* Dedicated Stones & Gemstones Subcategories Section */}
          <div style={{ marginTop: "var(--md-space-4)", borderTop: "1px solid var(--md-rule)", paddingTop: "var(--md-space-4)" }}>
            <div
              onClick={() => setStonesExpanded(!stonesExpanded)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                paddingInline: "var(--md-space-5)",
                cursor: "pointer",
                paddingBlock: "6px",
              }}
            >
              <span
                style={{
                  fontSize: "0.6875rem",
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "var(--md-green)",
                  fontWeight: 600,
                }}
              >
                STONES &amp; GEMSTONES
              </span>
              <span style={{ fontSize: "0.75rem", color: "var(--md-green)" }}>
                {stonesExpanded ? "–" : "+"}
              </span>
            </div>

            {stonesExpanded && (
              <ul style={{ listStyle: "none", margin: 0, padding: "4px 0 0 0" }}>
                {STONES_LIST.map((stone) => (
                  <li key={stone.slug}>
                    <Link
                      href={`${marketPrefix}/stones/${stone.slug}`}
                      onClick={() => setIsOpen(false)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        padding: "8px var(--md-space-5) 8px calc(var(--md-space-5) + 12px)",
                        fontSize: "0.875rem",
                        color: "var(--md-fg-secondary)",
                        textDecoration: "none",
                      }}
                    >
                      <span style={{ marginRight: 8, color: "var(--md-green)", fontSize: "0.75rem" }}>✦</span>
                      <span>{stone.name}</span>
                    </Link>
                  </li>
                ))}
                <li>
                  <Link
                    href={`${marketPrefix}/stones`}
                    onClick={() => setIsOpen(false)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      padding: "8px var(--md-space-5) 8px calc(var(--md-space-5) + 12px)",
                      fontSize: "0.8125rem",
                      fontWeight: 600,
                      color: "var(--md-green)",
                      textDecoration: "none",
                      letterSpacing: "0.04em",
                    }}
                  >
                    View All Gemstones →
                  </Link>
                </li>
              </ul>
            )}
          </div>

          {/* Region / Currency Switcher */}
          {markets.length > 1 && (
            <div style={{ marginTop: "var(--md-space-6)", borderTop: "1px solid var(--md-rule)", padding: "var(--md-space-5) var(--md-space-5) var(--md-space-2)" }}>
              <div style={{ fontSize: "0.6875rem", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--md-fg-secondary)", fontWeight: 600, marginBottom: 10 }}>
                CURRENCY &amp; REGION
              </div>
              <div style={{ display: "flex", gap: "var(--md-space-2)" }}>
                {markets.map((m) => (
                  <Link
                    key={m.code}
                    href={m.href}
                    onClick={() => setIsOpen(false)}
                    style={{
                      flex: 1,
                      textAlign: "center",
                      padding: "8px 12px",
                      borderRadius: "var(--md-radius-sm)",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      letterSpacing: "0.08em",
                      textDecoration: "none",
                      background: m.active ? "var(--md-fg)" : "var(--md-bg-raised)",
                      color: m.active ? "var(--md-ivory-soft)" : "var(--md-fg)",
                      border: "1px solid var(--md-rule)",
                    }}
                  >
                    {m.code === "IN" ? "🇮🇳 INR ₹" : "🇺🇸 USD $"}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Drawer Footer with WhatsApp Concierge and Account */}
        <div
          style={{
            padding: "var(--md-space-4) var(--md-space-5)",
            borderTop: "1px solid var(--md-rule)",
            background: "var(--md-bg-raised)",
            display: "flex",
            flexDirection: "column",
            gap: "var(--md-space-3)",
          }}
        >
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              height: 44,
              background: "var(--md-emerald-deep)",
              color: "var(--md-ivory-soft)",
              fontSize: "0.8125rem",
              fontWeight: 600,
              letterSpacing: "0.06em",
              textDecoration: "none",
              borderRadius: "var(--md-radius-sm)",
            }}
          >
            <span>WhatsApp Concierge</span>
            <span>→</span>
          </a>

          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8125rem" }}>
            <Link
              href={`${marketPrefix}/account`}
              onClick={() => setIsOpen(false)}
              style={{ color: "var(--md-fg)", textDecoration: "none", fontWeight: 500 }}
            >
              My Account / Client Vault
            </Link>
            <Link
              href={`${marketPrefix}/login`}
              onClick={() => setIsOpen(false)}
              style={{ color: "var(--md-green)", textDecoration: "none", fontWeight: 500 }}
            >
              Sign In
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
