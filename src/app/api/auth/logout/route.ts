import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const CUSTOMER_SESSION_COOKIE = "md_customer_session";

export async function POST() {
  const cookieStore = await cookies();
  cookieStore.delete(CUSTOMER_SESSION_COOKIE);
  return NextResponse.json({ ok: true });
}
