import { resolveMarket } from "@/lib/market";

/**
 * SCAFFOLD. The storefront home page is built by P15.
 *
 * It exists now because P13 rewrites every bare path into this tree, so without a page here
 * the routing it builds could not be exercised at all. It renders nothing but the resolved
 * market's own row — deliberately no headline, no positioning line, no heritage sentence.
 * Writing brand copy for a real jewellery house is what hard rule 8 forbids, and a
 * placeholder that reads like copy is how invented copy reaches production: somebody sees it
 * rendering and assumes it was approved.
 */
export default async function StorefrontHome({
  params,
}: {
  params: Promise<{ market: string }>;
}): Promise<React.ReactElement> {
  const { market } = await params;
  const resolved = await resolveMarket(market);
  return (
    <main>
      <p>
        Market {resolved.code} · {resolved.currencyCode} · {resolved.locale}
      </p>
    </main>
  );
}
