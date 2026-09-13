/**
 * THE permission catalogue — generated from docs/architecture/11-registries.md §1.3.
 *
 * This file is the single source of truth that `permissions` rows, `role_permissions`
 * rows and every `requirePermission()` call must agree with. Three copies of one list is
 * how a permission ends up enforced in the UI and not in the service, so
 * `tests/unit/rbac-catalogue.test.ts` asserts the three agree and fails CI on any
 * literal in src/ that is absent from here (07 §3.7).
 *
 * 73 keys. The count is pinned as a literal in the test on purpose: adding a key without
 * seeding it then fails at P03, where it is cheap, rather than at P29 where it is not.
 */

export const PERMISSIONS = [
  {
    key: "dashboard.view",
    resource: "dashboard",
    action: "view",
    description: "/admin, the KPI dashboard, global ⌘K search",
  },
  {
    key: "product.read",
    resource: "product",
    action: "read",
    description: "List and view products, variants, market content, completeness scores",
  },
  {
    key: "product.create",
    resource: "product",
    action: "create",
    description: "Create a product",
  },
  {
    key: "product.update",
    resource: "product",
    action: "update",
    description:
      "Edit product fields, market content, attribute values, stone/material/category/collection/tag membership, media order",
  },
  {
    key: "product.delete",
    resource: "product",
    action: "delete",
    description: "Soft-delete a product (products.deleted_at)",
  },
  {
    key: "product.publish",
    resource: "product",
    action: "publish",
    description:
      "products.status → active, published_at, product_market_content.is_published, archive",
  },
  {
    key: "variant.update",
    resource: "variant",
    action: "update",
    description: "Create, edit, retire variants, options, option values",
  },
  {
    key: "catalog.product_media",
    resource: "catalog",
    action: "product_media",
    description: "Attach, detach, reorder media on a product",
  },
  {
    key: "category.update",
    resource: "category",
    action: "update",
    description: "Category CRUD, tree moves, materialized_path rebuilds",
  },
  {
    key: "collection.update",
    resource: "collection",
    action: "update",
    description: "Collection CRUD, collection_rules, collection_rule_values",
  },
  {
    key: "stone.update",
    resource: "stone",
    action: "update",
    description: "Stone CRUD and product_stones links",
  },
  {
    key: "material.update",
    resource: "material",
    action: "update",
    description: "Material CRUD and variant_materials",
  },
  {
    key: "attribute.update",
    resource: "attribute",
    action: "update",
    description: "attributes / attribute_options CRUD",
  },
  {
    key: "tag.update",
    resource: "tag",
    action: "update",
    description: "tags / product_tags / media_tags / journal_post_tags / customer_tags CRUD",
  },
  {
    key: "media.read",
    resource: "media",
    action: "read",
    description: "Browse the library, view usage reports",
  },
  {
    key: "media.create",
    resource: "media",
    action: "create",
    description: "/api/media/sign, registerUpload(), create folders",
  },
  {
    key: "media.update",
    resource: "media",
    action: "update",
    description: "replaceMedia(), alt text, title, credit, folder move, tagging",
  },
  {
    key: "media.delete",
    resource: "media",
    action: "delete",
    description: "Soft-delete an asset (media.deleted_at), usage report runs first",
  },
  {
    key: "media.hard_delete",
    resource: "media",
    action: "hard_delete",
    description: "Permanently remove the provider asset (06 §7.8); type-to-confirm",
  },
  {
    key: "media.upload_vector",
    resource: "media",
    action: "upload_vector",
    description: "POST /api/media/svg — upload image/svg+xml",
  },
  {
    key: "price.read",
    resource: "price",
    action: "read",
    description:
      "prices, price_history, metal_rates, recalc previews — excluding cost and margin columns",
  },
  {
    key: "price.read_cost",
    resource: "price",
    action: "read_cost",
    description:
      'prices.cost_minor, variant_component_costs, every margin column and the "below cost" recalc flag',
  },
  {
    key: "price.update",
    resource: "price",
    action: "update",
    description: "Write a prices row; setManualPrice, setFormulaBinding",
  },
  {
    key: "price.recalc_preview",
    resource: "price",
    action: "recalc_preview",
    description: "createRecalcPreview(), rejectRecalcRun()",
  },
  {
    key: "price.approve_recalc",
    resource: "price",
    action: "approve_recalc",
    description: "approveRecalcRun(), applyRecalcRun(). Hard rule 6 lives on this key",
  },
  {
    key: "metal_rate.manage",
    resource: "metal_rate",
    action: "manage",
    description: "recordMetalRate(), /admin/pricing/metal-rates",
  },
  {
    key: "pricing_rule.manage",
    resource: "pricing_rule",
    action: "manage",
    description: "pricing_rules CRUD, including customer-group pricing",
  },
  {
    key: "inventory.read",
    resource: "inventory",
    action: "read",
    description: "inventory_items, inventory_transactions, low-stock, reservations",
  },
  {
    key: "inventory.adjust",
    resource: "inventory",
    action: "adjust",
    description:
      "adjustment, receipt, recount, write_off ledger rows; manual reservation release",
  },
  {
    key: "inventory.transfer",
    resource: "inventory",
    action: "transfer",
    description: "transfer_in / transfer_out between locations",
  },
  {
    key: "location.manage",
    resource: "location",
    action: "manage",
    description: "inventory_locations, market_locations",
  },
  {
    key: "order.read",
    resource: "order",
    action: "read",
    description:
      "Order list and detail (customer block gated separately by customer.read — 07 §2.4 note 2)",
  },
  {
    key: "order.create",
    resource: "order",
    action: "create",
    description: "Draft / phone orders (05 §6)",
  },
  {
    key: "order.update",
    resource: "order",
    action: "update",
    description:
      "Non-financial edits: internal note, pre-dispatch address, and releasing a pending_review hold (§7.4)",
  },
  {
    key: "order.discount_manual",
    resource: "order",
    action: "discount_manual",
    description:
      "Add a manual line discount to a draft order, capped by settings['orders.manual_discount_max_bp']",
  },
  {
    key: "order.fulfil",
    resource: "order",
    action: "fulfil",
    description: "Create shipments, mark fulfilled, print packing slips",
  },
  {
    key: "order.cancel",
    resource: "order",
    action: "cancel",
    description: "Transition to cancelled, release reservations",
  },
  {
    key: "order.refund",
    resource: "order",
    action: "refund",
    description: "refundPayment(), write refunds, webhook replay",
  },
  {
    key: "return.read",
    resource: "return",
    action: "read",
    description: "RMA list and detail",
  },
  {
    key: "return.update",
    resource: "return",
    action: "update",
    description: "Update a return, record receipt, restock",
  },
  {
    key: "return.approve",
    resource: "return",
    action: "approve",
    description: "Approve or reject a return request",
  },
  {
    key: "customer.read",
    resource: "customer",
    action: "read",
    description: "Customer record, addresses, and the customer block of an order",
  },
  {
    key: "customer.update",
    resource: "customer",
    action: "update",
    description: "Edit customer fields, group, internal note",
  },
  {
    key: "customer.export",
    resource: "customer",
    action: "export",
    description:
      "Any bulk export whose resource carries customer PII. Required in addition to export.run",
  },
  {
    key: "customer.anonymize",
    resource: "customer",
    action: "anonymize",
    description: "anonymizeCustomer() — the erasure routine (07 §8.3)",
  },
  {
    key: "user.impersonate",
    resource: "user",
    action: "impersonate",
    description: "startImpersonation() (07 §1.11)",
  },
  {
    key: "coupon.manage",
    resource: "coupon",
    action: "manage",
    description: "coupons, coupon_amounts, coupon_conditions, gift-card issuance",
  },
  {
    key: "campaign.manage",
    resource: "campaign",
    action: "manage",
    description: "campaigns CRUD and scheduling",
  },
  {
    key: "newsletter.manage",
    resource: "newsletter",
    action: "manage",
    description: "Subscriber list, send-list export, suppression",
  },
  {
    key: "cms.read",
    resource: "cms",
    action: "read",
    description: "Pages, sections, blocks, getDraftPage, version history, diffs",
  },
  {
    key: "cms.update",
    resource: "cms",
    action: "update",
    description:
      "applyBuilderOps, every builder autosave, per-breakpoint config. Does not include restore (row 53)",
  },
  {
    key: "cms.publish",
    resource: "cms",
    action: "publish",
    description:
      "publishPage, publishVersion, schedulePage, unpublishPage, archivePage; journal publish",
  },
  {
    key: "cms.restore",
    resource: "cms",
    action: "restore",
    description:
      "restoreVersion() and version pinning. Restore writes to the draft; going live still needs cms.publish",
  },
  {
    key: "cms.delete",
    resource: "cms",
    action: "delete",
    description: "Soft-delete a cms_pages row (deleted_at)",
  },
  {
    key: "content.preview",
    resource: "content",
    action: "preview",
    description:
      "createPreviewToken(), revokePreviewToken() — minting a link a stranger can open",
  },
  {
    key: "journal.manage",
    resource: "journal",
    action: "manage",
    description: "journal_posts CRUD and publish",
  },
  {
    key: "menu.manage",
    resource: "menu",
    action: "manage",
    description: "navigation_menus / navigation_items, saveMenu()",
  },
  {
    key: "redirect.manage",
    resource: "redirect",
    action: "manage",
    description: "redirects CRUD and CSV import",
  },
  {
    key: "seo.manage",
    resource: "seo",
    action: "manage",
    description: "seo_metadata overrides, curated_facets, robots directives",
  },
  {
    key: "market.preview",
    resource: "market",
    action: "preview",
    description: "Mint a market-preview token (04 §7.2); reach /_preview/",
  },
  {
    key: "market.manage",
    resource: "market",
    action: "manage",
    description: "markets, currencies, market_locations, payment-provider binding, activation",
  },
  {
    key: "settings.read",
    resource: "settings",
    action: "read",
    description: "Read non-secret settings rows: copy, thresholds, shipping bands",
  },
  {
    key: "settings.manage",
    resource: "settings",
    action: "manage",
    description: "Write settings (feature flags, retention, error copy) and email_templates",
  },
  {
    key: "integration.manage",
    resource: "integration",
    action: "manage",
    description: "Integration status, /admin/system/webhooks console, /api/health?verbose=1",
  },
  {
    key: "user.manage",
    resource: "user",
    action: "manage",
    description:
      "Invite, edit, deactivate staff; assign roles; resetTotp, unlockUser — subject to 07 §2.6",
  },
  {
    key: "role.manage",
    resource: "role",
    action: "manage",
    description: "Create roles, edit role_permissions",
  },
  {
    key: "audit.read",
    resource: "audit",
    action: "read",
    description: "/admin/system/audit-log",
  },
  {
    key: "import.run",
    resource: "import",
    action: "run",
    description:
      "Reach the import tool, upload a CSV, run the bounded dry run. Never authorises the apply (§1.5)",
  },
  {
    key: "export.run",
    resource: "export",
    action: "run",
    description:
      "Reach the export tool. Each resource additionally needs its own read permission",
  },
  {
    key: "job.read",
    resource: "job",
    action: "read",
    description: "/admin/system/jobs, /api/admin/jobs/[id]/stream",
  },
  { key: "job.retry", resource: "job", action: "retry", description: "Requeue a failed job" },
  {
    key: "search.manage",
    resource: "search",
    action: "manage",
    description: "Zero-result report, synonyms, promotions, search redirects, manual reindex",
  },
  {
    key: "review.moderate",
    resource: "review",
    action: "moderate",
    description:
      "/admin/catalog/reviews: approve, reject and unpublish a product_reviews row; nothing else writes product_reviews.status",
  },
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number]["key"];

export const PERMISSION_KEYS: readonly PermissionKey[] = PERMISSIONS.map((p) => p.key);

/** Role keys are 02 §2.2 verbatim. `is_system` roles; the admin may not rename them. */
export const ROLE_KEYS = [
  "owner",
  "admin",
  "catalog_manager",
  "inventory_manager",
  "order_manager",
  "content_editor",
  "analyst",
] as const;

export type RoleKey = (typeof ROLE_KEYS)[number];

/**
 * The complete role → permission matrix — docs/architecture/11-registries.md §1.4,
 * which supersedes 07 §2.5.
 *
 * `owner` holds all 73 by EXPLICIT ROWS, never by a runtime short-circuit such as
 * `if (role === "owner") return true`. A short-circuit cannot be audited, cannot be
 * revoked for one key, and silently grants every permission added in future.
 */
export const ROLE_MATRIX: Record<RoleKey, readonly PermissionKey[]> = {
  owner: [
    "dashboard.view",
    "product.read",
    "product.create",
    "product.update",
    "product.delete",
    "product.publish",
    "variant.update",
    "catalog.product_media",
    "category.update",
    "collection.update",
    "stone.update",
    "material.update",
    "attribute.update",
    "tag.update",
    "media.read",
    "media.create",
    "media.update",
    "media.delete",
    "media.hard_delete",
    "media.upload_vector",
    "price.read",
    "price.read_cost",
    "price.update",
    "price.recalc_preview",
    "price.approve_recalc",
    "metal_rate.manage",
    "pricing_rule.manage",
    "inventory.read",
    "inventory.adjust",
    "inventory.transfer",
    "location.manage",
    "order.read",
    "order.create",
    "order.update",
    "order.discount_manual",
    "order.fulfil",
    "order.cancel",
    "order.refund",
    "return.read",
    "return.update",
    "return.approve",
    "customer.read",
    "customer.update",
    "customer.export",
    "customer.anonymize",
    "user.impersonate",
    "coupon.manage",
    "campaign.manage",
    "newsletter.manage",
    "cms.read",
    "cms.update",
    "cms.publish",
    "cms.restore",
    "cms.delete",
    "content.preview",
    "journal.manage",
    "menu.manage",
    "redirect.manage",
    "seo.manage",
    "market.preview",
    "market.manage",
    "settings.read",
    "settings.manage",
    "integration.manage",
    "user.manage",
    "role.manage",
    "audit.read",
    "import.run",
    "export.run",
    "job.read",
    "job.retry",
    "search.manage",
    "review.moderate",
  ],
  admin: [
    "dashboard.view",
    "product.read",
    "product.create",
    "product.update",
    "product.delete",
    "product.publish",
    "variant.update",
    "catalog.product_media",
    "category.update",
    "collection.update",
    "stone.update",
    "material.update",
    "attribute.update",
    "tag.update",
    "media.read",
    "media.create",
    "media.update",
    "media.delete",
    "media.upload_vector",
    "price.read",
    "price.read_cost",
    "price.update",
    "price.recalc_preview",
    "price.approve_recalc",
    "metal_rate.manage",
    "pricing_rule.manage",
    "inventory.read",
    "inventory.adjust",
    "inventory.transfer",
    "location.manage",
    "order.read",
    "order.create",
    "order.update",
    "order.discount_manual",
    "order.fulfil",
    "order.cancel",
    "order.refund",
    "return.read",
    "return.update",
    "return.approve",
    "customer.read",
    "customer.update",
    "customer.export",
    "user.impersonate",
    "coupon.manage",
    "campaign.manage",
    "newsletter.manage",
    "cms.read",
    "cms.update",
    "cms.publish",
    "cms.restore",
    "cms.delete",
    "content.preview",
    "journal.manage",
    "menu.manage",
    "redirect.manage",
    "seo.manage",
    "market.preview",
    "settings.read",
    "settings.manage",
    "user.manage",
    "audit.read",
    "import.run",
    "export.run",
    "job.read",
    "job.retry",
    "search.manage",
    "review.moderate",
  ],
  catalog_manager: [
    "dashboard.view",
    "product.read",
    "product.create",
    "product.update",
    "product.delete",
    "product.publish",
    "variant.update",
    "catalog.product_media",
    "category.update",
    "collection.update",
    "stone.update",
    "material.update",
    "attribute.update",
    "tag.update",
    "media.read",
    "media.create",
    "media.update",
    "price.read",
    "price.update",
    "price.recalc_preview",
    "metal_rate.manage",
    "pricing_rule.manage",
    "inventory.read",
    "cms.read",
    "content.preview",
    "seo.manage",
    "market.preview",
    "settings.read",
    "import.run",
    "export.run",
    "job.read",
    "search.manage",
    "review.moderate",
  ],
  inventory_manager: [
    "dashboard.view",
    "product.read",
    "media.read",
    "inventory.read",
    "inventory.adjust",
    "inventory.transfer",
    "location.manage",
    "order.read",
    "order.fulfil",
    "return.read",
    "return.update",
    "customer.read",
    "settings.read",
    "import.run",
    "export.run",
    "job.read",
  ],
  order_manager: [
    "dashboard.view",
    "product.read",
    "media.read",
    "price.read",
    "inventory.read",
    "order.read",
    "order.create",
    "order.update",
    "order.discount_manual",
    "order.fulfil",
    "order.cancel",
    "order.refund",
    "return.read",
    "return.update",
    "return.approve",
    "customer.read",
    "customer.update",
    "settings.read",
    "export.run",
    "job.read",
  ],
  content_editor: [
    "dashboard.view",
    "product.read",
    "catalog.product_media",
    "tag.update",
    "media.read",
    "media.create",
    "media.update",
    "media.delete",
    "campaign.manage",
    "newsletter.manage",
    "cms.read",
    "cms.update",
    "cms.publish",
    "cms.restore",
    "content.preview",
    "journal.manage",
    "menu.manage",
    "redirect.manage",
    "seo.manage",
    "market.preview",
    "settings.read",
    "search.manage",
  ],
  analyst: [
    "dashboard.view",
    "product.read",
    "media.read",
    "price.read",
    "inventory.read",
    "order.read",
    "return.read",
    "cms.read",
    "settings.read",
    "export.run",
  ],
};

/** Every key the matrix grants to anybody. Must equal PERMISSION_KEYS as a set. */
export function grantedKeys(): Set<PermissionKey> {
  return new Set(Object.values(ROLE_MATRIX).flat());
}

/**
 * The TOTP privilege line — 07 §1.9.
 *
 * The brief says "optional". The decision is: optional for roles that cannot move money
 * or grant access, MANDATORY for roles that can. "Optional" for a role that can issue a
 * refund means "off", because nobody enrols voluntarily — and a phished password on one
 * of those accounts is a same-day loss.
 *
 * The line is DERIVED from the matrix, not maintained beside it: granting a new role
 * `order.refund` makes TOTP mandatory for its holders with no second edit and no chance
 * of the two lists drifting apart.
 */
export const TOTP_REQUIRED_PERMISSIONS = [
  "order.refund",
  "order.discount_manual",
  "price.approve_recalc",
  "price.update",
  "customer.export",
  "customer.anonymize",
  "user.manage",
  "user.impersonate",
  "role.manage",
  "settings.manage",
  "integration.manage",
  "market.manage",
  "media.hard_delete",
] as const satisfies readonly PermissionKey[];

/** Does this permission set cross the privilege line? */
export function requiresTotp(permissions: Iterable<PermissionKey>): boolean {
  const line = new Set<string>(TOTP_REQUIRED_PERMISSIONS);
  for (const p of permissions) if (line.has(p)) return true;
  return false;
}

/** Which of the seven launch roles must enrol. Derived, never hand-listed. */
export function rolesRequiringTotp(): RoleKey[] {
  return ROLE_KEYS.filter((r) => requiresTotp(ROLE_MATRIX[r]));
}
