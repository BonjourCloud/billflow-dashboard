import mongoose, { type InferSchemaType } from "mongoose";
import { z } from "zod";

const pricingTierSchema = new mongoose.Schema(
  {
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 60,
    },
    price_monthly: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    price_yearly: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    billing_period: {
      type: String,
      required: true,
      enum: ["month", "year", "forever"],
      default: "month",
    },
    cta_label: {
      type: String,
      required: true,
      trim: true,
      default: "Get Started",
      maxlength: 40,
    },
    is_highlighted: {
      type: Boolean,
      required: true,
      default: false,
    },
    is_visible: {
      type: Boolean,
      required: true,
      default: true,
      index: true,
    },
    sort_order: {
      type: Number,
      required: true,
      default: 0,
      index: true,
    },
    features: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

export type PricingTierDocument = InferSchemaType<typeof pricingTierSchema>;

export const PricingTier =
  mongoose.models.PricingTier ||
  mongoose.model("PricingTier", pricingTierSchema);

export const DEFAULT_PRICING_TIERS = [
  {
    slug: "free",
    name: "Free",
    price_monthly: 0,
    price_yearly: 0,
    billing_period: "forever",
    cta_label: "Get Started",
    is_highlighted: false,
    is_visible: true,
    sort_order: 1,
    features: [
      "Up to 10 bills",
      "Basic analytics",
      "Email reminders",
      "Mobile app",
    ],
  },
  {
    slug: "pro",
    name: "Pro",
    price_monthly: 9,
    price_yearly: 90,
    billing_period: "month",
    cta_label: "Start Free Trial",
    is_highlighted: true,
    is_visible: true,
    sort_order: 2,
    features: [
      "Unlimited bills",
      "AI insights",
      "Smart alerts",
      "Export reports",
      "Priority support",
    ],
  },
  {
    slug: "enterprise",
    name: "Enterprise",
    price_monthly: 29,
    price_yearly: 290,
    billing_period: "month",
    cta_label: "Contact Sales",
    is_highlighted: false,
    is_visible: true,
    sort_order: 3,
    features: [
      "Everything in Pro",
      "Team sharing",
      "API access",
      "Custom integrations",
      "Dedicated support",
    ],
  },
];

export async function seedPricingTiersIfEmpty(): Promise<void> {
  const count = await PricingTier.countDocuments();
  if (count === 0) {
    await PricingTier.insertMany(DEFAULT_PRICING_TIERS);
  }
}

export const createPricingTierSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1, "Slug is required.")
    .max(40, "Slug cannot exceed 40 characters.")
    .regex(
      /^[a-z0-9-]+$/,
      "Slug must contain only lowercase letters, numbers, and hyphens.",
    ),
  name: z
    .string()
    .trim()
    .min(1, "Name is required.")
    .max(60, "Name cannot exceed 60 characters."),
  price_monthly: z
    .number()
    .min(0, "Monthly price cannot be negative.")
    .max(99999, "Monthly price cannot exceed $99,999."),
  price_yearly: z
    .number()
    .min(0, "Yearly price cannot be negative.")
    .max(999999, "Yearly price cannot exceed $999,999."),
  billing_period: z.enum(["month", "year", "forever"]),
  cta_label: z
    .string()
    .trim()
    .min(1, "CTA label is required.")
    .max(40, "CTA label cannot exceed 40 characters."),
  is_highlighted: z.boolean().default(false),
  is_visible: z.boolean().default(true),
  sort_order: z
    .number()
    .int("Sort order must be an integer.")
    .min(0, "Sort order cannot be negative.")
    .max(999, "Sort order cannot exceed 999.")
    .default(0),
  features: z
    .array(
      z
        .string()
        .trim()
        .min(1, "Feature item cannot be empty.")
        .max(120, "Feature item cannot exceed 120 characters."),
    )
    .max(20, "A tier can have at most 20 features.")
    .default([]),
});

export const updatePricingTierSchema = createPricingTierSchema.partial();
