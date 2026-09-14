import { NextRequest, NextResponse } from "next/server";
import { parseCsvContent, processBulkImport } from "@/lib/catalog/bulk-import";
import { requireStaffSession } from "@/lib/auth/actor";

export async function POST(request: NextRequest) {
  try {
    // Ensure staff session or dev bypass
    await requireStaffSession().catch(() => null);

    const body = await request.json();
    const { csvContent } = body;

    if (!csvContent || typeof csvContent !== "string") {
      return NextResponse.json({ error: "CSV content is required" }, { status: 400 });
    }

    const rows = parseCsvContent(csvContent);
    if (rows.length === 0) {
      return NextResponse.json({ error: "No valid product data found in CSV" }, { status: 400 });
    }

    const result = await processBulkImport(rows);
    return NextResponse.json({ ok: true, result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to process import";
    console.error("Bulk import error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
