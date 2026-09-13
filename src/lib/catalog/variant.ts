import "server-only";
import type { Tx } from "@/lib/db/transaction";
import { db } from "@/lib/db/client";
import { withTransaction } from "@/lib/db/transaction";
import { requirePermission, type Actor } from "@/lib/rbac";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { buildSku } from "@/lib/catalog/sku";

/**
 * The variant engine — 09 P08, 03 §2.
 */

export type MatrixAxis = {
  optionId: string;
  name: string;
  position: number;
  values: {
    valueId: string;
    value: string;
    position: number;
    materialId: string | null;
  }[];
};

export type VariantMatrix = {
  axes: MatrixAxis[];
  variants: {
    variantId: string;
    sku: string;
    /** valueIds joined by '|' in axis position order — the lookup key for a selection. */
    key: string;
    valueIds: Record<string, string>;
    mediaId: string | null;
  }[];
};

/**
 * The canonical encoding of a variant's option selection.
 *
 * Sorted by AXIS POSITION, not by id — so the same selection always produces the same
 * string regardless of insertion order. This is what makes "does a variant with exactly
 * these options already exist" a unique-index probe rather than a join per option
 * (03 §2.2, `idx_variants_option_signature`).
 */
export function optionSignature(
  selection: { optionId: string; optionValueId: string }[],
  axisOrder: string[],
): string {
  const byOption = new Map(selection.map((s) => [s.optionId, s.optionValueId]));
  return axisOrder.map((optionId) => byOption.get(optionId) ?? "").join("|");
}

/** Every combination of one value per axis. */
export function cartesian<T>(axes: T[][]): T[][] {
  return axes.reduce<T[][]>((acc, axis) => acc.flatMap((row) => axis.map((v) => [...row, v])), [[]]);
}

/** Ten axes of two values each is 1,024 variants — almost always a mistake, and one that
 *  would take a merchandiser an afternoon to undo by hand (03 §2.2). */
export const MAX_GENERATED_VARIANTS = 200;

export type GenerateInput = {
  productId: string;
  /** Which option values to include. Omit to use every value on every axis. */
  include?: Record<string, string[]>;
  ringSizeByValueId?: Record<string, number>;
};

/**
 * Generate the option matrix as variants.
 *
 * Idempotent by `option_signature`: a combination that already has a live variant is
 * SKIPPED, not duplicated. That is what lets a merchandiser add a sixth ring size and
 * press Generate again without producing five duplicates of everything else.
 */
export async function generateVariants(
  actor: Actor,
  input: GenerateInput,
): Promise<{ created: number; skipped: number; variantIds: string[] }> {
  requirePermission(actor, "variant.update");

  return withTransaction(async (tx) => {
    const product = await tx.product.findFirst({
      where: { id: input.productId, deletedAt: null },
      select: { id: true, isOneOfAKind: true, primaryCategoryId: true },
    });
    if (!product) throw new NotFoundError("No such product.");

    const options = await tx.productOption.findMany({
      where: { productId: product.id },
      orderBy: { position: "asc" },
      select: {
        id: true, name: true, position: true,
        values: { orderBy: { position: "asc" }, select: { id: true, value: true, materialId: true } },
      },
    });
    if (options.length === 0) {
      throw new ValidationError("This product has no options to generate variants from.");
    }

    const axes = options.map((o) => {
      const allowed = input.include?.[o.id];
      const values = allowed ? o.values.filter((v) => allowed.includes(v.id)) : o.values;
      if (values.length === 0) {
        throw new ValidationError(`Option '${o.name}' has no values selected.`);
      }
      return { optionId: o.id, values };
    });

    const combos = cartesian(axes.map((a) => a.values.map((v) => ({ optionId: a.optionId, ...v }))));

    if (product.isOneOfAKind && combos.length > 1) {
      // idx_variants_ooak_single would refuse the second row anyway; failing here says
      // WHY, with the count, instead of surfacing a constraint name.
      throw new ConflictError(
        `A one-of-a-kind product has exactly one variant, but this would generate ` +
          `${combos.length}. Remove option values, or turn off one-of-a-kind.`,
      );
    }
    if (combos.length > MAX_GENERATED_VARIANTS) {
      throw new ConflictError(
        `That would generate ${combos.length} variants. The ceiling is ` +
          `${MAX_GENERATED_VARIANTS} — past that it is almost always an accident, and ` +
          `undoing it by hand takes an afternoon.`,
      );
    }

    const axisOrder = axes.map((a) => a.optionId);
    const existing = await tx.productVariant.findMany({
      where: { productId: product.id, deletedAt: null },
      select: { optionSignature: true },
    });
    const taken = new Set(existing.map((e) => e.optionSignature));

    const primaryStone = await tx.productStone.findFirst({
      where: { productId: product.id, isPrimary: true },
      select: { stoneId: true },
    });

    const variantIds: string[] = [];
    let created = 0;
    let skipped = 0;
    let position = existing.length;

    for (const combo of combos) {
      const signature = optionSignature(
        combo.map((c) => ({ optionId: c.optionId, optionValueId: c.id })),
        axisOrder,
      );
      if (taken.has(signature)) {
        skipped++;
        continue;
      }

      // The metal axis carries a material; the size axis does not. The SKU needs both,
      // and the ring size when there is one.
      const materialId = combo.find((c) => c.materialId)?.materialId ?? null;
      const ringSize = combo
        .map((c) => input.ringSizeByValueId?.[c.id])
        .find((s) => s !== undefined) ?? null;

      const sku = await buildSku(tx, {
        categoryId: product.primaryCategoryId ?? "",
        stoneId: primaryStone?.stoneId ?? null,
        materialId,
        ringSize,
      });

      const variant = await tx.productVariant.create({
        data: {
          productId: product.id,
          isOneOfAKind: product.isOneOfAKind,
          sku,
          position: position++,
          inventoryPolicy: "tracked",
          optionSignature: signature,
          ringSize: ringSize === null ? null : String(ringSize),
          isActive: true,
        },
        select: { id: true },
      });

      for (const c of combo) {
        await tx.variantOptionValue.create({
          data: { variantId: variant.id, optionId: c.optionId, optionValueId: c.id },
        });
      }
      if (materialId) {
        await tx.variantMaterial.create({
          data: { variantId: variant.id, materialId, weightGrams: "0.001", isPrimary: true },
        });
      }

      variantIds.push(variant.id);
      taken.add(signature);
      created++;
    }

    return { created, skipped, variantIds };
  });
}

/**
 * Remove one option value and the variants that use it.
 *
 * Soft-deletes ONLY the variants carrying that value — 09 P08 criterion (b). Deleting the
 * option value and leaving its variants would orphan rows that still appear in every
 * listing; deleting every variant of the product would destroy the other sizes.
 */
export async function removeOptionValue(
  actor: Actor,
  input: { productId: string; optionValueId: string },
): Promise<{ softDeletedVariants: number }> {
  requirePermission(actor, "variant.update");

  return withTransaction(async (tx) => {
    const affected = await tx.variantOptionValue.findMany({
      where: { optionValueId: input.optionValueId },
      select: { variantId: true },
    });
    const ids = affected.map((a) => a.variantId);

    const result = ids.length
      ? await tx.productVariant.updateMany({
          where: { id: { in: ids }, productId: input.productId, deletedAt: null },
          data: { deletedAt: new Date(), isActive: false },
        })
      : { count: 0 };

    // `variant_option_values.option_value_id` is ON DELETE RESTRICT, which is correct: an
    // option value that variants still reference must not vanish and leave them
    // describing a selection that no longer exists. Soft-deleting the variants does not
    // remove those join rows, so clear the ones for THIS value first — the value itself
    // is going away, so the linkage has nothing left to point at.
    await tx.variantOptionValue.deleteMany({ where: { optionValueId: input.optionValueId } });
    await tx.productOptionValue.delete({ where: { id: input.optionValueId } });
    return { softDeletedVariants: result.count };
  });
}

/**
 * The PDP's selector shape.
 *
 * **There is deliberately NO availability band on this type.** `getVariantMatrix()` is
 * called from the PDP, which is ISR for 900 seconds and CDN-served — so every field here
 * is baked into a shared HTML document for up to fifteen minutes. Structure and display
 * price belong there; STOCK DOES NOT. A one-of-a-kind piece that sold ninety seconds ago
 * would read "In stock" to every visitor for the rest of the window (03 §2.6, 01 §2.4).
 *
 * The band for the selected variant is streamed from a no-store Suspense boundary.
 */
export async function getVariantMatrix(productId: string): Promise<VariantMatrix> {
  const options = await db.productOption.findMany({
    where: { productId },
    orderBy: { position: "asc" },
    select: {
      id: true, name: true, position: true,
      values: {
        orderBy: { position: "asc" },
        select: { id: true, value: true, position: true, materialId: true },
      },
    },
  });

  const variants = await db.productVariant.findMany({
    where: { productId, deletedAt: null, isActive: true },
    orderBy: { position: "asc" },
    select: {
      id: true, sku: true, optionSignature: true,
      optionValues: { select: { optionId: true, optionValueId: true } },
      media: { take: 1, orderBy: { position: "asc" }, select: { mediaId: true } },
    },
  });

  return {
    axes: options.map((o) => ({
      optionId: o.id,
      name: o.name,
      position: o.position,
      values: o.values.map((v) => ({
        valueId: v.id, value: v.value, position: v.position, materialId: v.materialId,
      })),
    })),
    variants: variants.map((v) => ({
      variantId: v.id,
      sku: v.sku,
      key: v.optionSignature,
      valueIds: Object.fromEntries(v.optionValues.map((ov) => [ov.optionId, ov.optionValueId])),
      mediaId: v.media[0]?.mediaId ?? null,
    })),
  };
}

/**
 * Which option values are reachable given a partial selection.
 *
 * An unreachable combination is shown as UNAVAILABLE, never hidden: hiding "US 5" makes a
 * shopper think the size does not exist, rather than that it is not made in white gold
 * (03 §2.6).
 */
export function reachableValues(
  matrix: VariantMatrix,
  selection: Record<string, string>,
): Record<string, Set<string>> {
  const out: Record<string, Set<string>> = {};
  for (const axis of matrix.axes) out[axis.optionId] = new Set();

  for (const variant of matrix.variants) {
    for (const axis of matrix.axes) {
      // Does this variant match the selection on every OTHER axis?
      const compatible = Object.entries(selection).every(
        ([optId, valId]) => optId === axis.optionId || variant.valueIds[optId] === valId,
      );
      const value = variant.valueIds[axis.optionId];
      if (compatible && value) out[axis.optionId]!.add(value);
    }
  }
  return out;
}
