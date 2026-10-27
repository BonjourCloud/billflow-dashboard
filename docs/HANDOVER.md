# BillWill — Technical Handover

For Rajiv. This page records the state at Iteration 5 (the verification figures below), then what changed afterwards (October 2026: admin-managed categories, month-scoped views, stale-deploy handling, and budgeting), how to run and demonstrate the app, and what remains open. Details live in the linked docs; the full design is in [TECHNICAL-DESIGN.md](TECHNICAL-DESIGN.md).

## Status at a glance

| Area | Status |
|---|---|
| Features (bills, payments, recurring bills, subscriptions, installments, reminders, pricing, admin) | Implemented and verified by automated tests against the real API and MongoDB |
| Authentication and authorization | Verified with tests; real Clerk sign-in not exercised (no test account) |
| Responsive layout | Major journeys pass at desktop, tablet, and mobile sizes with no horizontal scrolling |
| Deployment | **Deployed** (Render API, Vercel frontend, Atlas, Clerk) by the owner as of October 2026; see [DEPLOYMENT.md](DEPLOYMENT.md) |
| CI | GitHub Actions config is in the repository; check the Actions tab for the latest run on `main`. |
| Budgeting (income, budgets, cash flow) | Implemented in October 2026. Unit tests pass; the new API integration tests were written but not yet run against MongoDB when this was written. |

## Changes since Iteration 5 (October 2026)

| Change | Summary | Where |
|---|---|---|
| Admin-managed categories | Categories moved from a hard-coded list to MongoDB. Admins add, rename, recolor, hide and delete them (deleting is blocked while bills use one). Bills keep a hidden category when edited. | `Category` model, `/api/categories`, `/api/admin/categories`, Admin → Categories |
| Month-scoped dashboard | Monthly Flow, stats and Upcoming follow the selected month; recurring bills for months not yet generated are projected in the browser. | `src/lib/billMonth.ts`, `useBillStore`, `useMonthBills` |
| Stale-deploy handling | A blank page after a release (old tab, new chunks) now triggers one automatic reload, or a reload screen. | `src/lib/chunkReload.ts`, `ChunkErrorBoundary` |
| Budgeting (Phase 1) | Income sources, a Cash Flow card, per-category monthly limits, an optional needs/wants/savings split, and an EMI-share warning. All configurable per user; category type (Need/Want/Savings) is set by admins. | `IncomeSource`, `Budget`, `BudgetSettings` models; `/api/income`, `/api/budgets`, `/api/budget-settings`; Budget tab |
| Goals and Log a spend (Phase 2) | A **Goals** tab under Budget: a target amount and date, a monthly set-aside worked out for you, an in-plan switch, and a ledger of money added. The monthly amount is taken out of Free to spend. A floating **Log a spend** button on every signed-in page records an everyday expense as a paid bill. The demo now includes four goals. | `Goal` model, `/api/goals`, `GoalsTab`, `QuickSpend`, `src/lib/goals.ts` |
| Demo account | One-click "Try the demo" signs visitors into a shared Clerk user holding generated sample data (₹1,00,000 income, 20,000 rent, about 63% of income going to bills and savings). Reset by banner button, Admin card, `npm run seed:demo`, and automatically after 24 hours. | `demoService.ts`, `/api/demo/*`, `DemoBanner`, [DEMO.md](DEMO.md) |
| Docs | API, architecture, design, testing, deployment, mocked-vs-real and this page updated; new [TECHNICAL-DESIGN.md](TECHNICAL-DESIGN.md). | `docs/` |

Test counts in the next section are Iteration 5 figures and are now out of date; run the commands in [TESTING.md](TESTING.md) for current numbers. On a Node 22 machine five currency formatting tests fail (`₹1.0Cr` vs `₹1Cr`); the project targets Node 24.

Deferred to a later phase: household sharing, a configurable month start day, budget rollover, alert toggles, and per-user category type overrides.

## Verified in Iteration 5

All counts are from the final local run on `feature/billwill-backend`.

| Check | Command | Result |
|---|---|---|
| Lint | `npm run lint` | 0 errors (8 existing fast-refresh warnings) |
| Type-check (app, configs, tests, e2e harness) | `npm run typecheck` | Clean |
| Server type-check | `npm run typecheck --prefix server` | Clean |
| Unit tests | `npm test` | 349 passed |
| Integration tests (real API + in-memory MongoDB) | `npm run test:integration` | 155 passed |
| Browser smoke tests (signed out, real Clerk dev instance) | `npm run test:e2e` | 5 passed |
| Full-stack journeys (3 viewport sizes) | `npm run test:e2e:fullstack` | 21 passed (42/42 when repeated twice, no retries) |
| Frontend and server production builds | `npm run build`, `npm run build --prefix server` | Pass |

What the suites cover, and what they substitute, is described in [TESTING.md](TESTING.md) and [MOCKED-VS-REAL.md](MOCKED-VS-REAL.md).

### Authentication, authorization, and cross-user access

- Every protected route returns `401` without a session; every admin route returns `403` for non-admins. The route list is read from the app, so new routes are checked automatically.
- A user gets `404` for another user's bills, payments, notes, installment plans, subscriptions, and notifications, and the other user's data is unchanged.
- Owner IDs in query strings are ignored; `userId` in request bodies is rejected; MongoDB operator injection is rejected.
- Malformed IDs on every `:id` route return a JSON `4xx`, never a `500`; unknown IDs return `404`.
- Clerk tokens issued to other origins are rejected (tested with the real `@clerk/express` middleware).
- Admin grant/revoke, self-revoke protection, and environment-listed admins work; removing an ID from `ADMIN_CLERK_USER_IDS` removes access immediately.

### Core features

Through the real routes and database: bill create/read/update/delete and validation; payment history (newest first), partial and full payments, duplicate-payment protection; notes; recurring bills with `this`/`future`/`all` edit and delete scopes (paid occurrences are never deleted); subscription occurrences generated once, even under concurrent requests; reminders created once per bill and type, read/read-all/dismiss, cleared on payment or deletion; installment plans created in a transaction (rolled back on failure), updated, cancelled (paid installments kept), filtered by status; pricing tiers (duplicate slug `409`, validation); theme settings validation; admin summary; generic `500`s without internal details when the database fails.

### Bugs fixed in Iteration 5

| Bug | Effect | Fix | Regression tests |
|---|---|---|---|
| Admins redirected from `/admin` on a page reload or direct link | On load, the role hook reported "loaded, not an admin" in the render where Clerk's user first appeared, so `AdminRoute` sent admins to `/dashboard`. Clicking "Admin" from the header worked. | `src/hooks/useUserRole.ts` derives `loading` from which user the roles were fetched for. Reproduced in the browser with the Clerk stand-in, which follows the real SDK's load order; not yet confirmed with real Clerk (no test account). | `user-role-hook.test.ts` (fails on the old hook); admin journey in `e2e/fullstack/journeys.spec.ts` (fails on the old hook) |
| Previous user's roles shown while the next user's loaded | The same hook briefly reported the old user's admin role after a user change (UI only; the API always enforced access) | Same fix: roles are hidden until they belong to the current user | `user-role-hook.test.ts` |

No other defects were found. Existing tests that were simulations were complemented, not replaced, by tests against the real routes.

## Running it locally

See the [README](../README.md#quick-start) for setup, the database options, and Clerk keys. Environment variables are listed in [DEPLOYMENT.md](DEPLOYMENT.md#environment-variables) and in the two `.env.example` files. Never commit `.env` files. The API reference is [API.md](API.md).

## Demonstration checklist

Use a Clerk development instance with two test users: one listed in `ADMIN_CLERK_USER_IDS` and one regular user. Check each item on a desktop browser and once on a phone-sized window.

1. **Landing page**: branding, pricing tiers in rupees, "Sign In".
2. **Sign in** with the regular user; the dashboard loads with Monthly Flow and the spending chart.
3. **Add a bill** due tomorrow (Add Bill). It appears in the table and Upcoming Bills.
4. **Reminder**: the bell shows an unread count with "Payment Due Soon"; mark all read.
5. **Pay the bill**: open it, Record Payment (UPI). It appears in Payment History and the bill becomes Paid.
6. **Partial payment**: add another bill and record half; it stays Pending with the paid total shown.
7. **Recurring bill**: Subscriptions → Add Subscription; edit the cost; cancel (Stop Renewals).
8. **Installment plan**: Installments → Create Plan (e.g. ₹60,000 over 6 months) and check the live preview; open the plan and its schedule; pay one installment and see the remaining balance drop.
9. **Isolation**: sign out, sign in as the admin; the regular user's bills are not visible.
10. **Admin**: reload `/admin` directly (the bug fixed above); open Users (grant and revoke admin for the regular user), Pricing (edit a tier and see it on the landing page), Branding and Theme.
11. **Non-admin**: as the regular user, visit `/admin` and be redirected to the dashboard.
12. **Sign out**; visiting `/dashboard` redirects to sign-in.
13. **Categories** (admin): Admin → Categories; add "Pet care" as a Want, hide it, and confirm it disappears from the Add Bill dropdown but old bills keep their label.
14. **Income and cash flow**: Budget → Income, add a monthly salary; the dashboard Cash Flow card shows free-to-spend; switch months and confirm recurring bills are included. Mark this month's income received.
15. **Budgets**: Budget → Budgets, set a limit on one category below its spend and check it turns red with "over by"; Budget → Settings, switch to the needs/wants/savings split and save.
16. **Goals**: Budget → Goals, add a goal of ₹1,35,000 due in about four months and check it suggests ₹33,750 a month; add money; go to the dashboard and confirm Free to spend dropped by the monthly amount and the Cash Flow card shows a Goals figure. Switch **In plan** off and confirm it returns.
17. **Log a spend**: tap the round button at the bottom right of any page, log ₹450 with a note, and confirm it appears in the bills list as paid and counts against its category budget.

## Demo account checklist

After the one-time setup in [DEMO.md](DEMO.md): from the signed-out landing page click Try the demo; confirm the banner, Monthly Flow with free-to-spend, Budget → Income, Budgets (Entertainment over by ₹268), the overdue water tanker bill, the Laptop EMI plan, subscriptions, and reminders; click Reset demo and confirm the data returns to its starting state.

## Open items and limitations

### Blockers (need account access)

- **Remaining deployment items**: the custom API domain (`api.billwill.site`), an optional AWS S3 bucket for logos, and running the post-deploy checklist in [DEPLOYMENT.md](DEPLOYMENT.md) against the live system.
- **Clerk**: a production (or staging) instance with your domain configured; a test user for signed-in browser checks with real Clerk.
- **CI secret**: add `VITE_CLERK_PUBLISHABLE_KEY` (a development key) as a repository secret so the signed-out smoke job runs; without it the job is skipped with a notice.

### Not verified against real services

Atlas (network access, performance), real Clerk sign-in and token verification, the Clerk Backend API, S3 uploads and pre-signed URLs, and the deployed Vercel/Render configuration.

### Known limitations

- Currency is displayed in rupees; stored amounts were not converted (a value entered as 5000 dollars now shows as ₹5,000.00). Reminder messages saved before the rupee change are rewritten to rupees, same amount, the next time that user loads their notifications; nothing else about them changes.
- Seeded pricing tiers keep their original numbers (Pro 9, Enterprise 29), which now display as ₹9 and ₹29. Adjust them in Admin → Pricing if they were meant as dollar prices.
- Rate limits are counted per server instance.
- Render's Blueprint uses the free plan, which sleeps when idle.
- No error tracking, alerting, Content-Security-Policy on the frontend, or Atlas backup configuration yet.
- The frontend entry bundle is about 561 kB (Vite warns above 500 kB).
- Remaining `npm audit` advisories need major upgrades (Vitest, Vite, Tailwind 4, React Router 7); they affect dev, test, or build tooling, or React Router features the app does not use.
- Reminders are in-app only (no email or push); there is no background scheduler.
- Deleting a bill keeps its payment and note records.
- Income and budget amounts are stored without currency conversion and assume rupees.
- Budget "spent" is the total of bills in a category for the month. A spend logged with Log a spend is stored as a paid one-time bill, so there is no separate expense list; it appears in the bills list.
- A goal's monthly set-aside is planned, not tracked: Add money only records progress, and the 50/30/20 savings summary does not include goals.
- The "Savings & investments" default category exists only on a fresh database; add it by hand on an existing one.
- Category type (Need/Want/Savings) is global, set by admins, not per user.
- Clerk profile changes (email, name) can take up to 15 minutes to appear.
