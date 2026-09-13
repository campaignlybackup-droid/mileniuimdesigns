# 13 — Admin operations

**What this document owns.** The *screen* specification for the admin surfaces
`08 §5` gives a path and a permission and nothing else: the data table, saved
views, inline editing, bulk editing, CSV import/export, the ⌘K palette, the
danger-zone inventory, and how all of it behaves on a phone. It closes
`99` gaps 5, 6, 7 and 8 and hand-waved claims 1 and 2.

**What it does not own and never restates.** The permission catalogue and the
role matrix are `11 §1`. The sort and filter whitelists are `11 §8`. The error
taxonomy is `11 §2`. The `job_kind` registry and `runJob()`'s actor rule are
`11 §3`. Where a name here disagrees with `11`, `11` wins and this document is
the defect. Where this specification needs a change in an existing document, it
is a `> **CHANGE REQUIRED IN …**` callout, not an edit.

Three load-bearing consequences of `11` that everything below conforms to:

1. **There is no `bulk_edit.*` permission** (`11 §1.2` rule 2). A bulk edit
   requires exactly the permission a single edit of that resource requires,
   re-checked per row inside the job. §4.6 specifies that re-check.
2. **A saved view carries no permission of its own** (`11 §1.2` rule 3). §2.4
   extends that rule from rows to *columns*.
3. **`import.run` never authorises an apply** (`11 §1.5`). §5.2 is the flow that
   makes that true at every step.

---

## 1. The admin data table

### 1.1 One component, one contract

`DataTable` (`10 §3.3`) renders eight resources and has one server contract.
There is no per-screen list query **for those eight**.

**Four admin lists are deliberately outside the eight, and naming them is the
difference between a boundary and an oversight.** `saved_view_resource` is a
closed union of eight values (`11 §7.5`) and every value of it is a `DataTable`
resource; a screen that is not one of the eight gets a purpose-built list with no
saved views, no column picker and no inline editing. Those screens are
`/admin/gift-cards` and `/admin/customers/groups` (`15 §2.6`, `15 §1.8`),
`/admin/catalog/reviews` (`15 §3.3`), and `/admin/system/jobs` (`08 §5`). Each is
a small, fixed list over a table with one natural order, and giving any of them a
saved view would mean widening a closed union in `11` to buy a feature nobody
asked for. If one of them ever needs saved views, the change is a ninth value in
`11 §7.5` plus a `READ_PERMISSION` entry — and it is `11`'s change to make, not
this document's.

```ts
// src/lib/admin/list.ts
export type ListScope = {
  readonly marketCode?: MarketCode;      // required when any chosen sort/filter has requires:'market'
  readonly currencyCode?: CurrencyCode;  // … requires:'currency'
  readonly locationId?: string;          // … requires:'location'
};

export async function listResource<R extends SavedViewResource>(
  actor: StaffActor,
  input: {
    resource: R;
    filters: FilterSet<R>;               // validated against FILTER_WHITELIST[R] (11 §8)
    sort: { field: string; direction: SortDirection };  // SORT_WHITELIST[R]
    scope: ListScope;
    columns: readonly string[];          // keys from ADMIN_COLUMNS[R]
    cursor?: string;
    limit?: number;                      // default 50, max 100 (08 §2.3)
    count?: boolean;                     // opt-in totalEstimate
  },
): Promise<{
  rows: readonly AdminRow<R>[];
  columns: readonly AdminColumnSpec[];   // the projection actually served — see §1.2
  nextCursor: string | null;
  totalEstimate: number | null;
  scopeResolved: Required<ListScope> | ListScope;
}>;

export async function getResourceRow<R extends SavedViewResource>(
  actor: StaffActor, resource: R, id: string, columns: readonly string[], scope: ListScope,
): Promise<AdminRow<R> | null>;   // the single-row refetch §3.5 uses after a conflict
```

`listResource()` calls `requirePermission(actor, READ_PERMISSION[resource])`
first — `products`/`variants` ⇒ `product.read`, `orders` ⇒ `order.read`,
`customers` ⇒ `customer.read`, `inventory` ⇒ `inventory.read`, `prices` ⇒
`price.read`, `returns` ⇒ `return.read`, `media` ⇒ `media.read`. That map is the
same one `08 §5` uses for `/admin/tools/saved-views` and is exported once from
`src/lib/admin/columns.ts`, not written twice.

### 1.2 The column registry

Columns are data, not JSX. One frozen registry drives the grid, the mobile card,
the column picker, the CSV export column set and the saved-view validator.

```ts
// src/lib/admin/columns.ts
export type InlineEditSpec = {
  readonly control: 'text' | 'number' | 'money' | 'select' | 'toggle';
  readonly action: string;             // export name in src/server/actions/admin/inline.ts
  readonly permission: PermissionKey;  // re-checked server-side by adminAction()
  readonly concurrency: 'version' | 'price_row' | 'row_version';   // §3.2
  readonly options?: readonly string[];
  readonly max?: number;               // text length / numeric ceiling
};

export type AdminColumnSpec = {
  readonly key: string;
  readonly label: string;
  readonly source: string;             // 'products.title' — one physical column or one named derivation
  readonly align: 'start' | 'end';
  readonly defaultWidth: number;       // px
  readonly pinned: boolean;            // exactly one per resource; always visible, always first
  readonly defaultVisible: boolean;
  readonly sortField: string | null;   // MUST be a field of SORT_WHITELIST[resource]
  readonly filterField: string | null; // MUST be a field of FILTER_WHITELIST[resource]
  readonly inlineEdit: InlineEditSpec | null;
  readonly requires: PermissionKey | null;   // projection gate — §1.2 rule below
  readonly mobileSlot: 'title' | 'subtitle' | 'stat' | null;   // §8.2
};

export const ADMIN_COLUMNS: Readonly<Record<SavedViewResource, readonly AdminColumnSpec[]>>;
```

**`requires` is a projection gate, not a render gate.** A column whose
`requires` the actor does not hold is removed from the `SELECT` list in
`listResource()` and is absent from the returned `columns` array. It is never
fetched and blanked, never blurred, never sent and hidden — `07 §3.6`: a
component that receives a value it should not see has already leaked it.
`04 §4`'s cost and margin columns are the case this exists for.

> **RESOLVED — was CHANGE REQUIRED IN 11 §1.2 rule 3:** the rule currently reads "a saved view
> *Verified applied in 11.*
> carries no permission … it is gated on the owning resource's read permission".
> Add the second half: **a column carries its own `requires` permission, and a
> saved view's `column_config` cannot grant it.** Without that sentence a shared
> view authored by an `owner` carries `cost_minor` to a `catalog_manager` the
> moment they open it, and rule 3 reads as though resource-level read is the only
> gate.

**The registry may not invent a sort or a filter.** `sortField` and
`filterField` are looked up in `11 §8`, never declared here.
`tests/unit/admin-columns.test.ts` asserts, for every resource: exactly one
`pinned: true`; every non-null `sortField` is a `field` of
`SORT_WHITELIST[resource]`; every non-null `filterField` is a `field` of
`FILTER_WHITELIST[resource]`; every `inlineEdit.permission` is a member of
`PERMISSION_KEYS`; every `inlineEdit.action` resolves to an export of
`src/server/actions/admin/inline.ts`; and at most three columns carry
`mobileSlot: 'stat'`.

### 1.3 Columns per resource

`S` = sortable, `F` = filterable, `E` = inline-editable (§3.1), `•` = default
visible. The sort/filter field named is the `11 §8` field the column maps to; a
blank means the column is display-only and carries no query surface.

#### `products` — `/admin/catalog/products`

| Column key | Source | S | F | E | • | Gate |
| --- | --- | --- | --- | :-: | :-: | --- |
| `thumb` *(pinned)* | `product_media` `role='hero' AND variant_id IS NULL` → `media` | — | — | | • | — |
| `title` | `products.title` | `title` | `q` | text | • | `product.update` |
| `status` | `products.status` | `status` | `status` | select `draft\|active\|archived` | • | `product.publish` |
| `market_published` | `product_market_content.is_published` | — | `market_published` | toggle | • | `product.publish` |
| `price` | `product_market_sort.min_price_minor` → `PriceDisplay` | `price` | `price_min`,`price_max` | | • | `price.read` |
| `completeness_score` | `products.completeness_score` → `CompletenessMeter` | `completeness_score` | `completeness_score` | | • | — |
| `seo_score` | `products.seo_score` | `seo_score` | `seo_score` | | | — |
| `variant_count` | `count(product_variants) WHERE deleted_at IS NULL` | — | — | | • | — |
| `primary_category` | `categories.title` via `primary_category_id` | — | `category_id` | | | — |
| `collections` | `collections.title[]` via `product_collections` | — | `collection_id` | | | — |
| `stones` | `stones.name[]` | — | `stone_id` | | | — |
| `tags` | `tags.name[]` | — | `tag_id` | | | — |
| `is_one_of_a_kind` | `products.is_one_of_a_kind` | — | `is_one_of_a_kind` | | | — |
| `sold_at` | `products.sold_at` | — | `sold_at` | | | — |
| `is_made_to_order` | `products.is_made_to_order` | — | `is_made_to_order` | toggle | | `product.update` |
| `lead_time_days` | `products.lead_time_days` | — | — | number ≤ 365 | | `product.update` |
| `units_90d` | `product_market_sort.units_90d` | `units_90d` | — | | | `order.read` |
| `published_at` | `products.published_at` | `published_at` | `published_at` | | | — |
| `updated_at` | `products.updated_at` | `updated_at` | `updated_at` | | • | — |
| `created_at` | `products.created_at` | `created_at` | `created_at` | | | — |
| `is_demo` | `products.is_demo` | — | `is_demo` | | | — |
| `deleted_at` | `products.deleted_at` | — | `deleted_at` | | | — |

`price` is display-only here **deliberately**: a product has one row in this grid
and up to N live `prices` rows (variant-level and per market), so an editable
cell would have to pick one and silently write it. Price editing is the `prices`
resource (`/admin/pricing/prices`), which has one row per price.

#### `variants` — `/admin/catalog/variants`

| Column key | Source | S | F | E | • |
| --- | --- | --- | --- | :-: | :-: |
| `sku` *(pinned)* | `product_variants.sku` | `sku` | `sku` | text — `SKU_PATTERN` (`03 §2.6`), `SkuConflictError` on collision | • |
| `product` | `products.title` | — | `product_id` | | • |
| `title` | `product_variants.title` | — | — | text | • |
| `position` | `product_variants.position` | `position` | — | number | |
| `is_active` | `product_variants.is_active` | — | `is_active` | toggle | • |
| `inventory_policy` | `product_variants.inventory_policy` | — | `inventory_policy` | select `tracked\|made_to_order\|untracked` | • |
| `gross_weight_grams` | `product_variants.gross_weight_grams` | — | — | number (3 dp) | • |
| `ring_size` / `length_mm` | same columns | — | — | number (2 dp) | |
| `barcode`, `hs_code`, `country_of_origin`, `tax_code` | same columns | — | — | text | |
| `materials` | `materials.name[]` | — | `material_id` | | |
| `options` | `product_option_values.label[]` | — | `option_value_id` | | |
| `created_at` | | `created_at` | — | | |

Every inline cell above is `variant.update`.

#### `orders` — `/admin/orders`

| Column key | Source | S | F | E | • | Gate |
| --- | --- | --- | --- | :-: | :-: | --- |
| `order_number` *(pinned)* | `orders.order_number` | `order_number` | `order_number` | | • | — |
| `placed_at` | `orders.placed_at` | `placed_at` | `placed_at` | | • | — |
| `market_code` | `orders.market_code` | — | `market_code` | | • | — |
| `status` | `orders.status` | — | `status` | | • | — |
| `payment_status` | `orders.payment_status` | — | `payment_status` | | • | — |
| `fulfillment_status` | `orders.fulfillment_status` | — | `fulfillment_status` | | • | — |
| `total` | `orders.total_minor` + `currency_code` | `total_minor` | `total_minor` | | • | — |
| `customer_name` | `orders.customer_id` → `customers` | — | `customer_id` | | • | **`customer.read`** |
| `email` | `orders.email` | — | `email` | | | **`customer.read`** |
| `destination` | `order_addresses` city + country | — | — | | • | — |
| `coupon_code` | `orders.coupon_code` | — | `coupon_code` | | | — |
| `paid_at` | `orders.paid_at` | `paid_at` | `paid_at` | | | — |
| `internal_note` | `orders.internal_note` | — | — | text ≤ 2000 | | **`order.update`** |
| `is_demo` | `orders.is_demo` | — | `is_demo` | | | — |
| `created_at` | | `created_at` | `created_at` | | | — |

`destination` is unconditional and `customer_name`/`email` are gated: that is the
same split `getOrderDetail()` makes (`07 §2.4` note 2) and it uses the same
projection helper, so there is one rule and not two.
**`status` is not inline-editable at any grid width.** Every transition is a
state-machine edge with preconditions and money or stock consequences
(`11 §7.3`); a cell that writes one is a cell that cancels an order by mis-tap.

#### `customers` — `/admin/customers`

| Column key | Source | S | F | E | • |
| --- | --- | --- | --- | :-: | :-: |
| `name` *(pinned)* | `customers.first_name ‖ last_name` | — | `q` | | • |
| `email` | `customers.email` | — | `q` | | • |
| `customer_group` | `customer_groups.name` | — | `customer_group_id` | select — `customer.update` | • |
| `total_orders_count` | same column | `total_orders_count` | `total_orders_count` | | • |
| `total_spent` | `customer_currency_totals.total_spent_minor` | `total_spent_minor` | `total_spent_minor` | | • |
| `last_order_at` | same column | `last_order_at` | `last_order_at` | | • |
| `accepts_marketing` | same column | — | `accepts_marketing` | | |
| `is_guest`, `email_verified_at`, `default_market_code` | same columns | — | each | | |
| `internal_note` | `customers.internal_note` | — | — | text ≤ 2000 — `customer.update` | |
| `anonymized_at` | same column | — | `anonymized_at` | | |
| `created_at` | | `created_at` | `created_at` | | • |

**`accepts_marketing` is displayed and never inline-editable.** Writing it
requires `marketing_consent_at` and `marketing_consent_source` to move with it; a
toggle that sets the boolean and leaves the provenance behind destroys the only
evidence of how consent was obtained. It is changed from the customer detail form,
which captures the source.

`total_spent` requires `scope.currencyCode`. Rendering it with no currency
selected is not a formatting problem — it is hard rule 2 — so the column is
replaced by an inline notice, "Select a currency to show lifetime value", and the
sort is refused with a `400` (`11 §8.6`).

#### `inventory` — `/admin/inventory/items`

| Column key | Source | S | F | E | • |
| --- | --- | --- | --- | :-: | :-: |
| `sku` *(pinned)* | `product_variants.sku` | `sku` | — | | • |
| `product` | `products.title` | — | `variant_id` | | • |
| `location` | `inventory_locations.name` | — | `location_id` | | • |
| `available_quantity` | same column | `available_quantity` | `available_quantity` | | • |
| `on_hand_quantity` | same column | — | — | | • |
| `reserved_quantity` | same column | — | — | | • |
| `incoming_quantity` | same column | — | — | | |
| `safety_stock_quantity` | same column | — | — | number — `inventory.adjust` | • |
| `reorder_point` | same column | — | `reorder_point` | number — `inventory.adjust` | • |
| `bin_location` | same column | — | `bin_location` | text ≤ 40 — `inventory.adjust` | |
| `is_one_of_a_kind` | same column | — | `is_one_of_a_kind` | | |
| `updated_at` | same column | `updated_at` | — | | |

**`on_hand_quantity` is not inline-editable and no quantity column is.** Every
quantity change is an `inventory_transactions` row with a `type` and a reason
(`05 §1.4`); an inline cell has nowhere to put either, and a stock ledger with
unexplained deltas is not a ledger. The three editable cells are policy fields
with no ledger behind them. A quantity change is the adjustment drawer
(`recount` / `adjustment` / `receipt` / `write_off`), and its bulk form is a CSV
`inventory` import.

#### `prices` — `/admin/pricing/prices`

| Column key | Source | S | F | E | • | Gate |
| --- | --- | --- | --- | :-: | :-: | --- |
| `variant` *(pinned)* | `product_variants.sku` + `products.title` | — | `variant_id`,`product_id` | | • | — |
| `market_code` | `prices.market_code` | — | `market_code` | | • | — |
| `currency_code` | `prices.currency_code` | — | — | | • | — |
| `list` | `prices.list_minor` | `list_minor` | `list_minor` | money | • | `price.update` |
| `sale` | `prices.sale_minor` | — | `has_sale` | money, clearable | • | `price.update` |
| `compare_at` | `prices.compare_at_minor` | — | — | money, clearable | | `price.update` |
| `cost` | `prices.cost_minor` | — | `cost_minor` | money | | **`price.read_cost`** |
| `margin_bp` | `(list_minor - cost_minor) * 10000 / list_minor` | — | — | | | **`price.read_cost`** |
| `price_source` | `prices.price_source` | — | `price_source` | | • | — |
| `valid_from` | `prices.valid_from` | `valid_from` | — | | • | — |
| `valid_to` | `prices.valid_to` | — | `valid_to` | | | — |
| `recalc_run_id` | same column | — | `recalc_run_id` | | | `price.read` |
| `metal_rate_id` | same column | — | `metal_rate_id` | | | `price.read` |

The grid shows **live rows only** by default — `valid_to IS NULL` is a seeded
filter on the screen, not a hardcoded predicate, so the history is one filter
change away.

A `metal_linked` or `hybrid` row's `list` cell is editable and shows a **linked**
badge. Editing it is a manual override and routes to `setManualPrice()`, which is
`04`'s documented override path and is what `tests/integration/manual-vs-binding.test.ts`
asserts survives the next recalculation run. The first override in a session
opens a one-line confirm naming the binding; subsequent ones in the same session
do not. Declining raises `ManualOverrideError` (`11 §2.1`) and the cell reverts.

#### `returns` — `/admin/returns`

| Column key | Source | S | F | E | • |
| --- | --- | --- | --- | :-: | :-: |
| `rma_number` *(pinned)* | `returns.rma_number` | — | `rma_number` | | • |
| `status` | `returns.status` | — | `status` | | • |
| `order` | `orders.order_number` | — | `order_id` | | • |
| `requested_at` | same column | `requested_at` | `requested_at` | | • |
| `reason_code` | same column | — | `reason_code` | | • |
| `refund_total` | `returns.refund_total_minor` | `refund_total_minor` | — | | • |
| `market_code` | same column | — | `market_code` | | • |
| `carrier` | `returns.carrier` | — | — | text — `return.update` | |
| `tracking_number` | same column | — | `tracking_number` | text — `return.update` | • |
| `internal_note` | same column | — | — | text ≤ 2000 — `return.update` | |
| `customer` | `returns.customer_id` | — | `customer_id` | | |
| `received_at`, `closed_at` | same columns | — | each | | |

#### `media` — `/admin/content/media`

| Column key | Source | S | F | E | • |
| --- | --- | --- | --- | :-: | :-: |
| `thumb` *(pinned)* | `buildDeliveryUrl()` | — | — | | • |
| `title` | `media.title` | — | `q` | text — `media.update` | • |
| `alt_text` | `media.alt_text` | — | `alt_text` | text ≤ 300 — `media.update` | • |
| `credit` | `media.credit` | — | — | text — `media.update` | |
| `kind` / `format` | same columns | — | each | | • |
| `bytes` | `media.bytes` | `bytes` | `bytes` | | • |
| `width` × `height` | same columns | — | each | | |
| `folder` | `media_folders.name` | — | `folder_id` | | • |
| `tags` | `tags.name[]` via `media_tags` | — | `tag_id` | | |
| `uploaded_by` | `users.name` | — | `uploaded_by_user_id` | | |
| `unused` | ten-leg `NOT EXISTS` (`06 §7.5`) | — | `unused` *(requires `folder_id`)* | | |
| `created_at` | | `created_at` | — | | • |
| `is_demo`, `deleted_at`, `checksum_sha256` | same columns | — | each | | |

`alt_text` inline-editable is not a convenience — it is the mechanism behind
`06 §7.4`'s "12 images missing alt text" banner and `idx_media_missing_alt`. The
alt-text audit is: open the Missing Alt filter, type down the column, done.

### 1.4 Column customisation and where the choice persists

Three layers, resolved in this order at render, each overriding the one before:

| Layer | Stored in | Scope | Survives |
| --- | --- | --- | --- |
| 1. Registry defaults | `ADMIN_COLUMNS[resource]` where `defaultVisible` | everyone | a deploy changes it |
| 2. The active saved view | `saved_views.column_config` | the view | shared with the view |
| 3. This user's tweak of the active view | `admin_column_prefs` | (user, resource, view) | devices, sessions, reloads |

`column_config` is an ordered array; order is array order and hidden columns are
simply absent:

```jsonc
[{"key":"thumb","width":56},{"key":"title","width":340},{"key":"status","width":110}]
```

Layer 3 exists because the alternative is worse in both directions: `localStorage`
loses the layout the moment a merchandiser opens the admin on the shop laptop, and
writing the tweak straight back into `saved_views.column_config` means one person
narrowing a column silently re-lays-out a shared view for six colleagues.

> **RESOLVED — was CHANGE REQUIRED IN 02 §2.9 (new table):**
> *Verified applied in 02.*
> ```sql
> CREATE TABLE admin_column_prefs (
>   user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
>   resource       saved_view_resource NOT NULL,
>   saved_view_id  UUID NULL REFERENCES saved_views(id) ON DELETE CASCADE,
>   column_config  JSONB NOT NULL DEFAULT '[]',
>   updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
> );
> CREATE UNIQUE INDEX uq_admin_column_prefs
>   ON admin_column_prefs (user_id, resource,
>     coalesce(saved_view_id, '00000000-0000-0000-0000-000000000000'::uuid));
> ```
> Filed under §1.4 **Hard delete** alongside `saved_views`: it is a preference
> row and a tombstone in it makes every lookup wrong-by-default. `column_config`
> is validated against `ADMIN_COLUMNS[resource]` on write by the same function
> the saved-view validator uses; an unknown key is dropped on write, not stored
> and dropped on read.

The column picker (`ColumnPicker`, a `10 §3.3` addition — see §9.2) is a
drag-orderable checklist grouped by the registry's declaration order, with
**Reset to this view's columns** and, for an actor who may edit the view, **Save
these columns to the view**. A column the actor's permissions exclude does not
appear in the picker at all, because a checkbox for a column that will never
render is a bug report waiting to be filed.

### 1.5 Keyset pagination — the exact contract

Admin lists use `08 §2.3`'s envelope with no variation in shape and two
clarifications in content.

- `?limit=` default **50**, max **100**. `?cursor=` is base64url of
  `{"k":[…,<id>],"s":"<sort>:<dir>","m":"<scopeToken>","f":"<filterHash>"}`.
- `k` carries **every** component of the `ORDER BY` from
  `SORT_WHITELIST[resource][field].keyset`, in order, ending in the id. The
  comparison is row-wise `(a, b, id) < ($1, $2, $3)` with all components in one
  direction. A two-element `k` under a three-clause sort skips rows on every tie.
- `s` includes the direction. A cursor whose `s` differs from the request is a
  `400`, never a silent restart.
- `f` is the SHA-256 of the canonically-serialised whitelisted filter set: keys
  sorted, operators sorted, values sorted within `in`. A mismatch is a `400`.
- `m` is the **scope token**, not a market code: `market:US`, `currency:USD`,
  `location:<uuid>`, or `-` when the sort and filters require none. Concatenated
  and sorted when a resource needs two (`market:US|currency:USD`).

> **RESOLVED — was CHANGE REQUIRED IN 08 §2.3:** `m` is described as `"<marketCode>"`. It must be
> *Verified applied in 08.*
> the scope token above. `sort=available_quantity` on `inventory` is
> `requires: 'location'` (`11 §8.7`) and `sort=total_spent_minor` on `customers`
> is `requires: 'currency'` (`11 §8.6`); a cursor that encodes only a market
> resumes a Chennai scan from a New Jersey key with no error, which is the exact
> failure `m` was introduced to prevent for markets.

**Changing visible columns does not invalidate a cursor**, and the client does
not refetch page 1 when it happens: `columns` affects the `SELECT` list and
nothing in the `ORDER BY`, so the cursor stays valid and the already-loaded pages
are re-rendered with the new projection — except when a newly-shown column's
`requires` is unmet, which cannot happen because the picker never offers it.

`totalEstimate` is `null` unless `?count=1`. The admin requests it **once per
filter change, never per page**, and renders it as "About 1,240" above 5,000 rows
(where it is a `reltuples` scale) and as an exact figure below. The bulk bar's
"select all matching" (§1.6) always requests the exact count, because a
selection the operator is about to act on may not be an estimate; above
`settings['admin.select_all_max']` (default 10,000) the exact count is refused
and so is the selection.

**No `offset`, and the admin has no page numbers.** `tests/unit/no-offset.test.ts`
already forbids it in `src/lib/db/raw/**` with one allowlisted storefront call
site. The admin's navigation is: infinite "Load more" (keyset forward),
**Back to top**, and — for the "page 800" need that page numbers are usually
asked for — a filter. There is no backward cursor and none is added: the browser's
own back button restores the loaded pages, because the grid keeps its page array
in the route's `useState` and does not remount on a filter-less back navigation.

### 1.6 Row selection

```ts
export type Selection =
  | { readonly mode: 'ids'; readonly ids: readonly string[] }
  | { readonly mode: 'matching';
      readonly filters: FilterSet; readonly scope: ListScope;
      readonly watermark: string;            // ISO — selection time
      readonly countAtSelection: number;     // exact, from ?count=1
      readonly excludedIds: readonly string[] };
```

- The header checkbox selects **the rows currently loaded**, which after three
  "Load more" presses is 150 rows, not 50. The count in the bulk bar says so:
  "150 selected".
- When the filtered set is larger than what is loaded, a second line appears in
  the bar: **"Select all 1,240 products matching this filter"**. Pressing it
  switches `mode` to `'matching'` and the bar's count becomes the exact
  `countAtSelection`. Deselecting an individual row in `'matching'` mode appends
  to `excludedIds` rather than collapsing to `'ids'` — the operator's intent was
  "all of these except that one", and materialising 1,239 ids to express it is
  both a fat `jobs.payload` and a stale snapshot.
- **`'matching'` is re-resolved server-side at apply time**, with
  `AND <resource>.created_at <= $watermark` appended. That is what makes it safe:
  a product created between the selection and the apply cannot be swept in, and a
  row that has since stopped matching the filter is simply absent and reported as
  `skipped_not_matching` (§4.7). If the re-resolved count *exceeds*
  `countAtSelection`, the watermark has failed to bound the set and the operation
  aborts as `CONFLICT` with both numbers in `jobs.result` — it never applies "more
  than the operator agreed to".
- Selection survives "Load more" and a column change. It is **cleared** by any
  change to `filters`, `sort`, `scope` or the active saved view, without a
  confirm, because a selection whose defining query moved underneath it means
  nothing. The bar animates out rather than the count silently changing.
- `Shift`+click range-selects between the last clicked row and this one within
  the loaded set. `⌘/Ctrl+A` with grid focus selects the loaded rows and does not
  escalate to `'matching'`.

### 1.7 Empty, loading and error states

| State | What renders |
| --- | --- |
| **Loading, first paint** | `limit` skeleton rows at the resolved `column_config` widths, so the header row does not reflow when data lands. Never a centred spinner over an empty panel — the shape of the table is information the operator already needs |
| **Loading, "Load more"** | The existing rows stay; three skeleton rows append; the button becomes a disabled spinner. Nothing above the fold moves |
| **Loading, filter change** | Rows dim to 40% opacity and stay mounted for up to 200 ms, then swap to skeletons. A filter that returns in 90 ms should not flash a skeleton |
| **Empty, no filters** | The resource's first-run state: a one-line explanation and the primary create action — "No products yet · Create a product" — and, when the environment carries demo rows, a link to them |
| **Empty, with filters** | "No products match these filters", the active filter chips (each individually removable), and **Clear all filters**. The chips are the fix and they are in the empty state rather than only above it |
| **Empty, saved view invalid** | "This view needs updating" naming the field that left the whitelist, with **Edit view** and **Show all rows instead** as two distinct buttons. It is **never** silently rendered as an unfiltered list — `tests/unit/saved-view-schema.test.ts` exists for exactly this, and an unfiltered fallback is the failure that shows one role another role's rows |
| **Error** | The `copy.error.<code>` string for `AppError.code` (`11 §2`), a **Retry** that re-issues the same request, and `requestId` in muted mono type so a support message carries it. The rows that had loaded stay on screen, greyed — discarding them to show an error card loses the operator's place |
| **Error, count only** | Rows render normally and the count area shows `—`. It never shows `0`: "no rows" and "we could not count" are different facts and the second one must not look like the first |
| **Scope missing** | A sort or filter requiring a market/currency/location with none selected renders the scope bar in an attention state with the reason — "Sorting by price needs a market" — and the grid falls back to the resource's **default** sort. The request is a `400` (`11 §8.12`) and the UI never issues it |
| **Permission-empty** | A resource the actor cannot read is not in the navigation and its route is a `403` from `requirePermission()` in the page. There is no "you don't have access" grid |

---

## 2. Saved views

### 2.1 What a view stores

Exactly the `saved_views` columns (`02 §2.9`) and nothing in `localStorage`:
`resource`, `name`, `owner_user_id`, `is_shared`, `is_default`, `filters`,
`column_config`, `sort`, `position` — plus two additions this specification
requires.

> **RESOLVED — was CHANGE REQUIRED IN 02 §2.9 (`saved_views`):**
> *Verified applied in 02.*
> ```sql
> ALTER TABLE saved_views ADD COLUMN scope     JSONB   NOT NULL DEFAULT '{}';
> ALTER TABLE saved_views ADD COLUMN is_system BOOLEAN NOT NULL DEFAULT false;
> ALTER TABLE saved_views ADD CONSTRAINT chk_saved_views_ownership
>   CHECK (owner_user_id IS NOT NULL OR is_shared);
> ```
> **`scope`** holds `{"market_code"?, "currency_code"?, "location_id"?}` and is
> validated so a key may be present only when some field in `filters` or `sort`
> declares that `requires` in `11 §8`. Without it, **"US Products" and "India
> Products" are not expressible** — `market_published` is `requires: 'market'`
> and the market has nowhere to live. **`is_system`** marks the nine seeded views
> so the delete action is absent rather than merely refused. The **CHECK** closes
> `owner_user_id IS NULL AND is_shared = false` — a view owned by nobody and
> shared with nobody is a row no query can ever return, and the two partial
> unique indexes already assume it cannot happen.

**A view stores a scope key only when the scope is part of the view's identity.**
"US Products" pins `market_code`; "Low Stock" does not pin `location_id`, because
low stock is the same question at every location and pinning one would make the
view useless to the other warehouse. An absent scope key is resolved from the
screen's scope bar; a present one pins it and the scope bar renders that control
locked, labelled with the view name. `tests/unit/saved-view-scope.test.ts`
asserts that every `scope` key present is required by some field of the view's
`filters` or `sort`, and that every `requires` in the view's fields is satisfied
by either `scope` or a screen-resolvable control.

### 2.2 Private, shared, system

| `owner_user_id` | `is_shared` | `is_system` | Meaning | Who may edit / delete |
| --- | :-: | :-: | --- | --- |
| set | `false` | `false` | **Private** — visible only to that user | the owner |
| set | `true` | `false` | **Shared** — visible to everyone holding the resource's read permission, attributed to the author | the owner, or an actor holding `settings.manage` |
| `NULL` | `true` | `true` | **System** — the nine seeded views | edit: `settings.manage`. **Delete: nobody** — the action is not rendered |

Sharing a private view is a one-click toggle and is itself audited
(`action = 'update'`, entity `saved_views`), because a shared view is a piece of
operational policy — it is what the next person will use to decide what to work
on.

`is_default` is per `(resource, coalesce(owner_user_id, zero-uuid))`, which the
existing partial unique index already expresses: an organisation default and a
personal default can both exist, and the personal one wins. Resolution order for
"which view opens when I click Products" is: the URL's `?view=`, then this user's
`is_default`, then the organisation's `is_default`, then the registry defaults
with no view active.

The tab strip renders the first five views by `position`; the rest are in a
**More views** menu. There is no per-user hiding of a system view and none is
added — an organisation that does not want one renames it or edits its filters
with `settings.manage`, which is a conversation rather than seven divergent
private copies.

### 2.3 Creating and editing

`/admin/tools/saved-views` (`08 §5`) is the management screen; the common path is
the **Save view** button in the filter bar, which is enabled whenever the current
`filters`/`sort`/`scope`/`column_config` differ from the active view. It offers
**Update this view** (only when the actor may edit it) and **Save as new**.

```ts
// src/server/actions/admin/savedViews.ts
export const saveView = adminAction(
  /* permission resolved per-resource — see below */ …,
);
```

`adminAction` takes a **literal** `PermissionKey` as its first positional
argument (`07 §3.3`), and a saved view's permission depends on its `resource`, so
the saved-view actions are the one place that shape does not fit. The resolution
is not a second wrapper and not a dynamic key: there are **eight** thin exported
actions, `saveProductView`, `saveOrderView`, … one per `saved_view_resource`,
each a two-line `adminAction('<literal>.read', schema, handler)` delegating to
one `saveViewImpl()`. Eight three-line exports keep `tests/unit/rbac-catalogue.test.ts`'s
"first argument is a string literal present in `PERMISSION_KEYS`" assertion true,
which a computed key would break for every reader of that test, not just this one.

### 2.4 How a view interacts with permissions

Four rules, and the third and fourth are the ones that matter.

1. **Visibility.** `listSavedViews(actor, resource)` is reached only after
   `requirePermission(actor, READ_PERMISSION[resource])`. The management screen
   lists views for the resources the actor can read and queries no others — a
   `WHERE resource IN (…)` over the actor's readable set, not a post-filter.
2. **A view's filters can only narrow.** Every field in `filters` is a member of
   `FILTER_WHITELIST[resource]` (`11 §8`), and no member of any of those ten
   lists selects rows outside the resource. The base visibility predicates
   (`deleted_at IS NULL` unless the view explicitly filters on it,
   `anonymized_at`, market scoping) are applied by `listResource()` **after** the
   view's filters and are not expressible as a view field.
3. **Column projection is re-derived per viewer and never stored as data.**
   `column_config` names columns; whether a named column is served is decided by
   `AdminColumnSpec.requires` against the *viewer's* permission set at request
   time (§1.2). A shared view authored by an `owner` with `cost` and `margin_bp`
   visible opens for a `catalog_manager` with those two columns absent from the
   response entirely. This is the rule that stops a saved view being a
   permission-laundering channel at the cell level, and it is why
   `11 §1.2` rule 3 needs the sentence §1.2 asks for.
4. **A view that sorts or filters on a field the viewer cannot read is refused,
   not silently rewritten.** A view with `filters: {"cost_minor": {"gte": …}}`
   opened by an actor without `price.read_cost` renders §1.7's "This view needs
   updating — it filters on a field you cannot read" with **Show all rows
   instead**. Silently dropping the predicate would return a *larger* set than
   the view's name promises; silently re-sorting would leak the ordering, and an
   ordering by cost is a cost oracle at one row of resolution per drag of the
   scrollbar.

`tests/integration/saved-view-permissions.test.ts`: as `catalog_manager`, open a
shared `prices` view authored by `owner` and assert (a) the response's `columns`
array contains neither `cost` nor `margin_bp`, (b) the raw SQL captured by the
query logger contains neither `cost_minor` nor a margin expression, (c) a view
sorting on `cost_minor` returns the needs-updating state and not rows.

### 2.5 The nine seeded views

`prisma/seed/07-saved-views.ts`, all `owner_user_id = NULL`, `is_shared = true`,
`is_system = true`, `is_default = false`. Category ids are resolved by slug at
seed time from `prisma/seed/03-categories.ts`.

| # | Name | `resource` | `filters` | `sort` | `scope` |
| --- | --- | --- | --- | --- | --- |
| 1 | Low Stock | `inventory` | `{"available_quantity":{"lte":2}}` | `available_quantity:asc` | `{}` — location from the scope bar |
| 2 | US Products | `products` | `{"market_published":{"eq":true},"status":{"eq":"active"}}` | `title:asc` | `{"market_code":"US"}` |
| 3 | India Products | `products` | `{"market_published":{"eq":true},"status":{"eq":"active"}}` | `title:asc` | `{"market_code":"IN"}` |
| 4 | One of a Kind | `products` | `{"is_one_of_a_kind":{"eq":true},"sold_at":{"is_null":true}}` | `created_at:desc` | `{}` |
| 5 | Lab Grown Diamonds | `products` | `{"category_id":{"eq":"<lab-grown-diamonds>"}}` | `title:asc` | `{}` |
| 6 | Closeouts | `products` | `{"category_id":{"eq":"<closeouts>"}}` | `updated_at:desc` | `{}` |
| 7 | Unpublished | `products` | `{"status":{"in":["draft","archived"]},"deleted_at":{"is_null":true}}` | `updated_at:desc` | `{}` |
| 8 | Missing Images | `products` | `{"completeness_check_failed":{"in":["gallery","hero"]}}` | `updated_at:desc` | `{}` |
| 9 | Missing SEO | `products` | `{"seo_check_failed":{"in":["meta_title","meta_description"]}}` | `seo_score:asc` | `{}` |

Three of those need a note.

**Low Stock sorts `available_quantity:asc`**, which is `requires: 'location'`
(`11 §8.7`), and its `filters` use `lte:2` so the query lands on
`idx_inventory_low_stock (location_id, available_quantity) WHERE available_quantity <= 2`
rather than the wider added index. The threshold is `2` because that is
`AVAILABILITY_LOW_THRESHOLD` (`11 §7.1`) — the same number the storefront calls
"Only N left", so the operational view and the customer-facing band cannot drift.
Per-item `reorder_point` is a *different* question (it is a replenishment
threshold, not a scarcity band) and has its own filter field; a second seeded
view for it is not created until someone sets a `reorder_point`.

**Unpublished filters on `status`, not on `market_published: false`.**
`idx_pmc_market_published` is `WHERE is_published`, so the negation is an anti-join
over the whole catalogue with no index behind it. `status in (draft, archived)` is
served by `idx_products_published` and answers the question the merchandiser
actually asks — "what have I not finished".

**Missing Images and Missing SEO need one filter field that does not yet exist.**
`products.completeness_checks` and `products.seo_checks` store **only the failing**
`key → hint` map (`03 §1.6`), which makes "is `gallery` failing" a JSONB key test.

> **RESOLVED — was CHANGE REQUIRED IN 11 §8.3 (`products` filter whitelist) and 11 §8.11:** add
> *Verified applied in 11.*
> two filter fields and the two indexes that serve them.
>
> | Filter field | Operators | Requires | Index |
> | --- | --- | --- | --- |
> | `completeness_check_failed` | `eq`, `in` | — | `idx_products_completeness_checks` |
> | `seo_check_failed` | `eq`, `in` | — | `idx_products_seo_checks` |
>
> ```sql
> CREATE INDEX CONCURRENTLY idx_products_completeness_checks
>   ON products USING GIN (completeness_checks) WHERE deleted_at IS NULL;
> CREATE INDEX CONCURRENTLY idx_products_seo_checks
>   ON products USING GIN (seo_checks) WHERE deleted_at IS NULL;
> ```
> `eq` compiles to `completeness_checks ? $1`, `in` to `completeness_checks ?| $1::text[]`
> — both `jsonb_ops` GIN operators, which is why the default opclass is used and
> not `jsonb_path_ops`. The accepted values are the fifteen `key` strings of
> `03 §1.6` and the nine of `03 §1.7`; a value outside them is a `400`, the same
> as any other whitelist violation. Without this field, "Missing Images" can only
> be approximated as `completeness_score lt:88`, which also matches a product
> with three photographs and no care instructions — a view that sends a
> merchandiser to the wrong work is worse than no view.

---

## 3. Inline editing

### 3.1 Which cells

Exactly the cells marked `E` in §1.3, and no others. The set is deliberately
narrower than "every editable column": a cell is inline-editable only when its
write is (a) a single scalar on a single row, (b) valid to make without reading
anything not on screen, and (c) not a state-machine edge. That test is what
excludes `orders.status`, `returns.status`, every inventory quantity, and
`customers.accepts_marketing`, each for the reason given in §1.3.

Everything else on a row is reached by clicking the row, which opens the detail
route — or, below 1024 px, a `DrawerForm` (§8.3).

### 3.2 Optimistic concurrency — how each cell carries its own `expectedVersion`

**The concurrency unit is the row, not the cell**, because `products.version` is
one column and there is no per-column version anywhere in `02`. What each cell
carries is the version *it was drawn from*, which is how a stale cell in a
long-lived grid is detected even when a sibling cell on the same row has since
saved successfully.

```ts
// src/server/actions/admin/inline.ts
export const setProductField = adminAction(
  'product.update',
  z.object({
    id: z.string().uuid(),
    expectedVersion: z.number().int().nonnegative(),
    fields: z.record(z.string(), z.unknown()),   // 1..4 keys, each an ADMIN_COLUMNS inlineEdit key
  }).strict(),
  (input, actor) => setResourceFields({ resource: 'products', ...input, actor }),
);
```

Three concurrency tokens, one per `InlineEditSpec.concurrency` value:

| Token | Resources | Predicate | Failure |
| --- | --- | --- | --- |
| `version` | `products`, `variants`, `orders`, `customers`, `inventory`, `returns` | `UPDATE … WHERE id = $1 AND version = $2` then `version = version + 1` | 0 rows ⇒ `StaleWriteError` (`STALE_WRITE`) |
| `price_row` | `prices` | `UPDATE prices SET valid_to = now() WHERE id = $expectedPriceId AND valid_to IS NULL AND deleted_at IS NULL`, then `INSERT` the new row, then `price_history` — all one transaction | 0 rows on the close ⇒ `StaleWriteError` |
| `row_version` | `media` | `UPDATE media … WHERE id = $1 AND row_version = $2` | 0 rows ⇒ `StaleWriteError` |

`prices` has **no `version` column and no `updated_at`** — it is append-only,
with `valid_to` closing the superseded row (`02 §2.5`). The cell therefore carries
`expectedPriceId`, the id of the live row it rendered, and staleness is "that row
is no longer live", which is strictly stronger than a version check: it also
catches a recalculation run having superseded the row (`09 §4.5` calls the same
token `expectedPriceId` on the recalc path, and it is the same value).

> **RESOLVED — was CHANGE REQUIRED IN 02 §2.8 / the §7 appendix row for `media`:** add
> *Verified applied in 02.*
> `row_version INTEGER NOT NULL DEFAULT 0`. `media.version TEXT` is **Cloudinary's
> asset version** and is not a concurrency counter; there is currently no way to
> write an optimistic update against a `media` row, which makes the alt-text audit
> — the highest-volume inline editing surface in the product — last-write-wins.
> The column is named `row_version` rather than `version` precisely because the
> provider's `version` already occupies the obvious name, and two columns called
> `version` on one table is how the wrong one ends up in an `UPDATE`.

### 3.3 The save-state machine

Per cell, and it is `06 §6.2`'s machine with the same names and the same rule
that the pill is never optimistic:

| State | Cell affordance | Exit |
| --- | --- | --- |
| `idle` | no indicator | edit → `pending` |
| `pending` | amber left edge on the cell | debounce/flush → `saving` |
| `saving` | 12 px spinner in the cell's trailing corner; the cell stays editable | `200` → `saved`; `STALE_WRITE` → `conflict`; 4xx → `failed` terminal; network/5xx → retry then `failed` |
| `saved` | green check for 1.5 s, then `idle` | edit → `pending` |
| `failed` | red left edge; the typed value is retained and still editable; a trailing **Retry** | retry → `saving` |
| `conflict` | red left edge + the row's conflict bar (§3.5) | §3.5 |

Set from the server response, never from the request being sent.

**Debounce: 750 ms**, the same number as `01 §2.7` and `06 §6.1`, so there is one
answer in the product and not two. Flush immediately on: blur, `Enter`, `Tab`,
focus moving to another **row**, `visibilitychange` to hidden, `pagehide`, and
explicit ⌘S. Idle flush at 10 s regardless of typing, which bounds worst-case
loss on a crash to ten seconds exactly as the builder does.

**Max one request in flight per row, not per table.** Fifty rows may be saving at
once; one row's second save is queued behind its first. That is not a throttle,
it is a correctness requirement: two in-flight saves against the same row both
carry the same `expectedVersion` and the second is guaranteed to `STALE_WRITE`
against its own predecessor. For the same reason, **two cells of the same row
edited inside one debounce window are coalesced into a single action call with
two keys in `fields`** — which is also why `fields` is a record and not a
`{ field, value }` pair. A monotonic per-row `clientSeq` accompanies every
request and a response older than the last applied one is discarded, exactly as
`06 §6.1` specifies for the builder.

There is **no local recovery buffer** for grid inline editing, unlike the CMS
builder. The reason is proportionality: the builder's unsaved state can be twenty
minutes of layout work, while an inline cell's is one field the operator can still
see in the input, and an IndexedDB restore prompt over a data grid would fire on
every reload for a value the person already abandoned. A `failed` cell keeps its
typed value on screen and the navigation guard (`beforeunload`) fires while any
cell is `pending`, `saving`, `failed` or `conflict`.

### 3.4 Keyboard

| Key | Behaviour |
| --- | --- |
| `↑ ↓ ← →` | Move the focused cell. Does not enter edit mode |
| `Enter` | Enter edit mode; from edit mode, commit and move **down** one row, same column |
| `Tab` / `Shift+Tab` | Commit and move to the next/previous **editable** cell, wrapping across rows |
| `Escape` | Revert this cell to its last server-confirmed value and leave edit mode. Does not undo a committed save |
| `Space` | Toggle a `toggle` cell; open a `select` cell |
| `⌘/Ctrl+S` | Flush every `pending` cell in the table |
| `⌘/Ctrl+A` | Select the loaded rows (§1.6) — grid focus only, not in edit mode |
| `Shift+Click` | Range-select rows |
| `⌘/Ctrl+Z` | **Unbound, deliberately.** An undo stack over writes that already committed to Postgres and already wrote an `audit_logs` row is a promise the client cannot keep. §4.8 gives the real reversal mechanism |

`Enter`-moves-down is what makes a column-at-a-time audit (alt text, reorder
points, SKUs) fast, and it is the interaction the Missing Images and Missing Alt
views exist to feed.

**Announcements.** Each cell's transition to `saved`, `failed` or `conflict` is
announced in an `aria-live="polite"` region, **coalesced at 1 s** — "3 changes
saved", "1 change failed" — so pasting down a column of fifty does not produce
fifty announcements and a screen-reader user can still hear the one failure.

### 3.5 Row 14 of 50 returns `StaleWriteError` while 1–13 succeeded

**Rows 1–13 stay committed.** Inline edits are per-row independent transactions
and are never batched into one; there is no outer transaction to roll back and no
attempt to make one. Batching them would mean a single conflict on row 14 discards
thirteen correct writes, which is a worse outcome than the conflict it prevents.

Rows 15–50 are unaffected and keep saving — the failure is scoped to one row's
queue.

Row 14 enters `conflict`, and the row grows a bar beneath it:

> **Changed by Priya at 14:31.** The price you edited is now ₹42,500.
> **Reload row** · **Keep mine** · **Open in a new tab**

- **Reload row** calls `getResourceRow(actor, resource, id, columns, scope)` and
  redraws that one row with the fresh values and the new version. The pending
  value is discarded — and it is still visible in the bar's text until the bar is
  dismissed, so it can be retyped.
- **Keep mine** refetches, then re-applies the pending fields against the fresh
  `expectedVersion`. If the other actor changed **the same field**, it refuses
  and the bar becomes a two-value choice naming both — "Priya set ₹42,500, you
  typed ₹39,900" — with **Use mine** / **Use theirs**. A blind re-apply here is
  last-write-wins with an extra click, which is the defect `02 §2.8` introduced
  the version column to eliminate.
- **Open in a new tab** opens the detail route read-only.

The grid **does not re-sort while any cell is `pending`, `saving` or `conflict`**,
and never re-sorts on its own regardless: the loaded page set holds its order for
its lifetime and a sort change is a new fetch from page 1. On a grid sorted by
`updated_at`, a live re-sort makes the row the operator is typing into jump out
from under the cursor, and the next keystroke lands in someone else's product.

The other actor's name comes from the most recent `audit_logs` row for
`(entity, entity_id)` — the same source `06 §6.4`'s conflict modal uses. When
there is none (a job wrote the row), the bar says "Changed by a background job"
and links to `/admin/system/jobs`.

`tests/integration/inline-edit-conflict.test.ts`: open fifty product rows, write
rows 1–13 from session A, write row 14 from session B, then save row 14 from A;
assert rows 1–13 are persisted with A's values, row 14 holds B's, A's row 14 is
in `conflict`, and exactly fourteen `audit_logs` rows exist — thirteen for A and
one for B.

### 3.6 The audit-log consequence of every inline change

**One `audit_logs` row per committed inline save**, written by `recordAudit()`
inside the same transaction as the `UPDATE` (`01 §2.3` step 5). No coalescing,
no throttle, and that is a deliberate divergence from `06 §6`'s builder, which
coalesces content ops into one row per editing window.

The reason is that the builder has `content_versions` behind it — a table whose
whole job is "what did this page used to say" — so `audit_logs` there only needs
to answer "who touched it". A products grid has no version table. For
`products.title`, `product_variants.sku`, `inventory_items.reorder_point` and
`media.alt_text`, the `audit_logs` row **is** the only record that the value was
ever different, and a coalesced row that overwrites its own `after` throws away
every intermediate state in the window.

| Field | Value |
| --- | --- |
| `entity` | the physical table — `products`, `product_variants`, `prices`, … |
| `entity_id` | the row id |
| `action` | `update` |
| `before` / `after` | **only the changed keys**, both redacted by `redact()` (`07 §7.3`) |
| `summary` | `inline: title, status` — the field list, so the log is filterable by *how* a change was made |
| `request_id` | the `x-request-id`, which is what groups a coalesced multi-field save |

Volume is bounded by the coalescing in §3.3 (one call per row per 750 ms, not one
per keystroke) and by the fact that an inline cell is a discrete value change, not
a typing stream. Fifty rows of alt text is fifty rows in `audit_logs`, which is
the correct number.

**`prices` writes three things, not one**, and `04` owns two of them: the closed
`prices` row, the new `prices` row, a `price_history` row with a
`price_change_reason`, and the `audit_logs` row. The inline path adds no fourth
mechanism — it calls `setManualPrice()`, which already does all four.

---

## 4. Bulk editing

### 4.1 What the bulk bar offers, per resource

`BulkActionBar` appears when `Selection` is non-empty. It renders **only** the
actions whose permission the actor holds — and then the server re-checks, because
hiding a button is not authorization (`00-CONTEXT` hard rule 9).

| Resource | Bulk-editable fields | Non-edit bulk actions | Permission |
| --- | --- | --- | --- |
| `products` | `status`; `primary_category_id`; add/remove `category_id`; add/remove `collection_id` *(manual collections only)*; add/remove `tag_id`; `is_made_to_order`; `lead_time_days`; market publish toggle | Export selected | `product.update`; the status and market-publish fields need `product.publish` |
| `variants` | `is_active`; `inventory_policy`; `country_of_origin`; `hs_code`; `tax_code` | Export selected | `variant.update` |
| `prices` | `list_minor` — set / adjust by percent / adjust by amount; `sale_minor` — set / set as percent off list / clear; `compare_at_minor` — set / clear | Export selected | `price.update` |
| `inventory` | `safety_stock_quantity`; `reorder_point`; `bin_location` | Export selected | `inventory.adjust` |
| `customers` | `customer_group_id` | Export selected | `customer.update` (export also `customer.export`) |
| `media` | `folder_id` (move); add/remove `tag_id`; `credit` | Export selected | `media.update` |
| `orders` | **none** | Export selected · Print packing slips | `order.read` (+ `customer.export` for the export) |
| `returns` | **none** | Export selected | `return.read` |

Four absences are decisions, not omissions.

- **No bulk order actions.** Bulk fulfil, bulk cancel and bulk refund are each a
  state-machine edge with per-order preconditions (`createShipment()` refuses
  outside `paid`/`processing`; a refund is capped by that order's captured
  amount) and each moves money or stock. Fifty of them behind one button is fifty
  decisions the operator did not make. The fulfilment workflow is the
  `/admin/orders` filtered queue plus the detail page, one order at a time.
- **No bulk quantity change.** As §1.3 says: a quantity is a ledger row with a
  type and a reason. The bulk form for it is a CSV `inventory` import, which has
  somewhere to put both.
- **No bulk `alt_text`.** One alt text applied to forty images is wrong for
  thirty-nine of them and passes the completeness check for all forty, which is
  worse than leaving it blank.
- **No bulk delete, anywhere.** §7.2.

**A `prices` bulk edit is refused without `scope.market_code`.** Not defaulted,
not inferred from the filter — refused, with `VALIDATION_FAILED` naming the
scope. "Raise prices 10%" across two markets is the hard-rule-2 violation that
does the most damage per click.

### 4.2 The plan, and the preview

There is always a preview, and it is not a separate implementation.

```ts
// src/lib/admin/bulk.ts
export type BulkPlan = {
  readonly resource: SavedViewResource;
  readonly selection: Selection;
  readonly scope: ListScope;
  readonly ops: readonly BulkOp[];   // 1..5; each { field, mode, value }
};

export type BulkPreview = {
  readonly resolvedCount: number;
  readonly sample: readonly { id: string; label: string;
                              before: Record<string, unknown>;
                              after:  Record<string, unknown> }[];   // first 20
  readonly skipPreconditions: readonly { reason: string; count: number }[];
  readonly extremes: { minAfterMinor: string; maxAfterMinor: string;
                       currencyCode: CurrencyCode } | null;  // prices only
  readonly willRunAsJob: boolean;
};

export async function previewBulkEdit(actor: StaffActor, plan: BulkPlan): Promise<BulkPreview>;
export async function applyBulkEdit(actor: StaffActor, plan: BulkPlan)
  : Promise<{ kind: 'inline'; result: BulkResult } | { kind: 'job'; jobId: string }>;
```

`previewBulkEdit()` and the `bulk_edit` job handler both call the same
`resolveSelection()` and the same `computeAfter()`. A preview that is a second
implementation of the apply is a preview that is sometimes wrong, and being
sometimes wrong is the only failure mode a preview has.

The dialog shows, in this order: the sentence ("Set **status** to **Active** for
**412 products**"), the first twenty rows as `before → after` with changed values
emphasised, the precondition-skip tally with each reason spelled out, and — for
`prices` — the **minimum and maximum resulting amount** in the scope currency.
That last line is the whole reason a price preview exists: a 10% cut applied to a
selection that includes a $39 charm is visible as `min $35.10` before it is
visible as a customer complaint.

`sample` is twenty rows because that is roughly a screen and an operator reads
it; two hundred is a scroll nobody does.

### 4.3 How the selection is expressed

§1.6's `Selection`, verbatim, carried in `plan.selection` and — for a job — in
`jobs.payload`. `mode: 'ids'` carries the ids (capped at
`settings['admin.select_all_max']`, default 10,000); `mode: 'matching'` carries
filters, scope, watermark, `countAtSelection` and `excludedIds`, and is
re-resolved at run time with the watermark predicate. A `'matching'` payload is a
few hundred bytes regardless of the row count, which is also why a 40,000-row
bulk edit is expressible at all.

### 4.4 The >50-row hand-off

`applyBulkEdit()` resolves the selection count first.

- **≤ 50 rows:** applied inside the request, **row by row, each its own
  transaction** — not one wide `UPDATE`, because the per-row optimistic predicate
  and the per-row audit row are the point. Returns `BulkResult` directly and the
  grid patches the affected rows in place.
- **> 50 rows:** enqueues
  `jobs(kind = 'bulk_edit', created_by_user_id = actor.userId, dedupe_key = 'bulk:<resource>:<sha256(plan)>', payload = plan)`.
  `bulk_edit` is `systemPermitted: false` (`11 §3.2`), so a `NULL` creator fails
  as `FORBIDDEN` rather than running with everything — which is exactly what
  protects a queued price edit from a soft-deleted author. `runJob()` re-resolves
  the actor from the database at run time (`11 §3.3`), so a role revoked between
  queue and claim fails the job at the first row, not at row 4,000.

The dialog closes to a toast — "Updating 412 products · View progress" — linking
to `/admin/system/jobs/<id>`. The grid keeps a progress strip above the header fed
by `GET /api/admin/jobs/[id]/stream` (`08 §2.2`, `job.read`) and refetches the
current page when the job reaches a terminal status.

The 50-row line is `01 §2.7`'s and is not re-derived here. It is stored as
`settings['admin.bulk_inline_max']` so an operations incident can lower it without
a deploy; the seeded value is 50.

### 4.5 There is no bulk-edit permission

`11 §1.2` rule 2 is the authority and this document does not relitigate it. What
it means concretely:

- The bulk bar's action list is filtered by `can(actor, BULK_FIELD_PERMISSION[resource][field])`.
- `applyBulkEdit()` is a plain service function, not an `adminAction`, and its
  first statement is `requirePermission(actor, p)` for **every distinct
  permission the plan's ops require** — a plan touching `status` and
  `lead_time_days` checks `product.publish` and `product.update`, both.
- The enqueue is authorised identically. Routing to a job changes the execution
  model, not the authorisation model.

### 4.6 The per-row re-check inside the job

```ts
// src/lib/jobs/handlers/bulkEdit.ts
export async function handleBulkEdit(job: Job, actor: Actor): Promise<void> {
  const plan = BulkPlanSchema.parse(job.payload);
  const required = requiredPermissionsForBulk(plan);        // Set<PermissionKey>
  for (const p of required) requirePermission(actor, p);    // fails the whole job, fast

  const result = emptyResult(plan);
  for await (const batch of resolveSelectionPaged(plan, { batchSize: 200 })) {
    for (const row of batch) {
      try {
        for (const p of required) requirePermission(actor, p);   // ← per row, §4.6
        await prisma.$transaction(async (tx) => {
          const fresh = await lockAndReadRow(tx, plan.resource, row.id);
          if (fresh === null)                 throw new NotMatchingError();
          if (!stillMatches(fresh, plan))     throw new NotMatchingError();
          const precondition = checkPrecondition(fresh, plan);
          if (precondition !== null)          throw new PreconditionSkip(precondition);
          await writeRow(tx, plan, fresh);                  // optimistic on fresh.version
          await recordAudit(tx, auditFor(plan, fresh, actor, job));
        });
        result.applied++;
      } catch (e) { classify(e, result, row.id); }          // §4.7
    }
    await bumpProgress(job, result);                        // every 200 rows
  }
  await finishJob(job, result);
}
```

**Why the check is inside the loop and not only above it.** It is not because the
actor can change mid-job — `runJob()` resolves the actor once, and that is the
correct behaviour (a job runs with the permissions its originator held when it was
claimed, not a moving target). It is for three other reasons, and they are the
ones that make the line load-bearing rather than ceremonial:

1. **It is the single authorisation site for row-scoped rules.** The permission
   set for a row is computed from the row, not from the plan: a `prices` op that
   touches `cost_minor` requires `price.read_cost`, and whether an op touches it
   can depend on the row (an "adjust by percent" over a row with a `cost_minor`
   writes a margin the actor may not be allowed to see recomputed). When a future
   rule is per-market or per-location, this loop is where it lands — and it lands
   in one place rather than being forgotten in the job while the request path has
   it.
2. **It is what makes the job and the ≤50 inline path provably identical.** The
   inline path calls the same `applyOneRow()`; if the check lived only in the
   caller, the two paths would have two different authorisation stories and
   `tests/integration/rbac-matrix.test.ts` would exercise only one.
3. **It costs nothing.** `requirePermission` on a resolved actor is a `Set.has`;
   forty thousand of them is microseconds, and the alternative is an argument
   about where the check "really" belongs, held once per future contributor.

`tests/integration/bulk-edit-permission-recheck.test.ts`: enqueue a `bulk_edit`
over 200 products as `catalog_manager`; before the worker claims it, revoke
`product.update` from that role and invalidate sessions (`09 §4.5`); assert the
job ends `failed` with `FORBIDDEN` in `jobs.error` and **zero** rows changed — and
separately, that a plan whose ops require `price.read_cost` fails for an actor
without it even though the selection resolves.

### 4.7 Partial-failure semantics and `jobs.result`

Every row is its own transaction. Five outcomes:

| Row outcome | Cause |
| --- | --- |
| `applied` | written |
| `skipped_conflict` | the optimistic predicate matched zero rows — someone else wrote it |
| `skipped_precondition` | a named business rule refused it — a `metal_linked` price in a `list_minor` set without an override, a sold one-of-a-kind in a publish, a rule-based collection in an add-to-collection |
| `skipped_not_matching` | `'matching'` mode, and the row no longer satisfies the filter |
| `failed` | anything else — a constraint violation, a provider error |

**`jobs.status` is `succeeded` whenever the loop ran to completion**, however many
rows were skipped, and `failed` only when the loop itself could not continue — a
`FORBIDDEN`, the selection query failing, the plan failing re-validation. A status
that means "mostly worked" makes the Retry button ambiguous, and the retry of a
partially applied bulk edit is a different operation from the retry of one that
never started.

```jsonc
// jobs.result
{ "resource": "products", "ops": [{"field":"status","mode":"set","value":"active"}],
  "selected": 412, "applied": 401,
  "skipped_conflict": 7, "skipped_precondition": 3, "skipped_not_matching": 1, "failed": 0,
  "rows": [ {"id":"018f…","status":"skipped_conflict","reason":"version 4 expected, found 6"} ],
  "detail_media_id": null }
```

`rows` is capped at **500** entries. Above that, the full per-row detail is
written as a CSV, uploaded as an `authenticated` Cloudinary raw asset and
referenced by `detail_media_id`; `/admin/system/jobs/[id]` offers it as a
download through the same proxying route the export uses. A forty-thousand-element
JSONB in `jobs.result` is a column nobody can open and a page nobody can render.

> **RESOLVED — was CHANGE REQUIRED IN 02 §2.9 (`jobs`):** document `result.detail_media_id UUID`
> *Verified applied in 02.*
> as a recognised key of the `result` envelope, and add the `media` row it points
> at to the same 30-day prune as `import_job_rows` (§1.4). Without the prune, a
> weekly bulk edit leaves an authenticated PII-adjacent CSV in Cloudinary forever.

**Progress** is written every 200 rows, not every row: one `UPDATE jobs` per row
on a 40,000-row edit is 40,000 writes to the table the claim query scans.
`progress_total` is `resolvedCount` and is set before the first batch.
`/api/admin/jobs/[id]/stream` (SSE) feeds the strip and closes on a terminal
status.

**Resumability.** The watchdog (`idx_jobs_stuck`) requeues a job whose invocation
died. The handler resumes from `progress_current` by paging the same keyset query
with the stored cursor in `jobs.payload.cursor`, and every write is idempotent in
the only sense that matters: re-applying `status = 'active'` to a row that already
has it is a no-op that consumes its optimistic predicate and reports `applied`.

### 4.8 Is a bulk edit undoable? No — and here is what exists instead

There is **no undo button** on a bulk edit, and adding one would be dishonest. An
inverse-operation log has to store a before-value per row — which is exactly what
`audit_logs` already stores — and replaying it is itself a bulk edit against rows
that have moved since, silently reverting a colleague's later correction with no
preview and no conflict handling.

What exists instead is a reversal that goes through every guard a forward edit
goes through:

1. Every row's `before` is in `audit_logs`, and every row written by one job
   shares that job's `request_id`.
2. `/admin/system/jobs/[id]` offers **Export before-values as CSV** — a file whose
   columns are the resource's CSV import columns, whose values are the `before`
   side of that job's audit rows, and whose id column is the resource's natural
   key.
3. That file is accepted back by `/admin/tools/import` as an `update` import of
   the same resource. Which means the reversal gets the full §5 flow: validation,
   a per-row preview, the resource's own write permission, and a per-row report
   of what could not be reverted because it had changed again.

That is a slower undo than a button, and it is the only one that cannot silently
destroy a third party's work. It is also free: it reuses two mechanisms that exist
for other reasons.

**`prices` is additionally reversible without any of that**, because nothing was
overwritten: the superseded rows still exist with `valid_to` set, and
`/admin/pricing/history` filtered by `recalc_run_id` or by date restores them
row by row.

---

## 5. CSV import and export

### 5.1 The six importable resources

`import_jobs.resource` is `products | variants | prices | inventory | customers |
redirects` (`11 §7.6`), constrained by `chk_import_jobs_resource`. There is no
seventh, and adding one fails to compile because
`requiredPermissionsForImport()` is exhaustive over the same union (`11 §1.5`).

### 5.2 The flow

Seven steps. The route, the function and the permission at each one:

| # | Step | Where | Permission |
| --- | --- | --- | --- |
| 1 | **Choose** resource + mode | `/admin/tools/import` | `import.run` to reach the page. The resource picker renders only resources for which `requiredPermissionsForImport(resource, mode)` is satisfiable by this actor |
| 2 | **Upload** | `POST /api/admin/import/upload` (multipart, ≤ `MEDIA_MAX_UPLOAD_MB`) | `staff:import.run`, **plus `customer.export` when `resource = 'customers'`** (`08 §2.2`) |
| 3 | **Analyse** | the `run-jobs` worker, never the request | — |
| 4 | **Map** | `saveImportMapping(actor, importJobId, mapping)` | `import.run` |
| 5 | **Validate** | the worker, over the first 500 rows | — |
| 6 | **Show errors** | `/admin/tools/import/[importJobId]` | `import.run` |
| 7 | **Confirm + apply** | `importJobApply(actor, importJobId)` → `jobs(kind='import_apply')` | **`import.run` AND the resource's own write permission** (`11 §1.5`) |

**Step 7 is the rule that stops an import of one resource becoming a way to write
another**, and it is `11 §1.5` verbatim, not a paraphrase:

| `resource` | Required **in addition to** `import.run` |
| --- | --- |
| `products` | `product.update`; plus `product.create` when `mode ∈ {create, upsert}` |
| `variants` | `variant.update`; plus `product.create` when `mode ∈ {create, upsert}` |
| `prices` | `price.update` |
| `inventory` | `inventory.adjust` |
| `customers` | `customer.update` **and** `customer.export` |
| `redirects` | `redirect.manage` |

`requiredPermissionsForImport()` is the **first statement** of `importJobApply()`.
`import.run` reaches the tool, uploads the file and runs the bounded dry run, and
authorises no write at all. An `inventory_manager` — who holds `import.run` and
`inventory.adjust` and not `price.update` — can upload a price CSV, see it
validate cleanly, and cannot apply it. That is deliberate: the dry run is
diagnostic and harmless, and refusing the upload would mean the tool cannot be
used to check a file before handing it to someone who can apply it.

A column in the mapping that the actor may not write is a **file-level**
rejection at step 4, not a per-row one — a `prices` file mapping `cost_minor` for
an actor without `price.read_cost` is refused with the column named, because
letting it through and skipping the column per row means the operator applies a
file believing the cost column landed.

Steps 2–5 in detail:

**Upload (2).** Streamed to Cloudinary as a raw asset with `type: 'authenticated'`
and `access_mode: 'authenticated'` — a customer or order CSV is a bulk PII file
and Cloudinary's default `upload` type serves it to anyone who learns the
`public_id`, which appears in a job record, a log line and a Sentry breadcrumb.
Creates `import_jobs` with `is_dry_run = true` and returns the id. The request
parses nothing.

**Analyse (3).** The worker reads the header row and the first 500 data rows.
Delimiter sniffed across `,` `;` `\t` on the header line. A UTF-8 BOM is stripped.
**Encoding is UTF-8 and is not guessed:** a file that fails
`new TextDecoder('utf-8', { fatal: true })` is rejected whole with
`VALIDATION_FAILED` and the message "This file is not UTF-8 — re-export it as
CSV UTF-8". Excel's default Latin-1 export is the most common import failure in
any system, and the alternative to rejecting it is silently corrupting every
accented name and every ₹ sign in the file. Rows land in `import_job_rows` with
`status = 'pending'` and `raw` holding the row as a header-keyed object.

**Map (4).** The screen shows detected header → target column, the unmapped
headers, and the required target columns not yet mapped. A proposed mapping is
generated by case- and punctuation-insensitive exact match, then by a trigram
similarity pass over the resource's column labels; it is a **proposal** and the
operator confirms it. Saving writes `import_jobs.mapping` and re-runs step 5 over
the same 500 rows.

**Validate (5).** Five layers, in this order, and a row stops at the first layer
it fails so the operator is not shown six consequential errors for one cause:

| Layer | Checks |
| --- | --- |
| **Shape** | header present and non-duplicated; row width equals header width; ≤ 50,000 data rows; ≤ 10,000 characters per cell |
| **Type** | the resource's Zod schema — the same schema the server action uses, so "valid" has one definition (`01 §1.1`) |
| **Money** | every money column is an **integer string in minor units**, currency taken from `import_jobs.currency_code`. A cell containing `.` `,` `$` `₹` or a space is an **error, never a coercion**. `12.50` is the single most dangerous cell in a jewellery price file: coerced one way it is ₹12.50, the other ₹1,250 |
| **Referential** | every `sku`, `slug`, category/stone/material slug, `market_code` and location name resolved in **one** `WHERE … IN (…)` per reference type across the whole batch. An unresolved value is a cell error naming the value, never a silent null |
| **Business** | `chk_prices_sale_lte_list`; `chk_prices_variant_level_formula` — **`price_source` is not an importable column at all**, so a CSV cannot create a formula binding; `chk_import_jobs_price_market`; `SKU_PATTERN`; one-of-a-kind `on_hand_quantity ≤ 1`; **in-file uniqueness** — a `sku` appearing in rows 12 and 340 is an error on **both**, each naming the other's row number, because a database unique violation at row 4,000 is otherwise the first anyone hears of it |

### 5.3 How errors present

`import_job_rows.errors` is an array; a cell error names its column, a row error
does not:

```jsonc
[ {"column":"sale_minor","code":"SALE_GT_LIST","message":"Sale price is above list price.","value":"4500000"},
  {"column":null,"code":"DUPLICATE_IN_FILE","message":"SKU MD-RNG-0412 also appears on row 340.","value":null} ]
```

The preview screen renders the first 500 rows as a grid:

- The left gutter is the **line number in the file**, header included, so "row 41"
  means line 41 in the spreadsheet the operator opens next.
- An invalid cell is outlined, and its message is in a popover on hover **and on
  focus** — keyboard reachable, because fixing a 500-error file with a mouse is
  not a workflow.
- Above the grid, a **per-column error tally** — "`sale_minor` · 38 rows",
  "`sku` · 4 rows" — and each tally filters the grid to those rows. That is how a
  large error list is actually fixed: one column at a time, not one row at a time.
- A **Download errors as CSV** button emits the original file with two appended
  columns, `_row_status` and `_errors`, so the correction happens in the tool the
  file was authored in.
- A banner states the bound plainly: "Validated the first 500 of 8,412 rows.
  Rows 501 onward are validated when you apply."

### 5.4 Confirm, apply, and what a partial import does

The confirm bar shows `valid_rows` / `invalid_rows` and a two-option radio:

- ○ **Import nothing until the file is clean** — *(default)*
- ○ Import the 462 valid rows and skip the 38 invalid

The default is the strict one because a partial import of a price file leaves a
catalogue in a state no one can describe and no one can diff. The permissive
option exists because a 9,000-row catalogue import with 4 bad rows should not
block on a round trip to the supplier.

**Apply** flips the **same** `import_jobs` row to `is_dry_run = false`, sets
`job_id`, and enqueues `jobs(kind='import_apply', dedupe_key = import_jobs.id)`.

**The apply re-parses and re-validates the whole file, not just the 500 rows the
preview saw.** Rows 501 onward have never been looked at; treating the preview as
the validation is the trap this flow exists to avoid. Rows validated in the
preview are re-validated anyway, because minutes have passed and a referenced SKU
may have been deleted.

Partial-import semantics, mirroring §4.7 because they are the same problem:

- Each row is its own transaction. `import_job_rows.status` moves
  `pending → valid → applied` with `entity_id` set to the row it wrote, or stays
  `invalid`, or becomes `failed` with the error.
- `import_jobs.applied_rows` / `valid_rows` / `invalid_rows` are the counters;
  `/admin/tools/import/[id]` renders them live from the same SSE stream.
- **Nothing is rolled back at the end.** A 30,000-row import that rolls back on
  row 29,998 costs twenty minutes and communicates nothing. What it leaves behind
  is fully described: every applied row has an `entity_id` and an `audit_logs`
  row, and the before-values export of §4.8 works here identically.
- **Resumability.** The handler skips rows already `applied`, so a watchdog
  requeue does not double-apply. For `mode = 'create'` that matters most:
  re-running a create over an applied row would be a duplicate, and the
  `import_job_rows.status` check is what prevents it before any unique index has
  to.

`tests/integration/import-preview.test.ts` (`09 P29` already commissions it) is
extended to assert that a file whose row 600 is invalid **previews clean** and
**applies with row 600 reported**, which is the specific behaviour the 500-row
bound produces and the one an operator will otherwise discover in production.

### 5.5 Export

| Resource | Extra permission beyond `export.run` + the resource read |
| --- | --- |
| `products`, `variants`, `prices`, `inventory`, `media`, `redirects` | — |
| `orders`, `order_items`, `returns`, `customers` | **`customer.export`** (`11 §1.5`) |
| `audit_logs` | `audit.read` |

**Columns are the resource's `ADMIN_COLUMNS` entry, filtered by the actor's
permissions**, plus the resource's stable id and natural key, plus — for `orders`
— the option to emit one row per order or one row per order line
(`order_items`). One registry, so an export cannot carry a column the grid would
have withheld: an actor without `price.read_cost` exports a `prices` file with no
`cost_minor` column at all, not a blank one.

The export inherits the screen's `filters`, `sort` and `scope`, and the dialog
says so — "Export 1,240 products matching the current filter" — with a toggle for
"Export all N instead". A saved view therefore doubles as an export definition
with no second concept.

**Money in an export is a minor-unit integer plus a sibling `currency_code`
column, never a formatted string.** `₹1,25,000.00` re-imported is a different
number, and an export that cannot round-trip into its own importer is not an
export.

**How a large export avoids a function timeout.** `exportRun()` never runs in a
request: it enqueues `jobs(kind = 'export', created_by_user_id = actor.userId)`,
rate-limited `export:user:<userId>` at 5/hour (`11 §4.2`). The worker:

1. Checks the resolved row count against `settings['export.max_rows']`
   (default **200,000**). Above it, the job fails immediately with a message
   naming the count and suggesting a date-range or market filter. This cap is
   what makes the rest of the design safe, and it is honest: a resumable upload
   is not something the media provider offers, so the file must fit in one
   worker budget.
2. Pages the resource's **keyset** query at 1,000 rows per batch — the same
   `SORT_WHITELIST` machinery, not a `findMany()` over the set, so memory is
   O(batch) and not O(result).
3. Writes each batch into a `PassThrough` piped into a Cloudinary
   `upload_stream({ resource_type: 'raw', type: 'authenticated' })`. The set is
   never materialised.
4. Bumps `progress_current` per batch; 200,000 rows is 200 progress writes.
5. On completion writes `jobs.result = { media_id, rows, bytes }` and enqueues a
   `send_email` job with the ready notice. `send_email` is `systemPermitted: true`
   (`11 §3.2`) but this one carries the originating user anyway, because it has one.

Download is `GET /api/admin/export/[jobId]`, which **proxies** the bytes under
`WHERE j.id = $1 AND j.created_by_user_id = $2` — zero rows is `NotFoundError`.
The Cloudinary delivery URL is never handed to the browser, because a signed CDN
URL outlives the session that minted it. There is no "download a colleague's
export" capability and none is invented: a staff member who needs one re-runs it,
which also puts their own name on the `audit_logs` row for the PII they pulled.

Every PII export writes an audit row with the resource, the row count and the
filter in `after` (`07 §7.2`).

`tests/integration/export-stream.test.ts`: 60,000 order rows; assert peak heap
stays under a fixed ceiling, that `findMany` is never called with the full set
(query-log assertion), that `progress_current` advances monotonically, and that
`/api/admin/export/[jobId]` returns `404` for a second user.

---

## 6. Global admin search (⌘K)

### 6.1 Surface and route

`CommandPalette` opens on ⌘K / Ctrl+K from anywhere inside `(admin)`, and from
the topbar search icon (which is how it is reached on a phone, §8.7). The page
`/admin/search` (`08 §5`, `dashboard.view`) is the same component rendered
full-page, for deep-linking a query.

> **RESOLVED — was CHANGE REQUIRED IN 08 §2.2 and 01 §3:** add the data route.
> *Verified applied in 08.*
>
> | Method | Path | Auth | Notes |
> | --- | --- | --- | --- |
> | `GET` | `/api/admin/search?q=&limit=` | `staff:dashboard.view` | `no-store`. Returns grouped results; **each group is queried only when the actor holds that group's permission** (§6.4). `limit` ≤ 20 |
>
> and the tree entry `src/app/api/admin/search/route.ts`. `08 §2.2`'s
> `tests/unit/routes-authorized.test.ts` fails on "a route in the tree with no
> manifest row" and `01 §3` is what an engineer scaffolds from, so it must land in
> both. It is **not** `/api/admin/search/preview`, which is `08 §2.2`'s existing
> storefront-ranking tuning route gated on `search.manage`.

> **RESOLVED — was CHANGE REQUIRED IN 11 §4.2:** add one row —
> *Verified applied in 11.*
> `admin-search:user:<userId>` · `GET /api/admin/search` · **120** / 1 min ·
> **closed**. Fail-closed because the palette is an enumeration surface over
> order numbers, SKUs and email addresses. It needs **no** `…:ip:` sibling under
> `11 §4.3` rule 1: the key material is the staff session's `user_id`, which is
> server-derived and not a value the browser supplies, unlike `<sid>`,
> `<cartId>` and `<hash>`.

### 6.2 What it searches — seven groups, seven indexes

No new search index is built and no external search service is introduced. Every
query below is an existing Postgres index plus two new trigram indexes.

| Group | Matches | Index | Group permission |
| --- | --- | --- | --- |
| **Orders** | `order_number` exact or substring; `email` exact | `idx_orders_number_trgm` (GIN, `pg_trgm`), `idx_orders_email` | `order.read`; the **email path additionally** requires `customer.read` |
| **Products** | `title`, `slug`, and `sku` through `product_variants` | `idx_products_title_trgm`, `idx_products_search_vector`, `idx_variants_sku_prefix` | `product.read` |
| **Customers** | `email` exact or prefix; first/last name | `idx_customers_email`, `idx_customers_search` (GIN `tsvector`) | `customer.read` |
| **Collections** | `title`, `slug` | `idx_collections_slug_live` + a new trigram index | `product.read` |
| **Stones** | `name`, `slug` | `idx_stones_slug_live` + a new trigram index | `product.read` |
| **Pages** | `cms_pages.title`, `path` | `idx_cms_pages_path_live` + a new trigram index | `cms.read` |
| **Journal** | `journal_posts.title`, `slug` | `idx_journal_slug_live` + a new trigram index | `cms.read` |

> **RESOLVED — was CHANGE REQUIRED IN 11 §8.11 / 02 §4:** — four trigram indexes, each
> *Verified applied by inspection of the target document.*
> `CREATE INDEX CONCURRENTLY` in its own migration:
> ```sql
> CREATE INDEX idx_collections_title_trgm  ON collections   USING GIN (title gin_trgm_ops) WHERE deleted_at IS NULL;
> CREATE INDEX idx_stones_name_trgm        ON stones        USING GIN (name  gin_trgm_ops) WHERE deleted_at IS NULL;
> CREATE INDEX idx_cms_pages_title_trgm    ON cms_pages     USING GIN (title gin_trgm_ops) WHERE deleted_at IS NULL;
> CREATE INDEX idx_journal_title_trgm      ON journal_posts USING GIN (title gin_trgm_ops) WHERE deleted_at IS NULL;
> ```
> Four groups of the palette currently have an exact-slug index and no
> substring one, which means typing "moon" finds the Moonstone product and not the
> Moonstone stone page — the discovery failure the palette exists to remove.

**Why not a dedicated search service.** A second index (Meilisearch, Typesense,
Algolia) for a 2,000-product catalogue and an admin with a handful of concurrent
users buys latency nobody will notice and costs an operational dependency, a sync
job, and — decisively — **permission replication**. Every document in an external
index would have to carry the projection rules of §6.4, re-derived on every role
change, and a stale permission in a search index is exactly the leak this section
exists to prevent. Postgres already holds the permissions and the rows in one
place.

### 6.3 Classification, ranking and grouping

**The query is classified before any index is touched**, which is both the
performance answer and half the privacy answer:

| `q` matches | Groups queried |
| --- | --- |
| `/^MD-?\d{3,}$/i`, or ≥ 6 characters and ≥ 80% digits | Orders only |
| contains `@` | Customers, and Orders-by-email — **both of which require `customer.read`** |
| `SKU_PATTERN` (`03 §2.6`) | Products (through variants) only |
| starts with `/` | Pages only (it is a path) |
| anything else | all seven, in parallel |

**Ranking is three tiers, and exactness beats everything.**

1. **Jump-to.** An exact identifier match — order number, SKU, slug, email — of
   which there is at most one. It renders above the groups as a single full-width
   row and `⏎` is bound to it. This is the interaction the palette exists for:
   paste an order number, press Enter, be on the order.
2. **Prefix matches**, ordered by the group's own recency column
   (`orders.placed_at DESC`, `products.updated_at DESC`).
3. **Fuzzy matches** — `similarity()` for trigram groups, `ts_rank` for
   `tsvector` groups — above a floor of `0.2` similarity, so "xyz" returns
   nothing rather than the least-bad row.

**Group order is fixed** — Orders, Products, Customers, Collections, Stones,
Pages, Journal — and never re-ordered by score. A palette whose sections move as
the operator types cannot be used by muscle memory, which is the only reason to
have a palette. Max **5 rows per group**, 20 overall, and each group with more
ends in "See all 34 in Products", which opens that resource's list screen with
`q=` pre-filled and the rest of the filter bar untouched.

The empty state (before typing) shows the last 8 admin entities this browser
visited, kept in `localStorage` and **re-validated against the group permission at
render**, so a role change empties the list rather than leaving a jump-to the
actor can no longer follow.

### 6.4 Permission filtering — at the query, never at the render

This is the gap the critic named: `08 §5` gives the palette `dashboard.view`,
which every one of the seven roles holds, and `07 §2.4` note 2 makes a customer
email a permission-gated projection. An unfiltered jump-to is a PII leak with a
keyboard shortcut.

Three mechanisms, in order of when they fire:

1. **A group whose permission the actor lacks is not queried.** Not queried,
   filtered after — the SQL is never issued, so those rows never enter the process
   and cannot reach the wire through a serialisation bug, a log line or a Sentry
   breadcrumb. `07 §3.6`: a component that receives a value it should not see has
   already leaked it.
2. **The classifier is itself a gate.** A `q` containing `@` routes only to
   Customers and Orders-by-email, both of which need `customer.read`. For an
   `analyst` — who holds `order.read` and not `customer.read` — typing
   `jane@example.com` into ⌘K therefore queries **nothing** and returns "No
   results", not a redacted order row and not a "you don't have access to this
   result" row. Either of those confirms the address exists, which is the fact
   being protected.
3. **The row projection is `getOrderDetail()`'s, from the same function.** When an
   actor without `customer.read` finds an order by its number, the palette row
   shows order number, status, market, total, and the **recipient's first name
   plus destination city** — exactly what the detail page will show them
   (`07 §2.4` note 2). One projection rule, one implementation, and no chance of
   the palette being more generous than the page it links to.

```ts
// src/lib/admin/search.ts
export async function adminSearch(actor: StaffActor, q: string, limit = 20)
  : Promise<readonly AdminSearchGroup[]> {
  const groups = classify(q).filter((g) => GROUP_PERMISSIONS[g].every((p) => can(actor, p)));
  const results = await Promise.all(groups.map((g) => GROUP_QUERY[g](actor, q, 5)));
  return results.filter((r) => r.rows.length > 0);
}
```

`tests/integration/admin-search-permission-filter.test.ts`, run for each of the
seven roles: assert the set of groups whose SQL was issued (captured by the query
logger) equals the set the role's permissions permit; assert that as `analyst` an
email query issues zero statements and returns zero groups; assert that an order
found by number as `analyst` carries no `email`, `phone` or address line **in the
serialised response body**, not merely in the rendered output.

---

## 7. Danger zones

### 7.1 The typed-confirmation rule

`DangerDialog` (`10 §3.3`) is the only component that renders a destructive
confirmation, and it takes its token from the server:

```ts
// src/components/admin/DangerDialog.tsx
type DangerDialogProps = {
  title: string;
  consequences: readonly string[];   // from getDangerPreflight() — real counts, not warnings
  confirmToken: string;              // exact, case-sensitive, compared after trim() only
  confirmLabel: string;              // the verb, e.g. "Cancel this order"
  requiresTotp: boolean;             // TOTP_REQUIRED_PERMISSIONS / STEPUP_PERMISSIONS (11 §1.1)
  onConfirm: () => Promise<void>;
};

// src/lib/admin/danger.ts
export async function getDangerPreflight(
  actor: StaffActor, operation: DangerOperation, entityId: string,
): Promise<{ token: string; consequences: readonly string[]; blocked: string | null }>;
```

**The typed string is the resource's own identifier, never the word "DELETE".**
An operator who types `DELETE` five times a week types it without reading it;
typing `MD-10241` or `moonstone-drop-pendant` requires looking at the row they are
about to destroy. The two exceptions are operations with no single identifier —
the demo purge and the redirect bulk-delete — which take a literal phrase naming
the action and its count.

Comparison is `typed.trim() === token`: no case folding, no whitespace collapsing,
no paste normalisation beyond the trim. The token renders in a copyable `code`
element and the input carries `autocomplete="off" spellcheck="false"
autocapitalize="off"`.

**`consequences` come from the server and carry real counts** — "Releases 1
reservation held until 15:04", "Removes this piece from 2 collections",
"12 published pages reference this image" — because a dialog with a generic
warning is a dialog people click through. `blocked` non-null renders the dialog as
a refusal with the reason and no confirm control at all.

Every danger operation writes an `audit_logs` row whose `summary` includes the
typed token, so the log records that the operator saw the identifier.

### 7.2 The complete inventory

**Soft** = reversible from the admin. **Irreversible** = no admin path back.

| Operation | Route | Permission | Typed token | Class |
| --- | --- | --- | --- | --- |
| Soft-delete a product | `/admin/catalog/products/[id]` | `product.delete` | — *(10 s undo toast)* | soft |
| Soft-delete a variant | `…/[id]/variants/[variantId]` | `variant.update` | the SKU | soft; **blocked** when it is the product's only live variant |
| Delete a category | `/admin/catalog/categories` | `category.update` | the category slug | soft; **blocked** while `product_categories` rows or child categories exist |
| Delete a collection | `/admin/catalog/collections/[id]` | `collection.update` | the collection slug | soft |
| Delete a stone / material / attribute | `/admin/catalog/{stones,materials,attributes}` | resp. `stone.update`, `material.update`, `attribute.update` | the slug / key | soft; **blocked** while linked rows exist |
| Soft-delete media | `/admin/content/media` | `media.delete` | the `public_id` **when the usage report finds references**; none when unused | soft |
| **Hard-delete media** | `/admin/content/media/[id]/purge` | `media.hard_delete` (**owner only**) + TOTP + step-up | the `public_id` | **irreversible** — destroys the provider asset. Requires an existing soft delete ≥ 30 days old (`06 §7.8`) |
| Soft-delete a CMS page | `/admin/content/pages/[id]` | `cms.delete` | the page `path` | soft; **blocked** while published — unpublish first |
| Restore a version | `…/versions/[versionId]/restore` | `cms.restore` | — | reversible — writes to the **draft**; going live still needs `cms.publish` |
| Bulk-delete redirects | `/admin/content/redirects` | `redirect.manage` | `delete 240 redirects` | **irreversible** — `redirects` is hard-deleted (`02 §2.8`) |
| Revoke a preview token | `…/share-preview` | `content.preview` | — | irreversible for that token; mint another |
| Cancel an order | `/admin/orders/[id]/cancel` | `order.cancel` | the order number | **irreversible** — `cancelled` is terminal (`11 §7.3`) |
| Refund a payment | `/admin/orders/[id]/refund` | `order.refund` + TOTP; step-up above `settings['security.stepup_refund_threshold']` | the refund **amount in minor units** | **irreversible** — money has left |
| Replay a webhook | `/admin/system/webhooks/[id]/replay` | `integration.manage` **and** `order.refund` | the provider event id | treated as irreversible; the handler re-asserts all six `01 §2.5` conditions and changes nothing if the effect already landed |
| Release a `pending_review` hold | `/admin/orders/[id]/release` | **`order.update`**, deliberately not `order.fulfil` (`11 §7.3`) | the order number | soft — it can be cancelled afterwards |
| Anonymise a customer | `/admin/customers/[id]/anonymize` | `customer.anonymize` (**owner only**) + TOTP + step-up | the customer's email address | **irreversible** — `07 §8.3` |
| Start impersonation | `/admin/customers/[id]/impersonate` | `user.impersonate` | the customer's email address | reversible (stop), but audited under both actors |
| Deactivate a market | `/admin/settings/markets/[code]` | `market.manage` (**owner only**) | the market code | reversible; the preflight names the open-order count and the storefront routes that will 404, and it enqueues a catalogue rescore (`03 §1.6`) |
| Delete a role | `/admin/settings/roles/[id]` | `role.manage` (**owner only**) | the role name | reversible only by recreation; **blocked** while `user_roles` rows exist |
| Deactivate a staff user | `/admin/settings/users/[id]` | `user.manage` | the user's email | soft; **blocked** by `LastOwnerError` when it would remove the last `owner` (`07 §2.6`) |
| Revoke all of a user's sessions | `/admin/settings/users/[id]` | `user.manage` | — | reversible — they sign in again |
| Apply a recalculation run | `/admin/pricing/recalc-runs/[id]/approve` | `price.approve_recalc` + TOTP | the **line count**, e.g. `8412` | per-row reversible via `price_history`, but the highest-blast-radius control in the product. The preflight shows lines, markets, min/max delta and the count of lines that would fall below cost |
| Bulk edit > 50 rows | any grid | the field's own permission (§4.5) | the **row count** | not undoable; §4.8 is the reversal |
| Delete all demo content | the demo banner (`02 §6.1`) | `settings.manage`, and refused when `APP_ENV = production` | `delete demo content` | **irreversible**, bounded to `is_demo` rows |

Typing the line count for a recalculation apply is the one place the rule bends
toward a number rather than a name, and it bends on purpose: the number is the
blast radius, and it is the figure the operator must have read.

### 7.3 What is deliberately not offered at all

| Not offered | Why, and what exists instead |
| --- | --- |
| Hard-delete a product, variant, order, customer or CMS page | `02 §1.4` files each under soft-delete or never-delete. `orders.customer_id` is `ON DELETE RESTRICT` precisely so a customer cannot take orders with them. The erasure path is `anonymizeCustomer()`, which keeps the invoice and destroys the profile (`07 §8.3`) |
| Bulk delete from any grid | §4.1. The reversible equivalent — `status = 'archived'` for products, `is_active = false` for variants — is on the bulk bar, and it is what a bulk delete is almost always intended to mean |
| Truncate or edit `audit_logs` | Append-only, never updated, never deleted while `settings['audit.retention_days']` is `NULL` — which is the seeded value (`02`). The only deletion is the retention sweep, and the weekly `audit_archive` job writes the off-site copy first (`11 §3.2`) |
| Change another user's password | `07 §2.6`. `user.manage` resets TOTP, unlocks an account and revokes sessions; it never sets a credential, because a permission that sets a colleague's password is a permission that becomes that colleague |
| Delete a market | Only deactivation. A `markets` row is the target of `orders.market_code`, `prices.market_code` and eleven other FKs, half of them `RESTRICT`; deleting one is not expressible without destroying order history |
| Delete a `job` row, or purge the queue | `/admin/system/jobs` offers retry and cancel. A queue whose history can be erased cannot answer "did that import run" |
| "Reset the database", "rebuild everything" | `reindex_search`, `collection_refresh` and `sitemap_rebuild` are idempotent, non-destructive rebuilds and are on `/admin/system/jobs` as such. There is no destructive variant |
| Delete a saved view marked `is_system` | §2.2. The nine seeded views are edited, not deleted |
| Un-publish by deleting | Every publishable entity has an explicit unpublish, which is reversible and audited. Deletion is never the mechanism for taking something off the site |

`tests/unit/danger-zones.test.ts` asserts that every route in §7.2 renders a
`DangerDialog` with a non-empty `confirmToken`, that every operation listed under
§7.3 has **no** exported action anywhere in `src/server/actions/admin/**`, and
that every `requiresTotp: true` row's permission is a member of
`TOTP_REQUIRED_PERMISSIONS` or `STEPUP_PERMISSIONS` (`11 §1.1`).

---

## 8. Admin responsiveness

### 8.1 The rule

Desktop is primary; the design target is ≥ 1280 px. Five surfaces are
first-class down to 390 px because they are done away from a desk: **orders,
products, inventory, price editing and customer lookup.** Everything else is
readable and navigable at any width and is not required to be operable.

`tests/e2e/no-horizontal-overflow.spec.ts` (`10 §8.1`) already gates the build on
zero horizontal overflow at all ten widths, and admin routes are route classes it
loads. Touch targets are ≥ 44×44 px below `--md-bp-lg` (`10 §8.2`).

### 8.2 The grid-to-card switch

**Below `--md-bp-lg` (1024 px) every `DataTable` renders as a card list, not a
horizontally scrolling table.** A 14-column grid in a 390 px viewport is
unreadable whichever way it is delivered, and a scrolling table fails the overflow
gate.

The card is generated from the same registry, using `AdminColumnSpec.mobileSlot`:

- `mobileSlot: 'title'` — the card heading. Exactly one per resource; it is the
  `pinned` column, or the first `defaultVisible` text column when the pinned one
  is a thumbnail.
- `mobileSlot: 'subtitle'` — one line beneath, up to two columns joined by `·`.
- `mobileSlot: 'stat'` — up to three, rendered as a right-aligned stat row.
- Everything else is absent from the card and reachable on the detail route.

One registry, two renderers. `tests/unit/admin-columns.test.ts` enforces the
counts, so a new column cannot silently make the mobile card four stats wide.

The scope bar — market / currency / location — is **sticky at the top of every
list at every width**, because the cursor's `m` component is that scope (§1.5) and
an operator who cannot see it cannot explain why the numbers changed.

### 8.3 Inline and bulk editing on a narrow viewport

- **Inline editing is off below 1024 px for every cell except `products.status`**,
  which becomes a tap-through segmented control. That one exception is the thing a
  merchandiser genuinely does from a phone — unpublish a piece that just sold —
  and it is the only editable cell with a three-value domain that fits a thumb.
- Every other edit opens a `DrawerForm` covering the viewport, with the row's
  editable fields as a normal form, one save, one `expectedVersion`, and the same
  action. An 8-px-wide text input inside a card is a data-entry error generator.
- **Bulk selection is not rendered below `--md-bp-md` (768 px).** The checkbox is
  removed, not shrunk. A multi-select gesture on a touch list is ambiguous with
  scrolling, and a bulk edit is the operation with the largest blast radius in the
  admin.

### 8.4 Orders on mobile

Cards: order number as the title; `placed_at` relative and market as the subtitle;
status chip and total as the stats. Filters collapse into a bottom sheet; the
saved-view tab strip becomes a `<select>`.

The detail route stacks: status and actions first, then `OrderTimeline`
(`order_events`) as the primary column, then line items collapsed to "4 items"
with a disclosure, then addresses and payment. Fulfil / cancel / refund live in a
sticky bottom bar and **keep their typed confirmation and their TOTP challenge at
every width** — the confirm token does not get shorter because the screen did.
"Print packing slips" is a download and works unchanged.

### 8.5 Products and inventory on mobile

**Products.** Card: thumbnail, title, status chip, completeness ring, and the
scope market's price. Search and the saved-view selector are the only controls
above the fold; everything else is behind the filter sheet.

**Inventory is the one surface where mobile is the primary target**, because
receiving a delivery happens in a stockroom. Card: SKU as the title, product title
as the subtitle, and `available` / `on hand` / `reserved` as the three stats. The
adjustment drawer is full-screen with `inputmode="numeric"` on the quantity, a
reason `select`, a note field and a large commit button — and it calls the same
`adjustInventory()` action, so the `inventory_transactions` row it writes is
byte-identical to the one the desktop writes. `bin_location` and `reorder_point`
are in the same drawer.

### 8.6 Price editing on mobile

`MarketPriceGrid` is a variant × market matrix and does not survive a narrow
viewport. Below 1024 px it becomes **one market at a time**, chosen in the scope
bar, one variant per card, with `list`, `sale` and `compare at` as three stacked
money inputs.

The market selector is locked into each card's header and is the single most
important mobile affordance in the admin: it reads `USD · United States` in full,
never a bare symbol, because hard rule 2 means the operator must never be
momentarily unsure which currency they are typing into. The keypad is
`inputmode="decimal"` with the minor-unit conversion shown live beneath the input
("₹42,500.00 → `4250000`").

**Cost and margin are omitted below 1024 px even for an actor holding
`price.read_cost`.** A phone screen is a shoulder-surfing surface, and neither
column is load-bearing for the task the mobile price editor exists to support.

### 8.7 Customer lookup on mobile

There is no ⌘ key on a phone, so the palette is reached from a persistent search
icon in the topbar and opens full-screen with the keyboard raised. The groups,
the classifier and the permission gating of §6 are identical.

The customer detail route stacks: identity, then lifetime value **one row per
currency** — never a sum, at any width — then orders, then addresses.

### 8.8 What says no rather than half-working

Below `--md-bp-md` (768 px) these render a single card — the screen's name,
"This screen needs a larger window", and a link to the read-only summary where one
exists — and nothing else:

| Screen | Read-only fallback offered |
| --- | --- |
| `/admin/content/builder/[pageId]` | the page's public preview |
| `/admin/settings/roles/[id]` (`PermissionMatrix`) | the role's permission list, read-only |
| `/admin/pricing/recalc-runs/[id]` | the run's summary counts, no approve control |
| `/admin/tools/import` (mapping and preview) | the import job's status and counts |
| `/admin/catalog/products/[id]/variants` (`VariantMatrix`) | the variant list as cards, read-only |
| `/admin/settings/markets/[code]` | the market's settings, read-only |

A page builder that technically loads on a phone and loses an editor's afternoon
to a mis-tap is worse than one that declines. Each of these is an authoring
surface with a large uncommitted state and a destructive adjacency, and none is
something anyone needs to do standing up.

`tests/e2e/admin-mobile.spec.ts`: at 390 px, assert (a) every list route renders
cards and no element exceeds the viewport width; (b) no selection checkbox is
present; (c) the inventory adjustment drawer commits and writes an
`inventory_transactions` row identical in shape to the desktop path; (d) the six
routes above render the refusal card; (e) the refund dialog still requires its
typed token.

---

## 9. What this document changes elsewhere

### 9.1 Consolidated change list

| # | Document | Change | §here |
| --- | --- | --- | --- |
| 1 | `11 §1.2` rule 3 | Extend the saved-view rule from rows to columns — a column carries its own `requires` and a view's `column_config` cannot grant it | §1.2, §2.4 |
| 2 | `02 §2.9` | New table `admin_column_prefs`, filed under §1.4 **Hard delete** | §1.4 |
| 3 | `02 §2.9` `saved_views` | Add `scope JSONB NOT NULL DEFAULT '{}'`, `is_system BOOLEAN NOT NULL DEFAULT false`, `CHECK chk_saved_views_ownership` | §2.1 |
| 4 | `02 §2.8` + §7 appendix, `media` | Add `row_version INTEGER NOT NULL DEFAULT 0`; `version TEXT` is the provider's asset version, not a concurrency counter | §3.2 |
| 5 | `11 §8.3`, `11 §8.11`, `02 §4` | Add filter fields `completeness_check_failed` and `seo_check_failed` + `idx_products_completeness_checks`, `idx_products_seo_checks` (GIN) | §2.5 |
| 6 | `11 §8.11`, `02 §4` | Add `idx_collections_title_trgm`, `idx_stones_name_trgm`, `idx_cms_pages_title_trgm`, `idx_journal_title_trgm` | §6.2 |
| 7 | `08 §2.3` | The cursor's `m` component is a **scope token** (`market:US`, `currency:USD`, `location:<uuid>`, `-`), not a market code | §1.5 |
| 8 | `08 §2.2` + `01 §3` | Add `GET /api/admin/search` to the manifest and the route tree | §6.1 |
| 9 | `11 §4.2` | Add `admin-search:user:<userId>` · 120 / 1 min · **closed**; no `…:ip:` sibling required (server-derived key material) | §6.1 |
| 10 | `02 §2.9` `jobs` | Document `result.detail_media_id UUID` and prune its `media` row with the job's 30-day sweep | §4.7 |
| 11 | `08 §5` | `/admin/search`'s `dashboard.view` gates the **screen**; each result group is gated separately (§6.4). Add `/admin/system/jobs/[id]` (`job.read`) and `/admin/tools/import/[importJobId]` (`import.run`), both referenced by other documents and absent from the map | §5, §6 |
| 12 | `10 §3.3` | **Applied.** `SaveState` was listed as three states and is six (`06 §6.2`, §3.3 here); `ScopeBar`, `ColumnPicker`, `ImportPreviewGrid` and `ConflictBar` are now in the admin component list, each with a one-line specification that names this document's section | §1.4, §1.7, §3.3, §3.5, §5.2 |
| 13 | `09 §1.2` P29 | Add exit criteria (d′) a shared saved view opened by a lower-privileged actor omits permission-gated columns **from the response body**; (e′) an inline `STALE_WRITE` on one row leaves the other rows of the page committed; (f′) the ⌘K palette issues zero statements for a group the actor cannot read. Add the seven test files of §9.2 | all |

### 9.2 Test files this document commissions

Every one must exist on disk before `09 §5.1`'s `tests/setup/pending.json` can be
empty. `09 §0`'s glob is now `docs/architecture/*.md`, so this file is visible to
`tests/setup/collect-audit.ts`.

| File | Asserts | Phase |
| --- | --- | --- |
| `tests/unit/admin-columns.test.ts` | The registry's invariants: one pinned column; every `sortField`/`filterField` is in `11 §8`; every `inlineEdit.permission` is in `PERMISSION_KEYS`; ≤ 3 `mobileSlot: 'stat'` | P29 |
| `tests/unit/saved-view-scope.test.ts` | Every `scope` key present is required by some field of the view's `filters`/`sort`; every `requires` is satisfiable | P29 |
| `tests/integration/saved-view-permissions.test.ts` | §2.4 — gated columns absent from the response **and** from the generated SQL; a view sorting on an unreadable field returns the needs-updating state | P29 |
| `tests/integration/inline-edit-conflict.test.ts` | §3.5 — rows 1–13 committed, row 14 conflicted, rows 15–50 unaffected, exactly 14 audit rows | P29 |
| `tests/integration/bulk-edit-permission-recheck.test.ts` | §4.6 — a revoked permission fails the job with zero rows changed; a plan requiring `price.read_cost` fails without it | P29 |
| `tests/integration/admin-search-permission-filter.test.ts` | §6.4 — per role, the issued-statement set equals the permitted-group set; an email query as `analyst` issues zero statements | P29 |
| `tests/integration/export-stream.test.ts` | §5.5 — bounded heap over 60,000 rows, no full-set `findMany`, monotonic progress, `404` for another user | P29 |
| `tests/unit/danger-zones.test.ts` | §7.2/§7.3 — every danger route has a non-empty `confirmToken`; every §7.3 operation has no exported admin action; every TOTP row's permission is in `TOTP_REQUIRED_PERMISSIONS`/`STEPUP_PERMISSIONS` | P29 |
| `tests/e2e/admin-inline-edit.spec.ts` | §3.3/§3.4 — debounce, coalescing of two cells on one row into one request, `Enter`-moves-down, `Escape` reverts, no re-sort while saving | P15 |
| `tests/e2e/admin-mobile.spec.ts` | §8 — cards at 390 px, no overflow, no selection checkbox, identical inventory transaction, the six refusal screens, the refund token | P15 |

### 9.3 Open decisions

> **NEEDS INPUT:** the `settings['admin.select_all_max']` ceiling (seeded 10,000)
> and `settings['export.max_rows']` (seeded 200,000). Both are operational limits
> rather than architectural ones, both are a `settings` row and not a deploy, and
> both are seeded to a value that is safe for a 2,000-piece catalogue. They are
> named here because an operator who hits one should be told a number the client
> chose, not one this document invented.

> **NEEDS INPUT:** whether `analyst` should hold `customer.read`. `11 §1.4` says
> no, which is what makes §6.4's email-query behaviour correct and what makes an
> `analyst`'s order list show a destination city and no address. If the client
> wants the analyst to see customer records, that is one row of
> `role_permissions` and no code changes — but it removes the distinction
> `07 §2.4` note 2 exists to draw, and it should be an explicit decision rather
> than a support-ticket-driven one.
