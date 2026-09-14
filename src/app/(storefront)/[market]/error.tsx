"use client";

import { useEffect, type JSX } from "react";
import { EmptyState } from "@/components/storefront/EmptyState";

/**
 * Storefront error boundary — 08 §4.4, 10 §5.6.
 *
 * Reads from constants ONLY, never from settings or database,
 * because database failure may be the cause of the 500 error itself.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): JSX.Element {
  useEffect(() => {
    // Log to reporting / Sentry
    console.error("Storefront runtime error:", error);
  }, [error]);

  return (
    <main
      id="main"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "70vh",
        paddingInline: "var(--md-gutter)",
      }}
    >
      <EmptyState
        headline="Something went wrong"
        body="We have been notified. Please try again shortly."
        actionLabel="TRY AGAIN"
        onAction={reset}
      />
    </main>
  );
}
