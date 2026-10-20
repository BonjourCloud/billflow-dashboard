export const PAYMENT_METHODS = [
  'cash',
  'debit_card',
  'credit_card',
  'upi',
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_STATUSES = [
  'completed',
  'failed',
  'refunded',
] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export interface PaymentRecord {
  _id: string;
  id?: string;
  userId?: string;
  billId: string;
  amount: number;
  paymentDate: string;
  date?: string;
  method: PaymentMethod;
  status: PaymentStatus;
  reference?: string | null;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface BillNote {
  _id: string;
  id?: string;
  userId?: string;
  billId: string;
  text: string;
  createdAt: string;
  updatedAt?: string;
}

export function formatPaymentMethod(method: PaymentMethod): string {
  switch (method) {
    case 'cash':
      return 'Cash';
    case 'debit_card':
      return 'Debit Card';
    case 'credit_card':
      return 'Credit Card';
    case 'upi':
      return 'UPI';
    default:
      return method;
  }
}
