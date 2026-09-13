# 0012 — SVG sanitisation with DOMPurify + jsdom

**Status:** accepted · **Phase:** P06 · **Adds:** `dompurify`, `jsdom`, `@types/jsdom`

`01 §1.5` requires an ADR for any dependency addition. This is it.

## The problem

**An SVG is an executable document.** It carries `<script>`, `on*` handlers,
`<foreignObject>`, external `<use href>` and CSS `url()`. An uploaded SVG served from our
own origin and inlined is stored XSS with full access to an admin session — and the admin
session can issue refunds and read every customer's address.

## Why a dependency rather than a regex

A regex over SVG is a losing game, and predictably so: `<scr<script>ipt>`, entity-encoded
attribute names, `<foreignObject>` wrapping arbitrary HTML, namespaced `xlink:href`, and
CSS `url(javascript:…)` all defeat naive pattern matching. Parsing the document and
walking the tree is the only approach that is not a guess. DOMPurify is the maintained,
widely-reviewed implementation of exactly that, and it has an SVG profile.

`jsdom` is required because DOMPurify needs a DOM, and this must run **server-side, before
the bytes reach storage** — which is the whole point of layer 2.

## Cost accepted

`jsdom` is large (~2 MB installed) and server-only. It is loaded exclusively by
`src/lib/media/svg.ts`, which is reached only from `POST /api/media/svg`, so it never
enters a client bundle and never runs on a storefront request path.

## Why not simply forbid SVG

Considered, and it is the safer answer in isolation. Rejected because the brand marks are
vectors and the client will legitimately want to upload a logo variant, a size guide
diagram or a care symbol. Forbidding the format pushes those into 200 KB PNGs that look
wrong at retina — trading a real quality problem for a risk that four layers already
address.

## The four layers this is part of (06 §7.10)

1. `media.upload_vector` permission — `owner` and `admin` only, never `content_editor`.
2. **This**: server-side sanitisation before the bytes reach the provider.
3. Never inlined — rendered only via `<img src>` or `background-image`, both of which
   disable scripting in every current browser.
4. `fl_sanitize` on the delivery URL, plus CSP headers.

No single layer is trusted. Layer 2 is the one that stops a hostile file being *stored*.
