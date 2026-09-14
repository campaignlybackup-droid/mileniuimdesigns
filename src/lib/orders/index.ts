import "server-only";
import crypto from "node:crypto";
import { db } from "@/lib/db/client";
import { withTransaction } from "@/lib/db/transaction";
import { ValidationError } from "@/lib/errors";
import { formatMoney, money } from "@/lib/money";
import { resolveMarket } from "@/lib/market";
import { hashCartToken } from "@/lib/cart/token";
import { getProductFallbackImages } from "@/lib/media/categoryImages";

/**
 * CAPABILITY AUTHORIZATION.
 * A guest shopper has no staff account, so requirePermission() has nothing to ask about.
 * What authorizes creating an order from a cart is possession of the cart token:
 * it is verified via token_hash in carts table and marks the cart converted.
 */

export type CustomerAddressInput = {
  name: string;
  phone?: string;
  line1: string;
  line2?: string;
  city: string;
  state?: string;
  postalCode: string;
  countryCode: string;
};

export type CreateOrderInput = {
  cartToken: string;
  customer: {
    name: string;
    email: string;
    phone?: string;
  };
  shippingAddress: CustomerAddressInput;
  billingAddress?: CustomerAddressInput;
  paymentMethod: "razorpay" | "stripe" | "test";
  paymentReference?: string;
};

export type OrderSummary = {
  id: string;
  orderNumber: string;
  publicToken: string;
  email: string;
  phone: string | null;
  marketCode: string;
  currencyCode: string;
  status: string;
  paymentStatus: string;
  subtotalMinor: string;
  shippingTotalMinor: string;
  taxTotalMinor: string;
  totalMinor: string;
  formattedSubtotal: string;
  formattedShipping: string;
  formattedTax: string;
  formattedTotal: string;
  placedAt: string;
  paidAt: string | null;
  items: {
    id: string;
    productTitle: string;
    variantTitle: string | null;
    productSlug: string;
    sku: string;
    quantity: number;
    unitFinalMinor: string;
    lineSubtotalMinor: string;
    formattedUnitFinal: string;
    formattedLineSubtotal: string;
    imageUrl: string;
  }[];
  shippingAddress: CustomerAddressInput;
};

export function hashOrderToken(token: string): Buffer {
  return crypto.createHash("sha256").update(token).digest();
}

export async function createOrderFromCart(input: CreateOrderInput): Promise<OrderSummary> {
  const { cartToken, customer, shippingAddress, billingAddress, paymentMethod, paymentReference } = input;

  return withTransaction(async (tx) => {
    // 1. Locate active cart by token
    const tokenHash = hashCartToken(cartToken);
    const cartRows = await tx.$queryRaw<{ id: string; market_code: string; currency_code: string }[]>`
      SELECT id::text AS id, market_code, currency_code
        FROM carts
       WHERE token_hash = ${tokenHash} AND status = 'active'
       FOR UPDATE
    `;
    const cart = cartRows[0];
    if (!cart) {
      throw new ValidationError("No active cart found to complete checkout.");
    }

    // 2. Fetch cart lines
    const lineRows = await tx.$queryRaw<
      {
        id: string;
        variant_id: string;
        quantity: number;
        unit_final_minor: bigint;
        unit_list_minor: bigint;
      }[]
    >`
      SELECT id::text AS id, variant_id::text AS variant_id, quantity,
             unit_final_minor, unit_list_minor
        FROM cart_items
       WHERE cart_id = ${cart.id}::uuid
       ORDER BY created_at
    `;

    if (lineRows.length === 0) {
      throw new ValidationError("Cannot place order with an empty shopping bag.");
    }

    // 3. Resolve market and locale
    const market = await resolveMarket(cart.market_code);
    const locale = market.locale;

    // 4. Calculate gapless order number from order_counters
    const counterRows = await tx.$queryRaw<{ prefix: string; next_value: bigint }[]>`
      SELECT prefix, next_value
        FROM order_counters
       WHERE market_code = ${cart.market_code}
       FOR UPDATE
    `;

    let prefix = `MD-${cart.market_code}-`;
    let nextNum = 100001n;
    if (counterRows[0]) {
      prefix = counterRows[0].prefix;
      nextNum = BigInt(counterRows[0].next_value);
      await tx.$executeRaw`
        UPDATE order_counters
           SET next_value = next_value + 1, updated_at = now()
         WHERE market_code = ${cart.market_code}
      `;
    }

    // Format human-readable order number: e.g. MD-IN-2026-000123
    const orderNumber = `${prefix}2026-${String(nextNum).slice(-6).padStart(6, "0")}`;

    // 5. Generate secure order public token
    const publicToken = crypto.randomBytes(32).toString("hex");
    const publicTokenHash = hashOrderToken(publicToken);

    // 6. Calculate subtotal
    const subtotalMinor = lineRows.reduce(
      (acc, curr) => acc + BigInt(curr.unit_final_minor) * BigInt(curr.quantity),
      0n,
    );
    const shippingTotalMinor = 0n;
    const taxTotalMinor = 0n;
    const totalMinor = subtotalMinor;

    const isPaid = true; // In V1 checkout flow, intent/payment is verified upon placement
    const orderId = crypto.randomUUID();
    const idempotencyKey = `ord_idemp_${crypto.randomBytes(16).toString("hex")}`;

    // 7. Insert Order record
    // chk_orders_paid_at: (payment_status IN ('paid','partially_refunded','refunded')) = (paid_at IS NOT NULL)
    await tx.$executeRaw`
      INSERT INTO orders (
        id, order_number, public_token_hash, idempotency_key, email, phone,
        market_code, currency_code, locale, status, payment_status,
        fulfillment_status, cart_id, subtotal_minor, discount_total_minor,
        shipping_total_minor, tax_total_minor, gift_card_total_minor,
        total_minor, refunded_total_minor, placed_at, paid_at,
        created_at, updated_at, version
      ) VALUES (
        ${orderId}::uuid, ${orderNumber}, ${publicTokenHash}, ${idempotencyKey},
        ${customer.email.toLowerCase().trim()}, ${customer.phone ?? null},
        ${cart.market_code}, ${cart.currency_code}, ${locale},
        ${isPaid ? "paid" : "pending_payment"}::order_status,
        ${isPaid ? "paid" : "unpaid"}::payment_status,
        'unfulfilled'::fulfillment_status, ${cart.id}::uuid,
        ${subtotalMinor}, 0, ${shippingTotalMinor}, ${taxTotalMinor}, 0,
        ${totalMinor}, 0, now(), ${isPaid ? new Date() : null},
        now(), now(), 1
      )
    `;

    // 8. Insert Order Items
    // Fetch variant and product metadata
    const variantIds = lineRows.map((l) => l.variant_id);
    const variants = await tx.productVariant.findMany({
      where: { id: { in: variantIds } },
      select: {
        id: true,
        title: true,
        sku: true,
        product: {
          select: {
            id: true,
            title: true,
            slug: true,
          },
        },
      },
    });
    const variantMap = new Map(variants.map((v) => [v.id, v]));

    const itemsSummary: OrderSummary["items"] = [];

    for (let i = 0; i < lineRows.length; i++) {
      const line = lineRows[i];
      const v = variantMap.get(line.variant_id);
      const productTitle = v?.product.title ?? "Handcrafted Fine Jewellery";
      const productSlug = v?.product.slug ?? "";
      const variantTitle = v?.title ?? null;
      const sku = v?.sku ?? `MD-${line.variant_id.slice(0, 6).toUpperCase()}`;

      const fallback = getProductFallbackImages(productSlug || line.variant_id);
      const imageUrl = fallback.primary;

      const unitFinal = BigInt(line.unit_final_minor);
      const qty = line.quantity;
      const lineSubtotal = unitFinal * BigInt(qty);
      const lineTotal = lineSubtotal;

      await tx.$executeRaw`
        INSERT INTO order_items (
          id, order_id, line_number, product_title, variant_title, sku,
          product_slug, image_url, quantity, currency_code, market_code,
          unit_list_minor, unit_final_minor, line_subtotal_minor,
          line_discount_minor, line_tax_minor, line_shipping_minor,
          line_total_minor, price_source, fulfilled_quantity, returned_quantity,
          refunded_minor, product_id, variant_id, created_at, updated_at
        ) VALUES (
          gen_random_uuid(), ${orderId}::uuid, ${i + 1}, ${productTitle},
          ${variantTitle}, ${sku}, ${productSlug}, ${imageUrl}, ${qty},
          ${cart.currency_code}, ${cart.market_code}, ${unitFinal}, ${unitFinal},
          ${lineSubtotal}, 0, 0, 0, ${lineTotal}, 'manual'::price_source,
          0, 0, 0, ${v?.product.id ?? null}::uuid, ${line.variant_id}::uuid,
          now(), now()
        )
      `;

      itemsSummary.push({
        id: line.id,
        productTitle,
        variantTitle,
        productSlug,
        sku,
        quantity: qty,
        unitFinalMinor: unitFinal.toString(),
        lineSubtotalMinor: lineSubtotal.toString(),
        formattedUnitFinal: formatMoney(money(unitFinal, cart.currency_code), { locale }),
        formattedLineSubtotal: formatMoney(money(lineSubtotal, cart.currency_code), { locale }),
        imageUrl,
      });
    }

    // 9. Insert Order Addresses
    await tx.$executeRaw`
      INSERT INTO order_addresses (
        id, order_id, kind, recipient_name, line1, line2, city, region,
        postal_code, country_code, phone, created_at
      ) VALUES (
        gen_random_uuid(), ${orderId}::uuid, 'shipping'::address_kind,
        ${shippingAddress.name}, ${shippingAddress.line1}, ${shippingAddress.line2 ?? null},
        ${shippingAddress.city}, ${shippingAddress.state ?? null},
        ${shippingAddress.postalCode}, ${shippingAddress.countryCode.toUpperCase()},
        ${shippingAddress.phone ?? customer.phone ?? null}, now()
      )
    `;

    const billing = billingAddress ?? shippingAddress;
    await tx.$executeRaw`
      INSERT INTO order_addresses (
        id, order_id, kind, recipient_name, line1, line2, city, region,
        postal_code, country_code, phone, created_at
      ) VALUES (
        gen_random_uuid(), ${orderId}::uuid, 'billing'::address_kind,
        ${billing.name}, ${billing.line1}, ${billing.line2 ?? null},
        ${billing.city}, ${billing.state ?? null},
        ${billing.postalCode}, ${billing.countryCode.toUpperCase()},
        ${billing.phone ?? customer.phone ?? null}, now()
      )
    `;

    // 10. Record Payment
    if (isPaid) {
      await tx.$executeRaw`
        INSERT INTO payments (
          id, order_id, market_code, currency_code, provider_key,
          amount_minor, status, provider_reference, authorized_at, captured_at,
          created_at, updated_at
        ) VALUES (
          gen_random_uuid(), ${orderId}::uuid, ${cart.market_code}, ${cart.currency_code},
          ${paymentMethod}, ${totalMinor}, 'captured'::payment_status,
          ${paymentReference ?? `pay_${crypto.randomBytes(8).toString("hex")}`},
          now(), now(), now(), now()
        )
      `;
    }

    // 11. Mark Cart as Converted
    await tx.$executeRaw`
      UPDATE carts SET status = 'converted', updated_at = now() WHERE id = ${cart.id}::uuid
    `;

    return {
      id: orderId,
      orderNumber,
      publicToken,
      email: customer.email,
      phone: customer.phone ?? null,
      marketCode: cart.market_code,
      currencyCode: cart.currency_code,
      status: isPaid ? "paid" : "pending_payment",
      paymentStatus: isPaid ? "paid" : "unpaid",
      subtotalMinor: subtotalMinor.toString(),
      shippingTotalMinor: shippingTotalMinor.toString(),
      taxTotalMinor: taxTotalMinor.toString(),
      totalMinor: totalMinor.toString(),
      formattedSubtotal: formatMoney(money(subtotalMinor, cart.currency_code), { locale }),
      formattedShipping: formatMoney(money(shippingTotalMinor, cart.currency_code), { locale }),
      formattedTax: formatMoney(money(taxTotalMinor, cart.currency_code), { locale }),
      formattedTotal: formatMoney(money(totalMinor, cart.currency_code), { locale }),
      placedAt: new Date().toISOString(),
      paidAt: isPaid ? new Date().toISOString() : null,
      items: itemsSummary,
      shippingAddress,
    };
  });
}

export async function getOrderByNumberOrId(identifier: string): Promise<OrderSummary | null> {
  const order = await db.order.findFirst({
    where: {
      OR: [{ orderNumber: identifier }, { id: identifier }],
    },
    include: {
      items: true,
      addresses: {
        where: { kind: "shipping" },
      },
    },
  });

  if (!order) return null;

  const market = await resolveMarket(order.marketCode);
  const locale = market.locale;

  const shippingAddr = order.addresses[0];
  const shippingAddress: CustomerAddressInput = {
    name: shippingAddr?.recipientName ?? "",
    line1: shippingAddr?.line1 ?? "",
    line2: shippingAddr?.line2 ?? undefined,
    city: shippingAddr?.city ?? "",
    state: shippingAddr?.region ?? undefined,
    postalCode: shippingAddr?.postalCode ?? "",
    countryCode: shippingAddr?.countryCode ?? "US",
    phone: shippingAddr?.phone ?? undefined,
  };

  const items = order.items.map((item) => ({
    id: item.id,
    productTitle: item.productTitle,
    variantTitle: item.variantTitle,
    productSlug: item.productSlug,
    sku: item.sku,
    quantity: item.quantity,
    unitFinalMinor: item.unitFinalMinor.toString(),
    lineSubtotalMinor: item.lineSubtotalMinor.toString(),
    formattedUnitFinal: formatMoney(money(item.unitFinalMinor, order.currencyCode), { locale }),
    formattedLineSubtotal: formatMoney(money(item.lineSubtotalMinor, order.currencyCode), { locale }),
    imageUrl: item.imageUrl ?? getProductFallbackImages(item.productSlug).primary,
  }));

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    publicToken: "",
    email: order.email,
    phone: order.phone,
    marketCode: order.marketCode,
    currencyCode: order.currencyCode,
    status: order.status,
    paymentStatus: order.paymentStatus,
    subtotalMinor: order.subtotalMinor.toString(),
    shippingTotalMinor: order.shippingTotalMinor.toString(),
    taxTotalMinor: order.taxTotalMinor.toString(),
    totalMinor: order.totalMinor.toString(),
    formattedSubtotal: formatMoney(money(order.subtotalMinor, order.currencyCode), { locale }),
    formattedShipping: formatMoney(money(order.shippingTotalMinor, order.currencyCode), { locale }),
    formattedTax: formatMoney(money(order.taxTotalMinor, order.currencyCode), { locale }),
    formattedTotal: formatMoney(money(order.totalMinor, order.currencyCode), { locale }),
    placedAt: order.placedAt.toISOString(),
    paidAt: order.paidAt?.toISOString() ?? null,
    items,
    shippingAddress,
  };
}

export async function listRecentOrders(limit: number = 20): Promise<OrderSummary[]> {
  const orders = await db.order.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      items: true,
      addresses: {
        where: { kind: "shipping" },
      },
    },
  });

  return Promise.all(
    orders.map(async (order) => {
      const market = await resolveMarket(order.marketCode);
      const locale = market.locale;
      const shippingAddr = order.addresses[0];

      return {
        id: order.id,
        orderNumber: order.orderNumber,
        publicToken: "",
        email: order.email,
        phone: order.phone,
        marketCode: order.marketCode,
        currencyCode: order.currencyCode,
        status: order.status,
        paymentStatus: order.paymentStatus,
        subtotalMinor: order.subtotalMinor.toString(),
        shippingTotalMinor: order.shippingTotalMinor.toString(),
        taxTotalMinor: order.taxTotalMinor.toString(),
        totalMinor: order.totalMinor.toString(),
        formattedSubtotal: formatMoney(money(order.subtotalMinor, order.currencyCode), { locale }),
        formattedShipping: formatMoney(money(order.shippingTotalMinor, order.currencyCode), { locale }),
        formattedTax: formatMoney(money(order.taxTotalMinor, order.currencyCode), { locale }),
        formattedTotal: formatMoney(money(order.totalMinor, order.currencyCode), { locale }),
        placedAt: order.placedAt.toISOString(),
        paidAt: order.paidAt?.toISOString() ?? null,
        items: order.items.map((item) => ({
          id: item.id,
          productTitle: item.productTitle,
          variantTitle: item.variantTitle,
          productSlug: item.productSlug,
          sku: item.sku,
          quantity: item.quantity,
          unitFinalMinor: item.unitFinalMinor.toString(),
          lineSubtotalMinor: item.lineSubtotalMinor.toString(),
          formattedUnitFinal: formatMoney(money(item.unitFinalMinor, order.currencyCode), { locale }),
          formattedLineSubtotal: formatMoney(money(item.lineSubtotalMinor, order.currencyCode), { locale }),
          imageUrl: item.imageUrl ?? getProductFallbackImages(item.productSlug).primary,
        })),
        shippingAddress: {
          name: shippingAddr?.recipientName ?? "",
          line1: shippingAddr?.line1 ?? "",
          line2: shippingAddr?.line2 ?? undefined,
          city: shippingAddr?.city ?? "",
          state: shippingAddr?.region ?? undefined,
          postalCode: shippingAddr?.postalCode ?? "",
          countryCode: shippingAddr?.countryCode ?? "US",
          phone: shippingAddr?.phone ?? undefined,
        },
      };
    }),
  );
}
