# Mocked vs. Real — Current State & Pending Work

## What's REAL (working, local)

| Feature | Status |
|---|---|
| Dashboard bento grid, all widgets | ✅ Real UI, fully interactive |
| Search, status/category filters, sorting | ✅ Real (client-side, in-memory) |
| Chart → table category filtering + clear | ✅ Real |
| Add / Edit / Delete bills (dialog + validation) | ✅ Real, but **in-memory only** (lost on reload) |
| Bill Detail page, add-note UI | ✅ Real UI over mock data |
| Dark/light theme toggle | ✅ Real |
| Animations, responsive layout | ✅ Real |

## What's MOCKED (hardcoded data, no backend)

| Area | Where | Notes |
|---|---|---|
| Bills list | `src/data/bills.ts` (`MOCK_BILLS`, 15 rows) | Seeds the store on every load |
| Payment history | `src/data/billDetails.ts` (`MOCK_PAYMENTS`) | Static per-bill records |
| Notes | `src/data/billDetails.ts` (`MOCK_NOTES`) | New notes are session-local |
| AI Insights | `AIInsightsWidget.tsx` | Placeholder heuristics (duplicate subscriptions), no real AI call |
| Stats/totals | derived in `useBillStore` | Computed from mocks — logic real, data fake |

**There are zero network calls.** No API keys, no env vars, no auth.

## What's PENDING (not in the codebase yet)

These were discussed/planned but are **not implemented** in the current code:

1. **Authentication** — Google OAuth sign-up/sign-in.
   - Planned via the user's **own Supabase project** (not Lovable Cloud): `@supabase/supabase-js` with `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`, Google provider enabled in Supabase dashboard + Google Cloud OAuth consent screen.
2. **Landing page** — public SaaS marketing page (hero, features, pricing, testimonials) shown to signed-out users, with the dashboard behind auth.
3. **Persistence** — replace mock seed with a real database (Supabase Postgres or Turso — see DEPLOYMENT.md), incl. `profiles` table and an auto-profile trigger.
4. **Admin panel** — role-based (`user_roles` table + `has_role()` security-definer function, never roles on profiles):
   - Pricing tier management (free/pro/enterprise) editable from the UI
   - Users page (`/admin/users`) to grant/revoke admin via security-definer RPCs
   - Theme/appearance settings
5. **Real AI insights** — wire the insights widget to an actual LLM endpoint.

## Migration Path (when backend lands)

1. Add Supabase client + auth context; gate `/` dashboard behind session, landing page at `/` for signed-out users.
2. Create tables (`bills`, `payments`, `notes`, `profiles`, `user_roles`) with RLS + GRANTs.
3. Swap `useBillStore`'s mock seed for queries against the real tables; keep the same hook API so components don't change.
4. Move secrets server-side wherever service-role access is needed (e.g. listing auth users).
