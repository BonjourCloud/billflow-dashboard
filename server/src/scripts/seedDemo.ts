import "dotenv/config";
import mongoose from "mongoose";
import { getDemoUserId, resetDemoData } from "../services/demoService.js";

/**
 * Creates or resets the demo account's sample data.
 *
 *   npm run seed:demo --prefix server
 *
 * Needs MONGODB_URI and DEMO_CLERK_USER_ID (the Clerk user id of the demo
 * account, user_...) in server/.env or the environment. Safe to run any
 * number of times: it deletes only that user's data, then re-creates it.
 */
async function main(): Promise<void> {
  const demoId = getDemoUserId();
  if (!demoId) {
    throw new Error(
      "DEMO_CLERK_USER_ID is missing or not a Clerk user id (user_...).",
    );
  }
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is missing.");

  await mongoose.connect(uri);
  try {
    const data = await resetDemoData(demoId);
    console.log(
      `Demo data ready for ${demoId}: ${data.bills.length} bills, ` +
        `${data.payments.length} payments, ${data.series.length} recurring series, ` +
        `${data.plans.length} installment plans, ${data.income.length} income sources, ` +
        `${data.budgets.length} budget limits.`,
    );
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
