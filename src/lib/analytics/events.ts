/**
 * Unified Analytics Dispatcher — Prompt §30, §33, §34.
 * Emits Meta Pixel, GA4, and Google Tag Manager e-commerce events with client-side deduplication event_id.
 */

export type AnalyticsItem = {
  item_id: string;
  item_name: string;
  price: number;
  currency: string;
  quantity?: number;
  category?: string;
};

export type TrackEventOptions = {
  eventId?: string;
  value?: number;
  currency?: string;
  items?: AnalyticsItem[];
  searchQuery?: string;
};

declare global {
  interface Window {
    dataLayer?: unknown[];
    fbq?: (...args: unknown[]) => void;
    gtag?: (...args: unknown[]) => void;
  }
}

export function generateEventId(): string {
  return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function trackEvent(eventName: string, options: TrackEventOptions = {}): void {
  if (typeof window === "undefined") return;

  const eventId = options.eventId ?? generateEventId();

  // 1. Google Tag Manager / GA4 DataLayer
  window.dataLayer = window.dataLayer ?? [];
  window.dataLayer.push({
    event: eventName,
    event_id: eventId,
    value: options.value,
    currency: options.currency,
    search_term: options.searchQuery,
    ecommerce: options.items
      ? {
          currency: options.currency,
          value: options.value,
          items: options.items.map((it) => ({
            item_id: it.item_id,
            item_name: it.item_name,
            price: it.price,
            quantity: it.quantity ?? 1,
            item_category: it.category,
          })),
        }
      : undefined,
  });

  // 2. Meta Pixel (Standard events mapping Prompt §30)
  if (typeof window.fbq === "function") {
    const metaPayload: Record<string, unknown> = {
      event_id: eventId,
      value: options.value,
      currency: options.currency,
    };

    if (options.items && options.items.length > 0) {
      metaPayload.content_ids = options.items.map((i) => i.item_id);
      metaPayload.content_type = "product";
      metaPayload.content_name = options.items[0]?.item_name;
    }

    if (eventName === "view_item") {
      window.fbq("track", "ViewContent", metaPayload, { eventID: eventId });
    } else if (eventName === "add_to_cart") {
      window.fbq("track", "AddToCart", metaPayload, { eventID: eventId });
    } else if (eventName === "begin_checkout") {
      window.fbq("track", "InitiateCheckout", metaPayload, { eventID: eventId });
    } else if (eventName === "add_payment_info") {
      window.fbq("track", "AddPaymentInfo", metaPayload, { eventID: eventId });
    } else if (eventName === "purchase") {
      window.fbq("track", "Purchase", metaPayload, { eventID: eventId });
    } else if (eventName === "search") {
      window.fbq("track", "Search", { ...metaPayload, search_string: options.searchQuery }, { eventID: eventId });
    } else {
      window.fbq("trackCustom", eventName, metaPayload, { eventID: eventId });
    }
  }
}
