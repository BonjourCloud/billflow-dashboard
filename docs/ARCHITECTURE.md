# Technical Architecture

## Overview

BillFlow is a **client-side single-page application**. There is no server, no database, and no network calls — the entire app runs in the browser from an in-memory mock state.

```text
┌─────────────────────────────────────────────┐
│                 Browser                     │
│                                             │
│  React Router                               │
│   ├── /            → Index (dashboard)      │
│   ├── /bill/:id    → BillDetail             │
│   └── *            → NotFound               │
│                                             │
│  State: useBillStore (useState + useMemo)   │
│   └── seed: src/data/bills.ts (MOCK_BILLS)  │
│       src/data/billDetails.ts (payments,    │
│       notes)                                │
│                                             │
│  UI: shadcn/ui + Tailwind + Framer Motion   │
│  Charts: Recharts                           │
└─────────────────────────────────────────────┘
```

## Data Flow

1. `useBillStore` seeds `bills` from `MOCK_BILLS` into `useState`.
2. Derived data is computed with `useMemo`:
   - `filteredBills` — search query + status/category filters + sort (due date or amount, asc/desc)
   - `stats` — totals and counts per status, paid percentage
   - `upcomingBills` — next 3 pending bills by due date
3. Mutations (`addBill`, `updateBill`, `deleteBill`) update state only; **nothing persists** — a page reload resets to the mock seed.
4. The Spending chart and Bill table share filter state lifted to `Index.tsx`, which is how clicking a chart bar filters the table (and clicking again clears it).

## File Map

```text
src/
├── App.tsx                      # Router + providers (QueryClient, Tooltip, Toasters)
├── main.tsx                     # Entry point
├── index.css                    # Design tokens (HSL CSS vars), glass-card, badge classes
├── data/
│   ├── bills.ts                 # Bill type, MOCK_BILLS (15 bills), CATEGORIES, STATUSES
│   └── billDetails.ts           # PaymentRecord, BillNote, MOCK_PAYMENTS, MOCK_NOTES
├── hooks/
│   └── useBillStore.ts          # All dashboard state, filters, sorting, stats, CRUD
├── pages/
│   ├── Index.tsx                # Dashboard: bento grid, owns dialog + filter state
│   ├── BillDetail.tsx           # /bill/:id — payment history, notes, stats
│   └── NotFound.tsx
└── components/dashboard/
    ├── DashboardHeader.tsx      # Title + theme toggle
    ├── HeroWidget.tsx           # Totals + animated paid-progress bar
    ├── UpcomingBillsWidget.tsx  # Next 3 pending bills
    ├── SpendingChartWidget.tsx  # Recharts bar chart, click-to-filter + clear
    ├── AIInsightsWidget.tsx     # Placeholder insights (duplicate subscriptions)
    ├── BillTable.tsx            # Search/filter/sort table, row actions
    └── BillDialog.tsx           # Add/Edit form (validated, date picker)
```

## Key Design Decisions

- **No backend by design.** The brief required a fully interactive frontend with hardcoded mock JSON state. Persistence, auth, and real APIs are deliberately out of scope for now (see MOCKED-VS-REAL.md).
- **Semantic tokens only.** Components never hardcode colors; they use Tailwind classes mapped to CSS variables in `index.css` (`bg-background`, `text-muted-foreground`, `badge-paid`, etc.), so dark/light theming works from one place.
- **Filter state lives in `Index.tsx`** and is passed to both the chart and the table so they stay in sync.
- **Animations ≤ 0.3s** everywhere (Framer Motion `transition={{ duration: 0.15–0.25 }}`), including table row enter/exit via `AnimatePresence`.
- **IDs** for new bills use `crypto.randomUUID()`.

## Routing Note

The app uses `BrowserRouter`. Lovable hosting has built-in SPA fallback, so deep links and refreshes work. For self-hosting (Vercel/Netlify/S3), configure an SPA fallback rewrite — see DEPLOYMENT.md.
