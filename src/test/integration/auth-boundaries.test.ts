import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { startHarness, listRoutes, type Harness } from "./harness";
import { registerClerkUser } from "./fakeClerk";

const PUBLIC_ROUTES = new Set([
  "GET /api/health",
  "GET /api/ready",
  "GET /api/site-settings",
  "GET /api/pricing-tiers",
  "GET /api/demo/status",
  "POST /api/demo/session",
]);

const SAMPLE_OBJECT_ID = "507f1f77bcf86cd799439011";

function concretePath(path: string): string {
  return path.replace(/:id\b/g, SAMPLE_OBJECT_ID);
}

const routes = listRoutes();
const protectedRoutes = routes.filter(
  ([method, path]) => !PUBLIC_ROUTES.has(`${method} ${path}`),
);
const adminRoutes = protectedRoutes.filter(([, path]) =>
  path.startsWith("/api/admin/"),
);

describe("Phase 4D — authentication boundaries over HTTP", () => {
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
    process.env.ADMIN_CLERK_USER_IDS = "";
  });

  it("discovers the full route table", () => {
    // Guards against the sweep silently testing nothing if routing changes.
    expect(routes.length).toBeGreaterThanOrEqual(40);
    expect(adminRoutes.length).toBeGreaterThanOrEqual(9);
    for (const route of PUBLIC_ROUTES) {
      const [method, path] = route.split(" ");
      expect(routes).toContainEqual([method, path]);
    }
  });

  it.each(protectedRoutes)(
    "%s %s rejects unauthenticated requests with JSON 401",
    async (method, path) => {
      const res = await harness.request(method, concretePath(path), {
        body: method === "GET" || method === "DELETE" ? undefined : {},
      });
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: "Authentication required." });
    },
  );

  it.each(adminRoutes)(
    "%s %s rejects signed-in non-admins with JSON 403",
    async (method, path) => {
      registerClerkUser({ id: "user_regular", email: "regular@example.com" });
      const res = await harness.request(method, concretePath(path), {
        user: "user_regular",
        body: method === "GET" || method === "DELETE" ? undefined : {},
      });
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: "Admin access required." });
    },
  );

  it("serves public routes without authentication", async () => {
    for (const route of PUBLIC_ROUTES) {
      const [method, path] = route.split(" ");
      const res = await harness.request(method, path);
      // Starting a demo session is a public POST; without DEMO_CLERK_USER_ID
      // the demo is off and it answers 404 (never 401, never a ticket).
      const expected = route === "POST /api/demo/session" ? 404 : 200;
      expect(res.status, route).toBe(expected);
    }
  });

  it("hides non-visible pricing tiers from non-admins", async () => {
    registerClerkUser({ id: "user_regular", email: "regular@example.com" });
    const all = await harness.request<Array<{ is_visible: boolean }>>(
      "GET",
      "/api/pricing-tiers?includeHidden=true",
      { user: "user_regular" },
    );
    expect(all.status).toBe(200);
    expect(all.body.every((tier) => tier.is_visible)).toBe(true);
  });
});
