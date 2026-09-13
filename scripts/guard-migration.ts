/**
 * Refuse a generated migration that drops a hand-written object.
 *
 * `prisma migrate dev` diffs the DATABASE against the PRISMA SCHEMA, so every object in
 * prisma/handwritten/addendum.sql — which exists precisely BECAUSE Prisma cannot express
 * it — reads as drift and gets a DROP. Observed twice: the Schema II migration dropped
 * three, and a migration adding ONE TABLE proposed dropping fourteen, including the
 * composite FK that stops a row claiming a currency its market does not use.
 *
 * Run after `prisma migrate dev --create-only`, before applying:
 *   npm run db:guard
 *
 * It edits nothing. It tells you exactly which lines to delete, because a script that
 * silently rewrote generated SQL would be a worse problem than the one it solves.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = process.cwd();

/** Every object named in the addendum, extracted from the file itself so the two
 *  cannot drift apart. */
function protectedObjects(): Set<string> {
  const sql = readFileSync(resolve(ROOT, "prisma/handwritten/addendum.sql"), "utf8");
  const names = new Set<string>();
  for (const m of sql.matchAll(/CREATE (?:UNIQUE )?INDEX (?:IF NOT EXISTS )?"([^"]+)"/g)) names.add(m[1]!);
  for (const m of sql.matchAll(/ADD CONSTRAINT "([^"]+)"/g)) names.add(m[1]!);
  for (const m of sql.matchAll(/CREATE TRIGGER "([^"]+)"/g)) names.add(m[1]!);
  return names;
}

function migrationFiles(): string[] {
  const dir = resolve(ROOT, "prisma/migrations");
  const out: string[] = [];
  for (const d of readdirSync(dir)) {
    const p = join(dir, d, "migration.sql");
    try {
      if (statSync(p).isFile()) out.push(p);
    } catch {
      /* not a migration directory */
    }
  }
  return out.sort();
}

function main(): void {
  const guarded = protectedObjects();
  const offences: string[] = [];

  for (const file of migrationFiles()) {
    // The addendum's own migrations legitimately create these; only look for DROPs.
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      // A commented-out DROP is a neutralised one, and the comment above it explains why.
      if (line.trim().startsWith("--")) return;
      const m =
        /DROP INDEX (?:IF EXISTS )?"?([\w]+)"?/.exec(line) ??
        /DROP CONSTRAINT (?:IF EXISTS )?"?([\w]+)"?/.exec(line) ??
        /DROP TRIGGER (?:IF EXISTS )?"?([\w]+)"?/.exec(line);
      if (!m) return;
      const name = m[1]!;
      if (!guarded.has(name)) return;
      // A DROP immediately followed by a CREATE of the same object is a rebuild, not a
      // destruction — the restore migration does exactly that.
      const rebuilt = lines.slice(i, i + 6).some((l) => l.includes(`"${name}"`) && /CREATE/.test(l));
      if (rebuilt) return;
      offences.push(`${file.replace(ROOT + "/", "")}:${i + 1}  ${line.trim()}`);
    });
  }

  if (offences.length) {
    console.error(
      `\n✗ ${offences.length} migration line(s) would DROP a hand-written object.\n` +
        `\n  These are in prisma/handwritten/addendum.sql because Prisma cannot express` +
        `\n  them, which is exactly why it proposes removing them. Delete these lines from` +
        `\n  the generated migration, then re-run.\n`,
    );
    for (const o of offences) console.error(`  ${o}`);
    console.error("");
    process.exit(1);
  }

  console.log(`✓ no migration drops any of the ${guarded.size} hand-written objects`);
}

main();
