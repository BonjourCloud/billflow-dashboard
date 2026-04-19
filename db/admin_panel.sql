-- =====================================================================
-- ADMIN PANEL MIGRATION
-- Run this in your Supabase SQL editor (Dashboard → SQL → New query).
-- Safe to re-run: uses IF NOT EXISTS / DROP POLICY IF EXISTS where needed.
-- =====================================================================

-- 1. ROLES (separate table to avoid privilege-escalation attacks)
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'user');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

DROP POLICY IF EXISTS "Users can read own roles" ON public.user_roles;
CREATE POLICY "Users can read own roles" ON public.user_roles
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can read all roles" ON public.user_roles;
CREATE POLICY "Admins can read all roles" ON public.user_roles
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
CREATE POLICY "Admins can insert roles" ON public.user_roles
  FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;
CREATE POLICY "Admins can delete roles" ON public.user_roles
  FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

-- 2. PRICING TIERS
CREATE TABLE IF NOT EXISTS public.pricing_tiers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            text NOT NULL UNIQUE,
  name            text NOT NULL,
  price_monthly   numeric(10,2) NOT NULL DEFAULT 0,
  price_yearly    numeric(10,2) NOT NULL DEFAULT 0,
  billing_period  text NOT NULL DEFAULT 'month',
  cta_label       text NOT NULL DEFAULT 'Get Started',
  is_highlighted  boolean NOT NULL DEFAULT false,
  is_visible      boolean NOT NULL DEFAULT true,
  sort_order      int NOT NULL DEFAULT 0,
  features        jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pricing_tiers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read visible tiers" ON public.pricing_tiers;
CREATE POLICY "Public can read visible tiers" ON public.pricing_tiers
  FOR SELECT USING (is_visible = true OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins manage tiers" ON public.pricing_tiers;
CREATE POLICY "Admins manage tiers" ON public.pricing_tiers
  FOR ALL USING (public.has_role(auth.uid(), 'admin'))
           WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_pricing_tiers_updated ON public.pricing_tiers;
CREATE TRIGGER trg_pricing_tiers_updated BEFORE UPDATE ON public.pricing_tiers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.pricing_tiers (slug, name, price_monthly, price_yearly, billing_period, cta_label, is_highlighted, sort_order, features)
SELECT * FROM (VALUES
  ('free',       'Free',       0,   0,   'forever', 'Get Started',      false, 1,
    '["Up to 10 bills","Basic analytics","Email reminders","Mobile app"]'::jsonb),
  ('pro',        'Pro',        9,   90,  'month',   'Start Free Trial', true,  2,
    '["Unlimited bills","AI insights","Smart alerts","Export reports","Priority support"]'::jsonb),
  ('enterprise', 'Enterprise', 29,  290, 'month',   'Contact Sales',    false, 3,
    '["Everything in Pro","Team sharing","API access","Custom integrations","Dedicated support"]'::jsonb)
) AS t(slug, name, price_monthly, price_yearly, billing_period, cta_label, is_highlighted, sort_order, features)
WHERE NOT EXISTS (SELECT 1 FROM public.pricing_tiers);

-- 3. SITE SETTINGS (singleton row for branding + theme)
CREATE TABLE IF NOT EXISTS public.site_settings (
  id                   text PRIMARY KEY DEFAULT 'default',
  brand_name           text NOT NULL DEFAULT 'BillFlow',
  logo_url             text,
  hero_headline        text NOT NULL DEFAULT 'Take Control of Your Financial Life',
  hero_subheadline     text NOT NULL DEFAULT 'Track bills, manage subscriptions, and unlock AI-driven spending insights — all in one beautiful, intuitive dashboard.',
  hero_cta_label       text NOT NULL DEFAULT 'Start Free — No Card Needed',
  theme_primary_hsl    text NOT NULL DEFAULT '142 71% 45%',
  theme_accent_hsl     text NOT NULL DEFAULT '217 91% 60%',
  theme_background_hsl text NOT NULL DEFAULT '222 47% 4%',
  theme_font_pair      text NOT NULL DEFAULT 'inter',
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT site_settings_singleton CHECK (id = 'default')
);

ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read settings" ON public.site_settings;
CREATE POLICY "Public can read settings" ON public.site_settings
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins update settings" ON public.site_settings;
CREATE POLICY "Admins update settings" ON public.site_settings
  FOR UPDATE USING (public.has_role(auth.uid(), 'admin'))
              WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins insert settings" ON public.site_settings;
CREATE POLICY "Admins insert settings" ON public.site_settings
  FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS trg_site_settings_updated ON public.site_settings;
CREATE TRIGGER trg_site_settings_updated BEFORE UPDATE ON public.site_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.site_settings (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;

-- 4. BRANDING STORAGE BUCKET
INSERT INTO storage.buckets (id, name, public)
VALUES ('branding', 'branding', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read branding" ON storage.objects;
CREATE POLICY "Public read branding" ON storage.objects
  FOR SELECT USING (bucket_id = 'branding');

DROP POLICY IF EXISTS "Admins upload branding" ON storage.objects;
CREATE POLICY "Admins upload branding" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'branding' AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins update branding" ON storage.objects;
CREATE POLICY "Admins update branding" ON storage.objects
  FOR UPDATE USING (bucket_id = 'branding' AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins delete branding" ON storage.objects;
CREATE POLICY "Admins delete branding" ON storage.objects
  FOR DELETE USING (bucket_id = 'branding' AND public.has_role(auth.uid(), 'admin'));

-- DONE. Grant yourself admin:
--   INSERT INTO public.user_roles (user_id, role)
--   VALUES ('<your-auth-user-uuid>', 'admin');
