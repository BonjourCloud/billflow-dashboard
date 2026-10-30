import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { startHarness, type Harness } from "./harness";
import { registerClerkUser } from "./fakeClerk";
import { Bill } from "../../../server/src/models/Bill";
import { RecurringSeries } from "../../../server/src/models/RecurringSeries";

const ALICE = "user_alice";

interface BillBody {
  _id: string;
  seriesId?: string | null;
  billingCycle?: string | null;
  status: string;
  dueDate: string;
}

// The 5th of the month `offset` months from now, as yyyy-MM-dd (UTC).
const fifth = (offset: number) => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offset, 5)).toISOString().slice(0, 10);
};

describe("Recurring bills with an end date through the real API", () => {
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

  const alice = {
    get: <T = unknown>(p: string) => harness.request<T>("GET", p, { user: ALICE }),
    post: <T = unknown>(p: string, body: unknown = {}) => harness.request<T>("POST", p, { user: ALICE, body }),
    patch: <T = unknown>(p: string, body: unknown = {}) => harness.request<T>("PATCH", p, { user: ALICE, body }),
  };

  const loan = (extra: Record<string, unknown> = {}) => ({
    name: "Car loan",
    amount: 9000,
    dueDate: fifth(-4),
    status: "pending",
    category: "transport",
    recurrenceType: "recurring",
    ...extra,
  });

  it("stops creating bills after the last payment date", async () => {
    // First payment four months ago, last payment one month ago: four payments.
    const created = await alice.post<BillBody>("/api/bills", loan({ endDate: fifth(-1) }));
    expect(created.status).toBe(201);

    await alice.get("/api/bills");
    const bills = (await alice.get<BillBody[]>("/api/bills")).body.filter((b) => b.seriesId === created.body.seriesId);
    expect(bills).toHaveLength(4);
    expect(bills.map((b) => b.dueDate.slice(0, 10)).sort()).toEqual([fifth(-4), fifth(-3), fifth(-2), fifth(-1)]);

    const series = await RecurringSeries.findById(created.body.seriesId).lean();
    expect(series?.endDate?.toISOString().slice(0, 10)).toBe(fifth(-1));
  });

  it("keeps generating for a bill with no end date", async () => {
    const created = await alice.post<BillBody>("/api/bills", loan());
    await alice.get("/api/bills");
    const count = await Bill.countDocuments({ seriesId: created.body.seriesId });
    expect(count).toBeGreaterThanOrEqual(5); // four months ago up to this month
    expect((await RecurringSeries.findById(created.body.seriesId).lean())?.endDate).toBeNull();
  });

  it("rejects an end date that makes no sense", async () => {
    expect((await alice.post("/api/bills", loan({ endDate: fifth(-6) }))).status).toBe(400); // before the first payment
    expect((await alice.post("/api/bills", loan({ endDate: "someday" }))).status).toBe(400);
    expect(
      (await alice.post("/api/bills", loan({ recurrenceType: "one_time", endDate: fifth(2) }))).status,
    ).toBe(400);
    expect(await Bill.countDocuments({})).toBe(0);
  });

  it("changes the end date of an existing series and removes the pending payments after it", async () => {
    const created = await alice.post<BillBody>("/api/bills", loan());
    const seriesId = created.body.seriesId as string;
    const userId = ALICE;

    // Two future payments: one still pending, one already paid.
    await Bill.create({
      userId, name: "Car loan", amount: 9000, dueDate: new Date("2098-01-05T00:00:00.000Z"),
      status: "pending", category: "transport", isSubscription: true, recurrenceType: "recurring",
      seriesId, billingCycle: "2098-01",
    });
    await Bill.create({
      userId, name: "Car loan", amount: 9000, dueDate: new Date("2098-02-05T00:00:00.000Z"),
      status: "paid", category: "transport", isSubscription: true, recurrenceType: "recurring",
      seriesId, billingCycle: "2098-02",
    });

    // End the loan at its first payment.
    const ended = await alice.patch(`/api/bills/${created.body._id}`, { endDate: fifth(-4) });
    expect(ended.status).toBe(200);

    expect(await Bill.findOne({ seriesId, billingCycle: "2098-01" })).toBeNull();
    expect((await Bill.findOne({ seriesId, billingCycle: "2098-02" }))?.status).toBe("paid");
    expect(await Bill.findById(created.body._id)).not.toBeNull();
    expect((await RecurringSeries.findById(seriesId).lean())?.endDate?.toISOString().slice(0, 10)).toBe(fifth(-4));

    // Removing the end date lets the series run again.
    const reopened = await alice.patch(`/api/bills/${created.body._id}`, { endDate: null });
    expect(reopened.status).toBe(200);
    expect((await RecurringSeries.findById(seriesId).lean())?.endDate).toBeNull();
  });

  it("refuses an end date before the bill being edited, and on one-time bills", async () => {
    const created = await alice.post<BillBody>("/api/bills", loan());
    const latest = (await alice.get<BillBody[]>("/api/bills")).body
      .filter((b) => b.seriesId === created.body.seriesId)
      .sort((a, b) => b.dueDate.localeCompare(a.dueDate))[0];
    expect((await alice.patch(`/api/bills/${latest._id}`, { endDate: fifth(-3) })).status).toBe(400);

    const oneTime = await alice.post<BillBody>("/api/bills", {
      name: "Laptop", amount: 50000, dueDate: fifth(1), status: "pending", category: "transport",
    });
    expect((await alice.patch(`/api/bills/${oneTime.body._id}`, { endDate: fifth(2) })).status).toBe(400);
  });
});
