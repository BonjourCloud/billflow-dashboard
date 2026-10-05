# BillFlow — Bill Payment & Subscription Management Dashboard

A premium, dark-mode-first dashboard for tracking bills and subscriptions. Built with React, Vite, Tailwind CSS, shadcn/ui, Framer Motion, and Recharts.

> **Current state: pure frontend.** All data is hardcoded mock state held in browser memory — no backend, no database, no auth. See [docs/MOCKED-VS-REAL.md](docs/MOCKED-VS-REAL.md) for what is mocked vs. planned.

## Features

- **Bento-grid dashboard** with glassmorphism cards (onyx/slate dark theme, emerald = paid, rose = overdue)
- **Hero widget** — total spend, paid/pending/overdue breakdown, animated progress bar
- **Upcoming Bills widget** — next 3 pending bills, urgency-coded
- **Spending by Category chart** (Recharts) — interactive: click a bar to filter the bill table; click again (or "Clear filter") to reset
- **AI Insights widget** — placeholder that flags duplicate subscriptions
- **Bill Hub table** — search, filter by status/category (with reset), sort by due date or amount, add/edit/delete via dialog
- **Bill Detail page** (`/bill/:id`) — payment history, timestamped notes, summary stats
- **Add/Edit dialog** — validated form with date picker and subscription toggle
- All animations capped at 0.3s for a snappy feel

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | React 18 + TypeScript 5, Vite 5 |
| Styling | Tailwind CSS v3, shadcn/ui, semantic design tokens (`src/index.css`) |
| Animation | Framer Motion (≤ 0.3s durations) |
| Charts | Recharts |
| State | Local React state (`useBillStore` hook) — no backend |
| Routing | React Router (SPA) |
| Tests | Vitest + jsdom, Playwright |

## Quick Start

```sh
npm i          # or: bun install
npm run dev    # http://localhost:8080
```

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — technical architecture, data flow, file map
- [docs/DESIGN.md](docs/DESIGN.md) — design system: tokens, colors, layout, motion rules
- [docs/TESTING.md](docs/TESTING.md) — how to run and write tests locally
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — production via GitHub + Vercel, Turso (SQLite cloud), or AWS
- [docs/MOCKED-VS-REAL.md](docs/MOCKED-VS-REAL.md) — what's mocked, what's real, what's pending (auth, admin panel, persistence)

## Deploy

Click **Publish** in Lovable, or see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for GitHub/Vercel/AWS self-hosting.
