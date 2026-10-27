import { useMemo, useState } from 'react';
import { z } from 'zod';
import { format } from 'date-fns';
import { Plus, Pencil, Trash2, PiggyBank, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { useGoals, type GoalUpdate } from '@/hooks/useGoals';
import { currentMonthKey } from '@/lib/billMonth';
import { formatCurrency } from '@/lib/currency';
import { goalProgress, suggestedMonthly, totalGoalReserve, type GoalState } from '@/lib/goals';
import type { Goal } from '@/data/goals';

const goalSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(100, 'Name must not exceed 100 characters.'),
  targetAmount: z
    .number({ invalid_type_error: 'Enter the amount you want to reach.' })
    .positive('The target must be more than zero.')
    .max(1_000_000_000),
  targetDate: z.string().min(1, 'Pick a target date.'),
  monthlyAmount: z.number().positive('The monthly amount must be more than zero.').max(1_000_000_000).optional(),
});

const contributionSchema = z.object({
  amount: z
    .number({ invalid_type_error: 'Enter an amount.' })
    .positive('Amount must be more than zero.')
    .max(1_000_000_000),
  date: z.string().min(1, 'Pick a date.'),
  note: z.string().trim().max(100, 'Note must not exceed 100 characters.').optional(),
});

const toNumber = (text: string) => (text.trim() === '' ? NaN : Number(text.replace(/,/g, '')));

/** First day of this month in UTC, as the server plans from it. */
const thisMonthStartIso = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
};

const STATE_LABEL: Record<GoalState, { text: string; className: string }> = {
  funded: { text: 'Funded', className: 'bg-emerald-500/15 text-emerald-500' },
  on_track: { text: 'On track', className: 'bg-primary/15 text-primary' },
  behind: { text: 'Behind plan', className: 'bg-amber-500/15 text-amber-500' },
  overdue: { text: 'Past target date', className: 'bg-destructive/15 text-destructive' },
  paused: { text: 'Paused', className: 'bg-secondary text-muted-foreground' },
  upcoming: { text: 'Starts soon', className: 'bg-secondary text-muted-foreground' },
};

export default function GoalsTab() {
  const { goals, isLoading, create, update, remove, addContribution, removeContribution } = useGoals();
  const now = currentMonthKey();

  // ---- Goal dialog -----------------------------------------------------
  const [goalOpen, setGoalOpen] = useState(false);
  const [editing, setEditing] = useState<Goal | null>(null);
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [monthly, setMonthly] = useState('');
  const [monthlyTouched, setMonthlyTouched] = useState(false);

  const startIso = editing ? editing.startDate : thisMonthStartIso();
  const suggestion = useMemo(() => {
    const amount = toNumber(target);
    if (!Number.isFinite(amount) || amount <= 0 || !targetDate) return null;
    if (Number.isNaN(Date.parse(targetDate)) || new Date(targetDate).getTime() < new Date(startIso).getTime() - 31 * 86400000) {
      return null;
    }
    return suggestedMonthly(amount, startIso, targetDate);
  }, [target, targetDate, startIso]);

  const targetChanged =
    editing !== null &&
    (toNumber(target) !== editing.targetAmount || targetDate !== editing.targetDate.slice(0, 10));
  // Untouched, an edited goal re-plans itself when its target or date changes.
  const monthlyShown =
    monthlyTouched || !(editing && targetChanged && suggestion) ? monthly : String(suggestion);

  const openNew = () => {
    setEditing(null);
    setName('');
    setTarget('');
    setTargetDate('');
    setMonthly('');
    setMonthlyTouched(false);
    setGoalOpen(true);
  };

  const openEdit = (g: Goal) => {
    setEditing(g);
    setName(g.name);
    setTarget(String(g.targetAmount));
    setTargetDate(g.targetDate.slice(0, 10));
    setMonthly(String(g.monthlyAmount));
    setMonthlyTouched(false);
    setGoalOpen(true);
  };

  const saveGoal = () => {
    const monthlyNumber = toNumber(monthly);
    const parsed = goalSchema.safeParse({
      name,
      targetAmount: toNumber(target),
      targetDate,
      monthlyAmount: monthlyTouched && Number.isFinite(monthlyNumber) ? monthlyNumber : undefined,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Check the form.');
      return;
    }
    if (monthlyTouched && monthly.trim() !== '' && !Number.isFinite(monthlyNumber)) {
      toast.error('Enter a valid monthly amount.');
      return;
    }

    if (editing) {
      // Send only what changed, so a custom monthly amount survives a rename.
      const updates: GoalUpdate = {};
      if (parsed.data.name !== editing.name) updates.name = parsed.data.name;
      if (parsed.data.targetAmount !== editing.targetAmount) updates.targetAmount = parsed.data.targetAmount;
      if (parsed.data.targetDate !== editing.targetDate.slice(0, 10)) updates.targetDate = parsed.data.targetDate;
      if (parsed.data.monthlyAmount !== undefined) updates.monthlyAmount = parsed.data.monthlyAmount;
      if (Object.keys(updates).length === 0) {
        setGoalOpen(false);
        return;
      }
      update.mutate({ id: editing._id, updates }, { onSuccess: () => setGoalOpen(false) });
    } else {
      create.mutate(
        {
          name: parsed.data.name,
          targetAmount: parsed.data.targetAmount,
          targetDate: parsed.data.targetDate,
          monthlyAmount: parsed.data.monthlyAmount,
        },
        { onSuccess: () => setGoalOpen(false) },
      );
    }
  };

  const confirmRemove = (g: Goal) => {
    if (confirm(`Remove "${g.name}" and everything saved towards it?`)) remove.mutate(g._id);
  };

  // ---- Add money dialog --------------------------------------------------
  const [moneyFor, setMoneyFor] = useState<Goal | null>(null);
  const [moneyAmount, setMoneyAmount] = useState('');
  const [moneyDate, setMoneyDate] = useState('');
  const [moneyNote, setMoneyNote] = useState('');

  const openMoney = (g: Goal) => {
    setMoneyFor(g);
    setMoneyAmount(g.monthlyAmount ? String(g.monthlyAmount) : '');
    setMoneyDate(format(new Date(), 'yyyy-MM-dd'));
    setMoneyNote('');
  };

  const saveMoney = () => {
    if (!moneyFor) return;
    const parsed = contributionSchema.safeParse({
      amount: toNumber(moneyAmount),
      date: moneyDate,
      note: moneyNote || undefined,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Check the form.');
      return;
    }
    addContribution.mutate(
      {
        id: moneyFor._id,
        input: { amount: parsed.data.amount, date: parsed.data.date, note: parsed.data.note },
      },
      { onSuccess: () => setMoneyFor(null) },
    );
  };

  // ---- Summary -----------------------------------------------------------
  const active = goals.filter((g) => g.isActive);
  const totalSaved = goals.reduce((s, g) => s + g.savedAmount, 0);
  const totalTarget = goals.reduce((s, g) => s + g.targetAmount, 0);
  const reserve = totalGoalReserve(goals, now);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Goals</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Set money aside for something you know is coming, like school fees, a trip or an emergency fund.
          </p>
        </div>
        <Button onClick={openNew} className="gap-2"><Plus className="w-4 h-4" /> Add goal</Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="glass-card rounded-3xl p-5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest">Saved so far</p>
          <p className="text-2xl font-bold font-mono-data mt-2" data-testid="goals-saved">{formatCurrency(totalSaved)}</p>
          <p className="text-xs text-muted-foreground mt-1">of {formatCurrency(totalTarget)} across {goals.length} {goals.length === 1 ? 'goal' : 'goals'}</p>
        </div>
        <div className="glass-card rounded-3xl p-5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest">Set aside this month</p>
          <p className="text-2xl font-bold font-mono-data mt-2" data-testid="goals-reserve">{formatCurrency(reserve)}</p>
          <p className="text-xs text-muted-foreground mt-1">Already taken out of Free to spend</p>
        </div>
        <div className="glass-card rounded-3xl p-5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest">Active goals</p>
          <p className="text-2xl font-bold font-mono-data mt-2">{active.length}</p>
          <p className="text-xs text-muted-foreground mt-1">{goals.length - active.length} paused or finished</p>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground py-6">Loading…</p>
      ) : goals.length === 0 ? (
        <div className="glass-card rounded-3xl p-8 text-center">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
            <PiggyBank className="w-6 h-6 text-primary" />
          </div>
          <h3 className="font-semibold mt-4">No goals yet</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
            Add a goal such as a ₹1,35,000 school-fee fund. BillWill works out the monthly amount and takes it out of what is free to spend.
          </p>
          <Button onClick={openNew} className="mt-5 gap-2"><Plus className="w-4 h-4" /> Add your first goal</Button>
        </div>
      ) : (
        <ul className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {goals.map((g) => {
            const p = goalProgress(g, now);
            const badge = STATE_LABEL[p.state];
            return (
              <li key={g._id} className="glass-card rounded-3xl p-6 space-y-4" data-testid="goal-card">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-semibold truncate">{g.name}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      By {format(new Date(g.targetDate), 'MMM yyyy')} · {formatCurrency(g.monthlyAmount)} a month
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${badge.className}`}>{badge.text}</span>
                </div>

                <div>
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-2xl font-bold font-mono-data">{formatCurrency(g.savedAmount)}</p>
                    <p className="text-sm text-muted-foreground font-mono-data">of {formatCurrency(g.targetAmount)}</p>
                  </div>
                  <div
                    className="mt-2 h-2.5 rounded-full bg-secondary overflow-hidden"
                    role="progressbar"
                    aria-label={`${g.name} progress`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(p.fraction * 100)}
                  >
                    <div className="h-full bg-primary transition-all" style={{ width: `${p.fraction * 100}%` }} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    {p.state === 'funded'
                      ? 'Fully funded.'
                      : p.state === 'overdue'
                        ? `${formatCurrency(p.remaining)} still to go and the target month has passed.`
                        : p.state === 'behind'
                          ? `${formatCurrency(p.behindBy)} behind plan · ${formatCurrency(p.remaining)} to go over ${p.monthsLeft} ${p.monthsLeft === 1 ? 'month' : 'months'}.`
                          : `${formatCurrency(p.remaining)} to go over ${p.monthsLeft} ${p.monthsLeft === 1 ? 'month' : 'months'}.`}
                  </p>
                </div>

                {g.contributions.length > 0 && (
                  <ul className="text-xs space-y-1.5 border-t border-border/40 pt-3">
                    {g.contributions.slice(0, 3).map((c) => (
                      <li key={c._id} className="flex items-center gap-2">
                        <span className="text-muted-foreground w-16 shrink-0">{format(new Date(c.date), 'MMM dd')}</span>
                        <span className="flex-1 truncate text-muted-foreground">{c.note ?? 'Added'}</span>
                        <span className="font-mono-data">{formatCurrency(c.amount)}</span>
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-destructive"
                          aria-label={`Remove ${formatCurrency(c.amount)} entry from ${g.name}`}
                          onClick={() => removeContribution.mutate({ id: g._id, contributionId: c._id })}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </li>
                    ))}
                    {g.contributions.length > 3 && (
                      <li className="text-muted-foreground">and {g.contributions.length - 3} earlier entries</li>
                    )}
                  </ul>
                )}

                <div className="flex flex-wrap items-center gap-2 border-t border-border/40 pt-3">
                  <Button size="sm" onClick={() => openMoney(g)} disabled={p.state === 'funded'}>Add money</Button>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground ml-1">
                    <Switch
                      checked={g.isActive}
                      onCheckedChange={(v) => update.mutate({ id: g._id, updates: { isActive: v }, quiet: true })}
                      aria-label={`Keep ${g.name} in my plan`}
                    />
                    In plan
                  </label>
                  <div className="ml-auto flex items-center">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(g)} aria-label={`Edit ${g.name}`}><Pencil className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="icon" className="text-destructive" onClick={() => confirmRemove(g)} aria-label={`Remove ${g.name}`}><Trash2 className="w-4 h-4" /></Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-xs text-muted-foreground">
        The monthly amount is taken out of Free to spend from this month until the target month, whether or not you have added the money yet.
        Use Add money to record what you have actually put aside; it only tracks progress.
      </p>

      <Dialog open={goalOpen} onOpenChange={setGoalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit goal' : 'Add goal'}</DialogTitle>
            <DialogDescription>Saved from the start of this month to the month of your target date.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="goal-name">Name</Label>
              <Input id="goal-name" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} placeholder="School fee fund" autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="goal-target">Target amount (₹)</Label>
                <Input id="goal-target" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="1,35,000" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="goal-date">Target date</Label>
                <Input id="goal-date" type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="goal-monthly">Monthly amount (₹)</Label>
              <Input
                id="goal-monthly"
                inputMode="decimal"
                value={monthlyShown}
                onChange={(e) => { setMonthly(e.target.value); setMonthlyTouched(true); }}
                placeholder={suggestion ? String(suggestion) : 'Worked out for you'}
              />
              <p className="text-xs text-muted-foreground">
                {suggestion
                  ? `${formatCurrency(suggestion)} a month reaches the target on time.${editing ? ' Change the target or date and it is re-planned unless you type an amount.' : ' Leave this empty to use it.'}`
                  : 'Enter a target and date to see the monthly amount.'}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setGoalOpen(false)}>Cancel</Button>
            <Button onClick={saveGoal} disabled={create.isPending || update.isPending}>
              {create.isPending || update.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={moneyFor !== null} onOpenChange={(v) => { if (!v) setMoneyFor(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add money{moneyFor ? ` to ${moneyFor.name}` : ''}</DialogTitle>
            <DialogDescription>Record money you have moved aside for this goal.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="money-amount">Amount (₹)</Label>
              <Input id="money-amount" inputMode="decimal" value={moneyAmount} onChange={(e) => setMoneyAmount(e.target.value)} autoFocus />
            </div>
            <div className="space-y-2">
              <Label htmlFor="money-date">Date</Label>
              <Input id="money-date" type="date" value={moneyDate} onChange={(e) => setMoneyDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="money-note">Note (optional)</Label>
              <Input id="money-note" value={moneyNote} maxLength={100} onChange={(e) => setMoneyNote(e.target.value)} placeholder="October set-aside" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMoneyFor(null)}>Cancel</Button>
            <Button onClick={saveMoney} disabled={addContribution.isPending}>
              {addContribution.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
