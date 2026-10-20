import mongoose, { type InferSchemaType } from "mongoose";

const billSchema = new mongoose.Schema(
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
    dueDate: {
      type: Date,
      required: true,
      validate: {
        validator: (v: unknown) =>
          v instanceof Date && !Number.isNaN(v.getTime()),
        message: "Due date must be a valid date.",
      },
    },
    status: {
      type: String,
      required: true,
      enum: ["paid", "pending", "overdue"],
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
    isSubscription: {
      type: Boolean,
      required: true,
      default: false,
    },
    recurrenceType: {
      type: String,
      enum: ["one_time", "recurring"],
      default: "one_time",
    },
    seriesId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RecurringSeries",
      default: null,
      index: true,
    },
    billingCycle: {
      type: String,
      default: null,
    },
    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "InstallmentPlan",
      default: null,
      index: true,
    },
    installmentNumber: {
      type: Number,
      default: null,
    },
    totalInstallments: {
      type: Number,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

billSchema.index(
  { seriesId: 1, billingCycle: 1 },
  {
    unique: true,
    partialFilterExpression: {
      seriesId: { $type: "objectId" },
      billingCycle: { $type: "string" },
    },
  },
);

billSchema.index(
  { planId: 1, installmentNumber: 1 },
  {
    unique: true,
    partialFilterExpression: {
      planId: { $type: "objectId" },
      installmentNumber: { $type: "number" },
    },
  },
);


export type BillDocument = InferSchemaType<typeof billSchema>;

export function isValidBillId(id: string): boolean {
  return typeof id === "string" && mongoose.isValidObjectId(id);
}

export const Bill =
  mongoose.models.Bill || mongoose.model("Bill", billSchema);
