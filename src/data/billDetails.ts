export interface PaymentRecord {
  id: string;
  billId: string;
  amount: number;
  date: string;
  method: 'card' | 'bank' | 'paypal';
  status: 'completed' | 'failed' | 'refunded';
}

export interface BillNote {
  id: string;
  billId: string;
  text: string;
  createdAt: string;
}

export const MOCK_PAYMENTS: PaymentRecord[] = [
  { id: 'p1', billId: '1', amount: 15.99, date: '2026-02-18', method: 'card', status: 'completed' },
  { id: 'p2', billId: '1', amount: 15.99, date: '2026-01-18', method: 'card', status: 'completed' },
  { id: 'p3', billId: '1', amount: 13.99, date: '2025-12-18', method: 'card', status: 'completed' },
  { id: 'p4', billId: '1', amount: 13.99, date: '2025-11-18', method: 'paypal', status: 'completed' },
  { id: 'p5', billId: '2', amount: 9.99, date: '2026-02-20', method: 'card', status: 'completed' },
  { id: 'p6', billId: '2', amount: 9.99, date: '2026-01-20', method: 'card', status: 'completed' },
  { id: 'p7', billId: '3', amount: 284.50, date: '2026-02-22', method: 'bank', status: 'completed' },
  { id: 'p8', billId: '3', amount: 310.20, date: '2026-01-22', method: 'bank', status: 'completed' },
  { id: 'p9', billId: '3', amount: 245.80, date: '2025-12-22', method: 'bank', status: 'completed' },
  { id: 'p10', billId: '4', amount: 142.30, date: '2026-03-10', method: 'bank', status: 'completed' },
  { id: 'p11', billId: '4', amount: 138.50, date: '2026-02-10', method: 'bank', status: 'completed' },
  { id: 'p12', billId: '5', amount: 79.99, date: '2026-03-05', method: 'card', status: 'completed' },
  { id: 'p13', billId: '5', amount: 79.99, date: '2026-02-05', method: 'card', status: 'failed' },
  { id: 'p14', billId: '5', amount: 79.99, date: '2026-02-06', method: 'card', status: 'completed' },
  { id: 'p15', billId: '7', amount: 2200.00, date: '2026-03-01', method: 'bank', status: 'completed' },
  { id: 'p16', billId: '7', amount: 2200.00, date: '2026-02-01', method: 'bank', status: 'completed' },
  { id: 'p17', billId: '7', amount: 2200.00, date: '2026-01-01', method: 'bank', status: 'completed' },
  { id: 'p18', billId: '8', amount: 189.00, date: '2026-01-28', method: 'card', status: 'completed' },
  { id: 'p19', billId: '8', amount: 189.00, date: '2025-12-28', method: 'card', status: 'refunded' },
  { id: 'p20', billId: '10', amount: 54.99, date: '2026-02-25', method: 'card', status: 'completed' },
];

export const MOCK_NOTES: BillNote[] = [
  { id: 'n1', billId: '1', text: 'Upgraded to Premium plan starting Feb 2026', createdAt: '2026-02-01T10:00:00Z' },
  { id: 'n2', billId: '3', text: 'Usage spiked due to new deployment pipeline. Monitor next month.', createdAt: '2026-02-23T14:30:00Z' },
  { id: 'n3', billId: '5', text: 'Payment failed on Feb 5 — retry succeeded next day. Card updated.', createdAt: '2026-02-07T09:15:00Z' },
  { id: 'n4', billId: '7', text: 'Lease renewal coming up in June. Negotiate rent reduction.', createdAt: '2026-01-15T11:00:00Z' },
  { id: 'n5', billId: '8', text: 'Refund processed for Dec — duplicate charge from provider.', createdAt: '2026-01-05T16:45:00Z' },
  { id: 'n6', billId: '8', text: 'Overdue — need to contact insurance provider ASAP.', createdAt: '2026-03-02T08:00:00Z' },
];
