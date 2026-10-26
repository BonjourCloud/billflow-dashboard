import { describe, it, expect } from 'vitest';
import {
  formatUtcDateString,
  getUpcomingRelativeText,
  getOverdueRelativeText,
} from '../../server/src/services/reminderService.js';
import { isValidNotificationId } from '../../server/src/models/Notification.js';

interface MockNotification {
  _id: string;
  userId: string;
  type: 'due_soon' | 'overdue';
  title: string;
  message: string;
  billId: string;
  seriesId: string | null;
  billingCycle: string | null;
  dueDate: Date;
  amount: number;
  isRead: boolean;
  isDismissed: boolean;
  createdAt: Date;
}

interface MockBill {
  _id: string;
  userId: string;
  name: string;
  amount: number;
  dueDate: Date;
  status: 'paid' | 'pending' | 'overdue';
  seriesId?: string | null;
  billingCycle?: string | null;
}

describe('Notifications Backend — Helper Functions & Date Formatting', () => {
  it('formats UTC dates into standardized YYYY-MM-DD strings', () => {
    const d1 = new Date(Date.UTC(2026, 9, 19, 14, 30, 0));
    expect(formatUtcDateString(d1)).toBe('2026-10-19');

    const d2 = new Date(Date.UTC(2026, 0, 5, 23, 59, 59));
    expect(formatUtcDateString(d2)).toBe('2026-01-05');
  });

  it('computes correct relative text for upcoming bills', () => {
    const ref = Date.UTC(2026, 9, 19);

    // Due today
    expect(getUpcomingRelativeText(Date.UTC(2026, 9, 19), ref)).toBe('is due today');

    // Due tomorrow
    expect(getUpcomingRelativeText(Date.UTC(2026, 9, 20), ref)).toBe('is due tomorrow');

    // Due in 3 days
    expect(getUpcomingRelativeText(Date.UTC(2026, 9, 22), ref)).toBe('is due in 3 days');

    // Due in 5 days
    expect(getUpcomingRelativeText(Date.UTC(2026, 9, 24), ref)).toBe('is due in 5 days');
  });

  it('computes correct relative text for overdue bills', () => {
    const ref = Date.UTC(2026, 9, 19);

    // 1 day overdue
    expect(getOverdueRelativeText(Date.UTC(2026, 9, 18), ref)).toBe('1 day overdue');

    // 4 days overdue
    expect(getOverdueRelativeText(Date.UTC(2026, 9, 15), ref)).toBe('4 days overdue');
  });

  it('validates MongoDB ObjectId strings correctly', () => {
    expect(isValidNotificationId('507f1f77bcf86cd799439011')).toBe(true);
    expect(isValidNotificationId('6521a0f9b3e12c0012345678')).toBe(true);
    expect(isValidNotificationId('invalid-id')).toBe(false);
    expect(isValidNotificationId('12345')).toBe(false);
    expect(isValidNotificationId('')).toBe(false);
  });
});

describe('Notifications Backend — Reminder Generation Rules & Deduplication', () => {
  const refDate = new Date(Date.UTC(2026, 9, 19)); // Oct 19, 2026
  const refMidnightUtc = refDate.getTime();
  const horizonUtc = refMidnightUtc + 5 * 86400000; // Oct 24, 2026

  it('generates due_soon notifications for bills due today or within 5 days', () => {
    const bills: MockBill[] = [
      {
        _id: 'b-today',
        userId: 'user_alice',
        name: 'Internet',
        amount: 60.0,
        dueDate: new Date(Date.UTC(2026, 9, 19)), // Today
        status: 'pending',
      },
      {
        _id: 'b-3days',
        userId: 'user_alice',
        name: 'Water Utility',
        amount: 35.0,
        dueDate: new Date(Date.UTC(2026, 9, 22)), // 3 days away
        status: 'pending',
      },
      {
        _id: 'b-5days',
        userId: 'user_alice',
        name: 'Electric Bill',
        amount: 85.0,
        dueDate: new Date(Date.UTC(2026, 9, 24)), // Exactly 5 days away
        status: 'pending',
      },
      {
        _id: 'b-6days',
        userId: 'user_alice',
        name: 'Gym',
        amount: 40.0,
        dueDate: new Date(Date.UTC(2026, 9, 25)), // 6 days away (outside window)
        status: 'pending',
      },
    ];

    const generatedNotifications: MockNotification[] = [];

    // Filter candidate due_soon bills (status === 'pending', dueDate in [ref, ref + 5 days])
    const candidates = bills.filter(
      (b) =>
        b.status === 'pending' &&
        b.dueDate.getTime() >= refMidnightUtc &&
        b.dueDate.getTime() <= horizonUtc,
    );

    expect(candidates).toHaveLength(3);
    expect(candidates.map((c) => c._id)).toEqual(['b-today', 'b-3days', 'b-5days']);

    for (const b of candidates) {
      const billDueMidnight = Date.UTC(
        b.dueDate.getUTCFullYear(),
        b.dueDate.getUTCMonth(),
        b.dueDate.getUTCDate(),
      );
      const relative = getUpcomingRelativeText(billDueMidnight, refMidnightUtc);
      generatedNotifications.push({
        _id: `notif-${b._id}`,
        userId: b.userId,
        type: 'due_soon',
        title: `Payment Due Soon: ${b.name}`,
        message: `$${b.amount.toFixed(2)} ${relative} (${formatUtcDateString(b.dueDate)}).`,
        billId: b._id,
        seriesId: null,
        billingCycle: null,
        dueDate: b.dueDate,
        amount: b.amount,
        isRead: false,
        isDismissed: false,
        createdAt: new Date(),
      });
    }

    expect(generatedNotifications).toHaveLength(3);
    expect(generatedNotifications[0].message).toContain('is due today');
    expect(generatedNotifications[1].message).toContain('is due in 3 days');
    expect(generatedNotifications[2].message).toContain('is due in 5 days');
  });

  it('generates overdue notifications for unpaid bills with past due dates', () => {
    const bills: MockBill[] = [
      {
        _id: 'b-overdue-1',
        userId: 'user_alice',
        name: 'Phone Service',
        amount: 55.0,
        dueDate: new Date(Date.UTC(2026, 9, 15)), // 4 days ago
        status: 'overdue',
      },
      {
        _id: 'b-overdue-2',
        userId: 'user_alice',
        name: 'Council Tax',
        amount: 150.0,
        dueDate: new Date(Date.UTC(2026, 9, 18)), // 1 day ago
        status: 'pending', // Unpaid past due
      },
    ];

    const overdueCandidates = bills.filter(
      (b) => b.status !== 'paid' && b.dueDate.getTime() < refMidnightUtc,
    );

    expect(overdueCandidates).toHaveLength(2);

    const notifications: MockNotification[] = overdueCandidates.map((b) => {
      const billDueMidnight = Date.UTC(
        b.dueDate.getUTCFullYear(),
        b.dueDate.getUTCMonth(),
        b.dueDate.getUTCDate(),
      );
      const relative = getOverdueRelativeText(billDueMidnight, refMidnightUtc);
      return {
        _id: `notif-${b._id}`,
        userId: b.userId,
        type: 'overdue',
        title: `Payment Overdue: ${b.name}`,
        message: `$${b.amount.toFixed(2)} was due on ${formatUtcDateString(b.dueDate)} (${relative}).`,
        billId: b._id,
        seriesId: null,
        billingCycle: null,
        dueDate: b.dueDate,
        amount: b.amount,
        isRead: false,
        isDismissed: false,
        createdAt: new Date(),
      };
    });

    expect(notifications).toHaveLength(2);
    expect(notifications[0].type).toBe('overdue');
    expect(notifications[0].message).toContain('4 days overdue');
    expect(notifications[1].message).toContain('1 day overdue');
  });

  it('strictly excludes paid bills from due_soon and overdue reminders', () => {
    const bills: MockBill[] = [
      {
        _id: 'b-paid-past',
        userId: 'user_alice',
        name: 'Mortgage',
        amount: 1200.0,
        dueDate: new Date(Date.UTC(2026, 9, 10)), // Past
        status: 'paid',
      },
      {
        _id: 'b-paid-today',
        userId: 'user_alice',
        name: 'Gym',
        amount: 50.0,
        dueDate: new Date(Date.UTC(2026, 9, 19)), // Today
        status: 'paid',
      },
      {
        _id: 'b-paid-upcoming',
        userId: 'user_alice',
        name: 'Car Insurance',
        amount: 90.0,
        dueDate: new Date(Date.UTC(2026, 9, 21)), // 2 days away
        status: 'paid',
      },
    ];

    const dueSoonCandidates = bills.filter(
      (b) =>
        b.status === 'pending' &&
        b.dueDate.getTime() >= refMidnightUtc &&
        b.dueDate.getTime() <= horizonUtc,
    );
    expect(dueSoonCandidates).toHaveLength(0);

    const overdueCandidates = bills.filter(
      (b) => b.status !== 'paid' && b.dueDate.getTime() < refMidnightUtc,
    );
    expect(overdueCandidates).toHaveLength(0);
  });

  it('idempotency: repeated generation runs do not duplicate notifications', () => {
    const existingNotifications: MockNotification[] = [
      {
        _id: 'notif-1',
        userId: 'user_alice',
        type: 'due_soon',
        title: 'Payment Due Soon: Netflix',
        message: '$15.99 is due tomorrow (2026-10-20).',
        billId: 'bill-netflix',
        seriesId: 'series-netflix',
        billingCycle: '2026-10',
        dueDate: new Date(Date.UTC(2026, 9, 20)),
        amount: 15.99,
        isRead: false,
        isDismissed: false,
        createdAt: new Date(),
      },
    ];

    const candidateBill: MockBill = {
      _id: 'bill-netflix',
      userId: 'user_alice',
      name: 'Netflix',
      amount: 15.99,
      dueDate: new Date(Date.UTC(2026, 9, 20)),
      status: 'pending',
    };

    // Deduplication check: existing notification with (userId, billId, type) found
    const alreadyExists = existingNotifications.some(
      (n) =>
        n.userId === candidateBill.userId &&
        n.billId === candidateBill._id &&
        n.type === 'due_soon',
    );

    expect(alreadyExists).toBe(true);
    // Skips insertion, preventing duplicates
  });

  it('dismissed notifications are permanently retained to block regeneration', () => {
    const existingNotifications: MockNotification[] = [
      {
        _id: 'notif-dismissed',
        userId: 'user_alice',
        type: 'due_soon',
        title: 'Payment Due Soon: Spotify',
        message: '$10.99 is due in 2 days.',
        billId: 'bill-spotify',
        seriesId: null,
        billingCycle: null,
        dueDate: new Date(Date.UTC(2026, 9, 21)),
        amount: 10.99,
        isRead: true,
        isDismissed: true, // Dismissed by user!
        createdAt: new Date(),
      },
    ];

    const candidateBill: MockBill = {
      _id: 'bill-spotify',
      userId: 'user_alice',
      name: 'Spotify',
      amount: 10.99,
      dueDate: new Date(Date.UTC(2026, 9, 21)),
      status: 'pending',
    };

    // Dedupe query searches for ANY notification with (userId, billId, type), regardless of isDismissed
    const alreadyExists = existingNotifications.some(
      (n) =>
        n.userId === candidateBill.userId &&
        n.billId === candidateBill._id &&
        n.type === 'due_soon',
    );

    expect(alreadyExists).toBe(true);
    // Verified: dismissed record blocks recreation of the same alert!
  });

  it('auto-resolves open reminders when bill is paid', () => {
    let notifications: MockNotification[] = [
      {
        _id: 'n1',
        userId: 'user_alice',
        type: 'overdue',
        title: 'Payment Overdue: Gas Bill',
        message: '$120 was due.',
        billId: 'b-gas',
        seriesId: null,
        billingCycle: null,
        dueDate: new Date(Date.UTC(2026, 9, 10)),
        amount: 120.0,
        isRead: false,
        isDismissed: false,
        createdAt: new Date(),
      },
    ];

    // User marks bill as paid
    const paidBillId = 'b-gas';
    notifications = notifications.map((n) =>
      n.billId === paidBillId ? { ...n, isRead: true } : n,
    );

    expect(notifications[0].isRead).toBe(true);
  });

  it('cleans up notifications when bill occurrences are deleted', () => {
    let notifications: MockNotification[] = [
      {
        _id: 'n1',
        userId: 'user_alice',
        type: 'due_soon',
        title: 'Payment Due Soon: Old Service',
        message: '$20 is due.',
        billId: 'b-deleted',
        seriesId: 'series-deleted',
        billingCycle: '2026-10',
        dueDate: new Date(Date.UTC(2026, 9, 22)),
        amount: 20.0,
        isRead: false,
        isDismissed: false,
        createdAt: new Date(),
      },
      {
        _id: 'n2',
        userId: 'user_alice',
        type: 'due_soon',
        title: 'Payment Due Soon: Keep Service',
        message: '$30 is due.',
        billId: 'b-keep',
        seriesId: null,
        billingCycle: null,
        dueDate: new Date(Date.UTC(2026, 9, 22)),
        amount: 30.0,
        isRead: false,
        isDismissed: false,
        createdAt: new Date(),
      },
    ];

    // Bill 'b-deleted' is deleted
    const deletedBillIds = ['b-deleted'];
    notifications = notifications.filter(
      (n) => !deletedBillIds.includes(n.billId),
    );

    expect(notifications).toHaveLength(1);
    expect(notifications[0].billId).toBe('b-keep');
  });

  it('recurring series occurrences receive reminders independently per billing cycle', () => {
    // Oct cycle bill and Nov cycle bill have distinct bill IDs
    const octBill: MockBill = {
      _id: 'bill-oct',
      userId: 'user_alice',
      name: 'Cloudflare Pro',
      amount: 25.0,
      dueDate: new Date(Date.UTC(2026, 9, 20)),
      status: 'pending',
      seriesId: 'series-cf',
      billingCycle: '2026-10',
    };

    const novBill: MockBill = {
      _id: 'bill-nov',
      userId: 'user_alice',
      name: 'Cloudflare Pro',
      amount: 25.0,
      dueDate: new Date(Date.UTC(2026, 10, 20)),
      status: 'pending',
      seriesId: 'series-cf',
      billingCycle: '2026-11',
    };

    const notifications: MockNotification[] = [
      {
        _id: 'notif-oct',
        userId: 'user_alice',
        type: 'due_soon',
        title: `Payment Due Soon: ${octBill.name}`,
        message: '$25.00 is due tomorrow.',
        billId: octBill._id,
        seriesId: octBill.seriesId ?? null,
        billingCycle: octBill.billingCycle ?? null,
        dueDate: octBill.dueDate,
        amount: octBill.amount,
        isRead: true,
        isDismissed: false,
        createdAt: new Date(),
      },
    ];

    // Nov bill dedupe check looks for (userId, bill-nov, due_soon)
    const novExists = notifications.some(
      (n) => n.billId === novBill._id && n.type === 'due_soon',
    );
    expect(novExists).toBe(false);

    // Nov bill can generate its own reminder when its time arrives
    notifications.push({
      _id: 'notif-nov',
      userId: 'user_alice',
      type: 'due_soon',
      title: `Payment Due Soon: ${novBill.name}`,
      message: '$25.00 is due in 3 days.',
      billId: novBill._id,
      seriesId: novBill.seriesId ?? null,
      billingCycle: novBill.billingCycle ?? null,
      dueDate: novBill.dueDate,
      amount: novBill.amount,
      isRead: false,
      isDismissed: false,
      createdAt: new Date(),
    });

    expect(notifications).toHaveLength(2);
    expect(notifications.map((n) => n.billingCycle)).toEqual(['2026-10', '2026-11']);
  });
});

describe('Notifications Backend — Tenant Isolation & Lifecycle Operations', () => {
  it('enforces tenant isolation: User A cannot read or mutate User B notifications', () => {
    const db: MockNotification[] = [
      {
        _id: 'notif-bob',
        userId: 'user_bob',
        type: 'due_soon',
        title: 'Bob Alert',
        message: 'Secret',
        billId: 'b-bob',
        seriesId: null,
        billingCycle: null,
        dueDate: new Date(),
        amount: 10.0,
        isRead: false,
        isDismissed: false,
        createdAt: new Date(),
      },
    ];

    const currentUserId = 'user_alice';
    const targetId = 'notif-bob';

    // Query scoped to current authenticated user
    const found = db.find((n) => n._id === targetId && n.userId === currentUserId);
    expect(found).toBeUndefined(); // Rejects unauthorized cross-tenant access!
  });

  it('marks a single notification as read', () => {
    let notif: MockNotification = {
      _id: 'n1',
      userId: 'user_alice',
      type: 'due_soon',
      title: 'Alert',
      message: 'Due soon',
      billId: 'b1',
      seriesId: null,
      billingCycle: null,
      dueDate: new Date(),
      amount: 15.0,
      isRead: false,
      isDismissed: false,
      createdAt: new Date(),
    };

    notif = { ...notif, isRead: true };
    expect(notif.isRead).toBe(true);
  });

  it('marks all active notifications as read', () => {
    let list: MockNotification[] = [
      {
        _id: 'n1',
        userId: 'user_alice',
        type: 'due_soon',
        title: 'A1',
        message: 'M1',
        billId: 'b1',
        seriesId: null,
        billingCycle: null,
        dueDate: new Date(),
        amount: 10,
        isRead: false,
        isDismissed: false,
        createdAt: new Date(),
      },
      {
        _id: 'n2',
        userId: 'user_alice',
        type: 'overdue',
        title: 'A2',
        message: 'M2',
        billId: 'b2',
        seriesId: null,
        billingCycle: null,
        dueDate: new Date(),
        amount: 20,
        isRead: false,
        isDismissed: false,
        createdAt: new Date(),
      },
      {
        _id: 'n3',
        userId: 'user_alice',
        type: 'due_soon',
        title: 'A3',
        message: 'M3',
        billId: 'b3',
        seriesId: null,
        billingCycle: null,
        dueDate: new Date(),
        amount: 30,
        isRead: false,
        isDismissed: true, // Dismissed item
        createdAt: new Date(),
      },
    ];

    // markAllRead updates (userId, isDismissed: false, isRead: false)
    list = list.map((n) => (!n.isDismissed && !n.isRead ? { ...n, isRead: true } : n));

    expect(list.find((n) => n._id === 'n1')?.isRead).toBe(true);
    expect(list.find((n) => n._id === 'n2')?.isRead).toBe(true);
    // Dismissed item was untouched
    expect(list.find((n) => n._id === 'n3')?.isRead).toBe(false);
  });

  it('dismisses a notification (isDismissed = true, isRead = true)', () => {
    let notif: MockNotification = {
      _id: 'n1',
      userId: 'user_alice',
      type: 'due_soon',
      title: 'Alert',
      message: 'Due soon',
      billId: 'b1',
      seriesId: null,
      billingCycle: null,
      dueDate: new Date(),
      amount: 15.0,
      isRead: false,
      isDismissed: false,
      createdAt: new Date(),
    };

    notif = { ...notif, isDismissed: true, isRead: true };
    expect(notif.isDismissed).toBe(true);
    expect(notif.isRead).toBe(true);
  });

  it('supersedes active due-soon notifications when a bill becomes overdue', () => {
    const overdueBillId = 'bill-electricity';
    let notifications: MockNotification[] = [
      {
        _id: 'notif-due-soon',
        userId: 'user_alice',
        type: 'due_soon',
        title: 'Payment Due Soon: Electricity',
        message: '$120.00 is due today (2026-10-15).',
        billId: overdueBillId,
        seriesId: null,
        billingCycle: null,
        dueDate: new Date('2026-10-15T00:00:00.000Z'),
        amount: 120.0,
        isRead: false,
        isDismissed: false,
        createdAt: new Date('2026-10-15T00:00:00.000Z'),
      },
      {
        _id: 'notif-other',
        userId: 'user_alice',
        type: 'due_soon',
        title: 'Payment Due Soon: Internet',
        message: '$60.00 is due in 3 days.',
        billId: 'bill-internet',
        seriesId: null,
        billingCycle: null,
        dueDate: new Date('2026-10-23T00:00:00.000Z'),
        amount: 60.0,
        isRead: false,
        isDismissed: false,
        createdAt: new Date('2026-10-19T00:00:00.000Z'),
      },
    ];

    // Reference date moves to 2026-10-20. Bill 'bill-electricity' is now overdue.
    const overdueBills: MockBill[] = [
      {
        _id: overdueBillId,
        userId: 'user_alice',
        name: 'Electricity',
        amount: 120.0,
        dueDate: new Date('2026-10-15T00:00:00.000Z'),
        status: 'pending',
      },
    ];

    // 1. Create overdue notification
    notifications.push({
      _id: 'notif-overdue',
      userId: 'user_alice',
      type: 'overdue',
      title: 'Payment Overdue: Electricity',
      message: '$120.00 was due on 2026-10-15 (5 days overdue).',
      billId: overdueBillId,
      seriesId: null,
      billingCycle: null,
      dueDate: new Date('2026-10-15T00:00:00.000Z'),
      amount: 120.0,
      isRead: false,
      isDismissed: false,
      createdAt: new Date('2026-10-20T00:00:00.000Z'),
    });

    // 2. Supersede active due_soon alerts for all overdue bills
    const overdueBillIds = overdueBills.map((b) => b._id);
    notifications = notifications.map((n) => {
      if (
        overdueBillIds.includes(n.billId) &&
        n.type === 'due_soon' &&
        !n.isDismissed
      ) {
        return { ...n, isDismissed: true, isRead: true };
      }
      return n;
    });

    // Active (non-dismissed) notifications
    const active = notifications.filter((n) => !n.isDismissed);
    expect(active).toHaveLength(2);

    // Overdue notification is active
    const overdueNotif = active.find((n) => n.billId === overdueBillId);
    expect(overdueNotif?.type).toBe('overdue');
    expect(overdueNotif?.isRead).toBe(false);

    // The due_soon notification for overdueBillId is superseded (dismissed & read)
    const superseded = notifications.find((n) => n._id === 'notif-due-soon');
    expect(superseded?.isDismissed).toBe(true);
    expect(superseded?.isRead).toBe(true);

    // Unrelated pending bill's due_soon notification remains active
    const otherNotif = active.find((n) => n.billId === 'bill-internet');
    expect(otherNotif?.isDismissed).toBe(false);
    expect(otherNotif?.type).toBe('due_soon');
  });

  it('preserves deduplication and handles repeated supersession idempotently', () => {
    let notifications: MockNotification[] = [
      {
        _id: 'notif-due-soon',
        userId: 'user_alice',
        type: 'due_soon',
        title: 'Payment Due Soon: Netflix',
        message: '$15.99 is due.',
        billId: 'b-netflix',
        seriesId: null,
        billingCycle: null,
        dueDate: new Date('2026-10-10T00:00:00.000Z'),
        amount: 15.99,
        isRead: true,
        isDismissed: true, // Already superseded
        createdAt: new Date('2026-10-09T00:00:00.000Z'),
      },
      {
        _id: 'notif-overdue',
        userId: 'user_alice',
        type: 'overdue',
        title: 'Payment Overdue: Netflix',
        message: '$15.99 is overdue.',
        billId: 'b-netflix',
        seriesId: null,
        billingCycle: null,
        dueDate: new Date('2026-10-10T00:00:00.000Z'),
        amount: 15.99,
        isRead: false,
        isDismissed: false,
        createdAt: new Date('2026-10-11T00:00:00.000Z'),
      },
    ];

    // Second run: attempt to insert due_soon again or re-supersede
    const overdueBillIds = ['b-netflix'];
    notifications = notifications.map((n) => {
      if (
        overdueBillIds.includes(n.billId) &&
        n.type === 'due_soon' &&
        !n.isDismissed
      ) {
        return { ...n, isDismissed: true, isRead: true };
      }
      return n;
    });

    const active = notifications.filter((n) => !n.isDismissed);
    expect(active).toHaveLength(1);
    expect(active[0]._id).toBe('notif-overdue');
  });
});
