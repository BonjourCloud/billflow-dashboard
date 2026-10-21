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
| 409 | Duplicate submission (same idempotency key, identical payment within 4 s) or duplicate pricing-tier slug |
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
| GET | `/api/bills` | user | All bills, by due date. Creates any due recurring occurrences first. |
| GET | `/api/bills/:id` | user | |
| POST | `/api/bills` | user | `{ name, amount, dueDate, status, category, recurrenceType?, recurringDay?, isSubscription? }`. `recurrenceType: "recurring"` also creates a subscription series. `201` |
| PATCH | `/api/bills/:id` | user | Any of the above plus `updateScope: "this" \| "future"` for recurring bills |
| DELETE | `/api/bills/:id?scope=this\|future\|all` | user | `204`. Paid occurrences are never deleted by `future`. Installment bills return `400` (cancel the plan instead). |

`status`: `paid`, `pending`, `overdue`. `category`: `utilities`, `entertainment`, `software`, `finance`, `insurance`, `housing`.

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
| GET | `/api/notifications?status=unread` | user | Creates missing reminders first: one `due_soon` (due within 5 days) and one `overdue` per bill |
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

## Admin users

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/admin/users?limit=&offset=` | admin | Users from Clerk with `is_admin` / `is_bootstrap_admin` |
| POST | `/api/admin/users/:id/grant-admin` | admin | `:id` is a Clerk user ID. `404` if unknown. |
| POST | `/api/admin/users/:id/revoke-admin` | admin | `400` for yourself or an `ADMIN_CLERK_USER_IDS` user |
| GET | `/api/admin/summary` | admin | `{ adminCount, pricingTiersCount }` |
