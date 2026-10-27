import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Wallet, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Bill } from '@/data/bills';
import type { IncomeSource } from '@/data/budget';
import type { Goal } from '@/data/goals';
import { MonthKey } from '@/lib/billMonth';
import { computeCashFlow, incomeOccurrencesForMonth } from '@/lib/cashFlow';
import { formatCurrency } from '@/lib/currency';
import { totalGoalReserve } from '@/lib/goals';
import { useCategories } from '@/hooks/useCategories';

interface CashFlowCardProps {
  sources: IncomeSource[];
  /** Savings goals; their planned set-aside is taken out of free money. */
  goals?: Goal[];
  /** Bills making up the selected month (including expected recurring ones). */
  bills: Bill[];
  selectedMonth: MonthKey;
  monthLabel: string;
  emiWarnPct: number;
}

const pct = (value: number) => `${Math.round(value * 100)}%`;

export function CashFlowCard({ sources, goals = [], bills, selectedMonth, monthLabel, emiWarnPct }: CashFlowCardProps) {
  const { categories } = useCategories();

  const flow = useMemo(
    () =>
      computeCashFlow(
        incomeOccurrencesForMonth(sources, selectedMonth),
        bills,
        categories,
        totalGoalReserve(goals, selectedMonth),
      ),
    [sources, goals, bills, selectedMonth, categories],
  );

  if (sources.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.2, 0, 0, 1], delay: 0.15 }}
        className="col-span-12 glass-card rounded-3xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-2xl bg-primary/10 shrink-0">
            <Wallet className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold">See what&apos;s free to spend</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Add your salary or other income and BillWill will show what is left after your bills each month.
            </p>
          </div>
        </div>
        <Link
          to="/budget/income"
          className="inline-flex items-center justify-center rounded-xl bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold hover:opacity-90 transition-opacity shrink-0"
        >
          Add income
        </Link>
      </motion.div>
    );
  }

  const shortfall = flow.free < 0;
  const scale = Math.max(flow.income, flow.bills + flow.saved + flow.goals, 1);
  const billsW = (flow.bills / scale) * 100;
  const savedW = (flow.saved / scale) * 100;
  const goalsW = (flow.goals / scale) * 100;
  const freeW = shortfall ? 0 : (flow.free / scale) * 100;
  const emiOver = flow.emiRatio !== null && flow.emiRatio * 100 > emiWarnPct;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.2, 0, 0, 1], delay: 0.15 }}
      className="col-span-12 glass-card rounded-3xl p-6 md:p-8"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-muted-foreground uppercase tracking-widest">Cash flow · {monthLabel}</p>
        <Link to="/budget/income" className="text-xs text-primary hover:text-primary/80 transition-colors">
          Manage income
        </Link>
      </div>

      <div className="mt-3">
        <p className="text-sm text-muted-foreground">{shortfall ? 'Shortfall' : 'Free to spend'}</p>
        <p
          className={`text-4xl md:text-5xl font-bold font-mono-data tracking-tighter ${shortfall ? 'text-destructive' : ''}`}
          data-testid="cashflow-free"
        >
          {formatCurrency(Math.abs(flow.free))}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          {flow.income > 0
            ? 'Expected income minus bills, EMIs, savings and goals.'
            : 'No income is expected this month.'}
        </p>
      </div>

      <div className="mt-5">
        <div
          className="flex h-3 rounded-full overflow-hidden bg-secondary"
          role="img"
          aria-label={`Of ${formatCurrency(scale)}: bills ${formatCurrency(flow.bills)}, saved ${formatCurrency(flow.saved)}, goals ${formatCurrency(flow.goals)}, free ${formatCurrency(Math.max(flow.free, 0))}`}
        >
          <div className="bg-amber-500" style={{ width: `${billsW}%` }} />
          <div className="bg-cyan-500" style={{ width: `${savedW}%` }} />
          <div className="bg-violet-500" style={{ width: `${goalsW}%` }} />
          <div className="bg-primary" style={{ width: `${freeW}%` }} />
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-amber-500" />Bills &amp; EMIs</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-cyan-500" />Saved</span>
          {flow.goals > 0 && (
            <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-violet-500" />Goals</span>
          )}
          <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-primary" />Free</span>
        </div>
      </div>

      <div className={`mt-5 grid grid-cols-1 gap-3 ${flow.goals > 0 ? 'sm:grid-cols-4' : 'sm:grid-cols-3'}`}>
        <Chip label="Income" value={formatCurrency(flow.income)} note={`${formatCurrency(flow.received)} received`} />
        <Chip
          label="Bills & EMIs"
          value={formatCurrency(flow.bills)}
          note={flow.billsShare === null ? `${flow.billCount} bills` : `${pct(flow.billsShare)} of income`}
        />
        <Chip label="Saved" value={formatCurrency(flow.saved)} note={`${pct(flow.savingsRate)} savings rate`} />
        {flow.goals > 0 && (
          <Chip label="Goals" value={formatCurrency(flow.goals)} note="Set aside for your goals" />
        )}
      </div>

      {flow.emiRatio !== null && (
        <div
          className={`mt-4 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
            emiOver ? 'bg-destructive/15 text-destructive' : 'bg-primary/15 text-primary'
          }`}
        >
          {emiOver ? <AlertTriangle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
          EMI-to-income {pct(flow.emiRatio)} · {emiOver ? `above your ${emiWarnPct}% limit` : `within your ${emiWarnPct}% limit`}
        </div>
      )}
    </motion.div>
  );
}

function Chip({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-2xl border border-border/40 bg-secondary/30 px-4 py-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold font-mono-data mt-0.5">{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{note}</p>
    </div>
  );
}
