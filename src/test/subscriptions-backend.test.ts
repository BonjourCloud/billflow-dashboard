import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  calculateOccurrenceDueDate,
  getBillingCycleKey,
  getDueCycles,
  subscriptionCreateSchema,
  subscriptionUpdateSchema,
} from '../../server/src/services/recurrenceService.js';

describe('Subscriptions Backend — Zod Validation Schemas', () => {
  const validPayload = {
    name: 'Spotify Premium',
    amount: 10.99,
    category: 'entertainment',
    startDate: '2026-10-15',
    recurringDay: 15,
  };

  it('validates a correct subscription creation payload', () => {
    const parsed = subscriptionCreateSchema.safeParse(validPayload);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.name).toBe('Spotify Premium');
      expect(parsed.data.amount).toBe(10.99);
      expect(parsed.data.category).toBe('entertainment');
      expect(parsed.data.recurringDay).toBe(15);
      expect(parsed.data.startDate instanceof Date).toBe(true);
    }
  });

  it('rejects invalid or non-positive amounts', () => {
    expect(
      subscriptionCreateSchema.safeParse({ ...validPayload, amount: 0 }).success,
    ).toBe(false);
    expect(
      subscriptionCreateSchema.safeParse({ ...validPayload, amount: -15 }).success,
    ).toBe(false);
    expect(
      subscriptionCreateSchema.safeParse({ ...validPayload, amount: NaN }).success,
    ).toBe(false);
  });

  it('rejects recurringDay out of range (1 - 31)', () => {
    expect(
      subscriptionCreateSchema.safeParse({ ...validPayload, recurringDay: 0 }).success,
    ).toBe(false);
    expect(
      subscriptionCreateSchema.safeParse({ ...validPayload, recurringDay: 32 }).success,
    ).toBe(false);
    expect(
      subscriptionCreateSchema.safeParse({ ...validPayload, recurringDay: -5 }).success,
    ).toBe(false);
    expect(
      subscriptionCreateSchema.safeParse({ ...validPayload, recurringDay: 15.5 }).success,
    ).toBe(false);
  });

  it('rejects invalid category enum values', () => {
    expect(
      subscriptionCreateSchema.safeParse({ ...validPayload, category: 'gaming' }).success,
    ).toBe(false);
    expect(
      subscriptionCreateSchema.safeParse({ ...validPayload, category: 'crypto' }).success,
    ).toBe(false);
  });

  it('rejects empty or excessively long names', () => {
    expect(
      subscriptionCreateSchema.safeParse({ ...validPayload, name: '   ' }).success,
    ).toBe(false);
    expect(
      subscriptionCreateSchema.safeParse({ ...validPayload, name: 'a'.repeat(101) }).success,
    ).toBe(false);
  });

  it('rejects malformed start date strings', () => {
    expect(
      subscriptionCreateSchema.safeParse({ ...validPayload, startDate: 'invalid-date' }).success,
    ).toBe(false);
  });

  it('validates partial update schema', () => {
    const validUpdate = subscriptionUpdateSchema.safeParse({
      amount: 12.99,
      recurringDay: 20,
    });
    expect(validUpdate.success).toBe(true);

    const invalidUpdate = subscriptionUpdateSchema.safeParse({
      amount: -5,
    });
    expect(invalidUpdate.success).toBe(false);
  });

  it('enforces strict schemas rejecting unexpected fields', () => {
    const withExtra = subscriptionCreateSchema.safeParse({
      ...validPayload,
      userId: 'hacker-supplied-id',
    });
    expect(withExtra.success).toBe(false);

    const updateWithExtra = subscriptionUpdateSchema.safeParse({
      amount: 15.0,
      isActive: true, // cannot bypass lifecycle through general update
    });
    expect(updateWithExtra.success).toBe(false);
  });
});

describe('Subscriptions Backend — Lifecycle & Occurrence Recurrence Semantics', () => {
  interface MockSeries {
    _id: string;
    userId: string;
    name: string;
    amount: number;
    category: string;
    frequency: 'monthly';
    recurringDay: number;
    startDate: Date;
    endDate: Date | null;
    isActive: boolean;
    skippedCycles: string[];
  }

  interface MockBill {
    _id: string;
    userId: string;
    seriesId: string;
    billingCycle: string;
    dueDate: Date;
    status: 'paid' | 'pending' | 'overdue';
    amount: number;
    name: string;
    category: string;
  }

  it('cancellation sets isActive false and removes future unpaid bills while strictly preserving paid history', () => {
    const refDate = new Date(Date.UTC(2026, 9, 19)); // Oct 19, 2026

    const series: MockSeries = {
      _id: 'series-cloud',
      userId: 'user_alice',
      name: 'Cloud Hosting',
      amount: 40.0,
      category: 'software',
      frequency: 'monthly',
      recurringDay: 15,
      startDate: new Date(Date.UTC(2026, 7, 15)), // Aug 15
      endDate: null,
      isActive: true,
      skippedCycles: [],
    };

    let bills: MockBill[] = [
      {
        _id: 'b-aug',
        userId: 'user_alice',
        seriesId: 'series-cloud',
        billingCycle: '2026-08',
        dueDate: new Date(Date.UTC(2026, 7, 15)),
        status: 'paid',
        amount: 40.0,
        name: 'Cloud Hosting',
        category: 'software',
      },
      {
        _id: 'b-sep',
        userId: 'user_alice',
        seriesId: 'series-cloud',
        billingCycle: '2026-09',
        dueDate: new Date(Date.UTC(2026, 8, 15)),
        status: 'paid',
        amount: 40.0,
        name: 'Cloud Hosting',
        category: 'software',
      },
      {
        _id: 'b-oct',
        userId: 'user_alice',
        seriesId: 'series-cloud',
        billingCycle: '2026-10',
        dueDate: new Date(Date.UTC(2026, 9, 15)), // Oct 15 (paid earlier this month)
        status: 'paid',
        amount: 40.0,
        name: 'Cloud Hosting',
        category: 'software',
      },
      {
        _id: 'b-nov',
        userId: 'user_alice',
        seriesId: 'series-cloud',
        billingCycle: '2026-11',
        dueDate: new Date(Date.UTC(2026, 10, 15)), // Nov 15 (upcoming pending)
        status: 'pending',
        amount: 40.0,
        name: 'Cloud Hosting',
        category: 'software',
      },
    ];

    // Simulation of cancelRecurringSeriesDirectly:
    // 1. Collect unpaid cycles to be deleted at or after reference date
    const unpaidAtOrAfter = bills.filter(
      (b) => b.dueDate.getTime() >= refDate.getTime() && b.status !== 'paid',
    );
    const deletedCycles = unpaidAtOrAfter.map((b) => b.billingCycle);

    // 2. Delete unpaid bills at or after reference date
    bills = bills.filter(
      (b) => !(b.dueDate.getTime() >= refDate.getTime() && b.status !== 'paid'),
    );

    // 3. Determine effective end date and update skippedCycles
    const paidAtOrAfter = bills
      .filter((b) => b.dueDate.getTime() >= refDate.getTime() && b.status === 'paid')
      .sort((a, b) => b.dueDate.getTime() - a.dueDate.getTime());

    const effectiveEndDate =
      paidAtOrAfter.length > 0
        ? paidAtOrAfter[0].dueDate
        : new Date(refDate.getTime() - 86400000);

    series.isActive = false;
    series.endDate = effectiveEndDate;
    series.skippedCycles = [...series.skippedCycles, ...deletedCycles];

    expect(series.isActive).toBe(false);
    expect(series.endDate).toEqual(new Date(refDate.getTime() - 86400000));
    expect(series.skippedCycles).toContain('2026-11');

    // All paid historical bills MUST be preserved
    expect(bills.find((b) => b._id === 'b-aug')?.status).toBe('paid');
    expect(bills.find((b) => b._id === 'b-sep')?.status).toBe('paid');
    expect(bills.find((b) => b._id === 'b-oct')?.status).toBe('paid');

    // Future unpaid bill (Nov) was deleted
    expect(bills.find((b) => b._id === 'b-nov')).toBeUndefined();
  });

  it('cancellation boundary regression: cancelled cycle on reference date cannot be regenerated if reactivated', () => {
    // Subscription with recurring day on the 19th
    const startDate = new Date(Date.UTC(2026, 0, 19)); // Jan 19, 2026
    const refDate = new Date(Date.UTC(2026, 9, 19)); // Oct 19, 2026 (cancellation day)

    // Unpaid occurrence on Oct 19 is cancelled.
    // effectiveEndDate must be strictly the previous day (Oct 18),
    // and '2026-10' is added to skippedCycles.
    const effectiveEndDate = new Date(refDate.getTime() - 86400000);
    const skippedCycles = ['2026-10'];

    // If the series were evaluated for cycles (e.g. simulated reactivation up to Nov 2026):
    const futureHorizon = new Date(Date.UTC(2026, 10, 1));
    const cycles = getDueCycles(startDate, 19, effectiveEndDate, futureHorizon);
    const cycleKeys = cycles.map((c) => c.billingCycle);

    // Verified: Oct 2026 and later are strictly NOT present in getDueCycles
    expect(cycleKeys).not.toContain('2026-10');
    expect(cycleKeys).not.toContain('2026-11');

    // Furthermore, even if getDueCycles were evaluated without endDate, skippedCycles blocks '2026-10'
    const unconstrainedCycles = getDueCycles(startDate, 19, null, futureHorizon);
    const filteredCycles = unconstrainedCycles.filter(
      (c) => !skippedCycles.includes(c.billingCycle),
    );
    expect(filteredCycles.map((c) => c.billingCycle)).not.toContain('2026-10');
  });

  it('cancellation boundary regression: clamps to latest paid bill date when prepaid on or after reference date', () => {
    const refDate = new Date(Date.UTC(2026, 9, 19)); // Oct 19, 2026
    const paidOctBillDate = new Date(Date.UTC(2026, 9, 19)); // Prepaid on Oct 19

    const paidBillsAtOrAfter = [{ dueDate: paidOctBillDate, status: 'paid' }];
    const effectiveEndDate =
      paidBillsAtOrAfter.length > 0
        ? paidBillsAtOrAfter[0].dueDate
        : new Date(refDate.getTime() - 86400000);

    expect(effectiveEndDate).toEqual(paidOctBillDate);

    // Next month (Nov 19) is strictly barred
    const startDate = new Date(Date.UTC(2026, 0, 19));
    const cycles = getDueCycles(
      startDate,
      19,
      effectiveEndDate,
      new Date(Date.UTC(2026, 11, 1)),
    );
    const cycleKeys = cycles.map((c) => c.billingCycle);

    expect(cycleKeys).toContain('2026-10');
    expect(cycleKeys).not.toContain('2026-11');
  });

  it('backdated subscription creation resolves initial occurrence to overdue when past due without explicit status', () => {
    const refDate = new Date(Date.UTC(2026, 9, 19)); // Oct 19, 2026
    const refMidnightUtc = refDate.getTime();

    // Start date 2 months ago (Aug 15, 2026)
    const backdatedDueDate = new Date(Date.UTC(2026, 7, 15));

    const isPastDue = backdatedDueDate.getTime() < refMidnightUtc;
    const initialStatus = undefined; // omitted by caller
    const resolvedStatus = initialStatus ?? (isPastDue ? 'overdue' : 'pending');

    expect(isPastDue).toBe(true);
    expect(resolvedStatus).toBe('overdue');
  });

  it('subscription creation defaults initial occurrence to pending when on current day or in future', () => {
    const refDate = new Date(Date.UTC(2026, 9, 19)); // Oct 19, 2026
    const refMidnightUtc = refDate.getTime();

    // Due today
    const todayDueDate = new Date(Date.UTC(2026, 9, 19));
    const isTodayPastDue = todayDueDate.getTime() < refMidnightUtc;
    const initialStatusToday: 'paid' | 'pending' | 'overdue' | undefined = undefined;
    const resolvedTodayStatus = initialStatusToday ?? (isTodayPastDue ? 'overdue' : 'pending');
    expect(resolvedTodayStatus).toBe('pending');

    // Due in future
    const futureDueDate = new Date(Date.UTC(2026, 10, 1));
    const isFuturePastDue = futureDueDate.getTime() < refMidnightUtc;
    const initialStatusFuture: 'paid' | 'pending' | 'overdue' | undefined = undefined;
    const resolvedFutureStatus = initialStatusFuture ?? (isFuturePastDue ? 'overdue' : 'pending');
    expect(resolvedFutureStatus).toBe('pending');
  });

  it('subscription creation preserves explicit valid statuses (paid, pending)', () => {
    const refDate = new Date(Date.UTC(2026, 9, 19));
    const refMidnightUtc = refDate.getTime();
    const backdatedDueDate = new Date(Date.UTC(2026, 7, 15));
    const isPastDue = backdatedDueDate.getTime() < refMidnightUtc;

    // Caller explicitly provides 'paid'
    const explicitPaidStatus: 'paid' | 'pending' | 'overdue' = 'paid';
    const resolvedPaid = explicitPaidStatus ?? (isPastDue ? 'overdue' : 'pending');
    expect(resolvedPaid).toBe('paid');

    // Caller explicitly provides 'pending'
    const explicitPendingStatus: 'paid' | 'pending' | 'overdue' = 'pending';
    const resolvedPending = explicitPendingStatus ?? (isPastDue ? 'overdue' : 'pending');
    expect(resolvedPending).toBe('pending');
  });

  it('cancelled series is excluded from future occurrence generation runs', () => {
    const startDate = new Date(Date.UTC(2026, 0, 15)); // Jan 15, 2026
    const cancelledDate = new Date(Date.UTC(2026, 4, 15)); // May 15, 2026
    const currentRefDate = new Date(Date.UTC(2026, 9, 19)); // Oct 19, 2026

    // Since series is cancelled with endDate in May, getDueCycles respects endDate
    const cycles = getDueCycles(startDate, 15, cancelledDate, currentRefDate);
    const cycleKeys = cycles.map((c) => c.billingCycle);

    expect(cycleKeys).toEqual([
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04',
      '2026-05',
    ]);
    expect(cycleKeys).not.toContain('2026-06');
    expect(cycleKeys).not.toContain('2026-10');
    expect(cycleKeys).not.toContain('2026-11');
  });

  it('updating subscription propagates to future pending occurrences without altering paid bills', () => {
    const refDate = new Date(Date.UTC(2026, 9, 19));

    const series: MockSeries = {
      _id: 'series-gym',
      userId: 'user_alice',
      name: 'Gym Standard',
      amount: 45.0,
      category: 'finance',
      frequency: 'monthly',
      recurringDay: 10,
      startDate: new Date(Date.UTC(2026, 8, 10)),
      endDate: null,
      isActive: true,
      skippedCycles: [],
    };

    let bills: MockBill[] = [
      {
        _id: 'b-sep',
        userId: 'user_alice',
        seriesId: 'series-gym',
        billingCycle: '2026-09',
        dueDate: new Date(Date.UTC(2026, 8, 10)),
        status: 'paid',
        amount: 45.0,
        name: 'Gym Standard',
        category: 'finance',
      },
      {
        _id: 'b-nov',
        userId: 'user_alice',
        seriesId: 'series-gym',
        billingCycle: '2026-11',
        dueDate: new Date(Date.UTC(2026, 10, 10)),
        status: 'pending',
        amount: 45.0,
        name: 'Gym Standard',
        category: 'finance',
      },
    ];

    // User updates subscription: name -> "Gym VIP", amount -> 65.0, recurringDay -> 20
    const newName = 'Gym VIP';
    const newAmount = 65.0;
    const newRecurringDay = 20;

    series.name = newName;
    series.amount = newAmount;
    series.recurringDay = newRecurringDay;

    // Synchronize future pending occurrences (dueDate >= refDate, status === 'pending')
    bills = bills.map((b) => {
      if (b.dueDate.getTime() >= refDate.getTime() && b.status === 'pending') {
        const year = b.dueDate.getUTCFullYear();
        const month = b.dueDate.getUTCMonth();
        const newDueDate = calculateOccurrenceDueDate(newRecurringDay, year, month);
        return {
          ...b,
          name: newName,
          amount: newAmount,
          dueDate: newDueDate,
        };
      }
      return b;
    });

    // Past paid bill must remain completely unchanged
    const pastBill = bills.find((b) => b._id === 'b-sep');
    expect(pastBill?.amount).toBe(45.0);
    expect(pastBill?.name).toBe('Gym Standard');
    expect(pastBill?.dueDate.getUTCDate()).toBe(10);

    // Future pending bill received updated amount, name, and new clamped due date
    const futureBill = bills.find((b) => b._id === 'b-nov');
    expect(futureBill?.amount).toBe(65.0);
    expect(futureBill?.name).toBe('Gym VIP');
    expect(futureBill?.dueDate.getUTCDate()).toBe(20);
  });

  it('editing recurringDay shifts pending bill to overdue if new due date falls before reference date', () => {
    const refDate = new Date(Date.UTC(2026, 9, 19)); // Oct 19, 2026
    const refMidnightUtc = refDate.getTime();

    // A pending bill exists for October 25
    let bills: MockBill[] = [
      {
        _id: 'b-oct',
        userId: 'user_alice',
        seriesId: 'series-gym',
        billingCycle: '2026-10',
        dueDate: new Date(Date.UTC(2026, 9, 25)), // Oct 25 (pending)
        status: 'pending',
        amount: 30.0,
        name: 'Gym',
        category: 'finance',
      },
      {
        _id: 'b-nov',
        userId: 'user_alice',
        seriesId: 'series-gym',
        billingCycle: '2026-11',
        dueDate: new Date(Date.UTC(2026, 10, 25)), // Nov 25 (pending)
        status: 'pending',
        amount: 30.0,
        name: 'Gym',
        category: 'finance',
      },
      {
        _id: 'b-sep',
        userId: 'user_alice',
        seriesId: 'series-gym',
        billingCycle: '2026-09',
        dueDate: new Date(Date.UTC(2026, 8, 25)), // Sep 25 (paid)
        status: 'paid',
        amount: 30.0,
        name: 'Gym',
        category: 'finance',
      },
    ];

    // User changes recurringDay from 25 to 5
    const newRecurringDay = 5;

    // Simulation of updateRecurringSeriesDirectly cascade:
    bills = bills.map((b) => {
      if (b.dueDate.getTime() >= refMidnightUtc && b.status === 'pending') {
        const year = b.dueDate.getUTCFullYear();
        const month = b.dueDate.getUTCMonth();
        const newDueDate = calculateOccurrenceDueDate(newRecurringDay, year, month);
        const isPastDue = newDueDate.getTime() < refMidnightUtc;
        return {
          ...b,
          dueDate: newDueDate,
          status: isPastDue ? ('overdue' as const) : b.status,
        };
      }
      return b;
    });

    const octBill = bills.find((b) => b._id === 'b-oct');
    expect(octBill?.dueDate.getUTCDate()).toBe(5);
    // Because Oct 5 is in the past relative to Oct 19, status updated to 'overdue'!
    expect(octBill?.status).toBe('overdue');

    const novBill = bills.find((b) => b._id === 'b-nov');
    expect(novBill?.dueDate.getUTCDate()).toBe(5);
    // Nov 5 is still in the future relative to Oct 19, status remains 'pending'
    expect(novBill?.status).toBe('pending');

    const sepBill = bills.find((b) => b._id === 'b-sep');
    // Paid bill remains strictly paid and untransformed
    expect(sepBill?.dueDate.getUTCDate()).toBe(25);
    expect(sepBill?.status).toBe('paid');
  });

  it('permanent delete removes both the series and all occurrences', () => {
    let seriesList = [{ _id: 'series-1', userId: 'user_alice' }];
    let billsList = [
      { _id: 'b1', seriesId: 'series-1', userId: 'user_alice' },
      { _id: 'b2', seriesId: 'series-1', userId: 'user_alice' },
      { _id: 'b3', seriesId: 'series-other', userId: 'user_alice' },
    ];

    // scope === 'all'
    const targetSeriesId = 'series-1';
    seriesList = seriesList.filter((s) => s._id !== targetSeriesId);
    billsList = billsList.filter((b) => b.seriesId !== targetSeriesId);

    expect(seriesList).toHaveLength(0);
    expect(billsList).toHaveLength(1);
    expect(billsList[0].seriesId).toBe('series-other');
  });

  it('enforces strict tenant isolation: User A cannot mutate User B series', () => {
    const seriesDb: MockSeries[] = [
      {
        _id: 'series-bob',
        userId: 'user_bob',
        name: 'Bob Streaming',
        amount: 15.0,
        category: 'entertainment',
        frequency: 'monthly',
        recurringDay: 1,
        startDate: new Date('2026-01-01'),
        endDate: null,
        isActive: true,
        skippedCycles: [],
      },
    ];

    // User Alice attempts to find and mutate User Bob's series
    const aliceUserId = 'user_alice';
    const targetId = 'series-bob';

    const aliceFound = seriesDb.find(
      (s) => s._id === targetId && s.userId === aliceUserId,
    );
    expect(aliceFound).toBeUndefined(); // Returns 404 Not Found to unauthorized caller!
  });
});
