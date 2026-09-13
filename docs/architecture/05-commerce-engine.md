# 05 — Commerce Engine: Inventory, Cart, Checkout, Orders, Payments, Shipping, Discounts, Returns

Scope: everything between "a shopper wants this piece" and "the money and the piece
have both moved, correctly, exactly once." Table and column names come from 02 and
are used verbatim. Where this section needs a table 02 does not define, it says so
in a `> **SCHEMA ADDITION:**` callout with the full DDL rather than renaming
something that already exists.

Owning modules (01 §2.3, unchanged): `src/lib/inventory/`, `src/lib/cart/`,
`src/lib/checkout/`, `src/lib/orders/`, `src/lib/payments/`, `src/lib/shipping/`,
`src/lib/discounts/`, `src/lib/giftcards/`, `src/lib/returns/`, `src/lib/tax/`.

---

## 1. Inventory architecture

### 1.1 The quantity model

Seven quantities are named in the requirement. Three are columns on
`inventory_items`, one is a generated column, one is a derived read model, and two
are *locations*, not counters. Making that split explicit is the whole design: a
counter that nothing decrements is a lie, and every counter added is one more thing
that can drift from the ledger.

| Quantity | Where it lives | Definition |
| --- | --- | --- |
| **On hand** | `inventory_items.on_hand_quantity INTEGER NOT NULL DEFAULT 0` | Units physically present at this location, whether or not they are spoken for. Changes **only** via an `inventory_transactions` row, in the same transaction. |
| **Reserved** | `inventory_items.reserved_quantity INTEGER NOT NULL DEFAULT 0` | Units soft-held by a row in `reservations` with `status = 'active'`. Never changes `on_hand_quantity`. Invariant: `reserved_quantity = SUM(reservation_lines.quantity)` over active reservations (02 §5.2). |
| **Available** | `inventory_items.available_quantity INTEGER NOT NULL GENERATED ALWAYS AS (on_hand_quantity - reserved_quantity) STORED` | The raw arithmetic surplus. **Not** the sellable figure — see below. |
| **Incoming** | `inventory_items.incoming_quantity INTEGER NOT NULL DEFAULT 0` | On order from the workshop. Never sellable, never enters `available_quantity`, and pinned to `0` for a one-of-a-kind piece by `chk_inventory_ooak_qty`. |
| **Committed** | derived; no column | Units on a paid order that have not yet shipped. Not a counter, because `commitStock()` already decremented `on_hand_quantity` and `reserved_quantity` together at payment (02 §2.6). Exact definition in §1.2. |
| **Damaged** | a location, not a column | `inventory_locations` row with `is_fulfillable = false`; stock is moved there by a `transfer_out`/`transfer_in` pair, or written off with `write_off`. |
| **Returned** | the ledger | `inventory_transactions.type = 'return_restock'` increments `on_hand_quantity` at `returns.restock_location_id`; the per-line count is `order_items.returned_quantity`. |

**Sellable is not available, and this is the definition every caller uses.**

```
sellable(variant, market) =
  Σ over inventory_items ii
    joined to market_locations ml ON ml.location_id = ii.location_id AND ml.market_code = :market
    joined to inventory_locations il ON il.id = ii.location_id
  where il.is_fulfillable AND il.is_active AND il.deleted_at IS NULL
  of GREATEST(ii.on_hand_quantity - ii.reserved_quantity - ii.safety_stock_quantity, 0)
```

Four things that are easy to get wrong and are therefore in the definition rather
than in a caller:

1. **`safety_stock_quantity` is subtracted.** `available_quantity` deliberately
   does not include it, because the CHECK constraint that prevents overselling
   (`chk_inventory_no_oversell: reserved_quantity <= on_hand_quantity`) must stay an
   absolute physical statement. Safety stock is a *commercial* hold-back and belongs
   in the sellable calculation, not in the constraint.
2. **`GREATEST(..., 0)` per row, before summing.** Without it a location that is
   oversubscribed on safety stock subsidises another location's surplus and the
   total looks sellable when no single location can ship it.
3. **Non-fulfillable and inactive locations are excluded.** The showroom case and
   the quarantine case are the same case.
4. **The market join is mandatory.** A piece held only at `IN-MAIN` is `out` for a
   US shopper (01 §2.3). `getAvailability(variantIds, marketCode)` has that
   parameter for exactly this reason and there is no overload without it.

`getAvailability()` maps the number to an `AvailabilityBand`, and the band
thresholds live in `src/lib/config/constants.ts`, not inline.

**`AvailabilityBand` is five values, not four.** This table listed four and never
mentioned `sold`; 03 §8.1 declares the fifth as a contract extension, and the
whole SOLD experience (03 §2.5, 08 §4.4, 10 §4.2) depends on it. An
implementation following the old four-value table returns `'out'` for a sold
one-of-a-kind piece, which is a different and worse lie than the one it is trying
to avoid — "Notify me" on a piece that will never come back.

```ts
// src/types/inventory.ts — re-exported from src/lib/inventory/index.ts (11 §7.1)
export type AvailabilityBand = 'in_stock' | 'low' | 'out' | 'made_to_order' | 'sold';
```

Evaluated in this order; the first match wins:

| Band | Condition | What the surface does |
| --- | --- | --- |
| `made_to_order` | `product_variants.inventory_policy IN ('made_to_order','untracked')` — no `inventory_items` row exists at all (02 §2.6) | "Made to order · ships in N days"; JSON-LD `PreOrder` |
| `sold` | `products.is_one_of_a_kind AND products.sold_at IS NOT NULL` | SOLD plate; add-to-bag **removed**, not disabled; JSON-LD `SoldOut`; listing visibility per `catalog.ooak_sold_visibility` |
| `out` | `sold_at IS NULL` **and** `sellable = 0` | "Notify me" → `back_in_stock_requests` (08 §4.4); JSON-LD `OutOfStock` |
| `low` | `1 <= sellable <= AVAILABILITY_LOW_THRESHOLD` (`= 2`) | "Only N left", never on a one-of-a-kind piece |
| `in_stock` | `sellable > AVAILABILITY_LOW_THRESHOLD` | — |

**`sold` keys on `products.sold_at`, never on `available_quantity <= 0`**, and the
distinction is the reason the band exists. For an inventory of one,
`available_quantity` is also zero for the thirty minutes another shopper's
reservation holds the piece — so keying SOLD on the count paints a SOLD plate
over an unsold piece and then silently retracts it when the reservation expires
(03 §2.5). `sold_at` is written once, by `commitStock()`, in the same transaction
that decrements the last unit of a `is_one_of_a_kind` product, and it is never
cleared except by an admin correction that is audit-logged.

A one-of-a-kind piece is never rendered as `low` with a number — the PDP copy is
"One of a kind" and the add-to-bag button is the only availability signal. Showing
"only 1 left" on a piece that is *defined* as one is noise dressed as urgency.

> **Applied in 01 §2.3.** `getAvailability()`'s comment there listed four bands;
> it now lists five and points at `src/types/inventory.ts`, with `11 §7.1` as the
> canonical declaration. §1.1's band table above is the implementation and agrees.

### 1.2 Committed stock, defined exactly

There is no `committed_quantity` column, and adding one would be the eighth counter
to reconcile nightly. Committed is a read model, computed by
`getCommittedUnits(variantIds: string[]): Promise<Map<string, number>>` in
`src/lib/inventory/committed.ts`:

```sql
SELECT oi.variant_id, SUM(oi.quantity - oi.fulfilled_quantity)::int AS committed
FROM order_items oi
JOIN orders o ON o.id = oi.order_id
WHERE oi.variant_id = ANY($1::uuid[])
  AND o.payment_status IN ('paid','partially_refunded')
  AND o.status IN ('paid','processing')
  AND o.fulfillment_status IN ('unfulfilled','partially_fulfilled')
  AND oi.quantity > oi.fulfilled_quantity
GROUP BY oi.variant_id;
```

**It takes the page's variant ids and has no catalogue-wide form, deliberately.**
The version without `variantIds` scans every open order on every render of
`/admin/inventory/items`, which is itself a paginated screen — a full scan behind a
`LIMIT 50`, growing linearly with lifetime order volume and never appearing in a
slow-query threshold until it does. Driven by the id array it uses
`idx_order_items_variant (variant_id, created_at DESC) WHERE variant_id IS NOT NULL`
and then probes `orders` by primary key: bounded by the page size, not by history.

**It also has no `locationId` parameter, because committed units are not
decomposable by location.** `order_items` carries no `location_id` — the order line
records what was sold, not where it was picked from — so any signature that accepted
one would have to ignore it, and an ignored parameter on an inventory function
returns the same number for every location and reads as a per-location figure. If
per-location committed is ever genuinely needed, the decomposition exists in the
ledger and only there: `inventory_transactions` rows of `type = 'sale'` carry
`location_id` and `order_item_id`, so the join is
`inventory_transactions it JOIN order_items oi ON oi.id = it.order_item_id`,
grouped by `(it.variant_id, it.location_id)` and served by
`idx_inventory_tx_variant`. That is a different function with a different cost and
it is not written until something asks for it.

It is displayed on `/admin/inventory/items` beside on-hand and reserved, and it is
**never** subtracted from anything — the units it counts have already left
`on_hand_quantity`. It exists so an operator looking at "on hand: 0" can see
whether that zero means "sold, waiting to be packed" or "gone."

### 1.3 Multi-location from day one, with one active location

`inventory_items` is keyed `(variant_id, location_id)` and every read goes through
`market_locations`. At launch that resolves to one row per variant per market, and
the code paths that make more than one row work are exercised anyway by
`tests/integration/inventory-multi-location.test.ts`, which seeds two locations.
Retrofitting locations later means rewriting every availability query, every
reservation, the CSV importer and the returns restock path at once; carrying the
join now costs one index lookup.

Two launch policies, both picked rather than deferred:

- **Allocation order is `market_locations.priority` ASC**, ties broken by
  `inventory_locations.rank`, then `inventory_locations.id`. Deterministic ordering
  is what makes a reservation reproducible in a test.
- **No split fulfilment at launch.** A cart line of quantity 3 must be satisfiable
  from a single location; if no single location can cover it, `reserveStock()`
  returns `InsufficientStockError` even when the sum across locations would suffice.
  The alternative — splitting a line across locations — produces two shipments, two
  labels and two tracking numbers for an order that is typically one to three pieces,
  and it makes the "how much did shipping cost" question ambiguous at the exact
  moment the customer is being quoted. `reservation_lines` is keyed
  `(reservation_id, inventory_item_id)`, so the schema already represents a split;
  enabling it later is a change to one allocation function, not a migration.

> **NEEDS INPUT:** the real locations (02 §2.6 already flags this). Beyond the count
> and addresses: whether any location is display-only (`is_fulfillable = false`) and
> whether a US order may ever be fulfilled from an India location. The answer changes
> `market_locations` rows, not code.

Seed adds two structural quarantine rows alongside `US-MAIN` / `IN-MAIN`:
`US-QUARANTINE` and `IN-QUARANTINE`, `is_fulfillable = false`, `address_json` empty.
Damaged and unsellable returned stock lives there, visible in reports, excluded from
every sellable figure, and never written off silently.

### 1.4 The inventory transaction ledger

`inventory_transactions` (02 §2.6) is append-only and is the only thing permitted to
change `on_hand_quantity`. There is no code path in `src/lib/inventory/` that
updates the counter without inserting the row in the same statement pair, inside the
same transaction, and `tests/integration/inventory-ledger.test.ts` asserts
`SUM(quantity_delta) = on_hand_quantity` per `inventory_item_id` after a randomised
sequence of operations.

The requirement asks that every movement record reason, actor, timestamp, and
quantity before and after. Mapping to the canonical columns:

| Required | Column |
| --- | --- |
| Reason (machine) | `type inventory_transaction_type` — `initial`, `receipt`, `adjustment`, `sale`, `return_restock`, `transfer_in`, `transfer_out`, `write_off`, `recount` |
| Reason (human) | `note TEXT` — **mandatory in the service** for `adjustment`, `write_off` and `recount`; `writeInventoryTransaction()` throws `ValidationError` without it, because those three are the types that exist to explain a discrepancy |
| Actor | `actor_type actor_type` + `actor_user_id UUID` — `staff` carries a user id; `system`, `cron` and `webhook` do not |
| Timestamp | `created_at TIMESTAMPTZ` (append-only, no `updated_at`, 02 §1.3) |
| Quantity after | `balance_after INTEGER` |
| Quantity before | see the addition below |
| Provenance | `order_id`, `order_item_id`, `return_id`, `reservation_id` |

> **SCHEMA ADDITION:** `inventory_transactions` records `balance_after` but not the
> balance before the movement. Storing both independently invites them to disagree;
> a generated column cannot.
>
> ```sql
> ALTER TABLE inventory_transactions
>   ADD COLUMN balance_before INTEGER NOT NULL
>     GENERATED ALWAYS AS (balance_after - quantity_delta) STORED;
> ```
>
> **How it reaches the application, exactly — "Prisma maps this as a read-only
> field" is withdrawn, because Prisma has no such concept for a stored generated
> column.** This column joins the `01 §1.2` escape-hatch table alongside
> `search_vector`, and the mechanism is the same three parts:
>
> 1. The column is created by the **hand-written migration** above, never by
>    `prisma migrate dev` inferring it from the model.
> 2. The Prisma model declares it `Unsupported("integer")? @ignore`, so the
>    generated client neither selects it nor offers it in a `create`/`update`
>    input. Nothing in `src/lib/inventory/` can write it even by accident.
> 3. It is read through the **raw-SQL layer in `src/lib/db/raw/`**, at the one
>    place that needs it: the `/admin/inventory/transactions` list query and the
>    CSV export built from the same `Prisma.sql` fragment.
>
> **Application code never writes `balance_before` — the database computes it.**
> That is the whole point of choosing a generated column over two independently
> written counters, and it is why `writeInventoryTransaction()` takes
> `quantity_delta` and `balance_after` and nothing else. The ledger row is then
> self-describing — `balance_before`, `quantity_delta`, `balance_after` — and a CSV
> export of `/admin/inventory/transactions` is auditable without a window
> function.

**Reserved-quantity movements are not ledger rows, deliberately.** The ledger tracks
physical stock. A reservation is a promise, and its history lives in `reservations`
(`status`, `expires_at`, `committed_at`, `released_at`, `release_reason`) plus
`reservation_lines`. Writing reservation churn into `inventory_transactions` would
double the table's growth with rows whose `quantity_delta` never affects a balance,
and would break `SUM(quantity_delta) = on_hand_quantity`. Every reservation
transition additionally writes `recordAudit()` inside its transaction (01 §2.3
step 5), so "who released this and why" is answerable.

### 1.5 Concurrency: the exact mechanism

**Isolation level: `ReadCommitted`.** Fixed by 01 §1.2 and not revisited here. The
row lock serialises the contended pair; `Serializable` would additionally abort one
transaction in *every* concurrent checkout with SQLSTATE `40001`, including the
uncontended ones, and turn a "just sold" message into a 500.

**Three mechanisms, in depth order.** Each one is sufficient on its own for the
common case; all three exist because the failure is unrecoverable.

1. **`SELECT … FOR UPDATE` in ascending `inventory_items.id` order** — makes the
   contended pair take turns and makes two multi-line carts deadlock-free.
2. **A conditional `UPDATE` whose `WHERE` re-evaluates the predicate** — correct at
   `ReadCommitted` even with no lock held, because Postgres re-checks the `WHERE`
   against the freshly-committed row version when it unblocks.
3. **`chk_inventory_no_oversell`** — the floor under a service bug. An oversold row
   is not merely rejected by policy; it cannot be written.

The sequence, in `src/lib/inventory/reserve.ts`, inside
`withTransaction(fn, { isolationLevel: 'ReadCommitted', timeout: 8000 })`:

**Step 0 — drop the lines that never reserve.** `product_variants.inventory_policy
IN ('made_to_order','untracked')` variants have **no** `inventory_items` row at all
(02 §2.6, 02 §2.4). They are filtered out of `lines` before step 1 and produce no
`reservation_lines` row. This is not a refinement: without it, step 1 returns zero
rows for a made-to-order piece, step 2 allocates nothing, "zero rows means you lost
the race" fires, and **every made-to-order product in the catalogue is permanently
unbuyable** with `InsufficientStockError` at the last click of checkout.
`reserveStock()` therefore returns a `Reservation` whose `lines` cover only the
tracked variants, and a bag consisting entirely of made-to-order pieces yields a
reservation with zero lines rather than an error.
`tests/integration/made-to-order-checkout.test.ts` buys one made-to-order piece and
one tracked piece in the same bag.

```sql
-- Step 1a: resolve the candidate rows (no lock yet). Filtering lives here so that
-- the locking statement can be single-table.
SELECT ii.id, ml.priority
  FROM inventory_items ii
  JOIN market_locations   ml ON ml.location_id = ii.location_id
                            AND ml.market_code = $2
  JOIN inventory_locations il ON il.id = ii.location_id
 WHERE ii.variant_id = ANY($1::uuid[])
   AND il.is_fulfillable
   AND il.is_active
   AND il.deleted_at IS NULL;
```

```sql
-- Step 1b: lock them, single-table, in ascending id order.
SELECT id, variant_id, location_id,
       on_hand_quantity, reserved_quantity, safety_stock_quantity
  FROM inventory_items
 WHERE id = ANY($1::uuid[])
 ORDER BY id
   FOR UPDATE;
```

**Why the lock is a second, single-table statement.** `ORDER BY … FOR UPDATE`
guarantees lock order only because Postgres puts `LockRows` above the node that
produces the ordering. On a single-table scan that is an index scan on the primary
key and the property is stable. On the three-table join of step 1a the planner is
free to choose a join order and a `LockRows` placement that locks rows as the join
emits them — and a plan flip under a changed row estimate then silently removes the
deadlock-freedom the whole design rests on, with the only symptom a `40P01` at
checkout under load. Splitting the statement makes the guarantee a property of the
query shape rather than of a plan. The candidate ids are sorted in the application
before `$1` is bound, so the array itself is in id order too. The extra round trip is
one indexed lookup on a set already capped at `CART_MAX_LINES` rows.

```sql
-- Step 2: one conditional UPDATE per allocated line. Zero rows == lost the race.
UPDATE inventory_items
   SET reserved_quantity = reserved_quantity + $2,
       version           = version + 1
 WHERE id = $1
   AND on_hand_quantity - reserved_quantity - safety_stock_quantity >= $2
RETURNING id, on_hand_quantity, reserved_quantity, available_quantity;
```

```sql
-- Step 3: the reservation header and its lines, same transaction.
INSERT INTO reservations (id, ref_kind, cart_id, order_id, status, expires_at)
VALUES ($1, $2, $3, $4, 'active', now() + ($5 || ' minutes')::interval);

INSERT INTO reservation_lines (id, reservation_id, inventory_item_id, variant_id, quantity)
VALUES (…);
```

> **Step 4 — the reservation is promoted to the order before the transaction
> commits.** `reserveStock()` is called during checkout with
> `ref: { kind: 'cart', id: cartId }`, because the `orders` row does not exist yet
> and `reservations.order_id` is a FK to it. Left there, the reservation is
> unreachable from the order: `chk_reservations_ref` forbids a `cart`-kind row from
> carrying an `order_id`, so `idx_reservations_order` — which 02 §2.6 names as the
> index behind *"the 'is the reservation still live' assertion in the webhook path"*
> — indexes a column that is `NULL` for every checkout reservation ever taken. The
> webhook would then have no reservation id to pass to `commitStock(tx, reservationId)`
> and no way to evaluate assertion 6 at all. Immediately after the `orders` insert,
> in the same transaction (§3.6 phase B step 12b):
>
> ```sql
> UPDATE reservations
>    SET ref_kind = 'order', order_id = $2
>  WHERE id = $1 AND status = 'active'
> RETURNING id;
> ```
>
> `cart_id` is deliberately **left set**: `chk_reservations_ref` only requires
> `order_id IS NOT NULL` for an `order`-kind row, and keeping `cart_id` keeps
> `idx_reservations_active_cart` enforcing one live reservation per cart across the
> retry path. Zero rows returned aborts the transaction — an order whose reservation
> vanished between step 3 and step 12b must not commit.

**Two buyers, one One-of-a-Kind piece — why exactly one wins.** The piece has
exactly one `inventory_items` row (`idx_inventory_items_ooak_single_row`), capped at
one unit (`chk_inventory_ooak_qty`). Transaction A locks it and sets
`reserved_quantity = 1`. Transaction B blocks at `FOR UPDATE`. A commits; B's lock is
granted against the new row version; B's conditional `UPDATE` re-evaluates
`1 - 1 - 0 >= 1` → false → zero rows → `InsufficientStockError`, returned before any
payment intent exists and rendered as **"This piece has just been sold."** If a future
refactor drops the lock, step 2 still returns zero rows. If a refactor drops step 2's
predicate as well, `chk_inventory_no_oversell` aborts the transaction. There is no
arrangement of these three in which both buyers succeed.
`tests/integration/one-of-a-kind.test.ts` runs it on two real connections.

**Deadlock avoidance is the `ORDER BY`, and it is not optional.** Two carts each
containing pieces X and Y, locked in opposite orders, deadlock; Postgres kills one
with `40P01` and the customer sees a 500. Ascending `id` is a total order over the
rows, so the second transaction always waits rather than crossing. `40P01` is
retried once by `withTransaction()` and then surfaced as `ConcurrencyError`.

**Per-transaction lock budget.** A cart is capped at `CART_MAX_LINES = 50`
(`src/lib/config/constants.ts`) and `cart_items.quantity` at `CART_MAX_QUANTITY = 99`
per line, so the lock set is bounded and the 8-second statement timeout is
reachable. A cart that exceeds the cap is rejected at `addToCart`, not at checkout.

### 1.6 Reservation lifetime, expiry and release

| Event | Effect |
| --- | --- |
| `reserveStock(tx, lines, { kind: 'cart', id, expiresAt })` in **`placeOrder` phase B** (§3.6 step 9) | `reservations` row `status = 'active'`, `expires_at = now() + RESERVATION_TTL_MINUTES` (**30**), promoted to `ref_kind = 'order'` at step 12b |
| `createIntent()` succeeds | `expires_at` extended to `now() + PAYMENT_WINDOW_MINUTES` (**30**), per 01 §2.5. A 3-D Secure challenge or a UPI collect request gets a full window from the moment it starts, not the remains of the cart window |
| Cart line added, removed or re-quantified while a reservation is active | The reservation is released (`release_reason = 'cart_changed'`) and re-taken on the next `placeOrder`. A reservation describes a specific bag; a mutated bag has a different one. In the normal flow this row is unreachable — `placeOrder` marks the cart `converted` in the same transaction that reserves — and it fires only for an admin-placed hold or a draft cart still in `active` status |
| Market switched | Released with `release_reason = 'cart_changed'` as part of the market-switch transaction (02 §5.3) |
| `commitStock(tx, reservationId)` on payment | `status = 'committed'`, `committed_at = now()`; `on_hand_quantity` and `reserved_quantity` both decremented; one `inventory_transactions` row of `type = 'sale'` per line. **And, for a line whose product is `is_one_of_a_kind`, `UPDATE products SET sold_at = now() WHERE id = $1 AND sold_at IS NULL`** — this is the only writer of that column outside an audited admin correction, and it is what the `sold` band in §1.1 keys on. In the same transaction, so a paid one-of-a-kind piece is SOLD on the next render and not thirty minutes later when a reservation lapses |
| Payment fails (`payment_intent.payment_failed`, `payment.failed`) | `releaseStock()` with `release_reason = 'payment_failed'`; the order stays `pending_payment` and the customer may retry, which re-reserves |
| Checkout abandoned | Nothing happens synchronously. `/api/cron/release-reservations` every 5 minutes releases rows where `status = 'active' AND expires_at < now()`, `release_reason = 'expired'`, using `idx_reservations_expiry` |
| **Order never paid** (`pending_payment` past `ORDER_PAYMENT_EXPIRY_MINUTES` = **120**) | The same cron cancels the order and **reverses the tender-side effects** — coupon redemption and gift-card debits — which the reservation release alone does not touch. §8.8 |
| Order cancelled before fulfilment | `releaseStock()` if still active; if already committed, the cancellation writes an `inventory_transactions` row of `type = 'adjustment'` with a mandatory `note` (`return_restock` is reserved for rows carrying a `return_id`) — committed stock is returned through the ledger, never by un-committing |

`releaseStock()` is `UPDATE inventory_items SET reserved_quantity = reserved_quantity - $2 WHERE id = $1`
per line plus the header transition, all in one transaction (02 §5.3). It is
idempotent by guard: the header update is
`UPDATE reservations SET status = $2, released_at = now(), release_reason = $3 WHERE id = $1 AND status = 'active' RETURNING id`,
and zero rows means someone already released it — the counters are then left alone,
because decrementing twice is exactly how phantom-available stock is created.

> **FOUNDATION CHANGE REQUIRED IN 01 §2.3 — `releaseStock()` has two signatures
> and 01 still carries the unusable one.** 01 declares
> `releaseStock(tx: Tx, reservationId: string): Promise<void>`, with no place to put
> the reason — yet `reservations.release_reason` is a column 02 §2.6 defines with four
> named values, and every row of the table above depends on which one was written.
> The signature takes a third argument and the foundation's is the one that moves:
>
> ```ts
> export async function releaseStock(
>   tx: Tx, reservationId: string,
>   reason: 'expired' | 'cart_changed' | 'payment_failed' | 'admin',
> ): Promise<void>;
> ```
>
> Required, not optional with a default: a default would be written by whichever call
> site forgot, and "why was this released" is the first question asked when a piece
> comes back on sale unexpectedly.
>
> **Applied.** `01 §2.3`'s "Canonical signatures" block now declares the
> three-argument form, with the reason required and undefaulted, and states the
> arity as a requirement on the call sites rather than a report about them. `08
> §1.3` defers to `01` by reference, so the correction propagates there without
> `08` restating it, and the three call sites — 04 §6.3, 05 §1.6 and 05 §8.8 —
> compile against the declaration instead of against an earlier draft of it.

**Worst case, named:** the reservation is taken at `placeOrder`, not on entering the
payment step, so a browsing shopper holds nothing. Once `placeOrder` runs, a customer
holds a one-of-a-kind piece for `RESERVATION_TTL_MINUTES` and then, from the moment
`createIntent()` returns, for a further `PAYMENT_WINDOW_MINUTES` — **at most ~60
minutes, and in practice just over 30**, because the two windows overlap rather than
add (the extension is `now() + 30`, not `expires_at + 30`). That is accepted. The
alternative — a shorter
window — fails real 3-D Secure and UPI flows, and the customer who *is* paying
matters more than the one who might have. `/admin/inventory/items` shows active
reservations per variant so an operator can release one by hand
(`release_reason = 'admin'`, audit-logged).

---

## 2. Cart

### 2.1 Server-authoritative, always

The cart is `carts` + `cart_items` (02 §2.7). The client holds **one opaque token in
a cookie and nothing else**. There is no cart in `localStorage`, no cart in Zustand
(01 §1.1), and no cart line whose price the browser computed.

| Cookie | Value | Flags |
| --- | --- | --- |
| `md_cart` | 32 random bytes, base64url. `carts.token_hash` stores `sha256(token)` — never the plaintext | `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, `Max-Age` = 90 days |

Lookup is `WHERE token_hash = digest($1,'sha256')` against
`idx_carts_token_hash`. A cookie whose hash matches nothing yields an empty cart and
a fresh token; it never 500s and never leaks whether a token ever existed.

`carts.market_code` and `carts.currency_code` are `NOT NULL` and composite-FK bound
to `markets (code, currency_code)`. A cart is single-currency by construction
(01 §2.5). The cart-drawer badge is client-rendered after hydration from
`GET /api/cart` with `no-store` (01 §1.3), so no cached HTML ever contains a cart.

### 2.2 Guest and authenticated carts, and the merge rule

A cart exists the moment the first item is added, signed in or not. `customer_id` is
`NULL` for a guest. On sign-in, `mergeCartsOnLogin(guestCartId, customerId)` in
`src/lib/cart/merge.ts` runs as one transaction (02 §5.3):

1. `SELECT … FOR UPDATE` on both cart rows, in ascending `carts.id` order.
2. If the customer has no active cart, the guest cart is simply claimed:
   `UPDATE carts SET customer_id = $2 WHERE id = $1`. Done — no line churn.
3. If both exist **and share a market**, each guest line is upserted into the
   customer cart:

   ```sql
   INSERT INTO cart_items (id, cart_id, market_code, variant_id, quantity, …)
   VALUES (…)
   ON CONFLICT (cart_id, variant_id) DO UPDATE
     SET quantity = LEAST(cart_items.quantity + EXCLUDED.quantity, $maxQuantity);
   ```

   The excluded-row alias is `cart_items`, not `carts` — the conflicting row lives in
   the table being inserted into — and the cap is bound as a parameter from
   `CART_MAX_QUANTITY`, because a TypeScript constant is not in scope inside SQL.
   `uq_cart_items (cart_id, variant_id)` is what makes this an upsert rather than an
   append, which is why two tabs and one sign-in do not double the bag.
4. If the markets **differ**, the *guest* cart's market wins, because it is the market
   the shopper is browsing right now. The customer's saved cart is not translated —
   its lines are dropped with the market-changed message (§2.4) listing exactly what
   was dropped. There is no conversion (hard rule 2). **The order of statements is
   forced by the schema and is not a style choice:** `cart_items` has
   `FK (cart_id, market_code) → carts (id, market_code) ON UPDATE RESTRICT` (02 §2.7),
   so `UPDATE carts SET market_code = …` fails while any line exists. The step is
   therefore (a) `DELETE FROM cart_items WHERE cart_id = :customerCartId`,
   (b) `UPDATE carts SET market_code, currency_code` on the customer cart,
   (c) insert the guest lines, (d) re-quote them in step 5. Doing (b) first — the
   obvious reading of "the guest cart's market wins" — raises a foreign-key error on
   every cross-market sign-in, which is the correct outcome but a 500 rather than a
   merge. `tests/integration/cart-merge.test.ts` covers the cross-market case
   explicitly.
5. Every merged line is re-quoted through `resolvePriceBatch()` before the
   transaction commits, so `unit_list_minor` / `unit_final_minor` / `priced_at` on the
   surviving lines are the customer's prices, not the guest's.
6. The guest cart is marked `status = 'merged'`, `merged_into_cart_id` set. It is
   **not** deleted: the abandoned-cart analytics and any support question about
   "where did my items go" need the row. It is pruned by retention (02 §1.4).
7. `md_cart` is reissued pointing at the surviving cart.

**Quantity is summed, not maxed.** A shopper who added two of a chain as a guest and
one signed-in wants three. The `LEAST(...)` cap keeps a scripted abuse case bounded.
For a variant whose sellable quantity is now below the merged total, nothing fails
here — the merge does not touch inventory. The revalidation on the next cart read
(§2.4) clamps it and says so.

**`uq_cart_items (cart_id, variant_id)` and personalisation are in direct conflict,
and the conflict is resolved by refusing, not by merging.** The key is
`(cart_id, variant_id)` (02 §2.7) while `cart_items.personalisation` is per line. Two
pendants of the same variant engraved "ANNA" and "MAYA" therefore collide: the upsert
above sets `quantity = 2` on the surviving row and the *second* engraving is silently
discarded, so one customer receives two identical pieces bearing the wrong name — a
physically wrong product, shipped, on a personalised item that cannot be resold.
Until personalisation ships:

- `addToCart` rejects a second, differently-personalised unit of a variant already in
  the bag with `cart.line.personalisation_conflict`: "This piece is already in your
  bag with different engraving. Please complete this order first, or change the
  engraving on the piece in your bag."
- `mergeCartsOnLogin` applies the same rule: on a conflict where
  `guest.personalisation IS DISTINCT FROM customer.personalisation`, the guest line is
  **kept as its own entry only if it can be** — it cannot — so it is dropped with
  `cart.line.personalisation_conflict` naming both engravings.
- The permanent fix is recorded so it is not rediscovered as a redesign: add
  `cart_items.personalisation_hash BYTEA NOT NULL DEFAULT digest('', 'sha256')`
  (generated from `personalisation`) and re-key
  `uq_cart_items (cart_id, variant_id, personalisation_hash)`. That is one migration
  and one change to the upsert's conflict target; every other statement in this
  section is unaffected.

> **NEEDS INPUT:** whether personalisation (engraving, ring sizing to order, custom
> stone setting) is in scope for launch. If it is, the re-key above lands in the
> initial migration rather than later, because changing a unique index that carts
> already depend on is a migration with live rows under it.

### 2.3 Persistence and lifetime

| Field | Rule |
| --- | --- |
| `carts.expires_at` | `now() + 90 days`, pushed forward on every write |
| `carts.last_activity_at` | Set on every mutation; drives `idx_carts_abandoned` |
| Pruning | `/api/cron/cleanup-sessions` hard-deletes carts inactive 90 days where `status <> 'converted'` (02 §1.4). A converted cart is kept — `orders.cart_id` points at it |
| Abandoned-cart mail | `/api/cron/abandoned-carts` hourly, `WHERE status='active' AND email IS NOT NULL AND abandoned_email_sent_at IS NULL AND last_activity_at < now() - interval '1 hour'`; `abandoned_email_sent_at` stops a second send |

An abandoned-cart email **never** contains a price. It links to the cart, which
re-quotes on open. A mail that quotes a price the cart then contradicts is a support
ticket with a screenshot attached.

### 2.4 Revalidation — on every read, and again at checkout

`revalidateCart(cartId, opts): Promise<CartView>` in `src/lib/cart/revalidate.ts`
runs on **every** cart read (page, drawer, `GET /api/cart`) and again, non-negotiably,
as the first step of `placeOrder` (01 §2.5). The read-time pass may repair the cart
(clamping a quantity, removing a dead line) and always reports what it did; the
checkout-time pass is the authority and **stops checkout** on any change rather than
repairing silently, because a bag that changes under a customer's finger between
"Review" and "Pay" must be looked at again.

Every check, its detection, its repair, and the exact customer-facing string. Strings
live in `src/lib/cart/messages.ts` keyed as below and are overridable per market
through `settings` (`group_key = 'checkout.messages'`); the defaults ship in the seed.

| # | Case | Detection | Read-time repair | Checkout-time | Message key and default copy |
| --- | --- | --- | --- | --- | --- |
| 1 | **Price changed** | `resolvePriceBatch()` result `unitFinalMinor` ≠ `cart_items.unit_final_minor`, or `unitListMinor` ≠ `unit_list_minor`. Zero tolerance | Line re-quoted, `priced_at` updated, banner shown | `PriceChangedError` — bag re-shown, order **not** created | `cart.line.price_changed`: "The price of {product} has changed to {price}. Please review your bag before continuing." |
| 2 | **Product unpublished / archived / soft-deleted** | `products.status <> 'active'` or `products.deleted_at IS NOT NULL` or no live `product_market_content` visibility for this market | Line removed | `LineUnavailableError` | `cart.line.unavailable`: "{product} is no longer available and has been removed from your bag." |
| 3 | **Variant gone** | `product_variants.deleted_at IS NOT NULL`, or the variant's option combination no longer resolves | Line removed | `LineUnavailableError` | `cart.line.variant_gone`: "The {variant} option for {product} is no longer available. Choose another option to add it back." |
| 4 | **No price in this market** | `resolvePriceBatch()` returns no entry for `(variantId, marketCode)` | Line removed | `LineUnavailableError` | `cart.line.not_sold_here`: "{product} isn't sold in {market} and has been removed from your bag." |
| 5 | **Market changed** | `carts.market_code` ≠ the `[market]` segment of the request | Cart re-priced via the market-switch transaction (02 §5.3); unpriceable lines dropped | `MarketChangedError` — **always**, even if every line survived | `cart.market_changed`: "Your bag is now priced in {currency}. {n} item(s) not sold in {market} were removed." |
| 6 | **Quantity now unavailable (partial)** | `sellable(variant, market)` < `cart_items.quantity`, sellable > 0 | Quantity clamped to sellable | `InsufficientStockError` | `cart.line.quantity_reduced`: "Only {n} of {product} {n, plural, one{is} other{are}} available. We've updated the quantity in your bag." |
| 7 | **Quantity now unavailable (zero)** | `sellable = 0` and policy is `tracked` | Line removed | `InsufficientStockError` | `cart.line.sold_out`: "{product} has just sold and has been removed from your bag." |
| 8 | **One-of-a-kind sold** | Same as 7, on a variant whose product `is_one_of_a_kind` | Line removed | `InsufficientStockError` | `cart.line.ooak_sold`: "{product} is one of a kind and has just been sold." |
| 9 | **Coupon no longer valid** | `evaluateDiscounts()` rejects `carts.coupon_code` (expired, exhausted, conditions no longer met, wrong market) | `coupon_code` cleared, totals recomputed | Same, plus totals re-shown before payment (§8.6) | `cart.coupon.removed`: "The code {code} is no longer valid and has been removed. Your total is now {total}." |
| 10 | **Gift card balance changed** | Applied balance > current `gift_cards.balance_minor` | Application reduced to the live balance | Same, and the payable amount is recomputed | `cart.giftcard.reduced`: "The gift card ending {last4} now has {balance} available. Your remaining balance to pay is {amount}." |

Implementation notes that keep this honest:

- **One batch, not N queries.** The pass issues exactly three queries: one
  `resolvePriceBatch()`, one catalogue-status query over the line's variant ids, one
  `getAvailability()`. `no-await-in-loop` and the custom `no-service-call-in-map`
  rule (01 §2.3) make the naive version a CI failure.
- **Messages are returned, not thrown, at read time.** `CartView` carries
  `notices: CartNotice[]` (`{ key, params, severity }`). The page renders them; the
  service never formats copy.
- **Read-time repair writes.** A cart read that clamps a quantity performs an
  `UPDATE`, so `GET /api/cart` is a `POST`-free endpoint that nonetheless mutates.
  That is accepted and is why it is `no-store` and never cached; the alternative is a
  cart that displays a corrected figure and then submits the stale one.
- `tests/integration/cart-revalidate.test.ts` drives all ten rows.

---

## 3. Checkout

### 3.1 Steps and routes

Route: `src/app/(storefront)/[market]/checkout/[[...step]]/page.tsx`,
`force-dynamic`, `no-store`, `noindex` (01 §1.3).

| Step | Path (US / IN) | Collects |
| --- | --- | --- |
| `information` | `/checkout/information`, `/in/checkout/information` | Email, shipping address, marketing opt-in (unticked by default) |
| `delivery` | `/checkout/delivery` | Shipping method, chosen from a server-computed quote list |
| `payment` | `/checkout/payment` | Billing address, coupon/gift-card entry, provider element. **Nothing is charged until `placeOrder` returns an intent** |
| `processing` | `/checkout/processing` | Polls `GET /api/checkout/status/[orderId]`; redirects to `/orders/[token]` on `paid` |

`/checkout` with no segment redirects to the furthest step the server considers
reached. The customer may navigate backwards freely; forward navigation past the
server's state redirects back. The step in the URL is a *view selector*, never an
authorisation: `getCheckoutSession()` recomputes the reachable step on every request
from the stored row.

> **SCHEMA ADDITION:** 02 has no table for checkout state. `carts` deliberately holds
> only bag contents, and the address/shipping/tax selections are ephemeral, need
> their own expiry, and must be deletable without touching the cart. Two tables, both
> in the **hard delete** class of 02 §1.4, in `prisma/schema/commerce.prisma`:
>
> ```sql
> CREATE TABLE checkout_sessions (
>   id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
>   cart_id                   UUID NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
>   market_code               CHAR(2) NOT NULL,
>   currency_code             CHAR(3) NOT NULL,
>   step                      TEXT NOT NULL DEFAULT 'information',
>   email                     TEXT NULL,
>   accepts_marketing         BOOLEAN NOT NULL DEFAULT false,
>   shipping_address_id       UUID NULL REFERENCES addresses(id) ON DELETE SET NULL,
>   billing_address_id        UUID NULL REFERENCES addresses(id) ON DELETE SET NULL,
>   billing_same_as_shipping  BOOLEAN NOT NULL DEFAULT true,
>   shipping_address_draft    JSONB NOT NULL DEFAULT '{}'::jsonb,
>   billing_address_draft     JSONB NOT NULL DEFAULT '{}'::jsonb,
>   shipping_method_id        UUID NULL REFERENCES shipping_methods(id) ON DELETE SET NULL,
>   shipping_method_code      TEXT NULL,
>   shipping_method_label     TEXT NULL,
>   shipping_amount_minor     BIGINT NULL,
>   shipping_quoted_at        TIMESTAMPTZ NULL,
>   tax_total_minor           BIGINT NULL,
>   tax_provider              TEXT NULL,
>   tax_breakdown             JSONB NOT NULL DEFAULT '{}'::jsonb,
>   tax_quoted_at             TIMESTAMPTZ NULL,
>   idempotency_key           TEXT NULL,
>   order_id                  UUID NULL REFERENCES orders(id) ON DELETE SET NULL,
>   client_ip                 INET NULL,
>   user_agent                TEXT NULL,
>   version                   INTEGER NOT NULL DEFAULT 0,
>   expires_at                TIMESTAMPTZ NOT NULL,
>   created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
>   updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
> );
> CREATE UNIQUE INDEX uq_checkout_sessions_cart ON checkout_sessions (cart_id);
> CREATE UNIQUE INDEX uq_checkout_sessions_id_currency
>   ON checkout_sessions (id, currency_code);
> CREATE INDEX idx_checkout_sessions_expiry ON checkout_sessions (expires_at)
>   WHERE order_id IS NULL;
> ALTER TABLE checkout_sessions
>   ADD CONSTRAINT fk_checkout_sessions_cart_market
>     FOREIGN KEY (cart_id, market_code) REFERENCES carts (id, market_code)
>     ON DELETE CASCADE ON UPDATE RESTRICT,
>   ADD CONSTRAINT fk_checkout_sessions_market_currency
>     FOREIGN KEY (market_code, currency_code) REFERENCES markets (code, currency_code)
>     ON DELETE RESTRICT ON UPDATE RESTRICT,
>   ADD CONSTRAINT chk_checkout_sessions_step
>     CHECK (step IN ('information','delivery','payment','processing')),
>   ADD CONSTRAINT chk_checkout_sessions_shipping_quote
>     CHECK ((shipping_amount_minor IS NULL) = (shipping_quoted_at IS NULL)),
>   ADD CONSTRAINT chk_checkout_sessions_tax_quote
>     CHECK ((tax_total_minor IS NULL) = (tax_quoted_at IS NULL)),
>   ADD CONSTRAINT chk_checkout_sessions_amounts
>     CHECK (coalesce(shipping_amount_minor,0) >= 0 AND coalesce(tax_total_minor,0) >= 0);
> CREATE TRIGGER trg_checkout_sessions_touch BEFORE UPDATE ON checkout_sessions
>   FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
>
> CREATE TABLE checkout_gift_cards (
>   checkout_session_id  UUID NOT NULL REFERENCES checkout_sessions(id) ON DELETE CASCADE,
>   gift_card_id         UUID NOT NULL REFERENCES gift_cards(id) ON DELETE RESTRICT,
>   currency_code        CHAR(3) NOT NULL,
>   applied_amount_minor BIGINT NOT NULL,
>   created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
>   PRIMARY KEY (checkout_session_id, gift_card_id),
>   CONSTRAINT fk_checkout_gift_cards_card
>     FOREIGN KEY (gift_card_id, currency_code) REFERENCES gift_cards (id, currency_code)
>     ON DELETE RESTRICT ON UPDATE RESTRICT,
>   CONSTRAINT fk_checkout_gift_cards_session
>     FOREIGN KEY (checkout_session_id, currency_code)
>     REFERENCES checkout_sessions (id, currency_code)
>     ON DELETE CASCADE ON UPDATE RESTRICT,
>   CONSTRAINT chk_checkout_gift_cards_amount CHECK (applied_amount_minor > 0)
> );
> ```
>
> **The second composite FK is the one that matters and it was missing.** With only
> the card-side FK, `currency_code` on this row is bound to the *card* and to nothing
> else, so an INR card can be attached to a USD checkout session and
> `applied_amount_minor = 1000000` (₹10,000) is read by the USD order as
> **$10,000.00** — a rupee instrument discharging a dollar liability at an invented
> rate, arrived at by omission. This is exactly the failure 02 §2.7 closes for
> `gift_card_transactions` with its two composite FKs, and the checkout staging table
> needs the same pair or the service check in §8.7 is the only thing between a bearer
> instrument and an 85× accounting error. Requiring both FKs simultaneously makes the
> card's currency and the session's currency the same column value, or the row does
> not exist.
>
> The composite FK on `(cart_id, market_code)` is the same `ON UPDATE RESTRICT` trick
> 02 §2.7 uses for `cart_items`: a market switch cannot leave a checkout session
> holding a USD shipping quote on an INR cart — it fails the update, forcing
> `switchMarket()` to delete the session. `expires_at` is `now() + 60 minutes`;
> `/api/cron/release-reservations` deletes expired sessions with a null `order_id` in
> the same pass that releases their reservations.

### 3.2 The server-side state machine

`src/lib/checkout/stateMachine.ts`. Steps advance only when the server can prove the
preconditions; it never trusts the URL.

| From | To | Server precondition |
| --- | --- | --- |
| `information` | `delivery` | Cart non-empty and clean after `revalidateCart()`; `email` valid; a shipping address resolving to an active `shipping_zones` row for this market |
| `delivery` | `payment` | `shipping_method_id` is one of the methods `quoteShipping()` returns *now* for this address and bag; `shipping_amount_minor` and `shipping_quoted_at` written by the server; **`quoteTax()` runs here and writes `tax_total_minor`, `tax_provider`, `tax_breakdown`, `tax_quoted_at`** |
| `payment` | `processing` | `placeOrder()` returned an order and a `PaymentIntentRef`; `order_id` and `idempotency_key` written |
| any | `information` | Cart mutated, market changed, or the shipping address changed — every downstream field (`shipping_*`, `tax_*`) is nulled in the same statement |
| `processing` | — | Terminal. A new checkout requires a new cart, which `createOrderFromCart()` has already marked `converted` |

`advanceCheckout(sessionId, to, payload, expectedVersion)` is the only writer, uses
the optimistic-lock shape from 01 §2.3 step 3, and returns `StaleWriteError` when two
tabs race. A rejected transition returns `IllegalCheckoutTransitionError` with the
step the server believes is current; the client redirects there.

**Tax is quoted on entering `payment`, not at `placeOrder`, and that is a
correctness requirement rather than a UX nicety.** `checkout_sessions` carries
`tax_total_minor` / `tax_quoted_at` columns; if nothing writes them until phase A of
`placeOrder`, the `payment` step renders a total with no tax in it, the customer
presses Pay, and the intent is created for a figure **they were never shown** — the
US sales-tax case, where tax is genuinely unknown until the shipping address is, and
where a 8.875% surprise on a $4,200 ring is a chargeback. The address is known at the
end of `information` and the shipping charge at the end of `delivery`, so the
`delivery → payment` transition is the first moment tax *can* be computed and the
last moment it *may* be. Phase A recomputes it and compares (§3.6 step 5b).

### 3.3 Guest checkout and login

Guest checkout is the default path: email plus addresses, no password, no forced
account. Sign-in is offered on `information` and, if taken, merges the cart (§2.2)
and restarts the session at `information` with saved addresses prefilled.

`resolveCheckoutCustomer(email, tx)` in `src/lib/orders/` implements 02 §2.7
verbatim and is restated here because it is a security rule, not an ergonomics one:
a guest order attaches to an existing `customers` row **only** when that row has
`password_hash IS NULL AND email_verified_at IS NULL AND is_guest`. Against a
credentialled or verified account it leaves `orders.customer_id` `NULL` and relies on
the `orders.email` snapshot plus `/orders/[token]`. The order is claimed into the
account at the customer's next verified sign-in by `claimGuestOrders(customerId)`,
which matches `lower(orders.email)` and writes an `order_events` row.

### 3.4 Address handling, US and India

Addresses are `addresses` rows for signed-in customers and
`checkout_sessions.shipping_address_draft` JSONB for guests until the order is
placed, at which point both are snapshotted into `order_addresses` (02 §2.7). The
draft is JSONB because an unvalidated, half-typed address is not an address-book
entry and must not appear in the customer's saved addresses if they abandon.

Validation is per country, in `src/lib/checkout/address.ts`, as Zod schemas selected
by `country_code`:

| Field | US | IN |
| --- | --- | --- |
| `region` | **Required**, 2-letter USPS state code, validated against a static list of the 50 states + DC + territories | **Required**, Indian state/UT name from a static list |
| `postal_code` | **Required**, `^\d{5}(-\d{4})?$`, normalised to 5 digits for zone matching | **Required**, `^\d{6}$` (PIN) |
| `phone` | Optional at `information`, **required** before `payment` (carrier requirement for insured jewellery) | **Required**; normalised to E.164 `+91…` |
| `line2` | Optional | Optional |
| `tax_identifier` | Not shown | Shown as "GSTIN (optional)", validated `^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$` when present |
| `company` | Optional | Optional |

The state and territory lists are static data in `src/lib/checkout/regions.ts`, not
database rows: they are ISO-stable, a merchant never edits them, and a missing row
would silently make an address unshippable. Country lists *are* restricted by which
countries have a `shipping_zone_rules` row for the market — a shopper cannot enter an
address the business has no rate for, and the country select shows only serviceable
countries with the message `checkout.address.country_unsupported`: "We don't ship to
{country} yet."

> **NEEDS INPUT:** whether India orders require a GSTIN on B2B invoices, and whether
> any US state is excluded from shipping. Both are `shipping_zones` and invoice-field
> decisions, not architecture; the schema supports either answer.

No third-party address-verification service is integrated at launch. If one is
commissioned it lands behind `src/lib/checkout/address.ts`'s existing
`verifyAddress(input): Promise<AddressVerification>` seam, which today returns
`{ status: 'unverified' }` and blocks nothing — because a verification service that
is down must not stop a checkout.

### 3.5 Shipping method selection

`delivery` renders `quoteShipping()` output (§7) and nothing else. The method the
client posts is a `shipping_methods.id`; the server re-runs the quote and rejects an
id that is not in the fresh result with `ShippingMethodUnavailableError`. The
resulting amount is written to `checkout_sessions.shipping_amount_minor` server-side.
The client never posts an amount.

### 3.6 The final authoritative recomputation

`placeOrder(sessionId, expectedVersion)` — server action in
`src/server/actions/checkout.ts`, orchestrated by
`src/lib/checkout/placeOrder.ts`. Every external call happens **before** the
transaction opens, because the order-number lock must not be held across a network
call (02 §2.7).

**Phase A — outside the transaction (network allowed):**

0. **Idempotency is checked first, by `SELECT`, outside any transaction.**
   `SELECT * FROM orders WHERE idempotency_key = :key` on
   `idx_orders_idempotency_key`; a hit returns that order immediately and phases A–C
   do not run. This ordering is load-bearing. If the only idempotency mechanism is
   the `23505` raised by the insert at step 12, then a double-submit has **already**
   executed steps 9, 10 and 11 — it has re-reserved stock, incremented
   `coupons.redemption_count` a second time, and debited the gift card a second time
   — before the constraint fires. Those writes are undone only because the error
   aborts the transaction, so the `catch` must sit **outside** `withTransaction()` and
   must re-`SELECT` the winning order rather than continuing inside a poisoned
   transaction (Postgres refuses every subsequent statement in an aborted transaction
   anyway). Step 0 turns the common case into a read and leaves `23505` as the
   narrow-window backstop it should be.
1. `revalidateCart(cartId, { mode: 'checkout' })` — §2.4, throws on any change. A cart
   already `status = 'converted'` raises `CartConvertedError` and redirects to the
   order; it is never re-quoted or re-reserved.
2. `resolvePriceBatch(lines, { customerId, couponCode, at: now })` — the full
   price authority, uncached (01 §2.4).
3. `evaluateDiscounts(...)` — §8, returns the ordered `DiscountLine[]` and the
   order-level discount total.
4. `quoteShipping(...)` — §7, re-quoted; must equal
   `checkout_sessions.shipping_amount_minor` or the session drops to `delivery`.
5. `quoteTax(input)` — `src/lib/tax/`; Stripe Tax for US, `rules_table` for India
   (01 §4.4). Returns one total per jurisdiction plus a breakdown. **The function
   is `quoteTax`, not `computeTax`** — this document used the second name, 08 §1.3
   exports the first, and 04 §8.1 reaches the provider behind it through
   `getTaxProviderForMarket(marketCode)`. One call had three names in three
   documents; `quoteTax(input)` is canonical (11 §2.2). With zero registered
   jurisdictions it returns `TaxUnconfiguredError` (503), which is a different
   failure from `TaxUnavailableError` (the provider was reached and cannot quote
   this destination) and must not be collapsed into it — a silently zero-taxed
   checkout accrues a liability with nothing to show for it.
5b. **The recomputed tax must equal `checkout_sessions.tax_total_minor`.** If it does
   not — a rate change, a Stripe Tax reclassification, a discount that moved the
   taxable base — `placeOrder` stops with `TotalsChangedError`, the session is written
   with the new figure, and the `payment` step re-renders showing
   `checkout.totals.changed`: "Your total has changed to {total}. Please review it
   before paying." Exactly the §8.6 rule for a coupon, applied to the other number
   that can move underneath a customer: **no order is created for a total the
   customer has not seen.** Without this comparison the session's quoted tax is
   decoration and phase A silently charges whatever it recomputes.
6. `allocate(totalMinor, weights)` — signature and tie-break canonical in 01 §2.6 —
   spreads `discount_total_minor`, `tax_total_minor` and `shipping_total_minor` over
   lines by largest remainder so the exact-integer CHECK constraints hold. **Lines are
   passed in `line_number` order**, because the leftover minor units go to the
   **lowest index first** and the caller is what makes that deterministic; the
   function receives weights and has no line numbers to break a tie on.
7. Gift-card application computed against live balances (§8.7).
8. `getProviderForMarket(marketCode)` — a `null` provider aborts here with
   `PaymentsUnconfiguredError` and **no order is written** (01 §4.9).

**Phase B — one transaction, `ReadCommitted`, no network (02 §5.3):**

9. `reserveStock(tx, lines, { kind: 'cart', id: cartId, expiresAt })`.
10. `redeemCoupon(tx, …)` — conditional counter update (§8.5).
11. `redeemGiftCards(tx, …)` — conditional balance update (§8.7).
12. `SELECT … FOR UPDATE` on `order_counters` → `order_number` → `orders` INSERT with
    `idempotency_key` (**last** statement before the insert; 02 §2.7).
12b. **Promote the reservation to the order** — the `UPDATE reservations SET
    ref_kind = 'order', order_id = …` of §1.5 step 4. Without it the webhook cannot
    find the reservation it must commit.
13. `order_items` (all snapshot columns), `order_addresses`, `coupon_usages`,
    `gift_card_transactions`, `customers` counters, `order_events`, `recordAudit()`.
14. `carts.status = 'converted'`, `converted_order_id`, `checkout_sessions.order_id`.
15. Commit. `trg_orders_totals_match` fires here and rejects any header that does not
    equal its lines.

**Phase C — after commit (network again):**

16. `provider.createIntent(order, paymentAttemptKey(order, attempt))`.
17. `payments` row + `payment_events` (`intent_created`) + `order_events`.
18. Reservation `expires_at` extended to the payment window.
19. If `createIntent` throws: the order stays `pending_payment`, the reservation stays
    live until it expires, the customer sees "We couldn't reach the payment provider.
    Your bag is held for 30 minutes — please try again," and the retry reuses the same
    `orders.idempotency_key`, so phase A step 0 returns the existing order rather than
    creating a second one.

> ### The intent's idempotency key is not `orders.idempotency_key`
>
> **This is the rule two other documents currently contradict, and following
> either of them makes a declined card unrecoverable.** 01 §2.5 writes
> `createIntent(order, order.idempotency_key)`, which is correct for the *first*
> attempt and wrong for every subsequent one, and a subsequent one is the normal case:
> a declined card, an abandoned 3-D Secure challenge, a UPI collect the customer let
> lapse. Stripe returns the **same** PaymentIntent for a replayed idempotency key
> within 24 hours, so the retry hands the browser the client secret of the intent that
> already failed or was cancelled, and the customer can never pay for that order —
> from their side, "the page is broken." Razorpay's order id has the same property.
> `uq_payments_idempotency (provider_key, idempotency_key)` would also refuse the
> second `payments` row.
>
> ```ts
> // src/lib/payments/index.ts
> export function paymentAttemptKey(order: Order, attempt: number): string {
>   return `${order.idempotency_key}:${attempt}`;      // attempt is 1-based
> }
> ```
>
> `attempt` is `SELECT count(*) + 1 FROM payments WHERE order_id = $1`, read inside
> the `payments` insert's transaction so two tabs cannot both claim attempt 2 —
> `uq_payments_idempotency` makes the loser retry with the next number.
> `orders.idempotency_key` keeps its single job: one order per checkout submission.
>
> **RESOLVED — was CHANGE REQUIRED IN 08 §2.3:** the four-row idempotency table's "Payment
> *Verified applied in 08.*
> intent" row reads "`createIntent(order, order.idempotency_key)` — the provider's
> own idempotency, keyed by our order," with no mention of attempts. It must read
> `createIntent(order, paymentAttemptKey(order, attempt))` and cite this section.
> **Applied in 01 §2.5.** Its step 5 now reads
> `createIntent(order, paymentAttemptKey(order, attempt))` and carries the reason
> inline, so the document `08` defers to no longer specifies the version that
> hands the browser the client secret of the intent that already failed, where
> `uq_payments_idempotency (provider_key, idempotency_key)` would refuse the
> second `payments` row on top of it — so the customer sees a page that cannot be
> paid and a retry that errors, and the order sits `pending_payment` until the
> release cron cancels it.
>
> `retryPayment(orderId)` is the entry point (a server action in
> `src/server/actions/checkout.ts`); it re-reserves through `reserveStock(tx, lines,
> { kind: 'order', id: orderId, expiresAt })` when the previous reservation was
> released, and fails with `InsufficientStockError` — **before** any new intent — if
> the stock has since gone. `tests/integration/payment-retry.test.ts` fails an intent,
> retries, and asserts two distinct `payments` rows with two distinct provider ids.

> **Reconciliation with 01 §2.5.** 01 lists the five authoritative checks as running
> "inside one transaction," and its step 5 is `createIntent()`. Steps 1–4 do run in
> one transaction — phase B. Step 5 cannot, because 02 §2.7 forbids any network call
> while the `order_counters` lock is held, and that prohibition is the stronger rule:
> a 900 ms provider call inside the lock caps a market at roughly one order per second
> and turns provider latency into a checkout outage. Moving `createIntent()` after the
> commit costs nothing in correctness — the order exists before any money is asked
> for, which is the property §4.5 depends on — and 01 §2.5's own ordering (order
> created, *then* intent) already implies it.

**Zero-total orders skip phases C entirely.** When gift cards cover the total,
`orders.total_minor = 0` (the `chk_orders_total` identity already subtracts
`gift_card_total_minor`). No `payments` row is created — `payments.provider_key` is
`NOT NULL` and inventing a `provider_key = 'gift_card'` would put a non-acquirer into
every payment report. The settlement record is the `gift_card_transactions` row. The
transaction itself calls `transitionOrder(orderId, 'paid', { type: 'system' })`,
sets `payment_status = 'paid'` and `paid_at`, and calls `commitStock()` before it
commits. `tests/integration/zero-total-order.test.ts` asserts the order is `paid`,
stock is committed, and no `payments` row exists.

### 3.7 What the client may send, and what it may never send

**Permitted, on every checkout request:**

| Field | Type | Validated against |
| --- | --- | --- |
| `variantId` | UUID | exists, live, priced in this market |
| `quantity` | integer 1..99 | `CART_MAX_QUANTITY`, then sellable |
| `shippingMethodId` | UUID | present in the freshly-computed quote list |
| `addressId` | UUID | belongs to the signed-in customer |
| address fields | strings | the per-country schema in §3.4 |
| `email` | string | RFC-shaped, lowercased |
| `couponCode` | string ≤ 64 | `evaluateDiscounts()` |
| `giftCardCode` | string | hashed and looked up; never echoed back |
| `personalisation` | JSON | the product's own schema |
| `expectedVersion` | integer | optimistic lock |
| CSRF/session cookies | — | Next server-action origin check (01 §2.1) |

**Refused, always.** These field names are rejected by the Zod schema with
`.strict()`, so their presence is a `400` and a `security.rejected_field` log line —
not a silently-ignored key:

`price`, `unitPrice`, `unit_list_minor`, `unit_final_minor`, `lineTotal`,
`subtotal`, `discount`, `discountAmount`, `shippingAmount`, `shippingCost`, `tax`,
`taxAmount`, `total`, `total_minor`, `currency`, `currencyCode`, `market`,
`marketCode`, `giftCardAmount`, `orderStatus`, `paymentStatus`, `paid`, `orderId`,
`customerId`, `idempotencyKey`, `inventoryQuantity`, `available`.

Three of those deserve their reason stated:

- **`marketCode`** — the market is `carts.market_code` cross-checked against the URL
  segment (01 §2.5 step 1). A body-supplied market is how a shopper pays INR prices
  for USD stock.
- **`idempotencyKey`** — server-issued into `checkout_sessions.idempotency_key` when
  `payment` is entered. A client-chosen key lets one browser collide with another's
  order and receive it back from `idx_orders_idempotency_key`.
- **`orderId`** — the order the session created is `checkout_sessions.order_id`.
  `GET /api/checkout/status/[orderId]` additionally requires the customer session or
  the cart token that created the order (01 §2.5); an order id is an identifier, not
  a capability.

`tests/integration/checkout-tamper.test.ts` posts each refused field and asserts a
`400`, and posts a `shippingMethodId` from another market and asserts rejection.

---

## 4. Payments

### 4.1 The provider abstraction

One interface, two bindings, registered by `markets.payment_provider_key`. The
interface is fixed in 01 §2.3 and is reproduced here with the envelope and state
types filled in — no method is added or renamed.

```ts
// src/lib/payments/index.ts
export function getProviderForMarket(marketCode: MarketCode): PaymentProvider | null;

export interface PaymentProvider {
  readonly key: string;                                  // 'stripe' | 'razorpay' | future
  readonly supportedCurrencies: readonly CurrencyCode[];
  createIntent(order: Order, idempotencyKey: string): Promise<PaymentIntentRef>;
  verifyWebhook(rawBody: Buffer, headers: Headers): Promise<WebhookEventEnvelope>;
  capture(paymentId: string): Promise<PaymentResult>;
  refund(paymentId: string, amountMinor: bigint, reason: string,
         idempotencyKey: string): Promise<RefundResult>;
}

// src/lib/payments/types.ts
export type PaymentIntentRef = {
  providerPaymentId: string;        // pi_… | order_… — written to payments.provider_payment_id
  clientSecret: string | null;      // Stripe; null for Razorpay
  providerOrderId: string | null;   // Razorpay order id
  amountMinor: bigint;
  currencyCode: CurrencyCode;
  requiresAction: boolean;
  publishableKey: string;           // from env; never a secret key
};

export type NormalisedPaymentState =
  | 'requires_action'   // 3-D Secure, UPI collect pending — customer must do something
  | 'processing'        // provider accepted, outcome not yet known
  | 'authorized'        // funds held, not captured
  | 'succeeded'         // captured
  | 'failed'
  | 'cancelled'
  | 'refunded'
  | 'partially_refunded'
  | 'disputed';

export type WebhookEventEnvelope = {
  providerKey: string;
  providerEventId: string;          // the dedupe key
  eventType: string;                // raw provider string, stored on webhook_events
  state: NormalisedPaymentState;
  orderId: string | null;           // our orders.id, from provider metadata
  providerPaymentId: string | null;
  providerRefundId: string | null;
  amountMinor: bigint | null;
  currencyCode: CurrencyCode | null;
  occurredAt: Date;                 // provider-side timestamp, for ordering
  failureCode: string | null;
  failureMessage: string | null;
  raw: unknown;                     // stored verbatim in webhook_events.payload
};
```

`NormalisedPaymentState` is a superset of the `payment_status` enum on purpose. The
DB enum records the *settled* position of the money (`unpaid`, `authorized`, `paid`,
`partially_refunded`, `refunded`, `failed`); the normalised state also carries the
transient positions (`requires_action`, `processing`, `disputed`) that never need a
column because they are never the resting state of an order. The mapping is one
function, `toPaymentStatus(state): payment_status | null`, and `null` means "record
the event, change no status."

| Provider concept | Stripe | Razorpay |
| --- | --- | --- |
| Intent creation | `paymentIntents.create({ amount, currency, metadata: { order_id }, automatic_payment_methods: { enabled: true } }, { idempotencyKey })` | `orders.create({ amount, currency, receipt: order_number, notes: { order_id } })` + client checkout handoff |
| Capture | automatic capture (`capture_method: 'automatic'`) | automatic capture on `payment.captured` |
| Webhook verification | `stripe.webhooks.constructEvent(rawBody, sig, STRIPE_WEBHOOK_SECRET)`, tolerance 300s | HMAC-SHA256 of the raw body with `RAZORPAY_WEBHOOK_SECRET`, compared with `crypto.timingSafeEqual` against `x-razorpay-signature` |
| Refund | `refunds.create({ payment_intent, amount }, { idempotencyKey })` | `payments.refund(paymentId, { amount, speed: 'normal', notes })` with `Idempotency-Key` header |
| Dedupe id | `event.id` (`evt_…`) | `x-razorpay-event-id` header |

**Manual capture is not used at launch.** Authorise-then-capture would let us hold
funds while a one-of-a-kind piece is physically verified, but it adds a
seven-day authorisation expiry to manage, a second webhook path, and a second state
customers do not understand on their statement. Automatic capture, plus the
`paid_unfulfillable` + auto-refund path of 01 §2.5, handles the rare failure without
adding a state to the common one. The interface has `capture()` regardless, so
switching is a provider-config change, not a redesign.

### 4.2 A frontend success callback is never proof of payment

This is a rule with teeth, not a principle:

- Stripe's `confirmPayment` resolution and Razorpay's `handler(response)` callback
  both run in the customer's browser. Both can be replayed, tampered with, or simply
  never fire because the customer's train went into a tunnel.
- The client redirect target is **`/checkout/processing`**, which renders a spinner
  and polls `GET /api/checkout/status/[orderId]` every 2s for 90s, then falls back to
  "We're still confirming your payment — we'll email you within a few minutes."
- That endpoint reads `orders.payment_status` and nothing else. It never calls the
  provider, never infers from a query parameter, and returns `pending` until a
  verified webhook has moved the row.
- Razorpay's `razorpay_signature` in the browser callback **is** verified server-side
  when the client posts it — as a *hint* that lets us fetch the event early — but the
  verification writes a `payment_events` row with `type = 'authorized'` and never
  `payment_status = 'paid'`. Only the webhook path of §4.3 marks an order paid.
- `tests/e2e/checkout-us.spec.ts` asserts that a synthetic client success callback
  with no webhook leaves the order `pending_payment`.

### 4.3 Webhook lifecycle

Routes: `src/app/api/webhooks/stripe/route.ts`,
`src/app/api/webhooks/razorpay/route.ts`. Both `nodejs`, `force-dynamic`, excluded
from middleware (01 §1.3) so the raw body is byte-identical, and rate-limited by
`src/lib/ratelimit/` on source IP with a generous ceiling.

The handler is one shared function, `handleProviderWebhook(providerKey, req)` in
`src/lib/payments/webhook.ts`:

```
1.  read the raw body as a Buffer (never req.json() first)
2.  provider.verifyWebhook(rawBody, headers)
      → invalid signature: INSERT webhook_events(signature_valid=false, status='ignored')
        and return 400. The row is written so a signing-secret rotation failure is
        visible at /admin/system/webhooks instead of being a silent absence of orders.
3.  open withTransaction({ isolationLevel: 'ReadCommitted' })      -- 02 §5.3
4.  INSERT INTO webhook_events (provider, provider_event_id, event_type, status,
        signature_valid, payload, order_id, received_at)
    VALUES (…, 'received', true, …)
    ON CONFLICT (provider, provider_event_id) DO UPDATE
        SET status = 'received', attempts = webhook_events.attempts
      WHERE webhook_events.status = 'failed'
    RETURNING id;
      → zero rows: this delivery is a duplicate of one already processed or ignored.
        Commit, return 200 immediately. No effect re-runs.
5.  envelope.orderId IS NULL → status='ignored', commit, 200 (an informational event
      carrying no order reference is not an error and must not be retried forever)
6.  SELECT … FROM orders WHERE id = envelope.orderId FOR UPDATE
7.  assert the seven conditions (01 §2.5 plus the cancelled-order case) — table below
8.  apply the state change (payments, payment_events, commitStock, transitionOrder,
      order_events, recordAudit)
9.  INSERT INTO jobs (kind, dedupe_key, payload)
    VALUES ('send_email', 'order:'||order.id||':order_confirmation', …)
    ON CONFLICT (kind, dedupe_key) WHERE dedupe_key IS NOT NULL
       AND status IN ('queued','running') DO NOTHING   -- same transaction
10. UPDATE webhook_events SET status='processed', processed_at=now()
11. commit; then revalidateTags([...])
12. any throw → the transaction rolls back, including the dedupe row. In a SECOND,
      separate statement: INSERT … ON CONFLICT (provider, provider_event_id)
      DO UPDATE SET status='failed', attempts = webhook_events.attempts + 1,
      last_error = EXCLUDED.last_error, next_attempt_at = now() + backoff(attempts).
      Return 500 so the provider also retries; /api/cron/retry-webhooks retries to
      attempts < 8
```

Three details in that sequence are the difference between it working and it looking
like it works:

- **The dedupe insert is inside the transaction, per 02 §5.3.** Outside it, a
  transient failure at step 8 leaves a committed `webhook_events` row; the provider's
  next delivery of the same event hits `ON CONFLICT`, returns zero rows, and is
  answered `200` — so the provider stops retrying an event **we never processed**, and
  the only remaining safety net is an internal cron that a `CRON_SECRET`
  misconfiguration silently disables (01 §4.7). Inside the transaction, a rollback
  takes the dedupe row with it and the provider's own retry is a clean reprocess.
- **`DO UPDATE … WHERE status = 'failed'` rather than `DO NOTHING`.** A row left
  `failed` by step 12 must be re-claimable; a row that is `processed` or `ignored`
  must not. The conditional `DO UPDATE` expresses exactly that and takes a row lock
  while it does, so two simultaneous deliveries of the same event serialise instead
  of racing. `attempts` is carried forward, not reset, so the backoff schedule is
  monotonic. This is a strengthening of 01 §1.2's `DO NOTHING` formulation, not a
  departure from it: `DO NOTHING` remains correct for the common path and is what
  fires for an already-processed event.
- **The confirmation email is a `jobs` row written inside the transaction**, drained
  by `/api/cron/run-jobs` (02 §2.9; the cron registry is 11 §5 — **ten** entries, not
  01 §5.6's nine) — not an in-process enqueue after commit.
  On a serverless runtime the instance can be frozen the instant the response is
  written; an after-commit enqueue loses the confirmation email for a paid order with
  no trace anywhere, and the customer's first contact with the business after paying
  four thousand dollars is silence. `email_logs` records the send; `jobs` guarantees
  the attempt.

  **That row carries `created_by_user_id = NULL`, and that is correct**, because a
  webhook handler has no user. Two things have to be true for it ever to send, and
  both are now written down rather than assumed:

  1. **`send_email` is a declared `job_kind` value.** It was used here and declared
     nowhere — 02 §1.9's enum has eight values and this is not one of them. It
     ships in its own `ALTER TYPE job_kind ADD VALUE 'send_email'` migration ahead
     of the migration that uses it (11 §3.1).
  2. **`send_email` is `systemPermitted: true`.** 07 §3.2 originally permitted a
     `NULL` creator for only three job kinds — `collection_refresh`,
     `sitemap_rebuild`, `reindex_search` — as a closed allowlist. `send_email` was
     in neither that list nor the failure list, so under the rule as written
     **every order confirmation, shipping notice, refund notice and cancellation
     email failed as `FORBIDDEN` in `jobs.error`, silently, from the first paid
     order.** 07 §3.2 has been rewritten to a per-kind `systemPermitted` flag and
     `send_email` carries it. Nothing in this section changes; what changed is that
     the rule on the other side no longer kills it.

  **`jobs.dedupe_key` is the natural key of the message**, so a retried webhook or
  a replayed cron pass cannot send twice even before the `webhook_events`
  de-duplication at step 4 catches it, and `uq_jobs_dedupe` is partial on
  `status IN ('queued','running')` so a later, legitimate message about the same
  order is not blocked by a completed one.
  `tests/integration/webhook-duplicate.test.ts` asserts exactly one `email_logs`
  row with `status <> 'skipped_unconfigured'` after a paid webhook.

The assertions, all inside the transaction of step 3. The first six are verbatim from
01 §2.5; the seventh is the one that table does not cover and that costs real money.

| # | Assertion | On failure |
| --- | --- | --- |
| 1 | The `ON CONFLICT … RETURNING` in step 4 returned a row | `200`, nothing re-runs |
| 2 | `envelope.amountMinor === order.total_minor` | `webhook_events.status='failed'`, Sentry `fatal`, `ORDER_NOTIFICATION_EMAILS`, order untouched |
| 3 | `envelope.currencyCode === order.currency_code` | same |
| 4 | `envelope.orderId === order.id` | same |
| 5 | `transitionOrder()` accepts the transition from the order's **current** status | `status='ignored'`, `payment_events` row recorded, order untouched |
| 6 | The order's reservation is still `active`, **or** `reserveStock()` succeeds again now | `paid_unfulfillable` + automatic full refund, §4.5 |
| 7 | The order is not already `cancelled` | **Automatic full refund**, `payment_events` (`payment_captured` then `refund_created`), `order_events`, Sentry `fatal`, `ORDER_NOTIFICATION_EMAILS`, customer email. The order stays `cancelled` |

**Assertion 7 exists because assertion 5 silently keeps the money.** `cancelled` is
terminal (02 §2.7), so `transitionOrder(cancelled → paid)` is illegal and assertion 5
answers by recording the event and marking it `ignored`. That is the right answer for
a stale `payment_failed`; applied to a *successful* capture it means the provider has
taken the customer's money, our order is cancelled, no refund is issued, and the only
evidence is a `webhook_events` row with `status = 'ignored'` among thousands. The
window is real and routine: a UPI collect approved on the customer's phone eleven
minutes after `/api/cron/release-reservations` cancelled the unpaid order (§8.8), or
a 3-D Secure challenge completed after a tab was left open overnight. Assertion 7
therefore runs **before** assertion 5 for any envelope whose `state` is `succeeded` or
`authorized`, and its remedy is the §4.5 `paid_unfulfillable` remedy minus the status
change: refund in full, keyed `idempotencyKey = order.id`, tell both parties.
`tests/integration/webhook-late-success-on-cancelled.test.ts` asserts the refund is
issued and the order is still `cancelled`.

Assertion 2 is the one that matters most for India: the Razorpay handoff is
assembled client-side, so a tampered or replayed confirmation without this check pays
₹1 for a ₹1,00,000 piece. It is an integer equality against
`orders.total_minor` — no tolerance, no rounding, no "within a rupee."

**Subscribed event types** (configured in each provider's dashboard; the handler
ignores anything else with `status = 'ignored'`):

| Stripe | Razorpay | Effect |
| --- | --- | --- |
| `payment_intent.succeeded` | `payment.captured` | The paid path: `payments.status='paid'`, `captured_minor`, `commitStock()`, `transitionOrder(→'paid')` — **or `→'pending_review'` above the high-value threshold, §5.3** — confirmation email |
| `payment_intent.payment_failed` | `payment.failed` | `payments.status='failed'`, `releaseStock(release_reason='payment_failed')`, order stays `pending_payment` |
| `payment_intent.canceled` | `order.paid` (informational) | `payment_events` only |
| `charge.refunded` | `refund.processed` | Reconciles a refund we initiated, or records one initiated in the provider dashboard (§9.4) |
| `charge.dispute.created` / `.closed` | `payment.dispute.created` / `.closed` | `payment_events` (`dispute_opened`/`dispute_closed`), `order_events`, staff alert. No automatic status change — a dispute is a human decision |

**Idempotency keys, all four of them, named:**

| Key | Uniqueness | Prevents |
| --- | --- | --- |
| `orders.idempotency_key` | `idx_orders_idempotency_key` | Double-submit creating two orders (01 §2.5) |
| `payments.idempotency_key` | `uq_payments_idempotency (provider_key, idempotency_key)` | Two intents for one order; also sent to the provider on create, so the provider itself returns the first intent |
| `webhook_events (provider, provider_event_id)` | `idx_webhook_events_event` | Duplicate delivery re-running effects |
| `refunds.idempotency_key` | `uq_refunds_idempotency (payment_id, idempotency_key)` | Double refund (§9.3) |

**Out-of-order delivery.** Providers do not guarantee ordering, and `retry-webhooks`
makes reordering more likely, not less. Three defences, in order of cheapness:

1. The order state machine (02 §2.7) refuses illegal transitions, so a late
   `payment_failed` cannot un-pay a `paid` order. It is recorded and marked `ignored`.
2. `envelope.occurredAt` is compared against the latest `payment_events.created_at`
   for that payment; an event older than the current terminal state is recorded and
   ignored.
3. An event arriving for an order in `pending_payment` whose `payments` row does not
   yet exist — the webhook beating our own `createIntent` response — is **not** an
   error. The handler creates the `payments` row from the envelope
   (`provider_payment_id`, amount, currency, `provider_key`) under
   `uq_payments_idempotency`, then proceeds. This is the "webhook arrives before the
   redirect" case and it is a normal path, not an exception.

### 4.4 The payment event log

Two logs, both required, answering different questions (02 §2.7):

- **`webhook_events`** — what the provider *sent*: raw body, signature validity,
  attempts, retry schedule. Pruned at 90 days with a hard floor of 30.
- **`payment_events`** — what we *decided*: `type payment_event_type`, `from_status`,
  `to_status`, `amount_minor`, `currency_code`, `webhook_event_id` (the delivery that
  caused it, if any), `actor_type`, `actor_user_id`. Append-only, never pruned.

Every state change to a payment writes a `payment_events` row in the same
transaction. `/admin/orders/[id]` renders the two correlated side by side; that
correlation is what makes a payment incident investigable in minutes rather than by
reading Vercel logs.

### 4.5 Payment succeeded but order creation failed

**By construction this is nearly unreachable, and that is the design.** The order row
commits in phase B *before* `createIntent()` is called in phase C (§3.6). There is no
window in which a provider holds money for an order that was never written by us.

Three residual cases, each with a named path:

| Case | Detection | Resolution |
| --- | --- | --- |
| Intent created, then the order row is somehow absent (hand-written repair, restore from backup) | `/api/cron/reconcile-payments` daily: every provider payment in the last 72h whose `metadata.order_id` has no `orders` row | Full-amount `provider.refund()` with `idempotencyKey = providerPaymentId`, recorded as an `audit_logs` row and an `email_logs` row — **not** a `refunds` row, see below. Sentry `fatal`, `ORDER_NOTIFICATION_EMAILS`, runbook `docs/runbooks/incident-payments.md` |
| Payment taken outside our flow (provider dashboard, a manual link) | Same sweep; no `metadata.order_id` at all | Flagged for a human. Never auto-refunded — it may be a legitimate manual sale — and never auto-attached to an order |
| Order exists, paid at the provider, still `pending_payment` here (every webhook delivery lost) | Same sweep compares `payments.status` against the provider's record | The sweep replays the provider event through `handleProviderWebhook()` with a synthesised envelope, so it goes through the **same six assertions**. It does not shortcut to `transitionOrder()` |
| Paid, but stock is gone (assertion 6) | Inline, in the webhook transaction | `transitionOrder(→'paid_unfulfillable')`, full `provider.refund()` with `idempotencyKey = order.id`, Sentry, staff email, customer email. Surfaced on `idx_orders_unfulfillable` |

**An orphan refund cannot be a `refunds` row, and pretending otherwise is a `NOT NULL`
violation in a cron at 06:00.** `refunds.payment_id` and `refunds.order_id` are both
`NOT NULL` with FKs to `payments` and `orders`, and the composite FK
`(order_id, market_code, currency_code) → orders` binds the row to an order that by
definition does not exist in this case (02 §2.7). The refund is therefore made
directly against the provider — the provider's own idempotency on
`providerPaymentId` is what stops a second one if the sweep runs twice — and recorded
where a row with no order can live: `audit_logs` (`entity = 'provider_payment'`,
`entity_id = providerPaymentId`, `action = 'orphan_refund'`, the full provider object
in `after`) plus the alert mail. The sweep's own idempotency is a
`SELECT 1 FROM audit_logs WHERE entity = 'provider_payment' AND entity_id = $1 AND action = 'orphan_refund'`
guard before it calls the provider at all. This is the one financial event in the
system that does not produce a `refunds` row, and it is called out here so nobody
"fixes" it by making `refunds.order_id` nullable — which would make the composite FK
droppable and re-open the mixed-currency refund the constraint exists to prevent.

The reconciliation sweep is the net under every assumption in §4.3, and it is the
reason `/api/cron/reconcile-payments` is not optional infrastructure.

---

## 5. Orders

### 5.1 Creation is one transaction

`createOrderFromCart(input)` — signature fixed in 01 §2.3 — runs entirely inside
phase B of §3.6. The full statement list is 02 §5.3's "Checkout" row and is not
repeated. **It gains one step** (`15 §2.4`): immediately after the counters on
`customers` are written, the same transaction calls **`resolveCustomerGroup()`** —
one `UPDATE` against one row by primary key — and writes
`customers.first_order_at = COALESCE(first_order_at, now())` in the same statement
pair. It must not be deferred to a job: a group resolved from counters that were
then rolled back is a group nobody can explain, and a customer who crossed the
trade threshold on this order would otherwise be quoted retail on their next page
view with no error anywhere. Three properties are worth restating because they are
the ones a refactor breaks:

- **The order-number lock is the last thing taken and the first thing released.**
  `SELECT … FOR UPDATE` on `order_counters` serialises every order in a market for the
  remainder of the transaction. No network call may occur after it (02 §2.7).
- **`idx_orders_idempotency_key` is what makes retry safe.** A second call with the
  same key hits the unique constraint; `createOrderFromCart()` catches `23505` on that
  index specifically and returns the existing order as a success, not an error.
- **`resolveCustomerGroup()` is inside, not after.** It is a pure function of the
  counters this transaction just wrote, so it is correct only where they are
  durable and only where a rollback takes it with them.

### 5.2 Order number scheme

```ts
// src/lib/orders/orderNumber.ts
export function formatOrderNumber(prefix: string, value: bigint): string {
  return `${prefix}-${value.toString().padStart(6, '0')}`;   // MD-US-000173
}
```

Allocated from `order_counters` (PK `market_code`, `prefix`, `next_value`) under the
row lock, gapless per market, never a Postgres `SEQUENCE` — sequences leave gaps on
rollback and an Indian GST invoice series must be consecutive (02 §2.7). Seed sets
`next_value = 1` and prefixes `MD-US` / `MD-IN`.

The number is customer-facing and is never the primary key; `/orders/[token]` is
keyed by `orders.public_token_hash` so a guest confirmation URL is not guessable from
an order number.

> **NEEDS INPUT:** restated from 02 §2.7 because it blocks the India launch, not the
> build — the GST invoice series format, the financial-year reset rule, and whether
> the order number and the tax invoice number may be the same identifier. Until
> answered, `prefix` is a placeholder and there is no year segment; adding one is a
> change to `formatOrderNumber` and a counter reset job, not to the schema.

### 5.3 The status model

The requirement lists eleven states. They are not one dimension, and modelling them
as one is the mistake this schema already avoids: "refunded" and "shipped" are
independent facts about the same order, and a single column forces a choice between
them. 02 §1.9 defines **three orthogonal columns** plus `shipments.status`, and this
section uses them verbatim.

| Requested state | Where it lives | Exact value |
| --- | --- | --- |
| pending | `orders.status` | `pending_payment` |
| payment pending | `orders.status` + `orders.payment_status` | `pending_payment` + `unpaid` (or `authorized`) |
| paid | `orders.status` / `payment_status` | `paid` / `paid` |
| processing | `orders.status` | `processing` |
| **packed** | `shipments.status` | `label_created` — see below |
| shipped | `orders.fulfillment_status` + `shipments.status` | `partially_fulfilled` \| `fulfilled` + `in_transit` |
| delivered | `shipments.status` (+ `shipments.delivered_at`) | `delivered`; `orders.status` → `completed` when every shipment is delivered |
| cancelled | `orders.status` | `cancelled` |
| refunded | `orders.payment_status` | `refunded` |
| partially refunded | `orders.payment_status` | `partially_refunded` |
| returned | `orders.fulfillment_status` | `returned` \| `partially_returned` |
| (paid, stock gone) | `orders.status` | `paid_unfulfillable` — no requested name, but a real state (01 §2.5) |
| (paid, held for fraud review) | `orders.status` | `pending_review` — no requested name either, and a launch blocker: 09 R23 |

**"Packed" maps to `label_created` rather than getting its own enum value.** At this
operation's scale a piece is packed and labelled in one action at one bench; a
separate `packed` state would be a button someone has to remember to press and would
be wrong within a week. If the client's workflow genuinely separates them, the
extension is one migration line —
`ALTER TYPE shipment_status ADD VALUE 'packed' BEFORE 'label_created';` — plus a
transition row. That is recorded so it is not rediscovered as a redesign.

#### `orders.status` gains a seventh value: `pending_review`

**DECISION ADDED.** 02 §1.9 defines six `order_status` values and this section's
transition table had no manual-hold state — while 09 R23 makes "orders above the
client's high-value threshold held in `pending_review` for manual release rather
than auto-fulfilled" a mitigation, calls it explicitly "an `orders` status
transition, not a new table", and 09 §5.1 makes it a hard launch blocker. The
blocker was not satisfiable as written, because the value did not exist. It does
now, in its own migration ahead of the one that uses it:

```sql
ALTER TYPE order_status ADD VALUE 'pending_review' AFTER 'paid';
```

| Value | Meaning |
| --- | --- |
| `pending_payment` | Order written, no verified payment yet |
| `paid` | A verified webhook moved it; stock committed |
| **`pending_review`** | **Paid, and held for manual fraud review.** Money settled, stock committed, fulfilment held |
| `paid_unfulfillable` | Paid, stock could not be re-secured; auto-refunded (§4.5) |
| `processing` | Released for fulfilment |
| `completed` | Every shipment delivered (terminal) |
| `cancelled` | Terminal |

**`orders.status` transitions**, enforced by `transitionOrder()` in
`src/lib/orders/stateMachine.ts` and asserted exhaustively by
`tests/unit/order-state-machine.test.ts`. Two rows are new and marked:

| From | To |
| --- | --- |
| `pending_payment` | `paid`, **`pending_review`**, `paid_unfulfillable`, `cancelled` |
| `paid` | `processing`, **`pending_review`**, `cancelled` |
| **`pending_review`** | **`processing`, `cancelled`** |
| `paid_unfulfillable` | `cancelled`, `processing` (only after stock is re-secured by hand) |
| `processing` | `completed`, `cancelled` |
| `completed` | — (terminal) |
| `cancelled` | — (terminal) |

`completed` and `cancelled` are terminal; refunds and returns move
`payment_status` and `fulfillment_status`, never `status`.

`paid → pending_review` exists as well as `pending_payment → pending_review`
because a hold can be applied by a human after the fact — a chargeback alert on a
sibling order, a courier flagging the address — not only by the threshold at
webhook time.

#### Entering the hold: the webhook decides, not a job

The hold is applied **inside the §4.3 webhook transaction**, at step 8, and it is
a choice of target status rather than an extra step:

```
target = order.total_minor >= settings['security.high_value_review_threshold'](order.currency_code)
         ? 'pending_review'
         : 'paid'
transitionOrder(order.id, target, { type: 'webhook' })
```

Everything else about that transaction is identical for both targets:
`payment_status = 'paid'`, `paid_at = now()`, `commitStock()` runs, the
`send_email` job is enqueued, `payment_events` and `order_events` are written.
**The money and the stock are settled; only fulfilment is held.** Holding stock
instead — leaving the reservation uncommitted while a human looks at the order —
would put a one-of-a-kind piece back on sale under a customer who has already
paid for it, which is the failure this whole document exists to prevent.

`settings['security.high_value_review_threshold']` is `value_type = 'money'` and
therefore per-currency: one figure in USD and its own independent figure in INR,
never a converted one (hard rule 2). **It is seeded `NULL`, which means no hold** —
`NULL >= anything` is unknown, so the comparison is written
`threshold IS NOT NULL AND order.total_minor >= threshold`, and the seeded state
of the system is "every paid order goes straight to `paid`".

> **NEEDS INPUT:** the high-value manual-review threshold, per market — the figure
> above which a paid order is held rather than released for fulfilment. 09 §5.1
> makes "set to a figure the client named in writing" a hard launch blocker. It is
> seeded `NULL` and no number is invented here; a wrong number is worse than none,
> because it either holds every order or holds none while looking as though it
> works.

#### Releasing the hold: `order.update`, and deliberately not `order.fulfil`

`releaseOrderHold(actor, orderId, note)` in `src/lib/orders/` requires
`requirePermission(actor, 'order.update')` — **not `order.fulfil`**. That is the
load-bearing detail. `order.fulfil` is held by `inventory_manager` (07 §2.5), who
is the person standing at the packing bench: the role that would most like the
hold to go away is exactly the role that must not be able to remove it.
`order.update` is `owner`, `admin`, `order_manager`.

One transaction: `SELECT … FOR UPDATE` on the order, assert
`status = 'pending_review'`, `transitionOrder(orderId, 'processing', actor)`, an
`order_events` row of type `status_changed` with `is_customer_visible = false`
and the reviewer's note in `message`, and `recordAudit()` naming the actor, the
order and the order total. Rejecting instead is `cancelOrder()`, which already
exists and already refunds and releases.

**`createShipment()` refuses unless `orders.status IN ('paid','processing')`.**
This is the guard that makes the hold real rather than advisory: without it, a
held order is one `/admin/orders/[id]` "Create shipment" click away from being
picked, because nothing else in the fulfilment path reads `orders.status`. The
check is the first statement of `createShipment()` in `src/lib/orders/`, throws
`IllegalTransitionError`, and is covered by
`tests/integration/pending-review-hold.test.ts`, which holds an order, attempts a
shipment as `inventory_manager`, asserts `ILLEGAL_TRANSITION`, attempts a release
as `inventory_manager`, asserts `FORBIDDEN`, then releases as `order_manager` and
asserts the shipment succeeds.

#### The release queue

`/admin/orders?status=pending_review` is the queue — it is a saved view over the
existing order list, not a new screen, because an order on hold is an order and
everything the reviewer needs (customer, address, payment, prior orders) is
already on `/admin/orders/[id]`. Three things make it operable:

| Element | Specification |
| --- | --- |
| The list | `filters: { status: ['pending_review'] }`, `sort: total_minor:desc` — both whitelisted fields (11 §8.5), served by `idx_orders_market_total (market_code, total_minor DESC, id DESC)` (11 §8.11). It is a **built-in filter preset** on the orders screen, named "Awaiting review", not a seeded `saved_views` row — a saved view belongs to the user who made it, and a queue nobody can delete by accident is the point. Reaching it needs `order.read`, like every other order list |
| The badge | `/admin` and the orders nav item carry a count of `status = 'pending_review'`, scoped to the markets the viewer can see. A hold nobody notices is a hold that becomes a cancelled order two days later |
| The alert | Entering `pending_review` sends one internal mail to `ORDER_NOTIFICATION_EMAILS` (the same list §4.5 uses) with the order number and total, enqueued as the same `send_email` job kind. The customer is **not** told their order is under review — the confirmation email they receive is the ordinary one, because the order *is* paid and the hold is our operational step, not their problem, unless it ends in a cancellation |

**What the customer sees while an order is held:** the ordinary paid confirmation
and, on `/orders/[token]`, "Confirmed — preparing your order." `order_events`
rows for the hold and its release are `is_customer_visible = false`. If the review
ends in a cancellation, that *is* customer-visible and carries the refund.

**Extensibility, restated now that it has been exercised.** Adding a state is
`ALTER TYPE … ADD VALUE` in its own migration, plus a row in the transition table
above, plus a case in `tests/unit/order-state-machine.test.ts` — which is exactly
what `pending_review` cost. Nothing branches on a status string outside
`src/lib/orders/stateMachine.ts` and the admin label map in
`src/lib/orders/labels.ts`, so the compiler and the `no-restricted-syntax` rule
find every site that needs the new case.

> **RESOLVED — was CHANGE REQUIRED IN 02 §1.9 and §2.7:**
> *Applied. The change now lives in 02 §1.9 — order_status is seven values including pending_review.*
> `order_status` is seven values, and the
> transition table in §2.7 gains the three `pending_review` rows above.
> **RESOLVED — was CHANGE REQUIRED IN 09 §3 R23 and §5.1:** the mitigation and the launch blocker
> *Verified applied in 09.*
> can now cite this section and the settings key
> `security.high_value_review_threshold`; R23's "this is an `orders` status
> transition, not a new table" is correct and is what was built.

**Derived statuses are recomputed, never set by hand.** After any shipment, return or
refund write, the same transaction calls:

```ts
recomputeFulfillmentStatus(tx, orderId): Promise<fulfillment_status>
// unfulfilled            : Σ fulfilled_quantity = 0
// partially_fulfilled    : 0 < Σ fulfilled_quantity < Σ quantity
// fulfilled              : Σ fulfilled_quantity = Σ quantity
// partially_returned     : 0 < Σ returned_quantity < Σ quantity
// returned               : Σ returned_quantity = Σ quantity   (wins over the above)

recomputePaymentStatus(tx, orderId): Promise<payment_status>
// refunded           : orders.refunded_total_minor = total_minor + gift_card_total_minor
// partially_refunded : 0 < refunded_total_minor < that sum
// paid               : captured in full, nothing refunded
```

That `eslint` `no-restricted-syntax` rule makes a literal comparison against an
order status outside `src/lib/orders/stateMachine.ts` and
`src/lib/orders/labels.ts` an error, so a new value cannot be half-handled — it is
what turned adding `pending_review` into a compile-and-test exercise rather than a
hunt through the admin.

### 5.4 The order timeline

> **SCHEMA ADDITION:** 02 gives `payment_events` (payments only), `audit_logs` (staff
> actions), `inventory_transactions` (stock) and `shipments`/`returns`, but no single
> ordered log of what happened to an order — which is the admin's primary screen and
> the source of the customer-visible tracking narrative. Deriving it as a `UNION ALL`
> over five tables is a four-join query on every order page with no usable index and
> no place to record "confirmation email sent". One append-only table:
>
> ```sql
> CREATE TABLE order_events (
>   id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
>   order_id             UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
>   type                 TEXT NOT NULL,
>   from_value           TEXT NULL,
>   to_value             TEXT NULL,
>   message              TEXT NULL,
>   data                 JSONB NOT NULL DEFAULT '{}'::jsonb,
>   is_customer_visible  BOOLEAN NOT NULL DEFAULT false,
>   actor_type           actor_type NOT NULL,
>   actor_user_id        UUID NULL REFERENCES users(id) ON DELETE SET NULL,
>   payment_event_id     UUID NULL REFERENCES payment_events(id) ON DELETE SET NULL,
>   shipment_id          UUID NULL REFERENCES shipments(id) ON DELETE SET NULL,
>   return_id            UUID NULL REFERENCES returns(id) ON DELETE SET NULL,
>   refund_id            UUID NULL REFERENCES refunds(id) ON DELETE SET NULL,
>   created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
>   CONSTRAINT chk_order_events_type CHECK (type IN (
>     'placed','payment_intent_created','payment_authorized','payment_captured',
>     'payment_failed','status_changed','fulfillment_status_changed',
>     'payment_status_changed','shipment_created','shipment_shipped',
>     'shipment_delivered','return_requested','return_approved','return_received',
>     'refund_succeeded','refund_failed','note_added','email_sent','cancelled',
>     'flagged','reservation_released','draft_converted'))
> );
> CREATE INDEX idx_order_events_order ON order_events (order_id, created_at);
> CREATE INDEX idx_order_events_customer ON order_events (order_id, created_at)
>   WHERE is_customer_visible;
> ```
>
> Append-only, `created_at` only, no `updated_at`, no trigger (02 §1.3). It belongs to
> the **never deleted** class of 02 §1.4. It duplicates information that also lives in
> `payment_events` and `audit_logs`; the duplication is deliberate and one-directional
> — those tables are the record, this is the narrative, and the FK columns tie each
> narrative row back to its record.

`/orders/[token]` and the account order page render
`WHERE is_customer_visible` only. `/admin/orders/[id]` renders everything, with the
staff actor's name.

### 5.5 Immutability: what is snapshotted

`order_items` (02 §2.7) is the answer and its column list is the specification. The
snapshot set, stated as the question each column answers:

| Question | Snapshot column |
| --- | --- |
| What was it called? | `product_title`, `variant_title`, `sku`, `category_path` |
| What did it look like? | `image_url` — a **fully-built, frozen delivery URL**, not a `media_id`, so a Cloudinary preset change cannot alter a five-year-old invoice |
| Where did it link? | `product_slug` |
| What was it made of? | `stones_snapshot`, `materials_snapshot`, `attributes_snapshot` (JSONB) |
| What was it customised with? | `personalisation` |
| What did it cost? | `unit_list_minor`, `unit_final_minor`, `line_subtotal_minor`, `line_discount_minor`, `line_tax_minor`, `line_shipping_minor`, `line_total_minor` |
| In what money? | `currency_code`, `market_code` |
| Why that price? | `price_source`, `metal_rate_minor_per_gram`, `metal_rate_scale`, `discount_breakdown` |
| What tax applied? | `tax_rate_bp`, `tax_code` |

The four trailing FKs — `product_id`, `variant_id`, `price_record_id`,
`metal_rate_id` — are `ON DELETE RESTRICT`, exist for admin navigation, and are
**never read to render a line**. Rendering an order joins `orders` → `order_items` →
`order_addresses` and stops. `tests/integration/order-immutability.test.ts` places an
order, renames the product, swaps its image, deletes a stone link and re-prices both
markets, then asserts the rendered order is byte-identical.

`metal_rate_scale` earns its place: without it the snapshotted rate is an integer of
unknown magnitude, and the claim that the price is reproducible is false the first
time the scale changes.

Mutable columns on an order line are exactly three — `fulfilled_quantity`,
`returned_quantity`, `refunded_minor` — which is why the table carries both
timestamps and the `touch_updated_at` trigger (02 §1.3).

---

## 6. Draft orders and the payment-link seam

**Decision: a draft order is a `carts` row created by staff, not a new pair of
tables.** The fork is real — a dedicated `draft_orders`/`draft_order_items` pair
keeps staff data out of the shopper table — but it costs a second order-creation
codepath, which means a second place to get pricing, reservation, coupon redemption
and the totals identity right. Everything that makes checkout correct lives in
`createOrderFromCart()`; a draft order that does not go through it is a draft order
that can produce a wrong total. Reusing the cart makes staff-placed orders
structurally identical to customer orders.

> **SCHEMA ADDITION:** two nullable columns on `carts` and one index.
>
> ```sql
> ALTER TABLE carts
>   ADD COLUMN created_by_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
>   ADD COLUMN draft_name TEXT NULL;
> CREATE INDEX idx_carts_drafts ON carts (created_by_user_id, updated_at DESC)
>   WHERE created_by_user_id IS NOT NULL AND status = 'active';
> ```
>
> `created_by_user_id IS NOT NULL` **is** the definition of a draft order. It also
> feeds `orders.placed_by_user_id`, which 02 §2.7 already defines as "non-null for a
> staff-placed or impersonated order."

Behaviour differences between a draft and a shopper cart, all enforced in
`src/lib/orders/draft.ts` behind `requirePermission(actor, 'order.create')`:

| Aspect | Draft order |
| --- | --- |
| Admin route | `/admin/orders/drafts`, `/admin/orders/drafts/[id]` |
| Pricing | `resolvePriceBatch()` as usual. Staff may add a **manual line discount**, which enters `evaluateDiscounts()` as a synthetic `DiscountLine` with `source: 'manual'` — not as a value written straight onto the line — so it passes through the §8.3 step 5 clamp and can never exceed the line subtotal or produce a negative total. It requires `requirePermission(actor, 'order.discount_manual')` — row 35 of the 72-key catalogue in 07 §2.3, granted to `owner`, `admin` and `order_manager`, and on `TOTP_REQUIRED_PERMISSIONS` — is capped at `settings` key `orders.manual_discount_max_bp` (seeded **0**, i.e. off until the client sets it), and writes an `audit_logs` row naming the user and the amount. Staff may never type a unit price |
| Customer | An existing `customers` row, or an email that creates a guest customer under the §3.3 rule — a draft may not attach to a credentialled account either |
| Inventory | Nothing is reserved while drafting. Reservation happens in the same `createOrderFromCart()` transaction as any other order, so a draft can fail at conversion with `InsufficientStockError` — correct, because a draft is a quote, not a hold |
| Conversion | `convertDraftToOrder(cartId, { collectPayment })`. With `collectPayment: false` the order is created `pending_payment` with no intent (the store takes payment offline); with `true` it issues a payment link |
| Timeline | `order_events` row `type = 'draft_converted'`, `actor_type = 'staff'` |

**The payment-link seam.** A payment link is a signed URL that drops a customer into
`/checkout/payment` for a cart or an order that staff prepared. The table ships now
so the URL shape and the token-hash discipline are fixed; the feature stays behind
`settings` key `feature.payment_links_enabled = false`.

> **SCHEMA ADDITION:**
>
> ```sql
> CREATE TABLE payment_links (
>   id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
>   cart_id            UUID NULL REFERENCES carts(id)  ON DELETE CASCADE,
>   order_id           UUID NULL REFERENCES orders(id) ON DELETE RESTRICT,
>   token_hash         BYTEA NOT NULL,
>   market_code        CHAR(2) NOT NULL,
>   currency_code      CHAR(3) NOT NULL,
>   amount_minor       BIGINT NULL,
>   status             TEXT NOT NULL DEFAULT 'active',
>   sent_to_email      TEXT NULL,
>   sent_at            TIMESTAMPTZ NULL,
>   used_at            TIMESTAMPTZ NULL,
>   expires_at         TIMESTAMPTZ NOT NULL,
>   created_by_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
>   created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
>   updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
>   CONSTRAINT chk_payment_links_ref    CHECK (num_nonnulls(cart_id, order_id) = 1),
>   CONSTRAINT chk_payment_links_status CHECK (status IN ('active','used','expired','cancelled')),
>   CONSTRAINT chk_payment_links_amount CHECK (amount_minor IS NULL OR amount_minor > 0),
>   CONSTRAINT fk_payment_links_market
>     FOREIGN KEY (market_code, currency_code) REFERENCES markets (code, currency_code)
>     ON DELETE RESTRICT ON UPDATE RESTRICT
> );
> CREATE UNIQUE INDEX uq_payment_links_token ON payment_links (token_hash);
> CREATE INDEX idx_payment_links_open ON payment_links (expires_at) WHERE status = 'active';
> CREATE TRIGGER trg_payment_links_touch BEFORE UPDATE ON payment_links
>   FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
> ```
>
> Route `/pay/[token]`, `no-store`, `noindex`; the token is 32 random bytes and only
> its SHA-256 is stored, exactly like `carts.token_hash` and
> `orders.public_token_hash`. `amount_minor` is nullable because a cart-backed link
> is priced at open, not at creation — which is what stops a link from becoming a
> frozen price a merchant forgot about.

> **NEEDS INPUT:** whether staff-placed orders are in scope for launch, and if so
> whether offline payment (bank transfer, in-person card) must be recordable against
> an order. Recording an offline payment means a `payments` row with a `provider_key`
> that is not an acquirer, which is the one place the payment model would need a
> deliberate decision rather than a default.

---

## 7. Shipping

02 defines `shipments` (what physically went out) but no rate configuration — an
order snapshots `shipping_method_code`, `shipping_method_label` and
`shipping_total_minor` and deliberately holds no FK to a method, so history survives a
rate change. The configuration side is missing and is added here.

> **SCHEMA ADDITION:** four tables in `prisma/schema/commerce.prisma`. They follow
> every 02 convention: money as `BIGINT` minor units paired with `currency_code`,
> composite FK to `markets (code, currency_code)`, partial unique indexes on live
> rows, explicit `CHECK` for small `TEXT` value sets (02 §1.9).
>
> ```sql
> CREATE TABLE shipping_zones (
>   id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
>   market_code CHAR(2) NOT NULL REFERENCES markets(code) ON DELETE RESTRICT,
>   name        TEXT NOT NULL,
>   rank        INTEGER NOT NULL DEFAULT 0,
>   is_active   BOOLEAN NOT NULL DEFAULT true,
>   deleted_at  TIMESTAMPTZ NULL,
>   created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
>   updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
> );
> CREATE UNIQUE INDEX idx_shipping_zones_name_live
>   ON shipping_zones (market_code, lower(name)) WHERE deleted_at IS NULL;
> CREATE UNIQUE INDEX uq_shipping_zones_id_market ON shipping_zones (id, market_code);
> CREATE INDEX idx_shipping_zones_market ON shipping_zones (market_code, rank)
>   WHERE is_active AND deleted_at IS NULL;
>
> CREATE TABLE shipping_zone_rules (
>   id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
>   zone_id       UUID NOT NULL REFERENCES shipping_zones(id) ON DELETE CASCADE,
>   match_type    TEXT NOT NULL,
>   country_code  CHAR(2) NOT NULL,
>   region        TEXT NULL,
>   postal_prefix TEXT NULL,
>   postal_from   TEXT NULL,
>   postal_to     TEXT NULL,
>   is_exclusion  BOOLEAN NOT NULL DEFAULT false,
>   created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
>   CONSTRAINT chk_szr_match_type CHECK (match_type IN ('country','region','postal_prefix','postal_range')),
>   CONSTRAINT chk_szr_shape CHECK (
>     (match_type = 'country'       AND region IS NULL AND postal_prefix IS NULL AND postal_from IS NULL)
>  OR (match_type = 'region'        AND region IS NOT NULL)
>  OR (match_type = 'postal_prefix' AND postal_prefix IS NOT NULL)
>  OR (match_type = 'postal_range'  AND postal_from IS NOT NULL AND postal_to IS NOT NULL)),
>   CONSTRAINT chk_szr_country_upper CHECK (country_code = upper(country_code))
> );
> CREATE INDEX idx_szr_lookup ON shipping_zone_rules (country_code, region);
> CREATE INDEX idx_szr_zone   ON shipping_zone_rules (zone_id);
>
> CREATE TABLE shipping_methods (
>   id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
>   zone_id           UUID NOT NULL,
>   market_code       CHAR(2) NOT NULL,
>   code              TEXT NOT NULL,
>   label             TEXT NOT NULL,
>   description       TEXT NULL,
>   carrier           TEXT NULL,
>   service_level     TEXT NULL,
>   rate_strategy     TEXT NOT NULL,
>   min_transit_days  SMALLINT NULL,
>   max_transit_days  SMALLINT NULL,
>   requires_signature BOOLEAN NOT NULL DEFAULT false,
>   is_insured        BOOLEAN NOT NULL DEFAULT false,
>   is_active         BOOLEAN NOT NULL DEFAULT true,
>   rank              INTEGER NOT NULL DEFAULT 0,
>   version           INTEGER NOT NULL DEFAULT 0,
>   deleted_at        TIMESTAMPTZ NULL,
>   created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
>   updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
>   CONSTRAINT fk_shipping_methods_zone
>     FOREIGN KEY (zone_id, market_code) REFERENCES shipping_zones (id, market_code)
>     ON DELETE RESTRICT ON UPDATE RESTRICT,
>   CONSTRAINT chk_shipping_methods_strategy
>     CHECK (rate_strategy IN ('flat','by_order_value','by_weight','free')),
>   CONSTRAINT chk_shipping_methods_transit
>     CHECK (max_transit_days IS NULL OR min_transit_days IS NULL OR max_transit_days >= min_transit_days)
> );
> CREATE UNIQUE INDEX idx_shipping_methods_code_live
>   ON shipping_methods (zone_id, upper(code)) WHERE deleted_at IS NULL;
> CREATE UNIQUE INDEX uq_shipping_methods_id_market ON shipping_methods (id, market_code);
> CREATE INDEX idx_shipping_methods_zone ON shipping_methods (zone_id, rank)
>   WHERE is_active AND deleted_at IS NULL;
>
> CREATE TABLE shipping_rates (
>   id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
>   method_id         UUID NOT NULL,
>   market_code       CHAR(2) NOT NULL,
>   currency_code     CHAR(3) NOT NULL,
>   min_value_minor   BIGINT NOT NULL DEFAULT 0,
>   max_value_minor   BIGINT NULL,
>   min_weight_grams  NUMERIC(10,3) NULL,
>   max_weight_grams  NUMERIC(10,3) NULL,
>   amount_minor      BIGINT NOT NULL,
>   free_over_minor   BIGINT NULL,
>   created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
>   updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
>   CONSTRAINT fk_shipping_rates_method
>     FOREIGN KEY (method_id, market_code) REFERENCES shipping_methods (id, market_code)
>     ON DELETE CASCADE ON UPDATE RESTRICT,
>   CONSTRAINT fk_shipping_rates_market
>     FOREIGN KEY (market_code, currency_code) REFERENCES markets (code, currency_code)
>     ON DELETE RESTRICT ON UPDATE RESTRICT,
>   CONSTRAINT chk_shipping_rates_amount   CHECK (amount_minor >= 0 AND min_value_minor >= 0),
>   CONSTRAINT chk_shipping_rates_band     CHECK (max_value_minor IS NULL OR max_value_minor > min_value_minor),
>   CONSTRAINT chk_shipping_rates_weight   CHECK (max_weight_grams IS NULL OR min_weight_grams IS NULL
>                                                 OR max_weight_grams > min_weight_grams),
>   CONSTRAINT chk_shipping_rates_free_over CHECK (free_over_minor IS NULL OR free_over_minor > 0),
>   CONSTRAINT ex_shipping_rates_no_overlap
>     EXCLUDE USING gist (
>       method_id WITH =, currency_code WITH =,
>       int8range(min_value_minor, coalesce(max_value_minor, 9223372036854775807)) WITH &&,
>       numrange(coalesce(min_weight_grams, 0),
>                coalesce(max_weight_grams, 999999999), '[)') WITH &&)
> );
> CREATE INDEX idx_shipping_rates_method ON shipping_rates (method_id, currency_code, min_value_minor);
> ```
>
> The `EXCLUDE` constraint needs `CREATE EXTENSION IF NOT EXISTS btree_gist;` in the
> same migration. It is the point of the table: overlapping order-value bands are the
> classic way a merchant silently makes a method quote two different prices, and
> whichever the query planner returns first becomes the price. The database refuses
> the overlap at configuration time, on the admin's screen, instead of producing an
> inconsistent quote months later.
>
> **The weight range is part of the exclusion key, and without it `rate_strategy =
> 'by_weight'` cannot be configured at all.** A weight-banded method prices on grams,
> not on order value, so every one of its rows carries `min_value_minor = 0` and
> `max_value_minor = NULL` — identical `int8range`s. Under a value-only exclusion the
> *second* band is refused: an admin enters "Insured courier — 0–50 g, $18" and then
> "Insured courier — 50–200 g, $34" and the database rejects the second row with a
> constraint violation the admin screen can only render as "this rate overlaps an
> existing one," which is both true and useless. Two dimensions in the key means two
> rows overlap only when they overlap in **both** value and weight, which is exactly
> when they are genuinely ambiguous. `'[)'` makes the bands half-open so 50 g belongs
> to the second band and not to both. The finite upper sentinel (999,999,999 g) rather
> than `'Infinity'::numeric` keeps the column's `NUMERIC(10,3)` domain intact.

**Per-market configuration** is the `market_code` on `shipping_zones` and the
composite FK chain down to `shipping_rates`. A USD amount cannot be attached to the
India market, by constraint, exactly as for `prices` and `coupon_amounts`.

**Free-shipping thresholds, two mechanisms, both currency-safe:**

1. `shipping_rates.free_over_minor` — per method, per currency. The precise tool.
2. `settings` key `shipping.free_threshold`, `value_type = 'money'`, market-scoped
   (02 §2.8) — the store-wide threshold the client will actually ask for. Seeded
   **unset**, which means no free shipping, not free shipping at zero.

Whichever fires first wins; both are evaluated against
`subtotal_minor - discount_total_minor`, i.e. **after** discounts, so a coupon cannot
be used to cross a free-shipping line the merchant did not intend. That is a policy
choice and it is stated in the admin help text next to the field.

### 7.1 Computing and locking a quote

```ts
// src/lib/shipping/quote.ts — the only shipping authority
export async function quoteShipping(input: {
  marketCode: MarketCode;
  currencyCode: CurrencyCode;
  destination: { countryCode: string; region: string | null; postalCode: string | null };
  lines: { variantId: string; quantity: number; weightGrams: string | null }[];
  merchandiseSubtotalMinor: bigint;   // after line discounts, before tax
  at?: Date;
}): Promise<ShippingQuote[]>;

export type ShippingQuote = {
  methodId: string;
  code: string;                      // → orders.shipping_method_code
  label: string;                     // → orders.shipping_method_label
  description: string | null;
  amountMinor: bigint;               // → orders.shipping_total_minor
  currencyCode: CurrencyCode;
  isFree: boolean;
  freeReason: 'rate_free_over' | 'settings_threshold' | 'method_free' | null;
  estimatedDays: { min: number | null; max: number | null };
  requiresSignature: boolean;
};
```

Algorithm, entirely server-side:

1. **Resolve the zone.** One query, not a scan: the postal code is expanded in the
   application into its own prefixes (`90210` → `9`, `90`, `902`, `9021`, `90210`;
   at most six values), and the rules are fetched with
   `WHERE szr.country_code = $1 AND (szr.region = $2 OR szr.region IS NULL)
   AND (szr.postal_prefix IS NULL OR szr.postal_prefix = ANY($3::text[]))`
   joined to `shipping_zones` on `market_code = $4 AND is_active AND deleted_at IS NULL`,
   served by `idx_szr_lookup (country_code, region)`. `postal_range` rows are matched
   in the same pass with `postal_from <= $5 AND postal_to >= $5` on the normalised
   code. Candidates are then ranked most specific first: `postal_range` →
   `postal_prefix` (longest prefix wins) → `region` → `country`. Any matching rule
   with `is_exclusion = true` disqualifies that zone outright. Ties between zones
   break on `shipping_zones.rank` ASC. No match → `[]`, and the address step shows
   `checkout.address.country_unsupported`.
2. **List active methods** in the zone, `rank` ASC.
3. **Select one rate per method**: the `shipping_rates` row for the cart's currency
   whose `int8range` band contains `merchandiseSubtotalMinor` and, for `by_weight`,
   whose weight band contains the summed `variant_materials.weight_grams`. No row for
   the cart's currency → the method is **not offered**, never converted (01 §2.6).
4. **Apply free rules** (`rate_strategy = 'free'`, `free_over_minor`, then the
   `settings` threshold).
5. **Apply a free-shipping discount** if one is active (§8.4) — it sets
   `amountMinor = 0` and `freeReason = null` with the discount recorded separately, so
   the invoice shows a shipping charge and a shipping discount rather than pretending
   shipping was free.
6. Return sorted by `amountMinor` ASC then `rank`.

**No carrier-rate API at launch.** Live rates from a carrier would be more accurate
and would add a synchronous third-party call to the checkout critical path, with a
timeout, a fallback table that then must exist anyway, and a per-quote cost. Table
rates are configured once and never fail. The seam is `quoteShipping()` itself: a
carrier provider becomes an implementation behind it.

**Locking.** The chosen quote is written to `checkout_sessions` (`shipping_method_id`,
`shipping_method_code`, `shipping_method_label`, `shipping_amount_minor`,
`shipping_quoted_at`) by the server. It is re-quoted in phase A of `placeOrder`
(§3.6 step 4); a changed amount drops the session to `delivery` with
`checkout.shipping.changed`: "Shipping options changed for your address. Please
choose again." At order creation the amount is snapshotted onto
`orders.shipping_total_minor`, allocated to lines as `line_shipping_minor` by
`allocate()` weighted by `line_subtotal_minor - line_discount_minor`, and the method
is recorded as `code` + `label` **text**, never an FK — a renamed or deleted method
must not alter a shipped order.

> **NEEDS INPUT:** carriers, real rates, insurance policy for high-value jewellery,
> whether signature-on-delivery is mandatory above a value, and the India serviceable
> PIN-code policy. Seed ships **zero** `shipping_zones` rows: with no zone, no method
> is offered and checkout says so plainly rather than quoting an invented price. No
> rate, transit time or carrier is invented (hard rule 8).

---

## 8. Discounts and gift cards

### 8.1 Types, and the requirement's vocabulary mapped to the schema

The requirement names seven "types." 02 §1.9 has a three-value `discount_type`,
because only three things a discount can *do* differ arithmetically; everything else
is *scope* or *condition*. The mapping is exact and no new enum value is needed:

| Requirement | Schema |
| --- | --- |
| Percentage | `coupons.type = 'percentage'`, `value_bp INTEGER` (basis points; `1750` = 17.5%) |
| Fixed amount | `coupons.type = 'fixed_amount'` + one `coupon_amounts (coupon_id, currency_code, amount_minor)` row per currency. **No row for the cart's currency ⇒ inapplicable in that market**, never converted (01 §2.6) |
| Free shipping | `coupons.type = 'free_shipping'` |
| Product-scoped | `coupons.applies_to = 'line'` + `coupon_conditions (type='product', operator='include', target_id)` |
| Collection-scoped | `coupon_conditions (type='collection', …)`; also `type='category'` |
| Customer-scoped | `coupon_conditions (type='customer_group', target_id)` and `type='first_order_only'` |
| Market-scoped | `coupon_conditions (type='market', market_code)` |

`applies_to` (`order` | `line`) decides whether the computed amount reduces the order
total or specific lines; `operator` (`include` | `exclude`) on each condition decides
whether the target set is a whitelist or a blacklist. `trigger` (`code` |
`automatic`) decides whether a customer types it.

### 8.2 Conditions

| `coupon_condition_type` | Evaluated against |
| --- | --- |
| `min_subtotal` | `coupon_amounts.min_subtotal_minor` for the cart's currency, or the per-condition `value_minor` + `currency_code`. Compared against merchandise subtotal after line-level discounts, before shipping and tax |
| `product` / `category` / `collection` | The line's variant's product membership, resolved live at evaluation |
| `customer_group` | `customers.customer_group_id`. A guest is the default group |
| `first_order_only` | `customers.total_orders_count = 0` **and** no prior `orders` row with the same `lower(email)` — the counter alone is gameable with a fresh guest row |
| `market` | `coupon_conditions.market_code = carts.market_code` |
| `excludes_discounted` | Line's `unit_final_minor < unit_list_minor` disqualifies that line |

Minimum quantity is not a `coupon_condition_type` value and does not need one: it is
`min_subtotal` for money and, for unit counts, a `product`/`collection` condition
combined with the line-quantity check inside `evaluateDiscounts()`. If the client
requires a literal "buy 3" rule, it is one `ALTER TYPE … ADD VALUE 'min_quantity'`
plus one branch — recorded here so the extension path is known.

Date range is `coupons.starts_at` / `ends_at`, both nullable, both compared against
the single `at` timestamp passed through the whole evaluation (01 §2.2 bans
`new Date()` inside pricing).

### 8.3 Evaluation and stacking order — the exact sequence

`evaluateDiscounts(input): Promise<DiscountResult>` in
`src/lib/discounts/evaluate.ts`. The order is fixed, deterministic, and the same at
cart read, at checkout and at order creation — three places that must agree to the
minor unit or `chk_orders_total` rejects the order.

```
0.  Product-level and customer-group adjustments (pricing_rules) are ALREADY folded
    into ResolvedPrice.unitFinalMinor by src/lib/pricing/. They are not coupons and
    are not re-applied here. Line subtotal = unitFinalMinor × quantity.

1.  Candidate set:
      • every coupons row WHERE trigger='automatic' AND is_active AND deleted_at IS NULL
        AND (starts_at IS NULL OR starts_at <= at) AND (ends_at IS NULL OR ends_at > at)
        — served by idx_coupons_automatic
      • plus the single code in carts.coupon_code, if any, looked up on
        idx_coupons_code_live (case-insensitive)

2.  Filter: every coupon_conditions row must pass, and for fixed_amount a
    coupon_amounts row for the cart's currency must exist. Failures are collected
    with a reason, not silently dropped — the cart shows why a typed code did nothing.

3.  Sort: coupons.priority ASC, then trigger ('automatic' before 'code'),
    then created_at ASC. Deterministic, and the merchant controls it.

4.  Apply in order, maintaining applied[]:
      • skip a candidate if applied[] is non-empty and either the candidate or any
        applied coupon has is_stackable = false
      • 'line'  → amount computed per eligible line, on that line's subtotal
      • 'order' → amount computed on Σ eligible line subtotals, then spread across
        those lines with allocate() (02 §1.10)
      • percentage → applyBp(base, value_bp), half-up, ONE rounding on the line total
      • fixed_amount → coupon_amounts.amount_minor for this currency, capped at the
        eligible base so a discount can never exceed what it discounts
      • free_shipping → recorded, applied in step 6

5.  Clamp: Σ line discounts ≤ Σ line subtotals. A negative merchandise total is
    unrepresentable (chk_orders_total plus every CHECK (*_minor >= 0)).

6.  Shipping: evaluateDiscounts() does NOT call quoteShipping(). It returns the
    free_shipping DiscountLine with amountMinor = 0 and a flag; the CALLER
    (placeOrder phase A step 4, or the cart view) runs quoteShipping() with
    merchandiseSubtotalMinor = Σ(line_subtotal) − Σ(line_discount) from step 5,
    then sets that DiscountLine's amountMinor to the quoted shipping amount and
    zeroes the charge. One direction of dependency, one call, no cycle.

7.  Tax: computed on (line_subtotal_minor - line_discount_minor) per line, allocated
    by allocate(), never recomputed per line from tax_rate_bp (02 §1.10 rule 4).
    In a tax-INCLUSIVE market this step EXTRACTS rather than adds — see below.

8.  Gift cards: applied LAST, after tax, as tender — not a discount. They reduce
    orders.gift_card_total_minor and therefore total_minor; they never reduce
    subtotal, never affect tax, and never affect a free-shipping threshold.
```

**Step 7 in a tax-inclusive market, stated exactly, because the additive identity
breaks otherwise.** `markets.prices_include_tax` (02 §2.1) is `false` for US and is a
client decision for India (04 §8.5). When it is `true`, `prices.list_minor` is the
**gross** figure and `chk_orders_total: total_minor = subtotal_minor −
discount_total_minor + shipping_total_minor + tax_total_minor −
gift_card_total_minor` would add GST a second time to a price that already contains
it — a 3% overcharge on every Indian order, arithmetically invisible because every
number is a well-formed integer. 04 §8.5 settles the direction (store net, extract
tax), and this section settles the granularity, which 04 leaves at "one rounding, on
the order total":

> **Extraction is per unit, not per order.** 02 §2.7 enforces
> `chk_order_items_subtotal: line_subtotal_minor = unit_final_minor * quantity`. A
> single rounding on the order total produces a net line amount that is not generally
> divisible by the quantity — three units at ₹999.99 gross under 3% GST give a net
> line of 291,259 minor units, which is not 3 × anything — so the order **fails the
> insert** and the checkout errors. The rule is therefore:
>
> ```
> unitTaxMinor   = roundHalfUp(unitGrossMinor * rateBp / (10000 + rateBp))
> unitFinalMinor = unitGrossMinor − unitTaxMinor          // stored net, on the line
> lineSubtotal   = unitFinalMinor × quantity              // chk_order_items_subtotal ✓
> lineTaxMinor   = lineGrossTotal − (lineSubtotal − lineDiscount + lineShipping)
> taxTotalMinor  = Σ lineTaxMinor                         // header = Σ lines ✓
> ```
>
> Deriving `lineTaxMinor` as the **residual** rather than as its own rounded
> percentage is what makes `chk_order_items_total` hold by construction and what
> guarantees the customer is charged the gross figure they were shown, to the minor
> unit, with no allocation drift to explain. Discounts are computed on the gross —
> "10% off ₹1,00,000" must take off ₹10,000, not ₹9,709 — and their tax component
> falls out of the same residual.

Every `*_minor` column on `orders` and `order_items` is net of tax in an inclusive
market; `tax_total_minor` / `line_tax_minor` carry the extracted tax; and
`total_minor` is the gross the customer pays, because the identity adds the tax back.
`tests/integration/tax-inclusive-order.test.ts` places a three-unit INR order at a
price chosen to be indivisible and asserts both CHECK constraints and
`total_minor = quoted gross`.

> **NEEDS INPUT:** whether displayed INR prices are GST-inclusive — carried forward
> from 04 §8.5 and 01 §4.4, not re-decided here. It sets `markets.prices_include_tax`
> for `IN`. The arithmetic above is inert while the flag is `false`.

**The automatic-candidate set is capped.** `evaluateDiscounts()` evaluates at most
`AUTOMATIC_DISCOUNT_MAX = 50` automatic coupons, taken in `priority` ASC order from
`idx_coupons_automatic`, and logs a `discounts.candidate_cap_hit` warning past that.
The partial index keeps the *scan* small; nothing else keeps the per-cart condition
evaluation bounded, and this runs on every cart read.

**Only one typed code per cart.** `carts.coupon_code` is a single `TEXT` column and
that is a decision, not a limitation of the schema. Multiple simultaneous typed codes
multiply the stacking permutations a merchant must reason about, and the support
burden ("why didn't my second code work") exceeds the revenue. Automatic discounts
stack with the typed code when both are `is_stackable`.

**No "best discount wins" search.** The alternative — trying every subset and
choosing the cheapest total for the customer — is friendlier and non-deterministic
from the merchant's point of view, is exponential in the candidate count, and makes
"why was this order discounted 22%" unanswerable. Deterministic priority order is
auditable, and `discount_breakdown` on each `order_items` row records exactly which
coupons applied, in which order, for how much.

### 8.4 What the customer sees

`DiscountResult.lines: DiscountLine[]` — `{ couponId, code, label, appliesTo, amountMinor, currencyCode }` —
is snapshotted to `order_items.discount_breakdown` (JSONB) and summed into
`orders.discount_total_minor`. The label shown is `coupons.customer_label`, falling
back to `coupons.name`. A rejected code returns a reason key, not silence:

| Reason | `cart.coupon.*` default copy |
| --- | --- |
| not found / inactive / deleted | `invalid`: "We don't recognise the code {code}." |
| expired or not yet started | `expired`: "The code {code} has expired." |
| wrong market / no amount in this currency | `wrong_market`: "The code {code} can't be used in {market}." |
| global limit reached | `exhausted`: "The code {code} has reached its limit." |
| per-customer limit reached | `already_used`: "You've already used the code {code}." |
| minimum not met | `min_not_met`: "Add {amount} more to use the code {code}." |
| no eligible items | `no_eligible_items`: "The code {code} doesn't apply to anything in your bag." |
| cannot stack | `not_stackable`: "The code {code} can't be combined with the offer already applied." |

### 8.5 Usage limits without a race

Both caps are enforced in the **order-creation transaction**, after stock is reserved
and before the order number is allocated.

**Global cap — a conditional update, not a read-then-write:**

```sql
UPDATE coupons
   SET redemption_count = redemption_count + 1,
       version          = version + 1
 WHERE id = $1
   AND is_active
   AND deleted_at IS NULL
   AND (starts_at IS NULL OR starts_at <= $2)
   AND (ends_at   IS NULL OR ends_at   >  $2)
   AND (max_redemptions IS NULL OR redemption_count < max_redemptions)
RETURNING redemption_count;
```

Zero rows → `CouponUnavailableError`, mapped to the reason keys above. This is
race-free at `ReadCommitted`: the `UPDATE` takes a row-level write lock and
re-evaluates its `WHERE` against the committed row version, so two concurrent
redemptions of the last unit serialise on the coupon row and exactly one succeeds.
`chk_coupons_redemptions (redemption_count <= max_redemptions)` is the floor beneath
it — even a hand-written statement cannot exceed the cap.

**The increment runs even when `max_redemptions IS NULL`, and that is deliberate.**
It is not only a counter, it is the lock that the per-customer check below depends on.
Skipping it for uncapped coupons as an "optimisation" would leave the per-customer cap
enforced by an unserialised `count(*)` — two tabs, two orders, one
`max_redemptions_per_customer = 1` coupon used twice.

**Per-customer cap — safe because of the lock the statement above already holds.**
Two queries, because a guest has no `customers` row and a per-customer cap enforced
only against `customer_id` is one new email address away from meaningless:

```sql
-- signed-in: served by idx_coupon_usages_customer (coupon_id, customer_id)
SELECT count(*) FROM coupon_usages
 WHERE coupon_id = $1 AND customer_id = $2;

-- guest, or in addition to the above: driven from the email side.
-- idx_orders_email (lower(email), created_at DESC) selects this email's orders;
-- uq_coupon_usages (coupon_id, order_id) is then an index probe per candidate.
SELECT count(*)
  FROM orders o
  JOIN coupon_usages cu ON cu.coupon_id = $1 AND cu.order_id = o.id
 WHERE lower(o.email) = $3;
```

The email-side query is driven from `orders`, not from `coupon_usages`, because
`idx_coupon_usages_customer` is **partial on `customer_id IS NOT NULL`** (02 §2.7) and
therefore contains no guest usage at all — filtering `coupon_usages` by `coupon_id`
alone for guests is a sequential scan of every redemption ever recorded. The sum of
the two counts is compared to `max_redemptions_per_customer`.
Every redemption of this coupon is already serialised on the `coupons` row by the
conditional `UPDATE` above, so neither count can be stale within the transaction, and
`uq_coupon_usages (coupon_id, order_id)` makes one redemption per order structural.

> **Reconciliation with 01 §1.2.** 01 names "global coupon usage caps" and
> "order-number allocation" as the cases needing `Serializable`. Both turn out to be
> **single-row counters**, and a row lock is a stronger and cheaper guarantee than
> snapshot isolation for a counter: the conditional `UPDATE` above and
> `SELECT … FOR UPDATE` on `order_counters` are each correct at `ReadCommitted`.
> The checkout transaction therefore runs wholly at `ReadCommitted` — which it must,
> because 01 §1.2 fixes that level for `reserveStock()` and the two cannot disagree
> inside one transaction. `withSerializableRetry()` remains in
> `src/lib/db/transaction.ts` and remains the required wrapper for the paths that run
> these mutations **outside** checkout: admin coupon-cap edits, counter repair,
> bulk redemption imports. Nothing here weakens a guarantee; it moves two of them
> from an isolation level to a lock, and `tests/integration/coupon-cap-race.test.ts`
> proves it with N concurrent connections against a cap of 1.
>
> **07 §6.6 carried the superseded version and has been corrected.** Its
> coupon-abuse table specified `withSerializableRetry()` around the usage-cap
> transaction, citing 01 §1.2 — which is not implementable, because Postgres takes
> one isolation level per transaction and 01 §1.2 fixes this one at
> `ReadCommitted` for `reserveStock()`. An engineer working from the security
> checklist would have had to either drop the reservation's documented level or
> split the redemption out of the order transaction, which 02 §5.3 forbids. That
> row now reads "conditional `UPDATE` on `coupons.redemption_count`, at
> `ReadCommitted`, inside the order transaction" and points here.
>
> > **CHANGE REQUIRED IN 02 §2.5 and §5.2:** both still say the global cap is
> > "enforced under `withSerializableRetry` (01 §1.2)". The in-checkout path is the
> > conditional `UPDATE`; `withSerializableRetry` applies only to the out-of-checkout
> > callers named above.

### 8.6 A coupon that expires mid-checkout

The cart was priced with the coupon at 14:59:58 and `placeOrder` runs at 15:00:01
with `ends_at = 15:00:00`.

1. Phase A re-runs `evaluateDiscounts()` with `at = now()`. The coupon fails the date
   condition and is dropped.
2. Because the recomputed `discount_total_minor` differs from what the customer was
   shown, `placeOrder` **stops**. No order, no charge.
3. `carts.coupon_code` is cleared and `cart.coupon.removed` is shown with the new
   total: "The code {code} is no longer valid and has been removed. Your total is now
   {total}."
4. The customer presses Pay again and is charged the total they can see.

The alternative — honouring a coupon that expired seconds ago — requires a grace
window, which is an arbitrary number that becomes the real expiry time and is
unauditable against the campaign the merchant scheduled. **The rule is: the discount
is whatever `evaluateDiscounts()` returns at the instant of order creation, and any
difference from the displayed total stops checkout.** `at` is passed explicitly
through the whole evaluation so the conditional update in §8.5 and the date filter in
§8.3 use the *same* timestamp, and a coupon cannot expire between two steps of the
same order.

### 8.7 Gift cards

A gift card is **tender**, not a discount: it settles a liability, it does not reduce
a price. Consequences that fall straight out of that: it is applied after tax, it
never changes taxable value, it never helps cross a free-shipping threshold, and it
is refunded back to the card rather than to a card network.

`gift_cards` (02 §2.7) stores `code_hash BYTEA` and `code_last4 CHAR(4)`; the
plaintext is a bearer instrument, shown once at issue and emailed, never stored and
never logged. `gift_cards.currency_code` makes a card single-currency, and the paired
composite FKs on `gift_card_transactions` make an INR card simply inapplicable to a
USD order — the same answer `coupon_amounts` gives for a fixed-amount coupon, and for
the same hard-rule-2 reason.

> **Correction to 02 §2.7: `code_hash` is `hmac_sha256(code, GIFT_CARD_CODE_PEPPER)`,
> not Argon2id.** 02 describes the column as Argon2id *and* puts a unique index on it
> (`uq_gift_cards_code_hash`) *and* this section looks a card up by it. Those three
> cannot all be true: Argon2id embeds a fresh random salt per row, so the same code
> hashes differently every time — the unique index would never collide, and
> `WHERE code_hash = $1` would never match. The only way to redeem a card would be to
> read every `gift_cards` row and run an Argon2id verification against each, which is
> a full table scan multiplied by a deliberately expensive KDF: a denial-of-service
> endpoint with a "Apply gift card" button on it.
>
> A keyed HMAC restores every property that actually mattered. It is deterministic, so
> the unique index and the indexed equality lookup work; the key lives only in the
> environment, so a database dump does not yield the codes (which is what the KDF was
> reaching for); and codes are issued as 128 bits of `crypto.randomBytes`, so there is
> no low-entropy dictionary for an attacker holding the pepper to grind. Comparison is
> `crypto.timingSafeEqual` on the computed digest, not a string compare.
>
> ```
> GIFT_CARD_CODE_PEPPER   required when feature.gift_cards_enabled = true; 32 bytes,
>                         base64. Rotating it invalidates every outstanding card, so
>                         rotation is a migration that rewrites code_hash from a
>                         one-time re-issue, not an env edit.
> ```
>
> **Correction to this document's own earlier text: the variable is *not*
> documented in 01 §4.7.** 01 §4.7 is the **email** variable table and contains no
> such key; `GIFT_CARD_CODE_PEPPER` appears in no `.env` table, in no `env.ts`
> schema, and in neither 07 §1.5's token inventory nor 07 §5.10's secrets list. A
> secret with no environment home is a boot failure discovered by the first
> customer who tries to redeem a card. It now has one: **07 §5.10 item 4** carries
> it as a required token-class secret alongside `PASSWORD_PEPPER`, and
> `tests/unit/no-secret-in-bundle.test.ts` greps the built output for its value.
>
> > **Applied in 01 §4.11 (Commerce), not §4.7 (Email).** It is listed there as
> > **required** with no default, `z.string().min(44)` in
> > `src/lib/config/env.ts`, an empty key in `.env.example`, and the rotation
> > consequence stated: rotating it invalidates every outstanding card, which is
> > why `docs/runbooks/rotate-secrets.md` carries it as the one secret that
> > cannot be rotated without a migration.
>
> > **CHANGE REQUIRED IN 02 §2.7:** the `gift_cards.code_hash` row still reads
> > "Argon2id", which is what 09 P10/P18 migrate from. It is `BYTEA` holding the
> > HMAC-SHA256 digest above.

**Applying at checkout** (`applyGiftCard(sessionId, code)`): HMAC, look up on
`uq_gift_cards_code_hash`, verify `status = 'active'`, `deleted_at IS NULL`,
`expires_at` in the future, and `currency_code = checkout_sessions.currency_code`. The
applied amount is `min(balance_minor, amountStillPayable)` and is written to
`checkout_gift_cards`. Multiple cards may be applied; they are consumed in ascending
`expires_at` (nulls last), so the card that would expire first is used first.

**`applyGiftCard` and `applyCouponToCart` are rate-limited, and a gift card is the
stricter of the two.** A card code is a bearer instrument: an unlimited-attempt
lookup endpoint is a balance-stealing oracle that also tells the attacker, via the
response, exactly which guesses were worth something. Both go through `src/lib/ratelimit/`, and both are **two keys, not one** — the
cart key and an IP key, `consume()`d twice with the stricter verdict winning,
because a cart id is client-held and a limiter keyed on it alone is defeated by
starting a new cart per attempt (11 §4.3). The exact key names, limits and
windows are 11 §4.2's rows and are reproduced here because this is where they are
enforced:

| Action | Keys | Limit | Fail | On exhaustion |
| --- | --- | --- | :-: | --- |
| `applyGiftCard` | `giftcard:cart:<cartId>` | 5 / 10 min | closed | `429`, `cart.giftcard.too_many_attempts`, and a `security.giftcard_bruteforce` log line naming the IP |
| | `giftcard:ip:<ip64>` | 20 / 24 h | closed | same |
| `applyCouponToCart` | `coupon:cart:<cartId>` | 10 / 10 min | closed | `429`, `cart.coupon.too_many_attempts` |
| | `coupon:ip:<ip64>` | 60 / 1 h | closed | same |

The coupon cart limit was written here as 20 per 10 minutes and is **10** — 07
§5.5 and 11 §4.2 agree on 10, and `tests/unit/ratelimit-keys.test.ts` fails on a
`RateLimitSpec` whose limit disagrees with the registry.

Every failed gift-card attempt returns the same generic `cart.giftcard.invalid`
whether the code does not exist, is expired, is exhausted, or is in the wrong
currency — an error that distinguishes "no such card" from "wrong currency" confirms
the code is real.

**Redemption, with the same concurrency discipline as inventory** — inside the order
transaction, cards locked in ascending `gift_cards.id` order:

```sql
SELECT id, balance_minor, currency_code, status, expires_at
  FROM gift_cards
 WHERE id = ANY($1::uuid[])
 ORDER BY id
   FOR UPDATE;

UPDATE gift_cards
   SET balance_minor = balance_minor - $2,
       version       = version + 1,
       status        = CASE WHEN balance_minor - $2 = 0 THEN 'redeemed' ELSE status END
 WHERE id = $1
   AND status = 'active'
   AND balance_minor >= $2
   AND (expires_at IS NULL OR expires_at > now())
RETURNING balance_minor;
```

Zero rows → `GiftCardUnavailableError`; checkout stops and re-shows the amount
payable (`cart.giftcard.reduced`). Each successful update writes a
`gift_card_transactions` row (`type = 'redeem'`, negative `amount_delta_minor`,
`balance_after_minor`, `order_id`, `market_code`, `currency_code`), and
`chk_gift_cards_balance (balance_minor >= 0)` is the floor. The ledger, not a row
`CHECK`, is what makes the balance defensible:
`balance_minor = SUM(amount_delta_minor)` is reconciled nightly (02 §5.2).

The sum of applied cards lands on `orders.gift_card_total_minor`, and
`chk_orders_total` already subtracts it from `total_minor`. A fully-covered order is
the zero-total path of §3.6.

> **NEEDS INPUT:** restated from 02 §2.7 — whether gift cards are in scope for launch
> and their expiry policy per market, since several US state and Indian rules restrict
> expiry on stored-value instruments. The tables ship; `feature.gift_cards_enabled`
> is seeded `false`.

### 8.8 The order that is never paid — releasing tender, not just stock

**This is the hole that `release-reservations` does not cover, and it is the one that
takes money off a customer's gift card and gives nothing back.** `redeemCoupon()` and
`redeemGiftCards()` run in phase B, at **order creation**, not at payment — they have
to, because they must be in the same consistency boundary as the reservation and the
order row. The order then sits `pending_payment`. Nothing in §1.6, in the cron
table, or in the order state machine ever ends that state. Two concrete failures:

1. **A capped coupon is exhausted by abandonment.** `LAUNCH100` with
   `max_redemptions = 100` is consumed by 100 `placeOrder` calls that never pay. The
   conditional `UPDATE` incremented `redemption_count` to 100, no customer received
   anything, and the 101st real buyer sees `cart.coupon.exhausted`. The merchant's
   campaign is dead and the dashboard says it was a success.
2. **A gift card is silently drained.** A ₹25,000 card is debited at phase B step 11;
   the customer's card is then declined; the reservation is released at 30 minutes and
   the piece goes back on sale, but the ₹25,000 is gone and the order it paid for does
   not exist. `gift_cards.balance_minor` is `0`, `status = 'redeemed'`, and the
   customer is holding an empty instrument and a screenshot.

Neither is reversed on `payment_failed` — deliberately, because §1.6 lets the customer
retry the same order, and the coupon and the card belong to that order until it is
finished. The reversal belongs to **cancellation**, and cancellation needs to happen
on its own.

**`/api/cron/release-reservations` (already scheduled `*/5 * * * *`, 11 §5.1) gains a
second pass.** No new cron route is added; the existing one does both jobs so there is
one place that ends an abandoned checkout.

```sql
SELECT id FROM orders o
 WHERE o.status = 'pending_payment'
   AND o.placed_at < now() - ($1 || ' minutes')::interval      -- 120
   AND NOT EXISTS (
     SELECT 1 FROM payments p
      WHERE p.order_id = o.id
        AND p.status IN ('authorized')                          -- money is held; leave it
   )
 ORDER BY o.placed_at
 LIMIT 200
 FOR UPDATE SKIP LOCKED;
```

`ORDER_PAYMENT_EXPIRY_MINUTES = 120` in `src/lib/config/constants.ts`, chosen as
double the longest possible reservation life (§1.6) so cancellation can never race a
payment the customer is still legitimately completing. `FOR UPDATE SKIP LOCKED` and
the `LIMIT` keep two overlapping cron invocations from fighting and keep the pass
inside `maxDuration` no matter how large the backlog.

Per order, **one transaction**, in this order:

| # | Statement | Why it cannot be split off |
| --- | --- | --- |
| 1 | `transitionOrder(orderId, 'cancelled', { type: 'cron' }, 'payment_not_completed')`; `cancelled_at`, `cancel_reason` | The status is what makes the rest idempotent — a second pass finds no `pending_payment` row |
| 2 | `releaseStock(tx, reservationId, 'expired')` if the reservation is still `active` | Otherwise a cancelled order holds stock until the first pass runs |
| 3 | `UPDATE coupons SET redemption_count = redemption_count - 1, version = version + 1 WHERE id = $1 AND redemption_count > 0`, then `DELETE FROM coupon_usages WHERE coupon_id = $1 AND order_id = $2` | The conditional `WHERE` makes a double-run harmless; the `DELETE` is what stops the per-customer cap counting a cancelled order forever. `coupon_usages.order_id` is `RESTRICT` *to* `orders`, so deleting the usage row is permitted and the order row survives |
| 4 | Per redeemed card: `UPDATE gift_cards SET balance_minor = balance_minor + $2, status = CASE WHEN status = 'redeemed' THEN 'active' ELSE status END, version = version + 1 WHERE id = $1` plus a `gift_card_transactions` row `type = 'refund'`, **positive** `amount_delta_minor`, `balance_after_minor`, `order_id`, `market_code`, `currency_code` | A compensating ledger row, never an `UPDATE` that edits the redeem row — the ledger is append-only and `balance_minor = SUM(amount_delta_minor)` must keep reconciling (02 §5.2). The removed `balance_minor <= initial_balance_minor` CHECK is what makes this writable |
| 5 | `order_events` (`cancelled`, customer-visible), `recordAudit()` | "Where did my gift card balance go" has to be answerable from the order page |
| 6 | A `jobs` row `kind = 'send_email'`, template `order_cancelled_unpaid` | The customer is told their card balance is back, which is the whole point |

**Idempotency is structural, not a flag.** Step 1 moves the order out of
`pending_payment`, and `transitionOrder()` refuses `cancelled → cancelled`, so a
second invocation that somehow selected the same row aborts before touching a counter.
Step 3's `redemption_count > 0` and step 4's compensating-row shape mean even a
hand-run repair cannot drive a counter negative.

**The race with a late payment is closed by assertion 7, not by luck.** A UPI collect
approved at minute 121 arrives at a `cancelled` order; §4.3 assertion 7 refunds it in
full and alerts. Cancelling at 120 minutes and refunding the rare straggler is the
correct trade against holding a one-of-a-kind piece's coupon and a customer's gift
card balance hostage indefinitely. `tests/integration/order-expiry.test.ts` places an
order with a capped coupon and a gift card, expires it, and asserts
`redemption_count` is back, the card balance is back, the ledger reconciles, and a
second run of the cron changes nothing.

> **NEEDS INPUT:** `ORDER_PAYMENT_EXPIRY_MINUTES`. 120 is a defensible default and is
> what ships; a jewellery house that routinely takes bank transfers against
> `pending_payment` orders (§6) will want a much longer value for staff-placed orders
> specifically. The constant is read per order and branches on
> `orders.placed_by_user_id IS NOT NULL`; the second value is seeded equal to the
> first until the client answers.

---

## 9. Returns and refunds

### 9.1 Request to resolution

Statuses are `return_status` (02 §1.9): `requested`, `approved`, `rejected`,
`in_transit`, `received`, `refunded`, `closed`. Owning module `src/lib/returns/`.

| Step | Actor | Function | Writes |
| --- | --- | --- | --- |
| Request | Customer at `/account/orders/[id]/return`, or staff | `requestReturn({ orderId, lines, reasonCode, comment })` | `returns` (`status='requested'`, `rma_number`, `requested_at`), `return_items`, `order_events` (`return_requested`, customer-visible) |
| Approve / reject | Staff, `requirePermission(actor,'return.approve')` | `approveReturn(returnId, { restockLocationId })` / `rejectReturn(returnId, reason)` | `status`, `approved_at`, `restock_location_id`, `order_events`, `email_logs` |
| In transit | Staff or carrier webhook | `markReturnInTransit(returnId, { carrier, trackingNumber })` | `status='in_transit'` |
| Receive | Staff at `/admin/returns/[id]` | `receiveReturn(returnId, lines)` | `status='received'`, `received_at`, per-line `condition` and `restocked`, inventory ledger (§9.3), `order_items.returned_quantity`, `recomputeFulfillmentStatus()` |
| Refund | Staff | `refundReturn(returnId, { amountMinor, restock })` | `refunds`, provider call, `payments`, `orders`, `order_items`, `payment_events`, `order_events` |
| Close | Staff or automatic on full refund | `closeReturn(returnId)` | `status='closed'`, `closed_at` |

Eligibility is checked at request time: the line must belong to the order, the order's
`payment_status` must be `paid` or `partially_refunded`, and
`quantity - returned_quantity` must cover the requested quantity —
`idx_return_items_order_item` serves the "already returned" check that stops a line
being returned twice.

**Ownership is re-derived server-side on every customer-initiated return, because an
order id is not a capability (01 §2.5).** `/account/orders/[id]/return` renders and
`requestReturn()` accepts only when one of two things is true, checked in
`src/lib/returns/flow.ts` before anything else:

- `orders.customer_id = session.customerId` for a verified customer session; or
- the request carries the `/orders/[token]` token, whose `sha256` matches
  `orders.public_token_hash`, for a guest order (`customer_id IS NULL`, §3.3).

Anything else is `404`, not `403` — a `403` confirms the order exists. Without this,
enumerating UUIDs lets anyone open a return, and therefore a refund workflow, against
any order in the system; hiding the button is not authorization (hard rule 9).
`tests/integration/return-authz.test.ts` requests a return against another customer's
order with a valid session and asserts `404`.

> **SCHEMA ADDITION:** `returns` has no carrier or tracking fields, so `in_transit` is
> a status nobody can act on.
>
> ```sql
> ALTER TABLE returns
>   ADD COLUMN carrier          TEXT NULL,
>   ADD COLUMN tracking_number  TEXT NULL,
>   ADD COLUMN label_url        TEXT NULL,
>   ADD COLUMN shipped_at       TIMESTAMPTZ NULL;
> CREATE INDEX idx_returns_tracking ON returns (tracking_number)
>   WHERE tracking_number IS NOT NULL;
> ```

> **NEEDS INPUT:** the returns window in days, who pays return shipping, whether
> one-of-a-kind and personalised pieces are returnable at all, and the restocking-fee
> policy. These are `settings` keys (`returns.window_days`,
> `returns.customer_pays_shipping`, `returns.restocking_fee_bp`), seeded **blank**, and
> the storefront renders no returns policy text until the client supplies it
> (hard rule 8).

### 9.2 Partial refunds

A refund is per-order, optionally per-line, and always an amount — never a
percentage applied at refund time. `refundReturn` and the standalone
`refundOrder(orderId, { lines, shippingMinor, reason, restock })` both produce one
`refunds` row and the same cascade:

- `return_items.refund_amount_minor` per line (when return-driven);
- `order_items.refunded_minor += allocated share`, capped by
  `chk_order_items_refund_cap (refunded_minor <= line_total_minor)`;
- `orders.refunded_total_minor += amount`, capped by
  `chk_orders_refund_cap (refunded_total_minor <= total_minor + gift_card_total_minor)`
  — the cap is what the customer paid *by any means*, which is what makes refunding a
  gift-card-settled order possible at all;
- `recomputePaymentStatus()` → `partially_refunded` or `refunded`.

Shipping is refundable independently and is allocated to no line; it reduces
`orders.refunded_total_minor` only. Tax follows the refunded merchandise
proportionally and is recorded in the `refunds.reason` breakdown; it is never
recomputed from a current rate (02 §1.10 rule 4).

**Destination.** A refund goes back to the tender it came from, and "proportionally"
is the rule, not "card first":

```ts
// src/lib/returns/tender.ts
const [toProvider, toGiftCards] = allocate(refundAmountMinor, [
  payment.capturedMinor - payment.refundedMinor,     // network remainder
  order.giftCardTotalMinor - giftCardAlreadyRefundedMinor,
]);                                                   // 02 §1.10 rule 3
```

`allocate()` by largest remainder, so the two destinations sum to the refund exactly
and a partial refund of a part-card-part-network order does not quietly favour one
tender. **The array order above is load-bearing**: the leftover minor unit goes to
the lowest index (01 §2.6), so a one-cent remainder goes back to the card rather
than onto a gift card, which is the direction that cannot become a complaint. `toGiftCards` is then split across the order's `gift_card_transactions`
`redeem` rows in reverse redemption order, each producing a `type = 'refund'` row with
a positive `amount_delta_minor`. This is exactly why the
`balance_minor <= initial_balance_minor` CHECK does not exist (02 §2.7). Without a
stated rule, a full refund of a $2,000 order settled $1,500 by card and $500 by gift
card can be issued as $2,000 to the card — a $500 cash-out of a non-cash instrument,
which is both a loss and, in several jurisdictions, a compliance problem.

**A gift-card-only refund writes no `refunds` row.** `refunds.payment_id` is `NOT
NULL` with an FK to `payments`, and a zero-total order settled entirely by gift card
has **no `payments` row at all** (§3.6). The cascade for that order is therefore:
`gift_card_transactions` (`type = 'refund'`, positive delta), `orders
.refunded_total_minor += amount` — permitted because `chk_orders_refund_cap` caps at
`total_minor + gift_card_total_minor` rather than at `total_minor`, which is precisely
the case 02 §2.7 widened it for — `order_items.refunded_minor`, `order_events`
(`refund_succeeded`, customer-visible), `recomputePaymentStatus()`, `recordAudit()`.
`refundOrder()` branches on `payments` being absent and never fabricates a
`provider_key = 'gift_card'` payment to hang a `refunds` row from; that would put a
non-acquirer into every payment report and every reconciliation sum, for the sake of a
row shape. `tests/integration/refund-giftcard-only.test.ts` covers it.

### 9.3 The inventory consequence

Receiving a return is one transaction (02 §5.3):

1. `returns.status = 'received'`, `received_at`.
2. Per `return_items` row, staff record `condition` and decide `restocked`.
3. **Restocked** → `inventory_transactions` row `type = 'return_restock'`, positive
   `quantity_delta`, `return_id` set, `note` carrying the condition, and
   `inventory_items.on_hand_quantity += quantity` at `returns.restock_location_id`.
4. **Not restocked** (damaged, worn, altered) → the units go to the quarantine
   location as a `transfer_in`, or are written off with `type = 'write_off'` and a
   mandatory `note`. They are never silently dropped: a returned piece that appears in
   no ledger is a piece the count will be wrong about forever.
5. `order_items.returned_quantity += quantity`, bounded by
   `chk_order_items_counters`.
6. `recomputeFulfillmentStatus()`.
7. **One-of-a-kind special case:** restocking a unique piece makes it sellable again,
   so the transaction's post-commit step purges `tags.product(id)` and
   `tags.market(code)` immediately — 01 §2.4 already requires immediate purge for any
   movement on a one-of-a-kind variant, in-band or not. The piece reappears on the
   PDP within one revalidation rather than up to fifteen minutes later.

### 9.4 The provider refund call and its reconciliation

```ts
// src/lib/payments/refund.ts
export async function refundPayment(input: {
  paymentId: string; amountMinor: bigint; reason: string;
  returnId?: string; restock: boolean; actor: Actor;
}): Promise<Result<Refund, RefundError>>;
```

`RefundError` is a **type alias**, not a class —
`OverRefundError | IllegalTransitionError | ProviderError | ForbiddenError | TotpRequiredError`,
declared in `src/lib/errors.ts` beside `PricingError` and `CheckoutError` (11
§2.1). Declaring it as a class is how a second error taxonomy starts: every
concrete class in this system extends `AppError` directly and carries one
`ErrorCode`, one HTTP status and one `copy.error.*` key.

Sequence — the provider call is outside the transaction, deliberately:

1. **Transaction 1:** `SELECT … FOR UPDATE` on `payments`; assert
   `SUM(refunds.amount_minor WHERE status IN ('pending','succeeded')) + amountMinor <= payments.captured_minor`
   inside the lock (02 §5.2 — a `CHECK` cannot aggregate another table); insert
   `refunds` with `status = 'pending'` and `idempotency_key = refunds.id`; write
   `payment_events` (`refund_created`). Commit.

> **The assertion must count `pending`, and counting only `succeeded` is a real
> double-refund.** Walk it: a ₹40,000 capture, two staff, two tabs. Tab A locks the
> payment, sums succeeded refunds (₹0), passes, inserts a `pending` ₹40,000 refund,
> commits, **releases the lock**. Tab B now takes the lock, sums succeeded refunds —
> A's row is still `pending`, so the sum is still ₹0 — passes, inserts a second
> `pending` ₹40,000 refund, commits. Both call the provider, each with its own refund
> id as the idempotency key, so the provider's own idempotency does not collapse them:
> ₹80,000 leaves the merchant account on a ₹40,000 capture. `chk_payments_amounts
> (refunded_minor <= captured_minor)` does not save it either — `payments
> .refunded_minor` is only incremented in transaction 3, by which time both refunds
> have settled, so the constraint fires *after* the money is gone and merely makes the
> second settlement unwritable, leaving the books wrong in the other direction. The
> "second reads the first's row and fails the sum assertion" claim is only true if the
> first's row is inside the summed set. It has to be.
>
> The supporting index has to widen with it. 02 §2.7 defines
> `idx_refunds_payment_succeeded ON refunds (payment_id) WHERE status = 'succeeded'`,
> which cannot serve the corrected predicate:
>
> ```sql
> -- SCHEMA ADDITION, replacing idx_refunds_payment_succeeded
> DROP INDEX IF EXISTS idx_refunds_payment_succeeded;
> CREATE INDEX idx_refunds_payment_open ON refunds (payment_id)
>   WHERE status IN ('pending','succeeded');
> ```
>
> A `failed` refund is correctly excluded — it took no money — and step 4 setting
> `status = 'failed'` is what releases its share back to the available remainder.
> A `pending` refund that is genuinely stuck at the provider blocks further refunds on
> that payment until it resolves, which is the safe direction.
> `tests/integration/refund-overrefund.test.ts` runs the two-tab race on two real
> connections and asserts exactly one refund reaches the provider.
2. **Network:** `provider.refund(providerPaymentId, amountMinor, reason, refund.id)`.
   The idempotency key is the refund row's own id, made unique by
   `uq_refunds_idempotency (payment_id, idempotency_key)`, so a retry after a timeout
   returns the provider's existing refund rather than issuing a second one.
3. **Transaction 2 (or the `charge.refunded` / `refund.processed` webhook, whichever
   arrives first — both idempotent):** `refunds.status='succeeded'`,
   `provider_refund_id`, `succeeded_at`; `payments.refunded_minor += amount`
   (bounded by `chk_payments_amounts`); `orders.refunded_total_minor`;
   `order_items.refunded_minor`; `payment_events` (`refund_succeeded`);
   `order_events` (`refund_succeeded`, customer-visible); the restock ledger if
   `restock`; `recomputePaymentStatus()`; `recordAudit()`.
4. **Failure** → `refunds.status='failed'`, `failed_at`, `payment_events`
   (`refund_failed`), Sentry, staff alert. The refund row **stays** — a failed refund
   attempt is financial history, and it is what stops a second attempt from being
   invisible.

Two concurrent staff refunding the same payment from two tabs are serialised by the
`FOR UPDATE` in step 1; the second reads the first's `pending` row, which is inside
the summed set, and fails the assertion.
`/api/cron/reconcile-payments` re-derives the sum nightly and flags any payment where
`SUM(refunds.amount_minor) > payments.captured_minor`, plus any refund that exists at
the provider but not here — which is how a refund issued from the Stripe or Razorpay
dashboard gets recorded rather than silently diverging.

---

## 10. Edge case matrix

Every row is implemented, named, and covered by the test file in the last column.

| # | Case | Specified behaviour |
| --- | --- | --- |
| 1 | **Two buyers race for the last item** | Both lock the single `inventory_items` row in ascending id order at `ReadCommitted`. The first commits `reserved_quantity = 1`. The second's conditional `UPDATE` re-evaluates `on_hand - reserved - safety >= qty` against the new row version, returns zero rows, and raises `InsufficientStockError` **before any payment intent exists**. `chk_inventory_no_oversell` is the floor if the service is ever wrong. Loser sees `cart.line.ooak_sold`: "This piece has just been sold." `tests/integration/one-of-a-kind.test.ts` |
| 2 | **Price changes while an item sits in a cart** | `cart_items.unit_final_minor` / `priced_at` is the server-issued quote. Every cart read re-runs `resolvePriceBatch()`; any difference, zero tolerance, re-quotes the line and shows `cart.line.price_changed`. At checkout the same difference raises `PriceChangedError` and **no order is created** — the customer sees the new total and confirms it. Historical orders are untouched: a price edit inserts a new `prices` row and closes the old one; `order_items` snapshots (02 §1.6) |
| 3 | **Product becomes unavailable** | Unpublished/archived/soft-deleted product → `cart.line.unavailable` and the line is removed at read time, `LineUnavailableError` at checkout. Variant gone → `cart.line.variant_gone`. No price in this market → `cart.line.not_sold_here`. `cart_items.variant_id` is `ON DELETE RESTRICT` so the variant cannot be hard-deleted underneath the cart; products are soft-deleted only |
| 4 | **Payment succeeds but the browser disconnects** | Irrelevant to correctness. The order was created before the intent; the webhook marks it paid; the confirmation email sends; `/orders/[token]` resolves. The redirect page is a convenience, and `GET /api/checkout/status/[orderId]` — authorised by the customer session **or** the cart token, never the order id alone — is what the page polls when it does reconnect |
| 5 | **A webhook arrives twice** | `INSERT INTO webhook_events … ON CONFLICT (provider, provider_event_id) DO NOTHING RETURNING id` is the **first** statement after signature verification. Zero rows returned ⇒ duplicate ⇒ `200` and not one effect re-runs: no second `commitStock()`, no second confirmation email, no second `payment_events` row. `tests/integration/webhook-duplicate.test.ts` |
| 6 | **A webhook arrives before the redirect** | Normal, not exceptional. The order already exists (created in phase B, before the intent). If the `payments` row is not yet written — the webhook beating our own `createIntent` response — the handler creates it from the envelope under `uq_payments_idempotency` and proceeds. The customer's browser lands on `/checkout/processing`, polls once, and is redirected straight to a paid confirmation |
| 7 | **Payment succeeds but order creation fails** | Structurally near-impossible: the order commits before any intent is created. The residual paths are (a) `/api/cron/reconcile-payments` finds a provider payment whose `metadata.order_id` has no order → automatic full refund keyed on the provider payment id, Sentry `fatal`, `ORDER_NOTIFICATION_EMAILS`; (b) a payment with no `order_id` at all → flagged for a human, never auto-refunded; (c) an order paid at the provider but still `pending_payment` here → the sweep replays the event through the same six assertions. And the sharpest variant: **paid but the stock is gone** → `paid_unfulfillable`, automatic full refund with `idempotencyKey = order.id`, staff and customer notified (01 §2.5) |
| 8 | **Refund issued** | `FOR UPDATE` on `payments`, cross-table sum assertion inside the lock, `refunds` row inserted `pending` with its own id as the provider idempotency key, provider called outside the transaction, settled by either the response or the `charge.refunded` / `refund.processed` webhook — whichever lands first, both idempotent. Cascade: `payments.refunded_minor`, `orders.refunded_total_minor`, `order_items.refunded_minor`, `payment_events`, `order_events`, optional restock ledger, `recomputePaymentStatus()`. Caps are `chk_payments_amounts` and `chk_orders_refund_cap` |
| 9 | **Checkout abandoned** | Nothing happens synchronously. `/api/cron/release-reservations` every 5 minutes releases `status='active' AND expires_at < now()` with `release_reason='expired'` and deletes expired `checkout_sessions` with a null `order_id`. The cart survives 90 days; `/api/cron/abandoned-carts` mails once (`abandoned_email_sent_at`), and the mail quotes **no price**. Without the release cron an abandoned checkout would keep a one-of-a-kind piece off sale indefinitely |
| 10 | **Coupon expires mid-checkout** | `evaluateDiscounts()` re-runs with `at = now()` in phase A, drops the coupon, and because the total moved, `placeOrder` **stops before charging**. `carts.coupon_code` is cleared; `cart.coupon.removed` shows the new total; the customer confirms. No grace window — a grace window is an unauditable second expiry time (§8.6) |
| 11 | **A variant goes out of stock at the payment step** | Two sub-cases. *Before the intent:* `reserveStock()` in phase B fails → `InsufficientStockError`, no order, no charge, bag re-shown with `cart.line.sold_out`. *After payment, reservation expired mid-3DS:* webhook assertion 6 re-reserves; if it fails the order becomes `paid_unfulfillable`, the full amount is refunded automatically with the order id as the refund idempotency key, and both staff and customer are emailed. Refunding a customer is a bad afternoon; owing one unique piece to two people is a bad year |
| 12 | **The customer changes market mid-checkout** | `carts.market_code` is cross-checked against the `[market]` URL segment on every checkout request. A mismatch raises `MarketChangedError` and **nothing else happens**. The market switch itself is one transaction: `FOR UPDATE` the cart, delete every `cart_items` row, update `market_code`/`currency_code`, re-add each variant through `resolvePrice()` in the new market, drop the ones with no price there, delete the `checkout_sessions` row and its shipping/tax quote, release the reservation (`release_reason='cart_changed'`), and report what was dropped via `cart.market_changed`. The `ON UPDATE RESTRICT` composite FKs on `(cart_id, market_code)` and `(price_record_id, market_code)` make the lazy version — flipping `market_code` and leaving the lines — fail at the database rather than render USD amounts with a ₹ sign |

Additional rows covered by the same machinery and worth naming so they are not
mistaken for gaps:

| Case | Behaviour |
| --- | --- |
| Same buyer double-clicks Place Order | Phase A **step 0** reads `idx_orders_idempotency_key` and returns the first order before any reservation, coupon or gift-card write happens; the `23505` on insert is the narrow-window backstop, caught outside `withTransaction()` (§3.6) |
| **Order placed, never paid, never touched again** | `/api/cron/release-reservations` cancels it at `ORDER_PAYMENT_EXPIRY_MINUTES`, releases the stock, **decrements the coupon's `redemption_count` and returns the gift-card balance** with a compensating ledger row, and emails the customer. Without the tender reversal a capped coupon is exhausted by abandonment and a customer's gift card is silently drained (§8.8) |
| **Payment succeeds after the order was cancelled** | Assertion 7: full automatic refund keyed on the order id, staff and customer alerted, order stays `cancelled`. Assertion 5 alone would record the event as `ignored` and keep the money (§4.3) |
| **Customer retries after a declined card** | `retryPayment(orderId)` re-reserves against the order and creates a new intent under `paymentAttemptKey(order, attempt)`. Reusing `orders.idempotency_key` would hand the browser the dead intent Stripe returns for a replayed key, and the order could never be paid (§3.6) |
| **A made-to-order piece is bought** | `reserveStock()` filters `inventory_policy IN ('made_to_order','untracked')` out before locking. Without that filter the lock query returns zero rows, "zero rows means you lost the race" fires, and every made-to-order product is unbuyable (§1.5) |
| **Same variant, two different engravings** | Refused at `addToCart` with `cart.line.personalisation_conflict`. `uq_cart_items (cart_id, variant_id)` would otherwise merge them into quantity 2 with one engraving and ship a physically wrong piece (§2.2) |
| **Tax moves between the payment step and Pay** | `TotalsChangedError`; the session's stored quote is updated and the customer re-confirms. No order is created for a total the customer has not seen (§3.6 step 5b) |
| Two tabs, one sign-in, one guest cart | Merge under `FOR UPDATE` on both carts; `uq_cart_items (cart_id, variant_id)` makes it an upsert |
| Two staff refund the same payment | `FOR UPDATE` on `payments` + the sum assertion inside the lock, over `status IN ('pending','succeeded')` — counting only `succeeded` lets both pass and double-refunds the customer (§9.4) |
| Someone guesses gift-card codes | HMAC lookup on a unique index, 5 attempts / 10 minutes per cart and IP, one generic failure message for every rejection reason (§8.7) |
| A return is requested against someone else's order | Ownership re-derived from the session's `customer_id` or the `/orders/[token]` hash; anything else is `404` (§9.1) |
| Last unit of a capped coupon, two orders | Conditional `UPDATE` on `coupons.redemption_count`; loser gets `cart.coupon.exhausted` |
| Gift card spent from two checkouts at once | Conditional `UPDATE` on `gift_cards.balance_minor` under `FOR UPDATE`; loser re-prices |
| Provider unconfigured for a market | `getProviderForMarket()` returns `null`; checkout blocks at phase A step 8 with `PaymentsUnconfiguredError` and writes no order. It never falls back to the other market's acquirer in another currency |
| **A paid order is above the high-value review threshold** | The webhook transitions it to `pending_review` instead of `paid` — money settled, stock committed, `commitStock()` run, confirmation email sent. It appears in `/admin/orders?status=pending_review`, `createShipment()` refuses it, and releasing it requires `order.update` (not `order.fulfil`, which the packing bench holds). Seeded threshold is `NULL`, meaning no hold (§5.3) |
| **The confirmation email for a paid order** | Enqueued as a `jobs` row *inside* the webhook transaction with `created_by_user_id = NULL` and `dedupe_key = order:{id}:order_confirmation`. It sends because `send_email` is declared in `job_kind` and is `systemPermitted: true` (07 §3.2) — under the closed three-kind allowlist that rule previously carried, it failed as `FORBIDDEN` in `jobs.error` with no customer-visible signal at all (§4.3) |
| Signing secret rotated, webhooks now fail verification | Invalid-signature deliveries are still written to `webhook_events` with `signature_valid = false`, `status = 'ignored'`, and surface at `/admin/system/webhooks` — so the failure is a visible row, not an absence of orders |

---

## 11. Files this section creates

```
src/lib/inventory/     reserve.ts  release.ts  commit.ts  availability.ts
                       committed.ts  ledger.ts  locations.ts  schema.ts
src/lib/cart/          index.ts  merge.ts  revalidate.ts  messages.ts
                       token.ts  switchMarket.ts  schema.ts
src/lib/checkout/      index.ts  stateMachine.ts  placeOrder.ts  address.ts
                       regions.ts  session.ts  schema.ts
src/lib/orders/        index.ts  stateMachine.ts  orderNumber.ts  snapshot.ts
                       labels.ts  draft.ts  timeline.ts  invoice.ts  schema.ts
src/lib/payments/      index.ts  types.ts  webhook.ts  refund.ts  reconcile.ts
                       providers/stripe.ts  providers/razorpay.ts  providers/index.ts
src/lib/shipping/      index.ts  quote.ts  zones.ts  rates.ts  schema.ts
src/lib/discounts/     index.ts  evaluate.ts  stack.ts  conditions.ts  redeem.ts  schema.ts
src/lib/giftcards/     index.ts  redeem.ts  issue.ts  schema.ts
src/lib/returns/       index.ts  flow.ts  restock.ts  tender.ts  schema.ts

src/server/actions/cart.ts         addToCart, updateCartItemQuantity, removeCartItem,
                                   applyCouponToCart, removeCoupon, switchMarket
src/server/actions/checkout.ts     startCheckout, setContact, setAddresses,
                                   setShippingMethod, applyGiftCard, removeGiftCard,
                                   placeOrder, retryPayment
src/server/actions/admin/order.ts  createDraftOrder, convertDraftToOrder, cancelOrder,
                                   releaseOrderHold, createShipment, markShipped,
                                   markDelivered, refundOrder, addOrderNote
src/server/actions/admin/return.ts requestReturn, approveReturn, rejectReturn,
                                   markReturnInTransit, receiveReturn, refundReturn,
                                   closeReturn
src/server/actions/admin/inventory.ts  adjustStock, receiveStock, transferStock,
                                       writeOffStock, recountStock, releaseReservation

tests/integration/  one-of-a-kind.test.ts  inventory-ledger.test.ts
                    inventory-multi-location.test.ts  cart-revalidate.test.ts
                    cart-merge.test.ts  checkout-tamper.test.ts
                    order-idempotency.test.ts  order-immutability.test.ts
                    zero-total-order.test.ts  webhook-duplicate.test.ts
                    webhook-out-of-order.test.ts  coupon-cap-race.test.ts
                    coupon-currency.test.ts  gift-card-currency.test.ts
                    gift-card-race.test.ts  refund-overrefund.test.ts
                    shipping-quote.test.ts  return-restock.test.ts
                    made-to-order-checkout.test.ts  payment-retry.test.ts
                    order-expiry.test.ts  webhook-late-success-on-cancelled.test.ts
                    tax-inclusive-order.test.ts  refund-giftcard-only.test.ts
                    return-authz.test.ts  pending-review-hold.test.ts
tests/unit/         order-state-machine.test.ts  checkout-state-machine.test.ts
                    money-allocate.test.ts  discount-stack.test.ts
tests/e2e/          checkout-us.spec.ts  checkout-in.spec.ts
```
