-- attribute_data_type — restore the canonical member list. P09, correcting P05.
--
-- P05 transcribed this enum from a superseded draft. The canonical list is stated
-- identically in 02 §1.9 and 03 §3.2:
--
--     text | long_text | number | boolean | select | multi_select | date | composite
--
-- What P05 shipped instead was:
--
--     text | number | decimal | boolean | select | multi_select | measurement | currency | date
--
-- Three defects, in ascending order of how much they would have cost:
--
--  1. `long_text` and `composite` are MISSING. `chk_pav_one_value` counts `value_json`
--     among the value columns, so the column exists for a type that could not be declared —
--     `composite` was unreachable and `value_json` unwritable by any legal row.
--
--  2. `decimal` and `measurement` are PRESENT, and they are not storage types. 03 §3.2 maps
--     both onto `number`: they differ from it in validation (`decimal_places`) and in
--     whether `attributes.unit` is required, neither of which the database stores
--     differently. Worse, `chk_attributes_filterable_type` — transcribed correctly — permits
--     is_filterable only for ('select','multi_select','boolean','number'). So a Measurement
--     attribute, which 03 §3.2's own table calls range-filterable, could not be marked
--     filterable: the merchandiser ticks a box and gets a constraint violation naming a
--     check they have never heard of.
--
--  3. `currency` is PRESENT, and 03 §3.1 refuses it in as many words. An EAV money value is
--     an amount with no market, no currency FK, no `_minor` suffix and no CHECK, and the
--     first thing anyone does with one is show it to a shopper. That is R02 — cross-market
--     price contamination — reached without touching a single one of the composite foreign
--     keys built to prevent it. A price is a `prices` row; an internal cost is
--     `prices.cost_minor`; a non-price number with a unit is `number` + `attributes.unit`.
--
-- `attributes`, `attribute_options` and `product_attribute_values` are all empty, verified
-- before writing this. The mapping below is therefore unreachable today — it is written
-- anyway, because this file also runs against any environment restored from a snapshot taken
-- while the wrong enum was live, and a silent cast that drops rows is not an acceptable
-- outcome there.

-- `decimal` and `measurement` have an exact target. `currency` does not: nothing else in the
-- list means "an amount", and inventing one is how the refused type gets reintroduced under
-- another name. A row carrying it stops this migration and requires a person.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "attributes" WHERE "data_type"::text = 'currency') THEN
    RAISE EXCEPTION
      'attributes rows exist with data_type = currency, which 03 §3.1 refuses. Decide per row: a price belongs in prices, a cost in prices.cost_minor, a non-price number in a number attribute with a unit. Then re-run.';
  END IF;
END $$;

-- `chk_attributes_filterable_type` must come off first and go straight back on.
--
-- Its expression is `data_type IN ('select','multi_select','boolean','number')`, and those
-- literals were resolved to the OLD enum type when the constraint was created. Postgres
-- re-checks every dependent expression during ALTER COLUMN TYPE and refuses with
--
--     operator does not exist: attribute_data_type_new = attribute_data_type
--
-- which is the database declining to guess which enum the merchandiser meant. The drop is
-- paired with the re-add in this same file and inside the same transaction, so the constraint
-- is never absent at any point another session could observe — it is on both sides of the
-- statement that needs it gone, which is the only shape in which dropping a protected object
-- is honest. `tests/db/handwritten-constraints.test.ts` holds the manifest that proves it
-- came back.
ALTER TABLE "attributes" DROP CONSTRAINT "chk_attributes_filterable_type";

CREATE TYPE "attribute_data_type_new" AS ENUM (
  'text', 'long_text', 'number', 'boolean', 'select', 'multi_select', 'date', 'composite'
);

ALTER TABLE "attributes"
  ALTER COLUMN "data_type" TYPE "attribute_data_type_new"
  USING (
    CASE "data_type"::text
      WHEN 'decimal'     THEN 'number'
      WHEN 'measurement' THEN 'number'
      ELSE "data_type"::text
    END
  )::"attribute_data_type_new";

DROP TYPE "attribute_data_type";
ALTER TYPE "attribute_data_type_new" RENAME TO "attribute_data_type";

-- Back on, byte-identical to prisma/handwritten/addendum.sql. `number` is now the only
-- numeric member, so this list finally covers Decimal and Measurement — which is the defect
-- in (2) above closing.
ALTER TABLE "attributes" ADD CONSTRAINT "chk_attributes_filterable_type"
  CHECK (NOT is_filterable OR data_type IN ('select','multi_select','boolean','number'));
