import { describe, it, expect } from 'vitest';
import {
  formatCurrency,
  formatPrice,
  formatCurrencyCompact,
  CURRENCY_SYMBOL,
} from '@/lib/currency';
import * as server from '../../server/src/services/currency';
import * as reminders from '../../server/src/services/reminderService';
import * as pricing from '../../server/src/models/PricingTier';

describe('formatCurrency (INR)', () => {
  it.each([
    [5000, '₹5,000.00'],
    [16666.66, '₹16,666.66'],
    [210759, '₹2,10,759.00'],
    [200000, '₹2,00,000.00'],
    [759, '₹759.00'],
  ])('formats %d as %s', (amount, expected) => {
    expect(formatCurrency(amount)).toBe(expected);
  });

  it('formats zero and negative zero without a sign', () => {
    expect(formatCurrency(0)).toBe('₹0.00');
    expect(formatCurrency(-0)).toBe('₹0.00');
  });

  it('uses lakh and crore grouping for large amounts', () => {
    expect(formatCurrency(1234567.89)).toBe('₹12,34,567.89');
    expect(formatCurrency(10000000)).toBe('₹1,00,00,000.00');
    expect(formatCurrency(123456789.5)).toBe('₹12,34,56,789.50');
  });

  it('always shows exactly two decimals', () => {
    expect(formatCurrency(12.5)).toBe('₹12.50');
    expect(formatCurrency(0.1 + 0.2)).toBe('₹0.30');
    expect(formatCurrency(333.333)).toBe('₹333.33');
    expect(formatCurrency(333.336)).toBe('₹333.34');
  });

  it('puts the sign before the symbol for negative amounts', () => {
    expect(formatCurrency(-1234.5)).toBe('-₹1,234.50');
    expect(formatCurrency(-250000)).toBe('-₹2,50,000.00');
  });

  it('never produces a dollar sign', () => {
    for (const amount of [0, 1, 99.99, 1e5, 1e9, -42]) {
      const text = formatCurrency(amount);
      expect(text).not.toContain('$');
      expect(text).toContain(CURRENCY_SYMBOL);
    }
  });
});

describe('formatPrice (pricing tiers)', () => {
  it('omits decimals for whole prices', () => {
    expect(formatPrice(0)).toBe('₹0');
    expect(formatPrice(999)).toBe('₹999');
    expect(formatPrice(99999)).toBe('₹99,999');
    expect(formatPrice(999999)).toBe('₹9,99,999');
  });

  it('shows two decimals for fractional prices', () => {
    expect(formatPrice(9.99)).toBe('₹9.99');
    expect(formatPrice(12.5)).toBe('₹12.50');
  });
});

describe('formatCurrencyCompact (chart axes and stats)', () => {
  it.each([
    [0, '₹0'],
    [950, '₹950'],
    [1500, '₹1.5K'],
    [100000, '₹1L'],
    [250000, '₹2.5L'],
    [2400000, '₹24L'],
    [10000000, '₹1Cr'],
  ])('formats %d as %s', (amount, expected) => {
    expect(formatCurrencyCompact(amount)).toBe(expected);
  });
});

describe('server-generated currency text (INR)', () => {
  it('matches the frontend formatter', () => {
    for (const amount of [0, -0, 759, 16666.66, 210759, -1234.5, 123456789.5]) {
      expect(server.formatCurrency(amount)).toBe(formatCurrency(amount));
    }
  });

  it('formats reminder amounts with Indian grouping', () => {
    const refMidnight = Date.UTC(2026, 9, 20);
    const bill = {
      _id: 'bill-rent',
      name: 'Rent',
      amount: 210759,
      dueDate: '2026-10-21T00:00:00.000Z',
      status: 'pending',
      category: 'housing',
      isSubscription: false,
    };
    const dueSoon = reminders.buildDueSoonReminderData(bill as never, refMidnight);
    expect(dueSoon.message).toBe('₹2,10,759.00 is due tomorrow (2026-10-21).');
    expect(dueSoon.amount).toBe(210759);

    const overdue = reminders.buildOverdueReminderData(
      { ...bill, dueDate: '2026-10-18T00:00:00.000Z' } as never,
      refMidnight,
    );
    expect(overdue.message).toBe('₹2,10,759.00 was due on 2026-10-18 (2 days overdue).');
  });

  it('uses rupees in pricing-tier limit messages', () => {
    const result = pricing.createPricingTierSchema.safeParse({
      slug: 'big',
      name: 'Big',
      price_monthly: 100000,
      price_yearly: 1000000,
      billing_period: 'month',
      cta_label: 'Buy',
    });
    expect(result.success).toBe(false);
    const messages = result.success ? [] : result.error.issues.map((i) => i.message);
    expect(messages).toContain('Monthly price cannot exceed ₹99,999.');
    expect(messages).toContain('Yearly price cannot exceed ₹9,99,999.');
    expect(messages.join(' ')).not.toContain('$');
  });
});
