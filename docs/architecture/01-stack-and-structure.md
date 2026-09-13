# 01 — Technology Stack, System Architecture, Folder Structure, Deployment

Scope: what we build on, how the code is layered, where every file lives, what
every environment variable does, and how this ships. Data model, pricing rules,
RBAC matrix and UI design are owned by sibling sections; this document names the
identifiers those sections must reuse verbatim.

---

## 1. Technology stack

### 1.1 Pinned choices

Versions below are the **majors to install**. `scripts/bootstrap.sh` installs
with `--save-exact`, so `package.json` ends up with exact resolved versions and
`package-lock.json` is committed. No `^`/`~` ranges in `dependencies`.

| Layer | Choice | Major | Why (tied to a requirement) |
| --- | --- | --- | --- |
| Runtime | Node.js | **24.18.0** | The only runtime verified on this machine; pinned in `.nvmrc` and `package.json#engines` so Vercel builds on the same major. |
| Package manager | npm | **11** | pnpm/bun are not installed; adding a toolchain dependency buys nothing and breaks a fresh clone on this machine. |
| Framework | Next.js (App Router) | **16** | Per-route rendering strategy (§1.3) is the only way to get static/ISR SEO surfaces and `no-store` checkout in one codebase; RSC keeps catalogue rendering server-side so prices are never computed on the client (hard rule 3). |
| UI runtime | React | **19** | Required by Next 16; `useActionState` / `useOptimistic` / `useFormStatus` remove the need for a client data-fetching library in admin autosave and bulk-edit flows. |
| Language | TypeScript (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) | **5** | Money-as-integer and market-scoped types are only enforceable if the compiler is strict; `strict: false` would silently permit `number` prices. |
| Styling | Tailwind CSS v4 (CSS-first `@theme`) | **4** | Brand palette and the two type families become design tokens in one `@theme` block, so a colour is never hardcoded in a component; no runtime CSS-in-JS, which is incompatible with RSC streaming. |
| Component primitives | Radix UI primitives + `class-variance-authority` + `tailwind-merge` | Radix **1**, CVA **0.7**, tw-merge **3** | Accessible dialog/popover/select/tabs behaviour without inheriting a visual design system — the storefront is a bespoke editorial design and must not fight a component library's opinions. |
| Icons | `lucide-react` | **0.5x** | Tree-shaken SVG set; never used for the brand marks (§3, `public/brand`). |
| Data grid (admin only) | TanStack Table | **8** | Headless — gives column sizing/sorting/row selection for bulk edit and saved views without shipping a styled grid to the storefront bundle. |
| Client state | Zustand | **5** | Only for ephemeral client UI (cart drawer open, filter sheet, market-switch modal, toast queue). **Cart contents are server state** and never live in Zustand. |
| Forms | react-hook-form | **7** | Uncontrolled inputs keep the 60-field admin product form from re-rendering per keystroke; integrates with server actions via `useActionState`. |
| Validation | Zod | **4** | One schema per boundary, reused by server actions, route handlers, CSV import preview, webhook payload parsing and env parsing — a single definition of "valid" (hard rule 3). |
| ORM | **Prisma** with `@prisma/adapter-pg` | **7** | See §1.2. |
| Database | PostgreSQL (Neon) | **17** | Transactional `SELECT … FOR UPDATE` reservation is the only safe answer to the one-of-a-kind oversell rule (hard rule 5); `numeric`/`bigint`, partial unique indexes, `tsvector` and `jsonb` are all load-bearing. |
| Migrations | Prisma Migrate (SQL files committed) + hand-written SQL for generated columns, partial indexes and CHECK constraints | **7** | Forward-only, reviewable SQL in git; expand/contract discipline makes rollback a code rollback, not a DB rollback (§5.8). |
| Auth | Custom: DB `sessions` table + `jose` (JWT for signed short-lived tokens) + `@node-rs/argon2` (argon2id) | jose **6**, argon2 **2** | 7-role RBAC, impersonation, audit trail and admin 2FA are first-class data-model concerns; an adapter-shaped library (Auth.js) would push authorization into callbacks instead of the service layer (hard rule 9). |
| Media / image pipeline | Cloudinary + `next/image` with a custom loader | Cloudinary SDK **2** | Derivative generation, AVIF/WebP negotiation and a global CDN with zero infrastructure; jewellery photography is the heaviest asset class on the site and Vercel image optimisation is billed per source image. |
| Rich text | Tiptap (ProseMirror) as the editor; stored as **JSON**; rendered by a first-party node→React renderer in `src/lib/cms/richtext.tsx` | **3** | Storing JSON not HTML means no `dangerouslySetInnerHTML` on admin-authored content and content survives a design change. The renderer emits React elements from an allowlisted node/mark map and **never produces an HTML string** — including for email, where React Email renders the same component tree to HTML itself. `@tiptap/html` is therefore *not* a dependency (§5.9): `generateHTML()` exists only to produce a string, which is the one artefact this design forbids. |
| Page builder | First-party: block JSON in `cms_blocks` + a typed React block registry | — | Per-breakpoint (desktop/tablet/mobile) config and version history are product requirements no third-party builder exposes cleanly. |
| Charts (admin only) | Recharts, `next/dynamic` with `ssr: false` | **3** | Admin dashboard only; must never appear in a storefront chunk. |
| Email | Resend + React Email components, with DB-stored template overrides | Resend **6**, React Email **0.5** | Transactional delivery with a real sending domain; editable templates are DB rows rendered by the same component tree (§4.6). |
| Payments | Stripe (US/USD) + Razorpay (India/INR) behind one `PaymentProvider` interface | Stripe **18**, Razorpay **2** | Two markets, two acquirers, one checkout codepath; adding UK/CA/AU later is a new provider binding, not a checkout rewrite. |
| Search | PostgreSQL FTS (`tsvector` generated column + GIN) with `pg_trgm` for typo tolerance, behind a `SearchProvider` interface | PG **17** | Catalogue size at launch does not justify a second datastore, and search must respect market/publish/visibility rules that live in SQL anyway. Escape hatch in §1.6. |
| Rate limiting | DB-backed `rate_limits` table (no Redis) | — | OTP, login, checkout and webhook endpoints need limits on day one; Redis is an operational dependency we do not need at this volume. |
| Testing | Vitest + Testing Library + Playwright | Vitest **3**, Playwright **1** | Unit + integration (real Postgres) + e2e checkout; test DB concurrency is capped to respect the `prisma dev` 10-connection limit (§5.9). |
| Linting / format | ESLint 9 flat config + `typescript-eslint` 8 + `eslint-plugin-boundaries` + Prettier 3 | — | `eslint-plugin-boundaries` mechanically enforces the layer rule in §2.2 — the architecture fails CI, not review. |
| Error tracking | Sentry (server, client, edge) | **9** | Payment and webhook failures must page someone; silent 500s in checkout are revenue loss. |
| CI | GitHub Actions | — | Typecheck, lint, unit, integration against an ephemeral Neon branch, build, e2e smoke (§5.3). |
| Analytics | First-party `analytics_events` table + optional GA4 via `gtag` | — | Server-recorded commerce events are the source of truth for admin dashboards (hard rule 7: no fake analytics); GA4 is additive and degrades to off when unconfigured. |

### 1.2 ORM decision: Prisma, not Drizzle

**The fork.** Drizzle is a thin SQL-first query builder: smaller cold starts, no
generated client, and total freedom in exotic SQL. Prisma owns a declarative
schema, generates a typed client, and owns migration generation.

**Decision: Prisma 7 with `@prisma/adapter-pg`.** Three deciding factors:

1. **Local development on this machine.** There is no Docker and no local
   Postgres. `prisma dev` gives a working local Postgres-compatible server with
   one command. Drizzle has no equivalent; choosing it forces every developer
   onto a hosted Neon branch for all local work, including offline work.
2. **Schema size.** This build is 40+ tables with heavy relational structure
   (products → variants → prices → markets → inventory → orders). One
   declarative schema that generates both the client and reviewable SQL
   migrations is materially cheaper to maintain than hand-written migrations
   plus hand-maintained table definitions.
3. **Proven on this machine.** The sibling project runs Prisma 7 +
   `@prisma/adapter-pg` + Neon in production. The failure modes are known.

**Where Prisma is deliberately bypassed** — these are not workarounds, they are
the designed escape hatches:

| Need | Mechanism |
| --- | --- |
| Inventory reservation without oversell | `prisma.$transaction(fn, { isolationLevel: 'ReadCommitted', timeout: 8000 })` wrapping `$queryRaw` `SELECT … FOR UPDATE` on `inventory_items`, locking rows in ascending `inventory_item_id` order so two multi-line carts cannot deadlock. **`ReadCommitted`, not `Serializable`:** the explicit row lock already serialises the two buyers of a one-of-a-kind piece. `Serializable` would additionally abort one of them with SQLSTATE `40001` — a 500 for a customer who should have seen "just sold" — under *every* concurrent checkout, not only the contended ones. |
| Transactions that genuinely need `Serializable` — **out-of-checkout counter repair only**: admin coupon-cap edits, `order_counters` repair, bulk redemption imports | `withSerializableRetry(fn, { attempts: 3, backoffMs: [25, 75, 200] })` in `src/lib/db/transaction.ts`: retries SQLSTATE `40001` and `40P01` only, with jitter; exhaustion returns a typed `ConcurrencyError`, never an unhandled 500. A bare inline `isolationLevel: 'Serializable'` outside `src/lib/db/` is a lint error (§2.2) |
| Idempotent webhook intake | `INSERT INTO webhook_events (provider, provider_event_id, …) … ON CONFLICT (provider, provider_event_id) DO NOTHING RETURNING id` — zero rows returned means this delivery is a duplicate, and the handler returns `200` without re-running a single effect (§2.7) |
| Lost-update protection on merchant edits | `UPDATE <table> SET …, version = version + 1 WHERE id = $1 AND version = $2 RETURNING id` — zero rows is `StaleWriteError`, not a silent overwrite (§2.7) |
| Search vector | Hand-written migration: `ALTER TABLE products ADD COLUMN search_vector tsvector GENERATED ALWAYS AS (…) STORED;` + `CREATE INDEX idx_products_search_vector ON products USING GIN (search_vector);` (Prisma maps it as `Unsupported("tsvector")`) |
| **Any `GENERATED ALWAYS AS (…) STORED` column, including one whose type Prisma does understand** — today that is `inventory_transactions.balance_before INTEGER` (`05 §1.4`) as well as `search_vector` | Hand-written migration creates the column; the Prisma model declares it `Unsupported("integer")? @ignore` so the generated client neither selects nor writes it; it is read through the raw-SQL layer in `src/lib/db/raw/` at the one place that needs it (the `/admin/inventory/transactions` list and its CSV export). **Application code never writes it — the database computes it.** |
| Conditional uniqueness (e.g. one active price per product/market/currency) | Hand-written `CREATE UNIQUE INDEX … WHERE deleted_at IS NULL` |
| Invariants (e.g. `CHECK (amount_minor >= 0)`, `CHECK (currency_code = upper(currency_code))`) | Hand-written `ALTER TABLE … ADD CONSTRAINT …` in the migration file |
| Admin list queries with dynamic facets | `prisma.$queryRaw` with `Prisma.sql` fragments, in the owning service only |

> **DECISION CHANGED — this table used to name "global coupon usage caps" and
> "order-number allocation" as the two cases that genuinely need `Serializable`.
> They are not.** `05 §8.5` disproved both: each is a **single-row counter**, and
> a row lock is a stronger and cheaper guarantee than snapshot isolation for a
> counter. The global cap is a conditional `UPDATE` on `coupons.redemption_count`
> with the cap in its `WHERE` (zero rows ⇒ `CouponUnavailableError`), and the
> order number is `SELECT … FOR UPDATE` on `order_counters` — both correct at
> `ReadCommitted`, which is the level they *must* run at, because they run inside
> the order transaction and the row above fixes that transaction at
> `ReadCommitted` for `reserveStock()`. Postgres takes one isolation level per
> transaction; the old text was not implementable where it had to run, and an
> engineer following it either dropped the reservation's documented level or split
> the redemption out of the order transaction, which `02 §5.3` forbids.
> `withSerializableRetry()` is not deleted — it keeps the callers named in the row
> above, all of which run outside checkout. `07 §6.6` and `05 §8.5` now agree with
> this row.

> **DECISION CHANGED — "Prisma maps this as a read-only field" is withdrawn.**
> `05 §1.4` used that phrase for `inventory_transactions.balance_before`. Prisma
> has no such concept for a *stored* generated column, so the mechanism was
> asserted rather than specified. The new row above is the mechanism, and it is
> the same escape hatch `search_vector` already uses.

Prisma config: `prismaSchemaFolder` (multi-file schema under `prisma/schema/`),
driver adapter `@prisma/adapter-pg` (not the Rust data proxy), and a single
client singleton in `src/lib/db/client.ts`.

### 1.3 Rendering strategy per route class

Default runtime is `nodejs` for every route (Prisma + `node:crypto`).
`middleware.ts` runs on the edge and **must not import Prisma or any service** —
enforced by lint boundaries (§2.2).

| Route class | Path | Strategy | `revalidate` | Cache tags | Rationale |
| --- | --- | --- | --- | --- | --- |
| Home | `/`, `/in` | ISR | 300s | `cms:page:home`, `market:{code}` | Merchandising changes must show within minutes; must be crawlable as static HTML. |
| Category / collection (canonical, unfiltered) | `/rings`, `/in/rings`, `/collections/[slug]` | ISR + `generateStaticParams` over published categories | 900s | `category:{id}`, `market:{code}` | These are the money SEO pages; they must be pre-rendered and CDN-served. |
| Curated facet pages | `/rings/moonstone`, `/pendants/14k-gold` | ISR, explicit whitelist rows in `curated_facets` | 900s | `category:{id}`, `stone:{id}` | Indexable, human-curated facet combinations. Arbitrary facet URLs are not. |
| Product detail | `/products/[slug]`, `/in/products/[slug]` | ISR + `generateStaticParams` (top N by rank, rest on-demand) | 900s | `product:{id}`, `market:{code}` | Highest-volume crawl surface; price and availability band come from tagged data cache, purged on write. |
| Stone pages | `/stones/[slug]` | ISR | 1800s | `stone:{id}` | Stone-led discovery is an SEO strategy, not a filter. |
| CMS pages | `/pages/[...slug]` | ISR | 600s | `cms:page:{id}` | Page-builder output is static content. |
| Journal / editorial | `/journal`, `/journal/[slug]` | ISR | 1800s | `cms:post:{id}` | — |
| Filtered listing (any `searchParams` present) | `/rings?stone=…&price=…` | **Dynamic**, `no-store`, `<meta robots="noindex,follow">` | — | — | Prevents infinite crawl space and index dilution; canonical points to the unfiltered URL. |
| Site search | `/search` | Dynamic, `no-store`, `noindex` | — | — | Query-dependent, zero SEO value. |
| Cart / checkout | `/cart`, `/checkout`, `/checkout/[step]` | **Dynamic, `force-dynamic`, `no-store`** | — | — | Hard rule 3 and §2.5. |
| Account | `/account/**` | Dynamic, `force-dynamic`, `no-store`, `noindex` | — | — | Customer data. |
| Order confirmation | `/orders/[token]` | Dynamic, `no-store`, `noindex` | — | — | Token-scoped, never cached. |
| Admin | `/admin/**` | Dynamic, `force-dynamic`, `no-store`, `noindex`, `X-Robots-Tag: noindex` | — | — | Authenticated, always fresh. |
| Webhooks | `/api/webhooks/**` | Dynamic, `nodejs`, raw-body reader | — | — | Signature verification needs the unparsed body. |
| Cron | `/api/cron/**` | Dynamic, `maxDuration: 300` | — | — | §5.6. |
| `sitemap.xml` (+ shards) | `/sitemap.xml`, `/sitemaps/[shard].xml` | ISR | 3600s | `sitemap` | Sharded at 40k URLs. |
| `robots.txt` | `/robots.txt` | Static per environment | — | — | `Disallow: /` on every non-production environment (§5.5). |

**Cache API, named once.** `src/lib/cache/cached.ts` is the single wrapper for
every entry in the `revalidate`/`Cache tags` columns above. It is implemented
today with `unstable_cache(fn, keyParts, { tags, revalidate })`; if `'use cache'`
with `cacheTag()` / `cacheLife()` is enabled for this app, the swap happens in
that one file. No page, service or component calls either API directly — that is
what makes the choice a one-file edit instead of a 200-file migration.

**A cached tree contains nothing about a person.** Every ISR row above renders
*inside* `(storefront)/[market]/layout.tsx`, so the layout is part of the cached
HTML object. A header that renders the signed-in name, the cart count, the
wishlist state or a customer-group price bakes one visitor's data into a CDN
object and serves it to the next few hundred. The rules:

- No `cookies()`, `headers()` or `draftMode()` call in any component reachable
  from an ISR route. Reading them silently converts the whole route to dynamic,
  which is the *lucky* outcome — the unlucky one is a `<Suspense>` boundary whose
  signed-out fallback is what got cached and whose real content never renders.
- Cart count, wishlist state, "signed in as", recently-viewed and any
  customer-scoped price render **client-side only**, after hydration, from
  `GET /api/cart` and `GET /api/account/summary` (both `no-store`). The server
  HTML always ships the signed-out state.
- Availability on a PDP is the same problem with a shorter fuse — §2.4.
- `tests/e2e/cache-leak.spec.ts`: sign in as A, request a PDP, sign out, request
  it again as B, assert B's HTML contains nothing from A's session while
  `x-vercel-cache: HIT` proves the object really was shared.

**Middleware scope.** Middleware runs on every matched request and costs an edge
invocation each time, so it is matched narrowly:

```ts
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|brand/|site\\.webmanifest|api/webhooks|api/cron|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff2?|txt|xml)$).*)'],
};
```

The webhook exclusion is not an optimisation: signature verification needs the
request body byte-identical, and nothing should be in a position to touch it.

**Mutations.** Every storefront and admin mutation goes through a **server
action** in `src/server/actions/`. Route handlers exist only for: webhooks,
cron, signed media uploads, OG image generation, health, and public JSON read
APIs consumed by client components (facet counts, typeahead, cart badge). No
mutation is exposed as a `GET`.

### 1.4 Market routing

One domain. US is the root; every other market is path-prefixed.

- Route tree is `src/app/(storefront)/[market]/…` — the market is **always**
  explicit inside the app.
- `middleware.ts` **rewrites** (not redirects) `/rings` → `/us/rings` when the
  first segment is not an active market code, so the US canonical URL has no
  prefix.
- `middleware.ts` **301-redirects** an explicit `/us/*` to `/*` to prevent
  duplicate content.
- Market is **never** chosen by IP. Geo may render a dismissible "Shopping from
  India? Switch to ₹" banner, and the choice is persisted in the `md_market`
  cookie — but a crawler always gets the market its URL asked for. Geo-redirect
  is cloaking and costs rankings.
- **The cookie never selects the market for a rendered page.** `md_market` is
  read in exactly two places: middleware, to decide whether to show the switch
  banner, and the market-switcher server action, which turns it into a
  `redirect()` to the other market's URL. Inside the app tree the market is the
  `[market]` segment and nothing else. This is not stylistic. `/products/emerald-ring`
  is ISR-cached for 900s; if market resolution preferred a cookie, the first
  request from a visitor carrying `md_market=IN` would bake ₹ prices into the CDN
  object served to every US visitor for the next fifteen minutes — and every
  subsequent US visitor would see a correct-looking page with the wrong currency
  and the wrong number. Accordingly the signature is
  `resolveMarket(marketSegment: string): Promise<Market>` — there is no
  `cookieMarket` parameter to misuse (§2.3).
- `hreflang` alternates emitted for every active market; `x-default` → US.

**Markets are rows, so market codes are not a TypeScript union.** `MarketCode`
and `CurrencyCode` are branded strings —
`type MarketCode = string & { readonly __brand: 'MarketCode' }` — validated at
each boundary by a Zod schema that refines against `listActiveMarkets()`, not
`'US' | 'IN'` literals. A literal union looks harmless and then makes adding
Canada a type change, a code review, a build and a deploy, which contradicts hard
rule 1 and the claim in the next paragraph. For the same reason
`generateStaticParams()` for `[market]` **queries the `markets` table**; it never
returns a hand-written array. The same applies to `PaymentProvider['key']` and to
`priceSource` (§2.3).

Adding UK is then: one `markets` row (code, currency, locale, tax regime,
fulfilment locations, payment provider key), one `prices` row per variant in GBP,
one `metal_rates` row per linked material in GBP, and a provider registration if
GBP needs an acquirer that is not already registered. No route change, no type
change, **no source change** — and one redeploy, for the reason below.

**Where middleware gets the market list: the build-time snapshot, and nothing
else.** The rewrite and the 301 above both need the set of active market codes
and which one is primary, and §2.2 forbids Prisma in the Edge runtime. `04 §5.2`
proposed *two* sources — a public `GET /api/internal/market-snapshot` route
fetched by middleware with a 60-second module cache and a fail-open path,
**plus** `src/generated/market-snapshot.json` as the cold-isolate fallback.

**Decision: the generated file is the only source, and the route is not built.**
Two sources of market truth in the edge is the defect, not either one of them;
and once the fallback is acceptable as the answer on a cold isolate, it is the
answer.

```ts
// src/lib/edge/markets.ts — the ONLY module middleware reads market shape from.
import snapshot from '@/generated/market-snapshot.json';   // static import, no fetch
//   Written by scripts/gen-market-snapshot.ts, run inside the build command
//   (§5.2) by the same query generateStaticParams() already makes against `markets`.
//   src/generated/ is gitignored (§5.9 step 5), so third-market.test.ts's
//   "empty `git diff src/`" assertion still holds.
export const MARKETS: readonly EdgeMarket[] = snapshot.markets;
export const PRIMARY_SEGMENT: string = snapshot.primary;   // markets.rank asc, active only
```

What this buys, and what it costs:

- **Removes** a public, unauthenticated endpoint that enumerated every market row
  **including inactive ones**. That is a disclosure of unlaunched markets to
  anyone who asks — the same class of thing `07 §8.2` refuses elsewhere — and it
  existed only to serve our own middleware.
- **Removes** a network fetch on the edge hot path, a 60-second staleness window,
  a fail-open branch, a module-scope mutable cache and a background refetch.
- **Costs:** activating a market now takes effect at the next deployment rather
  than within 60 seconds. That is acceptable because activating a market is not a
  switch — it needs a `prices` row per variant, a payment provider credential (an
  environment change, which is a redeploy on Vercel regardless), shipping zones
  and a tax registration.
- **Deactivation is not affected at all.** `resolveMarket()` reads the database
  and throws `NotFoundError` for an inactive code (§2.3), so `/in/rings` 404s the
  moment the row flips, whether or not middleware still recognises `in` as a
  segment. The emergency direction — turn a market off now — needs no deploy.
- `/admin/settings/markets` states this in the UI ("this market goes live at the
  next deployment") and offers a **Deploy now** button when
  `VERCEL_DEPLOY_HOOK_URL` is set (optional, §4.1). Unset, the button is hidden
  and the panel says so. **It is deliberately not an `IntegrationKey`** —
  `11 §6` is a closed fourteen-value union — it is a plain optional variable
  whose absence hides one button.
- `tests/unit/market-snapshot.test.ts` keeps its checksum assertion (the file is
  generated, never hand-edited) and gains one: `src/lib/edge/**` contains no
  `fetch(`.

> **RESOLVED — was CHANGE REQUIRED IN 04 §5.2:** delete `GET /api/internal/market-snapshot`, the
> *Verified applied in 04.*
> 60-second module cache and the fail-open refetch. Keep the rest of that section
> verbatim — the build-time snapshot, the checksum test, and above all
> **"'primary' is `markets.rank` ascending among active markets, not the literal
> `'US'`"**, which is the part that makes the day India becomes primary a row
> change rather than a code change.

> **RESOLVED — was CHANGE REQUIRED IN 11 §10.9:** the "route files with no manifest row" table
> *Verified applied in 11.*
> lists `GET /api/internal/market-snapshot` as needing a manifest row in
> `08 §2.2`. It needs no row, because it is not built. The other four routes in
> that table are unaffected.

### 1.5 Dependency discipline — what must NOT be added

Adding anything to `dependencies` requires an ADR in `docs/decisions/`. The
following are **rejected up front**; a PR adding them fails review:

| Rejected | Because |
| --- | --- |
| tRPC, GraphQL (Apollo/urql/Yoga) | Server actions + typed route handlers already give end-to-end types with zero extra runtime. |
| TanStack Query, SWR, Redux, Redux Toolkit | Server components + router cache + `useActionState`/`useOptimistic` cover every case here. A client cache would become a second source of truth for price and stock — a direct hard-rule-3 violation. |
| MUI, Chakra, Ant Design, Bootstrap, DaisyUI | Bespoke editorial design; a design system would be fought, not used. |
| styled-components, Emotion, any runtime CSS-in-JS | Incompatible with RSC streaming; Tailwind v4 tokens already exist. |
| NextAuth / Auth.js | §1.1. RBAC and audit belong in our schema. |
| Sanity, Contentful, Strapi, Payload | We **are** the CMS. A second content store splits the source of truth (hard rule 1). |
| Medusa, Saleor, Shopify SDK, Commerce.js | We **are** the commerce engine. |
| moment, dayjs, lodash, underscore, axios, request | `Intl` + `date-fns` (v4, already needed for admin date ranges) + native `fetch` cover it. |
| `currency.js`, `dinero.js`, any FX/conversion library | Money is `bigint` minor units + an ISO currency code, and USD↔INR conversion is forbidden by hard rule 2. A conversion helper in the tree is an invitation to break it. |
| `next-intl`, `react-i18next` | Markets ≠ languages. Launch is English-only and copy is CMS-controlled. Revisit only when a second language is actually commissioned. |
| Algolia / Meilisearch / Typesense / Elastic | §1.6. Not at launch. |
| Redis / Upstash | Rate limiting and idempotency are DB-backed. Optional env hooks exist (§4.8) but no code path requires Redis. |
| `dangerouslySetInnerHTML` on any user- or admin-authored string | Tiptap JSON + allowlist renderer. Lint rule: `react/no-danger` = error, one documented exception for the JSON-LD `<script type="application/ld+json">` emitter. |

### 1.6 Search escape hatch

`src/lib/search/` exports a `SearchProvider` interface and ships one
implementation, `PostgresSearchProvider`. Revisit an external engine only when
one of these is true, and record the measurement in the ADR:

- p95 `searchProducts()` latency > 300ms at production catalogue size, **or**
- published product count > 25,000, **or**
- the client requires merchandised ranking rules per market that cannot be
  expressed as a SQL `ORDER BY`.

Until then, no second datastore.

---

## 2. System architecture

### 2.1 Entry points

```
                 ┌─────────────────────────────────────────────────────────────┐
 browser ───────▶│ middleware.ts (edge)                                        │
                 │  • market resolve + rewrite/redirect                        │
                 │  • redirect match from an in-memory snapshot (see below)    │
                 │  • session cookie PRESENCE gate on /admin (not authz)        │
                 │  • security headers, request id                             │
                 └───────────────┬─────────────────────────────────────────────┘
                                 │
   ┌─────────────────────────────┼──────────────────────────────┬──────────────┐
   │ STOREFRONT                  │ ADMIN                        │ MACHINE      │
   │ src/app/(storefront)/**     │ src/app/(admin)/admin/**     │ src/app/api  │
   │ RSC pages (ISR/dynamic)     │ RSC pages (force-dynamic)    │ /webhooks/** │
   │ + server actions            │ + server actions             │ /cron/**     │
   │   src/server/actions/*      │   src/server/actions/admin/* │ /media/sign  │
   └─────────────┬───────────────┴──────────────┬───────────────┴──────┬───────┘
                 │                              │                      │
                 ▼                              ▼                      ▼
   ┌──────────────────────────────────────────────────────────────────────────┐
   │ SERVICE LAYER — src/lib/<domain>/                                        │
   │ the ONLY place business rules exist. Every entry point above calls here. │
   │ Each service: validates input (Zod), authorizes (rbac), executes in a    │
   │ transaction, writes audit, revalidates cache tags, returns a Result.     │
   └──────────────────────────────┬───────────────────────────────────────────┘
                                  ▼
   ┌──────────────────────────────────────────────────────────────────────────┐
   │ DATA LAYER — src/lib/db/ (Prisma client, $transaction helper, raw SQL)   │
   │ + EXTERNAL ADAPTERS — payments/providers, media, email, analytics        │
   └──────────────────────────────────────────────────────────────────────────┘
```

| Entry point | Path | Auth | Allowed to call |
| --- | --- | --- | --- |
| Storefront RSC page | `src/app/(storefront)/[market]/**/page.tsx` | optional customer session | read-only service functions (`get*`, `list*`, `resolve*`) |
| Storefront server action | `src/server/actions/*.ts` | customer session or guest cart token | any service function |
| Admin RSC page | `src/app/(admin)/admin/**/page.tsx` | staff session + `requirePermission()` | read-only service functions |
| Admin server action | `src/server/actions/admin/*.ts` | staff session + `requirePermission()` | any service function |
| Webhook | `src/app/api/webhooks/{stripe,razorpay}/route.ts` | provider signature verification | `payments`, `orders`, `inventory` services |
| Cron | `src/app/api/cron/*/route.ts` | `CRON_SECRET` header + `x-vercel-cron` | any service function |
| Public JSON API | `src/app/api/{catalog,cart}/**/route.ts` | none / cart token | read-only service functions |
| Order status poll | `src/app/api/checkout/status/[orderId]/route.ts` | customer session **or** the cart token that created the order — never the order id alone | `orders` read-only |

Middleware does **presence** checks only (is there a session cookie). The
authorization decision is always re-made server-side inside the service call.
Hiding a nav item is not authorization (hard rule 9).

**A layout is not a guard for anything but rendering.**
`(admin)/layout.tsx`'s `requireStaffSession()` runs when a *page* renders. It
does not run when a server action is invoked, when a route handler is hit, or
when a client replays an action id scraped from an earlier response — server
actions are plain POST endpoints addressed by a generated id and reachable by any
caller who has one. So every file in `src/server/actions/admin/**` calls
`requirePermission()` itself as its first statement after `parse`, and
`tests/unit/actions-authorized.test.ts` asserts that every exported `'use server'`
function under that folder contains one. `next.config.ts` additionally sets
`experimental.serverActions.allowedOrigins: [new URL(NEXT_PUBLIC_APP_URL).host]`
so a cross-origin POST cannot reach an action at all.

**The redirects lookup is not a database call, and not a self-`fetch` either.**
Middleware may not import Prisma (§2.2), and a `fetch()` to our own origin on
every request would add a second function invocation per page view, put a
cold-start dependency in front of every request, and hang or fail open exactly
when the origin is the thing that is broken. Instead, `src/lib/edge/redirects.ts`:

- holds a module-scope `Map<string, { to: string; status: 301 | 302 }>` plus a
  `loadedAt` timestamp — the edge runtime keeps module state alive between
  requests on the same isolate, so the snapshot is built roughly once per isolate;
- refreshes it with
  `fetch('/api/catalog/redirects', { next: { tags: ['redirects'], revalidate: 60 } })`
  guarded by `loadedAt` and `AbortSignal.timeout(400)`, **fail-open**: a failed
  refresh serves the previous snapshot, and an empty snapshot means "no redirect",
  never a 500 in front of the entire site;
- is consulted **only** when the path did not match a known route pattern, so
  `/`, `/rings` and `/products/…` never pay for it.

> **NEEDS INPUT:** the expected size of the redirect table at launch (a
> migration from an existing site would supply it). Above roughly 20k rows the
> per-isolate snapshot stops being free and the lookup moves to a bloom-filter
> prefilter plus an on-demand single-row fetch. Below that, the snapshot wins.

### 2.2 The layer rule, enforced by lint

`eslint.config.mjs` defines `eslint-plugin-boundaries` element types and a
deny-by-default `element-types` rule:

| Element type | Glob | May import |
| --- | --- | --- |
| `app` | `src/app/**` | `actions`, `service`, `components`, `types`, `config` |
| `actions` | `src/server/actions/**` | `service`, `types`, `config` |
| `service` | `src/lib/*/**` | other `service`, `data`, `types`, `config` |
| `data` | `src/lib/db/**` | `types`, `config` |
| `components` | `src/components/**` | `components`, `types`, `config`, **`service` types only** (`import type`) |
| `middleware` | `middleware.ts`, `src/lib/edge/**` | `config`, `types`, and `@/generated/market-snapshot.json` — **not** `data`, **not** `service`, **not** `fetch` to our own origin (§1.4) |
| `reporting` | `src/lib/reporting/**` | `data`, `types`, `config`, and **read-only** exports of other services. It may **not** import a mutator, and nothing may import *it* except `src/app/(admin)/**` |

Violations that CI rejects:

- `src/app/**` importing `@/lib/db` — pages never touch Prisma.
- `src/components/**` importing anything from `@/lib/db` or a non-type export of
  a service — components receive data as props.
- `middleware.ts` importing Prisma or any `src/lib/<domain>` module — it runs on
  the edge and would break the build or leak DB credentials to the edge runtime.
- Any file outside `src/lib/pricing/**` importing a price-computation helper.

Plus hard `no-restricted-imports` / `no-restricted-syntax` rules. Each one exists
because of a specific defect, named:

| Banned | Allowed only in | The bug it prevents |
| --- | --- | --- |
| `@prisma/client` **and `@/generated/prisma`** — the client is generated to `src/generated/prisma` (§5.9), so banning one spelling and not the other bans nothing | `src/lib/db/**`, `prisma/**` | A page or component holding a live Prisma model and drifting from the service's view of it. `src/generated/` is also in `.gitignore` and in `eslint.config.mjs#ignores`, or CI lints generated code and fails on it. |
| The `cached()` wrapper / `unstable_cache` | `src/lib/catalog/**`, `src/lib/cms/**`, `src/lib/market/**`, `src/lib/seo/**` — explicitly **not** `src/lib/pricing/**`, `cart/**`, `checkout/**`, `orders/**`, `payments/**` | Caching a customer- or coupon-scoped price under a key that contains neither (§2.4) |
| `Intl.NumberFormat`, `.toFixed(`, `parseFloat(`, and `Number()` applied to an amount | `src/lib/money.ts` | Four money formatters, one of which groups ₹1,00,000 as ₹100,000 (§2.6) |
| `isolationLevel: 'Serializable'` written inline | `src/lib/db/transaction.ts` | A serialization failure reaching the customer as a 500 instead of a retry (§1.2) |
| `process.env` | `src/lib/config/env.ts` | An unvalidated, possibly-`undefined` secret read at request time |
| `new Date()` inside `src/lib/pricing/**` | — (`at` is always passed in) | A price that differs between two calls a millisecond apart during the same checkout |
| `SUM(`, `AVG(` or `+` over a `*_minor` column **without** a `currency_code` in the same `GROUP BY` | `src/lib/reporting/**`, where the rule is enforced by review of a small module rather than by a lint | Adding USD to INR inside an aggregate, which is hard rule 2 violated where nobody looks — a total, not a price. `src/lib/reporting/` exists partly so that this hazard has exactly one address |

**`src/lib/reporting/` is a service module like any other, and it is listed here
because it previously had no home.** Every other domain in this set has a module,
an owner, a signature list and a tier; admin analytics had a dashboard tile. It is
its own element type rather than a folder inside `src/lib/analytics/` for two
reasons: `analytics` **writes** events on the request path and reporting must
never do that, and reporting is the one module whose queries legitimately span
`orders`, `order_items`, `product_stones`, `variant_materials`,
`inventory_items` and `wishlist_items` at once — which under the one-service-per-domain
rule of §2.3 would otherwise read as six violations. Its constraint is the
compensating one: **read-only, admin-only, and never an authority.** A figure
`src/lib/reporting/` computes is displayed; it is never written back, never
charged, and never read by the storefront.


Everywhere outside `src/lib/db/**` uses types re-exported from
`src/lib/db/types.ts`.

### 2.3 One service per domain — the non-duplication rule

**Hard rule: pricing, inventory, order, payment and market logic each live in
exactly ONE module. No frontend component, no admin page, no checkout step and
no API route re-implements, re-derives, re-rounds or "adjusts" any of them.**

| Domain | Sole owner | The one thing nobody else may do |
| --- | --- | --- |
| Pricing | `src/lib/pricing/` | Compute, convert, round, discount or display-derive any amount. Callers receive a fully-resolved object and render it. |
| Inventory | `src/lib/inventory/` | Read "is it available", decrement, reserve or release stock. |
| Orders | `src/lib/orders/` | Create an order, transition its status, snapshot line data, compute totals. |
| Payments | `src/lib/payments/` | Talk to Stripe or Razorpay, interpret a payment status, mark an order paid. |
| Market | `src/lib/market/` | Decide the active market, its currency, its locale, its fulfilment locations, its tax/shipping regime, its payment provider. |
| Checkout | `src/lib/checkout/` | Orchestrate the §2.5 sequence. It owns the *order* of those calls and owns none of their logic — it may not price, round, reserve, transition or capture anything itself. |

Canonical signatures (other sections must reuse these names verbatim):

```ts
// src/lib/pricing/index.ts — THE only price authority
export async function resolvePrice(input: {
  variantId: string;
  marketCode: MarketCode;          // 'US' | 'IN' | future
  quantity: number;
  customerId?: string;
  couponCode?: string;
  at?: Date;                       // defaults to now(); order replay passes the order date
}): Promise<ResolvedPrice>;

export type ResolvedPrice = {
  currencyCode: CurrencyCode;      // 'USD' | 'INR'
  unitListMinor: bigint;           // pre-discount, integer minor units
  unitSaleMinor: bigint;           // post product-level discount
  unitFinalMinor: bigint;          // post coupon/customer-group
  lineSubtotalMinor: bigint;       // unitFinalMinor * quantity
  discountBreakdown: DiscountLine[];
  priceSource: 'manual' | 'metal_linked' | 'hybrid';
  metalRateId: string | null;      // metal_rates.id used when priceSource != 'manual'
  priceRecordId: string;           // prices.id used — logged onto the order line
  roundingResidueMinor: bigint;    // 04 §1.4 steps 9-10; createOrderFromCart() adds it to
                                   // that line's line_discount_minor (05 §3.6) so the sum
                                   // of the lines equals the figure the shopper was shown
  computedAt: Date;
};
// Two CONTRACT EXTENSIONS, flagged here rather than left implicit. `04 §1.3` returns a
// fourth key from getDisplayPrice (`compareAtMinor`) and `04 §1.4` adds an eleventh field
// to ResolvedPrice (`roundingResidueMinor`), which `05 §3.6` then depends on at order
// build time. Neither was declared as an extension the way `03 §8.1` declares
// AvailabilityBand's fifth value, so a reader of this section alone would have written a
// ten-field type and a three-key map and discovered the difference at P23.

// Listing surfaces (PLP, search, collection, wishlist, cart, cart drawer, email)
// MUST use the batch form. `resolvePrice` inside a `.map()` over 48 product cards
// is 48 round trips on the hottest page on the site; `no-await-in-loop` plus a
// custom `no-service-call-in-map` rule make it a CI failure, not a code review.
export async function resolvePriceBatch(
  lines: { variantId: string; marketCode: MarketCode; quantity: number }[],
  ctx?: { customerId?: string; couponCode?: string; at?: Date },
): Promise<Map<string, ResolvedPrice>>;   // ONE query, keyed by variantId

// Display-only, and therefore the ONLY pricing function that may be cached:
// no customerId, no couponCode, so no per-customer value can enter a shared
// cache entry (§2.4). Caching is applied by the caller in src/lib/catalog/,
// never inside src/lib/pricing/.
export async function getDisplayPrice(
  variantIds: string[], marketCode: MarketCode,
): Promise<Map<string, {
  currencyCode: CurrencyCode; listMinor: bigint; saleMinor: bigint;
  compareAtMinor: bigint | null;   // prices.compare_at_minor — the struck-through figure
}>>;

// src/lib/inventory/index.ts — THE only stock authority
export async function reserveStock(
  tx: Tx,
  lines: { variantId: string; quantity: number; locationId?: string }[],
  ref: { kind: 'cart' | 'order'; id: string; expiresAt?: Date },
): Promise<Result<Reservation, InsufficientStockError>>;      // SELECT … FOR UPDATE
export async function releaseStock(
  tx: Tx, reservationId: string,
  reason: 'expired' | 'cart_changed' | 'payment_failed' | 'admin',   // REQUIRED, not defaulted
): Promise<void>;
// The third argument is not optional and has no default. `reservations.release_reason`
// is a column 02 §2.6 defines with exactly these four values, and a default would make
// every unlabelled call site record the same reason — which is how "why did this piece
// come back on sale?" becomes unanswerable. This signature is the one that moved: an
// earlier draft of this section declared `releaseStock(tx, reservationId)` with nowhere
// to put the reason.
//
// THE ARITY IS THREE, EVERYWHERE. That is a requirement on the call sites, not a report
// about them: 04 §6.3, 05 §1.6 and 05 §8.8 are the three that exist, and a two-argument
// call anywhere is a compile error under `strict` because the parameter is required.
// `tests/unit/inventory-contract.test.ts` additionally asserts that every literal passed
// as `reason` is one of the four enum values, so a typo'd string is a test failure rather
// than a `release_reason` nobody can filter on.
export async function commitStock(tx: Tx, reservationId: string): Promise<void>;
export async function getAvailability(
  variantIds: string[], marketCode: MarketCode,
): Promise<Map<string, AvailabilityBand>>;
// AvailabilityBand is FIVE values and is declared in src/types/inventory.ts, not here:
//   'in_stock' | 'low' | 'out' | 'made_to_order' | 'sold'      (11 §7.1)
// 'sold' keys on `products.is_one_of_a_kind AND products.sold_at IS NOT NULL` and
// NEVER on available_quantity <= 0 — for an inventory of one that is also true for the
// thirty minutes another shopper's reservation holds it, and a SOLD plate over an
// unsold piece is a lie the page then retracts without telling anyone (03 §2.5).
// marketCode is not decoration. Availability is (on_hand − reserved) summed over
// the locations that fulfil THAT market, via `market_locations`. A piece held only
// in the Mumbai location is 'out' for US, not 'in_stock'; without the parameter the
// multi-location schema exists but every query ignores it, and the first US order
// for an India-only piece is unfulfillable.

// src/lib/orders/index.ts
export async function createOrderFromCart(input: {
  cartId: string; marketCode: MarketCode; customerId?: string;
  email: string; shippingAddressId: string; billingAddressId: string;
  idempotencyKey: string;
}): Promise<Result<Order, CheckoutError>>;
// CheckoutError is a TYPE ALIAS over a union of AppError subclasses, declared in
// 11 §2.1 — not a class. Declaring it as a class is how a second error taxonomy
// starts: it would need its own `code`, and `error-taxonomy.test.ts` asserts one
// class per ErrorCode. The same applies to PricingError (04 §1.5) and RefundError
// (05 §9.4). The 52 concrete classes live in src/lib/errors.ts (11 §2.2).
export async function transitionOrder(
  orderId: string, to: OrderStatus, actor: Actor, reason?: string,
): Promise<Result<Order, IllegalTransitionError>>;

// src/lib/payments/index.ts
// Registry lookup: markets.payment_provider_key → the module registered in
// src/lib/payments/providers/index.ts. Returns null when the key is unset or the
// integration is `unconfigured` (§4.9), which blocks checkout for that market and
// never silently falls back to another market's acquirer in another currency.
export function getProviderForMarket(marketCode: MarketCode): PaymentProvider | null;
export interface PaymentProvider {
  readonly key: string;                          // NOT a union — a third acquirer is a
                                                 // new file plus a markets row, never a
                                                 // type edit in a shared interface
  readonly supportedCurrencies: readonly CurrencyCode[];
  createIntent(order: Order, idempotencyKey: string): Promise<PaymentIntentRef>;
  verifyWebhook(rawBody: Buffer, headers: Headers): Promise<WebhookEventEnvelope>;
  // The envelope MUST expose provider event id, amount in minor units, currency and
  // our order id, because §2.5 asserts on all four before marking anything paid.
  capture(paymentId: string): Promise<PaymentResult>;
  refund(paymentId: string, amountMinor: bigint, reason: string,
         idempotencyKey: string): Promise<RefundResult>;
}

// src/lib/market/index.ts
export async function resolveMarket(marketSegment: string): Promise<Market>;
// No cookie parameter, by construction (§1.4). Throws NotFoundError for an unknown
// or inactive code, so a bad URL 404s instead of quietly rendering US prices under
// an Indian path.
export async function listActiveMarkets(): Promise<Market[]>;
```

**Two rules the pricing service enforces in code, not in a comment.**

1. **A metal-linked price is computed from a rate quoted in that market's own
   currency.** The table is
   `metal_rates (id, material_id, currency_code, rate_minor_per_gram, effective_at, source)`
   — one row per material **per currency**, each entered or fetched
   independently, `UNIQUE (material_id, currency_code, effective_at)`. A USD price
   uses the USD rate row; an INR price uses the INR rate row. If the rate row for a
   market's currency is missing or older than `PRICING_RATE_MAX_AGE_HOURS`, the
   recalculation preview reports "no USD silver rate for 2026-09-12" and refuses
   *that market's* lines while still proposing the others. What it must never do is
   take one rate and a conversion factor: a single `silver_prices.price` column
   driving both a USD and an INR price is an FX conversion between market prices
   (hard rule 2) wearing a pricing-feature costume, and it would go unnoticed
   precisely because it produces plausible numbers.
2. **The entity is `materials`, not silver.** The launch catalogue contains 14K
   GOLD and LAB GROWN DIAMONDS; gold moves further and faster than silver, and the
   client will ask for gold-linked pricing. So `priceSource` is
   `'manual' | 'metal_linked' | 'hybrid'` carrying a `material_id`, the nightly job
   is `/api/cron/metal-rate-refresh` iterating configured materials × currencies
   (§5.6), and the admin screen is `/admin/pricing/metal-rates`. Silver is the
   first configured row, not the schema.

Every service function that mutates follows the same six steps, in order:

1. `parse` — Zod schema from `src/lib/<domain>/schema.ts`. Every `list*` schema
   caps `limit` at 100 and takes a `cursor`; there is no unbounded read (§2.7).
2. `authorize` — `requirePermission(actor, 'product.update')` from `src/lib/rbac`.
3. `check version` — every update to a merchant-editable row carries
   `expectedVersion` and is written as
   `UPDATE … SET …, version = version + 1 WHERE id = $1 AND version = $2`.
   Zero rows affected is `StaleWriteError`, surfaced as "someone else changed this
   while you were editing" — never a silent overwrite (§2.7).
4. `execute` — inside `withTransaction()`; all reads that guard a write use
   `FOR UPDATE`.
5. `audit` — `recordAudit(tx, { actorId, entity, entityId, action, before, after })`
   **inside** the same transaction.
6. `revalidate` — `revalidateTags([...])` **after** commit, never before.

Steps 3, 5 and 6 are not optional and not the caller's job.

### 2.4 Caching strategy and invalidation

Two caches, one tag vocabulary. `src/lib/cache/tags.ts` is the only place tag
strings are constructed:

```ts
export const tags = {
  product:   (id: string) => `product:${id}`,
  productSlug: (m: MarketCode, slug: string) => `product-slug:${m}:${slug}`,
  category:  (id: string) => `category:${id}`,
  collection:(id: string) => `collection:${id}`,
  stone:     (id: string) => `stone:${id}`,
  material:  (id: string) => `material:${id}`,
  cmsPage:   (id: string) => `cms:page:${id}`,
  cmsPost:   (id: string) => `cms:post:${id}`,
  nav:       (m: MarketCode) => `nav:${m}`,
  market:    (m: MarketCode) => `market:${m}`,
  settings:  () => `settings`,
  redirects: () => `redirects`,
  sitemap:   () => `sitemap`,
} as const;
```

Every cached data function is wrapped in `unstable_cache(fn, keyParts, { tags, revalidate })`
and **every key includes the market code** — a cached US price must be
unreachable from an India request.

| Content type | Cached where | Tags | Invalidation trigger |
| --- | --- | --- | --- |
| Product detail (copy, media, attributes, stones, materials) | ISR page + data cache | `product:{id}`, `product-slug:{market}:{slug}`, `market:{m}` | product save/publish/unpublish/delete, variant CRUD, media add/reorder, attribute change, slug change (also writes a `redirects` row) |
| Product **display** price — `getDisplayPrice()` only, no customer, no coupon | data cache, key includes `{market}` | `product:{id}`, `market:{m}` | `prices` row insert/activate for that product; market-wide sale activation; **metal rate change only when an admin approves a recalculation run** (hard rule 6) |
| Availability band | data cache, 60s | `product:{id}`, `market:{m}` | stock movement that crosses a band boundary (`out`↔`low`↔`in_stock`); routine decrements that stay in-band do not purge. **Any movement on a variant whose product is in ONE OF A KIND purges immediately**, in-band or not — for an inventory of 1 there is no such thing as an in-band decrement |
| Category / collection listings | ISR page + data cache | `category:{id}`, `collection:{id}`, `market:{m}` | membership change, sort/rank change, publish toggle, any member product publish toggle |
| Stone & material pages | ISR page + data cache | `stone:{id}`, `material:{id}` | stone/material save; product↔stone link change |
| Navigation / menus | data cache | `nav:{market}` | menu save, category publish toggle, market activation |
| CMS pages & blocks | ISR page + data cache | `cms:page:{id}` | page publish, block edit, version restore, breakpoint config change |
| Journal posts | ISR page | `cms:post:{id}` | publish/unpublish/edit |
| Settings (`settings` table) | data cache + per-request memo | `settings` | any settings write |
| Redirects table | data cache (read by middleware via a tagged route handler, not Prisma) | `redirects` | redirect CRUD, product/category slug change |
| Sitemaps | ISR 3600s | `sitemap` | nightly cron + any publish event |
| Media derivatives | Cloudinary CDN, immutable URLs | — | new upload = new public id; never mutate in place |

**Never cached — no exceptions.** These routes set
`export const dynamic = 'force-dynamic'` and
`Cache-Control: private, no-store, max-age=0, must-revalidate`. Middleware
**sets** that header for these prefixes (`res.headers.set(...)` on the
`NextResponse.next()` it returns); it cannot *assert* on one, because middleware
runs before the page and has no access to the headers the page will emit. The
assertion is therefore a test — `tests/e2e/cache-headers.spec.ts` walks this exact
list and fails CI on any response missing `no-store` or carrying a public
`s-maxage`:

- `/cart`, `/api/cart/**`
- `/checkout/**`, `/api/checkout/**`
- `/account/**`, `/orders/**`
- `/admin/**`, `/api/admin/**`
- `/api/webhooks/**`, `/api/cron/**`
- **`/_preview/**`** — the one preview tree (`06 §4.4`). Middleware also sets
  `X-Robots-Tag: noindex, nofollow, noarchive` on it, and `robots.txt` carries
  `Disallow: /_preview/`. A draft homepage in a shared CDN object is the leak this
  row exists to prevent.
- Anything whose response depends on the session cookie, the cart token, a
  customer id, an order, a payment state, or a `searchParams` filter.

Additionally: `fetch()` inside any checkout or cart codepath must pass
`{ cache: 'no-store' }`; the `cached()` wrapper is banned in `src/lib/cart/`,
`src/lib/checkout/`, `src/lib/orders/`, `src/lib/payments/` **and
`src/lib/pricing/`** by the `no-restricted-imports` rule in §2.2.

**`resolvePrice()` is never cached, and that is why the ban includes pricing.**
It takes `customerId` and `couponCode`. One `cached()` wrapper around it stores
the result under a key made of variant and market only, so customer A's
customer-group price or applied coupon is then served to every other customer
requesting that variant until the tag is purged — a wrong number, at the till, on
purpose, with no error anywhere. The split in §2.3 is the enforcement:
`getDisplayPrice()` takes no customer and no coupon and is cached *by its caller*
in `src/lib/catalog/`; `resolvePrice()` / `resolvePriceBatch()` live behind the
ban and always hit the database.

**No tagged entry may be cached with `revalidate: false`.** Every row in the table
above has a finite TTL as well as a tag. Tag purges happen after commit and outside
the transaction (§2.3 step 6), so a process that dies between the two leaves a
stale entry; a finite TTL means that stale entry is a bounded inconvenience rather
than a price that is wrong until someone notices and redeploys.

**Availability on a PDP is streamed, not baked.** The PDP shell is ISR for 900s
while the availability band is cached for 60s — which means the band inside the
cached HTML is up to fifteen minutes old, and for a ONE OF A KIND piece that is
fifteen minutes of "In stock" on something already sold. The static shell keeps
its 900s, and the add-to-bag region is a `<Suspense>` boundary whose child calls
`getAvailability([variantId], marketCode)` with `cache: 'no-store'`, so the crawler
and the CDN still get a complete HTML document while the human gets the truth. The
band is still only a hint; §2.5 is still the authority.

**That same boundary is where a signed-in customer sees their own price, and it
is the only place one may be rendered.** `getDisplayPrice()` takes no customer
(§2.3), which is exactly why it is the cacheable one — so a customer-group price
can never appear inside an ISR object, a feed or a JSON-LD graph. The dynamic
island therefore does double duty: **when a customer session exists**, the
`<Suspense>` child additionally calls
`resolvePrice({ variantId, marketCode, quantity: 1, customerId })` and renders the
group price with the public price struck through. For an anonymous visitor it
renders nothing extra and issues no extra query, so the crawler, the feed and the
cached shell are byte-identical to what they are today. The bag and checkout need
no equivalent: they are `no-store` and already call `resolvePriceBatch()` with the
customer. `tests/unit/jsonld-truth.test.ts` (`08 §3.2`) asserts the JSON-LD half.

### 2.5 Read/write consistency at checkout

Cached availability on a PDP is a **display hint**. The authoritative checks run
server-side, uncached, in this order, inside one transaction:

1. **Market** comes from `carts.market_code` — the column the cart was created
   with — cross-checked against the `[market]` segment of the posting URL. Never
   from the request body, never from the `md_market` cookie. If the two disagree
   (the customer switched market with a cart open), checkout stops with
   `MarketChangedError`, the cart is re-priced in the new market and re-shown, and
   nothing else happens. **A cart may not contain two currencies**, so
   `carts.market_code` is `NOT NULL` and `cart_items` carries no currency of its
   own; switching market is a re-price of the whole cart, not a per-line event.
2. `resolvePriceBatch()` for every line. Nothing priced by the client is read —
   the submitted form carries no amount at all, so there is no field to tamper
   with. The comparison is between the **server-issued** snapshot on the cart line
   (`cart_items.unit_final_minor`, `cart_items.priced_at`) and the freshly resolved
   amount; any difference, zero tolerance, raises `PriceChangedError`, which the UI
   surfaces as "prices updated, review your bag".
3. `reserveStock()` with `FOR UPDATE` — first writer wins; the second concurrent
   buyer of a one-of-a-kind piece gets `InsufficientStockError` before any
   payment intent is created. `reservations.expires_at` defaults to
   `now() + 30 minutes`.
4. `createOrderFromCart()` — snapshots, onto `order_items`: product title, SKU,
   image URL, the resolved attribute/stone/material set, `unit_list_minor`,
   `unit_final_minor`, the `discountBreakdown` as JSONB, allocated tax and
   shipping, `currency_code`, `market_code`, `price_record_id` and `metal_rate_id`.
   An order page renders **only** from these columns and never joins `products`
   (hard rule 4, and §2.7).
5. `getProviderForMarket()` → `createIntent(order, paymentAttemptKey(order, attempt))`,
   created for `orders.total_minor` / `orders.currency_code` and carrying `orders.id`
   in provider metadata. A `null` provider blocks here and writes no order (§4.9).

   > **The intent's idempotency key is NOT `orders.idempotency_key`, and an earlier
   > draft of this step said it was.** `orders.idempotency_key` is correct for the
   > *first* attempt and wrong for every subsequent one. Stripe returns the **same**
   > PaymentIntent for a replayed idempotency key within 24 hours — so after a
   > declined card, the retry hands the browser the client secret of the intent that
   > already failed, the payment element refuses it, and from the customer's side
   > "the page is broken" on an order they are trying to pay for. `uq_payments_idempotency
   > (provider_key, idempotency_key)` would additionally refuse the second `payments`
   > row. `paymentAttemptKey(order, attempt)` (`05 §3.6`) is
   > `${order.idempotency_key}:${attempt}` where `attempt` is the count of existing
   > `payments` rows for the order; the order-level key keeps doing its own job at
   > step 3, which is a different job.

**Idempotency is a unique index, not a convention.**
`CREATE UNIQUE INDEX idx_orders_idempotency_key ON orders (idempotency_key);`
`createOrderFromCart()` inserts with that key inside the same transaction, so a
double-click, a retried server action or a browser back-and-resubmit hits the
constraint and the service returns the **existing** order. Without the index the
signature's `idempotencyKey` parameter is decoration: step 3 runs twice, reserves
twice, and a line with quantity 2 becomes a reservation for 4 and, at worst, two
payment intents for one bag.

**A reservation must outlive the payment window.** `expires_at` is extended to
`now() + 30 minutes` on every `createIntent()`, and the release cron (§5.6) only
touches rows past it. A 3-D Secure challenge or a UPI collect request that takes
longer than that is the one remaining path to an oversell, so it is handled
explicitly rather than hoped away — see the last row of the table below.

**Payment success is recorded only by a verified webhook**, never by a client
redirect. The redirect page polls `GET /api/checkout/status/[orderId]`, which is
authorised by the caller's customer session **or** by the cart token that created
the order. An order id is an identifier, not a capability: without that check,
anyone who can enumerate ids reads payment state and order totals (hard rule 9).

Every path that marks an order paid asserts all six of the following in the same
transaction, before it transitions anything:

| Assertion | The failure it prevents |
| --- | --- |
| `INSERT … ON CONFLICT (provider, provider_event_id) DO NOTHING` returned a row | Stripe and Razorpay both retry an event whose 200 they did not see. Two deliveries otherwise both commit stock, both send a confirmation email, and inventory goes negative on a piece that only ever existed once |
| `envelope.amountMinor === order.total_minor` | The Razorpay handoff is assembled client-side; a tampered or replayed confirmation otherwise pays ₹1 for a ₹1,00,000 piece |
| `envelope.currencyCode === order.currency_code` | A USD payment object attached to an INR order marks it paid at roughly 1/85th of its value — and every dashboard still balances, because both numbers are integers |
| `envelope.orderId === order.id` | A cheap order's payment marks an expensive order paid |
| `transitionOrder()` accepts the transition **from the order's current status** | Out-of-order delivery (`payment_failed` arriving after `succeeded`) un-paying a paid order |
| The order's reservation is still live, **or** `reserveStock()` succeeds again now | Money taken for a one-of-a-kind piece whose reservation expired mid-3DS and which has since been sold to someone else |

The last row is the only one whose remedy is not obvious. If re-reservation fails,
the order does **not** become fulfillable: it transitions to `paid_unfulfillable`,
`provider.refund()` is called for the full amount with the order id as the refund
idempotency key in the same job, Sentry alerts, and `ORDER_NOTIFICATION_EMAILS` is
notified. Refunding a customer is a bad afternoon; silently owing a unique piece to
two people is a bad year, and on a one-of-a-kind catalogue it is not a rare case.

### 2.6 Money at every boundary

Hard rule 10 says money is never a float. That settles the column type and
nothing else; the failures live at the boundaries.

**In the database:** `BIGINT` minor units plus a `CHAR(3)` currency code, always
as a pair, always on the same row — `orders.total_minor BIGINT NOT NULL`,
`orders.currency_code CHAR(3) NOT NULL`, `CHECK (total_minor >= 0)`,
`CHECK (currency_code = upper(currency_code))`. Never `numeric`, never `money`,
never an amount column whose currency lives on a different table and can drift.

**Leaving the database:** Prisma maps `BIGINT` to a JavaScript `bigint`, and
`bigint` cannot cross a JSON boundary. `JSON.stringify(1299n)` throws
`TypeError: Do not know how to serialize a BigInt`. Three boundaries in this
architecture are JSON boundaries, and all three will throw the first time a real
price reaches them: `Response.json()` in every route handler under `src/app/api/`
(the cart badge, typeahead, facet counts, checkout status), the Next data cache
that `cached()` writes into, and every CSV/webhook/email payload. This fails in
production and passes every unit test that mocks the database, because a mock
returns `1299`, not `1299n`. So exactly one shape crosses a boundary:

```ts
// src/lib/money.ts — the only module that knows what money looks like
export type Money = {
  readonly amountMinor: string;      // decimal string of an integer, e.g. "129900"
  readonly currencyCode: CurrencyCode;
};
export function toMoney(minor: bigint, c: CurrencyCode): Money;
export function fromMoney(m: Money): bigint;
export function addMoney(a: Money, b: Money): Money;        // throws on mixed currency
export function multiplyMoney(m: Money, qty: number): Money; // qty is an integer
export function applyPercent(minor: bigint, basisPoints: number): bigint;
export function formatMoney(m: Money, market: Market): string;

// Order-level amounts are spread over parts by LARGEST REMAINDER, never by rounding
// each part independently. Canonical, and it takes no line numbers because it needs
// none:
export function allocate(totalMinor: bigint, weights: bigint[]): bigint[];
// Each part's exact share is floored; the leftover minor units are handed out one each
// to the largest fractional remainders; a TIE GOES TO THE LOWEST INDEX. The caller is
// responsible for passing entries in the order the tie-break should favour — which is
// the whole of the rule, and is why the signature is implementable exactly as written:
//   • order lines are passed in `line_number` order   (02 §1.10 rule 3; 05 §3.6 step 6)
//   • price components are passed metal → making → stone → other  (04 §2.3)
// Postcondition `sum(result) === totalMinor`, asserted inside the function and swept
// property-based in tests/unit/money-allocate.test.ts. This is what makes
// SUM(order_items.line_discount_minor) = orders.discount_total_minor true by
// construction, and the same function allocates line_tax_minor and line_shipping_minor.

// ResolvedPrice (bigint) never leaves the service layer. This is what a page hands
// to <Price> and what an /api route serialises.
export type PricePresentation = {
  list: Money; sale: Money; final: Money; lineSubtotal: Money;
  formatted: { list: string; sale: string; final: string };
  discounts: { label: string; amount: Money }[];
};
export function toPricePresentation(
  p: ResolvedPrice, market: Market, qty: number,
): PricePresentation;
```

`bigint` arithmetic exists only inside `src/lib/pricing/`, `src/lib/orders/`,
`src/lib/discounts/`, `src/lib/tax/`, `src/lib/shipping/` and `src/lib/db/`.
Anything crossing into `src/app/**`, `src/components/**`, a route handler, the
data cache, an email, a CSV or a provider SDK is `Money` or `PricePresentation`.

> **RESOLVED — was CHANGE REQUIRED IN 02 §1.10 rule 3:**
> *Applied. The change now lives in 02 §1.10 rule 3 — lowest-index tie-break, caller-ordered.*
> the tie-break there reads "ties broken
> by `line_number`", which the declared signature cannot express — `allocate()`
> receives weights, not lines, and `99`'s HW6 is exactly that. It is **lowest
> index first**, with the caller passing order lines in `line_number` order. The
> observable behaviour for an order is unchanged; what changes is that it is now
> implementable from the signature alone.

> **RESOLVED — was CHANGE REQUIRED IN 04 §2.3:** the same function is described there as carrying
> *Verified applied in 04.*
> a *second, different* tie-break ("the fixed component order
> `metal → making → stone → other_material → markup`"). There is one tie-break —
> lowest index — and that component order is how the **caller** must build the
> `weights` array. One rule, both call sites correct.

**Rounding happens once, on the line total.** `applyPercent` takes **basis
points**, not a fraction — `1750`, never `0.175` — and rounds half-up to the minor
unit. Percentage discounts and tax are applied to the line total, never
per-unit-then-multiplied: 3 × round(33.33) is not round(3 × 33.33), and the
difference is the cent that makes a customer's arithmetic disagree with the
invoice. `.toFixed()`, `parseFloat()` and float multiplication are lint errors
inside those modules (§2.2).

**Formatting is not cosmetic.** `formatMoney` reads the locale from the `markets`
row (`en-US` for US, `en-IN` for IN), never a hardcoded `'en-US'`.
`Intl.NumberFormat('en-US', { currency: 'INR' })` renders a lakh as
`₹100,000.00` instead of `₹1,00,000.00`; an Indian customer reading a
Western-grouped figure has to stop and count digits on a jewellery-sized number,
and some of them will read it wrong. One formatter, in one module, used by the
storefront, the admin, the emails and the invoices.

**Currency-denominated configuration is per-currency too.** This is where multi-
market quietly produces a wrong number, because the schema looks fine:

- `coupons` may **not** carry a single `amount_off`. Fixed-amount discounts live in
  `coupon_amounts (coupon_id, currency_code, amount_minor)`,
  `UNIQUE (coupon_id, currency_code)`. A coupon with no row for the cart's currency
  is **inapplicable in that market** — it is never converted, never approximated,
  never defaulted. A "500 OFF" authored with ₹500 in mind is, against a single
  amount column, a $500 discount on a $600 chain, and it is the discount engine's
  job to make that unrepresentable rather than the merchandiser's job to remember.
- The same rule covers free-shipping thresholds, order-value shipping bands,
  minimum-spend rules, gift-card balances, low-value-order surcharges and every
  admin setting whose unit is a currency.
- Percentage discounts are currency-free and need none of this.

**FX: nowhere.** `src/lib/money.ts` exports no conversion function and accepts no
rate; §1.5 already bans the libraries. The only legitimate conversion in this
business is the accounting export of *recorded historical totals*, which is out of
scope here; if it is ever commissioned it lives in its own module, converts a
number that has already been charged, and never feeds a price.

### 2.7 Concurrency, idempotency and immutable history

Two buyers, one piece, is the headline case, but it is one of seven. Each one has
a named mechanism, and each mechanism is a database object rather than a
convention, because a convention is only as good as the next developer:

| Race | Concrete scenario | Mechanism |
| --- | --- | --- |
| Two buyers, one one-of-a-kind piece | Both PDPs say "In stock"; both press Pay within the same second | `SELECT … FOR UPDATE` on `inventory_items`, ascending id order, `ReadCommitted` (§1.2). Loser gets `InsufficientStockError` before any intent exists |
| Same buyer, double submit | Place Order double-clicked, or the server action retried by the browser after a slow response | `UNIQUE (idempotency_key)` on `orders`; the second call returns the first order (§2.5) |
| Duplicate webhook delivery | Our handler takes 11s, Stripe times out at 10s and redelivers; both copies run | `UNIQUE (provider, provider_event_id)` on `webhook_events`, insert-first (§1.2) |
| Concurrent refunds | Two staff refund the same payment from two tabs; each reads `refunded_minor = 0` | `SELECT … FOR UPDATE` on `payments`, then assert `sum(refunds.amount_minor) + new <= payments.captured_minor` inside the lock. A cross-row invariant cannot be a `CHECK`, so it is a locked read plus a nightly reconciliation job that flags any payment where the sum exceeds the capture |
| Autosave clobbering a concurrent edit | A edits copy, B edits price; A's autosave PATCHes the whole form and silently restores the old price | `version` column + `expectedVersion` (§2.3 step 3) **and** autosave sends only `dirtyFields` from react-hook-form, so an untouched price is not in the `UPDATE` at all. Both are needed: field-level patching alone still loses a write when two people edit the same field |
| Autosave racing itself | Two debounced saves in flight, the older response lands last | Each autosave carries a monotonic client `seq`; the action ignores a response older than the last applied `seq`, and a 750ms debounce plus an in-flight guard keeps at most one outstanding |
| Cart merge on login | Guest cart and customer cart, two tabs, one sign-in | Merge runs in one transaction with `FOR UPDATE` on both cart rows, and `UNIQUE (cart_id, variant_id)` on `cart_items` makes the merge an upsert rather than an append |

**Historical rows are immutable, and the schema — not the code — enforces it.**

- A price change **inserts** a `prices` row and closes the previous one
  (`valid_to = now()`). `prices` rows are never `UPDATE`d in place and never hard
  deleted; `order_items.price_record_id REFERENCES prices(id) ON DELETE RESTRICT`.
- `order_items.product_id` and `order_items.variant_id` are
  `ON DELETE RESTRICT`, and products and variants are **soft-deleted only**
  (`deleted_at`) — which is also the precondition that makes the
  `WHERE deleted_at IS NULL` partial unique indexes in §1.2 mean anything. A
  cascading FK here would let deleting a discontinued product delete the order
  lines that paid for it.
- An order page, invoice, packing slip, CSV export and revenue report read the
  snapshot columns on `order_items` and **never join `products`**. Otherwise
  renaming a product, swapping its photograph or correcting its stone list
  retroactively rewrites a five-year-old invoice, and the number on the customer's
  card statement stops matching the document we send them.
- `resolvePrice({ at })` exists for admin forensics and "what would this have cost
  then" reporting. It is **not** how an order gets its numbers. Importing it
  anywhere under `src/app/(storefront)/**/orders/**` or `src/lib/orders/render*`
  is a lint error.

**Indexes the access patterns in this document require.** (The full schema belongs
to the data-model section; these are the ones the queries described *here* will
issue, and every one of them is a wrong number, a timeout or an oversell if it is
missing.)

| Query described in this document | Index |
| --- | --- |
| Release-reservations cron, every 5 min: `WHERE status='active' AND expires_at < now()` | `CREATE INDEX idx_reservations_expiry ON reservations (expires_at) WHERE status = 'active';` — without the partial predicate the index grows with every reservation ever taken; when the scan eventually exceeds `maxDuration`, reservations stop expiring and every abandoned checkout removes a one-of-a-kind piece from sale indefinitely |
| Retry-webhooks cron: `WHERE status='failed' AND attempts < 8` | `CREATE INDEX idx_webhook_events_retry ON webhook_events (next_attempt_at) WHERE status = 'failed';` |
| Webhook de-duplication (§2.5) | `CREATE UNIQUE INDEX idx_webhook_events_event ON webhook_events (provider, provider_event_id);` |
| Order idempotency (§2.5) | `CREATE UNIQUE INDEX idx_orders_idempotency_key ON orders (idempotency_key);` |
| Active price for a variant in a market | `CREATE UNIQUE INDEX idx_prices_active ON prices (variant_id, market_code) WHERE valid_to IS NULL AND deleted_at IS NULL;` — both the lookup index and the constraint that makes "two active USD prices for one variant" impossible, which is the other way to serve a wrong number |
| PDP slug resolution, `product-slug:{market}:{slug}` | `CREATE UNIQUE INDEX idx_products_slug_live ON products (slug) WHERE deleted_at IS NULL;` |
| Middleware redirect snapshot refresh | `CREATE INDEX idx_redirects_from ON redirects (from_path);` |
| PLP: published products in a category, by merchandised rank | `CREATE INDEX idx_product_categories_rank ON product_categories (category_id, rank) INCLUDE (product_id);` and `CREATE INDEX idx_products_published ON products (status, published_at DESC) WHERE deleted_at IS NULL;` |
| Stone-led discovery, `/stones/[slug]` filtered by jewellery type | `CREATE INDEX idx_product_stones ON product_stones (stone_id, product_id);` |
| `getAvailability()` for 48 cards | `CREATE INDEX idx_inventory_items_variant_location ON inventory_items (variant_id, location_id);` |
| Admin order list, default sort and every saved view's first page | `CREATE INDEX idx_orders_list ON orders (market_code, status, created_at DESC);` |
| Audit timeline on an entity | `CREATE INDEX idx_audit_entity ON audit_logs (entity, entity_id, created_at DESC);` |
| Rate limiting on OTP / login / checkout | `CREATE UNIQUE INDEX idx_rate_limits_key_window ON rate_limits (key, window_start);` |
| Session lookup on every authenticated request | `CREATE UNIQUE INDEX idx_sessions_token_hash ON sessions (token_hash);` — the cart and session tokens are stored hashed, never in the clear, so a database read does not hand out live credentials |

**No unbounded read, anywhere.** Every `list*` service function takes
`{ limit, cursor }`, the Zod schema caps `limit` at 100, and ordering is keyset
(`WHERE (created_at, id) < ($1, $2)`) rather than `OFFSET` — offset paging
degrades linearly and the admin order list is where it shows first. Three
operations are not requests at all, because they cannot finish inside a function
timeout; they are `jobs` rows processed by the cron worker with progress at
`/admin/system/jobs`:

- **CSV import apply.** The validation preview is synchronous and bounded to the
  first 500 rows; the apply is a job, batched and resumable.
- **CSV / order export.** A `findMany()` over a healthy quarter of orders is an
  out-of-memory kill; the job streams to Cloudinary and emails a signed link.
- **Bulk edit over more than 50 selected rows, and every approved metal-rate
  recalculation run** — which by definition touches every linked price and writes
  an audit row for each.

---

## 3. Folder structure

Greenfield repo root: `/Users/anshbhatt/Downloads/MD J`.

**This tree is normative and complete, and it is what `tests/unit/routes-authorized.test.ts`
is checked against.** An earlier revision listed four catalogue routes, cart,
checkout status, revalidate, health, media sign, webhooks and nine crons — and
documents `04`–`08` and `11` and `13` then commissioned **twenty** further route
files that appeared nowhere here. That is not cosmetic: `08 §2.2` fails CI on "a route
file not wrapped in `withRoute`; a route in the tree with no manifest row; a
manifest row with no route", and this section is what an engineer scaffolds
from. Every route below is traceable to an owning document, named in the comment
where it is not obvious.

```
MD J/
├── .nvmrc                          # "24.18.0" — CI, Vercel and local agree
├── .npmrc                          # save-exact=true, engine-strict=true
├── .gitignore                      # .env, .env*.local, .next, node_modules, src/generated,
│                                   # /coverage, /playwright-report  (`.env` is Prisma CLI's
│                                   # file and holds a real connection string — §4.2)
├── .env.example                    # §4.1–4.13 — committed, no real values, ever
├── .env.local                      # gitignored; the ONLY place local secrets live
├── package.json
├── package-lock.json               # committed
├── next.config.ts                  # image remotePatterns, headers(), redirects(), serverExternalPackages
├── tsconfig.json                   # strict, paths: { "@/*": ["./src/*"] }
├── eslint.config.mjs               # flat config + boundaries rules from §2.2
├── .prettierrc                     # + prettier-plugin-tailwindcss
├── vitest.config.ts                # singleFork; glob tests/{unit,db,integration,api}/**/*.{test,spec}.ts
├── playwright.config.ts            # workers: 1 locally, 2 in CI
├── vercel.json                     # TEN crons + function maxDuration. NO `headers` key (§5.8)
├── middleware.ts                   # edge only; NO Prisma, NO service imports, NO fetch (§1.4)
│
├── prisma/
│   ├── schema/                     # prismaSchemaFolder — one file per domain
│   │   ├── schema.prisma           # datasource + generator + enums (job_kind: 17 values — 11 §3.1)
│   │   ├── identity.prisma         # users, sessions, roles, permissions, otp_requests
│   │   ├── catalog.prisma          # products, variants, attributes, stones, materials
│   │   ├── pricing.prisma          # markets, prices, price_history, metal_rates, recalc_runs,
│   │   │                           # pricing_formula*, price_formula_bindings, coupon_amounts
│   │   ├── inventory.prisma        # inventory_locations, market_locations, inventory_items,
│   │   │                           # inventory_transactions, reservations
│   │   ├── commerce.prisma         # carts, checkout_sessions, orders, order_items, order_events,
│   │   │                           # payments, refunds, returns, shipping_*, tax_rules, gift_cards
│   │   ├── marketing.prisma        # coupons, campaigns, newsletter, wishlists
│   │   ├── cms.prisma              # cms_pages, cms_blocks, content_versions, content_preview_tokens,
│   │   │                           # journal_*, media, media_tags, redirects
│   │   └── ops.prisma              # audit_logs, webhook_events, rate_limits, settings, jobs,
│   │                               # search_*, product_market_sort, back_in_stock_requests
│   ├── migrations/                 # committed SQL; forward-only; hand-edited where §1.2 requires
│   └── seed/
│       ├── index.ts                # entry: `npm run db:seed`
│       ├── 01-markets.ts           # US/USD + IN/INR rows — structural, not demo
│       ├── 02-roles.ts             # the 7 roles + the 72 permission rows (11 §1.3, §1.4)
│       ├── 03-categories.ts        # the customer-facing category spellings (08 §4.1 owns the count)
│       ├── 04-stones.ts            # the 7 launch stones
│       ├── 05-materials.ts         # 14K Y/W/R gold + silver
│       ├── 06-settings.ts          # settings keys seeded EMPTY, incl. every copy.error.* key
│       │                           # (11 §2.2) and copy.state.*.{headline,body,action} (08 §4.4)
│       ├── 07-email-templates.ts   # template rows with token placeholders
│       └── 99-demo.ts              # only runs when SEED_DEMO=1; every row is_demo=true.
│                                   # Carries the 16-section homepage of 06 §11.2, copy blank
│
├── public/
│   ├── brand/                      # client-supplied marks — used AS-IS, never restyled
│   │   ├── wordmark.svg            # green MILLENNIUM DESIGNS wordmark
│   │   ├── wordmark-ivory.svg      # ivory-on-dark variant (colour swap only)
│   │   ├── monogram.svg            # green rounded-square M monogram
│   │   ├── monogram-ivory.svg
│   │   ├── favicon.ico  icon-192.png  icon-512.png  apple-touch-icon.png
│   │   ├── og-default.png          # 1200×630 fallback social card
│   │   └── README.md               # usage rules: no distortion, no recolour beyond the
│   │                               # two approved variants, no text substitute
│   ├── site.webmanifest
│   └── (nothing else)              # NOT here: product photography (Cloudinary),
│                                   # CMS uploads, fonts (see src/assets/fonts).
│                                   # The IndexNow key file is served by a route, not a file.
│
├── src/
│   ├── assets/fonts/               # self-hosted woff2 subsets via next/font/local
│   ├── generated/                  # GITIGNORED. prisma client + market-snapshot.json (§1.4)
│   │
│   ├── app/
│   │   ├── layout.tsx              # <html>, font vars, theme tokens, Sentry + analytics boot
│   │   ├── not-found.tsx  error.tsx  global-error.tsx
│   │   ├── robots.ts               # Disallow: / unless APP_ENV=production; Disallow: /_preview/
│   │   ├── sitemap.ts              # index; shards under (storefront)/sitemaps/
│   │   ├── opengraph-image.tsx
│   │   ├── [indexnowKey].txt/route.ts          # the IndexNow verification file (08 §3.7)
│   │   │
│   │   ├── (storefront)/
│   │   │   └── [market]/           # 'us' | 'in' | future; middleware rewrites root → primary
│   │   │       ├── layout.tsx      # market provider, header/footer from CMS, hreflang
│   │   │       ├── page.tsx                       # home (ISR 300)
│   │   │       ├── products/[slug]/page.tsx       # PDP (ISR 900)
│   │   │       ├── [category]/page.tsx            # /rings … /one-of-a-kind (ISR 900)
│   │   │       ├── [category]/[facet]/page.tsx    # curated facets only (ISR 900)
│   │   │       ├── collections/[slug]/page.tsx
│   │   │       ├── stones/page.tsx
│   │   │       ├── stones/[slug]/page.tsx
│   │   │       ├── stones/[slug]/[category]/page.tsx        # 08 §4.2
│   │   │       ├── search/page.tsx                # dynamic, noindex
│   │   │       ├── cart/page.tsx                  # force-dynamic, no-store
│   │   │       ├── checkout/[[...step]]/page.tsx  # information|delivery|payment|processing
│   │   │       ├── orders/[token]/page.tsx
│   │   │       ├── wishlist/page.tsx                        # canonical; /account/wishlist 308s here
│   │   │       ├── wishlist/shared/[token]/page.tsx         # 08 §4.2
│   │   │       ├── unsubscribe/[token]/page.tsx             # 08 §4.2
│   │   │       ├── account/page.tsx
│   │   │       ├── account/orders/page.tsx
│   │   │       ├── account/orders/[id]/page.tsx
│   │   │       ├── account/orders/[id]/invoice/route.ts     # streams a PDF, so a route
│   │   │       ├── account/orders/[id]/return/page.tsx
│   │   │       ├── account/{addresses,profile,security,preferences,returns,gift-cards}/page.tsx
│   │   │       ├── account/returns/[id]/page.tsx
│   │   │       ├── journal/page.tsx  journal/page/[n]/page.tsx
│   │   │       ├── journal/[slug]/page.tsx  journal/tag/[slug]/page.tsx
│   │   │       ├── journal/rss.xml/route.ts                 # per market (08 §5 root routes)
│   │   │       ├── pages/[...slug]/page.tsx                 # depth ≥ 3 CMS escape hatch
│   │   │       └── sitemaps/[shard]/route.ts
│   │   │
│   │   ├── (preview)/
│   │   │   └── _preview/[market]/[token]/        # THE preview tree — 06 §4.4 and 04 §7.2 unified.
│   │   │       ├── layout.tsx                    # preview banner; resolvePreviewToken() upstream
│   │   │       ├── page.tsx                                 # home
│   │   │       ├── products/[slug]/page.tsx
│   │   │       ├── [category]/page.tsx
│   │   │       ├── [category]/[facet]/page.tsx
│   │   │       ├── collections/[slug]/page.tsx
│   │   │       ├── stones/[slug]/page.tsx
│   │   │       ├── journal/[slug]/page.tsx
│   │   │       └── pages/[...slug]/page.tsx      # nine files; each body is one component call.
│   │   │                                         # force-dynamic, no-store, noindex. Read-only
│   │   │                                         # service imports only (lint-enforced).
│   │   │                                         # NOT here: cart, checkout — preview never sells.
│   │   │
│   │   ├── (admin)/
│   │   │   ├── layout.tsx          # force-dynamic; requireStaffSession(); noindex header
│   │   │   └── admin/
│   │   │       ├── page.tsx                       # dashboard
│   │   │       ├── login/page.tsx  login/2fa/page.tsx     # outside the auth guard
│   │   │       ├── search/page.tsx                        # global ⌘K target (08 §5)
│   │   │       ├── catalog/{products,variants,categories,collections,stones,materials,
│   │   │       │            attributes,tags,facets}/…
│   │   │       ├── pricing/{prices,metal-rates,rules,history,recalc-runs}/…
│   │   │       ├── inventory/{items,locations,transactions,transfers,reservations,low-stock}/…
│   │   │       ├── orders/…  returns/…  payments/{,disputes}/…  gift-cards/…
│   │   │       ├── customers/{,groups}/…
│   │   │       ├── marketing/{coupons,campaigns,newsletter}/…
│   │   │       ├── marketing/search/{no-results,synonyms,promotions,redirects}/…
│   │   │       ├── content/{pages,builder,journal,media,menus,redirects,seo}/…
│   │   │       ├── settings/{general,markets,shipping,tax,email-templates,integrations,
│   │   │       │             roles,users}/…
│   │   │       ├── tools/{import,export,saved-views,market-preview}/…
│   │   │       └── system/{audit-log,webhooks,jobs,health}/…
│   │   │
│   │   └── api/
│   │       ├── health/route.ts               # DB ping + migration head; ?verbose=1 is gated
│   │       ├── revalidate/route.ts           # REVALIDATE_SECRET in a HEADER, not a query string
│   │       │
│   │       ├── catalog/typeahead/route.ts
│   │       ├── catalog/facets/route.ts
│   │       ├── catalog/availability/route.ts  # band per variant, never a count
│   │       ├── catalog/products/route.ts      # 08 §2.2 — infinite-scroll page 2+
│   │       ├── catalog/redirects/route.ts     # full snapshot, paged, for the edge map
│   │       ├── catalog/redirect-hit/route.ts  # 08 §3.6 — POST, public
│   │       ├── search/route.ts                # 08 §2.2 — results page 2+
│   │       ├── search/click/route.ts          # 08 §2.2 — sendBeacon, 204
│   │       │
│   │       ├── cart/route.ts                  # public read for the header badge, no-store
│   │       ├── wishlist/summary/route.ts      # 08 §2.2
│   │       ├── account/summary/route.ts       # 08 §2.2
│   │       │
│   │       ├── checkout/shipping-quote/route.ts        # 08 §2.2 — body is {destination} ONLY
│   │       ├── checkout/status/[orderId]/route.ts
│   │       ├── checkout/provider-authorization/route.ts # 08 §2.2 — Razorpay browser handler
│   │       │
│   │       ├── analytics/[market]/collect/route.ts     # 08 §7.2 — market is the PATH segment
│   │       ├── feeds/[market]/google-merchant.xml/route.ts   # 08 §3.7
│   │       ├── feeds/[market]/meta-catalog.csv/route.ts      # 08 §3.7
│   │       │
│   │       ├── media/sign/route.ts            # signed Cloudinary upload params (staff only)
│   │       ├── media/callback/route.ts        # registerUpload(actor, input) — 11 §10.9
│   │       ├── media/svg/route.ts             # 06 §7.10 — our function holds the bytes
│   │       ├── security/csp-report/route.ts   # 07 §5.8 — public, 8KB cap
│   │       │
│   │       ├── admin/import/upload/route.ts   # 11 §10.9 — NOT /api/import/upload
│   │       ├── admin/export/[jobId]/route.ts  # streams; a server action cannot
│   │       ├── admin/jobs/[id]/stream/route.ts            # SSE
│   │       ├── admin/search/route.ts                      # 13 §6.1 — the ⌘K data route.
│   │       │                                              # staff:dashboard.view, no-store,
│   │       │                                              # limit ≤ 20, one group per held
│   │       │                                              # permission. NOT the same file as:
│   │       ├── admin/search/preview/route.ts              # 08 §2.2 — merchandiser view
│   │       ├── admin/cms/pages/[id]/heartbeat/route.ts    # 06 §6.4
│   │       │
│   │       ├── webhooks/stripe/route.ts       # raw body, signature verify, idempotent
│   │       ├── webhooks/razorpay/route.ts
│   │       └── cron/{release-reservations,pricing-rule-windows,run-jobs,retry-webhooks,
│   │                 abandoned-carts,metal-rate-refresh,low-stock-digest,sitemap-ping,
│   │                 cleanup-sessions,reconcile-payments}/route.ts     # TEN — §5.6, 11 §5
│   │       # NOT here: /api/internal/market-snapshot (§1.4 — the build-time snapshot is the
│   │       #   only source and this route is not built); any mutation reachable by GET;
│   │       #   any business logic (routes call services only).
│   │
│   ├── server/
│   │   └── actions/                # every 'use server' file lives here, nowhere else
│   │       ├── cart.ts  wishlist.ts  checkout.ts  auth.ts  account.ts  newsletter.ts
│   │       ├── market.ts           # switchMarket() — always ends in redirect()
│   │       └── admin/
│   │           ├── product.ts  variant.ts  price.ts  inventory.ts  order.ts  return.ts
│   │           ├── customer.ts  coupon.ts  campaign.ts  cms.ts  media.ts  menu.ts
│   │           ├── redirect.ts  settings.ts  user.ts  role.ts  import.ts  export.ts
│   │           ├── giftcard.ts  search.ts  preview.ts
│   │           # Each file: parse → authorize → call ONE service → return ActionResult<T>.
│   │           # NOT here: Prisma calls, price math, stock math, provider SDK calls.
│   │
│   ├── lib/                        # the service layer — one folder per domain
│   │   ├── db/
│   │   │   ├── client.ts           # PrismaClient singleton + @prisma/adapter-pg;
│   │   │   │                       # pool max = DATABASE_CONNECTION_LIMIT (§4.2)
│   │   │   ├── transaction.ts      # withTransaction(), Tx type, withSerializableRetry()
│   │   │   ├── types.ts            # re-exported Prisma model types (the app's only door)
│   │   │   └── raw/                # named Prisma.sql fragments for admin list queries
│   │   │       ├── sorts.ts        # SORT_WHITELIST — 11 §8
│   │   │       └── filters.ts      # FILTER_WHITELIST — 11 §8
│   │   ├── config/
│   │   │   ├── env.ts              # Zod-parsed serverEnv/publicEnv, fail-fast at boot
│   │   │   ├── integrations.ts     # IntegrationKey (14) + integrationStatus() — §4.9
│   │   │   ├── crons.ts            # CRON_JOBS — the ten rows of §5.6
│   │   │   └── constants.ts        # cookie names, limits, band thresholds
│   │   ├── errors.ts               # AppError + the 52 ErrorCode classes — 11 §2
│   │   ├── rbac/
│   │   │   ├── catalogue.ts        # PERMISSIONS — the 72 keys, frozen — 11 §1.3
│   │   │   └── matrix.ts           # RoleKey → PermissionKey[] — 11 §1.4
│   │   ├── auth/                   # sessions, password hashing, OTP, 2FA, impersonation
│   │   ├── security/               # ip.ts (rateLimitIpKey), route-manifest.ts, withRoute, csp
│   │   ├── market/                 # resolveMarket(), listActiveMarkets(), currency rules
│   │   ├── pricing/                # THE price authority; formulas, recalc runs, price history
│   │   ├── catalog/                # products, variants, attributes, categories, collections
│   │   ├── stones/                 # stone entity + stone-led discovery queries
│   │   ├── inventory/              # reservations, transactions, locations, availability bands
│   │   ├── cart/  checkout/  orders/  discounts/  giftcards/  returns/  customers/
│   │   ├── shipping/  tax/
│   │   ├── payments/
│   │   │   ├── index.ts            # getProviderForMarket(), PaymentProvider interface
│   │   │   └── providers/{stripe,razorpay}.ts
│   │   ├── cms/
│   │   │   ├── pages.ts  render.ts  versions.ts  menus.ts  redirects.ts  journal.ts
│   │   │   ├── preview.ts          # createPreviewToken / resolvePreviewToken / revoke — 06 §4.4
│   │   │   ├── rhythm.ts           # checkRhythm(), BUILDER_BLOCK_SOFT_CAP — 06 §2.2
│   │   │   └── backgroundTokens.ts # GENERATED from tokens.css — 06 §2.1, 11 §7.7
│   │   ├── media/                  # Cloudinary adapter, signed uploads, derivative presets
│   │   ├── search/                 # SearchProvider + PostgresSearchProvider, synonyms
│   │   ├── seo/                    # metadata builders, JSON-LD, hreflang, canonicals, feeds
│   │   ├── email/                  # Resend adapter + template resolution + render
│   │   ├── analytics/              # server-side event RECORDING (write path)
│   │   ├── reporting/              # admin READ-ONLY aggregates — §2.2, 14 §1.2. Never on the
│   │   │   │                       # storefront, never an authority, never sums across currencies
│   │   │   ├── index.ts            # public surface; re-exports read functions only
│   │   │   ├── source.ts           # ReportSource, ReportFigure, combine(), SOURCES
│   │   │   ├── range.ts            # resolveWindows(), bucketFor(), startOfLocalDay()
│   │   │   ├── dashboard.ts        # getDashboard()
│   │   │   ├── sales.ts            # revenue, orders, AOV, market performance, time series
│   │   │   ├── products.ts         # best sellers, top products, most viewed, slow movers
│   │   │   ├── jewellery.ts        # top stones, top materials, categories, one-of-a-kind
│   │   │   ├── inventory.ts        # stock counts, retail valuation, metal weight on hand
│   │   │   ├── customers.ts        # new vs returning, lifetime value per currency
│   │   │   ├── wishlist.ts         # most wishlisted, additions, wishlist→purchase
│   │   │   ├── carts.ts            # abandonment and recovery
│   │   │   ├── cost.ts             # THE ONLY file that may name cost_minor — 14 §8
│   │   │   ├── rollup.ts           # refreshRollups() — the product_metrics_refresh handler,
│   │   │   │                       # and the ONLY writer in this folder (allow-listed by path)
│   │   │   └── sql/                # one Prisma.sql fragment per report, no interpolation
│   │   ├── audit/                  # recordAudit()
│   │   ├── importexport/           # CSV parse, validation preview, apply, export writers
│   │   ├── jobs/
│   │   │   ├── kinds.ts            # JOB_KINDS incl. systemPermitted — 11 §3.2
│   │   │   └── run.ts              # runJob() actor rule — 11 §3.3
│   │   ├── ratelimit/              # consume(), RATE_LIMIT_KEYS — 11 §4
│   │   ├── cache/                  # tags.ts, revalidateTags(), cached(), cacheLifeFor()
│   │   ├── edge/                   # markets.ts, redirects snapshot, security headers — the ONLY
│   │   │                           # modules middleware.ts may import (§2.2). No fetch (§1.4).
│   │   ├── money.ts                # Money, formatMoney, parseMoneyInput, allocate, applyBpSigned
│   │   └── result.ts  logger.ts
│   │   # NOT in src/lib: React components, JSX, anything importing 'next/navigation',
│   │   # anything reading cookies() directly (that is passed in from the caller).
│   │
│   ├── components/
│   │   ├── ui/                     # primitives only (10 §3.1). Zero domain knowledge, zero fetching
│   │   ├── storefront/             # 10 §3.2
│   │   ├── admin/                  # 10 §3.3
│   │   ├── blocks/                 # page-builder blocks + registry.ts (name → component + Zod
│   │   │                           # props schema + breakpoint config schema) — 06 §1.3
│   │   ├── forms/                  # RHF field wrappers bound to Zod schemas
│   │   ├── seo/                    # JsonLd, Hreflang, Canonical
│   │   └── analytics/              # GA4/GTM loaders (render nothing when unconfigured)
│   │   # NOT in components: Prisma imports, price math, permission decisions.
│   │
│   ├── styles/
│   │   ├── globals.css             # Tailwind v4 entry + @theme + the generated limit-ladder rules
│   │   └── tokens.css              # palette, spacing, type scale — 10 §2, and the SOURCE of
│   │                               # BACKGROUND_TOKENS and chk_cms_sections_background_token
│   ├── types/                      # Market, CurrencyCode, ActionResult, inventory.ts
│   │                               # (AvailabilityBand — five values, 11 §7.1)
│   └── test/                       # test-only helpers importable by tests (factories, db reset)
│
├── tests/
│   ├── setup/
│   │   ├── db.ts                   # per-worker schema; VITEST_MAX_WORKERS budget (09 §2.8)
│   │   ├── collect-audit.ts        # globs docs/architecture/*.md — 09 §0, NOT 0*.md
│   │   └── pending.json            # not-yet-reached-phase allowlist; EMPTY at launch
│   ├── unit/  db/  integration/  api/        # vitest: **/*.{test,spec}.ts
│   ├── e2e/                        # Playwright
│   ├── a11y/  perf/                # nightly only
│   └── fixtures/                   # sample CSVs, webhook payload captures (secrets scrubbed)
│
├── scripts/
│   ├── bootstrap.sh                # §5.9 — one-command local setup on this machine
│   ├── create-admin.ts             # first owner account (never seeded with a known password)
│   ├── check-env.ts                # prints configured/unconfigured per integration; also the
│   │                               # pre-commit staged-secret scan
│   ├── gen-market-snapshot.ts      # → src/generated/market-snapshot.json (§1.4), in the build
│   ├── gen-background-tokens.ts    # tokens.css → backgroundTokens.ts + the CHECK (06 §2.1)
│   ├── gen-limit-rules.ts          # the responsive-limit ladder CSS (06 §2.1)
│   ├── reset-local-db.ts
│   └── backfill/                   # one-off, dated, deleted after they run
│
└── docs/
    ├── architecture/               # this folder — 00-CONTEXT.md, 01-… , 11-registries.md
    ├── decisions/                  # ADRs, including every new dependency (§1.5)
    ├── runbooks/                   # rollback.md, restore-from-pitr.md, rotate-secrets.md,
    │                               # failed-migration.md, payment-reconciliation-divergence.md,
    │                               # disable-a-market.md, dispute-response.md, erasure-request.md
    ├── backlog.md                  # anything not in 01–11 (09 R11)
    └── brand/                      # logo usage, palette hex values, type specimen
```

**Twenty route files this tree gained, and who commissioned each**, so the
diff against the earlier revision is auditable rather than a wall of new lines:

| Route file | Owner |
| --- | --- |
| `catalog/products`, `catalog/redirect-hit`, `search`, `search/click` | 08 §2.2, §3.6 |
| `wishlist/summary`, `account/summary` | 08 §2.2 |
| `checkout/shipping-quote`, `checkout/provider-authorization` | 08 §2.2 |
| `analytics/[market]/collect` | 08 §7.2 — **the market is the path segment**, not a body field |
| `feeds/[market]/google-merchant.xml`, `feeds/[market]/meta-catalog.csv` | 08 §3.7 |
| `media/callback`, `media/svg` | 11 §10.9, 06 §7.10 |
| `security/csp-report` | 07 §5.8 |
| `admin/import/upload`, `admin/export/[jobId]`, `admin/jobs/[id]/stream`, `admin/search/preview`, `admin/cms/pages/[id]/heartbeat` | 08 §2.2, 06 §6.4 |
| `admin/search` | 13 §6.1 — the ⌘K palette's data route. **Distinct from `admin/search/preview`**, which is the storefront-ranking tuning route gated on `search.manage`; this one is `staff:dashboard.view` and queries each result group only when the actor holds that group's permission |
| `cron/pricing-rule-windows` | 04 §5.4 — the tenth cron (§5.6) |

and one route deliberately **not** added: `/api/internal/market-snapshot`, for the
reason in §1.4.

**Two route shapes are conditional and are therefore absent from the tree until
the client answers**, so that an engineer scaffolding from this section does not
create a file `routes-authorized.test.ts` will then fail on for having no
manifest row:

- `/api/feeds/[market]/[token]/google-merchant.xml` — the token-gated feed
  variant of `08 §3.7`'s NEEDS INPUT. Built only if the client wants the feed
  URLs gated; the ungated shape above is the default.
- `/api/cart/summary` — `08 §2.3` raises it as the versioned successor to
  `/api/cart` if that response shape ever has to change. It is a migration path,
  not a launch route.

---

## 4. Environment and configuration

`.env.example` is committed with every key present and **no values**.
`src/lib/config/env.ts` parses `process.env` with Zod at module load.

**These tables are the whole of `.env.example`.** A variable named anywhere in
`02`–`11` and absent here is a defect in this section, not in that document;
`tests/unit/integration-keys.test.ts` (`11 §6`) asserts that every env var named
in §4 belongs to exactly one `IntegrationKey` or to the `required` set, and
`scripts/check-env.ts` fails when `.env.example` and the Zod schema disagree.
Sections **4.10–4.13 are new**, and they collect the keys documents `04`, `05`,
`07` and `08` had previously introduced only in prose — including
`GIFT_CARD_CODE_PEPPER`, which `05 §8.7` said was "documented in 01 §4.7" (it was
not: §4.7 is the email table) and which is a **required** secret with no default.

**Two severities.** `required` keys make the process refuse to boot with a
listed error (fail closed). `optional` keys leave their integration in an
`unconfigured` state — never a fake success (§4.9).

### 4.1 Application

| Key | Sev | What breaks without it |
| --- | --- | --- |
| `APP_ENV` | required | `local` \| `preview` \| `production`. Gates `robots.txt`, demo banners, email sandboxing, seed guards. Missing = boot refused. |
| `NEXT_PUBLIC_APP_URL` | required | Absolute canonical origin. Without it: canonical tags, hreflang, sitemaps, OG images, email links and payment return URLs are all relative or wrong. |
| `NEXT_PUBLIC_DEFAULT_MARKET` | required | Market resolved when the path has no prefix and no cookie. Default `US`. |
| `CRON_SECRET` | required | Cron routes reject every call (fail closed) — reservations never expire, abandoned-cart mail never sends. |
| `REVALIDATE_SECRET` | required | `/api/revalidate` returns 401 for all callers; manual cache purge unavailable. |
| `LOG_LEVEL` | optional | Defaults to `info`. |
| `SEED_DEMO` | optional | `1` allows `prisma/seed/99-demo.ts`. Refused when `APP_ENV=production`. |
| `VERCEL_DEPLOY_HOOK_URL` | optional | The **Deploy now** button on `/admin/settings/markets` (§1.4). Unset, the button is hidden and the panel says a deployment is needed to activate a new market. Deliberately **not** an `IntegrationKey` (§4.9) — it gates one button, not a capability. |

### 4.2 Database

| Key | Sev | What breaks without it |
| --- | --- | --- |
| `DATABASE_URL` | required | **Pooled** connection string (Neon `-pooler` host). The app cannot start. |
| `DIRECT_URL` | required | **Direct, non-pooled** string. `prisma migrate` takes session-level advisory locks a transaction pooler does not preserve — migrations hang forever without this. |
| `DATABASE_CONNECTION_LIMIT` | optional | The `pg.Pool` `max` in `src/lib/db/client.ts`. **Not a connection-string parameter** — `@prisma/adapter-pg` constructs the pool itself, so `?connection_limit=` on the URL is ignored and a reader who sets it there will not understand why nothing changed. Defaults to `5` locally and `10` on serverless; `09 §2.8` sets it to `1` under `NODE_ENV=test`. Wrong value against `prisma dev` (10-connection cap) produces intermittent "too many connections". *(This key was also called `DB_POOL_MAX` in `09`; that spelling is withdrawn.)* |
| `DATABASE_STATEMENT_TIMEOUT_MS` | optional | Defaults `15000`. Without it a runaway admin query can hold a pooled connection. |

**The Prisma CLI does not read `.env.local`.** `@next/env` loads `.env.local` for
the application; the Prisma CLI loads `.env` only. Every script that shells out to
Prisma therefore goes through `dotenv-cli` (§5.9), or the first `npm run db:migrate`
on a clean machine fails with `Environment variable not found: DATABASE_URL` while
`npm run dev` works perfectly — which sends the engineer hunting in exactly the
wrong place. `.env` is gitignored alongside `.env.local`; neither is ever committed.

### 4.3 Auth

| Key | Sev | What breaks without it |
| --- | --- | --- |
| `AUTH_SECRET` | required | ≥32 random bytes. Session and OTP tokens cannot be signed — boot refused. Rotating it logs everyone out (intended). |
| `OTP_HASH_PEPPER` | required | Customer OTP codes would be stored/compared without a server-side pepper. |
| `ADMIN_TOTP_ISSUER` | optional | Defaults to `Millennium Designs`; only affects the authenticator app label. |
| `ADMIN_BOOTSTRAP_EMAIL` | optional | `scripts/create-admin.ts` has no default recipient; first-owner creation becomes interactive. |
| `PASSWORD_PEPPER` | required | Server-side pepper mixed into every Argon2id password hash **and** into `rateLimitKey(prefix, email)` (`07 §5.5`, `11 §4.1`), so no `rate_limits.key` ever contains an address in the clear. Boot refused without it. Rotating it invalidates every stored password hash — it is not `AUTH_SECRET` and must not be reused as one. |
| `OTP_HASH_PEPPER` | required | *(listed above)* — distinct from `PASSWORD_PEPPER` so an OTP-table leak and a password-table leak are not one compromise. |
| `AUTH_SECRET_PREVIOUS` | optional | The prior `AUTH_SECRET` during a rotation window. Verify-only: tokens signed with it still validate, nothing new is signed with it. Absent = no rotation in progress, which is the normal state. `src/lib/config/env.ts` **warns at boot once it has been set for more than 30 days** (`07 §1.10`) — a permanently-set previous key is just two live keys. |
| `SESSION_TTL_HOURS` / `ADMIN_SESSION_TTL_HOURS` | optional | Default `720` / `12`. |
| `ADMIN_SESSION_IDLE_MINUTES` | optional | Default **`60`**. Idle timeout on a staff session, separate from its absolute TTL, and applied to staff sessions **only** — a customer returning after a week is still signed in (`07 §1.2`). *(This entry read `30` and `07 §1.2`, `07 §1.1`'s TTL table and `07 §9.1` test A3 all read `60`; `07` owns session lifetime and its figure is the one that stands.)* |
| `ADMIN_IP_ALLOWLIST` | optional | Comma-separated CIDRs. **Empty means no restriction, and that is the seeded state** — an allowlist configured wrongly locks the client out of their own admin, so it is opt-in and never a silent default. |

### 4.4 Stripe (US / USD)

| Key | Sev | What breaks without it |
| --- | --- | --- |
| `STRIPE_SECRET_KEY` | optional* | US checkout renders the "payments not configured for this market" state; no order is created. |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | optional* | Payment element cannot mount; checkout blocks before collecting card data. |
| `STRIPE_WEBHOOK_SECRET` | optional* | Webhooks are rejected as unverifiable → **orders never move to `paid`**. This is the single most damaging missing key in production. |
| `STRIPE_TAX_ENABLED` | optional | `true`\|`false`, **default `true` for the US market**. When false, US tax falls back to `src/lib/tax` rules in the DB — a fallback, not a plan; see below. |

\* Required in practice for the primary market. `integrationStatus().stripe`
reports `unconfigured` and the admin Integrations page shows exactly which keys
are missing.

**US sales tax is not a rules table we maintain.** Destination-based sales tax
across roughly 11,000 US jurisdictions, with rates and product-taxability that
change every quarter and economic-nexus thresholds that differ per state, cannot
be kept correct by hand in a `tax_rules` table. It will be wrong within one
quarter, and the consequence is a tax liability discovered at audit rather than a
visible bug. Jewellery makes it worse: several states treat bullion and
investment-grade metal differently from finished jewellery, so the taxability code
is per product category, not per order. Therefore Stripe Tax computes US tax at
intent creation, and the computed amount is snapshotted onto `order_items` /
`orders` like every other amount (§2.5 step 4) so a later rate change cannot move
a historical order. `src/lib/tax` owns the India path — GST is a small, stable,
statutory rate set — and the interface both sit behind.

> **NEEDS INPUT:** US sales-tax position — which states the business is
> registered in, its nexus assessment, and who signs off the taxability codes for
> finished jewellery vs loose stones vs bullion. For India: the GSTIN, the HSN
> code per category (jewellery is commonly 7113), whether displayed INR prices are
> GST-inclusive, and whether B2B invoices carrying a buyer GSTIN are in scope.
> These answers change rates and invoice fields; they do not change the
> architecture, which snapshots a computed tax amount either way.

### 4.5 Razorpay (India / INR)

| Key | Sev | What breaks without it |
| --- | --- | --- |
| `RAZORPAY_KEY_ID` | optional | India checkout renders the unconfigured state. |
| `RAZORPAY_KEY_SECRET` | optional | Order creation and refunds fail; server-side verification impossible. |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | optional | Checkout widget cannot mount. |
| `RAZORPAY_WEBHOOK_SECRET` | optional | Payment confirmations cannot be verified → INR orders never move to `paid`. |

### 4.6 Media and storage

| Key | Sev | What breaks without it |
| --- | --- | --- |
| `CLOUDINARY_CLOUD_NAME` | optional | Image URLs cannot be built; the storefront falls back to a neutral placeholder and admin upload is disabled with a labelled banner. |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | optional | The `next/image` custom loader cannot build a delivery URL client-side. |
| `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | optional | `/api/media/sign` returns 503; admin uploads are blocked (never silently dropped). |
| `CLOUDINARY_UPLOAD_FOLDER` | optional | Defaults to `millennium/{APP_ENV}`. Without separation, preview uploads pollute production assets. |
| `MEDIA_MAX_UPLOAD_MB` | optional | Defaults `25`. |

### 4.7 Email

| Key | Sev | What breaks without it |
| --- | --- | --- |
| `RESEND_API_KEY` | optional | No transactional mail: order confirmation, OTP login, password reset, return updates. Admin Integrations shows `unconfigured`; **outbound mail is queued to `email_log` with status `skipped_unconfigured`, never reported as sent.** |
| `EMAIL_FROM` | optional | No verified sender; Resend rejects every send. |
| `EMAIL_FROM_NAME` | optional | Defaults to `Millennium Designs`. |
| `EMAIL_REPLY_TO` | optional | Customer replies bounce to the no-reply sender. |
| `ORDER_NOTIFICATION_EMAILS` | optional | Comma-separated internal recipients; without it nobody is told a US order landed. |
| `EMAIL_SANDBOX_REDIRECT` | optional | On `local`/`preview`, **all** mail is redirected here. Absent on a non-production environment, `src/lib/email` refuses to send at all rather than risk mailing a real customer. |
| `OTP_SMS_PROVIDER` | optional | The `otp_sms` integration (`11 §6`). Unset ⇒ the India login screen renders the SMS option **disabled with the reason inline**; email OTP and password login are unaffected. |
| `OTP_SMS_API_KEY` | optional | As above. |
| `OTP_SMS_SENDER_ID` | optional | The registered alphanumeric sender header. |
| `OTP_SMS_DLT_TEMPLATE_ID` | optional | India's DLT template registration id. Without it an Indian operator rejects the message at the gateway, so it is part of the integration's `missingKeys[]`, not an optional extra. |

### 4.8 Analytics, observability, rate limiting

| Key | Sev | What breaks without it |
| --- | --- | --- |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | optional | No error reporting; failures are only visible in Vercel logs. |
| `SENTRY_AUTH_TOKEN` / `SENTRY_ORG` / `SENTRY_PROJECT` | optional | Source maps are not uploaded; stack traces stay minified. |
| `NEXT_PUBLIC_GA4_MEASUREMENT_ID` | optional | GA4 script does not render. First-party `analytics_events` are unaffected — admin dashboards keep working. |
| `NEXT_PUBLIC_META_PIXEL_ID` | optional | Meta pixel does not render. No placeholder pixel is ever emitted, and `connect.facebook.net` is not added to `script-src`. |
| `NEXT_PUBLIC_GTM_CONTAINER_ID` | optional | No container loads. When **set**, GTM is the only tag loader and the direct GA4 / Ads / Pixel snippets are suppressed — two loaders double-count conversions (`08 §7.3`). |
| `META_CAPI_ACCESS_TOKEN` | optional | `analytics_dispatch` jobs skip the Meta target and record that they did. Server-side conversions are absent, never faked. |
| `META_CAPI_TEST_EVENT_CODE` | optional | Routes CAPI events to Meta's test console instead of production. Set on `preview`, never on `production`. |
| `NEXT_PUBLIC_GOOGLE_ADS_ID` | optional | The global tag does not render. |
| `GOOGLE_ADS_CONVERSION_LABEL_PURCHASE` | optional | With the id but no label the tag loads for remarketing and the purchase conversion is unattributed. |
| `INDEXNOW_KEY` | optional | `sitemap-ping` attempts no submission and reports `indexnow: unconfigured` rather than silently doing nothing. The key file must also be served at `/{INDEXNOW_KEY}.txt`. |
| `ANALYTICS_RETENTION_DAYS` | optional | Default `400`. `cleanup-sessions` prunes `analytics_events` past this age. |
| `RATE_LIMIT_BACKEND` | optional | `database` (default) \| `upstash`. |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | optional | Only read when `RATE_LIMIT_BACKEND=upstash`; otherwise ignored entirely. |
| `SEARCH_PROVIDER` | optional | `postgres` (default). Reserved for §1.6. |

### 4.9 The degradation rule

**Every integration must resolve to one of exactly three states, and the
unconfigured state must be visible, never silent.**

```ts
// src/lib/config/integrations.ts
export type IntegrationKey =
  | 'stripe' | 'razorpay'                                     // payments
  | 'cloudinary'                                              // media
  | 'resend' | 'otp_sms'                                      // messaging
  | 'sentry'                                                  // observability
  | 'ga4' | 'gtm' | 'meta_pixel' | 'meta_capi' | 'google_ads' // analytics
  | 'metal_rate_api'                                          // pricing
  | 'indexnow'                                                // seo
  | 'upstash';                                                // infrastructure

export const INTEGRATION_KEYS: readonly IntegrationKey[] = Object.freeze([ /* the 14 above */ ]);
export type IntegrationState = 'configured' | 'unconfigured' | 'error';

export function integrationStatus(key: IntegrationKey): {
  state: IntegrationState;
  missingKeys: string[];
  lastErrorAt: Date | null;
};
```

> **The union is fourteen, not eight.** An earlier draft of this section presented
> eight values as the complete type, and five other documents then widened it in
> prose — `04 §3.2` ("gains `'metal_rate_api'`"), `07 §1.8` (`'otp_sms'`),
> `08 §7.3` (`'ga4' | 'gtm' | 'meta_pixel' | 'meta_capi' | 'google_ads'`) and
> `08 §3.3` (`indexnow`). `11 §6` is the reconciliation and owns the per-key
> env-var list and customer-visible unconfigured state.
> `tests/unit/integration-keys.test.ts` fails when a string passed to
> `integrationStatus()` is not a member, when a member has no env-var list in
> `src/lib/config/env.ts`, or when an env var named in §4 belongs to neither an
> integration nor the `required` set.
>
> **Five are launch blockers** (`11 §6`, `09 §5.1`): `stripe`, `razorpay` (unless
> India launches inactive), `cloudinary`, `resend`, `sentry`. The other **nine**
> have a defined, visible, *designed* unconfigured state — `metal_rate_api`
> unconfigured means rates are entered by hand at `/admin/pricing/metal-rates`,
> which is a supported launch state, not a degradation.
>
> > **CHANGE REQUIRED IN 11 §6 and 09 §5.1:** both say **six** are launch
> > blockers and then name the same five. `11 §6`'s table carries exactly five
> > `**yes**` rows (`stripe`, `razorpay`, `cloudinary`, `resend`, `sentry`) —
> > `otp_sms` is explicitly `no` — and 5 + 9 = 14, which is the union's size. The
> > word is **five**, in `11 §6`'s closing sentence and in `09 §5.1`'s Operations
> > checklist item, or the launch checklist has an item nobody can satisfy.

Consequences that are non-negotiable (hard rule 7):

- **Checkout.** If `getProviderForMarket(market)` returns `null`, the checkout
  route renders a blocking panel: "Online payment is not yet configured for
  {market}. No order has been created." No cart is cleared, no order row is
  written, no confirmation email is queued, no success page is shown.
- **Email.** An unconfigured sender writes `email_log` rows with
  `status = 'skipped_unconfigured'` and surfaces a count in the admin dashboard.
  The UI never says "confirmation sent".
- **Media.** Upload controls render disabled with the reason inline; no
  data-URI or placeholder is written to `media` as though it were a real asset.
- **Analytics.** An unconfigured GA4 renders no script and the admin dashboard
  shows only first-party data with its own source label. No sample or simulated
  numbers, anywhere, at any time.
- **`/admin/settings/integrations`** lists all fourteen keys with their state and
  the exact missing variable names, and **never a value** (`07 §5.10`).
  `npm run check:env` prints the same table in CI and locally.

> **NEEDS INPUT:** Stripe account (US legal entity) and Razorpay account (India
> legal entity) — API keys, webhook signing secrets, and confirmation of which
> entity receives USD settlement. Until supplied, both providers stay
> `unconfigured` and checkout is blocked, by design.

> **NEEDS INPUT:** Cloudinary account (cloud name, API key/secret) and the
> intended plan, and a Resend account plus the sending domain to be authorised
> for SPF/DKIM/DMARC.

### 4.10 Pricing and metal rates

Introduced by `04` and `03` in prose; they belong here.

| Key | Sev | What breaks without it |
| --- | --- | --- |
| `METAL_RATE_PROVIDER` | optional | `manual` (default) \| a vendor key. `manual` **disables** `/api/cron/metal-rate-refresh`, which reports itself as skipped at `/admin/system/jobs`; rates are entered by hand at `/admin/pricing/metal-rates`. This is a supported launch state, not a degradation. |
| `METAL_RATE_API_URL` / `METAL_RATE_API_KEY` | optional | Required together when `METAL_RATE_PROVIDER ≠ manual`; `integrationStatus('metal_rate_api')` lists whichever is missing. |
| `PRICING_RATE_MAX_AGE_HOURS` | optional | Default `48`. A `metal_rates` row older than this makes a recalculation preview **refuse that market's lines** with `RateStaleError` while still proposing the others (§2.3). Set too high, the system quotes a rate nobody would trade at; too low, every preview is empty. |
| `PRICING_RECALC_MAX_LINES` | optional | Default `20000`. `createRecalcPreview()` above this returns `TooManyLinesError` rather than opening a transaction that cannot finish. |
| `PRICING_RECALC_CHUNK_SIZE` | optional | Default **`200`**. Rows per statement inside `applyRecalcRun()`. *(This read `500`; `04 §5.3`'s table reads `200` and `04` owns the apply job.)* |
| `PRICING_RECALC_APPROVAL_MAX_AGE_HOURS` | optional | Default `24`. An approved run older than this is `RecalcStaleError` on apply — approving eight thousand prices on Monday and applying them on Friday is hard rule 6 with extra steps. |
| `PRICING_RECALC_PREVIEW_MAX_AGE_HOURS` | optional | Default `24`. A **preview** older than this cannot be approved: the rate it was built from has since moved, so the numbers a human reviewed are not the numbers that would ship. Separate from the key below because the two bound different gaps — review→approve, and approve→apply. *(Named in `04 §5.3` and absent here, which by this section's own rule was a defect in this section.)* |
| `PRICING_RECALC_ALERT_BP` | optional | Default **`2000`** (20%). A preview whose median line moves more than this flags for a second look before approval. *(This read `1000`; `04 §5.3` reads `2000`.)* |

### 4.11 Commerce

Introduced by `05`; **`GIFT_CARD_CODE_PEPPER` is required and has no default.**

| Key | Sev | What breaks without it |
| --- | --- | --- |
| `GIFT_CARD_CODE_PEPPER` | required | ≥32 random bytes. `gift_cards.code_hash` is `hmac_sha256(code, GIFT_CARD_CODE_PEPPER)` (`05 §8.7`), **not** Argon2id: Argon2id embeds a fresh salt per row, so `uq_gift_cards_code_hash` would never collide and `WHERE code_hash = $1` would never match. Boot is refused without it, because a gift-card lookup that silently returns nothing is money the customer paid for and cannot spend. **Rotating it invalidates every outstanding card** — it belongs in `docs/runbooks/rotate-secrets.md` as the one secret that cannot be rotated without a migration. |
| `RESERVATION_TTL_MINUTES` | optional | Default `30`. How long `reserveStock()` holds a piece for a cart. Longer removes one-of-a-kind stock from sale for longer; shorter loses carts mid-checkout. |
| `ORDER_PAYMENT_EXPIRY_MINUTES` | optional | Default `60`. `release-reservations`' second pass cancels `pending_payment` orders older than this and reverses their coupon and gift-card holds. |
| `PAYMENT_WINDOW_MINUTES` | optional | Default `15`. How long a provider intent is considered current before the client is re-quoted. |
| `CART_MAX_LINES` | optional | Default `50`. |
| `CART_MAX_QUANTITY` | optional | Default `10` per line. |
| `AVAILABILITY_LOW_THRESHOLD` | optional | Default `2`. The `low` band's ceiling in `11 §7.1`. Never applied to a one-of-a-kind piece. |

### 4.12 Content and preview

| Key | Sev | What breaks without it |
| --- | --- | --- |
| `PREVIEW_TOKEN_DEFAULT_TTL_HOURS` | optional | Default `72` for an entity-scoped grant, hard max `720`. A market-scoped grant is capped separately at 4 hours (default) and 24 (max) — `06 §4.4`. *(This replaces `MARKET_PREVIEW_TOKEN_TTL_MINUTES`, which is withdrawn along with the market-preview JWT.)* |
| `MEDIA_MAX_UPLOAD_MB` | optional | *(listed in §4.6)* — also caps the multipart body of `POST /api/admin/import/upload`. |

### 4.13 Test-only

Not in `.env.example` and not read by `src/lib/config/env.ts`; set by
`vitest.config.ts` and CI. Listed because an engineer will search for them.

| Key | Where |
| --- | --- |
| `VITEST_MAX_WORKERS` | Default `3`. The **single knob** for the `prisma dev` 10-connection budget (`09 §2.8`, R18). |
| `UV_THREADPOOL_SIZE` | Raised in CI so Argon2id hashing in parallel forks does not starve the libuv pool. |

---

## 5. Deployment architecture

### 5.1 Hosting and database

| Concern | Choice | Why |
| --- | --- | --- |
| Application | **Vercel**, Node 24 runtime, primary region `iad1` | Native Next 16 support: ISR with tag-based purge, server actions, cron, instant rollback. The alternative (containers on Fly/Render) means hand-building ISR and cache purge — weeks of work for no gain at this scale. |
| Database | **Neon** PostgreSQL 17, region `aws-us-east-1` | Serverless-friendly pooling, branch-per-PR, PITR. Co-located with `iad1` so app↔DB latency is sub-millisecond for the primary market. |
| Media | **Cloudinary** | §1.1. |
| Email | **Resend** | §1.1. |
| Errors | **Sentry** | §1.1. |
| Repo / CI | **GitHub + GitHub Actions** | §5.3. |

**The India latency trade-off.** Placing app and DB in `us-east-1` means Indian
customers pay a transpacific round trip on dynamic requests. Accepted: the US is
the primary market, and every high-traffic India surface (home, PLP, PDP, stone
pages) is ISR-served from the Vercel edge cache in-region, so only cart,
checkout and account pay the latency. Revisit with a Neon read replica in
`ap-south-1` only if India becomes a material revenue share — that is a
configuration change in `src/lib/db/client.ts`, not a rearchitecture.

**This design requires a Vercel Pro plan or higher, and says so here rather than
discovering it at launch.** Ten cron entries — three at `*/5` and one at `*/15` (§5.6) —
`maxDuration: 300` on the cron and export functions, and deployment protection on
previews (§5.5) are all above the Hobby tier, which additionally does not permit
commercial use. On Hobby the cron schedules are silently coerced to a small number
of daily runs — so `release-reservations` would run once a day, and an abandoned
checkout would hold a one-of-a-kind piece off sale until tomorrow while the
dashboard shows the job as healthy. Likewise Neon: branch-per-PR (§5.3) and PITR
are paid-tier features.

> **NEEDS INPUT:** Who owns the Vercel team, the Neon project, the GitHub
> organisation and the domain registrar account — client-owned with agency
> access, or agency-owned and transferred at handover. This decides billing,
> secret custody and the handover runbook. It also decides who pays for the Vercel
> Pro and Neon paid plans that the paragraph above makes non-optional.

### 5.2 Build pipeline

Vercel build command:

```
prisma generate && npm run gen && next build
```

`npm run gen` is three generators, all writing into gitignored paths, all with a
test that fails on drift:

| Script | Writes | Drift test |
| --- | --- | --- |
| `scripts/gen-market-snapshot.ts` | `src/generated/market-snapshot.json` — the **only** market list middleware reads (§1.4) | `tests/unit/market-snapshot.test.ts` (checksum: the file is generated, never hand-edited) |
| `scripts/gen-background-tokens.ts` | `src/lib/cms/backgroundTokens.ts` and the `chk_cms_sections_background_token` value list, both from `src/styles/tokens.css` | `tests/unit/background-tokens.test.ts` (`11 §7.7`) |
| `scripts/gen-limit-rules.ts` | the responsive-limit ladder rules appended to `src/styles/globals.css` (`06 §2.1`) | `tests/e2e/cms-responsive-limit.spec.ts` |

They run **before** `next build` because `generateStaticParams()` and the block
schemas import their output.

Migrations are **not** in the build command — a failed build must never leave a
half-migrated database, and preview deployments must not migrate production.

### 5.3 CI (GitHub Actions)

`.github/workflows/ci.yml`, on every PR and push:

1. `actions/setup-node` with `node-version-file: .nvmrc`, `cache: npm`
2. `npm ci`
3. `npx prisma generate`
4. `npm run typecheck` — `tsc --noEmit`
5. `npm run lint` — ESLint incl. the boundary rules (§2.2)
6. `npm run test:unit` — Vitest, no DB
7. `npm run test:integration` — against a **Neon branch created for the PR** by
   the Neon GitHub integration; runs `prisma migrate deploy` against that
   branch's `DIRECT_URL` first
8. `npm run build`
9. `npm run test:e2e -- --grep @smoke` against the Vercel preview URL

`.github/workflows/migrate.yml`, on push to `main`: `prisma migrate deploy` using
the production `DIRECT_URL` from GitHub Environment secrets.

**Ordering, which is the part that actually bites.** Vercel promotes a production
deployment as soon as its build succeeds. If the migration sits behind a manual
approval gate that runs *after* that, then release N's code — which under
expand/contract writes the new column — is live before the column exists, and
every write to it 500s until somebody notices and clicks Approve. Expand/contract
is what makes a *rollback* safe; it does not make migrate-after-deploy safe,
because the new code is the half that needs the new schema. So the promotion is
gated on the migration, not the other way round:

- Vercel's **Production Branch is `release`, not `main`.** A push to `main` builds
  and runs the full CI matrix as a preview deployment: built, tested, not serving.
- `migrate.yml` on push to `main` runs `prisma migrate deploy` against the
  production `DIRECT_URL`, and **on success** fast-forwards `release` to `main`,
  which is what triggers the production deployment.
- The optional `environment: production` manual approval sits on that workflow,
  *before* the migration. An unapproved release is then simply not live, rather
  than live against a schema it does not have.
- Preview deployments never touch the production database: the Neon GitHub
  integration creates the PR's branch before the preview build starts (§5.5).

### 5.4 Migration strategy

**The connection-string rule, restated as code.** `prisma/schema/schema.prisma`:

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")   // pooled  — application runtime
  directUrl = env("DIRECT_URL")     // direct  — migrate / introspect / studio
}
```

Running `prisma migrate` through the pooled endpoint hangs on advisory locks.
`scripts/check-env.ts` fails hard if `DIRECT_URL` contains `-pooler`.

**Rules:**

1. **Forward-only.** There is no `migrate down`. Recovery is a new migration.
2. **Expand / contract, always.** Release N adds the new column/table and
   dual-writes. Release N+1 backfills and switches reads. Release N+2 drops the
   old column. A destructive change never ships in the same release as the code
   that stops using it — this is what makes a code-only rollback safe, and it
   makes the ordering of `migrate deploy` versus the Vercel promotion
   irrelevant.
3. **`migrate dev` is local-only.** Preview and production only ever run
   `migrate deploy`.
4. **Every migration is reviewed as SQL.** Generated SQL is edited by hand where
   §1.2 requires (generated columns, partial indexes, CHECK constraints) and the
   edit is noted in the PR.
5. **Long backfills are scripts, not migrations** — `scripts/backfill/<date>-<name>.ts`,
   batched, resumable, deleted after the release lands.
6. **Index creation on a populated table uses `CREATE INDEX CONCURRENTLY`** in a
   standalone migration with the transaction disabled.

### 5.5 Environments

| | Local | Preview | Production |
| --- | --- | --- | --- |
| App | `next dev` on `localhost:3000` | Vercel preview URL per PR | production domain |
| DB | `prisma dev` (§5.9) or a personal Neon branch | Neon branch per PR, deleted on merge | Neon `main` branch |
| Migrations | `prisma migrate dev` | `migrate deploy` in CI against the PR branch | `migrate deploy` via approved workflow |
| `APP_ENV` | `local` | `preview` | `production` |
| `robots.txt` | `Disallow: /` | `Disallow: /` + `X-Robots-Tag: noindex` header | real rules |
| Email | redirected to `EMAIL_SANDBOX_REDIRECT`, or refused | redirected | live |
| Payments | provider test keys | provider test keys | live keys |
| Demo seed | `SEED_DEMO=1` allowed | allowed | **refused by code** |
| Basic-auth gate | no | yes (Vercel deployment protection) | no |

### 5.6 Scheduled work

**Ten entries, not nine.** An earlier draft of this table tabulated nine while
`04 §5.4` required `/api/cron/pricing-rule-windows` and cited *this section* for
it. Nine is not a bookkeeping slip: without the tenth, a sale that ended at
midnight keeps being served from the ISR cache until each entry's `revalidate`
lapses, in both currencies, and `product_market_sort` keeps filtering on the
withdrawn price. `11 §5` is the canonical registry; this is the same ten rows with
this document's operational detail.

`vercel.json` — verbatim, and it carries crons and function config and **no
`headers` key** (§5.8):

```json
{
  "crons": [
    { "path": "/api/cron/release-reservations",  "schedule": "*/5 * * * *"  },
    { "path": "/api/cron/pricing-rule-windows",  "schedule": "*/5 * * * *"  },
    { "path": "/api/cron/run-jobs",              "schedule": "*/5 * * * *"  },
    { "path": "/api/cron/retry-webhooks",        "schedule": "*/15 * * * *" },
    { "path": "/api/cron/abandoned-carts",       "schedule": "0 * * * *"    },
    { "path": "/api/cron/metal-rate-refresh",    "schedule": "0 3 * * *"    },
    { "path": "/api/cron/low-stock-digest",      "schedule": "0 4 * * *"    },
    { "path": "/api/cron/sitemap-ping",          "schedule": "30 4 * * *"   },
    { "path": "/api/cron/cleanup-sessions",      "schedule": "0 5 * * *"    },
    { "path": "/api/cron/reconcile-payments",    "schedule": "0 6 * * *"    }
  ]
}
```

| Path | Schedule | Job | Max runtime |
| --- | --- | --- | ---: |
| `/api/cron/release-reservations` | `*/5 * * * *` | Release `reservations` past `expires_at` (`release_reason = 'expired'`); delete expired `checkout_sessions` with a null `order_id`; **second pass:** cancel `pending_payment` orders older than `ORDER_PAYMENT_EXPIRY_MINUTES` and reverse their coupon redemption and gift-card debits. Without this, an abandoned checkout keeps a one-of-a-kind piece off sale indefinitely and a customer's gift card is silently drained. | 120 s |
| `/api/cron/pricing-rule-windows` | `*/5 * * * *` | **The tenth cron.** Purge `market:{code}` and `product:{id}` for every `pricing_rules` window that opened or closed since the last run; re-run `reindexProduct()` for the products whose effective display price moved; enqueue `feed_rebuild` per affected market. Without it a scheduled sale appears on the PLP, the PDP and the bag at three different moments, and a **withdrawn** sale keeps being charged. Every `revalidate` figure in `08 §4.2` is conditional on this row existing. | 60 s |
| `/api/cron/run-jobs` | `*/5 * * * *` | Prelude: `runScheduledPublishes(now)` plus the `next_boundary_at` sweep (`06 §4.3`). Then `drainJobs({ maxMs: 240_000 })` over the `jobs` queue — CSV import apply, exports, bulk edits over 50 rows, approved recalculation runs, confirmation email, scheduled publishes, feeds (§2.7). These cannot run inside a request and must not be attempted there. | 300 s (`maxDuration: 300`) |
| `/api/cron/retry-webhooks` | `*/15 * * * *` | Retry `webhook_events` with `status = 'failed' AND attempts < 8`, exponential backoff, via `idx_webhook_events_retry`. A transient failure at the moment a payment lands otherwise leaves the order `pending_payment` forever, after the provider has stopped retrying. | 120 s |
| `/api/cron/abandoned-carts` | `0 * * * *` | Queue one abandoned-cart `send_email` job per qualifying cart; stamp `abandoned_email_sent_at`. | 120 s |
| `/api/cron/metal-rate-refresh` | `0 3 * * *` | **Fetch and store** one `metal_rates` row per (material × currency) — silver first, gold next (§2.3). It **never** re-prices live products: it creates a pending `recalc_runs` preview an admin must approve (hard rule 6), and it never derives one currency's rate from another's. A market whose currency has no fresh rate is reported as skipped, not estimated. **Disabled and reported as skipped when `METAL_RATE_PROVIDER=manual`**, which is a supported launch state. | 120 s |
| `/api/cron/low-stock-digest` | `0 4 * * *` | Internal low-stock digest from `idx_inventory_low_stock`. | 60 s |
| `/api/cron/sitemap-ping` | `30 4 * * *` | Rebuild sitemap shards, purge tag `sitemap`, enqueue `feed_rebuild` per market as a floor, submit changed URLs to IndexNow when `INDEXNOW_KEY` is set. **Production only.** | 300 s |
| `/api/cron/cleanup-sessions` | `0 5 * * *` | Prune `sessions`, `otp_requests`, `rate_limits`, `content_preview_tokens`, `analytics_events`, `search_queries`, `email_logs`, `jobs`, `import_job_rows` and inactive `carts`; run `pruneVersions()` in batches of 500. Without it every credential-hash and telemetry table grows without bound and `content_versions` becomes the largest table in the database. | 300 s |
| `/api/cron/reconcile-payments` | `0 6 * * *` | Compare `payments` / `refunds` against the provider's own records for 72 h; re-derive order header sums for 48 h; flag orphan provider payments, over-refunds and stuck `paid_unfulfillable` orders; replay missed events through `handleProviderWebhook()`. This is the net under every webhook assumption in §2.5. | 300 s |

Every cron handler: verifies `CRON_SECRET` **and** the `x-vercel-cron` header
(`auth: { kind: 'cron' }`, `sameOrigin` off — `07 §3.4`), is idempotent, takes a
row lock in `jobs` so two invocations cannot overlap, and writes a `jobs` run
record (started/finished/error) surfaced at `/admin/system/jobs`.

**`src/lib/config/crons.ts` exports `CRON_JOBS`** with the same ten rows plus
`maxRuntimeMs`, and `tests/unit/cron-registry.test.ts` asserts three sets are
equal: the directory names under `src/app/api/cron/*/route.ts`, the `path` values
in `vercel.json#crons`, and the keys of `CRON_JOBS`. Schedules must match
string-for-string. Neither an unregistered handler nor a registered path with no
handler passes — which is the check that would have caught the missing tenth row.

> **NEEDS INPUT:** The metal-rate data source — a paid market-data API (which
> vendor, whose account) or manual admin entry — **and whether it can quote in
> both USD and INR**. A feed that quotes only one currency does not make the
> other market's linked prices computable; it makes them manual, which is a
> supported state and not a conversion. Which materials are rate-linked at launch
> (silver only, or silver and gold) is the same decision. Until supplied, the cron
> is disabled and `metal_rates` is populated only by an admin through
> `/admin/pricing/metal-rates`.

### 5.7 DNS and domain strategy

- **One domain, path-prefixed markets** (§1.4): US at the root, `/in` for India,
  `/uk` `/ca` `/au` `/ae` reserved.
- Rejected: ccTLDs (`.in`, `.co.uk`) and market subdomains. Both split link
  equity across properties and multiply DNS, TLS, analytics and deployment
  surface for a brand with one catalogue. Path prefixes keep 100% of authority
  on one host and cost one middleware rule.
- Apex is canonical; `www` 301-redirects to apex (configured at Vercel, not in
  app code).
- TLS and certificate renewal: Vercel-managed.
- DNS records: `A`/`ALIAS` apex → Vercel, `CNAME www` → Vercel,
  Resend's `MX`/`TXT` for the sending subdomain (use a dedicated
  `send.<domain>` so the root domain's reputation is insulated),
  `TXT` SPF, `CNAME` DKIM, `TXT _dmarc` starting at `p=none` and tightened to
  `p=quarantine` after two clean weeks.
- `hreflang` alternates + `x-default` on every market-aware page, emitted by
  `src/lib/seo`.

> **NEEDS INPUT:** The production domain name, the registrar, and DNS
> administrative access. Nothing about the brand's domain is assumed here.

### 5.8 Secrets, rollback, observability

**Secrets.** Vercel encrypted environment variables, scoped per environment
(Production / Preview / Development), plus GitHub Environment secrets for the
migration workflow. Never in the repo, never in `next.config.ts`, never in a
`NEXT_PUBLIC_` variable unless the value is genuinely public. Stripe uses a
**restricted** key for server operations. `.env.local` is gitignored and
`scripts/check-env.ts` runs in `pre-commit` to reject a staged file containing a
`sk_live`, `rzp_live`, or `postgres://` string. Rotation procedure lives in
`docs/runbooks/rotate-secrets.md`; rotating `AUTH_SECRET` invalidates all
sessions and that is documented as expected.

**Response headers and CSP — one home.** Headers are defined in
`next.config.ts#headers()` only. `vercel.json` carries crons and function config
and **no** `headers` key: two header sources means one of them is quietly losing a
merge and nobody can tell which from the deployed response.

| Header | Value |
| --- | --- |
| `Content-Security-Policy` | `default-src 'self'; script-src 'self' 'nonce-{n}' https://js.stripe.com https://checkout.razorpay.com https://www.googletagmanager.com; frame-src https://js.stripe.com https://hooks.stripe.com https://api.razorpay.com; img-src 'self' https://res.cloudinary.com data:; connect-src 'self' https://api.stripe.com https://*.razorpay.com https://*.sentry.io https://*.google-analytics.com; style-src 'self' 'unsafe-inline'; font-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'` |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `X-Content-Type-Options` | `nosniff` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), interest-cohort=()` |
| `X-Robots-Tag` | `noindex, nofollow` on `/admin/**` and on every non-production environment |

The nonce is generated per request in middleware and read by the JSON-LD emitter
— the single documented `react/no-danger` exception (§1.5) — so structured data
does not force `'unsafe-inline'` onto `script-src` for the whole site.

This is not hygiene, it is a card-acceptance obligation. PCI DSS v4.0 §6.4.3 and
§11.6.1 require an inventory of every script authorised to run on a payment page
plus change detection on those pages; a locked `script-src`, a committed
`package-lock.json` and Sentry release tracking are how that inventory is produced
here. Card data itself never reaches our origin — Stripe Payment Element and
Razorpay Checkout are iframed — which is what keeps the scope at the lightest SAQ
tier, but the acquirer decides that, not us.

> **NEEDS INPUT:** Confirmation from each acquirer of which SAQ applies to this
> integration and whether a quarterly ASV scan of the domain is required.

**Rollback.**

1. **Code:** Vercel "Instant Rollback" to the previous production deployment.
   This is the primary lever and is safe because of expand/contract (§5.4).
2. **Database:** never rolled back. Corrective forward migration, or Neon PITR
   restore to a new branch for inspection — a PITR promotion is a declared
   incident, not a routine step.
3. **Feature-level:** risky behaviour (new checkout step, silver-linked
   recalculation, a payment provider) sits behind a row in `settings` readable
   at runtime, so it can be turned off in the admin panel without a deploy.
4. Runbook: `docs/runbooks/rollback.md`.

**Observability hooks.**

| Signal | Mechanism |
| --- | --- |
| Errors | Sentry (server/client/edge), release tagged with the git SHA, source maps uploaded at build |
| Health | `GET /api/health` → `{ db: 'ok', migrations: <head>, integrations: {...} }`, 503 on DB failure |
| Payments | Every provider call and webhook persisted to `webhook_events` (raw payload, signature status, attempts, result); `/admin/system/webhooks` replays one by hand |
| Business events | `analytics_events` written server-side at add-to-cart, checkout-start, order-created, order-paid, refund |
| Admin actions | `audit_logs` — actor, entity, action, before/after JSON, IP, user agent |
| Jobs | `jobs` table + `/admin/system/jobs` |
| Logs | Vercel runtime logs; structured JSON via `src/lib/logger.ts` with a per-request `x-request-id` propagated from middleware |
| Alerts | Sentry issue alerts to email; uptime check against `/api/health` |

> **NEEDS INPUT:** The alert destination — email addresses and/or a Slack
> workspace for Sentry and uptime alerts — and which uptime service the client
> wants to pay for.

### 5.9 Local development bootstrap — exact commands for this machine

No Docker, no local Postgres, no PHP. Two supported paths.

**Path A (default, offline-capable): `prisma dev`.**

```bash
# 1. repo + runtime
#    Do NOT write .nvmrc yet: create-next-app refuses to scaffold into a directory
#    containing files outside its small allowlist (.git, docs/, LICENSE, a few
#    others). .nvmrc is not on that list and aborts step 2.
cd "/Users/anshbhatt/Downloads/MD J"
git init -b main
nvm use 24.18.0
node -v && npm -v             # expect v24.18.0 / 11.16.0

# 2. scaffold (npm — pnpm/bun are not installed)
npx create-next-app@16 . \
  --typescript --app --src-dir --tailwind --eslint \
  --import-alias "@/*" --use-npm
echo "24.18.0" > .nvmrc
printf 'save-exact=true\nengine-strict=true\n' > .npmrc

# 3. runtime deps
npm i --save-exact \
  @prisma/client @prisma/adapter-pg pg \
  zod react-hook-form @hookform/resolvers \
  @radix-ui/react-dialog @radix-ui/react-popover @radix-ui/react-select \
  @radix-ui/react-tabs @radix-ui/react-dropdown-menu @radix-ui/react-tooltip \
  class-variance-authority tailwind-merge clsx lucide-react \
  zustand @tanstack/react-table \
  jose @node-rs/argon2 \
  stripe razorpay \
  cloudinary next-cloudinary \
  @tiptap/react @tiptap/starter-kit \
  resend @react-email/components \
  date-fns recharts \
  @sentry/nextjs

# 4. dev deps
npm i -D --save-exact \
  prisma tsx dotenv-cli \
  vitest @vitejs/plugin-react @testing-library/react @testing-library/user-event \
  jsdom @playwright/test \
  eslint-plugin-boundaries prettier prettier-plugin-tailwindcss \
  @types/node @types/react @types/react-dom @types/pg

# 5. prisma
#    plain `mv`, not `git mv` — nothing is tracked yet and `git mv` on an untracked
#    path exits with "not under version control".
npx prisma init --datasource-provider postgresql --output ../src/generated/prisma
mkdir -p prisma/schema && mv prisma/schema.prisma prisma/schema/schema.prisma
printf 'src/generated/\n.env\n' >> .gitignore
#    `prisma init` also writes a .env containing a placeholder DATABASE_URL. It is
#    the file the Prisma CLI reads (§4.2) and it is gitignored from here on.

# 6. local database — leave this running in its own terminal tab
npx prisma dev --name millennium
#    Copy the printed connection string, then verify it with the SAME driver the
#    app uses, before writing a single model:
#      node -e "const{Client}=require('pg');const c=new Client(process.argv[1]);\
#        c.connect().then(()=>c.query('select 1')).then(r=>console.log('ok',r.rows))\
#        .catch(e=>{console.error(e.message);process.exit(1)}).finally(()=>c.end())" "<paste>"
#    Both `@prisma/adapter-pg` and `prisma migrate` speak plain TCP, so DATABASE_URL
#    and DIRECT_URL both need the `postgres://…` form. If prisma dev surfaces a
#    `prisma+postgres://…` URL, that check fails and you need the direct TCP
#    endpoint instead. One minute now; an afternoon after 40 tables exist.

# 7. .env.local  (gitignored) — for prisma dev, pooled and direct are the same host
cat >> .env.local <<'EOF'
APP_ENV=local
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_DEFAULT_MARKET=US
DATABASE_URL="<paste from prisma dev>?connection_limit=5"
DIRECT_URL="<paste from prisma dev>"
DATABASE_CONNECTION_LIMIT=5
AUTH_SECRET="<openssl rand -base64 48>"
OTP_HASH_PEPPER="<openssl rand -base64 32>"
CRON_SECRET="<openssl rand -hex 32>"
REVALIDATE_SECRET="<openssl rand -hex 32>"
EMAIL_SANDBOX_REDIRECT="<your own inbox>"
EOF

# 8. schema -> db -> seed -> run
#    dotenv-cli is not decoration: the Prisma CLI reads .env, the app reads
#    .env.local, and the real credentials are in .env.local (§4.2).
npx dotenv -e .env.local -- npx prisma migrate dev --name init
npm run db:seed
npm run dev
```

**The 10-connection cap is a hard constraint on this path.** Three settings
respect it and must not be raised:

- `DATABASE_CONNECTION_LIMIT=5` in `.env.local` (app leaves headroom).
- `vitest.config.ts`: `test.pool = 'forks'`,
  `test.poolOptions.forks.singleFork = true`, `test.fileParallelism = false`
  for the `integration` project — parallel Vitest workers each open a pool and
  exhaust the cap within seconds.
- `playwright.config.ts`: `workers: 1` when `APP_ENV=local`.

**Path B (required as soon as a second developer joins, or for any work needing
Neon-specific behaviour): a personal Neon branch.** Create a branch off `main`
in the Neon console, put its **pooled** string in `DATABASE_URL` and its
**direct** string in `DIRECT_URL`, then `npx prisma migrate dev`. Everything
else is identical. Never point a local machine at the production branch.

`scripts/bootstrap.sh` automates steps 2–8 and prints the `npx prisma dev`
instruction rather than backgrounding it, so the developer sees the connection
string.

**`package.json` scripts (canonical names — CI and runbooks reference these):**

```json
{
  "dev": "next dev",
  "db:dev": "prisma dev --name millennium",
  "build": "prisma generate && next build",
  "start": "next start",
  "typecheck": "tsc --noEmit",
  "lint": "eslint .",
  "format": "prettier --write .",
  "db:migrate": "dotenv -e .env.local -- prisma migrate dev",
  "db:deploy": "prisma migrate deploy",
  "db:seed": "dotenv -e .env.local -- tsx prisma/seed/index.ts",
  "db:studio": "dotenv -e .env.local -- prisma studio",
  "db:reset": "tsx scripts/reset-local-db.ts",
  "check:env": "tsx scripts/check-env.ts",
  "create:admin": "tsx scripts/create-admin.ts",
  "test": "npm run test:unit && npm run test:integration",
  "test:unit": "vitest run --project unit",
  "test:integration": "vitest run --project integration",
  "test:e2e": "playwright test"
}
```

`db:deploy` is the one Prisma script **without** `dotenv` — it only ever runs in
CI and in the migration workflow, where `DIRECT_URL` comes from the environment.
`build` runs `prisma generate` because the client is generated into
`src/generated/`, which is gitignored (step 5): the generated client is a build
artefact, not a reviewable file.

### 5.10 Brand assets on disk

`public/brand/` is the only home for the two supplied marks. They are referenced
through `src/components/ui/Logo.tsx`, which exposes exactly two variants
(`wordmark` | `monogram`) and two tones (`green` | `ivory`) and accepts no colour,
transform or effect props — the component is the enforcement mechanism for "use
as-is, never redesigned".

> **NEEDS INPUT:** The original vector files for the wordmark and the monogram
> (`.svg`, `.ai` or `.eps`) plus any brand guideline document. The marks
> currently exist only as chat images. Production fidelity — favicons, print,
> email headers, the ivory-on-dark variant, retina OG cards — requires the
> client's vector source. Until they arrive, `public/brand/` holds traced
> placeholders clearly marked `-PLACEHOLDER` in the filename, and
> `docs/brand/logo-usage.md` records that they are not shippable.

---

## 6. P01 field notes — what the bootstrap actually hit

Recorded while executing §5.9 on the real machine. Everything below is a correction to
this document from observed behaviour, not a plan change. Each is the kind of thing that
costs an hour on the day it is met and five minutes when it is written down.

### 6.1 `npm i prisma` installs a RELEASE CANDIDATE

prisma's `latest` dist-tag is **`8.0.0-rc.14`**; `7.10.0` is published under **`prev`**:

```
$ npm view prisma dist-tags
{ latest: '8.0.0-rc.14', prev: '7.10.0', next: '8.0.0-rc.10', … }
```

So the §5.9 command `npm i -D --save-exact prisma` silently installed the v8 RC **CLI**
against a v7 **client** (`@prisma/client` resolves `7.10.0` from its own `latest`). A
mismatched CLI and client is a class of failure that surfaces later, during migration,
looking like a schema problem.

**The bootstrap must pin the CLI explicitly:**

```bash
npm i -D --save-exact prisma@7.10.0     # match @prisma/client exactly
```

`tests/unit/prisma-version-parity.test.ts` should assert
`prisma === @prisma/client === @prisma/adapter-pg`, because a future `npm update` walks
straight back into this.

### 6.2 Prisma 7.10 has no `directUrl` — the pooled/direct split MOVES

This document (written against 7.9) specified `datasource { url, directUrl }` in
`schema.prisma`. Prisma 7.10 moved datasource configuration into **`prisma7.config.ts`**,
whose type is:

```ts
export declare type Datasource = { url?: string; shadowDatabaseUrl?: string };
```

There is no `directUrl` key. **The rule it encoded is unchanged and still load-bearing** —
migrations take session-level advisory locks a transaction pooler does not preserve, so
migrating through a pooled endpoint hangs. The split is now expressed by *which process
reads which variable*:

| Process | Reads | Endpoint |
| --- | --- | --- |
| Prisma CLI (`migrate deploy`, `migrate dev`) via `prisma7.config.ts` | `DIRECT_URL` | **direct** |
| The application, via `@prisma/adapter-pg` in `src/lib/db/client.ts` | `DATABASE_URL` | **pooled** |

`scripts/check-env.ts` still fails the build when `DIRECT_URL` contains `-pooler`
(09 P02 exit criterion (b)); only the file it inspects changed. Note also that the schema
is a **directory** (`schema: "prisma/schema"`), which 7.10 supports natively — the
multi-file layout of §3 needs no flag.

### 6.3 The scaffold's TypeScript target cannot express `bigint`

`create-next-app@16` writes `"target": "ES2017"`. Every money value in this system is a
`bigint` (02 §1.10), so `src/lib/money.ts` fails to compile with twelve instances of:

```
error TS2737: BigInt literals are not available when targeting lower than ES2020.
```

**`tsconfig.json` must set `"target": "ES2022"` and `"lib": ["dom","dom.iterable","ES2022"]`**
as the first edit after scaffolding. This is not a preference; the integer-money decision
is unimplementable below ES2020.

### 6.4 The project directory name is not a valid npm package name

`create-next-app` derives the package name from the directory and refuses
`/Users/anshbhatt/Downloads/MD J`:

```
Could not create a project called "MD J" because of npm naming restrictions:
  * name can only contain URL-friendly characters
  * name can no longer contain capital letters
```

Scaffold into a temporary directory named `millennium-designs` and move the files in. The
package is `millennium-designs`; the folder keeps whatever name the client prefers. A
folder name with a space is otherwise harmless here, but it does mean **every script and
CI path must quote it**.

### 6.5 Lint tooling has moved on from this document's assumptions

- `eslint-config-next@16` ships **native flat configs** (`eslint-config-next/core-web-vitals`,
  `eslint-config-next/typescript`). Routing them through `FlatCompat` throws
  `TypeError: Converting circular structure to JSON`. Import them directly.
- `eslint-plugin-boundaries@7` renamed `boundaries/element-types` → **`boundaries/dependencies`**
  and `rules` → **`policies`**, with object selectors
  (`{ from: [{ element: { type: "app" } }], allow: [{ to: { element: { type: [...] } } }] }`).
  The legacy shape still runs but warns on every invocation.
- Element `pattern`s match **folders**, not files, so `middleware.ts` cannot be an element
  pattern; `src/lib/edge/**` carries the middleware element type.
- **Flat-config ordering is a correctness concern, not a style one.** An exemption block
  for `src/lib/money.ts` is silently undone by any later block matching
  `src/**/*.{ts,tsx}`, because the last match wins. P01 exit criterion (c) passed while
  its converse — the same code being *permitted* inside `money.ts` — failed, which is how
  this was found. Later blocks must repeat the earlier blocks' `ignores`.

### 6.6 `prisma dev` — three things confirmed, one risk retired

Running `npx prisma dev --name millennium` on this machine:

1. It prints a **plain `postgres://` TCP URL**, not `prisma+postgres://`. The §5.9 warning
   case does not apply here, and `pg` connects to it directly — verified with the same
   driver the app uses before any model existed, as §5.9 requires.
2. It confirms the **10-connection ceiling** in its own output ("set the maximum number of
   connections to 10"), which is why `DATABASE_CONNECTION_LIMIT=5` and why
   `vitest.config.mts` sets `fileParallelism: false`.
3. The server is **PostgreSQL 17.5 compiled to `wasm32-unknown-linux-gnu`**. This was the
   real risk: a WASM build might not carry the extensions 02 §7.1 depends on. It does —
   `CREATE EXTENSION pg_trgm` and `btree_gist` both succeed, `similarity()` returns
   `0.7692308` for `('labradorite','labradorit')`, and the `<->` distance operator works.
   **The search and admin-filter index strategy is viable on the local database**, so P05
   and P30 are not blocked on a hosted Postgres.

A shadow database URL is printed alongside and is wired to `SHADOW_DATABASE_URL`;
`prisma migrate dev` needs it because it cannot create databases on this server.

### 6.7 P02 field notes

Recorded while executing §5.3 and §5.4.

**The generator `output` path is relative to the schema FILE.** §3 puts the schema at
`prisma/schema/schema.prisma` (a directory, so forty tables are not one file), but
`prisma init` writes `output = "../src/generated/prisma"`, which was correct only while
the schema sat at `prisma/schema.prisma`. After the move it resolves to
`prisma/src/generated/prisma` — and `prisma generate` reports success, having written the
client somewhere nothing imports. It must be `"../../src/generated/prisma"`.

**`tsx` transpiles to CJS unless `package.json` declares `"type": "module"`,** so
top-level `await` in a script fails with *"Top-level await is currently not supported with
the cjs output format"*, and `import.meta.dirname` is undefined. Scripts under `scripts/`
therefore wrap their body in `async function main()` and use `process.cwd()`. Worth
knowing before writing the seed and import scripts, which are the ones that will want
top-level await.

**`server-only` must be aliased in `vitest.config.mts`.** The package exports
`./empty.js` under the `react-server` condition and an `index.js` that *throws* under
`default`. Vitest resolves through the CJS require path, where the condition never
applies, so every module importing `server-only` — which is every server module, by
design — fails to import before a single test runs. Setting `resolve.conditions` does not
help. The alias points at the package's **own** server entry (`server-only/empty.js`)
rather than stubbing the package out, so the guard remains real in the production build.

**Integration tests need `setupFiles`, not `env:`.** `src/lib/db/client.ts` calls `env()`
at module scope, so the environment must be populated before the test file is *imported*,
not before it runs. `tests/setup/env.ts` loads `.env.local` then `.env` with
`override: false`, which also makes it a no-op in CI where the workflow supplies the
variables and neither file exists.

**Assert the isolation level, do not trust the option.** `tests/integration/db-connection.test.ts`
reads `current_setting('transaction_isolation')` from inside both wrappers. `withTransaction`
returning `read committed` and `withSerializableRetry` returning `serializable` is the
only evidence that the `ReadCommitted` decision of §1.2 — the one that stops a losing
customer seeing a 500 under concurrent checkout — is actually in force. (`SHOW` does not
accept a column alias; `current_setting()` does.)

**CI runs integration tests against a Postgres 17 service container.** §5.3 step 7
specifies a Neon PR branch via the Neon GitHub integration, which needs an account that
does not exist yet. A service container needs no credentials and runs today; the Neon
path remains the target once the account exists, and nothing in the workflow changes but
the connection strings. The concurrency tests are the reason this is not optional: a test
that asserts exactly one of two simultaneous transactions wins is meaningless against a
mock.

### 6.8 P03 field notes

**The pinned permission count did its job on the first run.** `09` P03 criterion (b)
requires `permissions` row count `=== PERMISSION_KEYS.length` **and that the number be a
literal**. The catalogue in `11 §1.3` is **73** keys — `review.moderate` became key 73
when the reviews descope was resolved in `15 §3.3` — while `09`, `02 §7.3` and
`07 §1297` all still said 72. Three documents disagreed with the one that owns the list,
and the literal caught it before a single row was seeded. All four now say 73.

This is the argument for pinning counts rather than asserting `length === length`, which
would have passed silently and shipped a role matrix missing a key.

**`src/lib/rbac/catalogue.ts` is generated from the document, not transcribed.** The 73
keys, their descriptions and all 242 grants were parsed out of `11 §1.3`/`§1.4` and
emitted. Transcribing 242 checkmarks by hand has an error rate, and every error is a
silent privilege bug. Note that the matrix rows for the eight keys added during
reconciliation are **bolded** in the table (`**\`review.moderate\`**`), so any parser must
allow optional `**` around the key or it will silently find 65 rows instead of 73 and
conclude those keys are ungranted.

**Prisma cannot express a primary key containing a nullable column,** so
`settings (key, market_code) NULLS NOT DISTINCT` — the thing that makes a setting a
per-market row rather than a global flag — is impossible to model. `settings` therefore
takes a surrogate `id` in Prisma and the real identity is a unique index in the
hand-written addendum. `tests/db/constraints.test.ts` proves a second global row for one
key is refused; without the index it would be insertable and whichever row the query
happened to return would win.

**The migration is Prisma-generated plus a 180-line hand-written addendum,** which carries
everything Prisma has no syntax for: 13 CHECK constraints, 18 partial and expression
indexes, two `NULLS NOT DISTINCT` uniques, a GIN index, a BRIN index, and the audit-log
immutability triggers. This is the designed escape hatch of §1.2, not a workaround — but
it does mean **`prisma migrate dev` must be run with `--create-only`** and the addendum
re-appended whenever the schema changes, or the constraints are silently dropped.

**Audit immutability is a trigger, not only a grant.** `07 §7.4` specifies INSERT/SELECT
grants for the application role. A grant is untestable on a superuser development
database and silently does nothing if the role is ever changed, so `audit_logs` also
carries `BEFORE UPDATE` and `BEFORE DELETE` triggers that raise
`insufficient_privilege`. `tests/integration/audit-immutable.test.ts` asserts a
single-row UPDATE, a single-row DELETE and a **bulk** DELETE are all refused and the row
survives unchanged.

**The seed asserts it created no user, and fails if it did.** `09` P03 criterion (c) is
"no user row exists after seeding". Rather than leaving that to a reviewer, the seed
counts `users` at the end and throws. A seeded default login is the single most reliable
way for a development credential to reach production; the first account is minted
deliberately by `npm run create:admin`, which also writes its own creation into
`audit_logs` so that an admin account can never appear with no provenance.

**A lint rule expressed as an exclusion leaked again.** The `new Date()` ban is
pricing-only, but it was written as "every file EXCEPT `src/lib/pricing/**` gets the other
three rules" — which left the *base* block carrying the Date ban and applying it to
scripts, seeds and tests, where `new Date()` is ordinary. It is now stated positively:
one block, `files: ["src/lib/pricing/**"]`, listing what is banned there. Combined with
the P01 finding (§6.5), the rule is: **in flat config, state the narrow thing positively;
never express a restriction as an exclusion.**

### 6.9 P03A field notes

**The seed list omits the one row that makes `customers` insertable.** `09` P03 names
four seed files; none creates a `customer_groups` row, while `02 §2.3` makes
`customers.customer_group_id` **NOT NULL**. So no customer could be inserted at all —
not a registration, not a guest checkout — and it would have surfaced at P18 as "the
first order fails", fifteen phases from its cause. `prisma/seed/03-customer-groups.ts`
seeds the `general` group with `is_default = true`, and the seed now asserts at least one
group exists rather than trusting it.

**The lint rules caught four violations in the auth code I had just written.** All four
were real and all four were fixed rather than exempted:

- `password.ts` read `PASSWORD_PEPPER` and `APP_ENV` from `process.env` directly. `env.ts`
  gains `secret()` and `appEnv()`, so it remains the only reader.
- `ratelimit/index.ts` imported the generated Prisma client. Its *separate connection* is
  a security property, not a convenience — so the client factory moved to
  `src/lib/db/ratelimit-client.ts`, which is the layer permitted to import it. The
  separation survives; the boundary is respected.
- `actor.ts` declared two module-level caches. Those are worse than useless: a
  module-level cache leaks one request's actor into the next on a warm serverless
  instance, which is precisely the session confusion the two-resolver split exists to
  prevent. Replaced with React `cache()`, which is per request (07 §2.7).

An architecture whose rules only ever catch other people's code is an architecture nobody
is actually running.

**A test timed out on the connection ceiling, and the fix is also a production note.**
`tests/integration/ratelimit.test.ts` proves the limiter survives the caller's rollback.
It first failed by timeout, because the limiter's dedicated client was being created
lazily *inside* the caller's transaction and its first connect competed for the local
server's ~10-connection ceiling. Warming it beforehand fixes the test — and the same shape
exists in production: on a cold serverless instance, the first failed login would create
the limiter client inside the login flow. **`rateLimitDb()` should be warmed at module
init on the server**, not on first use, before P24's load testing.

**The TOTP privilege line is derived and the test proves it derives.**
`rolesRequiringTotp()` returns `owner`, `admin`, `catalog_manager`, `order_manager` —
exactly what `07 §1.9` predicts — and the test additionally asserts each of those roles
really does hold a line permission, so the list cannot pass by coincidence.

**`requireStaffSession()` re-evaluates the privilege line per request.** `07 §1.10`
deliberately does not treat a permission change as a revocation, so an owner granting
`order.refund` to a role at 10am would otherwise hand every already-signed-in holder the
most money-adjacent key in the catalogue, on a session that never saw a second factor, for
up to twelve hours. The response is a step-up challenge, not a logout: the session is
valid, it simply has not proved the factor it now needs.
