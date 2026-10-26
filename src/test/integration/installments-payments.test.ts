import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { startHarness, type Harness } from "./harness";
import { registerClerkUser } from "./fakeClerk";
import { mongoose } from "../../../server/src/index";
import { Bill } from "../../../server/src/models/Bill";
import { InstallmentPlan } from "../../../server/src/models/InstallmentPlan";

const ALICE = "user_alice";

interface PlanResponse {
  plan: {
    _id: string;
    scheduledTotal: number;
    totalPaid: number;
    remainingBalance: number;
    status: string;
  };
  installments: Array<{ _id: string; amount: number; planId: string; status: string }>;
}

const planBody = {
  name: "Phone EMI",
  principalAmount: 1000,
  totalInstallments: 3,
  startDate: "2027-01-10T00:00:00.000Z",
};

describe("Phase 4D — installment plans and payments against MongoDB", () => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await startHarness();
  });

  afterAll(async () => {
    await harness?.stop();
  });

  beforeEach(async () => {
    vi.restoreAllMocks();
    await harness.resetDatabase();
    registerClerkUser({ id: ALICE, email: "alice@example.com" });
  });

  async function createPlan(body: Record<string, unknown> = planBody) {
    return harness.request<PlanResponse>("POST", "/api/installments", {
      user: ALICE,
      body,
    });
  }

  async function pay(billId: string, amount: number, extra: Record<string, unknown> = {}) {
    return harness.request("POST", `/api/bills/${billId}/payments`, {
      user: ALICE,
      body: {
        amount,
        paymentDate: "2027-01-10T00:00:00.000Z",
        method: "upi",
        ...extra,
      },
    });
  }

  it("creates the plan and its installment bills in one transaction", async () => {
    const startSession = vi.spyOn(mongoose, "startSession");
    const res = await createPlan();

    expect(res.status).toBe(201);
    expect(startSession).toHaveBeenCalled();
    expect(res.body.plan).toMatchObject({
      scheduledTotal: 1000,
      totalPaid: 0,
      remainingBalance: 1000,
      status: "active",
    });
    expect(res.body.installments.map((b) => b.amount)).toEqual([333.33, 333.33, 333.34]);

    const stored = await Bill.find({ planId: res.body.plan._id, userId: ALICE }).lean();
    expect(stored).toHaveLength(3);
  });

  it("rolls back the plan when inserting its bills fails", async () => {
    vi.spyOn(Bill, "insertMany").mockRejectedValueOnce(
      new Error("Simulated insert failure"),
    );
    // The fallback path compensates with findByIdAndDelete; a real rollback
    // must not need it.
    const compensate = vi.spyOn(InstallmentPlan, "findByIdAndDelete");
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await createPlan();

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Failed to create installment plan." });
    expect(compensate).not.toHaveBeenCalled();
    expect(await InstallmentPlan.countDocuments()).toBe(0);
    expect(await Bill.countDocuments()).toBe(0);
    consoleSpy.mockRestore();
  });

  it("rejects a repeated idempotency key without duplicating bills", async () => {
    const body = { ...planBody, idempotencyKey: "plan-key-1" };
    expect((await createPlan(body)).status).toBe(201);

    const retry = await createPlan(body);
    expect(retry.status).toBe(409);
    expect(await InstallmentPlan.countDocuments()).toBe(1);
    expect(await Bill.countDocuments()).toBe(3);
  });

  it("tracks partial and full payments and completes the plan", async () => {
    const { body } = await createPlan();
    const [first, second, third] = body.installments;

    // Partial payment: balance moves, bill stays pending.
    expect((await pay(first._id, 100)).status).toBe(201);
    let plan = await InstallmentPlan.findById(body.plan._id).lean();
    expect(plan).toMatchObject({ totalPaid: 100, remainingBalance: 900 });
    expect((await Bill.findById(first._id).lean())?.status).toBe("pending");

    // Completing the installment marks the bill paid.
    expect((await pay(first._id, 233.33, { method: "cash" })).status).toBe(201);
    expect((await Bill.findById(first._id).lean())?.status).toBe("paid");

    await pay(second._id, 333.33);
    await pay(third._id, 333.34);
    plan = await InstallmentPlan.findById(body.plan._id).lean();
    expect(plan).toMatchObject({
      totalPaid: 1000,
      remainingBalance: 0,
      status: "completed",
    });
  });

  it("rejects duplicate payment submissions", async () => {
    const { body } = await createPlan();
    const billId = body.installments[0]._id;

    expect((await pay(billId, 50, { idempotencyKey: "pay-1" })).status).toBe(201);
    // Same idempotency key, different amount: blocked by the unique index.
    expect((await pay(billId, 60, { idempotencyKey: "pay-1" })).status).toBe(409);
    // Identical payment within a few seconds: blocked by the duplicate guard.
    expect((await pay(billId, 70)).status).toBe(201);
    expect((await pay(billId, 70)).status).toBe(409);

    const payments = await harness.request<unknown[]>(
      "GET",
      `/api/bills/${billId}/payments`,
      { user: ALICE },
    );
    expect(payments.body).toHaveLength(2);
  });
});
