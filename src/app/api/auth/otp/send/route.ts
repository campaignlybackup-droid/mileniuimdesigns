import { NextRequest, NextResponse } from "next/server";
import { sendCustomerOtp } from "@/lib/customers";
import { env } from "@/lib/config/env";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { identifier } = body;

    if (!identifier || typeof identifier !== "string" || identifier.trim().length < 4) {
      return NextResponse.json({ error: "A valid mobile number or email is required" }, { status: 400 });
    }

    const issued = await sendCustomerOtp(identifier);
    const isLocal = env().APP_ENV !== "production";

    return NextResponse.json({
      ok: true,
      message: "One-time verification code dispatched.",
      expiresAt: issued.expiresAt.toISOString(),
      // In local development, provide code directly for seamless testing
      devCode: isLocal ? issued.deliverable : undefined,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to generate verification code";
    console.error("OTP send error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
