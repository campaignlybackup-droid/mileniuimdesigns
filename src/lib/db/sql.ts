import "server-only";
import { Prisma } from "@/generated/prisma/client";

/**
 * Composable SQL fragments — the ONE place the Prisma tag is re-exported.
 *
 * 03 §3.5 and §3.6 specify the filter predicate as an `EXISTS` appended to an existing
 * listing query, and 03 §3.5 specifies the facet counts as ONE statement whose per-dimension
 * `WHERE` differs from the listing's by exactly one clause. Neither is expressible through
 * the Prisma query builder: the first needs a fragment a caller can append, the second needs
 * the SAME fragment reused with one clause omitted. Written as two strings they drift, and a
 * facet count that no longer counts the set the listing returns is a number the shopper is
 * shown that is simply wrong.
 *
 * `src/lib/db/**` is the only layer allowed to import the generated client (01 §2.2), so the
 * tag is re-exported here rather than importing `Prisma` in `src/lib/catalog/**`. Values
 * interpolated into `sql` are PARAMETERS, never text — which is the property that makes a
 * user-supplied facet value safe to pass straight in.
 */
export type Sql = Prisma.Sql;

export const sql = Prisma.sql;
export const join = Prisma.join;
export const empty = Prisma.empty;

/**
 * Interpolates its argument into the statement VERBATIM, with no escaping and no parameter
 * binding. Named for what it is so that every call site reads as a decision. The only
 * permitted arguments are literals this codebase wrote; never a value that reached us from a
 * request, a database row or a file.
 */
export const unsafeRaw = Prisma.raw;
