import "server-only";
import { db } from "@/lib/db/client";
import { formatMoney, money } from "@/lib/money";
import { listRecentOrders, type OrderSummary } from "@/lib/orders";

export type MarketKpi = {
  currencyCode: string;
  orderCount: number;
  totalRevenueMinor: string;
  formattedRevenue: string;
  formattedAov: string;
};

export type DashboardMetrics = {
  inrKpi: MarketKpi;
  usdKpi: MarketKpi;
  totalCustomers: number;
  lowStockCount: number;
  recentOrders: OrderSummary[];
};

export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  // Aggregate revenue and orders grouped by currency
  const currencyAggregates = await db.$queryRaw<
    {
      currency_code: string;
      order_count: number;
      revenue_minor: bigint;
    }[]
  >`
    SELECT currency_code,
           count(*)::int AS order_count,
           coalesce(sum(total_minor), 0)::bigint AS revenue_minor
      FROM orders
     WHERE payment_status = 'paid'
     GROUP BY currency_code
  `;

  const aggMap = new Map(currencyAggregates.map((a) => [a.currency_code, a]));

  // 1. INR KPI
  const inrData = aggMap.get("INR");
  const inrRev = inrData ? BigInt(inrData.revenue_minor) : 0n;
  const inrCount = inrData?.order_count ?? 0;
  const inrAov = inrCount > 0 ? inrRev / BigInt(inrCount) : 0n;

  const inrKpi: MarketKpi = {
    currencyCode: "INR",
    orderCount: inrCount,
    totalRevenueMinor: inrRev.toString(),
    formattedRevenue: formatMoney(money(inrRev, "INR"), { locale: "en-IN" }),
    formattedAov: formatMoney(money(inrAov, "INR"), { locale: "en-IN" }),
  };

  // 2. USD KPI
  const usdData = aggMap.get("USD");
  const usdRev = usdData ? BigInt(usdData.revenue_minor) : 0n;
  const usdCount = usdData?.order_count ?? 0;
  const usdAov = usdCount > 0 ? usdRev / BigInt(usdCount) : 0n;

  const usdKpi: MarketKpi = {
    currencyCode: "USD",
    orderCount: usdCount,
    totalRevenueMinor: usdRev.toString(),
    formattedRevenue: formatMoney(money(usdRev, "USD"), { locale: "en-US" }),
    formattedAov: formatMoney(money(usdAov, "USD"), { locale: "en-US" }),
  };

  // 3. Customers and Inventory
  const [totalCustomers, lowStockCount, recentOrders] = await Promise.all([
    db.customer.count({ where: { anonymizedAt: null } }),
    db.inventoryItem.count({ where: { onHandQuantity: { lte: 2 } } }),
    listRecentOrders(10),
  ]);

  return {
    inrKpi,
    usdKpi,
    totalCustomers,
    lowStockCount,
    recentOrders,
  };
}
