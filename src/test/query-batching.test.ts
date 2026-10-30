import { describe, it, expect, vi, beforeEach } from "vitest";

// Counts database calls: the recurring-bill and reminder generators run on
// every dashboard load (and the notification poll), so their query count must
// not grow with the number of bills or months.
const calls = vi.hoisted(() => ({
  billFindOne: vi.fn(),
  billFind: vi.fn(),
  billCreate: vi.fn(),
  seriesFind: vi.fn(),
  notificationFind: vi.fn(),
  notificationFindOne: vi.fn(),
  notificationCreate: vi.fn(),
  notificationUpdateMany: vi.fn(),
}));

const chain = (rows: unknown[]) => {
  const q: Record<string, unknown> = {};
  q.select = () => q;
  q.sort = () => q;
  q.lean = async () => rows;
  return q;
};

vi.mock("../../server/src/models/Bill", () => ({
  Bill: {
    find: (...a: unknown[]) => calls.billFind(...a),
    findOne: (...a: unknown[]) => calls.billFindOne(...a),
    create: (...a: unknown[]) => calls.billCreate(...a),
  },
}));
vi.mock("../../server/src/models/RecurringSeries", () => ({
  RecurringSeries: { find: (...a: unknown[]) => calls.seriesFind(...a) },
}));
vi.mock("../../server/src/models/Notification", () => ({
  Notification: {
    find: (...a: unknown[]) => calls.notificationFind(...a),
    findOne: (...a: unknown[]) => calls.notificationFindOne(...a),
    create: (...a: unknown[]) => calls.notificationCreate(...a),
    updateMany: (...a: unknown[]) => calls.notificationUpdateMany(...a),
  },
}));

import { generateDueOccurrencesForUser } from "../../server/src/services/recurrenceService";
import { generateRemindersForUser } from "../../server/src/services/reminderService";

beforeEach(() => {
  Object.values(calls).forEach((fn) => fn.mockReset());
});

describe("generateDueOccurrencesForUser", () => {
  const series = {
    _id: "series1",
    name: "Car loan",
    amount: 9000,
    category: "transport",
    recurringDay: 5,
    startDate: new Date("2024-01-05T00:00:00.000Z"), // ~34 months before the reference date
    endDate: null,
    skippedCycles: ["2024-03"],
  };
  const reference = new Date("2026-11-20T00:00:00.000Z");

  it("looks up existing bills in one query, however many months the series spans", async () => {
    calls.seriesFind.mockReturnValue(chain([series]));
    calls.billFind.mockReturnValue(chain([])); // nothing exists yet
    calls.billCreate.mockResolvedValue({});

    const { createdCount } = await generateDueOccurrencesForUser("user1", reference);

    expect(calls.billFind).toHaveBeenCalledTimes(1);
    expect(calls.billFindOne).not.toHaveBeenCalled();
    // Jan 2024 .. Dec 2026 (the month ahead is included) is 36 months, minus the skipped cycle.
    expect(createdCount).toBe(35);
    expect(calls.billCreate).toHaveBeenCalledTimes(35);
  });

  it("creates nothing and stops after that one query when every bill already exists", async () => {
    calls.seriesFind.mockReturnValue(chain([series]));
    const existing: Array<{ seriesId: string; billingCycle: string }> = [];
    for (let y = 2024; y <= 2026; y++) {
      for (let m = 1; m <= 12; m++) {
        if (y === 2024 && m === 3) continue;
        existing.push({ seriesId: "series1", billingCycle: `${y}-${String(m).padStart(2, "0")}` });
      }
    }
    calls.billFind.mockReturnValue(chain(existing));

    const { createdCount } = await generateDueOccurrencesForUser("user1", reference);

    expect(createdCount).toBe(0);
    expect(calls.billFind).toHaveBeenCalledTimes(1);
    expect(calls.billCreate).not.toHaveBeenCalled();
  });

  it("does not query bills at all when there is no recurring series", async () => {
    calls.seriesFind.mockReturnValue(chain([]));
    expect((await generateDueOccurrencesForUser("user1", reference)).createdCount).toBe(0);
    expect(calls.billFind).not.toHaveBeenCalled();
  });

  it("respects an end date", async () => {
    calls.seriesFind.mockReturnValue(
      chain([{ ...series, skippedCycles: [], endDate: new Date("2024-06-05T00:00:00.000Z") }]),
    );
    calls.billFind.mockReturnValue(chain([]));
    calls.billCreate.mockResolvedValue({});
    expect((await generateDueOccurrencesForUser("user1", reference)).createdCount).toBe(6); // Jan..Jun 2024
  });
});

describe("generateRemindersForUser", () => {
  const reference = new Date("2026-11-20T00:00:00.000Z");
  const overdue = (n: number) => ({
    _id: `bill${n}`,
    name: `Bill ${n}`,
    amount: 100,
    dueDate: new Date("2026-10-01T00:00:00.000Z"),
    status: "overdue",
  });

  it("checks existing reminders with one query per type, not one per bill", async () => {
    const bills = Array.from({ length: 40 }, (_, i) => overdue(i));
    calls.billFind.mockReturnValueOnce(chain([])).mockReturnValueOnce(chain(bills)); // due soon, overdue
    // Every overdue bill already has its reminder; nothing is unread.
    calls.notificationFind.mockImplementation((query: { isRead?: boolean }) =>
      chain(query.isRead === false ? [] : bills.map((b) => ({ billId: b._id }))),
    );
    calls.notificationUpdateMany.mockResolvedValue({});

    const { createdCount } = await generateRemindersForUser("user1", reference);

    expect(createdCount).toBe(0);
    expect(calls.notificationFindOne).not.toHaveBeenCalled();
    // One existing-reminder lookup for the overdue bills, one for unread notifications.
    expect(calls.notificationFind).toHaveBeenCalledTimes(2);
    expect(calls.notificationCreate).not.toHaveBeenCalled();
  });

  it("still creates a reminder for a bill that has none", async () => {
    const bills = [overdue(1), overdue(2)];
    calls.billFind.mockReturnValueOnce(chain([])).mockReturnValueOnce(chain(bills));
    calls.notificationFind.mockImplementation((query: { isRead?: boolean }) =>
      chain(query.isRead === false ? [] : [{ billId: "bill1" }]),
    );
    calls.notificationCreate.mockResolvedValue({});
    calls.notificationUpdateMany.mockResolvedValue({});

    const { createdCount } = await generateRemindersForUser("user1", reference);

    expect(createdCount).toBe(1);
    expect(calls.notificationCreate).toHaveBeenCalledTimes(1);
    expect(calls.notificationCreate.mock.calls[0][0]).toMatchObject({ userId: "user1", billId: "bill2", type: "overdue" });
  });
});

describe("resolving reminders for paid bills", () => {
  it("only looks at bills that have unread notifications", async () => {
    const reference = new Date("2026-11-20T00:00:00.000Z");
    calls.billFind
      .mockReturnValueOnce(chain([])) // due soon
      .mockReturnValueOnce(chain([])) // overdue
      .mockReturnValueOnce(chain([{ _id: "billA" }])); // paid among the unread
    calls.notificationFind.mockReturnValue(chain([{ billId: "billA" }, { billId: "billB" }]));
    calls.notificationUpdateMany.mockResolvedValue({});

    await generateRemindersForUser("user1", reference);

    const paidQuery = calls.billFind.mock.calls[2][0];
    expect(paidQuery).toMatchObject({ userId: "user1", status: "paid", _id: { $in: ["billA", "billB"] } });
    expect(calls.notificationUpdateMany).toHaveBeenCalledWith(
      { userId: "user1", billId: { $in: ["billA"] }, isRead: false },
      { $set: { isRead: true } },
    );
  });
});
