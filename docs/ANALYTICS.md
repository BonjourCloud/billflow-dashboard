# Google Analytics (GA4)

BillWill can send anonymous page-view statistics to Google Analytics 4. It is **off unless** `VITE_GA_MEASUREMENT_ID` is set at build time.

## Setup

- GA4 property: web stream `billwill`, URL `https://billwill.site`, Measurement ID `G-5BQ0TYTBD2` (the ID is public, not a secret).
- In **Vercel → Project → Settings → Environment Variables** add `VITE_GA_MEASUREMENT_ID=G-5BQ0TYTBD2` for the **Production** environment only (leave Preview and Development empty so previews, local runs and tests send nothing).
- `VITE_` variables are compiled into the bundle, so **redeploy the frontend** after adding it.

## How it works

- `src/lib/analytics.ts` validates the ID (`G-` + 4–20 capitals/digits), skips browsers sending Do Not Track, and injects `gtag.js` once. Called from `src/main.tsx`.
- Page views on route changes are counted by GA4 **Enhanced measurement** ("Page changes based on browser history events", on by default for web streams). Do not also send manual `page_view` events or views double-count.
- One custom event: `demo_started` (a visitor clicked "Try the demo"). Use `trackEvent(name, params)` for more.
- Never send amounts, bill names, emails, or user IDs as event parameters.

## Verify

1. Open https://billwill.site, then GA → Reports → **Realtime**; you should appear within a minute (standard reports take up to ~24 h).
2. Browser DevTools → Network: a request to `googletagmanager.com/gtag/js?id=G-5BQ0TYTBD2`.
3. Ad blockers hide the traffic; test in a clean profile.

## Privacy and housekeeping

- Mention analytics in your privacy policy; add a consent banner if you serve EU/UK visitors.
- GA Admin → Data streams → Configure tag settings → **Define internal traffic** and add your own IP to exclude your visits.
- If a Content-Security-Policy is added later, allow `https://www.googletagmanager.com` (script) and `https://*.google-analytics.com` (connect).
- Tests: `src/test/analytics.test.ts`.
