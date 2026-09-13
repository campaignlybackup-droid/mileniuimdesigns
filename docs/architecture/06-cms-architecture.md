# 06 — CMS, Page Builder, Media Pipeline and Content Operations

Scope: the content model layer, the block registry, the page builder and its
editing operations, per-breakpoint configuration, the draft/publish/schedule/
archive state machine, preview, version history, autosave, the media library and
image pipeline, navigation, journal, email templates, and the homepage.

Tables and columns are the ones defined in `02-database-schema.md` §2.8 and §2.4.
Where this section needs something that schema does not define, it says so in a
`> **SCHEMA ADDITION:**` callout with the full definition. Nothing is silently
renamed.

**The bar this section is written against:** the business owner runs the entire
site — every headline, image, price-free editorial claim, menu entry, journal
post, legal page, transactional email and homepage section — without opening the
source code, and without an engineer on standby. §12 states the exact boundary of
that claim, because a claim without a stated boundary is a lie by omission.

---

## 1. CMS architecture

### 1.1 The content model layer

Six entities, one versioning table, one settings table. Nothing else is content.

| Entity | Table | What it owns | Rendered by |
| --- | --- | --- | --- |
| Page | `cms_pages` | Path, title, status, market, layout shell, indexability, live version pointer | `(storefront)/[market]/pages/[...slug]/page.tsx`, `(storefront)/[market]/page.tsx` (home) |
| Section | `cms_sections` | One horizontal band: layout, background token, background media, padding, visibility window, market | `<SectionRenderer>` |
| Block | `cms_blocks` | The content inside a band, and **all per-breakpoint configuration** | `<BlockRenderer>` → registry component |
| Navigation | `navigation_menus` / `navigation_items` | Header, footer, mobile, utility and mega menus as data | `<SiteHeader>`, `<SiteFooter>`, `<MobileNav>` |
| Journal | `journal_posts` (+ `journal_post_tags`, + `journal_categories` §9) | Editorial posts with rich text bodies | `(storefront)/[market]/journal/**` |
| Email template | `email_templates` | Subject, heading, body, CTA, footer, logo per key per market | `src/lib/email/render.ts` → React Email |
| Version | `content_versions` | Immutable snapshot of any of the above | `/admin/content/**/history` |
| Settings | `settings` | Every merchant-tunable value the storefront reads | every surface |

**Heritage and editorial content are not entities.** There is no `heritage` table
and no `editorial` table. "Our heritage" is a `cms_pages` row with
`page_type = 'standard'` and `path = '/about/our-heritage'`, built from the
`heritage`, `timeline`, `editorial_split` and `rich_text` blocks in §2. A
dedicated table would need its own admin screen, its own versioning, its own
preview and its own publish flow, and the second time the client wants a similar
page ("Our Stones", "The Workshop") the duplication has to be reconciled. This
mirrors the decision `02` §2.8 already made for the homepage, for the same
reasons.

### 1.2 Storefront reads the published snapshot; the tables are the draft

This is the single load-bearing decision of the whole CMS, and everything else in
this document follows from it.

**The fork.** Either (a) the storefront joins `cms_pages → cms_sections →
cms_blocks` live and draft edits need a shadow copy of every row, or (b) the
storefront renders `content_versions.snapshot` for the version named by
`cms_pages.published_version_id`, and the live rows *are* the working draft.

**Decision: (b).** The reasons:

1. A page render becomes **one row read by primary key** —
   `SELECT snapshot FROM content_versions WHERE id = $1` — instead of a
   three-level join plus an ordering pass. The homepage is the highest-traffic
   ISR object on the site.
2. Draft editing needs no shadow tables, no `is_draft` flag on every row, and no
   "which copy am I looking at" bug class. An editor mutates `cms_sections` and
   `cms_blocks` freely; the public sees nothing until Publish.
3. Publish becomes atomic by construction: write a new `content_versions` row,
   then `UPDATE cms_pages SET published_version_id = $new`. There is no window in
   which half a page is live.
4. Rollback is `UPDATE cms_pages SET published_version_id = $old` — instant, and
   it does not touch the draft the editor is mid-way through.
5. `content_versions.snapshot` already exists and already contains "the page row
   plus every section and block with all three config columns" (`02` §2.8). This
   decision gives that column a second job it was already shaped for.

The cost accepted: the snapshot embeds **ids**, not resolved entities. A
`product_grid` block's snapshot holds `collection_id`, not the products. Live
data — products, prices, availability, stone records — is always resolved at
render time from the catalogue tables through `src/lib/catalog` and
`src/lib/pricing`, never from the snapshot. **A snapshot freezes layout and copy;
it never freezes commerce data.** `tests/integration/cms-snapshot-no-commerce.test.ts`
asserts no snapshot contains a key matching `/_minor$|^price|^stock|^availability/`.

```ts
// src/lib/cms/pages.ts
export async function getPublishedPage(
  path: string, marketCode: MarketCode,
): Promise<PageSnapshot | null>;          // reads content_versions.snapshot — ONE row
export async function getDraftPage(
  pageId: string,
): Promise<PageSnapshot>;                 // composes from cms_sections + cms_blocks
export async function getVersionPage(
  versionId: string,
): Promise<PageSnapshot>;                 // reads an arbitrary historical snapshot
```

All three return the same `PageSnapshot` type, so `<PageRenderer>` cannot tell
which one it was handed. That is what makes preview (§4.4) a real storefront
render rather than an approximation of one.

**`getPublishedPage()` is two reads, and its predicate is not optional.**

```sql
-- 1. resolve the page: the market-specific row wins, the all-markets row is the fallback
SELECT id, published_version_id
  FROM cms_pages
 WHERE lower(path) = lower($1)
   AND coalesce(market_code, '**') IN ($2, '**')
   AND status = 'published'
   AND deleted_at IS NULL
   AND published_version_id IS NOT NULL
 ORDER BY (market_code IS NULL)          -- false (0) before true (1)
 LIMIT 1;                                -- idx_cms_pages_path_live (02 §2.8)

-- 2. SELECT snapshot FROM content_versions WHERE id = $published_version_id;   -- PK
```

`status = 'published' AND deleted_at IS NULL` is load-bearing and its omission is
the most expensive bug this design can produce. `published_version_id` is
deliberately **kept** when a page is unpublished or archived (§4.1, and the
`RESTRICT` FK in `02` §2.8 requires it), so a loader that reads
`published_version_id` alone leaves every unpublished and every soft-deleted page
serving its last live snapshot for as long as the row exists — an "Unpublish"
button that does not unpublish, discovered by the client and never by a test.
`tests/integration/cms-unpublish.test.ts` publishes a page, unpublishes it, and
asserts the public route 404s while version history still lists the version.

Both reads are wrapped by `cached()` in `src/lib/cms/` (permitted there by `01`
§2.2) with **`marketCode` in the key parts** — `01` §2.4 requires every cache key
to carry the market, and a page-by-path cache keyed on path alone would serve the
India-specific `/about` row to a US visitor. Tags: `tags.cmsPage(pageId)` and
`tags.market(marketCode)`.

```ts
// src/types/cms.ts
export type PageSnapshot = {
  schemaVersion: 1;                       // bumped only by a snapshot migration (§5.6)
  page: { id: string; pageType: 'home'|'standard'|'landing'|'system'; path: string;
          title: string; layoutKey: string; isIndexable: boolean;
          marketCode: MarketCode | null };
  sections: SectionSnapshot[];            // ordered by position, ascending
};
export type SectionSnapshot = {
  id: string; key: string | null; position: number;
  layout: 'full_bleed'|'contained'|'split_2'|'grid_3'|'grid_4';
  backgroundToken: BackgroundToken | null;   // §2.1 — a closed seven-value set,
                                             // NOT string. NULL = inherit --md-bg
  backgroundMediaId: string | null;
  paddingScale: 'none'|'sm'|'md'|'lg';
  isVisible: boolean; visibleFrom: string | null; visibleTo: string | null;
  marketCodes: MarketCode[] | null;       // null = all markets (§1.4)
  blocks: BlockSnapshot[];                // ordered, nested via children
};
export type BlockSnapshot = {
  id: string; blockType: string; position: number;
  config: Record<string, unknown>;                  // cms_blocks.config — complete
  configTablet: Record<string, unknown> | null;     // sparse override
  configMobile: Record<string, unknown> | null;     // sparse override
  visibility: { desktop: boolean; tablet: boolean; mobile: boolean };
  marketCodes: MarketCode[] | null;                 // null = all markets (§1.4)
  children: BlockSnapshot[];                        // parent_block_id materialised
};
```

`visibleFrom` / `visibleTo` / `marketCodes` are **kept in the snapshot and
evaluated at render time**, not filtered out at publish time. Otherwise a
scheduled merchandising window inside a published page would require a republish
to open, which defeats the column's purpose.

### 1.3 The block registry — one definition, five consumers

`src/components/blocks/registry.ts` is the only place a block type is declared.
The declaration drives the admin picker, the admin editing form, write-time
validation, the storefront renderer, reference extraction for media usage and
restore preflight, and the per-breakpoint override schema. Adding a block type is
**one new file plus one line in the barrel**, never an edit in five places.

```ts
// src/components/blocks/registry.ts
import type { z } from 'zod';
import type { LucideIcon } from 'lucide-react';

export type Breakpoint = 'desktop' | 'tablet' | 'mobile';

export type BlockFieldKind =
  | 'text' | 'textarea' | 'richtext' | 'number' | 'boolean' | 'select'
  | 'media' | 'media_list' | 'link' | 'colour_token' | 'align'
  | 'aspect_ratio' | 'product' | 'product_list'
  | 'collection' | 'category' | 'stone' | 'cms_page';

export type BlockField = {
  key: string;                       // MUST exist in `schema.shape`
  label: string;                     // the admin form label — no separate i18n file
  kind: BlockFieldKind;
  group: 'content' | 'layout' | 'style' | 'advanced';
  help?: string;
  options?: readonly { value: string; label: string }[];   // kind === 'select'
  responsive?: true;                 // may carry a tablet/mobile override (§3)
  required?: true;
};

export type BlockReference =
  | { kind: 'media';      id: string }
  | { kind: 'product';    id: string }
  | { kind: 'collection'; id: string }
  | { kind: 'category';   id: string }
  | { kind: 'stone';      id: string }
  | { kind: 'cms_page';   id: string };

export type BlockRenderProps<C> = {
  blockId: string;
  /** All three breakpoints, already resolved by resolveBlockConfig (§3.2). */
  config: Record<Breakpoint, C>;
  visibility: Record<Breakpoint, boolean>;
  market: Market;
  /** Server data pre-fetched in ONE batched pass by the page renderer (§1.4). */
  data: BlockData;
  /** 'published' | 'draft' | 'version' — blocks use it only to render an
   *  "unresolved reference" placeholder in the builder, never in production. */
  renderSource: RenderSource;
};

export type BlockDefinition<S extends z.ZodObject<z.ZodRawShape> = z.ZodObject<z.ZodRawShape>> = {
  /** === cms_blocks.block_type. Lowercase snake_case, stable forever. */
  readonly type: string;
  readonly label: string;
  readonly group: 'layout' | 'editorial' | 'commerce' | 'brand' | 'utility';
  readonly icon: LucideIcon;
  readonly previewThumb: `/admin/blocks/${string}.svg`;
  /** Validates cms_blocks.config on every write. Always COMPLETE (desktop base). */
  readonly schema: S;
  /** Seed for "add block" — must itself parse against `schema`. */
  readonly defaults: z.infer<S>;
  /** Drives the admin form. No block ships a bespoke admin component. */
  readonly fields: readonly BlockField[];
  readonly Component: React.ComponentType<BlockRenderProps<z.infer<S>>>;
  /** Every id this config points at. Powers §7.5 usage tracking and §5.5 restore preflight. */
  readonly references: (config: z.infer<S>) => BlockReference[];
  /** Batched server fetch. Receives EVERY instance of this type on the page at once. */
  readonly loadData?: (
    instances: { blockId: string; config: z.infer<S> }[], market: Market,
  ) => Promise<Map<string, BlockData>>;
  /** The <img sizes> attribute per breakpoint (§7.7). Required if the block renders an image. */
  readonly sizes?: Record<Breakpoint, string>;
  readonly maxPerPage?: number;
  /** Container blocks only. Absent ⇒ the block accepts no children. */
  readonly allowedChildren?: readonly string[];
};

export const blockRegistry = {
  hero, image, text, editorial_split, split_layout, gallery, lookbook, video,
  quote, product_grid, product_carousel, collection_feature, stone_strip,
  stone_editorial, one_of_a_kind, heritage, timeline, rich_text, cta,
  newsletter, banner, faq, spacer,
} as const satisfies Record<string, BlockDefinition>;

export type BlockType = keyof typeof blockRegistry;

/** Generated, never authored: the sparse-override schema is `schema` narrowed to
 *  the `responsive` fields and made partial. A hand-written override schema
 *  drifts from `fields` the first time someone adds a field. */
export function overrideSchemaFor(type: BlockType): z.ZodType;
```

The barrel is **explicit imports, not a glob**. A `import.meta.glob`-style
registry makes the storefront bundle unanalysable and ships every block to every
page; explicit imports let Next tree-shake a page that uses four block types down
to four components.

**`cms_blocks.block_type` deliberately carries no `CHECK` constraint** (and `02`
§1.9 does not list it among the CHECK-constrained TEXT columns). Adding a block
type must be a deploy of one file, not a deploy plus a migration. The integrity
guarantee is moved one layer up and made testable:

- `saveBlock()` validates `block_type in blockRegistry` before the write — an
  unknown type is a `ValidationError`, never a row.
- `<BlockRenderer>` renders **nothing** for an unknown type in production and a
  visible "Unknown block type: `x` — this block was removed from the build"
  panel in the builder and in preview.
- `tests/integration/cms-block-types.test.ts`:
  `SELECT DISTINCT block_type FROM cms_blocks` ⊆ `Object.keys(blockRegistry)`.
  Deleting a block type from the codebase while rows still use it fails CI.

Registry contract tests, all in `tests/unit/block-registry.test.ts`:

| Assertion | The bug it prevents |
| --- | --- |
| every `fields[].key` exists in `schema.shape` | a form field that saves into a key the schema strips, so the editor's input vanishes on reload |
| every `responsive` field key appears in `overrideSchemaFor(type)` | a per-breakpoint control whose value is discarded on write |
| `defaults` parses against `schema` | "Add block" inserting a row that fails its own validation |
| `sizes` present whenever `fields` contains a `media`/`media_list` kind | an image shipped at full width on a 320px phone (§7.7) |
| `references()` returns an entry for every `media`/`product`/`collection`/`category`/`stone`/`cms_page` field | an asset that the media library reports as unused and lets an admin delete out from under a live page |
| config nesting depth ≤ 1 (`tests/unit/block-config-flat.test.ts`, named in `02` §2.8) | a nested object silently clobbered by the shallow breakpoint merge (§3.2) |

### 1.4 Rendering pipeline

```
getPublishedPage(path, market)        // 1 row
  → PageSnapshot
  → filterSections(snapshot, { market, now })        // market_code + visible_from/to
  → collectBlocks(snapshot)                          // flatten, group by blockType
  → for each type with loadData: ONE batched call    // N blocks, 1 query per type
  → <PageRenderer snapshot data=… />
      → <SectionRenderer>  (layout, background token, padding)
          → <BlockRenderer> → blockRegistry[type].Component
```

**Blocks never fetch.** A block component is a pure function of
`(config, data, market)`. `eslint-plugin-boundaries` already forbids
`src/components/**` importing `@/lib/db` or a non-type service export (`01` §2.2);
`loadData` lives on the definition and is invoked by `src/lib/cms/render.ts`,
which is service-layer code. Without this, a homepage with six `product_grid`
blocks is six sequential round trips inside a render — the exact failure the
`resolvePriceBatch` rule in `01` §2.3 exists to prevent, reappearing in the CMS.

`loadData` for the commerce blocks calls `getDisplayPrice()` and
`getAvailability()` — never `resolvePrice()`, which is banned from cached paths
(`01` §2.4) and would bake one customer's coupon price into the homepage's ISR
object.

**`filterSections` runs before `collectBlocks`**, so a section or block scoped to
another market is never counted into a `loadData` batch and never costs a query.

**Market scoping is one code today and a set tomorrow, and the renderer is written
for the set now.** `cms_sections.market_code` / `cms_blocks.market_code` are a
single nullable `CHAR(2)` (`02` §2.8): a section is for one market or for all of
them. With US and India that is sufficient. With UK and Canada added it is not —
"this hero is for US and Canada but not India" has no representation, and the
editor's only recourse is to duplicate the section per market, which multiplies
every subsequent edit by the number of markets. The forward-compatible shape is
adopted **in the snapshot and the renderer now**, so the later change is a
migration and a composer edit rather than a rewrite of every consumer:

- `SectionSnapshot.marketCodes: MarketCode[] | null` and
  `BlockSnapshot.marketCodes: MarketCode[] | null` (`null` = all markets), which
  the composer populates today as `market_code === null ? null : [market_code]`.
- `filterSections` and `<BlockRenderer>` test `marketCodes === null ||
  marketCodes.includes(market.code)` — a set test from day one.
- The migration when a third market lands is `cms_section_markets` /
  `cms_block_markets` join tables `(section_id, market_code)` plus a backfill from
  the existing column; nothing in `src/components/blocks/**` changes.

`tests/unit/cms-market-filter.test.ts` asserts the set semantics, so the
single-element array is exercised by the same code path the join table will feed.

### 1.5 Permissions — the CMS half of the RBAC catalogue

Hard rule 9: hiding UI is not authorization. `01` §2.3 makes `authorize` step 2 of
every mutating service function, before the version check and before the
transaction. **Every function named in this document performs it**, and the keys
below are added verbatim to `src/lib/rbac/catalogue.ts`, which
`tests/unit/rbac-catalogue.test.ts` (`02` §2.2) asserts against the `permissions`
table — a key referenced here but absent from the catalogue fails CI rather than
denying silently at runtime.

> **This document previously defined a parallel CMS permission catalogue and it
> has been withdrawn.** `11 §1.3` is the single 72-key catalogue and `11 §1.4` the
> single role matrix; a key spelled two ways in two documents is one string with
> two owners. The withdrawn spellings are listed in `11 §1.3`'s **Renamed from**
> column — that column is the grep list, and
> `tests/unit/rbac-catalogue.test.ts` fails when any of them appears under `src/`
> or `docs/architecture/`, which is why they are not reproduced here. The rows
> below are the canonical keys, for reading convenience only; where this table and
> `11 §1.3` / `§1.4` differ, `11` is right.

| Canonical key | Gates | Held by (11 §1.4) |
| --- | --- | --- |
| `cms.read` | `/admin/content/**`, `getDraftPage`, history, diff | `owner`, `admin`, `catalog_manager`, `content_editor`, `analyst` |
| `cms.update` | `applyBuilderOps`, every autosave, per-breakpoint config. **Does not include restore** | `owner`, `admin`, `content_editor` |
| `cms.publish` | `publishPage`, `publishVersion`, `schedulePage`, `unpublishPage`, `archivePage`; journal publish | `owner`, `admin`, `content_editor` |
| `cms.restore` | `restoreVersion()`, version pinning. Restore writes to the **draft**; going live still needs `cms.publish` | `owner`, `admin`, `content_editor` |
| `cms.delete` | soft delete of a `cms_pages` row (`deleted_at`) | `owner`, `admin` |
| `content.preview` | `createPreviewToken()`, `revokePreviewToken()` — an **entity-scoped** grant (§4.4) | `owner`, `admin`, `catalog_manager`, `content_editor` |
| `market.preview` | a **market-scoped** preview grant (§4.4) | `owner`, `admin`, `catalog_manager`, `content_editor` |
| `journal.manage` | `journal_posts` CRUD **and** publish | `owner`, `admin`, `content_editor` |
| `menu.manage` | `navigation_menus` / `navigation_items`, `saveMenu()` | `owner`, `admin`, `content_editor` |
| `media.read` | browse the library, view usage reports | all seven roles |
| `media.create` | `POST /api/media/sign`, `registerUpload()`, create folders | `owner`, `admin`, `catalog_manager`, `content_editor` |
| `media.update` | `replaceMedia()`, alt text, title, credit, folder move, tagging | `owner`, `admin`, `catalog_manager`, `content_editor` |
| `media.delete` | soft delete an asset (`media.deleted_at`); the usage report runs first | `owner`, `admin`, `content_editor` |
| `media.hard_delete` | permanently remove the provider asset (§7.8); type-to-confirm | `owner` **only** |
| `media.upload_vector` | `POST /api/media/svg` (§7.10 layer 1) | `owner`, `admin` |
| `tag.update` | `media_tags`, `journal_post_tags` (§7.2, §9.1) | `owner`, `admin`, `catalog_manager`, `content_editor` |
| `settings.manage` | any `settings` write including the `cms.*` retention keys, **and `email_templates`** (§10) | `owner`, `admin` |
| `redirect.manage` | `/admin/content/redirects` | `owner`, `admin`, `content_editor` |
| `seo.manage` | `seo_metadata` overrides, robots directives (§1.1) | `owner`, `admin`, `catalog_manager`, `content_editor` |

Four decisions `11 §1.3` made that this document must not re-litigate:

- **Journal editing and journal publishing are one key, `journal.manage`.**
  `11 §1.4` grants `cms.publish` to `content_editor` anyway; splitting journal
  while pages are unsplit for the same role produces a distinction with no holder.
- **Email-template editing is `settings.manage`, not a key of its own.** `08 §5`
  already routes `/admin/settings/email-templates` there.
- **`cms.restore` is granted wherever `cms.publish` is.** Withholding restore from
  a role that can already publish is incoherent — it could republish the old
  content by hand in thirty seconds.
- **`media.hard_delete` and `media.update` are new canonical keys**, not renames.
  There was previously no way to express "may permanently destroy a Cloudinary
  asset" or "may retitle an asset but not delete it", and both are specified
  behaviour in §7.8 and §7.4.

Two consequences that are easy to get wrong and are therefore stated:

- **`cms.update` does not imply `cms.publish`.** The split is the whole
  point of having a `content_editor` role at all: an editor drafts and previews,
  and whether that role may also make it public is one row of `role_permissions`.
  A single `cms.manage` permission would make the role matrix decorative.

  > **NEEDS INPUT:** whether `content_editor` may publish unsupervised. An earlier
  > draft of this document assumed an owner/admin publish gate; `11 §1.4` follows
  > `07 §2.5` and grants `content_editor` both `cms.publish` and `journal.manage`.
  > It is an editorial-governance decision, not an architectural one, and it is
  > reversible from `/admin/settings/roles` with no deploy.
- **Authorization is checked in the service, not in the server action and not in
  the route segment.** `/admin/**` middleware authenticates (is there a valid
  staff session) and nothing more; a session with no CMS permission that POSTs
  directly to the server action gets `ForbiddenError` from
  `requirePermission()` inside `applyBuilderOps`, because that is the only place
  the check cannot be routed around.
  `tests/integration/cms-rbac.test.ts` drives every exported mutator in this
  document with an `analyst` session and asserts `403` and zero rows written.

### 1.6 No money, and no commerce data, originates in the CMS

Four rules, because the page builder is the surface most likely to grow a second
pricing path by accident:

1. **A snapshot never contains an amount.** Already asserted by
   `tests/integration/cms-snapshot-no-commerce.test.ts` (§1.2). A block config
   stores `collection_id`, never a price; a version restored from 2027 therefore
   cannot resurrect a 2027 price.
2. **Every price a block displays comes from `getDisplayPrice(variantIds,
   marketCode)`** (`01` §2.3), in the market the URL asked for, via `loadData`.
   No block formats an amount itself: `formatMoney` from `src/lib/money.ts` is
   the only formatter, and `Intl.NumberFormat` / `toFixed` / `parseFloat` are
   banned outside that file (`01` §2.2).
3. **No sort, filter or aggregate ever compares amounts across currencies.**
   `product_grid.sort = 'price_asc' | 'price_desc'` resolves inside
   `src/lib/catalog` as an `ORDER BY` over the `prices` row **for that market
   only** (`prices.market_code = $market AND valid_to IS NULL`), never over a
   converted or pooled amount. A `best_selling` sort has the same hazard in a
   worse disguise — summing order revenue across markets adds USD to INR — so it
   reads a per-market rollup and nothing else (§2.1).
4. **A money-typed `settings` value is parsed on the server, from a string.** The
   admin form for `value_type = 'money'` posts `{ amount: "1,250.00",
   currencyCode: "USD" }` and the action calls
   `parseMoneyInput(amount, currencyCode): bigint` in `src/lib/money.ts`, which
   works on the digit string (strip grouping, split on the decimal separator, pad
   to the currency's exponent) and throws on anything else. The browser never
   multiplies by 100: `1250.10 * 100` is `125009.99999999999` in IEEE-754 double,
   and a free-shipping threshold one minor unit low is a rounding bug that
   surfaces as a customer-visible total. The stored shape stays
   `{"amountMinor":"125010","currencyCode":"USD"}` (`02` §2.8) — a **string** for
   `amountMinor`, because `JSON.parse` of a JSONB number is a double.

---

## 2. Page builder

### 2.1 The block catalogue

23 block types at launch. `Responsive` names the fields that may carry a
tablet/mobile override (§3); everything else is a single value for all
breakpoints. Every media field is a `media.id`; every colour field is a design
token name from `src/styles/tokens.css`, never a hex value (`02` §2.8).

**`background_token` is a closed seven-value set, and it is now constrained.** It
was the one small `TEXT` value set in the schema with no `CHECK`, in a schema that
CHECK-constrains eighteen others (`02 §1.9`) — so "never a hex value" was prose
with nothing enforcing it, and the surface vocabulary was two words in a design
document (`10 §2.1`). `11 §7.7` fixes the list; `10 §2.1` is where the tokens are
declared; and all three are generated from one file:

```ts
// src/lib/cms/backgroundTokens.ts
//   GENERATED at build time from src/styles/tokens.css by scripts/gen-background-tokens.ts.
//   Do not hand-edit — tests/unit/background-tokens.test.ts fails on drift.
export const BACKGROUND_TOKENS = [
  '--md-ivory-soft',   // page ground (what NULL means)
  '--md-ivory',        // raised / alternating band
  '--md-stone',        // quiet divider band
  '--md-emerald-deep', // primary dark surface
  '--md-forest',       // secondary dark surface
  '--md-green-dark',   // deep panel / image scrim base
  '--md-green-black',  // near-black ground, full-bleed editorial
] as const;
export type BackgroundToken = (typeof BACKGROUND_TOKENS)[number];
export const backgroundTokenSchema = z.enum(BACKGROUND_TOKENS);   // reused by 4 block schemas
```

> **SCHEMA ADDITION (02 §2.8, `cms_sections`):**
> ```sql
> ALTER TABLE cms_sections ADD CONSTRAINT chk_cms_sections_background_token
>   CHECK (background_token IS NULL OR background_token IN (
>     '--md-ivory-soft','--md-ivory','--md-stone',
>     '--md-emerald-deep','--md-forest','--md-green-dark','--md-green-black'));
> ```
> The migration body is emitted by the same generator that writes
> `backgroundTokens.ts`, so the stylesheet, the TypeScript constant and the
> database constraint cannot drift apart: `tests/unit/background-tokens.test.ts`
> asserts the three sets are equal, and deleting a token from `tokens.css` fails
> the build instead of rendering `var(--md-gone)` as transparent.

The `background_token` **field** on the `banner`, `cta`, `heritage` and
`newsletter` blocks below takes the same seven values, validated by
`backgroundTokenSchema` in their registry schemas — a block config is `jsonb` and
has no `CHECK` available to it, so the schema is the only enforcement point and
`applyBuilderOps` step 4 (§2.2) is where it runs. `10 §2.1`'s
`surface="ivory" | "emerald"` is the **editor's** two-way toggle and maps to
`--md-ivory` and `--md-emerald-deep`; the other five are in the section
inspector's advanced group.

#### Layout group

| `type` | Fields | Responsive |
| --- | --- | --- |
| `split_layout` | `ratio` (`50_50`\|`60_40`\|`40_60`\|`70_30`\|`30_70`), `gap` (`none`\|`sm`\|`md`\|`lg`), `vertical_align` (`top`\|`center`\|`bottom`), `reverse_on_mobile` (bool), `left_max_width`, `right_max_width`. Container: `allowedChildren` = `['image','text','rich_text','video','quote','cta','product_grid','gallery','newsletter','timeline']` | `ratio`, `gap`, `vertical_align` |
| `spacer` | `height_px` (8–320), `show_rule` (bool), `rule_token` | `height_px` |
| `banner` | `text`, `link_label`, `link_href`, `background_token`, `text_token`, `is_dismissible` (bool), `dismiss_cookie_days`, `start_at`, `end_at`, `position` (`top`\|`inline`) | `text` |

#### Editorial group

| `type` | Fields | Responsive |
| --- | --- | --- |
| `hero` | `media_id`, `video_media_id`, `eyebrow`, `headline`, `subheadline`, `cta_label`, `cta_href`, `secondary_cta_label`, `secondary_cta_href`, `overlay_opacity` (0–100), `overlay_token`, `text_token`, `height` (`viewport`\|`tall`\|`medium`\|`short`), `content_align` (`left`\|`center`\|`right`), `content_position` (9-point grid: `top_left`…`bottom_right`), `aspect_ratio` | `media_id`, `height`, `content_align`, `content_position`, `aspect_ratio`, `headline` |
| `image` | `media_id`, `caption`, `credit`, `aspect_ratio`, `fit` (`cover`\|`contain`), `max_width`, `align`, `link_href`, `rounded` (bool) | `media_id`, `aspect_ratio`, `max_width`, `align` |
| `text` | `eyebrow`, `heading`, `heading_level` (`h1`–`h4`), `body`, `align`, `max_width`, `text_token` | `align`, `max_width`, `heading_level` |
| `rich_text` | `body_json` (Tiptap, §9.3), `max_width`, `align`, `drop_cap` (bool), `columns` (1–2) | `max_width`, `align`, `columns` |
| `editorial_split` | `media_id`, `media_side` (`left`\|`right`), `eyebrow`, `heading`, `body_json`, `cta_label`, `cta_href`, `media_ratio` (`50_50`\|`60_40`\|`40_60`), `aspect_ratio`, `vertical_align`, `heading_position` (`above_body`\|`above_media`\|`overlay_media`) | `media_id`, `media_side`, `media_ratio`, `aspect_ratio`, `vertical_align`, `heading_position` |
| `gallery` | `media_ids[]` (2–24), `columns` (1–6), `gap`, `aspect_ratio`, `captions_visible` (bool), `lightbox_enabled` (bool), `crop` (`uniform`\|`masonry`) | `columns`, `gap`, `aspect_ratio`, `crop` |
| `lookbook` | `media_ids[]`, `layout` (`stacked`\|`offset`\|`full_bleed_alternating`), `heading`, `body_json`, `hotspots_enabled` (bool), `hotspots[]` (`{media_id, x_pct, y_pct, product_id}`) | `layout` |
| `quote` | `quote_text`, `attribution`, `role`, `media_id`, `align`, `size` (`sm`\|`md`\|`lg`), `rule_above` (bool) | `align`, `size` |
| `video` | `media_id` (Cloudinary video), `poster_media_id`, `mode` (`inline`\|`background`), `autoplay`, `loop`, `muted`, `controls`, `aspect_ratio`, `caption`, `captions_vtt_media_id` | `media_id`, `poster_media_id`, `aspect_ratio`, `mode` |
| `timeline` | `heading`, `orientation` (`vertical`\|`horizontal`), `entries[]` (`{label, heading, body, media_id}` — `label` is free text, never a generated year), `line_token`, `entries_per_view` | `orientation`, `entries_per_view` |
| `faq` | `heading`, `items[]` (`{question, answer_json}`), `allow_multiple_open` (bool), `emit_jsonld` (bool) | — |

#### Commerce group

| `type` | Fields | Responsive |
| --- | --- | --- |
| `product_grid` | `source` (`collection`\|`category`\|`manual`\|`stone`\|`one_of_a_kind`\|`new_arrivals`), `collection_id`, `category_id`, `stone_id`, `product_ids[]`, `limit` (1–48), `columns` (1–6), `gap`, `sort` (`manual`\|`rank`\|`newest`\|`price_asc`\|`price_desc`\|`best_selling`), `heading`, `cta_label`, `cta_href`, `show_price` (bool), `show_stone` (bool), `card_aspect_ratio` | `columns`, `gap`, `limit`, `card_aspect_ratio` |
| `product_carousel` | same source fields as `product_grid`, plus `slides_per_view`, `peek` (bool), `autoplay`, `autoplay_delay_ms`, `loop`, `show_arrows`, `show_dots` | `slides_per_view`, `peek`, `show_arrows`, `show_dots` |
| `collection_feature` | `collection_id`, `media_id`, `heading_override`, `body_override_json`, `cta_label`, `layout` (`media_left`\|`media_right`\|`media_background`), `show_product_count` (bool), `preview_count` (0–6), `aspect_ratio` | `layout`, `preview_count`, `aspect_ratio` |
| `one_of_a_kind` | `limit` (1–12), `columns`, `heading`, `body_json`, `show_sold` (bool), `badge_label`, `cta_href`, `card_aspect_ratio` | `columns`, `limit`, `card_aspect_ratio` |

`one_of_a_kind` reads availability through `getAvailability()` and marks a sold
piece rather than hiding it when `show_sold` is true — a one-of-a-kind catalogue's
sold archive is merchandising, not dead weight. It is never a hardcoded list:
`source` is always the ONE OF A KIND category (`02` §2.4).

**A responsive `limit` is a count, and one DOM tree cannot have three counts —
so the count is decided on the server and the surplus is hidden in CSS.** This is
the one place where §3.4's "one markup tree, three configurations" collides with a
field whose value changes how much data is fetched, and getting it wrong shows up
as a mobile visitor seeing eight cards where the editor configured four, or a
desktop visitor seeing four where they configured eight. The rule, implemented in
`src/lib/cms/render.ts` and in `globals.css`, never in a block component:

- `loadData` fetches **`max(limit_desktop, limit_tablet, limit_mobile)`** items,
  once. Fetching per breakpoint is impossible (the server does not know the
  viewport) and fetching the smallest is wrong on the largest.
- `limit`, `preview_count` and `linked_product_limit` are constrained to the
  ladder **2, 3, 4, 6, 8, 9, 12, 16, 18, 24, 36, 48** (`z.literal` union in the
  block schema, rendered as a select, not a free number input). A free 1–48 range
  would need 144 generated CSS rules; the ladder needs 36 and covers every grid
  shape 1–6 columns can make.
- The block wrapper emits `data-limit-sm` / `data-limit-md` / `data-limit-lg`,
  and `globals.css` carries one static rule per ladder value per breakpoint:
  `[data-limit-sm="4"] > .md-card:nth-child(n+5){display:none}`, the `md` rules
  inside `@media (min-width:768px)` re-showing with `display:revert` first, the
  `lg` rules likewise at 1280px. Generated from the ladder constant by
  `scripts/gen-limit-rules.ts` at build time so the two can never drift.
- The surplus cards are in the HTML at every width. That is the accepted cost and
  it is bounded by the ladder: the difference between a 4-up mobile and an 8-up
  desktop is four product cards of markup, no extra images (a `display:none`
  subtree fetches none — §3.4) and no extra queries.
- `tests/e2e/cms-responsive-limit.spec.ts` loads a `product_grid` configured
  `8 / 6 / 4` at 1440 / 834 / 375 and counts **visible** cards at each width.

**`sort: 'best_selling'` needs a per-market source.** Ordering by "best selling"
means ordering by units over a window, and that is a per-market quantity: a piece
that sells in India is not a bestseller in the US, and summing `order_items`
revenue across markets adds INR to USD, which is hard rule 2 violated inside an
`ORDER BY` where nobody would look for it.

> **The table is `product_market_sort`, and this document no longer creates one
> of its own.** An earlier draft commissioned `product_market_metrics` here for
> exactly this block, while `08 §2.3` independently commissioned
> `product_market_sort` for `?sort=best_selling` on the PLP — two tables, two
> refresh jobs, two `units_90d` columns with *different* predicates, and a
> storefront where a `product_grid` and the PLP of the same category could
> legitimately return different orderings. `11 §7.9` settles it:
>
> - **The table is `product_market_sort`** (`08 §2.3`'s DDL verbatim, including
>   the composite FK to `markets (code, currency_code)` and its two indexes).
>   `product_market_metrics` is **not created** and its DDL is withdrawn.
> - **The refresh job kind is `product_metrics_refresh`** — this document's name,
>   kept, because it was the only enum value either document proposed. It is
>   `systemPermitted: true`, `dedupeKey: 'kind'` (`11 §3.2`), drained nightly by
>   `/api/cron/run-jobs` and for the affected products by
>   `/api/cron/pricing-rule-windows` (`11 §5.2`).
> - **`units_90d` uses `08 §2.3`'s predicate** — paid, non-cancelled,
>   `quantity - returned_quantity` — because aggregating `order_items` alone ranks
>   whatever people *tried* to buy.
> - **The stored sort value is `best_selling`**, matching
>   `chk_collections_sort_order` (`02 §2.4`). The spelling `bestselling` used in
>   an earlier draft of this section is rejected.
>
> `product_grid.sort = 'best_selling'` therefore resolves to
> `ORDER BY product_market_sort.units_90d DESC, product_id` scoped to
> `market_code = $market`, and to nothing else. **`product_market_sort` may appear
> in a `WHERE` or an `ORDER BY` and nowhere else** (`08 §3.2`): it is a cache, and
> reading an amount out of it to display, publish or charge is a second price
> authority. No block ever reads `min_price_minor` from it — prices come from
> `getDisplayPrice()` (§1.6 rule 2).

**`stone_strip` with an empty `stone_ids` is not an unbounded read.** "All active
stones by `rank`" is `LIMIT 24` in the service, not "every row the table happens
to hold" — `01` §2.7 admits no unbounded query anywhere, and a stone table that
grows to 200 rows would otherwise render a 200-item strip on the homepage. The
same cap applies to `gallery.media_ids` (schema-capped at 24) and to every
`*_list` field.

#### Brand group

| `type` | Fields | Responsive |
| --- | --- | --- |
| `stone_strip` | `stone_ids[]` (ordered; empty ⇒ all active stones by `rank`), `display` (`circles`\|`cards`\|`inline_text`), `columns`, `show_names` (bool), `heading`, `cta_href` | `columns`, `display` |
| `stone_editorial` | `stone_id`, `media_id`, `secondary_media_id`, `heading_override`, `body_json`, `properties_shown[]` (which `stones` attributes to surface), `cta_label`, `layout` (`media_left`\|`media_right`\|`stacked`), `linked_product_limit` (0–12) | `layout`, `linked_product_limit` |
| `heritage` | `heading`, `body_json`, `media_id`, `secondary_media_id`, `signature_media_id`, `stat_items[]` (`{value, label}` — **free text, seeded empty**), `layout` (`centered`\|`split`\|`full_bleed_quote`), `background_token` | `layout` |

> **NEEDS INPUT:** every value in `heritage.stat_items` (years in business,
> pieces made, families served, and any award, certification or country count) and
> every `timeline.entries[].label`. These are business facts. They are seeded as
> empty arrays, the block renders nothing where they are empty, and no placeholder
> number is ever displayed (hard rule 8).

#### Utility group

| `type` | Fields | Responsive |
| --- | --- | --- |
| `cta` | `eyebrow`, `heading`, `body`, `primary_label`, `primary_href`, `secondary_label`, `secondary_href`, `background_token`, `background_media_id`, `align`, `size` | `align`, `size`, `background_media_id` |
| `newsletter` | `heading`, `body`, `placeholder`, `button_label`, `success_message`, `consent_text`, `list_key`, `layout` (`inline`\|`stacked`\|`split`), `background_token` | `layout` |

`newsletter` posts to the existing `subscribeNewsletter` server action and writes
`newsletter_subscribers`. It never renders a fake success: an unconfigured Resend
returns `skipped_unconfigured` and the block shows the real "we could not
subscribe you right now" state (`01` §4.9).

### 2.2 Editing operations

All seven operations go through one service function, because they all mutate the
same subtree and must all take the same page-level optimistic lock (`02` §2.8):

```ts
// src/lib/cms/pages.ts
export type BuilderOp =
  | { op: 'add_section';    afterSectionId: string | null; layout: SectionLayout }
  | { op: 'add_block';      sectionId: string; parentBlockId: string | null;
                            blockType: BlockType; atPosition: number }
  | { op: 'update_block';   blockId: string; breakpoint: Breakpoint;
                            patch: Record<string, unknown> }        // §6.2 — dirty keys only
  | { op: 'update_section'; sectionId: string; patch: Partial<SectionSnapshot> }
  | { op: 'delete_block';   blockId: string }
  | { op: 'delete_section'; sectionId: string }
  | { op: 'duplicate_block';   blockId: string }
  | { op: 'duplicate_section'; sectionId: string }
  | { op: 'reorder_blocks';   sectionId: string; parentBlockId: string | null;
                              orderedBlockIds: string[] }
  | { op: 'move_block';       blockId: string; toSectionId: string;
                              toParentBlockId: string | null; atPosition: number }
  | { op: 'reorder_sections'; orderedSectionIds: string[] }
  | { op: 'set_visibility';   blockId: string;
                              visibility: Partial<Record<Breakpoint, boolean>> }
  | { op: 'schedule_section'; sectionId: string;
                              visibleFrom: Date | null; visibleTo: Date | null };

export async function applyBuilderOps(input: {
  pageId: string;
  expectedVersion: number;
  ops: BuilderOp[];
  actor: Actor;
  clientSeq: number;
}): Promise<Result<{
  version: number;
  skippedOps: { index: number; op: BuilderOp['op']; reason: 'missing' | 'stale' }[];
  warnings: BuilderWarning[];       // advisory, never a refusal — §2.2 step 6
  snapshot?: PageSnapshot;          // structural ops only — §6.1
}, ConflictError | ValidationError | ForbiddenError>>;

// src/lib/cms/rhythm.ts — the two advisory checks, in one place
export type BuilderWarning =
  | { kind: 'rhythm_repeat'; sectionId: string; previousSectionId: string;
      backgroundToken: BackgroundToken | null; layout: SectionLayout }
  | { kind: 'block_soft_cap'; blockCount: number; cap: number };

export function checkRhythm(sections: SectionSnapshot[]): BuilderWarning[];
```

| Operation | Implementation | Notes |
| --- | --- | --- |
| **Add** | `INSERT` at `atPosition`, then renumber siblings (§2.3) | `defaults` from the registry; the block is immediately visible in the draft, never live |
| **Delete** | Hard `DELETE` — `cms_sections` and `cms_blocks` are hard-delete tables (`02` §1.4), and `parent_block_id` cascades to children | Recovery is version history (§5), not a tombstone. The builder shows a 10-second "Undo" toast that replays an `add_block` with the captured config, so the common accidental delete never reaches version history at all |
| **Duplicate** | Deep copy of the block and its descendants with fresh UUIDv7s, inserted at `position + 1` | Config is copied verbatim **including** `config_tablet` / `config_mobile`. Media ids are shared, not cloned — duplicating a block must not duplicate a 4MB asset |
| **Reorder** | One statement, dense renumber (§2.3) | |
| **Move** (block to another section) | `UPDATE … SET section_id, parent_block_id, position`, then renumber both the source and destination sibling sets | Rejected when the destination parent's `allowedChildren` excludes the type |
| **Hide** | `is_visible_desktop` / `_tablet` / `_mobile` booleans | Per-breakpoint, queryable, not a config key (`02` §2.8) |
| **Schedule** | `cms_sections.visible_from` / `visible_to` | Section-level only. A block-level window would need two more columns for a case ("this one card appears on Friday") the client has never described; a scheduled block goes in its own section |
| **Edit** | `update_block` with a per-breakpoint patch | §3.3 and §6 |

Every op list runs in **one transaction** behind **one** version bump.
`applyBuilderOps` is the only exported mutator; `src/server/actions/admin/cms.ts`
calls it and nothing else. There is no `deleteBlock()` a future contributor can
call without the lock.

**Six things `applyBuilderOps` does**, each of which is a defect if it is left to
the caller or to the UI. The first five happen before it touches a row; the sixth
happens after the writes and inside the same transaction:

1. **`requirePermission(actor, 'cms.update')`** (§1.5), as `01` §2.3 step 2
   requires. The builder screen already being behind `/admin` is authentication,
   not authorization.
2. **`ops` is parsed by a Zod discriminated union** capped at **200 entries** and
   64KB serialised. An op list is client-supplied; an unbounded one is an
   unbounded transaction on a pooled Neon connection (`00` §3: `prisma dev` caps
   at ~10 connections, and production pooling is not much more forgiving).
3. **Every `blockId` and `sectionId` in the op list is re-resolved against
   `pageId`**, in one query, before anything is written:
   ```sql
   SELECT b.id FROM cms_blocks b
     JOIN cms_sections s ON s.id = b.section_id
    WHERE b.id = ANY($blockIds) AND s.page_id = $pageId;
   ```
   Any id that does not come back is a `ValidationError` and the whole op list is
   refused. Without this the `UPDATE cms_blocks … WHERE id = $1` in §3.2 will
   happily patch a block belonging to a **different page** — a page whose
   `version` was never bumped, whose editors get no `ConflictError`, whose
   autosave will later overwrite the change or be overwritten by it, and whose
   snapshot silently diverges from what its own history says. The page-level lock
   is only a concurrency unit if every write is provably inside the page it
   locked.
4. **Every config patch is validated before the `||` merge, not after.**
   `update_block` with `breakpoint: 'desktop'` validates
   `schema.parse({ ...currentConfig, ...patch })` — the merged document must be
   complete and valid, because `config` is the base every breakpoint inherits
   from. `update_block` on `tablet`/`mobile` validates
   `overrideSchemaFor(type).parse(patch)` **and** asserts every patch key is a
   field marked `responsive: true`. A patch key that is not responsive, or not in
   the schema at all, is rejected rather than merged: `jsonb ||` accepts any
   document, so without this check the server stores whatever the client sent,
   `resolveBlockConfig` spreads it over a valid config, and the block renders
   from data no schema ever saw. Each config column is additionally capped at
   **32KB** (`chk_cms_blocks_config_size: pg_column_size(config) < 32768`).
5. **Every write asserts its affected-row count.** `UPDATE … WHERE id = $1` that
   affects zero rows is not a no-op to be shrugged at — it is the block someone
   else deleted while this editor was typing. `applyBuilderOps` collects those as
   `skippedOps` and returns them with the result; the builder surfaces
   "2 changes could not be applied — the blocks they referenced were deleted",
   naming them. §6.4's **Keep mine (overwrite)** path depends on this entirely:
   replaying an op list against a page another editor has restructured is exactly
   where silent loss hides.
6. **`checkRhythm(sections)` runs against the post-write section list and returns
   `warnings`.** This is where two claims that previously existed only as English
   sentences become code. `10 §5.2` said "the section builder warns the editor"
   about the adjacent-surface rule and `09 R07` said "a soft cap warning in the
   builder above 30 blocks per page"; neither was in this specification, neither
   had a hook, and neither was testable. Both are now this function:

   ```ts
   export const BUILDER_BLOCK_SOFT_CAP = 30;   // 09 R07

   // rhythm_repeat: two adjacent VISIBLE sections with the same resolved surface
   //   AND the same layout. `null` resolves to '--md-ivory-soft' before comparison,
   //   so an explicit page-ground token and an inherited one are the same surface.
   //   Sections hidden at every breakpoint, and sections whose visible_from/visible_to
   //   window is closed, are skipped — a scheduled banner between two ivory bands
   //   does not make them non-adjacent.
   // block_soft_cap: total cms_blocks rows for the page, descendants included,
   //   strictly greater than BUILDER_BLOCK_SOFT_CAP.
   ```

   **Both are warnings and neither is a refusal.** A designer may deliberately
   want two ivory bands in a row, and a campaign page may legitimately need
   forty blocks; a builder that refuses a legal arrangement is a builder the
   editor works around. They are returned in the result, rendered as a dismissible
   strip above the canvas naming the offending sections, and **never** written to
   a table — a warning is a property of the current arrangement, recomputed on
   every apply, not state. `warnings` is always present and is `[]` when clean, so
   a caller cannot forget to handle the field.

   `tests/unit/cms-rhythm.test.ts` (new) covers: two adjacent `contained` sections
   both resolving to `--md-ivory` ⇒ one `rhythm_repeat`; the same two with
   different layouts ⇒ none; the same two separated by a section hidden at all
   three breakpoints ⇒ still one, because the hidden section is skipped; `null`
   versus `--md-ivory-soft` on adjacent sections ⇒ one; a 30-block page ⇒ none;
   a 31-block page ⇒ one `block_soft_cap`.
   `tests/e2e/cms-builder-warnings.spec.ts` (new) asserts the strip appears and
   that the apply still succeeded.

**Autosave does not write an audit row per save.** `01` §2.3 step 5 mandates
`recordAudit` inside the transaction, and taken literally at a 750ms debounce that
is thousands of `audit_logs` rows per editing session — on the table `02` §2.9
already flags as unbounded and un-pruned pending client input. The split:

- **Structural ops** (`add_*`, `delete_*`, `move_block`, `duplicate_*`,
  `reorder_*`, `schedule_section`, `set_visibility`) write one audit row per
  `applyBuilderOps` call, with a summary listing the ops.
- **Content ops** (`update_block`, `update_section`) write **one coalesced row per
  (page, actor) per `cms.version_autosnapshot_interval_minutes`** — the same
  throttle as the version snapshot (§5.2), updating the existing row's `after` and
  `created_at` rather than inserting. Recall of *what changed* lives in
  `content_versions`, which is the table designed for it; `audit_logs` answers
  *who touched this page and when*, and one row per editing window answers that.
- `publish`, `unpublish`, `archive`, `restore` and every permission-relevant
  action are never coalesced.

### 2.3 How ordering is stored

`position SMALLINT NOT NULL` with the deferrable unique constraints already in
`02` §2.8:

```sql
-- 02 §2.8, verbatim
uq_cms_sections_position (page_id, position) DEFERRABLE INITIALLY DEFERRED
uq_cms_blocks_position   (section_id, coalesce(parent_block_id, '000…000'::uuid), position)
                         DEFERRABLE INITIALLY DEFERRED
```

A reorder is **one statement**, dense renumber from 0:

```sql
UPDATE cms_blocks AS b
   SET position = v.pos, updated_at = now()
  FROM (VALUES ($1::uuid, 0::smallint), ($2, 1), ($3, 2) /* … */) AS v(id, pos)
 WHERE b.id = v.id
   AND b.section_id = $section
   AND b.coalesce_parent = $parent;   -- expression matched by the unique index
```

`DEFERRABLE INITIALLY DEFERRED` is what makes this legal: the constraint is
checked at `COMMIT`, so the intermediate states where two rows both hold
`position = 3` never raise. Without it the same reorder needs a three-phase
shuffle through negative positions, which is three statements and a temporarily
corrupt page if any one of them fails.

**Why dense integers and not fractional ranks (LexoRank / a `NUMERIC` midpoint).**
Fractional ranks make a single-item move a one-row update regardless of list
length — genuinely better for a 10,000-row backlog board. Here the list is a
section's blocks: fewer than 30 in every case the client has described, capped at
`SMALLINT`. Against that, fractional ranks need a rebalancing job when precision
runs out, produce unreadable positions in a CSV export and in `audit_logs.after`,
and make "move this to the top" a computation instead of a constant. **Dense
renumber wins.** The write is ~30 rows in one statement inside a transaction that
was already open.

**Concurrent reorders cannot corrupt**, for a reason that is not the constraint:
`applyBuilderOps` begins with
`UPDATE cms_pages SET version = version + 1 WHERE id = :id AND version = :expectedVersion`
(`02` §2.8). Two editors reordering the same page at the same moment both target
the same page row; the second gets zero rows affected, a `ConflictError`, and
§6.4's recovery flow. There is no interleaving in which one editor's renumber
lands on top of another's, because the two never execute concurrently against the
same page.

---

## 3. Per-breakpoint configuration

### 3.1 The three breakpoints are fixed, and they are CSS, not JavaScript

| Breakpoint | Range | Tailwind |
| --- | --- | --- |
| `mobile` | `< 768px` | base |
| `tablet` | `768px – 1279px` | `md:` |
| `desktop` | `≥ 1280px` | `xl:` |

Defined **once**, in `src/styles/tokens.css` as `--bp-tablet: 768px` /
`--bp-desktop: 1280px`, and mirrored as the frozen constant
`BREAKPOINTS` in `src/lib/config/constants.ts`. The admin preview frame widths
(`375` / `834` / `1440`) are derived from those values, never typed separately.

### 3.2 Inheritance and override

`config` is **always complete** and always validated against the block's full
`schema`. `config_tablet` and `config_mobile` are **sparse**: they contain only
the keys that differ, and `NULL` means "inherit".

**The rule, stated once and implemented once:**

```
desktop = config
tablet  = { ...config,  ...(config_tablet  ?? {}) }
mobile  = { ...tablet,  ...(config_mobile  ?? {}) }
```

Mobile inherits **through** tablet, not from desktop. A tablet override of
`columns: 2` therefore also applies to mobile unless mobile overrides it again —
which is what an editor means by "two columns from tablet down", and it is the
behaviour `02` §2.8 specifies ("`NULL` = inherit tablet, which inherits desktop").

```ts
// src/lib/cms/blocks.ts
export function resolveBlockConfig<T extends Record<string, unknown>>(
  block: Pick<BlockSnapshot, 'blockType' | 'config' | 'configTablet' | 'configMobile'>,
): Record<Breakpoint, T>;      // all three, in one pass, parsed by the block's schema
```

It returns all three at once because the renderer needs all three (§3.4) and
because computing them separately invites a caller to resolve two and forget the
third.

**The merge is shallow, and that is a constraint on the registry, not a bug.**
`02` §2.8 already accepted this: an override replaces a key wholesale, so a nested
`cta: { label, href }` cannot be half-overridden. Block schemas are therefore flat
(`cta_label`, `cta_href`), enforced by `tests/unit/block-config-flat.test.ts`.
Array-valued fields (`media_ids`, `stat_items`, `entries`) are replaced whole when
overridden, which is the only sane semantic for an ordered list anyway.

**Writes are key-level, not document-level.** `update_block` with
`breakpoint: 'mobile'` and `patch: { columns: 1 }` executes

```sql
UPDATE cms_blocks b
   SET config_mobile = coalesce(config_mobile, '{}'::jsonb) || $patch::jsonb,
       updated_at = now()
  FROM cms_sections s
 WHERE b.id = $1
   AND b.section_id = s.id
   AND s.page_id = $pageId;     -- §2.2 rule 3: never an unscoped `WHERE id = $1`
```

`$patch` has already been parsed by `overrideSchemaFor(type)` and checked to
contain only `responsive` keys (§2.2 rule 4) — `jsonb ||` validates nothing, so
the validation has to happen before the statement, and the affected-row count is
asserted after it (§2.2 rule 5).

so an editor working on mobile never rewrites the desktop document. "Reset to
inherited" is `config_mobile = config_mobile - 'columns'` — **removing** the key,
never setting it to `null`, because `null` is a legitimate value for a nullable
field like `media_id` and conflating the two makes "no override" and "explicitly
no image on mobile" indistinguishable.

### 3.3 The editing UI

The block inspector carries a three-way breakpoint switch (Desktop / Tablet /
Mobile) that changes **both** the preview frame width and the target of every
field write. Each responsive field renders with:

- an **override dot** (filled when this breakpoint has its own value, hollow when
  inherited), with a tooltip naming the source: "inherited from Tablet";
- a **Reset to inherited** action, disabled when no override exists;
- a **Copy from Desktop** action on tablet and mobile.

Non-responsive fields are shown greyed on tablet/mobile with "Edit on Desktop" —
never hidden, because a hidden field reads as a missing feature.

A **Breakpoint overview** panel lists every override on the page
(`block · breakpoint · field · value`) so an editor can answer "why does this look
different on my phone" without clicking through 40 blocks. It is a client-side
derivation of the snapshot, not a query.

### 3.4 Rendering: one markup tree, three configurations

**Three copies of the markup is not an option.** It triples HTML weight on the
LCP page, it means a `product_grid` renders three times server-side, and hiding
two of them with `hidden md:block` still ships and still costs layout work.
Switching on a JS media query is worse: the server does not know the viewport, so
the first paint is wrong and hydration either mismatches or reflows — visible CLS
on the hero, which is the LCP element.

**The decision: one DOM tree; per-breakpoint differences are emitted as inline
CSS custom properties, and media-dependent assets use `<picture>`.** Three
mechanisms, applied by what kind of difference it is:

| Difference | Mechanism | Why |
| --- | --- | --- |
| A **number or token** — columns, gap, padding, height, max-width, aspect ratio, slides-per-view | Inline CSS variable on the block wrapper; one static `@media` rule per property in `globals.css` consumes it | Values are in the HTML before any stylesheet or script; nothing recalculates on load |
| A **position** — alignment, heading position, media side, reverse order | CSS variable feeding `grid-template-areas` / `place-items` / `order`. The heading stays in one place in the DOM and is *placed* differently | Keeps reading order and tab order stable across breakpoints; a DOM reorder would change both |
| A **different asset** — a portrait hero on mobile, a landscape one on desktop | `<picture>` with `<source media="(max-width: 767px)" srcset="…">` | The browser fetches exactly one. A `<source>` whose media query does not match is never requested — this is the only mechanism that actually saves bytes |
| **Block hidden on a breakpoint** | `data-hide-mobile` attribute + one CSS rule | See below |

```html
<section class="md-section" data-layout="contained" data-padding="lg"
         style="--md-bg: var(--md-ivory)">
  <div class="md-block" data-block="product_grid"
       style="--cols:4; --cols-md:3; --cols-sm:2;
              --gap:32px; --gap-md:24px; --gap-sm:16px;
              --card-ar:0.8; --card-ar-sm:1;
              --area:'head' 'grid'; --area-md:'head' 'grid';">
```

```css
/* src/styles/globals.css — written once, for every block */
.md-block            { display: var(--md-display, block);
                       grid-template-columns: repeat(var(--cols-sm, var(--cols)), 1fr);
                       gap: var(--gap-sm, var(--gap));
                       grid-template-areas: var(--area-sm, var(--area-md, var(--area))); }
@media (min-width: 768px)  { .md-block { grid-template-columns: repeat(var(--cols-md, var(--cols)),1fr);
                                         gap: var(--gap-md, var(--gap));
                                         grid-template-areas: var(--area-md, var(--area)); } }
@media (min-width: 1280px) { .md-block { grid-template-columns: repeat(var(--cols),1fr);
                                         gap: var(--gap);
                                         grid-template-areas: var(--area); } }
/* Hiding restores the block's OWN display value, never a hardcoded one. */
.md-block[data-hide-sm="1"] { display: none; }
@media (min-width: 768px)  { .md-block[data-hide-sm="1"]{ display: var(--md-display, block) }
                             .md-block[data-hide-md="1"]{ display: none } }
@media (min-width: 1280px) { .md-block[data-hide-md="1"]{ display: var(--md-display, block) }
                             .md-block[data-hide-lg="1"]{ display: none } }
```

`--md-display` is emitted by `<BlockRenderer>` from the registry definition
(`grid` for `product_grid` / `gallery`, `flex` for `stone_strip` inline mode,
`block` for `text` / `rich_text` / `quote`, and so on). **Re-showing a block with
a literal `display:grid` would be a bug that only appears on the blocks an editor
hid on one breakpoint**: a `rich_text` block hidden on mobile would come back at
768px as a grid container, its paragraphs becoming grid items, its
`grid-template-columns` suddenly meaningful — a layout that is correct at every
width except the ones where someone used the hide toggle, which is the hardest
possible class of visual bug to attribute. `tests/e2e/cms-breakpoint-hide.spec.ts`
hides one block of each `--md-display` value on mobile and asserts the computed
`display` at 834px matches the unhidden control.

The CSS is mobile-first with desktop as the fallback value, so a block with no
overrides emits three variables and inherits correctly at every width.

**Zero layout shift, by construction:**

1. Every image and video wrapper carries `aspect-ratio: var(--ar-sm, var(--ar-md, var(--ar)))`
   from the block's `aspect_ratio` field, resolved per breakpoint. Space is
   reserved before a byte of image arrives. `aspect_ratio` is `required: true` on
   every media-bearing block for exactly this reason.
2. `<img width>` and `<height>` are always emitted from `media.width` /
   `media.height` (§7.6).
3. Fonts are `next/font/local` with `font-display: swap` and a metric-matched
   fallback stack, so the headline does not reflow when Cormorant loads.
4. No block measures the viewport in JavaScript. `useMediaQuery` is banned in
   `src/components/blocks/**` by a `no-restricted-imports` rule; the two blocks
   that genuinely need a JS breakpoint (`product_carousel`'s embla instance,
   `gallery`'s lightbox) read `window.matchMedia` **after** mount to configure
   behaviour only, never to choose markup.
5. `tests/e2e/cms-cls.spec.ts` loads the homepage and every seeded CMS page at
   375 / 834 / 1440 and asserts `cumulative-layout-shift < 0.05` on each.

**A block hidden on a breakpoint still ships its markup.** The trade-off is real:
its HTML is in the payload even though nobody at that width sees it. It is
accepted because the alternatives are worse — server-side viewport detection is
impossible on an ISR object, and client-side removal is a post-hydration reflow.
The cost is bounded in the two places where it actually matters:

- **Images** cost nothing: a hidden block's `<picture>` sources are media-gated
  and never fetched, and an `<img>` in a `display:none` subtree is not fetched by
  any current browser.
- **Video** costs nothing: `preload="none"` is mandatory in the `video` block
  (§7.9), so a hidden background video downloads its poster at most.
- **`loadData`** is skipped for a block hidden at *every* breakpoint —
  `src/lib/cms/render.ts` filters those out before batching, so a fully-hidden
  `product_grid` costs no query. A block hidden on mobile only is still queried
  once, which is correct: the same HTML serves all three widths.

### 3.5 CSP consequence, stated rather than discovered

Inline `style` attributes require `style-src-attr 'unsafe-inline'` in the
Content-Security-Policy header set in `next.config.ts#headers()`. This is
deliberate and narrow: `style-src-attr` governs *attributes* only, `style-src`
keeps its nonce for `<style>` elements, and `script-src` is nonce-based with no
`'unsafe-inline'` anywhere. The alternative — a generated stylesheet per page —
means a second network round trip in front of the LCP element on every CMS page,
which is a worse trade than permitting style attributes that contain only numbers
and token names. Recorded in `docs/decisions/0011-csp-style-attr.md`.

---

## 4. Draft, publish, schedule, archive

### 4.1 The state machine

`cms_pages.status` and `journal_posts.status` are both `content_status`
(`draft` | `scheduled` | `published` | `archived`, `02` §1.9).

```
                 publish
      draft ───────────────────▶ published
        │  ▲                      │    ▲
schedule│  │unschedule     unpublish   │ republish / restore
        ▼  │                      ▼    │
    scheduled ──── (cron fires) ──▶ published
        │                          │
        │ archive                  │ archive
        ▼                          ▼
                  archived  ──unarchive──▶ draft
```

| Transition | Function | Effect |
| --- | --- | --- |
| `draft → published` | `publishPage(pageId, expectedVersion, actor)` | `saveVersion()` (§5.2) → `published_version_id = new.id`, `status='published'`, `published_at = coalesce(published_at, now())` → `revalidateTags([tags.cmsPage(id), ...marketTags])` |
| `draft → scheduled` | `schedulePage(pageId, expectedVersion, at, actor)` | `saveVersion()` **now** → `status='scheduled'`, `scheduled_publish_at = at`, `scheduled_version_id = new.id`. What publishes is what was approved, not whatever the page drifted into |
| `scheduled → published` | cron (§4.3) | `publishVersion(pageId, scheduled_version_id)` — publishes the version captured at schedule time |
| `scheduled → draft` | `unschedulePage()` | Clears `scheduled_publish_at` **and** `scheduled_version_id` |
| `published → draft` | `unpublishPage()` | `published_version_id` is **kept** (the `RESTRICT` FK in `02` §2.8 requires it) so the last live version stays restorable; the route 404s because `getPublishedPage()` filters on `status` (§1.2) |
| `* → archived` | `archivePage()` | Route 404s; the page leaves every admin list by default; a `redirects` row is written from its `path` if the admin supplies a destination |
| `archived → draft` | `unarchivePage()` | Path uniqueness is re-checked — another page may have taken the path meanwhile |

Every one of these transitions calls `requirePermission(actor, 'cms.publish')`
(§1.5) and, after commit, `revalidateTags([tags.cmsPage(id), tags.sitemap(), …markets])`.
**Unpublish and archive purge exactly as hard as publish does**, and forgetting it
is worse than forgetting it on publish: a publish that does not purge shows stale
content for `revalidate` seconds, while an unpublish that does not purge keeps a
page the owner believes is offline being served from the CDN for the same window,
and being served to the crawler that arrives inside it.

> **SCHEMA ADDITION:** one column on `cms_pages` — `02` §2.8 defines
> `scheduled_publish_at` but nothing that records *which* version was approved.
>
> ```sql
> ALTER TABLE cms_pages
>   ADD COLUMN scheduled_version_id UUID NULL
>     REFERENCES content_versions(id) ON DELETE RESTRICT;
>
> ALTER TABLE cms_pages ADD CONSTRAINT chk_cms_pages_scheduled
>   CHECK (status <> 'scheduled'
>          OR (scheduled_publish_at IS NOT NULL AND scheduled_version_id IS NOT NULL));
> ```
>
> `RESTRICT` for the same reason `published_version_id` uses it (`02` §2.8): the
> retention job must not be able to delete the version a scheduled publish is
> about to go live with. The same two columns are added to `journal_posts`.
>
> **Without this column the feature is a lie.** `publishPage()` composes its
> version from the *current draft rows* via `getDraftPage()` (§5.2 step 1), so a
> cron that calls `publishPage()` publishes whatever the page looked like at
> 03:00, not what was approved on Tuesday — including the half-finished section an
> editor was mid-way through when the timer fired. The state-machine table above
> promises the opposite, and the promise is the reason anyone schedules anything.
> `tests/integration/cms-scheduled-publish.test.ts` schedules a page, edits the
> draft afterwards, runs the cron, and asserts the *scheduled* snapshot is live and
> the later edit is still only a draft.

`published → published` (a republish) is the normal edit cycle and always creates
a new version. It is never an in-place mutation of the live snapshot.

**Deleting a page is a soft delete** (`cms_pages.deleted_at`, `02` §1.4) and is
refused unless the path either has a `redirects` row or the admin confirms a 410.
A published page's URL is an asset; removing it without a decision about the URL
is how SEO equity is lost silently.

### 4.2 Publish is three writes and one purge

```ts
// src/lib/cms/pages.ts
export async function publishPage(
  pageId: string, expectedVersion: number, actor: Actor,
  opts?: {
    label?: string;
    /** Cache tags to purge alongside cms:page:{id}. Defaults to the page's own
     *  market, or every active market when cms_pages.market_code IS NULL. */
    marketCodes?: MarketCode[];
    acknowledgedWarnings?: string[];      // the ids listed by step 2, echoed back
  },
): Promise<Result<{ versionId: string }, ConflictError | ValidationError>>;

/** The scheduled path (§4.3) and the rollback path (§4.1) — publishes an EXISTING
 *  version rather than composing a new one from the draft rows. */
export async function publishVersion(
  pageId: string, versionId: string, actor: Actor,
): Promise<Result<{ versionId: string }, ConflictError | ValidationError>>;
```

Inside `withTransaction()`, in this order:

0. `requirePermission(actor, 'cms.publish')` (§1.5) — before the row is
   locked, so an unauthorised call costs no lock and writes no version.
1. `UPDATE cms_pages SET version = version + 1 WHERE id = $1 AND version = $2` —
   zero rows ⇒ `ConflictError`.
2. **Publish-time validation** (not save-time): every block's config re-parsed
   against its registry schema; every `references()` id resolved against its
   table — **one query per reference kind, over the whole page's id set**, never
   one query per block, because a 40-block page with six reference kinds is 240
   round trips inside a transaction that holds the page lock; every `link_href`
   checked for a leading `/` or an allowed external scheme; `seo_metadata`
   presence checked. Broken references are **warnings**
   that the publish dialog lists and the editor must acknowledge, not hard
   errors — blocking a publish because one product in a manual grid was archived
   is how an owner learns to distrust the tool. A page with *zero* renderable
   sections is a hard error.
3. `saveVersion({ entityType: 'cms_page', entityId: pageId, actor, label, isPublishedVersion: true, force: true })`
   → a `content_versions` row. `force` because a publish must never be coalesced
   into an autosave snapshot (§5.2), and `isPublishedVersion` because the
   retention job's exclusion rules key off it (`02` §2.8).
4. `UPDATE cms_pages SET published_version_id = $versionId, status = 'published', published_at = coalesce(published_at, now())`.
5. `recordAudit(tx, { entity: 'cms_pages', entityId, action: 'publish', before, after })`.

After commit (`01` §2.3 step 6): `revalidateTags([tags.cmsPage(pageId)])`, plus
`tags.nav(market)` when the page is linked from a menu, plus `tags.sitemap()`
when `is_indexable` changed or the page became live for the first time.

### 4.3 Scheduled publishing actually fires

The deployment model is Vercel + Neon with no long-running process (`01` §5.1),
so "schedule" cannot mean an in-process timer — a serverless function that has
returned cannot wake up later.

`02` §2.8 records that `cms_pages.scheduled_publish_at` is "acted on by the
`run-jobs` cron". `/api/cron/run-jobs` runs `*/5 * * * *` (`01` §5.6). Its handler
executes a **fixed prelude before draining the `jobs` queue**:

```ts
// src/app/api/cron/run-jobs/route.ts
await runScheduledPublishes(new Date());   // prelude — always, before drainJobs()
await drainJobs({ maxMs: 240_000 });
```

```ts
// src/lib/cms/schedule.ts
export async function runScheduledPublishes(now: Date): Promise<{
  pages: string[]; posts: string[]; failures: { id: string; error: string }[];
}>;
```

It claims work with the index `02` §2.8 already defines
(`idx_cms_pages_scheduled ON cms_pages (scheduled_publish_at) WHERE status = 'scheduled'`):

```sql
-- ONE statement: claim and de-schedule atomically, returning what to publish.
UPDATE cms_pages p
   SET status = 'publishing',
       version = version + 1
  FROM (
    SELECT id FROM cms_pages
     WHERE status = 'scheduled'
       AND scheduled_publish_at <= $now
       AND deleted_at IS NULL
     ORDER BY scheduled_publish_at
       FOR UPDATE SKIP LOCKED
     LIMIT 50
  ) AS claimed
 WHERE p.id = claimed.id
 RETURNING p.id, p.version, p.scheduled_version_id;
```

**The claim and the publish cannot be in different transactions.** `FOR UPDATE
SKIP LOCKED` holds its lock only until the claiming transaction ends; a handler
that selects in transaction A and publishes each page in transaction B releases
every lock the moment A commits, and the overlapping invocation the pattern was
chosen to tolerate then claims the same 50 rows and publishes them a second time —
two versions, two audit rows, two purges, and a `published_at` that moves. Claiming
by **writing** the row is what makes the claim survive: the second invocation's
inner `SELECT` no longer matches `status = 'scheduled'`.

> **SCHEMA ADDITION:** one `content_status` enum value —
> `ALTER TYPE content_status ADD VALUE 'publishing';` — the in-flight state
> between claim and commit. It never reaches the storefront (§1.2 filters on
> `status = 'published'`) and the admin renders it as "Publishing…". A watchdog in
> the same prelude returns any row stuck in `publishing` for more than 10 minutes
> to `scheduled`, matching the `idx_jobs_stuck` pattern in `02` §2.9.

Each claimed page is then published in its own transaction by
`publishVersion(id, scheduled_version_id, SYSTEM_ACTOR)`, so one failure does not
block the other 49; failures return the row to `status='scheduled'` with a
`jobs` row `status='failed'`, surfaced at `/admin/system/jobs`, and reported to
Sentry. `SYSTEM_ACTOR` carries `actor_type = 'system'` (`02` §2.9) — the audit row
records the scheduling user as `created_by_user_id` on the version, and the cron as
the actor, because conflating the two makes "who published this" unanswerable.

**The granularity is five minutes, and the UI says so.** The schedule picker
snaps to 5-minute increments and the confirmation reads "Publishes at 09:00 —
within 5 minutes". A minute-level cron would quadruple invocations to buy a
precision no jewellery merchandising decision needs. A launch that must be exact
to the second is a pre-published page behind a feature flag, not a cron.

The same prelude covers `journal_posts` (identical columns, identical index).

**Section visibility windows need a purge, and "any page whose sections have a
boundary in the elapsed window" is not a query anybody can run.** §1.2 keeps
`visible_from` / `visible_to` inside the published snapshot and evaluates them at
render time, which is correct — but the rendered HTML is an ISR object with a
300–600s TTL and stale-while-revalidate behind it, so a section scheduled for
09:00 appears whenever that object is next regenerated, which on a low-traffic
path can be much later than its TTL. Worse, the boundaries that matter live in
`content_versions.snapshot` (the *published* version), not in the `cms_sections`
draft rows, which the editor may have changed since; scanning the draft rows finds
the wrong windows, and scanning the JSONB finds them with a sequential scan of
version history.

The fix is one denormalised, publish-time-maintained column — written by exactly
one function, in the same transaction that computes the snapshot, so it cannot
drift:

> **SCHEMA ADDITION:** one column and one index on `cms_pages`.
>
> ```sql
> ALTER TABLE cms_pages ADD COLUMN next_boundary_at TIMESTAMPTZ NULL;
> CREATE INDEX idx_cms_pages_boundary ON cms_pages (next_boundary_at)
>   WHERE next_boundary_at IS NOT NULL;
> ```
>
> `publishPage()` / `publishVersion()` set it to
> `min(visible_from, visible_to) > now()` over the **published** snapshot's
> sections, or `NULL` when the page has no future boundary.
> `runScheduledPublishes` then adds, in the same prelude:
> `SELECT id, market_code FROM cms_pages WHERE next_boundary_at <= $now` →
> `revalidateTags([tags.cmsPage(id), …])` → recompute `next_boundary_at` from the
> live snapshot. Index-only, bounded, and five minutes late at worst — the same
> granularity the schedule picker already promises.

`tests/integration/cms-section-window.test.ts` publishes a page with a section
opening in two minutes, advances the clock, runs the prelude, and asserts the tag
was purged and the section renders.

> **NEEDS INPUT:** the client's operating timezone for the scheduling UI. Every
> timestamp is stored `TIMESTAMPTZ` in UTC (`02` §1.3); the picker needs one IANA
> zone to display and accept local times in. `America/New_York` is the likely
> answer given the primary market, but it is a business fact and is not assumed —
> until supplied, the picker labels every time explicitly as UTC.

### 4.4 Preview

Preview must be **a real storefront render of unpublished content**, at three
widths, in either market, shareable with the client, and not a public leak.

**Rejected: `draftMode()`.** `01` §1.3 forbids `cookies()` / `draftMode()` in any
component reachable from an ISR route, and for a good reason — reading it converts
the route to dynamic at best and poisons a cached object at worst. It is also
cookie-scoped, so a preview link cannot be sent to the client's phone.

**Decision: one preview mechanism for the whole system — a database-backed,
revocable grant in `content_preview_tokens`, rendered by the `(preview)` route
group.**

> **This supersedes two designs, and the reader who saw either needs to know
> which parts moved.** The set previously carried *two* independent preview
> systems: this document's `content_preview_tokens` route at
> `/[market]/preview/[token]/[[...path]]`, and `04 §7.2`'s `jose`-signed JWT
> verified in middleware and rewritten into `src/app/(preview)/_preview/[market]/…`.
> Both were well-argued and both solved "render unpublished or inactive content
> without poisoning an ISR object". Neither solved the case the client hits in
> week one — **previewing an unpublished CMS landing page in the not-yet-active
> India market** — because one grants an entity and the other grants a market, and
> nothing granted both.
>
> **What survives:** the `content_preview_tokens` table (extended by one column),
> the three functions below, and `04 §7.2`'s `(preview)` route group with its
> `previewContext` plumbing.
>
> **What is deleted:** the `market-preview` JWT audience,
> `MARKET_PREVIEW_TOKEN_TTL_MINUTES`, `requirePreviewSession()`, middleware's
> `__mdpreview` query-parameter branch, and this document's own
> `/[market]/preview/[token]/[[...path]]` route — which also removes the
> `Disallow: /*/preview/*` `robots.txt` prefix and the `X-Robots-Tag` middleware
> rule that matched it. `Disallow: /_preview/` covers everything that is left.
>
> **Why the `(preview)` tree survives rather than the catch-all route.** A market
> preview has to render a PDP, a category, a curated facet, a collection, a stone
> page, a journal post and a CMS page. Next's file router already dispatches those
> seven shapes; a single `[[...path]]` catch-all would have to re-implement that
> dispatch by hand, in preview only, and then keep it in step with the public tree
> forever. Nine `page.tsx` files whose bodies are one component call each are
> cheaper and much harder to get wrong than a hand-rolled router. A CMS page
> preview is the ninth file, and it is the file this document's old route becomes.

```
src/app/(preview)/_preview/[market]/[token]/…       — nine thin pages
  page.tsx                                          — home
  products/[slug]/page.tsx                          — PDP
  [category]/page.tsx                               — category PLP
  [category]/[facet]/page.tsx                       — curated facet
  collections/[slug]/page.tsx                       — collection
  stones/[slug]/page.tsx                            — stone
  journal/[slug]/page.tsx                           — journal post
  pages/[...slug]/page.tsx                          — CMS page  (this document's)
  layout.tsx                                        — the preview banner + frame
export const dynamic = 'force-dynamic';
export const revalidate = 0;
// metadata: robots noindex,nofollow  +  X-Robots-Tag set in middleware for /_preview/
```

**The token is a path segment, not a query parameter, and that is the change that
removes a middleware branch.** With `[token]` in the path, nothing needs to
verify a signature at the edge: middleware's only job on `/_preview/**` is to set
`Cache-Control: private, no-store, max-age=0, must-revalidate` and
`X-Robots-Tag: noindex, nofollow, noarchive`. **Authorization is
`resolvePreviewToken()` as the first statement of every page** (hard rule 9,
`01 §2.1`) — a database read, so it cannot live in middleware anyway, which is
what made `04 §7.2` need a JWT in the first place.

Every page imports the **same** `(storefront)/[market]/layout.tsx` body, the same
`<PageRenderer>`, the same `<SectionRenderer>`, the same registry components, the
same header and footer. The only differences are which of the three loaders in
§1.2 supplies the `PageSnapshot`, `renderSource` on `BlockRenderProps`, and the
`previewContext` the grant produces.

> **SCHEMA ADDITION:** `content_preview_tokens` — there is no table in `02` for
> preview links.
>
> ```sql
> CREATE TABLE content_preview_tokens (
>   id                 UUID PRIMARY KEY,
>   token_hash         BYTEA        NOT NULL,   -- SHA-256 of a 32-byte random token;
>                                               -- the plaintext is never stored (02 §2.2 sessions)
>   scope              TEXT         NOT NULL,   -- 'entity' | 'market'  (the unification)
>   entity_type        content_entity_type NULL,-- NULL iff scope = 'market'
>   entity_id          UUID         NULL,       -- polymorphic, like content_versions.entity_id
>   version_id         UUID         NULL REFERENCES content_versions(id) ON DELETE CASCADE,
>                                               -- NULL = preview the CURRENT draft rows
>   market_code        CHAR(2)      NULL REFERENCES markets(code) ON DELETE CASCADE,
>                                               -- entity scope: NULL = the viewer may switch markets
>                                               -- market scope: NOT NULL, and it is the whole grant
>   passcode_hash      TEXT         NULL,       -- argon2id; optional gate for an external reviewer
>   expires_at         TIMESTAMPTZ  NOT NULL,
>   revoked_at         TIMESTAMPTZ  NULL,
>   max_views          INTEGER      NULL,
>   view_count         INTEGER      NOT NULL DEFAULT 0,
>   last_viewed_at     TIMESTAMPTZ  NULL,
>   created_by_user_id UUID         NULL REFERENCES users(id) ON DELETE SET NULL,
>   created_at         TIMESTAMPTZ  NOT NULL DEFAULT now()
> );
> CREATE UNIQUE INDEX uq_preview_tokens_hash ON content_preview_tokens (token_hash);
> CREATE INDEX idx_preview_tokens_entity ON content_preview_tokens (entity_type, entity_id)
>   WHERE revoked_at IS NULL;
> CREATE INDEX idx_preview_tokens_expiry ON content_preview_tokens (expires_at);
> ALTER TABLE content_preview_tokens
>   ADD CONSTRAINT chk_preview_tokens_expiry CHECK (expires_at > created_at),
>   ADD CONSTRAINT chk_preview_tokens_views  CHECK (max_views IS NULL OR max_views > 0),
>   ADD CONSTRAINT chk_preview_tokens_scope  CHECK (scope IN ('entity','market')),
>   ADD CONSTRAINT chk_preview_tokens_shape  CHECK (
>     (scope = 'entity' AND entity_type IS NOT NULL AND entity_id IS NOT NULL)
>     OR
>     (scope = 'market' AND entity_type IS NULL AND entity_id IS NULL
>                       AND version_id IS NULL AND market_code IS NOT NULL));
> ```
>
> `chk_preview_tokens_shape` is the constraint that keeps the two grants from
> blurring: a market grant has no entity and no pinned version (there is no single
> entity to pin), and an entity grant must name one. A market grant with a
> `version_id` would be asking "show me this one historical version of every page",
> which means nothing.
>
> Pruned by `/api/cron/cleanup-sessions` alongside `sessions` and `otp_requests`
> (`02` §1.4), 7 days past `expires_at`.

```ts
// src/lib/cms/preview.ts — the ONLY preview grant API in the system.

export type CreatePreviewTokenInput =
  | { scope: 'entity'; entityType: ContentEntityType; entityId: string;
      versionId?: string; marketCode?: MarketCode; /* undefined = switchable */ }
  | { scope: 'market'; marketCode: MarketCode; };

export async function createPreviewToken(
  input: CreatePreviewTokenInput & {
    ttlHours: number;               // entity: default 72, max 720. market: default 4, max 24
    passcode?: string; maxViews?: number;
    actor: Actor;
  },
): Promise<{ url: string; token: string; expiresAt: Date }>;   // token returned ONCE
// Permission is per scope, and both keys already exist in 11 §1.3:
//   scope 'entity' → requirePermission(actor, 'content.preview')
//   scope 'market' → requirePermission(actor, 'market.preview')
// Minting an entity link is "a stranger may read this one unpublished page";
// minting a market link is "a stranger may read the entire unlaunched storefront".
// They are not the same capability and they keep their separate keys.

export type PreviewGrant =
  | { scope: 'entity'; entityType: ContentEntityType; entityId: string;
      versionId: string | null; marketCode: MarketCode | null;
      previewContext: { includeUnpublished: true; includeInactiveMarkets: false } }
  | { scope: 'market'; marketCode: MarketCode;
      previewContext: { includeUnpublished: true; includeInactiveMarkets: true } };

export async function resolvePreviewToken(
  token: string, market: MarketCode,
): Promise<Result<PreviewGrant, PreviewTokenError>>;
// Rejection reasons, closed: 'not_found' | 'expired' | 'revoked' | 'spent'
//   | 'market_mismatch' | 'market_inactive' | 'passcode_required' | 'no_session'.
// All of them render the same 404 to a stranger (below); the reason is for the
// admin shell and the audit row, never for the response body.

export async function revokePreviewToken(id: string, actor: Actor): Promise<void>;

// The reserved literal that makes the staff path a token-less grant.
// 15 §4.3 owns it; it is checked before the database is queried.
export const SESSION_PREVIEW_TOKEN = 'session';
```

**An `entity` grant is rejected against an inactive market, and that is a check on
the route rather than a rule in prose.** After the grant is loaded, `scope =
'entity'` with `markets.is_active = false` for the requested `market` returns
`PreviewTokenError` with `reason: 'market_inactive'`. Without it the
`[market]` layout's own `is_active` predicate fails further down and the reviewer
sees an empty frame with no explanation; with it the failure has a name the shell
can act on (§ below, and `15 §4.2`). To a stranger it is the same 404 as every
other rejection — an entity link must not reveal that an unlaunched market exists.
`includeInactiveMarkets` stays `false` on the `entity` variant by type, so this is
a second gate on a case the type system already forbids, placed where the reviewer
actually hits it.

**`/admin/content/pages/[id]/preview` mints nothing.** The internal grant is the
reserved token literal `session`, resolved from the staff session before any
database read, and it is specified in `15 §4.3`: `cms.read` is the floor,
`includeInactiveMarkets` tracks `market.preview` rather than being hard-coded, and
no `content_preview_tokens` row is written for a staff member looking at their own
draft. A token is minted only when the page leaves the admin.

**`previewContext` is produced by the grant and nowhere else.** It is `04 §7.2`
step 6's object, unchanged: service functions accept it and relax **only**
publication predicates — `products.status`, `published_at`,
`product_market_content.is_published`, `markets.is_active`, `cms_pages.status`.
They never relax pricing, and a variant with no price in the previewed market
renders as unavailable in preview too, because that is the truth an admin needs
to see before launching the market.

**What the two scopes do with `[[...path]]` differs, and that is the whole point
of the discriminator:**

| Grant | Path inside the frame resolves to |
| --- | --- |
| `scope: 'entity'` | The granted entity's own path renders the draft (or the pinned version). **Every other path renders the published, public page**, with a persistent banner saying so. `tests/e2e/preview-scope.spec.ts` mints a token for one page and asserts a different unpublished page through the same token is a 404, not a draft |
| `scope: 'market'` | Every path renders with `includeUnpublished` and `includeInactiveMarkets` for **that one market code** and no other. The market in the URL must equal `market_code`; a mismatch is `PreviewTokenError` |

**The intersection case that neither old system handled** — an unpublished
landing page in the not-yet-active India market — is one `scope: 'market'` token
for `IN`, opened at `/_preview/in/<token>/pages/mothers-day`. It needs both
`market.preview` and `content.preview`? No: **`market.preview` alone, and that is
deliberate. A market-scoped grant already exposes every draft in that market, so
requiring the narrower key as well would be theatre.** `11 §1.4` grants both keys
to the same four roles.

Security properties, each with the failure it prevents:

| Property | Prevents |
| --- | --- |
| 32 bytes of `crypto.randomBytes`, base64url; only `sha256(token)` is stored | A database read (backup, log, support query) yielding working preview links |
| `expires_at` mandatory, default 72h, hard max 30 days, `CHECK` enforced | A link mailed to an agency in 2026 still opening the site's draft strategy in 2029 |
| `revoked_at` + a **Revoke all** button on the page's Preview panel | No way to close a link that was forwarded |
| Optional `passcode_hash` (argon2id) with a gate page before any content renders | An unauthenticated URL being all that stands between a competitor and unreleased merchandising |
| `max_views` / `view_count` | Unbounded reuse of a link intended for one reviewer |
| `robots: noindex, nofollow` in metadata **and** `X-Robots-Tag: noindex` set by middleware for `/*/preview/*` | Google indexing a preview URL — the actual, documented way this leaks |
| `Cache-Control: private, no-store` (the tree is in `01` §2.4's never-cached list as `/_preview/`), asserted over **both** scopes and the `session` literal by `tests/e2e/preview-isolation.spec.ts` (`09 §1.2` P13 — renamed from `market-preview.spec.ts`, which tested the market path only) | A draft homepage cached at the CDN and served to shoppers |
| **An `entity` grant names one entity, and no path inside the frame can widen it** (below) | One preview link handed to an agency becoming a reader's pass to every unpublished page on the site |
| `view_count` is incremented by the same conditional statement that authorises the view (below) | Two simultaneous requests both passing a `max_views = 1` gate |
| The audit row is written **at most once per (token, IP) per hour**, and `resolvePreviewToken` consumes `preview-token:ip:<ip64>` at 60/hour, fail-closed (`11 §4.2`) | A crawler or a retry loop on a public URL writing an unbounded number of rows into the one table `02` §2.9 already refuses to prune |
| Creating a token requires `content.preview` (entity) or `market.preview` (market); a staff session previewing needs no token at all (`/admin/content/pages/[id]/preview` proxies the same route with the reserved `session` literal, `15 §4.3`, which writes no row) | Staff generating public links for routine internal review |
| A `market` grant defaults to **4 hours**, max 24, versus 72 hours / 30 days for an entity grant | The broadest grant in the system inheriting the longest lifetime |

**Under an `entity` grant the path is navigation, not authorisation.** Every page
in the `(preview)` tree can be reached with any token, so a reviewer can click the
header, the footer and the CTA inside a draft page without the frame going dead.
That makes the tree the obvious place to leak the whole site: if the CMS page
renderer resolved its path into "which page to show in draft", the token issued
for `/campaigns/mothers-day` would also render the unreleased homepage and every
other draft, by typing a different path.

```ts
// src/app/(preview)/_preview/[market]/[token]/pages/[...slug]/page.tsx
const grant = await resolvePreviewToken(token, market);        // the ONLY authority
const requested = '/' + ((await params).slug ?? []).join('/');

const snapshot =
  grant.scope === 'market'
    // Market grant: everything in THIS market is draft-visible, by construction.
    ? await getDraftPageByPath(requested, grant.marketCode)
    : requested === await pathOfEntity(grant.entityType, grant.entityId)
      ? (grant.versionId ? await getVersionPage(grant.versionId)
                         : await getDraftPage(grant.entityId))  // the granted entity
      : await getPublishedPage(requested, market.code);         // everything else: PUBLIC
```

The other eight pages take the same shape: `grant.scope === 'market'` passes
`grant.previewContext` into the ordinary loader; `grant.scope === 'entity'` passes
`includeUnpublished` only when the requested entity **is** the granted one, and
otherwise loads exactly what a customer would see.

Navigating away from the granted entity inside an entity-scoped preview frame
shows the **live** site, with a persistent banner saying so. That is the correct
behaviour, not a degradation: the reviewer is meant to see the draft page in its
real surroundings, and its real surroundings are what is published.
`tests/e2e/preview-scope.spec.ts` mints an `entity` token for one page and asserts
that requesting a different unpublished page through the same token returns a 404,
not a draft; it then mints a `market` token for an **inactive** market and asserts
the same second page *does* render, and that the same token against the other
market's segment is a 404.

**`max_views` is enforced by the write, not by a read followed by a write.**

```sql
UPDATE content_preview_tokens
   SET view_count = view_count + 1, last_viewed_at = now()
 WHERE token_hash = $1
   AND revoked_at IS NULL
   AND expires_at > now()
   AND (max_views IS NULL OR view_count < max_views)
 RETURNING id, scope, entity_type, entity_id, version_id, market_code, passcode_hash;
```

Zero rows returned is "no grant" for every reason at once — revoked, expired, or
spent. A `SELECT` that checks `view_count < max_views` and a later `UPDATE` that
increments it is the classic check-then-act race, and on a link forwarded to a
group chat the two requests arrive in the same second.

**The preview shell** (`/admin/content/pages/[id]/preview`) is an `<iframe>` with
a toolbar carrying: breakpoint frames at 375 / 834 / 1440 (real widths, real
`resize`, not a CSS transform — a transform lies about media queries), a market
switch that re-mounts the frame at `/_preview/us/<token>/…` or
`/_preview/in/<token>/…`, a version selector (current draft, any historical
version, the live version), a side-by-side **Live vs Draft** toggle, and
**Copy shareable link** which calls `createPreviewToken({ scope: 'entity', … })`.

**The market switch renders an inactive market as disabled, with the reason and
the way out.** This is the affordance that makes the `market_inactive` rejection
above unreachable by accident rather than merely handled:

- An inactive market's option is **disabled**, with the reason inline — *"India is
  not live yet. A market preview link is needed."* The switch never silently
  produces a frame that 404s.
- When the actor holds `market.preview`, a button sits beside it:
  **"Preview India (inactive market)"**. It calls
  `createPreviewToken({ scope: 'market', marketCode: 'IN', ttlHours: 4 })` and
  re-mounts the frame at `/_preview/in/<newToken>/<the same path>`. The reviewer's
  entity link is untouched; the admin gets a second, broader, four-hour grant that
  is revocable by row. An actor without `market.preview` sees the reason and no
  button, which is the correct outcome of not holding the key.
- The `(preview)` `layout.tsx` banner is **a function of `PreviewGrant`, not a
  constant string**, so the two scopes cannot look alike: *"Market preview · India
  (not live) · expires 14:32"* for a market grant, *"Page preview · Mother's Day ·
  other pages show the live site"* for an entity grant. The entity wording is the
  banner this section already required; typing it off the grant is what stops a
  reviewer holding the broader link from reading it as the narrower one.

`15 §4.1`'s decision matrix is the four-cell version of the same rule, and `15 §4.2`
is where this affordance was specified.
`/admin/tools/market-preview` is the same shell with the market switch as its
subject: it calls `createPreviewToken({ scope: 'market', marketCode, ttlHours: 4 })`
and opens `/_preview/<market>/<token>/`. That admin route previously minted the
`market-preview` JWT and redirected to `?__mdpreview=…`; **that is the call site
that changes**, and it is the only one.

**Market preview is not cosmetic.** The India frame renders INR from
`getDisplayPrice(variantIds, 'IN')`, `en-IN` digit grouping from `formatMoney`
(`01` §2.6), India-scoped `product_market_content`, India-scoped sections and
blocks (`market_code = 'IN'`), and the India navigation menu. It is the same code
path a shopper in Mumbai hits. A block that renders only for one market is
visibly labelled in the builder with a market chip so an editor never wonders why
a section disappeared when they flipped the switch.

**Rate limiting.** `resolvePreviewToken()` consumes `preview-token:ip:<ip64>` at
60/hour, fail-closed (`11 §4.2`). The key prefix is unchanged by this
unification; only the endpoint it guards moved.

> **RESOLVED — was CHANGE REQUIRED IN 04 §7.2 and §7.3:** the market-preview mechanism is
> *Verified applied in 04.*
> replaced by a `scope: 'market'` grant from this section. Concretely:
> **delete** step 1's `jose` JWT with `aud: 'market-preview'`, step 2's
> middleware `__mdpreview` verification branch, step 4's
> `requirePreviewSession()`, and `MARKET_PREVIEW_TOKEN_TTL_MINUTES`.
> **Keep** step 5's `(preview)` route group (now nine files — the ninth is the
> CMS page preview this document contributes) and step 6's `previewContext`
> contract verbatim; it is the part that was right and it is reproduced above.
> The route shape becomes `/_preview/[market]/[token]/…` — the token is a path
> segment, so no signature is verified at the edge and middleware's only job on
> `/_preview/**` is the `no-store` + `X-Robots-Tag` pair §7.3 already specifies.
> `/admin/tools/market-preview` calls
> `createPreviewToken({ scope: 'market', marketCode, ttlHours: 4 })`.
> §7.3's risk table survives unchanged except its second row: "bound to `sub` and
> `sid`, so it dies with the admin's session" becomes "revocable by row, capped at
> 4 hours, and killable in bulk from the page's Preview panel" — which is
> strictly stronger, because a JWT cannot be revoked and a row can.

> **RESOLVED — was CHANGE REQUIRED IN 08 §4.2:** the storefront route table carries two preview
> *Verified applied in 08.*
> rows. Delete the `/preview/[token]/[[...path]]` row entirely and amend the
> `/_preview/[market]/…` row: it is now **nine** files, not eight; the token is a
> path segment (`/_preview/[market]/[token]/…`); authorization is
> `resolvePreviewToken()` as the first statement of every page, not
> `requirePreviewSession()`; and `robots.txt` needs only `Disallow: /_preview/`,
> not the additional `/*/preview/*` rule.

> **RESOLVED — was CHANGE REQUIRED IN 11 §4.2:** the `preview-token:ip:<ip64>` row's Endpoint
> *Verified applied in 11.*
> column reads "`resolvePreviewToken()` on `/[market]/preview/[token]`". It is now
> `/_preview/[market]/[token]/**`. The prefix, limit, window and fail mode are
> unchanged, so `tests/unit/ratelimit-keys.test.ts` is unaffected.

---

## 5. Version history

### 5.1 What is versioned

`content_versions.entity_type` is the `content_entity_type` enum (`02` §1.9):
`cms_page`, `cms_section`, `journal_post`, `navigation_menu`, `product`,
`email_template`, `settings`.

| Entity | Snapshot contains | Captured on |
| --- | --- | --- |
| `cms_page` | The page row **plus every section and block, with all three config columns** — the `PageSnapshot` of §1.2 | publish, schedule, manual save-version, throttled autosave (§5.2), pre-overwrite (§6.4), pre-restore |
| `journal_post` | The post row including `body_json` | publish, schedule, manual, throttled autosave |
| `navigation_menu` | The menu row plus every `navigation_items` row, nested | every save (menus are small and edited rarely) — throttled like any other, see §5.2 |
| `email_template` | The template row including `body_json` and `footer_json` | every save, throttled |
| `settings` | The changed `settings` rows only, as `{key, market_code, value}[]` | every save, throttled — this is what makes a bad shipping-threshold edit revertible |
| `product` | Owned by the catalogue section, not this one; the table and the retention rule are shared |
| `cms_section` | **Reserved, unused at launch.** Sections are versioned as part of their page. The enum value stays for a future "reusable section library" |

**`settings` has no `UUID` primary key, and `content_versions.entity_id` is
`UUID NOT NULL`.** `02` §2.8 gives `settings` the composite PK
`(key, market_code)`, so there is nothing to put in `entity_id` and the row as
described cannot be inserted. Rather than widen the column (it is shared with six
other entity types and an id that is sometimes a UUID and sometimes a dotted string
poisons every join and every index on it), the versioned unit is the **settings
group**, which is what the admin screen saves anyway:

```ts
// src/lib/cms/versions.ts
const SETTINGS_NS = '9f2b1c40-0000-4000-8000-000000000000';   // frozen constant
export const settingsEntityId = (groupKey: string, market: MarketCode | null) =>
  uuidv5(`${groupKey}:${market ?? '**'}`, SETTINGS_NS);       // deterministic, stable
```

One version per `(group_key, market)` save, the snapshot holding every changed row
in that group as `{key, market_code, value}[]`. Deterministic derivation means the
history of "Shipping settings, India" is one entity's history forever, with no new
table and no nullable id. `tests/unit/settings-version-id.test.ts` pins the
namespace constant — changing it orphans every settings version ever written.

### 5.2 Capture

```ts
// src/lib/cms/versions.ts
export async function saveVersion(tx: Tx, input: {
  entityType: ContentEntityType; entityId: string;
  actor: Actor;
  label?: string;
  isPublishedVersion?: boolean;
  restoredFromVersionId?: string;
  force?: boolean;              // explicit save: always insert, never coalesce
}): Promise<{ versionId: string; created: boolean }>;
```

Inside the caller's transaction:

1. Compose the snapshot via `getDraftPage(entityId)` (or the entity's composer).
2. `snapshot_hash = sha256(canonicalJson(snapshot))` — key-sorted, so a JSONB
   round-trip that reorders keys does not read as a change.
3. Read the latest version's `snapshot_hash` for this entity (index
   `idx_content_versions_entity`, one row). **Equal ⇒ return
   `{ created: false }`** — the "no-op blur must not create a version" rule from
   `02` §2.8. Dedupe is against the immediately preceding version only; there is
   deliberately no global hash uniqueness, because editing a headline and changing
   it back is ordinary and restore writes an old snapshot forward by definition.
4. `version_number = max + 1`, inserted. `uq_content_versions (entity_type,
   entity_id, version_number)` serialises two concurrent allocations; the loser
   retries once.

**Autosave does not version every keystroke.** A version is created from an
autosave at most once per `cms.version_autosnapshot_interval_minutes` (a
`settings` row, default **15**) per entity per user. Between snapshots, autosave
still writes the live rows — the draft is never at risk; only the *history
granularity* is throttled. Without this, a 40-minute editing session at a 750ms
debounce produces hundreds of near-identical multi-kilobyte snapshots and the
history list becomes unusable before the retention job even gets a chance.

**The throttle is enforced inside `saveVersion()`, for every `entity_type`, not
only for pages.** §5.1 says menus, email templates and settings are versioned "on
every save", and §6.1 puts those same forms behind the same 750ms autosave — so
taken together they specify one version per 750ms of typing in the email template
editor, which is the exact failure the page-level throttle exists to prevent,
reintroduced on the entities nobody thought to check. `saveVersion` therefore
begins with: if the latest version for this `(entity_type, entity_id)` was created
by **this actor** within the interval and is not `is_published_version` and not
`is_pinned`, **update it in place** (new snapshot, new hash, same
`version_number`) instead of inserting. Explicit saves — publish, schedule,
manual "Save version", pre-overwrite, pre-restore — pass `force: true` and always
insert. The hash dedupe in step 3 still runs first, so an unchanged document
writes nothing at all.

> **SCHEMA ADDITION:** one `settings` seed row —
> `('cms.version_autosnapshot_interval_minutes', NULL, '15'::jsonb, 'number',
> 'content', 'Autosave version interval (minutes)', …)`, added to
> `prisma/seed/06-settings.ts` beside the `cms.*` keys `02` §6 already lists.

### 5.3 Viewing and diffing

`/admin/content/pages/[id]/history` lists versions newest first from
`idx_content_versions_entity`, paginated at 50, each row showing version number,
author, timestamp, label, and chips for `Published` / `Pinned` / `Restored from
v12`.

```ts
export function diffSnapshots(a: PageSnapshot, b: PageSnapshot): SnapshotDiff;

export type SnapshotDiff = {
  sections: { added: string[]; removed: string[]; moved: { id: string; from: number; to: number }[] };
  blocks: {
    added: BlockSnapshot[];
    removed: BlockSnapshot[];
    moved: { id: string; from: Locator; to: Locator }[];
    changed: {
      id: string; blockType: string;
      fields: { key: string; breakpoint: Breakpoint;
                before: unknown; after: unknown;
                kind: 'text' | 'value' | 'media' | 'reference' }[];
    }[];
  };
  page: { key: string; before: unknown; after: unknown }[];
};
```

Diffing is **structural, keyed by id, not textual over serialised JSON**. A
positional or line-based diff reports a whole page as changed when one section
moves, which is worse than no diff. Matching by `cms_blocks.id` — stable across
edits because reorder mutates `position`, never the primary key — means a moved
block reports as `moved`, and a moved *and* edited block reports as both.

Presentation at `/admin/content/pages/[id]/history/[versionId]`:

- **Visual** — two preview iframes side by side (§4.4, version-pinned tokens),
  with changed blocks outlined.
- **Field** — the `SnapshotDiff` as a list; `kind: 'text'` fields get a
  word-level inline diff, `kind: 'media'` fields get before/after thumbnails,
  `kind: 'reference'` fields resolve the id to a name ("Collection: Moonstone
  Edit → Collection: Larimar").
- **Raw** — the two snapshots as formatted JSON, for support.

Any two versions can be compared, not only adjacent ones.

### 5.4 Restore

```ts
export async function restoreVersion(input: {
  versionId: string; expectedVersion: number;     // step 1 needs it; it is not optional
  actor: Actor; confirmToken?: string;
}): Promise<Result<{ newVersionId: string; report: RestoreReport }, ConflictError | PreflightRequired>>;
```

`02` §2.8 sets the shape: **history is never rewound, only extended.** Restore
writes the old snapshot forward as a normal edit and creates a *new* version with
`restored_from_version_id` set. Concretely, in one transaction:

0. `requirePermission(actor, 'cms.restore')` (§1.5), then **preflight
   (§5.5)**. Without a matching `confirmToken`, return `PreflightRequired` with
   the report and change nothing — before any lock is taken and before a snapshot
   is composed, because the preflight-only call is the common case (it runs every
   time the dialog opens) and it must not cost a version bump or contend with the
   editor's own autosave.
1. Bump `cms_pages.version` with the caller's `expectedVersion` — restoring is an
   edit and takes the same lock as any other.
2. `saveVersion({ label: 'Before restore to v{n}', force: true })` — the current
   draft is captured **before** it is replaced. This is the guarantee that restore
   is itself undoable, and `force` is what stops the §5.2 throttle from coalescing
   it into a snapshot taken four minutes ago that no longer matches the draft
   about to be destroyed.
3. Re-verify the `confirmToken` against a freshly computed report hash inside the
   transaction — the catalogue can change between the dialog and the confirm.
4. `DELETE FROM cms_sections WHERE page_id = $1` (cascades to `cms_blocks`), then
   re-insert the snapshot's sections and blocks **with their original ids**. Ids
   are preserved so that a later diff against a pre-restore version still matches
   blocks correctly, and so a preview token pinned to a version keeps resolving.
5. `saveVersion({ restoredFromVersionId: versionId })` → the new head.
6. `recordAudit(action: 'restore')`. Restoring does **not** publish: the restored
   content lands in the draft, the editor reviews it, and Publish is a separate
   act. A one-click restore that goes straight live is a one-click outage.

### 5.5 Restore when the version references something that no longer exists

This is the case that breaks naive restore, and it has three distinct shapes
because `02` §1.4 gives the referenced tables three different delete policies.

`buildRestoreReport(snapshot)` resolves **every** id returned by
`blockRegistry[type].references(config)` for every block, at every breakpoint,
plus `cms_sections.background_media_id`, and classifies each.

`references()` takes **one** config (§1.3), so "at every breakpoint" is concrete:
callers run it over all three members of `resolveBlockConfig(block)` and take the
union. A helper exists so no caller forgets —
`blockReferences(block: BlockSnapshot): BlockReference[]` in
`src/lib/cms/blocks.ts` — and it is what §7.5 and §4.2 step 2 call as well. A
mobile-only hero image is a reference that exists in `config_mobile` and nowhere
else; missing it means the restore report says nothing about it and the media
library calls it unused.

The classification:

| Situation | Resolution |
| --- | --- |
| **Soft-deleted** target (`media`, `products`, `categories`, `collections`, `stones`, `cms_pages` — all soft-delete tables, `02` §1.4) | The row still exists. The report offers **Restore the asset too** (clears `deleted_at`, requires the target's own update permission) or **Leave it removed**, in which case the block renders without it |
| **Hard-deleted** target (`curated_facets`, `product_collections` membership rows) | Gone. The field is **nulled** in the restored config and the block is listed in the report |
| **Still present but now unpublished / inactive** (`products.status='archived'`, `collections.is_active = false`, `product_market_content.is_published = false` for a market) | Restored as-is. The block's own render rules already handle it — a `product_grid` omits an unpublished product, and the builder shows an amber "2 of 8 products are not visible in US" chip |
| **Target exists, different content** (the collection was renamed, the media replaced) | Restored as-is. The reference, not the content, is what was versioned |

```ts
export type RestoreReport = {
  confirmToken: string;                 // 10-minute HMAC over (versionId, reportHash)
  softDeleted: { kind: BlockReference['kind']; id: string; name: string;
                 blockIds: string[]; canRestore: boolean }[];
  hardDeleted: { kind: BlockReference['kind']; id: string;
                 blockIds: string[]; fieldKeys: string[] }[];
  unavailable: { kind: BlockReference['kind']; id: string; name: string;
                 reason: 'archived' | 'inactive' | 'unpublished_in_market';
                 marketCode: MarketCode | null }[];
  blocksRemovedFromBuild: { blockId: string; blockType: string }[];
};
```

The last field covers the fourth shape, which is not a data problem at all: **a
version may contain a `block_type` that has since been deleted from the
registry.** Those blocks are restored into the database (the rows are valid; the
`block_type` column has no CHECK) but render as the "Unknown block type" panel in
the builder and as nothing in production, and the report names them so the editor
can delete them deliberately. Silently dropping them would make a restore
lossy without saying so.

**Nothing is nulled without the editor seeing it.** `confirmToken` is an HMAC over
the version id and a hash of the report, valid 10 minutes, signed with
`AUTH_SECRET`. It means the restore that executes is the one whose consequences
were displayed — if the catalogue changed between the preflight and the confirm,
the token's report hash no longer matches, the restore is refused, and a fresh
preflight runs.

### 5.6 Retention

Verbatim from `02` §2.8, implemented by `/api/cron/cleanup-sessions` (`01` §5.6)
in `pruneVersions()`:

- Keep the most recent `cms.version_retention_count` versions per
  `(entity_type, entity_id)` — a `settings` row, default **30**.
- Keep every `is_pinned` version, forever.
- Keep every `is_published_version` row younger than
  `cms.published_version_retention_days` — a `settings` row, default **730**.
- Never delete the row any `cms_pages.published_version_id` points at; the
  `ON DELETE RESTRICT` FK enforces this independently of the job remembering.
- `DELETE` in **batches of 500 inside a bounded loop**, not one unqualified
  statement, so the first night's backlog is not a long write transaction
  competing with live traffic on Neon.

Two operational rules this section adds:

1. **Pin before a redesign.** The builder's "Pin this version" action sets
   `is_pinned` and is the documented pre-flight for any large content change. It
   is exposed in the publish dialog as a checkbox ("Keep this version forever"),
   because the moment an editor cares about a rollback point is the moment they
   are about to destroy it.
2. **`schemaVersion` on the snapshot.** `PageSnapshot.schemaVersion` is `1`. If
   the snapshot shape ever changes, `getVersionPage()` runs
   `migrateSnapshot(snapshot)` on read — old rows are never rewritten in place,
   because `content_versions` is append-only. A restore of a v1 snapshot after a
   v2 migration goes through the same function.

---

## 6. Autosave

### 6.1 Protocol

| Property | Value | Why |
| --- | --- | --- |
| Debounce | **750ms** after the last keystroke or control change | `01` §2.7 fixes this number for admin autosave; the CMS uses the same one so there is one answer, not two |
| Max in flight | **1** | A second request is queued, not raced |
| Flush triggers | Field blur, breakpoint switch, block selection change, tab hidden (`visibilitychange`), `pagehide`, explicit ⌘S | An editor who clicks away expects the change saved, not waiting on a timer |
| Idle flush | Any pending change is flushed at 10s regardless of typing | Bounds worst-case loss to 10 seconds on a hard crash |
| Ordering | Monotonic client `seq` on every request; a response whose `seq` is older than the last applied one is discarded | `01` §2.7: "the older response lands last" |
| Payload | `applyBuilderOps({ pageId, expectedVersion, ops, clientSeq })` with **only the ops produced since the last successful save** | Never the whole form. `01` §2.7: an untouched field is not in the `UPDATE` at all |
| Transport | Server action, `no-store` | `01` §1.3: no mutation is a `GET` |
| Response | `{ version, seq, skippedOps, snapshot? }` | The client adopts the returned `version` as its new `expectedVersion`. **`snapshot` is returned only when the op list contained a structural op** (add/delete/move/duplicate/reorder) — returning the whole subtree on every `update_block` ships a full page document back over the wire every 750ms of typing, which on a 40-block page is hundreds of kilobytes per keystroke burst and the slowest part of an otherwise instant editor. A content-only save returns ~200 bytes and the client keeps the tree it already has |

For the page builder the *database* write is the whole subtree conceptually (`02`
§2.8 requires the page-level lock), but the *wire payload* is the op list. The
ops are applied to the live rows; the page row's `version` is what serialises.
For scalar admin forms (journal post, email template, settings) the payload is
react-hook-form's `dirtyFields` projection and the target is a single
`UPDATE … WHERE id = $1 AND version = $2`.

### 6.2 States

A single `useAutosave()` hook in `src/components/admin/autosave/` owns one state
machine, and the status pill in the builder toolbar renders it. There are **six**
states and no ambiguity between them — `conflict` is a state of this machine, not
an escape from it, and `13 §3.3` reuses all six by name for the admin grid's
per-cell version:

| State | Pill | Meaning | Exit |
| --- | --- | --- | --- |
| `idle` | "All changes saved" (muted) | No pending edits, no request in flight | edit → `pending` |
| `pending` | "Unsaved changes" (amber dot) | Debounce timer running | timer/flush → `saving` |
| `saving` | "Saving…" (spinner) | Request in flight | 200 → `saved`; 409 → `conflict`; network/5xx → `failed` |
| `saved` | "Saved 14:32" (green check, decays to `idle` styling after 3s) | Server confirmed and returned a new version | edit → `pending` |
| `failed` | "Couldn't save — retrying (2/5)" (red) | Request failed | retry success → `saved`; exhausted → `failed` terminal with actions |
| `conflict` | "This page changed elsewhere" (red, modal) | `ConflictError` | §6.4 |

The pill is never optimistic. `saved` is set from the server response, never from
the request being sent — an optimistic "Saved" on a request that later fails is
the single worst thing this component can do, because the editor closes the tab.

### 6.3 Failure handling — no change is silently lost

Four layers, each covering a failure the others do not:

1. **Retry with backoff.** `[1s, 2s, 5s, 10s, 30s]` with ±20% jitter, then
   terminal `failed`. 4xx other than 409 do not retry (they are a bug, not a
   blip) and go straight to terminal with the validation message.
2. **Local recovery buffer.** Before every network call, the pending op list and
   a full client-side snapshot are written to IndexedDB (`md-cms-recovery`, key
   `page:<pageId>`, with `savedAt` and the server `version` they were computed
   against). Cleared only on a `saved` response. On mount, if a buffer exists and
   its `version` is `<=` the server's current version, the builder shows
   **"Unsaved changes from 14:28 — Restore / Discard / Download"**. This is what
   survives a browser crash, a laptop sleeping through a save, a dropped Wi-Fi,
   and a closed tab.
3. **Navigation guard.** `beforeunload` while state is `pending`, `saving`,
   `failed` or `conflict`; Next's router is intercepted for in-app navigation
   with the same guard.
4. **Download a copy.** Terminal `failed` offers "Download a copy" — the pending
   snapshot as JSON — and `/admin/content/pages/[id]/import-draft` accepts it
   back. This is the last resort for the case where the server is rejecting
   writes for a reason the editor cannot fix (expired session, revoked
   permission, database incident), and it means the answer to "I lost an hour of
   work" is never "yes".

`tests/e2e/cms-autosave-recovery.spec.ts`: type into a block, go offline mid-save,
reload, assert the recovery prompt appears and restores the exact text.

### 6.4 Conflict: the same entity edited in two places

`02` §2.8 specifies the mechanism — the page row is the concurrency unit, every
write bumps `cms_pages.version`, and zero rows affected raises `ConflictError`.
This section specifies what the editor is then shown, because "the page changed,
reload" throws away work.

The conflict modal names the other editor (from `audit_logs`, most recent writer)
and the time, shows `diffSnapshots(myPendingSnapshot, serverSnapshot)`, and offers
exactly three actions:

| Action | What happens | Nobody loses work because |
| --- | --- | --- |
| **Discard mine and reload** | Recovery buffer is retained (not cleared) and downloadable; the builder reloads the server state | The discarded work is still in IndexedDB and one click from a JSON download |
| **Keep mine (overwrite)** | In one transaction: `saveVersion({ label: 'Before overwrite by {me}', force: true })` captures the **server's** current state, then the pending ops are re-applied against the fresh `expectedVersion` and the returned `skippedOps` (§2.2 rule 5) are shown | The other editor's work is now a named version in history, restorable in two clicks — and any op that could not be replayed is named rather than dropped |
| **Open theirs in a new tab** | Opens the page read-only so the editor can see what changed before choosing | — |

There is no automatic merge. Two people editing the same headline have no
machine-resolvable answer, and a silent last-write-wins is precisely the defect
`02` §2.8 introduced the page-level lock to eliminate. The **Keep mine** path is
safe only because it snapshots first; that ordering is the whole point and is
asserted by `tests/integration/cms-conflict-overwrite.test.ts`.

**Replaying an op list is not always possible, and the modal says which parts
were not.** "Keep mine" re-applies ops that were computed against a page structure
the other editor has since changed. An `update_block` whose target they deleted
affects zero rows; a `reorder_blocks` whose `orderedBlockIds` no longer match the
section's membership is refused outright. Both come back as `skippedOps`, are
listed in the modal by block label, and the recovery buffer is **not** cleared
until the editor acknowledges the list — so the work is still one click from a
JSON download. Silently applying six of eight ops and reporting success is the
same defect as last-write-wins, in a smaller window.

**Presence, so the conflict mostly does not happen.** The open builder polls
`GET /api/admin/cms/pages/[id]/heartbeat` every 20 seconds (`no-store`, staff
session required, `cms.read`, rate-limited on `cms-heartbeat:session:<sid>` at
10/min, fail-open — `11 §4.2`). It returns `{ version, updatedAt, lastEditor }` — **`version`, not
`updated_at`**, because `version` is what `applyBuilderOps` compares and
`updated_at` on `cms_pages` is also bumped by writes that are not edits. When the
returned `version` exceeds the one this tab holds, a non-blocking banner appears:
"Someone else is editing this page", naming `lastEditor` from the coalesced audit
row (§2.2). Cheap, no websocket, no new infrastructure, and it converts most
conflicts into a conversation before either editor has invested twenty minutes.

---

## 7. Media library

### 7.1 Upload

Direct browser → Cloudinary, signed server-side, **for every media kind except
SVG**. The file never passes through a Vercel function, so a 25MB upload does not
consume function memory or a 4.5MB request-body limit.

1. Admin selects files. Client computes `sha256` of each and calls
   `POST /api/media/sign` (staff session + `media.create` permission) with
   `{ filename, contentType, bytes, checksum }`.
2. The route rejects, before signing: a `contentType` outside §7.6's allowlist, a
   size over `MEDIA_MAX_UPLOAD_MB` (default 25), and — when `CLOUDINARY_API_KEY`
   is unset — returns **503 with a labelled reason**, never a placeholder
   (`01` §4.9).
3. A matching `media.checksum_sha256` (indexed, `WHERE deleted_at IS NULL`)
   returns the existing row with "This file is already in your library" and a
   **Use existing / Upload anyway** choice. Jewellery shoots produce near-identical
   files; duplicate storage is the default outcome without this.
4. The signature is scoped to `CLOUDINARY_UPLOAD_FOLDER` (default
   `millennium/{APP_ENV}`), expires in 60s, and pins `resource_type`,
   `allowed_formats` and **`max_file_size`** — all inside the signed parameter
   set. `bytes` and `contentType` in step 2 are **client claims**; the signature
   is what makes them binding, and a signature that constrains neither turns
   "reject files over 25MB" into a client-side suggestion a crafted request
   ignores.
5. On success the client posts Cloudinary's upload response to
   **`POST /api/media/callback`**, which calls
   **`registerUpload(actor, input: CloudinaryCallbackPayload)`**
   (`08 §1.3`; permission `media.create`). The route **verifies that response's
   `signature` field against
   `CLOUDINARY_API_SECRET`** before trusting a single field of it, then writes the
   `media` row with `public_id`, `version`, `format`, `bytes`, `width`, `height`,
   `duration_seconds`, `dominant_colour_hex` and `blur_data_url`,
   `uploaded_by_user_id`, and `checksum_sha256`.

> **Renamed.** This step was called `confirmUpload()` in an earlier draft of this
> document, `registerUpload()` in `07 §5.9` and `08 §1.3`, and built as the route
> `/api/media/callback` in `09 P06` — one call under three names.
> `11 §10.9` settles it: **the function is `registerUpload(actor, input)` and the
> route is `POST /api/media/callback`.** `confirmUpload` does not exist.

**`registerUpload()` takes a client-supplied payload and treats it as one.** Hard
rule 3 is about price and stock, but the same reasoning applies to every value
that arrives from a browser: an unverified callback lets a caller write a
`media` row claiming `format: 'jpg'`, `bytes: 40000` and a `public_id` pointing at
an asset in another account's folder, which the `<img>` pipeline then builds a URL
for and the library reports as a small JPEG. Two checks make it cheap: the
response signature (above), and `public_id LIKE CLOUDINARY_UPLOAD_FOLDER || '/%'`.
`checksum_sha256` stays client-computed — it is a de-duplication hint shown to an
authenticated staff member, never an authorisation decision — and the column is
documented as advisory for exactly that reason.

An upload that reaches Cloudinary but fails `registerUpload()` leaves an orphan
asset at the provider. `/api/cron/run-jobs` drains a `media_orphan_scan` job
weekly that lists the folder and deletes provider assets with no `media` row
older than 24h.

**SVG never takes this path.** §7.10 layer 2 requires server-side sanitisation
*before the file reaches Cloudinary*, and a direct browser → Cloudinary upload
makes that impossible: there is no point at which our code holds the bytes. The
two sections as originally written contradict each other, and the contradiction
resolves in favour of the browser that would execute the script. SVG uploads go
through `POST /api/media/svg` (`nodejs` runtime, `media.upload_vector` permission,
**256KB** hard body cap — a brand mark that exceeds it is not a brand mark), which
reads the buffer, runs `sanitizeSvg()`, uploads the *sanitised* bytes server-side
with the Cloudinary Node SDK, and then writes the `media` row itself. The 4.5MB
function body limit is irrelevant at 256KB, and `/api/media/sign` refuses
`image/svg+xml` unconditionally so the direct path cannot be talked into it.
`tests/integration/media-svg-upload.test.ts` posts an SVG containing `<script>`
and an `onload` attribute and asserts the stored asset contains neither, and that
`/api/media/sign` returns 400 for `image/svg+xml` even for an `owner` session.

> **SCHEMA ADDITION:** one `job_kind` enum value —
> `ALTER TYPE job_kind ADD VALUE 'media_orphan_scan';`. The complete seventeen-value
> enum is `11 §3.1`; `media_orphan_scan` is `systemPermitted: true` with
> `dedupeKey: 'kind'` (`11 §3.2`), which is what lets the weekly sweep run with
> `jobs.created_by_user_id IS NULL` — it has no originating human.

### 7.2 Storage, folders and tags

- **Folders**: `media_folders` with `parent_id` and `materialized_path` (`02`
  §2.4). `parent_id` is `ON DELETE RESTRICT`, so a folder with children cannot be
  deleted — the admin moves or empties it first. `materialized_path` makes
  "everything under /product-shots" one `LIKE 'product-shots/%'` instead of a
  recursive CTE. Moving a folder rewrites the `materialized_path` of its subtree
  in one `UPDATE … WHERE materialized_path LIKE $old || '%'`.
- **Tags**: the **same `tags` table as the catalogue and the journal** (`02`
  §2.4, §2.8), so "Moonstone" means one thing site-wide and a tag rename
  propagates everywhere.

> **SCHEMA ADDITION:** `media_tags` — `02` defines `product_tags` and
> `journal_post_tags` but no join for media.
>
> ```sql
> CREATE TABLE media_tags (
>   media_id UUID NOT NULL REFERENCES media(id) ON DELETE CASCADE,
>   tag_id   UUID NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
>   PRIMARY KEY (media_id, tag_id)
> );
> CREATE INDEX idx_media_tags_tag ON media_tags (tag_id, media_id);
> ```

### 7.3 Search and filter

The library grid at `/admin/content/media` is a `saved_views` resource
(`saved_view_resource` already includes `media`, `02` §2.9), so an admin can save
"Untagged product shots > 2MB" as a tab.

Filters: folder (incl. subtree), `kind`, `format`, tag (AND across tags), uploader,
date range, size range, dimension range, "has alt text", "unused", `is_demo`.
Free-text search covers `title`, `alt_text`, `credit` and `public_id`.

> **SCHEMA ADDITION:** a trigram index for the free-text search. `pg_trgm` is
> already an extension in this build (`01` §1.1).
>
> ```sql
> CREATE INDEX idx_media_search_trgm ON media USING GIN (
>   (coalesce(title,'') || ' ' || coalesce(alt_text,'') || ' ' ||
>    coalesce(credit,'') || ' ' || public_id) gin_trgm_ops
> ) WHERE deleted_at IS NULL;
> ```
>
> Trigram rather than `tsvector`: filenames like `md-larimar-drop-02` are not
> words, and an admin searching `larimar-drop` needs substring matching, which FTS
> does not give.

### 7.4 Alt text, dimensions, file size

`media.alt_text` is **nullable** — `02` §2.4 records why, and this section honours
it rather than re-litigating: a `NOT NULL` blocks bulk upload and produces
`alt="image"` everywhere, which is worse for a screen-reader user than empty.
The enforcement is elsewhere and is real:

- The library shows a persistent "12 images missing alt text" banner linking to
  the filtered view.
- `publishPage()` (§4.2 step 2) emits a **warning** naming every image on the page
  without alt text.
- The `<MediaField>` picker shows an inline alt-text input the moment an image is
  selected, so the cheapest moment to write it is the default one.
- Decorative images get `alt=""` via an explicit **"This image is decorative"**
  checkbox, which writes `alt_text = ''` (empty string, distinct from `NULL`).
  `NULL` means "nobody has decided", `''` means "deliberately decorative", and the
  banner counts only `NULL`.

`width` / `height` / `bytes` / `duration_seconds` come from the provider response
at upload, are never re-derived on the client, and are rendered in the library
inspector alongside a "Large file — consider re-exporting" flag over 4MB.

### 7.5 Usage tracking — where is this asset used

**Decision: computed live by a UNION query, not a denormalised `media_usages`
table.** A usage table is a second source of truth that must be maintained on
every block edit, section edit, journal save, nav save, SEO save and product-media
change, and the day it drifts is the day an admin deletes a live hero. The query
is exact by construction, it is asked only on hover/click in an admin screen and
before a delete, and every leg is indexed.

```ts
// src/lib/media/usage.ts
export type MediaUsage = {
  kind: 'cms_block' | 'cms_section' | 'product' | 'journal_post'
      | 'navigation_item' | 'seo_metadata' | 'email_template' | 'user_avatar'
      | 'import_job' | 'published_snapshot';
  entityId: string;
  label: string;            // "Homepage → Hero", "Larimar Drop Pendant"
  adminHref: string;
  isLive: boolean;          // this reference is in content the public can load RIGHT NOW
};
export async function getMediaUsage(mediaId: string): Promise<MediaUsage[]>;
export async function getMediaUsageCounts(mediaIds: string[]): Promise<Map<string, number>>;
```

The legs, and the index each rides:

| Source | Predicate | Index |
| --- | --- | --- |
| `cms_blocks` | `config @> $ref OR config_tablet @> $ref OR config_mobile @> $ref` | `idx_cms_blocks_media … USING GIN (config jsonb_path_ops)` (`02` §2.8) — extended to the two override columns |
| `cms_sections` | `background_media_id = $1` | b-tree on the FK |
| `product_media` | `media_id = $1` | FK index |
| `journal_posts` | `hero_media_id = $1` | FK index |
| `navigation_items` | `media_id = $1` | FK index |
| `seo_metadata` | `og_media_id = $1` | FK index |
| `email_templates` | `logo_media_id = $1` (§10) | FK index |
| `users` | `avatar_media_id = $1` | FK index |
| `import_jobs` | `file_media_id = $1` | FK index |
| **`content_versions` — the published snapshots** | `cv.snapshot @> $ref` for the versions named by `cms_pages.published_version_id` | `idx_content_versions_snapshot` (below) |

**The last leg is the one that makes the other nine safe, and it is the leg the
draft-vs-published decision of §1.2 creates.** Every other row in this table
queries the **draft** tables. But the public site does not render the draft tables
— it renders `content_versions.snapshot` for `cms_pages.published_version_id`.
So: an editor removes a hero image from the homepage draft and does not publish;
`getMediaUsage()` now returns nothing for that asset; the library badges it
"Unused — safe to delete"; the admin deletes it; **the live homepage, which is
still serving last week's published snapshot containing that media id, loses its
LCP image.** Every guard in §7.8 passes, because every guard is asking the draft.
`product_media.media_id ON DELETE RESTRICT` does not help — the reference is
inside a JSONB document, not a foreign key.

The live leg is therefore not optional, and it is also the only honest definition
of `isLive`: a usage is live when it appears in a **published snapshot**, not when
its draft row exists.

```sql
SELECT p.id, p.path, p.market_code
  FROM cms_pages p
  JOIN content_versions cv ON cv.id = p.published_version_id
 WHERE p.deleted_at IS NULL
   AND p.status = 'published'
   AND cv.snapshot @> $ref::jsonb;
```

> **SCHEMA ADDITION:** a GIN index on the snapshots that can be live, plus two
> more so the override columns are searchable on the same terms as `config`:
>
> ```sql
> CREATE INDEX idx_content_versions_snapshot ON content_versions
>   USING GIN (snapshot jsonb_path_ops) WHERE is_published_version;
> ```
>
> Partial on `is_published_version` because only those rows can ever be pointed at
> by `published_version_id`, which keeps the index off the autosave-generated bulk
> of the table. The same query answers "which live page uses this collection /
> product / stone" for the catalogue section's delete guards.
>
> ```sql
> CREATE INDEX idx_cms_blocks_config_tablet ON cms_blocks USING GIN (config_tablet jsonb_path_ops);
> CREATE INDEX idx_cms_blocks_config_mobile ON cms_blocks USING GIN (config_mobile jsonb_path_ops);
> ```
>
> Without them a mobile-only hero image is invisible to usage tracking, and the
> "unused, safe to delete" badge is wrong in precisely the case where the mistake
> is hardest to notice.

The GIN legs match on the **id value anywhere in the document**
(`config @> '{"media_id":"…"}'::jsonb` plus a containment check for array-valued
fields), and the result is then confirmed field-by-field against
`blockReferences(block)` — the union of `references()` over all three resolved
configs (§5.5). The registry is the authority on what is a media reference and
the index is a prefilter. That keeps a block whose config happens to contain a
matching UUID in an unrelated field from producing a false "in use".

### 7.6 Accepted formats and the derivative pipeline

| `media_kind` | Accepted on upload | Delivered as |
| --- | --- | --- |
| `image` | `image/jpeg`, `image/png`, `image/webp`, `image/avif`, `image/heic`, `image/tiff` | AVIF or WebP via `f_auto` |
| `vector` | `image/svg+xml` (§7.10) | Sanitised SVG, `<img>` only |
| `video` | `video/mp4`, `video/quicktime`, `video/webm` | MP4/WebM, or HLS for `mode='inline'` |
| `document` | `application/pdf`, `text/csv` | Direct, `attachment` disposition |

Everything else is rejected at `/api/media/sign` before a signature is issued.
TIFF and HEIC are accepted because that is what a jewellery photographer delivers;
neither is ever *served* — Cloudinary transcodes.

**Derivative widths, fixed:** `320, 480, 640, 768, 1024, 1280, 1536, 1920, 2560`.
Generated **on first request** by Cloudinary (not eagerly at upload), cached at
its CDN with immutable URLs. Eager generation would create nine derivatives for
every asset in the library including the ones never placed on a page.

**Delivery URLs are built, never stored** (`02` §2.4):

```ts
// src/lib/media/url.ts — the ONLY module that may construct a Cloudinary URL
export function buildImageUrl(m: MediaRef, opts: {
  width: number; aspectRatio?: number; crop?: 'limit' | 'fill' | 'thumb';
  gravity?: 'auto' | 'center'; quality?: 'auto:good' | 'auto:eco';
  format?: 'auto';
}): string;
// → https://res.cloudinary.com/{cloud}/image/upload/
//     f_auto,q_auto:good,c_limit,w_{width},dpr_auto/v{version}/{public_id}

export function cloudinaryLoader(p: { src: string; width: number; quality?: number }): string;
```

**The rule against serving originals, enforced three ways:**

1. `buildImageUrl` cannot emit a URL without a `w_` transform — there is no code
   path that omits it, and `tests/unit/media-url.test.ts` asserts every output
   matches `/\/w_\d+[,/]/`.
2. `no-restricted-syntax` bans the string literal `res.cloudinary.com` anywhere
   outside `src/lib/media/`.
3. `media.public_id` is never passed to `<img src>`; the `MediaRef` type exposes
   no field that is a usable URL on its own.

`next.config.ts` sets `images.loader: 'custom'`, `images.loaderFile:
'./src/lib/media/loader.ts'`, and `remotePatterns` limited to
`res.cloudinary.com/{CLOUDINARY_CLOUD_NAME}/**`. Vercel's own image optimiser is
bypassed entirely — it bills per source image and would add a second cache in
front of a CDN that already has one.

### 7.7 Responsive image attributes

Every rendered image emits, without exception:

```html
<picture>
  <source media="(max-width: 767px)"  srcset="…w_480 480w, …w_640 640w, …w_768 768w" sizes="100vw">
  <source media="(min-width: 768px)"  srcset="…w_768 768w, …w_1024 1024w, …w_1280 1280w" sizes="50vw">
  <img src="…w_1280" srcset="…w_1280 1280w, …w_1920 1920w, …w_2560 2560w"
       sizes="(min-width:1280px) 33vw, 50vw"
       width="2400" height="3000"
       alt="…" loading="lazy" decoding="async" fetchpriority="auto"
       style="aspect-ratio:var(--ar);background:#E8E2D7">
</picture>
```

- `sizes` is **required** on every media-bearing block definition
  (`BlockDefinition.sizes`, §1.3), per breakpoint, and the registry test fails a
  block that omits it. A wrong `sizes` is the single most common cause of a
  desktop-sized image on a phone, and it is invisible in every review.
- `width` / `height` from `media.width` / `media.height`. Non-negotiable.
- The **first image of the first visible section** gets `priority` /
  `fetchpriority="high"` and no `loading="lazy"`; `src/lib/cms/render.ts` sets it
  from position, so an editor cannot forget. Every other image is lazy.
- `placeholder="blur"` from `media.blur_data_url`, with
  `media.dominant_colour_hex` as the `background` behind it.
- A `<source media>` whose query does not match is never fetched — which is what
  makes per-breakpoint art direction (§3.4) free rather than triple-cost.

### 7.8 Replace and delete

**Replace** (`replaceMedia(mediaId, newUpload, actor)`) uploads a new Cloudinary
asset and updates the **same `media` row's** `public_id`, `version`, `format`,
`bytes`, `width`, `height`, `checksum_sha256`, `blur_data_url` and
`dominant_colour_hex`. Every reference — block configs, product galleries, nav
items, OG images — follows automatically, because they all store `media.id`.
Immutable-URL caching is preserved because the delivery URL embeds `v{version}`,
so the new URL is a different URL and no CDN object is mutated in place (`01`
§2.4). After commit, `replaceMedia` purges the cache tag of every entity
`getMediaUsage()` returns. The old provider asset is retained for 30 days, then
removed by `media_orphan_scan`, so an accidental replace is recoverable.

The replace dialog warns when the new file's aspect ratio differs from the old by
more than 5%, listing the blocks affected — the common way a replace silently
breaks three page layouts.

**Delete** is a soft delete (`media.deleted_at`, `02` §1.4) and is **refused while
`getMediaUsage()` returns any row — including a `published_snapshot` row**, which
is the usage that cannot be cleared by editing the draft and can only be cleared
by publishing the page that no longer references it. The dialog says so in those
words ("still used by the live Homepage — publish your draft first"), because
"remove it from the draft and try again" is advice that produces the outage.
The dialog lists every usage with a link, and
offers "Remove from all of these, then delete" as an explicit second step that
writes each removal through the normal versioned path — so the deletion is
undoable from each page's history. `product_media.media_id` is
`ON DELETE RESTRICT` (`02` §2.4), which makes the database the backstop if the
service check is ever bypassed.

Hard deletion (removing the Cloudinary asset) is a separate, `owner`-only action
on an already soft-deleted asset, at least 30 days old, with a typed confirmation.

### 7.9 Video

- Stored as `media_kind = 'video'`, `provider = 'cloudinary'`.
- **`preload="none"` always**, with a poster. The poster is either
  `poster_media_id` or the frame at 0s built as
  `…/video/upload/so_0,f_auto,q_auto,w_{width}/v{version}/{public_id}.jpg`. A
  1080p hero video with `preload="metadata"` still costs hundreds of kilobytes
  before anyone presses play.
- **`mode = 'background'`**: `muted autoplay loop playsinline`, no controls, and
  the block validator **rejects** a background video longer than 30 seconds or
  larger than 8MB at upload. `@media (prefers-reduced-motion: reduce)` renders the
  poster only and never starts playback — a rule, not a preference.
- **`mode = 'inline'`**: native `controls`, HLS via Cloudinary's adaptive
  streaming profile (`sp_auto`) with an MP4 `<source>` fallback, and a
  `captions_vtt_media_id` track. Sound is off by default and the user opts in.
- Videos are never `priority` and never the LCP element; a `hero` block with a
  `video_media_id` still renders `media_id` as the poster, so the LCP is an image.

> **NEEDS INPUT:** whether the client has (or will commission) motion assets at
> all. The `video` block and the pipeline exist either way; no placeholder or
> stock footage is ever seeded.

### 7.10 SVG upload safety

SVG is an executable document. It carries `<script>`, `on*` handlers,
`<foreignObject>`, external `<use href>` and CSS `url()` — an uploaded SVG served
from our origin and inlined is stored XSS with full access to an admin session.

**Four independent layers, all of them required:**

1. **Permission.** SVG upload requires the `media.upload_vector` permission,
   granted at launch to `owner` and `admin` only, never to `content_editor`. The
   file picker for non-holders does not accept `.svg` and `/api/media/sign`
   rejects `image/svg+xml` without the permission.
2. **Server-side sanitisation before the file reaches Cloudinary**, which is only
   possible because SVG is the one kind that does *not* use the signed direct
   upload — it is posted to `/api/media/svg` and our function holds the bytes
   (§7.1). `src/lib/media/svg.ts` exports
   `sanitizeSvg(input: Buffer): { svg: Buffer; removed: string[] }`, built on
   `dompurify` + `jsdom` (server-only, an ADR-approved dependency —
   `docs/decisions/0012-svg-sanitisation.md`, per `01` §1.5), configured with
   `USE_PROFILES: { svg: true, svgFilters: true }`,
   `FORBID_TAGS: ['script','foreignObject','use','image','animate','set','handler']`,
   and an `afterSanitizeAttributes` hook that strips every attribute whose name
   starts with `on` and every `href` / `xlink:href` that is not a same-document
   fragment (`#…`). SVGs whose sanitised output differs from the input are
   accepted, stored sanitised, and the removed constructs are listed to the
   uploader — silent stripping teaches nobody anything.
3. **Never inlined.** SVG from the media library is rendered **only** through
   `<img src>` or `background-image`. Both contexts disable scripting and external
   references in every current browser. `react/no-danger` is already an error
   (`01` §1.5), and `src/components/**` has no SVG-inlining helper to reach for.
   The brand marks in `public/brand/` are the one set of SVGs allowed to be
   inlined, because they are repository files under review, not uploads.
4. **Delivery hardening.** Cloudinary's `fl_sanitize` is applied on the SVG
   delivery URL, and `next.config.ts#headers()` serves
   `Content-Security-Policy: sandbox; default-src 'none'` and
   `X-Content-Type-Options: nosniff` for the media path.

Layer 3 alone would be sufficient against today's browsers; layers 1, 2 and 4
exist because "we will never inline this" is a promise about future code, and
this file is the only place that promise is written down.

---

## 8. Navigation CMS

### 8.1 Model

`navigation_menus` keys at launch (`02` §2.8, verbatim): `main`, `footer_shop`,
`footer_about`, `footer_legal`, `mobile`, `utility`. Each is optionally
market-scoped via `market_code`, `UNIQUE (key, coalesce(market_code,'**'))`, so
India can carry a different header without a second codebase.

`navigation_items` gives labels, `parent_id` nesting, `position`, `is_visible`,
`badge_label`, `open_in_new_tab`, `media_id`, and a typed target with
`chk_nav_items_target` requiring exactly one.

### 8.2 Item types

The brief requires **text, category, collection, product, stone, page, external
URL**. `02` §2.8 defines `link_type` as
`category | collection | stone | cms_page | journal_post | curated_facet | url`.
Two are missing (`text`, `product`), and the schema additionally lists
`journal_post` as a `link_type` while defining no `journal_post_id` column — a
gap that would make that value unusable.

> **SCHEMA ADDITION:** three columns and two widened constraints on
> `navigation_items`.
>
> ```sql
> ALTER TABLE navigation_items
>   ADD COLUMN product_id      UUID NULL REFERENCES products(id)      ON DELETE CASCADE,
>   ADD COLUMN journal_post_id UUID NULL REFERENCES journal_posts(id) ON DELETE CASCADE,
>   ADD COLUMN description     TEXT NULL,          -- mega-menu supporting line
>   ADD COLUMN display_style   TEXT NOT NULL DEFAULT 'link';
>
> CREATE INDEX idx_nav_items_product ON navigation_items (product_id) WHERE product_id IS NOT NULL;
> CREATE INDEX idx_nav_items_journal ON navigation_items (journal_post_id) WHERE journal_post_id IS NOT NULL;
>
> ALTER TABLE navigation_items
>   ADD CONSTRAINT chk_nav_items_link_type CHECK (link_type IN (
>     'text','category','collection','product','stone','cms_page',
>     'journal_post','curated_facet','url')),
>   ADD CONSTRAINT chk_nav_items_display_style CHECK (display_style IN (
>     'link','heading','image_card','featured_product','featured_collection','promo'));
>
> -- replaces chk_nav_items_target from 02 §2.8
> ALTER TABLE navigation_items DROP CONSTRAINT chk_nav_items_target;
> ALTER TABLE navigation_items ADD CONSTRAINT chk_nav_items_target CHECK (
>   num_nonnulls(category_id, collection_id, stone_id, cms_page_id,
>                curated_facet_id, product_id, journal_post_id, url)
>     = CASE WHEN link_type = 'text' THEN 0 ELSE 1 END
>   AND CASE link_type
>         WHEN 'text'          THEN true
>         WHEN 'category'      THEN category_id      IS NOT NULL
>         WHEN 'collection'    THEN collection_id    IS NOT NULL
>         WHEN 'product'       THEN product_id       IS NOT NULL
>         WHEN 'stone'         THEN stone_id         IS NOT NULL
>         WHEN 'cms_page'      THEN cms_page_id      IS NOT NULL
>         WHEN 'journal_post'  THEN journal_post_id  IS NOT NULL
>         WHEN 'curated_facet' THEN curated_facet_id IS NOT NULL
>         WHEN 'url'           THEN url              IS NOT NULL
>         ELSE false
>       END);
> ```
>
> **Counting the non-nulls is not enough.** `02` §2.8's constraint asserts that
> exactly one target column is populated; it does not assert that it is the one
> `link_type` names. A row with `link_type = 'product'` and only `category_id` set
> satisfies `num_nonnulls(...) = 1`, and §8.2's resolver — which switches on
> `link_type` — then finds no `product_id`, so the item renders as nothing or as a
> broken href depending on how carefully the resolver was written. The second half
> of the `CASE` binds the discriminator to its column, which is the whole point of
> having a discriminator. The `ELSE false` arm also makes an unrecognised
> `link_type` un-insertable even if `chk_nav_items_link_type` is ever relaxed.
>
> `products` and `journal_posts` are soft-delete tables, so `ON DELETE CASCADE`
> fires only on a hard delete that cannot happen while an order references the
> product — a soft-deleted product leaves the nav item in place, and §8.5 catches
> it. The cascade matches the policy `02` §2.8 chose for the other nav targets,
> for the same reason: a dangling link in the header is visible to every visitor
> on every page.

| `link_type` | Target column | Resolves to |
| --- | --- | --- |
| `text` | — | A non-clickable label. Mega-menu column headings and footer group titles |
| `category` | `category_id` | `/{market}/{category.slug}` |
| `collection` | `collection_id` | `/{market}/collections/{slug}` |
| `product` | `product_id` | `/{market}/products/{slug}` |
| `stone` | `stone_id` | `/{market}/stones/{slug}` |
| `cms_page` | `cms_page_id` | `cms_pages.path`, market-prefixed |
| `journal_post` | `journal_post_id` | `/{market}/journal/{slug}` |
| `curated_facet` | `curated_facet_id` | `/{market}/{category.slug}/{facet.slug}` |
| `url` | `url` | As given. Validated `^(https?://|/|mailto:|tel:)` |

**Hrefs are resolved at render time from the target's current slug, never stored.**
That is why `link_type` is typed at all: a merchandiser renaming a category
updates the header everywhere, in the same transaction as the slug change, with no
stale string anywhere and no reliance on the `redirects` row.

**"Render time" is inside a cached call, so the slug change must purge it.**
`getMenu()` is wrapped in `cached()` under `tags.nav(market)` (§8.4), and the
resolved hrefs are baked into that entry — and, through the ISR objects that embed
the header, into every cached page. `01` §2.4 lists the `nav:{market}` purge
triggers as "menu save, category publish toggle, market activation"; a **slug
change is not on that list**, which means renaming a category leaves the old href
in the header of every page until the entry expires, on a site where the old URL
now 301s and the header is the primary navigation. The rule, and it belongs in the
same transaction as `createRedirect()` (`02` §2.8):

> **Any slug change on a `category`, `collection`, `stone`, `product`,
> `cms_page`, `journal_post` or `curated_facet` purges `tags.nav(m)` for every
> active market**, alongside the entity's own tag and `tags.redirects()`. It is one
> extra tag in the `revalidateTags` call that the slug change already makes (`01`
> §2.3 step 6), and `tests/integration/nav-slug-change.test.ts` renames a category
> and asserts the rendered header href changed on the next request.

### 8.3 Nesting and reordering

- **Depth is capped at 3** (top level → column → item), enforced in
  `saveMenu()`, not by a constraint — `navigation_items.parent_id` is
  self-referential and Postgres cannot express a depth limit cheaply. Beyond three
  levels there is no header design that renders it, and an accidental deep tree is
  a rendering bug rather than a feature.
- Reordering uses the **same dense-renumber statement as §2.3**, against
  `idx_nav_items_menu (menu_id, parent_id, position)`.
- A menu is edited as a whole subtree behind `navigation_menus.version` —
  identical to the page rule in `02` §2.8, for the identical reason.
- Drag-and-drop in the admin moves an item between parents; the drop target is
  refused when it would exceed depth 3 or make an item its own ancestor
  (cycle check in `saveMenu()`, plus `tests/integration/nav-cycles.test.ts`).

### 8.4 Mega menu

A `main`-menu top-level item with children whose `display_style` is anything other
than `link` renders as a mega panel rather than a dropdown. `display_style` on
each child chooses how that child renders inside the panel:

| `display_style` | Renders |
| --- | --- |
| `heading` | A column title (pair with `link_type='text'`) |
| `link` | A text link in the current column |
| `image_card` | `media_id` + `label` + optional `description` as a visual tile |
| `featured_product` | A product card: image, title, and price from `getDisplayPrice(…, market)` — never a stored price |
| `featured_collection` | A collection card with `media_id` and `label` |
| `promo` | `media_id` + `label` + `description` + `badge_label`, full-height panel edge |

Everything the mega menu needs is therefore an ordinary `navigation_items` row:
reorderable, market-scopable, schedulable by `is_visible`, versioned with the
menu, and visible in the same drag-and-drop tree as everything else. **A
`mega_config JSONB` blob was the alternative and was rejected** — it would need its
own editor, its own validation, its own reference extraction for media usage
(§7.5) and its own reorder semantics, all duplicating machinery that
`navigation_items` already has.

`getMenu()` is cached under `tags.nav(market)` (`01` §2.4) with the featured
product's *price and availability* resolved outside the cached call, for the same
reason the header cannot carry a cart count (`01` §1.3).

```ts
// src/lib/cms/navigation.ts
export async function getMenu(key: string, market: MarketCode): Promise<MenuTree>;
export async function saveMenu(input: {
  menuId: string; expectedVersion: number; items: MenuItemInput[]; actor: Actor;
}): Promise<Result<{ version: number }, ConflictError | ValidationError>>;
```

### 8.5 Link health

`saveMenu()` and the nightly `cleanup-sessions` cron both run
`validateMenuTargets(menuId)`: every target resolved, every `url` checked for
scheme and a leading slash, every `cms_page` checked for `status='published'`,
every product/category/collection checked for `deleted_at IS NULL` and for
per-market publication (`product_market_content.is_published`). Failures render as
a red badge on the menu row in `/admin/content/menus` and, critically, the
storefront **omits** an item whose target does not resolve for the current market
rather than rendering a link to a 404.

---

## 9. Journal

### 9.1 Model

`journal_posts` (`02` §2.8) already carries: `slug`, `title`, `excerpt`,
`body_json`, `hero_media_id` (the cover), `author_user_id`,
`author_display_name` (snapshotted so a byline survives a staff departure),
`status`, `published_at`, `scheduled_publish_at`, `reading_minutes`,
`market_code`, `related_product_ids`, `version`, `deleted_at`. Tags are
`journal_post_tags` against the shared `tags` table. SEO is a `seo_metadata` row
with `entity_type = 'journal_post'`.

The one thing the brief requires that the schema does not define is **category**.

> **SCHEMA ADDITION:** `journal_categories` plus one column on `journal_posts`.
>
> ```sql
> CREATE TABLE journal_categories (
>   id            UUID PRIMARY KEY,
>   slug          TEXT NOT NULL,
>   name          TEXT NOT NULL,
>   description   TEXT NULL,
>   hero_media_id UUID NULL REFERENCES media(id) ON DELETE SET NULL,
>   rank          INTEGER NOT NULL DEFAULT 0,
>   is_active     BOOLEAN NOT NULL DEFAULT true,
>   created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
>   updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
> );
> CREATE UNIQUE INDEX idx_journal_categories_slug ON journal_categories (lower(slug));
>
> ALTER TABLE journal_posts
>   ADD COLUMN category_id UUID NULL REFERENCES journal_categories(id) ON DELETE SET NULL;
> CREATE INDEX idx_journal_category ON journal_posts (category_id, published_at DESC)
>   WHERE status = 'published' AND deleted_at IS NULL;
> ```
>
> **One category, many tags** — the standard editorial split. `ON DELETE SET NULL`
> so deleting a category never deletes a post. A separate table rather than
> reusing `categories`: product categories are the storefront's navigation and URL
> spine (`/rings`), and mixing "Care Guides" into that namespace would put an
> editorial category into product navigation, faceting and the sitemap's commerce
> shards. `journal_categories` is a lookup table by `02` §1.9's rule — the merchant
> adds one without a deploy.
>
> Routes: `/journal`, `/journal/category/[slug]`, `/journal/[slug]`. The category
> route is ISR 1800s under tag `cms:post-category:{id}`.

`reading_minutes` is computed on save by `estimateReadingMinutes(body_json)` at
220 words/minute and is editable — an editor who disagrees with the number wins.

`related_product_ids UUID[]` powers the shoppable rail. `02` §1.6 justifies the
array; this section adds the render rule: unresolvable, archived and
market-unpublished ids are **skipped silently on the storefront** and flagged in
the editor, because a five-year-old journal post that loses one discontinued piece
must not render an empty slot.

### 9.2 Editing

`/admin/content/journal/[id]` is a two-pane editor: the Tiptap body on the left,
a metadata sidebar on the right (slug, category, tags, cover, excerpt, author,
market, publish date, SEO). Same autosave contract as §6, same
draft/scheduled/published/archived machine as §4, same version history as §5 with
`entity_type = 'journal_post'`. A slug change on a published post writes a
`redirects` row in the same transaction (`02` §1.5) through `createRedirect()`,
including the cycle-break and chain-flatten logic `02` §2.8 specifies.

The body editor offers the block-adjacent nodes an editorial post actually needs:
paragraph, headings 2–4, bullet/ordered list, blockquote, horizontal rule, link,
bold/italic, **image** (a `media.id`, inserted via the same `<MediaField>` picker),
**product card** (a `product_id`, rendered with live price), and **callout**. It is
not a page builder — a post that needs a hero and a product grid is a `cms_pages`
row with `page_type='landing'`.

### 9.3 Rich text: storage, rendering, sanitisation

**Tiptap JSON in `body_json JSONB`, rendered by a first-party node→React
renderer.** `01` §1.1 settles this and rules out `@tiptap/html`: `generateHTML()`
exists only to produce an HTML string, and an HTML string is the one artefact this
architecture forbids, because rendering it requires `dangerouslySetInnerHTML`,
which is an ESLint error with exactly one documented exception (the JSON-LD
emitter).

```tsx
// src/lib/cms/richtext.tsx
export const richTextSchema: z.ZodType<RichTextDoc>;    // validates on WRITE
export function RichText(props: {
  doc: RichTextDoc; market: Market; data?: RichTextData;
}): React.ReactElement;
export function plainText(doc: RichTextDoc, maxChars?: number): string;  // excerpts, meta, email
export function extractReferences(doc: RichTextDoc): BlockReference[];   // media/product usage (§7.5)
```

**Sanitisation is an allowlist at two boundaries, not an HTML scrubber.**

*On write*, `richTextSchema` parses the document and **rejects** anything outside
the allowlist. This is the primary defence: a hostile node never reaches the
database.

| Allowed nodes | `doc`, `paragraph`, `heading` (levels 2–4 only), `bulletList`, `orderedList`, `listItem`, `blockquote`, `horizontalRule`, `hardBreak`, `text`, `image`, `productCard`, `callout` |
| --- | --- |
| Allowed marks | `bold`, `italic`, `underline`, `strike`, `link`, `superscript`, `subscript` |
| Node attrs | `heading.level ∈ {2,3,4}`; `image.mediaId` must be a UUID; `productCard.productId` must be a UUID; `callout.tone ∈ {'note','warning','quote'}` |
| Mark attrs | `link.href` must match `^(https?://|/|mailto:|tel:)`; `link.target ∈ {'_self','_blank'}`; `rel` is **computed, never stored** |
| Banned outright | any `html` / `rawHTML` node, `iframe`, `script`, `style`, `embed`, any `data-*` passthrough, any attribute not named above |
| Limits | document ≤ 256KB serialised, nesting depth ≤ 6, ≤ 5,000 nodes |

*On render*, `RichText` walks the tree against a **closed** node/mark map. An
unknown node type renders `null` (and logs once to Sentry with the post id); it is
never passed through. `heading` is clamped to 2–4 so an editor cannot emit a
second `<h1>` and break the page outline. `link` gets
`rel="nofollow noopener noreferrer"` computed at render for any absolute href
whose origin is not `NEXT_PUBLIC_APP_URL`, and `target="_blank"` always implies
`rel="noopener"` regardless of what is stored.

Because the renderer emits React elements and never a string, the same component
tree is used by the storefront **and** by React Email (§10), which does its own
HTML serialisation — one sanitisation policy, two outputs, zero
`dangerouslySetInnerHTML`.

`tests/unit/richtext-sanitisation.test.ts` feeds a corpus of hostile documents
(`javascript:` hrefs, `on*` attrs smuggled as node attrs, an `html` node, a
10-deep list bomb, a 2MB paragraph) and asserts each is rejected at write **and**
renders inert if force-inserted directly into the database.

---

## 10. Email templates

### 10.1 Editable surface

`email_templates` (`02` §2.8) has `key`, `market_code`, `subject`, `preheader`,
`body_json`, `is_active`, `version`. The brief additionally requires an editable
**heading, CTA, footer and logo**. Those are distinct slots in the layout, each
rendering differently — putting them inside `body_json` would make the admin form
a free-form document where a heading is whatever the editor styled as one, and
would make the CTA button impossible to render as a button.

> **SCHEMA ADDITION:** five columns and one constraint on `email_templates`.
>
> ```sql
> ALTER TABLE email_templates
>   ADD COLUMN heading          TEXT  NULL,
>   ADD COLUMN cta_label        TEXT  NULL,
>   ADD COLUMN cta_url_template TEXT  NULL,   -- may contain {{…}} tokens, e.g. {{order.statusUrl}}
>   ADD COLUMN footer_json      JSONB NOT NULL DEFAULT '{}'::jsonb,   -- Tiptap, same policy as §9.3
>   ADD COLUMN logo_media_id    UUID  NULL REFERENCES media(id) ON DELETE SET NULL;
>
> ALTER TABLE email_templates ADD CONSTRAINT chk_email_templates_cta
>   CHECK ((cta_label IS NULL) = (cta_url_template IS NULL));
> ```
>
> The `CHECK` prevents the half-configured CTA — a button with no destination, or
> a destination with no button — which is otherwise discovered by a customer.
> `logo_media_id` adds one more leg to `getMediaUsage()` (§7.5), already listed
> there.

### 10.2 Template keys

`02` §2.8 seeds: `order_confirmation`, `shipping_confirmation`, `otp_login`,
`password_reset`, `return_received`, `refund_issued`, `abandoned_cart`,
`back_in_stock`, `gift_card_issued`, `low_stock_digest`. `key` is `TEXT` on a
lookup table with no CHECK, so the five the brief adds are **seed rows, not a
migration**:

| Key | Trigger | Required tokens |
| --- | --- | --- |
| `welcome` | First customer account created / newsletter double opt-in | `customer.firstName`, `site.url` |
| `order_confirmation` | `orders.status → pending_payment` with lines snapshotted | `order.number`, `order.items`, `order.totalFormatted`, `order.statusUrl` |
| `payment_confirmation` | Verified webhook marks `orders.payment_status = 'paid'` | `order.number`, `payment.amountFormatted`, `payment.method` |
| `order_shipped` | `shipments.status → in_transit` | `order.number`, `shipment.carrier`, `shipment.trackingNumber`, `shipment.trackingUrl` |
| `order_delivered` | `shipments.status → delivered` | `order.number`, `shipment.deliveredAt` |
| `order_cancelled` | `orders.status → cancelled` | `order.number`, `order.cancelReason` |
| `refund_issued` | `refunds.status → succeeded` | `order.number`, `refund.amountFormatted`, `refund.reason` |
| `password_reset` | Staff or customer reset request | `user.firstName`, `auth.resetUrl`, `auth.expiryMinutes` |
| `contact_enquiry` | Storefront contact form submission (internal recipients) | `enquiry.name`, `enquiry.email`, `enquiry.subject`, `enquiry.message` |

`order_shipped` / `order_delivered` / `order_cancelled` / `payment_confirmation` /
`welcome` / `contact_enquiry` are new rows in `prisma/seed/07-email-templates.ts`.
`shipping_confirmation` is kept as an alias row pointing at `order_shipped` so no
existing reference breaks.

Per-market rows: `UNIQUE (key, market_code) NULLS NOT DISTINCT` (`02` §2.8) means
one default row (`market_code IS NULL`) plus optional per-market overrides.
Resolution is `(key, market) → (key, NULL) → the compiled React Email component of
the same key`. **A missing row is never an error** (`02` §2.8) — mail does not stop
because someone deleted a template.

### 10.3 Variable substitution and escaping

```ts
// src/lib/email/render.ts
export type EmailContext = {
  site: { name: string; url: string; logoUrl: string | null };
  market: Market;
  customer?: { firstName: string; lastName: string; email: string };
  order?: OrderEmailView;        // amounts already `Money` + formatted strings
  shipment?: ShipmentEmailView;
  payment?: PaymentEmailView;
  refund?: RefundEmailView;
  auth?: { resetUrl: string; expiryMinutes: number };
  enquiry?: EnquiryEmailView;
};

export function interpolate(
  template: string, ctx: EmailContext,
): { text: string; missing: string[] };

export async function renderTemplate(
  key: string, market: MarketCode, ctx: EmailContext,
): Promise<{ subject: string; html: string; text: string; missing: string[] }>;
```

**The mechanism.** Tokens are `{{path.to.value}}`, resolved against a **frozen
allowlist** of paths derived from `EmailContext` — `ALLOWED_TOKENS` in
`src/lib/email/tokens.ts`, exported to the admin editor so the template form shows
an insertable token list rather than expecting the editor to remember syntax. It
is **not** a template language: no conditionals, no loops, no expressions, no
function calls. Repeating structures (`order.items`) are **not** tokens; they are
React Email components chosen by the layout, because a loop in a merchant-editable
string is a code path an editor cannot debug and an attacker can.

**Escaping, and the three places it differs:**

| Output | Escaping |
| --- | --- |
| Token substituted into **body/footer rich text** | Substituted as a **React text node**, not a string concatenation. React escapes it. There is no path by which a token value becomes markup |
| Token substituted into **`subject` or `preheader`** | Plain text headers. Stripped of CR/LF (`\r`, `\n`) before use — an unescaped newline in a token value is **SMTP header injection**, which lets a value containing `\nBcc:` add recipients |
| Token substituted into **`cta_url_template`** | Each token value is `encodeURIComponent`'d; the assembled URL is then parsed with `new URL()` and rejected unless its scheme is `https:` and its origin is `NEXT_PUBLIC_APP_URL` or an allowlisted carrier tracking domain. A CTA that points anywhere else does not send |

**The `market` argument to `renderTemplate` is the entity's market, never the
request's.** An order confirmation renders `orders.market_code`; a shipping email
renders the market of the order the shipment belongs to. Staff in the US
triggering a resend of an Indian customer's confirmation from the admin must not
flip the template, the currency or the locale — and every amount in
`OrderEmailView` is a snapshot column from `order_items` (`01` §2.7), formatted
once by `formatMoney` in the order's own currency, never re-derived from `prices`
and never converted. `tests/integration/email-market.test.ts` resends an INR order
from a US admin session and asserts ₹ and the India template.

A token with no value in the context renders as **empty string** and is reported
in `missing[]`; `renderTemplate` logs the list and the admin preview shows
"3 tokens have no value in this preview". A literal `{{` is written `{{{{`.
An **unknown** token (not in `ALLOWED_TOKENS`) is a save-time validation error —
`{{customer.password}}` must fail in the editor, not silently render blank in a
customer's inbox.

`tests/unit/email-tokens.test.ts` asserts: every key in `ALLOWED_TOKENS` resolves
against a fully-populated `EmailContext`; every seeded template's tokens are in
`ALLOWED_TOKENS`; `\r\n` in a subject token is stripped; a `javascript:` CTA is
rejected; and `{{order.items}}` is not an allowed token.

### 10.4 Admin editing

`/admin/settings/email-templates/[key]` shows the editable fields (subject,
preheader, heading, body, CTA label + URL, footer, logo), an insertable token
palette, and a **live preview rendered against a synthetic context** —
`buildSampleContext(key, market)`, with every value obviously synthetic
(`ORDER-SAMPLE-0001`, `sample@example.com`) so a sample is never mistaken for a
real order.

**Send test email** delivers to the signed-in staff member's own address only —
never a free-text recipient, which would make the admin panel an open relay. On
`local` / `preview` it obeys `EMAIL_SANDBOX_REDIRECT`, and with `RESEND_API_KEY`
unset it writes an `email_logs` row with `status='skipped_unconfigured'` and says
so, rather than reporting a send (`01` §4.9).

Templates are versioned (`content_entity_type = 'email_template'`, every save) and
restorable through the same UI as pages — a broken order-confirmation email is a
revenue incident, and the fix must be a two-click revert.

---

## 11. Homepage

### 11.1 It is a page, and nothing about it is hardcoded

`02` §2.8 settles the model: **there is no `homepage_sections` table.** The
homepage is the `cms_pages` row with `page_type = 'home'` and `path = '/'`, one
per market by partial unique index
(`idx_cms_pages_home ON cms_pages (coalesce(market_code,'**')) WHERE page_type='home' AND deleted_at IS NULL`).

`(storefront)/[market]/page.tsx` is therefore nine lines:

```tsx
export const revalidate = 300;                       // 01 §1.3

export default async function HomePage({ params }: { params: Promise<{ market: string }> }) {
  const market = await resolveMarket((await params).market);
  const snapshot = await getPublishedPage('/', market.code);
  if (!snapshot) notFound();
  return <PageRenderer snapshot={snapshot} market={market} renderSource="published" />;
}
```

There is no `<Hero>` import, no section list, no conditional, no copy, no image
path, no product id. Everything the visitor sees is `cms_sections` +
`cms_blocks`, ordered by `position`, rendered by the registry.
`tests/unit/homepage-no-hardcode.test.ts` asserts that
`src/app/(storefront)/[market]/page.tsx` imports nothing from
`@/components/blocks/**` and contains no string literal longer than 16
characters.

Consequences the owner can act on without an engineer: reorder the entire
homepage by dragging sections; drop in a seasonal `banner` with a start and end
date; swap the hero image for mobile only; add a second `product_grid` pointing at
a different collection; schedule a whole section to appear on a Friday and
disappear on a Monday; give India a different hero by setting
`cms_sections.market_code = 'IN'` on one section and `'US'` on another.

### 11.2 The editorial narrative is a configured section list

The narrative arc the brief describes is expressed as an **ordering of sections,
each built from generic blocks** — not as bespoke homepage components. The seeded
skeleton (`prisma/seed/99-demo.ts`, every row `is_demo = true`, refused when
`APP_ENV=production`):

> **This table is the only seeded homepage in the set, and it has been amended to
> carry `10 §5.2`'s narrative arc.** `10 §5.2` previously listed a different
> sixteen-item order with four sections this document had no row for (`14K Gold`,
> `Lab grown diamonds`, `Global customers`, `Private list`) while this document
> carried three that document omitted (`announcement`, `assurance`, `closing`).
> Both were describing the contents of one `prisma/seed/99-demo.ts`. The merge,
> made here because this document owns the seed: the three new sections below are
> `gold`, `lab_grown` and `global`; "Private list" was never a new section — it is
> the `newsletter` section under its editorial name; and `10 §5.2`'s two separate
> heritage moments collapse into one `heritage` section plus `editorial`, because
> two heritage blocks on one page is the "persuasion stack" `10 §1` forbids.
> `10 §5.2` now points here instead of restating.

| # | `cms_sections.key` | `layout` | `background_token` | Blocks | Narrative role |
| --- | --- | --- | --- | --- | --- |
| 0 | `announcement` | `full_bleed` | `--md-emerald-deep` | `banner` | Scheduled utility line; **hidden by default** |
| 1 | `opening` | `full_bleed` | `NULL` | `hero` | The first image. Per-breakpoint art direction (§3.4); LCP |
| 2 | `statement` | `contained` | `NULL` | `text` | The brand line under the hero |
| 3 | `heritage` | `split_2` | `--md-ivory` | `heritage` | "HERITAGE, REFINED." and the `40+` figure, as one configured block |
| 4 | `categories` | `grid_4` | `NULL` | `collection_feature` ×4 | Signature collections — deliberately unequal media ratios, **not** four identical cards (`10 §5.2`) |
| 5 | `featured` | `contained` | `NULL` | `product_carousel` | Merchandised pieces, sourced from a collection |
| 6 | `stones` | `full_bleed` | `--md-stone` | `stone_strip` | The world of stones, driven by the `stones` table |
| 7 | `one_of_a_kind` | `contained` | `--md-emerald-deep` | `one_of_a_kind` | The unique pieces, live from the ONE OF A KIND **category**. The only dark band in the upper page, so it reads as an event |
| 8 | `gold` | `split_2` | `NULL` | `editorial_split` | **14K GOLD** — `cta_href` to `/14k-gold` |
| 9 | `lab_grown` | `split_2` | `--md-ivory` | `editorial_split` (`media_side: 'right'`) | **LAB GROWN DIAMONDS** — `cta_href` to `/lab-grown-diamonds` |
| 10 | `editorial` | `split_2` | `NULL` | `editorial_split` | The making / the workshop |
| 11 | `global` | `contained` | `--md-forest` | `text` | "CRAFTED HERE. COLLECTED AROUND THE WORLD." — **the country list and any customer quote are seeded empty** (`10 §4.3`, hard rule 8) |
| 12 | `journal` | `grid_3` | `NULL` | `lookbook` + latest posts | Editorial into commerce |
| 13 | `assurance` | `grid_3` | `--md-ivory` | `text` ×3 | Shipping, returns, care — **copy seeded blank** |
| 14 | `newsletter` | `full_bleed` | `--md-green-black` | `newsletter` | "The private list" — the close |
| 15 | `closing` | `contained` | `NULL` | `quote` | The brand signature |

Two properties of that `background_token` column, which is new here and is the
seven-value set of §2.1:

- **`NULL` is used deliberately, not as a default.** It resolves to `--md-bg`
  (`--md-ivory-soft`), and using it rather than writing `'--md-ivory-soft'`
  explicitly means an owner who later changes the page ground changes the page,
  not fifteen rows.
- **The arrangement satisfies `checkRhythm()` (§2.2) with zero warnings.** No two
  adjacent visible sections share both a surface and a layout: sections 8 and 9
  are both `split_2` but differ in surface, and 9 and 10 differ in surface again.
  The seed is the worked example of the rule, which is the cheapest way to make a
  rule survive contact with an editor.

**Every copy field in that skeleton is seeded empty and every media field is
seeded null.** A section whose blocks resolve to nothing renders nothing — no
placeholder headline, no grey box, no lorem ipsum, no stock photograph. That is
`02` §6.1's demo-content rule applied to the highest-visibility page on the site:
the homepage of a freshly-seeded install is a working, orderable, empty page that
the owner fills in, not a page that looks finished and is lying.

> **NEEDS INPUT:** all homepage copy — the hero headline and CTA, the brand
> statement, the heritage paragraph and any figures inside it, the 14K gold and
> lab-grown-diamond standfirsts, the countries in the `global` section, the
> assurance column text, the closing quote and its attribution — and the
> photography for each section at desktop and mobile crops. Section order above is a starting
> arrangement the owner can change by dragging; it is not a decision that needs
> sign-off before the build proceeds.

### 11.3 Second and subsequent landing pages cost nothing

A "Mother's Day" or "New Arrivals" page is a `cms_pages` row with
`page_type = 'landing'` and any `path`. It gets the same builder, the same
blocks, the same per-breakpoint config, the same preview, the same version
history, the same scheduling and the same publish flow — because there was never a
homepage-shaped special case to reconcile. That is the entire return on the
decision `02` §2.8 made and this section implements.

---

## 12. The boundary of "runs the entire site without opening the source code"

Stated explicitly, because an unstated boundary is discovered at the worst moment.

**Editable by the owner, no deploy, no engineer:** every page's existence, path,
title, status, schedule, market, SEO and indexability; every section's order,
layout, background, padding, visibility and visibility window; every block's
existence, order, content, per-breakpoint configuration and visibility; every
image, video, alt text, folder and tag; every menu in the header, footer, mobile
and mega panels; every journal post, category and tag; every transactional email's
subject, heading, body, CTA, footer and logo, per market; every `settings` value
including retention periods, feature flags, contact details and legal copy; every
redirect; every category, collection, stone, material, product, price and coupon
(owned by sibling sections, same admin).

**Requires a deploy, and always will:** a new *block type* (a new component is
code); a new *breakpoint*; a change to the block layout CSS in
`src/styles/globals.css`; a new value on the responsive `limit` ladder (§2.1 — it
generates static CSS); a new *email layout* (as opposed to its content); a new
route shape; a new `content_entity_type`. Each of these is a one-file change
because of the registry contract in §1.3, and each is listed here so the client
is told the truth about which requests are a ten-minute edit and which are a
release.

**The mitigation for the first item**, which is the one that will come up: the 23
launch blocks were chosen to cover composition rather than instances.
"We want a three-up of stones with a heading" is `stone_strip` with
`columns: 3`, not a new block type. A genuinely new block is one whose *shape* is
new, and those are rare. `maxPerPage`, `allowedChildren` and the `split_layout`
container exist so that combinations, not new types, absorb most requests.

**One limitation that is a migration rather than a rebuild, stated now so it is
not discovered at market three:** a section or block is scoped to *one* market or
to *all* markets (`02` §2.8's single `market_code` column). "US and Canada but not
India" is not expressible, and the editor's workaround is to duplicate the
section. With two markets that case does not arise. The extension point is the
`cms_section_markets` / `cms_block_markets` join tables in §1.4, and the renderer
already takes a set — so the change is one migration, one backfill and one
composer edit, with nothing to alter in the registry, the blocks, the snapshot
consumers or the builder UI beyond swapping a single-select for a multi-select.
