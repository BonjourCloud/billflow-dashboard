import { useState } from 'react';
import { z } from 'zod';
import { Plus, Pencil, Trash2, Eye, EyeOff, Star, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { usePricingTiers, PricingTier } from '@/hooks/usePricingTiers';

const tierSchema = z.object({
  slug: z.string().trim().min(1).max(40).regex(/^[a-z0-9-]+$/, 'lowercase letters, numbers, hyphens'),
  name: z.string().trim().min(1).max(60),
  price_monthly: z.number().min(0).max(99999),
  price_yearly: z.number().min(0).max(999999),
  billing_period: z.enum(['month', 'year', 'forever']),
  cta_label: z.string().trim().min(1).max(40),
  is_highlighted: z.boolean(),
  is_visible: z.boolean(),
  sort_order: z.number().int().min(0).max(999),
  features: z.array(z.string().trim().min(1).max(120)).max(20),
});

type Form = z.infer<typeof tierSchema>;

const empty: Form = {
  slug: '', name: '', price_monthly: 0, price_yearly: 0,
  billing_period: 'month', cta_label: 'Get Started',
  is_highlighted: false, is_visible: true, sort_order: 0, features: [],
};

export default function AdminPricing() {
  const { tiers, loading, refresh } = usePricingTiers({ includeHidden: true });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PricingTier | null>(null);
  const [form, setForm] = useState<Form>(empty);
  const [featuresText, setFeaturesText] = useState('');
  const [saving, setSaving] = useState(false);

  const openNew = () => {
    setEditing(null);
    setForm({ ...empty, sort_order: tiers.length + 1 });
    setFeaturesText('');
    setOpen(true);
  };

  const openEdit = (t: PricingTier) => {
    setEditing(t);
    setForm({
      slug: t.slug, name: t.name,
      price_monthly: t.price_monthly, price_yearly: t.price_yearly,
      billing_period: t.billing_period as Form['billing_period'],
      cta_label: t.cta_label, is_highlighted: t.is_highlighted,
      is_visible: t.is_visible, sort_order: t.sort_order, features: t.features,
    });
    setFeaturesText(t.features.join('\n'));
    setOpen(true);
  };

  const save = async () => {
    const payload = { ...form, features: featuresText.split('\n').map(s => s.trim()).filter(Boolean) };
    const parsed = tierSchema.safeParse(payload);
    if (!parsed.success) {
      toast.error(parsed.error.errors[0].message);
      return;
    }
    setSaving(true);
    if (editing) {
      const { error } = await supabase.from('pricing_tiers').update(parsed.data).eq('id', editing.id);
      if (error) toast.error(error.message);
      else toast.success('Tier updated');
    } else {
      const { error } = await supabase.from('pricing_tiers').insert(parsed.data);
      if (error) toast.error(error.message);
      else toast.success('Tier created');
    }
    setSaving(false);
    setOpen(false);
    refresh();
  };

  const remove = async (t: PricingTier) => {
    if (!confirm(`Delete "${t.name}"?`)) return;
    const { error } = await supabase.from('pricing_tiers').delete().eq('id', t.id);
    if (error) toast.error(error.message);
    else { toast.success('Deleted'); refresh(); }
  };

  const toggleVisible = async (t: PricingTier) => {
    const { error } = await supabase.from('pricing_tiers').update({ is_visible: !t.is_visible }).eq('id', t.id);
    if (error) toast.error(error.message);
    else refresh();
  };

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Pricing tiers</h1>
          <p className="text-muted-foreground">Edit your Free, Pro, and Enterprise plans. Changes appear instantly on the landing page.</p>
        </div>
        <Button onClick={openNew} className="gap-2"><Plus className="w-4 h-4" /> Add tier</Button>
      </div>

      {loading ? (
        <div className="text-muted-foreground">Loading…</div>
      ) : (
        <div className="space-y-3">
          {tiers.map(t => (
            <div key={t.id} className={`glass-card rounded-2xl p-5 flex items-start justify-between gap-4 ${!t.is_visible ? 'opacity-60' : ''}`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold">{t.name}</h3>
                  <code className="text-xs text-muted-foreground font-mono-data">{t.slug}</code>
                  {t.is_highlighted && <span className="text-xs bg-primary/15 text-primary px-2 py-0.5 rounded-full inline-flex items-center gap-1"><Star className="w-3 h-3" />Highlighted</span>}
                  {!t.is_visible && <span className="text-xs bg-muted px-2 py-0.5 rounded-full">Hidden</span>}
                </div>
                <div className="text-sm text-muted-foreground">
                  <span className="font-mono-data text-foreground">${t.price_monthly}</span>/mo · <span className="font-mono-data">${t.price_yearly}</span>/yr · {t.features.length} features · order {t.sort_order}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" onClick={() => toggleVisible(t)} title={t.is_visible ? 'Hide' : 'Show'}>
                  {t.is_visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </Button>
                <Button variant="ghost" size="icon" onClick={() => openEdit(t)}><Pencil className="w-4 h-4" /></Button>
                <Button variant="ghost" size="icon" className="text-destructive" onClick={() => remove(t)}><Trash2 className="w-4 h-4" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? 'Edit tier' : 'New tier'}</DialogTitle></DialogHeader>
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Slug</Label><Input value={form.slug} onChange={e => setForm({ ...form, slug: e.target.value })} placeholder="pro" /></div>
              <div><Label>Name</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Pro" /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label>Monthly $</Label><Input type="number" value={form.price_monthly} onChange={e => setForm({ ...form, price_monthly: Number(e.target.value) })} /></div>
              <div><Label>Yearly $</Label><Input type="number" value={form.price_yearly} onChange={e => setForm({ ...form, price_yearly: Number(e.target.value) })} /></div>
              <div>
                <Label>Period</Label>
                <Select value={form.billing_period} onValueChange={v => setForm({ ...form, billing_period: v as Form['billing_period'] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="month">/month</SelectItem>
                    <SelectItem value="year">/year</SelectItem>
                    <SelectItem value="forever">/forever</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>CTA label</Label><Input value={form.cta_label} onChange={e => setForm({ ...form, cta_label: e.target.value })} /></div>
              <div><Label>Sort order</Label><Input type="number" value={form.sort_order} onChange={e => setForm({ ...form, sort_order: Number(e.target.value) })} /></div>
            </div>
            <div>
              <Label>Features (one per line)</Label>
              <Textarea value={featuresText} onChange={e => setFeaturesText(e.target.value)} rows={6} placeholder="Unlimited bills&#10;AI insights" />
            </div>
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2"><Switch checked={form.is_highlighted} onCheckedChange={v => setForm({ ...form, is_highlighted: v })} /> Highlight as recommended</Label>
              <Label className="flex items-center gap-2"><Switch checked={form.is_visible} onCheckedChange={v => setForm({ ...form, is_visible: v })} /> Visible publicly</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}><X className="w-4 h-4 mr-1" />Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
