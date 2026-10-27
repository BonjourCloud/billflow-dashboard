import mongoose, { type InferSchemaType } from "mongoose";

const userSchema = new mongoose.Schema(
  {
    clerkUserId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: null,
    },
    displayName: {
      type: String,
      trim: true,
      maxlength: 120,
      default: null,
    },
    avatarUrl: {
      type: String,
      trim: true,
      default: null,
    },
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
      required: true,
    },
    // When the profile fields above were last copied from Clerk.
    profileSyncedAt: {
      type: Date,
      default: null,
    },
    // Demo account only: when its sample data was last (re)created.
    demoSeededAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

export type UserDocument = InferSchemaType<typeof userSchema>;

export const User =
    mongoose.models.User || mongoose.model("User", userSchema);