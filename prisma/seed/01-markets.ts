import type { PrismaClient } from "@/generated/prisma/client";

/**
 * Markets, currencies and locations — 02 §6.
 *
 * Everything here is STRUCTURE. No business fact is invented: the stock location ships
 * with an empty address because the client's real locations are a NEEDS INPUT, and
 * inventing an address for a real jewellery house is exactly what hard rule 8 forbids.
 *
 * Idempotent: every write is an upsert keyed on a natural key, so a second run changes
 * nothing (09 P03 exit criterion (a)).
 */
export async function seedMarkets(db: PrismaClient): Promise<void> {
  await db.currency.upsert({
    where: { code: "USD" },
    update: {},
    create: { code: "USD", name: "US Dollar", symbol: "$", minorUnit: 2, isActive: true },
  });
  await db.currency.upsert({
    where: { code: "INR" },
    update: {},
    create: { code: "INR", name: "Indian Rupee", symbol: "₹", minorUnit: 2, isActive: true },
  });

  // The primary market is the United States; India is secondary (00-CONTEXT §1).
  await db.market.upsert({
    where: { code: "US" },
    update: {},
    create: {
      code: "US",
      name: "United States",
      currencyCode: "USD",
      locale: "en-US",
      countryCode: "US",
      timezone: "America/New_York",
      // Destination-based sales tax across ~11,000 jurisdictions with quarterly rate
      // changes is not hand-maintainable; it is a provider's job.
      taxMode: "provider_stripe_tax",
      pricesIncludeTax: false,
      weightUnit: "g",
      incoterm: "DAP",
      isActive: true,
      rank: 1,
    },
  });

  await db.market.upsert({
    where: { code: "IN" },
    update: {},
    create: {
      code: "IN",
      name: "India",
      currencyCode: "INR",
      locale: "en-IN",
      countryCode: "IN",
      timezone: "Asia/Kolkata",
      taxMode: "rules_table",
      // India displays tax-inclusive prices. The pricing service still returns GROSS;
      // extraction happens once, in src/lib/orders/ (04 §8.5).
      pricesIncludeTax: true,
      weightUnit: "g",
      incoterm: "DAP",
      isActive: true,
      rank: 2,
    },
  });

  // One location, fulfilling both markets. Multi-location exists from day one even with
  // a single row, because retrofitting it means rewriting every availability query.
  const location = await db.inventoryLocation.upsert({
    where: { id: "00000000-0000-7000-8000-000000000001" },
    update: {},
    create: {
      id: "00000000-0000-7000-8000-000000000001",
      code: "MAIN",
      name: "Main workshop",
      countryCode: "IN",
      // NEEDS INPUT: the client's real stock locations — how many, where, and which
      // fulfil US versus India orders. Seeded null rather than invented.
      addressJson: undefined,
      isFulfillable: true,
      isActive: true,
      rank: 1,
    },
  });

  for (const marketCode of ["US", "IN"]) {
    await db.marketLocation.upsert({
      where: { marketCode_locationId: { marketCode, locationId: location.id } },
      update: {},
      create: { marketCode, locationId: location.id, priority: 1 },
    });
  }

  // Gapless per-market numbering. The prefix and the financial-year reset rule for the
  // Indian GST invoice series are a NEEDS INPUT; these are placeholders that the admin
  // can change before the first real order.
  for (const [marketCode, prefix] of [
    ["US", "MD-US-"],
    ["IN", "MD-IN-"],
  ] as const) {
    await db.orderCounter.upsert({
      where: { marketCode },
      update: {},
      create: { marketCode, prefix, nextValue: 1000n },
    });
  }
}
