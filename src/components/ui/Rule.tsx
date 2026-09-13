/**
 * A horizontal rule — 10 §2.1, §2.3.
 *
 * Two weights, because a decorative divider and a boundary that carries meaning are different
 * things with different contrast obligations. `hairline` is the house style at ~1.2:1;
 * `meaningful` uses `--md-rule-strong` and clears WCAG 1.4.11's 3:1. Choosing between them is
 * the author's decision and the prop makes it one, instead of leaving every divider to inherit
 * whichever weight happened to be the default.
 */
export function Rule({
  weight = "hairline",
  decorative = true,
}: {
  weight?: "hairline" | "meaningful";
  /** `false` when the rule separates content a screen reader should hear as separated. */
  decorative?: boolean;
}): React.ReactElement {
  const colour = weight === "hairline" ? "var(--md-rule)" : "var(--md-rule-strong)";
  return (
    <hr
      aria-hidden={decorative ? true : undefined}
      role={decorative ? "presentation" : "separator"}
      style={{ border: 0, borderTop: `1px solid ${colour}`, margin: 0 }}
    />
  );
}
