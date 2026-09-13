import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Read a source file with BOTH comment forms removed.
 *
 * Every static guard in this repository forbids something, and every one of them explains what
 * it forbids — in a comment, naming the thing. A scan that reads its own explanation finds
 * itself. This has now happened four times: the migration guard matched its own example SQL at
 * P06, the money-arithmetic scan matched a comment at P11, the rate-change scan matched
 * `rates.ts`'s header at P12, and the market scan matched the sentence explaining why
 * `md_market` must not appear. Each was fixed locally; this is the shared fix.
 *
 * Block comments first, because a `//` inside a `/* *\/` block would otherwise leave the block
 * half-stripped and the rest of it in the text being searched.
 */
export function codeOf(path: string): string {
  return stripComments(readFileSync(path, "utf8"));
}

export function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

/** Every `.ts`/`.tsx` file under a directory, recursively. Generated output is never scanned:
 *  it is not hand-written, so a finding in it is a finding about the generator. */
export function sourceFiles(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (entry === "generated" || entry === "node_modules") continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) sourceFiles(p, out);
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}
