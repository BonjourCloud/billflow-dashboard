import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { startHarness, type Harness } from "./harness";
import { registerClerkUser } from "./fakeClerk";
import { User } from "../../../server/src/index";

const OWNER = "user_owner";
const BOB = "user_bob";

describe("Phase 4D — admin role management over HTTP", () => {
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
    process.env.ADMIN_CLERK_USER_IDS = OWNER;
    registerClerkUser({ id: OWNER, email: "owner@example.com", firstName: "Olive" });
    registerClerkUser({ id: BOB, email: "bob@example.com", firstName: "Bob" });
  });

  it("lets a bootstrap admin list users with their admin flags", async () => {
    const res = await harness.request<
      Array<{ id: string; email: string; is_admin: boolean; is_bootstrap_admin: boolean }>
    >("GET", "/api/admin/users", { user: OWNER });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: OWNER,
          email: "owner@example.com",
          is_admin: true,
          is_bootstrap_admin: true,
        }),
        expect.objectContaining({
          id: BOB,
          email: "bob@example.com",
          is_admin: false,
          is_bootstrap_admin: false,
        }),
      ]),
    );
  });

  it("grants and revokes admin access end to end", async () => {
    expect(
      (await harness.request("GET", "/api/admin/summary", { user: BOB })).status,
    ).toBe(403);

    const grant = await harness.request("POST", `/api/admin/users/${BOB}/grant-admin`, {
      user: OWNER,
      body: {},
    });
    expect(grant.status).toBe(200);
    expect((await User.findOne({ clerkUserId: BOB }).lean())?.role).toBe("admin");

    const bobRole = await harness.request("GET", "/api/users/me/role", { user: BOB });
    expect(bobRole.body).toEqual({ role: "admin" });
    const summary = await harness.request<{ adminCount: number }>(
      "GET",
      "/api/admin/summary",
      { user: BOB },
    );
    expect(summary.status).toBe(200);
    expect(summary.body.adminCount).toBe(2);

    const revoke = await harness.request(
      "POST",
      `/api/admin/users/${BOB}/revoke-admin`,
      { user: OWNER, body: {} },
    );
    expect(revoke.status).toBe(200);
    expect(
      (await harness.request("GET", "/api/admin/summary", { user: BOB })).status,
    ).toBe(403);
  });

  it("blocks revoking yourself or an environment bootstrap admin", async () => {
    await harness.request("POST", `/api/admin/users/${BOB}/grant-admin`, {
      user: OWNER,
      body: {},
    });

    const self = await harness.request("POST", `/api/admin/users/${BOB}/revoke-admin`, {
      user: BOB,
      body: {},
    });
    expect(self.status).toBe(400);

    const bootstrap = await harness.request(
      "POST",
      `/api/admin/users/${OWNER}/revoke-admin`,
      { user: BOB, body: {} },
    );
    expect(bootstrap.status).toBe(400);
  });

  it("returns 404 when granting admin to an unknown Clerk user", async () => {
    const res = await harness.request(
      "POST",
      "/api/admin/users/user_missing/grant-admin",
      { user: OWNER, body: {} },
    );
    expect(res.status).toBe(404);
    expect(await User.countDocuments({ clerkUserId: "user_missing" })).toBe(0);
  });

  it("drops a bootstrap admin's access once removed from ADMIN_CLERK_USER_IDS", async () => {
    // Signing in as a bootstrap admin must not persist the role.
    const before = await harness.request("GET", "/api/users/me/role", { user: OWNER });
    expect(before.body).toEqual({ role: "admin" });
    expect((await User.findOne({ clerkUserId: OWNER }).lean())?.role).toBe("user");

    process.env.ADMIN_CLERK_USER_IDS = "";
    const after = await harness.request("GET", "/api/users/me/role", { user: OWNER });
    expect(after.body).toEqual({ role: "user" });
    expect(
      (await harness.request("GET", "/api/admin/users", { user: OWNER })).status,
    ).toBe(403);
  });

  it("accepts only https logo URLs in branding settings", async () => {
    const branding = {
      brand_name: "BillFlow",
      hero_headline: "Headline",
      hero_subheadline: "Subheadline",
      hero_cta_label: "Start",
    };

    for (const logo_url of [
      "javascript:alert(1)",
      "data:image/png;base64,AAAA",
      "http://cdn.example.com/logo.png",
      "ftp://cdn.example.com/logo.png",
      "not a url",
      "",
      `https://cdn.example.com/${"a".repeat(2100)}.png`,
    ]) {
      const res = await harness.request("PATCH", "/api/admin/branding", {
        user: OWNER,
        body: { ...branding, logo_url },
      });
      expect(res.status, logo_url.slice(0, 40)).toBe(400);
    }

    const httpsLogo = "https://billflow.s3.us-east-1.amazonaws.com/branding/logo.png";
    for (const logo_url of [httpsLogo, null]) {
      const res = await harness.request("PATCH", "/api/admin/branding", {
        user: OWNER,
        body: { ...branding, logo_url },
      });
      expect(res.status).toBe(200);
    }

    const settings = await harness.request<{ logo_url: string | null }>(
      "GET",
      "/api/site-settings",
    );
    expect(settings.body.logo_url).toBeNull();
  });

  it("lets admins manage pricing tiers while hiding hidden tiers publicly", async () => {
    const created = await harness.request<{ id: string }>(
      "POST",
      "/api/admin/pricing-tiers",
      {
        user: OWNER,
        body: {
          slug: "internal",
          name: "Internal",
          price_monthly: 0,
          price_yearly: 0,
          billing_period: "month",
          cta_label: "Contact us",
          is_highlighted: false,
          is_visible: false,
          sort_order: 99,
          features: ["Hidden"],
        },
      },
    );
    expect(created.status, JSON.stringify(created.body)).toBe(201);

    const publicTiers = await harness.request<Array<{ slug: string }>>(
      "GET",
      "/api/pricing-tiers",
    );
    expect(publicTiers.body.map((t) => t.slug)).not.toContain("internal");

    const adminTiers = await harness.request<Array<{ slug: string }>>(
      "GET",
      "/api/pricing-tiers?includeHidden=true",
      { user: OWNER },
    );
    expect(adminTiers.body.map((t) => t.slug)).toContain("internal");
  });
});
