import mongoose, { type InferSchemaType } from "mongoose";
import {
  CATEGORY_SLUG_PATTERN,
  DEFAULT_CATEGORY_SLUGS,
  categorySlugSchema,
} from "./Category.js";
import { z } from "zod";

export const PLAN_TYPES = [
  "car_loan",
  "credit_card_emi",
  "personal_loan",
  "other",
] as const;

export type PlanType = (typeof PLAN_TYPES)[number];

export const PLAN_STATUSES = [
  "active",
  "completed",
  "cancelled",
] as const;

export type PlanStatus = (typeof PLAN_STATUSES)[number];

/** Built-in category slugs. Live categories are managed in the database (see Category model). */
export const PLAN_CATEGORIES = DEFAULT_CATEGORY_SLUGS;

export type PlanCategory = string;

/**
 * Calculates installment plan financial metrics using a simple flat-interest
 * calculation (I = P * r * t), which is standard for consumer retail EMIs
 * and credit card installment conversions.
 *
 * NOTE: This is a flat-interest calculation, NOT reducing-balance loan amortization.
 * Rounding is performed with 2-decimal-place precision to eliminate floating-point drift:
 *
 * 1. financedAmount = principalAmount - downPayment
 * 2. totalInterest = financedAmount * (interestRate / 100) * (totalInstallments / 12)
 * 3. scheduledTotal = financedAmount + totalInterest
 * 4. baseInstallmentAmount = floor((scheduledTotal / totalInstallments) * 100) / 100
 * 5. roundingDifference = scheduledTotal - (baseInstallmentAmount * totalInstallments)
 */
export function calculateInstallmentPlanTotals(params: {
  principalAmount: number;
  downPayment?: number;
  totalInstallments: number;
  interestRate?: number;
}): {
  financedAmount: number;
  totalInterest: number;
  scheduledTotal: number;
  baseInstallmentAmount: number;
  roundingDifference: number;
} {
  const principal = Math.round(params.principalAmount * 100) / 100;
  const down = Math.round((params.downPayment ?? 0) * 100) / 100;
  const financedAmount = Math.round((principal - down) * 100) / 100;

  if (financedAmount <= 0) {
    throw new Error(
      "Down payment cannot be greater than or equal to the principal amount.",
    );
  }

  const rate = params.interestRate ?? 0;
  const totalInterest =
    rate > 0
      ? Math.round(
          financedAmount * (rate / 100) * (params.totalInstallments / 12) * 100,
        ) / 100
      : 0;

  const scheduledTotal = Math.round((financedAmount + totalInterest) * 100) / 100;
  const baseInstallmentAmount =
    Math.floor((scheduledTotal / params.totalInstallments) * 100) / 100;
  const roundingDifference =
    Math.round(
      (scheduledTotal - baseInstallmentAmount * params.totalInstallments) * 100,
    ) / 100;

  return {
    financedAmount,
    totalInterest,
    scheduledTotal,
    baseInstallmentAmount,
    roundingDifference,
  };
}

export const installmentPlanCreateSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Plan name is required.")
      .max(100, "Plan name must not exceed 100 characters."),
    planType: z.enum(PLAN_TYPES).optional().default("other"),
    category: categorySlugSchema.optional(),
    principalAmount: z
      .number()
      .positive("Principal amount must be a positive number.")
      .max(100_000_000, "Principal amount exceeds maximum allowed limit."),
    downPayment: z
      .number()
      .min(0, "Down payment cannot be negative.")
      .max(100_000_000, "Down payment exceeds maximum allowed limit.")
      .optional()
      .default(0),
    totalInstallments: z
      .number()
      .int("Total installments must be a whole integer.")
      .min(2, "An installment plan must have at least 2 installments.")
      .max(120, "Total installments cannot exceed 120."),
    interestRate: z
      .number()
      .min(0, "Interest rate cannot be negative.")
      .max(100, "Interest rate cannot exceed 100%.")
      .optional()
      .default(0),
    startDate: z
      .string()
      .trim()
      .min(1, "Start date is required.")
      .refine(
        (val) => {
          const timestamp = Date.parse(val);
          return !Number.isNaN(timestamp);
        },
        { message: "Invalid date format. Expected a valid date string." },
      )
      .transform((val) => new Date(val)),
    recurringDay: z.number().int().min(1).max(31).optional(),
    idempotencyKey: z
      .string()
      .trim()
      .min(1, "Idempotency key must not be empty.")
      .max(128, "Idempotency key must not exceed 128 characters.")
      .optional()
      .nullable(),
  })
  .strict()
  .refine(
    (data) => (data.downPayment ?? 0) < data.principalAmount,
    {
      message: "Down payment must be less than principal amount.",
      path: ["downPayment"],
    },
  );

export type InstallmentPlanCreateInput = z.infer<
  typeof installmentPlanCreateSchema
>;

export const installmentPlanUpdateSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Plan name is required.")
      .max(100, "Plan name must not exceed 100 characters.")
      .optional(),
    category: categorySlugSchema.optional(),
    planType: z.enum(PLAN_TYPES).optional(),
  })
  .strict();

export type InstallmentPlanUpdateInput = z.infer<
  typeof installmentPlanUpdateSchema
>;

const installmentPlanSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    planType: {
      type: String,
      required: true,
      enum: PLAN_TYPES,
      default: "other",
    },
    category: {
      type: String,
      required: true,
      match: CATEGORY_SLUG_PATTERN,
      default: "finance",
    },
    principalAmount: {
      type: Number,
      required: true,
      validate: {
        validator: (v: number) => typeof v === "number" && v > 0,
        message: "Principal amount must be a positive number.",
      },
    },
    downPayment: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    financedAmount: {
      type: Number,
      required: true,
      validate: {
        validator: (v: number) => typeof v === "number" && v > 0,
        message: "Financed amount must be a positive number.",
      },
    },
    totalInstallments: {
      type: Number,
      required: true,
      min: 2,
      max: 120,
    },
    interestRate: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      max: 100,
    },
    totalInterest: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    scheduledTotal: {
      type: Number,
      required: true,
      validate: {
        validator: (v: number) => typeof v === "number" && v > 0,
        message: "Scheduled total must be a positive number.",
      },
    },
    installmentAmount: {
      type: Number,
      required: true,
      validate: {
        validator: (v: number) => typeof v === "number" && v > 0,
        message: "Installment amount must be a positive number.",
      },
    },
    startDate: {
      type: Date,
      required: true,
      validate: {
        validator: (v: unknown) =>
          v instanceof Date && !Number.isNaN(v.getTime()),
        message: "Start date must be a valid date.",
      },
    },
    recurringDay: {
      type: Number,
      required: true,
      min: 1,
      max: 31,
    },
    totalPaid: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    remainingBalance: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      required: true,
      enum: PLAN_STATUSES,
      default: "active",
      index: true,
    },
    idempotencyKey: {
      type: String,
      trim: true,
      maxlength: 128,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

installmentPlanSchema.index({ userId: 1, status: 1, createdAt: -1 });

// Unique sparse partial index on idempotencyKey per user
installmentPlanSchema.index(
  { userId: 1, idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: {
      idempotencyKey: { $type: "string" },
    },
  },
);

export type InstallmentPlanDocument = InferSchemaType<
  typeof installmentPlanSchema
>;

export function isValidPlanId(id: string): boolean {
  return typeof id === "string" && mongoose.isValidObjectId(id);
}

export const InstallmentPlan =
  mongoose.models.InstallmentPlan ||
  mongoose.model("InstallmentPlan", installmentPlanSchema);
