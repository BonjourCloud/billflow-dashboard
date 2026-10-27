import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { startHarness, type Harness } from "./harness";
import { registerClerkUser } from "./fakeClerk";
import { Goal } from "../../../server/src/models/Goal";
import { Bill } from "../../../server/src/models/Bill";

const ALICE = "user_alice";
const BOB = "user_bob";

interface ContributionBody {
  _id: string;
  amount: number;
  date: string;
  note: string | null;
}
interface GoalBody {
  _id: string;
  name: string;
  targetAmount: number;
  targetDate: string;
  startDate: string;
  monthlyAmount: number;
  isActive: boolean;
  savedAmount: number;
  contributions: ContributionBody[];
}

describe("Savings goals and Log a spend through the real API", () => {
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

  const as = (user: string) => ({
    get: <T = unknown>(p: string) => harness.request<T>("GET", p, { user }),
    post: <T = unknown>(p: string, body: unknown = {}) => harness.request<T>("POST", p, { user, body }),
    patch: <T = unknown>(p: string, body: unknown = {}) => harness.request<T>("PATCH", p, { user, body }),
    del: <T = unknown>(p: string) => harness.request<T>("DELETE", p, { user }),
  });
  const alice = as(ALICE);
  const bob = as(BOB);

  // Four calendar months ahead of any run date: always at least a few months to plan over.
  const targetIn = (months: number) => {
    const d = new Date();
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 5)).toISOString().slice(0, 10);
  };
  const fund = () => ({ name: "School fee fund", targetAmount: 135000, targetDate: targetIn(3) });

  it("creates a goal and plans the monthly amount from the months available", async () => {
    const created = await alice.post<GoalBody>("/api/goals", fund());
    expect(created.status).toBe(201);
    // This month plus three more: four months.
    expect(created.body.monthlyAmount).toBe(33750);
    expect(created.body.savedAmount).toBe(0);
    expect(created.body.isActive).toBe(true);
    expect(created.body.startDate.slice(8, 10)).toBe("01");

    const custom = await alice.post<GoalBody>("/api/goals", { ...fund(), name: "Custom", monthlyAmount: 20000 });
    expect(custom.body.monthlyAmount).toBe(20000);

    const list = await alice.get<GoalBody[]>("/api/goals");
    expect(list.body.map((g) => g.name)).toEqual(["School fee fund", "Custom"]);
  });

  it("re-plans when the target changes, but keeps a custom monthly amount otherwise", async () => {
    const created = await alice.post<GoalBody>("/api/goals", { ...fund(), monthlyAmount: 40000 });

    const renamed = await alice.patch<GoalBody>(`/api/goals/${created.body._id}`, { name: "Fees" });
    expect(renamed.status).toBe(200);
    expect(renamed.body.name).toBe("Fees");
    expect(renamed.body.monthlyAmount).toBe(40000);

    const doubled = await alice.patch<GoalBody>(`/api/goals/${created.body._id}`, { targetAmount: 270000 });
    expect(doubled.body.monthlyAmount).toBe(67500);

    const explicit = await alice.patch<GoalBody>(`/api/goals/${created.body._id}`, { targetAmount: 100000, monthlyAmount: 30000 });
    expect(explicit.body.monthlyAmount).toBe(30000);

    const paused = await alice.patch<GoalBody>(`/api/goals/${created.body._id}`, { isActive: false });
    expect(paused.body.isActive).toBe(false);
  });

  it("rejects invalid goals", async () => {
    const bad = [
      { ...fund(), targetAmount: 0 },
      { ...fund(), targetAmount: -10 },
      { ...fund(), name: "" },
      { ...fund(), targetDate: "someday" },
      { ...fund(), userId: ALICE },
      { ...fund(), startDate: "2020-01-01", monthlyAmount: -1 },
      { name: "No target" },
    ];
    for (const body of bad) {
      const res = await alice.post("/api/goals", body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    // A target in a month before the plan starts.
    expect((await alice.post("/api/goals", { ...fund(), targetDate: "2001-01-05" })).status).toBe(400);
    // Further away than 50 years.
    expect((await alice.post("/api/goals", { ...fund(), targetDate: "2099-01-05" })).status).toBe(400);
    expect((await alice.get<GoalBody[]>("/api/goals")).body).toHaveLength(0);
  });

  it("records, sums and removes contributions", async () => {
    const goal = (await alice.post<GoalBody>("/api/goals", fund())).body;

    const first = await alice.post<GoalBody>(`/api/goals/${goal._id}/contributions`, { amount: 10000, note: "Oct" });
    expect(first.status).toBe(201);
    expect(first.body.savedAmount).toBe(10000);
    const second = await alice.post<GoalBody>(`/api/goals/${goal._id}/contributions`, { amount: 2500.5, date: "2026-10-20" });
    expect(second.body.savedAmount).toBe(12500.5);
    expect(second.body.contributions).toHaveLength(2);

    const removeId = second.body.contributions.find((c) => c.amount === 10000)!._id;
    const after = await alice.del<GoalBody>(`/api/goals/${goal._id}/contributions/${removeId}`);
    expect(after.status).toBe(200);
    expect(after.body.savedAmount).toBe(2500.5);

    expect((await alice.post(`/api/goals/${goal._id}/contributions`, { amount: 0 })).status).toBe(400);
    expect((await alice.post(`/api/goals/${goal._id}/contributions`, { amount: 5, extra: 1 })).status).toBe(400);
    expect((await alice.del(`/api/goals/${goal._id}/contributions/${removeId}`)).status).toBe(404);
    expect((await alice.del(`/api/goals/${goal._id}/contributions/not-an-id`)).status).toBe(400);
  });

  it("does not lose contributions that arrive at the same time", async () => {
    const goal = (await alice.post<GoalBody>("/api/goals", fund())).body;
    const results = await Promise.all(
      Array.from({ length: 10 }, () => alice.post(`/api/goals/${goal._id}/contributions`, { amount: 1000 })),
    );
    expect(results.every((r) => r.status === 201)).toBe(true);
    const list = await alice.get<GoalBody[]>("/api/goals");
    expect(list.body[0].savedAmount).toBe(10000);
    expect(list.body[0].contributions).toHaveLength(10);
  });

  it("stops at the contribution limit", async () => {
    const goal = (await alice.post<GoalBody>("/api/goals", fund())).body;
    await Goal.updateOne(
      { _id: goal._id },
      { $set: { contributions: Array.from({ length: 500 }, () => ({ amount: 1, date: new Date(), note: null })) } },
    );
    const res = await alice.post<{ error: string }>(`/api/goals/${goal._id}/contributions`, { amount: 1 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/500/);
  });

  it("deletes a goal with its contributions", async () => {
    const goal = (await alice.post<GoalBody>("/api/goals", fund())).body;
    await alice.post(`/api/goals/${goal._id}/contributions`, { amount: 1000 });
    expect((await alice.del(`/api/goals/${goal._id}`)).status).toBe(200);
    expect((await alice.get<GoalBody[]>("/api/goals")).body).toHaveLength(0);
    expect((await alice.del(`/api/goals/${goal._id}`)).status).toBe(404);
    expect(await Goal.countDocuments({ userId: ALICE })).toBe(0);
  });

  it("keeps goals private to their owner", async () => {
    const goal = (await alice.post<GoalBody>("/api/goals", fund())).body;
    const entry = (await alice.post<GoalBody>(`/api/goals/${goal._id}/contributions`, { amount: 500 })).body.contributions[0];

    expect((await bob.get<GoalBody[]>("/api/goals")).body).toHaveLength(0);
    expect((await bob.patch(`/api/goals/${goal._id}`, { name: "Mine now" })).status).toBe(404);
    expect((await bob.del(`/api/goals/${goal._id}`)).status).toBe(404);
    expect((await bob.post(`/api/goals/${goal._id}/contributions`, { amount: 100 })).status).toBe(404);
    expect((await bob.del(`/api/goals/${goal._id}/contributions/${entry._id}`)).status).toBe(404);

    const untouched = (await alice.get<GoalBody[]>("/api/goals")).body[0];
    expect(untouched.name).toBe("School fee fund");
    expect(untouched.savedAmount).toBe(500);
  });

  it("logs a spend as an already-paid one-time bill that budgets count", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const res = await alice.post<{ _id: string; status: string }>("/api/bills", {
      name: "Auto fare",
      amount: 180,
      dueDate: `${today}T00:00:00.000Z`,
      status: "paid",
      category: "transport",
      isSubscription: false,
      recurrenceType: "one_time",
    });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("paid");

    const stored = await Bill.findOne({ userId: ALICE, name: "Auto fare" }).lean();
    expect(stored?.amount).toBe(180);
    expect(stored?.recurrenceType).toBe("one_time");
    expect((await bob.get<unknown[]>("/api/bills")).body).toHaveLength(0);
  });
});
