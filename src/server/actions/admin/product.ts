"use server";

import { z } from "zod";
import { requireStaffSession } from "@/lib/auth/actor";
import {
  createProduct, publishProduct, saveProduct, setProductSlug,
} from "@/lib/catalog";
import { toWireError } from "@/lib/errors";
import type { Result } from "@/types/result";
import { err, ok } from "@/types/result";

/**
 * Product admin actions — 09 P07.
 *
 * A server action is a plain POST endpoint addressed by a generated id, so anything that
 * checks permissions only in the component that renders the button is reachable by
 * anyone who can read the page source. Every action here therefore:
 *
 *   1. resolves the STAFF actor (never `getActor()` — there is no such function),
 *   2. parses its input with `.strict()`, and
 *   3. delegates to the service, which calls `requirePermission` itself.
 *
 * The permission check lives in the SERVICE, not here, so a future caller that is not an
 * action — a job, an import, a CLI — cannot reach the write unguarded.
 */

/**
 * `.strict()` on every schema, deliberately.
 *
 * Zod's default strips unknown keys silently. That is exactly wrong for an autosave
 * payload: a form that grew a `price` field would have it quietly dropped, the editor
 * would see "Saved", and the price would not have changed. `.strict()` turns that into an
 * error on the first attempt (09 P07 criterion (e), P03A criterion (g)).
 */
const saveSchema = z
  .object({
    id: z.string().uuid(),
    expectedVersion: z.number().int().nonnegative(),
    title: z.string().min(1).max(200).optional(),
    subtitle: z.string().max(200).nullable().optional(),
    descriptionJson: z.unknown().optional(),
    careInstructionsJson: z.unknown().optional(),
    primaryCategoryId: z.string().uuid().nullable().optional(),
    isOneOfAKind: z.boolean().optional(),
    isMadeToOrder: z.boolean().optional(),
    leadTimeDays: z.number().int().positive().nullable().optional(),
  })
  .strict();

const createSchema = z
  .object({ title: z.string().min(1).max(200), slug: z.string().min(1).max(72) })
  .strict();

const slugSchema = z
  .object({
    id: z.string().uuid(),
    slug: z.string().min(1).max(72),
    expectedVersion: z.number().int().nonnegative(),
  })
  .strict();

const publishSchema = z
  .object({ id: z.string().uuid(), expectedVersion: z.number().int().nonnegative() })
  .strict();

type ActionError = { code: string; copyKey: string; fields?: Record<string, string[]> };

/** Errors cross this boundary as a code and a copy key — never a message, a stack or a
 *  provider payload (11 §2.1). */
function fail(e: unknown): ActionError {
  const w = toWireError(e);
  return { code: w.code, copyKey: w.copyKey, ...(w.fields ? { fields: w.fields } : {}) };
}

export async function createProductAction(
  input: unknown,
): Promise<Result<{ id: string; version: number }, ActionError>> {
  try {
    const actor = await requireStaffSession();
    return ok(await createProduct(actor, createSchema.parse(input)));
  } catch (e) {
    return err(fail(e));
  }
}

export async function saveProductAction(
  input: unknown,
): Promise<Result<{ version: number }, ActionError>> {
  try {
    const actor = await requireStaffSession();
    return ok(await saveProduct(actor, saveSchema.parse(input)));
  } catch (e) {
    return err(fail(e));
  }
}

export async function setProductSlugAction(
  input: unknown,
): Promise<Result<{ version: number; redirectCreated: boolean }, ActionError>> {
  try {
    const actor = await requireStaffSession();
    return ok(await setProductSlug(actor, slugSchema.parse(input)));
  } catch (e) {
    return err(fail(e));
  }
}

export async function publishProductAction(
  input: unknown,
): Promise<Result<{ version: number }, ActionError>> {
  try {
    const actor = await requireStaffSession();
    return ok(await publishProduct(actor, publishSchema.parse(input)));
  } catch (e) {
    return err(fail(e));
  }
}
