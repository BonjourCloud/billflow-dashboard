import { useEffect, useState } from 'react';
import { Save, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import { FONT_PAIRS } from '@/lib/fontPairs';

const PRESETS = [
  { label: 'Emerald (default)', primary: '142 71% 45%', accent: '217 91% 60%', background: '222 47% 4%' },
  { label: 'Indigo Night',      primary: '239 84% 67%', accent: '280 87% 65%', background: '230 35% 7%' },
  { label: 'Sunset Coral',      primary: '14 90% 60%',  accent: '38 92% 55%',  background: '20 30% 6%' },
  { label: 'Ocean Deep',        primary: '199 89% 48%', accent: '174 72% 56%', background: '210 50% 5%' },
  { label: 'Royal Gold',        primary: '43 89% 55%',  accent: '291 64% 60%', background: '260 30% 6%' },
];

function hslToHex(hsl: string): string {
  const m = hsl.match(/(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%/);
  if (!m) return '#000000';
  const h = +m[1], s = +m[2] / 100, l = +m[3] / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m2 = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const toHex = (v: number) => Math.round((v + m2) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hexToHsl(hex: string): string {
  const m = hex.replace('#', '').match(/^([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i);
  if (!m) return '0 0% 0%';
  const r = parseInt(m[1], 16) / 255, g = parseInt(m[2], 16) / 255, b = parseInt(m[3], 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0; const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)); break;
      case g: h = ((b - r) / d + 2); break;
      case b: h = ((r - g) / d + 4); break;
    }
    h *= 60;
  }
  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

export default function AdminTheme() {
  const { settings, refresh } = useSiteSettings();
  const [primary, setPrimary] = useState(settings.theme_primary_hsl);
  const [accent, setAccent] = useState(settings.theme_accent_hsl);
  const [background, setBackground] = useState(settings.theme_background_hsl);
  const [fontPair, setFontPair] = useState(settings.theme_font_pair);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setPrimary(settings.theme_primary_hsl);
    setAccent(settings.theme_accent_hsl);
    setBackground(settings.theme_background_hsl);
    setFontPair(settings.theme_font_pair);
  }, [settings]);

  // Live preview as user tweaks
  useEffect(() => {
    document.documentElement.style.setProperty('--primary', primary);
    document.documentElement.style.setProperty('--ring', primary);
  }, [primary]);
  useEffect(() => { document.documentElement.style.setProperty('--accent', accent); }, [accent]);
  useEffect(() => { document.documentElement.style.setProperty('--background', background); }, [background]);

  const applyPreset = (p: typeof PRESETS[0]) => {
    setPrimary(p.primary); setAccent(p.accent); setBackground(p.background);
  };

  const reset = () => {
    refresh(); // re-applies saved values to CSS vars + state
    toast.success('Reverted to saved values');
  };

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from('site_settings').update({
      theme_primary_hsl: primary,
      theme_accent_hsl: accent,
      theme_background_hsl: background,
      theme_font_pair: fontPair,
    }).eq('id', 'default');
    if (error) toast.error(error.message);
    else { toast.success('Theme saved'); refresh(); }
    setSaving(false);
  };

  const ColorRow = ({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) => (
    <div className="flex items-center gap-3">
      <input type="color" value={hslToHex(value)} onChange={e => onChange(hexToHsl(e.target.value))}
        className="w-12 h-10 rounded-lg border border-border/40 bg-transparent cursor-pointer" />
      <div className="flex-1">
        <Label className="text-xs">{label}</Label>
        <Input value={value} onChange={e => onChange(e.target.value)} className="font-mono-data text-xs" placeholder="H S% L%" />
      </div>
    </div>
  );

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Theme</h1>
          <p className="text-muted-foreground">Live preview — colors update as you type. Save to persist.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={reset} className="gap-2"><RotateCcw className="w-4 h-4" />Revert</Button>
          <Button onClick={save} disabled={saving} className="gap-2"><Save className="w-4 h-4" />{saving ? 'Saving…' : 'Save'}</Button>
        </div>
      </div>

      <div className="space-y-6">
        <div className="glass-card rounded-2xl p-6">
          <h2 className="font-semibold mb-4">Presets</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {PRESETS.map(p => (
              <button key={p.label} onClick={() => applyPreset(p)}
                className="flex items-center gap-2 p-3 rounded-xl border border-border/40 hover:border-primary/40 hover:bg-secondary/30 transition-colors text-left">
                <div className="flex gap-1">
                  <div className="w-4 h-4 rounded-full" style={{ background: `hsl(${p.primary})` }} />
                  <div className="w-4 h-4 rounded-full" style={{ background: `hsl(${p.accent})` }} />
                </div>
                <span className="text-xs font-medium truncate">{p.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="glass-card rounded-2xl p-6 space-y-4">
          <h2 className="font-semibold">Colors</h2>
          <ColorRow label="Primary" value={primary} onChange={setPrimary} />
          <ColorRow label="Accent" value={accent} onChange={setAccent} />
          <ColorRow label="Background" value={background} onChange={setBackground} />
        </div>

        <div className="glass-card rounded-2xl p-6">
          <h2 className="font-semibold mb-4">Typography</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {FONT_PAIRS.map(p => (
              <button key={p.key} onClick={() => setFontPair(p.key)}
                className={`text-left p-4 rounded-xl border transition-colors ${
                  fontPair === p.key ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'border-border/40 hover:border-border'
                }`}>
                <div className="text-xs text-muted-foreground mb-1">{p.label}</div>
                <div style={{ fontFamily: `'${p.heading}', sans-serif` }} className="text-lg font-semibold">{p.heading}</div>
                <div style={{ fontFamily: `'${p.body}', sans-serif` }} className="text-sm text-muted-foreground">The quick brown fox jumps over the lazy dog</div>
              </button>
            ))}
          </div>
        </div>

        <div className="glass-card rounded-2xl p-6">
          <h2 className="font-semibold mb-4">Live preview</h2>
          <div className="space-y-3">
            <Button>Primary button</Button>{' '}
            <Button variant="outline">Outline</Button>{' '}
            <span className="inline-block px-3 py-1 rounded-full bg-accent text-accent-foreground text-sm">Accent badge</span>
          </div>
        </div>
      </div>
    </div>
  );
}
