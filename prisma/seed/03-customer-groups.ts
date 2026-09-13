import type { PrismaClient } from "@/generated/prisma/client";

/**
 * The default customer group.
 *
 * NOT in 09 P03's seed list — and that is a gap, not an omission we can leave. 02 §2.3
 * makes `customers.customer_group_id` NOT NULL, so without this row NO customer can be
 * inserted at all: not a registration, not a guest checkout. It would have surfaced at
 * P18 as "the first order fails", fifteen phases from the cause.
 *
 * `is_default` is what `createCustomer()` looks up when no group is specified. Exactly
 * one group may carry it.
 */
export async function seedCustomerGroups(db: PrismaClient): Promise<void> {
  await db.customerGroup.upsert({
    where: { key: "general" },
    update: {},
    create: {
      key: "general",
      name: "General",
      description:
        "Every customer who has not been placed in another group. Rule-based groups " +
        "(15 §1) assign membership on top of this; they never remove it.",
      isDefault: true,
    },
  });
}
