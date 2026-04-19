---
name: Admin Panel
description: Roles-based admin at /admin. Manages pricing tiers, branding (logo/hero), theme (colors/fonts) via Supabase tables with realtime sync.
type: feature
---

Admin panel lives at `/admin` and is gated by `AdminRoute` which checks the `user_roles` table for an `admin` role.

**Storage:** project uses external Supabase (`VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`). NOT Lovable Cloud.

**Schema** (see `db/admin_panel.sql`):
- `user_roles` (separate table, prevents privilege escalation) + `has_role()` SECURITY DEFINER function
- `pricing_tiers` — slug, name, price_monthly, price_yearly, billing_period, cta_label, is_highlighted, is_visible, sort_order, features[] (jsonb)
- `site_settings` — singleton row with brand_name, logo_url, hero copy, theme HSL colors, font pair
- `branding` storage bucket (public read, admin write) for logos

**Frontend pattern:**
- `SiteSettingsProvider` writes HSL strings into `--primary` / `--accent` / `--background` CSS vars on `:root` — Tailwind tokens pick them up live. Subscribes to `postgres_changes` for realtime updates.
- Font pair injects Google Fonts `<link>` and sets document font-family.
- All admin mutations validated with Zod.

**Granting admin:** `INSERT INTO user_roles (user_id, role) VALUES ('uuid', 'admin');` — no UI for this yet.

**Routes:** `/admin` (overview), `/admin/pricing`, `/admin/branding`, `/admin/theme`.
