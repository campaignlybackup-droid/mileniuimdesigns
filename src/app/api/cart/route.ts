import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCart, createCart } from "@/lib/cart";
import { enrichCart } from "@/lib/cart/enrich";
import { env } from "@/lib/config/env";

const CART_COOKIE_NAME = "md_cart_token";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(CART_COOKIE_NAME)?.value;

    if (!token) {
      return NextResponse.json({ cart: null });
    }

    const cart = await getCart(token);
    const enriched = await enrichCart(cart);
    return NextResponse.json({ cart: enriched });
  } catch (error) {
    console.error("Cart GET error:", error);
    return NextResponse.json({ error: "Failed to load cart" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const marketCode = body.marketCode || "US";

    const { token, cartId } = await createCart(marketCode);
    const cookieStore = await cookies();
    cookieStore.set(CART_COOKIE_NAME, token, {
      httpOnly: true,
      secure: env().APP_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 90, // 90 days
      path: "/",
    });

    const cart = await getCart(token);
    const enriched = await enrichCart(cart);
    return NextResponse.json({ cart: enriched, cartId });
  } catch (error) {
    console.error("Cart POST error:", error);
    return NextResponse.json({ error: "Failed to create cart" }, { status: 500 });
  }
}
