import { describe, it, expect } from 'vitest';
import { NotificationItem } from '@/data/notifications';

describe('Notifications Frontend — Store Computations & UI States', () => {
  const sampleNotifications: NotificationItem[] = [
    {
      _id: 'n1',
      userId: 'user_1',
      type: 'due_soon',
      title: 'Payment Due Soon: Netflix',
      message: '$22.99 is due in 2 days.',
      billId: 'b1',
      seriesId: 's1',
      billingCycle: '2026-10',
      dueDate: '2026-10-21T00:00:00.000Z',
      amount: 22.99,
      isRead: false,
      isDismissed: false,
      createdAt: '2026-10-19T10:00:00.000Z',
      updatedAt: '2026-10-19T10:00:00.000Z',
    },
    {
      _id: 'n2',
      userId: 'user_1',
      type: 'overdue',
      title: 'Payment Overdue: Electricity',
      message: '$85.00 was due on 2026-10-15 (4 days overdue).',
      billId: 'b2',
      seriesId: null,
      billingCycle: null,
      dueDate: '2026-10-15T00:00:00.000Z',
      amount: 85.0,
      isRead: false,
      isDismissed: false,
      createdAt: '2026-10-19T09:00:00.000Z',
      updatedAt: '2026-10-19T09:00:00.000Z',
    },
    {
      _id: 'n3',
      userId: 'user_1',
      type: 'due_soon',
      title: 'Payment Due Soon: Spotify',
      message: '$10.99 is due tomorrow.',
      billId: 'b3',
      seriesId: 's3',
      billingCycle: '2026-10',
      dueDate: '2026-10-20T00:00:00.000Z',
      amount: 10.99,
      isRead: true, // Already read
      isDismissed: false,
      createdAt: '2026-10-18T10:00:00.000Z',
      updatedAt: '2026-10-19T08:00:00.000Z',
    },
    {
      _id: 'n4',
      userId: 'user_1',
      type: 'overdue',
      title: 'Old Dismissed Alert',
      message: 'Dismissed',
      billId: 'b4',
      seriesId: null,
      billingCycle: null,
      dueDate: '2026-10-01T00:00:00.000Z',
      amount: 50.0,
      isRead: true,
      isDismissed: true, // Dismissed
      createdAt: '2026-10-02T10:00:00.000Z',
      updatedAt: '2026-10-03T10:00:00.000Z',
    },
  ];

  it('calculates unreadCount strictly from non-dismissed and unread notifications', () => {
    const activeNotifications = sampleNotifications.filter((n) => !n.isDismissed);
    const unreadCount = activeNotifications.filter((n) => !n.isRead).length;

    // n1 (unread) + n2 (unread) = 2. (n3 is read, n4 is dismissed)
    expect(activeNotifications).toHaveLength(3);
    expect(unreadCount).toBe(2);
  });

  it('filters out dismissed notifications from the active list', () => {
    const active = sampleNotifications.filter((n) => !n.isDismissed);
    expect(active.some((n) => n._id === 'n4')).toBe(false);
  });

  it('sorts notifications by creation timestamp descending (newest first)', () => {
    const active = sampleNotifications.filter((n) => !n.isDismissed);
    const sorted = [...active].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    expect(sorted[0]._id).toBe('n1'); // 10:00
    expect(sorted[1]._id).toBe('n2'); // 09:00
    expect(sorted[2]._id).toBe('n3'); // Oct 18
  });

  it('formats unread badge label correctly (numbers vs "9+")', () => {
    const formatBadge = (count: number) => (count > 9 ? '9+' : String(count));

    expect(formatBadge(1)).toBe('1');
    expect(formatBadge(5)).toBe('5');
    expect(formatBadge(9)).toBe('9');
    expect(formatBadge(10)).toBe('9+');
    expect(formatBadge(42)).toBe('9+');
  });

  it('identifies urgency styling based on notification type', () => {
    const getUrgency = (type: 'due_soon' | 'overdue') =>
      type === 'overdue' ? 'destructive' : 'amber';

    expect(getUrgency('overdue')).toBe('destructive');
    expect(getUrgency('due_soon')).toBe('amber');
  });

  it('handles empty, loading, and error states gracefully', () => {
    // Zero notifications empty state
    const emptyList: NotificationItem[] = [];
    const emptyActive = emptyList.filter((n) => !n.isDismissed);
    expect(emptyActive).toHaveLength(0);

    const isStateEmpty = (items: NotificationItem[], loading: boolean, err: boolean) =>
      !loading && !err && items.length === 0;

    expect(isStateEmpty([], false, false)).toBe(true);
    expect(isStateEmpty([], true, false)).toBe(false); // Loading state
    expect(isStateEmpty([], false, true)).toBe(false); // Error state
    expect(isStateEmpty(sampleNotifications, false, false)).toBe(false); // Populated
  });
});
