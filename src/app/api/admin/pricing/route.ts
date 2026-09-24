import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { requireStaffSession } from "@/lib/auth/actor";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const actor = await requireStaffSession();
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [rateInrSetting, rateUsdSetting, lastUpdatedSetting, totalProducts, categories, recentAudit] =
      await Promise.all([
        db.setting.findFirst({ where: { key: "pricing.dailySilverRateInr" } }),
        db.setting.findFirst({ where: { key: "pricing.dailySilverRateUsd" } }),
        db.setting.findFirst({ where: { key: "pricing.lastSilverUpdateAt" } }),
        db.product.count({ where: { deletedAt: null } }),
        db.category.findMany({
          where: { isPublished: true, deletedAt: null },
          select: { id: true, name: true, slug: true },
          orderBy: { name: "asc" },
        }),
        db.auditLog.findMany({
          where: { action: { startsWith: "pricing." } },
          orderBy: { createdAt: "desc" },
          take: 5,
          select: {
            id: true,
            summary: true,
            createdAt: true,
            after: true,
          },
        }),
      ]);

    const silverRateInr = rateInrSetting?.value ? Number(rateInrSetting.value) : 98.5;
    const silverRateUsd = rateUsdSetting?.value ? Number(rateUsdSetting.value) : 1.15;
    const lastUpdatedAt = lastUpdatedSetting?.value ? String(lastUpdatedSetting.value) : null;

    return NextResponse.json({
      ok: true,
      silverRateInr,
      silverRateUsd,
      lastUpdatedAt,
      totalProducts,
      categories,
      recentAudit,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to load pricing data";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

function calculateNewPrice(
  currentMinor: bigint,
  marketCode: string,
  mode: "silver_rate" | "percentage" | "fixed",
  options: {
    percentChange?: number;
    fixedAmount?: number;
    newSilverRateInr?: number;
    currentSilverRateInr?: number;
    rounding?: string;
  },
): bigint {
  const currentNum = Number(currentMinor);
  let computed = currentNum;

  if (mode === "silver_rate") {
    const currentRate = options.currentSilverRateInr || 98.5;
    const newRate = options.newSilverRateInr || currentRate;
    const ratio = newRate / currentRate;
    computed = Math.round(currentNum * ratio);
  } else if (mode === "percentage") {
    const pct = options.percentChange || 0;
    computed = Math.round(currentNum * (1 + pct / 100));
  } else if (mode === "fixed") {
    // INR uses paise (100 paise = ₹1), USD uses cents (100 cents = $1)
    const fixedUnit = options.fixedAmount || 0;
    const fixedDeltaPaise = fixedUnit * 100;
    computed = Math.max(0, currentNum + fixedDeltaPaise);
  }

  // Apply rounding
  if (options.rounding === "nearest_10") {
    computed = Math.round(computed / 1000) * 1000;
  } else if (options.rounding === "nearest_50") {
    computed = Math.round(computed / 5000) * 5000;
  } else if (options.rounding === "nearest_100") {
    computed = Math.round(computed / 10000) * 10000;
  } else if (options.rounding === "charm_99") {
    // Ends in .99 or ₹99 (e.g. ₹4,999)
    const major = Math.floor(computed / 100);
    computed = (Math.floor(major / 10) * 10 + 9) * 100;
  }

  return BigInt(Math.max(100, Math.round(computed)));
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireStaffSession();
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized staff access." }, { status: 401 });
    }

    const body = await request.json();
    const {
      action = "preview",
      mode = "silver_rate",
      marketCode = "ALL", // "ALL" | "IN" | "US"
      categoryId = "ALL",
      percentChange = 0,
      fixedAmount = 0,
      newSilverRateInr = 98.5,
      currentSilverRateInr = 98.5,
      rounding = "none",
    } = body;

    // Filter matching price rows
    const wherePrice: {
      marketCode?: string;
      product: {
        deletedAt: null;
        primaryCategoryId?: string;
      };
    } = {
      product: {
        deletedAt: null,
        ...(categoryId !== "ALL" ? { primaryCategoryId: categoryId } : {}),
      },
      ...(marketCode !== "ALL" ? { marketCode } : {}),
    };

    if (action === "preview") {
      const matchingCount = await db.price.count({ where: wherePrice });

      // Fetch 8 sample prices for realistic live preview
      const samplePrices = await db.price.findMany({
        where: wherePrice,
        take: 8,
        include: {
          product: {
            select: { id: true, title: true, slug: true, primaryCategory: { select: { name: true } } },
          },
          variant: {
            select: { sku: true },
          },
        },
      });

      const sampleItems = samplePrices.map((p) => {
        const newMinor = calculateNewPrice(p.listMinor, p.marketCode, mode, {
          percentChange,
          fixedAmount,
          newSilverRateInr,
          currentSilverRateInr,
          rounding,
        });

        const currentNum = Number(p.listMinor) / 100;
        const newNum = Number(newMinor) / 100;
        const diffNum = newNum - currentNum;
        const diffPercent = currentNum > 0 ? ((diffNum / currentNum) * 100).toFixed(1) : "0.0";

        return {
          id: p.id,
          title: p.product.title,
          sku: p.variant?.sku || "N/A",
          category: p.product.primaryCategory?.name || "Jewellery",
          marketCode: p.marketCode,
          currency: p.currencyCode,
          currentPrice: currentNum,
          newPrice: newNum,
          diff: diffNum,
          diffPercent,
        };
      });

      return NextResponse.json({
        ok: true,
        totalAffected: matchingCount,
        sampleItems,
      });
    }

    if (action === "apply") {
      // Execute the bulk price modification in a transaction
      const pricesToUpdate = await db.price.findMany({
        where: wherePrice,
        select: { id: true, listMinor: true, marketCode: true, productId: true },
      });

      let updatedCount = 0;

      await db.$transaction(
        async (tx) => {
          for (const p of pricesToUpdate) {
            const nextListMinor = calculateNewPrice(p.listMinor, p.marketCode, mode, {
              percentChange,
              fixedAmount,
              newSilverRateInr,
              currentSilverRateInr,
              rounding,
            });

            await tx.price.update({
              where: { id: p.id },
              data: {
                listMinor: nextListMinor,
              },
            });
            updatedCount++;
          }

          // If updating silver rate, save today's rate in settings
          if (mode === "silver_rate") {
            const now = new Date().toISOString();
            const existingRate = await tx.setting.findFirst({
              where: { key: "pricing.dailySilverRateInr", marketCode: null },
            });
            if (existingRate) {
              await tx.setting.update({
                where: { id: existingRate.id },
                data: { value: Number(newSilverRateInr), updatedAt: new Date() },
              });
            } else {
              await tx.setting.create({
                data: {
                  key: "pricing.dailySilverRateInr",
                  value: Number(newSilverRateInr),
                  valueType: "number",
                  groupKey: "pricing",
                  label: "Daily Silver Rate INR/g",
                },
              });
            }

            const existingDate = await tx.setting.findFirst({
              where: { key: "pricing.lastSilverUpdateAt", marketCode: null },
            });
            if (existingDate) {
              await tx.setting.update({
                where: { id: existingDate.id },
                data: { value: now, updatedAt: new Date() },
              });
            } else {
              await tx.setting.create({
                data: {
                  key: "pricing.lastSilverUpdateAt",
                  value: now,
                  valueType: "string",
                  groupKey: "pricing",
                  label: "Last Silver Rate Update",
                },
              });
            }
          }

          // Record audit log
          await tx.auditLog.create({
            data: {
              actorType: "staff",
              actorUserId: actor.userId,
              entity: "prices",
              entityId: actor.userId,
              action: "pricing.bulk_update",
              summary:
                mode === "silver_rate"
                  ? `Daily silver price adjusted to ₹${newSilverRateInr}/g across ${updatedCount} products`
                  : `Bulk price adjustment (${percentChange > 0 ? "+" : ""}${percentChange}%) applied to ${updatedCount} products`,
              after: {
                mode,
                marketCode,
                categoryId,
                percentChange,
                newSilverRateInr,
                updatedCount,
              },
            },
          });
        },
        { timeout: 60000 },
      );

      // Revalidate Next.js cache so visitors immediately see new prices
      try {
        revalidatePath("/", "layout");
      } catch {
        // Cache revalidation ignored if running in background
      }

      return NextResponse.json({
        ok: true,
        updatedCount,
        message: `Successfully updated prices for ${updatedCount} items across the store.`,
      });
    }

    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Price update failed.";
    console.error("[BULK PRICE UPDATE ERROR]:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
