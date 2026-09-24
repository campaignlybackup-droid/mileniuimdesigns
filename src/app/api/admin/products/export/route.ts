import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { requireStaffSession } from "@/lib/auth/actor";

export async function GET() {
  try {
    await requireStaffSession();

    const products = await db.product.findMany({
      where: { deletedAt: null },
      include: {
        primaryCategory: { select: { slug: true, name: true } },
        variants: {
          take: 1,
          include: {
            prices: {
              where: { validTo: null, deletedAt: null },
            },
            inventoryItems: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    const headers = ["sku", "title", "category", "inr_price", "usd_price", "stock", "subtitle", "description"];
    const rows = products.map((p) => {
      const v = p.variants[0];
      const inrRow = v?.prices.find((pr) => pr.currencyCode === "INR");
      const usdRow = v?.prices.find((pr) => pr.currencyCode === "USD");
      const inr = inrRow ? (Number(inrRow.listMinor) / 100).toFixed(0) : "0";
      const usd = usdRow ? (Number(usdRow.listMinor) / 100).toFixed(0) : "0";
      const stock = v?.inventoryItems.reduce((acc, i) => acc + i.onHandQuantity, 0) ?? 0;

      let desc = "";
      if (p.descriptionJson && typeof p.descriptionJson === "object") {
        try {
          const json = p.descriptionJson as Record<string, unknown>;
          const content = (json.content as Array<{ content?: Array<{ text?: string }> }>) || [];
          desc = content
            .map((c) => c.content?.map((t) => t.text).join("") || "")
            .join(" ");
        } catch {
          desc = "";
        }
      }

      const escape = (str: string | null | undefined) =>
        `"${(str ?? "").replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;

      return [
        escape(v?.sku || ""),
        escape(p.title),
        escape(p.primaryCategory?.slug || "general"),
        inr,
        usd,
        stock,
        escape(p.subtitle),
        escape(desc),
      ].join(",");
    });

    const csvContent = [headers.join(","), ...rows].join("\n");
    const dateStr = new Date().toISOString().slice(0, 10);

    return new NextResponse(csvContent, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="millennium-catalogue-${dateStr}.csv"`,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to export catalogue.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
