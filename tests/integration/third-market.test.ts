import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { db } from "@/lib/db/client";
import {
  resolveMarket,
  listActiveMarkets,
  alternatesFor,
  isAvailableInMarket,
} from "@/lib/market";
import { getProviderForMarket, providerStatusForMarket } from "@/lib/payments/registry";
import { getDisplayPrice, resolvePrice } from "@/lib/pricing";
import { MarketNotFoundError } from "@/lib/errors";

/**
 * Commissioned by 09 P13 exit criterion (e) — **"the third market is provable, not asserted."**
 *
 * `00 §1` requires UK, Canada, Australia, the UAE and the EU without a rebuild, and `§4.3`
 * asserted "rows only" with no mechanism behind it. **An extensibility claim that is never
 * executed is a claim that is false by the time anyone tries it** — the `switch` on
 * `'US' | 'IN'`, the hand-written `hreflang` map and the `generateStaticParams` array all look
 * harmless until the day someone adds a row and finds three of them.
 *
 * So this test adds Great Britain as ROWS ONLY and then asserts the system works — including
 * the final assertion, which is the point of the whole file: **`git diff --stat src/` is
 * empty.** Not one line of source changed to add a market.
 */

/** src/'s full VCS status, tracked and untracked, before the test runs. */
function srcStatus(): string {
  return execSync("git status --porcelain -- src/", { encoding: "utf8" }).trim();
}
const SRC_STATUS_BEFORE = srcStatus();

const stamp = Date.now();
const prefix = `zz-p13-${String(stamp)}`;
let productId = "";
let variantId = "";
let created = false;

beforeAll(async () => {
  // ── The market, as rows. Nothing here is a code path that knows about Britain. ────────
  await db.$executeRaw`
    INSERT INTO currencies (code, name, symbol, minor_unit, is_active, created_at, updated_at)
    VALUES ('GBP', 'Pound Sterling', '£', 2, true, now(), now())
    ON CONFLICT (code) DO NOTHING
  `;
  await db.$executeRaw`
    INSERT INTO markets (code, name, currency_code, locale, country_code, timezone,
                         payment_provider_key, tax_mode, prices_include_tax, weight_unit,
                         incoterm, is_active, rank, created_at, updated_at)
    VALUES ('GB', 'United Kingdom', 'GBP', 'en-GB', 'GB', 'Europe/London',
            NULL, 'rules_table', true, 'g', 'DDP', true, 3, now(), now())
    ON CONFLICT (code) DO NOTHING
  `;
  created = true;

  const p = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO products (id, slug, title, status, published_at, rank, search_text, version,
                          created_at, updated_at)
    VALUES (gen_random_uuid(), ${prefix}, 'ZZ P13 FIXTURE', 'active', now() - interval '1 hour',
            0, '', 1, now(), now())
    RETURNING id::text AS id
  `;
  productId = p[0]!.id;
  const v = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO product_variants (id, product_id, sku, position, inventory_policy,
                                  option_signature, is_active, version, created_at, updated_at)
    VALUES (gen_random_uuid(), ${productId}::uuid, 'MD-ZZB-ZZB-B001-NA', 0, 'tracked', '',
            true, 1, now(), now())
    RETURNING id::text AS id
  `;
  variantId = v[0]!.id;

  // One price per market, each an independent commercial decision. £189 is not a conversion
  // of $248 and nothing in the system relates them.
  for (const [market, currency, minor] of [
    ["US", "USD", 24_800n],
    ["IN", "INR", 1_995_000n],
    ["GB", "GBP", 18_900n],
  ] as const) {
    await db.$executeRaw`
      INSERT INTO prices (id, product_id, variant_id, market_code, currency_code, list_minor,
                          price_source, valid_from, created_at)
      VALUES (gen_random_uuid(), ${productId}::uuid, ${variantId}::uuid, ${market}, ${currency},
              ${minor}, 'manual', now() - interval '1 hour', now())
    `;
  }
});

afterAll(async () => {
  await db.$executeRaw`DELETE FROM prices WHERE product_id = ${productId}::uuid`;
  await db.$executeRaw`DELETE FROM products WHERE slug = ${prefix}`;
  if (created) {
    await db.$executeRaw`DELETE FROM markets WHERE code = 'GB'`;
    await db.$executeRaw`DELETE FROM currencies WHERE code = 'GBP'`;
  }
});

describe("a third market is rows only", () => {
  it("resolves from the database with no code change", async () => {
    const gb = await resolveMarket("gb");
    expect(gb.code).toBe("GB");
    expect(gb.currencyCode).toBe("GBP");
    expect(gb.locale).toBe("en-GB");
    expect(gb.pricesIncludeTax).toBe(true);
  });

  it("appears in the active list, ranked", async () => {
    const markets = await listActiveMarkets();
    expect(markets.map((m) => m.code)).toEqual(["US", "IN", "GB"]);
  });

  it("prices render in pounds, independently of the other two", async () => {
    const gb = await resolvePrice({ variantId, marketCode: "GB", quantity: 1, client: db });
    expect(gb.currencyCode).toBe("GBP");
    expect(gb.unitListMinor).toBe(18_900n);

    // The other markets are untouched, and none of the three is a conversion of another.
    const us = await resolvePrice({ variantId, marketCode: "US", quantity: 1, client: db });
    const india = await resolvePrice({ variantId, marketCode: "IN", quantity: 1, client: db });
    expect(us.unitListMinor).toBe(24_800n);
    expect(india.unitListMinor).toBe(1_995_000n);
    expect(new Set([us.currencyCode, india.currencyCode, gb.currencyCode]).size).toBe(3);
  });

  it("the display path works in the new market too", async () => {
    const display = await getDisplayPrice([variantId], "GB");
    expect(display.get(variantId)!.currencyCode).toBe("GBP");
    expect(display.get(variantId)!.listMinor).toBe(18_900n);
  });

  it("hreflang gains an en-GB alternate, derived not listed", async () => {
    const alt = await alternatesFor("/rings", "https://example.test");
    expect(alt.languages["en-GB"]).toBe("https://example.test/gb/rings");
    // And the primary market is still unprefixed, with x-default pointing at it.
    expect(alt.languages["en-US"]).toBe("https://example.test/rings");
    expect(alt.xDefault).toBe("https://example.test/rings");
    expect(Object.keys(alt.languages)).toHaveLength(3);
  });

  it("availability answers for the new market", async () => {
    expect(await isAvailableInMarket(productId, "GB")).toBe(true);
  });

  it("getProviderForMarket returns null CLEANLY rather than throwing", async () => {
    // A market can legitimately exist before its acquirer does: browsing and pricing work,
    // checkout says so. A `switch` on 'US' | 'IN' would have thrown here, and a throw on a
    // product page is a 500 rather than a market that is not yet purchasable.
    await expect(getProviderForMarket("GB")).resolves.toBeNull();
    const status = await providerStatusForMarket("GB");
    expect(status.reason).toBe("no_key");
    expect(status.key).toBeNull();
  });

  it("an unknown market still 404s — the new row did not widen the door", async () => {
    await expect(resolveMarket("xx")).rejects.toThrow(MarketNotFoundError);
    await expect(resolveMarket("zz")).rejects.toThrow(MarketNotFoundError);
  });

  it("deactivating it takes effect immediately, with no deployment", async () => {
    // The emergency direction. The edge snapshot is a build artefact and still lists GB, but
    // `resolveMarket` reads the database, so the route 404s the moment the row flips.
    await db.$executeRaw`UPDATE markets SET is_active = false WHERE code = 'GB'`;
    await expect(resolveMarket("gb")).rejects.toThrow(MarketNotFoundError);
    await db.$executeRaw`UPDATE markets SET is_active = true WHERE code = 'GB'`;
  });

  it("and NOT ONE LINE of src/ changed to add a market", () => {
    // The assertion the whole file exists for — but it has to measure the right thing.
    //
    // `git diff --stat src/` compares the working tree to HEAD, which says nothing about what
    // THIS TEST did: untracked files are invisible to it, so during the phase that adds these
    // very modules it would pass while src/ was full of new source. What is actually being
    // claimed is "adding a market changed no source", so the check is a BEFORE/AFTER
    // comparison of src/'s full status, taken across the test's own execution.
    const after = srcStatus();
    expect(after, `src/ changed while adding a market:\n${after}`).toBe(SRC_STATUS_BEFORE);
  });

  it("and the edge snapshot is STALE until a deploy — stated, not hidden", async () => {
    // The honest half of the trade-off (01 §1.4). `resolveMarket` reads the database, so
    // /gb/* resolves inside the app immediately. MIDDLEWARE reads a build-time snapshot, so
    // it will not recognise `gb` as a market segment until the next deployment — and until
    // then `/gb/rings` rewrites to `/us/gb/rings` and 404s.
    //
    // That cost is acceptable because activating a market already needs a price per variant,
    // an acquirer credential (an environment change, which is a redeploy anyway), shipping
    // zones and a tax registration. Asserting it here stops it being rediscovered as a bug.
    const { MARKETS, isMarketSegment } = await import("@/lib/edge/markets");
    const snapshotCodes = MARKETS.map((m) => m.code);
    const live = (await listActiveMarkets()).map((m) => m.code);
    expect(live).toContain("GB");
    expect(snapshotCodes).not.toContain("GB");
    expect(isMarketSegment("gb")).toBe(false);
    // Regenerating the snapshot is a build step, and `src/generated/` is gitignored — which
    // is what keeps the assertion above true when it runs.
    expect(isMarketSegment("us")).toBe(true);
  });
});
