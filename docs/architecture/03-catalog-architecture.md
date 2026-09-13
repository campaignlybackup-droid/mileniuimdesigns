# 03 — Catalogue Architecture: Products, Variants, Attributes, Stones, Materials, Collections, Tags

Scope: the product model and its lifecycle, the variant engine, the EAV attribute
layer, stone and material entities, collections and their rule engine, categories
and tags, and the three special collections (ONE OF A KIND, CLOSEOUTS, LAB GROWN
DIAMONDS).

Every table and column named here is the one defined in **02 §2.4–2.6**. Where a
column does not exist there, it appears below inside a `> **SCHEMA ADDITION:**`
callout with its full definition, and is collected in §9 so the schema document can
absorb it. Service module paths and function names follow 01 §3; pricing,
inventory and market logic is **called**, never re-implemented (01 §2.3).

---

## 1. Product architecture

### 1.1 What a product is, and what it is not

A `products` row is the **editorial and merchandising unit**: a title, a story, a
gallery, a category home, a stone set, a tag set, an SEO identity and one URL. It
is *not* the sellable unit and it holds no price and no stock.

The sellable unit is `product_variants`. A product that looks like it has no
variants still has exactly one — created implicitly by `saveProduct()` with
`title = NULL` and no `product_options` rows — because price (`prices.variant_id`),
stock (`inventory_items.variant_id`), weight (`variant_materials.variant_id`) and
cart lines (`cart_items.variant_id`) all hang off a variant. A "simple product"
path that skips the variant row would mean two codepaths for every one of those,
and the second one is always the one that is wrong.

```
products ──1:N──▶ product_variants ──1:N──▶ prices        (per market)
    │                    │        ──1:N──▶ inventory_items (per location)
    │                    │        ──N:M──▶ materials       (variant_materials, + weight)
    │                    └────────  N:M──▶ product_option_values (variant_option_values)
    ├──N:M──▶ categories   (product_categories, one is_primary)
    ├──N:M──▶ collections  (product_collections, source manual|rule)
    ├──N:M──▶ stones       (product_stones, one is_primary, carries carat/count/cut)
    ├──N:M──▶ tags         (product_tags)
    ├──1:N──▶ product_attribute_values  (variant_id NULL = product scope)
    ├──1:N──▶ product_media (variant_id NULL = shown for every variant)
    └──1:N──▶ product_market_content (per-market title/copy/visibility)
```

### 1.2 Lifecycle: draft / scheduled / published / archived

`product_status` is `draft | active | archived` (02 §1.9). There is **no
`scheduled` enum value and one is not added.** The four states the admin shows are:

| Admin state | Predicate | Storefront |
| --- | --- | --- |
| **Draft** | `status='draft'` | 404. Never in a sitemap, a listing, search, a collection or a feed. Reachable only through admin preview (§1.3). |
| **Scheduled** | `status='active' AND published_at > now()` | 404 until the moment passes. Listed in `/admin/catalog/products?state=scheduled` with the go-live time. |
| **Published** | `status='active' AND published_at <= now() AND deleted_at IS NULL` | Live. This exact predicate is the definition of "live" used by every catalogue query (02 §2.4, §4.1). |
| **Archived** | `status='archived'` | 301 → the primary category, from a `redirects` row written by `saveProduct()` in the same transaction as the status change — **served by the route, not by middleware** (below). Stays in admin, keeps its order history, keeps its slug reserved. |

**A catalogue redirect is resolved by the route, not by middleware — and without
this paragraph every redirect in this document would have shipped dead.** 01 §2.1
states that the edge redirect snapshot is consulted **only when the path did not
match a known route pattern**, and `/products/…`, `/rings`, `/collections/…` and
`/stones/…` always match one. Every `redirects` row this section writes — archive,
slug change, a `hidden` sold one-of-a-kind piece (§8.1), a deactivated curated
facet (§4.2) — would therefore be written, indexed, listed in
`/admin/content/redirects`, and never served: the route would 404 on the old URL
and the inbound links would be lost silently, which is the one failure mode a
redirect exists to prevent. The rule:

- `src/lib/cms/redirects.ts` exports
  `resolveRedirect(path: string): Promise<{ to: string; status: 301 | 302 } | null>`,
  read through the `cached()` wrapper under tag `redirects` (01 §2.4).
- Every catalogue route — `/products/[slug]`, `/[category]`, `/[category]/[facet]`,
  `/collections/[slug]`, `/stones/[slug]` — calls it on the **miss path**,
  immediately before `notFound()`, and `redirect(to, status)` on a hit. A live URL
  never pays for it; only a URL that was about to 404 does.
- Catalogue redirect rows are stored **market-agnostic**:
  `from_path = '/products/<old-slug>'`, `to_path = '/products/<new-slug>'`, never
  `/in/products/…`. `redirects.from_path` is one path (02 §2.8) and slugs are not
  market-scoped (02 §1.5), so one row per active market would multiply every slug
  change by the market count and be incomplete the day a market is added. The route
  strips the `[market]` segment before the lookup and re-applies it to `to_path`, so
  `/in/products/<old>` 301s to `/in/products/<new>`.

**Why a derived `scheduled` rather than a fifth enum value.** `content_status`
already carries `scheduled` for CMS pages, and copying it here looks consistent.
It is not: the moment a product carries `status='scheduled'`, every one of the
~30 catalogue predicates in the codebase must read `status IN ('active','scheduled')
AND published_at <= now()` instead of `status='active' AND published_at <= now()`,
and the one query where someone forgets is a product that goes live everywhere
except the sitemap — or never goes live at all. One timestamp comparison, already
present in `idx_products_published`, expresses the same fact and cannot be
forgotten because it is the same clause that was always there.

**Going live is not a clock, it is a job.** ISR pages (01 §1.3) will not
re-render at the scheduled minute on their own, so a scheduled product would
appear only when a 900s window happened to expire — or not at all on a page whose
`generateStaticParams` ran before it existed. `saveProduct()` therefore enqueues a
`jobs` row when `published_at > now()`:

```ts
// src/lib/catalog/product.ts, inside the save transaction
await enqueueJob(tx, {
  kind: 'publish_scheduled',
  runAfter: input.publishedAt,
  payload: { productId, previousPublishedAt },
});
```

`/api/cron/run-jobs` claims it with the existing `FOR UPDATE SKIP LOCKED` query
(02 §2.9), re-asserts that `published_at` still matches the payload (a
rescheduled product's stale job is a no-op, not a premature publish), and calls
`revalidateTags([tags.product(id), tags.productSlug(m, slug) …, tags.category(...),
tags.sitemap()])`. Rescheduling cancels the old job row in the same transaction.

> **SCHEMA ADDITION:** `ALTER TYPE job_kind ADD VALUE 'publish_scheduled';` —
> `job_kind` (02 §1.9) has no value for a timed publish. It is row 10 of the
> complete seventeen-value enum in **11 §3.1**, ships in its own migration ahead of
> the migration that uses it, and is `systemPermitted: true` with a
> `dedupeKey` of `entity` (the `productId`), so a re-scheduled product cannot queue
> two live jobs (11 §3.2). Reusing `jobs` rather than
> adding a cron route means the go-live is visible, retryable and attributable in
> `/admin/system/jobs` like every other deferred action.

**Soft delete is not a state.** `deleted_at` is set by an explicit Delete action,
is filtered by every partial index, and is not offered as a merchandising state —
archiving is. 02 §1.4 forbids hard delete because `order_items.product_id` is
`ON DELETE RESTRICT`.

### 1.3 Preview

`/admin/catalog/products/[id]/preview?market=IN` renders the real storefront PDP
component tree inside the admin shell, server-side, with `previewMode: true`
threaded through `getProductForPdp()`. It does **not** use Next `draftMode()`:
01 §1.3 forbids `draftMode()` in any tree reachable from an ISR route, and the PDP
is one. Preview is a separate, `force-dynamic`, `no-store`, permission-gated route
that calls the same service with the publication predicate relaxed.

### 1.4 Complete field inventory, by admin editor panel

The admin product editor at `/admin/catalog/products/[id]` is ten panels, in this
order, on one page with a sticky right rail (completeness, status, market
switcher). Autosave carries `dirtyFields` + `expectedVersion` + a monotonic `seq`
(01 §2.7).

**Panels 3 and 4 are excluded from autosave, by name.** Autosave is right for
copy, media order and organisation; it is wrong for anything append-only or
customer-facing at the till. `prices` is append-only (02 §2.5), so a debounced
save per pause in typing inserts a `prices` row **and** a `price_history` row every
750ms, closes the previous row each time, churns the `idx_prices_active` partial
unique index, and buries the one real change in forty machine-generated ones — in
the exact table a pricing dispute is read from. Inventory is worse: the quantity
field posts an *adjustment* through `src/lib/inventory/`, so a figure corrected
mid-keystroke writes two `inventory_transactions` rows and moves real stock. Both
panels therefore have an explicit **Save**, post their own server action, and
contribute nothing to `dirtyFields`. `src/components/admin/AutosaveForm.tsx` takes
an `excludeFields` set, and `tests/unit/autosave-excludes.test.ts` asserts that no
`prices.*` or `inventory_items.*` field can enter an autosave payload.

Legend: **R** required to save · **P** required to publish · **S** recommended
(scored, never blocking) · **O** optional.

#### Panel 1 — General

| Field | Column | Type | Req |
| --- | --- | --- | --- |
| Title | `products.title` | `TEXT` | **R** |
| Subtitle | `products.subtitle` | `TEXT` | S |
| URL slug | `products.slug` | `TEXT` | **R** (auto-derived from title, editable; change writes a `redirects` row) |
| Description | `products.description_json` | `JSONB` (Tiptap) | S |
| Care instructions | `products.care_instructions_json` | `JSONB` | S |
| Made to order | `products.is_made_to_order` | `BOOLEAN` | O |
| Lead time (days) | `products.lead_time_days` | `SMALLINT` | **P** if `is_made_to_order` |
| One of a kind | `products.is_one_of_a_kind` | `BOOLEAN` | O — see §8.1; flipping it to `true` retires extra variants in the same transaction |

#### Panel 2 — Media

| Field | Column | Req |
| --- | --- | --- |
| Gallery (drag-ordered) | `product_media (product_id, media_id, role, position)` | **P** — ≥ 1 row |
| Hero image | `product_media.role='hero' AND variant_id IS NULL` | **P** — exactly one, enforced by `idx_product_media_hero` |
| Per-variant images | `product_media.variant_id` | O |
| Swatch | `product_media.role='swatch'` / `product_option_values.swatch_media_id` | S |
| Lifestyle / video / 360 | `product_media.role IN ('lifestyle','video','three_sixty')` | O |
| Certificate | `product_media.role='certificate'` | **P** for LAB GROWN DIAMONDS (§8.3) |
| Alt text | `media.alt_text` | S (scored, warned, never blocking — 02 §2.4) |

#### Panel 3 — Pricing

One column per **active market**, side by side, posted as independent writes
(02 §2.5). There is no base price field and no conversion control anywhere in
this panel.

| Field | Column | Req |
| --- | --- | --- |
| List price | `prices.list_minor` (+ `market_code`, `currency_code`) | **P** — at least one active market |
| Sale price | `prices.sale_minor` | O (`CHECK sale_minor <= list_minor`) |
| Compare-at | `prices.compare_at_minor` | O |
| Cost | `prices.cost_minor` | S (margin reporting; never rendered to a shopper). Visible only to `price.read_cost` — see below |
| Scope | `prices.variant_id` — `NULL` = product default, set = variant override | **R** |
| Price source | `prices.price_source` — **`manual` only on the product-default row**; `manual` or `metal_linked` on a variant row | **R** — default `manual` |
| Formula binding | `price_formula_bindings (variant_id, market_code, formula_id, mode)` via `setFormulaBinding()` — **variant rows only** | **R** when source ≠ `manual` |

**Price source is a function of the scope, not a free choice beside it** (C28).
An earlier revision of this panel listed *Price source* and *Scope* as two
independently settable fields, which offers a combination the database refuses:
04 §2.2's `CHECK chk_prices_variant_level_formula: price_source = 'manual' OR
variant_id IS NOT NULL` makes a product-level row that is not `manual`
unwritable, so a valid-looking submission fails at the `INSERT`. The reason is not
arbitrary — a formula prices from `variant_materials.weight_grams`, which is keyed
by variant, so a product-level metal-linked price would either have no weight at
all or price a size 5 and a size 10 ring as if they weighed the same. The panel
therefore:

- renders the **product-default column** with the source control fixed at
  `manual` and the formula fields absent, not disabled;
- offers **Bind pricing formula** only once a variant is selected, and posts
  `setFormulaBinding({ variantId, marketCode, formulaId, mode })` — the binding is
  its own row in `price_formula_bindings`, not four fields on `prices`;
- shows the formula's *inputs* (`material_id`, `metal_weight_grams`,
  `making_charge_*`, the component costs) **read-only**, as the snapshot of the
  last computation (04 §2.2), because they are outputs of the run that wrote the
  row and typing over them would not change the price;
- refuses `setManualPrice` on a bound (variant × market) with `ManualOverrideError`
  and offers the two legal moves by name — Unbind, or Override — rather than
  silently winning (04 §2.2).

There is no **Price floor** field. The floor is a per-market term on the formula
(`pricing_formula_market_terms.floor_minor`), edited at `/admin/pricing/formula`,
not a per-price column — `prices.floor_minor` does not exist (§2.4, 11 §7.4).

`applyNow` is never `true` from a bulk action: the bulk surface binds with
`applyNow: false` and then offers "Create recalculation preview", so eight hundred
prices cannot move without a human looking at the numbers (04 §1.3).

The panel renders read-only for a user without `price.update` and the whole panel
is absent for a user without `price.read` — the *values* are absent from the
server payload, not hidden with CSS (hard rule 9). `prices.cost_minor` and every
margin figure need `price.read_cost` **in addition**, and are omitted from the
payload for anyone else (11 §1.3 row 22; 04 §4).

#### Panel 4 — Inventory

| Field | Column | Req |
| --- | --- | --- |
| Inventory policy | `product_variants.inventory_policy` (`tracked`/`made_to_order`/`untracked`) | **R** — default `tracked` |
| On hand, per location | `inventory_items.on_hand_quantity` | **P** if `tracked` — ≥ 1 row |
| Safety stock | `inventory_items.safety_stock_quantity` | O |
| Reorder point | `inventory_items.reorder_point` | S |
| Bin | `inventory_items.bin_location` | O |
| Barcode | `product_variants.barcode` | O |

Quantity is never typed as an absolute here by a non-owner: the field posts an
adjustment through `src/lib/inventory/`, which writes an `inventory_transactions`
row of type `adjustment` or `recount`. `reserved_quantity` and
`available_quantity` are read-only (the latter is `GENERATED`).

#### Panel 5 — Variants

| Field | Column | Req |
| --- | --- | --- |
| Option axes | `product_options (name, position)` | **R** if > 1 variant |
| Option values | `product_option_values (value, position, swatch_media_id, material_id)` | **R** per axis |
| SKU | `product_variants.sku` | **R**, globally unique among live rows |
| Variant title | `product_variants.title` | O (`NULL` ⇒ derived from option values) |
| Position | `product_variants.position` | **R** (auto) |
| Active | `product_variants.is_active` | **R** — default `true` |
| Ring size | `product_variants.ring_size` `NUMERIC(6,2)` | S for RINGS |
| Length | `product_variants.length_mm` `NUMERIC(6,2)` | S for CHAINS / BRACELETS / NECKLACES |
| Gross weight | `product_variants.gross_weight_grams` | S (shipping) |
| Metal weight | `variant_materials.weight_grams` | **P** when any price is `metal_linked`/`hybrid` |
| HS code | `product_variants.hs_code` | S (customs; jewellery is commonly 7113) |
| Country of origin | `product_variants.country_of_origin` | S |
| Default variant | `products.default_variant_id` | S |

#### Panel 6 — Organization

| Field | Column | Req |
| --- | --- | --- |
| Primary category | `products.primary_category_id` | **P** (breadcrumb + canonical) |
| Categories | `product_categories (category_id, rank, is_primary)` | **P** — ≥ 1 |
| Collections (manual) | `product_collections (source='manual', rank)` | O |
| Collections (rule) | `product_collections (source='rule')` | read-only; shown with the matching rule |
| Tags | `product_tags` | S |
| Merchandising rank | `products.rank` | O |

#### Panel 7 — Jewellery attributes

| Field | Column | Req |
| --- | --- | --- |
| Stones | `product_stones (stone_id, is_primary, carat_weight, stone_count, cut, position)` | **P** for a stone-set piece |
| Primary stone | `product_stones.is_primary` | **P** when any stone is present (`idx_product_stones_primary`) |
| Materials | `variant_materials (material_id, weight_grams, is_primary)` | **P** — ≥ 1 per live variant |
| Primary material | `variant_materials.is_primary` | **P** (the one a metal-linked price computes from) |
| Specification fields | `product_attribute_values` | per `attributes.is_required` (§3.2) |

#### Panel 8 — SEO

| Field | Column | Req |
| --- | --- | --- |
| Meta title | `seo_metadata.meta_title` (`entity_type='product'`) | S (`NULL` ⇒ generated) |
| Meta description | `seo_metadata.meta_description` | S |
| Canonical override | `seo_metadata.canonical_url` | O |
| OG title / description | `seo_metadata.og_title` / `og_description` | O |
| OG image | `seo_metadata.og_media_id` | S (falls back to hero) |
| noindex / nofollow | `seo_metadata.robots_noindex` / `robots_nofollow` | O |
| JSON-LD override | `seo_metadata.structured_data_override` | O |

Every field is nullable on purpose: this is an override layer, and blank means
"generate it", never "publish an empty title" (02 §2.8).

#### Panel 9 — Publishing

| Field | Column | Req |
| --- | --- | --- |
| Status | `products.status` | **R** |
| Publish at | `products.published_at` | **P** |
| Version | `products.version` | system (optimistic lock) |
| Last edited by / at | `audit_logs` | read-only |
| Version history | `audit_logs` timeline + before/after diff | read-only |

#### Panel 10 — Markets

One row per active market, from `product_market_content`:

| Field | Column | Req |
| --- | --- | --- |
| Visible in market | `product_market_content.is_published` | **R** — default `true` |
| Market title / subtitle | `.title` / `.subtitle` | O (`NULL` ⇒ inherit base) |
| Market description | `.description_json` | O |
| Unavailable reason | `.unavailable_reason` | O — renders instead of add-to-bag |
| Rank override | `.rank_override` | O |

### 1.5 The publish gate

`publishProduct()` refuses when any **P** check above fails and returns the
failing list; the UI renders them as a checklist beside the Publish button. This
is a separate, deterministic function from the score — a score is advice, the gate
is a rule:

```ts
// src/lib/catalog/completeness.ts
export function getPublishBlockers(p: ProductForScoring): PublishBlocker[];
export function scoreProduct(p: ProductForScoring): CompletenessResult;
export function scoreProductSeo(p: ProductForScoring, marketCode: MarketCode): CompletenessResult;

export type CompletenessResult = {
  score: number;                 // 0–100, integer
  checks: {
    key: string;                 // stable, used by saved views and the CSV export
    label: string;
    weight: number;
    passed: boolean;
    hint: string | null;         // what to do, or null when passed
  }[];
};
```

### 1.6 Product completeness score

Fifteen checks, weights summing to exactly 100. Every check is a boolean over data
already loaded by the editor — no extra query, no partial credit, no heuristics.

| # | Check `key` | Passes when | Weight |
| --- | --- | --- | ---: |
| 1 | `title` | `products.title` trimmed length ≥ 3 | 8 |
| 2 | `description` | `description_json` plain-text word count ≥ 40 | 10 |
| 3 | `gallery` | ≥ 3 `product_media` rows with `role IN ('gallery','hero','lifestyle')` | 12 |
| 4 | `hero` | exactly one `product_media` with `role='hero' AND variant_id IS NULL` | 6 |
| 5 | `alt_text` | every `media` row joined through `product_media` has non-empty `alt_text` | 4 |
| 6 | `primary_category` | `primary_category_id IS NOT NULL` and a matching `product_categories` row exists | 6 |
| 7 | `stones` | ≥ 1 `product_stones` row **and** exactly one `is_primary` — or the product's primary category is in the non-stone set (`CHAINS`) | 6 |
| 8 | `materials` | every live variant has ≥ 1 `variant_materials` row and exactly one `is_primary` | 6 |
| 9 | `priced_all_markets` | an active `prices` row (variant-level or product-level) resolves for **every** `markets` row with `is_active` | 14 |
| 10 | `skus` | every live variant has a non-empty `sku` matching `SKU_PATTERN` (§2.6) | 5 |
| 11 | `stock` | every `inventory_policy='tracked'` live variant has ≥ 1 `inventory_items` row | 6 |
| 12 | `weights` | every live variant has `gross_weight_grams IS NOT NULL` | 4 |
| 13 | `tags` | ≥ 1 `product_tags` row | 3 |
| 14 | `required_attributes` | every `attributes` row with `is_required` whose category scope matches has a `product_attribute_values` row | 6 |
| 15 | `care` | `care_instructions_json` word count ≥ 15 | 4 |

`score = Σ weight(passed checks)`. Integer, 0–100, no rounding step and no
normalisation — the weights are chosen to sum to 100 so the number is directly
readable. Check 9 is the largest single weight because an unpriced market is the
one incompleteness that produces an indexable, unbuyable page (02 §4.1).

**Bands, used consistently in every surface:** `< 50` red · `50–79` amber ·
`≥ 80` green · `= 100` green with a check. Nothing is gated on a band.

**Where it is computed and stored.** `scoreProduct()` runs inside the product-save
transaction, immediately after `reindexProduct()` (02 §5.3), and again inside the
price-change and inventory-save transactions for the affected product. The result
is written to the product row, because the admin grid sorts and filters by it and
a per-row recomputation across a 50-row page is 50 subqueries.

> **SCHEMA ADDITION:** on `products` —
> `completeness_score SMALLINT NOT NULL DEFAULT 0 CHECK (completeness_score BETWEEN 0 AND 100)`,
> `completeness_checks JSONB NOT NULL DEFAULT '{}'::jsonb` (the failing `key → hint`
> map only, so the column stays small),
> `seo_score SMALLINT NOT NULL DEFAULT 0 CHECK (seo_score BETWEEN 0 AND 100)`,
> `seo_checks JSONB NOT NULL DEFAULT '{}'::jsonb`,
> `scored_at TIMESTAMPTZ NULL`.
> Plus `CREATE INDEX idx_products_completeness ON products (completeness_score, id) WHERE deleted_at IS NULL;`
> This is a denormalisation and it can go stale; `scored_at` is what makes that
> detectable, and the nightly `/api/cron/run-jobs` consistency pass rescores any
> product whose `updated_at > scored_at` and writes an `audit_logs` entry if the
> score moved — the same treatment `categories.materialized_path` gets (02 §2.4). One staleness
> source is not a product edit at all: **activating a market invalidates check 9 for
> every product simultaneously** and writes to no `products` row, so an
> `updated_at > scored_at` sweep never notices and the whole catalogue keeps a score
> that is now wrong. Activating or deactivating a `markets` row therefore enqueues a
> `bulk_edit` job that rescores the catalogue, in the same transaction as the market
> change. That job is enqueued **with the acting user's `jobs.created_by_user_id`**,
> never as a system actor: `bulk_edit` is `systemPermitted: false` (11 §3.2), so a
> `NULL` creator fails as `FORBIDDEN` in `jobs.error` rather than running with every
> permission. `runJob()` re-resolves that user at run time and the rescore runs with
> what they hold then (11 §3.3).

**Where it is surfaced.**

1. Sticky rail in the product editor: a ring with the number, the band colour, and
   the failing checks as a click-to-scroll list (each `hint` links to its panel).
2. A sortable column in `/admin/catalog/products`, with a `completeness_score`
   filter (`lt:50`, `lt:80`, `eq:100`) that saved views can persist
   (`saved_views.filters`). Both the sort and the filter are rows of the
   `products` whitelist in **11 §8.3** — the field is spelled
   `completeness_score`, its operators are `lt`/`lte`/`gt`/`gte`/`eq`, and it is
   served by `idx_products_completeness`. A filter field outside that whitelist is
   a `400`, never a silent fallback to an unfiltered list.
3. `/admin` dashboard tile: count of published products scoring `< 80`, linking to
   the filtered view.
4. A `completeness_score` column in the product CSV export, so a bulk audit is a
   spreadsheet sort.
5. `seo_score` gets its own column and filter beside it.

### 1.7 SEO completeness score

Nine checks, weights summing to 100, evaluated **per market** because
`seo_metadata.market_code` and `product_market_content.title` are per market.

| # | Check `key` | Passes when | Weight |
| --- | --- | --- | ---: |
| 1 | `meta_title` | resolved title (override or generated) length is 30–60 characters | 18 |
| 2 | `meta_description` | resolved description length is 70–160 characters | 18 |
| 3 | `body_depth` | `description_json` plain-text word count ≥ 150 | 12 |
| 4 | `og_image` | `seo_metadata.og_media_id` or a `role='hero'` image resolves, and is ≥ 1200×630 | 12 |
| 5 | `offer_valid` | an active `prices` row exists for this market **and** `getAvailability()` returns a band — i.e. the JSON-LD `Offer` will be complete | 12 |
| 6 | `image_alt` | every gallery image has `alt_text` | 10 |
| 7 | `slug_quality` | `slug` is lowercase, hyphen-separated, ≤ 60 chars, ≥ 2 segments, contains no UUID fragment or trailing digits-only segment | 8 |
| 8 | `indexable` | `seo_metadata.robots_noindex = false` **and** the product is published in this market | 6 |
| 9 | `headings` | `description_json` contains ≥ 1 `heading` node | 4 |

The stored `products.seo_score` is the score for
`NEXT_PUBLIC_DEFAULT_MARKET`; the editor's SEO panel computes and shows every
active market's score on read. **The trade-off, accepted:** one stored number
cannot represent two markets, and storing one column per market means a migration
per market — which contradicts 01 §1.4. Storing the default market's score keeps
the grid sortable with a fixed schema, and the per-market truth is one panel away.

> **NEEDS INPUT:** the target meta-title and meta-description templates (brand
> suffix, whether the stone or the metal leads). `src/lib/seo/` generates
> `{title} · {primaryStone} {primaryMaterial} | Millennium Designs` as a structural
> default; no tagline, claim or superlative is generated (hard rule 8).

### 1.8 Authorization for every mutation in this section

Hard rule 9 and 01 §2.1 put this in the service layer, not the editor. Two classes
of function appear in this document and they are not interchangeable:

- **Entry points** — `saveProduct`, `publishProduct`, `applyVariants`, `savePrice`,
  `saveCollection`, `saveCollectionRules`, `saveStone`, `saveMaterial`,
  `saveCategory`, `saveTag`, `saveAttribute`, `saveCuratedFacet`. Each is called
  from exactly one file under `src/server/actions/admin/`, and each of those files
  calls `requirePermission()` as its first statement after `parse` — asserted
  mechanically by `tests/unit/actions-authorized.test.ts` (01 §2.1). A server
  action is a plain POST endpoint addressed by a generated id; the admin layout's
  session check does not run for one.
- **Transaction-scoped helpers** — every function in this document whose first
  parameter is `tx`: `setAttributeValues`, `refreshCollection`,
  `refreshCollectionsForProduct`, `reindexProduct`, `ensureStoneFacets`,
  `enqueueJob`. They take no `Actor`, make no authorization decision, and are
  reachable only from an entry point that already made one. A `'use server'` export
  calling one directly is the same defect as a missing `requirePermission()`, and
  the boundary lint (01 §2.2) forbids `src/server/actions/**` from importing them.

Every key below is a row of the 72-key catalogue in **11 §1.3**, which is the sole
home of `src/lib/rbac/catalogue.ts`. Four spellings this section used earlier are
rejected there and `tests/unit/rbac-catalogue.test.ts` (11 §1.6) fails on any of
them appearing under `src/` or `docs/architecture/`.

> That grep needs one exemption, stated here so it is written once rather than
> discovered when the test goes red on the documents that record the rename: a
> line whose rejected spelling is **struck through** (`~~…~~`) is a correction
> note, not a use. The test skips struck spans and the `Renamed from` column of
> 11 §1.3, and skips nothing else — so a live `` `price.approve` `` anywhere still
> fails.

| Operation | Permission key | Rejected spelling |
| --- | --- | --- |
| Read the product editor and the admin catalogue lists | `product.read` | — |
| Create or edit a product, its media links, attribute values, category/collection/tag membership | `product.update` | — |
| Create, edit or retire variants, options and option values | `variant.update` | — |
| Attach, detach or reorder media on a product | `catalog.product_media` | — |
| Publish, schedule, archive or soft-delete a product | `product.publish` (soft delete: `product.delete`) | — |
| See the Pricing panel's values at all | `price.read` | — |
| See `prices.cost_minor` and every margin figure | `price.read_cost` | — |
| Write any `prices` row — editor, bulk edit or CSV import | `price.update` | — |
| Build or reject a `recalc_runs` preview | `price.recalc_preview` | — |
| **Approve and apply** a `recalc_runs` run | `price.approve_recalc` | ~~`price.approve`~~ |
| Enter a `metal_rates` row | `metal_rate.manage` | ~~`metal_rate.create`~~ |
| Adjust or recount stock; release a reservation by hand | `inventory.adjust` | ~~`inventory.update`~~ |
| Move stock between locations | `inventory.transfer` | — |
| Create or edit categories | `category.update` | ~~`catalog.settings.update`~~ |
| Create or edit stones | `stone.update` | ~~`catalog.settings.update`~~ |
| Create or edit materials | `material.update` | ~~`catalog.settings.update`~~ |
| Create or edit attributes and attribute options | `attribute.update` | ~~`catalog.settings.update`~~ |
| Create or edit collections and their rules | `collection.update` | — |
| Create or edit tags | `tag.update` | — |
| Create or edit `curated_facets` and `seo_metadata` overrides | `seo.manage` | ~~`catalog.settings.update`~~ |
| Change a `catalog.*` settings row (§8.1) | `settings.manage` | ~~`settings.update`~~ |

**`catalog.settings.update` split into five, and that is a decision, not a
rename.** One key covering stones, materials, attributes, categories and curated
facets means the role that may add a gemstone may also retarget the SEO surface —
11 §1.4 grants `seo.manage` to `content_editor`, who has no business editing
`materials.purity_ratio` because that column is a pricing input (§5.3). Five keys
is the shape the matrix needs; one was a convenience that collapsed two different
jobs.

**There is no `bulk_edit.*` permission and none is added** (11 §1.2 rule 2). A
bulk edit requires exactly the permission a single edit of that resource requires
— `product.update`, `price.update`, `inventory.adjust` — **re-checked per row
inside the `bulk_edit` job** against the queuing user's re-resolved permission
set. 01 §2.7 routing more than 50 rows to a job changes the execution model, not
the authorisation model, and a queued job that outlived its author's access must
not run with more than they had.

`price.read` is separate from `product.read`, and `price.read_cost` separate
again, because `prices.cost_minor` is supplier margin and Panel 3 renders it. For
an actor without the key the panel's **values are absent from the server
payload** — not hidden with CSS, not rendered disabled — which is the only version
of that sentence still true once someone opens the network tab.

---

## 2. Variant engine

### 2.1 Option types and option values

An **option** is an axis (`product_options.name`: `Metal`, `Size`, `Stone`); an
**option value** is a point on that axis (`product_option_values.value`:
`14K Yellow Gold`, `US 6`). Both are per product — there is deliberately no global
option library.

**The fork.** A shared `option_types` catalogue would let "Size" mean one thing
everywhere, give one canonical spelling of `14K Yellow Gold`, and make cross-product
faceting trivial. Per-product options let a merchandiser name an axis whatever a
given piece needs without touching a global list. **Decision: per product**, which
is what 02 §2.4 defines (`product_options.product_id` `ON DELETE CASCADE`). The
reason is that the global-catalogue benefits are already delivered by better
mechanisms here: cross-product metal filtering goes through `materials` via
`variant_materials` (which is typed and priceable, unlike a string), cross-product
size filtering goes through `product_variants.ring_size` / `length_mm` (which is
range-filterable, unlike a string), and stone is a first-class entity. A shared
option catalogue would be a third spelling of facts that already have two better
homes. The cost — a typo'd `14k yellow gold` on one product — is caught by
`product_option_values.material_id`, which is the link that actually matters, and
by the CSV import's validation preview.

**`material_id` on an option value is the load-bearing column.** It is what turns
the string `14K White Gold` into the `materials` row that `variant_materials`
weights, that `metal_rates` prices, and that the PLP filters on. An option axis
whose values carry `material_id` is a *metal* axis; the admin marks it so and
prefills `variant_materials` on variant generation.

### 2.2 Generating variants from an option combination

`generateVariants()` computes the Cartesian product of the selected values on each
axis and **proposes** the rows; the admin deselects combinations that do not exist
before anything is written.

```ts
// src/lib/catalog/variant.ts
export function proposeVariants(input: {
  productId: string;
  axes: { optionId: string; valueIds: string[] }[];
  existing: VariantSummary[];
}): ProposedVariant[];          // pure, no I/O — unit-testable

export async function applyVariants(input: {
  productId: string;
  expectedVersion: number;
  create: ProposedVariant[];
  update: { variantId: string; patch: VariantPatch }[];
  retire: string[];             // variant ids → is_active=false, then deleted_at if unsold
  actor: Actor;
}): Promise<Result<VariantSet, StaleWriteError | SkuConflictError>>;
```

Rules `applyVariants()` enforces, in the same transaction:

1. **Combination uniqueness.** Two variants of one product may not pin the same set
   of `(option_id, option_value_id)` pairs. `variant_option_values` has PK
   `(variant_id, option_id)`, which guarantees one value per axis but **not**
   combination uniqueness across variants. A service check under
   `SELECT … FOR UPDATE` cannot close this, and the reason is worth being exact
   about: the duplicate arrives as an `INSERT`, and a row lock can only lock rows
   that exist. Two concurrent `applyVariants()` calls — two admin tabs, or a CSV
   import racing an editor — each read the product's variants, each see no
   `14K White / US 8`, and each insert one. The product then carries two rows for
   one physical combination; the PDP matrix renders whichever `ORDER BY position`
   returns first, and the other quietly accumulates its own `prices` and
   `inventory_items` rows that no shopper can ever reach and no report explains.
   The fix is a constraint, not a longer lock:

   > **SCHEMA ADDITION:** on `product_variants` —
   > `option_signature TEXT NOT NULL DEFAULT ''`, written by `applyVariants()` as
   > the variant's `(option_id, option_value_id)` pairs sorted by `option_id` and
   > joined with `|`, plus
   > `CREATE UNIQUE INDEX idx_variants_option_signature ON product_variants (product_id, option_signature) WHERE deleted_at IS NULL AND option_signature <> '';`
   > The empty default covers the implicit single variant of an option-less product
   > (§1.1), which has no signature to compare. The service still checks first, so
   > the ordinary path returns a typed `VariantConflictError`; the index is the
   > floor under it, on the one table where a duplicate is invisible from the
   > storefront.
2. **Full coverage.** Every variant must pin a value on **every** axis. A variant
   missing an axis is unaddressable by the PDP selector and silently unreachable.
3. **Retire, never delete.** A variant that appears on any `order_items` row cannot
   be hard-deleted (`ON DELETE RESTRICT`). Deselecting it sets `is_active=false`;
   `deleted_at` is set only when no order line references it. Its SKU is freed only
   by the soft delete, because `idx_variants_sku_live` is partial.
4. **One-of-a-kind.** If `products.is_one_of_a_kind`, the axis set must produce
   exactly one combination; `idx_variants_ooak_single` refuses anything else at the
   database level (02 §2.4).
5. **Prices and stock are not generated.** A new variant starts with no `prices`
   row and no `inventory_items` row, and is therefore unbuyable until both exist.
   Auto-copying the product-level price onto a new variant is how a size-9 ring
   silently ships at the size-5 price.
6. **The Cartesian product is bounded.** `proposeVariants()` is pure and has no
   database to slow it down, which is precisely the hazard: five axes of eight
   values is 32,768 proposed rows, rendered into an admin table and posted back as
   one payload. It refuses above `MAX_PROPOSED_VARIANTS = 500`
   (`src/lib/config/constants.ts`), returning `TooManyCombinationsError` naming the
   axis cardinalities, and `applyVariants()` re-asserts the same ceiling
   server-side because the first check ran in a browser.

**The four error classes this section throws are declared in 11 §2.2, not here.**
`SkuConflictError` (`SKU_CONFLICT`, 409), `VariantConflictError`
(`VARIANT_CONFLICT`, 409), `TooManyCombinationsError` (`TOO_MANY_COMBINATIONS`,
422) and `AttributeValidationError` (`ATTRIBUTE_VALIDATION_FAILED`, 422 — §3.4)
each extend `AppError` directly, carry one `ErrorCode` and one `copy.error.*` key,
and are returned in a `Result` rather than thrown. All four are marked
**Safe = no**: each names an internal fact (a SKU, an axis cardinality, an
attribute key) and no customer-facing surface renders their message.

### 2.3 What lives on the variant

| Concern | Where | Note |
| --- | --- | --- |
| SKU | `product_variants.sku` | globally unique among live rows |
| Price | `prices (variant_id, market_code)` | `variant_id NULL` = product default |
| Inventory | `inventory_items (variant_id, location_id)` | none at all for `made_to_order`/`untracked` |
| Shipping weight | `product_variants.gross_weight_grams` | |
| Metal weight | `variant_materials.weight_grams` | the pricing input |
| Image | `product_media.variant_id` | non-null ⇒ shown when that variant is selected |
| Availability | derived, `getAvailability(variantIds, marketCode)` | never a stored boolean |
| Physical dimensions | `product_variants.ring_size`, `length_mm` | promoted out of EAV because they are range-filtered |
| Spec overrides | `product_attribute_values.variant_id` | non-null = variant-level override |

There is no `is_available` column anywhere, and no `in_stock` boolean. Both would
be a second source of truth for something `src/lib/inventory/` owns (01 §2.3), and
both would be stale the instant a reservation is taken.

### 2.4 Resolving the authoritative price for a (variant, market)

The authority is `resolvePrice()` in `src/lib/pricing/` (01 §2.3). Nothing in
`src/lib/catalog/` computes, adjusts or rounds an amount. The resolution path,
restating 02 §2.5 because the variant engine depends on it exactly:

```
resolvePrice({ variantId, marketCode, quantity, customerId?, couponCode?, at? })

 1. markets row for marketCode          → currency_code (composite FK guarantees the pair)
 2. prices WHERE variant_id = :variantId AND market_code = :market
           AND deleted_at IS NULL
           AND valid_from <= :at AND (valid_to IS NULL OR valid_to > :at)
    ├─ hit  → base row                                          -- idx_prices_active
    └─ miss ↓
 3. prices WHERE product_id = :productOfVariant AND variant_id IS NULL
           AND market_code = :market AND deleted_at IS NULL
           AND valid_from <= :at AND (valid_to IS NULL OR valid_to > :at)
    ├─ hit  → base row                                          -- idx_prices_active_product
    └─ miss → PriceUnavailableError   ◀── THERE IS NO STEP 4
 4. unitListMinor  = base.list_minor
    unitSaleMinor  = coalesce(base.sale_minor, base.list_minor)
 5. pricing_rules WHERE market_code = :market AND is_active
      AND (starts_at IS NULL OR starts_at <= :at)
      AND (ends_at   IS NULL OR ends_at   >  :at)
      AND scope matches (all | product | category | collection | material | stone
                         | tag | customer_group)
      ORDER BY priority ASC, scope narrowness DESC   -- idx_pricing_rules_live
      → first non-stackable wins; stackable ones compose in priority order
 6. coupon (couponCode) → coupon_amounts row for THIS currency, or inapplicable
 7. unitFinalMinor, lineSubtotalMinor = multiplyMoney(...)    -- one rounding, §1.10
 8. ResolvedPrice { …, priceSource, metalRateId, priceRecordId, computedAt }
```

**There is no step between 3 and the error.** No fallback to the other market, no
conversion, no "default currency" price. A variant with no price in a market is not
purchasable in that market, and the absence is representable (hard rule 2).

**`:at`, never `now()`, in every predicate above — three separate defects close
here.**

1. `pricing_rules.starts_at` and `ends_at` are both **nullable** (02 §2.5), and
   `now() BETWEEN starts_at AND ends_at` evaluates to `NULL` — that is, false —
   whenever either endpoint is `NULL`. An open-ended market-wide sale, which is the
   ordinary way a merchandiser creates one, would therefore apply to **nothing**,
   silently, while `/admin/pricing/rules` showed it active and green. The
   null-tolerant form above is the fix and there is no version of this that a test
   over a windowed rule would have caught.
2. Filtering `prices` on `valid_to IS NULL` alone reads the currently-open row
   whatever question was asked. That makes `resolvePrice({ at })` — the replay
   contract 01 §2.3 declares, that `/admin/pricing/history` and any pricing dispute
   depend on — answer "what does it cost today" to "what did it cost in March".
   The row's `valid_from`/`valid_to` window is the answer and has to be in the
   predicate.
3. 01 §2.2 makes `new Date()` a lint error anywhere under `src/lib/pricing/**`
   exactly so two calls a millisecond apart inside one checkout cannot disagree. A
   bare SQL `now()` re-introduces that per statement, from a place the lint rule
   cannot see. `at` is resolved once at the top of `resolvePrice()` (it is the same
   value returned as `computedAt`) and bound into every predicate below it.

**`valid_from` is never in the future.** `idx_prices_active` is partial-unique on
`(variant_id, market_code) WHERE valid_to IS NULL`, so a future-dated row cannot
coexist with the current one — a scheduled price change is not expressible as a
second `prices` row and must not be faked by writing one early, which would make it
live immediately under the old predicate and invisible under the new one. The price
service asserts `valid_from <= now()` on insert; a scheduled reprice is a `jobs`
row (`run_after`) that performs the ordinary close-and-insert at the scheduled
minute and purges `product:{id}`.

**A `metal_linked` or `hybrid` row changes nothing about the walk above, and an
earlier revision of this section said otherwise.** That revision replaced step 4
with the metal formula — "for a `metal_linked` or `hybrid` base row, step 4 is
instead the rule-2 expression, evaluated from `metal_rates`" — putting formula
evaluation **on the read path**, inside `resolvePrice()`. That is hard rule 6
violated in the document an engineer builds the catalogue from, and it is the most
expensive correction in this set because it does not surface until someone enters
a real silver rate: from that moment every page load reprices from the live rate,
and the admin approval hard rule 6 exists to require has nothing left to approve.
It has been removed. **04 owns pricing and its position stands:**

> **`resolvePrice()` reads `prices` and nothing else.** Steps 1–3 above are the
> whole of price *sourcing*, for all three values of `price_source`. A
> `metal_linked` or `hybrid` price is a **stored `prices` row exactly like a
> manual one** (04 §1.3; 11 §7.4). The formula runs in two places, neither of them
> a read: at authoring time (`setFormulaBinding({ applyNow: true })`, which
> additionally requires `price.approve_recalc`), and inside an **approved
> recalculation run**, which inserts a new `prices` row with `recalc_run_id` set
> (04 §3.3). `src/lib/pricing/resolve.ts` does not import
> `src/lib/pricing/formula.ts`, the boundary lint makes the import a CI failure,
> and `09 P11` exit criterion (b) is literally "`resolvePrice` never calls
> `evaluateFormula`".

The catalogue's stake in this is that **step 8's `priceSource` and `metalRateId`
are read off the row, not computed.** `prices.price_source`,
`prices.metal_rate_id`, `prices.metal_weight_grams` and the component snapshot
columns are a record of how that stored number was produced (04 §2.2), which is
what lets `/admin/pricing/history` explain a three-year-old price without any of
its inputs still existing. They are not inputs to a read.

**Where `hybrid`'s floor lives, since it is not on `prices`.** The floor is
`pricing_formula_market_terms.floor_minor` — a per-market term on the formula, in
that market's own currency — and the clamp's effect on a given price is recorded
on the price row as `floor_adjustment_minor` (04 §2.2, 11 §7.4). **There is no
`prices.floor_minor` column**; an earlier revision of this section added one with
two `CHECK`s (`chk_prices_hybrid_floor`, `chk_prices_floor_source`) and they are
**not migrated**, because under them every `hybrid` row 04 writes is unwritable —
04 never sets a `prices.floor_minor`. The definition of `hybrid` also comes from
04 and not from here: it is **the calculated base plus one signed, stored,
per-market adjustment** (`percent`, `fixed_delta` or `fixed_override`), enforced
by `chk_prices_hybrid_adjustment`, not "the metal-linked amount floored at a
minimum". `hybrid` is deferred out of release 1 behind
`settings['pricing.enable_hybrid']` (04 §2.5); `manual` and `metal_linked` are
what ship.

The USD and INR rows are computed from different `metal_rates` rows against
different per-market terms, and are never derived from one another (hard rule 2).

**Listing surfaces never call `resolvePrice` in a loop.** A PLP card, a collection
grid, a wishlist and the cart drawer call `getDisplayPrice(variantIds, marketCode)`
(cacheable, no customer, no coupon) or `resolvePriceBatch()` (uncached, one query).
`no-await-in-loop` plus the custom `no-service-call-in-map` rule make the loop a CI
failure (01 §2.3).

**`getDisplayPrice()` runs the same step 5 with one documented exclusion.** It
takes no `customerId` and its result is cached by `src/lib/catalog/` (01 §2.3,
§2.4), so it must skip every `pricing_rules` row with
`scope_type = 'customer_group'` — `AND scope_type <> 'customer_group'`, in the
query, not in a caller. Without the exclusion the cached entry is whatever the
first requester's group produced and is then served to everyone (the wrong-number-
at-the-till failure 01 §2.4 bans caching `resolvePrice` to prevent); with it, a
group customer sees the public price on the card and their own price in the bag,
which is the intended and explicable behaviour. `tests/integration/display-price-group.test.ts`
asserts a group-scoped rule moves `resolvePrice` and does not move
`getDisplayPrice`.

### 2.5 Presenting a variant that cannot be bought

Two independent reasons, two different presentations, never conflated.

| Condition | Detected by | PDP | PLP card | Structured data |
| --- | --- | --- | --- | --- |
| **Out of stock** (`sold_at IS NULL` and `sellable(variant, market) = 0`) | `getAvailability()` → `'out'` | Option value greyed with a strikethrough; add-to-bag replaced by "Notify me", which writes a **`back_in_stock_requests`** row — see below | Badge "Out of stock", card still clickable | `availability: OutOfStock` |
| **Low stock** | band `'low'` (`1 ≤ sellable ≤ AVAILABILITY_LOW_THRESHOLD`, whose value is `settings['catalog.low_stock_threshold']`, seeded `2`) | "Only N left" beside add-to-bag — **never on a one-of-a-kind piece**, where "only 1 left" is a redundancy that reads as a pressure tactic | no badge | `InStock` |
| **Made to order** | `inventory_policy='made_to_order'` | "Made to order · ships in N days" from `lead_time_days` | Badge "Made to order" | `PreOrder` |
| **Sold** (one of a kind, `products.sold_at IS NOT NULL`) | band `'sold'` (§8.1) | "SOLD" plate over the gallery; add-to-bag removed, not disabled; "Enquire about a similar piece" links to the contact page | Badge "SOLD", desaturated card | `SoldOut`, and `robots_noindex` per the setting |
| **No price in this market** | `PriceUnavailableError` from step 3 | No price, no add-to-bag, "Not available in this market" | **Card is not rendered at all** — the PLP's price `EXISTS` already excluded it (02 §4.1) | page is `noindex` |
| **Hidden in this market** | `product_market_content.is_published = false` | 404 | not rendered | absent from the market's sitemap |
| **Admin-stated reason** | `product_market_content.unavailable_reason` | The reason text replaces add-to-bag; price still shown | Card rendered, badge from the reason | `InStoreOnly` |
| **Variant deactivated** | `product_variants.is_active = false` | Option value not offered at all | — | — |

**`sellable(variant, market)` is 05 §1.1's definition verbatim** — on-hand minus
reserved minus safety stock, summed over the locations that fulfil that market via
`market_locations` — and nothing in `src/lib/catalog/` recomputes it. The five
bands and their predicates are canonical in **11 §7.1**.

**"Notify me" writes a `back_in_stock_requests` row, not a `wishlist_items` row,
and this section previously said otherwise.** A `wishlist_items` row requires a
`customer_id` (02 §2.7: guest wishlists are not modelled), so the wishlist
mechanism silently drops every signed-out shopper — which is most of them on an
out-of-stock PDP — and it conflates "I want to be told when this is back" with "I
am saving this", which are different consents and need different unsubscribe
handling. The table is 08 §4.4's, indexed by `idx_bisr_variant`, which is what the
inventory transaction queries when stock crosses `out → in_stock`. This section
writes the row; 05 owns the send.

**Availability is never baked into the ISR shell.** The add-to-bag region is a
`<Suspense>` boundary whose child calls `getAvailability([variantId], marketCode)`
with `cache: 'no-store'` (01 §2.4). The band is still only a display hint; 01 §2.5
is the authority, and a customer who adds a just-sold piece gets
`InsufficientStockError` at checkout, before any payment intent exists.

**Market availability is location-derived, not a flag.** `getAvailability()` takes
`marketCode` and sums `on_hand - reserved` over the locations that fulfil that
market via `market_locations`. A piece held only at `IN-MAIN` is `'out'` for US
even though a row says `on_hand_quantity = 1` (01 §2.3).

**`'sold'` is keyed on `products.sold_at`, not on `available_quantity`, and the
difference is thirty minutes of a public lie.** `available_quantity` is
`on_hand − reserved` (02 §2.6), so a one-of-a-kind piece sitting inside another
shopper's live checkout reservation has `on_hand = 1`, `reserved = 1`,
`available = 0`. Defining `'sold'` as `available_quantity <= 0` would put a SOLD
plate over a piece nobody has bought, remove its add-to-bag, drop it out of the
market's sitemap under the default `visible_noindex` policy (§8.1) — and then
silently undo all of it thirty minutes later when the reservation expires, having
lost every visitor in between. The predicates, stated once:

| Band | One-of-a-kind | Everything else |
| --- | --- | --- |
| `'sold'` | `products.sold_at IS NOT NULL` — the unit was committed and physically left | never returned |
| `'out'` | `sold_at IS NULL` **and** `sellable(variant, market) = 0` — which includes "reserved by someone else right now", and also a piece seeded at `ooak_default_quantity = 0` that was never stocked | same |

`getAvailability()` therefore reads `products.sold_at` and
`products.is_one_of_a_kind` alongside the inventory rows; both sit on the product
the variant already joins through, so this is one join and not a second query.

**`hreflang` follows purchasability, not market activation.** A market in which
the product is unpriced (step 3's `PriceUnavailableError`) or hidden
(`product_market_content.is_published = false`) is **omitted from the product's
`hreflang` alternates and from that market's sitemap**, rather than advertised as
an alternate that resolves to a `noindex` page or a 404. `src/lib/seo/` builds the
alternate set from the same per-market resolution the PDP already ran, never from
`listActiveMarkets()`.

### 2.6 Impossible combinations in the option UI

The PDP ships a **variant matrix** computed server-side and rendered into the
initial HTML — no round trip, and no client-side price or stock arithmetic.

```ts
// src/lib/catalog/variant.ts
export async function getVariantMatrix(
  productId: string, marketCode: MarketCode,
): Promise<VariantMatrix>;

export type VariantMatrix = {
  axes: { optionId: string; name: string; position: number;
          values: { valueId: string; value: string; position: number;
                    swatchUrl: string | null; materialId: string | null }[] }[];
  // one entry per LIVE variant: the axis→value map, plus its purchasability
  variants: {
    variantId: string;
    sku: string;
    key: string;                    // valueIds joined by '|' in axis position order
    valueIds: Record<string, string>;
    priced: boolean;                // an active prices row resolves in this market
    price: PricePresentation | null;// getDisplayPrice() → Money strings, never bigint (01 §2.6)
    mediaId: string | null;
  }[];
  // No availability on this type, deliberately — see below.
};
```

**There is deliberately no `band` on this type, and putting one there is the
easiest way in this document to sell a unique piece twice.** `getVariantMatrix()`
is called from the PDP, which is ISR for 900s and CDN-served (01 §1.3), so every
field on this object is baked into a shared HTML document for up to fifteen
minutes. Structure (`axes`, `valueIds`, `priced`) and display price belong there —
each changes only on a write that purges `product:{id}`. Stock does not: a
one-of-a-kind piece that sold ninety seconds ago would read "In stock" to every
visitor for the rest of the window, which is the precise failure 01 §2.4 describes
and the reason availability is streamed rather than baked. So the matrix is the
*shape* of the selector and nothing else. The band for the selected variant comes
from the `<Suspense>` boundary in §2.5 (`getAvailability([variantId], marketCode)`,
`cache: 'no-store'`); the strike-through state of the *other* chips is filled in
after hydration from one batched
`GET /api/catalog/availability?variantIds=…` (`no-store`, 01 §3), and until it
resolves the chips render un-struck rather than wrong. `price` is safe to bake
because `getDisplayPrice()` carries no customer and no coupon, which is the whole
reason 01 §2.3 splits it from `resolvePrice()`.

The client component holds only the current selection and does one lookup:

- A value is **absent** from the axis when no live variant pins it at all — a 14K
  Rose Gold swatch is not rendered for a product that has none.
- A value is **disabled** when, given the selections already made on *other* axes,
  every variant containing it is `is_active = false` or `priced = false`. It is
  disabled, not hidden, so the shopper can see that size 5 exists in yellow gold
  when they have white gold selected — hiding it makes the selector appear to
  change shape as you click, which reads as a bug.
- A value is **struck through** when the resulting variant exists and is priced but
  its band is `'out'` or `'sold'`.
- Selecting a disabled value on an axis **re-solves the other axes**: picking
  "14K Rose Gold" when the current size has no rose-gold variant moves the size
  selection to the nearest available one and says so inline, rather than landing on
  an empty state.

This is the whole reason `getVariantMatrix` returns the full variant list and not a
per-axis availability array: an availability array cannot express "size 9 exists in
yellow but not white", which is the exact case the next section works through.

**Index support:** `idx_variant_option_values_value (option_value_id, variant_id)`
answers "which variant is 14K Rose, size 6" (02 §2.4);
`idx_variants_product (product_id, position) WHERE deleted_at IS NULL` drives the
matrix build; prices come from `getDisplayPrice()`'s batch form in one query.

### 2.7 Worked example — a labradorite ring, sizes 5–9, 14K yellow and white gold

> The product below is an **illustrative shape only**, with obviously synthetic
> round-number prices. It asserts nothing about the client's real catalogue,
> pricing or stock (hard rule 8).

#### Rows

`products`

| column | value |
| --- | --- |
| `id` | `0192f3a1-…` (UUIDv7) |
| `slug` | `labradorite-cabochon-ring` |
| `title` | `Labradorite Cabochon Ring` |
| `status` / `published_at` | `active` / `2026-09-01T10:00:00Z` |
| `primary_category_id` | → `categories.slug = 'rings'` |
| `is_one_of_a_kind` | `false` |
| `default_variant_id` | → the 14K Yellow / US 7 variant |

`product_options`

| id | name | position |
| --- | --- | ---: |
| `opt-metal` | `Metal` | 0 |
| `opt-size` | `Size` | 1 |

`product_option_values`

| id | option_id | value | material_id | position |
| --- | --- | --- | --- | ---: |
| `ov-14ky` | `opt-metal` | `14K Yellow Gold` | → `materials.slug='14k-yellow-gold'` | 0 |
| `ov-14kw` | `opt-metal` | `14K White Gold` | → `materials.slug='14k-white-gold'` | 1 |
| `ov-s5` … `ov-s9` | `opt-size` | `US 5` … `US 9` | `NULL` | 0…4 |

`product_stones` — one row: `stone_id → labradorite`, `is_primary=true`,
`carat_weight=4.250`, `stone_count=1`, `cut='Oval cabochon'`, `position=0`.

`product_variants` — the 2 × 5 Cartesian product, 10 rows. `variant_materials`
carries one row per variant (`material_id` from the metal axis,
`weight_grams` = 3.100 for sizes 5–6, 3.400 for 7, 3.700 for 8–9,
`is_primary=true`) — the weight differs per size, which is precisely why metal
weight lives on the **variant** and not the product (02 §2.4).

#### SKU pattern

```
MD-<TYPE>-<STONE>-<METAL>-<SIZE>
   │       │        │       └─ zero-padded 2-digit US ring size, or 'NA'
   │       │        └────────── materials.sku_token, 4 chars: 14KY | 14KW | 14KR | SS92
   │       └─────────────────── stones.sku_token, 3 chars: LAB | MST | AME | BTZ | LAR | GAR | PRL
   └─────────────────────────── categories.sku_token, 3 chars: RNG | CHN | PND | BRC | EAR | NCK
```

> **SCHEMA ADDITION:** `categories.sku_token CHAR(3) NULL`,
> `stones.sku_token CHAR(3) NULL`, `materials.sku_token CHAR(4) NULL`, each with
> `CHECK (<col> = upper(<col>))` and a partial unique index
> `WHERE <col> IS NOT NULL AND deleted_at IS NULL`. Without these the SKU generator
> either hardcodes a `slug → token` map in TypeScript (hard rule 1: a new stone
> would need a deploy) or derives the token from the slug's first three letters,
> which collides `garnet`/`garnet-rhodolite` on day one.

```ts
// src/lib/catalog/sku.ts
export const SKU_PATTERN = /^MD-[A-Z]{3}-[A-Z]{3}-[A-Z0-9]{4}-(\d{2}|NA)(-[A-Z0-9]{2})?$/;
export const SKU_NO_STONE = 'NST';    // reserved stones.sku_token
export const SKU_NO_METAL = 'NMTL';   // reserved materials.sku_token
export async function buildSku(input: {
  categoryId: string; stoneId: string | null;
  materialId: string | null; ringSize: number | null;
}): Promise<string>;   // appends -02, -03 … on collision against live SKUs
```

**Every segment is mandatory, so the absent ones need reserved tokens.** The
pattern has no optional stone or metal group, and completeness check 10 requires
every live variant's SKU to match it — so without a sentinel, a plain chain (no
stone; check 7 explicitly exempts `CHAINS` from the stone requirement) or a
leather, cord or textile piece (no metal) can never produce a conforming SKU and
sits permanently below 100 on a check nobody can clear. `SKU_NO_STONE = 'NST'` and
`SKU_NO_METAL = 'NMTL'` are reserved values of `stones.sku_token` and
`materials.sku_token`; the partial unique index on each column stops a real row
from claiming them, and the seed writes neither.

**Collision resolution happens inside the transaction, and retries.**
`buildSku()` probes live SKUs for `-02`, `-03`, …, but two concurrent
`applyVariants()` calls can both settle on `-02`; `idx_variants_sku_live` rejects
the second. That is why `applyVariants()` declares `SkuConflictError`, and why its
caller retries the whole transaction once with a re-probed suffix before surfacing
it — a unique violation on a generated identifier is a retry, not a user error.

The generated set, and the two facts that make the matrix non-trivial — **US 9 is
not made in white gold** (a deselected combination, so only 9 variants exist), and
**14K White / US 8 is out of stock**:

| # | SKU | Metal | Size | `variant_materials.weight_grams` | `inventory_items.on_hand` (US-MAIN) |
| ---: | --- | --- | --- | ---: | ---: |
| 1 | `MD-RNG-LAB-14KY-05` | Yellow | US 5 | 3.100 | 2 |
| 2 | `MD-RNG-LAB-14KY-06` | Yellow | US 6 | 3.100 | 3 |
| 3 | `MD-RNG-LAB-14KY-07` | Yellow | US 7 | 3.400 | 4 |
| 4 | `MD-RNG-LAB-14KY-08` | Yellow | US 8 | 3.700 | 1 |
| 5 | `MD-RNG-LAB-14KY-09` | Yellow | US 9 | 3.700 | 1 |
| 6 | `MD-RNG-LAB-14KW-05` | White | US 5 | 3.100 | 2 |
| 7 | `MD-RNG-LAB-14KW-06` | White | US 6 | 3.100 | 1 |
| 8 | `MD-RNG-LAB-14KW-07` | White | US 7 | 3.400 | 2 |
| 9 | `MD-RNG-LAB-14KW-08` | White | US 8 | 3.700 | **0** |
| — | *(no row)* | White | US 9 | — | — |

#### Prices

Four `prices` rows, all independent, no derivation between any two:

| # | `product_id` | `variant_id` | `market_code` | `currency_code` | `list_minor` | `price_source` |
| ---: | --- | --- | --- | --- | ---: | --- |
| P1 | ring | `NULL` | `US` | `USD` | `95000` ($950.00) | `manual` |
| P2 | ring | `NULL` | `IN` | `INR` | `7900000` (₹79,000.00) | `manual` |
| P3 | ring | `MD-RNG-LAB-14KW-08` | `US` | `USD` | `98000` ($980.00) | `manual` |
| P4 | ring | `MD-RNG-LAB-14KY-09` | `US` | `USD` | `99000` ($990.00) | `manual` |

Note what is **not** there: there is no INR row for variants 8 or 9. That is not an
omission to be repaired by conversion — it is the correct state, and it means those
two variants fall through to P2, the INR product default. If P2 also did not exist,
they would be unbuyable in India and the PLP's price `EXISTS` would drop the card.

#### Resolution path — `MD-RNG-LAB-14KW-08` in the US market

```
resolvePrice({ variantId: 'v-14kw-08', marketCode: 'US', quantity: 1 })
 1. markets 'US' → currency 'USD'
 2. prices WHERE variant_id='v-14kw-08' AND market_code='US'
      AND valid_to IS NULL AND deleted_at IS NULL          → P3  ✅ HIT — stop here
 3. (skipped)
 4. unitListMinor = 98000n ; unitSaleMinor = 98000n     (P3.sale_minor IS NULL)
 5. pricing_rules for US: none active                   → no adjustment
 6. no coupon
 7. unitFinalMinor = 98000n ; lineSubtotalMinor = 98000n
 8. ResolvedPrice { currencyCode:'USD', unitListMinor:98000n, unitSaleMinor:98000n,
                    unitFinalMinor:98000n, priceSource:'manual', metalRateId:null,
                    priceRecordId:'P3', computedAt: … }
 → toPricePresentation(...) → formatMoney → "$980.00"    (en-US from markets.locale)
```

#### Resolution path — the same variant in the India market

```
 2. prices WHERE variant_id='v-14kw-08' AND market_code='IN'   → MISS
 3. prices WHERE product_id=ring AND variant_id IS NULL
           AND market_code='IN'                                → P2  ✅
 4. unitListMinor = 7900000n
 ...
 → formatMoney(..., markets.locale='en-IN') → "₹79,000.00"     (not "₹7,90,000" — the
   lakh grouping is Intl's job, and the number here is 79 thousand)
```

The US and India numbers are unrelated. Editing P3 to `$1,020.00` writes a new
`prices` row and closes P3; P2 is untouched, its `valid_to` stays `NULL`, and no
column on either row references the other.

#### Matrix behaviour on the PDP

Initial render: `default_variant_id` = `MD-RNG-LAB-14KY-07` → Metal `14K Yellow
Gold`, Size `US 7`, `$950.00` (P1, the product default), band `in_stock`.

| Shopper action | Matrix outcome |
| --- | --- |
| Selects Size `US 9` | Variant 5, `priced=true` via **P4** → `$990.00`. Both metal swatches still rendered, but **White Gold is disabled**: no live variant pins `(ov-14kw, ov-s9)`. |
| Then clicks the disabled White Gold swatch | Size re-solves to the nearest available white-gold size, `US 8`; the size chip moves and an inline note reads "US 9 is not available in 14K White Gold". |
| Lands on White / US 8 | Variant 9, `priced=true` via **P3** → `$980.00`, band `out` → size chip struck through, add-to-bag replaced by "Notify me". |
| Switches market to India (`/in/products/labradorite-cabochon-ring`) | Same matrix, rebuilt for `marketCode='IN'`: variant 9 resolves through P2 → `₹79,000.00`. Band is recomputed over the locations that fulfil IN (`market_locations`), so a piece sitting only at `US-MAIN` reads `out` in India regardless of its US band. |

Two customers who both reach White / US 7 (`on_hand = 2`) and press Pay in the same
second both succeed — there are two units. If it had been one, the
`SELECT … FOR UPDATE` in `reserveStock()` and
`CHECK (reserved_quantity <= on_hand_quantity)` decide it, and the loser gets
`InsufficientStockError` before any payment intent exists (01 §2.5).

---

## 3. Flexible attribute system

### 3.1 What belongs here and what does not

`attributes` / `attribute_options` / `product_attribute_values` hold the **long
tail of specification fields** the client will add over the next five years without
a migration: `clasp_type`, `setting_style`, `chain_width_mm`, `bezel`, `finish`.

Four things are explicitly **not** attributes, because each already has a typed
home that is faster, safer or both:

| Not an attribute | Lives in | Why |
| --- | --- | --- |
| Stone | `stones` + `product_stones` | It has pages, copy, a swatch and its own discovery surface (§4) |
| Metal / purity | `materials` + `variant_materials` | It carries a weight and drives metal-linked pricing (§5) |
| Ring size, length | `product_variants.ring_size`, `length_mm` | Range-filtered; a range query over EAV is the slowest thing in a catalogue (02 §2.4) |
| **Money of any kind** | `prices` | An amount must sit on the same row as its currency and be paired to a market by composite FK (02 §1.1). An EAV "currency" attribute would be an amount with no market, no currency FK, no `_minor` suffix and no `CHECK` — and the first thing anyone would do with it is show it to a shopper. **The `currency` attribute type is refused.** A price is a `prices` row; an internal cost is `prices.cost_minor`; a non-price number with a unit (carat, mm, grams) is a `number` attribute with `attributes.unit`. |

### 3.2 Attribute types

The canonical enum is `attribute_data_type` = `text | long_text | number |
boolean | select | multi_select | date | composite` (02 §1.9). The nine types the
admin UI offers map onto it like this — the UI vocabulary is richer than the
storage vocabulary on purpose, because a "decimal" and a "measurement" differ only
in presentation and validation, and two more enum values would be two more
`ALTER TYPE` migrations for zero query benefit.

| Admin type | `data_type` | Value column | Validation | Filterable |
| --- | --- | --- | --- | --- |
| Text | `text` | `value_text` | `max_length` | no |
| Long text | `long_text` | `value_text` | `max_length` | no |
| Number (integer) | `number` | `value_numeric` | `value_min`/`value_max`, `decimal_places = 0` | yes (range) |
| Decimal | `number` | `value_numeric` `NUMERIC(14,4)` | `value_min`/`value_max`, `decimal_places` 1–4 | yes (range) |
| Measurement | `number` | `value_numeric` | as Decimal, **plus** `attributes.unit NOT NULL` (`mm`, `ct`, `g`) — rendered as `4.25 ct` | yes (range) |
| Boolean | `boolean` | `value_bool` | — | yes |
| Select | `select` | `option_id` → `attribute_options` | option must belong to this attribute | yes |
| Multi-select | `multi_select` | `option_id`, one row per chosen option | as Select | yes |
| Date | `date` | `value_date` | `value_min`/`value_max` as ISO dates | no |
| ~~Currency~~ | — | — | **refused**, §3.1 | — |
| Composite | `composite` | `value_json` | block-registry-style Zod schema | **never** (02 §1.8) |

`chk_pav_one_value` (`num_nonnulls(...) = 1`) makes a row with two value shapes
unwritable, which is what keeps the typed columns trustworthy.

> **SCHEMA ADDITION:** on `attributes` —
> `scope TEXT NOT NULL DEFAULT 'product' CHECK (scope IN ('product','variant','both'))`,
> `is_required BOOLEAN NOT NULL DEFAULT false`,
> `value_min NUMERIC(14,4) NULL`, `value_max NUMERIC(14,4) NULL`,
> `decimal_places SMALLINT NULL CHECK (decimal_places BETWEEN 0 AND 4)`,
> `max_length INTEGER NULL CHECK (max_length BETWEEN 1 AND 10000)`,
> `help_text TEXT NULL`,
> `CHECK (chk_attributes_range: value_min IS NULL OR value_max IS NULL OR value_max >= value_min)`.
> `product_attribute_values.variant_id` already allows a variant-scoped value, but
> nothing in the schema declares *which* attributes may be variant-scoped, so the
> admin form cannot decide whether to render a field once or once per variant, and
> `is_required` has no home at all — completeness check 14 and the publish gate both
> read it.

### 3.3 Which entity types an attribute applies to

Two orthogonal scopes, both declared on the `attributes` row:

1. **Entity scope** — `attributes.scope` above: `product` (one value, `variant_id
   IS NULL`), `variant` (one value per variant), or `both` (a product-level default
   that a variant row may override). `saveProduct()` rejects a value whose
   `variant_id` nullability contradicts the scope.
2. **Category scope** — `attributes.applies_to_category_id` (02 §2.4), `NULL` =
   every category. The match is **subtree-inclusive**: an attribute scoped to
   `RINGS` applies to every descendant, resolved with
   `categories.materialized_path LIKE :path || '%'`, which is the same index range
   scan the PLP uses (`idx_categories_path`) rather than a recursive CTE.

**The limitation, named rather than papered over.** `applies_to_category_id` is a
single column, so an attribute that belongs to both `RINGS` and `BRACELETS` but not
`CHAINS` cannot be expressed except by scoping it globally and relying on
`is_filterable` to control exposure. That is acceptable at launch because the
launch attribute set is either global (finish, setting) or leaf-specific (clasp
type). The expand path, if the client hits it, is one join table
(`attribute_categories (attribute_id, category_id)` PK on both) and a change to one
resolver — no data rewrite and no column drop; it is recorded here so it is not
rediscovered as a redesign.

Attributes do **not** apply to stones, materials, collections or categories. Those
are typed entities with their own columns; an EAV layer over them would be a second
place to put `hardness_mohs` and `purity_ratio`.

### 3.4 Storage and validation

Values are written only by `src/lib/catalog/attributes.ts`, inside the product-save
transaction:

```ts
export async function setAttributeValues(tx: Tx, input: {
  productId: string;
  values: { attributeId: string; variantId: string | null;
            optionIds?: string[]; text?: string; numeric?: string;
            bool?: boolean; date?: string; json?: unknown }[];
}): Promise<Result<void, AttributeValidationError>>;
```

Validation is a **Zod schema built at runtime from the `attributes` row**, because
a `CHECK` cannot read `attributes.data_type` from another row (02 §5.2):

```ts
export function attributeSchema(a: Attribute): ZodTypeAny;
// number    → z.coerce.number().min(a.value_min ?? -Infinity).max(...).multipleOf(10 ** -dp)
// select    → z.string().uuid().refine(id => optionIds.has(id))
// multi     → z.array(that).min(a.is_required ? 1 : 0)
// text      → z.string().trim().max(a.max_length ?? 500)
// date      → z.coerce.date().min(...).max(...)
// composite → the registry schema for a.key
```

The same schema instance is reused by the server action, the CSV import
validation preview (`import_job_rows.status = 'invalid'` with the Zod message), and
the admin form's client-side hints — one definition of "valid" (01 §1.1).

Writes are **delete-then-insert per (product, attribute, variant scope)**, not
upsert-per-row, because `multi_select` legitimately produces N rows and a diff
against N rows is where duplicate-option bugs live.

### 3.5 Attributes as storefront filters

An attribute becomes a facet when `is_filterable = true`, which
`chk_attributes_filterable_type` restricts to `select`, `multi_select`, `boolean`
and `number` — the four types with a sargable column. There is no
`is_filterable` path for `text`, because a free-text facet is either a `LIKE '%…%'`
scan or a facet with 800 values, and both are the same bug.

The facet URL is `?attr_<key>=<option-value>` (`/rings?attr_setting_style=bezel`),
parsed by a Zod schema that resolves `<key>` against live `attributes` rows **and
each `<option-value>` to an `attribute_options.id`** through
`uq(attribute_id, lower(value))` — the predicate below compares option *ids*, so a
value that does not resolve is dropped with its key rather than widening the query
to everything. An unparseable facet is ignored, never a 500 and never an unfiltered
listing pretending to be filtered. Any URL carrying `searchParams` is
dynamic, `no-store`, `noindex, follow`, canonical → the unfiltered URL (01 §1.3).
The indexable version of a facet is a `curated_facets` row
(`facet_type='attribute_option'`) at `/rings/bezel-set`.

The filter predicate is an indexed `EXISTS`, appended to the §4.1 PLP query:

```sql
AND EXISTS (SELECT 1 FROM product_attribute_values pav
            WHERE pav.product_id = p.id
              AND pav.attribute_id = $n AND pav.option_id = ANY($m))   -- idx_pav_filter
```

Counts come from **one** statement in `/api/catalog/facets`, and the set each
dimension counts over is deliberately **not** the fully-filtered set. A dimension's
own selection is excluded from its own counts — leave-one-out — because counting a
dimension over a set already narrowed by that dimension makes every unselected
option in it read `0`: select Moonstone and Amethyst shows `(0)`, so the shopper
concludes there are no amethyst rings, and a multi-select facet can never be built
up past its first chip. Concretely: one `base` CTE carrying the non-facet
predicates (category subtree, publication, per-market visibility, the price
`EXISTS`, the search term), then one `GROUP BY` per dimension over `base` with
**the other** dimensions' `EXISTS` clauses applied and its own omitted. One
statement, one pass over `base`, N small aggregates — never one query per facet
(02 §4.1).

### 3.6 Keeping EAV filtering fast — and the trade-off accepted

Five mechanisms, in the order they matter:

1. **Promotion out of EAV.** Anything range-filtered is a real column
   (`ring_size`, `length_mm`), anything with its own page is an entity (`stones`,
   `materials`). EAV holds only equality-filtered selects and booleans.
2. **`idx_pav_filter (attribute_id, option_id, product_id) WHERE option_id IS NOT NULL`**
   — leading equality columns, `product_id` last, so the facet probe is index-only
   and never touches the heap. `idx_pav_numeric (attribute_id, value_numeric)
   WHERE value_numeric IS NOT NULL` does the same for numeric ranges.
3. **`EXISTS`, never `JOIN`.** An `IN (SELECT …)` or a join against a table with
   N rows per product multiplies the driving row set and then needs a `DISTINCT`;
   an `EXISTS` short-circuits on the first matching index entry.
4. **One counting pass.** `/api/catalog/facets` computes every dimension's counts
   in a single statement over one CTE.
5. **A hard ceiling with a measurement.** 01 §1.6's escape hatch applies verbatim:
   if p95 for the filtered PLP exceeds 300ms, or published products exceed 25,000,
   the facet layer moves — and the first move is **not** an external search engine
   but a materialised `product_facets (product_id, attribute_id, option_id,
   category_id, market_code)` table refreshed by the existing `collection_refresh`
   job machinery, which collapses every facet probe to one index scan on one table.
   That table is not built at launch because it is a second copy of data that is
   currently one index scan away, and a second copy that nobody is watching goes
   stale.

**The trade-off accepted, stated plainly:** typed EAV columns cost **write
amplification** — every product save rewrites its attribute rows, then
`reindexProduct()`, then `refreshCollection()` for any collection with an
`attribute` rule, then `scoreProduct()`, all inside one transaction. A product save
is therefore measurably slower than a single-row `UPDATE`, and a 2,000-row CSV
import is a job, not a request. We take that because the alternative — a fixed
column per specification field — means a migration, a code review and a deploy
every time the client wants to record "clasp type", which is exactly the thing they
will want to do fifty times over five years and exactly the thing hard rule 1 says
must not require a deploy. Reads are what the storefront does ten thousand times an
hour; writes are what an admin does forty times a day.

---

## 4. Stone as a first-class entity

### 4.1 The model

`stones` (02 §2.4) is an entity with a slug, a URL, a hero image, a swatch, a
colour, hardness, an `is_lab_grown` flag, publication state and soft delete — not a
tag, not an attribute option. The seven launch stones (00-CONTEXT §6) are seeded
with **name, slug, rank and `is_published=false` only**; every copy field ships
empty and the stone page hides the section rather than inventing gemmological or
sourcing facts.

`product_stones` is the many-to-many, and the join row carries the facts that
belong to the **pairing**, not to either side: `carat_weight NUMERIC(8,3)`,
`stone_count SMALLINT`, `cut TEXT`, `is_primary BOOLEAN`, `position SMALLINT`.
That is why this is a table and not an array column: "0.85ct of labradorite in
three oval-cut stones" is a fact about this ring's labradorite, not about
labradorite and not about the ring.

`idx_product_stones_primary ON product_stones (product_id) WHERE is_primary`
enforces at most one primary stone per product in the database, so "which stone is
this piece *about*" has exactly one answer regardless of which admin screen wrote
last. The primary stone drives: the PDP subject line, the `sku_token` in §2.6,
stone-led ranking (§4.2), and the LAB GROWN DIAMONDS attribute panel (§8.3).

`ON DELETE RESTRICT` on `product_stones.stone_id` means a stone in use cannot be
hard-deleted — it is soft-deleted, which keeps `/stones/labradorite` resolving.

### 4.2 Stone-led discovery: `/stones/<slug>` and its sub-listings

The requirement is that `/stones/labradorite` produces per-jewellery-type
sub-listings — Labradorite Rings, Labradorite Bracelets, Labradorite Earrings,
Labradorite Pendants, Labradorite Necklaces, Labradorite Chains — **from the
database, with no hand-made combination pages**.

#### The one query that builds the page

```sql
-- src/lib/stones/discovery.ts :: getStoneTypeBreakdown(stoneId, marketCode)
WITH live AS (
  SELECT p.id, p.rank
  FROM products p
  JOIN product_stones ps ON ps.product_id = p.id AND ps.stone_id = $1   -- idx_product_stones
  LEFT JOIN product_market_content pmc
         ON pmc.product_id = p.id AND pmc.market_code = $2
  WHERE p.deleted_at IS NULL
    AND p.status = 'active' AND p.published_at <= now()
    AND coalesce(pmc.is_published, true)
    AND EXISTS (SELECT 1 FROM prices pr
                WHERE pr.product_id = p.id AND pr.market_code = $2
                  AND pr.valid_to IS NULL AND pr.deleted_at IS NULL)    -- idx_prices_live_product
)
SELECT root.id, root.slug, root.name, root.rank,
       count(DISTINCT live.id) AS product_count
FROM live
JOIN product_categories pc ON pc.product_id = live.id
JOIN categories c    ON c.id = pc.category_id AND c.deleted_at IS NULL
JOIN categories root ON root.depth = 0 AND root.deleted_at IS NULL AND root.is_published
                    AND c.materialized_path LIKE root.materialized_path || '%'  -- idx_categories_path
GROUP BY root.id, root.slug, root.name, root.rank
HAVING count(DISTINCT live.id) >= $3   -- settings: catalog.stone_section_min_products, default 1
ORDER BY root.rank, root.name;
```

**Two corrections in that aggregate, both of which change the numbers printed on
the page.**

1. *Roll up to the root.* The sections are root categories, but a product is
   routinely filed only under a child — a labradorite ring in `RINGS → Stacking`
   and nowhere else. Joining `categories` with `depth = 0` straight against
   `product_categories` finds no row for it, so the piece appears in **no** section
   of `/stones/labradorite` while being, self-evidently, a labradorite ring. The
   `materialized_path LIKE` roll-up is the same index range scan the PLP already
   uses (02 §2.4) and is what puts it back; a recursive CTE per request is the
   alternative this schema exists to avoid.
2. *Count products, not memberships.* `count(*)` counts join rows: a piece filed
   under both `RINGS` and `RINGS → Stacking` is counted twice under the same root,
   inflating the heading's number and — because the same count feeds
   `catalog.curated_facet_min_products` below — promoting a thin page to an
   indexable one on the strength of a duplicate. `count(DISTINCT live.id)` is the
   number the heading actually claims to be showing.

The page then issues **one** batched listing query for the first row of cards in
each returned section (`LIMIT 8` per category, one statement using
`ROW_NUMBER() OVER (PARTITION BY category_id ORDER BY pc.rank, p.rank, p.id)`),
and `getDisplayPrice()`'s batch form for all of them together.

The jewellery types are `categories` rows — nothing in this query names `rings` or
`bracelets`, so adding `ANKLETS` is one category row and the section appears on
every stone page that has one. That is the whole point.

#### Where each section links

| Condition | Section heading links to | Indexable |
| --- | --- | --- |
| A `curated_facets` row exists for `(category_id, stone_id)` **and** its `curated_facet_markets` row for the market being rendered is `is_active` | `/rings/labradorite` — the ISR curated facet page (01 §1.3) | **yes**, canonical, in that market's sitemap |
| No such row, or inactive in this market | `/rings?stone=labradorite` — the dynamic filtered PLP | no: `no-store`, `noindex, follow`, canonical → `/rings` |

The market condition is not decoration: the same stone section can legitimately
link to a curated page in the US and to the dynamic PLP in India, because the
underlying count differs per market (below).

#### Curated facets are generated, not hand-made

A `curated_facets` row is what makes `/rings/labradorite` a real, indexable,
pre-rendered page. Creating those rows by hand across 7 stones × 6 types is exactly
the "hand-made static combination pages" the requirement forbids — so they are
produced by a job:

```ts
// src/lib/stones/discovery.ts
export async function ensureStoneFacets(tx: Tx, opts?: { stoneId?: string }): Promise<{
  created: number; deactivated: number;
}>;
```

- Runs on the `collection_refresh` job kind's nightly pass and on any
  stone↔product link change.
- For every `(published root category, published stone)` pair whose live product
  count is `>= settings.catalog.curated_facet_min_products` (default **4** — below
  that the page is thin and competes with its own parent category), it upserts a
  `curated_facets` row: `facet_type='stone'`, `stone_id`, `category_id`,
  `slug = stones.slug`, `title = '<Stone> <Category>'` in the category's
  customer-facing spelling, `is_auto = true`, `is_active = true`.
- When the count falls below the threshold it sets `is_active = false` — it never
  deletes the row and never deletes a `redirects` entry, so a page that briefly
  qualified does not turn into a 404 with lost link equity. `is_active = false`
  removes it from `generateStaticParams` and the sitemap; the route itself 301s to
  the parent category.
- **A row with `is_auto = false` is never touched.** A merchandiser who writes an
  `intro_json` for `/rings/moonstone` and flips `is_auto` off owns that page
  permanently — the same rule that protects `product_collections.source='manual'`
  from a rule refresh (§6.4).
- A `(category_id, slug)` collision — a stone facet and a tag or material facet
  sharing a slug under one category, which `uq_curated_facets` refuses — is skipped
  and recorded on the job's `result` as a warning. One unlucky slug must not abort a
  run that manages forty other pages.

**Activation is per market, because the count is.** The threshold decides whether a
page is worth indexing, and the live count for `(labradorite, RINGS)` is
market-scoped — the `live` CTE above filters on `product_market_content` **and** on
the price `EXISTS`. Under one global count, a pair with nine US-priced pieces and
zero INR-priced ones produces `/in/rings/labradorite`: an ISR-rendered, canonical,
sitemap-listed page with nothing on it, in the market where the catalogue is least
complete and an empty indexable page does the most damage. One `curated_facets` row
remains correct — the editorial identity, the slug and the `hreflang` pairing are
shared across markets — so the count and the activation move to a child table.

> **SCHEMA ADDITION:** `curated_facets.is_auto BOOLEAN NOT NULL DEFAULT false` and
> `curated_facets.product_count_cached INTEGER NOT NULL DEFAULT 0`, plus
> `CREATE INDEX idx_curated_facets_auto ON curated_facets (facet_type, is_auto) WHERE is_active;`
> Without `is_auto` the generator cannot tell its own rows from a merchandiser's and
> will either overwrite hand-written copy or refuse to manage anything;
> `product_count_cached` is the cross-market total the admin grid shows without
> re-running the count query per row; the activation decision itself is per market
> and lives in `curated_facet_markets`, below.

> **SCHEMA ADDITION:** `curated_facet_markets`
> ```sql
> CREATE TABLE curated_facet_markets (
>   curated_facet_id UUID        NOT NULL REFERENCES curated_facets (id) ON DELETE CASCADE,
>   market_code      CHAR(2)     NOT NULL REFERENCES markets (code)      ON DELETE CASCADE,
>   product_count    INTEGER     NOT NULL DEFAULT 0,
>   is_active        BOOLEAN     NOT NULL DEFAULT false,
>   refreshed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
>   CONSTRAINT pk_curated_facet_markets PRIMARY KEY (curated_facet_id, market_code)
> );
> CREATE INDEX idx_cfm_active ON curated_facet_markets (market_code, curated_facet_id) WHERE is_active;
> ```
> `generateStaticParams()` for `[category]/[facet]`, the per-market sitemap shards
> and the stone page's section links all read `curated_facet_markets` for the market
> they are rendering. `curated_facets.is_active` stays the global kill switch and
> `product_count_cached` becomes the cross-market total shown in the admin grid. A
> facet inactive in a market 301s to that market's parent category, exactly as a
> globally deactivated one does.

**The contract every consumer of this table must honour, stated as a predicate so
there is nothing to interpret** (C29). The sitemap shard 08 §3.3 calls
`{market}-facets` was written against `curated_facets.is_active` alone — the
global flag — which reintroduces the exact page this table exists to prevent:
`/in/rings/labradorite`, canonical, ISR-rendered, listed in India's sitemap, with
nothing on it, because the nine qualifying pieces are priced only in USD. One
predicate, three consumers, no second spelling:

```sql
-- src/lib/catalog/facets.ts :: activeFacetsForMarket(marketCode)
SELECT cf.id, cf.slug, cf.category_id, cf.facet_type, cfm.product_count
FROM curated_facets cf
JOIN curated_facet_markets cfm
  ON cfm.curated_facet_id = cf.id
 AND cfm.market_code = $1
 AND cfm.is_active                       -- idx_cfm_active (market_code, curated_facet_id)
WHERE cf.is_active                       -- the global kill switch, ANDed, never alone
  AND cf.deleted_at IS NULL;
```

| Consumer | Owns | Must read |
| --- | --- | --- |
| `generateStaticParams()` for `/[market]/[category]/[facet]` | 08 §4.2 | `activeFacetsForMarket(market)` — a facet with no active row for that market is **not** pre-rendered |
| The `{market}-facets` sitemap shard | 08 §3.3 | the same function; `lastmod` is `max(cfm.refreshed_at, cf.updated_at)`, not `cf.updated_at` — the per-market count is what moved |
| The stone page's section links (above) and the facet route itself | 03 §4.2 | the same function; a miss 301s to the market's parent category |

> **RESOLVED — was CHANGE REQUIRED IN 08 §3.3:** the shard table's `{market}-facets` row reads
> *Verified applied by inspection of the target document.*
> "Active `curated_facets` | `updated_at`". It must read **"`activeFacetsForMarket(market)`
> — `curated_facets.is_active` **AND** the market's `curated_facet_markets.is_active`
> | `max(curated_facet_markets.refreshed_at, curated_facets.updated_at)`"**. The
> global flag alone is a per-market empty indexable page, which is the failure this
> table was added to close, and a shard built from `curated_facets.updated_at`
> additionally goes stale the moment a market's count crosses the threshold without
> anything touching the parent row. The same correction applies to 08 §4.2's
> `generateStaticParams()` entry for `[category]/[facet]`.
> `tests/integration/facet-market-activation.test.ts` (commissioned here) seeds a
> facet active in US and inactive in IN and asserts it appears in exactly one
> market's shard, one market's `generateStaticParams()` output, and 301s in the
> other.

`/stones/<slug>` is ISR 1800s tagged `stone:{id}` (01 §1.3), purged on stone save
and on any `product_stones` link change (01 §2.4).

> **NEEDS INPUT:** the per-stone editorial copy (`short_description`,
> `description_json`) and whether any origin, treatment or provenance claim may be
> published. Until supplied, the stone page renders the name, the swatch, the
> sub-listings and nothing else.

---

## 5. Materials

### 5.1 The entity

`materials` (02 §2.4) covers 14K Yellow / White / Rose Gold and Sterling Silver at
launch and anything after — 18K, platinum, vermeil, oxidised silver — as rows, not
enum values. The columns that do work:

| Column | Role |
| --- | --- |
| `kind` (`metal`/`finish`/`other`) | Separates a priceable metal from a surface treatment. Only `metal` may be `is_rate_linked` |
| `purity_label` (`14K`, `925`) | Display, and the customs/spec table |
| `purity_ratio NUMERIC(6,5)` | `0.58500` / `0.92500` — the multiplier in the §1.10 rule-2 expression. `CHECK (> 0 AND <= 1)` |
| `is_rate_linked` | `true` ⇒ this material may appear in `metal_rates` and drive `price_source = 'metal_linked'` |
| `colour_hex`, `swatch_media_id` | Filter swatch, option-value swatch |
| `sku_token` | §2.6 |

`variant_materials (variant_id, material_id, weight_grams NUMERIC(10,3),
is_primary)` is the composition, at the **variant**, with exactly one
`is_primary` row per variant (`idx_variant_materials_primary`). There is no
`product_materials` table and one is not added (02 §2.4).

### 5.2 Material drives filtering

Material is a **structural facet**, not an EAV facet. The PLP predicate is:

```sql
AND EXISTS (SELECT 1 FROM variant_materials vm
            JOIN product_variants v ON v.id = vm.variant_id
                                   AND v.product_id = p.id
                                   AND v.deleted_at IS NULL AND v.is_active
            WHERE vm.material_id = ANY($n))          -- idx_variant_materials_material
```

served by `idx_variant_materials_material (material_id, variant_id)` as an
index-only probe. The facet UI renders `materials.colour_hex` /
`swatch_media_id` swatches, ordered by `materials.rank`, sourced from the table —
no hardcoded metal list anywhere in `src/components/`.

The indexable material facet page is a `curated_facets` row with
`facet_type='material'` (`/pendants/14k-gold`), generated by the same
`ensureStoneFacets`-style pass over materials.

### 5.3 Material drives metal-linked pricing

The chain, end to end, with nothing invented in the middle:

```
materials.is_rate_linked = true
   └─▶ metal_rates (material_id, currency_code, rate_minor_per_gram, rate_scale, effective_at)
          ▲ one row per material PER CURRENCY — the USD rate and the INR rate are
            entered or fetched independently (01 §2.3). There is no conversion.
variant_materials (variant_id, material_id, weight_grams, is_primary = true)
   └─▶ the weight of THIS variant in THIS material
prices (price_source = 'metal_linked' | 'hybrid', material_id, metal_rate_id,
        metal_weight_grams, making_charge_minor, making_charge_bp)
   └─▶ a SNAPSHOT of which rate row and which weight produced this amount,
       so the computation is reproducible after the variant is re-weighed
```

- `chk_prices_linked_inputs` makes a non-`manual` price row without
  `material_id`, `metal_rate_id` and `metal_weight_grams` **unwritable**.
- A missing or stale rate for a market's currency (older than
  `PRICING_RATE_MAX_AGE_HOURS`) causes the recalculation preview to refuse *that
  market's* lines by name — "no USD silver rate for 2026-09-12" — while still
  proposing the others. It never borrows the other currency's rate.
- **Changing a rate changes nothing customer-facing.** `/api/cron/metal-rate-refresh`
  writes `metal_rates` rows; `recalc_runs` / `recalc_run_lines` hold the proposed
  new prices in `previewing` → `pending_approval`; only an approved run inserts
  `prices` rows with `recalc_run_id` set (hard rule 6, 02 §2.5).

The catalogue's job in all of this is to keep the **inputs** correct:
`variant_materials.weight_grams` present and `is_primary` set on every live variant
of any product priced by rate. That is completeness check 8, and it is a publish
blocker whenever a price row on that product is `metal_linked` or `hybrid`.

> **NEEDS INPUT:** whether the client wants silver-linked pricing, gold-linked
> pricing, or both, and from which quoting source (manual entry or a named vendor
> feed). `metal_rates` ships **empty**; no rate is seeded, which means no price can
> be `metal_linked` until a real rate is entered (02 §6).

---

## 6. Collections

### 6.1 Manual and automatic

`collections.mode` is `manual | automatic` (02 §1.9). In **both** cases membership
lives in `product_collections`; `source` says who put the row there. Manual rows
are written by a merchandiser with a `rank` they control; rule rows are written by
`refreshCollection()`.

An `automatic` collection may also carry manual rows — a hand-pinned hero piece in
an otherwise rule-driven collection is the normal case, and it is why
`refreshCollection()` never touches `source='manual'`.

`collections.sort_order` names an `ORDER BY` clause and reaches SQL through a
lookup in `src/lib/db/raw/`, never by interpolation; `chk_collections_sort_order` is
the second lock on that door. `price_asc` / `price_desc` sort **within one
market** — `getCollectionProducts(collectionId, marketCode, cursor)` always takes a
market, because ranking a `list_minor` across currencies compares ₹ to $ as if they
were the same number (02 §2.4).

### 6.2 The rule model

A rule is one row in `collection_rules`: `field`, `operator`, one of
`value_text` / `value_uuid` / `value_numeric`, plus `value_market_code` and
`attribute_id` where the field demands them.

**Fields** (`collection_rule_field`):

| Field | Value column | Evaluated against |
| --- | --- | --- |
| `category` | `value_uuid` | `product_categories`, **subtree-inclusive** via `categories.materialized_path LIKE` |
| `stone` | `value_uuid` | `product_stones.stone_id` |
| `material` | `value_uuid` | `variant_materials.material_id` through the product's live variants |
| `tag` | `value_text` (slug) | `product_tags` → `tags.slug` |
| `attribute` | `attribute_id` + `value_uuid` (option) or `value_text` | `product_attribute_values` |
| `price` | `value_numeric` + **`value_market_code` (required)** | `MIN(coalesce(sale_minor, list_minor))` over the product's active `prices` rows in that market — see below |
| `status` | `value_text` | `products.status` |
| `created_at` | `value_text` (ISO date) | `products.created_at` |
| `is_one_of_a_kind` | — | `products.is_one_of_a_kind` |
| `stone_is_lab_grown` ➕ | — | `stones.is_lab_grown` through `product_stones` |
| `is_on_sale` ➕ | **`value_market_code` (required)** | an active `prices` row in that market with `sale_minor IS NOT NULL` |

**Two things the `price` field has to pin down before it can be evaluated at all,
and neither is obvious from the column list.**

- *Which price.* A product carries a product-level default and any number of
  variant overrides in one market (02 §3.4), so "price under 500" has no single
  referent and an implementation would silently pick whichever row the planner
  returned. The rule evaluates
  **`MIN(coalesce(sale_minor, list_minor))` over the product's active rows in that
  market** — the "from" price the PLP card already shows, and therefore the number
  the merchandiser had in mind when they typed it. Served by
  `idx_prices_live_product (product_id, market_code)`.
- *Which units.* The admin types major units (`500`, not `50000`), but the
  comparison has to happen on the indexed `BIGINT` column: dividing `sale_minor` by
  `10^minor_unit` inside the predicate is non-sargable **and** drags a settlement
  amount through a decimal, which is what 02 §1.1 exists to prevent.
  `saveCollectionRules()` converts once, on write, using `currencies.minor_unit`
  for `value_market_code`'s currency, and stores the **integer minor-unit value** in
  `value_numeric` (`NUMERIC(14,4)` holds an integer exactly); the predicate is
  `… <op> $value::bigint` against the column, and the admin UI formats the stored
  value back to major units with `formatMoney()` for display. Changing a rule's
  market re-runs the conversion — 50000 US cents and 50000 paise are not the same
  rule, and a market switch that kept the number would quietly redefine the
  collection.

**Operators** (`collection_rule_operator`), with the exact admin label:

| Admin label | Enum value | Applies to |
| --- | --- | --- |
| is | `equals` | every field |
| is not | `not_equals` | every field |
| is any of | `in` | `category`, `stone`, `material`, `tag`, `attribute` (multi-value, §6.3) |
| is none of | `not_in` | same |
| contains | `contains` | `tag`, `attribute` (text), `status` |
| does not contain | `not_contains` ➕ | same |
| starts with | `starts_with` | text fields |
| greater than | `gt` | `price`, `created_at`, numeric attributes |
| greater than or equal | `gte` | same |
| less than | `lt` | same |
| less than or equal | `lte` | same |
| is true | `is_true` | `is_one_of_a_kind`, `stone_is_lab_grown`, `is_on_sale`, boolean attributes |
| is false | `is_false` | same |

> **SCHEMA ADDITION:**
> `ALTER TYPE collection_rule_operator ADD VALUE 'not_contains';`
> `ALTER TYPE collection_rule_field ADD VALUE 'stone_is_lab_grown';`
> `ALTER TYPE collection_rule_field ADD VALUE 'is_on_sale';`
> and widen the existing constraint to
> `chk_collection_rules_price_market: field NOT IN ('price','is_on_sale') OR value_market_code IS NOT NULL`.
> `not_contains` is required verbatim by the product brief and has no synonym in the
> enum. `stone_is_lab_grown` exists so LAB GROWN DIAMONDS is a property query rather
> than a hand-maintained list of stone ids that goes wrong the first time a new
> lab-grown stone is added (§8.3). `is_on_sale` is what makes CLOSEOUTS a rule set
> instead of a hardcoded section (§8.2), and it is market-scoped for exactly the
> reason `price` is: "on sale" is a statement about a currency's price row.

**AND / OR composition.** `collections.rule_match` is `all` (AND) or `any` (OR),
flat across every rule — no nesting, no groups. The trade-off: a flat connective
cannot express `(A AND B) OR (C AND D)` in one collection. **Taken deliberately.**
A grouped rule builder needs a second level of UI, a `group_index` column whose
default silently changes the meaning of every existing collection, and an evaluator
with a nesting depth to test; the cases that actually need it are served by
multi-value `in` (§6.3) and, beyond that, by a second collection. Every one of the
four launch rule sets in §6.6, and both seeded automatic collections, is
expressible flat.

### 6.3 Multi-value rules

`in` / `not_in` are in the canonical operator enum but 02 §2.4 gives a rule row one
`value_uuid` and one `value_text`, with nowhere to put the second value. Expressing
"material is any of three golds" as three OR'd rows forces `rule_match='any'` for
the whole collection, which then breaks any collection that also needs an AND.

> **SCHEMA ADDITION:** `collection_rule_values`
> ```sql
> CREATE TABLE collection_rule_values (
>   rule_id     UUID NOT NULL REFERENCES collection_rules (id) ON DELETE CASCADE,
>   value_uuid  UUID NULL,
>   value_text  TEXT NULL,
>   position    SMALLINT NOT NULL,
>   created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
>   CONSTRAINT pk_collection_rule_values PRIMARY KEY (rule_id, position),
>   CONSTRAINT chk_crv_one_value CHECK (num_nonnulls(value_uuid, value_text) = 1)
> );
> CREATE INDEX idx_crv_rule ON collection_rule_values (rule_id, position);
> ```
> Used **only** by `in` / `not_in`; every other operator reads the value columns on
> `collection_rules` itself. A `CHECK` cannot span the two tables, so
> `saveCollectionRules()` asserts that an `in`/`not_in` rule has ≥ 1 child row and
> that no other operator has any.

### 6.4 Evaluation: materialised, incrementally refreshed

02 §2.4 decides materialise-over-evaluate-on-read. This is the execution.

```ts
// src/lib/rules/predicate.ts — shared, domain-agnostic (15 §1.1)
export function buildRulePredicate(
  rules: RuleRow[], match: 'all' | 'any', resolve: FieldResolver,
): Prisma.Sql;

// src/lib/catalog/collections.ts — the catalogue's binding of it
export function buildRulePredicate(rules: CollectionRule[], match: 'all' | 'any'): Prisma.Sql;
//   => buildRulePredicate(rules, match, productFieldResolver)
export async function refreshCollection(tx: Tx, collectionId: string,
                                        opts?: { productIds?: string[] }): Promise<RefreshResult>;
export async function refreshCollectionsForProduct(tx: Tx, productId: string,
                                                   changedFields: RuleFieldSet): Promise<void>;
```

> **DECISION CHANGED:** the rule-predicate builder used to live only in
> `src/lib/catalog/collections.ts` with two parameters. 15 §1.1 gives customer
> groups the same rule model, so the generic builder moves to
> **`src/lib/rules/predicate.ts`** and takes a third parameter, a
> `FieldResolver = (rule: RuleRow) => Prisma.Sql` that emits one comparison or
> `EXISTS` fragment for one field. `src/lib/catalog/collections.ts` keeps exporting
> the two-parameter `buildRulePredicate(rules, match)` as a thin binding over
> `productFieldResolver`, **so no call site in this document changes** — §6.4's
> statements, §6.2's index table and §8.2's read-time predicate are all unaffected.
> The `eslint-plugin-boundaries` element type for `src/lib/rules/` is `lib-shared`:
> it imports nothing from a domain module, which is what stops it becoming a second
> service layer (15 §1.1).

`buildRulePredicate` emits one `EXISTS` (or `NOT EXISTS`) fragment per rule,
joined by `AND`/`OR`, each one hitting the index named in §6.2's table. The
collection-wide form is one statement:

```sql
INSERT INTO product_collections (product_id, collection_id, source, rank, created_at)
SELECT p.id, $1, 'rule', 0, now()
FROM products p
WHERE p.deleted_at IS NULL AND <predicate>
ON CONFLICT (product_id, collection_id) DO NOTHING;

DELETE FROM product_collections pc
WHERE pc.collection_id = $1 AND pc.source = 'rule'
  AND NOT EXISTS (SELECT 1 FROM products p
                  WHERE p.id = pc.product_id AND p.deleted_at IS NULL AND <predicate>);
```

`source='manual'` rows are outside both statements by construction — a rule
refresh cannot delete a merchandiser's pin.

**One refresh per collection at a time.** Those two statements are not atomic with
respect to each other's view of `<predicate>`, and two refresh paths run
concurrently by design (a product save and the nightly job). At `ReadCommitted` the
nightly full evaluation, working from a snapshot taken before a product save
committed, can `DELETE` the membership row that save just inserted — or re-insert
one it just removed — and the losing write leaves no error anywhere, only a
campaign page that is quietly missing a piece. `refreshCollection()` therefore takes
`pg_advisory_xact_lock(hashtextextended('collection:' || $collectionId, 0))` as its
first statement, so full evaluations and per-product upserts serialise **per
collection** rather than across the catalogue. The lock is transaction-scoped and
is released by the commit 02 §5.3 already requires.

**Four triggers, and only one of them is a full evaluation:**

| Trigger | Scope | Cost |
| --- | --- | --- |
| Collection rules saved | full evaluation of **that one** collection | one indexed scan, in the save transaction |
| Product saved / published / unpublished / deleted | `refreshCollectionsForProduct` — **one product against N collections** | see below |
| Price written, stock crossing zero, stone/material/tag/category link changed | same, for the collections whose rule fields that write touched | same |
| Nightly `collection_refresh` job | every `automatic` collection, in `id` order, batched | off-peak, `progress_current/total` visible in `/admin/system/jobs` |

**How the per-product path avoids a full-table scan.** `saveProduct()` already
knows which rule-relevant fields it changed (it computed the child-table diffs), so
it hands `refreshCollectionsForProduct` a `RuleFieldSet`. That selects only the
collections that could possibly care:

```sql
SELECT DISTINCT cr.collection_id
FROM collection_rules cr
JOIN collections c ON c.id = cr.collection_id
                  AND c.mode = 'automatic' AND c.deleted_at IS NULL
WHERE cr.field = ANY($1)                                  -- the changed field set
  AND (cr.value_uuid IS NULL OR cr.value_uuid = ANY($2)); -- the changed target ids
```

**`$2` is the union of ids added *and* removed, and getting that wrong is a
one-line bug with a day-long blast radius.** The obvious implementation passes the
product's *current* stone / material / tag / category ids. That refreshes every
collection the product now qualifies for and **none** of the ones it just stopped
qualifying for: remove the labradorite link from a ring and
`stone equals labradorite` is not in `$2` at all, so the ring stays in Labradorite
Rings — on a live page, wrong, until the nightly pass. `saveProduct()` already
computes child-table diffs for exactly these tables, so `RuleFieldSet` carries
`{ field, addedIds, removedIds }` and `$2` is the union. A `not_in` / `not_equals`
/ `is_false` rule needs the same union for the mirror-image reason: gaining a link
is what makes a product *leave* a negated collection.

> **SCHEMA ADDITION:**
> `CREATE INDEX idx_collection_rules_field_target ON collection_rules (field, value_uuid);`
> This index is the difference between "which collections care about this product's
> new stone" being an index probe and being a seq scan of every rule in the system on
> every product save.

For each returned collection, the predicate is evaluated **for one product id**
(`WHERE p.id = $productId AND <predicate>`) and the single membership row is
upserted or deleted. A product save therefore costs one small query per interested
collection — typically two or three — not one scan per collection in the catalogue.

`collections.last_refreshed_at` is stamped by the full-evaluation paths only, and
`/admin/catalog/collections` shows it; a value older than 25 hours on an
`automatic` collection is rendered as a warning, because a silently stale
rule-driven collection looks exactly like a correct empty one.

**Cache:** every refresh path ends with `revalidateTags([tags.collection(id),
tags.market(m)…])` after commit (01 §2.3 step 6, §2.4).

### 6.5 Scheduling

`collections.starts_at` / `ends_at` (`chk_collections_window`) schedule the
collection's **visibility**, not its membership. The collection page and every
navigation reference filter on
`is_published AND (starts_at IS NULL OR starts_at <= now()) AND (ends_at IS NULL OR ends_at > now())`,
and a `publish_scheduled` job (§1.2) purges `collection:{id}` and `nav:{market}` at
each boundary so an ISR page actually flips.

### 6.6 The four launch rule sets

> **DECISION CHANGED:** this section previously specified **five** launch rule
> sets, the first being **ONE OF A KIND** at `/collections/one-of-a-kind`, seeded
> with the other four. ONE OF A KIND is a `categories` row served at
> `/one-of-a-kind` (§7.1; 08 §4.2 routes it through `[category]/page.tsx`), and
> 08 §4.3 refuses the second URL — two URLs for one idea. **The collection is not
> created.** The `is_one_of_a_kind` predicate is untouched: it remains a
> `collection_rule_field` any merchandiser can use, `11 §8.3`'s filter field, and
> the `sold` band's condition (`11 §7.1`). It is simply not a launch rule set, and
> §8.1 — not a collection row — is where one-of-a-kind semantics live.

**What the `collections` seed actually creates: the two automatic rows of
08 §4.3 and nothing else** — *New arrivals* (`mode='automatic'`, rule
`created_at gte now() - 30d` re-evaluated by the nightly `collection_refresh` job,
`sort_order='newest'`) and *Best sellers* (`mode='automatic'`, no rules,
`sort_order='best_selling'`). No campaign collection is seeded, because none has
been given (hard rule 8; 08 §4.3's `NEEDS INPUT`).

The four rule sets below are therefore **rule definitions, not seed rows**: they
are what a merchandiser enters at `/admin/catalog/collections` when the client
approves that page, written down here so the rules are correct the first time
rather than reinvented. Each is `mode='automatic'` and starts `is_published=false`.
Category and stone ids are resolved from the seeded rows by slug; nothing is
hardcoded in TypeScript.

#### 14K GOLD — `/collections/14k-gold`

`rule_match = 'all'`, `sort_order = 'rank'`

| # | field | operator | value |
| ---: | --- | --- | --- |
| 1 | `material` | `in` | `collection_rule_values` → `14k-yellow-gold`, `14k-white-gold`, `14k-rose-gold` |

One rule with three child values, evaluated through `variant_materials` on the
product's live variants. Adding 14K Green Gold later is one child row, from the
admin, with no deploy — which is exactly why this is not
`material equals 14k-yellow-gold OR …` with `rule_match='any'` locked for the whole
collection.

#### LAB GROWN DIAMONDS — `/collections/lab-grown-diamonds`

`rule_match = 'all'`, `sort_order = 'rank'`

| # | field | operator | value |
| ---: | --- | --- | --- |
| 1 | `stone_is_lab_grown` | `is_true` | — |

Reads `stones.is_lab_grown` through `product_stones`. A new lab-grown stone row is
in the collection the moment it is linked to a product — no rule edit, no id list.

#### CLOSEOUTS — `/collections/closeouts`

`rule_match = 'any'`, `sort_order = 'price_asc'`, `requires_sale_in_market = true`

| # | field | operator | value |
| ---: | --- | --- | --- |
| 1 | `is_on_sale` | `is_true` | `value_market_code = 'US'` |
| 2 | `is_on_sale` | `is_true` | `value_market_code = 'IN'` |

Membership is anything actually discounted in either market; §8.2's
`requires_sale_in_market` then shows each market only its own discounts, which is
what keeps `/in/closeouts` from listing a piece that is marked down only in the US.

**A third rule, `tag equals closeout`, was specified here and has been removed,
because it and `requires_sale_in_market` cancel each other out.** A merchandiser
tags a piece `closeout` precisely when it has no `sale_minor` — otherwise rules 1
and 2 already catch it — and the read-time predicate then filters that piece out of
every market. The row would be written to `product_collections`, appear in the
admin's member list, be counted in the collection's product count, and never once
render on the page: a rule that looks like it works, does nothing, and gives no
signal that it did nothing. A piece the merchandiser wants in CLOSEOUTS without a
price cut is a **manual pin** (`product_collections.source = 'manual'`), which
§8.2's predicate exempts by name, and the `closeout` tag stays exactly what §7.2
already makes it — an internal saved-view label for the merchandising queue, not a
membership mechanism.

#### Labradorite Rings — `/collections/labradorite-rings`

`rule_match = 'all'`, `sort_order = 'rank'`

| # | field | operator | value |
| ---: | --- | --- | --- |
| 1 | `stone` | `equals` | `stones.slug = 'labradorite'` → `value_uuid` |
| 2 | `category` | `equals` | `categories.slug = 'rings'` → `value_uuid` (subtree-inclusive) |

**This collection is optional and duplicative, and that is worth saying.** The same
set is already reachable as `/rings/labradorite` — a `curated_facets` row that
§4.2's job creates automatically, with an SEO-canonical URL, an editorial intro and
ISR. A `collections` row is warranted only when the merchandiser wants a *different*
set: a hand-pinned order, a subset, or extra manual members. The rule above is the
correct definition when they do; when they only want the listing,
`ensureStoneFacets` has already built it and a second URL for the same products
splits link equity between two pages that compete with each other.

---

## 7. Categories and tags

### 7.1 Categories

`categories` is a tree (`parent_id`, `materialized_path`, `depth`) rendered at
**root-level URLs** (`/rings`), which is why `categories.slug` is globally unique
among live rows and not unique-per-parent (02 §1.5).

Seeded root categories, using the exact customer-facing spellings from
00-CONTEXT §6 — these strings are `categories.name` verbatim, and the storefront
renders `name` from the row, never a constant. **There are nine of them**
(`prisma/seed/03-categories.ts`, 02 §6):

| `name` | `slug` | `rank` | `sku_token` |
| --- | --- | ---: | --- |
| `CHAINS` | `chains` | 1 | `CHN` |
| `RINGS` | `rings` | 2 | `RNG` |
| `PENDANTS` | `pendants` | 3 | `PND` |
| `BRACELETS` | `bracelets` | 4 | `BRC` |
| `EARRINGS` | `earrings` | 5 | `EAR` |
| `CLOSEOUTS` | `closeouts` | 6 | — |
| `ONE OF A KIND` | `one-of-a-kind` | 7 | — |
| `14K GOLD` | `14k-gold` | 8 | — |
| `LAB GROWN DIAMONDS` | `lab-grown-diamonds` | 9 | — |

All seeded `is_published = false` with **empty** `description_json`; published when
the client approves the navigation (02 §6).

> **DECISION CHANGED:** this table previously carried a tenth row, `STONES` →
> slug `stones` at rank 6, and the ranks below it were 7–10. **`STONES` is not a
> `categories` row.** `stones` is a reserved literal first route segment (08 §4.1:
> `/stones`, `/stones/[slug]`, `/stones/[slug]/[category]`), so
> `src/lib/catalog/reservedSlugs.ts` contains it and `saveCategory()` rejects it
> with `SlugTakenError` — a seed creating the row either fails its own validator or
> bypasses its own writer and produces a row whose URL renders the stone index.
> The customer-facing **STONES** menu entry is instead a single `navigation_items`
> row of `link_type='url'`, label `STONES`, target `/stones`, in the `main` menu at
> the rank `STONES` occupies in 00-CONTEXT §6, seeded by the same file
> (02 §6, 08 §4.1). **Nine `categories` rows plus one `navigation_items` row is ten
> customer-facing menu entries**, which is what 00-CONTEXT §6 actually lists.
> `tests/unit/reserved-slugs.test.ts` asserts no seeded category slug appears in
> `reservedSlugs`, so the two lists cannot drift back into collision.

**Four of those nine are not merchandise categories in the ordinary sense.**
`ONE OF A KIND` is the semantics in §8.1 and is **served from its category row and
from nowhere else** — `/one-of-a-kind` is resolved by `[category]/page.tsx`
(08 §4.2) and there is no `/collections/one-of-a-kind` (§6.6, 08 §4.3).
`CLOSEOUTS`, `14K GOLD` and `LAB GROWN DIAMONDS` are also the §6.6 rule sets, and
which of the two URL forms each of them is served at is the one thing still open —
see §8.2's `CHANGE REQUIRED IN 08 §4.2 and §4.3`. Either way the row exists here,
because the navigation is one ordered tree the client edits in one screen and a nav
item may point at a category, a collection or a URL
(`navigation_items.link_type`) without any of those rows being a placeholder.

> **NEEDS INPUT:** whether `NECKLACES` is a distinct category from `CHAINS` and
> `PENDANTS`. 00-CONTEXT §6 lists six jewellery types for stone-led discovery
> (rings, bracelets, earrings, pendants, necklaces, chains) but the customer-facing
> category list has no `NECKLACES`. The seed ships the nine category spellings plus
> the `STONES` nav item exactly as given; adding a tenth category is one row from
> the admin and the stone-page sections in §4.2 pick it up with no code change.

**Nesting.** Sub-categories (`RINGS` → `Stacking`) are supported to any depth and
re-parenting rewrites `materialized_path` for the subtree in the same transaction
(02 §2.4). The storefront renders **two levels** in the main navigation and uses
depth-3+ for filtering and breadcrumbs only, because a three-level mega-menu on a
catalogue this size is navigation for the merchandiser's benefit rather than the
shopper's. Breadcrumbs are built from `materialized_path`, canonical category from
`products.primary_category_id`.

A product belongs to many categories (`product_categories`) with exactly one
`is_primary` (`idx_product_categories_primary`) and a per-category merchandising
`rank` (`idx_product_categories_rank … INCLUDE (product_id)`), which is what makes
a category page a single index-only scan.

### 7.2 Tags

`tags (id, slug, name, is_visible)` + `product_tags`, both sides cascading — a tag
link is pure membership with no independent value (02 §2.4).

`is_visible = false` is the important column: it makes a tag an **internal
merchandising label** that is never rendered, never a facet and never in a URL, but
still fully usable by rules, saved views and reporting. `needs-photography`,
`vendor-lot-2026-03`, `closeout` and `reprice-pending` are internal;
`bestseller` and `new-arrival` may be visible.

Four uses, one model:

| Use | Mechanism |
| --- | --- |
| **Search** | `reindexProduct()` concatenates every tag `name` into `products.search_text`, which is weight-C in the `search_vector` generated column. Renaming a tag enqueues a **scoped** `reindex_search` job for that tag's products in the same transaction (02 §2.4) |
| **Collections** | `collection_rule_field = 'tag'`, matched on `tags.slug` via `idx_product_tags_tag (tag_id, product_id)` |
| **Filtering** | Only `is_visible` tags appear as a facet; the indexable form is a `curated_facets` row with `facet_type='tag'`. A hidden tag in a URL is treated as an unknown facet and dropped |
| **Analytics & ops** | `saved_views.filters` persists a tag filter for the admin grid; bulk edit applies and removes tags across a selection; the CSV export emits a `tags` column of pipe-separated slugs, which is also the import format |

Tags are **not** a substitute for any typed entity. A `labradorite` tag alongside
the `labradorite` stone row is two sources of truth for the same fact, and the
import validator rejects a tag slug that collides with a live `stones.slug`,
`materials.slug` or `categories.slug`.

> **SCHEMA ADDITION:** `tags.deleted_at TIMESTAMPTZ NULL` is **not** added — 02 §1.4
> places `tags` outside the soft-delete set and `product_tags` cascades, which is
> correct: nothing immutable references a tag and no URL resolves to one that is not
> also a `curated_facets` row. This is recorded so the omission reads as a decision
> rather than an oversight.

---

## 8. The special collections

### 8.1 ONE OF A KIND

**Semantics: one variant, one stock row, one unit, and a visible SOLD state.**

#### Inventory 1 by default, with an admin override

`products.is_one_of_a_kind = true` causes `saveProduct()` to, in the same
transaction:

1. Retire every variant beyond the first (`is_active = false`, then `deleted_at`
   if unsold) — `idx_variants_ooak_single` refuses the write otherwise, and the
   composite FK's `ON UPDATE RESTRICT` makes flipping the flag with extra variants
   fail loudly rather than half-apply (02 §2.4).
2. Ensure exactly one `inventory_items` row exists —
   `idx_inventory_items_ooak_single_row` guarantees it, which is what guarantees two
   concurrent buyers contend for the **same** lock instead of each finding a row at
   a different location (02 §2.6).
3. Default `on_hand_quantity` to `settings.catalog.ooak_default_quantity`
   (seeded `1`). `chk_inventory_ooak_qty` caps it at 1 and forces
   `incoming_quantity = 0`.

**The admin override** is a per-product boolean, not a relaxation of the check:

> **SCHEMA ADDITION:** `products.ooak_quantity_override BOOLEAN NOT NULL DEFAULT false`.
> When `true`, `saveProduct()` skips step 3's default and the admin types the
> quantity — but `chk_inventory_ooak_qty` still refuses anything above 1, so the
> override's real meaning is "this piece is one-of-a-kind editorially but currently
> has 0 on hand and I am managing it by hand", which is the actual merchant request
> (a piece at the polisher, or one being photographed). A product that genuinely has
> five of something is not one-of-a-kind, and the flag comes off. The alternative —
> making the `CHECK` conditional on the override — would relax the constraint for
> every row in the table to serve a handful, which is the same mistake as an
> `allow_backorder` boolean (02 §2.6).

#### SOLD, not silently removed

When `commitStock()` takes the last unit of a one-of-a-kind product, it sets
`products.sold_at` in the same transaction and purges `product:{id}` immediately —
for an inventory of 1 there is no such thing as an in-band decrement (01 §2.4).

> **SCHEMA ADDITION:** `products.sold_at TIMESTAMPTZ NULL`, plus
> `CREATE INDEX idx_products_sold ON products (sold_at DESC) WHERE sold_at IS NOT NULL AND deleted_at IS NULL;`
> The sold state is otherwise only derivable by joining `inventory_items` and
> checking `on_hand_quantity = 0 AND is_one_of_a_kind`, which is a join the PLP
> cannot afford per card and which cannot be sorted by "recently sold". A return that
> restocks the piece clears `sold_at` in the restock transaction.

`AvailabilityBand` gains a fifth value, and **11 §7.1 is now its canonical
declaration** — `src/types/inventory.ts`, re-exported from
`src/lib/inventory/index.ts`, with `AVAILABILITY_BANDS` frozen beside it and
`tests/unit/availability.test.ts` asserting the TS union and the runtime array
agree. Three documents still carry four values and each needs the fifth: 01 §2.3's
`getAvailability()` comment, **05 §1.1's band table** — the document that owns the
implementation, so an engineer following it returns `'out'` for a sold unique piece
— and 07 §8.2's public-API denylist row, where the point is that a *count* is
withheld and the sold *state* is not.

> **CONTRACT EXTENSION (01 §2.3; canonical in 11 §7.1):** `AvailabilityBand` is
> `'in_stock' | 'low' | 'out' | 'made_to_order' | 'sold'`. `getAvailability()`
> returns `'sold'` when `is_one_of_a_kind AND products.sold_at IS NOT NULL` — the
> unit was committed and physically left — and `'out'` when the piece is merely
> reserved by a live checkout, or was never stocked (§2.5). **Not
> `available_quantity <= 0`:** for an inventory of one, that condition is also true
> for the thirty minutes somebody else's cart holds it, and a SOLD plate over an
> unsold piece is a lie the page then retracts without telling anyone. Collapsing the two would make a permanently unavailable unique piece
> indistinguishable from a chain awaiting a restock, and the storefront copy,
> the `noindex` decision and the JSON-LD differ between them.

The presentation is §2.5's SOLD row: a SOLD plate, the add-to-bag control
**removed** rather than disabled, and an enquiry link. Silent removal is refused
because a 40-year house's archive of sold work is the strongest proof of what it
makes, and because the URL already has inbound links and index equity.

#### Admin-configurable visibility of sold pieces

One `settings` row, read by `src/lib/catalog/` and by `src/lib/seo/`:

| Key | Type | Values | Default |
| --- | --- | --- | --- |
| `catalog.ooak_sold_visibility` | `text` | `visible` · `visible_noindex` · `hidden` | `visible_noindex` |
| `catalog.ooak_sold_in_listings` | `boolean` | show sold pieces on PLPs and in the `/one-of-a-kind` category listing, sorted last | `true` |
| `catalog.ooak_default_quantity` | `number` | 0 or 1 | `1` |

| Setting | PDP | Listings | Sitemap / robots | Search |
| --- | --- | --- | --- | --- |
| `visible` | full page + SOLD plate | included (last, if `ooak_sold_in_listings`) | in sitemap, indexable | included |
| `visible_noindex` | full page + SOLD plate | included (last) | **absent from sitemap, `robots_noindex`** | excluded |
| `hidden` | **301 → the primary category**, issued by the PDP route from the live setting — **no `redirects` row** | excluded | absent | excluded |

**The `hidden` policy must not write a `redirects` row, and nearly did.** A
`redirects` row is permanent and is keyed on a path, not on a setting. Write one
when `sold_at` is set and flipping `catalog.ooak_sold_visibility` back to `visible`
leaves every sold PDP still 301ing to its category, with nothing in the table to
distinguish policy redirects from real slug changes that must never be removed —
and a return that clears `sold_at` has the same problem in reverse. The 301 is
therefore issued by the PDP route itself, from `sold_at` plus the live setting
value, which makes the policy reversible in one settings save and leaves
`redirects` meaning only what §1.2 says it means.

`visible_noindex` is the default because it keeps every existing inbound link and
every archive page working while keeping a permanently unbuyable page out of the
index, where it would otherwise dilute the category it sits in. Changing the
setting purges `settings`, every `product:{id}` tag for products with
`sold_at IS NOT NULL`, and `sitemap` — the settings-save action enqueues that purge
as a job rather than doing it inline, because the list can be long.

### 8.2 CLOSEOUTS is a rule set, not a section

There is no `is_closeout` column, no `closeouts` branch in a route handler and no
hardcoded query. `/collections/closeouts` is the same `collections` row, the same
`product_collections` membership and the same `getCollectionProducts()` as every
other collection; only the two rules in §6.6 distinguish it. The consequences
that matter:

- The client can change what CLOSEOUTS means — add "created before 2024", drop the
  tag rule, restrict to a category — from `/admin/catalog/collections`, with no
  deploy (hard rule 1).
- It can be scheduled (`starts_at` / `ends_at`), given per-market copy
  (`collection_market_content`), hidden in one market, hand-pinned with manual
  members, and sorted by `price_asc` like any other collection.
- Deleting the row removes the page and its nav item cleanly, instead of leaving a
  route that renders an empty hardcoded section.

**The market trap, and the column that closes it.** Membership in
`product_collections` is global, but "on sale" is a statement about one currency's
price row. Without anything further, a piece discounted only in the US would appear
on `/in/closeouts` at its full INR price — a customer-visible lie on a page whose
entire premise is that things are marked down.

> **SCHEMA ADDITION:** `collections.requires_sale_in_market BOOLEAN NOT NULL DEFAULT false`,
> plus
> `CREATE INDEX idx_prices_on_sale ON prices (product_id, market_code) WHERE sale_minor IS NOT NULL AND valid_to IS NULL AND deleted_at IS NULL;`
> When `true`, `getCollectionProducts(collectionId, marketCode)` appends one
> predicate to the listing query it already runs:
> ```sql
> AND (pc.source = 'manual'
>      OR EXISTS (SELECT 1 FROM prices pr
>                 WHERE pr.product_id = p.id AND pr.market_code = $market
>                   AND pr.sale_minor IS NOT NULL
>                   AND pr.valid_to IS NULL AND pr.deleted_at IS NULL))
> ```
> `pc.source = 'manual'` is the exemption and it is not a loophole: a hand-pinned
> member is a human decision about this page, and it is never overruled by a price
> predicate — the same rule that stops `refreshCollection()` deleting one (§6.4).
> Rule-derived members are filtered, which is the entire point, and it is why the
> `tag` rule came out of §6.6.

This is the one place the catalogue evaluates a rule at read time, and it is
justified: it is a single indexed `EXISTS` on a partial index whose predicate keeps
it tiny, not the nine-way per-collection join shape that materialisation exists to
avoid (02 §2.4). The alternative — market-qualified membership rows — means widening
`product_collections`' primary key, which every collection query and every
`INCLUDE (product_id)` index depends on, to fix one collection.

**The rejected alternative, for the record:** two collections, `closeouts-us` and
`closeouts-in`. It works, and it gives up the single `/collections/closeouts` URL
across markets, the shared editorial copy, and the `hreflang` pairing between the
market variants of one page — three real SEO assets traded for one boolean.

> **RESOLVED — was CHANGE REQUIRED IN 08 §4.2 and §4.3:** `CLOSEOUTS`, `14K GOLD` and
> *Verified applied by inspection of the target document.*
> `LAB GROWN DIAMONDS` are seeded `categories` rows (§7.1, 02 §6) **and** §6.6 rule
> sets, so 08 §4.2 routes `/closeouts`, `/14k-gold` and `/lab-grown-diamonds`
> through `[category]/page.tsx` while `/collections/[slug]` serves
> `/collections/closeouts`, `/collections/14k-gold` and
> `/collections/lab-grown-diamonds` — **two URLs for one idea, three times over.**
> This is the identical defect 08 §4.3 resolved for ONE OF A KIND by refusing the
> collection, and it is not resolved for these three anywhere in the set. It cannot
> be resolved the same way here: the CLOSEOUTS page *needs*
> `collections.requires_sale_in_market` (§8.2), which is a `collections` column with
> no `categories` equivalent, and 14K GOLD / LAB GROWN DIAMONDS need rule-driven
> membership rather than hand-assigned `product_categories` rows. 08 §4.3 must pick
> one of the two spellings per name and say which — either the three category rows
> exist only as navigation anchors whose `navigation_items.link_type='collection'`
> points at the `/collections/<slug>` URL and `[category]/page.tsx` never resolves
> them, or the `/collections/<slug>` form is canonical and the category rows are
> dropped from 08 §4.2's `[category]` path list. This section assumes the first and
> will follow whichever 08 records.

### 8.3 LAB GROWN DIAMONDS and diamond specification

Membership is §6.6's single `stone_is_lab_grown is_true` rule. The specification
data splits across two homes, on a clear principle: **a fact about a particular
stone in a particular piece lives on the pairing row; a fact the storefront filters
on lives in the attribute system.**

| Spec | Home | Type | Filterable |
| --- | --- | --- | --- |
| Carat weight | `product_stones.carat_weight NUMERIC(8,3)` | typed column | yes — range, no EAV cost |
| Stone count | `product_stones.stone_count SMALLINT` | typed column | no |
| Cut | `product_stones.cut TEXT` | typed column | via the mirrored attribute below |
| **Shape** | attribute `diamond_shape` | `select` | yes |
| **Clarity** | attribute `diamond_clarity` | `select` | yes |
| **Colour** | attribute `diamond_colour` | `select` | yes |
| **Cut grade** | attribute `diamond_cut_grade` | `select` | yes |
| **Certification lab** | attribute `certification_lab` | `select` | yes |
| **Certificate number** | attribute `certificate_number` | `text` | no |
| **Certificate document** | `product_media.role = 'certificate'` | media | no |

All seven attributes are seeded with
`applies_to_category_id = LAB GROWN DIAMONDS`, `scope = 'product'`,
`is_comparable = true`, and `is_required = true` for shape, clarity, colour and
certification lab — so they render as a single "Diamond specification" group in
Panel 7 only for products in that category, appear in the PDP spec table, and count
toward completeness check 14 and the publish gate.

**Why product scope and not variant scope,** even though these describe a stone:
the launch lab-grown catalogue is centre-stone pieces, where the graded stone is
the primary stone and the option axes are metal and size — facts that do not change
the diamond. `scope='product'` keeps one value per piece instead of ten identical
ones across ten variants.

**Why `attribute_options` and not free text:** a filterable facet needs a closed
value set. The option rows are seeded **empty** —

> **NEEDS INPUT:** the grading scales the client actually uses and which labs they
> accept. `attribute_options` for `diamond_clarity`, `diamond_colour`,
> `diamond_cut_grade`, `diamond_shape` and `certification_lab` ship with **no rows**;
> the attributes exist, the panel renders, and the facet stays hidden until options
> are entered from `/admin/catalog/attributes`. Seeding a grading scale or a lab name
> the client does not use would be an invented business fact published on a product
> page (hard rule 8).

**The expand path, recorded now.** If the client begins selling multi-diamond
pieces with per-stone grading, these five move from `product_attribute_values` to
columns on `product_stones` (`shape`, `clarity`, `colour`, `cut_grade`,
`certificate_number`, `certification_lab_id`). That is an additive migration plus a
backfill from the EAV rows keyed on the primary stone, and a change to one resolver
in `src/lib/catalog/attributes.ts` — not a redesign. It is written down here so it
is not discovered as one.

---

## 9. Schema additions required by this section

Every item below is new relative to 02 and is collected so the schema document can
absorb it verbatim. Nothing here renames or redefines an existing table or column.

| # | Object | Definition | Needed by |
| ---: | --- | --- | --- |
| 1 | `job_kind` enum | `ADD VALUE 'publish_scheduled'` | §1.2 scheduled publish |
| 2 | `products` | `completeness_score SMALLINT NOT NULL DEFAULT 0 CHECK (0..100)`, `completeness_checks JSONB NOT NULL DEFAULT '{}'`, `seo_score SMALLINT NOT NULL DEFAULT 0 CHECK (0..100)`, `seo_checks JSONB NOT NULL DEFAULT '{}'`, `scored_at TIMESTAMPTZ NULL`; `idx_products_completeness (completeness_score, id) WHERE deleted_at IS NULL` | §1.6, §1.7 |
| 3 | `products` | `ooak_quantity_override BOOLEAN NOT NULL DEFAULT false` | §8.1 |
| 4 | `products` | `sold_at TIMESTAMPTZ NULL`; `idx_products_sold (sold_at DESC) WHERE sold_at IS NOT NULL AND deleted_at IS NULL` | §8.1 |
| 5 | `categories` / `stones` / `materials` | `sku_token CHAR(3)` / `CHAR(3)` / `CHAR(4)`, `CHECK (= upper(...))`, partial unique `WHERE ... IS NOT NULL AND deleted_at IS NULL`. `NST` and `NMTL` are reserved sentinels and are never written as rows | §2.6 SKU generator |
| 6 | `attributes` | `scope TEXT NOT NULL DEFAULT 'product' CHECK (IN ('product','variant','both'))`, `is_required BOOLEAN NOT NULL DEFAULT false`, `value_min NUMERIC(14,4)`, `value_max NUMERIC(14,4)`, `decimal_places SMALLINT CHECK (0..4)`, `max_length INTEGER CHECK (1..10000)`, `help_text TEXT`, `chk_attributes_range` | §3.2, §3.4 |
| 7 | `collection_rule_operator` enum | `ADD VALUE 'not_contains'` | §6.2 |
| 8 | `collection_rule_field` enum | `ADD VALUE 'stone_is_lab_grown'`, `ADD VALUE 'is_on_sale'` | §6.2, §6.6, §8.3 |
| 9 | `collection_rules` | widen `chk_collection_rules_price_market` to `field NOT IN ('price','is_on_sale') OR value_market_code IS NOT NULL`; add `idx_collection_rules_field_target (field, value_uuid)` | §6.2, §6.4 |
| 10 | `collection_rule_values` | new table, PK `(rule_id, position)`, `chk_crv_one_value`, `idx_crv_rule` | §6.3 multi-value `in` |
| 11 | `collections` | `requires_sale_in_market BOOLEAN NOT NULL DEFAULT false`; `idx_prices_on_sale (product_id, market_code) WHERE sale_minor IS NOT NULL AND valid_to IS NULL AND deleted_at IS NULL` | §8.2 |
| 12 | `curated_facets` | `is_auto BOOLEAN NOT NULL DEFAULT false`, `product_count_cached INTEGER NOT NULL DEFAULT 0`; `idx_curated_facets_auto (facet_type, is_auto) WHERE is_active` | §4.2 generated facet pages |
| 13 | `AvailabilityBand` (TS) | five values — `'in_stock' \| 'low' \| 'out' \| 'made_to_order' \| 'sold'`, declared in `src/types/inventory.ts` and **canonical in 11 §7.1**. 01 §2.3's four-value comment, 05 §1.1's four-value band table and 07 §8.2's four-value denylist row each need the fifth | §2.5, §8.1 |
| 14 | `settings` seed keys | `catalog.ooak_sold_visibility` (`visible_noindex`), `catalog.ooak_sold_in_listings` (`true`), `catalog.ooak_default_quantity` (`1`), `catalog.low_stock_threshold` (`2`), `catalog.stone_section_min_products` (`1`), `catalog.curated_facet_min_products` (`4`) | §2.5, §4.2, §8.1 |
| 15 | ~~`prices.floor_minor`~~ | **WITHDRAWN.** This section previously commissioned `floor_minor` plus `chk_prices_hybrid_floor` and `chk_prices_floor_source`. None of the three is migrated: the floor is `pricing_formula_market_terms.floor_minor` and its effect is recorded as `prices.floor_adjustment_minor` (04 §2.2, 11 §7.4). The row is kept here, struck, so a reader who saw the earlier version does not re-add it | §2.4 |
| 16 | `product_variants` | `option_signature TEXT NOT NULL DEFAULT ''`; `CREATE UNIQUE INDEX idx_variants_option_signature ON product_variants (product_id, option_signature) WHERE deleted_at IS NULL AND option_signature <> ''` | §2.2 — two concurrent writers inserting the same option combination, which no row lock can prevent |
| 17 | `curated_facet_markets` | new table, PK `(curated_facet_id, market_code)`, `product_count INTEGER`, `is_active BOOLEAN`, `refreshed_at TIMESTAMPTZ`; `idx_cfm_active (market_code, curated_facet_id) WHERE is_active` | §4.2 — per-market facet activation, so an unpriced market does not get an empty indexable facet page |

Items 1, 7 and 8 are `ALTER TYPE … ADD VALUE`, which Postgres allows in a
transaction but not followed by use of the new value in the same transaction —
each ships in its own migration ahead of the migration that uses it (01 §5.4).
Items 2, 3, 4, 6, 11, 12 and 16 are nullable or defaulted column adds on
populated tables and are safe as expand-phase migrations; items 10 and 17 are new
tables; item 15 is withdrawn and migrates nothing. Every index in the list is created `CONCURRENTLY` in a standalone
migration. Item 16 needs one ordering note: `option_signature` must be backfilled
for existing variants **before** its unique index is created, or the index build
fails on the shared `''` default — backfill script first, `CREATE INDEX
CONCURRENTLY` second, in two migrations (01 §5.4 rule 5).

---

## 10. Open decisions for the client

> **NEEDS INPUT:** whether `NECKLACES` is a category distinct from `CHAINS` and
> `PENDANTS` (§7.1).

> **NEEDS INPUT:** the per-stone editorial copy and whether any origin, treatment or
> provenance claim may be published (§4.2).

> **NEEDS INPUT:** the diamond grading scales and accepted certification labs, so
> `attribute_options` can be seeded (§8.3).

> **NEEDS INPUT:** whether silver-linked, gold-linked or both, and the rate source
> (manual entry or a named vendor feed) (§5.3).

> **NEEDS INPUT:** the meta-title / meta-description template shape (§1.7).

> **NEEDS INPUT:** confirmation of what CLOSEOUTS means to the merchandiser.
> §6.6 now defines membership as "discounted in this market", with anything else
> added as a manual pin, because a `closeout` **tag** rule and
> `requires_sale_in_market` cancel each other out (§8.2). If the client instead
> expects the page to carry end-of-line pieces that are *not* marked down, that is a
> different page — the rule set becomes a tag rule with
> `requires_sale_in_market = false`, and the per-market discount guarantee goes with
> it. The architecture supports either; they cannot both be true of one collection.

> **NEEDS INPUT:** whether any piece needs `hybrid` — a metal-linked base plus a
> signed, stored, per-market admin adjustment (04 §2.4) — and if so, which of the
> three adjustment types (`percent`, `fixed_delta`, `fixed_override`) and who sets
> it. `price_source` ships with all three enum values, but **`hybrid` is deferred
> out of release 1** behind `settings['pricing.enable_hybrid']`, seeded `false`
> (04 §2.5). If the answer is "manual and metal-linked only", the flag is never
> turned on and nothing is lost. A per-market price **floor** is a separate,
> already-shipping question: it is a term on the formula
> (`pricing_formula_market_terms.floor_minor`), set once per market at
> `/admin/pricing/formula`, and it applies to `metal_linked` pieces too.

> **NEEDS INPUT:** the real catalogue — titles, copy, stones, metals, weights,
> photography, and the **independent** USD and INR price for each variant. Until it
> exists, every field above is structure, seeded blank, and every empty field hides
> its section rather than displaying invented text (hard rule 8).
