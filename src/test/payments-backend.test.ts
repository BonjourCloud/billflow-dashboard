import { describe, it, expect } from "vitest";
import {
  paymentCreateSchema,
  PAYMENT_METHODS,
  isValidPaymentId,
} from "../../server/src/models/Payment";
import { noteCreateSchema } from "../../server/src/models/BillNote";
import { isValidBillId } from "../../server/src/models/Bill";

// ──────────────────────────────────────────────
// Unit Tests: Schema & Model Validation
// ──────────────────────────────────────────────

describe("Phase 3A — Payment Schema Validation", () => {
  const validBasePayment = {
    amount: 150.5,
    paymentDate: "2026-10-20T10:00:00.000Z",
    method: "credit_card" as const,
    reference: "TXN-88491",
    notes: "Monthly electric bill payment",
  };

  it("accepts valid payment payloads for all 4 supported methods", () => {
    for (const method of PAYMENT_METHODS) {
      const result = paymentCreateSchema.safeParse({
        ...validBasePayment,
        method,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.method).toBe(method);
        expect(result.data.amount).toBe(150.5);
        expect(result.data.status).toBe("completed");
        expect(result.data.paymentDate instanceof Date).toBe(true);
      }
    }
  });

  it("rejects unsupported legacy or invalid payment methods", () => {
    const invalidMethods = [
      "paypal",
      "bank",
      "bank_transfer",
      "crypto",
      "cheque",
      "apple_pay",
      "",
      "CREDIT_CARD",
    ];

    for (const method of invalidMethods) {
      const result = paymentCreateSchema.safeParse({
        ...validBasePayment,
        method: method as unknown as "credit_card",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const errors = result.error.flatten().fieldErrors;
        expect(errors.method).toBeDefined();
      }
    }
  });

  it("rejects non-positive, zero, or out-of-range amounts", () => {
    const invalidAmounts = [0, -1, -50.25, NaN, 1_000_000_001];

    for (const amount of invalidAmounts) {
      const result = paymentCreateSchema.safeParse({
        ...validBasePayment,
        amount,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const errors = result.error.flatten().fieldErrors;
        expect(errors.amount).toBeDefined();
      }
    }
  });

  it("rejects invalid date strings cleanly", () => {
    const invalidDates = ["not-a-date", "", "   ", "2026-99-99"];

    for (const paymentDate of invalidDates) {
      const result = paymentCreateSchema.safeParse({
        ...validBasePayment,
        paymentDate,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const errors = result.error.flatten().fieldErrors;
        expect(errors.paymentDate).toBeDefined();
      }
    }
  });

  it("accepts null or omitted optional reference and notes", () => {
    const result = paymentCreateSchema.safeParse({
      amount: 75.0,
      paymentDate: "2026-10-20",
      method: "upi",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.reference).toBeUndefined();
      expect(result.data.notes).toBeUndefined();
    }

    const resultWithNull = paymentCreateSchema.safeParse({
      amount: 75.0,
      paymentDate: "2026-10-20",
      method: "cash",
      reference: null,
      notes: null,
    });
    expect(resultWithNull.success).toBe(true);
  });

  it("rejects reference strings exceeding 100 characters", () => {
    const longRef = "R".repeat(101);
    const result = paymentCreateSchema.safeParse({
      ...validBasePayment,
      reference: longRef,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.reference).toBeDefined();
    }
  });

  it("rejects notes exceeding 500 characters", () => {
    const longNotes = "N".repeat(501);
    const result = paymentCreateSchema.safeParse({
      ...validBasePayment,
      notes: longNotes,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.notes).toBeDefined();
    }
  });

  it("validates MongoDB payment ObjectIDs correctly", () => {
    expect(isValidPaymentId("507f1f77bcf86cd799439011")).toBe(true);
    expect(isValidPaymentId("invalid-id")).toBe(false);
    expect(isValidPaymentId("")).toBe(false);
  });

  it("accepts valid idempotency keys and rejects invalid ones", () => {
    const validWithKey = paymentCreateSchema.safeParse({
      ...validBasePayment,
      idempotencyKey: "idem_abc123-def456-ghi789",
    });
    expect(validWithKey.success).toBe(true);
    if (validWithKey.success) {
      expect(validWithKey.data.idempotencyKey).toBe("idem_abc123-def456-ghi789");
    }

    // null allowed
    const validNullKey = paymentCreateSchema.safeParse({
      ...validBasePayment,
      idempotencyKey: null,
    });
    expect(validNullKey.success).toBe(true);

    // Exceeding 128 characters rejected
    const tooLongKey = paymentCreateSchema.safeParse({
      ...validBasePayment,
      idempotencyKey: "k".repeat(129),
    });
    expect(tooLongKey.success).toBe(false);
  });
});

describe("Phase 3A — Bill Note Schema Validation", () => {
  it("accepts valid note text", () => {
    const result = noteCreateSchema.safeParse({
      text: "Called customer service regarding discount code",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty or whitespace-only note text", () => {
    expect(noteCreateSchema.safeParse({ text: "" }).success).toBe(false);
    expect(noteCreateSchema.safeParse({ text: "   " }).success).toBe(false);
  });

  it("rejects note text exceeding 1000 characters", () => {
    const longText = "A".repeat(1001);
    expect(noteCreateSchema.safeParse({ text: longText }).success).toBe(false);
  });
});

// ──────────────────────────────────────────────
// Simulated Route Handler Tests
// (Distinguished contract verification without live Atlas DB dependency)
// ──────────────────────────────────────────────

interface MockBill {
  _id: string;
  userId: string;
  name: string;
  amount: number;
  status: "pending" | "paid" | "overdue";
}

interface MockPayment {
  _id: string;
  userId: string;
  billId: string;
  amount: number;
  paymentDate: Date;
  method: "cash" | "debit_card" | "credit_card" | "upi";
  status: "completed" | "failed" | "refunded";
  reference?: string | null;
  notes?: string | null;
  idempotencyKey?: string | null;
  createdAt: Date;
}

interface MockNote {
  _id: string;
  userId: string;
  billId: string;
  text: string;
  createdAt: Date;
}

describe("Phase 3A — Simulated Route Handlers: Authentication & Ownership", () => {
  let billsDb: MockBill[] = [];
  let paymentsDb: MockPayment[] = [];
  let notesDb: MockNote[] = [];

  const USER_ALICE = "user_alice_123";
  const USER_BOB = "user_bob_456";
  const BILL_ALICE = "507f1f77bcf86cd799439011";
  const BILL_BOB = "507f1f77bcf86cd799439022";

  function resetDatabases() {
    billsDb = [
      {
        _id: BILL_ALICE,
        userId: USER_ALICE,
        name: "Electric Bill",
        amount: 100.0,
        status: "pending",
      },
      {
        _id: BILL_BOB,
        userId: USER_BOB,
        name: "Water Bill",
        amount: 50.0,
        status: "pending",
      },
    ];
    paymentsDb = [];
    notesDb = [];
  }

  // Contract logic for GET /api/bills/:id/payments
  function simulateGetPayments(callerUserId: string | null, billId: string) {
    if (!callerUserId) {
      return { status: 401, error: "Authentication required." };
    }
    if (!isValidBillId(billId)) {
      return { status: 400, error: "Invalid bill ID format." };
    }
    const bill = billsDb.find((b) => b._id === billId && b.userId === callerUserId);
    if (!bill) {
      return { status: 404, error: "Bill not found." };
    }
    const payments = paymentsDb
      .filter((p) => p.billId === billId && p.userId === callerUserId)
      .sort((a, b) => b.paymentDate.getTime() - a.paymentDate.getTime());
    return { status: 200, data: payments };
  }

  // Contract logic for POST /api/bills/:id/payments
  function simulateCreatePayment(
    callerUserId: string | null,
    billId: string,
    body: unknown,
    currentTime: Date = new Date(),
  ) {
    if (!callerUserId) {
      return { status: 401, error: "Authentication required." };
    }
    if (!isValidBillId(billId)) {
      return { status: 400, error: "Invalid bill ID format." };
    }
    const bill = billsDb.find((b) => b._id === billId && b.userId === callerUserId);
    if (!bill) {
      return { status: 404, error: "Bill not found." };
    }

    const parsed = paymentCreateSchema.safeParse(body);
    if (!parsed.success) {
      return { status: 400, error: "Invalid payment data.", details: parsed.error.flatten() };
    }

    // Duplicate submission guard: 4 seconds window
    const fourSecondsAgo = new Date(currentTime.getTime() - 4000);
    const recentDuplicate = paymentsDb.find(
      (p) =>
        p.userId === callerUserId &&
        p.billId === billId &&
        p.amount === parsed.data.amount &&
        p.method === parsed.data.method &&
        p.createdAt >= fourSecondsAgo,
    );

    if (recentDuplicate) {
      return {
        status: 409,
        error: "Duplicate payment submission detected. Please wait a moment before trying again.",
      };
    }

    // Idempotency key uniqueness check (MongoDB E11000 duplicate key emulation)
    if (parsed.data.idempotencyKey) {
      const existingWithKey = paymentsDb.find(
        (p) => p.userId === callerUserId && p.idempotencyKey === parsed.data.idempotencyKey,
      );
      if (existingWithKey) {
        return {
          status: 409,
          error: "Duplicate payment submission detected for this request.",
        };
      }
    }

    const newPayment: MockPayment = {
      _id: "507f1f77bcf86cd799439099",
      userId: callerUserId,
      billId,
      amount: parsed.data.amount,
      paymentDate: parsed.data.paymentDate,
      method: parsed.data.method,
      status: parsed.data.status ?? "completed",
      reference: parsed.data.reference ?? null,
      notes: parsed.data.notes ?? null,
      idempotencyKey: parsed.data.idempotencyKey ?? null,
      createdAt: currentTime,
    };
    paymentsDb.push(newPayment);

    // Bill status integration
    if (newPayment.status === "completed") {
      const totalPaid = paymentsDb
        .filter((p) => p.billId === billId && p.userId === callerUserId && p.status === "completed")
        .reduce((sum, p) => sum + p.amount, 0);

      if (totalPaid >= bill.amount - 0.001) {
        bill.status = "paid";
      }
    }

    return { status: 201, data: newPayment };
  }

  // Contract logic for GET /api/bills/:id/notes
  function simulateGetNotes(callerUserId: string | null, billId: string) {
    if (!callerUserId) return { status: 401, error: "Authentication required." };
    if (!isValidBillId(billId)) return { status: 400, error: "Invalid bill ID format." };
    const bill = billsDb.find((b) => b._id === billId && b.userId === callerUserId);
    if (!bill) return { status: 404, error: "Bill not found." };
    const notes = notesDb
      .filter((n) => n.billId === billId && n.userId === callerUserId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return { status: 200, data: notes };
  }

  // Contract logic for POST /api/bills/:id/notes
  function simulateCreateNote(callerUserId: string | null, billId: string, body: unknown) {
    if (!callerUserId) return { status: 401, error: "Authentication required." };
    if (!isValidBillId(billId)) return { status: 400, error: "Invalid bill ID format." };
    const bill = billsDb.find((b) => b._id === billId && b.userId === callerUserId);
    if (!bill) return { status: 404, error: "Bill not found." };
    const parsed = noteCreateSchema.safeParse(body);
    if (!parsed.success) return { status: 400, error: "Invalid note data." };

    const newNote: MockNote = {
      _id: "507f1f77bcf86cd799439088",
      userId: callerUserId,
      billId,
      text: parsed.data.text,
      createdAt: new Date(),
    };
    notesDb.push(newNote);
    return { status: 201, data: newNote };
  }

  it("requires authentication for payment operations (401)", () => {
    resetDatabases();
    const getRes = simulateGetPayments(null, BILL_ALICE);
    expect(getRes.status).toBe(401);

    const postRes = simulateCreatePayment(null, BILL_ALICE, {
      amount: 50,
      paymentDate: "2026-10-20",
      method: "cash",
    });
    expect(postRes.status).toBe(401);
  });

  it("rejects invalid bill ID formats with 400", () => {
    resetDatabases();
    const getRes = simulateGetPayments(USER_ALICE, "not-valid-id");
    expect(getRes.status).toBe(400);

    const postRes = simulateCreatePayment(USER_ALICE, "123", {
      amount: 50,
      paymentDate: "2026-10-20",
      method: "cash",
    });
    expect(postRes.status).toBe(400);
  });

  it("returns 404 for non-existent bills", () => {
    resetDatabases();
    const nonExistentId = "507f1f77bcf86cd799439099";
    const getRes = simulateGetPayments(USER_ALICE, nonExistentId);
    expect(getRes.status).toBe(404);

    const postRes = simulateCreatePayment(USER_ALICE, nonExistentId, {
      amount: 50,
      paymentDate: "2026-10-20",
      method: "cash",
    });
    expect(postRes.status).toBe(404);
  });

  it("enforces bill ownership and blocks cross-user payment access (404)", () => {
    resetDatabases();
    // Alice tries to access or pay Bob's bill
    const getBobBill = simulateGetPayments(USER_ALICE, BILL_BOB);
    expect(getBobBill.status).toBe(404);

    const payBobBill = simulateCreatePayment(USER_ALICE, BILL_BOB, {
      amount: 50,
      paymentDate: "2026-10-20",
      method: "upi",
    });
    expect(payBobBill.status).toBe(404);
    expect(paymentsDb).toHaveLength(0);
  });

  it("prevents duplicate submissions within the deduplication window with 409", () => {
    resetDatabases();
    const now = new Date();
    const paymentPayload = {
      amount: 50,
      paymentDate: "2026-10-20",
      method: "debit_card",
    };

    const firstRes = simulateCreatePayment(USER_ALICE, BILL_ALICE, paymentPayload, now);
    expect(firstRes.status).toBe(201);
    expect(paymentsDb).toHaveLength(1);

    // Rapid double-submission 500ms later
    const duplicateRes = simulateCreatePayment(
      USER_ALICE,
      BILL_ALICE,
      paymentPayload,
      new Date(now.getTime() + 500),
    );
    expect(duplicateRes.status).toBe(409);
    expect(duplicateRes.error).toMatch(/Duplicate payment submission detected/);
    expect(paymentsDb).toHaveLength(1);

    // Legitimate subsequent submission after window has passed (5 seconds later)
    const laterRes = simulateCreatePayment(
      USER_ALICE,
      BILL_ALICE,
      paymentPayload,
      new Date(now.getTime() + 5000),
    );
    expect(laterRes.status).toBe(201);
    expect(paymentsDb).toHaveLength(2);
  });

  it("preserves bill status as pending on partial payment", () => {
    resetDatabases();
    const aliceBill = billsDb.find((b) => b._id === BILL_ALICE)!;
    expect(aliceBill.amount).toBe(100.0);
    expect(aliceBill.status).toBe("pending");

    // Partial payment of $40 (covers 40%)
    const partialRes = simulateCreatePayment(USER_ALICE, BILL_ALICE, {
      amount: 40,
      paymentDate: "2026-10-20",
      method: "upi",
    });
    expect(partialRes.status).toBe(201);
    expect(aliceBill.status).toBe("pending"); // MUST NOT BE PAID
  });

  it("transitions bill status to paid when full payment amount is reached", () => {
    resetDatabases();
    const aliceBill = billsDb.find((b) => b._id === BILL_ALICE)!;
    expect(aliceBill.status).toBe("pending");

    // First partial payment of $40
    simulateCreatePayment(USER_ALICE, BILL_ALICE, {
      amount: 40,
      paymentDate: "2026-10-20",
      method: "upi",
    }, new Date(1000));
    expect(aliceBill.status).toBe("pending");

    // Second payment of $60 completes the $100 obligation
    simulateCreatePayment(USER_ALICE, BILL_ALICE, {
      amount: 60,
      paymentDate: "2026-10-21",
      method: "credit_card",
    }, new Date(10000));
    expect(aliceBill.status).toBe("paid");
  });

  it("transitions bill status to paid when single payment covers total amount", () => {
    resetDatabases();
    const aliceBill = billsDb.find((b) => b._id === BILL_ALICE)!;
    expect(aliceBill.status).toBe("pending");

    const fullRes = simulateCreatePayment(USER_ALICE, BILL_ALICE, {
      amount: 100,
      paymentDate: "2026-10-20",
      method: "cash",
    });
    expect(fullRes.status).toBe(201);
    expect(aliceBill.status).toBe("paid");
  });

  it("retrieves payment history sorted by date", () => {
    resetDatabases();
    simulateCreatePayment(USER_ALICE, BILL_ALICE, {
      amount: 30,
      paymentDate: "2026-10-10",
      method: "cash",
    }, new Date(1000));

    simulateCreatePayment(USER_ALICE, BILL_ALICE, {
      amount: 70,
      paymentDate: "2026-10-18",
      method: "upi",
    }, new Date(10000));

    const listRes = simulateGetPayments(USER_ALICE, BILL_ALICE);
    expect(listRes.status).toBe(200);
    expect(listRes.data).toHaveLength(2);
    // Most recent payment date first
    expect((listRes.data as MockPayment[])[0].amount).toBe(70);
    expect((listRes.data as MockPayment[])[1].amount).toBe(30);
  });

  it("rejects duplicate payment with identical idempotency key with 409 even after deduplication window", () => {
    resetDatabases();
    const key = "client-txn-uuid-12345";
    const paymentPayload = {
      amount: 50,
      paymentDate: "2026-10-20",
      method: "debit_card",
      idempotencyKey: key,
    };

    const firstRes = simulateCreatePayment(USER_ALICE, BILL_ALICE, paymentPayload, new Date(1000));
    expect(firstRes.status).toBe(201);
    expect(paymentsDb).toHaveLength(1);

    // Attempt retry 10 seconds later (well past the 4-second deduplication window) with the SAME idempotency key
    const retryRes = simulateCreatePayment(
      USER_ALICE,
      BILL_ALICE,
      paymentPayload,
      new Date(11000),
    );
    expect(retryRes.status).toBe(409);
    expect(retryRes.error).toMatch(/Duplicate payment submission detected/);
    expect(paymentsDb).toHaveLength(1);

    // Genuinely new payment with different idempotency key succeeds
    const nextPaymentRes = simulateCreatePayment(
      USER_ALICE,
      BILL_ALICE,
      {
        ...paymentPayload,
        idempotencyKey: "client-txn-uuid-67890",
      },
      new Date(12000),
    );
    expect(nextPaymentRes.status).toBe(201);
    expect(paymentsDb).toHaveLength(2);
  });

  it("transitions bill status to paid when payment exceeds the bill amount (overpayment)", () => {
    resetDatabases();
    const aliceBill = billsDb.find((b) => b._id === BILL_ALICE)!;
    expect(aliceBill.status).toBe("pending");

    // Overpayment: paying $120 on a $100 bill
    const overpaymentRes = simulateCreatePayment(USER_ALICE, BILL_ALICE, {
      amount: 120,
      paymentDate: "2026-10-20",
      method: "credit_card",
    });
    expect(overpaymentRes.status).toBe(201);
    expect(aliceBill.status).toBe("paid");
  });

  it("transitions an overdue bill to paid upon receiving full payment", () => {
    resetDatabases();
    const aliceBill = billsDb.find((b) => b._id === BILL_ALICE)!;
    aliceBill.status = "overdue";

    const res = simulateCreatePayment(USER_ALICE, BILL_ALICE, {
      amount: 100,
      paymentDate: "2026-10-20",
      method: "upi",
    });
    expect(res.status).toBe(201);
    expect(aliceBill.status).toBe("paid");
  });

  it("does not mark bill as paid when payment status is failed or refunded", () => {
    resetDatabases();
    const aliceBill = billsDb.find((b) => b._id === BILL_ALICE)!;
    expect(aliceBill.status).toBe("pending");

    // Failed payment for the full amount
    const failedRes = simulateCreatePayment(
      USER_ALICE,
      BILL_ALICE,
      {
        amount: 100,
        paymentDate: "2026-10-20",
        method: "credit_card",
        status: "failed",
      },
      new Date(1000),
    );
    expect(failedRes.status).toBe(201);
    expect(aliceBill.status).toBe("pending"); // MUST REMAIN PENDING

    // Refunded payment for the full amount
    const refundedRes = simulateCreatePayment(
      USER_ALICE,
      BILL_ALICE,
      {
        amount: 100,
        paymentDate: "2026-10-20",
        method: "credit_card",
        status: "refunded",
      },
      new Date(10000),
    );
    expect(refundedRes.status).toBe(201);
    expect(aliceBill.status).toBe("pending"); // MUST REMAIN PENDING
  });

  it("supports persistent bill notes with ownership isolation", () => {
    resetDatabases();
    // Unauthenticated
    expect(simulateGetNotes(null, BILL_ALICE).status).toBe(401);

    // Cross-user access
    expect(simulateGetNotes(USER_ALICE, BILL_BOB).status).toBe(404);
    expect(simulateCreateNote(USER_ALICE, BILL_BOB, { text: "Hacked" }).status).toBe(404);

    // Valid note creation
    const createRes = simulateCreateNote(USER_ALICE, BILL_ALICE, {
      text: "Paid at bank branch counter",
    });
    expect(createRes.status).toBe(201);
    expect(notesDb).toHaveLength(1);

    // Fetch notes
    const getRes = simulateGetNotes(USER_ALICE, BILL_ALICE);
    expect(getRes.status).toBe(200);
    expect(getRes.data).toHaveLength(1);
    expect((getRes.data as MockNote[])[0].text).toBe("Paid at bank branch counter");
  });
});
