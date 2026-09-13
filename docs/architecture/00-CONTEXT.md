# MILLENNIUM DESIGNS — Shared architecture context

> Read this in full before writing your section. It is the single source of
> truth for environment facts. Do not contradict it. Do not re-run the
> repository inspection — it is already done and summarised here.

---

## 1. What is being built

A complete, production-ready custom ecommerce platform + custom CMS for
**Millennium Designs**, a jewellery house with 40+ years of heritage.

- **Primary market: United States (USD).** Secondary market: India (INR).
- Both markets live from day one; the architecture must extend to UK, Canada,
  Australia, UAE, Europe **without a rebuild**.
- This is NOT a landing page, NOT a prototype, NOT a Shopify clone. It is a
  full commerce engine: catalogue, variants, inventory, customers, wishlist,
  cart, checkout, orders, payments, shipping, discounts, returns, refunds,
  multi-market pricing, silver-linked pricing, CMS with page builder, admin
  dashboard, RBAC, audit logs, version history, bulk edit, CSV import/export,
  search, filtering, SEO, analytics.

## 2. Hard product rules (violating these is an architectural bug)

1. **Database is the source of truth.** Nothing may be hardcoded in frontend
   source: products, categories, prices, stones, collections, navigation,
   homepage content, shipping rates, markets.
2. **USD and INR prices are INDEPENDENT.** Editing USD must NOT recompute INR
   and vice-versa. There is NO automatic FX conversion between market prices.
3. **Server is the only authority** on price, discount, inventory, shipping,
   tax, totals, market, and payment success. Never trust a frontend value.
4. **Order immutability.** Order lines snapshot price/currency/market/product
   info at purchase time. Later price edits or product deletion must not alter
   historical orders.
5. **No overselling**, especially One-of-a-Kind (inventory = 1). Two concurrent
   buyers must not both succeed. Requires transactional reservation.
6. **Changing the silver market price must NOT change live customer prices**
   unless an admin explicitly enables and approves that recalculation.
7. **No fake functionality.** No fake checkout/payment/orders/analytics/
   inventory. If an integration is not configured, build the real integration
   architecture and surface configuration status clearly.
8. **No invented business facts.** Do not fabricate awards, celebrity clients,
   certifications, founder history, specific locations, factories,
   sustainability claims, guarantees, customer counts, countries, or historical
   years. All such content is CMS-controlled and seeded blank or as clearly
   marked demo content.
9. **Backend must enforce permissions.** Hiding UI is not authorization.
10. **Money is never a float.** Use integer minor units + currency code.

## 3. Environment — VERIFIED FACTS (do not assume otherwise)

Inspected on the build machine (macOS, darwin 24.1.0):

| Thing | Status |
| --- | --- |
| Node | **v24.18.0** (via nvm) |
| npm | **11.16.0** |
| pnpm / bun | **NOT INSTALLED** |
| Docker | **NOT INSTALLED** |
| Local PostgreSQL (`psql`, `postgres`, `pg_ctl`) | **NOT INSTALLED** |
| PHP | **NOT INSTALLED** |
| Python | 3.9.6 |
| git | 2.39.5 |
| npm registry | reachable |
| Free disk | ~23 GiB |

**Consequence:** local development cannot assume a Docker Postgres or a system
Postgres. The viable local database paths are (a) Prisma's own local dev server
(`prisma dev`), or (b) a hosted Neon development branch. Both are used by the
sibling project. **Known caveat: `prisma dev` has a ~10 concurrent connection
cap** — connection-pool settings and any parallel test runner must respect it.

## 4. Repository state

- The session's primary working directory is a **different client's project**
  ("Detailing Spiders", a static HTML site). It is unrelated and must not be
  touched or used as a base.
- The Millennium Designs project directory is `/Users/anshbhatt/Downloads/MD J`
  — it was **empty**. This is a **greenfield build**. There is no existing
  framework, dependency set, frontend, backend, database, auth, route, asset or
  deployment config to preserve.
- Not currently a git repository.

## 5. Prior art on the same machine — `~/Downloads/aastha-silver-jewels`

A working single-market (India) jewellery ecommerce build by the same author.
Treat it as a **proven-on-this-machine reference for stack choices and for
lessons learned**, NOT as a codebase to copy and NOT as a ceiling.

Its stack: Next.js 16.3 (App Router) · React 19.2 · TypeScript 5 · Prisma 7.9
with `@prisma/adapter-pg` · PostgreSQL (Neon) · Tailwind CSS v4 · Radix UI
primitives · `class-variance-authority` + `tailwind-merge` · Zod 4 ·
react-hook-form · zustand · motion · embla-carousel · jose (JWT) ·
Cloudinary (media) · Razorpay (payments) · Vitest + Testing Library + Playwright
· ESLint 9 + Prettier · deployed on Vercel + Neon.

Its layout: `src/app/(storefront)/…`, `src/app/admin/…`, `src/app/api/…`,
`src/components/{ui,storefront,admin,sections,analytics}`, `src/lib/<domain>/`
(auth, cart, cms, coupons, email, inventory, orders, payments, ratelimit, seo,
storage, …), `src/server/actions`, `prisma/`, `tests/`, `docs/`.

Its Prisma models: User, Session, OtpRequest, RateLimit, Address, Category,
Collection, ProductOnCollection, Product, ProductVariant, StockMovement,
ProductImage, ProductFaq, Cart, CartItem, WishlistItem, Order, OrderItem,
Payment, WebhookEvent, Coupon, CouponUsage, Review, Campaign, HomepageSection,
Media, Faq, SeoMeta, Setting, NewsletterSubscriber, Notification, AuditLog,
ComboOffer, ComboItem.

**Where Millennium Designs must go materially further than that project:**
multi-market (US + India + future) with independent per-market pricing;
silver-linked and hybrid pricing with price history; a first-class Stone
entity with stone-led discovery; a flexible EAV-style product attribute system;
a real variant engine; inventory locations + inventory transactions; granular
RBAC with 7 roles; a full page builder with per-breakpoint (desktop/tablet/
mobile) configuration; content version history with restore; redirects;
editable email templates; CSV import with validation preview; saved admin
views; bulk + inline editing with autosave; market preview; Stripe (US)
alongside Razorpay (India) behind a provider abstraction.

**Deployment lesson from that project (already learned, do not rediscover):**
Neon needs BOTH a pooled connection string (for the app) and a direct one (for
migrations) — migrations take session-level advisory locks that a transaction
pooler does not preserve, so running them through the pooled endpoint hangs.

## 6. Brand facts

- Name: **MILLENNIUM DESIGNS**. Creative idea: **"HERITAGE, REFINED."**
- Two official logos supplied by the client: a green **MILLENNIUM DESIGNS**
  wordmark, and a green rounded-square **M** monogram (the second "leg" of the
  M is formed by a crescent/arc, reading as an M with a circular counter). They
  must be used as-is, never redesigned, restyled, distorted or replaced by a
  text logo. **Caveat: the vector source files are not yet on disk** — they
  arrived as chat images. Architecture must define where they live
  (`public/brand/`) and how they are used; production fidelity requires the
  client's original vector/high-res files.
- Palette: primary green `#009C17`; deep emerald `#003D1F`; forest `#062E1B`;
  dark green `#082519`; almost-black green `#06130D`; warm ivory `#F7F4EC`;
  soft ivory `#FCFAF5`; warm stone `#E8E2D7`; muted taupe `#B9B1A3`; charcoal
  `#171815`; restrained metallic accents champagne `#C8B27A`, antique gold
  `#A88C55`. Gold is an accent only — never a green-and-gold wedding aesthetic.
- Type: max two families — an editorial high-contrast serif (e.g. Cormorant
  Garamond) for headlines, and a refined neutral sans (e.g. Inter / Manrope /
  DM Sans) for UI, product data, prices, forms.
- Customer-facing category spellings: **CHAINS, RINGS, PENDANTS, BRACELETS,
  EARRINGS, STONES, CLOSEOUTS, ONE OF A KIND, 14K GOLD, LAB GROWN DIAMONDS.**
  Categories are database-driven; admin can add more.
- Initial stones: **Moonstone, Amethyst, Labradorite, Blue Topaz, Larimar,
  Garnet, Pearl.** Stone is a first-class entity with its own pages and
  stone-led discovery (`/stones/<slug>` filtered by jewellery type).
- Initial metals: 14K Yellow / White / Rose Gold, plus silver — via a flexible
  **Material** entity, not an enum frozen at three values.

## 7. Style rules for your written section

- Write Markdown. Be specific and decision-committing: name the table, the
  column, the type, the index, the route, the function signature. "We should
  consider…" is a failure; "`orders.total_minor BIGINT NOT NULL`" is the bar.
- State trade-offs briefly where a real fork exists, then **pick one** and say
  why.
- Flag anything that needs a decision or credential from the client as a short
  `> **NEEDS INPUT:**` callout rather than inventing an answer.
- Do not restate this context file. Do not pad. No filler preambles.
- Assume the reader is the engineer who will implement it tomorrow.
