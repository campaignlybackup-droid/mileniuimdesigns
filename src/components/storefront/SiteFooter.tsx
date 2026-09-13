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
        paddingBlock: "var(--md-space-9) var(--md-space-6)",
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
                <h2 className="md-label" style={{ color: "var(--md-fg-secondary)" }}>
                  {column.heading}
                </h2>
                <ul style={{ listStyle: "none", margin: "var(--md-space-4) 0 0", padding: 0 }}>
                  {column.links.map((link) => (
                    <li key={link.href} style={{ marginBlockEnd: "var(--md-space-2)" }}>
                      <a href={link.href}>{link.label}</a>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        )}

        <p
          style={{
            marginBlockStart: "var(--md-space-8)",
            paddingBlockStart: "var(--md-space-4)",
            borderTop: "1px solid var(--md-rule)",
            color: "var(--md-fg-secondary)",
            fontSize: "var(--md-t-small)",
          }}
        >
          © {year} MILLENNIUM DESIGNS
        </p>
      </div>
    </footer>
  );
}
