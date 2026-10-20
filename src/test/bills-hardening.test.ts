import { describe, it, expect } from "vitest";
import { z } from "zod";

// MongoDB ObjectId validation logic matching server's isValidBillId
const isValidObjectId = (id: string): boolean => {
  return typeof id === "string" && /^[0-9a-fA-F]{24}$/.test(id);
};

// Mirror of server billBodySchema for contract verification
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
    isSubscription: z.boolean(),
  })
  .strict();

const billUpdateSchema = billBodySchema.partial();

describe("Iteration 2 Hardening — Bill ID Validation", () => {
  it("rejects malformed MongoDB bill IDs with 400 validation", () => {
    const malformedIds = [
      "invalid-id",
      "123",
      "507f1f77bcf86cd79943901", // 23 chars
      "507f1f77bcf86cd7994390111", // 25 chars
      "zzzzzzzzzzzzzzzzzzzzzzzz", // non-hex
      "",
    ];

    for (const id of malformedIds) {
      expect(isValidObjectId(id)).toBe(false);
    }
  });

  it("accepts valid 24-character hexadecimal MongoDB ObjectIDs", () => {
    const validIds = [
      "507f1f77bcf86cd799439011",
      "64b1f2c3d4e5f6a7b8c9d0e1",
      "000000000000000000000000",
      "ffffffffffffffffffffffff",
    ];

    for (const id of validIds) {
      expect(isValidObjectId(id)).toBe(true);
    }
  });
});

describe("Iteration 2 Hardening — Date Validation", () => {
  const baseValidBill = {
    name: "Electric Bill",
    amount: 142.3,
    status: "pending" as const,
    category: "utilities" as const,
    isSubscription: false,
  };

  it("rejects invalid date strings cleanly", () => {
    const invalidDates = [
      "not-a-date",
      "2026-99-99",
      "",
      "   ",
      "tomorrow",
    ];

    for (const invalidDate of invalidDates) {
      const result = billBodySchema.safeParse({
        ...baseValidBill,
        dueDate: invalidDate,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const errors = result.error.flatten().fieldErrors;
        expect(errors.dueDate).toBeDefined();
      }
    }
  });

  it("accepts valid date strings and converts them to valid Date objects", () => {
    const validDates = ["2026-03-25", "2026-12-01T00:00:00.000Z"];

    for (const validDate of validDates) {
      const result = billBodySchema.safeParse({
        ...baseValidBill,
        dueDate: validDate,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.dueDate).toBeInstanceOf(Date);
        expect(Number.isNaN(result.data.dueDate.getTime())).toBe(false);
      }
    }
  });

  it("rejects invalid date strings in partial updates", () => {
    const result = billUpdateSchema.safeParse({
      dueDate: "invalid-date",
    });
    expect(result.success).toBe(false);
  });
});

describe("Iteration 2 Hardening — Consistent Positive Amount Validation", () => {
  const baseValidBill = {
    name: "Cloud Storage",
    dueDate: "2026-04-01",
    status: "paid" as const,
    category: "software" as const,
    isSubscription: true,
  };

  it("rejects zero and negative amounts", () => {
    const nonPositiveAmounts = [0, -1, -0.01, -250.5];

    for (const amount of nonPositiveAmounts) {
      const createResult = billBodySchema.safeParse({
        ...baseValidBill,
        amount,
      });
      expect(createResult.success).toBe(false);

      const updateResult = billUpdateSchema.safeParse({
        amount,
      });
      expect(updateResult.success).toBe(false);
    }
  });

  it("accepts positive amounts", () => {
    const positiveAmounts = [0.01, 15.99, 100, 2200];

    for (const amount of positiveAmounts) {
      const createResult = billBodySchema.safeParse({
        ...baseValidBill,
        amount,
      });
      expect(createResult.success).toBe(true);

      const updateResult = billUpdateSchema.safeParse({
        amount,
      });
      expect(updateResult.success).toBe(true);
    }
  });
});

describe("Iteration 2 Hardening — Ownership Enforcement & Auth Rules", () => {
  interface MockBillRecord {
    _id: string;
    userId: string;
    name: string;
    amount: number;
  }

  const mockDatabase: MockBillRecord[] = [
    {
      _id: "507f1f77bcf86cd799439011",
      userId: "user_alice",
      name: "Alice's Internet",
      amount: 79.99,
    },
    {
      _id: "507f1f77bcf86cd799439022",
      userId: "user_bob",
      name: "Bob's Rent",
      amount: 1500,
    },
  ];

  // Simulates server handler ownership check
  const simulateFindOne = (
    reqUserId: string | null | undefined,
    billId: string,
  ) => {
    if (!reqUserId) {
      return { status: 401, error: "Authentication required." };
    }
    if (!isValidObjectId(billId)) {
      return { status: 400, error: "Invalid bill ID format." };
    }
    const found = mockDatabase.find(
      (b) => b._id === billId && b.userId === reqUserId,
    );
    if (!found) {
      return { status: 404, error: "Bill not found." };
    }
    return { status: 200, data: found };
  };

  it("returns 401 when request is unauthenticated", () => {
    const res = simulateFindOne(null, "507f1f77bcf86cd799439011");
    expect(res.status).toBe(401);
    expect(res.error).toBe("Authentication required.");
  });

  it("returns 400 for malformed IDs before querying", () => {
    const res = simulateFindOne("user_alice", "malformed-id");
    expect(res.status).toBe(400);
    expect(res.error).toBe("Invalid bill ID format.");
  });

  it("returns 404 when user attempts to access another user's bill (ownership enforcement)", () => {
    // Alice attempts to access Bob's bill
    const res = simulateFindOne("user_alice", "507f1f77bcf86cd799439022");
    expect(res.status).toBe(404);
    expect(res.error).toBe("Bill not found.");
    expect("data" in res).toBe(false);
  });

  it("returns 404 for nonexistent bill with valid ID format", () => {
    const res = simulateFindOne("user_alice", "507f1f77bcf86cd799439099");
    expect(res.status).toBe(404);
    expect(res.error).toBe("Bill not found.");
  });

  it("returns 200 when accessing own bill", () => {
    const res = simulateFindOne("user_alice", "507f1f77bcf86cd799439011");
    expect(res.status).toBe(200);
    if ("data" in res) {
      expect(res.data.name).toBe("Alice's Internet");
    }
  });
});

describe("Bill submission idempotency and double-submit prevention", () => {
  it("prevents submission when a mutation is already pending (isPending = true)", () => {
    let callCount = 0;
    const onSave = () => {
      callCount++;
    };

    const simulateSubmit = (isPending: boolean, submitting: boolean) => {
      const isBusy = Boolean(isPending || submitting);
      if (isBusy) return false;
      onSave();
      return true;
    };

    // First attempt while pending: blocked
    const attemptedWhilePending = simulateSubmit(true, false);
    expect(attemptedWhilePending).toBe(false);
    expect(callCount).toBe(0);

    // Attempt while idle: succeeds
    const attemptedWhileIdle = simulateSubmit(false, false);
    expect(attemptedWhileIdle).toBe(true);
    expect(callCount).toBe(1);
  });

  it("prevents repeated synchronous clicks via local submitting guard", () => {
    let callCount = 0;
    const onSave = () => {
      callCount++;
    };

    let submitting = false;
    const handleSubmit = () => {
      if (submitting) return;
      submitting = true;
      onSave();
    };

    // Rapid double click
    handleSubmit();
    handleSubmit();
    handleSubmit();

    expect(callCount).toBe(1);
  });
});
