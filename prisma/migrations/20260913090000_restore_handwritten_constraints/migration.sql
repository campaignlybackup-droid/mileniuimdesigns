-- Restore three hand-written objects that `prisma migrate dev` silently dropped.
--
-- WHAT HAPPENED. The Schema II migration was generated with `prisma migrate dev
-- --create-only`. Prisma diffs the DATABASE against the PRISMA SCHEMA, and anything in
-- the database that the schema does not describe reads as drift — so it emitted
-- DROP statements for three objects created by the Schema I hand-written addendum:
--
--   uq_settings_key_market      -- (key, market_code) NULLS NOT DISTINCT
--   uq_email_templates          -- (key, market_code) NULLS NOT DISTINCT
--   idx_analytics_occurred_brin -- BRIN over occurred_at
--
-- None of the three is expressible in Prisma, which is exactly why they were
-- hand-written — and exactly why Prisma proposes to remove them. 01 §6.8 predicted this
-- ("the addendum must be re-appended whenever the schema changes, or the constraints are
-- silently dropped"). It then happened on the very next migration, and it was found by a
-- test failing rather than by anyone reading the generated SQL.
--
-- The durable fix is tests/db/handwritten-constraints.test.ts, which enumerates every
-- hand-written object and asserts it exists. A future migration may still drop one; it
-- can no longer do so quietly.

CREATE UNIQUE INDEX IF NOT EXISTS "uq_settings_key_market"
  ON "settings" (key, market_code) NULLS NOT DISTINCT;

CREATE UNIQUE INDEX IF NOT EXISTS "uq_email_templates"
  ON "email_templates" (key, market_code) NULLS NOT DISTINCT;

CREATE INDEX IF NOT EXISTS "idx_analytics_occurred_brin"
  ON "analytics_events" USING BRIN (occurred_at) WITH (pages_per_range = 32);
