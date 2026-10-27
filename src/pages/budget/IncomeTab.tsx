import { useMemo, useState } from 'react';
import { z } from 'zod';
import { format } from 'date-fns';
import { Plus, Pencil, Trash2, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MonthSwitcher } from '@/components/budget/MonthSwitcher';
import { useIncome } from '@/hooks/useBudget';
import { useMonthSelector } from '@/hooks/useMonthSelector';
import { IncomeFrequency, IncomeSource } from '@/data/budget';
import { incomeOccurrencesForMonth } from '@/lib/cashFlow';
import { formatCurrency } from '@/lib/currency';

const formSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(100, 'Name must not exceed 100 characters.'),
  amount: z.number({ invalid_type_error: 'Enter an amount.' }).positive('Amount must be more than zero.').max(1_000_000_000),
  frequency: z.enum(['monthly', 'one_time']),
  startDate: z.string().min(1, 'Pick a date.'),
  endDate: z.string().optional(),
});

const dayLabel = (n: number) => {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`;
};

const describe = (s: IncomeSource) =>
  s.frequency === 'monthly'
    ? `Monthly on the ${dayLabel(s.recurringDay)} · from ${format(new Date(s.startDate), 'MMM yyyy')}`
    : `One-time · ${format(new Date(s.startDate), 'MMM dd, yyyy')}`;

export default function IncomeTab() {
  const month = useMonthSelector();
  const { sources, isLoading, create, update, markReceived, remove } = useIncome();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<IncomeSource | null>(null);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState<IncomeFrequency>('monthly');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [countInPlan, setCountInPlan] = useState(true);

  const occurrences = useMemo(
    () => incomeOccurrencesForMonth(sources, month.selected),
    [sources, month.selected],
  );
  const expected = occurrences.filter((o) => o.counted).reduce((s, o) => s + o.amount, 0);
  const received = occurrences.filter((o) => o.received).reduce((s, o) => s + o.amount, 0);

  const openNew = () => {
    setEditing(null);
    setName('');
    setAmount('');
    setFrequency('monthly');
    setStartDate(format(new Date(), 'yyyy-MM-dd'));
    setEndDate('');
    setCountInPlan(true);
    setOpen(true);
  };

  const openEdit = (s: IncomeSource) => {
    setEditing(s);
    setName(s.name);
    setAmount(String(s.amount));
    setFrequency(s.frequency);
    setStartDate(s.startDate.slice(0, 10));
    setEndDate(s.endDate ? s.endDate.slice(0, 10) : '');
    setCountInPlan(s.countInPlan);
    setOpen(true);
  };

  const save = () => {
    const numeric = Number(amount.replace(/,/g, ''));
    const parsed = formSchema.safeParse({
      name,
      amount: amount.trim() === '' ? NaN : numeric,
      frequency,
      startDate,
      endDate: endDate || undefined,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Check the form.');
      return;
    }
    if (parsed.data.endDate && parsed.data.frequency === 'monthly' && parsed.data.endDate < parsed.data.startDate) {
      toast.error('End date cannot be before the start date.');
      return;
    }

    const payload = {
      name: parsed.data.name,
      amount: parsed.data.amount,
      frequency: parsed.data.frequency,
      startDate: parsed.data.startDate,
      endDate: parsed.data.frequency === 'monthly' ? parsed.data.endDate ?? null : null,
      countInPlan,
    };

    if (editing) {
      update.mutate({ id: editing._id, updates: payload }, { onSuccess: () => setOpen(false) });
    } else {
      create.mutate(payload, { onSuccess: () => setOpen(false) });
    }
  };

  const confirmRemove = (s: IncomeSource) => {
    if (confirm(`Remove "${s.name}"? Past months will no longer include it.`)) remove.mutate(s._id);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Income</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Salary, rent received and anything else that comes in. Future months are filled in automatically.
          </p>
        </div>
        <MonthSwitcher label={month.label} isCurrent={month.isCurrent} onPrev={month.prev} onNext={month.next} onToday={month.today} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="glass-card rounded-3xl p-5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest">Expected · {month.label}</p>
          <p className="text-2xl font-bold font-mono-data mt-2">{formatCurrency(expected)}</p>
          <p className="text-xs text-muted-foreground mt-1">Sources switched on in your plan</p>
        </div>
        <div className="glass-card rounded-3xl p-5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest">Received so far</p>
          <p className="text-2xl font-bold font-mono-data mt-2">{formatCurrency(received)}</p>
          <p className="text-xs text-muted-foreground mt-1">What you have marked as received</p>
        </div>
      </div>

      <div className="glass-card rounded-3xl p-6">
        <div className="flex items-center justify-between gap-3 mb-2">
          <h3 className="font-semibold">Income sources</h3>
          <Button onClick={openNew} className="gap-2"><Plus className="w-4 h-4" /> Add income</Button>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground py-6">Loading…</p>
        ) : sources.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6">No income added yet. Add your salary to see what&apos;s free to spend.</p>
        ) : (
          <ul>
            {sources.map((s) => (
              <li key={s._id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-4 border-t border-border/40">
                <div className="flex-1 min-w-[200px]">
                  <p className="font-medium">{s.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{describe(s)}</p>
                </div>
                <p className="font-mono-data font-semibold min-w-[96px] text-right">{formatCurrency(s.amount)}</p>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Switch
                    checked={s.countInPlan}
                    onCheckedChange={(v) => update.mutate({ id: s._id, updates: { countInPlan: v }, quiet: true })}
                    aria-label={`Count ${s.name} in plan`}
                  />
                  In plan
                </label>
                <div className="flex items-center">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(s)} aria-label={`Edit ${s.name}`}><Pencil className="w-4 h-4" /></Button>
                  <Button variant="ghost" size="icon" className="text-destructive" onClick={() => confirmRemove(s)} aria-label={`Remove ${s.name}`}><Trash2 className="w-4 h-4" /></Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground border-t border-border/40 pt-4">
          Switch a source off to keep it listed but leave it out of the plan, which suits irregular income like freelance work.
        </p>
      </div>

      <div className="glass-card rounded-3xl p-6">
        <h3 className="font-semibold mb-2">{month.label}</h3>
        {occurrences.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No income expected this month.</p>
        ) : (
          <ul>
            {occurrences.map((o) => (
              <li key={`${o.sourceId}-${o.cycle}`} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 border-t border-border/40 first:border-t-0">
                <div className="flex-1 min-w-[180px]">
                  <p className="font-medium">{o.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Due {format(new Date(o.date), 'MMM dd')}{!o.counted && ' · not in plan'}
                  </p>
                </div>
                <p className="font-mono-data font-semibold">{formatCurrency(o.amount)}</p>
                <Button
                  size="sm"
                  variant={o.received ? 'outline' : 'default'}
                  className="gap-1.5"
                  onClick={() => markReceived.mutate({ id: o.sourceId, cycle: o.cycle, received: !o.received })}
                >
                  {o.received && <Check className="w-3.5 h-3.5" />}
                  {o.received ? 'Received' : 'Mark received'}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? 'Edit income' : 'Add income'}</DialogTitle></DialogHeader>
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="income-name">Name</Label>
              <Input id="income-name" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} placeholder="Salary" autoFocus />
            </div>
            <div className="space-y-2">
              <Label htmlFor="income-amount">Amount (₹)</Label>
              <Input id="income-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="1,20,000" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="income-frequency">How often</Label>
              <Select value={frequency} onValueChange={(v) => setFrequency(v as IncomeFrequency)}>
                <SelectTrigger id="income-frequency"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Every month</SelectItem>
                  <SelectItem value="one_time">One-time</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="income-start">{frequency === 'monthly' ? 'Starts on' : 'Date expected'}</Label>
                <Input id="income-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              {frequency === 'monthly' && (
                <div className="space-y-2">
                  <Label htmlFor="income-end">Ends on (optional)</Label>
                  <Input id="income-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                </div>
              )}
            </div>
            <label className="flex items-center justify-between gap-3 rounded-2xl bg-secondary/40 px-4 py-3 text-sm">
              <span>
                <span className="block font-medium">Count in my plan</span>
                <span className="block text-xs text-muted-foreground">Turn off for irregular income</span>
              </span>
              <Switch checked={countInPlan} onCheckedChange={setCountInPlan} aria-label="Count in my plan" />
            </label>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={create.isPending || update.isPending}>
              {create.isPending || update.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
