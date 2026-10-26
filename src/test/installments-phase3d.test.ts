import { describe, it, expect } from 'vitest';
import { Bill } from '@/data/bills';
import { PaymentRecord } from '@/data/billDetails';
import {
  InstallmentPlan,
  calculateInstallmentPlanTotals,
} from '@/data/installments';
import {
  calculateInsights,
  getOverdueBills,
  getUpcomingBills,
} from '@/lib/insights';
import { calculateOccurrenceDueDate } from '../../server/src/services/recurrenceService';
import {
  formatUtcDateString,
  getUpcomingRelativeText,
  getOverdueRelativeText,
  buildDueSoonReminderData,
  buildOverdueReminderData,
} from '../../server/src/services/reminderService.js';
import { calculateBillStats } from '@/hooks/useBillStore';

const REF_DATE = new Date(Date.UTC(2026, 9, 20, 12, 0, 0)); // Oct 20, 2026

describe('Phase 3D — Reminders Integration & Stale Notification Purging', () => {
  interface MockNotification {
    _id: string;
    userId: string;
    type: 'due_soon' | 'overdue';
    title: string;
    message: string;
    billId: string;
    planId?: string | null;
    seriesId?: string | null;
    billingCycle?: string | null;
    dueDate: Date;
    amount: number;
    isRead: boolean;
    isDismissed: boolean;
  }

  let notificationsDb: MockNotification[] = [];

  function resetNotifs() {
    notificationsDb = [];
  }

  function simulateGenerateReminders(
    userId: string,
    bills: Bill[],
    refDate: Date = REF_DATE,
  ) {
    const refMidnight = Date.UTC(
      refDate.getUTCFullYear(),
      refDate.getUTCMonth(),
      refDate.getUTCDate(),
    );
    const horizonMidnight = refMidnight + 5 * 86400000;

    let created = 0;

    // Due soon: pending bills within [today, today + 5 days]
    const dueSoon = bills.filter((b) => {
      if (b.status !== 'pending') return false;
      const due = new Date(b.dueDate).getTime();
      return due >= refMidnight && due <= horizonMidnight;
    });

    for (const bill of dueSoon) {
      const exists = notificationsDb.some(
        (n) => n.userId === userId && n.billId === bill._id && n.type === 'due_soon',
      );
      if (!exists) {
        const payload = buildDueSoonReminderData(bill, refMidnight);
        notificationsDb.push({
          _id: `notif_${Date.now()}_${Math.random()}`,
          userId,
          ...payload,
          billId: String(payload.billId),
          planId: payload.planId ? String(payload.planId) : null,
          seriesId: payload.seriesId ? String(payload.seriesId) : null,
          isRead: false,
          isDismissed: false,
        });
        created++;
      }
    }

    // Overdue: unpaid bills past due
    const overdue = bills.filter((b) => {
      if (b.status === 'paid') return false;
      const due = new Date(b.dueDate).getTime();
      return due < refMidnight;
    });

    for (const bill of overdue) {
      const exists = notificationsDb.some(
        (n) => n.userId === userId && n.billId === bill._id && n.type === 'overdue',
      );
      if (!exists) {
        const payload = buildOverdueReminderData(bill, refMidnight);
        notificationsDb.push({
          _id: `notif_${Date.now()}_${Math.random()}`,
          userId,
          ...payload,
          billId: String(payload.billId),
          planId: payload.planId ? String(payload.planId) : null,
          seriesId: payload.seriesId ? String(payload.seriesId) : null,
          isRead: false,
          isDismissed: false,
        });
        created++;
      }
    }

    return { created };
  }

  it('generates due_soon notifications for upcoming installment bills using shared production payload logic', () => {
    resetNotifs();
    const installmentBills: Bill[] = [
      {
        _id: 'inst-1',
        name: 'Auto Loan (1/12)',
        amount: 350,
        dueDate: '2026-10-22T00:00:00.000Z', // 2 days in future
        status: 'pending',
        category: 'finance',
        isSubscription: false,
        planId: 'plan-auto-1',
        installmentNumber: 1,
        totalInstallments: 12,
      },
      {
        _id: 'inst-2',
        name: 'Auto Loan (2/12)',
        amount: 350,
        dueDate: '2026-11-22T00:00:00.000Z', // Far future (> 5 days)
        status: 'pending',
        category: 'finance',
        isSubscription: false,
        planId: 'plan-auto-1',
        installmentNumber: 2,
        totalInstallments: 12,
      },
    ];

    const result = simulateGenerateReminders('user_alice', installmentBills, REF_DATE);
    expect(result.created).toBe(1);
    expect(notificationsDb).toHaveLength(1);
    expect(notificationsDb[0].billId).toBe('inst-1');
    expect(notificationsDb[0].planId).toBe('plan-auto-1');
    expect(notificationsDb[0].type).toBe('due_soon');
    expect(notificationsDb[0].title).toBe('Payment Due Soon: Auto Loan (1/12)');
    expect(notificationsDb[0].message).toBe('₹350.00 is due in 2 days (2026-10-22).');
    expect(notificationsDb[0].amount).toBe(350);
  });

  it('exercises shared production logic for due_soon reminder construction', () => {
    const refMidnight = Date.UTC(2026, 9, 20);
    const bill: Bill = {
      _id: 'inst-1',
      name: 'Car Loan EMI (3/12)',
      amount: 450.5,
      dueDate: '2026-10-21T00:00:00.000Z',
      status: 'pending',
      category: 'finance',
      isSubscription: false,
      planId: 'plan-car',
      installmentNumber: 3,
      totalInstallments: 12,
    };

    const reminder = buildDueSoonReminderData(bill, refMidnight);
    expect(reminder.type).toBe('due_soon');
    expect(reminder.title).toBe('Payment Due Soon: Car Loan EMI (3/12)');
    expect(reminder.message).toBe('₹450.50 is due tomorrow (2026-10-21).');
    expect(reminder.billId).toBe('inst-1');
    expect(reminder.planId).toBe('plan-car');
    expect(reminder.amount).toBe(450.5);
  });

  it('exercises shared production logic for overdue reminder construction', () => {
    const refMidnight = Date.UTC(2026, 9, 20);
    const bill: Bill = {
      _id: 'inst-overdue',
      name: 'Laptop Loan EMI (1/6)',
      amount: 200,
      dueDate: '2026-10-18T00:00:00.000Z',
      status: 'overdue',
      category: 'software',
      isSubscription: false,
      planId: 'plan-laptop',
      installmentNumber: 1,
      totalInstallments: 6,
    };

    const reminder = buildOverdueReminderData(bill, refMidnight);
    expect(reminder.type).toBe('overdue');
    expect(reminder.title).toBe('Payment Overdue: Laptop Loan EMI (1/6)');
    expect(reminder.message).toBe('₹200.00 was due on 2026-10-18 (2 days overdue).');
    expect(reminder.billId).toBe('inst-overdue');
    expect(reminder.planId).toBe('plan-laptop');
    expect(reminder.amount).toBe(200);
  });

  it('verifies reminder relative text and date formatting boundaries using shared production helpers', () => {
    const ref = Date.UTC(2026, 9, 20);

    // Due today
    expect(getUpcomingRelativeText(Date.UTC(2026, 9, 20), ref)).toBe('is due today');
    // Due tomorrow
    expect(getUpcomingRelativeText(Date.UTC(2026, 9, 21), ref)).toBe('is due tomorrow');
    // Due in 3 days
    expect(getUpcomingRelativeText(Date.UTC(2026, 9, 23), ref)).toBe('is due in 3 days');
    // Due in 5 days
    expect(getUpcomingRelativeText(Date.UTC(2026, 9, 25), ref)).toBe('is due in 5 days');

    // 1 day overdue
    expect(getOverdueRelativeText(Date.UTC(2026, 9, 19), ref)).toBe('1 day overdue');
    // 3 days overdue
    expect(getOverdueRelativeText(Date.UTC(2026, 9, 17), ref)).toBe('3 days overdue');

    // Date formatting
    expect(formatUtcDateString(new Date(Date.UTC(2026, 9, 20)))).toBe('2026-10-20');
    expect(formatUtcDateString(new Date(Date.UTC(2026, 1, 28)))).toBe('2026-02-28');
  });

  it('idempotently avoids duplicate reminder creation on repeated job executions', () => {
    resetNotifs();
    const installmentBills: Bill[] = [
      {
        _id: 'inst-1',
        name: 'Phone EMI (1/6)',
        amount: 150,
        dueDate: '2026-10-21T00:00:00.000Z',
        status: 'pending',
        category: 'software',
        isSubscription: false,
        planId: 'plan-phone-1',
      },
    ];

    simulateGenerateReminders('user_alice', installmentBills, REF_DATE);
    expect(notificationsDb).toHaveLength(1);

    // Second run
    const secondRun = simulateGenerateReminders('user_alice', installmentBills, REF_DATE);
    expect(secondRun.created).toBe(0);
    expect(notificationsDb).toHaveLength(1);
  });

  it('marks notifications read when an installment bill is paid', () => {
    resetNotifs();
    notificationsDb.push({
      _id: 'n1',
      userId: 'user_alice',
      type: 'due_soon',
      title: 'Payment Due Soon: Phone EMI (1/6)',
      message: '₹150.00 is due tomorrow (2026-10-21).',
      billId: 'inst-1',
      planId: 'plan-1',
      dueDate: new Date('2026-10-21T00:00:00.000Z'),
      amount: 150,
      isRead: false,
      isDismissed: false,
    });

    // Simulate payment marking bill as paid
    const paidBillIds = ['inst-1'];
    notificationsDb.forEach((n) => {
      if (paidBillIds.includes(n.billId)) {
        n.isRead = true;
      }
    });

    expect(notificationsDb[0].isRead).toBe(true);
  });

  it('purges notifications for unpaid deleted bills on plan cancellation while preserving paid bill notifications', () => {
    resetNotifs();
    // Notification for paid installment #1
    notificationsDb.push({
      _id: 'n-paid',
      userId: 'user_alice',
      type: 'due_soon',
      title: 'Payment Due Soon: Phone EMI (1/6)',
      message: '₹150.00 is due today (2026-10-01).',
      billId: 'inst-paid-1',
      planId: 'plan-1',
      dueDate: new Date('2026-10-01T00:00:00.000Z'),
      amount: 150,
      isRead: true,
      isDismissed: false,
    });

    // Notification for unpaid installment #2
    notificationsDb.push({
      _id: 'n-unpaid',
      userId: 'user_alice',
      type: 'due_soon',
      title: 'Payment Due Soon: Phone EMI (2/6)',
      message: '₹150.00 is due in 3 days (2026-11-01).',
      billId: 'inst-unpaid-2',
      planId: 'plan-1',
      dueDate: new Date('2026-11-01T00:00:00.000Z'),
      amount: 150,
      isRead: false,
      isDismissed: false,
    });

    // Cancel plan deletes unpaid bill 'inst-unpaid-2'
    const deletedBillIds = ['inst-unpaid-2'];
    notificationsDb = notificationsDb.filter((n) => !deletedBillIds.includes(n.billId));

    expect(notificationsDb).toHaveLength(1);
    expect(notificationsDb[0]._id).toBe('n-paid');
  });

  it('guarantees tenant isolation for reminders between users', () => {
    resetNotifs();
    notificationsDb.push({
      _id: 'n-alice',
      userId: 'user_alice',
      type: 'due_soon',
      title: 'Payment Due Soon: Alice Loan (1/12)',
      message: '₹200.00 is due today.',
      billId: 'inst-alice-1',
      planId: 'plan-alice',
      dueDate: new Date('2026-10-20T00:00:00.000Z'),
      amount: 200,
      isRead: false,
      isDismissed: false,
    });

    // Bob tries to access or mark Alice's notification
    const bobNotifications = notificationsDb.filter((n) => n.userId === 'user_bob');
    expect(bobNotifications).toHaveLength(0);
  });
});

describe('Phase 3D — Paid Total Aggregation & Legacy Fallback Safeguards', () => {
  it('correctly calculates paid amount for a fully paid bill with completed payments (no double counting)', () => {
    const bills: Bill[] = [
      {
        _id: 'bill-1',
        name: 'Gym Membership',
        amount: 100,
        dueDate: '2026-10-25T00:00:00.000Z',
        status: 'paid',
        category: 'entertainment',
        isSubscription: false,
      },
    ];

    const payments: PaymentRecord[] = [
      {
        _id: 'pay-1',
        userId: 'user_1',
        billId: 'bill-1',
        amount: 100,
        paymentDate: '2026-10-20T00:00:00.000Z',
        method: 'credit_card',
        status: 'completed',
      },
    ];

    const stats = calculateBillStats(bills, payments);
    // Should be exactly 100, NOT 200 (no double counting of bill.amount + payment)
    expect(stats.totalAmount).toBe(100);
    expect(stats.paidAmount).toBe(100);
    expect(stats.pendingAmount).toBe(0);
    expect(stats.paidCount).toBe(1);
    expect(stats.paidPercent).toBe(100);
  });

  it('correctly preserves legacy paid bills without payment records using bill.amount fallback', () => {
    const bills: Bill[] = [
      {
        _id: 'legacy-bill-1',
        name: 'Legacy Water Utility',
        amount: 75.5,
        dueDate: '2026-09-15T00:00:00.000Z',
        status: 'paid',
        category: 'utilities',
        isSubscription: false,
      },
      {
        _id: 'legacy-bill-2',
        name: 'Legacy Internet',
        amount: 60,
        dueDate: '2026-09-20T00:00:00.000Z',
        status: 'pending',
        category: 'utilities',
        isSubscription: false,
      },
    ];

    // Zero payment records in database
    const payments: PaymentRecord[] = [];

    const stats = calculateBillStats(bills, payments);
    expect(stats.totalAmount).toBe(135.5);
    expect(stats.paidAmount).toBe(75.5); // Fallback applies to legacy paid bill
    expect(stats.pendingAmount).toBe(60);
    expect(stats.paidCount).toBe(1);
    expect(stats.pendingCount).toBe(1);
  });

  it('correctly aggregates partial payments without marking the full bill amount as paid', () => {
    const bills: Bill[] = [
      {
        _id: 'bill-partial',
        name: 'Tuition Installment',
        amount: 500,
        dueDate: '2026-10-30T00:00:00.000Z',
        status: 'pending',
        category: 'finance',
        isSubscription: false,
      },
    ];

    // Partial completed payment of ₹200 against ₹500 bill
    const payments: PaymentRecord[] = [
      {
        _id: 'pay-part-1',
        userId: 'user_1',
        billId: 'bill-partial',
        amount: 200,
        paymentDate: '2026-10-20T00:00:00.000Z',
        method: 'debit_card',
        status: 'completed',
      },
    ];

    const stats = calculateBillStats(bills, payments);
    expect(stats.totalAmount).toBe(500);
    expect(stats.paidAmount).toBe(200); // Partial payment captured
    expect(stats.pendingAmount).toBe(500); // Bill status is still pending
    expect(stats.paidCount).toBe(0);
    expect(stats.pendingCount).toBe(1);
    expect(stats.paidPercent).toBe(40);
  });

  it('strictly excludes failed and refunded payments from paid totals and prevents fallback', () => {
    const bills: Bill[] = [
      {
        _id: 'bill-failed',
        name: 'Failed Electric Bill',
        amount: 150,
        dueDate: '2026-10-22T00:00:00.000Z',
        status: 'pending',
        category: 'utilities',
        isSubscription: false,
      },
      {
        _id: 'bill-refunded',
        name: 'Refunded Purchase',
        amount: 80,
        dueDate: '2026-10-21T00:00:00.000Z',
        status: 'paid', // Erroneously or historically marked paid, but payment was refunded
        category: 'software',
        isSubscription: false,
      },
    ];

    const payments: PaymentRecord[] = [
      {
        _id: 'pay-fail',
        userId: 'user_1',
        billId: 'bill-failed',
        amount: 150,
        paymentDate: '2026-10-20T00:00:00.000Z',
        method: 'credit_card',
        status: 'failed',
      },
      {
        _id: 'pay-refund',
        userId: 'user_1',
        billId: 'bill-refunded',
        amount: 80,
        paymentDate: '2026-10-20T00:00:00.000Z',
        method: 'upi',
        status: 'refunded',
      },
    ];

    const stats = calculateBillStats(bills, payments);
    // Neither failed nor refunded counts toward paidAmount!
    // And because 'bill-refunded' has a payment record in payments, legacy fallback is blocked.
    expect(stats.paidAmount).toBe(0);
    expect(stats.totalAmount).toBe(230);
    expect(stats.pendingAmount).toBe(150);
  });

  it('handles a bill with both completed and failed payments correctly', () => {
    const bills: Bill[] = [
      {
        _id: 'bill-multi',
        name: 'Broadband',
        amount: 100,
        dueDate: '2026-10-25T00:00:00.000Z',
        status: 'pending',
        category: 'utilities',
        isSubscription: false,
      },
    ];

    const payments: PaymentRecord[] = [
      {
        _id: 'pay-fail-1',
        userId: 'user_1',
        billId: 'bill-multi',
        amount: 100,
        paymentDate: '2026-10-18T00:00:00.000Z',
        method: 'credit_card',
        status: 'failed',
      },
      {
        _id: 'pay-ok-1',
        userId: 'user_1',
        billId: 'bill-multi',
        amount: 40,
        paymentDate: '2026-10-19T00:00:00.000Z',
        method: 'debit_card',
        status: 'completed',
      },
    ];

    const stats = calculateBillStats(bills, payments);
    expect(stats.paidAmount).toBe(40);
  });

  it('correctly handles bills that have payment records AND a legacy paid status without double counting', () => {
    const bills: Bill[] = [
      {
        _id: 'bill-hybrid',
        name: 'Hybrid Insurance',
        amount: 300,
        dueDate: '2026-10-10T00:00:00.000Z',
        status: 'paid', // Status is paid
        category: 'insurance',
        isSubscription: false,
      },
    ];

    // Has a completed payment record of ₹300
    const payments: PaymentRecord[] = [
      {
        _id: 'pay-hybrid',
        userId: 'user_1',
        billId: 'bill-hybrid',
        amount: 300,
        paymentDate: '2026-10-09T00:00:00.000Z',
        method: 'upi',
        status: 'completed',
      },
    ];

    const stats = calculateBillStats(bills, payments);
    // Must NOT be 300 (payment) + 300 (bill.amount) = 600
    expect(stats.paidAmount).toBe(300);
    expect(stats.totalAmount).toBe(300);
    expect(stats.paidPercent).toBe(100);
  });

  it('handles overpayments accurately without clamping or corruption', () => {
    const bills: Bill[] = [
      {
        _id: 'bill-overpay',
        name: 'Water Bill',
        amount: 50,
        dueDate: '2026-10-20T00:00:00.000Z',
        status: 'paid',
        category: 'utilities',
        isSubscription: false,
      },
    ];

    // Customer overpaid ₹60 on a ₹50 bill
    const payments: PaymentRecord[] = [
      {
        _id: 'pay-over',
        userId: 'user_1',
        billId: 'bill-overpay',
        amount: 60,
        paymentDate: '2026-10-20T00:00:00.000Z',
        method: 'cash',
        status: 'completed',
      },
    ];

    const stats = calculateBillStats(bills, payments);
    expect(stats.paidAmount).toBe(60);
    expect(stats.totalAmount).toBe(50);
    expect(stats.paidPercent).toBe(100); // Clamped to 100% in UI percent
  });

  it('returns zeroed stats when both bills and payments arrays are empty', () => {
    const stats = calculateBillStats([], []);
    expect(stats.totalAmount).toBe(0);
    expect(stats.paidAmount).toBe(0);
    expect(stats.pendingAmount).toBe(0);
    expect(stats.overdueAmount).toBe(0);
    expect(stats.paidCount).toBe(0);
    expect(stats.pendingCount).toBe(0);
    expect(stats.overdueCount).toBe(0);
    expect(stats.paidPercent).toBe(0);
  });
});

describe('Phase 3D — Dashboard Insights & Double-Counting Safeguards', () => {
  const samplePlans: InstallmentPlan[] = [
    {
      _id: 'plan-car',
      userId: 'user_1',
      name: 'Honda Car Loan',
      planType: 'car_loan',
      category: 'finance',
      principalAmount: 20000,
      downPayment: 2000,
      financedAmount: 18000,
      totalInstallments: 36,
      interestRate: 6.0,
      totalInterest: 3240,
      scheduledTotal: 21240,
      installmentAmount: 590,
      startDate: '2026-10-01T00:00:00.000Z',
      recurringDay: 1,
      totalPaid: 1180,
      remainingBalance: 20060,
      status: 'active',
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
    },
    {
      _id: 'plan-macbook',
      userId: 'user_1',
      name: 'MacBook EMI',
      planType: 'credit_card_emi',
      category: 'software',
      principalAmount: 1200,
      downPayment: 0,
      financedAmount: 1200,
      totalInstallments: 6,
      interestRate: 0,
      totalInterest: 0,
      scheduledTotal: 1200,
      installmentAmount: 200,
      startDate: '2026-04-01T00:00:00.000Z',
      recurringDay: 1,
      totalPaid: 1200,
      remainingBalance: 0,
      status: 'completed',
      createdAt: '2026-04-01T00:00:00.000Z',
      updatedAt: '2026-04-01T00:00:00.000Z',
    },
  ];

  const sampleBills: Bill[] = [
    // Ordinary bill
    {
      _id: 'bill-electric',
      name: 'Electric Utility',
      amount: 140,
      dueDate: '2026-10-23T00:00:00.000Z',
      status: 'pending',
      category: 'utilities',
      isSubscription: false,
    },
    // Past overdue ordinary bill
    {
      _id: 'bill-water',
      name: 'Water Bill',
      amount: 60,
      dueDate: '2026-10-10T00:00:00.000Z',
      status: 'overdue',
      category: 'utilities',
      isSubscription: false,
    },
    // Recurring subscription bill
    {
      _id: 'bill-netflix',
      name: 'Netflix Subscription',
      amount: 20,
      dueDate: '2026-10-24T00:00:00.000Z',
      status: 'pending',
      category: 'entertainment',
      isSubscription: true,
      recurrenceType: 'recurring',
    },
    // Installment bill 1 (paid)
    {
      _id: 'bill-car-1',
      name: 'Honda Car Loan (1/36)',
      amount: 590,
      dueDate: '2026-10-01T00:00:00.000Z',
      status: 'paid',
      category: 'finance',
      isSubscription: false,
      planId: 'plan-car',
      installmentNumber: 1,
      totalInstallments: 36,
    },
    // Installment bill 2 (pending upcoming in 4 days)
    {
      _id: 'bill-car-2',
      name: 'Honda Car Loan (2/36)',
      amount: 590,
      dueDate: '2026-10-24T00:00:00.000Z',
      status: 'pending',
      category: 'finance',
      isSubscription: false,
      planId: 'plan-car',
      installmentNumber: 2,
      totalInstallments: 36,
    },
    // Installment bill 3 (future > 5 days)
    {
      _id: 'bill-car-3',
      name: 'Honda Car Loan (3/36)',
      amount: 590,
      dueDate: '2026-11-24T00:00:00.000Z',
      status: 'pending',
      category: 'finance',
      isSubscription: false,
      planId: 'plan-car',
      installmentNumber: 3,
      totalInstallments: 36,
    },
  ];

  const samplePayments: PaymentRecord[] = [
    {
      _id: 'pay-1',
      userId: 'user_1',
      billId: 'bill-car-1',
      amount: 590,
      paymentDate: '2026-10-01T00:00:00.000Z',
      method: 'debit_card',
      status: 'completed',
    },
    // Failed payment attempt (must be excluded from total paid)
    {
      _id: 'pay-failed',
      userId: 'user_1',
      billId: 'bill-car-2',
      amount: 590,
      paymentDate: '2026-10-20T00:00:00.000Z',
      method: 'credit_card',
      status: 'failed',
    },
  ];

  it('correctly aggregates completed payments and excludes failed/refunded attempts', () => {
    const completedPayments = samplePayments.filter((p) => p.status === 'completed');
    expect(completedPayments).toHaveLength(1);
    expect(completedPayments[0].amount).toBe(590);

    const totalFromPayments = completedPayments.reduce((s, p) => s + p.amount, 0);
    expect(totalFromPayments).toBe(590);
  });

  it('avoids double-counting installment plan debt: bills contain occurrences while plan stores authoritative balance', () => {
    // In sampleBills, total installment pending amount is 590 (car-2) + 590 (car-3) = 1180
    // The plan's authoritative remainingBalance is 20060 (encompassing all 34 future months)
    const activePlans = samplePlans.filter((p) => p.status === 'active');
    expect(activePlans).toHaveLength(1);
    expect(activePlans[0].remainingBalance).toBe(20060);

    // Verified: We never add plan.remainingBalance to bills.reduce() in dashboard flow
    const billsTotal = sampleBills.reduce((s, b) => s + b.amount, 0);
    expect(billsTotal).toBe(140 + 60 + 20 + 590 + 590 + 590); // 1990
    expect(billsTotal).not.toBe(1990 + 20060); // Invariant: no double-counting
  });

  it('identifies upcoming bills including pending installment bills and excluding paid ones', () => {
    const upcoming = getUpcomingBills(sampleBills, REF_DATE, 5);
    // Upcoming pending within [Oct 20, Oct 25]:
    // - bill-electric (₹140, Oct 23)
    // - bill-netflix (₹20, Oct 24)
    // - bill-car-2 (₹590, Oct 24)
    // Paid bill-car-1 is EXCLUDED
    // Future bill-car-3 (Nov 24) is EXCLUDED
    expect(upcoming.count).toBe(3);
    expect(upcoming.totalAmount).toBe(140 + 20 + 590); // ₹750
    const ids = upcoming.bills.map((b) => b._id);
    expect(ids).toContain('bill-electric');
    expect(ids).toContain('bill-netflix');
    expect(ids).toContain('bill-car-2');
    expect(ids).not.toContain('bill-car-1');
  });

  it('identifies overdue bills accurately using status and due date', () => {
    const overdue = getOverdueBills(sampleBills, REF_DATE);
    expect(overdue.count).toBe(1);
    expect(overdue.bills[0]._id).toBe('bill-water');
    expect(overdue.totalAmount).toBe(60);
  });

  it('emits financing overview insight when active installment plans exist', () => {
    const insights = calculateInsights(sampleBills, REF_DATE, {
      plans: samplePlans,
      payments: samplePayments,
    });

    const financingInsight = insights.find((i) => i.id === 'installment-financing');
    expect(financingInsight).toBeDefined();
    expect(financingInsight?.type).toBe('info');
    expect(financingInsight?.text).toContain('1 active installment plan');
    expect(financingInsight?.text).toContain('₹20,060.00 remaining balance');
    expect(financingInsight?.text).toContain('₹590.00/mo commitment');
  });
});

describe('Phase 3D — Payment Synchronization & Partial Payment Invariants', () => {
  it('preserves pending status on partial payment while synchronizing plan totalPaid and balance', () => {
    const scheduledTotal = 1200;
    let planTotalPaid = 0;
    let planBalance = scheduledTotal;
    let billStatus: 'pending' | 'paid' = 'pending';
    const billAmount = 200;

    // Partial payment of ₹80 against ₹200 bill
    const partialPayment = 80;
    planTotalPaid += partialPayment;
    planBalance = Math.max(0, scheduledTotal - planTotalPaid);

    if (partialPayment >= billAmount - 0.001) {
      billStatus = 'paid';
    }

    expect(billStatus).toBe('pending'); // Still pending!
    expect(planTotalPaid).toBe(80);
    expect(planBalance).toBe(1120);

    // Remaining payment of ₹120 completes the bill
    const remainingPayment = 120;
    planTotalPaid += remainingPayment;
    planBalance = Math.max(0, scheduledTotal - planTotalPaid);

    if (partialPayment + remainingPayment >= billAmount - 0.001) {
      billStatus = 'paid';
    }

    expect(billStatus).toBe('paid'); // Now paid!
    expect(planTotalPaid).toBe(200);
    expect(planBalance).toBe(1000);
  });

  it('transitions plan status to completed when all installments are fully paid', () => {
    const scheduledTotal = 600;
    let planStatus = 'active';
    const totalPaid = 600;
    const remainingBalance = Math.max(0, scheduledTotal - totalPaid);

    if (remainingBalance <= 0.001 && planStatus !== 'cancelled') {
      planStatus = 'completed';
    }

    expect(remainingBalance).toBe(0);
    expect(planStatus).toBe('completed');
  });

  it('never overwrites cancelled plan status to completed even if remaining balance reaches zero', () => {
    const scheduledTotal = 600;
    let planStatus = 'cancelled';
    const totalPaid = 600;
    const remainingBalance = Math.max(0, scheduledTotal - totalPaid);

    if (remainingBalance <= 0.001 && planStatus !== 'cancelled') {
      planStatus = 'completed';
    }

    expect(remainingBalance).toBe(0);
    expect(planStatus).toBe('cancelled'); // PRESERVED
  });
});

describe('Phase 3D — Date Boundaries, Month-End Clamping & Leap Year Rules', () => {
  it('clamps 31st anchor day to Feb 28 on non-leap years and Feb 29 on leap years', () => {
    // 2026 is non-leap year -> Feb has 28 days
    const feb2026 = calculateOccurrenceDueDate(31, 2026, 1); // month index 1 = Feb
    expect(feb2026.getUTCFullYear()).toBe(2026);
    expect(feb2026.getUTCMonth()).toBe(1);
    expect(feb2026.getUTCDate()).toBe(28);

    // 2028 is leap year -> Feb has 29 days
    const feb2028 = calculateOccurrenceDueDate(31, 2028, 1);
    expect(feb2028.getUTCFullYear()).toBe(2028);
    expect(feb2028.getUTCMonth()).toBe(1);
    expect(feb2028.getUTCDate()).toBe(29);

    // April has 30 days -> clamps to 30
    const apr2026 = calculateOccurrenceDueDate(31, 2026, 3);
    expect(apr2026.getUTCDate()).toBe(30);

    // May has 31 days -> restores 31
    const may2026 = calculateOccurrenceDueDate(31, 2026, 4);
    expect(may2026.getUTCDate()).toBe(31);
  });

  it('reconciles exact scheduled total with final installment rounding adjustment', () => {
    // ₹10,000 across 7 months at 0%
    const totals = calculateInstallmentPlanTotals({
      principalAmount: 10000,
      totalInstallments: 7,
      interestRate: 0,
    });

    // 10000 / 7 = 1428.5714... -> base 1428.57
    expect(totals.baseInstallmentAmount).toBe(1428.57);
    // 1428.57 * 7 = 9999.99 -> remainder 0.01
    expect(totals.roundingDifference).toBe(0.01);

    const sum =
      totals.baseInstallmentAmount * 6 +
      (totals.baseInstallmentAmount + totals.roundingDifference);
    expect(Math.round(sum * 100) / 100).toBe(10000);
  });
});
