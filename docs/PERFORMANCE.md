# Performance notes

## Why the dashboard was slow

Two things, in order of impact:

1. **The free Render API sleeps.** After about 15 minutes with no traffic Render stops the free instance, and the next request waits for it to start again (roughly 30–60 seconds). Everything else in the app has to wait behind that first request.
2. **Database round trips that grew with your data.** Every `GET /api/bills`, `GET /api/subscriptions` and `GET /api/notifications` (the bell polls every minute) first "materialises" recurring bills and reminders. Both routines asked MongoDB one question per bill (`findOne` per month of every recurring series, and per overdue / due-soon bill for reminders). A car loan that started two years ago meant about 24 sequential queries per request, and the dashboard fires three such requests at once.

## What changed

- `generateDueOccurrencesForUser` (`recurrenceService.ts`): works out the months that should exist, then checks which ones already exist with **one** query. Nothing new to create means two queries in total.
- `generateRemindersForUser` (`reminderService.ts`): one existence query per reminder type instead of one per bill, and the "mark reminders for paid bills as read" step now starts from the (few) unread notifications instead of loading every paid bill id.
- `warmUpApi()` (`src/lib/api.ts`, called from `src/main.tsx`): fires a throwaway `GET /api/ready` the moment the app opens, so a sleeping API starts waking while Clerk and the page scripts load. Production builds only.
- `src/test/query-batching.test.ts` pins the query counts so they cannot creep back.

## What still needs a decision

The first visit after a long idle gap can still be slow, because the free instance has to wake up. Options, cheapest first:

1. A free uptime monitor (for example UptimeRobot) pinging `https://billflow-api-96to.onrender.com/api/ready` every 5 minutes keeps the instance awake. One service running all month fits in Render's free hours.
2. Move the API to a paid Render plan, which does not sleep.

## How to measure

Browser DevTools → Network, tick "Disable cache", reload `/dashboard`:

- `/api/bills` waiting time (TTFB) should be a few hundred milliseconds when the API is awake. A request that takes many seconds only on the first load is the cold start.
- Compare `/api/bills` with `/api/ready`: the difference is database work.
