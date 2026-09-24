import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db/client";
import { hashToken } from "@/lib/auth/tokens";
import { cookieName } from "@/lib/config/constants";
import { env } from "@/lib/config/env";

export async function POST() {
  try {
    const cookieJar = await cookies();
    const appEnvironment = env().APP_ENV;
    const cookieKey = cookieName("adminSession", appEnvironment);
    const token = cookieJar.get(cookieKey)?.value || cookieJar.get("md_admin")?.value;

    if (token) {
      const tokenHash = hashToken(token);
      await db.session
        .updateMany({
          where: { tokenHash, revokedAt: null },
          data: { revokedAt: new Date() },
        })
        .catch(() => undefined);
    }

    // Clear cookies
    cookieJar.set(cookieKey, "", {
      httpOnly: true,
      secure: appEnvironment === "production",
      sameSite: "lax",
      maxAge: 0,
      path: "/",
    });

    if (cookieKey !== "md_admin") {
      cookieJar.set("md_admin", "", {
        httpOnly: true,
        maxAge: 0,
        path: "/",
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Logout failed.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
