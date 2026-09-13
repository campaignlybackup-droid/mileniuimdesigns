# 08 — API and Service Layer, SEO Architecture, Route Maps

Scope: the service modules and their public signatures, the typed error taxonomy
and how it crosses to the UI, the complete API surface (server components vs
server actions vs route handlers), the SEO architecture, the storefront and admin
route maps, search, and analytics.

Identifiers from 01 and 02 are reused verbatim. Where this section needs a table
02 does not define, it says so in a `> **SCHEMA ADDITION:**` callout.

---

## 1. Service layer

### 1.1 Module inventory and responsibility boundaries

Every module lives at `src/lib/<domain>/` with a fixed internal shape:

```
src/lib/<domain>/
├── index.ts        # the public surface — the ONLY file any caller may import
├── schema.ts       # Zod schemas, one per public function input
├── queries.ts      # read paths (may use src/lib/db/raw fragments)
├── mutations.ts    # write paths; each follows the six-step contract (01 §2.3)
├── errors.ts       # domain-specific AppError subclasses (re-exported from index)
└── <internal>.ts   # not importable from outside the folder
```

`eslint-plugin-boundaries` (01 §2.2) is extended with a deep-import ban:
`no-restricted-imports` with pattern `@/lib/*/!(index)` outside the owning folder.
A caller that reaches into `@/lib/pricing/queries` has bypassed the module's
contract, and a bypassed contract is how a second price authority gets born.

| Module | Owns (the thing nobody else may do) | Explicitly does NOT own |
| --- | --- | --- |
| `src/lib/market/` | Resolving the active `markets` row, its currency, locale, timezone, fulfilment locations, tax mode, payment provider key | Deciding market from a cookie or IP (01 §1.4) |
| `src/lib/pricing/` | Computing, discounting, rounding and resolving any amount a customer sees or pays; `prices` row selection; `metal_rates` application; `recalc_runs` preview/apply | Formatting (that is `money.ts`), tax, shipping |
| `src/lib/discounts/` | Evaluating `coupons`, `coupon_conditions`, `coupon_amounts`, `pricing_rules`, `gift_cards`; producing `DiscountLine[]` | Applying them to a total — `pricing` composes |
| `src/lib/tax/` | The India `rules_table` path, the Stripe Tax call for `provider_stripe_tax`, and the `variant → product → category` `tax_code` resolution (04 §8.2) | Deciding whether tax is included in the displayed price (that is `markets.prices_include_tax`, read via `market`) |
| `src/lib/shipping/` | Zones, rate bands, free-shipping thresholds (per currency), method eligibility, quote generation | Charging for it, snapshotting it onto an order |
| `src/lib/inventory/` | `inventory_items`, `inventory_transactions`, `reservations`; every read of "is it available"; every decrement, reserve, release, commit | Deciding whether a product is *sellable* in a market (that is `catalog` + `product_market_content`) |
| `src/lib/catalog/` | `products`, `product_variants`, options, `attributes`, `categories`, `collections`, `product_media`, `curated_facets`, `reindexProduct()`, `refreshCollection()`, `materialized_path` maintenance | Prices, stock, SEO metadata |
| `src/lib/stones/` | `stones`, `product_stones`, stone-led discovery queries, stone index and detail reads | The `/stones` route's metadata (that is `seo`) |
| `src/lib/cart/` | `carts`, `cart_items`, guest cart tokens, merge-on-login, `switchMarket()` | Pricing the lines itself — it calls `resolvePriceBatch` and stores the quote |
| `src/lib/orders/` | `orders`, `order_items`, `order_addresses`, `order_counters`, the status machine, snapshotting, invoices, `shipments` | Talking to an acquirer |
| `src/lib/payments/` | Provider registry, intent creation, webhook envelope verification, capture, refund, marking an order paid | Choosing which provider — it reads `markets.payment_provider_key` via `market` |
| `src/lib/returns/` | `returns`, `return_items`, approval flow, restock decision, refund initiation | Executing the refund at the provider (`payments`) |
| `src/lib/customers/` | `customers`, `customer_groups`, `addresses`, `customer_currency_totals`, anonymisation, marketing consent provenance | Authentication (`auth`) or authorization (`rbac`) |
| `src/lib/cms/` | `cms_pages`, `cms_sections`, `cms_blocks`, `content_versions`, restore, `navigation_menus`, `journal_posts`, `redirects`, the Tiptap node renderer | Which URL renders which page — that is the route map (§4) |
| `src/lib/media/` | `media`, `media_folders`, Cloudinary signing, derivative presets, delivery-URL construction from `public_id` | Attaching media to a product (`catalog.product_media`) |
| `src/lib/search/` | `SearchProvider`, `PostgresSearchProvider`, typeahead, synonym/promotion/redirect application, `search_queries` logging | Rendering results |
| `src/lib/seo/` | `generateMetadata()` inputs, canonical and hreflang construction, JSON-LD builders, sitemap enumeration, robots policy | Writing `redirects` rows on a slug change — that is `catalog`/`cms` inside the same transaction |
| `src/lib/analytics/` | `analytics_events` writes, the canonical event taxonomy, the vendor mapping tables, server-side conversion dispatch | Deciding consent (that is the client consent gate, §7.4) |
| `src/lib/checkout/` | The order of the §2.5 sequence and nothing else | Pricing, reserving, transitioning, capturing |

### 1.2 Dependency rules

Modules are assigned to tiers. **A module may import from a strictly lower tier
only. Same-tier imports are a lint error**, which is what makes the graph acyclic
by construction rather than by `import/no-cycle` catching it after the fact.

| Tier | Modules |
| --- | --- |
| T0 primitives | `src/types/`, `src/lib/config/`, `money.ts`, `errors.ts`, `result.ts`, `logger.ts` |
| T1 infrastructure | `db/`, `cache/`, `audit/`, `ratelimit/`, `analytics/`, `jobs/`, `media/`, `email/` |
| T2 context | `market/`, `rbac/`, `auth/`, `customers/` |
| T3 catalogue, content, rules | `catalog/`, `stones/`, `cms/`, `search/`, `discounts/`, `tax/`, `shipping/` |
| T4 valuation and stock | `pricing/`, `inventory/`, `seo/` |
| T5 commerce aggregates | `cart/`, `orders/` |
| T6 external commerce | `payments/` |
| T7 orchestration | `checkout/`, `returns/`, `importexport/` |
| T8 reporting | `reporting/` |

Four consequences worth naming because each one is a rule someone will want to
break:

- **`email/` is T1 and imports no domain module.** It takes a fully-built payload.
  The alternative — `email/` reading an order so a template can render it — makes
  `email` depend on `orders`, and the next template that needs a price makes it
  depend on `pricing`, at which point a mail-template edit can change what a
  customer is charged. `orders.buildConfirmationPayload(orderId)` builds the data;
  `email.send()` renders it.
- **`analytics/` is T1** for the same reason: it records what it is handed.
  `orders` calls `analytics.record(...)`; `analytics` never reads an order.
- **`payments/` sits above `orders/`** because marking an order paid is the
  payment domain's job (01 §2.3) and it must call `orders.transitionOrder()`.
  `orders` therefore knows nothing about Stripe or Razorpay, and a third acquirer
  touches one tier.
- **`reporting/` is T8 and nothing imports it except `src/app/(admin)/**`** (14 §1.1).
  It is the only module that may read across domains, and the only one no domain may
  read back. A service that imports a report is a service that has made a derived
  figure into an authority. It may import `db/`, `types/`, `config/`, `money.ts` and
  the **read-only** exports of any lower tier (`getAvailability`, `resolvePriceBatch`,
  `listActiveMarkets`, `can`); it may import no mutator, not `analytics/` (the write
  path), no vendor SDK and no `fetch`. Its single write is `refreshRollups()`, the
  `product_metrics_refresh` handler (14 §4.2).

**No business logic outside the service layer.** Enforced, not asked for:

| Where logic tries to leak | The mechanical block |
| --- | --- |
| `src/app/**` | May import `actions`, `service`, `components`, `types`, `config` only (01 §2.2). A page may call `getProductForPdp()`; it may not branch on `price < list` to decide a sale badge — `ResolvedPrice.discountBreakdown` already says. |
| `src/components/**` | `import type` from services only. A component receives `PricePresentation`, never `ResolvedPrice`, never a `bigint`. |
| `src/server/actions/**` | Each exported action is `parse → requirePermission → call ONE service function → map to ActionResult`. `tests/unit/actions-shape.test.ts` parses every file under `src/server/actions/` and fails on more than one service import or any arithmetic operator applied to an identifier ending `Minor`. |
| Route handlers | Same rule, plus: no route handler may import `@/lib/db` (boundaries) and none may be a mutation reachable by `GET` (01 §1.3). |
| `middleware.ts` | `src/lib/edge/**` and `config` only. |

### 1.3 Public signatures

The signatures already fixed by 01 §2.3 (`resolvePrice`, `resolvePriceBatch`,
`getDisplayPrice`, `reserveStock`, `releaseStock`, `commitStock`,
`getAvailability`, `createOrderFromCart`, `transitionOrder`,
`getProviderForMarket`, `PaymentProvider`, `resolveMarket`,
`listActiveMarkets`) are canonical and are not restated. The rest of the surface:

```ts
// src/lib/catalog/index.ts
export async function getProductForPdp(input: {
  slug: string; marketCode: MarketCode;
}): Promise<ProductDetail | null>;                       // null ⇒ caller calls notFound()

export async function listCategoryProducts(input: {
  categoryId: string; marketCode: MarketCode;
  filters: CatalogFilters; sort: CatalogSort;
  cursor?: string; limit?: number;                        // limit capped at 100 (01 §2.3 step 1)
}): Promise<Page<ProductCard>>;

export async function listCollectionProducts(input: {
  collectionId: string; marketCode: MarketCode;
  filters: CatalogFilters; sort?: CatalogSort;            // omitted ⇒ collections.sort_order
  cursor?: string; limit?: number;
}): Promise<Page<ProductCard>>;

export async function getFacetCounts(input: {
  scope: { kind: 'category' | 'collection' | 'stone'; id: string };
  marketCode: MarketCode; filters: CatalogFilters;
}): Promise<FacetCounts>;                                 // stone, material, attribute, price band

export async function resolveCategoryBySlug(slug: string, m: MarketCode): Promise<Category | null>;
export async function resolveCuratedFacet(categorySlug: string, facetSlug: string): Promise<CuratedFacet | null>;
export async function saveProduct(input: SaveProductInput, actor: Actor): Promise<Result<Product, StaleWriteError | ValidationError>>;
export async function setProductSlug(productId: string, slug: string, actor: Actor, opts: { createRedirect: boolean }): Promise<Result<Product, SlugTakenError | StaleWriteError>>;
export async function reindexProduct(productId: string, tx: Tx): Promise<void>;
export async function reindexProductsForEntity(                       // §6.1 — a rename is a reindex
  entity: { kind: 'stone' | 'material' | 'category' | 'collection' | 'tag'; id: string }, tx: Tx,
): Promise<{ enqueuedJobId: string } | { reindexed: number }>;
export async function refreshCollection(collectionId: string, tx: Tx): Promise<void>;

// src/lib/stones/index.ts
export async function listStones(marketCode: MarketCode): Promise<StoneCard[]>;
export async function getStoneBySlug(slug: string, m: MarketCode): Promise<StoneDetail | null>;
export async function listStoneProducts(input: {
  stoneId: string; marketCode: MarketCode; categoryId?: string;   // the per-type sub-listing
  filters: CatalogFilters; sort: CatalogSort; cursor?: string; limit?: number;
}): Promise<Page<ProductCard>>;
export async function getStoneCategoryCounts(stoneId: string, m: MarketCode): Promise<{ categoryId: string; slug: string; name: string; count: number }[]>;

// src/lib/cart/index.ts
export async function getCart(token: CartToken): Promise<CartView>;                        // never cached
// No market parameter, by construction. A cart's market is `carts.market_code` and nothing
// else (01 §2.5 step 1). A `marketCode` argument here is a second, caller-supplied source
// for it, and the first caller that passes the URL segment instead of the row renders a
// US-quoted bag under `/in/` — 145000 minor units displayed as ₹1,450.00, an implicit FX
// conversion at a rate of 1, which is exactly what the composite FKs on `cart_items`
// (02 §2.7) exist to make unwritable. `CartView` carries `marketCode` / `currencyCode` read
// from the row; comparing them to the URL segment and raising `MarketChangedError` is the
// caller's job, not a parameter's.
export async function addItem(token: CartToken, input: { variantId: string; quantity: number; personalisation?: unknown }): Promise<Result<CartView, InsufficientStockError | PriceUnavailableError | ProductUnavailableInMarketError>>;
export async function updateItemQuantity(token: CartToken, cartItemId: string, quantity: number): Promise<Result<CartView, InsufficientStockError>>;
export async function removeItem(token: CartToken, cartItemId: string): Promise<CartView>;
export async function applyCoupon(token: CartToken, code: string): Promise<Result<CartView, CouponInvalidError>>;
export async function removeCoupon(token: CartToken): Promise<CartView>;
export async function switchMarket(token: CartToken, to: MarketCode): Promise<MarketSwitchOutcome>;  // §4.4
export async function mergeOnLogin(guest: CartToken, customerId: string): Promise<CartView>;
export async function getCartSummary(token: CartToken): Promise<{ itemCount: number; subtotal: Money }>;

// src/lib/customers/index.ts — wishlists live here (a wishlist requires a customer, 02 §2.7)
export async function getWishlist(customerId: string, m: MarketCode): Promise<WishlistView>;
export async function addWishlistItem(customerId: string, input: { productId: string; variantId?: string; note?: string }): Promise<WishlistView>;
export async function removeWishlistItem(customerId: string, itemId: string): Promise<WishlistView>;
export async function syncGuestWishlist(customerId: string, items: { productId: string; variantId?: string }[]): Promise<WishlistView>;  // posted once on sign-in
export async function getWishlistByShareToken(token: string, m: MarketCode): Promise<PublicWishlistView | null>;
// A DIFFERENT return type, deliberately. The lookup is
// `WHERE share_token_hash = sha256($1) AND is_public` — **both** predicates (07 §4.2);
// matching on the hash alone means a customer who turns sharing off has not turned it off,
// because the link they already sent still resolves. 02 §2.7 stores only the hash, and the
// route that renders it is public to anyone holding the link. `PublicWishlistView` carries `wishlists.name`, the
// product cards and their display prices — and nothing else. Not the owner's display name,
// not their email, not `wishlist_items.note`, which is the customer's private annotation
// about a gift and is the field a `WishlistView` would have leaked to the recipient.
// Returning `WishlistView` from a public token route is a PII disclosure with a plausible
// story attached, which is why the type, not a code review, is the enforcement.
export async function setMarketingConsent(customerId: string, accepts: boolean, source: 'checkout' | 'footer_form' | 'account' | 'admin_import'): Promise<void>;

// src/lib/orders/index.ts — `createOrderFromCart` and `transitionOrder` are 01 §2.3's and
// are not restated. This is the admin read, and its projection is the whole point of it.
export async function getOrderDetail(actor: Actor, orderId: string): Promise<OrderDetail>;
// THE PII PROJECTION IS IN THIS FUNCTION, NOT IN THE PAGE. `order.read` is held by
// `inventory_manager` and `analyst` (11 §1.4); `customer.read` is not. 07 §2.4 note 2 says
// the customer block of an order is gated separately, and nothing in this document made
// that mechanical — which left `order.read` as `customer.read` under another name, because
// an order detail payload carries the buyer's name, email, phone and two addresses.
//
// The rule, stated once and implemented once: `getOrderDetail` resolves
// `can(actor, 'customer.read')` itself and, when the actor does not hold it, **omits** the
// customer block from the returned object and from the SELECT list — `email`, `phone`,
// `customer_id`, `order_addresses.recipient_name`, `line1`, `line2`, `postal_code` and
// `addresses.*` are never read, so they cannot reach a log, a Sentry breadcrumb or a
// serialised RSC payload. What remains is what a warehouse and an analyst actually need:
// order number, status, market, currency, totals, `order_items` snapshots, shipment rows,
// the destination **city, region and country** (needed to pick and to report), and the
// audit trail. The field is absent, not `null` and not masked:
export type OrderDetail = {
  order: OrderSummary;                       // never carries email or phone
  items: OrderItemSnapshot[];
  shipments: ShipmentView[];
  destination: { city: string; region: string | null; countryCode: string };
  customer?: OrderCustomerBlock;             // present ⇔ can(actor, 'customer.read')
};
// A masked string ("j••@••.com") is still a disclosure and still travels; an absent
// optional field makes the omission visible in the type, so a component that renders the
// customer block does not compile without handling its absence. `tests/integration/
// order-detail-projection.test.ts` asserts that an `inventory_manager` request returns no
// `customer` key **and** that the generated SQL names none of the seven columns above —
// the same "gated columns absent from the response and from the SQL" assertion 13 §2.4
// makes for saved views, because hiding a column in the UI is not authorization
// (hard rule 9).
export async function listOrders(actor: Actor, input: { filters: OrderFilters; sort: OrderSort; cursor?: string; limit?: number }): Promise<Page<OrderRow>>;
// Same projection rule, same function-level check: the `email` column of `/admin/orders`
// is a column of the projection, not a column of the grid (13 §1.3).
export async function getByPublicToken(token: string): Promise<OrderDetail | null>;   // /orders/[token], 01 §2.7

// src/lib/discounts/index.ts
export async function evaluateCoupon(input: {
  code: string; marketCode: MarketCode; currencyCode: CurrencyCode;
  lines: DiscountableLine[]; customerId?: string; at: Date;
}): Promise<Result<DiscountLine[], CouponInvalidError>>;
export async function listAutomaticRules(marketCode: MarketCode, at: Date): Promise<PricingRule[]>;

// src/lib/shipping/index.ts — 05 §7.1 owns this signature and the version below is
// that one verbatim. This document previously declared a fourth-and-fifth variant
// (`destination: AddressInput`, `subtotal: Money`, a required `at`, a `Result` return).
// `subtotal: Money` versus `merchandiseSubtotalMinor: bigint` is not a formatting
// difference: `Money` is the *serialisation* shape that crosses `Response.json()`
// (§2.3), and putting it on the one argument this paragraph then argues must never be
// client-supplied is an invitation to fill it from a request body.
export async function quoteShipping(input: {
  marketCode: MarketCode;
  currencyCode: CurrencyCode;
  destination: { countryCode: string; region: string | null; postalCode: string | null };
  lines: { variantId: string; quantity: number; weightGrams: string | null }[];
  merchandiseSubtotalMinor: bigint;   // after line discounts, before tax
  at?: Date;
}): Promise<ShippingQuote[]>;
// Returns an ARRAY, not a `Result`. 05 §7.1 step 1: no matching zone is `[]`, and an
// empty quote set is a state the delivery step renders
// (`checkout.address.country_unsupported`), not an error class. `ShippingUnavailableError`
// is raised one level up, by `quoteShippingForSession` below, which is the only caller
// reachable from a boundary and the only place that knows whether an empty set is fatal.

// src/lib/tax/index.ts — 04 §8.1 owns this. `quoteTax` is the module-level entry point
// and is the CANONICAL NAME (11 §2.2 rejected spellings); `computeTax(...)` in 05 §3.6
// is the same call under a third name and is not used. It is a thin wrapper over the
// provider the market selects — it holds no rate logic of its own:
export function getTaxProviderForMarket(marketCode: MarketCode): TaxProvider;   // 04 §8.1
export interface TaxProvider {
  readonly key: string;                                  // 'stripe_tax' | 'rules_table' | 'none'
  quote(input: TaxQuoteInput): Promise<Result<TaxQuote, TaxUnavailableError | TaxUnconfiguredError>>;
}
export type TaxQuoteInput = {                            // 04 §8.1, verbatim
  marketCode: MarketCode;
  currencyCode: CurrencyCode;
  lines: { lineId: string; variantId: string; taxCode: string | null; amountMinor: bigint }[];
  shippingMinor: bigint;
  destination: { countryCode: string; regionCode: string | null; postalCode: string | null };
  customerTaxId: string | null;                          // buyer GSTIN, US resale certificate
  at: Date;
};
export async function quoteTax(
  input: TaxQuoteInput,
): Promise<Result<TaxQuote, TaxUnavailableError | TaxUnconfiguredError>>;
// = `getTaxProviderForMarket(input.marketCode).quote(input)`. Allocates per line by
// 02 §1.10 rule 4. The error union is TWO classes and the distinction is 09 P22(e)'s
// launch blocker: `TAX_UNAVAILABLE` (422) is "the provider was reached and cannot quote
// this destination"; `TAX_UNCONFIGURED` (503) is "there is no tax configuration at all"
// — zero Stripe Tax registrations, or `tax_mode = 'none'` without the per-market
// `settings['tax.allow_zero_tax_market']` row (§1.4, 11 §2.2). Collapsing them is how a
// checkout succeeds and the liability accrues silently.

// `lines`, `merchandiseSubtotalMinor` and `shippingMinor` above are SERVER-DERIVED VALUES, and the two
// functions are not reachable from a request boundary. `shipping` is T3 and `tax` is T3;
// neither may import `cart` (T5), so neither can fetch the bag itself — which means a
// naive route handler would fill those fields from the request body. It would then be one
// `curl` to claim `subtotal = {"amountMinor":"50000000","currencyCode":"USD"}` and clear a
// free-shipping threshold, or to shrink `lines` and pay tax on one of three pieces. Both
// are hard-rule-3 violations sitting inside a type that looks harmless.
//
// So the only caller of either is `checkout` (T7), and the only thing a boundary may send
// is the destination:
export async function quoteShippingForSession(
  token: CartToken, sessionId: string, destination: AddressInput,
): Promise<Result<ShippingQuote[], ShippingUnavailableError | MarketChangedError>>;
// checkout loads the cart by its session, re-runs `resolvePriceBatch`, builds `lines` and
// `merchandiseSubtotalMinor` from the result, and only then calls `shipping.quoteShipping`. The same rule
// binds `quoteTax`: `shippingMinor` is the minor amount of the method the customer
// selected as recorded on the checkout session, never a number that arrived in a body.
// `tests/unit/actions-shape.test.ts` is extended to fail any route handler or action under
// `src/app/api/checkout/**` / `src/server/actions/checkout.ts` whose Zod body schema
// declares a key matching `/(lines|subtotal|shipping|total|amount|price).*minor|^lines$|^subtotal$/i`.

// src/lib/checkout/index.ts — orchestration only.
// EVERY function takes the cart token first and the session id second, and resolves the
// session with an ownership predicate, never by id alone:
//   WHERE cs.id = $2 AND cs.cart_id = (SELECT id FROM carts WHERE token_hash = sha256($1))
// Zero rows is `NotFoundError`, which covers "wrong owner" and "expired" in one round trip
// (07 §4.1: ownership is a WHERE clause, never an `if` after the read). A bare
// `setContactAndAddress(sessionId, …)` is an IDOR with a business-logic costume: a
// `checkout_sessions.id` is an identifier, not a capability, and possessing one would
// otherwise be enough to read a stranger's bag, overwrite their shipping address and place
// their order. `uq_checkout_sessions_cart` (05 §3.2) makes the predicate a single index probe.
export async function startCheckout(token: CartToken, m: MarketCode): Promise<Result<CheckoutSession, CheckoutError>>;
export async function setContactAndAddress(token: CartToken, sessionId: string, input: ContactAddressInput): Promise<Result<CheckoutSession, ValidationError>>;
export async function setShippingMethod(token: CartToken, sessionId: string, shippingMethodId: string): Promise<Result<CheckoutSession, ShippingMethodUnavailableError>>;
export async function placeOrder(token: CartToken, sessionId: string, expectedVersion: number): Promise<Result<PlacedOrder, CheckoutError | TotalsChangedError | PriceChangedError | InsufficientStockError | StaleWriteError>>;
// `placeOrder` takes NO idempotency key. 05 §3.6 issues it server-side into
// `checkout_sessions.idempotency_key` when the `payment` step is entered, and 05 §640 lists
// `idempotencyKey` among the fields a request body may never carry. A client-chosen key is
// not a weaker version of the same protection — it is an attack: `idx_orders_idempotency_key`
// is global, and `createOrderFromCart()` returns the *existing* order on conflict, so a
// browser that submits a key another browser already used is handed that order back.
// `shippingMethodId` is a `shipping_methods.id`, re-quoted server-side and rejected when it
// is not in the fresh result (05 §3.5) — the client never posts an amount and never posts a
// method code that was not just offered to it.

// src/lib/cms/index.ts
export async function getPageByPath(path: string, m: MarketCode, preview: boolean): Promise<CmsPageView | null>;
export async function getNavigation(key: string, m: MarketCode): Promise<NavTree>;
export async function listJournalPosts(input: { marketCode: MarketCode; tagSlug?: string; cursor?: string; limit?: number }): Promise<Page<JournalCard>>;
// `journal_posts.market_code` is NULLABLE and NULL means "all markets" (02 §2.8), so the
// predicate is `(market_code IS NULL OR market_code = $m)`, never an equality test — the
// equality test drops every global post from every market, which is all of them at launch.
export async function getJournalPost(slug: string, m: MarketCode): Promise<JournalPost | null>;
export async function createRedirect(from: string, to: string, source: RedirectSource, tx: Tx, actor: Actor): Promise<void>;  // cycle/chain repair, 02 §2.8
export async function resolveRedirect(path: string): Promise<{ to: string; status: 301 | 302 } | null>;
export async function saveVersion(entity: { type: ContentEntityType; id: string }, snapshot: unknown, actor: Actor, tx: Tx): Promise<string>;
export async function restoreVersion(versionId: string, actor: Actor): Promise<Result<void, StaleWriteError>>;

// src/lib/media/index.ts
export function buildDeliveryUrl(m: MediaRef, preset: DerivativePreset): string;   // pure; never stores a URL
export async function createUploadSignature(actor: Actor, input: { folderId?: string; filename: string; bytes: number }): Promise<Result<UploadSignature, IntegrationUnconfiguredError | ValidationError>>;
export async function registerUpload(actor: Actor, input: CloudinaryCallbackPayload): Promise<Media>;

// src/lib/search/index.ts
export interface SearchProvider {
  readonly key: string;
  searchProducts(input: SearchInput): Promise<Page<ProductCard> & { didYouMean?: string; redirectTo?: string; promoted: string[] }>;
  suggest(input: { q: string; marketCode: MarketCode; limit: number }): Promise<Suggestions>;
}
export function getSearchProvider(): SearchProvider;                 // SEARCH_PROVIDER env, 01 §4.8
export async function logSearch(input: LogSearchInput): Promise<void>;
export async function logSearchClick(input: { searchQueryId: string; productId: string }): Promise<void>;

// src/lib/seo/index.ts
export async function buildMetadata(target: SeoTarget, m: Market): Promise<Metadata>;  // Next Metadata
export async function buildJsonLd(target: SeoTarget, m: Market): Promise<JsonLdGraph>;
export function buildCanonical(path: string, m: Market): string;
export async function buildAlternates(target: SeoTarget, path: string): Promise<{ languages: Record<string, string>; canonical: string }>;
// `target`, not `path` alone, and the difference is the whole rule. §3.3 and §3.5 say an
// alternate is emitted only for a market where the entity is BOTH published and priced —
// `coalesce(product_market_content.is_published, true)` plus a live `prices` row. A path
// string cannot answer either question; it cannot even name the entity without re-parsing
// the route. Given the target, this is one batched query across `listActiveMarkets()` that
// returns the available-market set for that entity, not one lookup per market, and it is the
// same predicate 04 §6.1 defines once. A `path`-only signature would force either a silent
// "emit every market" (an alternate pointing at a 404, which Google discards along with the
// rest of the cluster) or an N+1 per market on every page.
export async function enumerateSitemap(shard: SitemapShard, cursor: string | null, limit: number): Promise<Page<SitemapEntry>>;
// Keyset, like everything else. The market is a component of `SitemapShard` (§2.2), not a
// separate parameter, because a shard belongs to exactly one market and a second argument
// is a second chance to disagree with the shard key.

// src/lib/analytics/index.ts
export async function record(input: RecordEventInput, tx?: Tx): Promise<void>;        // server truth
export async function ingestClientEvent(input: ClientEventInput, ctx: RequestContext): Promise<Result<void, ValidationError | RateLimitedError>>;
export function serverDispatchTargets(): AnalyticsTarget[];                            // Meta CAPI, GA4 MP
```

`Page<T>` is the one pagination shape in the codebase:

```ts
// src/types/page.ts
export type Page<T> = {
  items: T[];
  nextCursor: string | null;        // opaque, base64url; null ⇒ end of set
  totalEstimate: number | null;     // null unless the caller asked and the set is small enough (§2.3)
};
```

> **RESOLVED — was CHANGE REQUIRED IN 05 §3.6 (phase A step 5):** the call is
> *Verified applied in 05.*
> `quoteTax(input: TaxQuoteInput)`, not `computeTax(...)`. Three names for one call in
> three documents is what `11 §2.2`'s rejected-spelling table exists to close;
> `computeTax` is the rejected one.

> **RESOLVED — was CHANGE REQUIRED IN 01 §2.3:** `releaseStock` is declared there as
> *Verified applied in 01.*
> `releaseStock(tx, reservationId)` with nowhere to put `reservations.release_reason`.
> This document defers to 01 for that signature by reference, so the two-argument form
> propagates here by citation. 05 §1.6's three-argument form —
> `releaseStock(tx, reservationId, reason: 'expired' | 'cart_changed' | 'payment_failed' | 'admin')`,
> the reason **required, not defaulted** — is the one every call site in 04 §6.3, 05 §1.6
> and 05 §8.8 already passes, and is the one this document means.

### 1.4 Error taxonomy

`src/lib/errors.ts`. One base class, one string code per failure, a fixed HTTP
status, and a **copy key** — never a literal message, because customer-facing
strings are CMS-controlled (hard rule 1).

**This union was 29 codes and the domain documents throw twenty classes it did not
contain.** `03`, `04`, `05`, `06` and `07` each name error classes by type in their
own signatures — `RateStaleError`, `FormulaInvalidError`, `SkuConflictError`,
`CartConvertedError`, `PreviewTokenError`, `LastOwnerError` and fifteen more — and
`09 §2.5` makes it a test that "every typed error in 08 §1.4 maps to exactly one status
code and one stable machine-readable `code`". A class thrown by name with no row here is
that test failing on its first run. **The union is now 52 codes and `11 §2` is the
canonical copy**; this section reproduces it because it is the file an engineer writes
`src/lib/errors.ts` from, and any divergence between the two is a defect here.

```ts
export type ErrorCode =
  // input
  | 'VALIDATION_FAILED' | 'ATTRIBUTE_VALIDATION_FAILED' | 'NOT_FOUND'
  | 'SLUG_TAKEN' | 'DUPLICATE'
  // identity
  | 'UNAUTHENTICATED' | 'FORBIDDEN' | 'TOTP_REQUIRED' | 'SESSION_EXPIRED'
  | 'LAST_OWNER'
  // market
  | 'MARKET_NOT_FOUND' | 'MARKET_CHANGED' | 'PRODUCT_UNAVAILABLE_IN_MARKET'
  // concurrency and state
  | 'STALE_WRITE' | 'CONFLICT' | 'CONCURRENCY' | 'ILLEGAL_TRANSITION'
  | 'ILLEGAL_CHECKOUT_TRANSITION' | 'PREFLIGHT_REQUIRED'
  // catalogue
  | 'SKU_CONFLICT' | 'VARIANT_CONFLICT' | 'TOO_MANY_COMBINATIONS'
  // pricing
  | 'PRICE_CHANGED' | 'PRICE_UNAVAILABLE' | 'RATE_UNAVAILABLE' | 'RATE_STALE'
  | 'RATE_PROVIDER_ERROR' | 'FORMULA_INVALID' | 'MANUAL_OVERRIDE'
  | 'TOO_MANY_LINES' | 'RECALC_STALE'
  // commerce
  | 'INSUFFICIENT_STOCK' | 'LINE_UNAVAILABLE' | 'CART_EMPTY' | 'CART_CONVERTED'
  | 'COUPON_INVALID' | 'COUPON_UNAVAILABLE' | 'GIFT_CARD_INVALID'
  | 'GIFT_CARD_UNAVAILABLE' | 'TOTALS_CHANGED' | 'SHIPPING_UNAVAILABLE'
  | 'SHIPPING_METHOD_UNAVAILABLE' | 'TAX_UNAVAILABLE' | 'TAX_UNCONFIGURED'
  | 'DUTY_UNAVAILABLE' | 'OVER_REFUND' | 'PAYMENTS_UNCONFIGURED'
  // content
  | 'PREVIEW_TOKEN_INVALID'
  // environment
  | 'RATE_LIMITED' | 'INTEGRATION_UNCONFIGURED' | 'PROVIDER_ERROR' | 'INTERNAL';

export const ERROR_CODES: readonly ErrorCode[] = Object.freeze([ /* the 52 above */ ]);

export abstract class AppError extends Error {
  abstract readonly code: ErrorCode;
  abstract readonly httpStatus: number;
  abstract readonly copyKey: string;          // `copy.error.` + lower_snake(code)
  readonly retryable: boolean = false;
  readonly fields?: Record<string, string[]>; // VALIDATION_FAILED family only
  readonly context: Record<string, unknown> = {};  // logged, NEVER serialised to a client
}
```

**Every class extends `AppError` directly, and there is exactly one base.** Domain files
(`src/lib/pricing/errors.ts`, `src/lib/cms/errors.ts`, `src/lib/checkout/errors.ts`, …)
re-export their own classes from it; there is no second base and no second `ErrorCode`
union.

**`PricingError`, `CheckoutError` and `RefundError` are type aliases over a union of
these classes — not classes.** They appear as return types in `04 §1.5`, `01 §2.3` and
`05 §9.4` and reading them as base classes is how a second taxonomy starts: the first
`class CheckoutError extends AppError` gives `placeOrder()` a failure with no `code`, no
`httpStatus` and no `copyKey`, which `_wrap.ts` then maps to `INTERNAL`.

```ts
export type PricingError  = PriceUnavailableError | MarketNotFoundError | RateUnavailableError
                          | RateStaleError | FormulaInvalidError | ConflictError
                          | PriceChangedError | TooManyLinesError | CouponInvalidError
                          | ManualOverrideError | RecalcStaleError | ForbiddenError;   // 04 §1.5
export type CheckoutError = CartEmptyError | CartConvertedError | MarketChangedError
                          | PriceChangedError | TotalsChangedError | InsufficientStockError
                          | IllegalCheckoutTransitionError | PaymentsUnconfiguredError
                          | ShippingUnavailableError | ShippingMethodUnavailableError
                          | TaxUnavailableError | TaxUnconfiguredError | StaleWriteError;  // 01 §2.3
export type RefundError   = OverRefundError | IllegalTransitionError | ProviderError
                          | ForbiddenError | TotpRequiredError;                        // 05 §9.4
```

`CheckoutError` in `startCheckout()` and `placeOrder()`'s signatures above therefore
expands to thirteen concrete classes, every one of which has a designed panel.

| Class | Code | HTTP | Result or throw | `context` logged | From |
| --- | --- | ---: | --- | --- | --- |
| `ValidationError` | `VALIDATION_FAILED` | 400 | **Result** at UI boundaries, **throw** at trusted ones | Zod issue paths, never values | 08 |
| `AttributeValidationError` | `ATTRIBUTE_VALIDATION_FAILED` | 422 | Result | attribute id, data type, rejected shape | 03 §3.4 |
| `NotFoundError` | `NOT_FOUND` | 404 | throw → `notFound()` | entity, id/slug, market | 08 |
| `SlugTakenError` | `SLUG_TAKEN` | 409 | Result | requested slug, owning entity id | 08 |
| `DuplicateError` | `DUPLICATE` | 409 | Result | entity, conflicting key | 08 |
| `UnauthenticatedError` | `UNAUTHENTICATED` | 401 | throw | route, session id | 08 |
| `ForbiddenError` | `FORBIDDEN` | 403 | throw | actor id, permission key, entity | 08 |
| `TotpRequiredError` | `TOTP_REQUIRED` | 403 | throw | user id | 07 §1.9 |
| `SessionExpiredError` | `SESSION_EXPIRED` | 401 | throw | session id, expiry | 08 |
| `LastOwnerError` | `LAST_OWNER` | 409 | Result | user id, role id | 07 §2.6 |
| `MarketNotFoundError` | `MARKET_NOT_FOUND` | 404 | throw → `notFound()` | requested segment | 08 |
| `MarketChangedError` | `MARKET_CHANGED` | 409 | **Result** | cart id, from, to | 08 |
| `ProductUnavailableInMarketError` | `PRODUCT_UNAVAILABLE_IN_MARKET` | 409 | Result | product id, market | 08 |
| `StaleWriteError` | `STALE_WRITE` | 409 | **Result** | entity, id, expected/actual `version` | 08 |
| `ConflictError` | `CONFLICT` | 409 | **Result** | entity, id, the competing writer | 04 §1.5, 06 §2.2 |
| `ConcurrencyError` | `CONCURRENCY` | 409 | Result | SQLSTATE, attempts | 08 |
| `IllegalTransitionError` | `ILLEGAL_TRANSITION` | 409 | Result | order id, from, to | 08 |
| `IllegalCheckoutTransitionError` | `ILLEGAL_CHECKOUT_TRANSITION` | 409 | **Result** | session id, from step, to step | 05 §3.2 |
| `PreflightRequired` | `PREFLIGHT_REQUIRED` | 409 | **Result** | entity, the preflight that has not run | 06 §5.4 |
| `SkuConflictError` | `SKU_CONFLICT` | 409 | Result | sku, owning variant id | 03 §2.2 |
| `VariantConflictError` | `VARIANT_CONFLICT` | 409 | Result | product id, `option_signature` | 03 §2.2 |
| `TooManyCombinationsError` | `TOO_MANY_COMBINATIONS` | 422 | Result | product id, requested count, cap | 03 §2.2 |
| `PriceChangedError` | `PRICE_CHANGED` | 409 | **Result** | line ids, old/new `unit_final_minor` | 08 |
| `PriceUnavailableError` | `PRICE_UNAVAILABLE` | 422 | Result | variant id, market | 08 |
| `RateUnavailableError` | `RATE_UNAVAILABLE` | 422 | Result | material id, currency | 04 §1.5 |
| `RateStaleError` | `RATE_STALE` | 422 | Result | `metal_rates.id`, age, `PRICING_RATE_MAX_AGE_HOURS` | 04 §1.5 |
| `RateProviderError` | `RATE_PROVIDER_ERROR` | 502 | Result | provider, HTTP status | 04 §3.2 |
| `FormulaInvalidError` | `FORMULA_INVALID` | 422 | Result | formula version id, market, missing term | 04 §1.5 |
| `ManualOverrideError` | `MANUAL_OVERRIDE` | 409 | Result | price id, market | 04 §1.5 |
| `TooManyLinesError` | `TOO_MANY_LINES` | 422 | Result | requested line count, cap | 04 §1.5 |
| `RecalcStaleError` | `RECALC_STALE` | 409 | Result | `recalc_run_id`, `inputs_digest` expected vs actual | 04 §1.5 |
| `InsufficientStockError` | `INSUFFICIENT_STOCK` | 409 | **Result** | variant ids, requested, available, location ids | 08 |
| `LineUnavailableError` | `LINE_UNAVAILABLE` | 409 | **Result** | cart item id, variant id, reason | 05 §2.4 |
| `CartEmptyError` | `CART_EMPTY` | 409 | Result | cart id | 08 |
| `CartConvertedError` | `CART_CONVERTED` | 409 | **Result** | cart id, `converted_order_id` | 05 §3.6 |
| `CouponInvalidError` | `COUPON_INVALID` | 422 | Result | code, failing `coupon_conditions.id`, market | 08 |
| `CouponUnavailableError` | `COUPON_UNAVAILABLE` | 409 | **Result** | coupon id, cap, `redemption_count` | 05 §8.5 |
| `GiftCardInvalidError` | `GIFT_CARD_INVALID` | 422 | Result | card id (never the code), market, reason | 08 |
| `GiftCardUnavailableError` | `GIFT_CARD_UNAVAILABLE` | 409 | **Result** | card id, balance at quote vs at redemption | 05 §8.7 |
| `TotalsChangedError` | `TOTALS_CHANGED` | 409 | **Result** | session id, stored vs recomputed shipping/tax/total | 08 |
| `ShippingUnavailableError` | `SHIPPING_UNAVAILABLE` | 422 | Result | destination country/region, market | 08 |
| `ShippingMethodUnavailableError` | `SHIPPING_METHOD_UNAVAILABLE` | 409 | **Result** | session id, submitted `shipping_methods.id`, ids in the fresh quote | 08 |
| `TaxUnavailableError` | `TAX_UNAVAILABLE` | 422 | Result | provider, market, destination | 08 |
| `TaxUnconfiguredError` | `TAX_UNCONFIGURED` | **503** | **Result** | market, `tax_mode`, registration count | 09 P22(e) |
| `DutyUnavailableError` | `DUTY_UNAVAILABLE` | 422 | Result | provider, destination, `markets.incoterm` | 04 §8.4 |
| `OverRefundError` | `OVER_REFUND` | 409 | Result | payment id, captured, already refunded, requested | 08 |
| `PaymentsUnconfiguredError` | `PAYMENTS_UNCONFIGURED` | **503** | **Result** | market, provider key, `missingKeys[]` | 05 §3.6 |
| `PreviewTokenError` | `PREVIEW_TOKEN_INVALID` | 404 | throw → `notFound()` | token id, reason (expired / revoked / views exhausted) | 06 §4.4 |
| `RateLimitedError` | `RATE_LIMITED` | 429 | throw (route) / Result (action) | `rate_limits.key`, window, retry-after | 08 |
| `IntegrationUnconfiguredError` | `INTEGRATION_UNCONFIGURED` | 503 | **Result** | integration key, `missingKeys[]` | 08 |
| `ProviderError` | `PROVIDER_ERROR` | 502 | throw | provider, provider error code, request id | 08 |
| `InternalError` | `INTERNAL` | 500 | throw | cause, stack | 08 |

**Four pairs that look redundant and are not.** Collapsing any of them loses a
distinction a screen depends on:

- **`TAX_UNAVAILABLE` (422) vs `TAX_UNCONFIGURED` (503).** The first is "the provider
  was reached and cannot quote this destination" — a recoverable address problem the
  delivery step explains. The second is "there is no tax configuration at all", and it
  **fails closed** rather than quoting zero, because a market silently charging no tax
  is discovered at audit and not by anyone who could have fixed it. `09 P22(e)` makes it
  a launch blocker and it is satisfiable only as a distinct code.
- **`COUPON_INVALID` (422) vs `COUPON_UNAVAILABLE` (409)**, and the gift-card pair.
  `_INVALID` is "this code does not apply to this bag in this market", raised by
  `evaluateDiscounts()` at read time; `_UNAVAILABLE` is "the conditional `UPDATE` in the
  order transaction affected zero rows" — the cap was exhausted or the balance moved
  between the quote and the redemption. The first re-renders the bag; the second stops
  `placeOrder` **after stock is already reserved**, which is a different screen and a
  different recovery.
- **`INTEGRATION_UNCONFIGURED` vs `PAYMENTS_UNCONFIGURED`.** The generic code covers
  Cloudinary, Resend and the analytics vendors; the specific one is the checkout's
  blocking panel (§4.4) and is the only 503 a shopper is ever shown on a money screen.
- **`STALE_WRITE` vs `CONFLICT`.** `STALE_WRITE` carries an `expectedVersion` that lost;
  `CONFLICT` is a write that cannot be reconciled by reloading — a formula version moved
  under a recalc, a page published while a builder op was in flight.

**Copy keys are derived, never typed.** `copyKey` is
`'copy.error.' + code.toLowerCase()`, every one has a `settings` row with
`group_key = 'copy_errors'` seeded in `prisma/seed/06-settings.ts`, and
`tests/api/error-taxonomy.test.ts` asserts the derivation, the uniqueness of each
`code`, and that every `ErrorCode` has exactly one class.

**The fork: `Result` everywhere, or exceptions everywhere.** A uniform `Result<T,
AppError>` is honest about every failure but makes every call site handle
"you are not allowed", which callers then stop reading. Uniform exceptions are
terse but let a designed UI state (out of stock, price moved) escape as a 500.

**Decision: expected outcomes are `Result`, unexpected ones throw.** The test is
whether the UI has a designed state for it. Out of stock, price changed, coupon
rejected, stale write, unconfigured integration — all have a designed panel, so
they are values a caller is forced by the type system to handle. Forbidden,
unauthenticated, not found, provider failure and internal errors have no designed
state on the calling screen; they abort rendering, and a throw is the only thing a
caller cannot ignore. `Result` is the two-case union in `src/lib/result.ts`:

```ts
export type Result<T, E extends AppError = AppError> =
  | { ok: true; value: T }
  | { ok: false; error: E };
export function ok<T>(value: T): Result<T, never>;
export function err<E extends AppError>(error: E): Result<never, E>;
export function unwrapOrThrow<T>(r: Result<T, AppError>): T;   // banned in src/app/** by lint
```

### 1.5 Crossing the boundary

**Server action → UI.** Every action returns the same discriminated shape. It
never returns an `AppError` instance (class instances do not survive the RSC
serialisation boundary intact) and never returns `context`.

```ts
// src/types/action-result.ts
export type ActionResult<T> =
  | { status: 'ok'; data: T }
  | { status: 'error'; code: ErrorCode; message: string;        // already-resolved copy
      fields?: Record<string, string[]>; requestId: string; retryAfterSeconds?: number };
```

`src/server/actions/_wrap.ts` exports `action(schema, handler)`, which is the only
way an action is written. It parses, runs, catches, maps and logs:

1. Zod parse → on failure, `{ status: 'error', code: 'VALIDATION_FAILED', fields }`.
   Field messages come from the schema and are safe to show.
2. Run the handler. A returned `err(e)` is mapped by code. A thrown `AppError` is
   mapped by code. Anything else becomes `InternalError`.
3. `logger.error({ requestId, code, actorId, context })` and, for HTTP ≥ 500 and
   for `PROVIDER_ERROR`, `Sentry.captureException(e, { tags: { code }, extra: context })`.
4. `message` is resolved from `settings` where `key = e.copyKey` — the key already
   carries its `copy.error.` prefix (§1.4), and concatenating it a second time is how a
   fallback becomes permanent —
   falling back to the constant in `src/lib/config/constants.ts#DEFAULT_ERROR_COPY`
   when the settings read fails — the error path must not itself depend on the
   database being reachable.

**Route handler → client.** Same mapping, JSON envelope (§2.3), `requestId` echoed
in the `x-request-id` response header (set by middleware).

**RSC page → user.** A thrown `NotFoundError` is converted by the page shell to
`notFound()`; anything else reaches `error.tsx`. `global-error.tsx` renders from
constants only — no DB, no Cloudinary, no fonts fetched at runtime.

**What the customer sees versus what is logged.** The rule: the customer gets the
code, one sentence, and a `requestId`; the log gets everything else. Never a SQL
string, a provider error body, an internal id, a stack, an amount from another
customer's session, or the name of a table.

| Situation | Customer sees | Logged / Sentry |
| --- | --- | --- |
| One-of-a-kind piece lost to another buyer | "This piece has just been taken. It has been removed from your bag." + the bag re-rendered | `INSUFFICIENT_STOCK`, variant id, reservation ids, both cart ids, location id |
| Price moved between bag and checkout | "Prices have been updated. Please review your bag before continuing." + a per-line before/after | `PRICE_CHANGED`, line ids, old and new `unit_final_minor`, `price_record_id` |
| Shipping or tax moved between the delivery step and Place Order | "Your delivery or tax total has changed. Please review the order summary." + the new summary | `TOTALS_CHANGED`, session id, stored vs recomputed shipping/tax/total (05 §3.6 step 5b) |
| Market switched with a live cart | "Your bag has been repriced for India (₹)." + the list of dropped variants | `MARKET_CHANGED`, cart id, dropped variant ids |
| Acquirer unconfigured for the market | "Online payment is not yet available for this region. No order has been created." | `INTEGRATION_UNCONFIGURED` + `missingKeys[]`; admin Integrations page shows the same keys |
| Stripe 500 at intent creation | "We could not reach the payment provider. Your bag is unchanged and nothing has been charged." | `PROVIDER_ERROR`, Stripe request id, HTTP status, raw body |
| Two staff editing one product | "Someone else changed this while you were editing. Reload to see their version." + a diff | `STALE_WRITE`, entity, expected vs actual `version`, both actor ids |
| Anything unmapped | "Something went wrong on our side. Reference {requestId}." | `INTERNAL`, full stack, request context |

> **NEEDS INPUT:** client sign-off on the final wording of every `copy.error.*`
> string. The defaults above are seeded into `settings` with
> `group_key = 'copy_errors'` and are editable at `/admin/settings/general`; they
> assert no fact about the business, only about the request.

---

## 2. API surface

### 2.1 What goes where

**The principle, in one line: the caller decides.** A human navigating to a URL
gets a server component; a human acting inside our UI gets a server action; a
machine — a provider, a crawler, a cron scheduler, or our own already-hydrated
JavaScript — gets a route handler.

| Kind | Use it when | Never use it for |
| --- | --- | --- |
| **Server component** | The data is part of the HTML of a URL. Catalogue reads, PDP, CMS pages, account pages, admin lists. | Anything that mutates; anything that must not be in a cached HTML object (01 §1.3) |
| **Server action** | A human in our own UI causes a state change: add to bag, apply coupon, place order, save a product, publish a page, refund. Also for a *read* that only makes sense as the response to such a mutation (the re-rendered cart). | A read a client component polls; a caller we do not control; anything needing a raw body, a custom content type, streaming, or a response header |
| **Route handler** | (a) a non-human caller — provider webhook, Vercel cron, crawler, feed consumer; (b) a machine-readable representation that must have its own URL — sitemap, RSS, product feed, OG image; (c) a read our *client* code needs after hydration — cart badge, typeahead, availability, job progress; (d) a payload a server action cannot carry — a 25 MB CSV upload, a streamed CSV download, an SSE stream | Any mutation reachable by `GET`. Any business logic. |

Why (c) is not a server action: server actions are POSTs that queue on the Next
router and invalidate the router cache on completion. A typeahead firing on every
keystroke through that path serialises behind the user's navigation and re-renders
the tree on each response. A `GET` route handler with `no-store` does not.

### 2.2 Route handler inventory

Auth column values: `public` (rate-limited only), `cart` (valid `md_cart` token
cookie), `customer` (customer session), `staff:<permission>` (staff session +
`requirePermission`), `signature` (provider HMAC), `cron` (`CRON_SECRET` **and**
`x-vercel-cron`), `secret` (`REVALIDATE_SECRET`), and `any(<a>, <b>, …)` — the one
combinator, defined below.

**`any` — the only combinator, and exactly two routes use it.** Two routes in this
table are legitimately satisfiable by either of two credentials, and `RouteAuth` was a
closed union with no way to say so, which produced the worst available workaround: two
manifest rows for one route file, which is precisely the shape
`tests/unit/routes-authorized.test.ts` fails on ("a manifest row with no route file").
One member is added and no more:

```ts
// src/lib/security/route-manifest.ts — the eighth member of RouteAuth (07 §3.4)
| { kind: 'any'; options: RouteAuth[] }
```

- Satisfied when **any** option is satisfied, evaluated in **array order**, first match
  wins. `withRoute` hands the handler the index of the option that was satisfied, so a
  route whose response body differs by credential branches on a number rather than
  re-deriving the actor's kind.
- On total failure it reports the **last** option's error. The order is therefore
  most-specific-first, so an unauthenticated caller to a cron-or-staff route gets the
  staff `401`, not a confusing cron `403`.
- The union stays exhaustive: no `default`, no `undefined` branch, and `any` may not
  nest `any`.
- **Every route file still keeps exactly one manifest row.** That is the rule `any`
  exists to preserve, not an exception to it.

> **DECISION CHANGED:** this table previously carried two `/api/health` rows — one
> `public`, one `cron` or `staff:integration.manage` — for one route file. They are now
> one row with an `any` auth.

> **RESOLVED — was CHANGE REQUIRED IN 07 §3.4:**
> *Applied. The change now lives in 07 §3.4 — RouteAuth gains { kind: 'any'; options }.*
> `RouteAuth` gains the `{ kind: 'any'; options:
> RouteAuth[] }` member above, with the evaluation order, the satisfied-index handback
> and the last-option-error rule. 07 owns the union and currently closes it at seven
> members, which makes the two rows below unwritable.

**This table is not documentation of an intention; it is the source of a checked
artifact.** Every `route.ts` under `src/app/api/**` is wrapped in `withRoute({ auth, rateLimit,
handler })` from `src/lib/security/with-route.ts` (07 §3.4), whose `auth` field has no default
and no `undefined` branch — a route handler that does not decide does not compile. The
`RouteAuth` union's members are exactly the Auth column values above, and
`tests/unit/routes-authorized.test.ts` fails on a route file with no manifest row, a manifest
row with no route file, or a manifest row whose `auth` disagrees with this table. Without that
binding, an Auth column is a comment, and the first handler someone adds by copying a public
one inherits `public` silently.

#### Storefront reads

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/catalog/typeahead?q=&market=&limit=` | public | Predictive search: up to 6 products, 3 categories, 3 stones, 3 collections. `no-store`, 30 req/min/IP. |
| `GET` | `/api/catalog/facets?scope=&id=&market=&<filters>` | public | Facet counts for the filter rail after a client-side filter change. `no-store`. |
| `GET` | `/api/catalog/availability?variantIds=&market=` | public | `getAvailability()` band per variant. `no-store`. Max 50 ids. Returns a band, never a number — exposing exact stock on a one-of-a-kind catalogue is competitive intelligence. |
| `GET` | `/api/catalog/products?market=&<filters>&sort=&cursor=&limit=` | public | Infinite-scroll page 2+ of a PLP or collection. Page 1 is server-rendered. **`Cache-Control: public, s-maxage=60, stale-while-revalidate=300` with `Vary: Accept-Encoding` and the market in the query string — never `private`, never unset.** The body carries `Money` amounts for one market; an unset directive lets a shared cache choose, and the choice that hurts is the one that keys on path and drops the query string. The response is anonymous by construction (`ProductCard` prices come from `getDisplayPrice()`, which takes no `customerId` and no `couponCode` — 01 §2.3), which is the only reason a shared cache is permissible here at all. |
| `GET` | `/api/catalog/redirects?cursor=&limit=` | public | The active `redirects` snapshot for the edge map (01 §2.1). Tagged `redirects`, `revalidate: 60`. **A full snapshot, paged — never a `?since=` delta.** A delta feed can only carry rows that appeared or changed; `createRedirect()` **hard-deletes** the reverse edge during a cycle break (02 §2.8), so a deleted or deactivated row produces no delta record at all, and every warm edge isolate keeps serving a redirect the merchandiser removed — indefinitely, because `loadedAt` keeps refreshing successfully. The loader therefore builds a **new** `Map` by paging to `nextCursor === null` and swaps it in atomically; a page that fails mid-walk discards the partial map and keeps the previous one (fail-open, 01 §2.1). `limit` default 5,000, max 5,000. Rate limited `redirects-snapshot:ip:<ip64>` 20/min, **fail-open** — the whole point of the snapshot is that a failed refresh serves the previous map (01 §2.1), so a limiter that could block it would be worse than the flood it prevents. The limit exists because this route publishes the complete URL inventory of the migrated site, 5,000 rows at a time, to anyone who asks; that is not a secret, but it is not something to serve unbounded either. |
| `GET` | `/api/search?q=&market=&<filters>&cursor=` | public | Full search results page 2+. `no-store` — a search result set is per-query, has zero SEO value (§3.4) and must not sit in a shared cache keyed on a stranger's text. Does **not** re-log to `search_queries`; only the first page does. |
| `POST` | `/api/search/click` | public | `sendBeacon` from a result click → `search_queries.clicked_product_id`. Body `{searchQueryId, productId}` and nothing else, `.strict()`. 204. The write is `UPDATE search_queries SET clicked_product_id = $2 WHERE id = $1 AND session_id = $3 AND clicked_product_id IS NULL` — **scoped to the caller's own `session_id` and first-write-wins**. `$3` is read server-side from the `md_sid` cookie (`HttpOnly`, `SameSite=Lax`, the same anonymous session id `analytics_events.session_id` and `search_queries.session_id` carry), **never from the body**: a session id that arrives in a payload is a value the caller chose, and "scoped to the caller's own session" would then mean "scoped to whatever session the caller names", which is no scope at all. Without both predicates this is an unauthenticated write to any row in the table by id, and the click-through half of the relevance report in §6.5 is forgeable by anyone who can guess a UUIDv7. Zero rows affected is still a `204`: a re-click is not an error. Rate limited on **two** keys, `search-click:session:<sid>` 60/min and `search-click:ip:<ip64>` 300/min — the session key alone is useless, because the cookie is client-held and rotating it mints a fresh bucket (§2.3). |
| `POST` | `/api/catalog/redirect-hit` | public | `sendBeacon` from the middleware's redirect path → one upsert into `redirect_hits` (§3.6). Body `{id}` and nothing else, `.strict()`. `204`, including for an unknown id — a stale edge snapshot pointing at a deleted redirect must not produce a 500 in a beacon. Rate limited `redirect-hit:ip:<ip64>` 60/min. **This route is described at length in §3.6 and was missing from this table**, which is one of the five rows `tests/unit/routes-authorized.test.ts` fails on. |
| `POST` | `/api/catalog/notify-me` | public | The out-of-stock PDP's "Notify me when this returns" (§4.4, 15 §5). Body `{productId, variantId?, marketCode, email, source}` and nothing else, `.strict()`; calls `inventory.registerBackInStockRequest()`, which writes one `back_in_stock_requests` row and **never** a `newsletter_subscribers` row. `204` for both a new registration and a duplicate — `idx_bisr_pending` makes a double submit a no-op, and distinguishing the two answers would turn the endpoint into an oracle for "has this address already asked about this piece". The newsletter tick beside it is a **separate** field that calls `setMarketingConsent(source: 'back_in_stock_form')`; one action is never recorded as two consents. Rate limited on **two** keys, `bisr:ip:<ip64>` 10/hour **and** `bisr:email:<email>` 5/24 hours, both **fail-closed**: this route sends mail to an address the caller supplies, which puts it in the credential-and-money class, not the telemetry class. |
| `GET` | `/api/account/summary` | customer | Post-hydration personalisation: display name, wishlist count, open order count. `no-store`. |
| `POST` | `/api/analytics/[market]/collect` | public | The client-only interaction events of §7.2 — `product_list_viewed`, `product_selected`, `cart_viewed`, `checkout_step_completed`. `204`. Rejects outright (`400`, never a silent strip) any body containing `revenue_minor`, `currency_code`, `order_id`, `market_code` or `customer_id`. **The market is the path segment, validated against `listActiveMarkets()`** — it is not in the body and not inferred from `Referer`, which is client-controlled anyway. Rate limited on **two** keys, `analytics:session:<sid>` 120/min **and `analytics:ip:<ip64>` 600/min**: `sid` is a value the browser sends, so a limiter keyed only on it is bypassed by regenerating it per request, and the endpoint that must never be floodable is the one writing rows to `analytics_events`. |

#### Cart and wishlist

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/cart` | cart | Header badge and drawer hydration. `no-store`. Returns `CartView` with all amounts as `Money`, plus the cart's own `marketCode` / `currencyCode` read from `carts` (never from a parameter — §1.3). It carries **no** `carts.email`, `carts.note`, customer name or address: the cart token is a bearer capability that survives in a cookie jar, and the header badge has no use for the abandoned-cart email address captured at checkout step 1. |
| `GET` | `/api/wishlist/summary` | customer | Header badge count. `no-store`. |

**Three public pages carry a bearer token in the path, and they are declared in the same
manifest.** They are pages, not route handlers, so `withRoute()` does not wrap them — but
the thing the manifest exists to make non-optional is *the auth decision*, and these are
the three surfaces in the product where possessing a URL is the whole credential. Each
gets a manifest row with `kind: 'page'`, and `tests/unit/routes-authorized.test.ts` asserts
that each has one and that the page's **first statement** is its `*ByToken` service call,
so the token is resolved before anything is read.

| Path | Auth | Notes |
| --- | --- | --- |
| `/orders/[token]` | public + `orders.public_token_hash` | `no-store`, `force-dynamic`, `noindex`. `order-token:ip:<ip64>` 20/hour, fail-closed |
| `/wishlist/shared/[token]` | public + `wishlists.share_token_hash` **and** `is_public` | `no-store`, `force-dynamic`, `noindex`. Returns `PublicWishlistView` (§1.3) — never the owner's name, email, `customer_id` or `wishlist_items.note`. A revoked, rotated-away, malformed or never-existing token all render the same `notFound()`. Rate limited **`wishlist-share:ip:<ip64>` 60/hour, fail-closed** |
| `/unsubscribe/[token]` | public + the `jose` subscriber token | `no-store`, `noindex`. No session, deliberately (07 §4.2) |

> **DECISION CHANGED:** `/wishlist/shared/[token]`'s rate-limit key was
> `share-wishlist:ip:<ip64>` at 30/min in 07 §4.2. The canonical key is
> **`wishlist-share:ip:<ip64>` at 60 per hour, fail-closed**, and it is the row 11 §4.2
> carries. A 30/min budget on a token-guessing surface over somebody's personal data is
> 43,200 guesses a day from one address; 60/hour is the order-token pattern this route
> was always supposed to follow.

All cart and wishlist **mutations** are server actions in
`src/server/actions/cart.ts` and `src/server/actions/wishlist.ts`:
`addItemAction`, `updateQuantityAction`, `removeItemAction`, `applyCouponAction`,
`removeCouponAction`, `switchMarketAction`, `addToWishlistAction`,
`removeFromWishlistAction`, `syncGuestWishlistAction`. There is deliberately no
`POST /api/cart`: a second write path to the cart is a second place for the
market/currency invariant (02 §2.7) to be got wrong.

#### Checkout and payment

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/checkout/shipping-quote` | cart | Re-quote on address change. Debounced from the client; a server action here would queue behind navigation. **Body is `{ destination: AddressInput }` and nothing else** — the Zod schema is `.strict()`, so a body carrying `lines`, `subtotal`, `currencyCode` or any `*Minor` key is a `400` before anything is read. The handler calls `checkout.quoteShippingForSession(token, sessionId, destination)` (§1.3) with `token` from the `md_cart` cookie and `sessionId` from the session the cart owns (`uq_checkout_sessions_cart`), **neither from the body**; the bag and its subtotal come from `carts` + `resolvePriceBatch` inside that call. A handler that forwarded a client subtotal into `shipping.quoteShipping` would let anyone clear the free-shipping threshold with one edited request. Response is `ShippingQuote[]`. Never returns a chosen method — choosing is `setShippingMethodAction`. |
| `GET` | `/api/checkout/status/[orderId]` | `any(cart, customer)` | The post-redirect poll (01 §2.5, 05 §4.2). The predicate is 07 §4.2 verbatim: `WHERE o.id = $1 AND (o.customer_id = $2 OR EXISTS (SELECT 1 FROM carts c WHERE c.converted_order_id = o.id AND c.token_hash = sha256($3)))`. Returns `{status, paymentStatus, orderNumber, redirectTo}` and nothing else — no totals, no addresses, no email. `no-store`. **Polled every 2s for 90s** from `/checkout/processing`, then the "we are still confirming" panel (05 §4.2 fixes the window; a 180s poll is a different number in two documents describing one screen). Rate limited `checkout-status:ip:<ip64>` 120/min, fail-closed — without it the route is a free oracle for probing order ids, and the ownership predicate turns a hit and a miss into two distinguishable latencies over enough attempts. **The auth is the `any` form** because a guest holds a cart token and a signed-in shopper holds a session and either is sufficient; the options are ordered `[cart, customer]`, so a caller holding neither gets the customer `UNAUTHENTICATED` rather than a cart-token `403`. The satisfied index selects nothing in the response — the SQL predicate above already ORs the two — so this route reads the index and discards it. |
| `POST` | `/api/checkout/provider-authorization` | cart | Razorpay's browser `handler(response)` posts `{razorpay_order_id, razorpay_payment_id, razorpay_signature}` here (05 §4.2). The signature **is** verified server-side, and the only effect is a `payment_events` row with `type = 'authorized'`: it is a hint that lets the status poll resolve sooner, never a payment status. It may not write `payment_status`, may not call `transitionOrder()`, and may not commit stock. `tests/e2e/checkout-in.spec.ts` asserts that this call with no webhook leaves the order `pending_payment`. |

Intent creation, coupon application and order placement are server actions
(`placeOrderAction`), not endpoints. **No idempotency key is submitted**: it is minted
server-side into `checkout_sessions.idempotency_key` when the `payment` step is entered
(05 §3.6), and `idempotencyKey` is on the always-refused field list (05 §640). See §2.3.

#### Webhooks

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/webhooks/stripe` | signature | `constructEvent(rawBody, sig, STRIPE_WEBHOOK_SECRET)`. Insert-first into `webhook_events` `ON CONFLICT (provider, provider_event_id) DO NOTHING`; zero rows ⇒ `200 {duplicate:true}` with no effects. Handles `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.closed`. |
| `POST` | `/api/webhooks/razorpay` | signature | `x-razorpay-signature` HMAC-SHA256 over the raw body with `RAZORPAY_WEBHOOK_SECRET`. Same insert-first dedupe. Handles `payment.captured`, `payment.failed`, `refund.processed`, `refund.failed`. |

Both: `runtime = 'nodejs'`, raw body via `await req.text()` before any parse,
excluded from the middleware matcher (01 §1.3), `maxDuration: 60`. Every handler
returns `200` for a signature-valid event it does not care about, writing
`webhook_events.status = 'ignored'` — a `400` on an unknown type makes the
provider retry forever. A signature-invalid request writes a row with
`signature_valid = false` and returns `400`.

#### Admin operations

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/media/sign` | `staff:media.create` | Signed Cloudinary upload params. `503` with `missingKeys[]` when Cloudinary is `unconfigured` (01 §4.9). Rate limited `media-sign:user:<userId>` 60/hour. |
| `POST` | `/api/media/callback` | `staff:media.create` | The browser posts Cloudinary's upload response here and the handler calls **`registerUpload(actor, input: CloudinaryCallbackPayload)`** (§1.3). **Canonical name and canonical path** (`11 §10.9`): `06 §7.1` calls the function `confirmUpload()`, `09 P06` builds the route, and `07 §5.9` names the function without a path — one route under three names, now one. The payload is re-verified against the signature this server minted; a browser-supplied `public_id`, `bytes` or `format` that does not match what was signed is a `400`, because the callback is a client request and the signed params are the server's record of what it authorised. |
| `POST` | `/api/media/svg` | `staff:media.upload_vector` | Vector upload (06 §7.1). `image/svg+xml` only, **256 KB body cap**, sanitised server-side before it reaches Cloudinary. Rate limited `media-sign:user:<userId>` alongside `/api/media/sign` — one budget for both, because they are the same capability. |
| `GET` | `/api/admin/cms/pages/[id]/heartbeat` | `staff:cms.read` | The builder's "someone else is editing this page" presence ping (06 §6.4). Rate limited `cms-heartbeat:session:<sid>` 10/min, fail-open. Returns the other editors' display names and nothing else — never their email. |
| `POST` | `/api/admin/import/upload` | `staff:import.run`, **plus `staff:customer.export` when `resource = 'customers'`** | Multipart CSV up to `MEDIA_MAX_UPLOAD_MB`. Streams to a Cloudinary raw asset uploaded with `type: 'authenticated'` and `access_mode: 'authenticated'`, creates an `import_jobs` row with `is_dry_run = true`, returns the job id. Parsing happens in `run-jobs`, never in the request. **The access mode is the whole point of the row:** a customer or order CSV is a bulk PII file, and Cloudinary's default `upload` type serves it to anyone who learns the `public_id` — a URL that appears in a job record, a log line and a Sentry breadcrumb. The asset is reachable only through a signed, time-limited delivery URL minted server-side, and `run-jobs` deletes it when the import job reaches a terminal status. |
| `GET` | `/api/admin/export/[jobId]` | `staff:export.run`, **plus `staff:customer.export` for any export whose resource contains customer PII** (`customers`, `orders`, `returns` — 07 §2.3) | Streams the finished export as `text/csv` with `Content-Disposition: attachment`. A server action cannot stream a file. "Job ownership" is a `WHERE` clause, not a check after the read (07 §4.1): `WHERE j.id = $1 AND j.created_by_user_id = $2`, zero rows ⇒ `NotFoundError`. There is no "download anyone's export" key in 07 §2.3, and none is invented here — a staff member who needs a colleague's export re-runs it, which also puts their own name on the `audit_logs` row for the PII they pulled. The route **proxies** the bytes; the Cloudinary asset backing the export is `type: 'authenticated'` and its delivery URL is never handed to the browser, because a signed CDN URL outlives the session that minted it. |
| `GET` | `/api/admin/jobs/[id]/stream` | `staff:job.read` | SSE of `jobs.progress_current` / `progress_total` for import apply, export, bulk edit and recalc apply. Closes on a terminal `jobs.status`. |
| `GET` | `/api/admin/search?q=&limit=` | `staff:dashboard.view` | The ⌘K command palette's data route (13 §6.1). `no-store`. Returns results **grouped** — orders, products, customers, collections, stones, pages, journal — and **each group is queried only when the actor holds that group's permission** (13 §6.4): `order.read` (the email path additionally `customer.read`), `product.read`, `customer.read`, `product.read`, `product.read`, `cms.read`, `cms.read`. The filtering is at the query, never at the render: an `analyst` typing an email address issues **zero** statements against `customers`, which is what `tests/integration/admin-search-permission-filter.test.ts` asserts per role. `limit` ≤ 20. `dashboard.view` gates the **route**; it grants no group. Rate limited `admin-search:user:<userId>` 120/min, fail-closed — the palette is an enumeration surface over order numbers, SKUs and email addresses; the key material is server-resolved, so 11 §4.3 rule 1's IP-sibling requirement does not apply. **This is not `/api/admin/search/preview`**, the storefront-ranking tuning route below. |
| `GET` | `/api/admin/search/preview?q=&market=` | `staff:search.manage` | Shows the ranked result set *with* synonyms, promotions and redirects applied, plus the raw ranking scores — the merchandiser cannot tune what they cannot see. |
| `POST` | `/api/revalidate` | secret | Manual tag purge. The secret arrives in an `x-md-revalidate-secret` **header** — never a query string, which lands in every access log and every `Referer` — and is compared with `crypto.timingSafeEqual` against a length-padded buffer. Body `{tags: string[]}`, `.strict()`, max 50 entries, validated against the `tags` vocabulary (01 §2.4); an unknown tag is a `400`, not a silent no-op. Rate limited `revalidate:ip:<ip64>` 30/min, fail-closed: a leaked secret should cost an attacker a cache-stampede attempt, not an unlimited one. |
| `GET` | `/api/health` | `any(cron, staff:integration.manage, public)` | **One route file, one manifest row.** The terse body — `{ status: 'ok' \| 'degraded' }` **and nothing else** — is served to every caller, `200` even when integrations are `unconfigured` (readiness to serve is what this reports, and `unconfigured` is a designed state); `503` only when the DB is unreachable or the migration head does not match the build. `?verbose=1` returns the full `{ db, migrations, integrations }` body of 01 §5.8 — field named `migrations`, matching 01, not `migrationHead` — **and only for satisfied-option index 0 or 1**, cron or `integration.manage`. A `?verbose=1` satisfied only by option 2 (`public`) is answered with the terse body and a `200`, never a `403`: refusing the uptime monitor because it appended a query string is a self-inflicted page. `public` is ordered **last** precisely so the two credentialled options are tried first and the handler can tell them apart; it also means total failure cannot occur here, so the last-option-error rule is inert on this route and live on `/api/checkout/status/[orderId]`. The detail is gated because `integrationStatus()` returns `missingKeys[]`: an unauthenticated body listing `STRIPE_WEBHOOK_SECRET` as missing tells a stranger, in one request, that this store's payment confirmations cannot be verified and that its order pipeline is stalled. **The key is `integration.manage`, not `dashboard.view`** — 07 §2.3 reserves `integration.manage` for exactly this, while `dashboard.view` is held by all seven roles including `analyst` and `content_editor`, so gating a secrets inventory on it is the same disclosure with an extra step. |

Every other admin mutation — product save, bulk edit, price change, recalc
approval, order transition, refund, publish, restore, role change — is a server
action under `src/server/actions/admin/`, each calling `requirePermission()` as
its first statement after `parse` (01 §2.1).

**A bulk edit gets no permission of its own.** `01 §2.7` routes a selection over 50 rows
to a `bulk_edit` job, which changes the *execution* model and not the authorisation
model: the action requires exactly the permission a single edit of that resource
requires (`product.update`, `price.update`, `inventory.adjust`), and the job **re-checks
it per row against the queuing user's re-resolved permission set** as it applies
(`11 §1.2` rule 2, `11 §3.3`). There is no `bulk_edit.*` key in the catalogue and none is
added — a key that names no resource is a key nobody can reason about.

> **RESOLVED — was CHANGE REQUIRED IN 07 §5.9:** the CSV import route is `POST /api/admin/import/upload`,
> *Verified applied in 07.*
> not `POST /api/import/upload`. One route, two spellings, and the canonical one is this
> document's: every other staff-only handler sits under `/api/admin/`, and a manifest row
> keyed on the wrong path is a route with no manifest row.

> **RESOLVED — was CHANGE REQUIRED IN 06 §7.1:** rename `confirmUpload()` to
> *Verified applied in 06.*
> `registerUpload(actor, input)` and point it at `POST /api/media/callback`.

#### Internal and security

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/security/csp-report` | public, `sameOrigin: false` | CSP violation reports (07 §5.8). 8 KB body cap, rate limited `csp-report:ip:<ip64>` 20/hour, `204` always. `sameOrigin` is off because the browser sends this report with a null origin by specification, which is the one case the middleware's same-origin default must not apply to. |

**`GET /api/internal/market-snapshot` is not built, and this table carried it.**

> **DECISION CHANGED:** 04 §5.2 specified a route the middleware could fetch to learn the
> active-market list, and 11 §10.9 listed it as a manifest row this table was missing. It
> is **deleted**, not gated. Middleware's only market source is
> **`src/generated/market-snapshot.json`**, written by `scripts/gen-market-snapshot.ts`
> during the build (01 §1.4). `01 §3`'s tree has no `src/app/api/internal/` directory, so
> the row it was about to gain is a **manifest row with no route file** — exactly the
> second failure mode `tests/unit/routes-authorized.test.ts` exists to catch, and the one
> that would have failed CI on its first run while looking like a correction.
>
> The deletion is not a regression: a middleware that fetches its own origin on the
> request path adds a network hop to every request, cannot be served from the edge
> without a second cache to reason about, and fails open into "which market?" — the one
> question that has no safe default. A file emitted at build time is read at cold start,
> costs nothing per request, and is invalidated by a deploy, which is the same cadence a
> market activation already needs (`market.manage` → redeploy, 04 §5.2).

**These three route files, plus `/api/catalog/redirect-hit` above, existed in `01 §3`'s
tree and in `06`, `07` and this document's own prose, and in no manifest row.**
`tests/unit/routes-authorized.test.ts` fails on "a route in the tree with no manifest
row", so the first run of that test failed on four routes. The table above is the source
of `src/lib/security/route-manifest.ts`; a route that is not in it does not ship, and a
row in it with no route file does not ship either.

> **RESOLVED — was CHANGE REQUIRED IN 11 §10.9:** delete the `GET /api/internal/market-snapshot` row from
> *Verified applied in 11.*
> the "route files with no manifest row" table. It is not a missing row; it is a route
> that is not built (01 §1.4, 06 §4.4). The other four rows of that table stand and are
> all now in the tables above.

#### Feeds

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/sitemap.xml` | public | Sitemap index, one per site at the root. Lists every shard of every active market. ISR 3600, tag `sitemap`. |
| `GET` | `/sitemaps/[shard].xml` | public | One shard, ≤ 10,000 URLs. **The market is in the shard key, not in a path prefix**: `{market}-products-<n>`, `{market}-categories`, `{market}-facets`, `{market}-collections`, `{market}-stones`, `{market}-journal`, `{market}-pages` — e.g. `/sitemaps/us-products-1.xml`, `/sitemaps/in-categories.xml`. This matches 01 §1.3's `/sitemaps/[shard].xml` and 04 §5.4's `/sitemaps/{market}-{n}.xml`, and it removes the `/in/sitemaps/…` form, which put the market in two places at once and made `/in/sitemaps/us-products-1.xml` a legal URL. ISR 3600, tags `sitemap`, `market:{m}`. |
| `GET` | `/robots.txt` | public | §3.4. |
| `GET` | `/journal/rss.xml` **and `/in/journal/rss.xml`** | public | Last 50 published posts **available in the market of the URL segment** — `WHERE journal_posts.market_code IS NULL OR journal_posts.market_code = $m` (02 §2.8 makes `market_code` nullable = all markets). A single unprefixed feed has no market to resolve and would mix an India-only post into the US feed. ISR 3600, tags `journal:index`, `market:{m}` (§4.2 — `cms:post` is not a tag in the vocabulary; the per-post tag is `cms:post:{id}` and a list surface cannot enumerate them). |
| `GET` | `/api/feeds/[market]/google-merchant.xml` | public | Google Merchant Center product feed. Streams the asset built by `run-jobs`; tags `feed:{m}`, `market:{m}`. §3.7. |
| `GET` | `/api/feeds/[market]/meta-catalog.csv` | public | Meta commerce catalogue feed. Same generation and tags. §3.7. |

Both feed routes are **public and unauthenticated by design** — Merchant Center and
Commerce Manager fetch them anonymously — and 07 §8.2's public-response denylist applies
unchanged: the feed carries title, description, image, link, `AvailabilityBand`-derived
availability and the anonymous display price, and **no cost price, no margin, no supplier,
no numeric stock count and no customer field**. `tests/e2e/public-api-leak.spec.ts` runs
against the feed bodies as well as the JSON routes.

> **NEEDS INPUT:** whether the client wants the feed URLs token-gated
> (`/api/feeds/[market]/[token]/google-merchant.xml`, the token a `settings` row). Both
> platforms support a secret path segment or Basic auth on the fetch URL. The trade is
> exact: ungated, a competitor can pull the full priced catalogue on a schedule; gated,
> rotating the token means re-entering the URL in two consoles. This is a business
> decision, not an architectural one, and the route shape supports either answer.

#### Cron

The **ten** handlers — the nine from 01 §5.6 (`release-reservations`, `retry-webhooks`,
`abandoned-carts`, `metal-rate-refresh`, `low-stock-digest`, `run-jobs`,
`reconcile-payments`, `sitemap-ping`, `cleanup-sessions`) plus
**`/api/cron/pricing-rule-windows` at `*/5 * * * *`** (04 §5.4) — all `POST`-or-`GET`
from Vercel Cron, all `cron` auth, all idempotent, all taking a `jobs` row lock so
two invocations cannot overlap, all writing a run record surfaced at
`/admin/system/jobs`. **`11 §5` is the cron registry** — the ten paths, their schedules
verbatim as `vercel.json#crons`, what each does, what breaks without it, and its
`maxRuntimeMs` — and `tests/unit/cron-registry.test.ts` asserts three sets are equal:
the directory names under `src/app/api/cron/*/route.ts`, the `path` values in
`vercel.json`, and the keys of `CRON_JOBS` in `src/lib/config/crons.ts`.

> **RESOLVED — was CHANGE REQUIRED IN 01 §5.6 AND 01 §3:** `vercel.json` has **ten** cron entries, not
> *Verified applied in 01.*
> nine, and `src/app/api/cron/` has ten directories. `01 §5.6` is the file an engineer
> copies `vercel.json` from and `01 §3` is what they scaffold the tree from; both omit
> `pricing-rule-windows`, which `04 §5.4` requires *while citing 01 §5.6 for it*. Every
> `revalidate` figure in §4.2 is conditional on that handler existing.

**The tenth one is load-bearing for every `revalidate` number in §4.2, which is why
omitting it is not a bookkeeping slip.** A `pricing_rules` window opens and closes purely by
the clock: nothing is written at the boundary, so nothing purges, and a sale scheduled for
midnight appears on the PLP at one moment, on the PDP at another, and in the bag immediately
— because `resolvePrice()` is uncached and `getDisplayPrice()` is not. The cron purges
`market:{m}` (and `product:{id}` for product-scoped rules) within five minutes of each
boundary. It also fixes the TTLs in §4.2: **in a market with any time-windowed
`pricing_rules` row live or scheduled within the next 24 hours, every display-price-bearing
ISR route is capped at `revalidate: 300`** (04 §5.4), not the 900s/1800s baselines. The cap
is the backstop for the five minutes the cron can miss and for the purge that fails after
commit.

### 2.3 Conventions

**Market at a route-handler boundary.** A route handler has no `[market]` segment,
so the market arrives as `?market=` on the catalogue reads and as a path segment on
the analytics and feed routes. In both cases it is parsed by the same branded
`MarketCode` schema that refines against `listActiveMarkets()` (01 §1.4) — never a
literal union, never unvalidated — and it is the authority for how `price_min` /
`price_max` are interpreted and which currency comes back. Two rules make a mislabelled
market visible rather than costly: every response echoes `meta.market`, and every
amount is a `Money` carrying its own `currencyCode`, so a client that asks the wrong
market gets a visibly foreign currency rather than a plausible wrong number. **Cart,
checkout and order endpoints take no market parameter at all** — theirs comes from
`carts.market_code` / `orders.market_code` (01 §2.5 step 1), and adding one would
reopen the mixed-currency bag that 02 §2.7's composite FKs close.

**Request validation.** Zod at the boundary, schema imported from the owning
service's `schema.ts` — never redefined in the route file. Every body schema is
`.strict()`: an unrecognised key is a `400`, not an ignored field. That is what makes
"the submitted form carries no amount at all" (01 §2.5 step 2) a checkable property
rather than an intention. Query strings parse through `z.coerce`. Hard caps enforced before parse: body ≤ 256 KB (webhooks
≤ 1 MB, `import/upload` exempt and streamed), `limit` ≤ 100, array params ≤ 50
elements, `q` ≤ 120 characters. A `POST` without `content-type: application/json`
is `415` before the body is read.

**Response envelope.** Exactly one of `data` or `error`, never both:

```jsonc
// 200
{ "data": { /* … */ },
  "meta": { "requestId": "01J…", "market": "US", "nextCursor": "eyJrIjpb…", "totalEstimate": null } }

// 4xx / 5xx
{ "error": { "code": "INSUFFICIENT_STOCK",
             "message": "This piece has just been taken.",
             "fields": null, "requestId": "01J…", "retryAfterSeconds": null } }
```

`meta.requestId` is the same value as the `x-request-id` header. **Every money
value in `data` is the `Money` shape from 01 §2.6** — `{"amountMinor":"145000",
"currencyCode":"USD"}` — because `bigint` cannot cross `Response.json()` and a
`number` would silently lose the rule. `tests/unit/api-money-shape.test.ts` walks
every route handler's response type and fails on a `number` or `bigint` under any
key matching `/(minor|amount|total|price|subtotal)/i`.

**Pagination.** Keyset only. `?limit=` (default 24 storefront, 50 admin, max 100)
and `?cursor=`, an opaque base64url encoding of
`{"k":[<sortValue>,…,<id>],"s":"<sort>","m":"<scopeToken>","f":"<filterHash>"}`.
A cursor whose `s` does not match the request's `sort` is a `400` — reusing a
cursor across a sort change silently skips or repeats rows. So is a cursor whose
`m` or `f` does not match.

**`m` is a scope token, not a market code** (13 §1.5). Its values are `market:US`,
`currency:USD`, `location:<uuid>`, or `-` when the sort and filters require none;
where a resource needs two, they are concatenated and sorted —
`market:US|currency:USD`. `sort=price` orders by an amount in one market's currency,
so a cursor carried from `/rings` onto `/in/rings` resumes a ₹ scan from a $ key —
which is the failure a market code catches. But `sort=available_quantity` on
`inventory` is `requires: 'location'` (11 §8.7) and `sort=total_spent_minor` on
`customers` is `requires: 'currency'` (11 §8.6), and a cursor encoding only a market
resumes a Chennai scan from a New Jersey key with no error at all. The token is
whatever the sort's and filters' `requires` set resolves to, which makes the check
exhaustive over 11 §8 by construction rather than by remembering.

`f` — a SHA-256 of the canonically-serialised whitelisted
filter set — because dropping a filter mid-scroll otherwise resumes a *larger* set
from a key computed inside the smaller one and silently hides everything before it.
`k` holds **every** component of the `ORDER BY`, not two, and the comparison is a
row-wise `(a, b, id) < ($1, $2, $3)` with all components in the same direction; a
two-element key under a three-clause sort skips rows on every tie (§6.2). No
`offset`, with exactly one documented exception:
`OFFSET 40000` on a filtered catalogue query reads and discards 40,000 rows, and
an admin list that offers page numbers will eventually be pointed at page 800 by
someone.

**The exception is `/journal/page/[n]`, and it is named here because §4.2 lists it and
"no offset anywhere" would otherwise make this document contradict itself two sections
later.** A journal archive needs crawlable, stable, linkable page URLs; a cursor cannot be
one, because it encodes a position in a set that changes when a post is published. So the
journal index alone uses `ORDER BY published_at DESC, id DESC LIMIT 12 OFFSET (n-1)*12`,
bounded by `generateStaticParams()` over the real page count with anything beyond it a `404`.
The bound is what makes it safe: the journal is tens to low hundreds of rows, `n` is validated
against `ceil(count/12)` rather than accepted from the URL, and the whole set fits in
`idx_journal_published`. Every other list surface in the codebase — catalogue, search, orders,
customers, admin grids — is keyset, and the lint rule that forbids `offset` in
`src/lib/db/raw/**` carries a single allowlisted call site with this reason attached.

`totalEstimate` is `null` unless the caller passes `?count=1`, and then it is
`count(*)` when the filtered set is under 5,000 rows and a
`pg_class.reltuples`-scaled estimate above that. It is never presented as an exact
figure in the UI when it came from the estimator.

**Filtering.** Flat, whitelisted, per-resource. The whitelist lives in
`src/lib/db/raw/filters.ts` alongside the sort whitelist, because it is the same
list the indexes in 02 §4 were sized for. **Its contents are `11 §8` — all ten
resources, every field, every permitted operator and the index that serves it.** This
document previously promised the file and gave the storefront set by example only, which
left five of the eight `saved_view_resource` values with a whitelist that existed in
prose and nowhere else. The storefront resource is `catalog` (`11 §8.2`), and it is this
document's own row.

```
?stone=moonstone,larimar          # slugs, OR within, AND across params
&material=14k-yellow-gold
&category=rings
&attr[ring-size]=6,6.5            # attribute_options.slug, keyed by attributes.slug
&price_min=50000&price_max=200000 # MINOR UNITS in the route market's currency
&availability=in_stock
&is_one_of_a_kind=1
```

`price_min` / `price_max` are minor units and are interpreted in the currency of
the `[market]` segment — never in a currency named by the caller. A request
carrying a `currency` parameter is a `400`, which closes the "price under 500"
trap that `chk_collection_rules_price_market` closes on the admin side.

**Sorting.** `?sort=<field>:<asc|desc>`, one clause, from the per-resource whitelist in
`src/lib/db/raw/sorts.ts`. **`11 §8` is the whitelist**; the storefront listing resource
is `catalog` — `rank` (default), `created_at`, `title`, `price`, `best_selling`,
`relevance` (`/search` only) — and the admin resources are `products`, `variants`,
`orders`, `customers`, `inventory`, `prices`, `returns`, `media`. `price` and
`best_selling` carry `requires: 'market'` and are a `400` without one, because sorting an
amount across markets compares ₹ to $ (02 §2.4). An unknown field is a `400`, never a
silent fallback to the default sort, and `tests/api/sorting.test.ts` additionally
`EXPLAIN`s each one and fails when the plan does not use the index the spec names.

**`price` and `best_selling` cannot be served from the tables 02 already indexes,
and pretending otherwise is how a PLP times out.** A product's price in a market is
not a column on `products`: it is the active `prices` row for the variant, falling
back to the product-level row with `variant_id IS NULL` (02 §2.5) — a two-step
resolution, per market, that `idx_prices_active (variant_id, market_code)` can probe
but cannot **order** by, because `list_minor` is not in the key. Sorting a filtered
category by price therefore joins `prices`, sorts the whole filtered set in memory,
and — fatally for §2.3's keyset rule — has no stable sort value to put in a cursor:
a product priced only at variant level has several, and the tuple `(price, id)` is
then not unique per product. Duplicated and skipped cards on page 2 of `/rings?sort=price`
is the visible symptom; the invisible one is that the same shopper never sees some
pieces at all. `best_selling` is worse: §4.3 defines it as a 90-day aggregate over
`order_items` per market, and computing that per request on a `no-store` filtered
listing is a full aggregate over the order history on the hottest page on the site.

Both are served by one narrow, derived, market-scoped row per product:

**The table is `product_market_sort`, and it is defined in 02, not here.** It was
originally declared in this section as a `SCHEMA ADDITION` while `06 §2.1` independently
declared `product_market_metrics` for the same fact, with its own refresh job and its own
`units_90d` under a different predicate — two derived caches of one number, so a CMS
`product_grid` block and a PLP `?sort=best_selling` on the same category could
legitimately disagree. **The set has settled it** (`11 §7.9`): the table is
`product_market_sort`, its DDL is this document's, and it now lives in **02 §7.11** with
every other table in the system. `product_market_metrics` is **not created**.

The parts of that decision this section depends on:

- **Columns**: `product_id UUID`, `market_code CHAR(2)`, `currency_code CHAR(3)`,
  `min_price_minor BIGINT`, `max_price_minor BIGINT`, `units_90d INTEGER`,
  `refreshed_at TIMESTAMPTZ`; `PRIMARY KEY (product_id, market_code)`; the composite FK
  `(market_code, currency_code) → markets (code, currency_code)`; and the two indexes
  `idx_pms_price (market_code, min_price_minor, product_id)` and
  `idx_pms_units (market_code, units_90d DESC, product_id)`. 02 §7.11 is the
  authoritative text.
- **The composite FK is the load-bearing part.** It is the same device 02 uses on
  `prices`, `carts` and `orders`: it makes a USD amount filed under the India market
  unwritable rather than merely discouraged, so this derived table cannot become the one
  place an implicit conversion hides.
- **It stores no new facts** — every value is derived from `prices` and `order_items` —
  so it is a cache with a transactional writer, never an authority. `resolvePrice()`
  remains the only price authority (01 §2.3), and `product_market_sort` may appear in a
  `WHERE` or an `ORDER BY` and **nowhere else**: reading an amount out of it to publish
  or to charge is a second price authority (§3.2).
- **The sort value is `best_selling`**, matching `chk_collections_sort_order` (02 §2.4).
  `bestselling` is a rejected spelling.
- **The refresh job kind is `product_metrics_refresh`** — `06 §2.1`'s name, the only
  `job_kind` value either document proposed, now declared in 02 §1.9 and registered in
  `11 §3.2` with `systemPermitted: true` and `dedupeKey: 'kind'`.

> **RESOLVED — was CHANGE REQUIRED IN 06 §2.1:** delete the `product_market_metrics` DDL and the
> *Verified applied in 06.*
> `idx_pmm_rank` index; repoint `product_metrics_refresh` at `product_market_sort`; and
> change `product_grid.sort = 'bestselling'` to `'best_selling'`. `06`'s `revenue_minor`
> and `rank` columns do not survive the merge: `rank` is `ROW_NUMBER()` over
> `units_90d`, which the `idx_pms_units` keyset already gives without a column that goes
> stale between refreshes, and `revenue_minor` has no reader — the block sorts, it does
> not report. A revenue rollup belongs to the reporting module, where the rule that a
> figure may never be summed across markets can be stated once.

- **`min_price_minor` / `max_price_minor` are written inside the price-change
  transaction**, by `catalog.reindexProduct(productId, tx)` — the function 02 §2.4
  already makes responsible for `search_text` in the same transaction, for the same
  reason: a derived column refreshed by a job is stale between the write and the job,
  and a stale price *filter* hides a piece that is in budget. `pricing` calls it after
  inserting the new `prices` row and before commit.
- **`units_90d` counts paid, un-returned units only**, and the predicate is not optional:
  ```sql
  SELECT oi.product_id, oi.market_code,
         sum(oi.quantity - oi.returned_quantity)::int AS units_90d
  FROM order_items oi
  JOIN orders o ON o.id = oi.order_id
  WHERE o.paid_at >= now() - interval '90 days'
    AND o.status <> 'cancelled'
  GROUP BY 1, 2;
  ```
  Aggregating `order_items` alone counts orders that were created and never paid — every
  abandoned `pending_payment` row, and on a one-of-a-kind catalogue, every checkout that lost
  the race — so "best selling" would rank whatever people *tried* to buy. Subtracting
  `returned_quantity` matters for the same reason in the other direction. The join needs
  `CREATE INDEX idx_orders_paid_at ON orders (paid_at) WHERE paid_at IS NOT NULL;` — 02 §4.4
  indexes `orders` by `(market_code, status, created_at DESC)` and by customer and email, none
  of which serves a 90-day scan on `paid_at`.
- **`units_90d` is refreshed nightly** by `run-jobs`, as a `product_metrics_refresh`
  job (`11 §3.2`: `systemPermitted: true`, `dedupeKey: 'kind'`, so two overlapping cron
  passes cannot queue two rebuilds), because "best selling" is a
  90-day window that moves on its own even when nothing is written. It is an ordering
  signal, not a number shown to anyone, so a 24-hour-old value is correct enough and
  a per-order write is not worth the contention on the order transaction.
- `price_min` / `price_max` filter on `min_price_minor`/`max_price_minor` for the
  route's market; `sort=price` orders by `(min_price_minor, product_id)`, giving a
  unique, stable, single-column keyset value per product. `sort=best_selling` orders
  by `(units_90d DESC, product_id)`.
- A product with no row for a market has no live price there and is already excluded
  by the `EXISTS` clause in 02 §4.1; the two are maintained by the same call, and
  `tests/integration/price-sort-consistency.test.ts` asserts that the set returned by
  the `EXISTS` clause and the set present in `product_market_sort` are equal per market —
  **and that the amounts agree**, not only the membership, because equal sets with unequal
  numbers is precisely the failure below.

**A transactional writer covers price changes that are writes. Two price changes are not
writes, and they are the ones that break this table.** `reindexProduct()` fires on a `prices`
insert, which is correct and sufficient for a merchandiser editing a figure. It fires for
neither of these:

- a `pricing_rules` window opening or closing — a scheduled sale is live at midnight with no
  row written anywhere (04 §5.4);
- a `prices` row reaching its own `valid_to`, which is a timestamp, not an event.

In both cases `getDisplayPrice()` returns the new amount on the next uncached resolve while
`product_market_sort.min_price_minor` still holds the old one — so `/rings?price_max=…`
hides a piece that is now in budget, `sort=price` orders a page by figures it is not
rendering, and the JSON-LD price and the filter disagree on the same screen. The fix is the
same mechanism 04 §5.4 already requires for the cache: **`/api/cron/pricing-rule-windows`
(every 5 minutes) re-runs `reindexProduct()` for the products whose effective display price
moved across the boundary it just processed**, in the same pass that purges `market:{m}`, and
a `prices` row written with a future `valid_to` enqueues a `jobs` row at that instant.
`run-jobs` additionally re-derives the whole table nightly as a self-healing sweep, and the
consistency test above runs against a seeded catalogue with one rule that expires mid-test.

**Error format and status map.** From the taxonomy in §1.4. `Retry-After` is set
on `429` and `503`. A `409` response carries no `data` — only `error.message`, which
says enough for the UI to explain itself — and the corrected state (the re-priced bag,
the reloaded product) comes from the follow-up read the client already makes. It never
comes from the error body, because an error body that carries state is a second,
divergent copy of it.

**Versioning posture: no version prefix, and that is a decision.** These endpoints
have exactly one consumer — the pages deployed in the same atomic Vercel
deployment. A `/v1/` prefix on a private API buys nothing and creates the
expectation that `/v1/` will be maintained. The rules instead:

- Changes are **additive**. Adding a field is free; removing or retyping one is a
  new path (`/api/cart/summary` alongside `/api/cart`), with the old path kept for
  one release and then deleted.
- The **feeds are the public contract** and do carry a version in the path when
  their schema changes, because Google Merchant Center and Meta hold a URL for
  months.
- **Provider API versions are pinned, not floated**: `new Stripe(key, { apiVersion: '<pinned>' })`
  and the Razorpay SDK major in `package.json` with `--save-exact`. The received
  event's own version string stays in `webhook_events.payload`, so a provider
  upgrade is diffable against real traffic before it is taken.

**Idempotency on anything that moves money or stock.** Four mechanisms, each a
database object:

| Path | Mechanism |
| --- | --- |
| Order creation (`placeOrderAction`) | `orders.idempotency_key` + `idx_orders_idempotency_key`. The key is a UUIDv7 minted **server-side** and written to `checkout_sessions.idempotency_key` when the session enters the `payment` step (05 §3.6); `placeOrder()` reads it from that row. It is **not** submitted, and `idempotencyKey` is on 05 §640's always-refused field list, so a body carrying one is a `400`. |
| Payment intent | `createIntent(order, paymentAttemptKey(order, attempt))` — the provider's own idempotency, keyed by our order **and the attempt number** (05 §3.6). |
| Refund | `refunds.idempotency_key` + `uq_refunds_idempotency (payment_id, idempotency_key)`. Staff-initiated refunds key on the `returns.id` or a UUIDv7 minted with the refund form; the `paid_unfulfillable` auto-refund keys on the order id (01 §2.5). |
| Webhook delivery | `idx_webhook_events_event (provider, provider_event_id)`, insert-first — the index name is 01 §2.7 and 02 §2.7 verbatim; there is no `uq_webhook_events_event`. |

**A client-chosen idempotency key is not a weaker safeguard; it is a way to be handed
someone else's order.** The obvious implementation — mint a UUIDv7 in the browser at form
mount and post it as a hidden field — survives a double-click and fails the only other test
that matters. `idx_orders_idempotency_key` is unique across the whole table, not per cart, and
`createOrderFromCart()` is specified (01 §2.5) to return the **existing** order when the key
collides. So a caller who replays a key they observed, or who happens to reuse one, receives
another customer's order object: its number, its status, and the `/orders/[token]` link the
confirmation screen renders from it. Hidden form fields are not secrets; they are request
bodies with better manners. Server-issuing the key into `checkout_sessions` fixes both
properties at once — it is stable across retries of *that* session, and it is unguessable and
unreachable from outside it. The second call returns the first order **only after**
`placeOrder()` has re-asserted that the found order's `cart_id` is this session's cart;
anything else is `NotFoundError`.

**The payment-intent key is not `orders.idempotency_key`, and this table previously said
it was.** `01 §2.5` writes `createIntent(order, order.idempotency_key)`, which is correct
for the *first* attempt and wrong for every one after it. Stripe returns the **same**
PaymentIntent for a replayed idempotency key within 24 hours, so a shopper whose card is
declined and who retries is handed the client secret of the intent that already failed —
from their side the page is broken, and there is no route back to a successful payment on
that order. `uq_payments_idempotency (provider_key, idempotency_key)` (02 §2.7) refuses
the second `payments` row on top of it. The key is therefore
`paymentAttemptKey(order, attempt)` — 05 §3.6 owns the derivation — where `attempt` is
the count of prior `payment_events` of type `intent_created` for that order. Each retry
gets a fresh intent, each intent gets its own `payments` row, and the unique index is
satisfied rather than fought.

> **RESOLVED — was CHANGE REQUIRED IN 01 §2.5:** the same correction. `01` is the foundation document
> *Verified applied by inspection of the target document.*
> and still carries `createIntent(order, order.idempotency_key)`; two of three documents
> specifying the version that makes a declined card unrecoverable is what made this a
> finding rather than a typo.

Route handlers that mutate money or stock are only the two webhooks, and both are
covered above. Consequently **no generic `Idempotency-Key` header and no generic
idempotency table exist** — a table that nothing reliably writes to is worse than
no table, because it looks like protection.

**Rate limits** (`rate_limits`, fixed window, keyed as in 02 §2.9):

IP keys are `<ip64>`, produced by `rateLimitIpKey()` — the full IPv4 address, or the **/64
prefix** for IPv6 (07 §5.5). Keying IPv6 on the full 128-bit address hands one attacker 2^64
buckets and therefore no limit at all.

**The complete inventory is `11 §4.2` — 42 keys — and this document previously claimed
that its table and `07 §5.5`'s were "the same rows". They were not.** `07 §5.5` declared
itself "the whole inventory" and omitted five keys this document's own prose argues for
(`analytics:ip`, `search-click:ip`, `checkout-status:ip`, `redirects-snapshot:ip`,
`revalidate:ip`), plus two of `06`'s. Under `07`'s rule as written, adding them failed
`tests/unit/ratelimit-keys.test.ts`; under this document's, omitting them reopened the
order-id oracle. The reconciliation kept all of them and added the missing IP siblings
(`coupon:ip`, `giftcard:ip`); `11 §4.2` is now the single list the test compares against,
and **neither this section nor `07 §5.5` is a completeness claim any more.**

The rows below are the ones this document's routes consume, reproduced from `11 §4.2` —
a limit or window here that differs from there is a defect here:

| Key shape | Endpoint | Limit | Fail |
| --- | --- | --- | --- |
| `typeahead:ip:<ip64>` | `GET /api/catalog/typeahead` | 30 / min | open |
| `search:ip:<ip64>` | `GET /api/search`, `/search` render | 60 / min | open |
| `catalog:ip:<ip64>` | `/api/catalog/products`, `/facets`, `/availability` | 120 / min | open |
| `redirects-snapshot:ip:<ip64>` | `GET /api/catalog/redirects` | 20 / min | open |
| `redirect-hit:ip:<ip64>` | `POST /api/catalog/redirect-hit` | 60 / min | open |
| `search-click:session:<sid>` | `POST /api/search/click` | 60 / min | open |
| `search-click:ip:<ip64>` | `POST /api/search/click` | 300 / min | open |
| `analytics:session:<sid>` | `POST /api/analytics/[market]/collect` | 120 / min | open |
| `analytics:ip:<ip64>` | `POST /api/analytics/[market]/collect` | 600 / min | open |
| `cart:token:<hash>` | `GET /api/cart` and every cart server action | 60 / min | open |
| `shipping-quote:cart:<cartId>` | `POST /api/checkout/shipping-quote` | 30 / min | open |
| `checkout:ip:<ip64>` | `placeOrderAction` | 10 / 10 min | **closed** |
| `checkout-status:ip:<ip64>` | `GET /api/checkout/status/[orderId]` | 120 / min | **closed** |
| `coupon:cart:<cartId>` · `coupon:ip:<ip64>` | `applyCouponToCart` | 10 / 10 min · 60 / hour | **closed** |
| `otp:email:<email>` · `otp:ip:<ip64>` | `requestOtp` | 5 / 15 min · 20 / hour | **closed** |
| `login:email:<email>` | `customerLogin` | 10 / 15 min | **closed** |
| `media-sign:user:<userId>` | `POST /api/media/sign`, `POST /api/media/svg` | 60 / hour | **closed** |
| `export:user:<userId>` | `exportRun()` | 5 / hour | **closed** |
| `revalidate:ip:<ip64>` | `POST /api/revalidate` | 30 / min | **closed** |
| `webhook:ip:<ip>` | `/api/webhooks/stripe`, `/api/webhooks/razorpay` | 600 / min | open |
| `csp-report:ip:<ip64>` | `POST /api/security/csp-report` | 20 / hour | open |
| `preview-token:ip:<ip64>` | `resolvePreviewToken()` on `/_preview/[market]/[token]/**` | 60 / hour | **closed** |
| `cms-heartbeat:session:<sid>` | `GET /api/admin/cms/pages/[id]/heartbeat` | 10 / min | open |
| `bisr:ip:<ip64>` · `bisr:email:<email>` | `POST /api/catalog/notify-me` | 10 / hour · 5 / 24 h | **closed** |
| `wishlist-share:ip:<ip64>` | `/wishlist/shared/[token]` | 60 / hour | **closed** |
| `admin-search:user:<userId>` | `GET /api/admin/search` | 120 / min | **closed** |

**`redirects-snapshot` fails open and is the one deliberate exception on that side.**
Every other closed-side key is a credential, money or oracle endpoint, where failing
closed costs nothing because the handler needs the database anyway. The edge redirect
map's whole design is fail-open (01 §2.1): a limiter that could block a refresh would be
worse than the flood it prevents.

The three catalogue reads were previously the only public endpoints in §2.2 with no
limit named. `/api/catalog/facets` is the expensive one — one `GROUP BY` per facet
dimension over a filtered CTE (02 §4.1) — and an unlimited public aggregate is a
one-line denial of service against the PLP everyone else is trying to browse.

**Every `…:session:<sid>` row is paired with an `…:ip:<ip64>` row, and that pairing is the
row that does the work.** `session_id` is a value the browser supplies — 02 §2.9 files it
under "client, shape-validated by Zod" — so a limiter keyed on it alone is defeated by
`crypto.randomUUID()` on each request. The session key is still useful: it is the one that
catches a runaway loop in our own code and produces a readable `rate_limits.key` in the log.
The IP key is the one that catches an adversary. Neither is sufficient alone, which is why
`consume()` is called twice and the stricter verdict wins.

---

## 3. SEO architecture

`src/lib/seo/` is the only module that constructs a canonical URL, an `hreflang`
set, a robots directive or a JSON-LD graph. A `<link rel="canonical">` written by
hand in a page component is a lint error (`no-restricted-syntax` on `JSXOpeningElement[name.name='link'][attributes.0.value.value='canonical']`).

### 3.1 Metadata resolution

Every route exports `generateMetadata()`, and every one of them is three lines:

```ts
export async function generateMetadata({ params }): Promise<Metadata> {
  const market = await resolveMarket((await params).market);
  return buildMetadata({ kind: 'product', slug: (await params).slug }, market);
}
```

**`generateMetadata()` and the page body are two separate invocations, so "the PDP already
loaded it" is only true if something makes it true.** Next calls `generateMetadata()` and
then the component tree; neither can pass a value to the other. Left alone, every PDP render
resolves the product twice, every category page runs its first-page listing twice, and the
`EXISTS`-on-`prices` probe the robots rule below depends on runs twice per request on the
highest-volume surface on the site. The mechanism is request-level memoisation, not a
convention: **`getProductForPdp`, `resolveCategoryBySlug`, `resolveCuratedFacet`,
`getStoneBySlug`, `getJournalPost` and `getPageByPath` are each wrapped in React's
`cache()`** at their export site in the owning service, so the second call inside one request
is free. This is not the `cached()` data-cache wrapper of 01 §2.4 and is not subject to its
ban list — `React.cache` is per-request deduplication with no cross-request lifetime, which is
exactly why it is safe on a path that touches per-market price availability.
`tests/integration/metadata-dedupe.test.ts` renders a PDP with a query counter and asserts the
product resolves once.

`buildMetadata()` resolves each field through a fixed precedence and stops at the
first non-null:

1. `seo_metadata` row for `(entity_type, entity_id, market_code)` — the
   market-specific override.
2. `seo_metadata` row for `(entity_type, entity_id, NULL)` — the all-markets
   override.
3. The per-route-class **generator** below, reading the entity and its
   `*_market_content` row.
4. The site default from `settings` (`seo.title_suffix`, `seo.default_description`,
   `seo.default_og_media_id`).

Every `seo_metadata` column is nullable by design (02 §2.8): a blank field means
"generate", never "publish empty". `saveSeoMetadata()` writes `NULL` for an empty
string, so clearing a field in the admin returns it to the generator.

**`seo_metadata.canonical_url` is the one override that can destroy the thing this
section exists to protect, so it is constrained rather than trusted.** §3.5 is
emphatic that each market's page is canonical to itself and that canonicalising the
India URL to the US URL de-indexes the India catalogue. `canonical_url` is precisely
the column that lets a well-meaning admin do that in one paste — and it fails
silently, because nothing on the page looks wrong. `saveSeoMetadata()` therefore
rejects a `canonical_url` that is not (a) absolute on `NEXT_PUBLIC_APP_URL`'s origin,
(b) free of a query string, and (c) prefixed for the **same market** as the row's
`market_code` (or, for an all-markets row, prefix-free). A cross-market or
cross-origin value is a `ValidationError` naming both markets, not a saved row.
`buildMetadata()` consumes it at precedence step 1 for the canonical field only; it
never becomes the `hreflang` set, which always comes from `buildAlternates(target, path)`.

| Route class | Title generator | Description generator | Canonical | OG image | Robots |
| --- | --- | --- | --- | --- | --- |
| Home | `settings['seo.home_title']` ?? `"MILLENNIUM DESIGNS"` | `settings['seo.default_description']` | `{origin}{marketPrefix}/` | `settings['seo.default_og_media_id']` → `/public/brand/og-default.png` | `index,follow` |
| Category | `{category.name} · {suffix}` | first 160 chars of `description_json` flattened; falls back to default | `{origin}{prefix}/{slug}` | `categories.hero_media_id` → default | `index,follow` |
| Curated facet | `curated_facets.title` (required, `NOT NULL`) | `intro_json` flattened → default | `{origin}{prefix}/{category}/{facet}` | category hero | `index,follow` |
| Collection | `{collection.title} · {suffix}` | `description_json` flattened | `{origin}{prefix}/collections/{slug}` | `collections.hero_media_id` | `index,follow` while `is_published` and inside `starts_at`/`ends_at`; otherwise the route 404s |
| Product | `{title}{ subtitle ? ' — ' + subtitle : ''} · {suffix}` using `product_market_content.title` when present | `subtitle`, else first 160 chars of `description_json` | `{origin}{prefix}/products/{slug}` | `product_media` where `role='hero'` → generated OG (§3.2) | `index,follow` while `status='active'` **and** `coalesce(product_market_content.is_published, true)` **and the product has a live `prices` row in this market**; otherwise `noindex,follow` |
| Stone index | `settings['seo.stones_title']` | default | `{origin}{prefix}/stones` | default | `index,follow` |
| Stone detail | `{stone.name} · {suffix}` | `stones.short_description` → default | `{origin}{prefix}/stones/{slug}` | `stones.hero_media_id` | `index,follow` **only when at least one product is available in this market** (04 §6.1); otherwise `noindex,follow`. `stones` carries no `market_code` (02 §2.4), so every stone exists in every market by default and `/in/stones/larimar` is live from the first deploy — an indexed page listing nothing until INR prices are entered |
| Stone × type | `{stone.name} {category.name} · {suffix}` | generated from both names | the matching curated facet URL when one exists, else self | stone hero | `index,follow` **only** when a matching active `curated_facets` row exists; otherwise `noindex,follow` (§4.2) |
| CMS page | `cms_pages.title` | first paragraph of the first text block | `{origin}{prefix}{cms_pages.path}` | first image block → default | `index,follow` while `is_indexable` and `status='published'` |
| Journal post | `{title} · {suffix}` | `excerpt` | `{origin}{prefix}/journal/{slug}` | `hero_media_id` | `index,follow` |
| Filtered listing (`searchParams` present) | parent title | parent description | **parent (unfiltered) URL** | parent | `noindex,follow` |
| Search | `settings['seo.search_title']` | — | none emitted | — | `noindex,nofollow` |
| Cart / checkout / account / orders / wishlist / preview | route title | — | none emitted | — | `noindex,nofollow` |
| Admin | `"Admin · MILLENNIUM DESIGNS"` | — | none | — | `noindex,nofollow` + `X-Robots-Tag` header |

`robots_noindex` / `robots_nofollow` on a `seo_metadata` row can only ever make a
page *less* indexable. A row cannot force `index` onto `/cart` — `buildMetadata()`
computes `noindex ||= NEVER_INDEX.some(p => path.startsWith(p))` **after** the
override merge, where `NEVER_INDEX` is the constant list in §3.4. An admin cannot
misconfigure the checkout into Google.

**An unpriced product is not an indexable product in that market.** 02 §4.1 already
excludes a product with no live `prices` row for the market from that market's PLP —
the `EXISTS` probe on `idx_prices_live_product` — because `resolvePrice` returns
`PriceUnavailableError` and the add-to-bag is dead. The PDP rule has to match, and
here is why it is not cosmetic: `product_market_content.is_published` **defaults to
`true`** (02 §2.4), so on launch day, with only USD prices entered, every one of the
catalogue's India PDPs is `is_published`, renders no price, offers no add-to-bag —
and, under the original rule, emits `index,follow` and a `Product` graph with no
`offers`. That is the entire India catalogue submitted to Google as thin, unbuyable
pages, on day one, from the same default that 02 chose correctly for merchandising.
`buildMetadata()` therefore reads the same `EXISTS` result the PDP already loaded
(one boolean on `ProductDetail`) and forces `noindex,follow`;
§3.3 drops the URL from that market's shard and §3.5 emits no `hreflang` alternate
for it. The moment the INR price is entered, the tag purge on `product:{id}` puts the
page back. The same rule applies to a category or collection whose entire first page
is unpriced in the market.

**Title and description lengths are advisory, and the admin says so.** The SEO
panel shows a live pixel-width estimate and flags > 60 characters (title) or
> 155 (description) as a warning, never an error. Truncation is Google's decision
and a hard limit would block a legitimate long product name.

**OG images.** `app/(storefront)/[market]/products/[slug]/opengraph-image.tsx`
uses `ImageResponse` at 1200×630, rendering the product hero from Cloudinary plus
the wordmark from `public/brand/wordmark-ivory.svg` on `#062E1B`, with fonts
loaded from `src/assets/fonts`. It is cached with the route's tags
(`product:{id}`, `market:{m}`), so a hero image swap regenerates the card. Every
other route class uses the entity hero or the static
`public/brand/og-default.png`. Twitter card is `summary_large_image` with the same
image; no separate asset.

> **NEEDS INPUT:** the Twitter/X handle for `twitter:site`, the Facebook page for
> `og:site_name` linkage, and whether the client has Google Search Console and
> Bing Webmaster verification tokens to place in `settings` under
> `seo.verification.*`. Absent these, no verification meta tag is emitted — an
> invented one is a fact about a property we do not control.

### 3.2 Structured data

Emitted by `<JsonLd graph={...} nonce={nonce} />` in `src/components/seo/` — the
single documented `react/no-danger` exception (01 §5.8), reading the per-request
CSP nonce so `script-src` stays locked.

| Route class | `@type` | Source of every asserted value |
| --- | --- | --- |
| All | `Organization` (once, in the market layout) | `settings` under `org.*`: `name`, `url`, `logo` (`public/brand/monogram.svg`), `sameAs[]`. `foundingDate`, `address`, `telephone`, `email` are emitted **only** when the corresponding `settings` row is non-empty. |
| All | `WebSite` with `SearchAction` → `{origin}{prefix}/search?q={query}` | Route map |
| Category, collection, facet, stone, PLP | `BreadcrumbList` + `CollectionPage` | `categories.materialized_path` for the trail; `ItemList` of the first page's products with `position` and `url` only |
| Product | `Product` + `BreadcrumbList` | `name` ← resolved title; `sku` ← `product_variants.sku`; `image[]` ← `product_media`; `description` ← flattened `description_json`; `material` ← `materials.name`; `offers` ← below |
| Journal post | `Article` + `BreadcrumbList` | `headline` ← `title`; `datePublished` ← `published_at`; `dateModified` ← `updated_at`; `author` ← `author_display_name` (the snapshot, so a byline survives a departure); `image` ← `hero_media_id` |
| CMS page | `WebPage` + `BreadcrumbList` | `cms_pages` |
| FAQ block on any page | `FAQPage` | Only when the page actually contains a rendered FAQ block; the questions and answers are the rendered ones, verbatim |

**Structured data may never assert something that is not true.** This is not a
style note; it is the rule the builders are written around:

- **`offers.price` is the anonymous display price for the market of the URL**,
  taken from `getDisplayPrice()` — `saleMinor ?? listMinor`, the same number the
  cached page renders — with `priceCurrency = markets.currency_code`. The US page
  never carries an INR offer and vice versa. `priceValidUntil` is emitted only when
  the product is in a collection with a real `ends_at`.
- **It is never `ResolvedPrice.unitFinalMinor`.** `unitFinalMinor` is post-coupon and
  post-customer-group (01 §2.3), and `resolvePrice()` is banned from every cached
  path for exactly that reason (01 §2.4). A JSON-LD builder that reached for the
  "final" price would either bake one customer's coupon into a CDN object read by
  every subsequent crawler and visitor, or force the PDP dynamic and lose the ISR
  surface this whole section is built on. Structured data describes what any visitor
  is offered, which is the display price and nothing else.
- **A multi-variant product emits `AggregateOffer`, not a single `Offer`.** 02 gives
  every variant its own `sku` and its own `prices` row, so "the" price and "the" sku
  of a product with three ring sizes at three prices are both fictions — and a
  single `Offer` asserting the cheapest one against a landing page that shows a
  higher number is the exact mismatch Merchant Center and Search flag. When
  `getDisplayPrice()` returns more than one distinct amount across a product's live
  variants, the graph is `AggregateOffer` with `lowPrice`, `highPrice`,
  `priceCurrency`, `offerCount` and no top-level `sku`; when every live variant
  resolves to the same amount, it collapses to one `Offer` carrying that variant's
  `sku`. **The two numbers come from `getProductPriceRanges()`** — the second cacheable
  pricing function 04 §5.4 names, and the same call the PDP's price block already renders
  from — **never from `product_market_sort`.** That table is a derived, market-scoped
  ordering and filtering cache with a nightly self-heal (§2.3); reading an amount out of it
  and publishing it to Google as a fact about what this piece costs is exactly the "second
  price authority" 01 §2.3 exists to prevent, and it would be wrong for the whole interval
  between a `pricing_rules` window boundary and the cron that repairs the row. The rule is
  narrow and absolute: `product_market_sort` may appear in a `WHERE` or an `ORDER BY` and
  nowhere else.
- **A product with no live price in the market emits no `offers` and no `Product`
  graph at all** — it is `noindex,follow` there (§3.1), and an `Offer` with a missing
  or zero price is an assertion that the piece is free.
- **`offers.availability` is derived from `getAvailability()`**:
  `in_stock`/`low` → `https://schema.org/InStock`, `out` →
  `https://schema.org/OutOfStock`, `made_to_order` →
  `https://schema.org/PreOrder`, `sold` → `https://schema.org/SoldOut`. It is
  computed in the same `<Suspense>` boundary as the add-to-bag control (01 §2.4),
  so the JSON-LD and the button can never disagree.
  **One branch on `products.kind`** (15 §2.2): a product whose `kind = 'gift_card'`
  maps to `InStock` even though `inventory_policy` puts it in the `made_to_order`
  band, because a card delivered by email in a minute is not a pre-order. The
  **band is unchanged** — it is the *rendering* of the band that branches, on both
  sides at once: the surface copy key becomes `copy.availability.gift_card` and the
  markup becomes `InStock`, from the same branch. `tests/unit/jsonld-truth.test.ts`'s
  assertion "every `availability` matches the band the page showed" therefore still
  holds, because the page and the graph read one function.
- **`aggregateRating` and `review` are emitted only from approved reviews, and
  otherwise not at all.**

  > **DECISION CHANGED:** this bullet read "**No `aggregateRating`, no `review`,
  > ever.** There is no `reviews` table in this schema." The second sentence is now
  > false — `product_reviews`, `product_review_stats` and `product_review_votes`
  > ship in release 1 (02 §7.12, 15 §3.2) and admin moderation ships with them — and
  > the first was always a proxy for the rule that actually matters, which is
  > unchanged and is hard rules 7 and 8: **structured data may never assert a fact
  > the platform cannot guarantee.**

  The rule, mechanically:

  - `buildJsonLd()` emits `aggregateRating` for a product **if and only if** that
    product's `product_review_stats.approved_count > 0`. Zero approved reviews, no
    key — not `"reviewCount": 0`, not `"ratingValue": null`, **no key**. A zero
    rating block is an assertion that nobody has rated this piece, published in a
    format Google reads as a rating.
  - `ratingValue` and `reviewCount` are computed from **approved rows and nothing
    else**: `ratingValue = approved_rating_sum / approved_count` rounded to two
    decimals, `reviewCount = approved_count`. Not from `product_reviews` counted
    live, not from a pending queue, not from a cached number in any other table.
    Every approved row carries a `NOT NULL order_item_id`, so every counted rating
    is a verified purchase **by foreign key** — which is precisely the guarantee
    this section demands before anything may be asserted.
  - `review` (individual review objects) follows the same gate and the same source.
  - `seo_metadata.structured_data_override` keeps rejecting any object containing
    `aggregateRating`, `review` or `ratingValue`, unchanged. The override is not a
    back door around the gate and never becomes one: a merchandiser may add a
    legitimate extra type, not a rating.
  - The catalogue ships with **zero** reviews and `99-demo.ts` seeds none, so the
    launch state of every product page is "no key" — the same bytes the absolute ban
    produced, arrived at by a rule that stays true when the first real review lands.

  > **RESOLVED — was CHANGE REQUIRED IN 15 §3.2 and §3.4:** `product_review_stats`'s count column is
  > *Verified applied in 15.*
  > **`approved_count`**, and its sum is `approved_rating_sum`; §3.2's `rating_count` /
  > `rating_sum` are the rejected spellings. The name is the gate — a column called
  > `rating_count` invites a writer to count ratings, and the only ratings that may
  > ever be counted are approved ones. §3.4's `mayEmitAggregateRating()` reduces to
  > `stats !== null && stats.approved_count > 0`: the `feature.reviews_structured_data`
  > flag and `reviews.min_ratings_for_markup` are **withdrawn**, because a flag that
  > suppresses true markup is a second decision nobody will remember to make, and a
  > minimum-count threshold is a marketing preference dressed as a truth rule. What
  > 09 §5.2 defers is the customer-facing submission UI, not the schema, not the
  > moderation screen and not this test.
- **No `gtin`, `mpn` or `brand` beyond the house name** unless the column is
  populated. Where `product_variants.barcode` is null, the Merchant feed emits
  `identifier_exists: no` rather than a fabricated identifier.
- **No `hasMerchantReturnPolicy`, `shippingDetails` deadline, `award`,
  `certification` or `countryOfAssembly`** until the corresponding `settings` rows
  or `product_variants.country_of_origin` are populated by the client (hard rule
  8).
- `seo_metadata.structured_data_override` **replaces** the generated graph when
  set. `saveSeoMetadata()` validates it against a schema.org subset allowlist and
  **rejects any object containing `aggregateRating`, `review` or `ratingValue`** —
  the override exists for a marketing team with a legitimate extra type, not as a
  hole in the rule above.
- `tests/unit/jsonld-truth.test.ts` renders every route class against a seeded
  catalogue and asserts the rating rule in **two** directions, not one:
  **(a)** no `aggregateRating`, `review` or `ratingValue` key is emitted for any
  product whose `product_review_stats.approved_count = 0` — including a product
  with five *pending* reviews and a product with five *rejected* ones, both seeded
  by the fixture, because "some reviews exist" is the state the old ban could not
  distinguish from "some approved reviews exist"; and **(b)** for a product with
  approved reviews, `ratingValue` equals `round(approved_rating_sum /
  approved_count, 2)` and `reviewCount` equals `approved_count`, recomputed by the
  test from `product_reviews WHERE status = 'approved'` — so any `ratingValue`
  **not** derived from approved rows fails, whatever produced it.

  > **DECISION CHANGED:** this test previously asserted "no `aggregateRating` key
  > anywhere". That assertion passes on a build that emits a rating from pending
  > reviews as soon as the seed contains one, because the seed contains none — it
  > tested the fixture, not the builder. The replacement is strictly stronger: it
  > fails on a fabricated rating, on a rating counted from unapproved rows, and on a
  > zero-review rating block, none of which the old form could catch.

  It further asserts: every `price` (or
  `lowPrice` / `highPrice`) equals the display amount the page rendered — the
  `getDisplayPrice()` result, **not** `PricePresentation.final`, which is
  coupon-bearing and can never appear in a cached page; every `priceCurrency` equals
  the market's currency; every `availability` matches the band the page showed; and
  no `Product` graph is emitted for a product with no live price in that market.

### 3.3 Sitemaps

`app/sitemap.ts` emits the **index** only; every URL set is a shard, because a
2,000-product catalogue with markets, facets and journal will pass 50,000 URLs
once a second market's alternates are counted, and a sitemap that silently
truncates is worse than none.

| Shard | Contents | `lastmod` |
| --- | --- | --- |
| `{market}-categories` | Published `categories` (per market, respecting `category_market_content.is_published`) | `updated_at` |
| `{market}-facets` | `curated_facet_markets` rows with `is_active` **for this shard's market** — joined to `curated_facets` for the slug and to `categories` for the parent path. **Not `curated_facets.is_active`**, which this row previously named: that column is the *global* kill switch, and 03 §4.2 added the per-market table precisely so that "a pair with nine US-priced pieces and zero INR-priced ones" does not become an ISR-rendered, canonical, sitemap-listed page with nothing on it. `generateStaticParams()` for `[category]/[facet]`, this shard and the stone page's section links read the same table for the market they are rendering, or the three disagree | `curated_facet_markets.refreshed_at` |
| `{market}-collections` | Published `collections` inside their `starts_at`/`ends_at` window | `updated_at` |
| `{market}-stones` | Published `stones` **that have at least one product available in the shard's market** (04 §6.1's four-part predicate), plus `/stones`. `stones` has no `market_code` (02 §2.4), so without the availability probe the India shard submits `/in/stones/larimar` on day one, when only USD prices exist — an indexed page listing nothing, which is the thin-content judgement §4.2 spends a paragraph avoiding for the stone × type pages. The same predicate drives the stone page's robots tag | `updated_at` |
| `{market}-products-<n>` | `status='active' AND published_at <= now() AND deleted_at IS NULL`, **`LEFT JOIN product_market_content` with `coalesce(pmc.is_published, true)`**, **`AND EXISTS` a live `prices` row for the shard's market** (02 §4.1), 10,000 per shard, ordered by `id` so shard membership is stable | `greatest(products.updated_at, latest product_media.created_at)` |
| `{market}-journal` | `journal_posts` where `status='published' AND deleted_at IS NULL AND (market_code IS NULL OR market_code = <shard market>)` — 02 §2.8 makes `market_code` nullable, meaning "all markets", so an equality test drops every global post from every shard. Served by `CREATE INDEX idx_journal_published_market ON journal_posts (coalesce(market_code, '**'), published_at DESC) WHERE status = 'published' AND deleted_at IS NULL;` — 02 §2.8's `idx_journal_published` has no market column and makes every market-scoped journal read a filter-after-scan | `published_at` / `updated_at` |
| `{market}-pages` | `cms_pages` where `status='published' AND is_indexable AND deleted_at IS NULL AND (market_code IS NULL OR market_code = <shard market>)` | `updated_at` |

**Two predicates in that row are corrections, not decoration.** `product_market_content`
rows are an *override* layer with a default of `true` (02 §2.4) and a row often does
not exist — every product created before a market was added has none. An inner
`JOIN … AND pmc.is_published` therefore returns **zero rows** for that market, and the
India shard ships empty while the index cheerfully lists it; the symptom is "Google
has not indexed India" three weeks later, and the cause is a `JOIN` keyword. The
`LEFT JOIN` + `coalesce` is the shape 02 §4.1 already uses for the PLP, and the two
must agree or the sitemap advertises URLs the PLP hides. The price `EXISTS` is §3.1's
rule expressed in SQL: an unpriced product is `noindex` in that market, so submitting
its URL contradicts its own meta tag.

`lastmod`'s `greatest(products.updated_at, latest product_media.created_at)` is a
per-product aggregate over every row in the shard and needs
`CREATE INDEX idx_product_media_recent ON product_media (product_id, created_at DESC);`
— 02 indexes `product_media (product_id, position)`, which orders by the wrong column
and makes this a sort per product. It is a one-line addition to the same table.

**The shard cap is 10,000 URLs, not 40,000, and that is a timeout decision rather than a
protocol one.** The sitemap protocol allows 50,000 URLs or 50 MB per file, so 40,000 is legal
— and a 40,000-row scan carrying a per-product `lastmod` aggregate and an `hreflang` alternate
per market is exactly the "unbounded read" 01 §2.7 forbids and exactly the shape §3.7 refuses
for the product feeds. A shard is rendered by one `enumerateSitemap()` walk in one request, so
the number has to be one a request can finish: 10,000 rows, `export const maxDuration = 60`,
`ORDER BY id` with a keyset cursor internally, and the alternate set resolved from the same
per-market availability batch `buildAlternates()` uses rather than a query per URL. At 2,000
products the catalogue occupies one shard per market; the cap is the ceiling that keeps the
first 20,000-product import from silently producing a truncated file. **If a shard ever fails
to render inside `maxDuration`, the fix is not a longer timeout** — it is to move shard
generation into `run-jobs` alongside the feeds, writing each shard as a stored asset the route
streams, which is the same escape hatch §3.7 already took and needs no route change.

Every entry carries `xhtml:link rel="alternate" hreflang="…"` for each market in
which the entity is published **and priced** — a product live in the US and hidden
in India, or live in India with no INR price, appears in the US shard with no India
alternate, which is exactly what `product_market_content.is_published` and the
absence of a `prices` row respectively mean. §3.5's reciprocity rule requires it:
an alternate pointing at a `noindex` page is a one-directional alternate.

**Updating automatically as content changes.** Three layers, deliberately
overlapping:

1. Shards are ISR with `revalidate: 3600` and tag `sitemap`.
2. Every publish-class mutation calls `revalidateTags([tags.sitemap()])` in step 6
   of the six-step contract (01 §2.3) — product publish/unpublish, category or
   collection publish toggle, curated facet activation, CMS page publish, journal
   publish, slug change.
3. `/api/cron/sitemap-ping` at `30 4 * * *` rebuilds the shards and purges the tag —
   but **only when `APP_ENV=production`**, so a preview deployment can never submit
   itself.

**What it does not do is ping `https://www.google.com/ping?sitemap=`, because that endpoint
no longer exists.** Google retired sitemap ping in 2023 and it now returns a 404; Bing
retired its equivalent in favour of IndexNow. A cron that calls a dead URL every night is
worse than one that calls nothing, because the job dashboard shows it succeeding — the
handler swallows the 404 — and nobody discovers that new products were never announced. The
handler therefore does three real things instead: it keeps `lastmod` accurate (which is the
signal Google actually consumes from a sitemap), it submits changed URLs to **IndexNow**
(`https://api.indexnow.org/indexnow`, one POST carrying the URL list and the key, honoured by
Bing and Yandex) when `INDEXNOW_KEY` is set and the key file is served at
`/{INDEXNOW_KEY}.txt`, and it records the submitted URL count on the `jobs` run record so an
empty submission is visible. Search Console needs no ping at all: the sitemap is registered
once, and Google re-crawls it on its own schedule.

> **NEEDS INPUT:** whether the client has (or wants) Bing Webmaster Tools. `INDEXNOW_KEY`
> is optional and unset by default; absent it, no submission is attempted and the
> integration reports `indexnow: unconfigured` rather than silently doing nothing.

A product that is unpublished disappears from the shard on the next purge and its
URL then returns `410 Gone` rather than `404` for 30 days (`products.deleted_at`
or `status='archived'` with a `published_at` in the past), after which it becomes
a plain `404`. `410` is the correct signal for "this existed and is gone" and
de-indexes measurably faster than `404`.

### 3.4 Robots policy

`app/robots.ts`, generated per environment (01 §5.5). When `APP_ENV !== 'production'`
the entire body is `User-agent: * / Disallow: /` and `next.config.ts#headers()`
adds `X-Robots-Tag: noindex, nofollow` to every response — belt and braces,
because a preview URL that gets indexed outranks nothing and embarrasses everyone.

Production `robots.txt`:

```
User-agent: *
Disallow: /admin
Disallow: /api/
Disallow: /cart
Disallow: /checkout
Disallow: /account
Disallow: /orders/
Disallow: /wishlist
Disallow: /search
Disallow: /preview
Disallow: /_preview/
Disallow: /*?*stone=
Disallow: /*?*material=
Disallow: /*?*attr
Disallow: /*?*price_min=
Disallow: /*?*price_max=
Disallow: /*?*sort=
Disallow: /*?*cursor=
Disallow: /*?*availability=
Allow: /api/feeds/
Sitemap: {NEXT_PUBLIC_APP_URL}/sitemap.xml
```

`Disallow: /_preview/` is 04 §7.3's requirement, and `/_preview` is in `NEVER_INDEX`
alongside `/preview`: 04's market-preview tree and 06's token content-preview tree are two
different route groups and disallowing one is not disallowing the other.

`NEVER_INDEX` in `src/lib/config/constants.ts` is the same list in path form and
is applied in `buildMetadata()` after the override merge (§3.1), so the meta tag
and the robots file cannot drift. The three layers — `robots.txt`, the `robots`
meta tag, and the `X-Robots-Tag` header on `/admin/**` — exist because
`robots.txt` only prevents crawling, not indexing: a URL linked from elsewhere can
be indexed without ever being fetched, and only the meta tag or the header
suppresses that.

**Which is also why the two layers cannot both be the primary control on one prefix, and
this file has to say which is which.** A `Disallow`ed URL is never fetched, so its `noindex`
is never read — combining them does not double the protection, it disables the stronger half.
The split, per prefix:

| Prefix | Primary control | Why |
| --- | --- | --- |
| `/admin`, `/api/`, `/_preview/`, `/preview` | `Disallow` | Nothing public links to them, so there is no external link for a URL-only index entry to grow from, and the crawl budget saved is real. `X-Robots-Tag: noindex` on `/admin/**` is the belt for the braces |
| `/cart`, `/checkout`, `/account`, `/orders/`, `/wishlist` | `Disallow` **and** `noindex` | Customers do paste these links. The `Disallow` stops the crawl; the `noindex` is there for the day one of these URLs is linked from a forum and Google indexes it URL-only — at which point the fix is to *remove* the `Disallow` for long enough for the `noindex` to be read, which is a runbook step, not a code change |
| `/search`, and every `?`-parameter pattern below | `Disallow` | These are infinite crawl space; keeping them out of the crawl is the point, and a query-parameter URL that gets indexed URL-only carries no content to be judged on |

Nothing in this file relies on a crawler reading a `noindex` on a path the same file
forbids it to fetch.

**Internal search results are never indexable.** `/search` is `noindex,nofollow`
and `Disallow`ed. This is both an SEO rule (query-parameter pages are infinite
crawl space and are treated as thin content) and a safety rule: an internal search
page renders whatever a stranger typed, so an indexed one is a vector for
publishing arbitrary text under this domain. `/search` additionally emits no
canonical, emits no `ItemList` JSON-LD, and renders the query in a text node —
never in a `<title>`, a meta description, an `og:title` or an OG image.

Query strings on a category are the other half of the same problem, which is why
any `searchParams` at all makes a listing dynamic, `noindex,follow`, and canonical
to the unfiltered URL (01 §1.3). `follow`, not `nofollow`: the links out of a
filtered page to products are the ones that should still be crawled.

### 3.5 Canonical and hreflang across markets

One domain, path-prefixed markets (01 §1.4). `buildAlternates(target, path)` queries
`listActiveMarkets()` — never a literal array — intersects it with the entity's
published-and-priced market set (§1.3, 04 §6.1) and emits, for a product live in
both markets:

```html
<link rel="canonical" href="https://{host}/products/larimar-drop-pendant" />
<link rel="alternate" hreflang="en-US" href="https://{host}/products/larimar-drop-pendant" />
<link rel="alternate" hreflang="en-IN" href="https://{host}/in/products/larimar-drop-pendant" />
<link rel="alternate" hreflang="x-default" href="https://{host}/products/larimar-drop-pendant" />
```

Rules that make this correct rather than decorative:

- **`hreflang` is `{markets.locale}`** — `en-US`, `en-IN` — not a bare language
  code. Both markets are English; only the region distinguishes them, and a bare
  `en` on two URLs is a self-contradiction Search Console reports as an error.
- **`x-default` is always the US URL**, matching `NEXT_PUBLIC_DEFAULT_MARKET`.
- **Alternates are reciprocal or absent.** An entity not published in India emits
  no `en-IN` alternate, and the India URL for it 404s. A one-directional alternate
  is ignored by Google and hides the real problem.
- **Each market's page is canonical to itself.** The India page does **not**
  canonicalise to the US page; they are the same product at different prices in
  different currencies, which is precisely what `hreflang` exists to express.
  Canonicalising one to the other would de-index the India catalogue.
- **`/us/*` 301-redirects to `/*`** in middleware (01 §1.4), so the duplicate never
  exists to be canonicalised away.
- **Market is never chosen by IP.** The switch banner is dismissible and writes
  `md_market`; the cookie never selects the market of a rendered page. Geo-
  redirecting a crawler is cloaking.
- Canonicals are **absolute**, built from `NEXT_PUBLIC_APP_URL`, and **carry no
  query string** — `buildCanonical()` strips everything after `?`.

Adding the UK is one `markets` row: the alternates, the sitemap shards and the
`x-default` all follow, with no code change (01 §1.4).

### 3.6 The slug-change redirect workflow

A slug is a URL, and a URL that changes without a redirect is a page that was
ranking and now 404s.

**Step 1 — the prompt, in the admin.** Changing `products.slug`, `categories.slug`,
`collections.slug`, `stones.slug`, `materials.slug`, `journal_posts.slug` or
`cms_pages.path` on an entity that has **ever been published** (`published_at IS NOT NULL`,
or `status` has ever been `published`) opens a blocking confirmation before the
save is accepted:

> The address of this page is changing.
> Old: `/products/larimar-drop-pendant`
> New: `/products/larimar-pendant`
> `[✓] Create a permanent redirect (301) from the old address`  ← checked by default
> Unchecking this will make the old address return "not found".

The checkbox state is `setProductSlug(..., { createRedirect })`. For a never-published
entity the prompt does not appear and no redirect is written — a draft has no
history to preserve, and a redirect from a URL nobody ever saw is table noise.

**Step 2 — the write.** `createRedirect(from, to, 'slug_change', tx, actor)` runs
**inside the same transaction as the slug update**, and performs the cycle break
and chain flattening defined in 02 §2.8: delete the reverse edge, repoint anything
whose `to_path` equals the new `from_path`, then insert or upsert on
`idx_redirects_from_unique`. Both writes commit together or neither does — a slug
change that succeeded while its redirect failed is the exact state this workflow
exists to prevent. `setProductSlug()` then calls
`revalidateTags([tags.redirects(), tags.product(id), tags.productSlug(m, oldSlug), tags.productSlug(m, newSlug), tags.sitemap(), tags.feed(m)])`
**after the transaction commits, outside it** — step 6 of the six-step contract
(01 §2.3), which is a step of the service, not a statement inside the transaction. A
purge issued inside the transaction races its own commit: the cache refills from the
pre-commit snapshot and the old slug is served until the TTL expires.

**Step 3 — market prefixes.** `redirects.from_path` and `to_path` are stored
**unprefixed** (`/products/old` → `/products/new`). The edge matcher strips the
market segment before lookup and re-applies it to the destination, so one row
covers `/products/old` and `/in/products/old`. A per-market row would double the
table and let the two markets' URL histories drift.

That storage rule has to be enforced on the way **in**, or the migration import in
step 5 quietly does nothing. A crawl export of an existing site arrives with real
URLs, and any of them under an active market prefix (`/in/rings/old`) is stored
verbatim, never matched — the matcher stripped the prefix before it looked. So
`createRedirect()` and the CSV importer both normalise: a leading segment equal to an
active `markets.code` is stripped from `from_path` and `to_path` before the write, and
a row that then collides with an existing `idx_redirects_from_unique` key is reported
in the import preview as a conflict with the row it would overwrite — never silently
upserted, because two different legacy URLs collapsing onto one path is a decision a
human has to make.

**Step 4 — serving.** `src/lib/edge/redirects.ts` holds the module-scope snapshot
described in 01 §2.1: consulted only after the path fails to match a known route
pattern, refreshed from `GET /api/catalog/redirects` with
`{ next: { tags: ['redirects'], revalidate: 60 } }` and `AbortSignal.timeout(400)`,
paged to completion into a **new** map and swapped in atomically (§2.2 — a `?since=`
delta cannot express a deleted row, and `createRedirect()` hard-deletes the reverse
edge), **fail-open**. A hit returns `NextResponse.redirect(url, row.status_code)`.

**Counting the hit is not something middleware can do, and the original text asked it
to.** 01 §2.2 bans `middleware.ts` and `src/lib/edge/**` from importing Prisma or any
service; a `waitUntil()` that "increments `redirects.hit_count`" has nothing to call,
and "batched by `run-jobs`" describes a batch with no source rows. So the edge does
the one thing it is allowed to do — a fire-and-forget `fetch` — and a Node route
handler owns the write:

```ts
// in the redirect branch of middleware.ts
event.waitUntil(fetch(new URL('/api/catalog/redirect-hit', req.url), {
  method: 'POST', keepalive: true,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ id: row.id }),
}).catch(() => {}));            // a failed count never affects the redirect
```

> **SCHEMA ADDITION:** one table 02 does not define, so that counting a hit is an
> upsert into an hourly bucket rather than an `UPDATE` on the row every visitor is
> reading.
>
> ```sql
> CREATE TABLE redirect_hits (
>   redirect_id  UUID        NOT NULL REFERENCES redirects(id) ON DELETE CASCADE,
>   hour_bucket  TIMESTAMPTZ NOT NULL,          -- date_trunc('hour', now())
>   count        INTEGER     NOT NULL DEFAULT 0,
>   PRIMARY KEY (redirect_id, hour_bucket)
> );
> CREATE INDEX idx_redirect_hits_bucket ON redirect_hits (hour_bucket);
> ```

`POST /api/catalog/redirect-hit` is public, rate-limited `redirect-hit:ip:<ip64>` at
60/min, validates that `id` is a UUID and does one statement —
`INSERT INTO redirect_hits … ON CONFLICT (redirect_id, hour_bucket) DO UPDATE SET count = redirect_hits.count + 1`
— returning `204` and touching nothing else; an unknown id fails the FK and is
swallowed as `204`, because a stale edge snapshot pointing at a deleted redirect must
not produce a 500 in a beacon. `run-jobs` folds buckets older than the current hour
into `redirects.hit_count` / `last_hit_at` and deletes them, which is what keeps the
prunable-row report in step 5 honest without one row `UPDATE` per redirected request.

**Step 5 — the admin surface.** `/admin/content/redirects` lists every row with
`source`, `hit_count`, `last_hit_at` and `created_by_user_id`, supports CSV import
(`source='import'`) for a migration from an existing site, and flags any row whose
`hit_count` is still `0` after 90 days as prunable. A row whose `to_path` now
404s is flagged red by the nightly consistency check, because a 301 to a 404 is
worse than the original 404.

> **NEEDS INPUT:** whether an existing Millennium Designs site is being replaced
> and, if so, its full URL inventory (a crawl export or server log sample). Those
> rows are the highest-value SEO asset in this migration and they load through
> `/admin/content/redirects` CSV import. The expected row count also decides the
> edge snapshot strategy (01 §2.1).

### 3.7 Product feeds

`/api/feeds/[market]/google-merchant.xml` emits, per published variant in that
market: `id` (`product_variants.sku`), `title`, `description`, `link` (the
market's absolute product URL), `image_link` plus up to 10 `additional_image_link`,
`availability` from `getAvailability()`, `price` from `getDisplayPrice()` in the
market's currency, `sale_price` when `saleMinor < listMinor`, `brand` from
`settings['org.name']`, `condition: new`, `google_product_category` from
`settings['feed.google_category.<category_slug>']`,
`identifier_exists: no` when `barcode` is null, `shipping_weight` from
`gross_weight_grams`. Only variants that are published **and priced** in that market
are emitted — the same two predicates as §3.1 and §3.3; a feed row for a piece whose
landing page says "not available in this market" is a guaranteed item disapproval.

`google_product_category` has **nothing to do with `categories.tax_code`**,
and the original sentence tied them together. `tax_code` is a Stripe Tax
product tax code / HSN (02 §2.4, 04 §8.2, 01 §4.4) — it exists because finished jewellery,
loose stones and bullion are taxed differently — while `google_product_category` is a node
in Google's own product taxonomy. They are two unrelated code spaces that happen to
both be per-category, and mapping one onto the other produces a feed-wide
disapproval and a wrong tax rate from a single copied value. The Google code comes
from its own `settings` row and from nowhere else; absent that row the element is
omitted, per the NEEDS INPUT below.

**Cached ISR 3600 with tags `feed:{m}`, `market:{m}` and `sitemap`** — `feed:{m}` is
the addition, and it is what makes the feed safe on a one-of-a-kind catalogue.
`market:{m}` and `sitemap` are purged by market and publish events; neither is purged
when a piece sells. 01 §2.4 is explicit that **any** stock movement on a ONE OF A KIND
variant purges `product:{id}` immediately, precisely because there is no such thing as
an in-band decrement on an inventory of 1 — but a feed cannot carry one cache tag per
product, so without its own tag it keeps advertising a sold unique piece to Google
Shopping for up to an hour, and the click lands on "This piece has been taken".
`tags.feed(m)` is added to the vocabulary in 01 §2.4 and is purged alongside
`product:{id}` by every price write, publish toggle, slug change and band-crossing or
one-of-a-kind stock movement. `revalidate` stays 3600 as the floor, not the mechanism.

The Meta CSV carries the same fields in Meta's column names and the same tags. Both
are `Allow`ed in `robots.txt` and are the only `/api/` paths that are.

Both are also unbounded reads in the sense 01 §2.7 forbids — a 40,000-row feed built
in one request. They are therefore generated the way the CSV export is: a `run-jobs`
task writes each market's feed to Cloudinary as a raw asset, and the route handler streams
the stored asset through with the market's tags.

**"On any `feed:{m}` purge" is not a trigger, and writing it as one is how the feed silently
stops regenerating.** `revalidateTag()` is a fire-and-forget cache instruction; nothing
subscribes to it and no code runs when it fires. The regeneration is therefore an explicit
`jobs` insert of kind `feed_rebuild` in **step 6 of the six-step contract** (01 §2.3),
alongside the `revalidateTags([tags.feed(m), …])` call and in the same service functions —
price write, publish toggle, slug change, and any band-crossing or one-of-a-kind stock
movement. `sitemap-ping` enqueues the same job nightly as a floor.

**`feed_rebuild` de-duplicates per market, not per kind, and the difference is a market
whose feed never rebuilds.** `idx_jobs_singleton` (02 §2.9) is keyed on `kind` alone;
extending it to `feed_rebuild` — which is what this section previously said — means a
queued US rebuild swallows the India one, and India's feed then regenerates only when
the US queue happens to be empty at the moment an India price changes. The correct
object is `uq_jobs_dedupe (kind, dedupe_key)` with
`dedupe_key = 'feed_rebuild:' || market_code` (`11 §3.2`, `dedupeKey: 'market'`), so a
bulk price edit across 800 products queues **one rebuild per market** rather than 800 and
rather than one. `feed_rebuild` is declared as a `job_kind` value in 02 §1.9 — it was used
here and in `run-jobs` and declared nowhere, which is an `ALTER TYPE` that never ships and
an `INSERT INTO jobs` that fails at runtime on an invalid enum value. The route streams whatever asset exists; a market whose feed has never
been built returns `503` with `Retry-After`, not an empty but well-formed XML document, because
an empty feed is how Merchant Center learns the catalogue was discontinued. A feed assembled inside the request is the function
timeout that only appears once the catalogue is real.

> **NEEDS INPUT:** Google Merchant Center and Meta Commerce Manager account
> ownership, and the Google product category mapping per launch category. Until
> the mapping rows exist the `google_product_category` element is omitted rather
> than guessed — a wrong taxonomy code is a feed-wide disapproval.

---

## 4. Frontend route map

All storefront routes live under `src/app/(storefront)/[market]/`. Paths below are
the **US canonical** form; the India form is the same path prefixed with `/in`.
Rendering strategy and revalidation follow 01 §1.3 and are restated here per
concrete route.

### 4.1 Segment precedence and reserved slugs

Next matches literal segments before dynamic ones, so the first segment resolves
in this order: `products`, `collections`, `stones`, `search`, `cart`, `checkout`,
`account`, `orders`, `wishlist`, `journal`, `pages`, `sitemaps`, `preview`,
`unsubscribe` — then `[category]`. `_preview` and `api` are reserved too: they are
root-level segments outside `[market]` (04 §7.2, 01 §2.1), so they never reach the
category matcher, but a `categories.slug` of `api` would produce a URL that 404s for a
reason nobody would find.

That means a `categories.slug` of `search` would be permanently unreachable.
`src/lib/catalog/reservedSlugs.ts` exports the list, `saveCategory()` and every
other slug writer reject a reserved value with `SlugTakenError`, and
`tests/unit/reserved-slugs.test.ts` asserts the list equals the set of literal
first segments in the route tree — so adding a route without reserving its name
fails CI rather than breaking a category six months later.

**`stones` is the collision this rule already has, and it has to be resolved here
rather than discovered by the seed.** 00-CONTEXT §6 lists `STONES` among the ten
customer-facing category spellings, and 02 §6 seeds it as a `categories` row; `stones`
is also a reserved literal segment, so `saveCategory()` would reject it and the seed
would fail — or, worse, bypass the writer and create a row whose URL renders the stone
index instead of the category. **Decision: there is no `categories` row with slug
`stones`.** Stone is a first-class entity with its own route tree (`/stones`,
`/stones/[slug]`, `/stones/[slug]/[category]`), which is the whole point of stone-led
discovery; a parallel `categories` row for the same idea is the duplication §4.2
resolves. The customer-facing "STONES" item in the main menu is a
`navigation_items` row of `link_type='url'` pointing at `/stones`, seeded by
`prisma/seed/03-categories.ts`'s sibling menu seed, and that file's category seed creates
**nine** `categories` rows, not ten. `tests/unit/reserved-slugs.test.ts` additionally
asserts that no seeded category slug appears in `reservedSlugs`, so the two lists cannot
drift back into collision.

**Both halves of that decision have now landed where they are built from.** `02 §6`'s
seed table reads nine categories plus the menu row, and `02 §6` records the resolution
next to the schema; `09`'s P05 exit criterion, which reads "all ten launch categories …
exist", is satisfied by nine `categories` rows and one `navigation_items` row — ten
customer-facing entries, which is what 00-CONTEXT §6 actually lists.

> **RESOLVED — was CHANGE REQUIRED IN 03 §7.1:** the category table there tabulates ten rows including
> *Verified applied in 03.*
> `STONES` → slug `stones`, rank 6. Remove that row, renumber the ranks below it, and
> note the `navigation_items` entry in its place. As written, `saveCategory()` rejects
> the seed's own row with `SlugTakenError` or the seed bypasses its own writer.

> **RESOLVED — was CHANGE REQUIRED IN 09 §1.2 P05(a):** restate the exit criterion as "nine seeded
> *Verified applied in 09.*
> `categories` rows plus the `/stones` navigation item", so the phase gate and the
> validator agree.

**Editorial fallback.** `[category]/page.tsx` resolves `categories.slug` first and,
on a miss, calls `resolveEditorialPath(['<segment>'], market)` which reads
`cms_pages` by `path`; still a miss is `notFound()`. `[category]/[facet]/page.tsx`
does the same for two-segment paths, and `pages/[...slug]/page.tsx` handles depth
≥ 3 and is the explicit escape hatch. One resolver function, three call sites.
The alternative — a single `[...path]` catch-all — loses per-route
`generateStaticParams` granularity and makes every 404 walk four lookups; this
costs one extra `cms_pages` read only on paths that are not categories.

### 4.2 Storefront routes

| Path | File | Rendering | Data dependencies | Cache / revalidate |
| --- | --- | --- | --- | --- |
| `/` | `page.tsx` | ISR | `cms.getPageByPath('/')`, `cms.getNavigation('main')`, block data per block type, `catalog.listCollectionProducts` for featured rails, `getDisplayPrice` | 300s; tags `cms:page:{id}`, `market:{m}`, `nav:{m}` |
| `/rings` `/chains` `/pendants` `/bracelets` `/earrings` `/closeouts` `/one-of-a-kind` `/14k-gold` `/lab-grown-diamonds` | `[category]/page.tsx` | ISR + `generateStaticParams` over published `categories` ∪ single-segment `cms_pages.path` | `resolveCategoryBySlug`, `listCategoryProducts` (page 1), `getFacetCounts`, `getDisplayPrice`, `getAvailability` (band, streamed) | 900s; tags `category:{id}`, `market:{m}` |
| `/rings?stone=…&price_min=…` | same file, `searchParams` present | **Dynamic**, `no-store` | same + filters | none; `noindex,follow`, canonical → `/rings` |
| `/rings/moonstone` etc. | `[category]/[facet]/page.tsx` | ISR + `generateStaticParams` over active `curated_facets` | `resolveCuratedFacet`, `listCategoryProducts` with the facet pre-applied | 900s; tags `category:{id}`, `stone:{id}` / `material:{id}` |
| `/collections/[slug]` | `collections/[slug]/page.tsx` | ISR + `generateStaticParams` over published collections | `listCollectionProducts` (honouring `collections.sort_order`), `collection_market_content` | 900s; tags `collection:{id}`, `market:{m}` |
| `/stones` | `stones/page.tsx` | ISR | `stones.listStones`, product counts per stone | 1800s; tags `stones:index`, `market:{m}` |
| `/stones/[slug]` | `stones/[slug]/page.tsx` | ISR + `generateStaticParams` | `getStoneBySlug`, `getStoneCategoryCounts`, `listStoneProducts` (all types, page 1) | 1800s; tag `stone:{id}` |
| `/stones/[slug]/[category]` | `stones/[slug]/[category]/page.tsx` | ISR | `listStoneProducts({ stoneId, categoryId })` | 1800s; tags `stone:{id}`, `category:{id}` |
| `/products/[slug]` | `products/[slug]/page.tsx` | ISR + `generateStaticParams` (top N by `products.rank`, rest on demand) | `getProductForPdp`, `getDisplayPrice`, `product_stones`, `variant_materials`, `product_attribute_values`, `product_media`, related products; **`getAvailability` inside a `<Suspense>` with `no-store`** (01 §2.4) | 900s; tags `product:{id}`, `product-slug:{m}:{slug}`, `market:{m}` |
| `/search` | `search/page.tsx` | Dynamic, `no-store` | `search.searchProducts`, `getFacetCounts`, `logSearch` | none; `noindex,nofollow` |
| `/cart` | `cart/page.tsx` | `force-dynamic`, `no-store` | `cart.getCart`, `resolvePriceBatch`, `getAvailability` | never cached |
| `/checkout` → the furthest step the **server** considers reached | `checkout/[[...step]]/page.tsx` | `force-dynamic`, `no-store` | `checkout.getCheckoutSession` | never cached. The step in the URL is a view selector, never an authorisation (05 §3.2) |
| `/checkout/information` | same | `force-dynamic`, `no-store` | `checkout.startCheckout`, `customers.listAddresses` | never cached |
| `/checkout/delivery` | same | `force-dynamic`, `no-store` | `checkout.quoteShippingForSession` | never cached. **`delivery`, not `shipping`** — 05 §3.2 fixes the four step names and this document previously used a fifth |
| `/checkout/payment` | same | `force-dynamic`, `no-store` | `tax.quoteTax` via `checkout`, `getProviderForMarket`, the provider's client SDK mount | never cached |
| `/checkout/processing` | same | `force-dynamic`, `no-store` | polls `GET /api/checkout/status/[orderId]` every 2s for 90s (05 §4.2), then the "still confirming" panel | never cached. The provider redirect target; it renders no total and no address |
| `/orders/[token]` | `orders/[token]/page.tsx` | Dynamic, `no-store` | `orders.getByPublicToken` — reads **only** `order_items` snapshot columns, never joins `products` (01 §2.7) | never cached; `noindex` |
| `/account` | `account/page.tsx` | `force-dynamic`, `no-store` | `customers.getProfile`, recent orders | never cached; `noindex` |
| `/account/orders` · `/account/orders/[id]` | `account/orders/…` | `force-dynamic` | `orders.listForCustomer`, then `WHERE id = $1 AND customer_id = $2` — 07 §4.2's predicate verbatim, and the reason the segment is `[id]` rather than `[orderNumber]`: the ownership `WHERE` is written against the primary key in 07, and two documents addressing one row by two different columns is how one of them ends up without the owner in the predicate. Renders snapshot columns only, never a `products` join (01 §2.7) | never cached |
| `/account/orders/[id]/invoice` | `account/orders/[id]/invoice/route.ts` | Dynamic, `no-store` | Same ownership predicate, then rendered from `order_items` snapshots only (07 §4.2). A route handler rather than a page because it streams a PDF | never cached; `noindex` |
| `/account/orders/[id]/return` | `account/orders/[id]/return/page.tsx` | `force-dynamic` | `returns.startReturn` gated on the same order-ownership predicate (07 §4.2) | never cached; `noindex` |
| `/account/addresses` | `account/addresses/page.tsx` | `force-dynamic` | `addresses` | never cached |
| `/account/profile` | `account/profile/page.tsx` | `force-dynamic` | `customers` | never cached |
| `/account/security` | `account/security/page.tsx` | `force-dynamic` | `sessions`, credential state | never cached |
| `/account/preferences` | `account/preferences/page.tsx` | `force-dynamic` | `accepts_marketing`, `marketing_consent_source`, `default_market_code` | never cached |
| `/account/returns` · `/account/returns/[id]` | `account/returns/…` | `force-dynamic` | `returns`, `return_items` | never cached |
| `/account/gift-cards` | `account/gift-cards/page.tsx` | `force-dynamic` | `gift_cards` balance in the card's own currency | never cached |
| `/wishlist` (`/account/wishlist` **308-redirects** here) | `wishlist/page.tsx` | `force-dynamic`, `no-store` | `customers.getWishlist` with `WHERE customer_id = $1`, `getDisplayPrice`, `getAvailability` | never cached; `noindex`. 07 §4.2 names this surface `/account/wishlist`; the canonical path is `/wishlist` because that is what `robots.txt`, the header control and the empty states in §4.4 all reference, and the redirect means both spellings resolve rather than one of them 404ing after someone follows 07 |
| `/wishlist/shared/[token]` | `wishlist/shared/[token]/page.tsx` | Dynamic, `no-store` | `getWishlistByShareToken` — only when `wishlists.is_public` | never cached; `noindex` |
| `/heritage` | `[category]/page.tsx` → `cms_pages` | ISR | `getPageByPath('/heritage')` + block registry | 600s; tag `cms:page:{id}` |
| `/about` (+ children, e.g. `/about/our-workshop`) | `[category]/…` / `pages/[...slug]` | ISR | `getPageByPath` | 600s; tag `cms:page:{id}` |
| `/journal` · `/journal/page/[n]` | `journal/page.tsx`, `journal/page/[n]/page.tsx` | ISR + `generateStaticParams` over the real page count | `listJournalPosts` — the single documented `OFFSET` exception (§2.3); `n` beyond the last page is `notFound()`, not an empty page | 1800s; tags `journal:index`, `market:{m}` |
| `/journal/[slug]` | `journal/[slug]/page.tsx` | ISR + `generateStaticParams` | `getJournalPost`, `related_product_ids` → `getDisplayPrice` | 1800s; tag `cms:post:{id}` |
| `/journal/tag/[slug]` | `journal/tag/[slug]/page.tsx` | ISR | `listJournalPosts({tagSlug})` | 1800s; tags `journal:index`, `market:{m}` |
| `/privacy-policy` `/terms-of-service` `/shipping-and-returns` `/faq` `/contact` `/care` `/size-guide` `/accessibility` `/cookie-policy` | `[category]/page.tsx` → `cms_pages` with `page_type='system'` | ISR | `getPageByPath` | 600s; tag `cms:page:{id}` |
| `/preview/[token]/[[...path]]` | `preview/[token]/[[...path]]/page.tsx` | Dynamic, `force-dynamic`, `no-store` | `content_preview_tokens` looked up by `sha256(token)`, then the `content_versions` snapshot — **not `draftMode()`**, which 01 §1.3 forbids anywhere reachable from an ISR route and 06 §1185 rejects explicitly | never cached; `noindex,nofollow` from the page **and** `X-Robots-Tag` from middleware on `/*/preview/*`; expiry and `max_views` are columns on the token row (06 §1204), not a hardcoded 24 hours |
| `/_preview/[market]/…` (eight files: home, PDP, category, facet, collection, stone, CMS page, journal post) | `src/app/(preview)/_preview/[market]/…` | `force-dynamic`, `no-store` | `requirePreviewSession()` → `requirePermission(actor, 'market.preview')` as the first statement of every page, then the same components as the public tree with `previewContext` | never cached; `X-Robots-Tag: noindex, nofollow, noarchive`; `Disallow: /_preview/`. This is 04 §7.2's market-preview tree; it was absent from this map, which is how a route group ends up with no `robots.txt` entry |
| `/unsubscribe/[token]` | `unsubscribe/[token]/page.tsx` | Dynamic, `no-store` | `jose` token carrying the subscriber id; no session required, because requiring one to unsubscribe is how you collect spam complaints (07 §4.2) | never cached; `noindex,nofollow` |
| `/sitemaps/[shard].xml` | `sitemaps/[shard]/route.ts` | ISR 3600, `maxDuration: 60` | `seo.enumerateSitemap` | tags `sitemap`, `market:{m}` |

**Every `revalidate` in the table above is a ceiling, not a constant.** 04 §5.4 caps
display-price-bearing ISR routes at **300 seconds** in any market with a time-windowed
`pricing_rules` row live or scheduled within the next 24 hours — the home page, every
category, curated facet, collection, stone and product page, and the journal post pages that
render a related-product price. `cacheLifeFor(route, market)` in `src/lib/cache/cached.ts`
returns `min(baseline, 300)` under that condition and the baseline otherwise, so the number
is computed in the one file that owns caching rather than typed into thirty `export const
revalidate` statements that will not all be edited together. The 900s and 1800s figures below
are the baselines; `/api/cron/pricing-rule-windows` (§2.2) is what makes them safe the rest of
the time.

**`stone:*` and `cms:post:*` are not tags, and two rows above used to name them.**
`revalidateTag()` matches a tag string exactly; there is no wildcard, and a purge of
`cms:post:*` matches nothing at all — so the journal index and the stone index would
have been invalidated by their TTL alone, showing a post or a stone up to thirty
minutes after it was published, with no way for an editor to force it. Two tags are
added to the `tags.ts` vocabulary (01 §2.4 — that file is the only place a tag string
is constructed, so this is where they belong):
`stonesIndex: () => 'stones:index'` and `journalIndex: () => 'journal:index'`, purged
by stone save/publish and journal publish/unpublish respectively, in step 6 of the
six-step contract alongside the per-entity tag.

**Stone × type versus curated facet — the duplicate-content fork.**
`/rings/moonstone` and `/stones/moonstone/rings` return the same product set.
Indexing both splits the signal and risks a thin-content judgment on whichever is
weaker. **Decision: the curated facet URL is canonical when one exists.**
`/stones/[slug]/[category]` always renders (it is the stone page's type tabs and
is genuinely useful navigation) but emits `<link rel="canonical">` to
`/{category}/{stone}` and `noindex,follow` when no active `curated_facets` row
exists for that pairing; when one does exist it canonicalises to it and still
carries `noindex,follow`. The merchandiser's act of creating a curated facet is
therefore the act of deciding this intersection deserves an indexable page — a
human decision, recorded as a row, rather than 7 stones × 9 categories = 63
auto-generated pages nobody wrote copy for.

### 4.3 Special collections

There is **no route per special collection**. "Special" is data: a `collections`
row with `mode='automatic'`, `collection_rules`, a `sort_order`, and optionally a
`starts_at`/`ends_at` window. Three are structurally derivable and are seeded as
rules, not as content:

| Collection | Mechanism |
| --- | --- |
| New arrivals | `mode='automatic'`, rule `created_at gte <now - 30d>` re-evaluated by the nightly `collection_refresh` job, `sort_order='newest'` |
| Best sellers | `mode='automatic'`, no rules, `sort_order='best_selling'` ranked from `order_items` over a trailing 90 days per market |
| One of a kind | Already a `categories` row (`/one-of-a-kind`, from 00-CONTEXT §6); the collection form is redundant and is **not** created — two URLs for one idea is the duplication §4.2 just resolved |

> **NEEDS INPUT:** the client's actual campaign collections (names, slugs,
> membership rules, start/end dates, hero imagery and copy). None are invented;
> `collections` seeds with the two automatic rows above and nothing else.

### 4.4 Error and empty states

**A state is three `settings` rows, not one, and this section previously modelled it as
one.** 10 §5.6 specifies every one of these screens as a **headline, a supporting line
and an action label**, in a deliberate editorial voice; this section specified a single
sentence per state under `copy.*`. Both claimed the same rows, and whichever seeded first
would silently have become the product's voice — with the single-string model unable to
store what 10 designed even if 10 won.

**Decision: 10 §5.6 is the voice and this section is the storage.** Each state is up to
three rows under `group_key='copy_states'`, keyed
`copy.state.<state_key>.headline`, `.body` and `.action`, seeded with the defaults below
and editable at `/admin/settings/general`. A `NULL` or blank `body` **renders nothing** —
it does not fall back to a placeholder, which is the same rule as every other empty CMS
field (hard rule 8). `<state_key>` is the value in the first column, lower-snake.
`global-error.tsx` renders from `src/lib/config/constants.ts` only, because the database
may be the thing that failed.

The headline column is 10 §5.6's, verbatim, where 10 specifies one; the remaining states
are ones 10 does not cover and keep this document's wording. The defaults assert nothing
about the business — no counts, no promises, no history.

| State (`<state_key>`) | Route / trigger | Status | `.headline` | `.body` | `.action` / actions offered |
| --- | --- | --- | --- | --- | --- |
| **404** (`not_found`) | `not-found.tsx`; unknown slug after the redirect snapshot misses | 404 | `NOTHING FOUND` | "Some pieces are rare. Some pages are simply elsewhere." | `RETURN HOME`; plus a search field, the main menu and a link to `/stones` |
| **410** (`gone`) | Product unpublished or archived within 30 days | 410 | `NO LONGER AVAILABLE` | "This piece is no longer available." | "See similar pieces" → its primary category; the category link is the value of this page |
| **500** (`server_error`) | `error.tsx` | 500 | `SOMETHING WENT WRONG` | "We have been notified. Please try again shortly. Reference {requestId}." | `RETURN HOME`, and a retry. No stack, no code, no table name |
| **Global 500** (`global_error`) | `global-error.tsx` (root layout failed) | 500 | Same, from constants with the inline wordmark SVG — no font fetch, no CMS read | — | Reload only |
| **Empty cart** (`cart_empty`) | `/cart` with no `cart_items` | 200 | `YOUR BAG IS WAITING.` | — | `EXPLORE THE COLLECTION` → `/`; "Your saved pieces" → `/wishlist` when signed in |
| **Empty wishlist** (`wishlist_empty`) | `/wishlist`, no items | 200 | `YOUR COLLECTION BEGINS HERE.` | "Select the outline heart on any piece to keep it here." | `EXPLORE THE COLLECTION`; link to `/stones` |
| **No search results** (`search_empty`) | `/search`, `result_count = 0` | 200 | `NOTHING MATCHED YOUR SEARCH.` | "No pieces match \"{query}\"." | `didYouMean` when trigram similarity ≥ 0.4; the top 3 stones and top 3 categories; **logged to `search_queries` with `result_count = 0`** (§6.5) |
| **Filtered to nothing** (`filters_empty`) | PLP with filters, zero rows | 200 | `NOTHING MATCHED THESE FILTERS.` | — | "Clear filters" (preserving the category), and the facet counts showing which single filter is responsible |
| **Out of stock (PDP)** (`out_of_stock`) | `getAvailability` = `out` | 200 | `CURRENTLY UNAVAILABLE` | — | Add-to-bag replaced by "Notify me when this returns" (writes `back_in_stock_requests`, **not** `newsletter_subscribers` — see below) and a link to the category. Never a disabled button with no explanation |
| **Sold (one of a kind)** (`sold`) | `getAvailability` = `sold` — `products.sold_at IS NOT NULL` (`11 §7.1`) | 200 | `SOLD` | "This piece has found its owner." | Link to the collection. Add-to-bag is **removed, not disabled**; JSON-LD `SoldOut` |
| **Made to order (PDP)** (`made_to_order`) | `inventory_policy='made_to_order'` | 200 | `MADE TO ORDER` | `lead_time_days` when set, otherwise **no time claim at all** | Add to bag remains live |
| **Not sold in this market** (`unavailable_in_market`) | `product_market_content.is_published = false` for the URL's market | 404 in that market | `product_market_content.unavailable_reason` when set, else the `not_found` rows | — | Link to the other market's URL **only** when it is published there |
| **Lost the race at checkout** (`insufficient_stock`) | `InsufficientStockError` | 409 → re-render `/cart` | `THIS PIECE HAS JUST BEEN TAKEN.` | "It has been removed from your bag." | The bag, re-priced, with the affected line struck through |
| **Price moved** (`price_changed`) | `PriceChangedError` | 409 → re-render `/cart` | `PRICES HAVE BEEN UPDATED.` | "Please review your bag before continuing." | Per-line before/after, then "Continue to checkout" |
| **Market changed with a live bag** (`market_changed`) | `MarketChangedError` | 409 → `/cart` | `YOUR BAG HAS BEEN REPRICED FOR {market}.` | The names of any pieces dropped because they have no price in the new market | Confirm and continue |
| **Payments unconfigured** (`payments_unconfigured`) | `getProviderForMarket()` → `null`; `PaymentsUnconfiguredError` | 200 blocking panel on `/checkout/payment` | `PAYMENT IS NOT YET AVAILABLE HERE.` | "Online payment is not yet available for this region. No order has been created." | Back to bag; contact link. **No order row, no cart clear, no confirmation mail** (01 §4.9) |
| **Confirmation still pending** (`payment_pending`) | `/api/checkout/status/[orderId]` poll exceeds 90s (05 §4.2) | 200 | `WE ARE STILL CONFIRMING YOUR PAYMENT.` | "You will receive an email as soon as it completes." | The order reference, and a "check again" control. Never "order failed" — the webhook may still land |

**`copy.state.*` and `copy.error.*` are two vocabularies and they do not overlap.**
`copy.error.<code>` (§1.4) is the one sentence a `Result` or a thrown `AppError` resolves
to — it is per *code* and it is what a toast or an inline field message renders.
`copy.state.<state_key>.*` is per *screen* and carries the headline and the action label a
full-page state needs. Four of the rows above are triggered by an error class and appear
in both: the screen renders the `copy.state.*` triple, and the `copy.error.*` string is
what the same failure says when it happens inside a form rather than on a page of its own.
`tests/unit/error-copy-seeded.test.ts` covers the first set;
`tests/unit/state-copy-seeded.test.ts` covers the second and fails on a `<state_key>`
with no `.headline` row.

> **RESOLVED — was CHANGE REQUIRED IN 10 §5.6:** the table there is the seed data for these rows, not a
> *Verified applied in 10.*
> separate specification — add the `copy.state.<state_key>.*` key beside each row so a
> designer editing a headline knows which `settings` row they are editing, and add the
> five states 10 does not currently carry (`gone`, `filters_empty`, `made_to_order`,
> `market_changed`, `payments_unconfigured`, `payment_pending`). 10's `SOLD` /
> "This piece has found its owner." row is adopted here unchanged, and it is the state
> that requires `AvailabilityBand`'s fifth value.

**"Notify me" is not a newsletter signup, and modelling it as one is a consent
defect as well as a schema error.** `newsletter_subscribers` has no `properties`
column (02 §2.3) — the row the original text described is unwritable — and it carries
`status`, `confirmed_at` and a double-opt-in lifecycle because it is a *marketing
consent record*. Writing a back-in-stock request into it silently enrols a shopper who
asked to be told about one piece into the marketing list, which is the failure mode
every consent regime in §7.4's NEEDS INPUT is written to punish, and it is
irreversible in the sense that matters: nobody can later tell which addresses consented
and which merely wanted a pendant.

**"Notify me" had three mechanisms across the set and now has one.** 03 §2.5 wrote it as
a `wishlist_items` row; 02 §2.7 agreed, justifying `idx_wishlist_items_product` partly as
"the back-in-stock notification list"; this section rejected both and added a table. The
`wishlist_items` mechanism is the one that cannot work: a wishlist requires a customer
(02 §2.7, "Guest wishlists are not modelled"), so it silently drops **every signed-out
shopper** — which on an out-of-stock PDP is most of them. **Decision: one table,
`back_in_stock_requests`, and it is now defined in 02** — `§2.7` and the consolidated
register in `02 §7` — rather than declared here as a `SCHEMA ADDITION` that P18 migrates
from a different document.

The properties this section depends on:

- **Columns**: `id UUID PK`, `email TEXT NOT NULL`, `customer_id UUID NULL`,
  `product_id UUID NOT NULL`, `variant_id UUID NULL`, `market_code CHAR(2) NOT NULL`,
  `notified_at TIMESTAMPTZ NULL`, `created_at TIMESTAMPTZ NOT NULL`, plus
  `chk_bisr_email CHECK (email = lower(btrim(email)))`. `email` is `NOT NULL` and
  `customer_id` is nullable — the inverse of `wishlist_items` — which is exactly the
  guest case.
- **`idx_bisr_pending`**, a partial unique index over
  `(lower(email), product_id, coalesce(variant_id, <nil uuid>), market_code)
  WHERE notified_at IS NULL`: a double-submit is a no-op, and the same address can
  re-register after it has been notified.
- **`idx_bisr_variant (variant_id) WHERE notified_at IS NULL`** is what the inventory
  transaction queries when stock crosses `out → in_stock`, so the notification is a
  consequence of a stock movement rather than a nightly scan of the whole table. The
  send is a `send_email` job with `dedupe_key = 'bisr:' || id` (`11 §3.2`).
- The row is a **transactional** notification consent for one piece, expires with
  `notified_at`, and **never** becomes a `newsletter_subscribers` row; a shopper who also
  wants the newsletter ticks a separate box that goes through `setMarketingConsent()`
  with `source='footer_form'` and is audited (§1.3).

> **RESOLVED — was CHANGE REQUIRED IN 03 §2.5:** "Notify me" writes a `back_in_stock_requests` row, not
> *Verified applied in 03.*
> a `wishlist_items` row. As written, P08 builds the mechanism that drops every guest.

> **NEEDS INPUT:** final copy for every state above, and whether the client wants
> a "notify me" capture on out-of-stock pieces (it collects an email address and
> therefore needs a consent line the client signs off).

---

## 5. Admin route map

All under `src/app/(admin)/admin/`, all `force-dynamic`, `no-store`, `noindex`
with `X-Robots-Tag: noindex, nofollow`. The permission named on each row is the
`permissions.key` passed to `requirePermission()` **in the page and again in every
action the page invokes** (01 §2.1). Every key listed here must exist in
`src/lib/rbac/catalogue.ts`, which `tests/unit/rbac-catalogue.test.ts` asserts
against the `permissions` table.

**The catalogue is 72 keys and `11 §1.3` is the canonical list; `11 §1.4` is the
role→permission matrix and supersedes `07 §2.5`.** A route map may not widen the
catalogue — this document once invented a webhook-replay key of its own and the replay is
`integration.manage` **and** `order.refund` composed — and three of the keys below are
new since `07 §2.3` was written (`media.update`, `cms.restore`, `price.read_cost`).

### Dashboard

| Path | Permission | Purpose |
| --- | --- | --- |
| `/admin` | `dashboard.view` | First-party KPIs from `analytics_events` and `orders`, per market, with an explicit source label. Integration status strip. Never a simulated number (01 §4.9) |
| `/admin/login` | — | Outside the guard. Password + TOTP |
| `/admin/search` | `dashboard.view` | Global admin jump-to (orders, products, customers) |

### Catalog

| Path | Permission |
| --- | --- |
| `/admin/catalog/products` (saved views, bulk bar, inline edit) | `product.read` |
| `/admin/catalog/products/new` · `/admin/catalog/products/[id]` | `product.create` · `product.update` |
| `/admin/catalog/products/[id]/variants` · `/variants/[variantId]` | `variant.update` |
| `/admin/catalog/products/[id]/media` | `catalog.product_media` + `media.read` — 07 §2.3 defines `catalog.product_media` as exactly "attach, detach and reorder media on a product", and a key in the catalogue that no route names is a key `tests/unit/rbac-catalogue.test.ts` fails on ("granted to no role at all, almost always a typo") |
| `/admin/catalog/products/[id]/seo` | `seo.manage` |
| `/admin/catalog/products/[id]/versions` | `product.read` + `cms.read` |
| `/admin/catalog/variants` (flat cross-product variant grid) | `variant.update` |
| `/admin/catalog/reviews` (moderation queue — pending oldest first; approve / reject / note) | `review.moderate` (`11` §1.3 key 73; `15` §3.3) — **not** `product.update`: approving a review changes what the storefront asserts about a piece, and `aggregateRating` is emitted only once `product_review_stats.approved_count > 0` |
| `/admin/catalog/categories` · `/[id]` (tree, drag re-parent) | `category.update` |
| `/admin/catalog/collections` · `/[id]` · `/[id]/rules` | `collection.update` |
| `/admin/catalog/stones` · `/[id]` | `stone.update` |
| `/admin/catalog/materials` · `/[id]` | `material.update` |
| `/admin/catalog/attributes` · `/[id]` (+ `attribute_options`) | `attribute.update` |
| `/admin/catalog/tags` | `tag.update` (07 §2.3) |
| `/admin/catalog/facets` (`curated_facets`) | `seo.manage` |

### Pricing

| Path | Permission |
| --- | --- |
| `/admin/pricing/prices` (per market/currency grid, bulk edit) | `price.update`; the **cost and margin columns additionally require `price.read_cost`** (`11 §1.3` row 22, 04 §4) and are omitted from the projection — not blurred in the UI — for an actor without it. A bulk edit over the grid requires nothing more than `price.update`, re-checked per row inside the job |
| `/admin/pricing/metal-rates` | `metal_rate.manage` |
| `/admin/pricing/rules` (`pricing_rules`) | `pricing_rule.manage` |
| `/admin/pricing/history` (`price_history`) | `price.read` |
| `/admin/pricing/recalc-runs` · `/[id]` (preview, line-level approve/reject) | `price.read` to view; **`price.recalc_preview`** to create or reject a run (`11 §1.3` row 24 — `createRecalcPreview()`, `rejectRecalcRun()`). `catalog_manager` holds it because they enter the rates; they do not hold the approval below |
| `/admin/pricing/recalc-runs/[id]/approve` | **`price.approve_recalc`** — the separate permission that makes hard rule 6 real: previewing a recalculation and applying it are different rights |

### Inventory

| Path | Permission |
| --- | --- |
| `/admin/inventory/items` | `inventory.read` |
| `/admin/inventory/items/[variantId]` (per-location on-hand, reserved, available) | `inventory.read` to render; **`inventory.adjust` re-checked inside every adjustment action** — the page permission is not the mutation permission, or a read-only stock clerk's page grants them the write the moment it renders a form (01 §2.1) |
| `/admin/inventory/transactions` | `inventory.read` |
| `/admin/inventory/locations` | `location.manage` |
| `/admin/inventory/transfers` | `inventory.transfer` |
| `/admin/inventory/low-stock` | `inventory.read` |
| `/admin/inventory/reservations` (live holds, manual release) | `inventory.adjust` |

### Sales

| Path | Permission |
| --- | --- |
| `/admin/orders` (saved views, market filter) | `order.read` |
| `/admin/orders/[id]` (snapshot lines only — never a `products` join) | `order.read` |
| `/admin/orders/review` (the `pending_review` fraud-hold queue, `orders.status = 'pending_review'`, sorted by `total_minor DESC` on `idx_orders_market_total`) | `order.read` |
| `/admin/orders/[id]/release` (release a `pending_review` hold → `processing`) | **`order.update`**, deliberately **not `order.fulfil`** (`11 §7.3`). `inventory_manager` holds `order.fulfil`; the warehouse must not be able to release a fraud hold on the order it is about to pick. The release writes an `order_events` row of type `status_changed` and an `audit_logs` row |
| `/admin/orders/[id]/fulfil` (`shipments`) | `order.fulfil` — `createShipment()` refuses unless `orders.status IN ('paid','processing')`, so a held order cannot be picked |
| `/admin/orders/[id]/refund` | **`order.refund`** |
| `/admin/orders/[id]/cancel` | `order.cancel` |
| `/admin/orders/[id]/invoice` | `order.read` |
| `/admin/returns` · `/[id]` | `return.read` |
| `/admin/returns/[id]/approve` | `return.approve` |
| `/admin/payments` (payments, `payment_events`, reconciliation flags) | `order.read` |
| `/admin/payments/disputes` | `order.refund` |
| `/admin/gift-cards` · `/[id]` | `coupon.manage` |

### Markets

Paths follow 01 §3 (`settings/…`); the admin navigation groups them as "Markets".

| Path | Permission |
| --- | --- |
| `/admin/settings/markets` · `/[code]` (currency, locale, timezone, tax mode, provider key, `prices_include_tax`, activation) | `market.manage` |
| `/admin/settings/markets/[code]/locations` (`market_locations` priority) | `market.manage` |
| `/admin/settings/shipping` (zones, bands, per-currency thresholds) | `settings.manage` |
| `/admin/settings/tax` (Stripe Tax toggle, India `tax_rules` rows, the per-category `tax_code` map, `settings['tax.default_code']` and `settings['tax.allow_zero_tax_market']`) | `settings.manage` |
| `/admin/tools/market-preview` (mint a preview token, render any storefront route as any market) | **`market.preview`** — 07 §2.3 and 04 §7.2 both name this key, and it is deliberately *not* `market.manage`: previewing an inactive market is a read, while `market.manage` is the right to bind a payment provider to a market and activate it. Collapsing the two means anyone who may look at `/in/` before launch may also switch the acquirer on it |

### Content

| Path | Permission |
| --- | --- |
| `/admin/content/pages` · `/[id]` | `cms.update` |
| `/admin/content/builder/[pageId]` (sections, blocks, per-breakpoint config) | `cms.update` |
| `/admin/content/pages/[id]/publish` | **`cms.publish`** |
| `/admin/content/pages/[id]/versions` (diff) | `cms.read` — reading history is a read |
| `/admin/content/pages/[id]/versions/[versionId]/restore` | **`cms.restore`** (`11 §1.3` row 53). `cms.update`'s description explicitly **excludes** restore: restoring writes to the **draft**, and going live still needs `cms.publish`. This row previously read `cms.update`, which made "may edit a page" and "may roll the page back to a state a different editor has never seen" the same right |
| `/admin/content/pages/[id]/preview` (internal frame, no public token minted) | `cms.read` |
| `/admin/content/pages/[id]/share-preview` (mint a public `content_preview_tokens` row) | **`content.preview`** (07 §2.3, 06 §861) — minting a link a stranger can open is a different right from looking at a draft yourself |
| `/admin/content/journal` · `/[id]` | `journal.manage` |
| `/admin/content/media` (library, folders, alt-text audit) | `media.read` to browse; `media.create` to upload and create folders; **`media.update`** for alt text, title, credit, folder move, tagging and `replaceMedia()` (`11 §1.3` row 17); `media.delete` to soft-delete |
| `/admin/content/media/[id]/purge` (destroy the provider asset) | **`media.hard_delete`** (`11 §1.3` row 19) — `owner` only, type-to-confirm, TOTP-required and step-up. The usage report runs first and a soft delete is the reversible step before it |
| `/admin/content/journal/categories` (`journal_categories`) | `journal.manage` — the split update/publish spellings `06 §1.5` used are rejected and collapse into this one key (`11 §1.3` row 56) |
| `/admin/content/menus` · `/[id]` | `menu.manage` |
| `/admin/content/redirects` (+ CSV import, dead-destination flags) | `redirect.manage` |
| `/admin/content/seo` (per-entity overrides, missing-metadata report, JSON-LD preview) | `seo.manage` |

### Marketing

| Path | Permission |
| --- | --- |
| `/admin/marketing/coupons` · `/[id]` (+ per-currency `coupon_amounts`) | `coupon.manage` |
| `/admin/marketing/campaigns` | `campaign.manage` |
| `/admin/marketing/newsletter` | `newsletter.manage` |
| `/admin/marketing/search/no-results` | `search.manage` |
| `/admin/marketing/search/synonyms` | `search.manage` |
| `/admin/marketing/search/promotions` | `search.manage` |
| `/admin/marketing/search/redirects` | `search.manage` |

### Customers

| Path | Permission |
| --- | --- |
| `/admin/customers` | `customer.read` |
| `/admin/customers/[id]` (orders, addresses, lifetime value per currency) | `customer.read` |
| `/admin/customers/[id]/edit` | `customer.update` |
| `/admin/customers/[id]/anonymize` | **`customer.anonymize`** |
| `/admin/customers/[id]/impersonate` | **`user.impersonate`** — writes an `audit_logs` row before the session is issued, and the storefront renders a persistent impersonation banner |
| `/admin/customers/groups` | `customer.update` |

### Settings and system

| Path | Permission |
| --- | --- |
| `/admin/settings/general` (org details, contact, copy strings, feature flags) | `settings.manage` |
| `/admin/settings/email-templates` · `/[key]` (+ send test) | `settings.manage` — one key covers `settings` rows **and** `email_templates`; the separate template-update key `06 §1.5` proposed is rejected (`11 §1.3` row 63) |
| `/admin/settings/integrations` (**all fourteen** `IntegrationKey` values from `11 §6`, each with its `IntegrationState` and the exact names of its missing env vars — **never a value**, 07 §5.10) | **`integration.manage`** |
| `/admin/settings/roles` · `/[id]` (permission matrix) | `role.manage` |
| `/admin/settings/users` · `/[id]` (staff, 2FA enrolment state) | `user.manage` |
| `/admin/tools/import` (upload → validated preview → apply) | `import.run` |
| `/admin/tools/export` | `export.run`, **plus `customer.export` for any resource containing PII** (`customers`, `orders`, `returns` — 07 §2.3 makes it "required *in addition to*"). The resource picker hides what the actor may not export, and `exportJob()` re-checks, because hiding a select option is not authorization |
| `/admin/tools/saved-views` | **The owning resource's read permission**, resolved from `saved_views.resource` (`11 §1.2` rule 3): `products`/`variants` ⇒ `product.read`, `orders` ⇒ `order.read`, `customers` ⇒ `customer.read`, `inventory` ⇒ `inventory.read`, `prices` ⇒ `price.read`, `returns` ⇒ `return.read`, `media` ⇒ `media.read`. A saved view carries no permission of its own — it is a stored filter over a list the actor can already see, and giving it one would let a view grant access its resource does not |
| `/admin/system/audit-log` | `audit.read` |
| `/admin/system/webhooks` (view) | `integration.manage` — 07 §2.3 assigns the webhook console to this key. `job.read` is the CSV-export queue and is held by roles with no business reading payment event payloads |
| `/admin/system/webhooks/[id]/replay` | **`integration.manage` AND `order.refund`** — both, and both from 07 §2.3's catalogue. This document previously invented a `payment.replay_webhook` key, which would have failed `tests/unit/rbac-catalogue.test.ts` on its first run: a `PermissionKey` string literal appearing in `src/` with no row in `catalogue.ts` and no row in the seeded `permissions` table is exactly what that test exists to catch, and the fix is to compose two existing keys rather than to widen the catalogue from a route map. The requirement stands — replaying `charge.refunded` or `payment.captured` moves money, and `job.retry` is held by anyone who can re-run a CSV export — and requiring the money-adjacent key alongside the console key expresses it without a migration. The replay is **not** protected by the insert-first dedupe that protects a live delivery: the `webhook_events` row already exists, so `ON CONFLICT … DO NOTHING` returns nothing and the guard that makes duplicate delivery safe (01 §2.5) does not fire. The replay handler therefore re-runs the effect under `SELECT … FOR UPDATE` on the order and re-asserts all six §2.5 conditions — provider event id, amount, currency, order id, legality of the transition *from the order's current status*, and a live reservation — so replaying an event whose effect already landed fails the transition assertion, records `webhook_events.status='ignored'` with the reason, and changes nothing. Without that, one click on a settled order re-marks it paid, re-commits stock and re-sends a confirmation |
| `/admin/system/jobs` (+ retry, cancel) | `job.read` / `job.retry` |
| `/admin/system/health` | `dashboard.view` |

---

## 6. Search architecture

### 6.1 What is searchable

`products.search_text` (02 §2.4) is the denormalised bag of words maintained by
`reindexProduct()`: title, subtitle, every live variant SKU, stone names, material
names, category names, tag names. `products.search_vector` is the generated
`tsvector` over `title` (weight A), `subtitle` (B) and `search_text` (C).

| Searchable by | How it gets into the index |
| --- | --- |
| Product name | `products.title`, weight A |
| SKU | `product_variants.sku` → `search_text` |
| Stone | `stones.name` via `product_stones` → `search_text` |
| Category | `categories.name` via `product_categories` → `search_text` |
| Material | `materials.name` via `variant_materials` → `search_text` |
| Collection | `collections.title` via `product_collections` → `search_text` |
| Tags | `tags.name` via `product_tags` → `search_text` |

Non-product entities are searched directly and appear as their own result groups:
`categories.name`, `collections.title`, `stones.name`, `journal_posts.title`.

**Six of the seven rows above are denormalised copies of a name that lives on another
table, and `reindexProduct(productId, tx)` reindexes one product.** Rename "Blue Topaz" to
"Swiss Blue Topaz", or "CHAINS" to "NECKLACES", and `stones.name` / `categories.name` change
in one `UPDATE` while every `products.search_text` that quoted the old name keeps quoting it:
site search for the new name returns nothing, search for the retired name still works, and
nobody notices until a merchandiser searches for the thing they just renamed. A rename is the
single most common catalogue edit after a price change, so "reindex on product save" is not a
policy, it is a gap. The rule:

```ts
// src/lib/catalog/index.ts
export async function reindexProductsForEntity(
  entity: { kind: 'stone' | 'material' | 'category' | 'collection' | 'tag'; id: string },
  tx: Tx,
): Promise<{ enqueuedJobId: string } | { reindexed: number }>;
```

`saveStone()`, `saveMaterial()`, `saveCategory()`, `saveCollection()` and `saveTag()` call it
inside their own transaction whenever the `name`/`title` column is in `dirtyFields`. Below
**200** affected products it reindexes them inline, which covers almost every real rename;
above that it inserts a `jobs` row of kind **`reindex_search`** — the kind 02 §2.9 already
defines and already protects with `idx_jobs_singleton`, so a merchandiser renaming three
stones in a row queues one rebuild, not three. The same call is what a `search.manage` holder
triggers from `/admin/marketing/search/reindex`; 07 §2.3 already scopes "reindex" to that key,
and this is the route it was scoped to.

### 6.2 The query

```sql
SELECT p.id,
       ts_rank_cd(p.search_vector, q, 32)::numeric(12,8) AS rank
FROM products p
LEFT JOIN product_market_content pmc
  ON pmc.product_id = p.id AND pmc.market_code = $2
, websearch_to_tsquery('english', $1) q
WHERE p.deleted_at IS NULL
  AND p.status = 'active' AND p.published_at <= now()
  AND coalesce(pmc.is_published, true)
  AND EXISTS (SELECT 1 FROM prices pr
              WHERE pr.product_id = p.id AND pr.market_code = $2
                AND pr.valid_to IS NULL AND pr.deleted_at IS NULL)
  AND p.search_vector @@ q
  AND ($4::numeric IS NULL OR                      -- keyset cursor, all three components
       (ts_rank_cd(p.search_vector, q, 32)::numeric(12,8), p.rank, p.id) < ($4, $5, $6))
ORDER BY rank DESC, p.rank DESC, p.id DESC
LIMIT $3;
```

`websearch_to_tsquery`, not `plainto_tsquery`: it accepts quoted phrases and `-`
exclusion, which is what a shopper types. `ts_rank_cd` with normalisation `32`
divides by rank+1 so a long description cannot outrank a matching title.

**Three things in that query are corrections to the obvious version, and each one is
a bug this document elsewhere says must not exist.**

- **`LEFT JOIN … coalesce(pmc.is_published, true)`, not an inner join.**
  `product_market_content` is an override layer with a default of `true` and a row
  that frequently does not exist (02 §2.4, and the PLP query in 02 §4.1 uses exactly
  this shape). An inner join returns zero rows for every product that has no override
  row, so site search in India returns nothing for the entire pre-existing catalogue
  — silently, with a working search box.
- **The price `EXISTS`.** This section claims two paragraphs below that "search must
  never surface a product the PLP would hide". The PLP hides an unpriced product
  (02 §4.1); without this clause, search does not, and the India results fill with
  cards that have no price and a dead add-to-bag. The clause is the same index-only
  probe on `idx_prices_live_product`.
- **A three-component keyset, in one direction.** The `ORDER BY` has three clauses;
  §2.3's cursor carries every component of it (`k` is not a pair), and the comparison
  is a row-wise `(rank, p.rank, p.id) < ($4,$5,$6)`, which Postgres can only evaluate
  correctly when every component sorts the same way — hence `p.id DESC`, not `p.id`.
  `ts_rank_cd` returns `real`; comparing a `real` that has been through a base64
  cursor round trip is a float equality test at a page boundary, and ties on identical
  rank are the common case in a catalogue of similarly-named pieces, so the rank is
  cast to `numeric(12,8)` in both the projection and the comparison. A two-component
  cursor over this `ORDER BY` drops or repeats every row that ties on rank.

Zero rows triggers a trigram pass over `idx_products_title_trgm`
(`similarity(title, $1) > 0.3`) to produce `didYouMean` and a salvage result set —
so "moonstne" still finds moonstone.

**Why Postgres is sufficient here, and the exact condition that changes it.** The
launch catalogue is in the low thousands of products. The decisive factor is not
size but correctness: search must apply the same publication, soft-delete and
per-market visibility predicates as every listing (`products.status`,
`published_at`, `deleted_at`, `product_market_content.is_published`), and those
predicates live in SQL. An external engine means replicating four visibility rules
into an index and keeping them in sync — and the failure mode of getting that
wrong is a search result that 404s, or worse, a piece hidden from India appearing
in an India search. Migration triggers are already fixed by 01 §1.6: p95
`searchProducts()` > 300 ms, or > 25,000 published products, or a merchandised
ranking requirement not expressible as a SQL `ORDER BY`. When one is met, the work
is **one new `SearchProvider` implementation** behind the existing interface plus
an `indexProduct` call added to `reindexProduct()`; `SEARCH_PROVIDER` (01 §4.8)
already selects it, and no caller changes.

### 6.3 Predictive search

`GET /api/catalog/typeahead?q=&market=&limit=` fires at 180 ms debounce from 2
characters, aborts the previous request with `AbortController`, and returns four
groups in one response: up to 6 products (title, hero thumbnail, `Money` price),
3 categories, 3 stones, 3 collections. Product suggestions run the same visibility
predicates as §6.2 with `LIMIT 6` and no facet computation.

Typeahead **does not** write `search_queries` — it would log every prefix of every
word and drown the zero-result report that merchandisers actually read. Only a
submitted search (the `/search` page render) logs.

### 6.4 Recent searches

`localStorage` key `md.recent_searches`, last 6 normalised queries, per browser.
Rendered in the empty state of the search overlay with a "clear" control. No
table, no endpoint, no server write: a recent-search list is a per-device
convenience with no revenue path, and storing it server-side creates a per-customer
behavioural record with a retention obligation for no gain. It is not synced
across devices and does not survive a cleared browser, and that is the correct
trade.

### 6.5 No-result handling and logging

Every `/search` render writes one `search_queries` row: `query_text` as typed,
`normalized_query` (lowercased, trimmed, whitespace-collapsed), `market_code` from
the route segment, `result_count`, `filters_applied`, and `customer_id` /
`session_id` when present. `clicked_product_id` is filled by the
`POST /api/search/click` beacon. `idx_search_no_results` (partial, `WHERE result_count = 0`)
backs `/admin/marketing/search/no-results`, which groups by `normalized_query` and
`market_code` over a chosen window and offers, per row, three one-click actions:
create a synonym, promote a product, or create a search redirect.

A non-zero `result_count` with a null `clicked_product_id` is the more interesting
signal — results were returned and none were worth clicking — and the same screen
ranks those separately as "relevance failures".

Retention: `search_queries` is pruned at 180 days by `cleanup-sessions`.

### 6.6 Admin controls

> **SCHEMA ADDITION:** three tables 02 does not define. All three are merchandiser-
> editable lookup rows, so by 02 §1.9 their small value sets are `TEXT` with an
> explicit `CHECK`, and none is an enum.
>
> ```sql
> CREATE TABLE search_synonyms (
>   id            UUID        NOT NULL PRIMARY KEY,
>   market_code   CHAR(2)     NULL REFERENCES markets(code) ON DELETE CASCADE,   -- NULL = all markets
>   term          TEXT        NOT NULL,          -- normalised, lowercased
>   synonyms      TEXT[]      NOT NULL,          -- normalised, lowercased
>   mode          TEXT        NOT NULL DEFAULT 'two_way',
>   is_active     BOOLEAN     NOT NULL DEFAULT true,
>   note          TEXT        NULL,
>   created_by_user_id UUID   NULL REFERENCES users(id) ON DELETE SET NULL,
>   created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
>   updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
>   CONSTRAINT chk_search_synonyms_mode  CHECK (mode IN ('two_way','one_way')),
>   CONSTRAINT chk_search_synonyms_term  CHECK (term = lower(btrim(term))),
>   CONSTRAINT chk_search_synonyms_count CHECK (cardinality(synonyms) BETWEEN 1 AND 25)
> );
> CREATE UNIQUE INDEX idx_search_synonyms_term
>   ON search_synonyms (lower(term), coalesce(market_code, '**'));
>
> CREATE TABLE search_promotions (
>   id            UUID        NOT NULL PRIMARY KEY,
>   market_code   CHAR(2)     NULL REFERENCES markets(code) ON DELETE CASCADE,
>   query         TEXT        NOT NULL,          -- normalised_query this pins against
>   product_id    UUID        NOT NULL REFERENCES products(id) ON DELETE CASCADE,
>   position      SMALLINT    NOT NULL,          -- 1-based slot in the result grid
>   starts_at     TIMESTAMPTZ NULL,
>   ends_at       TIMESTAMPTZ NULL,
>   is_active     BOOLEAN     NOT NULL DEFAULT true,
>   created_by_user_id UUID   NULL REFERENCES users(id) ON DELETE SET NULL,
>   created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
>   updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
>   CONSTRAINT chk_search_promotions_position CHECK (position BETWEEN 1 AND 12),
>   CONSTRAINT chk_search_promotions_window   CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
> );
> -- A plain UNIQUE on (query, market, position) WHERE is_active makes the table's own
> -- scheduling columns unusable: a Diwali promotion in slot 1 and a Christmas promotion in
> -- slot 1, with windows that do not overlap, are two active rows and the index refuses the
> -- second. The constraint that expresses the real rule is "no two active rows may occupy one
> -- slot AT THE SAME TIME", which is a range overlap, not an equality.
> CREATE EXTENSION IF NOT EXISTS btree_gist;
> ALTER TABLE search_promotions ADD CONSTRAINT ex_search_promotions_slot
>   EXCLUDE USING gist (
>     lower(query) WITH =, coalesce(market_code, '**') WITH =, position WITH =,
>     tstzrange(coalesce(starts_at, '-infinity'), coalesce(ends_at, 'infinity')) WITH &&
>   ) WHERE (is_active);
> ALTER TABLE search_promotions ADD CONSTRAINT ex_search_promotions_product
>   EXCLUDE USING gist (
>     lower(query) WITH =, coalesce(market_code, '**') WITH =, product_id WITH =,
>     tstzrange(coalesce(starts_at, '-infinity'), coalesce(ends_at, 'infinity')) WITH &&
>   ) WHERE (is_active);
>
> CREATE TABLE search_redirects (
>   id            UUID        NOT NULL PRIMARY KEY,
>   market_code   CHAR(2)     NULL REFERENCES markets(code) ON DELETE CASCADE,
>   query         TEXT        NOT NULL,
>   match_mode    TEXT        NOT NULL DEFAULT 'exact',
>   to_path       TEXT        NOT NULL,
>   is_active     BOOLEAN     NOT NULL DEFAULT true,
>   hit_count     BIGINT      NOT NULL DEFAULT 0,
>   created_by_user_id UUID   NULL REFERENCES users(id) ON DELETE SET NULL,
>   created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
>   updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
>   CONSTRAINT chk_search_redirects_mode  CHECK (match_mode IN ('exact','contains')),
>   CONSTRAINT chk_search_redirects_path  CHECK (to_path LIKE '/%')
> );
> CREATE UNIQUE INDEX idx_search_redirects_query
>   ON search_redirects (lower(query), coalesce(market_code, '**'));
> ```
>
> These are **not** rows in `redirects`. `redirects.from_path` is a URL path with a
> `LIKE '/%'` CHECK and a unique index on `lower(from_path)`; a search term is
> neither a path nor unique in that namespace, and forcing it in would collide with
> a real URL redirect the first time someone searched for something that looked
> like a slug. Different key space, different table.

| Control | Where | Behaviour |
| --- | --- | --- |
| Synonyms | `/admin/marketing/search/synonyms` | Applied at query time by `PostgresSearchProvider`: the normalised query is expanded into an `OR` of `websearch_to_tsquery` terms before ranking. `two_way` expands in both directions; `one_way` expands `term → synonyms` only (so "closeout" can find "sale" without every "sale" search returning closeouts). Cached with tag `settings`, purged on write |
| Promoted products | `/admin/marketing/search/promotions` | Pinned into the given `position` of page 1 for that `normalized_query`, above organic results, marked "Featured" in the UI — an unlabelled pin is a paid-placement problem waiting to happen. Promotions never appear on page 2+, and a promoted product that fails the visibility predicates is silently dropped rather than rendered as a broken card. **The organic query excludes the promoted ids** (`AND p.id <> ALL($promoted)`) and the page-1 `LIMIT` is reduced by the number actually pinned. Without both, the promoted piece renders twice — once at slot 1 and again wherever it ranks — and, worse, page 1 returns 24 organic rows plus 3 pins, so the cursor handed to page 2 is computed from the 24th organic row while the shopper saw 27 cards: three pieces are skipped between pages, silently, on the query a merchandiser cared enough about to tune |
| Search redirects | `/admin/marketing/search/redirects` | A matching query 302-redirects the shopper to `to_path` instead of rendering results — "gift card" → `/pages/gift-cards`, "size guide" → `/size-guide`. **`to_path` is stored unprefixed and the market segment of the *searching* shopper is applied at redirect time**, exactly as `redirects.to_path` is handled in §3.6 step 3: an India shopper searching "size guide" goes to `/in/size-guide`, not to the US page with US prices in its related content. The writer strips a leading segment equal to an active `markets.code` before saving, so a merchandiser who pastes a real URL gets the row they meant. Precedence when two rows match: **exact before `contains`, market-specific before all-markets**, and within `contains` the longest matching `query` wins — undefined precedence on an overlapping pair is a redirect that changes when a row is edited somewhere else. `302`, not `301`: the mapping is merchandising and is expected to change. Still logged to `search_queries` first, with `result_count = 0` and `filters_applied = {"redirected_to": "<to_path>"}` — **the organic result set is not computed**. Running the search anyway, purely to fill a count nobody reads, adds a full ranking query to every redirected search and is meaningless when the target is a CMS page with no result set at all. The zero-result report in §6.5 excludes any row carrying `redirected_to`, so a redirected term does not pollute the one screen a merchandiser actually acts on |
| Zero-result report | `/admin/marketing/search/no-results` | §6.5 |
| Ranking preview | `/api/admin/search/preview` | §2.2 |

---

## 7. Analytics architecture

### 7.1 The taxonomy

**One canonical event set, two vendor mappings.** `src/lib/analytics/events.ts`
exports the canonical names and their Zod payload schemas; the vendor names are
lookup maps, not a second taxonomy. `analytics_events.event_name` is `TEXT`
validated against this constant (02 §2.9), so the set below widens the examples
listed there without a migration.

| Canonical `event_name` | Fired when | GA4 name | Meta name | Recorded server-side? |
| --- | --- | --- | --- | --- |
| `product_viewed` | PDP render | `view_item` | `ViewContent` | Yes — from the **uncached `<Suspense>` boundary**, never the ISR shell (§7.2) |
| `product_list_viewed` | PLP / collection / stone listing render | `view_item_list` | — | No (client only) |
| `product_selected` | Product card click | `select_item` | — | No (client only) |
| `search_performed` | `/search` render | `search` | `Search` | **Yes** — it is also the `search_queries` write |
| `add_to_cart` | `addItemAction` succeeds | `add_to_cart` | `AddToCart` | **Yes**, inside the cart transaction |
| `remove_from_cart` | `removeItemAction` | `remove_from_cart` | — | Yes |
| `cart_viewed` | `/cart` render | `view_cart` | — | No |
| `wishlist_added` / `wishlist_removed` | wishlist actions | `add_to_wishlist` / — | `AddToWishlist` / — | **Yes** |
| `checkout_started` | `startCheckout` succeeds | `begin_checkout` | `InitiateCheckout` | **Yes** |
| `checkout_step_completed` | information → **delivery** → payment | `add_shipping_info` / `add_payment_info` | — | Yes |
| `order_created` | `createOrderFromCart` commits | — | — | **Yes only** |
| `order_paid` | verified webhook marks paid | `purchase` | `Purchase` | **Yes only** |
| `refund_issued` | `refunds.status='succeeded'` | `refund` | — | **Yes only** |

`order_paid`, not `order_created`, is the `purchase` conversion. A `purchase`
fired on order creation counts orders that never paid, and every downstream ad
platform then optimises toward abandonment.

**The `step` property of `checkout_step_completed` takes four values —
`information`, `delivery`, `payment`, `processing` — and `shipping` is not one of
them.** 05 §3.2 fixes the four step names, §4.2 corrects itself for them, and
`chk_checkout_sessions_step` is a database constraint over exactly that list
(`11 §7.2`). This table carried the fifth spelling ninety lines after the correction,
which would have produced an analytics funnel whose second step name matches no
`checkout_sessions.step` value and therefore joins to nothing.

### 7.2 Server-side versus client-side

**The split rule: money is server-side, intent is client-side.**

| Recorded by | Events | Why |
| --- | --- | --- |
| Server only (`analytics.record()` inside the owning transaction) | `order_created`, `order_paid`, `refund_issued`, and the `revenue_minor` / `currency_code` / `order_id` / `market_code` / `customer_id` columns of every event | 02 §2.9: `POST /api/analytics/[market]/collect` is public and unauthenticated. If the browser could set `revenue_minor`, the admin revenue dashboard — the number the client judges the business by — is arbitrarily forgeable in a `curl` loop |
| Server, from the rendering request | `product_viewed`, `search_performed`, `add_to_cart`, `wishlist_added`, `checkout_started` | These happen in a server component or a server action anyway; recording them there makes them immune to ad blockers and gives the admin dashboard a complete funnel |
| Never | any `analytics.record()` call inside a `cached()` wrapper, a `React.cache()`-memoised function, or the body of an ISR-rendered component | See immediately below |
| Client only, via `POST /api/analytics/[market]/collect` | `product_list_viewed`, `product_selected`, `cart_viewed`, `checkout_step_completed` | Pure interaction signals with no server moment |

**"Recorded from the rendering request" is false on any ISR route, and the PDP is an ISR
route.** `/products/[slug]` is `revalidate: 900` with `generateStaticParams` (§4.2), so its
component body executes once per revalidation, not once per visitor: an `analytics.record()`
call placed there produces roughly four `product_viewed` rows per product per hour regardless
of whether four people or forty thousand looked at it. The admin's most-viewed report — a
first-party number the client is told is complete — would then be a report on the
revalidation schedule. It is also a database write inside a function whose result Next is
caching, which is a side effect in a cached call and will be replayed or dropped at the
framework's discretion.

The PDP already has exactly one server-rendered region that runs per request: the
`<Suspense>` boundary that calls `getAvailability([variantId], marketCode)` with
`cache: 'no-store'` (01 §2.4). `product_viewed` is recorded **there**, in the same uncached
child, which keeps it server-side and ad-blocker-immune while making it per-visitor and
honest. `search_performed` (a `no-store` route), `add_to_cart`, `wishlist_added` and
`checkout_started` (server actions) are unaffected — none of them runs inside a cached tree.
The enforcement is mechanical, not a habit. The tier rule does not help here — `analytics/`
is T1, so every higher tier may legally import it (§1.2) — so the check is a test:
`tests/unit/analytics-not-cached.test.ts` AST-parses every call site of the `cached()` wrapper
and of `react`'s `cache`, follows the callback it wraps, and fails on a transitive
`analytics.record` inside it. `tests/e2e/analytics-pdp-count.spec.ts` is the behavioural half:
request one PDP fifty times with `x-vercel-cache: HIT` on forty-nine of them and assert fifty
`product_viewed` rows.

`POST /api/analytics/[market]/collect` rejects a body containing `revenue_minor`,
`currency_code`, `order_id`, `market_code` or `customer_id` **outright** — a 400,
not a silent strip, so a bug that tries to send them is visible. `occurred_at` is
client-proposed and server-clamped to the window in `chk_analytics_occurred_sane`.
Rate limited at `analytics:session:<sid>` 120/min **and** `analytics:ip:<ip64>` 600/min —
the session id is client-supplied (02 §2.9), so the session key alone limits only honest
callers (§2.3).

**The market on a client event is a path segment, and it is honest about being
client-asserted.** 02 §2.9 says `market_code` is "server only — derived from the
resolved route segment", which is exactly true of every server-recorded event
(`order_paid` takes it from `orders.market_code`, `product_viewed` from the rendering
page's `[market]` segment) and impossible at a collect endpoint, which has no market
segment of its own: `Referer` is a request header the caller sets. Rather than
pretend, the endpoint is mounted as `/api/analytics/[market]/collect`, the segment is
validated against `listActiveMarkets()`, and a code that is not an active market is a
`400`. The residual exposure is that a client can mislabel which market an
interaction happened in — and it is acceptable **only** because no event reaching this
endpoint may carry a revenue column, which is the property the 400 above enforces. A
forged `product_list_viewed` skews a funnel percentage; it cannot move a number in the
revenue tile, which is the number the client judges the business by.

> **RESOLVED — was CHANGE REQUIRED IN 09 §1.2 P29(d):** the exit criterion names
> *Verified applied in 09.*
> `/api/analytics/collect`. The path is `/api/analytics/[market]/collect`; a test written
> against the unprefixed form gets a 404 and passes for the wrong reason. `02 §2.9` has
> been corrected to the same path.

**Two writes that must not happen at all.** `analytics_events` writes are suppressed
whenever `previewContext` is set — a `/_preview/**` render is an admin looking at an
unlaunched market and must not appear as a pageview in that market's funnel (04 §7.3) — and
the collect endpoint is not mounted under the `(preview)` route group.

**Vendor dispatch is a `jobs` row, never an inline call.** `serverDispatchTargets()` names
the targets; the send happens in `run-jobs`. `order_paid` is recorded inside the webhook
transaction, and that transaction holds row locks on the order and its reservations — 01 §2.5
is explicit that no network call may happen while checkout's locks are held, and a Meta CAPI
or GA4 Measurement Protocol POST inside it turns a vendor latency spike into a payment-
confirmation outage with a healthy dashboard. `analytics.record()` therefore writes the row
and enqueues an `analytics_dispatch` job in the same transaction; the job reads the row, checks
the visitor's marketing consent (§7.4), and sends. A failed send retries against the `jobs`
backoff and never touches the order.

`analytics_dispatch` is declared as a `job_kind` value in 02 §1.9 and registered in
`11 §3.2` with `systemPermitted: true` and `dedupeKey: 'none'` — it is written by a
webhook or a server action with no human origin, so `jobs.created_by_user_id` is `NULL`,
and under `07 §3.2`'s original closed three-kind allowlist every one of these jobs would
have failed as `FORBIDDEN` in `jobs.error`. The same closure silently killed
`feed_rebuild` above, and every order-confirmation email. The rule is now a per-kind
`systemPermitted` flag (`11 §3.3`), not an allowlist.

### 7.3 Integration seams — no hardcoded ids, ever

Every vendor id is an env var; every loader renders `null` when its id is absent
(01 §4.9). There is no default id, no placeholder id, and no "test" id committed.

**`IntegrationKey` is fourteen values and this document does not widen it by prose.**
`01 §4.9` presents eight as the complete type and five documents — this one included —
said `integrationStatus()` "gains" further keys, which is a type widened in five places
and reconciled in none. The complete union is `11 §6`:
`stripe | razorpay | cloudinary | resend | otp_sms | sentry | ga4 | gtm | meta_pixel |
meta_capi | google_ads | metal_rate_api | indexnow | upstash`. The five analytics keys
below (`ga4`, `gtm`, `meta_pixel`, `meta_capi`, `google_ads`) and `indexnow` (§3.3) are
this document's contributions to that list, and none of them is a launch blocker — the
six that are, are marked in `11 §6`.

The env vars behind the analytics keys, extending 01 §4.8:

| Key | Sev | What breaks without it |
| --- | --- | --- |
| `NEXT_PUBLIC_GA4_MEASUREMENT_ID` | optional | GA4 script does not render (01 §4.8) |
| `NEXT_PUBLIC_GTM_CONTAINER_ID` | optional | GTM container does not load. When set, GTM is the **only** tag loader and the direct GA4/Ads/Pixel snippets are suppressed — two loaders means double-counted conversions |
| `NEXT_PUBLIC_META_PIXEL_ID` | optional | Meta pixel does not render (01 §4.8) |
| `META_CAPI_ACCESS_TOKEN` | optional | Conversions API dispatch is skipped; `email_log`-style visibility is via `/admin/settings/integrations` showing `meta_capi: unconfigured` |
| `META_CAPI_TEST_EVENT_CODE` | optional | Only read when `APP_ENV !== 'production'`; routes CAPI events to Meta's test bucket |
| `NEXT_PUBLIC_GOOGLE_ADS_ID` | optional | Google Ads global tag does not render |
| `GOOGLE_ADS_CONVERSION_LABEL_PURCHASE` | optional | The purchase conversion is not attributed; the tag still loads for remarketing |
| `ANALYTICS_RETENTION_DAYS` | optional | Defaults to the `settings['analytics.retention_days']` row; the prune in `cleanup-sessions` is skipped rather than guessing |

`integrationStatus()` (01 §4.9) gains `'ga4' | 'gtm' | 'meta_pixel' | 'meta_capi' | 'google_ads'`
so `/admin/settings/integrations` lists each with its exact missing variable names.

**CSP is not automatic.** 01 §5.8 pins `script-src` to `'self'`, a nonce,
`js.stripe.com`, `checkout.razorpay.com` and `www.googletagmanager.com`. Adding
Meta Pixel requires `https://connect.facebook.net` in `script-src` and
`https://www.facebook.com` in `img-src` and `connect-src`. `next.config.ts#headers()`
therefore builds the CSP string from the configured env vars at build time and
adds each vendor's origins **only when that vendor's id is set** — so an
unconfigured pixel does not widen the policy, and a configured one is not silently
blocked with no console error on a payment page.

### 7.4 Consent

No marketing or analytics vendor script loads before consent. First-party
`analytics_events` recording is **not** gated: it is server-side, first-party,
pseudonymous, and it is the source of truth for the admin dashboard; gating it
would make the client's own sales figures depend on cookie-banner click-through.

- Consent state lives in the `md_consent` cookie, 12 months, `SameSite=Lax`,
  shape `{"v":1,"analytics":false,"marketing":false,"at":"<iso>"}`.
- Default is **all off** until an explicit choice (01 §5.5's privacy posture and
  the safest default for an EU visitor; the US and India markets do not require
  it, and a single global behaviour is one behaviour to test).
- `src/components/analytics/ConsentGate.tsx` renders each vendor loader only when
  its category is granted. GA4 additionally receives Google Consent Mode v2
  defaults (`ad_storage`, `analytics_storage`, `ad_user_data`,
  `ad_personalization` all `denied`) **before** the container loads, then an
  `update` on grant — so a denied visitor still produces modelled conversions
  rather than nothing.
- A signed-in customer's marketing consent is the `customers.accepts_marketing` /
  `marketing_consent_at` / `marketing_consent_source` triple, written through
  `setMarketingConsent()` and audited. The cookie governs the browser; the row
  governs email. They are different consents and are never inferred from each
  other.
- Meta CAPI dispatch is skipped entirely for a visitor without marketing consent —
  a server-side conversion is still a conversion, and routing around a denied
  banner is the thing the banner exists to prevent.

> **NEEDS INPUT:** which privacy regimes the client is accepting obligations under
> (GDPR/UK GDPR if selling to Europe, CCPA/CPRA for California, India's DPDP Act),
> and the cookie-policy and privacy-policy copy. The architecture above is the
> strictest common denominator and needs no change whichever answer comes back;
> the copy and the banner's regional behaviour do.

### 7.5 Dashboard sourcing

`/admin` reads `analytics_events` and `orders` only. Every tile carries a source
label — "First-party, server-recorded" — and GA4/Meta figures are never mixed into
the same number. When GA4 is `unconfigured` the dashboard shows first-party data
and says so; it never shows a sample, an estimate, or a zero dressed as a
measurement (hard rule 7).
