import type { JSX } from "react";
import { getStateCopy } from "@/lib/cms/stateCopy";
import { EmptyState } from "@/components/storefront/EmptyState";

/**
 * Not-found page — 08 §4.4, 10 §5.6.
 * Reads copy.state.not_found.* from settings via CMS service.
 */
export default async function NotFound(): Promise<JSX.Element> {
  const { headline, body, action } = await getStateCopy("not_found");

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
        headline={headline}
        body={body}
        actionLabel={action}
        actionHref="/"
      />
    </main>
  );
}
