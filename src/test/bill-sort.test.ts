import { describe, it, expect } from 'vitest';
import type { Bill } from '@/data/bills';
import { compareBillsByAttention } from '@/lib/billSort';

const bill = (name: string, dueDate: string, status: Bill['status']): Bill =>
  ({ _id: name + dueDate, name, amount: 1, dueDate, status, category: 'loans', isSubscription: false } as Bill);

describe('compareBillsByAttention', () => {
  it('puts the next pending bill above months of paid EMIs', () => {
    const bills = [
      bill('Fibe1', '2026-03-05', 'paid'),
      bill('Fibe1', '2026-09-05', 'paid'),
      bill('Fibe1', '2026-11-05', 'pending'),
      bill('Rent', '2026-11-01', 'pending'),
      bill('Old', '2026-08-01', 'overdue'),
      bill('Fibe1', '2026-10-05', 'paid'),
    ];
    const order = [...bills].sort(compareBillsByAttention).map((b) => `${b.name} ${b.dueDate.slice(0, 7)} ${b.status}`);
    expect(order).toEqual([
      'Old 2026-08 overdue',
      'Rent 2026-11 pending',
      'Fibe1 2026-11 pending',
      'Fibe1 2026-10 paid',
      'Fibe1 2026-09 paid',
      'Fibe1 2026-03 paid',
    ]);
  });

  it('breaks ties by name', () => {
    const a = bill('Alpha', '2026-11-05', 'pending');
    const b = bill('Beta', '2026-11-05', 'pending');
    expect([b, a].sort(compareBillsByAttention)[0].name).toBe('Alpha');
  });
});
