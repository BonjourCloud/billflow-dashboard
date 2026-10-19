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
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

export type BillDocument = InferSchemaType<typeof billSchema>;

export function isValidBillId(id: string): boolean {
  return typeof id === "string" && mongoose.isValidObjectId(id);
}

export const Bill =
  mongoose.models.Bill || mongoose.model("Bill", billSchema);
