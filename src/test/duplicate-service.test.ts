import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({ billFindOne: vi.fn(), seriesFindOne: vi.fn() }));

const query = (row: unknown) => {
  const q: Record<string, unknown> = {};
  q.collation = () => q;
  q.select = () => q;
  q.lean = async () => row;
  return q;
};

vi.mock("../../server/src/models/Bill", () => ({
  Bill: { findOne: (...a: unknown[]) => m.billFindOne(...a) },
}));
vi.mock("../../server/src/models/RecurringSeries", () => ({
  RecurringSeries: { findOne: (...a: unknown[]) => m.seriesFindOne(...a) },
}));

import { findDuplicateBill } from "../../server/src/services/duplicateService";

const base = { name: " Rent ", amount: 20000, dueDate: new Date("2027-01-05T00:00:00.000Z"), recurring: false };

describe("findDuplicateBill", () => {
  beforeEach(() => {
    m.billFindOne.mockReset();
    m.seriesFindOne.mockReset();
  });

  it("queries the user's bills for the same trimmed name, amount and UTC day", async () => {
    m.billFindOne.mockReturnValue(query(null));
    expect(await findDuplicateBill("u1", base)).toBeNull();
    const filter = m.billFindOne.mock.calls[0][0];
    expect(filter.userId).toBe("u1");
    expect(filter.name).toBe("Rent");
    expect(filter.amount).toBe(20000);
    expect(filter.dueDate.$gte.toISOString()).toBe("2027-01-05T00:00:00.000Z");
    expect(filter.dueDate.$lt.toISOString()).toBe("2027-01-06T00:00:00.000Z");
    expect(m.seriesFindOne).not.toHaveBeenCalled();
  });

  it("reports a matching bill", async () => {
    m.billFindOne.mockReturnValue(query({ name: "Rent", amount: 20000, dueDate: base.dueDate }));
    expect(await findDuplicateBill("u1", base)).toMatchObject({ kind: "bill", name: "Rent" });
  });

  it("checks active recurring series only for recurring bills", async () => {
    m.billFindOne.mockReturnValue(query(null));
    m.seriesFindOne.mockReturnValue(query({ name: "Rent", amount: 20000, startDate: base.dueDate }));
    expect(await findDuplicateBill("u1", { ...base, recurring: true })).toMatchObject({ kind: "recurring" });
    expect(m.seriesFindOne.mock.calls[0][0]).toMatchObject({ userId: "u1", isActive: true });
  });
});
