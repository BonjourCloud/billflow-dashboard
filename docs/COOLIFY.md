# Deploying BillWill on Coolify (self-hosted)

An alternative to the Vercel + Render setup in [DEPLOYMENT.md](DEPLOYMENT.md). Same architecture, same domain layout, same environment variables; only the hosting changes.

| Piece | Runs as | Public host |
|---|---|---|
| Frontend (Vite SPA) | Coolify app from [`/Dockerfile`](../Dockerfile) (nginx) | `billwill.site`, `www.billwill.site` |
| API (Express, `server/`) | Coolify app from [`/server/Dockerfile`](../server/Dockerfile) | `api.billwill.site` |
| Database | MongoDB Atlas (unchanged) | — |
| Auth | Clerk (unchanged) | — |

**Why Atlas stays:** installment plans use MongoDB transactions, which need a replica set. Atlas provides one. A MongoDB container created inside Coolify is a standalone server, and the API then falls back to sequential writes with manual cleanup. For billing data, keep Atlas.

## 1. Server

1. Create a VPS: Ubuntu 24.04 (or 22.04), at least 2 vCPU and 2 GB RAM (builds need the memory), 40 GB+ disk. Add a 2 GB swap file as a safety net.
2. Note the public IPv4 address (`<VPS_IP>`). It stays fixed for the life of the server.
3. Firewall: allow inbound TCP 22, 80, 443 and 8000 (Coolify dashboard). After step 4 below, close 8000.
4. Install Coolify, then open `http://<VPS_IP>:8000` and create the admin account:

   ```sh
   curl -fsSL https://cdn.coollabs.io/coolify/install.sh | sudo bash
   ```

5. Harden: SSH keys only (disable password login), enable automatic security updates (`unattended-upgrades`).

## 2. DNS (Namecheap → Domain List → Manage → Advanced DNS)

Add these records (remove any default parking/URL-redirect records for `@` and `www`):

| Type | Host | Value |
|---|---|---|
| A Record | `@` | `<VPS_IP>` |
| A Record | `www` | `<VPS_IP>` |
| A Record | `api` | `<VPS_IP>` |

Also add the CNAME records Clerk shows for your production instance (section 4). Check propagation with `dig +short billwill.site` and `dig +short api.billwill.site` before deploying; both must return `<VPS_IP>`, otherwise certificate issuance fails.

In Coolify, set **Settings → Instance's Domain** to e.g. `https://coolify.billwill.site` (add a matching A record) so the dashboard is served over HTTPS, then close port 8000.

## 3. MongoDB Atlas

Atlas → Network Access → add `<VPS_IP>` (replaces the Render outbound IPs listed in DEPLOYMENT.md). Use a dedicated database user and keep the database name in the connection string path.

The free M0 tier has no automated backups. Before real customer data goes in, either move to a paid tier with backups or schedule a `mongodump` to S3.

## 4. Clerk

Use a production instance (`pk_live_…` / `sk_live_…`) with domain `billwill.site`. Add the DNS records Clerk lists to Namecheap exactly as shown, wait for Clerk to verify them, then set redirect/after-sign-in URLs to the production domain. The same publishable key goes into the frontend (build variable) and the API.

## 5. Create the two applications in Coolify

Project → New Resource → **Public/Private Repository (GitHub)** → pick the repo and branch (`main`). Use a GitHub App or deploy key for a private repo. Build pack: **Dockerfile**.

### 5a. API (`billwill-api`)

| Coolify setting | Value |
|---|---|
| Base Directory | `/server` |
| Dockerfile Location | `/Dockerfile` |
| Ports Exposes | `5001` |
| Domains | `https://api.billwill.site` |
| Health check | Path `/api/ready`, port `5001` (the image also has a built-in `HEALTHCHECK`) |

Environment variables (runtime):

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | `5001` |
| `TRUST_PROXY` | `1` (Coolify's proxy is a single hop; use `2` if you later put Cloudflare in front) |
| `CLIENT_URL` | `https://billwill.site,https://www.billwill.site` |
| `MONGODB_URI` | Atlas connection string (secret) |
| `CLERK_SECRET_KEY` | `sk_live_…` (secret) |
| `CLERK_PUBLISHABLE_KEY` | `pk_live_…` |
| `ADMIN_CLERK_USER_IDS` | your `user_…` ID(s) |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `AWS_S3_BUCKET` | only if you use logo uploads |

### 5b. Frontend (`billwill-web`)

| Coolify setting | Value |
|---|---|
| Base Directory | `/` |
| Dockerfile Location | `/Dockerfile` |
| Ports Exposes | `80` |
| Domains | `https://billwill.site,https://www.billwill.site` |

Environment variables. **Tick "Build Variable"** on both, because Vite compiles them into the bundle:

| Variable | Value |
|---|---|
| `VITE_API_URL` | `https://api.billwill.site` |
| `VITE_CLERK_PUBLISHABLE_KEY` | `pk_live_…` (same key as the API) |

Optional: enable Coolify's redirect option so `www` redirects to the bare domain (or the reverse). `CLIENT_URL` already allows both origins.

### 5c. Auto-deploy

Enable **Automatic Deployment** on each app (GitHub webhook). Pushes to `main` redeploy. If you only want to deploy after CI passes, leave it off and press Deploy manually.

## 6. Post-deploy checklist

1. `curl -s https://api.billwill.site/api/ready` returns 200 with `"database": "connected"`.
2. `https://billwill.site` loads with branding and pricing tiers; no CORS errors in the browser console.
3. Reload `https://billwill.site/dashboard`: it serves the app, not a 404.
4. Sign in with Clerk; the dashboard loads bills with no 401s.
5. `/admin` works for your bootstrap admin ID.
6. Response headers on the API show rate-limit headers, and the rate limiter sees real client IPs (`TRUST_PROXY=1`).
7. If S3 is configured, upload a logo and confirm it displays.

## 7. Operations

- **Uptime monitoring:** point UptimeRobot (free) at `https://api.billwill.site/api/ready` and `https://billwill.site`, with email or Telegram alerts. Coolify restarts crashed containers, but it cannot tell you the VPS itself is down.
- **Disk:** Docker images and build cache accumulate. In Coolify → Server → Docker Cleanup, enable scheduled cleanup, and check `df -h` monthly.
- **Updates:** update Coolify from its dashboard; run OS updates in a quiet window (a reboot means a minute or two of downtime).
- **Rollback:** Coolify keeps previous deployments. Redeploy an earlier commit from the app's Deployments tab.
- **Secrets:** never commit `.env` files; set values only in Coolify.
- **Single server:** one VPS is one point of failure and there is no failover. That is acceptable for an MVP; revisit when customers depend on uptime.
