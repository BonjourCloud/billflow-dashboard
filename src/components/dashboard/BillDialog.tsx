import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Repeat, Calendar, Info } from 'lucide-react';
import { Bill, BillStatus, BillCategory, CATEGORIES, STATUSES } from '@/data/bills';

interface BillDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bill?: Bill | null;
  onSave: (bill: Omit<Bill, '_id'>) => void;
  onUpdate: (id: string, updates: Partial<Bill> & { updateScope?: 'this' | 'future' }) => void;
}

function getOrdinalSuffix(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

export function BillDialog({ open, onOpenChange, bill, onSave, onUpdate }: BillDialogProps) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [status, setStatus] = useState<BillStatus>('pending');
  const [category, setCategory] = useState<BillCategory>('utilities');
  const [recurrenceType, setRecurrenceType] = useState<'one_time' | 'recurring'>('one_time');
  const [updateScope, setUpdateScope] = useState<'this' | 'future'>('this');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (bill) {
      setName(bill.name);
      setAmount(bill.amount.toString());
      setDueDate(bill.dueDate ? new Date(bill.dueDate).toISOString().split('T')[0] : '');
      setStatus(bill.status);
      setCategory(bill.category);
      const isRec = bill.recurrenceType === 'recurring' || bill.isSubscription;
      setRecurrenceType(isRec ? 'recurring' : 'one_time');
      setUpdateScope('this');
    } else {
      setName('');
      setAmount('');
      setDueDate('');
      setStatus('pending');
      setCategory('utilities');
      setRecurrenceType('one_time');
      setUpdateScope('this');
    }
    setErrors({});
  }, [bill, open]);

  const recurringDay = dueDate ? parseInt(dueDate.split('-')[2], 10) : null;
  const isEditingRecurring = Boolean(bill && (bill.seriesId || bill.recurrenceType === 'recurring'));

  const validate = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Name is required';
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) e.amount = 'Valid amount required';
    if (!dueDate) e.dueDate = 'Due date is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const isRec = recurrenceType === 'recurring';
    const data: Omit<Bill, '_id'> & { recurringDay?: number; updateScope?: 'this' | 'future' } = {
      name,
      amount: Number(amount),
      dueDate,
      status,
      category,
      isSubscription: isRec,
      recurrenceType,
      ...(isRec && recurringDay ? { recurringDay } : {}),
    };

    if (bill) {
      onUpdate(bill._id, {
        ...data,
        ...(isEditingRecurring ? { updateScope } : {}),
      });
    } else {
      onSave(data);
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-card border-border/40 sm:max-w-[480px] sm:rounded-3xl">
        <DialogHeader>
          <DialogTitle>{bill ? 'Edit Bill' : 'Add New Bill'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          {/* Bill Schedule Type (One-time vs Recurring) */}
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              Bill Schedule
            </Label>
            <div className="grid grid-cols-2 gap-2 p-1 bg-secondary/50 rounded-2xl border border-border/40">
              <button
                type="button"
                onClick={() => setRecurrenceType('one_time')}
                className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-medium transition-all ${
                  recurrenceType === 'one_time'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" /> One-time Expense
              </button>
              <button
                type="button"
                onClick={() => setRecurrenceType('recurring')}
                className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-medium transition-all ${
                  recurrenceType === 'recurring'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Repeat className="w-3.5 h-3.5" /> Monthly Recurring
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Bill Name</Label>
            <Input
              id="name"
              value={name}
              onChange={e => setName(e.target.value)}
              className="bg-secondary/50 focus:ring-2 focus:ring-primary/50"
              placeholder="e.g. Netflix, Rent, Electricity"
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="amount">Amount ($)</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="bg-secondary/50 font-mono-data focus:ring-2 focus:ring-primary/50"
                placeholder="0.00"
              />
              {errors.amount && <p className="text-xs text-destructive">{errors.amount}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="dueDate">
                {recurrenceType === 'recurring' ? 'Initial Due Date' : 'Due Date'}
              </Label>
              <Input
                id="dueDate"
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="bg-secondary/50 font-mono-data focus:ring-2 focus:ring-primary/50"
              />
              {errors.dueDate && <p className="text-xs text-destructive">{errors.dueDate}</p>}
            </div>
          </div>

          {/* Recurrence Rule Preview & Month-End Clamping Hint */}
          {recurrenceType === 'recurring' && recurringDay && (
            <div className="rounded-2xl p-3 bg-primary/10 border border-primary/20 space-y-1">
              <div className="flex items-center gap-2 text-xs font-medium text-primary">
                <Repeat className="w-3.5 h-3.5" />
                <span>
                  Repeats monthly on day {recurringDay} ({recurringDay}
                  {getOrdinalSuffix(recurringDay)} of each month)
                </span>
              </div>
              {recurringDay >= 29 && (
                <div className="flex items-start gap-1.5 text-[11px] text-muted-foreground pt-1">
                  <Info className="w-3 h-3 shrink-0 mt-0.5 text-accent" />
                  <span>
                    For shorter months (like February or 30-day months), due date automatically
                    adjusts to the last day of the month.
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={v => setStatus(v as BillStatus)}>
                <SelectTrigger className="bg-secondary/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map(s => (
                    <SelectItem key={s} value={s} className="capitalize">
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={category} onValueChange={v => setCategory(v as BillCategory)}>
                <SelectTrigger className="bg-secondary/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => (
                    <SelectItem key={c} value={c} className="capitalize">
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Edit Scope for Recurring Bills */}
          {isEditingRecurring && (
            <div className="rounded-2xl p-3.5 bg-secondary/40 border border-border/40 space-y-2">
              <Label className="text-xs font-semibold text-foreground">Apply changes to:</Label>
              <RadioGroup
                value={updateScope}
                onValueChange={v => setUpdateScope(v as 'this' | 'future')}
                className="space-y-1.5"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="this" id="scope-this" />
                  <Label htmlFor="scope-this" className="text-xs cursor-pointer font-normal">
                    This bill occurrence only
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="future" id="scope-future" />
                  <Label htmlFor="scope-future" className="text-xs cursor-pointer font-normal">
                    This and all upcoming recurring bills (preserves past records)
                  </Label>
                </div>
              </RadioGroup>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="active:scale-95 transition-transform"
            >
              Cancel
            </Button>
            <Button type="submit" className="active:scale-95 transition-transform">
              {bill ? 'Update' : 'Add'} Bill
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
