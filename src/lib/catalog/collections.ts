import "server-only";
import { db } from "@/lib/db/client";
import type { Tx } from "@/lib/db/transaction";
import { sql, unsafeRaw, type Sql } from "@/lib/db/sql";
import {
  assertValueStorage,
  buildRulePredicate as buildGeneric,
  compare,
  type FieldResolver,
  type RuleRow,
} from "@/lib/rules/predicate";
import { ValidationError } from "@/lib/errors";

/**
 * Automatic collections — 03 §6.4.
 *
 * 02 §2.4 decided materialise-over-evaluate-on-read; this is the execution. Membership lives
 * in `product_collections` and is refreshed by four triggers, only one of which is a full
 * evaluation.
 */

/** The catalogue's binding of the shared builder, so no call site passes a resolver. */
export function buildRulePredicate(rules: readonly RuleRow[], match: "all" | "any"): Sql {
  return buildGeneric(rules, match, productFieldResolver);
}

/**
 * One fragment per rule field — 03 §6.2.
 *
 * **`EXISTS`, not `JOIN`**, for every multi-valued relation: a join against a table with N
 * rows per product multiplies the driving row set and then needs a `DISTINCT`.
 *
 * Negations are handled HERE rather than by the operator layer, because `NOT (EXISTS …)` and
 * `EXISTS (… <> …)` mean different things for a multi-valued relation. A product with two
 * stones is "not labradorite" only if NEITHER stone is labradorite; the second spelling asks
 * whether EITHER stone is not, which is true of almost every product with two stones.
 */
export const productFieldResolver: FieldResolver = (rule) => {
  assertValueStorage(rule);
  const negated =
    rule.operator === "not_equals" ||
    rule.operator === "not_in" ||
    rule.operator === "not_contains";

  switch (rule.field) {
    case "category": {
      // SUBTREE-INCLUSIVE: a ring filed only under RINGS → Stacking belongs to a rule that
      // names RINGS. Matching the category row exactly would leave it out of the collection
      // it most obviously belongs in.
      const inner = sql`
        SELECT 1 FROM product_categories pc
        JOIN categories c ON c.id = pc.category_id AND c.deleted_at IS NULL
        WHERE pc.product_id = p.id
          AND c.materialized_path LIKE
              (SELECT t.materialized_path FROM categories t
                WHERE t.id = ${targetUuid(rule)}::uuid) || '%'`;
      return existsFragment(inner, negated);
    }

    case "stone": {
      const inner = sql`SELECT 1 FROM product_stones ps
                         WHERE ps.product_id = p.id AND ${compare(unsafeRaw("ps.stone_id::text"), rule)}`;
      return existsFragment(inner, negated);
    }

    case "stone_is_lab_grown": {
      const inner = sql`SELECT 1 FROM product_stones ps
                         JOIN stones s ON s.id = ps.stone_id AND s.deleted_at IS NULL
                        WHERE ps.product_id = p.id AND ${compare(unsafeRaw("s.is_lab_grown"), rule)}`;
      return existsFragment(inner, false);
    }

    case "material": {
      // Through the product's LIVE variants: a material on a soft-deleted variant is not a
      // material this product is made of any more.
      const inner = sql`SELECT 1 FROM product_variants v
                         JOIN variant_materials vm ON vm.variant_id = v.id
                        WHERE v.product_id = p.id AND v.deleted_at IS NULL
                          AND ${compare(unsafeRaw("vm.material_id::text"), rule)}`;
      return existsFragment(inner, negated);
    }

    case "tag": {
      const inner = sql`SELECT 1 FROM product_tags pt
                         JOIN tags t ON t.id = pt.tag_id
                        WHERE pt.product_id = p.id AND ${compare(unsafeRaw("t.slug"), rule)}`;
      return existsFragment(inner, negated);
    }

    case "attribute": {
      if (rule.attributeId === null) {
        throw new ValidationError("An attribute rule must name an attribute.");
      }
      const column = rule.valueUuid !== null ? "pav.option_id::text" : "pav.value_text";
      const inner = sql`SELECT 1 FROM product_attribute_values pav
                        WHERE pav.product_id = p.id
                          AND pav.attribute_id = ${rule.attributeId}::uuid
                          AND ${compare(unsafeRaw(column), rule)}`;
      return existsFragment(inner, negated);
    }

    case "price": {
      // MIN(coalesce(sale, list)) over the product's ACTIVE rows in that market — the "from"
      // price the card already shows, and therefore the number the merchandiser had in mind.
      // A product carries a product-level default AND variant overrides, so "under 500" has
      // no single referent without this.
      const market = requireMarket(rule);
      return sql`(
        SELECT min(coalesce(pr.sale_minor, pr.list_minor))
          FROM prices pr
         WHERE pr.product_id = p.id AND pr.market_code = ${market}
           AND pr.valid_to IS NULL AND pr.deleted_at IS NULL
      ) ${unsafeRaw(numericOperator(rule))} ${numericComparand(rule)}::bigint`;
    }

    case "is_on_sale": {
      const market = requireMarket(rule);
      const inner = sql`SELECT 1 FROM prices pr
                        WHERE pr.product_id = p.id AND pr.market_code = ${market}
                          AND pr.sale_minor IS NOT NULL
                          AND pr.valid_to IS NULL AND pr.deleted_at IS NULL`;
      return existsFragment(inner, rule.operator === "is_false");
    }

    case "status":
      return compare(unsafeRaw("p.status::text"), rule);

    case "created_at":
      return sql`p.created_at ${unsafeRaw(numericOperator(rule))} ${numericComparand(rule)}::timestamptz`;

    case "is_one_of_a_kind":
      return compare(unsafeRaw("p.is_one_of_a_kind"), rule);

    default:
      throw new ValidationError(`Unknown collection rule field '${rule.field}'.`);
  }
};

function existsFragment(inner: Sql, negated: boolean): Sql {
  return negated ? sql`NOT EXISTS (${inner})` : sql`EXISTS (${inner})`;
}

function targetUuid(rule: RuleRow): string {
  if (rule.valueUuid === null)
    throw new ValidationError(`Rule on '${rule.field}' needs a target.`);
  return rule.valueUuid;
}

function requireMarket(rule: RuleRow): string {
  if (rule.valueMarketCode === null) {
    // chk_collection_rules_price_market says the same thing. A price rule with no market is
    // $400 tested against ₹40,000 — hard rule 2, arriving through a rule builder.
    throw new ValidationError(`A '${rule.field}' rule must name a market.`);
  }
  return rule.valueMarketCode;
}

const NUMERIC_OPERATORS: Record<string, string> = {
  gt: ">",
  gte: ">=",
  lt: "<",
  lte: "<=",
  equals: "=",
  not_equals: "<>",
};

function numericOperator(rule: RuleRow): string {
  const op = NUMERIC_OPERATORS[rule.operator];
  if (op === undefined) {
    throw new ValidationError(`Operator '${rule.operator}' is not a comparison.`);
  }
  return op;
}

function numericComparand(rule: RuleRow): string {
  if (rule.valueNumeric !== null) return rule.valueNumeric.toString();
  if (rule.valueText !== null) return rule.valueText;
  throw new ValidationError(`Rule on '${rule.field}' needs a value.`);
}

// ── Refresh ────────────────────────────────────────────────────────────────────────────

export type RefreshResult = { added: number; removed: number; evaluated: number };

async function loadRules(
  tx: Tx,
  collectionId: string,
): Promise<{ rules: RuleRow[]; match: "all" | "any" }> {
  const rows = await tx.$queryRaw<Record<string, unknown>[]>`
    SELECT r.id::text AS id, r.field::text AS field, r.operator::text AS operator,
           r.value_text, r.value_uuid::text AS value_uuid, r.value_numeric,
           r.value_market_code, r.attribute_id::text AS attribute_id,
           coalesce(
             (SELECT json_agg(json_build_object('valueUuid', v.value_uuid::text,
                                                'valueText', v.value_text)
                              ORDER BY v.position)
                FROM collection_rule_values v WHERE v.rule_id = r.id),
             '[]'::json) AS values
      FROM collection_rules r
     WHERE r.collection_id = ${collectionId}::uuid
     ORDER BY r.position
  `;
  const meta = await tx.$queryRaw<{ rule_match: string }[]>`
    SELECT rule_match FROM collections WHERE id = ${collectionId}::uuid
  `;
  return {
    match: (meta[0]?.rule_match as "all" | "any" | undefined) ?? "all",
    rules: rows.map((r) => ({
      field: String(r["field"]),
      operator: String(r["operator"]) as RuleRow["operator"],
      valueText: (r["value_text"] as string | null) ?? null,
      valueUuid: (r["value_uuid"] as string | null) ?? null,
      valueNumeric:
        r["value_numeric"] === null ? null : BigInt(String(r["value_numeric"]).split(".")[0]!),
      valueMarketCode: (r["value_market_code"] as string | null) ?? null,
      attributeId: (r["attribute_id"] as string | null) ?? null,
      values: (r["values"] as RuleRow["values"] | null) ?? [],
    })),
  };
}

/**
 * Re-evaluate one collection — 03 §6.4.
 *
 * **Takes a per-collection advisory lock first.** The two statements below are not atomic with
 * respect to each other's view of the predicate, and two refresh paths run concurrently by
 * design (a product save and the nightly job). At ReadCommitted the nightly pass, working from
 * a snapshot taken before a save committed, can DELETE the membership row that save just
 * inserted — and the losing write leaves no error anywhere, only a campaign page quietly
 * missing a piece. The lock is transaction-scoped and serialises PER COLLECTION, not across
 * the catalogue.
 */
export async function refreshCollection(
  tx: Tx,
  collectionId: string,
  opts?: { productIds?: string[] },
): Promise<RefreshResult> {
  await tx.$executeRaw`
    SELECT pg_advisory_xact_lock(hashtextextended('collection:' || ${collectionId}, 0))
  `;

  const { rules, match } = await loadRules(tx, collectionId);
  const predicate = buildRulePredicate(rules, match);
  const scoped = opts?.productIds ? sql`AND p.id = ANY(${opts.productIds}::uuid[])` : sql``;

  const added = await tx.$executeRaw`
    INSERT INTO product_collections (product_id, collection_id, source, rank, created_at)
    SELECT p.id, ${collectionId}::uuid, 'rule', 0, now()
      FROM products p
     WHERE p.deleted_at IS NULL AND ${predicate} ${scoped}
    ON CONFLICT (product_id, collection_id) DO NOTHING
  `;

  // `source='manual'` is outside BOTH statements by construction: a rule refresh cannot
  // delete a merchandiser's pin, and that is a property of the WHERE clause rather than a
  // convention anyone has to remember.
  const removed = await tx.$executeRaw`
    DELETE FROM product_collections pc
     WHERE pc.collection_id = ${collectionId}::uuid
       AND pc.source = 'rule'
       ${opts?.productIds ? sql`AND pc.product_id = ANY(${opts.productIds}::uuid[])` : sql``}
       AND NOT EXISTS (
         SELECT 1 FROM products p
          WHERE p.id = pc.product_id AND p.deleted_at IS NULL AND ${predicate}
       )
  `;

  // Stamped by FULL evaluations only. `/admin/catalog/collections` renders a value older than
  // 25 hours as a warning, because a silently stale rule-driven collection looks exactly like
  // a correct empty one.
  if (!opts?.productIds) {
    await tx.$executeRaw`
      UPDATE collections SET last_refreshed_at = now() WHERE id = ${collectionId}::uuid
    `;
  }

  return { added, removed, evaluated: rules.length };
}

/** One field the product changed, with BOTH sides of the change. */
export type RuleFieldChange = {
  field: string;
  addedIds?: string[];
  removedIds?: string[];
};

/**
 * Refresh only the collections that could possibly care — 03 §6.4.
 *
 * **`$2` is the union of ids ADDED and REMOVED, and getting that wrong is a one-line bug with
 * a day-long blast radius.** The obvious implementation passes the product's CURRENT stone,
 * material, tag and category ids. That refreshes every collection the product now qualifies
 * for and none of the ones it just stopped qualifying for: remove the labradorite link from a
 * ring and `stone equals labradorite` is not in the list at all, so the ring stays in
 * Labradorite Rings — on a live page, wrong, until the nightly pass.
 *
 * A `not_in` / `not_equals` / `is_false` rule needs the same union for the mirror-image
 * reason: GAINING a link is what makes a product leave a negated collection.
 */
export async function refreshCollectionsForProduct(
  tx: Tx,
  productId: string,
  changed: RuleFieldChange[],
): Promise<{ collectionsRefreshed: number }> {
  if (changed.length === 0) return { collectionsRefreshed: 0 };

  const fields = [...new Set(changed.map((c) => c.field))];
  const targets = [
    ...new Set(changed.flatMap((c) => [...(c.addedIds ?? []), ...(c.removedIds ?? [])])),
  ];

  const rows = await tx.$queryRaw<{ collection_id: string }[]>`
    SELECT DISTINCT cr.collection_id::text AS collection_id
      FROM collection_rules cr
      JOIN collections c ON c.id = cr.collection_id
                        AND c.mode = 'automatic' AND c.deleted_at IS NULL
     WHERE cr.field = ANY(${fields}::collection_rule_field[])
       AND (cr.value_uuid IS NULL OR cr.value_uuid = ANY(${targets}::uuid[]))
  `;

  for (const row of rows) {
    await refreshCollection(tx, row.collection_id, { productIds: [productId] });
  }
  return { collectionsRefreshed: rows.length };
}

/** Collections whose last full evaluation is older than the staleness window. */
export const STALE_AFTER_HOURS = 25;

export async function staleCollections(): Promise<
  { id: string; title: string; lastRefreshedAt: Date | null }[]
> {
  const rows = await db.$queryRaw<
    { id: string; title: string; last_refreshed_at: Date | null }[]
  >`
    SELECT id::text AS id, title, last_refreshed_at
      FROM collections
     WHERE mode = 'automatic' AND deleted_at IS NULL
       AND (last_refreshed_at IS NULL
            OR last_refreshed_at < now() - make_interval(hours => ${STALE_AFTER_HOURS}))
     ORDER BY last_refreshed_at NULLS FIRST
  `;
  return rows.map((r) => ({ id: r.id, title: r.title, lastRefreshedAt: r.last_refreshed_at }));
}
