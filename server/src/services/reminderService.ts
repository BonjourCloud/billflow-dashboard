import mongoose from "mongoose";
import { Bill, type BillDocument } from "../models/Bill.js";
import { Notification, type NotificationDocument } from "../models/Notification.js";

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

  // Process due_soon reminders
  for (const bill of dueSoonBills) {
    const billDueMidnight = Date.UTC(
      bill.dueDate.getUTCFullYear(),
      bill.dueDate.getUTCMonth(),
      bill.dueDate.getUTCDate(),
    );

    const relativeText = getUpcomingRelativeText(billDueMidnight, refMidnightUtc);
    const dateStr = formatUtcDateString(bill.dueDate);
    const amountStr = bill.amount.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    const title = `Payment Due Soon: ${bill.name}`;
    const message = `$${amountStr} ${relativeText} (${dateStr}).`;

    // Check if notification already exists (active, read, or dismissed)
    const existing = await Notification.findOne({
      userId,
      billId: bill._id,
      type: "due_soon",
    })
      .select("_id")
      .lean();

    if (existing) {
      continue;
    }

    try {
      await Notification.create({
        userId,
        type: "due_soon",
        title,
        message,
        billId: bill._id,
        seriesId: bill.seriesId ?? null,
        billingCycle: bill.billingCycle ?? null,
        dueDate: bill.dueDate,
        amount: bill.amount,
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
    const billDueMidnight = Date.UTC(
      bill.dueDate.getUTCFullYear(),
      bill.dueDate.getUTCMonth(),
      bill.dueDate.getUTCDate(),
    );

    const relativeText = getOverdueRelativeText(billDueMidnight, refMidnightUtc);
    const dateStr = formatUtcDateString(bill.dueDate);
    const amountStr = bill.amount.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    const title = `Payment Overdue: ${bill.name}`;
    const message = `$${amountStr} was due on ${dateStr} (${relativeText}).`;

    const existing = await Notification.findOne({
      userId,
      billId: bill._id,
      type: "overdue",
    })
      .select("_id")
      .lean();

    if (existing) {
      continue;
    }

    try {
      await Notification.create({
        userId,
        type: "overdue",
        title,
        message,
        billId: bill._id,
        seriesId: bill.seriesId ?? null,
        billingCycle: bill.billingCycle ?? null,
        dueDate: bill.dueDate,
        amount: bill.amount,
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

  // 3. Stale Notification Resolution:
  // If any bill has been marked 'paid', mark its open unread notifications as read
  // so the user does not receive outdated warnings.
  const paidBills = await Bill.find({
    userId,
    status: "paid",
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

  return { createdCount };
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
