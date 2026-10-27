import mongoose from "mongoose";
import { z } from "zod";

/**
 * A savings goal: a named amount to set aside by a target date (a school-fee
 * fund, an emergency fund, a trip).
 *
 * `monthlyAmount` is the fixed monthly set-aside the user plans. It is
 * reserved in the Cash Flow card ("free to spend") for every month from
 * `startDate` to the target month, so it behaves like a planned bill.
 * `contributions` is a ledger of money the user has actually put aside; it
 * only measures progress and never changes Cash Flow (the plan already
 * reserved the money).
 */

/** Longest goal horizon accepted, in months. */
export const MAX_GOAL_MONTHS = 600;
/** Most contributions kept on one goal. */
export const MAX_CONTRIBUTIONS = 500;

const contributionSchema = new mongoose.Schema(
  {
    amount: {
      type: Number,
      required: true,
      validate: {
        validator: (v: number) => typeof v === "number" && v > 0,
        message: "Amount must be a positive number.",
      },
    },
    date: { type: Date, required: true },
    note: { type: String, trim: true, maxlength: 100, default: null },
  },
  { versionKey: false },
);

const goalSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    targetAmount: {
      type: Number,
      required: true,
      validate: {
        validator: (v: number) => typeof v === "number" && v > 0,
        message: "Target amount must be a positive number.",
      },
    },
    targetDate: { type: Date, required: true },
    // First day of the month the plan starts in (UTC).
    startDate: { type: Date, required: true },
    monthlyAmount: {
      type: Number,
      required: true,
      validate: {
        validator: (v: number) => typeof v === "number" && v > 0,
        message: "Monthly amount must be a positive number.",
      },
    },
    isActive: { type: Boolean, required: true, default: true },
    contributions: { type: [contributionSchema], default: [] },
  },
  { timestamps: true, versionKey: false },
);

export const Goal =
  mongoose.models.Goal || mongoose.model("Goal", goalSchema);

export function isValidGoalId(id: string): boolean {
  return mongoose.Types.ObjectId.isValid(id) && /^[0-9a-fA-F]{24}$/.test(id);
}

const monthIndex = (date: Date) =>
  date.getUTCFullYear() * 12 + date.getUTCMonth();

/** First day of the date's month, in UTC. */
export function startOfMonthUtc(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

/** Calendar months from start to target, both included (at least 1). */
export function goalMonths(startDate: Date, targetDate: Date): number {
  return Math.max(1, monthIndex(targetDate) - monthIndex(startDate) + 1);
}

/**
 * The monthly amount that reaches the target by the target month: the target
 * divided by the months available, rounded up to a whole rupee so the plan
 * never falls short.
 */
export function defaultMonthlyAmount(
  targetAmount: number,
  startDate: Date,
  targetDate: Date,
): number {
  return Math.ceil(targetAmount / goalMonths(startDate, targetDate));
}

export function savedAmountOf(goal: {
  contributions?: Array<{ amount: number }>;
}): number {
  const total = (goal.contributions ?? []).reduce((s, c) => s + c.amount, 0);
  return Math.round(total * 100) / 100;
}

const nameSchema = z
  .string()
  .trim()
  .min(1, "Goal name is required.")
  .max(100, "Goal name must not exceed 100 characters.");

const amountSchema = z
  .number()
  .positive("Amount must be a positive number.")
  .max(1_000_000_000, "Amount exceeds maximum allowed limit.");

const dateSchema = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required.`)
    .refine((val) => !Number.isNaN(Date.parse(val)), {
      message: `Invalid ${label.toLowerCase()}.`,
    })
    .transform((val) => new Date(val));

export const createGoalSchema = z
  .object({
    name: nameSchema,
    targetAmount: amountSchema,
    targetDate: dateSchema("Target date"),
    startDate: dateSchema("Start date").optional(),
    monthlyAmount: amountSchema.optional(),
  })
  .strict();

export const updateGoalSchema = z
  .object({
    name: nameSchema.optional(),
    targetAmount: amountSchema.optional(),
    targetDate: dateSchema("Target date").optional(),
    monthlyAmount: amountSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "No fields to update.",
  });

export const createContributionSchema = z
  .object({
    amount: amountSchema,
    date: dateSchema("Date").optional(),
    note: z
      .string()
      .trim()
      .max(100, "Note must not exceed 100 characters.")
      .optional(),
  })
  .strict();
