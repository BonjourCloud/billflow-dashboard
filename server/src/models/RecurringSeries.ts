import mongoose, { type InferSchemaType } from "mongoose";

const recurringSeriesSchema = new mongoose.Schema(
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
    amount: {
      type: Number,
      required: true,
      validate: {
        validator: (v: number) => typeof v === "number" && v > 0,
        message: "Amount must be a positive number.",
      },
    },
    category: {
      type: String,
      required: true,
      enum: [
        "utilities",
        "entertainment",
        "software",
        "finance",
        "insurance",
        "housing",
      ],
    },
    frequency: {
      type: String,
      required: true,
      enum: ["monthly"],
      default: "monthly",
    },
    recurringDay: {
      type: Number,
      required: true,
      min: 1,
      max: 31,
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
    endDate: {
      type: Date,
      default: null,
      validate: {
        validator: (v: unknown) =>
          v === null || (v instanceof Date && !Number.isNaN(v.getTime())),
        message: "End date must be null or a valid date.",
      },
    },
    isActive: {
      type: Boolean,
      required: true,
      default: true,
    },
    skippedCycles: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

recurringSeriesSchema.index({ userId: 1, isActive: 1 });

export type RecurringSeriesDocument = InferSchemaType<
  typeof recurringSeriesSchema
>;

export function isValidSeriesId(id: string): boolean {
  return typeof id === "string" && mongoose.isValidObjectId(id);
}

export const RecurringSeries =
  mongoose.models.RecurringSeries ||
  mongoose.model("RecurringSeries", recurringSeriesSchema);
