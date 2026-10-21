# Technical Architecture

## Overview

BillFlow is a React single-page app backed by an Express + MongoDB API. Clerk handles sign-in; S3 optionally stores branding logos.

```text
┌──────────────────────┐   HTTPS + Bearer token   ┌──────────────────────────┐
│  Browser (Vite SPA)  │ ───────────────────────▶ │  Express API (server/)   │
│  React Router        │                          │  Clerk middleware        │
│  Clerk React SDK ────┼──── sign-in ──▶ Clerk ◀──┼─ token verification,     │
│                      │                          │  user lookups            │
└──────────────────────┘                          │          │               │
                                                  │          ▼               │
                                                  │  MongoDB (Atlas)         │
                                                  │  S3 (logos, optional)    │
                                                  └──────────────────────────┘
```

## Repository layout

```text
.
├── src/                      # Frontend (Vite + React + TypeScript)
│   ├── App.tsx               # Providers + routes (signed-in/admin pages lazy-loaded)
│   ├── main.tsx              # ClerkProvider bootstrap (validates the publishable key)
│   ├── contexts/AuthContext.tsx   # Wraps Clerk; registers the token provider for API calls
│   ├── lib/api.ts            # fetch wrapper: base URL, Bearer token, JSON errors
│   ├── lib/apiBaseUrl.ts     # VITE_API_URL resolution (required in production)
│   ├── lib/clerkPublishableKey.ts # VITE_CLERK_PUBLISHABLE_KEY validation
│   ├── lib/insights.ts       # Rule-based dashboard insights (no AI service)
│   ├── hooks/                # Data hooks per feature (bills, installments, notifications, …)
│   ├── data/                 # Shared frontend types and constants (no mock data)
│   ├── pages/, components/   # Screens, dashboard widgets, admin panel, shadcn/ui
│   └── test/                 # Unit tests; test/integration/ holds the HTTP + MongoDB suite
├── server/                   # Backend npm package
│   └── src/
│       ├── index.ts          # Express app, middleware, all routes, startup/shutdown
│       ├── config/env.ts     # Boot-time environment validation
│       ├── config/db.ts      # MongoDB connection
│       ├── config/s3.ts      # Lazy S3 client
│       ├── models/           # Mongoose models + zod request schemas
│       └── services/         # Recurring-bill generation, reminders
├── e2e/                      # Playwright smoke tests
├── vercel.json, render.yaml  # Deployment config (see DEPLOYMENT.md)
└── .github/workflows/ci.yml  # CI
```

## Backend

### Request pipeline

Middleware runs in this order (`server/src/index.ts`):

1. `trust proxy` set from `TRUST_PROXY` (default 0)
2. `helmet()` security headers
3. CORS, allowing only the origins in `CLIENT_URL`
4. JSON body parsing, limited to 100 kB
5. `GET /api/health` and `GET /api/ready` (registered here so they skip auth and rate limits)
6. `clerkMiddleware()` — verifies the Bearer token and sets `req.auth`
7. Rate limiter for `/api` (per user, falling back to IP)
8. Route handlers
9. JSON 404 for unknown routes
10. Error handler — maps upload errors (400/413), malformed JSON (400), oversized bodies (413), and other 4xx errors to JSON; anything else becomes a generic `500` with details only in the server log

### Authentication and authorization

- Every non-public handler calls `getAuth(req)` and returns `401` without a user. Public routes: `GET /api/health`, `/api/ready`, `/api/site-settings`, `/api/pricing-tiers` (hidden tiers only for admins).
- User data is always queried with the caller's `userId`, so another user's ID returns `404`.
- Admin routes (`/api/admin/*`) call `requireAdminAuth`: a user is an admin if their Clerk ID is in `ADMIN_CLERK_USER_IDS` (checked on every request, never saved) or their `User` document has `role: "admin"` (set only through grant/revoke).
- `GET /api/users/me` and `GET /api/users/me/role` sync email, name, and avatar from Clerk into the `User` collection.

### Data model (`server/src/models/`)

| Model | Purpose |
|---|---|
| `User` | Clerk user ID, profile fields, `role` (`user`/`admin`) |
| `Bill` | A bill occurrence: amount, due date, status, category; optional links to a recurring series or installment plan |
| `RecurringSeries` | A subscription that generates monthly `Bill` occurrences (month-end clamping) |
| `Payment` | Payments against a bill; partial payments don't mark a bill paid; unique per-user `idempotencyKey` |
| `BillNote` | Notes on a bill |
| `InstallmentPlan` | EMI plan: principal, down payment, interest, schedule totals, paid/remaining balance |
| `Notification` | In-app `due_soon` / `overdue` reminders (one per type per bill) |
| `PricingTier` | Landing-page pricing (seeded on first start) |
| `SiteSettings` | Branding and theme settings (single document) |

### Background work without a scheduler

There are no cron jobs. Work is done lazily when the user asks for data:

- Listing bills, subscriptions, or notifications first creates any recurring occurrences that are due.
- Listing notifications creates any missing reminders (due within 5 days, or overdue). Reminders are in-app only; no email or push is sent.

### Consistency guarantees

- **Installment plans** are created with their bills in a MongoDB transaction. On a standalone server (no replica set) the API falls back to sequential writes and deletes the plan if inserting bills fails.
- **Payments**: a repeated `idempotencyKey` returns `409`, and an identical payment within 4 seconds is rejected as a duplicate. Completed payments update the bill status and the plan balance; a plan is marked `completed` when nothing remains.

### Startup and shutdown

The environment is validated when the server module loads (skipped when `NODE_ENV=test`). `startServer()` then connects to MongoDB, seeds pricing tiers, and listens. Configuration or connection errors are logged (with connection-string credentials redacted) and the process exits with code 1. `SIGTERM`/`SIGINT` close the HTTP server and the MongoDB connection, with a 10-second forced-exit watchdog.

## Frontend

- **Routing** (`src/App.tsx`): `/` landing, `/login`, then signed-in routes (`/dashboard`, `/bill/:id`, `/subscriptions`, `/installments`, `/installments/:id`) behind `ProtectedRoute`, and `/admin/*` (dashboard, users, pricing, branding, theme) behind `AdminRoute`. Signed-in and admin pages are lazy-loaded, so the landing page doesn't download the dashboard or the admin panel.
- **API access** (`src/lib/api.ts`): adds `Authorization: Bearer <Clerk token>` unless a call is marked unauthenticated, and turns API JSON errors into thrown `Error`s with the server's message.
- **Data hooks** (`src/hooks/`): one hook per feature, using TanStack Query or local state over the API. Notifications poll every 60 seconds.
- **Branding and theme** come from `GET /api/site-settings` and are applied as CSS variables; light/dark preference is stored in `localStorage`.
- **Insights** (`src/lib/insights.ts`) are computed in the browser from the user's bills, payments, and plans with fixed rules. No AI or LLM service is called.

## Configuration

Environment variables are documented in [DEPLOYMENT.md](DEPLOYMENT.md#environment-variables). Both sides validate their configuration early: the API at boot (`server/src/config/env.ts`) and the frontend at production build time (`vite.config.ts`) and on startup (`src/main.tsx`, `src/lib/api.ts`).
