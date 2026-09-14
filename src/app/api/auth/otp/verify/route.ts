import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyAndLoginCustomer } from "@/lib/customers";
import { env } from "@/lib/config/env";

const CUSTOMER_SESSION_COOKIE = "md_customer_session";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { identifier, code, marketCode = "US" } = body;

    if (!identifier || !code) {
      return NextResponse.json({ error: "Identifier and code are required" }, { status: 400 });
    }

    const result = await verifyAndLoginCustomer(identifier, code, marketCode);

    if (!result.ok) {
      const reasonMap: Record<string, string> = {
        not_found: "Invalid or expired verification code.",
        expired: "Verification code has expired. Please request a new one.",
        consumed: "Verification code has already been used.",
        too_many_attempts: "Too many failed attempts. Please request a new code.",
        mismatch: "Incorrect verification code.",
      };
      return NextResponse.json(
        { error: reasonMap[result.reason] ?? "Verification failed" },
        { status: 400 },
      );
    }

    const cookieStore = await cookies();
    cookieStore.set(CUSTOMER_SESSION_COOKIE, result.token, {
      httpOnly: true,
      secure: env().APP_ENV === "production",
      sameSite: "lax",
      expires: result.expiresAt,
      path: "/",
    });

    return NextResponse.json({ ok: true, customer: result.customer });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to verify code";
    console.error("OTP verify error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
