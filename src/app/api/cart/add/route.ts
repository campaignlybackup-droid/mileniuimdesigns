import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { addItem, createCart } from "@/lib/cart";
import { enrichCart } from "@/lib/cart/enrich";
import { env } from "@/lib/config/env";

const CART_COOKIE_NAME = "md_cart_token";

export async function POST(request: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const variantId = typeof body.variantId === "string" ? body.variantId : "";
  const productId = typeof body.productId === "string" ? body.productId : "";
  const quantity = Number(body.quantity) || 1;
  const marketCode = typeof body.marketCode === "string" ? body.marketCode : "US";

  if (!variantId) {
    return NextResponse.json({ error: "variantId is required" }, { status: 400 });
  }

  try {
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
      quantity,
    });

    const enriched = await enrichCart(updatedCart);
    return NextResponse.json({ ok: true, cart: enriched });
  } catch (error: unknown) {
    console.error("Database cart error, activating standalone cart:", error);
    try {
      const {
        readStandaloneCartCookie,
        serializeStandaloneCart,
        formatStandaloneEnrichedCart,
      } = await import("@/lib/cart/standalone-cart");

      const cookieStore = await cookies();
      const raw = cookieStore.get("md_standalone_cart")?.value;

      let state = readStandaloneCartCookie(raw) ?? {
        id: `cart-${Date.now()}`,
        marketCode,
        currencyCode: marketCode.toUpperCase() === "IN" ? "INR" : "USD",
        items: [],
      };

      const existing = state.items.find((it) => it.variantId === variantId);
      if (existing) {
        existing.quantity += quantity;
      } else {
        state.items.push({
          lineId: `line-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          variantId,
          productId: productId || variantId,
          quantity,
        });
      }

      cookieStore.set("md_standalone_cart", serializeStandaloneCart(state), {
        httpOnly: false,
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 30,
        path: "/",
      });

      const enriched = formatStandaloneEnrichedCart(state);
      return NextResponse.json({ ok: true, cart: enriched });
    } catch (standaloneErr) {
      console.error("Standalone cart error:", standaloneErr);
      return NextResponse.json({ error: "Failed to add item to bag" }, { status: 400 });
    }
  }
}
