import { describe, it, expect } from 'vitest';
import { Bill } from '@/data/bills';
import {
  parseDateUtc,
  getOverdueBills,
  getUpcomingBills,
  getDominantCategory,
  calculateInsights,
} from '@/lib/insights';

const DETERMINISTIC_REF_DATE = new Date(Date.UTC(2026, 9, 19, 12, 0, 0)); // Oct 19, 2026

describe('Insights Engine — Date Normalization', () => {
  it('normalizes string dates and dates to midnight UTC', () => {
    const d1 = parseDateUtc('2026-10-19T14:30:00.000Z');
    expect(d1.getUTCFullYear()).toBe(2026);
    expect(d1.getUTCMonth()).toBe(9);
    expect(d1.getUTCDate()).toBe(19);
    expect(d1.getUTCHours()).toBe(0);

    const d2 = parseDateUtc(new Date(Date.UTC(2026, 9, 19, 23, 59, 59)));
    expect(d2.getTime()).toBe(d1.getTime());
  });

  it('safely handles invalid date inputs', () => {
    const invalid = parseDateUtc('not-a-date');
    expect(invalid.getTime()).toBe(0);
  });
});

describe('Insights Engine — Empty & Insufficient Bill Data', () => {
  it('returns welcoming onboarding insight when bills array is empty', () => {
    const insights = calculateInsights([], DETERMINISTIC_REF_DATE);
    expect(insights).toHaveLength(1);
    expect(insights[0].id).toBe('onboarding-empty');
    expect(insights[0].type).toBe('info');
    expect(insights[0].text).toContain('No bills recorded yet');

    expect(getOverdueBills([], DETERMINISTIC_REF_DATE).count).toBe(0);
    expect(getUpcomingBills([], DETERMINISTIC_REF_DATE).count).toBe(0);
    expect(getDominantCategory([])).toBeNull();
  });

  it('returns onboarding guidance when bills exist but data is insufficient for deep patterns', () => {
    // Single one-time bill far in the future
    const singleBill: Bill = {
      _id: 'b1',
      name: 'Passport Renewal',
      amount: 130.0,
      dueDate: '2026-11-20T00:00:00.000Z',
      status: 'pending',
      category: 'finance',
      isSubscription: false,
      recurrenceType: 'one_time',
    };

    expect(getDominantCategory([singleBill])).toBeNull(); // < 3 bills
    expect(getOverdueBills([singleBill], DETERMINISTIC_REF_DATE).count).toBe(0);
    expect(getUpcomingBills([singleBill], DETERMINISTIC_REF_DATE, 5).count).toBe(0);

    const insights = calculateInsights([singleBill], DETERMINISTIC_REF_DATE);
    expect(insights).toHaveLength(1);
    expect(insights[0].id).toBe('onboarding-guidance');
    expect(insights[0].type).toBe('info');
    expect(insights[0].text).toContain('Keep adding your regular bills');
  });

  it('never displays fabricated merchants or mock placeholders', () => {
    const insights = calculateInsights([], DETERMINISTIC_REF_DATE);
    const combinedText = insights.map((i) => i.text).join(' ');
    expect(combinedText).not.toContain('Netflix');
    expect(combinedText).not.toContain('Hulu');
    expect(combinedText).not.toContain('AWS');
    expect(combinedText).not.toContain('GitHub Copilot');
  });
});

describe('Insights Engine — Overdue Bill Calculations & Paid Exclusion', () => {
  const baseOverdueList: Bill[] = [
    {
      _id: 'b-overdue-1',
      name: 'Electric Utility',
      amount: 120.5,
      dueDate: '2026-10-10T00:00:00.000Z',
      status: 'overdue',
      category: 'utilities',
      isSubscription: false,
    },
    {
      _id: 'b-overdue-2',
      name: 'Water Utility',
      amount: 45.5,
      dueDate: '2026-10-12T00:00:00.000Z',
      status: 'pending', // pending but past the Oct 19 reference date
      category: 'utilities',
      isSubscription: false,
    },
    {
      _id: 'b-paid-past',
      name: 'Past Paid Rent',
      amount: 1800.0,
      dueDate: '2026-10-01T00:00:00.000Z',
      status: 'paid', // PAID bill past due date
      category: 'housing',
      isSubscription: false,
    },
    {
      _id: 'b-pending-future',
      name: 'Future Electricity',
      amount: 90.0,
      dueDate: '2026-10-25T00:00:00.000Z',
      status: 'pending',
      category: 'utilities',
      isSubscription: false,
    },
  ];

  it('correctly calculates count and total of overdue bills without counting paid bills', () => {
    const result = getOverdueBills(baseOverdueList, DETERMINISTIC_REF_DATE);

    expect(result.count).toBe(2);
    expect(result.totalAmount).toBe(166.0); // 120.50 + 45.50
    expect(result.bills.map((b) => b._id)).toEqual(['b-overdue-1', 'b-overdue-2']);

    // Crucial check: paid bill is NOT in overdue bills
    expect(result.bills.some((b) => b.status === 'paid')).toBe(false);
  });

  it('generates an actionable warning insight for overdue obligations', () => {
    const insights = calculateInsights(baseOverdueList, DETERMINISTIC_REF_DATE);
    const overdueInsight = insights.find((i) => i.id === 'overdue-bills');

    expect(overdueInsight).toBeDefined();
    expect(overdueInsight?.type).toBe('warning');
    expect(overdueInsight?.text).toContain('2 overdue bills totaling ₹166.00');
  });

  it('uses singular wording when exactly one bill is overdue', () => {
    const singleOverdue: Bill[] = [
      {
        _id: 'b1',
        name: 'Internet',
        amount: 65.0,
        dueDate: '2026-10-14T00:00:00.000Z',
        status: 'overdue',
        category: 'utilities',
        isSubscription: false,
      },
    ];

    const insights = calculateInsights(singleOverdue, DETERMINISTIC_REF_DATE);
    const overdueInsight = insights.find((i) => i.id === 'overdue-bills');

    expect(overdueInsight?.text).toContain('1 overdue bill totaling ₹65.00');
    expect(overdueInsight?.text).toContain('Settle it promptly');
  });
});

describe('Insights Engine — Upcoming Due-Date Boundaries (5-Day Window)', () => {
  // Reference date: Oct 19, 2026.
  // 5-day window includes Oct 19 through Oct 24 (inclusive).
  const upcomingBillsMatrix: Bill[] = [
    {
      _id: 'u-day-0',
      name: 'Mobile Phone',
      amount: 45.0,
      dueDate: '2026-10-19T00:00:00.000Z', // Today (day 0)
      status: 'pending',
      category: 'utilities',
      isSubscription: false,
    },
    {
      _id: 'u-day-3',
      name: 'Gym',
      amount: 55.0,
      dueDate: '2026-10-22T00:00:00.000Z', // Day 3
      status: 'pending',
      category: 'finance',
      isSubscription: false,
    },
    {
      _id: 'u-day-5',
      name: 'Internet',
      amount: 80.0,
      dueDate: '2026-10-24T00:00:00.000Z', // Day 5 boundary
      status: 'pending',
      category: 'utilities',
      isSubscription: false,
    },
    {
      _id: 'u-day-6',
      name: 'Car Insurance',
      amount: 150.0,
      dueDate: '2026-10-25T00:00:00.000Z', // Day 6 (outside 5d window)
      status: 'pending',
      category: 'insurance',
      isSubscription: false,
    },
    {
      _id: 'u-paid-in-window',
      name: 'Gas Bill',
      amount: 40.0,
      dueDate: '2026-10-21T00:00:00.000Z', // Day 2, but already PAID
      status: 'paid',
      category: 'utilities',
      isSubscription: false,
    },
    {
      _id: 'u-overdue',
      name: 'Credit Card Minimum',
      amount: 75.0,
      dueDate: '2026-10-15T00:00:00.000Z', // Overdue
      status: 'overdue',
      category: 'finance',
      isSubscription: false,
    },
  ];

  it('strictly includes only pending bills due within [day 0, day 5]', () => {
    const result = getUpcomingBills(upcomingBillsMatrix, DETERMINISTIC_REF_DATE, 5);

    expect(result.count).toBe(3);
    expect(result.totalAmount).toBe(180.0); // 45 + 55 + 80
    expect(result.bills.map((b) => b._id)).toEqual(['u-day-0', 'u-day-3', 'u-day-5']);

    // Verify exclusions
    expect(result.bills.some((b) => b._id === 'u-day-6')).toBe(false); // beyond 5 days
    expect(result.bills.some((b) => b._id === 'u-paid-in-window')).toBe(false); // paid
    expect(result.bills.some((b) => b._id === 'u-overdue')).toBe(false); // overdue
  });

  it('generates upcoming insight with proper singular/plural grammar', () => {
    const insights = calculateInsights(upcomingBillsMatrix, DETERMINISTIC_REF_DATE);
    const upcomingInsight = insights.find((i) => i.id === 'upcoming-bills-5d');

    expect(upcomingInsight).toBeDefined();
    expect(upcomingInsight?.type).toBe('info');
    expect(upcomingInsight?.text).toContain('3 bills are due in the next 5 days, totaling ₹180.00');
  });

  it('handles single upcoming bill grammar', () => {
    const singleUpcoming: Bill[] = [
      {
        _id: 'u1',
        name: 'Dentist Copay',
        amount: 35.0,
        dueDate: '2026-10-20T00:00:00.000Z',
        status: 'pending',
        category: 'insurance',
        isSubscription: false,
      },
    ];

    const insights = calculateInsights(singleUpcoming, DETERMINISTIC_REF_DATE);
    const upcomingInsight = insights.find((i) => i.id === 'upcoming-bills-5d');

    expect(upcomingInsight?.text).toContain('1 bill is due in the next 5 days, totaling ₹35.00');
  });
});

describe('Insights Engine — Dominant Spending Category Calculations', () => {
  it('identifies dominant category when >= 3 bills and one category has >= 40% of spend', () => {
    const bills: Bill[] = [
      {
        _id: '1',
        name: 'Apartment Rent',
        amount: 2200.0,
        dueDate: '2026-10-01T00:00:00.000Z',
        status: 'paid',
        category: 'housing',
        isSubscription: true,
      },
      {
        _id: '2',
        name: 'Electric',
        amount: 110.0,
        dueDate: '2026-10-15T00:00:00.000Z',
        status: 'paid',
        category: 'utilities',
        isSubscription: false,
      },
      {
        _id: '3',
        name: 'Home Internet',
        amount: 79.99,
        dueDate: '2026-10-20T00:00:00.000Z',
        status: 'pending',
        category: 'utilities',
        isSubscription: true,
      },
      {
        _id: '4',
        name: 'Streaming',
        amount: 15.99,
        dueDate: '2026-10-22T00:00:00.000Z',
        status: 'pending',
        category: 'entertainment',
        isSubscription: true,
      },
    ];

    // Total spend: 2200 + 110 + 79.99 + 15.99 = 2405.98
    // Housing: 2200 / 2405.98 = 91.4%
    const dominant = getDominantCategory(bills);
    expect(dominant).not.toBeNull();
    expect(dominant?.category).toBe('housing');
    expect(dominant?.percentage).toBe(91);
    expect(dominant?.amount).toBe(2200.0);

    const insights = calculateInsights(bills, DETERMINISTIC_REF_DATE);
    const dominantInsight = insights.find((i) => i.id === 'dominant-category');
    expect(dominantInsight?.text).toContain('Housing accounts for 91% (₹2,200.00) of your total tracked expenses');
  });

  it('returns null when top category is below 40% threshold (evenly distributed spending)', () => {
    const bills: Bill[] = [
      { _id: '1', name: 'Bill 1', amount: 100, dueDate: '2026-10-10', status: 'paid', category: 'utilities', isSubscription: false },
      { _id: '2', name: 'Bill 2', amount: 100, dueDate: '2026-10-11', status: 'paid', category: 'entertainment', isSubscription: false },
      { _id: '3', name: 'Bill 3', amount: 100, dueDate: '2026-10-12', status: 'paid', category: 'software', isSubscription: false },
      { _id: '4', name: 'Bill 4', amount: 100, dueDate: '2026-10-13', status: 'paid', category: 'finance', isSubscription: false },
    ];
    // Each category is 25% (< 40%)
    expect(getDominantCategory(bills)).toBeNull();
  });

  it('returns null when there is a tie for the top category', () => {
    const bills: Bill[] = [
      { _id: '1', name: 'Electric', amount: 200, dueDate: '2026-10-10', status: 'paid', category: 'utilities', isSubscription: false },
      { _id: '2', name: 'Rent', amount: 200, dueDate: '2026-10-11', status: 'paid', category: 'housing', isSubscription: false },
      { _id: '3', name: 'Coffee', amount: 10, dueDate: '2026-10-12', status: 'paid', category: 'entertainment', isSubscription: false },
    ];
    // Utilities and Housing are tied at ₹200 (48.8% each)
    expect(getDominantCategory(bills)).toBeNull();
  });

  it('returns null when there are fewer than 3 bills recorded', () => {
    const bills: Bill[] = [
      { _id: '1', name: 'Rent', amount: 1500, dueDate: '2026-10-01', status: 'paid', category: 'housing', isSubscription: false },
      { _id: '2', name: 'Power', amount: 100, dueDate: '2026-10-15', status: 'paid', category: 'utilities', isSubscription: false },
    ];
    expect(getDominantCategory(bills)).toBeNull();
  });
});

describe('Insights Engine — Unsupported Subscription Claims Guardrails', () => {
  const recurringBillsSample: Bill[] = [
    {
      _id: 'rec-1',
      name: 'Netflix Premium',
      amount: 22.99,
      dueDate: '2026-10-15T00:00:00.000Z',
      status: 'paid',
      category: 'entertainment',
      isSubscription: true,
      recurrenceType: 'recurring',
      seriesId: 'series-netflix',
      billingCycle: '2026-10',
    },
    {
      _id: 'rec-2',
      name: 'Spotify Family',
      amount: 16.99,
      dueDate: '2026-10-22T00:00:00.000Z',
      status: 'pending',
      category: 'entertainment',
      isSubscription: true,
      recurrenceType: 'recurring',
      seriesId: 'series-spotify',
      billingCycle: '2026-10',
    },
    {
      _id: 'rec-3',
      name: 'Cloud Hosting',
      amount: 40.0,
      dueDate: '2026-10-28T00:00:00.000Z',
      status: 'pending',
      category: 'software',
      isSubscription: true,
      recurrenceType: 'recurring',
      seriesId: 'series-cloud',
      billingCycle: '2026-10',
    },
  ];

  it('does not generate subscription run-rate or annualized commitment without authoritative active-series API', () => {
    const insights = calculateInsights(recurringBillsSample, DETERMINISTIC_REF_DATE);
    const runRateInsight = insights.find((i) => i.id === 'subscription-run-rate');

    // In Phase 1, run-rate is NOT presented as verified facts because series.isActive is stored separately
    expect(runRateInsight).toBeUndefined();
  });

  it('does not present active recurring-category overlap as verified facts inferred from bill occurrences alone', () => {
    const insights = calculateInsights(recurringBillsSample, DETERMINISTIC_REF_DATE);
    const overlapInsight = insights.find((i) => i.id.startsWith('category-overlap'));

    // In Phase 1, category overlap is NOT inferred without authoritative RecurringSeries data
    expect(overlapInsight).toBeUndefined();
  });

  it('restricts generated insight IDs strictly to validated and authoritative calculations', () => {
    const insights = calculateInsights(recurringBillsSample, DETERMINISTIC_REF_DATE);
    const allowedIds = new Set([
      'overdue-bills',
      'upcoming-bills-5d',
      'dominant-category',
      'onboarding-empty',
      'onboarding-guidance',
    ]);

    for (const insight of insights) {
      expect(allowedIds.has(insight.id)).toBe(true);
    }
  });

  it('still generates valid upcoming bills and dominant category from recurring bill occurrences', () => {
    const insights = calculateInsights(recurringBillsSample, DETERMINISTIC_REF_DATE);

    // Spotify (₹16.99) is due Oct 22 (day 3), which is within the 5-day window from Oct 19
    const upcoming = insights.find((i) => i.id === 'upcoming-bills-5d');
    expect(upcoming).toBeDefined();
    expect(upcoming?.text).toContain('1 bill is due in the next 5 days, totaling ₹16.99');

    // Software (₹40.00) is 40 / 79.98 = 50% (> 40% threshold, >= 3 bills)
    const dominant = insights.find((i) => i.id === 'dominant-category');
    expect(dominant).toBeDefined();
    expect(dominant?.text).toContain('Software accounts for 50% (₹40.00)');
  });
});
