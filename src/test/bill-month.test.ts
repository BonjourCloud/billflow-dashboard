import { describe, it, expect } from 'vitest';
import type { Bill } from '@/data/bills';
import type { Subscription } from '@/data/subscriptions';
import type { PaymentRecord } from '@/data/billDetails';
import { calculateBillStats } from '@/hooks/useBillStore';
import {
  currentMonthKey,
  formatMonthLabel,
  projectRecurringBills,
  scopeBillsToMonth,
  scopePaymentsToBills,
  shiftMonth,
} from '@/lib/billMonth';

const NOW = new Date(2026, 9, 26); // 26 Oct 2026 (local)
const OCT = { year: 2026, month: 9 };

function bill(id: string, dueDate: string, amount: number, status: Bill['status'] = 'pending'): Bill {
  return { _id: id, name: id, amount, dueDate, status, category: 'utilities', isSubscription: false };
}

const rent = bill('rent', '2026-11-05T00:00:00.000Z', 20000);
const electricity = bill('elec', '2026-10-30T00:00:00.000Z', 5000);
const octPaid = bill('paid', '2026-10-03T00:00:00.000Z', 1000, 'paid');
const schoolFee = bill('school', '2026-12-05T00:00:00.000Z', 135000);
const lateSep = bill('sep', '2026-09-10T00:00:00.000Z', 700, 'overdue');
const paidSep = bill('sep-paid', '2026-09-02T00:00:00.000Z', 300, 'paid');
const all = [rent, electricity, octPaid, schoolFee, lateSep, paidSep];

describe('month helpers', () => {
  it('shifts across year boundaries both ways', () => {
    expect(shiftMonth({ year: 2026, month: 11 }, 1)).toEqual({ year: 2027, month: 0 });
    expect(shiftMonth({ year: 2026, month: 0 }, -1)).toEqual({ year: 2025, month: 11 });
    expect(shiftMonth({ year: 2026, month: 5 }, -18)).toEqual({ year: 2024, month: 11 });
  });

  it('formats labels and reads the current month', () => {
    expect(formatMonthLabel(OCT)).toBe('October 2026');
    expect(currentMonthKey(NOW)).toEqual(OCT);
  });
});

describe('scopeBillsToMonth', () => {
  it('excludes bills due in later months (the Dec school fee does not count in October)', () => {
    const { bills } = scopeBillsToMonth(all, OCT, NOW);
    expect(bills.map((b) => b._id)).not.toContain('school');
    expect(bills.map((b) => b._id)).not.toContain('rent');
  });

  it('includes this month plus unpaid carry-over, but not paid bills from earlier months', () => {
    const { bills, carriedOverCount } = scopeBillsToMonth(all, OCT, NOW);
    expect(bills.map((b) => b._id).sort()).toEqual(['elec', 'paid', 'sep'].sort());
    expect(carriedOverCount).toBe(1);
  });

  it('shows only that month for a future month, with no carry-over', () => {
    const dec = scopeBillsToMonth(all, { year: 2026, month: 11 }, NOW);
    expect(dec.bills.map((b) => b._id)).toEqual(['school']);
    expect(dec.carriedOverCount).toBe(0);
  });

  it('shows only that month for a past month', () => {
    const sep = scopeBillsToMonth(all, { year: 2026, month: 8 }, NOW);
    expect(sep.bills.map((b) => b._id).sort()).toEqual(['sep', 'sep-paid']);
    expect(sep.carriedOverCount).toBe(0);
  });

  it('skips bills with an unreadable due date', () => {
    expect(scopeBillsToMonth([bill('bad', 'nope', 10)], OCT, NOW).bills).toEqual([]);
  });

  it('produces October totals without the school fee', () => {
    const { bills } = scopeBillsToMonth(all, OCT, NOW);
    const stats = calculateBillStats(bills, []);
    expect(stats.totalAmount).toBe(5000 + 1000 + 700);
    expect(stats.pendingAmount).toBe(5000);
    expect(stats.overdueAmount).toBe(700);
  });
});

describe('scopePaymentsToBills', () => {
  it('keeps only payments for the scoped bills', () => {
    const pay = (id: string, billId: string): PaymentRecord => ({
      _id: id, userId: 'u', billId, amount: 10, paymentDate: '2026-10-01T00:00:00.000Z',
      method: 'cash', status: 'completed',
    } as PaymentRecord);
    const kept = scopePaymentsToBills([pay('1', 'paid'), pay('2', 'school')], [octPaid]);
    expect(kept.map((p) => p._id)).toEqual(['1']);
  });
});

describe('projectRecurringBills', () => {
  const series = (over: Partial<Subscription> = {}): Subscription => ({
    _id: 's1', userId: 'u', name: 'Rent', amount: 20000, category: 'housing', frequency: 'monthly',
    recurringDay: 5, startDate: '2026-10-05T00:00:00.000Z', endDate: null, isActive: true,
    skippedCycles: [], ...over,
  });
  const DEC = { year: 2026, month: 11 };

  it('projects an active series into a month that has no occurrence yet', () => {
    const [p] = projectRecurringBills([series()], [], DEC, NOW);
    expect(p).toMatchObject({ name: 'Rent', amount: 20000, status: 'pending', billingCycle: '2026-12' });
    expect(p.dueDate).toBe('2026-12-05T00:00:00.000Z');
  });

  it('adds recurring rent to December on top of the one-time school fee', () => {
    const scope = scopeBillsToMonth(all, DEC, NOW);
    const bills = [...scope.bills, ...projectRecurringBills([series()], all, DEC, NOW)];
    expect(calculateBillStats(bills, []).totalAmount).toBe(135000 + 20000);
  });

  it('does not project the current month or earlier (those are real bills)', () => {
    expect(projectRecurringBills([series()], [], OCT, NOW)).toEqual([]);
    expect(projectRecurringBills([series()], [], { year: 2026, month: 8 }, NOW)).toEqual([]);
  });

  it('skips a month that already has a real occurrence', () => {
    const real = { ...bill('r', '2026-11-05T00:00:00.000Z', 20000), seriesId: 's1', billingCycle: '2026-11' };
    expect(projectRecurringBills([series()], [real], { year: 2026, month: 10 }, NOW)).toEqual([]);
  });

  it('respects inactive, skipped, start and end dates', () => {
    expect(projectRecurringBills([series({ isActive: false })], [], DEC, NOW)).toEqual([]);
    expect(projectRecurringBills([series({ skippedCycles: ['2026-12'] })], [], DEC, NOW)).toEqual([]);
    expect(projectRecurringBills([series({ startDate: '2027-02-01T00:00:00.000Z' })], [], DEC, NOW)).toEqual([]);
    expect(projectRecurringBills([series({ endDate: '2026-11-30T00:00:00.000Z' })], [], DEC, NOW)).toEqual([]);
  });

  it('clamps day 31 to the last day of a shorter month', () => {
    const feb = { year: 2027, month: 1 };
    const [p] = projectRecurringBills([series({ recurringDay: 31 })], [], feb, NOW);
    expect(p.dueDate).toBe('2027-02-28T00:00:00.000Z');
  });
});
