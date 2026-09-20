/**
 * WhatsApp Messaging & Concierge Service — Prompt §28, §29.
 * Provides pre-filled concierge links, order assistance, and server-side notification stubs.
 */

export const MILLENNIUM_WHATSAPP_NUMBER = "919820000000"; // Official Millennium Designs Concierge

export function buildWhatsAppInquiryUrl(options: {
  orderNumber?: string;
  productTitle?: string;
  topic?: "order" | "bespoke" | "wholesale" | "general";
}): string {
  let text = "Hello Millennium Designs, ";

  if (options.orderNumber) {
    text += `I have a question regarding my Order #${options.orderNumber}. Could you please assist me?`;
  } else if (options.productTitle) {
    text += `I am inquiring about the ${options.productTitle} creation and would like to know more details.`;
  } else if (options.topic === "bespoke") {
    text += "I would like to schedule a private atelier consultation for a bespoke jewellery commission.";
  } else if (options.topic === "wholesale") {
    text += "I would like to enquire about wholesale / trade pricing for 925 sterling silver jewellery.";
  } else {
    text += "I would like to speak with a jewellery concierge.";
  }

  return `https://wa.me/${MILLENNIUM_WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
}

export type WhatsAppMessagePayload = {
  to: string;
  templateName: string;
  parameters: Record<string, string>;
};

export async function sendWhatsAppNotification(
  payload: WhatsAppMessagePayload,
): Promise<{ success: boolean; messageId?: string }> {
  // Server-side WhatsApp Cloud API or approved Business provider hook
  // In production, uses WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID
  console.log(`[WhatsApp Notification] Template ${payload.templateName} to ${payload.to}`, payload.parameters);
  return {
    success: true,
    messageId: `wa_msg_${Date.now()}`,
  };
}
