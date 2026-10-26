import { describe, it, expect } from "vitest";
import {
  createPricingTierSchema,
  updatePricingTierSchema,
  DEFAULT_PRICING_TIERS,
} from "../../server/src/models/PricingTier";

describe("Pricing Tiers Backend — Zod Validation Schemas", () => {
  const validTier = {
    slug: "pro-plus",
    name: "Pro Plus Plan",
    price_monthly: 19,
    price_yearly: 190,
    billing_period: "month" as const,
    cta_label: "Upgrade to Pro Plus",
    is_highlighted: true,
    is_visible: true,
    sort_order: 4,
    features: ["All Pro features", "Priority 24/7 support", "Custom exports"],
  };

  it("validates a complete, valid pricing tier payload", () => {
    const result = createPricingTierSchema.safeParse(validTier);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.slug).toBe("pro-plus");
      expect(result.data.name).toBe("Pro Plus Plan");
      expect(result.data.price_monthly).toBe(19);
      expect(result.data.price_yearly).toBe(190);
      expect(result.data.billing_period).toBe("month");
      expect(result.data.is_highlighted).toBe(true);
      expect(result.data.is_visible).toBe(true);
      expect(result.data.features).toHaveLength(3);
    }
  });

  it("rejects invalid slugs (uppercase, spaces, underscores, symbols)", () => {
    expect(createPricingTierSchema.safeParse({ ...validTier, slug: "Pro-Plus" }).success).toBe(false);
    expect(createPricingTierSchema.safeParse({ ...validTier, slug: "pro plus" }).success).toBe(false);
    expect(createPricingTierSchema.safeParse({ ...validTier, slug: "pro_plus" }).success).toBe(false);
    expect(createPricingTierSchema.safeParse({ ...validTier, slug: "pro@tier!" }).success).toBe(false);
    expect(createPricingTierSchema.safeParse({ ...validTier, slug: "" }).success).toBe(false);
  });

  it("rejects negative prices and prices exceeding bounds", () => {
    expect(createPricingTierSchema.safeParse({ ...validTier, price_monthly: -1 }).success).toBe(false);
    expect(createPricingTierSchema.safeParse({ ...validTier, price_yearly: -10 }).success).toBe(false);
    expect(createPricingTierSchema.safeParse({ ...validTier, price_monthly: 100000 }).success).toBe(false);
    expect(createPricingTierSchema.safeParse({ ...validTier, price_yearly: 1000000 }).success).toBe(false);
  });

  it("rejects invalid billing_period enum values", () => {
    expect(createPricingTierSchema.safeParse({ ...validTier, billing_period: "week" as unknown as "month" }).success).toBe(false);
    expect(createPricingTierSchema.safeParse({ ...validTier, billing_period: "quarter" as unknown as "month" }).success).toBe(false);
    expect(createPricingTierSchema.safeParse({ ...validTier, billing_period: "" as unknown as "month" }).success).toBe(false);
  });

  it("accepts valid billing_period values: 'month', 'year', 'forever'", () => {
    expect(createPricingTierSchema.safeParse({ ...validTier, billing_period: "month" }).success).toBe(true);
    expect(createPricingTierSchema.safeParse({ ...validTier, billing_period: "year" }).success).toBe(true);
    expect(createPricingTierSchema.safeParse({ ...validTier, billing_period: "forever" }).success).toBe(true);
  });

  it("rejects sort_order that is negative or not an integer", () => {
    expect(createPricingTierSchema.safeParse({ ...validTier, sort_order: -1 }).success).toBe(false);
    expect(createPricingTierSchema.safeParse({ ...validTier, sort_order: 1.5 }).success).toBe(false);
    expect(createPricingTierSchema.safeParse({ ...validTier, sort_order: 1000 }).success).toBe(false);
  });

  it("rejects empty feature items or exceeding 20 features", () => {
    expect(createPricingTierSchema.safeParse({ ...validTier, features: [""] }).success).toBe(false);
    expect(createPricingTierSchema.safeParse({ ...validTier, features: ["   "] }).success).toBe(false);

    const twentyFeatures = Array.from({ length: 20 }, (_, i) => `Feature ${i + 1}`);
    expect(createPricingTierSchema.safeParse({ ...validTier, features: twentyFeatures }).success).toBe(true);

    const twentyOneFeatures = Array.from({ length: 21 }, (_, i) => `Feature ${i + 1}`);
    expect(createPricingTierSchema.safeParse({ ...validTier, features: twentyOneFeatures }).success).toBe(false);
  });

  it("validates partial updates with updatePricingTierSchema", () => {
    // Valid partials
    expect(updatePricingTierSchema.safeParse({ price_monthly: 25 }).success).toBe(true);
    expect(updatePricingTierSchema.safeParse({ is_visible: false }).success).toBe(true);
    expect(updatePricingTierSchema.safeParse({ features: ["New feature"] }).success).toBe(true);

    // Invalid partials
    expect(updatePricingTierSchema.safeParse({ price_monthly: -5 }).success).toBe(false);
    expect(updatePricingTierSchema.safeParse({ slug: "INVALID SLUG" }).success).toBe(false);
  });
});

describe("Pricing Tiers Backend — Canonical Seed Data", () => {
  it("contains exactly the three canonical tiers: free, pro, enterprise", () => {
    expect(DEFAULT_PRICING_TIERS).toHaveLength(3);
    const slugs = DEFAULT_PRICING_TIERS.map((t) => t.slug);
    expect(slugs).toEqual(["free", "pro", "enterprise"]);
  });

  it("configures free tier with 0 price and forever period", () => {
    const free = DEFAULT_PRICING_TIERS.find((t) => t.slug === "free");
    expect(free).toBeDefined();
    expect(free?.price_monthly).toBe(0);
    expect(free?.price_yearly).toBe(0);
    expect(free?.billing_period).toBe("forever");
    expect(free?.is_visible).toBe(true);
    expect(free?.is_highlighted).toBe(false);
    expect(free?.sort_order).toBe(1);
  });

  it("configures pro tier as highlighted with $9/mo and $90/yr", () => {
    const pro = DEFAULT_PRICING_TIERS.find((t) => t.slug === "pro");
    expect(pro).toBeDefined();
    expect(pro?.price_monthly).toBe(9);
    expect(pro?.price_yearly).toBe(90);
    expect(pro?.billing_period).toBe("month");
    expect(pro?.is_visible).toBe(true);
    expect(pro?.is_highlighted).toBe(true);
    expect(pro?.sort_order).toBe(2);
  });

  it("configures enterprise tier with $29/mo and $290/yr", () => {
    const enterprise = DEFAULT_PRICING_TIERS.find((t) => t.slug === "enterprise");
    expect(enterprise).toBeDefined();
    expect(enterprise?.price_monthly).toBe(29);
    expect(enterprise?.price_yearly).toBe(290);
    expect(enterprise?.billing_period).toBe("month");
    expect(enterprise?.is_visible).toBe(true);
    expect(enterprise?.is_highlighted).toBe(false);
    expect(enterprise?.sort_order).toBe(3);
  });

  it("validates all canonical seed tiers against createPricingTierSchema", () => {
    for (const tier of DEFAULT_PRICING_TIERS) {
      const parsed = createPricingTierSchema.safeParse(tier);
      expect(parsed.success).toBe(true);
    }
  });
});

describe("Pricing Tiers Backend — Public vs Admin Visibility Logic", () => {
  interface MockTierDoc {
    _id: string;
    slug: string;
    name: string;
    price_monthly: number;
    price_yearly: number;
    billing_period: string;
    cta_label: string;
    is_highlighted: boolean;
    is_visible: boolean;
    sort_order: number;
    features: string[];
    createdAt: Date;
    updatedAt: Date;
  }

  const mockTiers: MockTierDoc[] = [
    {
      _id: "507f1f77bcf86cd799439011",
      slug: "free",
      name: "Free",
      price_monthly: 0,
      price_yearly: 0,
      billing_period: "forever",
      cta_label: "Get Started",
      is_highlighted: false,
      is_visible: true,
      sort_order: 1,
      features: ["Up to 10 bills"],
      createdAt: new Date("2026-10-01T00:00:00Z"),
      updatedAt: new Date("2026-10-01T00:00:00Z"),
    },
    {
      _id: "507f1f77bcf86cd799439012",
      slug: "pro",
      name: "Pro",
      price_monthly: 9,
      price_yearly: 90,
      billing_period: "month",
      cta_label: "Start Free Trial",
      is_highlighted: true,
      is_visible: true,
      sort_order: 2,
      features: ["Unlimited bills"],
      createdAt: new Date("2026-10-01T00:00:00Z"),
      updatedAt: new Date("2026-10-01T00:00:00Z"),
    },
    {
      _id: "507f1f77bcf86cd799439013",
      slug: "secret-beta",
      name: "Secret Beta",
      price_monthly: 49,
      price_yearly: 490,
      billing_period: "month",
      cta_label: "Early Access",
      is_highlighted: false,
      is_visible: false, // HIDDEN TIER
      sort_order: 99,
      features: ["Experimental AI features"],
      createdAt: new Date("2026-10-01T00:00:00Z"),
      updatedAt: new Date("2026-10-01T00:00:00Z"),
    },
  ];

  function simulateGetPricingTiers(
    includeHiddenParam: boolean,
    callerUserId: string | null,
    callerIsAdmin: boolean,
  ) {
    let showAll = false;
    if (includeHiddenParam && callerUserId && callerIsAdmin) {
      showAll = true;
    }

    const filtered = showAll
      ? mockTiers
      : mockTiers.filter((t) => t.is_visible);

    return filtered.map((t) => ({
      id: t._id,
      slug: t.slug,
      name: t.name,
      price_monthly: t.price_monthly,
      price_yearly: t.price_yearly,
      billing_period: t.billing_period,
      cta_label: t.cta_label,
      is_highlighted: t.is_highlighted,
      is_visible: t.is_visible,
      sort_order: t.sort_order,
      features: t.features,
      updated_at: t.updatedAt.toISOString(),
    }));
  }

  it("returns only visible tiers for unauthenticated public visitor", () => {
    const results = simulateGetPricingTiers(false, null, false);
    expect(results).toHaveLength(2);
    expect(results.some((t) => t.slug === "secret-beta")).toBe(false);
  });

  it("refuses to leak hidden tiers to unauthenticated visitor even if includeHidden=true is requested", () => {
    const results = simulateGetPricingTiers(true, null, false);
    expect(results).toHaveLength(2);
    expect(results.some((t) => t.slug === "secret-beta")).toBe(false);
  });

  it("refuses to leak hidden tiers to regular authenticated user even if includeHidden=true is requested", () => {
    const results = simulateGetPricingTiers(true, "user_regular_bob", false);
    expect(results).toHaveLength(2);
    expect(results.some((t) => t.slug === "secret-beta")).toBe(false);
  });

  it("returns all tiers including hidden to verified administrator when includeHidden=true", () => {
    const results = simulateGetPricingTiers(true, "user_admin_alice", true);
    expect(results).toHaveLength(3);
    const hidden = results.find((t) => t.slug === "secret-beta");
    expect(hidden).toBeDefined();
    expect(hidden?.is_visible).toBe(false);
  });
});

describe("Pricing Tiers Backend — CRUD Operations & Error Contracts", () => {
  interface MockTier {
    id: string;
    slug: string;
    name: string;
    price_monthly: number;
    price_yearly: number;
    billing_period: string;
    cta_label: string;
    is_highlighted: boolean;
    is_visible: boolean;
    sort_order: number;
    features: string[];
  }

  let db: MockTier[] = [];

  const resetDb = () => {
    db = [
      {
        id: "507f1f77bcf86cd799439011",
        slug: "free",
        name: "Free",
        price_monthly: 0,
        price_yearly: 0,
        billing_period: "forever",
        cta_label: "Get Started",
        is_highlighted: false,
        is_visible: true,
        sort_order: 1,
        features: ["Up to 10 bills"],
      },
      {
        id: "507f1f77bcf86cd799439012",
        slug: "pro",
        name: "Pro",
        price_monthly: 9,
        price_yearly: 90,
        billing_period: "month",
        cta_label: "Start Free Trial",
        is_highlighted: true,
        is_visible: true,
        sort_order: 2,
        features: ["Unlimited bills"],
      },
    ];
  };

  const isValidObjectId = (id: string) => /^[0-9a-fA-F]{24}$/.test(id);

  function simulateCreate(callerIsAdmin: boolean, body: unknown) {
    if (!callerIsAdmin) {
      return { status: 403, error: "Admin access required." };
    }
    const parsed = createPricingTierSchema.safeParse(body);
    if (!parsed.success) {
      return { status: 400, error: parsed.error.issues?.[0]?.message || "Invalid data" };
    }
    if (db.some((t) => t.slug === parsed.data.slug)) {
      return { status: 409, error: `A pricing tier with slug '${parsed.data.slug}' already exists.` };
    }
    const newTier: MockTier = {
      id: "507f1f77bcf86cd799439099",
      ...parsed.data,
    };
    db.push(newTier);
    return { status: 201, data: newTier };
  }

  function simulateUpdate(callerIsAdmin: boolean, id: string, body: unknown) {
    if (!callerIsAdmin) {
      return { status: 403, error: "Admin access required." };
    }
    if (!isValidObjectId(id)) {
      return { status: 400, error: "Invalid pricing tier ID format." };
    }
    const parsed = updatePricingTierSchema.safeParse(body);
    if (!parsed.success) {
      return { status: 400, error: parsed.error.issues?.[0]?.message || "Invalid update data" };
    }
    const existing = db.find((t) => t.id === id);
    if (!existing) {
      return { status: 404, error: "Pricing tier not found." };
    }
    if (parsed.data.slug && db.some((t) => t.slug === parsed.data.slug && t.id !== id)) {
      return { status: 409, error: `A pricing tier with slug '${parsed.data.slug}' already exists.` };
    }
    Object.assign(existing, parsed.data);
    return { status: 200, data: existing };
  }

  function simulateDelete(callerIsAdmin: boolean, id: string) {
    if (!callerIsAdmin) {
      return { status: 403, error: "Admin access required." };
    }
    if (!isValidObjectId(id)) {
      return { status: 400, error: "Invalid pricing tier ID format." };
    }
    const index = db.findIndex((t) => t.id === id);
    if (index === -1) {
      return { status: 404, error: "Pricing tier not found." };
    }
    db.splice(index, 1);
    return { status: 200, message: "Pricing tier deleted successfully." };
  }

  it("blocks non-admin from creating, updating, or deleting tiers (403)", () => {
    resetDb();
    const createRes = simulateCreate(false, { slug: "new-plan" });
    expect(createRes.status).toBe(403);
    expect(createRes.error).toBe("Admin access required.");

    const updateRes = simulateUpdate(false, "507f1f77bcf86cd799439011", { name: "Hacked" });
    expect(updateRes.status).toBe(403);

    const deleteRes = simulateDelete(false, "507f1f77bcf86cd799439011");
    expect(deleteRes.status).toBe(403);
  });

  it("creates a tier successfully for admin and rejects duplicate slugs with 409", () => {
    resetDb();
    const newTierPayload = {
      slug: "starter",
      name: "Starter",
      price_monthly: 5,
      price_yearly: 50,
      billing_period: "month",
      cta_label: "Start Trial",
      is_highlighted: false,
      is_visible: true,
      sort_order: 1,
      features: ["5 bills"],
    };

    const res = simulateCreate(true, newTierPayload);
    expect(res.status).toBe(201);
    expect(res.data?.slug).toBe("starter");
    expect(db).toHaveLength(3);

    // Attempt to insert duplicate slug
    const duplicateRes = simulateCreate(true, newTierPayload);
    expect(duplicateRes.status).toBe(409);
    expect(duplicateRes.error).toMatch(/already exists/);
  });

  it("updates a tier, validates slug collision, and rejects invalid ObjectId with 400", () => {
    resetDb();
    // Invalid ObjectId format
    const invalidIdRes = simulateUpdate(true, "not-a-valid-id", { name: "New Name" });
    expect(invalidIdRes.status).toBe(400);
    expect(invalidIdRes.error).toMatch(/Invalid pricing tier ID format/);

    // Non-existent ObjectId
    const notFoundRes = simulateUpdate(true, "507f1f77bcf86cd799439099", { name: "Non-existent" });
    expect(notFoundRes.status).toBe(404);

    // Valid update
    const validUpdate = simulateUpdate(true, "507f1f77bcf86cd799439011", {
      name: "Free Tier Updated",
      is_visible: false,
    });
    expect(validUpdate.status).toBe(200);
    expect(validUpdate.data?.name).toBe("Free Tier Updated");
    expect(validUpdate.data?.is_visible).toBe(false);

    // Updating to a slug already taken by another tier
    const conflictUpdate = simulateUpdate(true, "507f1f77bcf86cd799439011", {
      slug: "pro", // Already used by tier 507f1f77bcf86cd799439012
    });
    expect(conflictUpdate.status).toBe(409);
    expect(conflictUpdate.error).toMatch(/already exists/);
  });

  it("deletes a tier and rejects non-existent IDs with 404", () => {
    resetDb();
    const deleteRes = simulateDelete(true, "507f1f77bcf86cd799439011");
    expect(deleteRes.status).toBe(200);
    expect(db).toHaveLength(1);

    // Delete again: now 404
    const deleteAgain = simulateDelete(true, "507f1f77bcf86cd799439011");
    expect(deleteAgain.status).toBe(404);
  });
});
