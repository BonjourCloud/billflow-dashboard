
import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { connectDB } from "./config/db.js";
import { User } from "./models/User.js";
const app = express();
const PORT = Number(process.env.PORT) || 5001;
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:8080";
import { clerkClient, clerkMiddleware, getAuth } from "@clerk/express";

app.use(helmet());
app.use(cors({ origin: CLIENT_URL }));
app.use(express.json({ limit: "100kb" }));
const clerkPublishableKey = process.env.CLERK_PUBLISHABLE_KEY;
const clerkSecretKey = process.env.CLERK_SECRET_KEY;

if (!clerkPublishableKey || !clerkSecretKey) {
  throw new Error(
    "Missing CLERK_PUBLISHABLE_KEY or CLERK_SECRET_KEY in server/.env",
  );
}

app.use(
  clerkMiddleware({
    publishableKey: clerkPublishableKey,
    secretKey: clerkSecretKey,
  }),
);

app.get("/api/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "BillFlow API",
    timestamp: new Date().toISOString(),
  });
});

// Temporary endpoint for verifying Clerk authentication.
app.get("/api/users/me", async (req, res) => {
  const { userId } = getAuth(req);

  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const clerkUser = await clerkClient.users.getUser(userId);

    const primaryEmail =
      clerkUser.emailAddresses.find(
        (email) => email.id === clerkUser.primaryEmailAddressId,
      )?.emailAddress ?? null;

    const displayName =
      [clerkUser.firstName, clerkUser.lastName]
        .filter(Boolean)
        .join(" ")
        .trim() || null;

    const user = await User.findOneAndUpdate(
      { clerkUserId: userId },
      {
        $set: {
          email: primaryEmail,
          displayName,
          avatarUrl: clerkUser.imageUrl || null,
        },
        $setOnInsert: {
          clerkUserId: userId,
          role: "user",
        },
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      },
    );

    return res.status(200).json({ user });
  } catch (error) {
    console.error("Failed to synchronize authenticated user:", error);
    return res.status(500).json({
      error: "Failed to synchronize user profile.",
    });
  }
});

async function startServer(): Promise<void> {
  try {
    await connectDB();

    app.listen(PORT, () => {
      console.log(`BillFlow API running at http://localhost:${PORT}`);
    });
  } catch {
    console.error(
      "Failed to start BillFlow API. Check MONGODB_URI and Atlas network access.",
    );
    process.exit(1);
  }
}

void startServer();
