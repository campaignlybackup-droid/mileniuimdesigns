import "server-only";
import crypto from "node:crypto";
import { secret } from "@/lib/config/env";

/**
 * Meta Conversions API (CAPI) — Prompt §31.
 * Sends server-side conversion events with deduplication event_id.
 */

export type MetaCapiEvent = {
  eventName: "Purchase" | "InitiateCheckout" | "AddToCart" | "ViewContent";
  eventId: string;
  eventTime?: number;
  eventSourceUrl?: string;
  userData: {
    email?: string;
    phone?: string;
    clientIpAddress?: string;
    clientUserAgent?: string;
  };
  customData: {
    currency: string;
    value: number;
    contentIds?: string[];
    contentType?: string;
    orderId?: string;
  };
};

function hashSha256(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return crypto.createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

export async function sendMetaCapiEvent(event: MetaCapiEvent): Promise<{ success: boolean; error?: string }> {
  // META_CAPI_ACCESS_TOKEN check
  const pixelId = secret("NEXT_PUBLIC_META_PIXEL_ID");
  const accessToken = secret("META_CAPI_ACCESS_TOKEN");

  if (!pixelId || !accessToken) {
    // Graceful unconfigured degradation per hard rule 7
    return { success: true };
  }

  const payload = {
    data: [
      {
        event_name: event.eventName,
        event_time: event.eventTime ?? Math.floor(Date.now() / 1000),
        event_id: event.eventId,
        event_source_url: event.eventSourceUrl,
        action_source: "website",
        user_data: {
          em: hashSha256(event.userData.email),
          ph: hashSha256(event.userData.phone),
          client_ip_address: event.userData.clientIpAddress,
          client_user_agent: event.userData.clientUserAgent,
        },
        custom_data: {
          currency: event.customData.currency,
          value: event.customData.value,
          content_ids: event.customData.contentIds,
          content_type: event.customData.contentType ?? "product",
          order_id: event.customData.orderId,
        },
      },
    ],
  };

  try {
    const res = await fetch(`https://graph.facebook.com/v19.0/${pixelId}/events?access_token=${accessToken}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error("[Meta CAPI Error]", errorText);
      return { success: false, error: errorText };
    }

    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "CAPI Network Error";
    console.error("[Meta CAPI Exception]", msg);
    return { success: false, error: msg };
  }
}
