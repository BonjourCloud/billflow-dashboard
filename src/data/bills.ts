export type BillStatus = 'paid' | 'pending' | 'overdue';
export type BillCategory = 'utilities' | 'entertainment' | 'software' | 'finance' | 'insurance' | 'housing';

export interface Bill {
  _id: string;
  name: string;
  amount: number;
  dueDate: string;
  status: BillStatus;
  category: BillCategory;
  isSubscription: boolean;
}

export const CATEGORIES: BillCategory[] = ['utilities', 'entertainment', 'software', 'finance', 'insurance', 'housing'];
export const STATUSES: BillStatus[] = ['paid', 'pending', 'overdue'];
