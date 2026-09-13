import { NextResponse } from "next/server";
import { assertCronRequest } from "@/lib/security/cron";
import { toWireError } from "@/lib/errors";
import { releaseExpired } from "@/lib/inventory";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Release expired reservations — 05 §1.6. Every five minutes.
 *
 * A shopper who abandons a checkout holds a one-of-a-kind piece for
 * `RESERVATION_TTL_MINUTES`. Nothing happens synchronously when they close the tab, so this
 * is what puts the piece back on sale — and until it runs, that piece is unbuyable by anyone
 * else. Five minutes is the ceiling on how long a lapsed hold blocks a real sale.
 *
 * Releasing is idempotent by guard, so an overlapping invocation cannot decrement a counter
 * twice — which is exactly how phantom-available stock would be created.
 */
export async function GET(req: Request): Promise<Response> {
  try {
    assertCronRequest(req);
  } catch (e) {
    const w = toWireError(e);
    return NextResponse.json({ error: w.code }, { status: w.httpStatus });
  }

  const { released } = await releaseExpired(new Date());
  return NextResponse.json({ ok: true, released });
}
