
import mongoose from "mongoose";

export async function connectDB(): Promise<void> {
  const mongoUri = process.env.MONGODB_URI;

  if (!mongoUri) {
    throw new Error("MONGODB_URI is missing from the environment variables.");
  }

  await mongoose.connect(mongoUri);

  console.log("MongoDB Atlas connected successfully.");
}
