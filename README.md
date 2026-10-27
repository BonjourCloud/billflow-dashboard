# BillWill — Bill Payment & Subscription Management Dashboard

A dashboard for tracking bills, subscriptions, and installment plans. React + Vite frontend, Express + MongoDB API, Clerk authentication.

## Features

- **Bills** — one-time and monthly recurring bills, with search, filters, sorting, and category charts
- **Payments and notes** — record full or partial payments per bill (with duplicate protection) and keep notes
- **Subscriptions** — recurring series that create monthly bills automatically
- **Installment plans (EMI)** — schedule, interest, and remaining balance, updated as payments come in
- **Reminders** — in-app notifications for bills due within 5 days or overdue
- **Insights** — rule-based spending insights computed in the browser (no AI service)
- **Landing page** — branding and pricing tiers managed from the admin panel
- **Admin panel** — users and admin roles, pricing tiers, branding (with optional S3 logo upload), and theme colors and fonts

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | React 18, TypeScript, Vite 5, Tailwind CSS, shadcn/ui, Framer Motion, Recharts, TanStack Query |
| Backend | Node 24, Express 5, Mongoose 9, zod (`server/`) |
| Database | MongoDB (Atlas in production) |
| Auth | Clerk |
| File storage | AWS S3 (optional, branding logos) |
| Tests | Vitest, mongodb-memory-server, Playwright |
| Hosting | Vercel (frontend), Render (API) |

## Quick start

```sh
npm ci
npm ci --prefix server
cp .env.example .env                 # set VITE_CLERK_PUBLISHABLE_KEY
cp server/.env.example server/.env   # set MONGODB_URI and the Clerk keys
```

Then run the API and the frontend in two terminals:

```sh
npm run dev --prefix server   # http://localhost:5001
npm run dev                   # http://localhost:8080
```

The API refuses to start if required variables are missing or malformed, and prints which ones need fixing.

### Database for local development

`MONGODB_URI` can point at either:

- **A MongoDB Atlas cluster** (a free tier works; use a separate database such as `billwill-dev`). Atlas clusters are replica sets, so installment plans are created in transactions, as in production.
- **A local MongoDB** (`mongodb://127.0.0.1:27017/billwill`). A standalone server works: installment creation falls back to sequential writes with cleanup. Start `mongod` with `--replSet rs0` and run `rs.initiate()` once to use transactions locally.

No migrations are needed: the API creates its collections and indexes on startup and seeds the default pricing tiers into an empty database. You can run the full test suites without any database; they start their own in-memory MongoDB (see [docs/TESTING.md](docs/TESTING.md)).

### Clerk for local development

Create a Clerk development instance, enable the sign-in methods you want (the UI's button opens Clerk's sign-in), and copy its `pk_test_…` key into both `.env` files and its `sk_test_…` key into `server/.env`. Put your own Clerk user ID (`user_…`) in `ADMIN_CLERK_USER_IDS` to get admin access.

## Documentation

- [docs/HANDOVER.md](docs/HANDOVER.md) — Iteration 5 status, verified features, demo checklist, open items
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — system overview, request pipeline, data model, frontend structure
- [docs/API.md](docs/API.md) — every API endpoint with its authentication requirement
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — Vercel, Render, MongoDB Atlas, Clerk, S3, environment variables, CI
- [docs/TESTING.md](docs/TESTING.md) — test commands and what each suite verifies
- [docs/MOCKED-VS-REAL.md](docs/MOCKED-VS-REAL.md) — which integrations are real and what tests substitute
- [docs/DESIGN.md](docs/DESIGN.md) — design system: tokens, layout, motion rules
- [docs/DEMO.md](docs/DEMO.md) — demo account: setup, reset, and a presenting walkthrough
