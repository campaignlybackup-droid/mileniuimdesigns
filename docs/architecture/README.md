# Millennium Designs — Architecture

The technical plan for the Millennium Designs ecommerce platform and custom CMS.
Written before implementation, verified against itself, and intended to be the
thing an engineer builds from rather than a document that describes a build.

**Project root:** `/Users/anshbhatt/Downloads/MD J` · **Status:** architecture
complete, implementation not started.

> **Cross-document reconciliation is complete.** All 29 contradictions found in review
> are closed, the seven set-level decisions in `99` are expressed consistently in every
> document that touches them, and all 82 cross-file `CHANGE REQUIRED` callouts have been
> absorbed into their target documents — they now read `RESOLVED — was CHANGE REQUIRED`
> and are kept as provenance. `job_kind` has full parity between `02` §1.9 and `11` §3`.
>
> What remains is **106 `> **NEEDS INPUT:**` callouts** — client decisions and
> credentials, not engineering work. The ones that block are listed at the bottom of
> this file.

---

## Read in this order

| # | Document | Covers | Read it when |
| --- | --- | --- | --- |
| — | [`00-CONTEXT.md`](00-CONTEXT.md) | Verified environment facts, the ten hard product rules, brand facts, prior art | **First, always.** Every other document assumes it. |
| A | [`0A-current-project-analysis.md`](0A-current-project-analysis.md) | What existed before this build, the machine's real constraints, the one input gap | Before choosing anything |
| B C D U | [`01-stack-and-structure.md`](01-stack-and-structure.md) | Technology stack, system layering, folder tree, env vars, deployment | Setting up the repo |
| E F | [`02-database-schema.md`](02-database-schema.md) | Every table, column, type, constraint, index; ER diagrams; seed plan | Writing the first migration |
| I | [`03-catalog-architecture.md`](03-catalog-architecture.md) | Products, variants, the attribute system, stones, materials, collections, tags | Building the catalogue |
| J K | [`04-pricing-and-markets.md`](04-pricing-and-markets.md) | The pricing engine, three pricing modes, metal rates, price history, markets | **The most commercially dangerous document.** Read it twice. |
| L M | [`05-commerce-engine.md`](05-commerce-engine.md) | Inventory, cart, checkout, orders, payments, shipping, discounts, returns | Building anything that touches money or stock |
| H | [`06-cms-architecture.md`](06-cms-architecture.md) | Content model, block registry, page builder, media pipeline, versioning | Building the CMS |
| N O | [`07-auth-and-security.md`](07-auth-and-security.md) | Authentication, RBAC, the permission matrix, the security architecture | Before exposing any route |
| G P Q R | [`08-api-seo-routes.md`](08-api-seo-routes.md) | Service layer, API surface, SEO, storefront and admin route maps, search | Wiring routes to services |
| S T | [`09-phases-and-risks.md`](09-phases-and-risks.md) | The phase plan with exit criteria, the test architecture, risks, definition of done | **Planning the work.** Start here on day one. |
| — | [`10-design-system.md`](10-design-system.md) | Creative direction, tokens, typography, components, motion, the two review gates | Building anything a customer sees |
| — | [`11-registries.md`](11-registries.md) | The canonical vocabulary: permissions, error codes, job kinds, cron, enums, whitelists | **Any time you name something.** It is the source of truth. |
| — | [`13-admin-operations.md`](13-admin-operations.md) | Data tables, saved views, inline and bulk editing, CSV import, ⌘K, danger zones | Building the admin |
| — | [`14-reporting.md`](14-reporting.md) | The reporting module, dashboard tiles, charts, jewellery-specific analytics | Building the dashboard |
| — | [`15-customer-and-commerce-gaps.md`](15-customer-and-commerce-gaps.md) | Customer groups, gift-card issuance, reviews, preview intersection, notify-me | Filling the remaining feature surface |
| — | [`99-REVIEW-FINDINGS.md`](99-REVIEW-FINDINGS.md) | The cross-document critic's work list | Auditing what was fixed. **Delete when closed.** |

---

## The ten rules everything else serves

Lifted from `00-CONTEXT.md` because breaking one of these is not a bug, it is a
wrong platform:

1. The database is the source of truth. Nothing is hardcoded in frontend source.
2. **USD and INR prices are independent.** No automatic conversion, ever, in
   either direction — including via a metal rate, a coupon, a shipping
   threshold, or a gift card.
3. The server is the only authority on price, discount, inventory, shipping,
   tax, totals, market and payment success.
4. Orders snapshot everything. A later price edit or product deletion must not
   change history.
5. No overselling — especially One of a Kind. Two concurrent buyers, one piece,
   exactly one winner.
6. A metal-rate change must **not** move live customer prices without explicit
   admin approval.
7. No fake functionality. An unconfigured integration shows its real status; it
   never fakes success.
8. No invented business facts. Empty CMS fields hide their section rather than
   display something made up.
9. The backend enforces permissions. Hidden UI is not authorization.
10. Money is never a float — integer minor units plus an explicit currency.

---

## How this document set was produced

Written by specialist agents, then attacked. Every document went through an
adversarial verification pass whose job was to find the concrete scenario in
which it fails in production — not to praise it. A final cross-document critic
then reviewed the set for the failure no per-document reviewer can see: drift
between documents.

**281 defects were found and fixed in the documents before any code was
written**, 53 of them critical. A representative sample of what that caught:

- Silver-linked pricing that was secretly performing a USD↔INR conversion.
- A `500 OFF` coupon that would fire as `$500` when the merchandiser meant `₹500`.
- Discounts applied per-unit then multiplied, producing line totals that fail
  the order's own CHECK constraint — losing the order at the till.
- India's tax-inclusive market being taxed a second time.
- US tax never quoted before the payment intent was created.
- A market cookie that would bake INR prices into the US CDN cache.
- A One-of-a-Kind piece sellable twice by holding quantity 1 at two locations.
- Every made-to-order product permanently unbuyable at the last click.
- An order-confirmation email that would never send, from the first paid order.
- A job queue that was a permission escalator.
- A preview link that leaked the entire unpublished site.
- Media "usage" that would let an admin delete the live homepage's hero image.

The full critic work list is in [`99-REVIEW-FINDINGS.md`](99-REVIEW-FINDINGS.md).

---

## What the client still has to supply

These are recorded as `> **NEEDS INPUT:**` callouts throughout. The ones that
block real work:

| Needed | Blocks | Lead time |
| --- | --- | --- |
| **Original vector logo files** (`.svg`/`.ai`/`.eps`) for the wordmark and monogram | The design system, favicon, OG images, email headers. Currently placeholders. | Client has them |
| **Stripe (US) and Razorpay (India) accounts** — keys, webhook secrets, which entity settles USD | Taking any money | **Days — KYC** |
| **The real catalogue** — titles, copy, weights, photography, and the independent USD and INR price per variant | Launch. Everything built is structure. | Client effort |
| Production domain, registrar and DNS access | Deployment, email authentication | Hours |
| Cloudinary + email sending domain | Media and transactional mail | Minutes + DNS |
| US sales-tax nexus states; India GST treatment and GSTIN | Correct tax at checkout | Accountant |
| The high-value manual-review threshold, per market, in writing | A hard launch blocker in `09 §5.1` | Client decision |
| Metal-rate data source, and whether it can quote in **both** USD and INR | Metal-linked pricing (manual entry works without it) | Client decision |

No business fact, historical date, customer claim, certification or location has
been invented anywhere in this document set. Where the client has not supplied
something, the field is seeded empty and its section does not render.
