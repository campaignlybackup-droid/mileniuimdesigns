import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db/client";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { cookieName } from "@/lib/config/constants";
import { env } from "@/lib/config/env";
import { withTransaction } from "@/lib/db/transaction";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required." },
        { status: 400 },
      );
    }

    const cleanEmail = String(email).trim().toLowerCase();

    // Query staff user with roles
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
        { error: "Invalid credentials or unauthorized account." },
        { status: 401 },
      );
    }

    const passwordValid = await verifyPassword(user.passwordHash, String(password));
    if (!passwordValid) {
      return NextResponse.json(
        { error: "Invalid email or password." },
        { status: 401 },
      );
    }

    // Extract single IP address safe for postgres inet
    const rawIp =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip")?.trim() ||
      null;

    // Mint staff session with full administrative privileges
    const sessionResult = await withTransaction(async (tx) => {
      const created = await createSession(tx, {
        userId: user.id,
        totpVerifiedAt: new Date(),
        ipAddress: rawIp,
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
          summary: `Staff admin signed in (${cleanEmail})`,
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
    const msg = error instanceof Error ? error.message : "Authentication failed.";
    console.error("[STAFF LOGIN ERROR]:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
