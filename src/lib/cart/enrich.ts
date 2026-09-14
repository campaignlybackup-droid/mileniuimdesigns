import "server-only";
import { db } from "@/lib/db/client";
import { formatMoney, money } from "@/lib/money";
import { resolveMarket } from "@/lib/market";
import { getProductFallbackImages } from "@/lib/media/categoryImages";
import type { CartView } from "@/lib/cart";

export type EnrichedCartLine = {
  id: string;
  variantId: string;
  quantity: number;
  unitListMinor: string;
  unitFinalMinor: string;
  lineSubtotalMinor: string;
  formattedUnitFinal: string;
  formattedLineSubtotal: string;
  productTitle: string;
  productSlug: string;
  variantTitle: string | null;
  sku: string;
  imageUrl: string;
};

export type EnrichedCartView = {
  id: string;
  marketCode: string;
  currencyCode: string;
  lines: EnrichedCartLine[];
  subtotalMinor: string;
  formattedSubtotal: string;
  totalQuantity: number;
  notices: CartView["notices"];
};

export async function enrichCart(cart: CartView | null): Promise<EnrichedCartView | null> {
  if (!cart) return null;

  const market = await resolveMarket(cart.marketCode);
  const locale = market.locale;

  // Retrieve variant and product data for lines
  const variantIds = cart.lines.map((l) => l.variantId);
  const variants = await db.productVariant.findMany({
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

  const enrichedLines: EnrichedCartLine[] = cart.lines.map((l) => {
    const v = variantMap.get(l.variantId);
    const productTitle = v?.product.title ?? "Millennium Fine Jewellery";
    const productSlug = v?.product.slug ?? "";
    const variantTitle = v?.title ?? null;
    const sku = v?.sku ?? "";

    const fallback = getProductFallbackImages(productSlug || l.variantId);
    const imageUrl = fallback.primary;

    const unitFinal = money(l.unitFinalMinor, cart.currencyCode);
    const lineSubtotal = money(l.lineSubtotalMinor, cart.currencyCode);

    return {
      id: l.id,
      variantId: l.variantId,
      quantity: l.quantity,
      unitListMinor: l.unitListMinor.toString(),
      unitFinalMinor: l.unitFinalMinor.toString(),
      lineSubtotalMinor: l.lineSubtotalMinor.toString(),
      formattedUnitFinal: formatMoney(unitFinal, { locale }),
      formattedLineSubtotal: formatMoney(lineSubtotal, { locale }),
      productTitle,
      productSlug,
      variantTitle,
      sku,
      imageUrl,
    };
  });

  const subtotal = money(cart.subtotalMinor, cart.currencyCode);
  const totalQuantity = enrichedLines.reduce((acc, curr) => acc + curr.quantity, 0);

  return {
    id: cart.id,
    marketCode: cart.marketCode,
    currencyCode: cart.currencyCode,
    lines: enrichedLines,
    subtotalMinor: cart.subtotalMinor.toString(),
    formattedSubtotal: formatMoney(subtotal, { locale }),
    totalQuantity,
    notices: cart.notices,
  };
}
