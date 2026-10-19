import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Repeat, Info } from 'lucide-react';
import { Subscription } from '@/data/subscriptions';
import { BillCategory, CATEGORIES } from '@/data/bills';

interface SubscriptionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subscription?: Subscription | null;
  onSave: (data: {
    name: string;
    amount: number;
    category: BillCategory;
    startDate: string;
    recurringDay?: number;
  }) => void;
  onUpdate: (
    id: string,
    updates: {
      name?: string;
      amount?: number;
      category?: BillCategory;
      recurringDay?: number;
    },
  ) => void;
  isPending?: boolean;
}

function getOrdinalSuffix(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

export function SubscriptionDialog({
  open,
  onOpenChange,
  subscription,
  onSave,
  onUpdate,
  isPending = false,
}: SubscriptionDialogProps) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<BillCategory>('software');
  const [startDate, setStartDate] = useState('');
  const [recurringDay, setRecurringDay] = useState<number | ''>('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (subscription) {
      setName(subscription.name);
      setAmount(subscription.amount.toString());
      setCategory(subscription.category);
      setStartDate(
        subscription.startDate
          ? new Date(subscription.startDate).toISOString().split('T')[0]
          : '',
      );
      setRecurringDay(subscription.recurringDay || 1);
    } else {
      setName('');
      setAmount('');
      setCategory('software');
      const today = new Date().toISOString().split('T')[0];
      setStartDate(today);
      setRecurringDay(new Date().getUTCDate());
    }
    setErrors({});
  }, [subscription, open]);

  const handleStartDateChange = (val: string) => {
    setStartDate(val);
    if (val && !subscription) {
      const day = parseInt(val.split('-')[2], 10);
      if (!isNaN(day)) {
        setRecurringDay(day);
      }
    }
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Subscription name is required';
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      e.amount = 'Valid positive amount required';
    }
    if (!subscription && !startDate) {
      e.startDate = 'Start date is required';
    }
    if (
      recurringDay === '' ||
      isNaN(Number(recurringDay)) ||
      Number(recurringDay) < 1 ||
      Number(recurringDay) > 31
    ) {
      e.recurringDay = 'Day must be between 1 and 31';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const resolvedDay = Number(recurringDay) || 1;

    if (subscription) {
      onUpdate(subscription._id, {
        name: name.trim(),
        amount: Number(amount),
        category,
        recurringDay: resolvedDay,
      });
    } else {
      onSave({
        name: name.trim(),
        amount: Number(amount),
        category,
        startDate,
        recurringDay: resolvedDay,
      });
    }
    onOpenChange(false);
  };

  const activeDay = Number(recurringDay) || 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-card border-border/40 sm:max-w-[480px] sm:rounded-3xl">
        <DialogHeader>
          <DialogTitle>
            {subscription ? 'Edit Subscription' : 'Add New Subscription'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label htmlFor="sub-name">Subscription Name</Label>
            <Input
              id="sub-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-secondary/50 focus:ring-2 focus:ring-primary/50"
              placeholder="e.g. Spotify, GitHub, Netflix, AWS"
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="sub-amount">Monthly Cost ($)</Label>
              <Input
                id="sub-amount"
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="bg-secondary/50 font-mono-data focus:ring-2 focus:ring-primary/50"
                placeholder="0.00"
              />
              {errors.amount && (
                <p className="text-xs text-destructive">{errors.amount}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="sub-category">Category</Label>
              <Select
                value={category}
                onValueChange={(v) => setCategory(v as BillCategory)}
              >
                <SelectTrigger id="sub-category" className="bg-secondary/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c} className="capitalize">
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {!subscription && (
              <div className="space-y-2">
                <Label htmlFor="sub-start-date">First Billing Date</Label>
                <Input
                  id="sub-start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => handleStartDateChange(e.target.value)}
                  className="bg-secondary/50 font-mono-data focus:ring-2 focus:ring-primary/50"
                />
                {errors.startDate && (
                  <p className="text-xs text-destructive">{errors.startDate}</p>
                )}
              </div>
            )}

            <div className={`space-y-2 ${subscription ? 'col-span-2' : ''}`}>
              <Label htmlFor="sub-recurring-day">Renewal Day of Month</Label>
              <Input
                id="sub-recurring-day"
                type="number"
                min="1"
                max="31"
                value={recurringDay}
                onChange={(e) =>
                  setRecurringDay(
                    e.target.value === '' ? '' : parseInt(e.target.value, 10),
                  )
                }
                className="bg-secondary/50 font-mono-data focus:ring-2 focus:ring-primary/50"
                placeholder="1 - 31"
              />
              {errors.recurringDay && (
                <p className="text-xs text-destructive">
                  {errors.recurringDay}
                </p>
              )}
            </div>
          </div>

          {/* Recurrence Rule Preview */}
          <div className="rounded-2xl p-3 bg-primary/10 border border-primary/20 space-y-1">
            <div className="flex items-center gap-2 text-xs font-medium text-primary">
              <Repeat className="w-3.5 h-3.5" />
              <span>
                Repeats monthly on day {activeDay} ({activeDay}
                {getOrdinalSuffix(activeDay)} of every month)
              </span>
            </div>
            {activeDay >= 29 && (
              <div className="flex items-start gap-1.5 text-[11px] text-muted-foreground pt-1">
                <Info className="w-3 h-3 shrink-0 mt-0.5 text-accent" />
                <span>
                  For shorter months (like February or 30-day months), renewal
                  automatically adjusts to the last day of that month.
                </span>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => onOpenChange(false)}
              className="active:scale-95 transition-transform"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              className="active:scale-95 transition-transform"
            >
              {isPending ? 'Saving…' : subscription ? 'Save Changes' : 'Add Subscription'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
