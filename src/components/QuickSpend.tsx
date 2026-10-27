import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { format } from 'date-fns';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { apiRequest } from '@/lib/api';
import { formatCurrency } from '@/lib/currency';
import { useCategories } from '@/hooks/useCategories';
import type { Bill } from '@/data/bills';

const LAST_CATEGORY_KEY = 'billwill_last_spend_category';

const spendSchema = z.object({
  amount: z
    .number({ invalid_type_error: 'Enter the amount you spent.' })
    .positive('Amount must be more than zero.')
    .max(1_000_000_000, 'Amount is too large.'),
  category: z.string().min(1, 'Pick a category.'),
  date: z.string().min(1, 'Pick a date.'),
  note: z.string().trim().max(100, 'Note must not exceed 100 characters.').optional(),
});

function readLastCategory(): string {
  try {
    return localStorage.getItem(LAST_CATEGORY_KEY) ?? '';
  } catch {
    return '';
  }
}

function rememberCategory(slug: string) {
  try {
    localStorage.setItem(LAST_CATEGORY_KEY, slug);
  } catch {
    /* the shortcut is a convenience only */
  }
}

/**
 * One-tap entry for an everyday expense. A spend is stored as an already-paid,
 * one-time bill dated on the day, so budgets, cash flow and the bills list
 * count it with no separate bookkeeping.
 */
export function QuickSpend() {
  const queryClient = useQueryClient();
  const { optionsFor, getLabel } = useCategories();

  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');

  const options = optionsFor(category || undefined);

  const log = useMutation({
    mutationFn: (bill: Omit<Bill, '_id'>) =>
      apiRequest<Bill>('/api/bills', { method: 'POST', body: JSON.stringify(bill) }),
    onSuccess: (_bill, variables) => {
      toast.success(`Logged ${formatCurrency(variables.amount)} on ${getLabel(variables.category)}`);
      for (const key of ['bills', 'payments', 'subscriptions', 'notifications', 'installments']) {
        void queryClient.invalidateQueries({ queryKey: [key] });
      }
      setOpen(false);
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to log the spend'),
  });

  const openDialog = () => {
    const remembered = readLastCategory();
    const valid = options.some((o) => o.slug === remembered);
    setAmount('');
    setNote('');
    setDate(format(new Date(), 'yyyy-MM-dd'));
    setCategory(
      valid
        ? remembered
        : (options.find((o) => o.slug === 'groceries') ?? options[0])?.slug ?? '',
    );
    setOpen(true);
  };

  const submit = () => {
    const parsed = spendSchema.safeParse({
      amount: amount.trim() === '' ? NaN : Number(amount.replace(/,/g, '')),
      category,
      date,
      note: note || undefined,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Check the form.');
      return;
    }
    const { amount: value, category: slug, date: day, note: text } = parsed.data;
    rememberCategory(slug);
    log.mutate({
      name: text || getLabel(slug),
      amount: value,
      // Dates are stored as UTC midnight of the calendar day, like every other date in the app.
      dueDate: `${day}T00:00:00.000Z`,
      status: 'paid',
      category: slug,
      isSubscription: false,
      recurrenceType: 'one_time',
    });
  };

  return (
    <>
      <Button
        type="button"
        onClick={openDialog}
        className="fixed bottom-5 right-5 z-40 h-12 gap-2 rounded-full px-4 shadow-lg sm:px-5"
        aria-label="Log a spend"
      >
        <Plus className="h-5 w-5" />
        <span className="hidden sm:inline">Log a spend</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Log a spend</DialogTitle>
            <DialogDescription>Something you already paid for. It counts against your budget straight away.</DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="spend-amount">Amount (₹)</Label>
              <Input
                id="spend-amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="450"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="spend-category">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="spend-category"><SelectValue placeholder="Pick a category" /></SelectTrigger>
                <SelectContent>
                  {options.map((o) => (
                    <SelectItem key={o.slug} value={o.slug}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="spend-date">Date</Label>
                <Input id="spend-date" type="date" value={date} max={format(new Date(), 'yyyy-MM-dd')} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="spend-note">Note (optional)</Label>
                <Input id="spend-note" value={note} maxLength={100} onChange={(e) => setNote(e.target.value)} placeholder="Auto fare" />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={log.isPending}>{log.isPending ? 'Saving…' : 'Log spend'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
