import mongoose from "mongoose";
import { z } from "zod";

/**
 * A source of income (salary, rent received, a one-off bonus...). Monthly
 * sources repeat on `recurringDay`; one-time sources fall on `startDate`.
 * Occurrences are computed on the fly, never stored, so there is nothing to
 * generate or clean up. `receivedCycles` records which "YYYY-MM" occurrences
 * the user has marked as received.
 */

export const INCOME_FREQUENCIES = ["monthly", "one_time"] as const;
export type IncomeFrequency = (typeof INCOME_FREQUENCIES)[number];

const CYCLE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

const incomeSourceSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    amount: {
      type: Number,
      required: true,
      validate: {
        validator: (v: number) => typeof v === "number" && v > 0,
        message: "Amount must be a positive number.",
      },
    },
    frequency: { type: String, required: true, enum: INCOME_FREQUENCIES },
    recurringDay: { type: Number, required: true, min: 1, max: 31 },
    startDate: { type: Date, required: true },
    endDate: { type: Date, default: null },
    isActive: { type: Boolean, required: true, default: true },
    // false = listed but left out of the plan (irregular income).
    countInPlan: { type: Boolean, required: true, default: true },
    receivedCycles: { type: [String], default: [] },
  },
  { timestamps: true, versionKey: false },
);

export const IncomeSource =
  mongoose.models.IncomeSource ||
  mongoose.model("IncomeSource", incomeSourceSchema);

export function isValidIncomeId(id: string): boolean {
  return mongoose.Types.ObjectId.isValid(id) && /^[0-9a-fA-F]{24}$/.test(id);
}

const nameSchema = z
  .string()
  .trim()
  .min(1, "Income name is required.")
  .max(100, "Income name must not exceed 100 characters.");

const amountSchema = z
  .number()
  .positive("Amount must be a positive number.")
  .max(1_000_000_000, "Amount exceeds maximum allowed limit.");

const dateSchema = z
  .string()
  .trim()
  .min(1, "Date is required.")
  .refine((val) => !Number.isNaN(Date.parse(val)), {
    message: "Invalid date format. Expected a valid date string.",
  })
  .transform((val) => new Date(val));

const endDateSchema = z
  .string()
  .trim()
  .refine((val) => !Number.isNaN(Date.parse(val)), {
    message: "Invalid end date.",
  })
  .transform((val) => new Date(val))
  .nullable();

export const createIncomeSchema = z
  .object({
    name: nameSchema,
    amount: amountSchema,
    frequency: z.enum(INCOME_FREQUENCIES),
    startDate: dateSchema,
    recurringDay: z.number().int().min(1).max(31).optional(),
    endDate: endDateSchema.optional(),
    countInPlan: z.boolean().optional(),
  })
  .strict();

export const updateIncomeSchema = z
  .object({
    name: nameSchema.optional(),
    amount: amountSchema.optional(),
    frequency: z.enum(INCOME_FREQUENCIES).optional(),
    startDate: dateSchema.optional(),
    recurringDay: z.number().int().min(1).max(31).optional(),
    endDate: endDateSchema.optional(),
    isActive: z.boolean().optional(),
    countInPlan: z.boolean().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "No fields to update.",
  });

export const incomeReceivedSchema = z
  .object({
    cycle: z.string().regex(CYCLE_PATTERN, "Cycle must look like YYYY-MM."),
    received: z.boolean(),
  })
  .strict();
