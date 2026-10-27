import { describe, it, expect } from 'vitest';
import type { Bill } from '@/data/bills';
import type { IncomeSource } from '@/data/budget';
import { DEFAULT_BUDGET_SETTINGS } from '@/data/budget';
import { DEFAULT_CATEGORIES } from '@/data/categories';
import {
  budgetRows,
  computeCashFlow,
  incomeOccurrencesForMonth,
  kindSummaries,
} from '@/lib/cashFlow';
import {
  budgetLimitSchema,
  budgetSettingsUpdateSchema,
} from '../../server/src/models/Budget';
import {
  createIncomeSchema,
  incomeReceivedSchema,
  updateIncomeSchema,
} from '../../server/src/models/IncomeSource';

const OCT = { year: 2026, month: 9 };
const FEB = { year: 2027, month: 1 };

function src(over: Partial<IncomeSource> = {}): IncomeSource {
  return {
    _id: 's1',
    name: 'Salary',
    amount: 150000,
    frequency: 'monthly',
    recurringDay: 1,
    startDate: '2026-04-01T00:00:00.000Z',
    endDate: null,
    isActive: true,
    countInPlan: true,
    receivedCycles: [],
    ...over,
  };
}

function bill(id: string, amount: number, category: string, extra: Partial<Bill> = {}): Bill {
  return { _id: id, name: id, amount, dueDate: '2026-10-10T00:00:00.000Z', status: 'pending', category, isSubscription: false, ...extra };
}

describe('incomeOccurrencesForMonth', () => {
  it('repeats monthly income from its start month onward', () => {
    expect(incomeOccurrencesForMonth([src()], OCT)).toHaveLength(1);
    expect(incomeOccurrencesForMonth([src()], { year: 2026, month: 2 })).toHaveLength(0);
  });

  it('clamps the day to short months', () => {
    const [o] = incomeOccurrencesForMonth([src({ recurringDay: 31 })], FEB);
    expect(o.date.slice(0, 10)).toBe('2027-02-28');
  });

  it('stops after the end date and skips inactive sources', () => {
    expect(incomeOccurrencesForMonth([src({ endDate: '2026-08-31T00:00:00.000Z' })], OCT)).toHaveLength(0);
    expect(incomeOccurrencesForMonth([src({ isActive: false })], OCT)).toHaveLength(0);
  });

  it('places one-time income only in its own month', () => {
    const bonus = src({ frequency: 'one_time', startDate: '2026-10-20T00:00:00.000Z' });
    expect(incomeOccurrencesForMonth([bonus], OCT)).toHaveLength(1);
    expect(incomeOccurrencesForMonth([bonus], { year: 2026, month: 10 })).toHaveLength(0);
  });

  it('flags received cycles and plan exclusion', () => {
    const [o] = incomeOccurrencesForMonth([src({ receivedCycles: ['2026-10'], countInPlan: false })], OCT);
    expect(o.received).toBe(true);
    expect(o.counted).toBe(false);
  });
});

describe('computeCashFlow', () => {
  const occ = incomeOccurrencesForMonth([src()], OCT);
  const bills = [
    bill('rent', 20000, 'housing'),
    bill('emi', 22500, 'loans'),
    bill('sip', 30000, 'savings'),
  ];

  it('separates bills, savings and what is free', () => {
    const f = computeCashFlow(occ, bills, DEFAULT_CATEGORIES);
    expect(f.income).toBe(150000);
    expect(f.bills).toBe(42500);
    expect(f.saved).toBe(30000);
    expect(f.free).toBe(77500);
    expect(f.savingsRate).toBeCloseTo(0.2);
    expect(f.emiRatio).toBeCloseTo(0.15);
  });

  it('ignores income switched off in the plan and handles zero income', () => {
    const off = incomeOccurrencesForMonth([src({ countInPlan: false })], OCT);
    const f = computeCashFlow(off, bills, DEFAULT_CATEGORIES);
    expect(f.income).toBe(0);
    expect(f.free).toBe(-72500);
    expect(f.emiRatio).toBeNull();
    expect(f.savingsRate).toBe(0);
  });

  it('treats installment-plan bills as EMIs', () => {
    const f = computeCashFlow(occ, [bill('x', 15000, 'finance', { planId: 'p1' })], DEFAULT_CATEGORIES);
    expect(f.emiRatio).toBeCloseTo(0.1);
  });
});

describe('budgetRows and kindSummaries', () => {
  const bills = [bill('a', 9000, 'groceries'), bill('b', 4000, 'entertainment'), bill('c', 100, 'utilities')];
  const rows = budgetRows(bills, DEFAULT_CATEGORIES, [
    { category: 'groceries', limit: 10000 },
    { category: 'entertainment', limit: 3000 },
    { category: 'utilities', limit: 5000 },
  ]);
  const by = (c: string) => rows.find((r) => r.category === c)!;

  it('grades usage against limits', () => {
    expect(by('groceries').status).toBe('warn');
    expect(by('entertainment').status).toBe('over');
    expect(by('utilities').status).toBe('ok');
    expect(by('housing').status).toBe('none');
  });

  it('keeps a category that was deactivated but still has spend', () => {
    const r = budgetRows([bill('z', 50, 'old')], [{ slug: 'old', kind: 'need', is_active: false }], []);
    expect(r.map((x) => x.category)).toContain('old');
  });

  it('summarises by kind against the chosen split', () => {
    const [need, want, sav] = kindSummaries(rows, 100000, DEFAULT_BUDGET_SETTINGS);
    expect(need.target).toBe(50000);
    expect(want.target).toBe(30000);
    expect(sav.target).toBe(20000);
    expect(want.spent).toBe(4000);
    expect(need.spent).toBe(9100);
    expect(want.planned).toBe(3000);
  });
});

describe('server schemas', () => {
  it('validates income input', () => {
    const ok = { name: 'Salary', amount: 1000, frequency: 'monthly', startDate: '2026-10-01' };
    expect(createIncomeSchema.safeParse(ok).success).toBe(true);
    expect(createIncomeSchema.safeParse({ ...ok, amount: 0 }).success).toBe(false);
    expect(createIncomeSchema.safeParse({ ...ok, frequency: 'weekly' }).success).toBe(false);
    expect(createIncomeSchema.safeParse({ ...ok, extra: 1 }).success).toBe(false);
    expect(updateIncomeSchema.safeParse({}).success).toBe(false);
    expect(updateIncomeSchema.safeParse({ isActive: false }).success).toBe(true);
    expect(incomeReceivedSchema.safeParse({ cycle: '2026-10', received: true }).success).toBe(true);
    expect(incomeReceivedSchema.safeParse({ cycle: '2026-13', received: true }).success).toBe(false);
  });

  it('validates budget limits and settings', () => {
    expect(budgetLimitSchema.safeParse({ limit: 5000 }).success).toBe(true);
    expect(budgetLimitSchema.safeParse({ limit: 0 }).success).toBe(false);
    const s = { method: '50-30-20', needsPct: 50, wantsPct: 30, savingsPct: 20, emiRatioWarnPct: 40 };
    expect(budgetSettingsUpdateSchema.safeParse(s).success).toBe(true);
    expect(budgetSettingsUpdateSchema.safeParse({ ...s, savingsPct: 25 }).success).toBe(false);
    expect(budgetSettingsUpdateSchema.safeParse({ ...s, emiRatioWarnPct: 0 }).success).toBe(false);
  });
});
