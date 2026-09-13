-- recalc_run_lines: the proposed row, snapshotted. 04 §3.3's SCHEMA ADDITIONs. P12.
--
-- The apply must perform NO ARITHMETIC — it inserts the columns the preview already computed.
-- That is the difference between "an admin approved these numbers" and "an admin approved a
-- number and the job recomputed a different one later". Without the snapshot, a stone cost
-- edited at 4 p.m., a variant re-weighed at 5 p.m. or a formula version published at 6 p.m.
-- changes what ships at 2 a.m. — and the run detail screen still shows the figures that WERE
-- approved, so the discrepancy is invisible in the one place anyone would look.
--
-- `02`'s register carried nine of these columns and omitted six: the formula version, purity,
-- weight, the hybrid delta, the carried-forward sale/compare-at/cost, and `change_bp`. That is
-- the fourth register omission this build has found against `04`, which owns pricing.
--
-- Sale, compare-at and cost are CARRIED FORWARD because the replacement is a new row and
-- anything not copied is gone: dropping `sale_minor` ends a live campaign silently, and
-- dropping `cost_minor` breaks every margin report from that date forward, unrecoverably.
--
-- Prisma's diff again proposed destructive statements against hand-written objects; removed.

-- AlterTable
ALTER TABLE "recalc_run_lines" ADD COLUMN     "blocked_reason" TEXT,
ADD COLUMN     "change_bp" INTEGER,
ADD COLUMN     "formula_version_id" UUID,
ADD COLUMN     "proposed_compare_at_minor" BIGINT,
ADD COLUMN     "proposed_cost_minor" BIGINT,
ADD COLUMN     "proposed_hybrid_adjustment_delta_minor" BIGINT,
ADD COLUMN     "proposed_metal_weight_grams" DECIMAL(10,3),
ADD COLUMN     "proposed_purity_ratio_bp" INTEGER,
ADD COLUMN     "proposed_sale_minor" BIGINT;

-- AddForeignKey
ALTER TABLE "recalc_run_lines" ADD CONSTRAINT "recalc_run_lines_formula_version_id_fkey" FOREIGN KEY ("formula_version_id") REFERENCES "pricing_formula_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
