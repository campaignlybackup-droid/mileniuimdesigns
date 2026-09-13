/**
 * Shared page and listing types — 09 P04.
 *
 * Every `list*` function returns this shape. Keyset pagination, not offset: an offset
 * scan degrades linearly and, worse, silently skips or repeats rows when the underlying
 * set changes between pages — which it does constantly on an admin order list.
 */
export type Cursor = string;

export interface Page<T> {
  readonly items: readonly T[];
  /** Pass back as `cursor` to get the next page. `null` means this is the last page. */
  readonly nextCursor: Cursor | null;
  /**
   * Deliberately optional. A total requires a COUNT over the full filtered set, which is
   * the expensive half of most list queries — so a caller that does not render a total
   * does not pay for one (08 §2.3).
   */
  readonly totalCount?: number;
}

export interface PageRequest {
  readonly limit?: number;
  readonly cursor?: Cursor | null;
}

/** Bounded work: no `list*` function may return an unbounded set (01 §2.7). */
export const DEFAULT_PAGE_SIZE = 24;
export const MAX_PAGE_SIZE = 100;

export function clampLimit(limit: number | undefined): number {
  if (!limit || !Number.isFinite(limit) || limit < 1) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.floor(limit), MAX_PAGE_SIZE);
}
