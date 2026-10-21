# Real vs. Mocked — Current State

The app no longer uses mock data: every screen reads and writes through the Express API and MongoDB. This page lists, for each external integration, what the running app uses and what each test suite substitutes.

## Integrations

| Integration | Running app | Unit tests (`npm test`) | Integration tests (`npm run test:integration`) | Browser tests (`npm run test:e2e`) |
|---|---|---|---|---|
| MongoDB | Real (Atlas via `MONGODB_URI`) | Mocked or simulated in memory | **Real** MongoDB, in-memory replica set | Not used (API mocked) |
| Express API | Real | Real app for HTTP-level tests (error handling, health, rate limits) | **Real** app and routes | Mocked in the browser (`page.route`) |
| Clerk sign-in (frontend) | Real | Not used | Not used | **Real** Clerk instance, signed-out only |
| Clerk token verification | Real (`clerkMiddleware`) | Replaced by a fake `req.auth` | Replaced by a fake `req.auth` set from a header | Not used |
| Clerk Backend API (user lookups) | Real (`clerkClient`) | Mocked | In-memory fake directory | Not used |
| AWS S3 (logos) | Real when AWS credentials are set; otherwise uploads return 503 | Client configuration only | Not used | Not used |

## Features that are intentionally local

| Feature | How it works |
|---|---|
| Dashboard insights ("AI Insights" widget) | Rule-based calculations in `src/lib/insights.ts`, run in the browser. No AI or LLM service is called. |
| Reminders | In-app notifications created when the user loads notifications. No email, SMS, or push. |
| Recurring bills | Created when the user lists bills, subscriptions, or notifications. There is no background scheduler. |
| Theme preference | Light/dark choice stored in the browser's `localStorage`; brand colors come from site settings in MongoDB. |

## Not yet verified against real services

Configuration for these exists and is covered by tests in this repo, but has not been exercised against the real service:

- A production deployment on Vercel and Render.
- A live MongoDB Atlas cluster.
- Clerk production keys, token verification, and the Clerk Backend API.
- S3 logo uploads and pre-signed URLs.
- Signed-in flows in a real browser.

See [DEPLOYMENT.md](DEPLOYMENT.md#post-deploy-checklist-manual) for the manual checklist.

## History

Earlier versions were a frontend-only prototype with hardcoded mock data, and later planned to use Supabase for auth and storage. Both were replaced: the Supabase client was removed in `c970756`, and the unused Supabase SQL migrations (`db/`) were removed in Iteration 4. Authentication now uses Clerk and data lives in MongoDB.
