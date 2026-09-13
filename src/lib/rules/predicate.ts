import { empty, join, sql, type Sql } from "@/lib/db/sql";
import { ValidationError } from "@/lib/errors";

/**
 * The shared rule predicate builder — 03 §6.4, 15 §1.1.
 *
 * **There is no second rule language in this system.** Customer groups reuse the
 * collection-rule vocabulary exactly: the same operator enum, the same one-row-per-rule shape,
 * the same value columns, the same flat `all`/`any` connective with no nesting. What is not
 * shared is the TABLE — `collection_rules.collection_id` is `NOT NULL`, and making it nullable
 * with a discriminator gives you a polymorphic rule table whose every index carries a
 * `WHERE kind = …` and whose evaluator branches on it.
 *
 * So the shared artefact is the code, and the seam is a **field resolver**. Operator handling
 * is written once here; each domain supplies only its own field→SQL fragments. This module
 * imports nothing from a domain module — that is what stops it becoming a second service layer.
 */

export type RuleOperator =
  | "equals"
  | "not_equals"
  | "in"
  | "not_in"
  | "contains"
  | "not_contains"
  | "starts_with"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "is_true"
  | "is_false";

export type RuleValue = { valueUuid: string | null; valueText: string | null };

export type RuleRow = {
  field: string;
  operator: RuleOperator;
  valueText: string | null;
  valueUuid: string | null;
  valueNumeric: bigint | null;
  valueMarketCode: string | null;
  attributeId: string | null;
  /** Populated only for `in` / `not_in`, from `collection_rule_values`. */
  values: RuleValue[];
};

/** One comparison or EXISTS fragment for one field, supplied by the domain. */
export type FieldResolver = (rule: RuleRow) => Sql;

/**
 * A malformed rule is a ValidationError from the ONE taxonomy — not a new base class.
 *
 * I wrote `class RuleValidationError extends Error {}` here first, and
 * `tests/unit/error-taxonomy.test.ts` refused it. That guard exists because I built a second
 * error hierarchy four times during the schema phases: `instanceof` fails across duplicate
 * taxonomies, so the catch block that means to handle a validation failure does not catch it,
 * and the failure arrives at the customer as a 500.
 */
export const RuleValidationError = ValidationError;

/**
 * Join one fragment per rule with `AND` or `OR`.
 *
 * **An empty rule set is `false`, never `true`.** `AND` over nothing is vacuously true in
 * logic, and a collection whose rules were all deleted would then match the ENTIRE catalogue —
 * five thousand products appearing on a campaign page at 03:00, with no error anywhere. The
 * merchandiser's intent when a rule set is empty is "nothing yet", not "everything".
 */
export function buildRulePredicate(
  rules: readonly RuleRow[],
  match: "all" | "any",
  resolve: FieldResolver,
): Sql {
  if (rules.length === 0) return sql`false`;
  const fragments = rules.map((rule) => sql`(${resolve(rule)})`);
  return sql`(${join(fragments, match === "all" ? " AND " : " OR ")})`;
}

/**
 * The operator half, shared by every domain.
 *
 * `column` is a SQL fragment the resolver has already built — a column reference or a
 * subquery — and this wraps it in the comparison the operator names. Negations are the
 * resolver's job for `EXISTS`-shaped fields, because `NOT (EXISTS …)` and
 * `EXISTS (… <> …)` mean different things for a multi-valued relation: a product with two
 * stones is "not labradorite" only if NEITHER is, and the second spelling asks whether EITHER
 * is not.
 */
export function compare(column: Sql, rule: RuleRow): Sql {
  switch (rule.operator) {
    case "equals":
      return sql`${column} = ${scalar(rule)}`;
    case "not_equals":
      // `<>` is NULL-blind: a product with no value at all is not returned by `col <> 'x'`,
      // even though "its status is not archived" is plainly true of a product with no status.
      return sql`(${column} IS DISTINCT FROM ${scalar(rule)})`;
    case "in":
      return sql`${column} = ANY(${listOf(rule)})`;
    case "not_in":
      return sql`(${column} IS NULL OR NOT (${column} = ANY(${listOf(rule)})))`;
    case "contains":
      return sql`${column} ILIKE ${`%${text(rule)}%`}`;
    case "not_contains":
      return sql`(${column} IS NULL OR ${column} NOT ILIKE ${`%${text(rule)}%`})`;
    case "starts_with":
      return sql`${column} ILIKE ${`${text(rule)}%`}`;
    case "gt":
      return sql`${column} > ${numeric(rule)}`;
    case "gte":
      return sql`${column} >= ${numeric(rule)}`;
    case "lt":
      return sql`${column} < ${numeric(rule)}`;
    case "lte":
      return sql`${column} <= ${numeric(rule)}`;
    case "is_true":
      return sql`${column} IS TRUE`;
    case "is_false":
      // `IS NOT TRUE`, not `IS FALSE`: a NULL boolean is not true, and treating it as neither
      // leaves rows that belong in neither half of a two-way rule.
      return sql`${column} IS NOT TRUE`;
  }
}

/** The single value an operator compares against, whichever column holds it. */
function scalar(rule: RuleRow): string {
  const value = rule.valueUuid ?? rule.valueText;
  if (value === null) {
    throw new ValidationError(
      `Rule on '${rule.field}' with operator '${rule.operator}' has no value.`,
    );
  }
  return value;
}

function text(rule: RuleRow): string {
  if (rule.valueText === null) {
    throw new ValidationError(`Rule on '${rule.field}' needs a text value.`);
  }
  return rule.valueText;
}

/**
 * The numeric comparand, as a STRING for a `::numeric` cast.
 *
 * Money reaches this column already converted to integer minor units on write (03 §6.2): the
 * admin types 500 and `saveCollectionRules()` stores 50000, using the currency of
 * `value_market_code`. Dividing inside the predicate would be non-sargable AND would drag a
 * settlement amount through a decimal.
 */
function numeric(rule: RuleRow): string {
  if (rule.valueNumeric !== null) return rule.valueNumeric.toString();
  if (rule.valueText !== null) return rule.valueText; // ISO dates use the text column
  throw new ValidationError(`Rule on '${rule.field}' needs a numeric or date value.`);
}

function listOf(rule: RuleRow): string[] {
  if (rule.values.length === 0) {
    // An `in` with no values is not "matches nothing" by accident — it is a half-saved rule,
    // and evaluating it silently would make the collection quietly wrong rather than loudly.
    throw new ValidationError(
      `Rule on '${rule.field}' uses '${rule.operator}' but has no values. ` +
        `An in/not_in rule stores its list in collection_rule_values.`,
    );
  }
  return rule.values.map((v) => {
    const value = v.valueUuid ?? v.valueText;
    if (value === null) throw new ValidationError(`Empty value in a '${rule.operator}' list.`);
    return value;
  });
}

/** `in` / `not_in` are the only operators that read the child table (02 §7.2). */
export const MULTI_VALUE_OPERATORS: ReadonlySet<RuleOperator> = new Set<RuleOperator>([
  "in",
  "not_in",
]);

/**
 * Assert the split a CHECK cannot: multi-value operators use the child table, every other
 * operator uses the row's own columns, and neither borrows the other's storage.
 */
export function assertValueStorage(rule: RuleRow): void {
  const isMulti = MULTI_VALUE_OPERATORS.has(rule.operator);
  if (isMulti && rule.values.length === 0) {
    throw new ValidationError(`'${rule.operator}' needs at least one value.`);
  }
  if (!isMulti && rule.values.length > 0) {
    throw new ValidationError(
      `'${rule.operator}' reads the rule's own value columns, but ${String(rule.values.length)} ` +
        `child value(s) are stored. One of the two is what the merchandiser meant and the ` +
        `evaluator cannot tell which.`,
    );
  }
}

export { empty as emptyPredicate };
