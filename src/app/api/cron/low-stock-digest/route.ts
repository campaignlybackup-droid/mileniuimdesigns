import { NextResponse } from "next/server";
import { assertCronRequest } from "@/lib/security/cron";
import { toWireError } from "@/lib/errors";
import { lowStockItems, LOW_STOCK_THRESHOLD } from "@/lib/inventory";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The low-stock digest — 09 P19.
 *
 * A one-of-a-kind piece at zero is SOLD, not low, and is excluded: listing it every night
 * trains whoever reads the digest to skim past the section, which is how a genuinely
 * low-stock line gets missed.
 *
 * The email itself is P22's; this computes the set and returns it, so the cron is exercisable
 * and the query is under test before there is a template to send it through.
 */
export async function GET(req: Request): Promise<Response> {
  try {
    assertCronRequest(req);
  } catch (e) {
    const w = toWireError(e);
    return NextResponse.json({ error: w.code }, { status: w.httpStatus });
  }

  const items = await lowStockItems(LOW_STOCK_THRESHOLD);
  return NextResponse.json({
    ok: true,
    threshold: LOW_STOCK_THRESHOLD,
    count: items.length,
    items,
  });
}
