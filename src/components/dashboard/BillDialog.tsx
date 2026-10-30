import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarPicker } from '@/components/ui/calendar';
import { Repeat, Calendar, Info, CalendarIcon } from 'lucide-react';
import { format, parse, isValid } from 'date-fns';
import { cn } from '@/lib/utils';
import { Bill, BillStatus, BillCategory, STATUSES } from '@/data/bills';
import { useCategories } from '@/hooks/useCategories';
import { apiRequest } from '@/lib/api';
import type { Subscription } from '@/data/subscriptions';
import { lastPaymentDate, paymentsUntil, MAX_RECURRING_PAYMENTS } from '@/lib/recurrenceEnd';

interface BillDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bill?: Bill | null;
  onSave: (bill: Omit<Bill, '_id'>) => void;
  onUpdate: (id: string, updates: Partial<Bill> & { updateScope?: 'this' | 'future' }) => void;
  isPending?: boolean;
}

function getOrdinalSuffix(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

export function BillDialog({ open, onOpenChange, bill, onSave, onUpdate, isPending = false }: BillDialogProps) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [status, setStatus] = useState<BillStatus>('pending');
  const { optionsFor } = useCategories();
  const [category, setCategory] = useState<BillCategory>('utilities');
  const [recurrenceType, setRecurrenceType] = useState<'one_time' | 'recurring'>('one_time');
  const [updateScope, setUpdateScope] = useState<'this' | 'future'>('this');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  // How a recurring bill ends: never (ongoing), after N payments (create only),
  // or on a chosen last-payment date.
  const [endMode, setEndMode] = useState<'never' | 'count' | 'date'>('never');
  const [endCount, setEndCount] = useState('12');
  const [endDateStr, setEndDateStr] = useState('');
  const endTouched = useRef(false);
  // Close each calendar as soon as a day is picked.
  const [duePickerOpen, setDuePickerOpen] = useState(false);
  const [endPickerOpen, setEndPickerOpen] = useState(false);

  // Shares the cache the dashboard already loads; the series holds the end date.
  const { data: seriesList } = useQuery<Subscription[]>({
    queryKey: ['subscriptions'],
    queryFn: () => apiRequest<Subscription[]>('/api/subscriptions'),
    enabled: open && Boolean(bill?.seriesId),
  });
  const seriesEndIso = bill?.seriesId
    ? (seriesList?.find((x) => x._id === bill.seriesId)?.endDate ?? null)?.slice(0, 10) ?? null
    : null;

  const isBusy = Boolean(isPending || submitting);

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
    setSubmitting(false);
    endTouched.current = false;
    setEndMode('never');
    setEndCount('12');
    setEndDateStr('');
  }, [bill, open]);

  // When editing, show the series' current end date once it has loaded, unless
  // the user has already changed the field.
  useEffect(() => {
    if (!bill || endTouched.current) return;
    if (seriesEndIso) {
      setEndMode('date');
      setEndDateStr(seriesEndIso);
    }
  }, [bill, seriesEndIso]);

  const recurringDay = dueDate ? parseInt(dueDate.split('-')[2], 10) : null;
  const isEditingRecurring = Boolean(bill && (bill.seriesId || bill.recurrenceType === 'recurring'));

  // The end of a recurring bill as the server stores it: the last payment date.
  const countValue = Number(endCount);
  const computedEndDate: string | null =
    recurrenceType !== 'recurring' || endMode === 'never'
      ? null
      : endMode === 'count'
        ? dueDate && recurringDay
          ? lastPaymentDate(dueDate, recurringDay, countValue)
          : null
        : endDateStr || null;
  const endPayments =
    computedEndDate && dueDate && recurringDay
      ? paymentsUntil(dueDate, recurringDay, computedEndDate)
      : 0;

  const initialDueDateStr = bill?.dueDate
    ? new Date(bill.dueDate).toISOString().split('T')[0]
    : '';

  const hasMetadataChanges = Boolean(
    bill &&
      (name !== bill.name ||
        Number(amount) !== bill.amount ||
        dueDate !== initialDueDateStr ||
        category !== bill.category),
  );

  const isOnlyStatusChanged = Boolean(
    bill && status !== bill.status && !hasMetadataChanges,
  );

  const validate = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Name is required';
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) e.amount = 'Valid amount required';
    if (!dueDate) e.dueDate = 'Due date is required';
    if (recurrenceType === 'recurring' && endMode === 'count') {
      if (!Number.isInteger(countValue) || countValue < 1 || countValue > MAX_RECURRING_PAYMENTS) {
        e.end = `Enter a whole number of payments from 1 to ${MAX_RECURRING_PAYMENTS}.`;
      }
    }
    if (recurrenceType === 'recurring' && endMode === 'date') {
      if (!endDateStr) e.end = 'Pick the date of the last payment.';
      else if (dueDate && endDateStr < dueDate) e.end = 'The last payment cannot be before the first due date.';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isBusy) return;
    if (!validate()) return;
    setSubmitting(true);

    const isRec = recurrenceType === 'recurring';
    const data: Omit<Bill, '_id'> & { recurringDay?: number; updateScope?: 'this' | 'future'; endDate?: string | null } = {
      name,
      amount: Number(amount),
      dueDate,
      status,
      category,
      isSubscription: isRec,
      recurrenceType,
      ...(isRec && recurringDay ? { recurringDay } : {}),
      // New bill: send an end date only when one is set. Edit: send it only when
      // it changed (null clears an existing end).
      ...(isRec && (bill ? computedEndDate !== seriesEndIso : computedEndDate)
        ? { endDate: computedEndDate }
        : {}),
    };

    if (bill) {
      const effectiveScope = isOnlyStatusChanged ? 'this' : updateScope;
      onUpdate(bill._id, {
        ...data,
        ...(isEditingRecurring ? { updateScope: effectiveScope } : {}),
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
              <Label htmlFor="amount">Amount (₹)</Label>
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
              <Popover open={duePickerOpen} onOpenChange={setDuePickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    id="dueDate"
                    type="button"
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-mono-data bg-secondary/50 focus:ring-2 focus:ring-primary/50',
                      !dueDate && 'text-muted-foreground',
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dueDate ? format(parse(dueDate, 'yyyy-MM-dd', new Date()), 'MMM dd, yyyy') : 'Pick a date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarPicker
                    mode="single"
                    selected={dueDate ? parse(dueDate, 'yyyy-MM-dd', new Date()) : undefined}
                    onSelect={(date) => {
                      if (date && isValid(date)) {
                        setDueDate(format(date, 'yyyy-MM-dd'));
                        setDuePickerOpen(false);
                      }
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
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

          {recurrenceType === 'recurring' && (
            <div className="space-y-2 rounded-2xl p-3.5 bg-secondary/40 border border-border/40">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="endMode">Ends</Label>
                  <Select
                    value={endMode}
                    onValueChange={(v) => {
                      endTouched.current = true;
                      setEndMode(v as 'never' | 'count' | 'date');
                    }}
                  >
                    <SelectTrigger id="endMode" className="bg-secondary/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="never">Never (ongoing)</SelectItem>
                      {!bill && <SelectItem value="count">After a number of payments</SelectItem>}
                      <SelectItem value="date">On a date</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {endMode === 'count' && (
                  <div className="space-y-2">
                    <Label htmlFor="endCount">Number of payments</Label>
                    <Input
                      id="endCount"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={MAX_RECURRING_PAYMENTS}
                      step={1}
                      value={endCount}
                      onChange={(e) => {
                        endTouched.current = true;
                        setEndCount(e.target.value);
                      }}
                      disabled={isBusy}
                      className="bg-secondary/50 font-mono-data"
                    />
                  </div>
                )}
                {endMode === 'date' && (
                  <div className="space-y-2">
                    <Label htmlFor="endDate">Last payment date</Label>
                    <Popover open={endPickerOpen} onOpenChange={setEndPickerOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          id="endDate"
                          type="button"
                          variant="outline"
                          className={cn(
                            'w-full justify-start text-left font-mono-data bg-secondary/50',
                            !endDateStr && 'text-muted-foreground',
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {endDateStr
                            ? format(parse(endDateStr, 'yyyy-MM-dd', new Date()), 'MMM dd, yyyy')
                            : 'Pick a date'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <CalendarPicker
                          mode="single"
                          selected={endDateStr ? parse(endDateStr, 'yyyy-MM-dd', new Date()) : undefined}
                          defaultMonth={endDateStr ? parse(endDateStr, 'yyyy-MM-dd', new Date()) : undefined}
                          onSelect={(date) => {
                            if (date && isValid(date)) {
                              endTouched.current = true;
                              setEndDateStr(format(date, 'yyyy-MM-dd'));
                              setEndPickerOpen(false);
                            }
                          }}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                )}
              </div>
              {errors.end && <p className="text-xs text-destructive">{errors.end}</p>}
              {computedEndDate && endPayments > 0 && !errors.end && (
                <p className="text-xs text-muted-foreground" data-testid="recurring-end-summary">
                  Last payment: {format(parse(computedEndDate, 'yyyy-MM-dd', new Date()), 'MMM dd, yyyy')} ·{' '}
                  {endPayments} {endPayments === 1 ? 'payment' : 'payments'}{bill ? ' from this bill' : ' in total'}
                </p>
              )}
              {bill && (
                <p className="text-[11px] text-muted-foreground">
                  The end date applies to the whole recurring series. Payments after it are removed.
                </p>
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
                  {optionsFor(category).map(c => (
                    <SelectItem key={c.slug} value={c.slug}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Edit Scope for Recurring Bills */}
          {isEditingRecurring && (
            isOnlyStatusChanged ? (
              <div className="rounded-2xl p-3 bg-secondary/40 border border-border/40 flex items-center gap-2 text-xs text-muted-foreground">
                <Info className="w-3.5 h-3.5 text-primary shrink-0" />
                <span>Payment status applies to this monthly occurrence only. Future months remain independent.</span>
              </div>
            ) : (
              <div className="rounded-2xl p-3.5 bg-secondary/40 border border-border/40 space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold text-foreground">Apply changes to:</Label>
                  <span className="text-[11px] text-muted-foreground">Payment status is always per occurrence</span>
                </div>
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
            )
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              disabled={isBusy}
              onClick={() => onOpenChange(false)}
              className="active:scale-95 transition-transform"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isBusy}
              className="active:scale-95 transition-transform"
            >
              {isBusy
                ? bill
                  ? 'Updating…'
                  : 'Adding…'
                : bill
                  ? 'Update Bill'
                  : 'Add Bill'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
