import { z } from "zod";
import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { connectDB } from "./config/db.js";
import { User } from "./models/User.js";
import { Bill, isValidBillId } from "./models/Bill.js";
import {
  generateDueOccurrencesForUser,
  createRecurringSeriesWithOccurrences,
  updateRecurringBillWithScope,
  deleteRecurringBillWithScope,
} from "./services/recurrenceService.js";
import mongoose from "mongoose";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";
import { s3Client, s3Bucket } from "./config/s3.js";
import multer from "multer";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
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

    // Keep logo_url as the permanent stored URL. Generate a temporary URL
    // separately because the S3 bucket is private.
    let logoDisplayUrl: string | null = settings.logo_url ?? null;

    if (settings.logo_url) {
      try {
        const parsedUrl = new URL(settings.logo_url);
        const region = process.env.AWS_REGION || "us-east-1";
        const expectedHost = `${s3Bucket}.s3.${region}.amazonaws.com`;

        if (
          parsedUrl.hostname === expectedHost &&
          parsedUrl.pathname.startsWith("/branding/")
        ) {
          const key = decodeURIComponent(parsedUrl.pathname.slice(1));
          logoDisplayUrl = await getSignedUrl(
            s3Client,
            new GetObjectCommand({ Bucket: s3Bucket, Key: key }),
            { expiresIn: 3600 },
          );
        }
      } catch (error) {
        console.error("Failed to create logo display URL:", error);
        logoDisplayUrl = null;
      }
    }

    return res.status(200).json({
      id: settings.settingsId,
      brand_name: settings.brand_name,
      logo_url: settings.logo_url,
      logo_display_url: logoDisplayUrl,
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
        CacheControl: "private, max-age=3600",
      }),
    );

    const region = process.env.AWS_REGION || "us-east-1";
    const url = `https://${s3Bucket}.s3.${region}.amazonaws.com/${key}`;

    return res.status(201).json({
      url,
      message: "Logo uploaded successfully.",
    });
  } catch (error) {
    console.error("Failed to upload branding logo:", error);
    return res.status(500).json({ error: "Failed to upload logo." });
  }
});

// ──────────────────────────────────────────────
// Bill CRUD
// ──────────────────────────────────────────────

export const billBodySchema = z
  .object({
    name: z.string().trim().min(1, "Bill name is required.").max(100),
    amount: z.number().positive("Amount must be a positive number."),
    dueDate: z
      .string()
      .trim()
      .min(1, "Due date is required.")
      .refine(
        (val) => {
          const timestamp = Date.parse(val);
          return !Number.isNaN(timestamp);
        },
        { message: "Invalid date format. Expected a valid date string." },
      )
      .transform((val) => new Date(val)),
    status: z.enum(["paid", "pending", "overdue"]),
    category: z.enum([
      "utilities",
      "entertainment",
      "software",
      "finance",
      "insurance",
      "housing",
    ]),
    isSubscription: z.boolean().optional(),
    recurrenceType: z.enum(["one_time", "recurring"]).optional(),
    recurringDay: z.number().int().min(1).max(31).optional(),
  })
  .strict()
  .transform((data) => {
    const recurrenceType =
      data.recurrenceType ?? (data.isSubscription ? "recurring" : "one_time");
    const isSubscription =
      data.isSubscription ?? (recurrenceType === "recurring");
    return {
      ...data,
      recurrenceType,
      isSubscription,
    };
  });

export const billUpdateSchema = z
  .object({
    name: z.string().trim().min(1, "Bill name is required.").max(100).optional(),
    amount: z.number().positive("Amount must be a positive number.").optional(),
    dueDate: z
      .string()
      .trim()
      .min(1, "Due date is required.")
      .refine(
        (val) => {
          const timestamp = Date.parse(val);
          return !Number.isNaN(timestamp);
        },
        { message: "Invalid date format. Expected a valid date string." },
      )
      .transform((val) => new Date(val))
      .optional(),
    status: z.enum(["paid", "pending", "overdue"]).optional(),
    category: z
      .enum([
        "utilities",
        "entertainment",
        "software",
        "finance",
        "insurance",
        "housing",
      ])
      .optional(),
    isSubscription: z.boolean().optional(),
    recurrenceType: z.enum(["one_time", "recurring"]).optional(),
    recurringDay: z.number().int().min(1).max(31).optional(),
    updateScope: z.enum(["this", "future"]).optional(),
  })
  .strict();

// GET /api/bills — list all bills for the authenticated user
app.get("/api/bills", async (req, res) => {
  try {
    const { userId } = getAuth(req);

    if (!userId) {
      return res.status(401).json({ error: "Authentication required." });
    }

    // Materialize any due recurring occurrences idempotently
    await generateDueOccurrencesForUser(userId);

    const bills = await Bill.find({ userId })
      .sort({ dueDate: 1 })
      .lean();

    return res.status(200).json(bills);
  } catch (error) {
    console.error("Failed to list bills:", error);
    return res.status(500).json({ error: "Failed to list bills." });
  }
});

// GET /api/bills/:id — get a single bill (owner check)
app.get("/api/bills/:id", async (req, res) => {
  try {
    const { userId } = getAuth(req);

    if (!userId) {
      return res.status(401).json({ error: "Authentication required." });
    }

    if (!isValidBillId(req.params.id)) {
      return res.status(400).json({ error: "Invalid bill ID format." });
    }

    const bill = await Bill.findOne({
      _id: req.params.id,
      userId,
    }).lean();

    if (!bill) {
      return res.status(404).json({ error: "Bill not found." });
    }

    return res.status(200).json(bill);
  } catch (error) {
    console.error("Failed to load bill:", error);
    return res.status(500).json({ error: "Failed to load bill." });
  }
});

// POST /api/bills — create a new bill (one-time or recurring)
app.post("/api/bills", async (req, res) => {
  try {
    const { userId } = getAuth(req);

    if (!userId) {
      return res.status(401).json({ error: "Authentication required." });
    }

    const parsed = billBodySchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid bill data.",
        details: parsed.error.flatten(),
      });
    }

    if (parsed.data.recurrenceType === "recurring") {
      const { primaryBill } = await createRecurringSeriesWithOccurrences(
        userId,
        {
          name: parsed.data.name,
          amount: parsed.data.amount,
          category: parsed.data.category,
          dueDate: parsed.data.dueDate,
          recurringDay: parsed.data.recurringDay,
          initialStatus: parsed.data.status,
        },
      );
      return res.status(201).json(primaryBill);
    }

    const bill = await Bill.create({
      name: parsed.data.name,
      amount: parsed.data.amount,
      dueDate: parsed.data.dueDate,
      status: parsed.data.status,
      category: parsed.data.category,
      isSubscription: parsed.data.isSubscription,
      recurrenceType: "one_time",
      userId,
    });

    return res.status(201).json(bill.toObject());
  } catch (error) {
    console.error("Failed to create bill:", error);
    return res.status(500).json({ error: "Failed to create bill." });
  }
});

// PATCH /api/bills/:id — update a bill (owner check, with optional updateScope)
app.patch("/api/bills/:id", async (req, res) => {
  try {
    const { userId } = getAuth(req);

    if (!userId) {
      return res.status(401).json({ error: "Authentication required." });
    }

    if (!isValidBillId(req.params.id)) {
      return res.status(400).json({ error: "Invalid bill ID format." });
    }

    const parsed = billUpdateSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid bill data.",
        details: parsed.error.flatten(),
      });
    }

    const { updateScope = "this", ...updates } = parsed.data;

    const bill = await updateRecurringBillWithScope(
      userId,
      req.params.id,
      updates as Partial<BillDocument>,
      updateScope,
    );

    if (!bill) {
      return res.status(404).json({ error: "Bill not found." });
    }

    return res.status(200).json(bill);
  } catch (error) {
    console.error("Failed to update bill:", error);
    return res.status(500).json({ error: "Failed to update bill." });
  }
});

// DELETE /api/bills/:id — delete a bill (owner check, with optional deleteScope)
app.delete("/api/bills/:id", async (req, res) => {
  try {
    const { userId } = getAuth(req);

    if (!userId) {
      return res.status(401).json({ error: "Authentication required." });
    }

    if (!isValidBillId(req.params.id)) {
      return res.status(400).json({ error: "Invalid bill ID format." });
    }

    const rawScope = req.query.scope;
    const scope: "this" | "future" | "all" =
      rawScope === "future" || rawScope === "all" ? rawScope : "this";

    const deleted = await deleteRecurringBillWithScope(
      userId,
      req.params.id,
      scope,
    );

    if (!deleted) {
      return res.status(404).json({ error: "Bill not found." });
    }

    return res.status(204).send();
  } catch (error) {
    console.error("Failed to delete bill:", error);
    return res.status(500).json({ error: "Failed to delete bill." });
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