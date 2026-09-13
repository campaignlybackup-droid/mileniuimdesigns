/**
 * A small, exact colour pipeline for the token contrast test — 10 §2.1, §8.2.
 *
 * No dependency, because the thing being checked is a hand-written stylesheet and a library
 * that silently normalises an unparseable value would turn a broken token into a passing test.
 * Anything this cannot parse THROWS, which is the correct outcome: an unrecognised colour in
 * `tokens.css` is exactly what the test is for.
 *
 * Supports what `tokens.css` actually uses: hex, `var()` chains, and
 * `color-mix(in oklab, <colour> <pct>, <colour>|transparent)`.
 */

export type Rgba = { r: number; g: number; b: number; a: number };

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

export function parseHex(value: string): Rgba {
  const m = HEX.exec(value.trim());
  if (!m) throw new Error(`Not a hex colour: '${value}'`);
  let h = m[1]!;
  if (h.length === 3)
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  const n = (i: number): number => parseInt(h.slice(i, i + 2), 16) / 255;
  return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) : 1 };
}

// ── sRGB ↔ linear ↔ Oklab ──────────────────────────────────────────────────────────────
const toLinear = (c: number): number =>
  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
const toSrgb = (c: number): number =>
  c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;

type Oklab = { L: number; a: number; b: number; alpha: number };

export function rgbaToOklab({ r, g, b, a }: Rgba): Oklab {
  const R = toLinear(r);
  const G = toLinear(g);
  const B = toLinear(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    alpha: a,
  };
}

export function oklabToRgba({ L, a, b, alpha }: Oklab): Rgba {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const clamp = (x: number): number => Math.min(1, Math.max(0, x));
  return {
    r: clamp(toSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)),
    g: clamp(toSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)),
    b: clamp(toSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)),
    a: alpha,
  };
}

/** `color-mix(in oklab, A p%, B)` — A at `p`, B at the remainder. */
export function mixOklab(a: Rgba, weightA: number, b: Rgba): Rgba {
  const A = rgbaToOklab(a);
  const B = rgbaToOklab(b);
  const w = weightA;
  return oklabToRgba({
    L: A.L * w + B.L * (1 - w),
    a: A.a * w + B.a * (1 - w),
    b: A.b * w + B.b * (1 - w),
    alpha: A.alpha * w + B.alpha * (1 - w),
  });
}

/** Composite a possibly-translucent colour over an opaque backdrop. */
export function over(fg: Rgba, bg: Rgba): Rgba {
  if (fg.a >= 1) return fg;
  return {
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  };
}

export function relativeLuminance({ r, g, b }: Rgba): number {
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/** WCAG 2.1 contrast ratio. Both arguments must already be opaque. */
export function contrastRatio(fg: Rgba, bg: Rgba): number {
  const a = relativeLuminance(fg);
  const b = relativeLuminance(bg);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

// ── Token resolution ───────────────────────────────────────────────────────────────────

const TRANSPARENT: Rgba = { r: 0, g: 0, b: 0, a: 0 };

/**
 * Resolve a token's declared value to an RGBA, following `var()` chains and evaluating
 * `color-mix`. Throws on anything it does not understand, by design.
 */
export function resolveToken(
  name: string,
  declarations: Map<string, string>,
  seen = new Set<string>(),
): Rgba {
  if (seen.has(name)) throw new Error(`Cyclic token reference at '${name}'`);
  seen.add(name);

  const raw = declarations.get(name);
  if (raw === undefined) throw new Error(`Token '${name}' is not declared in tokens.css`);
  return resolveValue(raw, declarations, seen);
}

export function resolveValue(
  raw: string,
  declarations: Map<string, string>,
  seen = new Set<string>(),
): Rgba {
  const value = raw.trim();
  if (value === "transparent") return TRANSPARENT;
  if (HEX.test(value)) return parseHex(value);

  const varMatch = /^var\(\s*(--[\w-]+)\s*\)$/.exec(value);
  if (varMatch) return resolveToken(varMatch[1]!, declarations, seen);

  const mix = /^color-mix\(\s*in\s+oklab\s*,\s*(.+?)\s+(\d+(?:\.\d+)?)%\s*,\s*(.+?)\s*\)$/.exec(
    value,
  );
  if (mix) {
    const a = resolveValue(mix[1]!, declarations, new Set(seen));
    const b = resolveValue(mix[3]!, declarations, new Set(seen));
    return mixOklab(a, Number(mix[2]) / 100, b);
  }

  throw new Error(`Cannot resolve colour value '${raw}'`);
}

/** Every custom property declared in a `:root` or `[data-surface=…]` block. */
export function declarationsIn(css: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of css.matchAll(/^\s*(--[\w-]+)\s*:\s*([^;]+);/gm)) {
    if (!out.has(m[1]!)) out.set(m[1]!, m[2]!.trim());
  }
  return out;
}

/** Declarations scoped to one `[data-surface="…"]` selector, layered over `:root`. */
export function surfaceDeclarations(css: string, surface: string): Map<string, string> {
  const base = declarationsIn(css.slice(0, css.indexOf("[data-surface")));
  const pattern = new RegExp(`\\[data-surface="${surface}"\\][^{]*\\{([^}]*)\\}`, "g");
  for (const m of css.matchAll(pattern)) {
    for (const d of m[1]!.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) base.set(d[1]!, d[2]!.trim());
  }
  // A grouped selector — `[data-surface="a"], [data-surface="b"] { … }` — is matched by the
  // pattern above only when the named surface is FIRST. Handle the grouped form too.
  for (const m of css.matchAll(
    /\[data-surface="[^"]+"\](?:\s*,\s*\[data-surface="[^"]+"\])+\s*\{([^}]*)\}/g,
  )) {
    const selectors = [...m[0].matchAll(/\[data-surface="([^"]+)"\]/g)].map((s) => s[1]!);
    if (!selectors.includes(surface)) continue;
    for (const d of m[1]!.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) base.set(d[1]!, d[2]!.trim());
  }
  // …and the single-selector block for this surface must win over the grouped one.
  for (const m of css.matchAll(
    new RegExp(`\\[data-surface="${surface}"\\]\\s*\\{([^}]*)\\}`, "g"),
  )) {
    for (const d of m[1]!.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) base.set(d[1]!, d[2]!.trim());
  }
  return base;
}
