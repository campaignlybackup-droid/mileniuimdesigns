/**
 * THE error taxonomy — generated from docs/architecture/11-registries.md §2.2.
 *
 * One base class, one code per failure, one HTTP status, one copy key. A second base
 * class is how a parallel taxonomy starts, and a parallel taxonomy is how a customer ends
 * up seeing an internal message.
 *
 * `safe` marks the codes whose resolved `copy.error.*` string may be shown to a customer
 * verbatim. Everything else resolves to the generic message: a stack trace, a provider
 * error body or a constraint name must never reach a shopper (brief §100).
 */

export type ErrorCode =
  | "VALIDATION_FAILED"
  | "ATTRIBUTE_VALIDATION_FAILED"
  | "NOT_FOUND"
  | "SLUG_TAKEN"
  | "DUPLICATE"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "TOTP_REQUIRED"
  | "SESSION_EXPIRED"
  | "LAST_OWNER"
  | "MARKET_NOT_FOUND"
  | "MARKET_CHANGED"
  | "PRODUCT_UNAVAILABLE_IN_MARKET"
  | "STALE_WRITE"
  | "CONFLICT"
  | "CONCURRENCY"
  | "ILLEGAL_TRANSITION"
  | "ILLEGAL_CHECKOUT_TRANSITION"
  | "PREFLIGHT_REQUIRED"
  | "SKU_CONFLICT"
  | "VARIANT_CONFLICT"
  | "TOO_MANY_COMBINATIONS"
  | "PRICE_CHANGED"
  | "PRICE_UNAVAILABLE"
  | "RATE_UNAVAILABLE"
  | "RATE_STALE"
  | "RATE_PROVIDER_ERROR"
  | "FORMULA_INVALID"
  | "MANUAL_OVERRIDE"
  | "TOO_MANY_LINES"
  | "RECALC_STALE"
  | "INSUFFICIENT_STOCK"
  | "LINE_UNAVAILABLE"
  | "CART_EMPTY"
  | "CART_CONVERTED"
  | "COUPON_INVALID"
  | "COUPON_UNAVAILABLE"
  | "GIFT_CARD_INVALID"
  | "GIFT_CARD_UNAVAILABLE"
  | "TOTALS_CHANGED"
  | "SHIPPING_UNAVAILABLE"
  | "SHIPPING_METHOD_UNAVAILABLE"
  | "TAX_UNAVAILABLE"
  | "TAX_UNCONFIGURED"
  | "DUTY_UNAVAILABLE"
  | "OVER_REFUND"
  | "PAYMENTS_UNCONFIGURED"
  | "PREVIEW_TOKEN_INVALID"
  | "RATE_LIMITED"
  | "INTEGRATION_UNCONFIGURED"
  | "PROVIDER_ERROR"
  | "INTERNAL";

export const ERROR_CODES: readonly ErrorCode[] = Object.freeze([
  "VALIDATION_FAILED",
  "ATTRIBUTE_VALIDATION_FAILED",
  "NOT_FOUND",
  "SLUG_TAKEN",
  "DUPLICATE",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "TOTP_REQUIRED",
  "SESSION_EXPIRED",
  "LAST_OWNER",
  "MARKET_NOT_FOUND",
  "MARKET_CHANGED",
  "PRODUCT_UNAVAILABLE_IN_MARKET",
  "STALE_WRITE",
  "CONFLICT",
  "CONCURRENCY",
  "ILLEGAL_TRANSITION",
  "ILLEGAL_CHECKOUT_TRANSITION",
  "PREFLIGHT_REQUIRED",
  "SKU_CONFLICT",
  "VARIANT_CONFLICT",
  "TOO_MANY_COMBINATIONS",
  "PRICE_CHANGED",
  "PRICE_UNAVAILABLE",
  "RATE_UNAVAILABLE",
  "RATE_STALE",
  "RATE_PROVIDER_ERROR",
  "FORMULA_INVALID",
  "MANUAL_OVERRIDE",
  "TOO_MANY_LINES",
  "RECALC_STALE",
  "INSUFFICIENT_STOCK",
  "LINE_UNAVAILABLE",
  "CART_EMPTY",
  "CART_CONVERTED",
  "COUPON_INVALID",
  "COUPON_UNAVAILABLE",
  "GIFT_CARD_INVALID",
  "GIFT_CARD_UNAVAILABLE",
  "TOTALS_CHANGED",
  "SHIPPING_UNAVAILABLE",
  "SHIPPING_METHOD_UNAVAILABLE",
  "TAX_UNAVAILABLE",
  "TAX_UNCONFIGURED",
  "DUTY_UNAVAILABLE",
  "OVER_REFUND",
  "PAYMENTS_UNCONFIGURED",
  "PREVIEW_TOKEN_INVALID",
  "RATE_LIMITED",
  "INTEGRATION_UNCONFIGURED",
  "PROVIDER_ERROR",
  "INTERNAL",
]);

/**
 * The base every error extends DIRECTLY. Domain modules re-export their own classes from
 * here; there is no second base and no second ErrorCode union (11 §2.1).
 */
export abstract class AppError extends Error {
  abstract readonly code: ErrorCode;
  abstract readonly httpStatus: number;
  /** `copy.error.<lower_snake(code)>` — a `settings` row, so the client can edit it. */
  abstract readonly copyKey: string;
  /** Whether retrying the same request could plausibly succeed. */
  readonly retryable: boolean = false;
  /** VALIDATION_FAILED family only. Field-keyed messages, safe to show a customer. */
  readonly fields?: Record<string, string[]>;
  /** Logged, NEVER serialised to a client. */
  readonly context: Record<string, unknown> = {};

  constructor(
    message: string,
    options?: {
      context?: Record<string, unknown>;
      cause?: unknown;
      fields?: Record<string, string[]>;
    },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = new.target.name;
    if (options?.context) this.context = options.context;
    // `fields` is the only part of an error that `toWireError` sends to a client, so it is
    // set HERE rather than by a subclass assigning over a readonly property with a cast — a
    // cast that would also be the obvious way to smuggle `context` out to the browser.
    if (options?.fields) this.fields = options.fields;
  }
}

type Meta = { httpStatus: number; copyKey: string; safe: boolean; retryable: boolean };

/** Status, copy key and customer-safety for every code. Asserted complete in tests. */
export const ERROR_META: Record<ErrorCode, Meta> = {
  VALIDATION_FAILED: {
    httpStatus: 400,
    copyKey: "copy.error.validation_failed",
    safe: true,
    retryable: false,
  },
  ATTRIBUTE_VALIDATION_FAILED: {
    httpStatus: 422,
    copyKey: "copy.error.attribute_validation_failed",
    safe: false,
    retryable: false,
  },
  NOT_FOUND: { httpStatus: 404, copyKey: "copy.error.not_found", safe: true, retryable: false },
  SLUG_TAKEN: {
    httpStatus: 409,
    copyKey: "copy.error.slug_taken",
    safe: false,
    retryable: false,
  },
  DUPLICATE: {
    httpStatus: 409,
    copyKey: "copy.error.duplicate",
    safe: false,
    retryable: false,
  },
  UNAUTHENTICATED: {
    httpStatus: 401,
    copyKey: "copy.error.unauthenticated",
    safe: true,
    retryable: false,
  },
  FORBIDDEN: {
    httpStatus: 403,
    copyKey: "copy.error.forbidden",
    safe: false,
    retryable: false,
  },
  TOTP_REQUIRED: {
    httpStatus: 403,
    copyKey: "copy.error.totp_required",
    safe: false,
    retryable: false,
  },
  SESSION_EXPIRED: {
    httpStatus: 401,
    copyKey: "copy.error.session_expired",
    safe: true,
    retryable: false,
  },
  LAST_OWNER: {
    httpStatus: 409,
    copyKey: "copy.error.last_owner",
    safe: false,
    retryable: false,
  },
  MARKET_NOT_FOUND: {
    httpStatus: 404,
    copyKey: "copy.error.market_not_found",
    safe: true,
    retryable: false,
  },
  MARKET_CHANGED: {
    httpStatus: 409,
    copyKey: "copy.error.market_changed",
    safe: true,
    retryable: false,
  },
  PRODUCT_UNAVAILABLE_IN_MARKET: {
    httpStatus: 409,
    copyKey: "copy.error.product_unavailable_in_market",
    safe: true,
    retryable: false,
  },
  STALE_WRITE: {
    httpStatus: 409,
    copyKey: "copy.error.stale_write",
    safe: false,
    retryable: true,
  },
  CONFLICT: { httpStatus: 409, copyKey: "copy.error.conflict", safe: false, retryable: false },
  CONCURRENCY: {
    httpStatus: 409,
    copyKey: "copy.error.concurrency",
    safe: true,
    retryable: true,
  },
  ILLEGAL_TRANSITION: {
    httpStatus: 409,
    copyKey: "copy.error.illegal_transition",
    safe: false,
    retryable: false,
  },
  ILLEGAL_CHECKOUT_TRANSITION: {
    httpStatus: 409,
    copyKey: "copy.error.illegal_checkout_transition",
    safe: true,
    retryable: false,
  },
  PREFLIGHT_REQUIRED: {
    httpStatus: 409,
    copyKey: "copy.error.preflight_required",
    safe: false,
    retryable: false,
  },
  SKU_CONFLICT: {
    httpStatus: 409,
    copyKey: "copy.error.sku_conflict",
    safe: false,
    retryable: false,
  },
  VARIANT_CONFLICT: {
    httpStatus: 409,
    copyKey: "copy.error.variant_conflict",
    safe: false,
    retryable: false,
  },
  TOO_MANY_COMBINATIONS: {
    httpStatus: 422,
    copyKey: "copy.error.too_many_combinations",
    safe: false,
    retryable: false,
  },
  PRICE_CHANGED: {
    httpStatus: 409,
    copyKey: "copy.error.price_changed",
    safe: true,
    retryable: false,
  },
  PRICE_UNAVAILABLE: {
    httpStatus: 422,
    copyKey: "copy.error.price_unavailable",
    safe: true,
    retryable: false,
  },
  RATE_UNAVAILABLE: {
    httpStatus: 422,
    copyKey: "copy.error.rate_unavailable",
    safe: false,
    retryable: false,
  },
  RATE_STALE: {
    httpStatus: 422,
    copyKey: "copy.error.rate_stale",
    safe: false,
    retryable: false,
  },
  RATE_PROVIDER_ERROR: {
    httpStatus: 502,
    copyKey: "copy.error.rate_provider_error",
    safe: false,
    retryable: true,
  },
  FORMULA_INVALID: {
    httpStatus: 422,
    copyKey: "copy.error.formula_invalid",
    safe: false,
    retryable: false,
  },
  MANUAL_OVERRIDE: {
    httpStatus: 409,
    copyKey: "copy.error.manual_override",
    safe: false,
    retryable: false,
  },
  TOO_MANY_LINES: {
    httpStatus: 422,
    copyKey: "copy.error.too_many_lines",
    safe: false,
    retryable: false,
  },
  RECALC_STALE: {
    httpStatus: 409,
    copyKey: "copy.error.recalc_stale",
    safe: false,
    retryable: false,
  },
  INSUFFICIENT_STOCK: {
    httpStatus: 409,
    copyKey: "copy.error.insufficient_stock",
    safe: true,
    retryable: false,
  },
  LINE_UNAVAILABLE: {
    httpStatus: 409,
    copyKey: "copy.error.line_unavailable",
    safe: true,
    retryable: false,
  },
  CART_EMPTY: {
    httpStatus: 409,
    copyKey: "copy.error.cart_empty",
    safe: true,
    retryable: false,
  },
  CART_CONVERTED: {
    httpStatus: 409,
    copyKey: "copy.error.cart_converted",
    safe: true,
    retryable: false,
  },
  COUPON_INVALID: {
    httpStatus: 422,
    copyKey: "copy.error.coupon_invalid",
    safe: true,
    retryable: false,
  },
  COUPON_UNAVAILABLE: {
    httpStatus: 409,
    copyKey: "copy.error.coupon_unavailable",
    safe: true,
    retryable: false,
  },
  GIFT_CARD_INVALID: {
    httpStatus: 422,
    copyKey: "copy.error.gift_card_invalid",
    safe: true,
    retryable: false,
  },
  GIFT_CARD_UNAVAILABLE: {
    httpStatus: 409,
    copyKey: "copy.error.gift_card_unavailable",
    safe: true,
    retryable: false,
  },
  TOTALS_CHANGED: {
    httpStatus: 409,
    copyKey: "copy.error.totals_changed",
    safe: true,
    retryable: false,
  },
  SHIPPING_UNAVAILABLE: {
    httpStatus: 422,
    copyKey: "copy.error.shipping_unavailable",
    safe: true,
    retryable: false,
  },
  SHIPPING_METHOD_UNAVAILABLE: {
    httpStatus: 409,
    copyKey: "copy.error.shipping_method_unavailable",
    safe: true,
    retryable: false,
  },
  TAX_UNAVAILABLE: {
    httpStatus: 422,
    copyKey: "copy.error.tax_unavailable",
    safe: true,
    retryable: false,
  },
  TAX_UNCONFIGURED: {
    httpStatus: 503,
    copyKey: "copy.error.tax_unconfigured",
    safe: true,
    retryable: false,
  },
  DUTY_UNAVAILABLE: {
    httpStatus: 422,
    copyKey: "copy.error.duty_unavailable",
    safe: true,
    retryable: false,
  },
  OVER_REFUND: {
    httpStatus: 409,
    copyKey: "copy.error.over_refund",
    safe: false,
    retryable: false,
  },
  PAYMENTS_UNCONFIGURED: {
    httpStatus: 503,
    copyKey: "copy.error.payments_unconfigured",
    safe: true,
    retryable: false,
  },
  PREVIEW_TOKEN_INVALID: {
    httpStatus: 404,
    copyKey: "copy.error.preview_token_invalid",
    safe: true,
    retryable: false,
  },
  RATE_LIMITED: {
    httpStatus: 429,
    copyKey: "copy.error.rate_limited",
    safe: true,
    retryable: true,
  },
  INTEGRATION_UNCONFIGURED: {
    httpStatus: 503,
    copyKey: "copy.error.integration_unconfigured",
    safe: true,
    retryable: false,
  },
  PROVIDER_ERROR: {
    httpStatus: 502,
    copyKey: "copy.error.provider_error",
    safe: true,
    retryable: true,
  },
  INTERNAL: { httpStatus: 500, copyKey: "copy.error.internal", safe: true, retryable: true },
};

// ── The 52 concrete classes ────────────────────────────────────────────────────────

export class ValidationError extends AppError {
  readonly code = "VALIDATION_FAILED" as const;
  readonly httpStatus = 400;
  readonly copyKey = "copy.error.validation_failed";
}

export class AttributeValidationError extends AppError {
  readonly code = "ATTRIBUTE_VALIDATION_FAILED" as const;
  readonly httpStatus = 422;
  readonly copyKey = "copy.error.attribute_validation_failed";
}

export class NotFoundError extends AppError {
  readonly code = "NOT_FOUND" as const;
  readonly httpStatus = 404;
  readonly copyKey = "copy.error.not_found";
}

export class SlugTakenError extends AppError {
  readonly code = "SLUG_TAKEN" as const;
  readonly httpStatus = 409;
  readonly copyKey = "copy.error.slug_taken";
}

export class DuplicateError extends AppError {
  readonly code = "DUPLICATE" as const;
  readonly httpStatus = 409;
  readonly copyKey = "copy.error.duplicate";
}

export class UnauthenticatedError extends AppError {
  readonly code = "UNAUTHENTICATED" as const;
  readonly httpStatus = 401;
  readonly copyKey = "copy.error.unauthenticated";
}

export class ForbiddenError extends AppError {
  readonly code = "FORBIDDEN" as const;
  readonly httpStatus = 403;
  readonly copyKey = "copy.error.forbidden";
}

export class TotpRequiredError extends AppError {
  readonly code = "TOTP_REQUIRED" as const;
  readonly httpStatus = 403;
  readonly copyKey = "copy.error.totp_required";
}

export class SessionExpiredError extends AppError {
  readonly code = "SESSION_EXPIRED" as const;
  readonly httpStatus = 401;
  readonly copyKey = "copy.error.session_expired";
}

export class LastOwnerError extends AppError {
  readonly code = "LAST_OWNER" as const;
  readonly httpStatus = 409;
  readonly copyKey = "copy.error.last_owner";
}

export class MarketNotFoundError extends AppError {
  readonly code = "MARKET_NOT_FOUND" as const;
  readonly httpStatus = 404;
  readonly copyKey = "copy.error.market_not_found";
}

export class MarketChangedError extends AppError {
  readonly code = "MARKET_CHANGED" as const;
  readonly httpStatus = 409;
  readonly copyKey = "copy.error.market_changed";
}

export class ProductUnavailableInMarketError extends AppError {
  readonly code = "PRODUCT_UNAVAILABLE_IN_MARKET" as const;
  readonly httpStatus = 409;
  readonly copyKey = "copy.error.product_unavailable_in_market";
}

export class StaleWriteError extends AppError {
  readonly code = "STALE_WRITE" as const;
  readonly httpStatus = 409;
  readonly copyKey = "copy.error.stale_write";
  override readonly retryable = true;
}

export class ConflictError extends AppError {
  readonly code = "CONFLICT" as const;
  readonly httpStatus = 409;
  readonly copyKey = "copy.error.conflict";
}

export class ConcurrencyError extends AppError {
  readonly code = "CONCURRENCY" as const;
  readonly httpStatus = 409;
  readonly copyKey = "copy.error.concurrency";
  override readonly retryable = true;
}

export class IllegalTransitionError extends AppError {
  readonly code = "ILLEGAL_TRANSITION" as const;
  readonly httpStatus = 409;
  readonly copyKey = "copy.error.illegal_transition";
}

export class IllegalCheckoutTransitionError extends AppError {
  readonly code = "ILLEGAL_CHECKOUT_TRANSITION" as const;
  readonly httpStatus = 409;
  readonly copyKey = "copy.error.illegal_checkout_transition";
}

export class PreflightRequired extends AppError {
  readonly code = "PREFLIGHT_REQUIRED" as const;
  readonly httpStatus = 409;
  readonly copyKey = "copy.error.preflight_required";
}

export class SkuConflictError extends AppError {
  readonly code = "SKU_CONFLICT" as const;
  readonly httpStatus = 409;
  readonly copyKey = "copy.error.sku_conflict";
}

export class VariantConflictError extends AppError {
  readonly code = "VARIANT_CONFLICT" as const;
  readonly httpStatus = 409;
  readonly copyKey = "copy.error.variant_conflict";
}

export class TooManyCombinationsError extends AppError {
  readonly code = "TOO_MANY_COMBINATIONS" as const;
  readonly httpStatus = 422;
  readonly copyKey = "copy.error.too_many_combinations";
}

export class PriceChangedError extends AppError {
  readonly code = "PRICE_CHANGED" as const;
  readonly httpStatus = 409;
  readonly copyKey = "copy.error.price_changed";
}

export class PriceUnavailableError extends AppError {
  readonly code = "PRICE_UNAVAILABLE" as const;
  readonly httpStatus = 422;
  readonly copyKey = "copy.error.price_unavailable";
}

export class RateUnavailableError extends AppError {
  readonly code = "RATE_UNAVAILABLE" as const;
  readonly httpStatus = 422;
  readonly copyKey = "copy.error.rate_unavailable";
}

export class RateStaleError extends AppError {
  readonly code = "RATE_STALE" as const;
  readonly httpStatus = 422;
  readonly copyKey = "copy.error.rate_stale";
}

export class RateProviderError extends AppError {
  readonly code = "RATE_PROVIDER_ERROR" as const;
  readonly httpStatus = 502;
  readonly copyKey = "copy.error.rate_provider_error";
  override readonly retryable = true;
}

export class FormulaInvalidError extends AppError {
  readonly code = "FORMULA_INVALID" as const;
  readonly httpStatus = 422;
  readonly copyKey = "copy.error.formula_invalid";
}

export class ManualOverrideError extends AppError {
  readonly code = "MANUAL_OVERRIDE" as const;
  readonly httpStatus = 409;
  readonly copyKey = "copy.error.manual_override";
}

export class TooManyLinesError extends AppError {
  readonly code = "TOO_MANY_LINES" as const;
  readonly httpStatus = 422;
  readonly copyKey = "copy.error.too_many_lines";
}

export class RecalcStaleError extends AppError {
  readonly code = "RECALC_STALE" as const;
  readonly httpStatus = 409;
  readonly copyKey = "copy.error.recalc_stale";
}

export class InsufficientStockError extends AppError {
  readonly code = "INSUFFICIENT_STOCK" as const;
  readonly httpStatus = 409;
  readonly copyKey = "copy.error.insufficient_stock";
}

export class LineUnavailableError extends AppError {
  readonly code = "LINE_UNAVAILABLE" as const;
  readonly httpStatus = 409;
  readonly copyKey = "copy.error.line_unavailable";
}

export class CartEmptyError extends AppError {
  readonly code = "CART_EMPTY" as const;
  readonly httpStatus = 409;
  readonly copyKey = "copy.error.cart_empty";
}

export class CartConvertedError extends AppError {
  readonly code = "CART_CONVERTED" as const;
  readonly httpStatus = 409;
  readonly copyKey = "copy.error.cart_converted";
}

export class CouponInvalidError extends AppError {
  readonly code = "COUPON_INVALID" as const;
  readonly httpStatus = 422;
  readonly copyKey = "copy.error.coupon_invalid";
}

export class CouponUnavailableError extends AppError {
  readonly code = "COUPON_UNAVAILABLE" as const;
  readonly httpStatus = 409;
  readonly copyKey = "copy.error.coupon_unavailable";
}

export class GiftCardInvalidError extends AppError {
  readonly code = "GIFT_CARD_INVALID" as const;
  readonly httpStatus = 422;
  readonly copyKey = "copy.error.gift_card_invalid";
}

export class GiftCardUnavailableError extends AppError {
  readonly code = "GIFT_CARD_UNAVAILABLE" as const;
  readonly httpStatus = 409;
  readonly copyKey = "copy.error.gift_card_unavailable";
}

export class TotalsChangedError extends AppError {
  readonly code = "TOTALS_CHANGED" as const;
  readonly httpStatus = 409;
  readonly copyKey = "copy.error.totals_changed";
}

export class ShippingUnavailableError extends AppError {
  readonly code = "SHIPPING_UNAVAILABLE" as const;
  readonly httpStatus = 422;
  readonly copyKey = "copy.error.shipping_unavailable";
}

export class ShippingMethodUnavailableError extends AppError {
  readonly code = "SHIPPING_METHOD_UNAVAILABLE" as const;
  readonly httpStatus = 409;
  readonly copyKey = "copy.error.shipping_method_unavailable";
}

export class TaxUnavailableError extends AppError {
  readonly code = "TAX_UNAVAILABLE" as const;
  readonly httpStatus = 422;
  readonly copyKey = "copy.error.tax_unavailable";
}

export class TaxUnconfiguredError extends AppError {
  readonly code = "TAX_UNCONFIGURED" as const;
  readonly httpStatus = 503;
  readonly copyKey = "copy.error.tax_unconfigured";
}

export class DutyUnavailableError extends AppError {
  readonly code = "DUTY_UNAVAILABLE" as const;
  readonly httpStatus = 422;
  readonly copyKey = "copy.error.duty_unavailable";
}

export class OverRefundError extends AppError {
  readonly code = "OVER_REFUND" as const;
  readonly httpStatus = 409;
  readonly copyKey = "copy.error.over_refund";
}

export class PaymentsUnconfiguredError extends AppError {
  readonly code = "PAYMENTS_UNCONFIGURED" as const;
  readonly httpStatus = 503;
  readonly copyKey = "copy.error.payments_unconfigured";
}

export class PreviewTokenError extends AppError {
  readonly code = "PREVIEW_TOKEN_INVALID" as const;
  readonly httpStatus = 404;
  readonly copyKey = "copy.error.preview_token_invalid";
}

export class RateLimitedError extends AppError {
  readonly code = "RATE_LIMITED" as const;
  readonly httpStatus = 429;
  readonly copyKey = "copy.error.rate_limited";
  override readonly retryable = true;
}

export class IntegrationUnconfiguredError extends AppError {
  readonly code = "INTEGRATION_UNCONFIGURED" as const;
  readonly httpStatus = 503;
  readonly copyKey = "copy.error.integration_unconfigured";
}

export class ProviderError extends AppError {
  readonly code = "PROVIDER_ERROR" as const;
  readonly httpStatus = 502;
  readonly copyKey = "copy.error.provider_error";
  override readonly retryable = true;
}

export class InternalError extends AppError {
  readonly code = "INTERNAL" as const;
  readonly httpStatus = 500;
  readonly copyKey = "copy.error.internal";
  override readonly retryable = true;
}

// ── Type aliases, NOT classes ──────────────────────────────────────────────────────
// 01–08 name these three. Declaring them as classes is how a second taxonomy starts, so
// they are unions over the classes above (11 §2.1).

export type PricingError =
  | PriceUnavailableError
  | MarketNotFoundError
  | RateUnavailableError
  | RateStaleError
  | FormulaInvalidError
  | ConflictError
  | PriceChangedError
  | TooManyLinesError
  | CouponInvalidError
  | ManualOverrideError
  | RecalcStaleError
  | ForbiddenError;

export type CheckoutError =
  | CartEmptyError
  | CartConvertedError
  | MarketChangedError
  | PriceChangedError
  | TotalsChangedError
  | InsufficientStockError
  | IllegalCheckoutTransitionError
  | PaymentsUnconfiguredError
  | ShippingUnavailableError
  | ShippingMethodUnavailableError
  | TaxUnavailableError
  | TaxUnconfiguredError
  | StaleWriteError;

export type RefundError =
  OverRefundError | IllegalTransitionError | ProviderError | ForbiddenError | TotpRequiredError;

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}

/**
 * What crosses the boundary to a client. `context` and `cause` are deliberately absent:
 * they are for the log, and a provider's error body or a constraint name must never
 * reach a shopper.
 */
export function toWireError(e: unknown): {
  code: ErrorCode;
  copyKey: string;
  httpStatus: number;
  fields?: Record<string, string[]>;
} {
  if (!isAppError(e)) {
    return { code: "INTERNAL", copyKey: "copy.error.internal", httpStatus: 500 };
  }
  const meta = ERROR_META[e.code];
  return {
    code: e.code,
    // An unsafe code resolves to the generic message, never its own.
    copyKey: meta.safe ? e.copyKey : "copy.error.internal",
    httpStatus: e.httpStatus,
    ...(e.fields ? { fields: e.fields } : {}),
  };
}
