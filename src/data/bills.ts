import { DEFAULT_CATEGORIES } from './categories';
export type BillStatus = 'paid' | 'pending' | 'overdue';
/** A category slug. Categories are managed in the database (Admin → Categories). */
export type BillCategory = string;

export interface Bill {
  _id: string;
  name: string;
  amount: number;
  dueDate: string;
  status: BillStatus;
  category: BillCategory;
  isSubscription: boolean;
  recurrenceType?: 'one_time' | 'recurring';
  seriesId?: string | null;
  billingCycle?: string | null;
  recurringDay?: number;
  planId?: string | null;
  installmentNumber?: number | null;
  totalInstallments?: number | null;
}

/** Built-in slugs only; UI dropdowns should use useCategories() instead. */
export const CATEGORIES: BillCategory[] = DEFAULT_CATEGORIES.map((c) => c.slug);
export const STATUSES: BillStatus[] = ['paid', 'pending', 'overdue'];
