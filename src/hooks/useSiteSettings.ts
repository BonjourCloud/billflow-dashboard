import { createContext, useContext, useEffect, useState, ReactNode, createElement } from 'react';
import { apiRequest } from '@/lib/api';
import { getFontPair } from '@/lib/fontPairs';

export interface SiteSettings {
  id: string;
  brand_name: string;
  logo_url: string | null;
  hero_headline: string;
  hero_subheadline: string;
  hero_cta_label: string;
  theme_primary_hsl: string;
  theme_accent_hsl: string;
  theme_background_hsl: string;
  theme_font_pair: string;
  updated_at: string;
  logo_display_url?: string | null;
}

const DEFAULTS: SiteSettings = {
  id: 'default',
  brand_name: 'BillFlow',
  logo_url: null,
  hero_headline: 'Take Control of Your Financial Life',
  hero_subheadline:
    'Track bills, manage subscriptions, and unlock AI-driven spending insights — all in one beautiful, intuitive dashboard.',
  hero_cta_label: 'Start Free — No Card Needed',
  theme_primary_hsl: '142 71% 45%',
  theme_accent_hsl: '217 91% 60%',
  theme_background_hsl: '222 47% 4%',
  theme_font_pair: 'inter',
  updated_at: new Date().toISOString(),
};

interface Ctx {
  settings: SiteSettings;
  loading: boolean;
  refresh: () => Promise<void>;
}

const SiteSettingsContext = createContext<Ctx | undefined>(undefined);

function applyToDocument(s: SiteSettings) {
  const root = document.documentElement;
  root.style.setProperty('--primary', s.theme_primary_hsl);
  root.style.setProperty('--ring', s.theme_primary_hsl);
  root.style.setProperty('--accent', s.theme_accent_hsl);

  const isLight =
    root.classList.contains('light') ||
    localStorage.getItem('billflow_theme') === 'light';

  if (!isLight) {
    root.style.setProperty('--background', s.theme_background_hsl);
  } else {
    root.style.removeProperty('--background');
  }

  const pair = getFontPair(s.theme_font_pair);
  root.style.setProperty('--font-heading', `'${pair.heading}', system-ui, sans-serif`);
  root.style.setProperty('--font-body', `'${pair.body}', system-ui, sans-serif`);
  document.body.style.fontFamily = `'${pair.body}', system-ui, sans-serif`;

  // Inject Google Fonts link if missing
  const linkId = 'site-settings-fonts';
  let link = document.getElementById(linkId) as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement('link');
    link.id = linkId;
    link.rel = 'stylesheet';
    document.head.appendChild(link);
  }
  if (link.href !== pair.googleHref) link.href = pair.googleHref;

  // Document title
  document.title = s.brand_name;
}


export function SiteSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<SiteSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const data = await apiRequest<Partial<SiteSettings>>(
        '/api/site-settings',
        { authenticated: false },
      );

      const merged = { ...DEFAULTS, ...data } as SiteSettings;
      setSettings(merged);
      applyToDocument(merged);
    } catch (error) {
      console.error('Failed to load site settings:', error);
      setSettings(DEFAULTS);
      applyToDocument(DEFAULTS);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return createElement(
    SiteSettingsContext.Provider,
    { value: { settings, loading, refresh: load } },
    children,
  );
}


export function useSiteSettings() {
  const ctx = useContext(SiteSettingsContext);
  if (!ctx) throw new Error('useSiteSettings must be used within SiteSettingsProvider');
  return ctx;
}
