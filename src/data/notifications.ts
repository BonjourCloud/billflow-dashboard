export type NotificationType = 'due_soon' | 'overdue';

export interface NotificationItem {
  _id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  billId: string;
  seriesId: string | null;
  billingCycle: string | null;
  dueDate: string;
  amount: number;
  isRead: boolean;
  isDismissed: boolean;
  createdAt: string;
  updatedAt: string;
}
