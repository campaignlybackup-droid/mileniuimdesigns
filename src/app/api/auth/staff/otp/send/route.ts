import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { withTransaction } from "@/lib/db/transaction";
import { issueOtp } from "@/lib/auth/otp";
import { sendCustomerOtpEmail } from "@/lib/email/mailer";
import { env } from "@/lib/config/env";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = body;

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json(
        { error: "A valid staff email address is required." },
        { status: 400 },
      );
    }

    const cleanEmail = email.trim().toLowerCase();

    // Verify this is a registered active staff member
    const user = await db.user.findFirst({
      where: {
        email: { equals: cleanEmail, mode: "insensitive" },
        deletedAt: null,
      },
      include: {
        roles: true,
      },
    });

    if (!user || !user.isActive || user.roles.length === 0) {
      return NextResponse.json(
        { error: "No staff admin account found for this email." },
        { status: 403 },
      );
    }

    // Issue cryptographic OTP for staff admin login
    const issued = await withTransaction(async (tx) => {
      return issueOtp(tx, {
        purpose: "admin_2fa_recovery",
        identifier: cleanEmail,
        userId: user.id,
      });
    });

    // Send code to their verified email using Gmail SMTP
    const emailResult = await sendCustomerOtpEmail({
      to: cleanEmail,
      code: issued.deliverable,
      expiresMinutes: 10,
    });

    const isLocal = env().APP_ENV !== "production";

    return NextResponse.json({
      ok: true,
      message: emailResult.sent
        ? `Verification code dispatched to ${cleanEmail} via Gmail.`
        : `Verification code generated for ${cleanEmail}.`,
      sent: emailResult.sent,
      expiresAt: issued.expiresAt.toISOString(),
      devCode: isLocal ? issued.deliverable : undefined,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to issue admin login code.";
    console.error("[STAFF OTP SEND ERROR]:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
