import mongoose from "mongoose";
import { Bill } from "../models/Bill.js";
import { BillNote } from "../models/BillNote.js";
import { Budget, BudgetSettings } from "../models/Budget.js";
import { Category, DEFAULT_CATEGORIES } from "../models/Category.js";
import { Goal } from "../models/Goal.js";
import { IncomeSource } from "../models/IncomeSource.js";
import {
  InstallmentPlan,
  calculateInstallmentPlanTotals,
} from "../models/InstallmentPlan.js";
import { Notification } from "../models/Notification.js";
import { Payment, type PaymentMethod } from "../models/Payment.js";
import { RecurringSeries } from "../models/RecurringSeries.js";
import { User } from "../models/User.js";
import {
  calculateOccurrenceDueDate,
  getBillingCycleKey,
} from "./recurrenceService.js";

/**
 * Demo account: one dedicated Clerk user (DEMO_CLERK_USER_ID) whose data is
 * wiped and re-created from a fixed, realistic dataset. Dates are relative to
 * "now", so the demo always looks current. The dataset touches every feature:
 * income (counted, uncounted, one-time), savings goals (on track, behind,
 * funded, paused), recurring bills and subscriptions
 * (including a cancelled one), installment plans (active and completed),
 * paid / partly paid / overdue / due-soon bills, notes, budgets in every
 * status, and the needs/wants/savings split.
 */

/** Re-seed automatically when the demo data is older than this. */
export const DEMO_MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** Ignore reset requests that arrive right after a reset. */
export const DEMO_RESET_COOLDOWN_MS = 10 * 1000;

export function getDemoUserId(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const id = (env.DEMO_CLERK_USER_ID ?? "").trim();
  return /^user_[A-Za-z0-9]+$/.test(id) ? id : null;
}

export function isDemoUser(
  userId: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const demoId = getDemoUserId(env);
  return Boolean(userId && demoId && userId === demoId);
}

type BillDoc = {
  _id: mongoose.Types.ObjectId;
  userId: string;
  name: string;
  amount: number;
  dueDate: Date;
  status: "paid" | "pending" | "overdue";
  category: string;
  isSubscription: boolean;
  recurrenceType: "one_time" | "recurring";
  seriesId?: mongoose.Types.ObjectId;
  billingCycle?: string;
  planId?: mongoose.Types.ObjectId;
  installmentNumber?: number;
  totalInstallments?: number;
};

export interface DemoDataset {
  series: Array<Record<string, unknown>>;
  plans: Array<Record<string, unknown>>;
  bills: BillDoc[];
  payments: Array<Record<string, unknown>>;
  notes: Array<Record<string, unknown>>;
  income: Array<Record<string, unknown>>;
  budgets: Array<{ userId: string; category: string; limit: number }>;
  goals: Array<Record<string, unknown>>;
  settings: Record<string, unknown>;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const METHODS: PaymentMethod[] = ["upi", "debit_card", "credit_card", "cash"];

function utcMidnight(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/** Year and month index for `base` shifted by `offset` months. */
function shiftMonth(base: Date, offset: number): { year: number; month: number } {
  const total = base.getUTCFullYear() * 12 + base.getUTCMonth() + offset;
  return { year: Math.floor(total / 12), month: total % 12 };
}

function dueOn(base: Date, monthOffset: number, day: number): Date {
  const { year, month } = shiftMonth(base, monthOffset);
  return calculateOccurrenceDueDate(day, year, month);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Builds the demo dataset for `userId` as plain objects with pre-assigned ids.
 * Pure: no database access, so it can be tested directly.
 */
export function buildDemoDataset(userId: string, now: Date): DemoDataset {
  const today = utcMidnight(now);
  const bills: BillDoc[] = [];
  const payments: Array<Record<string, unknown>> = [];
  const notes: Array<Record<string, unknown>> = [];
  let methodIndex = 0;

  const statusFor = (due: Date, paid: boolean): BillDoc["status"] =>
    paid ? "paid" : due.getTime() < today ? "overdue" : "pending";

  const recordPayment = (
    bill: BillDoc,
    amount: number,
    note: string | null = null,
  ) => {
    payments.push({
      userId,
      billId: bill._id,
      amount,
      paymentDate: new Date(Math.min(bill.dueDate.getTime(), today)),
      method: METHODS[methodIndex++ % METHODS.length],
      status: "completed",
      reference: null,
      notes: note,
      idempotencyKey: null,
    });
  };

  // ---- Recurring series (subscriptions and monthly bills) -----------------
  interface SeriesSpec {
    name: string;
    amount: number;
    category: string;
    day: number;
    startOffset: number; // months before the current month
    cancelledAfter?: number; // last month offset that still billed
    partiallyPaid?: number; // current-month payment less than the amount
    note?: string;
  }
  const seriesSpecs: SeriesSpec[] = [
    { name: "Rent", amount: 20000, category: "housing", day: 5, startOffset: 5, note: "Paid by UPI to the landlord. Receipt saved in Drive." },
    { name: "Electricity", amount: 2800, category: "utilities", day: 12, startOffset: 5, partiallyPaid: 1000, note: "Paid part now, rest after the meter reading." },
    { name: "Water & maintenance", amount: 1500, category: "utilities", day: 8, startOffset: 5 },
    { name: "Broadband", amount: 999, category: "utilities", day: 15, startOffset: 5 },
    { name: "Mobile recharge", amount: 599, category: "utilities", day: 18, startOffset: 5 },
    { name: "Health insurance", amount: 2400, category: "insurance", day: 10, startOffset: 5 },
    { name: "Gym membership", amount: 1800, category: "health", day: 3, startOffset: 5 },
    { name: "Netflix", amount: 649, category: "entertainment", day: 21, startOffset: 5 },
    { name: "Spotify", amount: 119, category: "entertainment", day: 21, startOffset: 5 },
    { name: "Cloud storage", amount: 130, category: "software", day: 25, startOffset: 5 },
    { name: "Mutual fund SIP", amount: 10000, category: "savings", day: 7, startOffset: 5 },
    { name: "Recurring deposit", amount: 5000, category: "savings", day: 7, startOffset: 5 },
    { name: "Old magazine (cancelled)", amount: 299, category: "entertainment", day: 14, startOffset: 5, cancelledAfter: -2 },
  ];

  const series = seriesSpecs.map((spec) => {
    const seriesId = new mongoose.Types.ObjectId();
    const startDate = dueOn(now, -spec.startOffset, spec.day);
    const lastOffset = spec.cancelledAfter ?? 1; // generate up to next month
    const cancelled = spec.cancelledAfter !== undefined;

    for (let offset = -spec.startOffset; offset <= lastOffset; offset++) {
      const due = dueOn(now, offset, spec.day);
      const { year, month } = shiftMonth(now, offset);
      const isCurrent = offset === 0;
      const partial = isCurrent && spec.partiallyPaid !== undefined;
      const paid = !partial && due.getTime() <= today;
      const bill: BillDoc = {
        _id: new mongoose.Types.ObjectId(),
        userId,
        name: spec.name,
        amount: spec.amount,
        dueDate: due,
        status: statusFor(due, paid),
        category: spec.category,
        isSubscription: true,
        recurrenceType: "recurring",
        seriesId,
        billingCycle: getBillingCycleKey(year, month),
      };
      bills.push(bill);
      if (paid) recordPayment(bill, spec.amount);
      if (partial) recordPayment(bill, spec.partiallyPaid as number, "Part payment");
      if (isCurrent && spec.note) {
        notes.push({ userId, billId: bill._id, text: spec.note });
      }
    }

    return {
      _id: seriesId,
      userId,
      name: spec.name,
      amount: spec.amount,
      category: spec.category,
      frequency: "monthly",
      recurringDay: spec.day,
      startDate,
      endDate: cancelled ? dueOn(now, spec.cancelledAfter as number, spec.day) : null,
      isActive: !cancelled,
      skippedCycles: [],
    };
  });

  // ---- One-time bills this month and around it ---------------------------
  interface OneTime {
    name: string;
    amount: number;
    category: string;
    monthOffset?: number;
    day?: number;
    dayOffset?: number; // relative to today (overrides month/day)
    note?: string;
  }
  const oneTime: OneTime[] = [
    { name: "Groceries · week 1", amount: 2250, category: "groceries", day: 4 },
    { name: "Groceries · week 2", amount: 2250, category: "groceries", day: 11 },
    { name: "Groceries · week 3", amount: 2250, category: "groceries", day: 18 },
    { name: "Groceries · week 4", amount: 2250, category: "groceries", day: 25 },
    { name: "Fuel", amount: 2000, category: "transport", day: 6 },
    { name: "Fuel (top-up)", amount: 2000, category: "transport", day: 20 },
    { name: "Metro card recharge", amount: 1000, category: "transport", day: 2 },
    { name: "Dining out", amount: 1500, category: "entertainment", day: 14 },
    { name: "Weekend family dinner", amount: 2000, category: "entertainment", day: 22 },
    { name: "Water tanker", amount: 1200, category: "utilities", dayOffset: -3 },
    { name: "Credit card bill", amount: 6000, category: "finance", dayOffset: 2 },
  ];
  for (const spec of oneTime) {
    const due =
      spec.dayOffset !== undefined
        ? new Date(today + spec.dayOffset * DAY_MS)
        : dueOn(now, spec.monthOffset ?? 0, spec.day ?? 1);
    // Bills dated before today are paid, except the deliberate overdue one.
    const paid = due.getTime() <= today && spec.name !== "Water tanker";
    const bill: BillDoc = {
      _id: new mongoose.Types.ObjectId(),
      userId,
      name: spec.name,
      amount: spec.amount,
      dueDate: due,
      status: statusFor(due, paid),
      category: spec.category,
      isSubscription: false,
      recurrenceType: "one_time",
    };
    bills.push(bill);
    if (paid) recordPayment(bill, spec.amount);
    if (spec.note) notes.push({ userId, billId: bill._id, text: spec.note });
  }

  // ---- Installment plans ---------------------------------------------------
  interface PlanSpec {
    name: string;
    planType: "car_loan" | "credit_card_emi" | "personal_loan" | "other";
    category: string;
    principal: number;
    installments: number;
    startOffset: number;
    day: number;
  }
  const planSpecs: PlanSpec[] = [
    { name: "Laptop EMI", planType: "personal_loan", category: "loans", principal: 180000, installments: 24, startOffset: -8, day: 10 },
    { name: "Phone EMI", planType: "credit_card_emi", category: "loans", principal: 30000, installments: 6, startOffset: -10, day: 15 },
  ];
  const plans = planSpecs.map((spec) => {
    const planId = new mongoose.Types.ObjectId();
    const totals = calculateInstallmentPlanTotals({
      principalAmount: spec.principal,
      totalInstallments: spec.installments,
      interestRate: 0,
    });
    const startDate = dueOn(now, spec.startOffset, spec.day);
    let totalPaid = 0;

    for (let k = 1; k <= spec.installments; k++) {
      const due = dueOn(now, spec.startOffset + (k - 1), spec.day);
      const isFinal = k === spec.installments;
      const amount = isFinal
        ? round2(totals.baseInstallmentAmount + totals.roundingDifference)
        : totals.baseInstallmentAmount;
      const paid = due.getTime() <= today;
      const bill: BillDoc = {
        _id: new mongoose.Types.ObjectId(),
        userId,
        name: `${spec.name} (${k}/${spec.installments})`,
        amount,
        dueDate: due,
        status: statusFor(due, paid),
        category: spec.category,
        isSubscription: false,
        recurrenceType: "one_time",
        planId,
        installmentNumber: k,
        totalInstallments: spec.installments,
      };
      bills.push(bill);
      if (paid) {
        recordPayment(bill, amount);
        totalPaid = round2(totalPaid + amount);
      }
    }

    const remaining = Math.max(0, round2(totals.scheduledTotal - totalPaid));
    return {
      _id: planId,
      userId,
      name: spec.name,
      planType: spec.planType,
      category: spec.category,
      principalAmount: spec.principal,
      downPayment: 0,
      financedAmount: totals.financedAmount,
      totalInstallments: spec.installments,
      interestRate: 0,
      totalInterest: totals.totalInterest,
      scheduledTotal: totals.scheduledTotal,
      installmentAmount: totals.baseInstallmentAmount,
      startDate,
      recurringDay: spec.day,
      totalPaid,
      remainingBalance: remaining,
      status: remaining <= 0 ? "completed" : "active",
      idempotencyKey: null,
    };
  });

  // ---- Income -------------------------------------------------------------
  const receivedCycles = (day: number, startOffset: number): string[] => {
    const cycles: string[] = [];
    for (let offset = -startOffset; offset <= 0; offset++) {
      if (dueOn(now, offset, day).getTime() <= today) {
        const { year, month } = shiftMonth(now, offset);
        cycles.push(getBillingCycleKey(year, month));
      }
    }
    return cycles;
  };
  const income = [
    {
      userId,
      name: "Salary",
      amount: 100000,
      frequency: "monthly",
      recurringDay: 1,
      startDate: dueOn(now, -6, 1),
      endDate: null,
      isActive: true,
      countInPlan: true,
      receivedCycles: receivedCycles(1, 6),
    },
    {
      userId,
      name: "Freelance design work",
      amount: 12000,
      frequency: "monthly",
      recurringDay: 20,
      startDate: dueOn(now, -4, 20),
      endDate: null,
      isActive: true,
      countInPlan: false, // irregular: listed but not counted in the plan
      receivedCycles: receivedCycles(20, 4),
    },
    {
      userId,
      name: "Diwali bonus",
      amount: 20000,
      frequency: "one_time",
      recurringDay: 12,
      startDate: dueOn(now, 1, 12),
      endDate: null,
      isActive: true,
      countInPlan: true,
      receivedCycles: [],
    },
  ];

  // ---- Savings goals ------------------------------------------------------
  // One goal in each state: on track, behind plan, funded and paused.
  interface GoalSpec {
    name: string;
    targetAmount: number;
    startOffset: number;
    targetOffset: number;
    targetDay: number;
    isActive: boolean;
    // Month offsets (relative to now) on which a monthly set-aside was recorded.
    contributedOffsets: number[];
    contributionAmount: number;
  }
  const goalSpecs: GoalSpec[] = [
    // ₹1,35,000 over 12 months = ₹11,250 a month, saved on schedule.
    { name: "School fee fund", targetAmount: 135000, startOffset: -2, targetOffset: 9, targetDay: 5, isActive: true, contributedOffsets: [-2, -1], contributionAmount: 11250 },
    // ₹24,000 over 6 months = ₹4,000 a month, one month's set-aside missed.
    { name: "Goa trip", targetAmount: 24000, startOffset: -1, targetOffset: 4, targetDay: 20, isActive: true, contributedOffsets: [-1], contributionAmount: 2000 },
    // Finished: every month's ₹6,000 was set aside.
    { name: "New phone fund", targetAmount: 30000, startOffset: -5, targetOffset: -1, targetDay: 15, isActive: true, contributedOffsets: [-5, -4, -3, -2, -1], contributionAmount: 6000 },
    // Switched off ("In plan" toggle), so it reserves nothing.
    { name: "Bike down payment", targetAmount: 40000, startOffset: 0, targetOffset: 7, targetDay: 28, isActive: false, contributedOffsets: [], contributionAmount: 0 },
  ];
  const goals = goalSpecs.map((spec) => {
    const start = shiftMonth(now, spec.startOffset);
    const startDate = new Date(Date.UTC(start.year, start.month, 1));
    const targetDate = dueOn(now, spec.targetOffset, spec.targetDay);
    const months = Math.max(
      1,
      spec.targetOffset - spec.startOffset + 1,
    );
    return {
      _id: new mongoose.Types.ObjectId(),
      userId,
      name: spec.name,
      targetAmount: spec.targetAmount,
      targetDate,
      startDate,
      monthlyAmount: Math.ceil(spec.targetAmount / months),
      isActive: spec.isActive,
      contributions: spec.contributedOffsets.map((offset) => ({
        _id: new mongoose.Types.ObjectId(),
        amount: spec.contributionAmount,
        date: dueOn(now, offset, 8),
        note: "Monthly set-aside",
      })),
    };
  });

  // ---- Budgets ------------------------------------------------------------
  // Chosen so the Budgets tab shows every status: ok, warn and over.
  const budgets = [
    { category: "groceries", limit: 12000 }, // ok
    { category: "utilities", limit: 8000 }, // warn
    { category: "entertainment", limit: 4000 }, // over
    { category: "transport", limit: 5000 }, // warn
    { category: "housing", limit: 20000 }, // warn
    { category: "loans", limit: 8000 }, // warn
    { category: "health", limit: 3000 }, // ok
    { category: "savings", limit: 15000 },
  ].map((b) => ({ userId, ...b }));

  const settings = {
    userId,
    method: "50-30-20",
    needsPct: 50,
    wantsPct: 30,
    savingsPct: 20,
    emiRatioWarnPct: 40,
  };

  return { series, plans, bills, payments, notes, income, budgets, goals, settings };
}

/** Makes sure a Savings category exists so saved money is counted as saved. */
async function ensureDemoCategories(): Promise<void> {
  const total = await Category.countDocuments();
  if (total === 0) {
    await Category.bulkWrite(
      DEFAULT_CATEGORIES.map((c) => ({
        updateOne: {
          filter: { slug: c.slug },
          update: { $setOnInsert: { ...c, is_active: true } },
          upsert: true,
        },
      })),
      { ordered: false },
    );
    return;
  }
  const savings = DEFAULT_CATEGORIES.find((c) => c.slug === "savings");
  const hasSavingsKind = await Category.exists({
    kind: "savings",
    is_active: true,
  });
  if (savings && !hasSavingsKind) {
    await Category.updateOne(
      { slug: savings.slug },
      { $setOnInsert: { ...savings, is_active: true } },
      { upsert: true },
    );
  }
}

let resetInFlight: Promise<void> | null = null;

/**
 * Deletes everything the demo user owns and re-creates the dataset.
 * Concurrent calls share one run.
 */
export async function resetDemoData(
  userId: string,
  now: Date = new Date(),
): Promise<DemoDataset> {
  const dataset = buildDemoDataset(userId, now);

  const run = async () => {
    await ensureDemoCategories();
    await Promise.all([
      Bill.deleteMany({ userId }),
      Payment.deleteMany({ userId }),
      BillNote.deleteMany({ userId }),
      Notification.deleteMany({ userId }),
      RecurringSeries.deleteMany({ userId }),
      InstallmentPlan.deleteMany({ userId }),
      IncomeSource.deleteMany({ userId }),
      Budget.deleteMany({ userId }),
      Goal.deleteMany({ userId }),
      BudgetSettings.deleteMany({ userId }),
    ]);

    await RecurringSeries.insertMany(dataset.series);
    await InstallmentPlan.insertMany(dataset.plans);
    await Bill.insertMany(dataset.bills);
    await Payment.insertMany(dataset.payments);
    await BillNote.insertMany(dataset.notes);
    await IncomeSource.insertMany(dataset.income);
    await Budget.insertMany(dataset.budgets);
    await Goal.insertMany(dataset.goals);
    await BudgetSettings.create(dataset.settings);

    await User.updateOne(
      { clerkUserId: userId },
      { $set: { demoSeededAt: now }, $setOnInsert: { role: "user" } },
      { upsert: true },
    );
  };

  while (resetInFlight) await resetInFlight.catch(() => undefined);
  resetInFlight = run();
  try {
    await resetInFlight;
  } finally {
    resetInFlight = null;
  }
  return dataset;
}

/** Re-seeds when the demo data was never created or is older than a day. */
export async function ensureFreshDemo(
  userId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const user = await User.findOne({ clerkUserId: userId })
    .select("demoSeededAt")
    .lean();
  const seededAt = user?.demoSeededAt
    ? new Date(user.demoSeededAt).getTime()
    : 0;
  if (now.getTime() - seededAt < DEMO_MAX_AGE_MS) return false;
  await resetDemoData(userId, now);
  return true;
}

/** True when a reset happened moments ago, so another one should be skipped. */
export async function demoWasJustReset(
  userId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const user = await User.findOne({ clerkUserId: userId })
    .select("demoSeededAt")
    .lean();
  const seededAt = user?.demoSeededAt
    ? new Date(user.demoSeededAt).getTime()
    : 0;
  return now.getTime() - seededAt < DEMO_RESET_COOLDOWN_MS;
}
