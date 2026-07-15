# Daily Chemical Usage Tracker

## What this is

A single-user, cloud-hosted chemical inventory ledger. It mimics — and
exports as PDF in the same layout as — a PDEA Register 2-13 form
("Records required of a P3/P5-IM/P6 license holders"), the paper register
Philippine precursor-chemical license holders are required to keep. Each
chemical has its own running ledger of stock-in, usage, and replenish
instances, with two automatically maintained running balances (see below).

Core ideas the implementation is built around:

- **Two independent running balances per chemical**: "Current Balance"
  (total inventory on hand — `Chemical.currentBalance` /
  `Transaction.currentBalanceAfter`) and "Current Out Balance" (the
  amount currently decanted into the smaller day-to-day working
  container — `Chemical.currentOutBalance` / `Transaction.balanceOut`).
  STOCK_IN only affects Current Balance; REPLENISH (moving stock from
  bulk into the working container) only affects Current Out Balance;
  USAGE affects both, since a real withdrawal is drawn from the working
  container and also depletes total inventory. `Transaction.balanceOut`
  is what prints in the exported PDF's "Balance (Out)" column, and
  REPLENISH rows are excluded from that export entirely — see
  `src/lib/balance.ts` for the full reasoning and
  `src/lib/pdf/chemicalDocument.ts` for the export's IN/OUT/Initial
  Stock/Balance Forwarded formulas (confirmed against a real reference
  export).
- **One shared `transactions` table, not one table per chemical.** The
  spec describes "a database per chemical," but a shared table with a
  `chemicalId` foreign key is functionally identical from the user's
  perspective (filtering by chemical = "that chemical's database") while
  staying maintainable as chemicals are added.
- **Both balance chains are stored on every transaction row at
  write-time**, not recomputed live from full history on every read. The
  ledger's source of truth is insertion order (`sequenceNo`), not the
  user-editable date fields. This is what makes backdated entries, edits,
  deletions, and the 5-year purge all safe without corrupting the running
  balances — see `src/lib/balance.ts` for the full reasoning.
- **A stock-in, a usage, and a replenish on the same calendar day are
  always separate rows.** Each transaction row only ever populates one
  field group (stock-in fields, usage fields, OR replenish fields), never
  more than one.
- **Nothing is ever hard-deleted except via the manual 5-year purge**,
  which itself forces a backup download before anything is removed.
  Archiving a chemical is a soft-delete (`isArchived`).

## Tech stack

- **Framework:** Next.js (App Router, TypeScript) — one deployable app for
  both frontend and API routes.
- **Database:** PostgreSQL via [Neon](https://neon.tech) — genuinely free
  tier (not a time-limited trial), 0.5 GB storage / 100 compute-hours per
  month, far more than this app's data volume needs.
- **ORM:** Prisma.
- **Auth:** A single admin password (bcrypt-hashed), signed HTTP-only
  session cookie via `iron-session`. No roles — this is a single-user
  tool, but it's reachable over the public internet 24/7, so it's still
  password-protected.
- **PDF generation:** `pdfmake`, rendering directly to a buffer — no
  headless browser (Puppeteer/Playwright), since the free hosting tier
  this was planned around has limited RAM that a full Chromium instance
  doesn't fit well.
- **Zipping:** `archiver`, for the bulk-export ZIP.
- **Hosting:** [Render](https://render.com) free web service tier. It's
  free indefinitely, with one tradeoff: it spins down after 15 minutes of
  no traffic and takes ~30-60 seconds to wake back up on the next request.
  That's a "slow sometimes," not "unavailable" — acceptable for
  intermittent daily use. If it becomes annoying, either upgrade to
  Render's paid Starter tier (~$7/month, optional) or ping the
  `/api/health` endpoint every 10 minutes with a free external uptime
  service (e.g. UptimeRobot, cron-job.org) to keep it warm.
- **Timezone:** All "today" auto-fill and the purge cutoff are computed
  server-side in `Asia/Manila`, not the browser's or server's local
  timezone. Set via `APP_TIMEZONE` in `.env`.

## Project structure

```
chemical-tracker/
├── prisma/
│   ├── schema.prisma        # DB schema — fully implemented
│   └── seed.ts               # seeds the one AppSettings row (admin password)
├── fonts/                    # pdfmake needs real .ttf files here — see fonts/README.md
├── src/
│   ├── middleware.ts          # route protection (redirects unauthenticated requests)
│   ├── types/index.ts         # shared TS types — fully implemented
│   ├── lib/
│   │   ├── prisma.ts          # Prisma client singleton — fully implemented
│   │   ├── apiHelpers.ts      # jsonOk/jsonError response helpers — fully implemented
│   │   ├── timezone.ts        # Asia/Manila date helpers — STUB
│   │   ├── validation.ts      # zod schemas — fully implemented
│   │   ├── auth.ts            # password hashing + session helpers — STUB
│   │   ├── balance.ts         # THE LEDGER CORE — STUB (read this file first)
│   │   ├── purge.ts           # 5-year purge prepare/confirm flow — STUB
│   │   ├── pdf/
│   │   │   ├── chemicalDocument.ts   # builds the pdfmake doc definition — STUB
│   │   │   └── pdfGenerator.ts       # renders it to a PDF buffer — STUB
│   │   └── zip/
│   │       └── bulkExport.ts  # builds the bulk ZIP — STUB
│   ├── app/
│   │   ├── layout.tsx, globals.css, page.tsx (dashboard), login/
│   │   ├── chemicals/new/, chemicals/[id]/ (detail, log-usage, log-stock-in, log-replenish, edit)
│   │   ├── admin/settings/, admin/purge/
│   │   └── api/                # one route.ts per endpoint — all STUB
│   └── components/             # reusable UI pieces — all STUB where they hold logic
└── README.md                   # this file
```

## What's implemented vs. what's a stub

Fully implemented already (infrastructure/config/declarative, not
business decisions): `package.json`, `tsconfig.json`, `next.config.js`,
`prisma/schema.prisma`, `src/lib/prisma.ts`, `src/lib/apiHelpers.ts`,
`src/lib/validation.ts`, `src/app/globals.css`, and the basic JSX
structure/layout of every page and component.

Everything else — every function whose comment header starts with `def
functionName():` — is a stub: a real signature, a detailed pseudocode
comment explaining exactly what it needs to do, and a body that just
`throw`s `Not implemented`. The app is fully wired end-to-end (imports,
routing, prop types all line up) — filling in those function bodies
according to their pseudocode is the only work left to make it run.

**Start with `src/lib/balance.ts`.** It's the ledger core everything else
depends on. Then `src/lib/auth.ts` and `src/lib/timezone.ts` (small,
needed everywhere), then the API routes (thin wrappers around the lib
functions), then the frontend pages/components, and PDF/ZIP/purge last.

## Setup walkthrough

### 1. Create a Neon database

1. Sign up at [neon.tech](https://neon.tech) (free, no card required) and
   create a project.
2. Copy the connection string from the dashboard (Connection Details ->
   "Prisma" format includes `?sslmode=require`, which you want).

### 2. Configure environment variables

```bash
cp .env.example .env
```

Fill in:
- `DATABASE_URL` — the Neon connection string from step 1.
- `SESSION_SECRET` — generate with `openssl rand -base64 32`.
- `DEFAULT_ADMIN_PASSWORD` — the password you'll log in with initially
  (change it later from the in-app Settings page).
- `APP_TIMEZONE` — leave as `Asia/Manila` unless the lab relocates.

### 3. Install dependencies

```bash
npm install
```

### 4. Add PDF fonts

pdfmake needs real font files that can't ship in this skeleton — see
`fonts/README.md` for exactly which four Roboto `.ttf` files to download
and where to place them. PDF export won't work until this is done, but
everything else will.

### 5. Run database migrations and seed the admin account

```bash
npm run prisma:migrate   # creates the tables in your Neon database
npm run seed              # creates the one AppSettings row + admin password
```

(`npm run seed` calls into `src/lib/auth.ts`'s `hashPassword()`, so that
function needs to be implemented before seeding will work.)

### 6. Run locally

```bash
npm run dev
```

Visit `http://localhost:3000`, log in with `DEFAULT_ADMIN_PASSWORD`.

### 7. Deploy

1. Push this repo to GitHub.
2. Create a new Web Service on [Render](https://render.com), pointing at
   the repo, free tier. Build command: `npm install && npm run build`.
   Start command: `npm start`.
3. Add the same environment variables from your `.env` file in Render's
   dashboard (Environment tab). Use the same Neon `DATABASE_URL` — no need
   for a separate database per environment unless you want one.
4. After the first deploy, run `npm run prisma:deploy` and `npm run seed`
   once (Render's shell tab, or run them from your local machine pointed
   at the same `DATABASE_URL`).
5. Optional: set up a free uptime pinger (UptimeRobot, cron-job.org)
   hitting `https://<your-app>.onrender.com/api/health` every ~10 minutes
   if you want to avoid the free tier's cold-start delay.

## Known open items

- ~~The exact "Initial Stock/Balance Forwarded" figure(s) on exports~~ —
  **resolved.** The reference form's two numbers are "Initial Stock" (the
  Current Balance just before the report's range) and "Balance
  Forwarded" (`IN + finalEntryBalanceOut + InitialStock - OUT`, where
  `OUT` is itself the Current Out Balance just before the range, not a
  sum of usage). Verified against a real multi-month reference export.
  See the module comment at the top of `src/lib/pdf/chemicalDocument.ts`.
- **Table print order.** The dashboard/history view is newest-first; the
  exported PDF is chronological (oldest-first), matching how a paper
  ledger reads. This is intentional and confirmed fine to differ, but
  worth knowing if it looks inconsistent at first glance.
- **Fonts.** PDF export is non-functional until the Roboto `.ttf` files
  described in `fonts/README.md` are added — they're binary files and
  can't be part of a text-based skeleton.

## Data retention

Ordinary use never deletes transaction history — chemicals are archived
(soft-deleted), not removed, and editing/deleting a transaction only
recalculates later balances, it doesn't erase the audit trail
(`editHistory` JSON field).

The one exception is the manual **5-year purge** (`/admin/purge`):
records older than 5 years can be removed from the live database to keep
it lean, but only via a two-step flow that forces a full backup ZIP
download of exactly what will be deleted *before* the deletion is
confirmed, and only ever run manually — there is no scheduled/automatic
purge. See the extensive comments in `src/lib/purge.ts` for the full
mechanics, including why one "anchor" transaction per chemical is always
retained even past the cutoff (it's what keeps future exports' opening
balance figures correct).
