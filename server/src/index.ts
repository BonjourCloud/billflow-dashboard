import { z } from "zod";
import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { connectDB } from "./config/db.js";
import { User } from "./models/User.js";
import { Bill, isValidBillId, type BillDocument } from "./models/Bill.js";
import {
  RecurringSeries,
  isValidSeriesId,
} from "./models/RecurringSeries.js";
import { Notification, isValidNotificationId } from "./models/Notification.js";
import { Payment, paymentCreateSchema, isValidPaymentId } from "./models/Payment.js";
import { BillNote, noteCreateSchema } from "./models/BillNote.js";
import {
  generateRemindersForUser,
  markNotificationRead,
  markAllNotificationsRead,
  dismissNotification,
} from "./services/reminderService.js";
import {
  generateDueOccurrencesForUser,
  createRecurringSeriesWithOccurrences,
  updateRecurringBillWithScope,
  deleteRecurringBillWithScope,
  updateRecurringSeriesDirectly,
  cancelRecurringSeriesDirectly,
  deleteRecurringSeriesDirectly,
  subscriptionCreateSchema,
  subscriptionUpdateSchema,
} from "./services/recurrenceService.js";
import mongoose from "mongoose";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";
import { getS3Client, s3Bucket, isS3Configured } from "./config/s3.js";
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
import {
  PricingTier,
  seedPricingTiersIfEmpty,
  createPricingTierSchema,
  updatePricingTierSchema,
} from "./models/PricingTier.js";

app.use(helmet());
app.use(cors({ origin: CLIENT_URL }));
app.use(express.json({ limit: "100kb" }));
const clerkPublishableKey = process.env.CLERK_PUBLISHABLE_KEY;
const clerkSecretKey = process.env.CLERK_SECRET_KEY;

if (!clerkPublishableKey || !clerkSecretKey) {
  if (process.env.NODE_ENV !== "test") {
    throw new Error(
      "Missing CLERK_PUBLISHABLE_KEY or CLERK_SECRET_KEY in server/.env",
    );
  }
}

if (clerkPublishableKey && clerkSecretKey) {
  app.use(
    clerkMiddleware({
      publishableKey: clerkPublishableKey,
      secretKey: clerkSecretKey,
    }),
  );
}

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

function getBootstrapAdminIds(): string[] {
  return (process.env.ADMIN_CLERK_USER_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

async function isUserAdmin(
  userId: string | null | undefined,
): Promise<boolean> {
  if (!userId) return false;

  const adminIds = getBootstrapAdminIds();

  if (adminIds.includes(userId)) {
    return true;
  }

  const user = await User.findOne({ clerkUserId: userId })
    .select("role")
    .lean();
  return user?.role === "admin";
}

async function requireAdminAuth(
  req: express.Request,
  res: express.Response,
): Promise<string | null> {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Authentication required." });
    return null;
  }
  const admin = await isUserAdmin(userId);
  if (!admin) {
    res.status(403).json({ error: "Admin access required." });
    return null;
  }
  return userId;
}

app.get("/api/users/me/role", async (req, res) => {
  try {
    const { userId } = getAuth(req);

    if (!userId) {
      return res.status(401).json({ error: "Authentication required." });
    }

    const role = (await isUserAdmin(userId)) ? "admin" : "user";

    const clerkUser = await clerkClient.users.getUser(userId);
    const email =
      clerkUser.emailAddresses.find(
        (item) => item.id === clerkUser.primaryEmailAddressId,
      )?.emailAddress ?? "";

    const rawDisplayName = [clerkUser.firstName, clerkUser.lastName]
      .filter(Boolean)
      .join(" ")
      .trim();
    const displayName = rawDisplayName ? rawDisplayName.slice(0, 120) : null;

    await User.findOneAndUpdate(
      { clerkUserId: userId },
      {
        $set: {
          email,
          displayName,
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
          if (isS3Configured()) {
            const key = decodeURIComponent(parsedUrl.pathname.slice(1));
            logoDisplayUrl = await getSignedUrl(
              getS3Client(),
              new GetObjectCommand({ Bucket: s3Bucket, Key: key }),
              { expiresIn: 3600 },
            );
          } else {
            logoDisplayUrl = null;
          }
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

app.get("/api/admin/users", async (req, res) => {
  try {
    const adminUserId = await requireAdminAuth(req, res);
    if (!adminUserId) return;

    let allClerkUsers: Array<{
      id: string;
      primaryEmailAddressId?: string | null;
      emailAddresses?: Array<{ id: string; emailAddress: string }>;
      createdAt?: number | string | Date;
      lastSignInAt?: number | string | Date | null;
    }> = [];

    const requestedLimit = req.query.limit
      ? Math.min(Number(req.query.limit), 500)
      : 0;
    const requestedOffset = req.query.offset
      ? Math.max(Number(req.query.offset), 0)
      : 0;

    if (requestedLimit > 0) {
      const page = await clerkClient.users.getUserList({
        limit: Math.min(requestedLimit, 100),
        offset: requestedOffset,
        orderBy: "-created_at",
      });
      allClerkUsers = page.data as typeof allClerkUsers;
    } else {
      // Loop to fetch all users with pagination (up to 500 max safety limit)
      let currentOffset = 0;
      let hasMore = true;
      while (hasMore && allClerkUsers.length < 500) {
        const page = await clerkClient.users.getUserList({
          limit: 100,
          offset: currentOffset,
          orderBy: "-created_at",
        });
        allClerkUsers.push(...(page.data as typeof allClerkUsers));
        if (page.data.length < 100 || allClerkUsers.length >= page.totalCount) {
          hasMore = false;
        } else {
          currentOffset += page.data.length;
        }
      }
    }

    const bootstrapIds = getBootstrapAdminIds();

    const userIds = allClerkUsers.map((u) => u.id);
    const dbUsers = await User.find({ clerkUserId: { $in: userIds } })
      .select("clerkUserId role")
      .lean();

    const roleMap = new Map(dbUsers.map((u) => [u.clerkUserId, u.role]));

    const users = allClerkUsers.map((u) => {
      const primaryEmail =
        u.emailAddresses?.find((item) => item.id === u.primaryEmailAddressId)
          ?.emailAddress ||
        u.emailAddresses?.[0]?.emailAddress ||
        null;

      const createdAtIso = u.createdAt
        ? new Date(u.createdAt).toISOString()
        : new Date().toISOString();
      const lastSignInIso = u.lastSignInAt
        ? new Date(u.lastSignInAt).toISOString()
        : null;

      const isBootstrapAdmin = bootstrapIds.includes(u.id);
      const isAdmin =
        isBootstrapAdmin || roleMap.get(u.id) === "admin";

      return {
        id: u.id,
        email: primaryEmail,
        created_at: createdAtIso,
        last_sign_in_at: lastSignInIso,
        is_admin: isAdmin,
        is_bootstrap_admin: isBootstrapAdmin,
      };
    });

    return res.status(200).json(users);
  } catch (error) {
    console.error("Failed to list admin users:", error);
    return res.status(500).json({ error: "Failed to retrieve user list." });
  }
});

app.post("/api/admin/users/:id/grant-admin", async (req, res) => {
  try {
    const adminUserId = await requireAdminAuth(req, res);
    if (!adminUserId) return;

    const targetUserId = req.params.id;
    if (
      !targetUserId ||
      typeof targetUserId !== "string" ||
      !targetUserId.trim()
    ) {
      return res.status(400).json({ error: "Target user ID is required." });
    }

    let clerkUser;
    try {
      clerkUser = await clerkClient.users.getUser(targetUserId);
    } catch (err: unknown) {
      const clerkErr = err as { status?: number };
      if (clerkErr?.status === 404) {
        return res
          .status(404)
          .json({ error: "User not found in identity provider." });
      }
      console.error("Clerk getUser error:", err);
      return res.status(500).json({ error: "Failed to verify target user." });
    }

    if (!clerkUser) {
      return res.status(404).json({ error: "User not found." });
    }

    const email =
      clerkUser.emailAddresses?.find(
        (item) => item.id === clerkUser.primaryEmailAddressId,
      )?.emailAddress ||
      clerkUser.emailAddresses?.[0]?.emailAddress ||
      null;

    const rawDisplayName = [clerkUser.firstName, clerkUser.lastName]
      .filter(Boolean)
      .join(" ")
      .trim();
    const displayName = rawDisplayName ? rawDisplayName.slice(0, 120) : null;

    await User.findOneAndUpdate(
      { clerkUserId: targetUserId },
      {
        $set: {
          role: "admin",
          email,
          displayName,
          avatarUrl: clerkUser.imageUrl || null,
        },
        $setOnInsert: { clerkUserId: targetUserId },
      },
      { upsert: true, new: true, runValidators: true },
    );

    return res.status(200).json({
      message: "Admin privileges granted.",
      userId: targetUserId,
      is_admin: true,
    });
  } catch (error) {
    console.error("Failed to grant admin privileges:", error);
    return res.status(500).json({ error: "Failed to grant admin privileges." });
  }
});

app.post("/api/admin/users/:id/revoke-admin", async (req, res) => {
  try {
    const adminUserId = await requireAdminAuth(req, res);
    if (!adminUserId) return;

    const targetUserId = req.params.id;
    if (
      !targetUserId ||
      typeof targetUserId !== "string" ||
      !targetUserId.trim()
    ) {
      return res.status(400).json({ error: "Target user ID is required." });
    }

    // 1. Self-revocation prevention
    if (targetUserId === adminUserId) {
      return res
        .status(400)
        .json({ error: "Cannot revoke admin privileges from yourself." });
    }

    // 2. Bootstrap administrator protection
    const bootstrapIds = getBootstrapAdminIds();

    if (bootstrapIds.includes(targetUserId)) {
      return res.status(400).json({
        error:
          "Cannot revoke admin privileges from an environment bootstrap admin.",
      });
    }

    // 3. Verify target user exists in Clerk
    try {
      await clerkClient.users.getUser(targetUserId);
    } catch (err: unknown) {
      const clerkErr = err as { status?: number };
      if (clerkErr?.status === 404) {
        return res.status(404).json({ error: "User not found." });
      }
      console.error("Clerk getUser error in revoke-admin:", err);
      return res.status(500).json({ error: "Failed to verify target user." });
    }

    await User.findOneAndUpdate(
      { clerkUserId: targetUserId },
      { $set: { role: "user" } },
    );

    return res.status(200).json({
      message: "Admin privileges revoked.",
      userId: targetUserId,
      is_admin: false,
    });
  } catch (error) {
    console.error("Failed to revoke admin privileges:", error);
    return res.status(500).json({ error: "Failed to revoke admin privileges." });
  }
});

app.get("/api/admin/summary", async (req, res) => {
  try {
    const adminUserId = await requireAdminAuth(req, res);
    if (!adminUserId) return;

    const bootstrapIds = getBootstrapAdminIds();

    const dbAdmins = await User.find({ role: "admin" })
      .select("clerkUserId")
      .lean();

    const uniqueAdmins = new Set<string>([
      ...bootstrapIds,
      ...dbAdmins.map((u) => u.clerkUserId),
    ]);

    const pricingTiersCount = await PricingTier.countDocuments();

    return res.status(200).json({
      adminCount: uniqueAdmins.size,
      pricingTiersCount,
    });
  } catch (error) {
    console.error("Failed to load admin summary:", error);
    return res.status(500).json({ error: "Failed to load admin summary." });
  }
});

app.get("/api/pricing-tiers", async (req, res) => {
  try {
    await seedPricingTiersIfEmpty();

    const includeHidden = req.query.includeHidden === "true";
    let showAll = false;

    if (includeHidden) {
      const { userId } = getAuth(req);
      if (userId && (await isUserAdmin(userId))) {
        showAll = true;
      }
    }

    const filter = showAll ? {} : { is_visible: true };
    const tiers = await PricingTier.find(filter)
      .sort({ sort_order: 1, createdAt: 1 })
      .lean();

    return res.status(200).json(
      tiers.map((t) => ({
        id: t._id.toString(),
        slug: t.slug,
        name: t.name,
        price_monthly: t.price_monthly,
        price_yearly: t.price_yearly,
        billing_period: t.billing_period,
        cta_label: t.cta_label,
        is_highlighted: t.is_highlighted,
        is_visible: t.is_visible,
        sort_order: t.sort_order,
        features: t.features ?? [],
        updated_at: t.updatedAt
          ? t.updatedAt.toISOString()
          : t.createdAt
            ? t.createdAt.toISOString()
            : new Date().toISOString(),
      })),
    );
  } catch (error) {
    console.error("Failed to load pricing tiers:", error);
    return res.status(500).json({ error: "Failed to load pricing tiers." });
  }
});

app.post("/api/admin/pricing-tiers", async (req, res) => {
  try {
    const adminUserId = await requireAdminAuth(req, res);
    if (!adminUserId) return;

    const parsed = createPricingTierSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: parsed.error.issues?.[0]?.message || "Invalid pricing tier data.",
        details: parsed.error.flatten(),
      });
    }

    const existingSlug = await PricingTier.findOne({
      slug: parsed.data.slug,
    }).lean();
    if (existingSlug) {
      return res.status(409).json({
        error: `A pricing tier with slug '${parsed.data.slug}' already exists.`,
      });
    }

    const tier = await PricingTier.create(parsed.data);

    return res.status(201).json({
      id: tier._id.toString(),
      slug: tier.slug,
      name: tier.name,
      price_monthly: tier.price_monthly,
      price_yearly: tier.price_yearly,
      billing_period: tier.billing_period,
      cta_label: tier.cta_label,
      is_highlighted: tier.is_highlighted,
      is_visible: tier.is_visible,
      sort_order: tier.sort_order,
      features: tier.features ?? [],
      updated_at: tier.updatedAt.toISOString(),
    });
  } catch (error) {
    console.error("Failed to create pricing tier:", error);
    return res.status(500).json({ error: "Failed to create pricing tier." });
  }
});

app.patch("/api/admin/pricing-tiers/:id", async (req, res) => {
  try {
    const adminUserId = await requireAdminAuth(req, res);
    if (!adminUserId) return;

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid pricing tier ID format." });
    }

    const parsed = updatePricingTierSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error:
          parsed.error.issues?.[0]?.message ||
          "Invalid pricing tier update data.",
        details: parsed.error.flatten(),
      });
    }

    if (parsed.data.slug) {
      const existingSlug = await PricingTier.findOne({
        slug: parsed.data.slug,
        _id: { $ne: id },
      }).lean();
      if (existingSlug) {
        return res.status(409).json({
          error: `A pricing tier with slug '${parsed.data.slug}' already exists.`,
        });
      }
    }

    const updated = await PricingTier.findByIdAndUpdate(
      id,
      { $set: parsed.data },
      { new: true, runValidators: true },
    ).lean();

    if (!updated) {
      return res.status(404).json({ error: "Pricing tier not found." });
    }

    return res.status(200).json({
      id: updated._id.toString(),
      slug: updated.slug,
      name: updated.name,
      price_monthly: updated.price_monthly,
      price_yearly: updated.price_yearly,
      billing_period: updated.billing_period,
      cta_label: updated.cta_label,
      is_highlighted: updated.is_highlighted,
      is_visible: updated.is_visible,
      sort_order: updated.sort_order,
      features: updated.features ?? [],
      updated_at: updated.updatedAt
        ? updated.updatedAt.toISOString()
        : new Date().toISOString(),
    });
  } catch (error) {
    console.error("Failed to update pricing tier:", error);
    return res.status(500).json({ error: "Failed to update pricing tier." });
  }
});

app.delete("/api/admin/pricing-tiers/:id", async (req, res) => {
  try {
    const adminUserId = await requireAdminAuth(req, res);
    if (!adminUserId) return;

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid pricing tier ID format." });
    }

    const deleted = await PricingTier.findByIdAndDelete(id).lean();
    if (!deleted) {
      return res.status(404).json({ error: "Pricing tier not found." });
    }

    return res
      .status(200)
      .json({ message: "Pricing tier deleted successfully." });
  } catch (error) {
    console.error("Failed to delete pricing tier:", error);
    return res.status(500).json({ error: "Failed to delete pricing tier." });
  }
});

app.patch("/api/admin/branding", async (req, res) => {
  try {
    const adminUserId = await requireAdminAuth(req, res);
    if (!adminUserId) return;

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
    const adminUserId = await requireAdminAuth(req, res);
    if (!adminUserId) return;

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

app.post(
  "/api/admin/branding/logo",
  async (req, res, next) => {
    const adminUserId = await requireAdminAuth(req, res);
    if (!adminUserId) return;
    next();
  },
  upload.single("logo"),
  async (req, res) => {
  try {
    if (!isS3Configured()) {
      return res.status(503).json({
        error: "AWS S3 storage is not configured. Cannot upload branding logo.",
      });
    }

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

    await getS3Client().send(
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
      updates as Partial<BillDocument> & { recurringDay?: number },
      updateScope,
    );

    if (!bill) {
      return res.status(404).json({ error: "Bill not found." });
    }

    if (bill.status === "paid") {
      await Notification.updateMany(
        { userId, billId: req.params.id, isRead: false },
        { $set: { isRead: true } },
      );
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

// ──────────────────────────────────────────────
// Bill Payments Endpoints
// ──────────────────────────────────────────────

// GET /api/bills/:id/payments — get payment history for a bill (owner check)
app.get("/api/bills/:id/payments", async (req, res) => {
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

    const payments = await Payment.find({
      billId: req.params.id,
      userId,
    })
      .sort({ paymentDate: -1, createdAt: -1 })
      .lean();

    return res.status(200).json(payments);
  } catch (error) {
    console.error("Failed to list payments:", error);
    return res.status(500).json({ error: "Failed to list payments." });
  }
});

// POST /api/bills/:id/payments — record a payment for a bill (owner check)
app.post("/api/bills/:id/payments", async (req, res) => {
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
    });

    if (!bill) {
      return res.status(404).json({ error: "Bill not found." });
    }

    const parsed = paymentCreateSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid payment data.",
        details: parsed.error.flatten(),
      });
    }

    // Duplicate submission guard: check if an identical payment was recorded within the last 4 seconds
    const fourSecondsAgo = new Date(Date.now() - 4000);
    const recentDuplicate = await Payment.findOne({
      userId,
      billId: bill._id,
      amount: parsed.data.amount,
      method: parsed.data.method,
      createdAt: { $gte: fourSecondsAgo },
    });

    if (recentDuplicate) {
      return res.status(409).json({
        error:
          "Duplicate payment submission detected. Please wait a moment before trying again.",
      });
    }

    const payment = await Payment.create({
      userId,
      billId: bill._id,
      amount: parsed.data.amount,
      paymentDate: parsed.data.paymentDate,
      method: parsed.data.method,
      status: parsed.data.status ?? "completed",
      reference: parsed.data.reference ?? null,
      notes: parsed.data.notes ?? null,
    });

    // Update bill status if completed payments cover the full bill amount.
    // Partial payments must NOT mark the bill as paid.
    if (payment.status === "completed") {
      const paymentsAgg = await Payment.aggregate([
        {
          $match: {
            billId: bill._id,
            userId,
            status: "completed",
          },
        },
        {
          $group: {
            _id: null,
            totalPaid: { $sum: "$amount" },
          },
        },
      ]);

      const totalPaid = paymentsAgg[0]?.totalPaid ?? 0;

      // Allow 0.001 epsilon for currency floating-point comparison
      if (totalPaid >= bill.amount - 0.001) {
        if (bill.status !== "paid") {
          bill.status = "paid";
          await bill.save();

          // Mark any active unread notifications for this bill as read
          await Notification.updateMany(
            { userId, billId: bill._id, isRead: false },
            { $set: { isRead: true } },
          );
        }
      }
    }

    return res.status(201).json(payment.toObject());
  } catch (error) {
    console.error("Failed to record payment:", error);
    return res.status(500).json({ error: "Failed to record payment." });
  }
});

// ──────────────────────────────────────────────
// Bill Notes Endpoints
// ──────────────────────────────────────────────

// GET /api/bills/:id/notes — get notes for a bill (owner check)
app.get("/api/bills/:id/notes", async (req, res) => {
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

    const notes = await BillNote.find({
      billId: req.params.id,
      userId,
    })
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json(notes);
  } catch (error) {
    console.error("Failed to list bill notes:", error);
    return res.status(500).json({ error: "Failed to list bill notes." });
  }
});

// POST /api/bills/:id/notes — add a note for a bill (owner check)
app.post("/api/bills/:id/notes", async (req, res) => {
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
    });

    if (!bill) {
      return res.status(404).json({ error: "Bill not found." });
    }

    const parsed = noteCreateSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid note data.",
        details: parsed.error.flatten(),
      });
    }

    const note = await BillNote.create({
      userId,
      billId: bill._id,
      text: parsed.data.text,
    });

    return res.status(201).json(note.toObject());
  } catch (error) {
    console.error("Failed to create bill note:", error);
    return res.status(500).json({ error: "Failed to create bill note." });
  }
});

// ──────────────────────────────────────────────
// Subscriptions (RecurringSeries) Endpoints
// ──────────────────────────────────────────────

export { subscriptionCreateSchema, subscriptionUpdateSchema };

// GET /api/subscriptions — list all subscriptions for the authenticated user
app.get("/api/subscriptions", async (req, res) => {
  try {
    const { userId } = getAuth(req);

    if (!userId) {
      return res.status(401).json({ error: "Authentication required." });
    }

    // Materialize any due recurring occurrences idempotently
    await generateDueOccurrencesForUser(userId);

    const statusParam = req.query.status;
    const filter: Record<string, unknown> = { userId };
    if (statusParam === "active") {
      filter.isActive = true;
    } else if (statusParam === "inactive") {
      filter.isActive = false;
    }

    const subscriptions = await RecurringSeries.find(filter)
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json(subscriptions);
  } catch (error) {
    console.error("Failed to list subscriptions:", error);
    return res.status(500).json({ error: "Failed to list subscriptions." });
  }
});

// GET /api/subscriptions/:id — retrieve a single subscription
app.get("/api/subscriptions/:id", async (req, res) => {
  try {
    const { userId } = getAuth(req);

    if (!userId) {
      return res.status(401).json({ error: "Authentication required." });
    }

    if (!isValidSeriesId(req.params.id)) {
      return res.status(400).json({ error: "Invalid subscription ID format." });
    }

    const subscription = await RecurringSeries.findOne({
      _id: req.params.id,
      userId,
    }).lean();

    if (!subscription) {
      return res.status(404).json({ error: "Subscription not found." });
    }

    return res.status(200).json(subscription);
  } catch (error) {
    console.error("Failed to load subscription:", error);
    return res.status(500).json({ error: "Failed to load subscription." });
  }
});

// POST /api/subscriptions — create a new subscription
app.post("/api/subscriptions", async (req, res) => {
  try {
    const { userId } = getAuth(req);

    if (!userId) {
      return res.status(401).json({ error: "Authentication required." });
    }

    const parsed = subscriptionCreateSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid subscription data.",
        details: parsed.error.flatten(),
      });
    }

    const { series } = await createRecurringSeriesWithOccurrences(
      userId,
      {
        name: parsed.data.name,
        amount: parsed.data.amount,
        category: parsed.data.category,
        dueDate: parsed.data.startDate,
        recurringDay: parsed.data.recurringDay,
        initialStatus: parsed.data.initialStatus,
      },
    );

    return res.status(201).json(series);
  } catch (error) {
    console.error("Failed to create subscription:", error);
    return res.status(500).json({ error: "Failed to create subscription." });
  }
});

// PATCH /api/subscriptions/:id — update an existing subscription
app.patch("/api/subscriptions/:id", async (req, res) => {
  try {
    const { userId } = getAuth(req);

    if (!userId) {
      return res.status(401).json({ error: "Authentication required." });
    }

    if (!isValidSeriesId(req.params.id)) {
      return res.status(400).json({ error: "Invalid subscription ID format." });
    }

    const parsed = subscriptionUpdateSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid subscription data.",
        details: parsed.error.flatten(),
      });
    }

    const updated = await updateRecurringSeriesDirectly(
      userId,
      req.params.id,
      parsed.data,
    );

    if (!updated) {
      return res.status(404).json({ error: "Subscription not found." });
    }

    return res.status(200).json(updated);
  } catch (error) {
    console.error("Failed to update subscription:", error);
    return res.status(500).json({ error: "Failed to update subscription." });
  }
});

// PATCH /api/subscriptions/:id/cancel — cancel a subscription
app.patch("/api/subscriptions/:id/cancel", async (req, res) => {
  try {
    const { userId } = getAuth(req);

    if (!userId) {
      return res.status(401).json({ error: "Authentication required." });
    }

    if (!isValidSeriesId(req.params.id)) {
      return res.status(400).json({ error: "Invalid subscription ID format." });
    }

    const cancelled = await cancelRecurringSeriesDirectly(userId, req.params.id);

    if (!cancelled) {
      return res.status(404).json({ error: "Subscription not found." });
    }

    return res.status(200).json(cancelled);
  } catch (error) {
    console.error("Failed to cancel subscription:", error);
    return res.status(500).json({ error: "Failed to cancel subscription." });
  }
});

// DELETE /api/subscriptions/:id — delete a subscription (scope=future or scope=all)
app.delete("/api/subscriptions/:id", async (req, res) => {
  try {
    const { userId } = getAuth(req);

    if (!userId) {
      return res.status(401).json({ error: "Authentication required." });
    }

    if (!isValidSeriesId(req.params.id)) {
      return res.status(400).json({ error: "Invalid subscription ID format." });
    }

    const rawScope = req.query.scope;
    const scope: "future" | "all" = rawScope === "all" ? "all" : "future";

    const deleted = await deleteRecurringSeriesDirectly(userId, req.params.id, scope);

    if (!deleted) {
      return res.status(404).json({ error: "Subscription not found." });
    }

    return res.status(204).send();
  } catch (error) {
    console.error("Failed to delete subscription:", error);
    return res.status(500).json({ error: "Failed to delete subscription." });
  }
});

// ──────────────────────────────────────────────
// In-App Notifications (Reminders) Endpoints
// ──────────────────────────────────────────────

// GET /api/notifications — list active reminders for the authenticated user
app.get("/api/notifications", async (req, res) => {
  try {
    const { userId } = getAuth(req);

    if (!userId) {
      return res.status(401).json({ error: "Authentication required." });
    }

    // 1. Materialize any due recurring occurrences first
    await generateDueOccurrencesForUser(userId);

    // 2. Materialize any due reminders idempotently
    await generateRemindersForUser(userId);

    // 3. Query active (non-dismissed) notifications
    const filter: Record<string, unknown> = {
      userId,
      isDismissed: false,
    };

    if (req.query.status === "unread") {
      filter.isRead = false;
    }

    const notifications = await Notification.find(filter)
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    return res.status(200).json(notifications);
  } catch (error) {
    console.error("Failed to list notifications:", error);
    return res.status(500).json({ error: "Failed to list notifications." });
  }
});

// GET /api/notifications/unread-count — get count of unread, non-dismissed notifications
app.get("/api/notifications/unread-count", async (req, res) => {
  try {
    const { userId } = getAuth(req);

    if (!userId) {
      return res.status(401).json({ error: "Authentication required." });
    }

    const count = await Notification.countDocuments({
      userId,
      isDismissed: false,
      isRead: false,
    });

    return res.status(200).json({ count });
  } catch (error) {
    console.error("Failed to get unread notifications count:", error);
    return res
      .status(500)
      .json({ error: "Failed to get unread notifications count." });
  }
});

// PATCH /api/notifications/:id/read — mark a single notification as read
app.patch("/api/notifications/:id/read", async (req, res) => {
  try {
    const { userId } = getAuth(req);

    if (!userId) {
      return res.status(401).json({ error: "Authentication required." });
    }

    if (!isValidNotificationId(req.params.id)) {
      return res.status(400).json({ error: "Invalid notification ID format." });
    }

    const updated = await markNotificationRead(userId, req.params.id);

    if (!updated) {
      return res.status(404).json({ error: "Notification not found." });
    }

    return res.status(200).json(updated);
  } catch (error) {
    console.error("Failed to mark notification as read:", error);
    return res
      .status(500)
      .json({ error: "Failed to mark notification as read." });
  }
});

// PATCH /api/notifications/read-all — mark all active notifications as read
app.patch("/api/notifications/read-all", async (req, res) => {
  try {
    const { userId } = getAuth(req);

    if (!userId) {
      return res.status(401).json({ error: "Authentication required." });
    }

    const updatedCount = await markAllNotificationsRead(userId);

    return res.status(200).json({ success: true, updatedCount });
  } catch (error) {
    console.error("Failed to mark all notifications as read:", error);
    return res
      .status(500)
      .json({ error: "Failed to mark all notifications as read." });
  }
});

// PATCH /api/notifications/:id/dismiss — dismiss a notification (soft-delete to preserve dedupe)
app.patch("/api/notifications/:id/dismiss", async (req, res) => {
  try {
    const { userId } = getAuth(req);

    if (!userId) {
      return res.status(401).json({ error: "Authentication required." });
    }

    if (!isValidNotificationId(req.params.id)) {
      return res.status(400).json({ error: "Invalid notification ID format." });
    }

    const dismissed = await dismissNotification(userId, req.params.id);

    if (!dismissed) {
      return res.status(404).json({ error: "Notification not found." });
    }

    return res.status(200).json(dismissed);
  } catch (error) {
    console.error("Failed to dismiss notification:", error);
    return res.status(500).json({ error: "Failed to dismiss notification." });
  }
});

let server: ReturnType<typeof app.listen> | null = null;
let isShuttingDown = false;

export function setServerInstanceForTesting(
  instance: ReturnType<typeof app.listen> | null,
): void {
  server = instance;
  isShuttingDown = false;
}

export function resetShutdownStateForTesting(): void {
  isShuttingDown = false;
}

export async function stopServer(options?: {
  timeoutMs?: number;
  exitOnTimeout?: boolean;
}): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log("Shutting down BillFlow API gracefully...");

  const timeoutMs = options?.timeoutMs ?? 10000;
  // Reliable shutdown watchdog: do not unref the timer in production.
  // In test environment, default to not exiting the process on timeout unless explicitly specified.
  const shouldExitOnTimeout =
    options?.exitOnTimeout ?? (process.env.NODE_ENV !== "test");

  let forceTimeout: NodeJS.Timeout | null = null;
  if (shouldExitOnTimeout) {
    forceTimeout = setTimeout(() => {
      console.error(
        `Graceful shutdown timed out after ${timeoutMs / 1000}s, forcing exit.`,
      );
      process.exit(1);
    }, timeoutMs);
  }

  let serverError: unknown = null;
  let dbError: unknown = null;

  try {
    // 1. Attempt to close HTTP server to stop receiving new requests
    if (server) {
      try {
        await new Promise<void>((resolve, reject) => {
          server!.close((err) => {
            if (err) return reject(err);
            resolve();
          });
        });
        console.log("HTTP server closed to new connections.");
      } catch (err) {
        console.error("Error closing HTTP server:", err);
        serverError = err;
      } finally {
        server = null;
      }
    }

    // 2. Always attempt MongoDB closure even if HTTP server closure fails
    try {
      if (mongoose.connection) {
        await mongoose.connection.close(false);
        console.log("MongoDB connection closed cleanly.");
      }
    } catch (err) {
      console.error("Error closing MongoDB connection:", err);
      dbError = err;
    }

    if (serverError || dbError) {
      throw serverError || dbError;
    }

    console.log("Graceful shutdown complete.");
  } finally {
    if (forceTimeout) {
      clearTimeout(forceTimeout);
      forceTimeout = null;
    }
  }
}

export async function startServer(): Promise<void> {
  try {
    await connectDB();
    await seedPricingTiersIfEmpty();

    server = app.listen(PORT, () => {
      console.log(`BillFlow API running at http://localhost:${PORT}`);
    });
  } catch {
    console.error(
      "Failed to start BillFlow API. Check MONGODB_URI and Atlas network access.",
    );
    process.exit(1);
  }
}

if (process.env.NODE_ENV !== "test") {
  process.on("SIGTERM", () => {
    void stopServer().then(() => {
      process.exit(0);
    }).catch(() => {
      process.exit(1);
    });
  });

  process.on("SIGINT", () => {
    void stopServer().then(() => {
      process.exit(0);
    }).catch(() => {
      process.exit(1);
    });
  });

  void startServer();
}

export {
  app,
  mongoose,
  PricingTier,
  seedPricingTiersIfEmpty,
  User,
  isUserAdmin,
  requireAdminAuth,
  getBootstrapAdminIds,
  Payment,
  paymentCreateSchema,
  BillNote,
  noteCreateSchema,
};