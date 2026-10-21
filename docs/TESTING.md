# Testing

## Local setup

```sh
npm ci                   # frontend + test tooling
npm ci --prefix server   # backend (backend tests import server code from server/node_modules)
```

Run the app locally with two terminals:

```sh
npm run dev --prefix server   # API on http://localhost:5001 (needs server/.env)
npm run dev                   # frontend on http://localhost:8080 (needs .env)
```

`server/.env` needs at least `MONGODB_URI`, `CLERK_SECRET_KEY`, and `CLERK_PUBLISHABLE_KEY`; the root `.env` needs `VITE_CLERK_PUBLISHABLE_KEY`. See the `.env.example` files.

## Commands

| Command | What it runs | Needs |
|---|---|---|
| `npm run lint` | ESLint | — |
| `npm run typecheck` | `tsc` for the app, the Vite/Playwright config, and the tests | — |
| `npm run typecheck --prefix server` | `tsc` for the API | Server dependencies |
| `npm test` | Unit tests (Vitest) | Server dependencies |
| `npm run test:integration` | HTTP + MongoDB integration tests | MongoDB binary (downloaded on first run) |
| `npm run test:e2e` | Playwright smoke tests | Chromium + a Clerk publishable key |
| `npm run build` | Production frontend build | `VITE_API_URL`, `VITE_CLERK_PUBLISHABLE_KEY` |
| `npm run build --prefix server` | API build to `server/dist` | — |

`npm test --prefix server` runs the same unit suite as `npm test` (the server tests live in `src/test/`).

## Test suites

### Unit tests — `npm test`

Vitest with jsdom (`vitest.config.ts`); files in `src/test/*.test.ts`. A few files opt into the `node` environment to make real HTTP requests.

They cover:

- zod request schemas and model helpers (bills, payments, notes, installments, subscriptions, pricing tiers);
- recurrence and installment calculations, reminder generation logic, and insight rules;
- environment validation (server variables, `VITE_API_URL` including https-only production URLs, the Clerk publishable key);
- Clerk `authorizedParties` with the real `@clerk/express` middleware, using locally signed tokens (`jwtKey`), so Clerk is never contacted;
- image signature detection for logo uploads;
- the Express error handler, JSON 404, body-size limits, health/readiness, and the rate limiter, by requesting the real app on a local port;
- admin helpers and the role endpoint, with Clerk mocked;
- startup failure reporting and graceful shutdown;
- frontend hooks and stores (e.g. the role hook fetches once per signed-in user);
- drift checks for `render.yaml` and `vercel.json`.

These tests do **not** connect to MongoDB: database calls are mocked or simulated in memory.

### Integration tests — `npm run test:integration`

Configured by `vitest.integration.config.ts`; files in `src/test/integration/`. Each file starts a single-node MongoDB replica set with `mongodb-memory-server` (so transactions work) and sends real HTTP requests to the real Express app.

Two things are substituted:

- **Authentication**: a test middleware sets `req.auth` from an `x-test-user-id` header, the same way `clerkMiddleware` does after verifying a token. Real Clerk tokens are not verified.
- **Clerk Backend API**: `clerkClient` is replaced by an in-memory user directory (`fakeClerk.ts`).

They verify:

- every protected route returns JSON `401` without a user, and every `/api/admin/*` route returns `403` for a non-admin (the route list is read from the app, so new routes are covered automatically);
- users get `404` for each other's bills, payments, notes, installment plans, subscriptions, and notifications, and the other user's data is unchanged;
- admin grant/revoke, self-revoke and bootstrap-admin protection, losing bootstrap access when removed from `ADMIN_CLERK_USER_IDS`, https-only logo URLs, and hidden pricing tiers;
- installment plans are created in a transaction and rolled back by MongoDB when inserting bills fails; idempotency keys; partial and full payments updating plan balances; duplicate-payment protection;
- logo uploads: real PNG/JPEG/WebP files accepted, non-images and mismatched types rejected with `400`, the 2 MB limit, and the `PutObject` request built (the S3 client is replaced with a stub);
- public reads (`/api/site-settings`, `/api/pricing-tiers`) don't write to an empty database, and concurrent startup seeding creates each default tier once;
- Clerk profile sync is cached per user for 15 minutes while role changes apply immediately.

**First run:** `mongodb-memory-server` downloads a MongoDB binary (around 100 MB) into `node_modules/.cache/mongodb-memory-server/`. Later runs reuse it until `node_modules` is reinstalled. CI skips the install-time download (`MONGOMS_DISABLE_POSTINSTALL=1`) and caches that directory, keyed on `package-lock.json`.

### Browser smoke tests — `npm run test:e2e`

Playwright (`playwright.config.ts`, specs in `e2e/`). The config builds the production frontend and serves it with `vite preview` on port 4173.

- The API is **not** running. `VITE_API_URL` is set to `https://api.e2e.test` and every request to it is answered inside the browser with fixed JSON (`page.route`).
- Clerk is **real**: the page loads the Clerk instance from `VITE_CLERK_PUBLISHABLE_KEY` (environment or root `.env`). A development key works.

They check that the landing page renders branding and pricing from the API, that signed-out visitors are redirected from `/dashboard` and `/admin/users` to `/login`, that unknown routes show the 404 page, that the static page metadata and favicons are BillFlow-branded, and that no page errors or unexpected API calls occur.

**First run:** install the browser once with `npx playwright install chromium` (in CI: `npx playwright install --with-deps chromium`).

Signed-in flows are **not** covered by browser tests; they would need a dedicated Clerk test user.

## CI

`.github/workflows/ci.yml` runs lint, type-check, unit tests, integration tests, and both builds on every pull request and on pushes to `main` and `feature/**` branches. The Playwright job runs only when the repository secret `VITE_CLERK_PUBLISHABLE_KEY` is set; otherwise it is skipped with a notice. See [DEPLOYMENT.md](DEPLOYMENT.md#ci-github-actions).

## What no automated test covers

- A real MongoDB Atlas cluster (network access, credentials, performance).
- Real Clerk token verification and the Clerk Backend API.
- S3 uploads and pre-signed URLs.
- Signed-in user flows in a browser.
- The deployed Vercel and Render configuration (beyond the drift checks on the config files).
