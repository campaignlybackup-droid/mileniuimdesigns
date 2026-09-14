# MILLENNIUM DESIGNS — engineering handoff

A complete brief for an agent or engineer picking this up cold. Read this file, then
`docs/architecture/README.md`, then the phase table in `docs/architecture/09-phases-and-risks.md`.

**Repo root:** `/Users/anshbhatt/Downloads/MD J` (package name `millennium-designs`)
**Status as of this handoff:** phases P01–P20 complete and committed. P15, P17 and P21–P30 remain.
**Last commit:** `a914160 P20: cart — capability auth, revalidation, merge, market switch`

---

## 1. What this is

A custom ecommerce platform **and** CMS for a jewellery house with 40+ years of heritage.
Not a Shopify theme, not a headless wrapper — the catalogue, pricing engine, inventory ledger,
cart, checkout, CMS and admin are all being built from scratch.

The defining characteristics, which drive most of the architecture:

- **Two independent markets (US/USD and IN/INR).** Prices are _not_ converted. A piece has a
  USD price and an INR price, entered separately, and they have no arithmetic relationship.
  A third market (GB) exists in tests to prove nothing is hardcoded to two.
- **One-of-a-kind stock.** Many pieces are unique. If one exists, two customers must not both
  be able to buy it. This drives the locking strategy throughout inventory.
- **Metal-rate-driven pricing.** Some prices derive from a silver/gold rate via a formula.
  Changing the rate must _never_ silently change live customer prices — it produces a preview
  that an admin explicitly approves.
- **Heritage brand.** The design system is not generic. There are two manual review gates
  (`10 §9`) that no test can replace.

---

## 2. Stack

|                 |                                                          |
| --------------- | -------------------------------------------------------- |
| Framework       | Next.js **16.3.5** (App Router), React **19.2.8**        |
| Language        | TypeScript 5 (ES2022 target), strict                     |
| ORM             | Prisma **7.10.0** with `@prisma/adapter-pg`              |
| Database        | PostgreSQL 17.5 — locally via `prisma dev` (WASM pglite) |
| Styling         | Tailwind CSS v4 + CSS custom properties                  |
| UI primitives   | Radix UI                                                 |
| Validation      | Zod 4                                                    |
| Tests           | Vitest **4.1.11**                                        |
| Lint            | ESLint 9 flat config + `eslint-plugin-boundaries` v7     |
| Package manager | npm                                                      |

Client is generated to `src/generated/prisma` (gitignored, not linted, not typechecked).

---

## 3. The architecture documents are the source of truth

`docs/architecture/` holds **34,682 lines** across 18 documents. They were written before any
code, and the code is an implementation of them. When code and document disagree, that is a
defect in one of them — not a thing to work around silently.

| Doc                                | Lines | Covers                                                                       |
| ---------------------------------- | ----: | ---------------------------------------------------------------------------- |
| `00-CONTEXT.md`                    |   164 | Environment constraints, the `prisma dev` quirks                             |
| `01-stack-and-structure.md`        | 3,706 | Stack, layer boundaries, hard bans, **and the running field-notes log (§6)** |
| `02-database-schema.md`            | 4,325 | Every table, index, constraint                                               |
| `03-catalog-architecture.md`       | 2,410 | Products, variants, attributes, media                                        |
| `04-pricing-and-markets.md`        | 2,811 | The pricing algorithm, step by step                                          |
| `05-commerce-engine.md`            | 2,806 | Cart, checkout, orders, discounts                                            |
| `06-cms-architecture.md`           | 3,088 | Block registry, page builder, versions                                       |
| `07-auth-and-security.md`          | 3,224 | Sessions, CSRF, TOTP, rate limiting, RBAC                                    |
| `08-api-seo-routes.md`             | 2,876 | Route map, API shapes, SEO                                                   |
| `09-phases-and-risks.md`           | 1,273 | **The phase plan P01–P30, with exit criteria per phase**                     |
| `0A-current-project-analysis.md`   |   151 | Analysis of what existed before                                              |
| `10-design-system.md`              |   787 | Tokens, surfaces, the two manual review gates                                |
| `11-registries.md`                 | 1,748 | Every registry (jobs, blocks, errors, permissions)                           |
| `13-admin-operations.md`           | 1,838 | Admin UX at scale                                                            |
| `14-reporting.md`                  | 1,522 | The reporting module                                                         |
| `15-customer-and-commerce-gaps.md` | 1,582 | Gaps found in review                                                         |
| `99-REVIEW-FINDINGS.md`            |   252 | Contradictions found between documents                                       |

**`01 §6` is the field-notes log.** One section per phase (`§6.19`–`§6.30`), recording what
went wrong, why, and what was done about it. Read `§6.29` before touching pricing or the cart.

---

## 4. Non-negotiable rules

These come from the client brief and are enforced by tests and lint, not by convention.
Numbers are brief sections.

### Money

- **§30 — USD and INR prices are INDEPENDENT.** Never convert between them. There is no FX
  rate anywhere in the system, and `tests/unit/no-fx.test.ts` enforces it.
- Money is **integer minor units** as `bigint`, always paired with an explicit ISO currency.
  Never a float. `.toFixed()`, `parseFloat` and `Intl.NumberFormat` are **lint-banned
  repo-wide** outside `src/lib/money.ts`. (`Intl.NumberFormat('en-US',{currency:'INR'})`
  renders a lakh as ₹100,000.00 instead of ₹1,00,000.00.)
- **§134 — if a price changes later, OLD ORDERS MUST NOT CHANGE.** Orders snapshot.
- **§33 — changing the silver price must NOT automatically change live customer prices**
  unless an admin explicitly enables and approves that action.
- Discounts apply to the **line total**, never per-unit-then-multiplied.

### Security

- **§93 — never trust frontend values** for price, discount, inventory, shipping, tax,
  payment, order total or market. All re-derived server-side.
- **§92 — the backend MUST enforce permissions.** Hiding UI is not authorization.
- **§94 — frontend success is NOT proof of payment.** Verify server-side, verify webhook
  signatures, prevent duplicate webhook processing and amount/currency/total manipulation.
- **§95 — prevent overselling,** especially one-of-a-kind.
- **§96 — do not expose customer email, phone, address or order details through public APIs.**
- **§139 — never commit secrets.** Use env vars; `.env.example` is maintained.

### Content

- **§117 — no fake functionality.** Never build a fake checkout, payment, order, inventory,
  analytics or customer account.
- **§118 — do not invent:** awards, celebrity customers, certifications, founder history,
  specific locations, factories, sustainability claims, guarantees, customer numbers,
  countries, or historical events. If a fact is not supplied, the field stays empty and the
  UI hides it.

### Brand

- **§02 — USE THE SUPPLIED LOGOS. Do not redesign, trace, redraw or distort them.**
  `src/components/ui/Logo.tsx` accepts `variant`, `tone`, `size`, `priority` and _nothing else_
  — no colour, transform or filter props — so the component cannot be used to alter a mark.

---

## 5. Layer boundaries (enforced by ESLint, deny-by-default)

```
app         → actions, service, components, types, config, reporting
actions     → service, types, config
service     → service, data, types, config, lib-shared
reporting   → data, types, config, service      (nothing may import reporting except admin app)
data        → types, config
components  → components, types, config         (+ service for TYPES ONLY, `import type`)
middleware  → config, types                     (no Prisma, no service, no fetch to own origin)
lib-shared  → data, types, config               (src/lib/rules/ — imports NO domain module)
config      → types
types       → types
```

Only `src/lib/db/**` may import the Prisma client. Importing `@/generated/prisma` directly is
banned — banning only the `@prisma/client` spelling would ban nothing.

Additional targeted bans:

- `new Date()` inside `src/lib/pricing/**` — the instant is always passed in, so a price cannot
  differ between two calls a millisecond apart during one checkout. Use `src/lib/clock.ts`.
- `cache` from `react` and `unstable_cache`/`revalidateTag` from `next/cache` inside
  `src/lib/cart/**` — a cart is the one surface where a stale figure is _charged_, not merely
  displayed, and the read-time revalidation pass **writes**.
- Hex colour literals in `src/components/**` and `src/app/**` — every colour is a `--md-*`
  token, so it is inside the contrast test and the surface system.
- `isolationLevel: 'Serializable'` outside `src/lib/db/transaction.ts`, which retries
  SQLSTATE 40001. Inline, a serialization failure reaches the customer as a 500.

---

## 6. Database

**106 Prisma models** across 11 schema files in `prisma/schema/`:

| File                 | Models |                                                   |
| -------------------- | -----: | ------------------------------------------------- |
| `commerce.prisma`    |     31 | carts, orders, payments, shipments, gift cards    |
| `catalog.prisma`     |     16 | products, variants, options, media links          |
| `pricing.prisma`     |     16 | prices, rules, formulas, metal rates, recalc runs |
| `operations.prisma`  |     10 | jobs, cron, audit, settings                       |
| `collections.prisma` |      9 | collections and their rules                       |
| `identity.prisma`    |      8 | users, sessions, roles, permissions               |
| `markets.prisma`     |      5 | markets, currencies, locales                      |
| `customers.prisma`   |      4 |                                                   |
| `media.prisma`       |      4 |                                                   |
| `attributes.prisma`  |      3 | the EAV triple                                    |

### The hand-written SQL addendum — important

Prisma cannot express partial indexes, expression indexes, generated columns, composite
foreign keys, `CONSTRAINT TRIGGER`s or `EXCLUDE` constraints. Those live in
`prisma/handwritten/addendum.sql` — currently **296 objects** — and are applied _after_
migrations:

```bash
npm run db:deploy      # prisma migrate deploy && npm run db:addendum
```

`npm run db:guard` refuses any migration that drops or redefines a hand-written object.
It enforces two rules:

- **Rule A** — a drop must be re-created in the same migration file.
- **Rule B** — where the addendum cannot overwrite (CHECK constraints wrapped in
  `DO $$ … EXCEPTION WHEN duplicate_object`, which no-op on a taken name), the migration's
  definition must equal the addendum's _exactly_.

### An applied migration is immutable

Prisma checksums migrations. Editing one that has already been applied changes nothing locally
while changing what a fresh deploy produces — the two silently diverge. This was learned the
hard way. Always add a new migration.

### Concurrency pattern (used for all stock)

`FOR UPDATE` in ascending id order → conditional `UPDATE` that re-evaluates the predicate →
`CHECK` constraint as the floor. `ReadCommitted`, never `Serializable` inline. The
one-of-a-kind race test runs 200 concurrent attempts and asserts exactly one winner.

---

## 7. Local environment — the `prisma dev` quirks that will cost you a day

These are real, reproducible, and documented in `00-CONTEXT §3` and `01 §6`:

1. **It ignores the database name entirely.** Every connection lands on `template1`.
2. **It runs no autovacuum.** Dead tuples accumulate forever. `facet-counts` climbed
   33 → 70 → 121 ms over three consecutive runs before `vacuumPerfTables()` was added.
3. **It CRASHES — not errors — when a statement runs inside an already-aborted transaction.**
   When it dies, every remaining suite fails with `ECONNREFUSED` or connection timeouts, and
   no `afterAll` hook reaches a live connection, so fixtures are stranded.
4. **It is effectively single-connection.** Calling the global `db` from inside an open
   interactive transaction _deadlocks_ until the 8-second timeout. See §9 below — this is the
   single most expensive defect class in this project's history.
5. **Ports change on every restart.** `.env` must be updated to match what `npm run db:local`
   prints.
6. It can wedge at 100% CPU if clients are `kill -9`'d mid-transaction. Restart it; data
   survives on disk.

### Getting running

```bash
npm install
npm run db:local          # starts the local Postgres; note the printed ports
# update DATABASE_URL and SHADOW_DATABASE_URL in .env to match
npm run db:deploy         # migrations + the SQL addendum
npm run db:seed
npm run perf:seed         # 5,000-product fixture, only needed for tests/perf
npm run verify
```

---

## 8. Commands

| Command                           | What it does                                                                                                             |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `npm run verify`                  | typecheck → lint → db:guard → unit tests. **The gate.**                                                                  |
| `npm run test:integration`        | `tests/integration` + `tests/db` (~130s, 341 tests)                                                                      |
| `npm run test:unit`               | `tests/unit` + `tests/api`                                                                                               |
| `npm run test:perf`               | benchmarks against committed baselines                                                                                   |
| `npm run test:clean`              | clears stranded test fixtures. **Dry-run by default**, `-- --apply` to delete. Refuses any non-localhost `DATABASE_URL`. |
| `npm run db:deploy`               | `prisma migrate deploy && npm run db:addendum`                                                                           |
| `npm run db:guard`                | refuses migrations that destroy hand-written SQL                                                                         |
| `npm run build`                   | `check:brand && gen:markets && gen:tokens && next build`                                                                 |
| `npm run format` / `format:check` | Prettier. **Note:** `format:check` is _not_ part of `verify`.                                                            |

---

## 9. Defect classes learned the hard way — read this before writing code

Every one of these happened, was expensive, and now has a guard. An agent picking this up
will hit them again unless it knows.

### 9.1 A service callable from inside a transaction MUST take the client

**Occurred three times** (P12 recalc preview, P20 cart revalidation, P20 market switcher).
Reaching for the global `db` inside an open interactive transaction issues the query on a
different connection. Locally that blocks until the transaction times out eight seconds later
and reports an error naming the _next_ statement, not the read that caused it. On a real
Postgres it does not fail at all — it reads outside the transaction's snapshot, so half a cart
can be priced against data the other half cannot see.

Twice the lesson was written into a comment directly above the parameter. It was skipped
anyway. **The parameter is now required with no default** on `ResolveContext.client`,
`resolvePrice` and `getAvailability`, so omitting it is a compile error.
`tests/unit/transaction-client.test.ts` fails if anyone re-adds a default.

> A comment is not a control. If a rule has been violated twice, encode it in the type system
> or a test, not in prose.

### 9.2 A scan must read code, not its own explanation

**Six occurrences.** A guard that greps raw source for `requirePermission` will match a comment
_explaining why a module needs no `requirePermission`_ — so the module becomes exempt by virtue
of documenting itself. At P20 this silently disabled authorization checking for the entire cart
module at the exact moment the explanatory note was written.

`tests/support/source.ts` exports `codeOf(path)` and `stripComments(src)`. Use them for
anything that looks for code. Read raw source only for marker strings, which genuinely live in
comments.

### 9.3 Verify every guard by deliberately breaking it

Guards that pass vacuously are worse than no guard, because they are recorded as coverage.
Found this way in P20 alone:

- A regex `client\s*(?::[^=;,)]+)?=\s*db` never matched, because the annotation
  `Pick<typeof db, "$queryRaw">` contains a comma and the character class stopped there.
- The Vitest include glob collected only `*.test.ts`, so a commissioned `.spec.ts` file would
  have existed, been recorded as delivered, and run never.
- A shell loop reported "All 29 files verified" having executed zero iterations, because zsh
  does not word-split unquoted variables.

**Always break the guard, watch it fail, then restore.**

### 9.4 Verify every scripted edit by grepping for its result

~6 occurrences of a scripted `sed`/python edit silently matching nothing, always because
Prettier had reformatted the target since it was last read.

### 9.5 Cleanup belongs in `afterAll`, never at the end of a test body

A body-tail cleanup does not run when the test throws. `tests/db/drift.test.ts` is the leak
detector that catches this — it asserts the dev database holds no products but the marked perf
fixture.

### 9.6 Derive lists, don't hand-maintain them

`media_tags` was declared in Prisma but never created, and stayed invisible for four phases
because the drift test's table list was hand-typed. Derive from the Prisma models. Keep
explicit lists only for genuine judgements (e.g. which actions are public), and pair them with
a count floor.

### 9.7 Test suites do not own the database

A P16 test asserted 2 collection members and got 716 — the 5,000-product perf fixture
legitimately carries stones. Scope fixtures with an unmistakable prefix (`zz-p20m-…`).

---

## 10. What is built (P01–P20, 24 commits)

| Phase | What                                                                                                                                       | Commit                          |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------- |
| P01   | Repo, toolchain, layer boundaries                                                                                                          | `7a5643f`                       |
| P02   | Database provisioning, migration pipeline, the addendum + guard                                                                            | `566e290`                       |
| P03   | Schema I — markets, identity, RBAC, settings, audit, operations                                                                            | `fb26e8e`                       |
| P04   | Money and config primitives                                                                                                                | `8d61748`                       |
| P03A  | Auth: sessions, passwords, tokens, actors, rate limiting, TOTP, CSRF, staff login + lockout, customer OTP, India phone path, impersonation | `a791c54`, `83efc0f`, `98406c0` |
| P04A  | Job queue and cron spine                                                                                                                   | `46d9961`                       |
| P05   | Schema II — the catalogue                                                                                                                  | `30ceb21`                       |
| P06   | Media pipeline                                                                                                                             | `7ef6394`                       |
| P07   | Catalogue service, publish gate, product actions                                                                                           | `b14c045`                       |
| P08   | Variant engine, SKU generator, option matrix                                                                                               | `0e324a9`                       |
| P09   | Attributes (EAV) and facets                                                                                                                | `ca5f249`                       |
| P10   | Schema III — pricing, discounts, tax                                                                                                       | `ec75a35`                       |
| P11   | The pricing read path                                                                                                                      | `452eb12`                       |
| P12   | Metal rates, `evaluateFormula`, the recalculation machine                                                                                  | `5844bea`                       |
| P13   | Market system and routing                                                                                                                  | `f72dbef`                       |
| P14   | Design system and brand shell                                                                                                              | `2940efa`                       |
| P16   | Collection rule engine                                                                                                                     | `cd3358f`                       |
| P18   | Schema IV — inventory and commerce                                                                                                         | `0fd967b`                       |
| P19   | Inventory — reservations, ledger, reconciler                                                                                               | `559801b`                       |
| P20   | Cart — capability auth, revalidation, merge, market switch                                                                                 | `a914160`                       |

### Implemented modules

```
src/lib/pricing/     10 files   resolve, rules, formula, rates, recalc, display, types
src/lib/catalog/     10 files   products, variants, attributes, facets, filters, collections, sku
src/lib/auth/         8 files   session, password, totp, otp, actor, tokens
src/lib/inventory/    5 files   ledger, reserve, availability, reconcile
src/lib/cart/         5 files   index, revalidate, merge, token, messages
src/lib/db/           4 files   client, transaction, sql
src/lib/jobs/         3 files   queue, kinds, worker
src/lib/config/       3 files   env (validated at boot)
src/lib/rbac/ security/ media/ rules/ ratelimit/ payments/ market/ edge/ cms/
```

### Stub directories (created, empty — their phases have not run)

`tax/ shipping/ seo/ search/ reporting/ orders/ discounts/ customers/ checkout/ cache/ analytics/`

### Routes so far

`src/app/(storefront)/[market]/page.tsx` and **10 cron route handlers** under `src/app/api/cron/`
(pricing-rule-windows, sitemap-ping, reconcile-payments, release-reservations, low-stock-digest,
run-jobs, metal-rate-refresh, cleanup-sessions, abandoned-carts, retry-webhooks).

The storefront proper is P15, which has not run yet.

---

## 11. Test suite

**62 test files.** Current results:

| Suite                            | Result                                                                     |
| -------------------------------- | -------------------------------------------------------------------------- |
| `tests/integration` + `tests/db` | **341 / 341 pass**                                                         |
| `tests/unit` + `tests/api`       | **281 / 282 pass** — see below                                             |
| `tests/perf`                     | 6 tests; **all three budgeted cases read 25–50% above baseline** — see §13 |
| typecheck / lint / db:guard      | clean                                                                      |

### The one permanently failing unit test

`tests/unit/brand-assets.test.ts` fails because `public/brand/wordmark.svg` and
`monogram.svg` do not exist. **This is deliberate and must never be quietly excluded.**
It is blocked on client input (see §12). `npm run build` also fails for the same reason, via
`npm run check:brand`.

### Test naming — both extensions are collected

`vitest.config.mts` collects `tests/{unit,db,integration,api}/**/*.{test,spec}.{ts,tsx}` plus
`tests/perf/**/*.bench.ts`. Scoped to those four trees deliberately, because `tests/e2e/` and
`tests/a11y/` hold **Playwright's** `.spec.ts` files. `tests/unit/test-collection.test.ts`
fails if a test file on disk stops being collected.

---

## 12. Blocked on the client — nothing can substitute for these

Flagged repeatedly since P01. Do **not** invent, trace or approximate any of them.

| Needed                                                              | Why it blocks                                                                                                                                                                                                   |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Original vector logos** (`.ai`/`.eps`/`.svg`) for `public/brand/` | **The build fails until these arrive.** Raster versions exist but the wordmark runs from 18px to full-bleed and the monogram is the loading spinner. Tracing them is a redesign — see `public/brand/README.md`. |
| The real catalogue                                                  | Titles, copy, weights, photography, and an **independent USD and INR price per variant**                                                                                                                        |
| Stone, category and heritage copy                                   | §118 forbids inventing it                                                                                                                                                                                       |
| Footer facts                                                        | Address, phone, hours                                                                                                                                                                                           |
| Stripe + Razorpay credentials                                       | P23 cannot be built against fake keys (§117)                                                                                                                                                                    |
| Domain / DNS                                                        | P30                                                                                                                                                                                                             |
| High-value manual-review threshold, per market                      | Fraud rules                                                                                                                                                                                                     |
| Metal-rate data source and quote convention                         | P12 is built but has no live feed                                                                                                                                                                               |
| Real inventory locations                                            | P19                                                                                                                                                                                                             |

---

## 13. Open items carried forward

1. **Performance baselines.** All three budgeted cases currently read 25–50% above their
   committed baselines: `single-attribute` 32.2 vs 25.48 ms, `pagination-last-page` 17.27 vs
   10.67 ms, `facet-counts` 79.85 vs 53.61 ms. This is **not attributable to P20** — the
   benchmark exercises `src/lib/catalog/facets.ts` and `filters.ts`, neither of which was
   touched. The machine was at load average 3.0 with Chrome and WindowServer holding ~60% of
   CPU, and the database is CPU-bound WASM Postgres. **The baseline was deliberately NOT
   refreshed** — re-recording it on a loaded machine would bake in a slow number and retire
   the only signal that would show a real regression. Re-measure on a quiet machine. If a
   25–50% regression across three unrelated queries is confirmed, treat it as a schema or
   planner problem, not a threshold to adjust. See `01 §6.29`.
   _(The statistic itself was fixed: the gate now uses the median of three independent p95
   estimates, because p95 over 40 samples is the third-worst value and moved on any run where
   three of forty calls were slow.)_

2. **P20 criterion (e) — not done, not automatable.** The two `10 §9` review gates over
   `/cart` and the cart drawer require a named person. `10 §9.1` item 7 — _"could this be any
   other brand's site with the logo swapped?"_ — is an automatic failure and no test detects
   it. The same criterion applies to P15.

3. `format:check` is not part of `npm run verify`, so formatting drift accumulates silently.
   It was cleared in commit `647949c`; consider adding it to the gate.

---

## 14. What to build next

Dependency order from `09-phases-and-risks.md`. **P15 is the natural next phase** (P13, P14
and P09 are all complete).

### P15 — Storefront routes

Depends on P13, P14, P09.
Builds `/`, the `/[market]` tree, `/products/[slug]`, category PLP, `/collections/[slug]`,
`/stones/[slug]` and its sub-listings, error and empty states (`08 §4.4`), ISR + tag strategy.

Exit criteria:

- (a) every route renders from the database with **zero** hardcoded product, category, price
  or copy strings;
- (b) a PDP for an unpublished product 404s;
- (c) `revalidateTag(tags.product(id))` after a save flips the live page within one request;
- (d) **zero horizontal overflow at all ten design widths** of `10 §8.1` on every route class —
  `document.scrollingElement.scrollWidth <= clientWidth`; failure blocks the build;
- (Z) both `10 §9` review gates walked and signed by a named person.

Tests: `tests/unit/homepage-no-hardcode.test.ts`, `tests/e2e/storefront-smoke.spec.ts`,
`tests/e2e/no-horizontal-overflow.spec.ts`, `tests/unit/state-copy-seeded.test.ts`.

> Note: P15 builds storefront _pages_, which will want the brand assets. It can be built
> against the failing `check:brand` gate, but the build will not pass until the logos arrive.

### P17 — Search, filtering, sorting

Depends on P15. `SearchProvider` interface + Postgres implementation, `search_queries` logging,
predictive search, no-result handling, `/admin/marketing/search`.
Key criteria: provider switchable by `SEARCH_PROVIDER` with no call-site change; results respect
market availability; every `list*` call keyset-paginated and Zod-capped at 100; **price sorting
in a market uses that market's `prices` rows only and is stable across pages — a variant with no
price in the market sorts out of the set, never to zero.**

### P21 — Discounts and gift cards

Depends on P20 (done). `src/lib/discounts/` and `src/lib/giftcards/`, `coupon_amounts` with
per-currency minimum spends.
Key criteria: a fixed-amount coupon has **an amount row per currency and no conversion path**;
the `05 §8.3` stacking order executes in exactly that sequence, deterministically; the last unit
of a capped coupon is won by exactly one of two concurrent redemptions; every discount applies
to the **line total**, never per-unit-then-multiplied.

### Then

P22 shipping/tax → P23 checkout/orders/payments → P24 customer accounts + email →
P25 returns/refunds → P26–P28 CMS → P29 admin at scale → P29A reporting → P30 launch readiness.

---

## 15. Working method

From the brief, and it has repeatedly paid for itself:

- **§151 — after each phase:** run the tests, inspect the implementation, check console /
  database / API / responsive behaviour, identify problems, fix them, re-run, document, and
  continue. _"Do NOT simply say: 'Done.'"_
- **§152 — if you discover an architectural problem: STOP. Explain it. Fix the architecture.
  Then continue.** Do not patch the one call site and move on. §9.1 above is what this looks
  like in practice — the third occurrence of a defect was fixed by changing a type signature,
  not by adding a missing argument.
- Convert every _"remember to do this later"_ into a **self-arming test**. The `prices` table
  probe added at P09 fired exactly as designed on P10's first migration.
- Report failures faithfully. The brand-assets test has failed for 20 phases and is reported
  every single time rather than skipped.

---

## 16. Fast orientation for an agent

1. `docs/architecture/README.md` — the map.
2. `docs/architecture/09-phases-and-risks.md` — the phase table with exit criteria. Find the
   next phase and read its row in full.
3. `docs/architecture/01-stack-and-structure.md` **§2.2** (bans and boundaries) and **§6**
   (field notes, newest last).
4. `eslint.config.mjs` — every rule has a comment naming the specific defect it exists for.
5. The doc for the area you are touching (`04` for pricing, `05` for commerce, `07` for auth).
6. Run `npm run verify` before and after. Expect exactly one failure: `brand-assets`.

**Before changing anything in pricing or the cart, read `01 §6.29`.**
