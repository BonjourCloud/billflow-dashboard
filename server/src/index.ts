import { z } from "zod";
import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { connectDB } from "./config/db.js";
import { User } from "./models/User.js";
import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";
import { s3Client, s3Bucket } from "./config/s3.js";
import multer from "multer";
const app = express();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2 * 1024 * 1024, // 2 MB
    files: 1,
  },
  fileFilter: (_req, file, callback) => {
    const allowedTypes = ["image/png", "image/jpeg", "image/webp"];
    if (!allowedTypes.includes(file.mimetype)) {
      callback(new Error("Only PNG, JPEG, and WebP images are allowed."));
      return;
    }
    callback(null, true);
  },
});
const PORT = Number(process.env.PORT) || 5001;
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:8080";
import { clerkClient, clerkMiddleware, getAuth } from "@clerk/express";
import { SiteSettings } from "./models/SiteSettings.js";

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

app.get("/api/users/me", async (req, res) => {
  try {
    const { userId } = getAuth(req);

    if (!userId) {
      return res.status(401).json({ error: "Authentication required." });
    }

    const clerkUser = await clerkClient.users.getUser(userId);
    const email =
      clerkUser.emailAddresses.find(
        (item) => item.id === clerkUser.primaryEmailAddressId,
      )?.emailAddress ?? "";

    const user = await User.findOneAndUpdate(
      { clerkUserId: userId },
      {
        $set: {
          email,
          displayName: [clerkUser.firstName, clerkUser.lastName]
            .filter(Boolean)
            .join(" "),
          avatarUrl: clerkUser.imageUrl,
        },
        $setOnInsert: { clerkUserId: userId },
      },
      { new: true, upsert: true, runValidators: true },
    ).lean();

    return res.status(200).json(user);
  } catch (error) {
    console.error("Failed to load current user:", error);
    return res.status(500).json({ error: "Failed to load current user." });
  }
});

app.get("/api/users/me/role", async (req, res) => {
  try {
    const { userId } = getAuth(req);

    if (!userId) {
      return res.status(401).json({ error: "Authentication required." });
    }

    const adminIds = (process.env.ADMIN_CLERK_USER_IDS ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);

    const role = adminIds.includes(userId) ? "admin" : "user";

    const clerkUser = await clerkClient.users.getUser(userId);
    const email =
      clerkUser.emailAddresses.find(
        (item) => item.id === clerkUser.primaryEmailAddressId,
      )?.emailAddress ?? "";

    await User.findOneAndUpdate(
      { clerkUserId: userId },
      {
        $set: {
          email,
          displayName: [clerkUser.firstName, clerkUser.lastName]
            .filter(Boolean)
            .join(" "),
          avatarUrl: clerkUser.imageUrl,
          role,
        },
        $setOnInsert: { clerkUserId: userId },
      },
      { upsert: true, runValidators: true, setDefaultsOnInsert: true },
    );

    return res.status(200).json({ role });
  } catch (error) {
    console.error("Failed to load user role:", error);
    return res.status(500).json({ error: "Failed to load user role." });
  }
});

app.get("/api/site-settings", async (_req, res) => {
  try {
    const settings = await SiteSettings.findOneAndUpdate(
      { settingsId: "default" },
      { $setOnInsert: { settingsId: "default" } },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      },
    ).lean();

    if (!settings) {
      return res.status(500).json({
        error: "Failed to load site settings.",
      });
    }

    return res.status(200).json({
      id: settings.settingsId,
      brand_name: settings.brand_name,
      logo_url: settings.logo_url,
      hero_headline: settings.hero_headline,
      hero_subheadline: settings.hero_subheadline,
      hero_cta_label: settings.hero_cta_label,
      theme_primary_hsl: settings.theme_primary_hsl,
      theme_accent_hsl: settings.theme_accent_hsl,
      theme_background_hsl: settings.theme_background_hsl,
      theme_font_pair: settings.theme_font_pair,
      updated_at: settings.updatedAt
        ? new Date(settings.updatedAt).toISOString()
        : new Date().toISOString(),
    });
  } catch (error) {
    console.error("Failed to load site settings:", error);
    return res.status(500).json({
      error: "Failed to load site settings.",
    });
  }
});


app.patch("/api/admin/branding", async (req, res) => {
  try {
    const { userId } = getAuth(req);

    if (!userId) {
      return res.status(401).json({
        error: "Authentication required.",
      });
    }

    const adminIds = (process.env.ADMIN_CLERK_USER_IDS ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);

    if (!adminIds.includes(userId)) {
      return res.status(403).json({
        error: "Admin access required.",
      });
    }

    const parsed = brandingSettingsSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid branding settings.",
        details: parsed.error.flatten(),
      });
    }

    const settings = await SiteSettings.findOneAndUpdate(
      { settingsId: "default" },
      {
        $set: parsed.data,
        $setOnInsert: { settingsId: "default" },
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      },
    ).lean();

    if (!settings) {
      return res.status(500).json({
        error: "Failed to save branding settings.",
      });
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Failed to save branding settings:", error);

    return res.status(500).json({
      error: "Failed to save branding settings.",
    });
  }
});

const brandingSettingsSchema = z.object({
  brand_name: z.string().trim().min(1).max(40),
  hero_headline: z.string().trim().min(1).max(120),
  hero_subheadline: z.string().trim().min(1).max(400),
  hero_cta_label: z.string().trim().min(1).max(40),
  logo_url: z.string().url().nullable(),
}).strict();

const themeSettingsSchema = z.object({
  theme_primary_hsl: z.string().regex(
    /^\d{1,3}(?:\.\d+)?\s+\d{1,3}(?:\.\d+)?%\s+\d{1,3}(?:\.\d+)?%$/,
  ),
  theme_accent_hsl: z.string().regex(
    /^\d{1,3}(?:\.\d+)?\s+\d{1,3}(?:\.\d+)?%\s+\d{1,3}(?:\.\d+)?%$/,
  ),
  theme_background_hsl: z.string().regex(
    /^\d{1,3}(?:\.\d+)?\s+\d{1,3}(?:\.\d+)?%\s+\d{1,3}(?:\.\d+)?%$/,
  ),
  theme_font_pair: z.string().min(1).max(80),
}).strict();

app.patch("/api/admin/site-settings", async (req, res) => {
  try {
    const { userId } = getAuth(req);

    if (!userId) {
      return res.status(401).json({ error: "Authentication required." });
    }

    const adminIds = (process.env.ADMIN_CLERK_USER_IDS ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);

    if (!adminIds.includes(userId)) {
      return res.status(403).json({ error: "Admin access required." });
    }

    const parsed = themeSettingsSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid theme settings.",
        details: parsed.error.flatten(),
      });
    }

    const settings = await SiteSettings.findOneAndUpdate(
      { settingsId: "default" },
      {
        $set: parsed.data,
        $setOnInsert: { settingsId: "default" },
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      },
    ).lean();

    if (!settings) {
      return res.status(500).json({ error: "Failed to save theme settings." });
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Failed to save theme settings:", error);
    return res.status(500).json({ error: "Failed to save theme settings." });
  }
});

app.post("/api/admin/branding/logo", (req, res, next) => {
  const { userId } = getAuth(req);

  if (!userId) {
    return res.status(401).json({ error: "Authentication required." });
  }

  const adminIds = (process.env.ADMIN_CLERK_USER_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  if (!adminIds.includes(userId)) {
    return res.status(403).json({ error: "Admin access required." });
  }

  next();
}, upload.single("logo"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Please select a valid logo image." });
    }

    const extensionByType: Record<string, string> = {
      "image/png": "png",
      "image/jpeg": "jpg",
      "image/webp": "webp",
    };

    const extension = extensionByType[req.file.mimetype];
    const key = `branding/${randomUUID()}.${extension}`;

    await s3Client.send(
      new PutObjectCommand({
        Bucket: s3Bucket,
        Key: key,
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
        CacheControl: "public, max-age=3600",
      }),
    );

    return res.status(201).json({
      key,
      message: "Logo uploaded successfully.",
    });
  } catch (error) {
    console.error("Failed to upload branding logo:", error);
    return res.status(500).json({ error: "Failed to upload logo." });
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