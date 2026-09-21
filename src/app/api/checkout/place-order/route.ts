import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createOrderFromCart } from "@/lib/orders";

const CART_COOKIE_NAME = "md_cart_token";

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const cartToken = cookieStore.get(CART_COOKIE_NAME)?.value;

    if (!cartToken) {
      return NextResponse.json({ error: "No active shopping bag found" }, { status: 400 });
    }

    const body = await request.json();
    const { customer, shippingAddress, billingAddress, paymentMethod = "bank_transfer", paymentReference } = body;

    if (!customer?.email || !customer?.name) {
      return NextResponse.json({ error: "Customer name and email are required" }, { status: 400 });
    }

    if (!shippingAddress?.line1 || !shippingAddress?.city || !shippingAddress?.postalCode) {
      return NextResponse.json({ error: "Complete shipping address is required" }, { status: 400 });
    }

    const order = await createOrderFromCart({
      cartToken,
      customer,
      shippingAddress,
      billingAddress,
      paymentMethod,
      paymentReference,
    });

    // Clear cart token cookie since order has converted
    cookieStore.delete(CART_COOKIE_NAME);

    return NextResponse.json({ ok: true, order });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to place order";
    console.error("Place Order error:", error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
