-- Bootstrap: extensions before anything that indexes with them (02 §7.1 rule 2).
--
-- pg_trgm   — trigram search: the admin ⌘K palette, product/SKU/customer lookup, and
--             the GIN indexes on collections.title, stones.name, orders.order_number.
-- btree_gist — the EXCLUDE constraints on shipping_rates and search_promotions, which
--             are how overlapping rate bands and overlapping promotion windows are made
--             unrepresentable rather than merely discouraged.
--
-- These run first because CREATE INDEX ... USING GIN (x gin_trgm_ops) fails if the
-- extension is absent, and an extension cannot be created inside the same transaction
-- that uses it. Verified to work on the local `prisma dev` server, whose Postgres 17.5
-- is a wasm32 build (01 §6.6).
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gist;
