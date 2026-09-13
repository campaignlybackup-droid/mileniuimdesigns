# 15 — Customer and commerce gaps

Five brief requirements have no home in `00`–`11`. This document gives each one a
table set, a service surface, a route, a permission that already exists, and a
failure it prevents.

| `99` finding | Closed by |
| --- | --- |
| Gap 3 — rule-based customer groups are not modelled | §1 |
| Gap 9 — gift-card issuance | §2 |
| Gap 11 — reviews are excluded, and the exclusion is only visible in two asides | §3 |
| Gap 14 — the `(preview)` route group versus the token preview | §4 |
| Gap 2 (modelling half) — three "notify me" mechanisms | §5 |
| Gap 13 (modelling half) — wishlist share revocation and the public screen | §6 |

**Conformance to `11`, stated up front so it can be checked rather than trusted.**
This document adds **no permission key** (the catalogue stays at 72), **no
`ErrorCode`** (the taxonomy stays at 52), **one `job_kind`**
(`customer_group_refresh`), **three rate-limit keys**, and **no cron entry**. Every
new capability is authorised by a key that already exists, and §8 is the complete
list of edits the other documents need.

**Where these tables go.** `02 §7.1` states that documents 13–15 do not exist and
that if one is added, "their tables belong in this register before their phase's
migration is written". §7 of this document is that register entry, pre-written in
`02 §7`'s own row format, so the `02` owner pastes rather than transcribes.

---

## 1. Rule-based customer groups (gap 3)

`customer_groups` (`02 §2.3`) carries `key`, `name`, `description`, `is_default`
and nothing else, and `customers.customer_group_id` is a plain `NOT NULL` FK with
`RESTRICT`. The only mechanism that moves a customer between groups is a human
holding `customer.update`. The brief asks for rule-based groups.

### 1.1 The decision, and the vocabulary it reuses

**Decision: customer group rules reuse the collection-rule language of `03 §6`
exactly — the same operator enum (the literal Postgres type
`collection_rule_operator`), the same one-row-per-rule shape, the same
`value_text` / `value_uuid` / `value_numeric` / `value_market_code` columns, the
same flat `all` / `any` connective with no nesting, the same major-to-minor
conversion-on-write rule for money, the same `source = 'rule' | 'manual'`
pin discipline, and the same evaluate-one-entity-against-N-rule-sets refresh
strategy.** There is no second rule language in this system.

What is **not** shared is the rule table itself: `collection_rules.collection_id`
is `NOT NULL REFERENCES collections(id)`, so a customer rule cannot live there
without making that FK nullable and adding a discriminator — a polymorphic rule
table whose every index then carries a `WHERE kind = …` and whose evaluator
branches on it. A parallel table with an identical column list is cheaper to read
and impossible to mis-join. The *shared* artefact is the code:
`buildRulePredicate()` in `src/lib/catalog/collections.ts` is generalised to
`src/lib/rules/predicate.ts` and takes a **field resolver**, so the operator
handling (`equals`, `in`, `gt`, `is_true`, …) is written once and the two domains
supply only their own field→SQL fragments.

```ts
// src/lib/rules/predicate.ts — shared by collections (03 §6.4) and customer groups.
export type RuleRow = {
  field: string; operator: CollectionRuleOperator;
  valueText: string | null; valueUuid: string | null;
  valueNumeric: bigint | null; valueMarketCode: MarketCode | null;
  attributeId: string | null; values: { valueUuid: string | null; valueText: string | null }[];
};
export type FieldResolver = (rule: RuleRow) => Prisma.Sql;   // one EXISTS / comparison fragment
export function buildRulePredicate(
  rules: RuleRow[], match: 'all' | 'any', resolve: FieldResolver,
): Prisma.Sql;
```

> **RESOLVED — was CHANGE REQUIRED IN 03 §6.4:** `buildRulePredicate(rules, match)` gains a third
> *Verified applied in 03.*
> parameter, the `FieldResolver`, and moves to `src/lib/rules/predicate.ts`;
> `src/lib/catalog/collections.ts` exports
> `buildRulePredicate(rules, match) => buildRulePredicate(rules, match, productFieldResolver)`
> so no call site in `03` changes. The `eslint-plugin-boundaries` element type for
> `src/lib/rules/` is `lib-shared` — it imports nothing from a domain module, which
> is what stops it becoming a second service layer.

### 1.2 Schema

```sql
-- own migration file, ahead of the table that uses it (02 §7.1 rule 1)
CREATE TYPE customer_group_rule_field AS ENUM (
  'lifetime_spend', 'order_count', 'first_order_at', 'last_order_at',
  'market', 'tag', 'accepts_marketing');

ALTER TABLE customer_groups
  ADD COLUMN mode              collection_mode NOT NULL DEFAULT 'manual',
  ADD COLUMN rule_match        TEXT            NOT NULL DEFAULT 'all',
  ADD COLUMN priority          SMALLINT        NOT NULL DEFAULT 100,
  ADD COLUMN last_refreshed_at TIMESTAMPTZ     NULL,
  ADD COLUMN version           INTEGER         NOT NULL DEFAULT 0,
  ADD CONSTRAINT chk_customer_groups_rule_match CHECK (rule_match IN ('all','any')),
  ADD CONSTRAINT chk_customer_groups_default_manual
    CHECK (NOT (is_default AND mode = 'automatic'));

CREATE TABLE customer_group_rules (
  id                UUID PRIMARY KEY,
  customer_group_id UUID      NOT NULL REFERENCES customer_groups (id) ON DELETE CASCADE,
  field             customer_group_rule_field NOT NULL,
  operator          collection_rule_operator  NOT NULL,   -- the SAME type as 03 §6.2
  value_text        TEXT      NULL,
  value_uuid        UUID      NULL,
  value_numeric     NUMERIC(14,4) NULL,      -- integer minor units, or an integer count
  value_market_code CHAR(2)   NULL REFERENCES markets (code) ON DELETE CASCADE,
  position          SMALLINT  NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_cgr_value CHECK (
    num_nonnulls(value_text, value_uuid, value_numeric) >= 1
    OR operator IN ('is_true','is_false')),
  CONSTRAINT chk_cgr_money_market CHECK (
    field <> 'lifetime_spend' OR value_market_code IS NOT NULL)
);
CREATE INDEX idx_cgr_group ON customer_group_rules (customer_group_id, position);
CREATE INDEX idx_cgr_field ON customer_group_rules (field);

CREATE TABLE customer_group_rule_values (           -- shape of collection_rule_values, 03 §6.3
  rule_id    UUID NOT NULL REFERENCES customer_group_rules (id) ON DELETE CASCADE,
  value_uuid UUID NULL,
  value_text TEXT NULL,
  position   SMALLINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pk_customer_group_rule_values PRIMARY KEY (rule_id, position),
  CONSTRAINT chk_cgrv_one_value CHECK (num_nonnulls(value_uuid, value_text) = 1)
);

CREATE TABLE customer_tags (                        -- the join; the vocabulary is `tags`
  customer_id         UUID NOT NULL REFERENCES customers (id) ON DELETE CASCADE,
  tag_id              UUID NOT NULL REFERENCES tags (id)      ON DELETE CASCADE,
  assigned_by_user_id UUID NULL REFERENCES users (id)         ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pk_customer_tags PRIMARY KEY (customer_id, tag_id)
);
CREATE INDEX idx_customer_tags_tag ON customer_tags (tag_id, customer_id);

ALTER TABLE customers
  ADD COLUMN first_order_at                 TIMESTAMPTZ NULL,
  ADD COLUMN customer_group_source          TEXT NOT NULL DEFAULT 'rule',
  ADD COLUMN customer_group_assigned_at     TIMESTAMPTZ NULL,
  ADD COLUMN customer_group_assigned_by_user_id UUID NULL REFERENCES users (id) ON DELETE SET NULL,
  ADD CONSTRAINT chk_customers_group_source CHECK (customer_group_source IN ('rule','manual'));

CREATE INDEX idx_customers_first_order
  ON customers (first_order_at) WHERE anonymized_at IS NULL AND first_order_at IS NOT NULL;
```

**`customer_tags` is a join onto the existing `tags` table, not a second tag
vocabulary.** `tags` already serves `product_tags`, `media_tags` and
`journal_post_tags` (`11 §1.3` row 14); a fourth join is the established shape, and
`tags.is_visible = false` is what keeps an internal segment tag (`trade-applicant`)
off the storefront. The permissions split cleanly and usefully: **creating a `tags`
row is `tag.update`; attaching one to a customer is `customer.update`** — the
merchandiser owns the vocabulary, the person who knows the customer owns the
assignment.

**`customers.first_order_at` is a new denormalised column, not a `MIN()` over
`orders`.** It is written in the order-creation transaction beside
`total_orders_count` and `last_order_at`, which `02 §2.3` already accepts as
"accepted duplication", and it is re-derived and flagged by
`/api/cron/reconcile-payments` like its two siblings. Without it, a
`first_order_at` rule is an aggregate over every order the customer ever placed,
evaluated on every order they place.

### 1.3 The fields, their value columns, and the operators each admits

`saveCustomerGroupRules()` rejects any pairing not in this table, the same way
`saveCollectionRules()` does for `03 §6.2`.

| Field | Value column | Operators | Evaluated against |
| --- | --- | --- | --- |
| `lifetime_spend` | `value_numeric` + **`value_market_code` (required)** | `gt`, `gte`, `lt`, `lte`, `equals` | `customer_currency_totals.total_spent_minor - total_refunded_minor` for the **currency of that market** |
| `order_count` | `value_numeric` | `equals`, `not_equals`, `gt`, `gte`, `lt`, `lte` | `customers.total_orders_count` |
| `first_order_at` | `value_text` — ISO-8601 **date** or ISO-8601 **duration** | `gt`, `gte`, `lt`, `lte`, `is_true` (= has ordered), `is_false` (= never ordered) | `customers.first_order_at` |
| `last_order_at` | `value_text` — same two forms | `gt`, `gte`, `lt`, `lte` | `customers.last_order_at` |
| `market` | `value_text` (`CHAR(2)`), or `customer_group_rule_values` for `in` / `not_in` | `equals`, `not_equals`, `in`, `not_in` | `EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id AND o.market_code = $v AND o.status <> 'cancelled')` |
| `tag` | `value_text` (`tags.slug`), or `customer_group_rule_values` for `in` / `not_in` | `equals`, `not_equals`, `in`, `not_in` | `customer_tags` → `tags.slug` |
| `accepts_marketing` | — | `is_true`, `is_false` | `customers.accepts_marketing` |

**`lifetime_spend` inherits `03 §6.2`'s two answers about the `price` field verbatim,
and it has to.**

- *Which number.* Lifetime value is **per currency** — `02 §2.3` deletes
  `customers.total_spent_minor` for exactly this reason and states that no query in
  the schema may sum across rows of `customer_currency_totals`. "Spent over $2,000"
  is therefore a statement about USD and nothing else, and the rule carries the
  market that names the currency. A `lifetime_spend` rule with no
  `value_market_code` is unwritable (`chk_cgr_money_market`). **Refunds are
  subtracted**: a customer who bought $5,000 and returned $4,800 is not a VIP, and
  a group built on gross spend is a group that rewards return fraud.
- *Which units.* The admin types major units (`2000`); `saveCustomerGroupRules()`
  converts once on write using `currencies.minor_unit` for the market's currency and
  stores the **integer minor-unit value** in `value_numeric`; the predicate compares
  `::bigint` against the indexed column. Changing a rule's market re-runs the
  conversion — 200000 cents and 200000 paise are not the same rule.

**`first_order_at` accepts a duration, and that is what makes the refresh bounded.**
`P90D` means "90 days ago" resolved at evaluation time; an absolute
`2026-01-01` means that date. `saveCustomerGroupRules()` validates the string
against `^\d{4}-\d{2}-\d{2}$|^P\d+[DMY]$` and stores it as typed. A duration is the
form a merchandiser actually wants ("customers whose first order was over a year
ago") and the absolute form is the one that quietly stops matching new people.

**`market` reads `orders`, deliberately not `customers.default_market_code`.**
`02 §2.3` calls that column "a hint for the switch banner only — **never** used to
resolve the market of a rendered page"; segmenting on it would make a browser
preference into a commercial fact. Served by
`idx_orders_customer (customer_id, created_at DESC)`.

### 1.4 Membership: one group, resolved by priority

`customers.customer_group_id` is a single `NOT NULL` FK, so a customer is in exactly
one group and two matching rule sets must be ordered. **Decision: lowest
`customer_groups.priority` wins; ties broken by `key` ascending** — the same
total-order discipline `04 §1.4.1` uses for `pricing_rules`, for the same reason
(an unordered tie is a price that depends on the planner).

```ts
// src/lib/customers/groups.ts
export async function resolveCustomerGroup(
  tx: Tx, customerId: string,
): Promise<{ groupId: string; changed: boolean }>;

export async function evaluateCustomerGroups(
  tx: Tx, opts: { customerIds?: string[]; groupId?: string; limit?: number },
): Promise<{ evaluated: number; moved: number }>;

export async function saveCustomerGroupRules(input: {          // perm: customer.update
  actor: Actor; groupId: string; rules: CustomerGroupRuleInput[];
  ruleMatch: 'all' | 'any'; expectedVersion: number;
}): Promise<Result<CustomerGroup, ConflictError | ValidationError>>;

export async function setCustomerGroupManually(input: {        // perm: customer.update
  actor: Actor; customerId: string; groupId: string | null;    // null = release the pin
  expectedVersion: number;
}): Promise<Result<Customer, ConflictError>>;
```

`resolveCustomerGroup` is one statement per customer:

```sql
UPDATE customers c
   SET customer_group_id = COALESCE(
         (SELECT g.id FROM customer_groups g
           WHERE g.mode = 'automatic'
             AND EXISTS (SELECT 1 FROM customer_group_rules r
                          WHERE r.customer_group_id = g.id)
             AND <predicate(g)>                       -- buildRulePredicate, per group
           ORDER BY g.priority, g.key
           LIMIT 1),
         (SELECT id FROM customer_groups WHERE is_default)),
       customer_group_assigned_at = now(),
       updated_at = now()
 WHERE c.id = $1
   AND c.anonymized_at IS NULL
   AND c.customer_group_source = 'rule'          -- the pin, below
   AND c.customer_group_id IS DISTINCT FROM COALESCE(…)   -- no-op writes do not touch updated_at
RETURNING c.customer_group_id;
```

**No match falls through to `is_default`**, which is why
`chk_customer_groups_default_manual` forbids the default group from being
`automatic`: a default group with rules is a group that can refuse the customers it
is the fallback for, and the `COALESCE` would then return `NULL` against a `NOT
NULL` column. `idx_customer_groups_default` already guarantees exactly one.

**Hard caps, enforced in `saveCustomerGroupRules()`**: at most **12** groups with
`mode = 'automatic'` and at most **10** rules each. `resolveCustomerGroup` runs
inside the order transaction (§1.5), so its cost is the one number that must stay
small; 12 × 10 indexed `EXISTS` fragments against one customer id is a sub-millisecond
plan, and a merchandiser who needs a thirteenth group is being told something useful.

### 1.5 A manual assignment is a pin, and a rule never overrides it

`customers.customer_group_source` is `'rule'` by default. `setCustomerGroupManually()`
with a non-null `groupId` writes `'manual'`, stamps
`customer_group_assigned_by_user_id` and writes an `audit_logs` row. **Every
rule-driven statement carries `WHERE customer_group_source = 'rule'`**, so a manual
assignment survives every refresh — structurally identical to
`product_collections.source = 'manual'` being outside both of `03 §6.4`'s
statements by construction, and it should be read as the same decision.

Releasing the pin is `setCustomerGroupManually(…, { groupId: null })`: it sets
`customer_group_source = 'rule'` and immediately calls `resolveCustomerGroup()`, so
the customer lands wherever the rules put them in the same transaction rather than
at the next nightly pass. `/admin/customers/[id]` renders the state as one of three
strings — *"Trade · assigned by rule"*, *"Trade · pinned by Anita on 4 Mar"*, or
*"Retail · default"* — because an admin who cannot tell a pin from a rule will
eventually fight one.

### 1.6 Recomputation without a full scan

Four paths, mirroring `03 §6.4`'s four triggers. Only one of them touches more than
one customer, and only one of them is a job.

| Trigger | Scope | Where it runs |
| --- | --- | --- |
| Order created, refund issued | `resolveCustomerGroup(tx, customerId)` — **one customer against ≤ 12 groups** | Inside the order / refund transaction, immediately after the `customers` and `customer_currency_totals` counters are written |
| A `customer_tags` row added or removed; `accepts_marketing` toggled; the pin released | same | Inside that mutation's transaction |
| `saveCustomerGroupRules()` | Full evaluation of **that one group's** members plus the candidates it could now claim | The save transaction if `COUNT(customers) ≤ 2000`, otherwise a `customer_group_refresh` job with `dedupe_key = 'group:' || id` |
| Nightly boundary sweep | Only customers whose **time-relative** boundary crossed since the last run | `customer_group_refresh` job, `dedupe_key = 'boundary:' || to_char(now(),'YYYY-MM-DD')` |

**The per-order evaluation runs inside the order transaction, not after it.**
`02 §5.3` already requires the counter writes to be in that transaction, and the
group is a pure function of them. Deferring it to a job means a customer who just
crossed the trade threshold is quoted retail pricing on their next page view, with
no error anywhere and no way to tell it happened — the same class of silent-wrong
that `03 §6.4` spends a paragraph on for collection membership.

> **RESOLVED — was CHANGE REQUIRED IN 02 §5.3:** the Checkout row's transaction contents gain
> *Verified applied in 02.*
> `→ resolveCustomerGroup()` immediately after "counters on `customers`". It is one
> `UPDATE` against one row by primary key and it must not be split out, because a
> group resolved from counters that were rolled back is a group nobody can explain.

> **RESOLVED — was CHANGE REQUIRED IN 05 §5.1:** `createOrderFromCart()`'s one-transaction list
> *Verified applied in 05.*
> gains the same step, and `customers.first_order_at` is written there as
> `COALESCE(first_order_at, now())`.

**The nightly sweep is a bounded range scan, not a pass over the customer table.**
For each `automatic` group and each of its time-relative rules, the job computes the
boundary the rule crossed and selects only the customers who crossed it:

```sql
-- rule: field='first_order_at', operator='lte', value_text='P90D'
SELECT c.id
  FROM customers c
 WHERE c.anonymized_at IS NULL
   AND c.customer_group_source = 'rule'
   AND c.first_order_at >= ($lastRunAt - interval '90 days')
   AND c.first_order_at <  ($now       - interval '90 days');
```

Served by `idx_customers_first_order` and `idx_customers_last_order` (`11 §8.6`
already commissions the second). On a day with no boundary crossings the job reads
zero customer rows. A group with no time-relative rule contributes **nothing** to
the nightly pass at all, because every other field's changes are already caught by
the transactional paths above. `customer_groups.last_refreshed_at` is stamped by the
full-evaluation paths only, and `/admin/customers/groups` renders a value older than
25 hours on an `automatic` group as a warning — a silently stale segment looks
exactly like a correctly empty one.

**The job kind.**

```ts
// src/lib/jobs/kinds.ts — one new row
customer_group_refresh: { kind: 'customer_group_refresh', systemPermitted: true,
                          dedupeKey: 'entity', maxAttempts: 3 },
```

> **RESOLVED — was CHANGE REQUIRED IN 11 §3.1 and §3.2:** add
> *Verified applied in 11.*
> `ALTER TYPE job_kind ADD VALUE 'customer_group_refresh';` as its own migration,
> and a registry row: enqueued by `saveCustomerGroupRules()` above 2,000 members and
> nightly from `run-jobs`; **system actor allowed: yes**; dedupe `entity`
> (`group:{id}` or `boundary:{date}`); note "Evaluates one customer against ≤ 12
> groups; never writes a row whose `customer_group_source = 'manual'`". It is
> `systemPermitted: true` and satisfies `11 §3.3` property 2: the handler calls
> `resolveCustomerGroup()`, which takes no `Actor` and performs no permission check
> of its own — assignment by rule is not an act of authority, which is exactly why
> the pin exists for the cases that are.

> **RESOLVED — was CHANGE REQUIRED IN 11 §5.2:** `/api/cron/run-jobs`'s "What breaks if it does not
> *Verified applied in 11.*
> run" cell gains "and no customer crosses a spend or tenure threshold until someone
> edits them by hand".

### 1.7 What a group can actually affect

**Pricing — through `pricing_rules`, and only there.** `02 §2.3` already states it:
"Group pricing is **not** a second price table: it is a `pricing_rules` row with
`scope_type = 'customer_group'`." `04 §1.4.1` already ranks `customer_group` second
in the narrower-scope tie-break, and `04 §1.4.1`'s batched scope query already
carries "(step 6) the customer's group". Nothing new is needed and nothing new is
added. Two consequences that are new, because nothing states them:

1. **A customer-group price is never rendered inside a cached page.**
   `getDisplayPrice()` takes no customer (`01 §2.3`, `01 §2.4`) and is what every
   ISR-cached PLP card, PDP shell, feed and JSON-LD graph reads; `resolvePrice()`
   takes `customerId` and always hits the database. A group price that appeared in a
   cached object would be served to the next stranger, which is both a pricing leak
   and a hard-rule-3 violation. `tests/unit/jsonld-truth.test.ts` (`08 §3.2`) already
   asserts the JSON-LD half of this and needs no change.
2. **The seam where a signed-in customer sees their own price is the dynamic island
   that already exists.** `01 §2.4` makes the PDP's add-to-bag region a `<Suspense>`
   boundary whose child calls `getAvailability()` with `cache: 'no-store'`.

   > **RESOLVED — was CHANGE REQUIRED IN 01 §2.4:** that boundary's child additionally calls
   > *Verified applied by inspection of the target document.*
   > `resolvePrice({ variantId, marketCode, quantity: 1, customerId })` **when a
   > customer session exists**, and renders the group price with the public price
   > struck through. For an anonymous visitor it renders nothing extra and issues no
   > extra query. The cached shell keeps the public price, so the crawler, the feed
   > and the JSON-LD stay identical to today.

   The bag and checkout need no change: they are uncached and already call
   `resolvePriceBatch()` with the customer.

**Discounts — through `coupon_conditions`.** `coupon_condition_type` already has
`customer_group` (`02 §1.9`) and `coupon_conditions.target_id` is the
`customer_groups.id`. The condition is evaluated in `evaluateDiscounts()` against
the **customer's group at the moment the order is built**, not at the moment the
coupon was applied to the cart — a customer who crosses a threshold mid-session
gets the trade coupon, and one whose pin is released loses it, and either way the
`order_items.discount_breakdown` snapshot records what actually happened.

**Visibility — one lever ships, one is explicitly refused.**

| Lever | Release 1 |
| --- | --- |
| Group-scoped **coupons** (a code only the trade group may redeem) | **Ships** — `coupon_conditions`, above |
| Group-scoped **prices** | **Ships** — `pricing_rules`, above |
| Group-scoped **admin segmentation**: filter, saved view, export, campaign audience | **Ships** — `11 §8.6` already whitelists `customer_group_id` with `eq` and `in`, so the list, the saved view and the export all work with no new code |
| A group-gated **catalogue** ("trade-only products") | **Refused for release 1**, and the reason is architectural, not effort |

A per-group catalogue makes product visibility a function of the viewer. Product
visibility is currently expressed by `products.status`, `published_at`,
`product_market_content.is_published` and `markets.is_active`, and all four are
inputs to an **ISR cache key, a sitemap shard, a Merchant feed and a JSON-LD
graph** (`08 §3.1`, `§3.3`, `§3.7`, `§4.2`). Adding a viewer dimension either
splits every cached object per group or makes the storefront dynamic — a different
caching architecture, not a feature. If the client wants trade-only merchandise, the
supported shape is a **separate market** (`markets` row, its own `prices`, its own
activation), which the architecture already extends to without a rebuild.

> **NEEDS INPUT:** whether the client sells to trade or wholesale buyers at
> different prices, and whether any product must be *invisible* to retail customers
> rather than merely priced differently. Different prices are a `pricing_rules` row
> today. Invisibility is a market, and it is a decision worth taking before P14
> rather than after.

### 1.8 Admin surface and seed

| Path | Permission |
| --- | --- |
| `/admin/customers/groups` (list: name, mode, priority, member count, `last_refreshed_at`) | `customer.read` |
| `/admin/customers/groups/[id]` (rule builder, reusing the collection rule-builder component) | `customer.update` |
| `/admin/customers/groups/[id]/preview` (the first 50 members the current unsaved rules would claim, with a count — the same preview the collection builder gives) | `customer.update` |
| `/admin/customers/[id]/group` (pin, release, view provenance) | `customer.update` |
| `/admin/customers/tags` (`tags` rows flagged `is_visible = false`, usage counts) | `tag.update` to create; `customer.update` to assign |

`prisma/seed/…` seeds **one** group: `retail`, `is_default = true`, `mode =
'manual'`, `priority = 1000`, no rules. `trade` and `vip` are named in `02 §2.3`'s
column example and are **not** seeded, because their thresholds are a commercial
fact (hard rule 8). The rule builder is the place the client creates them.

> **NEEDS INPUT:** the customer groups the client actually operates, and for each
> one its rule — the spend figure and currency, the order count, or the tenure. No
> threshold is invented here; `retail` as the sole default is the seeded state.

**Tests commissioned:** `tests/unit/customer-group-rules.test.ts` (every
field × operator pairing in §1.3 compiles to SQL; every pairing outside it is
rejected by `saveCustomerGroupRules`); `tests/integration/customer-group-eval.test.ts`
(a manual pin survives a full refresh; a customer crossing a spend threshold inside
the order transaction is in the new group when that transaction commits and in the
old one if it rolls back; `lifetime_spend` in USD ignores INR spend entirely);
`tests/integration/customer-group-priority.test.ts` (two matching groups resolve by
priority then key, deterministically, over 100 shuffled evaluations).

---

## 2. Gift-card issuance (gap 9)

`05 §8.7` specifies redemption exhaustively and issuance not at all.
`gift_cards.issued_by_order_id` implies a card is bought as a product;
`email_templates` seeds `gift_card_issued`; nothing connects them.

### 2.1 The feature flag, first

**Gift cards stay behind `settings['feature.gift_cards_enabled']`, seeded `false`,
for release 1.** The flag already exists (`02 §2.8`, `02 §6`, `05 §8.7`) and
`GIFT_CARD_CODE_PEPPER` is required only when it is true (`05 §8.7`). Everything in
this section is built and tested at launch and switched on when the client answers
the expiry question that `02 §2.7` and `05 §8.7` both raise. Concretely, `false`
means: the gift-card product is not seeded, `/admin/gift-cards` renders the
unconfigured panel naming the flag, `applyGiftCard()` returns
`IntegrationUnconfiguredError`, and no `gift_card` line can enter a cart.

### 2.2 A gift-card product is a product, with a kind

```sql
CREATE TYPE product_kind AS ENUM ('physical', 'gift_card');    -- own migration

ALTER TABLE products
  ADD COLUMN kind product_kind NOT NULL DEFAULT 'physical';
CREATE INDEX idx_products_kind ON products (kind) WHERE kind <> 'physical' AND deleted_at IS NULL;

ALTER TABLE order_items
  ADD COLUMN product_kind product_kind NOT NULL DEFAULT 'physical';   -- snapshot, hard rule 4

ALTER TABLE gift_cards
  ADD COLUMN issued_by_order_item_id UUID     NULL REFERENCES order_items (id) ON DELETE RESTRICT,
  ADD COLUMN issue_unit_index        SMALLINT NULL,
  ADD COLUMN recipient_email         TEXT     NULL,
  ADD COLUMN deliver_at              TIMESTAMPTZ NULL,
  ADD COLUMN delivered_at            TIMESTAMPTZ NULL,
  ADD CONSTRAINT chk_gift_cards_issue_pair
    CHECK ((issued_by_order_item_id IS NULL) = (issue_unit_index IS NULL));
CREATE UNIQUE INDEX uq_gift_cards_issue_line
  ON gift_cards (issued_by_order_item_id, issue_unit_index)
  WHERE issued_by_order_item_id IS NOT NULL;
CREATE INDEX idx_gift_cards_undelivered
  ON gift_cards (deliver_at) WHERE delivered_at IS NULL AND deliver_at IS NOT NULL;
```

**`uq_gift_cards_issue_line` is the idempotency of issuance and the reason
`issued_by_order_id` alone was not enough.** A replayed webhook, a retried
transaction, or a manual reconciliation pass would otherwise mint a second set of
cards for a paid order — real money, created by a retry. `05 §4.3`'s
`webhook_events` de-duplication is the first line of defence; this index is the one
that holds when someone replays an event from the provider dashboard.

**The shape of the product.** One `products` row, `kind = 'gift_card'`,
`is_one_of_a_kind = false`, with one `product_variants` row per denomination
carrying an option value (`$50`, `$100`, `$250`) and:

| Field | Value | Why |
| --- | --- | --- |
| `inventory_policy` | **`untracked`** | `02 §2.6`: no `inventory_items` row exists, so `reserveStock()` never runs and `commitStock()` has nothing to commit. A `tracked` gift card needs a fake on-hand number that a nightly reconciliation then has to defend — hard rule 7 |
| `gross_weight_grams` | `NULL` | It has no weight; `quoteShipping()` excludes `gift_card` lines from `lines[]` entirely, so a digital card never adds a shipping band |
| `tax_code` | `NULL`, and `quoteTax()` excludes the line | A gift card is the purchase of tender, not of goods; tax attaches when it is spent. The exclusion is in `computeTaxableLines()`, one predicate on `product_kind` |
| `prices` | One manual row per market per denomination | Face value *is* the price, per market, with no FX between them (hard rule 2). There is no `face_value_minor` column |

**A gift card's price is never discounted, and that is a constraint rather than a
preference.** `evaluateDiscounts()` skips lines whose `product_kind = 'gift_card'`,
`quoteOrderDiscounts()` excludes their subtotal from `min_subtotal` conditions, and
`setFormulaBinding()` refuses a variant whose product is `gift_card`. Reason:
`initial_balance_minor` is set from what the customer **paid**, so a $100 card sold
for $90 either issues $90 (and the recipient's card is short) or issues $100 (and
the merchant has minted $10 of liability from a coupon). Discounting tender is
minting money, and stacking a coupon onto a card is a documented fraud pattern —
buy discounted cards, redeem at face. With the exclusion, `unit_final_minor =
unit_list_minor` always, and `initial_balance_minor = unit_final_minor`
unambiguously.

**A gift card may not be bought with a gift card.** `applyGiftCard()` refuses when
the checkout session contains any `gift_card` line, returning `GiftCardInvalidError`
with `copy.error.gift_card_invalid` — otherwise a stolen card becomes a laundered
card with a new code and no trace to the original.

**Availability and markup.** `11 §7.1` maps `inventory_policy IN
('made_to_order','untracked')` to the band `made_to_order`, whose surface copy is
"Made to order · ships in N days" and whose JSON-LD is `PreOrder`. Both are wrong
for a card delivered by email in a minute, and the band union is closed at five
values and stays closed.

> **RESOLVED — was CHANGE REQUIRED IN 11 §7.1:** the `made_to_order` row's Surface cell gains: "for
> *Verified applied in 11.*
> a product whose `kind = 'gift_card'` the copy key is
> `copy.availability.gift_card` and the JSON-LD is `InStock` — the band is
> unchanged, the *rendering* of the band branches on `products.kind`."

> **RESOLVED — was CHANGE REQUIRED IN 08 §3.2:** the `offers.availability` derivation gains the same
> *Verified applied in 08.*
> branch. `tests/unit/jsonld-truth.test.ts`'s assertion "every `availability` matches
> the band the page showed" holds, because both sides read the same branch.

### 2.3 Recipient details ride on columns that already exist

`cart_items.personalisation JSONB` and `order_items.personalisation JSONB` already
exist (`02 §2.7`) and are already snapshotted. For a `gift_card` line,
`addToCart()` validates `personalisation` against:

```ts
// src/lib/giftcards/schema.ts
export const GiftCardPersonalisation = z.object({
  recipientName:  z.string().trim().min(1).max(120),
  recipientEmail: z.string().trim().toLowerCase().email(),
  senderName:     z.string().trim().min(1).max(120),
  message:        z.string().trim().max(500).optional(),
  deliverAt:      z.string().datetime().nullable().default(null), // null = on payment
});
```

`deliverAt` is validated as no more than 365 days ahead and is stored on the
`gift_cards` row, not only in the JSON, so the delivery sweep is an index probe
(`idx_gift_cards_undelivered`) rather than a JSONB scan. A line with `quantity > 1`
produces `quantity` separate cards to the same recipient, each with its own code —
which is what "buy three $50 cards" means.

### 2.4 Code generation, issuance, delivery

```ts
// src/lib/giftcards/issue.ts
export function generateGiftCardCode(): { code: string; normalized: string; last4: string };
// 16 bytes of crypto.randomBytes → Crockford base32 (no I, L, O, U) → 26 chars,
// displayed as XXXXX-XXXXX-XXXXX-XXXXX-XXXXXX. normalize() strips hyphens and
// upper-cases before hmac_sha256(normalized, GIFT_CARD_CODE_PEPPER) — 05 §8.7's
// 128 bits, so there is no dictionary for an attacker holding the pepper to grind.

export async function issueGiftCardsForOrder(tx: Tx, orderId: string): Promise<IssuedCard[]>;
export async function issueGiftCard(input: {                    // perm: coupon.manage
  actor: Actor; currencyCode: CurrencyCode; amountMinor: bigint;
  recipientEmail: string; expiresAt: Date | null; reason: string;
}): Promise<Result<{ giftCardId: string; code: string }, ValidationError | ForbiddenError>>;
export async function voidAndReissue(input: {                   // perm: coupon.manage
  actor: Actor; giftCardId: string; reason: string;
}): Promise<Result<{ giftCardId: string; code: string }, ValidationError>>;
```

`issueGiftCardsForOrder(tx, orderId)` is called from **`handleProviderWebhook()`'s
paid path, in the same transaction as `commitStock()` and the confirmation-email
enqueue** (`05 §4.3` step 9). For every `order_items` row with `product_kind =
'gift_card'`, for each unit `0 … quantity-1`:

1. `INSERT INTO gift_cards (…, issued_by_order_id, issued_by_order_item_id,
   issue_unit_index, currency_code, initial_balance_minor, balance_minor,
   status, recipient_email, deliver_at) … ON CONFLICT ON CONSTRAINT
   uq_gift_cards_issue_line DO NOTHING RETURNING id` — zero rows means a replay,
   and the whole step becomes a no-op with no second card and no second email.
2. `INSERT INTO gift_card_transactions (type = 'issue', amount_delta_minor = +initial,
   balance_after_minor = initial, order_id, market_code, currency_code,
   actor_type = 'system')` — the ledger row `02 §2.7`'s nightly reconciliation needs.
3. Enqueue `send_email` with `dedupe_key = 'giftcard:' || giftCardId`, so a retried
   webhook cannot mail the code twice.

`currency_code` is the order's currency, held by
`(gift_card_id, currency_code) → gift_cards (id, currency_code)` and
`(order_id, market_code, currency_code) → orders (…)`. **A card issued by a US order
is a USD card and can only ever be spent in USD**; there is no conversion and a
recipient in India cannot spend it (`02 §2.7`, hard rule 2). The storefront says so
on the product page — *"A gift card is issued in the currency it is bought in and
can be spent only in that currency."* — because discovering it at checkout is the
worst possible moment.

**Delivery, and the one uncomfortable trade-off, taken explicitly.** The plaintext
code exists for exactly as long as it takes to mail it. It is never stored on the
row, never written to `email_logs` (which has no body column, `02 §2.9`), and never
logged. But `11 §3.2` types the `send_email` payload as
`{ templateKey, toEmail, marketCode, entityRef }`, and the code has to reach the
handler somehow.

**Decision: the code travels in `jobs.payload.secret`, and the payload is made safe
rather than the mechanism changed.** Three rules:

- `runJob()` deletes the row — `DELETE FROM jobs WHERE id = $1` — instead of marking
  it `succeeded`, for any job whose payload contains `secret`. There is no 90-day
  retention window on a bearer instrument.
- `/admin/system/jobs` redacts `payload.secret` for every kind, as a field-name rule
  in the serializer rather than a per-kind case, and
  `tests/api/jobs-redaction.test.ts` asserts `job.read` never sees it.
- On permanent failure (`attempts = max_attempts`), the handler scrubs
  `payload.secret` to `null` and the card is **unrecoverable by design**. The admin
  action is `voidAndReissue()`: it writes a `type = 'adjust'` ledger row zeroing the
  old card, sets `status = 'cancelled'`, and issues a new card for the same amount
  linked to the same order item with `issue_unit_index` incremented past the
  existing rows — so the unique index still holds and the ledger still reconciles.

The alternative — sending the mail inline after commit, outside the job queue — is
the exact failure `05 §4.3` and `11 §3.3` exist to prevent: an after-commit send
loses the artefact for a paid order with no trace anywhere.

A card with `deliver_at` in the future is issued at payment (the money is settled
and the liability is real) and **mailed by a sweep**, not at payment:
`/api/cron/run-jobs`'s prelude selects
`gift_cards WHERE delivered_at IS NULL AND deliver_at <= now()` over
`idx_gift_cards_undelivered` and enqueues the same `send_email` job — and it cannot
carry the plaintext, because the plaintext is gone. **Therefore a scheduled card's
code is generated at delivery time, not at issue time**: the row is written at
payment with `code_hash = NULL`… which `uq_gift_cards_code_hash` forbids.

**Resolution: scheduled delivery is out of scope for release 1.** `deliver_at` is
`NULL` on every card, the column and the index ship so the feature is a sweep and a
copy string later, and `GiftCardPersonalisation.deliverAt` is rejected with
`ValidationError` while `settings['giftcards.allow_scheduled_delivery']` is `false`
(seeded `false`). Shipping the column without the behaviour is cheap; shipping a
nullable `code_hash` to support it is a hole in the uniqueness that redemption
depends on.

### 2.5 Expiry

`gift_cards.expires_at` is `NULL` on every card at launch, and
`settings['giftcards.expiry_months']` (`value_type = 'number'`, market-scoped) is
seeded `NULL`. **A `NULL` expiry means the card never expires, which is the only
policy that is safe in every jurisdiction and is therefore the seeded one.**

Expiry needs no cron for correctness: `applyGiftCard()` already checks
`expires_at > now()` and the redemption `UPDATE` already carries
`AND (expires_at IS NULL OR expires_at > now())`, so an expired card is unusable the
instant it expires. What the `gift_card_status` value `expired` and the
`gift_card_transactions.type` value `expire` need is a **writer**, so the balance
reported to the client matches the balance that is actually spendable:

```sql
-- one statement added to the nightly consistency_check handler, and the only
-- self-healing action that job takes. It is a pure function of the clock.
WITH expired AS (
  UPDATE gift_cards SET status = 'expired', balance_minor = 0, version = version + 1
   WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at <= now()
     AND balance_minor > 0 AND deleted_at IS NULL
  RETURNING id, currency_code, balance_minor AS prior)
INSERT INTO gift_card_transactions
  (id, gift_card_id, currency_code, amount_delta_minor, balance_after_minor,
   type, actor_type, created_at)
SELECT gen_random_uuid(), id, currency_code, -prior, 0, 'expire', 'system', now()
  FROM expired;
```

It reads zero rows at launch because no card has an `expires_at`.

> **NEEDS INPUT:** restated once, from `02 §2.7` and `05 §8.7`, because it is the
> gate on the feature flag — whether gift cards are in scope, and their expiry
> policy per market. Several US state statutes and Indian RBI prepaid-instrument
> rules restrict expiry on stored-value instruments; the architecture supports
> "never expires", "expires in N months", and different answers per market, and
> invents none of them.

### 2.6 `/admin/gift-cards` — what staff can actually do

All rows `coupon.manage`, which `11 §1.3` row 47 already describes as covering
"gift-card issuance". **No new permission key is added.**

| Path | Action |
| --- | --- |
| `/admin/gift-cards` | List: `code_last4`, currency, `initial_balance_minor`, `balance_minor`, status, `issued_to_customer_id`, `issued_by_order_id`, `expires_at`. Filters: status, currency, balance range, issued-by-order present. **The code is never rendered, never exported, never searchable** — support identifies a card by the last four the customer reads out, over `idx_gift_cards_last4` |
| `/admin/gift-cards/[id]` | The full `gift_card_transactions` ledger with running balance, each row's order link and actor. This is the screen that answers "where did my balance go" |
| `/admin/gift-cards/new` | Manual issuance — `issueGiftCard()`. Capped by `settings['giftcards.manual_issue_max_minor']` (money, market-scoped, **seeded `NULL` = manual issuance disabled**); above the cap the form refuses with `ValidationError` and names the setting. Every issuance writes an `audit_logs` row with the amount and the reason, and the code is displayed **once**, in the response, with a "copied" affordance and no way to retrieve it again |
| `/admin/gift-cards/[id]/adjust` | `type = 'adjust'`, signed, reason required. This is the goodwill-credit path `02 §2.7` removed the `balance_minor <= initial_balance_minor` CHECK for |
| `/admin/gift-cards/[id]/disable` · `/enable` | `status` → `disabled` / `active`. Reversible, balance untouched — the "customer says their code leaked" action |
| `/admin/gift-cards/[id]/void-reissue` | `voidAndReissue()`, type-to-confirm. The only recovery for an undelivered code |
| `/admin/customers/[id]` | Gains a Gift cards panel listing cards where `issued_to_customer_id = $id`, balances only |

**Refunding an order line that issued a card** (`05 §9.2`): the refundable amount is
capped at the card's **remaining** balance, not the line total. A $100 card with $30
spent refunds at most $70, and the refund writes a `type = 'adjust'` row taking the
card to zero plus `status = 'cancelled'`. Refunding the full $100 would return money
the customer already spent as goods.

`idx_gift_cards_last4` is new:
`CREATE INDEX idx_gift_cards_last4 ON gift_cards (code_last4) WHERE deleted_at IS NULL;`

**Tests commissioned:** `tests/integration/gift-card-issue.test.ts` (a paid order
with a `gift_card` line issues exactly one card per unit, with
`initial_balance_minor = unit_final_minor`, one `issue` ledger row each, and one
`send_email` job each; replaying the webhook issues nothing further and mails
nothing further); `tests/integration/gift-card-no-discount.test.ts` (a 20%-off
coupon applied to a bag containing a gift card discounts the other lines and not the
card, and the card's `initial_balance_minor` equals its list price);
`tests/unit/gift-card-code.test.ts` (26-char Crockford alphabet, normalisation is
hyphen- and case-insensitive, 10,000 generated codes are distinct, `last4` matches
the normalised tail).

---

## 3. Reviews (gap 11)

Two documents exclude reviews and both are right. `08 §3.2`: "**No
`aggregateRating`, no `review`, ever.** There is no `reviews` table in this schema" —
because structured data must never assert a fact the platform cannot guarantee, and
a rating block is the single most commonly faked piece of structured data. `09 §5.2`
defers the feature with the trigger "Only when there are real customers to write
them". The brief asks for reviews, and `00-CONTEXT §5` lists `Review` among the
prior art this build must go materially further than. A descope of a named
requirement belongs where the client reads it.

### 3.1 The decision

> **DECISION CHANGED — reviews now ship, and only the customer-facing submission
> UI is deferred.** This section previously read "reviews are deferred as a
> customer-facing feature and shipped as a schema seam": three empty tables, no
> moderation screen, no permission key, and `aggregateRating` gated behind a second
> feature flag and a threshold of five ratings. The set has settled it the other
> way, and the settled position is the one that was always correct — the old text
> deferred the *truth machinery* along with the feature, which is what left `08`,
> `09` and this document each asserting something different about the same table.

**The schema and the admin moderation queue ship in release 1. What defers is the
customer-facing review submission UI.** Concretely:

1. `product_reviews`, `product_review_stats` and `product_review_votes` are created
   in the launch migration (§3.2), **not** as dead weight: they are the tables the
   moderation screen reads and writes.
2. `/admin/catalog/reviews` ships, and with it the permission key
   `review.moderate`. The catalogue moves from 72 keys to **73** (§3.3).
3. `aggregateRating` is emitted **only** when that product's
   `product_review_stats.approved_count > 0`, with `ratingValue` and `reviewCount`
   computed from approved rows and nothing else (§3.4). There is no second flag and
   no minimum-count threshold, because there does not need to be one: a product with
   one approved, purchase-linked rating has exactly one rating, and saying so is
   true.
4. `settings['feature.reviews_enabled']` — seeded `false` — gates the **storefront
   write form and the PDP review block**, which is the part that is not built at
   launch (§3.3).

The reasoning, stated so it can be argued with rather than assumed:

1. **A review system with no reviews is worse than none — on the storefront.** An
   empty "0 reviews" block on every one of 2,000 product pages is a site-wide
   statement that nobody has bought anything. That argument is about a *rendered
   block*, and it is why the PDP block and the write form wait. It was never an
   argument against the schema or against staff being able to moderate what arrives
   the moment the form does ship.
2. **The structured-data rule is not negotiable and does not soften — it gets
   sharper.** `08 §3.2`'s position was "no `aggregateRating`, ever, there is no
   reviews table", which is a rule enforced by an absence. An absence stops being
   enforcement the day someone adds the table. The rule is now enforced by a
   predicate over real rows: markup asserts a rating exactly when an approved,
   purchase-linked rating exists, and never otherwise. Hard rules 7 and 8 hold in
   the form they were written for — structured data never asserts a fact the
   platform cannot guarantee — and they now hold against a system that *has* the
   fact rather than against one that cannot have it.
3. **The expensive part is the schema, and it is free now.** The parts that are
   *not* cheap are the ones that touch existing tables — a rating rollup, a
   verified-purchase link into `order_items`, a moderation status, a permission key
   and a matrix row. Doing all of it now means the eventual storefront work is a
   component, a route and one `settings` row, with **no `ALTER TABLE` on
   `products`, `order_items` or `customers`** and no backfill.

### 3.2 What ships now

```sql
CREATE TYPE review_status AS ENUM ('pending', 'approved', 'rejected');  -- own migration

CREATE TABLE product_reviews (
  id                 UUID PRIMARY KEY,
  product_id         UUID NOT NULL REFERENCES products (id)    ON DELETE RESTRICT,
  variant_id         UUID NULL     REFERENCES product_variants (id) ON DELETE SET NULL,
  order_item_id      UUID NOT NULL REFERENCES order_items (id) ON DELETE RESTRICT,
  customer_id        UUID NULL     REFERENCES customers (id)   ON DELETE SET NULL,
  market_code        CHAR(2) NOT NULL REFERENCES markets (code) ON DELETE RESTRICT,
  rating             SMALLINT NOT NULL,
  title              TEXT NULL,
  body               TEXT NULL,
  display_name       TEXT NOT NULL,
  status             review_status NOT NULL DEFAULT 'pending',
  moderated_by_user_id UUID NULL REFERENCES users (id) ON DELETE SET NULL,
  moderated_at       TIMESTAMPTZ NULL,
  moderation_note    TEXT NULL,
  approved_at        TIMESTAMPTZ NULL,
  version            INTEGER NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_product_reviews_rating   CHECK (rating BETWEEN 1 AND 5),
  CONSTRAINT chk_product_reviews_body     CHECK (body IS NULL OR length(body) <= 4000),
  CONSTRAINT chk_product_reviews_moderated
    CHECK ((status = 'pending') = (moderated_at IS NULL)),
  CONSTRAINT chk_product_reviews_approved
    CHECK ((status = 'approved') = (approved_at IS NOT NULL))
);
CREATE UNIQUE INDEX uq_product_reviews_order_item ON product_reviews (order_item_id);
CREATE INDEX idx_product_reviews_product
  ON product_reviews (product_id, created_at DESC) WHERE status = 'approved';
CREATE INDEX idx_product_reviews_queue
  ON product_reviews (created_at) WHERE status = 'pending';
CREATE INDEX idx_product_reviews_customer
  ON product_reviews (customer_id, created_at DESC) WHERE customer_id IS NOT NULL;

CREATE TABLE product_review_stats (            -- the rollup; market-independent by design
  product_id      UUID PRIMARY KEY REFERENCES products (id) ON DELETE CASCADE,
  approved_count  INTEGER  NOT NULL DEFAULT 0,  -- rows with status = 'approved'. Nothing else.
  rating_sum      INTEGER  NOT NULL DEFAULT 0,  -- summed over those same rows
  avg_rating_bp   INTEGER  NOT NULL DEFAULT 0,  -- basis points: 4.37 stars = 43700
  last_review_at  TIMESTAMPTZ NULL,
  computed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_prs_counts CHECK (approved_count >= 0 AND rating_sum >= 0),
  CONSTRAINT chk_prs_avg    CHECK (avg_rating_bp BETWEEN 0 AND 50000),
  CONSTRAINT chk_prs_empty  CHECK ((approved_count = 0) = (rating_sum = 0))
);

CREATE TABLE product_review_votes (            -- "was this helpful", ships empty
  review_id   UUID NOT NULL REFERENCES product_reviews (id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers (id)       ON DELETE CASCADE,
  is_helpful  BOOLEAN NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pk_product_review_votes PRIMARY KEY (review_id, customer_id)
);
```

**`order_item_id` is `NOT NULL`, and that single decision replaces a moderation
department.** Verification is a foreign key, not a boolean an admin can flip: no
purchase, no review, structurally. It kills review spam without a spam filter, it
makes "verified purchase" a fact the platform can guarantee — which is precisely
what `08 §3.2` demands before anything may be asserted in markup — and
`uq_product_reviews_order_item` makes it one review per purchased line. The cost is
that a customer who bought at a trade show cannot review; the answer is that staff
create a draft order (`05 §6`), which is a real record of a real sale.

**`market_code` is captured and the rollup is not scoped by it.** A rating is an
opinion about a piece, not about a price, so `product_review_stats` has one row per
product. The column exists because the review was written in a market and the
moderation queue, the export and any future per-market display need to know which.
This is deliberately *unlike* `product_market_sort`, and the difference is that a
rating carries no currency.

**`avg_rating_bp` is an integer in basis points, never a float.** Hard rule 10 is
written about money, and the reasoning — that a stored float is a number nobody can
reproduce — applies identically to an average a structured-data assertion is built
on. `rating_sum` and `approved_count` are the durable facts;
`avg_rating_bp = round(rating_sum * 10000 / approved_count)` is derived and stored
so a sort does not recompute it, and is `0` when `approved_count = 0`.

> **DECISION CHANGED — one word, and the two names for one fact are now one.**
> `review_status`'s middle value was `published`, the timestamp was `published_at`
> and the rollup column was `rating_count`. The set-level decision names the gate
> `product_review_stats.approved_count`, so the whole vocabulary is **approved**:
> `status = 'approved'`, `approved_at`, `approved_count`,
> `chk_product_reviews_approved`, and `idx_product_reviews_product` partial on
> `status = 'approved'`. "Published" also collided with `products.published_at` and
> `cms_pages` publication, which are a different act by a different actor.
> `chk_prs_empty` is new and small: it makes a zero count with a non-zero sum
> unwritable, so the one state `mayEmitAggregateRating()` reads cannot be corrupted
> into a half-truth by a bad rollup.

**The rollup is written by the moderation action, in its transaction.** Approving
or rejecting a review recomputes that product's `product_review_stats` row inside
the same `UPDATE product_reviews` transaction and purges `tags.product(id)`. There
is no nightly rollup job for it: a moderation decision happens a few times a day,
the recompute is an aggregate over a handful of rows keyed by `product_id`, and a
job would put a window between "staff approved it" and "the page can say so" during
which `aggregateRating` and the visible rating disagree. `mayEmitAggregateRating()`
(§3.4) reads that row and nothing else.

**`display_name` is stored, not derived from `customers.first_name`.** The customer
types it. A review page that renders a name pulled from the account record publishes
PII the customer never chose to publish, and `07 §8.2`'s wishlist rule — render what
the customer typed, never the account's name or email — is the same rule.

### 3.3 What ships, what does not, and what it costs to turn the rest on

**Ships in release 1:**

| Shipping | What it is |
| --- | --- |
| The three tables of §3.2 | Created and **used**, not dead weight |
| `/admin/catalog/reviews` | The moderation queue: the `pending` list over `idx_product_reviews_queue`, ordered oldest first, with approve / reject / note per row. A bespoke list, not a `DataTable` resource (`13 §1.1`) — `saved_view_resource` stays at eight |
| `review.moderate` | The **73rd** permission key. Granted to `owner`, `admin`, `catalog_manager` |
| `mayEmitAggregateRating()` | §3.4 — the one function that decides whether markup may carry a rating |
| The rollup write | §3.2 — inside the moderation transaction, with the product's cache tag purged |

> **RESOLVED — was CHANGE REQUIRED IN 11 §1.3 and §1.4:** add the catalogue's 73rd key —
> *Verified applied in 11.*
> `| 73 | `review.moderate` | Approve, reject and annotate `product_reviews`; the `/admin/catalog/reviews` queue | **15 §3.3 — new here** | — |`,
> filed under **Catalogue** — and grant it to `owner`, `admin` and
> `catalog_manager` in the role matrix. §1.3's "the complete catalogue — 72 keys"
> heading and its closing count become 73. `11 §1.2` rule 1 is satisfied in the
> right order: the key is in the registry before the route references it.
> `order_manager` does **not** hold it — a review is catalogue content, not an
> order record, and the order team has no reason to publish customer prose.

> **RESOLVED — was CHANGE REQUIRED IN 08 §5:** add `| /admin/catalog/reviews | review.moderate |
> *Verified applied by inspection of the target document.*
> Moderation queue: pending reviews oldest first, approve / reject / note |` to
> the Catalogue section of the admin route map. It is the only admin screen this
> document adds that `08 §5` does not already carry a sibling for.

**Does not ship, and what it costs when it does:**

| Not shipping | Gated by | The work when it does |
| --- | --- | --- |
| Storefront review block on the PDP | `settings['feature.reviews_enabled']`, seeded `false` | A component and an ISR tag — `tags.product(id)` already exists and an approval purges it |
| `POST /api/account/reviews` and the write form | the same flag | One route, `customer` auth, a `review:customer:<id>` rate-limit row in `11 §4.2`, the `order_item_id` lookup |
| A review-request email | the same flag | One `email_templates` key, `review_request`, and a trigger off `shipments.status = 'delivered'` |
| Review photos | — | Not planned. Media moderation is a different problem with a different cost |

**Until the flag is turned on the queue is empty, and that is correct rather than
awkward.** No route writes a `product_reviews` row, so there is nothing to
moderate; the screen renders its empty state ("No reviews to moderate"). What has
been bought is that the day the write form ships, the permission, the queue, the
rollup and the markup gate already exist and have already been reviewed — which is
exactly the set of things that gets rushed when a feature arrives after launch.
Staff may also enter a review taken by phone or at a trade show against a real
`order_items` row, which is the one write path that exists on day one.

### 3.4 The absolute rule: no rating markup before real ratings

This survives `feature.reviews_enabled` being switched on. Enabling reviews does
**not** enable markup.

`buildJsonLd()` may emit `aggregateRating` only when **all four** hold, checked in
one function with no other caller:

```ts
// src/lib/seo/jsonld.ts
function mayEmitAggregateRating(stats: ProductReviewStats | null): boolean {
  return settings.bool('feature.reviews_structured_data')        // seeded false, separate flag
      && stats !== null
      && stats.rating_count >= settings.int('reviews.min_ratings_for_markup')  // seeded 5, min 1
      && stats.rating_count > 0;
}
```

and `product_review_stats` counts **only** reviews with `status = 'published'` — each
of which carries a `NOT NULL order_item_id`, so every counted rating is a verified
purchase by construction. There is no code path that counts a pending, rejected or
unverified review, because there is no unverified review.

- `feature.reviews_structured_data` is a **second flag**, deliberately. Turning
  reviews on for customers and turning them on for Google are different decisions
  with different consequences — the first is reversible, the second is a manual
  action risk — and one flag would collapse them.
- `saveSeoMetadata()`'s override allowlist keeps rejecting any object containing
  `aggregateRating`, `review` or `ratingValue`, unchanged (`08 §3.2`). The override
  is not a back door around this rule and never becomes one.
- `tests/unit/jsonld-truth.test.ts` (`08 §3.2`) asserts "no `aggregateRating` key
  anywhere" against the seeded catalogue and **needs no change**, because the seed
  contains zero reviews and `99-demo.ts` seeds none.
- `tests/unit/jsonld-rating-gate.test.ts` is new and asserts all four conditions
  independently: four ratings emit nothing at a threshold of five; five pending
  reviews emit nothing; five published reviews with the flag off emit nothing; five
  published reviews with the flag on emit `ratingValue` equal to
  `avg_rating_bp / 10000` to two decimal places and `reviewCount` equal to
  `rating_count`.

> **RESOLVED — was CHANGE REQUIRED IN 08 §3.2:** the bullet "**No `aggregateRating`, no `review`,
> *Verified applied in 08.*
> ever.** There is no `reviews` table in this schema" is now half-false and the
> half that matters is still true. It becomes: "No `aggregateRating` and no `review`
> **until `15 §3.4`'s four conditions hold simultaneously**; `product_reviews` exists
> and is empty at launch, `feature.reviews_structured_data` is seeded `false`, and
> only `status = 'published'` reviews — every one of which carries a `NOT NULL
> order_item_id` and is therefore a verified purchase — are counted."

> **RESOLVED — was CHANGE REQUIRED IN 09 §5.2:** the "Product reviews and ratings" row's trigger
> *Verified applied in 09.*
> reads "Only when there are real customers to write them — JSON-LD
> `aggregateRating` must never precede real reviews". It gains: "the tables ship
> empty at launch (`15 §3.2`); the post-launch work is the PDP block, the write
> route, the moderation screen and the `review.moderate` key."

---

## 4. The preview intersection (gap 14)

`06 §4.4` has already unified the two preview systems onto
`content_preview_tokens` with a `scope` discriminator and the `(preview)` route
group, and has issued the change callouts to `04 §7.2`, `08 §4.2` and `11 §4.2`.
**That decision stands and is not relitigated here.** What is still unspecified is
the intersection itself as an operation — what an admin does, what they see, and
what happens in the three combinations nobody wrote down.

### 4.1 The decision matrix

| Content state | Market state | Mechanism | URL |
| --- | --- | --- | --- |
| Published | Active | **Nothing.** The public URL is the truth, including the CDN object (`04 §7.1`) | `/in/rings` |
| Unpublished CMS page, journal post, or draft product | Active | `scope: 'entity'` grant, or the internal session grant (§4.3) | `/_preview/in/<token>/pages/mothers-day` |
| Published | **Inactive** | `scope: 'market'` grant. `market.preview` | `/_preview/in/<token>/rings` |
| **Unpublished** | **Inactive** | `scope: 'market'` grant — **and only this.** `market.preview` | `/_preview/in/<token>/pages/mothers-day` |
| Unpublished, shared with an outside reviewer | Active | `scope: 'entity'` + `passcode_hash`, `content.preview` | as above |

The fourth row is the case the client hits in week one and it has exactly one
answer, because `06 §4.4` types `PreviewGrant` so that
`includeInactiveMarkets: true` occurs **only** on the `market` variant. An entity
grant cannot render an inactive market — not by policy, by type.

### 4.2 The failure that is currently silent, and its fix

An admin mints an entity grant for the Mother's Day page while looking at the US
frame, switches the frame to India, and India is not yet active. The entity grant's
`previewContext` is `{ includeUnpublished: true, includeInactiveMarkets: false }`,
so the `[market]` layout's `markets.is_active` predicate fails and the frame
renders a 404. Neither `04` nor `06` says what happens; an admin sees an empty
iframe and concludes that preview is broken.

**Decision: fail closed at the route, and make the failure impossible in the UI.**

1. **Route.** `resolvePreviewToken(token, market)` gains one check after the grant
   is loaded: for `scope = 'entity'`, if `markets.is_active = false` for `market`,
   it returns `PreviewTokenError` with `reason: 'market_inactive'`. A 404 for a
   stranger is correct and unchanged — an entity link must not reveal that an
   unlaunched market exists.
2. **Shell.** The preview shell's market switch renders an inactive market as
   **disabled** with the reason inline — *"India is not live yet. A market preview
   link is needed."* — and, when the actor holds `market.preview`, a button beside
   it: **"Preview India (inactive market)"**, which calls
   `createPreviewToken({ scope: 'market', marketCode: 'IN', ttlHours: 4 })` and
   re-mounts the frame at `/_preview/in/<newToken>/<samePath>`. The reviewer's
   entity link is untouched; the admin gets a second, broader, four-hour grant that
   is revocable by row.
3. **Banner.** The `(preview)` `layout.tsx` banner states the grant in words on
   every page: *"Market preview · India (not live) · expires 14:32"* or
   *"Page preview · Mother's Day · other pages show the live site"*. `06 §4.4`
   already requires a banner for the entity case; this makes its text a function of
   `PreviewGrant` so the two scopes cannot look alike.

> **RESOLVED — was CHANGE REQUIRED IN 06 §4.4:** `resolvePreviewToken()` gains the
> *Verified applied in 06.*
> `market_inactive` rejection for `scope = 'entity'`, and the shell specification
> gains the disabled-switch affordance and the upgrade button above. Both are
> additions to a decision this document does not otherwise touch.

### 4.3 The internal grant, which has a name and no specification

`06 §4.4` states that `/admin/content/pages/[id]/preview` "proxies the same route
with an internal grant derived from the session" and does not say what that grant
is or what URL it produces — and the route needs a `[token]` path segment.

**Decision: the reserved token literal `session`.**

```ts
// src/lib/cms/preview.ts
export const SESSION_PREVIEW_TOKEN = 'session';

export async function resolvePreviewToken(
  token: string, market: MarketCode,
): Promise<Result<PreviewGrant, PreviewTokenError>> {
  if (token === SESSION_PREVIEW_TOKEN) {
    const actor = await getStaffActor();                       // 07 §3.2, staff resolver only
    if (!actor) return err(new PreviewTokenError('no_session'));
    requirePermission(actor, 'cms.read');                      // the floor for any draft read
    const inactiveOk = can(actor, 'market.preview');
    if (!inactiveOk && !(await isMarketActive(market)))
      return err(new PreviewTokenError('market_inactive'));
    return ok({ scope: 'market', marketCode: market,
                previewContext: { includeUnpublished: true,
                                  includeInactiveMarkets: inactiveOk } });
  }
  /* … the database path, 06 §4.4 verbatim … */
}
```

- `session` cannot collide with a real token: `content_preview_tokens` stores
  `sha256(32 random bytes)` and the plaintext is 43 base64url characters, so the
  literal is checked first and the database is never queried for it.
- **The internal grant writes no `content_preview_tokens` row.** A staff member
  looking at their own draft is not minting a link a stranger can open, which is the
  distinction `11 §1.3` row 55 draws between `cms.read` and `content.preview`. A row
  per admin page-view would also make `/admin/content/pages/[id]/preview` the
  fastest-growing table in the system.
- It is a **market**-shaped grant, not an entity-shaped one, because a staff member
  browsing drafts should be able to click from one draft to another. The narrowing
  that makes entity grants safe exists to contain a link handed to an outsider; a
  staff session is already authorised for every draft by `cms.read`.
- `includeInactiveMarkets` tracks `market.preview` rather than being hard-coded
  `true`, so an actor who may read drafts but not see unlaunched markets keeps that
  boundary. `11 §1.4` grants `market.preview` to `owner`, `admin`,
  `catalog_manager` and `content_editor` — the same four that hold
  `content.preview` — so in practice the two resolve alike and the code does not
  assume it.
- `preview-token:ip:<ip64>` (`11 §4.2`) is consumed for the `session` path too. A
  staff session does not get an unmetered render loop against a `force-dynamic`
  tree.

**Which means the client's week-one task, end to end:** open
`/admin/content/pages/<id>/preview` → the frame loads
`/_preview/us/session/pages/mothers-day` → switch the market to India → the switch
is live because the owner holds `market.preview`, and the frame re-mounts at
`/_preview/in/session/pages/mothers-day`, rendering the unpublished page in the
inactive market with INR prices from `getDisplayPrice(variantIds, 'IN')`. **No
token is minted at all for the internal case.** A token is minted only when the page
is sent to someone outside the admin, which is the moment the capability actually
differs.

### 4.4 The cache assertion that is claimed once and tested for one mechanism

`99`'s hand-waved claim 8 is correct: `09 P13(d)` asserts "an admin market preview
response carries `Cache-Control: private, no-store` and never appears in the shared
ISR cache" once, `tests/e2e/market-preview.spec.ts` tests the market path, and the
**content**-preview leak path — a CMS preview of the homepage — is never asserted
against the ISR object. Now that both paths are the same route group the assertion
is one test over both scopes.

> **RESOLVED — was CHANGE REQUIRED IN 09 §1.2 P13 and §2.4:** `tests/e2e/market-preview.spec.ts` is
> *Verified applied in 09.*
> renamed `tests/e2e/preview-isolation.spec.ts` and covers four cases, each
> asserting `x-vercel-cache` is never `HIT`, the response carries `no-store` and
> `X-Robots-Tag: noindex`, and a subsequent anonymous request for the corresponding
> **public** URL returns the published body with its cache object unreplaced:
> (a) `scope: 'market'` on an inactive market; (b) `scope: 'entity'` on the
> **homepage**, which is the highest-value ISR object in the system and the one
> `99` names as untested; (c) the `session` literal; (d) an `entity` token against
> an inactive market, asserting 404 rather than a draft.

---

## 5. Back-in-stock notification (gap 2, modelling half)

`08 §4.4` settles which mechanism wins — `back_in_stock_requests`, not
`wishlist_items` and not `newsletter_subscribers` — and `02 §2.7` now defines the
table. What no document specifies is the consent boundary, the firing path, or what
happens when forty people are waiting for one piece.

### 5.1 The mechanism that wins, restated in one line

**One table, `back_in_stock_requests`, keyed on `(email, product, variant, market)`,
written by a signed-out shopper without an account, notified once, never a marketing
record.** `03 §2.5`'s `wishlist_items` mechanism requires a customer
(`02 §2.7`: "Guest wishlists are not modelled") and therefore silently drops every
signed-out shopper, who on an out-of-stock PDP is most of them; `08 §4.4` already
issues the `CHANGE REQUIRED IN 03 §2.5`.

### 5.2 Consent semantics: it is not a newsletter signup

| Property | Value | The failure it prevents |
| --- | --- | --- |
| Scope | One product, one variant, one market, one message | An address collected for a pendant being mailed about a sale |
| Lifetime | Ends at `notified_at`. The row is not reusable | A dormant list nobody remembers consenting to |
| Relationship to `newsletter_subscribers` | **None.** No row is written, `customers.accepts_marketing` is untouched, `marketing_consent_at` and `marketing_consent_source` are untouched | Enrolling a shopper in marketing by inference — the defect `08 §4.4` calls out |
| Newsletter opt-in on the same form | A **separate** unticked checkbox calling `setMarketingConsent()` with `source = 'back_in_stock_form'`, audited | One action recorded as two consents |
| Confirmation email | **None.** The address is used exactly once, for the thing it was given for | A double-opt-in step that halves completion of a notification that may never fire |
| Cancellation | Every notification carries a one-click cancel link resolving `cancel_token_hash`; the row is hard-deleted | An address with no way out, which is what makes the no-confirmation decision defensible |
| Retention | Rows with `notified_at IS NOT NULL` are pruned at 90 days by `/api/cron/cleanup-sessions`; rows still pending are pruned at 365 days | An indefinite store of "who wants what" |

**No confirmation email is a real trade-off and it is taken deliberately.** An
unverified address can be used to send one templated message to a third party. The
message contains no attacker-supplied text (product title and market are ours), it
carries the cancel link, it is rate-limited on two keys, and it fires only when
stock actually moves — so the attack is "cause one email to be sent to someone,
eventually, if a specific piece comes back in stock", which is not worth a
confirmation step that costs half the signups.

```sql
ALTER TABLE back_in_stock_requests
  ADD COLUMN cancel_token_hash BYTEA NOT NULL,
  ADD COLUMN source TEXT NOT NULL DEFAULT 'pdp',
  ADD CONSTRAINT chk_bisr_source CHECK (source IN ('pdp','plp','account'));
CREATE UNIQUE INDEX uq_bisr_cancel ON back_in_stock_requests (cancel_token_hash);
CREATE INDEX idx_bisr_prune ON back_in_stock_requests (notified_at)
  WHERE notified_at IS NOT NULL;
```

`cancel_token_hash` is `sha256(32 random bytes)`; the plaintext exists only in the
email, exactly like `wishlists.share_token_hash` and `orders.public_token_hash`.

Three rate-limit keys. Two are new:

> **RESOLVED — was CHANGE REQUIRED IN 11 §4.2:** add
> *Verified applied in 11.*
> `bisr:ip:<ip64>` — `POST /api/catalog/notify-me` — **10 / 1 hour, closed**, and
> `bisr:email:<email>` — same route — **5 / 24 hours, closed**. Both fail closed:
> this endpoint sends mail to an address the caller supplies, which puts it in the
> credential-and-money class of §4.3 rule 2, not the telemetry class. `<email>` uses
> the existing `rateLimitKey(prefix, email)` HMAC material, so
> `tests/unit/no-plaintext-ratelimit-keys.test.ts` passes unchanged. §4.3 rule 1's
> pairing test is satisfied: neither key's material is `<sid>`, `<cartId>` or
> `<hash>`.

### 5.3 How it fires

```ts
// src/lib/inventory/backInStock.ts
export async function registerBackInStockRequest(input: {
  email: string; productId: string; variantId: string | null;
  marketCode: MarketCode; customerId?: string; source: 'pdp' | 'plp' | 'account';
}): Promise<Result<{ alreadyRegistered: boolean }, ValidationError | RateLimitedError>>;

export async function fireBackInStock(
  tx: Tx, variantId: string, marketCodes: MarketCode[],
): Promise<{ notified: number }>;

export async function sweepBackInStock(
  tx: Tx, opts: { maxVariants: number },
): Promise<{ variantsChecked: number; notified: number }>;
```

**Two entry points, and the second is required for correctness rather than as a
safety net.**

1. **Transactional.** `applyInventoryTransaction()` computes `sellable(variant,
   market)` before and after the write, for **every market whose
   `market_locations` includes the affected location**, and calls
   `fireBackInStock(tx, variantId, crossed)` for the markets where the value went
   from `0` to `> 0`. The market loop is not optional: US stock at a US location
   does not make a piece buyable in India (`04 §6.1`), and firing globally mails
   Indian shoppers about a piece they still cannot buy.

2. **Swept, every five minutes, from `/api/cron/release-reservations`.** **A released
   reservation makes a piece sellable again and writes no
   `inventory_transactions` row** — `05 §1.6` returns the units by decrementing
   `reserved_quantity`, which is the whole point of the reservation model. So the
   single most common way a one-of-a-kind piece becomes buyable again, an abandoned
   checkout expiring, is invisible to the transactional hook entirely. That cron
   already runs every five minutes and already releases exactly those reservations;
   `sweepBackInStock()` runs as its third pass over the variant ids it just
   released. Without it, the piece silently never notifies anyone.

   > **RESOLVED — was CHANGE REQUIRED IN 11 §5.2:** `/api/cron/release-reservations`'s "What it
   > *Verified applied in 11.*
   > does" cell gains "**third pass:** `sweepBackInStock()` over the variant ids
   > released in passes one and two", and its "What breaks" cell gains "a piece
   > freed by an expiring checkout notifies nobody, because a release writes no
   > inventory transaction for the §5.3 hook to see".

`fireBackInStock` is one statement per market, and it claims rows before it mails
them so two concurrent callers cannot both notify the same person:

```sql
WITH claimed AS (
  UPDATE back_in_stock_requests b
     SET notified_at = now()
   WHERE b.id IN (
     SELECT id FROM back_in_stock_requests
      WHERE variant_id = $1 AND market_code = $2 AND notified_at IS NULL
      ORDER BY created_at                       -- oldest first, always
      LIMIT $3                                  -- §5.4
      FOR UPDATE SKIP LOCKED)
  RETURNING id, email, product_id, variant_id, market_code, cancel_token_hash)
SELECT * FROM claimed;
```

Each claimed row produces one `send_email` job, `templateKey = 'back_in_stock'`,
`dedupe_key = 'bisr:' || id` (`08 §4.4`), enqueued **in the same transaction** as the
claim. If that transaction rolls back, the claim rolls back with it and the request
is pending again — the property an after-commit enqueue cannot give, and the same
argument `05 §4.3` makes for the confirmation email.

### 5.4 One-of-a-kind: exactly one notified person can succeed

`$3` above is the notification budget, and it is the whole of this subsection:

```ts
const budget = product.isOneOfAKind
  ? Math.min(pendingCount, sellableAfter)                       // = 1, in practice
  : Math.min(pendingCount, settings.int('inventory.bisr_batch_max'));  // seeded 500
```

Mailing forty people about one piece produces one buyer and thirty-nine people who
click a link and find it gone — the public lie `03 §2.5` spends a paragraph
refusing in the other direction. **For a one-of-a-kind piece the budget is the
sellable quantity: one email, to the oldest pending request.**

Three consequences, each decided rather than left to the implementation:

- **The notification is not a reservation, and the copy must not imply one.** No
  `reservations` row is written, `reservation_ref_kind` gains no value, and the
  email says *"One piece. First to the bag."* Holding a unique piece for a stranger
  who may never open the email takes it off sale for everyone else, which is a worse
  outcome than a race the copy is honest about. The race is between one notified
  person and the open storefront, not between forty notified people.
- **The cascade is the five-minute sweep, not a new timer.** `sweepBackInStock()`
  selects one-of-a-kind variants that are currently sellable and still have pending
  requests whose `created_at` is older than the last notification for that variant
  by more than `settings['inventory.bisr_ooak_followup_minutes']` (seeded **1440**,
  24 hours), and notifies the next one. A notified person therefore gets a day's
  grace, and after that the queue moves. The query is bounded by
  `idx_bisr_variant (variant_id) WHERE notified_at IS NULL` and by
  `idx_products_ooak`, and on a normal day it reads nothing.
- **A sold piece notifies nobody, ever.** `sellable()` is zero once `commitStock()`
  writes `products.sold_at` (`05 §1.6`), and the band is `sold` rather than `out`
  (`11 §7.1`). The out-of-stock PDP for a sold one-of-a-kind piece renders the SOLD
  plate with **no "notify me" form at all** — offering to tell someone when a unique
  piece returns is a promise the architecture knows is false.

### 5.5 Erasure and the remaining half of gap 2

> **RESOLVED — was CHANGE REQUIRED IN 07 §8.3:** `anonymizeCustomer()`'s table list gains a row —
> *Verified applied in 07.*
> **`back_in_stock_requests`**: rows with `notified_at IS NULL` are **hard-deleted**
> (a pending alert to an address that no longer belongs to anyone is a mail we must
> not send); rows already notified have `customer_id` set `NULL` and `email` set to
> the same `'anonymized-' || id || '@invalid'` sentinel, so the retention prune
> still finds them and no live address survives.

Gap 2's other half — the **admin "most-wishlisted" report** that
`idx_wishlist_items_product` is also justified by — is not closed here. With this
section, that index's back-in-stock justification is gone entirely (the list lives in
`back_in_stock_requests`), and its remaining justification is the "N people have
saved this" count, which belongs to the reporting module `99`'s architectural
disagreement 5 says does not exist.

**Tests commissioned:** `tests/integration/back-in-stock.test.ts` (a receipt of 5
units notifies 5 pending requests oldest-first and leaves the sixth pending; a
one-of-a-kind piece coming back notifies exactly one; a release of a reservation
with no inventory transaction still notifies, via the cron pass; a request in `IN`
is not notified by stock landing at a US-only location);
`tests/integration/back-in-stock-consent.test.ts` (registering writes no
`newsletter_subscribers` row and does not touch `customers.accepts_marketing`; the
cancel link deletes the row; a second registration for the same tuple is a no-op).

---

## 6. Wishlist sharing and revocation (gap 13, modelling half)

`08 §1.3` defines `getWishlistByShareToken` and a distinct `PublicWishlistView`;
`07 §4.2` requires both `share_token_hash` **and** `is_public`. Nothing says where
the customer turns sharing on, whether the token rotates on revoke, or what the
public page contains.

```sql
ALTER TABLE wishlists
  ADD COLUMN shared_at            TIMESTAMPTZ NULL,
  ADD COLUMN share_view_count     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN last_shared_view_at  TIMESTAMPTZ NULL,
  ADD CONSTRAINT chk_wishlists_share_pair
    CHECK ((is_public = false) OR (share_token_hash IS NOT NULL));
```

```ts
// src/lib/wishlist/share.ts
export async function setWishlistSharing(input: {
  customerId: string; wishlistId: string; isPublic: boolean;
}): Promise<{ url: string | null }>;   // the URL is returned ONCE, on enable
```

**The token rotates on every enable, and revocation nulls it.** Enabling generates
32 fresh random bytes and writes `sha256`; disabling writes
`is_public = false, share_token_hash = NULL, shared_at = NULL` in one statement.
`wishlists.share_token_hash` being nullable is what makes this expressible, and the
decision the critic asks for is this one: **a link that was revoked and later
re-enabled must not resurrect.** Anyone still holding the old URL — a group chat, a
forwarded email, a browser history — gets a 404 forever. Preserving the token across
an off/on cycle would make "revoke" mean "pause", which is not what the word on the
button says.

`getWishlistByShareToken(token)` requires `is_public = true` **and** a matching hash.
Two independent controls rather than one: a database restore, a support query or a
bug that resurrects a hash still leaves the list private.

**Where the customer does it:** `/account/wishlist` carries a **Share** panel — a
toggle, the current link with a copy affordance when on, *"Shared since 4 March ·
viewed 12 times"*, and a **Stop sharing** button whose confirm copy says the link
will stop working immediately and permanently. `share_view_count` is incremented by
the same conditional `UPDATE` that authorises the view, for the reason
`06 §4.4` gives about `max_views`.

**The public screen:** `/wishlist/shared/[token]`, `force-dynamic`, `no-store`,
`robots: noindex, nofollow` (`08 §4.2` already lists wishlist routes as noindex),
rate-limited on a new key.

> **RESOLVED — was CHANGE REQUIRED IN 11 §4.2:** add `wishlist-share:ip:<ip64>` —
> *Verified applied in 11.*
> `GET /wishlist/shared/[token]` — **60 / 1 hour, closed**. The route is a token
> oracle over a 32-byte space and a fail-open limiter on it is a free enumeration
> endpoint; the handler needs the database anyway, so failing closed costs nothing
> (§4.3 rule 2).

`PublicWishlistView` is the projection, and it is a **separate type from
`WishlistView` precisely so a field cannot be added to the private view and appear
on the public one by inheritance** (`08 §1.3`'s argument, made concrete):

| Included | Excluded, and why |
| --- | --- |
| `wishlists.name` — what the customer typed | The customer's name, email, id — `07 §8.2`: the page renders choices, not a person |
| Per item: product title, slug, hero image, `getDisplayPrice` in the **viewer's** market, `AvailabilityBand` | `wishlist_items.note` — a private note to self; publishing it is the surprise this type exists to prevent |
| A neutral "Add to bag" per line | `created_at` of the list or its items — a browsing timeline |

**The viewer's market, not the owner's**, because a price is per market and rendering
a USD figure to a visitor in India is the invented conversion hard rule 2 forbids. A
piece with no live price in the viewer's market renders as unavailable in that market
(`04 §6.2`), with the same copy the PDP uses. A piece that has since been
soft-deleted or unpublished is omitted from the list entirely, and the page says
*"Some pieces are no longer available."* rather than rendering a dead card.

`anonymizeCustomer()` already cascade-deletes `wishlists` with the customer
(`07 §8.3`), which takes `share_token_hash` with it; no change is needed there.

**Tests commissioned:** `tests/integration/wishlist-share.test.ts` (enable →
disable → enable produces a different token and the first URL 404s; `is_public =
false` with a surviving hash 404s; `PublicWishlistView` contains no email, no
customer name and no item note — asserted by key, over the serialised response, so a
future field addition fails the test).

---

## 7. Where these tables go in the consolidated schema

For the `02` owner: these are the rows for `02 §7`, in that section's format.
`02 §7.1`'s count moves from **120 tables to 128**, and `tests/db/drift.test.ts` —
which compares `pg_tables` against that list — is what makes a missed one visible.

> **RESOLVED — was CHANGE REQUIRED IN 02 §7.1:** the paragraph "**Documents 13, 14 and 15 do not
> *Verified applied in 02.*
> exist.** The set is `00`–`11` plus `99`" is now false for `15`. It becomes:
> "`15-customer-and-commerce-gaps.md` adds eight tables, registered in §7.4, §7.8
> and §7.14 below." The enum count in migration-order qualification 1 rises by
> three single-statement files: `customer_group_rule_field`, `product_kind`,
> `review_status`, plus one more `ALTER TYPE job_kind ADD VALUE`.

**Into `02 §7.4` — Customers (5 tables → 8):**

| Table | Definition |
| --- | --- |
| **`customer_group_rules`** (15 §1.2) | `id UUID NOT NULL`, `customer_group_id UUID NOT NULL FK → customer_groups [CASCADE]`, `field customer_group_rule_field NOT NULL`, `operator collection_rule_operator NOT NULL`, `value_text TEXT`, `value_uuid UUID`, `value_numeric NUMERIC(14,4)`, `value_market_code CHAR(2) FK → markets [CASCADE]`, `position SMALLINT NOT NULL`, `created_at TIMESTAMPTZ NOT NULL`. **CHECK** `chk_cgr_value`, `chk_cgr_money_market`; **Index** `idx_cgr_group (customer_group_id, position)`, `idx_cgr_field (field)`. The operator type is the **same Postgres enum** as `collection_rules`, deliberately (15 §1.1) |
| **`customer_group_rule_values`** (15 §1.2) | `rule_id UUID FK → customer_group_rules [CASCADE]`, `value_uuid UUID NULL`, `value_text TEXT NULL`, `position SMALLINT NOT NULL`, `created_at`. **PK** `(rule_id, position)`; **CHECK** `chk_cgrv_one_value`. Used only by `in` / `not_in`, exactly like `collection_rule_values` |
| **`customer_tags`** (15 §1.2) | `customer_id UUID FK → customers [CASCADE]`, `tag_id UUID FK → tags [CASCADE]`, `assigned_by_user_id UUID NULL FK → users [SET NULL]`, `created_at`. **PK** `(customer_id, tag_id)`; **Index** `idx_customer_tags_tag (tag_id, customer_id)`. A join onto the **existing** `tags` vocabulary, the fourth after `product_tags`, `media_tags`, `journal_post_tags` |

and to the existing rows: `customer_groups` **plus `mode collection_mode NOT NULL
DEFAULT 'manual'`, `rule_match TEXT NOT NULL DEFAULT 'all'`, `priority SMALLINT NOT
NULL DEFAULT 100`, `last_refreshed_at TIMESTAMPTZ`, `version INTEGER NOT NULL`,
`chk_customer_groups_rule_match`, `chk_customer_groups_default_manual` (15 §1.2)**;
`customers` **plus `first_order_at TIMESTAMPTZ`, `customer_group_source TEXT NOT
NULL DEFAULT 'rule'`, `customer_group_assigned_at TIMESTAMPTZ`,
`customer_group_assigned_by_user_id UUID`, `chk_customers_group_source`, and
`idx_customers_first_order (first_order_at) WHERE anonymized_at IS NULL AND
first_order_at IS NOT NULL` (15 §1.2)**.

**Into `02 §7.8` — Commerce:** `gift_cards` **plus `issued_by_order_item_id UUID FK
→ order_items [RESTRICT]`, `issue_unit_index SMALLINT`, `recipient_email TEXT`,
`deliver_at TIMESTAMPTZ`, `delivered_at TIMESTAMPTZ`,
`chk_gift_cards_issue_pair`, `uq_gift_cards_issue_line (issued_by_order_item_id,
issue_unit_index) WHERE issued_by_order_item_id IS NOT NULL`,
`idx_gift_cards_last4 (code_last4) WHERE deleted_at IS NULL`,
`idx_gift_cards_undelivered (deliver_at) WHERE delivered_at IS NULL AND deliver_at
IS NOT NULL` (15 §2.2)** — `uq_gift_cards_issue_line` is the index that stops a
replayed webhook minting a second card; `order_items` **plus `product_kind
product_kind NOT NULL DEFAULT 'physical'` (15 §2.2)**, a snapshot column under hard
rule 4; `back_in_stock_requests` **plus `cancel_token_hash BYTEA NOT NULL`, `source
TEXT NOT NULL DEFAULT 'pdp'`, `chk_bisr_source`, `uq_bisr_cancel
(cancel_token_hash)`, `idx_bisr_prune (notified_at) WHERE notified_at IS NOT NULL`
(15 §5.2)**; `wishlists` **plus `shared_at TIMESTAMPTZ`, `share_view_count INTEGER
NOT NULL DEFAULT 0`, `last_shared_view_at TIMESTAMPTZ`,
`chk_wishlists_share_pair` (15 §6)**.

**Into `02 §7.5` — Catalogue:** `products` **plus `kind product_kind NOT NULL
DEFAULT 'physical'` and `idx_products_kind (kind) WHERE kind <> 'physical' AND
deleted_at IS NULL` (15 §2.2)**.

**A new register subsection, inserted between `02 §7.11` (Operations) and `02 §7.12`
(Indexes added outside §4) so the numbering of §7.12 and §7.13 shifts by one —
Reviews — 3 tables (15 §3.2; empty at launch):** `product_reviews`,
`product_review_stats`, `product_review_votes`, with the DDL of §3.2 verbatim. In
migration order they come after Commerce, because `product_reviews` has FKs to
`products`, `order_items`, `customers` and `markets` and every one of those must
exist first.

**Into `02`'s "what the phase plan must migrate" subsection:** the eight tables above
join `P18`. `product_reviews` and its two siblings are created **empty and unused**,
which is the entire point of creating them now.

---

## 8. Every change this document requires of another document

| Document | Section | Change |
| --- | --- | --- |
| `01` | §2.4 | The PDP add-to-bag `<Suspense>` child also calls `resolvePrice(…, customerId)` when a customer session exists (§1.7) |
| `02` | §5.3 | The checkout transaction gains `resolveCustomerGroup()` after the `customers` counters (§1.6) |
| `02` | §7.1, §7.4, §7.5, §7.8, a new Reviews subsection, and the phase-migration list | The register entries in §7; 120 tables → 128; three new enums, one new `job_kind` |
| `03` | §6.4 | `buildRulePredicate` takes a `FieldResolver` and moves to `src/lib/rules/predicate.ts` (§1.1) |
| `05` | §5.1 | `createOrderFromCart()` writes `customers.first_order_at` and calls `resolveCustomerGroup()` (§1.6) |
| `06` | §4.4 | `resolvePreviewToken()` rejects `scope: 'entity'` against an inactive market with `market_inactive`; the shell disables the switch and offers the market-grant upgrade; `SESSION_PREVIEW_TOKEN` is the internal grant (§4.2, §4.3) |
| `07` | §8.3 | `anonymizeCustomer()` gains a `back_in_stock_requests` row (§5.5) |
| `08` | §3.2 | The `aggregateRating` bullet gains §3.4's four conditions; `offers.availability` branches on `products.kind` for gift cards (§2.2, §3.4) |
| `09` | §1.2 P13, §2.4 | `market-preview.spec.ts` → `preview-isolation.spec.ts`, four cases (§4.4) |
| `09` | §5.2 | The reviews row's trigger names what already shipped (§3.4) |
| `11` | §1.3 row 14 | `tag.update`'s description gains `customer_tags` |
| `11` | §3.1, §3.2 | `ALTER TYPE job_kind ADD VALUE 'customer_group_refresh'` + its registry row, `systemPermitted: true`, dedupe `entity` (§1.6) |
| `11` | §4.2 | Three keys: `bisr:ip:<ip64>` 10/h closed, `bisr:email:<email>` 5/24h closed, `wishlist-share:ip:<ip64>` 60/h closed (§5.2, §6) |
| `11` | §5.2 | `release-reservations` gains the back-in-stock sweep; `run-jobs` gains the customer-group boundary pass (§1.6, §5.3) |
| `11` | §7.1 | The `made_to_order` row's rendering branches on `products.kind = 'gift_card'` (§2.2) |

**One meta-change, which this document is otherwise invisible to CI without.**

> **RESOLVED — was CHANGE REQUIRED IN 09 §1 (`tests/setup/collect-audit.ts`):** the glob is
> *Verified applied by inspection of the target document.*
> `docs/architecture/0*.md`, which already excludes `10-design-system.md`
> (`99` contradiction C24) and now excludes `11` and `15`. It becomes
> `docs/architecture/[0-9]*.md`, and `09 §5.1`'s launch blocker
> "`tests/setup/pending.json` **empty** — every test file commissioned in `01`–`09`
> exists on disk" becomes "commissioned in `01`–`15`". Without that edit, the
> eleven test files this document commissions are commissioned by nobody.

---

## 9. Decisions needing the client

Collected so they can be asked in one conversation. None of them blocks building
what is above; each of them is a value, not an architecture.

> **NEEDS INPUT:** the customer groups the client actually operates and each one's
> rule — the spend figure with its currency, the order count, or the tenure. `retail`
> as the sole default is the seeded state and no threshold is invented (§1.8).

> **NEEDS INPUT:** whether trade or wholesale buyers exist, and whether any product
> must be **invisible** to retail customers rather than merely priced differently.
> Different prices are a `pricing_rules` row today; invisibility is a separate
> market, and it is cheaper to decide before P14 than after (§1.7).

> **NEEDS INPUT:** whether gift cards are in scope, their denominations per market,
> and their expiry policy per market. `feature.gift_cards_enabled` is seeded `false`
> and `expires_at` is seeded `NULL` — cards that never expire — which is the only
> policy safe in every jurisdiction (§2.1, §2.5).

> **NEEDS INPUT:** the per-market cap on manual gift-card issuance
> (`settings['giftcards.manual_issue_max_minor']`). Seeded `NULL`, which **disables**
> manual issuance entirely — a staff member minting unlimited tender is a control
> the client should set a number on rather than inherit (§2.6).

> **NEEDS INPUT:** confirmation that reviews are accepted as a post-launch item on
> the terms in §3 — schema now, feature when real customers exist, markup only after
> five verified published ratings and a second explicit flag. This is the one place
> a named brief requirement is deliberately not shipped at launch, and it should be
> agreed rather than discovered.

> **NEEDS INPUT:** copy sign-off for the "notify me" capture, which collects an
> email address and therefore needs a consent line the client owns (restated from
> `08 §4.4`), plus the one-of-a-kind follow-up window
> (`inventory.bisr_ooak_followup_minutes`, seeded 24 hours) — how long the first
> notified person keeps their head start before the next in line is told (§5.4).
