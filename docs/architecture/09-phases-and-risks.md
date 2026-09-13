# 09 — Development Phases, Testing Architecture, Risk Register, Edge Cases, Definition of Done

This section is written after `01`–`08`. Every phase, test file and check named
here refers to something already specified in those documents. Where a phase
produces a file, the path is the one that document already fixed; where a test
file already has a name, that name is reused rather than paralleled.

> **NEEDS INPUT:** the brief's own numbered phase list is not on disk (`MD J`
> contained only `docs/` — `0A` §A.1). The 32 phases below are the canonical
> decomposition of `01`–`08` into buildable units. If the brief numbers them
> differently, reconcile the *numbering* against this table; do not re-derive the
> *dependencies*, which are structural and come from the architecture, not from
> the ordering of a list.

**Revision note — reconciliation against `07`.** The first draft of this document
was written against `01`–`06` and `08` and silently omitted `07 — Authentication
and Security` altogether: no phase built a staff or customer session, no phase
built the rate limiter, TOTP, CSRF posture or the IDOR ownership proofs, and
twenty-four test files named in `07` had no owner. That was not a gap in emphasis,
it was a missing phase — **P07's exit criterion "a product can be created entirely
through the admin" is unreachable if nothing before it can mint a staff session.**
Two phases are therefore inserted (`P03A`, `P04A`) rather than renumbering thirty
existing ones, so every `P05`–`P30` reference in this and other documents stays
valid. Where a fact here disagreed with `01`–`08`, those documents won and this one
was corrected; the corrections are called out inline where they change a number an
engineer would otherwise code against.

**Test-file naming is normative, and so is the runner glob.** Several files named
in `03`–`08` use `.spec.ts` inside the Vitest trees (`tests/integration/market-switch-cart.spec.ts`).
Those names are kept — but `vitest.config.ts` must therefore include
`tests/{unit,db,integration,api}/**/*.{test,spec}.ts`. With the conventional
`*.test.ts`-only glob, `market-switch-cart.spec.ts` is collected by nothing, and
the single test that stops a ₹ line surviving into a $ bag is absent from every CI
run while appearing green in the plan. `tests/setup/collect-audit.ts` asserts the
collected file count equals the count of files on disk under those four trees.

**Second revision note — the containment was only checked in one direction.** The
paragraph above catches a file that exists on disk but is not collected. It does
not catch the larger hole: a test file **named in `01`–`08` that no phase was ever
told to write**. Thirty-five such files existed in the previous draft — among them
`tests/e2e/idor.spec.ts`, which is the *entire* execution of `07 §4.2`'s
seventeen-row ownership table, plus `xss.spec.ts`, `security-headers.spec.ts`,
`public-api-leak.spec.ts`, `enumeration.spec.ts`, `injection.test.ts`,
`audit-immutable.test.ts`, `return-authz.test.ts`, `reservation-race.test.ts`,
`refund-giftcard-only.test.ts`, `webhook-late-success-on-cancelled.test.ts`,
`payment-retry.test.ts`, `order-expiry.test.ts`, `tax-inclusive-order.test.ts`,
`inclusive-tax-identity.test.ts`, `money-apply-bp.test.ts`,
`discount-identities.test.ts` and seven CMS specs. `collect-audit.ts` would have
reported every one of them as consistent, because a file nobody wrote is a file
that is neither on disk nor collected, and §5's *"CI green on the release commit"*
would have been signed with the IDOR suite having never existed. Every one of the
thirty-five is now assigned an owning phase below.

`tests/setup/collect-audit.ts` therefore makes **two** assertions:

```ts
// 1. nothing on disk is uncollected  (the glob check, above)
// 2. nothing named in the architecture is missing from disk:
//    grep every `tests/**/*.{test,spec,bench}.ts` path out of
//    docs/architecture/*.md, assert each resolves to a real file.
//    An architecture document is the only place a test is commissioned;
//    a commissioned test that does not exist must fail the build, not
//    be invisible to it.
```

**Third revision note — the document glob was `0*.md` and that silently excluded
four documents.** `0*.md` matches `00`–`09` and nothing else. It therefore missed
`10-design-system.md` and `11-registries.md` entirely, and would miss any
document numbered 12 or above. Two consequences, both real:

- `10 §2.1` commissions `tests/unit/contrast.test.ts` ("fails CI") and `10 §8.1`
  commissions `tests/e2e/no-horizontal-overflow.spec.ts` ("failure blocks the
  build"). Neither could ever appear in `pending.json`, neither had an owning
  phase, and §5.1 would have been signed with both unwritten. They are now owned
  by **P14** and **P15** respectively (§1.2).
- `11 §9` commissions fifteen registry-enforcement files —
  `rbac-catalogue.test.ts`, `rbac-matrix.test.ts`, `rbac-escalation.test.ts`,
  `error-taxonomy.test.ts`, `error-copy-seeded.test.ts`, `job-kinds.test.ts`,
  `job-handlers-unprivileged.test.ts`, `jobs-worker.test.ts`,
  `ratelimit-keys.test.ts`, `ratelimit-pairing.test.ts`, `cron-registry.test.ts`,
  `integration-keys.test.ts`, `background-tokens.test.ts`,
  `saved-view-schema.test.ts`, `no-offset.test.ts` — every one of which is the
  mechanism that stops a vocabulary drifting again. Under the old glob none of
  them was audited.

The glob is now `docs/architecture/*.md`. It is written as a directory listing
filtered on `/^\d\d[A-Z]?-.*\.md$/` rather than a shell wildcard, so a document
numbered `12`, `13` or `15` is picked up the day it is added and nobody has to
remember to widen a pattern. `99-REVIEW-FINDINGS.md` is excluded by that regex,
which is correct — it is a work list, not an architecture document, and the test
files it quotes are quotations of other documents.

This runs in `npm run verify` from P01 with an allowlist of
*not-yet-reached-phase* paths in `tests/setup/pending.json`; a path may sit in that
allowlist only while its owning phase is unstarted, and §5 requires the file to be
empty.

---

## 1. Development phases

### 1.1 The eight milestones

A milestone ends in something a non-engineer can be shown and an engineer can
verify from data, not from a demo narration.

| # | Milestone | Phases | Ends in | Relative size |
| --- | --- | --- | --- | ---: |
| **M0** | Foundations | P01–P04, P03A, P04A | `npm run verify` green on an empty but migrated database; CI red-on-violation proven by a deliberately broken commit; a staff user created by `npm run create:admin` can sign in with TOTP and a `content_editor` is denied at the API; one enqueued job drains through `/api/cron/run-jobs` | **13 pts** |
| **M1** | Catalogue spine | P05–P09 | A real product with variants, stones, materials, attributes and photographs, created entirely through `/admin/catalog/products/[id]`, visible via a service call — no storefront yet | **14 pts** |
| **M2** | Pricing and markets | P10–P13 | The same product priced independently in USD and INR; a silver rate raised 30% moves nothing until an admin approves a `recalc_runs` preview | **16 pts** |
| **M3** | Storefront read surface | P14–P17 | `/` `/rings` `/products/[slug]` `/stones/[slug]` `/in/...` rendering real data, Lighthouse budget met, no hardcoded content anywhere | **15 pts** |
| **M4** | Commerce engine | P18–P23 | A real test-mode order placed in both markets, webhook-confirmed, stock committed, one-of-a-kind race provably lost by the second buyer, sixteen concurrent orders numbered consecutively with no gap, and a `quoteTax` with no registrations refusing rather than returning zero | **24 pts** |
| **M5** | Accounts and post-purchase | P24–P25 | Customer account, order history, a return approved and refunded, nightly reconciliation clean | **9 pts** |
| **M6** | CMS and page builder | P26–P28 | The homepage, navigation, a journal post and a legal page built, scheduled, versioned and restored without opening the source | **16 pts** |
| **M7** | Operations, SEO, launch | P29–P30 | Definition of done (§5) signed line by line | **12 pts** |

Total **119 points**. One point ≈ the effort of P01 for a single developer with
an AI pair. No calendar dates: the external lead times in §1.7 and the content
dependency in §3 (`R14`, `R15`) dominate any estimate, and inventing a date here
would be inventing a business fact.

M0 grew from 6 points to 13 because it absorbed the two things the first draft
deferred past their first consumer: authentication (`P03A`) and the job queue
(`P04A`). Neither is new work — both were always implied by `07` and by `02 §2.9`.
Moving them forward does not add days; leaving them late adds a rewrite.

**Sizing is deliberately back-loaded.** M4 is the largest milestone and it is
also the one where a wrong decision is most expensive (§1.5). M6 is second-largest
and is the one most likely to be underestimated, because a page builder looks like
CRUD and is not.

---

### 1.2 The 32 phases

Legend for **Blocks**: a phase listed there cannot start until this one's exit
criteria are true.

#### M0 — Foundations

| P | Phase | Builds | Depends on | Exit criteria (objectively true) | Verified by |
| --- | --- | --- | --- | --- | --- |
| **P01** | Repo, toolchain, boundaries | `git init`, the `01 §5.9` bootstrap exactly as written, `.nvmrc` (after scaffold, not before), `eslint.config.mjs` with `eslint-plugin-boundaries` element types and every `no-restricted-imports` / `no-restricted-syntax` rule from `01 §2.2`, Prettier, `tsconfig` strict, `npm run verify` = `typecheck && lint && test:unit` | — | (a) `npm run verify` exits 0 on the scaffold; (b) a commit that imports `@/generated/prisma` from `src/components/` fails lint; (c) a commit containing `.toFixed(` outside `src/lib/money.ts` fails lint; (d) `src/generated/` is in `.gitignore` **and** `eslint.config.mjs#ignores` | A `tests/lint/boundaries.fixture/` directory of intentionally-bad files, asserted to fail by `npm run lint -- --no-ignore tests/lint/boundaries.fixture` in CI |
| **P02** | Database provisioning and migration pipeline | `prisma/schema/schema.prisma` with `url`/`directUrl`, `src/lib/db/client.ts` (`@prisma/adapter-pg`, pool `max` from `DATABASE_CONNECTION_LIMIT`), `src/lib/db/transaction.ts` with `withTransaction()` and `withSerializableRetry()`, `scripts/check-env.ts`, `.github/workflows/ci.yml`, `.github/workflows/migrate.yml`, Vercel Production Branch set to `release` | P01 | (a) `prisma migrate deploy` succeeds against `DIRECT_URL`; (b) `check-env.ts` **fails** when `DIRECT_URL` contains `-pooler`; (c) a push to `main` produces a preview deployment and does **not** promote until `migrate.yml` fast-forwards `release`; (d) the `node -e` raw-`pg` connectivity probe from `01 §5.9` passes against the local `prisma dev` URL | CI run on a throwaway PR; a deliberate bad `DIRECT_URL` in a preview env |
| **P03** | Schema I — markets, identity, RBAC, settings, audit, operations | `currencies`, `markets`, `inventory_locations`, `market_locations`, `order_counters`, `users`, **`customer_groups`, `customers`** *(corrected: `sessions.customer_id` is `FK → customers(id) [CASCADE]` per `02 §2.2`, and `customers.customer_group_id` FKs `customer_groups`. The first draft created `sessions` here and `customers` at **P18**, fifteen phases later — a migration that cannot be written as scoped, and exit criterion (d) below, which must insert a session carrying a customer principal, cannot be executed at all. The identity pair moves here; P18 keeps the commerce tables only)*, `sessions`, `otp_requests`, `rate_limits`, `roles`, `permissions`, `role_permissions`, `user_roles`, `settings`, `audit_logs`; **plus `02 §7.13`'s additions to this phase — `sessions.totp_verified_at`, `users.totp_last_step`, `users.totp_recovery_codes`, `idx_sessions_user`, `idx_audit_action`, the two `otp_purpose` enum values (each in its own migration ahead of first use) and the **72** `permissions` rows**; **plus the operations tables `02 §2.9` defines and every later phase writes into — `jobs` (with the `job_kind` enum, `idx_jobs_singleton`, `idx_jobs_stuck`), `saved_views`, `import_jobs`, `import_job_rows`, `search_queries`, `analytics_events`, `email_templates`, `email_logs`, `newsletter_subscribers`**; `src/lib/rbac/catalogue.ts` + `requirePermission()`; seeds `01-markets.ts`, `02-roles.ts`, `06-settings.ts`, `07-email-templates.ts`; `npm run create:admin` | P02 | (a) seed runs clean on an empty DB and is idempotent on a second run; (b) `permissions` row count equals `PERMISSION_KEYS.length`, and that number is **73** (`11 §1.3`) — *(corrected from 72: `review.moderate` became key 73 when the reviews descope was resolved in `15 §3.3`, and this criterion was not updated with it. The pinned literal caught it at P03, which is exactly what it is for.)* — pinned as a literal in the test, so adding a key without seeding it fails here rather than at P29; (c) **no user row exists after seeding**; (d) `chk_sessions_one_principal` rejects a session with both principals; (e) every table named in `02 §2.9` exists — the migration-drift check in §2.6 is run here, not at P30, so an operations table is never discovered missing by the phase that needs it; (f) `audit_logs` rows cannot be updated or deleted by the application role — the grant is `INSERT`/`SELECT` only, and an `UPDATE` attempt raises | `tests/unit/rbac-catalogue.test.ts`, `tests/db/constraints.test.ts` (new, §2.6), `tests/db/drift.test.ts` (new, §2.6), `tests/integration/audit-immutable.test.ts` (`07`), `tests/unit/settings-version-id.test.ts` (`06`), `tests/unit/error-copy-seeded.test.ts` (`08 §1.4` — the `copy.error.*` rows are seeded by `06-settings.ts`, here) |
| **P03A** | **Authentication, sessions, CSRF, rate limiting** *(inserted — the first draft had no phase for `07` at all)* | `src/lib/auth/` (`session.ts`, `staff.ts`, `password.ts` (argon2id per `07 §1.4`), `otp.ts`, `totp.ts`, `common`), the two cookies and their flags (`07 §1.3`), the token inventory (`07 §1.5`), staff invitation/login/logout (`07 §1.6`), customer registration/verification/reset (`07 §1.7`), the India phone-OTP path alongside the US email/password path (`07 §1.8`), mandatory staff TOTP above the privilege line (`07 §1.9`), session rotation and revocation (`07 §1.10`), impersonation with dual-actor audit (`07 §1.11`), `src/lib/ratelimit/` over the `rate_limits` table (`07 §5.5`), the CSRF posture (`07 §5.4`), **`getStaffActor()` / `getCustomerActor()`** (`07 §3.2`) *(corrected: this column named a single `getActor()`; `07 §3.2` states in the same breath that no such function exists, and the two-resolver split is a confused-deputy defence — one resolver reading `md_admin` first would make the storefront price, cache and audit a shopping staff member's session as an admin's. Neither resolver consults the other's cookie.)* and the server-action / route-handler guard shapes (`07 §3.3`, `§3.4`) | P03, P04 | (a) a staff session cannot be minted without TOTP for any role above the `07 §1.9` line; (b) an expired or rotated session token is rejected and the old value is unusable — not merely absent from the cookie; (c) `consume()` returns 429 with `Retry-After` at the configured threshold for login, OTP, checkout, coupon apply and search; (d) **an exported server action, route handler or service function with no `requirePermission()` fails CI** (`07 §3.7`); (e) the **ownership mechanism** exists and is the only way a customer-scoped row is fetched: `assertOwned()` / the `WHERE … AND customer_id = $2 RETURNING` shape of `07 §4.2`, a lint rule refusing a `findUnique({ where: { id } })` on a customer-scoped model outside `src/lib/**/owned.ts`, and `NotFoundError` (never `ForbiddenError`) on a miss. *(Corrected: the first draft's criterion was "a customer can read only rows they own — every surface in `07 §4.2` proves ownership". Every one of those seventeen surfaces is an order, cart, address, wishlist or return, and none of those tables exists until P18–P24. The criterion was unprovable at the phase that owned it, which is how it would have been ticked by inspection. The mechanism is proved here; the seventeen surfaces are proved by `idor.spec.ts` at **P24**, which is the first phase where all of them exist.)*; (f) no secret, token or PII appears in a client bundle or a log line; (g) a signed-in customer's identity is never read from a request body — `customerId`, `cartId`, `orderId`, `addressId` and `wishlistId` are refused by `.strict()` | `tests/integration/session.test.ts`, `tests/integration/rbac-matrix.test.ts`, `tests/integration/rbac-escalation.test.ts`, `tests/unit/routes-authorized.test.ts`, `tests/unit/services-authorized.test.ts`, `tests/unit/actions-authorized.test.ts`, `tests/unit/token-hygiene.test.ts`, `tests/unit/redact.test.ts`, `tests/unit/no-secret-in-bundle.test.ts`, `tests/unit/schemas-strict.test.ts`, `tests/api/ratelimit.test.ts`, `tests/unit/ratelimit-keys.test.ts` (`11 §9`), `tests/unit/ratelimit-pairing.test.ts` (`11 §9`), `tests/unit/no-plaintext-ratelimit-keys.test.ts` (`15 §6`), `tests/integration/login-lockout.test.ts` (`07 §A16`), `tests/e2e/enumeration.spec.ts` (`07 §A11`), `tests/integration/injection.test.ts` (`07`) |
| **P04A** | **Job queue and cron spine** *(inserted — the first draft built the worker at P29, seventeen phases after its first consumer)* | `src/lib/jobs/` (`enqueue`, `claim` via `FOR UPDATE SKIP LOCKED`, `progress_current/total`, `result`), `/api/cron/run-jobs`, the `idx_jobs_stuck` watchdog, `/admin/system/jobs`, `/api/cron/cleanup-sessions`, `vercel.json` with **all ten** cron entries registered (handlers may still be stubs that return `{ skipped: true }` and record a run) | P03, P03A | (a) an enqueued job is claimed, executed and recorded exactly once across two overlapping `/api/cron/run-jobs` invocations; (b) a killed invocation is requeued by the watchdog and resumes from `progress_current`, not from zero; (c) every cron route rejects a request lacking **both** `CRON_SECRET` and `x-vercel-cron` with 401; (d) a job that throws is recorded `failed` with its error in `jobs.result` and is visible at `/admin/system/jobs` — never lost; (e) `tests/unit/cron-registry.test.ts` (new) asserts the set of `src/app/api/cron/*/route.ts` directories equals the set of `vercel.json#crons[].path` entries **exactly** — neither an unregistered handler nor a registered path with no handler | `tests/integration/jobs-worker.test.ts` (new), `tests/api/auth-modes.test.ts` (new, §2.5), `tests/unit/cron-registry.test.ts` (new), `tests/unit/job-kinds.test.ts` (`11 §3.1`), `tests/unit/job-handlers-unprivileged.test.ts` (`11 §3.1`), `tests/api/jobs-redaction.test.ts` (`15 §2.4` — `payload.secret` is redacted by a field-name rule in the serializer, so it is a property of this phase's worker, not of any one job kind) |
| **P04** | Money and config primitives | `src/lib/money.ts` (the only `Intl.NumberFormat` in the codebase), `src/lib/pricing/money.ts` — `applyBp()`, `allocate()`, `roundHalfUp()` — `src/lib/config/env.ts` (Zod-parsed, the only `process.env` read), `src/types/page.ts`, `Result<T,E>` and the `01 §2.3`/`08 §1.4` error taxonomy | P01 | (a) `allocate()` postcondition `sum(result) === totalMinor` holds over a property sweep of 10 000 random `(total, weights)` pairs including negative totals and zero weights, **and the largest-remainder leftover goes to the lowest index first** — the signature is `allocate(totalMinor: bigint, weights: bigint[]): bigint[]` and carries no line numbers, because the *caller* passes entries in the order the tie-break should favour (order lines in `line_number` order; price components in the fixed order metal → making → stone → other); (b) `formatMoney` groups `₹1,00,000` and `$100,000` correctly; (c) importing `process.env` anywhere else fails lint | `tests/unit/money-allocate.test.ts`, `tests/unit/money-apply-bp.test.ts` (`04`), `tests/unit/format-money.test.ts`, `tests/unit/integration-keys.test.ts` (`11 §6` — it asserts every string passed to `integrationStatus()` is in `INTEGRATION_KEYS` and every member names its env vars, which is this phase's `src/lib/config/env.ts`) |

**Correction — there are ten crons, not nine.** `01 §5.6` tabulates nine
(`release-reservations`, `retry-webhooks`, `abandoned-carts`, `metal-rate-refresh`,
`low-stock-digest`, `run-jobs`, `reconcile-payments`, `sitemap-ping`,
`cleanup-sessions`). `04 §6` adds a tenth, **`/api/cron/pricing-rule-windows`,
`*/5 * * * *`**, and cites `01 §5.6` for it, which does not list it. Registering
nine is not a documentation slip: `pricing-rule-windows` is what purges
`market:{code}` when a time-windowed `pricing_rule` opens **and closes**, and
`04 §6` names the closing direction as the expensive one. Without it a sale that
ended at midnight keeps being served from the ISR cache until each entry's
`revalidate` lapses — the platform charging a discounted price the client has
withdrawn, in both currencies, with no error anywhere. `low-stock-digest` had no
owning phase at all and is assigned to **P19**; `pricing-rule-windows` to **P12**.
`tests/unit/cron-registry.test.ts` is what stops the next omission being found in
production.

#### M1 — Catalogue spine

| P | Phase | Builds | Depends on | Exit criteria | Verified by |
| --- | --- | --- | --- | --- | --- |
| **P05** | Schema II — catalogue | `products`, `product_variants`, `product_options`, `categories`, `stones`, `materials`, `tags`, `variant_materials`, `product_stones`, `product_categories`, `product_media`, `product_market_content`, `attributes`, `product_attribute_values`, `collections`, `collection_rules`, `collection_rule_values`, `product_collections`, `curated_facets`, `curated_facet_markets`, `seo_metadata`, `redirects`, **`product_market_sort`**; every `03 §9` schema addition — explicitly the six `products` scoring columns, `products.sold_at`, `products.ooak_quantity_override`, `product_variants.option_signature` (backfill migration first, unique index second), the three `sku_token` columns, the seven `attributes` validation columns and `collections.requires_sale_in_market` (`02 §7.13`); seeds `03-categories.ts`, `04-stones.ts`, `05-materials.ts` | P03 | (a) **nine seeded `categories` rows plus the `/stones` `navigation_items` row** (`02 §6`, `03 §7.1`, `08 §4.1`), seven stones and four materials exist with `is_published = false` and **empty description columns** — *(corrected: this criterion read "all ten launch categories … exist". `stones` is a reserved first route segment, so `saveCategory()` rejects the tenth row with `SlugTakenError` and a seed that creates it anyway bypasses its own writer; the tenth customer-facing menu entry is a `navigation_items` row of `link_type='url'` pointing at `/stones`. `tests/unit/reserved-slugs.test.ts` is what keeps the two lists from colliding again.)*; (a2) `product_market_sort` exists **before** any PLP renders — `02 §2.3`'s keyset rule has no stable sort value without it, so it is not an optimisation added later; (b) `idx_variants_ooak_single`, `chk_pav_one_value`, `idx_products_slug_live` exist and reject their negative cases; (c) the option and junction tables `02 §2.4` requires are present and were not silently skipped — `product_option_values`, `variant_option_values`, `attribute_options`, `product_tags` | `tests/db/constraints.test.ts`, `tests/db/drift.test.ts`, `tests/integration/category-tree.test.ts`, `tests/unit/reserved-slugs.test.ts` (`08 §4.1` — also a P30 gate; owned here because this is the phase whose seed it constrains) |
| **P06** | Media pipeline | `src/lib/media/{index,url,loader}.ts`, `/api/media/sign`, `/api/media/callback`, `media`, `media_folders`, **`media_tags`** *(`02 §7.13` assigns `media_tags` to P05; it cannot go there — it has an FK to `media`, which this phase creates. See the callout below the M1 table.)*, SVG sanitiser (`06 §7.10`), the nine fixed derivative widths, `next.config.ts` custom loader + `remotePatterns` | P02, P04 | (a) `buildImageUrl()` cannot emit a URL without `w_\d+`; (b) `image/gif` is rejected at `/api/media/sign` before a signature is issued; (c) with `CLOUDINARY_*` unset the admin shows *Media storage not configured* and upload is disabled — it does not throw | `tests/unit/media-url.test.ts`, `tests/integration/media-svg-upload.test.ts` (`06 §7.10`), `tests/integration/svg-sanitise.test.ts` (`07`) — *(corrected: the first draft's verifier was "manual upload of a `.tiff` and a hostile `.svg`". Both documents already name automated tests for exactly that; a hostile-SVG check that runs when someone remembers is not a control)* |
| **P07** | Catalogue service and product editor | `src/lib/catalog/` (`getProductForPdp`, `listCategoryProducts`, `saveProduct`, `setProductSlug`, `reindexProduct`), `src/server/actions/admin/product.ts`, `/admin/catalog/products/[id]` with all `03 §1.4` panels, the publish gate (`03 §1.5`), completeness and SEO scores (`03 §1.6`, `§1.7`) | P05, P06 | (a) a product can be created, published and slug-changed entirely through the admin; (b) a slug change on a published product writes a `redirects` row **in the same transaction**; (c) `saveProduct` with a stale `expectedVersion` returns `StaleWriteError` and writes nothing; (d) publishing a product failing the gate is refused with the named missing field; (e) an autosave payload is refused if it carries a server-authoritative column — price, inventory, `version`, `sold_at`, `is_demo` — rather than having it silently ignored | `tests/integration/product-save-concurrency.test.ts` (new), `tests/unit/actions-shape.test.ts`, `tests/unit/autosave-excludes.test.ts` (`03`), manual admin walkthrough |
| **P08** | Variant engine | `product_options`, option-value matrix generation (`03 §2.2`), per-variant SKU generator using `categories.sku_token` / `stones.sku_token` / `materials.sku_token`, impossible-combination masking (`03 §2.6`), `AvailabilityBand` including `'sold'` | P07 | (a) the `03 §2.7` worked example (sizes 5–9 × yellow/white 14K) generates exactly 10 variants with 10 distinct SKUs; (b) deleting one option value soft-deletes only its variants; (c) a one-of-a-kind product cannot be given a second variant — `idx_variants_ooak_single` rejects it | `tests/integration/variant-matrix.test.ts` (new), `tests/db/constraints.test.ts` |
| **P09** | Attributes (EAV) and facets | `attributes` / `attribute_options` / `product_attribute_values` admin, Zod validation per `data_type`, `getFacetCounts()`, the filter query shape from `03 §3.6` and its indexes | P07 | (a) a `select`-type attribute with 12 options filters a 5 000-product catalogue in **< 120 ms** at p95 on the seeded perf fixture — this is the `single-attribute` case of `catalog-filter.bench.ts`, *not* the `three-filter-PLP` case, whose budget is 200 ms (§2.10). *(Corrected: the first draft gave one bench file two different budgets — 120 ms here, 200 ms in §2.10 and in `R06`'s early-warning line. A bench with two thresholds has none: whichever is written first becomes the only one, and the other silently stops being a gate. Both cases are named, both are committed baselines.)*; (b) writing a `number` value into a `text` attribute is rejected by Zod before the insert; (c) facet counts equal a brute-force count over the same predicate | `tests/integration/attribute-filter.test.ts` (new) + `tests/perf/catalog-filter.bench.ts` (new, §2.10), `tests/integration/facet-market-activation.test.ts` (`03 §4.2` — `curated_facet_markets`: an unpriced market must not get an empty indexable facet page) |

> **RESOLVED — was CHANGE REQUIRED IN 02 §7.13:** the register's phase table puts `media_tags` in
> *Verified applied in 02.*
> **P05**. `media_tags` has an FK to `media`, and `media` is created by **P06** — a
> P05 migration declaring it fails at `CREATE TABLE`. It is owned by P06 above.
> Nothing else in that row moves.

> **RESOLVED — was CHANGE REQUIRED IN 02 §7.13:** the same table says `content_preview_tokens`
> *Verified applied in 02.*
> "belongs to the CMS phase". Its first writer is **P13**, which mints a
> `scope: 'market'` grant for `/admin/tools/market-preview` thirteen phases before
> P26, and `06 §4.4` made it the single preview mechanism for both scopes. It is
> owned by P13 below; the CMS phase consumes it rather than creating it.

#### M2 — Pricing and markets

| P | Phase | Builds | Depends on | Exit criteria | Verified by |
| --- | --- | --- | --- | --- | --- |
| **P10** | Schema III — pricing | `prices` (append-only, `valid_to`), `price_history`, `metal_rates`, `pricing_formulas`, `pricing_formula_versions`, **`pricing_formula_market_terms`**, `price_formula_bindings`, **`variant_component_costs`**, `recalc_runs`, `recalc_run_lines`, `pricing_rules`, `coupons`, `coupon_amounts`, `coupon_conditions`, `gift_cards`, `tax_rules`; **plus `02 §7.13`'s columns for this phase — the thirteen `prices` snapshot columns, `chk_prices_variant_level_formula`, `recalc_runs.failed_count` and the nine `recalc_run_lines` proposed columns** *(corrected: `pricing_formula_market_terms` and `variant_component_costs` were omitted, and the per-market floor and every component cost live in them — a P10 built from the old list ships a formula engine with no floor and no stone cost)*; composite FK `(market_code, currency_code) → markets`; `idx_prices_active`, `idx_prices_active_product` | P05 | (a) two active USD `prices` rows for one variant are rejected by `idx_prices_active`; (b) a `prices` row whose `currency_code` does not match its `market_code` is rejected by the composite FK; (c) `coupon_amounts` cannot hold a currency absent from `currencies`; (d) `metal_rates` is **empty** after the seed — a seeded rate is a fabricated business fact and would let P12's "a rate change moves nothing" test pass against a rate nobody entered | `tests/db/constraints.test.ts`, `tests/db/drift.test.ts`, `tests/integration/coupon-currency.test.ts` |
| **P11** | Pricing read path | `src/lib/pricing/` — `resolvePrice`, `resolvePriceBatch`, `getDisplayPrice`, `getProductPriceRanges`, `setManualPrice`; `/admin/pricing`; per-market price editors that write **one market per call** | P10, P04 | (a) editing USD leaves the INR `prices` row byte-identical; (b) `resolvePrice` never calls `evaluateFormula`; (c) no FX rate, conversion constant or multiplication between two currency amounts exists anywhere in `src/`; (d) `resolvePriceBatch` for 48 variants issues a **constant** number of queries — the `prices` read, the one scope query of `04 §3`, and the per-request-memoised `pricing_rules` read — and that number is **identical for 1, 48 and 200 lines**. *(Corrected: the first draft asserted "one query". `04 §3` specifies at least three, and pinning the wrong absolute number means the assertion is either deleted or weakened on first contact. The invariant that matters is that it does not grow with line count.)*; (e) `getDisplayPrice()` and `getProductPriceRanges()` return, for an anonymous shopper, exactly what `resolvePrice()` would charge — including live `pricing_rules`; (f) in a market with `markets.prices_include_tax = true`, `resolvePrice` returns the **gross, as-displayed** figure (`04 §8`) and performs no extraction — extraction happens once, in `src/lib/orders/` at P23 | `tests/unit/no-fx.test.ts`, `tests/unit/pricing-sole-authority.test.ts`, `tests/integration/pricing-batch-query-count.test.ts` (`04 §3` — already named there; not new), `tests/unit/display-equals-charged.test.ts` (`04 §1.1`), `tests/unit/market-snapshot.test.ts` (`04`), `tests/integration/display-price-group.test.ts` (`03`), `tests/integration/price-sort-consistency.test.ts` (`08`), `tests/unit/pricing-contract.test.ts` (`04 §1.3` — the canonical `ResolvedPrice` key set) |
| **P12** | Metal rates, formulas, recalculation | `src/lib/pricing/rates.ts` + `recalc.ts`, `evaluateFormula()`, `/admin/pricing/metal-rates`, `/admin/pricing/recalc-runs/[id]`, the `previewing → pending_approval → approved → applying → applied` machine, `recalc_apply` job, `/api/cron/metal-rate-refresh`, `/api/cron/pricing-rule-windows` | P11, **P04A** | (a) inserting a silver rate 30% higher changes **zero** `prices` rows, **zero** `price_history` rows and purges **zero** cache tags; (b) a market whose currency has no fresh rate produces `status='skipped'` lines, not estimated ones; (c) `applyRecalcRun` enqueues a `recalc_apply` job on the **P04A** queue and never applies inline — this is why P04A exists: with no worker, "enqueue" degrades to "apply inline, just for now", which is the hard-rule-6 violation `R03` is about; (d) an `applied` run has a non-null approver (`chk_recalc_approved`); (e) a manual price set on a formula-bound variant wins and is not overwritten by the next run | `tests/integration/rate-change-does-not-move-prices.test.ts`, `tests/unit/pricing-formula.test.ts`, `tests/integration/recalc-run.test.ts` (new), `tests/integration/manual-vs-binding.test.ts` (`04`), `tests/unit/price-change-reason-coverage.test.ts` (`04 §5.4`), `tests/e2e/scheduled-sale-boundary.spec.ts` (`04`) |
| **P13** | Market system and routing | `middleware.ts` market rewrite/redirect, `resolveMarket()` (no cookie parameter), `switchMarket()` server action, `md_market` cookie, market availability predicate (`04 §6.1`), **`content_preview_tokens`** with its `scope` discriminator, the `(preview)` route group — **nine route files, not eight** — and `/admin/tools/market-preview` minting a `scope: 'market'` grant (`06 §4.4` — **one preview mechanism, not two**: the `market-preview` JWT with `aud: 'market-preview'`, the `__mdpreview` middleware branch, `requirePreviewSession()` and `MARKET_PREVIEW_TOKEN_TTL_MINUTES` are **deleted**, not deferred, and are not built), `src/lib/edge/markets.ts` reading `src/generated/market-snapshot.json` with **no fetch** (`01 §1.4` — `/api/internal/market-snapshot` is not built either), `hreflang`/canonical emission, `getProviderForMarket()` as a **registry keyed on `markets.payment_provider_key`**, not a `switch` on `'US' \| 'IN'` | P03, P11 | (a) `/us/rings` 301s to `/rings`; (b) `/xx/rings` 404s; (c) no module under `src/app/**` reads `md_market` to price anything; (d) `tests/e2e/preview-isolation.spec.ts` covers **four** cases, each asserting `x-vercel-cache` is never `HIT`, the response carries `Cache-Control: private, no-store` and `X-Robots-Tag: noindex`, and a subsequent anonymous request for the corresponding **public** URL returns the published body with its cache object unreplaced: (i) `scope: 'market'` on an inactive market; (ii) `scope: 'entity'` on the **homepage**, the highest-value ISR object in the system and the one `99` names as untested; (iii) the `session` literal; (iv) an `entity` token against an inactive market, asserting 404 rather than a draft. *(Corrected: this criterion was asserted once and tested by `market-preview.spec.ts`, which walked the market path only; `06 §4.4`'s unification onto one route group makes it one spec over both scopes, so the spec is renamed and the file `e2e/market-preview.spec.ts` does not exist.)*; (d2) `src/lib/edge/**` contains no `fetch(`, and `src/generated/market-snapshot.json` matches its checksum; (e) **the third market is provable, not asserted**: `tests/integration/third-market.test.ts` (new) inserts a `GB`/`GBP` `markets` + `currencies` + `market_locations` + `order_counters` + `prices` set **through the admin service layer only**, then asserts `/gb/rings` resolves, prices render in £, `hreflang` gains a `en-GB` alternate, `getProviderForMarket('GB')` returns `null` cleanly rather than throwing, and **`git diff --stat src/` is empty**. `00 §1` requires UK/CA/AU/AE/EU without a rebuild; §4.3 asserted "rows only" with no mechanism, and an extensibility claim that is never executed is a claim that is false by the time anyone tries it | `tests/e2e/cache-leak.spec.ts`, `tests/e2e/preview-isolation.spec.ts` (new — replaces `e2e/market-preview.spec.ts`), `tests/e2e/cache-headers.spec.ts`, `tests/integration/third-market.test.ts` (new) |

#### M3 — Storefront read surface

| P | Phase | Builds | Depends on | Exit criteria | Verified by |
| --- | --- | --- | --- | --- | --- |
| **P14** | Design system and brand shell | Tailwind v4 token layer from the `00 §6` palette, the two type families, `src/components/ui/**`, header/footer shells, `public/brand/` wiring, focus/contrast primitives | P01 | (a) every palette value is a CSS custom property, zero hex literals in components; (b) AA contrast on all text/background token pairs, machine-checked; (c) the wordmark and monogram render from `public/brand/` — **or** the build fails loudly if absent, rather than substituting a text logo; (Z) **both `10 §9` review gates walked and signed** for every screen this phase produces — the premium-design test and the anti-pattern test, by a named person, recorded in the phase's PR description. Not automatable and not optional: `10 §9.1` item 7 ("could this be any other brand's site with the logo swapped?") is an automatic failure and no test in this document detects it, and for P14 it is walked over the header, the footer and the primitive gallery | `tests/unit/brand-assets.test.ts` (new — asserts the two files exist and are not zero-byte), `tests/unit/contrast.test.ts` (`10 §2.1` — new; pure-token APCA/WCAG cross-product, no browser), `tests/unit/background-tokens.test.ts` (`11 §7.7` — new; `tokens.css` ≡ `BACKGROUND_TOKENS` ≡ `chk_cms_sections_background_token`), axe contrast sweep in `tests/a11y/tokens.spec.ts` (new — rendered pages, and **not** a duplicate of `contrast.test.ts`: one checks the token table, the other checks the pairs components actually compose) |
| **P15** | Storefront routes | `/`, `/[market]` tree, `/products/[slug]`, category PLP, `/collections/[slug]`, `/stones/[slug]` and its per-type sub-listings, error and empty states (`08 §4.4`), ISR + tag strategy | P13, P14, P09 | (a) every route renders from the database with **zero** hardcoded product, category, price or copy strings; (b) a PDP for an unpublished product 404s; (c) `revalidateTag(tags.product(id))` after a save flips the live page within one request; (d) **zero horizontal overflow at all ten design widths of `10 §8.1`** on every route class this phase builds — `document.scrollingElement.scrollWidth <= clientWidth`, failure blocks the build; (Z) **both `10 §9` review gates walked and signed** for every screen this phase produces — the premium-design test and the anti-pattern test, by a named person, recorded in the phase's PR description. Not automatable and not optional: `10 §9.1` item 7 ("could this be any other brand's site with the logo swapped?") is an automatic failure and no test in this document detects it | `tests/unit/homepage-no-hardcode.test.ts`, `tests/e2e/storefront-smoke.spec.ts` (new, `@smoke`), `tests/e2e/no-horizontal-overflow.spec.ts` (`10 §8.1` — new), `tests/unit/state-copy-seeded.test.ts` (`08 §4.4` — every `<state_key>` has a `copy.state.*.headline` row) |
| **P16** | Collection rule engine | `buildRulePredicate()`, `refreshCollection()`, `refreshCollectionsForProduct()`, `idx_collection_rules_field_target`, the **two seeded automatic collections** of `08 §4.3` (*New arrivals*, *Best sellers*) and the **four launch rule sets** of `03 §6.6` (14K GOLD, LAB GROWN DIAMONDS, CLOSEOUTS, Labradorite Rings) as merchandiser-entered definitions, `CLOSEOUTS` as a rule set (`03 §8`), nightly `collection_refresh` job *(**ONE OF A KIND is not among them.** It is a `categories` row at `/one-of-a-kind` (`08 §4.2`, §4.3), not a collection: `03 §6.6` seeded a collection at `/collections/one-of-a-kind` and `10 §4.2` designed the page there, and `08 §4.3` refuses the second URL. The `is_one_of_a_kind` predicate still exists — it is `11 §8.3`'s filter field and the `sold` band's condition (`11 §7.1`) — it simply is not a collection rule set. `03 §6.6` has been corrected from five rule sets to four.)* Also builds **`src/lib/rules/predicate.ts`**, the shared three-parameter `buildRulePredicate(rules, match, resolve)` (`15 §1.1`); `src/lib/catalog/collections.ts` keeps the two-parameter form as a binding over `productFieldResolver`, so no call site changes | P09, P11 | (a) a manual pin (`source='manual'`) survives a rule refresh; (b) saving a product touches only the collections whose `collection_rules.field` it changed — asserted by query count; (c) `last_refreshed_at` older than 25 h renders a warning in `/admin/catalog/collections` | `tests/integration/collection-rules.test.ts` (new), `tests/integration/collection-incremental.test.ts` (new) |
| **P17** | Search, filtering, sorting | `SearchProvider` interface, the Postgres implementation, `search_queries` logging, predictive search, no-result handling, `/admin/marketing/search` controls | P15 | (a) `getSearchProvider()` is switchable by `SEARCH_PROVIDER` with no call-site change; (b) search results respect market availability; (c) every `list*` call is keyset-paginated and Zod-capped at 100; (d) sorting by price in a market uses that market's `prices` rows only and is stable across pages — a variant with no price in the market sorts out of the set, never to zero | `tests/integration/search.test.ts` (new), `tests/unit/api-money-shape.test.ts`, `tests/integration/price-sort-consistency.test.ts` (`08`), `tests/api/pagination.test.ts`, `tests/api/filtering.test.ts`, `tests/api/sorting.test.ts` |

#### M4 — Commerce engine

| P | Phase | Builds | Depends on | Exit criteria | Verified by |
| --- | --- | --- | --- | --- | --- |
| **P18** | Schema IV — inventory and commerce | `inventory_items`, `inventory_transactions`, `reservations`, `reservation_lines`, `carts`, `cart_items`, `checkout_sessions`, `orders`, `order_items`, `order_addresses`, `order_events`, `shipments`, `payments`, `payment_events`, `refunds`, `returns`, `return_items`, `webhook_events`, `coupon_usages`, `gift_card_transactions`, `addresses`, `wishlists`, `wishlist_items`, `customer_currency_totals` *(`customers` and `customer_groups` moved to **P03** — see the correction there)*; every composite FK and CHECK in `02 §5.1` | P10 | (a) `chk_inventory_no_oversell` rejects `reserved_quantity > on_hand_quantity`; (b) `uq_orders_id_money` composite FKs reject an `order_items` row in another currency; (c) `trg_orders_totals_match` fires at commit, not per statement; (d) `idx_webhook_events_event` and `idx_orders_idempotency_key` exist | `tests/db/constraints.test.ts`, `tests/db/cascades.test.ts` (new), `tests/db/deferred-constraints.test.ts` (new) |
| **P19** | Inventory | `src/lib/inventory/` — `getAvailability`, `reserveStock`, `releaseStock`, `commitStock`, `committed.ts`, `ledger.ts`, `locations.ts`; `/api/cron/release-reservations`; **`/api/cron/low-stock-digest`** *(the tenth-cron correction above: it had no owning phase)*; the **`reconcile_inventory` nightly job** under the `job_kind` value in `11 §3.1` (`systemPermitted: true`, `dedupeKey: 'kind'` — it runs with a `NULL` creator because no human enqueues it) — `reserved_quantity` vs `SUM(reservation_lines)`, `on_hand` vs the `inventory_transactions` ledger, reported into `jobs.result` and visible at `/admin/system/jobs` *(this job is `R01`'s early-warning signal and a §5 launch blocker; no phase built it)*; `/admin/inventory` | P18, P04A | (a) the two-transaction race test passes 200 consecutive runs with exactly one winner; (b) the ledger sums to the counter on a 1 000-movement fixture; (c) an expired reservation is released within one cron tick and the piece returns to sale; (d) `reconcile_inventory` run against a deliberately corrupted `reserved_quantity` reports the divergence and does **not** self-heal it — a counter silently rewritten is an oversell whose evidence was destroyed | `tests/integration/one-of-a-kind.test.ts`, `tests/integration/reservation-race.test.ts` (`07`), `tests/integration/inventory-ledger.test.ts`, `tests/integration/inventory-multi-location.test.ts`, `tests/integration/reconcile-inventory.test.ts` (new) |
| **P20** | Cart | `src/lib/cart/` — `getCart`, `addItem`, `updateItemQuantity`, `removeItem`, `mergeOnLogin`, `switchMarket`, `revalidate.ts`, `messages.ts`, `token.ts`; hashed cart token; `/cart` | P19, P11, **P13** *(`switchMarket` in the cart is meaningless before market resolution is path-only; the first draft omitted this edge)* | (a) a cart read never returns a cached price — `cached()` is lint-banned in `src/lib/cart/**`; (b) a market switch deletes and re-prices every line in one transaction and reports the drops; (c) merging a guest cart into a customer cart is an upsert, never an append; (d) a `cartId` in a request body is never a lookup key — the cart is resolved from the hashed `md_cart` cookie or the customer session, and a request carrying another visitor's cart id gets that visitor's *own* cart, not theirs; (e)**both `10 §9` review gates walked and signed** for every screen this phase produces — the premium-design test and the anti-pattern test, by a named person, recorded in the phase's PR description. Not automatable and not optional: `10 §9.1` item 7 ("could this be any other brand's site with the logo swapped?") is an automatic failure and no test in this document detects it, walked over `/cart` and the cart drawer | `tests/integration/cart-revalidate.test.ts`, `tests/integration/cart-merge.test.ts`, `tests/integration/market-switch-cart.spec.ts` |
| **P21** | Discounts and gift cards | `src/lib/discounts/` — `evaluateCoupon`, `evaluate.ts`, `stack.ts`, `conditions.ts`, `redeem.ts`; `src/lib/giftcards/`; `coupon_amounts` and per-currency minimum spends; `/admin/marketing/coupons` and `/admin/gift-cards` (`08 §5`) | P20 | (a) a fixed-amount coupon has an amount row per currency and **no** conversion path; (b) the stacking order in `05 §8.3` is executed in exactly that sequence and the result is deterministic; (c) the last unit of a capped coupon is won by exactly one of two concurrent redemptions; (d) every discount is applied to the **line total**, never per-unit-then-multiplied — the `05 §8` identities hold for a 3 × ₹999.99 line at 7% off | `tests/unit/discount-stack.test.ts`, `tests/unit/discount-identities.test.ts` (`04`), `tests/integration/coupon-cap-race.test.ts`, `tests/integration/coupon-currency.test.ts`, `tests/integration/gift-card-currency.test.ts`, `tests/integration/gift-card-race.test.ts` |
| **P22** | Shipping and tax | `src/lib/shipping/` — `quoteShipping`, `zones.ts`, `rates.ts`; `src/lib/tax/` — `quoteTax` with `provider_stripe_tax` (US) and `rules_table` (India, `tax_rules`); per-currency free-shipping thresholds; `order_addresses` US/India shapes and validation | P20 | (a) a free-shipping threshold is stored per currency and never converted; (b) tax is allocated with `allocate()`, never recomputed per line; (c) an unserviceable destination returns `ShippingUnavailableError` and blocks the step rather than defaulting to a rate; (d) **the tax-inclusive identity holds in a `prices_include_tax` market** — `order.total_minor` equals the sum of the gross figures the shopper was shown, to the minor unit, with the per-line tax *derived* from that gross and never re-added to it (`04 §8`, `05 §…`); a 3 × ₹999.99 line under 3% GST reproduces the worked example digit for digit; (e) `quoteTax` with **zero registered jurisdictions** returns a typed `TaxUnconfiguredError` and blocks checkout — it must never return `0` and let the order through. Stripe Tax with no registrations calculates zero tax on a live, signature-valid, entirely successful checkout; the defect is invisible at every layer except the client's first state notice | `tests/integration/shipping-quote.test.ts`, `tests/unit/money-allocate.test.ts`, `tests/integration/tax-allocation.test.ts` (new), `tests/integration/inclusive-tax-identity.test.ts` (`04`), `tests/integration/tax-inclusive-order.test.ts` (`05`), `tests/integration/tax-unregistered.test.ts` (new) |
| **P23** | Checkout, orders, payments | `src/lib/checkout/` (`stateMachine.ts`, `placeOrder.ts`, `session.ts`), `src/lib/orders/` (`stateMachine.ts`, `orderNumber.ts`, `snapshot.ts`, `timeline.ts`), `src/lib/payments/` (`providers/stripe.ts`, `providers/razorpay.ts`, `webhook.ts`, `reconcile.ts`), `/api/webhooks/stripe`, `/api/webhooks/razorpay`, `/api/cron/reconcile-payments`, `/api/cron/retry-webhooks` | P19, P21, P22 | (a) a full test-mode order completes in both markets; (b) a replayed webhook produces no second effect; (c) a tampered client total is ignored and the server total charged; (d) `orders.idempotency_key` makes a double-submit return the first order; (e) with no provider keys, checkout blocks with `PaymentsUnconfiguredError` and writes no order; (f) **the order-number series is gapless under contention and under rollback** — sixteen concurrent `placeOrder()` calls in one market produce sixteen consecutive `order_number` values with no gap and no duplicate, and an order whose transaction is deliberately rolled back after allocation leaves `order_counters.next_value` unadvanced. *(New. `02 §2.7` rejects a Postgres `SEQUENCE` precisely because it gaps on rollback, and §5's "gap-free per market on 100 **sequential** test orders" cannot detect that: a sequential run never rolls back and never contends, so a `SEQUENCE` implementation passes it. The Indian GST series is a statutory obligation and this is the only check that tests the property it claims to test.)*; (g) no network call is made while the `order_counters` row lock is held — asserted by a provider stub that fails the test if invoked inside the transaction (`02 §2.7`); (h) 3-D Secure / SCA challenge flows complete in both markets and a `requires_action` intent is not treated as paid; (i) **both `10 §9` review gates walked and signed** for every screen this phase produces — the premium-design test and the anti-pattern test, by a named person, recorded in the phase's PR description. Not automatable and not optional: `10 §9.1` item 7 ("could this be any other brand's site with the logo swapped?") is an automatic failure and no test in this document detects it, walked over the four checkout steps and the confirmation screen | `tests/integration/checkout-tamper.test.ts`, `tests/integration/order-idempotency.test.ts`, `tests/integration/order-number-gapless.test.ts` (new), `tests/integration/order-immutability.test.ts`, `tests/integration/order-expiry.test.ts` (`05`), `tests/integration/payment-retry.test.ts` (`05`), `tests/integration/made-to-order-checkout.test.ts` (`05`), `tests/integration/webhook-duplicate.test.ts`, `tests/integration/webhook-out-of-order.test.ts`, `tests/integration/webhook-late-success-on-cancelled.test.ts` (`05`), `tests/integration/zero-total-order.test.ts`, `tests/e2e/checkout-us.spec.ts`, `tests/e2e/checkout-in.spec.ts` |

#### M5 — Accounts and post-purchase

| P | Phase | Builds | Depends on | Exit criteria | Verified by |
| --- | --- | --- | --- | --- | --- |
| **P24** | Customer accounts and transactional email | `src/lib/customers/` (account, addresses, wishlist + share token, marketing consent), `/account/**`, `/orders/[token]`, Resend integration, the `07-email-templates.ts` keys, `/api/cron/abandoned-carts` | P23, P06 | (a) a guest checkout never attaches to a credentialled account; (b) every email renders from `email_templates` with token substitution and HTML-escaping; (c) with `RESEND_API_KEY` unset, mail is queued and the admin shows *Email not configured* — nothing is silently dropped; (d) **every row of `07 §4.2` is proved**: customer B is refused customer A's order, order-status poll, invoice, address, wishlist, shared-wishlist token, cart, profile and return request, each by id *and* by token, receiving a 404 or an empty set with none of A's data in the body. This is the phase where all seventeen surfaces first exist, and therefore the phase that owns the proof (see the P03A correction); (e) an email renders in the market's currency and locale and never quotes an amount from the other market; (f) **erasure is anonymisation** (`R24`): `anonymiseCustomer(customerId, tx, actor)` nulls or tokenises every PII column, replaces `orders.email` and `order_addresses` with a tombstone, and leaves every money column, `order_items` snapshot and invoice number byte-identical — a request that would delete an `orders` row is refused, because tax retention outlives any erasure right; (g)**both `10 §9` review gates walked and signed** for every screen this phase produces — the premium-design test and the anti-pattern test, by a named person, recorded in the phase's PR description. Not automatable and not optional: `10 §9.1` item 7 ("could this be any other brand's site with the logo swapped?") is an automatic failure and no test in this document detects it, walked over `/account/**`, `/orders/[token]` and the rendered transactional email layouts | `tests/unit/email-tokens.test.ts`, `tests/integration/erasure-anonymise.test.ts` (new), `tests/integration/guest-checkout-isolation.test.ts` (new), `tests/integration/email-market.test.ts` (`06`), `tests/e2e/idor.spec.ts` (`07 §4.2`), `tests/e2e/account.spec.ts` (new) |
| **P25** | Returns, refunds, reconciliation, draft orders | `src/lib/returns/`, `src/lib/payments/refund.ts`, draft orders and the payment-link seam (`05 §6`), `/admin/returns`, the nightly reconciliation surfaces | P23 | (a) two staff refunding the same payment concurrently cannot exceed `payments.captured_minor`; (b) a received return restocks exactly once; (c) `reconcile-payments` on a seeded divergence produces a flagged row and a Sentry `fatal`, not a silent pass; (d) a customer can open a return only against an order the ownership predicate matches, and staff return actions are permission-gated at the API; (e) a refund on a gift-card-funded order returns value to the **gift card**, per currency, and never as a card refund the provider never captured; (f) the nightly gift-card reconciliation (`consistency_check`) asserts `gift_cards.balance_minor = SUM(gift_card_transactions.amount_delta_minor)` per card and reports, never self-heals; (g) a payment-link draft order is addressed by an unguessable token, not by `orders.id` | `tests/integration/refund-overrefund.test.ts`, `tests/integration/return-restock.test.ts`, `tests/integration/return-authz.test.ts` (`05`), `tests/integration/refund-giftcard-only.test.ts` (`05`), `tests/integration/reconcile-payments.test.ts` (new) |

#### M6 — CMS and page builder

| P | Phase | Builds | Depends on | Exit criteria | Verified by |
| --- | --- | --- | --- | --- | --- |
| **P26** | CMS core and block registry | `cms_pages`, `cms_sections`, `cms_blocks`, `content_versions`; `src/lib/cms/pages.ts` (`getPublishedPage` / `getDraftPage` / `getVersionPage`), the block registry with one definition per block type, `<PageRenderer>`, the `PageSnapshot` type | P15 | (a) a published page render is **one** `content_versions` row read by primary key; (b) no snapshot contains a commerce key; (c) every registered block has a Zod schema, a default config, an editor form and a `sizes` value — a block missing any of the five fails the registry test; (d) a section or block restricted to a market is filtered at render, and a `scope: 'entity'` preview token scopes to the one page it was minted for, while a `scope: 'market'` token renders every draft in that one market and nothing in any other (`06 §4.4`) | `tests/unit/block-registry.test.ts`, `tests/integration/cms-snapshot-no-commerce.test.ts`, `tests/integration/cms-block-types.test.ts`, `tests/unit/cms-market-filter.test.ts` (`06`), `tests/integration/cms-rbac.test.ts` (`06`), `tests/e2e/preview-scope.spec.ts` (`06 §…`) |
| **P27** | Page builder, breakpoints, versions, autosave | Drag/drop ordering, per-breakpoint `config_tablet` / `config_mobile` sparse overrides rendered as CSS, draft/publish/schedule/archive machine, `publish_scheduled` job, version diff/restore/pin, autosave with `seq` + `expectedVersion` + `dirtyFields` | P26 | (a) two editors on one page: the second save is rejected with a conflict, never silently merged; (b) a scheduled publish fires from the job queue and purges the tag; (c) restoring a version that references a deleted media id degrades per `06 §5.5` instead of throwing; (d) three breakpoints produce one markup tree; (e) unpublishing a page stops serving it and purges its tag, and a section's `visible_from`/`visible_to` window is evaluated at render without a republish; (f) `applyBuilderOps` returns advisory `warnings` and **never refuses** for them — `checkRhythm()` flags two adjacent visible sections sharing a surface and a layout, and flags a page above `BUILDER_BLOCK_SOFT_CAP = 30` blocks (`06 §2.2`, closing `R07`'s "soft cap warning in the builder" and `10 §5.2`'s "the section builder warns the editor", neither of which previously had an implementation or a test) | `tests/unit/cms-rhythm.test.ts` (`06 §2.2` — new), `tests/e2e/cms-builder-warnings.spec.ts` (`06 §2.2` — new), `tests/integration/cms-concurrent-autosave.test.ts`, `tests/integration/cms-conflict-overwrite.test.ts`, `tests/integration/cms-scheduled-publish.test.ts` (`06`), `tests/integration/cms-section-window.test.ts` (`06`), `tests/integration/cms-unpublish.test.ts` (`06`), `tests/unit/block-config-flat.test.ts`, `tests/e2e/cms-autosave-recovery.spec.ts`, `tests/e2e/cms-cls.spec.ts`, `tests/e2e/cms-breakpoint-hide.spec.ts` (`06`), `tests/e2e/cms-responsive-limit.spec.ts` (`06`) |
| **P28** | Navigation, journal, email templates, homepage, redirects | `navigation_menus` + navigation items with nesting and mega menu, `journal_posts` with sanitised rich text, `/admin/content/redirects` incl. CSV import, the homepage as a page with nothing hardcoded | P27 | (a) a navigation cycle is refused at save time; (b) a redirect cycle is broken and chains flattened inside the slug-change transaction; (c) rich text is sanitised on write **and** on render; (d) the homepage contains zero hardcoded sections; (e) changing a page or product slug rewrites the navigation items that point at it inside the same transaction — a menu entry never survives as a 301 chain; (f) the seeded section list of `06 §11.2` renders in order with every copy field empty and no placeholder, grey box or lorem ipsum anywhere; (g) `applyBuilderOps` returns **zero** `warnings` for the seeded homepage — the arrangement satisfies `checkRhythm()` (`06 §2.2`), which is the worked example of `10 §5.2`'s rhythm rule; (h) **both `10 §9` review gates walked and signed** — the premium-design test and the anti-pattern test, by a named person, recorded in the phase's PR description. Not automatable and not optional: `10 §9.1` item 7 ("could this be any other brand's site with the logo swapped?") is an automatic failure and no test in this document detects it, walked over the seeded homepage | `tests/integration/nav-cycles.test.ts`, `tests/integration/nav-slug-change.test.ts` (`06`), `tests/integration/redirect-cycles.test.ts`, `tests/unit/richtext-sanitisation.test.ts`, `tests/unit/homepage-no-hardcode.test.ts` |

#### M7 — Operations, SEO, launch

| P | Phase | Builds | Depends on | Exit criteria | Verified by |
| --- | --- | --- | --- | --- | --- |
| **P29** | Admin operations at scale | *(the `jobs` worker and `/api/cron/run-jobs` are **P04A**'s and are not rebuilt here — the first draft listed them in both phases, and two phases owning one file is how the second one ships a divergent second worker)* **job kinds** `bulk_edit`, `import_apply`, `export`, `collection_refresh`, `consistency_check`, `reconcile_inventory`; bulk edit > 50 rows as a job, `saved_views`, CSV import preview + apply (`import_jobs`, `import_job_rows`), CSV/order export streaming to Cloudinary, `analytics_events` + `POST /api/analytics/[market]/collect` + consent, `/admin/system/{jobs,webhooks,audit-log}` | P23, P07, P04A | (a) no admin operation over 50 rows runs inside a request; (b) an import preview validates the first 500 rows and reports every error before a single write; (c) a bulk edit over an overlapping selection reports conflicted rows as skipped in `jobs.result` and completes, rather than aborting the whole job; (d) `POST /api/analytics/[market]/collect` — **the market is the path segment, validated against `listActiveMarkets()`**, never a body field and never inferred from `Referer` (`08 §2.2`, §7.2); the handler rejects a body naming a server-authoritative column — amount, currency, market, order id, price — rather than recording the client's version of it; (e) an export over 50 000 rows streams and never calls `findMany()` over the set; (f) a saved view can only sort by a field in the per-resource whitelist | `tests/integration/import-preview.test.ts` (new), `tests/integration/analytics-tamper.test.ts` (new), `tests/api/sorting.test.ts`, `tests/api/idempotency.test.ts` |
| **P29A** | Reporting module and dashboard | `src/lib/reporting/**` (fourteen files, `14 §1.2`); `product_daily_metrics` and `market_daily_metrics` with their indexes (`02 §7.11a`); the four reporting indexes of `14 §3.3`; `idx_carts_recovery`; the `cart_abandoned` event; `refreshRollups()` as the **`product_metrics_refresh`** handler — one kind, three tables, one `dedupeKey: 'kind'` (`11 §3.2`); the `/admin` tiles; the ten `/admin/reports/**` screens; the `reporting.*` settings rows. *(Inserted after P29 following the `P03A` / `P04A` precedent so no existing phase number moves. `99` disagreement 5 — there was no reporting layer at all, and the brief treats analytics as a business deliverable.)* | P29, P23, P18, P04A | (a) a report run at a fixed `now` with the market's clock at 23:30 local returns the **same window** as one run at 00:30 the next UTC day, and the two markets' "today" windows differ by their offset; (b) **no** exported function in `src/lib/reporting/` returns `ReportFigure<Money>` — the cross-currency aggregation ban is a type-level property, not a review habit; (c) a `catalog_manager` opening `/admin/reports/inventory-value` receives a response body containing **no `cost_minor` in any form** — asserted on the streamed HTML *and* the RSC payload, not on the rendered screen; (d) with `resend` unconfigured the abandoned-cart recovery rate renders `—` plus the skipped-send count, **never `0%`** (hard rule 7); (e) `refreshRollups()` run twice over the same days produces **byte-identical** table contents; (f) a US spring-forward day renders **23** hourly buckets and an autumn fall-back day **25**, with labels matching the bucket keys | `tests/unit/reporting-timezone.test.ts`, `tests/unit/reporting-no-cross-currency.test.ts`, `tests/unit/reporting-cost-isolation.test.ts`, `tests/unit/reporting-source-mix.test.ts`, `tests/unit/reporting-half-open.test.ts`, `tests/unit/reporting-boundaries.test.ts`, `tests/integration/reporting-rollup-idempotent.test.ts`, `tests/integration/reporting-rbac.test.ts`, `tests/integration/export-cost-columns.test.ts`, `tests/e2e/dashboard-unconfigured.spec.ts` |
| **P30** | SEO, performance, security, launch readiness | `src/lib/seo/` (`buildMetadata`, `buildJsonLd`, `buildCanonical`, `buildAlternates`, `enumerateSitemap`), sitemap shards + `/api/cron/sitemap-ping`, robots per environment, product feeds, CSP and security headers in `next.config.ts#headers()`, Sentry, rate limiting, `docs/runbooks/` | all | §5 Definition of Done, signed line by line; and specifically (a) the header set is asserted per surface — storefront, checkout, admin — not once on the homepage; (b) no public route response body contains a column outside its documented projection; (c) `tests/setup/pending.json` is **empty** — every test file commissioned anywhere in `01`–`11` exists on disk | `tests/unit/jsonld-truth.test.ts`, `tests/unit/reserved-slugs.test.ts`, `tests/integration/no-demo-in-production.test.ts`, `tests/e2e/security-headers.spec.ts` (`07 §E7`), `tests/e2e/xss.spec.ts` (`07 §E2`), `tests/e2e/public-api-leak.spec.ts` (`07`), full E2E suite, Lighthouse CI budget |

---

### 1.3 Dependencies: what is a hard blocker, what runs in parallel

**Hard blockers — nothing downstream is worth writing until these are true:**

| Blocker | Why it blocks | What breaks if ignored |
| --- | --- | --- |
| **P02** before any schema work | `migrate deploy` through a pooled URL hangs on advisory locks | Forty tables migrated by hand, and a first production migration that hangs |
| **P04** before P10–P23 | `allocate()` is a precondition of `chk_orders_total` | Orders that fail `INSERT` in week one (`02 §1.10`) |
| **P10** before P11–P23 | the `(market_code, currency_code)` composite FK is what makes cross-market contamination impossible | A USD amount stored under an INR order, discovered by a customer |
| **P18** before P19–P25 | `chk_inventory_no_oversell` and the order composite FKs are the floor under every service | Two customers owning one piece |
| **P19** before P20/P23 | reservation semantics decide what a cart line means | A checkout that reserves nothing and oversells silently |
| **P26** before P27/P28 | the snapshot decision (`06 §1.2`) determines every read path in the CMS | Shadow draft tables, then a rewrite |
| **P13** before P15 **and P20** | market resolution must be path-only before a single page is cached, and before a cart can be switched between markets | ₹ prices baked into a US CDN object for 900 s; a `switchMarket` written against a cookie |
| **P03A** before P07 | nothing can mint a staff session, so "created entirely through the admin" is untestable | An admin built with authentication stubbed, then retrofitted |
| **P04A** before P12, P27, P29 | recalc apply, scheduled publish and bulk edit are all *enqueue* operations | "Enqueue" degrades to "apply inline, just for now" — the hard-rule-6 violation `R03` exists to prevent |
| **P21** before P23 | `05 §8.3`'s stacking order determines what `order_items.discount_breakdown` must snapshot | Checkout written against a discount shape that changes under it |

**Genuine parallelism.** With one developer and an AI pair the practical pattern
is *one deep phase plus one shallow phase*, not two deep phases:

| Can run alongside | Notes |
| --- | --- |
| **P06** with P05 | Media touches no catalogue table; only `product_media` joins them |
| **P14** with P05–P09 | The design system depends on tokens, not on data. Start it early so P15 is assembly, not invention |
| **P17** with P16 | Search reads the same tables collections write; neither writes the other's |
| **P24** with P25 | Both sit behind P23 and touch disjoint services |
| **P28** with P29 | Content operations and admin operations share only `jobs` |
| **P30's SEO work** with M6 | `buildMetadata` needs routes, not content |
| **§1.7 external track** with everything | Started on day 0, not when it becomes blocking |

**Must be strictly serial:** P18 → P19 → P20 → P23. Every one of them changes the
meaning of the row the next one locks. Overlapping them is how a reservation
counter and a ledger stop reconciling.

---

### 1.4 The critical path

```
P01 → P02 → P03 → P03A → P04A → P05 → P07 → P10 → P11 → P13 → P18 → P19 → P20 → P21 → P23 → P30
                    ↑
P01 → P04 ──────────┘   (P04 blocks P10–P23 per §1.3; allocate() is a precondition
                         of chk_orders_total, so it is on the spine, not beside it)
                                                           P20 → P22 ──┐
                                                                       ├→ P23
                                                           P20 → P21 ──┘
```

Seventeen of thirty-two phases (the sixteen on the main line plus `P04` on the
branch). *(Corrected: the first draft's path was
`P01 → P02 → P03 → P05 → P07 → P10 → P11 → P18 → P19 → P20 → P22 → P23 → P30` and
called it "thirteen of thirty". It omitted **P04**, which §1.3 immediately below
lists as a hard blocker for P10–P23; **P03A**, without which P07's exit criterion
is unreachable — the revision note at the top of this document says so in as many
words; **P04A**, which P12, P27 and P29 all enqueue onto; and **P21**, which P23
depends on directly. Telling the reader that everything off the spine "can slip
without moving the launch date" was, for P21, false: discounts and gift cards
block checkout. A critical path that contradicts the dependency table on the next
line is worse than no critical path, because it is the one an engineer schedules
from.)*

Everything genuinely off the spine — media, design system, attributes,
collections, search, CMS, accounts, returns, admin ops — can slip without moving
the launch date, **provided** the spine does not.

Both of P23's predecessors (P21 and P22) are the same length from P20, so neither
is slack. Compressing M4 means compressing both.

Two observations that matter more than the list:

1. **P23 is the convergence point.** Checkout is the only phase that depends on
   inventory, pricing, discounts, shipping, tax, market and payments
   simultaneously. Every shortcut taken in P10–P22 is paid for here, at the point
   where the failure mode is a charged card and no order.
2. **P30 is not a phase you start at the end.** Its SEO, CSP and observability
   work is written incrementally from P15 onward; what is reserved for the end is
   only the *verification* in §5.

---

### 1.5 Where a mistake is most expensive to discover late

Ranked by cost-of-late-discovery, not by difficulty.

| Rank | Phase | The mistake | Why late discovery is catastrophic | Bought down by |
| ---: | --- | --- | --- | --- |
| 1 | **P10 / P11** | A single FX conversion, a shared price row, or an amount summed across currencies | It is not a bug you fix — it is a data-correction project across `prices`, `price_history`, `order_items` and every report. Historical rows are immutable by design, so the wrong numbers are permanent | `tests/unit/no-fx.test.ts` on day one of P11; the composite FK in P10 makes the wrong row unwritable |
| 2 | **P18 / P19** | Reserving outside a transaction, or trusting a counter without the row lock | Two customers own one unique piece. There is no technical remedy — only a refund, an apology, and a permanent reputational cost on a 40-year-old brand | `tests/integration/one-of-a-kind.test.ts` run 200× in CI (§2.3); `chk_inventory_no_oversell` as the floor |
| 3 | **P04** | Rounding per line instead of allocating residue | `chk_orders_total` rejects the order at `INSERT`. It will *look* like a checkout outage, at the worst possible moment, and the cause is three files away | Property-based `allocate()` sweep in P04, before any commerce code exists |
| 4 | **P12** | Evaluating the formula on the read path | Every silver tick silently re-prices the live catalogue. The client discovers it from a customer, not from us. Directly violates hard rule 6 | `rate-change-does-not-move-prices.test.ts`; `rates.ts` physically not importing the price writers |
| 5 | **P13** | Resolving market from the cookie inside the cached app tree | ₹ prices served from the CDN to US visitors for the full ISR window, and Googlebot indexing them | `resolveMarket()` has no cookie parameter *by construction*; `tests/e2e/cache-leak.spec.ts` |
| 6 | **P23** | A webhook handler without insert-first de-duplication | Double stock commits, double confirmation emails, double refunds — each one a customer-visible incident | `UNIQUE (provider, provider_event_id)`, `webhook-duplicate.test.ts` |
| 7 | **P05 / P07** | Hard-deleting products or updating `prices` in place | Historical orders change retroactively; invoices stop matching card statements | `ON DELETE RESTRICT` everywhere into `orders`; `order-immutability.test.ts` |
| 8 | **P26** | Choosing live-join rendering over the published snapshot | A shadow-draft table for every CMS row, and a rewrite of the entire CMS read path | The decision is already made in `06 §1.2`; the cost is only in *deviating* from it |
| 9 | **P22** | `quoteTax` returning `0` when the provider has no registrations, instead of refusing | Nothing errors. Every US order is correct in every visible respect and under-collects tax; the discovery event is a state notice months later, and the liability is the client's, on orders already shipped and already refundable only at a loss | `TaxUnconfiguredError` at P22 (e); the nightly zero-tax-on-taxable-destination check; `R23a` |
| 10 | **P23** | Implementing the order number as a Postgres `SEQUENCE` because it is simpler and lock-free | Gapped GST invoice series, which is a statutory defect in India and is unfixable retroactively — the gaps are in numbers already issued to customers | `02 §2.7` decided `SELECT … FOR UPDATE` on `order_counters`; `order-number-gapless.test.ts` tests it under contention *and* rollback, which the first draft's sequential check could not |

---

### 1.6 Effort shape for one developer with an AI pair

| Milestone | Shape | Where the time actually goes |
| --- | --- | --- |
| M0 (13) | Short, dense, and **twice the size the first draft claimed** | Configuration and proving CI rejects the right things — plus the whole of `07` (`P03A`) and the job queue (`P04A`). The first draft carried `M0 (6)` here after §1.1 had already restated it as 13 and explained why; planning from this table under-budgeted the milestone by half |
| M1 (14) | Long, broad, shallow | Thirty-odd admin fields, ten panels, one editor. High volume, low risk. Ideal AI-pair work — the risk is reviewer fatigue, not difficulty |
| M2 (16) | Short, deep, dangerous | Small surface, highest consequence-per-line in the project. Budget review time, not typing time |
| M3 (15) | Long, visual | Design judgement dominates. Blocked on brand vectors (`R14`) for the header/favicon/OG surface, not for layout |
| M4 (24) | Long, deep, serial | The one milestone that cannot be parallelised or compressed. Concurrency tests are slow to write and slower to trust |
| M5 (9) | Medium | Mostly composition of M4 primitives |
| M6 (16) | Long, deceptively deep | The page builder is three products in one: an editor, a renderer, a version store. Consistently underestimated |
| M7 (12) | Medium, fragmented | Many small correct things, each cheap, none skippable |

The two milestones most likely to overrun are **M4** (irreducible depth) and
**M6** (misjudged as CRUD). The two most likely to be *cut* under pressure are
M5 and parts of M7 — and §5 exists to record which of those cuts are legitimate.

---

### 1.7 The external track — start on day 0

None of these are engineering work, all of them have lead times measured in
weeks, and each one blocks a specific phase. They are listed as a phase-zero
checklist because discovering a KYC delay during P23 costs the whole M4 buffer.

| Item | Blocks | Typical lead time |
| --- | --- | --- |
| Stripe account + US business verification + live keys | P23 live keys (test keys unblock the build) | days–weeks |
| Razorpay account + India KYC + live keys | P23 live keys for the India market | often the longest single item |
| Domain registration + DNS delegation to Vercel | P30, and every absolute URL in SEO/email | days |
| Resend domain verification (SPF/DKIM/DMARC on `send.<domain>`) | P24 real email delivery | days, plus 2 weeks of `p=none` before tightening |
| Vercel Pro + Neon paid plan | P02 (branch-per-PR), P29 (`maxDuration: 300`), every `*/5` cron | hours, once billing ownership is decided |
| Cloudinary account | P06 | hours |
| Brand vector files | P14 | client-dependent |
| Real catalogue content and photography | M3 sign-off, §5 | client-dependent, and the single largest schedule unknown |
| Metal-rate data source decision | P12 cron (manual entry is a supported launch state) | client-dependent |
| **US sales-tax registrations** — the list of states the client is registered in, entered into Stripe Tax | **P22 and §5.** Not P23: Stripe Tax with zero registrations returns **zero tax** on a completely successful checkout | weeks per state, and it is the client's accountant's call, not ours |
| **India GST position** — GSTIN, HSN code per category, and **whether displayed INR prices are GST-inclusive** | P22, and `markets.prices_include_tax` for `IN`, which changes what every Indian shopper sees on every page | weeks; the inclusive/exclusive answer must land **before** P11, not before P22 |
| **3-D Secure / SCA posture** — whether US card payments are challenged, and the India mandate | P23 (h), and the chargeback exposure in `R23` | days, once the provider accounts exist |

> **NEEDS INPUT:** which of these accounts the client owns versus the agency,
> and who pays. This is the same decision as `01 §5.1`'s callout and it gates
> the handover runbook as well as the schedule.

> **NEEDS INPUT:** the three tax and payments rows above are new to this revision.
> They were absent from the first draft's external track even though `04 §8.5`
> already flags them, and their absence is not symmetrical with the others: a late
> Razorpay KYC delays a market, but a missing set of US tax registrations does not
> *block* anything — it lets the platform launch, take real money and under-collect
> tax on every US order, with the liability accruing silently to a 40-year-old
> business until a state notice arrives. It is the one item on this list whose
> failure mode is invisible. `chk_import_jobs_price_market`-style structure cannot
> help; only the answer can.

---

## 2. Testing architecture

### 2.1 The pyramid, and what each layer is for

| Layer | Runner | Count at launch (target) | Runtime budget | Database | Runs |
| --- | --- | ---: | --- | --- | --- |
| **Unit** | Vitest, `tests/unit/**` | ~320 | < 20 s total | none | every commit |
| **Database** | Vitest, `tests/db/**` | ~70 | < 60 s | real, the worker's own schema (§2.8) | every commit |
| **Integration** | Vitest, `tests/integration/**` | ~120 | < 6 min | real, schema per worker | every commit |
| **API** | Vitest, `tests/api/**` | ~80 | < 2 min | real | every commit |
| **E2E** | Playwright, `tests/e2e/**` | ~38 (12 tagged `@smoke`) | `@smoke` < 5 min; full < 20 min | preview DB | `@smoke` per commit; full nightly + pre-release |
| **Performance** | Vitest bench + Lighthouse CI, `tests/perf/**` | ~10 | — | perf fixture | nightly |
| **Accessibility** | Playwright + axe, `tests/a11y/**` | ~12 | < 4 min | preview DB | nightly + pre-release |

The shape is deliberately **bottom-heavy with a thick integration band**. This
platform's expensive failures are not rendering failures; they are transactional
ones — two writers, one row. Those are invisible to unit tests and prohibitively
slow to reproduce in a browser. The integration band is where this codebase earns
its correctness.

**Coverage policy.** A global percentage target is not enforced, because it
rewards testing getters. Instead, `vitest.config.ts` sets per-directory
thresholds and CI fails below them:

```ts
coverage: {
  thresholds: {
    'src/lib/pricing/**':   { statements: 95, branches: 90 },
    'src/lib/inventory/**': { statements: 95, branches: 90 },
    'src/lib/discounts/**': { statements: 95, branches: 90 },
    'src/lib/giftcards/**': { statements: 95, branches: 90 },   // added
    'src/lib/tax/**':       { statements: 95, branches: 90 },   // added
    'src/lib/checkout/**':  { statements: 90, branches: 85 },
    'src/lib/orders/**':    { statements: 90, branches: 85 },
    'src/lib/payments/**':  { statements: 90, branches: 85 },
    'src/lib/cart/**':      { statements: 90, branches: 85 },   // added
    'src/lib/shipping/**':  { statements: 90, branches: 85 },   // added
    'src/lib/auth/**':      { statements: 95, branches: 90 },   // added
    'src/lib/rbac/**':      { statements: 100, branches: 100 },
    'src/**':               { statements: 60 },
  },
}
```

`src/lib/rbac/**` is 100% because a permission branch that is never exercised is
a permission that has never been proven to deny.

The five added directories were previously covered only by the global 60% floor.
That floor is the wrong instrument for them: `giftcards` and `tax` decide how much
money changes hands, `cart` and `shipping` decide what the customer is quoted, and
`auth` decides who they are. Sixty percent of an auth module is a module with two
in five branches never executed, in the one place where an unexecuted branch is
an unauthenticated path.

---

### 2.2 Unit tests — the pure functions that carry the risk

Every function below is pure: no database, no clock (`at` is always passed in),
no environment. That is what makes exhaustive and property-based testing
affordable.

| Function | File | Test file | What must be proven |
| --- | --- | --- | --- |
| `applyBp(amountMinor: bigint, bp: number): bigint` | `src/lib/pricing/money.ts` | `tests/unit/money-apply-bp.test.ts` *(the name `04` already fixed; the first draft folded it into `money-allocate.test.ts` and left `04`'s file unwritten)* | Half-up at exactly `.5`; no intermediate rounding; `bigint` throughout; `bp = 0` and `bp = 10000` identities |
| `allocate(totalMinor: bigint, weights: bigint[]): bigint[]` | same | same | Property sweep ≥ 10 000 cases: `sum(result) === totalMinor` always; largest-remainder distribution; **ties broken by the lowest index** (`02` §1.10 rule 3 — the caller orders the array; the sweep asserts the tie-break is stable under permutation of equal weights); all-zero weights; single line; 100 lines; `totalMinor = 0`; negative total (a refund allocation) |
| `evaluateFormula(input: FormulaInputs): FormulaResult` | `src/lib/pricing/formula.ts` | `tests/unit/pricing-formula.test.ts` | The `02 §1.10` rule 2 expression evaluated entirely in `bigint`; one rounding at the end; the six components returned match the product; purity in basis points and weight in milligrams converted at the edge; a zero or missing rate returns a typed error rather than `0`; the worked examples in `04 §9.3` and `§9.4` reproduce **exactly**, digit for digit |
| `formatMoney(minor: bigint, currency: CurrencyCode, locale: string): string` | `src/lib/money.ts` | `tests/unit/format-money.test.ts` | `₹1,00,000.00` under `en-IN` and `$100,000.00` under `en-US`; `minor_unit = 0` currency path; no `Number()` anywhere in the call chain |
| `resolvePrice` mode selection | `src/lib/pricing/resolve.ts` | `tests/unit/pricing-sole-authority.test.ts` | The `04 §1.4` resolution order is followed for `manual` / `metal_linked` / `hybrid` × `US` / `IN`; `evaluateFormula` is **never** reached; a market with no active `prices` row yields `PriceUnavailableError`, never a fallback to the other market |
| FX absence | (whole tree) | `tests/unit/no-fx.test.ts` | AST scan: no multiplication or division between two identifiers ending `Minor` with differing currency provenance; no literal resembling an exchange rate; no import of any FX library |
| `evaluateDiscounts` / `stackDiscounts` | `src/lib/discounts/evaluate.ts`, `stack.ts` | `tests/unit/discount-stack.test.ts`, `tests/unit/discount-identities.test.ts` (`04`) | Discounts applied to the **line total**, never per-unit-then-multiplied — `line_subtotal_minor = unit_final_minor * quantity` and the `05 §8` identities hold simultaneously for quantities 1, 3 and 7; the `05 §8.3` order executed exactly; automatic-then-coupon precedence; `allow_stacking = false` short-circuits; percentage and fixed on the same cart; a fixed coupon whose `coupon_amounts` row is missing for this currency is **invalid**, not zero; expired/not-yet-started windows; result deterministic under input reordering |
| `computeAvailable(item: InventoryItem, safety: number): number` | `src/lib/inventory/availability.ts` | `tests/unit/availability.test.ts` (new) | `on_hand - reserved - safety`, floored at 0; one-of-a-kind with `ooak_quantity_override`; the `AvailabilityBand` mapping including `'sold'`; never negative, never `NaN` |
| `buildRulePredicate(rules, match)` | `src/lib/catalog/collections.ts` | `tests/unit/collection-rules.test.ts` (new) | Each operator including `not_contains`; `all` vs `any`; multi-value `in` from `collection_rule_values`; a `price` or `is_on_sale` rule without `value_market_code` is a build-time error, not a silent cross-market match; emitted SQL is parameterised — a rule value containing `'; DROP` produces a bind parameter |
| `requirePermission(actor, key)` / `can(actor, key)` | `src/lib/rbac/index.ts` | `tests/unit/rbac-catalogue.test.ts`, `tests/unit/actions-authorized.test.ts` | Every one of the seven seeded roles × every `permissions.key`, asserted against the matrix as a full table — not spot-checked; an unknown key **throws** rather than defaulting to allow; `owner` is not special-cased in code (it holds every row) |
| `revalidateCartLine(line, resolved)` | `src/lib/cart/revalidate.ts` | `tests/unit/cart-revalidate-pure.test.ts` (new) | The decision table of `05 §2.4` — price moved, product unpublished, variant gone, no price in market, quantity now unavailable — each producing exactly one `messages.ts` key, with zero price tolerance |
| `transitionOrder` / checkout machine | `src/lib/orders/stateMachine.ts`, `src/lib/checkout/stateMachine.ts` | `tests/unit/order-state-machine.test.ts`, `tests/unit/checkout-state-machine.test.ts` | Every legal transition allowed, every illegal one raising `IllegalTransitionError`, exhaustively over the full status × status matrix — not a sample |
| `buildImageUrl` | `src/lib/media/url.ts` | `tests/unit/media-url.test.ts` | Every output matches `/\/w_\d+[,/]/`; no code path omits the transform |
| Block registry completeness | `src/lib/cms/registry.ts` | `tests/unit/block-registry.test.ts`, `tests/unit/block-config-flat.test.ts` | Every block has schema + default + editor + renderer + `sizes`; `config` is flat (no nested breakpoint objects) |
| Rich-text sanitisation | `src/lib/cms/richtext.ts` | `tests/unit/richtext-sanitisation.test.ts` | A corpus of XSS payloads neutralised on write **and** on render |
| Structured-data truthfulness | `src/lib/seo/jsonld.ts` | `tests/unit/jsonld-truth.test.ts` | No JSON-LD field is emitted from a hardcoded string; `aggregateRating` absent when there are no reviews; `priceCurrency` always equals the rendered market's currency |
| Reserved slugs | `src/lib/catalog/slug.ts` | `tests/unit/reserved-slugs.test.ts` | Every reserved segment in `08 §4.1` is refused as a product/category/collection slug |

---

### 2.3 Integration tests — real database, real transactions

These run against a real Postgres with real migrations applied. No mocks below
the service boundary; the payment **provider** is the only thing stubbed, and it
is stubbed at the `PaymentProvider` interface, not at `fetch`.

#### Flows that must be covered

| Flow | Test file |
| --- | --- |
| Product save → child diffs → reindex → collection refresh → redirect on slug change, all in one transaction | `tests/integration/product-save-concurrency.test.ts` (new) |
| Category tree re-parent and `materialized_path` consistency | `tests/integration/category-tree.test.ts` |
| Variant matrix generation and SKU uniqueness | `tests/integration/variant-matrix.test.ts` (new) |
| Attribute filter correctness vs a brute-force predicate | `tests/integration/attribute-filter.test.ts` (new) |
| Collection rule evaluation, incremental refresh, manual-pin survival | `tests/integration/collection-rules.test.ts`, `collection-incremental.test.ts` (new) |
| A metal-rate insert moving nothing | `tests/integration/rate-change-does-not-move-prices.test.ts` |
| Recalc preview → approve → apply, and a skipped market | `tests/integration/recalc-run.test.ts` (new) |
| Every price write producing a `price_history` row | `tests/integration/price-history-completeness.test.ts` |
| Cart revalidation on every read | `tests/integration/cart-revalidate.test.ts` |
| Guest → customer cart merge as an upsert | `tests/integration/cart-merge.test.ts` |
| Market switch rebuilding the bag | `tests/integration/market-switch-cart.spec.ts` |
| Inventory ledger reconciling to the counter | `tests/integration/inventory-ledger.test.ts` |
| Multi-location availability with one active location | `tests/integration/inventory-multi-location.test.ts` |
| A tampered client total being ignored | `tests/integration/checkout-tamper.test.ts` |
| Order idempotency key returning the first order | `tests/integration/order-idempotency.test.ts` |
| Order immutability under later price edits and product soft-delete | `tests/integration/order-immutability.test.ts` |
| A 100%-discount / gift-card-covered order | `tests/integration/zero-total-order.test.ts` |
| Webhook duplicate and out-of-order delivery | `tests/integration/webhook-duplicate.test.ts`, `webhook-out-of-order.test.ts` |
| A late `succeeded` webhook arriving on a cancelled or expired order | `tests/integration/webhook-late-success-on-cancelled.test.ts` (`05`) |
| A retried payment attempt against the same order | `tests/integration/payment-retry.test.ts` (`05`) |
| An order expiring with its reservation released | `tests/integration/order-expiry.test.ts` (`05`) |
| A made-to-order line checking out without a stock row | `tests/integration/made-to-order-checkout.test.ts` (`05`) |
| Order-number series gapless under contention **and** under rollback | `tests/integration/order-number-gapless.test.ts` (new) |
| Shipping quote per market and threshold | `tests/integration/shipping-quote.test.ts` |
| Tax allocated, not recomputed | `tests/integration/tax-allocation.test.ts` (new) |
| Tax-inclusive market: gross identity preserved end to end | `tests/integration/inclusive-tax-identity.test.ts` (`04`), `tests/integration/tax-inclusive-order.test.ts` (`05`) |
| `quoteTax` with zero registered jurisdictions blocking, not returning zero | `tests/integration/tax-unregistered.test.ts` (new) |
| Refund cap across concurrent refunds | `tests/integration/refund-overrefund.test.ts` |
| A gift-card-funded order refunded back to the card, not to the provider | `tests/integration/refund-giftcard-only.test.ts` (`05`) |
| Return receipt restocking once | `tests/integration/return-restock.test.ts` |
| A return opened only against an order the requester owns | `tests/integration/return-authz.test.ts` (`05`) |
| `audit_logs` rows refusing UPDATE and DELETE at the grant level | `tests/integration/audit-immutable.test.ts` (`07`) |
| Parameterised-query proof: a hostile filter, sort and rule value | `tests/integration/injection.test.ts` (`07`) |
| A third market (`GB`/`GBP`) added by rows with an empty `git diff src/` | `tests/integration/third-market.test.ts` (new) |
| Nightly inventory and gift-card reconciliation reporting, never self-healing | `tests/integration/reconcile-inventory.test.ts` (new) |
| CMS scheduled publish, section window, unpublish, market filter, RBAC | `tests/integration/cms-scheduled-publish.test.ts`, `cms-section-window.test.ts`, `cms-unpublish.test.ts`, `cms-rbac.test.ts` (all `06`) |
| A navigation item following the slug it points at, in one transaction | `tests/integration/nav-slug-change.test.ts` (`06`) |
| Transactional email rendering in the order's own market and currency | `tests/integration/email-market.test.ts` (`06`) |
| SVG upload and sanitisation on a hostile file | `tests/integration/media-svg-upload.test.ts` (`06`), `tests/integration/svg-sanitise.test.ts` (`07`) |
| A `from`-price group and a price sort agreeing on the same market's rows | `tests/integration/display-price-group.test.ts` (`03`), `tests/integration/price-sort-consistency.test.ts` (`08`) |
| Reconciliation detecting a seeded divergence | `tests/integration/reconcile-payments.test.ts` (new) |
| Guest checkout not attaching to a credentialled account | `tests/integration/guest-checkout-isolation.test.ts` (new) |
| CMS snapshot containing no commerce data | `tests/integration/cms-snapshot-no-commerce.test.ts` |
| Every block type round-tripping through publish and restore | `tests/integration/cms-block-types.test.ts` |
| Navigation and redirect cycles | `tests/integration/nav-cycles.test.ts`, `redirect-cycles.test.ts` |
| CSV import preview reporting every error before any write | `tests/integration/import-preview.test.ts` (new) |
| Job claim under two overlapping workers (`SKIP LOCKED`) | `tests/integration/jobs-worker.test.ts` (new) |
| `POST /api/analytics/[market]/collect` rejecting server-authoritative fields | `tests/integration/analytics-tamper.test.ts` (new) |
| Demo seed refused in production | `tests/integration/no-demo-in-production.test.ts` |

#### The concurrency harness — two real transactions, not two promises

A test that fires two `Promise.all()` calls through one Prisma client does not
test concurrency; it tests a queue. The harness opens **two independent
connections** and drives them with explicit barriers.

```ts
// tests/helpers/concurrent.ts
import { Client } from 'pg';

export async function race2<A, B>(
  a: (c: Client, barrier: Barrier) => Promise<A>,
  b: (c: Client, barrier: Barrier) => Promise<B>,
): Promise<{ a: Settled<A>; b: Settled<B> }>;
// Opens two pg Clients on the worker's schema, runs both bodies with
// `allSettled` semantics, and closes both. `barrier.arriveAndWait(name)`
// lets each side hold inside its own BEGIN until the other reaches the
// same point — which is how "both read before either wrote" is made
// reproducible rather than timing-dependent.

export function expectExactlyOneWinner<A, B>(r: Awaited<ReturnType<typeof race2>>): void;
```

Every concurrency test asserts three things, not one:

1. **Exactly one side succeeded.**
2. **The loser failed with the specific typed error** — `InsufficientStockError`,
   `ConflictError`, `StaleWriteError` — never a raw `PrismaClientKnownRequestError`
   and never a 500.
3. **The database is left consistent**: the counter equals the ledger sum, no
   orphan reservation, no second `order_events` row.

| Concurrency test | The two transactions | Asserted invariant |
| --- | --- | --- |
| `one-of-a-kind.test.ts` | Two `reserveStock()` on the same `inventory_items` row | One reservation; `reserved_quantity = 1`; loser gets `InsufficientStockError`; `chk_inventory_no_oversell` never fires (the service caught it first) |
| `coupon-cap-race.test.ts` | Two redemptions of a coupon with `redemption_limit = 1` remaining | One `coupon_usages` row; `redemption_count = limit`; loser sees `cart.coupon.exhausted` |
| `gift-card-race.test.ts` | Two checkouts spending the same `gift_cards.balance_minor` | `balance_minor >= 0`; `SUM(gift_card_transactions.amount_delta_minor) = balance_minor` |
| `refund-overrefund.test.ts` | Two staff refunds on one `payments` row | `SUM(refunds.amount_minor) <= payments.captured_minor` |
| `order-idempotency.test.ts` | Two `placeOrder` with the same `idempotency_key` | Exactly one `orders` row; both calls return the same `orders.id` |
| `webhook-duplicate.test.ts` | Two deliveries of one `provider_event_id` | One `webhook_events` row; one `payment_events` row; one `commitStock()`; one email queued |
| `cms-concurrent-autosave.test.ts` | Two autosaves with the same `expectedVersion` | One succeeds; the other returns a conflict; `cms_pages.version` incremented once |
| `product-save-concurrency.test.ts` | Two `saveProduct` on one product | Second gets `StaleWriteError`; no partial child-table diff persisted |
| `jobs-worker.test.ts` | Two `run-jobs` invocations claiming from `jobs` | `FOR UPDATE SKIP LOCKED` gives each a different row; neither blocks |
| `order-number-gapless.test.ts` (new) | Sixteen `placeOrder()` on one market's `order_counters` row | Sixteen consecutive `order_number` values, no gap and no duplicate; a seventeenth transaction rolled back after allocation leaves `next_value` unadvanced |
| `reservation-race.test.ts` (`07`) | Two `reserveStock()` on a multi-quantity row at `available = 1` | Same three assertions as `one-of-a-kind`, on the non-unique path, where the counter — not the cardinality index — is the only floor |

`one-of-a-kind.test.ts` runs its race **200 times** in a loop (`repeats: 200`)
rather than once. A lock-ordering bug that manifests one time in fifty passes a
single-shot test and fails in production on the first busy Saturday.

---

### 2.4 End-to-end tests — worth the maintenance cost, and no more

Playwright, against a Vercel preview deployment with a seeded Neon branch.
E2E is the most expensive test per assertion in the suite, so it covers only
journeys whose value is in the **composition** — where an integration test
cannot see the failure.

**Customer journeys**

| Spec | Journey | `@smoke` |
| --- | --- | --- |
| `tests/e2e/checkout-us.spec.ts` | Home → PLP → filter by stone → PDP → select variant → add to cart → guest checkout → US address → Stripe test card → confirmation → `/orders/[token]` | ✅ |
| `tests/e2e/checkout-in.spec.ts` | The same under `/in` with an India address and a Razorpay test method; asserts every rendered amount carries `₹` | ✅ |
| `tests/e2e/storefront-smoke.spec.ts` (new) | Every top-level route class renders 200 with real data and no console error | ✅ |
| `tests/e2e/price-change-in-cart.spec.ts` | Item in cart → admin changes the price → customer returns → sees the new price and a `cart.line.price_changed` notice → checkout blocks until confirmed | |
| `tests/e2e/market-switch.spec.ts` (new) | US cart with a US-only line → switch to `/in` → the line is dropped with a named message → the remaining bag is priced in ₹ | ✅ |
| `tests/e2e/cache-leak.spec.ts` | Load `/rings` as an India visitor, then as a US visitor from a cold client; assert no ₹ amount appears on the US render and vice versa | ✅ |
| `tests/e2e/cache-headers.spec.ts` | Cart, checkout, account and admin responses carry `private, no-store`; PLP/PDP carry the ISR headers | ✅ |
| `tests/e2e/account.spec.ts` (new) | Sign in → wishlist add → order history → reorder → address book edit | |
| `tests/e2e/ooak-sold.spec.ts` (new) | A sold one-of-a-kind PDP renders as sold, cannot be added to cart, and emits the `catalog.ooak_sold_visibility` behaviour | |
| `tests/e2e/idor.spec.ts` (`07 §4.2`) | Customers A and B seeded; B attempts every one of the seventeen customer-scoped surfaces by id **and** by token; every attempt is a 404 or an empty set and no response body contains A's data | ✅ |
| `tests/e2e/enumeration.spec.ts` (`07 §A11`) | A password reset for a nonexistent address is byte-identical in body, status and p50 timing to one for a real address | |
| `tests/e2e/xss.spec.ts` (`07 §E2`) | A payload in a product title, a rich-text block, a customer name and a wishlist name, viewed on the storefront, in the admin and in an email | ✅ |
| `tests/e2e/security-headers.spec.ts` (`07 §E7`) | CSP correct per surface on storefront, checkout and admin; HSTS, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, `frame-ancestors 'none'`, `X-Robots-Tag` on admin | ✅ |
| `tests/e2e/public-api-leak.spec.ts` (`07`) | Every public route's response body asserted against its documented projection — no cost price, no internal note, no other customer's field | |
| `tests/e2e/preview-scope.spec.ts` (`06`) | A preview token minted for one page opens that page only | |
| `tests/e2e/scheduled-sale-boundary.spec.ts` (`04 §6`) | A rule starting in 60 s: PLP card, PDP and bag all show the old figure, then all three show the new one after the boundary and the `pricing-rule-windows` tick | |
| `tests/e2e/cms-breakpoint-hide.spec.ts`, `cms-responsive-limit.spec.ts` (`06`) | Per-breakpoint visibility and the responsive override limit | |

**Admin journeys**

| Spec | Journey | `@smoke` |
| --- | --- | --- |
| `tests/e2e/admin-product-lifecycle.spec.ts` (new) | Create → upload media → add variants → price in both markets → publish → slug change with redirect → verify the storefront | ✅ |
| `tests/e2e/admin-recalc-approval.spec.ts` (new) | Enter a new silver rate → storefront price unchanged → create preview → review deltas → approve → apply → storefront price changed → `price_history` shows the run id | |
| `tests/e2e/admin-order-fulfilment.spec.ts` (new) | Order → mark shipped → return request → approve → receive → refund → timeline correct | |
| `tests/e2e/market-preview.spec.ts` | Admin previews the India market from a US session without touching customer caches | ✅ |
| `tests/e2e/cms-autosave-recovery.spec.ts` | Edit a page → kill the network → autosave fails visibly → restore connectivity → nothing is lost | |
| `tests/e2e/cms-cls.spec.ts` | A page of every block type has CLS < 0.1 and no layout shift from image loading | |
| `tests/e2e/rbac-denial.spec.ts` (new) | A `content_editor` session receives 403 from every catalogue and order mutation route — asserted against the API, not the hidden menu item | ✅ |

**What is deliberately *not* E2E:** discount stacking permutations, rounding,
tax allocation, webhook ordering, permission matrices. All are cheaper and more
exhaustive one or two layers down.

---

### 2.5 API tests

`tests/api/**`, executing route handlers in-process against a real database via
`next-test-api-route-handler`-style invocation, not over the network.

| Concern | What is asserted | Example |
| --- | --- | --- |
| **Authentication** | Each of the five auth modes in `08 §2.2` — `public`, `customer`, `staff`, `signature`, `cron` — rejects the absence of its credential with the right status: 401 for missing, 403 for present-but-insufficient | `/api/cron/*` without `CRON_SECRET` **and** without `x-vercel-cron` → 401 |
| **Validation** | Every handler parses with Zod first; an extra body key is stripped, a wrong type is 422 with a field-level error array, a `limit` of 1000 is capped at 100 rather than honoured | `tests/api/validation.test.ts` iterates every route's schema |
| **Permissions** | Every admin route × every role, table-driven from `src/lib/rbac/catalogue.ts`. A route added without a `requirePermission()` call fails the test that enumerates route files | `tests/api/permissions.test.ts` |
| **Error handling** | Every typed error in `08 §1.4` maps to exactly one status code and one stable machine-readable `code`; no handler ever returns a raw Prisma error, a stack trace, or a bare 500 | `tests/api/error-taxonomy.test.ts` |
| **Pagination** | Keyset only: `nextCursor` round-trips, no `OFFSET` appears in any generated SQL, the final page returns `nextCursor: null`, a tampered cursor returns 422 rather than leaking rows | `tests/api/pagination.test.ts` |
| **Filtering** | Only whitelisted filter fields are accepted; an unknown filter is rejected, never silently ignored (a silently-ignored filter shows a customer the wrong set) | `tests/api/filtering.test.ts` |
| **Sorting** | Only the per-resource sort whitelist in `src/lib/db/raw/` is accepted — the same whitelist `saved_views` is validated against | `tests/api/sorting.test.ts` |
| **Money shape** | Every JSON response carrying an amount emits `{ amountMinor: string, currencyCode: string }` and never a float | `tests/unit/api-money-shape.test.ts` |
| **Idempotency** | Repeating a mutating request with the same key returns the same resource and creates nothing new | `tests/api/idempotency.test.ts` |
| **Rate limiting** | The OTP, login and checkout limiters return 429 with `Retry-After` at the configured threshold | `tests/api/ratelimit.test.ts` |

---

### 2.6 Database tests

`tests/db/**`. These test the schema itself, by attempting the thing that must be
impossible and asserting the specific constraint name in the error. Asserting the
*name* is what stops a test from passing because a different constraint happened
to fire.

```ts
// tests/helpers/expectConstraint.ts
export async function expectConstraintViolation(
  fn: () => Promise<unknown>, constraint: string,
): Promise<void>;   // asserts error.constraint === constraint, not just "it threw"
```

| Category | Cases |
| --- | --- |
| **CHECK constraints** | `chk_inventory_no_oversell`, `chk_inventory_on_hand_nonneg`, `chk_orders_total`, `chk_order_items_subtotal`, `chk_order_items_total`, `chk_payments_amounts`, `chk_order_items_refund_cap`, `chk_orders_refund_cap`, `chk_pav_one_value`, `chk_nav_items_target`, `chk_pricing_rules_value`, `chk_collection_rules_price_market`, `chk_import_jobs_price_market`, `chk_recalc_approved`, `chk_sessions_one_principal`, `chk_redirects_not_self`, `chk_collections_window`, `chk_attributes_range`, `chk_inventory_ooak_qty` |
| **Uniqueness** | `idx_prices_active`, `idx_prices_active_product`, `idx_orders_idempotency_key`, `idx_webhook_events_event`, `uq_cart_items`, `idx_reservations_active_cart`, `idx_products_slug_live`, `idx_variants_ooak_single`, `idx_inventory_items_ooak_single_row`, `idx_jobs_singleton`, `idx_saved_views_default`, `idx_rate_limits_key_window`, `idx_sessions_token_hash`, every "one primary" partial unique index |
| **Composite currency FKs** | `(market_code, currency_code) → markets` on `prices`, `orders`, `carts`, `pricing_rules`; `uq_orders_id_money` from `order_items`, `payments`, `refunds`, `coupon_usages`, `returns`, `gift_card_transactions`; `(gift_card_id, currency_code)`; `(cart_id, market_code)` and `(price_record_id, market_code)` with `ON UPDATE RESTRICT` |
| **Cascades and restricts** | Deleting a `cms_pages` row cascades its sections and blocks; deleting the row `published_version_id` points at is **restricted**; every FK into `orders`, `order_items`, `payments`, `prices`, `product_variants`, `products` is `RESTRICT`; `audit_logs.actor_user_id` is `SET NULL`, never cascade |
| **Soft-delete semantics** | A soft-deleted product frees its slug for reuse (the partial unique index is `WHERE deleted_at IS NULL`) while still being referenced by `order_items` |
| **Deferred constraints** | `trg_orders_totals_match` passes mid-transaction with mismatched totals and fails at `COMMIT` — proving it is genuinely deferred, which a naive test cannot distinguish |
| **Transaction boundaries** | Each of the fifteen operations in `02 §5.3` is executed with an injected fault after each internal step; the assertion is that the database is in the pre-state, never a partial one |
| **Generated columns and index presence** | A migration-drift test: introspect `pg_indexes` and `pg_constraint` and compare against a checked-in expected list, so a hand-edited migration that gets reverted is caught |

---

### 2.7 Test data strategy

Four tiers, each with a different lifetime. Mixing them is how test suites become
un-debuggable.

| Tier | What | Where | Lifetime |
| --- | --- | --- | --- |
| **Structural seed** | The real `prisma/seed/` files 01–07 | Applied once per worker schema after migration | Whole run |
| **Factories** | `tests/factories/*.ts` — `makeProduct()`, `makeVariant()`, `makePrice()`, `makeOrder()`, `makeCoupon()` | Called per test | One test |
| **Scenario builders** | `tests/scenarios/*.ts` — `aOneOfAKindReadyToBuy()`, `aCartWithTwoLinesInINR()`, `anOrderPaidAndShipped()` | Composed from factories | One test |
| **Perf fixture** | `tests/perf/fixture.ts` — 5 000 products, 18 000 variants, 40 attributes, 12 collections, 200 000 `product_attribute_values`, 50 000 orders | Built once, cached as a `pg_dump` artefact in CI, restored nightly | Nightly run |

**Factory rules, enforced by review:**

1. **Every factory takes a partial override and generates everything else.** A
   test that cares about currency sets currency and nothing else; the day a
   required column is added, one factory changes, not ninety tests.
2. **Money is always explicit.** No factory invents a default price. A test that
   does not name its amounts is a test that cannot detect a rounding change.
3. **IDs are UUIDv7 from the same generator as production**, so ordering-sensitive
   queries behave identically.
4. **The clock is injected.** `at` is a parameter everywhere in pricing; tests
   pass fixed instants. `vi.useFakeTimers()` is used only for debounce and
   scheduling tests, never for pricing.
5. **No factory writes demo-labelled rows.** `is_demo` is for the seed, not for
   tests; a test asserting demo behaviour sets the flag explicitly.
6. **Every factory returns the created row, not an id**, so an assertion can
   compare against what was actually written rather than what was requested.

> **SCHEMA ADDITION:**
> `ALTER TYPE job_kind ADD VALUE 'consistency_check';`
> `ALTER TYPE job_kind ADD VALUE 'reconcile_inventory';`
> The nightly reconciliations that `02 §5.2` promises (`reserved_quantity` vs
> `reservation_lines`, `gift_cards.balance_minor` vs its transactions,
> `categories.materialized_path`, `collections.last_refreshed_at` staleness) need
> a `jobs.kind` to run under and a `jobs.result` to report into; without an enum
> value they have nowhere to live and `/admin/system/jobs` cannot show them.
> Both ship in their own migration ahead of first use (`01 §5.4`, `03 §9`).
> **The complete enum is `11 §3.1` — seventeen values, not ten**; these two are
> among the nine additions it collects, and both are `systemPermitted: true` with
> `dedupeKey: 'kind'` (`11 §3.2`), which is what lets a cron enqueue them with
> `jobs.created_by_user_id IS NULL`. `07 §3.2`'s three-kind allowlist, under which
> they would have failed as `FORBIDDEN`, is superseded by `11 §3.3`.

---

### 2.8 Database isolation, under a ten-connection ceiling

The ceiling is real: `prisma dev` caps at ~10 concurrent connections (`00 §3`).
Exceeding it produces timeouts that look exactly like deadlocks, which is the
worst possible failure mode for a suite whose job is finding deadlocks.

**The fork.** (a) One database, `TRUNCATE` between tests, single-threaded — safe
but serial, and the integration band would run 15 minutes. (b) A database per
worker — Neon supports it, `prisma dev` effectively does not, and creating one
costs seconds. (c) **A Postgres schema per worker inside one database.**

**Decision: (c), schema-per-worker.** It works identically on `prisma dev` and on
a Neon CI branch, costs one `CREATE SCHEMA` plus a migration replay per worker at
startup, and keeps parallelism without multiplying connections per worker.

```ts
// tests/setup/db.ts — globalSetup
const workers = Number(process.env.VITEST_MAX_WORKERS ?? 3);
// 1. migrate `public` once via `prisma migrate deploy` on DIRECT_URL
// 2. pg_dump --schema-only public  →  replay into md_test_w0..N with search_path rewritten
// 3. run prisma/seed files 01–07 into each
// 4. export per-worker DATABASE_URL:
//    postgres://…/db?options=-c%20search_path%3Dmd_test_w{{i}}
```

**Connection budget — the arithmetic, written down so it is not rediscovered:**

| Consumer | Per worker | Workers | Total |
| --- | ---: | ---: | ---: |
| Prisma client pool (`DATABASE_CONNECTION_LIMIT=1` under `NODE_ENV=test`) | 1 | 3 | 3 |
| Raw `pg` clients for `race2()` (2, only during a concurrency test) | 2 | 3 | 6 |
| Migrator / globalSetup (closed before workers start) | — | — | 0 |
| **Peak** | | | **9** |

`vitest.config.ts` therefore pins:

```ts
// ONE source of truth for the worker count. tests/setup/db.ts reads the same
// constant to decide how many md_test_w* schemas to create.
const WORKERS = Number(process.env.VITEST_MAX_WORKERS ?? 3);

test: {
  pool: 'forks',
  poolOptions: { forks: { minForks: 1, maxForks: WORKERS, isolate: true } },
  fileParallelism: true,
  sequence: { concurrent: false },     // no concurrency *within* a file
  hookTimeout: 30_000,
  testTimeout: 30_000,
}
```

*(Corrected: the first draft hardcoded `maxForks: 3` in this snippet while
`tests/setup/db.ts` read `VITEST_MAX_WORKERS ?? 3` and the paragraph below
declared "the ceiling is an environment variable, not a hardcoded number". Setting
`VITEST_MAX_WORKERS=6` on CI would have created six schemas, migrated and seeded
all six, and then run three forks — half the setup cost for none of the speed, and
the person who set it would have had no signal that it did nothing.)*

`WORKERS = 3` locally is not a performance guess — it is `floor((10 - 1) / 3)`
given the three connections a worker can hold at peak, with one connection left
spare for a `psql` session or a stray `prisma studio`. Raising it against
`prisma dev` is the single fastest way to make this suite flaky.

**Isolation between tests inside a worker:**

- **Read-only tests** wrap in a transaction rolled back in `afterEach`
  (`withRollback()`), which costs nothing.
- **Write tests** use `TRUNCATE <tables> RESTART IDENTITY CASCADE` in `afterEach`
  over an explicit list, then re-run seeds 01–07. The list is generated from
  `pg_tables` minus the tables the structural seeds own, so a new table is
  truncated automatically rather than leaking rows into the next test. *(Corrected:
  the first draft said "minus the **seven** structural seed tables", conflating
  seven seed **files** with seven **tables**. Seeds 01–07 write to roughly fifteen —
  `currencies`, `markets`, `inventory_locations`, `market_locations`,
  `order_counters`, `permissions`, `roles`, `role_permissions`, `categories`,
  `stones`, `materials`, `settings`, `email_templates` among them. The exclusion
  list is therefore exported by the seed modules themselves — `export const
  SEEDED_TABLES` per file, unioned — not counted by hand, so adding a table to a
  seed cannot desynchronise it.)*
- **Concurrency tests cannot use either.** Two real transactions must both see
  committed data, so `race2()` tests own their schema for the duration and clean
  up by truncating explicitly at the end. They are marked
  `describe.sequential()` and are the only place a test may hold three
  connections.

On CI, the Neon branch created for the PR replaces `prisma dev` and the same
schema-per-worker code runs unchanged — `maxForks` is lifted to 6 there via
`VITEST_MAX_WORKERS`, because Neon's ceiling is not 10. **The ceiling is an
environment variable, not a hardcoded number**, precisely so the local constraint
does not become the CI constraint.

---

### 2.9 What runs when

| Trigger | Suite | Gate |
| --- | --- | --- |
| **Pre-commit hook** | `scripts/check-env.ts` — which does two separate jobs (`01 §5.9`: Zod-validate the environment *and*, per `01 §…`, reject a staged file containing a secret); `tsc --noEmit` on changed projects, ESLint on staged files, `vitest related`, `tests/setup/collect-audit.ts` | Blocking, < 15 s |
| **Every push / PR** (`ci.yml`) | typecheck → lint → `test:unit` → `test:db` → `test:api` → `test:integration` (Neon PR branch) → `build` → `test:e2e --grep @smoke` against the preview URL | Blocking merge |
| **Nightly** (`nightly.yml`, 02:00 UTC) | Full E2E across Chromium/WebKit/mobile-Chrome; `tests/a11y/**`; `tests/perf/**` benches against the 5 000-product fixture; Lighthouse CI on `/`, a PLP, a PDP, `/cart`; `one-of-a-kind.test.ts` and `reservation-race.test.ts` at `repeats: 2000`; `npm audit --audit-level=high`; a migration-drift check against production's introspected schema; the `consistency_check` and `reconcile_inventory` jobs run against the perf fixture and asserted clean | Non-blocking; opens a GitHub issue on failure |
| **Pre-release** (manual, before `release` fast-forwards on a schema-changing release) | Everything nightly runs, plus a restore of last night's production PITR snapshot into a scratch Neon branch and `prisma migrate deploy` against it — the migration is proven against real data volumes before it runs on real data | Blocking |
| **Weekly** | Dependency update PR (`npm outdated` → grouped), full suite on it | Non-blocking |

**Flake policy.** A test that fails intermittently is either fixed or deleted
within one working day. It is never retried into green: `retries: 0` in
`vitest.config.ts`, and Playwright gets `retries: 1` **only** to distinguish
infrastructure flake from product flake, with any retry-passed test reported as a
failure in the nightly summary. In a codebase whose hardest bugs are races, a
retry policy is a mechanism for hiding exactly the defects this suite exists to
find.

---

### 2.10 Performance and accessibility budgets

| Surface | Budget | Enforced by |
| --- | --- | --- |
| PLP with 3 filters over the 5 000-product fixture | p95 < 200 ms server time | `tests/perf/catalog-filter.bench.ts`, case `three-filter-PLP` |
| A single `select` attribute filter over the same fixture | p95 < 120 ms server time (P09 (a)) | `tests/perf/catalog-filter.bench.ts`, case `single-attribute` |
| `resolvePriceBatch` for 48 variants | **3 queries — the `prices` read, the `04 §1.4.1` scope query, the memoised `pricing_rules` read — and the same 3 for 1, 48 and 200 lines**; p95 < 40 ms | `tests/perf/pricing-batch.bench.ts`, `tests/integration/pricing-batch-query-count.test.ts` |
| `getPublishedPage` | 1 query, p95 < 15 ms | `tests/perf/cms-render.bench.ts` |
| Admin order list, page 1 of 50 000 | p95 < 250 ms, keyset | `tests/perf/admin-orders.bench.ts` |
| `/` and PDP | LCP < 2.5 s, CLS < 0.1, TBT < 200 ms (mobile, throttled) | Lighthouse CI, nightly |
| Every interactive surface | Zero axe violations at WCAG 2.2 AA | `tests/a11y/**`, nightly + pre-release |
| Checkout | Keyboard-completable end to end with no mouse | `tests/a11y/checkout.spec.ts` |

A bench that regresses more than 25% against the committed baseline fails the
nightly and opens an issue naming the phase whose merge introduced it.

*(Corrected: the first draft budgeted `resolvePriceBatch` at "1 query". `04 §1.4.1`
specifies **two** queries for the scope and rules steps alone, on top of the
`prices` read — and P11's own exit criterion (d) had already been corrected to say
so. A budget that the correct implementation fails on the day it is written is a
budget that gets deleted, taking the invariant that actually matters — **the count
does not grow with line count** — out of CI with it. The same paragraph gave
`catalog-filter.bench.ts` two different thresholds; they are now two named cases.)*

---

## 3. Risk register

Likelihood and impact are **H/M/L**. "Early warning" is the signal that appears
*before* the damage, and is the thing to instrument.

| # | Risk | L | I | Early warning sign | Mitigation (concrete) |
| --- | --- | :-: | :-: | --- | --- |
| **R01** | **Overselling a One-of-a-Kind piece** | M | **H** | `chk_inventory_no_oversell` appearing in Sentry at all; nightly `reconcile_inventory` reporting `reserved_quantity ≠ SUM(reservation_lines)`; an `orders` row reaching `paid_unfulfillable` | `SELECT … FOR UPDATE` in ascending id order at `ReadCommitted`; conditional `UPDATE` re-evaluating availability against the locked row; `chk_inventory_no_oversell` as the database floor; `idx_variants_ooak_single` + `idx_inventory_items_ooak_single_row`; `release-reservations` every 5 min; `one-of-a-kind.test.ts` at `repeats: 200` per commit and 2000 nightly; the `paid_unfulfillable` path auto-refunds with `idempotencyKey = order.id` |
| **R02** | **Cross-market price contamination** — a USD amount rendered or stored as INR | M | **H** | Any Sentry event naming a composite currency FK; a `getDisplayPrice` result whose `currencyCode` differs from the route's market; a customer reporting a "₹249" ring | Composite FK `(market_code, currency_code) → markets` on `prices`, `orders`, `carts`, `pricing_rules`; `uq_orders_id_money` on every order child; `ON UPDATE RESTRICT` on the cart's `(cart_id, market_code)`; `tests/unit/no-fx.test.ts` as an AST scan; `resolvePrice` returning `PriceUnavailableError` rather than falling back; per-currency `coupon_amounts`, gift-card balances and free-shipping thresholds; `tests/e2e/cache-leak.spec.ts` per commit |
| **R03** | **A metal-rate update silently moves live prices** | M | **H** | A `price_history` row whose `recalc_run_id` is null but whose reason is `metal_rate`; any `prices` write originating from `rates.ts`; a support ticket about a price that changed overnight | `recordMetalRate()` writes one row and imports nothing that writes `prices`; the cron produces a `previewing → pending_approval` run and has no path to `applied`; `chk_recalc_approved` requires a named approver; `rate-change-does-not-move-prices.test.ts` asserts byte-identical `prices`, zero `price_history`, zero purges; `/admin/pricing/recalc-runs/[id]` sorts by absolute % delta descending so the worst surprise is at the top |
| **R04** | **Payment / order desynchronisation** — money taken, order wrong or absent | L | **H** | `reconcile-payments` flagging any row; an `orders` row in `pending_payment` older than 2 h with a `payments` row; a provider dashboard total diverging from `SUM(payments.captured_minor)` | The order is committed **before** any intent exists, which removes the whole class; `orders.idempotency_key` unique; the six webhook assertions; `/api/cron/reconcile-payments` nightly over 72 h with Sentry `fatal` + `ORDER_NOTIFICATION_EMAILS`; a payment with no `order_id` is flagged for a human and never auto-refunded |
| **R05** | **Webhook unreliability** — missed, duplicated, out-of-order, or failing signature after a key rotation | **H** | M | `webhook_events` rows with `status='failed'` and rising `attempts`; any row with `signature_valid = false`; a gap in `provider_event_id` continuity | Insert-first on `UNIQUE (provider, provider_event_id)`; `/api/cron/retry-webhooks` every 15 min with exponential backoff to 8 attempts; invalid-signature deliveries are **stored** with `signature_valid = false` and surfaced at `/admin/system/webhooks`, so a rotation failure is a visible row rather than an absence of orders; `reconcile-payments` is the net under all of it; `webhook-out-of-order.test.ts` proves a late `succeeded` cannot overwrite a later state; `webhook-late-success-on-cancelled.test.ts` proves the same for a cancelled order |
| **R05a** | **The insert-first rule makes `/api/webhooks/*` an unauthenticated write** — storing invalid-signature deliveries is correct for rotation visibility, and is also a public endpoint that appends a row per request | M | M | `webhook_events` row count climbing with no matching provider dashboard activity; the `signature_valid = false` count rising without a key rotation having happened | A **64 KB body cap** before the row is written and the payload stored truncated past it; a `rate_limits` bucket keyed on source IP on the webhook routes (the same limiter as `07 §5.5`, not a new mechanism); `signature_valid = false` rows pruned at `payments.retention_days` while valid ones are kept; an alert when the invalid count exceeds 50 in an hour, since a rotation produces a burst and an attacker produces a plateau. *(New: the first draft specified insert-first with neither a size cap nor a limiter, which is a public append primitive on a Neon-billed table.)* |
| **R06** | **EAV query degradation as the catalogue grows** | M | M | `catalog-filter.bench.ts` regressing past 200 ms p95; `pg_stat_statements` showing the attribute `EXISTS` subquery climbing; admin PLP feeling slow before customers notice | The indexes named in `03 §3.6`; filters restricted to attributes flagged filterable, so the index set is bounded and known; `getFacetCounts` is one query, not one per facet; the nightly bench runs against 5 000 products / 200 000 attribute values — four to five times the realistic launch catalogue; the escape hatch is already specified (`01 §1.6`): a `SearchProvider` swap by `SEARCH_PROVIDER`, not a schema change |
| **R07** | **Page-builder flexibility outrunning render performance** | M | M | `cms-render.bench.ts` regressing; CLS rising on `cms-cls.spec.ts`; an editor building a 40-block homepage | A published page is **one** `content_versions` row read by primary key; per-breakpoint config renders as CSS, never as JavaScript (`06 §3.1`), so three breakpoints cost one markup tree; `sizes` is mandatory on every media block and the registry test fails a block without it; the first image of the first section gets `priority` automatically; **`BUILDER_BLOCK_SOFT_CAP = 30`, returned by `applyBuilderOps` as a `block_soft_cap` warning** (`06 §2.2`) — a warning and never a refusal, because a campaign page may legitimately need forty blocks and a builder that refuses a legal arrangement is one the editor works around. *(This mitigation previously had no implementation anywhere and no test; it is `06 §2.2` step 6 and `tests/unit/cms-rhythm.test.ts`, owned by P27.)* |
| **R08** | **CMS version-history growth** | **H** | L | `content_versions` row count or table size on the nightly size report; `pruneVersions()` runtime climbing | `cms.version_retention_count` = 30 per entity, `cms.published_version_retention_days` = 730, pinned versions kept forever, `published_version_id` protected by `ON DELETE RESTRICT`; pruning deletes in **batches of 500** in a bounded loop so the first night's backlog is not one long write transaction on Neon; autosave dedupes against the previous `snapshot_hash` so an idle editor generates no rows |
| **R09** | **Media storage cost and delivery** | M | M | Cloudinary monthly transformation and bandwidth counters; the media library growing faster than the published catalogue; originals appearing in a delivery URL | Derivatives generated **on first request**, never eagerly — an unused asset costs storage only; nine fixed widths, so the transformation set is bounded; Vercel's image optimiser bypassed entirely (`images.loader: 'custom'`) so there is one CDN and one bill; `buildImageUrl` cannot emit an untransformed URL; `06 §7.5` usage tracking makes "which assets are unused" answerable before a cleanup |
| **R10** | **India-market latency from a US deployment** | **H** | M | India p75 TTFB in analytics diverging from US by more than ~400 ms on dynamic routes; cart/checkout abandonment higher in `/in` than in the US funnel | Accepted and bounded by design: home, PLP, PDP and stone pages are ISR-served from the Vercel edge cache in-region, so only cart, checkout and account pay the round trip; measured per market in `analytics_events` from day one rather than assumed; the remedy is a Neon read replica in `ap-south-1` and a change in `src/lib/db/client.ts` — a configuration change, not a rearchitecture; the trigger for pulling it is a named revenue share, decided with the client, not a vibe |
| **R11** | **Scope creep across 32 phases** | **H** | M | A phase whose exit criteria have been "nearly true" for two sessions; new requirements arriving mid-phase rather than into a backlog; `NEEDS INPUT` callouts being answered with new features | Exit criteria in §1.2 are objective and testable — a phase is done or it is not, and "mostly" is not a state; anything not in `01`–`11` goes to `docs/backlog.md` and is scheduled between milestones, never inside one; §5 separates launch blockers from post-launch, so pressure lands on the right list |
| **R12** | **Single-developer bus factor** | M | **H** | Any decision existing only in the developer's head; a runbook that has never been executed by anyone else; a secret held in one place | `docs/architecture/` (this set) is the handover; `docs/runbooks/` for rotate-secrets, restore-from-PITR, failed-migration, payment-reconciliation-divergence, disable-a-market, **dispute-response** (`R23`) and **erasure-request** (`R24`), each **executed once in a dry run** and dated; secrets in Vercel/GitHub environments, not a local file; every architectural decision is in a document, not a commit message; the `NEEDS INPUT` callout in `01 §5.1` about account ownership exists precisely so the accounts do not die with the laptop |
| **R13** | **External lead times: Stripe/Razorpay KYC, DNS** | **H** | M | An application in "under review" for more than five business days; a DNS change not propagating because the registrar login is unknown | Start all of §1.7 on day 0; build against **test keys** so P23 is never blocked by KYC — only the live-key switch is; the provider abstraction means a delayed Razorpay approval launches the US market alone with the India market's `markets.is_active = false`, which is a supported state (`getProviderForMarket()` returning `null` blocks checkout cleanly and writes no order) |
| **R14** | **Missing brand vector assets** | **H** | M | P14 arriving with `public/brand/` still empty | `tests/unit/brand-assets.test.ts` fails the build rather than letting a text substitute ship; the layout reserves the exact dimensions so swapping the file changes nothing else; **no tracing, ever** — a traced vector silently alters the monogram's crescent, which is the redesign the brief forbids. Until supplied, non-production environments render a neutral placeholder box, clearly marked, and production cannot launch (§5) |
| **R15** | **No real catalogue content or photography** | **H** | **H** | M3 sign-off approaching with `products` containing only `[DEMO]` rows | Every field is seeded blank and **empty fields hide their section** rather than rendering placeholder text (hard rule 8); demo rows are `is_demo`, `[DEMO]`-prefixed, `demo-` slugged and deletable in one action; `no-demo-in-production.test.ts` makes shipping them impossible; CSV import (`import_jobs`) exists so a 300-product catalogue is a validated upload, not 300 form fills. This risk cannot be engineered away — it is scheduled, escalated early, and named in §5 as a hard blocker |
| **R16** | **Dependency on unconfigured services** | **H** | M | An integration whose env vars are unset in the production environment at P30 | The degradation rule (`01 §4.9`): every integration reports `configured` / `unconfigured` and the admin shows it; no feature fakes success; `scripts/check-env.ts` fails the production build on a missing **required** variable and warns on a missing optional one; `/admin/settings/integrations` is the single screen that answers "what is not wired up" (`08 §5` — it is under `settings`, not `system`), and §5 requires the six blocking integrations of `11 §6` to be green there |
| **R17** | Migration failure on production data volumes | L | **H** | A pre-release migration taking more than a few seconds on the PITR restore | Forward-only, expand/contract always; `migrate deploy` gated *before* promotion so an unmigrated schema is never live under new code; `CREATE INDEX CONCURRENTLY` in standalone migrations; long backfills are resumable scripts, not migrations; the pre-release PITR rehearsal (§2.9) |
| **R18** | Prisma `prisma dev` 10-connection ceiling mistaken for application deadlock | M | L | Integration tests timing out in a pattern that changes with `maxForks` | The budget arithmetic in §2.8 written down; `VITEST_MAX_WORKERS` as the single knob; `DATABASE_CONNECTION_LIMIT=1` under `NODE_ENV=test` |
| **R19** | Neon pooled/direct URL confusion resurfacing | L | M | `prisma migrate` hanging with no output | `scripts/check-env.ts` fails hard when `DIRECT_URL` contains `-pooler`; already-banked lesson (`00 §5`) |
| **R20** | Audit-log and analytics table growth | M | L | Nightly table-size report; `idx_audit_created` scan cost | `audit_logs.before/after` store changed fields only; `analytics.retention_days` = 400, `search.retention_days` = 180, `payments.retention_days` = 90 (≥ 30 enforced), `audit.retention_days` = null by policy; `cleanup-sessions` prunes in batches; revisit `audit_logs` partitioning by month when the table passes 50 M rows — a `pg_partman`-style change that does not alter the schema's shape |
| **R21** | A saved view or admin filter issuing an unindexed `ORDER BY` | M | M | Admin list p95 climbing on one saved view only | Sort fields are a per-resource whitelist in `src/lib/db/raw/`, and the `02 §4` index list is sized for exactly that whitelist; `tests/api/sorting.test.ts` rejects anything outside it |
| **R22** | Vercel plan limits silently degrading crons | L | **H** | `release-reservations` running once a day while `/admin/system/jobs` reports healthy | Stated in `01 §5.1` as a Pro-plan requirement, not discovered at launch; §5 requires observing `release-reservations` execute at least 10 times within one hour in production before go-live |
| **R23** | **Card-not-present fraud and chargebacks on high-value pieces** — the single most likely way this platform loses real money after launch | **H** | **H** | The provider's dispute rate crossing 0.5% (Visa's monitoring threshold is 0.9%; 0.5% is the point to react); a `payment_events` `dispute_opened` on an order shipped to an address that differs from the billing country; two or more orders over the client's stated high-value threshold from one email or card fingerprint inside an hour; a spike in `paid_unfulfillable` | The order-before-intent design already makes every disputed payment traceable to an immutable `order_items` snapshot, which is what a representment needs; beyond that: **provider-side rules enabled and reviewed before go-live** (Stripe's risk rules, Razorpay's), **3-D Secure enforced** — mandatory in India, and for the US a threshold the client sets (P23 (h)); AVS and CVC mismatch declined rather than accepted-and-reviewed; orders above the client's high-value threshold held in `pending_review` for manual release rather than auto-fulfilled — this is a `orders` status transition, not a new table; `docs/runbooks/dispute-response.md` naming what evidence is pulled from `order_events`, `shipments` and the carrier, and by whom, within the provider's response window. *(New. `05 §…` handles `charge.dispute.created` mechanically — a `payment_events` row, an `order_events` row, a staff alert, "no automatic status change". Nothing owned the control, no register entry named it, and §5 would have been signed with the fraud posture undefined. A jewellery house shipping $4 000 rings card-not-present is the canonical target.)* |
| **R23a** | **Tax under-collection through an unregistered Stripe Tax account** | M | **H** | Any US order whose `tax_minor` is `0` with a non-zero `subtotal_minor` and a US shipping address; the Stripe Tax registrations list being empty or shorter than the states the client ships to; the first state notice | `quoteTax` returns `TaxUnconfiguredError` and **blocks** rather than returning zero (P22 (e)); a startup assertion that the provider reports at least one active registration when `tax_mode='provider_stripe_tax'`; a nightly check flagging any order with `tax_minor = 0` and a taxable destination; §1.7 carries the registrations as a day-0 external item and §5 as a blocker. The failure mode is uniquely bad because **nothing errors** — the checkout succeeds, the customer is happy, the order is correct in every other respect, and the liability accrues silently to the client |
| **R24** | **An erasure request that the schema is designed to refuse** — `ON DELETE RESTRICT` into `orders` is what makes history immutable (hard rule 4), and is also what makes "delete my account" impossible to honour naively | M | M | The first DPDP or US state-privacy request arriving with no documented procedure; a developer being asked to "just delete the customer row" | Erasure is **anonymisation, never deletion**: `customers` PII columns nulled/tokenised, `orders.email` and `order_addresses` replaced with a tombstone, `audit_logs.actor_customer_id` retained as an opaque id — the order, its amounts and its invoice number survive intact, because tax and GST retention obligations outlive any erasure right and the immutability rule is not negotiable. `07`/`08` already specify the anonymisation seam; what was missing is a phase and a proof. Assigned to **P24**, verified by `tests/integration/erasure-anonymise.test.ts` (new): after erasure, no PII column is readable, `order_items` money is byte-identical, `trg_orders_totals_match` still holds, and `reconcile-payments` still reconciles |

---

## 4. Edge cases beyond commerce

Commerce edge cases — the two-buyer race, price change in cart, expired coupon,
webhook duplication, market change mid-checkout and the rest — are specified in
**`05 §10`** and are not repeated here. This register covers everything else.

### 4.1 Content edge cases

| Case | Specified behaviour |
| --- | --- |
| A page is published, then every section is deleted in the draft | The published `content_versions` snapshot still renders. The draft being empty is invisible to the public until Publish; the builder shows "This page has no sections — publishing will show an empty page" as a blocking confirmation |
| A block references a media asset that was deleted | `06 §7.8` — the block renders without the image and the admin flags it. Deletion itself is refused while `06 §7.5` usage tracking shows a reference, unless the editor confirms; a confirmed delete leaves the block in a named degraded state, never a broken `<img>` |
| A version is restored that references a deleted collection, product or media id | `06 §5.5` — the restore succeeds, the referencing block is marked unresolved in the builder, and the page cannot be **published** until resolved. Restoring is never blocked; publishing a broken page is |
| Two editors open the same page, both autosave | `cms_pages.version` optimistic bump; the second save returns a conflict with the other editor's name and timestamp, and the builder offers "reload theirs" or "copy mine out" — never a silent merge |
| An autosave arrives out of order (older `seq` lands last) | Ignored by `seq` comparison; a 750 ms debounce plus an in-flight guard keeps at most one outstanding request |
| The network dies mid-edit | `06 §6.3` — the save state shows an explicit failure, the draft is held in memory, and retry resumes. No change is silently lost; `cms-autosave-recovery.spec.ts` proves it |
| A scheduled publish time passes while the app is idle | The `publish_scheduled` job fires from `/api/cron/run-jobs`, not from a request. It publishes **and** purges the tag, so an ISR page actually flips |
| A scheduled publish is set in the past | Accepted and fires on the next job drain — publishing immediately is the only sane reading of "publish at a time that has passed" |
| A section has `visible_from`/`visible_to` inside a published page | Kept in the snapshot and evaluated **at render time**, so a merchandising window opens without a republish |
| A block type is removed from the registry while pages still use it | The renderer emits nothing for an unknown `block_type` and logs once per type per deploy; the builder shows it as "Unavailable block — remove or restore the block type". Old snapshots are never rewritten |
| The `PageSnapshot` shape changes | `schemaVersion` bumped; `getVersionPage()` runs `migrateSnapshot()` on read. `content_versions` is append-only and old rows are never rewritten in place |
| Rich text containing a script, an `onerror`, or a `javascript:` href | Sanitised on write **and** on render. Two passes, because a sanitiser upgrade must retroactively protect content written under the old one |
| A journal post is published with no cover image | Renders without the cover; the card layout has a no-image variant. No placeholder stock photograph is ever substituted |
| An email template contains `{{order.nonexistent}}` | Substitution leaves the token unrendered **and** the admin template editor flags unknown tokens on save against the template key's declared variable list |
| An email template's token value contains HTML | Escaped by default; only explicitly-declared raw tokens bypass escaping, and the list is in code, not in the template |
| Every CMS field for a section is blank | The section is **not rendered**. An empty footer address is correct; an invented one violates hard rule 8 |

### 4.2 Catalogue edge cases

| Case | Specified behaviour |
| --- | --- |
| A product is published with zero variants | Refused by the publish gate with the named missing requirement |
| A published product has variants but no price in either market | Publish is allowed (a piece can be catalogued before pricing) but every market's availability predicate excludes it, listings omit it, and the admin completeness score reports it. It is never shown with a blank price |
| A product has a price in USD and none in INR | Sold in the US, absent from `/in` listings, and its `/in` PDP returns the "not sold in this market" state with a link to the US market — not a 404, because the URL is legitimate |
| `pricedVariantCount < totalVariantCount` | The card shows "from" the minimum priced variant; unpriced variants are disabled in the option selector with a named reason |
| A one-of-a-kind product is sold | `products.sold_at` set; `AvailabilityBand` is `'sold'`; visibility follows `catalog.ooak_sold_visibility` (default `visible_noindex`) and listing inclusion follows `catalog.ooak_sold_in_listings`. The URL keeps working — a sold unique piece is editorial proof, and 404ing it destroys inbound links |
| A one-of-a-kind product is given `ooak_quantity_override` | Allowed, audited, and the single-variant/single-stock-row indexes still apply; the override changes quantity, not cardinality |
| A category is deleted with products in it | Soft delete; products keep their `product_categories` rows and fall out of navigation. A category with live products cannot be hard-deleted |
| A category is re-parented under its own descendant | Refused; `materialized_path` recomputation detects the cycle before the write |
| An attribute's `data_type` is changed after values exist | Refused. The path is: create a new attribute, migrate values through a job, retire the old one. Silently reinterpreting 40 000 EAV rows is not an edit |
| An `attribute_options` value is deleted while products reference it | Refused while referenced; the admin shows the count and links to the affected products |
| A collection rule matches zero products | Rendered as an empty collection with the empty state, and `/admin/catalog/collections` flags "0 products" distinctly from "not refreshed" — the two look identical to a merchandiser and have opposite causes |
| A collection's `last_refreshed_at` is older than 25 h | Rendered as a warning in the admin. A silently stale rule-driven collection is indistinguishable from a correct empty one |
| A product matches a rule collection **and** is manually pinned into it | One `product_collections` row; `source='manual'` wins and survives every rule refresh |
| A stone or material is deleted while products reference it | Soft delete; existing `product_stones` / `variant_materials` rows remain; the stone's discovery page unpublishes. Rate-linked materials additionally refuse deletion while any `price_formula_bindings` row is active |
| A stone page has fewer products than `catalog.stone_section_min_products` | The per-type sub-listing is omitted rather than shown with one item |
| Two products are given the same slug | The second is refused by `idx_products_slug_live`. A soft-deleted product's slug **is** reusable, because the index is partial on `deleted_at IS NULL` |
| A SKU token is missing for a category, stone or material | The generator falls back to the entity's id prefix and the admin flags the missing token; it never emits a colliding SKU |

### 4.3 Market edge cases

| Case | Specified behaviour |
| --- | --- |
| A URL names an unknown or inactive market (`/xx/rings`) | `resolveMarket()` throws `NotFoundError` → 404. It never renders US prices under a foreign prefix |
| `/us/rings` is requested explicitly | 301 to `/rings`. One canonical URL per market page |
| A market is deactivated with live carts and orders in it | Existing orders are untouched and remain readable; its storefront routes 404; its carts are unreachable; `getProviderForMarket()` returns `null` so no checkout can start. Deactivation is reversible and audited |
| A new market is added | Rows only: a `markets` row, a `currencies` row if new, `market_locations`, an `order_counters` row, a `prices` row per variant to be sold there, and a `metal_rates` row per rate-linked material **in the new currency** (never derived from USD or INR). No code change, no deployment — **and `tests/integration/third-market.test.ts` executes exactly this for `GB`/`GBP` and asserts `git diff src/` is empty**, so the claim is a test rather than a statement |
| A new market needs a payment provider neither market uses | `getProviderForMarket()` is a registry keyed on `markets.payment_provider_key`, not a `switch` on `'US' \| 'IN'`: a new provider is one module implementing the `PaymentProvider` interface plus one registry entry plus one column value. Until that entry exists the market's `getProviderForMarket()` returns `null`, checkout blocks cleanly and no order is written — the same supported state `R13` relies on |
| A market has no `metal_rates` row for its currency | Recalc lines for that market are `status='skipped'` with a stated reason. The other market's run completes. No currency is ever derived from another |
| A visitor's `md_market` cookie disagrees with the URL prefix | The URL wins, always. The cookie may render a dismissible banner and nothing else. `HttpOnly` means no component can be tempted to price from it |
| A crawler from an Indian IP requests the US URL | Gets the US market. Geo never redirects — that is cloaking |
| A customer's `default_market_code` differs from the page's market | Hint for the banner only; never used to resolve a rendered page |
| An admin previews a market and the response is cached | Impossible by construction: preview responses carry `Cache-Control: private, no-store` and a preview-scoped header, asserted by `market-preview.spec.ts` and `cache-headers.spec.ts` |
| A price exists in a market whose `markets.currency_code` later changes | Refused. A market's currency is immutable once any `prices`, `carts` or `orders` row references it; changing currency means a new market code |

### 4.4 Media edge cases

| Case | Specified behaviour |
| --- | --- |
| A 90 MB TIFF from the photographer | Accepted (it is what a jewellery photographer delivers), never served; Cloudinary transcodes. The signature endpoint enforces a byte cap per `media_kind` |
| An unsupported type (GIF, BMP, RAW) | Rejected at `/api/media/sign` **before** a signature is issued, with the accepted list in the error |
| An SVG containing a script or an external reference | Sanitised per `06 §7.10`; rendered through `<img>` only, never inlined |
| An image is replaced with one of a different aspect ratio | `media.width`/`height` update; every block using it re-renders with the new intrinsic size. Blocks with a fixed `aspectRatio` letterbox rather than distort |
| An asset is deleted while in use | Refused by default with the usage list; a forced delete degrades each usage visibly |
| `CLOUDINARY_*` is unset | Upload is disabled with *Media storage not configured*; existing `media` rows still resolve if their `public_id` is valid. Nothing throws, nothing pretends to work |
| Alt text is missing | Publishing a **page** with a missing alt on a visible image is blocked; product images warn and count against the SEO completeness score. Decorative images set `alt=""` explicitly, which is a choice, not an omission |
| A video is uploaded for an inline block | `mode='inline'` delivers HLS; a poster frame is required, and the block will not publish without one |
| Cloudinary is unreachable at render time | URLs are built, not fetched, so server rendering is unaffected; the browser falls back to `media.dominant_colour_hex` behind the blur placeholder |
| Two uploads produce the same `public_id` | Cloudinary versioning makes the URL distinct (`v{version}`); the `media` row is new. Delivery URLs are immutable per version, which is what makes them cacheable forever |

### 4.5 Admin concurrency edge cases

| Case | Specified behaviour |
| --- | --- |
| Two admins save the same product | Optimistic `version`; the second gets `StaleWriteError` naming the other actor and the changed fields. No partial child-table diff is persisted |
| Two admins edit different fields of the same product | Still a conflict at the row level — but autosave sends only `dirtyFields`, so the common case (copy vs price) does not collide in the first place. Both mechanisms are required; neither alone is sufficient |
| Two admins bulk-edit overlapping selections | Each row's update is an individual optimistic write inside the job; conflicting rows are reported as skipped in `jobs.result` with the reason, and the job completes rather than aborting |
| An admin edits a product mid-recalculation | The recalc job's price write uses `expectedPriceId`; a superseded row causes that line to be marked conflicted in `recalc_run_lines` and reported, not overwritten |
| Two admins approve the same `recalc_runs` row | The state machine allows `pending_approval → approved` once; the second gets `IllegalTransitionError` |
| Two cron invocations overlap on the same job | `FOR UPDATE SKIP LOCKED` on the claim; the singleton index prevents queueing a second whole-table rebuild |
| A job's invocation dies mid-run | `idx_jobs_stuck` watchdog requeues it after a timeout; every job is written to be resumable from `progress_current`, not restarted from zero |
| An admin's role is changed while they are working | Sessions for affected users are invalidated in the same transaction as the `role_permissions` diff; the next request re-authorises. A permission is never held longer than the row that grants it |
| An admin is deleted | `audit_logs.actor_user_id` is `SET NULL`, never cascade — a deleted staff account must not erase what it did |
| An admin impersonates a customer | Both actors recorded (`actor_customer_id` + `impersonator_user_id`); every write during impersonation is audited under both |

### 4.6 SEO and slug-change edge cases

| Case | Specified behaviour |
| --- | --- |
| A published entity's slug changes | Blocking confirmation; `createRedirect(..., 'slug_change', tx, actor)` inside the same transaction; unchecking the box is an explicit, audited choice |
| A never-published entity's slug changes | No prompt, no redirect row. A draft has no history to preserve |
| A slug is changed back to a previous value | The reverse edge is deleted and chains are flattened, so A→B→A never exists |
| A redirect chain forms (A→B, then B→C) | Flattened to A→C and B→C at write time. Chains cost a round trip each and Google follows a limited number |
| A redirect's destination later 404s | Flagged red by the nightly consistency check. A 301 to a 404 is worse than the original 404 |
| A redirect is created across markets | Impossible: `from_path`/`to_path` are stored unprefixed and the edge matcher strips and re-applies the market segment. One row covers every market |
| A slug collides with a reserved segment (`cart`, `checkout`, `account`, `api`, `admin`, a market code) | Refused at validation; `tests/unit/reserved-slugs.test.ts` enumerates the list |
| A product is unpublished after ranking | Returns 410 if `sold_at` is null and the product is archived; 200 `noindex` if it is a sold one-of-a-kind. A 404 for a page that had authority throws that authority away |
| A market is added after launch | `hreflang` alternates and `x-default` are emitted from `listActiveMarkets()`, so the new market appears in every existing page's alternates on the next revalidation, with no content edit |
| A page has `is_indexable = false` but is in the sitemap | Impossible: `enumerateSitemap()` filters on the same predicate the `robots` meta uses, from one function |
| Structured data would assert something untrue (a rating with no reviews, a price in the wrong currency) | The field is **omitted**. `jsonld-truth.test.ts` fails any JSON-LD value sourced from a literal |
| An existing site's URLs are being replaced | `/admin/content/redirects` CSV import with `source='import'`. Those rows are the highest-value SEO asset in the migration |

### 4.7 Data migration and CSV import edge cases

| Case | Specified behaviour |
| --- | --- |
| A CSV with the wrong encoding (UTF-16, CP1252) or a BOM | Detected and normalised to UTF-8 at parse; an undecodable file is rejected with the detected encoding named, not silently mojibaked |
| A price column containing `$1,299.00`, `1299`, `1,299.00`, `₹ 1299` | Parsed to minor units with the currency validated against the import's declared market (`chk_import_jobs_price_market` makes a market mandatory for a price import). A currency symbol contradicting the declared market is a **row error**, not a conversion |
| A price column containing a float that cannot be represented exactly | Parsed as a decimal string to `bigint` minor units. `parseFloat` is lint-banned outside `src/lib/money.ts`, and money never passes through a JS `number` on the import path |
| A row references a category, stone or material that does not exist | Row error naming the value and the column. The import never creates taxonomy silently; creating a missing category is an explicit, separate confirmation in the preview |
| Duplicate SKUs within the file | Both rows error, identifying each other's line numbers |
| A SKU in the file already exists in the database | Update-or-error is a per-import mode chosen in the preview and shown in the summary before apply; there is no implicit default |
| The file has 40 000 rows | Preview validates the **first 500** synchronously and states that it did; apply runs as an `import_apply` job, batched, resumable, with `progress_current/total` at `/admin/system/jobs` |
| Validation passes but apply fails at row 12 000 | Committed batches stand; `import_job_rows` records per-row status; the job resumes from the last committed batch. A partial import is visible and completable, never invisible |
| A column the importer does not recognise | Ignored, listed in the preview as ignored. Silently dropping a column the client believes they imported is the defect this prevents |
| An import would change a price on a published product | Shown in the preview as a price delta list, exactly like a recalc preview, and requires the same explicit confirmation. Price changes are never an incidental side effect of an "update products" import |
| An import creates a slug that collides | Row error. Slugs are never auto-suffixed during import — `ring-1`, `ring-2` is how a catalogue becomes unsearchable |
| An export is requested over 50 000 orders | An `export` job streaming to Cloudinary with an emailed signed link. A `findMany()` over a quarter's orders is an out-of-memory kill |
| An export contains customer PII | Signed link expires; the export is recorded in `audit_logs` with the actor and the row count |
| Demo rows exist when real content arrives | **Delete all demo content** removes every `is_demo` row in dependency order; the `idx_<table>_demo` partial indexes make it instant and make a stray production row one query away from being found |

---

## 5. Definition of done

Two lists. The first must be **entirely true** before the platform accepts a real
customer's money. The second is legitimate to defer, and saying so here is what
stops the first list from being negotiated.

### 5.1 Hard launch blockers

**Correctness — proven by tests, not by inspection**

- [ ] `npm run verify` green on `main`; CI green on the release commit.
- [ ] Full E2E suite green on Chromium, WebKit and mobile Chrome.
- [ ] `tests/integration/one-of-a-kind.test.ts` green at `repeats: 2000`.
- [ ] `tests/integration/rate-change-does-not-move-prices.test.ts` green.
- [ ] `tests/unit/no-fx.test.ts` green; no FX conversion anywhere in `src/`.
- [ ] `tests/e2e/cache-leak.spec.ts` and `cache-headers.spec.ts` green.
- [ ] **Every money-losing race green, not only the one-of-a-kind race:**
      `coupon-cap-race.test.ts`, `gift-card-race.test.ts`,
      `refund-overrefund.test.ts`, `order-idempotency.test.ts`,
      `order-number-gapless.test.ts`, `webhook-duplicate.test.ts`,
      `product-save-concurrency.test.ts`, `cms-concurrent-autosave.test.ts` — each
      asserting exactly one winner, a *typed* loser error, and a consistent
      database. A lost update on `gift_cards.balance_minor` is money given away as
      surely as an oversell is, and the first draft's list named neither.
- [ ] `tests/integration/checkout-tamper.test.ts` and
      `order-immutability.test.ts` green — the server's total charged, and a later
      price edit or product soft-delete provably not reaching a placed order.
- [ ] `tests/e2e/idor.spec.ts` green over all seventeen surfaces of `07 §4.2`;
      `xss.spec.ts`, `security-headers.spec.ts`, `public-api-leak.spec.ts` and
      `enumeration.spec.ts` green.
- [ ] `tests/setup/pending.json` **empty** — every test file commissioned in
      **any** architecture document, `01`–`11` inclusive, exists on disk and is
      collected. *(Corrected: this read "`01`–`09`", which matched
      `collect-audit.ts`'s old `0*.md` glob and excluded `10`'s two CI gates and
      `11`'s fifteen registry tests by construction.)* This is the check that stops §5
      being signed against a suite that was never written (see the second revision
      note at the head of this document).
- [ ] `tests/integration/third-market.test.ts` green — a `GB`/`GBP` market added
      by rows alone, with an empty `git diff src/`. The extensibility requirement
      in `00 §1` is a launch blocker, not an aspiration, and this is the only
      thing that executes it.
- [ ] `tests/integration/no-demo-in-production.test.ts` green, and production
      returns **zero** `is_demo` rows across all eight tables carrying the column
      (`02 §6.1`: `products`, `product_variants`, `collections`, `journal_posts`,
      `cms_pages`, `media`, `customers`, `orders`).
- [ ] Coverage thresholds met in every `src/lib/**` directory listed in §2.1;
      `src/lib/rbac/**` at 100%.
- [ ] Every constraint in `02 §5.1` exists in production, verified by the
      migration-drift introspection check, not by reading the migration files.

**Money and market**

- [ ] A real (not test-mode) order placed in USD end to end, confirmed by
      webhook, refunded in full, and reconciled by `/api/cron/reconcile-payments`.
- [ ] The same in INR, **or** `markets.is_active = false` for `IN` with the
      India storefront returning 404 and no INR price rendered anywhere.
- [ ] Every launch variant has an independent, client-approved price in every
      active market. No market has a variant priced by conversion.
- [ ] `SUM(order_items.*_minor)` reconciles to `orders.*_minor` on every seeded
      and real order; `trg_orders_totals_match` has never fired in production.
- [ ] Tax configured and verified per market: Stripe Tax live for US **with the
      client's registration list actually entered and non-empty**, `tax_rules`
      rows loaded and checked for India. *(The registration clause is the whole
      check. Stripe Tax with zero registrations returns zero tax on a completely
      successful checkout — see `R23a`. "Stripe Tax live" alone is satisfied by an
      account that collects nothing.)*
- [ ] A US test order to a state the client **is** registered in returns non-zero
      `tax_minor`; one to a state they are not returns zero **for a stated
      reason**, not by silence.
- [ ] `markets.prices_include_tax` set for `IN` from the client's written answer,
      and a live INR order's `total_minor` equal to the gross figure the shopper
      was shown, to the minor unit.
- [ ] Shipping zones, rates and per-currency free-shipping thresholds entered and
      verified against the client's actual policy.
- [ ] An order number series verified gap-free per market **under concurrency and
      under rollback** — `order-number-gapless.test.ts` green, and 100 sequential
      production test orders consecutive. *(Corrected: the first draft required
      only "100 sequential test orders". `02 §2.7` rejects a Postgres `SEQUENCE`
      precisely because it gaps on rolled-back transactions, and a sequential run
      neither contends nor rolls back — a `SEQUENCE` implementation passes the
      check the check exists to fail. The India GST series is statutory.)*

**Inventory**

- [ ] Real on-hand quantities loaded for every published variant.
- [ ] Every `ONE OF A KIND` product has exactly one variant and one
      `inventory_items` row.
- [ ] `/api/cron/release-reservations` observed executing **≥ 10 times in one
      hour** in production — the direct test that the Vercel plan is not
      coercing the schedule (R22).
- [ ] Nightly `reconcile_inventory` clean: counters equal ledger sums.

**Security and access**

- [ ] All seven roles exist; the permission matrix is asserted by test; the first
      owner was created by `npm run create:admin`, never by a seed.
- [ ] `tests/e2e/rbac-denial.spec.ts` green — authorisation proven at the API,
      not at the menu.
- [ ] CSP, HSTS and the full header set live from `next.config.ts#headers()`; no
      `unsafe-inline` script source.
- [ ] Rate limiting live on login, OTP, checkout, coupon apply and search.
- [ ] Webhook signature verification live for both providers; a deliberately
      mis-signed delivery appears at `/admin/system/webhooks` with
      `signature_valid = false`.
- [ ] No secret in the repository; `scripts/check-env.ts` in `pre-commit`;
      `docs/runbooks/rotate-secrets.md` executed once as a dry run and dated.
- [ ] **Fraud posture defined and live (`R23`):** provider risk rules enabled and
      reviewed; 3-D Secure enforced for India and at the client's stated US
      threshold; AVS/CVC mismatch declined; the high-value manual-review threshold
      set to a figure the client named in writing; `docs/runbooks/dispute-response.md`
      dated. Taking a $4 000 card-not-present order with no answer to "what
      happens when this is disputed" is not a launch.
- [ ] **Erasure is anonymisation and is proven (`R24`):**
      `erasure-anonymise.test.ts` green; `docs/runbooks/erasure-request.md` dated;
      the privacy policy states that order and invoice records are retained for
      statutory periods after an erasure request.
- [ ] Cookie consent live; analytics respects it; no third-party id hardcoded.
- [ ] Privacy policy, terms, returns policy and shipping policy published as CMS
      pages with **client-supplied text** — not drafted here (hard rule 8).

**Content and brand**

- [ ] `public/brand/` contains the client's original wordmark and monogram vector
      files; `tests/unit/brand-assets.test.ts` green; no traced substitute (R14).
- [ ] Every launch product has title, description, at least one image with alt
      text, category, material, stone where applicable, and weight.
- [ ] Homepage, navigation, footer and every legal page built in the CMS and
      approved by the client.
- [ ] **`10 §9`'s two review gates signed for every front-of-house screen.** The
      premium-design test and the anti-pattern test are exit criteria on P14, P15,
      P20, P23, P24 and P28; this line is the check that all six were actually
      walked and that no screen shipped between them. *(Corrected: `10 §9` claimed
      these were "recorded in the phase exit criteria (09)" while appearing in
      none of the thirty-two cells. They are there now.)* The admin is
      deliberately exempt — `10 §3.3` fixes a different posture for a tool, so
      "does the photography dominate?" is the wrong question about P27 and P29.
- [ ] No invented business fact anywhere: no award, certification, founding year,
      customer count, location, guarantee or testimonial that the client has not
      supplied in writing. Every blank field hides its section.
- [ ] Every transactional email rendered with real content and sent to a real
      inbox in every market.

**Operations**

- [ ] `/admin/settings/integrations` lists **all fourteen** `IntegrationKey`
      values (`11 §6`) with their state and exact missing variable names, and the
      **six** marked as launch blockers there each report `configured`: Stripe,
      Razorpay, Cloudinary, Resend, Sentry — and Razorpay only when India launches
      active. *(Corrected: this line named five integrations against a union `01
      §4.9` presented as eight and five other documents widened by prose to
      fourteen. `otp_sms`, `ga4`, `gtm`, `meta_pixel`, `meta_capi`, `google_ads`,
      `metal_rate_api`, `indexnow` and `upstash` are **not** blockers and each has
      a defined, visible unconfigured state.)*
- [ ] **All ten** cron entries executing on schedule with `jobs` run records
      visible at `/admin/system/jobs`, and `tests/unit/cron-registry.test.ts`
      green. *(Ten, not nine: `01 §5.6` tabulates nine and `04 §6` requires
      `/api/cron/pricing-rule-windows` as a tenth. Registering nine leaves a
      closed sale still being served.)*
- [ ] `docs/runbooks/` dry runs dated, including dispute-response and
      erasure-request.
- [ ] Sentry receiving events with release tagging and source maps; an alert rule
      exists for `fatal`.
- [ ] Neon PITR enabled; a restore into a scratch branch **performed once** and
      timed; `docs/runbooks/restore-from-pitr.md` dated.
- [ ] `docs/runbooks/` complete: rotate-secrets, restore-from-pitr,
      failed-migration, payment-reconciliation-divergence, disable-a-market,
      dispute-response, erasure-request.
- [ ] DNS live; apex canonical; `www` redirecting; TLS valid; SPF, DKIM and DMARC
      (`p=none`) passing on `send.<domain>`.
- [ ] `robots.txt` serving **real rules** in production and `Disallow: /` in
      preview; the preview deployment is basic-auth gated.
- [ ] Sitemaps generating and submitted; every 301 from any prior site loaded
      through `/admin/content/redirects`.
- [ ] Lighthouse budgets met on `/`, a PLP, a PDP and `/cart`.
- [ ] Zero axe violations at WCAG 2.2 AA on the storefront and on checkout.
- [ ] Account and billing ownership decided and recorded for Vercel, Neon,
      GitHub, the registrar, Stripe, Razorpay, Cloudinary and Resend.

**The final gate**

- [ ] One member of staff, who did not build the platform, has created a product,
      priced it in both markets, published it, bought it with a real card, found
      it in `/admin/orders`, refunded it, and confirmed the refund landed —
      **without reading the source code.** That is the requirement the whole
      admin exists to satisfy, and it is the only one that cannot be automated.

### 5.2 Legitimate post-launch follow-ups

Deferring any of these is a decision, not a defect. Each has a named trigger for
promotion into work.

| Item | Trigger for doing it |
| --- | --- |
| Neon read replica in `ap-south-1` | India reaches a revenue share the client names, or India dynamic-route p75 TTFB exceeds the agreed threshold (R10) |
| External search provider via `SEARCH_PROVIDER` | Catalogue passes ~5 000 products or `catalog-filter.bench.ts` regresses past budget (R06) |
| `audit_logs` / `analytics_events` monthly partitioning | Either table passes 50 M rows (R20) |
| Additional markets (UK, CA, AU, AE, EU) | Client decision; the work is rows plus a `prices` row per variant, not code |
| Gold-linked pricing alongside silver | `feature` setting and a rate source; the formula machinery already supports it |
| Additional payment methods (wallets, UPI intent, BNPL) | Per-market conversion data after launch |
| Product review **submission UI** (the customer-facing write path) | Only when there are real customers to write them. **The schema and the moderation queue are not deferred** — see the correction below |
| Multi-location inventory with more than one active location | Client opens a second stocking location |
| Loyalty, referrals, subscriptions | Not specified in `01`–`08`; a new architecture document, not a phase |

> **DECISION CHANGED — reviews.** This row previously read "Product reviews and
> ratings — only when there are real customers to write them", while `08` §3.2 said
> "**No `aggregateRating`, no `review`, ever.** There is no `reviews` table in this
> schema" and `15` §3 specified a full review subsystem. Three documents, three
> positions, on a requirement the brief names explicitly.
>
> **Settled:** the three tables (`product_reviews`, `product_review_stats`,
> `product_review_votes` — `02` §7.11a) and the admin moderation queue **ship in
> release 1**. `product_reviews.order_item_id` is `NOT NULL`, so every review is a
> verified purchase by construction; the tables therefore depend on `order_items`
> and are migrated in **P18**, not P05. The moderation screen and the JSON-LD gate
> are **P30**.
>
> `aggregateRating` is emitted **only when that product's
> `product_review_stats.approved_count > 0`**, with `ratingValue` and `reviewCount`
> derived from approved rows and nothing else. `tests/unit/jsonld-truth.test.ts`
> changes from "reject any object containing `aggregateRating`" to "reject
> `aggregateRating` when `approved_count = 0`, and reject any `ratingValue` not
> derived from approved rows" — **the test gets stronger, not weaker**, and hard
> rule 7 is satisfied: structured data still never asserts a fact the platform
> cannot guarantee.
>
> What defers is the customer-facing **write path** only. A store with no orders
> has no reviews to moderate and nothing to emit, so shipping the schema early
> costs one migration and buys the ability to turn the feature on without touching
> a populated `products` table later.
| Localisation beyond `en-US` / `en-IN` | `product_market_content` and the translation seam exist; the trigger is a non-English market |
| Mutation testing on `src/lib/pricing/**` and `src/lib/inventory/**` | After launch stabilises; it is the highest-value confidence upgrade available to this codebase and costs only CI minutes |
| Visual regression snapshots | Once the design stops changing; before that it is a maintenance tax with no signal |
