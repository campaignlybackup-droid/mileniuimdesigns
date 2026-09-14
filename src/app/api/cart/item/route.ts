import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { updateItemQuantity, removeItem } from "@/lib/cart";
import { enrichCart } from "@/lib/cart/enrich";

const CART_COOKIE_NAME = "md_cart_token";

export async function PATCH(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(CART_COOKIE_NAME)?.value;

    if (!token) {
      return NextResponse.json({ error: "No active cart session" }, { status: 401 });
    }

    const body = await request.json();
    const { lineId, quantity } = body;

    if (!lineId || quantity === undefined) {
      return NextResponse.json({ error: "lineId and quantity are required" }, { status: 400 });
    }

    const updatedCart = await updateItemQuantity(token, lineId, Number(quantity));
    const enriched = await enrichCart(updatedCart);
    return NextResponse.json({ ok: true, cart: enriched });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update item quantity";
    console.error("Cart Update error:", error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(CART_COOKIE_NAME)?.value;

    if (!token) {
      return NextResponse.json({ error: "No active cart session" }, { status: 401 });
    }

    const body = await request.json();
    const { lineId } = body;

    if (!lineId) {
      return NextResponse.json({ error: "lineId is required" }, { status: 400 });
    }

    const updatedCart = await removeItem(token, lineId);
    const enriched = await enrichCart(updatedCart);
    return NextResponse.json({ ok: true, cart: enriched });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to remove item";
    console.error("Cart Delete error:", error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
