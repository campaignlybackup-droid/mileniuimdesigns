/**
 * Raw-`pg` connectivity probe (01 §5.9; 09 P02 exit criterion (d)).
 *
 * Deliberately uses the SAME driver the application uses — `pg` via
 * `@prisma/adapter-pg` — rather than the Prisma CLI. The CLI and the adapter do not
 * always speak the same protocol: if `prisma dev` ever surfaces a `prisma+postgres://`
 * URL, the CLI is happy and the app cannot connect. Finding that out here costs a
 * minute; finding it out after forty tables exist costs an afternoon.
 *
 * Also asserts the extensions 02 §7.1 depends on, because a Postgres that cannot create
 * them invalidates the entire search and admin-filter index strategy.
 *
 * Run: npm run db:probe
 */
import "dotenv/config";
import { Client } from "pg";

const REQUIRED_EXTENSIONS = ["pg_trgm", "btree_gist"] as const;

async function main(): Promise<void> {
  const url = process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"];
  if (!url) {
    console.error("✗ Neither DIRECT_URL nor DATABASE_URL is set.");
    process.exit(1);
  }

  if (url.startsWith("prisma+postgres://")) {
    console.error(
      "✗ The URL is a `prisma+postgres://` proxy address. `@prisma/adapter-pg` speaks\n" +
        "  plain TCP and cannot use it. Obtain the direct TCP endpoint instead (01 §5.9).",
    );
    process.exit(1);
  }

  const client = new Client({ connectionString: url, connectionTimeoutMillis: 10_000 });
  try {
    await client.connect();

    const { rows } = await client.query<{ version: string }>("SELECT version()");
    console.log(`✓ connected — ${rows[0]!.version.split(",")[0]}`);

    for (const ext of REQUIRED_EXTENSIONS) {
      await client.query(`CREATE EXTENSION IF NOT EXISTS ${ext}`);
    }
    const { rows: exts } = await client.query<{ extname: string }>(
      "SELECT extname FROM pg_extension ORDER BY 1",
    );
    const present = exts.map((e) => e.extname);
    const missing = REQUIRED_EXTENSIONS.filter((e) => !present.includes(e));
    if (missing.length) {
      console.error(`✗ missing extensions: ${missing.join(", ")} (02 §7.1)`);
      process.exit(1);
    }
    console.log(`✓ extensions — ${present.join(", ")}`);

    // The two trigram facilities the admin search and the ⌘K palette actually call.
    const { rows: sim } = await client.query<{ s: number }>(
      "SELECT similarity('labradorite','labradorit') AS s",
    );
    console.log(`✓ similarity() — ${sim[0]!.s}`);
    await client.query("SELECT 'a'::text <-> 'b'::text");
    console.log("✓ trigram distance operator");

    // Applied migrations, so the probe doubles as "is this database at head".
    try {
      const { rows: m } = await client.query<{ migration_name: string }>(
        "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY finished_at",
      );
      console.log(`✓ migrations applied — ${m.length === 0 ? "none" : m.map((x) => x.migration_name).join(", ")}`);
    } catch {
      console.log("· no _prisma_migrations table yet (expected before the first deploy)");
    }

    console.log("\n✓ Database probe passed\n");
  } catch (e) {
    console.error(`✗ ${(e as Error).message}`);
    process.exit(1);
  } finally {
    await client.end();
  }
}

void main();
