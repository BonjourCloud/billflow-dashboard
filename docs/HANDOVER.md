# BillWill — Technical Handover (Iteration 5)

For Rajiv. This page summarizes what was verified in Iteration 5, how to run and demonstrate the app, and what remains open. Details live in the linked docs.

## Status at a glance

| Area | Status |
|---|---|
| Features (bills, payments, recurring bills, subscriptions, installments, reminders, pricing, admin) | Implemented and verified by automated tests against the real API and MongoDB |
| Authentication and authorization | Verified with tests; real Clerk sign-in not exercised (no test account) |
| Responsive layout | Major journeys pass at desktop, tablet, and mobile sizes with no horizontal scrolling |
| Deployment | **Not deployed.** Configuration is ready and the production server was started and probed locally; hosting accounts are needed (see "Open items") |
| CI | GitHub Actions runs on PR #1. The currency change and Iteration 5 work are not pushed yet, so CI has not run on them. |

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

## Open items and limitations

### Blockers (need account access)

- **Deployment**: requires a Render account (API), a Vercel project (frontend), a MongoDB Atlas cluster and database user, and optionally an AWS S3 bucket and IAM user. Follow [DEPLOYMENT.md](DEPLOYMENT.md) in its recommended order, then run its post-deploy checklist.
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
- Clerk profile changes (email, name) can take up to 15 minutes to appear.
