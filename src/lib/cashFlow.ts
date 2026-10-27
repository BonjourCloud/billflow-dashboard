import type { Bill } from '@/data/bills';
import type { Category, CategoryKind } from '@/data/categories';
import type { BudgetLimit, BudgetSettings, IncomeSource } from '@/data/budget';
import { MonthKey } from '@/lib/billMonth';

export interface IncomeOccurrence {
  sourceId: string;
  name: string;
  amount: number;
  /** ISO date (UTC midnight) the income is expected. */
  date: string;
  /** "YYYY-MM", the key used to record that it was received. */
  cycle: string;
  received: boolean;
  /** False when the source is switched off in the plan. */
  counted: boolean;
}

export function cycleKey(key: MonthKey): string {
  return `${key.year}-${String(key.month + 1).padStart(2, '0')}`;
}

function utcDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/**
 * Income expected in a month. Monthly sources repeat on their day (clamped to
 * the month's length) between start and end dates; one-time sources fall on
 * their own date. Inactive sources are skipped. Nothing is stored for future
 * months: they are worked out here, like expected recurring bills.
 */
export function incomeOccurrencesForMonth(
  sources: IncomeSource[],
  selected: MonthKey,
): IncomeOccurrence[] {
  const cycle = cycleKey(selected);
  const maxDays = new Date(Date.UTC(selected.year, selected.month + 1, 0)).getUTCDate();
  const out: IncomeOccurrence[] = [];

  for (const source of sources) {
    if (!source.isActive) continue;
    const start = new Date(source.startDate);
    if (Number.isNaN(start.getTime())) continue;

    let date: Date;
    if (source.frequency === 'one_time') {
      if (start.getUTCFullYear() !== selected.year || start.getUTCMonth() !== selected.month) {
        continue;
      }
      date = new Date(utcDay(start));
    } else {
      date = new Date(
        Date.UTC(selected.year, selected.month, Math.min(Math.max(1, source.recurringDay), maxDays)),
      );
      if (date.getTime() < utcDay(start)) continue;
      if (source.endDate) {
        const end = new Date(source.endDate);
        if (!Number.isNaN(end.getTime()) && date.getTime() > utcDay(end)) continue;
      }
    }

    out.push({
      sourceId: source._id,
      name: source.name,
      amount: source.amount,
      date: date.toISOString(),
      cycle,
      received: source.receivedCycles.includes(cycle),
      counted: source.countInPlan,
    });
  }

  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export function kindOfCategory(
  slug: string,
  categories: Pick<Category, 'slug' | 'kind'>[],
): CategoryKind {
  return categories.find((c) => c.slug === slug)?.kind ?? 'need';
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface CashFlow {
  /** Counted income expected this month. */
  income: number;
  /** Income already marked received (counted or not). */
  received: number;
  /** Bills and EMIs that are not savings. */
  bills: number;
  /** Bills in savings-type categories (SIPs, RDs...). */
  saved: number;
  /** Planned monthly set-aside for savings goals. */
  goals: number;
  /** income - bills - saved - goals. Negative means a shortfall. */
  free: number;
  /** saved / income, 0 when there is no income. */
  savingsRate: number;
  /** bills / income, null when there is no income. */
  billsShare: number | null;
  /** EMIs / income, null when there is no income. */
  emiRatio: number | null;
  billCount: number;
  incomeCount: number;
}

/** A bill counts as an EMI when it belongs to an installment plan or the Loans category. */
export function isEmiBill(bill: Bill): boolean {
  return Boolean(bill.planId) || bill.category === 'loans';
}

export function computeCashFlow(
  occurrences: IncomeOccurrence[],
  bills: Bill[],
  categories: Pick<Category, 'slug' | 'kind'>[],
  /** Money reserved this month for savings goals (see lib/goals). */
  goalsReserve = 0,
): CashFlow {
  const counted = occurrences.filter((o) => o.counted);
  const income = round2(counted.reduce((s, o) => s + o.amount, 0));
  const received = round2(occurrences.filter((o) => o.received).reduce((s, o) => s + o.amount, 0));

  let billsTotal = 0;
  let saved = 0;
  let emi = 0;
  for (const bill of bills) {
    if (kindOfCategory(bill.category, categories) === 'savings') saved += bill.amount;
    else billsTotal += bill.amount;
    if (isEmiBill(bill)) emi += bill.amount;
  }

  return {
    income,
    received,
    bills: round2(billsTotal),
    saved: round2(saved),
    goals: round2(goalsReserve),
    free: round2(income - billsTotal - saved - goalsReserve),
    savingsRate: income > 0 ? saved / income : 0,
    billsShare: income > 0 ? billsTotal / income : null,
    emiRatio: income > 0 ? emi / income : null,
    billCount: bills.length,
    incomeCount: counted.length,
  };
}

export interface BudgetRow {
  category: string;
  kind: CategoryKind;
  spent: number;
  limit: number | null;
  /** spent / limit, null without a limit. */
  usage: number | null;
  status: 'none' | 'ok' | 'warn' | 'over';
}

/** Fraction of a limit at which a category turns amber. */
export const WARN_AT = 0.8;

export function budgetRows(
  bills: Bill[],
  categories: Pick<Category, 'slug' | 'kind' | 'is_active'>[],
  limits: BudgetLimit[],
): BudgetRow[] {
  const spentBy = new Map<string, number>();
  for (const bill of bills) {
    spentBy.set(bill.category, (spentBy.get(bill.category) ?? 0) + bill.amount);
  }
  const limitBy = new Map(limits.map((l) => [l.category, l.limit]));

  // Active categories, plus any other category that has spend or a limit.
  const slugs = new Set<string>(categories.filter((c) => c.is_active).map((c) => c.slug));
  for (const slug of spentBy.keys()) slugs.add(slug);
  for (const slug of limitBy.keys()) slugs.add(slug);

  return Array.from(slugs).map((category) => {
    const spent = round2(spentBy.get(category) ?? 0);
    const limit = limitBy.get(category) ?? null;
    const usage = limit ? spent / limit : null;
    let status: BudgetRow['status'] = 'none';
    if (usage !== null) status = usage > 1 ? 'over' : usage >= WARN_AT ? 'warn' : 'ok';
    return { category, kind: kindOfCategory(category, categories), spent, limit, usage, status };
  });
}

export interface KindSummary {
  kind: CategoryKind;
  spent: number;
  /** Sum of the limits set for this kind. */
  planned: number;
  /** Share of income the chosen method aims for, in rupees. */
  target: number;
  targetPct: number;
}

export function kindSummaries(
  rows: BudgetRow[],
  income: number,
  settings: BudgetSettings,
): KindSummary[] {
  const pct: Record<CategoryKind, number> = {
    need: settings.needsPct,
    want: settings.wantsPct,
    savings: settings.savingsPct,
  };
  return (['need', 'want', 'savings'] as CategoryKind[]).map((kind) => {
    const ofKind = rows.filter((r) => r.kind === kind);
    return {
      kind,
      spent: round2(ofKind.reduce((s, r) => s + r.spent, 0)),
      planned: round2(ofKind.reduce((s, r) => s + (r.limit ?? 0), 0)),
      target: round2((income * pct[kind]) / 100),
      targetPct: pct[kind],
    };
  });
}
