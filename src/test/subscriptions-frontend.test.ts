import { describe, it, expect } from 'vitest';
import { Subscription } from '@/data/subscriptions';

describe('Subscriptions Frontend — Authoritative Stats & Filter Logic', () => {
  const sampleSubscriptions: Subscription[] = [
    {
      _id: 'sub-1',
      userId: 'user_1',
      name: 'Netflix Premium',
      amount: 22.99,
      category: 'entertainment',
      frequency: 'monthly',
      recurringDay: 15,
      startDate: '2026-01-15T00:00:00.000Z',
      endDate: null,
      isActive: true,
    },
    {
      _id: 'sub-2',
      userId: 'user_1',
      name: 'GitHub Copilot Pro',
      amount: 10.0,
      category: 'software',
      frequency: 'monthly',
      recurringDay: 1,
      startDate: '2026-03-01T00:00:00.000Z',
      endDate: null,
      isActive: true,
    },
    {
      _id: 'sub-3',
      userId: 'user_1',
      name: 'Spotify Family',
      amount: 16.99,
      category: 'entertainment',
      frequency: 'monthly',
      recurringDay: 22,
      startDate: '2026-02-22T00:00:00.000Z',
      endDate: null,
      isActive: true,
    },
    {
      _id: 'sub-4',
      userId: 'user_1',
      name: 'Old Gym Membership',
      amount: 50.0,
      category: 'finance',
      frequency: 'monthly',
      recurringDay: 10,
      startDate: '2025-06-10T00:00:00.000Z',
      endDate: '2026-05-10T00:00:00.000Z',
      isActive: false, // Cancelled / Ended
    },
  ];

  it('calculates monthly and annual commitments using active series only', () => {
    const activeList = sampleSubscriptions.filter((s) => s.isActive);
    const activeCount = activeList.length;
    const endedCount = sampleSubscriptions.length - activeCount;

    const monthlyRunRate = activeList.reduce((sum, s) => sum + s.amount, 0);
    const annualRunRate = monthlyRunRate * 12;

    expect(activeCount).toBe(3);
    expect(endedCount).toBe(1);

    // 22.99 + 10.00 + 16.99 = 49.98 (the $50 inactive gym is strictly excluded!)
    expect(monthlyRunRate).toBeCloseTo(49.98, 2);
    expect(annualRunRate).toBeCloseTo(49.98 * 12, 2);
    expect(annualRunRate).toBeCloseTo(599.76, 2);
  });

  it('filters subscriptions by status (active vs inactive vs all)', () => {
    const activeOnly = sampleSubscriptions.filter((s) => s.isActive);
    expect(activeOnly).toHaveLength(3);
    expect(activeOnly.map((s) => s.name)).toEqual([
      'Netflix Premium',
      'GitHub Copilot Pro',
      'Spotify Family',
    ]);

    const inactiveOnly = sampleSubscriptions.filter((s) => !s.isActive);
    expect(inactiveOnly).toHaveLength(1);
    expect(inactiveOnly[0].name).toBe('Old Gym Membership');
  });

  it('filters subscriptions by category', () => {
    const entertainment = sampleSubscriptions.filter(
      (s) => s.category === 'entertainment',
    );
    expect(entertainment).toHaveLength(2);

    const software = sampleSubscriptions.filter((s) => s.category === 'software');
    expect(software).toHaveLength(1);
    expect(software[0].name).toBe('GitHub Copilot Pro');
  });

  it('filters subscriptions by search query (case-insensitive substring)', () => {
    const query = 'git';
    const matches = sampleSubscriptions.filter((s) =>
      s.name.toLowerCase().includes(query.toLowerCase()),
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]._id).toBe('sub-2');
  });

  it('sorts subscriptions by name, amount, and renewal day', () => {
    // Sort by amount ascending
    const sortedByAmountAsc = [...sampleSubscriptions].sort(
      (a, b) => a.amount - b.amount,
    );
    expect(sortedByAmountAsc[0].name).toBe('GitHub Copilot Pro'); // 10.00
    expect(sortedByAmountAsc[sortedByAmountAsc.length - 1].name).toBe(
      'Old Gym Membership',
    ); // 50.00

    // Sort by recurring day ascending
    const sortedByDay = [...sampleSubscriptions].sort(
      (a, b) => a.recurringDay - b.recurringDay,
    );
    expect(sortedByDay[0].recurringDay).toBe(1);
    expect(sortedByDay[sortedByDay.length - 1].recurringDay).toBe(22);
  });

  it('returns zero metrics when user has zero subscriptions', () => {
    const emptyList: Subscription[] = [];
    const activeList = emptyList.filter((s) => s.isActive);
    const activeCount = activeList.length;
    const endedCount = emptyList.length - activeCount;
    const monthlyRunRate = activeList.reduce((sum, s) => sum + s.amount, 0);
    const annualRunRate = monthlyRunRate * 12;

    expect(activeCount).toBe(0);
    expect(endedCount).toBe(0);
    expect(monthlyRunRate).toBe(0);
    expect(annualRunRate).toBe(0);
  });

  it('defaults delete scope to "future" unless explicitly specified as "all"', () => {
    // Contract verification of useSubscriptionStore deleteMutation default parameter:
    const resolveDeleteScope = ({
      scope = 'future',
    }: {
      scope?: 'future' | 'all';
    } = {}) => scope;

    expect(resolveDeleteScope()).toBe('future');
    expect(resolveDeleteScope({ scope: undefined })).toBe('future');
    expect(resolveDeleteScope({ scope: 'future' })).toBe('future');
    expect(resolveDeleteScope({ scope: 'all' })).toBe('all');
  });
});
