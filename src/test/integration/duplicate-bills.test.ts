import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { startHarness, type Harness } from "./harness";
import { registerClerkUser } from "./fakeClerk";

const ALICE = "user_alice";
const BOB = "user_bob";

describe("Duplicate bill detection through the real API", () => {
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

  const post = <T = unknown>(user: string, body: unknown) =>
    harness.request<T>("POST", "/api/bills", { user, body });

  const rent = (extra: Record<string, unknown> = {}) => ({
    name: "Rent",
    amount: 20000,
    dueDate: "2027-01-05",
    status: "pending",
    category: "housing",
    ...extra,
  });

  it("rejects the same name, amount and due date with a 409 and a code", async () => {
    expect((await post(ALICE, rent())).status).toBe(201);
    const again = await post<{ code?: string; error: string }>(ALICE, rent());
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("DUPLICATE_BILL");
    expect(again.body.error).toMatch(/already due/i);
  });

  it("ignores case and spacing in the name", async () => {
    await post(ALICE, rent());
    expect((await post(ALICE, rent({ name: "  rent " }))).status).toBe(409);
  });

  it("allows it when the user confirms with allowDuplicate", async () => {
    await post(ALICE, rent());
    expect((await post(ALICE, rent({ allowDuplicate: true }))).status).toBe(201);
    const list = await harness.request<unknown[]>("GET", "/api/bills", { user: ALICE });
    expect(list.body).toHaveLength(2);
  });

  it("does not flag a different amount, a different date or another user's bill", async () => {
    await post(ALICE, rent());
    expect((await post(ALICE, rent({ amount: 20500 }))).status).toBe(201);
    expect((await post(ALICE, rent({ dueDate: "2027-02-05" }))).status).toBe(201);
    expect((await post(BOB, rent())).status).toBe(201);
  });

  it("flags a second active recurring bill with the same name and amount", async () => {
    const loan = rent({ name: "Car loan", recurrenceType: "recurring", recurringDay: 5 });
    expect((await post(ALICE, loan)).status).toBe(201);
    const again = await post<{ code?: string }>(ALICE, { ...loan, dueDate: "2027-03-05" });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("DUPLICATE_BILL");
    expect((await post(ALICE, { ...loan, dueDate: "2027-03-05", allowDuplicate: true })).status).toBe(201);
  });
});
