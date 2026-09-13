-- Schema IV — inventory, cart, checkout, order, payment and fulfilment. P18.
--
-- Thirty-one tables and thirteen enums. The three properties this migration exists to make
-- UNWRITABLE, each of which is a risk in the register rather than a tidiness preference:
--
--  1. R01, overselling a one-of-a-kind piece. `chk_inventory_no_oversell` is the database
--     floor: reserved can never exceed on-hand, whatever the service layer believes. And
--     `idx_inventory_items_ooak_single_row` means a unique piece cannot have two inventory
--     rows, so "both locations hold the one ring" is not representable.
--
--  2. R02, cross-currency contamination inside one order. `uq_orders_id_money` is the
--     composite-FK target every order child points at. An `order_items` row in another
--     currency is not a bug to catch in review — it is a row the database refuses.
--
--  3. Hard rule 4, order immutability. Every snapshot column on `order_items` exists so a
--     later price edit or a deleted product cannot alter what was bought.
--
-- Prisma's diff proposed nineteen destructive statements against hand-written objects. All
-- removed; this is the fifth occurrence and `npm run db:guard` is what refuses them.

-- CreateEnum
CREATE TYPE "inventory_transaction_type" AS ENUM ('initial', 'receipt', 'adjustment', 'sale', 'return_restock', 'transfer_in', 'transfer_out', 'write_off', 'recount');

-- CreateEnum
CREATE TYPE "reservation_status" AS ENUM ('active', 'committed', 'released', 'expired');

-- CreateEnum
CREATE TYPE "reservation_ref_kind" AS ENUM ('cart', 'order');

-- CreateEnum
CREATE TYPE "cart_status" AS ENUM ('active', 'merged', 'converted', 'abandoned');

-- CreateEnum
CREATE TYPE "order_status" AS ENUM ('pending_payment', 'paid', 'pending_review', 'paid_unfulfillable', 'processing', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "payment_status" AS ENUM ('unpaid', 'authorized', 'paid', 'partially_refunded', 'refunded', 'failed');

-- CreateEnum
CREATE TYPE "fulfillment_status" AS ENUM ('unfulfilled', 'partially_fulfilled', 'fulfilled', 'partially_returned', 'returned');

-- CreateEnum
CREATE TYPE "payment_event_type" AS ENUM ('intent_created', 'authorized', 'captured', 'failed', 'cancelled', 'refund_created', 'refund_succeeded', 'refund_failed', 'dispute_opened', 'dispute_closed');

-- CreateEnum
CREATE TYPE "shipment_status" AS ENUM ('pending', 'label_created', 'in_transit', 'delivered', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "return_status" AS ENUM ('requested', 'approved', 'rejected', 'in_transit', 'received', 'refunded', 'closed');

-- CreateEnum
CREATE TYPE "refund_status" AS ENUM ('pending', 'succeeded', 'failed');

-- CreateEnum
CREATE TYPE "webhook_status" AS ENUM ('received', 'processed', 'failed', 'ignored');

-- CreateEnum
CREATE TYPE "address_kind" AS ENUM ('shipping', 'billing');

-- CreateTable
CREATE TABLE "inventory_items" (
    "id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "is_one_of_a_kind" BOOLEAN NOT NULL,
    "location_id" UUID NOT NULL,
    "on_hand_quantity" INTEGER NOT NULL DEFAULT 0,
    "reserved_quantity" INTEGER NOT NULL DEFAULT 0,
    "available_quantity" INTEGER NOT NULL DEFAULT 0,
    "incoming_quantity" INTEGER NOT NULL DEFAULT 0,
    "safety_stock_quantity" INTEGER NOT NULL DEFAULT 0,
    "reorder_point" INTEGER,
    "bin_location" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_transactions" (
    "id" UUID NOT NULL,
    "inventory_item_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "type" "inventory_transaction_type" NOT NULL,
    "quantity_delta" INTEGER NOT NULL,
    "balance_after" INTEGER NOT NULL,
    "balance_before" INTEGER,
    "order_id" UUID,
    "order_item_id" UUID,
    "return_id" UUID,
    "reservation_id" UUID,
    "actor_type" "actor_type" NOT NULL,
    "actor_user_id" UUID,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservations" (
    "id" UUID NOT NULL,
    "ref_kind" "reservation_ref_kind" NOT NULL,
    "cart_id" UUID,
    "order_id" UUID,
    "status" "reservation_status" NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "committed_at" TIMESTAMPTZ(6),
    "released_at" TIMESTAMPTZ(6),
    "release_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservation_lines" (
    "id" UUID NOT NULL,
    "reservation_id" UUID NOT NULL,
    "inventory_item_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reservation_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "addresses" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "label" TEXT,
    "recipient_name" TEXT NOT NULL,
    "company" TEXT,
    "line1" TEXT NOT NULL,
    "line2" TEXT,
    "city" TEXT NOT NULL,
    "region" TEXT,
    "postal_code" TEXT,
    "country_code" CHAR(2) NOT NULL,
    "phone" TEXT,
    "tax_identifier" TEXT,
    "extra" JSONB NOT NULL DEFAULT '{}',
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wishlists" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "share_token_hash" BYTEA,
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "wishlists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wishlist_items" (
    "id" UUID NOT NULL,
    "wishlist_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "variant_id" UUID,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wishlist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "back_in_stock_requests" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "customer_id" UUID,
    "product_id" UUID NOT NULL,
    "variant_id" UUID,
    "market_code" CHAR(2) NOT NULL,
    "notified_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "back_in_stock_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "carts" (
    "id" UUID NOT NULL,
    "token_hash" BYTEA NOT NULL,
    "customer_id" UUID,
    "market_code" CHAR(2) NOT NULL,
    "currency_code" CHAR(3) NOT NULL,
    "status" "cart_status" NOT NULL,
    "email" TEXT,
    "coupon_code" TEXT,
    "note" TEXT,
    "merged_into_cart_id" UUID,
    "converted_order_id" UUID,
    "last_activity_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "abandoned_email_sent_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by_user_id" UUID,
    "draft_name" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "carts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cart_items" (
    "id" UUID NOT NULL,
    "cart_id" UUID NOT NULL,
    "market_code" CHAR(2) NOT NULL,
    "variant_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_list_minor" BIGINT NOT NULL,
    "unit_final_minor" BIGINT NOT NULL,
    "price_record_id" UUID,
    "priced_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "personalisation" JSONB,
    "gift_message" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cart_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checkout_sessions" (
    "id" UUID NOT NULL,
    "cart_id" UUID NOT NULL,
    "market_code" CHAR(2) NOT NULL,
    "currency_code" CHAR(3) NOT NULL,
    "step" TEXT NOT NULL DEFAULT 'information',
    "email" TEXT,
    "accepts_marketing" BOOLEAN NOT NULL DEFAULT false,
    "shipping_address_id" UUID,
    "billing_address_id" UUID,
    "billing_same_as_shipping" BOOLEAN NOT NULL DEFAULT true,
    "shipping_address_draft" JSONB NOT NULL DEFAULT '{}',
    "billing_address_draft" JSONB NOT NULL DEFAULT '{}',
    "shipping_method_id" UUID,
    "shipping_method_code" TEXT,
    "shipping_method_label" TEXT,
    "shipping_amount_minor" BIGINT,
    "shipping_quoted_at" TIMESTAMPTZ(6),
    "tax_total_minor" BIGINT,
    "tax_provider" TEXT,
    "tax_breakdown" JSONB NOT NULL DEFAULT '{}',
    "tax_quoted_at" TIMESTAMPTZ(6),
    "idempotency_key" TEXT,
    "order_id" UUID,
    "client_ip" INET,
    "user_agent" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "checkout_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checkout_gift_cards" (
    "checkout_session_id" UUID NOT NULL,
    "gift_card_id" UUID NOT NULL,
    "currency_code" CHAR(3) NOT NULL,
    "applied_amount_minor" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checkout_gift_cards_pkey" PRIMARY KEY ("checkout_session_id","gift_card_id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "order_number" TEXT NOT NULL,
    "public_token_hash" BYTEA NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "customer_id" UUID,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "market_code" CHAR(2) NOT NULL,
    "currency_code" CHAR(3) NOT NULL,
    "locale" TEXT NOT NULL,
    "status" "order_status" NOT NULL,
    "payment_status" "payment_status" NOT NULL,
    "fulfillment_status" "fulfillment_status" NOT NULL,
    "cart_id" UUID,
    "subtotal_minor" BIGINT NOT NULL,
    "discount_total_minor" BIGINT NOT NULL DEFAULT 0,
    "shipping_total_minor" BIGINT NOT NULL DEFAULT 0,
    "tax_total_minor" BIGINT NOT NULL DEFAULT 0,
    "gift_card_total_minor" BIGINT NOT NULL DEFAULT 0,
    "total_minor" BIGINT NOT NULL,
    "refunded_total_minor" BIGINT NOT NULL DEFAULT 0,
    "tax_provider" TEXT,
    "tax_breakdown" JSONB NOT NULL DEFAULT '{}',
    "shipping_method_code" TEXT,
    "shipping_method_label" TEXT,
    "coupon_code" TEXT,
    "placed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paid_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "cancel_reason" TEXT,
    "completed_at" TIMESTAMPTZ(6),
    "customer_note" TEXT,
    "internal_note" TEXT,
    "ip_address" INET,
    "user_agent" TEXT,
    "placed_by_user_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "line_number" SMALLINT NOT NULL,
    "product_title" TEXT NOT NULL,
    "variant_title" TEXT,
    "sku" TEXT NOT NULL,
    "product_slug" TEXT NOT NULL,
    "image_url" TEXT,
    "category_path" TEXT,
    "attributes_snapshot" JSONB NOT NULL DEFAULT '{}',
    "stones_snapshot" JSONB NOT NULL DEFAULT '{}',
    "materials_snapshot" JSONB NOT NULL DEFAULT '{}',
    "personalisation" JSONB,
    "quantity" INTEGER NOT NULL,
    "currency_code" CHAR(3) NOT NULL,
    "market_code" CHAR(2) NOT NULL,
    "unit_list_minor" BIGINT NOT NULL,
    "unit_final_minor" BIGINT NOT NULL,
    "line_subtotal_minor" BIGINT NOT NULL,
    "line_discount_minor" BIGINT NOT NULL DEFAULT 0,
    "line_tax_minor" BIGINT NOT NULL DEFAULT 0,
    "line_shipping_minor" BIGINT NOT NULL DEFAULT 0,
    "line_total_minor" BIGINT NOT NULL,
    "tax_rate_bp" INTEGER,
    "tax_code" TEXT,
    "discount_breakdown" JSONB NOT NULL DEFAULT '[]',
    "price_source" "price_source" NOT NULL,
    "metal_rate_minor_per_gram" BIGINT,
    "metal_rate_scale" SMALLINT,
    "fulfilled_quantity" INTEGER NOT NULL DEFAULT 0,
    "returned_quantity" INTEGER NOT NULL DEFAULT 0,
    "refunded_minor" BIGINT NOT NULL DEFAULT 0,
    "product_id" UUID,
    "variant_id" UUID,
    "price_record_id" UUID,
    "metal_rate_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_addresses" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "kind" "address_kind" NOT NULL,
    "source_address_id" UUID,
    "recipient_name" TEXT NOT NULL,
    "company" TEXT,
    "line1" TEXT NOT NULL,
    "line2" TEXT,
    "city" TEXT NOT NULL,
    "region" TEXT,
    "postal_code" TEXT,
    "country_code" CHAR(2) NOT NULL,
    "phone" TEXT,
    "tax_identifier" TEXT,
    "extra" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_events" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "from_value" TEXT,
    "to_value" TEXT,
    "message" TEXT,
    "data" JSONB NOT NULL DEFAULT '{}',
    "is_customer_visible" BOOLEAN NOT NULL DEFAULT false,
    "actor_type" "actor_type" NOT NULL,
    "actor_user_id" UUID,
    "payment_event_id" UUID,
    "shipment_id" UUID,
    "return_id" UUID,
    "refund_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "provider_key" TEXT NOT NULL,
    "provider_payment_id" TEXT,
    "provider_customer_id" TEXT,
    "status" "payment_status" NOT NULL,
    "market_code" CHAR(2) NOT NULL,
    "currency_code" CHAR(3) NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "captured_minor" BIGINT NOT NULL DEFAULT 0,
    "refunded_minor" BIGINT NOT NULL DEFAULT 0,
    "method_type" TEXT,
    "method_brand" TEXT,
    "method_last4" CHAR(4),
    "idempotency_key" TEXT NOT NULL,
    "failure_code" TEXT,
    "failure_message" TEXT,
    "authorized_at" TIMESTAMPTZ(6),
    "captured_at" TIMESTAMPTZ(6),
    "failed_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_events" (
    "id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "type" "payment_event_type" NOT NULL,
    "amount_minor" BIGINT,
    "currency_code" CHAR(3),
    "webhook_event_id" UUID,
    "actor_type" "actor_type" NOT NULL,
    "actor_user_id" UUID,
    "message" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "status" "webhook_status" NOT NULL,
    "signature_valid" BOOLEAN NOT NULL,
    "payload" JSONB NOT NULL,
    "order_id" UUID,
    "attempts" SMALLINT NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(6),
    "last_error" TEXT,
    "processed_at" TIMESTAMPTZ(6),
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "return_id" UUID,
    "provider_refund_id" TEXT,
    "amount_minor" BIGINT NOT NULL,
    "market_code" CHAR(2) NOT NULL,
    "currency_code" CHAR(3) NOT NULL,
    "status" "refund_status" NOT NULL,
    "reason" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "restock" BOOLEAN NOT NULL DEFAULT false,
    "created_by_user_id" UUID,
    "succeeded_at" TIMESTAMPTZ(6),
    "failed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipments" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "location_id" UUID,
    "status" "shipment_status" NOT NULL,
    "carrier" TEXT,
    "service_level" TEXT,
    "tracking_number" TEXT,
    "tracking_url" TEXT,
    "shipped_at" TIMESTAMPTZ(6),
    "delivered_at" TIMESTAMPTZ(6),
    "weight_grams" DECIMAL(10,3),
    "insured_value_minor" BIGINT,
    "currency_code" CHAR(3),
    "notified_at" TIMESTAMPTZ(6),
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "shipments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "returns" (
    "id" UUID NOT NULL,
    "rma_number" TEXT NOT NULL,
    "order_id" UUID NOT NULL,
    "customer_id" UUID,
    "status" "return_status" NOT NULL,
    "reason_code" TEXT NOT NULL,
    "customer_comment" TEXT,
    "internal_note" TEXT,
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approved_at" TIMESTAMPTZ(6),
    "received_at" TIMESTAMPTZ(6),
    "closed_at" TIMESTAMPTZ(6),
    "refund_total_minor" BIGINT NOT NULL DEFAULT 0,
    "market_code" CHAR(2) NOT NULL,
    "currency_code" CHAR(3) NOT NULL,
    "restock_location_id" UUID,
    "handled_by_user_id" UUID,
    "carrier" TEXT,
    "tracking_number" TEXT,
    "label_url" TEXT,
    "shipped_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "return_items" (
    "id" UUID NOT NULL,
    "return_id" UUID NOT NULL,
    "order_item_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "condition" TEXT,
    "restocked" BOOLEAN NOT NULL DEFAULT false,
    "refund_amount_minor" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "return_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupon_usages" (
    "id" UUID NOT NULL,
    "coupon_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "customer_id" UUID,
    "discount_minor" BIGINT NOT NULL,
    "market_code" CHAR(2) NOT NULL,
    "currency_code" CHAR(3) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coupon_usages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gift_card_transactions" (
    "id" UUID NOT NULL,
    "gift_card_id" UUID NOT NULL,
    "order_id" UUID,
    "market_code" CHAR(2),
    "currency_code" CHAR(3) NOT NULL,
    "amount_delta_minor" BIGINT NOT NULL,
    "balance_after_minor" BIGINT NOT NULL,
    "type" TEXT NOT NULL,
    "actor_type" "actor_type" NOT NULL,
    "actor_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gift_card_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipping_zones" (
    "id" UUID NOT NULL,
    "market_code" CHAR(2) NOT NULL,
    "name" TEXT NOT NULL,
    "rank" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "shipping_zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipping_zone_rules" (
    "id" UUID NOT NULL,
    "zone_id" UUID NOT NULL,
    "match_type" TEXT NOT NULL,
    "country_code" CHAR(2) NOT NULL,
    "region" TEXT,
    "postal_prefix" TEXT,
    "postal_from" TEXT,
    "postal_to" TEXT,
    "is_exclusion" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shipping_zone_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipping_methods" (
    "id" UUID NOT NULL,
    "zone_id" UUID NOT NULL,
    "market_code" CHAR(2) NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "carrier" TEXT,
    "service_level" TEXT,
    "rate_strategy" TEXT NOT NULL,
    "min_transit_days" SMALLINT,
    "max_transit_days" SMALLINT,
    "requires_signature" BOOLEAN NOT NULL DEFAULT false,
    "is_insured" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "rank" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "shipping_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipping_rates" (
    "id" UUID NOT NULL,
    "method_id" UUID NOT NULL,
    "market_code" CHAR(2) NOT NULL,
    "currency_code" CHAR(3) NOT NULL,
    "min_value_minor" BIGINT NOT NULL DEFAULT 0,
    "max_value_minor" BIGINT,
    "min_weight_grams" DECIMAL(10,3),
    "max_weight_grams" DECIMAL(10,3),
    "amount_minor" BIGINT NOT NULL,
    "free_over_minor" BIGINT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "shipping_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_links" (
    "id" UUID NOT NULL,
    "cart_id" UUID,
    "order_id" UUID,
    "token_hash" BYTEA NOT NULL,
    "market_code" CHAR(2) NOT NULL,
    "currency_code" CHAR(3) NOT NULL,
    "amount_minor" BIGINT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "sent_to_email" TEXT,
    "sent_at" TIMESTAMPTZ(6),
    "used_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payment_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "redirect_hits" (
    "redirect_id" UUID NOT NULL,
    "hour_bucket" TIMESTAMPTZ(6) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "redirect_hits_pkey" PRIMARY KEY ("redirect_id","hour_bucket")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_inventory_items" ON "inventory_items"("variant_id", "location_id");

-- CreateIndex
CREATE INDEX "idx_reservation_lines_item" ON "reservation_lines"("inventory_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_reservation_lines" ON "reservation_lines"("reservation_id", "inventory_item_id");

-- CreateIndex
CREATE INDEX "idx_wishlist_items_product" ON "wishlist_items"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_carts_id_market" ON "carts"("id", "market_code");

-- CreateIndex
CREATE INDEX "idx_cart_items_variant" ON "cart_items"("variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_cart_items" ON "cart_items"("cart_id", "variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_checkout_sessions_cart" ON "checkout_sessions"("cart_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_checkout_sessions_id_currency" ON "checkout_sessions"("id", "currency_code");

-- CreateIndex
CREATE UNIQUE INDEX "uq_orders_id_money" ON "orders"("id", "market_code", "currency_code");

-- CreateIndex
CREATE UNIQUE INDEX "uq_order_items_line" ON "order_items"("order_id", "line_number");

-- CreateIndex
CREATE UNIQUE INDEX "uq_order_addresses" ON "order_addresses"("order_id", "kind");

-- CreateIndex
CREATE INDEX "idx_order_events_order" ON "order_events"("order_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "uq_payments_idempotency" ON "payments"("provider_key", "idempotency_key");

-- CreateIndex
CREATE INDEX "idx_payment_events_payment" ON "payment_events"("payment_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_payment_events_order" ON "payment_events"("order_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "uq_refunds_idempotency" ON "refunds"("payment_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "idx_shipments_order" ON "shipments"("order_id");

-- CreateIndex
CREATE INDEX "idx_returns_order" ON "returns"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_returns_rma" ON "returns"("rma_number");

-- CreateIndex
CREATE INDEX "idx_return_items_order_item" ON "return_items"("order_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_return_items" ON "return_items"("return_id", "order_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_coupon_usages" ON "coupon_usages"("coupon_id", "order_id");

-- CreateIndex
CREATE INDEX "idx_gct_card" ON "gift_card_transactions"("gift_card_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "uq_shipping_zones_id_market" ON "shipping_zones"("id", "market_code");

-- CreateIndex
CREATE INDEX "idx_szr_lookup" ON "shipping_zone_rules"("country_code", "region");

-- CreateIndex
CREATE INDEX "idx_szr_zone" ON "shipping_zone_rules"("zone_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_shipping_methods_id_market" ON "shipping_methods"("id", "market_code");

-- CreateIndex
CREATE INDEX "idx_shipping_rates_method" ON "shipping_rates"("method_id", "currency_code", "min_value_minor");

-- CreateIndex
CREATE UNIQUE INDEX "uq_payment_links_token" ON "payment_links"("token_hash");

-- CreateIndex
CREATE INDEX "idx_redirect_hits_bucket" ON "redirect_hits"("hour_bucket");

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "inventory_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_lines" ADD CONSTRAINT "reservation_lines_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_lines" ADD CONSTRAINT "reservation_lines_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wishlists" ADD CONSTRAINT "wishlists_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_wishlist_id_fkey" FOREIGN KEY ("wishlist_id") REFERENCES "wishlists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "back_in_stock_requests" ADD CONSTRAINT "back_in_stock_requests_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "back_in_stock_requests" ADD CONSTRAINT "back_in_stock_requests_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carts" ADD CONSTRAINT "carts_market_code_currency_code_fkey" FOREIGN KEY ("market_code", "currency_code") REFERENCES "markets"("code", "currency_code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cart_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "carts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_cart_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "carts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_shipping_address_id_fkey" FOREIGN KEY ("shipping_address_id") REFERENCES "addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_billing_address_id_fkey" FOREIGN KEY ("billing_address_id") REFERENCES "addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_shipping_method_id_fkey" FOREIGN KEY ("shipping_method_id") REFERENCES "shipping_methods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkout_gift_cards" ADD CONSTRAINT "checkout_gift_cards_checkout_session_id_fkey" FOREIGN KEY ("checkout_session_id") REFERENCES "checkout_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkout_gift_cards" ADD CONSTRAINT "checkout_gift_cards_gift_card_id_fkey" FOREIGN KEY ("gift_card_id") REFERENCES "gift_cards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_market_code_currency_code_fkey" FOREIGN KEY ("market_code", "currency_code") REFERENCES "markets"("code", "currency_code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_addresses" ADD CONSTRAINT "order_addresses_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_payment_event_id_fkey" FOREIGN KEY ("payment_event_id") REFERENCES "payment_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_return_id_fkey" FOREIGN KEY ("return_id") REFERENCES "returns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_refund_id_fkey" FOREIGN KEY ("refund_id") REFERENCES "refunds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "returns" ADD CONSTRAINT "returns_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_return_id_fkey" FOREIGN KEY ("return_id") REFERENCES "returns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_usages" ADD CONSTRAINT "coupon_usages_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gift_card_transactions" ADD CONSTRAINT "gift_card_transactions_gift_card_id_fkey" FOREIGN KEY ("gift_card_id") REFERENCES "gift_cards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipping_zone_rules" ADD CONSTRAINT "shipping_zone_rules_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "shipping_zones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipping_methods" ADD CONSTRAINT "shipping_methods_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "shipping_zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipping_rates" ADD CONSTRAINT "shipping_rates_method_id_fkey" FOREIGN KEY ("method_id") REFERENCES "shipping_methods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_links" ADD CONSTRAINT "payment_links_cart_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "carts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_links" ADD CONSTRAINT "payment_links_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_links" ADD CONSTRAINT "payment_links_market_code_currency_code_fkey" FOREIGN KEY ("market_code", "currency_code") REFERENCES "markets"("code", "currency_code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "redirect_hits" ADD CONSTRAINT "redirect_hits_redirect_id_fkey" FOREIGN KEY ("redirect_id") REFERENCES "redirects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

