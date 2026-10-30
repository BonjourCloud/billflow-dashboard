import type { Bill } from '@/data/bills';

/** 'smart' is the default Bill Hub order: what needs attention first. */
export type BillSortBy = 'smart' | 'dueDate' | 'amount';

const STATUS_RANK: Record<Bill['status'], number> = { overdue: 0, pending: 1, paid: 2 };

const time = (bill: Bill) => new Date(bill.dueDate).getTime();

/**
 * "Needs attention" order: overdue bills (oldest first), then pending bills
 * (soonest due first), then paid bills (most recent first), so a loan that has
 * been paid for months does not push the next bill off the screen.
 */
export function compareBillsByAttention(a: Bill, b: Bill): number {
  const rank = STATUS_RANK[a.status] - STATUS_RANK[b.status];
  if (rank !== 0) return rank;
  const byDate = a.status === 'paid' ? time(b) - time(a) : time(a) - time(b);
  return byDate !== 0 ? byDate : a.name.localeCompare(b.name);
}
