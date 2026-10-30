import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { startHarness, type Harness } from "./harness";
import { registerClerkUser } from "./fakeClerk";
import { Bill } from "../../../server/src/models/Bill";

const ALICE = "user_alice";

// The 5th of the month `offset` months from now, as yyyy-MM-dd (UTC).
const fifth = (offset: number) => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offset, 5)).toISOString().slice(0, 10);
};

describe("Recurring bill that started in the past", () => {
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
  });

  const post = (body: unknown) =>
    harness.request<{ seriesId?: string; status: string }>("POST", "/api/bills", { user: ALICE, body });

  const loan = (extra: Record<string, unknown> = {}) => ({
    name: "Car EMI",
    amount: 20000,
    dueDate: fifth(-6),
    status: "pending",
    category: "transport",
    recurrenceType: "recurring",
    ...extra,
  });

  it("marks every payment due before today as paid when asked", async () => {
    const created = await post(loan({ markPastPaid: true }));
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const bills = await Bill.find({ userId: ALICE, seriesId: created.body.seriesId }).lean();
    const now = new Date();
    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const earlier = bills.filter((b) => b.dueDate.getTime() < today);
    expect(earlier.length).toBeGreaterThanOrEqual(6);
    expect(earlier.every((b) => b.status === "paid")).toBe(true);
    expect(bills.filter((b) => b.dueDate.getTime() >= today).every((b) => b.status !== "paid")).toBe(true);
  });

  it("leaves earlier payments overdue without the flag", async () => {
    const created = await post(loan());
    const bills = await Bill.find({ userId: ALICE, seriesId: created.body.seriesId }).lean();
    expect(bills.some((b) => b.status === "overdue")).toBe(true);
    expect(bills.some((b) => b.status === "paid")).toBe(false);
  });

  it("rejects the flag on a one-time bill", async () => {
    const res = await post({ ...loan({ recurrenceType: "one_time" }), markPastPaid: true });
    expect(res.status).toBe(400);
  });
});
