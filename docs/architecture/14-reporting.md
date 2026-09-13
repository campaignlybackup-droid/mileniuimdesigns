# 14 — Reporting and analytics

Owner of `src/lib/reporting/`, `/admin` (the dashboard) and `/admin/reports/**`.

This document closes architectural disagreement 5 ("there is no admin reporting
layer at all") and gaps 1, 2, 4 and 10 from `99-REVIEW-FINDINGS.md`. It conforms
to `11-registries.md` and does not relitigate it: 72 permission keys, no
`bulk_edit.*`, `price.read_cost` at owner/admin, `product_market_sort` (never
`product_market_metrics`), `product_metrics_refresh` as the refresh kind, the
52-code closed `ErrorCode` union, and the per-kind `systemPermitted` actor rule.

`01 §2.2` already names `reporting` as an eslint-boundaries element type and
already bans `SUM(`/`AVG(` over a `*_minor` column without a `currency_code` in
the same `GROUP BY` outside this module. This document is the module that rule
was written for.

---

## 1. The reporting module

### 1.1 Placement, tier and the layer rule

`src/lib/reporting/` is a service module. It sits **above every other tier** —
**T8 reporting**, the only member of that tier, extending `08 §1.2`'s table.

> **RESOLVED — was CHANGE REQUIRED IN 08 §1.2:** add a row to the tier table —
> *Verified applied in 08.*
> `| T8 reporting | reporting/ |` — and a fourth bullet to the three
> "consequences worth naming": *`reporting/` is T8 and nothing imports it except
> `src/app/(admin)/**`. It is the only module that may read across domains, and
> the only one no domain may read back. A service that imports a report is a
> service that has made a derived figure into an authority.*

| Property | Rule |
| --- | --- |
| May import | `src/lib/db/**`, `src/types/**`, `src/lib/config/**`, `src/lib/money.ts`, and the **read-only** exports of any lower-tier service (`getAvailability`, `resolvePriceBatch`, `listActiveMarkets`, `can`) |
| May **not** import | Any mutator; `src/lib/analytics/**` (the write path); any vendor SDK; `fetch` of any kind |
| May be imported by | `src/app/(admin)/**` only — pages and admin server actions |
| Cache | Never. No `cached()`, no `unstable_cache`, no `React.cache()` around a figure. Admin pages are `force-dynamic`, `no-store` (`08 §5`), and a cached report is a stale number a client makes a decision on |
| Writes | Exactly one: `refreshRollups()` in `rollup.ts`, the `product_metrics_refresh` job handler (§4.2). It writes only the two derived tables in §4.1 and nothing else, ever |

The two boundary bans are mechanical, not conventions:

```js
// eslint.config.mjs — no-restricted-imports, scoped to src/lib/reporting/**
{ patterns: ['@/lib/analytics/*', '**/vendors/*'] }
// no-restricted-globals: ['fetch'] in the same scope
```

`tests/unit/reporting-boundaries.test.ts` additionally AST-parses every export of
`src/lib/reporting/**` and fails on a call to any function in
`services-authorized.test.ts`'s mutator list — the same list `11 §3.3` point 2
uses for job handlers. The one permitted writer, `rollup.ts`, is allow-listed by
path in that test and by nothing else.

### 1.2 Files

```
src/lib/reporting/
├── index.ts        # the public surface; re-exports read functions only
├── source.ts       # ReportSource, ReportFigure, combine(), SOURCES
├── range.ts        # resolveWindows(), bucketFor(), startOfLocalDay()
├── dashboard.ts    # getDashboard()
├── sales.ts        # revenue, orders, AOV, market performance, time series
├── products.ts     # best sellers, top products, most viewed, slow movers
├── jewellery.ts    # top stones, top materials, categories, one-of-a-kind
├── inventory.ts    # stock counts, retail valuation, metal weight on hand
├── customers.ts    # new vs returning, lifetime value per currency
├── wishlist.ts     # most wishlisted, additions, wishlist→purchase
├── carts.ts        # abandonment and recovery
├── cost.ts         # THE ONLY file that may name cost_minor (§8)
├── rollup.ts       # refreshRollups() — the product_metrics_refresh handler
└── sql/            # one Prisma.sql fragment per report, no interpolation
```

> **RESOLVED — was CHANGE REQUIRED IN 01 §3:** the tree's `reporting/` line is a comment with no
> *Verified applied in 01.*
> files. Replace it with the fourteen entries above.

### 1.3 The source label, and the rule that a number has exactly one

**A report never mixes first-party server-recorded data with a third-party figure
in the same number.** Not as a sum, not as a ratio, not as a percentage delta. A
first-party numerator over a GA4 denominator is a fabricated conversion rate that
looks authoritative and cannot be reconciled with either system.

The rule is carried by the type, so mixing is a compile-time or run-time failure
rather than a review comment:

```ts
// src/lib/reporting/source.ts
export type SourceFamily = 'first_party' | 'third_party';

export type ReportSource = {
  readonly family: SourceFamily;
  /** The tables the figure was computed from. Rendered on hover. */
  readonly tables: readonly string[];
  /** Rendered under the figure, verbatim. */
  readonly label: string;
  /** third_party only; drives the "not configured" panel. */
  readonly vendor?: IntegrationKey;
};

export const SOURCES = {
  MONEY:      { family: 'first_party', tables: ['orders', 'order_items', 'refunds'],
                label: 'First-party, server-recorded (orders)' },
  EVENTS:     { family: 'first_party', tables: ['analytics_events'],
                label: 'First-party, server-recorded (events)' },
  ROLLUP:     { family: 'first_party', tables: ['product_daily_metrics', 'market_daily_metrics'],
                label: 'First-party, nightly rollup of server-recorded events' },
  STOCK:      { family: 'first_party', tables: ['inventory_items'],
                label: 'First-party, live inventory' },
  CATALOGUE:  { family: 'first_party', tables: ['products', 'product_stones', 'variant_materials'],
                label: 'First-party, current catalogue' },
  WISHLIST:   { family: 'first_party', tables: ['wishlist_items'],
                label: 'First-party, saved items as they stand now' },
  MAIL:       { family: 'first_party', tables: ['email_logs'],
                label: 'First-party, send log' },
} as const satisfies Record<string, ReportSource>;

export type ReportFigure<T> = {
  readonly value: T;
  readonly source: ReportSource;
  /** The instant the query ran. Rendered as "as at …" in the market's timezone. */
  readonly asOf: Date;
  readonly coverage: 'complete' | 'partial_retention' | 'unavailable';
  /** One sentence, shown under the figure when coverage <> 'complete'. */
  readonly note?: string;
};

/** The only way two figures become one. Throws InternalError with
 *  context.reason = 'report_source_mix' when the families differ. */
export function combine<A, B, C>(
  a: ReportFigure<A>, b: ReportFigure<B>, f: (a: A, b: B) => C,
): ReportFigure<C>;
```

`combine()` on two `first_party` figures produces a merged source whose `tables`
is the union and whose `label` names both — *"First-party, server-recorded
(orders ÷ events)"*. `combine()` across families throws. No new `ErrorCode` is
added: a source mix is a programming defect, so it is `InternalError` with
`context.reason`, which `11 §2.2` already forbids from reaching a client.

`tests/unit/reporting-source-mix.test.ts` asserts that every exported function in
`src/lib/reporting/**` returns `ReportFigure<…>` or a structure whose leaves are
`ReportFigure<…>`, and that no returned figure has an empty `tables` array.

**Third-party figures are not in this release.** `SOURCES` has no GA4 or Meta
entry, `src/lib/reporting/` cannot `fetch`, and the dashboard has no GA4 tile.
The GA4/Meta/Ads integration state is shown by the existing integration strip on
`/admin` (`08 §5`), which names the missing env vars and nothing else. When
`ga4` is `unconfigured` the dashboard renders every first-party tile normally and
the strip says "GA4: not configured — the figures below are first-party and
complete". It never renders a sample, an estimate, or a zero dressed as a
measurement (hard rule 7).

> **NEEDS INPUT:** whether the client wants GA4 session and channel figures
> surfaced inside the admin at all, given they will not reconcile with the
> first-party numbers beside them (ad blockers, consent denial, and GA4's
> modelled conversions each move the GA4 figure and none of them moves ours). The
> architecture supports it as a **separate panel with its own source label and its
> own date control** — never merged into a tile above. Nothing is built until the
> answer is yes.

### 1.4 Public signatures

Every function takes `actor` first and re-checks permissions itself — an admin
page's `requirePermission()` is not this module's authorization (hard rule 9,
`01 §2.1`).

```ts
// src/lib/reporting/index.ts
export type MarketFilter = { kind: 'all' } | { kind: 'market'; marketCode: MarketCode };

export type ReportParams = {
  readonly range: RangeInput;            // §7
  readonly market: MarketFilter;
  readonly locationId?: string;          // inventory reports only
  readonly limit?: number;               // top-N reports; default 20, max 200
};

export function getDashboard(actor: Actor, p: ReportParams): Promise<DashboardView>;

export function getRevenueSeries(actor: Actor, p: ReportParams): Promise<SeriesView<MoneyPoint>>;
export function getOrderSeries(actor: Actor, p: ReportParams): Promise<SeriesView<CountPoint>>;
export function getMarketPerformance(actor: Actor, p: ReportParams): Promise<ReportFigure<MarketRow[]>>;

export function getTopProducts(actor: Actor, p: ReportParams & { by: 'units' | 'revenue' }): Promise<ReportFigure<ProductRow[]>>;
export function getMostViewedProducts(actor: Actor, p: ReportParams): Promise<ReportFigure<ProductRow[]>>;
export function getSlowMovers(actor: Actor, p: ReportParams): Promise<ReportFigure<ProductRow[]>>;

export function getTopStones(actor: Actor, p: ReportParams): Promise<ReportFigure<StoneRow[]>>;
export function getTopMaterials(actor: Actor, p: ReportParams): Promise<ReportFigure<MaterialRow[]>>;
export function getTopCategories(actor: Actor, p: ReportParams): Promise<ReportFigure<CategoryRow[]>>;
export function getOneOfAKindReport(actor: Actor, p: ReportParams): Promise<OneOfAKindView>;

export function getStockSummary(actor: Actor, p: ReportParams): Promise<StockSummaryView>;
export function getLowStock(actor: Actor, p: ReportParams): Promise<ReportFigure<StockRow[]>>;
export function getLowStockByStone(actor: Actor, p: ReportParams): Promise<ReportFigure<StoneStockRow[]>>;
export function getMetalWeightOnHand(actor: Actor, p: ReportParams): Promise<ReportFigure<MaterialWeightRow[]>>;
export function getInventoryValueAtRetail(actor: Actor, p: ReportParams): Promise<ReportFigure<ValuationRow[]>>;

export function getCustomerSummary(actor: Actor, p: ReportParams): Promise<CustomerSummaryView>;
export function getTopCustomers(actor: Actor, p: ReportParams): Promise<ReportFigure<CustomerRow[]>>;

export function getMostWishlisted(actor: Actor, p: ReportParams): Promise<ReportFigure<WishlistRow[]>>;
export function getMostWishlistedStones(actor: Actor, p: ReportParams): Promise<ReportFigure<StoneRow[]>>;
export function getWishlistAdditionSeries(actor: Actor, p: ReportParams): Promise<SeriesView<CountPoint>>;
export function getWishlistPurchaseRate(actor: Actor, p: ReportParams): Promise<WishlistConversionView>;

export function getCartRecovery(actor: Actor, p: ReportParams): Promise<CartRecoveryView>;
export function listAbandonedCarts(actor: Actor, p: ReportParams & { cursor?: string }): Promise<AbandonedCartPage>;

// src/lib/reporting/cost.ts — the only module that names cost_minor.
export function assertCostReadable(actor: Actor): void;                 // throws ForbiddenError
export function getInventoryValueAtCost(actor: Actor, p: ReportParams): Promise<ReportFigure<ValuationRow[]>>;
export function getInventoryValueByMaterial(actor: Actor, p: ReportParams): Promise<ReportFigure<MaterialValuationRow[]>>;
export function getMarginByProduct(actor: Actor, p: ReportParams): Promise<ReportFigure<MarginRow[]>>;

// src/lib/reporting/rollup.ts — the ONE writer.
export function refreshRollups(days: number, at: Date): Promise<{ productRows: number; marketRows: number }>;
```

Supporting shapes:

```ts
export type MoneyPoint  = { bucketStartUtc: Date; localLabel: string; amount: Money };
export type CountPoint  = { bucketStartUtc: Date; localLabel: string; count: number };
export type SeriesView<P> = ReportFigure<ReadonlyArray<{
  marketCode: MarketCode; currencyCode: CurrencyCode; timezone: string;
  granularity: Granularity; points: readonly P[];
}>>;
```

A `SeriesView` is **one series per market**, never a merged series. §2.2 says why.

---

## 2. The dashboard — `/admin`

`/admin` is `dashboard.view` (`11 §1.3` row 1). That key grants the **frame**:
the date control, the market control and the integration strip. **Each tile is
additionally gated on its own permission and is absent — not greyed, not blurred,
not zeroed — when the actor lacks it.** A greyed tile with a shape still tells a
content editor the order count has four digits.

When the actor's tile set is empty (`content_editor` holds none of the tile
permissions), the dashboard renders one line naming the sections they can reach,
and no tiles.

### 2.1 The tile inventory

Every tile: source table, the permission it needs, whether the date range applies,
and what the market filter does to it.

| # | Tile | Permission | Source | Range applies | Per-market variant |
| ---: | --- | --- | --- | :-: | --- |
| 1 | **Revenue** | `order.read` | `orders` | yes, on `paid_at` | One amount **per currency**, never one total (§2.2) |
| 2 | **Refunds** | `order.read` | `refunds` | yes, on `succeeded_at` | Per currency |
| 3 | **Net revenue** | `order.read` | 1 − 2, per currency | yes | Per currency |
| 4 | **Orders** | `order.read` | `orders` | yes, on `paid_at` | A count; **summable across markets**, and the all-markets view shows the total |
| 5 | **Average order value** | `order.read` | 1 ÷ 4, per currency | yes | Per currency. Never averaged across currencies |
| 6 | **Customers** | `customer.read` | `orders` + `customers` | yes | Three counts: first-time buyers, returning buyers, registrations (§2.4) |
| 7 | **Checkout completion rate** | `order.read` | `orders` + `market_daily_metrics` | yes | A percentage per market; the all-markets view shows each market's own rate and no combined rate |
| 8 | **Visit-to-order rate** | `order.read` | `orders` + `market_daily_metrics` | yes | As 7, with the session caveat printed under it (§2.5) |
| 9 | **Products sold** | `order.read` | `order_items` | yes | Units. **Summable across markets**; the all-markets view shows the total |
| 10 | **Inventory value at retail** | `inventory.read` + `price.read` | `inventory_items` + `prices` | **no — point in time** | One amount per market currency (§2.6) |
| 11 | **Inventory value at cost** | `inventory.read` + **`price.read_cost`** | `inventory_items` + `prices` | **no** | One amount per market currency; omitted from the projection entirely without `price.read_cost` (§8) |
| 12 | **Low stock** | `inventory.read` | `inventory_items` | **no** | A count of variants at band `low`; market-blind (stock is held at locations, not markets) with a location filter |
| 13 | **Out of stock** | `inventory.read` | `inventory_items` + `products` | **no** | A count of variants at band `out`. **`sold` is a separate tile** and never folded in |
| 14 | **Sold (one of a kind)** | `inventory.read` | `products.sold_at` | yes, on `sold_at` | A count of unique pieces sold in the window |
| 15 | **Abandoned carts recovered** | `order.read` | `carts` + `email_logs` | yes | §6 |

Tiles 1–9 and 14–15 respond to the date control. Tiles 10–13 are point-in-time
measurements and say so in place of a date: **"As at 12 Sep 2026, 14:32
America/New_York"**. A stock figure with a date range attached is a figure
someone will read as "stock added this week".

### 2.2 The currency rule, stated once and enforced once

**A revenue figure is never summed across currencies.** Not on the dashboard, not
in a chart, not in a CSV, not in a tooltip. USD and INR prices are independent
(hard rule 2) and there is no FX rate anywhere in this system to convert them
with; inventing one inside a report would make the client's headline number a
function of a rate nobody approved.

Mechanically:

- Every money query carries `currency_code` in its `GROUP BY`. This is the lint
  rule `01 §2.2` already wrote, and `src/lib/reporting/` is the one place it is
  permitted at all — because it is the one place the review is small enough to be
  real.
- Every money-bearing return type is `ReadonlyArray<{ currencyCode; amount: Money }>`,
  never `Money`. There is no function in this module that returns a bare total.
- `tests/unit/reporting-no-cross-currency.test.ts` AST-parses `src/lib/reporting/sql/**`
  and fails on any aggregate over a `*_minor` identifier whose statement does not
  name `currency_code` in `GROUP BY`; and fails on any exported symbol typed
  `ReportFigure<Money>`.

**A multi-market total is shown per currency or not shown.** The revenue tile
under "All markets" renders two stacked figures — `$…  USD` and `₹…  INR` — each
with its own window (§2.3), and **no third line**. The same applies to AOV,
refunds, net revenue and recovered revenue.

**Counts are not money.** Orders, units sold, customers, sessions, low-stock
variants and wishlist saves are dimensionless and *are* summed across markets.
The all-markets view shows one total for those and says which markets it covers.

### 2.3 How a day boundary is computed against `markets.timezone`

`markets.timezone` is `TEXT NOT NULL`, seeded `America/New_York` for `US` and
`Asia/Kolkata` for `IN` (`02 §2.1`). `02` says it is "used for report day
boundaries" and nothing said how. This is how.

**There is no cross-market "today".** 9 a.m. in Kolkata and 9 a.m. in New York are
different instants and different calendar days; a single UTC-midnight boundary
would put a US evening order into the next Indian day and make both markets'
"yesterday" wrong. So `resolveWindows()` returns **one window per market in
scope**, each computed in that market's own zone:

```ts
// src/lib/reporting/range.ts
export type ReportWindow = {
  readonly marketCode: MarketCode;
  readonly currencyCode: CurrencyCode;
  readonly timezone: string;        // IANA, verbatim from markets.timezone
  readonly fromUtc: Date;           // inclusive
  readonly toUtc: Date;             // EXCLUSIVE
  readonly localFrom: string;       // 'YYYY-MM-DD'
  readonly localTo: string;         // 'YYYY-MM-DD', the last day INCLUDED
  readonly granularity: Granularity;
  /** The equal-length window immediately before this one, for the delta arrow. */
  readonly compareFromUtc: Date;
  readonly compareToUtc: Date;
};

export function resolveWindows(
  input: RangeInput, market: MarketFilter, now: Date,
): Promise<readonly ReportWindow[]>;
```

The boundary itself, with no new dependency (the stack in `00 §5` has no
`date-fns-tz` and this does not need one):

```ts
/** The UTC instant at which the given local calendar day begins in `timeZone`. */
export function startOfLocalDay(localDate: string, timeZone: string): Date {
  // 1. Guess: treat the local wall clock as if it were UTC.
  const guess = new Date(`${localDate}T00:00:00Z`);
  // 2. Ask the zone what wall clock that instant actually shows, and correct.
  const offset1 = zoneOffsetMs(guess, timeZone);
  const corrected = new Date(guess.getTime() - offset1);
  // 3. One more pass: the correction can cross a DST transition.
  const offset2 = zoneOffsetMs(corrected, timeZone);
  return offset2 === offset1 ? corrected : new Date(guess.getTime() - offset2);
}

/** Local wall clock minus UTC, in ms, at `instant`, via Intl only. */
function zoneOffsetMs(instant: Date, timeZone: string): number;
// Intl.DateTimeFormat('en-CA', { timeZone, hourCycle: 'h23',
//   year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit' })
// .formatToParts() → reassemble as 'YYYY-MM-DDTHH:mm:ssZ' → minus instant.getTime().
// 'en-CA' is chosen because it yields YYYY-MM-DD parts; the locale is never read
// from the market and never from the request.
```

Then the query is **filtered in UTC and bucketed in local time**:

```sql
-- src/lib/reporting/sql/revenue-series.sql
SELECT date_trunc($4, o.paid_at AT TIME ZONE $3)          AS bucket_local,
       o.currency_code,
       SUM(o.total_minor)::bigint                          AS gross_minor,
       COUNT(*)                                            AS orders
  FROM orders o
 WHERE o.market_code  = $1
   AND o.paid_at     >= $2::timestamptz           -- ReportWindow.fromUtc
   AND o.paid_at      < $5::timestamptz           -- ReportWindow.toUtc, EXCLUSIVE
   AND o.status      <> 'cancelled'
 GROUP BY bucket_local, o.currency_code
 ORDER BY bucket_local;
-- $3 = markets.timezone, $4 = 'hour' | 'day' | 'week' | 'month'
```

Four properties this fixes, each of which is a defect if it is not written down:

1. **The filter is sargable and the bucket is local.** `paid_at >= $2 AND
   paid_at < $5` uses a plain `timestamptz` index (§3.3). Writing
   `WHERE (paid_at AT TIME ZONE $3)::date BETWEEN …` instead makes the predicate
   non-sargable and scans the table, which is how a dashboard becomes a 9-second
   page after two years of orders.
2. **Windows are half-open.** `[fromUtc, toUtc)`. `BETWEEN` on timestamps
   double-counts anything landing exactly on a midnight boundary and is banned in
   `src/lib/reporting/sql/**` by `tests/unit/reporting-half-open.test.ts`, which
   greps those files for `BETWEEN` applied to a timestamp column.
3. **DST days are 23 or 25 hours long and the report says so.** On a US
   spring-forward day the hourly chart has 23 buckets, not 24, because
   `date_trunc('hour', … AT TIME ZONE 'America/New_York')` produces 23 distinct
   values. The bucket labels come from the same expression as the bucket keys, so
   the axis and the data cannot disagree. `Asia/Kolkata` has no DST and a fixed
   +05:30 offset, which is exactly why hardcoding a whole-hour offset anywhere
   would pass every Indian test and fail every American one.
4. **`now` is passed in, never called.** `resolveWindows(input, market, now)`
   takes the instant. No function in `src/lib/reporting/` calls `new Date()`,
   mirroring the ban `01 §2.2` already places on `src/lib/pricing/**`, so a
   report is reproducible and testable at a fixed instant.

**Which timestamp each figure keys on**, decided once so two tiles cannot
disagree:

| Figure | Timestamp | Why not the other one |
| --- | --- | --- |
| Revenue, orders, AOV, products sold, top-N by units or revenue | `orders.paid_at` | Money is recognised when a verified webhook confirms it. Keying on `placed_at` counts `pending_payment` orders that never paid and inflates every figure by the abandonment rate |
| Refunds, net revenue | `refunds.succeeded_at` | A Q2 refund of a Q1 order lands in Q2. Back-dating it to the order's date silently rewrites a quarter after it was reported |
| Orders **placed** (funnel only, labelled "placed") | `orders.placed_at` | A separate, differently-named figure. It is never the numerator of a revenue ratio |
| One-of-a-kind sold | `products.sold_at` | `11 §7.1`: the `sold` band keys on `sold_at`, never on `available_quantity <= 0` |
| Behavioural counts | `analytics_events.occurred_at`, server-clamped | `chk_analytics_occurred_sane` already bounds it to ±30 min of `created_at` |
| Wishlist saves (stock) | none — point in time | `wishlist_items` has no lifecycle beyond insert and delete |
| Stock, valuations | none — point in time | §2.1 |

**Which orders count.** `status <> 'cancelled'`, and `paid_at IS NOT NULL` follows
from the range predicate. `pending_review` **is** included: `11 §7.3` is explicit
that on a fraud hold the money and the stock are settled and only fulfilment is
held, so excluding it would make the revenue tile drop every time the threshold
caught an order. `paid_unfulfillable` is included in gross and its automatic
refund appears in the refunds figure, which is where the reversal belongs.

### 2.4 The customers tile

`customers` has no market column that means anything for a report —
`default_market_code` is a preference, not a fact about where they bought. So the
tile is three explicitly-named counts rather than one ambiguous "customers":

| Figure | Definition | Market-splittable |
| --- | --- | :-: |
| **First-time buyers** | Customers whose **earliest** `orders.paid_at` falls in the window. Attributed to the market of that first order | yes |
| **Returning buyers** | Distinct `orders.customer_id` with a paid order in the window whose earliest paid order predates `fromUtc` | yes |
| **Registrations** | `customers.created_at` in the window, `is_guest = false`, `anonymized_at IS NULL` | **no** — and the tile says so: "Registrations are not attributable to a market; a sign-up happens before a purchase." The market control greys this figure and leaves the number visible |

```sql
-- first-time buyers, per market, per window
WITH first_order AS (
  SELECT customer_id, MIN(paid_at) AS first_paid_at
    FROM orders
   WHERE customer_id IS NOT NULL AND paid_at IS NOT NULL AND status <> 'cancelled'
   GROUP BY customer_id)
SELECT o.market_code, COUNT(DISTINCT o.customer_id)
  FROM first_order f
  JOIN orders o ON o.customer_id = f.customer_id AND o.paid_at = f.first_paid_at
 WHERE f.first_paid_at >= $1 AND f.first_paid_at < $2
 GROUP BY o.market_code;
```

Guest orders (`orders.customer_id IS NULL`) are counted once in the order count
and **never** in either buyer count. Counting them by `lower(email)` would merge
two people who share a household address and would create a customer identity in
a report that the customer table does not have. The tile shows "N guest orders
not attributed to a customer" beneath, so the number is visible rather than
silently dropped.

Lifetime value comes from `customer_currency_totals` (`02 §2.3`) and is already
per currency by construction; `idx_cct_currency_spend (currency_code,
total_spent_minor DESC)` serves the top-customers list directly. It is
point-in-time and ignores the date control.

### 2.5 The two conversion rates, and what each one can mean

**Checkout completion rate** (the primary, tile 7) is
`orders paid in window ÷ checkout_started events in window`, same market, same
window. Both halves are **server-recorded** (`08 §7.1` marks `checkout_started`
"Yes") — a server action, not a beacon — so neither is affected by an ad blocker
or a consent refusal. This is the number the client should be shown first. Source
label: *"First-party, server-recorded (orders ÷ events)"*, produced by
`combine()` over `SOURCES.MONEY` and `SOURCES.ROLLUP`.

**Visit-to-order rate** (tile 8) is `orders paid ÷ session-days`, and it carries a
permanently-printed caveat because it cannot be made honest by better
engineering:

> Visits are counted as **session-days** — one visitor on three days counts three
> times, and one visitor with cookies disabled counts once per page. This is a
> trend line, not an audited conversion rate.

The denominator comes from `market_daily_metrics.sessions`, which is
`COUNT(DISTINCT session_id)` **per local day**. Distinct sessions cannot be summed
across days — the same `md_sid` visiting on Monday and Tuesday would be counted
twice by the sum and once by a true distinct count over the range — so the figure
is named `session-days` in the type, the column, the label and the CSV header. A
rollup that quietly called this "sessions" would be a wrong number in a place
nobody audits.

`order_paid` cannot be used as the numerator of a session-keyed rate at all: it is
recorded inside the webhook transaction (`08 §7.2`), which has no browser session,
so `analytics_events.session_id` is NULL on every one of those rows. Joining them
would produce zero. That is why both rates take their numerator from `orders`.

### 2.6 Inventory value — the gap-1 decision

`prices.cost_minor` lives on a **market-scoped** `prices` row
(`uq_prices_active (variant_id, market_code)`). So "inventory value" is not one
number. It is one number per market currency, and hard rule 2 forbids adding them.

**Decision: inventory value is computed over all locations and valued once per
active market, in that market's currency.** The whole stock holding has a US
dollar value and an Indian rupee value; they are two valuations of the same
shelves, not two halves of one total. The screen renders them stacked with the
market name on each, and no total row. A location filter narrows *which shelves*,
not which currency.

The cost lookup, with the product-level fallback the price model already has
(`04 §1.4` steps 1–2):

```sql
-- src/lib/reporting/cost.ts → sql/inventory-value-at-cost.sql
SELECT m.code AS market_code, m.currency_code,
       SUM(ii.on_hand_quantity * c.cost_minor)::bigint AS value_minor,
       SUM(ii.on_hand_quantity) FILTER (WHERE c.cost_minor IS NULL) AS uncosted_units
  FROM inventory_items ii
  JOIN product_variants pv ON pv.id = ii.variant_id AND pv.deleted_at IS NULL
  CROSS JOIN markets m
  LEFT JOIN LATERAL (
        SELECT p.cost_minor
          FROM prices p
         WHERE p.market_code = m.code AND p.valid_to IS NULL AND p.deleted_at IS NULL
           AND (p.variant_id = pv.id OR (p.variant_id IS NULL AND p.product_id = pv.product_id))
         ORDER BY (p.variant_id IS NULL)      -- variant-level row wins
         LIMIT 1) c ON true
 WHERE m.is_active
   AND ($1::uuid IS NULL OR ii.location_id = $1)
 GROUP BY m.code, m.currency_code;
```

**A variant with no `cost_minor` in that market contributes nothing to the value
and is counted in `uncosted_units`, which is rendered beside the figure.** It is
never treated as zero cost. "Inventory value $412,900 across 1,840 pieces — 96
pieces have no US cost recorded and are excluded" is a true statement; the same
number without the second clause is a measurement dressed over a gap.

Inventory value **at retail** is the same query against the resolved display price
rather than `cost_minor`, lives in `inventory.ts` rather than `cost.ts`, and needs
only `price.read`.

---

## 3. Charts

### 3.1 The six charts

| Chart | Aggregation | Series | Route |
| --- | --- | --- | --- |
| **Revenue over time** | `SUM(orders.total_minor)` grouped by bucket and `currency_code` | One per market. Two markets render two panels stacked, each with its own y-axis and currency, never two lines on one axis | `/admin` and `/admin/reports/sales` |
| **Orders over time** | `COUNT(*)` on the same predicate | One per market **plus** a combined line, because a count is dimensionless | `/admin`, `/admin/reports/sales` |
| **Top products** | `SUM(oi.quantity - oi.returned_quantity)` or `SUM(oi.line_total_minor)` grouped by `oi.product_id` | Horizontal bars, top N (default 20) | `/admin/reports/products` |
| **Top categories** | Same, grouped by `oi.category_path` | Two views: first path segment (top level) and full path (leaf) | `/admin/reports/products` |
| **Top stones** | Same, joined through `product_stones` | §4.3 | `/admin/reports/stones` |
| **Market performance** | One row per market: revenue (own currency), orders, units, AOV, completion rate | A table, not a chart — five different units cannot share an axis | `/admin/reports/sales` |

Charts render through `<Chart>` and `<AnalyticsCard>` (`10 §3.3`). Both take a
required `source: ReportSource` prop.

> **Applied in `10 §3.3`.** `AnalyticsCard` and `Chart` take a **required**
> `source: ReportSource` prop — a card without a source does not compile — and
> `ReportEmpty` is now in the admin component inventory: it is what renders in
> place of a chart when a window contains no data, stating the window and the
> market in words ("No paid orders between 1 and 30 September 2026 in the US
> market") and never drawing an axis with a flat zero line, which reads as a
> measurement of nothing rather than as an absence of data.
>
> **DECISION CHANGED:** this section asked for the source label in
> `--md-t-small`, `--md-taupe`. The colour is **`--md-fg-secondary`**. `10 §2.1`'s
> known-contrast callout puts `--md-taupe` on ivory at ≈2.3:1 and bans it for any
> text under 18px that must be read — and a source label is the one line on the
> card that decides whether the figure above it can be trusted. The size token is
> unchanged.

### 3.2 Bucket granularity per range

Fixed, not chosen by the user — a 90-day chart with hourly buckets is 2,160 points
nobody can read and a query that scans the same rows to produce them.

| Range | Granularity | Buckets | Local label format |
| --- | --- | ---: | --- |
| Today | `hour` | 23–25 (DST) | `14:00` |
| Yesterday | `hour` | 23–25 | `14:00` |
| Last 7 days | `day` | 7 | `Mon 8 Sep` |
| Last 30 days | `day` | 30 | `8 Sep` |
| Last 90 days | `day` | 90 | `8 Sep` |
| Year to date | `month` | 1–12 | `Sep 2026` |
| Custom ≤ 2 days | `hour` | ≤ 50 | `14:00` |
| Custom ≤ 92 days | `day` | ≤ 92 | `8 Sep` |
| Custom ≤ 400 days | `week` (ISO, `date_trunc('week', …)`) | ≤ 58 | `w/c 8 Sep` |
| Custom > 400 days | `month` | — | `Sep 2026` |

`bucketFor(range)` returns the `Granularity`, and it is the *only* producer of the
`date_trunc` unit — the string reaches SQL as a bound parameter from a closed
union (`'hour' | 'day' | 'week' | 'month'`), never as interpolated text.

**Empty buckets are filled in TypeScript, not SQL.** `generate_series` in the
query would need the timezone arithmetic repeated a second time and would drift
from `resolveWindows()` on exactly the DST days where it matters. `range.ts`
enumerates the expected buckets from the same `startOfLocalDay()` used to build
the window and left-joins the rows onto them. A bucket with no orders renders as a
gap with a zero value and the tooltip "no orders", which is different from "no
data" and is the distinction §3.1's `<ReportEmpty>` exists for.

### 3.3 The index serving each chart

Four indexes this document adds. `02 §4` sized the existing set for the storefront
and the admin lists; none of them has `paid_at` or `succeeded_at` as a leading
range key, and every chart above is a range scan over exactly those.

> **SCHEMA ADDITION (02 §7.12, reporting):**
> ```sql
> CREATE INDEX idx_orders_reporting_paid ON orders (market_code, paid_at)
>   INCLUDE (currency_code, total_minor)
>   WHERE paid_at IS NOT NULL AND status <> 'cancelled';
>
> CREATE INDEX idx_refunds_reporting ON refunds (market_code, succeeded_at)
>   INCLUDE (currency_code, amount_minor)
>   WHERE status = 'succeeded' AND succeeded_at IS NOT NULL;
>
> CREATE INDEX idx_order_items_product ON order_items (product_id, created_at DESC)
>   WHERE product_id IS NOT NULL;
>
> CREATE INDEX idx_inventory_below_reorder ON inventory_items (location_id, variant_id)
>   WHERE reorder_point IS NOT NULL AND available_quantity <= reorder_point;
> ```
> The first two are covering: every dashboard money figure is then an index-only
> scan over the window and never touches the heap. `idx_orders_list (market_code,
> status, created_at DESC)` cannot serve them — `created_at` is not `paid_at`, and
> `status` between the market and the timestamp forces a scan per status value.
> `idx_order_items_product` mirrors the existing `idx_order_items_variant` for the
> product-level reports, which are the jewellery reports in §4.
> `idx_inventory_below_reorder` is a column-to-column partial predicate, which
> Postgres permits, and it is what makes the reorder report a scan of the rows
> that qualify rather than of the table.

| Chart | Driving index | Plan |
| --- | --- | --- |
| Revenue over time | `idx_orders_reporting_paid` | Index-only range scan, `HashAggregate` on `(bucket, currency_code)` |
| Orders over time | `idx_orders_reporting_paid` | As above, count only |
| Refunds | `idx_refunds_reporting` | As above |
| Top products / categories | `idx_orders_reporting_paid` → nested loop into `idx_order_items_order` | Drive from the smaller set (orders in window), never from `order_items` |
| Top stones / materials | As top products, then hash join `product_stones` (PK `(product_id, stone_id)`) / `variant_materials` (PK `(variant_id, material_id)`) | Both PKs are already leading-column-correct for this direction |
| Most viewed | `idx_pdm_market_date` on `product_daily_metrics` (§4.1) | Never `analytics_events` directly |
| Low stock | `idx_inventory_low_stock` | Existing partial index, `available_quantity <= 2` |
| Below reorder point | `idx_inventory_below_reorder` | New |

**The escape hatch, with its trigger condition.** Money and unit reports read
`orders`/`order_items`/`refunds` **live**, with no rollup. At this business's
scale those tables hold thousands of rows a year and a covering index answers a
90-day window in single-digit milliseconds; a money rollup would also be a second
money authority, which is the hazard `08 §2.3` wrote a rule against for
`product_market_sort`. **At 250,000 `order_items` rows**, add
`order_daily_metrics` with the same `(market_code, local_date)` shape as §4.1 and
the same refresh job. Not before: a rollup that is never large enough to be needed
is a reconciliation problem with no upside.

### 3.4 `product_market_sort` is not read by any report

`11 §7.9` and `08 §3.2` restrict `product_market_sort` to a `WHERE` or an
`ORDER BY` and nowhere else. This module honours that literally: **no report
SELECTs `units_90d`, `min_price_minor` or `max_price_minor`.** Best sellers is
computed from `order_items` over the caller's window.

The reason is not only the rule. `units_90d` is a nightly snapshot of a fixed
90-day trailing window; a report with a "last 30 days" control that read it would
show a 90-day number under a 30-day label, and a report with a "last 90 days"
control would show yesterday's 90 days. Two best-seller lists in one admin that
disagree by a day is the defect that makes an owner stop trusting both.

---

## 4. Jewellery-specific analytics

Gap 1: *"the single largest unowned requirement in the set."* This section owns
it.

### 4.1 The two rollup tables

`analytics_events` is the one table in this schema that reaches millions of rows
(BRIN-indexed, 400-day retention, partition escape hatch at 50 M). Every
behavioural report — most viewed, wishlist additions over time, session counts,
funnel steps — is a `GROUP BY` over a date range on that table, and
`idx_analytics_product` is product-leading, so none of them is servable as
written.

Two derived tables, **one refresh job kind, reusing `product_metrics_refresh`**
(`11 §3.2`, `systemPermitted: true`, `dedupeKey: 'kind'`). No new `job_kind`.

> **SCHEMA ADDITION (02 §7.11, operations and derived caches):**
> ```sql
> CREATE TABLE product_daily_metrics (
>   product_id   UUID    NOT NULL REFERENCES products(id) ON DELETE CASCADE,
>   market_code  CHAR(2) NOT NULL REFERENCES markets(code) ON DELETE CASCADE,
>   local_date   DATE    NOT NULL,
>   views          INTEGER NOT NULL DEFAULT 0,
>   add_to_carts   INTEGER NOT NULL DEFAULT 0,
>   wishlist_adds  INTEGER NOT NULL DEFAULT 0,
>   computed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
>   CONSTRAINT pk_pdm PRIMARY KEY (product_id, market_code, local_date),
>   CONSTRAINT chk_pdm_nonneg CHECK (views >= 0 AND add_to_carts >= 0 AND wishlist_adds >= 0)
> );
> CREATE INDEX idx_pdm_market_date  ON product_daily_metrics (market_code, local_date DESC, product_id);
> CREATE INDEX idx_pdm_views        ON product_daily_metrics (market_code, local_date DESC, views DESC);
>
> CREATE TABLE market_daily_metrics (
>   market_code       CHAR(2) NOT NULL REFERENCES markets(code) ON DELETE CASCADE,
>   local_date        DATE    NOT NULL,
>   sessions          INTEGER NOT NULL DEFAULT 0,  -- DISTINCT session_id WITHIN THIS DAY
>   product_views     INTEGER NOT NULL DEFAULT 0,
>   add_to_carts      INTEGER NOT NULL DEFAULT 0,
>   checkouts_started INTEGER NOT NULL DEFAULT 0,
>   searches          INTEGER NOT NULL DEFAULT 0,
>   wishlist_adds     INTEGER NOT NULL DEFAULT 0,
>   carts_abandoned   INTEGER NOT NULL DEFAULT 0,
>   computed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
>   CONSTRAINT pk_mdm PRIMARY KEY (market_code, local_date)
> );
> ```
> **Neither table holds a money column.** That is deliberate and is the property
> that keeps them out of the price-authority problem `08 §3.2` had to legislate
> for `product_market_sort`: there is no amount in either table to read, so no
> rule is needed about reading one.
>
> `local_date` is the market's **local** calendar date, computed with
> `AT TIME ZONE markets.timezone` at refresh time. Materialising the timezone once,
> here, is why the rollup exists at all — every behavioural report then filters on
> a `DATE` in the same calendar the tiles use.
>
> `sessions` is distinct **within one day**. Summing it over a range yields
> session-days, not unique sessions (§2.5), and the column comment says so.
>
> Rows whose counters are all zero are **not written**. For 2,000 products × 2
> markets, only the products that were actually viewed produce a row.

> **RESOLVED — was CHANGE REQUIRED IN 02 §1.4 (retention):** add `product_daily_metrics` and
> *Verified applied in 02.*
> `market_daily_metrics` to the hard-delete schedule at
> `settings['reporting.rollup_retention_days']`, seeded **400** to match
> `analytics_events` — a rollup that outlives its source cannot be rebuilt and
> becomes an unverifiable number. `market_daily_metrics` is ~730 rows a year and
> is pruned on the same schedule only for consistency, not for size.

### 4.2 The refresh job

```ts
// src/lib/reporting/rollup.ts — the product_metrics_refresh handler
export async function refreshRollups(days: number, at: Date): Promise<{...}>;
```

- Enqueued nightly by `/api/cron/run-jobs` and on demand from
  `/admin/system/jobs`. `dedupeKey: 'kind'` (`11 §3.2`) so two invocations cannot
  overlap; `idx_jobs_singleton` already covers `product_metrics_refresh`.
- Recomputes the last `days` **local days per market**, default
  `settings['reporting.rollup_lookback_days'] = 3`, plus the current partial day.
  A three-day lookback absorbs a late `occurred_at` (clamped to −30 minutes by
  `chk_analytics_occurred_sane`), a failed run, and a timezone offset.
- Idempotent: `INSERT … ON CONFLICT (product_id, market_code, local_date) DO UPDATE`
  with the recomputed counters, not `+=`. Re-running it produces the same table.
- **It also refreshes `product_market_sort.units_90d`**, which is the job's
  existing responsibility (`11 §3.2`) and is unchanged. One job, three tables,
  one dedupe key.

```sql
-- the product half, one market at a time
INSERT INTO product_daily_metrics (product_id, market_code, local_date, views, add_to_carts, wishlist_adds)
SELECT e.product_id, e.market_code,
       (e.occurred_at AT TIME ZONE $2)::date AS local_date,
       COUNT(*) FILTER (WHERE e.event_name = 'product_viewed'),
       COUNT(*) FILTER (WHERE e.event_name = 'add_to_cart'),
       COUNT(*) FILTER (WHERE e.event_name = 'wishlist_added')
  FROM analytics_events e
 WHERE e.market_code = $1
   AND e.occurred_at >= $3 AND e.occurred_at < $4     -- UTC bounds from resolveWindows
   AND e.product_id IS NOT NULL
   AND e.event_name IN ('product_viewed','add_to_cart','wishlist_added')
 GROUP BY 1, 2, 3
    HAVING COUNT(*) > 0
ON CONFLICT (product_id, market_code, local_date) DO UPDATE
   SET views = EXCLUDED.views, add_to_carts = EXCLUDED.add_to_carts,
       wishlist_adds = EXCLUDED.wishlist_adds, computed_at = now();
```

The current partial day is always recomputed, so "today" on the dashboard is
current to the last refresh and the tile prints **"Views as at 14:05 — refreshed
every 5 minutes"** rather than implying real time. `product_viewed` is recorded
from the PDP's uncached `<Suspense>` boundary (`08 §7.2`), so the count is
per-visitor and honest; nothing in this module can make it more so.

### 4.3 The reports

Each: query, rollup, refresh kind, route. All routes are under
`/admin/reports/**` (§9).

#### Top stones — `/admin/reports/stones`, `stone.update` OR `product.read`

```sql
SELECT s.id, s.name, s.slug,
       SUM(oi.quantity - oi.returned_quantity)::int AS units,
       oi.currency_code,
       SUM(oi.line_total_minor - oi.refunded_minor)::bigint AS revenue_minor
  FROM orders o
  JOIN order_items oi ON oi.order_id = o.id
  JOIN product_stones ps ON ps.product_id = oi.product_id
  JOIN stones s ON s.id = ps.stone_id
 WHERE o.market_code = $1 AND o.paid_at >= $2 AND o.paid_at < $3 AND o.status <> 'cancelled'
 GROUP BY s.id, s.name, s.slug, oi.currency_code
 ORDER BY units DESC
 LIMIT $4;
```

No rollup — it is driven by orders in the window, which is a small set.

**Two honest disclosures the screen prints, because this join cannot avoid
either:**

1. **Stone attribution is a live join, not a snapshot.** `order_items` carries
   `stones_snapshot JSONB`, but `02 §2` is explicit that JSONB snapshots are "not
   queryable — reporting aggregates the numeric columns beside them, never the
   JSON", and grouping a report by a JSON path would be a second, unindexed
   attribution mechanism. So the report joins `product_stones` as it stands
   today. Consequence: **editing a product's stone links changes last year's
   report.** The screen says "Attributed from the current catalogue" and the
   source label is `combine(MONEY, CATALOGUE)`.
2. **A deleted product drops out.** `order_items.product_id` is nullable
   (`ON DELETE SET NULL` is how order immutability survives a product delete), so
   units sold under a since-deleted product have no stone. The query reports them
   as a single **"Unattributed"** row with its own unit and revenue figures. They
   are never silently excluded and never folded into the largest stone.

A multi-stone piece counts once under **each** of its stones, and the footer says
so: *"A piece set with two stones appears under both. Column totals therefore
exceed total units sold."* The alternative — attributing only to
`product_stones.is_primary` — is available as a toggle and is the default for the
revenue column, because revenue double-counted across stones is a money figure
that does not reconcile with the revenue tile. **Units may double-count; money may
not.**

#### Top jewellery categories — `/admin/reports/products`, `product.read` + `order.read`

```sql
SELECT split_part(oi.category_path, '/', 1) AS top_level,   -- or oi.category_path for leaf
       SUM(oi.quantity - oi.returned_quantity)::int AS units,
       oi.currency_code, SUM(oi.line_total_minor - oi.refunded_minor)::bigint AS revenue_minor
  FROM orders o JOIN order_items oi ON oi.order_id = o.id
 WHERE o.market_code = $1 AND o.paid_at >= $2 AND o.paid_at < $3 AND o.status <> 'cancelled'
 GROUP BY 1, oi.currency_code ORDER BY units DESC;
```

**Grouped by `order_items.category_path` — the snapshot — and deliberately not by
a join to `product_categories`.** This is the opposite decision from top stones
and the reason is hard rule 4: the category path *was captured at purchase time*
precisely because it is a merchandising fact that moves, and a product
re-categorised from RINGS to CLOSEOUTS last week would otherwise rewrite every
prior month's category mix. Stones have no snapshot column to use; categories do,
so they use it. Rows with `category_path IS NULL` appear as **"Uncategorised at
purchase"**.

#### Top materials — `/admin/reports/materials`, `material.update` OR `product.read`

```sql
SELECT mt.id, mt.name, mt.kind, mt.purity_label,
       SUM(oi.quantity - oi.returned_quantity)::int AS units,
       oi.currency_code, SUM(oi.line_total_minor - oi.refunded_minor)::bigint AS revenue_minor
  FROM orders o
  JOIN order_items oi ON oi.order_id = o.id
  JOIN variant_materials vm ON vm.variant_id = oi.variant_id
  JOIN materials mt ON mt.id = vm.material_id
 WHERE o.market_code = $1 AND o.paid_at >= $2 AND o.paid_at < $3 AND o.status <> 'cancelled'
   AND ($4::boolean IS FALSE OR vm.is_primary)
 GROUP BY mt.id, mt.name, mt.kind, mt.purity_label, oi.currency_code
 ORDER BY units DESC;
```

Same live-join caveat and the same primary-only default for the revenue column.
`idx_variant_materials_primary` makes the `is_primary` filter free.

#### Top One-of-a-Kind pieces — `/admin/reports/one-of-a-kind`, `product.read` + `order.read`

"Top" is meaningless for a piece with an inventory of one — every OOAK sells at
most once, so a units ranking is a list of ones. The report answers the two
questions that are actually asked about unique pieces:

**Sold in window — time to sale**

```sql
SELECT p.id, p.title, p.slug, p.published_at, p.sold_at,
       EXTRACT(day FROM (p.sold_at - p.published_at))::int AS days_to_sale,
       oi.currency_code, oi.line_total_minor
  FROM products p
  LEFT JOIN order_items oi ON oi.product_id = p.id
  LEFT JOIN orders o ON o.id = oi.order_id AND o.status <> 'cancelled' AND o.paid_at IS NOT NULL
 WHERE p.is_one_of_a_kind AND p.deleted_at IS NULL
   AND p.sold_at >= $1 AND p.sold_at < $2
 ORDER BY days_to_sale ASC;
```
Served by `idx_products_sold (sold_at DESC) WHERE sold_at IS NOT NULL AND deleted_at IS NULL`.
Aggregates shown: median and 90th-percentile days-to-sale, overall and grouped by
primary stone, primary material and price band. That is the number that tells a
jewellery house what to make next.

**Unsold and ageing — point in time, ignores the date control**

```sql
SELECT p.id, p.title, p.published_at,
       (now() - p.published_at) AS age,
       pms.min_price_minor  -- NO: see below
  FROM products p
 WHERE p.is_one_of_a_kind AND p.sold_at IS NULL AND p.deleted_at IS NULL
   AND p.status = 'active' AND p.published_at < now() - ($1 || ' days')::interval
 ORDER BY p.published_at ASC;
```
The price column comes from `resolvePriceBatch(variantIds, marketCode, now)` in
the service layer — **not** from `product_market_sort`, per §3.4 and `11 §7.9`.
The ageing threshold is `settings['reporting.ooak_ageing_days']`, seeded `90`,
editable at `/admin/settings/general`; it is a display threshold, not a business
claim, so seeding a round number invents nothing.

#### Inventory value by material — `/admin/reports/materials`, `inventory.read` + **`price.read_cost`**

The hard part of gap 1. A variant may carry several `variant_materials` rows, and
a variant's cost is one number for the whole piece. There is no honest way to
split a diamond ring's cost between the gold and the stone.

**Decision: the whole variant's cost is attributed to its primary material**
(`variant_materials.is_primary`, which `idx_variant_materials_primary` guarantees
is at most one per variant). A variant with no primary material is bucketed as
**"Unassigned"** and shown as its own row. Weight-proportional allocation is
explicitly rejected: it would attribute most of a pavé ring's value to its metal
because metal is heavy, which is the opposite of true.

```sql
SELECT COALESCE(mt.name, 'Unassigned') AS material, m.code AS market_code, m.currency_code,
       SUM(ii.on_hand_quantity * c.cost_minor)::bigint AS value_minor,
       SUM(ii.on_hand_quantity)                        AS units,
       SUM(ii.on_hand_quantity) FILTER (WHERE c.cost_minor IS NULL) AS uncosted_units
  FROM inventory_items ii
  JOIN product_variants pv ON pv.id = ii.variant_id AND pv.deleted_at IS NULL
  LEFT JOIN variant_materials vm ON vm.variant_id = pv.id AND vm.is_primary
  LEFT JOIN materials mt ON mt.id = vm.material_id
  CROSS JOIN markets m
  LEFT JOIN LATERAL ( /* the §2.6 cost lookup */ ) c ON true
 WHERE m.is_active
 GROUP BY 1, 2, 3;
```

Rendered as one table **per market currency**, stacked, with no total across them.
The screen's subtitle is the rule in one sentence: *"Cost is recorded per market,
so this is the same shelves valued twice. The two figures are not added."*

**And a second figure that needs no allocation at all: metal weight on hand.**

```sql
SELECT mt.id, mt.name, mt.purity_label,
       SUM(ii.on_hand_quantity * vm.weight_grams) AS grams_on_hand
  FROM inventory_items ii
  JOIN variant_materials vm ON vm.variant_id = ii.variant_id
  JOIN materials mt ON mt.id = vm.material_id
 WHERE ($1::uuid IS NULL OR ii.location_id = $1)
 GROUP BY mt.id, mt.name, mt.purity_label ORDER BY grams_on_hand DESC;
```
Grams are not money, so this is one number across all markets, needs only
`inventory.read`, splits correctly across a multi-material piece, and is the
figure that drives reordering for a house that buys silver by weight. It is on the
same screen, above the valuation, because it is the more trustworthy of the two.

#### Low-stock stones — `/admin/reports/stones`, `inventory.read`

```sql
SELECT s.id, s.name, s.slug,
       SUM(ii.available_quantity)::int AS available_units,
       COUNT(DISTINCT pv.id)           AS variants,
       COUNT(DISTINCT pv.id) FILTER (WHERE ii.available_quantity = 0) AS variants_out
  FROM stones s
  JOIN product_stones ps ON ps.stone_id = s.id
  JOIN product_variants pv ON pv.product_id = ps.product_id AND pv.deleted_at IS NULL
  JOIN inventory_items ii ON ii.variant_id = pv.id
  JOIN products p ON p.id = ps.product_id AND p.deleted_at IS NULL AND p.status = 'active'
 WHERE ($1::uuid IS NULL OR ii.location_id = $1)
 GROUP BY s.id, s.name, s.slug
 ORDER BY available_units ASC;
```

Ranked ascending, always complete. A highlight threshold
(`settings['reporting.stone_low_stock_threshold']`) marks rows red **only when it
is set**; it is seeded `NULL`, which means no row is marked and the report is still
useful.

> **NEEDS INPUT:** the stone-level low-stock threshold — the number of available
> units across all pieces set with a stone below which the client wants a warning.
> It is a buying-cadence decision, not an architectural one, and no number is
> invented. Until it is supplied, the report ranks and does not warn.

#### Most-viewed products — `/admin/reports/products`, `product.read`

```sql
SELECT d.product_id, SUM(d.views)::int AS views, SUM(d.add_to_carts)::int AS add_to_carts
  FROM product_daily_metrics d
 WHERE d.market_code = $1 AND d.local_date >= $2::date AND d.local_date <= $3::date
 GROUP BY d.product_id ORDER BY views DESC LIMIT $4;
```
`idx_pdm_market_date`. Joined in the service layer to `products` for title and
slug, and to the top-products result for a **view-to-purchase rate per product** —
`combine(ROLLUP, MONEY)`, both first-party, one merged label. That ratio is the
single most useful product report on the site: a piece with high views and no
sales is priced wrong or photographed badly, and nothing else in the admin says so.

#### Best sellers — `/admin/reports/products`, `order.read`

`getTopProducts(actor, { …, by: 'units' })`. Computed live from `order_items` over
the caller's window (§3.4), never from `product_market_sort`.

#### Slow movers — `/admin/reports/products`, `product.read` + `inventory.read`

Active, published products with `on_hand_quantity > 0` and **zero** paid units in
the window, ordered by `on_hand_quantity DESC`. The inverse of best sellers and the
one an owner acts on. A product with no views **and** no sales is separated from a
product with views and no sales — two different problems, two sections on one
screen.

---

## 5. Wishlist analytics — `/admin/reports/wishlist`

Permission: `product.read`. Closes gap 2 — `idx_wishlist_items_product` has
justified itself in `02 §2.7` since the beginning and served no screen.

### 5.1 Most wishlisted — a stock, and market-blind

```sql
SELECT wi.product_id, COUNT(*)::int AS saves, COUNT(DISTINCT w.customer_id)::int AS customers
  FROM wishlist_items wi JOIN wishlists w ON w.id = wi.wishlist_id
 GROUP BY wi.product_id ORDER BY saves DESC LIMIT $1;
```

Index-only over `idx_wishlist_items_product`. Two properties printed on the screen:

- **It is a stock, not a flow.** It counts items saved *right now*. It has no date
  range, ignores the date control, and prints "as at" like the inventory tiles.
- **It cannot be split by market.** `wishlists` and `wishlist_items` carry no
  market column, because a saved item is a piece a person wants and is not scoped
  to where they were standing. The market control **disables itself** on this
  panel with that sentence as the reason, rather than silently ignoring the
  selection or inventing an attribution through `customers.default_market_code`.

Most-wishlisted **stones** is the same query joined through `product_stones`, with
the same multi-stone footnote as §4.3.

### 5.2 Additions over time — a flow, and market-splittable

`product_daily_metrics.wishlist_adds` / `market_daily_metrics.wishlist_adds`,
derived from the `wishlist_added` event, which **does** carry `market_code`
(`08 §7.1` records it server-side).

The two figures measure different things and the screen says so in one line:
*"Saves counts items on wishlists today. Additions counts saves made in the
window, including items since removed."* An item saved and removed appears in
additions and not in saves; that is the correct behaviour for both and is a
question someone will otherwise ask.

### 5.3 Wishlist-to-purchase conversion, and what it can and cannot mean

```sql
-- denominator: distinct (customer, product) wishlist ADDITIONS in the window
WITH adds AS (
  SELECT DISTINCT e.customer_id, e.product_id, MIN(e.occurred_at) AS added_at
    FROM analytics_events e
   WHERE e.event_name = 'wishlist_added' AND e.customer_id IS NOT NULL
     AND e.product_id IS NOT NULL AND e.market_code = $1
     AND e.occurred_at >= $2 AND e.occurred_at < $3
   GROUP BY 1, 2)
SELECT COUNT(*)::int AS wishlisted,
       COUNT(*) FILTER (WHERE EXISTS (
         SELECT 1 FROM orders o JOIN order_items oi ON oi.order_id = o.id
          WHERE o.customer_id = adds.customer_id AND oi.product_id = adds.product_id
            AND o.status <> 'cancelled' AND o.paid_at IS NOT NULL
            AND o.paid_at > adds.added_at
            AND o.paid_at < adds.added_at + ($4 || ' days')::interval))::int AS purchased
  FROM adds;
```

Attribution window `settings['reporting.wishlist_attribution_days']`, seeded `60`,
shown in the header as "within 60 days of saving".

**The denominator is the `wishlist_added` event, not the `wishlist_items` row.**
Removing an item deletes the row, so a `wishlist_items`-based denominator counts
only saves that survived — and an item is most often removed *because it was
bought*. That denominator would drop most of the successes and produce a rate that
is wrong in the flattering direction.

**What this number can mean:** the share of saved pieces that the same signed-in
customer went on to buy, within the attribution window, in that market. It is a
useful trend: if it falls after a price change on a collection, the saves are
telling you the price moved past the intent.

**What it cannot mean, printed under the figure:**

1. **It is not a conversion rate for the site.** Guest wishlists are not modelled
   (`02 §2.7` — a `wishlist_items` row requires a customer), so every shopper who
   never signed in is absent from both halves. The population here is signed-in
   customers, who already convert at a different rate from everyone else.
2. **It is correlation, not causation.** Saving a piece and buying a piece are
   both expressions of the same intent. The wishlist did not necessarily cause the
   purchase, and this figure cannot be used to value the wishlist feature.
3. **It has a 400-day ceiling.** The denominator is an `analytics_events` row, and
   those are pruned at `settings['analytics.retention_days']`. A window older than
   retention returns `coverage: 'partial_retention'` and the screen says which
   dates are missing rather than returning a smaller, wrong rate.
4. **The same-product match is exact.** A customer who saved one ring and bought a
   different one counts as not converted. Matching at the collection or stone level
   would be a different, softer metric, and quietly widening the match is how a
   number becomes indefensible.

---

## 6. Abandoned-cart reporting — `/admin/reports/abandoned-carts`

Closes gap 4. The mechanism is complete and unreported: `/api/cron/abandoned-carts`
hourly, `idx_carts_abandoned`, `carts.abandoned_email_sent_at`, the
`abandoned_cart` email template, and `05 §2.3`'s rule that the mail carries no
price. An owner cannot currently answer "did the email work".

### 6.1 One new event, and why the other two are not needed

`carts` already records both facts durably: `abandoned_email_sent_at` says a mail
was queued, `converted_order_id` says the cart became an order. No event is needed
for either — and an event for a fact a table already holds is a second source that
will eventually disagree with the first.

There is exactly one gap, and it is a **survivorship bias in the denominator**:
`/api/cron/cleanup-sessions` hard-deletes carts inactive 90 days where
`status <> 'converted'`, while a converted cart is kept forever because
`orders.cart_id` points at it. So after 90 days the failures are gone and the
successes remain, and the recovery rate climbs toward 100% on its own.

> **RESOLVED — was CHANGE REQUIRED IN 08 §7.1:** add one row to the canonical event table —
> *Verified applied in 08.*
> `| cart_abandoned | /api/cron/abandoned-carts selects a cart and queues the mail | — | — | Yes only |`.
> `market_code` comes from `carts.market_code`; `properties` is
> `{ cartId, itemCount }`; **it carries no `revenue_minor`** — a cart's value is
> not revenue and must never enter a revenue aggregate. Add `cart_abandoned` to
> `src/lib/analytics/events.ts` and to the example list in `02 §2.9`'s
> `event_name` column.
>
> The event exists for exactly one reason: it survives in `analytics_events` for
> 400 days after the `carts` row is pruned at 90, which is what keeps the
> denominator from being deleted while the numerator is kept.

### 6.2 The metrics

All per market, all on the market's local day boundaries (§2.3).

| Metric | Definition | Source |
| --- | --- | --- |
| **Carts abandoned** | `cart_abandoned` events in window (falls back to `carts` rows for windows inside 90 days, and the two are asserted equal by the consistency check below) | `EVENTS` |
| **Recovery emails sent** | `email_logs` where `template_key = 'abandoned_cart'` and `status IN ('sent','delivered')` and `created_at` in window | `MAIL` |
| **Emails skipped (unconfigured)** | the same, `status = 'skipped_unconfigured'` | `MAIL` |
| **Carts recovered** | `carts` where `abandoned_email_sent_at` in window, `converted_order_id IS NOT NULL`, and the order's `paid_at` is within `settings['reporting.recovery_attribution_hours']` (seeded `72`) of `abandoned_email_sent_at` | `MONEY` |
| **Recovery rate** | recovered ÷ emails sent | `combine(MONEY, MAIL)` |
| **Recovered revenue** | `SUM(orders.total_minor)` over those orders, **per currency** | `MONEY` |
| **Median time to recovery** | `paid_at − abandoned_email_sent_at` | `MONEY` |

```sql
-- recovered carts and revenue, per market, per currency
SELECT c.market_code, o.currency_code,
       COUNT(*)::int                      AS recovered,
       SUM(o.total_minor)::bigint         AS recovered_minor,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY o.paid_at - c.abandoned_email_sent_at) AS median_lag
  FROM carts c
  JOIN orders o ON o.id = c.converted_order_id
 WHERE c.market_code = $1
   AND c.abandoned_email_sent_at >= $2 AND c.abandoned_email_sent_at < $3
   AND o.paid_at IS NOT NULL AND o.status <> 'cancelled'
   AND o.paid_at < c.abandoned_email_sent_at + ($4 || ' hours')::interval
 GROUP BY c.market_code, o.currency_code;
```

> **SCHEMA ADDITION (02 §2.7, `carts`):**
> ```sql
> CREATE INDEX idx_carts_recovery ON carts (market_code, abandoned_email_sent_at)
>   WHERE abandoned_email_sent_at IS NOT NULL;
> ```
> `idx_carts_abandoned` is partial on `abandoned_email_sent_at IS NULL` — it is the
> cron's selection index and is precisely the wrong half for this report.

**"Emails skipped (unconfigured)" is shown as its own figure and never as zero
sends.** When `resend` is unconfigured, `email_logs` rows carry
`status = 'skipped_unconfigured'` (`11 §6`) and the screen reads: *"Resend is not
configured. 41 recovery emails were queued and not sent. The recovery rate below
is not measurable for this window."* The rate renders as `—`, not `0%`. A zero
here is the exact failure hard rule 7 names.

### 6.3 The screen

| Panel | Permission | Contents |
| --- | --- | --- |
| Summary | `dashboard.view` + `order.read` | The seven metrics above, per market, with the delta against the preceding equal window |
| Recovery over time | `order.read` | Abandoned / mailed / recovered as three count series (dimensionless, so one chart per market with three lines is legitimate) |
| Cart list | `order.read` | One row per abandoned cart in the window: market, item count, `last_activity_at`, whether mailed, whether recovered, the order number if recovered |
| Cart list — email column | **`customer.read`** | `carts.email` is **omitted from the projection** without it, exactly as `getOrderDetail()` omits the customer block (`07 §2.4` note 2). Not masked in the UI — absent from the query |

`listAbandonedCarts()` is keyset-paginated on `(abandoned_email_sent_at, id)` and
never offset-paginated.

The nightly `consistency_check` job (`11 §3.2`) gains one assertion: for the last
seven days, the `cart_abandoned` event count and the `carts` row count per market
must agree. A divergence means the cron ran and the event write did not, which is
the only way this report can be quietly wrong.

> **NEEDS INPUT:** whether the client wants a **holdout group** — a fixed
> percentage of abandoned carts that receive no recovery email — so that the
> recovered revenue figure can be stated as *incremental*. Without one, "recovered
> revenue" is an upper bound: some of those shoppers would have returned anyway,
> and no analysis of this data can separate them. The architecture is one nullable
> `carts.recovery_holdout BOOLEAN` column and one `settings['marketing.recovery_holdout_bp']`
> row; it is not built until the answer is yes, because a holdout is a decision to
> deliberately not email some customers and that is the client's to make.

---

## 7. Filters

One control pair on every reporting screen: **range** and **market**. Both are URL
search params, so a report is linkable and a saved link reproduces the window.

### 7.1 Range presets

`?range=<preset>` or `?from=YYYY-MM-DD&to=YYYY-MM-DD`. All boundaries are computed
by `startOfLocalDay()` in **each market's own `markets.timezone`** (§2.3), so the
same preset resolves to two different UTC windows when the market filter is "all".

| Preset | Local window | Comparison window | Granularity |
| --- | --- | --- | --- |
| `today` | `[start of today, now)` | The same elapsed span of yesterday — **not all of yesterday**, or the arrow says "down 60%" at 9 a.m. every day | hour |
| `yesterday` | `[start of yesterday, start of today)` | The day before | hour |
| `last_7` | `[start of today − 6 days, now)` — includes today | The 7 days before that | day |
| `last_30` | `[start of today − 29 days, now)` | The 30 days before | day |
| `last_90` | `[start of today − 89 days, now)` | The 90 days before | day |
| `year` | `[1 Jan of the current local year, now)` | The same span of last year, day-for-day | month |
| `custom` | `[start of from, start of (to + 1 day))` — `to` is **inclusive** to the user, exclusive in SQL | The immediately preceding equal-length span | §3.2 |

Rules the control enforces:

- `to` before `from` is a `ValidationError` at the action boundary, not a swap.
- A custom span longer than **400 days** is accepted, and every event-derived
  figure on the screen returns `coverage: 'partial_retention'` with the note "Event
  data before <date> has been pruned; order figures are complete." Money figures
  stay `complete` — `orders` is never pruned.
- A range whose `toUtc` is in the future is clamped to `now` and the header says
  "to today".
- The preset is stored in `saved_views.filters` as the **preset name**, not as
  resolved dates, so a saved "last 30 days" view is still last 30 days next month.
  A custom range stores the two local dates and the market code whose timezone
  resolved them.

### 7.2 The market filter, and its interaction with the timezone rule

`?market=all | US | IN` — validated against `listActiveMarkets()`, exactly as
`/api/analytics/[market]/collect` validates its segment. An unknown or inactive
code is a `MarketNotFoundError`, never a silent fallback to the primary market.

| Selection | Windows | Money figures | Count figures | Header |
| --- | --- | --- | --- | --- |
| `US` | one, `America/New_York` | one USD figure | one figure | "Last 30 days · US · times shown in America/New_York" |
| `IN` | one, `Asia/Kolkata` | one INR figure | one figure | "…Asia/Kolkata" |
| `all` | **one per active market** | one figure **per currency**, stacked, no total | one per market **plus a total** | "Last 30 days · All markets · each market's days measured in its own timezone" |

**The all-markets header sentence is not decoration.** Without it, a US owner
looking at "today, all markets" sees an India figure covering a day that started
9½ hours before theirs, reads the two as one day, and concludes India outsold the
US on a Monday that has not happened yet in New York.

Charts under `market=all` render one panel per market, never one merged axis. For
count series, an additional combined panel is offered and is bucketed by **each
market's own local day**, which means the combined series is a sum of two local
calendars — stated in the panel's subtitle. That is the only honest combination
available, and it is offered only for counts.

### 7.3 Settings this section introduces

Seeded in `prisma/seed/06-settings.ts` with `group_key = 'reporting'`, surfaced at
`/admin/settings/general`, all `settings.manage` to write and `settings.read` to
see:

| Key | Type | Seed | Market-scoped |
| --- | --- | --- | :-: |
| `reporting.rollup_lookback_days` | `number` | `3` | no |
| `reporting.rollup_retention_days` | `number` | `400` | no |
| `reporting.wishlist_attribution_days` | `number` | `60` | no |
| `reporting.recovery_attribution_hours` | `number` | `72` | no |
| `reporting.ooak_ageing_days` | `number` | `90` | no |
| `reporting.stone_low_stock_threshold` | `number` | **`NULL`** | no |
| `reporting.default_range` | `string` | `'last_30'` | no |

> **NEEDS INPUT:** whether the client reports on a **fiscal** year rather than the
> calendar year — India's statutory financial year runs April to March while the
> US business year is the calendar year, so "this year" may mean two different
> spans in the two markets. The `year` preset is calendar and is labelled "Year to
> date". A fiscal preset is one `settings['reporting.fiscal_year_start_month']`
> row per market and one branch in `resolveWindows()`; nothing is built until the
> client names the months, and no month is assumed.

---

## 8. Cost and margin exposure

`prices.cost_minor` is supplier cost. `11 §1.3` row 22 puts `price.read_cost` at
**owner and admin only** — deliberately not `catalog_manager`, who may edit prices
but may not see margin, and not `analyst`, who may see revenue but not cost.

### 8.1 The mechanical containment

**Every query in this system that names `cost_minor`, `variant_component_costs` or
any `*_cost_minor` column lives in `src/lib/reporting/cost.ts`,** and every
exported function in that file calls `assertCostReadable(actor)` as its first
statement.

```ts
// src/lib/reporting/cost.ts
export function assertCostReadable(actor: Actor): void {
  if (!can(actor, 'price.read_cost')) throw new ForbiddenError('price.read_cost');
}
```

`tests/unit/reporting-cost-isolation.test.ts`:

- greps `src/**` for `cost_minor`, `costMinor`, `marginMinor`, `margin_bp` and
  `variant_component_costs`, and fails on a hit outside
  `src/lib/reporting/cost.ts`, `src/lib/pricing/**` (which computes it) and
  `src/lib/db/types.ts`;
- asserts every exported function in `cost.ts` begins with `assertCostReadable`;
- asserts no type exported from `src/lib/reporting/index.ts` has a field whose name
  matches `/cost|margin/i`.

This is the same shape as `01 §2.2`'s ban on price helpers outside
`src/lib/pricing/**`, and it exists for the same reason: one address means one
review.

### 8.2 Which screens hide what, for whom

A withheld column is **omitted from the projection**, never rendered blurred,
greyed, masked or as `•••`. A masked value is still a value in the HTML and in the
JSON the page streams.

| Screen | Without `price.read_cost` | With it |
| --- | --- | --- |
| `/admin` tile 11, inventory value at cost | Tile absent entirely | Rendered, per market currency |
| `/admin/reports/inventory-value` | The at-retail table only; the page's heading reads "Inventory value at retail" and the at-cost section does not exist in the DOM | Both tables, at-retail and at-cost, side by side |
| `/admin/reports/materials` | Metal weight on hand (grams) and units; **no** value-by-material table | Both |
| `/admin/reports/products` — best sellers, top products | Units and revenue columns | Plus unit cost, gross margin, margin % |
| `/admin/reports/sales` — market performance | Revenue, orders, units, AOV | Plus cost of goods and gross margin, per currency |
| `/admin/reports/one-of-a-kind` | Sale price, days to sale | Plus cost and realised margin per piece |
| `/admin/reports/stones`, `/materials` — revenue columns | Revenue only | Plus margin |
| `/admin/pricing/prices` | Already specified in `08 §5`: cost and margin columns omitted from the projection | — |
| **Any report CSV export** | §8.3 | — |

`getDashboard()` takes the actor and builds its tile list from
`can(actor, …)` per tile; the `DashboardView` returned to the page contains only
the tiles the actor holds. The page renders what it is given and makes no
permission decision of its own — hiding UI is not authorization (hard rule 9), and
here the UI has nothing to hide because the data never reached it.

### 8.3 Exports

Report CSVs go through the existing job machinery rather than a new download path:
`exportReport(actor, reportKey, params)` enqueues a `job_kind = 'export'` row with
`created_by_user_id` set, so `11 §3.2`'s `systemPermitted: false` applies and the
job runs as that person with their permissions re-resolved at run time.

Required: `export.run` **and** the report's own permission **and**, when the report
carries cost or margin columns, `price.read_cost` — re-checked inside the job, not
only at enqueue.

> **RESOLVED — was CHANGE REQUIRED IN 11 §1.5:** extend the last paragraph. It currently reads
> *Verified applied in 11.*
> "`exportRun()` requires `export.run` plus the resource's own read permission,
> plus `customer.export` for any resource containing customer PII". Add: *"…plus
> **`price.read_cost`** for any export whose columns include `cost_minor` or a
> derived margin. The export writer for `products`, `variants` and `prices` omits
> those columns for an actor without it rather than refusing the export — the same
> projection rule the screens use — and `tests/integration/export-cost-columns.test.ts`
> asserts a `catalog_manager` export of `prices` contains no cost header."*

---

## 9. Routes, permissions and phase

### 9.1 The admin routes

> **RESOLVED — was CHANGE REQUIRED IN 08 §5:** insert a **Reports** section between "Customers"
> *Verified applied in 08.*
> and "Settings and system", with these rows. `08 §5`'s existing `/admin` row
> should also gain "— tile set per `14 §2.1`" and its sentence "Never a simulated
> number" is retained verbatim.

| Path | Permission | Screen |
| --- | --- | --- |
| `/admin/reports` | `dashboard.view` | Index of the reports the actor may open; a report they lack the permission for is not listed |
| `/admin/reports/sales` | `dashboard.view` + `order.read` | Revenue / orders / AOV series, market performance table, margin columns behind `price.read_cost` |
| `/admin/reports/products` | `dashboard.view` + `product.read` + `order.read` | Best sellers, top products by revenue, most viewed, view-to-purchase, slow movers, top categories |
| `/admin/reports/stones` | `dashboard.view` + `product.read` | Top stones, most-wishlisted stones, low-stock stones (`inventory.read` for the last) |
| `/admin/reports/materials` | `dashboard.view` + `product.read` | Top materials, metal weight on hand (`inventory.read`), inventory value by material (**`price.read_cost`**) |
| `/admin/reports/one-of-a-kind` | `dashboard.view` + `product.read` + `order.read` | Days to sale, sell-through by stone / material / price band, aged unsold |
| `/admin/reports/inventory-value` | `dashboard.view` + `inventory.read` + `price.read` | At retail always; at cost behind **`price.read_cost`** |
| `/admin/reports/wishlist` | `dashboard.view` + `product.read` | Most wishlisted, additions over time, wishlist-to-purchase |
| `/admin/reports/abandoned-carts` | `dashboard.view` + `order.read` | §6; the email column additionally needs `customer.read` |
| `/admin/reports/customers` | `dashboard.view` + `customer.read` | New vs returning, lifetime value per currency, top customers per currency |

No new permission key is created. Every row composes keys that exist in
`11 §1.3`, which is the rule `11 §1.2` point 1 states: a route map may not widen
the catalogue.

**No new `/api` route.** Reports are React Server Components; the page calls
`src/lib/reporting/` directly and passes serialisable props to `<Chart>`. There is
no JSON reporting endpoint to authorize, rate-limit or leak, and
`tests/unit/routes-authorized.test.ts`'s manifest is unchanged. `Money` crosses
into the component tree, never `bigint` (`01 §2.6`).

### 9.2 What each role actually sees

Derived from `11 §1.4`, so it can be checked against the matrix rather than
asserted:

| Role | Reports reachable |
| --- | --- |
| `owner`, `admin` | All ten, including every cost and margin column |
| `analyst` | Sales, products, stones, materials, one-of-a-kind, inventory value **at retail**, wishlist. **No** customers report (`customer.read` is not held) and **no** cost or margin anywhere (`price.read_cost` is not held) |
| `catalog_manager` | Products, stones, materials, one-of-a-kind, wishlist, inventory value at retail. **No** sales, abandoned carts or customers (`order.read` not held) |
| `order_manager` | Sales, abandoned carts, customers, products. Inventory value at retail (`price.read` held). No cost |
| `inventory_manager` | Inventory value at retail, low stock, low-stock stones, metal weight, sales (`order.read` held), abandoned carts, customers. **No** `price.read`, so no retail valuation — the low-stock and weight panels render, the valuation panel does not |
| `content_editor` | None. `/admin` renders the frame, the integration strip and one line: "Reporting is not part of your role. Content tools are under Content." |

`tests/integration/rbac-matrix.test.ts` already invokes every exported admin
action per role; the ten `getX()` functions above join that sweep and the expected
set is this table.

### 9.3 Phase

`09 §1` has 32 phases and none of them builds a report. The module depends on
`orders` (P18–P23), `inventory` (P18), `analytics_events` + the collect endpoint
(P29) and the job worker (P04A), which places it after P29 and before P30.

> **RESOLVED — was CHANGE REQUIRED IN 09 §1.2:** insert **P29A — Reporting module and dashboard**
> *Verified applied in 09.*
> after P29, following the `P03A` / `P04A` precedent so no existing phase number
> moves.
>
> - **Builds:** `src/lib/reporting/**` (fourteen files, §1.2); `product_daily_metrics`
>   and `market_daily_metrics` with their indexes; the four reporting indexes of
>   §3.3; `idx_carts_recovery`; the `cart_abandoned` event; `refreshRollups()` as
>   the `product_metrics_refresh` handler; `/admin` tiles; the ten
>   `/admin/reports/**` screens; the `reporting.*` settings rows.
> - **Depends on:** P29, P23, P18, P04A.
> - **Exit criteria:** (a) a report run at a fixed `now` with the market's clock at
>   23:30 local returns the same window as one run at 00:30 the next UTC day, and
>   the two markets' "today" windows differ by their offset;
>   (b) no exported function in `src/lib/reporting/` returns `ReportFigure<Money>`
>   and `tests/unit/reporting-no-cross-currency.test.ts` passes;
>   (c) a `catalog_manager` opening `/admin/reports/inventory-value` receives a
>   response body containing no `cost_minor` in any form — asserted on the streamed
>   HTML and the RSC payload, not on the rendered screen;
>   (d) with `resend` unconfigured, the abandoned-cart recovery rate renders `—`
>   and the skipped-send count, never `0%`;
>   (e) `refreshRollups()` run twice over the same days produces byte-identical
>   table contents;
>   (f) a US spring-forward day renders 23 hourly buckets and an autumn fall-back
>   day 25, with labels matching the bucket keys.
> - **Tests:** `tests/unit/reporting-timezone.test.ts`, `tests/unit/reporting-no-cross-currency.test.ts`,
>   `tests/unit/reporting-cost-isolation.test.ts`, `tests/unit/reporting-source-mix.test.ts`,
>   `tests/unit/reporting-half-open.test.ts`, `tests/unit/reporting-boundaries.test.ts`,
>   `tests/integration/reporting-rollup-idempotent.test.ts`,
>   `tests/integration/reporting-rbac.test.ts`, `tests/integration/export-cost-columns.test.ts`,
>   `tests/e2e/dashboard-unconfigured.spec.ts`.

### 9.4 The remaining registry edits

> **RESOLVED — was CHANGE REQUIRED IN 11 §3.2:** the `product_metrics_refresh` row's Notes column
> *Verified applied in 11.*
> reads "Refreshes **`product_market_sort`** (§7.9)". Extend to: *"Refreshes
> `product_market_sort.units_90d` **and** the two reporting rollups
> `product_daily_metrics` and `market_daily_metrics` (`14 §4.2`). One kind, three
> tables, one `dedupeKey: 'kind'` — a second refresh kind would need a second
> singleton index and could interleave with this one over the same source table."*

> **RESOLVED — was CHANGE REQUIRED IN 08 §7.5:** replace the eleven lines with a pointer. The
> *Verified applied in 08.*
> section's two substantive claims — every tile carries a source label, and GA4
> figures are never mixed into the same number — are correct and are restated and
> mechanised in `14 §1.3`. The sentence "`/admin` reads `analytics_events` and
> `orders` only" is now wrong: the dashboard also reads `refunds`,
> `inventory_items`, `prices`, `customers`, `carts`, `email_logs` and the two
> rollups, which is the reason `src/lib/reporting/` exists as its own element type
> rather than as a folder in `analytics/` (`01 §2.2`).

> **RESOLVED — was CHANGE REQUIRED IN 02 §2.9:** add `product_daily_metrics` and
> *Verified applied in 02.*
> `market_daily_metrics` (§4.1 DDL) to the operations tables, add
> `cart_abandoned` to the `analytics_events.event_name` example list, and add the
> five indexes of §3.3 and §6.2 to §7.12. `02 §7.11`'s table count moves from 12 to
> 14. `09 §1.2` P29A is the phase that migrates them; `02 §8`'s "no phase currently
> builds" list should not gain them.
>
> **`02 §7.1`'s grand total is amended once, in `15 §7`, for `13`, `14` and `15`
> together** — these two tables are 2 of the 11 that document set adds. Three
> documents each moving the same count from 120 to a different number is precisely
> the arithmetic `tests/db/drift.test.ts` exists to catch.

---

## 10. What this document deliberately does not build

Named so the omissions are decisions rather than oversights.

| Not built | Why, and what it would take |
| --- | --- |
| A GA4 or Meta panel | §1.3 — third-party figures cannot be reconciled with first-party ones and the merged number would be the least trustworthy figure in the admin. A separate panel with its own date control and its own source label, built only on a yes |
| A money rollup (`order_daily_metrics`) | §3.3 — premature at this scale and a second money authority. Trigger condition: 250,000 `order_items` rows |
| Scheduled email reports | The `send_email` job kind and `email_templates` make it a small addition, but "a weekly summary to whom, containing what" is a client decision, and an unrequested recurring email from a commerce platform is a support ticket |
| Cohort and retention curves | They need a stable customer identity across guest and signed-in purchases, which `02 §2.3` deliberately does not construct (§2.4). Building it for a report would create an identity the rest of the system does not have |
| Attribution by traffic source | Requires storing referrer and UTM per session, which is a privacy decision (`08 §7.4`'s NEEDS INPUT on privacy regimes) and not an analytics one |
| Forecasting or trend projection | Every projection is a model, and a model with a jewellery house's order volume behind it is a guess rendered as a line. The comparison window (§7.1) is the honest version |
