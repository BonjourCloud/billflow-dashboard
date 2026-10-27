import mongoose from "mongoose";
import { z } from "zod";

/** A monthly spending limit for one category (applies to every month). */
const budgetSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    category: { type: String, required: true, trim: true, maxlength: 40 },
    limit: {
      type: Number,
      required: true,
      validate: {
        validator: (v: number) => typeof v === "number" && v > 0,
        message: "Limit must be a positive number.",
      },
    },
  },
  { timestamps: true, versionKey: false },
);

budgetSchema.index({ userId: 1, category: 1 }, { unique: true });

export const Budget =
  mongoose.models.Budget || mongoose.model("Budget", budgetSchema);

export const budgetLimitSchema = z
  .object({
    limit: z
      .number()
      .positive("Limit must be a positive number.")
      .max(1_000_000_000, "Limit exceeds maximum allowed value."),
  })
  .strict();

export const BUDGET_METHODS = ["limits", "50-30-20"] as const;
export type BudgetMethod = (typeof BUDGET_METHODS)[number];

export const DEFAULT_BUDGET_SETTINGS = {
  method: "limits" as BudgetMethod,
  needsPct: 50,
  wantsPct: 30,
  savingsPct: 20,
  emiRatioWarnPct: 40,
};

const budgetSettingsSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, unique: true },
    method: { type: String, enum: BUDGET_METHODS, default: "limits" },
    needsPct: { type: Number, default: 50, min: 0, max: 100 },
    wantsPct: { type: Number, default: 30, min: 0, max: 100 },
    savingsPct: { type: Number, default: 20, min: 0, max: 100 },
    emiRatioWarnPct: { type: Number, default: 40, min: 1, max: 100 },
  },
  { timestamps: true, versionKey: false },
);

export const BudgetSettings =
  mongoose.models.BudgetSettings ||
  mongoose.model("BudgetSettings", budgetSettingsSchema);

export const budgetSettingsUpdateSchema = z
  .object({
    method: z.enum(BUDGET_METHODS),
    needsPct: z.number().int().min(0).max(100),
    wantsPct: z.number().int().min(0).max(100),
    savingsPct: z.number().int().min(0).max(100),
    emiRatioWarnPct: z.number().int().min(1).max(100),
  })
  .strict()
  .refine((d) => d.needsPct + d.wantsPct + d.savingsPct === 100, {
    message: "Needs, wants and savings must add up to 100.",
    path: ["needsPct"],
  });
