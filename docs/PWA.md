# Installable app (PWA) and Android

BillWill is an installable web app (PWA). On Android Chrome, open https://billwill.site and choose **Install app** (or "Add to Home screen"). It gets a home-screen icon and opens full-screen without the browser bar.

## What ships

- `public/manifest.webmanifest`: name, `start_url` `/dashboard`, `display: standalone`, icons, shortcuts (Bills, Budget).
- `public/icons/`: `icon-192/512.png` (any), `maskable-192/512.png` (Android adaptive shapes), `apple-touch-icon.png`.
- `public/sw.js`: small service worker. Page loads go to the network first (a new deploy is never hidden behind a stale page) and fall back to `public/offline.html` only when offline. It caches only same-origin hashed `/assets/*` and `/icons/*`. It never touches the API, Clerk, analytics or any non-GET request, so signed-in data always comes from the network.
- `src/lib/pwa.ts`: registers the worker, **production builds only**, after page load; failures are ignored.
- `vercel.json`: `sw.js` is served with `Cache-Control: no-cache` so updates are picked up; the manifest has the right content type.

To release a changed worker, bump `CACHE_VERSION` in `public/sw.js`.

## Verify (after deploying the frontend)

1. Android Chrome → billwill.site → menu → **Install app** is offered.
2. Desktop Chrome → DevTools → Application → Manifest shows no errors; Service Workers shows `sw.js` activated.
3. Turn on airplane mode and reopen the installed app: the "You're offline" screen appears. Back online, **Try again** reloads normally.

## Play Store (optional, next step)

Wrap the PWA as a Trusted Web Activity with PWABuilder (pwabuilder.com) or Bubblewrap. Needs: a Google Play Console account (one-time fee, about ₹2,100), a signing key, and `/.well-known/assetlinks.json` served from billwill.site. A TWA runs in Chrome, so Clerk and Google sign-in keep working. Before a public listing, move Clerk to a production instance (the development instance is invite-only and not meant for the public).

## Tests

`src/test/pwa.test.ts` (registration guards, manifest basics, icons exist).
