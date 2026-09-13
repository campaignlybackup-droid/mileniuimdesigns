import type { PrismaClient } from "@/generated/prisma/client";

/**
 * Email templates — 06 §12.
 *
 * Subject and heading only. The BODY is deliberately empty: every one of these is
 * customer-facing brand copy, and writing it here would be inventing the client's voice.
 * An unedited template renders its structure with empty fields; it never ships lorem
 * ipsum or invented marketing prose (hard rule 8).
 *
 * Variables are substituted at send time and escaped: {{customer_name}},
 * {{order_number}}, {{order_total}}, {{tracking_number}}.
 */
const TEMPLATES = [
  { key: "welcome", subject: "Welcome to Millennium Designs", heading: "Welcome" },
  { key: "order_confirmation", subject: "Your order {{order_number}}", heading: "Thank you for your order" },
  { key: "payment_confirmation", subject: "Payment received for {{order_number}}", heading: "Payment received" },
  { key: "order_shipped", subject: "Your order {{order_number}} has shipped", heading: "On its way" },
  { key: "order_delivered", subject: "Your order {{order_number}} has arrived", heading: "Delivered" },
  { key: "order_cancelled", subject: "Your order {{order_number}} has been cancelled", heading: "Order cancelled" },
  { key: "refund_issued", subject: "Refund issued for {{order_number}}", heading: "Refund issued" },
  { key: "password_reset", subject: "Reset your password", heading: "Reset your password" },
  { key: "contact_enquiry", subject: "We received your message", heading: "Thank you for writing" },
  { key: "gift_card_issued", subject: "A gift card from Millennium Designs", heading: "A gift for you" },
  { key: "back_in_stock", subject: "A piece you saved is available", heading: "Available again" },
] as const;

export async function seedEmailTemplates(db: PrismaClient): Promise<void> {
  for (const t of TEMPLATES) {
    const existing = await db.emailTemplate.findFirst({ where: { key: t.key, marketCode: null } });
    if (existing) continue; // never overwrite copy the client has edited
    await db.emailTemplate.create({
      data: {
        key: t.key,
        marketCode: null,
        subject: t.subject,
        heading: t.heading,
        bodyJson: {},
        footerJson: {},
        isActive: true,
      },
    });
  }
}
