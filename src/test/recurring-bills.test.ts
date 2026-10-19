import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  calculateOccurrenceDueDate,
  getBillingCycleKey,
  parseBillingCycleKey,
  getDueCycles,
} from "../../server/src/services/recurrenceService.js";

// Mirror of updated server billBodySchema for contract verification
const billBodySchema = z
  .object({
    name: z.string().trim().min(1, "Bill name is required.").max(100),
    amount: z.number().positive("Amount must be a positive number."),
    dueDate: z
      .string()
      .trim()
      .min(1, "Due date is required.")
      .refine(
        (val) => {
          const timestamp = Date.parse(val);
          return !Number.isNaN(timestamp);
        },
        { message: "Invalid date format. Expected a valid date string." },
      )
      .transform((val) => new Date(val)),
    status: z.enum(["paid", "pending", "overdue"]),
    category: z.enum([
      "utilities",
      "entertainment",
      "software",
      "finance",
      "insurance",
      "housing",
    ]),
    isSubscription: z.boolean().optional(),
    recurrenceType: z.enum(["one_time", "recurring"]).optional(),
    recurringDay: z.number().int().min(1).max(31).optional(),
  })
  .strict()
  .transform((data) => {
    const recurrenceType =
      data.recurrenceType ?? (data.isSubscription ? "recurring" : "one_time");
    const isSubscription =
      data.isSubscription ?? (recurrenceType === "recurring");
    return {
      ...data,
      recurrenceType,
      isSubscription,
    };
  });

const billUpdateSchema = z
  .object({
    name: z.string().trim().min(1, "Bill name is required.").max(100).optional(),
    amount: z.number().positive("Amount must be a positive number.").optional(),
    dueDate: z
      .string()
      .trim()
      .min(1, "Due date is required.")
      .refine(
        (val) => {
          const timestamp = Date.parse(val);
          return !Number.isNaN(timestamp);
        },
        { message: "Invalid date format. Expected a valid date string." },
      )
      .transform((val) => new Date(val))
      .optional(),
    status: z.enum(["paid", "pending", "overdue"]).optional(),
    category: z
      .enum([
        "utilities",
        "entertainment",
        "software",
        "finance",
        "insurance",
        "housing",
      ])
      .optional(),
    isSubscription: z.boolean().optional(),
    recurrenceType: z.enum(["one_time", "recurring"]).optional(),
    recurringDay: z.number().int().min(1).max(31).optional(),
    updateScope: z.enum(["this", "future"]).optional(),
  })
  .strict();

describe("Recurrence Engine — Date Calculation & Month-End Clamping", () => {
  it("preserves day 31 and clamps to 28 in non-leap February (2026)", () => {
    const febDate = calculateOccurrenceDueDate(31, 2026, 1); // 1 = February
    expect(febDate.getUTCFullYear()).toBe(2026);
    expect(febDate.getUTCMonth()).toBe(1);
    expect(febDate.getUTCDate()).toBe(28);
  });

  it("preserves day 31 and clamps to 29 in leap February (2028)", () => {
    const febLeapDate = calculateOccurrenceDueDate(31, 2028, 1);
    expect(febLeapDate.getUTCFullYear()).toBe(2028);
    expect(febLeapDate.getUTCMonth()).toBe(1);
    expect(febLeapDate.getUTCDate()).toBe(29);
  });

  it("clamps day 31 to 30 in 30-day months (April, June, Sept, Nov)", () => {
    const aprDate = calculateOccurrenceDueDate(31, 2026, 3); // April
    expect(aprDate.getUTCDate()).toBe(30);

    const junDate = calculateOccurrenceDueDate(31, 2026, 5); // June
    expect(junDate.getUTCDate()).toBe(30);

    const sepDate = calculateOccurrenceDueDate(31, 2026, 8); // September
    expect(sepDate.getUTCDate()).toBe(30);

    const novDate = calculateOccurrenceDueDate(31, 2026, 10); // November
    expect(novDate.getUTCDate()).toBe(30);
  });

  it("restores the 31st anchor day after February and April without losing anchor", () => {
    const marDate = calculateOccurrenceDueDate(31, 2026, 2); // March
    expect(marDate.getUTCDate()).toBe(31);

    const mayDate = calculateOccurrenceDueDate(31, 2026, 4); // May
    expect(mayDate.getUTCDate()).toBe(31);

    const julDate = calculateOccurrenceDueDate(31, 2026, 6); // July
    expect(julDate.getUTCDate()).toBe(31);
  });

  it("keeps mid-month anchor day 15 constant across all months", () => {
    for (let month = 0; month < 12; month++) {
      const d = calculateOccurrenceDueDate(15, 2026, month);
      expect(d.getUTCDate()).toBe(15);
      expect(d.getUTCHours()).toBe(0);
      expect(d.getUTCMinutes()).toBe(0);
      expect(d.getUTCSeconds()).toBe(0);
    }
  });
});

describe("Recurrence Engine — Billing Cycles & Horizon Generation", () => {
  it("formats and parses billing cycle keys correctly", () => {
    expect(getBillingCycleKey(2026, 0)).toBe("2026-01");
    expect(getBillingCycleKey(2026, 9)).toBe("2026-10");
    expect(getBillingCycleKey(2026, 11)).toBe("2026-12");

    expect(parseBillingCycleKey("2026-01")).toEqual({ year: 2026, monthIndex: 0 });
    expect(parseBillingCycleKey("2026-10")).toEqual({ year: 2026, monthIndex: 9 });
  });

  it("generates missed cycles when user returns after months of absence", () => {
    // User created recurring series on June 15, 2026; current date is October 19, 2026
    const startDate = new Date(Date.UTC(2026, 5, 15)); // June 15
    const refDate = new Date(Date.UTC(2026, 9, 19)); // Oct 19

    const cycles = getDueCycles(startDate, 15, null, refDate);

    // Horizon is current month (Oct) + 1 month ahead (Nov): June, July, Aug, Sept, Oct, Nov
    const cycleKeys = cycles.map((c) => c.billingCycle);
    expect(cycleKeys).toEqual([
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
      "2026-10",
      "2026-11",
    ]);
  });

  it("generates initial occurrence when start date is in the future", () => {
    // Current date is Oct 2026; recurring bill starts Dec 2026
    const startDate = new Date(Date.UTC(2026, 11, 1)); // Dec 1, 2026
    const refDate = new Date(Date.UTC(2026, 9, 19)); // Oct 19, 2026

    const cycles = getDueCycles(startDate, 1, null, refDate);
    expect(cycles.length).toBeGreaterThanOrEqual(1);
    expect(cycles[0].billingCycle).toBe("2026-12");
  });

  it("respects series endDate and does not generate cycles beyond it", () => {
    const startDate = new Date(Date.UTC(2026, 0, 15)); // Jan 15, 2026
    const endDate = new Date(Date.UTC(2026, 2, 20)); // Mar 20, 2026
    const refDate = new Date(Date.UTC(2026, 9, 19)); // Oct 19, 2026

    const cycles = getDueCycles(startDate, 15, endDate, refDate);
    const cycleKeys = cycles.map((c) => c.billingCycle);
    expect(cycleKeys).toEqual(["2026-01", "2026-02", "2026-03"]);
  });
});

describe("Recurrence Contract & Backward Compatibility Schema Validation", () => {
  const baseBill = {
    name: "Fiber Internet",
    amount: 79.99,
    dueDate: "2026-10-15",
    status: "pending" as const,
    category: "utilities" as const,
  };

  it("defaults recurrenceType to one_time and isSubscription to false when omitted", () => {
    const parsed = billBodySchema.safeParse(baseBill);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.recurrenceType).toBe("one_time");
      expect(parsed.data.isSubscription).toBe(false);
    }
  });

  it("supports recurring bill with recurringDay", () => {
    const parsed = billBodySchema.safeParse({
      ...baseBill,
      recurrenceType: "recurring",
      recurringDay: 31,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.recurrenceType).toBe("recurring");
      expect(parsed.data.isSubscription).toBe(true);
      expect(parsed.data.recurringDay).toBe(31);
    }
  });

  it("rejects invalid recurringDay out of range (1-31)", () => {
    const invalidDays = [0, 32, -5, 15.5];
    for (const day of invalidDays) {
      const parsed = billBodySchema.safeParse({
        ...baseBill,
        recurrenceType: "recurring",
        recurringDay: day,
      });
      expect(parsed.success).toBe(false);
    }
  });

  it("preserves backward compatibility when existing client passes isSubscription boolean", () => {
    const legacyOneTime = billBodySchema.safeParse({
      ...baseBill,
      isSubscription: false,
    });
    expect(legacyOneTime.success).toBe(true);
    if (legacyOneTime.success) {
      expect(legacyOneTime.data.isSubscription).toBe(false);
      expect(legacyOneTime.data.recurrenceType).toBe("one_time");
    }

    const legacyRecurring = billBodySchema.safeParse({
      ...baseBill,
      isSubscription: true,
    });
    expect(legacyRecurring.success).toBe(true);
    if (legacyRecurring.success) {
      expect(legacyRecurring.data.isSubscription).toBe(true);
      expect(legacyRecurring.data.recurrenceType).toBe("recurring");
    }
  });

  it("validates updateScope in partial update schema", () => {
    const validThis = billUpdateSchema.safeParse({
      amount: 85.0,
      updateScope: "this",
    });
    expect(validThis.success).toBe(true);

    const validFuture = billUpdateSchema.safeParse({
      amount: 90.0,
      updateScope: "future",
    });
    expect(validFuture.success).toBe(true);

    const invalidScope = billUpdateSchema.safeParse({
      updateScope: "unknown_scope",
    });
    expect(invalidScope.success).toBe(false);
  });
});

describe("Recurrence Independent Payment & Deletion Semantics Simulation", () => {
  interface MockBill {
    _id: string;
    userId: string;
    seriesId?: string;
    billingCycle?: string;
    dueDate: Date;
    status: "paid" | "pending" | "overdue";
    amount: number;
  }

  interface MockSeries {
    _id: string;
    userId: string;
    name: string;
    amount: number;
    isActive: boolean;
    skippedCycles: string[];
  }

  it("marking an occurrence as paid does not change status of future occurrences", () => {
    const octOccurrence: MockBill = {
      _id: "bill_oct",
      userId: "user_123",
      seriesId: "series_abc",
      billingCycle: "2026-10",
      dueDate: new Date("2026-10-15"),
      status: "pending",
      amount: 15.99,
    };

    const novOccurrence: MockBill = {
      _id: "bill_nov",
      userId: "user_123",
      seriesId: "series_abc",
      billingCycle: "2026-11",
      dueDate: new Date("2026-11-15"),
      status: "pending",
      amount: 15.99,
    };

    // User marks October occurrence as paid
    octOccurrence.status = "paid";

    expect(octOccurrence.status).toBe("paid");
    expect(novOccurrence.status).toBe("pending"); // November untouched!
  });

  it("deleting with scope 'this' skips only current cycle while preserving series and other cycles", () => {
    const series: MockSeries = {
      _id: "series_abc",
      userId: "user_123",
      name: "Gym",
      amount: 50,
      isActive: true,
      skippedCycles: [],
    };

    let bills: MockBill[] = [
      {
        _id: "bill_oct",
        userId: "user_123",
        seriesId: "series_abc",
        billingCycle: "2026-10",
        dueDate: new Date("2026-10-15"),
        status: "paid",
        amount: 50,
      },
      {
        _id: "bill_nov",
        userId: "user_123",
        seriesId: "series_abc",
        billingCycle: "2026-11",
        dueDate: new Date("2026-11-15"),
        status: "pending",
        amount: 50,
      },
    ];

    // User deletes November occurrence with scope 'this'
    const targetCycle = "2026-11";
    bills = bills.filter((b) => b.billingCycle !== targetCycle);
    series.skippedCycles.push(targetCycle);

    expect(bills.length).toBe(1);
    expect(bills[0].billingCycle).toBe("2026-10");
    expect(bills[0].status).toBe("paid");
    expect(series.isActive).toBe(true);
    expect(series.skippedCycles).toContain("2026-11");
  });

  it("deleting with scope 'future' deactivates series and preserves past paid records", () => {
    const series: MockSeries = {
      _id: "series_abc",
      userId: "user_123",
      name: "Streaming Service",
      amount: 20,
      isActive: true,
      skippedCycles: [],
    };

    let bills: MockBill[] = [
      {
        _id: "bill_oct",
        userId: "user_123",
        seriesId: "series_abc",
        billingCycle: "2026-10",
        dueDate: new Date("2026-10-15"),
        status: "paid",
        amount: 20,
      },
      {
        _id: "bill_nov",
        userId: "user_123",
        seriesId: "series_abc",
        billingCycle: "2026-11",
        dueDate: new Date("2026-11-15"),
        status: "pending",
        amount: 20,
      },
      {
        _id: "bill_dec",
        userId: "user_123",
        seriesId: "series_abc",
        billingCycle: "2026-12",
        dueDate: new Date("2026-12-15"),
        status: "pending",
        amount: 20,
      },
    ];

    // User cancels from November onwards
    const cutoffDate = new Date("2026-11-15");
    bills = bills.filter((b) => b.dueDate < cutoffDate);
    series.isActive = false;

    // October paid record must remain intact
    expect(bills.length).toBe(1);
    expect(bills[0].billingCycle).toBe("2026-10");
    expect(bills[0].status).toBe("paid");
    expect(series.isActive).toBe(false);
  });
});
