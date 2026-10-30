/**
 * Helpers for the "Ends" choice on a recurring bill (e.g. a loan that runs for
 * 12 EMIs). Dates are 'yyyy-MM-dd' strings and all maths is in UTC, mirroring
 * the server (calculateOccurrenceDueDate): a bill due on the 31st falls on the
 * last day of shorter months.
 */

/** Longest series accepted from the form, in payments (50 years of months). */
export const MAX_RECURRING_PAYMENTS = 600;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseIso(value: string): { year: number; month: number; day: number } | null {
  const match = ISO_DATE.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const check = new Date(Date.UTC(year, month, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month || check.getUTCDate() !== day) {
    return null;
  }
  return { year, month, day };
}

function dueInMonth(recurringDay: number, year: number, month: number): number {
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return Math.min(Math.max(1, recurringDay), lastDay);
}

function toIso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Date of the Nth payment of a monthly series whose first payment is
 * `firstDueDate`. Returns null for an invalid date or a count outside
 * 1..MAX_RECURRING_PAYMENTS.
 */
export function lastPaymentDate(
  firstDueDate: string,
  recurringDay: number,
  payments: number,
): string | null {
  const start = parseIso(firstDueDate);
  if (!start || !Number.isInteger(payments) || payments < 1 || payments > MAX_RECURRING_PAYMENTS) {
    return null;
  }
  const monthIndex = start.year * 12 + start.month + (payments - 1);
  const year = Math.floor(monthIndex / 12);
  const month = monthIndex % 12;
  return toIso(Date.UTC(year, month, dueInMonth(recurringDay, year, month)));
}

/**
 * How many monthly payments fall from `firstDueDate` to `endDate`, both
 * included. 0 when the end date is before the first payment (or either date is
 * invalid).
 */
export function paymentsUntil(
  firstDueDate: string,
  recurringDay: number,
  endDate: string,
): number {
  const start = parseIso(firstDueDate);
  const end = parseIso(endDate);
  if (!start || !end) return 0;
  const endMs = Date.UTC(end.year, end.month, end.day);
  let count = 0;
  let year = start.year;
  let month = start.month;
  // Stop at the cap so a far-future date cannot loop for long.
  while (count < MAX_RECURRING_PAYMENTS + 1) {
    const due = Date.UTC(year, month, dueInMonth(recurringDay, year, month));
    if (due > endMs) break;
    if (due >= Date.UTC(start.year, start.month, start.day)) count++;
    month++;
    if (month > 11) {
      month = 0;
      year++;
    }
  }
  return count;
}

/**
 * How many payments of a monthly series are already due before `today`
 * (a 'yyyy-MM-dd' date, UTC like the server), stopping at `endDate` when the
 * series ends sooner. Used to offer "mark earlier payments as paid" for a loan
 * that started months ago.
 */
export function earlierPaymentCount(
  firstDueDate: string,
  recurringDay: number,
  today: string,
  endDate: string | null = null,
): number {
  const t = parseIso(today);
  if (!t) return 0;
  const yesterday = toIso(Date.UTC(t.year, t.month, t.day) - 24 * 60 * 60 * 1000);
  const limit = endDate && endDate < yesterday ? endDate : yesterday;
  return paymentsUntil(firstDueDate, recurringDay, limit);
}
