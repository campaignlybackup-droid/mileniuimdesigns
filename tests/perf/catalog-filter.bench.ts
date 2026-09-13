import { beforeAll, describe, expect, it } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { db } from "@/lib/db/client";
import { getFacetCounts, listFilteredProducts, type FacetScope } from "@/lib/catalog/facets";
import type { CatalogFilters } from "@/lib/catalog/filters";
import {
  PERF_ATTR_12,
  PERF_CATEGORY_SLUG,
  PERF_PRODUCTS,
  seedPerfCatalog,
  vacuumPerfTables,
} from "../../prisma/fixtures/perf-catalog";

/**
 * The catalogue filter budgets — 09 §2.10, and P09 exit criterion (a).
 *
 * TWO NAMED CASES with DIFFERENT budgets, which is the whole reason they are named:
 *
 *   single-attribute  p95 < 120 ms   one `select` attribute of 12 options over 5,000 products
 *   three-filter-PLP  p95 < 200 ms   stone + material + attribute over the same fixture
 *
 * An earlier draft of the plan gave this one file both thresholds with no case names. A bench
 * with two thresholds has none: whichever is written first becomes the only one, and the other
 * silently stops being a gate.
 *
 * Each case is checked twice — against its absolute budget, and against the committed baseline
 * plus 25%. The baseline catches the regression that stays inside budget, which is the one
 * nobody notices: 40 ms becoming 110 ms is a four-phase-old mistake that still passes.
 *
 * Refresh the baseline deliberately, never as a reflex:  UPDATE_PERF_BASELINE=1 npm run test:perf
 */

const BASELINE_PATH = resolve(process.cwd(), "tests/perf/baselines/catalog-filter.json");
const REGRESSION_ALLOWANCE = 1.25;
const ITERATIONS = 40;
const WARMUP = 8;

type Baseline = Record<string, { p95Ms: number }>;

const BUDGETS: Record<string, number> = {
  "single-attribute": 120,
  "three-filter-PLP": 200,
};

let scope: FacetScope;
let singleAttribute: CatalogFilters;
let threeFilter: CatalogFilters;
const measured: Baseline = {};

/** Two decimal places without `.toFixed()`, which is banned repo-wide — the ban is about
 *  money and these are milliseconds, but a blanket rule with named exemptions is the shape
 *  this codebase chose, and "it is not really money" is what every exemption says. */
function round2(ms: number): number {
  return Math.round(ms * 100) / 100;
}

function p95(samples: number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  // Nearest-rank. With 40 samples this is the 38th, so one outlier cannot set the number.
  return sorted[Math.min(sorted.length - 1, Math.ceil(0.95 * sorted.length) - 1)]!;
}

async function measure(run: () => Promise<unknown>): Promise<number> {
  for (let i = 0; i < WARMUP; i++) await run();
  const samples: number[] = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const t = performance.now();
    await run();
    samples.push(performance.now() - t);
  }
  return p95(samples);
}

beforeAll(async () => {
  const { products } = await seedPerfCatalog(db);
  // The local `prisma dev` server runs no autovacuum, so dead tuples from every test that
  // touched these tables since the fixture was built are still in the heap and every
  // full-table pass walks them. Without this, `facet-counts` climbed 33 → 70 → 121 ms over
  // three consecutive runs and the committed baseline measured test history, not the query.
  await vacuumPerfTables(db);
  // An assertion whose subject can be absent passes for the wrong reason. A budget met
  // against an empty table is met by nothing at all.
  expect(products).toBe(PERF_PRODUCTS);

  const cat = await db.$queryRaw<{ id: string }[]>`
    SELECT id::text AS id FROM categories WHERE slug = ${PERF_CATEGORY_SLUG}
  `;
  scope = { kind: "category", id: cat[0]!.id };

  const scoped = await db.$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS n FROM product_categories WHERE category_id = ${cat[0]!.id}::uuid
  `;
  expect(scoped[0]!.n).toBe(PERF_PRODUCTS);

  const attr = await db.$queryRaw<{ attribute_id: string; option_id: string }[]>`
    SELECT a.id::text AS attribute_id, o.id::text AS option_id
    FROM attributes a JOIN attribute_options o ON o.attribute_id = a.id
    WHERE a.key = ${PERF_ATTR_12} ORDER BY o.rank LIMIT 1
  `;
  const stone = await db.$queryRaw<{ id: string }[]>`
    SELECT id::text AS id FROM stones WHERE deleted_at IS NULL ORDER BY rank LIMIT 1
  `;
  const material = await db.$queryRaw<{ id: string }[]>`
    SELECT id::text AS id FROM materials WHERE deleted_at IS NULL ORDER BY rank LIMIT 1
  `;

  singleAttribute = {
    stoneIds: [],
    materialIds: [],
    attributes: [
      {
        attributeId: attr[0]!.attribute_id,
        key: PERF_ATTR_12,
        optionIds: [attr[0]!.option_id],
      },
    ],
  };
  threeFilter = {
    stoneIds: [stone[0]!.id],
    materialIds: [material[0]!.id],
    attributes: singleAttribute.attributes,
  };
}, 120_000);

describe("catalog-filter", () => {
  it("single-attribute", async () => {
    // The filter must actually select a subset. A predicate that matches everything, or
    // nothing, is fast for a reason that has nothing to do with the index under test.
    const rows = await listFilteredProducts({
      scope,
      marketCode: "US",
      filters: singleAttribute,
      limit: 100,
    });
    expect(rows.length).toBe(100);

    const ms = await measure(() =>
      listFilteredProducts({ scope, marketCode: "US", filters: singleAttribute, limit: 24 }),
    );
    measured["single-attribute"] = { p95Ms: round2(ms) };
    expect(ms).toBeLessThan(BUDGETS["single-attribute"]!);
  }, 120_000);

  it("uses idx_pav_filter rather than merely being fast", async () => {
    // 5,000 rows is small enough that a sequential scan also comes in under 120 ms, so the
    // budget passing is not evidence the index is doing anything. Drop `idx_pav_filter` and
    // every timing assertion in this file still passes — until the catalogue reaches the size
    // at which it does not, which is production. The plan is the thing that actually carries
    // the claim, so the plan is what gets asserted.
    const attributeId = singleAttribute.attributes[0]!.attributeId;
    const optionId = singleAttribute.attributes[0]!.optionIds[0]!;
    const plan = await db.$queryRaw<Record<string, string>[]>`
      EXPLAIN (FORMAT TEXT)
      SELECT 1 FROM product_attribute_values pav
      WHERE pav.attribute_id = ${attributeId}::uuid
        AND pav.option_id = ANY(ARRAY[${optionId}]::uuid[])
    `;
    const text = plan.map((r) => Object.values(r).join(" ")).join("\n");
    expect(text, text).toContain("idx_pav_filter");
  }, 120_000);

  it("pagination-is-flat", async () => {
    // NOT a deep scan — the opposite, and that is the point. Keyset pagination means a late
    // page costs what the first page costs, because `(rank, id) > cursor` is a seek and not a
    // skip. Under OFFSET this number would grow with the page number until page 40 of a
    // category timed out, and it would do so without any single commit looking like the cause.
    // So the assertion is a RATIO, not a budget: the last page must not cost materially more
    // than the first.
    //
    // The full 5,000-row pass is measured separately by `facet-counts`, which cannot
    // short-circuit because an aggregate has to see every row.
    const last = await db.$queryRaw<{ rank: number }[]>`
      SELECT max(rank)::int AS rank FROM products WHERE slug LIKE 'zz-perf-fixture-%'
    `;
    const cursor = {
      rank: Number(last[0]!.rank) - 1,
      id: "00000000-0000-0000-0000-000000000000",
    };

    const first = await measure(() =>
      listFilteredProducts({ scope, marketCode: "US", filters: singleAttribute, limit: 24 }),
    );
    const deep = await measure(() =>
      listFilteredProducts({
        scope,
        marketCode: "US",
        filters: singleAttribute,
        limit: 24,
        cursor,
      }),
    );
    measured["pagination-last-page"] = { p95Ms: round2(deep) };

    expect(
      deep,
      `last page ${String(round2(deep))}ms against first page ${String(round2(first))}ms`,
    ).toBeLessThan(first * 2 + 5);
  }, 120_000);

  it("three-filter-PLP", async () => {
    // Three predicates over one deterministic fixture intersect on i ≡ 0 (mod 420), so this
    // set is SMALL. Asserting it is neither empty nor the whole catalogue is the difference
    // between measuring three filters and measuring a predicate that matches nothing — which
    // would be gloriously fast and would prove nothing at all.
    const rows = await listFilteredProducts({
      scope,
      marketCode: "US",
      filters: threeFilter,
      limit: 100,
    });
    const single = await listFilteredProducts({
      scope,
      marketCode: "US",
      filters: singleAttribute,
      limit: 100,
    });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThan(single.length);

    const ms = await measure(() =>
      listFilteredProducts({ scope, marketCode: "US", filters: threeFilter, limit: 24 }),
    );
    measured["three-filter-PLP"] = { p95Ms: round2(ms) };
    expect(ms).toBeLessThan(BUDGETS["three-filter-PLP"]!);
  }, 120_000);

  it("facet-counts", async () => {
    // Not one of the two budgeted cases, but the statement that runs BESIDE them on every
    // filtered page. Tracked against the baseline so it cannot regress unwatched.
    const ms = await measure(() =>
      getFacetCounts({ scope, marketCode: "US", filters: singleAttribute }),
    );
    measured["facet-counts"] = { p95Ms: round2(ms) };
  }, 120_000);

  it("holds against the committed baseline", () => {
    const updating = process.env["UPDATE_PERF_BASELINE"] === "1";
    if (updating) {
      writeFileSync(BASELINE_PATH, JSON.stringify(measured, null, 2) + "\n");
      console.log(`baseline written: ${JSON.stringify(measured)}`);
      return;
    }
    expect(
      existsSync(BASELINE_PATH),
      "no committed baseline — run with UPDATE_PERF_BASELINE=1",
    ).toBe(true);
    const baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as Baseline;

    // Every measured case must be in the baseline and vice versa: a case added without a
    // baseline entry, or removed while its entry lingers, are both ways a budget stops being
    // enforced while the file still looks like it enforces one.
    expect(Object.keys(measured).sort()).toEqual(Object.keys(baseline).sort());

    for (const [name, { p95Ms }] of Object.entries(measured)) {
      const ceiling = baseline[name]!.p95Ms * REGRESSION_ALLOWANCE;
      expect(
        p95Ms,
        `${name}: ${String(p95Ms)}ms against a ${String(baseline[name]!.p95Ms)}ms baseline`,
      ).toBeLessThan(Math.max(ceiling, 5));
    }
  });
});
