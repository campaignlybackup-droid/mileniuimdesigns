import { Logo } from "@/components/ui/Logo";
import { type StorefrontCustomizationConfig, DEFAULT_STOREFRONT_CONFIG } from "@/lib/cms/storefrontConfig";

/**
 * The footer shell — 10 §5.1, on the dark half of the house (`--md-emerald-deep`).
 * Now fully customizable via Atelier CMS (100+ settings).
 */
export function SiteFooter({
  year,
  columns = [],
  config = DEFAULT_STOREFRONT_CONFIG,
}: {
  /** Passed in, never `new Date()` in a component: a server-rendered year that disagrees with
   *  a cached page is a small wrongness that is very hard to explain. */
  year: number;
  columns?: { heading: string; links: { label: string; href: string }[] }[];
  config?: StorefrontCustomizationConfig;
}): React.ReactElement {
  const whatsappUrl = `https://wa.me/${config?.whatsappConciergeNumber || "919828156465"}?text=${encodeURIComponent(
    config?.whatsappConciergeGreeting || "Hello Millennium Designs, I would like to enquire about your jewellery creations."
  )}`;
  return (
    <footer
      data-surface="emerald-deep"
      style={{
        paddingInline: "var(--md-gutter)",
        paddingBlock: "var(--md-space-9) calc(var(--md-space-6) + env(safe-area-inset-bottom, 0px))",
        marginBlockStart: "var(--md-space-10)",
      }}
    >
      <div style={{ maxWidth: "var(--md-container)", marginInline: "auto" }}>
        <Logo variant="wordmark" tone="ivory" size="lg" />

        {columns.length > 0 && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: "var(--md-space-7)",
              marginBlockStart: "var(--md-space-8)",
            }}
          >
            {columns.map((column) => (
              <nav key={column.heading} aria-label={column.heading}>
                <h2 className="md-label" style={{ color: "var(--md-champagne)", letterSpacing: "0.18em" }}>
                  {column.heading}
                </h2>
                <ul style={{ listStyle: "none", margin: "var(--md-space-4) 0 0", padding: 0 }}>
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
                          minHeight: 36,
                          transition: "color var(--md-dur-fast) ease",
                        }}
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}

            {/* Atelier Contact & Location */}
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--md-space-3)" }}>
              <h2 className="md-label" style={{ color: "var(--md-champagne)", letterSpacing: "0.18em" }}>
                JAIPUR ATELIER &amp; CONTACT
              </h2>
              <address style={{ fontStyle: "normal", color: "var(--md-fg-inverse-muted)", fontSize: "var(--md-t-small)", lineHeight: 1.6 }}>
                {config?.atelierAddressName || "Millenium Designs"}<br />
                {config?.atelierAddressLine1 || "5, Noor Plaza, Chameliwala Market"}<br />
                {config?.atelierAddressLine2 ? <>{config.atelierAddressLine2}<br /></> : null}
                {config?.atelierCity || "Jaipur"}, {config?.atelierPostalCode || "302001"}<br />
                {config?.atelierState || "Rajasthan"}, {config?.atelierCountry || "India"}
              </address>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginTop: "4px" }}>
                {config?.directPhonePrimary && (
                  <a
                    href={`tel:${config.directPhonePrimary.replace(/[^+\d]/g, "")}`}
                    style={{
                      color: "var(--md-fg-inverse-muted)",
                      textDecoration: "none",
                      fontSize: "var(--md-t-small)",
                      display: "inline-flex",
                      alignItems: "center",
                      minHeight: 44,
                      gap: "8px",
                    }}
                  >
                    <span style={{ fontSize: "0.6875rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--md-champagne)", fontWeight: 600 }}>Direct</span>
                    <span>{config.directPhonePrimary}</span>
                  </a>
                )}
                {config?.directPhoneSecondary && (
                  <a
                    href={`tel:${config.directPhoneSecondary.replace(/[^+\d]/g, "")}`}
                    style={{
                      color: "var(--md-fg-inverse-muted)",
                      textDecoration: "none",
                      fontSize: "var(--md-t-small)",
                      display: "inline-flex",
                      alignItems: "center",
                      minHeight: 44,
                      gap: "8px",
                    }}
                  >
                    <span style={{ fontSize: "0.6875rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--md-champagne)", fontWeight: 600 }}>Atelier</span>
                    <span>{config.directPhoneSecondary}</span>
                  </a>
                )}
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: "var(--md-champagne)",
                    textDecoration: "none",
                    fontSize: "var(--md-t-small)",
                    display: "inline-flex",
                    alignItems: "center",
                    minHeight: 44,
                    gap: "6px",
                    fontWeight: 600,
                  }}
                >
                  <span>WhatsApp Concierge →</span>
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Social Media Links Bar */}
        {(config?.socialInstagramUrl || config?.socialFacebookUrl || config?.socialPinterestUrl || config?.socialYoutubeUrl) && (
          <div
            style={{
              marginBlockStart: "var(--md-space-6)",
              paddingBlockStart: "var(--md-space-4)",
              display: "flex",
              gap: "16px",
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <span style={{ fontSize: "0.6875rem", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--md-champagne)", fontWeight: 600 }}>
              Follow The Atelier:
            </span>
            {config?.socialInstagramUrl && (
              <a href={config.socialInstagramUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--md-fg-inverse-muted)", fontSize: "0.8125rem", textDecoration: "none" }}>
                Instagram
              </a>
            )}
            {config?.socialFacebookUrl && (
              <a href={config.socialFacebookUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--md-fg-inverse-muted)", fontSize: "0.8125rem", textDecoration: "none" }}>
                Facebook
              </a>
            )}
            {config?.socialPinterestUrl && (
              <a href={config.socialPinterestUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--md-fg-inverse-muted)", fontSize: "0.8125rem", textDecoration: "none" }}>
                Pinterest
              </a>
            )}
            {config?.socialYoutubeUrl && (
              <a href={config.socialYoutubeUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--md-fg-inverse-muted)", fontSize: "0.8125rem", textDecoration: "none" }}>
                YouTube
              </a>
            )}
          </div>
        )}

        <div
          style={{
            marginBlockStart: "var(--md-space-8)",
            paddingBlockStart: "var(--md-space-5)",
            borderTop: "1px solid color-mix(in srgb, var(--md-fg-inverse) 14%, transparent)",
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "var(--md-space-3) var(--md-space-4)",
            color: "var(--md-fg-inverse-muted)",
            fontSize: "var(--md-t-small)",
          }}
        >
          <p style={{ margin: 0 }}>
            © {year} {config?.footerCopyrightNotice || "MILLENNIUM DESIGNS · JAIPUR ATELIER 1961"}
          </p>
          <div style={{ display: "flex", gap: "var(--md-space-2) var(--md-space-3)", fontSize: "0.6875rem", letterSpacing: "0.08em", flexWrap: "wrap" }}>
            <span>{config?.footerHallmarkStrip || "925 STERLING SILVER · ANTI-TARNISH ALLOY · JAIPUR CRAFTSMANSHIP"}</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
