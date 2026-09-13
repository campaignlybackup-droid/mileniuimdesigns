-- pricing_rules: amount_basis, and fixed_price is never stackable. 04 §1.4.1's two
-- SCHEMA ADDITIONs, which 02's register line omits and P10 therefore did not build.
--
-- Found while implementing P11's rule arithmetic, which cannot be written without them:
--
--  1. `amount_basis` decides whether `amount_minor = 2500` on a `fixed_amount_off` rule
--     means "$25 off each" or "$25 off the line". Both readings are reasonable, the
--     document names `per_unit` as the intended one, and the difference is
--     (quantity − 1) × $25 on every multi-quantity bag. With no column the choice is made
--     by whoever writes the service and is invisible to the merchandiser who typed 2500.
--
--  2. A `fixed_price` rule SETS the price. Composing it with a further percentage is an
--     argument about which one the merchandiser meant, and without the constraint that
--     argument is resolved at runtime, on a customer's bag. The CHECK makes it unwritable
--     rather than untested.
--
-- The table is empty (no phase seeds a pricing rule — a markdown is a commercial decision),
-- so the NOT NULL default lands without a backfill.

ALTER TABLE "pricing_rules" ADD COLUMN "amount_basis" TEXT NOT NULL DEFAULT 'per_unit';
