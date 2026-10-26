import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { startHarness, type Harness } from "./harness";
import { registerClerkUser } from "./fakeClerk";
import { seedPricingTiersIfEmpty } from "../../../server/src/index";
import {
  PricingTier,
  DEFAULT_PRICING_TIERS,
} from "../../../server/src/models/PricingTier";
import { SiteSettings } from "../../../server/src/models/SiteSettings";

const ADMIN = "user_admin";

const branding = {
  brand_name: "Acme Bills",
  hero_headline: "Headline",
  hero_subheadline: "Subheadline",
  hero_cta_label: "Start",
  logo_url: null,
};

describe("Public read endpoints have no write side effects", () => {
  let harness: Harness;
  const originalAdminIds = process.env.ADMIN_CLERK_USER_IDS;

  beforeAll(async () => {
    harness = await startHarness();
  });

  afterAll(async () => {
    await harness?.stop();
    process.env.ADMIN_CLERK_USER_IDS = originalAdminIds;
  });

  beforeEach(async () => {
    await harness.resetDatabase();
    process.env.ADMIN_CLERK_USER_IDS = ADMIN;
    registerClerkUser({ id: ADMIN, email: "admin@example.com" });
  });

  it("serves default site settings on an empty database without creating them", async () => {
    const responses = await Promise.all(
      Array.from({ length: 5 }, () => harness.request<Record<string, unknown>>("GET", "/api/site-settings")),
    );

    for (const res of responses) {
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        id: "default",
        brand_name: "BillFlow",
        logo_url: null,
        logo_display_url: null,
        theme_font_pair: "inter",
      });
      expect(typeof res.body.updated_at).toBe("string");
    }
    expect(await SiteSettings.countDocuments()).toBe(0);
  });

  it("persists settings on the first admin save, even when saves race", async () => {
    const saves = await Promise.all(
      Array.from({ length: 4 }, () =>
        harness.request("PATCH", "/api/admin/branding", { user: ADMIN, body: branding }),
      ),
    );
    for (const res of saves) expect(res.status).toBe(200);
    expect(await SiteSettings.countDocuments()).toBe(1);

    const res = await harness.request<{ brand_name: string }>("GET", "/api/site-settings");
    expect(res.body.brand_name).toBe("Acme Bills");
    expect(await SiteSettings.countDocuments()).toBe(1);
  });

  it("does not seed pricing tiers on read", async () => {
    const res = await harness.request<unknown[]>("GET", "/api/pricing-tiers");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
    expect(await PricingTier.countDocuments()).toBe(0);
  });

  it("does not resurrect tiers an admin deleted", async () => {
    await seedPricingTiersIfEmpty();
    const tiers = await harness.request<Array<{ id: string }>>(
      "GET",
      "/api/pricing-tiers?includeHidden=true",
      { user: ADMIN },
    );
    for (const tier of tiers.body) {
      const res = await harness.request("DELETE", `/api/admin/pricing-tiers/${tier.id}`, {
        user: ADMIN,
      });
      expect(res.status).toBe(200);
    }

    const after = await harness.request<unknown[]>("GET", "/api/pricing-tiers");
    expect(after.body).toEqual([]);
    expect(await PricingTier.countDocuments()).toBe(0);
  });

  it("seeds each default tier exactly once under concurrent startup", async () => {
    await Promise.all(Array.from({ length: 6 }, () => seedPricingTiersIfEmpty()));

    const slugs = (await PricingTier.find().lean()).map((t) => t.slug).sort();
    expect(slugs).toEqual(DEFAULT_PRICING_TIERS.map((t) => t.slug).sort());

    const res = await harness.request<Array<{ slug: string }>>("GET", "/api/pricing-tiers");
    expect(res.body.length).toBeGreaterThan(0);
  });

  it("leaves existing tiers untouched when seeding a non-empty collection", async () => {
    await harness.request("POST", "/api/admin/pricing-tiers", {
      user: ADMIN,
      body: {
        slug: "custom",
        name: "Custom",
        price_monthly: 5,
        price_yearly: 50,
        billing_period: "month",
        cta_label: "Buy",
        features: [],
      },
    });

    await seedPricingTiersIfEmpty();

    const slugs = (await PricingTier.find().lean()).map((t) => t.slug);
    expect(slugs).toEqual(["custom"]);
  });
});
