import "server-only";
import { z, type ZodType } from "zod";
import { withTransaction, type Tx } from "@/lib/db/transaction";
import { requirePermission, type Actor } from "@/lib/rbac";
import { recomputeFacetMarketActivation } from "@/lib/catalog/facet-activation";
import { AttributeValidationError } from "@/lib/errors";

/**
 * The flexible attribute system — 09 P09, 03 §3.
 *
 * EAV holds the long tail of specification fields the client will add over the next five
 * years without a migration: clasp type, setting style, bezel, finish. Four things are
 * deliberately NOT here — stone, metal, ring size/length and money — because each has a typed
 * home that is faster, safer or both (03 §3.1). Money most of all: an EAV amount has no
 * market, no currency foreign key, no `_minor` suffix and no CHECK, and `currency` is not a
 * member of `attribute_data_type` for that reason.
 */

export type AttributeDataType =
  | "text"
  | "long_text"
  | "number"
  | "boolean"
  | "select"
  | "multi_select"
  | "date"
  | "composite";

export type AttributeScope = "product" | "variant" | "both";

/** The subset of an `attributes` row that validation reads. */
export type AttributeDefinition = {
  id: string;
  key: string;
  dataType: AttributeDataType;
  scope: AttributeScope;
  isRequired: boolean;
  unit: string | null;
  /** Decimal strings, as they come out of NUMERIC(14,4). Never floats. */
  valueMin: string | null;
  valueMax: string | null;
  decimalPlaces: number | null;
  maxLength: number | null;
};

/** The value payload for one attribute on one product or variant. */
export type AttributeValueInput = {
  attributeId: string;
  /** NULL ⇒ the value is the product's. Set ⇒ this variant's only. */
  variantId: string | null;
} & Record<string, unknown>;

/** Which column a type writes. `chk_pav_one_value` enforces that exactly one is non-null. */
export const VALUE_COLUMN: Record<AttributeDataType, string> = {
  text: "value_text",
  long_text: "value_text",
  number: "value_numeric",
  boolean: "value_bool",
  select: "option_id",
  multi_select: "option_id",
  date: "value_date",
  composite: "value_json",
};

/** 03 §3.5, mirrored by `chk_attributes_filterable_type`. There is no filterable path for
 *  text: a free-text facet is either a LIKE '%…%' scan or a facet with 800 values, and both
 *  are the same bug. */
export const FILTERABLE_TYPES: ReadonlySet<AttributeDataType> = new Set<AttributeDataType>([
  "select",
  "multi_select",
  "boolean",
  "number",
]);

const NUMERIC_SCALE = 4;
const DECIMAL_RE = /^-?\d{1,10}(\.\d{1,4})?$/;

/**
 * A NUMERIC(14,4) decimal string as an integer scaled by 10^4.
 *
 * Comparisons against `value_min` / `value_max` are done on these, not on `Number`. A carat
 * weight is four decimal places wide and `0.1 + 0.2 !== 0.3`; the same reasoning that keeps
 * money in minor units keeps this out of floats.
 */
export function toScaled(value: string): bigint {
  const [whole, fraction = ""] = value.split(".");
  const negative = whole!.startsWith("-");
  const digits = (whole!.replace("-", "") + fraction.padEnd(NUMERIC_SCALE, "0")).replace(
    /^0+(?=\d)/,
    "",
  );
  const n = BigInt(digits === "" ? "0" : digits);
  return negative ? -n : n;
}

/** Places actually used, so `decimal_places = 0` refuses `4.5` rather than rounding it. */
function decimalPlacesUsed(value: string): number {
  return value.includes(".") ? value.split(".")[1]!.length : 0;
}

/**
 * Composite attributes validate against a registered schema, keyed by `attributes.key`.
 *
 * Empty at P09, and a composite attribute whose key is not registered is REFUSED rather than
 * waved through. Accepting arbitrary JSON into `value_json` because no schema is registered
 * yet would make `composite` the one type with no validation at all — which is the hole every
 * other branch in this file exists to close.
 */
export const COMPOSITE_SCHEMAS: Record<string, ZodType> = {};

/**
 * The Zod schema for ONE attribute's value payload, built at runtime from the row (03 §3.4).
 *
 * A CHECK constraint cannot read `attributes.data_type` from another row (02 §5.2), so the
 * type discipline has to live here. The same instance is reused by the server action, the CSV
 * import preview and the admin form's hints — one definition of "valid" (01 §1.1).
 *
 * Every branch is a STRICT object, which is what makes exit criterion (b) hold: a `number`
 * payload sent to a `text` attribute fails twice over — `numeric` is not a recognised key and
 * `text` is missing — and it fails in Zod, before any statement is built.
 */
export function attributeSchema(
  a: AttributeDefinition,
  optionIds: ReadonlySet<string>,
): ZodType {
  switch (a.dataType) {
    case "text":
    case "long_text": {
      const max = a.maxLength ?? (a.dataType === "long_text" ? 10_000 : 500);
      return z.strictObject({ text: z.string().trim().min(1).max(max) });
    }

    case "number": {
      const places = a.decimalPlaces;
      const min = a.valueMin;
      const max = a.valueMax;
      return z.strictObject({
        numeric: z
          .string()
          .regex(
            DECIMAL_RE,
            "Must be a decimal with at most 10 whole digits and 4 decimal places.",
          )
          .refine(
            (v) => places === null || decimalPlacesUsed(v) <= places,
            places === 0
              ? "Must be a whole number."
              : `Must have at most ${String(places)} decimal place(s).`,
          )
          .refine(
            (v) => min === null || toScaled(v) >= toScaled(min),
            min === null ? "" : `Must be at least ${min}.`,
          )
          .refine(
            (v) => max === null || toScaled(v) <= toScaled(max),
            max === null ? "" : `Must be at most ${max}.`,
          ),
      });
    }

    case "boolean":
      return z.strictObject({ bool: z.boolean() });

    case "date":
      return z.strictObject({
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be an ISO date (YYYY-MM-DD).")
          .refine((v) => !Number.isNaN(Date.parse(v)), "Not a real date.")
          .refine(
            (v) => a.valueMin === null || v >= a.valueMin,
            a.valueMin === null ? "" : `Must be on or after ${a.valueMin}.`,
          )
          .refine(
            (v) => a.valueMax === null || v <= a.valueMax,
            a.valueMax === null ? "" : `Must be on or before ${a.valueMax}.`,
          ),
      });

    case "select":
      return z.strictObject({
        optionIds: z
          .array(z.uuid().refine((id) => optionIds.has(id), "Not an option of this attribute."))
          .length(1, "A select attribute takes exactly one option."),
      });

    case "multi_select":
      return z.strictObject({
        optionIds: z
          .array(z.uuid().refine((id) => optionIds.has(id), "Not an option of this attribute."))
          .min(a.isRequired ? 1 : 0)
          .refine((ids) => new Set(ids).size === ids.length, "The same option twice."),
      });

    case "composite": {
      const registered = COMPOSITE_SCHEMAS[a.key];
      if (!registered) {
        return z.never({
          error: `No composite schema is registered for '${a.key}'. Register one in COMPOSITE_SCHEMAS before storing values against it.`,
        });
      }
      return z.strictObject({ json: registered });
    }
  }
}

/** `attributes` rows that apply to a category, subtree-inclusive (03 §3.3). */
export async function listAttributesForCategory(
  tx: Tx,
  categoryId: string | null,
): Promise<AttributeDefinition[]> {
  const rows = await tx.$queryRaw<Record<string, unknown>[]>`
    SELECT a.id, a.key, a.data_type::text AS data_type, a.scope, a.is_required, a.unit,
           a.value_min::text AS value_min, a.value_max::text AS value_max,
           a.decimal_places, a.max_length
    FROM attributes a
    WHERE a.deleted_at IS NULL
      AND (
        a.applies_to_category_id IS NULL
        OR ${categoryId}::uuid IS NOT NULL AND EXISTS (
          SELECT 1 FROM categories scoped, categories target
          WHERE scoped.id = a.applies_to_category_id
            AND target.id = ${categoryId}::uuid
            AND target.materialized_path LIKE scoped.materialized_path || '%'
        )
      )
    ORDER BY a.rank, a.key
  `;
  return rows.map(rowToDefinition);
}

function rowToDefinition(r: Record<string, unknown>): AttributeDefinition {
  return {
    id: String(r["id"]),
    key: String(r["key"]),
    dataType: String(r["data_type"]) as AttributeDataType,
    scope: String(r["scope"]) as AttributeScope,
    isRequired: r["is_required"] === true,
    unit: (r["unit"] as string | null) ?? null,
    valueMin: (r["value_min"] as string | null) ?? null,
    valueMax: (r["value_max"] as string | null) ?? null,
    decimalPlaces: r["decimal_places"] === null ? null : Number(r["decimal_places"]),
    maxLength: r["max_length"] === null ? null : Number(r["max_length"]),
  };
}

/** Every attribute named in the input, with its options, in one round trip. */
async function loadDefinitions(
  tx: Tx,
  attributeIds: string[],
): Promise<Map<string, { definition: AttributeDefinition; optionIds: Set<string> }>> {
  if (attributeIds.length === 0) return new Map();
  const rows = await tx.$queryRaw<Record<string, unknown>[]>`
    SELECT a.id, a.key, a.data_type::text AS data_type, a.scope, a.is_required, a.unit,
           a.value_min::text AS value_min, a.value_max::text AS value_max,
           a.decimal_places, a.max_length,
           coalesce(
             (SELECT array_agg(o.id::text) FROM attribute_options o WHERE o.attribute_id = a.id),
             ARRAY[]::text[]
           ) AS option_ids
    FROM attributes a
    WHERE a.id = ANY(${attributeIds}::uuid[]) AND a.deleted_at IS NULL
  `;
  return new Map(
    rows.map((r) => [
      String(r["id"]),
      {
        definition: rowToDefinition(r),
        optionIds: new Set((r["option_ids"] as string[] | null) ?? []),
      },
    ]),
  );
}

/**
 * Write a product's attribute values. Called inside the product-save transaction (03 §3.4).
 *
 * **Delete-then-insert per (product, attribute, variant scope)**, never upsert-per-row.
 * `multi_select` legitimately produces N rows, and diffing against N rows is exactly where
 * duplicate-option bugs live: a merchandiser unticks one of three finishes and the row for it
 * survives because the diff matched on the wrong key.
 *
 * Takes an `actor` and checks `catalog.product_update` itself, even though `saveProduct()`
 * has already checked it. Not belt-and-braces: this function is what the CSV import (P29) and
 * the bulk editor will call, and neither is a server action. The rule that an exported writer
 * authorizes IN THE SERVICE exists precisely so that the second caller — the one written a
 * year later by someone who never read `saveProduct` — cannot reach the write unguarded.
 *
 * **Category applicability is NOT validated here, deliberately.** `applies_to_category_id`
 * decides which fields the admin form RENDERS and which facets a listing offers; it does not
 * decide what may be stored. Enforcing it on write would make a product unsaveable the moment
 * someone re-filed it from RINGS to CHAINS — the save carries values for attributes that no
 * longer apply, every one of them is refused, and the way out is to delete a merchandiser's
 * typed data as a side effect of a filing change. Values for an out-of-scope attribute simply
 * stop being shown.
 */
export async function setAttributeValues(
  actor: Actor,
  tx: Tx,
  input: { productId: string; values: AttributeValueInput[] },
): Promise<void> {
  requirePermission(actor, "product.update");
  const ids = [...new Set(input.values.map((v) => v.attributeId))];
  const defs = await loadDefinitions(tx, ids);

  type Pending = {
    attributeId: string;
    variantId: string | null;
    dataType: AttributeDataType;
    payload: Record<string, unknown>;
  };
  const pending: Pending[] = [];

  for (const value of input.values) {
    const entry = defs.get(value.attributeId);
    if (!entry) {
      throw new AttributeValidationError(
        `No live attribute ${value.attributeId}. A deleted attribute keeps its values but takes no new ones.`,
      );
    }
    const { definition, optionIds } = entry;

    // Entity scope. A per-variant value on a product-scoped attribute would render once in
    // the form and N times in the database, and the form would win.
    const wantsVariant = value.variantId !== null;
    const scopeOk =
      definition.scope === "both" ||
      (definition.scope === "variant" && wantsVariant) ||
      (definition.scope === "product" && !wantsVariant);
    if (!scopeOk) {
      throw new AttributeValidationError(
        `Attribute '${definition.key}' is scoped to ${definition.scope}, so a value ${
          wantsVariant ? "on a variant" : "on the product"
        } is not storable.`,
        { fields: { [definition.key]: ["Wrong scope for this attribute."] } },
      );
    }

    const payload: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (k !== "attributeId" && k !== "variantId") payload[k] = v;
    }
    const parsed = attributeSchema(definition, optionIds).safeParse(payload);
    if (!parsed.success) {
      throw new AttributeValidationError(
        `Attribute '${definition.key}' (${definition.dataType}): ${parsed.error.issues
          .map((i) => `${i.path.join(".") || "value"} — ${i.message}`)
          .join("; ")}`,
        { fields: { [definition.key]: parsed.error.issues.map((i) => i.message) } },
      );
    }

    pending.push({
      attributeId: definition.id,
      variantId: value.variantId,
      dataType: definition.dataType,
      payload: parsed.data as Record<string, unknown>,
    });
  }

  // One delete per (attribute, scope) touched — not a blanket delete of the product's values,
  // which would silently discard every attribute the caller did not happen to mention.
  const scopes = new Map<string, { attributeId: string; variantId: string | null }>();
  for (const p of pending) scopes.set(`${p.attributeId}:${p.variantId ?? ""}`, p);
  for (const s of scopes.values()) {
    if (s.variantId === null) {
      await tx.$executeRaw`
        DELETE FROM product_attribute_values
        WHERE product_id = ${input.productId}::uuid
          AND attribute_id = ${s.attributeId}::uuid
          AND variant_id IS NULL
      `;
    } else {
      await tx.$executeRaw`
        DELETE FROM product_attribute_values
        WHERE product_id = ${input.productId}::uuid
          AND attribute_id = ${s.attributeId}::uuid
          AND variant_id = ${s.variantId}::uuid
      `;
    }
  }

  for (const p of pending) {
    const rows = toRows(p.dataType, p.payload);
    for (const row of rows) {
      await tx.$executeRaw`
        INSERT INTO product_attribute_values
          (id, product_id, variant_id, attribute_id, option_id,
           value_text, value_numeric, value_bool, value_date, value_json, created_at, updated_at)
        VALUES
          (gen_random_uuid(), ${input.productId}::uuid, ${p.variantId}::uuid, ${p.attributeId}::uuid,
           ${row.optionId}::uuid, ${row.text}, ${row.numeric}::numeric, ${row.bool},
           ${row.date}::date, ${row.json}::jsonb, now(), now())
      `;
    }
  }
}

type ValueRow = {
  optionId: string | null;
  text: string | null;
  numeric: string | null;
  bool: boolean | null;
  date: string | null;
  json: string | null;
};

const EMPTY_ROW: ValueRow = {
  optionId: null,
  text: null,
  numeric: null,
  bool: null,
  date: null,
  json: null,
};

/** One payload becomes N rows — N is 1 for everything except `multi_select`. */
function toRows(dataType: AttributeDataType, payload: Record<string, unknown>): ValueRow[] {
  switch (dataType) {
    case "text":
    case "long_text":
      return [{ ...EMPTY_ROW, text: payload["text"] as string }];
    case "number":
      return [{ ...EMPTY_ROW, numeric: payload["numeric"] as string }];
    case "boolean":
      return [{ ...EMPTY_ROW, bool: payload["bool"] as boolean }];
    case "date":
      return [{ ...EMPTY_ROW, date: payload["date"] as string }];
    case "select":
    case "multi_select":
      return (payload["optionIds"] as string[]).map((id) => ({ ...EMPTY_ROW, optionId: id }));
    case "composite":
      return [{ ...EMPTY_ROW, json: JSON.stringify(payload["json"]) }];
  }
}

// ── Attribute and option administration (permission `attribute.update`) ──────────────

export type AttributeInput = {
  key: string;
  label: string;
  dataType: AttributeDataType;
  scope: AttributeScope;
  isRequired?: boolean;
  isFilterable?: boolean;
  isComparable?: boolean;
  unit?: string | null;
  valueMin?: string | null;
  valueMax?: string | null;
  decimalPlaces?: number | null;
  maxLength?: number | null;
  helpText?: string | null;
  appliesToCategoryId?: string | null;
  rank?: number;
};

function assertCoherent(
  input: Pick<AttributeInput, "dataType" | "isFilterable" | "unit">,
): void {
  if (input.isFilterable && !FILTERABLE_TYPES.has(input.dataType)) {
    // The database says the same thing via chk_attributes_filterable_type. Saying it here
    // first is the difference between a sentence a merchandiser can act on and a constraint
    // violation naming a check they have never heard of.
    throw new AttributeValidationError(
      `A ${input.dataType} attribute cannot be a storefront filter. Only ${[...FILTERABLE_TYPES].join(", ")} have a column an index can serve (03 §3.5).`,
      { fields: { isFilterable: ["Not filterable for this type."] } },
    );
  }
}

export async function createAttribute(actor: Actor, input: AttributeInput): Promise<string> {
  requirePermission(actor, "attribute.update");
  assertCoherent(input);
  return withTransaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO attributes (id, key, label, data_type, unit, is_filterable, is_comparable,
                            applies_to_category_id, scope, is_required, value_min, value_max,
                            decimal_places, max_length, help_text, rank, version, created_at, updated_at)
    VALUES (gen_random_uuid(), ${input.key}, ${input.label},
            ${input.dataType}::attribute_data_type, ${input.unit ?? null},
            ${input.isFilterable ?? false}, ${input.isComparable ?? false},
            ${input.appliesToCategoryId ?? null}::uuid, ${input.scope}, ${input.isRequired ?? false},
            ${input.valueMin ?? null}::numeric, ${input.valueMax ?? null}::numeric,
            ${input.decimalPlaces ?? null}, ${input.maxLength ?? null}, ${input.helpText ?? null},
            ${input.rank ?? 0}, 1, now(), now())
    RETURNING id::text AS id
  `;
    return rows[0]!.id;
  });
}

/**
 * Update an attribute. **`data_type` cannot change once values exist.**
 *
 * The value lives in a column chosen by the type: flipping `select` to `text` leaves every
 * existing value in `option_id` while every reader looks in `value_text`, and the product pages
 * go blank without a single error being raised. `chk_pav_one_value` cannot catch it, because
 * each row still has exactly one value — just not the one anybody reads.
 */
export async function updateAttribute(
  actor: Actor,
  id: string,
  input: Partial<AttributeInput> & { expectedVersion: number },
): Promise<void> {
  requirePermission(actor, "attribute.update");
  await withTransaction(async (tx) => {
    const current = await tx.$queryRaw<{ data_type: string; version: number }[]>`
    SELECT data_type::text AS data_type, version FROM attributes
    WHERE id = ${id}::uuid AND deleted_at IS NULL
  `;
    const row = current[0];
    if (!row) throw new AttributeValidationError("No such attribute.");

    const dataType = (input.dataType ?? row.data_type) as AttributeDataType;
    if (input.dataType !== undefined && input.dataType !== row.data_type) {
      const used = await tx.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM product_attribute_values WHERE attribute_id = ${id}::uuid
    `;
      if ((used[0]?.n ?? 0) > 0) {
        throw new AttributeValidationError(
          `This attribute has ${String(used[0]!.n)} stored value(s), so its type cannot change. Create a new attribute and migrate the values deliberately.`,
          { fields: { dataType: ["Type is fixed once values exist."] } },
        );
      }
    }
    assertCoherent({
      dataType,
      isFilterable: input.isFilterable ?? false,
      unit: input.unit ?? null,
    });

    const updated = await tx.$executeRaw`
    UPDATE attributes SET
      key = coalesce(${input.key ?? null}, key),
      label = coalesce(${input.label ?? null}, label),
      data_type = coalesce(${input.dataType ?? null}::attribute_data_type, data_type),
      scope = coalesce(${input.scope ?? null}, scope),
      is_required = coalesce(${input.isRequired ?? null}, is_required),
      is_filterable = coalesce(${input.isFilterable ?? null}, is_filterable),
      rank = coalesce(${input.rank ?? null}, rank),
      version = version + 1,
      updated_at = now()
    WHERE id = ${id}::uuid AND version = ${input.expectedVersion} AND deleted_at IS NULL
  `;
    if (updated === 0) {
      throw new AttributeValidationError(
        "This attribute changed while you were editing it. Reload and reapply your change.",
      );
    }
  });
}

/**
 * Replace an attribute's options.
 *
 * Returns how many product values a removal would destroy — `product_attribute_values.option_id`
 * cascades, so deleting an option really does unset it on every product. That is the right
 * behaviour (an attribute value is descriptive, unlike a variant's option value, which
 * describes something purchasable — 03 §2.2), but the caller must be able to SHOW the number
 * before the merchandiser presses save.
 */
export async function setAttributeOptions(
  actor: Actor,
  attributeId: string,
  options: { id?: string; value: string; label: string; rank: number }[],
): Promise<{ removed: number; valuesCleared: number }> {
  requirePermission(actor, "attribute.update");
  return withTransaction(async (tx) => {
    const keep = options.map((o) => o.id).filter((id): id is string => typeof id === "string");
    const cleared = await tx.$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS n FROM product_attribute_values
    WHERE attribute_id = ${attributeId}::uuid
      AND option_id IS NOT NULL
      AND NOT (option_id = ANY(${keep}::uuid[]))
  `;
    const removed = await tx.$executeRaw`
    DELETE FROM attribute_options
    WHERE attribute_id = ${attributeId}::uuid AND NOT (id = ANY(${keep}::uuid[]))
  `;
    for (const o of options) {
      if (o.id) {
        await tx.$executeRaw`
        UPDATE attribute_options SET value = ${o.value}, label = ${o.label}, rank = ${o.rank}
        WHERE id = ${o.id}::uuid AND attribute_id = ${attributeId}::uuid
      `;
      } else {
        await tx.$executeRaw`
        INSERT INTO attribute_options (id, attribute_id, value, label, rank)
        VALUES (gen_random_uuid(), ${attributeId}::uuid, ${o.value}, ${o.label}, ${o.rank})
      `;
      }
    }
    // Removing an option changes which products carry it, so a facet page targeting one of them
    // may have crossed the threshold in either direction. Inside THIS transaction, not left to
    // the nightly pass: an indexable page with nothing on it should not survive until 03:00
    // (03 §4.2), and a page that qualified a second ago should not 301 away because two writes
    // landed in the wrong order.
    await recomputeFacetMarketActivation(tx);
    return { removed, valuesCleared: cleared[0]?.n ?? 0 };
  });
}

/** Soft delete. The values stay: `idx_attributes_key_live` frees the key, and a product's
 *  history of what it once recorded is not an engineering decision to erase. */
export async function deleteAttribute(actor: Actor, id: string): Promise<void> {
  requirePermission(actor, "attribute.update");
  await withTransaction(async (tx) => {
    await tx.$executeRaw`
      UPDATE attributes SET deleted_at = now(), version = version + 1, updated_at = now()
      WHERE id = ${id}::uuid AND deleted_at IS NULL
    `;
  });
}

/**
 * The standalone form of `setAttributeValues`, which opens its own transaction.
 *
 * The tx-taking form stays exported because `saveProduct()` composes it into ONE transaction
 * with the reindex, the collection refresh and the completeness rescore (03 §3.6). An action
 * may not open a transaction itself — `boundaries/dependencies` and
 * `tests/unit/actions-shape.test.ts` both refuse an import of `@/lib/db` from `src/server/**` —
 * so the outer form lives here, where it can be composed by anything.
 */
export async function saveProductAttributes(
  actor: Actor,
  input: { productId: string; values: AttributeValueInput[] },
): Promise<void> {
  await withTransaction((tx) => setAttributeValues(actor, tx, input));
}
