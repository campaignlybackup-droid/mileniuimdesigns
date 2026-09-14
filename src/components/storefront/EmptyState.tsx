import type { JSX } from "react";
import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { Button } from "@/components/ui/Button";

export type EmptyStateProps = {
  headline: string;
  body?: string | null;
  actionLabel?: string | null;
  actionHref?: string;
  onAction?: () => void;
  className?: string;
};

/**
 * EmptyState — 10 §5.6.
 *
 * Layout:
 * - A --md-container-text column, centred, with the monogram at 32px above it.
 * - Headline in --md-t-display (sentence case).
 * - Body in --md-t-body-lg at 46ch measure.
 * - Action as a single outline Button in --md-t-label.
 * - Empty body renders nothing; empty action renders nothing (hard rule 8).
 */
export function EmptyState({
  headline,
  body,
  actionLabel,
  actionHref,
  onAction,
  className,
}: EmptyStateProps): JSX.Element {
  return (
    <div
      className={className}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        paddingBlock: "var(--md-space-16, 64px)",
        paddingInline: "var(--md-gutter)",
        maxWidth: "var(--md-container-text, 680px)",
        marginInline: "auto",
        width: "100%",
        boxSizing: "border-box",
      }}
    >
      <div style={{ marginBottom: "var(--md-space-8, 32px)" }}>
        <Logo variant="monogram" tone="green" size="sm" />
      </div>

      <h2
        style={{
          margin: 0,
          fontSize: "var(--md-t-display, 2rem)",
          fontWeight: 400,
          letterSpacing: "-0.02em",
          color: "var(--md-fg)",
          lineHeight: 1.2,
        }}
      >
        {headline}
      </h2>

      {body && body.trim().length > 0 && (
        <p
          style={{
            margin: "var(--md-space-4) 0 0 0",
            fontSize: "var(--md-t-body-lg, 1.125rem)",
            color: "var(--md-fg-muted)",
            maxWidth: "46ch",
            lineHeight: 1.5,
          }}
        >
          {body}
        </p>
      )}

      {actionLabel && actionLabel.trim().length > 0 && (
        <div style={{ marginTop: "var(--md-space-8, 32px)" }}>
          {actionHref ? (
            <Link href={actionHref} style={{ textDecoration: "none" }}>
              <Button variant="outline" size="md">
                {actionLabel}
              </Button>
            </Link>
          ) : (
            <Button variant="outline" size="md" onClick={onAction}>
              {actionLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
