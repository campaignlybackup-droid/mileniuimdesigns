import Image from "next/image";

/**
 * The logo — 10 §3.1, 01 §5.10.
 *
 * **`variant` and `tone`, and nothing else.** No `className`, no `style`, no colour, no
 * transform, no filter, no independent width and height. This component IS the enforcement
 * mechanism for "use the logo as-is, never redesigned": a prop that could distort the mark is
 * a prop that eventually does, usually on one page, at one breakpoint, that nobody opens again.
 *
 * `size` sets a HEIGHT only and the width follows from the intrinsic ratio, so the mark cannot
 * be stretched by giving it a box of the wrong shape.
 */

export type LogoVariant = "wordmark" | "monogram";
export type LogoTone = "green" | "ivory";

const SOURCES: Record<LogoVariant, Record<LogoTone, string>> = {
  wordmark: {
    green: "/brand/wordmark-green.png",
    ivory: "/brand/wordmark-ivory.png",
  },
  monogram: {
    green: "/brand/monogram.png",
    ivory: "/brand/monogram.png",
  },
};

/** Intrinsic ratios of the supplied artwork, used only to reserve layout space. */
const RATIO: Record<LogoVariant, number> = {
  wordmark: 9.57,
  monogram: 1,
};

const HEIGHTS = { sm: 18, md: 28, lg: 44, xl: 72 } as const;
export type LogoSize = keyof typeof HEIGHTS;

export function Logo({
  variant = "wordmark",
  tone = "green",
  size = "md",
  priority = false,
}: {
  variant?: LogoVariant;
  tone?: LogoTone;
  size?: LogoSize;
  /** Only the header lockup should set this. */
  priority?: boolean;
}): React.ReactElement {
  const height = HEIGHTS[size];
  const width = Math.round(height * RATIO[variant]);
  return (
    <Image
      src={SOURCES[variant][tone]}
      // The alt text is the company's name, not a description of the artwork. A screen reader
      // announcing "green M monogram with crescent" is reading the design, not the brand.
      alt="MILLENNIUM DESIGNS"
      width={width}
      height={height}
      priority={priority}
      // `tone` is a data attribute, not a filter. The ivory tone is a SEPARATE artwork state
      // the client supplies; inverting or hue-rotating the green mark to make a light one is
      // the redesign this component exists to prevent.
      data-tone={tone}
      style={{ height, width: "auto" }}
    />
  );
}
