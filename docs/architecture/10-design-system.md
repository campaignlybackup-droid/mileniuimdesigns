# 10 — Design System, Creative Direction and Front-of-House Specification

Scope: what the customer actually sees. The token system, typography, layout,
component inventory, motion, the three signature experiences (stone, heritage,
one-of-a-kind), responsive strategy, accessibility, and the two tests a screen
must pass before it ships.

This document is the design counterpart to 01–09. Where those documents make the
platform correct, this one makes it *Millennium Designs*.

---

## 1. The creative problem, stated precisely

The failure mode for this project is not ugliness. It is **plausibility** — a
site that looks like a competent luxury template and therefore like nobody. A
40-year-old jewellery house that presents as a Shopify theme has spent four
decades of credibility on a stock layout.

The brief's central idea is **HERITAGE, REFINED**. Translated into design
decisions that can actually be reviewed:

| Principle | What it means in the build | What it forbids |
| --- | --- | --- |
| The piece is the subject | Photography occupies the largest area on almost every screen; UI recedes | Cards with more chrome than image; overlays that sit on jewellery |
| Luxury is restraint | Value comes from type, space, proportion and material | Gradients, glows, heavy shadows, decorative gold |
| Confidence is quiet | Short copy, one clear action, no persuasion stack | "Shop now!", countdowns, urgency banners, testimonial sliders |
| Editorial, not catalogue | Asymmetry, varied rhythm, full-bleed moments | A uniform 3-col grid repeated down the page |
| Material honesty | Green and ivory carry the brand; gold is a trace | Green-and-gold wedding-jewellery aesthetic |

**Green is the identity, not the decoration.** The bright `#009C17` from the
logo is a *signal* colour — the mark itself, a focus ring, a single rule, an
active state. The *surfaces* are deep emerald and ivory. A page that is 40%
bright green has misread the palette.

---

## 2. Design tokens

Tokens live in exactly one place: `src/styles/tokens.css` as CSS custom
properties on `:root`, consumed through Tailwind v4's `@theme` so a token is
usable as both `var(--md-…)` and a utility class. **No component may introduce a
raw hex, a raw px spacing value, or a one-off duration.** This is enforced by
`stylelint` (`declaration-property-value-disallowed-list` on colour properties)
and reviewed in `10.9`.

### 2.1 Colour

```css
:root {
  /* Brand — the mark and its signal */
  --md-green:            #009C17;  /* logo green. Signal only: mark, focus, active rule */

  /* Emerald surfaces — the dark half of the house */
  --md-emerald-deep:     #003D1F;  /* primary dark surface: footer, one-of-a-kind, heritage */
  --md-forest:           #062E1B;  /* secondary dark surface, layered panels */
  --md-green-dark:       #082519;  /* deep panel, image scrim base */
  --md-green-black:      #06130D;  /* near-black ground, full-bleed editorial */

  /* Ivory surfaces — the light half, and the default */
  --md-ivory-soft:       #FCFAF5;  /* page ground */
  --md-ivory:            #F7F4EC;  /* raised/alternating band */
  --md-stone:            #E8E2D7;  /* hairlines, dividers, image placeholder */
  --md-taupe:            #B9B1A3;  /* secondary text on ivory, disabled */
  --md-charcoal:         #171815;  /* body text on ivory */

  /* Metallic — trace accent, never a surface */
  --md-champagne:        #C8B27A;
  --md-gold-antique:     #A88C55;

  /* Semantic aliases — components reference THESE, never the raw ramp */
  --md-bg:               var(--md-ivory-soft);
  --md-bg-raised:        var(--md-ivory);
  --md-fg:               var(--md-charcoal);
  --md-fg-muted:         var(--md-taupe);
  --md-rule:             var(--md-stone);
  --md-bg-inverse:       var(--md-emerald-deep);
  --md-fg-inverse:       var(--md-ivory-soft);
  --md-fg-inverse-muted: color-mix(in oklab, var(--md-ivory-soft) 68%, transparent);
  --md-focus:            var(--md-green);
  --md-accent:           var(--md-green);

  /* State — muted, never traffic-light bright */
  --md-danger:           #8C2F1F;
  --md-success:          var(--md-green);
  --md-sold:             var(--md-taupe);
}
```

**Rules that are not negotiable:**

1. `--md-gold-antique` and `--md-champagne` may be used for **hairlines, small
   marks, and type at ≤14px** only. They may never be a background fill, a
   button fill, or a heading colour. A screen with more than ~2% gold coverage
   fails review.
2. `--md-green` is never a large fill except the logo lockup itself and the
   `one_of_a_kind` section's rule. Primary buttons are `--md-emerald-deep`.
3. There is **no dark mode toggle**. The site is a designed light-and-dark
   composition, not a themeable surface. Sections choose a **surface token**, and
   `prefers-color-scheme` does not alter the palette. (`color-scheme: light` is
   declared so form controls render correctly.)
4. Every text/background pair in the system is checked in
   `tests/unit/contrast.test.ts`, which computes APCA and WCAG 2.1 contrast for
   the full token cross-product and fails CI below the thresholds in §8.2. It is
   a **pure-math** test over the token table and runs without a browser; it is
   **not** the same check as `tests/a11y/tokens.spec.ts` (09 P14), which is an
   axe sweep over *rendered* pages and catches the pairs a component actually
   composes. Both are commissioned, both are owned by **P14**, and neither
   replaces the other.

**The surface vocabulary is a closed, stored value set — seven tokens.** This
was previously two words in this document ("`surface="ivory"` or
`surface="emerald"`") with nothing in the database to hold them.
`11 §7.7` now fixes the permitted set, and it is generated from *this* stylesheet:

```ts
// src/lib/cms/backgroundTokens.ts — generated from src/styles/tokens.css at build time
export const BACKGROUND_TOKENS = [
  '--md-ivory-soft',   // page ground (the default when the section stores NULL)
  '--md-ivory',        // raised / alternating band
  '--md-stone',        // quiet divider band
  '--md-emerald-deep', // primary dark surface
  '--md-forest',       // secondary dark surface
  '--md-green-dark',   // deep panel / image scrim base
  '--md-green-black',  // near-black ground, full-bleed editorial
] as const;
```

- `cms_sections.background_token` and the `background_token` field on the
  `banner`, `cta`, `heritage` and `newsletter` blocks accept exactly these seven
  or `NULL`, enforced by `chk_cms_sections_background_token` (11 §7.7, 06 §2.1).
  A hex value in the database is now impossible rather than merely forbidden in
  prose.
- The section inspector's primary control stays a **two-way toggle**:
  `surface="ivory"` writes `--md-ivory` and `surface="emerald"` writes
  `--md-emerald-deep`. The other five live in the inspector's advanced group.
  The toggle is the editor's vocabulary; the seven tokens are the stored one.
- `tests/unit/background-tokens.test.ts` asserts that the CHECK's value list,
  `BACKGROUND_TOKENS`, and the custom properties actually declared above are the
  same set — so deleting a token here fails the build rather than rendering
  `var(--md-gone)` as transparent.

> **Known contrast fact, already checked:** `--md-taupe` on `--md-ivory-soft` is
> ≈2.3:1. It is therefore **permitted only for non-essential text ≥18px** and is
> banned for body copy, labels, prices, form help text and error text. The muted
> text colour for anything that must be read is
> `color-mix(in oklab, var(--md-charcoal) 66%, var(--md-ivory-soft))` (≈5.1:1),
> exposed as `--md-fg-secondary`.

### 2.2 Typography

Two families, as the brief requires.

| Role | Family | Why |
| --- | --- | --- |
| Display / editorial | **Cormorant Garamond** (400, 300 italic) | High-contrast old-style serif; reads as a fashion publication, not a wedding invitation. Its delicacy demands large sizes — which suits a photography-led site. |
| Interface / data | **Inter** (400, 500) — variable | Neutral, superb at small sizes, excellent numerals. Prices, SKUs, filters, forms and admin all live here. |

Self-hosted via `next/font/local` with `display: swap` and a metric-matched
fallback (`Inter` → system sans with `size-adjust`; `Cormorant Garamond` →
Georgia with `size-adjust`) so headline reflow does not shift layout. **Google
Fonts is not used at runtime** — a third-party font request on every page is a
performance and privacy cost for zero benefit.

```
--md-font-display: "Cormorant Garamond", Georgia, "Times New Roman", serif;
--md-font-sans:    "Inter", ui-sans-serif, system-ui, -apple-system, sans-serif;
```

**Type scale** (fluid via `clamp()`, mobile → desktop):

| Token | Size | Family | Tracking | Use |
| --- | --- | --- | --- | --- |
| `--md-t-hero` | `clamp(2.75rem, 7vw, 7rem)` | display 300 | `-0.02em` | Hero, heritage "40+", one-of-a-kind |
| `--md-t-display` | `clamp(2rem, 4.5vw, 4rem)` | display 400 | `-0.015em` | Section headlines |
| `--md-t-title` | `clamp(1.5rem, 2.5vw, 2.25rem)` | display 400 | `-0.01em` | Product name, collection title |
| `--md-t-subtitle` | `clamp(1.125rem, 1.6vw, 1.375rem)` | display 400 italic | `0` | Editorial standfirst |
| `--md-t-body-lg` | `1.0625rem / 1.65` | sans 400 | `0` | Editorial body |
| `--md-t-body` | `0.9375rem / 1.6` | sans 400 | `0` | Default UI/body |
| `--md-t-small` | `0.8125rem / 1.5` | sans 400 | `0` | Meta, captions, help |
| `--md-t-label` | `0.6875rem / 1.4` | sans 500 | `0.14em` | **The only uppercase token.** Nav, eyebrows, buttons, filter headings |
| `--md-t-price` | `1rem` | sans 500, `tnum` | `0.01em` | Prices — always tabular numerals |

**Uppercase is confined to `--md-t-label`.** A headline is never uppercased.
Line length is capped at `--md-measure: 68ch` for body, `46ch` for standfirst.

Prices use `font-variant-numeric: tabular-nums` everywhere so a column of prices
aligns and a price does not jitter when it changes.

### 2.3 Space, layout, radius, shadow, motion

```css
--md-space-1: 0.25rem;  --md-space-2: 0.5rem;   --md-space-3: 0.75rem;
--md-space-4: 1rem;     --md-space-5: 1.5rem;   --md-space-6: 2rem;
--md-space-7: 3rem;     --md-space-8: 4rem;     --md-space-9: 6rem;
--md-space-10: 8rem;    --md-space-11: 12rem;

--md-container:      1560px;   /* outer max width — deliberately wide */
--md-container-text: 760px;    /* editorial reading column */
--md-gutter:         clamp(1.25rem, 4vw, 4rem);

--md-radius-none: 0;
--md-radius-sm:   2px;    /* inputs, chips — the maximum for a surface */
--md-radius-pill: 999px;  /* ONLY the wishlist dot and the bag count */

--md-shadow-none:  none;
--md-shadow-drawer: 0 0 60px rgba(6,19,13,0.18);   /* drawers/modals only */

--md-ease:        cubic-bezier(0.22, 0.61, 0.36, 1);
--md-ease-out:    cubic-bezier(0.16, 1, 0.3, 1);
--md-dur-fast:    160ms;
--md-dur:         320ms;
--md-dur-slow:    600ms;
--md-dur-reveal:  900ms;
```

**Radius and shadow are near-zero by design.** Cards have no radius, no border
and no shadow — they are an image, a name, a price, separated by space and by a
`--md-rule` hairline where a boundary is genuinely needed. `--md-shadow-drawer`
exists for one purpose: to detach an overlay from the page. Any other shadow is
a review failure.

**The 12-column grid** (`--md-container`, `--md-gutter`) is the substrate, but
sections are expected to break it: full-bleed images, 7/5 and 5/7 asymmetric
splits, offset captions, and images that run past the gutter on one side. A
homepage where every section is a centred 12-column block has failed §10.9.

---

## 3. Component inventory

Three layers, matching `src/components/` from 01 §3.

### 3.1 Primitives — `src/components/ui/`

`Logo` · `Button` · `TextLink` · `Input` · `Textarea` · `Select` · `Checkbox` ·
`RadioGroup` · `Switch` · `Field` (label + control + help + error) · `Accordion`
· `Dialog` · `Drawer` · `Tabs` · `Tooltip` · `Toast` · `Badge` · `Rule` ·
`Spinner` (monogram-based, §7) · `Skeleton` · `VisuallyHidden` · `Portal`.

Built on Radix primitives for behaviour and accessibility, styled entirely by
tokens via CVA. **`Logo` accepts `variant` (`wordmark` | `monogram`) and `tone`
(`green` | `ivory`) and nothing else** — no colour, transform, filter or size-
distorting props. That component is the enforcement mechanism for "use the logo
as-is, never redesigned" (01 §5.10).

`Button` variants: `primary` (emerald fill, ivory text), `inverse` (ivory fill
on dark), `outline` (1px `--md-rule`), `ghost`, `link`. Sizes `sm|md|lg`. There
is no "gold" variant and no gradient variant.

### 3.2 Storefront — `src/components/storefront/`

**Chrome:** `Header` · `MegaMenu` · `MobileMenu` · `MarketSwitcher` ·
`SearchOverlay` · `CartDrawer` · `WishlistButton` · `Footer` · `Breadcrumbs` ·
`AnnouncementBar` (CMS-driven, off by default).

**Catalogue:** `ProductCard` · `ProductGrid` · `CollectionHero` · `FilterDrawer`
(mobile) · `FilterSidebar` (desktop) · `ActiveFilters` · `SortSelect` ·
`Pagination` · `EmptyState`.

**Product:** `ProductGallery` (desktop) · `ProductGalleryMobile` (swipeable) ·
`ProductInfo` · `VariantSelector` · `PriceDisplay` · `AvailabilityBadge` ·
`AddToBag` · `StickyAddToBag` (mobile) · `ProductAccordions` · `StoneNote` ·
`ProductStory` · `RelatedRail`.

**Editorial:** `StoneCard` · `StoneExplorer` · `EditorialSection` ·
`SplitLayout` · `FullBleedImage` · `Quote` · `HeritageTimeline` ·
`JournalCard` · `Newsletter` · `MarqueeRule`.

**Commerce:** `CartLine` · `OrderSummary` · `CheckoutSteps` · `AddressForm` ·
`ShippingMethodPicker` · `PaymentPanel` · `OrderConfirmation`.

**Account and sharing:** `WishlistGrid` · `SharedWishlist` · `ShareWishlistPanel`.

`SharedWishlist` is the public screen at `/wishlist/shared/[token]` (07 §4.2,
15 §6) and it was previously the one storefront page in the system with no
component named for it. It takes a `PublicWishlistView` — never a `WishlistView`,
because the two types exist precisely so a field added to the private one cannot
reach the public one by inheritance (08 §1.3) — and renders:

- The wishlist name the customer typed, in `--md-t-title`, and **no owner
  identity**: no name, no email, no customer id, no per-item note, no list or item
  timestamps. `tests/e2e/idor.spec.ts` asserts this over the rendered HTML.
- A grid of `ProductCard`s at the §5.4 specification, priced by `PriceDisplay` in
  the **viewer's** market. A piece with no live price in that market renders with
  its `AvailabilityBadge` in the unavailable state and no figure — never a
  converted one (hard rule 2).
- **No add-to-bag on the owner's behalf, and no wishlist control.** Each card
  carries a neutral link into the PDP; the visitor acts on their own bag from
  there. A share link is a view of someone's choices, not a remote control over
  their account.
- A "make your own" call to action — a single `outline` `Button` below the grid —
  which is the only conversion device on the page.
- **It must render correctly with zero items**, because a customer can clear a list
  after sharing it. That is `EmptyState` with the `wishlist_empty` copy of §5.6 and
  the same call to action, never a blank grid and never an error.

`ShareWishlistPanel` is its private counterpart on `/account/wishlist`: the
on/off toggle, the link with a copy affordance when on, *"Shared since 4 March ·
viewed 12 times"*, and a **Stop sharing** button whose confirm copy states that the
link stops working immediately and permanently — which is true, because enabling
again mints a different token (15 §6).

`PriceDisplay` is the **only** component permitted to render a money value. It
takes a `ResolvedPrice` from the pricing service (04) and calls `formatMoney`
(01 §2.6). It never receives a number and a currency string separately, which is
how a rupee amount ends up rendered with a dollar sign.

### 3.3 Admin — `src/components/admin/`

`Sidebar` · `Topbar` · `CommandPalette` (⌘K) · `DataTable` (sortable,
selectable, column-configurable, inline-editable) · `FilterBar` · `ScopeBar` ·
`ColumnPicker` · `SavedViews` · `BulkActionBar` · `ConflictBar` ·
`ImportPreviewGrid` · `DrawerForm` · `MediaPicker` · `RichTextEditor` ·
`SectionBuilder` · `BlockInspector` · `BreakpointSwitcher` · `PriceEditor` ·
`MarketPriceGrid` · `InventoryEditor` · `VariantMatrix` · `OrderTimeline` ·
`CustomerPanel` · `PermissionMatrix` · `ActivityLog` · `VersionHistory` ·
`CompletenessMeter` · `SaveState` · `DangerDialog` (type-to-confirm) ·
`AnalyticsCard` · `Chart` · `ReportEmpty`.

The five components `13 §9.1` row 12 and `14 §3.1` asked for, and what each one
is, so the inventory is a specification rather than a word list:

| Component | What it is | Owner |
| --- | --- | --- |
| `ScopeBar` | The market / currency / location selector that sits above `DataTable` whenever a chosen sort or filter carries `requires` (`11 §8`). In its attention state it names the reason — "Sorting by price needs a market" — and the grid falls back to the resource's default sort rather than issuing a request that would `400` | 13 §1.7 |
| `ColumnPicker` | The per-actor column visibility and order control. It lists only columns whose `requires` the actor holds, because a column the projection will never return must not appear as an unticked box | 13 §1.4 |
| `ConflictBar` | The row-level strip a `STALE_WRITE` raises: theirs / yours / the field, with **Reload this row** and **Overwrite**. It is per row, never a page-level modal — fifty rows saving at once may conflict on one | 13 §3.5 |
| `ImportPreviewGrid` | The CSV dry-run result: per-row status, the failing column highlighted, errors grouped by kind with a count, and the row number as it appears in the operator's spreadsheet | 13 §5.2, §5.3 |
| `ReportEmpty` | What renders in place of a `Chart` when a window contains no data. It states the window and the market **in words** — "No paid orders between 1 and 30 September 2026 in the US market" — and never draws an axis with a flat zero line, which reads as a measurement of nothing rather than as an absence of data | 14 §3.1 |

> **DECISION CHANGED:** `SaveState` was listed here as three states
> (saving / saved / failed). **It is six** — `idle`, `pending`, `saving`, `saved`,
> `failed`, `conflict` — and it is one machine shared by the CMS builder's toolbar
> pill (`06 §6.2`) and the admin grid's per-cell indicator (`13 §3.3`), with the
> same names and the same rule: the state is set from the **server response**,
> never from the request being sent. An optimistic "Saved" is the single worst
> thing this component can do.

**`AnalyticsCard` and `Chart` take a required `source: ReportSource` prop** (14
§1.3) and render its `label` beneath the figure in `--md-t-small`,
`--md-fg-secondary`. A card without a source does not compile — that is the point
of making it required rather than optional, because "where did this number come
from" is a question the admin must never leave to a tooltip nobody adds. The
muted colour is `--md-fg-secondary`, not `--md-taupe`: the source label is text
that must be read, and §2.1's known-contrast callout bans `--md-taupe` for
anything under 18px.

**The admin uses the same tokens but a different posture:** denser spacing
(`--md-space-2/3/4`), `--md-t-body` and `--md-t-small` only, no display serif
except the `Logo`, and information density over drama. It is a tool, and it
should look like one.

---

## 4. The three signature experiences

These are what differentiate Millennium Designs from a good generic store. They
get disproportionate design attention.

### 4.1 The stone experience — `/stones` and `/stones/[slug]`

The distinctive asset. A stone is not a filter chip; it is a subject.

**`/stones/[slug]` composition:**

1. **Full-bleed macro** of the stone at ≥70vh, the name set in `--md-t-hero` in
   ivory, bottom-left, over a bottom-up scrim (`--md-green-black` → transparent,
   not a flat overlay). One line of editorial copy beneath, `--md-t-subtitle`.
2. **The note** — a `--md-container-text` column: what the stone is, where it
   comes from, how it behaves. CMS copy; **empty fields hide their block** and
   never display invented lore (hard rule 8).
3. **Properties** — a quiet definition list (colour, origin, hardness, care),
   rendered only for fields that have values.
4. **SHOP <STONE>** — the per-type sub-listings the brief specifies, generated
   from the database (03 §4): Rings · Bracelets · Earrings · Pendants ·
   Necklaces · Chains. Each is a horizontal rail of `ProductCard`s with a count
   and a "view all" link into the filtered PLP. **A type with no products in the
   current market is omitted entirely** — not shown empty.
5. **Other stones** — a restrained rail back into `/stones`.

`/stones` itself is an index of macro imagery at varying sizes — a deliberately
non-uniform mosaic, not a 7-up grid of equal squares.

### 4.2 One of a Kind — `/one-of-a-kind`

> **Changed from an earlier draft of this document.** This page was specified
> here at `/collections/one-of-a-kind`. It is not there. ONE OF A KIND is one of
> the ten customer-facing spellings in `00 §6` and is therefore a `categories`
> row, rendered by `[category]/page.tsx` at `/one-of-a-kind` (08 §4.2, §4.3).
> The seeded *collection* at `/collections/one-of-a-kind` is **not created** —
> two URLs for one idea splits link equity and gives the merchandiser two places
> to curate the same shelf. The design below is the design of the **category**
> page, and it is the one place in this document where a `[category]` route gets
> a bespoke specification rather than the §5 default.
>
> The CMS `one_of_a_kind` block (06 §2.1) already sources from the ONE OF A KIND
> **category**, so nothing in the page builder moves.

The strongest dark moment on the site. `--md-emerald-deep` ground, ivory type,
generous vertical space, imagery at larger-than-usual scale with more air around
it than anywhere else.

- Headline `ONE OF A KIND` in `--md-t-hero`, a single `--md-green` rule beneath.
- One line of copy: *"Pieces with a character that cannot be repeated."*
- The grid is deliberately sparse — 2-up on desktop, one per row on mobile —
  because density contradicts rarity.
- **Sold pieces remain visible** when the admin has configured it that way (03
  §8), rendered at reduced emphasis with a `SOLD` label in `--md-sold`, no
  price, no action. They read as an archive, which is the point.

### 4.3 Heritage — `/heritage`

`--md-green-black` ground. The figure `40+` set in `--md-t-hero` at the largest
size used anywhere on the site, with `YEARS OF CRAFT` in `--md-t-label` beneath.
The `MD` monogram appears once, large, at very low opacity, as a watermark
behind the opening — the only decorative use of the mark on the site.

Below: `HeritageTimeline`, entirely CMS-driven (year, title, description,
image, sort order). **It ships with zero entries.** No year, no milestone and no
founding date is invented; the section does not render until the client supplies
entries (hard rule 8). The same applies to `CRAFTED HERE. COLLECTED AROUND THE
WORLD.` — the country list and any customer quote are CMS rows, seeded empty.

---

## 5. Page-level specifications

### 5.1 Header

Transparent over a hero, solid `--md-bg` with a `--md-rule` bottom hairline
after 64px of scroll — a 200ms crossfade, no slide, no shrink animation.
Contrast over photography is guaranteed by a top-down scrim baked into hero
images by the media pipeline, not by hoping the photo is dark.

Desktop: wordmark left; `SHOP · COLLECTIONS · STONES · HERITAGE · ABOUT` centred
in `--md-t-label`; `SEARCH · ACCOUNT · WISHLIST · BAG` right; `MarketSwitcher`
as a quiet `US / IN` toggle at the far right.

Mobile: monogram left, `SEARCH` and `BAG` right, menu trigger far right. The
wordmark is never squeezed into a 390px header — that is what the monogram is
for.

**MegaMenu**: a full-width panel, not a dropdown list. Four columns of links
plus one editorial image with a caption and a link, all CMS-driven (06 §8).
Opens on intent (hover with a 120ms delay, or keyboard focus), closes on Escape
and on outside click, and traps focus while open.

**Cart count and wishlist state are client-only** and must not be rendered
server-side into ISR-cached shells (01 §1.3) — they mount after hydration to
avoid baking one visitor's bag into the CDN copy.

### 5.2 Homepage

Composed entirely of CMS blocks. **The seeded section list is specified once, in
`06 §11.2`, and this document does not restate it** — an earlier draft carried a
second, different sixteen-item narrative here, and two seeds for one
`prisma/seed/99-demo.ts` table means whichever runs first silently becomes the
product. `06 §11.2` has been amended to carry this document's narrative arc
(including the `gold`, `lab_grown` and `global` sections it previously lacked)
and is now the single source. Read it there.

The design intent this document *does* own, and which `06 §11.2` implements:

- **Signature collections are asymmetric** — a `grid_4` of `collection_feature`
  blocks with deliberately unequal media ratios, **not** five identical cards.
- **One of a kind is the emerald moment** and is the only dark surface above the
  fold-and-a-half; the heritage and editorial sections stay ivory so the dark
  band reads as an event.
- **The newsletter section is "the private list"** — the close, not an
  interstitial, and never a modal.
- **Every copy field and every media field is seeded empty** and a section whose
  blocks resolve to nothing renders nothing (06 §11.2, hard rule 8).

**Rhythm rule: no two adjacent sections may share a surface and a layout.** An
ivory split-image section is never followed by another ivory split-image
section. This was previously an unenforceable sentence ("the section builder
warns the editor"); it is now a real check inside `applyBuilderOps` —
`checkRhythm()` in `src/lib/cms/rhythm.ts`, returning
`warnings: BuilderWarning[]` alongside the result, specified in **06 §2.2** and
tested by `tests/unit/cms-rhythm.test.ts`. It is a **warning, not a rejection**:
a designer may deliberately want two ivory bands in a row, and a builder that
refuses a legal arrangement is a builder the editor works around.

### 5.3 Product detail

**Desktop:** a two-column layout at 7/5. The gallery is a vertical stack of
large images that scroll naturally, with a sticky thumbnail rail — not a
carousel, because a carousel hides the piece. The information panel is sticky
and contains, in order: collection eyebrow, name (`--md-t-title`), price
(`PriceDisplay`), stone and material line, variant selectors, availability,
`AddToBag`, `WishlistButton`, then the accordions: **THE STORY · DETAILS ·
MATERIAL · STONE · CARE · SHIPPING · RETURNS**. Empty accordions do not render.

**Mobile:** full-bleed swipeable gallery with a dot indicator; name and price
immediately below; variant selectors as full-width tappable rows that open a
sheet rather than a native `<select>`; `StickyAddToBag` appears once the primary
button scrolls out of view, showing price and action only.

`VariantSelector` marks unavailable combinations as unavailable rather than
hiding them — hiding an option makes the customer think the size does not exist
(03 §2).

### 5.4 Product card

Image (4:5), name, stone/material line, price. On hover: crossfade to the
alternate image over `--md-dur` and nothing else — no lift, no zoom, no shadow,
no quick-add button. The wishlist control is a small mark in the top-right,
visible on hover on desktop and always visible on touch.

### 5.5 Cart drawer, search overlay, checkout

**CartDrawer** slides from the right at `--md-dur` with `--md-ease-out`, ivory
ground, `--md-shadow-drawer`, scrim `rgba(6,19,13,0.45)`. Lines show image,
name, variant, quantity stepper, line price. Footer: subtotal, a note that
shipping and tax are calculated at checkout, then `VIEW BAG` (outline) and
`CHECKOUT` (primary). Nothing else — no upsell rail, no progress-to-free-
shipping meter.

**SearchOverlay** is a full-screen ivory panel, not a dropdown: a single large
input in `--md-t-display`, then predictive results grouped as Products ·
Stones · Collections · Categories, plus recent searches. Keyboard-first (↑↓ to
move, ⏎ to open, Esc to close). Debounced at 180ms.

**Checkout** drops the mega menu and the footer to a single-line lockup: logo,
step indicator, and a secure-payment note. One column on mobile with the order
summary collapsed into an expandable bar at the top; two columns on desktop with
the summary sticky on the right. Fields are large (48px min), labelled above,
with `inputmode` and `autocomplete` set correctly for both US and India address
shapes.

### 5.6 Error and empty states

**`08 §4.4` owns the seeded strings and the `settings` rows. This document owns
the layout and the voice, and no longer restates the copy** — an earlier draft
carried a complete second set of defaults for the same
`group_key = 'copy_states'` rows, which is one seed too many.

Layout, which is this document's decision and applies to every state in
`08 §4.4`:

- A `--md-container-text` column, centred, with the monogram at 32px above it.
- **Headline** in `--md-t-display` (never uppercased — §2.2), **body** in
  `--md-t-body-lg` at `--md-measure` 46ch, **action** as a single `outline`
  `Button` in `--md-t-label`. Never two competing actions, never an illustration.
- The `sold` state is the exception: no body, no action button, a `SOLD` plate in
  `--md-sold` over the piece, and a `TextLink` back to `/one-of-a-kind`.
- A stack trace, an error code or a table name never reaches a customer
  (01, 08 §1.4 — the customer sees the resolved `copy.error.*` string and a
  `requestId`, nothing else).

> **DECISION CHANGED — the seed request in this section has been granted and is
> no longer a request.** This section previously carried a
> `SEED CHANGE REQUIRED IN 08 §4.4` asking for two things: that each state be split
> into `copy.state.<state_key>.headline` / `.body` / `.action` under
> `group_key = 'copy_states'`, and that a `sold` row be added. `08 §4.4` has made
> both changes and is now the storage and the seed; this document is the voice and
> the layout. The table below is therefore **not a second seed** — it is the map
> from the screen a designer is looking at to the `settings` row they are editing,
> which is what `08 §4.4` asked this section for in return.

**Every full-page state, its `settings` key, and who owns the words.** The
`<state_key>` column is `08 §4.4`'s, verbatim and lower-snake; the three rows are
`copy.state.<state_key>.headline`, `.body` and `.action`. A blank `.body` renders
no paragraph and a blank `.action` renders no button, which is the same
empty-field rule as every other CMS value (hard rule 8).

| Screen | `<state_key>` | Voice owned by |
| --- | --- | --- |
| 404 | `not_found` | 10 |
| 410 — unpublished or archived within 30 days | `gone` | 08 |
| 500 | `server_error` | 10 |
| Root layout failed | `global_error` | 08 — and it renders from `src/lib/config/constants.ts`, never from `settings`, because the database may be the thing that failed |
| Empty cart | `cart_empty` | 10 |
| Empty wishlist | `wishlist_empty` | 10 |
| No search results | `search_empty` | 10 headline, 08 body |
| Filtered to nothing | `filters_empty` | 08 |
| Out of stock (PDP) | `out_of_stock` | 10 |
| **Sold** (one of a kind) | `sold` | 10 |
| Made to order (PDP) | `made_to_order` | 08 — the `lead_time_days` rule is operational and a voice pass would have deleted it |
| Not sold in this market | `unavailable_in_market` | 08 |
| Lost the race at checkout | `insufficient_stock` | 08 |
| Price moved | `price_changed` | 08 |
| Market changed with a live bag | `market_changed` | 08 |
| Payments unconfigured | `payments_unconfigured` | 08 |
| Confirmation still pending | `payment_pending` | 08 |

> **DECISION CHANGED — five state keys in this section were spelled differently
> and the other spellings are withdrawn.** `error` → `server_error`, `empty_cart`
> → `cart_empty`, `empty_wishlist` → `wishlist_empty`, `no_results` →
> `search_empty`, `filtered_empty` → `filters_empty`. `08 §4.4` is the storage and
> a `settings` key is a stored value, so its spelling wins;
> `tests/unit/state-copy-seeded.test.ts` fails on a `<state_key>` with no
> `.headline` row and would have failed on every one of the five.

`08 §4.4`'s existing defaults for `gone`, `filters_empty`, `made_to_order`,
`unavailable_in_market`, `payments_unconfigured`, `payment_pending` and the three
checkout-conflict states are better than anything this document would replace them
with and are **not** changed — they carry operational detail (the `{requestId}`,
the `lead_time_days` rule, the "no order has been created" sentence) that a voice
pass would have quietly deleted.

> **RESOLVED — was CHANGE REQUIRED IN 08 §4.4:** the seeded `.headline` values are stored in
> *Verified applied by inspection of the target document.*
> **upper case** (`NOTHING FOUND`, `YOUR BAG IS WAITING.`, `SOMETHING WENT
> WRONG`), and §2.2 of this document confines uppercase to `--md-t-label` —
> nav, eyebrows, buttons and filter headings. A state headline renders in
> `--md-t-display` (§5.6 layout, above), and §9.2 lists "uppercase headlines" as
> an automatic review failure. Seed the headline strings in **sentence case**
> — `Nothing found`, `Your bag is waiting.`, `Something went wrong`, `Sold`,
> `Currently unavailable`, `Your collection begins here.`, `Nothing matched your
> search.`, `No longer available`, `Made to order`, `Prices have been updated.`,
> `Your bag has been repriced for {market}.`, `This piece has just been taken.`,
> `Payment is not yet available here.`, `We are still confirming your payment.`
> — and leave the `.body` and `.action` strings exactly as they stand. Casing is
> a typographic decision and this document owns it; the sentences themselves are
> `08 §4.4`'s and are not being rewritten. The **action** labels may stay upper
> case: a button is `--md-t-label`, which is the one token that is uppercase.

---

## 6. Motion

Motion is **entrance and transition only**. There is no looping, bouncing,
spinning, parallax-on-everything or scroll-jacking.

| Moment | Motion | Duration |
| --- | --- | --- |
| Section entrance | Opacity 0→1, `translateY(16px)`→0, once, when 15% visible | `--md-dur-reveal` |
| Image reveal | Opacity 0→1 with a 1.04→1 scale settle | `--md-dur-reveal` |
| Card hover image | Crossfade | `--md-dur` |
| Drawer / overlay | Slide + scrim fade | `--md-dur`, `--md-ease-out` |
| Header state | Background + border crossfade | 200ms |
| Accordion | Height + opacity | `--md-dur-fast` |
| Route change | Content crossfade only; never a full-page wipe | 200ms |
| Sticky add-to-bag | Slide up on threshold | `--md-dur-fast` |

`prefers-reduced-motion: reduce` sets `--md-dur*` to `1ms` and disables
transforms globally in `tokens.css`. **The site must be fully usable and look
intentional with every animation removed** — entrance animations therefore
animate *from* a visible state where possible, never from `opacity: 0` left
permanently if JS fails. Reveal classes are applied by an
`IntersectionObserver`, and the base CSS has content visible by default so a JS
failure degrades to a static, correct page rather than a blank one.

---

## 7. Loading state

No generic spinner. The `MD` monogram at 32px with a slow 1.6s opacity pulse
(`0.35 → 1 → 0.35`), centred, on `--md-bg`. Under reduced motion it renders
static at full opacity. Route-level loading uses `Skeleton` blocks in
`--md-stone` matching the final layout's proportions, so there is no layout
shift when content arrives.

---

## 8. Responsive and accessibility

### 8.1 Breakpoints

Design targets, not just test widths: **390 · 393 · 412 · 430 · 768 · 1024 ·
1280 · 1440 · 1728 · 1920**.

```
--md-bp-sm: 480px;  --md-bp-md: 768px;  --md-bp-lg: 1024px;
--md-bp-xl: 1280px; --md-bp-2xl: 1560px;
```

Mobile is designed first and separately — the mobile product page, filter
drawer, variant sheet, menu and checkout are distinct UX, not a narrowed
desktop. Above 1560px the container stops growing but full-bleed sections
continue to the viewport edge.

**Zero horizontal overflow is a CI gate**, not a hope:
`tests/e2e/no-horizontal-overflow.spec.ts` loads every route class at all ten
widths and asserts `document.scrollingElement.scrollWidth <= clientWidth`.
Failure blocks the build. **Owned by P15** (09 §1.2) — it needs real storefront
routes to load, so P14 cannot satisfy it.

> **The two tests this document commissions were invisible to the mechanism that
> guarantees tests exist.** `tests/setup/collect-audit.ts` (09) globbed
> `docs/architecture/0*.md`, which excludes this file by construction, so
> `tests/unit/contrast.test.ts` and `tests/e2e/no-horizontal-overflow.spec.ts`
> could never appear in `tests/setup/pending.json` and `09 §5.1` would have been
> signed with neither of them written. The glob is now
> `docs/architecture/*.md` (09 §0), and both files have an owning phase:
> `contrast.test.ts` → **P14**, `no-horizontal-overflow.spec.ts` → **P15**.

### 8.2 Accessibility

Target **WCAG 2.2 AA**.

- Semantic HTML first; ARIA only where a pattern genuinely requires it (Radix
  supplies most of it correctly).
- Contrast: **4.5:1** for text under 18.66px/bold-14px, **3:1** for large text
  and for UI boundaries that carry meaning. Enforced by
  `tests/unit/contrast.test.ts` over the token cross-product (§2.1).
- Visible focus everywhere: a 2px `--md-focus` ring at 2px offset. `:focus-visible`
  only — but never removed for keyboard users.
- Touch targets ≥44×44px, with ≥8px between adjacent targets.
- Every image has meaningful `alt`, authored in the media library (06 §7);
  decorative images carry `alt=""`. **A product image with no alt text fails the
  product completeness score** (03 §1).
- Forms: label always present and visible, errors associated with
  `aria-describedby`, error summary focused on submit, never colour-only error
  signalling.
- Drawers and dialogs trap focus, restore it on close, and close on Escape.
- A skip-to-content link is the first focusable element.
- Live regions announce cart additions, filter result counts and save state.
- Automated axe checks run in Playwright over every route class; **automated
  checks are a floor, not a pass** — a keyboard-only and a VoiceOver pass over
  the checkout and the product page are launch blockers (09).

---

## 9. The two review gates

Every screen passes both before it is called done. These are checklists an
actual person walks — no test executes them.

**They are now actually recorded in `09`, which they previously were not.** This
document claimed they were "recorded in the phase exit criteria (09)" while
appearing in none of `09`'s thirty-two exit-criteria cells. They are carried as a
final lettered criterion on each **front-of-house** phase:

| Phase | Screens it produces |
| --- | --- |
| **P14** | Header, footer, brand shell, the primitive inventory |
| **P15** | Home, PLP, PDP, collection, `/stones`, `/stones/[slug]`, `/one-of-a-kind`, error and empty states |
| **P20** | `/cart` and the cart drawer |
| **P23** | The four checkout steps and the confirmation screen |
| **P24** | `/account/**`, the public `/wishlist/shared/[token]` screen (§3.2), and the transactional email layouts |
| **P28** | The seeded homepage arrangement (06 §11.2) as it actually renders |

and as a line in `09 §5.1`'s launch blockers, because a gate nobody signs is
decoration.

**The admin is deliberately exempt.** §3.3 fixes a different posture for it —
density over drama, no display serif, no photography — so "does the photography
dominate?" and "could this be any other brand's site?" are the wrong questions
about a tool. P27 and P29 are not on the list above and are not meant to be.

### 9.1 The premium-design test

1. Would this be credible as the site of a 40-year-old international jewellery
   house?
2. Does it read as expensive **without** relying on gold?
3. Is the green sophisticated here, or is it loud?
4. Does the photography dominate, or does the UI?
5. Is there enough space — genuinely enough, not "tidy"?
6. Is the typography doing the work?
7. Could this be any other brand's site with the logo swapped? **If yes, it has
   failed.**

### 9.2 The anti-pattern test — automatic failure

Large rounded cards · shadows outside `--md-shadow-drawer` · gradient
backgrounds · neon or high-saturation green · gold as a fill · stock icon sets ·
sale banners and countdowns · testimonial sliders · pill-shaped tag soup · a
uniform grid of identical cards repeated down the page · body copy in the
display serif · uppercase headlines · more than two type families · a stack
trace or raw error string shown to a customer · invented content of any kind.

---

## 10. What this document does not decide

> **NEEDS INPUT:** the original vector logo files (`.svg`/`.ai`/`.eps`) for the
> wordmark and monogram. `Logo` and `public/brand/` are built; they currently
> reference placeholders marked `-PLACEHOLDER`. Tracing the marks from the
> supplied chat images would alter the letterforms and the monogram's crescent —
> the redesign the brief forbids.

> **NEEDS INPUT:** product photography, and the art direction rules that come
> with it (background, crop, shadow, model vs still-life, whether a consistent
> 4:5 ratio is achievable). The entire design rests on the photography; a
> beautiful system over inconsistent images will still look cheap.

> **NEEDS INPUT:** licensing for Cormorant Garamond and Inter is open (SIL OFL),
> so nothing blocks. If the client has a commissioned or licensed brand
> typeface, it replaces one of the two — the token layer makes that a one-file
> change.

> **NEEDS INPUT:** all editorial copy. Every headline in this document quoted
> from the brief is a placeholder in the CMS, and every empty field hides its
> section rather than showing invented text.
