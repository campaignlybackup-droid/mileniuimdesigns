import "server-only";
import { resolveMarket } from "@/lib/market";
import type { CurrencyCode, MarketCode } from "@/types/market";

/**
 * The payment provider registry — 01 §1.4, §2.3.
 *
 * **A REGISTRY KEYED ON `markets.payment_provider_key`, not a `switch` on `'US' | 'IN'`.**
 * A switch is the thing that makes "adding the UK is one row" false: the row goes in, the
 * market resolves, prices render, and checkout throws on a code path nobody remembered.
 *
 * `getProviderForMarket` returns `null` for a market whose provider is unregistered or unset,
 * and that is a SUPPORTED STATE, not an error. A market can legitimately exist before its
 * acquirer does — browsing and pricing work, checkout says so. Throwing here would make
 * launching a market in stages impossible, and would turn a product page into a 500.
 */

export type PaymentIntentInput = {
  orderId: string;
  amountMinor: bigint;
  currencyCode: CurrencyCode;
  idempotencyKey: string;
};

export type PaymentIntentResult = {
  providerIntentId: string;
  clientSecret: string | null;
};

export interface PaymentProvider {
  /** Matches `markets.payment_provider_key`. Not a union — a registration is a row plus a
   *  module, and neither is a type change. */
  readonly key: string;
  readonly supportedCurrencies: readonly string[];
  createIntent(input: PaymentIntentInput): Promise<PaymentIntentResult>;
  verifyWebhookSignature(rawBody: string, signature: string): boolean;
}

const providers = new Map<string, PaymentProvider>();

export function registerProvider(provider: PaymentProvider): void {
  providers.set(provider.key, provider);
}

export function registeredProviderKeys(): string[] {
  return [...providers.keys()].sort();
}

/**
 * The provider for a market, or `null`.
 *
 * Three ways to get `null`, all of them legitimate and all of them distinguishable by the
 * caller through `providerStatusForMarket` below:
 *   - the market has no `payment_provider_key` (not yet chosen),
 *   - the key names a provider nobody registered (a deploy is missing a module),
 *   - the provider does not support the market's currency (a misconfiguration).
 */
export async function getProviderForMarket(
  marketCode: string,
): Promise<PaymentProvider | null> {
  const status = await providerStatusForMarket(marketCode);
  return status.provider;
}

export type ProviderStatus = {
  provider: PaymentProvider | null;
  reason: "ok" | "no_key" | "unregistered" | "currency_unsupported";
  key: string | null;
};

export async function providerStatusForMarket(marketCode: string): Promise<ProviderStatus> {
  const market = await resolveMarket(marketCode);
  const key = market.paymentProviderKey;
  if (key === null || key === "") return { provider: null, reason: "no_key", key: null };

  const provider = providers.get(key);
  if (!provider) return { provider: null, reason: "unregistered", key };

  // The provider must actually quote this market's currency. A provider registered for USD
  // and silently used for an INR market is R02 arriving through the acquirer instead of
  // through the database.
  if (!provider.supportedCurrencies.includes(market.currencyCode)) {
    return { provider: null, reason: "currency_unsupported", key };
  }
  return { provider, reason: "ok", key };
}

/** Exported for the admin readiness panel, which lists every market and what it is missing. */
export async function providerReadiness(
  marketCodes: MarketCode[],
): Promise<{ marketCode: string; reason: ProviderStatus["reason"]; key: string | null }[]> {
  const out: { marketCode: string; reason: ProviderStatus["reason"]; key: string | null }[] =
    [];
  for (const code of marketCodes) {
    const status = await providerStatusForMarket(code);
    out.push({ marketCode: code, reason: status.reason, key: status.key });
  }
  return out;
}
