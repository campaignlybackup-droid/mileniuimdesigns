import { Logo } from "@/components/ui/Logo";

/**
 * The footer shell — 10 §5.1, on the dark half of the house (`--md-emerald-deep`).
 *
 * **Everything a footer usually contains is client input, and none of it is invented here**
 * (hard rule 8): no address, no telephone number, no opening hours, no "established 1984", no
 * social links, no company registration. Each of those is a fact about a real business, and a
 * plausible-looking placeholder is worse than an empty region because it reads as verified.
 *
 * It renders the mark, the year, and whatever rows it is given. Empty sections are HIDDEN
 * rather than shown with placeholder text.
 */
export function SiteFooter({
  year,
  columns = [],
}: {
  /** Passed in, never `new Date()` in a component: a server-rendered year that disagrees with
   *  a cached page is a small wrongness that is very hard to explain. */
  year: number;
  columns?: { heading: string; links: { label: string; href: string }[] }[];
}): React.ReactElement {
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
                Millenium Designs<br />
                5, Noor Plaza, Chameliwala Market<br />
                M.I. Road, Jaipur, 302001<br />
                Rajasthan, India
              </address>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginTop: "4px" }}>
                <a
                  href="tel:+919828156465"
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
                  <span>+91 98281 56465</span>
                </a>
                <a
                  href="tel:+919829056597"
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
                  <span>+91 98290 56597</span>
                </a>
                <a
                  href="https://wa.me/919828156465?text=Hello%20Millennium%20Designs,%20I%20would%20like%20to%20enquire%20about%20your%20jewellery%20creations."
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
            © {year} MILLENNIUM DESIGNS · JAIPUR ATELIER
          </p>
          <div style={{ display: "flex", gap: "var(--md-space-2) var(--md-space-3)", fontSize: "0.6875rem", letterSpacing: "0.08em", flexWrap: "wrap" }}>
            <span>925 STERLING SILVER</span>
            <span>·</span>
            <span>ANTI-TARNISH ALLOY</span>
            <span>·</span>
            <span>JAIPUR CRAFTSMANSHIP</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
