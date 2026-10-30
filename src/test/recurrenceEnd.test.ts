import { describe, it, expect } from 'vitest';
import { lastPaymentDate, paymentsUntil, MAX_RECURRING_PAYMENTS } from '@/lib/recurrenceEnd';

describe('lastPaymentDate', () => {
  it('counts the first due date as payment 1', () => {
    expect(lastPaymentDate('2026-11-05', 5, 1)).toBe('2026-11-05');
  });

  it('puts the 12th EMI of a loan starting 5 Nov 2026 on 5 Oct 2027', () => {
    expect(lastPaymentDate('2026-11-05', 5, 12)).toBe('2027-10-05');
  });

  it('rolls over year boundaries', () => {
    expect(lastPaymentDate('2026-12-10', 10, 2)).toBe('2027-01-10');
    expect(lastPaymentDate('2026-12-10', 10, 25)).toBe('2028-12-10');
  });

  it('moves a 31st bill to the last day of shorter months', () => {
    expect(lastPaymentDate('2026-01-31', 31, 2)).toBe('2026-02-28');
    expect(lastPaymentDate('2027-01-31', 31, 2)).toBe('2027-02-28');
    expect(lastPaymentDate('2028-01-31', 31, 2)).toBe('2028-02-29'); // leap year
    expect(lastPaymentDate('2026-01-31', 31, 4)).toBe('2026-04-30');
  });

  it('rejects bad input', () => {
    expect(lastPaymentDate('', 5, 12)).toBeNull();
    expect(lastPaymentDate('2026-02-30', 30, 12)).toBeNull();
    expect(lastPaymentDate('2026-11-05', 5, 0)).toBeNull();
    expect(lastPaymentDate('2026-11-05', 5, 1.5)).toBeNull();
    expect(lastPaymentDate('2026-11-05', 5, MAX_RECURRING_PAYMENTS + 1)).toBeNull();
    expect(lastPaymentDate('2026-11-05', 5, MAX_RECURRING_PAYMENTS)).not.toBeNull();
  });
});

describe('paymentsUntil', () => {
  it('is the inverse of lastPaymentDate', () => {
    for (const [start, day, n] of [
      ['2026-11-05', 5, 12],
      ['2026-01-31', 31, 7],
      ['2027-12-15', 15, 30],
      ['2026-11-05', 5, 1],
    ] as const) {
      const end = lastPaymentDate(start, day, n)!;
      expect(paymentsUntil(start, day, end), `${start} x${n}`).toBe(n);
    }
  });

  it('includes the end date itself and excludes the day before', () => {
    expect(paymentsUntil('2026-11-05', 5, '2027-10-05')).toBe(12);
    expect(paymentsUntil('2026-11-05', 5, '2027-10-04')).toBe(11);
  });

  it('is 0 when the end is before the first payment, or dates are invalid', () => {
    expect(paymentsUntil('2026-11-05', 5, '2026-11-04')).toBe(0);
    expect(paymentsUntil('bad', 5, '2027-10-05')).toBe(0);
    expect(paymentsUntil('2026-11-05', 5, 'bad')).toBe(0);
  });

  it('stays bounded for a far-future end date', () => {
    expect(paymentsUntil('2026-11-05', 5, '9999-12-31')).toBeGreaterThan(MAX_RECURRING_PAYMENTS);
  });
});
