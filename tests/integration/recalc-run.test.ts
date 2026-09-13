import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { db } from "@/lib/db/client";
import {
  applyRecalcRun,
  approveRecalcRun,
  createRecalcPreview,
  runRecalcApply,
} from "@/lib/pricing";
import { recordMetalRate } from "@/lib/pricing/rates";
import { setManualPrice } from "@/lib/pricing/manual";
import { permissionsForRoles, type StaffActor } from "@/lib/rbac";
import { ConflictError, ForbiddenError } from "@/lib/errors";

/**
 * Commissioned by 09 P12 exit criteria (b)–(e) and 04 §3.3.
 *
 * The state machine is `previewing → pending_approval → approved → applying → applied`, and
 * **every edge that skips a state is unrepresentable rather than merely untested**:
 * `chk_recalc_approved` refuses an approver-less `approved`, and `applyRecalcRun` enqueues a
 * job instead of writing prices.
 */

const stamp = Date.now();
const prefix = `zz-p12c-${String(stamp)}`;
/**
 * A REAL `users` row, not a fabricated uuid.
 *
 * `jobs.created_by_user_id` has a foreign key to `users`, and that key is load-bearing:
 * `recalc_apply` is `systemPermitted: false`, so the queue refuses a job with no human behind
 * it, and the FK refuses one whose human does not exist. A test using an invented id would
 * have been asserting against a path production cannot take.
 */
let ownerUserId = "";
const actorWith = (roles: string[]): StaffActor => ({
  kind: "staff",
  userId: ownerUserId,
  roles: roles as StaffActor["roles"],
  permissions: permissionsForRoles(roles as StaffActor["roles"]),
  totpVerifiedAt: new Date(),
});
let owner: StaffActor;
/** Holds price.update but NOT price.approve_recalc (11 §1.4). */
let merchandiser: StaffActor;

let productId = "";
let variantId = "";
let materialId = "";
let market = { code: "US", currency: "USD" };
const at = new Date();

beforeAll(async () => {
  const u = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO users (id, email, password_hash, first_name, last_name, is_active,
                       totp_recovery_codes, password_changed_at, created_at, updated_at)
    VALUES (gen_random_uuid(), ${`${prefix}@example.invalid`}, 'x', 'ZZ', 'P12C', true,
            ARRAY[]::text[], now(), now(), now())
    RETURNING id::text AS id
  `;
  ownerUserId = u[0]!.id;
  owner = actorWith(["owner"]);
  merchandiser = actorWith(["catalog_manager"]);

  const m = await db.$queryRaw<{ code: string; currency_code: string }[]>`
    SELECT code, currency_code FROM markets WHERE is_active ORDER BY rank LIMIT 1
  `;
  market = { code: m[0]!.code, currency: m[0]!.currency_code };

  const mat = await db.$queryRaw<{ id: string }[]>`
    SELECT id::text AS id FROM materials WHERE is_rate_linked AND deleted_at IS NULL
    ORDER BY rank LIMIT 1
  `;
  materialId = mat[0]!.id;

  const p = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO products (id, slug, title, status, published_at, rank, search_text, version,
                          created_at, updated_at)
    VALUES (gen_random_uuid(), ${prefix}, 'ZZ P12C', 'active', now() - interval '1 hour', 0, '',
            1, now(), now())
    RETURNING id::text AS id
  `;
  productId = p[0]!.id;

  const v = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO product_variants (id, product_id, sku, position, inventory_policy,
                                  option_signature, is_active, version, created_at, updated_at)
    VALUES (gen_random_uuid(), ${productId}::uuid, 'MD-ZZC-ZZC-C001-NA', 0, 'tracked', '',
            true, 1, now(), now())
    RETURNING id::text AS id
  `;
  variantId = v[0]!.id;
  await db.$executeRaw`
    INSERT INTO variant_materials (variant_id, material_id, weight_grams, is_primary, created_at)
    VALUES (${variantId}::uuid, ${materialId}::uuid, 6.400, true, now())
  `;

  const f = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO pricing_formulas (id, name, slug, is_active, version, created_at, updated_at)
    VALUES (gen_random_uuid(), 'ZZ P12C', ${`${prefix}-f`}, true, 1, now(), now())
    RETURNING id::text AS id
  `;
  const fv = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO pricing_formula_versions (id, formula_id, version_no, material_id, purity_source,
                                          weight_source, making_charge_mode, making_charge_bp,
                                          include_stone_cost, include_other_material_cost,
                                          markup_mode, markup_bp, created_at)
    VALUES (gen_random_uuid(), ${f[0]!.id}::uuid, 1, ${materialId}::uuid, 'material',
            'variant_primary', 'percent_of_metal', 15000, true, true,
            'percent_of_subtotal', 12000, now())
    RETURNING id::text AS id
  `;
  await db.$executeRaw`
    UPDATE pricing_formulas SET published_version_id = ${fv[0]!.id}::uuid WHERE id = ${f[0]!.id}::uuid`;
  await db.$executeRaw`
    INSERT INTO pricing_formula_market_terms (formula_version_id, market_code, currency_code,
                                              rounding_increment_minor, rounding_mode, created_at)
    VALUES (${fv[0]!.id}::uuid, ${market.code}, ${market.currency}, 100, 'half_up', now())`;
  await db.$executeRaw`
    INSERT INTO price_formula_bindings (id, product_id, variant_id, market_code, currency_code,
                                        formula_id, mode, is_active, version, created_at, updated_at)
    VALUES (gen_random_uuid(), ${productId}::uuid, ${variantId}::uuid, ${market.code},
            ${market.currency}, ${f[0]!.id}::uuid, 'metal_linked', true, 1, now(), now())`;

  await recordMetalRate(owner, {
    materialId,
    currencyCode: market.currency,
    rateMinorPerGram: 1_050_000n,
    rateScale: 4,
    effectiveAt: at,
    source: "zz-p12c",
  });

  // The §9.1 component costs, so the pipeline reproduces §9.3's figures end to end rather
  // than a simpler sum that happens to be internally consistent.
  await db.$executeRaw`
    INSERT INTO variant_component_costs (variant_id, currency_code, component_kind, amount_minor,
                                         created_at, updated_at)
    VALUES (${variantId}::uuid, ${market.currency}, 'stone', 4500, now(), now()),
           (${variantId}::uuid, ${market.currency}, 'other_material', 1200, now(), now())
  `;
});

afterAll(async () => {
  await db.$executeRaw`DELETE FROM recalc_run_lines WHERE recalc_run_id IN (SELECT id FROM recalc_runs WHERE note = ${prefix})`;
  await db.$executeRaw`DELETE FROM price_history WHERE product_id = ${productId}::uuid`;
  await db.$executeRaw`UPDATE prices SET recalc_run_id = NULL WHERE product_id = ${productId}::uuid`;
  await db.$executeRaw`DELETE FROM recalc_runs WHERE note = ${prefix}`;
  await db.$executeRaw`DELETE FROM jobs WHERE kind = 'recalc_apply'`;
  await db.$executeRaw`DELETE FROM variant_component_costs WHERE variant_id = ${variantId}::uuid`;
  await db.$executeRaw`DELETE FROM price_formula_bindings WHERE product_id = ${productId}::uuid`;
  await db.$executeRaw`DELETE FROM prices WHERE product_id = ${productId}::uuid`;
  await db.$executeRaw`DELETE FROM products WHERE slug = ${prefix}`;
  await db.$executeRaw`DELETE FROM metal_rates WHERE source = 'zz-p12c'`;
  await db.$executeRaw`DELETE FROM jobs WHERE created_by_user_id = ${ownerUserId}::uuid`;
  await db.$executeRaw`DELETE FROM users WHERE email = ${`${prefix}@example.invalid`}`;
  await db.$executeRaw`
    DELETE FROM pricing_formula_market_terms WHERE formula_version_id IN (
      SELECT v.id FROM pricing_formula_versions v JOIN pricing_formulas f ON f.id = v.formula_id
      WHERE f.slug = ${`${prefix}-f`})`;
  await db.$executeRaw`UPDATE pricing_formulas SET published_version_id = NULL WHERE slug = ${`${prefix}-f`}`;
  await db.$executeRaw`DELETE FROM pricing_formula_versions WHERE formula_id IN (SELECT id FROM pricing_formulas WHERE slug = ${`${prefix}-f`})`;
  await db.$executeRaw`DELETE FROM pricing_formulas WHERE slug = ${`${prefix}-f`}`;
});

describe("the preview computes but changes nothing", () => {
  let runId = "";

  it("produces a pending_approval run with one proposed line", async () => {
    const before = await db.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM prices WHERE product_id = ${productId}::uuid`;

    const result = await createRecalcPreview(
      merchandiser,
      { marketCodes: [market.code] },
      { at, note: prefix },
    );
    runId = result.runId;
    expect(result.lineCount).toBe(1);
    expect(result.skippedCount).toBe(0);

    const run = await db.$queryRaw<{ status: string }[]>`
      SELECT status::text AS status FROM recalc_runs WHERE id = ${runId}::uuid`;
    expect(run[0]!.status).toBe("pending_approval");

    // A preview writes NO prices. The whole review step is worthless if building it already
    // changed the thing under review.
    const after = await db.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM prices WHERE product_id = ${productId}::uuid`;
    expect(after[0]!.n).toBe(before[0]!.n);
  });

  it("carries the whole computation on the line, so the apply needs no arithmetic", async () => {
    const line = await db.$queryRaw<Record<string, unknown>[]>`
      SELECT * FROM recalc_run_lines WHERE recalc_run_id = ${runId}::uuid`;
    const l = line[0]!;
    // The §9.3 figures, arrived at through the whole pipeline rather than by calling
    // evaluateFormula directly.
    expect(BigInt(l["proposed_list_minor"] as bigint)).toBe(16_000n);
    expect(BigInt(l["proposed_metal_component_minor"] as bigint)).toBe(622n);
    expect(BigInt(l["proposed_making_charge_computed_minor"] as bigint)).toBe(932n);
    expect(BigInt(l["proposed_markup_minor"] as bigint)).toBe(8705n);
    expect(BigInt(l["proposed_rounding_adjustment_minor"] as bigint)).toBe(41n);
    expect(l["formula_version_id"]).not.toBeNull();
    expect(l["metal_rate_id"]).not.toBeNull();
  });

  it("(d) refuses approval without the approve permission", async () => {
    // price.update is not price.approve_recalc. The merchandiser who built the preview is
    // deliberately not the person who can ship it.
    await expect(approveRecalcRun(merchandiser, runId)).rejects.toThrow(ForbiddenError);
  });

  it("(c) applying enqueues a job and writes no price", async () => {
    await approveRecalcRun(owner, runId);

    const pricesBefore = await db.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM prices WHERE product_id = ${productId}::uuid`;
    const { jobId } = await applyRecalcRun(owner, runId);
    const pricesAfter = await db.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM prices WHERE product_id = ${productId}::uuid`;

    // THE assertion of criterion (c). With no worker, "enqueue" degrades to "apply inline,
    // just for now" — and applying inline means a request timeout mid-run leaves half a
    // catalogue repriced with no record of where it stopped.
    expect(pricesAfter[0]!.n).toBe(pricesBefore[0]!.n);

    const job = await db.$queryRaw<
      { kind: string; status: string; created_by_user_id: string | null }[]
    >`
      SELECT kind::text AS kind, status::text AS status,
             created_by_user_id::text AS created_by_user_id
        FROM jobs WHERE id = ${jobId}::uuid`;
    expect(job[0]!.kind).toBe("recalc_apply");
    // A human-originated kind carries the human. `recalc_apply` is systemPermitted: false,
    // so a cron cannot enqueue one at all (11 §3.3).
    expect(job[0]!.created_by_user_id).toBe(owner.userId);

    const run = await db.$queryRaw<{ status: string }[]>`
      SELECT status::text AS status FROM recalc_runs WHERE id = ${runId}::uuid`;
    expect(run[0]!.status).toBe("applying");
  });

  it("(d) the applied run has a named approver", async () => {
    const result = await runRecalcApply(runId);
    expect(result.applied).toBe(1);

    const run = await db.$queryRaw<{ status: string; approved_by_user_id: string | null }[]>`
      SELECT status::text AS status, approved_by_user_id::text AS approved_by_user_id
        FROM recalc_runs WHERE id = ${runId}::uuid`;
    expect(run[0]!.status).toBe("applied");
    expect(run[0]!.approved_by_user_id).toBe(owner.userId);
  });

  it("wrote exactly the numbers the preview proposed — no re-evaluation", async () => {
    const price = await db.$queryRaw<Record<string, unknown>[]>`
      SELECT * FROM prices WHERE product_id = ${productId}::uuid
        AND valid_to IS NULL AND deleted_at IS NULL`;
    const p = price[0]!;
    expect(BigInt(p["list_minor"] as bigint)).toBe(16_000n);
    expect(BigInt(p["metal_component_minor"] as bigint)).toBe(622n);
    expect(BigInt(p["computed_base_minor"] as bigint)).toBe(15_959n);
    expect(p["price_source"]).toBe("metal_linked");
    expect(p["recalc_run_id"]).not.toBeNull();
    // chk_prices_components_sum and chk_prices_list_identity both accepted the row, which is
    // the database agreeing that the arithmetic adds up.
  });

  it("wrote a price_history row naming the run", async () => {
    const h = await db.$queryRaw<{ reason: string; recalc_run_id: string | null }[]>`
      SELECT reason::text AS reason, recalc_run_id::text AS recalc_run_id
        FROM price_history WHERE product_id = ${productId}::uuid ORDER BY created_at DESC LIMIT 1`;
    // R03's early-warning sign is a price_history row whose reason is a rate change and whose
    // recalc_run_id is NULL. This is the shape that is legitimate.
    expect(h[0]!.reason).toBe("recalc_run");
    expect(h[0]!.recalc_run_id).not.toBeNull();
  });
});

describe("(e) a manual price wins and is not overwritten", () => {
  it("is excluded from the preview and survives an applied run", async () => {
    // Set a manual price over the formula-priced variant. The binding is deactivated first,
    // because setManualPrice refuses a bound variant — that refusal is itself the feature
    // (04 §2.2), and the admin's two legal moves are unbind or override-as-hybrid.
    await db.$executeRaw`
      UPDATE price_formula_bindings SET is_active = false WHERE variant_id = ${variantId}::uuid`;
    const current = await db.$queryRaw<{ id: string }[]>`
      SELECT id::text AS id FROM prices WHERE variant_id = ${variantId}::uuid
        AND valid_to IS NULL AND deleted_at IS NULL`;
    await setManualPrice(owner, {
      productId,
      variantId,
      marketCode: market.code,
      listMinor: 18_900n,
      saleMinor: null,
      compareAtMinor: null,
      costMinor: null,
      expectedPriceId: current[0]!.id,
      reason: "manual_edit",
    });
    await db.$executeRaw`
      UPDATE price_formula_bindings SET is_active = true WHERE variant_id = ${variantId}::uuid`;

    // The enumeration excludes manually-overridden rows by default — belt and braces over the
    // mutual-exclusion rule, so a row that reached that state through a migration or a repair
    // script is still not silently repriced.
    const preview = await createRecalcPreview(
      owner,
      { marketCodes: [market.code] },
      { at, note: prefix },
    );
    expect(preview.lineCount).toBe(0);

    const price = await db.$queryRaw<{ list_minor: bigint; price_source: string }[]>`
      SELECT list_minor, price_source::text AS price_source FROM prices
       WHERE variant_id = ${variantId}::uuid AND valid_to IS NULL AND deleted_at IS NULL`;
    expect(BigInt(price[0]!.list_minor)).toBe(18_900n);
    expect(price[0]!.price_source).toBe("manual");
  });

  it("is included only when the admin asks, which is a logged choice", async () => {
    const preview = await createRecalcPreview(
      owner,
      { marketCodes: [market.code], includeManuallyOverridden: true },
      { at, note: prefix },
    );
    expect(preview.lineCount).toBe(1);
  });
});

describe("(b) a market with no fresh rate is skipped, never estimated", () => {
  it("writes a skipped line with a reason", async () => {
    // Every rate for this material is now older than the ceiling.
    const preview = await createRecalcPreview(
      owner,
      { marketCodes: [market.code], includeManuallyOverridden: true },
      {
        at: new Date(at.getTime() + 1000 * 60 * 60 * 24 * 30),
        rateMaxAgeHours: 1,
        note: prefix,
      },
    );
    expect(preview.skippedCount).toBe(1);

    const line = await db.$queryRaw<
      { status: string; skip_reason: string; proposed_list_minor: bigint | null }[]
    >`
      SELECT l.status, l.skip_reason, l.proposed_list_minor FROM recalc_run_lines l
       JOIN recalc_runs r ON r.id = l.recalc_run_id
       WHERE r.id = ${preview.runId}::uuid`;
    expect(line[0]!.status).toBe("skipped");
    expect(line[0]!.skip_reason).toMatch(/hours old/);
    // chk_rrl_proposed: a skipped line has NO proposal, so there is nothing for the apply to
    // insert for a line the reviewer was told was skipped.
    expect(line[0]!.proposed_list_minor).toBeNull();
  });

  it("refuses to apply a run that was never approved", async () => {
    const preview = await createRecalcPreview(
      owner,
      { marketCodes: [market.code], includeManuallyOverridden: true },
      { at, note: prefix },
    );
    await expect(applyRecalcRun(owner, preview.runId)).rejects.toThrow(ConflictError);
  });
});

describe("the apply performs no arithmetic", () => {
  it("contains no evaluateFormula call and no formula import", () => {
    // 04 §3.3: if the apply re-evaluates, a stone cost edited at 4 p.m. changes what ships at
    // 2 a.m. while the run screen still shows the approved figures — so the discrepancy is
    // invisible in the one place anyone would look.
    const src = readFileSync("src/lib/pricing/recalc.ts", "utf8");
    const applyFn = src.slice(src.indexOf("export async function runRecalcApply"));
    expect(applyFn).not.toContain("evaluateFormula");
    expect(applyFn).not.toMatch(/applyBp|roundToIncrement/);
  });
});
