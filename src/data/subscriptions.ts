import { BillCategory } from './bills';

export interface Subscription {
  _id: string;
  userId: string;
  name: string;
  amount: number;
  category: BillCategory;
  frequency: 'monthly';
  recurringDay: number;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
  skippedCycles?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export type SubscriptionFilterStatus = 'all' | 'active' | 'inactive';
