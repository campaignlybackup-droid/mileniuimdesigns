import "server-only";
import type { Tx } from "@/lib/db/transaction";
import { db } from "@/lib/db/client";
import { withTransaction } from "@/lib/db/transaction";
import { requirePermission, type Actor } from "@/lib/rbac";
import {
  ConflictError, NotFoundError, SlugTakenError, StaleWriteError, ValidationError,
} from "@/lib/errors";
import {
  getPublishBlockers, scoreProduct, scoreProductSeo, type ProductForScoring,
} from "@/lib/catalog/completeness";

/**
 * The catalogue service — 09 P07.
 *
 * Everything that writes a product goes through here. No server action, route handler or
 * component re-implements any of it (01 §2.3).
 */

export type SaveProductInput = {
  id: string;
  /** Optimistic concurrency. Zero rows updated is a StaleWriteError, never a silent
   *  overwrite of a colleague's edit. */
  expectedVersion: number;
  title?: string;
  subtitle?: string | null;
  descriptionJson?: unknown;
  careInstructionsJson?: unknown;
  primaryCategoryId?: string | null;
  isOneOfAKind?: boolean;
  isMadeToOrder?: boolean;
  leadTimeDays?: number | null;
};

/**
 * Columns the SERVER owns. An autosave payload carrying any of them is REFUSED, not
 * filtered (09 P07 exit criterion (e)).
 *
 * Silently ignoring them is worse than refusing: the admin believes it saved the price it
 * sent, the price did not change, and nobody finds out until a customer is charged the old
 * one. Refusing produces a bug report on the first attempt instead.
 */
export const SERVER_AUTHORITATIVE_FIELDS = [
  "version", "status", "publishedAt", "soldAt", "searchText", "searchVector",
  "completenessScore", "completenessChecks", "seoScore", "seoChecks", "scoredAt",
  "deletedAt", "createdAt", "updatedAt", "slug",
  // Not columns of `products`, but the shapes an over-eager form would nest in.
  "price", "prices", "priceMinor", "inventory", "stock", "quantity", "isDemo",
] as const;

export class ServerAuthoritativeFieldError extends ValidationError {
  constructor(fields: string[]) {
    super(
      `Refused: ${fields.join(", ")} ${fields.length === 1 ? "is" : "are"} set by the ` +
        `server, not by the editor. Silently ignoring them would let the admin believe a ` +
        `price was saved when it was not (03 §1.4).`,
      { context: { fields } },
    );
  }
}

export function assertNoServerAuthoritativeFields(payload: Record<string, unknown>): void {
  const offending = (SERVER_AUTHORITATIVE_FIELDS as readonly string[]).filter(
    (f) => Object.prototype.hasOwnProperty.call(payload, f),
  );
  if (offending.length) throw new ServerAuthoritativeFieldError(offending);
}

export async function saveProduct(actor: Actor, input: SaveProductInput): Promise<{ version: number }> {
  requirePermission(actor, "product.update");
  assertNoServerAuthoritativeFields(input as unknown as Record<string, unknown>);

  return withTransaction(async (tx) => {
    const data: Record<string, unknown> = {};
    if (input.title !== undefined) data["title"] = input.title.trim();
    if (input.subtitle !== undefined) data["subtitle"] = input.subtitle;
    if (input.descriptionJson !== undefined) data["descriptionJson"] = input.descriptionJson;
    if (input.careInstructionsJson !== undefined) data["careInstructionsJson"] = input.careInstructionsJson;
    if (input.primaryCategoryId !== undefined) data["primaryCategoryId"] = input.primaryCategoryId;
    if (input.isOneOfAKind !== undefined) data["isOneOfAKind"] = input.isOneOfAKind;
    if (input.isMadeToOrder !== undefined) data["isMadeToOrder"] = input.isMadeToOrder;
    if (input.leadTimeDays !== undefined) data["leadTimeDays"] = input.leadTimeDays;

    // The conditional UPDATE is the concurrency control. `WHERE id = $1 AND version = $2`
    // affecting zero rows means somebody else wrote first — a read-then-write would
    // overwrite them without either editor noticing.
    const updated = await tx.product.updateMany({
      where: { id: input.id, version: input.expectedVersion, deletedAt: null },
      data: { ...data, version: { increment: 1 } },
    });

    if (updated.count === 0) {
      const exists = await tx.product.findFirst({
        where: { id: input.id, deletedAt: null },
        select: { version: true },
      });
      if (!exists) throw new NotFoundError("No such product.");
      throw new StaleWriteError(
        `This product was changed by someone else (you had version ` +
          `${input.expectedVersion}, it is now ${exists.version}). Reload and reapply ` +
          `your change.`,
        { context: { expected: input.expectedVersion, actual: exists.version } },
      );
    }

    await reindexProduct(tx, input.id);
    await rescoreProduct(tx, input.id);

    const after = await tx.product.findUniqueOrThrow({
      where: { id: input.id },
      select: { version: true },
    });
    return { version: after.version };
  });
}

/**
 * Change a slug and write the redirect IN THE SAME TRANSACTION (09 P07 criterion (b)).
 *
 * Two statements outside a transaction is a window in which the old URL 404s: a customer
 * following a link from an email, a crawler revisiting an indexed page. The window is
 * small and it is the kind of thing that only ever happens in production.
 */
export async function setProductSlug(
  actor: Actor,
  input: { id: string; slug: string; expectedVersion: number },
): Promise<{ version: number; redirectCreated: boolean }> {
  requirePermission(actor, "product.update");

  const slug = input.slug.trim().toLowerCase();
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
    throw new ValidationError("A slug is lower-case words separated by single hyphens.");
  }
  if (slug.length > 72) throw new ValidationError("A slug must be 72 characters or fewer.");

  return withTransaction(async (tx) => {
    const current = await tx.product.findFirst({
      where: { id: input.id, deletedAt: null },
      select: { slug: true, status: true, version: true },
    });
    if (!current) throw new NotFoundError("No such product.");
    if (current.version !== input.expectedVersion) {
      throw new StaleWriteError("This product was changed by someone else. Reload and retry.");
    }
    if (current.slug === slug) return { version: current.version, redirectCreated: false };

    const clash = await tx.product.findFirst({
      where: { slug, deletedAt: null, id: { not: input.id } },
      select: { id: true },
    });
    if (clash) throw new SlugTakenError(`The slug '${slug}' is already in use.`);

    const updated = await tx.product.updateMany({
      where: { id: input.id, version: input.expectedVersion },
      data: { slug, version: { increment: 1 } },
    });
    if (updated.count === 0) throw new StaleWriteError("This product was changed by someone else.");

    // Only a PUBLISHED product has a URL anyone could have linked to. Writing a redirect
    // from a draft slug would fill the table with rows for URLs that never existed.
    let redirectCreated = false;
    if (current.status === "active") {
      const from = `/products/${current.slug}`;
      const to = `/products/${slug}`;

      // Repoint any redirect that pointed at the OLD path, so A→B followed by B→C gives
      // A→C rather than a two-hop chain a crawler will not follow (02 §7.10).
      //
      // ORDER MATTERS. Renaming BACK (A→B then B→A) makes the repoint target equal the
      // redirect's own source, which would write from == to — a self-redirect that
      // chk_redirects_not_self refuses, failing the whole transaction. Deactivate those
      // first, then repoint the rest.
      await tx.redirect.updateMany({
        where: { toPath: from, fromPath: to, isActive: true },
        data: { isActive: false },
      });
      await tx.redirect.updateMany({
        where: { toPath: from, isActive: true },
        data: { toPath: to },
      });

      const existing = await tx.redirect.findFirst({ where: { fromPath: from, isActive: true } });
      if (existing) {
        await tx.redirect.update({ where: { id: existing.id }, data: { toPath: to } });
      } else {
        await tx.redirect.create({
          data: { fromPath: from, toPath: to, statusCode: 301, isActive: true },
        });
      }
      redirectCreated = true;

      // A→B then B→A would otherwise take the product offline at both URLs. Deactivate
      // any redirect that now points back at us.
      await tx.redirect.updateMany({
        where: { fromPath: to, isActive: true },
        data: { isActive: false },
      });
    }

    await reindexProduct(tx, input.id);
    const after = await tx.product.findUniqueOrThrow({ where: { id: input.id }, select: { version: true } });
    return { version: after.version, redirectCreated };
  });
}

export async function publishProduct(
  actor: Actor,
  input: { id: string; expectedVersion: number },
): Promise<{ version: number }> {
  requirePermission(actor, "product.publish");

  const shape = await gatherForScoring(db, input.id);
  const blockers = getPublishBlockers(shape);
  if (blockers.length) {
    // Named, not "incomplete". An editor cannot act on "incomplete".
    throw new ConflictError(
      `Cannot publish: ${blockers.map((b) => b.label).join(", ")}.`,
      { context: { blockers } },
    );
  }

  return withTransaction(async (tx) => {
    const updated = await tx.product.updateMany({
      where: { id: input.id, version: input.expectedVersion, deletedAt: null },
      data: { status: "active", publishedAt: new Date(), version: { increment: 1 } },
    });
    if (updated.count === 0) throw new StaleWriteError("This product was changed by someone else.");
    await rescoreProduct(tx, input.id);
    const after = await tx.product.findUniqueOrThrow({ where: { id: input.id }, select: { version: true } });
    return { version: after.version };
  });
}

/**
 * Rebuild `search_text` from its SEVEN sources.
 *
 * Called inside the caller's transaction, so a rename and its reindex commit together —
 * a stone renamed and not reindexed is a silent outage of the primary discovery path on a
 * stone-led store (02 §2.4).
 */
export async function reindexProduct(tx: Tx, productId: string): Promise<void> {
  await tx.$executeRaw`
    UPDATE products p SET search_text = trim(both ' ' from concat_ws(' ',
      p.title, p.subtitle,
      (SELECT string_agg(v.sku, ' ')  FROM product_variants v WHERE v.product_id = p.id AND v.deleted_at IS NULL),
      (SELECT string_agg(s.name, ' ') FROM product_stones ps JOIN stones s ON s.id = ps.stone_id WHERE ps.product_id = p.id),
      (SELECT string_agg(m.name, ' ') FROM product_variants v2
         JOIN variant_materials vm ON vm.variant_id = v2.id
         JOIN materials m ON m.id = vm.material_id
        WHERE v2.product_id = p.id AND v2.deleted_at IS NULL),
      (SELECT string_agg(c.name, ' ') FROM product_categories pc JOIN categories c ON c.id = pc.category_id WHERE pc.product_id = p.id),
      (SELECT string_agg(t.name, ' ') FROM product_tags pt JOIN tags t ON t.id = pt.tag_id WHERE pt.product_id = p.id),
      (SELECT string_agg(col.title, ' ') FROM product_collections pcol JOIN collections col ON col.id = pcol.collection_id WHERE pcol.product_id = p.id)
    ))
    WHERE p.id = ${productId}::uuid
  `;
}

export async function rescoreProduct(tx: Tx, productId: string): Promise<void> {
  const shape = await gatherForScoring(tx, productId);
  const completeness = scoreProduct(shape);
  const seo = scoreProductSeo({
    seoTitle: null, seoDescription: null,
    slug: shape.primaryCategorySlug ?? "",
    heroHasAlt: shape.mediaMissingAltCount === 0 && shape.heroCount === 1,
    descriptionWordCount: shape.descriptionWordCount,
    hasOgImage: shape.heroCount === 1,
  });
  await tx.product.update({
    where: { id: productId },
    data: {
      completenessScore: completeness.score,
      completenessChecks: { checks: completeness.checks } as never,
      seoScore: seo.score,
      seoChecks: { checks: seo.checks } as never,
      scoredAt: new Date(),
    },
  });
}

/** ONE query. Fifteen checks must not be fifteen round trips (03 §1.6). */
export async function gatherForScoring(tx: Tx, productId: string): Promise<ProductForScoring> {
  const rows = await tx.$queryRaw<Record<string, unknown>[]>`
    SELECT
      p.title,
      array_length(regexp_split_to_array(coalesce(p.description_json->>'text',''), '\s+'), 1) AS description_words,
      array_length(regexp_split_to_array(coalesce(p.care_instructions_json->>'text',''), '\s+'), 1) AS care_words,
      p.primary_category_id,
      (SELECT c.slug FROM categories c WHERE c.id = p.primary_category_id) AS primary_category_slug,
      (SELECT count(*) FROM product_categories pc WHERE pc.product_id = p.id AND pc.category_id = p.primary_category_id) AS matching_category_rows,
      (SELECT count(*) FROM product_media pm WHERE pm.product_id = p.id AND pm.role IN ('gallery','hero','lifestyle')) AS media_count,
      (SELECT count(*) FROM product_media pm WHERE pm.product_id = p.id AND pm.role = 'hero' AND pm.variant_id IS NULL) AS hero_count,
      (SELECT count(*) FROM product_media pm JOIN media m ON m.id = pm.media_id
        WHERE pm.product_id = p.id AND (m.alt_text IS NULL OR btrim(m.alt_text) = '')) AS media_missing_alt,
      (SELECT count(*) FROM product_stones ps WHERE ps.product_id = p.id) AS stone_count,
      (SELECT count(*) FROM product_stones ps WHERE ps.product_id = p.id AND ps.is_primary) AS primary_stone_count,
      (SELECT count(*) FROM product_variants v WHERE v.product_id = p.id AND v.deleted_at IS NULL) AS live_variants,
      (SELECT count(DISTINCT v.id) FROM product_variants v JOIN variant_materials vm ON vm.variant_id = v.id
        WHERE v.product_id = p.id AND v.deleted_at IS NULL) AS variants_with_materials,
      (SELECT count(DISTINCT v.id) FROM product_variants v JOIN variant_materials vm ON vm.variant_id = v.id AND vm.is_primary
        WHERE v.product_id = p.id AND v.deleted_at IS NULL) AS variants_with_primary_material,
      (SELECT count(*) FROM product_variants v WHERE v.product_id = p.id AND v.deleted_at IS NULL
         AND v.sku ~ '^[A-Z0-9]{2,6}(-[A-Z0-9]{1,6}){1,4}$') AS variants_with_sku,
      (SELECT count(*) FROM product_variants v WHERE v.product_id = p.id AND v.deleted_at IS NULL
         AND v.gross_weight_grams IS NOT NULL) AS variants_with_weight,
      (SELECT count(*) FROM product_variants v WHERE v.product_id = p.id AND v.deleted_at IS NULL
         AND v.inventory_policy = 'tracked') AS tracked_variants,
      (SELECT count(*) FROM product_tags pt WHERE pt.product_id = p.id) AS tag_count,
      (SELECT count(*) FROM attributes a WHERE a.is_required AND a.deleted_at IS NULL
         AND (a.applies_to_category_id IS NULL OR a.applies_to_category_id = p.primary_category_id)) AS required_attributes,
      (SELECT count(DISTINCT pav.attribute_id) FROM product_attribute_values pav
         JOIN attributes a ON a.id = pav.attribute_id
        WHERE pav.product_id = p.id AND a.is_required AND a.deleted_at IS NULL) AS satisfied_required
    FROM products p WHERE p.id = ${productId}::uuid AND p.deleted_at IS NULL
  `;
  const r = rows[0];
  if (!r) throw new NotFoundError("No such product.");

  const markets = await tx.market.findMany({ where: { isActive: true }, select: { code: true } });
  const n = (k: string) => Number(r[k] ?? 0);

  return {
    title: String(r["title"] ?? ""),
    descriptionWordCount: n("description_words"),
    careWordCount: n("care_words"),
    mediaCount: n("media_count"),
    heroCount: n("hero_count"),
    mediaMissingAltCount: n("media_missing_alt"),
    primaryCategoryId: (r["primary_category_id"] as string | null) ?? null,
    primaryCategorySlug: (r["primary_category_slug"] as string | null) ?? null,
    hasMatchingCategoryRow: n("matching_category_rows") > 0,
    stoneCount: n("stone_count"),
    primaryStoneCount: n("primary_stone_count"),
    liveVariantCount: n("live_variants"),
    variantsWithMaterials: n("variants_with_materials"),
    variantsWithPrimaryMaterial: n("variants_with_primary_material"),
    variantsWithValidSku: n("variants_with_sku"),
    variantsWithWeight: n("variants_with_weight"),
    trackedVariantCount: n("tracked_variants"),
    // null, not 0 — `inventory_items` arrives at P18, and "no inventory rows" would be a
    // different and real failure.
    trackedVariantsWithInventory: null,
    tagCount: n("tag_count"),
    requiredAttributeCount: n("required_attributes"),
    satisfiedRequiredAttributeCount: n("satisfied_required"),
    pricedMarketCodes: null, // `prices` arrives at P10
    activeMarketCodes: markets.map((m) => m.code),
  };
}

export async function createProduct(
  actor: Actor,
  input: { title: string; slug: string },
): Promise<{ id: string; version: number }> {
  requirePermission(actor, "product.create");
  const slug = input.slug.trim().toLowerCase();
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
    throw new ValidationError("A slug is lower-case words separated by single hyphens.");
  }
  return withTransaction(async (tx) => {
    const clash = await tx.product.findFirst({ where: { slug, deletedAt: null }, select: { id: true } });
    if (clash) throw new SlugTakenError(`The slug '${slug}' is already in use.`);
    const p = await tx.product.create({
      data: { slug, title: input.title.trim(), status: "draft" },
      select: { id: true, version: true },
    });
    await reindexProduct(tx, p.id);
    await rescoreProduct(tx, p.id);
    // Re-read rather than assume. `rescoreProduct` deliberately does NOT bump `version` —
    // scoring is a server-side write, not an editorial edit, and bumping it would make
    // every autosave conflict with a background rescore. Returning `version + 1` was a
    // guess, and it made every caller's first save look stale.
    const after = await tx.product.findUniqueOrThrow({ where: { id: p.id }, select: { version: true } });
    return { id: p.id, version: after.version };
  });
}
