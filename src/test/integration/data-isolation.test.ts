import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { startHarness, type Harness } from "./harness";
import { registerClerkUser } from "./fakeClerk";

const ALICE = "user_alice";
const BOB = "user_bob";

function isoDaysFromNow(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

describe("Phase 4D — users cannot reach each other's data", () => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await startHarness();
  });

  afterAll(async () => {
    await harness?.stop();
  });

  beforeEach(async () => {
    await harness.resetDatabase();
    registerClerkUser({ id: ALICE, email: "alice@example.com" });
    registerClerkUser({ id: BOB, email: "bob@example.com" });
  });

  async function createAliceBill(overrides: Record<string, unknown> = {}) {
    const res = await harness.request<{ _id: string }>("POST", "/api/bills", {
      user: ALICE,
      body: {
        name: "Alice Internet",
        amount: 60,
        dueDate: isoDaysFromNow(1),
        status: "pending",
        category: "utilities",
        ...overrides,
      },
    });
    expect(res.status).toBe(201);
    return res.body._id;
  }

  it("isolates bills, payments, and notes", async () => {
    const billId = await createAliceBill();

    const own = await harness.request("GET", `/api/bills/${billId}`, { user: ALICE });
    expect(own.status).toBe(200);

    const bobList = await harness.request<unknown[]>("GET", "/api/bills", { user: BOB });
    expect(bobList.status).toBe(200);
    expect(bobList.body).toEqual([]);

    const attempts: Array<[string, string, unknown?]> = [
      ["GET", `/api/bills/${billId}`],
      ["PATCH", `/api/bills/${billId}`, { name: "Hijacked" }],
      ["DELETE", `/api/bills/${billId}`],
      ["GET", `/api/bills/${billId}/payments`],
      [
        "POST",
        `/api/bills/${billId}/payments`,
        { amount: 60, paymentDate: isoDaysFromNow(0), method: "upi" },
      ],
      ["GET", `/api/bills/${billId}/notes`],
      ["POST", `/api/bills/${billId}/notes`, { text: "Bob was here" }],
    ];
    for (const [method, path, body] of attempts) {
      const res = await harness.request(method, path, { user: BOB, body });
      expect(res.status, `${method} ${path}`).toBe(404);
    }

    // Alice's bill is unchanged and has no payments or notes from Bob.
    const after = await harness.request<{ name: string; status: string }>(
      "GET",
      `/api/bills/${billId}`,
      { user: ALICE },
    );
    expect(after.body).toMatchObject({ name: "Alice Internet", status: "pending" });
    const payments = await harness.request<unknown[]>(
      "GET",
      `/api/bills/${billId}/payments`,
      { user: ALICE },
    );
    expect(payments.body).toEqual([]);
    const notes = await harness.request<unknown[]>(
      "GET",
      `/api/bills/${billId}/notes`,
      { user: ALICE },
    );
    expect(notes.body).toEqual([]);

    const bobPayments = await harness.request<unknown[]>("GET", "/api/payments", {
      user: BOB,
    });
    expect(bobPayments.body).toEqual([]);
  });

  it("isolates installment plans", async () => {
    const created = await harness.request<{ plan: { _id: string } }>(
      "POST",
      "/api/installments",
      {
        user: ALICE,
        body: {
          name: "Laptop EMI",
          principalAmount: 1200,
          totalInstallments: 3,
          startDate: isoDaysFromNow(5),
        },
      },
    );
    expect(created.status).toBe(201);
    const planId = created.body.plan._id;

    const bobList = await harness.request<unknown[]>("GET", "/api/installments", {
      user: BOB,
    });
    expect(bobList.body).toEqual([]);

    for (const [method, path, body] of [
      ["GET", `/api/installments/${planId}`],
      ["PATCH", `/api/installments/${planId}`, { name: "Hijacked" }],
      ["POST", `/api/installments/${planId}/cancel`, {}],
    ] as Array<[string, string, unknown?]>) {
      const res = await harness.request(method, path, { user: BOB, body });
      expect(res.status, `${method} ${path}`).toBe(404);
    }

    const own = await harness.request<{ plan: { name: string; status: string } }>(
      "GET",
      `/api/installments/${planId}`,
      { user: ALICE },
    );
    expect(own.status).toBe(200);
    expect(own.body.plan).toMatchObject({ name: "Laptop EMI", status: "active" });
  });

  it("isolates subscriptions", async () => {
    const created = await harness.request<{ _id: string }>(
      "POST",
      "/api/subscriptions",
      {
        user: ALICE,
        body: {
          name: "Streaming",
          amount: 15,
          category: "entertainment",
          startDate: isoDaysFromNow(3),
        },
      },
    );
    expect(created.status).toBe(201);
    const subscriptionId = created.body._id;

    const bobList = await harness.request<unknown[]>("GET", "/api/subscriptions", {
      user: BOB,
    });
    expect(bobList.body).toEqual([]);

    for (const [method, path, body] of [
      ["GET", `/api/subscriptions/${subscriptionId}`],
      ["PATCH", `/api/subscriptions/${subscriptionId}`, { name: "Hijacked" }],
      ["PATCH", `/api/subscriptions/${subscriptionId}/cancel`, {}],
      ["DELETE", `/api/subscriptions/${subscriptionId}`],
    ] as Array<[string, string, unknown?]>) {
      const res = await harness.request(method, path, { user: BOB, body });
      expect(res.status, `${method} ${path}`).toBe(404);
    }

    const own = await harness.request<{ name: string; isActive: boolean }>(
      "GET",
      `/api/subscriptions/${subscriptionId}`,
      { user: ALICE },
    );
    expect(own.status).toBe(200);
    expect(own.body).toMatchObject({ name: "Streaming", isActive: true });
  });

  it("isolates notifications", async () => {
    await createAliceBill({ dueDate: isoDaysFromNow(1) });

    const aliceNotifications = await harness.request<Array<{ _id: string }>>(
      "GET",
      "/api/notifications",
      { user: ALICE },
    );
    expect(aliceNotifications.status).toBe(200);
    expect(aliceNotifications.body.length).toBeGreaterThan(0);
    const notificationId = aliceNotifications.body[0]._id;

    const bobNotifications = await harness.request<unknown[]>(
      "GET",
      "/api/notifications",
      { user: BOB },
    );
    expect(bobNotifications.body).toEqual([]);

    for (const path of [
      `/api/notifications/${notificationId}/read`,
      `/api/notifications/${notificationId}/dismiss`,
    ]) {
      const res = await harness.request("PATCH", path, { user: BOB, body: {} });
      expect(res.status, path).toBe(404);
    }

    // Bob's "read all" must not touch Alice's notifications.
    await harness.request("PATCH", "/api/notifications/read-all", {
      user: BOB,
      body: {},
    });
    const unread = await harness.request<{ count: number }>(
      "GET",
      "/api/notifications/unread-count",
      { user: ALICE },
    );
    expect(unread.body.count).toBe(aliceNotifications.body.length);
  });
});
