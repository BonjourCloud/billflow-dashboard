# API Reference

The Express API lives in `server/src/index.ts`. All routes are under `/api` and exchange JSON (except the logo upload, which is `multipart/form-data`).

## Authentication

- Send the Clerk session token as `Authorization: Bearer <token>`. The frontend's `apiRequest()` (`src/lib/api.ts`) does this automatically.
- The token must have been issued to one of the `CLIENT_URL` origins (Clerk `authorizedParties`); otherwise the request is treated as signed out.
- **Auth** in the tables below: `public` (no token), `user` (any signed-in user; data is always limited to that user), `admin` (an `ADMIN_CLERK_USER_IDS` user or a user granted admin in the UI).

## Errors

Every error response is JSON: `{ "error": "<message>" }`. Validation errors may add `details` (zod field errors).

| Status | Meaning |
|---|---|
| 400 | Invalid input: schema violation, malformed ID, malformed JSON, invalid file |
| 401 | No valid session (`Authentication required.`) |
| 403 | Signed in but not an admin (`Admin access required.`) |
| 404 | Not found, or belongs to another user, or unknown route |
| 409 | Duplicate submission (same idempotency key, identical payment within 4 s), duplicate pricing-tier slug or category name, or deleting a category that bills still use |
| 413 | Body over 100 kB, or logo over 2 MB |
| 429 | Rate limit exceeded (1000 requests / 15 min per user or IP; 30 / 15 min for admin role changes and logo uploads) |
| 500 | Unexpected error; details are only in the server log |
| 503 | `/api/ready` while MongoDB is not connected; logo upload without S3 configured |

Request bodies are validated strictly: unknown fields (including `userId`) are rejected with `400`.

## Health

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/health` | public | Liveness: `{ status, service, database, timestamp }` |
| GET | `/api/ready` | public | Readiness: `200` when MongoDB is connected, else `503` |

## Current user

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/users/me` | user | Profile copied from Clerk (refreshed at most every 15 min) |
| GET | `/api/users/me/role` | user | `{ role: "admin" \| "user" }`, computed on every request |

## Bills

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/bills` | user | All bills, by due date. Creates any due recurring occurrences first, up to next month; later months are projected in the browser, not stored. |
| GET | `/api/bills/:id` | user | |
| POST | `/api/bills` | user | `{ name, amount, dueDate, status, category, recurrenceType?, recurringDay?, isSubscription? }`. `recurrenceType: "recurring"` also creates a subscription series. `201` |
| PATCH | `/api/bills/:id` | user | Any of the above plus `updateScope: "this" \| "future"` for recurring bills |
| DELETE | `/api/bills/:id?scope=this\|future\|all` | user | `204`. Paid occurrences are never deleted by `future`. Installment bills return `400` (cancel the plan instead). |

`status`: `paid`, `pending`, `overdue`. `category`: the `slug` of an active category from `GET /api/categories` (see [Categories](#categories)). A bill, subscription or installment plan keeps its category when edited even if an admin has since hidden it; picking a hidden or unknown category is `400`.

## Categories

Categories are stored in MongoDB and managed by admins (Admin → Categories). Bills, subscriptions, installment plans and budgets refer to a category by its immutable `slug`. An empty collection falls back to the built-in defaults, and the defaults are seeded on first start.

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/categories` | user | All categories, active and hidden, by `sort_order`: `{ id, slug, label, color, kind, sort_order, is_active }`. `kind` is `need`, `want` or `savings`. |
| POST | `/api/admin/categories` | admin | `{ label (1–30 chars), color? (#rrggbb), kind? }`. The slug is generated from the label. `kind` defaults to `need`. `409` if the name exists (case-insensitive). `201` |
| PATCH | `/api/admin/categories/:id` | admin | Any of `label`, `color`, `kind`, `is_active`, `sort_order`. `400` if it would leave no active category. |
| DELETE | `/api/admin/categories/:id` | admin | `409` while any bill, subscription or plan uses it (hide it instead). `400` for the last active category. |

Category `kind` drives the budget views: bills in a `savings` category count as money saved rather than as bills, and the needs/wants/savings split groups spending by kind.

## Income

Income sources are per user. Occurrences are worked out on the fly (monthly sources repeat on their day, clamped to month length), so nothing is stored for future months.

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/income` | user | `{ _id, name, amount, frequency, recurringDay, startDate, endDate, isActive, countInPlan, receivedCycles }` for each source |
| POST | `/api/income` | user | `{ name (1–100), amount (> 0), frequency: "monthly" \| "one_time", startDate, recurringDay? (1–31, default: day of startDate), endDate?, countInPlan? }`. `201` |
| PATCH | `/api/income/:id` | user | Any of the above plus `isActive`. At least one field. |
| PUT | `/api/income/:id/received` | user | `{ cycle: "YYYY-MM", received: boolean }` records or clears a receipt. Returns the source. |
| DELETE | `/api/income/:id` | user | `{ success: true }` |

`countInPlan: false` keeps a source listed but leaves it out of expected income (for irregular earnings).

## Budgets

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/budgets` | user | `[{ category, limit }]`: the user's monthly limits, one per category |
| PUT | `/api/budgets/:slug` | user | `{ limit }` (> 0, up to 1,000,000,000). Creates or replaces the limit. `400` for an unknown or hidden category. |
| DELETE | `/api/budgets/:slug` | user | Removes the limit. `{ success: true }` |
| GET | `/api/budget-settings` | user | `{ method, needsPct, wantsPct, savingsPct, emiRatioWarnPct }`; defaults `limits`, 50 / 30 / 20, 40 until saved |
| PUT | `/api/budget-settings` | user | Full object. `method`: `limits` or `50-30-20`. The three percentages are whole numbers that must add up to 100; `emiRatioWarnPct` is 1–100. |

Spent amounts, free-to-spend and the savings rate are not returned by the API: the browser computes them from bills, income and these settings (`src/lib/cashFlow.ts`).

## Goals

Savings goals with a fixed monthly set-aside. `savedAmount` is the sum of the contributions and is computed by the server. A goal's set-aside from its start month to its target month is reserved in Free to spend by the browser (`src/lib/cashFlow.ts`, `src/lib/goals.ts`); contributions only track progress.

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/goals` | user | `[{ _id, name, targetAmount, targetDate, startDate, monthlyAmount, isActive, savedAmount, contributions: [{ _id, amount, date, note }] }]`, oldest first; contributions newest first |
| POST | `/api/goals` | user | `{ name, targetAmount, targetDate, monthlyAmount? }` (amounts > 0 and up to 1,000,000,000). `monthlyAmount` defaults to the target divided by the months from this month to the target month (both included), rounded up to a whole rupee. `400` if the target month is before this month or more than 50 years away. |
| PATCH | `/api/goals/:id` | user | Any of `name`, `targetAmount`, `targetDate`, `monthlyAmount`, `isActive`. Changing the target amount or date without `monthlyAmount` re-plans the monthly amount. `404` for another user's goal. |
| DELETE | `/api/goals/:id` | user | Deletes the goal and its contributions. `{ success: true }` |
| POST | `/api/goals/:id/contributions` | user | `{ amount, date?, note? }` (note up to 100 characters). Returns the updated goal. At most 500 contributions per goal (`400` beyond that). |
| DELETE | `/api/goals/:id/contributions/:contributionId` | user | Returns the updated goal; `404` if the entry is not on that goal. |

**Log a spend** has no endpoint of its own: the browser creates an already-paid, one-time bill with `POST /api/bills` (`status: "paid"`, dated on the day of the spend), so budgets and Cash Flow count it.

## Payments and notes

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/payments` | user | All of the user's payments |
| GET | `/api/bills/:id/payments` | user | Newest first |
| POST | `/api/bills/:id/payments` | user | `{ amount, paymentDate, method, status?, reference?, notes?, idempotencyKey? }`. `method`: `cash`, `debit_card`, `credit_card`, `upi`. Completed payments covering the amount mark the bill `paid` and update its installment plan. `201`, or `409` for duplicates. |
| GET | `/api/bills/:id/notes` | user | Newest first |
| POST | `/api/bills/:id/notes` | user | `{ text }` (1–1000 chars). `201` |

## Installment plans

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/installments?status=active\|completed\|cancelled` | user | |
| GET | `/api/installments/:id` | user | `{ plan, installments }` |
| POST | `/api/installments` | user | `{ name, principalAmount, totalInstallments (2–120), startDate, downPayment?, interestRate? (0–100, flat p.a.), planType?, category?, recurringDay?, idempotencyKey? }`. Creates the plan and its bills in one transaction. `201` |
| PATCH | `/api/installments/:id` | user | `{ name?, category?, planType? }` |
| POST | `/api/installments/:id/cancel` | user | Deletes unpaid installments, keeps paid ones. `400` if already cancelled or completed. |

## Subscriptions (recurring series)

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/subscriptions?status=active\|inactive` | user | |
| GET | `/api/subscriptions/:id` | user | |
| POST | `/api/subscriptions` | user | `{ name, amount, category, startDate, recurringDay?, initialStatus? }`. `201` |
| PATCH | `/api/subscriptions/:id` | user | `{ name?, amount?, category?, recurringDay? }` (applies to future occurrences) |
| PATCH | `/api/subscriptions/:id/cancel` | user | Stops future renewals |
| DELETE | `/api/subscriptions/:id?scope=future\|all` | user | `future` (default) stops renewals and keeps history; `all` deletes the series and its bills. `204` |

## Notifications (reminders)

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/notifications?status=unread` | user | Creates missing reminders first: one `due_soon` (due within 5 days) and one `overdue` per bill. Also rewrites the caller's reminders saved with a leading `$` amount to rupees (message text only). |
| GET | `/api/notifications/unread-count` | user | `{ count }` |
| PATCH | `/api/notifications/:id/read` | user | |
| PATCH | `/api/notifications/read-all` | user | `{ success, updatedCount }` |
| PATCH | `/api/notifications/:id/dismiss` | user | Hidden from the list afterwards |

## Pricing and site settings

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/pricing-tiers` | public | Visible tiers. `?includeHidden=true` also returns hidden tiers for admins. |
| POST | `/api/admin/pricing-tiers` | admin | `{ slug, name, price_monthly, price_yearly, billing_period, cta_label, is_highlighted?, is_visible?, sort_order?, features? }`. `409` on duplicate slug. |
| PATCH | `/api/admin/pricing-tiers/:id` | admin | Any of the above |
| DELETE | `/api/admin/pricing-tiers/:id` | admin | |
| GET | `/api/site-settings` | public | Branding and theme; defaults until an admin saves |
| PATCH | `/api/admin/branding` | admin | `{ brand_name, hero_headline, hero_subheadline, hero_cta_label, logo_url }` (`logo_url`: https or null) |
| PATCH | `/api/admin/site-settings` | admin | `{ theme_primary_hsl, theme_accent_hsl, theme_background_hsl, theme_font_pair }` (HSL like `221 83% 53%`) |
| POST | `/api/admin/branding/logo` | admin | Multipart field `logo`: PNG, JPEG, or WebP (checked by file signature), max 2 MB. Returns `{ url }`; save it with `PATCH /api/admin/branding`. |

## Demo account

Available only when `DEMO_CLERK_USER_ID` is set; otherwise status reports `enabled: false` and the other two return `404`. See [DEMO.md](DEMO.md).

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/demo/status` | public | `{ enabled, isDemoUser }`. When called by the demo user, re-seeds data older than 24 hours first. |
| POST | `/api/demo/session` | public, 20 per 15 min per IP | Returns `{ ticket }`, a one-time Clerk sign-in ticket for the demo user only, valid 60 seconds. `404` when off, `503` if Clerk cannot issue it. |
| POST | `/api/demo/reset` | demo user or admin | Deletes and re-seeds only the demo user's data. `403` for others, `429` within 10 seconds of the previous reset. |

## Admin users

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/admin/users?limit=&offset=` | admin | Users from Clerk with `is_admin` / `is_bootstrap_admin` |
| POST | `/api/admin/users/:id/grant-admin` | admin | `:id` is a Clerk user ID. `404` if unknown. |
| POST | `/api/admin/users/:id/revoke-admin` | admin | `400` for yourself or an `ADMIN_CLERK_USER_IDS` user |
| GET | `/api/admin/summary` | admin | `{ adminCount, pricingTiersCount }` |
