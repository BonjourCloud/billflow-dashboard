import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { startHarness, type Harness } from "./harness";
import { registerClerkUser } from "./fakeClerk";
import { Bill } from "../../../server/src/models/Bill";
import { Notification } from "../../../server/src/models/Notification";
import { RecurringSeries } from "../../../server/src/models/RecurringSeries";

const ALICE = "user_alice";
const ADMIN = "user_admin";
const DAY = 24 * 60 * 60 * 1000;

const isoDaysFromNow = (days: number) => new Date(Date.now() + days * DAY).toISOString();

interface BillBody {
  _id: string;
  name: string;
  amount: number;
  status: string;
  dueDate: string;
  seriesId?: string | null;
  billingCycle?: string | null;
}

describe("Core features through the real API", () => {
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
    registerClerkUser({ id: ALICE, email: "alice@example.com" });
    registerClerkUser({ id: ADMIN, email: "admin@example.com" });
  });

  const as = (user: string) => ({
    get: <T = unknown>(path: string) => harness.request<T>("GET", path, { user }),
    post: <T = unknown>(path: string, body: unknown = {}) =>
      harness.request<T>("POST", path, { user, body }),
    patch: <T = unknown>(path: string, body: unknown = {}) =>
      harness.request<T>("PATCH", path, { user, body }),
    del: <T = unknown>(path: string) => harness.request<T>("DELETE", path, { user }),
  });
  const alice = as(ALICE);
  const admin = as(ADMIN);

  async function createBill(overrides: Record<string, unknown> = {}) {
    const res = await alice.post<BillBody>("/api/bills", {
      name: "Electricity",
      amount: 1200,
      dueDate: isoDaysFromNow(10),
      status: "pending",
      category: "utilities",
      ...overrides,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body;
  }

  describe("bills", () => {
    it("creates, reads, lists, updates, and deletes a one-time bill", async () => {
      const later = await createBill({ name: "Later", dueDate: isoDaysFromNow(20) });
      const bill = await createBill();

      const list = await alice.get<BillBody[]>("/api/bills");
      expect(list.body.map((b) => b.name)).toEqual(["Electricity", "Later"]); // by due date

      const updated = await alice.patch<BillBody>(`/api/bills/${bill._id}`, {
        amount: 1350.5,
        name: "Electricity (revised)",
      });
      expect(updated.status).toBe(200);
      expect(updated.body).toMatchObject({ amount: 1350.5, name: "Electricity (revised)" });
      expect((await alice.get<BillBody>(`/api/bills/${bill._id}`)).body.amount).toBe(1350.5);

      expect((await alice.del(`/api/bills/${bill._id}`)).status).toBe(204);
      expect((await alice.get(`/api/bills/${bill._id}`)).status).toBe(404);
      expect((await alice.del(`/api/bills/${bill._id}`)).status).toBe(404);
      expect((await alice.get<BillBody[]>("/api/bills")).body.map((b) => b._id)).toEqual([
        later._id,
      ]);
    });

    it("rejects invalid updates without changing the bill", async () => {
      const bill = await createBill();
      for (const body of [{ amount: -1 }, { status: "late" }, { dueDate: "nope" }, { name: "" }]) {
        expect((await alice.patch(`/api/bills/${bill._id}`, body)).status).toBe(400);
      }
      expect((await Bill.findById(bill._id).lean())?.amount).toBe(1200);
    });

    it("records payment history newest first and notes", async () => {
      const bill = await createBill({ amount: 1000 });
      await alice.post(`/api/bills/${bill._id}/payments`, {
        amount: 300, paymentDate: "2026-10-01T00:00:00.000Z", method: "upi",
      });
      await alice.post(`/api/bills/${bill._id}/payments`, {
        amount: 200, paymentDate: "2026-10-05T00:00:00.000Z", method: "cash",
      });

      const history = await alice.get<Array<{ amount: number }>>(
        `/api/bills/${bill._id}/payments`,
      );
      expect(history.body.map((p) => p.amount)).toEqual([200, 300]);
      expect((await Bill.findById(bill._id).lean())?.status).toBe("pending");

      for (const body of [
        { amount: 0, paymentDate: "2026-10-05", method: "upi" },
        { amount: 10, paymentDate: "2026-10-05", method: "bitcoin" },
        { amount: 10, paymentDate: "whenever", method: "upi" },
      ]) {
        expect((await alice.post(`/api/bills/${bill._id}/payments`, body)).status).toBe(400);
      }

      expect((await alice.post(`/api/bills/${bill._id}/notes`, { text: "  " })).status).toBe(400);
      expect(
        (await alice.post(`/api/bills/${bill._id}/notes`, { text: "x".repeat(1001) })).status,
      ).toBe(400);
      expect((await alice.post(`/api/bills/${bill._id}/notes`, { text: "First" })).status).toBe(201);
      expect((await alice.post(`/api/bills/${bill._id}/notes`, { text: "Second" })).status).toBe(201);
      const notes = await alice.get<Array<{ text: string }>>(`/api/bills/${bill._id}/notes`);
      expect(notes.body.map((n) => n.text)).toEqual(["Second", "First"]);
    });
  });

  describe("recurring bills and subscriptions", () => {
    it("creates a series from a recurring bill and applies scoped edits", async () => {
      const first = await createBill({
        name: "Gym",
        amount: 1500,
        recurrenceType: "recurring",
        recurringDay: 15,
        dueDate: isoDaysFromNow(15),
      });
      expect(first.seriesId).toBeTruthy();

      const subs = await alice.get<Array<{ _id: string; amount: number; isActive: boolean }>>(
        "/api/subscriptions",
      );
      expect(subs.body).toHaveLength(1);
      expect(subs.body[0]).toMatchObject({ amount: 1500, isActive: true });

      // "this" changes only the occurrence.
      await alice.patch(`/api/bills/${first._id}`, { amount: 1600, updateScope: "this" });
      expect((await RecurringSeries.findById(first.seriesId).lean())?.amount).toBe(1500);

      // "future" also changes the series template.
      await alice.patch(`/api/bills/${first._id}`, { amount: 1800, updateScope: "future" });
      expect((await RecurringSeries.findById(first.seriesId).lean())?.amount).toBe(1800);

      expect((await alice.del(`/api/bills/${first._id}?scope=all`)).status).toBe(204);
      expect(await Bill.countDocuments({ seriesId: first.seriesId })).toBe(0);
      expect((await alice.get(`/api/subscriptions/${subs.body[0]._id}`)).status).toBe(404);
    });

    it("never deletes paid occurrences when deleting future ones", async () => {
      const first = await createBill({
        name: "Insurance",
        amount: 500,
        recurrenceType: "recurring",
        recurringDay: 1,
        dueDate: isoDaysFromNow(3),
      });
      await alice.post(`/api/bills/${first._id}/payments`, {
        amount: 500, paymentDate: isoDaysFromNow(0), method: "upi",
      });
      expect((await Bill.findById(first._id).lean())?.status).toBe("paid");

      expect((await alice.del(`/api/bills/${first._id}?scope=future`)).status).toBe(204);
      expect((await Bill.findById(first._id).lean())?.status).toBe("paid");
      expect((await RecurringSeries.findById(first.seriesId).lean())?.isActive).toBe(false);
    });

    it("generates past-due subscription occurrences once, even under concurrent loads", async () => {
      const created = await alice.post<{ _id: string }>("/api/subscriptions", {
        name: "Streaming",
        amount: 649,
        category: "entertainment",
        startDate: isoDaysFromNow(-75),
      });
      expect(created.status).toBe(201);

      await Promise.all([
        alice.get("/api/bills"),
        alice.get("/api/bills"),
        alice.get("/api/subscriptions"),
        alice.get("/api/notifications"),
      ]);
      await alice.get("/api/bills");

      const occurrences = await Bill.find({ seriesId: created.body._id }).lean();
      expect(occurrences.length).toBeGreaterThanOrEqual(3);
      const cycles = occurrences.map((b) => b.billingCycle);
      expect(new Set(cycles).size).toBe(cycles.length);
      expect(occurrences.every((b) => b.amount === 649)).toBe(true);
    });

    it("updates, cancels, and deletes a subscription", async () => {
      const created = await alice.post<{ _id: string }>("/api/subscriptions", {
        name: "Cloud storage",
        amount: 130,
        category: "software",
        startDate: isoDaysFromNow(5),
      });
      const id = created.body._id;

      const updated = await alice.patch<{ amount: number }>(`/api/subscriptions/${id}`, {
        amount: 210,
      });
      expect(updated.status).toBe(200);
      expect(updated.body.amount).toBe(210);
      expect((await alice.patch(`/api/subscriptions/${id}`, { amount: -1 })).status).toBe(400);

      const cancelled = await alice.patch<{ isActive: boolean }>(`/api/subscriptions/${id}/cancel`);
      expect(cancelled.status).toBe(200);
      expect(cancelled.body.isActive).toBe(false);

      // Default scope ("future") stops the series but keeps its history.
      expect((await alice.del(`/api/subscriptions/${id}`)).status).toBe(204);
      expect((await alice.get<{ isActive: boolean }>(`/api/subscriptions/${id}`)).body.isActive).toBe(false);

      // scope=all removes the series and its bills.
      expect((await alice.del(`/api/subscriptions/${id}?scope=all`)).status).toBe(204);
      expect((await alice.get(`/api/subscriptions/${id}`)).status).toBe(404);
      expect(await Bill.countDocuments({ seriesId: id })).toBe(0);
    });
  });

  describe("reminders", () => {
    it("creates one reminder per bill and type despite repeated and concurrent loads", async () => {
      await createBill({ name: "Due soon", dueDate: isoDaysFromNow(1) });
      await createBill({ name: "Overdue", dueDate: isoDaysFromNow(-3), status: "overdue" });
      await createBill({ name: "Far away", dueDate: isoDaysFromNow(30) });
      await createBill({ name: "Already paid", dueDate: isoDaysFromNow(1), status: "paid" });

      await Promise.all(Array.from({ length: 4 }, () => alice.get("/api/notifications")));
      const list = await alice.get<Array<{ type: string; title: string }>>("/api/notifications");

      expect(list.body.map((n) => `${n.type}:${n.title}`).sort()).toEqual([
        "due_soon:Payment Due Soon: Due soon",
        "overdue:Payment Overdue: Overdue",
      ]);
      expect(await Notification.countDocuments()).toBe(2);
    });

    it("tracks read, read-all, and dismissed state", async () => {
      await createBill({ name: "A", dueDate: isoDaysFromNow(1) });
      await createBill({ name: "B", dueDate: isoDaysFromNow(2) });
      const list = await alice.get<Array<{ _id: string }>>("/api/notifications");
      const count = () => alice.get<{ count: number }>("/api/notifications/unread-count");

      expect((await count()).body.count).toBe(2);
      expect((await alice.patch(`/api/notifications/${list.body[0]._id}/read`)).status).toBe(200);
      expect((await count()).body.count).toBe(1);
      expect((await alice.patch("/api/notifications/read-all")).status).toBe(200);
      expect((await count()).body.count).toBe(0);

      expect((await alice.patch(`/api/notifications/${list.body[1]._id}/dismiss`)).status).toBe(200);
      const remaining = await alice.get<Array<{ _id: string }>>("/api/notifications");
      expect(remaining.body.map((n) => n._id)).toEqual([list.body[0]._id]);
    });

    it("clears reminders when a bill is paid or deleted", async () => {
      const paid = await createBill({ name: "Pay me", amount: 100, dueDate: isoDaysFromNow(1) });
      const removed = await createBill({ name: "Delete me", dueDate: isoDaysFromNow(2) });
      await alice.get("/api/notifications");

      await alice.post(`/api/bills/${paid._id}/payments`, {
        amount: 100, paymentDate: isoDaysFromNow(0), method: "upi",
      });
      expect((await Notification.findOne({ billId: paid._id }).lean())?.isRead).toBe(true);

      await alice.del(`/api/bills/${removed._id}`);
      expect(await Notification.countDocuments({ billId: removed._id })).toBe(0);
    });
  });

  describe("installment plans", () => {
    it("updates, filters, and cancels a plan while keeping paid installments", async () => {
      const created = await alice.post<{
        plan: { _id: string };
        installments: Array<{ _id: string; amount: number }>;
      }>("/api/installments", {
        name: "Laptop EMI",
        principalAmount: 60000,
        downPayment: 6000,
        totalInstallments: 6,
        interestRate: 12,
        startDate: isoDaysFromNow(5),
      });
      expect(created.status).toBe(201);
      const { plan, installments } = created.body;

      const renamed = await alice.patch<{ name: string }>(`/api/installments/${plan._id}`, {
        name: "MacBook EMI",
      });
      expect(renamed.status).toBe(200);
      expect(renamed.body.name).toBe("MacBook EMI");

      await alice.post(`/api/bills/${installments[0]._id}/payments`, {
        amount: installments[0].amount, paymentDate: isoDaysFromNow(0), method: "upi",
      });
      expect(
        (await alice.del(`/api/bills/${installments[1]._id}`)).status,
        "installment bills are managed through their plan",
      ).toBe(400);

      expect((await alice.post(`/api/installments/${plan._id}/cancel`)).status).toBe(200);
      expect((await alice.post(`/api/installments/${plan._id}/cancel`)).status).toBe(400);

      const remaining = await Bill.find({ planId: plan._id }).lean();
      expect(remaining.map((b) => String(b._id))).toEqual([installments[0]._id]);
      expect(remaining[0].status).toBe("paid");

      const cancelled = await alice.get<Array<{ _id: string }>>("/api/installments?status=cancelled");
      expect(cancelled.body.map((p) => p._id)).toEqual([plan._id]);
      expect((await alice.get<unknown[]>("/api/installments?status=active")).body).toEqual([]);
    });

    it("rejects invalid plans", async () => {
      for (const body of [
        { name: "x", principalAmount: 1000, downPayment: 1000, totalInstallments: 3, startDate: "2027-01-01" },
        { name: "x", principalAmount: 1000, totalInstallments: 1, startDate: "2027-01-01" },
        { name: "x", principalAmount: 1000, totalInstallments: 121, startDate: "2027-01-01" },
        { name: "x", principalAmount: 1000, totalInstallments: 3, interestRate: 101, startDate: "2027-01-01" },
      ]) {
        expect((await alice.post("/api/installments", body)).status).toBe(400);
      }
      expect(await Bill.countDocuments()).toBe(0);
    });
  });

  describe("database failures", () => {
    it("return generic JSON errors without leaking internals and leave data unchanged", async () => {
      const bill = await createBill();
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const leak = "MongoNetworkError: mongodb+srv://app_user:s3cr3t@cluster0.example.net";

      vi.spyOn(Bill, "find").mockImplementationOnce(() => {
        throw new Error(leak);
      });
      const list = await alice.get("/api/bills");
      expect(list.status).toBe(500);
      expect(list.body).toEqual({ error: "Failed to list bills." });

      vi.spyOn(Bill, "findOne").mockRejectedValueOnce(new Error(leak));
      const update = await alice.patch(`/api/bills/${bill._id}`, { amount: 1 });
      expect(update.status).toBe(500);
      expect(JSON.stringify(update.body)).not.toContain("s3cr3t");
      expect((await Bill.findById(bill._id).lean())?.amount).toBe(1200);

      vi.restoreAllMocks();
      expect((await alice.get<unknown[]>("/api/bills")).body).toHaveLength(1);
      consoleSpy.mockRestore();
    });
  });

  describe("pricing tiers and site settings (admin)", () => {
    const tier = {
      slug: "team",
      name: "Team",
      price_monthly: 499,
      price_yearly: 4990,
      billing_period: "month",
      cta_label: "Start",
      features: ["Shared bills"],
    };

    it("creates, updates, and deletes tiers with validation", async () => {
      const created = await admin.post<{ id: string }>("/api/admin/pricing-tiers", tier);
      expect(created.status).toBe(201);
      expect((await admin.post("/api/admin/pricing-tiers", tier)).status).toBe(409);
      expect(
        (await admin.post("/api/admin/pricing-tiers", { ...tier, slug: "Bad Slug!" })).status,
      ).toBe(400);

      const updated = await admin.patch<{ price_monthly: number }>(
        `/api/admin/pricing-tiers/${created.body.id}`,
        { price_monthly: 599 },
      );
      expect(updated.status).toBe(200);
      expect(updated.body.price_monthly).toBe(599);
      expect(
        (await admin.patch(`/api/admin/pricing-tiers/${created.body.id}`, { price_monthly: -1 }))
          .status,
      ).toBe(400);

      expect((await admin.del(`/api/admin/pricing-tiers/${created.body.id}`)).status).toBe(200);
      expect((await harness.request<unknown[]>("GET", "/api/pricing-tiers")).body).toEqual([]);
    });

    it("validates and persists theme settings", async () => {
      const valid = {
        theme_primary_hsl: "221 83% 53%",
        theme_accent_hsl: "262 83% 58%",
        theme_background_hsl: "0 0% 100%",
        theme_font_pair: "inter",
      };
      for (const bad of [
        { ...valid, theme_primary_hsl: "red" },
        { ...valid, theme_accent_hsl: "#ff0000" },
        { ...valid, extra: true },
      ]) {
        expect((await admin.patch("/api/admin/site-settings", bad)).status).toBe(400);
      }
      expect((await admin.patch("/api/admin/site-settings", valid)).status).toBe(200);
      const settings = await harness.request<Record<string, string>>("GET", "/api/site-settings");
      expect(settings.body).toMatchObject(valid);
    });

    it("reports admin summary counts", async () => {
      await admin.post("/api/admin/pricing-tiers", tier);
      const summary = await admin.get<{ adminCount: number; pricingTiersCount: number }>(
        "/api/admin/summary",
      );
      expect(summary.body).toEqual({ adminCount: 1, pricingTiersCount: 1 });
    });
  });
});
