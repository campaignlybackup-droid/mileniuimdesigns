import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { resolveCustomerSession } from "@/lib/auth/session";
import { getCustomerProfile } from "@/lib/customers";

const CUSTOMER_SESSION_COOKIE = "md_customer_session";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(CUSTOMER_SESSION_COOKIE)?.value;

    if (!token) {
      return NextResponse.json({ authenticated: false, customer: null });
    }

    const session = await resolveCustomerSession(token);
    if (!session) {
      return NextResponse.json({ authenticated: false, customer: null });
    }

    const profile = await getCustomerProfile(session.customerId);
    if (!profile) {
      return NextResponse.json({ authenticated: false, customer: null });
    }

    return NextResponse.json({ authenticated: true, customer: profile });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load profile";
    console.error("Customer me error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
