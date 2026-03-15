export type BillStatus = 'paid' | 'pending' | 'overdue';
export type BillCategory = 'utilities' | 'entertainment' | 'software' | 'finance' | 'insurance' | 'housing';

export interface Bill {
  id: string;
  name: string;
  amount: number;
  dueDate: string;
  status: BillStatus;
  category: BillCategory;
  isSubscription: boolean;
  logo?: string;
}

export const MOCK_BILLS: Bill[] = [
  { id: '1', name: 'Netflix', amount: 15.99, dueDate: '2026-03-18', status: 'pending', category: 'entertainment', isSubscription: true },
  { id: '2', name: 'Spotify', amount: 9.99, dueDate: '2026-03-20', status: 'pending', category: 'entertainment', isSubscription: true },
  { id: '3', name: 'AWS Cloud', amount: 284.50, dueDate: '2026-03-22', status: 'pending', category: 'software', isSubscription: true },
  { id: '4', name: 'Electric Bill', amount: 142.30, dueDate: '2026-03-10', status: 'paid', category: 'utilities', isSubscription: false },
  { id: '5', name: 'Internet Service', amount: 79.99, dueDate: '2026-03-05', status: 'paid', category: 'utilities', isSubscription: true },
  { id: '6', name: 'Figma Pro', amount: 12.00, dueDate: '2026-03-01', status: 'paid', category: 'software', isSubscription: true },
  { id: '7', name: 'Rent', amount: 2200.00, dueDate: '2026-03-01', status: 'paid', category: 'housing', isSubscription: false },
  { id: '8', name: 'Car Insurance', amount: 189.00, dueDate: '2026-02-28', status: 'overdue', category: 'insurance', isSubscription: false },
  { id: '9', name: 'Gym Membership', amount: 49.99, dueDate: '2026-02-25', status: 'overdue', category: 'entertainment', isSubscription: true },
  { id: '10', name: 'Adobe Creative', amount: 54.99, dueDate: '2026-03-25', status: 'pending', category: 'software', isSubscription: true },
  { id: '11', name: 'Water Bill', amount: 45.00, dueDate: '2026-03-15', status: 'pending', category: 'utilities', isSubscription: false },
  { id: '12', name: 'Health Insurance', amount: 320.00, dueDate: '2026-03-01', status: 'paid', category: 'insurance', isSubscription: false },
  { id: '13', name: 'GitHub Copilot', amount: 19.00, dueDate: '2026-03-28', status: 'pending', category: 'software', isSubscription: true },
  { id: '14', name: 'Phone Bill', amount: 65.00, dueDate: '2026-03-12', status: 'paid', category: 'utilities', isSubscription: true },
  { id: '15', name: 'Hulu', amount: 17.99, dueDate: '2026-03-19', status: 'pending', category: 'entertainment', isSubscription: true },
];

export const CATEGORIES: BillCategory[] = ['utilities', 'entertainment', 'software', 'finance', 'insurance', 'housing'];
export const STATUSES: BillStatus[] = ['paid', 'pending', 'overdue'];
