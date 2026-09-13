/**
 * Generate `src/generated/market-snapshot.json` — 01 §1.4.
 *
 * Middleware needs the set of active market codes and which one is primary, and Prisma cannot
 * run in the Edge runtime. `04 §5.2` originally proposed TWO sources: a public
 * `/api/internal/market-snapshot` route fetched by middleware, plus this file as a cold-isolate
 * fallback. Both were built; only this one survives.
 *
 * **Two sources of market truth in the edge is the defect, not either one of them** — and once
 * the fallback is acceptable as the answer on a cold isolate, it is the answer. Deleting the
 * route also removed a public, unauthenticated endpoint that enumerated every market row
 * INCLUDING INACTIVE ONES, which is a disclosure of unlaunched markets to anyone who asks.
 *
 * The cost: activating a market takes effect at the next deployment rather than within 60
 * seconds. Acceptable, because activating a market already needs a `prices` row per variant, a
 * payment credential (an environment change, which is a redeploy anyway), shipping zones and a
 * tax registration. **Deactivation is not affected**: `resolveMarket()` reads the database, so
 * `/in/rings` 404s the moment the row flips, deploy or no deploy. The emergency direction
 * needs no deploy.
 *
 * Run inside the build command. `src/generated/` is gitignored, which is what keeps
 * `third-market.test.ts`'s "empty `git diff src/`" assertion true.
 */
import "dotenv/config";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

export type EdgeMarket = {
  code: string;
  /** The URL segment, lower case. `US` is served at the root; see `primary`. */
  segment: string;
  currencyCode: string;
  locale: string;
  rank: number;
};

async function main(): Promise<void> {
  const url = process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL is not set; cannot generate the market snapshot.");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 2 }) });

  const rows = await db.market.findMany({
    where: { isActive: true },
    orderBy: { rank: "asc" },
    select: { code: true, currencyCode: true, locale: true, rank: true },
  });
  await db.$disconnect();

  if (rows.length === 0) {
    // A snapshot with no markets makes middleware treat every first segment as a path, so
    // every URL rewrites to a market that does not exist. Failing the build is the only
    // honest outcome: there is no safe default market to invent.
    throw new Error("No active markets. The snapshot would make every storefront URL a 404.");
  }

  const markets: EdgeMarket[] = rows.map((m) => ({
    code: m.code,
    segment: m.code.toLowerCase(),
    currencyCode: m.currencyCode,
    locale: m.locale,
    rank: m.rank,
  }));

  // The primary market is `rank` ascending among ACTIVE rows — not a hardcoded 'US'. If the
  // client ever makes India primary, that is a row edit and a deploy, not a code change.
  const primary = markets[0]!;
  const body = { markets, primary: primary.segment, primaryCode: primary.code };
  const json = JSON.stringify(body, null, 2) + "\n";
  const checksum = createHash("sha256").update(json).digest("hex");

  const dir = resolve(process.cwd(), "src/generated");
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, "market-snapshot.json"), json);
  writeFileSync(resolve(dir, "market-snapshot.checksum"), `${checksum}\n`);
  console.log(
    `✓ market snapshot: ${String(markets.length)} active market(s), primary '${primary.code}'`,
  );
}

main().then(
  () => process.exit(0),
  (e: unknown) => {
    console.error(e);
    process.exit(1);
  },
);
