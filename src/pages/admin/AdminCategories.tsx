import { useState } from 'react';
import { z } from 'zod';
import { Plus, Pencil, Trash2, Eye, EyeOff, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { apiRequest } from '@/lib/api';
import { useCategories } from '@/hooks/useCategories';
import { Category, FALLBACK_COLOR } from '@/data/categories';

const categorySchema = z.object({
  label: z
    .string()
    .trim()
    .min(1, 'Category name is required.')
    .max(30, 'Category name must not exceed 30 characters.'),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Pick a valid color.'),
});

export default function AdminCategories() {
  const { categories, loading, refresh } = useCategories();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [label, setLabel] = useState('');
  const [color, setColor] = useState(FALLBACK_COLOR);
  const [saving, setSaving] = useState(false);

  const isPersisted = (c: Category) => !c.id.startsWith('default-');

  const openNew = () => {
    setEditing(null);
    setLabel('');
    setColor(FALLBACK_COLOR);
    setOpen(true);
  };

  const openEdit = (c: Category) => {
    setEditing(c);
    setLabel(c.label);
    setColor(c.color);
    setOpen(true);
  };

  const save = async () => {
    const parsed = categorySchema.safeParse({ label, color });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message || 'Invalid category.');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await apiRequest(`/api/admin/categories/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify(parsed.data),
        });
        toast.success('Category updated');
      } else {
        await apiRequest('/api/admin/categories', {
          method: 'POST',
          body: JSON.stringify(parsed.data),
        });
        toast.success('Category added');
      }
      setOpen(false);
      await refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save category');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (c: Category) => {
    try {
      await apiRequest(`/api/admin/categories/${c.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: !c.is_active }),
      });
      await refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to update category');
    }
  };

  const remove = async (c: Category) => {
    if (!confirm(`Delete "${c.label}"? This cannot be undone.`)) return;
    try {
      await apiRequest(`/api/admin/categories/${c.id}`, { method: 'DELETE' });
      toast.success('Category deleted');
      await refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete category');
    }
  };

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Categories</h1>
          <p className="text-muted-foreground">
            Manage the categories users pick for bills, subscriptions and EMIs. Hide a category to stop new use
            without touching existing bills.
          </p>
        </div>
        <Button onClick={openNew} className="gap-2 shrink-0">
          <Plus className="w-4 h-4" /> Add category
        </Button>
      </div>

      {loading ? (
        <div className="text-muted-foreground">Loading…</div>
      ) : (
        <div className="space-y-3">
          {categories.map((c) => (
            <div
              key={c.id}
              className={`glass-card rounded-2xl p-4 flex items-center justify-between gap-4 ${
                !c.is_active ? 'opacity-60' : ''
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className="w-4 h-4 rounded-full shrink-0"
                  style={{ backgroundColor: c.color }}
                  aria-hidden
                />
                <h3 className="font-semibold truncate">{c.label}</h3>
                <code className="text-xs text-muted-foreground font-mono-data">{c.slug}</code>
                {!c.is_active && (
                  <span className="text-xs bg-muted px-2 py-0.5 rounded-full">Hidden</span>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={!isPersisted(c)}
                  onClick={() => toggleActive(c)}
                  title={c.is_active ? 'Hide from dropdowns' : 'Show in dropdowns'}
                >
                  {c.is_active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </Button>
                <Button variant="ghost" size="icon" disabled={!isPersisted(c)} onClick={() => openEdit(c)} title="Edit">
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive"
                  disabled={!isPersisted(c)}
                  onClick={() => remove(c)}
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit category' : 'New category'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="category-label">Name</Label>
              <Input
                id="category-label"
                value={label}
                maxLength={30}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Car EMI"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="category-color">Chart color</Label>
              <div className="flex items-center gap-3">
                <input
                  id="category-color"
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="h-10 w-14 rounded-md border border-border bg-transparent cursor-pointer"
                />
                <code className="text-xs text-muted-foreground font-mono-data">{color}</code>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              <X className="w-4 h-4 mr-1" />
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
