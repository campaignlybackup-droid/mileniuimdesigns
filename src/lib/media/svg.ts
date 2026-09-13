import "server-only";
import createDOMPurify from "dompurify";
import { JSDOM } from "jsdom";

/**
 * SVG sanitisation — 06 §7.10 layer 2. See docs/decisions/0012-svg-sanitisation.md.
 *
 * This is the only layer that stops a hostile file being STORED. It runs server-side,
 * before the bytes reach the provider — which is possible only because SVG is the one
 * kind that does not use the signed direct upload (06 §7.1). An earlier draft had the
 * client uploading straight to Cloudinary AND a server-side sanitiser, which cannot both
 * be true: the sanitiser would never have run.
 */

export type SanitiseResult = {
  svg: Buffer;
  /**
   * What was stripped, surfaced to the uploader. Silent stripping teaches nobody.
   *
   * THIS is what a "we modified your file" message should key on — not `changed`.
   */
  removed: string[];
  /**
   * Whether the output bytes differ from the input. Note this is true for harmless
   * re-serialisation too: DOMPurify normalises `<path/>` to `<path></path>` and reorders
   * nothing meaningful. A benign file therefore has `changed === true` and
   * `removed === []`, and telling the uploader their file was altered on that basis would
   * be technically true and useless.
   */
  changed: boolean;
};

const FORBID_TAGS = [
  "script",
  // Wraps arbitrary HTML — the most direct escape from the SVG grammar.
  "foreignObject",
  // `<use href="https://evil.test/x#y">` pulls in an external document.
  "use",
  // `<image href="...">` is an outbound request, and a tracking pixel at minimum.
  "image",
  // SMIL animation can carry event handlers and can set attributes post-sanitisation.
  "animate", "animateTransform", "animateMotion", "set", "handler",
];

const FORBID_ATTR = ["onload", "onerror", "onclick", "onmouseover", "onfocus", "onbegin"];

export function sanitizeSvg(input: Buffer): SanitiseResult {
  const source = input.toString("utf8");
  const window = new JSDOM("").window;
  const purify = createDOMPurify(window as unknown as Window & typeof globalThis);

  const removed = new Set<string>();

  purify.addHook("uponSanitizeElement", (_node, data) => {
    if (data.tagName && FORBID_TAGS.includes(data.tagName)) {
      removed.add(`<${data.tagName}>`);
    }
  });

  purify.addHook("afterSanitizeAttributes", (node) => {
    const el = node as Element;
    if (!el.attributes) return;
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();

      // Every event handler, not an enumerated list — `onanimationstart` and whatever
      // the next spec adds are covered by the prefix.
      if (name.startsWith("on")) {
        el.removeAttribute(attr.name);
        removed.add(`${attr.name}=`);
        continue;
      }

      // href / xlink:href may only be a same-document fragment. An external reference is
      // an outbound request at best and a script source at worst.
      if (name === "href" || name === "xlink:href") {
        const v = attr.value.trim();
        if (!v.startsWith("#")) {
          el.removeAttribute(attr.name);
          removed.add(`${attr.name}="${v.slice(0, 40)}"`);
        }
      }

      // CSS can carry url(javascript:…) and external @import.
      if (name === "style" && /url\s*\(|@import|expression\s*\(/i.test(attr.value)) {
        el.removeAttribute(attr.name);
        removed.add("style=url()");
      }
    }
  });

  const clean = purify.sanitize(source, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS,
    FORBID_ATTR,
    // Keep the document a document, not a fragment: the <svg> root must survive.
    WHOLE_DOCUMENT: false,
    RETURN_DOM: false,
  });

  purify.removeAllHooks();

  const output = Buffer.from(clean, "utf8");
  return {
    svg: output,
    removed: [...removed],
    changed: clean !== source,
  };
}

/** A cheap structural check before the expensive parse. */
export function looksLikeSvg(input: Buffer): boolean {
  const head = input.subarray(0, 1024).toString("utf8").trimStart().toLowerCase();
  return head.startsWith("<?xml") || head.startsWith("<!doctype svg") || head.startsWith("<svg");
}

/** 256 KB. A brand mark or a care symbol is a few KB; anything larger is a raster
 *  masquerading as a vector, or a decompression bomb (06 §7.1). */
export const MAX_SVG_BYTES = 256 * 1024;
