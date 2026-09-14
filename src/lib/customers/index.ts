import "server-only";
import { db } from "@/lib/db/client";
import { withTransaction, type Tx } from "@/lib/db/transaction";
import { resolveMarket } from "@/lib/market";
import { formatMoney, money } from "@/lib/money";
import { getProductFallbackImages } from "@/lib/media/categoryImages";
import { issueOtp, verifyOtpCode } from "@/lib/auth/otp";
import { createSession } from "@/lib/auth/session";

export type CustomerProfile = {
  id: string;
  email: string;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  defaultMarketCode: string | null;
  orders: {
    id: string;
    orderNumber: string;
    placedAt: string;
    status: string;
    paymentStatus: string;
    currencyCode: string;
    formattedTotal: string;
    itemsCount: number;
    items: {
      id: string;
      productTitle: string;
      productSlug: string;
      sku: string;
      quantity: number;
      formattedLineSubtotal: string;
      imageUrl: string;
    }[];
  }[];
  addresses: {
    id: string;
    recipientName: string;
    line1: string;
    line2: string | null;
    city: string;
    region: string | null;
    postalCode: string;
    countryCode: string;
    phone: string | null;
    isDefaultShipping: boolean;
  }[];
};

export async function findOrCreateCustomer(
  identifier: string,
  marketCode: string = "US",
  client?: Tx,
): Promise<{ id: string; email: string; phone: string | null; firstName: string | null }> {
  const runner = client ?? db;
  const isEmail = identifier.includes("@");
  const cleanId = identifier.trim().toLowerCase();

  // 1. Search existing customer
  const existing = await runner.customer.findFirst({
    where: isEmail ? { email: cleanId } : { phone: cleanId },
    select: { id: true, email: true, phone: true, firstName: true },
  });

  if (existing) return existing;

  // 2. Find default customer group
  const defaultGroup = await runner.customerGroup.findFirst({
    where: { isDefault: true },
    select: { id: true },
  });

  const groupId = defaultGroup?.id ?? "00000000-0000-0000-0000-000000000001";
  const email = isEmail ? cleanId : `${cleanId.replace(/\D/g, "")}@customer.millenniumdesigns.internal`;
  const phone = isEmail ? null : cleanId;

  const created = await runner.customer.create({
    data: {
      email,
      phone,
      customerGroupId: groupId,
      defaultMarketCode: marketCode,
      isGuest: false,
    },
    select: { id: true, email: true, phone: true, firstName: true },
  });

  return created;
}

export async function getCustomerProfile(customerId: string): Promise<CustomerProfile | null> {
  const customer = await db.customer.findUnique({
    where: { id: customerId },
  });

  if (!customer) return null;

  const [addresses, orders] = await Promise.all([
    db.address.findMany({
      where: { customerId: customer.id, isArchived: false },
    }),
    db.order.findMany({
      where: {
        OR: [{ customerId }, { email: customer.email }],
      },
      orderBy: { createdAt: "desc" },
      include: {
        items: true,
      },
    }),
  ]);

  const formattedOrders = await Promise.all(
    orders.map(async (o) => {
      const market = await resolveMarket(o.marketCode);
      const locale = market.locale;
      const total = money(o.totalMinor, o.currencyCode);

      const items = o.items.map((it) => ({
        id: it.id,
        productTitle: it.productTitle,
        productSlug: it.productSlug,
        sku: it.sku,
        quantity: it.quantity,
        formattedLineSubtotal: formatMoney(money(it.lineSubtotalMinor, o.currencyCode), { locale }),
        imageUrl: it.imageUrl ?? getProductFallbackImages(it.productSlug).primary,
      }));

      return {
        id: o.id,
        orderNumber: o.orderNumber,
        placedAt: o.placedAt.toISOString(),
        status: o.status,
        paymentStatus: o.paymentStatus,
        currencyCode: o.currencyCode,
        formattedTotal: formatMoney(total, { locale }),
        itemsCount: o.items.reduce((acc, curr) => acc + curr.quantity, 0),
        items,
      };
    }),
  );

  const formattedAddresses = addresses.map((addr) => ({
    id: addr.id,
    recipientName: addr.recipientName,
    line1: addr.line1,
    line2: addr.line2,
    city: addr.city,
    region: addr.region,
    postalCode: addr.postalCode ?? "",
    countryCode: addr.countryCode,
    phone: addr.phone,
    isDefaultShipping: customer.defaultShippingAddressId === addr.id,
  }));

  return {
    id: customer.id,
    email: customer.email,
    phone: customer.phone,
    firstName: customer.firstName,
    lastName: customer.lastName,
    defaultMarketCode: customer.defaultMarketCode,
    orders: formattedOrders,
    addresses: formattedAddresses,
  };
}

export async function addCustomerAddress(
  customerId: string,
  input: {
    name: string;
    line1: string;
    line2?: string;
    city: string;
    region?: string;
    postalCode: string;
    countryCode: string;
    phone?: string;
    isDefault?: boolean;
  },
) {
  return withTransaction(async (tx) => {
    const address = await tx.address.create({
      data: {
        customerId,
        recipientName: input.name,
        line1: input.line1,
        line2: input.line2 ?? null,
        city: input.city,
        region: input.region ?? null,
        postalCode: input.postalCode,
        countryCode: input.countryCode.toUpperCase(),
        phone: input.phone ?? null,
      },
    });

    if (input.isDefault) {
      await tx.customer.update({
        where: { id: customerId },
        data: { defaultShippingAddressId: address.id },
      });
    }

    return address;
  });
}

export async function sendCustomerOtp(identifier: string) {
  const clean = identifier.trim().toLowerCase();
  return withTransaction(async (tx) => {
    return issueOtp(tx, {
      purpose: "customer_login",
      identifier: clean,
    });
  });
}

export async function verifyAndLoginCustomer(identifier: string, code: string, marketCode: string = "US") {
  const cleanId = identifier.trim().toLowerCase();
  const cleanCode = code.trim();

  const verification = await verifyOtpCode({
    purpose: "customer_login",
    identifier: cleanId,
    code: cleanCode,
  });

  if (!verification.ok) {
    return { ok: false as const, reason: verification.reason };
  }

  const result = await withTransaction(async (tx) => {
    const cust = await findOrCreateCustomer(cleanId, marketCode, tx);
    const session = await createSession(tx, { customerId: cust.id });
    return { token: session.token, expiresAt: session.expiresAt, customer: cust };
  });

  return { ok: true as const, ...result };
}
