# 07 — Authentication, Authorization, RBAC and Security Architecture

Scope: who you are, what you are allowed to do, the one place that decision is
made, and everything that keeps the rest of the system from being talked out of
it. Table and column names are taken verbatim from `02`; permission keys are
taken verbatim from `08` §5 and extended here into the complete catalogue, which
this document owns. Commerce invariants (pricing, stock, totals, webhooks) are
**not** re-specified here — §6 restates them as enforceable controls and points at
the section that owns each mechanism.

A short list of additions to the canonical schema — two columns, two enum values
and two indexes — plus a handful of environment variables are required by this
section. Each is flagged in place with a `SCHEMA ADDITION` or `ADDS TO 01 §4.3`
callout; nothing else in `01`/`02` is contradicted. The one place this section
*does* override a foundation document is `01` §5.8's claim that rotating
`AUTH_SECRET` logs everyone out: with opaque session tokens (§1.2) **sessions**
survive it. That override is about sessions only — §1.9 shows why rotation still
cannot be a one-line change while TOTP secrets are encrypted under a key derived
from that value, and specifies the versioned two-key procedure that makes it
survivable. Both corrections are stated in place.

New service folder, an addition to `01` §3:

```
src/lib/security/          # origin check, client IP extraction, redaction,
                           # route manifest. No DB access, no domain knowledge.
├── origin.ts              # assertSameOrigin()
├── ip.ts                  # clientIp(), rateLimitIpKey()
├── redact.ts              # redact() for audit + logs
└── route-manifest.ts      # the machine-readable copy of 08 §2.2
```

---

## 1. Authentication

### 1.1 Two populations, two tables, two cookies

`02` §2.2 already decided that staff (`users`) and customers (`customers`) are
distinct tables with distinct write paths, and that `sessions` serves both through
the mutually-exclusive pair `user_id` / `customer_id` guarded by
`chk_sessions_one_principal`. This section does not relitigate that. What follows
is the consequence: **two cookies, two TTLs, two threat models, one session
table.**

| | Staff | Customer |
| --- | --- | --- |
| Identity table | `users` | `customers` |
| Cookie | `md_admin` | `md_session` |
| Principal column | `sessions.user_id` | `sessions.customer_id` |
| Absolute TTL | `ADMIN_SESSION_TTL_HOURS` (default `12`) | `SESSION_TTL_HOURS` (default `720`) |
| Idle TTL | `ADMIN_SESSION_IDLE_MINUTES` (default `60`) | none |
| `SameSite` | `Strict` | `Lax` |
| Second factor | TOTP, mandatory above a privilege line (§1.9) | none |
| Self-service registration | **never** — invitation only (§1.6) | yes (§1.7) |
| Lockout on failed passwords | yes, `users.failed_login_count` / `users.locked_until` | **no** — rate limits only (§5.6) |

The two cookies are separate names, not one cookie with a discriminator, for a
reason that shows up the first time a staff member shops on the site: a staff
member browsing the storefront while signed into the admin holds **both** at once,
and impersonation (§1.11) deliberately makes one browser hold a staff session and
a customer session simultaneously. One cookie could not represent that, and the
workaround would be to drop the admin session on impersonation — which is exactly
how you lose the ability to end impersonation safely.

**Because one browser holds both cookies, "which cookie wins" must never be a
question the resolver answers by precedence.** A resolver that reads `md_admin`
first makes the storefront treat a shopping staff member as staff — and
`requireCustomer()` then throws on their own cart; a resolver that reads
`md_session` first makes an admin page resolve to a customer. Both are bugs, and
the second is a confused deputy waiting for a caller that forgot to re-check.
**Decision: the caller names the population it wants; there is no precedence
rule.** `getStaffActor()` reads only `md_admin`, `getCustomerActor()` reads only
`md_session`, and each additionally asserts that the resolved row carries the
matching principal column — `sessions.user_id IS NOT NULL` for staff,
`sessions.customer_id IS NOT NULL` for customers. A token presented in the wrong
cookie (the impersonation token pasted into `md_admin`, say) resolves to a row
whose principal column is `NULL` for that population and is rejected as
unauthenticated, with an audit row `action = 'session_cookie_mismatch'`. §3.2
fixes which wrapper calls which.

### 1.2 Session mechanism: opaque database sessions, not stateless JWTs

**The fork.** A stateless JWT session cookie costs zero database reads per
request; every page render verifies a signature and is done. A database session is
one indexed lookup per authenticated request, but the record of "who is signed in"
lives somewhere we can change.

**Decision: an opaque 256-bit random token in a cookie, SHA-256 hashed into
`sessions.token_hash`, looked up on every authenticated request.** Four
requirements make this not a close call:

1. **Instant revocation is a product feature, not an optimisation.** `02` already
   ships `sessions.revoked_at`, `idx_sessions_customer` for "sign out everywhere",
   and `ON DELETE CASCADE` from `users` so deactivating staff kills their sessions.
   A JWT cannot be un-issued; the standard workaround is a revocation list, which
   is a database read per request — the cost we were avoiding — plus a second
   source of truth.
2. **A staff member's permissions change mid-session.** Roles are rows
   (`user_roles`, `role_permissions`). If permissions were baked into a 12-hour
   JWT, removing `order.refund` from a role would not take effect for 12 hours, on
   the one occasion anybody ever removes it in a hurry.
3. **Impersonation needs a first-class session row.** `sessions
   .impersonator_user_id` is how both actors reach `audit_logs`; there is no
   equivalent that survives a stateless token without putting staff identity
   inside a customer's cookie.
4. **The cost is already paid.** Every admin route is `force-dynamic` and every
   customer-scoped route is `no-store` (`01` §1.3, §2.4). There is no cached path
   whose latency a session lookup would spoil, because a cached path never reads
   the session at all.

`jose` is still a dependency and is still used — for **stateless capability
tokens that carry no privilege**: the market-preview token (`04` §1242), the CMS
preview token (`06` §862), the TOTP challenge token (§1.9) and one-click
unsubscribe links. Those are short-lived, single-purpose, and grant a read of
something the holder was given a link to. Anything that can change data or spend
money is a row.

```ts
// src/lib/auth/session.ts
export async function createSession(input: {
  principal: { kind: 'staff'; userId: string } | { kind: 'customer'; customerId: string };
  ip: string | null;
  userAgent: string | null;
  impersonatorUserId?: string;
}): Promise<{ sessionId: string; token: string; expiresAt: Date }>;

export async function resolveSession(token: string): Promise<SessionRecord | null>;
export async function touchSession(sessionId: string): Promise<void>;      // last_seen_at, ≤1/min
export async function revokeSession(sessionId: string, reason: string): Promise<void>;
export async function revokeAllForCustomer(customerId: string, except?: string): Promise<number>;
export async function revokeAllForUser(userId: string, except?: string): Promise<number>;
export async function markTotpVerified(sessionId: string): Promise<void>;   // §1.9
```

> **SCHEMA ADDITION:** one index on `sessions` (`02` §2.2). `02` ships
> `idx_sessions_customer` and nothing equivalent for the staff side, so
> `revokeAllForUser()` — called on staff deactivation, on soft-delete, on a staff
> password change and on every `resetTotp()` — and the staff session list at
> `/admin/settings/security` are both sequential scans over every session row in
> the database, including every customer's:
>
> ```sql
> CREATE INDEX idx_sessions_user ON sessions (user_id, created_at DESC)
>   WHERE user_id IS NOT NULL;
> ```
>
> It mirrors `idx_sessions_customer` exactly, and it is partial for the same
> reason: at any moment the overwhelming majority of rows are customers'.

**Token construction, exactly.**

- `token = base64url(crypto.randomBytes(32))` — 256 bits, 43 characters.
- `token_hash = crypto.createHash('sha256').update(token).digest()`, stored raw in
  the `BYTEA` column, matched by `WHERE token_hash = $1` against
  `idx_sessions_token_hash`.
- SHA-256, not argon2id, and that is deliberate: the input has 256 bits of
  entropy, so there is no dictionary to slow down. Argon2 here would add ~50 ms to
  every authenticated request to defend against an attack that is already
  computationally impossible. Argon2 is for inputs a human chose (§1.4) and for
  the 6-digit OTP (§1.8), where the search space genuinely is small.
- The plaintext token is never written to a log, never written to `audit_logs`,
  never returned by any API, and never stored anywhere but the cookie.

**Validity is a predicate, not a column.** `resolveSession()` returns `null`
unless all of the following hold, checked in SQL in one round trip:

```sql
SELECT s.*, u.is_active, u.password_changed_at, u.deleted_at AS user_deleted_at,
       c.anonymized_at
  FROM sessions s
  LEFT JOIN users     u ON u.id = s.user_id
  LEFT JOIN customers c ON c.id = s.customer_id
 WHERE s.token_hash = $1
   AND s.revoked_at IS NULL
   AND s.expires_at > now();
```

then, in the service: `user_deleted_at IS NULL`, `is_active = true`,
`s.created_at >= u.password_changed_at` (a password change invalidates every
session issued before it — `02` states this on the column and this is where it is
enforced), `c.anonymized_at IS NULL`, and for staff
`s.last_seen_at > now() - ADMIN_SESSION_IDLE_MINUTES`.

**`last_seen_at` is written at most once per minute per session, and the "at most
once" is the database's job, not a timer's.** `touchSession()` is exactly:

```sql
UPDATE sessions SET last_seen_at = now()
 WHERE id = $1 AND last_seen_at < now() - interval '1 minute';
```

Zero rows affected is the normal case and is not an error. Writing it on every
request instead turns every admin page view into a write transaction and makes
`sessions` the hottest-updated table in the database for no information gain; a
process-local "last written" cache would reset on every cold start and every new
serverless instance, so it is a predicate on the row rather than a variable in
memory.

> **ADDS TO 01 §4.3:** `ADMIN_SESSION_IDLE_MINUTES` — optional, default `60`. Idle
> window for staff sessions only. Customer sessions have no idle timeout; a
> shopper returning after a week should still be signed in.

### 1.3 Cookies: names, flags, lifetimes

| Cookie | Set by | Contents | `HttpOnly` | `Secure` | `SameSite` | `Path` | Max-Age | Owner |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `md_admin` | staff login | opaque session token | yes | yes | **Strict** | `/` | session cookie (no `Max-Age`) | this doc |
| `md_session` | customer login | opaque session token | yes | yes | `Lax` | `/` | `SESSION_TTL_HOURS` × 3600 | this doc |
| `md_totp` | staff password step | `jose` JWT, 5 min, `aud: 'totp'` | yes | yes | Strict | `/admin` | 300 | this doc |
| `md_cart` | first add-to-bag | opaque cart token | yes | yes | Lax | `/` | 90 days | `05` §2.1 |
| `md_market` | market switcher | market code | yes | yes | Lax | `/` | 365 days | `01` §1.4, `04` §1043 |
| `md_consent` | consent banner | consent state | no | yes | Lax | `/` | 12 months | `08` §1488 |

Rules that apply to every row:

- **`__Host-` prefix in every environment where it is possible.**
  `cookieName(key)` in `src/lib/config/constants.ts` returns `__Host-md_admin`
  when `APP_ENV !== 'local'` and `md_admin` on local HTTP. The prefix is a browser-
  enforced guarantee that the cookie was set by this exact origin over HTTPS with
  `Path=/` and no `Domain` — which is precisely the defence against a subdomain
  (a preview deployment, a mis-parked marketing host) being able to write a cookie
  our production origin will read. `md_totp` keeps `Path=/admin` and therefore
  cannot carry the prefix; it is 5 minutes long and grants nothing but the second
  step of a login it already passed the first step of.
- **`md_admin` is a session cookie with no `Max-Age`.** The server-side absolute
  and idle TTLs are the real lifetime; the browser discarding it on quit is a free
  extra. A persistent admin cookie on a shared shop-floor machine is the realistic
  compromise path in a retail business, and `12h` absolute is already generous.
- **`SameSite=Strict` for `md_admin`, `Lax` for `md_session`.** There is no
  legitimate cross-site entry point into `/admin` — nobody links to it, nothing
  emails a deep link into it. There *is* a legitimate cross-site entry into the
  storefront: an order-confirmation email, a shared wishlist, a paid ad. `Strict`
  on the customer cookie would sign the shopper out of every link they click from
  their own inbox; `Lax` combined with "no mutation is ever a `GET`" (`01` §1.3)
  gives the same CSRF protection (§5.4).
- **No cookie is readable by JavaScript except `md_consent`**, which exists to be
  read by the consent script before hydration.

### 1.4 Password hashing

**Algorithm: argon2id, via `@node-rs/argon2` (`01` §1.1), with a server-side
pepper.** Parameters, in `src/lib/auth/password.ts` and nowhere else:

```ts
import { hash, verify, Algorithm } from '@node-rs/argon2';

export const ARGON2_PARAMS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19456,   // KiB — 19 MiB, the OWASP argon2id baseline
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
  secret: passwordPepper(),   // Buffer, from PASSWORD_PEPPER
} as const;

export async function hashPassword(plaintext: string): Promise<string>;
export async function verifyPassword(hashString: string, plaintext: string): Promise<boolean>;
export function needsRehash(hashString: string): boolean;   // parses the PHC string's m/t/p
```

- Stored as the full PHC-encoded string (`$argon2id$v=19$m=19456,t=2,p=1$…`) in
  `users.password_hash` (`NOT NULL`) and `customers.password_hash` (nullable —
  `02` makes passwordless a first-class state, not a placeholder). The encoded
  string carries its own parameters, which is what makes `needsRehash()` possible.
- **Rehash on successful login** when `needsRehash()` is true, inside the same
  transaction that writes `last_login_at`. Raising the cost parameters later is
  then a constant change plus time, not a migration and not a forced reset.
- `@node-rs/argon2` is a native module: `next.config.ts#serverExternalPackages`
  must list `'@node-rs/argon2'` or the Next bundler will try to trace it into the
  server chunk and the deployed function will fail to load it. The async API runs
  on the libuv threadpool (`UV_THREADPOOL_SIZE` default 4), so a Vercel function
  sustains roughly 4 concurrent hashes; at 19 MiB each that is ~78 MiB against a
  1024 MiB function. Both numbers are fine and both are the reason the parameters
  are not higher.
- **Password policy: minimum 12 characters, no composition rules, no forced
  rotation.** Composition rules produce `Millennium1!` and nothing else. Instead:
  a length floor, a check against the 10k-most-common list bundled at
  `src/lib/auth/common-passwords.txt` (bundled data, not a dependency), and a
  rejection when the password contains the account's email local-part. Staff
  passwords additionally require 14 characters. There is no maximum length below
  1024 bytes and no character class is excluded.

> **ADDS TO 01 §4.3:** `PASSWORD_PEPPER` — **required**, ≥32 random bytes,
> base64. Passed to argon2 as `secret`, so the stored hashes are keyed: a
> database dump alone cannot be cracked offline, because every candidate needs a
> value that lives only in the environment. It is a *different* variable from
> `AUTH_SECRET` on purpose — everything derived from `AUTH_SECRET` can be
> re-derived during a rotation window (§1.9), whereas a password hash cannot be
> recomputed without the password, so a pepper swapped in place invalidates every
> stored credential at once. Rotation, if it is ever needed, is a
> dual-pepper window: verify against new then old, rehash on success, and drop the
> old value after 90 days. Procedure lives in `docs/runbooks/rotate-secrets.md`.

### 1.5 Token inventory — generation, lifetime, single use

Every credential-shaped value in the system, in one table. "Stored as" is what
lands in the database; the plaintext exists only in transit.

| Token | Entropy / form | Stored as | Lifetime | Single use | Where |
| --- | --- | --- | --- | --- | --- |
| Session token | 32 random bytes, base64url | `sessions.token_hash`, SHA-256 | §1.1 TTLs | no (rotated, §1.10) | cookie |
| Staff TOTP challenge | `jose` HS256 JWT, `jti`, `iat`, `aud: 'totp'`, `sub: userId` | not stored; `jti` burned in `rate_limits` (rule 6) | 5 min | yes | `md_totp` cookie |
| TOTP code | 6 digits, RFC 6238, 30 s step | `users.totp_secret_encrypted` (AES-256-GCM, key HKDF'd from `AUTH_SECRET`) | 30 s ±1 step | yes (§1.9) | authenticator app |
| TOTP recovery code | 10 codes × 10 chars, Crockford base32 | `users.totp_recovery_codes` — argon2id per code | until used | yes, spliced from the array | shown once at enrolment |
| Customer OTP | 6 digits, `crypto.randomInt` | `otp_requests.code_hash`, argon2id over `code ‖ OTP_HASH_PEPPER` | `expires_at = now() + 10 min` | yes, `consumed_at` | email (SMS §1.8) |
| Email verification | 32 random bytes, base64url | `otp_requests.code_hash`, purpose `email_verification` | 24 h | yes | link in email |
| Password reset | 32 random bytes, base64url | `otp_requests.code_hash`, purpose `password_reset` | **30 min** | yes | link in email |
| Staff invitation | 32 random bytes, base64url | `otp_requests.code_hash`, purpose `staff_invite` | 72 h | yes | link in email |
| 2FA recovery (admin-initiated) | 6 digits | `otp_requests.code_hash`, purpose `admin_2fa_recovery` | 10 min | yes | email |
| Guest cart token | 32 random bytes | `carts.token_hash`, SHA-256 | 90 days | no | `md_cart` cookie |
| Data-export download | 32 random bytes, base64url | `otp_requests.code_hash`, purpose `data_export` | 24 h | yes, `consumed_at` | link in email (§8.4) |
| Order view token | 32 random bytes | `orders.public_token_hash`, SHA-256 | order lifetime | no | `/orders/[token]` URL |
| Wishlist share token | 32 random bytes | `wishlists.share_token_hash`, SHA-256 | until revoked | no | share URL |
| Market preview token | `jose` JWT | not stored | 30 min | no | `04` §1242 |
| CMS preview token | `jose` JWT | not stored | `06` §862 | no | `06` |

Six rules apply to the whole table and are tested in
`tests/unit/token-hygiene.test.ts`:

1. **Nothing in the `Stored as` column is reversible.** There is no code path that
   can print a live token.
2. **Every single-use token is consumed inside the same transaction that performs
   the effect.** `UPDATE otp_requests SET consumed_at = now() WHERE id = $1 AND
   consumed_at IS NULL RETURNING id` — zero rows means someone else already used
   it, and the whole transaction rolls back. A check-then-act would let two
   simultaneous clicks on a reset link both succeed. **`requestOtp()` also
   consumes every earlier unconsumed row for the same `(purpose, identifier)` in
   the same statement it inserts the new one** — for every purpose, not just
   `password_reset`. Without it, `max_attempts = 5` is a per-*row* budget and
   five requests buy twenty-five guesses at one 6-digit code; with it there is
   never more than one live token per identifier per purpose, and the rate limit
   is the only other budget that exists. The statement is
   `UPDATE otp_requests SET consumed_at = now() WHERE purpose = $1 AND
   identifier = $2 AND consumed_at IS NULL`, served by `idx_otp_lookup`.
3. **Every comparison of a secret is constant-time.** `crypto.timingSafeEqual` for
   hashes of equal length, argon2's own `verify` for argon2 hashes. `===` on a
   token is a lint error (`no-restricted-syntax` on `BinaryExpression` where
   either side is an identifier ending `token`, `Hash`, `secret` or `code`).
4. **`otp_requests` rows are pruned by `/api/cron/cleanup-sessions`** — `02` calls
   the table a liability rather than history, and the cron deletes consumed rows
   after 24 h and unconsumed rows after `expires_at + 24 h`.
5. **Argon2 for `otp_requests.code_hash` even where the token is 256 bits, which
   forces every emailed link to carry a selector.** `02` specifies argon2id on
   that column; the reset/verification/invite/export tokens do not need the cost,
   but two hashing paths into one column is how one of them ends up being the
   wrong one. One code path, ~50 ms, on flows that happen a handful of times per
   customer per lifetime. **The consequence has to be designed for rather than
   discovered:** an argon2 hash carries a random per-row salt, so
   `WHERE code_hash = argon2(token)` matches nothing, ever — there is no way to
   find a row from a link token alone short of verifying the token against every
   live row in the table. A 6-digit OTP is fine because the form supplies the
   identifier and `idx_otp_lookup` finds the row; a link has no form. So **every
   emailed link is `/<route>/<otp_request_id>.<token>`** — a public row id as the
   selector, a dot, and the 43-character secret. The handler splits on the dot,
   loads the row by primary key, and `verify()`s the secret in constant time;
   knowing an id without the secret is worth nothing, and the id is already a
   UUIDv7 that appears in no other surface. `/reset/[selector]`,
   `/verify-email/[selector]`, `/admin/accept-invite/[selector]` and
   `/account/export/[selector]` all take this shape, and
   `tests/unit/token-hygiene.test.ts` asserts that no code path queries
   `otp_requests` by `code_hash`.
6. **The `md_totp` `jti` is burned against a window that is the token's own `iat`,
   not the clock.** `rate_limits` is a *fixed-window* counter: keying the burn as
   `totp-jti:<jti>` with a 5-minute clock window means a challenge issued at
   12:04:30 and used at 12:04:40 lands in the 12:00–12:05 bucket, and a replay of
   the same cookie at 12:05:05 lands in the *next* bucket, sees `count = 1`, and
   is accepted — inside the token's own 5-minute lifetime. Any clock-aligned
   window has a seam somewhere inside some token's life. The burn therefore
   writes `window_start = to_timestamp(jwt.iat)`, which is a constant for that
   token, with `expires_at = to_timestamp(jwt.exp) + interval '1 hour'`:
   `INSERT … ON CONFLICT (key, window_start) DO UPDATE SET count = count + 1
   RETURNING count`, and **`count > 1` is a replay** — reject, revoke nothing,
   audit `totp_challenge_replayed`. One row per challenge, no seam, no new table.

> **SCHEMA ADDITION:** two values added to the `otp_purpose` Postgres enum
> (`02` §1.9):
>
> | Type | New value | Why |
> | --- | --- | --- |
> | `otp_purpose` | `staff_invite` | Staff are created by invitation (§1.6), never by self-registration. Reusing `password_reset` for the invite would make "reset your password" and "you have been given access to the admin panel" indistinguishable in the `otp_requests` table, in the audit log and in the rate-limit key — and the invite has a different lifetime (72 h vs 30 min) and a different email template. No new table: the invite is exactly the shape `otp_requests` already models. |
> | `otp_purpose` | `data_export` | §8.4 promises the export bundle is delivered by a "signed, single-use, 24-hour link". Single use is a claim with no mechanism unless the link's token is a row that something sets `consumed_at` on; a `jose` JWT cannot be un-issued, and a subject-access bundle is the single most PII-dense artefact this system produces. Same shape, same consume-in-transaction rule (rule 2), same pruning cron. |
>
> Both are added by `ALTER TYPE otp_purpose ADD VALUE …`, each in **its own
> migration file**: Postgres will not let a value added in a transaction be used
> by a statement in that same transaction, and Prisma Migrate wraps a migration
> file in one. Two files, no seed data depending on them in the same file.

### 1.6 Staff: invitation, login, logout

**There is no staff self-registration and no public staff signup route.**
`/admin/login` renders a sign-in form and nothing else; there is no link from it
to anything that creates an account.

**First owner.** `scripts/create-admin.ts` (`01` §3) creates exactly one `users`
row with the `owner` role. It refuses to run if any `users` row already exists, it
never accepts a password on the command line (it prompts, or it emails a
`staff_invite` token to `ADMIN_BOOTSTRAP_EMAIL`), and it never seeds a known
password. The seed files under `prisma/seed/` create roles and permissions
(`02-roles.ts`) and no users at all.

**Subsequent staff.** `inviteUser()` in `src/lib/auth/staff.ts`, behind
`user.manage`:

1. Validate email, first/last name, and the requested `role_id` set. The
   **no-escalation rule** (§2.6) rejects any role whose permission set is not a
   subset of the inviter's own.
2. Insert `users` with `password_hash` set to an argon2 hash of 32 random bytes
   that are immediately discarded — the row is unauthenticatable rather than
   passwordless, so there is no "no password set" branch anywhere in the login
   path to get wrong.
3. Insert `user_roles` rows with `granted_by_user_id = actor.userId`.
4. Insert an `otp_requests` row, purpose `staff_invite`, 72 h.
5. `recordAudit(tx, { entity: 'users', entityId, action: 'invite', after: { email, roleKeys } })`
   inside the same transaction.
6. Send the invitation email after commit.

The invitee sets a password at `/admin/accept-invite/[selector]` (§1.5 rule 5 —
the link carries the `otp_requests` row id and the secret), which consumes the
token, writes `password_hash` and `password_changed_at`, and — if their role set
crosses the privilege line (§1.9) — walks straight into TOTP enrolment before any
session is issued.

**Login** (`POST` server action `src/server/actions/auth.ts#staffLogin`):

```
1.  rate limit: admin-login:ip:<ip64> 20/15min, admin-login:email:<email> 5/15min
2.  look up users WHERE lower(email) = lower($1) AND deleted_at IS NULL
3.  if no row: verify the submitted password against DUMMY_ARGON2_HASH anyway,
    then fail with the generic message (§5.7)
4.  if locked_until > now(): fail with the generic message. Do not disclose the lock
5.  verify password (argon2id, keyed)
6.  on failure: failed_login_count += 1; at 5, locked_until = now() + 15 min;
    audit action='login_failed'; generic message
7.  on success: failed_login_count = 0, locked_until = NULL
8.  compute the effective permission set; if it crosses the privilege line (§1.9):
      - totp not enrolled  -> issue md_totp challenge, redirect to enrolment
      - totp enrolled      -> issue md_totp challenge, redirect to /admin/login/2fa
    otherwise, and for users below the line with totp enrolled, the same challenge
9.  createSession(); set md_admin; audit action='login'; last_login_at = now()
```

Step 3 is not theatre. Without it, "no such user" returns in 3 ms and "wrong
password" returns in 60 ms, and the login form becomes a staff-directory oracle.

**Steps 1, 6 and the `login_failed` audit row commit on their own, and this is the
one implementation detail that silently voids the whole section if it is got
wrong.** The natural way to write a login handler is one `prisma.$transaction`
around the lookup, the verify and the bookkeeping — and then the failure path
throws, the transaction rolls back, and `failed_login_count += 1`, the
`rate_limits` increment and the `login_failed` audit row all roll back with it.
Lockout never fires, the counter reads `0` after ten thousand guesses, and the
audit log shows no attempts at all. So: **`consume()` (§5.5) runs before the
attempt on its own connection and is never enrolled in a caller's transaction; the
failure bookkeeping in step 6 is its own committed transaction, written before the
error is thrown; and only the *success* path (step 7 + `createSession` +
`last_login_at` + rehash) shares one transaction.** `tests/integration/
login-lockout.test.ts` asserts `failed_login_count = 5` and a non-null
`locked_until` after five wrong passwords, which is a test that fails loudly
against the rolled-back implementation.

**Unlocking.** `locked_until` expires on its own after 15 minutes; that is the
normal path. Because staff emails are guessable by anyone who has ever received an
email from the business, an attacker can also hold one staff member locked out
indefinitely for the cost of five requests every quarter hour — so
`unlockUser(actor, userId)` behind `user.manage` clears `locked_until` and
`failed_login_count` in one audited write (`action = 'user_unlocked'`), and a
lock never affects a session that is already signed in. The denial-of-service
ceiling is therefore "one staff member cannot start a new session until an
`owner`/`admin` clicks Unlock", not "the admin panel is gone".

**Forgotten staff password.** `/admin/login` carries one link and it is this one,
because the alternative — "ask another admin to re-invite you" — is a standing
excuse for an admin to mint a credential-setting token for a colleague's account
whenever they like. `requestPasswordReset(email)` is the same service the
storefront uses (§1.7), keyed on `users` when the address matches a live staff row,
with the same always-identical response, the same 30-minute single-use token and
the same rate limits (`reset:email`, `reset:ip`). Three differences, all of which
close the same hole — **a password reset must never be a second-factor bypass**:

1. Completing a staff reset writes `password_hash` and `password_changed_at`,
   revokes every session via `revokeAllForUser()`, and issues **no session**. The
   user is returned to `/admin/login` and signs in normally.
2. That sign-in runs step 8 unchanged, so an enrolled user still faces TOTP and a
   user above the privilege line still cannot get in without it. The reset clears
   nothing in the `totp_*` columns; only `resetTotp()` does (§1.9), and that
   requires `user.manage` and mails the target.
3. The reset email states the requesting IP and time, and a second mail goes to
   every active holder of `user.manage` — a resolved query, not an environment
   variable, so it stays correct when staff change. A staff reset is rare enough
   that someone should see every one of them.

**Logout** revokes the row (`revoked_at = now()`), clears the cookie with
`Max-Age=0`, and — for staff only — emits
`Clear-Site-Data: "cache", "cookies", "storage"` on the response. On a shared
machine the admin panel's client-side caches (TanStack Table state, draft form
autosave buffers, the media picker's blob URLs) are the residue that matters, and
that header is the only thing that clears them without our own bookkeeping.

### 1.7 Customers: registration, verification, login, reset

**Registration** (`customerRegister`): email + password, or email alone for the
OTP path. Creates or *upgrades* a `customers` row — `02` already made
`is_guest = true` the default and `email_verified_at` nullable, so a guest who
later sets a credential is an `UPDATE`, not a duplicate row. Registration against
an email that already has a credentialled account does **not** error (§5.7): it
returns the same "check your email" state and sends a *different* email — "someone
tried to create an account with this address; if it was you, sign in or reset your
password" — which is both safe and genuinely useful to the account holder.

**Email verification.** A `customers` row can exist unverified (guest checkout
creates one from an email alone). `email_verified_at` gates exactly three things
and nothing else:

| Requires a verified email | Does not |
| --- | --- |
| Signing in with a password | Placing a guest order |
| Seeing order history at `/account/orders` | Seeing one order at `/orders/[token]` |
| Having a guest order auto-attached to the account (`02` §2.7 already refuses to attach to an unverified row) | Subscribing to the newsletter (that has its own double opt-in) |

Gating checkout on verification would cost orders to fix a problem checkout does
not have — the order is bound to `orders.email` and `orders.public_token_hash`,
not to an account.

**The unverified-password-holder is a real customer and must not be stranded.**
"Signing in with a password requires a verified email" plus "an unverified email
returns the same generic message as a wrong password" (§5.7) is, read literally, a
permanent dead end: the customer types the correct password, is told it is
incorrect, and the only surface that could re-send the verification mail is behind
the sign-in they cannot complete. The mechanism that closes it without opening an
oracle: **when the password verifies but `email_verified_at IS NULL`, the server
re-sends the verification email (rate limited `verify-email:customer:<id>` 5/hour)
and returns the generic message unchanged.** The response is identical in body,
status and timing for a wrong password, an unknown address and an unverified
account; the difference is only ever visible in the customer's own inbox, which is
the one place the attacker is not.

**Login.** Two methods against the same account, both landing on the same session:

- **Password** — argon2id verify, identical dummy-verify and generic-message
  handling as §1.6 step 3, and identical rate limits keyed `login:email:<email>`
  (10 / 15 min, from `08` §597) and `login:ip:<ip64>` (30 / 15 min).
- **Email OTP** — `requestOtp({ purpose: 'customer_login', identifier: email })`
  writes an `otp_requests` row and mails a 6-digit code. `verifyOtp()` increments
  `attempts`, fails closed at `max_attempts` (default 5), consumes on success, and
  issues a session. A customer with `password_hash IS NULL` has only this path,
  which is the point of `02` making that column nullable.

**Password reset.** `requestPasswordReset(email)` **always** returns the same
success state, in the same time, whether or not the address exists (§5.7). On a
hit it writes an `otp_requests` row, purpose `password_reset`, 30 minutes,
invalidating any earlier unconsumed reset row for that identifier in the same
statement. **"In the same time" is a scheduling decision, not an aspiration:** the
row write and the mail send are handed to `after()` from `next/server` (which
Vercel resolves through `waitUntil`, so the function is not frozen before the work
runs), the action returns the fixed `202` on both paths, and the *only* work
inside the request is a lookup whose miss branch performs the same
`DUMMY_ARGON2_HASH`-shaped delay as the hit branch. An implementation that awaits
Resend on the hit path and returns immediately on the miss path is a 300 ms
enumeration oracle no matter what the body says. `completePasswordReset(token, newPassword)` runs one transaction:
consume the token, write `password_hash` and `password_changed_at = now()`,
`revokeAllForCustomer(customerId)` — a reset signs out every other device, which
is the whole point when the reason for the reset is a compromise — and audit.
The confirmation email is sent after commit and names the time and the approximate
location, not the new password.

**Changing the email on an account is an account-takeover flow and is treated as
one.** `requestEmailChange(actor, newEmail)` requires the current password (or a
fresh `customer_login` OTP for a passwordless account), writes the pending address
to an `otp_requests` row with purpose `email_verification` and the *new* address as
`identifier`, and changes nothing yet. `customers.email` moves only when that token
is consumed, in one transaction that also sets `email_verified_at = now()` and
calls `revokeAllForCustomer(customerId, except: currentSessionId)`. A notice goes
to the **old** address naming the new one — that mail is the only thing standing
between a stolen session and a permanent takeover, because once the login identity
moves, password reset moves with it. The same rule binds the admin side:
`customer.update` may write name, group and note, but an email change performed by
staff sets `email_verified_at = NULL`, mails both addresses, revokes the customer's
sessions, and is audited as `email_changed` with both values — otherwise
`customer.update`, which `order_manager` holds, is quietly a "take over any
customer account" permission.

**There is no "security question", no password hint, and no recovery by
answering profile data.** Those are credential-equivalent secrets with worse
entropy stored in plaintext-adjacent columns; there is no column for them in `02`
and none is being added.

### 1.8 India's phone/OTP expectation vs the US email/password expectation

**The tension is real.** An Indian shopper expects to type a mobile number and a
6-digit SMS code and be in; being asked to invent a password reads as friction and
as a foreign checkout. A US shopper expects email and password, expects the
browser password manager and Apple/Google autofill to work, and reads an SMS-only
flow as a sign the site is not a real business. Building one and telling the other
market to cope loses orders in whichever market lost.

**Decision: email is the account key in every market. Phone is an additional
login method bound to the same `customers` row, enabled per market by a
`settings` row, and it never becomes a second account identity.**

Concretely:

- `customers.email` stays `NOT NULL` and stays the unique key
  (`idx_customers_email`). `customers.phone` (E.164) and
  `customers.phone_verified_at` are the phone binding — both already in `02`.
- `otp_requests.identifier` already takes "email or E.164 phone, lowercased", and
  `otp_purpose` already has `customer_login`. The OTP service is therefore
  transport-agnostic by construction:

```ts
// src/lib/auth/otp.ts
export type OtpChannel = 'email' | 'sms';
export async function requestOtp(input: {
  purpose: OtpPurpose;
  identifier: string;            // email or E.164
  channel: OtpChannel;
  marketCode: MarketCode;
}): Promise<Result<{ expiresAt: Date }, RateLimitedError | IntegrationUnconfiguredError>>;
export async function verifyOtp(input: {
  purpose: OtpPurpose; identifier: string; code: string;
}): Promise<Result<{ customerId: string | null; userId: string | null }, AppError>>;
```

- **Which channels a market offers is data:** `settings` key
  `auth.login_methods.<market_code>`, seeded `["password","email_otp"]` for `US`
  and `["password","email_otp","sms_otp"]` for `IN`. The login screen renders from
  that row. Adding phone login to the UK is a settings edit.
- **Checkout still collects an email in both markets**, because the order
  confirmation, the invoice, the shipping notification and `/orders/[token]` all
  travel by email, and because an INR order fulfilled internationally needs a
  contactable address that is not a phone number roaming.
- **A phone number alone never creates an account.** An SMS-OTP sign-in against a
  number with no `customers` row asks for an email before issuing a session. This
  closes the account-merge problem before it exists: two accounts, one with the
  email and one with the phone, both holding orders, is a support burden that no
  amount of later reconciliation fixes cleanly.
- **SMS is an integration, and integrations that are not configured do not
  pretend** (`01` §4.9). `sms_otp` appears in `auth.login_methods.IN` but the
  login screen renders it **disabled with the reason inline** until the transport
  reports `configured`. `'otp_sms'` is one of the fourteen members of
`IntegrationKey` (`11-registries.md` §6, which supersedes `01` §4.9's eight-value
union); it is not a launch blocker, because email OTP and password login cover
India without it.

> **NEEDS INPUT:** the India SMS provider account, and the regulatory paperwork
> that goes with it. Transactional SMS to Indian numbers requires the sender to be
> registered on a TRAI DLT platform with an approved header (sender ID) and an
> approved message template; an unregistered send is dropped by the carrier, not
> delayed. We need: the provider (MSG91, Twilio, Gupshup, Kaleyra — the adapter is
> ~80 lines either way), the API credentials, the registered header, and the
> approved template id. Until these exist, `sms_otp` stays `unconfigured` and
> Indian customers use email OTP, which works today.

> **ADDS TO 01 §4.3 and §4.9:** `OTP_SMS_PROVIDER` (optional — `msg91` |
> `twilio`), `OTP_SMS_API_KEY`, `OTP_SMS_SENDER_ID`, `OTP_SMS_DLT_TEMPLATE_ID`.
> All optional; all four must be present for `integrationStatus('otp_sms')` to
> report `configured`.

### 1.9 Staff second factor: TOTP, mandatory above a privilege line

**The brief says "optional". The decision is: optional for roles that cannot move
money or grant access, mandatory for roles that can.** A jewellery business's
admin panel can issue refunds, approve a catalogue-wide price recalculation and
create staff accounts; a phished password on one of those accounts is a
same-day loss. "Optional" for those roles means "off", because nobody enrols
voluntarily.

**The line.** TOTP is required for any user whose effective permission set
intersects:

```ts
// src/lib/rbac/catalogue.ts
export const TOTP_REQUIRED_PERMISSIONS = [
  'order.refund', 'order.discount_manual', 'price.approve_recalc', 'price.update',
  'customer.export', 'customer.anonymize', 'user.manage', 'user.impersonate',
  'role.manage', 'settings.manage', 'integration.manage', 'market.manage',
  'media.hard_delete',
] as const satisfies readonly PermissionKey[];
```

**Two keys were added to this list when §2.3 grew to 72.**
`order.discount_manual` writes money off an order at a keyboard with no second
party in the loop, which is the same shape as a refund; `media.hard_delete`
destroys a provider asset with no soft-delete behind it. Neither changes who must
enrol — both holders are already above the line — but a future role granted
either key inherits the requirement, which is the point of deriving the line from
the matrix.

Which in the launch matrix (§2.5) means `owner`, `admin`, `catalog_manager` and
`order_manager` must enrol, while `inventory_manager`, `content_editor` and
`analyst` may. The list is derived from the matrix, not maintained separately:
granting a new role `order.refund` makes TOTP mandatory for its holders, with no
code change.

**And it takes effect on the next request, not on the next login.** Checking the
privilege line only in step 8 of the login sequence leaves a twelve-hour window
with the wrong answer in it, and the window opens at exactly the moment the line
starts to matter: an `owner` adds `order.refund` to `content_editor` at 10 a.m.
because someone needs to process a return; every content editor already signed in
now holds the single most money-adjacent key in the catalogue on a session that
never saw a second factor, until they happen to sign out. §1.10 is explicit that a
permission change is *not* a revocation — the permission set is recomputed per
request — so the second-factor requirement has to be recomputed on the same
schedule as the thing it guards.

`requireStaffSession()` therefore evaluates, per request, after
`effectivePermissions()`:

```ts
const needsTotp = intersects(actor.permissions, TOTP_REQUIRED_PERMISSIONS);
if (needsTotp && session.totp_verified_at === null) throw new TotpRequiredError();
```

`TotpRequiredError` renders as a redirect to `/admin/login/2fa` (or to enrolment
when `totp_enrolled_at IS NULL`) and **not** as a logout: the session stays, the
user completes the challenge, `markTotpVerified()` stamps the row, and they land
back where they were. Losing a permission is symmetric and free — the intersection
is empty on the next request and nothing is asked of them.

> **SCHEMA ADDITION:** one column on `sessions` (`02` §2.2):
>
> | Column | Type | Null | Notes |
> | --- | --- | --- | --- |
> | `totp_verified_at` | `TIMESTAMPTZ` | Y | Set by `markTotpVerified()` when this session's holder completed a TOTP or recovery-code challenge. `NULL` on a session that has never been second-factored. It is on `sessions`, not on `users`, because "this browser proved a second factor" is a property of the session — putting it on `users` would let a second-factored login on one machine satisfy the requirement for a session opened on another. |

**Step-up for the sharpest keys.** Twelve hours is a long time for a browser left
open on a shop floor, so six operations re-ask for the second factor regardless of
how the session started:

```ts
// src/lib/rbac/catalogue.ts
export const STEPUP_PERMISSIONS = new Set<PermissionKey>([
  'order.refund',        // above security.stepup_refund_threshold only
  'role.manage', 'user.manage', 'customer.export',
  'customer.anonymize', 'media.hard_delete',
]);
```

**`customer.anonymize` and `media.hard_delete` join the four original keys**, and
for the same reason the original four are there: both are irreversible, both are
one click in an admin panel, and neither has an undo to fall back on if the
browser was not the owner's.

`security.stepup_refund_threshold` is a per-currency `money` `settings` row, so the
threshold is one figure in the US and its own independent figure in India — never
a converted one, and never one value compared against two currencies. The check is
one guard, `await requireRecentTotp(actor, 15)`, which throws `TotpRequiredError`
when
`session.totp_verified_at < now() - 15 minutes`; satisfying it re-stamps the same
column. It is a service-layer call in the same position as `requirePermission()`,
so it cannot be skipped by reaching the server action directly.

> **NEEDS INPUT:** the step-up refund threshold per market — the figure above which
> a refund re-prompts for the authenticator. Seeded `null` (meaning "always
> step up") rather than invented, because the right number is a function of the
> client's average order value and who they trust with a refund; `security
> .stepup_refund_threshold` is a settings row and changing it is not a deploy.

**Mechanism.** RFC 6238, HMAC-SHA1, 6 digits, 30-second step, verification window
of ±1 step (90 seconds of tolerance for clock drift). Implemented in
`src/lib/auth/totp.ts` — roughly 50 lines over `node:crypto`, following the
precedent `02` §1.2 set with the hand-written `newId()`, rather than adding a
dependency for one HMAC. `otpauth://totp/` URIs are rendered to a QR at
enrolment by `qrcode`, an ADR-approved dependency scoped to the admin bundle
(`docs/decisions/0013-totp-qr.md`), output as an SVG data URI (already permitted
by `img-src … data:` in the CSP).

**Secret storage.** `users.totp_secret_encrypted` holds AES-256-GCM ciphertext
under a key derived from `AUTH_SECRET` by HKDF-SHA256 with the info string
`'md:totp:v<n>'`, where `<n>` is the key version the ciphertext declares (`02` §2.2
fixes both the column and the key source). Encrypted
rather than hashed, because TOTP verification needs the secret back.
`chk_users_totp_pair` already guarantees the secret and `totp_enrolled_at` move
together.

**And that key source makes `AUTH_SECRET` rotation a two-key operation, not a
one-line change.** Every enrolled secret is encrypted under a key derived from the
current `AUTH_SECRET`; rotate it naively and every above-the-privilege-line staff
member is locked out at once — including every holder of `user.manage`, which is
the permission `resetTotp()` needs, so the recovery path is destroyed by the same
change that caused the problem. The stored format is therefore **versioned and
self-describing**: `v<n>:<base64(IV ‖ tag ‖ ciphertext)>`, and
`src/lib/auth/totp.ts` decrypts with the key for `<n>`, where the highest version
is derived from `AUTH_SECRET` and the previous one from the optional
`AUTH_SECRET_PREVIOUS`. Rotation is then: set `AUTH_SECRET_PREVIOUS` to the
outgoing value, deploy the new `AUTH_SECRET`, run `scripts/reencrypt-totp.ts`
(decrypt under the old key, re-encrypt under the new, bump the version tag — one
`UPDATE` per enrolled staff member, a set small enough to re-encrypt in a single
transaction), then drop
`AUTH_SECRET_PREVIOUS`. The procedure belongs in `docs/runbooks/rotate-secrets.md`
beside the pepper's.

> **ADDS TO 01 §4.3:** `AUTH_SECRET_PREVIOUS` — optional, absent in steady state.
> Present only during a rotation window; `src/lib/config/env.ts` warns at boot if
> it has been set for more than 30 days, because a permanently-set previous key is
> just two live keys.

**Replay.** A TOTP code is valid for up to 90 seconds, which is 90 seconds in
which a code read over someone's shoulder — or captured by a real-time phishing
proxy — can be used a second time.

> **SCHEMA ADDITION:** one column on `users` (`02` §2.2):
>
> | Column | Type | Null | Notes |
> | --- | --- | --- | --- |
> | `totp_last_step` | `BIGINT` | Y | The RFC 6238 counter value of the last accepted code. Verification rejects any `step <= totp_last_step`, making each code single-use across the whole ±1 window. Written in the same `UPDATE` that clears `failed_login_count`. Without it, "single use" is a claim with no mechanism. |

**Recovery codes.** Ten codes, 10 Crockford-base32 characters each, generated at
enrolment, displayed exactly once, stored as argon2id hashes in
`users.totp_recovery_codes TEXT[]`. Using one splices it out of the array inside
the verification transaction and writes an `audit_logs` row with action
`totp_recovery_used`; at two remaining, the panel nags. Regenerating the set
requires the current TOTP or a current recovery code.

**Lost device.** A holder of `user.manage` triggers `resetTotp(userId, reason)`,
which clears `totp_secret_encrypted`, `totp_enrolled_at`, `totp_last_step` and
`totp_recovery_codes`, revokes all that user's sessions, and mails an
`admin_2fa_recovery` OTP to the user's address — the enum value `02` already
defines. The target user re-enrols on next login. The reset is audited with both
the actor and the target, and the *target* is emailed as well as the actor,
because "an administrator reset your 2FA" is the one notification that catches an
insider doing it quietly.

### 1.10 Session lifecycle: rotation and revocation

**Rotation on privilege change.** A new session row is minted and the old one
revoked — the cookie value changes — at exactly these moments:

| Event | Why |
| --- | --- |
| Successful login (staff and customer) | Kills session fixation: a token planted before authentication is not the token that ends up authenticated |
| TOTP verification completing a staff login | The pre-2FA state never held a session at all, but the `md_totp` `jti` is burned here |
| A mid-session TOTP step-up (§1.9) | The session's privilege level changed, so its token does; `markTotpVerified()` stamps the **new** row, and a token captured before the step-up cannot inherit its authority |
| Guest cart claimed on sign-in | The pre-login identity does not carry forward |
| Impersonation start and stop | §1.11 |
| Password change or reset | Plus `revokeAll*` for every *other* session |

**Revocation triggers**, all of which take effect on the very next request
because §1.2's predicate is evaluated per request:

| Trigger | Mechanism |
| --- | --- |
| Sign out | `revoked_at = now()` on that row |
| Sign out everywhere | `revokeAllForCustomer(id, except)` over `idx_sessions_customer`; `revokeAllForUser(id, except)` over `idx_sessions_user` |
| Password changed | `s.created_at >= u.password_changed_at` predicate |
| Staff deactivated (`is_active = false`) or soft-deleted | predicate, plus the `ON DELETE CASCADE` for a hard delete that will never happen |
| Customer anonymised | `c.anonymized_at IS NULL` predicate |
| Role or permission change | **not** a revocation — the permission set is recomputed per request (§2.7), so a removed permission is gone on the next click without signing anyone out. A permission *added* is likewise live on the next click, which is why the §1.9 privilege line is re-evaluated per request and not at login |
| `AUTH_SECRET` rotated | `md_totp` challenges break immediately (a 5-minute inconvenience); **sessions are unaffected** because the session token is not signed. `01` §5.8 says rotation logs everyone out — for sessions it does not have to, and the runbook is corrected to say so. It is *not* free for TOTP: enrolled secrets are encrypted under a key derived from it, so rotation runs the versioned two-key procedure in §1.9 or it locks out every second-factored account |
| Nightly | `/api/cron/cleanup-sessions` deletes rows `expires_at < now() - 7 days` via `idx_sessions_expiry` |

**The account security screen** (`/account/security`, and `/admin/settings/security`
for staff) lists the caller's live sessions from `idx_sessions_customer`, or
`idx_sessions_user` for the staff screen — created
time, last seen, IP, coarse user-agent — with a revoke button per row and a
"sign out everywhere" button. This is a real feature, not a nicety: it is the only
way a customer discovers a session they did not create.

### 1.11 Impersonation

`sessions.impersonator_user_id` exists in `02` and this is its contract.

- Requires `user.impersonate`, and requires the impersonating staff member to have
  TOTP enrolled (it is on the §1.9 list).
- `startImpersonation(actor, customerId, reason)` requires a non-empty `reason`,
  creates a **new** session row with `customer_id = X`,
  `impersonator_user_id = actor.userId`, `expires_at = now() + 30 minutes`, sets
  `md_session`, and **leaves `md_admin` in place**. Audited with action
  `impersonate_start`, entity `customers`, and `summary` carrying the reason.
- The storefront renders a permanent, non-dismissible banner: "Viewing as
  {customer email} — {staff email}. End session." It is rendered server-side from
  the session row, so it cannot be removed client-side.
- **An impersonated session is read-mostly.** `assertNotImpersonated(actor)` is
  called at the top of every action that: places an order, saves or uses a payment
  method, changes email, changes password, deletes an address, requests a data
  export, or starts another impersonation. Four more belong on that list and are
  easy to miss because they do not look like writes: **changing marketing consent**
  (`accepts_marketing` carries `marketing_consent_at` and
  `marketing_consent_source`, and a consent record created by a staff member acting
  as the customer is a fabricated consent record — the one audit question with a
  regulator attached), **applying or redeeming a gift card** (a bearer instrument
  whose balance can be moved onto an order the staff member controls),
  **revoking the customer's other sessions**, and **changing the wishlist share
  state**. Support needs to *see* what the customer sees; it does not need to spend
  their money, and the day it does is the day nobody can tell a support action from
  a fraud.
- **Ending it is bounded three ways.** The banner's control calls
  `stopImpersonation()`, which revokes the impersonated session and clears
  `md_session`; it requires the caller to present an `md_admin` session whose
  `userId` equals the impersonated row's `impersonator_user_id`, so an
  impersonation cannot be handed to another browser by copying a cookie. If nobody
  presses it, `expires_at = now() + 30 minutes` ends it anyway, and
  `/api/cron/cleanup-sessions` reaps the row. Either way an
  `impersonate_stop` audit row is written — on the timeout path by the cron, as a
  `system` actor carrying the original `impersonator_user_id`, because a support
  session that simply stops appearing is a gap in exactly the trail this feature
  exists to produce.
- Every write made during an impersonated session carries both
  `actor_customer_id` and `impersonator_user_id` into `audit_logs` — the columns
  already exist for exactly this.
- Rate limited `impersonate:user:<userId>` 5 / day. Impersonating twenty customers
  in an afternoon is not support, it is browsing.

---

## 2. Authorization — the model as data

### 2.1 The four tables, and what each one is for

Nothing here is new schema. `roles`, `permissions`, `role_permissions`,
`user_roles` are `02` §2.2 verbatim.

| Table | Role |
| --- | --- |
| `permissions` | The catalogue. `key` is the primary key and the exact string passed to `requirePermission()`. Seeded from `src/lib/rbac/catalogue.ts` |
| `roles` | Named bundles. `key` is the stable machine name; `is_system = true` on the seven launch roles, which cannot be deleted or re-keyed |
| `role_permissions` | The matrix, one row per grant, with `granted_by_user_id` and `created_at` because "who widened this role and when" is the first question of any access review |
| `user_roles` | Many-to-many. A user's effective permission set is the **union** over their roles |

**There are no deny rules and no permission wildcards.** A grant is additive and a
role either has a key or does not. Deny-overrides sounds like extra control and is
actually a second, opposite-signed evaluation order that nobody can reason about
six months later; the union of positive grants is a set, and a set is testable.
`owner` holds every permission because it has every row in `role_permissions`, not
because of a runtime short-circuit — see §2.6.

### 2.2 Naming convention

`02` §1.2 and `08` §5 fix the shape: **`<singular_resource>.<action>`**, matched
by `permissions.resource` and `permissions.action`. The brief's vocabulary maps
onto it mechanically:

| Brief spelling | Canonical key |
| --- | --- |
| `products.view` / `.create` / `.edit` / `.delete` | `product.read` / `product.create` / `product.update` / `product.delete` |
| `orders.view` / `.edit` / `.refund` | `order.read` / `order.update` / `order.refund` |
| `pricing.view` / `.edit` | `price.read` / `price.update` |
| `inventory.view` / `.edit` | `inventory.read` / `inventory.adjust` |
| `content.view` / `.edit` / `.publish` | `cms.read` / `cms.update` / `cms.publish` |
| `settings.view` / `.edit` | `settings.read` / `settings.manage` |

`08` §5 already writes `product.read`, `order.refund`, `cms.publish` and
`settings.manage` into the admin route map, and `02` writes `product.update` and
`price.approve_recalc` into the `permissions` table description. Renaming them to
match a different spelling in this document would put two names on one string in
three documents. The canonical spelling wins.

### 2.3 The complete permission catalogue

**This section was 65 keys and is now 72.** `11-registries.md` §1.3 is the source
of truth for the list; the seven additions and the six rejected spellings below
are its decisions, reproduced here verbatim because `src/lib/rbac/catalogue.ts`
is built from this table. Where this table and `11 §1.3` ever differ, `11` is
right.

`src/lib/rbac/catalogue.ts` exports this as a frozen array; `prisma/seed/02-roles.ts`
inserts it into `permissions`; `tests/unit/rbac-catalogue.test.ts` asserts the
three copies agree (§3.6) and that `PERMISSION_KEYS.length === 72`.

| # | Key | resource | action | What it permits |
| ---: | --- | --- | --- | --- |
| 1 | `dashboard.view` | dashboard | view | `/admin`, the KPI dashboard, global ⌘K search |
| | **Catalogue** | | | |
| 2 | `product.read` | product | read | List and view products, variants, market content, completeness scores |
| 3 | `product.create` | product | create | Create a product |
| 4 | `product.update` | product | update | Edit product fields, market content, attribute values, stone/material/category/collection/tag membership, media order |
| 5 | `product.delete` | product | delete | Soft-delete a product (`products.deleted_at`). Hard delete exists nowhere |
| 6 | `product.publish` | product | publish | `products.status → active`, `published_at`, `product_market_content.is_published`, archive |
| 7 | `variant.update` | variant | update | Create, edit, retire variants, options, option values |
| 8 | `catalog.product_media` | catalog | product_media | Attach, detach, reorder media on a product |
| 9 | `category.update` | category | update | Category CRUD, tree moves, `materialized_path` rebuilds |
| 10 | `collection.update` | collection | update | Collection CRUD, `collection_rules`, `collection_rule_values` |
| 11 | `stone.update` | stone | update | Stone CRUD and `product_stones` links |
| 12 | `material.update` | material | update | Material CRUD and `variant_materials` |
| 13 | `attribute.update` | attribute | update | `attributes` / `attribute_options` CRUD |
| 14 | `tag.update` | tag | update | `tags` / `product_tags` / `media_tags` / `journal_post_tags` CRUD |
| | **Media** | | | |
| 15 | `media.read` | media | read | Browse the library, view usage reports |
| 16 | `media.create` | media | create | `POST /api/media/sign`, `registerUpload()`, create folders |
| 17 | **`media.update`** | media | update | `replaceMedia()`, alt text, title, credit, folder move, tagging |
| 18 | `media.delete` | media | delete | Soft-delete an asset (`media.deleted_at`); the `06` usage report runs first |
| 19 | **`media.hard_delete`** | media | hard_delete | Permanently remove the provider asset (`06` §7.8); type-to-confirm |
| 20 | `media.upload_vector` | media | upload_vector | `POST /api/media/svg` — upload `image/svg+xml`. Deliberately separate: `06` makes this an XSS-adjacent capability |
| | **Pricing** | | | |
| 21 | `price.read` | price | read | `prices`, `price_history`, `metal_rates`, recalc previews — **excluding** cost and margin columns |
| 22 | **`price.read_cost`** | price | read_cost | `prices.cost_minor`, `variant_component_costs`, every margin column and the "below cost" recalc flag |
| 23 | `price.update` | price | update | Write a `prices` row; `setManualPrice`, `setFormulaBinding` |
| 24 | **`price.recalc_preview`** | price | recalc_preview | `createRecalcPreview()`, `rejectRecalcRun()` |
| 25 | `price.approve_recalc` | price | approve_recalc | `approveRecalcRun()`, `applyRecalcRun()`. Hard rule 6 lives on this key |
| 26 | `metal_rate.manage` | metal_rate | manage | `recordMetalRate()`, `/admin/pricing/metal-rates` |
| 27 | `pricing_rule.manage` | pricing_rule | manage | `pricing_rules` CRUD, including customer-group pricing |
| | **Inventory** | | | |
| 28 | `inventory.read` | inventory | read | `inventory_items`, `inventory_transactions`, low-stock, reservations |
| 29 | `inventory.adjust` | inventory | adjust | `adjustment`, `receipt`, `recount`, `write_off` ledger rows; manual reservation release |
| 30 | `inventory.transfer` | inventory | transfer | `transfer_in` / `transfer_out` between locations |
| 31 | `location.manage` | location | manage | `inventory_locations`, `market_locations` |
| | **Orders** | | | |
| 32 | `order.read` | order | read | Order list and detail (the customer block is gated separately by `customer.read` — §2.4 note 2) |
| 33 | `order.create` | order | create | Draft / phone orders (`05` §6) |
| 34 | `order.update` | order | update | Non-financial edits: internal note, pre-dispatch address, tags, **and releasing a `pending_review` fraud hold** (`05` §5.3) |
| 35 | **`order.discount_manual`** | order | discount_manual | Add a manual line discount to a draft order, capped by `settings['orders.manual_discount_max_bp']` |
| 36 | `order.fulfil` | order | fulfil | Create `shipments`, mark fulfilled, print packing slips |
| 37 | `order.cancel` | order | cancel | Transition to `cancelled`, release reservations |
| 38 | `order.refund` | order | refund | `refundPayment()`, write `refunds`, webhook replay. The single most money-adjacent key in the catalogue |
| | **Returns** | | | |
| 39 | `return.read` | return | read | RMA list and detail |
| 40 | `return.update` | return | update | Update a return, record receipt, restock |
| 41 | `return.approve` | return | approve | Approve or reject a return request |
| | **Customers** | | | |
| 42 | `customer.read` | customer | read | Customer record, addresses, and the customer block of an order |
| 43 | `customer.update` | customer | update | Edit customer fields, group, internal note |
| 44 | `customer.export` | customer | export | Any bulk export whose resource carries customer PII. Required **in addition to** `export.run` |
| 45 | `customer.anonymize` | customer | anonymize | `anonymizeCustomer()` — the erasure routine (§8.3) |
| 46 | `user.impersonate` | user | impersonate | `startImpersonation()` (§1.11) |
| | **Marketing** | | | |
| 47 | `coupon.manage` | coupon | manage | `coupons`, `coupon_amounts`, `coupon_conditions`, gift-card issuance. This is money |
| 48 | `campaign.manage` | campaign | manage | `campaigns` CRUD and scheduling |
| 49 | `newsletter.manage` | newsletter | manage | Subscriber list, send-list export, suppression |
| | **Content** | | | |
| 50 | `cms.read` | cms | read | Pages, sections, blocks, `getDraftPage`, version history, diffs |
| 51 | `cms.update` | cms | update | `applyBuilderOps`, every builder autosave, per-breakpoint config. **Does not include restore** — that is row 53 |
| 52 | `cms.publish` | cms | publish | `publishPage`, `publishVersion`, `schedulePage`, `unpublishPage`, `archivePage`; journal publish |
| 53 | **`cms.restore`** | cms | restore | `restoreVersion()` and version pinning. Restore writes to the **draft**; going live still needs `cms.publish` |
| 54 | **`cms.delete`** | cms | delete | Soft-delete a `cms_pages` row (`deleted_at`) |
| 55 | `content.preview` | content | preview | `createPreviewToken()`, `revokePreviewToken()` — minting a link a stranger can open |
| 56 | `journal.manage` | journal | manage | `journal_posts` CRUD **and** publish |
| 57 | `menu.manage` | menu | manage | `navigation_menus` / `navigation_items`, `saveMenu()` |
| 58 | `redirect.manage` | redirect | manage | `redirects` CRUD and CSV import |
| 59 | `seo.manage` | seo | manage | `seo_metadata` overrides, `curated_facets`, robots directives |
| | **Markets and settings** | | | |
| 60 | `market.preview` | market | preview | Mint a market-preview token (`04` §7.2); reach `/_preview/**` |
| 61 | `market.manage` | market | manage | `markets`, `currencies`, `market_locations`, payment-provider binding, activation |
| 62 | `settings.read` | settings | read | Read non-secret `settings` rows: copy, thresholds, shipping bands |
| 63 | `settings.manage` | settings | manage | Write `settings` (feature flags, retention, error copy) **and `email_templates`** |
| 64 | `integration.manage` | integration | manage | Integration status, the `/admin/system/webhooks` console, `/api/health?verbose=1`. Never reveals a secret value — only which keys are set |
| | **Identity** | | | |
| 65 | `user.manage` | user | manage | Invite, edit, deactivate staff; assign roles; `resetTotp`, `unlockUser` — subject to §2.6 |
| 66 | `role.manage` | role | manage | Create roles, edit `role_permissions`. The key that can grant every other key |
| 67 | `audit.read` | audit | read | `/admin/system/audit-log` |
| | **Tools and system** | | | |
| 68 | `import.run` | import | run | Reach the import tool, upload a CSV, run the bounded dry run. **It never authorises the apply** — see the resource rule below |
| 69 | `export.run` | export | run | Reach the export tool. Each resource additionally needs its own read permission, and PII resources need `customer.export` |
| 70 | `job.read` | job | read | `/admin/system/jobs`, `/api/admin/jobs/[id]/stream` |
| 71 | `job.retry` | job | retry | Requeue a failed job |
| 72 | `search.manage` | search | manage | Zero-result report, synonyms, promotions, search redirects, manual reindex |

**The seven keys added since the first draft of this section, and why the matrix
needed them rather than a rename.** `media.update`, `media.hard_delete`,
`cms.restore` and `cms.delete` have **no equivalent** in the 65-key list: there
was no way to express "may restore a version but not publish it" or "may
permanently destroy a Cloudinary asset", and both are specified behaviour in
`06` §5.4 and `06` §7.8. `price.read_cost` and `price.recalc_preview` were
commissioned by `04` §1.3 and never arrived, which left `04` §4's entire
cost/margin column set visible either to everyone holding `price.read` or to
nobody. `order.discount_manual` was required by name in `05` §6.

**Six rejected spellings exist and this document deliberately does not print
them.** `tests/unit/rbac-catalogue.test.ts` fails when any string in the
**Renamed from** column of `11-registries.md` §1.3 appears anywhere under `src/`
or `docs/architecture/` — so the one file that may contain them is `11` itself,
which is where an agent greps for the old name and finds the new one. Reproducing
that column here would fail the test this section commissions. What the column
covers, described rather than quoted: the three catalogue-key spellings `03` §1.8
used; the create-flavoured metal-rate key `04` §1.3 commissioned; the single
catalogue-settings key that named five different resources; the page-scoped CMS
family and the three other CMS keys `06` §1.5 invented; and the webhook-replay key
`08` §5 invented before correcting itself.

**Two capabilities are deliberately collapsed rather than split, and both
collapses are decisions, not typo fixes.** The journal's edit and publish keys
become one `journal.manage`, because §2.5 grants `content_editor` `cms.publish`
anyway and splitting the journal while pages are unsplit for the same role
produces a distinction with no holder. The email-template key becomes
`settings.manage`, because `08` §5 already routes
`/admin/settings/email-templates` to `settings.manage` and an email template is a
`settings`-class editable; two documents beat one. The webhook-replay capability
is **composed**, not collapsed: `/admin/system/webhooks/[id]/replay` requires
`integration.manage` **and** `order.refund`, both, because replaying a payment
event can move money.

**A route map may not widen the catalogue.** Any route needing a capability the
72 keys cannot express is a change to this section first, and to the route table
second. That rule is what stopped the seventy-third key being invented in `08` §5,
and it is why the four genuinely new CMS and media keys are here rather than
there.

**There is no `bulk_edit.*` key and none is added.** A bulk edit requires exactly
the permission a single edit of that resource requires — `product.update`,
`price.update`, `inventory.adjust` — re-checked **per row inside the job**
against the queuing user's re-resolved permission set (§3.2). `01` §2.7 routing
more than 50 rows to a job changes the execution model, not the authorisation
model, and a permission that names no resource is the escalation §2.3's own
generic-tool rule exists to prevent.

**A saved view carries no permission either.** `/admin/tools/saved-views` and
every saved view are gated on the owning resource's read permission
(`saved_views.resource = 'products'` ⇒ `product.read`, `'orders'` ⇒ `order.read`,
and so on through the eight values).

> **NEEDS INPUT:** whether `content_editor` may publish content unsupervised.
> §2.5 grants them `cms.publish` and `journal.manage`; `06` §1.5 assumed an
> owner/admin publish gate. Both are one row of `role_permissions`, the answer is
> an editorial-governance decision rather than an architectural one, and it is
> reversible from `/admin/settings/roles` with no deploy.

**The two generic tools do not launder permissions.** `import.run` and
`export.run` name a *capability* (drive the CSV machinery), not a *resource*, and
a permission that names no resource is an escalation waiting to be found. Walk it
without the rule: `inventory_manager` holds `import.run` and not `price.update`,
uploads a `resource = 'prices'` CSV for the US market, and rewrites every price in
the catalogue — through a tool whose permission check passed. So:

| Tool | Required, in addition | Enforced in |
| --- | --- | --- |
| `importJobApply()` where `resource = 'products'` / `'variants'` | `product.update` (and `product.create` in `create` or `upsert` mode) | `src/lib/importexport/apply.ts`, first statement |
| … `resource = 'prices'` | `price.update` | same |
| … `resource = 'inventory'` | `inventory.adjust` | same |
| … `resource = 'redirects'` | `redirect.manage` | same |
| … `resource = 'customers'` | `customer.update` **and** `customer.export` — an upsert import of a customer file is a write *and* a way to confirm which addresses are already in the database | same |
| `exportRun()` where the resource includes customer PII (`customers`, `orders`, `returns`) | `customer.export` (§8.4) | `src/lib/importexport/export.ts` |

`requiredPermissionsForImport(resource, mode)` is a pure function in
`src/lib/rbac/catalogue.ts`, exhaustive over the `import_jobs.resource` union, so
adding a seventh importable resource without deciding its permission does not
compile. `tests/integration/rbac-matrix.test.ts` (§3.6) runs every role against
every `(resource, mode)` pair, which is the only way this stays true after
somebody adds `resource = 'coupons'`.

### 2.4 The seven roles

`02` §2.2 fixes the seven `roles.key` values and states that this section must use
them verbatim. It does. The brief's descriptive labels map onto them as follows;
`roles.name` is the display label and is the only thing the admin UI shows.

| `roles.key` | `roles.name` | Brief's label | Who this is in the business |
| --- | --- | --- | --- |
| `owner` | Owner | super admin | The proprietor and whoever they trust with the keys. Holds every permission, including the ones that grant permissions |
| `admin` | Administrator | admin | Day-to-day manager of the whole platform, minus the four keys that would let them redefine the platform or its access rules |
| `catalog_manager` | Catalogue Manager | manager | Merchandiser: products, variants, stones, materials, media, prices, SEO |
| `inventory_manager` | Inventory & Fulfilment | fulfillment | Stock, locations, transfers, picking, packing, dispatch |
| `order_manager` | Orders & Accounting | accounting | Orders, refunds, returns, customer records, reconciliation exports |
| `content_editor` | Content Editor | editor | Page builder, journal, menus, redirects, campaigns, newsletter |
| `analyst` | Analyst | marketing | Read-only across the business plus non-PII exports. Dashboards, not records |

**Three honest notes about that mapping.**

1. **`coupon.manage` is not on `analyst`, and is not on `content_editor`.** A
   coupon is a fixed-amount discount stored per currency (`coupon_amounts`), and
   `01` §2.6 spends a paragraph on how a mis-authored one becomes a $500 discount
   on a $600 chain. Until the client says otherwise, promotions are an `owner` /
   `admin` action. This is the one place the seven-role launch matrix is
   deliberately more restrictive than an org chart would suggest.
2. **`order.read` carries customer PII, and `analyst` holds it.** An order detail
   page shows `orders.email`, the recipient name and the full `order_addresses`
   snapshot. Saying "`analyst` cannot see customer records because they lack
   `customer.read`" while granting them `order.read` is therefore false — and the
   same applies to `inventory_manager`, who genuinely needs the shipping address to
   pack a parcel but has no business with the customer's contact history. The fix
   is not to take `order.read` away from either of them; it is that the
   **customer-identifying block of an order is selected only for an actor holding
   `customer.read`**. `getOrderDetail(actor, orderId)` omits `email`, `phone`,
   `customer_id` and the address lines from its projection otherwise, replacing
   them with the recipient's first name and the destination city/country — enough
   to recognise an order, not enough to be a customer list. It is a `SELECT` list
   decision in `src/lib/orders/`, not a conditional render, for the reason §3.6
   gives: a component that receives a value it should not see has already leaked
   it. `inventory_manager` holds `customer.read` and therefore sees the address;
   `analyst` does not and therefore does not.
3. **If the client wants a dedicated marketing role, it is seed data, not code.**
   `INSERT INTO roles (key, name, is_system) VALUES ('marketing', 'Marketing', false)`
   plus the `role_permissions` rows. `roles` is a table precisely so that the
   eighth role does not require a deploy (`02` §1.9). Nothing in §3's enforcement
   knows how many roles exist.

> **NEEDS INPUT:** the actual named staff and which role each holds at launch, and
> whether promotions (`coupon.manage`, `campaign.manage`) should sit with an
> eighth `marketing` role. No staff account is seeded and no person is invented;
> `scripts/create-admin.ts` creates one owner from a real email the client
> supplies.

### 2.5 The complete role → permission matrix

`src/lib/rbac/matrix.ts` exports this table as
`Record<RoleKey, readonly PermissionKey[]>`; `prisma/seed/02-roles.ts` writes it
into `role_permissions`; `tests/integration/rbac-matrix.test.ts` (§3.6) proves the
running system behaves exactly like it. Reading the matrix is therefore the same
as reading the system.

**This is the 72-key matrix.** It gained the seven rows §2.3 added, marked in
bold; it agrees row-for-row with `11-registries.md` §1.4, and where the two ever
differ `11` is right.

Legend: ✓ granted · — not granted.

| Permission | `owner` | `admin` | `catalog_manager` | `inventory_manager` | `order_manager` | `content_editor` | `analyst` |
| --- | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| `dashboard.view` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `product.read` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `product.create` | ✓ | ✓ | ✓ | — | — | — | — |
| `product.update` | ✓ | ✓ | ✓ | — | — | — | — |
| `product.delete` | ✓ | ✓ | ✓ | — | — | — | — |
| `product.publish` | ✓ | ✓ | ✓ | — | — | — | — |
| `variant.update` | ✓ | ✓ | ✓ | — | — | — | — |
| `catalog.product_media` | ✓ | ✓ | ✓ | — | — | ✓ | — |
| `category.update` | ✓ | ✓ | ✓ | — | — | — | — |
| `collection.update` | ✓ | ✓ | ✓ | — | — | — | — |
| `stone.update` | ✓ | ✓ | ✓ | — | — | — | — |
| `material.update` | ✓ | ✓ | ✓ | — | — | — | — |
| `attribute.update` | ✓ | ✓ | ✓ | — | — | — | — |
| `tag.update` | ✓ | ✓ | ✓ | — | — | ✓ | — |
| `media.read` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `media.create` | ✓ | ✓ | ✓ | — | — | ✓ | — |
| **`media.update`** | ✓ | ✓ | ✓ | — | — | ✓ | — |
| `media.delete` | ✓ | ✓ | — | — | — | ✓ | — |
| **`media.hard_delete`** | ✓ | — | — | — | — | — | — |
| `media.upload_vector` | ✓ | ✓ | — | — | — | — | — |
| `price.read` | ✓ | ✓ | ✓ | — | ✓ | — | ✓ |
| **`price.read_cost`** | ✓ | ✓ | — | — | — | — | — |
| `price.update` | ✓ | ✓ | ✓ | — | — | — | — |
| **`price.recalc_preview`** | ✓ | ✓ | ✓ | — | — | — | — |
| `price.approve_recalc` | ✓ | ✓ | — | — | — | — | — |
| `metal_rate.manage` | ✓ | ✓ | ✓ | — | — | — | — |
| `pricing_rule.manage` | ✓ | ✓ | ✓ | — | — | — | — |
| `inventory.read` | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ |
| `inventory.adjust` | ✓ | ✓ | — | ✓ | — | — | — |
| `inventory.transfer` | ✓ | ✓ | — | ✓ | — | — | — |
| `location.manage` | ✓ | ✓ | — | ✓ | — | — | — |
| `order.read` | ✓ | ✓ | — | ✓ | ✓ | — | ✓ |
| `order.create` | ✓ | ✓ | — | — | ✓ | — | — |
| `order.update` | ✓ | ✓ | — | — | ✓ | — | — |
| **`order.discount_manual`** | ✓ | ✓ | — | — | ✓ | — | — |
| `order.fulfil` | ✓ | ✓ | — | ✓ | ✓ | — | — |
| `order.cancel` | ✓ | ✓ | — | — | ✓ | — | — |
| `order.refund` | ✓ | ✓ | — | — | ✓ | — | — |
| `return.read` | ✓ | ✓ | — | ✓ | ✓ | — | ✓ |
| `return.update` | ✓ | ✓ | — | ✓ | ✓ | — | — |
| `return.approve` | ✓ | ✓ | — | — | ✓ | — | — |
| `customer.read` | ✓ | ✓ | — | ✓ | ✓ | — | — |
| `customer.update` | ✓ | ✓ | — | — | ✓ | — | — |
| `customer.export` | ✓ | ✓ | — | — | — | — | — |
| `customer.anonymize` | ✓ | — | — | — | — | — | — |
| `user.impersonate` | ✓ | ✓ | — | — | — | — | — |
| `coupon.manage` | ✓ | ✓ | — | — | — | — | — |
| `campaign.manage` | ✓ | ✓ | — | — | — | ✓ | — |
| `newsletter.manage` | ✓ | ✓ | — | — | — | ✓ | — |
| `cms.read` | ✓ | ✓ | ✓ | — | — | ✓ | ✓ |
| `cms.update` | ✓ | ✓ | — | — | — | ✓ | — |
| `cms.publish` | ✓ | ✓ | — | — | — | ✓ | — |
| **`cms.restore`** | ✓ | ✓ | — | — | — | ✓ | — |
| **`cms.delete`** | ✓ | ✓ | — | — | — | — | — |
| `content.preview` | ✓ | ✓ | ✓ | — | — | ✓ | — |
| `journal.manage` | ✓ | ✓ | — | — | — | ✓ | — |
| `menu.manage` | ✓ | ✓ | — | — | — | ✓ | — |
| `redirect.manage` | ✓ | ✓ | — | — | — | ✓ | — |
| `seo.manage` | ✓ | ✓ | ✓ | — | — | ✓ | — |
| `market.preview` | ✓ | ✓ | ✓ | — | — | ✓ | — |
| `market.manage` | ✓ | — | — | — | — | — | — |
| `settings.read` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `settings.manage` | ✓ | ✓ | — | — | — | — | — |
| `integration.manage` | ✓ | — | — | — | — | — | — |
| `user.manage` | ✓ | ✓ | — | — | — | — | — |
| `role.manage` | ✓ | — | — | — | — | — | — |
| `audit.read` | ✓ | ✓ | — | — | — | — | — |
| `import.run` | ✓ | ✓ | ✓ | ✓ | — | — | — |
| `export.run` | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ |
| `job.read` | ✓ | ✓ | ✓ | ✓ | ✓ | — | — |
| `job.retry` | ✓ | ✓ | — | — | — | — | — |
| `search.manage` | ✓ | ✓ | ✓ | — | — | ✓ | — |

**Where the seven new keys sit, and why.** `price.read_cost` is supplier cost and
margin, which `04` §4 explicitly wants withheld from a merchandiser auditing
prices, so it stops at `owner`/`admin` — a `catalog_manager` holding `price.read`
sees the price and not the margin. `price.recalc_preview` reaches
`catalog_manager` because they enter the rates and must be able to see what a
rate change *would* do; `price.approve_recalc` does not, because a role that may
edit one price must not be able to ship eight thousand (`04` §1.3).
`order.discount_manual` follows `order.create`, since the draft order is where a
manual discount is typed. `media.update` follows `media.create`. `cms.restore`
follows `cms.publish` — withholding it from a role that can already publish is
incoherent — while `cms.delete` stops at `admin`. `media.hard_delete` is `owner`
only, because it destroys the provider asset irreversibly and no soft-delete
stands behind it.

**What separates `owner` from `admin`, deliberately:** `role.manage`,
`market.manage`, `integration.manage`, `customer.anonymize` and now
`media.hard_delete`. Those are, in order: the ability to redefine who can do
what; the ability to add a market and therefore a currency and therefore a whole
price surface; the ability to re-point the payment providers; the ability to
irreversibly destroy customer data; and the ability to irreversibly destroy a
brand asset. An `admin` runs the business. An `owner` changes what the business
*is*.

> **RESOLVED — was CHANGE REQUIRED IN 09 §1.2 P03:** exit criterion (b) reads "`permissions` row
> *Verified applied in 09.*
> count equals `Object.keys(catalogue).length`". The catalogue is a frozen array,
> not an object; the assertion is `permissions` row count
> `=== PERMISSION_KEYS.length`, and the number is **72**.

### 2.6 Three invariants the service layer enforces, because a constraint cannot

1. **No-escalation.** `assignRole(actor, userId, roleId)` and
   `setRolePermissions(actor, roleId, keys)` both reject when the resulting
   permission set is not a subset of `actor.permissions`. Without it, `user.manage`
   silently implies every permission: an `admin` grants the `owner` role to a
   second account they control and signs in as it. The check is one line and it is
   the difference between a role model and a suggestion.
   `tests/integration/rbac-escalation.test.ts` attempts exactly this as an `admin`
   and asserts `FORBIDDEN`.
2. **At least one active owner.** Deactivating a user, soft-deleting a user or
   removing the `owner` role fails with `LastOwnerError` when it would leave zero
   rows in `user_roles JOIN roles ON key='owner' JOIN users ON is_active AND
   deleted_at IS NULL`. This is a cross-row invariant, so it cannot be a `CHECK`;
   it is a `SELECT … FOR UPDATE` on the owner set inside the same transaction.
3. **No administering upward.** The no-escalation rule covers *granting*, and on
   its own it leaves the other half of the takeover open: `admin` holds
   `user.manage`, so without this rule an `admin` can deactivate the `owner`, reset
   the `owner`'s TOTP (§1.9 — which revokes their sessions and mails a recovery OTP
   to an address the `admin` may also control if they can edit it), change the
   `owner`'s email, or unlock and re-invite the account. None of those is a grant,
   so none of them trips rule 1, and every one of them ends with the
   highest-privileged account in the building under the control of a lower one.
   **`assertMayAdminister(actor, targetUserId)` therefore fronts every write to a
   `users` row that the actor does not own — `assignRole`, `revokeRole`,
   `deactivateUser`, `softDeleteUser`, `resetTotp`, `unlockUser`, `updateUserEmail`,
   `resendInvite` — and throws `ForbiddenError` unless the target's effective
   permission set is a **subset** of the actor's.** It is the same set comparison as
   rule 1, pointed at the target instead of the role, and it makes `user.manage`
   mean "administer people at or below me" rather than "administer people".
   Self-service (changing your own password, enrolling your own TOTP) is exempt by
   construction: `targetUserId === actor.userId` short-circuits, because a set is a
   subset of itself anyway. `tests/integration/rbac-escalation.test.ts` attempts
   each of the eight as an `admin` against an `owner` and asserts `FORBIDDEN`.

**`owner` holds every permission by explicit rows, not by a runtime short-circuit.**
A short-circuit (`if (actor.roleKeys.includes('owner')) return true`) means the
permission-matrix screen shows an owner with empty checkboxes while the owner can
do everything, and an access review reads a lie. Instead,
`prisma/seed/02-roles.ts` grants `owner` every key in the catalogue, the seed is
idempotent and re-runs on every deploy as part of `npm run db:seed`, and
`tests/unit/rbac-catalogue.test.ts` fails if `matrix.owner.length !==
PERMISSION_KEYS.length`. A new permission is therefore held by `owner` from the
moment it exists, and visibly so.

### 2.7 Resolving the permission set

```ts
// src/lib/rbac/index.ts
export async function effectivePermissions(userId: string): Promise<Set<PermissionKey>>;
```

One query, `user_roles ⋈ role_permissions`, returning the union:

```sql
SELECT DISTINCT rp.permission_key
  FROM user_roles ur
  JOIN role_permissions rp ON rp.role_id = ur.role_id
 WHERE ur.user_id = $1;
```

Resolved **once per request**, memoised with React `cache()` alongside the session
lookup in **`getStaffActor()`**, so an admin page that renders forty
permission-gated components issues one query, not forty. It is *not* cached
across requests and not stored in the cookie — that is what makes a permission
change take effect on the next click (§1.10).

> **DECISION SETTLED — there is no `getActor()`.** An earlier draft of this
> sentence named one; §3.2 states in the same breath that no such function exists,
> and `09` §1.2 P03A lists "`getActor()` (`07` §3.2`)" in its Builds column,
> citing the section that forbids it. The two-resolver split is the one that
> survives, because §1.1's argument for it is a real confused-deputy defence: a
> single resolver that reads `md_admin` first makes the storefront treat a
> shopping staff member as staff, and then prices, caches and audits their session
> as an admin's. `getStaffActor()` and `getCustomerActor()` are the only two, and
> neither consults the other's cookie.
>
> **RESOLVED — was CHANGE REQUIRED IN 09 §1.2 P03A:** replace `getActor()` in the Builds column
> *Verified applied in 09.*
> with `getStaffActor()` / `getCustomerActor()` (`07` §3.2).

---

## 3. Enforcement — the choke point

### 3.1 The rule, stated before the mechanism

> **Hiding UI is not authorization** (hard rule 9). Every permission-gated control
> in the admin panel is duplicated by a server-side check on the same key, and the
> server-side check is the one that decides. A build in which every `<Can>` wrapper
> was deleted would look wrong and behave identically.

`01` §2.1 already establishes why the admin layout cannot be the guard: a server
action is a plain POST addressed by a generated id, reachable by any caller who
has one, and it does not re-render the layout. So the guard has to be on the
*callee*, and it has to be impossible to write a callee without one.

### 3.2 The actor

```ts
// src/lib/rbac/types.ts
export type StaffActor = {
  kind: 'staff';
  userId: string;
  sessionId: string;
  email: string;
  roleKeys: readonly string[];
  permissions: ReadonlySet<PermissionKey>;
  ip: string | null;
  requestId: string;
};
export type CustomerActor = {
  kind: 'customer';
  customerId: string;
  sessionId: string;
  impersonatorUserId: string | null;
  ip: string | null;
  requestId: string;
};
export type GuestActor  = { kind: 'guest'; cartTokenHash: string | null; ip: string | null; requestId: string };
export type SystemActor = { kind: 'system'; reason: 'cron' | 'webhook' | 'job' | 'seed'; requestId: string };
export type Actor = StaffActor | CustomerActor | GuestActor | SystemActor;
```

```ts
// src/lib/rbac/index.ts
// Two resolvers, one per population (§1.1). There is no getActor() and no cookie
// precedence rule: the caller names the population, or it does not compile.
// §2.7's memoisation note names getStaffActor(); an earlier draft named a
// getActor() that this file has never exported and never will.
export const getStaffActor:    () => Promise<StaffActor | null>;     // md_admin only
export const getCustomerActor: () => Promise<CustomerActor | GuestActor>;  // md_session, else md_cart
export function can(actor: Actor, permission: PermissionKey): boolean;
export function requirePermission(
  actor: Actor, permission: PermissionKey,
): asserts actor is StaffActor;                                  // throws ForbiddenError (08 §1.4)
export async function requireStaffSession(): Promise<StaffActor>;      // throws UnauthenticatedError
export async function requireRecentTotp(actor: StaffActor, maxAgeMinutes: number): Promise<void>;  // §1.9
export async function requireCustomer(): Promise<CustomerActor>;       // throws UnauthenticatedError
export function assertNotImpersonated(actor: CustomerActor): void;     // §1.11
export async function assertMayAdminister(actor: StaffActor, targetUserId: string): Promise<void>;  // §2.6
```

Both resolvers are `cache()`'d per request, both assert the principal column
matches the cookie they read (§1.1), and neither consults the other's cookie —
so "signed in as staff" and "signed in as a customer" are two independent facts
about one browser, which is what they physically are.

`requirePermission` is an **assertion signature**. After it returns, TypeScript
narrows `actor` to `StaffActor`, so the handler body gets `actor.userId` without a
cast. That is not sugar: it means the ergonomic way to obtain `userId` — which
every audit write needs — is to have called the guard.

**System actors cannot be forged from a request.** Neither resolver can return
`system`; they return `staff`, `customer` or `guest` and nothing else. A
`SystemActor` is constructed only by `systemActor(reason)` in
`src/lib/rbac/system.ts`, which `no-restricted-imports` permits only in
`src/app/api/cron/**`, `src/lib/payments/webhook.ts`, `src/lib/jobs/**` and
`prisma/seed/**`. `can()` returns `true` for a system actor, and every write it
makes still lands in `audit_logs` with `actor_type` of `cron`, `webhook` or
`system`.

**Which is exactly why a job that acts for a person may not run as `system`.**
`can()` returning `true` unconditionally means the queue is a permission
laundromat: an `inventory_manager` queues a price import or a PII export, the
worker picks it up as a `SystemActor` five seconds later, and §3.5's
service-level `requirePermission()` — the check that was supposed to protect the
non-HTTP callers — waves it through. `02` already carries the fix in the schema:
`jobs.created_by_user_id`. So `runJob()` branches on it and the branch is not
optional.

> **DECISION CHANGED — this rule was a closed allowlist of three job kinds and is
> now a per-kind flag.** The previous version of this section read: "`NULL` ⇒
> `systemActor('job')`, permitted **only** for `collection_refresh`,
> `sitemap_rebuild`, `reindex_search`". It was written before `send_email`,
> `feed_rebuild`, `analytics_dispatch`, `media_orphan_scan`,
> `product_metrics_refresh`, `consistency_check`, `reconcile_inventory` and
> `audit_archive` existed, and because it was written as a closed list, every one
> of them would have failed. **The worst of those is silent and immediate:**
> `05` §4.3 step 9 writes the order-confirmation email as a `jobs` row *inside the
> webhook transaction*, deliberately, so the mail cannot be lost for a paid order
> — and a webhook handler has no user, so that row carries
> `created_by_user_id = NULL`. Under the allowlist, every order confirmation,
> shipping notice, refund notice and cancellation email failed as `FORBIDDEN` in
> `jobs.error`, from the first paid order, with nothing customer-facing to say so.
> A reader who implemented the old rule must delete it; the replacement is below.

**The rule: `jobs.created_by_user_id` decides *whether* a system actor is even
considered, and the job's own kind decides whether one is permitted.**
`src/lib/jobs/kinds.ts` carries the flag (`11-registries.md` §3.2 owns the
complete table and is the source of truth for it):

```ts
// src/lib/jobs/kinds.ts — one entry per job_kind enum value (11 §3.1).
export type JobKindDefinition = {
  readonly kind: JobKind;
  /** May this kind run with jobs.created_by_user_id IS NULL, as systemActor('job')? */
  readonly systemPermitted: boolean;
  /** Non-null ⇒ jobs.dedupe_key is required and uq_jobs_dedupe applies. */
  readonly dedupeKey: 'none' | 'kind' | 'market' | 'entity' | 'caller_supplied';
  readonly maxAttempts: number;
};
export const JOB_KINDS: Readonly<Record<JobKind, JobKindDefinition>>;
```

```ts
// src/lib/jobs/run.ts
export async function runJob(job: Job): Promise<void> {
  const def = JOB_KINDS[job.kind];

  const actor: Actor =
    job.created_by_user_id !== null
      ? await staffActorFor(job.created_by_user_id)   // re-resolved, never from the payload
      : def.systemPermitted
        ? systemActor('job')
        : failJob(job, 'FORBIDDEN: this job kind requires an originating user');

  await JOB_HANDLERS[job.kind](job, actor);
}
```

| `jobs.created_by_user_id` | Actor the worker runs as |
| --- | --- |
| Non-null | `staffActorFor(userId)` — the permission set is **re-resolved from the database at run time**, not carried in the payload. If the user is now inactive, soft-deleted, or no longer holds what the job needs, the job fails as `FORBIDDEN` with that reason in `jobs.error` rather than completing on a permission its author no longer has. A job queued by someone who was fired between queue and run is exactly the case this is for. **This branch is unchanged** |
| `NULL`, and `JOB_KINDS[kind].systemPermitted === false` | A **failed job**, not a system-actor job: `jobs.status = 'failed'`, `jobs.error = 'FORBIDDEN: …'`. The five human-only kinds are `import_apply`, `export`, `bulk_edit`, `recalc_apply` and `email_batch` — the marketing send, not the transactional one |
| `NULL`, and `JOB_KINDS[kind].systemPermitted === true` | `systemActor('job')`. The thirteen machine-originated kinds are `send_email`, `collection_refresh`, `sitemap_rebuild`, `reindex_search`, `publish_scheduled`, `media_orphan_scan`, `product_metrics_refresh`, `consistency_check`, `reconcile_inventory`, `analytics_dispatch`, `feed_rebuild`, `audit_archive` and `account_export` (§8.4) |

That middle row is doing more work than it looks. `jobs.created_by_user_id` is
`ON DELETE SET NULL`, so without a kind restriction, deleting a user would
silently promote their queued import from "runs with their permissions" to "runs
with all of them". In practice `users` is soft-deleted and never hard-deleted
(`02` §1.4), so the column does not go null — but "in practice" is not a control,
and the kind check is. Moving from an allowlist of three literals to a flag on
every kind keeps that control **and** makes the failure mode of a new kind a
compile error rather than a silent `FORBIDDEN`: `JOB_KINDS` is
`Record<JobKind, …>`, so adding an enum value without deciding its actor rule
does not type-check.

**Why granting `systemActor('job')` to thirteen kinds is still safe.** `can()`
returns `true` for a system actor, so the guarantee cannot come from the
permission check — it comes from what those handlers are allowed to call. Every
`systemPermitted: true` handler calls exactly one service function that takes no
permission argument: `email.send()`, `revalidateTags()`, `reindexProduct()`,
`refreshCollection()`, `enumerateSitemap()`, a Cloudinary delete, a vendor POST,
or a read-only reconciliation. `tests/unit/job-handlers-unprivileged.test.ts`
AST-parses each of those handlers and fails on a call to any function that
appears in `services-authorized.test.ts`'s mutator list — which is the same
mechanism §3.7 uses to make an unguarded action a CI failure rather than a
review finding.

**The transactional/marketing split is the line, not "email".** `send_email` is
one transactional message — order confirmation, shipment, refund, cancellation,
abandoned cart, OTP fallback — enqueued by a webhook or a cron, and it is
`systemPermitted: true`. `email_batch` is a campaign or newsletter send to a
list, enqueued by a human holding `campaign.manage` or `newsletter.manage`, and
it is `systemPermitted: false`. A `NULL` creator on `email_batch` is exactly the
"who authorised this mailshot" question that must not have the answer "nobody".

> **SCHEMA ADDITION (`02` §2.9, `jobs`):** one column and one index, because the
> actor rule above is not by itself enough to stop a retried webhook or a replayed
> cron pass sending the same confirmation twice:
>
> ```sql
> ALTER TABLE jobs ADD COLUMN dedupe_key TEXT NULL;
>
> CREATE UNIQUE INDEX uq_jobs_dedupe ON jobs (kind, dedupe_key)
>   WHERE dedupe_key IS NOT NULL AND status IN ('queued','running');
> ```
>
> The index is partial on the live statuses, so a completed job never blocks the
> next legitimate one of the same kind. `JOB_KINDS[kind].dedupeKey` says what goes
> in the column: `'kind'` for the idempotent whole-table rebuilds (one queued
> `sitemap_rebuild` at a time), `'market'` for `feed_rebuild` (a kind-wide
> singleton would collapse two markets into one rebuild), `'entity'` for
> `publish_scheduled`, `recalc_apply` and `send_email`, `'caller_supplied'` for
> `import_apply`, `export` and `bulk_edit`, and `'none'` for `analytics_dispatch`.
> **`send_email`'s dedupe key is the natural key of the message** —
> `order:{orderId}:order_confirmation` — so the second delivery of a duplicated
> webhook cannot enqueue a second mail even before `webhook_events` de-duplication
> catches it. `04` §3.3 already assumes this index exists; `02` §2.9's
> `idx_jobs_singleton` is widened to every kind whose `dedupeKey` is `'kind'`.

`import_jobs.created_by_user_id` is the same column for the same reason, and the
apply worker re-checks `requiredPermissionsForImport()` (§2.3) against the
re-resolved set, not against what was true when the preview ran.

**A bulk edit is authorised here, not by a permission of its own.** There is no
`bulk_edit.*` key (§2.3). The `bulk_edit` handler re-checks the resource's own
edit permission — `product.update`, `price.update`, `inventory.adjust` — against
the re-resolved actor **per row**, not once for the job, so a permission revoked
between the 400th and the 401st row stops the job at the 401st and reports it in
`jobs.result`.

**Two tests hold this rule up**, and both are new:
`tests/unit/job-kinds.test.ts` asserts the `job_kind` values introspected from
`pg_enum` equal `Object.keys(JOB_KINDS)` exactly and that every kind has a
handler; `tests/integration/jobs-worker.test.ts` runs a `NULL`-creator job of
**each** `systemPermitted: true` kind and asserts it completes, and a
`NULL`-creator job of each `systemPermitted: false` kind and asserts it ends
`failed` with `FORBIDDEN` in `jobs.error`.
`tests/integration/webhook-duplicate.test.ts` gains one assertion that closes the
original defect directly: after a paid webhook, exactly one `email_logs` row
exists with `status <> 'skipped_unconfigured'`.

### 3.3 Server actions — the mandatory shape

`08` §1.5 defines `action(schema, handler)` in `src/server/actions/_wrap.ts`.
This section adds its admin sibling, and the admin one takes the permission as a
**required positional parameter**:

```ts
// src/server/actions/_wrap.ts
export function adminAction<S extends z.ZodTypeAny, T>(
  permission: PermissionKey,                                  // required, positional, first
  schema: S,
  handler: (input: z.infer<S>, actor: StaffActor) => Promise<Result<T, AppError>>,
): (raw: unknown) => Promise<ActionResult<T>>;
```

Its body, in order — this is the choke point:

```
1.  const actor = await getStaffActor()             // md_admin only; null if absent/invalid
2.  if (actor === null) throw new UnauthenticatedError(...)
3.  requirePermission(actor, permission)            // throws ForbiddenError
3b. if (STEPUP_PERMISSIONS.has(permission)) await requireRecentTotp(actor, 15)   // §1.9
4.  const input = schema.parse(raw)                 // Zod, .strict()
5.  const result = await handler(input, actor)
6.  map Result/throw -> ActionResult (08 §1.5 steps 1-4)
```

A `ForbiddenError` raised at step 3 writes an `access_denied` audit row (§7.2)
before it is mapped. An admin panel that 403s silently tells you nothing about the
person who spent an afternoon POSTing action ids to find out what they could
reach.

Every file under `src/server/actions/admin/**` is written this way and no other
way:

```ts
// src/server/actions/admin/order.ts
'use server';
export const refundOrder = adminAction(
  'order.refund',
  z.object({
    paymentId: z.string().uuid(),                  // 05 §9.4 keys the refund on the payment
    amountMinor: z.string().regex(/^\d{1,15}$/),   // Money string, 01 §2.6 — never a number
    reason: z.string().min(3).max(500),
    returnId: z.string().uuid().optional(),
    restock: z.boolean(),
  }).strict(),
  (input, actor) => refundPayment({              // ONE service call, 08 §95
    ...input,
    amountMinor: BigInt(input.amountMinor),       // string at the boundary, bigint inside
    actor,
  }),
);
```

Two things in that example are deliberate and both are corrections to an earlier
draft of this section. **The money arrives as a string and becomes a `bigint`
exactly once, at the boundary** — `01` §2.6's rule is about what crosses JSON, not
about what a service computes with. And **the input is `paymentId`, not
`orderId`, because `05` §9.4 is the owning document for refunds** and keys them on
the payment: an order with a partial capture and a second payment has two refund
ceilings, and `SELECT … FOR UPDATE` in that section locks a `payments` row. The
admin UI resolves order → payments before rendering the refund dialog.

**Lint rules that make the shape the only shape** (`eslint.config.mjs`, extending
`01` §2.2):

| Rule | Effect |
| --- | --- |
| `no-restricted-imports`: `action` from `_wrap` inside `src/server/actions/admin/**` | The non-admin wrapper, which takes no permission, is unreachable from admin actions |
| `no-restricted-syntax`: `ExportNamedDeclaration` in `src/server/actions/admin/**` whose initialiser is not `CallExpression[callee.name='adminAction']` | An admin action cannot be a bare exported async function |
| `no-restricted-syntax`: `'use server'` in any file outside `src/server/actions/**` | `01` §3 already says every `'use server'` file lives there; this makes it mechanical, so nobody hides an unwrapped action inside a component file |

### 3.4 Route handlers — the same guard, declared

```ts
// src/lib/security/route-manifest.ts
export type RouteAuth =
  | { kind: 'public' }
  | { kind: 'cart' }
  | { kind: 'customer' }
  | { kind: 'staff'; permission: PermissionKey }
  | { kind: 'signature'; provider: 'stripe' | 'razorpay' }
  | { kind: 'cron' }
  | { kind: 'secret'; env: 'REVALIDATE_SECRET' }
  | { kind: 'any'; options: RouteAuth[] };

// src/lib/security/with-route.ts
export function withRoute<T>(opts: {
  auth: RouteAuth;                      // required — there is no default
  rateLimit?: RateLimitSpec;
  sameOrigin?: boolean;                 // default: derived from auth.kind — see below
  handler: (req: NextRequest, ctx: { actor: Actor; params: Record<string, string> }) => Promise<Response>;
}): (req: NextRequest, ctx: unknown) => Promise<Response>;
```

`auth` has no default value and no `undefined` branch — a route handler that does
not decide does not compile.

**`{ kind: 'any', options }` is the one combinator, and it exists because exactly
two routes genuinely accept two different callers.** It is satisfied when any
option is satisfied, options are evaluated in array order, and when every option
fails the response is the **last** option's error — so an unauthenticated browser
hitting a cron-or-staff route gets the staff `401`, not a baffling cron `403`.
The union stays exhaustive: `any` is a member of it, not an escape from it, and
`options` may not nest another `any` (`chk` enforced by
`tests/unit/route-manifest.test.ts`, which also asserts every route file has
exactly **one** manifest row).

| Route | `auth` |
| --- | --- |
| `GET /api/health` | `{ kind: 'any', options: [{ kind: 'cron' }, { kind: 'staff', permission: 'integration.manage' }, { kind: 'public' }] }` — `public` ordered **last** so the two credentialled options are tried first and the handler can tell them apart by satisfied-option index; `?verbose=1` returns the detailed body only for index 0 or 1 (`08` §2.2) |
| `GET /api/checkout/status/[orderId]` | `{ kind: 'any', options: [{ kind: 'cart' }, { kind: 'customer' }] }` |

> **DECISION CHANGED:** an earlier revision declared `RouteAuth` as seven mutually
> exclusive members with no combinator, while `08` §2.2 printed two routes as
> "cron **or** staff" and "customer **or** cart token" — a shape the type could
> not express, which `08` worked around by giving one route file two manifest
> rows. Both the second row and the workaround are withdrawn.

**`sameOrigin` defaults from `auth.kind`, not from the HTTP method.** The check is
a CSRF control, and CSRF is a property of *ambient credentials*: it applies to the
three kinds the browser authenticates with a cookie — `cart`, `customer`,
`staff` — on any non-`GET` request, and to nothing else. Defaulting it to "every
non-`GET`, non-`signature` route" instead would put an `Origin` check in front of
`cron` and `secret` routes, which are server-to-server `POST`s from Vercel Cron and
from the CMS purge hook and carry **no `Origin` and no `Referer` at all** — so the
first nightly reservation release after launch would 403, and the failure would
look like a cron outage rather than a header bug. Those two kinds authenticate with
a bearer secret, which a cross-site page cannot obtain, so the check adds nothing
to them and breaks them. The derivation lives in `withRoute` itself:
`sameOrigin ?? ['cart','customer','staff'].includes(opts.auth.kind)`, and
`tests/unit/routes-authorized.test.ts` asserts that no route sets it to `false`
explicitly except the two provider webhooks and `/api/security/csp-report`
(§5.8) — three files, named in the test. The values are exactly the ones `08` §2.2 already
prints in its Auth column, so the manifest is a machine-readable copy of that
table and §3.6 keeps the two in sync.

```ts
// src/app/api/media/sign/route.ts
export const dynamic = 'force-dynamic';
export const POST = withRoute({
  auth: { kind: 'staff', permission: 'media.create' },
  rateLimit: { key: (a) => `media-sign:user:${(a as StaffActor).userId}`, limit: 60, windowSeconds: 3600 },
  handler: async (req, { actor }) => Response.json(await createUploadSignature(actor, await req.json())),
});
```

### 3.5 Service functions — defence in depth, and the reason for it

**Every mutating service function receives the actor in its first parameter and
calls `requirePermission()` as its first statement.** "In its first parameter"
rather than "as its first parameter", because `05` §9.4 — the owning document for
refunds — already fixed `refundPayment` as a single input object with `actor` as a
field, and one naming convention is not worth contradicting a verified document
over. Both shapes are accepted by the AST test and nothing else is: a positional
`actor: Actor` first, or a single object parameter with a required `actor: Actor`
property. This duplicates the wrapper's check on every
request that arrives through an action, and that is intentional: the wrapper
protects the HTTP boundary, while the service-level check protects the *other*
callers — a cron job, a queued `jobs` worker, a CSV import applying 3,000 rows, a
future internal tool. `01` §2.3 already lists `authorize` as step 2 of the
mandatory six; this is its signature:

```ts
// src/lib/payments/refund.ts — signature fixed by 05 §9.4, reproduced verbatim
export async function refundPayment(input: {
  paymentId: string; amountMinor: bigint; reason: string;
  returnId?: string; restock: boolean; actor: Actor;
}): Promise<Result<Refund, RefundError>> {
  requirePermission(input.actor, 'order.refund');
  await requireRecentTotp(input.actor, 15);        // §1.9 step-up, above the threshold
  // … FOR UPDATE on payments, the pending+succeeded sum assertion, provider call,
  //   transaction 2, audit (05 §9.4 owns every step after this line)
}

// src/lib/orders/update.ts — the ordinary shape, which everything else uses
export async function updateOrderNote(
  actor: Actor,
  input: { orderId: string; note: string; expectedVersion: number },
): Promise<Result<Order, StaleWriteError>> {
  requirePermission(actor, 'order.update');
  // … parse, version check, transaction, audit, revalidate (01 §2.3)
}
```

`tests/unit/services-authorized.test.ts` AST-parses every exported function in
`src/lib/*/**` whose name matches
`/^(create|update|delete|archive|publish|approve|reject|refund|adjust|transfer|assign|reset|invite|anonymize|import|apply|restore)/`
and fails on any that does not receive `actor` in its first parameter (positionally
or as a required property of a single object parameter) and call
`requirePermission` on it (or is explicitly listed in an allowlist file with a
one-line reason, reviewed as part of the diff).

### 3.6 How the UI derives what to show — from the same source, and only from it

The admin layout resolves the actor once and hands the permission set down:

```tsx
// src/app/(admin)/layout.tsx
export const dynamic = 'force-dynamic';
export default async function AdminLayout({ children }) {
  const actor = await requireStaffSession();              // throws -> redirect('/admin/login')
  return (
    <PermissionProvider permissions={[...actor.permissions]}>
      <AdminNav items={navFor(actor.permissions)} />
      {children}
    </PermissionProvider>
  );
}
```

```tsx
// src/components/admin/can.tsx
export function Can({ permission, children, fallback = null }: {
  permission: PermissionKey; children: ReactNode; fallback?: ReactNode;
}): ReactNode;
export function usePermission(permission: PermissionKey): boolean;
```

- `navFor()` reads `src/lib/rbac/nav.ts`, which pairs every admin route with the
  same `permission` string the route's page passes to `requirePermission()`. One
  constant, two consumers. A nav item cannot point at a page the viewer will be
  403'd from, and a page cannot be reachable from a nav item that names a
  different permission, because there is only one name.
- `<Can>` is **presentation**. It removes a button. It does not remove the server
  action the button called, and it never guards data — a component that receives a
  price it should not see has already leaked it, so the filtering happens in the
  service query, not in the render.
- `PermissionProvider` receives a plain `string[]`, never the actor: staff email,
  session id and IP have no business crossing the RSC boundary into a client
  bundle.

### 3.7 How an unguarded action fails CI instead of shipping

Five tests, each closing a different way to forget.

| Test | What it parses | What fails it |
| --- | --- | --- |
| `tests/unit/actions-authorized.test.ts` | Every file in `src/server/actions/admin/**` via `typescript`'s AST | Any exported binding not initialised by `adminAction(…)`; any first argument that is not a string literal present in `PERMISSION_KEYS`; any file importing `action` instead |
| `tests/unit/services-authorized.test.ts` | Every mutator in `src/lib/*/**` (§3.5) | An `actor` that is neither the first positional parameter nor a required property of the single object parameter, or a missing `requirePermission`, unless allowlisted with a reason |
| `tests/unit/routes-authorized.test.ts` | Every `route.ts` under `src/app/api/**` plus `src/lib/security/route-manifest.ts` | A route file not wrapped in `withRoute`; a route in the tree with no manifest row; a manifest row with no route; a manifest row whose `auth` disagrees with the table in `08` §2.2 |
| `tests/unit/rbac-catalogue.test.ts` | `catalogue.ts`, `matrix.ts`, the seeded `permissions` table, and every `PermissionKey` string literal appearing anywhere in `src/` | A permission referenced in code but absent from the catalogue; a catalogue key absent from the database; a key granted to no role at all (almost always a typo); `matrix.owner` shorter than the catalogue |
| `tests/integration/rbac-matrix.test.ts` | The running system | For each of the seven roles: sign in as a user holding only that role, invoke **every** exported admin action with a minimal valid payload against a seeded fixture, and assert the set of actions that did *not* return `FORBIDDEN` equals the matrix row exactly. A new action with no matrix entry is in neither set and fails on the count |

The last one is the one that matters. The first four prove a check exists; the
fifth proves the check is the *right* one, and it is data-driven from
`matrix.ts`, so it cannot drift from the table printed in §2.5. It runs against a
real Postgres in the `integration` job of `01` §5.3.

---

## 4. Customer data authorization — closing IDOR

### 4.1 The rule

> **Ownership is a `WHERE` clause, never an `if` after the read.**

A handler that does `const order = await getOrder(id); if (order.customerId !==
actor.customerId) throw …` has already read the row, has already spent the query,
and is one early-return or one refactor away from leaking it. Every
customer-scoped read and write in this codebase carries the owner in the
predicate, so a mismatched id is a `NotFoundError` — not a `ForbiddenError` —
because "403" tells the attacker the id was real (§5.7).

```ts
// src/lib/customers/scope.ts
export function customerScope(actor: Actor): { customerId: string };   // throws for non-customers
export function cartScope(actor: Actor): { customerId: string } | { cartTokenHash: string };
```

### 4.2 Every customer-scoped surface and its ownership proof

| Surface | Route / action | Requester proves ownership by | Query predicate |
| --- | --- | --- | --- |
| Order history list | `/account/orders` | customer session | `WHERE customer_id = $1` on `idx_orders_customer` |
| Order detail (signed in) | `/account/orders/[id]` | customer session | `WHERE id = $1 AND customer_id = $2` |
| Order detail (guest) | `/orders/[token]` | possession of the token | `WHERE public_token_hash = sha256($1)` — **the id is never in the URL** (`02` §2.7) |
| Order status poll | `/api/checkout/status/[orderId]` | customer session **or** the `md_cart` token that created the order | `WHERE o.id = $1 AND (o.customer_id = $2 OR EXISTS (SELECT 1 FROM carts c WHERE c.converted_order_id = o.id AND c.token_hash = sha256($3)))` — the link is `carts.converted_order_id`, which `02` §2.7 already writes at conversion; no column is added to `orders`. "An order id is an identifier, not a capability" (`01` §2.5) |
| Checkout session advance | `advanceCheckout(sessionId, …)`, `placeOrder(sessionId, …)` (`05` §3.2) | the `md_cart` token, **or** the customer session | `WHERE cs.id = $1 AND cs.cart_id = $2` where `$2` is the cart resolved from the cookie — **never `WHERE cs.id = $1` alone**. `checkout_sessions` holds the shipping address, the email, the quoted shipping and tax and the gift cards applied; `uq_checkout_sessions_cart` means the session is derivable from the cart, so the id in the payload is a concurrency handle, not a lookup key. Without the second predicate, possession of a UUIDv7 rewrites a stranger's delivery address mid-checkout |
| Invoice / packing slip PDF | `/account/orders/[id]/invoice` | same as order detail | same predicate, then rendered from `order_items` snapshots only |
| Address list | `/account/addresses` | customer session | `WHERE customer_id = $1 AND NOT is_archived` |
| Address update / delete | `updateAddress`, `archiveAddress` | customer session | `UPDATE addresses SET … WHERE id = $1 AND customer_id = $2 AND version = $3 RETURNING id` — zero rows is `NotFoundError`, covering both "wrong owner" and "stale write" with one round trip |
| Address selected at checkout | `checkout` action | customer session | `05` §640 already requires `addressId` to belong to the signed-in customer; the check is the same `WHERE … AND customer_id = $2` |
| Wishlist | `/account/wishlist` | customer session | `WHERE customer_id = $1` |
| Wishlist item add/remove | `wishlist` actions | customer session | `DELETE FROM wishlist_items WHERE id = $1 AND wishlist_id IN (SELECT id FROM wishlists WHERE customer_id = $2)` |
| Shared wishlist | `/wishlist/shared/[token]` | possession of the token | `WHERE share_token_hash = sha256($1) AND is_public` — both conditions; revoking sharing must actually revoke it. §4.3 specifies the two actions that set and clear those columns |
| Cart read / mutate | `/api/cart`, cart actions | `md_cart` token, **or** customer session | `WHERE token_hash = sha256($1)` or `WHERE customer_id = $2 AND status='active'`. A cart id in a request body is never a lookup key |
| Account profile | `/account` | customer session | `WHERE id = $1` |
| Return request | `/account/orders/[id]/return` | customer session + order ownership | `returns.order_id` constrained to an order matching the ownership predicate |
| Data export | `requestDataExport` | customer session, **not impersonated** | `WHERE id = $1`; delivered by email to the verified address, never as an inline download |
| Data export download | `/account/export/[selector]` | possession of the emailed link | `WHERE id = $1 AND purpose = 'data_export' AND consumed_at IS NULL AND expires_at > now()` — by primary key from the link's selector — then `argon2.verify(row.code_hash, token)` in constant time, consumed in the same transaction that streams the file (§1.5 rules 2 and 5). No session is required and none is consulted: the token *is* the authorisation, which is why it is single-use and 24 hours |
| Newsletter unsubscribe | `/unsubscribe/[token]` | `jose` token carrying the subscriber id | token signature; no session needed, because requiring one to unsubscribe is how you get spam complaints |

**Three structural consequences of the table:**

1. **No customer-scoped identifier is ever accepted from a request body as a
   lookup key.** `cartId`, `customerId`, `orderId`, `addressId`, `wishlistId` in a
   body are either rejected by `.strict()` (`05` §640 lists `customerId` and
   `orderId` among the always-refused fields) or used only *inside* a predicate
   that also carries the owner. `checkout_sessions.id` is the one id the client
   legitimately sends on every checkout request, and it is in the second category,
   not the first: it is an optimistic-lock handle, and the row is still located by
   the cart the cookie resolves to.
2. **A miss is a 404.** `NotFoundError` → `notFound()` (`08` §1.4). `ForbiddenError`
   is for *staff* who lack a permission, where the actor is already authenticated
   and known and leaking "this exists" costs nothing.
3. **Every customer-scoped route is `no-store`** (`01` §2.4, asserted by
   `tests/e2e/cache-headers.spec.ts`). The IDOR that is hardest to find is the one
   where the authorization was perfect and the CDN served the previous customer's
   copy.

`tests/e2e/idor.spec.ts` runs the whole table: two seeded customers A and B, and
for every row, B attempts A's resource by id and by token and must receive a 404
or an empty set, with the response body asserted to contain none of A's data.

### 4.3 Wishlist sharing: granting, revoking, and what a revoked link does

`08` §1.3 defines `getWishlistByShareToken` and a distinct `PublicWishlistView`
type, and §4.2 above requires both `share_token_hash` and `is_public`. Nothing
specified where the customer turns sharing on or off, or what happens to the
token when they do — which matters, because the token is `NULL`-able and a
revocation that leaves it in place is a revocation that a second click undoes.
Two server actions, in `src/server/actions/wishlist.ts`:

```ts
// Both require a customer session (not impersonated) and scope by customer_id.
export async function shareWishlist(
  wishlistId: string,
): Promise<Result<{ shareUrl: string }, NotFoundError | RateLimitedError>>;

export async function unshareWishlist(
  wishlistId: string,
): Promise<Result<void, NotFoundError>>;
```

**`shareWishlist` mints a new token every time it is called.** The token is 32
bytes of `crypto.randomBytes`, base64url — the same shape as `/orders/[token]`'s
`public_token_hash` (§1.5 rule 3) — returned to the caller **once**, in the URL,
and stored only as `share_token_hash = sha256(token)`:

```sql
UPDATE wishlists
   SET share_token_hash = $2, is_public = true, shared_at = now(), version = version + 1
 WHERE id = $1 AND customer_id = $3
RETURNING id;
```

Calling it on an already-shared wishlist is a **rotation**, not a no-op: the
previous link stops resolving at once. That is the behaviour the surface has to
have, because "share" is the only control a customer has when a link has escaped
— and a share button that silently returns the same URL gives them no way to
invalidate it.

**`unshareWishlist` clears both columns, and clearing both is the point.**

```sql
UPDATE wishlists
   SET share_token_hash = NULL, is_public = false, shared_at = NULL, version = version + 1
 WHERE id = $1 AND customer_id = $2
RETURNING id;
```

Setting `is_public = false` alone would leave the hash sitting in the row, so the
next `shareWishlist` could hand back a link a stranger already holds. Nulling the
hash alone would leave `is_public = true` over a `NULL` hash, and
`sha256($1) = NULL` is never true, so the page would 404 — correctly, but for a
reason nothing states. Both columns move together and
`chk_wishlists_share_pair CHECK ((share_token_hash IS NULL) = (is_public = false))`
makes the half-state unwritable.

> **SCHEMA ADDITION (`02` §2.7, `wishlists`):** `shared_at TIMESTAMPTZ NULL` and
> `CONSTRAINT chk_wishlists_share_pair CHECK ((share_token_hash IS NULL) = (NOT is_public))`.
> `shared_at` is what `/account/wishlist` renders beside the link ("Shared since
> 12 March") so the customer can see that a link exists at all, which is the
> precondition for ever revoking one.

**What a revoked or rotated link does.** `/wishlist/shared/[token]` renders the
same `notFound()` for a revoked token, a rotated-away token, a malformed token
and a token that never existed — `PreviewTokenError`-style disclosure is not
available here and would be an enumeration oracle over a public surface. The
route is `force-dynamic` and `Cache-Control: private, no-store`: a revoked
wishlist that is still being served from an ISR object is not revoked, and this
is the one public page whose content is a named person's choices.
`getWishlistByShareToken` returns `PublicWishlistView` — wishlist name, and per
item the product title, slug, image, availability band and the resolved price for
the **route's** market — and never the owner's name, email, `customer_id`, or the
wishlist's internal id. Rate limited `preview-token`-style on
`order-token:ip:<ip64>`'s pattern; the canonical key is
**`wishlist-share:ip:<ip64>`, 60 per hour, fail-closed** (`11` §4.2).

> **DECISION CHANGED — was CHANGE REQUIRED IN 11 §4.2:** this section previously
> specified `share-wishlist:ip:<ip64>` at 30 per minute. `15` §6 independently
> specified `wishlist-share:ip:<ip64>` at 60 per hour for the same route, and the
> registry adopted neither. The canonical key is now
> `wishlist-share:ip:<ip64>` at **60 per hour, fail-closed** — the registry's
> `<verb>-<noun>:<scope>:<value>` naming, matching `shipping-quote:cart:<cartId>`,
> and the stricter of the two ceilings. It fails closed for the same reason
> `order-token:ip` does: it is a token-guessing surface over a named person's
> choices, and the handler needs the database anyway. `11` §4.2 § row and `08`
> §1303 both already carry this key.

> **RESOLVED — was CHANGE REQUIRED IN 08 §2.2 and §4.x:** `/wishlist/shared/[token]` needs a
> *Verified applied in 08.*
> manifest row (`public`, `no-store`, `force-dynamic`) and a route-map entry;
> `08` §1.3 already exports `getWishlistByShareToken` but the page it serves is in
> no route table. **CHANGE REQUIRED IN 10 §3.2:** the public shared-wishlist
> screen has no component specified — it is a grid of `ProductCard`s under the
> wishlist name with no add-to-bag on the owner's behalf, plus the "make your own"
> call to action, and it is the one storefront page that must render correctly
> with zero items.

`tests/e2e/idor.spec.ts` gains three rows: fetch a shared wishlist after
`unshareWishlist` (404); fetch it with the **previous** token after a second
`shareWishlist` (404); and assert the rendered HTML of a live shared wishlist
contains none of the owner's identifying fields.

---

## 5. Security architecture

### 5.1 Input validation at the boundary — one schema library, one place

**Zod 4, everywhere, `.strict()` everywhere** (`01` §1.1). Rules:

- **One schema per boundary, owned by the domain**: `src/lib/<domain>/schema.ts`.
  A server action imports the domain schema; it does not declare its own. Two
  schemas for one payload is how the stricter one stops being the one that runs.
- **`.strict()` is mandatory on every object schema**, enforced by
  `tests/unit/schemas-strict.test.ts`, which walks every exported Zod object in
  `src/lib/*/schema.ts` and asserts `_def.unknownKeys === 'strict'`. `05` §640
  already relies on this: the checkout schema's rejection of `price`,
  `total_minor`, `marketCode`, `customerId` and twenty other field names is
  `.strict()` plus an explicit denylist, and an unknown key is a `400` plus a
  `security.rejected_field` log line — not a silently dropped key.
- **Money never crosses a boundary as a number.** Amount inputs are the `Money`
  string shape from `01` §2.6, validated `z.string().regex(/^\d{1,15}$/)`. `08`
  §95 already fails CI on arithmetic applied to an identifier ending `Minor`
  inside an action.
- **Every `list*` schema caps `limit` at 100 and takes a `cursor`** (`01` §2.3
  step 1). There is no unbounded read, so there is no "export the customer table
  through the search endpoint" path.
- **Sizes are capped at the edge, not at the parser**: `next.config.ts` sets
  `experimental.serverActions.bodySizeLimit: '2mb'`; the CSV upload route is the
  one exception at `MEDIA_MAX_UPLOAD_MB`, streamed, never buffered whole.
- **Env is validated too.** `src/lib/config/env.ts` is the only file allowed to
  read `process.env` (`01` §2.2) and it parses with Zod at module load, so a
  missing `PASSWORD_PEPPER` is a boot failure, not a runtime `undefined` silently
  hashing every password with no pepper.

### 5.2 Output escaping and XSS

| Surface | Mechanism | Why it cannot be bypassed |
| --- | --- | --- |
| Every React render | JSX auto-escaping | `react/no-danger` is an **error** (`01` §1.5) with exactly one documented exception |
| The one exception | JSON-LD `<script type="application/ld+json">` | Emitted only by `src/lib/seo/`, from an object serialised with a `<`→`<` replacer, under the per-request CSP nonce |
| Admin-authored rich text | Tiptap **JSON**, rendered by the allowlist node→React renderer in `src/lib/cms/richtext.tsx` | The renderer emits React elements and **never produces an HTML string**; `@tiptap/html` is not a dependency precisely because `generateHTML()` exists only to make one (`01` §1.1) |
| Transactional email | React Email renders the same component tree | Token substitution into body text is a **React text node**, not string concatenation (`06` §1888) |
| Email subject / preheader | Plain text, `\r` and `\n` stripped before use | An unescaped newline in a token value is SMTP header injection — `\nBcc:` adds recipients (`06` §1889) |
| Uploaded SVG | Four independent layers, `06` §1490: `media.upload_vector` permission, server-side DOMPurify sanitisation, never inlined (only `<img src>` / `background-image`), Cloudinary `fl_sanitize` plus `Content-Security-Policy: sandbox; default-src 'none'` on the media path | Layer 3 alone suffices against current browsers; the other three exist because "we will never inline this" is a promise about code that has not been written yet |
| Product/CMS text in `<title>`, `meta`, `alt` | React escaping via the Next `Metadata` API | Never assembled as a string |
| CSV export opened in Excel | Formula-injection guard: any cell whose first character is `=`, `+`, `-`, `@`, `\t` or `\r` is prefixed with `'` by `src/lib/importexport/csv.ts` | A product title of `=HYPERLINK("http://evil","Click")` is otherwise a live formula in the merchant's spreadsheet — the one XSS-shaped bug that happens *outside* the browser |
| URLs from user or CMS input | `safeUrl()` in `src/lib/cms/url.ts` allows `http:`, `https:`, `mailto:`, `tel:` and same-origin paths only | Blocks `javascript:` and `data:` in a nav item `href` or a block link |

**`dangerouslySetInnerHTML` on a user- or admin-authored string is banned by
`01` §1.5 and there is no escape hatch request procedure.** If a future feature
needs markup, it needs a block type in the page-builder registry, not an HTML
field.

### 5.3 SQL injection posture

Three query paths exist and each one is safe by construction:

1. **Prisma client calls** — parameterised by the driver. The overwhelming
   majority.
2. **`$queryRaw` tagged templates** — parameterised. `` prisma.$queryRaw`SELECT …
   WHERE id = ${id}` `` binds; it does not interpolate.
3. **`Prisma.sql` fragments in `src/lib/db/raw/`** — the admin list queries with
   dynamic facets (`01` §1.2). This is the only place a query is *assembled*, and
   the assembly is from a fixed vocabulary: column names come from a whitelist
   constant, not from the request. `02` §2.9 already states the rule for
   `saved_views.sort`: "the allowed sort fields per resource are a whitelist in
   `src/lib/db/raw/`, because a saved view is a user-supplied `ORDER BY`".
   **The contents of that whitelist are `11-registries.md` §8** — nine resources,
   each field with its operators and the `02` §4 index that serves it — and
   `tests/api/sorting.test.ts` `EXPLAIN`s the generated SQL to prove the named
   index is the one used. An unknown field is a `400`, never a silent fallback.

**Lint:** `no-restricted-syntax` makes `$queryRawUnsafe` and `$executeRawUnsafe`
errors everywhere, with no allowlist. If a case ever genuinely needs them, it
needs an ADR first.

**Database roles.** The application connects as `md_app`, which has
`SELECT, INSERT, UPDATE, DELETE` on the application tables and **no** DDL. Prisma
Migrate connects via `DIRECT_URL` as `md_migrator`, which owns the schema. A SQL
injection that somehow survived the above still cannot `DROP TABLE`, and cannot
`UPDATE` or `DELETE` from `audit_logs` (§7.4).

### 5.4 CSRF posture

**Decision: no CSRF token. Four overlapping controls instead, each of which is
independently sufficient against the classic attack, and none of which can be
forgotten on a new endpoint.**

1. **No mutation is reachable by `GET`** (`01` §1.3, `08` §2.1). The classic
   `<img src="…/delete?id=1">` has no target.
2. **`SameSite` on both session cookies.** `Strict` for `md_admin` means a
   cross-site request to `/admin/**` arrives with no session at all and is a 401.
   `Lax` for `md_session` means a cross-site **POST** — which is what a server
   action is — arrives with no cookie either; `Lax` only relaxes for top-level
   `GET` navigation, and (1) makes that harmless.
3. **Next's server-action origin check**, pinned by
   `next.config.ts#experimental.serverActions.allowedOrigins:
   [new URL(NEXT_PUBLIC_APP_URL).host]` (`01` §2.1). A cross-origin POST cannot
   reach an action at all.
4. **`assertSameOrigin(req)` on every cookie-authenticated, non-`GET` route
   handler** — that is, every route whose `auth.kind` is `cart`, `customer` or
   `staff`, which is exactly how `withRoute` derives the default (§3.4):
   `Origin` (falling back to `Referer`) must parse and must equal
   `NEXT_PUBLIC_APP_URL`'s origin, and a request with **neither header** is
   rejected rather than allowed — a missing `Origin` on a cookie-authenticated
   `POST` is not a browser we recognise. `signature`, `cron` and `secret` routes are
   outside this control by construction: they are cross-origin or non-browser by
   definition and authenticate with an HMAC or a bearer secret instead (§6.5).

**Why a token would add nothing here.** A synchroniser token defends a
cookie-authenticated endpoint that a cross-site page can reach. Control 3 means a
cross-site page cannot reach a server action, and control 2 means it would arrive
unauthenticated if it did. The token's residual value is against a same-site
subdomain attacker — and the `__Host-` cookie prefix (§1.3) is the control for
that, at zero request cost. What a token *would* reliably add is a class of bug
where a legitimate form silently stops working after a session rotation.

**Additionally: no CORS.** No route in this application ever sets
`Access-Control-Allow-Origin`. There is no browser client on another origin. A
`fetch` from another site therefore cannot read any response, which makes every
JSON route unreadable cross-origin regardless of what its authorization does.
`tests/unit/routes-authorized.test.ts` asserts that the string
`Access-Control-Allow-Origin` appears nowhere under `src/app/api/`.

### 5.5 Rate limiting

**Storage: the `rate_limits` table** (`02` §2.9), fixed window, incremented in one
atomic round trip:

```sql
INSERT INTO rate_limits (id, key, window_start, count, expires_at)
VALUES ($1, $2, $3, 1, $4)
ON CONFLICT (key, window_start)
DO UPDATE SET count = rate_limits.count + 1
RETURNING count;
```

No lock, no read-then-write race, one query (`02` §2.9 verbatim). `01` §1.1
rejects Redis as an operational dependency we do not need at this volume, and
`RATE_LIMIT_BACKEND=upstash` is a drop-in behind the same interface if that ever
changes (`01` §4.8). Cleanup is `idx_rate_limits_expiry` plus the nightly cron.

```ts
// src/lib/ratelimit/index.ts
export async function consume(spec: {
  key: string; limit: number; windowSeconds: number; failOpen: boolean;
}): Promise<Result<{ remaining: number }, RateLimitedError>>;
```

**`consume()` never joins the caller's transaction.** It takes its own connection
from the pool and commits before it returns. This is not a preference: the
endpoints that matter most here are the ones whose handler throws on the failure
path, and a counter incremented inside a transaction that then rolls back is a
counter that only ever counts *successes* — the login limiter would read zero after
ten thousand wrong passwords (§1.6). `no-restricted-syntax` forbids `consume` from
appearing inside a `$transaction` callback, and the `prisma dev` 10-connection cap
(00-CONTEXT §3) is the reason it is one short-lived checkout rather than a
dedicated pool.

**Identifiers are hashed into the key, never written into it in the clear.**
`02` §2.9 illustrates the column with `otp:email:a@b.com`, and taken literally that
makes `rate_limits` a plaintext register of every address that has ever attempted a
login or requested a code — a table with no access control of its own, pruned only
by an expiry cron, sitting next to the one in §7.2 that deliberately refuses to
record a customer's attempted email in `audit_logs` because "an email typed into a
public form is somebody's personal data". The same value cannot be too sensitive
for the audit log and fine in the rate-limit key. So `rateLimitKey('login:email',
email)` returns `login:email:` + the first 16 bytes, hex, of
`HMAC-SHA256(PASSWORD_PEPPER, lower(trim(email)))`. Nothing about the schema
changes — the column is `TEXT` and the uniqueness is unaffected — and the keyed
hash (rather than a bare SHA-256) is what stops a dump of `rate_limits` being
tested against an address list offline. IP keys stay readable: an IP is an
operational value that has to be greppable during an incident, and the /64 is
already coarse.

**Key extraction is where this is usually got wrong**, so it is one function:

```ts
// src/lib/security/ip.ts
export function clientIp(h: Headers): string | null;
export function rateLimitIpKey(h: Headers): string;   // IPv4: full address. IPv6: the /64 prefix
```

- Reads `x-vercel-forwarded-for`, then `x-real-ip`, then the **last** entry of
  `x-forwarded-for`. Taking the *first* entry — which is what every tutorial does
  — takes the value the client sent, so every attacker picks their own rate-limit
  bucket.
- **IPv6 is keyed on the /64 prefix.** A single residential IPv6 allocation is a
  /64 or larger; keying on the full 128-bit address gives one attacker 2^64
  distinct buckets and no rate limit at all.

**Limits.** `11-registries.md` §4.2 is the whole inventory — **42 keys** — and is
the source of truth: a `RateLimitSpec` whose key prefix is not listed there fails
`tests/unit/ratelimit-keys.test.ts`, and so does one whose `limit`,
`windowSeconds` or `failOpen` disagrees with it.

> **DECISION CHANGED — this section's table was 33 rows and claimed to be the
> whole inventory; it was not.** `08` §2.3 required five keys that were absent
> here — `analytics:ip`, `search-click:ip`, `checkout-status:ip`,
> `redirects-snapshot:ip`, `revalidate:ip` — and `06` required two more,
> `preview-token:ip` and `cms-heartbeat:session`, while both documents claimed
> their lists were the same rows. Under the old completeness claim, adding them
> failed CI; under `08`'s, omitting `checkout-status:ip` reopened the order-id
> probing oracle `08` §2.2 added it to close. The table below is the merged 42 and
> the completeness claim now points at `11` §4.2 rather than at itself.

Two mechanical rules apply to every row and are not repeated per row: every
`<email>` is the keyed hash above, and every IPv6 key is the /64 prefix.

| Key prefix | Endpoint / caller | Limit | Window | Fail | Source |
| --- | --- | ---: | --- | :-: | --- |
| `typeahead:ip:<ip64>` | `GET /api/catalog/typeahead` | 30 | 1 min | open | `08` |
| `search:ip:<ip64>` | `GET /api/search`, `/search` render | 60 | 1 min | open | `08` |
| `catalog:ip:<ip64>` | `/api/catalog/products`, `/facets`, `/availability` | 120 | 1 min | open | `08` |
| `redirects-snapshot:ip:<ip64>` | `GET /api/catalog/redirects` | 20 | 1 min | open | **added — `08` §2.3** |
| `redirect-hit:ip:<ip64>` | `POST /api/catalog/redirect-hit` | 60 | 1 min | open | `08` |
| `search-click:session:<sid>` | `POST /api/search/click` | 60 | 1 min | open | `08` |
| `search-click:ip:<ip64>` | `POST /api/search/click` | 300 | 1 min | open | **added — `08` §2.3** |
| `analytics:session:<sid>` | `POST /api/analytics/[market]/collect` | 120 | 1 min | open | `08` |
| `analytics:ip:<ip64>` | `POST /api/analytics/[market]/collect` | 600 | 1 min | open | **added — `08` §2.3** |
| `cart:token:<hash>` | `GET /api/cart` and every cart server action | 60 | 1 min | open | `08` |
| `shipping-quote:cart:<cartId>` | `POST /api/checkout/shipping-quote` | 30 | 1 min | open | `08` |
| `checkout:ip:<ip64>` | `placeOrderAction` | 10 | 10 min | **closed** | `08` |
| `checkout-status:ip:<ip64>` | `GET /api/checkout/status/[orderId]` | 120 | 1 min | **closed** | **added — `08` §2.2, the order-id oracle** |
| `coupon:cart:<cartId>` | `applyCouponToCart` | 10 | 10 min | **closed** | §6.6 |
| `coupon:ip:<ip64>` | `applyCouponToCart` | 60 | 1 hour | **closed** | **added — the pairing rule below** |
| `giftcard:cart:<cartId>` | `applyGiftCard` | 5 | 10 min | **closed** | `05` §8.7 |
| `giftcard:ip:<ip64>` | `applyGiftCard` | 20 | 24 hours | **closed** | `05` §8.7 — **was 5 / hour here** |
| `order-token:ip:<ip64>` | `/orders/[token]` | 20 | 1 hour | **closed** | §4.2 |
| `login:email:<email>` | `customerLogin` | 10 | 15 min | **closed** | `08` |
| `login:email:<email>:day` | `customerLogin` | 50 | 24 hours | **closed** | §5.5 |
| `login:ip:<ip64>` | `customerLogin` | 30 | 15 min | **closed** | §5.5 |
| `admin-login:email:<email>` | `staffLogin` | 5 | 15 min | **closed** | §1.6 |
| `admin-login:ip:<ip64>` | `staffLogin` | 20 | 15 min | **closed** | §1.6 |
| `totp:user:<userId>` | `/admin/login/2fa`, `requireRecentTotp` | 5 | 5 min | **closed** | §1.9 |
| `totp-jti:<jti>` | `md_totp` replay burn | 1 | token `iat`→`exp`+1 h | **closed** | §1.5 rule 6 |
| `otp:email:<email>` | `requestOtp` (email or E.164, hashed) | 5 | 15 min | **closed** | `08` |
| `otp:ip:<ip64>` | `requestOtp` | 20 | 1 hour | **closed** | `08` |
| `reset:email:<email>` | `requestPasswordReset` | 3 | 1 hour | **closed** | §1.7 |
| `reset:ip:<ip64>` | `requestPasswordReset` | 10 | 1 hour | **closed** | §1.7 |
| `register:ip:<ip64>` | `customerRegister` | 5 | 1 hour | **closed** | §1.7 |
| `verify-email:customer:<id>` | Verification re-send | 5 | 1 hour | **closed** | §1.7 |
| `email-change:customer:<id>` | `requestEmailChange` | 3 | 24 hours | **closed** | §1.7 |
| `newsletter:ip:<ip64>` | `subscribeNewsletter` | 5 | 1 hour | **closed** | §5.7 |
| `account-export:customer:<id>` | `requestDataExport` | 1 | 24 hours | **closed** | §8.4 |
| `impersonate:user:<userId>` | `startImpersonation` | 5 | 24 hours | **closed** | §1.11 |
| `media-sign:user:<userId>` | `POST /api/media/sign`, `POST /api/media/svg` | 60 | 1 hour | **closed** | §5.9 |
| `export:user:<userId>` | `exportRun()` | 5 | 1 hour | **closed** | §8.4 |
| `revalidate:ip:<ip64>` | `POST /api/revalidate` | 30 | 1 min | **closed** | **added — `08` §2.3** |
| `webhook:ip:<ip>` | `/api/webhooks/stripe`, `/api/webhooks/razorpay` | 600 | 1 min | open | `05` §4.3 |
| `csp-report:ip:<ip64>` | `POST /api/security/csp-report` | 20 | 1 hour | open | §5.8 |
| `preview-token:ip:<ip64>` | `resolvePreviewToken()` on `/[market]/preview/[token]` | 60 | 1 hour | **closed** | **added — `06` §4.4** |
| `cms-heartbeat:session:<sid>` | `GET /api/admin/cms/pages/[id]/heartbeat` | 10 | 1 min | open | **added — `06` §6.4** |

**Every client-held key is paired with an IP key, and `consume()` is called twice
with the stricter verdict winning.** A session id, a cart id and a cart token
hash are all values the browser supplies, so a limiter keyed on one alone is
defeated by `crypto.randomUUID()` per request. The client-held key catches a
runaway loop in our own code and produces a readable `rate_limits.key`; the IP
key catches an adversary. That is why `coupon:ip` and `giftcard:ip` exist at all,
and why `08`'s five additions are kept rather than dropped to rescue this
section's old completeness claim.
`tests/unit/ratelimit-pairing.test.ts` fails on a `<sid>`, `<cartId>` or `<hash>`
key with no `…:ip:<ip64>` sibling.

**Fail-open vs fail-closed is per row and is not a coin flip.** If the rate-limit
write fails (the database is unreachable), an *open* failure serves a search
result and a *closed* failure blocks a sign-in. For catalogue reads, refusing to
serve because a counter could not be written is a self-inflicted outage. For
credential and money endpoints, the handler needs the database anyway — it cannot
verify a password without it — so failing closed costs nothing that was going to
work. `redirects-snapshot` is the one deliberate exception on the closed side:
the edge redirect map's whole design is fail-open (`01` §2.1), so a limiter that
could block a refresh would be worse than the flood it prevents.

**Two windows on every credential endpoint.** A fixed window lets an attacker
burst 2× the limit across the window seam. `login:email` therefore carries both a
15-minute and a 24-hour counter; the long window makes the seam trick worth ten
extra attempts a day rather than ten extra attempts every fifteen minutes.

**The response.** `RateLimitedError` → HTTP 429 with `Retry-After` (`08` §1.4). A
rate-limited login says the same thing a wrong password says (§5.7), plus the
`Retry-After` header — the *header* is machine-readable and honest, the *body*
does not confirm that the email was worth guessing.

### 5.6 Brute force and credential stuffing

| Defence | Staff | Customers |
| --- | --- | --- |
| Per-account lockout | **Yes** — `failed_login_count`, `locked_until = now() + 15 min` at 5 failures, cleared on success | **No** — see below |
| Per-email rate limit | 5 / 15 min | 10 / 15 min **and** 50 / 24 h |
| Per-IP rate limit | 20 / 15 min | 30 / 15 min |
| Second factor | Mandatory above the privilege line (§1.9) | n/a |
| argon2id cost | 19 MiB × 2 passes — ~60 ms per guess, which is the whole point | same |
| Credential-stuffing signal | Audited `login_failed` rows; Sentry alert on >50 distinct emails failing from one /64 in 10 minutes | same |

**Why customers get no lockout, and that is the safer choice.** Customer emails
are enumerable by definition — they are the addresses of real people, harvestable
anywhere. A per-account lockout on an enumerable identifier is a denial-of-service
weapon: five wrong guesses locks the customer out of their own account, and an
attacker can lock out every customer whose address they have for the cost of a
script. Staff emails are a known, small, internal set behind a page nobody links
to, so the same mechanism is a defence rather than a weapon. The asymmetry is the
threat model, not an inconsistency.

**Credential stuffing specifically** — reused passwords from someone else's
breach — is not stopped by rate limits alone, because the attacker has one guess
per account and does not need a second. The controls are: the common-password
check at registration and reset (§1.4); the per-IP and per-/64 limits, which bite
because stuffing runs at volume; and a Sentry alert on the distinctive signature
(many emails, one prefix, high failure ratio).

> **NEEDS INPUT:** whether the client wants a breached-password check at
> registration and password change (the k-anonymity HaveIBeenPwned range API sends
> only the first 5 characters of a SHA-1 and never the password). It is ~30 lines
> and one outbound host to add to `connect-src`. It is a client decision because
> it adds a third-party dependency to the signup path and a failure mode to
> decide: fail open (allow) or fail closed (block). Our recommendation is
> fail-open with a logged counter.

### 5.7 Enumeration resistance

The invariant: **no unauthenticated endpoint reveals whether an identifier
exists.** Per surface:

| Surface | Behaviour |
| --- | --- |
| Customer login | One message — "Email or password is incorrect" — for: no such account, wrong password, unverified email, rate-limited. Timing equalised by verifying against `DUMMY_ARGON2_HASH` when no row is found |
| Staff login | Same, plus: a locked account produces the identical message. Disclosing "locked" confirms the email and tells the attacker to stop wasting guesses |
| Password reset request | Always `202` with "If an account exists for that address, we've sent a link." Always the same response time — the token is minted and the email queued *after* the response for the hit case, so the response path is identical |
| Registration | Always "Check your email." An existing credentialled address receives the "someone tried to register" mail instead (§1.7) |
| Email OTP request | Always "We've sent a code", regardless |
| Newsletter signup | Always "Check your inbox to confirm." Never "you are already subscribed" — that is a membership oracle for any address |
| Guest checkout with a registered email | Proceeds normally. No "an account exists with this email, sign in" prompt, which would turn the checkout page into a free account-checker. `02` §2.7 already refuses to attach the order to the credentialled row, so nothing leaks and nothing is mis-attributed |
| Order lookup `/orders/[token]` | A token that matches nothing renders the same 404 as a malformed token. Rate limited `order-token:ip` |
| Cart token | "A cookie whose hash matches nothing yields an empty cart and a fresh token; it never 500s and never leaks whether a token ever existed" (`05` §2.1, verbatim) |
| Coupon code | An unknown code and an ineligible code both return `CouponInvalidError`. The error's `context` names the failing `coupon_conditions.id` for the *log*, never for the response (`08` §1.4: `context` is "logged, NEVER serialised to a client") |
| Gift card code | Never echoed back, HMAC-hashed before lookup (`05` §8.7), rate limited `giftcard:cart` 5 / 10 min **and** `giftcard:ip` 20 / 24 h (§5.5). A gift card code is a bearer instrument; guessing one is stealing money |
| Any customer-scoped id | 404, never 403 (§4.1) |

`tests/e2e/enumeration.spec.ts` asserts the *body* and the HTTP status of the hit
and miss cases are byte-identical for login, reset, registration and OTP request,
and that the p50 response times are within 25 ms of each other over 20 runs.

### 5.8 Secure headers and CSP

`01` §5.8 owns the header table and states the rule: headers are defined in
`next.config.ts#headers()` **only**, and `vercel.json` carries no `headers` key.
That table is the baseline for every route. This section adds what is specific to
authenticated surfaces.

**A stricter CSP for `/admin/**`.** The site-wide policy has to admit Stripe,
Razorpay and GTM because the checkout page needs them. The admin panel needs none
of those, and it is the surface where an XSS is worth the most:

```
default-src 'self';
script-src 'self' 'nonce-{n}';
style-src 'self' 'nonce-{n}';
style-src-attr 'unsafe-inline';
img-src 'self' https://res.cloudinary.com data: blob:;
connect-src 'self' https://api.cloudinary.com https://*.sentry.io;
font-src 'self';
frame-src 'none';
form-action 'self';
frame-ancestors 'none';
base-uri 'none';
object-src 'none';
```

- `blob:` in `img-src` is for local upload previews before the file reaches
  Cloudinary; it cannot execute.
- `style-src-attr 'unsafe-inline'` is the page-builder's per-breakpoint inline
  styles, already decided and recorded in `docs/decisions/0011-csp-style-attr.md`
  (`06` §3.5). It governs *attributes* only; `script-src` has no `'unsafe-inline'`
  anywhere on the site.
- `frame-src 'none'` on admin: nothing in the admin panel embeds a third party,
  and the payment iframes belong to checkout.

**A CSP with no reporting is a control nobody can tell has failed.** Both policies
carry `report-uri /api/security/csp-report` and the modern
`report-to md-csp` pair, and `POST /api/security/csp-report` is a route in the
manifest like any other — `auth: { kind: 'public' }`, `sameOrigin: false` (the
browser's report carries no `Origin`), body capped at 8 KB, rate limited
`csp-report:ip:<ip64>` 20/hour and **sampled at 10%** above the first report per
`(blocked-uri, effective-directive)` pair per hour, because an unbounded public
`POST` that writes is a free denial-of-service and the hundredth copy of a report
says nothing the first did not. Reports land in Sentry, not in a table. The value
is concrete and immediate: the first `script-src` violation from a storefront page
is the earliest signal that a payment-page script was tampered with, which is the
thing PCI DSS v4.0 §11.6.1 exists to detect.

**Headers added on authenticated responses**, set in the same `headers()` config
keyed by path prefix:

| Header | Where | Why |
| --- | --- | --- |
| `Cross-Origin-Opener-Policy: same-origin` | `/admin/**`, `/account/**`, `/checkout/**` | Severs the `window.opener` reference, so a popup cannot reach back into an authenticated page |
| `Cross-Origin-Resource-Policy: same-origin` | same | Stops another origin embedding our authenticated responses as a subresource |
| `Cache-Control: private, no-store, max-age=0, must-revalidate` | every row of `01` §2.4's never-cached list | Already specified there; restated because it is an authorization control, not a performance one |
| `X-Robots-Tag: noindex, nofollow` | `/admin/**` and every non-production environment | `01` §5.8 |
| `Clear-Site-Data: "cache", "cookies", "storage"` | the staff logout response only | §1.6 |

**The nonce.** Generated per request in middleware (`01` §5.8) and consumed by the
JSON-LD emitter and by the admin's own inline bootstrap. Because
`middleware.ts` cannot import Prisma or any service (`01` §2.2), the nonce
generator lives in `src/lib/edge/` alongside the security-header builder — one of
the few modules middleware may import.

**HSTS preload** (`max-age=63072000; includeSubDomains; preload`) is a one-way
door: once the domain is on the preload list, every subdomain must be HTTPS
forever. That is correct for a commerce domain and it is called out here so it is
a decision rather than a surprise.

### 5.9 File upload validation

Three upload paths, three different postures, because they have three different
threat profiles.

| Path | Route | Flow |
| --- | --- | --- |
| **Raster media** (jpg, png, webp, avif, mp4) | `POST /api/media/sign` → browser uploads direct to Cloudinary → `registerUpload()` | Signed, direct-to-CDN. Bytes never touch our function |
| **SVG** | `POST /api/media/svg` | **Proxied through our origin.** `06` §1490 requires sanitisation *before* the file reaches Cloudinary, which is only possible if we hold the bytes |
| **CSV import** | `POST /api/admin/import/upload` | Streamed to a temporary Cloudinary raw asset, parsed row-by-row, never buffered whole |

> **DECISION CHANGED — the CSV upload route was `/api/import/upload` here and
> `/api/admin/import/upload` in `08` §2.2; the second is canonical.** Every other
> staff-only route handler sits under `/api/admin/`, and
> `tests/unit/routes-authorized.test.ts` fails on a route in the tree with no
> manifest row, which one spelling in two documents guarantees. The media callback
> is the same class of defect settled the same way: the function is
> **`registerUpload(actor, input)`** and its route is **`POST /api/media/callback`**
> (`09` P06 builds it there). `06` §7.1's `confirmUpload()` is a rejected name.

**The signed-upload path, in detail** — this is the one with a non-obvious hole:

1. `createUploadSignature(actor, { folderId, filename, bytes })` — `POST /api/media/sign` — requires
   `media.create`, rate limited `media-sign:user:<id>`, and signs a parameter set
   that **pins** `folder` (`CLOUDINARY_UPLOAD_FOLDER` + the resolved folder path),
   `allowed_formats`, `resource_type`, `max_bytes` (`MEDIA_MAX_UPLOAD_MB`) and a
   `public_id` prefix. Cloudinary validates the signature against the exact
   parameter set, so the browser cannot add, drop or alter one.
2. `allowed_formats` **never includes `svg`** on this path.
3. **The upload callback is not trusted.** The browser posts Cloudinary's response
   to `registerUpload()`, and that response is attacker-controllable in transit.
   `registerUpload()` therefore verifies Cloudinary's own response signature
   (`api_sign_request` over `public_id` + `version` with `CLOUDINARY_API_SECRET`)
   before writing a `media` row. Without this, anyone with `media.create` — or
   anyone who can replay the request — can insert a `media` row pointing at an
   arbitrary URL, which then renders on the storefront.
4. `media.width`, `media.height`, `media.bytes` and `media.format` come from the
   verified response, not from the client.

**CSV.** `text/csv` or `application/vnd.ms-excel` content type, extension `.csv`,
size ≤ `MEDIA_MAX_UPLOAD_MB`, UTF-8 with BOM tolerated, row cap enforced by the
streaming parser, 500-row bounded dry-run preview before any write (`01` §2.7).
`import_jobs.market_code` / `currency_code` are `NOT NULL` for
`resource = 'prices'` by `chk_import_jobs_price_market` — `02` calls a price
import without a market "the single fastest way to overwrite an entire catalogue's
USD prices with INR numbers", and the constraint makes the file un-importable
rather than the mistake recoverable.

**Content type is never trusted from the client.** For the two paths where we hold
the bytes (SVG, CSV) the first 512 bytes are sniffed before parsing, and a
mismatch between the sniffed type and the declared type is a rejection, not a
coercion.

### 5.10 Secrets handling

`01` §5.8 owns this and is not restated. Three additions this section requires:

1. **`PASSWORD_PEPPER` is a required secret** (§1.4), scoped per Vercel
   environment, never shared between Production and Preview. A preview deployment
   with the production pepper is a production password-cracking oracle for anyone
   who can read a preview build's environment.
2. **Secrets never reach the client.** `src/lib/config/env.ts` exports
   `serverEnv` and `publicEnv` as separate objects, and only `publicEnv` (keys
   beginning `NEXT_PUBLIC_`) is importable from `src/components/**`, enforced by
   the boundaries rule. `tests/unit/no-secret-in-bundle.test.ts` greps the built
   `.next/static/**` output for the *values* of `AUTH_SECRET`, `PASSWORD_PEPPER`,
   `OTP_HASH_PEPPER`, `STRIPE_SECRET_KEY`, `RAZORPAY_KEY_SECRET`,
   `CLOUDINARY_API_SECRET` and `CRON_SECRET`, and fails the build on a hit.
3. **`/admin/settings/integrations` shows which keys are set, never their
   values** (`01` §4.9). There is no "reveal" button and no API that returns a
   secret. Rotation is done in Vercel, and the panel's job is to say whether the
   new value took effect.
4. **`GIFT_CARD_CODE_PEPPER` is a required secret whenever gift cards are
   enabled**, and it has had no environment home until now. `05` §8.7 corrects
   `02` §2.7's `gift_cards.code_hash` from Argon2id to
   `hmac_sha256(code, GIFT_CARD_CODE_PEPPER)` — correctly, because a per-row salt
   makes both `uq_gift_cards_code_hash` and `WHERE code_hash = $1` useless — and
   says the new secret is "documented in `01` §4.7", which is the **email**
   variable table and contains no such key. It appears in no `.env` table, no
   `env.ts` schema, and neither in §1.5's token inventory nor in this list. It is
   now in this list, and it is a token-class secret exactly like
   `PASSWORD_PEPPER`: 32 bytes base64, scoped per Vercel environment, never
   shared between Production and Preview, and **rotating it invalidates every
   outstanding card** — so rotation is a migration that rewrites `code_hash` from
   a one-time re-issue, not an env edit.
   `tests/unit/no-secret-in-bundle.test.ts` greps the built output for its value
   alongside the other seven.

> **RESOLVED — was CHANGE REQUIRED IN 01 §4:** add `GIFT_CARD_CODE_PEPPER` to the environment
> *Verified applied by inspection of the target document.*
> variable tables, to `src/lib/config/env.ts`'s Zod schema — `z.string().min(44)`,
> required when `feature.gift_cards_enabled` is true and optional otherwise — and
> to `.env.example` as an empty key with the comment
> `# 32 random bytes, base64. Rotating invalidates every outstanding gift card.`
> It belongs beside `PASSWORD_PEPPER` and `OTP_HASH_PEPPER` in the *security*
> block, not in §4.7's email block where `05` mistakenly filed it.

> **RESOLVED — was CHANGE REQUIRED IN 02 §2.2 and §2.7:**
> *Applied. The change now lives in 02 §2.2 (otp_requests.code_hash TEXT/PHC) and §2.7 (gift_cards.code_hash HMAC).*
> two `code_hash` columns are specified
> as Argon2id in `02` and used as something else everywhere they are read.
> `gift_cards.code_hash BYTEA` is the HMAC digest above, not Argon2id — `05` §8.7
> owns that correction and `02` still carries the superseded text that `09`
> P10/P18 migrate from. `otp_requests.code_hash` has the mirror-image defect in
> the other direction: `02` §2.2 types it `BYTEA` and describes it as Argon2id,
> while §4.2 of this document verifies it with `argon2.verify(row.code_hash,
> token)`, which takes a **PHC string** — that is `TEXT`, not `BYTEA`. Argon2id is
> the right choice there (an OTP is low-entropy and is looked up by its selector,
> not by its hash, so the per-row salt costs nothing); the column type is the
> defect. One is `BYTEA` because it is an indexed digest, the other is `TEXT`
> because it is a PHC string, and the reason they differ is that one is looked up
> by equality and the other is verified against a known row.

`scripts/check-env.ts` already runs in `pre-commit` and rejects a staged file
containing `sk_live`, `rzp_live` or `postgres://` (`01` §5.8). This section adds
`gitleaks` with the default ruleset to the same hook and to a CI job, because the
three-string check catches the three strings someone thought of.

### 5.11 Dependency and supply-chain discipline

`01` §1.5 already rejects a named list of packages outright and requires an ADR in
`docs/decisions/` for anything added to `dependencies`. The security-side rules:

| Control | Mechanism |
| --- | --- |
| Exact versions | `.npmrc` `save-exact=true`; no `^`/`~` in `dependencies`; `package-lock.json` committed (`01` §1.1) |
| Reproducible installs | `npm ci` in CI and in `vercel.json`'s install command. Never `npm install` in a pipeline |
| Known vulnerabilities | `npm audit --audit-level=high` as a CI job. A `high`/`critical` finding fails the build; the fix is an upgrade or an `overrides` pin, not an `--audit-level` bump |
| Transitive pins | `package.json#overrides` for a CVE in a transitive dependency, each with a comment naming the advisory and a follow-up issue |
| Registry integrity | `npm audit signatures` in CI — verifies registry provenance attestations for every package in the lockfile |
| Install scripts | Any new dependency with a `postinstall`, `preinstall` or `install` script is named in its ADR with what the script does. This is the single most common supply-chain delivery vector and it is a review item, not a scanner's job |
| Lockfile diffs | A PR that changes `package-lock.json` without changing `package.json` is flagged for explicit review — that shape is either a legitimate `npm audit fix` or a dependency-confusion attempt |
| GitHub Actions | Every third-party action pinned to a full commit SHA, never a tag. `permissions: contents: read` at the workflow level, widened per job only where needed |
| Automated updates | Dependabot weekly, grouped by ecosystem, security updates ungrouped and immediate. Grouping stops the noise that makes people merge without looking |
| Runtime pin | `.nvmrc` + `package.json#engines` + `.npmrc` `engine-strict=true` (`01` §1.1) |
| Third-party scripts in the browser | The CSP `script-src` allowlist **is** the inventory. Adding a host to it is a diff. PCI DSS v4.0 §6.4.3 requires exactly this inventory for payment pages (`01` §5.8) |

---

## 6. Commerce-specific security controls

Every control below is already specified and owned elsewhere. This section exists
so that a security review has one list, and so that nobody implements a parallel
mechanism. **Nothing here is new; if this section and its owning document ever
disagree, the owning document is right.**

### 6.1 Server-side pricing

| Control | Mechanism | Owner |
| --- | --- | --- |
| The client submits no amount at all | The checkout schema's `.strict()` denylist rejects `price`, `unitPrice`, `unit_final_minor`, `lineTotal`, `subtotal`, `discount`, `shippingAmount`, `tax`, `total`, `currency`, `market` and fifteen more as a `400` | `05` §640 |
| Price is computed server-side, once, by one module | `resolvePrice()` / `resolvePriceBatch()` in `src/lib/pricing/` — the only price authority; a price helper imported from anywhere else is a lint error | `01` §2.3, §2.2 |
| The submitted cart is re-priced and compared | Checkout step 2 compares the **server-issued** `cart_items.unit_final_minor` against a fresh resolve; any difference, zero tolerance, is `PriceChangedError` | `01` §2.5 |
| Per-customer prices can never be served from a shared cache | `resolvePrice()` takes `customerId`/`couponCode` and the `cached()` wrapper is **banned** in `src/lib/pricing/` by `no-restricted-imports` | `01` §2.4 |
| Metal-linked prices use that currency's own rate row | `metal_rates (material_id, currency_code, rate_minor_per_gram, …)`, `UNIQUE (material_id, currency_code, effective_at)`. There is no conversion factor anywhere | `01` §2.3, `02` §2.5 |
| A live price cannot be changed by a rate change alone | A `recalc_runs` row must reach `approved` via `price.approve_recalc` (owner/admin only, §2.5) | hard rule 6, `04` |
| Historical prices are immutable | `prices` rows are append-only with `valid_to`; `order_items.price_record_id` is `ON DELETE RESTRICT` | `01` §2.7 |

### 6.2 Server-side inventory

`reserveStock()` in `src/lib/inventory/` is the only thing that may decide
availability, and it does it with `SELECT … FOR UPDATE` on `inventory_items` in
ascending id order under `ReadCommitted` (`01` §1.2, §2.3). The PDP's availability
band is explicitly "a display hint" (`01` §2.5) and the public
`/api/catalog/availability` route returns a band, never a number, because exact
stock on a one-of-a-kind catalogue is competitive intelligence (`08` §2.2).
`getAvailability()` takes `marketCode` and sums only the locations that fulfil
that market via `market_locations` — a piece held only in Mumbai is `out` for US.

### 6.3 Server-side totals

`orders.total_minor` is computed by `src/lib/orders/` from the resolved lines and
is protected by `chk_orders_total`, `chk_order_items_subtotal` and
`chk_order_items_total` — **exact integer identities**, so a rounding residue does
not drift, it fails the `INSERT` (`02` §1.10). Allocation of order-level discount,
tax and shipping to lines is by largest remainder with the postcondition
`sum(result) === totalMinor`, property-tested. Tax is *allocated*, never
recomputed per line, so the total always matches what the provider settles.

### 6.4 Payment verification

Six assertions in one transaction before anything is marked paid, from `01` §2.5,
restated as a checklist because this is the one place where getting five of six
right is still a loss:

1. The `webhook_events` insert returned a row (not a duplicate).
2. `envelope.amountMinor === order.total_minor`.
3. `envelope.currencyCode === order.currency_code`.
4. `envelope.orderId === order.id`.
5. `transitionOrder()` accepts the transition **from the order's current status**.
6. The reservation is still live, **or** `reserveStock()` succeeds again now —
   and if it does not, the order goes to `paid_unfulfillable` and is refunded in
   the same job.

Plus: **payment success is recorded only by a verified webhook, never by a client
redirect.** Razorpay's browser callback signature *is* verified, and it writes a
`payment_events` row with `type = 'authorized'` — never `payment_status = 'paid'`
(`05` §4.2). `tests/e2e/checkout-us.spec.ts` asserts that a synthetic client
success callback with no webhook leaves the order `pending_payment`.

**And a seventh outcome the six assertions do not produce: the high-value hold.**
When `orders.total_minor >= settings['security.high_value_review_threshold']` for
that order's currency, the same webhook transition writes
`orders.status = 'pending_review'` instead of `'paid'` — the money and the stock
are settled either way, only fulfilment is held. **Releasing the hold requires
`order.update`, not `order.fulfil`**, which is the whole point of putting it on
that key: `inventory_manager` holds `order.fulfil`, and the warehouse must not be
able to release a fraud hold on the order it is about to pick. `05` §5.3 owns the
state machine, the release queue and the `createShipment()` guard; the
per-currency threshold is seeded `NULL`, meaning no hold, and `09` §5.1 makes
setting it to a figure the client named in writing a launch blocker.

### 6.5 Webhook signature verification and replay prevention

| Control | Mechanism |
| --- | --- |
| Raw body | The webhook paths are excluded from the middleware matcher so the body is byte-identical; the handler reads a `Buffer` and never calls `req.json()` first (`01` §1.3, `05` §4.3) |
| Signature | `provider.verifyWebhook(rawBody, headers)` per provider, HMAC compared with `timingSafeEqual`. An unverifiable payload is a `400` and a `webhook_events` row with `status = 'failed'` — logged, never processed |
| Missing secret | `STRIPE_WEBHOOK_SECRET` / `RAZORPAY_WEBHOOK_SECRET` absent means every delivery is rejected as unverifiable, which `01` §4.4 names "the single most damaging missing key in production". It fails closed, loudly, not open |
| Replay | `INSERT … ON CONFLICT (provider, provider_event_id) DO NOTHING RETURNING id`. Zero rows returned is a duplicate: return `200` without re-running a single effect (`01` §1.2, §2.5) |
| Timestamp window | Stripe's `t=` timestamp must be within 5 minutes of now, which is what stops a captured-and-held valid payload being replayed after the `webhook_events` table is pruned |
| Retry | `idx_webhook_events_retry` drives `/api/cron/retry-webhooks` with bounded `attempts` |
| Rate limit | `webhook:ip:<ip>` 600/min, generous by design — a legitimate burst of deliveries must not be dropped |
| No CSRF check | Webhooks are the documented `sameOrigin: false` exception (§5.4); the HMAC is the authentication |

### 6.6 Coupon and gift-card abuse

| Abuse | Control | Owner |
| --- | --- | --- |
| Currency confusion — a ₹500 coupon applied as $500 | Fixed amounts live in `coupon_amounts (coupon_id, currency_code, amount_minor)` with `UNIQUE (coupon_id, currency_code)`. **No row for the cart's currency means the coupon is inapplicable in that market** — never converted, never defaulted | `01` §2.6, `02` §2.7 |
| Global usage cap raced by concurrent carts | A **conditional `UPDATE` on `coupons.redemption_count`** with the cap in its `WHERE`, inside the order transaction at `ReadCommitted`; zero rows affected is `CouponUnavailableError`. `chk_coupons_redemptions` is the floor beneath it | `05` §8.5 |
| Per-customer reuse | `coupon_usages` with the uniqueness constraint on `(coupon_id, customer_id)` where the coupon is once-per-customer | `02` §2.7 |
| Stacking beyond intent | `coupon_conditions` evaluated server-side by `evaluateDiscounts()`; `excludes_discounted` is a condition type, not a UI checkbox | `02` §1.9, `05` |
| Code guessing | Rate limit `coupon:cart:<cartId>` 10 / 10 min **paired with** `coupon:ip:<ip64>` 60 / hour (§5.5) — a cart id is client-held, so the cart key alone is defeated by a new cart per attempt; an unknown code and an ineligible code are indistinguishable in the response (§5.7) | this doc |
| Gift-card balance guessing | Codes hashed before lookup (HMAC, §5.10 item 4), never echoed back, rate limited on **both** `giftcard:cart:<cartId>` 5 / 10 min and `giftcard:ip:<ip64>` 20 / 24 h (§5.5). Balances are per currency (`gift_cards.balance_minor` + `currency_code`) and `gift_card_transactions.amount_delta_minor` is the signed ledger | `02` §2.7, `05` §8.7 |
| Coupon authored by the wrong person | `coupon.manage` is `owner`/`admin` only (§2.4, note 1) | this doc |

> **DECISION CHANGED — the usage-cap row no longer says `Serializable`.** This
> table previously specified `withSerializableRetry()` around the coupon usage-cap
> transaction, citing `01` §1.2. That is not implementable where it has to run:
> the redemption happens **inside the order-creation transaction**, which `01`
> §1.2 fixes at `ReadCommitted` for `reserveStock()`, and Postgres takes one
> isolation level per transaction. Following the old row produced one of two
> outcomes, both wrong — the reservation silently loses its documented level, or
> the coupon redemption is split into its own transaction, which `02` §5.3
> forbids. `05` §8.5 reconciles it properly and is the owner: a global cap and an
> order-number allocation are both **single-row counters**, and a row lock is a
> stronger and cheaper guarantee than snapshot isolation for a counter.
> `withSerializableRetry()` remains the required wrapper for the paths that run
> these mutations **outside** checkout — admin coupon-cap edits, counter repair,
> bulk redemption imports — and `tests/integration/coupon-cap-race.test.ts` proves
> the in-checkout path with N concurrent connections against a cap of 1.

### 6.7 Market manipulation

The attack: get an INR price and pay in USD, or get a US-market product into an
INR cart, or flip the market between pricing and payment.

| Control | Mechanism | Owner |
| --- | --- | --- |
| Market comes from the URL segment, never a cookie | `resolveMarket(marketSegment)` has **no cookie parameter, by construction** | `01` §1.4, §2.3 |
| The market of a checkout comes from the cart row | `carts.market_code`, cross-checked against the `[market]` segment of the posting URL; a mismatch is `MarketChangedError` and the cart is re-priced, and nothing else happens | `01` §2.5 |
| `market` / `marketCode` in a request body is rejected outright | The `.strict()` denylist | `05` §640 |
| A cart cannot hold two currencies | `carts.market_code` and `carts.currency_code` are `NOT NULL` with a composite FK to `markets (code, currency_code)`; `cart_items` carries no currency of its own | `01` §2.5, `02` §2.7 |
| A cached page cannot carry another market's prices | Every cache key and tag includes the market code | `01` §2.4 |
| The acquirer is bound to the market | `getProviderForMarket()` returns `null` rather than falling back to another market's acquirer in another currency; `null` blocks checkout and writes no order | `01` §2.3, §4.9 |
| Market preview cannot be self-granted | `/admin/tools/market-preview` requires `market.preview`; middleware's token check is not the authorization | `04` §1242 |

---

## 7. Audit logging

### 7.1 What is written

`audit_logs` (`02` §2.9) with every column populated as follows. `recordAudit()`
is called **inside the same transaction as the write** (`01` §2.3 step 5) — an
audit row that commits separately is an audit row that can be missing for the one
write anybody ever asks about.

```ts
// src/lib/audit/index.ts
export async function recordAudit(tx: Tx, input: {
  actor: Actor;
  entity: string;                 // the table name: 'products', 'orders', 'users'
  entityId: string | null;
  action: AuditAction;
  before?: Record<string, unknown> | null;   // changed fields only
  after?: Record<string, unknown> | null;    // changed fields only
  summary?: string;
}): Promise<void>;
```

| Column | Filled with |
| --- | --- |
| `actor_type` | `staff` / `customer` / `system` / `webhook` / `cron` — from `actor.kind` and, for system actors, `actor.reason` |
| `actor_user_id` | `StaffActor.userId`, `NULL` otherwise |
| `actor_customer_id` | `CustomerActor.customerId`, `NULL` otherwise |
| `impersonator_user_id` | Non-null for every write made during an impersonated session (§1.11) |
| `entity`, `entity_id` | Table name and row id |
| `action` | See §7.2 |
| `before` / `after` | **Changed fields only**, redacted (§7.3). `02` is explicit: a full-row copy of every product save would make this the largest table in the database within a year and duplicates `content_versions` |
| `summary` | A human sentence for the timeline: "Refunded $420.00 of order MD-US-10432 — customer reported damage in transit" |
| `request_id` | The `x-request-id` propagated from middleware (`01` §5.8), so an audit row joins to the Sentry event and the Vercel log line |
| `ip_address` | Recorded for staff and customer actors. `NULL` for `cron` and `system` — there is no meaningful IP, and a placeholder would be a lie |
| `user_agent` | Same rule |
| `created_at` | Append-only |

### 7.2 What gets an audit row

**Every mutation through a service, without exception** — `01` §2.3 makes it step
5 of the mandatory six and says it is "not optional and not the caller's job". Plus
these **reads**, which are audited precisely because they are the sensitive ones
and their volume is low:

| Audited read | `action` | Why |
| --- | --- | --- |
| Opening a customer record | `view` on `customers` | The highest-sensitivity single read in the admin panel |
| Any export containing PII | `export` | With the resource, the row count and the filter in `after` |
| Starting / stopping impersonation | `impersonate_start` / `impersonate_stop` | With the reason |
| Viewing the audit log itself | `view` on `audit_logs` | §7.4 |

**Not audited as reads:** order lists, product lists, the dashboard, media
browsing. Auditing every admin page view produces a log nobody reads, which is the
same as no log, at the cost of the write volume `02` already warns about.

**Security events**, which are audit rows with no entity row behind them:

| `action` | `actor_type` | Notes |
| --- | --- | --- |
| `login` / `logout` | staff / customer | |
| `login_failed` | staff, or `system` when the email matched no user | For **staff** the attempted email is recorded in `summary` (the login page is internal and the incident-response value is real). For **customers** nothing but the rate-limit key is recorded — an email typed into a public form is somebody's personal data |
| `totp_enrolled`, `totp_reset`, `totp_recovery_used` | staff | |
| `password_changed`, `password_reset_completed` | both | |
| `session_revoked` | both | Including "sign out everywhere" with the count |
| `role_granted`, `role_revoked`, `permission_granted`, `permission_revoked` | staff | The first question of any access review (`02` §2.2) |
| `user_invited`, `user_deactivated`, `user_unlocked` | staff | |
| `access_denied` | staff | Written whenever `requirePermission()` throws: the permission key, the action or route, and the actor. Rate-limited to one row per `(actor, permission)` per minute so a loop cannot flood the table. Without it, the single most informative event in the system — a named employee probing for what they can reach — is the one event that leaves no trace, and `9.2` B1's "expected `ForbiddenError`" is unfalsifiable after the fact |
| `session_cookie_mismatch` | staff / customer | A session token presented in the wrong cookie (§1.1). Never legitimate; always worth a look |
| `totp_challenge_replayed` | staff | The `md_totp` `jti` burn fired (§1.5 rule 6) |
| `email_changed` | customer | Both addresses in `before`/`after`, and the actor — which is a staff member when `customer.update` performed it (§1.7) |

### 7.3 What must never be logged — anywhere

The same list applies to `audit_logs.before`/`after`, to `src/lib/logger.ts`
output, to Sentry `extra`, and to `ActionResult.message`.

| Never logged | Enforcement |
| --- | --- |
| Plaintext passwords, in any field, ever | `redact()` denylist; the value never leaves the action's local scope |
| `users.password_hash`, `customers.password_hash` | Field-name denylist |
| `users.totp_secret_encrypted`, `users.totp_recovery_codes` | Field-name denylist |
| `sessions.token_hash`, `carts.token_hash`, `orders.public_token_hash`, `wishlists.share_token_hash`, `otp_requests.code_hash` | Field-name denylist on `*_hash` |
| OTP codes, reset tokens, invite tokens, TOTP codes, recovery codes | Never assigned to a variable that reaches a logger; token-hygiene test |
| API keys, webhook secrets, `PASSWORD_PEPPER`, `AUTH_SECRET`, `OTP_HASH_PEPPER`, connection strings | Field-name denylist **plus** a value-shape detector: `sk_live_`, `sk_test_`, `rzp_`, `whsec_`, `postgres://`, and any base64/hex run ≥ 40 chars in a value |
| Full PAN, CVV, expiry | Card data never reaches our origin at all — Stripe Payment Element and Razorpay Checkout are iframed (`01` §5.8). There is no column and no field to redact |
| Zod validation **values** | `08` §1.4: `ValidationError` logs "Zod issue paths, never values" |
| `AppError.context` in a response | `08` §1.4: "logged, NEVER serialised to a client" |

```ts
// src/lib/security/redact.ts
export function redact<T>(value: T): T;      // deep clone with denylisted keys -> '[redacted]'
                                             // and value-shape matches -> '[redacted:shape]'
```

`redact()` is applied by `recordAudit()` and by the logger transport, not by
callers — a redaction that a caller has to remember is a redaction that happens
most of the time. `tests/unit/redact.test.ts` asserts every denylisted field name
and every value shape.

**`webhook_events.payload` is stored unredacted, deliberately.** It is the
provider's own event, it contains card *metadata* (brand, last four, country) and
never card data, and it is the only artefact that makes `/admin/system/webhooks`
able to replay a failed delivery. It is covered by the same access control as the
rest of the admin panel (`integration.manage`, owner only) and by the same
retention as `audit_logs`.

### 7.4 Protecting the log from the people it audits

This is the part that is usually skipped, and it is the part that matters, because
the actor most worth auditing is the one with the most permissions.

1. **The application role cannot modify it.** The migration that creates
   `audit_logs` ends with:

   ```sql
   REVOKE UPDATE, DELETE, TRUNCATE ON audit_logs FROM md_app;
   ```

   `md_app` — the role behind `DATABASE_URL` — keeps `INSERT` and `SELECT`. There
   is no application code path that could delete an audit row even if someone
   wrote one; the database refuses it. The same revoke is applied to
   `payment_events` and `inventory_transactions`, which are the other two
   append-only ledgers.
2. **There is no admin UI that edits or deletes audit rows**, and
   `/admin/system/audit-log` is read-and-filter only. There is no "clear log"
   button to find.
3. **Reading the log is itself logged** (§7.2), so a user with `audit.read`
   reviewing their own trail leaves a trail.
4. **`owner` is audited exactly like everyone else.** There is no exemption flag,
   no "system" bypass for a human, and `owner` cannot revoke `audit.read` from
   themselves in a way that hides anything — revoking a permission is
   `permission_revoked`, which is an audit row.
5. **The residual risk is honest: an `owner` with the Neon console can do anything
   to the database, including to this table.** No application-level control
   changes that. The mitigation is an **off-site append-only copy**: a weekly job
   of kind **`audit_archive`** writes security-relevant audit rows to storage
   outside the application's own database, where the application's credentials do
   not reach. It is enqueued by `/api/cron/run-jobs` with no originating user, so
   `JOB_KINDS['audit_archive'].systemPermitted` is `true` and its
   `dedupeKey` is `'kind'` (§3.2).

   > **DECISION CHANGED:** this job was specified as `job_kind = 'export'`.
   > `export` is a human-only kind — `systemPermitted: false` — so a weekly
   > machine-originated run of it would have failed as `FORBIDDEN` the moment §3.2
   > was implemented, and it would additionally have made the one job that audits
   > the administrators indistinguishable in `/admin/system/jobs` from every CSV
   > export they run. `audit_archive` is its own `job_kind` value
   > (`11-registries.md` §3.1) shipped in its own `ALTER TYPE` migration.

> **NEEDS INPUT:** where the off-site audit copy goes, and who holds those
> credentials — it must be an account the day-to-day platform administrators do
> not control, or it is not an off-site copy, it is a second copy of the same
> trust boundary. Options are an S3 bucket with object lock, a separate Neon
> project, or an email to a retained accountant. Until this is answered the job is
> implemented and disabled, and the residual risk is documented rather than
> papered over.

### 7.5 Retention

`02` §2.9 already sets the policy and its escape hatch, and this section does not
change it: nothing is pruned at launch, `audit.retention_days` is seeded `null`
(read as "retain everything"), partitioning by month is the mechanism at 20
million rows, and the retention split — security-relevant actions retained
indefinitely, routine catalogue and content edits subject to the setting — is a
`WHERE action IN (…)` on the prune, not a schema change. The security-relevant set
is: `login`, `login_failed`, `logout`, `impersonate_start`, `impersonate_stop`,
`password_changed`, `password_reset_completed`, `totp_*`, `role_*`,
`permission_*`, `user_invited`, `user_deactivated`, `user_unlocked`,
`access_denied`, `session_cookie_mismatch`, `email_changed`, `refund`,
`approve_recalc`, `export`, `anonymize`, and every write to `settings`.

> **SCHEMA ADDITION:** one index on `audit_logs` (`02` §2.9):
>
> ```sql
> CREATE INDEX idx_audit_action ON audit_logs (action, created_at DESC);
> ```
>
> `02` ships three indexes on this table, keyed by entity, by actor and by time,
> and the retention split above, the weekly off-site export in §7.4 and the
> "show me every refund and every permission change this quarter" filter that
> `/admin/system/audit-log` exists to answer are all `WHERE action IN (…) AND
> created_at > $1` — which none of the three can serve. On a table whose own
> section warns it reaches 20 million rows, that is a sequential scan competing
> with live writes, run by a cron at 03:00 and by a human during an incident. The
> leading column partitions cleanly on `created_at` too, so it survives the move
> to monthly partitions unchanged.

When the prune is eventually enabled it runs as a **separate database role** with
`DELETE` on `audit_logs`, used by that cron and nothing else, so the application
role's revoke in §7.4 stays absolute.

> **NEEDS INPUT:** `02` §2.9 already asks for the audit retention period the
> client or their auditor requires, and whether any of it is contractually fixed.
> That question is not answered here and nothing is invented in its place.

---

## 8. Privacy

### 8.1 What PII this system holds, and where

| Data | Tables | Notes |
| --- | --- | --- |
| Name, email, phone | `customers`, `orders.email`, `newsletter_subscribers`, `order_addresses` | `orders.email` is a **snapshot**, independent of the customer row (`02` §2.7) — anonymising the customer does not rewrite the order |
| Postal addresses | `addresses` (live), `order_addresses` (snapshot) | The snapshot is a financial record; the live row is an address book |
| Tax identifier (GSTIN) | `addresses.tax_identifier` | India B2B invoices |
| Purchase history | `orders`, `order_items`, `returns`, `refunds` | |
| Behavioural | `analytics_events`, `search_queries`, `carts` | `customer_id` nullable on all three |
| Staff-authored notes | `customers.internal_note`, `orders.internal_note` | Staff-visible only, and the single most likely place for a note nobody would want the customer to read |
| Authentication material | `customers.password_hash`, `otp_requests` | §1 |
| Session metadata | `sessions.ip_address`, `sessions.user_agent` | |
| Fraud metadata | `orders.ip_address` | |

**No payment instrument data is held anywhere.** Card details go from the
customer's browser to Stripe's or Razorpay's iframe and never touch our origin
(`01` §5.8). `payments` holds provider references, amounts and statuses.

### 8.2 What a public API must never return

`08` §2.2 fixes the public read surface. The rule, restated as a denylist that
`tests/e2e/public-api-leak.spec.ts` asserts against every public route's response
body:

| Never in a public response | Instead |
| --- | --- |
| Any `customers` field — email, phone, name, group, `internal_note`, totals | Nothing. There is no public customer endpoint |
| Any `users` (staff) field, including a name on a CMS page or a journal byline | Journal authorship is a CMS field, not a `users` join |
| Another customer's order, address, wishlist or cart | §4 |
| Exact stock counts | `AvailabilityBand` only — **five values**: `'in_stock' \| 'low' \| 'out' \| 'made_to_order' \| 'sold'` (`05` §1.1). This row previously listed four and omitted `sold`; the sold state is precisely what a competitor may see — a one-of-a-kind piece that has been bought is public information the moment the SOLD plate renders — and a stock **count** is what they may not |
| Cost price, margin, supplier, `prices` rows other than the active one for the requested market | `getDisplayPrice()` returns list and sale for one market |
| Unissued or inactive coupon codes, or any coupon list | Codes are validated, never enumerated |
| `audit_logs`, `webhook_events`, `jobs`, `settings` rows, integration status | Admin only |
| `search_queries.customer_id`, `analytics_events.customer_id` | Aggregates only, and the admin reports group rather than list |
| Internal ids where a token exists | `/orders/[token]`, not `/orders/[id]` |

**A shared wishlist is the one public surface carrying a person's choices**, and
it requires both `share_token_hash` **and** `is_public` (§4.2). It renders the
list and the wishlist name; it never renders the customer's name or email unless
the customer typed one into the wishlist name themselves.

### 8.3 Deletion posture: anonymise, do not delete

`02` §1.4 files `customers` under anonymise-not-delete and `orders` under never-
delete, and `orders.customer_id` is `ON DELETE RESTRICT` so that deleting a
customer cannot take the orders with it. `anonymizeCustomer(actor, customerId,
reason)` requires `customer.anonymize` (**`owner` only**, §2.5), runs one
transaction, and does exactly this:

| Table | Action |
| --- | --- |
| `customers` | `anonymized_at = now()`; `email = 'anonymized-' \|\| id \|\| '@invalid'`; `first_name`, `last_name`, `phone`, `phone_verified_at`, `email_verified_at`, `password_hash`, `internal_note`, `marketing_consent_source` → `NULL`; `accepts_marketing = false`. The partial unique index `idx_customers_email … WHERE anonymized_at IS NULL` is why the replacement address cannot collide |
| `addresses` | Hard-deleted. The address book has no historical value; the order snapshots do |
| `sessions` | All revoked |
| `carts` | `customer_id` set `NULL` (the FK is already `SET NULL`) |
| `wishlists` | Cascade-deleted with the customer's wishlist rows; `share_token_hash` gone |
| `newsletter_subscribers` | `customer_id` → `NULL`, `status = 'unsubscribed'`. The suppression record survives, because losing it means mailing them again |
| `orders`, `order_items`, `order_addresses`, `payments`, `refunds` | **Untouched.** These are financial records; `orders.email` is a snapshot and stays |
| `analytics_events`, `search_queries` | `customer_id` → `NULL` (both FKs are `SET NULL`) |
| `audit_logs` | **Untouched**, plus a new row: `action = 'anonymize'`, entity `customers` |

**The order snapshot is retained deliberately, and that is a defensible position
rather than a convenient one:** tax and company-law record-keeping obligations
attach to the invoice, and every major privacy regime carries an exemption for
data retained to meet a legal obligation. What is retained is the *invoice* — name
and address as they were at purchase — not the marketing profile, the behavioural
history, the address book or the account.

> **NEEDS INPUT:** which privacy regimes the client is actually subject to, and
> the retention period their accountant requires for transaction records. The
> answer changes the response deadline, the verification standard for a request,
> and how long `order_addresses` is kept — it does not change any of the
> architecture above, which anonymises the profile and retains the invoice either
> way. What must not happen is this document inventing a jurisdiction, a deadline
> or a retention period on the client's behalf.

### 8.4 Data export

`requestDataExport()` — customer session, **not impersonated**, rate limited
`account-export:customer:<id>` 1 / 24 h. Queues a `jobs` row with
`kind = 'account_export'`. The bundle is a single JSON file containing: the `customers`
row (redacted of `internal_note` — a staff note about a customer is the staff
member's record, and a subject-access regime that requires its disclosure is a
question for the client's counsel, flagged above), `addresses`, `orders` with
`order_items` and `order_addresses`, `returns`, `wishlists`, `newsletter_subscribers`,
and the customer's `analytics_events` and `search_queries`.

**Delivery is a single-use, 24-hour link emailed to the verified address** — never
an inline download from the account page. A download link that works because a
session is open is a download link that works for whoever is sitting at the
machine; an email to the verified address proves control of the identity the data
belongs to.

"Single-use" is the `otp_requests` row with purpose `data_export` from §1.5, not a
signed JWT, for the reason §1.2 gives: a JWT cannot be un-issued, and this is the
most PII-dense artefact the system produces. Concretely: the job writes the bundle
to Cloudinary as a **private** raw asset (`type: 'private'`, so its URL is not
publicly resolvable and requires a server-signed delivery URL), inserts the token
row with `expires_at = now() + 24 h` and `customer_id` set, and mails the link.
`GET /account/export/[token]` consumes the row and streams the asset through a
short-lived signed delivery URL in the same transaction (§4.2). A second cron pass
deletes the asset once the row is consumed or expired, so the bundle does not
outlive its link; if the customer never clicks, nothing remains after 24 hours but
the audit row saying a bundle was produced.

> **DECISION CHANGED — this job was `kind = 'export'` and cannot be.** `export` is
> a staff kind with `systemPermitted: false` (§3.2): a `NULL`
> `jobs.created_by_user_id` on it is a failed job, by design, because that column
> is what stops a queued PII export running with more authority than the person
> who queued it. A customer's own subject-access request has **no staff user at
> all** — `jobs.created_by_user_id` references `users`, and the requester is a
> `customers` row — so under §3.2 every data-export request would have failed as
> `FORBIDDEN` in `jobs.error`, which is the same defect that killed the
> order-confirmation email, aimed at a legal obligation instead of a receipt.
>
> `account_export` is its own kind, `systemPermitted: true`, `dedupeKey: 'entity'`
> keyed `customer:{customerId}` — which is also what stops two requests in one
> window producing two bundles. Granting it a system actor is safe for the same
> reason the other eleven are: its handler takes the `customerId` from
> `jobs.payload`, reads **only rows scoped to that customer**, and calls no
> permission-gated mutator, so `tests/unit/job-handlers-unprivileged.test.ts`
> covers it like the rest. The authorisation for the *request* already happened at
> `requestDataExport()`, against the customer's own session; the authorisation for
> the *delivery* is the single-use emailed token. Neither is a staff permission,
> and forcing it through a kind that requires one was the error.
>
> **RESOLVED — was CHANGE REQUIRED IN 11 §3.1 and §3.2:** add
> *Verified applied in 11.*
> `ALTER TYPE job_kind ADD VALUE 'account_export';` and the registry row —
> enqueued by `requestDataExport()` (customer session), system actor **yes**,
> dedupe `entity` (`customer:{id}`), note "the customer's own subject-access
> bundle; reads only that customer's rows". **CHANGE REQUIRED IN 02 §1.9:** the
> same enum value.

Staff-side export is separate and stricter: `export.run` reaches the tool and each
resource additionally requires that resource's own read permission (§2.3);
**any export whose resource includes customer PII (`customers`, `orders`,
`returns`) additionally requires `customer.export`**, which is also on the §1.9
step-up list, so it re-asks for the authenticator. Only `owner` and `admin` hold
it. Every PII export writes an audit row with the
resource, the filter and the row count, and is rate limited `export:user:<id>`
5 / hour. The realistic exfiltration risk in an admin panel is not someone reading
one customer record; it is someone downloading all of them on their last day.

### 8.5 Admin-side access to customer data

| Control | Mechanism |
| --- | --- |
| Seeing a customer record requires `customer.read` | `catalog_manager`, `content_editor` and `analyst` do not have it (§2.5) |
| Seeing the customer block of an **order** requires it too | `getOrderDetail()` projects email, phone and address lines only for an actor holding `customer.read` (§2.4 note 2) — otherwise `order.read` is `customer.read` by another name |
| Opening one is audited | §7.2 |
| Bulk-exporting them requires `customer.export` | `owner` / `admin` only, audited, rate limited |
| Acting as one requires `user.impersonate` + TOTP | §1.11; read-mostly; both actors audited |
| Erasing one requires `customer.anonymize` | `owner` only |
| Every admin response is `no-store` | `01` §2.4 |
| The admin panel is `noindex` and `frame-ancestors 'none'` | `01` §5.8 |

> **NEEDS INPUT (optional control):** whether the client wants `/admin/**`
> restricted to an IP allowlist. It is genuinely effective against a stolen
> credential and genuinely painful for staff working from home or a trade show.
> If yes, `ADMIN_IP_ALLOWLIST` (comma-separated CIDRs, optional, empty = no
> restriction) is checked in middleware — presence-gating only, since middleware
> cannot authorize (`01` §2.1) — and the real check is repeated in
> `requireStaffSession()`. Off by default; enabling it is a config change, not a
> deploy.

---

## 9. Security test plan — attacks to attempt before launch

Every row is an attack to run, not a control to look at. Each has a home in the
test suite and runs in CI; the manual column marks the ones a human should also
attempt by hand against the staging deployment before go-live, because an
automated test only proves the attack it was written for.

### 9.1 Authentication

| # | Attack to attempt | Expected defence | Test | Manual |
| --- | --- | --- | --- | --- |
| A1 | Replay a captured session cookie after the user signs out | 401; `sessions.revoked_at` is set and the predicate fails | `tests/integration/session.test.ts` | |
| A2 | Use a session issued before a password change | 401 via `s.created_at >= u.password_changed_at` | integration | |
| A3 | Use a staff session 61 minutes after the last request | 401, idle timeout | integration | |
| A4 | Use a staff session 13 hours after login, staying active throughout | 401, absolute TTL | integration | ✓ |
| A5 | Set a session cookie before signing in, then sign in, and see whether the pre-set value is still valid | 401 — rotation on login (§1.10) | integration | |
| A6 | Submit a login with a valid email and a wrong password 6 times | Lockout on staff at 5; identical generic message throughout; `login_failed` rows | integration | |
| A7 | Submit a valid TOTP code twice within the 90-second window | Second attempt rejected by `totp_last_step` | integration | |
| A8 | Skip the TOTP step by calling an admin action with only the `md_totp` cookie | No session exists; 401. `md_totp` is `aud: 'totp'` and is not accepted by `resolveSession` | integration | ✓ |
| A9 | Reuse a password-reset link twice | Second use: the `consumed_at` guard returns zero rows and the transaction rolls back | integration | |
| A10 | Use a password-reset link 31 minutes after it was issued | Expired | integration | |
| A11 | Request a reset for `nobody@example.com` and compare status, body and timing with a real address | Byte-identical body and status; p50 within 25 ms | `tests/e2e/enumeration.spec.ts` | |
| A12 | Register with an email that already has an account and read the response | Identical "check your email" state; the *account holder* gets the "someone tried to register" mail | e2e | ✓ |
| A13 | Brute-force a 6-digit customer OTP | `max_attempts = 5` on the row, plus `otp:email` 5/15min and `otp:ip` 20/hour | integration | |
| A14 | Request 100 OTPs for one address to run up the SMS/email bill | Rate limited at 5 / 15 min per email and 20 / hour per IP | integration | |
| A15 | Hold a valid `md_admin` cookie and submit it from another origin | `SameSite=Strict` means it is not sent; server-action origin check rejects | e2e | ✓ |
| A16 | Submit six wrong passwords, then read `users.failed_login_count` and the `login_failed` audit rows directly from the database | `5` and five rows — the failure bookkeeping is its own committed transaction, not part of the rolled-back attempt (§1.6) | `tests/integration/login-lockout.test.ts` | |
| A17 | Sign in as a role below the privilege line, have an owner add `order.refund` to that role, then call `refundOrder` on the **existing** session | `TotpRequiredError` → redirect to `/admin/login/2fa`; the line is re-evaluated per request, not at login (§1.9) | integration | ✓ |
| A18 | Replay the `md_totp` cookie a second time, straddling a five-minute clock boundary | Rejected — the `jti` burn is keyed on the token's own `iat`, so there is no window seam (§1.5 rule 6) | integration | |
| A19 | Complete a **staff** password reset and then reach `/admin` without the authenticator | No session is issued by the reset; the subsequent login still demands TOTP. A reset is not a second-factor bypass (§1.6) | integration | ✓ |
| A20 | Sign in with the correct password on an account whose email is unverified, five times | Generic message every time, plus one verification email on the first and rate limiting at 5/hour — never a dead end and never an oracle (§1.7) | integration | |
| A21 | Present a customer session token in the `md_admin` cookie (and the reverse) | Unauthenticated; `session_cookie_mismatch` audit row. Neither resolver consults the other's cookie (§1.1, §3.2) | integration | ✓ |
| A22 | Change an account's email, then use the old address to request a password reset | The old address is no longer the login identity; the **old** address received the change notice, which is the control that makes this recoverable (§1.7) | e2e | |

### 9.2 Authorization

| # | Attack to attempt | Expected defence | Test | Manual |
| --- | --- | --- | --- | --- |
| B1 | As `content_editor`, invoke `refundOrder` by POSTing its server-action id directly, with no UI | `ForbiddenError` from `adminAction('order.refund', …)` | `tests/integration/rbac-matrix.test.ts` | ✓ |
| B2 | As each of the seven roles, invoke **every** admin action | The set that is not `FORBIDDEN` equals the §2.5 matrix row exactly | rbac-matrix | |
| B3 | As `admin`, grant yourself or a second account the `owner` role | `ForbiddenError` — no-escalation rule (§2.6) | `tests/integration/rbac-escalation.test.ts` | ✓ |
| B4 | As `admin`, add `role.manage` to the `admin` role | Same rule; `admin` lacks `role.manage` entirely | integration | |
| B5 | Remove the `owner` role from the last active owner | `LastOwnerError` | integration | |
| B6 | Call `/api/media/sign` with a customer session | 401 — `withRoute` auth is `staff:media.create` | integration | |
| B7 | Call a cron route without `CRON_SECRET` | 401, fail closed (`01` §4.1) | integration | |
| B8 | Add a new admin server action with no permission argument | **CI fails** at `tests/unit/actions-authorized.test.ts` | unit | |
| B9 | Add a new route handler with no `auth` in `withRoute` | **Does not compile**; and `tests/unit/routes-authorized.test.ts` fails on a missing manifest row | unit | |
| B10 | Reference a permission key in code that is not in the catalogue | **CI fails** at `tests/unit/rbac-catalogue.test.ts` | unit | |
| B11 | Delete every `<Can>` wrapper and try the actions as a low-privilege role | Identical behaviour — hidden UI was never the control | manual | ✓ |
| B12 | As `analyst`, export the customer list | `export.run` alone is insufficient; `customer.export` is required and not held | integration | |
| B13 | Place an order while impersonating a customer | `assertNotImpersonated` throws | integration | ✓ |
| B14 | As `inventory_manager`, upload and **apply** a `resource='prices'` CSV | `FORBIDDEN` — `import.run` reaches the tool, `price.update` applies the rows (§2.3). The dry-run preview is permitted; the apply is not | `tests/integration/rbac-matrix.test.ts` | ✓ |
| B15 | As `admin`, deactivate the `owner`; reset the `owner`'s TOTP; change the `owner`'s email | `FORBIDDEN` on all three — no administering upward (§2.6 rule 3) | `tests/integration/rbac-escalation.test.ts` | ✓ |
| B16 | Queue an export as a user holding `customer.export`, remove the permission, then let the worker run | The job fails `FORBIDDEN` — the worker re-resolves the queuing user's permissions at run time and never runs as `system` for a human-originated job (§3.2) | integration | ✓ |
| B16a | Insert a `jobs` row with `created_by_user_id = NULL` for each of the five `systemPermitted: false` kinds | Each ends `failed` with `FORBIDDEN` in `jobs.error`; none runs | `tests/integration/jobs-worker.test.ts` | |
| B16b | Insert a `jobs` row with `created_by_user_id = NULL` for each of the thirteen `systemPermitted: true` kinds | Each completes as `systemActor('job')` — and specifically, **a paid webhook produces exactly one `email_logs` row** with `status <> 'skipped_unconfigured'`. This is the regression test for the closed-allowlist defect (§3.2) | `tests/integration/jobs-worker.test.ts`, `tests/integration/webhook-duplicate.test.ts` | ✓ |
| B16c | Queue a `bulk_edit` over 200 products as `catalog_manager`, revoke `product.update` mid-run | The job stops at the next row, not at the next job: the permission is re-checked **per row** against the re-resolved actor, and `jobs.result` names the row it stopped at (§3.2) | integration | |
| B20 | As `content_editor`, call `restoreVersion()` and then `publishPage()`; as a role holding `cms.restore` but not `cms.publish`, do the same | The restore writes the draft in both cases; the publish is `FORBIDDEN` in the second. Restore and publish are two keys because they are two decisions (§2.3 rows 51–53) | `tests/integration/rbac-matrix.test.ts` | |
| B21 | As `admin`, hard-delete a Cloudinary asset | `FORBIDDEN` — `media.hard_delete` is `owner` only, and it additionally step-ups for a fresh TOTP (§1.9) | integration | ✓ |
| B22 | As `catalog_manager`, read `prices.cost_minor` through the price list, the CSV export and the recalc preview | Absent from all three projections — `price.read_cost` is not held, and the column is dropped in the `SELECT`, not hidden in the component (§2.3 row 22, §2.4 note 2's rule applied to margin) | integration | ✓ |
| B17 | As `analyst`, open an order detail and read the response for the customer's email and address | Absent from the projection, not merely hidden — `customer.read` is not held (§2.4 note 2) | integration | ✓ |
| B18 | Toggle a customer's marketing consent while impersonating them | `assertNotImpersonated` throws; no `marketing_consent_source` is fabricated (§1.11) | integration | |
| B19 | Invoke a `cron` route from Vercel Cron with a valid `CRON_SECRET` and no `Origin` header | Runs — `sameOrigin` derives from `auth.kind` and is off for bearer-secret routes (§3.4). A regression here looks like a cron outage | integration | |

### 9.3 Customer data (IDOR)

| # | Attack to attempt | Expected defence | Test | Manual |
| --- | --- | --- | --- | --- |
| C1 | As customer B, request customer A's order by id | 404 — ownership is in the `WHERE` clause | `tests/e2e/idor.spec.ts` | |
| C2 | As customer B, `PATCH` customer A's address by id | Zero rows updated → `NotFoundError` | e2e | |
| C3 | As customer B, add an item to customer A's cart by passing `cartId` in the body | `.strict()` rejects the field; the cart is resolved from the cookie | e2e | |
| C4 | Poll `/api/checkout/status/[orderId]` for an order id you do not own | 404 — session or cart token required, never the id alone | e2e | ✓ |
| C5 | Enumerate `/orders/[token]` with random tokens | 404 every time; rate limited `order-token:ip` 20/hour | e2e | |
| C6 | Fetch a shared wishlist after the owner turns sharing off | 404 — `unshareWishlist` clears `is_public` **and** nulls `share_token_hash`, and both are in the predicate (§4.3) | e2e | |
| C6a | Save a shared-wishlist URL, have the owner press Share again, then open the saved URL | 404 — a second `shareWishlist` is a token **rotation**, which is the only revocation control a customer has once a link has escaped (§4.3) | e2e | ✓ |
| C6b | Read the HTML of a live shared wishlist for the owner's name, email or `customer_id` | None present — `PublicWishlistView` is a separate projection, not a filtered customer record (§8.2) | e2e | |
| C7 | Sign in as A, load a PDP, sign out, load it as B, and inspect the HTML | Nothing of A's in B's HTML even on `x-vercel-cache: HIT` | `tests/e2e/cache-leak.spec.ts` (`01` §1.3) | |
| C8 | Check `Cache-Control` on every `/account/**`, `/cart`, `/checkout/**`, `/admin/**` response | `no-store`, no public `s-maxage` | `tests/e2e/cache-headers.spec.ts` (`01` §2.4) | |
| C9 | As customer B, call `advanceCheckout` with customer A's `checkout_sessions.id` and B's own cart cookie | 404 — the row is located by `cs.cart_id = <cart from the cookie>`, and the id is only an optimistic-lock handle (§4.2) | e2e | ✓ |
| C10 | Open a data-export link twice, and open one 25 hours after it was mailed | Second use and the expired use both 404; `consumed_at` is set in the streaming transaction (§8.4) | integration | |

### 9.4 Commerce integrity

| # | Attack to attempt | Expected defence | Test | Manual |
| --- | --- | --- | --- | --- |
| D1 | Submit a checkout with `unit_final_minor: "1"` in the body | 400 from `.strict()`; the field name is on the denylist and the rejection is logged | `tests/integration/checkout-tamper.test.ts` | ✓ |
| D2 | Change the price in the admin in another tab, then complete a checkout started before it | `PriceChangedError`, zero tolerance | integration | |
| D3 | Two concurrent buyers of a one-of-a-kind piece press Pay in the same second | One order; the other gets `InsufficientStockError` **before** any payment intent exists | `tests/integration/reservation-race.test.ts` (`01` §2.7) | |
| D4 | Double-click Place Order | One order — `UNIQUE (idempotency_key)`; the second call returns the first order | integration | |
| D5 | Deliver the same webhook event twice | `ON CONFLICT (provider, provider_event_id) DO NOTHING` returns zero rows; `200` with no effects re-run | integration | |
| D6 | POST a forged webhook with no signature, and one with a valid signature for a different payload | 400 both times; `webhook_events.status = 'failed'`; nothing transitions | integration | ✓ |
| D7 | Replay a genuine, correctly-signed Stripe event captured 20 minutes ago | Rejected on the 5-minute timestamp window, and on the uniqueness index if it ever got past | integration | |
| D8 | Attach a $10 payment object to a $4,200 order | Assertion 2 fails — `envelope.amountMinor !== order.total_minor` | integration | |
| D9 | Attach a USD payment to an INR order | Assertion 3 fails — currency mismatch | integration | |
| D10 | Post a synthetic client success callback with no webhook | Order stays `pending_payment` | `tests/e2e/checkout-us.spec.ts` (`05` §4.2) | ✓ |
| D11 | Refund the same payment from two tabs simultaneously | `SELECT … FOR UPDATE` on `payments`, then `OverRefundError` on the second | integration | |
| D12 | Apply a coupon with an INR `coupon_amounts` row to a USD cart | `CouponInvalidError` — no row for the cart's currency means inapplicable, never converted | integration | ✓ |
| D13 | Brute-force gift card codes | Rate limited `giftcard:cart` 5 / 10 min and `giftcard:ip` 20 / 24 h; codes HMAC-hashed under `GIFT_CARD_CODE_PEPPER`; never echoed | integration | |
| D14 | Put `marketCode: 'IN'` in a checkout body while posting to a `/us/` URL | `.strict()` rejects the field; the market comes from `carts.market_code` cross-checked against the URL | integration | |
| D15 | Switch market mid-checkout with a full cart | `MarketChangedError`; the cart is re-priced and re-shown; no order, no intent | e2e | ✓ |
| D16 | POST `{event_name:'order_paid', revenue_minor:'99999999'}` to `/api/analytics/[market]/collect` | Rejected outright — `revenue_minor`, `currency_code`, `order_id`, `market_code` and `customer_id` are server-only on that endpoint (`02` §2.9) | integration | |

### 9.5 Injection, XSS and transport

| # | Attack to attempt | Expected defence | Test | Manual |
| --- | --- | --- | --- | --- |
| E1 | `'; DROP TABLE orders;--` in search, a product title, a coupon code, a saved-view sort field and an admin filter | Parameterised everywhere; the sort field is whitelisted; `md_app` has no DDL | `tests/integration/injection.test.ts` | ✓ |
| E2 | `<script>alert(1)</script>` in a product title, a CMS rich-text block, a customer name, a review and a wishlist name; then view it on the storefront, in the admin and in an email | Escaped in every surface. Rich text is Tiptap JSON through the allowlist renderer and never an HTML string | `tests/e2e/xss.spec.ts` | ✓ |
| E3 | Upload an SVG containing `<script>`, `onload=`, `<foreignObject>` and an external `<use href>` | `media.upload_vector` required; DOMPurify strips and reports; stored sanitised; rendered only via `<img src>`; `fl_sanitize` on delivery; sandbox CSP on the media path | `tests/integration/svg-sanitise.test.ts` (`06` §1490) | ✓ |
| E4 | Put `javascript:alert(1)` in a nav item `href` and a CMS block link | `safeUrl()` rejects the scheme | unit | |
| E5 | Put `=HYPERLINK("http://evil","x")` in a product title and export the catalogue to CSV | Cell prefixed with `'` | unit | |
| E6 | Put `\nBcc: attacker@example.com` in a value that reaches an email subject | CR/LF stripped before use (`06` §1889) | unit | |
| E7 | Verify response headers on a storefront page, a checkout page and an admin page | CSP present and correct per surface; HSTS, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, `frame-ancestors 'none'`; `X-Robots-Tag` on admin | `tests/e2e/security-headers.spec.ts` | ✓ |
| E8 | Frame the storefront and the admin panel in an `<iframe>` on another origin | Blocked by `frame-ancestors 'none'` | e2e | ✓ |
| E9 | `fetch()` any `/api/**` route from another origin and try to read the response | No `Access-Control-Allow-Origin` is ever set, so the response is unreadable | unit + manual | ✓ |
| E10 | Grep the production client bundle for the value of every server secret | No hits | `tests/unit/no-secret-in-bundle.test.ts` | |
| E11 | Set `X-Forwarded-For: 1.2.3.4` to reset a rate-limit bucket | `clientIp()` reads `x-vercel-forwarded-for` / the last XFF entry, not the client-supplied first entry | unit | |
| E12 | Rate-limit evasion from a single IPv6 allocation by rotating addresses | Keyed on the /64 prefix | unit | |
| E13 | Request `/robots.txt` and a page on a preview deployment | `Disallow: /` and `X-Robots-Tag: noindex` on every non-production environment (`01` §5.5) | e2e | |

### 9.6 Operational

| # | Attack to attempt | Expected defence | Test | Manual |
| --- | --- | --- | --- | --- |
| F1 | `UPDATE audit_logs SET …` and `DELETE FROM audit_logs` as the application role | Permission denied — the `REVOKE` in §7.4 | `tests/integration/audit-immutable.test.ts` | ✓ |
| F2 | Find any admin route that deletes or edits an audit row | None exists | manual code review | ✓ |
| F3 | Trigger every error class and inspect the response body for `AppError.context` | `context` never serialised; `message` is resolved copy (`08` §1.5) | integration | |
| F4 | Trigger a 500 in production mode and read the response | No stack trace, no SQL, no file path; a `requestId` that correlates to Sentry | e2e | ✓ |
| F5 | Search the audit log and the application logs for any value from the §7.3 denylist after exercising login, reset, OTP, refund and settings-save | No hits | `tests/unit/redact.test.ts` + manual log review | ✓ |
| F6 | Boot the app with `PASSWORD_PEPPER` unset | Process refuses to start with a named error (`01` §4) | unit | |
| F7 | Deploy with `STRIPE_WEBHOOK_SECRET` unset and complete a checkout | Checkout blocks, or the order never reaches `paid`; the Integrations panel names the missing key; no fake success anywhere (`01` §4.9) | e2e | ✓ |
| F8 | Run `npm audit --audit-level=high` and `npm audit signatures` | Clean | CI | |
| F9 | Attempt an admin page with no session, a customer session, and a staff session lacking the page's permission | Redirect to login; 403; 403 — three distinct outcomes, none of which renders the page | e2e | ✓ |
| F10 | Run the full suite against a database seeded **without** `SEED_DEMO` | No demo rows, no seeded staff account, no known password anywhere (`01` §3) | integration | ✓ |
| F11 | Dump `rate_limits` after exercising login, reset and OTP, and grep for a plaintext email address | No hits — identifier keys are keyed hashes (§5.5) | unit | |
| F12 | As `order_manager` with `order.refund`, refund above the step-up threshold on a session last second-factored an hour ago | `TotpRequiredError`; the refund proceeds only after a fresh code (§1.9) | integration | ✓ |
| F13 | Trigger a `script-src` violation on a storefront page and on `/admin` | A report reaches Sentry; the report endpoint is sampled and rate limited and cannot itself be used to flood (§5.8) | e2e | ✓ |
| F14 | As `content_editor`, POST a scraped `order.refund` action id fifty times, then read `/admin/system/audit-log` | Fifty `FORBIDDEN`s and an `access_denied` trail naming the actor and the permission (§7.2) | integration | ✓ |

---

## 10. Open questions consolidated

| # | Question | Blocks |
| --- | --- | --- |
| 1 | Named staff and their roles at launch; whether promotions need an eighth `marketing` role (§2.4) | Seeding real accounts. Nothing is invented; `create-admin.ts` makes one owner from a real address |
| 2 | India SMS provider, credentials, DLT header and approved template id (§1.8) | `sms_otp` login for the India market. Email OTP works today |
| 3 | Breached-password check at registration — wanted or not, and fail-open or fail-closed (§5.6) | An optional control and one CSP `connect-src` entry |
| 4 | Where the off-site append-only audit copy lives, and who holds those credentials (§7.4) | The only control that survives a compromised platform administrator |
| 5 | Audit retention period, and whether any of it is contractually fixed (`02` §2.9, §7.5) | Nothing is pruned until answered — the safe default, but a storage cost rather than a decision |
| 6 | Which privacy regimes apply, and the transaction-record retention period the accountant requires (§8.3) | Response deadlines and identity-verification standard for data requests. The architecture anonymises and retains the invoice either way |
| 7 | IP allowlist for `/admin/**` — wanted or not (§8.5) | Off by default; enabling it is a config change |
| 8 | Which SAQ each acquirer applies to this integration, and whether a quarterly ASV scan is required (`01` §5.8) | Card-acceptance compliance paperwork, not architecture |
| 9a | Whether `content_editor` may publish content unsupervised (§2.3, §2.5) | Nothing architectural. §2.5 grants them `cms.publish` and `journal.manage`; `06` §1.5 assumed an owner/admin gate. It is one row of `role_permissions`, changeable from `/admin/settings/roles` with no deploy |
| 9 | The step-up refund threshold per market — the amount above which a refund re-prompts for the authenticator (§1.9) | Nothing: seeded `null`, which means every refund steps up. Answering it only loosens a default that is already safe, and it is a per-currency `settings` row, never a converted figure |
