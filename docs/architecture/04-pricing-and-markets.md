# 04 — Pricing Engine and the Multi-Market System

Scope: how a number becomes a price, who is allowed to produce one, how the three
pricing modes are stored, how a silver rate change is turned into a reviewed and
approved event rather than a silent repricing, and how markets are data. Table and
column names are reused verbatim from **02 §2.1 / §2.4 / §2.5 / §2.7**; function
signatures are reused verbatim from **01 §2.3**. Where this section needs a table
or column 02 does not define, it is marked `> **SCHEMA ADDITION:**` with the full
definition — never renamed around.

---

## 1. The pricing service

### 1.1 The rule

**`src/lib/pricing/` is the only module in the repository that produces an
amount.** Every other layer — pages, components, server actions, route handlers,
the admin panel, emails, invoices, CSV exports, the page builder, analytics —
receives a fully-resolved object and renders it. Nothing else computes, converts,
re-rounds, "adjusts", "estimates", "starts from", discounts, or re-derives a price,
in any language, on any runtime, for any reason including "just for display".

This is not a convention. It is three mechanical gates:

| Gate | Mechanism | Where |
| --- | --- | --- |
| Nothing outside pricing may import a price helper | `eslint-plugin-boundaries` + `no-restricted-imports`: "Any file outside `src/lib/pricing/**` importing a price-computation helper" is a CI failure | 01 §2.2 |
| Nothing outside `src/lib/money.ts` may format an amount | `Intl.NumberFormat` is banned everywhere else; `.toFixed(`, `parseFloat(` and `Number()` applied to an amount are banned **everywhere, including inside `src/lib/money.ts`** (§9.6 removes the last reason to allow one) | 01 §2.2 |
| Nothing may cache a resolved price | `cached()` / `unstable_cache` banned inside `src/lib/pricing/**` | 01 §2.4 |

Plus two tests that fail the build rather than the review:

- `tests/unit/no-fx.test.ts` — walks every file under `src/` and fails on the
  identifiers `exchangeRate`, `fxRate`, `convertCurrency`, `usdToInr`, `inrToUsd`,
  `toBaseCurrency`, `baseAmountMinor`, and on any literal that looks like a rate
  applied to an amount. A grep cannot prove the absence of cross-currency
  arithmetic, so the static scan is paired with a **runtime** guarantee, which is
  where the real enforcement lives: `addMoney`/`subtractMoney` throw on mixed
  currency (01 §2.6), and every currency-denominated column in this document is
  reachable only through a composite `(market_code, currency_code) → markets` FK,
  so a rupee term on a US row is unwritable rather than merely untested. The scan
  catches the person who names it honestly; the FK catches the person who does not.
- `tests/unit/pricing-sole-authority.test.ts` — fails if any file outside
  `src/lib/pricing/` and `src/lib/money.ts` contains a `bigint` multiplication or
  division whose operands trace to a column ending `_minor` or `_bp`.
- `tests/unit/display-equals-charged.test.ts` — the gate nobody thinks of until a
  customer does. For a sweep of variants × markets × live `pricing_rules`, asserts
  `getDisplayPrice()` and `getProductPriceRanges()` return, for an anonymous
  shopper with no coupon, **the same integer** `resolvePrice()` returns. A card
  that says `$248` over a bag that says `$198` is a wrong price even though both
  numbers are individually correct (§1.3, §5.4).

### 1.2 Module layout

```
src/lib/pricing/
├── index.ts        # the public surface below — the ONLY file other layers import
├── resolve.ts      # §1.4 resolution order
├── formula.ts      # evaluates a pricing_formula_versions row (§2.3)
├── rules.ts        # pricing_rules matching and precedence (§1.4 step 5)
├── rates.ts        # metal_rates read/write, staleness (§3)
├── recalc.ts       # preview / approve / apply (§3.3)
├── history.ts      # price_history writes and queries (§4)
├── money.ts        # applyBp, allocate, roundToIncrement — 02 §1.10, bigint only
├── schema.ts       # Zod schemas for every input below
├── errors.ts       # the typed errors in §1.5
└── providers/
    ├── index.ts    # MetalRateProvider registry (§3.2)
    └── manual.ts   # the only implementation at launch
```

`src/lib/pricing/money.ts` holds the *arithmetic* (02 §1.10); `src/lib/money.ts`
holds the *representation* (`Money`, `formatMoney`, 01 §2.6). Two files, two jobs,
neither importing the other's concern.

### 1.3 Public surface — exact signatures

The first three are reproduced verbatim from 01 §2.3 and are not re-specified here;
everything after them is new and owned by this section.

```ts
// ── Read path (01 §2.3, verbatim) ────────────────────────────────────────────
export async function resolvePrice(input: {
  variantId: string;
  marketCode: MarketCode;
  quantity: number;
  customerId?: string;
  couponCode?: string;
  at?: Date;
}): Promise<ResolvedPrice>;

export async function resolvePriceBatch(
  lines: { variantId: string; marketCode: MarketCode; quantity: number }[],
  ctx?: { customerId?: string; couponCode?: string; at?: Date },
): Promise<Map<string, ResolvedPrice>>;

export async function getDisplayPrice(
  variantIds: string[], marketCode: MarketCode,   // Zod: variantIds 1..200, deduped
): Promise<Map<string, {
  currencyCode: CurrencyCode;
  listMinor: bigint;
  saleMinor: bigint;
  compareAtMinor: bigint | null;  // prices.compare_at_minor — the struck-through figure
}>>;

// ── Price-range read for listing cards and filters ───────────────────────────
// A product with four variants shows "from $248". Computing that in a component
// would be four resolvePrice calls and a Math.min on numbers; it is one query.
export async function getProductPriceRanges(
  productIds: string[], marketCode: MarketCode,   // Zod: productIds 1..200, deduped
): Promise<Map<string, {
  currencyCode: CurrencyCode;
  minListMinor: bigint; maxListMinor: bigint;
  minSaleMinor: bigint | null;
  pricedVariantCount: number;     // 0 ⇒ not purchasable in this market (§6)
  totalVariantCount: number;      // pricedVariantCount < totalVariantCount ⇒ partial
}>>;

// ── Order-level discount quote ───────────────────────────────────────────────
// A FIXED-AMOUNT coupon is an order-level amount and cannot be expressed as an
// integer per unit ($25 across 3 units is 8.333). It never enters unitFinalMinor.
// src/lib/discounts/ calls this once per cart, after resolvePriceBatch, and
// allocate()s the result onto lines (02 §1.10 rule 3). §1.4.2.
export async function quoteOrderDiscounts(input: {
  marketCode: MarketCode;
  currencyCode: CurrencyCode;
  lines: { lineId: string; lineSubtotalMinor: bigint }[];
  couponCode?: string;
  customerId?: string;
  at: Date;
}): Promise<Result<{
  totalMinor: bigint;
  perLineMinor: Map<string, bigint>;   // sums to totalMinor, by construction
  breakdown: DiscountLine[];
}, CouponInvalidError>>;   // 11 §2.2 — `CouponInapplicableError` was a second spelling

// ── Write path — every one of these is a service function following the six
//    steps of 01 §2.3 (parse → authorize → version → transact → audit → revalidate).
//    The permission named on each is checked in step 2, server-side, before any
//    read of the input body's amounts (hard rule 9).
export async function setManualPrice(input: {              // perm: price.update
  actor: Actor;
  productId: string;
  variantId: string | null;        // null = the product-level default row
  marketCode: MarketCode;          // ONE market per call. There is no multi-market write.
  listMinor: bigint;
  saleMinor: bigint | null;
  compareAtMinor: bigint | null;
  costMinor: bigint | null;
  expectedPriceId: string | null;  // the prices.id being superseded; null = first price
  reason: PriceChangeReason;       // 02 enum price_change_reason
  note?: string;
}): Promise<Result<PriceRecord, ConflictError | ValidationError>>;

export async function setFormulaBinding(input: {            // perm: price.update
  actor: Actor;
  productId: string;
  variantId: string;               // NOT nullable — bindings are variant-level only (§2.2)
  marketCode: MarketCode;
  formulaId: string;
  mode: 'metal_linked' | 'hybrid';   // 'hybrid' needs settings['pricing.enable_hybrid'] — §2.5
  hybrid?: {
    adjustmentType: 'percent' | 'fixed_delta' | 'fixed_override';
    adjustmentBp?: number;         // signed, percent mode
    adjustmentDeltaMinor?: bigint; // signed, fixed_delta mode
    overrideMinor?: bigint;        // fixed_override mode
  };
  expectedVersion: number;
  applyNow: boolean;               // false = bind only; the next recalc run prices it
}): Promise<Result<PriceFormulaBinding, ConflictError | RateUnavailableError
                                      | ManualOverrideError | ValidationError
                                      | ForbiddenError>>;
// ONE binding per call, and `applyNow: true` additionally requires
// `price.approve_recalc`. Both restrictions exist for the same reason: a bulk
// action that bound 800 products with applyNow would write 800 prices from the
// current metal rate with no preview and no approver, which is hard rule 6
// defeated by a convenience flag. The bulk surface (/admin/catalog/products bulk
// action "Bind pricing formula") forces `applyNow: false` and then offers
// "Create recalculation preview" for the set it just bound — §3.3, with a human
// looking at the numbers.

// Pure evaluation. No database write, no cache purge, no side effect. Used by the
// admin formula editor's live preview, by recalc preview, and by the apply job —
// one implementation, so the preview a human approves is arithmetically identical
// to the row that ships.
export function evaluateFormula(input: FormulaInputs): FormulaResult;

// ── Silver / metal rates (§3) ────────────────────────────────────────────────
export async function recordMetalRate(input: {              // perm: metal_rate.manage
  actor: Actor;
  materialId: string;
  currencyCode: CurrencyCode;
  rateMinorPerGram: bigint;
  rateScale: number;               // 0..6, default 4
  effectiveAt: Date;
  source: string;                  // 'manual' | provider key
  sourceReference?: string;
}): Promise<Result<MetalRate, ValidationError>>;
// Writes ONE metal_rates row. Touches no prices row. Purges no cache tag. §3.3.

export async function getLatestMetalRate(
  materialId: string, currencyCode: CurrencyCode, at?: Date,
): Promise<{ rate: MetalRate; ageHours: number; isStale: boolean } | null>;

// ── Recalculation runs (§3.3) ────────────────────────────────────────────────
export async function createRecalcPreview(input: {          // perm: price.recalc_preview
  actor: Actor;
  materialId: string | null;       // null = every material with is_rate_linked = true
  marketCodes: MarketCode[] | null;// null = every active market with a fresh rate
  includeManuallyOverridden: boolean;  // default false — §3.3 step 1
  scope?: { categoryIds?: string[]; collectionIds?: string[]; productIds?: string[] };
  note?: string;
}): Promise<Result<RecalcRun, RateUnavailableError | TooManyLinesError>>;

export async function approveRecalcRun(                     // perm: price.approve_recalc
  runId: string, actor: Actor, note?: string,
): Promise<Result<RecalcRun, ForbiddenError | IllegalTransitionError>>;

export async function rejectRecalcRun(                      // perm: price.recalc_preview
  runId: string, actor: Actor, reason: string,
): Promise<Result<RecalcRun, IllegalTransitionError>>;

export async function applyRecalcRun(                       // perm: price.approve_recalc
  runId: string, actor: Actor,
): Promise<Result<{ jobId: string }, IllegalTransitionError | ForbiddenError>>;
// Enqueues a jobs row of kind 'recalc_apply'. Never applies inline (01 §2.7).
// Apply is gated on `price.approve_recalc`, NOT on `price.update`: approving is
// the decision, but applying is the moment customer-facing prices actually move,
// and a role that may edit one price must not be able to ship eight thousand.

// ── History (§4) ─────────────────────────────────────────────────────────────
export async function listPriceHistory(input: {             // perm: price.read
  productId?: string; variantId?: string; marketCode?: MarketCode;
  recalcRunId?: string; actorUserId?: string;
  from?: Date; to?: Date;
  limit: number;                   // Zod-capped at 100 (01 §2.3 step 1)
  cursor?: string;                 // keyset over (created_at, id)
}): Promise<{ rows: PriceHistoryRow[]; nextCursor: string | null }>;
```

**Permission keys, and where they now live.** Every key this section uses —
`price.read`, `price.read_cost`, `price.update`, `price.recalc_preview`,
`price.approve_recalc`, `metal_rate.manage`, `pricing_rule.manage`,
`market.preview` — is a row of the 72-key catalogue in **11 §1.3**, which is the
single home of `src/lib/rbac/catalogue.ts`. Two spellings this document used
earlier are rejected there and must not reappear: ~~`metal_rate.create`~~ is now
**`metal_rate.manage`** (row 26), and ~~`price.approve`~~ is
**`price.approve_recalc`** (row 25). (A struck spelling is a correction note, not
a use; `tests/unit/rbac-catalogue.test.ts` skips struck spans and fails on
everything else — 03 §1.8.) `price.read_cost` (row 22) and `price.recalc_preview` (row 24) were
commissioned here and are now canonical; 11 §1.4 places `price.read_cost` at
`owner`/`admin` only and `price.recalc_preview` at `catalog_manager` and above,
which is exactly the split §4 and §3.3 argue for. `tests/unit/rbac-catalogue.test.ts`
(11 §1.6) fails on any permission string in `src/` with no catalogue row **and**
on any occurrence of a rejected spelling anywhere under `docs/architecture/`.

> **RESOLVED — was FOUNDATION CHANGE REQUIRED IN 01 §2.3:** the canonical `ResolvedPrice` and
> *Verified applied by inspection of the target document.*
> `getDisplayPrice` types declared there are **narrower than what this document
> and 05 require, and this document's are the correct ones** (C23). 01 §2.3 must
> absorb two additions rather than this section trimming to fit:
>
> 1. `getDisplayPrice()` returns a fourth key,
>    `compareAtMinor: bigint | null` — `prices.compare_at_minor`, the
>    struck-through figure. Without it every card that shows a was-price would
>    have to read `prices` itself, which is a second price authority in
>    `src/components/` (§1.1). It is `null`, never `0`, when the row carries no
>    compare-at: `0` is a price.
> 2. `ResolvedPrice` gains an eleventh field,
>    `roundingResidueMinor: bigint` (§1.4 step 9) — `0 … quantity − 1`. It is
>    not optional and not derivable by the caller, because the caller does not
>    have `lineFinalMinor`; `createOrderFromCart()` adds it to that line's
>    `line_discount_minor` (05 §3.6) and `chk_order_items_subtotal` fails
>    without it on any line whose discount does not divide by the quantity.
>
> Both are **contract extensions**, flagged here the way 03 §8.1 flags
> `AvailabilityBand`'s fifth value, so an engineer reading 01 §2.3 as "canonical,
> reuse verbatim" is not silently compiling against a narrower type.
> `tests/unit/pricing-contract.test.ts` asserts the returned object's key set
> equals the declared type's exactly, in both directions, so a field added in one
> document and not the other fails rather than being quietly absent.

**What the two display functions include, exactly.** Both `getDisplayPrice()` and
`getProductPriceRanges()` return the number an **anonymous shopper with no coupon**
would be charged: the `prices` row resolved by §1.4 steps 1–2, **plus every live
`pricing_rules` row whose `scope_type <> 'customer_group'`**, evaluated with the
§1.4.1 precedence and the §1.4.2 arithmetic. They omit exactly two things — the
customer-group rule (step 6) and the coupon (step 7) — which is precisely why they
are the only cacheable pricing functions (01 §2.4).

The alternative, returning the bare `prices` row, is the defect this paragraph
exists to prevent: a 20%-off market sale is a `pricing_rules` row, so the PLP card
would render `$248` while the PDP, the bag and the invoice render `$198`. The
shopper who notices reports a bug; the shopper who does not is charged a number
they never saw on the page they clicked. `tests/unit/display-equals-charged.test.ts`
(§1.1) is the assertion.

Both are capped at **200 ids** by their Zod schemas — a 48-card PLP with four
variants each is 192 — because an uncapped array parameter on a function a route
handler can reach is an unbounded read (01 §2.7) reachable by a query string.

**`resolvePrice` never evaluates a formula.** This is the single most important
consequence of hard rule 6 and it is worth stating as a signature-level fact: a
metal-linked price is a stored `prices` row exactly like a manual one. The formula
runs at *authoring* time and at *approved recalculation* time, never on the read
path. If the formula ran on read, every silver tick would move every live price and
there would be nothing left for an admin to approve.

> **This was specified twice, incompatibly, and the other version has been
> removed** (C1). An earlier revision of `03 §2.4` put the metal formula **inside
> the numbered `resolvePrice()` walk** — "for a `metal_linked` or `hybrid` base
> row, step 4 is instead the rule-2 expression, evaluated from `metal_rates`".
> That is hard rule 6 violated in the document an engineer builds the catalogue
> from, and it does not surface until someone enters a real silver rate, at which
> point every page load reprices. `04` owns pricing and this signature is the one
> that stands: **steps 1–3 of §1.4 read `prices` and nothing else.** `03 §2.4`
> now says so and points here. The enforcement is mechanical, not editorial:
> `resolve.ts` does not import `formula.ts` (the boundary lint in §1.1 makes the
> import a CI failure), and `09 P11` exit criterion (b) is literally
> "`resolvePrice` never calls `evaluateFormula`". 11 §7.4 records the same
> decision as a vocabulary fact: a `metal_linked` or `hybrid` price is a stored
> `prices` row exactly like a manual one.

### 1.4 Resolution order

`resolvePrice({ variantId, marketCode, quantity, customerId, couponCode, at })`
walks these steps in order and stops at the first failure. `at` defaults to
`now()` — and `new Date()` is a lint error inside `src/lib/pricing/**` (01 §2.2),
so `at` is threaded from the caller and every line of one checkout shares one
instant.

| # | Step | Source | Failure |
| --- | --- | --- | --- |
| 0 | Resolve the market | `markets` where `code = :marketCode AND is_active` | `MarketNotFoundError` → 404. Never falls back to `NEXT_PUBLIC_DEFAULT_MARKET` |
| 1 | **Variant price** | active `prices` row where `variant_id = :variantId AND market_code = :m` — `idx_prices_active` | fall through to 2 |
| 2 | **Product default price** | active `prices` row where `product_id = :productOfVariant AND variant_id IS NULL AND market_code = :m` — `idx_prices_active_product` | fall through to 3 |
| 3 | **Stop.** | — | **`PriceUnavailableError { variantId, marketCode }`** |
| 4 | Establish the base | `unitListMinor = prices.list_minor`; `unitSaleMinor = coalesce(prices.sale_minor, prices.list_minor)`; **`lineBaseMinor = unitSaleMinor * BigInt(quantity)`** — the multiply happens *here*, before any percentage, so every percentage is applied to the largest available base and rounded once (02 §1.10 rule 1) | — |
| 5 | Apply `pricing_rules` | rows where `market_code = :m AND is_active AND (starts_at IS NULL OR starts_at <= :at) AND (ends_at IS NULL OR ends_at > :at)`, matched by scope (§1.4.1), arithmetic per §1.4.2 — `idx_pricing_rules_live` | a rule whose `scope_id` target is soft-deleted matches nothing (02 §2.5) |
| 6 | Apply customer-group pricing | the same mechanism: a `pricing_rules` row with `scope_type = 'customer_group'` and `scope_id = customers.customer_group_id`. There is no second price table (02 §2.3) | an anonymous request skips step 6 entirely; it never inherits `retail` implicitly — `customerId` absent ⇒ no group rule |
| 7 | Apply a **percentage** coupon | `couponCode` → `coupons` + `coupon_conditions`. `discount_type = 'percentage'` is currency-free and applies here, to `lineFinalMinor`, rounded once | condition failure ⇒ the coupon contributes nothing and is reported, never silently dropped |
| 7b | **Fixed-amount and free-shipping coupons do not apply here** | They are order-level: `coupon_amounts` is read for **this cart's currency** by `quoteOrderDiscounts()` and allocated to `order_items.line_discount_minor` (§1.4.2, 02 §1.10 rule 3) | **no `coupon_amounts` row for the currency ⇒ the coupon is inapplicable in this market.** Never converted, never defaulted (01 §2.6) |
| 8 | Clamp | `lineFinalMinor = max(0n, …)`; a stack of discounts can never produce a negative line | — |
| 9 | Reduce to an integer unit price | `unitFinalMinor = ceilDiv(lineFinalMinor, quantity)`; `lineSubtotalMinor = unitFinalMinor * BigInt(quantity)`; the residue `unitFinalMinor * quantity − lineFinalMinor` (0 … quantity−1 minor units) is carried in `roundingResidueMinor` and added to the line's order-level discount at order build time (§1.4.2) | `chk_order_items_subtotal` (02 §2.7) requires `line_subtotal_minor = unit_final_minor * quantity` exactly; this step is what makes that identity and "round once" both true |
| 10 | Assemble | `ResolvedPrice` (01 §2.3) with `priceSource = prices.price_source`, `metalRateId = prices.metal_rate_id`, `priceRecordId = prices.id`, `computedAt = at`, plus `roundingResidueMinor` | — |

**There is no step between 2 and 3.** No fallback to another market, no fallback to
another currency, no conversion, no "base" price, no nearest-variant price, no
category default, no zero. A variant with no price in a market is not purchasable
in that market, and that state is representable, queryable and rendered — which is
precisely what stops anyone from inventing a number to fill the hole (02 §2.5).

**Steps 1–2 have two predicates, not one, and the `at` one is a different query.**
`idx_prices_active` and `idx_prices_active_product` are **partial on
`valid_to IS NULL`**, so they contain only today's prices. A replay
(`resolvePrice({ at: <past date> })`) that used them would silently return
*today's* number and label it with a historical date — the worst possible failure
mode for a forensics tool, because the answer looks authoritative. The replay
predicate is therefore explicit:

```sql
-- at = now()  (the hot path, every storefront read)
WHERE variant_id = $1 AND market_code = $2 AND valid_to IS NULL AND deleted_at IS NULL
-- at = <past>  (admin forensics only; lint-banned from any order-render path, 01 §2.7)
WHERE variant_id = $1 AND market_code = $2 AND deleted_at IS NULL
  AND valid_from <= $3 AND (valid_to IS NULL OR valid_to > $3)
```

The second is served by `idx_prices_history (product_id, market_code, valid_from
DESC)` (02 §2.5) once the variant's `product_id` is in hand, which it always is —
`resolvePrice` loaded it at step 2. `pricing_rules` are re-evaluated against the
same `at` (their `starts_at`/`ends_at` window), so a replay reproduces the sale
that was live then, not the one live now.

#### 1.4.1 Rule precedence, stated exactly

Two rules can match one line. The order is total and deterministic:

1. `priority ASC` (`pricing_rules.priority`, lower wins).
2. Tie → **narrower scope wins**, by this fixed ranking:
   `product` (1) > `customer_group` (2) > `collection` (3) > `stone` (4) >
   `material` (5) > `tag` (6) > `category` (7) > `all` (8).
3. Tie → `created_at DESC` (the newer rule wins).
4. `is_stackable = false` (the default) means the winning rule is the **only**
   non-coupon discount applied; a stackable rule composes with other stackable
   rules, on the running amount, in the same order.
5. **`fixed_price` is never stackable and never stacks under anything.** A rule
   that sets the price *is* the price; composing it with a further percentage is
   an argument about which one the merchandiser meant, resolved at runtime, on a
   customer's bag. `chk_pricing_rules_fixed_price_not_stackable:
   NOT (adjustment_type = 'fixed_price' AND is_stackable)` makes the argument
   unwritable. If a `fixed_price` rule wins step 5, steps 5 and 6 end there;
   a coupon may still apply at step 7.

> **SCHEMA ADDITION (02 §2.5, `pricing_rules`):** the `CHECK` above, plus
> `amount_basis TEXT NOT NULL DEFAULT 'per_unit'`,
> `CHECK (amount_basis IN ('per_unit','per_line'))`. Without it,
> `amount_minor = 2500` on a `fixed_amount_off` rule is "$25 off each" to the
> person who wrote it and "$25 off the line" to the person who implemented it,
> and the two readings differ by `(quantity − 1) × $25` on every multi-quantity
> bag. The default is `per_unit` because that is what a merchandiser means by
> "$25 off this chain"; `per_line` exists for "$25 off the order of them".

**Matching the scope of eight rule types without eight round trips.** Step 5 has to
know, for every line, its product id, its categories, its collections, its stones,
its materials, its tags and (step 6) the customer's group. Done per line that is
seven queries × 48 cards; done naively per rule it is worse.
`resolvePriceBatch()` issues **one** scope query for the whole batch before it
evaluates anything:

```sql
-- $1 = variant ids, $2 = market
WITH v AS (SELECT id, product_id FROM product_variants WHERE id = ANY($1))
SELECT v.id AS variant_id, s.scope_type, s.scope_id FROM v, LATERAL (
  SELECT 'product'::text,    v.product_id
  UNION ALL SELECT 'category',   pc.category_id   FROM product_categories pc WHERE pc.product_id = v.product_id
  UNION ALL SELECT 'collection', pcol.collection_id FROM product_collections pcol WHERE pcol.product_id = v.product_id
  UNION ALL SELECT 'stone',      ps.stone_id      FROM product_stones ps      WHERE ps.product_id = v.product_id
  UNION ALL SELECT 'material',   vm.material_id   FROM variant_materials vm   WHERE vm.variant_id = v.id
  UNION ALL SELECT 'tag',        pt.tag_id        FROM product_tags pt        WHERE pt.product_id = v.product_id
) AS s(scope_type, scope_id);
```

served by `idx_product_categories_rank`, `idx_product_stones`,
`idx_variant_materials_material`'s sibling on `(variant_id, material_id)` (the PK),
and the PKs of `product_collections` and `product_tags`. The live `pricing_rules`
set for the market is a second query over `idx_pricing_rules_live` — a table with
tens of rows, read once per batch, memoised per request. Matching is then an
in-memory join.

**The third query: the batched `prices` read, with the variant→product fallback
done once.** Steps 1–2 are a two-level fallback per line served by **two different
partial indexes with different keys** — `idx_prices_active (variant_id,
market_code) WHERE valid_to IS NULL AND deleted_at IS NULL` and
`idx_prices_active_product (product_id, market_code) WHERE variant_id IS NULL AND
valid_to IS NULL AND deleted_at IS NULL` (02 §2.5). A `COALESCE` over one index
cannot express it and a per-line `OR` degrades to a scan. It is **one** statement,
and this is it:

```sql
-- $1 = variant ids (uuid[]), $2 = market code
-- Exactly one row per input variant id that has a price; a variant with neither
-- level present is simply absent from the result, which is step 3's
-- PriceUnavailableError, per line, with no sentinel row to mistake for a price.
WITH v AS (
  SELECT id AS variant_id, product_id
    FROM product_variants
   WHERE id = ANY($1) AND deleted_at IS NULL
)
SELECT v.variant_id, p.*
  FROM v
  JOIN LATERAL (
    (SELECT pr.*, 1 AS level
       FROM prices pr
      WHERE pr.variant_id = v.variant_id
        AND pr.market_code = $2
        AND pr.valid_to IS NULL AND pr.deleted_at IS NULL)
    UNION ALL
    (SELECT pr.*, 2 AS level
       FROM prices pr
      WHERE pr.product_id = v.product_id
        AND pr.variant_id IS NULL
        AND pr.market_code = $2
        AND pr.valid_to IS NULL AND pr.deleted_at IS NULL)
    ORDER BY level
    LIMIT 1
  ) AS p ON TRUE;
```

Four properties, each of which is why it is written this way rather than another:

1. **Each `UNION ALL` branch is an index-only probe of a different index.** The
   first branch is an equality probe of `idx_prices_active`; the second of
   `idx_prices_active_product`. Both are UNIQUE, so each branch returns at most
   one row and the planner costs each at one index lookup.
2. **`ORDER BY level LIMIT 1` is the fallback, and it short-circuits.** With a
   `LIMIT 1` over a `UNION ALL` whose first branch is ordered first, Postgres
   stops after the first branch yields a row — the product-level probe is not
   executed for a variant that has its own price. `LIMIT 1` on the lateral is also
   what keeps the join one-row-per-variant without a `DISTINCT ON`.
3. **`JOIN LATERAL … ON TRUE`, not `LEFT JOIN LATERAL`.** A left join would
   manufacture an all-`NULL` price row for an unpriced variant, and a `NULL`
   `list_minor` that reaches `lineBaseMinor` is precisely the invented number
   §1.4's "there is no step between 2 and 3" exists to forbid. Absence is the
   signal; the caller diffs the returned variant ids against the requested set and
   raises `PriceUnavailableError` for the difference.
4. **The replay path (`at` in the past) does not use this query.** Its predicate
   is `valid_from <= $3 AND (valid_to IS NULL OR valid_to > $3)`, which neither
   partial index contains; it runs the §1.4 history form over
   `idx_prices_history`, one product at a time, and is lint-banned from any
   order-render path (01 §2.7). A batched replay is not built because nothing
   batches forensics.

**So the count is three, and it is constant:** the scope LATERAL, the memoised
live-rules read, and this. `09 §2.10`'s "3 queries … and the same 3 for 1, 48 and
200 lines" is now demonstrated rather than asserted, and
`tests/integration/pricing-batch-query-count.test.ts` asserts the count does not
grow with the number of lines by counting statements at the adapter, not by
timing; a `no-service-call-in-map` lint rule (01 §2.3) is the other half.
`tests/integration/pricing-fallback-batch.test.ts` is the correctness half: a
batch mixing a variant-level price, a product-level fallback, both present on one
variant (the variant row must win) and neither present (absent from the result)
returns exactly one row per priced variant and none for the unpriced one, and
`EXPLAIN` names both partial indexes.

`discountBreakdown: DiscountLine[]` carries one entry per applied rule and one for
the coupon, each with `{ kind, sourceId, label, amountMinor }`, and is what gets
snapshotted to `order_items.discount_breakdown` (02 §2.7). A discount whose effect
is not in that array did not happen.

#### 1.4.2 The arithmetic of a discount, stated exactly

This is the subsection 02 §1.10 warns about: *"the single most likely way this
schema breaks in its first week."* Three integer identities have to hold
simultaneously — `chk_order_items_subtotal` (`line_subtotal_minor =
unit_final_minor * quantity`), `chk_orders_total`, and 01 §2.6's "round once, on
the line total, never per unit then multiplied". The naive implementation
satisfies two of the three.

**Per adjustment type**, all operands `bigint`, `L = lineBaseMinor` from step 4:

| `adjustment_type` | `amount_basis` | Effect on `L` |
| --- | --- | --- |
| `percentage_off` | n/a (currency-free) | `L ← L − applyBp(L, value_bp)` — **one** `applyBp` on the whole line, per 02 §1.10 rule 1 |
| `fixed_amount_off` | `per_unit` | `L ← L − amount_minor * BigInt(quantity)` |
| `fixed_amount_off` | `per_line` | `L ← L − amount_minor` |
| `fixed_price` | `per_unit` | `L ← amount_minor * BigInt(quantity)` — a *price*, not a subtraction; may be **higher** than `L`, and is still applied, because "fixed price ₹4,999" means ₹4,999 |
| `fixed_price` | `per_line` | `L ← amount_minor` |

Each step writes a `DiscountLine` whose `amountMinor` is the **delta it caused**,
signed, so `sum(discountBreakdown) = lineBaseMinor − lineFinalMinor` is an
assertion the service makes before returning, not a hope.

**Then the reduction to a unit price.** `unit_final_minor` must be an integer and
`line_subtotal_minor` must be its exact multiple, so a line discount that does not
divide by the quantity has to go somewhere. It goes into the discount, not into a
silent rounding:

```ts
const unitFinalMinor       = (lineFinalMinor + BigInt(quantity) - 1n) / BigInt(quantity); // ceil
const lineSubtotalMinor    = unitFinalMinor * BigInt(quantity);        // ≥ lineFinalMinor
const roundingResidueMinor = lineSubtotalMinor - lineFinalMinor;        // 0 … quantity−1
```

`createOrderFromCart()` adds `roundingResidueMinor` to that line's
`line_discount_minor` alongside the allocated order-level coupon, so
`line_subtotal_minor − line_discount_minor` is **exactly** the rounded-once line
figure the customer was quoted. Ceil rather than floor is deliberate: it makes the
displayed unit price the conservative one and puts the residue on the discount
side, where it is visible in `discount_breakdown` rather than hidden in a price.

**Worked, because this is where the cent goes.** Unit list `9999` ($99.99),
quantity 3, a 17.5% rule:

| | Per-unit-then-multiply (wrong) | Line-then-reduce (this spec) |
| --- | --- | --- |
| Discount | `applyBp(9999, 1750) = 1750` each | `applyBp(29997, 1750) = 5250` |
| Unit final | `8249` | `ceil(24747 / 3) = 8249` |
| Line subtotal | `24747` | `24747` |
| Residue → `line_discount_minor` | — | `0` |

and the same line at quantity 2 with a `per_line` `fixed_amount_off` of `2501`:
`L = 19998 − 2501 = 17497`; `unitFinalMinor = ceil(17497/2) = 8749`;
`lineSubtotalMinor = 17498`; `roundingResidueMinor = 1`, added to
`line_discount_minor`. `17498 − 1 = 17497`. `chk_order_items_subtotal` passes,
`chk_orders_total` passes, and the customer is charged the number they were shown.

**Fixed-amount coupons never touch any of this.** `quoteOrderDiscounts()` runs
once over the finished line subtotals and `allocate()`s its total across lines by
`line_subtotal_minor` weight (02 §1.10 rule 3), so `SUM(line_discount_minor)`
equals `orders.discount_total_minor` by construction. A $25 coupon across three
lines is `8 + 8 + 9`, not `8.33` three times.
`tests/unit/discount-identities.test.ts` sweeps quantities 1–12 × every adjustment
type × percentage and fixed coupons and asserts all three identities on every
combination.

### 1.5 Typed errors

Every class below is declared in **11 §2.2** — one `ErrorCode`, one HTTP status,
one `copy.error.*` key each — and re-exported from `src/lib/pricing/errors.ts`.
Each extends `AppError` **directly**; there is no pricing-specific base class.

**`PricingError` is a type alias, not a class** (11 §2.1). It is the union of the
classes in this table, and declaring it as a class is how a second error taxonomy
starts:

```ts
// src/lib/pricing/errors.ts
export type PricingError = PriceUnavailableError | MarketNotFoundError | RateUnavailableError
                        | RateStaleError | RateProviderError | FormulaInvalidError
                        | ConflictError | PriceChangedError | TooManyLinesError
                        | CouponInvalidError | ManualOverrideError | RecalcStaleError
                        | ForbiddenError;
```

Every one is returned in a `Result`, never thrown across a layer, never rendered
as a 500.

| Error | Raised when | Storefront behaviour |
| --- | --- | --- |
| `PriceUnavailableError` | Steps 1–2 both missed | PDP renders the market-unavailable state (§6); the card does not appear on the PLP at all; add-to-bag is absent, not disabled-with-a-price |
| `MarketNotFoundError` | Unknown or inactive `marketCode` | `notFound()` → 404 (01 §2.3) |
| `RateUnavailableError` | A formula needs a `metal_rates` row for `(material, currency)` and none exists | Admin-only. Never reaches a shopper: it can only occur on a write or a recalc preview, because the read path never evaluates a formula |
| `RateStaleError` | The newest rate is older than `PRICING_RATE_MAX_AGE_HOURS` | Recalc preview reports the line as `skipped` with `skip_reason = 'no USD silver rate for 2026-09-12'` (01 §2.3) and prices the other markets |
| `RateProviderError` | A `MetalRateProvider.fetchRate()` call failed, timed out, or returned a currency other than the one requested (§3.2) | Admin-only, 502. `/api/cron/metal-rate-refresh` records it against the job and creates no preview for that (material × currency). **Never** a converted or substituted figure |
| `FormulaInvalidError` | The bound formula version references a material the variant does not carry, or a weight source that resolves to nothing | Admin form error, naming the missing input |
| `ConflictError` | The `UPDATE prices SET valid_to = now() … AND valid_to IS NULL` affected zero rows (02 §2.5) | "Someone else repriced this while you were editing", with the price that won |
| `PriceChangedError` | Checkout step 2 found a difference between the cart snapshot and the live resolve | §3.4 |
| `TooManyLinesError` | A recalc preview would exceed `PRICING_RECALC_MAX_LINES` | Admin is asked to narrow the scope |
| `CouponInvalidError` (`COUPON_INVALID`) | The code exists but has no `coupon_amounts` row in this cart's currency, or a `coupon_conditions` row fails | "This code isn't valid in India" — named, never a silent no-op and never a converted amount (01 §2.6). **Renamed from `CouponInapplicableError`**, which was this document's own spelling of a class `08 §1.4` already owned; 11 §2.2 makes the short one canonical. Distinct from `CouponUnavailableError`, which is 05 §8.5's "the cap was exhausted between the quote and the redemption" |
| `ManualOverrideError` | `setFormulaBinding` on a (variant × market) whose active `prices` row is `price_source = 'manual'`, or `setManualPrice` on one that carries an active binding | "This piece is priced manually in the US. Remove the manual price first, or unbind the formula." Names which of the two exists and offers the one-click inverse (§2.2) |
| `RecalcStaleError` | `applyRecalcRun` called more than `PRICING_RECALC_APPROVAL_MAX_AGE_HOURS` after `approved_at`, or a line's `inputs_digest` no longer matches | The run cannot be applied; the UI offers "rebuild preview". A stale line inside a fresh run is failed individually (§3.3 step 6) |
| `ForbiddenError` | `requirePermission` denied in step 2 of any write above | 403. The check is server-side in the service function, not in the admin route or the component — hiding the button is not authorization (hard rule 9) |

---

## 2. The three pricing modes

The mode is **data on the price row**: `prices.price_source` is the Postgres enum
`price_source` with values `manual | metal_linked | hybrid` (02 §1.9), and it is
set **per (product-or-variant × market)**. The same ring can be manual in the US
and metal-linked in India; the same product can have a manual default row and a
metal-linked override for its heaviest variant. Nothing about the mode is global,
nothing about it is a code branch outside `src/lib/pricing/`.

| Mode | `price_source` | Where the number comes from | Moves when silver moves? |
| --- | --- | --- | --- |
| MANUAL | `manual` | A human typed it, in that market's currency | Never |
| SILVER-LINKED | `metal_linked` | `evaluateFormula()` at authoring or approved-recalc time | Only inside an approved `recalc_runs` |
| HYBRID | `hybrid` | `evaluateFormula()` plus a stored per-market admin adjustment. **Deferred out of release 1** behind `settings['pricing.enable_hybrid']` (§2.5) | Only inside an approved `recalc_runs`; the adjustment rides along unchanged |

### 2.1 MANUAL — the independence rule

**USD and INR manual prices are two rows in `prices` that share no column, no
parent value and no derivation.** Editing the USD price inserts one row with
`market_code = 'US'`; the INR row's `valid_to` stays `NULL` and nothing about it
changes (02 §2.5). There is no `base_price` column, no `fx_rate` column, no
`fx_rates` table, no conversion function in `src/lib/money.ts`, and no
currency-conversion dependency is permitted in `package.json` (01 §1.5).

**What the admin price editor must never do.** These are not style notes; each one
is a way to produce an FX conversion without anyone deciding to:

| Forbidden | Why it is a hard-rule-2 violation |
| --- | --- |
| A "base price" field with per-market multipliers | That is FX with the rate renamed |
| Prefilling the INR input when the USD input changes (even as a "suggestion", even greyed out, even with a "you can edit this" hint) | The merchandiser accepts the suggestion; the number is now derived |
| A "convert" / "sync from USD" / "match other market" button | Same, with a click |
| Displaying any exchange rate, anywhere in the admin | A displayed rate is an invitation to apply it |
| A single Save button that writes both markets from one form state | Makes the two writes one transaction with one `expectedVersion`, so a stale INR value silently overwrites a colleague's edit |
| A CSV import column named `price` without a currency | Row 400 gets filed against whichever market the importer guessed |

**What it must do instead.** `/admin/catalog/products/[id]/pricing` renders **one
column per active market**, ordered by `markets.rank`. Each column is its own
`react-hook-form` instance with its own dirty state, its own `expectedPriceId`, its
own Save, and its own `price_history` row. Saving USD posts a single
`setManualPrice({ marketCode: 'US', … })` and the INR column is not in the request
body at all. A market with no price row renders an empty input and the label
**"Not priced — not purchasable in India"**, not a zero and not a placeholder
number.

The CSV surface follows: import and export columns are
`price_list_minor_USD`, `price_sale_minor_USD`, `price_list_minor_INR`,
`price_sale_minor_INR` — currency in the header, one column per market per role,
generated from `listActiveMarkets()` so adding Canada adds columns rather than
changing a parser.

**A blank cell is not a price of zero and not a deletion.** The three states a
per-market price column can carry are distinct and each has a spelling, because
the two-state reading is how a spreadsheet round-tripped through Excel closes
every INR price in the catalogue on a Tuesday afternoon:

| Cell | Meaning | Effect |
| --- | --- | --- |
| empty | *untouched* | No `prices` write for that market. The existing row keeps its `valid_to IS NULL` |
| an integer | *set* | One `setManualPrice` for that market, with its own `price_history` row |
| `__CLEAR__` | *unprice in this market* | `UPDATE prices SET valid_to = now()` with the one-row assertion, no replacement row. The variant becomes not-purchasable in that market (§6), which is a representable state |

The import validation preview (01 §2.7 — synchronous, first 500 rows) reports the
counts **per market** before anything is applied: *"US: 412 updated, 0 cleared.
India: 0 updated, 0 cleared, 412 untouched."* An importer who expected to touch
India sees that they did not; an importer who did not expect to clear 412 India
prices sees that they are about to. A column header naming a market that is not
active is a hard validation error, not an ignored column.

### 2.2 SILVER-LINKED — the formula is a stored, versioned row

**The fork.** A general expression DSL (`weight * rate * purity + making + …`
parsed and evaluated at runtime) would let the client express anything; it also
means shipping an expression parser and evaluator, giving an admin the ability to
write something that divides by zero across 2,000 variants inside a 3 a.m. job, and
having no type, no `CHECK` and no index over the thing that sets every price in the
catalogue. A fixed-term row is less expressive and is completely inspectable: every
input is a typed column, every bound is a `CHECK`, and the admin UI is a form
rather than an editor.

**Decision: a fixed-term, versioned formula row.** The formula's *structure* is
currency-free and lives in one row; every *currency-denominated* term lives in a
per-market child row. That split is hard rule 2 expressed as a schema: there is no
column a USD term and an INR term both read from.

> **SCHEMA ADDITION:** four objects, plus columns on the existing `prices` table.
> They belong in `prisma/schema/pricing.prisma` alongside the tables in 02 §2.5.

#### `pricing_formulas`

| Column | Type | Null | Notes |
| --- | --- | --- | --- |
| `id` | `UUID` | N | **PK** |
| `name` | `TEXT` | N | `Sterling silver — standard`, `14K gold — bridal` |
| `slug` | `TEXT` | N | Stable handle for CSV import and seed |
| `description` | `TEXT` | Y | |
| `published_version_id` | `UUID` | Y | FK → `pricing_formula_versions(id)` [RESTRICT] — the version bindings resolve to. Editing a formula creates a new version; **publishing** is this pointer move |
| `is_active` | `BOOLEAN` | N | default `true` |
| `version` | `INTEGER` | N | Optimistic lock (01 §2.3 step 3) |
| `deleted_at` | `TIMESTAMPTZ` | Y | Soft delete — `prices.formula_version_id` is `RESTRICT` |
| `created_at` / `updated_at` | `TIMESTAMPTZ` | N | |

- **UNIQUE** `CREATE UNIQUE INDEX idx_pricing_formulas_slug_live ON pricing_formulas (slug) WHERE deleted_at IS NULL;`

#### `pricing_formula_versions` — append-only, currency-free

| Column | Type | Null | Notes |
| --- | --- | --- | --- |
| `id` | `UUID` | N | **PK** |
| `formula_id` | `UUID` | N | FK → `pricing_formulas(id)` [RESTRICT] |
| `version_no` | `INTEGER` | N | Monotonic per formula |
| `material_id` | `UUID` | Y | FK → `materials(id)` [RESTRICT]. `NULL` ⇒ use the variant's `variant_materials` row with `is_primary` (02 §2.4) |
| `purity_source` | `TEXT` | N | `material` \| `override`. `CHECK (purity_source IN ('material','override'))` |
| `purity_ratio_bp` | `INTEGER` | Y | Required when `purity_source='override'`. `9250` = .925. `CHECK (purity_ratio_bp BETWEEN 1 AND 10000)` |
| `weight_source` | `TEXT` | N | `variant_primary` \| `variant_material` \| `fixed`. `CHECK (…)` |
| `fixed_weight_milligrams` | `BIGINT` | Y | Required when `weight_source='fixed'`. `CHECK (> 0)` |
| `making_charge_mode` | `TEXT` | N | `none` \| `percent_of_metal` \| `fixed_per_gram` \| `fixed`. `CHECK (…)` |
| `making_charge_bp` | `INTEGER` | Y | Required for `percent_of_metal`. `CHECK (making_charge_bp BETWEEN 0 AND 1000000)` — the 02 §1.1 exemption; 150% labour is `15000` |
| `include_stone_cost` | `BOOLEAN` | N | default `true` |
| `include_other_material_cost` | `BOOLEAN` | N | default `true` |
| `markup_mode` | `TEXT` | N | `none` \| `percent_of_subtotal` \| `fixed`. `CHECK (…)` |
| `markup_bp` | `INTEGER` | Y | Required for `percent_of_subtotal`. `CHECK (markup_bp BETWEEN 0 AND 1000000)` |
| `created_by_user_id` | `UUID` | Y | FK → `users(id)` [SET NULL] |
| `note` | `TEXT` | Y | "Why this version exists" — shown in the version diff |
| `created_at` | `TIMESTAMPTZ` | N | **No `updated_at`** — append-only (02 §1.3) |

- **UNIQUE** `uq_pricing_formula_versions (formula_id, version_no)`.
- **UNIQUE** `uq_pricing_formula_versions_id_formula (id, formula_id)` — the target
  that lets `pricing_formula_market_terms` bind to a version *of the formula it
  claims*.
- **CHECK** `chk_pfv_purity: (purity_source = 'override') = (purity_ratio_bp IS NOT NULL)`.
- **CHECK** `chk_pfv_weight: (weight_source = 'fixed') = (fixed_weight_milligrams IS NOT NULL)`.
- **CHECK** `chk_pfv_making_bp: (making_charge_mode = 'percent_of_metal') = (making_charge_bp IS NOT NULL)`.
- **CHECK** `chk_pfv_markup_bp: (markup_mode = 'percent_of_subtotal') = (markup_bp IS NOT NULL)`.
- **No amount column, deliberately.** There is not one `BIGINT` on this table.
  If a currency-denominated term ever appears here, one number is feeding both
  markets and hard rule 2 is broken in the schema.

#### `pricing_formula_market_terms` — every currency-denominated term

| Column | Type | Null | Notes |
| --- | --- | --- | --- |
| `formula_version_id` | `UUID` | N | FK → `pricing_formula_versions(id)` [CASCADE] |
| `market_code` | `CHAR(2)` | N | FK pair below |
| `currency_code` | `CHAR(3)` | N | Denormalised so the composite FK can enforce the pairing |
| `making_charge_minor` | `BIGINT` | Y | For `making_charge_mode='fixed'` |
| `making_charge_per_gram_minor` | `BIGINT` | Y | For `making_charge_mode='fixed_per_gram'` |
| `markup_minor` | `BIGINT` | Y | For `markup_mode='fixed'` |
| `market_adjustment_delta_minor` | `BIGINT` | Y | **Signed** (`_delta`, 02 §1.1). A per-market positioning term, added last before rounding |
| `market_adjustment_bp` | `INTEGER` | Y | Signed alternative, applied to the running subtotal. `CHECK (market_adjustment_bp BETWEEN -10000 AND 1000000)` |
| `rounding_increment_minor` | `BIGINT` | N | default `1`. `1` = to the minor unit; `100` = whole dollar; `10000` = nearest ₹100 |
| `rounding_mode` | `TEXT` | N | default `half_up`. `CHECK (rounding_mode IN ('half_up','up','down'))` |
| `floor_minor` | `BIGINT` | Y | A computed price below this is clamped up and the line is flagged in the preview |
| `created_at` | `TIMESTAMPTZ` | N | Append-only with its parent |

- **PK** `(formula_version_id, market_code)`.
- **FK (composite)** `(market_code, currency_code) REFERENCES markets (code, currency_code) ON DELETE RESTRICT` — 02 §2.1's highest-value constraint, reused.
- **CHECK** `chk_pfmt_adjustment_one: NOT (market_adjustment_delta_minor IS NOT NULL AND market_adjustment_bp IS NOT NULL)`.
- **CHECK** `chk_pfmt_rounding: rounding_increment_minor > 0`.
- **A market with no row here cannot be priced by this formula.** `evaluateFormula`
  returns `FormulaInvalidError`, the recalc preview reports the line as `skipped`,
  and nothing is invented. Absence is a state, not a default.

> **`prices.floor_minor` does not exist, and an earlier revision of `03 §2.4`
> added it** (C1, 11 §7.4). The floor is `pricing_formula_market_terms.floor_minor`
> — the row above — and its *effect* on a given price is recorded on the price row
> as `floor_adjustment_minor`. The two `CHECK`s that came with the rejected column
> (`chk_prices_hybrid_floor`, `chk_prices_floor_source`) are **not migrated**;
> `chk_prices_hybrid_adjustment` (§2.4) is. They are not merely redundant with this
> design, they are incompatible with it: under `chk_prices_floor_source`
> (`price_source = 'hybrid' OR floor_minor IS NULL`) every `hybrid` row this
> document writes is unwritable, because nothing here ever sets a
> `prices.floor_minor`, and a `metal_linked` row with a market-terms floor would
> have its clamp recorded in a column the constraint forbids it to use.
>
> The floor belongs on the market terms for a reason beyond tidiness: it is a
> property of *how this formula prices this market*, so it applies to every variant
> bound to the formula, in that market's own currency, and it is set once rather
> than once per price row. A floor on `prices` would have to be re-entered on every
> supersede — and a recalculation writes a **new** row (§3.3 step 6), so the floor
> would be the one input that silently reverted to `NULL` on the run that most
> needed it.

#### `price_formula_bindings` — which thing uses which formula, per market

| Column | Type | Null | Notes |
| --- | --- | --- | --- |
| `id` | `UUID` | N | **PK** |
| `product_id` | `UUID` | N | FK → `products(id)` [RESTRICT]. Denormalised for the recalc enumeration's scope filter; **not independent data** — see the composite FK below |
| `variant_id` | `UUID` | **N** | FK → `product_variants(id)` [RESTRICT]. **NOT NULL: bindings are variant-level only** — see below |
| `market_code` | `CHAR(2)` | N | FK pair below |
| `currency_code` | `CHAR(3)` | N | |
| `formula_id` | `UUID` | N | FK → `pricing_formulas(id)` [RESTRICT] — the binding follows the formula's `published_version_id`, so publishing a new version re-prices on the **next approved run**, never on read |
| `mode` | `TEXT` | N | `metal_linked` \| `hybrid`. `CHECK (mode IN ('metal_linked','hybrid'))` |
| `hybrid_adjustment_type` | `TEXT` | Y | `percent` \| `fixed_delta` \| `fixed_override`. `CHECK (…)` |
| `hybrid_adjustment_bp` | `INTEGER` | Y | **Signed**. `CHECK (hybrid_adjustment_bp BETWEEN -10000 AND 1000000)` |
| `hybrid_adjustment_delta_minor` | `BIGINT` | Y | **Signed** |
| `hybrid_override_minor` | `BIGINT` | Y | `CHECK (>= 0)` |
| `is_active` | `BOOLEAN` | N | default `true` |
| `version` | `INTEGER` | N | Optimistic lock |
| `created_by_user_id` | `UUID` | Y | FK → `users(id)` [SET NULL] |
| `created_at` / `updated_at` | `TIMESTAMPTZ` | N | |

- **FK (composite)** `(market_code, currency_code) → markets (code, currency_code)` [RESTRICT].
- **FK (composite)** `(variant_id, product_id) REFERENCES product_variants (id, product_id)` [RESTRICT], which requires
  > **SCHEMA ADDITION (02 §2.4, `product_variants`):** `UNIQUE uq_product_variants_id_product (id, product_id)`
  > — informationless on its own, exactly like `uq_prices_id_market` (02 §2.5), and
  > for the same reason: it is the target that makes the denormalised `product_id`
  > provably the variant's own product. Without it a binding can name variant *A*
  > and product *B*, the scope filter in §3.3 step 1 silently excludes or includes
  > the wrong variants, and nothing anywhere complains.
- **CHECK** `chk_pfb_hybrid: (mode = 'hybrid') = (hybrid_adjustment_type IS NOT NULL)`.
- **CHECK** `chk_pfb_hybrid_value:` exactly one of the three adjustment columns is
  non-null when `mode='hybrid'`, matching `hybrid_adjustment_type`
  (`num_nonnulls(hybrid_adjustment_bp, hybrid_adjustment_delta_minor, hybrid_override_minor) = CASE WHEN mode='hybrid' THEN 1 ELSE 0 END`).
- **UNIQUE** `CREATE UNIQUE INDEX idx_pfb_variant ON price_formula_bindings (variant_id, market_code) WHERE is_active;`
- **Index** `idx_pfb_formula ON price_formula_bindings (formula_id, market_code) WHERE is_active`
  — "everything this formula prices", which is the set a recalc run enumerates.
- **Index** `idx_pfb_product ON price_formula_bindings (product_id, market_code) WHERE is_active`
  — the scope filter (`scope.productIds`, and the category/collection joins) in
  `createRecalcPreview` (§3.3 step 1), and the product pricing tab's "which of this
  product's variants are formula-priced".

**Why bindings are variant-level only, and what it fixes.** The obvious symmetry —
mirror `prices`, allow a product-level binding with `variant_id IS NULL` — is
wrong here, and it is wrong for a reason already present in 02:
`chk_prices_linked_inputs` requires `metal_weight_grams IS NOT NULL` on every
non-manual `prices` row, and weight lives on `variant_materials`, which is keyed by
variant. A product-level metal-linked price therefore has no weight to compute
from unless the formula uses `weight_source = 'fixed'`, in which case every variant
of the product is priced as if it weighed the same — which for a ring available in
sizes 5 to 10 is a wrong number on eight of them.

Three concrete failures the `NOT NULL` removes at once:

1. `recalc_run_lines.variant_id` is `NOT NULL` in 02 §2.5 and its unique key is
   `(recalc_run_id, variant_id, market_code)`. A product-level binding is **not
   representable as a preview line at all**, so it would be silently absent from
   every run — a price that claims to be metal-linked and never moves, with no
   error anywhere.
2. The enumeration query in §3.3 step 1 joins `product_variants` on
   `b.variant_id`; an inner join drops every `NULL` row, which is the same silent
   exclusion arriving by a second route.
3. Its `LEFT JOIN prices` matches on `p.variant_id = b.variant_id`, which never
   matches a product-level `prices` row (`variant_id IS NULL`), so `current_price_id`
   would come back `NULL` and the apply's one-row close assertion would have nothing
   to close.

**A product-level `prices` row is therefore always `manual`.**

> **SCHEMA ADDITION (02 §2.5, `prices`):**
> `CHECK chk_prices_variant_level_formula: price_source = 'manual' OR variant_id IS NOT NULL`.
> One line, and the three failure modes above become unwritable rather than
> untested.

> **RESOLVED — was CHANGE REQUIRED IN 03 §1.4 Panel 3 — now made:** (C28). The admin product
> *Verified applied in 03.*
> editor's Pricing panel listed **Price source** (`manual`/`metal_linked`/`hybrid`)
> and **Scope** (`prices.variant_id`, `NULL` = product default) as two
> independently settable fields, which offers the merchandiser a combination the
> constraint above refuses: a product-level row that is not `manual` fails at the
> database on a submission the form said was valid. `03 §1.4` has been corrected
> to render the product-default column as `manual`-only, to bind the formula
> fields to a selected variant, and to cite this constraint by name. The rule,
> stated once so neither document drifts: **`price_source` is a function of the
> scope, not a free choice beside it.** Product-level row ⇒ `manual`. A formula
> is bound with `setFormulaBinding({ variantId })`, never with a scope dropdown.

#### `variant_component_costs` — stone cost and other material cost, per currency

02 §2.4 models `product_stones` with carat, count and cut, and `variant_materials`
with weight — none of them with a cost, and correctly so: a stone's *cost to this
business in this currency* is a commercial fact about a variant, not a gemmological
fact about a stone, and it is different in USD and INR for the same physical stone.

| Column | Type | Null | Notes |
| --- | --- | --- | --- |
| `variant_id` | `UUID` | N | FK → `product_variants(id)` [CASCADE] |
| `currency_code` | `CHAR(3)` | N | FK → `currencies(code)` [RESTRICT] |
| `component_kind` | `TEXT` | N | `stone` \| `other_material` \| `finishing` \| `certification`. `CHECK (component_kind IN (…))` — a small set local to one table (02 §1.9) |
| `amount_minor` | `BIGINT` | N | `CHECK (amount_minor >= 0)` |
| `note` | `TEXT` | Y | Supplier reference, lot number |
| `created_at` / `updated_at` | `TIMESTAMPTZ` | N | |

- **PK** `(variant_id, currency_code, component_kind)`.
- **CHECK** `chk_vcc_currency_upper: currency_code = upper(currency_code)`.
- **Index** `idx_vcc_currency ON variant_component_costs (currency_code, variant_id)`.
- A missing row is **zero**, not an error: a silver chain with no stones has no
  `stone` row and `include_stone_cost = true` contributes `0`. That is the one
  place in this document where absence means zero, and it is safe because zero is
  the arithmetically correct value for "this piece has no stones" — unlike a
  missing *price*, where zero would be a free ring.

#### Columns added to `prices`

Every one is a **snapshot of the computation**, so a price row three years old can
be re-derived and explained without any of its inputs still existing. All are
`NULL` when `price_source = 'manual'`.

| Column | Type | Null | Notes |
| --- | --- | --- | --- |
| `formula_version_id` | `UUID` | Y | FK → `pricing_formula_versions(id)` [RESTRICT] |
| `purity_ratio_bp` | `INTEGER` | Y | Snapshot of the purity actually used |
| `metal_component_minor` | `BIGINT` | Y | |
| `making_charge_computed_minor` | `BIGINT` | Y | The money that entered the sum, whichever mode produced it (the existing `making_charge_minor` / `making_charge_bp` columns keep their 02 meaning: the *configured* inputs) |
| `stone_cost_minor` | `BIGINT` | Y | |
| `other_material_cost_minor` | `BIGINT` | Y | |
| `markup_minor` | `BIGINT` | Y | |
| `market_adjustment_delta_minor` | `BIGINT` | Y | **Signed** |
| `floor_adjustment_minor` | `BIGINT` | Y | **Signed**. The amount the `floor_minor` clamp (and the zero clamp) moved the base by; `0` when neither fired. Without this column a clamped price cannot satisfy `chk_prices_components_sum` — the components sum to the *unclamped* figure and the `INSERT` fails on exactly the lines the floor exists to protect |
| `computed_base_minor` | `BIGINT` | Y | The sum of the seven components above, after the floor clamp, before increment rounding and before any hybrid adjustment |
| `rounding_adjustment_minor` | `BIGINT` | Y | **Signed**. The residue of `rounding_increment_minor` |
| `hybrid_adjustment_delta_minor` | `BIGINT` | Y | **Signed**. `NULL` unless `price_source = 'hybrid'` |
| `inputs_digest` | `BYTEA` | Y | SHA-256 over the ordered tuple of every input `evaluateFormula` read (formula version id, rate id, purity bp, weight mg, each component cost, each market term). The value a recalc line carries forward and the apply re-checks (§3.3 step 6) |

- **CHECK** `chk_prices_formula_source: price_source = 'manual' OR formula_version_id IS NOT NULL`.
- **CHECK** `chk_prices_components_sum:`
  ```sql
  price_source = 'manual' OR (
    computed_base_minor = metal_component_minor
                        + making_charge_computed_minor
                        + coalesce(stone_cost_minor, 0)
                        + coalesce(other_material_cost_minor, 0)
                        + coalesce(markup_minor, 0)
                        + coalesce(market_adjustment_delta_minor, 0)
                        + coalesce(floor_adjustment_minor, 0)
  )
  ```
- **CHECK** `chk_prices_list_identity:`
  ```sql
  price_source = 'manual' OR (
    list_minor = computed_base_minor
               + coalesce(rounding_adjustment_minor, 0)
               + coalesce(hybrid_adjustment_delta_minor, 0)
  )
  ```
- **CHECK** `chk_prices_hybrid_adjustment: (price_source = 'hybrid') = (hybrid_adjustment_delta_minor IS NOT NULL)`.

Those two identities are why the admin "explain this price" panel is a row read
rather than a re-computation, and why a rounding bug in `evaluateFormula` fails an
`INSERT` instead of shipping a plausible wrong number.

#### A manual price and a formula binding are mutually exclusive, per market

The failure without this rule is a slow one and it always lands on the same day.
A merchandiser types a holiday price of `$189` over a formula-priced ring in the
US. The binding is still `is_active`. That night the nightly job builds a preview
which proposes `$162` for it; the run is approved for the eighty lines that
mattered; the holiday price is gone, no error is raised, and nobody looks at that
SKU again until the campaign report.

**The rule:** for any `(variant_id, market_code)`, either an active
`price_formula_bindings` row exists **or** the active `prices` row is
`price_source = 'manual'` — never both.

- `setManualPrice` on a bound (variant × market) returns `ManualOverrideError`
  (§1.5). The admin's two legal moves are named in the error and each is one
  click: **Unbind** (`setFormulaBinding({ … , isActive: false })`, audited, the
  existing price stays), or **Override as hybrid**
  (`hybrid_adjustment_type = 'fixed_override'`, `hybrid_override_minor = 18900`),
  which is the one that keeps the piece tracked against its metal content (§2.4).
  The editor offers Override first, because it is what the merchandiser actually
  wants and it is the option that survives the next silver move visibly.
- `setFormulaBinding` on a (variant × market) whose active `prices` row is
  `manual` returns the same error, offering "replace the manual price".
- The recalc enumeration (§3.3 step 1) additionally **skips any line whose current
  `prices.price_source = 'manual'`** — belt and braces, so a row that reached that
  state through a migration, a repair script or a bug is still not silently
  repriced. It is reported in the skipped tab with
  `skip_reason = 'manually overridden'`, which is how the admin finds it.

`tests/integration/manual-vs-binding.test.ts` asserts both directions of the error
and that a manual row survives an approved run over its formula.

### 2.3 The formula, and the rounding rule, exactly

All arithmetic is `bigint`. `NUMERIC(10,3)` weights and `NUMERIC(6,5)` purity are
converted to integers **at the edge** — milligrams and basis points — and never
enter money arithmetic as `Decimal` or `number` (02 §1.10 rule 2).

**Named inputs and their types:**

| Input | Type | Source |
| --- | --- | --- |
| `weightMilligrams` | `bigint` | `variant_materials.weight_grams × 1000`, or `pricing_formula_versions.fixed_weight_milligrams` |
| `rateMinorPerGram` | `bigint` | `metal_rates.rate_minor_per_gram` for `(material_id, currency_code)` |
| `rateScale` | `number` | `metal_rates.rate_scale` (0..6, default 4) |
| `purityBp` | `number` | `materials.purity_ratio × 10000`, or `purity_ratio_bp` override |
| `makingChargeBp` | `number \| null` | `pricing_formula_versions.making_charge_bp` |
| `makingChargeMinor` / `makingChargePerGramMinor` | `bigint \| null` | `pricing_formula_market_terms` |
| `stoneCostMinor` | `bigint` | `variant_component_costs` kind `stone`, this currency, `0` if absent |
| `otherMaterialCostMinor` | `bigint` | kinds `other_material` + `finishing` + `certification`, summed |
| `markupBp` / `markupMinor` | `number \| bigint \| null` | version row / market-terms row |
| `marketAdjustmentDeltaMinor` / `marketAdjustmentBp` | `bigint \| number \| null` | market-terms row, **signed** |
| `roundingIncrementMinor`, `roundingMode`, `floorMinor` | `bigint`, `'half_up'\|'up'\|'down'`, `bigint \| null` | market-terms row |

**One rounding, and it is at the end.** Every term is evaluated in a scaled
integer domain — **nano-minor units**, `SCALE = 1_000_000n`, i.e. one millionth of
a cent — and the single rounding to the minor unit happens once, on the total.

```ts
const SCALE = 1_000_000n;

// 1. Metal. Multiply everything first; divide once.
//    divisor = 10^rateScale (rate scaling) × 1000 (mg→g) × 10000 (purity bp)
const divisor   = 10n ** BigInt(rateScale) * 1000n * 10000n;
const metalNano = (rateMinorPerGram * weightMilligrams * BigInt(purityBp) * SCALE) / divisor;

// 2. Making charge — exactly one of these, by making_charge_mode
const makingNano =
    mode === 'none'            ? 0n
  : mode === 'percent_of_metal'? (metalNano * BigInt(makingChargeBp!)) / 10_000n
  : mode === 'fixed_per_gram'  ? (makingChargePerGramMinor! * weightMilligrams * SCALE) / 1000n
  : /* 'fixed' */                makingChargeMinor! * SCALE;

// 3. Components, already integral minor units
const stoneNano = stoneCostMinor * SCALE;
const otherNano = otherMaterialCostMinor * SCALE;

// 4. Subtotal, then markup on the subtotal — never on the metal alone
const subtotalNano = metalNano + makingNano + stoneNano + otherNano;
const markupNano   =
    markupMode === 'none'               ? 0n
  : markupMode === 'percent_of_subtotal'? (subtotalNano * BigInt(markupBp!)) / 10_000n
  : /* 'fixed' */                         markupMinor! * SCALE;

// 5. Market adjustment — signed, applied last, in this market's own currency
const adjustmentNano =
    marketAdjustmentDeltaMinor != null ? marketAdjustmentDeltaMinor * SCALE
  : marketAdjustmentBp        != null ? ((subtotalNano + markupNano) * BigInt(marketAdjustmentBp)) / 10_000n
  : 0n;

// 6. THE rounding. Half-up to the minor unit, once, on the whole expression.
const rawMinor = (subtotalNano + markupNano + adjustmentNano + SCALE / 2n) / SCALE;
let baseMinor = rawMinor;
if (baseMinor < 0n) baseMinor = 0n;                       // a stack of negatives never goes below zero
if (floorMinor != null && baseMinor < floorMinor) baseMinor = floorMinor;
const floorAdjustmentMinor = baseMinor - rawMinor;        // signed; → prices.floor_adjustment_minor

// 7. Commercial rounding to the market's increment — a second, deliberate,
//    per-market step, recorded separately as rounding_adjustment_minor
let listMinor = roundToIncrement(baseMinor, roundingIncrementMinor, roundingMode);

// 7b. The floor is a floor AFTER the increment, not before it. roundingMode
//     'down' with an increment coarser than the gap to the floor walks straight
//     back through it: floor 10000, base 10000, increment 3000, 'down' → 9000,
//     which is below the floor the admin set to stop exactly that.
if (floorMinor != null && listMinor < floorMinor) {
  listMinor = roundToIncrement(floorMinor, roundingIncrementMinor, 'up');
}
```

`roundToIncrement(x, inc, 'half_up') = ((x + inc / 2n) / inc) * inc`;
`'up'` = `((x + inc - 1n) / inc) * inc`; `'down'` = `(x / inc) * inc`.
All three are defined for `x >= 0n` only, which step 6's clamp guarantees.

**`applyBpSigned`, because `applyBp` is not signed.** 02 §1.10 rule 1 defines
`applyBp(a, bp) = (a * BigInt(bp) + 5000n) / 10000n`. BigInt division truncates
**toward zero**, so for a negative product that expression rounds the wrong
direction and the `+5000n` pushes it further wrong — a `−1500 bp` hybrid
adjustment (§2.4) computed with `applyBp` is off by a minor unit in the
merchant's favour on roughly half of all bases, forever, silently.

```ts
// src/lib/pricing/money.ts — used by hybrid `percent` and by market_adjustment_bp
export function applyBpSigned(amountMinor: bigint, bp: number): bigint {
  const p = amountMinor * BigInt(bp);
  const neg = p < 0n;
  const mag = (neg ? -p : p);
  const r = (mag + 5000n) / 10_000n;          // half-up on the magnitude
  return neg ? -r : r;                         // away from zero on .5 — 02 §1.10 rule 5
}
```

`tests/unit/money-apply-bp.test.ts` pins both functions at `±0.5` boundaries; the
assertion that matters is `applyBpSigned(-a, bp) === -applyBpSigned(a, bp)`.

**Component snapshots are allocated, not re-rounded.** The six component columns
must sum to `computed_base_minor` (`chk_prices_components_sum`), so
`evaluateFormula` floors each non-negative component's exact nano value, then hands
the remaining minor units out one each by largest fractional remainder — the
`allocate()` function from 02 §1.10 rule 3, same implementation, same tie-break.

> **DECISION CHANGED:** this paragraph used to say the ties are "broken by the
> fixed component order `metal → making → stone → other_material → markup`", while
> `02 §1.10` rule 3 said they are broken by `line_number`. Neither is
> implementable: `allocate(totalMinor: bigint, weights: bigint[]): bigint[]`
> receives weights, and a `bigint[]` carries neither a component name nor a line
> number. **One rule, and it is positional** (set decision D-C):
>
> **`allocate()` distributes by largest remainder and gives each leftover minor
> unit to the LOWEST INDEX FIRST. The caller is responsible for passing entries in
> the order the tie-break should favour.**
>
> The signature is unchanged and now implementable exactly as written, and both
> call sites are correct without it changing: order lines are passed in
> `line_number` order (`05 §5.1` builds the array from
> `ORDER BY line_number`), and price components are passed in the fixed order
> **metal → making → stone → other_material → markup**. The old wording is not
> wrong about *which* component wins a tie — it is wrong about *where that fact
> lives*, which is the caller's argument order, not the function.

> **RESOLVED — was CHANGE REQUIRED IN 02 §1.10 rule 3:**
> *Applied. The change now lives in 02 §1.10 rule 3 — lowest-index tie-break, caller-ordered.*
> "ties broken by `line_number`" becomes
> "leftover minor units go to the lowest index first; the caller passes entries in
> the order the tie-break should favour — order lines in `line_number` order, price
> components in the fixed order metal → making → stone → other_material → markup".
> The postcondition `sum(result) === totalMinor` is unchanged.

> **RESOLVED — was CHANGE REQUIRED IN 09 §2.2:** the `allocate()` property-sweep row reads "ties
> *Verified applied in 09.*
> broken by `line_number`". It becomes "ties broken by lowest index", and gains one
> case: two equal weights receive the leftover in index order, asserted on the
> array and not on a line number the function never sees. The allocation
target is `rawMinor` (step 6, pre-clamp), **not** `computed_base_minor`: the signed
`market_adjustment_delta_minor` and `floor_adjustment_minor` are stored exactly as
computed and are excluded from the allocation weights, and the `CHECK` adds them
back. Allocating against the clamped figure instead would ask `allocate()` to
invent the clamp's whole delta out of five remainders, which it cannot do, and the
`INSERT` would fail on precisely the lines the floor exists to protect.
Independently rounding six components is the other way a preview that a human
approved becomes an `INSERT` that fails a `CHECK`.

**Truncation, named rather than hidden.** Step 1 divides after multiplying, so its
residual error is under one nano-minor — under 10⁻⁶ of a cent. Across all six terms
the accumulated error cannot reach 10⁻⁵ of a minor unit, which cannot change the
half-up rounding at step 6 unless the exact value sits within 10⁻⁵ of a `.5`
boundary. `tests/unit/pricing-formula.test.ts` asserts this with a property sweep
over weights 0.1–500 g, purities 0.3750–1.0000 and rates across four decades.

### 2.4 HYBRID — calculated base plus a stored admin adjustment

HYBRID is not a third algorithm. It is SILVER-LINKED plus one signed, stored,
per-market number, and it resolves in one place:

```
list_minor = computed_base_minor + rounding_adjustment_minor + hybrid_adjustment_delta_minor
```

The adjustment is configured on `price_formula_bindings` (per product-or-variant,
**per market**, in that market's own currency) and materialised onto the `prices`
row as `hybrid_adjustment_delta_minor` so the identity above is checkable by the
database. Three adjustment types, all resolved to that one signed delta at write
time:

| `hybrid_adjustment_type` | Configured as | Resolves to |
| --- | --- | --- |
| `percent` | `hybrid_adjustment_bp`, signed (`-1500` = 15% below the calculated price; `2500` = 25% above) | `delta = applyBpSigned(roundedBase, bp)` |
| `fixed_delta` | `hybrid_adjustment_delta_minor`, signed, in this market's currency | `delta = that value` |
| `fixed_override` | `hybrid_override_minor` — "whatever the formula says, this piece is $495" | `delta = overrideMinor − roundedBase` |

`fixed_override` is the one that earns HYBRID its place: a hero piece whose price
is a merchandising decision, that must still be *tracked* against its metal content
so the margin report and the next recalculation preview show what the gap is. A
`fixed_override` line still appears in every recalc preview, still shows its
recalculated base, and still reports the override as an explicit delta — so an
8% silver rise silently eating an override's margin is visible, which is exactly
what a `manual` price would have hidden.

**Which of the three is re-derived on a recalculation, and which is carried.**
This is not obvious and getting it backwards changes every hybrid price in the
catalogue:

| Type | On each approved run |
| --- | --- |
| `percent` | **Re-derived**: `delta = applyBpSigned(roundedBase_new, hybrid_adjustment_bp)`. "15% below the calculated price" has to track the calculated price or it is not a percentage |
| `fixed_delta` | **Carried verbatim** from the binding. "+$20 over formula" is a fixed number of dollars |
| `fixed_override` | **Re-derived**: `delta = hybrid_override_minor − roundedBase_new`, so `list_minor` comes out **unchanged** |

A `fixed_override` line therefore proposes `proposed_list_minor =
current_list_minor` on every run, with a moved `computed_base_minor` and a moved
delta. That is a real change to the row's provenance and it is applied — the new
`prices` row records what the piece is now worth in metal against what it is being
sold for — but it is **not** a price change, so it is grouped into its own
*Tracked, unchanged* tab in the preview (§3.3 step 4), excluded from
`total_increase_minor` / `total_decrease_minor`, and its `price_history` row
carries `change_bp = 0`. Without the grouping, a 2,000-piece catalogue with 300
overrides produces a preview whose first three screens are all zeros and whose
reviewer stops reading.

**Per-market storage, stated plainly.** A product can be `hybrid` with a `+2500 bp`
adjustment in the US and `metal_linked` with no adjustment in India, or hybrid in
both with completely unrelated adjustments. There is one binding row per
(thing × market). No adjustment is ever shared, mirrored, suggested or converted
across markets, and the composite FK `(market_code, currency_code) → markets` makes
a rupee adjustment on a US binding unwritable.

**Precedence against `pricing_rules`.** The hybrid adjustment produces
`prices.list_minor`; `pricing_rules` (sales, group pricing) act on that list price
at resolve time (§1.4 step 5). They are different layers and they compose in that
order: a hybrid price is a *price*, a rule is a *discount*, and a rule never writes
a `prices` row.

### 2.5 What of §2.2–§2.4 ships in release 1, and what defers

The cross-document review's first architectural disagreement is that the
four-table formula system is over-built for a single developer's first release,
that `P12` sits on the critical path through the "short, deep, dangerous" `M2`
milestone (`09 §1.6`), and that §5.3's `NEEDS INPUT` may come back *"silver only,
manual entry"* after it is built. That is a fair reading of the cost and it is
answered here rather than left to be discovered at `P12`.

**Decision: the four tables are migrated in release 1 exactly as specified above;
the *authoring surface* over them is cut to one formula and one mode.** The split
is between schema and product surface because those two costs are not
comparable — the schema is one migration against empty tables, and re-migrating
`prices` after real price rows exist is the expensive event `99` names as the
reason this contradiction is worth three hours now.

**Ships in release 1 — not negotiable, because hard rule 6 lives on it:**

| Ships | Why it cannot be deferred |
| --- | --- |
| All four tables + `variant_component_costs`, migrated in `P10` | Empty-table DDL. Adding `pricing_formula_market_terms` later means backfilling a per-market currency term out of a column that had one number for both markets — the hard-rule-2 violation this schema exists to make unwritable |
| The thirteen snapshot columns on `prices` and both identities (`chk_prices_components_sum`, `chk_prices_list_identity`) | They are what makes the preview a human approved arithmetically identical to the row that ships (§3.3 step 3). Without them the apply is a re-computation and the run detail screen is a record of numbers that never existed |
| The whole of §3.3: `recalc_runs`, preview, the four review tabs, approve, apply, both staleness windows, the per-line `SAVEPOINT`, `inputs_digest` | This **is** hard rule 6. There is no smaller version of "an admin approves before customer prices move" |
| `price_source ∈ {manual, metal_linked}` end to end | The two modes the client has actually asked about |
| `evaluateFormula` in full, including `applyBpSigned` and the nano-minor domain (§2.3) | One implementation, used by the editor preview, the recalc preview and the apply. A cut-down evaluator is a second one |
| `pricing_formula_market_terms.floor_minor`, `rounding_increment_minor`, `rounding_mode`, `market_adjustment_delta_minor` | Per-market commercial rounding is what makes ₹10,000 come out ₹10,000 and not ₹10,011 (§9.3). These are the terms that differ between markets on day one |

**Defers, and each is a flag or a screen, never a migration:**

| Defers | Mechanism that holds it back | What turning it on later costs |
| --- | --- | --- |
| **`hybrid` and all three adjustment types** | `setFormulaBinding()` returns `ValidationError` for `mode: 'hybrid'` unless the `settings` row `pricing.enable_hybrid` (boolean, seeded **`false`**, market-global) is true. The enum value, the columns and `chk_pfb_hybrid` still ship — a Postgres enum value cannot be added to a type in use without its own migration, and removing one needs a type rewrite | One settings save. The *Tracked, unchanged* preview tab (§2.4) and the `fixed_override` re-derivation are already specified and tested; they are simply unreachable while the flag is off |
| **More than one formula** | `/admin/pricing/formula` is a single-row screen, not a list: the seed writes exactly one `pricing_formulas` row and there is no Create button and no formula picker on the product pricing tab. `setFormulaBinding` resolves `formulaId` from that one row | Adding the list screen and the picker. No data change — `price_formula_bindings.formula_id` is already an FK to a table that can hold N rows |
| **The version diff viewer and version pinning** | Editing the formula still appends a `pricing_formula_versions` row and still moves `published_version_id` — versioning is an `INSERT`, and doing it from day one is what makes a two-year-old price explainable. What defers is the *screen* that renders version N against N−1 | One read-only screen over rows that already exist |
| **The vendor rate adapter** | Already env-gated: `METAL_RATE_PROVIDER=manual` is the default and a supported launch state (§3.2, 11 §6). `providers/manual.ts` is the only implementation | Writing one adapter against the interface in §3.2 |

**If the client answers "manual only", the bill is four empty tables and one
migration.** Nothing in the deferred column is ever enabled, `/admin/pricing/formula`
is never opened, and `P12` reduces to the recalculation approval path — which is
needed the moment *any* price is `metal_linked`, and which is the part of `P12`
that is genuinely on the critical path.

**The alternative the review proposes — one formula shape as columns on
`price_formula_bindings` — is rejected, and the reason is operational, not
aesthetic.** A binding row is per (variant × market). Putting the making-charge
mode, the markup, the rounding increment and the floor on it means every variant
carries its own copy of them: a 2,000-piece catalogue holds 4,000 copies of
"150% making charge", changing it is a 4,000-row `UPDATE` with no version row, no
`inputs_digest`, no preview of what it will do, and no way to answer "what was the
making charge in March". That is the same table shape this document rejects for
prices themselves. The four tables are not four ideas; they are one idea
normalised along the two axes the system already has — **version** (append-only,
currency-free) and **market** (currency-denominated) — and that normalisation is
what lets one edit reprice a catalogue through a reviewed run instead of a script.

---

## 3. The silver price manager

### 3.1 The record

`metal_rates` is defined verbatim in 02 §2.5 and is not restated. The parts this
section depends on:

| Field | Column | Note |
| --- | --- | --- |
| Price | `rate_minor_per_gram BIGINT` | Scaled by `10^rate_scale` |
| Scale | `rate_scale SMALLINT` default `4` | Four extra digits of the quote kept as an integer |
| Unit | — | **Per gram, always.** A troy-ounce quote is converted to per-gram *once, by the admin or the provider adapter, at entry*, and the per-gram figure is what is stored. The stored unit is never ambiguous and there is no unit column to misread |
| Currency | `currency_code CHAR(3)` | FK → `currencies` |
| Purity | — | **Not on this row.** The rate is for *pure* metal; purity is applied per-formula from `materials.purity_ratio` (02 §2.4). A rate row that already had purity baked in could not price 925 and 999 silver from one quote |
| Effective date | `effective_at TIMESTAMPTZ` | Business-meaningful, distinct from `created_at` — a Friday quote entered on Monday is dated Friday |
| Source | `source TEXT` | `manual`, or the provider key |
| Reference | `source_reference TEXT` | Vendor quote id |
| Timestamp | `created_at TIMESTAMPTZ` | Append-only; no `updated_at`, no `UPDATE` path |
| Who | `entered_by_user_id UUID` | |

There is no `silver_prices` table and no single `rate` column: silver is a
`materials` row with `is_rate_linked = true`, gold is the next one (01 §2.3).

**Admin screen: `/admin/pricing/metal-rates`.** A matrix of rate-linked materials ×
active-market currencies, each cell showing the current rate, its age in hours, a
staleness badge past `PRICING_RATE_MAX_AGE_HOURS`, and a sparkline from
`idx_metal_rates_latest`. Entry is one form per cell — material, **currency**,
rate, scale, effective date, source reference — and the currency is a required
select with no default, because a defaulted currency is how a USD quote gets filed
as the INR rate. Permission: **`metal_rate.manage`** (11 §1.3 row 26 — the key was
spelled ~~`metal_rate.create`~~ in an earlier revision of this document and that
spelling is rejected; it is held by `owner`, `admin` and `catalog_manager`).

> **NEEDS INPUT:** the unit and quote convention the client's supplier uses
> (per gram or per troy ounce, and to how many decimal places), and whether their
> INR silver quote is an independent local quote or an internal conversion of a USD
> quote. If it is an internal conversion, that is the client's commercial decision
> made outside this system and entered as a number — but it must be entered
> knowingly, not performed by this software.

### 3.2 The future-rate-API seam

```ts
// src/lib/pricing/providers/index.ts
export interface MetalRateProvider {
  readonly key: string;                               // 'manual' | vendor key
  readonly supportedCurrencies: readonly CurrencyCode[];
  fetchRate(input: {
    materialId: string;
    currencyCode: CurrencyCode;
    at: Date;
  }): Promise<Result<MetalRateQuote, RateProviderError>>;
}

export type MetalRateQuote = {
  rateMinorPerGram: bigint;
  rateScale: number;
  currencyCode: CurrencyCode;      // MUST equal the requested currency
  effectiveAt: Date;
  sourceReference: string | null;
};

export function getRateProvider(): MetalRateProvider | null;   // env-selected
```

Three contract rules the adapter layer enforces, not the vendor:

1. **A provider that cannot quote a currency returns `RateProviderError`**, never a
   converted figure. `supportedCurrencies` is checked before the call and the
   returned `currencyCode` is asserted equal to the requested one afterwards. A
   feed that quotes only USD makes India's linked prices *manual* — a supported
   state — not derived.
2. **The provider writes nothing.** `fetchRate()` returns a quote;
   `recordMetalRate()` is the only thing that inserts, and it is the same function
   the manual form calls. One write path, one audit shape.
3. **`source` is the provider key, never `manual`**, so the history distinguishes
   a human's number from a feed's.

New env vars (01 §4 pattern — `optional` means the integration reports
`unconfigured`, never a fake value):

| Key | Sev | Default | What breaks without it |
| --- | --- | --- | --- |
| `METAL_RATE_PROVIDER` | optional | `manual` | Falls back to manual entry; `/api/cron/metal-rate-refresh` no-ops and says so at `/admin/system/jobs` |
| `METAL_RATE_API_URL` / `METAL_RATE_API_KEY` | optional | — | The vendor adapter reports `unconfigured` on the Integrations page with the exact missing keys |
| `PRICING_RATE_MAX_AGE_HOURS` | optional | `48` | Staleness is never detected and a recalc preview would price from a month-old rate |
| `PRICING_RECALC_MAX_LINES` | optional | `20000` | A whole-catalogue preview can be built that no human can review |
| `PRICING_RECALC_CHUNK_SIZE` | optional | `200` | The apply job tries one giant transaction and times out |
| `PRICING_RECALC_ALERT_BP` | optional | `2000` | Lines moving more than 20% are not flagged for review |
| `PRICING_RECALC_PREVIEW_MAX_AGE_HOURS` | optional | `24` | A preview built from a rate that has since moved can be approved; the numbers a human reviewed are not the numbers that ship |
| `PRICING_RECALC_APPROVAL_MAX_AGE_HOURS` | optional | `24` | An approval can sit in the queue for a week and then apply week-old arithmetic. The window is separate from the preview window because they bound different gaps — review→approve and approve→apply |

`'metal_rate_api'` is an `IntegrationKey` — **11 §6** carries the complete
fourteen-value union and this document does not widen it by prose. Its env-var set
is `METAL_RATE_PROVIDER` (≠ `manual`), `METAL_RATE_API_URL`, `METAL_RATE_API_KEY`,
and it is **not** a launch blocker: `unconfigured` means
`/api/cron/metal-rate-refresh` no-ops and says so at `/admin/system/jobs`, and
rates are entered by hand at `/admin/pricing/metal-rates`, which is a supported
launch state.

### 3.3 The critical control: a rate change moves nothing

**Hard rule 6, mechanically.** `recordMetalRate()` inserts exactly one
`metal_rates` row. It contains no `INSERT INTO prices`, no `UPDATE prices`, no
`revalidateTags()` call, and it is physically unable to acquire one: the
`prices`-writing functions live in `resolve.ts`/`recalc.ts` and `rates.ts` does not
import them. The proof is a test, not a paragraph:

`tests/integration/rate-change-does-not-move-prices.test.ts` — seed a
metal-linked variant priced in both markets, snapshot `prices` and
`getDisplayPrice()`, insert a silver rate 30% higher, assert byte-identical
`prices` rows, an identical `getDisplayPrice()` result, zero new `price_history`
rows and zero cache-tag purges.

The nightly `/api/cron/metal-rate-refresh` (01 §5.6) fetches rates and then creates
a **preview only** — `recalc_runs` in status `previewing` → `pending_approval`. It
has no approval authority and no code path to `applied`.

#### The recalculation workflow

The states are the `recalc_run_status` enum (02 §1.9):
`previewing → pending_approval → approved → applying → applied`, with `rejected`
and `failed` as terminals.

**Step 1 — enumerate.** `createRecalcPreview()` selects the lines to be repriced:

```sql
-- $1 char(2)[]  markets       NULL = every active market
-- $2 uuid       material      NULL = every material with is_rate_linked = true
-- $3 uuid[]     productIds    NULL = no product filter   ┐
-- $4 uuid[]     categoryIds   NULL = no category filter  ├ scope, ANDed when present
-- $5 uuid[]     collectionIds NULL = no collection filter┘
-- $6 boolean    includeManuallyOverridden
SELECT b.variant_id, b.product_id, b.market_code, b.currency_code,
       b.formula_id, f.published_version_id AS formula_version_id, b.mode,
       p.id  AS current_price_id,
       p.list_minor AS current_list_minor,
       p.sale_minor, p.compare_at_minor, p.cost_minor, p.price_source
FROM price_formula_bindings b
JOIN product_variants v ON v.id = b.variant_id AND v.deleted_at IS NULL AND v.is_active
JOIN products pr        ON pr.id = b.product_id AND pr.deleted_at IS NULL
JOIN pricing_formulas f ON f.id = b.formula_id AND f.is_active AND f.deleted_at IS NULL
JOIN markets m          ON m.code = b.market_code AND m.is_active
LEFT JOIN prices p ON p.variant_id = b.variant_id
                  AND p.market_code = b.market_code
                  AND p.valid_to IS NULL AND p.deleted_at IS NULL
WHERE b.is_active
  AND ($1::char(2)[] IS NULL OR b.market_code = ANY($1))
  AND ($2::uuid      IS NULL OR EXISTS (
        SELECT 1 FROM pricing_formula_versions pfv
        WHERE pfv.id = f.published_version_id
          AND coalesce(pfv.material_id, (SELECT vm.material_id FROM variant_materials vm
                                         WHERE vm.variant_id = v.id AND vm.is_primary)) = $2))
  AND ($3::uuid[] IS NULL OR b.product_id = ANY($3))
  AND ($4::uuid[] IS NULL OR EXISTS (SELECT 1 FROM product_categories pc
                                     WHERE pc.product_id = b.product_id AND pc.category_id = ANY($4)))
  AND ($5::uuid[] IS NULL OR EXISTS (SELECT 1 FROM product_collections pcol
                                     WHERE pcol.product_id = b.product_id AND pcol.collection_id = ANY($5)))
  AND ($6 OR p.price_source IS NULL OR p.price_source <> 'manual')
ORDER BY b.variant_id, b.market_code;
```

served by `idx_pfb_formula` and `idx_pfb_product`, `idx_variant_materials_primary`,
`idx_product_categories_rank`, and `idx_prices_active`.

**Five things this query gets right that the obvious one does not**, each of which
silently produces an empty or partial run rather than an error:

1. **The material filter follows the formula, not the variant's material list.**
   `pricing_formula_versions.material_id` may name the material explicitly; only
   when it is `NULL` does the variant's `is_primary` row decide. A filter written
   as `EXISTS (variant_materials WHERE material_id = $2)` also silently excludes
   every variant priced with `weight_source = 'fixed'`, which may carry no
   `variant_materials` row at all.
2. **`NULL` means "all", and is spelled that way in the predicate it guards.** A
   parameter that gates the *market* filter must be the market parameter; a
   `materialId` of `NULL` compared with `=` matches nothing, and a preview of zero
   lines over the whole catalogue reads exactly like a preview with nothing to
   change.
3. **The scope parameters in the signature appear in the SQL.** A `scope` argument
   that the query ignores is worse than no scope argument: the admin narrows to one
   collection, sees `TooManyLinesError`, and concludes the scope filter is broken
   rather than absent.
4. **`f.published_version_id` is selected, once, here.** Every line in the run is
   evaluated against the version that was published when the preview was built, so
   publishing a new formula version mid-review cannot change what the approver
   approved. The version id is stored on each line.
5. **Manually-overridden rows are excluded by default** (§2.2), and
   `includeManuallyOverridden` is a deliberate, logged choice rather than the
   implicit behaviour.

**Inputs are loaded in bulk, not per line.** `evaluateFormula` is pure and
synchronous; everything it needs is fetched by the preview builder in **five
queries per chunk of `PRICING_RECALC_CHUNK_SIZE` variants** — `variant_materials`,
`materials`, `variant_component_costs` (filtered to the chunk's currencies),
`pricing_formula_market_terms` for the version × market pairs, and the latest
`metal_rates` row per (material, currency) — assembled into maps and passed in.
The naive shape is five queries *per line*: at `PRICING_RECALC_MAX_LINES = 20000`
that is 100,000 round trips against a `prisma dev` pool capped at 10 connections
(00 §3), and the job does not finish.

**Step 2 — evaluate, per market, independently.** For each line, read the rate for
**that market's currency**. Missing or stale ⇒ the line is written with
`status = 'skipped'` and `skip_reason = 'no USD silver rate for 2026-09-12'`
(01 §2.3, verbatim), `proposed_list_minor = NULL`, and the run continues with the
other markets. A run never blocks one market on another's missing rate, and never
substitutes one currency's rate for another's.

**Step 3 — write the preview.** One `recalc_run_lines` row per (variant, market),
with `current_list_minor`, `proposed_list_minor`, `metal_rate_id` and `status`.
`recalc_runs.line_count`, `skipped_count`, and — only when `market_code IS NOT NULL`
so nothing is ever summed across currencies (02 §2.5) — `total_increase_minor` /
`total_decrease_minor`.

`recalc_runs.market_code` is set **only when the run covers exactly one market**;
a run over two of three markets leaves it `NULL` and both money totals `0`, which
`chk_recalc_totals_market` already requires. The per-market totals a two-market run
needs are computed from `recalc_run_lines` grouped by `(market_code,
currency_code)` and rendered per market — never one column, because one column
means one number, and one number over two currencies is the addition this whole
document exists to prevent.

**The preview line must carry the whole proposed row, not just its total.** This
is the difference between "an admin approved these numbers" and "an admin approved
a number and the job recomputed one later". If the apply re-evaluates, then a stone
cost edited at 4 p.m., a variant re-weighed at 5 p.m., or a formula version
published at 6 p.m. changes what ships at 2 a.m. — and the run detail screen still
shows the figures that were approved, so the discrepancy is invisible in the one
place anyone would look. The apply therefore performs **no arithmetic**; it inserts
the columns the preview already computed.

> **SCHEMA ADDITION (02 §2.5, `recalc_run_lines`):** the proposed row, snapshotted.
> `formula_version_id UUID NULL` FK → `pricing_formula_versions(id)` [RESTRICT],
> `purity_ratio_bp INTEGER NULL`, `metal_weight_grams NUMERIC(10,3) NULL`,
> `metal_component_minor BIGINT NULL`, `making_charge_computed_minor BIGINT NULL`,
> `stone_cost_minor BIGINT NULL`, `other_material_cost_minor BIGINT NULL`,
> `markup_minor BIGINT NULL`, `market_adjustment_delta_minor BIGINT NULL`,
> `floor_adjustment_minor BIGINT NULL`, `computed_base_minor BIGINT NULL`,
> `rounding_adjustment_minor BIGINT NULL`, `hybrid_adjustment_delta_minor BIGINT NULL`,
> `proposed_sale_minor BIGINT NULL`, `inputs_digest BYTEA NULL`,
> `change_bp INTEGER NULL`.
> All `NULL` when `status = 'skipped'`.
> **CHECK** `chk_rrl_proposed: (status = 'skipped') = (proposed_list_minor IS NULL)`.

> **SCHEMA ADDITION (02 §2.5, `recalc_runs`):** `failed_count INTEGER NOT NULL
> DEFAULT 0` and `unchanged_count INTEGER NOT NULL DEFAULT 0`. A run that applied
> 7,940 of 8,000 lines is not `applied` and is not `failed`; both counters are how
> the run detail screen and `/admin/system/jobs` say so without a new enum value.

**Sale, compare-at and cost are carried forward, and the carry is checked.** The
`prices` row a recalculation supersedes may be on sale, may carry a struck-through
`compare_at_minor`, and does carry `cost_minor`. The replacement row is a **new
row**, so anything not copied is gone. Dropping `sale_minor` ends a live campaign
silently; dropping `cost_minor` breaks every margin report from that date forward
and is unrecoverable without the history table. So `proposed_sale_minor`,
`compare_at_minor` and `cost_minor` are copied from the superseded row onto the
preview line and inserted with it — and the two cases where copying is wrong are
each a preview flag, not a silent decision:

- `sale_minor > proposed_list_minor` would violate `chk_prices_sale_lte_list`
  (02 §2.5). The line is flagged **"sale price now exceeds list"**, the run cannot
  be approved while any such line is unresolved, and the admin chooses per line:
  end the sale, or clamp it to the new list.
- `proposed_list_minor < cost_minor` is flagged **"below cost"** independently of
  `PRICING_RECALC_ALERT_BP`, and is visible only to `price.read_cost` holders (§4).

**Step 4 — review.** `/admin/pricing/recalc-runs/[id]` renders:

- header: material, market(s), the rate row used (value, effective date, source,
  age), the creator, the line and skip counts, and the currency-scoped totals;
- a per-market table: product, variant, SKU, current, proposed, absolute delta,
  percentage delta, the six formula components of the proposed price, and the
  binding's mode;
- sorted by absolute percentage delta descending, so the worst surprises are at the
  top, with a **red flag on any line exceeding `PRICING_RECALC_ALERT_BP`** and a
  separate flag on any line that would cross below `floor_minor` or below
  `prices.cost_minor`;
- **four tabs, so the reviewer's first screen is the one that matters**:
  *Changing* (`proposed_list_minor <> current_list_minor`, the default, sorted by
  absolute percentage delta descending), *Tracked, unchanged* (`fixed_override`
  lines, §2.4), *Skipped* (with reasons — never hidden), and *Blocked* (the
  sale-exceeds-list and below-cost lines that must be resolved before approval);
- CSV export of the whole preview for offline review.

**Step 5 — approve.** `approveRecalcRun()` requires the `price.approve_recalc`
permission (11 §1.3 row 25 — `owner` and `admin` only, 11 §1.4), stamps `approved_by_user_id` and
`approved_at`, and writes an `audit_logs` row with action `approve_recalc`. The
schema makes an unapproved application unrepresentable:
`chk_recalc_approved: (status IN ('approved','applying','applied')) = (approved_by_user_id IS NOT NULL)`.

A `settings` row `pricing.require_second_approver` (boolean, **default `false`**,
market-global) makes `approved_by_user_id <> created_by_user_id` a service-layer
requirement for staff-created runs. It is off by default because the launch team is
small and a lock nobody can open is a lock that gets disabled; it is a row rather
than a constant so turning it on is a settings change, not a deploy. A run created
by `cron` has `created_by_user_id IS NULL` and always requires a human approver by
construction.

A preview older than `PRICING_RECALC_PREVIEW_MAX_AGE_HOURS` (default 24) cannot be
approved: the rate it was built from has moved and the numbers a human reviewed are
no longer the numbers that would ship. `approveRecalcRun()` returns
`IllegalTransitionError` and the UI offers "rebuild preview". The same bound
applies to the **other** gap, which is easier to forget: `applyRecalcRun()` refuses
a run whose `approved_at` is older than `PRICING_RECALC_APPROVAL_MAX_AGE_HOURS`
with `RecalcStaleError`. An approval that sat in the queue over a long weekend is
not consent to ship Friday's arithmetic on Tuesday.

The approval transition is itself a conditional update, not a read-then-write:
`UPDATE recalc_runs SET status='approved', approved_by_user_id=$2, approved_at=now()
WHERE id=$1 AND status='pending_approval'` — **assert one row affected**. Two
admins approving from two tabs otherwise both succeed, and the second stamps its
own name over the first's in the column `chk_recalc_approved` exists to make
trustworthy.

**Step 6 — apply, inside transactions.** `applyRecalcRun()` claims the run with a
**conditional update inside its own transaction**, then enqueues the job:

```sql
UPDATE recalc_runs SET status = 'applying', job_id = $2
WHERE id = $1 AND status = 'approved';     -- assert exactly one row affected
```

Zero rows is `IllegalTransitionError`. This is what stops a double-click, two
admin tabs, or a retried server action from enqueuing two `recalc_apply` jobs for
one run. The per-line guard below makes the second job's work a no-op, but two
workers racing over the same 8,000 rows is a lock-contention incident even when it
is arithmetically harmless, and the fix is one `WHERE` clause.
`jobs` additionally carries `UNIQUE (kind, dedupe_key) WHERE status IN ('queued','running')`
with `dedupe_key = recalc_run_id`, so the constraint and the status guard fail
independently.

`/api/cron/run-jobs` drains it. The apply is **chunked at
`PRICING_RECALC_CHUNK_SIZE` lines per transaction** — a single transaction over
8,000 lines exceeds `maxDuration`, holds a pooled connection against the
`prisma dev` 10-connection cap, and fails in a way that leaves the run neither
applied nor un-applied. Each chunk is one transaction; **each line inside it runs
in its own `SAVEPOINT`**, and per line, in order:

0. Re-read the live `prices` row and recompute `inputs_digest` from the current
   inputs. If it differs from the line's snapshot, **the line is not applied**:
   roll back to the savepoint, `UPDATE recalc_run_lines SET status='failed',
   skip_reason='inputs changed since approval'`, continue. Something a human did
   not review moved between approval and apply — a re-weighed variant, an edited
   stone cost, a republished formula — and shipping it would make the run detail
   screen a record of numbers that never existed;
1. `UPDATE prices SET valid_to = now() WHERE id = :currentPriceId AND valid_to IS NULL`
   — **assert exactly one row affected**, else the line is `failed` with
   `skip_reason='repriced by someone else'` and the chunk continues
   (02 §2.5: without the assertion two concurrent writers both "close" the row);
2. `INSERT INTO prices (…, price_source, formula_version_id, metal_rate_id,
   metal_weight_grams, purity_ratio_bp, metal_component_minor,
   making_charge_computed_minor, stone_cost_minor, other_material_cost_minor,
   markup_minor, market_adjustment_delta_minor, floor_adjustment_minor,
   computed_base_minor, rounding_adjustment_minor, hybrid_adjustment_delta_minor,
   list_minor, sale_minor, compare_at_minor, cost_minor, inputs_digest,
   recalc_run_id, created_by_user_id)` — **every value read from the
   `recalc_run_lines` row, none recomputed here**;
3. `INSERT INTO price_history (…, reason = 'recalc_run', recalc_run_id,
   actor_type = 'staff', actor_user_id = <approver>, change_bp)`;
4. `UPDATE recalc_run_lines SET status='applied', new_price_id = :newId`;
5. `recordAudit(tx, …)` inside the same transaction (01 §2.3 step 5).

**A savepoint per line, not a chunk that dies whole.** The earlier shape — one
`ConflictError` aborts the chunk — means a single merchandiser editing a single
price during the apply discards 199 correctly-computed lines and stops the run.
With savepoints, the conflicting line is recorded as `failed` with a reason a human
can act on and the other 199 commit. The run finishes as `applied` with
`failed_count > 0`, the failures are listed on the run detail screen, and
"rebuild preview for the failed lines" is one button. A chunk-level abort is
reserved for an error that is not line-local (connection loss, a `CHECK` violation
that indicates an `evaluateFormula` bug), which moves the run to `failed`.

Re-running an already-applied line is a no-op that reports rather than a second
close, because its `current_price_id` guard in step 1 finds a row whose `valid_to`
is already set.

**After commit, not before** (01 §2.3 step 6): `revalidateTag(product:{id})` for
each distinct touched product, and `revalidateTag(market:{code})` **once per market
at the end of the whole run** — not once per line. `market:{m}` sits on navigation,
settings, category listings and every display-price entry in that market (01 §2.4);
purging it 8,000 times empties the entire market's cache 8,000 times and every
request in between rebuilds it, which is a self-inflicted stampede on the hottest
pages on the site. Per-product purges are the fine-grained correctness mechanism;
the single market purge at the end is the sweep.

**There is no `price:` tag and none is added**: display prices are cached under the
product and market tags, which are exactly the tags a reprice must purge.

**Step 7 — log.** The run itself is the log: `recalc_runs` + `recalc_run_lines`
are never deleted, `prices` rows carry `recalc_run_id`
(`idx_prices_recalc`), `price_history` rows carry it
(`idx_price_history_run`), and `audit_logs` carries the approval. "Which rate
change caused this price" is `prices.metal_rate_id → idx_prices_metal_rate`, which
02 §2.5 already describes as "what did this rate change touch".

### 3.4 What a customer with the item already in their cart experiences

Prices do move — after an approved run. This is exactly what happens, in order, and
none of it is left to a component:

1. **The cart line's numbers do not change under the customer.** `cart_items`
   holds `unit_list_minor`, `unit_final_minor`, `price_record_id` and `priced_at`
   as a **server-issued snapshot** (02 §1.6, §2.7). A recalc run writes `prices`
   and never touches `cart_items`. The header badge and the mini-cart continue to
   show the quoted figures.
2. **The cart page is honest on the next view.** `/cart` is `force-dynamic`,
   `no-store` (01 §1.3) and calls `resolvePriceBatch()` fresh. Any line whose
   resolved `unitFinalMinor` differs from its snapshot renders a
   `PriceMovedNotice`: the old amount struck through, the new amount beside it, and
   one plain sentence — *"The price of this piece changed on 12 September."* No
   reason is given to the shopper; the silver market is not their concern.
3. **The bag total shown is the new total.** A page that displays old line prices
   and a new total is worse than either. The snapshot columns are *the comparison
   baseline*, not the display source.
4. **Re-quoting is explicit, and "explicit" includes the customer who never opened
   the bag.** `repriceCart()` rewrites the snapshot columns and `priced_at` when
   (a) the customer clicks "Update bag", or (b) they enter checkout step 1. It
   returns `{ moved: { variantId, fromMinor, toMinor }[] }`, and **checkout step 1
   renders the same `PriceMovedNotice` and requires an explicit Continue when
   `moved` is non-empty.** Without that, the shopper who goes straight from a PDP
   to checkout has their bag silently re-quoted upward by the very call that was
   supposed to make the movement visible — the re-quote writes a fresh snapshot,
   so step 2's zero-tolerance comparison then passes and nothing ever tells them.
   Until Continue is pressed the movement stays visible, so the change is
   acknowledged rather than absorbed.
   `repriceCart` takes no cart id from the client: the cart is resolved from the
   hashed cart-token cookie or the customer session, exactly as §5.3 requires.
5. **Checkout stops, in both directions.** 01 §2.5 step 2 is zero-tolerance: any
   difference between snapshot and live resolve raises `PriceChangedError`, the
   customer is returned to the bag with the new figures, **no order row is written
   and no payment intent is created**. A price that *fell* stops checkout too —
   same codepath, different copy ("this piece is now less") — because two codepaths
   is how one of them ends up not checking.
6. **A reservation is not released by a price change.** Stock and price are
   independent concerns; `reservations.expires_at` runs on its own clock (01 §2.5).
7. **A price that disappears is not a price of zero.** If the recalc leaves a
   variant with no active price in that market (a skipped line whose old row was
   closed — a state the apply order makes impossible, and which the reconcile check
   below catches if it ever occurs), `resolvePriceBatch` returns
   `PriceUnavailableError` for that line and the cart renders it as unavailable
   with a Remove control, exactly as §6 specifies for a market switch.
8. **Orders already placed are untouched.** `order_items` snapshots every amount
   plus `price_record_id`, `metal_rate_minor_per_gram` and `metal_rate_scale`
   (02 §2.7), and an order renders only from those columns. A recalculation cannot
   reach backwards.
9. **No email is sent about a price change.** Mailing everyone with a piece in
   their bag that it just got more expensive is a revenue event disguised as a
   courtesy. Abandoned-cart mail is a separate, existing mechanism.

`tests/e2e/price-change-in-cart.spec.ts` walks 1–5 end to end: add to bag, apply an
approved recalc out of band, reload the cart, assert the notice and the new total,
attempt checkout, assert `PriceChangedError` and that `orders` is still empty.

---

## 4. Price history

`price_history` is defined verbatim in 02 §2.5. It answers "who changed it, from
what, to what, and under which run" — `prices` alone answers only "what was the
price on 3 March".

**Every field the audit question needs, mapped:**

| Question | Column |
| --- | --- |
| Who | `actor_user_id` + `actor_type` (`staff` \| `system` \| `cron`) |
| When | `created_at` (append-only; no `updated_at`, no trigger, 02 §1.3) |
| Which product | `product_id` |
| Which variant | `variant_id` (`NULL` = the product-level default row) |
| Which market | `market_code` + `currency_code` |
| From | `previous_list_minor`, `previous_sale_minor`, `previous_price_id` |
| To | `new_list_minor`, `new_sale_minor`, `price_id` |
| How much | `change_bp` — signed, `CHECK (change_bp BETWEEN -100000 AND 1000000)` |
| Why | `reason` (`price_change_reason`: `manual_edit`, `bulk_edit`, `csv_import`, `recalc_run`, `rule_activation`, `rule_expiry`, `seed`) + free-text `note` |
| Source of change | `recalc_run_id` when a run caused it; `reason` otherwise |

`change_bp` is computed once, at write time, as
`change_bp = ((new_list_minor − previous_list_minor) × 10000 + sign × previous/2) / previous_list_minor`
(half-up, signed), and is `NULL` when there is no previous row or it was zero —
"percentage change from nothing" is not a number, and rendering `∞%` in an audit
screen is how a real anomaly gets ignored.

**Writing it is not optional and not the caller's job.** Every function that
inserts a `prices` row writes its `price_history` row **in the same transaction**:
`setManualPrice`, `setFormulaBinding({ applyNow: true })`, the bulk-edit job, the
CSV import apply job, the recalc apply job, and the seed. There is no code path
that writes `prices` without it, and
`tests/integration/price-history-completeness.test.ts` asserts
`count(prices WHERE created_at > t0) = count(price_history WHERE created_at > t0)`
after exercising all six.

**Where it surfaces in the admin:**

| Surface | Route | Contents |
| --- | --- | --- |
| Global history | `/admin/pricing/history` | Keyset-paged table, filterable by market, product, actor, reason, run and date range; columns Date · Product · Variant · Market · From · To · Δ · Δ% · Reason · Who; CSV export via the `export` job (01 §2.7) |
| Product pricing tab | `/admin/catalog/products/[id]/pricing` → *History* | The same rows scoped to one product, **split by market into side-by-side columns** — so the two independent trails are visually independent, which is the point being made |
| Run detail | `/admin/pricing/recalc-runs/[id]` | Every history row with that `recalc_run_id` (`idx_price_history_run`), matched to its preview line |
| Order line | `/admin/orders/[id]` → line → *Price provenance* | Read-only: the snapshotted amounts, `price_record_id`, `price_source`, and the metal rate and scale actually used — read from `order_items`, never re-priced (01 §2.7) |
| Rate detail | `/admin/pricing/metal-rates/[id]` | "What did this rate change touch" — `prices` via `idx_prices_metal_rate`, joined to their history rows |

Permission `price.read` gates all of them; `cost_minor` and the margin columns are
additionally gated on `price.read_cost` so a merchandiser can audit prices without
seeing supplier cost. Both are checked in the service function that loads the rows,
not in the page — a column omitted only by the renderer is still in the JSON payload
the RSC stream carries, and "not rendered" is not "not disclosed" (hard rule 9).

**Two indexes the global screen needs and 02 does not have.** 02 §2.5 gives
`idx_price_history_product (product_id, created_at DESC)` and
`idx_price_history_run`. Neither serves `/admin/pricing/history`, whose default
state has **no product filter** and whose sort is `created_at DESC` — a keyset scan
with no usable leading column over a table that gains a row for every price change
in every market forever, which is the largest table in the pricing domain by year
two.

> **SCHEMA ADDITION (02 §2.5, `price_history`):**
> `CREATE INDEX idx_price_history_created ON price_history (created_at DESC, id DESC);`
> — the unfiltered default view and the keyset cursor `(created_at, id)`.
> `CREATE INDEX idx_price_history_market_created ON price_history (market_code, created_at DESC, id DESC);`
> — "everything that happened to India prices this quarter", which is the first
> question asked when one market's numbers look wrong.

**`rule_activation` and `rule_expiry` have no writer, deliberately.** 02 §1.9's
`price_change_reason` enum carries both, but §2.4 of this document is explicit that
a `pricing_rules` row never writes a `prices` row — a rule is a discount applied at
resolve time, and `price_history.price_id` is `NOT NULL`, so there is no row for a
rule activation to reference. The two values are therefore **reserved**, and the
mechanism that *does* need to happen at a rule's window boundary is a cache purge,
not a history row (§5.4). `tests/unit/price-change-reason-coverage.test.ts` asserts
that every other value of the enum has exactly one writing call site and that these
two have none — so the day someone adds a sale-materialising job, the test tells
them which value to use instead of leaving the question to a code review.

**The pricing editor does not autosave.** 01 §2.7 names autosave-clobbering as one
of the seven races and solves it with `version` + `dirtyFields`; that machinery is
right for product copy and wrong for money. A debounced 750ms save means a
merchandiser who types `2480` on the way to `24800` has published `$24.80` to the
storefront for the time it takes to type two more characters, and it means a price
change with no moment at which a human decided to make it. Every market column in
`/admin/catalog/products/[id]/pricing` is an explicit Save against its own
`expectedPriceId`, and navigating away with a dirty column prompts. The
`autosave` hook is lint-banned from `src/components/admin/pricing/**`.

**Concurrent first prices.** `setManualPrice({ expectedPriceId: null })` from two
tabs produces two `INSERT`s and one of them violates `idx_prices_active`. The
service catches Postgres `23505` on that index specifically and returns
`ConflictError` carrying the row that won — the same error, the same copy and the
same "here is the price that won" affordance as the supersede path. A raw unique
violation reaching the UI as a 500 is the same defect wearing a different status
code.

---

## 5. The market system

### 5.1 Markets are rows

`markets` and `currencies` are defined verbatim in 02 §2.1. `markets.code` is a row,
not a TypeScript union; `MarketCode` and `CurrencyCode` are branded strings
validated against `listActiveMarkets()` (01 §1.4). `generateStaticParams()` for the
`[market]` segment queries this table.

**Everything a market defines**, and where each thing lives:

| A market defines | Where | Mechanism |
| --- | --- | --- |
| Currency | `markets.currency_code` → `currencies` | Composite FK `(market_code, currency_code)` binds every amount in the system to its market (02 §2.1) |
| Locale and formatting | `markets.locale` | `formatMoney` reads it; `'en-US'` is never hardcoded (01 §2.6) |
| Timezone | `markets.timezone` | Report day boundaries, scheduled publishing |
| Pricing | `prices` rows scoped by `market_code` | §1, §2 — independent rows, no derivation |
| Pricing rules / sales | `pricing_rules.market_code` **NOT NULL** | "There is no market-agnostic money rule" (02 §2.5) |
| Formula terms | `pricing_formula_market_terms` | §2.2 |
| Product availability | `product_market_content.is_published` + the existence of a `prices` row | §6 |
| Category / collection availability | `category_market_content`, `collection_market_content` | Same shape (02 §1.7) |
| Merchandising copy and order | `product_market_content.title / subtitle / description_json / rank_override` — `NULL` inherits the base row | 02 §1.7 |
| Fulfilment sources | `market_locations` | `getAvailability(variantIds, marketCode)` (01 §2.3) |
| Shipping | `settings` rows scoped by `market_code`, `value_type='money'` | Thresholds and bands are per-currency by construction (02 §2.8) |
| Tax | `markets.tax_mode`, `markets.prices_include_tax` | §8 |
| Duties / incoterm | `markets.incoterm` (§8.4, schema addition) | §8 |
| Payment provider | `markets.payment_provider_key` | `getProviderForMarket()`; `NULL` blocks checkout and never falls back to another market's acquirer (01 §2.3) |
| Coupon applicability | `coupon_amounts (coupon_id, currency_code, amount_minor)` + `coupon_conditions` type `market` | No row for the currency ⇒ inapplicable, never converted (01 §2.6) |
| Gift cards | `gift_cards.currency_code` | A USD gift card does not spend in India |
| Content | `cms_blocks.market_code`, `cms_sections.market_code`, `navigation_items.market_code` — `NULL` = all markets | 02 §1.7 |
| Email | `email_templates.market_code` | 02 §1.7 |
| SEO | `seo_metadata` per entity + §5.4 hreflang/canonical | |
| URL | Path prefix, one domain | §5.2 |
| Activation | `markets.is_active`, `markets.rank` | An inactive market 404s; rank orders the switcher |

**Domain or subdomain: neither.** 01 §5.7 already rejects ccTLDs and market
subdomains — they split link equity across properties and multiply DNS, TLS,
analytics and deployment surface for one catalogue. **One apex domain,
path-prefixed markets**, US at the root, `/in` for India, `/uk` `/ca` `/au` `/ae`
reserved. If the client later acquires `millenniumdesigns.in` and wants it live, the
supported answer is a registrar-level 301 to the `/in` prefix, not a second
deployment — and that is a DNS change, not a code change.

### 5.2 How a visitor's market is resolved

Restating 01 §1.4 only where this section adds a rule:

1. `middleware.ts` reads the first path segment. If it is not the lowercase code of
   an active market, it **rewrites** to the primary market's prefix — so the
   primary market's canonical URL carries no prefix.
2. An explicit `/<primary>/*` **301-redirects** to `/*`. One canonical URL per
   market page.
3. Inside the app tree the market is the `[market]` segment and nothing else.
   `resolveMarket(marketSegment: string): Promise<Market>` has no cookie parameter
   *by construction* (01 §1.4), and `NotFoundError` for an unknown or inactive code
   means a bad URL 404s rather than quietly rendering US prices under an Indian
   path.
4. **Market is never chosen by IP.** Geo may render a dismissible banner; a crawler
   always gets the market its URL asked for. Geo-redirect is cloaking.
5. `customers.default_market_code` is a **hint for the banner only** and is
   explicitly never used to resolve the market of a rendered page (02 §2.3).

**Where middleware gets the market list, since it may not read the database.**
Steps 1 and 2 both require the set of active market codes and which one is
primary, and 01 §2.2 forbids Prisma in the Edge runtime. Hardcoding `['us','in']`
and `'us'` is the alternative that would actually ship, and it breaks hard rule 1
twice over: markets stop being rows, and activating Canada becomes a code change
and a deploy — exactly the rebuild 00 §1 says must not be needed.

**The mechanism is a build-time generated file, and nothing else** (`01 §1.4`).

> **DECISION CHANGED:** this section previously specified **two** sources — a
> public `GET /api/internal/market-snapshot`, `unstable_cache`d under the
> `market:*` and `settings` tags and fetched by middleware behind a 60-second
> module cache with a fail-open background refetch, **plus**
> `src/generated/market-snapshot.json` as the cold-isolate fallback. `01 §1.4`
> settles it: **the generated file is the only source and the route is not
> built.** Two sources of market truth on the edge is the defect, not either one
> of them, and once the fallback is acceptable as the cold-isolate answer it is
> the answer. Three things go with the route: a public unauthenticated endpoint
> that enumerated every market row **including inactive ones** (a disclosure of
> unlaunched markets to anyone who asks), a network fetch on the edge hot path,
> and a module-scope mutable cache with a fail-open branch. `01 §2.2`'s lint
> boundary — `src/lib/edge/**` contains no `fetch(` — makes re-adding it a CI
> failure, and `11 §10.9` no longer asks `08 §2.2` for a manifest row it does not
> need.

- `src/generated/market-snapshot.json` is written by
  `scripts/gen-market-snapshot.ts`, run inside the build command, by the same
  query `generateStaticParams()` already makes against `markets` (01 §1.4).
  `src/lib/edge/markets.ts` **statically imports** it and exports
  `MARKETS: readonly EdgeMarket[]` and `PRIMARY_SEGMENT: string`. It is a real
  list read out of the database, never a hand-written one, and CI fails if the
  file is edited by hand (checksum in `tests/unit/market-snapshot.test.ts`,
  which also asserts `src/lib/edge/**` contains no `fetch(`).
- **What it costs:** activating a market takes effect at the next deployment
  rather than within 60 seconds. That is acceptable because activation is not a
  switch — it needs a `prices` row per variant, a payment-provider credential (an
  environment change, which is a redeploy on Vercel regardless), shipping zones
  and a tax registration. `/admin/settings/markets` says so in the UI and offers a
  **Deploy now** button when `VERCEL_DEPLOY_HOOK_URL` is set.
- **Deactivation is not affected.** `resolveMarket()` reads the database and
  throws `NotFoundError` for an inactive code (§5.1, 01 §2.3), so `/in/rings`
  404s the moment the row flips, whether or not middleware still recognises `in`
  as a segment. The emergency direction — turn a market off now — needs no
  deploy.
- **"Primary" is `markets.rank` ascending among active markets**, not the literal
  `'US'`. This is the column §5.1 already defines for the switcher, and it means
  the day the client makes India primary, or launches a market ahead of the US,
  the root-path market follows a row. A hardcoded `/us` here would also contradict
  §1.4 step 0, which refuses to fall back to any configured default market when
  resolving a price — two different modules disagreeing about whether a default
  market exists is how one of them gets it wrong.

> **NEEDS INPUT:** confirmation that **US is and remains the root-path market**.
> The architecture supports moving it (one `markets.rank` change plus a redirect
> map), but the move retires `/`-rooted US URLs in favour of `/us/…` and needs a
> 301 plan, so it is a decision to take before launch rather than after indexing.

### 5.3 How a visitor changes market, and how it persists

```ts
// src/server/actions/market.ts
'use server';
export async function switchMarket(input: {
  toMarketCode: string;
  currentPath: string;        // path only; validated to start with '/' and to contain no '//' or scheme
}): Promise<never>;           // always ends in redirect()
```

**There is no `cartId` parameter, and that is the point.** An earlier shape took
one from the client. A cart id is an identifier, not a capability (01 §2.5 makes
the same argument about order ids), and `switchMarket` **deletes every line in the
cart it is given** (§6.3 step 4). A `cartId` parameter is therefore an unauthenticated
server action that empties any cart whose id an attacker can guess or observe — a
support-ticket generator at best and a checkout-denial attack at worst, and it
would never look like a security bug in review because the function is "just the
currency switcher". The cart is resolved server-side from the hashed cart-token
cookie (`carts.token_hash`, 02 §2.7) or the signed-in customer's active cart, and
if neither resolves there is no cart to migrate. The same rule applies to
`repriceCart()` (§3.4) and to every cart mutation.

1. Validate `toMarketCode` against `listActiveMarkets()`.
2. Set the `md_market` cookie: `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`,
   `Max-Age=31536000`. **HttpOnly is deliberate** — only middleware (to decide
   whether to show the banner) and this action (to turn it into a redirect) ever
   read it, so no client script needs it, and a cookie no script can read is a
   cookie no component can be tempted to price from.
3. If a cart exists and holds lines, run the §6.3 cart-switch procedure **before**
   redirecting, so the destination page renders the already-reconciled bag.
4. `redirect()` to the equivalent path in the new market: the same product slug
   under the new prefix when the product is available there (slugs are not
   market-scoped, 02 §1.5), otherwise the equivalent category, otherwise the new
   market's home. Redirecting a shopper to a 404 because their piece is
   US-only is a worse outcome than landing them one level up.
5. Write an `analytics_events` row `market_switch` with `from`/`to` — first-party,
   server-recorded (01 §1.1).

**The cookie never selects the market for a rendered page.** This is repeated here
because it is the single most expensive thing to get wrong: `/products/emerald-ring`
is ISR-cached for 900s, so a cookie-driven resolution would bake ₹ prices into the
CDN object served to every US visitor for the next fifteen minutes (01 §1.4).

### 5.4 Caching and SEO across markets

**Caching.** Every cached data function's key includes the market code, and every
tagged entry carries `market:{code}` alongside its entity tag (01 §2.4). Three
consequences this section depends on:

- A cached US price is unreachable from an India request — different key, different
  tag, different ISR path.
- `getDisplayPrice()` and `getProductPriceRanges()` are the only pricing functions
  that may be cached, and they are cached *by their caller* in `src/lib/catalog/`,
  because neither takes a `customerId` or a `couponCode` (01 §2.4). `resolvePrice`
  and `resolvePriceBatch` are behind the ban.
- Activating or deactivating a market purges `market:{code}` and `nav:{market}`,
  and repoints the middleware market snapshot (§5.2).

**A `pricing_rules` window is a price change that writes no row, so it must still
purge.** Both display functions include market-scoped rules (§1.3), and a rule
becomes live or dies purely by the clock — `starts_at <= now() < ends_at`. Nothing
is written at that instant, so nothing triggers an invalidation, and a sale
scheduled for midnight appears whenever the cached entry happens to expire: on the
PLP at one time, on the PDP at another, and in the bag immediately, because
`resolvePrice` is uncached. The same is true in reverse when a sale ends, which is
the expensive direction.

Two mechanisms, both required:

1. **`/api/cron/pricing-rule-windows`, every 5 minutes** — row 2 of the ten-entry
   cron registry in **11 §5.1**, which is the `vercel.json` an engineer copies.
   (An earlier revision cited `01 §5.6`, whose table has nine rows and omits this
   one; 11 §5 is the reconciliation and `tests/unit/cron-registry.test.ts` fails
   on any handler directory, `vercel.json` path or `CRON_JOBS` key that the other
   two do not carry.) It selects
   `pricing_rules` where `starts_at` or `ends_at` falls in the window since its
   last run and purges `market:{code}` for each affected market plus
   `product:{id}` for the products a `product`-scoped rule names. It is idempotent
   and cheap: the table has tens of rows.
2. **Every cached display entry carries a finite `revalidate`**, capped at
   **300 seconds** in a market with any time-windowed rule live or scheduled in
   the next 24 hours. 01 §2.4 already forbids `revalidate: false`; this is the
   specific bound, and it is the backstop for the five minutes the cron might miss
   and for the purge that fails after commit.

`tests/e2e/scheduled-sale-boundary.spec.ts` schedules a rule to start in 60
seconds, asserts the PLP card, the PDP and the bag all still show the old figure,
waits past the boundary and the cron, and asserts all three show the new one —
**the same integer in all three places**, which is the assertion that matters.

**Canonical.** Every market page is **self-canonical**: `/in/products/x` canonicals
to `/in/products/x`, not to the US URL. Cross-market canonicalisation would ask
Google to drop the India page entirely, which is the opposite of the intent. The
existing rules still hold: a filtered listing (`?stone=…`) is `noindex,follow` and
canonicals to the unfiltered URL; `/search` is `noindex` (01 §1.3).

**hreflang.** `src/lib/seo/hreflang.ts` emits, on every market-aware page:

```html
<link rel="alternate" hreflang="en-US" href="https://{domain}/products/larimar-drop-pendant" />
<link rel="alternate" hreflang="en-IN" href="https://{domain}/in/products/larimar-drop-pendant" />
<link rel="alternate" hreflang="x-default" href="https://{domain}/products/larimar-drop-pendant" />
```

with four rules that are the difference between hreflang helping and hurting:

1. **Alternates are emitted only for markets where the page actually exists and is
   available.** A product unpublished in India (`product_market_content.is_published
   = false`) or unpriced in India (no live `prices` row) emits **no** `en-IN`
   alternate. Pointing an alternate at a 404 or at an unbuyable page is a
   self-inflicted crawl error.
2. **Alternates are reciprocal.** Because both markets' pages are generated from
   the same `listActiveMarkets()` × availability query, the India page's alternate
   set contains the US page and vice versa. A one-way alternate is ignored.
3. **`x-default` → US**, the primary market (01 §1.4).
4. **`hreflang` is language-region, built from `markets.locale`** — so it is
   `en-US` and `en-IN` today, and adding Hindi later (02 §1.7's expand path)
   changes the locale column rather than this module.

Sitemaps shard per market: `/sitemaps/{market}-{n}.xml` under the
`/sitemaps/[shard]` route (01 §3), each listing only the URLs available in that
market — the same availability predicate as §6, so an unpriced India product is
absent from the India sitemap rather than submitted and then found unbuyable.

JSON-LD `Product` → `offers` emits `priceCurrency` from the market's currency and
`price` from `getDisplayPrice()`, and **omits the `offers` node entirely** when
`PriceUnavailableError` — an offer with no price is structured-data spam.

---

## 6. Market-specific availability

### 6.1 The predicate, defined once

A product is **available in a market** when all four hold:

```
products.deleted_at IS NULL
  AND products.status = 'active' AND products.published_at <= now()
  AND coalesce(product_market_content.is_published, true)            -- per-market visibility
  AND EXISTS (live prices row for (product_id, market_code))          -- purchasable
```

A *variant* is available when additionally `product_variants.deleted_at IS NULL AND
is_active` and `resolvePrice` reaches step 1 or 2 for it.

Two deliberate asymmetries, both from 02:

- `product_market_content.is_published` **defaults to `true`**, read as
  `coalesce(pmc.is_published, true)` — a blanket opt-in is the right default for a
  40-year catalogue being loaded market by market; per-market hiding is an
  override.
- The price `EXISTS` is **not** optional. Without it, on day one when only USD
  prices exist, `/in/rings` is a wall of indexable, unbuyable product (02 §4.1).

The predicate lives in **one** place: `src/lib/catalog/availability.ts`, exported as
a `Prisma.sql` fragment `marketAvailabilityPredicate(marketCode)` and as a
TypeScript guard `isAvailableInMarket(product, marketCode)`. Every surface below
composes that fragment; none rewrites the SQL.

An admin who wants a piece **visible but unbuyable** in a market has an explicit
mechanism and must use it: `product_market_content.unavailable_reason`, rendered
instead of the add-to-bag control.

### 6.2 Enforcement across every surface

| Surface | Enforcement | Failure mode it prevents |
| --- | --- | --- |
| **PLP / category / collection** | `marketAvailabilityPredicate` in the `WHERE`, served by `idx_pmc_market_published` and `idx_prices_live_product` (02 §4.1) | Unbuyable, indexable cards |
| **Curated facet pages** | Same predicate; a facet page whose product set is empty in a market returns `notFound()` rather than an empty indexable page | Thin-content penalties |
| **Product detail** | `resolveMarket` → availability guard. Unpublished-in-market ⇒ `notFound()` (a real 404, not a soft one). Published but unpriced ⇒ 200 with the *unavailable state*: gallery, description and stone story render; price, add-to-bag and stock band are replaced by `unavailable_reason` or the default "Not available in India" | A ₹0 price; an add-to-bag that 500s at checkout |
| **Search** | `PostgresSearchProvider.searchProducts()` takes `marketCode` as a required parameter and ANDs the same predicate into the `tsvector` query. Search respecting market is exactly why search is in SQL and not a second datastore (01 §1.1) | India search returning US-only pieces |
| **Typeahead / facet counts** (`/api/catalog/typeahead`, `/facets`) | Same predicate; `marketCode` is a required query parameter, Zod-validated against `listActiveMarkets()` — not optional with a default | A facet count that promises 42 results and a PLP that shows 11 |
| **Wishlist** | Items are stored market-agnostically (a saved piece is a saved piece). Rendering in a market where it is unavailable shows the item greyed with "Not available in India" and no price — never a price from the other market | An INR shopper seeing a `$` figure in their own account |
| **Cart — add** | `addToCart()` calls `resolvePrice(variantId, cart.market_code)`. `PriceUnavailableError` ⇒ the line is refused with a named error; no row is written | A cart line with no price |
| **Cart — render** | `resolvePriceBatch()` per render; an unavailable line renders as unavailable with a Remove control and is **excluded from the bag total** | A total that includes a line that cannot be bought |
| **Checkout** | 01 §2.5 step 1 cross-checks `carts.market_code` against the posting URL's `[market]` segment; step 2 re-resolves every line. Any `PriceUnavailableError` blocks the order before step 3 reserves anything | An order created for an unfulfillable market |
| **Sitemap / hreflang / JSON-LD** | §5.4 | Crawl errors and structured-data spam |

**"Not priced in this market" is not an `AvailabilityBand` value, and the two must
not be collapsed.** `AvailabilityBand` is five values —
`'in_stock' | 'low' | 'out' | 'made_to_order' | 'sold'` (**11 §7.1**, the canonical
declaration; `03 §8.1` commissioned the fifth) — and every one of them describes
*stock*. Unpriced is a **pricing** state, raised as `PriceUnavailableError` by
§1.4 step 3, and it suppresses the band entirely rather than becoming a sixth
value: the PDP renders the unavailable state with no band and no add-to-bag, and
the PLP card is not rendered at all because the price `EXISTS` in §6.1 already
excluded it. The two interact in exactly one direction and it is worth pinning
down, because it is the case a reviewer reaches for: a **`sold`** one-of-a-kind
piece still has a live `prices` row and still resolves, which is why its PDP can
show a struck price beside the SOLD plate; `getAvailability()` keys `'sold'` on
`products.sold_at`, never on `available_quantity <= 0` (`03 §2.5`), so a piece
inside another shopper's live reservation reads `'out'` and keeps its price. A
band is never inferred from a price, and a price is never inferred from a band.

### 6.3 Switching market with a now-unavailable item in the bag

The database refuses the naive implementation. `cart_items` declares
`(cart_id, market_code) REFERENCES carts (id, market_code) ON DELETE CASCADE **ON
UPDATE RESTRICT**` and `(price_record_id, market_code) REFERENCES prices (id,
market_code)` (02 §2.7). So `UPDATE carts SET market_code='IN'` **fails** while any
line exists — which is deliberate: the one-line update would leave a $1,450 ring's
`unit_final_minor = 145000` rendering as ₹1,450.00, an implicit FX conversion at a
rate of 1.

`switchMarket()` therefore has exactly one legal implementation, and it runs in one
transaction with `FOR UPDATE` on the cart row:

1. Read every line's `variant_id`, `quantity` and `personalisation`.
2. `resolvePriceBatch()` those variants **in the destination market**, and evaluate
   §6.1 availability for each.
3. **Release any cart-scoped reservation first.** `reservations` carries
   `ref_kind = 'cart'` as a legal value (02 §1.9), so a one-of-a-kind piece held
   for this bag has a live `reservations` row keyed to it. Step 4 deletes the
   `cart_items` rows; the reservation rows are keyed on the **cart**, not the line,
   so they survive the delete and are then held by a bag that no longer contains
   them — a one-of-a-kind piece removed from sale for thirty minutes by a customer
   who just switched currency, with no line anywhere to explain why. The
   transaction calls **`releaseStock(tx, reservationId, 'cart_changed')`**
   (`01 §2.3`, three arguments — the reason is required and has no default) for
   every active cart-scoped reservation on this cart before the delete, and
   re-takes reservations for the surviving lines after step 6. The reason is
   `'cart_changed'` and not `'expired'`: nothing expired, the customer changed
   market, and `reservations.release_reason` is the only column that can answer
   "why did this piece come back on sale?" after the fact (`02 §2.6`, `05 §1.6`). Availability is evaluated
   against the **destination** market's `market_locations`, so a piece held only in
   Mumbai is correctly unreservable for a US bag.
4. `DELETE FROM cart_items WHERE cart_id = :id` — every line, unconditionally.
5. `UPDATE carts SET market_code = :to, currency_code = :toCurrency, coupon_code =
   NULL` — the `ON UPDATE RESTRICT` is now satisfied because no line references the
   old pairing. The coupon is dropped rather than re-validated silently: a
   fixed-amount coupon with no `coupon_amounts` row in the new currency is
   inapplicable, and re-applying it "if it happens to fit" is how a ₹500 coupon
   becomes $500 off (01 §2.6).
6. Re-insert only the lines that resolved, with fresh `unit_list_minor`,
   `unit_final_minor`, `price_record_id` and `priced_at`.
7. Return `{ moved: CartLine[], dropped: { variantId, productTitle, reason }[],
   couponDropped: boolean }`.

**What the customer sees.** The destination cart page renders first, above the bag:

> **2 pieces aren't available in India**
> *Larimar Drop Pendant* — not available in this market
> *Moonstone Stacking Ring, size 7* — not available in this market
> They've been removed from your bag and saved to your wishlist. Your discount code
> `HERITAGE10` doesn't apply in India and has been removed.

Dropped lines are pushed to the customer's default wishlist when they are signed in
(`wishlist_items` is market-agnostic), and held in a `sessionStorage` list for
guests so switching back restores the intent. Silently vanishing lines generate
support tickets; a named, reversible removal does not.

`tests/integration/market-switch-cart.spec.ts` asserts: the `UPDATE` fails while
lines exist, the full procedure succeeds, no `cart_items` row ever holds a
`price_record_id` from another market, the dropped set matches the availability
predicate exactly, and **no `reservations` row survives with `ref_kind='cart'` for
a variant that is no longer in the bag**.

---

## 7. Market preview for admins

### 7.1 What does not need machinery

"View as India" for **published** content is already free: `/in/rings` is the real
India storefront and anyone can open it. The admin header therefore carries a market
switcher whose only job is to open the corresponding public URL in a new tab. That
covers the everyday case, and it has the property that no preview mechanism can
match — the admin is looking at *exactly* the bytes a customer gets, including the
CDN object.

What needs machinery is the rest: an **inactive** market (`is_active = false`, which
404s for everyone), a product in `draft` status, and per-market content that is not
yet published.

### 7.2 The mechanism

**The fork.** A cookie or a `draftMode()` flag read inside the storefront tree is
the obvious implementation and it is disqualified twice over: 01 §1.3 bans
`cookies()` and `draftMode()` in any component reachable from an ISR route, and a
`searchParams` read on the PDP would opt that page out of static rendering for
*every* visitor, not just the admin. A per-request header is invisible to Next's
cache key and would poison the shared CDN object.

**Decision: one database-backed, revocable grant, rendered by a parallel,
always-dynamic route group.** No cookie, no `draftMode()`, no `searchParams` read
in the public tree, and the preview render is a different route — so there is no
cache entry it could contaminate. The grant is a `content_preview_tokens` row
with `scope = 'market'` (`06 §4.4`).

> **DECISION CHANGED, and an engineer who already implemented this section needs
> to know exactly what moved.** This section used to specify a *second* preview
> system: a `jose`-signed JWT with `aud: 'market-preview'` and a
> `MARKET_PREVIEW_TOKEN_TTL_MINUTES` lifetime (an env var `01 §4` never defined),
> carried as a `?__mdpreview=` query parameter, verified in a middleware branch,
> and authorised in the page by `requirePreviewSession()`. **All five are
> deleted:** the JWT audience, the TTL variable, the `__mdpreview` middleware
> branch, `requirePreviewSession()`, and the forwarded `x-md-preview-user` /
> `x-md-preview-session` headers. Two preview systems was one too many, and
> neither solved the case the client hits in week one — an unpublished CMS page
> in the not-yet-active India market — because one granted an entity and the
> other granted a market and nothing granted both. **What survives unchanged is
> the part that was right:** the `(preview)` route group, the `force-dynamic` +
> `no-store` isolation, and step 6's `previewContext` contract, all reproduced
> below.

1. `/admin/tools/market-preview` (permission `market.preview`) calls
   `createPreviewToken({ scope: 'market', marketCode, ttlHours: 4 })`
   (`06 §4.4` — the only preview-grant API in the system). It writes one
   `content_preview_tokens` row holding `sha256(32 random bytes)`, returns the
   plaintext token **once**, and redirects to
   `/_preview/in/<token>/products/larimar-drop-pendant`.
2. **The token is a path segment, not a query parameter, and that is what removes
   the middleware branch.** Nothing verifies a signature at the edge. Middleware's
   only job on `/_preview/**` is to set `Cache-Control: private, no-store,
   max-age=0, must-revalidate` and `X-Robots-Tag: noindex, nofollow, noarchive`
   — the pair §7.3 already specifies. There is no rewrite, no forwarded header and
   no token parsing on the edge.
3. Every `(preview)` page declares `export const dynamic = 'force-dynamic'`,
   `export const revalidate = 0`, and calls **`resolvePreviewToken(token, market)`
   as its first statement**. That is a database read, so it cannot live in
   middleware — which is precisely what made the old design need a JWT. It returns
   a `PreviewGrant` or a `PreviewTokenError`; a `scope: 'market'` grant whose
   `market_code` is not the `[market]` segment is an error, not a render. **This is
   the authorization** (01 §2.1, hard rule 9), and it is stronger than the JWT it
   replaces: a row is revocable, capped by `max_views`, and killable in bulk; a JWT
   is not revocable at all.
4. A failed resolution renders **404**, not an error page naming the mechanism.
   An expired or revoked link is indistinguishable from a URL that never existed.
5. The `(preview)` tree is **nine thin files** — home, PDP, category, curated
   facet, collection, stone page, journal post, **CMS page** and the `layout.tsx`
   frame — under `src/app/(preview)/_preview/[market]/[token]/…`, each importing
   the same components as the public tree and passing the grant's
   `previewContext`. The ninth file is the CMS page preview that `06 §4.4`
   contributes; it is the file that document's old `/[market]/preview/[token]/[[...path]]`
   catch-all route becomes. No page logic is duplicated: Next's file router
   already dispatches these shapes and a hand-rolled `[[...path]]` router would
   have to re-implement that dispatch in preview only and keep it in step with the
   public tree forever.
6. Service functions accept an optional `previewContext` and relax **only**
   publication predicates: `products.status`, `published_at`,
   `product_market_content.is_published`, `markets.is_active`, `cms_pages.status`.
   They never relax pricing. **A variant with no price in the previewed market
   renders as unavailable in preview too**, because that is the truth an admin
   needs to see before launching the market — a preview that invents a price is a
   preview that hides the one problem it was opened to find. A `scope: 'market'`
   grant produces `{ includeUnpublished: true, includeInactiveMarkets: true }`;
   `scope: 'entity'` produces `includeInactiveMarkets: false`, which is the whole
   reason the two scopes are one discriminated union rather than two systems.

**Rate limiting.** `resolvePreviewToken()` consumes `preview-token:ip:<ip64>` at
**60 / 1 hour, fail-closed** (`11 §4.2`). The key prefix is unchanged by the
unification; only the endpoint it guards moved, to `/_preview/[market]/[token]/**`.

### 7.3 How it is kept out of customer traffic and out of caches

| Risk | Control |
| --- | --- |
| A preview render is cached and served to a customer | It is a different route (`/_preview/**`), `force-dynamic`, `no-store`. The public route's cache entry is never written by a preview request |
| A token leaks via a shared link | 15-minute expiry; bound to `sub` **and** `sid`, so it dies with the admin's session; re-verified against a live `sessions` row on every request |
| A preview URL is indexed | `X-Robots-Tag: noindex, nofollow, noarchive` from middleware, `<meta name="robots" content="noindex,nofollow">` from the page, `Disallow: /_preview/` in `robots.txt`, and `/_preview/**` excluded from every sitemap shard |
| A preview URL leaks into analytics or Sentry as a real pageview | `analytics_events` writes are suppressed under `previewContext`; Sentry tags the event `preview: true` |
| A preview mutates something | The `(preview)` tree imports **read-only** service functions (`get*`, `list*`, `resolve*`) only, enforced by the `eslint-plugin-boundaries` element type already defined for `app` (01 §2.2). Server actions are not reachable from it |
| Referrer leakage of the token to a third party | `Referrer-Policy: strict-origin-when-cross-origin` (01 §5.8) strips the query string cross-origin |
| It quietly becomes a way to sell in an inactive market | `getProviderForMarket()` is unchanged; an inactive market has no live checkout, and the preview cart/checkout routes are not in the eight-file tree at all |

`tests/e2e/market-preview.spec.ts`: open a preview URL as an admin, assert
`x-vercel-cache` is never `HIT` and the response carries `no-store` + `noindex`;
then request the **public** URL as an anonymous visitor and assert its body contains
none of the draft content and that its cache object was not replaced.

---

## 8. Taxes and duties

### 8.1 The abstraction

Tax is a **layer with one entry point**, not a concern sprinkled through product,
cart and order code. Nothing outside `src/lib/tax/` computes, rounds, adds,
extracts or displays a tax amount, and the same `no-restricted-imports` gate that
protects pricing protects it.

```ts
// src/lib/tax/index.ts
// THE entry point every caller uses. `computeTax(...)` (05 §3.6) is a rejected
// spelling of this function (11 §2.2); `TaxProvider.quote` is the interface it
// dispatches to and is not called directly from outside src/lib/tax/.
export async function quoteTax(
  input: TaxQuoteInput,
): Promise<Result<TaxQuote, TaxUnavailableError | TaxUnconfiguredError>>;

export interface TaxProvider {
  readonly key: string;                                  // 'stripe_tax' | 'rules_table' | 'none'
  quote(input: TaxQuoteInput): Promise<Result<TaxQuote, TaxUnavailableError | TaxUnconfiguredError>>;
}

export type TaxQuoteInput = {
  marketCode: MarketCode;
  currencyCode: CurrencyCode;
  lines: { lineId: string; variantId: string; taxCode: string | null; amountMinor: bigint }[];
  shippingMinor: bigint;
  destination: { countryCode: string; regionCode: string | null; postalCode: string | null };
  customerTaxId: string | null;                          // buyer GSTIN, US resale certificate
  at: Date;
};

export type TaxQuote = {
  provider: string;                                      // → orders.tax_provider
  pricesIncludeTax: boolean;                             // from markets.prices_include_tax
  taxTotalMinor: bigint;                                 // → orders.tax_total_minor
  lines: { lineId: string; taxMinor: bigint; rateBp: number; taxCode: string }[];
  shippingTaxMinor: bigint;
  jurisdictions: { name: string; rateBp: number; amountMinor: bigint }[];  // → orders.tax_breakdown
};

export function getTaxProviderForMarket(marketCode: MarketCode): TaxProvider;
```

`markets.tax_mode` (enum `tax_mode`: `provider_stripe_tax | rules_table | none`,
02 §1.9) selects the implementation. `none` returns zeros and is legal only when the `settings` row
`('tax.allow_zero_tax_market', <market_code>)` is `true` — the PK is
`(key, market_code) NULLS NOT DISTINCT` (02 §2.8), so this is a per-market row and
never a global one; a global "zero tax is fine" flag would switch off tax in the
US the day it was set for a market that genuinely has none. Otherwise
`getTaxProviderForMarket` returns a provider that fails closed, because a market
silently charging no tax is a liability discovered at audit, not a bug anyone
reports.

**The two tax errors are not one error, and 11 §2.2 keeps them apart.**
`TaxUnavailableError` / `TAX_UNAVAILABLE` (422) is *"the provider was reached and
cannot quote this destination"* — a bad postcode, an unsupported region. **`TaxUnconfiguredError`
/ `TAX_UNCONFIGURED` (503)** is *"there is no tax configuration at all"*: zero
Stripe Tax registrations, or `tax_mode = 'none'` without that market's
`settings['tax.allow_zero_tax_market']` row. `quoteTax` with zero registered
jurisdictions returns the second, which is what makes `09 P22(e)`'s launch blocker
satisfiable as written — the failure mode it guards against is the one where
nothing errors, the checkout succeeds, and the liability accrues silently.

Three implementations at launch:
`StripeTaxProvider` (US, 01 §4.4 — destination-based US sales tax across ~11,000
jurisdictions is not a table we maintain), `RulesTableProvider` (India — GST is a
small, stable, statutory rate set), `NoTaxProvider`.

**Where the quote is used, and only there.** `src/lib/checkout/` calls `quote()`
once, after the address is known and **before** the order transaction opens — the
`order_counters` lock permits no network call while held (02 §2.7). The result is
snapshotted onto `orders.tax_total_minor`, `orders.tax_provider`,
`orders.tax_breakdown`, and allocated to `order_items.line_tax_minor` by
`allocate()` over `line_subtotal_minor − line_discount_minor` (02 §1.10 rule 4 —
tax is allocated, never recomputed per line), with `tax_rate_bp` and `tax_code`
snapshotted per line. A later rate change cannot move a historical order.

### 8.2 Tax codes

> **SCHEMA ADDITION:** three nullable `TEXT` columns, resolved most-specific-first.

| Column | Table | Note |
| --- | --- | --- |
| `tax_code` | `product_variants` | Most specific. Loose stones, bullion and finished jewellery are taxed differently in several US states (01 §4.4) |
| `tax_code` | `products` | |
| `tax_code` | `categories` | The practical level — "RINGS" carries one code |

Resolution: `variant.tax_code ?? product.tax_code ?? category.tax_code ??
settings['tax.default_code'][market]`. A `NULL` at every level with no default is a
**checkout block** with a named admin error, not an implicit "taxable at the general
rate". `order_items.tax_code` already exists (02 §2.7) and snapshots whatever was
resolved.

### 8.3 `tax_rules` — the India path

02 §1.9 defines `tax_mode = 'rules_table'` but no table backs it.

> **SCHEMA ADDITION:** `tax_rules`, in `prisma/schema/pricing.prisma`.

| Column | Type | Null | Notes |
| --- | --- | --- | --- |
| `id` | `UUID` | N | **PK** |
| `market_code` | `CHAR(2)` | N | FK pair below |
| `currency_code` | `CHAR(3)` | N | |
| `country_code` | `CHAR(2)` | N | |
| `region_code` | `TEXT` | Y | State/province; `NULL` = whole country |
| `tax_code` | `TEXT` | N | Matches the resolved code from §8.2; `*` matches any |
| `name` | `TEXT` | N | Printed on the invoice: `GST 3%`, `IGST 3%` |
| `rate_bp` | `INTEGER` | N | `CHECK (rate_bp BETWEEN 0 AND 10000)` |
| `is_compound` | `BOOLEAN` | N | default `false` — applied on top of preceding rules rather than on the net |
| `applies_to_shipping` | `BOOLEAN` | N | default `true` |
| `priority` | `SMALLINT` | N | Evaluation order |
| `starts_at` / `ends_at` | `TIMESTAMPTZ` | Y | A statutory change is a new row with a start date, never an edit |
| `is_active` | `BOOLEAN` | N | |
| `version` | `INTEGER` | N | |
| `created_at` / `updated_at` | `TIMESTAMPTZ` | N | |

- **FK (composite)** `(market_code, currency_code) → markets (code, currency_code)` [RESTRICT].
- **Index** `idx_tax_rules_lookup ON tax_rules (market_code, country_code, tax_code, priority) WHERE is_active`.
- **CHECK** `chk_tax_rules_window: ends_at IS NULL OR ends_at > starts_at`.
- Rows are **never edited to change a rate** — a rate change closes the old row with
  `ends_at` and inserts a new one, so reprinting a two-year-old invoice from
  `orders.tax_breakdown` and re-deriving it from the rules agree.

### 8.4 Duties

At launch each market ships **domestically from its own `market_locations`** (US
market from US locations, India from Indian ones), so no shipment crosses a border
and no duty arises. That is a fact of the fulfilment model, not an omission, and it
is worth recording so nobody builds a duty engine that never fires.

The seam for when it changes:

> **SCHEMA ADDITION:** `markets.incoterm TEXT NOT NULL DEFAULT 'DAP'`,
> `CHECK (incoterm IN ('DDP','DAP'))`. `DAP` (delivered-at-place) = the customer
> pays duties on import and the checkout says so; `DDP` = we collect duties at
> checkout and remit them.

```ts
// src/lib/tax/landed.ts
export interface LandedCostProvider {
  readonly key: string;
  quoteDuties(input: {
    marketCode: MarketCode; currencyCode: CurrencyCode;
    destination: TaxAddress;
    lines: { lineId: string; hsCode: string | null; countryOfOrigin: string | null; amountMinor: bigint }[];
  }): Promise<Result<{ dutyTotalMinor: bigint; lines: { lineId: string; dutyMinor: bigint }[] }, DutyUnavailableError>>;
}
```

`product_variants.hs_code` and `country_of_origin` already exist for exactly this
(02 §2.4). Under `DAP`, `quoteDuties` is not called and checkout renders a plain
notice that import duties and taxes may be payable on delivery. Under `DDP` the
result becomes an order-level amount alongside tax, and
`orders.duty_total_minor BIGINT NOT NULL DEFAULT 0` joins the `chk_orders_total`
identity — a change to one `CHECK` and one column, which is why it is named here
rather than discovered later.

### 8.5 Tax-inclusive versus tax-exclusive display, per market

`markets.prices_include_tax BOOLEAN` (02 §2.1) is the only switch. It decides four
things and nothing else decides them:

| What | `prices_include_tax = false` (US) | `prices_include_tax = true` |
| --- | --- | --- |
| What `prices.list_minor` means | The **net** price. Tax is added at checkout | The **gross** price. Tax is already inside it |
| PDP / PLP display | The net figure, with "Tax calculated at checkout" | The gross figure, with "Inclusive of GST" |
| Cart subtotal | Net; tax appears as its own line after the address is known | Gross line amounts; the tax line shows the **extracted** portion, and the total does not change when the address is entered |
| Order arithmetic | `tax_total_minor` is **added** | `tax_total_minor` is **extracted** |

**The arithmetic trap, and how it is resolved.** 02 §2.7 enforces
`chk_orders_total: total_minor = subtotal_minor − discount_total_minor +
shipping_total_minor + tax_total_minor − gift_card_total_minor`. For an inclusive
market the naive reading breaks that identity. The rule:

> In a tax-inclusive market, `orders.subtotal_minor` and
> `order_items.line_subtotal_minor` store the **net (ex-tax)** amount, and
> `tax_total_minor` stores the extracted tax. The identity holds unchanged, and the
> displayed price equals `net + tax` by construction.

**Which number the pricing service returns, stated before anything else, because
every other answer here depends on it.** `resolvePrice` and both display functions
always return the **gross, as-displayed** amount in a tax-inclusive market:
`prices.list_minor` *is* the gross figure (the table above), and the price a shopper
sees, the price snapshotted onto `cart_items.unit_final_minor`, and the price
compared at checkout step 2 are all that same integer. **Extraction happens exactly
once, in `src/lib/orders/` when the order is built, and nowhere else.** Getting this
backwards — returning net from the pricing service — means the PDP shows ₹8,475 for
a piece priced at ₹10,000 and the bag charges ₹10,000, or the reverse; and because
both numbers are plausible integers, nothing fails.

**Where the extraction residue goes, so that three integer identities hold at
once.** `chk_order_items_subtotal` requires `line_subtotal_minor = unit_final_minor
* quantity`, so the **net unit** must be an integer and the net line its exact
multiple. The exact net line almost never is. The residue is carried by **tax**,
not by the subtotal:

```ts
// per line, gross already known: lineGrossMinor = unit_final_gross * quantity
const netUnitMinor      = extractNetUnit(unitFinalGrossMinor, jurisdictions);  // floor
const lineSubtotalMinor = netUnitMinor * BigInt(quantity);        // ≤ exact net line
const lineTaxMinor      = lineGrossMinor - lineSubtotalMinor + lineDiscountMinor;
```

Then `line_total_minor = line_subtotal − line_discount + line_tax + line_shipping`
= `lineGross + line_shipping`, which is what the customer pays, and
`orders.tax_total_minor = SUM(order_items.line_tax_minor) + shippingTaxMinor`.
Both `chk_order_items_total` and `chk_orders_total` hold, the deferred
`trg_orders_totals_match` trigger (02 §2.7) passes at commit, and the printed
invoice adds up. Flooring the net and letting tax absorb the remainder is the only
assignment of the residue that keeps the *charged* total exactly equal to the
*displayed* total; putting it on the subtotal instead moves the customer's total by
up to `quantity − 1` minor units away from the figure on the page.

Note the asymmetry with an exclusive market: there, the provider gives one
`taxTotalMinor` and `allocate()` splits it across lines (02 §1.10 rules 3–4). Here,
the per-line tax is *derived* from the gross the customer was quoted, and the order
total is the sum. In a tax-inclusive market there is no provider total to allocate —
the gross was already fixed by the price row.

**Extraction with more than one rate.** `taxNano = grossNano * rateBp / (10_000 +
rateBp)` is correct only for a single blended rate, which India's GST happens to be
today and which a `tax_rules` table with `is_compound` and `priority` explicitly
does not promise. `RulesTableProvider` therefore extracts **per rule, in `priority`
order, over the running base**, and `extractNetUnit` is the inverse of the same
walk:

```
base = grossUnitMinor  (scaled to nano)
for each rule r in priority order, non-compound first:
    denom = 10_000 + Σ(rate_bp of the non-compound rules)          // applied to the net
    taxes[r] = base * r.rate_bp / denom
for each compound rule c:
    taxes[c] = (base − Σ non-compound taxes + Σ earlier compound taxes) * c.rate_bp / (10_000 + c.rate_bp)
netUnitMinor = floor((grossUnitNano − Σ taxes) / SCALE)
```

with one rounding at the end, in the nano-minor domain of §2.3. The per-jurisdiction
amounts go to `orders.tax_breakdown` and the effective blended rate to
`order_items.tax_rate_bp`, so the invoice can print `CGST 1.5%` and `SGST 1.5%`
separately rather than `GST 3%` — which is a statutory requirement on an Indian
invoice, not a presentation preference.

`tests/integration/inclusive-tax-identity.test.ts` sweeps quantities 1–12 ×
rates 0.25%–28% × one, two and three jurisdictions including a compound one, and
asserts on every combination: `line_subtotal = unit_final × qty`,
`SUM(line_tax) + shippingTax = tax_total`, `chk_orders_total`, and
**`order.total_minor` equals the sum of the gross figures the shopper was shown**.

`formatMoney` is unaffected — the number it receives is already the one to display.
The *label* beside it comes from `markets.prices_include_tax` and lives in
`src/components/storefront/Price.tsx`, which receives it as a prop and computes
nothing.

> **NEEDS INPUT:** carried forward from 01 §4.4 and not re-decided here — the US
> nexus and registration position and who signs off taxability codes for finished
> jewellery vs loose stones vs bullion; and for India, the GSTIN, the HSN code per
> category, **whether displayed INR prices are GST-inclusive** (this sets
> `markets.prices_include_tax` for `IN` and is the one answer that changes what a
> shopper sees), and whether B2B invoices carrying a buyer GSTIN are in scope.
> The architecture snapshots a computed tax amount either way.

---

## 9. Worked examples, formatting and rounding

> Every number in this section is **illustrative arithmetic**, chosen to exercise
> the formula. None of it is a Millennium Designs price, cost, rate or margin, and
> none of it is seeded (hard rule 8).

### 9.1 The piece

One physical ring, one `products` row, one variant, two markets.

| Fact | Value | Column |
| --- | --- | --- |
| SKU | `MD-RNG-LAB-001` | `product_variants.sku` |
| Metal | Sterling silver, `purity_ratio = 0.92500` ⇒ `purityBp = 9250` | `materials.purity_ratio` |
| Metal weight | `6.400 g` ⇒ `weightMilligrams = 6400` | `variant_materials.weight_grams` |
| Stone | One labradorite | `product_stones` |
| Stone cost | USD `4500` ($45.00) · INR `300000` (₹3,000.00) | `variant_component_costs` |
| Other materials | USD `1200` ($12.00) · INR `90000` (₹900.00) | `variant_component_costs` |

Market terms on the bound formula version:

| Term | US | IN |
| --- | --- | --- |
| `making_charge_mode` / `making_charge_bp` | `percent_of_metal` / `15000` (150%) | same version row — structure is currency-free |
| `markup_mode` / `markup_bp` | `percent_of_subtotal` / `12000` (120%) | `percent_of_subtotal` / `9000` (90%) — **different market-terms row** |
| `market_adjustment_delta_minor` | `0` | `0` |
| `rounding_increment_minor` / `rounding_mode` | `100` (whole dollar) / `half_up` | `10000` (nearest ₹100) / `half_up` |

Silver rates, entered independently, `rate_scale = 4`:

| Currency | `rate_minor_per_gram` | Reads as |
| --- | --- | --- |
| USD | `1050000` | $1.0500 per gram of pure silver |
| INR | `92500000` | ₹92.5000 per gram of pure silver |

### 9.2 MANUAL

| | US | India |
| --- | --- | --- |
| `prices.price_source` | `manual` | `manual` |
| `prices.market_code` / `currency_code` | `US` / `USD` | `IN` / `INR` |
| `prices.list_minor` | **`24800`** | **`1995000`** |
| Displayed | **$248.00** | **₹19,950.00** |
| `formula_version_id`, `metal_*`, `computed_base_minor` | `NULL` | `NULL` |

Two rows. No shared column, no ratio between them, and deliberately **not**
FX-consistent — at any plausible rate $248 is not ₹19,950. That is the point: the
India figure is a local commercial decision entered by a human, and the system has
no opinion about whether it "matches". Editing the US row inserts a new US row and
writes one `price_history` entry with `market_code = 'US'`; the India row's
`valid_to` stays `NULL` and nothing about it is read, written or recomputed.

### 9.3 SILVER-LINKED

**US**, nano-minor throughout (`SCALE = 1e6`):

| Term | Exact (minor) | Snapshot column | Value |
| --- | --- | --- | --- |
| Metal: `1050000 × 6400 × 9250 ÷ (10⁴ × 10³ × 10⁴)` | `621.600000` | `metal_component_minor` | `622` |
| Making: `621.6 × 15000 bp` | `932.400000` | `making_charge_computed_minor` | `932` |
| Stone | `4500.000000` | `stone_cost_minor` | `4500` |
| Other materials | `1200.000000` | `other_material_cost_minor` | `1200` |
| *Subtotal* | `7254.000000` | — | — |
| Markup: `7254 × 12000 bp` | `8704.800000` | `markup_minor` | `8705` |
| Market adjustment | `0` | `market_adjustment_delta_minor` | `0` |
| **Base, rounded once** | `15958.800000` → half-up | `computed_base_minor` | **`15959`** |
| Increment rounding to `100`, half-up | `15959` → `16000` | `rounding_adjustment_minor` | `+41` |
| | | **`list_minor`** | **`16000`** |

`allocate()` check: floors are `621 + 932 + 4500 + 1200 + 8704 = 15957`; two minor
units remain; the largest fractional remainders are markup (`.800`) and metal
(`.600`), so each takes one → `622 + 932 + 4500 + 1200 + 8705 = 15959` =
`computed_base_minor`. `chk_prices_components_sum` passes.
`chk_prices_list_identity`: `15959 + 41 + 0 = 16000`. Passes.

**Displayed: $160.00.**

**India**, the same variant, the same formula version, its own market-terms row and
its own rate:

| Term | Exact (minor) | Snapshot column | Value |
| --- | --- | --- | --- |
| Metal: `92500000 × 6400 × 9250 ÷ 10¹¹` | `54760.000000` | `metal_component_minor` | `54760` |
| Making: `54760 × 15000 bp` | `82140.000000` | `making_charge_computed_minor` | `82140` |
| Stone | `300000.000000` | `stone_cost_minor` | `300000` |
| Other materials | `90000.000000` | `other_material_cost_minor` | `90000` |
| *Subtotal* | `526900.000000` | — | — |
| Markup: `526900 × 9000 bp` | `474210.000000` | `markup_minor` | `474210` |
| Market adjustment | `0` | `market_adjustment_delta_minor` | `0` |
| **Base, rounded once** | `1001110.000000` | `computed_base_minor` | **`1001110`** |
| Increment rounding to `10000`, half-up | `1001110` → `1000000` | `rounding_adjustment_minor` | `−1110` |
| | | **`list_minor`** | **`1000000`** |

**Displayed: ₹10,000.00.**

$160.00 and ₹10,000.00 are not a conversion of one another and no code path relates
them: four of the six inputs (rate, stone cost, other-material cost, markup) are
separately configured per currency, and the two rounding increments are different.

### 9.4 HYBRID

Same calculated base as §9.3; one signed, stored, per-market adjustment.

> Reachable only when `settings['pricing.enable_hybrid']` is `true`; it is seeded
> `false` and the mode is deferred out of release 1 (§2.5). The arithmetic below
> is specified and tested regardless, because the flag gates
> `setFormulaBinding()`, not `evaluateFormula()`.

**US** — `price_formula_bindings.mode = 'hybrid'`,
`hybrid_adjustment_type = 'fixed_delta'`, `hybrid_adjustment_delta_minor = +2000`:

| Column | Value |
| --- | --- |
| `computed_base_minor` | `15959` |
| `rounding_adjustment_minor` | `+41` |
| `hybrid_adjustment_delta_minor` | `+2000` |
| `list_minor` | **`18000`** → **$180.00** |
| `price_source` | `hybrid` |

**India** — `hybrid_adjustment_type = 'percent'`, `hybrid_adjustment_bp = −500`
(5% below the calculated price), resolved at write time against the increment-rounded
base `1000000`:

| Column | Value |
| --- | --- |
| `computed_base_minor` | `1001110` |
| `rounding_adjustment_minor` | `−1110` |
| `hybrid_adjustment_delta_minor` | `−50000` |
| `list_minor` | **`950000`** → **₹9,500.00** |

`chk_prices_list_identity` on both: `15959 + 41 + 2000 = 18000`;
`1001110 − 1110 − 50000 = 950000`.

### 9.5 What an 8% silver rise does — and does not do

The USD rate moves `1050000 → 1134000`. Nothing happens to any live price. A
`metal_rates` row is inserted; `getDisplayPrice()` returns the same numbers; zero
cache tags are purged.

The nightly job creates a `recalc_runs` preview. The US line reads:

| | Current | Proposed |
| --- | --- | --- |
| Metal | `622` | `671.328` → `671` |
| Making (150%) | `932` | `1006.992` → `1007` |
| Stone + other | `5700` | `5700` |
| Subtotal | `7254` | `7378.320` |
| Markup (120%) | `8705` | `8853.984` → `8854` |
| `computed_base_minor` | `15959` | `16232` |
| `list_minor` after `100` increment | `16000` | **`16200`** |
| Δ | | **+`200` (+1.25%, `change_bp = +125`)** |

The India line is evaluated from the **INR** rate. If no fresh INR rate exists it is
written as `status = 'skipped'`, `skip_reason = 'no INR silver rate for
2026-09-12'`, and the run still proposes the US change. Nothing is estimated and
nothing is converted.

Until an admin with `price.approve_recalc` opens
`/admin/pricing/recalc-runs/[id]` and approves, the storefront still shows
**$160.00**.

### 9.6 Currency formatting and rounding specification, per market

One formatter, `formatMoney(m: Money, market: Market)` in `src/lib/money.ts`
(01 §2.6). Everywhere else — storefront, admin, PDF invoices, emails, CSV headers —
calls it. `Intl.NumberFormat` is a lint error outside that file.

```ts
// src/lib/money.ts — the decimal string is built by integer string surgery on the
// minor-unit digits. No float, no division, no coercion, at any magnitude.
function toDecimalString(minor: bigint, minorUnit: number): string {
  const neg = minor < 0n;
  const digits = (neg ? -minor : minor).toString().padStart(minorUnit + 1, '0');
  const whole = digits.slice(0, digits.length - minorUnit);
  const frac  = minorUnit === 0 ? '' : '.' + digits.slice(digits.length - minorUnit);
  return (neg ? '-' : '') + whole + frac;
}

new Intl.NumberFormat(market.locale, {
  style: 'currency',
  currency: market.currency_code,
  minimumFractionDigits: currency.minor_unit,
  maximumFractionDigits: currency.minor_unit,
  currencyDisplay: 'narrowSymbol',
}).format(toDecimalString(minor, currency.minor_unit))   // string overload, ES2023
```

**There is no permitted amount coercion in this codebase, not even one.**
`Intl.NumberFormat.prototype.format` accepts a decimal **string** and parses it
exactly, so the earlier `Number(minor) / 10 ** minor_unit` is unnecessary as well as
lossy — and an exception carved out for "the last operation before a string" is an
exception the next person extends. `Number()` applied to an amount therefore stays a
lint error **everywhere**, `src/lib/money.ts` included, which is a rule with no
special cases to remember. `toDecimalString` is exact for every `bigint`, including
the ones above 2⁵³ that a future zero-minor-unit currency or a lifetime-value
aggregate will produce.

| Property | US (`en-US`, `USD`) | India (`en-IN`, `INR`) |
| --- | --- | --- |
| Example | `$1,450.00` | `₹1,00,000.00` |
| Grouping | Thousands, 3-digit | **Lakh/crore, 2-2-3** — `Intl.NumberFormat('en-US', { currency: 'INR' })` renders a lakh as `₹100,000.00` and an Indian customer has to count digits on a jewellery-sized number (01 §2.6) |
| Symbol | `$`, prefixed, no space | `₹`, prefixed, no space |
| Minor digits | Always 2 | Always 2 |
| `currencies.minor_unit` | `2` | `2` |
| Negative (refund, credit) | `-$25.00` | `-₹2,500.00` |
| Zero | `$0.00` — never "Free" unless a component deliberately substitutes that label for shipping | `₹0.00` |
| Price range on a card | `From $160.00` | `From ₹10,000.00` |
| Commercial rounding increment | `100` (whole dollar) | `10000` (nearest ₹100) |
| Rounding mode | `half_up` | `half_up` |
| Half-up direction | Away from zero on `.5`, currency-independent (02 §1.10 rule 5) | same |
| Admin chart axes | May drop minor digits (`$1.4k`) — **the only place** trailing digits are dropped, and never on a price a customer or an invoice sees | same |
| Locale source | `markets.locale` | `markets.locale` |

Trailing `.00` is always shown on a price. A luxury catalogue that renders `$160`
on the card and `$160.00` in the bag reads as two different numbers to a shopper
comparing them, and the inconsistency costs more than the two characters save.

`tests/unit/format-money.test.ts` asserts `formatMoney` over both markets for
`0`, `1`, `99`, `100`, `99_999`, `100_000`, `10_000_000` and a negative, with the
Indian grouping pinned character-for-character — the assertion that catches the day
someone "simplifies" the formatter to a hardcoded locale.
