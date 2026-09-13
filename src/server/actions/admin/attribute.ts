"use server";

import { z } from "zod";
import { requireStaffSession } from "@/lib/auth/actor";
import {
  createAttribute,
  deleteAttribute,
  saveProductAttributes,
  setAttributeOptions,
  updateAttribute,
} from "@/lib/catalog/attributes";
import { toWireError } from "@/lib/errors";
import type { Result } from "@/types/result";
import { err, ok } from "@/types/result";

/**
 * Attribute admin actions — 09 P09.
 *
 * Same three steps as every other action file (see `product.ts`): resolve the STAFF actor,
 * parse with `.strict()`, delegate to a service that calls `requirePermission` itself.
 *
 * `.strict()` matters more here than almost anywhere else. An attribute payload is a
 * discriminated shape — `{ text }`, `{ numeric }`, `{ optionIds }` — and Zod's default of
 * silently stripping unknown keys would turn "the merchandiser typed a number into a text
 * field" into "the field was saved empty and nobody was told".
 */

const dataType = z.enum([
  "text",
  "long_text",
  "number",
  "boolean",
  "select",
  "multi_select",
  "date",
  "composite",
]);
const scope = z.enum(["product", "variant", "both"]);
const decimal = z.string().regex(/^-?\d{1,10}(\.\d{1,4})?$/);

const valuesSchema = z
  .object({
    productId: z.uuid(),
    values: z
      .array(
        z
          .object({
            attributeId: z.uuid(),
            variantId: z.uuid().nullable(),
            text: z.string().optional(),
            numeric: decimal.optional(),
            bool: z.boolean().optional(),
            date: z.string().optional(),
            optionIds: z.array(z.uuid()).optional(),
            json: z.unknown().optional(),
          })
          .strict(),
      )
      .max(200),
  })
  .strict();

const createSchema = z
  .object({
    key: z
      .string()
      .regex(/^[a-z][a-z0-9_]{1,62}$/, "Lower snake_case, starting with a letter."),
    label: z.string().min(1).max(120),
    dataType,
    scope,
    isRequired: z.boolean().optional(),
    isFilterable: z.boolean().optional(),
    isComparable: z.boolean().optional(),
    unit: z.string().max(16).nullable().optional(),
    valueMin: decimal.nullable().optional(),
    valueMax: decimal.nullable().optional(),
    decimalPlaces: z.number().int().min(0).max(4).nullable().optional(),
    maxLength: z.number().int().min(1).max(10_000).nullable().optional(),
    helpText: z.string().max(500).nullable().optional(),
    appliesToCategoryId: z.uuid().nullable().optional(),
    rank: z.number().int().optional(),
  })
  .strict();

const updateSchema = createSchema
  .partial()
  .extend({
    id: z.uuid(),
    expectedVersion: z.number().int().nonnegative(),
  })
  .strict();

const optionsSchema = z
  .object({
    attributeId: z.uuid(),
    options: z
      .array(
        z
          .object({
            id: z.uuid().optional(),
            value: z.string().min(1).max(80),
            label: z.string().min(1).max(120),
            rank: z.number().int(),
          })
          .strict(),
      )
      .max(200),
  })
  .strict();

export async function saveProductAttributesAction(
  raw: unknown,
): Promise<Result<{ saved: true }, ReturnType<typeof toWireError>>> {
  const actor = await requireStaffSession();
  const parsed = valuesSchema.safeParse(raw);
  if (!parsed.success) return err(toWireError(parsed.error));
  try {
    await saveProductAttributes(actor, {
      productId: parsed.data.productId,
      values: parsed.data.values,
    });
    return ok({ saved: true });
  } catch (e) {
    return err(toWireError(e));
  }
}

export async function createAttributeAction(
  raw: unknown,
): Promise<Result<{ id: string }, ReturnType<typeof toWireError>>> {
  const actor = await requireStaffSession();
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) return err(toWireError(parsed.error));
  try {
    const id = await createAttribute(actor, parsed.data);
    return ok({ id });
  } catch (e) {
    return err(toWireError(e));
  }
}

export async function updateAttributeAction(
  raw: unknown,
): Promise<Result<{ saved: true }, ReturnType<typeof toWireError>>> {
  const actor = await requireStaffSession();
  const parsed = updateSchema.safeParse(raw);
  if (!parsed.success) return err(toWireError(parsed.error));
  const { id, ...rest } = parsed.data;
  try {
    await updateAttribute(actor, id, rest);
    return ok({ saved: true });
  } catch (e) {
    return err(toWireError(e));
  }
}

export async function setAttributeOptionsAction(
  raw: unknown,
): Promise<Result<{ removed: number; valuesCleared: number }, ReturnType<typeof toWireError>>> {
  const actor = await requireStaffSession();
  const parsed = optionsSchema.safeParse(raw);
  if (!parsed.success) return err(toWireError(parsed.error));
  try {
    // setAttributeOptions recomputes facet activation inside its own transaction — removing
    // an option can take a curated page below the threshold (03 §4.2).
    return ok(await setAttributeOptions(actor, parsed.data.attributeId, parsed.data.options));
  } catch (e) {
    return err(toWireError(e));
  }
}

export async function deleteAttributeAction(
  raw: unknown,
): Promise<Result<{ deleted: true }, ReturnType<typeof toWireError>>> {
  const actor = await requireStaffSession();
  const parsed = z.object({ id: z.uuid() }).strict().safeParse(raw);
  if (!parsed.success) return err(toWireError(parsed.error));
  try {
    await deleteAttribute(actor, parsed.data.id);
    return ok({ deleted: true });
  } catch (e) {
    return err(toWireError(e));
  }
}
