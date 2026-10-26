import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { startHarness, listRoutes, type Harness } from "./harness";
import { registerClerkUser } from "./fakeClerk";
import { Bill } from "../../../server/src/models/Bill";

const ALICE = "user_alice";
const BOB = "user_bob";
const ADMIN = "user_admin";

const UNKNOWN_OBJECT_ID = "65f000000000000000000000";
const MALFORMED_IDS = ["not-an-id", "123", "65f00000000000000000000z", "%24where"];

// Routes whose :id is a Clerk user ID rather than a MongoDB ObjectId.
const USER_ID_ROUTES = new Set([
  "/api/admin/users/:id/grant-admin",
  "/api/admin/users/:id/revoke-admin",
]);

const idRoutes = listRoutes().filter(
  ([, path]) => path.includes(":id") && !USER_ID_ROUTES.has(path),
);

function bodyFor(method: string) {
  return method === "GET" || method === "DELETE" ? undefined : {};
}

describe("Request validation: IDs, injection, and malformed input", () => {
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
    vi.restoreAllMocks();
    await harness.resetDatabase();
    process.env.ADMIN_CLERK_USER_IDS = ADMIN;
    for (const id of [ALICE, BOB, ADMIN]) {
      registerClerkUser({ id, email: `${id}@example.com` });
    }
  });

  const userFor = (path: string) => (path.startsWith("/api/admin/") ? ADMIN : ALICE);

  it("covers every ObjectId route", () => {
    expect(idRoutes.length).toBeGreaterThanOrEqual(15);
  });

  it.each(idRoutes)(
    "%s %s returns a JSON 4xx (never 500) for malformed IDs",
    async (method, path) => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      for (const bad of MALFORMED_IDS) {
        const res = await harness.request<{ error?: string }>(
          method,
          path.replace(":id", bad),
          { user: userFor(path), body: bodyFor(method) },
        );
        expect(res.status, `${bad}: ${JSON.stringify(res.body)}`).toBeGreaterThanOrEqual(400);
        expect(res.status, bad).toBeLessThan(500);
        expect(typeof res.body?.error, bad).toBe("string");
      }
      expect(errorSpy).not.toHaveBeenCalled();
    },
  );

  it.each(idRoutes)(
    "%s %s returns 404 (or 400 for invalid bodies) for an unknown ObjectId",
    async (method, path) => {
      const res = await harness.request<{ error?: string }>(
        method,
        path.replace(":id", UNKNOWN_OBJECT_ID),
        { user: userFor(path), body: bodyFor(method) },
      );
      expect([400, 404], JSON.stringify(res.body)).toContain(res.status);
      expect(typeof res.body?.error).toBe("string");
    },
  );

  it("ignores user IDs supplied in query strings", async () => {
    await harness.request("POST", "/api/bills", {
      user: BOB,
      body: {
        name: "Bob's rent",
        amount: 900,
        dueDate: "2027-01-05T00:00:00.000Z",
        status: "pending",
        category: "housing",
      },
    });

    for (const path of [
      `/api/bills?userId=${BOB}`,
      `/api/payments?userId=${BOB}`,
      `/api/installments?userId=${BOB}`,
      `/api/subscriptions?userId=${BOB}`,
      `/api/notifications?userId=${BOB}`,
    ]) {
      const res = await harness.request<unknown[]>("GET", path, { user: ALICE });
      expect(res.status, path).toBe(200);
      expect(res.body, path).toEqual([]);
    }
  });

  it("rejects attempts to set or change the owner through the request body", async () => {
    const created = await harness.request<{ _id: string; userId: string }>(
      "POST",
      "/api/bills",
      {
        user: ALICE,
        body: {
          name: "Alice phone",
          amount: 40,
          dueDate: "2027-01-05T00:00:00.000Z",
          status: "pending",
          category: "utilities",
        },
      },
    );
    expect(created.status).toBe(201);
    expect(created.body.userId).toBe(ALICE);

    const withOwner = await harness.request("POST", "/api/bills", {
      user: ALICE,
      body: {
        name: "Planted",
        amount: 1,
        dueDate: "2027-01-05T00:00:00.000Z",
        status: "pending",
        category: "utilities",
        userId: BOB,
      },
    });
    expect(withOwner.status).toBe(400);

    const transfer = await harness.request("PATCH", `/api/bills/${created.body._id}`, {
      user: ALICE,
      body: { userId: BOB },
    });
    expect(transfer.status).toBe(400);
    expect((await Bill.findById(created.body._id).lean())?.userId).toBe(ALICE);
    expect(await Bill.countDocuments({ userId: BOB })).toBe(0);
  });

  it("rejects MongoDB operator injection in request bodies", async () => {
    for (const body of [
      { name: { $gt: "" }, amount: 1, dueDate: "2027-01-05", status: "pending", category: "utilities" },
      { name: "x", amount: { $ne: 0 }, dueDate: "2027-01-05", status: "pending", category: "utilities" },
      { name: "x", amount: 1, dueDate: "2027-01-05", status: { $ne: "paid" }, category: "utilities" },
    ]) {
      const res = await harness.request("POST", "/api/bills", { user: ALICE, body });
      expect(res.status).toBe(400);
    }
    expect(await Bill.countDocuments()).toBe(0);
  });

  it.each([
    ["missing fields", {}],
    ["negative amount", { name: "x", amount: -5, dueDate: "2027-01-05", status: "pending", category: "utilities" }],
    ["zero amount", { name: "x", amount: 0, dueDate: "2027-01-05", status: "pending", category: "utilities" }],
    ["string amount", { name: "x", amount: "10", dueDate: "2027-01-05", status: "pending", category: "utilities" }],
    ["bad date", { name: "x", amount: 10, dueDate: "not a date", status: "pending", category: "utilities" }],
    ["unknown category", { name: "x", amount: 10, dueDate: "2027-01-05", status: "pending", category: "travel" }],
    ["unknown status", { name: "x", amount: 10, dueDate: "2027-01-05", status: "late", category: "utilities" }],
    ["empty name", { name: "   ", amount: 10, dueDate: "2027-01-05", status: "pending", category: "utilities" }],
    ["overlong name", { name: "x".repeat(101), amount: 10, dueDate: "2027-01-05", status: "pending", category: "utilities" }],
    ["recurring day out of range", { name: "x", amount: 10, dueDate: "2027-01-05", status: "pending", category: "utilities", recurrenceType: "recurring", recurringDay: 32 }],
  ])("rejects a bill with %s with a JSON 400", async (_label, body) => {
    const res = await harness.request<{ error?: string }>("POST", "/api/bills", {
      user: ALICE,
      body,
    });
    expect(res.status).toBe(400);
    expect(typeof res.body.error).toBe("string");
    expect(await Bill.countDocuments()).toBe(0);
  });
});
