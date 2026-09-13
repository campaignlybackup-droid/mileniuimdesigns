-- collection_rule_values — the multi-value side of `in` / `not_in`. P16, closing a P05 gap.
--
-- 02 §7.13 lists this table among P05's deliverables and P05 did not build it. Nothing
-- noticed, because `tests/db/drift.test.ts` compares the DATABASE against the PRISMA SCHEMA
-- and the table was absent from both — the derived check catches schema/database drift, not
-- document/schema drift, and this is the fifth register-vs-implementation gap this build has
-- found. An `in` rule ("stone in [labradorite, moonstone]") has nowhere to store its second
-- value without it, so the operator would have silently evaluated against one value.
--
-- Used ONLY by `in` / `not_in`. Every other operator reads the value columns on
-- `collection_rules` itself, and `saveCollectionRules()` asserts that split because a CHECK
-- cannot span two tables.
--
-- Prisma's diff again proposed destructive statements against hand-written objects; removed.

-- CreateTable
CREATE TABLE "collection_rule_values" (
    "rule_id" UUID NOT NULL,
    "value_uuid" UUID,
    "value_text" TEXT,
    "position" SMALLINT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_collection_rule_values" PRIMARY KEY ("rule_id","position")
);

-- CreateIndex
CREATE INDEX "idx_crv_rule" ON "collection_rule_values"("rule_id", "position");

-- AddForeignKey
ALTER TABLE "collection_rule_values" ADD CONSTRAINT "collection_rule_values_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "collection_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

