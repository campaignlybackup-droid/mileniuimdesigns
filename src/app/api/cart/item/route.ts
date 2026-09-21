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

    try {
      const updatedCart = await updateItemQuantity(token, lineId, Number(quantity));
      const enriched = await enrichCart(updatedCart);
      return NextResponse.json({ ok: true, cart: enriched });
    } catch {
      // Fallback to standalone cart below
    }
  } catch (error: unknown) {
    // Check standalone
  }

  try {
    const cookieStore = await cookies();
    const raw = cookieStore.get("md_standalone_cart")?.value;
    const body = await request.clone().json().catch(() => ({}));
    const { lineId, quantity } = body;
    if (raw && lineId) {
      const { readStandaloneCartCookie, serializeStandaloneCart, formatStandaloneEnrichedCart } =
        await import("@/lib/cart/standalone-cart");
      const state = readStandaloneCartCookie(raw);
      if (state) {
        const item = state.items.find((it) => it.lineId === lineId);
        if (item) {
          item.quantity = Math.max(1, Math.min(10, Number(quantity)));
          cookieStore.set("md_standalone_cart", serializeStandaloneCart(state), {
            httpOnly: false,
            sameSite: "lax",
            maxAge: 60 * 60 * 24 * 30,
            path: "/",
          });
          return NextResponse.json({ ok: true, cart: formatStandaloneEnrichedCart(state) });
        }
      }
    }
  } catch {
    // Ignore
  }

  return NextResponse.json({ error: "Failed to update item quantity" }, { status: 400 });
}

export async function DELETE(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(CART_COOKIE_NAME)?.value;

    const body = await request.json().catch(() => ({}));
    const { lineId } = body;

    if (!lineId) {
      return NextResponse.json({ error: "lineId is required" }, { status: 400 });
    }

    if (token) {
      try {
        const updatedCart = await removeItem(token, lineId);
        const enriched = await enrichCart(updatedCart);
        return NextResponse.json({ ok: true, cart: enriched });
      } catch {
        // Fallback to standalone cart
      }
    }

    // Standalone removal
    const raw = cookieStore.get("md_standalone_cart")?.value;
    if (raw) {
      const { readStandaloneCartCookie, serializeStandaloneCart, formatStandaloneEnrichedCart } =
        await import("@/lib/cart/standalone-cart");
      const state = readStandaloneCartCookie(raw);
      if (state) {
        state.items = state.items.filter((it) => it.lineId !== lineId);
        cookieStore.set("md_standalone_cart", serializeStandaloneCart(state), {
          httpOnly: false,
          sameSite: "lax",
          maxAge: 60 * 60 * 24 * 30,
          path: "/",
        });
        return NextResponse.json({ ok: true, cart: formatStandaloneEnrichedCart(state) });
      }
    }
    return NextResponse.json({ ok: true, cart: null });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to remove item";
    console.error("Cart Delete error:", error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
