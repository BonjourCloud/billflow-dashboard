import mongoose, { type InferSchemaType } from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    type: {
      type: String,
      required: true,
      enum: ["due_soon", "overdue"],
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 300,
    },
    billId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Bill",
      required: true,
      index: true,
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
    dueDate: {
      type: Date,
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      validate: {
        validator: (v: number) => typeof v === "number" && v > 0,
        message: "Amount must be a positive number.",
      },
    },
    isRead: {
      type: Boolean,
      required: true,
      default: false,
      index: true,
    },
    isDismissed: {
      type: Boolean,
      required: true,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

// Compound unique index ensuring at most one notification of each type per bill for a user
notificationSchema.index(
  { userId: 1, billId: 1, type: 1 },
  { unique: true },
);

// Query index for active notifications retrieval
notificationSchema.index({
  userId: 1,
  isDismissed: 1,
  isRead: 1,
  createdAt: -1,
});

export type NotificationDocument = InferSchemaType<typeof notificationSchema>;

export function isValidNotificationId(id: string): boolean {
  return typeof id === "string" && mongoose.isValidObjectId(id);
}

export const Notification =
  mongoose.models.Notification ||
  mongoose.model("Notification", notificationSchema);
