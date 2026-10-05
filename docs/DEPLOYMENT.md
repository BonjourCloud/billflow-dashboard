# Deployment & Production Guide

The app is a static SPA — build output is plain HTML/JS/CSS (`dist/`). Any static host works.

## Build

```sh
npm run build      # outputs dist/
npm run preview    # serve the production build locally
```

## Option A — GitHub + Vercel (recommended)

1. **Push to GitHub.** In Lovable: Plus (+) menu → GitHub → Connect project → Create Repository. Changes sync two-way automatically. Or manually:
   ```sh
   git remote add origin <your-repo-url>
   git push -u origin main
   ```
2. **Import in Vercel** → New Project → pick the repo. Vercel auto-detects Vite:
   - Build command: `npm run build`
   - Output directory: `dist`
3. **SPA fallback**: add `vercel.json` so deep links like `/bill/1` don't 404:
   ```json
   { "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
   ```
4. Every push to `main` deploys automatically; PRs get preview deployments.

## Option B — Turso (SQLite cloud) as a future data layer

Turso is a **database**, not a static host — you still deploy the frontend via Vercel/Netlify/AWS. Use Turso when replacing mock state with real persistence:

1. `turso db create billflow` → get URL + auth token.
2. Add `@libsql/client` and a thin data layer (or Drizzle ORM) replacing `useBillStore`'s mock seed.
3. Because the app is client-only, direct browser→Turso access exposes the token. Put a small API in front (Vercel serverless functions or a tiny Express/Fastify service) and keep `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` as server-side env vars.
4. Schema sketch:
   ```sql
   CREATE TABLE bills (id TEXT PRIMARY KEY, name TEXT, amount REAL,
     due_date TEXT, status TEXT, category TEXT, is_subscription INTEGER);
   CREATE TABLE payments (id TEXT PRIMARY KEY, bill_id TEXT, amount REAL,
     date TEXT, method TEXT, status TEXT);
   CREATE TABLE notes (id TEXT PRIMARY KEY, bill_id TEXT, text TEXT, created_at TEXT);
   ```

## Option C — AWS

**Static hosting (frontend as-is):**

1. `npm run build`
2. Create an S3 bucket, upload `dist/`, disable public-access blocking for the bucket (or keep private + OAC).
3. Put **CloudFront** in front (HTTPS, caching). Set custom error responses: 403/404 → `/index.html` (200) for SPA routing.
4. Optional: `aws s3 sync dist/ s3://<bucket> --delete` in CI (GitHub Actions) with OIDC credentials.

**With a backend later:** API Gateway + Lambda (Node) + DynamoDB or Aurora Serverless; or App Runner/ECS for a containerized API. Keep the SPA on S3+CloudFront and point the app's data layer at the API URL via an env var.

## CI (GitHub Actions) sketch

```yaml
name: ci
on: [push]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npx tsc -b
      - run: npx vitest run
      - run: npm run build
```

## Environment Variables

None required today (no backend). When auth/persistence lands, use `VITE_`-prefixed vars for client-safe values (e.g. `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) and keep service-role/DB secrets strictly server-side.
