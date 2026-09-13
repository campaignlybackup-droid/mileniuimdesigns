import "server-only";
import type { Tx } from "@/lib/db/transaction";
import { ValidationError } from "@/lib/errors";

/**
 * SKU generation — 03 §2.6.
 *
 *   MD-<TYPE>-<STONE>-<METAL>-<SIZE>
 *      │       │        │       └─ zero-padded 2-digit US ring size, or 'NA'
 *      │       │        └────────── materials.sku_token, 4 chars
 *      │       └─────────────────── stones.sku_token, 3 chars
 *      └─────────────────────────── categories.sku_token, 3 chars
 *
 * The tokens come from the DATABASE, not a map in TypeScript. A `slug → token` map here
 * would mean a new stone needs a deploy (hard rule 1); deriving the token from the slug's
 * first three letters collides `garnet` and `garnet-rhodolite` on day one.
 */
export const SKU_PATTERN = /^MD-[A-Z]{3}-[A-Z]{3}-[A-Z0-9]{4}-(\d{2}|NA)(-[A-Z0-9]{2})?$/;

/**
 * Reserved tokens for the absent cases.
 *
 * Every segment is mandatory — the pattern has no optional stone or metal group — and
 * completeness check 10 requires every live variant's SKU to match. So without sentinels,
 * a plain chain (check 7 explicitly exempts CHAINS from the stone requirement) or a cord
 * piece with no metal could NEVER produce a conforming SKU, and would sit permanently
 * below 100 on a check nobody can clear.
 */
export const SKU_NO_STONE = "NST";
export const SKU_NO_METAL = "NMTL";

export type BuildSkuInput = {
  categoryId: string;
  stoneId: string | null;
  materialId: string | null;
  /** US ring size. `null` for anything that is not sized. */
  ringSize: number | null;
};

/**
 * Build a SKU, resolving collisions against LIVE SKUs by appending `-02`, `-03`, …
 *
 * Runs inside the caller's transaction: two variants created concurrently would otherwise
 * both probe, both find `-02` free, and both try to take it. The unique index refuses the
 * second, and the caller retries.
 */
export async function buildSku(tx: Tx, input: BuildSkuInput): Promise<string> {
  const category = await tx.category.findUnique({
    where: { id: input.categoryId },
    select: { skuToken: true, slug: true },
  });
  if (!category?.skuToken) {
    throw new ValidationError(
      `Category '${category?.slug ?? input.categoryId}' has no sku_token. Set one before ` +
        `creating variants — the SKU format has no optional segment.`,
    );
  }

  let stoneToken = SKU_NO_STONE;
  if (input.stoneId) {
    const stone = await tx.stone.findUnique({
      where: { id: input.stoneId },
      select: { skuToken: true, slug: true },
    });
    if (!stone?.skuToken) {
      throw new ValidationError(`Stone '${stone?.slug ?? input.stoneId}' has no sku_token.`);
    }
    stoneToken = stone.skuToken;
  }

  let metalToken = SKU_NO_METAL;
  if (input.materialId) {
    const material = await tx.material.findUnique({
      where: { id: input.materialId },
      select: { skuToken: true, slug: true },
    });
    if (!material?.skuToken) {
      throw new ValidationError(
        `Material '${material?.slug ?? input.materialId}' has no sku_token.`,
      );
    }
    metalToken = material.skuToken;
  }

  const size =
    input.ringSize === null || input.ringSize === undefined
      ? "NA"
      : String(Math.round(input.ringSize)).padStart(2, "0");

  const base = `MD-${category.skuToken}-${stoneToken}-${metalToken}-${size}`;

  // Probe for a free suffix. Bounded: 98 variants sharing every token is not a catalogue
  // problem, it is a data-entry accident, and looping forever would hide it.
  const taken = await tx.productVariant.findMany({
    where: { sku: { startsWith: base }, deletedAt: null },
    select: { sku: true },
  });
  const used = new Set(taken.map((t) => t.sku));
  if (!used.has(base)) return base;

  for (let n = 2; n <= 99; n++) {
    const candidate = `${base}-${String(n).padStart(2, "0")}`;
    if (!used.has(candidate)) return candidate;
  }
  throw new ValidationError(
    `Exhausted SKU suffixes for ${base}. Ninety-nine variants share every token, which ` +
      `is a data-entry accident rather than a catalogue.`,
  );
}

export function isValidSku(sku: string): boolean {
  return SKU_PATTERN.test(sku);
}
