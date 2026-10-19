import mongoose from "mongoose";
import { Bill, type BillDocument } from "../models/Bill.js";
import { RecurringSeries, type RecurringSeriesDocument } from "../models/RecurringSeries.js";

/**
 * Calculates the occurrence due date with month-end clamping.
 * Preserves the original anchor day (e.g. 31) and clamps to the last
 * day of shorter months (e.g. 28/29 for Feb, 30 for Apr), then restores
 * the original anchor day in 31-day months.
 *
 * Uses UTC to avoid any timezone-shift bugs.
 */
export function calculateOccurrenceDueDate(
  recurringDay: number,
  year: number,
  monthIndex: number,
): Date {
  // Day 0 of the next month yields the last day of monthIndex in UTC
  const maxDays = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const clampedDay = Math.min(Math.max(1, recurringDay), maxDays);
  return new Date(Date.UTC(year, monthIndex, clampedDay, 0, 0, 0, 0));
}

/**
 * Returns a standardized billing cycle key: "YYYY-MM"
 */
export function getBillingCycleKey(year: number, monthIndex: number): string {
  const mm = String(monthIndex + 1).padStart(2, "0");
  return `${year}-${mm}`;
}

/**
 * Parses a "YYYY-MM" billing cycle key into year and 0-indexed month.
 */
export function parseBillingCycleKey(cycleKey: string): {
  year: number;
  monthIndex: number;
} {
  const [yearStr, monthStr] = cycleKey.split("-");
  return {
    year: parseInt(yearStr, 10),
    monthIndex: parseInt(monthStr, 10) - 1,
  };
}

export interface CycleDefinition {
  billingCycle: string;
  dueDate: Date;
}

/**
 * Computes all billing cycles that should exist for a recurring series
 * from its startDate up to the active horizon (current month + 1 month ahead),
 * or at least the start cycle if startDate is in the future.
 */
export function getDueCycles(
  startDate: Date,
  recurringDay: number,
  endDate: Date | null = null,
  referenceDate: Date = new Date(),
): CycleDefinition[] {
  const startYear = startDate.getUTCFullYear();
  const startMonth = startDate.getUTCMonth();

  const refYear = referenceDate.getUTCFullYear();
  const refMonth = referenceDate.getUTCMonth();

  // Horizon: End of next calendar month (current month + 1)
  let horizonYear = refYear;
  let horizonMonth = refMonth + 1;
  if (horizonMonth > 11) {
    horizonMonth = 0;
    horizonYear += 1;
  }

  // Ensure horizon extends to at least the series startDate
  let targetYear = horizonYear;
  let targetMonth = horizonMonth;
  if (
    startYear > targetYear ||
    (startYear === targetYear && startMonth > targetMonth)
  ) {
    targetYear = startYear;
    targetMonth = startMonth;
  }

  // If series has an endDate, clamp target to endDate
  if (endDate) {
    const endYear = endDate.getUTCFullYear();
    const endMonth = endDate.getUTCMonth();
    if (
      endYear < targetYear ||
      (endYear === targetYear && endMonth < targetMonth)
    ) {
      targetYear = endYear;
      targetMonth = endMonth;
    }
  }

  const cycles: CycleDefinition[] = [];
  let currYear = startYear;
  let currMonth = startMonth;

  const startDayUtc = Date.UTC(
    startDate.getUTCFullYear(),
    startDate.getUTCMonth(),
    startDate.getUTCDate(),
  );

  const endDayUtc = endDate
    ? Date.UTC(
        endDate.getUTCFullYear(),
        endDate.getUTCMonth(),
        endDate.getUTCDate(),
      )
    : null;

  while (
    currYear < targetYear ||
    (currYear === targetYear && currMonth <= targetMonth)
  ) {
    const dueDate = calculateOccurrenceDueDate(recurringDay, currYear, currMonth);

    // If due date in the first month precedes startDate, check if it should be included
    if (dueDate.getTime() >= startDayUtc) {
      if (endDayUtc && dueDate.getTime() > endDayUtc) {
        break;
      }
      cycles.push({
        billingCycle: getBillingCycleKey(currYear, currMonth),
        dueDate,
      });
    }

    currMonth++;
    if (currMonth > 11) {
      currMonth = 0;
      currYear++;
    }
  }

  return cycles;
}

/**
 * Idempotently generates due occurrences for all active recurring series
 * owned by the authenticated user.
 */
export async function generateDueOccurrencesForUser(
  userId: string,
  referenceDate: Date = new Date(),
): Promise<{ createdCount: number }> {
  if (!userId) {
    return { createdCount: 0 };
  }

  const activeSeries = await RecurringSeries.find({
    userId,
    isActive: true,
  }).lean();

  let createdCount = 0;
  const refTimeMidnightUtc = Date.UTC(
    referenceDate.getUTCFullYear(),
    referenceDate.getUTCMonth(),
    referenceDate.getUTCDate(),
  );

  for (const series of activeSeries) {
    const cycles = getDueCycles(
      series.startDate,
      series.recurringDay,
      series.endDate ?? null,
      referenceDate,
    );

    const skippedSet = new Set(series.skippedCycles || []);

    for (const cycle of cycles) {
      if (skippedSet.has(cycle.billingCycle)) {
        continue;
      }

      // Check if bill occurrence already exists
      const existing = await Bill.findOne({
        seriesId: series._id,
        billingCycle: cycle.billingCycle,
      })
        .select("_id")
        .lean();

      if (existing) {
        continue;
      }

      const isPastDue = cycle.dueDate.getTime() < refTimeMidnightUtc;
      const status = isPastDue ? "overdue" : "pending";

      try {
        await Bill.create({
          userId,
          name: series.name,
          amount: series.amount,
          dueDate: cycle.dueDate,
          status,
          category: series.category,
          isSubscription: true,
          recurrenceType: "recurring",
          seriesId: series._id,
          billingCycle: cycle.billingCycle,
        });
        createdCount++;
      } catch (error: unknown) {
        // Handle MongoDB E11000 duplicate key race gracefully
        const mongoError = error as { code?: number };
        if (mongoError?.code === 11000) {
          continue;
        }
        throw error;
      }
    }
  }

  return { createdCount };
}

/**
 * Creates a new recurring series and immediately materializes its due occurrences.
 */
export async function createRecurringSeriesWithOccurrences(
  userId: string,
  data: {
    name: string;
    amount: number;
    category:
      | "utilities"
      | "entertainment"
      | "software"
      | "finance"
      | "insurance"
      | "housing";
    dueDate: Date;
    recurringDay?: number;
    initialStatus?: "paid" | "pending" | "overdue";
  },
  referenceDate: Date = new Date(),
): Promise<{ series: RecurringSeriesDocument; primaryBill: BillDocument }> {
  const recurringDay = data.recurringDay ?? data.dueDate.getUTCDate();

  const series = await RecurringSeries.create({
    userId,
    name: data.name,
    amount: data.amount,
    category: data.category,
    frequency: "monthly",
    recurringDay,
    startDate: data.dueDate,
    isActive: true,
    skippedCycles: [],
  });

  const initialCycleKey = getBillingCycleKey(
    data.dueDate.getUTCFullYear(),
    data.dueDate.getUTCMonth(),
  );

  // Create initial occurrence with the requested status
  const primaryBill = await Bill.create({
    userId,
    name: data.name,
    amount: data.amount,
    dueDate: data.dueDate,
    status: data.initialStatus ?? "pending",
    category: data.category,
    isSubscription: true,
    recurrenceType: "recurring",
    seriesId: series._id,
    billingCycle: initialCycleKey,
  });

  // Materialize any remaining due cycles up to horizon
  await generateDueOccurrencesForUser(userId, referenceDate);

  return { series: series.toObject(), primaryBill: primaryBill.toObject() };
}

/**
 * Updates a recurring bill occurrence with scope:
 * - "this": Updates only this single occurrence document.
 * - "future": Updates this occurrence, the parent series definition, and any
 *   future pending occurrences of that series. Preserves past/paid occurrences.
 */
export async function updateRecurringBillWithScope(
  userId: string,
  billId: string,
  updates: Partial<BillDocument> & { recurringDay?: number },
  updateScope: "this" | "future" = "this",
): Promise<BillDocument | null> {
  const bill = await Bill.findOne({ _id: billId, userId });
  if (!bill) {
    return null;
  }

  // If this is a one-time bill or no series attached, standard update
  if (!bill.seriesId || bill.recurrenceType !== "recurring" || updateScope === "this") {
    const updated = await Bill.findOneAndUpdate(
      { _id: billId, userId },
      { $set: updates },
      { new: true, runValidators: true },
    ).lean();
    return updated;
  }

  // updateScope === "future"
  // 1. Update this bill occurrence
  const updatedBill = await Bill.findOneAndUpdate(
    { _id: billId, userId },
    { $set: updates },
    { new: true, runValidators: true },
  ).lean();

  // 2. Resolve recurringDay if dueDate or recurringDay was updated
  let resolvedRecurringDay: number | undefined = undefined;
  if (
    typeof updates.recurringDay === "number" &&
    updates.recurringDay >= 1 &&
    updates.recurringDay <= 31
  ) {
    resolvedRecurringDay = updates.recurringDay;
  } else if (updates.dueDate) {
    const parsedDate =
      updates.dueDate instanceof Date
        ? updates.dueDate
        : new Date(updates.dueDate);
    if (!Number.isNaN(parsedDate.getTime())) {
      resolvedRecurringDay = parsedDate.getUTCDate();
    }
  }

  // 3. Update the parent RecurringSeries template
  const seriesUpdates: Record<string, unknown> = {};
  if (updates.name !== undefined) seriesUpdates.name = updates.name;
  if (updates.amount !== undefined) seriesUpdates.amount = updates.amount;
  if (updates.category !== undefined) seriesUpdates.category = updates.category;
  if (resolvedRecurringDay !== undefined) {
    seriesUpdates.recurringDay = resolvedRecurringDay;
  }

  if (Object.keys(seriesUpdates).length > 0) {
    await RecurringSeries.findOneAndUpdate(
      { _id: bill.seriesId, userId },
      { $set: seriesUpdates },
      { runValidators: true },
    );
  }

  // 4. Update existing future pending occurrences of this series (never touch paid records!)
  const futurePendingUpdates: Record<string, unknown> = {};
  if (updates.name !== undefined) futurePendingUpdates.name = updates.name;
  if (updates.amount !== undefined) futurePendingUpdates.amount = updates.amount;
  if (updates.category !== undefined) futurePendingUpdates.category = updates.category;

  if (resolvedRecurringDay !== undefined) {
    const futurePendingBills = await Bill.find({
      userId,
      seriesId: bill.seriesId,
      dueDate: { $gt: bill.dueDate },
      status: "pending",
    });

    for (const futureBill of futurePendingBills) {
      const year = futureBill.dueDate.getUTCFullYear();
      const monthIndex = futureBill.dueDate.getUTCMonth();
      const newDueDate = calculateOccurrenceDueDate(
        resolvedRecurringDay,
        year,
        monthIndex,
      );
      await Bill.updateOne(
        { _id: futureBill._id, userId },
        { $set: { ...futurePendingUpdates, dueDate: newDueDate } },
      );
    }
  } else if (Object.keys(futurePendingUpdates).length > 0) {
    await Bill.updateMany(
      {
        userId,
        seriesId: bill.seriesId,
        dueDate: { $gt: bill.dueDate },
        status: "pending",
      },
      { $set: futurePendingUpdates },
    );
  }

  return updatedBill;
}

/**
 * Deletes a recurring bill occurrence with scope:
 * - "this": Deletes this occurrence and marks the cycle as skipped in the series.
 * - "future": Stops the recurring series from this point forward.
 *   Never deletes any occurrence with status "paid".
 * - "all": Deletes the entire series and all its occurrences.
 */
export async function deleteRecurringBillWithScope(
  userId: string,
  billId: string,
  deleteScope: "this" | "future" | "all" = "this",
): Promise<boolean> {
  const bill = await Bill.findOne({ _id: billId, userId });
  if (!bill) {
    return false;
  }

  // If one-time bill, standard single deletion
  if (!bill.seriesId || bill.recurrenceType !== "recurring") {
    await Bill.findOneAndDelete({ _id: billId, userId });
    return true;
  }

  if (deleteScope === "all") {
    // Delete all occurrences and series
    await Bill.deleteMany({ seriesId: bill.seriesId, userId });
    await RecurringSeries.findOneAndDelete({ _id: bill.seriesId, userId });
    return true;
  }

  if (deleteScope === "future") {
    // Case A: The selected occurrence is paid
    if (bill.status === "paid") {
      // 1. Preserve this paid bill and all other paid bills.
      // 2. Delete only unpaid future occurrences strictly after this bill.
      await Bill.deleteMany({
        userId,
        seriesId: bill.seriesId,
        dueDate: { $gt: bill.dueDate },
        status: { $ne: "paid" },
      });
      // 3. End the series at this paid bill's due date
      await RecurringSeries.findOneAndUpdate(
        { _id: bill.seriesId, userId },
        { $set: { isActive: false, endDate: bill.dueDate } },
      );
      return true;
    }

    // Case B: The selected occurrence is unpaid (pending or overdue)
    // 1. Delete this unpaid bill and all future unpaid occurrences
    await Bill.deleteMany({
      userId,
      seriesId: bill.seriesId,
      dueDate: { $gte: bill.dueDate },
      status: { $ne: "paid" }, // Invariant: never delete any paid bill!
    });

    // 2. Mark this deleted cycle as skipped and set endDate before this occurrence
    // to prevent regeneration if the series is reactivated
    const previousDayUtc = new Date(bill.dueDate.getTime() - 86400000);
    const seriesUpdate: Record<string, unknown> = {
      isActive: false,
      endDate: previousDayUtc,
    };

    if (bill.billingCycle) {
      await RecurringSeries.findOneAndUpdate(
        { _id: bill.seriesId, userId },
        {
          $set: seriesUpdate,
          $addToSet: { skippedCycles: bill.billingCycle },
        },
      );
    } else {
      await RecurringSeries.findOneAndUpdate(
        { _id: bill.seriesId, userId },
        { $set: seriesUpdate },
      );
    }
    return true;
  }

  // deleteScope === "this"
  await Bill.findOneAndDelete({ _id: billId, userId });
  if (bill.billingCycle) {
    await RecurringSeries.findOneAndUpdate(
      { _id: bill.seriesId, userId },
      { $addToSet: { skippedCycles: bill.billingCycle } },
    );
  }
  return true;
}
