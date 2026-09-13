import "server-only";
import { withTransaction, type Tx } from "@/lib/db/transaction";
import { db } from "@/lib/db/client";
import { enqueue } from "@/lib/jobs";
import { requirePermission, type Actor } from "@/lib/rbac";
import { ConflictError, TooManyLinesError, ValidationError } from "@/lib/errors";
import { evaluateFormula, type FormulaInputs } from "@/lib/pricing/formula";
import { getLatestRates } from "@/lib/pricing/rates";

/**
 * Recalculation runs — 04 §3.3. `previewing → pending_approval → approved → applying → applied`.
 *
 * **There is no edge from a metal-rate write to `applied`.** The cron that refreshes rates can
 * produce a preview and nothing else; `chk_recalc_approved` makes every state beyond
 * `pending_approval` require a named approver; and `applyRecalcRun` ENQUEUES a job rather than
 * applying inline. That last one is why P04A exists: with no worker, "enqueue" degrades to
 * "apply inline, just for now", and that is the hard-rule-6 violation R03 is about.
 *
 * **The apply performs no arithmetic.** It inserts the columns the preview already computed.
 * If it re-evaluated, a stone cost edited at 4 p.m. or a formula version published at 6 p.m.
 * would change what ships at 2 a.m. — while the run detail screen still showed the figures
 * that were approved, making the discrepancy invisible in the one place anyone would look.
 */

export const MAX_LINES = 20_000;
export const DEFAULT_RATE_MAX_AGE_HOURS = 48;

export type RecalcScope = {
  marketCodes?: string[] | null;
  materialId?: string | null;
  productIds?: string[] | null;
  categoryIds?: string[] | null;
  collectionIds?: string[] | null;
  includeManuallyOverridden?: boolean;
};

type BindingRow = {
  variant_id: string;
  product_id: string;
  market_code: string;
  currency_code: string;
  formula_id: string;
  formula_version_id: string | null;
  mode: string;
  current_price_id: string | null;
  current_list_minor: bigint | null;
  sale_minor: bigint | null;
  compare_at_minor: bigint | null;
  cost_minor: bigint | null;
  price_source: string | null;
  hybrid_adjustment_type: string | null;
  hybrid_adjustment_bp: number | null;
  hybrid_adjustment_delta_minor: bigint | null;
  hybrid_override_minor: bigint | null;
};

/**
 * Step 1 — enumerate. `NULL` means "all", and is spelled that way in the predicate it guards:
 * a `materialId` of NULL compared with `=` matches nothing, and a preview of zero lines over
 * the whole catalogue reads exactly like a preview with nothing to change.
 *
 * `f.published_version_id` is selected HERE, once, so publishing a new version mid-review
 * cannot change what the approver approved.
 */
async function enumerateBindings(tx: Tx, scope: RecalcScope): Promise<BindingRow[]> {
  return tx.$queryRaw<BindingRow[]>`
    SELECT b.variant_id::text AS variant_id, b.product_id::text AS product_id,
           b.market_code, b.currency_code, b.formula_id::text AS formula_id,
           f.published_version_id::text AS formula_version_id, b.mode,
           b.hybrid_adjustment_type, b.hybrid_adjustment_bp,
           b.hybrid_adjustment_delta_minor, b.hybrid_override_minor,
           p.id::text AS current_price_id, p.list_minor AS current_list_minor,
           p.sale_minor, p.compare_at_minor, p.cost_minor, p.price_source::text AS price_source
    FROM price_formula_bindings b
    JOIN product_variants v ON v.id = b.variant_id AND v.deleted_at IS NULL AND v.is_active
    JOIN products pr        ON pr.id = b.product_id AND pr.deleted_at IS NULL
    JOIN pricing_formulas f ON f.id = b.formula_id AND f.is_active AND f.deleted_at IS NULL
    JOIN markets m          ON m.code = b.market_code AND m.is_active
    LEFT JOIN prices p ON p.variant_id = b.variant_id AND p.market_code = b.market_code
                      AND p.valid_to IS NULL AND p.deleted_at IS NULL
    WHERE b.is_active
      AND (${scope.marketCodes ?? null}::text[] IS NULL OR b.market_code = ANY(${scope.marketCodes ?? null}::text[]))
      AND (${scope.materialId ?? null}::uuid IS NULL OR EXISTS (
            SELECT 1 FROM pricing_formula_versions pfv
             WHERE pfv.id = f.published_version_id
               AND coalesce(pfv.material_id,
                            (SELECT vm.material_id FROM variant_materials vm
                              WHERE vm.variant_id = v.id AND vm.is_primary)) = ${scope.materialId ?? null}::uuid))
      AND (${scope.productIds ?? null}::uuid[] IS NULL OR b.product_id = ANY(${scope.productIds ?? null}::uuid[]))
      AND (${scope.categoryIds ?? null}::uuid[] IS NULL OR EXISTS (
            SELECT 1 FROM product_categories pc
             WHERE pc.product_id = b.product_id AND pc.category_id = ANY(${scope.categoryIds ?? null}::uuid[])))
      AND (${scope.collectionIds ?? null}::uuid[] IS NULL OR EXISTS (
            SELECT 1 FROM product_collections pcol
             WHERE pcol.product_id = b.product_id AND pcol.collection_id = ANY(${scope.collectionIds ?? null}::uuid[])))
      AND (${scope.includeManuallyOverridden ?? false} OR p.price_source IS NULL OR p.price_source <> 'manual')
    ORDER BY b.variant_id, b.market_code
  `;
}

type Inputs = {
  terms: Map<string, Record<string, unknown>>;
  versions: Map<string, Record<string, unknown>>;
  weights: Map<string, { materialId: string; weightMilligrams: bigint; purityBp: number }>;
  costs: Map<string, { stone: bigint; other: bigint }>;
};

/** Step 1b — inputs in BULK. The naive shape is five queries per line; at 20,000 lines that
 *  is 100,000 round trips against a pool capped at ten, and the job does not finish. */
async function loadInputs(tx: Tx, rows: BindingRow[]): Promise<Inputs> {
  const versionIds = [
    ...new Set(rows.map((r) => r.formula_version_id).filter((v): v is string => v !== null)),
  ];
  const variantIds = [...new Set(rows.map((r) => r.variant_id))];
  const currencies = [...new Set(rows.map((r) => r.currency_code))];

  const [versions, terms, weights, costs] = await Promise.all([
    tx.$queryRaw<Record<string, unknown>[]>`
      SELECT * FROM pricing_formula_versions WHERE id = ANY(${versionIds}::uuid[])`,
    tx.$queryRaw<Record<string, unknown>[]>`
      SELECT * FROM pricing_formula_market_terms WHERE formula_version_id = ANY(${versionIds}::uuid[])`,
    tx.$queryRaw<Record<string, unknown>[]>`
      SELECT vm.variant_id::text AS variant_id, vm.material_id::text AS material_id,
             vm.weight_grams, m.purity_ratio
        FROM variant_materials vm JOIN materials m ON m.id = vm.material_id
       WHERE vm.variant_id = ANY(${variantIds}::uuid[]) AND vm.is_primary`,
    tx.$queryRaw<Record<string, unknown>[]>`
      SELECT variant_id::text AS variant_id, currency_code, component_kind, amount_minor
        FROM variant_component_costs
       WHERE variant_id = ANY(${variantIds}::uuid[]) AND currency_code = ANY(${currencies}::text[])`,
  ]);

  const costMap = new Map<string, { stone: bigint; other: bigint }>();
  for (const c of costs) {
    const key = `${String(c["variant_id"])}:${String(c["currency_code"])}`;
    const entry = costMap.get(key) ?? { stone: 0n, other: 0n };
    const amount = BigInt(c["amount_minor"] as bigint);
    // A MISSING row is zero, not an error — the one place in the schema where absence means
    // zero, and safe because zero is arithmetically correct for "this piece has no stones".
    if (c["component_kind"] === "stone") entry.stone += amount;
    else entry.other += amount;
    costMap.set(key, entry);
  }

  return {
    versions: new Map(versions.map((v) => [String(v["id"]), v])),
    terms: new Map(
      terms.map((t) => [`${String(t["formula_version_id"])}:${String(t["market_code"])}`, t]),
    ),
    weights: new Map(
      weights.map((w) => [
        String(w["variant_id"]),
        {
          materialId: String(w["material_id"]),
          weightMilligrams: BigInt(Math.round(Number(w["weight_grams"]) * 1000)),
          purityBp: Math.round(Number(w["purity_ratio"] ?? 1) * 10_000),
        },
      ]),
    ),
    costs: costMap,
  };
}

export type PreviewResult = {
  runId: string;
  lineCount: number;
  skippedCount: number;
  unchangedCount: number;
  blockedCount: number;
};

/** Step 1–3: enumerate, evaluate, write the preview. Never applies anything. */
export async function createRecalcPreview(
  actor: Actor,
  scope: RecalcScope,
  opts: { at: Date; rateMaxAgeHours?: number; note?: string },
): Promise<PreviewResult> {
  requirePermission(actor, "price.update");
  const maxAge = opts.rateMaxAgeHours ?? DEFAULT_RATE_MAX_AGE_HOURS;

  return withTransaction(async (tx) => {
    const rows = await enumerateBindings(tx, scope);
    if (rows.length > MAX_LINES) {
      throw new TooManyLinesError(
        `This scope covers ${String(rows.length)} lines, over the ${String(MAX_LINES)} limit. Narrow it by market, category or collection.`,
      );
    }

    const inputs = await loadInputs(tx, rows);
    const ratePairs = rows
      .map((r) => {
        const w = inputs.weights.get(r.variant_id);
        const version =
          r.formula_version_id === null ? undefined : inputs.versions.get(r.formula_version_id);
        const materialId = (version?.["material_id"] as string | null) ?? w?.materialId ?? null;
        return materialId === null ? null : { materialId, currencyCode: r.currency_code };
      })
      .filter((p): p is { materialId: string; currencyCode: string } => p !== null);
    const rates = await getLatestRates(tx, ratePairs, opts.at);

    // A run covers exactly one market or none: a run over two of three markets leaves
    // market_code NULL and both money totals 0, because one column means one number and one
    // number over two currencies is the addition this whole document exists to prevent.
    const marketsCovered = new Set(rows.map((r) => r.market_code));
    const singleMarket = marketsCovered.size === 1 ? [...marketsCovered][0]! : null;

    const runRows = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO recalc_runs (id, status, market_code, material_id, triggered_by,
                               created_by_user_id, line_count, skipped_count, failed_count,
                               unchanged_count, total_increase_minor, total_decrease_minor,
                               note, created_at, updated_at)
      VALUES (gen_random_uuid(), 'previewing', ${singleMarket}, ${scope.materialId ?? null}::uuid,
              ${actor.kind === "staff" ? "staff" : "system"}::actor_type,
              ${actor.kind === "staff" ? actor.userId : null}::uuid,
              0, 0, 0, 0, 0, 0, ${opts.note ?? null}, now(), now())
      RETURNING id::text AS id
    `;
    const runId = runRows[0]!.id;

    let lineCount = 0,
      skipped = 0,
      unchanged = 0,
      blocked = 0;
    let increase = 0n,
      decrease = 0n;

    for (const r of rows) {
      lineCount++;
      const line = evaluateLine(r, inputs, rates, maxAge);

      if (line.skipReason !== null) {
        skipped++;
        await tx.$executeRaw`
          INSERT INTO recalc_run_lines (id, recalc_run_id, variant_id, market_code, currency_code,
                                        current_price_id, current_list_minor, proposed_list_minor,
                                        status, skip_reason, created_at)
          VALUES (gen_random_uuid(), ${runId}::uuid, ${r.variant_id}::uuid, ${r.market_code},
                  ${r.currency_code}, ${r.current_price_id}::uuid, ${r.current_list_minor},
                  NULL, 'skipped', ${line.skipReason}, now())
        `;
        continue;
      }

      const proposed = line.result!.listMinor;
      const current = r.current_list_minor === null ? null : BigInt(r.current_list_minor);
      if (current !== null && proposed === current) unchanged++;
      if (current !== null && singleMarket !== null) {
        if (proposed > current) increase += proposed - current;
        else if (proposed < current) decrease += current - proposed;
      }

      // Sale, compare-at and cost are CARRIED FORWARD. The replacement is a new row, so
      // anything not copied is gone: dropping sale_minor ends a live campaign silently.
      const sale = r.sale_minor === null ? null : BigInt(r.sale_minor);
      const blockedReason =
        sale !== null && sale > proposed
          ? "Sale price now exceeds the proposed list price."
          : r.cost_minor !== null && proposed < BigInt(r.cost_minor)
            ? "Proposed price is below cost."
            : null;
      if (blockedReason !== null) blocked++;

      const changeBp =
        current === null || current === 0n
          ? null
          : Number(((proposed - current) * 10_000n) / current);

      await tx.$executeRaw`
        INSERT INTO recalc_run_lines (id, recalc_run_id, variant_id, market_code, currency_code,
                                      current_price_id, current_list_minor, proposed_list_minor,
                                      metal_rate_id, status, formula_version_id,
                                      proposed_purity_ratio_bp, proposed_metal_weight_grams,
                                      proposed_metal_component_minor,
                                      proposed_making_charge_computed_minor,
                                      proposed_stone_cost_minor, proposed_other_material_cost_minor,
                                      proposed_markup_minor, proposed_market_adjustment_delta_minor,
                                      proposed_floor_adjustment_minor,
                                      proposed_rounding_adjustment_minor,
                                      proposed_hybrid_adjustment_delta_minor,
                                      proposed_sale_minor, proposed_compare_at_minor,
                                      proposed_cost_minor, change_bp, blocked_reason, created_at)
        VALUES (gen_random_uuid(), ${runId}::uuid, ${r.variant_id}::uuid, ${r.market_code},
                ${r.currency_code}, ${r.current_price_id}::uuid, ${r.current_list_minor},
                ${proposed}, ${line.rateId}::uuid, 'proposed', ${r.formula_version_id}::uuid,
                ${line.purityBp}, ${line.weightGrams},
                ${line.result!.metalComponentMinor}, ${line.result!.makingChargeComputedMinor},
                ${line.result!.stoneCostMinor}, ${line.result!.otherMaterialCostMinor},
                ${line.result!.markupMinor}, ${line.result!.marketAdjustmentDeltaMinor},
                ${line.result!.floorAdjustmentMinor}, ${line.result!.roundingAdjustmentMinor},
                ${line.hybridDelta}, ${sale}, ${r.compare_at_minor}, ${r.cost_minor},
                ${changeBp}, ${blockedReason}, now())
      `;
    }

    await tx.$executeRaw`
      UPDATE recalc_runs
         SET status = 'pending_approval', line_count = ${lineCount}, skipped_count = ${skipped},
             unchanged_count = ${unchanged},
             total_increase_minor = ${increase}, total_decrease_minor = ${decrease},
             updated_at = now()
       WHERE id = ${runId}::uuid
    `;

    return {
      runId,
      lineCount,
      skippedCount: skipped,
      unchangedCount: unchanged,
      blockedCount: blocked,
    };
  });
}

type LineEvaluation = {
  skipReason: string | null;
  result: ReturnType<typeof evaluateFormula> | null;
  rateId: string | null;
  purityBp: number | null;
  weightGrams: string | null;
  hybridDelta: bigint | null;
};

/** Step 2 — evaluate one line against THAT MARKET'S currency. A missing or stale rate is a
 *  `skipped` line, never an estimate: a price computed from a rate nobody trusts is worse
 *  than no price. A run never blocks one market on another's missing rate. */
function evaluateLine(
  r: BindingRow,
  inputs: Inputs,
  rates: Map<
    string,
    { id: string; rateMinorPerGram: bigint; rateScale: number; ageHours: number }
  >,
  maxAgeHours: number,
): LineEvaluation {
  const empty: LineEvaluation = {
    skipReason: null,
    result: null,
    rateId: null,
    purityBp: null,
    weightGrams: null,
    hybridDelta: null,
  };

  if (r.formula_version_id === null) {
    return { ...empty, skipReason: "The bound formula has no published version." };
  }
  const version = inputs.versions.get(r.formula_version_id);
  if (!version) return { ...empty, skipReason: "The bound formula version is missing." };

  const weight = inputs.weights.get(r.variant_id);
  const weightSource = String(version["weight_source"]);
  const weightMilligrams =
    weightSource === "fixed"
      ? BigInt((version["fixed_weight_milligrams"] as bigint | null) ?? 0n)
      : (weight?.weightMilligrams ?? null);
  if (weightMilligrams === null) {
    return { ...empty, skipReason: "No primary metal weight on this variant." };
  }

  const materialId = (version["material_id"] as string | null) ?? weight?.materialId ?? null;
  if (materialId === null) return { ...empty, skipReason: "No material to price from." };

  const rate = rates.get(`${materialId}:${r.currency_code}`);
  if (!rate) {
    return { ...empty, skipReason: `No ${r.currency_code} rate for this material.` };
  }
  if (rate.ageHours > maxAgeHours) {
    return {
      ...empty,
      skipReason: `The ${r.currency_code} rate is ${String(Math.round(rate.ageHours))} hours old.`,
    };
  }

  const terms = inputs.terms.get(`${r.formula_version_id}:${r.market_code}`);
  if (!terms) {
    // Absence is a STATE, not a default. A market with no terms row cannot be priced by this
    // formula, and inventing terms would price it from another market's numbers.
    return { ...empty, skipReason: `This formula has no terms for ${r.market_code}.` };
  }

  const purityBp =
    version["purity_source"] === "override"
      ? Number(version["purity_ratio_bp"])
      : (weight?.purityBp ?? 10_000);
  const cost = inputs.costs.get(`${r.variant_id}:${r.currency_code}`) ?? {
    stone: 0n,
    other: 0n,
  };

  const formulaInputs: FormulaInputs = {
    rateMinorPerGram: rate.rateMinorPerGram,
    rateScale: rate.rateScale,
    weightMilligrams,
    purityBp,
    makingChargeMode: String(
      version["making_charge_mode"],
    ) as FormulaInputs["makingChargeMode"],
    makingChargeBp:
      version["making_charge_bp"] === null ? null : Number(version["making_charge_bp"]),
    makingChargeMinor:
      terms["making_charge_minor"] === null
        ? null
        : BigInt(terms["making_charge_minor"] as bigint),
    makingChargePerGramMinor:
      terms["making_charge_per_gram_minor"] === null
        ? null
        : BigInt(terms["making_charge_per_gram_minor"] as bigint),
    includeStoneCost: version["include_stone_cost"] === true,
    includeOtherMaterialCost: version["include_other_material_cost"] === true,
    stoneCostMinor: cost.stone,
    otherMaterialCostMinor: cost.other,
    markupMode: String(version["markup_mode"]) as FormulaInputs["markupMode"],
    markupBp: version["markup_bp"] === null ? null : Number(version["markup_bp"]),
    markupMinor:
      terms["markup_minor"] === null ? null : BigInt(terms["markup_minor"] as bigint),
    marketAdjustmentDeltaMinor:
      terms["market_adjustment_delta_minor"] === null
        ? null
        : BigInt(terms["market_adjustment_delta_minor"] as bigint),
    marketAdjustmentBp:
      terms["market_adjustment_bp"] === null ? null : Number(terms["market_adjustment_bp"]),
    roundingIncrementMinor: BigInt(terms["rounding_increment_minor"] as bigint),
    roundingMode: String(terms["rounding_mode"]) as FormulaInputs["roundingMode"],
    floorMinor: terms["floor_minor"] === null ? null : BigInt(terms["floor_minor"] as bigint),
  };

  const result = evaluateFormula(formulaInputs);
  return {
    skipReason: null,
    result,
    rateId: rate.id,
    purityBp,
    weightGrams: (Number(weightMilligrams) / 1000).toString(),
    hybridDelta: null,
  };
}

/** Step 5 — approve. `owner` and `admin` only (11 §1.4). */
export async function approveRecalcRun(actor: Actor, runId: string): Promise<void> {
  requirePermission(actor, "price.approve_recalc");
  if (actor.kind !== "staff")
    throw new ValidationError("A recalculation must be approved by a person.");

  await withTransaction(async (tx) => {
    const blocked = await tx.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM recalc_run_lines
       WHERE recalc_run_id = ${runId}::uuid AND blocked_reason IS NOT NULL
    `;
    if ((blocked[0]?.n ?? 0) > 0) {
      // A sale that now exceeds list would violate chk_prices_sale_lte_list at apply time,
      // which means the job fails at 2 a.m. on a run someone approved at 5 p.m.
      throw new ConflictError(
        `${String(blocked[0]!.n)} line(s) are blocked and must be resolved before this run can be approved.`,
      );
    }
    const updated = await tx.$executeRaw`
      UPDATE recalc_runs
         SET status = 'approved', approved_by_user_id = ${actor.userId}::uuid,
             approved_at = now(), updated_at = now()
       WHERE id = ${runId}::uuid AND status = 'pending_approval'
    `;
    if (updated === 0) {
      throw new ConflictError("This run is no longer awaiting approval.");
    }
  });
}

/**
 * Step 6 — apply. **ENQUEUES; never applies inline.**
 *
 * This is the function that makes P04A a dependency rather than a convenience. With no worker,
 * "enqueue" degrades to "apply inline, just for now" — and applying inline means a request
 * timeout mid-run leaves half a catalogue repriced with no record of where it stopped.
 */
export async function applyRecalcRun(actor: Actor, runId: string): Promise<{ jobId: string }> {
  requirePermission(actor, "price.approve_recalc");
  if (actor.kind !== "staff")
    throw new ValidationError("A recalculation must be applied by a person.");

  return withTransaction(async (tx) => {
    const run = await tx.$queryRaw<{ status: string; approved_by_user_id: string | null }[]>`
      SELECT status::text AS status, approved_by_user_id::text AS approved_by_user_id
        FROM recalc_runs WHERE id = ${runId}::uuid
    `;
    if (!run[0]) throw new ValidationError("No such recalculation run.");
    if (run[0].status !== "approved") {
      throw new ConflictError(`A run in status '${run[0].status}' cannot be applied.`);
    }
    if (run[0].approved_by_user_id === null) {
      throw new ConflictError("This run has no approver.");
    }

    const job = await enqueue(tx, {
      kind: "recalc_apply",
      payload: { recalcRunId: runId },
      createdByUserId: actor.userId,
      dedupeValue: runId,
    });
    await tx.$executeRaw`
      UPDATE recalc_runs SET status = 'applying', job_id = ${job.id}::uuid, updated_at = now()
       WHERE id = ${runId}::uuid
    `;
    return { jobId: job.id };
  });
}

/**
 * The apply itself, run BY THE WORKER. **Performs no arithmetic.**
 *
 * Every number inserted here came from the preview. The only thing this function decides is
 * which rows to close and which to write — and it re-checks that the row it is superseding is
 * still the one the preview saw, so a manual price set after approval is not silently
 * overwritten by a run that predates it.
 */
export async function runRecalcApply(
  runId: string,
): Promise<{ applied: number; failed: number }> {
  return withTransaction(async (tx) => {
    const lines = await tx.$queryRaw<Record<string, unknown>[]>`
      SELECT * FROM recalc_run_lines
       WHERE recalc_run_id = ${runId}::uuid AND status = 'proposed'
       ORDER BY variant_id, market_code
    `;
    let applied = 0;
    let failed = 0;

    for (const l of lines) {
      const currentPriceId = l["current_price_id"] as string | null;
      if (currentPriceId !== null) {
        const closed = await tx.$executeRaw`
          UPDATE prices SET valid_to = now()
           WHERE id = ${currentPriceId}::uuid AND valid_to IS NULL AND deleted_at IS NULL
             AND price_source <> 'manual'
        `;
        if (closed === 0) {
          // The row moved after approval — most often because someone set a manual price.
          // A manual price WINS and is not overwritten (04 §2.2).
          failed++;
          await tx.$executeRaw`
            UPDATE recalc_run_lines SET status = 'failed',
                   skip_reason = 'The price changed after this run was approved.'
             WHERE id = ${String(l["id"])}::uuid
          `;
          continue;
        }
      }

      const inserted = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO prices (id, product_id, variant_id, market_code, currency_code, list_minor,
                            sale_minor, compare_at_minor, cost_minor, price_source, valid_from,
                            created_at, recalc_run_id, formula_version_id,
                            material_id, metal_rate_id, metal_weight_grams, purity_ratio_bp,
                            metal_component_minor, making_charge_computed_minor, stone_cost_minor,
                            other_material_cost_minor, markup_minor,
                            market_adjustment_delta_minor, floor_adjustment_minor,
                            computed_base_minor, rounding_adjustment_minor)
        SELECT gen_random_uuid(), v.product_id, l.variant_id, l.market_code, l.currency_code,
               l.proposed_list_minor, l.proposed_sale_minor, l.proposed_compare_at_minor,
               l.proposed_cost_minor, 'metal_linked', now(), now(), ${runId}::uuid,
               l.formula_version_id,
               (SELECT vm.material_id FROM variant_materials vm
                 WHERE vm.variant_id = l.variant_id AND vm.is_primary),
               l.metal_rate_id, l.proposed_metal_weight_grams, l.proposed_purity_ratio_bp,
               l.proposed_metal_component_minor, l.proposed_making_charge_computed_minor,
               l.proposed_stone_cost_minor, l.proposed_other_material_cost_minor,
               l.proposed_markup_minor, l.proposed_market_adjustment_delta_minor,
               l.proposed_floor_adjustment_minor,
               l.proposed_list_minor - coalesce(l.proposed_rounding_adjustment_minor, 0),
               l.proposed_rounding_adjustment_minor
          FROM recalc_run_lines l
          JOIN product_variants v ON v.id = l.variant_id
         WHERE l.id = ${String(l["id"])}::uuid
        RETURNING id::text AS id
      `;

      await tx.$executeRaw`
        INSERT INTO price_history (id, price_id, previous_price_id, product_id, variant_id,
                                   market_code, currency_code, previous_list_minor, new_list_minor,
                                   change_bp, reason, recalc_run_id, actor_type, created_at)
        SELECT gen_random_uuid(), ${inserted[0]!.id}::uuid, l.current_price_id, v.product_id,
               l.variant_id, l.market_code, l.currency_code, l.current_list_minor,
               l.proposed_list_minor, l.change_bp, 'recalc_run', ${runId}::uuid, 'system', now()
          FROM recalc_run_lines l JOIN product_variants v ON v.id = l.variant_id
         WHERE l.id = ${String(l["id"])}::uuid
      `;
      await tx.$executeRaw`
        UPDATE recalc_run_lines SET status = 'applied', new_price_id = ${inserted[0]!.id}::uuid
         WHERE id = ${String(l["id"])}::uuid
      `;
      applied++;
    }

    await tx.$executeRaw`
      UPDATE recalc_runs SET status = 'applied', applied_at = now(), failed_count = ${failed},
             updated_at = now()
       WHERE id = ${runId}::uuid
    `;
    return { applied, failed };
  });
}

/** Read a run for the admin screen. Exported so the route does no SQL of its own. */
export async function getRecalcRun(runId: string): Promise<Record<string, unknown> | null> {
  const rows = await db.$queryRaw<Record<string, unknown>[]>`
    SELECT * FROM recalc_runs WHERE id = ${runId}::uuid
  `;
  return rows[0] ?? null;
}
