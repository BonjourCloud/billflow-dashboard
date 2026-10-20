import mongoose, { type InferSchemaType } from "mongoose";
import { z } from "zod";

export const PAYMENT_METHODS = [
  "cash",
  "debit_card",
  "credit_card",
  "upi",
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_STATUSES = [
  "completed",
  "failed",
  "refunded",
] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const paymentCreateSchema = z
  .object({
    amount: z
      .number()
      .positive("Amount must be a positive number.")
      .max(1_000_000_000, "Amount exceeds maximum allowed limit."),
    paymentDate: z
      .string()
      .trim()
      .min(1, "Payment date is required.")
      .refine(
        (val) => {
          const timestamp = Date.parse(val);
          return !Number.isNaN(timestamp);
        },
        { message: "Invalid date format. Expected a valid date string." },
      )
      .transform((val) => new Date(val)),
    method: z.enum(["cash", "debit_card", "credit_card", "upi"]),
    status: z.enum(["completed", "failed", "refunded"]).optional().default("completed"),
    reference: z
      .string()
      .trim()
      .max(100, "Reference must not exceed 100 characters.")
      .optional()
      .nullable(),
    notes: z
      .string()
      .trim()
      .max(500, "Notes must not exceed 500 characters.")
      .optional()
      .nullable(),
  })
  .strict();

export type PaymentCreateInput = z.infer<typeof paymentCreateSchema>;

const paymentSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    billId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Bill",
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      validate: {
        validator: (v: number) => typeof v === "number" && v > 0,
        message: "Amount must be a positive number.",
      },
    },
    paymentDate: {
      type: Date,
      required: true,
      validate: {
        validator: (v: unknown) =>
          v instanceof Date && !Number.isNaN(v.getTime()),
        message: "Payment date must be a valid date.",
      },
    },
    method: {
      type: String,
      required: true,
      enum: PAYMENT_METHODS,
    },
    status: {
      type: String,
      required: true,
      enum: PAYMENT_STATUSES,
      default: "completed",
    },
    reference: {
      type: String,
      trim: true,
      maxlength: 100,
      default: null,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 500,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

// Query index for retrieving bill payments sorted by payment date
paymentSchema.index({ userId: 1, billId: 1, paymentDate: -1, createdAt: -1 });

export type PaymentDocument = InferSchemaType<typeof paymentSchema>;

export function isValidPaymentId(id: string): boolean {
  return typeof id === "string" && mongoose.isValidObjectId(id);
}

export const Payment =
  mongoose.models.Payment || mongoose.model("Payment", paymentSchema);
