import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * The expected shape of the database, DERIVED rather than typed out.
 *
 * Both lists here used to be hand-maintained constants, and both had the same defect: a list
 * that must be updated by hand silently stops covering what it claims to cover. It cost
 * something real — `media_tags` was declared in prisma/schema/media.prisma at P06 and the table
 * was never created, and `drift.test.ts` did not notice for four phases because `media_tags`
 * was never added to its list. The test was green the entire time, asserting the presence of
 * every table someone had remembered to type.
 *
 * So: the table list comes from the Prisma models, and the hand-written-object list comes from
 * prisma/handwritten/addendum.sql — the same extraction `scripts/guard-migration.ts` uses, so
 * the guard and the test cannot disagree about what is protected.
 *
 * The obvious objection is that deriving from the source makes deletion invisible: remove a
 * model and the test stops expecting its table. That is what the count floors in the tests are
 * for. Deleting is a visible edit to a file whose entire purpose is to hold these declarations,
 * and it fails review and the floor; FORGETTING TO ADD is invisible and failed neither.
 */

const ROOT = process.cwd();

/** Every table name the Prisma schema declares, via `@@map` or the model name itself. */
export function tablesInSchema(): Set<string> {
  const dir = resolve(ROOT, "prisma/schema");
  const out = new Set<string>();
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".prisma")) continue;
    const src = readFileSync(join(dir, file), "utf8");
    for (const block of src.split(/\n(?=model\s)/)) {
      const name = /^model\s+(\w+)\s*\{/.exec(block)?.[1];
      if (!name) continue;
      const mapped = /@@map\("([^"]+)"\)/.exec(block)?.[1];
      out.add(mapped ?? name);
    }
  }
  return out;
}

export type HandWritten = { indexes: string[]; constraints: string[]; triggers: string[] };

/** Every object the addendum creates, by kind. */
export function handWrittenObjects(): HandWritten {
  const raw = readFileSync(resolve(ROOT, "prisma/handwritten/addendum.sql"), "utf8");
  // Comments carry example SQL, and a guard that reads its own explanations finds itself.
  const sql = raw
    .split("\n")
    .map((l) => l.replace(/--.*$/, ""))
    .join("\n");
  const collect = (re: RegExp): string[] => [
    ...new Set([...sql.matchAll(re)].map((m) => m[1]!)),
  ];
  return {
    indexes: collect(/CREATE (?:UNIQUE )?INDEX (?:IF NOT EXISTS )?"([^"]+)"/g),
    constraints: collect(/ADD CONSTRAINT "([^"]+)"/g),
    triggers: collect(/CREATE (?:OR REPLACE )?(?:CONSTRAINT )?TRIGGER "([^"]+)"/g),
  };
}
