# BillWill — Project Notes

Working notes for the BillWill app: how it's built, what's done, what's pending,
and the commands to run and deploy it. Kept for quick reference.

> **Heads up:** the `.env` files hold live secrets (MongoDB URI, Clerk secret
> key). They are gitignored and must never be committed. Don't paste their
> contents anywhere. See "Security to-dos" at the bottom.

---

## 1. What BillWill is

A bill, subscription and installment (EMI) tracking dashboard. Dark-mode-first,
INR currency. Originally a mock-only frontend called **BillFlow**; now a full
**MERN** app, rebranded to **BillWill**, deployed on a custom domain.

- **Live frontend:** https://billwill.site (and https://www.billwill.site)
- **Live API:** https://billflow-api-96to.onrender.com
- **Deploy repo (watched by Vercel + Render):** `raj3176/billwill` — remote `personal`
- **Old origin repo:** `BonjourCloud/billflow-dashboard` — remote `origin`

---

## 2. Architecture (three pieces)

| Piece | Tech | Host | Port (local) |
|---|---|---|---|
| Frontend | React 18 + TS + Vite 5, Tailwind, shadcn/ui, Framer Motion, Recharts, TanStack Query | **Vercel** | 8080 |
| Backend (`server/`) | Node + Express 5 + Mongoose, zod | **Render** | 5001 |
| Database | MongoDB (Atlas) | MongoDB Atlas | — |
| Auth | Clerk (`@clerk/react` frontend, `@clerk/express` backend) | Clerk (hosted) | — |
| File storage | AWS S3 (optional — branding logo uploads) | AWS S3 | — |

**Data flow:** browser → Clerk session token (`Authorization: Bearer`) → Express
API → MongoDB. CORS + Clerk `authorizedParties` are both pinned to `CLIENT_URL`.

---

## 3. Local setup

Two terminals (frontend + backend), two `.env` files.

```sh
# one-time install
npm install                 # frontend deps (root)
npm install --prefix server # backend deps

# env files (create from examples, then fill in real values)
cp .env.example .env.local          # frontend: VITE_CLERK_PUBLISHABLE_KEY, VITE_API_URL
cp server/.env.example server/.env  # backend: MONGODB_URI, CLERK keys, etc.
```

Run (two terminals):

```sh
npm run dev --prefix server   # API  -> http://localhost:5001
npm run dev                   # web  -> http://localhost:8080
```

### Env vars

**Frontend** (root `.env` / `.env.local`; only `VITE_`-prefixed vars reach the browser):
- `VITE_CLERK_PUBLISHABLE_KEY` — Clerk `pk_test_…` / `pk_live_…`
- `VITE_API_URL` — API origin. Local falls back to `http://localhost:5001`; prod is `https://api.billwill.site` (or the raw Render URL `https://billflow-api-96to.onrender.com`)
- `VITE_GA_MEASUREMENT_ID` — optional GA4 id (`G-XXXXXXXXXX`); set in Vercel Production only, enables analytics (see §6e). Build-time: redeploy after changing.

**Backend** (`server/.env` — secrets, never committed):
- `MONGODB_URI` — Atlas connection string (local uses db `billflow-dev`)
- `CLERK_SECRET_KEY` (`sk_…`), `CLERK_PUBLISHABLE_KEY` (`pk_…`, same as frontend)
- `CLIENT_URL` — allowed frontend origin(s), comma-separated, no path. Prod: `https://billwill.site,https://www.billwill.site`
- `NODE_ENV`, `PORT` (5001), `TRUST_PROXY` (0 local, 1 on Render)
- `ADMIN_CLERK_USER_IDS` — comma-separated Clerk `user_…` IDs that are always admin
- `DEMO_CLERK_USER_ID` — the single Clerk `user_…` id for the demo account (see §6c). Optional; enables demo mode when set. **Must not also appear in `ADMIN_CLERK_USER_IDS`** or the API refuses to start.
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `AWS_S3_BUCKET` — optional, for logo uploads

The API validates all env vars at boot (`server/src/config/env.ts`) and exits
with a clear message if any are missing/malformed.

Current bootstrap admin: Rajiv V (itsrajivv@gmail.com), Clerk ID
`user_3LE9Nq5ffGW6VXvPix5I9iF7xjU`.

---

## 4. Common commands

```sh
# frontend
npm run dev              # dev server (8080)
npm run build            # production build (validates VITE_API_URL is https in prod)
npm run typecheck        # tsc across app/node/test/e2e configs
npm run lint
npm run test             # vitest run
npx vitest run src/test/<file>.test.ts   # one test file

# backend
npm run dev --prefix server      # tsx watch (5001)
npm run build --prefix server    # tsc -> dist/
npm start --prefix server        # node dist/index.js (prod style)

# API health checks
curl http://localhost:5001/api/health   # liveness + db state
curl http://localhost:5001/api/ready    # 200 only when Mongo connected
```

### Clerk CLI (run `npx -y clerk@latest auth login` first)

```sh
npx -y clerk@latest link --app <app_id>   # link project to a Clerk app
npx -y clerk@latest env pull               # write dev keys to .env.local
npx -y clerk@latest users list --json      # find a user's user_... ID
```

Linked Clerk app: `app_3LE75HJLJU9PqtyY2upg0TFHpLy` ("BillWill").

---

## 5. Git & deploy workflow

Two remotes. **Vercel and Render deploy from `personal` (`raj3176/billwill`).**

```sh
git remote -v
# origin   -> github.com/BonjourCloud/billflow-dashboard
# personal -> github.com/raj3176/billwill   <-- deploy repo

# normal flow for a frontend change:
git add <files>
git commit -m "..."
git push personal main        # Vercel auto-rebuilds; API needs no redeploy
# then hard-refresh billwill.site (Ctrl+Shift+R)
```

- **Frontend changes** → push to `personal`, Vercel rebuilds automatically.
- **Backend changes** → Render rebuilds from `personal` too (root dir `server/`).
- Never commit `.env` / `server/.env` / `.env.local` (gitignored).

### Known deploy gotcha — stale chunk / MIME error

If a lazy-loaded route (e.g. `/admin/pricing`) throws:
`Failed to load module script ... MIME type "text/html"`, it means Vercel served
a stale `index.html` referencing JS chunk hashes that no longer exist. **Fix:**
confirm the latest commit deployed, then **Vercel → Deployments → Redeploy**
(uncheck build cache) and hard-refresh. Not a code bug.

`VITE_*` vars are build-time — after changing them in Vercel, a redeploy is
required.

---

## 6. Features in the app

### Public / landing
- Landing page (`src/pages/Landing.tsx`): hero, Features, Pricing, Why BillWill,
  Sign In / Get Started. Branding (name, logo, hero copy) and pricing tiers are
  admin-managed.

### Auth
- Clerk sign-in/sign-up. Protected routes via `ProtectedRoute`; admin routes via
  `AdminRoute`.

### Dashboard (`/dashboard`)
- **Monthly Flow (HeroWidget):** total spend scoped to **one month at a time**
  with a month switcher (‹ › arrows + "This month"). Paid/Pending/Overdue +
  progress bar for that month. Carry-over: current month also includes unpaid
  bills from earlier months. Future months project expected recurring bills
  (see §7). Default view: October 2026.
- **Upcoming Bills** widget — next pending bills (uses all bills).
- **Spending by Category** chart (Recharts) — click a bar to filter the table.
- **Smart Insights** (`AIInsightsWidget`, renamed from "AI Insights") — rule-based
  insights, e.g. duplicate subscriptions. No external AI.
- **Bill Hub** table — search, filter by status/category, sort; add/edit/delete
  via dialog. Reordered to appear before the spending chart.
- **Bill dialog** due-date uses a shadcn Calendar + Popover picker (not the native
  date input).

### Bills
- One-time and monthly recurring bills (recurring series auto-create monthly
  bills, month-end clamping: day 31 → 28/29/30).
- Per-bill payment history (full/partial, duplicate-protected) and timestamped notes.
- Bill detail page (`/bill/:id`).

### Subscriptions (`/subscriptions`)
- Recurring series that generate monthly bills; create/edit/cancel/delete with scope.

### Installments / EMI (`/installments`, `/installments/:id`)
- Plans with schedule, interest, remaining balance; updates as payments come in.

### Notifications
- In-app reminders for bills due within 5 days or overdue; bell with unread count,
  mark-read, dismiss.

### Categories
- Color-coded categories (Utilities, Entertainment, Software, Finance, Insurance,
  Housing, Loans & EMI, …) used across bills/subs/EMIs. Managed in admin.

---

## 6b. Budget Phase 1 (commit `e5d6936`)

Adds income tracking, per-category budgets, a cash-flow view, and category
"kinds". Frontend + backend (so this one **needs a Render redeploy**).

**New backend models/API:**
- `server/src/models/IncomeSource.ts` — income sources (one-time or monthly,
  with received-cycle tracking and a "count in plan" flag).
- `server/src/models/Budget.ts` — per-user, per-category spend limit (unique on
  `userId + category`).
- API routes under `/api/income-sources`, `/api/budgets`, `/api/budget-settings`
  (plus the admin category routes gained a `kind` field).

**Category kinds (need / want / savings):**
- `Category.kind` added (`need` | `want` | `savings`). Default seed marks
  entertainment/software as `want`, `savings` as `savings`, the rest `need`.
- A `savings` category (e.g. "Savings & investments") makes its bills count as
  **saved** rather than spent in the cash-flow math.

**Cash-flow logic (`src/lib/cashFlow.ts`, tested in `budget-cashflow.test.ts`):**
- `computeCashFlow` → income, received, bills, saved, free (income − bills −
  saved), savings rate, bills share, EMI ratio.
- `incomeOccurrencesForMonth` projects income per month (monthly sources clamp
  to month length; future months computed, not stored — like recurring bills).
- `budgetRows` / `kindSummaries` → per-category usage (ok/warn/over at 80%) and
  50/30/20-style need/want/savings targets vs spend.
- `isEmiBill` → a bill is an EMI if it has a `planId` or is in the Loans category.

**Frontend:** budget pages (`src/pages/budget/`), budget components
(`src/components/budget/`), `CashFlowCard` on the dashboard, `useBudget` /
`useMonthBills` / `useMonthSelector` hooks, and a `ChunkErrorBoundary` +
`chunkReload` helper that auto-recovers from the stale-chunk error after a deploy.

**Note:** the `savings` category is seeded only into an **empty** DB. Existing
databases must add "Savings & investments" (kind Savings) via Admin → Categories.

---

## 6c. Demo account (commit `fde5ea3`)

A shared, resettable demo account so BillWill can be shown to others without
exposing real data. Full guide in `docs/DEMO.md`.

**How it's gated:** a single Clerk user, identified by the backend env var
**`DEMO_CLERK_USER_ID`** (`user_…`). When unset, the demo is simply off and the
app behaves as before. The demo buttons appear only when the API reports it's
enabled.

- **Must NOT also be in `ADMIN_CLERK_USER_IDS`** — the server refuses to start if
  the same id is in both. The demo user can never be an admin.
- Current setup: demo user created in Clerk (e.g. `demo@billwill.site`),
  `DEMO_CLERK_USER_ID` set on Render, API redeployed. (Done.)

**Visitor experience:**
- "Try the demo" button on the landing page + "explore the demo account" link on
  sign-in. One click — no credentials typed.
- Sign-in uses a Clerk **ticket** (`signIn.create({ strategy: 'ticket' })`); the
  API issues a 60-second one-time sign-in ticket via a public, rate-limited
  endpoint (20 / 15 min per IP).
- A banner on every signed-in page: sample data, shared, reset daily, with
  **Reset demo data** and **Exit demo** buttons.

**Seeded dataset** (`buildDemoDataset`, pure + unit tested): dates relative to
"today" so it always looks current. Covers income (counted / uncounted /
one-time), recurring bills + subscriptions (incl. a cancelled one), installment
plans (active + completed), paid / part-paid / overdue / due-soon bills, notes,
payments, budgets in every status (ok/warn/over), and the 50/30/20 split.

**Reset paths:** banner button, Admin → Overview card, automatic when >24h old,
or `npm run seed:demo` locally (needs `MONGODB_URI` + `DEMO_CLERK_USER_ID` in
`server/.env`). A reset deletes **only** the demo user's data; a second reset
within 10s is declined.

**Key files:** `server/src/services/demoService.ts` (build + reset + freshness),
`server/src/scripts/` (seed script), `src/hooks/useDemo.ts`,
`src/components/DemoBanner.tsx`, demo login wiring in `Login.tsx` / `Landing.tsx`
/ `AuthContext.tsx`, `ChunkErrorBoundary` recovery. Tests:
`src/test/demo-data.test.ts` (48), `src/test/integration/demo.test.ts`, plus a
fullstack e2e journey.

> **Safety:** the demo account is public and shared — anyone can sign into it and
> edit/delete its data, visible to the next visitor until reset. Never enter real
> info. Keep Admin → Users off-screen when presenting (it lists real emails).

---

## 6d. Phase 2 — Log a spend & Goals (commit `d5eec0f`, e2e fix `ada319b`)

Two features. Frontend-heavy; **Goals adds a backend model/API** so it needs a
Render redeploy (done).

**Log a spend (QuickSpend):** a round FAB at the bottom-right of every signed-in
page (`src/components/QuickSpend.tsx`, mounted in `DashboardHeader`). Enter
amount, category, date, optional note. It saves as an **already-paid bill dated
that day**, so budgets and Free to spend update immediately. No backend change —
reuses the existing bills API.

**Goals (Budget → Goals):** name + target amount + target date → BillWill computes
the monthly amount (e.g. ₹1,35,000 over 4 months = ₹33,750/mo). Each goal shows
progress and a status (on track / behind plan / funded / paused / past target
date), an **In plan** switch, and an **Add money** button.
- New backend model `server/src/models/Goal.ts` + `/api/goals` routes.
- Frontend: `src/pages/budget/GoalsTab.tsx`, `src/hooks/useGoals.ts`,
  `src/lib/goals.ts`, `src/data/goals.ts`.
- **Cash Flow card**: each active in-plan goal's monthly amount is subtracted
  from **Free to spend**, and the card shows a "Goals" figure. **Add money** only
  records progress (money was already reserved by the plan), so Free to spend
  doesn't drop twice.

**Demo:** now seeds **4 goals** (one each: on track, behind plan, funded, paused)
and the one-off ₹33,750 school-fee bill was removed (the goal replaces it). After
a demo reset, Free to spend is ~₹6,500/mo (goals reserve ~₹15,250) — expected.

**Tests:** 19 goals unit tests (`src/test/goals.test.ts`), goals integration
(`src/test/integration/goals.test.ts`), and two new fullstack browser journeys.
Local run: lint ✅, 480 unit ✅, 233 integration ✅ (the 3 Windows-only
`deploy-readiness` failures are unrelated).

**e2e harness fixes (two rounds):**
- `ada319b` — the fullstack webServer *crashed* in CI because the demo-session
  feature calls `clerkClient.signInTokens.createSignInToken(...)`, and the harness
  stubbed it with a direct assignment, rejected by Clerk's lazy Proxy `set` trap
  (`'set' on proxy: trap returned falsish`). First patched with
  `Object.defineProperty`, which got it to *boot*.
- `ec2504c` — superseded that. Two real test-code bugs: (1) the sign-in-ticket
  stub still wasn't read by the app's Clerk client (it hit real Clerk →
  "Unauthorized"), so it's now patched **in place** on the resolved
  `clerkClient.signInTokens.createSignInToken` (same pattern as the `users`
  stub); (2) the "creates a bill" journey typed into the Due Date field, but that
  is the **calendar popover button** (see §9 / BillDialog), not a text box — a
  `pickDueDate()` helper now opens the calendar and clicks today. Harness boots
  clean locally; browser assertions run in CI.

**Phase 2 limitations:** the 50/30/20 summary does not count goal money as
savings; a logged spend appears in the bills list as a paid bill (no separate
list); household sharing deferred.

---

## 6e. Google Analytics (commit `1eac57a`)

Opt-in GA4, frontend-only. Full guide in `docs/ANALYTICS.md`.

- **Gated by `VITE_GA_MEASUREMENT_ID`** (a `G-XXXXXXXXXX` id). When unset, no
  analytics loads — so dev/preview stay clean. Set it only for **Production**.
- **Build-time var:** baked into the bundle at build, so changing it requires a
  **frontend redeploy** (not just an env edit). It's set in Vercel → Production.
- Wiring: `src/lib/analytics.ts` (`initAnalytics` + `trackEvent`), called from
  `src/main.tsx`; `useDemo.ts` fires a `demo_started` event on demo entry. Tested
  in `src/test/analytics.test.ts` (5 tests).
- **Verify:** open billwill.site in a browser with **no ad blocker** →
  GA → Reports → Realtime (appear within ~1 min). If empty, check DevTools →
  Network for `gtag/js` or `google-analytics.com/g/collect`; absence means the id
  wasn't baked in (env var missing at build) → re-set in Vercel and redeploy.

---

## 6f. Recurring end dates + API performance (commit `6e5482f`)

Two things in one delivery. **Backend changes → deploy Render before Vercel.**
Full write-up in `docs/PERFORMANCE.md`.

**Recurring end dates ("Ends" on a recurring bill):** a recurring bill/series
can now stop after N payments or on an end date (e.g. a loan that runs 12 EMIs).
- `src/lib/recurrenceEnd.ts` (+ `recurrenceEnd.test.ts`, 9 tests): pure
  `yyyy-MM-dd`/UTC helpers — `lastPaymentDate(first, day, N)` and
  `paymentsUntil(first, day, end)`, capped at `MAX_RECURRING_PAYMENTS = 600`
  (50 yrs). Month-end clamping mirrors the server (31st → last day of short months).
- UI in `src/components/dashboard/BillDialog.tsx` (the "Ends" choice).
- Server honors the end in `recurrenceService.ts` / `reminderService.ts` /
  `index.ts`; integration test `src/test/integration/recurring-end-date.test.ts`
  (5 tests) against real Mongo.

**API performance:** `warmUpApi()` (in `src/lib/api.ts`, called from `main.tsx`)
pings the API on load to wake Render's free instance / warm the connection;
request batching reduces round-trips (`query-batching.test.ts`, 7 tests).

Verified on Node 24 before push: unit 16/16, integration 5/5, app + server
typecheck clean.

> **NOTE — PWA was NOT included.** The same delivery bundled a separate PWA
> feature (service worker, manifest, offline page, icons, `src/lib/pwa.ts`), which
> we intentionally left out per request. Its PWA edits to `index.html`/`vercel.json`
> had reverted the favicon fix and removed the OG/WhatsApp preview tags, so those
> were reverted and `registerServiceWorker()` stripped from `main.tsx`. The PWA
> files (+ `billwill-pwa.zip`) remain **untracked** in the working tree for a
> future clean PWA commit — must re-apply without clobbering favicon/OG again.

---

## 7. Monthly Flow month logic (recent work)

Two frontend-only changes, built around `src/lib/billMonth.ts` (+ `bill-month.test.ts`):

1. **Single-month scoping + switcher + carry-over** (commit `620e43f`):
   totals scoped to the selected month; current month also counts unpaid bills
   from earlier months ("Includes N unpaid bill(s) from earlier months"); paid
   past bills excluded; past/future months show only that month's bills.

2. **Project expected recurring bills into future months** (commit `2be5d11`):
   the app only creates real recurring bills up to next month, so later months
   were missing rent/electricity/etc. For any month after the current one,
   Monthly Flow now adds an *expected* bill per active recurring series — counted
   as Pending, **not saved to the DB** — with a note "Includes N expected
   recurring bills not yet created". Respects skip/pause/cancel and start/end
   dates; no double-count when the real bill already exists.

---

## 8. Admin panel (`/admin`, admin-only)

Sidebar: Overview, Users, Pricing, Categories, Branding, Theme.

- **Overview** — admin summary counts.
- **Users** (`/admin/users`) — lists all Clerk users with roles; grant/revoke
  admin. Bootstrap admins (from `ADMIN_CLERK_USER_IDS`) can't be self-revoked.
- **Pricing** (`/admin/pricing`) — CRUD pricing tiers shown on the landing page.
- **Categories** (`/admin/categories`) — CRUD categories (name, color, hide/show).
  Hiding stops new use without touching existing bills.
- **Branding** (`/admin/branding`) — brand name, logo, landing hero copy. Logo via
  S3 upload **or** paste an `https://` URL. Logo is runtime (DB + S3), not a repo file.
- **Theme** (`/admin/theme`) — primary/accent/background HSL colors + font pair.

Admin access is granted two ways: env bootstrap (`ADMIN_CLERK_USER_IDS`, resolved
every request) or UI grant (stored in MongoDB).

---

## 9. Logo, favicon & social preview

There are THREE separate "logo" surfaces — don't confuse them:

**1. Branding logo (in-app header/landing) — runtime, set in Admin.**
- `public/billwill-logo.png`, served by Vercel at
  **`https://billwill.site/billwill-logo.png`**. Set as the branding logo by
  pasting that URL into **Admin → Branding → "…or paste an image URL"** + Save
  (server only accepts `https://`). Stored in DB `site_settings`
  (`logo_display_url` / `logo_url`); the `public/` file is just where the URL points.
- Self-hosted from our own domain = more robust than the earlier test S3 object.
  To change: replace `public/billwill-logo.png` and push.
- S3 upload path is optional and **not configured** (needs the four `AWS_*` vars
  on Render); pasting a URL avoids S3.
- Display sizing in code: dashboard header (`DashboardHeader.tsx`)
  `w-14 h-14 sm:w-16 sm:h-16` (56/64px); landing (`Landing.tsx`)
  `h-10 w-auto max-w-[160px]`.

**2. Favicon (browser tab) — static, in `index.html` (commit `3b81386`).**
- `<link rel="icon" href="/billwill-logo.png">` + apple-touch-icon. Replaced the
  old template `favicon.svg`/`favicon.ico` (the green "zap").
- Favicons cache hard: after deploy, hard-refresh AND close/reopen the tab (or
  use incognito) to see the new one.

**3. Social link preview (WhatsApp / iMessage / Twitter) — Open Graph tags in
`index.html` (commit `e1eeed6`).**
- These are separate from the favicon. Added `og:image`, `og:url`,
  `og:site_name`, `og:image:alt`, and Twitter `card`/`title`/`description`/`image`,
  all pointing at `https://billwill.site/billwill-logo.png` (scrapers need
  absolute HTTPS URLs). Before this, there was no `og:image`, so WhatsApp fell
  back to the old favicon and showed a cached "BillFlow" title.
- **Cache busting:** scrapers cache aggressively. To refresh: Facebook Sharing
  Debugger → "Scrape Again" (WhatsApp shares that cache), or append a query like
  **`https://billwill.site/?v=2`** (confirmed working). It's a `summary` (small
  thumbnail) card; a wide ~1200×630 `og:image` would give the big banner style.

**Legacy:** `public/Test-Logo.png` (commit `a08b93d`) is superseded by
`billwill-logo.png`; safe to remove in a later cleanup.

---

## 10. API endpoints (all under `/api`, Clerk-authenticated unless noted)

- **Health (public):** `GET /health`, `GET /ready`
- **User:** `GET /users/me`, `GET /users/me/role`
- **Site/public:** `GET /site-settings`, `GET /pricing-tiers`, `GET /categories`
- **Bills:** `GET/POST /bills`, `GET/PATCH/DELETE /bills/:id`
- **Payments:** `GET /payments`, `GET /bills/:id/payments`, `POST /bills/:id/payments`
- **Notes:** `GET /bills/:id/notes`, `POST /bills/:id/notes`
- **Installments:** `GET/POST /installments`, `GET/PATCH /installments/:id`, `POST /installments/:id/cancel`
- **Subscriptions:** `GET/POST /subscriptions`, `GET/PATCH/DELETE /subscriptions/:id`, `PATCH /subscriptions/:id/cancel`
- **Notifications:** `GET /notifications`, `GET /notifications/unread-count`, `PATCH /notifications/:id/read`, `PATCH /notifications/read-all`, `PATCH /notifications/:id/dismiss`
- **Budget (Phase 1):** `GET/POST /income-sources`, `PATCH/DELETE /income-sources/:id` (+ received-cycle toggle), `GET/PUT /budgets` (per-category limits), `GET/PATCH /budget-settings` (need/want/savings %). (See `server/src/index.ts` for exact shapes.)
- **Goals (Phase 2):** `GET/POST /goals`, `PATCH/DELETE /goals/:id` (name/target/date/in-plan/pause), `POST /goals/:id/contributions` (Add money). (See `server/src/index.ts`.)
- **Demo:** `GET /demo/status` (public — is demo enabled / is caller the demo user), `POST /demo/session` (public, rate-limited — returns a 60s Clerk sign-in ticket), `POST /demo/reset` (demo user or admin — re-seeds demo data).
- **Admin:** `GET /admin/users`, `POST /admin/users/:id/grant-admin`, `POST /admin/users/:id/revoke-admin`, `GET /admin/summary`, `POST/PATCH/DELETE /admin/categories[/:id]` (category `kind`), `POST/PATCH/DELETE /admin/pricing-tiers[/:id]`, `PATCH /admin/branding`, `POST /admin/branding/logo`, `PATCH /admin/site-settings`

Verify API deployed correctly: `GET /api/categories` returns **401** (not 404)
without a token.

---

## 11. Deploy config in repo

- `vercel.json` — Vite build, SPA rewrites (deep links), immutable `/assets/*`
  cache, security headers.
- `render.yaml` — Render Blueprint for `billflow-api` (rootDir `server`,
  `healthCheckPath /api/ready`, `CLIENT_URL` defaulted to the billwill.site
  origins, `plan: free`).
- `docs/DEPLOYMENT.md` — full deploy guide (Atlas, Clerk, Render, Vercel, DNS).
- Also present: `Dockerfile`, `nginx.conf`, `docs/COOLIFY.md` (alt hosting path).

### Domain layout
| Host | Serves | Points at |
|---|---|---|
| `billwill.site`, `www.billwill.site` | Frontend | Vercel |
| `api.billwill.site` | Backend API | Render (CNAME) |

---

## 11b. CI — GitHub Actions (`.github/workflows/ci.yml`)

**This is CI, not CI/CD.** It tests code; it does **not** deploy. Deployment is
still separate: Render (manual redeploy or auto on push) + Vercel (auto on push).
The two systems independently watch the repo, so **a red CI run does NOT block a
Vercel/Render deploy** — they're not linked.

Runs on push to `main`/`feature/**`, on PRs, and manual dispatch. Node 24,
Ubuntu, `permissions: contents: read`, no deploy step. Five jobs:
- **frontend** — lint, typecheck, unit tests, integration tests (in-memory
  MongoDB replica set), production build compile-check.
- **server** — backend typecheck + build.
- **e2e** — signed-out browser smoke tests (needs `VITE_CLERK_PUBLISHABLE_KEY`
  repo secret; skipped if unset, e.g. fork PRs).
- **fullstack-e2e** ("Full-stack browser journeys") — production build + test
  Clerk stand-in against the real API on in-memory Mongo, at desktop/tablet/mobile.
  Needs no secrets. Uploads a Playwright report artifact on failure.

**Why CI matters even with manual deploys:** it runs on a clean Linux machine, so
it catches what Windows can't run locally (integration + fullstack suites) and
what Vercel/Render never run (Vercel only compile-checks; Render only builds +
starts). It caught several real bugs this project (Clerk proxy crash, calendar
popover covering the submit button).

**Gap / next step for real CI/CD:** gate deploys behind CI — e.g. Vercel required
checks waiting on GitHub Actions, or a deploy job (vercel deploy / Render deploy
hook) that runs only on green.

---

## 11c. Full-stack e2e fix saga (for reference)

The "Full-stack browser journeys" CI job took several rounds; all were bugs in
the *test code*, not the app:
- `ada319b` — harness crashed: `signInTokens` stub assigned onto Clerk's lazy
  Proxy (rejected by `set` trap). First patched via `Object.defineProperty` (got
  it to boot).
- `ec2504c` — superseded: stub patched **in place** on resolved
  `clerkClient.signInTokens.createSignInToken` (the earlier one wasn't read by the
  app → real Clerk "Unauthorized"); plus the bill journey now picks the Due Date
  via the **calendar popover** instead of `.fill()` on a button.
- `a59faac` — scoped "Broadband" match to a table row (the success toast also
  held the name and detached mid-click); relaxed goal assertions; added
  `actionTimeout: 10_000` for clearer failures.
- `4d95793` — **root cause**: the calendar popover stayed open and covered the
  "Add Bill" button, so the submit click never landed. Now dismisses the popover
  (click the dialog heading) before submitting.

Lesson captured: these only reproduce in CI (Linux + MongoDB + real browser);
grab the uploaded **Playwright trace artifact** from the failed job to diagnose,
rather than guessing from the text log.

---

## 12. Status: done vs pending

### Done
- BillFlow → BillWill rebrand; MERN backend merged to `main` and deployed.
- Live on billwill.site (Vercel) + Render API + Atlas; Clerk auth working.
- Admin access granted to bootstrap admin.
- Categories (admin + API), Smart Insights rename, Bill Hub reorder.
- Calendar date picker for due dates.
- Monthly Flow: single-month scoping, switcher, carry-over, future-month
  recurring projection.
- Logo enlarged (dashboard + landing); logo committed to `public/`.
- **Budget Phase 1**: income sources, per-category budgets, cash-flow card,
  need/want/savings category kinds, chunk-error auto-recovery. Pushed (`e5d6936`).
  Fixed 2 real test-assertion bugs in the delivered set (installments response
  shape). All integration + Budget unit tests pass.
- **Demo account**: one-click shared/resettable demo gated by
  `DEMO_CLERK_USER_ID`, seeded sample data across every feature. Pushed
  (`fde5ea3`). Clerk demo user + Render env var done; API redeployed. 48
  demo-data unit tests + demo integration tests pass.
- **Logo + favicon + social preview**: BillWill logo self-hosted at
  `/billwill-logo.png`, set as branding logo, browser-tab favicon, and Open
  Graph `og:image` for WhatsApp/Twitter link previews (`index.html`). Pushed
  (`e1eeed6`). `?v=2` cache-bust confirmed the WhatsApp preview updates.
- **Phase 2 (Log a spend + Goals)**: QuickSpend FAB + savings Goals with
  in-plan reservation from Free to spend; demo seeds 4 goals. Pushed (`d5eec0f`),
  Render redeployed. 19 goals unit + goals integration tests pass. E2e harness
  fixed in two rounds (`ada319b`, `ec2504c`): in-place Clerk ticket stub +
  calendar due-date picker in the journey.
- **Google Analytics (GA4)**: opt-in via `VITE_GA_MEASUREMENT_ID` (Vercel
  Production), `demo_started` event, `docs/ANALYTICS.md`. Pushed (`1eac57a`);
  env var set in Vercel + redeployed.
- **CI (GitHub Actions)**: 5-job test pipeline (see §11b). Fullstack e2e journey
  stabilized over 4 rounds (see §11c); final root-cause fix `4d95793`.
- **Recurring end dates + API perf**: "Ends after N / on date" for recurring
  bills, plus `warmUpApi()` and query batching. Pushed (`6e5482f`); backend, so
  Render redeployed before Vercel. 16 unit + 5 integration tests pass. (See §6f.)
- **Row action buttons (edit/delete)**: shared `src/components/RowActions.tsx`
  used across bill + subscription tables and the notification bell. Frontend-only.
  Pushed (`399ccf4`); `row-actions.test.tsx` added.

### Pending / to consider
- **PWA feature not yet committed:** service worker, manifest, offline page,
  icons, `src/lib/pwa.ts` (+ `billwill-pwa.zip`) are untracked in the working
  tree. When committing, re-apply the `index.html`/`vercel.json` PWA bits
  WITHOUT reverting the favicon (`billwill-logo.png`) or the OG/Twitter preview
  tags, and re-add `registerServiceWorker()` to `main.tsx`.
- **CI/CD gap:** CI (GitHub Actions) and deploys (Vercel/Render) are not linked —
  a red CI run does not block a deploy. For real CI/CD, gate deploys on green
  (Vercel required checks, or a deploy job triggered only after tests pass).
- **Verify demo end-to-end** in a private window: Try the demo → banner, Cash
  Flow card, Budget → Income shows Salary ₹1,00,000. Confirm demo data is
  isolated from the personal account.
- **Windows-local test caveats (not bugs, all green in CI):**
  - `deploy-readiness.test.ts` — 3 failures from CRLF-vs-LF in render.yaml
    regexes + a Unix `grep` call.
  - `smoke.spec.ts` "landing renders pricing" — the `₹24L` stat assertion fails
    locally (Clerk/data timing); verified it fails on clean pre-change HEAD too.
  - `test:e2e:fullstack` can't start locally — its webServer command
    (`server/node_modules/.bin/tsx …`) is POSIX-only; runs in CI.
  - Playwright browsers must be installed locally once: `npx playwright install chromium`.
  Left all as-is so CI tests (which gate deploys) aren't weakened.
- **Clerk production instance:** still on dev keys (`pk_test_`/`sk_test_`). Create
  a prod instance + `pk_live_`/`sk_live_`, configure `billwill.site` domain and
  Google OAuth creds before wider rollout.
- **S3 for logo uploads:** not configured on Render, so the in-app Upload button
  returns "S3 not configured". Either set the four `AWS_*` vars on Render (private
  bucket, IAM with `s3:PutObject`/`s3:GetObject`) or keep using a pasted https URL.
- **Render free plan** sleeps when idle (cold starts ~30–60s). Move to a paid plan
  for SaaS traffic.
- **Bundle size:** build warns some chunks > 500 kB; consider code-splitting later.
- Confirm Vercel auto-deploy is on and watching `raj3176/billwill` → `main` to
  avoid manual redeploys.

### Security to-dos
- **Rotate the Atlas DB password** — it was pasted in plaintext during setup.
- Don't commit or paste `.env` contents; keep secrets server-side only.
- Treat any presigned S3 URL / access key shared in chat as exposed.

---

## 13. Recent commit history (deploy repo `personal/main`)

```
399ccf4  fix: row action buttons (edit, delete) across bill and subscription tables
446d0bd  docs: add recurring end dates + API perf (6f); note PWA still pending
6e5482f  feat: recurring bill end dates and API performance (query batching, warm-up)
d3ff823  docs: add CI (GitHub Actions) overview, e2e fix saga, and CI/CD gap
4d95793  fix(e2e): dismiss calendar popover before clicking Add Bill
a59faac  fix(e2e): scope bill row to table, relax goal assertions, add actionTimeout
602a3ae  docs: add Google Analytics (6e), env var, and the e2e in-place/calendar fix
ec2504c  fix(e2e): patch createSignInToken in place and pick due date via calendar popover
1eac57a  feat: Google Analytics 4 (opt-in via VITE_GA_MEASUREMENT_ID) with demo_started event
6c315f7  docs: document favicon + Open Graph social-preview setup
e1eeed6  fix: add og:image and social preview meta tags (WhatsApp/Twitter link preview)
9578a3a  docs: add Phase 2 (Log a spend + Goals), logo/favicon, and e2e fix to billwill-notes
ada319b  fix(e2e): define signInTokens stub via Object.defineProperty to bypass Clerk proxy set trap
d5eec0f  feat: Phase 2 - Log a spend quick entry and savings Goals
3b81386  fix: use BillWill logo as favicon/tab icon
c1bf4f8  docs: update logo notes for self-hosted billwill-logo.png
cf120c6  feat: add BillWill logo asset and enlarge dashboard header logo
4572941  docs: add demo account and DEMO_CLERK_USER_ID to billwill-notes
fde5ea3  feat: one-click demo account with seeded sample data
44fdf58  docs: add billwill-notes with Budget Phase 1 and full project status
e5d6936  feat: Budget Phase 1 - income, budgets, cash flow, category kinds (need/want/savings)
2be5d11  feat: project expected recurring bills into future months in Monthly Flow
620e43f  feat: scope Monthly Flow to a single month with switcher and carry-over
a08b93d  chore: add Test-Logo.png to public for static serving
a7a8650  fix: enlarge landing page logo (32px -> 40px, aspect-preserved)
743c32b  fix: render header logo larger (h-12, remove constraining box)
f7134e7  fix: enlarge dashboard header logo (20px -> 40px)
b6cbaaf  feat: BillWill rebrand, Categories (admin + API), Smart Insights, Bill Hub reorder
67a4a80  Merge feature/billflow-backend: complete BillFlow MERN backend and hardening (PR #1)
```
