/**
 * The cron registry — 11 §5, 01 §5.6.
 *
 * THREE copies of this list have to agree: this constant, `vercel.json#crons`, and the
 * directories under `src/app/api/cron/`. `tests/unit/cron-registry.test.ts` asserts all
 * three are the same set.
 *
 * The check exists because the failure is silent in both directions. A handler with no
 * schedule never runs and looks fine in code review; a schedule with no handler 404s on
 * a timer nobody watches. 01 §5.6 shipped with NINE entries while the system needed ten —
 * `/api/cron/pricing-rule-windows` was cited by 04 §5.4 and was simply absent.
 */
export const CRON_JOBS = [
  {
    path: "/api/cron/release-reservations",
    schedule: "*/5 * * * *",
    breaksIfMissing:
      "Reservations never expire, so every abandoned checkout holds its stock forever and " +
      "a one-of-a-kind piece stays unbuyable after the first person who nearly bought it.",
    maxRuntimeSeconds: 60,
  },
  {
    path: "/api/cron/pricing-rule-windows",
    schedule: "*/5 * * * *",
    breaksIfMissing:
      "A scheduled sale opens or closes and no cached page notices. The admin shows it " +
      "active while the storefront charges the old price.",
    maxRuntimeSeconds: 60,
  },
  {
    path: "/api/cron/run-jobs",
    schedule: "*/5 * * * *",
    breaksIfMissing:
      "The entire queue stops. No confirmation emails, no scheduled publishes, no imports.",
    maxRuntimeSeconds: 300,
  },
  {
    path: "/api/cron/retry-webhooks",
    schedule: "*/15 * * * *",
    breaksIfMissing:
      "A transient provider failure becomes permanent: a paid order never reaches 'paid'.",
    maxRuntimeSeconds: 120,
  },
  {
    path: "/api/cron/abandoned-carts",
    schedule: "0 * * * *",
    breaksIfMissing: "No recovery mail. The mechanism exists and simply never fires.",
    maxRuntimeSeconds: 120,
  },
  {
    path: "/api/cron/metal-rate-refresh",
    schedule: "0 3 * * *",
    breaksIfMissing:
      "Metal rates go stale. Note it creates a PREVIEW only — it must never move a live " +
      "price, which is hard rule 6.",
    maxRuntimeSeconds: 120,
  },
  {
    path: "/api/cron/low-stock-digest",
    schedule: "0 4 * * *",
    breaksIfMissing: "Nobody is told a piece is about to run out; reordering becomes reactive.",
    maxRuntimeSeconds: 60,
  },
  {
    path: "/api/cron/sitemap-ping",
    schedule: "30 4 * * *",
    breaksIfMissing: "New products are not discovered until a crawler happens to return.",
    maxRuntimeSeconds: 120,
  },
  {
    path: "/api/cron/cleanup-sessions",
    schedule: "0 5 * * *",
    breaksIfMissing:
      "Sessions, OTP rows, rate limits and analytics grow without bound. The first symptom " +
      "is a slow query on a table nobody thought about.",
    maxRuntimeSeconds: 120,
  },
  {
    path: "/api/cron/reconcile-payments",
    schedule: "0 6 * * *",
    breaksIfMissing:
      "A payment taken but not recorded — or recorded but not taken — is never noticed. " +
      "Every dashboard balances while the money does not.",
    maxRuntimeSeconds: 300,
  },
] as const;

export const CRON_PATHS = CRON_JOBS.map((c) => c.path);
