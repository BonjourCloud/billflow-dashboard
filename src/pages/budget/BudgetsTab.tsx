import { useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { MonthSwitcher } from '@/components/budget/MonthSwitcher';
import { useBudgets, useBudgetSettings, useIncome } from '@/hooks/useBudget';
import { useCategories } from '@/hooks/useCategories';
import { useMonthBills } from '@/hooks/useMonthBills';
import { useMonthSelector } from '@/hooks/useMonthSelector';
import { KIND_LABELS } from '@/data/categories';
import { BudgetRow, budgetRows, computeCashFlow, incomeOccurrencesForMonth, kindSummaries } from '@/lib/cashFlow';
import { formatCurrency } from '@/lib/currency';

const BAR_COLOR: Record<BudgetRow['status'], string> = {
  none: 'bg-primary/60',
  ok: 'bg-primary',
  warn: 'bg-amber-500',
  over: 'bg-destructive',
};

const KIND_BAR: Record<'need' | 'want' | 'savings', string> = {
  need: 'bg-blue-500',
  want: 'bg-purple-500',
  savings: 'bg-cyan-500',
};

export default function BudgetsTab() {
  const month = useMonthSelector();
  const { categories, getLabel } = useCategories();
  const { limits, setLimit } = useBudgets();
  const { settings } = useBudgetSettings();
  const { sources } = useIncome();
  const { bills, carriedOverCount, projectedCount } = useMonthBills(month.selected);

  const flow = useMemo(
    () => computeCashFlow(incomeOccurrencesForMonth(sources, month.selected), bills, categories),
    [sources, bills, categories, month.selected],
  );
  const rows = useMemo(() => budgetRows(bills, categories, limits), [bills, categories, limits]);
  const summaries = useMemo(() => kindSummaries(rows, flow.income, settings), [rows, flow.income, settings]);

  const planned = summaries.reduce((s, k) => s + k.planned, 0);
  const unassigned = flow.income - planned;
  const sorted = [...rows].sort(
    (a, b) => Number(b.limit !== null || b.spent > 0) - Number(a.limit !== null || a.spent > 0) || a.category.localeCompare(b.category),
  );

  const commit = (category: string, raw: string, current: number | null) => {
    const text = raw.replace(/,/g, '').trim();
    if (text === '') {
      if (current !== null) setLimit(category, null);
      return;
    }
    const value = Number(text);
    if (!Number.isFinite(value) || value <= 0) return;
    if (value !== current) setLimit(category, value);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Budgets</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Set a monthly limit per category. Spent is the total of your bills in that category for the month.
          </p>
        </div>
        <MonthSwitcher label={month.label} isCurrent={month.isCurrent} onPrev={month.prev} onNext={month.next} onToday={month.today} />
      </div>

      {settings.method === '50-30-20' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {summaries.map((k) => (
            <div key={k.kind} className="glass-card rounded-3xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
                  {KIND_LABELS[k.kind]}s
                </p>
                <span className="text-xs rounded-full bg-primary/15 text-primary px-2 py-0.5 font-semibold">
                  Target {k.targetPct}%
                </span>
              </div>
              <p className="text-2xl font-bold font-mono-data">{formatCurrency(k.spent)}</p>
              <div className="h-2 rounded-full bg-secondary overflow-hidden">
                <div
                  className={`h-full rounded-full ${KIND_BAR[k.kind]}`}
                  style={{ width: `${k.target > 0 ? Math.min(100, (k.spent / k.target) * 100) : 0}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                of {formatCurrency(k.target)} target · {formatCurrency(k.planned)} in limits
              </p>
            </div>
          ))}
        </div>
      )}

      {flow.income > 0 && planned > 0 && (
        <div className="rounded-2xl border border-border/40 bg-secondary/30 px-4 py-3 text-sm">
          {unassigned >= 0 ? (
            <>
              <strong>{formatCurrency(unassigned)}</strong> of your {formatCurrency(flow.income)} expected income isn&apos;t covered by a limit yet.
            </>
          ) : (
            <>
              Your limits add up to <strong>{formatCurrency(-unassigned)}</strong> more than your expected income.
            </>
          )}
        </div>
      )}

      {(carriedOverCount > 0 || projectedCount > 0) && (
        <p className="text-xs text-muted-foreground">
          {projectedCount > 0 && `Includes ${projectedCount} expected recurring ${projectedCount === 1 ? 'bill' : 'bills'} not yet created. `}
          {carriedOverCount > 0 && `Includes ${carriedOverCount} unpaid ${carriedOverCount === 1 ? 'bill' : 'bills'} from earlier months.`}
        </p>
      )}

      <div className="glass-card rounded-3xl p-6">
        <h3 className="font-semibold mb-2">By category</h3>
        <ul>
          {sorted.map((row) => (
            <li key={row.category} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 border-t border-border/40 first:border-t-0">
              <div className="flex-1 min-w-[160px]">
                <p className="font-medium text-sm">
                  {getLabel(row.category)}
                  <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide rounded-full bg-secondary px-2 py-0.5 text-muted-foreground">
                    {KIND_LABELS[row.kind]}
                  </span>
                </p>
              </div>
              <div className="flex-[2_1_180px] min-w-[140px]">
                <div className="h-2 rounded-full bg-secondary overflow-hidden">
                  <div
                    className={`h-full rounded-full ${BAR_COLOR[row.status]}`}
                    style={{ width: `${row.usage === null ? (row.spent > 0 ? 100 : 0) : Math.min(100, row.usage * 100)}%` }}
                  />
                </div>
              </div>
              <p className={`flex-[1_1_150px] text-right text-sm font-mono-data ${row.status === 'over' ? 'text-destructive font-semibold' : 'text-muted-foreground'}`}>
                {formatCurrency(row.spent)}
                {row.limit !== null && row.status === 'over' && ` · over by ${formatCurrency(row.spent - row.limit)}`}
              </p>
              <Input
                key={`${row.category}-${row.limit}`}
                className="w-28 text-right font-mono-data"
                inputMode="decimal"
                placeholder="No limit"
                defaultValue={row.limit ?? ''}
                aria-label={`${getLabel(row.category)} monthly limit`}
                onBlur={(e) => commit(row.category, e.target.value, row.limit)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                }}
              />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
