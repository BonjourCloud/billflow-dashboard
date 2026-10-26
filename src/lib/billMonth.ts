import type { Bill } from '@/data/bills';
import type { PaymentRecord } from '@/data/billDetails';

/** A calendar month. `month` is 0-11 (like Date#getMonth). */
export interface MonthKey {
  year: number;
  month: number;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** The month `now` falls in, in the viewer's local time. */
export function currentMonthKey(now: Date = new Date()): MonthKey {
  return { year: now.getFullYear(), month: now.getMonth() };
}

export function isSameMonth(a: MonthKey, b: MonthKey): boolean {
  return a.year === b.year && a.month === b.month;
}

/** Moves by `delta` months, rolling the year over as needed. */
export function shiftMonth(key: MonthKey, delta: number): MonthKey {
  const index = key.year * 12 + key.month + delta;
  return { year: Math.floor(index / 12), month: ((index % 12) + 12) % 12 };
}

export function formatMonthLabel(key: MonthKey): string {
  return `${MONTH_NAMES[key.month]} ${key.year}`;
}

/** Month a bill is due in. Due dates are stored as UTC midnight, so read them in UTC. */
function dueMonthIndex(bill: Bill): number | null {
  const due = new Date(bill.dueDate);
  if (Number.isNaN(due.getTime())) return null;
  return due.getUTCFullYear() * 12 + due.getUTCMonth();
}

export interface MonthScope {
  /** Bills counted in the selected month's figures. */
  bills: Bill[];
  /** How many of them are unpaid bills carried over from earlier months. */
  carriedOverCount: number;
}

/**
 * Bills that make up a month's "flow":
 * - every bill due in that month, plus
 * - when viewing the current month, unpaid bills from earlier months, since
 *   they still need paying now.
 * Bills due in later months are left out until their month comes.
 */
export function scopeBillsToMonth(
  bills: Bill[],
  selected: MonthKey,
  now: Date = new Date(),
): MonthScope {
  const selectedIndex = selected.year * 12 + selected.month;
  const includeCarryOver = isSameMonth(selected, currentMonthKey(now));

  let carriedOverCount = 0;
  const scoped = bills.filter((bill) => {
    const index = dueMonthIndex(bill);
    if (index === null) return false;
    if (index === selectedIndex) return true;
    if (includeCarryOver && index < selectedIndex && bill.status !== 'paid') {
      carriedOverCount += 1;
      return true;
    }
    return false;
  });

  return { bills: scoped, carriedOverCount };
}

/** Payments belonging to the given bills, so paid totals match the month's bills. */
export function scopePaymentsToBills(
  payments: PaymentRecord[],
  bills: Bill[],
): PaymentRecord[] {
  const ids = new Set(bills.map((b) => String(b._id)));
  return payments.filter((p) => p.billId && ids.has(String(p.billId)));
}
