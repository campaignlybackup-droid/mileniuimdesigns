import type { PrismaClient } from "@/generated/prisma/client";
import { PERMISSIONS, ROLE_MATRIX, ROLE_KEYS } from "@/lib/rbac/catalogue";

const ROLE_META: Record<(typeof ROLE_KEYS)[number], { name: string; description: string; rank: number }> = {
  owner: { name: "Owner", description: "Every permission. Holds them by explicit rows, never by a short-circuit.", rank: 1 },
  admin: { name: "Administrator", description: "Everything except destructive media deletion and the highest-level system settings.", rank: 2 },
  catalog_manager: { name: "Catalogue manager", description: "Products, variants, categories, collections, stones, materials, media and reviews.", rank: 3 },
  inventory_manager: { name: "Inventory manager", description: "Stock levels, adjustments, transfers and locations.", rank: 4 },
  order_manager: { name: "Order manager", description: "Orders, fulfilment, returns and refunds.", rank: 5 },
  content_editor: { name: "Content editor", description: "Pages, the homepage, journal, navigation, media and SEO.", rank: 6 },
  analyst: { name: "Analyst", description: "Read-only reporting. No write permission anywhere, and no access to cost.", rank: 7 },
};

/**
 * Roles, the 73 permissions, and the grant matrix — 11 §1.3 and §1.4.
 *
 * The seed writes `role_permissions` from ROLE_MATRIX rather than computing it, so the
 * running system and the document are the same list. `owner` gets 73 explicit rows: a
 * runtime `if (role === "owner") return true` cannot be audited, cannot be revoked for
 * one key, and silently grants every permission added in future.
 */
export async function seedRoles(db: PrismaClient): Promise<void> {
  for (const p of PERMISSIONS) {
    await db.permission.upsert({
      where: { key: p.key },
      update: { resource: p.resource, action: p.action, description: p.description },
      create: { key: p.key, resource: p.resource, action: p.action, description: p.description },
    });
  }

  for (const key of ROLE_KEYS) {
    const meta = ROLE_META[key];
    const role = await db.role.upsert({
      where: { key },
      update: { name: meta.name, description: meta.description, rank: meta.rank },
      create: { key, name: meta.name, description: meta.description, isSystem: true, rank: meta.rank },
    });

    const granted = ROLE_MATRIX[key];

    // Idempotent AND convergent: re-running after the matrix changes must remove grants
    // the matrix no longer contains. An additive-only seed silently keeps a permission
    // that was deliberately revoked.
    await db.rolePermission.deleteMany({
      where: { roleId: role.id, permissionKey: { notIn: [...granted] } },
    });

    for (const permissionKey of granted) {
      await db.rolePermission.upsert({
        where: { roleId_permissionKey: { roleId: role.id, permissionKey } },
        update: {},
        create: { roleId: role.id, permissionKey },
      });
    }
  }
}
