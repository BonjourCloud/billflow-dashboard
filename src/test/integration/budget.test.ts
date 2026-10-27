import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { startHarness, type Harness } from "./harness";
import { registerClerkUser } from "./fakeClerk";

const ALICE = "user_alice";
const BOB = "user_bob";

interface IncomeBody {
  _id: string;
  name: string;
  amount: number;
  receivedCycles: string[];
  countInPlan: boolean;
}

describe("Income, budgets and budget settings through the real API", () => {
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
    put: <T = unknown>(p: string, body: unknown = {}) => harness.request<T>("PUT", p, { user, body }),
    patch: <T = unknown>(p: string, body: unknown = {}) => harness.request<T>("PATCH", p, { user, body }),
    del: <T = unknown>(p: string) => harness.request<T>("DELETE", p, { user }),
  });
  const alice = as(ALICE);
  const bob = as(BOB);

  const salary = { name: "Salary", amount: 150000, frequency: "monthly", startDate: "2026-04-01" };

  it("creates, lists, updates and deletes income", async () => {
    const created = await alice.post<IncomeBody>("/api/income", salary);
    expect(created.status).toBe(201);
    expect(created.body.countInPlan).toBe(true);

    const list = await alice.get<IncomeBody[]>("/api/income");
    expect(list.body).toHaveLength(1);

    const patched = await alice.patch<IncomeBody>(`/api/income/${created.body._id}`, { countInPlan: false });
    expect(patched.status).toBe(200);
    expect(patched.body.countInPlan).toBe(false);

    expect((await alice.del(`/api/income/${created.body._id}`)).status).toBe(200);
    expect((await alice.get<IncomeBody[]>("/api/income")).body).toHaveLength(0);
  });

  it("rejects invalid income and keeps it private per user", async () => {
    expect((await alice.post("/api/income", { ...salary, amount: -5 })).status).toBe(400);
    const created = await alice.post<IncomeBody>("/api/income", salary);
    expect((await bob.get<IncomeBody[]>("/api/income")).body).toHaveLength(0);
    expect((await bob.patch(`/api/income/${created.body._id}`, { name: "x" })).status).toBe(404);
    expect((await bob.del(`/api/income/${created.body._id}`)).status).toBe(404);
  });

  it("records and clears received cycles", async () => {
    const created = await alice.post<IncomeBody>("/api/income", salary);
    const id = created.body._id;
    const on = await alice.put<IncomeBody>(`/api/income/${id}/received`, { cycle: "2026-10", received: true });
    expect(on.status).toBe(200);
    expect(on.body.receivedCycles).toContain("2026-10");
    const off = await alice.put<IncomeBody>(`/api/income/${id}/received`, { cycle: "2026-10", received: false });
    expect(off.body.receivedCycles).not.toContain("2026-10");
    expect((await alice.put(`/api/income/${id}/received`, { cycle: "bad", received: true })).status).toBe(400);
  });

  it("sets, lists and removes category limits", async () => {
    expect((await alice.put("/api/budgets/groceries", { limit: 15000 })).status).toBe(200);
    expect((await alice.put("/api/budgets/groceries", { limit: 16000 })).status).toBe(200);
    const list = await alice.get<{ category: string; limit: number }[]>("/api/budgets");
    expect(list.body).toEqual([{ category: "groceries", limit: 16000 }]);
    expect((await bob.get<unknown[]>("/api/budgets")).body).toHaveLength(0);

    expect((await alice.put("/api/budgets/groceries", { limit: 0 })).status).toBe(400);
    expect((await alice.put("/api/budgets/not-a-category", { limit: 100 })).status).toBe(400);
    expect((await alice.del("/api/budgets/groceries")).status).toBe(200);
    expect((await alice.get<unknown[]>("/api/budgets")).body).toHaveLength(0);
  });

  it("serves defaults and validates budget settings", async () => {
    const def = await alice.get<{ method: string; needsPct: number; emiRatioWarnPct: number }>("/api/budget-settings");
    expect(def.body).toMatchObject({ method: "limits", needsPct: 50, emiRatioWarnPct: 40 });

    const next = { method: "50-30-20", needsPct: 60, wantsPct: 20, savingsPct: 20, emiRatioWarnPct: 35 };
    expect((await alice.put("/api/budget-settings", next)).status).toBe(200);
    expect((await alice.get("/api/budget-settings")).body).toMatchObject(next);
    expect((await bob.get<{ needsPct: number }>("/api/budget-settings")).body.needsPct).toBe(50);

    expect((await alice.put("/api/budget-settings", { ...next, savingsPct: 30 })).status).toBe(400);
  });
});
