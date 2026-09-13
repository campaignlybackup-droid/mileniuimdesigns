# A. Current project analysis

_Inspection performed 2026-09-12 on the build machine (macOS, darwin 24.1.0)._

---

## A.1 Headline finding: there is no Millennium Designs repository

The build is **greenfield**. Nothing exists to preserve, extend, or avoid
destroying. The instruction "do not destroy existing useful code" is satisfied
trivially — there is no existing code for this brand.

Two directories are in scope for this session, and they are not the same thing:

| Path | What it actually is | Verdict |
| --- | --- | --- |
| `/Users/anshbhatt/Desktop/projects/Detailing spiders website` (session's primary working directory) | **A different client's project.** Static HTML site for "Detailing Spiders", an Indian PPF & ceramic-coating detailing network. | **Not the build target. Do not touch.** |
| `/Users/anshbhatt/Downloads/MD J` (additional working directory) | **Empty.** Created 2026-09-12 02:26, the same session this brief arrived in. Name reads as Millennium Designs / Jewellery. | **The build target.** |

> **ASSUMPTION (stated, low-risk, easily reversed):** Millennium Designs is being
> built at `/Users/anshbhatt/Downloads/MD J`. Building it inside the Detailing
> Spiders directory would corrupt an unrelated live client project. If the
> intended home is elsewhere, say so now — at this stage only `docs/` exists
> there and relocating is a `mv`.

### What the primary working directory contains (and why it is irrelevant here)

Detailing Spiders is a **static site generator in a single Python file**:
`build_site.py` (141 KB) holds the business data, packages, cities, FAQs and
every HTML template, and regenerates ~45 static pages — core pages, 8 location
pages, 16 city SEO landing pages, 11 blog articles, legal pages. Alongside it
sit `assets/css/style.css` (the whole design system), `assets/js/main.js`, an
optional PHP lead-capture API under `api/`, a PHP admin panel under `admin/`,
JSON lead storage under `data/`, plus `sitemap.xml`, `robots.txt` and
`.htaccess`. It is not a git repository.

**Nothing in it is reusable for Millennium Designs.** Different brand, different
market, different language, different architecture class: a static brochure
generator versus a transactional multi-market commerce platform. There is no
framework, dependency set, database, authentication, routing layer, component
system, or deployment configuration here that transfers.

---

## A.2 Verified machine constraints

These are measured, not assumed, and they bind several architecture decisions:

| Capability | Status | Architectural consequence |
| --- | --- | --- |
| Node | **v24.18.0** (nvm) | Modern runtime available; no polyfill burden. |
| npm | **11.16.0** | Package manager is npm. |
| pnpm / bun | **absent** | Do not write scripts, docs or CI that assume them. |
| Docker | **absent** | **No containerised local Postgres.** Local DB must be Prisma's own dev server or a hosted dev branch. |
| PostgreSQL locally (`psql`/`postgres`/`pg_ctl`) | **absent** | Same as above. |
| PHP | **absent** | Rules out any PHP-based admin, and confirms the Detailing Spiders admin cannot even run here. |
| Python | 3.9.6 | Incidental; not part of this stack. |
| git | 2.39.5 | Available — the project should be initialised as a repo. |
| npm registry | reachable (PONG 368 ms) | Dependency installation is fine. |
| Free disk | ~23 GiB | Adequate, not generous. `node_modules` plus image derivatives will be watched. |

The absence of Docker **and** a local Postgres together is the single most
load-bearing environment fact: it removes the conventional
`docker compose up postgres` local loop and forces an explicit decision about
local database provisioning, made in §B/§U.

---

## A.3 Relevant prior art on the same machine

`~/Downloads/aastha-silver-jewels` is a working **single-market (India)
jewellery ecommerce** build by the same author. It is not part of this project
and no code will be copied from it, but it is genuine evidence about what runs
successfully on this machine and about mistakes already paid for once.

**Its stack:** Next.js 16.3 (App Router) · React 19.2 · TypeScript 5 ·
Prisma 7.9 with `@prisma/adapter-pg` · PostgreSQL on Neon · Tailwind CSS v4 ·
Radix UI primitives · CVA + tailwind-merge · Zod 4 · react-hook-form · zustand ·
motion · embla-carousel · jose · Cloudinary · Razorpay · Vitest +
Testing Library + Playwright · ESLint 9 + Prettier · Vercel deployment.

**Its layout:** `src/app/(storefront)`, `src/app/admin`, `src/app/api`,
`src/components/{ui,storefront,admin,sections,analytics}`, one folder per domain
under `src/lib/`, `src/server/actions`, `prisma/`, `tests/`, `docs/`.

**Its 35 Prisma models** cover User, Session, Address, Category, Collection,
Product, ProductVariant, StockMovement, ProductImage, Cart, CartItem,
WishlistItem, Order, OrderItem, Payment, WebhookEvent, Coupon, Review, Campaign,
HomepageSection, Media, SeoMeta, Setting, AuditLog and related tables.

**Two lessons already banked, not to be rediscovered:**

1. Neon requires **both** a pooled connection string (for the app) and a direct
   one (for migrations). Migrations take session-level advisory locks that a
   transaction pooler does not preserve, so running them through the pooled
   endpoint hangs or fails.
2. Prisma's local dev server has a **~10 concurrent connection ceiling**.
   Connection-pool configuration and any parallel test runner must respect it,
   or integration tests will fail in ways that look like application bugs.

**Where Millennium Designs must go materially beyond it** — and therefore where
its schema is a starting reference and not a template: multi-market with
independent per-market pricing; silver-linked and hybrid pricing with an
approval-gated recalculation and full price history; Stone as a first-class
entity driving discovery; a flexible attribute system rather than a fixed
product schema; a real variant engine; inventory locations and a transaction
ledger; seven roles with granular permissions enforced server-side; a page
builder with per-breakpoint configuration, scheduling, preview and version
history; redirects; editable email templates; validating CSV import; saved
admin views; bulk and inline editing with autosave; market preview; and Stripe
alongside Razorpay behind one provider interface.

---

## A.4 Brand assets — the one real input gap

The brief supplies two logos and is emphatic that they are the identity: a green
**MILLENNIUM DESIGNS** wordmark, and a green rounded-square **M** monogram whose
second stroke is formed by a crescent arc. Both are to be used as-is — never
redesigned, restyled, distorted, or replaced by a text logo.

**They arrived as chat images, and are not on disk.** `MD J` is empty; no
matching vector or high-resolution source was found anywhere in `~/Downloads`.

> **NEEDS INPUT:** the original logo files — `.ai`, `.eps`, `.svg` or a
> high-resolution transparent `.png` for each of the wordmark and the monogram.
> Drop them into `public/brand/`. Tracing a vector from a compressed raster
> would silently alter the letterforms and the crescent's arc, which is exactly
> the redesign the brief forbids.

This blocks nothing now. It becomes blocking at the design-system phase
(favicon, header wordmark, mobile monogram, loading state, editorial watermark,
OG images). The architecture reserves `public/brand/` and treats the logo as a
supplied asset rather than a generated one.

The brand green `#009C17` and the full tonal palette are specified in the brief
and need no input.

---

## A.5 What this analysis settles

1. Greenfield build at `/Users/anshbhatt/Downloads/MD J`; the Detailing Spiders
   project is untouched and unrelated.
2. Node 24 / npm is the toolchain; no Docker and no local Postgres, so local
   database provisioning is an explicit decision, not a default.
3. A proven Next.js + Prisma + PostgreSQL + Tailwind jewellery-commerce stack
   already runs on this machine, with two deployment lessons already paid for.
4. Millennium Designs' requirements exceed that prior build in seven named
   areas, so its schema is a reference point and not a shortcut.
5. One real input gap: the vector logo source files.
