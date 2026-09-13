import { cva, type VariantProps } from "class-variance-authority";

/**
 * Button — 10 §3.1.
 *
 * Five variants and three sizes. **There is no `gold` variant and no gradient variant**, and
 * that is enforced by the type rather than by review: `--md-gold-antique` is a hairline and
 * small-type accent, and a gold button is the single fastest way to make a jewellery site look
 * like a jewellery site rather than like this one.
 *
 * `primary` is `--md-emerald-deep`, not `--md-green`. The brand green is a SIGNAL — the mark,
 * the focus ring, one rule — and a page full of green buttons spends the signal.
 */
const button = cva(
  [
    "inline-flex items-center justify-center gap-[var(--md-space-2)]",
    "font-[family-name:var(--md-font-sans)] font-medium",
    "uppercase tracking-[0.14em] text-[length:var(--md-t-label)]",
    "rounded-none border transition-colors",
    "duration-[var(--md-dur-fast)] ease-[var(--md-ease)]",
    "disabled:cursor-not-allowed disabled:opacity-45",
  ].join(" "),
  {
    variants: {
      variant: {
        primary:
          "bg-[var(--md-emerald-deep)] text-[var(--md-ivory-soft)] border-[var(--md-emerald-deep)] hover:bg-[var(--md-forest)] hover:border-[var(--md-forest)]",
        inverse:
          "bg-[var(--md-ivory-soft)] text-[var(--md-emerald-deep)] border-[var(--md-ivory-soft)] hover:bg-[var(--md-ivory)]",
        outline:
          "bg-transparent text-[var(--md-fg)] border-[var(--md-rule-strong)] hover:border-[var(--md-fg)]",
        ghost:
          "bg-transparent text-[var(--md-fg)] border-transparent hover:bg-[var(--md-bg-raised)]",
        link: "bg-transparent border-transparent p-0 underline underline-offset-4 text-[var(--md-fg)] normal-case tracking-normal",
      },
      size: {
        // ≥44px tall at every size (10 §8.2): a touch target smaller than a fingertip is a
        // control most people have to aim at twice.
        sm: "min-h-[44px] px-[var(--md-space-4)]",
        md: "min-h-[48px] px-[var(--md-space-5)]",
        lg: "min-h-[56px] px-[var(--md-space-6)]",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof button>;

export function Button({
  variant,
  size,
  className,
  ...props
}: ButtonProps): React.ReactElement {
  return <button className={`${button({ variant, size })} ${className ?? ""}`} {...props} />;
}
