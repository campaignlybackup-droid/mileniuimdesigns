import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db/client";
import { verifyOtpCode } from "@/lib/auth/otp";
import { createSession } from "@/lib/auth/session";
import { cookieName } from "@/lib/config/constants";
import { env } from "@/lib/config/env";
import { withTransaction } from "@/lib/db/transaction";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, code } = body;

    if (!email || !code) {
      return NextResponse.json(
        { error: "Email and verification code are required." },
        { status: 400 },
      );
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const cleanCode = String(code).trim();

    // Verify OTP code
    const verification = await verifyOtpCode({
      purpose: "admin_2fa_recovery",
      identifier: cleanEmail,
      code: cleanCode,
    });

    if (!verification.ok) {
      const reasonMap: Record<string, string> = {
        not_found: "Invalid or expired verification code.",
        expired: "Verification code has expired. Please request a new code.",
        consumed: "Verification code has already been used.",
        too_many_attempts: "Too many failed attempts. Please request a new code.",
        mismatch: "Incorrect verification code.",
      };
      return NextResponse.json(
        { error: reasonMap[verification.reason] ?? "Verification failed." },
        { status: 400 },
      );
    }

    // Retrieve staff user
    const user = await db.user.findFirst({
      where: {
        email: { equals: cleanEmail, mode: "insensitive" },
        deletedAt: null,
      },
      include: {
        roles: {
          include: { role: true },
        },
      },
    });

    if (!user || !user.isActive || user.roles.length === 0) {
      return NextResponse.json(
        { error: "Unauthorized staff account." },
        { status: 403 },
      );
    }

    // Mint staff session
    const sessionResult = await withTransaction(async (tx) => {
      const created = await createSession(tx, {
        userId: user.id,
        totpVerifiedAt: new Date(),
        ipAddress: request.headers.get("x-forwarded-for") ?? null,
        userAgent: request.headers.get("user-agent") ?? null,
      });

      await tx.user.update({
        where: { id: user.id },
        data: {
          lastLoginAt: new Date(),
          failedLoginCount: 0,
          lockedUntil: null,
        },
      });

      await tx.auditLog.create({
        data: {
          actorType: "staff",
          actorUserId: user.id,
          entity: "sessions",
          entityId: created.sessionId,
          action: "auth.login",
          summary: `Staff admin signed in via Email OTP (${cleanEmail})`,
        },
      });

      return created;
    });

    const cookieJar = await cookies();
    const appEnvironment = env().APP_ENV;
    const cookieKey = cookieName("adminSession", appEnvironment);

    cookieJar.set(cookieKey, sessionResult.token, {
      httpOnly: true,
      secure: appEnvironment === "production",
      sameSite: "lax",
      expires: sessionResult.expiresAt,
      path: "/",
    });

    return NextResponse.json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.roles[0]?.role?.name ?? "Admin",
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Verification failed.";
    console.error("[STAFF OTP VERIFY ERROR]:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
