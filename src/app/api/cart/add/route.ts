import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { addItem, createCart } from "@/lib/cart";
import { enrichCart } from "@/lib/cart/enrich";
import { env } from "@/lib/config/env";

const CART_COOKIE_NAME = "md_cart_token";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { variantId, quantity = 1, marketCode = "US" } = body;

    if (!variantId) {
      return NextResponse.json({ error: "variantId is required" }, { status: 400 });
    }

    const cookieStore = await cookies();
    let token = cookieStore.get(CART_COOKIE_NAME)?.value;

    if (!token) {
      const created = await createCart(marketCode);
      token = created.token;
      cookieStore.set(CART_COOKIE_NAME, token, {
        httpOnly: true,
        secure: env().APP_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 90,
        path: "/",
      });
    }

    const updatedCart = await addItem(token, {
      variantId,
      quantity: Number(quantity) || 1,
    });

    const enriched = await enrichCart(updatedCart);
    return NextResponse.json({ ok: true, cart: enriched });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to add item to cart";
    console.error("Cart Add error:", error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
