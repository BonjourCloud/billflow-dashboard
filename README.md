# BillFlow — Bill Payment & Subscription Management Dashboard

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

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — system overview, request pipeline, data model, frontend structure
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — Vercel, Render, MongoDB Atlas, Clerk, S3, environment variables, CI
- [docs/TESTING.md](docs/TESTING.md) — test commands and what each suite verifies
- [docs/MOCKED-VS-REAL.md](docs/MOCKED-VS-REAL.md) — which integrations are real and what tests substitute
- [docs/DESIGN.md](docs/DESIGN.md) — design system: tokens, layout, motion rules
