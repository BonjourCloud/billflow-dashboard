import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { startHarness, type Harness } from "./harness";
import { registerClerkUser } from "./fakeClerk";
import { Bill } from "../../../server/src/models/Bill";
import { User } from "../../../server/src/models/User";
import { Category } from "../../../server/src/models/Category";

const DEMO = "user_demo123";
const ALICE = "user_alice";
const ADMIN = "user_admin";

describe("Demo account through the real API", () => {
  let harness: Harness;
  const original = {
    demo: process.env.DEMO_CLERK_USER_ID,
    admins: process.env.ADMIN_CLERK_USER_IDS,
  };

  beforeAll(async () => {
    harness = await startHarness();
  });
  afterAll(async () => {
    await harness?.stop();
    process.env.DEMO_CLERK_USER_ID = original.demo;
    process.env.ADMIN_CLERK_USER_IDS = original.admins;
  });
  beforeEach(async () => {
    await harness.resetDatabase();
    process.env.DEMO_CLERK_USER_ID = DEMO;
    process.env.ADMIN_CLERK_USER_IDS = ADMIN;
    registerClerkUser({ id: DEMO, email: "demo@example.com" });
    registerClerkUser({ id: ALICE, email: "alice@example.com" });
    registerClerkUser({ id: ADMIN, email: "admin@example.com" });
  });

  const as = (user: string | null) => ({
    get: <T = unknown>(p: string) => harness.request<T>("GET", p, { user }),
    post: <T = unknown>(p: string, body: unknown = {}) =>
      harness.request<T>("POST", p, { user, body }),
  });
  const anon = as(null);
  const demo = as(DEMO);
  const alice = as(ALICE);
  const admin = as(ADMIN);

  const ageDemoData = (ms: number) =>
    User.updateOne(
      { clerkUserId: DEMO },
      { $set: { demoSeededAt: new Date(Date.now() - ms) } },
    );

  it("reports whether the demo is enabled and who is the demo user", async () => {
    expect((await anon.get("/api/demo/status")).body).toEqual({ enabled: true, isDemoUser: false });
    expect((await alice.get("/api/demo/status")).body).toEqual({ enabled: true, isDemoUser: false });
    expect((await demo.get("/api/demo/status")).body).toEqual({ enabled: true, isDemoUser: true });

    process.env.DEMO_CLERK_USER_ID = "";
    expect((await anon.get("/api/demo/status")).body).toEqual({ enabled: false, isDemoUser: false });
  });

  it("seeds the demo data the first time the demo user is seen", async () => {
    expect(await Bill.countDocuments({ userId: DEMO })).toBe(0);
    await demo.get("/api/demo/status");

    const income = await demo.get<Array<{ name: string; amount: number }>>("/api/income");
    expect(income.body.find((i) => i.name === "Salary")?.amount).toBe(100000);
    expect(income.body).toHaveLength(3);

    expect((await demo.get<unknown[]>("/api/budgets")).body).toHaveLength(8);
    expect((await demo.get<unknown[]>("/api/installments")).body).toHaveLength(2);
    expect((await demo.get<unknown[]>("/api/subscriptions")).body.length).toBeGreaterThanOrEqual(13);

    const settings = await demo.get<{ method: string }>("/api/budget-settings");
    expect(settings.body.method).toBe("50-30-20");

    const bills = await demo.get<Array<{ name: string; amount: number }>>("/api/bills");
    expect(bills.body.some((b) => b.name === "Rent" && b.amount === 20000)).toBe(true);

    // Reminders appear from the seeded dates: an overdue and a due-soon bill.
    const notifications = await demo.get<Array<{ type: string }>>("/api/notifications");
    const types = notifications.body.map((n) => n.type);
    expect(types).toContain("overdue");
    expect(types).toContain("due_soon");
  });

  it("issues a one-time sign-in ticket for the demo user only, and seeds first", async () => {
    const res = await anon.post<{ ticket: string }>("/api/demo/session");
    expect(res.status).toBe(200);
    expect(res.body.ticket).toBe(`ticket_${DEMO}`);
    expect(await Bill.countDocuments({ userId: DEMO })).toBeGreaterThan(0);

    process.env.DEMO_CLERK_USER_ID = "";
    const off = await anon.post<{ error: string }>("/api/demo/session");
    expect(off.status).toBe(404);
  });

  it("refreshes data older than a day without being asked", async () => {
    await demo.get("/api/demo/status");
    const seeded = await Bill.countDocuments({ userId: DEMO });
    await Bill.deleteMany({ userId: DEMO });
    await ageDemoData(25 * 60 * 60 * 1000);

    await demo.get("/api/demo/status");
    expect(await Bill.countDocuments({ userId: DEMO })).toBe(seeded);
  });

  it("does not re-seed fresh data", async () => {
    await demo.get("/api/demo/status");
    await Bill.deleteMany({ userId: DEMO, name: "Rent" });
    const before = await Bill.countDocuments({ userId: DEMO });
    await demo.get("/api/demo/status");
    expect(await Bill.countDocuments({ userId: DEMO })).toBe(before);
  });

  it("lets the demo user or an admin reset, and nobody else", async () => {
    await demo.get("/api/demo/status");
    expect((await alice.post("/api/demo/reset")).status).toBe(403);

    // Edits made by visitors disappear on reset.
    await demo.post("/api/bills", {
      name: "Visitor bill",
      amount: 123,
      dueDate: "2027-01-05T00:00:00.000Z",
      status: "pending",
      category: "utilities",
    });
    expect(await Bill.countDocuments({ userId: DEMO, name: "Visitor bill" })).toBe(1);

    // Right after a seed, a reset is held back by the cooldown.
    expect((await demo.post("/api/demo/reset")).status).toBe(429);

    await ageDemoData(60 * 1000);
    const reset = await demo.post<{ success: boolean }>("/api/demo/reset");
    expect(reset.status).toBe(200);
    expect(await Bill.countDocuments({ userId: DEMO, name: "Visitor bill" })).toBe(0);

    await ageDemoData(60 * 1000);
    expect((await admin.post("/api/demo/reset")).status).toBe(200);
  });

  it("reset touches only the demo user's data", async () => {
    await alice.post("/api/bills", {
      name: "Alice bill",
      amount: 500,
      dueDate: "2027-01-05T00:00:00.000Z",
      status: "pending",
      category: "utilities",
    });
    await demo.get("/api/demo/status");
    await ageDemoData(60 * 1000);
    await demo.post("/api/demo/reset");
    expect(await Bill.countDocuments({ userId: ALICE })).toBe(1);
    expect(await Bill.countDocuments({ userId: DEMO, name: "Alice bill" })).toBe(0);
  });

  it("returns 404 for a reset when the demo is off", async () => {
    process.env.DEMO_CLERK_USER_ID = "";
    expect((await alice.post("/api/demo/reset")).status).toBe(404);
  });

  it("never treats the demo account as an admin", async () => {
    process.env.ADMIN_CLERK_USER_IDS = `${ADMIN},${DEMO}`;
    await User.updateOne({ clerkUserId: DEMO }, { $set: { role: "admin" } }, { upsert: true });

    const role = await demo.get<{ role: string }>("/api/users/me/role");
    expect(role.body.role).toBe("user");
    expect((await demo.get("/api/admin/summary")).status).toBe(403);
  });

  it("refuses to grant admin to the demo account", async () => {
    process.env.ADMIN_CLERK_USER_IDS = ADMIN;
    const res = await admin.post<{ error: string }>(`/api/admin/users/${DEMO}/grant-admin`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/demo/i);
  });

  it("adds a Savings category when the database has none, so saving is counted", async () => {
    await harness.resetDatabase();
    // An existing database whose categories predate the Savings default.
    await Category.create({ slug: "utilities", label: "Utilities", color: "#3c83f6", kind: "need", sort_order: 1 });
    await demo.get("/api/demo/status");
    const categories = await demo.get<Array<{ slug: string; kind: string }>>("/api/categories");
    expect(categories.body.some((c) => c.kind === "savings")).toBe(true);
  });
});
