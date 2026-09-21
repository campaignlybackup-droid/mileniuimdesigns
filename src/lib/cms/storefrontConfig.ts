import "server-only";
import { db } from "@/lib/db/client";
import { revalidatePath } from "next/cache";
import { requireStaffSession } from "@/lib/auth/actor";
import {
  DEFAULT_STOREFRONT_CONFIG,
  type StorefrontCustomizationConfig,
  type HeroSlideConfig,
  type TrustPillarConfig,
  type TestimonialConfig,
  type FooterLinkItem,
  type FooterColumnConfig,
} from "./storefrontDefaults";

export {
  DEFAULT_STOREFRONT_CONFIG,
  type StorefrontCustomizationConfig,
  type HeroSlideConfig,
  type TrustPillarConfig,
  type TestimonialConfig,
  type FooterLinkItem,
  type FooterColumnConfig,
};

/**
 * Loads the complete storefront configuration merged with any persisted settings from PostgreSQL.
 */
export async function getStorefrontConfig(
  marketCode?: string | null,
): Promise<StorefrontCustomizationConfig> {
  const merged: StorefrontCustomizationConfig = { ...DEFAULT_STOREFRONT_CONFIG };

  try {
    const marketUpper = marketCode ? marketCode.toUpperCase() : null;
    const settings = await db.setting.findMany({
      where: {
        OR: [
          { marketCode: null },
          ...(marketUpper ? [{ marketCode: marketUpper }] : []),
        ],
      },
      select: { key: true, value: true, marketCode: true },
    });

    // Apply global settings first, then market-specific overrides
    const sorted = settings.sort((a, b) => (a.marketCode ? 1 : 0) - (b.marketCode ? 1 : 0));

    for (const s of sorted) {
      if (s.key.startsWith("cms.")) {
        const fieldName = s.key.replace(/^cms\./, "");
        if (fieldName in merged) {
          (merged as unknown as Record<string, unknown>)[fieldName] = s.value;
        }
      }
    }
  } catch (error) {
    console.warn("Could not load storefront customization settings from DB, using defaults:", error);
  }

  return merged;
}

/**
 * Bulk saves or updates settings in the database and triggers cache revalidation.
 */
export async function saveStorefrontSettings(
  settingsRecord: Partial<StorefrontCustomizationConfig>,
  marketCode?: string | null,
): Promise<void> {
  await requireStaffSession().catch(() => null);
  const marketUpper = marketCode ? marketCode.toUpperCase() : null;

  for (const [field, rawValue] of Object.entries(settingsRecord)) {
    const key = `cms.${field}`;
    const value = rawValue as object;
    const groupKey = field.split(/(?=[A-Z])/)[0]?.toLowerCase() || "customization";
    const label = field.replace(/([A-Z])/g, " $1").replace(/^./, (str) => str.toUpperCase());

    const existing = await db.setting.findFirst({
      where: {
        key,
        marketCode: marketUpper,
      },
    });

    if (existing) {
      await db.setting.update({
        where: { id: existing.id },
        data: {
          value,
          updatedAt: new Date(),
        },
      });
    } else {
      await db.setting.create({
        data: {
          key,
          marketCode: marketUpper,
          value,
          valueType: typeof rawValue === "object" ? "json" : typeof rawValue,
          groupKey,
          label,
          description: `Configured via Atelier CMS for ${field}`,
          isSecret: false,
        },
      });
    }
  }

  try {
    revalidatePath("/", "layout");
    revalidatePath("/[market]", "layout");
  } catch {
    // ignore outside request cycle
  }
}
