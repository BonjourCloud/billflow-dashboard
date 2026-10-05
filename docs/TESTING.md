# Testing Locally

## Setup

```sh
npm i            # or bun install
npm run dev      # dev server at http://localhost:8080
```

## Unit / Component Tests (Vitest)

Config: `vitest.config.ts` (jsdom environment, globals on, setup in `src/test/setup.ts`). Tests live next to source as `*.test.ts(x)`.

```sh
npx vitest run        # single run
npx vitest            # watch mode
```

Example test: `src/test/example.test.ts`.

### What to test

- `useBillStore`: filtering by status/category/search, sort order, stats math, add/update/delete.
- `SpendingChartWidget`: bar click calls `onSelectCategory`; clicking the active category clears it.
- `BillDialog`: validation errors on empty submit; save calls `onSave`/`onUpdate`.

## End-to-End (Playwright)

Config: `playwright.config.ts`, fixture in `playwright-fixture.ts`.

```sh
npx playwright test
```

Useful manual smoke path:

1. `/` — dashboard renders all widgets.
2. Type in search → table filters live.
3. Click a chart bar → table filters to that category; click again / "Clear filter" → resets.
4. Add Bill → fill form → row appears; edit and delete it.
5. Click a bill name → `/bill/:id` shows payment history and notes; add a note.
6. Reload → state resets to mock seed (expected — no persistence).

## Lint & Typecheck

```sh
npx tsc -b            # typecheck (tsconfig.app.json)
npx eslint .
```

## Known Limitations

- No persistence: all mutations are in-memory only.
- Bill Detail payments/notes are static mocks (`src/data/billDetails.ts`); notes added in the UI are local to the page session.
