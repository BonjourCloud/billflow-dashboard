# Admin Panel — Setup Guide

This project includes a full admin panel for managing pricing tiers, branding, and theme. Admin access is gated by a Supabase `user_roles` table (separate from `profiles` to prevent privilege-escalation attacks).

## 1. Run the migration

Open your Supabase Dashboard → **SQL Editor** → **New query** and paste the contents of [`db/admin_panel.sql`](./db/admin_panel.sql). Click **Run**.

This creates:
- `app_role` enum (`admin`, `user`)
- `user_roles` table + `has_role()` SECURITY DEFINER function
- `pricing_tiers` table (seeded with Free / Pro / Enterprise)
- `site_settings` table (singleton row with brand, hero copy, theme)
- `branding` storage bucket (public read, admin write)
- All RLS policies

The script is idempotent — safe to re-run.

## 2. Grant yourself admin

Find your user ID in Supabase Dashboard → **Authentication → Users**, then run in the SQL editor:

```sql
INSERT INTO public.user_roles (user_id, role)
VALUES ('YOUR-USER-UUID-HERE', 'admin');
```

Refresh the app — you'll now see an **Admin** link in the dashboard header and on the landing nav.

## 3. Use the admin panel

Visit `/admin`:

| Page | What you can do |
|------|-----------------|
| **Overview** (`/admin`) | Quick stats and links |
| **Pricing** (`/admin/pricing`) | Add / edit / delete / reorder / hide pricing tiers. Edit name, monthly+yearly price, billing period, CTA label, feature bullets, highlight badge, visibility |
| **Branding** (`/admin/branding`) | Brand name, logo upload (or URL), landing-page hero headline / subheadline / CTA button text |
| **Theme** (`/admin/theme`) | Color pickers for primary / accent / background (HSL), 5 preset palettes, font-pair selector with live preview |

All changes save to Supabase and propagate live via realtime subscriptions — public visitors see updates without refreshing.

## 4. How it works under the hood

- **Theme** writes raw HSL strings into CSS variables (`--primary`, `--accent`, `--background`) on `document.documentElement`. Existing Tailwind tokens (which use `hsl(var(--primary))`) pick them up automatically — no rebuild needed.
- **Fonts** inject a Google Fonts `<link>` tag and set the document font-family.
- **Logo** is uploaded to the `branding` storage bucket and stored as a public URL in `site_settings.logo_url`.
- **Pricing tiers** on the landing page are rendered from `pricing_tiers` ordered by `sort_order`, filtered to `is_visible = true`.

## 5. Adding more admins

Anyone with the `admin` role can grant the role to others — but currently only via SQL (no user-list UI yet). To add another admin:

```sql
INSERT INTO public.user_roles (user_id, role)
VALUES ('<other-user-uuid>', 'admin');
```

To revoke:
```sql
DELETE FROM public.user_roles WHERE user_id = '<uuid>' AND role = 'admin';
```

## 6. Security notes

- **Never** store the `role` column on the `profiles` or `users` table — that's vulnerable to privilege escalation. Use `user_roles` + `has_role()` as set up here.
- All admin tables enforce RLS — non-admins cannot mutate pricing or settings even with a forged client request.
- The `branding` bucket allows public reads but only admin writes.
- All admin form inputs are validated with Zod before insert/update.

## 7. Files reference

```
db/admin_panel.sql                       — one-shot migration
src/lib/supabase.ts                      — Supabase client
src/lib/fontPairs.ts                     — Google Fonts presets
src/contexts/AuthContext.tsx             — session
src/hooks/useUserRole.ts                 — isAdmin check
src/hooks/useSiteSettings.ts             — settings + CSS-var injection (Provider)
src/hooks/usePricingTiers.ts             — pricing data
src/components/AdminRoute.tsx            — route guard
src/components/admin/AdminLayout.tsx     — sidebar layout
src/pages/admin/AdminDashboard.tsx       — overview
src/pages/admin/AdminPricing.tsx         — CRUD UI
src/pages/admin/AdminBranding.tsx        — logo + hero copy
src/pages/admin/AdminTheme.tsx           — colors + fonts
```
