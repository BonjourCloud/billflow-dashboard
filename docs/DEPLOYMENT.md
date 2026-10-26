# Deployment & Production Guide

BillFlow deploys as three pieces:

| Piece | Where | Config in repo |
|---|---|---|
| Frontend (Vite SPA) | Vercel | [`vercel.json`](../vercel.json) |
| Backend (Express API in `server/`) | Render | [`render.yaml`](../render.yaml) |
| Database | MongoDB Atlas | — (connection string only) |

Authentication uses Clerk, and optional branding-logo uploads use a private AWS S3 bucket.

> **Status (Iteration 5):** BillFlow has **not been deployed yet**; no Vercel project, Render service, Atlas cluster, or production Clerk instance has been connected from this repository. What has been verified locally: the compiled API started exactly as Render runs it (`npm start`, `NODE_ENV=production`, `TRUST_PROXY=1`) against a MongoDB replica set, with `/api/health` and `/api/ready` returning `200`, JSON `401`/`404`/`400` errors, CORS limited to `CLIENT_URL`, Helmet security headers, rate-limit headers, and no secrets in its logs. The configuration is also checked by CI and the tests in [TESTING.md](TESTING.md). Use the post-deploy checklist at the end the first time you deploy.

## Recommended order

1. Create the MongoDB Atlas cluster and database user.
2. Create (or choose) the Clerk instance you will use in production.
3. Deploy the API to Render. Set `CLIENT_URL` to the frontend URL you intend to use (you can update it after step 4).
4. Deploy the frontend to Vercel with `VITE_API_URL` pointing at the Render service.
5. Confirm `CLIENT_URL` on Render exactly matches the Vercel origin, then run the post-deploy checklist.

### Domain layout (billwill.site)

This project is configured for the custom domain **billwill.site**:

| Host | Serves | Points at |
|---|---|---|
| `billwill.site`, `www.billwill.site` | Frontend (Vercel) | Vercel's A/CNAME records |
| `api.billwill.site` | Backend API (Render) | `CNAME` → the Render service |

So the production values are:

- Vercel: `VITE_API_URL=https://api.billwill.site`
- Render: `CLIENT_URL=https://billwill.site,https://www.billwill.site` (already defaulted in `render.yaml`)

Add the domains in each platform's dashboard (Vercel → Project → Domains; Render → Service → Settings → Custom Domains), then create the DNS records they show at your registrar. Both platforms issue TLS certificates automatically once DNS resolves.

## 1. MongoDB Atlas

1. Create a cluster. Atlas clusters are replica sets, so installment-plan creation runs inside a MongoDB transaction (the API falls back to a non-transactional path with manual cleanup only on standalone servers).
2. Create a database user with read/write access to the BillFlow database.
3. Network access: allow the Render service's outbound IP addresses (listed in the Render dashboard for your service). Allowing `0.0.0.0/0` also works but relies entirely on the database credentials.
4. Copy the `mongodb+srv://…` connection string, include the database name in the path, and store it only as the `MONGODB_URI` secret on Render.

On startup the API connects, seeds the default pricing tiers if the collection is empty (only at startup — public reads never write, so tiers an admin deletes stay deleted), and lets Mongoose create the indexes defined in `server/src/models/` (including the unique idempotency-key indexes for payments and installment plans).

## 2. Clerk

- Use the **same** Clerk instance on both sides: `VITE_CLERK_PUBLISHABLE_KEY` (frontend) and `CLERK_PUBLISHABLE_KEY` (backend) must be the same key, and `CLERK_SECRET_KEY` must belong to that instance.
- For production, create a Clerk production instance (`pk_live_…` / `sk_live_…` keys) and configure your production domain in the Clerk dashboard. Development keys (`pk_test_…` / `sk_test_…`) are accepted by the validation and are fine for staging.
- The frontend sends the Clerk session token as `Authorization: Bearer …`; the API verifies it with `clerkMiddleware`. No cookies are shared across origins, so CORS does not need credentials.
- The API passes the `CLIENT_URL` origins to Clerk as `authorizedParties`. Clerk session tokens carry the origin they were issued to (`azp`); a token issued to any other origin, or without that claim, is treated as signed out. CORS and Clerk therefore use the same origin list.

## 3. Backend on Render

[`render.yaml`](../render.yaml) is a Render Blueprint for a Node web service named `billflow-api`:

| Setting | Value | Why |
|---|---|---|
| `rootDir` | `server` | The API is its own npm package |
| `buildCommand` | `npm ci --include=dev && npm run build` | `NODE_ENV=production` would otherwise skip TypeScript |
| `startCommand` | `npm start` (`node dist/index.js`) | |
| `healthCheckPath` | `/api/ready` | Returns 503 until MongoDB is connected |
| `plan` | `free` | Free instances sleep when idle — switch to a paid plan for production traffic |

Steps:

1. In Render, create a new **Blueprint** from this repository.
2. Render prompts for every variable marked `sync: false`. Fill them in (see [Environment Variables](#environment-variables)); leave the optional AWS values empty if you are not using logo uploads.
3. `PORT` is injected by Render; `NODE_ENV=production`, `NODE_VERSION=24`, `TRUST_PROXY=1`, and `AWS_REGION=us-east-1` are set by the Blueprint.

**The server refuses to start with invalid configuration.** It validates every variable at boot (`server/src/config/env.ts`), prints the variable names that are wrong (never their values), and exits with code 1. If MongoDB is unreachable, startup logs the underlying error (connection-string credentials are redacted) and exits with code 1, so a failed deploy shows up in Render's logs rather than as a silently unhealthy service.

Endpoints useful for operations:

- `GET /api/health` — liveness; always 200 while the process runs, and reports the database state.
- `GET /api/ready` — readiness; 200 only when MongoDB is connected, otherwise 503.

Both bypass authentication and rate limiting.

### Rate limiting

All `/api` routes are limited to 1000 requests per 15 minutes per signed-in user (or per client IP when signed out). Granting/revoking admin and logo uploads are limited to 30 per 15 minutes. Exceeding a limit returns JSON `429` with standard `RateLimit` headers.

Counters are kept in each instance's memory. With a single instance this is exact; if you scale to several instances, each counts separately (a shared store such as Redis would be needed for global limits). `TRUST_PROXY=1` is required on Render so limits use the real client IP instead of Render's proxy.

### Admin access

- `ADMIN_CLERK_USER_IDS` lists Clerk user IDs (`user_…`) that are always admins. Use it to bootstrap the first admin, then grant others from **Admin → Users**.
- Bootstrap admins are resolved from the environment on every request; removing an ID removes that person's admin access.
- Admins granted from the UI are stored in MongoDB and keep access until revoked in the UI. Note: before Phase 4A, signing in as a bootstrap admin also saved `role: "admin"` in MongoDB. If any bootstrap admin signed in before that change, revoke them in **Admin → Users** after removing their ID from the variable.

### Logo uploads (optional)

- Use a **private** S3 bucket. Uploaded logos are stored under `branding/` and displayed through pre-signed URLs that expire after one hour.
- The IAM credentials need `s3:PutObject` and `s3:GetObject` on `arn:aws:s3:::<bucket>/branding/*`.
- Uploads must be PNG, JPEG, or WebP up to 2 MB. The API checks the file's leading bytes, not just the declared type, and stores the detected content type.
- Without AWS credentials, valid uploads return `503`; admins can still paste an `https://` logo URL (non-https URLs are rejected).

## 4. Frontend on Vercel

[`vercel.json`](../vercel.json) configures the Vite build (`npm run build` → `dist/`), rewrites all routes to `index.html` so deep links such as `/bill/123` work on reload, caches `/assets/*` immutably (filenames are content-hashed), and adds `X-Content-Type-Options`, `Referrer-Policy`, and `X-Frame-Options` headers.

1. Import the repository in Vercel (project root = repository root).
2. Set these environment variables for Production (and Preview, if used):
   - `VITE_API_URL` — the API origin, `https://api.billwill.site` (or the raw Render URL such as `https://billflow-api.onrender.com` before the custom domain resolves). No trailing path.
   - `VITE_CLERK_PUBLISHABLE_KEY` — the Clerk publishable key.
3. Deploy.

**Production builds fail fast** if `VITE_API_URL` is missing, is not an absolute URL, or uses `http://` for anything other than `localhost`, or if `VITE_CLERK_PUBLISHABLE_KEY` is missing or does not start with `pk_test_`/`pk_live_`. This prevents shipping a bundle that calls `localhost` or cannot start. Use `npm run build:dev` for a development-mode build without these checks.

**Preview deployments:** each Vercel preview has its own origin. The API only allows origins listed in `CLIENT_URL`, for both CORS and Clerk's authorized parties, so either add the preview origins you need (comma-separated) or expect previews to be blocked.

## Environment Variables

Client-safe values use `VITE_`-prefixed variables (e.g. `VITE_API_URL`, `VITE_CLERK_PUBLISHABLE_KEY`), while database connection strings (`MONGODB_URI`), Clerk secret keys (`CLERK_SECRET_KEY`), and AWS S3 credentials remain strictly server-side.

`VITE_` variables are compiled into the public JavaScript bundle; never put secrets in them. Templates: [`.env.example`](../.env.example) (frontend) and [`server/.env.example`](../server/.env.example) (backend).

### Frontend (Vercel)

| Variable | Required | Notes |
|---|---|---|
| `VITE_API_URL` | Production builds | API origin; must be `https://` in production builds (except `localhost`). Development falls back to `http://localhost:5001`. |
| `VITE_CLERK_PUBLISHABLE_KEY` | Always | `pk_test_…` or `pk_live_…` |

### Backend (Render)

| Variable | Required | Notes |
|---|---|---|
| `NODE_ENV` | — | `development` (default), `production`, or `test` |
| `PORT` | — | Default `5001`; Render injects its own |
| `CLIENT_URL` | Production | Allowed frontend origin(s), comma-separated, no paths (e.g. `https://billflow.vercel.app`). Used for CORS and Clerk's authorized parties. Defaults to `http://localhost:8080` outside production. |
| `MONGODB_URI` | Yes | Must start with `mongodb://` or `mongodb+srv://` |
| `CLERK_SECRET_KEY` | Yes | `sk_test_…` or `sk_live_…` |
| `CLERK_PUBLISHABLE_KEY` | Yes | Same key as the frontend |
| `TRUST_PROXY` | — | Proxy hops in front of the API; `0` by default, `1` on Render |
| `ADMIN_CLERK_USER_IDS` | — | Comma-separated Clerk user IDs (`user_…`) |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | — | Must be set together; enable logo uploads |
| `AWS_REGION` | — | e.g. `us-east-1` |
| `AWS_S3_BUCKET` | Production, if AWS credentials are set | Bucket for logos |
| `CLERK_TELEMETRY_DISABLED` | — | Optional. Set to `1` to turn off the Clerk SDK's usage telemetry, which it sends when using development keys. |

## CI (GitHub Actions)

[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs on pushes to `main` and `feature/**` branches, on pull requests, and manually:

- **frontend** — installs both packages, then lint, type-check, unit tests, integration tests (in-memory MongoDB; the binary is cached), and a production build with placeholder `VITE_API_URL`/`VITE_CLERK_PUBLISHABLE_KEY` values (a compile check only).
- **server** — type-check and build of `server/`.
- **fullstack-e2e** — Playwright journeys at three viewport sizes against the real API on an in-memory MongoDB, with a test-only Clerk stand-in. Needs no secrets.
- **e2e** — Playwright smoke tests against a production build. Requires the optional repository secret `VITE_CLERK_PUBLISHABLE_KEY` (a Clerk development key is enough). Without it — including on pull requests from forks — the job's steps are skipped with a notice instead of failing.

No other secrets are needed; CI never connects to Atlas, Clerk's Backend API, or S3. Deployment is not triggered by CI: Vercel and Render deploy from the connected branch on their own.

## Post-deploy checklist (manual)

Run these the first time you deploy and after configuration changes:

1. `GET https://<render-service>/api/ready` returns `200` with `"database": "connected"`.
2. The landing page loads with branding and pricing tiers (no CORS errors in the browser console).
3. Reloading a deep link such as `/dashboard` serves the app, not a 404.
4. Sign in with Clerk; the dashboard loads bills without `401` responses.
5. A bootstrap admin can open `/admin` and see the user list.
6. If S3 is configured, upload a logo in **Admin → Branding** and confirm it displays after saving.
