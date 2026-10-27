import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useBudgetSettings } from '@/hooks/useBudget';
import { BudgetMethod, DEFAULT_BUDGET_SETTINGS } from '@/data/budget';

const toInt = (text: string) => (text.trim() === '' ? NaN : Number(text));

export default function BudgetSettingsTab() {
  const { settings, save } = useBudgetSettings();
  const [method, setMethod] = useState<BudgetMethod>(settings.method);
  const [needs, setNeeds] = useState(String(settings.needsPct));
  const [wants, setWants] = useState(String(settings.wantsPct));
  const [savings, setSavings] = useState(String(settings.savingsPct));
  const [emi, setEmi] = useState(String(settings.emiRatioWarnPct));

  // Reflect saved values once they arrive from the server.
  useEffect(() => {
    setMethod(settings.method);
    setNeeds(String(settings.needsPct));
    setWants(String(settings.wantsPct));
    setSavings(String(settings.savingsPct));
    setEmi(String(settings.emiRatioWarnPct));
  }, [settings]);

  const total = toInt(needs) + toInt(wants) + toInt(savings);

  const submit = () => {
    const next = {
      method,
      needsPct: toInt(needs),
      wantsPct: toInt(wants),
      savingsPct: toInt(savings),
      emiRatioWarnPct: toInt(emi),
    };
    const values = [next.needsPct, next.wantsPct, next.savingsPct, next.emiRatioWarnPct];
    if (values.some((v) => !Number.isInteger(v))) {
      toast.error('Enter whole numbers in every box.');
      return;
    }
    if (next.needsPct + next.wantsPct + next.savingsPct !== 100) {
      toast.error('Needs, wants and savings must add up to 100.');
      return;
    }
    if (next.emiRatioWarnPct < 1 || next.emiRatioWarnPct > 100) {
      toast.error('The EMI limit must be between 1 and 100.');
      return;
    }
    save.mutate(next);
  };

  const reset = () => {
    setMethod(DEFAULT_BUDGET_SETTINGS.method);
    setNeeds(String(DEFAULT_BUDGET_SETTINGS.needsPct));
    setWants(String(DEFAULT_BUDGET_SETTINGS.wantsPct));
    setSavings(String(DEFAULT_BUDGET_SETTINGS.savingsPct));
    setEmi(String(DEFAULT_BUDGET_SETTINGS.emiRatioWarnPct));
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Budget settings</h2>
        <p className="text-sm text-muted-foreground mt-1">These rules change how your budget numbers are shown.</p>
      </div>

      <div className="glass-card rounded-3xl p-6 space-y-5">
        <div className="space-y-2">
          <Label htmlFor="budget-method">Budget method</Label>
          <Select value={method} onValueChange={(v) => setMethod(v as BudgetMethod)}>
            <SelectTrigger id="budget-method"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="limits">Category limits</SelectItem>
              <SelectItem value="50-30-20">Needs / wants / savings split</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Category limits: a cap for each category. Split: also compare your spending with a share of income for needs, wants and savings.
          </p>
        </div>

        <div className="space-y-2">
          <Label>Your split (%)</Label>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label htmlFor="pct-needs" className="text-xs text-muted-foreground">Needs</Label>
              <Input id="pct-needs" inputMode="numeric" value={needs} onChange={(e) => setNeeds(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pct-wants" className="text-xs text-muted-foreground">Wants</Label>
              <Input id="pct-wants" inputMode="numeric" value={wants} onChange={(e) => setWants(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pct-savings" className="text-xs text-muted-foreground">Savings</Label>
              <Input id="pct-savings" inputMode="numeric" value={savings} onChange={(e) => setSavings(e.target.value)} />
            </div>
          </div>
          <p className={`text-xs ${total === 100 ? 'text-muted-foreground' : 'text-destructive'}`}>
            Total {Number.isNaN(total) ? '–' : total}. It must be 100.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="emi-limit">Warn when EMIs take more than (% of income)</Label>
          <Input id="emi-limit" inputMode="numeric" className="w-28" value={emi} onChange={(e) => setEmi(e.target.value)} />
          <p className="text-xs text-muted-foreground">Lenders usually get cautious above about 40–50%.</p>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={reset}>Reset to defaults</Button>
          <Button onClick={submit} disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save settings'}</Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Whether a category counts as a need, a want or savings is set by your admin under Admin → Categories.
      </p>
    </div>
  );
}
