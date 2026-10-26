import { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
import {
  Landmark,
  Calculator,
  Info,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';
import {
  InstallmentPlan,
  PlanType,
  PlanCategory,
  PLAN_TYPES,
  PLAN_TYPE_LABELS,
  CreateInstallmentPlanInput,
  UpdateInstallmentPlanInput,
  calculateInstallmentPlanTotals,
} from '@/data/installments';
import { formatCurrency } from '@/lib/currency';
import { useCategories } from '@/hooks/useCategories';

interface InstallmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan?: InstallmentPlan | null;
  onSave: (data: CreateInstallmentPlanInput) => Promise<unknown>;
  onUpdate: (id: string, updates: UpdateInstallmentPlanInput) => Promise<unknown>;
  isPending?: boolean;
}

export function InstallmentDialog({
  open,
  onOpenChange,
  plan,
  onSave,
  onUpdate,
  isPending = false,
}: InstallmentDialogProps) {
  const isEditing = Boolean(plan);

  // Form Fields
  const [name, setName] = useState('');
  const [planType, setPlanType] = useState<PlanType>('car_loan');
  const { optionsFor } = useCategories();
  const [category, setCategory] = useState<PlanCategory>('finance');
  const [principalAmount, setPrincipalAmount] = useState('');
  const [downPayment, setDownPayment] = useState('0');
  const [totalInstallments, setTotalInstallments] = useState('12');
  const [interestRate, setInterestRate] = useState('0');
  const [startDate, setStartDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [recurringDay, setRecurringDay] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // Initialize or reset form state when dialog opens / changes
  useEffect(() => {
    if (!open) {
      setFormError(null);
      return;
    }

    if (plan) {
      // Edit mode: only name, category, planType
      setName(plan.name);
      setPlanType(plan.planType);
      setCategory(plan.category);
      setFormError(null);
    } else {
      // Create mode: fresh or retry attempt
      setName('');
      setPlanType('car_loan');
      setCategory('finance');
      setPrincipalAmount('');
      setDownPayment('0');
      setTotalInstallments('12');
      setInterestRate('0');
      setStartDate(new Date().toISOString().split('T')[0]);
      setRecurringDay('');
      setFormError(null);
      // Generate one idempotency key per creation attempt; reuse it on validation or retry
      setIdempotencyKey(crypto.randomUUID());
    }
  }, [open, plan]);

  // Live calculation preview
  const livePreview = useMemo(() => {
    if (isEditing) return null;

    const p = parseFloat(principalAmount);
    const d = parseFloat(downPayment) || 0;
    const n = parseInt(totalInstallments, 10);
    const r = parseFloat(interestRate) || 0;

    if (Number.isNaN(p) || p <= 0) {
      return { valid: false, error: 'Enter a positive principal amount.' };
    }
    if (d < 0) {
      return { valid: false, error: 'Down payment cannot be negative.' };
    }
    if (d >= p) {
      return {
        valid: false,
        error: 'Down payment must be less than principal amount.',
      };
    }
    if (Number.isNaN(n) || n < 2 || n > 120) {
      return {
        valid: false,
        error: 'Installment count must be between 2 and 120 months.',
      };
    }
    if (r < 0 || r > 100) {
      return {
        valid: false,
        error: 'Interest rate must be between 0% and 100%.',
      };
    }

    try {
      const totals = calculateInstallmentPlanTotals({
        principalAmount: p,
        downPayment: d,
        totalInstallments: n,
        interestRate: r,
      });
      return { valid: true, totals };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Calculation error';
      return { valid: false, error: msg };
    }
  }, [isEditing, principalAmount, downPayment, totalInstallments, interestRate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isPending) return;

    if (!name.trim()) {
      setFormError('Plan name is required.');
      return;
    }

    if (isEditing && plan) {
      try {
        setFormError(null);
        await onUpdate(plan._id, {
          name: name.trim(),
          category,
          planType,
        });
        onOpenChange(false);
      } catch (err: unknown) {
        setFormError(
          err instanceof Error ? err.message : 'Failed to update plan.',
        );
      }
      return;
    }

    // Validation for create mode
    if (!livePreview || !livePreview.valid || !livePreview.totals) {
      setFormError(livePreview?.error || 'Please correct errors before submitting.');
      return;
    }

    if (!startDate) {
      setFormError('Please select a start date.');
      return;
    }

    const parsedDay = recurringDay ? parseInt(recurringDay, 10) : undefined;
    if (parsedDay !== undefined && (parsedDay < 1 || parsedDay > 31)) {
      setFormError('Billing day must be between 1 and 31.');
      return;
    }

    setFormError(null);
    try {
      await onSave({
        name: name.trim(),
        planType,
        category,
        principalAmount: parseFloat(principalAmount),
        downPayment: parseFloat(downPayment) || 0,
        totalInstallments: parseInt(totalInstallments, 10),
        interestRate: parseFloat(interestRate) || 0,
        startDate: new Date(startDate).toISOString(),
        recurringDay: parsedDay,
        // Reuse the same idempotency key if user retries after a network error
        idempotencyKey: idempotencyKey || crypto.randomUUID(),
      });
      onOpenChange(false);
    } catch (err: unknown) {
      // Keep form and idempotency key intact so retry preserves key
      setFormError(
        err instanceof Error ? err.message : 'Failed to create installment plan.',
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Landmark className="w-4 h-4" />
            </div>
            <div>
              <DialogTitle>
                {isEditing ? 'Edit Installment Plan' : 'Create Installment / EMI Plan'}
              </DialogTitle>
              <DialogDescription>
                {isEditing
                  ? 'Update metadata for this plan. Financial terms and schedules are locked.'
                  : 'Set up a finite installment loan or EMI schedule with automated monthly tracking.'}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {formError && (
            <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {/* Plan Name */}
          <div className="space-y-1.5">
            <Label htmlFor="plan-name">Plan Name *</Label>
            <Input
              id="plan-name"
              placeholder="e.g., Honda Civic EMI, iPhone 16 Pro"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              required
            />
          </div>

          {/* Plan Type & Category */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="plan-type">Plan Type</Label>
              <Select
                value={planType}
                onValueChange={(val: PlanType) => setPlanType(val)}
              >
                <SelectTrigger id="plan-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLAN_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {PLAN_TYPE_LABELS[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="plan-category">Category</Label>
              <Select
                value={category}
                onValueChange={(val: PlanCategory) => setCategory(val)}
              >
                <SelectTrigger id="plan-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {optionsFor(category).map((cat) => (
                    <SelectItem key={cat.slug} value={cat.slug}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {!isEditing && (
            <>
              {/* Financial Inputs: Principal & Down Payment */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="principal-amount">Principal Amount (₹) *</Label>
                  <Input
                    id="principal-amount"
                    type="number"
                    step="0.01"
                    min="1"
                    max="100000000"
                    placeholder="25000.00"
                    value={principalAmount}
                    onChange={(e) => setPrincipalAmount(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="down-payment">Down Payment (₹)</Label>
                  <Input
                    id="down-payment"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={downPayment}
                    onChange={(e) => setDownPayment(e.target.value)}
                  />
                </div>
              </div>

              {/* Installments count & Interest rate */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="total-installments">
                    Installment Count (Months) *
                  </Label>
                  <Input
                    id="total-installments"
                    type="number"
                    min="2"
                    max="120"
                    placeholder="12"
                    value={totalInstallments}
                    onChange={(e) => setTotalInstallments(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="interest-rate">Annual Flat Rate (%)</Label>
                  <Input
                    id="interest-rate"
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    placeholder="0"
                    value={interestRate}
                    onChange={(e) => setInterestRate(e.target.value)}
                  />
                </div>
              </div>

              {/* Dates: Start Date & Recurring Day */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="start-date">First Due Date *</Label>
                  <Input
                    id="start-date"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="recurring-day">Billing Day of Month</Label>
                  <Input
                    id="recurring-day"
                    type="number"
                    min="1"
                    max="31"
                    placeholder="Auto (from date)"
                    value={recurringDay}
                    onChange={(e) => setRecurringDay(e.target.value)}
                  />
                </div>
              </div>

              {/* Live Preview Card */}
              {livePreview && livePreview.valid && livePreview.totals && (
                <div className="rounded-2xl p-4 bg-secondary/40 border border-border/60 space-y-3">
                  <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    <span className="flex items-center gap-1.5">
                      <Calculator className="w-3.5 h-3.5 text-primary" /> Live Calculation Preview
                    </span>
                    <span className="text-[10px] text-primary/80 lowercase">flat interest</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-muted-foreground">Financed Amount:</span>{' '}
                      <span className="font-semibold font-mono-data">
                        {formatCurrency(livePreview.totals.financedAmount)}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Total Interest:</span>{' '}
                      <span className="font-semibold font-mono-data text-accent">
                        {formatCurrency(livePreview.totals.totalInterest)}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Scheduled Total:</span>{' '}
                      <span className="font-bold font-mono-data">
                        {formatCurrency(livePreview.totals.scheduledTotal)}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Per Month:</span>{' '}
                      <span className="font-bold font-mono-data text-primary">
                        {formatCurrency(livePreview.totals.baseInstallmentAmount)}
                      </span>
                    </div>
                  </div>

                  {livePreview.totals.roundingDifference > 0 && (
                    <p className="text-[11px] text-muted-foreground italic">
                      Final installment will be adjusted by +{formatCurrency(livePreview.totals.roundingDifference)} to exactly match scheduled total.
                    </p>
                  )}

                  <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Info className="w-3 h-3 text-muted-foreground/80 shrink-0" />
                    Calculated using standard flat consumer interest (I = P · r · t), not reducing-balance amortization.
                  </p>
                </div>
              )}
            </>
          )}

          {isEditing && (
            <div className="rounded-xl p-3 bg-secondary/30 border border-border/40 text-xs text-muted-foreground flex items-center gap-2">
              <Info className="w-4 h-4 text-primary shrink-0" />
              <span>
                Principal amount, interest rate, down payment, and installment schedule cannot be modified after plan creation.
              </span>
            </div>
          )}

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || (!isEditing && !livePreview?.valid)}>
              {isPending
                ? isEditing
                  ? 'Saving Changes...'
                  : 'Creating Plan...'
                : isEditing
                ? 'Save Changes'
                : 'Create Plan'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
