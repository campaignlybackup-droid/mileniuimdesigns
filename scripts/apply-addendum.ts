/**
 * Re-apply the hand-written addendum — see prisma/handwritten/addendum.sql.
 *
 * Runs after every migration. Idempotent by construction, so running it twice is a no-op
 * and running it after Prisma has dropped something restores it.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";

async function main(): Promise<void> {
  const url = process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"];
  if (!url) throw new Error("DIRECT_URL or DATABASE_URL must be set.");
  const sql = readFileSync(resolve(process.cwd(), "prisma/handwritten/addendum.sql"), "utf8");

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(sql);
    console.log("✓ hand-written addendum applied");
  } finally {
    await client.end();
  }
}

void main().catch((e) => {
  console.error("✗ addendum failed:", (e as Error).message);
  process.exit(1);
});
