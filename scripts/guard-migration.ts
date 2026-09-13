/**
 * Refuse a generated migration that would leave a hand-written object absent or wrong.
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
 * It edits nothing. It tells you exactly which lines to change, because a script that
 * silently rewrote generated SQL would be a worse problem than the one it solves.
 *
 * ── Two rules ────────────────────────────────────────────────────────────────────────
 *
 * A. A migration must not DROP a protected object without re-creating it in the same file.
 *    One shape of drop is legitimate and this recognises exactly it: Prisma runs a migration
 *    file in a single transaction, so a drop paired with a re-creation is never observable as
 *    an absence. P09 needed the pair — Postgres refuses `ALTER COLUMN … TYPE` on an enum
 *    while a CHECK constraint compares that column to literals bound to the old type.
 *
 * B. Where a migration CREATES a protected object and the addendum cannot overwrite it, the
 *    two definitions must match exactly.
 *
 *    Rule B is the one that is easy to miss, so here is the mechanism. `npm run db:deploy` is
 *    `prisma migrate deploy && npm run db:addendum`, so the addendum always runs last — but
 *    "last" only wins if it can overwrite. Most of the addendum's indexes open with
 *    `DROP INDEX IF EXISTS`, so they can: Prisma's plain `idx_jobs_claim` is dropped and
 *    replaced by the partial one, and the two definitions are free to differ. The addendum's
 *    CHECK constraints cannot: they are `ADD CONSTRAINT` inside a `DO $$ … EXCEPTION WHEN
 *    duplicate_object THEN NULL` block, which by design does nothing when the name is taken.
 *    So if a migration adds `chk_attributes_filterable_type` with a definition that differs by
 *    one enum member, the migration's version is what the database keeps, permanently, and
 *    every check we had before this one still passes: `db:addendum` exits 0, and the manifest
 *    test asserts the constraint is PRESENT. Presence is not the same claim as correctness,
 *    and a constraint quietly widened inside a migration is the exact failure the addendum was
 *    built to make impossible.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = process.cwd();

type Creation = { name: string; definition: string; at: number };

/** Comments carry example SQL. A guard that reads its own explanations finds itself. */
function stripComments(sql: string): string {
  return sql
    .split("\n")
    .map((l) => l.replace(/--.*$/, ""))
    .join("\n");
}

/**
 * Every creation of a protected object in a file: its name, and the canonical text of the
 * statement that creates it — from the token that names it to the terminator, whitespace
 * collapsed. Two spellings of the same constraint compare equal; a widened CHECK does not.
 */
function creationsIn(sql: string): Creation[] {
  const text = stripComments(sql);
  const out: Creation[] = [];
  const patterns = [
    /ADD CONSTRAINT "([^"]+)"/g,
    /CREATE (?:UNIQUE )?INDEX (?:CONCURRENTLY )?(?:IF NOT EXISTS )?"([^"]+)"/g,
    /CREATE (?:OR REPLACE )?TRIGGER "([^"]+)"/g,
  ];
  for (const re of patterns) {
    for (const m of text.matchAll(re)) {
      const start = m.index!;
      const end = text.indexOf(";", start);
      const body = text.slice(start, end === -1 ? undefined : end);
      out.push({
        name: m[1]!,
        definition: body
          .replace(/IF NOT EXISTS /g, "")
          .replace(/\s+/g, " ")
          .trim(),
        at: start,
      });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

type Protected = {
  definition: string;
  /** True when the addendum drops or replaces the object before creating it, so its own
   *  definition is guaranteed to be the one that survives regardless of what ran before. */
  addendumWins: boolean;
};

/** Every object named in the addendum, extracted from the file itself so the two
 *  cannot drift apart. */
function protectedObjects(): Map<string, Protected> {
  const raw = readFileSync(resolve(ROOT, "prisma/handwritten/addendum.sql"), "utf8");
  const text = stripComments(raw);
  const out = new Map<string, Protected>();
  for (const c of creationsIn(raw)) {
    if (out.has(c.name)) continue;
    const before = text.slice(0, c.at);
    const dropped =
      new RegExp(`DROP INDEX IF EXISTS "${c.name}"`).test(before) ||
      new RegExp(`DROP CONSTRAINT IF EXISTS "${c.name}"`).test(before) ||
      new RegExp(`DROP TRIGGER IF EXISTS "${c.name}"`).test(before);
    const replaced = /CREATE OR REPLACE TRIGGER/.test(c.definition);
    out.set(c.name, { definition: c.definition, addendumWins: dropped || replaced });
  }
  return out;
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
    const text = readFileSync(file, "utf8");
    const lines = text.split("\n");
    const where = file.replace(ROOT + "/", "");
    // Re-creations anywhere in THIS file — a migration runs as one transaction, so a pair
    // separated by the statement that required the drop is still never observable.
    const created = new Map(creationsIn(text).map((c) => [c.name, c.definition]));

    // Rule A — a drop with nothing putting the object back.
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
      if (created.has(name)) return;
      offences.push(
        `${where}:${i + 1}  ${line.trim()}\n      → dropped, and nothing in this file puts it back`,
      );
    });

    // Rule B — a creation the addendum will never get to correct.
    for (const [name, definition] of created) {
      const p = guarded.get(name);
      if (!p || p.addendumWins || definition === p.definition) continue;
      offences.push(
        `${where}  creates "${name}" with a definition the addendum cannot overwrite\n` +
          `      addendum:  ${p.definition}\n` +
          `      migration: ${definition}`,
      );
    }
  }

  if (offences.length) {
    console.error(
      `\n✗ ${offences.length} problem(s) with hand-written objects in migrations.\n` +
        `\n  These objects are in prisma/handwritten/addendum.sql because Prisma cannot` +
        `\n  express them. A migration may drop one only if it re-creates it in the same` +
        `\n  file, and may create one only with the addendum's exact definition unless the` +
        `\n  addendum drops it first.\n`,
    );
    for (const o of offences) console.error(`  ${o}`);
    console.error("");
    process.exit(1);
  }

  console.log(
    `✓ ${guarded.size} hand-written objects: none dropped without replacement, ` +
      `none created with a definition the addendum cannot correct`,
  );
}

main();
