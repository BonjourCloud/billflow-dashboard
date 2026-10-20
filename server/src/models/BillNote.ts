import mongoose, { type InferSchemaType } from "mongoose";
import { z } from "zod";

export const noteCreateSchema = z
  .object({
    text: z
      .string()
      .trim()
      .min(1, "Note text cannot be empty.")
      .max(1000, "Note text must not exceed 1000 characters."),
  })
  .strict();

export type NoteCreateInput = z.infer<typeof noteCreateSchema>;

const billNoteSchema = new mongoose.Schema(
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
    text: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

billNoteSchema.index({ userId: 1, billId: 1, createdAt: -1 });

export type BillNoteDocument = InferSchemaType<typeof billNoteSchema>;

export const BillNote =
  mongoose.models.BillNote || mongoose.model("BillNote", billNoteSchema);
