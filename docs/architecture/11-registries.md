# 11 — Canonical Registries

**This document is the single source of truth for every cross-document
vocabulary in this architecture set.** Where a permission key, an error code, a
job kind, a rate-limit key, a cron path, an integration key, a small closed union
or a sort/filter whitelist value appears here and differently in `00`–`10`, the
other document is the defect and §10 lists the edit it needs.

It exists because roughly 26 tables, 20 permission keys, 15 error classes, 5
rate-limit keys, 4 job kinds and 5 route files were declared in one document and
absent from the document that owns their vocabulary — and in several cases the
owning document specifies a CI test that fails on exactly that divergence
(`99-REVIEW-FINDINGS.md`, readiness verdict). An engineer could not pass P03A's
own exit criteria.

Scope note: this document owns **names and value sets**. It does not own
behaviour. Where a name's meaning is contested between two documents, it names
the winner in one sentence and points at the owner.

---

## 1. PermissionKey catalogue

### 1.1 Where it lives and its exact shape

```ts
// src/lib/rbac/catalogue.ts — the ONLY place a permission string is declared.

export type PermissionDefinition = {
  /** The exact string passed to requirePermission(). Also permissions.key (02 §2.2). */
  readonly key: string;
  /** permissions.resource — groups the admin matrix screen. */
  readonly resource: string;
  /** permissions.action. */
  readonly action: string;
  /** permissions.description — rendered beside the checkbox. An unexplained
   *  permission is granted carelessly (02 §2.2). */
  readonly description: string;
};

export const PERMISSIONS = Object.freeze([
  { key: 'dashboard.view', resource: 'dashboard', action: 'view',
    description: 'Open /admin and the global ⌘K search' },
  // … one entry per row of §1.3, in that order …
] as const satisfies readonly PermissionDefinition[]);

export type PermissionKey = (typeof PERMISSIONS)[number]['key'];

export const PERMISSION_KEYS: readonly PermissionKey[] =
  Object.freeze(PERMISSIONS.map((p) => p.key));

export const TOTP_REQUIRED_PERMISSIONS: readonly PermissionKey[] = Object.freeze([
  'order.refund', 'order.discount_manual', 'price.approve_recalc', 'price.update',
  'customer.export', 'customer.anonymize', 'user.manage', 'user.impersonate',
  'role.manage', 'settings.manage', 'integration.manage', 'market.manage',
  'media.hard_delete',
]);

export const STEPUP_PERMISSIONS: ReadonlySet<PermissionKey> = new Set([
  'order.refund',          // only above settings['security.stepup_refund_threshold']
  'role.manage', 'user.manage', 'customer.export',
  'customer.anonymize', 'media.hard_delete',
]);

/** Exhaustive over import_jobs.resource (§7.6). A seventh importable resource
 *  without a permission decision does not compile. */
export function requiredPermissionsForImport(
  resource: ImportResource, mode: ImportMode,
): readonly PermissionKey[];
```

`PERMISSIONS` is frozen, `as const`, and is the input to three consumers:
`prisma/seed/02-roles.ts` (writes `permissions`), `src/lib/rbac/matrix.ts` (§1.4),
and `PermissionKey` itself. There is no second list.

### 1.2 Naming rule, restated so a new key cannot be invented ad hoc

`<singular_resource>.<action>`, lowercase, snake_case inside a segment, exactly
one dot. `07 §2.2` fixes it; the deviations that shipped in `03`–`06` are in the
**Renamed from** column of §1.3 and are the search strings the other agents need.

Three rules that close the routes by which a key gets invented:

1. **A route map may not widen the catalogue.** `08 §5` invented
   `payment.replay_webhook`; the replay is `integration.manage` **and**
   `order.refund` composed. Any route needing a capability the catalogue lacks is
   a change *here* first.
2. **There is no `bulk_edit.*` key and none is added.** A bulk edit requires
   exactly the permission a single edit of that resource requires
   (`product.update`, `price.update`, `inventory.adjust`), re-checked per row
   inside the `bulk_edit` job against the queuing user's re-resolved permission
   set (§3.3). `01 §2.7` routing >50 rows to a job changes the execution model,
   not the authorisation model. This closes gap 5's "no permission of its own"
   without adding a key that names no resource.
3. **A saved view carries no permission, and a column carries its own.**
   `/admin/tools/saved-views` and every saved view are gated on the **owning
   resource's read permission** (`saved_views.resource` → `products` ⇒
   `product.read`, `orders` ⇒ `order.read`, and so on through §7.5's union).
   **A column carries its own `requires` permission, and a saved view's
   `column_config` cannot grant it** (`13 §1.2`): a column the actor does not
   hold `requires` for is removed from the `SELECT` list in `listResource()` and
   is absent from the returned `columns` array — never fetched and blanked, never
   blurred. Without that half of the rule a shared view authored by an `owner`
   carries `cost_minor` to a `catalog_manager` the moment they open it, and
   resource-level read reads as the only gate. `04 §4`'s cost and margin columns
   are the case this exists for.

### 1.3 The complete catalogue — 73 keys

**Introduced in** names the document that first required the key.
**Renamed from** is the rejected spelling; it is there so the other agents can
grep for it. A key with no **Renamed from** entry never had a second spelling.

| # | Key | Authorises | Introduced in | Renamed from |
| ---: | --- | --- | --- | --- |
| 1 | `dashboard.view` | `/admin`, the KPI dashboard, global ⌘K search | 08 §5 | — |
| | **Catalogue** | | | |
| 2 | `product.read` | List and view products, variants, market content, completeness scores | 07 §2.3 | — |
| 3 | `product.create` | Create a product | 07 §2.3 | — |
| 4 | `product.update` | Edit product fields, market content, attribute values, stone/material/category/collection/tag membership, media order | 07 §2.3 | — |
| 5 | `product.delete` | Soft-delete a product (`products.deleted_at`) | 07 §2.3 | — |
| 6 | `product.publish` | `products.status → active`, `published_at`, `product_market_content.is_published`, archive | 07 §2.3 | — |
| 7 | `variant.update` | Create, edit, retire variants, options, option values | 07 §2.3 | — |
| 8 | `catalog.product_media` | Attach, detach, reorder media on a product | 07 §2.3 | — |
| 9 | `category.update` | Category CRUD, tree moves, `materialized_path` rebuilds | 07 §2.3 | `catalog.settings.update` |
| 10 | `collection.update` | Collection CRUD, `collection_rules`, `collection_rule_values` | 07 §2.3 | — |
| 11 | `stone.update` | Stone CRUD and `product_stones` links | 07 §2.3 | `catalog.settings.update` |
| 12 | `material.update` | Material CRUD and `variant_materials` | 07 §2.3 | `catalog.settings.update` |
| 13 | `attribute.update` | `attributes` / `attribute_options` CRUD | 07 §2.3 | `catalog.settings.update` |
| 14 | `tag.update` | `tags` / `product_tags` / `media_tags` / `journal_post_tags` / **`customer_tags`** CRUD | 07 §2.3 | — |
| | **Media** | | | |
| 15 | `media.read` | Browse the library, view usage reports | 07 §2.3 | — |
| 16 | `media.create` | `/api/media/sign`, `registerUpload()`, create folders | 07 §2.3 | — |
| 17 | `media.update` | `replaceMedia()`, alt text, title, credit, folder move, tagging | **06 §1.5 — new here** | — |
| 18 | `media.delete` | Soft-delete an asset (`media.deleted_at`), usage report runs first | 07 §2.3 | — |
| 19 | `media.hard_delete` | Permanently remove the provider asset (06 §7.8); type-to-confirm | **06 §1.5 — new here** | — |
| 20 | `media.upload_vector` | `POST /api/media/svg` — upload `image/svg+xml` | 07 §2.3 | — |
| | **Pricing** | | | |
| 21 | `price.read` | `prices`, `price_history`, `metal_rates`, recalc previews — **excluding** cost and margin columns | 07 §2.3 | — |
| 22 | `price.read_cost` | `prices.cost_minor`, `variant_component_costs`, every margin column and the "below cost" recalc flag | **04 §1.3 — new here** | — |
| 23 | `price.update` | Write a `prices` row; `setManualPrice`, `setFormulaBinding` | 07 §2.3 | — |
| 24 | `price.recalc_preview` | `createRecalcPreview()`, `rejectRecalcRun()` | **04 §1.3 — new here** | — |
| 25 | `price.approve_recalc` | `approveRecalcRun()`, `applyRecalcRun()`. Hard rule 6 lives on this key | 07 §2.3 | `price.approve` |
| 26 | `metal_rate.manage` | `recordMetalRate()`, `/admin/pricing/metal-rates` | 07 §2.3 | `metal_rate.create` |
| 27 | `pricing_rule.manage` | `pricing_rules` CRUD, including customer-group pricing | 07 §2.3 | — |
| | **Inventory** | | | |
| 28 | `inventory.read` | `inventory_items`, `inventory_transactions`, low-stock, reservations | 07 §2.3 | — |
| 29 | `inventory.adjust` | `adjustment`, `receipt`, `recount`, `write_off` ledger rows; manual reservation release | 07 §2.3 | `inventory.update` |
| 30 | `inventory.transfer` | `transfer_in` / `transfer_out` between locations | 07 §2.3 | — |
| 31 | `location.manage` | `inventory_locations`, `market_locations` | 07 §2.3 | — |
| | **Orders** | | | |
| 32 | `order.read` | Order list and detail (customer block gated separately by `customer.read` — 07 §2.4 note 2) | 07 §2.3 | — |
| 33 | `order.create` | Draft / phone orders (`05 §6`) | 07 §2.3 | — |
| 34 | `order.update` | Non-financial edits: internal note, pre-dispatch address, **and releasing a `pending_review` hold** (§7.4) | 07 §2.3 | — |
| 35 | `order.discount_manual` | Add a manual line discount to a draft order, capped by `settings['orders.manual_discount_max_bp']` | **05 §6 — new here** | — |
| 36 | `order.fulfil` | Create `shipments`, mark fulfilled, print packing slips | 07 §2.3 | — |
| 37 | `order.cancel` | Transition to `cancelled`, release reservations | 07 §2.3 | — |
| 38 | `order.refund` | `refundPayment()`, write `refunds`, webhook replay | 07 §2.3 | — |
| | **Returns** | | | |
| 39 | `return.read` | RMA list and detail | 07 §2.3 | — |
| 40 | `return.update` | Update a return, record receipt, restock | 07 §2.3 | — |
| 41 | `return.approve` | Approve or reject a return request | 07 §2.3 | — |
| | **Customers** | | | |
| 42 | `customer.read` | Customer record, addresses, and the customer block of an order | 07 §2.3 | — |
| 43 | `customer.update` | Edit customer fields, group, internal note | 07 §2.3 | — |
| 44 | `customer.export` | Any bulk export whose resource carries customer PII. Required **in addition to** `export.run` | 07 §2.3 | — |
| 45 | `customer.anonymize` | `anonymizeCustomer()` — the erasure routine (07 §8.3) | 07 §2.3 | — |
| 46 | `user.impersonate` | `startImpersonation()` (07 §1.11) | 07 §2.3 | — |
| | **Marketing** | | | |
| 47 | `coupon.manage` | `coupons`, `coupon_amounts`, `coupon_conditions`, gift-card issuance | 07 §2.3 | — |
| 48 | `campaign.manage` | `campaigns` CRUD and scheduling | 07 §2.3 | — |
| 49 | `newsletter.manage` | Subscriber list, send-list export, suppression | 07 §2.3 | — |
| | **Content** | | | |
| 50 | `cms.read` | Pages, sections, blocks, `getDraftPage`, version history, diffs | 07 §2.3 | `cms_page.read` |
| 51 | `cms.update` | `applyBuilderOps`, every builder autosave, per-breakpoint config. **Does not include restore** (row 53) | 07 §2.3 | `cms_page.update` |
| 52 | `cms.publish` | `publishPage`, `publishVersion`, `schedulePage`, `unpublishPage`, `archivePage`; journal publish | 07 §2.3 | `cms_page.publish` |
| 53 | `cms.restore` | `restoreVersion()` and version pinning. Restore writes to the **draft**; going live still needs `cms.publish` | **06 §1.5 — new here** | `cms_page.restore` |
| 54 | `cms.delete` | Soft-delete a `cms_pages` row (`deleted_at`) | **06 §1.5 — new here** | `cms_page.delete` |
| 55 | `content.preview` | `createPreviewToken()`, `revokePreviewToken()` — minting a link a stranger can open | 07 §2.3 | — |
| 56 | `journal.manage` | `journal_posts` CRUD **and** publish | 07 §2.3 | `journal.update`, `journal.publish` |
| 57 | `menu.manage` | `navigation_menus` / `navigation_items`, `saveMenu()` | 07 §2.3 | `navigation.update` |
| 58 | `redirect.manage` | `redirects` CRUD and CSV import | 07 §2.3 | — |
| 59 | `seo.manage` | `seo_metadata` overrides, `curated_facets`, robots directives | 07 §2.3 | `catalog.settings.update` |
| | **Markets and settings** | | | |
| 60 | `market.preview` | Mint a market-preview token (04 §7.2); reach `/_preview/**` | 07 §2.3 | — |
| 61 | `market.manage` | `markets`, `currencies`, `market_locations`, payment-provider binding, activation | 07 §2.3 | — |
| 62 | `settings.read` | Read non-secret `settings` rows: copy, thresholds, shipping bands | 07 §2.3 | — |
| 63 | `settings.manage` | Write `settings` (feature flags, retention, error copy) **and `email_templates`** | 07 §2.3 | `settings.update`, `email_template.update` |
| 64 | `integration.manage` | Integration status, `/admin/system/webhooks` console, `/api/health?verbose=1` | 07 §2.3 | — |
| | **Identity** | | | |
| 65 | `user.manage` | Invite, edit, deactivate staff; assign roles; `resetTotp`, `unlockUser` — subject to 07 §2.6 | 07 §2.3 | — |
| 66 | `role.manage` | Create roles, edit `role_permissions` | 07 §2.3 | — |
| 67 | `audit.read` | `/admin/system/audit-log` | 07 §2.3 | — |
| | **Tools and system** | | | |
| 68 | `import.run` | Reach the import tool, upload a CSV, run the bounded dry run. **Never authorises the apply** (§1.5) | 07 §2.3 | — |
| 69 | `export.run` | Reach the export tool. Each resource additionally needs its own read permission | 07 §2.3 | — |
| 70 | `job.read` | `/admin/system/jobs`, `/api/admin/jobs/[id]/stream` | 07 §2.3 | — |
| 71 | `job.retry` | Requeue a failed job | 07 §2.3 | — |
| 72 | `search.manage` | Zero-result report, synonyms, promotions, search redirects, manual reindex | 07 §2.3 | — |
| | **Reviews** | | | |
| 73 | `review.moderate` | `/admin/catalog/reviews`: approve, reject and unpublish a `product_reviews` row; nothing else writes `product_reviews.status` | 15 §3.3 | — |

> **DECISION CHANGED:** the catalogue was 72 keys and `15 §3.3` named
> `review.moderate` as a *future* one-row edit ("the catalogue stays at 72 keys for
> release 1"). Set decision **D-A** ships the review schema **and admin moderation**
> in release 1, so the key lands now — which is also what `§1.2` rule 1 requires: the
> key is in the registry before any route references it. What `09 §5.2` still defers
> is the customer-facing **submission** UI, not the schema, not the moderation queue
> and not the JSON-LD truth test. The key is numbered 73 rather than inserted beside
> the other catalogue keys because this table is append-only: a renumber invalidates
> every "`11 §1.3` row N" citation in `04`–`15`.

**Four keys with no canonical equivalent are now canonical** — `cms.delete`,
`cms.restore`, `media.hard_delete`, `media.update`. The critic is right that this
was a decision about the *shape* of the matrix, not a rename: there was no way to
express "may restore a version but not publish it" or "may permanently destroy a
Cloudinary asset" in 07's catalogue, and both capabilities are specified
behaviour in `06 §5.4` and `06 §7.8`.

**Three rejected spellings collapse two capabilities into one, deliberately:**

- `journal.update` / `journal.publish` → **`journal.manage`.** 07 owns the matrix
  and grants `cms.publish` to `content_editor` anyway; splitting journal while
  pages are unsplit for the same role produces a distinction with no holder.
- `email_template.update` → **`settings.manage`.** `08 §5` already routes
  `/admin/settings/email-templates` to `settings.manage`; two documents beat one.
- `payment.replay_webhook` → **`integration.manage` + `order.refund`**, both
  required (08 §5 already corrected itself).

> **NEEDS INPUT:** whether `content_editor` may publish content unsupervised.
> This document follows `07 §2.5` and grants them `cms.publish` and
> `journal.manage`. `06 §1.5` assumed an owner/admin publish gate. Both are one
> row of `role_permissions`; the answer is an editorial-governance decision, not
> an architectural one, and it is reversible from `/admin/settings/roles` with no
> deploy.

### 1.4 The complete role → permission matrix

**This table supersedes `07 §2.5`.** `src/lib/rbac/matrix.ts` exports it as
`Record<RoleKey, readonly PermissionKey[]>`; `prisma/seed/02-roles.ts` writes it
into `role_permissions`; `tests/integration/rbac-matrix.test.ts` proves the
running system behaves exactly like it. Where this table and `07 §2.5` differ,
this one is right and §10 lists the edit.

Role keys are `02 §2.2` verbatim: `owner`, `admin`, `catalog_manager`,
`inventory_manager`, `order_manager`, `content_editor`, `analyst`.

| Permission | `owner` | `admin` | `catalog_manager` | `inventory_manager` | `order_manager` | `content_editor` | `analyst` |
| --- | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| `dashboard.view` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `product.read` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `product.create` | ✓ | ✓ | ✓ | — | — | — | — |
| `product.update` | ✓ | ✓ | ✓ | — | — | — | — |
| `product.delete` | ✓ | ✓ | ✓ | — | — | — | — |
| `product.publish` | ✓ | ✓ | ✓ | — | — | — | — |
| `variant.update` | ✓ | ✓ | ✓ | — | — | — | — |
| `catalog.product_media` | ✓ | ✓ | ✓ | — | — | ✓ | — |
| `category.update` | ✓ | ✓ | ✓ | — | — | — | — |
| `collection.update` | ✓ | ✓ | ✓ | — | — | — | — |
| `stone.update` | ✓ | ✓ | ✓ | — | — | — | — |
| `material.update` | ✓ | ✓ | ✓ | — | — | — | — |
| `attribute.update` | ✓ | ✓ | ✓ | — | — | — | — |
| `tag.update` | ✓ | ✓ | ✓ | — | — | ✓ | — |
| `media.read` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `media.create` | ✓ | ✓ | ✓ | — | — | ✓ | — |
| **`media.update`** | ✓ | ✓ | ✓ | — | — | ✓ | — |
| `media.delete` | ✓ | ✓ | — | — | — | ✓ | — |
| **`media.hard_delete`** | ✓ | — | — | — | — | — | — |
| `media.upload_vector` | ✓ | ✓ | — | — | — | — | — |
| `price.read` | ✓ | ✓ | ✓ | — | ✓ | — | ✓ |
| **`price.read_cost`** | ✓ | ✓ | — | — | — | — | — |
| `price.update` | ✓ | ✓ | ✓ | — | — | — | — |
| **`price.recalc_preview`** | ✓ | ✓ | ✓ | — | — | — | — |
| `price.approve_recalc` | ✓ | ✓ | — | — | — | — | — |
| `metal_rate.manage` | ✓ | ✓ | ✓ | — | — | — | — |
| `pricing_rule.manage` | ✓ | ✓ | ✓ | — | — | — | — |
| `inventory.read` | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ |
| `inventory.adjust` | ✓ | ✓ | — | ✓ | — | — | — |
| `inventory.transfer` | ✓ | ✓ | — | ✓ | — | — | — |
| `location.manage` | ✓ | ✓ | — | ✓ | — | — | — |
| `order.read` | ✓ | ✓ | — | ✓ | ✓ | — | ✓ |
| `order.create` | ✓ | ✓ | — | — | ✓ | — | — |
| `order.update` | ✓ | ✓ | — | — | ✓ | — | — |
| **`order.discount_manual`** | ✓ | ✓ | — | — | ✓ | — | — |
| `order.fulfil` | ✓ | ✓ | — | ✓ | ✓ | — | — |
| `order.cancel` | ✓ | ✓ | — | — | ✓ | — | — |
| `order.refund` | ✓ | ✓ | — | — | ✓ | — | — |
| `return.read` | ✓ | ✓ | — | ✓ | ✓ | — | ✓ |
| `return.update` | ✓ | ✓ | — | ✓ | ✓ | — | — |
| `return.approve` | ✓ | ✓ | — | — | ✓ | — | — |
| `customer.read` | ✓ | ✓ | — | ✓ | ✓ | — | — |
| `customer.update` | ✓ | ✓ | — | — | ✓ | — | — |
| `customer.export` | ✓ | ✓ | — | — | — | — | — |
| `customer.anonymize` | ✓ | — | — | — | — | — | — |
| `user.impersonate` | ✓ | ✓ | — | — | — | — | — |
| `coupon.manage` | ✓ | ✓ | — | — | — | — | — |
| `campaign.manage` | ✓ | ✓ | — | — | — | ✓ | — |
| `newsletter.manage` | ✓ | ✓ | — | — | — | ✓ | — |
| `cms.read` | ✓ | ✓ | ✓ | — | — | ✓ | ✓ |
| `cms.update` | ✓ | ✓ | — | — | — | ✓ | — |
| `cms.publish` | ✓ | ✓ | — | — | — | ✓ | — |
| **`cms.restore`** | ✓ | ✓ | — | — | — | ✓ | — |
| **`cms.delete`** | ✓ | ✓ | — | — | — | — | — |
| `content.preview` | ✓ | ✓ | ✓ | — | — | ✓ | — |
| `journal.manage` | ✓ | ✓ | — | — | — | ✓ | — |
| `menu.manage` | ✓ | ✓ | — | — | — | ✓ | — |
| `redirect.manage` | ✓ | ✓ | — | — | — | ✓ | — |
| `seo.manage` | ✓ | ✓ | ✓ | — | — | ✓ | — |
| `market.preview` | ✓ | ✓ | ✓ | — | — | ✓ | — |
| `market.manage` | ✓ | — | — | — | — | — | — |
| `settings.read` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `settings.manage` | ✓ | ✓ | — | — | — | — | — |
| `integration.manage` | ✓ | — | — | — | — | — | — |
| `user.manage` | ✓ | ✓ | — | — | — | — | — |
| `role.manage` | ✓ | — | — | — | — | — | — |
| `audit.read` | ✓ | ✓ | — | — | — | — | — |
| `import.run` | ✓ | ✓ | ✓ | ✓ | — | — | — |
| `export.run` | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ |
| `job.read` | ✓ | ✓ | ✓ | ✓ | ✓ | — | — |
| `job.retry` | ✓ | ✓ | — | — | — | — | — |
| `search.manage` | ✓ | ✓ | ✓ | — | — | ✓ | — |
| **`review.moderate`** | ✓ | ✓ | ✓ | — | — | — | — |

`owner` holds all 73 by explicit `role_permissions` rows, never by a runtime
short-circuit (07 §2.6). `tests/unit/rbac-catalogue.test.ts` fails when
`matrix.owner.length !== PERMISSION_KEYS.length`.

**Why the seven new keys sit where they do.** `price.read_cost` is supplier cost
and margin, which `04 §4` explicitly wants withheld from a merchandiser auditing
prices, so it stops at `owner`/`admin`. `price.recalc_preview` reaches
`catalog_manager` because they enter the rates; `price.approve_recalc` does not,
because "a role that may edit one price must not be able to ship eight thousand"
(04 §1.3). `order.discount_manual` follows `order.create`. `cms.restore` follows
`cms.publish` — withholding it from a role that can already publish is
incoherent. `media.hard_delete` is `owner` only because it destroys the provider
asset irreversibly.

### 1.5 The two generic tools do not launder permissions

`requiredPermissionsForImport(resource, mode)` is exhaustive over
`import_jobs.resource` (§7.6) and is checked as the first statement of
`importJobApply()` in `src/lib/importexport/apply.ts`:

| `import_jobs.resource` | Required **in addition to** `import.run` |
| --- | --- |
| `products` | `product.update`; plus `product.create` when `mode ∈ {create, upsert}` |
| `variants` | `variant.update`; plus `product.create` when `mode ∈ {create, upsert}` |
| `prices` | `price.update` |
| `inventory` | `inventory.adjust` |
| `customers` | `customer.update` **and** `customer.export` |
| `redirects` | `redirect.manage` |

`exportRun()` requires `export.run` plus the resource's own read permission, plus
`customer.export` for any resource containing customer PII (`customers`,
`orders`, `returns`), plus **`price.read_cost`** for any export whose columns
include `cost_minor` or a derived margin. The export writer for `products`,
`variants` and `prices` **omits those columns** for an actor without
`price.read_cost` rather than refusing the export — the same projection rule the
screens use (§1.2 rule 3) — and
`tests/integration/export-cost-columns.test.ts` asserts a `catalog_manager`
export of `prices` contains no cost header (`14 §8.4`). The permission is
re-checked **inside** the `export` job, not only at enqueue: `export` is
`systemPermitted: false` (§3.2) and the actor is re-resolved at run time (§3.3),
so a role revoked between enqueue and drain drops the columns.

### 1.6 CI enforcement

| Test | What it greps / asserts |
| --- | --- |
| `tests/unit/rbac-catalogue.test.ts` | Every string literal in `src/**` matching `/^[a-z_]+(\.[a-z_]+)+$/` that is passed to `requirePermission`, `can`, `adminAction` or a `RouteAuth` of `kind: 'staff'` — **including one nested inside an
`{ kind: 'any', options: RouteAuth[] }` member, walked recursively** (`07 §3.4`,
set decision D-B) — is a member of `PERMISSION_KEYS`; every `PERMISSION_KEYS` entry has a row in the seeded `permissions` table; every key appears in at least one `matrix.ts` role array; `matrix.owner.length === PERMISSION_KEYS.length`; **and no source file anywhere under `src/` or `docs/architecture/` contains any string in the `Renamed from` column of §1.3** |
| `tests/integration/rbac-matrix.test.ts` | For each of the seven roles: sign in holding only that role, invoke every exported admin action with a minimal valid payload, and assert the set that did **not** return `FORBIDDEN` equals that role's row of §1.4 exactly |
| `tests/integration/rbac-escalation.test.ts` | 07 §2.6's three invariants, unchanged |

---

## 2. ErrorCode taxonomy

### 2.1 Where it lives and the closed union

```ts
// src/lib/errors.ts — one base class, one code per failure, one copy key.
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
  abstract readonly copyKey: string;              // `copy.error.<lower_snake(code)>`
  readonly retryable: boolean = false;
  readonly fields?: Record<string, string[]>;     // VALIDATION_FAILED family only
  readonly context: Record<string, unknown> = {}; // logged, NEVER serialised to a client
}
```

**Every class extends `AppError` directly.** Domain files (`src/lib/pricing/errors.ts`,
`src/lib/cms/errors.ts`, …) re-export their own classes from the one base; there
is no second base and no second `ErrorCode` union.

**Three names in `01`–`08` are type aliases over a union of these classes, not
classes.** Declaring them as classes is how a second taxonomy starts:

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

### 2.2 The complete class table — 52 codes

**Safe** = the resolved `copy.error.*` string may be shown to a customer as-is.
`no` means the class is admin-only or its message names an internal fact; the
customer-facing surface renders the generic panel plus a `requestId`.

| Class | Code | HTTP | copyKey (`copy.error.` + …) | Safe | Result / throw | Introduced in |
| --- | --- | ---: | --- | :-: | --- | --- |
| `ValidationError` | `VALIDATION_FAILED` | 400 | `validation_failed` | yes | Result at UI boundaries, throw at trusted ones | 08 §1.4 |
| `AttributeValidationError` | `ATTRIBUTE_VALIDATION_FAILED` | 422 | `attribute_validation_failed` | no | Result | 03 §3.4 |
| `NotFoundError` | `NOT_FOUND` | 404 | `not_found` | yes | throw → `notFound()` | 08 §1.4 |
| `SlugTakenError` | `SLUG_TAKEN` | 409 | `slug_taken` | no | Result | 08 §1.4 |
| `DuplicateError` | `DUPLICATE` | 409 | `duplicate` | no | Result | 08 §1.4 |
| `UnauthenticatedError` | `UNAUTHENTICATED` | 401 | `unauthenticated` | yes | throw | 08 §1.4 |
| `ForbiddenError` | `FORBIDDEN` | 403 | `forbidden` | no | throw | 08 §1.4 |
| `TotpRequiredError` | `TOTP_REQUIRED` | 403 | `totp_required` | no | throw | 07 §1.9 |
| `SessionExpiredError` | `SESSION_EXPIRED` | 401 | `session_expired` | yes | throw | 08 §1.4 |
| `LastOwnerError` | `LAST_OWNER` | 409 | `last_owner` | no | Result | **07 §2.6 — new here** |
| `MarketNotFoundError` | `MARKET_NOT_FOUND` | 404 | `market_not_found` | yes | throw → `notFound()` | 08 §1.4 |
| `MarketChangedError` | `MARKET_CHANGED` | 409 | `market_changed` | yes | **Result** | 08 §1.4 |
| `ProductUnavailableInMarketError` | `PRODUCT_UNAVAILABLE_IN_MARKET` | 409 | `product_unavailable_in_market` | yes | Result | 08 §1.4 |
| `StaleWriteError` | `STALE_WRITE` | 409 | `stale_write` | no | **Result** | 08 §1.4 |
| `ConflictError` | `CONFLICT` | 409 | `conflict` | no | **Result** | **04 §1.5, 06 §2.2 — new here** |
| `ConcurrencyError` | `CONCURRENCY` | 409 | `concurrency` | yes | Result | 08 §1.4 |
| `IllegalTransitionError` | `ILLEGAL_TRANSITION` | 409 | `illegal_transition` | no | Result | 08 §1.4 |
| `IllegalCheckoutTransitionError` | `ILLEGAL_CHECKOUT_TRANSITION` | 409 | `illegal_checkout_transition` | yes | **Result** | **05 §3.2 — new here** |
| `PreflightRequired` | `PREFLIGHT_REQUIRED` | 409 | `preflight_required` | no | **Result** | **06 §5.4 — new here** |
| `SkuConflictError` | `SKU_CONFLICT` | 409 | `sku_conflict` | no | Result | **03 §2.2 — new here** |
| `VariantConflictError` | `VARIANT_CONFLICT` | 409 | `variant_conflict` | no | Result | **03 §2.2 — new here** |
| `TooManyCombinationsError` | `TOO_MANY_COMBINATIONS` | 422 | `too_many_combinations` | no | Result | **03 §2.2 — new here** |
| `PriceChangedError` | `PRICE_CHANGED` | 409 | `price_changed` | yes | **Result** | 08 §1.4 |
| `PriceUnavailableError` | `PRICE_UNAVAILABLE` | 422 | `price_unavailable` | yes | Result | 08 §1.4 |
| `RateUnavailableError` | `RATE_UNAVAILABLE` | 422 | `rate_unavailable` | no | Result | **04 §1.5 — new here** |
| `RateStaleError` | `RATE_STALE` | 422 | `rate_stale` | no | Result | **04 §1.5 — new here** |
| `RateProviderError` | `RATE_PROVIDER_ERROR` | 502 | `rate_provider_error` | no | Result | **04 §3.2 — new here** |
| `FormulaInvalidError` | `FORMULA_INVALID` | 422 | `formula_invalid` | no | Result | **04 §1.5 — new here** |
| `ManualOverrideError` | `MANUAL_OVERRIDE` | 409 | `manual_override` | no | Result | **04 §1.5 — new here** |
| `TooManyLinesError` | `TOO_MANY_LINES` | 422 | `too_many_lines` | no | Result | **04 §1.5 — new here** |
| `RecalcStaleError` | `RECALC_STALE` | 409 | `recalc_stale` | no | Result | **04 §1.5 — new here** |
| `InsufficientStockError` | `INSUFFICIENT_STOCK` | 409 | `insufficient_stock` | yes | **Result** | 08 §1.4 |
| `LineUnavailableError` | `LINE_UNAVAILABLE` | 409 | `line_unavailable` | yes | **Result** | **05 §2.4 — new here** |
| `CartEmptyError` | `CART_EMPTY` | 409 | `cart_empty` | yes | Result | 08 §1.4 |
| `CartConvertedError` | `CART_CONVERTED` | 409 | `cart_converted` | yes | **Result** | **05 §3.6 — new here** |
| `CouponInvalidError` | `COUPON_INVALID` | 422 | `coupon_invalid` | yes | Result | 08 §1.4 |
| `CouponUnavailableError` | `COUPON_UNAVAILABLE` | 409 | `coupon_unavailable` | yes | **Result** | **05 §8.5 — new here** |
| `GiftCardInvalidError` | `GIFT_CARD_INVALID` | 422 | `gift_card_invalid` | yes | Result | 08 §1.4 |
| `GiftCardUnavailableError` | `GIFT_CARD_UNAVAILABLE` | 409 | `gift_card_unavailable` | yes | **Result** | **05 §8.7 — new here** |
| `TotalsChangedError` | `TOTALS_CHANGED` | 409 | `totals_changed` | yes | **Result** | 08 §1.4 |
| `ShippingUnavailableError` | `SHIPPING_UNAVAILABLE` | 422 | `shipping_unavailable` | yes | Result | 08 §1.4 |
| `ShippingMethodUnavailableError` | `SHIPPING_METHOD_UNAVAILABLE` | 409 | `shipping_method_unavailable` | yes | **Result** | 08 §1.4 |
| `TaxUnavailableError` | `TAX_UNAVAILABLE` | 422 | `tax_unavailable` | yes | Result | 08 §1.4 |
| `TaxUnconfiguredError` | `TAX_UNCONFIGURED` | 503 | `tax_unconfigured` | yes | **Result** | **09 P22(e) — new here** |
| `DutyUnavailableError` | `DUTY_UNAVAILABLE` | 422 | `duty_unavailable` | yes | Result | **04 §8.4 — new here** |
| `OverRefundError` | `OVER_REFUND` | 409 | `over_refund` | no | Result | 08 §1.4 |
| `PaymentsUnconfiguredError` | `PAYMENTS_UNCONFIGURED` | 503 | `payments_unconfigured` | yes | **Result** | **05 §3.6 — new here** |
| `PreviewTokenError` | `PREVIEW_TOKEN_INVALID` | 404 | `preview_token_invalid` | yes | throw → `notFound()` | **06 §4.4 — new here** |
| `RateLimitedError` | `RATE_LIMITED` | 429 | `rate_limited` | yes | throw (route) / Result (action) | 08 §1.4 |
| `IntegrationUnconfiguredError` | `INTEGRATION_UNCONFIGURED` | 503 | `integration_unconfigured` | yes | **Result** | 08 §1.4 |
| `ProviderError` | `PROVIDER_ERROR` | 502 | `provider_error` | yes | throw | 08 §1.4 |
| `InternalError` | `INTERNAL` | 500 | `internal` | yes | throw | 08 §1.4 |

**Two pairs that look redundant and are not:**

- `TAX_UNAVAILABLE` vs `TAX_UNCONFIGURED`. The first is "the provider was reached
  and cannot quote this destination"; the second is "there is no tax
  configuration at all — zero Stripe Tax registrations, or `tax_mode = 'none'`
  without the per-market `settings['tax.allow_zero_tax_market']` row". `09 §1.5`
  ranks the second the ninth most expensive mistake in the project precisely
  because nothing errors: the checkout succeeds and the liability accrues
  silently. It fails closed with a 503, and `09 P22(e)`'s launch blocker is
  satisfiable as written.
- `COUPON_INVALID` vs `COUPON_UNAVAILABLE` (and the gift-card pair). `_INVALID` is
  "this code does not apply to this bag in this market", raised by
  `evaluateDiscounts()` at read time and rendered from the reason keys in
  `05 §8.4`. `_UNAVAILABLE` is "the conditional `UPDATE` in the order transaction
  affected zero rows" — the cap was exhausted or the balance moved between the
  quote and the redemption. They produce different copy and different UI: the
  first re-renders the bag, the second stops `placeOrder` after stock is already
  reserved.

**Rejected spellings** — grep for these:

| Rejected | Canonical | Where it appeared |
| --- | --- | --- |
| `CouponInapplicableError` | `CouponInvalidError` | 04 §1.3 |
| `TaxUnavailableError` used for "no registrations" | `TaxUnconfiguredError` | 08 §1.4 vs 09 P22 |
| `computeTax(...)` | `quoteTax(input)` (§10) | 05 §3.6 |
| `PricingError` / `CheckoutError` / `RefundError` as classes | type aliases (§2.1) | 04 §1.5, 01 §2.3, 05 §9.4 |

### 2.3 CI enforcement

| Test | What it greps / asserts |
| --- | --- |
| `tests/api/error-taxonomy.test.ts` | Every concrete subclass of `AppError` exported anywhere under `src/lib/**` has a `code` in `ERROR_CODES`, a unique `code`, exactly one `httpStatus`, and a `copyKey` matching `^copy\.error\.[a-z_]+$`; every `ErrorCode` has exactly one class; every `copyKey` resolves against `DEFAULT_ERROR_COPY` |
| `tests/unit/error-copy-seeded.test.ts` | Every `copyKey` has a `settings` row with `group_key = 'copy_errors'` in `prisma/seed/06-settings.ts` |
| `tests/e2e/public-api-leak.spec.ts` | No response body of any class marked **Safe = no** reaches a customer surface; `AppError.context` never appears in a serialised response |

---

## 3. `job_kind` enum

### 3.1 The enum, complete

`job_kind` is a Postgres enum (`02 §1.9`). Each value ships in its **own**
migration ahead of the migration that uses it (`01 §5.4`).

```sql
-- 02 §1.9, verbatim (8 values)
CREATE TYPE job_kind AS ENUM (
  'import_apply','export','bulk_edit','recalc_apply',
  'collection_refresh','sitemap_rebuild','email_batch','reindex_search');

-- eleven additions, one migration each — nineteen values in total
ALTER TYPE job_kind ADD VALUE 'publish_scheduled';        -- 03 §1.2
ALTER TYPE job_kind ADD VALUE 'media_orphan_scan';        -- 06 §7.1
ALTER TYPE job_kind ADD VALUE 'product_metrics_refresh';  -- 06 §2.1
ALTER TYPE job_kind ADD VALUE 'consistency_check';        -- 09 §2.7
ALTER TYPE job_kind ADD VALUE 'reconcile_inventory';      -- 09 §2.7
ALTER TYPE job_kind ADD VALUE 'send_email';               -- 05 §4.3 (used, never declared)
ALTER TYPE job_kind ADD VALUE 'analytics_dispatch';       -- 08 §7.2 (used, never declared)
ALTER TYPE job_kind ADD VALUE 'feed_rebuild';             -- 08 §3.7 (used, never declared)
ALTER TYPE job_kind ADD VALUE 'audit_archive';            -- 07 §7.4 (used as 'export', wrongly)
ALTER TYPE job_kind ADD VALUE 'customer_group_refresh';   -- 15 §1.6
ALTER TYPE job_kind ADD VALUE 'account_export';           -- 07 §8.4
```

> **DECISION CHANGED:** this enum was nineteen values only after `13`–`15` landed;
> it was **seventeen** when this section was written, and `06 §4.4` and
> `09 §2.7` still say "seventeen". `customer_group_refresh` (rule-based customer
> groups) and `account_export` (the customer's own subject-access bundle) are the
> two additions, and both are `systemPermitted: true` for the reasons their rows
> in §3.2 give.

> **RESOLVED — was CHANGE REQUIRED IN 06 §4.4 and 09 §2.7 / §1.2 P29:** every "the complete
> *Verified applied in 06.*
> seventeen-value `job_kind`" becomes **nineteen**. `02 §1.9` must carry all
> eleven `ALTER TYPE` rows, not nine.

### 3.2 The registry

`src/lib/jobs/kinds.ts` mirrors the enum and carries the metadata `runJob()`
reads. **`systemPermitted`** is the field that replaces `07 §3.2`'s closed
allowlist.

```ts
export type JobKindDefinition = {
  readonly kind: JobKind;
  /** May this kind run with jobs.created_by_user_id IS NULL, as systemActor('job')? */
  readonly systemPermitted: boolean;
  /** Non-null ⇒ jobs.dedupe_key is required and uq_jobs_dedupe applies. */
  readonly dedupeKey: 'none' | 'kind' | 'market' | 'entity' | 'caller_supplied';
  readonly maxAttempts: number;
};
export const JOB_KINDS: Readonly<Record<JobKind, JobKindDefinition>>;
```

| `job_kind` | Enqueued by | System actor allowed? | Dedupe | Notes |
| --- | --- | :-: | --- | --- |
| `import_apply` | `importJobApply()` — staff, `import.run` + §1.5 | **no** | caller (`import_jobs.id`) | NULL creator ⇒ `FORBIDDEN` in `jobs.error` |
| `export` | `exportRun()` — staff, `export.run` (+ `customer.export`) | **no** | caller (`jobs.id`) | NULL creator ⇒ failed |
| `bulk_edit` | Admin bulk bar over >50 rows (01 §2.7); market activation rescore (03 §1.6) | **no** | caller | The market-activation rescore is enqueued **with the acting user's id**, not as system |
| `recalc_apply` | `applyRecalcRun()` — staff, `price.approve_recalc` | **no** | entity (`recalc_run_id`) | `uq_jobs_dedupe` + the conditional `UPDATE recalc_runs … WHERE status='approved'` fail independently (04 §3.3) |
| `email_batch` | Campaign / newsletter send — staff, `newsletter.manage` or `campaign.manage` | **no** | caller | A **marketing** batch. Not the transactional path |
| `send_email` | `handleProviderWebhook()`, `/api/cron/release-reservations`, `/api/cron/abandoned-carts`, returns/refunds, OTP fallback | **yes** | entity | One transactional message. Payload is `{ templateKey, toEmail, marketCode, entityRef }` |
| `collection_refresh` | Nightly cron; `saveCollectionRules()` | **yes** | kind | Idempotent whole-table rebuild (02 §2.9) |
| `sitemap_rebuild` | `/api/cron/sitemap-ping`; every publish-class mutation | **yes** | kind | Idempotent whole-table rebuild |
| `reindex_search` | `reindexProductsForEntity()` above 200 products; bulk import completion | **yes** | kind | Idempotent whole-table rebuild |
| `publish_scheduled` | `saveProduct()` / `schedulePage()` when `published_at > now()` | **yes** | entity (`productId`/`pageId`) | Re-asserts the payload's timestamp before publishing (03 §1.2) |
| `media_orphan_scan` | Weekly, from `run-jobs` | **yes** | kind | Deletes provider assets with no `media` row older than 24 h |
| `product_metrics_refresh` | Nightly, from `run-jobs`; `/api/cron/pricing-rule-windows` for the products a rule boundary moved | **yes** | kind | Refreshes `product_market_sort.units_90d` **and** the two reporting rollups `product_daily_metrics` and `market_daily_metrics` (`14 §4.2`). One kind, three tables, one `dedupeKey: 'kind'` — a second refresh kind would need a second singleton index and could interleave with this one over the same source table. `product_market_metrics` does not exist (§7.9) |
| `consistency_check` | Nightly, from `run-jobs` | **yes** | kind | `materialized_path`, `collections.last_refreshed_at`, gift-card ledger vs balance, redirect destinations |
| `reconcile_inventory` | Nightly, from `run-jobs` | **yes** | kind | `reserved_quantity` vs `SUM(reservation_lines)`, `on_hand` vs the ledger. **Reports, never self-heals** (09 P19(d)) |
| `analytics_dispatch` | `analytics.record()`, in the same transaction | **yes** | none | Meta CAPI / GA4 MP send, consent-checked at run time (08 §7.2) |
| `feed_rebuild` | Price write, publish toggle, slug change, band-crossing or one-of-a-kind stock movement | **yes** | **market** | Per market, not per kind — a kind-wide singleton would collapse two markets into one rebuild (08 §3.7) |
| `audit_archive` | Weekly, from `run-jobs` | **yes** | kind | The off-site append-only audit copy. `07 §7.4` calls it `job_kind = 'export'`; that would make a human-only kind machine-originated and is superseded here |
| `customer_group_refresh` | `saveCustomerGroupRules()` above 2,000 members; nightly from `run-jobs` (15 §1.6) | **yes** | entity (`group:{id}` or `boundary:{date}`) | Evaluates one customer against ≤ 12 groups; **never writes a row whose `customer_group_source = 'manual'`**. The handler calls `resolveCustomerGroup()`, which takes no `Actor` and performs no permission check of its own — assignment by rule is not an act of authority |
| `account_export` | `requestDataExport()` — the **customer's own session**, not staff (07 §8.4) | **yes** | entity (`customer:{id}`) | The customer's own subject-access bundle; reads **only rows scoped to that customer** and calls no permission-gated mutator. The authorisation for the *request* is the customer's session; for the *delivery*, the single-use emailed token. Forcing it through `export` — a `systemPermitted: false`, staff-only kind — was the error. Rate limited `account-export:customer:<id>` 1/24 h (§4.2) |

> **SCHEMA ADDITION (02 §2.9, `jobs`):** `dedupe_key TEXT NULL`, plus
> `CREATE UNIQUE INDEX uq_jobs_dedupe ON jobs (kind, dedupe_key)
> WHERE dedupe_key IS NOT NULL AND status IN ('queued','running');`
> `04 §3.3` already assumes this index exists. `idx_jobs_singleton` (02 §2.9) is
> widened to every kind whose `dedupeKey` is `'kind'`:
> `sitemap_rebuild`, `collection_refresh`, `reindex_search`,
> `media_orphan_scan`, `product_metrics_refresh`, `consistency_check`,
> `reconcile_inventory`, `audit_archive`.

### 3.3 `runJob()` — the actor rule, and why the confirmation email sends

**C3 resolved.** `07 §3.2`'s rule is a closed allowlist of three kinds, written
before `send_email`, `feed_rebuild`, `analytics_dispatch`, `media_orphan_scan`,
`product_metrics_refresh`, `consistency_check`, `reconcile_inventory` and
`audit_archive` existed. Under it every order-confirmation, shipping, refund and
cancellation email fails as `FORBIDDEN` in `jobs.error`, silently, from the first
paid order. The allowlist is replaced by a per-kind declaration:

```ts
// src/lib/jobs/run.ts
export async function runJob(job: Job): Promise<void> {
  const def = JOB_KINDS[job.kind];

  const actor: Actor =
    job.created_by_user_id !== null
      // Re-resolved from the database at run time, never carried in the payload.
      // Inactive, soft-deleted, or no longer holding what the job needs ⇒ the job
      // fails as FORBIDDEN with that reason in jobs.error (07 §3.2, unchanged).
      ? await staffActorFor(job.created_by_user_id)
      : def.systemPermitted
        ? systemActor('job')
        : failJob(job, 'FORBIDDEN: this job kind requires an originating user');

  await JOB_HANDLERS[job.kind](job, actor);
}
```

Three properties this preserves and one it fixes:

1. **A human-originated job still runs as that human.** `import_apply`, `export`,
   `bulk_edit`, `recalc_apply` and `email_batch` have `systemPermitted: false`,
   so `jobs.created_by_user_id ON DELETE SET NULL` cannot promote a queued price
   import from "runs with their permissions" to "runs with all of them" — the
   check is the kind, not the practice of soft-deleting users.
2. **A machine-originated job runs as `systemActor('job')`** and `can()` returns
   `true` for it — which is safe only because every `systemPermitted: true`
   handler calls exactly one service function that takes no permission:
   `email.send()`, `revalidateTags()`, `reindexProduct()`, `refreshCollection()`,
   `enumerateSitemap()`, `resolveCustomerGroup()`, the customer-scoped
   subject-access reader, a Cloudinary delete, a vendor POST, or a read-only
   reconciliation. `tests/unit/job-handlers-unprivileged.test.ts` AST-parses each
   of those handlers and fails on a call to any function that appears in
   `services-authorized.test.ts`'s mutator list.
3. **A `send_email` job written inside the webhook transaction carries
   `created_by_user_id = NULL`** because a webhook handler has no user — and
   `send_email` is `systemPermitted: true`, so it runs. That is the whole of C3.
   `tests/integration/webhook-duplicate.test.ts` is extended to assert one
   `email_logs` row with `status <> 'skipped_unconfigured'` after a paid webhook.
4. **`jobs.dedupe_key` for `send_email` is the natural key of the message** —
   `order:{orderId}:order_confirmation` — so a retried webhook or a replayed
   cron pass cannot send twice even before `webhook_events` de-duplication
   catches it.

### 3.4 CI enforcement

| Test | What it greps / asserts |
| --- | --- |
| `tests/unit/job-kinds.test.ts` | The `job_kind` values introspected from `pg_enum` equal `Object.keys(JOB_KINDS)` exactly; every string literal passed to `enqueueJob({ kind })` anywhere in `src/` is a member; every kind has a handler in `JOB_HANDLERS`; every `dedupeKey !== 'none'` kind is covered by `uq_jobs_dedupe` or `idx_jobs_singleton` |
| `tests/integration/jobs-worker.test.ts` | A `NULL`-creator job of each `systemPermitted: true` kind completes; a `NULL`-creator job of each `systemPermitted: false` kind ends `failed` with `FORBIDDEN` in `jobs.error` |

---

## 4. Rate-limit key inventory

`07 §5.5` and `08 §2.3` both claimed to be complete and disagreed by five keys.
This table is the reconciliation and **the whole inventory**: a `RateLimitSpec`
whose key prefix is not listed here fails `tests/unit/ratelimit-keys.test.ts`.

### 4.1 Key material, defined once

| Placeholder | Produced by | Value |
| --- | --- | --- |
| `<ip64>` | `rateLimitIpKey(headers)` in `src/lib/security/ip.ts` | Full IPv4 address, or the **/64 prefix** for IPv6. Read from `x-vercel-forwarded-for`, then `x-real-ip`, then the **last** entry of `x-forwarded-for` |
| `<email>` | `rateLimitKey(prefix, email)` | First 16 bytes, hex, of `HMAC-SHA256(PASSWORD_PEPPER, lower(trim(email)))` — never the address in the clear (07 §5.5) |
| `<sid>` | The `md_sid` cookie | Anonymous session id, **client-held**, so every `…:session:` row is paired with an `…:ip:` row |
| `<hash>` | `sha256(md_cart)` hex | The cart token hash, server-derived |
| `<cartId>` / `<userId>` / `<id>` | Server-resolved row ids | Never from a request body |
| `<jti>` | The `md_totp` JWT's `jti` | Burn, not a limit — `window_start = to_timestamp(jwt.iat)` (07 §1.5 rule 6) |

Storage is the `rate_limits` table, fixed window, one atomic
`INSERT … ON CONFLICT (key, window_start) DO UPDATE … RETURNING count`
(`02 §2.9`). `consume()` never joins the caller's transaction (07 §5.5).
`RATE_LIMIT_BACKEND=upstash` is a drop-in behind the same interface and changes
no key.

### 4.2 The table — 46 keys

| Key prefix | Endpoint / caller | Limit | Window | Fail | Source |
| --- | --- | ---: | --- | :-: | --- |
| `typeahead:ip:<ip64>` | `GET /api/catalog/typeahead` | 30 | 1 min | open | 08 |
| `search:ip:<ip64>` | `GET /api/search`, `/search` render | 60 | 1 min | open | 08 |
| `catalog:ip:<ip64>` | `/api/catalog/products`, `/facets`, `/availability` | 120 | 1 min | open | 08 |
| `redirects-snapshot:ip:<ip64>` | `GET /api/catalog/redirects` | 20 | 1 min | open | **08 — missing from 07** |
| `redirect-hit:ip:<ip64>` | `POST /api/catalog/redirect-hit` | 60 | 1 min | open | 08 |
| `search-click:session:<sid>` | `POST /api/search/click` | 60 | 1 min | open | 08 |
| `search-click:ip:<ip64>` | `POST /api/search/click` | 300 | 1 min | open | **08 — missing from 07** |
| `analytics:session:<sid>` | `POST /api/analytics/[market]/collect` | 120 | 1 min | open | 08 |
| `analytics:ip:<ip64>` | `POST /api/analytics/[market]/collect` | 600 | 1 min | open | **08 — missing from 07** |
| `cart:token:<hash>` | `GET /api/cart` and every cart server action | 60 | 1 min | open | 08 |
| `shipping-quote:cart:<cartId>` | `POST /api/checkout/shipping-quote` | 30 | 1 min | open | 08 |
| `checkout:ip:<ip64>` | `placeOrderAction` | 10 | 10 min | **closed** | 08 |
| `checkout-status:ip:<ip64>` | `GET /api/checkout/status/[orderId]` | 120 | 1 min | **closed** | **08 — missing from 07** |
| `coupon:cart:<cartId>` | `applyCouponToCart` | 10 | 10 min | **closed** | 07 |
| `coupon:ip:<ip64>` | `applyCouponToCart` | 60 | 1 hour | **closed** | **new — the §4.3 pairing rule** |
| `giftcard:cart:<cartId>` | `applyGiftCard` | 5 | 10 min | **closed** | **05 §8.7 — reconciled** |
| `giftcard:ip:<ip64>` | `applyGiftCard` | 20 | 24 hours | **closed** | **05 §8.7 — reconciled** |
| `order-token:ip:<ip64>` | `/orders/[token]` | 20 | 1 hour | **closed** | 07 |
| `login:email:<email>` | `customerLogin` | 10 | 15 min | **closed** | 08 |
| `login:email:<email>:day` | `customerLogin` | 50 | 24 hours | **closed** | 07 |
| `login:ip:<ip64>` | `customerLogin` | 30 | 15 min | **closed** | 07 |
| `admin-login:email:<email>` | `staffLogin` | 5 | 15 min | **closed** | 07 |
| `admin-login:ip:<ip64>` | `staffLogin` | 20 | 15 min | **closed** | 07 |
| `totp:user:<userId>` | `/admin/login/2fa`, `requireRecentTotp` | 5 | 5 min | **closed** | 07 |
| `totp-jti:<jti>` | `md_totp` replay burn | 1 | token `iat`→`exp`+1 h | **closed** | 07 |
| `otp:email:<email>` | `requestOtp` (email or E.164, hashed) | 5 | 15 min | **closed** | 08 |
| `otp:ip:<ip64>` | `requestOtp` | 20 | 1 hour | **closed** | 08 |
| `reset:email:<email>` | `requestPasswordReset` | 3 | 1 hour | **closed** | 07 |
| `reset:ip:<ip64>` | `requestPasswordReset` | 10 | 1 hour | **closed** | 07 |
| `register:ip:<ip64>` | `customerRegister` | 5 | 1 hour | **closed** | 07 |
| `verify-email:customer:<id>` | Verification re-send (07 §1.7) | 5 | 1 hour | **closed** | 07 |
| `email-change:customer:<id>` | `requestEmailChange` | 3 | 24 hours | **closed** | 07 |
| `newsletter:ip:<ip64>` | `subscribeNewsletter` | 5 | 1 hour | **closed** | 07 |
| `account-export:customer:<id>` | `requestDataExport` | 1 | 24 hours | **closed** | 07 |
| `impersonate:user:<userId>` | `startImpersonation` | 5 | 24 hours | **closed** | 07 |
| `media-sign:user:<userId>` | `POST /api/media/sign`, `POST /api/media/svg` | 60 | 1 hour | **closed** | 07 |
| `export:user:<userId>` | `exportRun()` | 5 | 1 hour | **closed** | 07 |
| `revalidate:ip:<ip64>` | `POST /api/revalidate` | 30 | 1 min | **closed** | **08 — missing from 07** |
| `webhook:ip:<ip>` | `/api/webhooks/stripe`, `/api/webhooks/razorpay` | 600 | 1 min | open | 05 §4.3, 09 R05a |
| `csp-report:ip:<ip64>` | `POST /api/security/csp-report` | 20 | 1 hour | open | 07 §5.8 |
| `preview-token:ip:<ip64>` | `resolvePreviewToken()` on `/_preview/[market]/[token]/**` | 60 | 1 hour | **closed** | **06 §4.4 — missing from both** |
| `cms-heartbeat:session:<sid>` | `GET /api/admin/cms/pages/[id]/heartbeat` | 10 | 1 min | open | **06 §6.4 — missing from both** |
| `bisr:ip:<ip64>` | `POST /api/catalog/notify-me` | 10 | 1 hour | **closed** | **15 §5.2** |
| `bisr:email:<email>` | `POST /api/catalog/notify-me` | 5 | 24 hours | **closed** | **15 §5.2** |
| `wishlist-share:ip:<ip64>` | `GET /wishlist/shared/[token]` | 60 | 1 hour | **closed** | **15 §6** |
| `admin-search:user:<userId>` | `GET /api/admin/search` | 120 | 1 min | **closed** | **13 §6.1** |

**Four additions and one withdrawn spelling.**

- `bisr:ip` and `bisr:email` fail **closed** because `/api/catalog/notify-me`
  sends mail to an address the caller supplies, which puts it in rule 2's
  credential-and-money class, not the telemetry class. `<email>` uses the
  existing `rateLimitKey(prefix, email)` HMAC material, so
  `tests/unit/no-plaintext-ratelimit-keys.test.ts` passes unchanged, and neither
  key's material is `<sid>`, `<cartId>` or `<hash>`, so rule 1 commissions no
  sibling.
- `wishlist-share:ip` fails closed because `/wishlist/shared/[token]` is a token
  oracle over a 32-byte space and a fail-open limiter on it is a free enumeration
  endpoint; the handler needs the database anyway.
- `admin-search:user` fails closed because the ⌘K palette enumerates order
  numbers, SKUs and email addresses. It needs **no** `…:ip:` sibling under §4.3
  rule 1: `<userId>` is the staff session's server-derived `user_id`, not a value
  the browser supplies.

> **DECISION CHANGED:** `07 §4.3`'s `share-wishlist:ip:<ip64>` at **30 / 1 min**
> is **withdrawn**. It and `15 §6`'s `wishlist-share:ip:<ip64>` at 60 / 1 hour are
> one limiter on one route under two spellings, and a registry that carries both
> fails `tests/unit/ratelimit-keys.test.ts` on whichever one the handler did not
> use. The canonical row is the one in this table — **`wishlist-share:ip:<ip64>`,
> 60 per hour, fail-closed** (set decision D-G). An hour window is the right one
> for an enumeration surface: 30/min permits 43,200 guesses a day, 60/hour permits
> 1,440.

> **RESOLVED — was CHANGE REQUIRED IN 07 §4.3:**
> *Applied. The change now lives in 07 §4.2 — canonical key wishlist-share:ip:<ip64>, 60/hour, fail-closed.*
> replace "the specific key is
> `share-wishlist:ip:<ip64>`" with `wishlist-share:ip:<ip64>` at 60 / 1 hour,
> fail-closed, and delete its `CHANGE REQUIRED IN 11 §4.2` callout — it has been
> considered and superseded here, not overlooked. `share-wishlist` joins the
> rejected-spelling class of §1.3 and must appear in no source file.

### 4.3 The two rules the table encodes

1. **Every `…:session:<sid>` and `…:cart:<cartId>` row is paired with an
   `…:ip:<ip64>` row, and `consume()` is called twice with the stricter verdict
   winning.** A session id is a value the browser supplies (`02 §2.9`), so a
   limiter keyed on it alone is defeated by `crypto.randomUUID()` per request.
   The client-held key catches a runaway loop in our own code and produces a
   readable `rate_limits.key`; the IP key catches an adversary. This is why
   `coupon:ip` and `giftcard:ip` exist and why `08`'s five additions are kept
   rather than dropped to satisfy `07`'s completeness claim.
2. **Fail-open vs fail-closed is per row.** Catalogue and telemetry reads fail
   open — refusing to serve because a counter could not be written is a
   self-inflicted outage. Credential, money and oracle endpoints fail closed,
   which costs nothing because the handler needs the database anyway.
   `redirects-snapshot` is the one deliberate exception on the closed side: the
   edge map's whole design is fail-open (`01 §2.1`), so a limiter that could
   block a refresh would be worse than the flood it prevents.

### 4.4 CI enforcement

| Test | What it greps / asserts |
| --- | --- |
| `tests/unit/ratelimit-keys.test.ts` | Every `RateLimitSpec` literal in `src/**` — `{ key, limit, windowSeconds, failOpen }` and every `rateLimit:` field of a `withRoute({...})` call — has a key whose prefix (everything before the first `:` placeholder) is a member of `RATE_LIMIT_KEYS`, and whose `limit`/`windowSeconds`/`failOpen` match this table |
| `tests/unit/ratelimit-pairing.test.ts` | Every key whose material is `<sid>`, `<cartId>` or `<hash>` has a sibling `…:ip:<ip64>` key in `RATE_LIMIT_KEYS` |
| `tests/api/ratelimit.test.ts` | 429 with `Retry-After` at the configured threshold for login, OTP, checkout, coupon apply, gift-card apply and search |
| `tests/unit/no-plaintext-ratelimit-keys.test.ts` (F11) | After exercising login, reset and OTP, no row of `rate_limits` contains an `@` |

---

## 5. Cron registry

**Ten entries, not nine.** `01 §5.6` tabulates nine and `04 §5.4` requires
`/api/cron/pricing-rule-windows` while citing `01 §5.6` for it. Nine is not a
bookkeeping slip: without the tenth, a sale that ended at midnight keeps being
served from the ISR cache until each entry's `revalidate` lapses, in both
currencies, and `product_market_sort` keeps filtering on the withdrawn price
(`08 §2.3`).

### 5.1 `vercel.json`, verbatim

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

`vercel.json` carries crons and function config and **no `headers` key**
(`01 §5.8`). `src/lib/config/crons.ts` exports `CRON_JOBS` with the same ten
rows plus `maxRuntimeMs`, and is what the registry test compares against.

### 5.2 What each one does, and what breaks without it

| Path | Schedule | What it does | What breaks if it does not run | Max acceptable runtime |
| --- | --- | --- | --- | ---: |
| `/api/cron/release-reservations` | `*/5 * * * *` | Releases `reservations` past `expires_at` (`release_reason='expired'`); deletes expired `checkout_sessions` with a null `order_id`; **second pass:** cancels `pending_payment` orders older than `ORDER_PAYMENT_EXPIRY_MINUTES` and reverses their coupon redemption and gift-card debits (05 §8.8); **third pass:** `sweepBackInStock()` over the variant ids released in passes one and two (15 §5.3) | An abandoned checkout holds a one-of-a-kind piece off sale indefinitely; a capped coupon is exhausted by abandonment; a customer's gift card is silently drained; **a piece freed by an expiring checkout notifies nobody, because a release writes no `inventory_transactions` row for the §5.3 hook to see** | 120 s |
| `/api/cron/pricing-rule-windows` | `*/5 * * * *` | Purges `market:{code}` and `product:{id}` for every `pricing_rules` window that opened or closed since the last run; re-runs `reindexProduct()` for the products whose effective display price moved; enqueues `feed_rebuild` per affected market | A scheduled sale appears on the PLP, the PDP and the bag at three different moments; a **withdrawn** sale keeps being charged; `product_market_sort` filters and sorts on a price the page is not rendering | 60 s |
| `/api/cron/run-jobs` | `*/5 * * * *` | Prelude: `runScheduledPublishes(now)` + the `next_boundary_at` sweep (06 §4.3). Then `drainJobs({ maxMs: 240_000 })` over the `jobs` queue. Also enqueues the nightly `customer_group_refresh` boundary pass (15 §1.6) | Nothing deferred ever executes: no CSV apply, no export, no bulk edit, no approved recalculation, no confirmation email, no scheduled publish, no feed — **and no customer crosses a spend or tenure threshold until someone edits them by hand** | 300 s (`maxDuration: 300`) |
| `/api/cron/retry-webhooks` | `*/15 * * * *` | Retries `webhook_events` with `status='failed' AND attempts < 8`, exponential backoff, via `idx_webhook_events_retry` | A transient failure at the moment a payment lands leaves the order `pending_payment` forever, and the provider has already stopped retrying | 120 s |
| `/api/cron/abandoned-carts` | `0 * * * *` | Queues one abandoned-cart `send_email` per qualifying cart; stamps `abandoned_email_sent_at` | No recovery mail; the mechanism `02 §2.7` indexes for (`idx_carts_abandoned`) is inert | 120 s |
| `/api/cron/metal-rate-refresh` | `0 3 * * *` | Fetches one `metal_rates` row per (material × currency) via `MetalRateProvider`; creates a **preview only** (`previewing → pending_approval`). Never writes `prices` | Rates go stale; `PRICING_RATE_MAX_AGE_HOURS` starts skipping every recalc line. **Disabled and reported as skipped when `METAL_RATE_PROVIDER=manual`** | 120 s |
| `/api/cron/low-stock-digest` | `0 4 * * *` | Internal low-stock digest from `idx_inventory_low_stock` | Nobody is told a piece is about to run out; reordering is reactive | 60 s |
| `/api/cron/sitemap-ping` | `30 4 * * *` | Rebuilds sitemap shards, purges `sitemap`, enqueues `feed_rebuild` per market as a floor, submits changed URLs to IndexNow when `INDEXNOW_KEY` is set. **Production only** | `lastmod` goes stale; new products are announced only when a shard's 3600 s TTL lapses; the feed stops regenerating | 300 s |
| `/api/cron/cleanup-sessions` | `0 5 * * *` | Prunes `sessions`, `otp_requests`, `rate_limits`, `content_preview_tokens`, `analytics_events`, `search_queries`, `email_logs`, `jobs`, `import_job_rows`, inactive `carts`; runs `pruneVersions()` in batches of 500 | Every credential-hash and telemetry table grows without bound; `content_versions` becomes the largest table in the database | 300 s |
| `/api/cron/reconcile-payments` | `0 6 * * *` | Compares `payments`/`refunds` against the provider for 72 h; re-derives order header sums for 48 h; flags orphan provider payments, over-refunds and stuck `paid_unfulfillable` orders; replays missed events through `handleProviderWebhook()` | The net under every webhook assumption in `01 §2.5` is gone: money taken with no order, or an order paid at the provider and `pending_payment` here, is discovered by a customer | 300 s |

Every handler: verifies `CRON_SECRET` **and** the `x-vercel-cron` header
(`auth: { kind: 'cron' }`, `sameOrigin` off — 07 §3.4), is idempotent, takes a
`jobs` row lock so two invocations cannot overlap, and writes a run record
surfaced at `/admin/system/jobs`.

**The Vercel plan is part of this registry.** Three `*/5` entries, one `*/15`,
and `maxDuration: 300` are above the Hobby tier, which silently coerces cron
schedules to a small number of daily runs (`01 §5.1`). `09 §5.1` requires
observing `release-reservations` execute ≥ 10 times in one hour in production
before go-live; that is the direct test of this row.

### 5.3 CI enforcement

| Test | What it greps / asserts |
| --- | --- |
| `tests/unit/cron-registry.test.ts` | Three sets are equal: the directory names under `src/app/api/cron/*/route.ts`, the `path` values in `vercel.json#crons`, and the keys of `CRON_JOBS` in `src/lib/config/crons.ts`. Schedules must match string-for-string. Neither an unregistered handler nor a registered path with no handler passes |
| `tests/api/auth-modes.test.ts` | Every cron route rejects a request missing **either** `CRON_SECRET` or `x-vercel-cron` with 401, and accepts one carrying both with **no `Origin` header** (07 §3.4, B19) |

---

## 6. `IntegrationKey` union

`01 §4.9` presents eight values as the complete type; five documents widen it by
prose. The complete union is **fourteen**.

```ts
// src/lib/config/integrations.ts
export type IntegrationKey =
  | 'stripe' | 'razorpay'                                   // payments
  | 'cloudinary'                                            // media
  | 'resend' | 'otp_sms'                                    // messaging
  | 'sentry'                                                // observability
  | 'ga4' | 'gtm' | 'meta_pixel' | 'meta_capi' | 'google_ads' // analytics
  | 'metal_rate_api'                                        // pricing
  | 'indexnow'                                              // seo
  | 'upstash';                                              // infrastructure

export const INTEGRATION_KEYS: readonly IntegrationKey[] = Object.freeze([...]);
export type IntegrationState = 'configured' | 'unconfigured' | 'error';
export function integrationStatus(key: IntegrationKey): {
  state: IntegrationState; missingKeys: string[]; lastErrorAt: Date | null;
};
```

| Key | Env vars that must all be present | `unconfigured` means, to the customer | Launch blocker (09 §5.1)? |
| --- | --- | --- | :-: |
| `stripe` | `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` | US checkout renders the blocking panel: "Online payment is not yet available for this region. No order has been created." No cart cleared, no order row, no mail | **yes** |
| `razorpay` | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `NEXT_PUBLIC_RAZORPAY_KEY_ID`, `RAZORPAY_WEBHOOK_SECRET` | The same panel under `/in`; or `markets.is_active = false` for `IN` and the India storefront 404s | **yes**, unless India launches inactive |
| `cloudinary` | `CLOUDINARY_CLOUD_NAME`, `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Existing images still resolve (URLs are built, not fetched); **new** uploads are disabled with the reason inline and `/api/media/sign` returns 503. No data-URI placeholder is ever written to `media` | **yes** |
| `resend` | `RESEND_API_KEY`, `EMAIL_FROM` | No transactional mail. `email_logs` rows are written with `status = 'skipped_unconfigured'` and a count is surfaced in the admin. **The UI never says "confirmation sent"** | **yes** |
| `otp_sms` | `OTP_SMS_PROVIDER`, `OTP_SMS_API_KEY`, `OTP_SMS_SENDER_ID`, `OTP_SMS_DLT_TEMPLATE_ID` | The India login screen renders the SMS option **disabled with the reason inline**; email OTP and password login are unaffected | no |
| `sentry` | `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` | Nothing customer-facing. Failures are visible only in Vercel logs; the `fatal` alert path does not exist | **yes** |
| `ga4` | `NEXT_PUBLIC_GA4_MEASUREMENT_ID` | No GA4 script renders. First-party `analytics_events` are unaffected and the admin dashboard keeps working with its source label | no |
| `gtm` | `NEXT_PUBLIC_GTM_CONTAINER_ID` | No container loads. When **set**, GTM is the only tag loader and the direct GA4/Ads/Pixel snippets are suppressed — two loaders double-count conversions | no |
| `meta_pixel` | `NEXT_PUBLIC_META_PIXEL_ID` | No pixel renders. **No placeholder pixel is ever emitted**, and `connect.facebook.net` is not added to `script-src` | no |
| `meta_capi` | `META_CAPI_ACCESS_TOKEN` | `analytics_dispatch` jobs skip the Meta target and record it; server-side conversions are simply absent, never faked | no |
| `google_ads` | `NEXT_PUBLIC_GOOGLE_ADS_ID`, `GOOGLE_ADS_CONVERSION_LABEL_PURCHASE` | The global tag does not render; with the id but no label, the tag loads for remarketing and the purchase conversion is unattributed | no |
| `metal_rate_api` | `METAL_RATE_PROVIDER` (≠ `manual`), `METAL_RATE_API_URL`, `METAL_RATE_API_KEY` | Nothing customer-facing. `/api/cron/metal-rate-refresh` no-ops and says so at `/admin/system/jobs`; rates are entered by hand at `/admin/pricing/metal-rates`, which is a **supported launch state** | no |
| `indexnow` | `INDEXNOW_KEY` (+ the key file served at `/{INDEXNOW_KEY}.txt`) | Nothing customer-facing. `sitemap-ping` attempts no submission and reports `indexnow: unconfigured` rather than silently doing nothing | no |
| `upstash` | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Read **only** when `RATE_LIMIT_BACKEND=upstash`; otherwise ignored entirely and `state` is `unconfigured` by design, not by omission | no |

`/admin/settings/integrations` lists all fourteen with their state and the exact
missing variable names, and never a value (`07 §5.10`). `npm run check:env`
prints the same table. `09 §5.1`'s "all green" blocker means the six rows marked
**yes** above.

**CI enforcement.** `tests/unit/integration-keys.test.ts`: every string literal
passed to `integrationStatus()` anywhere in `src/` is a member of
`INTEGRATION_KEYS`; every member has a non-empty env-var list in
`src/lib/config/env.ts`; every env var named in `01 §4` belongs to exactly one
integration or to the `required` set.

---

## 7. Small closed unions that cross documents

Each subsection gives the canonical values, the file that declares them, and the
database object that enforces them where one exists.

### 7.1 `AvailabilityBand` — five values

```ts
// src/types/inventory.ts — re-exported from src/lib/inventory/index.ts
export type AvailabilityBand = 'in_stock' | 'low' | 'out' | 'made_to_order' | 'sold';
export const AVAILABILITY_BANDS: readonly AvailabilityBand[] =
  Object.freeze(['in_stock', 'low', 'out', 'made_to_order', 'sold']);
```

| Band | Condition | Surface |
| --- | --- | --- |
| `made_to_order` | `product_variants.inventory_policy IN ('made_to_order','untracked')` — no `inventory_items` row exists | "Made to order · ships in N days"; JSON-LD `PreOrder`. **For a product whose `kind = 'gift_card'` the copy key is `copy.availability.gift_card` and the JSON-LD is `InStock`** — the band is unchanged, the *rendering* of the band branches on `products.kind` (15 §2.2). A digital card delivered by email in a minute is neither made to order nor a pre-order |
| `sold` | `products.is_one_of_a_kind AND products.sold_at IS NOT NULL` | SOLD plate; add-to-bag **removed**, not disabled; JSON-LD `SoldOut`; visibility per `catalog.ooak_sold_visibility` |
| `out` | `sold_at IS NULL` **and** `sellable(variant, market) = 0` | "Notify me" → `back_in_stock_requests`; JSON-LD `OutOfStock` |
| `low` | `1 ≤ sellable ≤ AVAILABILITY_LOW_THRESHOLD` (`= 2`) | "Only N left", never on a one-of-a-kind piece |
| `in_stock` | `sellable > AVAILABILITY_LOW_THRESHOLD` | — |

`sellable(variant, market)` is `05 §1.1`'s definition verbatim, and the fifth
value is **not** `available_quantity <= 0`: for an inventory of one that is also
true for the thirty minutes another shopper's reservation holds it, and a SOLD
plate over an unsold piece is a lie the page then retracts without telling anyone
(03 §2.5).

`07 §8.2`'s public-API denylist row must read the five values, not four — the
sold state is precisely what a competitor may see and a stock **count** is what
they may not.

**The union stays closed at five.** A sixth value for gift cards was the obvious
alternative and it is refused: every band consumer — the PDP, the card, the feed,
`offers.availability`, the admin grid — would need a new branch to render a state
that is `in_stock` in every respect that matters. What branches is the
*rendering*, on `products.kind`, in two places (the copy key and the JSON-LD
availability), and `tests/unit/jsonld-truth.test.ts`'s assertion "every
`availability` matches the band the page showed" holds because both sides read
the same branch (`08 §3.2`).

### 7.2 Checkout step names — four values

```ts
// src/lib/checkout/steps.ts
export const CHECKOUT_STEPS = ['information', 'delivery', 'payment', 'processing'] as const;
export type CheckoutStep = (typeof CHECKOUT_STEPS)[number];
```

Enforced by `chk_checkout_sessions_step CHECK (step IN ('information','delivery','payment','processing'))`
(`05 §3.2`). **`shipping` is not a step name** — it survives in `08 §7.1`'s
analytics table and in nothing else. The `checkout_step_completed` analytics
event's `step` property takes these four values and no others.

### 7.3 `order_status` — seven values, `pending_review` included

```sql
ALTER TYPE order_status ADD VALUE 'pending_review' AFTER 'paid';
```

| Value | Meaning |
| --- | --- |
| `pending_payment` | Order written, no verified payment yet |
| `paid` | A verified webhook moved it; stock committed |
| `pending_review` | **Paid, and held for manual fraud review** above `settings['security.high_value_review_threshold']` (per-currency `money`) |
| `paid_unfulfillable` | Paid, stock could not be re-secured; auto-refunded |
| `processing` | Released for fulfilment |
| `completed` | Every shipment delivered (terminal) |
| `cancelled` | Terminal |

**Transitions** — `src/lib/orders/stateMachine.ts`, asserted exhaustively by
`tests/unit/order-state-machine.test.ts`:

| From | To |
| --- | --- |
| `pending_payment` | `paid`, `pending_review`, `paid_unfulfillable`, `cancelled` |
| `paid` | `processing`, `pending_review`, `cancelled` |
| `pending_review` | `processing`, `cancelled` |
| `paid_unfulfillable` | `cancelled`, `processing` (only after stock is re-secured by hand) |
| `processing` | `completed`, `cancelled` |
| `completed` | — (terminal) |
| `cancelled` | — (terminal) |

Rules that make `09 R23`'s launch blocker satisfiable as written:

- The webhook path (`05 §4.3`) transitions to `pending_review` **instead of**
  `paid` when `orders.total_minor ≥ settings['security.high_value_review_threshold']`
  for that order's currency. `payment_status` is `paid` either way, `paid_at` is
  set either way, and `commitStock()` runs either way — the money and the stock
  are settled; only fulfilment is held.
- Releasing requires **`order.update`** (owner, admin, order_manager) — not
  `order.fulfil`, which `inventory_manager` holds: the warehouse must not be able
  to release a fraud hold. The release writes an `order_events` row of type
  `status_changed` and an `audit_logs` row.
- `createShipment()` refuses unless `orders.status IN ('paid','processing')`, so
  a held order cannot be picked.
- `settings['security.high_value_review_threshold']` is `value_type = 'money'`
  and therefore market-scoped; a `NULL` value means **no hold**, which is the
  seeded state.

> **NEEDS INPUT:** the high-value manual-review threshold per market — the figure
> above which a paid order is held in `pending_review` rather than released for
> fulfilment. `09 §5.1` makes "set to a figure the client named in writing" a
> hard launch blocker. It is seeded `NULL` (no hold) and no number is invented.

### 7.4 `price_source` — three values

`manual | metal_linked | hybrid` (`02 §1.9`), matching
`ResolvedPrice.priceSource` (`01 §2.3`). No fourth value, and no rename.

Two vocabulary consequences this document does own, because a registry that does
not say which columns exist is unusable — the *behaviour* behind them belongs to
the agent resolving C1:

- **`prices.floor_minor` does not exist.** The floor is
  `pricing_formula_market_terms.floor_minor` (`04 §2.2`), and the clamp's effect
  is recorded on the price row as `floor_adjustment_minor`. `03 §2.4`'s
  `chk_prices_hybrid_floor` and `chk_prices_floor_source` are therefore not
  migrated; `chk_prices_hybrid_adjustment` (`04 §2.4`) is.
- **`resolvePrice` never calls `evaluateFormula`.** `09 P11(b)` tests it and
  `04 §1.3` states it as a signature-level fact. A `metal_linked` or `hybrid`
  price is a stored `prices` row exactly like a manual one.

### 7.5 `saved_view_resource` — eight values

`products | variants | orders | customers | inventory | prices | returns | media`
(`02 §1.9`). Each value's sort and filter whitelist is §8; each value's read
permission gates the view (§1.2 rule 3).

### 7.6 `import_jobs.resource` — six values

`products | variants | prices | inventory | customers | redirects` (`02 §2.9`).

> **SCHEMA ADDITION (02 §2.9, `import_jobs`):**
> `CONSTRAINT chk_import_jobs_resource CHECK (resource IN
> ('products','variants','prices','inventory','customers','redirects'))`.
> `02 §1.9` requires an explicit `CHECK` on every small `TEXT` value set and lists
> `import_jobs.resource` among them; the constraint was never written down.
> `requiredPermissionsForImport()` (§1.5) is exhaustive over the same six.

### 7.7 `cms_sections.background_token` — seven values plus `NULL`

The one small `TEXT` set in the schema with no `CHECK` (`99` hand-waved claim 10;
`02 §1.9` requires one everywhere else). The permitted values are the **surface**
tokens from `10 §2.1` — never a semantic alias, because an alias stored in data is
indirection the renderer has to resolve twice, and never a hex, which `02 §2.8`
already forbids in prose and nothing enforced.

```ts
// src/lib/cms/backgroundTokens.ts — generated from src/styles/tokens.css at build time
export const BACKGROUND_TOKENS = [
  '--md-ivory-soft',   // page ground (the default when NULL)
  '--md-ivory',        // raised / alternating band
  '--md-stone',        // quiet divider band
  '--md-emerald-deep', // primary dark surface
  '--md-forest',       // secondary dark surface
  '--md-green-dark',   // deep panel / image scrim base
  '--md-green-black',  // near-black ground, full-bleed editorial
] as const;
```

> **SCHEMA ADDITION (02 §2.8, `cms_sections`):**
> ```sql
> ALTER TABLE cms_sections ADD CONSTRAINT chk_cms_sections_background_token
>   CHECK (background_token IS NULL OR background_token IN (
>     '--md-ivory-soft','--md-ivory','--md-stone',
>     '--md-emerald-deep','--md-forest','--md-green-dark','--md-green-black'));
> ```
> `NULL` means "inherit the page ground", which is `--md-bg`. `10 §2.1`'s
> `surface="ivory" | "emerald"` is the **editor's** two-way toggle and maps to
> `--md-ivory` and `--md-emerald-deep`; the other five are available in the
> section inspector's advanced group. The same list is the allowed value set of
> the `background_token` fields on the `banner`, `cta`, `heritage` and
> `newsletter` blocks (`06 §2.1`), validated by their registry schemas.

`SectionSnapshot.backgroundToken` is typed
`(typeof BACKGROUND_TOKENS)[number] | null`, not `string | null`.

**CI enforcement.** `tests/unit/background-tokens.test.ts` asserts the CHECK's
value list, `BACKGROUND_TOKENS`, and the custom properties actually declared in
`src/styles/tokens.css` are the same set — so deleting a token from the
stylesheet fails the build instead of rendering `var(--md-gone)` as transparent.

### 7.8 Other closed unions reproduced verbatim from `02 §1.9`

These are listed so the other agents know they are **unchanged** and need no
edit: `product_status`, `inventory_policy`, `attribute_data_type`,
`collection_mode`, `collection_rule_field` (+ `stone_is_lab_grown`, `is_on_sale`
from `03 §6.2`), `collection_rule_operator` (+ `not_contains`),
`price_change_reason`, `pricing_rule_scope`, `pricing_rule_adjustment`,
`recalc_run_status`, `inventory_transaction_type`, `reservation_status`,
`reservation_ref_kind`, `cart_status`, `payment_status`, `fulfillment_status`,
`payment_event_type`, `shipment_status`, `return_status`, `refund_status`,
`discount_type`, `discount_trigger`, `coupon_condition_type`, `gift_card_status`,
`content_status` (+ `publishing` from `06 §4.3`), `content_entity_type`,
`media_kind`, `product_media_role`, `seo_entity_type`, `redirect_source`,
`email_log_status`, `job_status`, `import_mode`, `import_row_status`,
`webhook_status`, `otp_purpose` (+ `staff_invite`, `data_export` from `07 §1.5`),
`actor_type`, `address_kind`, `tax_mode`.

### 7.9 One table name settled, because two registries depended on it

`product_market_metrics` (`06 §2.1`) and `product_market_sort` (`08 §2.3`) are
one fact with two tables, two refresh jobs and two `units_90d` columns with
different predicates.

**Decision: the table is `product_market_sort`** (`08 §2.3`'s DDL, verbatim,
including the composite FK to `markets (code, currency_code)` and the two
indexes), and the refresh job kind is **`product_metrics_refresh`** (`06 §2.1`'s
name, the only enum value either document proposed). `product_market_metrics` is
not created.

- `08`'s argument is the stronger one: `sort=price` has no stable single-column
  keyset value without a per-product rollup, and `min_price_minor` is written
  **transactionally** by `reindexProduct()` inside the price-change transaction.
- `units_90d` uses `08 §2.3`'s predicate — paid, non-cancelled,
  `quantity - returned_quantity` — because aggregating `order_items` alone ranks
  whatever people *tried* to buy.
- `product_grid.sort = 'best_selling'` reads
  `product_market_sort (market_code, units_90d DESC, product_id)`. The value is
  **`best_selling`**, matching `chk_collections_sort_order` (`02 §2.4`);
  `06 §2.1`'s `bestselling` is a rejected spelling.
- `product_market_sort` may appear in a `WHERE` or an `ORDER BY` and **nowhere
  else** (`08 §3.2`): it is a cache, and reading an amount out of it to publish
  or to charge is a second price authority.

### 7.10 `review_status` — three values, and the one counter that crosses documents

```sql
CREATE TYPE review_status AS ENUM ('pending', 'published', 'rejected');  -- own migration
```

`15 §3.2` owns the tables (`product_reviews`, `product_review_stats`,
`product_review_votes`); this section owns the two names that four documents
otherwise spell differently.

- **`product_review_stats.approved_count`** is the canonical name for the number
  of that product's reviews with `status = 'published'`. `15 §3.4`'s
  `rating_count` is a **rejected spelling** and joins the class of §1.3: it must
  appear in no source file. One column, one meaning — the count of approved rows,
  and nothing else feeds it.
- **`aggregateRating` is emitted only when `approved_count > 0`**, and
  `ratingValue` / `reviewCount` are computed from approved rows and nothing else.
  That is a *necessary* condition, not the whole gate: `15 §3.4`'s two settings
  (`feature.reviews_structured_data`, seeded `false`, and
  `reviews.min_ratings_for_markup`, seeded 5) narrow it further and are unchanged
  by this entry. Every counted review carries a `NOT NULL order_item_id`, so a
  counted rating is a verified purchase by construction.

> **DECISION CHANGED:** `08 §3.2` said "**No `aggregateRating`, no `review`,
> ever.** There is no `reviews` table in this schema", and `09 §5.2` deferred
> reviews wholesale. Set decision **D-A** ships the three tables and the
> moderation queue in release 1 and defers only the customer-facing **submission
> UI**. Hard rules 7 and 8 are untouched: structured data still never asserts a
> fact the platform cannot guarantee, because `approved_count = 0` emits nothing.
> `tests/unit/jsonld-truth.test.ts` gets **stronger**, not weaker — it moves from
> "reject any object containing `aggregateRating`" to "reject `aggregateRating`
> when `approved_count = 0`, and reject any `ratingValue` not derived from
> approved rows".

> **RESOLVED — was CHANGE REQUIRED IN 15 §3.2, §3.3 and §3.4:** rename `rating_count` to
> *Verified applied in 15.*
> `approved_count` throughout; move the `/admin/catalog/reviews` moderation queue
> and the `review.moderate` key out of the "what does not ship" table into release
> 1 (the key is now §1.3 row 73 and §1.4 grants it to `owner`, `admin`,
> `catalog_manager`); and replace "The catalogue stays at 72 keys for release 1"
> with 73. `mayEmitAggregateRating()`'s third and fourth conditions collapse into
> one — `stats.approved_count >= settings.int('reviews.min_ratings_for_markup')`
> already implies `> 0` for a threshold whose minimum is 1.

---

## 8. Sort and filter whitelists

Four documents promise a whitelist in `src/lib/db/raw/` and none writes it down
(`99` hand-waved claims 1 and 2). This is it.

### 8.1 Where they live and their shape

```ts
// src/lib/db/raw/sorts.ts
export type SortDirection = 'asc' | 'desc';
export type SortFieldSpec = {
  /** The public field name in ?sort=<field>:<dir> and in saved_views.sort. */
  readonly field: string;
  /** The Prisma.sql ORDER BY fragment. Never interpolated from a request. */
  readonly sql: (dir: SortDirection) => Prisma.Sql;
  /** Every component of the ORDER BY, in order, for the keyset cursor `k` (08 §2.3). */
  readonly keyset: readonly string[];
  /** 'market' ⇒ the request must carry a market; 'currency' ⇒ a currency. */
  readonly requires?: 'market' | 'currency' | 'location';
  /** The 02 §4 index that serves it. Asserted by tests/api/sorting.test.ts. */
  readonly index: string;
};
export const SORT_WHITELIST: Readonly<Record<SortResource, readonly SortFieldSpec[]>>;

// src/lib/db/raw/filters.ts
export type FilterOperator =
  | 'eq' | 'ne' | 'in' | 'not_in' | 'lt' | 'lte' | 'gt' | 'gte'
  | 'between' | 'contains' | 'starts_with' | 'is_null' | 'is_not_null';
export type FilterFieldSpec = {
  readonly field: string;
  readonly operators: readonly FilterOperator[];
  readonly requires?: 'market' | 'currency' | 'location' | 'companion';
  readonly index: string;
};
export const FILTER_WHITELIST: Readonly<Record<SortResource, readonly FilterFieldSpec[]>>;
```

`SortResource` is the eight `saved_view_resource` values **plus** `catalog`, the
storefront listing resource that `08 §2.3` describes and no saved view names.
`saved_views.filters` and `saved_views.sort` are validated against the same two
constants on write, so a saved view cannot persist a sort the API would reject.

**`requires: 'companion'`** means the field may not be the only filter: it has no
index of its own and is safe only as a predicate over a set another filter has
already narrowed.

### 8.2 `catalog` — the storefront listing (PLP, collection, stone, search)

| Sort field | Keyset components | Requires | Index (02 §4 unless noted) |
| --- | --- | --- | --- |
| `rank` (default) | `pc.rank, p.rank, p.id` | — | `idx_product_categories_rank (category_id, rank) INCLUDE (product_id)` |
| `created_at` | `p.id` | — | PK — `id` is UUIDv7, so `ORDER BY id` **is** chronological (02 §1.2) |
| `title` | `p.title, p.id` | — | `idx_products_title (title) WHERE deleted_at IS NULL` (02 §4.3) |
| `price` | `pms.min_price_minor, p.id` | **market** | `idx_pms_price (market_code, min_price_minor, product_id)` |
| `best_selling` | `pms.units_90d DESC, p.id` | **market** | `idx_pms_units (market_code, units_90d DESC, product_id)` |
| `relevance` (`/search` only) | `rank::numeric(12,8), p.rank, p.id` | — | `idx_products_search_vector` (GIN) |

| Filter field | Operators | Requires | Index |
| --- | --- | --- | --- |
| `category` (slug) | `eq`, `in` | — | `idx_product_categories_rank`, `idx_categories_path` for subtree |
| `collection` (slug) | `eq`, `in` | — | `idx_product_collections_rank` |
| `stone` (slug) | `eq`, `in` | — | `idx_product_stones (stone_id, product_id)` |
| `material` (slug) | `eq`, `in` | — | `idx_variant_materials_material (material_id, variant_id)` |
| `tag` (slug) | `eq`, `in` | — | `idx_product_tags_tag (tag_id, product_id)` |
| `attr[<attribute.key>]` (option slugs) | `eq`, `in` | — | `idx_pav_filter (attribute_id, option_id, product_id) WHERE option_id IS NOT NULL` |
| `attr_num[<attribute.key>]` | `lt`, `lte`, `gt`, `gte`, `between` | — | `idx_pav_numeric (attribute_id, value_numeric) WHERE value_numeric IS NOT NULL` |
| `price_min` / `price_max` | `gte` / `lte` | **market** | `idx_pms_price` — **minor units in the route market's currency**; a `currency` parameter is a `400` |
| `ring_size`, `length_mm` | `eq`, `between` | — | `idx_variants_product` + column; promoted out of EAV for exactly this (02 §2.4) |
| `availability` | `eq`, `in` (§7.1 bands) | **market** | `idx_inventory_items_variant_location` via `market_locations` |
| `is_one_of_a_kind` | `eq` | — | `idx_products_ooak (id) WHERE is_one_of_a_kind AND deleted_at IS NULL` |
| `is_on_sale` | `eq` | **market** | `idx_prices_on_sale (product_id, market_code) WHERE sale_minor IS NOT NULL …` |
| `q` (free text) | `contains` | — | `idx_products_search_vector` + `idx_products_title_trgm` |

Not allowed on `catalog`, and each for a reason: `cost_minor` and every margin
field (never leaves the service layer for an anonymous caller); `status`,
`deleted_at`, `sold_at` (the publication predicate is not negotiable by a query
string); `stock` as a **number** (`07 §8.2` — a band, never a count).

### 8.3 `products` (admin)

| Sort field | Keyset | Requires | Index |
| --- | --- | --- | --- |
| `created_at` (default) | `p.id` | — | PK (UUIDv7) |
| `updated_at` | `p.updated_at, p.id` | — | **add** `idx_products_updated ON products (updated_at DESC, id DESC) WHERE deleted_at IS NULL` |
| `title` | `p.title, p.id` | — | `idx_products_title` |
| `status` | `p.status, p.published_at DESC, p.id` | — | `idx_products_published` |
| `published_at` | `p.published_at, p.id` | — | `idx_products_published` |
| `completeness_score` | `p.completeness_score, p.id` | — | `idx_products_completeness (completeness_score, id) WHERE deleted_at IS NULL` |
| `seo_score` | `p.seo_score, p.id` | — | **add** `idx_products_seo_score ON products (seo_score, id) WHERE deleted_at IS NULL` |
| `price` | `pms.min_price_minor, p.id` | **market** | `idx_pms_price` |
| `units_90d` | `pms.units_90d DESC, p.id` | **market** | `idx_pms_units` |

**Not sortable: stock.** `02 §4.3` lists "Stock → `idx_inventory_items_variant_location`",
but sorting *products* by stock is an aggregate over every variant × location and
no index serves it. The operational question — "what is running out" — is the
`inventory` resource (§8.7), and the product grid answers it with a filter, not a
sort.

| Filter field | Operators | Requires | Index |
| --- | --- | --- | --- |
| `status` | `eq`, `in` | — | `idx_products_published` |
| `is_one_of_a_kind` | `eq` | — | `idx_products_ooak` |
| `is_made_to_order` | `eq` | `companion` | none — filtered after `idx_products_published` |
| `sold_at` | `is_null`, `is_not_null` | — | `idx_products_sold (sold_at DESC) WHERE sold_at IS NOT NULL AND deleted_at IS NULL` |
| `deleted_at` | `is_null`, `is_not_null` | — | every partial index is `WHERE deleted_at IS NULL` |
| `category_id`, `collection_id`, `stone_id`, `material_id`, `tag_id` | `eq`, `in` | — | as §8.2 |
| `completeness_score` | `lt`, `lte`, `gt`, `gte`, `eq` | — | `idx_products_completeness` — this is `03 §1.6`'s `lt:50`, `lt:80`, `eq:100` |
| `seo_score` | `lt`, `lte`, `gt`, `gte`, `eq` | — | `idx_products_seo_score` (added above) |
| `market_published` | `eq` | **market** | `idx_pmc_market_published (market_code, product_id) WHERE is_published` |
| `priced_in` | `eq` (boolean) | **market** | `idx_prices_live_product (product_id, market_code) WHERE valid_to IS NULL AND deleted_at IS NULL` |
| `price_min` / `price_max` | `gte` / `lte` | **market** | `idx_pms_price` |
| `created_at`, `updated_at`, `published_at` | `gte`, `lte`, `between` | — | PK / the two indexes above |
| `is_demo` | `eq` | — | `idx_products_demo (id) WHERE is_demo` |
| `completeness_check_failed` | `eq`, `in` | — | `idx_products_completeness_checks` |
| `seo_check_failed` | `eq`, `in` | — | `idx_products_seo_checks` |
| `q` | `contains` | — | `idx_products_search_vector`, `idx_products_title_trgm` |

**The two `*_check_failed` fields, because a score is not a checklist**
(`13 §3.3`). `products.completeness_checks` and `products.seo_checks` store
**only the failing** `key → hint` map (`03 §1.6`), so "is `gallery` failing" is a
JSONB key test, not a numeric comparison: `eq` compiles to
`completeness_checks ? $1` and `in` to `completeness_checks ?| $1::text[]` —
both `jsonb_ops` GIN operators, which is why the default opclass is used in
§8.11 and not `jsonb_path_ops`. The accepted values are the fifteen `key`
strings of `03 §1.6` and the nine of `03 §1.7`; a value outside them is a `400`,
the same as any other whitelist violation. Without these two fields the admin's
"Missing Images" and "Missing SEO" views can only approximate themselves with a
`completeness_score` band, which is a different question.

### 8.4 `variants`

| Sort field | Keyset | Requires | Index |
| --- | --- | --- | --- |
| `created_at` (default) | `v.id` | — | PK |
| `sku` | `v.sku, v.id` | — | `idx_variants_sku_live (sku) WHERE deleted_at IS NULL` |
| `position` | `v.product_id, v.position, v.id` | — | `idx_variants_product (product_id, position) WHERE deleted_at IS NULL` |

| Filter field | Operators | Requires | Index |
| --- | --- | --- | --- |
| `product_id` | `eq`, `in` | — | `idx_variants_product` |
| `sku` | `eq`, `starts_with` | — | `idx_variants_sku_live` for `eq`; **add** `idx_variants_sku_prefix ON product_variants (sku text_pattern_ops) WHERE deleted_at IS NULL` for `starts_with` |
| `is_active` | `eq` | `companion` | none |
| `inventory_policy` | `eq`, `in` | `companion` | none |
| `material_id` | `eq`, `in` | — | `idx_variant_materials_material` |
| `option_value_id` | `eq`, `in` | — | `idx_variant_option_values_value (option_value_id, variant_id)` |
| `deleted_at` | `is_null`, `is_not_null` | — | partial indexes |

### 8.5 `orders`

| Sort field | Keyset | Requires | Index |
| --- | --- | --- | --- |
| `placed_at` (default) | `o.market_code, o.status, o.created_at DESC, o.id DESC` | — | `idx_orders_list (market_code, status, created_at DESC)` |
| `created_at` | `o.id` | — | PK |
| `order_number` | `o.order_number, o.id` | — | `uq_orders_number` |
| `total_minor` | `o.total_minor, o.id` | **market** | **add** `idx_orders_market_total ON orders (market_code, total_minor DESC, id DESC)` — sorting money without a market filter compares ₹ to $ and is a `400` |
| `paid_at` | `o.paid_at, o.id` | — | `idx_orders_paid_at (paid_at) WHERE paid_at IS NOT NULL` (08 §2.3) |

| Filter field | Operators | Requires | Index |
| --- | --- | --- | --- |
| `market_code` | `eq`, `in` | — | `idx_orders_list` |
| `status` | `eq`, `in` | — | `idx_orders_list` |
| `payment_status` | `eq`, `in` | `companion` | none — secondary to `market_code`/`status` |
| `fulfillment_status` | `eq`, `in` | — | `idx_orders_unfulfilled (market_code, placed_at) WHERE fulfillment_status IN (…) AND status <> 'cancelled'` |
| `customer_id` | `eq` | — | `idx_orders_customer (customer_id, created_at DESC)` |
| `email` | `eq` | — | `idx_orders_email (lower(email), created_at DESC)` |
| `order_number` | `contains`, `eq` | — | `idx_orders_number_trgm` (GIN, `pg_trgm`) |
| `placed_at`, `paid_at`, `created_at` | `gte`, `lte`, `between` | — | `idx_orders_list` / `idx_orders_paid_at` |
| `total_minor` | `gte`, `lte`, `between` | **market** | `idx_orders_market_total` (added above) |
| `coupon_code` | `eq` | `companion` | none |
| `is_demo` | `eq` | — | `idx_orders_demo (id) WHERE is_demo` |

### 8.6 `customers`

| Sort field | Keyset | Requires | Index |
| --- | --- | --- | --- |
| `created_at` (default) | `c.created_at DESC, c.id DESC` | — | `idx_customers_created (created_at DESC)` |
| `last_order_at` | `c.last_order_at, c.id` | — | **add** `idx_customers_last_order ON customers (last_order_at DESC NULLS LAST, id DESC) WHERE anonymized_at IS NULL` |
| `total_orders_count` | `c.total_orders_count, c.id` | — | **add** `idx_customers_orders_count ON customers (total_orders_count DESC, id DESC) WHERE anonymized_at IS NULL` |
| `total_spent_minor` | `cct.total_spent_minor DESC, c.id` | **currency** | `idx_cct_currency_spend (currency_code, total_spent_minor DESC)` — a per-currency ranking and it cannot be anything else (02 §2.3) |

| Filter field | Operators | Requires | Index |
| --- | --- | --- | --- |
| `customer_group_id` | `eq`, `in` | — | `idx_customers_group (customer_group_id) WHERE anonymized_at IS NULL` |
| `accepts_marketing` | `eq` | `companion` | none |
| `is_guest` | `eq` | `companion` | none |
| `email_verified_at` | `is_null`, `is_not_null` | `companion` | none |
| `anonymized_at` | `is_null`, `is_not_null` | — | `idx_customers_email` (partial) |
| `created_at`, `last_order_at` | `gte`, `lte`, `between` | — | the two indexes above |
| `total_orders_count` | `eq`, `gte`, `lte` | — | `idx_customers_orders_count` |
| `total_spent_minor` | `gte`, `lte`, `between` | **currency** | `idx_cct_currency_spend` |
| `default_market_code` | `eq` | `companion` | none |
| `q` (name or email) | `contains` | — | `idx_customers_search` (GIN over `to_tsvector('simple', …)`) |

Every one of these fields is PII-adjacent: the resource's read permission is
`customer.read`, and an export of it additionally requires `customer.export`
(§1.5).

### 8.7 `inventory` (`inventory_items`)

| Sort field | Keyset | Requires | Index |
| --- | --- | --- | --- |
| `available_quantity` (default) | `ii.location_id, ii.available_quantity, ii.variant_id` | **location** | **add** `idx_inventory_items_location_available ON inventory_items (location_id, available_quantity, variant_id)` |
| `updated_at` | `ii.updated_at, ii.id` | — | **add** `idx_inventory_items_updated ON inventory_items (updated_at DESC, id DESC)` |
| `sku` | `v.sku, ii.id` | — | `idx_variants_sku_live` via the variant join |

**Not sortable: `on_hand_quantity`, `reserved_quantity`, `incoming_quantity`.**
No index serves them and none is added: the operational question every one of
those is asked for is "what can I still sell", which is `available_quantity`
minus safety stock (`05 §1.1`). Adding three more index-per-counter is write cost
on the table every checkout locks.

| Filter field | Operators | Requires | Index |
| --- | --- | --- | --- |
| `location_id` | `eq`, `in` | — | `uq_inventory_items (variant_id, location_id)` / the added index |
| `variant_id` | `eq`, `in` | — | `idx_inventory_items_variant_location` |
| `available_quantity` | `lt`, `lte`, `eq`, `between` | — | `idx_inventory_low_stock (location_id, available_quantity) WHERE available_quantity <= 2` for `lte:2`; the added index otherwise |
| `is_one_of_a_kind` | `eq` | — | `idx_inventory_items_ooak_single_row (variant_id) WHERE is_one_of_a_kind` |
| `reorder_point` | `is_not_null`, `lt`, `lte` | `companion` | none |
| `bin_location` | `eq`, `starts_with` | `companion` | none |

### 8.8 `prices`

| Sort field | Keyset | Requires | Index |
| --- | --- | --- | --- |
| `valid_from` (default) | `pr.product_id, pr.market_code, pr.valid_from DESC, pr.id DESC` | — | `idx_prices_history (product_id, market_code, valid_from DESC)` |
| `list_minor` | `pr.list_minor, pr.id` | **market** | **add** `idx_prices_market_list ON prices (market_code, list_minor, id) WHERE valid_to IS NULL AND deleted_at IS NULL` |
| `created_at` | `pr.id` | — | PK |

| Filter field | Operators | Requires | Index |
| --- | --- | --- | --- |
| `market_code` | `eq`, `in` | — | `idx_prices_live_product` |
| `product_id`, `variant_id` | `eq`, `in` | — | `idx_prices_active`, `idx_prices_active_product` |
| `price_source` | `eq`, `in` | `companion` | none |
| `has_sale` | `eq` | **market** | `idx_prices_on_sale (product_id, market_code) WHERE sale_minor IS NOT NULL AND valid_to IS NULL AND deleted_at IS NULL` |
| `valid_to` | `is_null`, `is_not_null` | — | `idx_prices_active` (partial) |
| `recalc_run_id` | `eq` | — | `idx_prices_recalc (recalc_run_id) WHERE recalc_run_id IS NOT NULL` |
| `metal_rate_id` | `eq` | — | `idx_prices_metal_rate (metal_rate_id) WHERE metal_rate_id IS NOT NULL` |
| `list_minor` | `gte`, `lte`, `between` | **market** | `idx_prices_market_list` (added above) |
| `cost_minor` | `gte`, `lte`, `between` | **market** + `price.read_cost` | no index — `companion`, and the **permission** is the real gate (§1.3 row 22) |

### 8.9 `returns`

| Sort field | Keyset | Requires | Index |
| --- | --- | --- | --- |
| `requested_at` (default) | `r.status, r.requested_at DESC, r.id DESC` | — | `idx_returns_open (status, requested_at) WHERE status NOT IN ('closed','refunded')` |
| `created_at` | `r.id` | — | PK |
| `refund_total_minor` | `r.refund_total_minor, r.id` | **market** | `companion` — no index; permitted only with a `market_code` filter, which bounds the set |

| Filter field | Operators | Requires | Index |
| --- | --- | --- | --- |
| `status` | `eq`, `in` | — | `idx_returns_open` |
| `order_id` | `eq` | — | `idx_returns_order (order_id)` |
| `rma_number` | `eq` | — | `uq_returns_rma` |
| `market_code` | `eq`, `in` | — | **add** `idx_returns_market_requested ON returns (market_code, requested_at DESC, id DESC)` |
| `reason_code` | `eq`, `in` | `companion` | none |
| `customer_id` | `eq` | `companion` | none |
| `requested_at`, `received_at`, `closed_at` | `gte`, `lte`, `between` | — | `idx_returns_open` / the added index |
| `tracking_number` | `eq` | — | `idx_returns_tracking (tracking_number) WHERE tracking_number IS NOT NULL` |

### 8.10 `media`

| Sort field | Keyset | Requires | Index |
| --- | --- | --- | --- |
| `created_at` (default) | `m.created_at DESC, m.id DESC` | — | `idx_media_folder (folder_id, created_at DESC) WHERE deleted_at IS NULL` when a folder filter is present; **add** `idx_media_created ON media (created_at DESC, id DESC) WHERE deleted_at IS NULL` otherwise |
| `bytes` | `m.bytes DESC, m.id` | — | **add** `idx_media_bytes ON media (bytes DESC, id DESC) WHERE deleted_at IS NULL` |

| Filter field | Operators | Requires | Index |
| --- | --- | --- | --- |
| `folder_id` (incl. subtree) | `eq`, `in` | — | `idx_media_folder`; `media_folders.materialized_path LIKE` for the subtree |
| `kind` | `eq`, `in` | `companion` | none |
| `format` | `eq`, `in` | `companion` | none |
| `tag_id` | `eq`, `in` | — | `idx_media_tags_tag (tag_id, media_id)` |
| `uploaded_by_user_id` | `eq` | — | **add** `idx_media_uploader ON media (uploaded_by_user_id, created_at DESC) WHERE deleted_at IS NULL` |
| `alt_text` | `is_null`, `is_not_null` | — | **add** `idx_media_missing_alt ON media (created_at DESC) WHERE alt_text IS NULL AND deleted_at IS NULL` — this is the "12 images missing alt text" banner (06 §7.4) |
| `bytes`, `width`, `height` | `gte`, `lte`, `between` | `companion` for width/height | `idx_media_bytes` for bytes |
| `is_demo` | `eq` | — | `idx_media_demo (id) WHERE is_demo` |
| `deleted_at` | `is_null`, `is_not_null` | — | partial indexes |
| `checksum_sha256` | `eq` | — | `idx_media_checksum (checksum_sha256) WHERE deleted_at IS NULL` |
| `q` | `contains` | — | `idx_media_search_trgm` (GIN, `pg_trgm`, over title ‖ alt ‖ credit ‖ public_id) |
| `unused` | `eq` | **`folder_id` required** | none — it is a ten-leg `NOT EXISTS` including the published-snapshot leg (`06 §7.5`). Bounded by requiring a folder; an unbounded library-wide "unused" scan is the query that makes the media screen feel broken |

### 8.11 Indexes this section adds

Every one is `CREATE INDEX CONCURRENTLY` in a standalone migration
(`01 §5.4` rule 6), and every one exists because a field in §8.2–§8.10 would
otherwise have no index and would have been silently dropped from the whitelist.

| Index | Table | Serves |
| --- | --- | --- |
| `idx_products_updated (updated_at DESC, id DESC) WHERE deleted_at IS NULL` | `products` | `sort=updated_at`, "recently changed" |
| `idx_products_seo_score (seo_score, id) WHERE deleted_at IS NULL` | `products` | `sort=seo_score`, the SEO audit filter |
| `idx_variants_sku_prefix (sku text_pattern_ops) WHERE deleted_at IS NULL` | `product_variants` | `sku starts_with` |
| `idx_orders_market_total (market_code, total_minor DESC, id DESC)` | `orders` | `sort=total_minor`, high-value filters, the `pending_review` queue |
| `idx_customers_last_order (last_order_at DESC NULLS LAST, id DESC) WHERE anonymized_at IS NULL` | `customers` | `sort=last_order_at` |
| `idx_customers_orders_count (total_orders_count DESC, id DESC) WHERE anonymized_at IS NULL` | `customers` | `sort=total_orders_count` |
| `idx_inventory_items_location_available (location_id, available_quantity, variant_id)` | `inventory_items` | `sort=available_quantity` beyond the `<= 2` partial |
| `idx_inventory_items_updated (updated_at DESC, id DESC)` | `inventory_items` | `sort=updated_at` |
| `idx_prices_market_list (market_code, list_minor, id) WHERE valid_to IS NULL AND deleted_at IS NULL` | `prices` | `sort=list_minor`, price-band filters |
| `idx_returns_market_requested (market_code, requested_at DESC, id DESC)` | `returns` | per-market RMA queue |
| `idx_media_created (created_at DESC, id DESC) WHERE deleted_at IS NULL` | `media` | library default sort with no folder filter |
| `idx_media_bytes (bytes DESC, id DESC) WHERE deleted_at IS NULL` | `media` | `sort=bytes`, the "large file" audit |
| `idx_media_uploader (uploaded_by_user_id, created_at DESC) WHERE deleted_at IS NULL` | `media` | `uploaded_by_user_id` filter |
| `idx_media_missing_alt (created_at DESC) WHERE alt_text IS NULL AND deleted_at IS NULL` | `media` | the missing-alt-text banner and filter |
| `idx_products_completeness_checks` USING GIN (`completeness_checks`) `WHERE deleted_at IS NULL` | `products` | `completeness_check_failed` (§8.3) — "Missing Images" |
| `idx_products_seo_checks` USING GIN (`seo_checks`) `WHERE deleted_at IS NULL` | `products` | `seo_check_failed` (§8.3) — "Missing SEO" |
| `idx_collections_title_trgm` USING GIN (`title gin_trgm_ops`) `WHERE deleted_at IS NULL` | `collections` | ⌘K palette, Collections group (`13 §6.2`) |
| `idx_stones_name_trgm` USING GIN (`name gin_trgm_ops`) `WHERE deleted_at IS NULL` | `stones` | ⌘K palette, Stones group |
| `idx_cms_pages_title_trgm` USING GIN (`title gin_trgm_ops`) `WHERE deleted_at IS NULL` | `cms_pages` | ⌘K palette, Pages group |
| `idx_journal_title_trgm` USING GIN (`title gin_trgm_ops`) `WHERE deleted_at IS NULL` | `journal_posts` | ⌘K palette, Journal group |

```sql
-- each CREATE INDEX CONCURRENTLY in its own migration (01 §5.4 rule 6)
CREATE INDEX idx_products_completeness_checks ON products USING GIN (completeness_checks) WHERE deleted_at IS NULL;
CREATE INDEX idx_products_seo_checks          ON products USING GIN (seo_checks)          WHERE deleted_at IS NULL;
CREATE INDEX idx_collections_title_trgm ON collections   USING GIN (title gin_trgm_ops) WHERE deleted_at IS NULL;
CREATE INDEX idx_stones_name_trgm       ON stones        USING GIN (name  gin_trgm_ops) WHERE deleted_at IS NULL;
CREATE INDEX idx_cms_pages_title_trgm   ON cms_pages     USING GIN (title gin_trgm_ops) WHERE deleted_at IS NULL;
CREATE INDEX idx_journal_title_trgm     ON journal_posts USING GIN (title gin_trgm_ops) WHERE deleted_at IS NULL;
```

The four trigram indexes exist because four groups of the ⌘K palette had an
exact-slug index and no substring one, which means typing "moon" finds the
Moonstone *product* and not the Moonstone *stone page* — the discovery failure
the palette exists to remove (`13 §6.2`). They are whitelist indexes in the same
sense as the rest of this table: `13 §6.2`'s group queries are the only readers,
and `tests/db/drift.test.ts` asserts each one exists.

> **RESOLVED — was CHANGE REQUIRED IN 02 §4:** these six join the index register. `pg_trgm` is
> *Verified applied in 02.*
> already required by `idx_products_title_trgm` and `idx_orders_number_trgm`, so
> no new extension is created — but the four trigram indexes above must be
> created **after** `CREATE EXTENSION IF NOT EXISTS pg_trgm`, which is
> `02 §1.2`'s bootstrap migration.

`02 §4` says the index list "was sized for that whitelist and nothing else" — it
now is, in both directions.

### 8.12 CI enforcement

| Test | What it greps / asserts |
| --- | --- |
| `tests/api/sorting.test.ts` | For every `SortResource` × every `SortFieldSpec`: the request succeeds, a field outside the list is a `400` (never a silent fallback), a `requires: 'market'` sort without a market is a `400`, and `EXPLAIN` of the generated SQL names the spec's `index` — a sort whose plan is a `Seq Scan` or a `Sort` node over the whole relation fails |
| `tests/api/filtering.test.ts` | Every `FilterFieldSpec` × every listed operator round-trips; an unknown field or an operator not on the field's list is a `400`; a `requires: 'companion'` field submitted alone is a `400` |
| `tests/unit/saved-view-schema.test.ts` | `saved_views.filters` and `saved_views.sort` are validated against `FILTER_WHITELIST` / `SORT_WHITELIST` on write; a saved view carrying a field that has since been removed from the whitelist fails validation on read and renders as "this view needs updating", never as an unfiltered list |
| `tests/unit/no-offset.test.ts` | `OFFSET` appears nowhere in `src/lib/db/raw/**` except the one allowlisted `/journal/page/[n]` call site (08 §2.3) |
| `tests/db/drift.test.ts` | Every `index` string named in `SORT_WHITELIST` and `FILTER_WHITELIST` exists in `pg_indexes` |

---

## 9. Cross-registry CI summary

One line per registry, so a reviewer can see the whole enforcement surface at
once. Every file below is commissioned here and therefore must exist on disk
before `09 §5.1`'s `tests/setup/pending.json` can be empty.

| Registry | Test file(s) | Fails when |
| --- | --- | --- |
| PermissionKey (§1) | `tests/unit/rbac-catalogue.test.ts`, `tests/integration/rbac-matrix.test.ts`, `tests/integration/rbac-escalation.test.ts` | A key in `src/` is not in `PERMISSION_KEYS`; a catalogue key has no `permissions` row; a role's live behaviour differs from §1.4; any rejected spelling appears anywhere |
| ErrorCode (§2) | `tests/api/error-taxonomy.test.ts`, `tests/unit/error-copy-seeded.test.ts` | An `AppError` subclass has a code outside `ERROR_CODES`, two classes share a code, a `copyKey` has no seeded `settings` row |
| `job_kind` (§3) | `tests/unit/job-kinds.test.ts`, `tests/unit/job-handlers-unprivileged.test.ts`, `tests/integration/jobs-worker.test.ts` | The enum and `JOB_KINDS` differ; a kind has no handler; a `systemPermitted` handler calls a permission-gated mutator; a `NULL`-creator job of a human-only kind does not fail |
| Rate limits (§4) | `tests/unit/ratelimit-keys.test.ts`, `tests/unit/ratelimit-pairing.test.ts`, `tests/api/ratelimit.test.ts` | A `RateLimitSpec` prefix is not in `RATE_LIMIT_KEYS`; a limit or window disagrees with §4.2; a client-held key has no IP sibling |
| Crons (§5) | `tests/unit/cron-registry.test.ts`, `tests/api/auth-modes.test.ts` | Handler directories, `vercel.json#crons` and `CRON_JOBS` are not the same set with the same schedules |
| IntegrationKey (§6) | `tests/unit/integration-keys.test.ts` | A key passed to `integrationStatus()` is not in `INTEGRATION_KEYS`; a member has no env-var list |
| Closed unions (§7) | `tests/unit/order-state-machine.test.ts`, `tests/unit/checkout-state-machine.test.ts`, `tests/unit/availability.test.ts`, `tests/unit/background-tokens.test.ts`, `tests/db/constraints.test.ts` | A union's TS values and its Postgres enum or `CHECK` differ; a transition table omits a value; a background token is not declared in `tokens.css` |
| Sort/filter (§8) | `tests/api/sorting.test.ts`, `tests/api/filtering.test.ts`, `tests/unit/saved-view-schema.test.ts`, `tests/unit/no-offset.test.ts`, `tests/db/drift.test.ts` | A sort or filter field is accepted outside the whitelist; a whitelisted field's plan does not use its named index; a named index does not exist |

---

## 10. Work order — which documents disagree with this one

Each row is an edit another agent makes. "Grep" gives the string to search for.

### 10.1 PermissionKey catalogue (§1)

| Document | Disagreement | Edit | Grep |
| --- | --- | --- | --- |
| `03 §1.8` | Uses `price.approve`, `inventory.update`, `catalog.settings.update`, `settings.update` | Replace with `price.approve_recalc`, `inventory.adjust`, the four split keys (`stone.update` / `material.update` / `attribute.update` / `seo.manage`), `settings.manage` | `price.approve`, `inventory.update`, `catalog.settings.update`, `settings.update` |
| `04 §1.3` | Commissions `metal_rate.create`; declares `price.read_cost` and `price.recalc_preview` without adding them to a catalogue | Rename to `metal_rate.manage`; cite §1.3 rows 22 and 24 as the catalogue home | `metal_rate.create` |
| `05 §6` | `order.discount_manual` exists only in prose | Cite §1.3 row 35 | `order.discount_manual` |
| `06 §1.5` | An entire parallel CMS catalogue | Replace the whole table with a pointer to §1.3 and §1.4: `cms_page.*` → `cms.*` (+ the two new keys), `journal.update`/`journal.publish` → `journal.manage`, `navigation.update` → `menu.manage`, `email_template.update` → `settings.manage` | `cms_page.`, `journal.update`, `journal.publish`, `navigation.update`, `email_template.update` |
| `07 §2.3, §2.5` | 65 keys and a matrix that omits the seven new ones | Add rows 17, 19, 22, 24, 35, 53, 54 to the catalogue and to the matrix; add `order.discount_manual` and `media.hard_delete` to `TOTP_REQUIRED_PERMISSIONS`; add `customer.anonymize` and `media.hard_delete` to `STEPUP_PERMISSIONS`; amend `cms.update`'s description to exclude restore | `TOTP_REQUIRED_PERMISSIONS`, `STEPUP_PERMISSIONS` |
| `08 §5` | `/admin/system/webhooks/[id]/replay` already composes two keys correctly; `/admin/catalog/facets` uses `seo.manage` (correct) | No change beyond citing §1.3 | `payment.replay_webhook` |
| `09 §1.2 P03` | Exit criterion (b) "`permissions` row count equals `Object.keys(catalogue).length`" | Change to `PERMISSION_KEYS.length` and pin it at **73** (72 + `review.moderate`, §1.3) | `Object.keys(catalogue)` |

### 10.2 ErrorCode taxonomy (§2)

| Document | Disagreement | Edit |
| --- | --- | --- |
| `08 §1.4` | The union is 32 codes; 20 classes thrown by name elsewhere are absent | Replace the union and the class table with §2.1 and §2.2 |
| `04 §1.5` | `CouponInapplicableError`; `PricingError` implied as a class | Rename to `CouponInvalidError`; declare `PricingError` as the type alias in §2.1 |
| `05 §3.6, §2.4, §8.5, §8.7, §9.4` | `CartConvertedError`, `LineUnavailableError`, `CouponUnavailableError`, `GiftCardUnavailableError`, `IllegalCheckoutTransitionError`, `PaymentsUnconfiguredError`, `RefundError` | Cite §2.2; declare `RefundError` as a type alias |
| `03 §2.2, §3.4` | `SkuConflictError`, `VariantConflictError`, `TooManyCombinationsError`, `AttributeValidationError` | Cite §2.2 |
| `06 §4.4, §5.4, §2.2` | `PreviewTokenError`, `PreflightRequired`, `ConflictError` | Cite §2.2 |
| `07 §2.6` | `LastOwnerError` | Cite §2.2 |
| `09 §1.2 P22(e)`, `§3 R23a` | `TaxUnconfiguredError` appears in no taxonomy | Cite §2.2; keep both tax codes distinct |

### 10.3 `job_kind` (§3)

| Document | Disagreement | Edit |
| --- | --- | --- |
| `02 §1.9` | Eight values; `idx_jobs_singleton` covers three kinds; no `dedupe_key` column | Add the **eleven** `ALTER TYPE` rows (§3.1), `jobs.dedupe_key`, `uq_jobs_dedupe`, and the widened singleton list from §3.2 |
| `07 §3.2` | The closed three-kind allowlist; `§7.4` uses `job_kind = 'export'` for the off-site audit copy | Replace the allowlist with §3.3's per-kind `systemPermitted`; change `§7.4` to `audit_archive` |
| `05 §4.3` | `send_email` enqueued and never declared | Cite §3.1 and §3.3 |
| `08 §3.7, §7.2` | `feed_rebuild`, `analytics_dispatch` used and never declared | Cite §3.1; note `feed_rebuild`'s dedupe is **per market** |
| `06 §2.1` | `product_metrics_refresh` refreshes `product_market_metrics` | Repoint it at `product_market_sort` (§7.9) and delete the `product_market_metrics` DDL |
| `09 §2.7` | `consistency_check`, `reconcile_inventory` added in a test section | Cite §3.1 |

### 10.4 Rate limits (§4)

| Document | Disagreement | Edit |
| --- | --- | --- |
| `07 §5.5` | "The table is the whole inventory"; 33 rows; missing 08's five and 06's two; `giftcard:ip` at 5/hour | Replace the table with §4.2 and delete the completeness claim in favour of a pointer here |
| `08 §2.3` | "the two tables are the same rows" | Replace with a pointer to §4.2 |
| `05 §8.7` | Gift-card limits keyed `(cartId, clientIp)` at 5/10 min and 20/day | Cite `giftcard:cart` and `giftcard:ip` from §4.2 |
| `06 §4.4, §6.4` | `preview-token` and `cms-heartbeat` limits in prose only | Cite §4.2 |
| `09 §3 R05a` | Requires a webhook IP limiter | Cite `webhook:ip` in §4.2 |
| `07 §4.3` | `share-wishlist:ip:<ip64>` at 30 / 1 min | Use `wishlist-share:ip:<ip64>` at **60 / 1 hour**, fail-closed (§4.2, D-G); `share-wishlist` is a rejected spelling |
| `13 §6.1`, `15 §5.2`, `15 §6` | Four keys in prose only | Cite §4.2 — `admin-search:user`, `bisr:ip`, `bisr:email`, `wishlist-share:ip` are rows here now |

### 10.5 Crons (§5)

| Document | Disagreement | Edit |
| --- | --- | --- |
| `01 §5.6` | Nine rows; `§3`'s tree lists nine cron directories; `§5.1` says "Seven cron entries" | Replace with §5.1's `vercel.json` and §5.2's table; add `pricing-rule-windows` to the `src/app/api/cron/` tree in `§3`; correct "Seven" to "Ten" |
| `04 §5.4` | Cites `01 §5.6` for a cron that is not there | Cite §5 |
| `08 §2.2` | Names ten correctly | No change beyond citing §5 |
| `09 §1.2 P04A(e)`, `§5.1` | Already correct at ten | Cite §5 |

### 10.6 IntegrationKey (§6)

| Document | Disagreement | Edit |
| --- | --- | --- |
| `01 §4.9` | Eight values "complete" | Replace the union with §6's fourteen |
| `04 §3.2` | "gains `'metal_rate_api'`" | Cite §6 |
| `07 §1.8` | "gains the key `'otp_sms'`" | Cite §6 |
| `08 §3.3, §7.3` | "gains `'ga4' \| 'gtm' \| 'meta_pixel' \| 'meta_capi' \| 'google_ads'`"; `indexnow` in prose | Cite §6 |
| `09 §5.1` | Blocker names five integrations | Name the six marked **yes** in §6 |

### 10.7 Closed unions (§7)

| Document | Disagreement | Edit |
| --- | --- | --- |
| `05 §1.1` | The band table has four values and never mentions `sold` or `products.sold_at` | Add `sold` and the `sold_at` predicate from §7.1 |
| `07 §8.2` | Hard-codes four bands in the public-API denylist | Use the five from §7.1 |
| `01 §2.3` | The `getAvailability()` comment lists four | Use the five; cite `src/types/inventory.ts` |
| `08 §7.1` | `checkout_step_completed` reads "information → shipping → payment" | Use `information → delivery → payment` (§7.2) |
| `02 §1.9` | `order_status` has six values | Add `pending_review` (§7.3) and the two new transition rows to `§2.7`'s table |
| `05 §5.3` | The transition table has no `pending_review` | Add the rows from §7.3 and the `createShipment()` guard |
| `09 §3 R23`, `§5.1` | Makes the hold a launch blocker against an enum that lacks it | Cite §7.3; the threshold setting key is `security.high_value_review_threshold` |
| `02 §2.9` | `import_jobs.resource` has no `CHECK` | Add `chk_import_jobs_resource` (§7.6) |
| `02 §2.8` | `cms_sections.background_token` has no `CHECK` | Add `chk_cms_sections_background_token` (§7.7) |
| `06 §2.1` | `SectionSnapshot.backgroundToken: string \| null`; `sort` value `bestselling`; `product_market_metrics` | Type it against `BACKGROUND_TOKENS`; use `best_selling`; delete the table (§7.9) |
| `10 §2.1` | "Sections choose `surface="ivory"` or `surface="emerald"`" with no stored vocabulary | Name the seven tokens and the two-way editor mapping (§7.7) |
| `03 §2.4` | `prices.floor_minor` and its two CHECKs | Remove; the floor is `pricing_formula_market_terms.floor_minor` (§7.4). The rest of C1 belongs to the pricing agent |

### 10.8 Sort and filter whitelists (§8)

| Document | Disagreement | Edit |
| --- | --- | --- |
| `02 §2.9` | "the allowed sort fields per resource are a whitelist in `src/lib/db/raw/`" with no contents | Cite §8 |
| `02 §4.3` | Lists "Stock" as a product sort | Remove; §8.3 explains why no index serves it |
| `07 §5.3` | Repeats the promise | Cite §8 |
| `08 §2.3` | Gives sort fields for three resources of eight; promises `filters.ts` with no contents | Cite §8; keep §8.2's `catalog` row, which is 08's own |
| `03 §1.6` | Promises a `completeness` filter with `lt:50`, `lt:80`, `eq:100` and no whitelist home | Cite §8.3 |
| `09 §3 R21`, `§2.5` | "Sort fields are a per-resource whitelist" | Cite §8 and §8.12 |

### 10.9 Route files with no manifest row

Not a registry of this document, but the same class of defect and the same fix —
`08 §2.2`'s table is the source of `src/lib/security/route-manifest.ts`, and
`tests/unit/routes-authorized.test.ts` fails on "a route in the tree with no
manifest row". Four routes exist in `01 §3`, `06`, `07` and `08`'s own prose and
in no manifest row:

| Route | Owning document | Auth |
| --- | --- | --- |
| `POST /api/media/svg` | 06 §7.1 | `staff:media.upload_vector`, 256 KB body cap |
| `GET /api/admin/cms/pages/[id]/heartbeat` | 06 §6.4 | `staff:cms.read`, `cms-heartbeat:session` 10/min |
| `POST /api/security/csp-report` | 07 §5.8 | `public`, `sameOrigin: false`, 8 KB cap, `csp-report:ip` 20/h |
| `POST /api/catalog/redirect-hit` | 08 §3.6 | `public`, `redirect-hit:ip` 60/min |

> **DECISION CHANGED:** this table listed a fifth route,
> `GET /api/internal/market-snapshot` (`04 §5.2`), as needing a manifest row. **It
> needs no row, because it is not built.** `01 §1.4` settled the market source at
> the build-time `src/generated/market-snapshot.json`, written by
> `scripts/gen-market-snapshot.ts`; the route, its 60-second module cache and its
> fail-open refetch are deleted, and `01 §2.2`'s lint boundary (`src/lib/edge/**`
> contains no `fetch(`) makes re-adding it a CI failure. `04 §5.2` has been amended
> to match. The other four routes in this table are unaffected.

**Two routes that need the `RouteAuth` `any` combinator, and exactly two**
(`07 §3.4`, set decision D-B). `withRoute`'s `auth` union gains one member —
`{ kind: 'any'; options: RouteAuth[] }`, satisfied when any option is satisfied,
evaluated in array order, and on total failure reporting the **last** option's
error — and the union stays exhaustive: no default, no `undefined` branch.

| Route | Auth |
| --- | --- |
| `GET /api/health?verbose=1` | `{ kind: 'any', options: [{ kind: 'cron' }, { kind: 'staff', permission: 'integration.manage' }] }` |
| `GET /api/checkout/status/[orderId]` | `{ kind: 'any', options: [{ kind: 'customer' }, { kind: 'cart_token' }] }` |

Option order is the error-reporting decision: an unauthenticated caller to the
health route gets the **staff 401**, not a confusing cron 403.

> **RESOLVED — was CHANGE REQUIRED IN 08 §2.2:** `/api/health` carries **two** manifest rows —
> *Verified applied in 08.*
> one for the plain call and one for `?verbose=1`. A query parameter is not a
> route file, and `tests/unit/routes-authorized.test.ts` maps route **files** to
> rows, so two rows for one file is a defect in the same class as zero. Collapse
> them into one row whose auth is the `any` form above; the verbose branch is a
> body-shape decision inside the handler, made after authorization, and `cron`
> callers get the verbose body because the `any` option that matched says which.

`/api/media/callback` (`09 P06`) is the same route as `registerUpload()`'s
endpoint under three names (`confirmUpload()` in `06 §7.1`,
`registerUpload()` in `07 §5.9` and `08 §1.3`). **Canonical: the function is
`registerUpload(actor, input)` and the route is `POST /api/media/callback`.**
`08 §2.2` must gain the row; `06` must rename `confirmUpload()`.

`POST /api/import/upload` (`07 §5.9`) and `POST /api/admin/import/upload`
(`08 §2.2`) are one route. **Canonical: `/api/admin/import/upload`** — every
other staff-only route handler sits under `/api/admin/`, and `robots.txt`
disallows `/api/` wholesale either way.
