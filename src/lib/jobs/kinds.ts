import "server-only";

/**
 * Per-kind job metadata — 11 §3.2, §3.3.
 *
 * `systemPermitted` is a PER-KIND FLAG, not a closed allowlist of three kinds. That
 * distinction is the whole finding: the first draft allowed a NULL `created_by_user_id`
 * for three named kinds, and `send_email` was not among them — so the order-confirmation
 * email, enqueued by a webhook that has no user, would have been refused at run time.
 * Silently, from the first paid order.
 *
 * `dedupeKey` says what a second queued job of the same kind means:
 *   'kind'   — one at a time, globally (a full reindex)
 *   'entity' — one per entity (publishing page X)
 *   'market' — one per market (rebuilding a feed)
 *   null     — freely concurrent (sending one email)
 */
export type JobKindKey =
  | "import_apply" | "export" | "bulk_edit" | "recalc_apply" | "collection_refresh"
  | "sitemap_rebuild" | "email_batch" | "reindex_search" | "publish_scheduled"
  | "media_orphan_scan" | "product_metrics_refresh" | "consistency_check"
  | "reconcile_inventory" | "send_email" | "analytics_dispatch" | "feed_rebuild"
  | "audit_archive" | "account_export" | "customer_group_refresh";

export type JobKindMeta = {
  /** May this kind run with no originating human? */
  readonly systemPermitted: boolean;
  readonly dedupeKey: "kind" | "entity" | "market" | null;
  readonly maxAttempts: number;
  /** Seconds after which a claimed-but-silent job is considered dead. */
  readonly staleAfterSeconds: number;
  readonly description: string;
};

export const JOB_KINDS: Record<JobKindKey, JobKindMeta> = {
  // ── Human-originated. A NULL creator here means something is wrong, and running as
  //    system would launder the requester's permissions away.
  import_apply: { systemPermitted: false, dedupeKey: "entity", maxAttempts: 1, staleAfterSeconds: 900,
    description: "Apply a validated CSV import. Requires the resource's own write permission." },
  export: { systemPermitted: false, dedupeKey: null, maxAttempts: 2, staleAfterSeconds: 900,
    description: "Staff-requested export. Requires the resource's read permission, plus customer.export for PII." },
  bulk_edit: { systemPermitted: false, dedupeKey: null, maxAttempts: 1, staleAfterSeconds: 900,
    description: "Bulk field edit. Re-checks the single-edit permission PER ROW against the queuing user." },
  recalc_apply: { systemPermitted: false, dedupeKey: "entity", maxAttempts: 1, staleAfterSeconds: 1800,
    description: "Apply an APPROVED price recalculation. Never enqueued by a cron (hard rule 6)." },
  email_batch: { systemPermitted: false, dedupeKey: null, maxAttempts: 3, staleAfterSeconds: 600,
    description: "A staff-initiated campaign send." },

  // ── Machine-originated. These have no human by design.
  collection_refresh: { systemPermitted: true, dedupeKey: "kind", maxAttempts: 3, staleAfterSeconds: 600,
    description: "Re-evaluate automated collection rules." },
  sitemap_rebuild: { systemPermitted: true, dedupeKey: "kind", maxAttempts: 3, staleAfterSeconds: 600,
    description: "Rebuild sitemap shards." },
  reindex_search: { systemPermitted: true, dedupeKey: "kind", maxAttempts: 3, staleAfterSeconds: 900,
    description: "Rebuild products.search_text." },
  publish_scheduled: { systemPermitted: true, dedupeKey: "entity", maxAttempts: 3, staleAfterSeconds: 300,
    description: "Publish content whose scheduled time has arrived." },
  media_orphan_scan: { systemPermitted: true, dedupeKey: "kind", maxAttempts: 2, staleAfterSeconds: 900,
    description: "Find media rows nothing references." },
  product_metrics_refresh: { systemPermitted: true, dedupeKey: "kind", maxAttempts: 2, staleAfterSeconds: 900,
    description: "Refresh product_market_sort.units_90d and the two reporting rollups. One kind, three tables." },
  consistency_check: { systemPermitted: true, dedupeKey: "kind", maxAttempts: 2, staleAfterSeconds: 900,
    description: "Cross-table invariant sweep." },
  reconcile_inventory: { systemPermitted: true, dedupeKey: "kind", maxAttempts: 2, staleAfterSeconds: 900,
    description: "Re-derive available quantities from the ledger." },
  // THE one that was refused. A webhook writes this row, so it has no user.
  send_email: { systemPermitted: true, dedupeKey: "entity", maxAttempts: 5, staleAfterSeconds: 300,
    description: "Send one transactional email. Enqueued inside the webhook transaction so a paid order's confirmation is never lost." },
  analytics_dispatch: { systemPermitted: true, dedupeKey: null, maxAttempts: 3, staleAfterSeconds: 300,
    description: "Forward events to a configured analytics provider." },
  feed_rebuild: { systemPermitted: true, dedupeKey: "market", maxAttempts: 3, staleAfterSeconds: 900,
    description: "Rebuild a product feed. Per market — two markets may rebuild concurrently." },
  audit_archive: { systemPermitted: true, dedupeKey: "kind", maxAttempts: 3, staleAfterSeconds: 1800,
    description: "Weekly off-site audit copy. Its own kind, NOT 'export' — filing a machine-scheduled archive under a human-only kind is the laundering the rule exists to stop." },
  // Enqueued by a CUSTOMER session, so it has no staff user either.
  account_export: { systemPermitted: true, dedupeKey: "entity", maxAttempts: 3, staleAfterSeconds: 900,
    description: "A customer's own subject-access bundle. Reads only that customer's rows." },
  customer_group_refresh: { systemPermitted: true, dedupeKey: "entity", maxAttempts: 2, staleAfterSeconds: 900,
    description: "Re-evaluate rule-based customer group membership." },
};

export const JOB_KIND_KEYS = Object.keys(JOB_KINDS) as JobKindKey[];

/** Kinds that may hold only one queued-or-running row globally. Must match
 *  `idx_jobs_singleton`'s IN list exactly, which a test asserts. */
export const SINGLETON_KINDS = JOB_KIND_KEYS.filter((k) => JOB_KINDS[k].dedupeKey === "kind");
