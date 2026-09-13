import "server-only";
import { db } from "@/lib/db/client";
import { MarketNotFoundError, PriceUnavailableError } from "@/lib/errors";
import {
  applyRuleStack,
  reduceToUnit,
  ruleMatches,
  scopeKeysFor,
  type AdjustmentType,
  type AmountBasis,
  type PricingRuleRow,
  type ScopeType,
} from "@/lib/pricing/rules";
import type { MarketCode, PriceSourceValue, ResolvedPrice } from "@/lib/pricing/types";
import { cache } from "react";
import { requestNow } from "@/lib/clock";

/**
 * The pricing read path — 04 §1.4.
 *
 * THREE queries per batch, and the same three for 1, 48 and 200 lines (P11 criterion (d)):
 *
 *   1. the two-level `prices` read, variant→product fallback done once,
 *   2. the one scope query that answers "which of the eight rule scopes does each line
 *      belong to",
 *   3. the live `pricing_rules` read for the market, memoised per request.
 *
 * The number that matters is not three; it is that it does not GROW WITH LINE COUNT. A PLP
 * renders 48 cards, and a resolver that costs one query per card is 48 round trips on the
 * hottest page on the site.
 *
 * `new Date()` is a lint error in this directory (01 §2.2). `at` is threaded from the caller
 * so that every line of one checkout shares one instant — otherwise a sale that expires
 * mid-request prices two lines of the same bag on two sides of the boundary.
 */

const DEFAULT_QUANTITY = 1;

type PriceRow = {
  id: string;
  product_id: string;
  variant_id: string | null;
  currency_code: string;
  list_minor: bigint;
  sale_minor: bigint | null;
  compare_at_minor: bigint | null;
  price_source: PriceSourceValue;
  metal_rate_id: string | null;
};

/**
 * Query 1 — steps 1–2 of §1.4, batched.
 *
 * Each `UNION ALL` branch is an equality probe of a DIFFERENT unique partial index
 * (`idx_prices_active` on `(variant_id, market_code)`, `idx_prices_active_product` on
 * `(product_id, market_code) WHERE variant_id IS NULL`). A `COALESCE` over one index cannot
 * express the fallback and a per-line `OR` degrades to a scan.
 *
 * `ORDER BY level LIMIT 1` is the fallback AND the short-circuit: the product-level probe is
 * not executed for a variant that has its own price.
 *
 * `JOIN LATERAL … ON TRUE`, never `LEFT JOIN LATERAL`. A left join manufactures an all-NULL
 * price row for an unpriced variant, and a NULL `list_minor` reaching the line base is exactly
 * the invented number that step 3 exists to refuse. A variant with no price is simply ABSENT
 * from the result — which the caller turns into `PriceUnavailableError`, per line, with no
 * sentinel row to mistake for a price.
 */
async function readPrices(
  client: Pick<typeof db, "$queryRaw">,
  variantIds: string[],
  marketCode: MarketCode,
): Promise<Map<string, PriceRow>> {
  const rows = await client.$queryRaw<(PriceRow & { variant_key: string })[]>`
    WITH v AS (
      SELECT id AS variant_id, product_id
        FROM product_variants
       WHERE id = ANY(${variantIds}::uuid[]) AND deleted_at IS NULL
    )
    SELECT v.variant_id::text AS variant_key, p.id::text AS id, p.product_id::text AS product_id,
           p.variant_id::text AS variant_id, p.currency_code, p.list_minor, p.sale_minor,
           p.compare_at_minor, p.price_source::text AS price_source,
           p.metal_rate_id::text AS metal_rate_id
      FROM v
      JOIN LATERAL (
        (SELECT pr.*, 1 AS level
           FROM prices pr
          WHERE pr.variant_id = v.variant_id AND pr.market_code = ${marketCode}
            AND pr.valid_to IS NULL AND pr.deleted_at IS NULL)
        UNION ALL
        (SELECT pr.*, 2 AS level
           FROM prices pr
          WHERE pr.product_id = v.product_id AND pr.variant_id IS NULL
            AND pr.market_code = ${marketCode}
            AND pr.valid_to IS NULL AND pr.deleted_at IS NULL)
        ORDER BY level
        LIMIT 1
      ) AS p ON TRUE
  `;
  return new Map(rows.map((r) => [r.variant_key, r]));
}

/**
 * The replay predicate — admin forensics only (04 §1.4).
 *
 * `idx_prices_active` is PARTIAL on `valid_to IS NULL`, so it contains only today's prices. A
 * replay that used it would return today's number and label it with a historical date, which
 * is the worst possible failure for a forensics tool because the answer looks authoritative.
 * This predicate is therefore explicit and different, and it is served by `idx_prices_history`.
 */
async function readPricesAt(
  client: Pick<typeof db, "$queryRaw">,
  variantIds: string[],
  marketCode: MarketCode,
  at: Date,
): Promise<Map<string, PriceRow>> {
  const rows = await client.$queryRaw<(PriceRow & { variant_key: string })[]>`
    WITH v AS (
      SELECT id AS variant_id, product_id
        FROM product_variants
       WHERE id = ANY(${variantIds}::uuid[]) AND deleted_at IS NULL
    )
    SELECT v.variant_id::text AS variant_key, p.id::text AS id, p.product_id::text AS product_id,
           p.variant_id::text AS variant_id, p.currency_code, p.list_minor, p.sale_minor,
           p.compare_at_minor, p.price_source::text AS price_source,
           p.metal_rate_id::text AS metal_rate_id
      FROM v
      JOIN LATERAL (
        (SELECT pr.*, 1 AS level
           FROM prices pr
          WHERE pr.variant_id = v.variant_id AND pr.market_code = ${marketCode}
            AND pr.deleted_at IS NULL
            AND pr.valid_from <= ${at} AND (pr.valid_to IS NULL OR pr.valid_to > ${at}))
        UNION ALL
        (SELECT pr.*, 2 AS level
           FROM prices pr
          WHERE pr.product_id = v.product_id AND pr.variant_id IS NULL
            AND pr.market_code = ${marketCode} AND pr.deleted_at IS NULL
            AND pr.valid_from <= ${at} AND (pr.valid_to IS NULL OR pr.valid_to > ${at}))
        ORDER BY level
        LIMIT 1
      ) AS p ON TRUE
  `;
  return new Map(rows.map((r) => [r.variant_key, r]));
}

/** Query 2 — every scope every line belongs to, for the whole batch (04 §1.4.1). */
async function readScopes(
  client: Pick<typeof db, "$queryRaw">,
  variantIds: string[],
): Promise<Map<string, { scopeType: ScopeType; scopeId: string }[]>> {
  const rows = await client.$queryRaw<
    { variant_id: string; scope_type: string; scope_id: string }[]
  >`
    WITH v AS (SELECT id, product_id FROM product_variants WHERE id = ANY(${variantIds}::uuid[]))
    SELECT v.id::text AS variant_id, s.scope_type, s.scope_id::text AS scope_id
    FROM v, LATERAL (
      SELECT 'product'::text AS scope_type, v.product_id AS scope_id
      UNION ALL SELECT 'category',   pc.category_id     FROM product_categories pc   WHERE pc.product_id = v.product_id
      UNION ALL SELECT 'collection', pcol.collection_id FROM product_collections pcol WHERE pcol.product_id = v.product_id
      UNION ALL SELECT 'stone',      ps.stone_id        FROM product_stones ps        WHERE ps.product_id = v.product_id
      UNION ALL SELECT 'material',   vm.material_id     FROM variant_materials vm     WHERE vm.variant_id = v.id
      UNION ALL SELECT 'tag',        pt.tag_id          FROM product_tags pt          WHERE pt.product_id = v.product_id
    ) AS s
  `;
  const out = new Map<string, { scopeType: ScopeType; scopeId: string }[]>();
  for (const r of rows) {
    const list = out.get(r.variant_id) ?? [];
    list.push({ scopeType: r.scope_type as ScopeType, scopeId: r.scope_id });
    out.set(r.variant_id, list);
  }
  return out;
}

/**
 * Query 3 — the live rules for this market at this instant. Tens of rows.
 *
 * MEMOISED PER REQUEST (04 §1.4.1). A page renders a listing, a cart drawer and a
 * recently-viewed rail, each calling the batch; without this they read the same forty rows
 * three times. Keyed on `(marketCode, at)`, and `at` is the same Date INSTANCE from
 * `requestNow()` across the request, so the key is stable.
 */
const readRules = cache(async (marketCode: MarketCode, at: Date): Promise<PricingRuleRow[]> =>
  readRulesWith(db, marketCode, at),
);

/**
 * The uncached form, for callers inside a transaction.
 *
 * `cache()` is keyed on its arguments, and a transaction client is a fresh object every time —
 * so passing it through the memoised path would key every call uniquely and quietly disable
 * the memoisation for everyone. Inside a transaction that is the correct behaviour anyway: the
 * read should see the transaction's own snapshot, not a value captured before it opened.
 */
async function readRulesWith(
  client: Pick<typeof db, "$queryRaw">,
  marketCode: MarketCode,
  at: Date,
): Promise<PricingRuleRow[]> {
  const rows = await client.$queryRaw<Record<string, unknown>[]>`
    SELECT id::text AS id, name, scope_type::text AS scope_type, scope_id::text AS scope_id,
           adjustment_type::text AS adjustment_type, amount_basis, value_bp, amount_minor,
           priority, is_stackable, created_at
      FROM pricing_rules
     WHERE market_code = ${marketCode}
       AND is_active
       AND (starts_at IS NULL OR starts_at <= ${at})
       AND (ends_at IS NULL OR ends_at > ${at})
  `;
  return rows.map((r) => ({
    id: String(r["id"]),
    name: String(r["name"]),
    scopeType: String(r["scope_type"]) as ScopeType,
    scopeId: (r["scope_id"] as string | null) ?? null,
    adjustmentType: String(r["adjustment_type"]) as AdjustmentType,
    amountBasis: String(r["amount_basis"]) as AmountBasis,
    valueBp: r["value_bp"] === null ? null : Number(r["value_bp"]),
    amountMinor:
      r["amount_minor"] === null ? null : BigInt(r["amount_minor"] as string | number | bigint),
    priority: Number(r["priority"]),
    isStackable: r["is_stackable"] === true,
    createdAt: r["created_at"] as Date,
  }));
}

export type ResolveLine = { variantId: string; marketCode: MarketCode; quantity: number };
export type ResolveContext = {
  customerId?: string;
  couponCode?: string;
  at?: Date;
  /**
   * The client to read through. Pass the transaction when calling from inside one.
   *
   * Reaching for the global `db` inside an open interactive transaction issues the query on a
   * DIFFERENT connection: on the local single-threaded engine that blocks until the
   * transaction times out eight seconds later, and on a real Postgres it reads OUTSIDE the
   * transaction's snapshot — so a price written concurrently could be seen by half a cart.
   * Both are wrong. Found THREE times: P12 in the recalc preview, P20 in cart revalidation,
   * and P20 again in the market switcher — which is why this is no longer optional and no
   * longer defaults to the global. The first two times the lesson was written down here as a
   * comment; the third time proves a comment is not a control. Passing `db` is still correct
   * on a request path with no transaction open — but it has to be *said*, so that omitting it
   * is a type error rather than an eight-second mystery.
   */
  client: Pick<typeof db, "$queryRaw">;
};

/**
 * Resolve a batch. The ONLY implementation — `resolvePrice` is a one-line binding over it, so
 * a single line and a cart of forty cannot drift apart in their arithmetic (04 §1.1).
 */
export async function resolvePriceBatch(
  lines: ResolveLine[],
  ctx: ResolveContext,
): Promise<Map<string, ResolvedPrice>> {
  const out = new Map<string, ResolvedPrice>();
  if (lines.length === 0) return out;

  // Never `new Date()` here — see src/lib/clock.ts. One instant per request means a sale
  // that expires mid-checkout cannot price two lines of one bag on two sides of the boundary.
  const at = ctx.at ?? requestNow();
  const markets = new Set(lines.map((l) => l.marketCode));
  if (markets.size !== 1) {
    // One batch, one market, by construction. A mixed batch would need one rules read per
    // market and would quietly make the query count grow with the number of markets — and a
    // cart has exactly one market anyway (`carts.market_code`, 01 §2.5).
    throw new MarketNotFoundError("resolvePriceBatch takes one market per call.");
  }
  const marketCode = lines[0]!.marketCode;

  // Memoised ONLY on the request path. `cache()` keyed on a fresh transaction object would
  // never hit, and would quietly disable memoisation for every other caller in the request.
  const onGlobal = ctx.client === db;
  const market = onGlobal
    ? await readActiveMarket(marketCode)
    : await readActiveMarketWith(ctx.client, marketCode);
  if (!market) {
    // Never falls back to NEXT_PUBLIC_DEFAULT_MARKET. A wrong market is a 404, not a
    // silently-substituted price in a currency the shopper did not ask for.
    throw new MarketNotFoundError(`No active market '${marketCode}'.`);
  }

  const variantIds = [...new Set(lines.map((l) => l.variantId))];
  const isReplay = ctx.at !== undefined;
  const client = ctx.client;
  const [prices, scopes, rules, customerGroupId] = await Promise.all([
    isReplay
      ? readPricesAt(client, variantIds, marketCode, at)
      : readPrices(client, variantIds, marketCode),
    readScopes(client, variantIds),
    onGlobal ? readRules(marketCode, at) : readRulesWith(ctx.client, marketCode, at),
    readCustomerGroup(client, ctx.customerId),
  ]);

  for (const line of lines) {
    const price = prices.get(line.variantId);
    // Step 3, per line. An unpriced variant is ABSENT from the map — never a zero, never
    // another market's number, never a sentinel row to mistake for a price. The batch OMITS
    // rather than throws, because a listing or a cart containing one unavailable line must
    // still render the other thirty-nine; `resolvePrice` (singular) is where the absence
    // becomes `PriceUnavailableError`, because there the whole answer is missing.
    if (!price) continue;
    out.set(
      line.variantId,
      resolveOne(line, price, scopes.get(line.variantId) ?? [], rules, customerGroupId, at),
    );
  }
  return out;
}

/** Step 0, memoised per request for the same reason as the rules read. */
const readActiveMarket = cache(
  async (marketCode: MarketCode): Promise<{ code: string } | null> =>
    readActiveMarketWith(db, marketCode),
);

/** The uncached form, for callers inside a transaction — see `readRulesWith`. */
async function readActiveMarketWith(
  client: Pick<typeof db, "$queryRaw">,
  marketCode: MarketCode,
): Promise<{ code: string } | null> {
  const rows = await client.$queryRaw<{ code: string }[]>`
    SELECT code FROM markets WHERE code = ${marketCode} AND is_active
  `;
  return rows[0] ?? null;
}

async function readCustomerGroup(
  client: Pick<typeof db, "$queryRaw">,
  customerId: string | undefined,
): Promise<string | null> {
  // An anonymous request skips step 6 entirely and never inherits `retail` implicitly.
  if (customerId === undefined) return null;
  const rows = await client.$queryRaw<{ customer_group_id: string }[]>`
    SELECT customer_group_id::text AS customer_group_id FROM customers WHERE id = ${customerId}::uuid
  `;
  return rows[0]?.customer_group_id ?? null;
}

function resolveOne(
  line: ResolveLine,
  price: PriceRow,
  memberships: { scopeType: ScopeType; scopeId: string }[],
  rules: PricingRuleRow[],
  customerGroupId: string | null,
  at: Date,
): ResolvedPrice {
  const quantity = Math.max(1, Math.trunc(line.quantity));
  const unitListMinor = BigInt(price.list_minor);
  const unitSaleMinor = price.sale_minor === null ? unitListMinor : BigInt(price.sale_minor);

  // Step 4 — the multiply happens HERE, before any percentage, so every percentage is applied
  // to the largest available base and rounded once (02 §1.10 rule 1).
  const lineBaseMinor = unitSaleMinor * BigInt(quantity);

  const scopeKeys = scopeKeysFor(memberships, customerGroupId);
  const matching = rules.filter((r) => ruleMatches(r, scopeKeys));
  const { lineMinor, breakdown } = applyRuleStack(lineBaseMinor, quantity, matching);

  // Step 8 — clamp. A stack of discounts can never produce a negative line.
  const lineFinalMinor = lineMinor < 0n ? 0n : lineMinor;
  if (lineFinalMinor !== lineMinor) {
    breakdown.push({
      kind: "pricing_rule",
      ref: "clamp",
      label: "Clamped at zero",
      amountMinor: lineFinalMinor - lineMinor,
    });
  }

  const { unitFinalMinor, lineSubtotalMinor, roundingResidueMinor } = reduceToUnit(
    lineFinalMinor,
    quantity,
  );

  // The identity the service asserts rather than hopes for (04 §1.4.2).
  const delta = breakdown.reduce((acc, d) => acc + d.amountMinor, 0n);
  if (lineBaseMinor + delta !== lineFinalMinor) {
    throw new Error(
      `discountBreakdown does not account for the line: base ${String(lineBaseMinor)} + ${String(delta)} != ${String(lineFinalMinor)}`,
    );
  }

  return {
    currencyCode: price.currency_code,
    unitListMinor,
    unitSaleMinor,
    unitFinalMinor,
    lineSubtotalMinor,
    discountBreakdown: breakdown,
    priceSource: price.price_source,
    metalRateId: price.metal_rate_id,
    priceRecordId: price.id,
    roundingResidueMinor,
    computedAt: at,
  };
}

/** One line. A binding over the batch, so there is one arithmetic implementation. */
export async function resolvePrice(input: {
  variantId: string;
  marketCode: MarketCode;
  quantity?: number;
  customerId?: string;
  couponCode?: string;
  at?: Date;
  /** As ResolveContext.client. Required here too, or the wrapper is a hole in the same wall. */
  client: Pick<typeof db, "$queryRaw">;
}): Promise<ResolvedPrice> {
  const quantity = input.quantity ?? DEFAULT_QUANTITY;
  const batch = await resolvePriceBatch(
    [{ variantId: input.variantId, marketCode: input.marketCode, quantity }],
    {
      customerId: input.customerId,
      couponCode: input.couponCode,
      at: input.at,
      client: input.client,
    },
  );
  const resolved = batch.get(input.variantId);
  if (!resolved) {
    // There is no step between 2 and 3: no fallback to another market, no fallback to another
    // currency, no conversion, no "base" price, no nearest-variant price, no category default,
    // no zero. A variant with no price in a market is not purchasable in that market, and that
    // state is representable, queryable and rendered — which is precisely what stops anyone
    // from inventing a number to fill the hole.
    throw new PriceUnavailableError(
      `No price for variant ${input.variantId} in ${input.marketCode}.`,
      { context: { variantId: input.variantId, marketCode: input.marketCode } },
    );
  }
  return resolved;
}
