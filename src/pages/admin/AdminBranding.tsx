import { useEffect, useState, useRef } from 'react';
import { z } from 'zod';
import { Upload, Save, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import { apiRequest } from '@/lib/api';

const schema = z.object({
  brand_name: z.string().trim().min(1).max(40),
  hero_headline: z.string().trim().min(1).max(120),
  hero_subheadline: z.string().trim().min(1).max(400),
  hero_cta_label: z.string().trim().min(1).max(40),
  logo_url: z.string().url().nullable().or(z.literal('').transform(() => null)),
});

export default function AdminBranding() {
  const { settings, refresh } = useSiteSettings();
  const [form, setForm] = useState({
    brand_name: settings.brand_name,
    hero_headline: settings.hero_headline,
    hero_subheadline: settings.hero_subheadline,
    hero_cta_label: settings.hero_cta_label,
    logo_url: settings.logo_url ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState(
    settings.logo_display_url || settings.logo_url || '',);

  useEffect(() => {
    setLogoPreviewUrl(
      settings.logo_display_url || settings.logo_url || '',
    );
  }, [settings.logo_display_url, settings.logo_url]);

  useEffect(() => {
    setForm({
      brand_name: settings.brand_name,
      hero_headline: settings.hero_headline,
      hero_subheadline: settings.hero_subheadline,
      hero_cta_label: settings.hero_cta_label,
      logo_url: settings.logo_url ?? '',
    });
  }, [settings]);
  const handleUpload = async (file: File) => {
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Max 2MB');
      return;
    }

    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('logo', file);

      const result = await apiRequest<{ url: string }>(
        '/api/admin/branding/logo',
        {
          method: 'POST',
          body: formData,
        },
      );

      setForm((current) => ({
        ...current,
        logo_url: result.url,
      }));

      setLogoPreviewUrl(result.url);

      toast.success('Logo uploaded — click Save to apply');
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Logo upload failed',
      );
    } finally {
      setUploading(false);
    }
  };


  const save = async () => {
    const parsed = schema.safeParse({
      ...form,
      logo_url: form.logo_url || null,
    });

    if (!parsed.success) {
      toast.error(parsed.error.errors[0].message);
      return;
    }

    setSaving(true);

    try {
      await apiRequest<{ success: boolean }>('/api/admin/branding', {
        method: 'PATCH',
        body: JSON.stringify(parsed.data),
      });

      toast.success('Branding saved');
      await refresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to save branding',
      );
    } finally {
      setSaving(false);
    }
  };


  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight mb-2">Branding</h1>
        <p className="text-muted-foreground">Brand name, logo, and landing-page hero copy.</p>
      </div>

      <div className="space-y-6">
        <div className="glass-card rounded-2xl p-6 space-y-4">
          <h2 className="font-semibold">Brand</h2>
          <div>
            <Label>Brand name</Label>
            <Input value={form.brand_name} onChange={e => setForm({ ...form, brand_name: e.target.value })} maxLength={40} />
          </div>
          <div>
            <Label>Logo</Label>
            <div className="flex items-center gap-4 mt-2">
              <div className="w-16 h-16 rounded-xl border border-border/40 bg-secondary/50 flex items-center justify-center overflow-hidden">
                {logoPreviewUrl ? (
                  <img
                    src={logoPreviewUrl}
                    alt="BillFlow logo preview"
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <ImageIcon className="w-6 h-6 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 space-y-2">
                <input ref={fileRef} type="file" accept="image/*" hidden
                  onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0])} />
                <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading} className="gap-2">
                  <Upload className="w-4 h-4" /> {uploading ? 'Uploading…' : 'Upload image'}
                </Button>
                <Input placeholder="…or paste an image URL" value={form.logo_url} onChange={e => setForm({ ...form, logo_url: e.target.value })} />
              </div>
            </div>
          </div>
        </div>

        <div className="glass-card rounded-2xl p-6 space-y-4">
          <h2 className="font-semibold">Landing hero</h2>
          <div>
            <Label>Headline</Label>
            <Input value={form.hero_headline} onChange={e => setForm({ ...form, hero_headline: e.target.value })} maxLength={120} />
          </div>
          <div>
            <Label>Subheadline</Label>
            <Textarea value={form.hero_subheadline} onChange={e => setForm({ ...form, hero_subheadline: e.target.value })} rows={3} maxLength={400} />
          </div>
          <div>
            <Label>CTA button text</Label>
            <Input value={form.hero_cta_label} onChange={e => setForm({ ...form, hero_cta_label: e.target.value })} maxLength={40} />
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={save} disabled={saving} className="gap-2">
            <Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </div>
    </div>
  );
}
