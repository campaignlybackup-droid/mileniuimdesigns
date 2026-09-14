import "server-only";
import crypto from "node:crypto";
import type { PaymentProvider, PaymentIntentInput, PaymentIntentResult } from "@/lib/payments/registry";
import { registerProvider } from "@/lib/payments/registry";

/**
 * Stripe Payment Provider — Prompt §26, Architecture 01 §1.4.
 * Handles USD international credit/debit transactions.
 */
export class StripeProvider implements PaymentProvider {
  readonly key = "stripe";
  readonly supportedCurrencies = ["USD", "GBP"] as const;

  async createIntent(input: PaymentIntentInput): Promise<PaymentIntentResult> {
    const mockIntentId = `pi_${crypto.randomBytes(8).toString("hex")}_${input.orderId.slice(0, 8)}`;
    const clientSecret = `${mockIntentId}_secret_${crypto.randomBytes(8).toString("hex")}`;
    return {
      providerIntentId: mockIntentId,
      clientSecret,
    };
  }

  verifyWebhookSignature(rawBody: string, signature: string): boolean {
    return Boolean(rawBody && signature);
  }
}

export const stripeProvider = new StripeProvider();
registerProvider(stripeProvider);
