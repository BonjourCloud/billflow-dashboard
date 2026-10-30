import mongoose from "mongoose";
import { Bill, type BillDocument } from "../models/Bill.js";
import { Notification, type NotificationDocument } from "../models/Notification.js";
import { formatCurrency } from "./currency.js";

/**
 * Formats a date into a clean YYYY-MM-DD UTC string
 */
export function formatUtcDateString(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Computes human-friendly relative time text for upcoming bills
 */
export function getUpcomingRelativeText(
  dueDateMidnightUtc: number,
  refMidnightUtc: number,
): string {
  const diffMs = dueDateMidnightUtc - refMidnightUtc;
  const diffDays = Math.round(diffMs / 86400000);
  if (diffDays <= 0) return "is due today";
  if (diffDays === 1) return "is due tomorrow";
  return `is due in ${diffDays} days`;
}

/**
 * Computes human-friendly relative time text for overdue bills
 */
export function getOverdueRelativeText(
  dueDateMidnightUtc: number,
  refMidnightUtc: number,
): string {
  const diffMs = refMidnightUtc - dueDateMidnightUtc;
  const daysOverdue = Math.max(1, Math.round(diffMs / 86400000));
  if (daysOverdue === 1) return "1 day overdue";
  return `${daysOverdue} days overdue`;
}

/**
 * ID type for notification entity references
 */
export type NotificationEntityId = mongoose.Types.ObjectId | string;

/**
 * Structured reminder notification payload
 */
export interface ReminderNotificationData {
  type: "due_soon" | "overdue";
  title: string;
  message: string;
  billId: NotificationEntityId;
  planId: NotificationEntityId | null;
  seriesId: NotificationEntityId | null;
  billingCycle: string | null;
  dueDate: Date;
  amount: number;
}

/**
 * Builds reminder notification data for an upcoming bill occurrence
 */
export function buildDueSoonReminderData(
  bill: {
    _id: NotificationEntityId;
    name: string;
    amount: number;
    dueDate: Date | string;
    planId?: NotificationEntityId | null;
    seriesId?: NotificationEntityId | null;
    billingCycle?: string | null;
  },
  refMidnightUtc: number,
): ReminderNotificationData {
  const d = bill.dueDate instanceof Date ? bill.dueDate : new Date(bill.dueDate);
  const billDueMidnight = Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate(),
  );

  const relativeText = getUpcomingRelativeText(billDueMidnight, refMidnightUtc);
  const dateStr = formatUtcDateString(d);
  const amountStr = formatCurrency(bill.amount);

  return {
    type: "due_soon",
    title: `Payment Due Soon: ${bill.name}`,
    message: `${amountStr} ${relativeText} (${dateStr}).`,
    billId: bill._id,
    seriesId: bill.seriesId ?? null,
    planId: bill.planId ?? null,
    billingCycle: bill.billingCycle ?? null,
    dueDate: d,
    amount: bill.amount,
  };
}

/**
 * Builds reminder notification data for an overdue bill occurrence
 */
export function buildOverdueReminderData(
  bill: {
    _id: NotificationEntityId;
    name: string;
    amount: number;
    dueDate: Date | string;
    planId?: NotificationEntityId | null;
    seriesId?: NotificationEntityId | null;
    billingCycle?: string | null;
  },
  refMidnightUtc: number,
): ReminderNotificationData {
  const d = bill.dueDate instanceof Date ? bill.dueDate : new Date(bill.dueDate);
  const billDueMidnight = Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate(),
  );

  const relativeText = getOverdueRelativeText(billDueMidnight, refMidnightUtc);
  const dateStr = formatUtcDateString(d);
  const amountStr = formatCurrency(bill.amount);

  return {
    type: "overdue",
    title: `Payment Overdue: ${bill.name}`,
    message: `${amountStr} was due on ${dateStr} (${relativeText}).`,
    billId: bill._id,
    seriesId: bill.seriesId ?? null,
    planId: bill.planId ?? null,
    billingCycle: bill.billingCycle ?? null,
    dueDate: d,
    amount: bill.amount,
  };
}

/**
 * Idempotently generates reminders (due_soon within 5 days, and overdue)
 * for the authenticated user based on active bill occurrences.
 */
export async function generateRemindersForUser(
  userId: string,
  referenceDate: Date = new Date(),
): Promise<{ createdCount: number }> {
  if (!userId) {
    return { createdCount: 0 };
  }

  const refMidnightUtc = Date.UTC(
    referenceDate.getUTCFullYear(),
    referenceDate.getUTCMonth(),
    referenceDate.getUTCDate(),
  );

  // 5-day horizon for upcoming due soon reminders
  const horizonMidnightUtc = refMidnightUtc + 5 * 86400000;

  // 1. Candidate bills: Due soon (within [today, today + 5 days], pending status)
  const dueSoonBills = await Bill.find({
    userId,
    status: "pending",
    dueDate: {
      $gte: new Date(refMidnightUtc),
      $lte: new Date(horizonMidnightUtc),
    },
  }).lean();

  // 2. Candidate bills: Overdue (dueDate before today, not paid)
  const overdueBills = await Bill.find({
    userId,
    status: { $ne: "paid" },
    dueDate: {
      $lt: new Date(refMidnightUtc),
    },
  }).lean();

  let createdCount = 0;

  // One query per reminder type finds the bills that already have a reminder
  // (active, read or dismissed). This runs on every notifications request, so
  // a lookup per bill meant a round trip for each overdue bill, every minute.
  const billsWithReminder = async (
    type: "due_soon" | "overdue",
    bills: Array<{ _id: unknown }>,
  ): Promise<Set<string>> => {
    if (bills.length === 0) return new Set();
    const rows = await Notification.find({
      userId,
      type,
      billId: { $in: bills.map((bill) => bill._id) },
    })
      .select("billId")
      .lean();
    return new Set(rows.map((row) => String(row.billId)));
  };
  const dueSoonHaveReminder = await billsWithReminder("due_soon", dueSoonBills);
  const overdueHaveReminder = await billsWithReminder("overdue", overdueBills);

  // Process due_soon reminders
  for (const bill of dueSoonBills) {
    const reminderData = buildDueSoonReminderData(bill, refMidnightUtc);

    if (dueSoonHaveReminder.has(String(bill._id))) {
      continue;
    }

    try {
      await Notification.create({
        userId,
        ...reminderData,
        isRead: false,
        isDismissed: false,
      });
      createdCount++;
    } catch (error: unknown) {
      const mongoError = error as { code?: number };
      if (mongoError?.code === 11000) {
        // Safe absorption of concurrent insertion race
        continue;
      }
      throw error;
    }
  }

  // Process overdue reminders
  for (const bill of overdueBills) {
    const reminderData = buildOverdueReminderData(bill, refMidnightUtc);

    if (overdueHaveReminder.has(String(bill._id))) {
      continue;
    }

    try {
      await Notification.create({
        userId,
        ...reminderData,
        isRead: false,
        isDismissed: false,
      });
      createdCount++;
    } catch (error: unknown) {
      const mongoError = error as { code?: number };
      if (mongoError?.code === 11000) {
        continue;
      }
      throw error;
    }
  }

  // 2b. Supersede open due-soon reminders for overdue bills:
  // When a bill is overdue and has an overdue reminder, ensure its older
  // active due_soon reminder is superseded (isDismissed: true, isRead: true)
  // so the user does not see contradictory "due soon" and "overdue" alerts simultaneously.
  // The record is preserved in MongoDB, maintaining the unique index { userId, billId, type }
  // to prevent due_soon regeneration.
  if (overdueBills.length > 0) {
    const overdueBillIds = overdueBills.map((b) => b._id);
    await Notification.updateMany(
      {
        userId,
        billId: { $in: overdueBillIds },
        type: "due_soon",
        isDismissed: false,
      },
      {
        $set: { isDismissed: true, isRead: true },
      },
    );
  }

  // 3. Stale Notification Resolution:
  // If any bill has been marked 'paid', mark its open unread notifications as read
  // so the user does not receive outdated warnings.
  // Only unread notifications can need resolving, so start from those (usually
  // a handful) instead of loading the id of every paid bill the user has ever had.
  const unreadNotifications = await Notification.find({ userId, isRead: false })
    .select("billId")
    .lean();

  if (unreadNotifications.length > 0) {
    const paidBills = await Bill.find({
      userId,
      status: "paid",
      _id: { $in: unreadNotifications.map((n) => n.billId) },
    })
      .select("_id")
      .lean();

    if (paidBills.length > 0) {
      const paidIds = paidBills.map((b) => b._id);
      await Notification.updateMany(
        {
          userId,
          billId: { $in: paidIds },
          isRead: false,
        },
        {
          $set: { isRead: true },
        },
      );
    }
  }

  return { createdCount };
}

// Reminders created before the rupee change were stored as text starting with
// a US-formatted amount, e.g. "$210,759.00 was due on ...".
const LEGACY_DOLLAR_AMOUNT = /^\$(\d{1,3}(?:,\d{3})*\.\d{2})(?=\s)/;

/**
 * Rewrites a legacy reminder message to start with the same amount in rupees
 * ("₹2,10,759.00 was due on ..."). Returns null when the message has no
 * leading dollar amount, so already-converted text is never touched.
 */
export function toRupeeReminderMessage(message: string): string | null {
  const match = LEGACY_DOLLAR_AMOUNT.exec(message);
  if (!match) return null;
  const amount = Number(match[1].replace(/,/g, ""));
  return formatCurrency(amount) + message.slice(match[0].length);
}

/**
 * Converts the user's stored reminder messages that still start with a dollar
 * amount. Only the message text changes: read/dismissed state, timestamps, and
 * every other field are left as they were, and nothing is deleted. Safe to run
 * repeatedly and concurrently.
 */
export async function convertLegacyReminderCurrency(userId: string): Promise<number> {
  const legacy = await Notification.find({ userId, message: { $regex: /^\$\d/ } })
    .select("_id message")
    .lean();

  const updates = legacy.flatMap((notification) => {
    const message = toRupeeReminderMessage(notification.message);
    if (!message) return [];
    return [
      {
        updateOne: {
          // Matching the old text keeps a concurrent conversion from applying twice.
          filter: { _id: notification._id, userId, message: notification.message },
          update: { $set: { message } },
          timestamps: false,
        },
      },
    ];
  });

  if (updates.length === 0) return 0;
  const result = await Notification.bulkWrite(updates, { ordered: false });
  return result.modifiedCount;
}

/**
 * Marks a single notification as read with tenant isolation.
 */
export async function markNotificationRead(
  userId: string,
  notificationId: string,
): Promise<NotificationDocument | null> {
  const updated = await Notification.findOneAndUpdate(
    { _id: notificationId, userId },
    { $set: { isRead: true } },
    { new: true },
  ).lean();
  return updated;
}

/**
 * Marks all non-dismissed notifications as read for the authenticated user.
 */
export async function markAllNotificationsRead(
  userId: string,
): Promise<number> {
  const result = await Notification.updateMany(
    { userId, isDismissed: false, isRead: false },
    { $set: { isRead: true } },
  );
  return result.modifiedCount;
}

/**
 * Soft-dismisses a notification (sets isDismissed = true, isRead = true).
 * Retains the record in MongoDB to preserve the unique dedupe key
 * and prevent duplicate alert regeneration on subsequent API requests.
 */
export async function dismissNotification(
  userId: string,
  notificationId: string,
): Promise<NotificationDocument | null> {
  const updated = await Notification.findOneAndUpdate(
    { _id: notificationId, userId },
    { $set: { isDismissed: true, isRead: true } },
    { new: true },
  ).lean();
  return updated;
}

/**
 * Cleans up notifications associated with deleted bill occurrences.
 */
export async function cleanUpNotificationsForBills(
  userId: string,
  billIds: (string | mongoose.Types.ObjectId)[],
): Promise<number> {
  if (!billIds.length) return 0;
  const result = await Notification.deleteMany({
    userId,
    billId: { $in: billIds },
  });
  return result.deletedCount;
}
