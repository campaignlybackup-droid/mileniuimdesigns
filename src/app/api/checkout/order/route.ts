import { NextRequest, NextResponse } from "next/server";
import { getOrderByNumberOrId } from "@/lib/orders";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const orderNumber = searchParams.get("order");

    if (!orderNumber) {
      return NextResponse.json({ error: "Order number is required" }, { status: 400 });
    }

    const order = await getOrderByNumberOrId(orderNumber);
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    return NextResponse.json({ order });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load order";
    console.error("Order lookup error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
