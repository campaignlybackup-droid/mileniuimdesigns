/**
 * Seed or drop the 5,000-product performance fixture (09 §2.10).
 *
 *   npm run perf:seed
 *   npm run perf:drop
 *
 * Synthetic data only — see the header of prisma/fixtures/perf-catalog.ts.
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { dropPerfCatalog, seedPerfCatalog } from "../prisma/fixtures/perf-catalog";

function client(): PrismaClient {
  const url = process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL is not set.");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 4 }) });
}

async function main(): Promise<void> {
  if (process.argv.includes("--drop")) {
    await dropPerfCatalog(client());
    console.log("✓ performance fixture removed");
    return;
  }
  const started = Date.now();
  const { products } = await seedPerfCatalog(client());
  console.log(`✓ ${products} fixture products in ${String(Date.now() - started)}ms`);
}

main().then(
  () => process.exit(0),
  (e: unknown) => {
    console.error(e);
    process.exit(1);
  },
);
