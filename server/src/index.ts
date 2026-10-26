import { z } from "zod";
import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import { connectDB } from "./config/db.js";
import {
  EnvValidationError,
  validateServerEnv,
  type ServerEnv,
} from "./config/env.js";
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
  convertLegacyReminderCurrency,
  markNotificationRead,
  markAllNotificationsRead,
  dismissNotification,
  cleanUpNotificationsForBills,
} from "./services/reminderService.js";
import {
  InstallmentPlan,
  calculateInstallmentPlanTotals,
  installmentPlanCreateSchema,
  installmentPlanUpdateSchema,
  isValidPlanId,
} from "./models/InstallmentPlan.js";
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
  calculateOccurrenceDueDate,
} from "./services/recurrenceService.js";
import mongoose from "mongoose";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";
import { getS3Client, s3Bucket, isS3Configured } from "./config/s3.js";
import { detectImageType, IMAGE_EXTENSIONS } from "./services/imageSignature.js";
import multer from "multer";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
const app = express();

export class UnsupportedFileTypeError extends Error {
  constructor() {
    super("Only PNG, JPEG, and WebP images are allowed.");
    this.name = "UnsupportedFileTypeError";
  }
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2 * 1024 * 1024, // 2 MB
    files: 1,
  },
  fileFilter: (_req, file, callback) => {
    const allowedTypes = ["image/png", "image/jpeg", "image/webp"];
    if (!allowedTypes.includes(file.mimetype)) {
      callback(new UnsupportedFileTypeError());
      return;
    }
    callback(null, true);
  },
});
function loadServerEnv(): ServerEnv {
  try {
    return validateServerEnv();
  } catch (error) {
    if (error instanceof EnvValidationError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }
}

// Validate configuration at boot so a misconfigured deploy fails immediately
// instead of serving requests that can never succeed (e.g. CORS-blocked).
const serverEnv = process.env.NODE_ENV === "test" ? null : loadServerEnv();
const PORT = serverEnv?.PORT ?? (Number(process.env.PORT) || 5001);
const CLIENT_ORIGINS = serverEnv?.CLIENT_ORIGINS ?? ["http://localhost:8080"];
import { clerkClient, clerkMiddleware, getAuth } from "@clerk/express";
import { SiteSettings } from "./models/SiteSettings.js";
import {
  PricingTier,
  seedPricingTiersIfEmpty,
  createPricingTierSchema,
  updatePricingTierSchema,
} from "./models/PricingTier.js";

// Number of reverse-proxy hops to trust for req.ip (e.g. 1 on Render). Left at
// 0 by default so clients cannot spoof X-Forwarded-For to dodge rate limits.
app.set("trust proxy", serverEnv?.TRUST_PROXY ?? 0);
app.use(helmet());
app.use(cors({ origin: CLIENT_ORIGINS }));
app.use(express.json({ limit: "100kb" }));
// Outside tests, validateServerEnv() has already guaranteed both keys exist.
const clerkPublishableKey =
  serverEnv?.CLERK_PUBLISHABLE_KEY ?? process.env.CLERK_PUBLISHABLE_KEY;
const clerkSecretKey =
  serverEnv?.CLERK_SECRET_KEY ?? process.env.CLERK_SECRET_KEY;

const MONGO_READY_STATES: Record<number, string> = {
  0: "disconnected",
  1: "connected",
  2: "connecting",
  3: "disconnecting",
};

function databaseState(): string {
  return MONGO_READY_STATES[mongoose.connection.readyState] ?? "unknown";
}

// Health endpoints are registered before auth and rate limiting so platform
// probes are never throttled or rejected.

// Liveness: the process is up and serving requests.
app.get("/api/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "BillFlow API",
    database: databaseState(),
    timestamp: new Date().toISOString(),
  });
});

// Readiness: only report ready when MongoDB is connected, so the host does not
// route traffic to an instance that cannot serve it.
app.get("/api/ready", (_req, res) => {
  const database = databaseState();
  const ready = mongoose.connection.readyState === 1;
  res.status(ready ? 200 : 503).json({
    status: ready ? "ready" : "unavailable",
    database,
  });
});

/**
 * Clerk options for the API. `authorizedParties` makes Clerk reject session
 * tokens whose `azp` (the origin the token was issued to) is not one of the
 * frontend origins — the same validated list CORS allows — so tokens minted
 * for other apps on the same Clerk instance are treated as signed out.
 */
export function buildClerkMiddlewareOptions(config: {
  publishableKey: string;
  secretKey: string;
  authorizedOrigins: string[];
}) {
  return {
    publishableKey: config.publishableKey,
    secretKey: config.secretKey,
    authorizedParties: [...config.authorizedOrigins],
  };
}

if (clerkPublishableKey && clerkSecretKey) {
  app.use(
    clerkMiddleware(
      buildClerkMiddlewareOptions({
        publishableKey: clerkPublishableKey,
        secretKey: clerkSecretKey,
        authorizedOrigins: CLIENT_ORIGINS,
      }),
    ),
  );
}

// Rate limit per signed-in user, falling back to client IP. Runs after Clerk
// so authenticated users behind a shared IP get independent budgets.
function rateLimitKey(req: express.Request): string {
  try {
    const { userId } = getAuth(req);
    if (userId) return `user:${userId}`;
  } catch {
    // No Clerk middleware (tests) or unauthenticated request.
  }
  return `ip:${ipKeyGenerator(req.ip ?? "unknown")}`;
}

export function createRateLimiter(options: { windowMs: number; limit: number }) {
  return rateLimit({
    windowMs: options.windowMs,
    limit: options.limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: rateLimitKey,
    handler: (_req, res, _next, limiterOptions) => {
      res
        .status(limiterOptions.statusCode)
        .json({ error: "Too many requests. Please try again later." });
    },
  });
}

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
// Generous general budget; the dashboard polls notifications once a minute.
app.use("/api", createRateLimiter({ windowMs: FIFTEEN_MINUTES_MS, limit: 1000 }));
// Tighter budget for admin privilege changes and S3 uploads.
const sensitiveRateLimiter = createRateLimiter({
  windowMs: FIFTEEN_MINUTES_MS,
  limit: 30,
});

// Profile fields (email, name, avatar) are copied from Clerk at most once per
// TTL per user. Roles are never cached: isUserAdmin() reads the environment and
// MongoDB on every request, so grants, revocations, and ADMIN_CLERK_USER_IDS
// changes take effect immediately.
export const PROFILE_SYNC_TTL_MS = 15 * 60 * 1000;

export async function syncUserProfile(userId: string): Promise<void> {
  const existing = await User.findOne({ clerkUserId: userId })
    .select("profileSyncedAt")
    .lean();
  const lastSynced = existing?.profileSyncedAt
    ? new Date(existing.profileSyncedAt).getTime()
    : 0;
  if (Date.now() - lastSynced < PROFILE_SYNC_TTL_MS) return;

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

  // Sync profile fields only. The stored role changes solely through the
  // grant/revoke admin endpoints; bootstrap admins are resolved from
  // ADMIN_CLERK_USER_IDS at request time so removing an ID revokes access.
  await User.findOneAndUpdate(
    { clerkUserId: userId },
    {
      $set: {
        email,
        displayName,
        avatarUrl: clerkUser.imageUrl,
        profileSyncedAt: new Date(),
      },
      $setOnInsert: { clerkUserId: userId },
    },
    { upsert: true, runValidators: true, setDefaultsOnInsert: true },
  );
}

app.get("/api/users/me", async (req, res) => {
  try {
    const { userId } = getAuth(req);

    if (!userId) {
      return res.status(401).json({ error: "Authentication required." });
    }

    await syncUserProfile(userId);
    const user = await User.findOne({ clerkUserId: userId }).lean();

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

export async function currentUserRoleHandler(
  req: express.Request,
  res: express.Response,
) {
  try {
    const { userId } = getAuth(req);

    if (!userId) {
      return res.status(401).json({ error: "Authentication required." });
    }

    const role = (await isUserAdmin(userId)) ? "admin" : "user";
    await syncUserProfile(userId);

    return res.status(200).json({ role });
  } catch (error) {
    console.error("Failed to load user role:", error);
    return res.status(500).json({ error: "Failed to load user role." });
  }
}

app.get("/api/users/me/role", currentUserRoleHandler);

app.get("/api/site-settings", async (_req, res) => {
  try {
    // Read-only: until an admin saves settings, serve the schema defaults
    // without creating the document (admin PATCH routes upsert it).
    const stored = await SiteSettings.findOne({ settingsId: "default" }).lean();
    const settings =
      stored ?? new SiteSettings({ settingsId: "default" }).toObject();

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

app.post("/api/admin/users/:id/grant-admin", sensitiveRateLimiter, async (req, res) => {
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

app.post("/api/admin/users/:id/revoke-admin", sensitiveRateLimiter, async (req, res) => {
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
    // Default tiers are seeded once at startup (startServer), not on reads.
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
  // Rendered as <img src> on the public landing page: allow only https URLs
  // (uploaded S3 objects or pasted links), never javascript:/data:/http:.
  logo_url: z
    .string()
    .trim()
    .max(2048)
    .url()
    // zod still runs refinements after .url() fails, so parse defensively.
    .refine((value) => URL.canParse(value) && new URL(value).protocol === "https:", {
      message: "Logo URL must use https.",
    })
    .nullable(),
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
  sensitiveRateLimiter,
  async (req, res, next) => {
    const adminUserId = await requireAdminAuth(req, res);
    if (!adminUserId) return;
    next();
  },
  upload.single("logo"),
  async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Please select a valid logo image." });
    }

    // The multer filter only sees the client-declared MIME type; confirm the
    // bytes really are that image format before storing them.
    const detectedType = detectImageType(req.file.buffer);
    if (!detectedType) {
      return res.status(400).json({
        error: "File is not a valid PNG, JPEG, or WebP image.",
      });
    }
    if (detectedType !== req.file.mimetype) {
      return res.status(400).json({
        error: "File contents do not match its declared image type.",
      });
    }

    if (!isS3Configured()) {
      return res.status(503).json({
        error: "AWS S3 storage is not configured. Cannot upload branding logo.",
      });
    }

    const key = `branding/${randomUUID()}.${IMAGE_EXTENSIONS[detectedType]}`;

    await getS3Client().send(
      new PutObjectCommand({
        Bucket: s3Bucket,
        Key: key,
        Body: req.file.buffer,
        ContentType: detectedType,
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

    const targetBill = await Bill.findOne({ _id: req.params.id, userId });
    if (!targetBill) {
      return res.status(404).json({ error: "Bill not found." });
    }

    if (targetBill.planId) {
      return res.status(400).json({
        error:
          "Individual installment bills cannot be directly modified. Manage the parent installment plan instead.",
      });
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

    const targetBill = await Bill.findOne({ _id: req.params.id, userId });
    if (!targetBill) {
      return res.status(404).json({ error: "Bill not found." });
    }

    if (targetBill.planId) {
      return res.status(400).json({
        error:
          "Individual installment bills cannot be deleted directly. Cancel the installment plan to clean up unpaid installments.",
      });
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

// GET /api/payments — get all payment records for authenticated user
app.get("/api/payments", async (req, res) => {
  try {
    const { userId } = getAuth(req);

    if (!userId) {
      return res.status(401).json({ error: "Authentication required." });
    }

    const payments = await Payment.find({ userId })
      .sort({ paymentDate: -1, createdAt: -1 })
      .lean();

    return res.status(200).json(payments);
  } catch (error) {
    console.error("Failed to list user payments:", error);
    return res.status(500).json({ error: "Failed to list user payments." });
  }
});

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

// Helper to sync parent InstallmentPlan balance and completion status
async function syncInstallmentPlanBalance(
  userId: string,
  planId: mongoose.Types.ObjectId | string,
): Promise<void> {
  const plan = await InstallmentPlan.findOne({ _id: planId, userId });
  if (!plan) return;

  const planBills = await Bill.find({ planId: plan._id, userId }).select("_id").lean();
  const billIds = planBills.map((b) => b._id);

  const paymentsAgg = await Payment.aggregate([
    {
      $match: {
        billId: { $in: billIds },
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

  const totalPaid = Math.round((paymentsAgg[0]?.totalPaid ?? 0) * 100) / 100;
  const remainingBalance = Math.max(
    0,
    Math.round((plan.scheduledTotal - totalPaid) * 100) / 100,
  );
  const isCompleted = remainingBalance <= 0.001;

  await InstallmentPlan.updateOne(
    { _id: plan._id, userId },
    {
      $set: {
        totalPaid,
        remainingBalance,
        ...(isCompleted && plan.status !== "cancelled"
          ? { status: "completed" }
          : {}),
      },
    },
  );
}

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

    let payment;
    try {
      payment = await Payment.create({
        userId,
        billId: bill._id,
        amount: parsed.data.amount,
        paymentDate: parsed.data.paymentDate,
        method: parsed.data.method,
        status: parsed.data.status ?? "completed",
        reference: parsed.data.reference ?? null,
        notes: parsed.data.notes ?? null,
        idempotencyKey: parsed.data.idempotencyKey ?? null,
      });
    } catch (err: unknown) {
      const mongoErr = err as { code?: number };
      if (mongoErr?.code === 11000) {
        return res.status(409).json({
          error: "Duplicate payment submission detected for this request.",
        });
      }
      throw err;
    }

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
        const updateResult = await Bill.updateOne(
          { _id: bill._id, userId, status: { $ne: "paid" } },
          { $set: { status: "paid" } },
        );

        if (updateResult.modifiedCount > 0) {
          // Mark any active unread notifications for this bill as read
          await Notification.updateMany(
            { userId, billId: bill._id, isRead: false },
            { $set: { isRead: true } },
          );
        }
      }

      // If this bill belongs to an installment plan, sync the plan balance
      if (bill.planId) {
        await syncInstallmentPlanBalance(userId, bill.planId);
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
// Installment Plans (EMI) Endpoints
// ──────────────────────────────────────────────

// POST /api/installments — create an installment plan and its finite schedule
app.post("/api/installments", async (req, res) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) {
      return res.status(401).json({ error: "Authentication required." });
    }

    const parsed = installmentPlanCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid installment plan data.",
        details: parsed.error.flatten(),
      });
    }

    const anchorDay =
      parsed.data.recurringDay ?? parsed.data.startDate.getUTCDate();

    const totals = calculateInstallmentPlanTotals({
      principalAmount: parsed.data.principalAmount,
      downPayment: parsed.data.downPayment,
      totalInstallments: parsed.data.totalInstallments,
      interestRate: parsed.data.interestRate,
    });

    const startYear = parsed.data.startDate.getUTCFullYear();
    const startMonth = parsed.data.startDate.getUTCMonth();

    // Generate the finite schedule template of N installment Bill documents
    const installmentBillsData: Array<
      Pick<
        BillDocument,
        | "userId"
        | "name"
        | "amount"
        | "dueDate"
        | "status"
        | "category"
        | "isSubscription"
        | "recurrenceType"
        | "installmentNumber"
        | "totalInstallments"
      >
    > = [];
    for (let k = 1; k <= parsed.data.totalInstallments; k++) {
      const monthOffset = k - 1;
      const currentMonthTotal = startMonth + monthOffset;
      const targetYear = startYear + Math.floor(currentMonthTotal / 12);
      const targetMonthIndex = currentMonthTotal % 12;

      const dueDate = calculateOccurrenceDueDate(
        anchorDay,
        targetYear,
        targetMonthIndex,
      );

      // Adjust rounding difference on the final installment so sum equals scheduledTotal exact
      const isFinal = k === parsed.data.totalInstallments;
      const amount = isFinal
        ? Math.round(
            (totals.baseInstallmentAmount + totals.roundingDifference) * 100,
          ) / 100
        : totals.baseInstallmentAmount;

      installmentBillsData.push({
        userId,
        name: `${parsed.data.name} (${k}/${parsed.data.totalInstallments})`,
        amount,
        dueDate,
        status: "pending" as const,
        category: parsed.data.category ?? "finance",
        isSubscription: false,
        recurrenceType: "one_time" as const,
        installmentNumber: k,
        totalInstallments: parsed.data.totalInstallments,
      });
    }

    const planData = {
      userId,
      name: parsed.data.name,
      planType: parsed.data.planType ?? "other",
      category: parsed.data.category ?? "finance",
      principalAmount: parsed.data.principalAmount,
      downPayment: parsed.data.downPayment ?? 0,
      financedAmount: totals.financedAmount,
      totalInstallments: parsed.data.totalInstallments,
      interestRate: parsed.data.interestRate ?? 0,
      totalInterest: totals.totalInterest,
      scheduledTotal: totals.scheduledTotal,
      installmentAmount: totals.baseInstallmentAmount,
      startDate: parsed.data.startDate,
      recurringDay: anchorDay,
      totalPaid: 0,
      remainingBalance: totals.scheduledTotal,
      status: "active" as const,
      idempotencyKey: parsed.data.idempotencyKey ?? null,
    };

    let session: mongoose.ClientSession | null = null;
    let createdPlan: InstanceType<typeof InstallmentPlan> | null = null;
    let insertedBills: unknown[] | null = null;

    try {
      session = await mongoose.startSession();
      session.startTransaction();
    } catch {
      session = null;
    }

    if (session) {
      try {
        const plan = new InstallmentPlan(planData);
        await plan.save({ session });

        const billsToInsert = installmentBillsData.map((b) => ({
          ...b,
          planId: plan._id,
        }));

        const bills = await Bill.insertMany(billsToInsert, { session });
        await session.commitTransaction();

        createdPlan = plan;
        insertedBills = bills;
      } catch (txError: unknown) {
        try {
          await session.abortTransaction();
        } catch {
          // Suppress abort errors so original error is not lost
        }

        const isTxUnsupported =
          txError instanceof Error &&
          (txError.message.includes(
            "Transaction numbers are only allowed on a replica set member or mongos",
          ) ||
            txError.message.includes("replica set") ||
            (txError as { code?: number }).code === 20);

        if (!isTxUnsupported) {
          // If this is a real error like duplicate key (11000) or validation error, rethrow immediately
          throw txError;
        }

        // Standalone MongoDB environment detected; fall through to non-transactional creation with compensation
        createdPlan = null;
        insertedBills = null;
      } finally {
        await session.endSession();
        session = null;
      }
    }

    // Standalone fallback: executed only if sessions cannot start or transactions are unsupported
    if (!createdPlan) {
      const plan = new InstallmentPlan(planData);
      await plan.save();
      createdPlan = plan;

      try {
        const billsToInsert = installmentBillsData.map((b) => ({
          ...b,
          planId: plan._id,
        }));
        insertedBills = await Bill.insertMany(billsToInsert);
      } catch (insertError) {
        // Rollback partially created plan and bills on standalone failure
        await Bill.deleteMany({ planId: plan._id, userId });
        await InstallmentPlan.findByIdAndDelete(plan._id);
        throw insertError;
      }
    }

    return res.status(201).json({
      plan: createdPlan.toObject(),
      installments: insertedBills!.map((b) =>
        typeof (b as { toObject?: () => unknown }).toObject === "function"
          ? (b as { toObject: () => unknown }).toObject()
          : b,
      ),
    });
  } catch (error: unknown) {
    const mongoErr = error as { code?: number };
    if (mongoErr?.code === 11000) {
      return res.status(409).json({
        error: "Duplicate installment plan creation detected for this request.",
      });
    }
    console.error("Failed to create installment plan:", error);
    return res.status(500).json({ error: "Failed to create installment plan." });
  }
});

// GET /api/installments — list all installment plans for authenticated user
app.get("/api/installments", async (req, res) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) {
      return res.status(401).json({ error: "Authentication required." });
    }

    const rawStatus = req.query.status;
    const filter: Record<string, unknown> = { userId };
    if (
      typeof rawStatus === "string" &&
      ["active", "completed", "cancelled"].includes(rawStatus)
    ) {
      filter.status = rawStatus;
    }

    const plans = await InstallmentPlan.find(filter)
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json(plans);
  } catch (error) {
    console.error("Failed to list installment plans:", error);
    return res.status(500).json({ error: "Failed to list installment plans." });
  }
});

// GET /api/installments/:id — get one plan with its full installment schedule
app.get("/api/installments/:id", async (req, res) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) {
      return res.status(401).json({ error: "Authentication required." });
    }

    if (!isValidPlanId(req.params.id)) {
      return res.status(400).json({ error: "Invalid installment plan ID format." });
    }

    const plan = await InstallmentPlan.findOne({
      _id: req.params.id,
      userId,
    }).lean();

    if (!plan) {
      return res.status(404).json({ error: "Installment plan not found." });
    }

    const installments = await Bill.find({
      planId: req.params.id,
      userId,
    })
      .sort({ installmentNumber: 1 })
      .lean();

    return res.status(200).json({
      plan,
      installments,
    });
  } catch (error) {
    console.error("Failed to get installment plan:", error);
    return res.status(500).json({ error: "Failed to get installment plan." });
  }
});

// PATCH /api/installments/:id — safe metadata update (name, category, planType)
app.patch("/api/installments/:id", async (req, res) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) {
      return res.status(401).json({ error: "Authentication required." });
    }

    if (!isValidPlanId(req.params.id)) {
      return res.status(400).json({ error: "Invalid installment plan ID format." });
    }

    const plan = await InstallmentPlan.findOne({ _id: req.params.id, userId });
    if (!plan) {
      return res.status(404).json({ error: "Installment plan not found." });
    }

    if (plan.status !== "active") {
      return res.status(400).json({
        error: `Cannot update an installment plan with status '${plan.status}'.`,
      });
    }

    const parsed = installmentPlanUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid update data.",
        details: parsed.error.flatten(),
      });
    }

    if (parsed.data.name !== undefined) {
      plan.name = parsed.data.name;
    }
    if (parsed.data.category !== undefined) {
      plan.category = parsed.data.category;
    }
    if (parsed.data.planType !== undefined) {
      plan.planType = parsed.data.planType;
    }

    await plan.save();

    // Sync category changes to unpaid future installments
    if (parsed.data.category !== undefined) {
      await Bill.updateMany(
        { planId: plan._id, userId, status: { $ne: "paid" } },
        { $set: { category: parsed.data.category } },
      );
    }

    // Sync name changes to unpaid future installments
    if (parsed.data.name !== undefined) {
      const unpaidBills = await Bill.find({
        planId: plan._id,
        userId,
        status: { $ne: "paid" },
      });
      for (const b of unpaidBills) {
        if (b.installmentNumber && b.totalInstallments) {
          b.name = `${plan.name} (${b.installmentNumber}/${b.totalInstallments})`;
          await b.save();
        }
      }
    }

    return res.status(200).json(plan.toObject());
  } catch (error) {
    console.error("Failed to update installment plan:", error);
    return res.status(500).json({ error: "Failed to update installment plan." });
  }
});

// POST /api/installments/:id/cancel — cancel a plan and safely clean up unpaid future installments
app.post("/api/installments/:id/cancel", async (req, res) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) {
      return res.status(401).json({ error: "Authentication required." });
    }

    if (!isValidPlanId(req.params.id)) {
      return res.status(400).json({ error: "Invalid installment plan ID format." });
    }

    const plan = await InstallmentPlan.findOne({ _id: req.params.id, userId });
    if (!plan) {
      return res.status(404).json({ error: "Installment plan not found." });
    }

    if (plan.status === "completed") {
      return res.status(400).json({
        error: "Completed installment plans cannot be cancelled.",
      });
    }

    if (plan.status === "cancelled") {
      return res.status(400).json({
        error: "Installment plan is already cancelled.",
      });
    }

    plan.status = "cancelled";
    await plan.save();

    // Identify unpaid installment bills before deleting them
    const unpaidBills = await Bill.find({
      planId: plan._id,
      userId,
      status: { $ne: "paid" },
    })
      .select("_id")
      .lean();

    const unpaidBillIds = unpaidBills.map((b) => b._id);

    if (unpaidBillIds.length > 0) {
      // Clean up reminder notifications associated with the unpaid bills
      await cleanUpNotificationsForBills(userId, unpaidBillIds);

      // Safely delete only unpaid installment occurrences (status != 'paid')
      // All paid installments, their payment records, and historical notifications are strictly preserved!
      await Bill.deleteMany({
        _id: { $in: unpaidBillIds },
        userId,
      });
    }

    return res.status(200).json({
      message: "Installment plan cancelled successfully.",
      plan: plan.toObject(),
    });
  } catch (error) {
    console.error("Failed to cancel installment plan:", error);
    return res.status(500).json({ error: "Failed to cancel installment plan." });
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

    // 3. Show reminders saved before the rupee change in rupees too
    await convertLegacyReminderCurrency(userId);

    // 4. Query active (non-dismissed) notifications
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

// ──────────────────────────────────────────────
// Fallback 404 and error handling (must be registered after all routes)
// ──────────────────────────────────────────────

export function notFoundHandler(
  _req: express.Request,
  res: express.Response,
): void {
  res.status(404).json({ error: "Route not found." });
}

export function apiErrorHandler(
  err: unknown,
  _req: express.Request,
  res: express.Response,
  next: express.NextFunction,
): void {
  if (res.headersSent) {
    next(err);
    return;
  }

  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({ error: "Logo image must be 2 MB or smaller." });
      return;
    }
    res.status(400).json({ error: "Invalid file upload." });
    return;
  }

  if (err instanceof UnsupportedFileTypeError) {
    res.status(400).json({ error: err.message });
    return;
  }

  // body-parser (express.json) errors carry a `type` and an HTTP status.
  const httpErr = err as { type?: string; status?: number; statusCode?: number };
  if (httpErr?.type === "entity.parse.failed") {
    res.status(400).json({ error: "Malformed JSON request body." });
    return;
  }
  if (httpErr?.type === "entity.too.large") {
    res.status(413).json({ error: "Request body is too large." });
    return;
  }

  const status = httpErr?.status ?? httpErr?.statusCode;
  if (typeof status === "number" && status >= 400 && status < 500) {
    res.status(status).json({ error: "Invalid request." });
    return;
  }

  console.error("Unhandled API error:", err);
  res.status(500).json({ error: "Internal server error." });
}

app.use(notFoundHandler);
app.use(apiErrorHandler);

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

/**
 * Summarizes a startup failure for logs: the error name and message (plus the
 * cause's), with credentials in any connection string replaced by "***".
 */
export function describeStartupError(error: unknown): string {
  const redact = (text: string) =>
    text.replace(/(mongodb(?:\+srv)?:\/\/)[^@/\s]+@/gi, "$1***@");

  if (!(error instanceof Error)) {
    return redact(String(error));
  }

  let summary = `${error.name}: ${error.message}`;
  const cause = (error as { cause?: unknown }).cause;
  if (cause instanceof Error) {
    summary += ` (cause: ${cause.name}: ${cause.message})`;
  }
  return redact(summary);
}

export async function startServer(): Promise<void> {
  try {
    await connectDB();
    await seedPricingTiersIfEmpty();

    server = app.listen(PORT, () => {
      console.log(`BillFlow API running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error(
      `Failed to start BillFlow API: ${describeStartupError(error)}\n` +
        "Check MONGODB_URI, Atlas database user, and Atlas network access.",
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
  InstallmentPlan,
  calculateInstallmentPlanTotals,
  installmentPlanCreateSchema,
  installmentPlanUpdateSchema,
  isValidPlanId,
  syncInstallmentPlanBalance,
};