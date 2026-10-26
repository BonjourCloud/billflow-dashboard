# Design System

## Visual Identity

Premium **glassmorphism** on a dark onyx/slate base. Cards use translucent surfaces with subtle borders and backdrop blur (`glass-card` utility in `src/index.css`).

## Color Tokens

All colors are semantic HSL CSS variables defined in `src/index.css` and consumed through Tailwind classes — never hardcode hex/rgb utilities in components.

| Token | Usage |
|---|---|
| `background` / `foreground` | Page base, primary text |
| `card` / `secondary` | Glass surfaces, inputs |
| `primary` | Brand accent (buttons, focus rings) |
| `muted-foreground` | Secondary text |
| `border` | Hairline borders (`border-border/20–40`) |
| `destructive` | Delete actions |
| `badge-paid` | Emerald tint — paid status |
| `badge-pending` | Amber/neutral tint — pending status |
| `badge-overdue` | Rose tint — overdue status |

Dark mode is the default; a light theme exists via the same token set (class-based toggle in `DashboardHeader`).

## Typography & Data

- Headings: `font-semibold`, tight tracking; body: default sans stack.
- Monetary values and dates use `font-mono-data` for tabular alignment.
- Currency is shown in Indian Rupees via `src/lib/currency.ts` (`₹2,10,759.00`, Indian digit grouping); dates via `date-fns` (`MMM dd, yyyy`).

## Layout

- **Bento grid**: `grid grid-cols-12 gap-4`, max width `7xl`, padded `p-4 md:p-8`.
- Widgets span columns (e.g. table = `col-span-12`); cards are `rounded-3xl p-6`.
- Fully responsive: filters stack on mobile (`flex-col sm:flex-row`), table scrolls horizontally (`overflow-x-auto`).

## Motion Rules

- Framer Motion only; **every animation ≤ 0.3s** (typical: 0.15–0.25s, ease `[0.2, 0, 0, 1]`).
- Entrance: `opacity 0 → 1`, `y 10 → 0`, staggered via `delay`.
- Table rows animate in/out with `AnimatePresence mode="popLayout"`.
- Micro-interactions: `active:scale-95` on buttons, `hover:bg-secondary/30` on rows.

## Component Conventions

- shadcn/ui primitives (`Button`, `Input`, `Select`, `Dialog`, `Calendar`, …) composed into dashboard widgets.
- One widget per file under `src/components/dashboard/`; props down, callbacks up (DRY, no prop drilling beyond one level).
- Status badges rendered via a single `statusBadge()` helper keyed off `BillStatus`.
