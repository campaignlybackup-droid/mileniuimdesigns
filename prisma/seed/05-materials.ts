import type { PrismaClient } from "@/generated/prisma/client";

/**
 * The launch materials — 00-CONTEXT §6, 02 §6.
 *
 * A flexible Material entity, not an enum frozen at three golds. `purity_ratio` and
 * `is_rate_linked` are the metal-pricing inputs: 14K is 14/24 = 0.58333, and silver is
 * rate-linked because that is the metal this house actually works in.
 *
 * `is_rate_linked = true` does NOT mean prices move on their own. A metal-rate change
 * produces a PREVIEW that an admin approves; nothing reaches a live price without that
 * (hard rule 6). The flag only says this material's cost has a market rate behind it.
 *
 * `NMTL` is reserved for "no metal" and is not a row.
 */
const MATERIALS = [
  {
    slug: "sterling-silver", name: "Sterling Silver", kind: "metal",
    purityLabel: "925", purityRatio: "0.92500", isRateLinked: true,
    skuToken: "SS92", rank: 1,
  },
  {
    slug: "14k-yellow-gold", name: "14K Yellow Gold", kind: "metal",
    purityLabel: "14K", purityRatio: "0.58333", isRateLinked: true,
    skuToken: "14YG", rank: 2,
  },
  {
    slug: "14k-white-gold", name: "14K White Gold", kind: "metal",
    purityLabel: "14K", purityRatio: "0.58333", isRateLinked: true,
    skuToken: "14WG", rank: 3,
  },
  {
    slug: "14k-rose-gold", name: "14K Rose Gold", kind: "metal",
    purityLabel: "14K", purityRatio: "0.58333", isRateLinked: true,
    skuToken: "14RG", rank: 4,
  },
] as const;

export async function seedMaterials(db: PrismaClient): Promise<void> {
  for (const m of MATERIALS) {
    const existing = await db.material.findFirst({ where: { slug: m.slug, deletedAt: null } });
    if (existing) continue;
    await db.material.create({
      data: {
        slug: m.slug,
        name: m.name,
        kind: m.kind,
        purityLabel: m.purityLabel,
        purityRatio: m.purityRatio,
        isRateLinked: m.isRateLinked,
        skuToken: m.skuToken,
        isPublished: false,
        rank: m.rank,
      },
    });
  }
}
