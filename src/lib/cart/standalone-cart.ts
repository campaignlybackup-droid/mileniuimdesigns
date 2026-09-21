import type { EnrichedCartView, EnrichedCartLine } from "@/lib/cart/enrich";
import { STANDALONE_PRODUCTS } from "@/lib/storage/standalone-catalog";
import { money, formatMoney } from "@/lib/money";

const STANDALONE_COOKIE = "md_standalone_cart";

export type StandaloneCartState = {
  id: string;
  marketCode: string;
  currencyCode: string;
  items: {
    lineId: string;
    variantId: string;
    productId: string;
    quantity: number;
  }[];
};

export function readStandaloneCartCookie(cookieHeader?: string | null): StandaloneCartState | null {
  if (!cookieHeader) return null;
  try {
    const raw = decodeURIComponent(cookieHeader);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function serializeStandaloneCart(state: StandaloneCartState): string {
  return encodeURIComponent(JSON.stringify(state));
}

export function formatStandaloneEnrichedCart(
  state: StandaloneCartState,
): EnrichedCartView {
  const isIndia = state.marketCode.toUpperCase() === "IN";
  const currencyCode = isIndia ? "INR" : "USD";
  const locale = isIndia ? "en-IN" : "en-US";

  const lines: EnrichedCartLine[] = [];
  let runningTotal = 0n;
  let totalQty = 0;

  for (const it of state.items) {
    const prod =
      STANDALONE_PRODUCTS.find(
        (p) =>
          p.id === it.productId ||
          p.slug === it.variantId ||
          ("variants" in p &&
            Array.isArray((p as { variants?: { id: string }[] }).variants) &&
            (p as { variants?: { id: string }[] }).variants?.some((v) => v.id === it.variantId)),
      ) ?? STANDALONE_PRODUCTS[0];

    const unitBigInt = isIndia ? prod.priceInrMinor : prod.priceUsdMinor;
    const qtyBigInt = BigInt(it.quantity);
    const lineTotalBigInt = unitBigInt * qtyBigInt;
    runningTotal += lineTotalBigInt;
    totalQty += it.quantity;

    const unitMoney = money(unitBigInt, currencyCode);
    const lineSubtotalMoney = money(lineTotalBigInt, currencyCode);

    lines.push({
      id: it.lineId,
      variantId: it.variantId,
      quantity: it.quantity,
      unitListMinor: unitBigInt.toString(),
      unitFinalMinor: unitBigInt.toString(),
      lineSubtotalMinor: lineTotalBigInt.toString(),
      formattedUnitFinal: formatMoney(unitMoney, { locale }),
      formattedLineSubtotal: formatMoney(lineSubtotalMoney, { locale }),
      productTitle: prod.title,
      productSlug: prod.slug,
      variantTitle: null,
      sku: prod.slug,
      imageUrl: prod.primaryImage || "/images/products/rings-1.jpg",
    });
  }

  const subtotalMoney = money(runningTotal, currencyCode);

  return {
    id: state.id,
    marketCode: state.marketCode,
    currencyCode,
    lines,
    subtotalMinor: runningTotal.toString(),
    formattedSubtotal: formatMoney(subtotalMoney, { locale }),
    totalQuantity: totalQty,
    notices: [],
  };
}
