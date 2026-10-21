import { describe, it, expect } from "vitest";
import {
  calculateInstallmentPlanTotals,
  installmentPlanCreateSchema,
  installmentPlanUpdateSchema,
  isValidPlanId,
  PLAN_TYPES,
  PLAN_CATEGORIES,
} from "../../server/src/models/InstallmentPlan";
import { calculateOccurrenceDueDate } from "../../server/src/services/recurrenceService";
import { isValidBillId } from "../../server/src/models/Bill";

// ──────────────────────────────────────────────
// Unit Tests: Calculations & Financial Math
// ──────────────────────────────────────────────

describe("Phase 3B — Installment Financial Calculations", () => {
  it("calculates zero-interest installment plan without rounding difference", () => {
    const result = calculateInstallmentPlanTotals({
      principalAmount: 1200,
      downPayment: 0,
      totalInstallments: 12,
      interestRate: 0,
    });

    expect(result.financedAmount).toBe(1200);
    expect(result.totalInterest).toBe(0);
    expect(result.scheduledTotal).toBe(1200);
    expect(result.baseInstallmentAmount).toBe(100);
    expect(result.roundingDifference).toBe(0);
  });

  it("calculates flat interest car loan correctly", () => {
    // Principal: $10,000, Down payment: $2,000 -> Financed: $8,000
    // Rate: 6% per annum, Duration: 24 months (2 years)
    // Interest = $8,000 * 0.06 * (24/12) = $960
    // Scheduled Total = $8,000 + $960 = $8,960
    const result = calculateInstallmentPlanTotals({
      principalAmount: 10000,
      downPayment: 2000,
      totalInstallments: 24,
      interestRate: 6,
    });

    expect(result.financedAmount).toBe(8000);
    expect(result.totalInterest).toBe(960);
    expect(result.scheduledTotal).toBe(8960);
    // 8960 / 24 = 373.3333333333333
    // baseInstallmentAmount = 373.33
    // 373.33 * 24 = 8959.92
    // roundingDifference = 8960 - 8959.92 = 0.08
    expect(result.baseInstallmentAmount).toBe(373.33);
    expect(result.roundingDifference).toBe(0.08);

    // Sum of 23 regular installments + 1 adjusted installment = exact scheduled total
    const totalSum = 373.33 * 23 + (373.33 + 0.08);
    expect(Math.round(totalSum * 100) / 100).toBe(8960);
  });

  it("handles recurring remainder division cleanly with rounding difference (e.g. $1000 / 3)", () => {
    const result = calculateInstallmentPlanTotals({
      principalAmount: 1000,
      downPayment: 0,
      totalInstallments: 3,
      interestRate: 0,
    });

    expect(result.financedAmount).toBe(1000);
    expect(result.scheduledTotal).toBe(1000);
    expect(result.baseInstallmentAmount).toBe(333.33);
    expect(result.roundingDifference).toBe(0.01);

    const sum = 333.33 * 2 + (333.33 + 0.01);
    expect(Math.round(sum * 100) / 100).toBe(1000);
  });

  it("throws error if down payment is greater than or equal to principal", () => {
    expect(() =>
      calculateInstallmentPlanTotals({
        principalAmount: 500,
        downPayment: 500,
        totalInstallments: 6,
      }),
    ).toThrow("Down payment cannot be greater than or equal to the principal amount.");

    expect(() =>
      calculateInstallmentPlanTotals({
        principalAmount: 500,
        downPayment: 600,
        totalInstallments: 6,
      }),
    ).toThrow("Down payment cannot be greater than or equal to the principal amount.");
  });
});

// ──────────────────────────────────────────────
// Unit Tests: Zod Schemas & Validators
// ──────────────────────────────────────────────

describe("Phase 3B — Installment Plan Schemas & Validation", () => {
  const validBasePlan = {
    name: "Honda Civic EMI",
    planType: "car_loan" as const,
    category: "finance" as const,
    principalAmount: 25000,
    downPayment: 5000,
    totalInstallments: 36,
    interestRate: 4.5,
    startDate: "2026-11-01T00:00:00.000Z",
    recurringDay: 1,
  };

  it("accepts a completely valid installment plan creation payload", () => {
    const result = installmentPlanCreateSchema.safeParse(validBasePlan);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Honda Civic EMI");
      expect(result.data.principalAmount).toBe(25000);
      expect(result.data.downPayment).toBe(5000);
      expect(result.data.totalInstallments).toBe(36);
      expect(result.data.startDate instanceof Date).toBe(true);
    }
  });

  it("applies defaults for optional fields (downPayment=0, interestRate=0, planType='other', category='finance')", () => {
    const minimal = {
      name: "MacBook Pro EMI",
      principalAmount: 2400,
      totalInstallments: 12,
      startDate: "2026-11-15",
    };

    const result = installmentPlanCreateSchema.safeParse(minimal);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.downPayment).toBe(0);
      expect(result.data.interestRate).toBe(0);
      expect(result.data.planType).toBe("other");
      expect(result.data.category).toBe("finance");
    }
  });

  it("rejects totalInstallments less than 2 or greater than 120", () => {
    expect(
      installmentPlanCreateSchema.safeParse({ ...validBasePlan, totalInstallments: 1 }).success,
    ).toBe(false);

    expect(
      installmentPlanCreateSchema.safeParse({ ...validBasePlan, totalInstallments: 0 }).success,
    ).toBe(false);

    expect(
      installmentPlanCreateSchema.safeParse({ ...validBasePlan, totalInstallments: 121 }).success,
    ).toBe(false);

    // 2 and 120 are accepted boundary values
    expect(
      installmentPlanCreateSchema.safeParse({ ...validBasePlan, totalInstallments: 2 }).success,
    ).toBe(true);

    expect(
      installmentPlanCreateSchema.safeParse({ ...validBasePlan, totalInstallments: 120 }).success,
    ).toBe(true);
  });

  it("rejects non-positive principal amounts", () => {
    expect(
      installmentPlanCreateSchema.safeParse({ ...validBasePlan, principalAmount: 0 }).success,
    ).toBe(false);

    expect(
      installmentPlanCreateSchema.safeParse({ ...validBasePlan, principalAmount: -500 }).success,
    ).toBe(false);
  });

  it("rejects downPayment >= principal via schema refinement", () => {
    const equalRes = installmentPlanCreateSchema.safeParse({
      ...validBasePlan,
      principalAmount: 5000,
      downPayment: 5000,
    });
    expect(equalRes.success).toBe(false);

    const greaterRes = installmentPlanCreateSchema.safeParse({
      ...validBasePlan,
      principalAmount: 5000,
      downPayment: 6000,
    });
    expect(greaterRes.success).toBe(false);
  });

  it("rejects invalid date strings", () => {
    expect(
      installmentPlanCreateSchema.safeParse({ ...validBasePlan, startDate: "invalid-date" }).success,
    ).toBe(false);
  });

  it("validates update schema allowing safe metadata and rejecting unknown or immutable fields", () => {
    const validUpdate = installmentPlanUpdateSchema.safeParse({
      name: "Updated Plan Name",
      category: "utilities",
      planType: "credit_card_emi",
    });
    expect(validUpdate.success).toBe(true);

    // Strict schema rejects immutable fields such as principalAmount, totalInstallments
    const immutableAttempt = installmentPlanUpdateSchema.safeParse({
      principalAmount: 99999,
    });
    expect(immutableAttempt.success).toBe(false);
  });

  it("validates MongoDB Plan ObjectID formats cleanly", () => {
    expect(isValidPlanId("507f1f77bcf86cd799439011")).toBe(true);
    expect(isValidPlanId("invalid-id")).toBe(false);
    expect(isValidPlanId("")).toBe(false);
  });

  it("accepts valid idempotency keys and rejects invalid ones", () => {
    const validWithKey = installmentPlanCreateSchema.safeParse({
      ...validBasePlan,
      idempotencyKey: "plan_idem_12345",
    });
    expect(validWithKey.success).toBe(true);
    if (validWithKey.success) {
      expect(validWithKey.data.idempotencyKey).toBe("plan_idem_12345");
    }

    // null allowed
    const validNullKey = installmentPlanCreateSchema.safeParse({
      ...validBasePlan,
      idempotencyKey: null,
    });
    expect(validNullKey.success).toBe(true);

    // Empty string rejected
    const emptyKey = installmentPlanCreateSchema.safeParse({
      ...validBasePlan,
      idempotencyKey: "",
    });
    expect(emptyKey.success).toBe(false);

    // Exceeding 128 characters rejected
    const tooLongKey = installmentPlanCreateSchema.safeParse({
      ...validBasePlan,
      idempotencyKey: "k".repeat(129),
    });
    expect(tooLongKey.success).toBe(false);
  });
});

// ──────────────────────────────────────────────
// Simulated Route Handler Tests (Contract Isolation)
// ──────────────────────────────────────────────

interface MockPlan {
  _id: string;
  userId: string;
  name: string;
  planType: string;
  category: string;
  principalAmount: number;
  downPayment: number;
  financedAmount: number;
  totalInstallments: number;
  interestRate: number;
  totalInterest: number;
  scheduledTotal: number;
  installmentAmount: number;
  startDate: Date;
  recurringDay: number;
  totalPaid: number;
  remainingBalance: number;
  status: "active" | "completed" | "cancelled";
  idempotencyKey?: string | null;
  createdAt: Date;
}

interface MockBill {
  _id: string;
  userId: string;
  name: string;
  amount: number;
  dueDate: Date;
  status: "pending" | "paid" | "overdue";
  category: string;
  isSubscription: boolean;
  recurrenceType: "one_time" | "recurring";
  planId?: string | null;
  installmentNumber?: number | null;
  totalInstallments?: number | null;
}

interface MockNotification {
  _id: string;
  userId: string;
  billId: string;
  isRead: boolean;
}

interface MockPayment {
  _id: string;
  userId: string;
  billId: string;
  amount: number;
  paymentDate: Date;
  method: string;
  status: string;
  idempotencyKey?: string | null;
  createdAt: Date;
}

describe("Phase 3B — Simulated Route Handlers & Business Logic", () => {
  let plansDb: MockPlan[] = [];
  let billsDb: MockBill[] = [];
  let paymentsDb: MockPayment[] = [];
  let notificationsDb: MockNotification[] = [];

  const USER_ALICE = "user_alice_123";
  const USER_BOB = "user_bob_456";

  function resetDatabases() {
    plansDb = [];
    billsDb = [];
    paymentsDb = [];
    notificationsDb = [];
  }

  // Contract logic for POST /api/installments
  function simulateCreateInstallmentPlan(
    callerUserId: string | null,
    body: unknown,
    options?: { simulateInsertFailure?: boolean },
  ) {
    if (!callerUserId) return { status: 401, error: "Authentication required." };
    const parsed = installmentPlanCreateSchema.safeParse(body);
    if (!parsed.success) {
      return { status: 400, error: "Invalid installment plan data.", details: parsed.error.flatten() };
    }

    if (parsed.data.idempotencyKey) {
      const existing = plansDb.find(
        (p) => p.userId === callerUserId && p.idempotencyKey === parsed.data.idempotencyKey,
      );
      if (existing) {
        return {
          status: 409,
          error: "Duplicate installment plan creation detected for this request.",
        };
      }
    }

    const totals = calculateInstallmentPlanTotals({
      principalAmount: parsed.data.principalAmount,
      downPayment: parsed.data.downPayment,
      totalInstallments: parsed.data.totalInstallments,
      interestRate: parsed.data.interestRate,
    });

    const anchorDay = parsed.data.recurringDay ?? parsed.data.startDate.getUTCDate();
    const startYear = parsed.data.startDate.getUTCFullYear();
    const startMonth = parsed.data.startDate.getUTCMonth();

    const planId = `plan_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const plan: MockPlan = {
      _id: planId,
      userId: callerUserId,
      name: parsed.data.name,
      planType: parsed.data.planType ?? "other",
      category: parsed.data.category ?? "finance",
      principalAmount: parsed.data.principalAmount,
      downPayment: parsed.data.downPayment ?? 0,
      financedAmount: totals.financedAmount,
      totalInstallments: parsed.data.totalInstallments,
      interestRate: parsed.data.interestRate ?? 0,
      totalInterest: totals.totalInterest,
      scheduledTotal: totals.scheduledTotal,
      installmentAmount: totals.baseInstallmentAmount,
      startDate: parsed.data.startDate,
      recurringDay: anchorDay,
      totalPaid: 0,
      remainingBalance: totals.scheduledTotal,
      status: "active",
      idempotencyKey: parsed.data.idempotencyKey ?? null,
      createdAt: new Date(),
    };

    plansDb.push(plan);

    if (options?.simulateInsertFailure) {
      // Standalone rollback simulation: bill insertion failed, cleanup plan and any bills
      billsDb = billsDb.filter((b) => b.planId !== planId);
      plansDb = plansDb.filter((p) => p._id !== planId);
      return { status: 500, error: "Failed to insert installment bills. Plan rolled back." };
    }

    const generatedBills: MockBill[] = [];
    for (let k = 1; k <= parsed.data.totalInstallments; k++) {
      const monthOffset = k - 1;
      const currentMonthTotal = startMonth + monthOffset;
      const targetYear = startYear + Math.floor(currentMonthTotal / 12);
      const targetMonthIndex = currentMonthTotal % 12;

      const dueDate = calculateOccurrenceDueDate(anchorDay, targetYear, targetMonthIndex);
      const isFinal = k === parsed.data.totalInstallments;
      const amount = isFinal
        ? Math.round((totals.baseInstallmentAmount + totals.roundingDifference) * 100) / 100
        : totals.baseInstallmentAmount;

      const bill: MockBill = {
        _id: `bill_${planId}_${k}`,
        userId: callerUserId,
        name: `${parsed.data.name} (${k}/${parsed.data.totalInstallments})`,
        amount,
        dueDate,
        status: "pending",
        category: parsed.data.category ?? "finance",
        isSubscription: false,
        recurrenceType: "one_time",
        planId: plan._id,
        installmentNumber: k,
        totalInstallments: parsed.data.totalInstallments,
      };

      billsDb.push(bill);
      generatedBills.push(bill);
    }

    return { status: 201, data: { plan, installments: generatedBills } };
  }

  // Contract logic for GET /api/installments
  function simulateGetInstallmentPlans(callerUserId: string | null, statusFilter?: string) {
    if (!callerUserId) return { status: 401, error: "Authentication required." };
    let list = plansDb.filter((p) => p.userId === callerUserId);
    if (statusFilter && ["active", "completed", "cancelled"].includes(statusFilter)) {
      list = list.filter((p) => p.status === statusFilter);
    }
    return { status: 200, data: list };
  }

  // Contract logic for GET /api/installments/:id
  function simulateGetInstallmentPlanById(callerUserId: string | null, planId: string) {
    if (!callerUserId) return { status: 401, error: "Authentication required." };
    if (!planId) return { status: 400, error: "Invalid plan ID." };
    const plan = plansDb.find((p) => p._id === planId && p.userId === callerUserId);
    if (!plan) return { status: 404, error: "Installment plan not found." };
    const installments = billsDb
      .filter((b) => b.planId === planId && b.userId === callerUserId)
      .sort((a, b) => (a.installmentNumber ?? 0) - (b.installmentNumber ?? 0));
    return { status: 200, data: { plan, installments } };
  }

  // Contract logic for PATCH /api/installments/:id
  function simulateUpdateInstallmentPlan(callerUserId: string | null, planId: string, body: unknown) {
    if (!callerUserId) return { status: 401, error: "Authentication required." };
    const plan = plansDb.find((p) => p._id === planId && p.userId === callerUserId);
    if (!plan) return { status: 404, error: "Installment plan not found." };

    if (plan.status !== "active") {
      return { status: 400, error: `Cannot update an installment plan with status '${plan.status}'.` };
    }

    const parsed = installmentPlanUpdateSchema.safeParse(body);
    if (!parsed.success) return { status: 400, error: "Invalid update data." };

    if (parsed.data.name !== undefined) plan.name = parsed.data.name;
    if (parsed.data.category !== undefined) plan.category = parsed.data.category;
    if (parsed.data.planType !== undefined) plan.planType = parsed.data.planType;

    // Propagate changes to unpaid future installments
    if (parsed.data.category !== undefined) {
      billsDb
        .filter((b) => b.planId === planId && b.userId === callerUserId && b.status !== "paid")
        .forEach((b) => {
          b.category = parsed.data.category!;
        });
    }

    if (parsed.data.name !== undefined) {
      billsDb
        .filter((b) => b.planId === planId && b.userId === callerUserId && b.status !== "paid")
        .forEach((b) => {
          b.name = `${plan.name} (${b.installmentNumber}/${b.totalInstallments})`;
        });
    }

    return { status: 200, data: plan };
  }

  // Contract logic for POST /api/installments/:id/cancel
  function simulateCancelInstallmentPlan(callerUserId: string | null, planId: string) {
    if (!callerUserId) return { status: 401, error: "Authentication required." };
    const plan = plansDb.find((p) => p._id === planId && p.userId === callerUserId);
    if (!plan) return { status: 404, error: "Installment plan not found." };

    if (plan.status === "completed") {
      return { status: 400, error: "Completed installment plans cannot be cancelled." };
    }
    if (plan.status === "cancelled") {
      return { status: 400, error: "Installment plan is already cancelled." };
    }

    plan.status = "cancelled";

    // 1. Identify unpaid bills
    const unpaidBills = billsDb.filter(
      (b) => b.planId === planId && b.userId === callerUserId && b.status !== "paid",
    );
    const unpaidIds = unpaidBills.map((b) => b._id);

    // 2. Clean up notifications for unpaid bills
    notificationsDb = notificationsDb.filter((n) => !unpaidIds.includes(n.billId));

    // 3. Delete ONLY unpaid installments (status != 'paid')
    billsDb = billsDb.filter(
      (b) => !(b.planId === planId && b.userId === callerUserId && b.status !== "paid"),
    );

    return { status: 200, message: "Installment plan cancelled successfully.", plan };
  }

  // Contract logic for PATCH /api/bills/:id (generic route protection)
  function simulatePatchBill(
    callerUserId: string | null,
    billId: string,
    updates: Partial<MockBill>,
  ) {
    if (!callerUserId) return { status: 401, error: "Authentication required." };
    const bill = billsDb.find((b) => b._id === billId && b.userId === callerUserId);
    if (!bill) return { status: 404, error: "Bill not found." };

    if (bill.planId) {
      return {
        status: 400,
        error:
          "Individual installment bills cannot be directly modified. Manage the parent installment plan instead.",
      };
    }

    Object.assign(bill, updates);
    return { status: 200, data: bill };
  }

  // Contract logic for DELETE /api/bills/:id (generic route protection)
  function simulateDeleteBill(callerUserId: string | null, billId: string) {
    if (!callerUserId) return { status: 401, error: "Authentication required." };
    const bill = billsDb.find((b) => b._id === billId && b.userId === callerUserId);
    if (!bill) return { status: 404, error: "Bill not found." };

    if (bill.planId) {
      return {
        status: 400,
        error:
          "Individual installment bills cannot be deleted directly. Cancel the installment plan to clean up unpaid installments.",
      };
    }

    billsDb = billsDb.filter((b) => b._id !== billId);
    return { status: 204 };
  }

  // Contract logic for recording payment and syncing plan balance
  function simulatePayInstallmentBill(
    callerUserId: string,
    billId: string,
    amount: number,
    idempotencyKey?: string,
  ) {
    const bill = billsDb.find((b) => b._id === billId && b.userId === callerUserId);
    if (!bill) return { status: 404, error: "Bill not found." };

    if (idempotencyKey) {
      const dup = paymentsDb.find((p) => p.userId === callerUserId && p.idempotencyKey === idempotencyKey);
      if (dup) return { status: 409, error: "Duplicate payment submission." };
    }

    const payment: MockPayment = {
      _id: `pay_${Date.now()}`,
      userId: callerUserId,
      billId,
      amount,
      paymentDate: new Date(),
      method: "upi",
      status: "completed",
      idempotencyKey: idempotencyKey ?? null,
      createdAt: new Date(),
    };
    paymentsDb.push(payment);

    // Bill status update
    const totalPaidOnBill = paymentsDb
      .filter((p) => p.billId === billId && p.status === "completed")
      .reduce((s, p) => s + p.amount, 0);

    if (totalPaidOnBill >= bill.amount - 0.001) {
      bill.status = "paid";
    }

    // Sync parent plan balance if part of a plan
    if (bill.planId) {
      const plan = plansDb.find((p) => p._id === bill.planId && p.userId === callerUserId);
      if (plan) {
        const planBillIds = billsDb.filter((b) => b.planId === plan._id).map((b) => b._id);
        const totalPaidOnPlan = paymentsDb
          .filter((p) => planBillIds.includes(p.billId) && p.status === "completed")
          .reduce((s, p) => s + p.amount, 0);

        plan.totalPaid = Math.round(totalPaidOnPlan * 100) / 100;
        plan.remainingBalance = Math.max(0, Math.round((plan.scheduledTotal - plan.totalPaid) * 100) / 100);
        if (plan.remainingBalance <= 0.001 && plan.status !== "cancelled") {
          plan.status = "completed";
        }
      }
    }

    return { status: 201, data: payment };
  }

  it("requires authentication for plan operations (401)", () => {
    resetDatabases();
    expect(simulateGetInstallmentPlans(null).status).toBe(401);
    expect(simulateGetInstallmentPlanById(null, "plan_123").status).toBe(401);
    expect(simulateCreateInstallmentPlan(null, {}).status).toBe(401);
    expect(simulateCancelInstallmentPlan(null, "plan_123").status).toBe(401);
  });

  it("creates a plan and generates exactly N installment bills with accurate schedule and rounding", () => {
    resetDatabases();
    const payload = {
      name: "Auto Loan",
      planType: "car_loan",
      category: "finance",
      principalAmount: 12000,
      downPayment: 2000,
      totalInstallments: 5,
      interestRate: 0,
      startDate: "2026-11-15T00:00:00.000Z",
      recurringDay: 15,
    };

    const res = simulateCreateInstallmentPlan(USER_ALICE, payload);
    expect(res.status).toBe(201);
    expect(plansDb).toHaveLength(1);
    expect(billsDb).toHaveLength(5);

    const plan = res.data!.plan;
    expect(plan.financedAmount).toBe(10000);
    expect(plan.totalInstallments).toBe(5);
    expect(plan.scheduledTotal).toBe(10000);
    expect(plan.totalPaid).toBe(0);
    expect(plan.remainingBalance).toBe(10000);
    expect(plan.status).toBe("active");

    const bills = res.data!.installments;
    expect(bills).toHaveLength(5);

    // Verify individual installment bills
    bills.forEach((b: MockBill, idx: number) => {
      const num = idx + 1;
      expect(b.name).toBe(`Auto Loan (${num}/5)`);
      expect(b.installmentNumber).toBe(num);
      expect(b.totalInstallments).toBe(5);
      expect(b.planId).toBe(plan._id);
      expect(b.status).toBe("pending");
      expect(b.amount).toBe(2000); // 10000 / 5
    });

    // Verify progression of monthly due dates
    expect(bills[0].dueDate.getUTCMonth()).toBe(10); // November (0-indexed 10)
    expect(bills[1].dueDate.getUTCMonth()).toBe(11); // December (0-indexed 11)
    expect(bills[2].dueDate.getUTCMonth()).toBe(0);  // January (0-indexed 0)
    expect(bills[2].dueDate.getUTCFullYear()).toBe(2027);
  });

  it("handles month-end clamping in installment schedules (e.g. starting Jan 31)", () => {
    resetDatabases();
    const payload = {
      name: "End of Month Plan",
      principalAmount: 3000,
      totalInstallments: 3,
      startDate: "2026-01-31T00:00:00.000Z",
      recurringDay: 31,
    };

    const res = simulateCreateInstallmentPlan(USER_ALICE, payload);
    expect(res.status).toBe(201);
    const bills = res.data!.installments;

    // Jan 31 -> Feb 28 (non-leap 2026) -> Mar 31
    expect(bills[0].dueDate.getUTCDate()).toBe(31);
    expect(bills[0].dueDate.getUTCMonth()).toBe(0); // Jan

    expect(bills[1].dueDate.getUTCDate()).toBe(28); // Feb 28 clamped
    expect(bills[1].dueDate.getUTCMonth()).toBe(1); // Feb

    expect(bills[2].dueDate.getUTCDate()).toBe(31); // Mar 31 clamped back
    expect(bills[2].dueDate.getUTCMonth()).toBe(2); // Mar
  });

  it("enforces cross-user ownership isolation for plans and schedules", () => {
    resetDatabases();
    const createAlice = simulateCreateInstallmentPlan(USER_ALICE, {
      name: "Alice Phone EMI",
      principalAmount: 1000,
      totalInstallments: 4,
      startDate: "2026-11-01",
    });
    const planAliceId = createAlice.data!.plan._id;

    // Bob cannot view Alice's plan
    const getRes = simulateGetInstallmentPlanById(USER_BOB, planAliceId);
    expect(getRes.status).toBe(404);

    // Bob cannot update Alice's plan
    const updateRes = simulateUpdateInstallmentPlan(USER_BOB, planAliceId, { name: "Bob Hack" });
    expect(updateRes.status).toBe(404);

    // Bob cannot cancel Alice's plan
    const cancelRes = simulateCancelInstallmentPlan(USER_BOB, planAliceId);
    expect(cancelRes.status).toBe(404);

    // Alice's plan list only contains Alice's plan
    const aliceList = simulateGetInstallmentPlans(USER_ALICE);
    expect(aliceList.data).toHaveLength(1);
    const bobList = simulateGetInstallmentPlans(USER_BOB);
    expect(bobList.data).toHaveLength(0);
  });

  it("updates plan metadata safely and propagates name and category to unpaid bills", () => {
    resetDatabases();
    const createRes = simulateCreateInstallmentPlan(USER_ALICE, {
      name: "Electronics EMI",
      category: "software",
      principalAmount: 600,
      totalInstallments: 3,
      startDate: "2026-11-01",
    });
    const planId = createRes.data!.plan._id;

    // Pay the 1st installment
    const firstBill = billsDb.find((b) => b.planId === planId && b.installmentNumber === 1)!;
    simulatePayInstallmentBill(USER_ALICE, firstBill._id, 200);
    expect(firstBill.status).toBe("paid");

    // Update name and category
    const updateRes = simulateUpdateInstallmentPlan(USER_ALICE, planId, {
      name: "New Gadget EMI",
      category: "entertainment",
    });
    expect(updateRes.status).toBe(200);

    const updatedPlan = plansDb.find((p) => p._id === planId)!;
    expect(updatedPlan.name).toBe("New Gadget EMI");
    expect(updatedPlan.category).toBe("entertainment");

    // Paid installment preserves original name
    expect(firstBill.name).toBe("Electronics EMI (1/3)");

    // Unpaid 2nd and 3rd installments updated
    const unpaidBill2 = billsDb.find((b) => b.planId === planId && b.installmentNumber === 2)!;
    expect(unpaidBill2.name).toBe("New Gadget EMI (2/3)");
    expect(unpaidBill2.category).toBe("entertainment");
  });

  it("cancelling a plan deletes only unpaid future installments and strictly preserves paid ones", () => {
    resetDatabases();
    const createRes = simulateCreateInstallmentPlan(USER_ALICE, {
      name: "Personal Loan",
      principalAmount: 1200,
      totalInstallments: 4,
      startDate: "2026-11-01",
    });
    const planId = createRes.data!.plan._id;

    // Pay 1st installment ($300)
    const bill1 = billsDb.find((b) => b.planId === planId && b.installmentNumber === 1)!;
    simulatePayInstallmentBill(USER_ALICE, bill1._id, 300);
    expect(bill1.status).toBe("paid");

    // Cancel plan
    const cancelRes = simulateCancelInstallmentPlan(USER_ALICE, planId);
    expect(cancelRes.status).toBe(200);

    const plan = plansDb.find((p) => p._id === planId)!;
    expect(plan.status).toBe("cancelled");

    // Unpaid installments (2, 3, 4) deleted
    const remainingPlanBills = billsDb.filter((b) => b.planId === planId);
    expect(remainingPlanBills).toHaveLength(1);
    expect(remainingPlanBills[0]._id).toBe(bill1._id);
    expect(remainingPlanBills[0].status).toBe("paid");

    // Payments intact
    expect(paymentsDb).toHaveLength(1);
    expect(paymentsDb[0].billId).toBe(bill1._id);

    // Cannot cancel already cancelled plan
    expect(simulateCancelInstallmentPlan(USER_ALICE, planId).status).toBe(400);
  });

  it("updates plan remaining balance and marks plan completed when last installment is paid", () => {
    resetDatabases();
    const createRes = simulateCreateInstallmentPlan(USER_ALICE, {
      name: "Short EMI",
      principalAmount: 600,
      totalInstallments: 2,
      startDate: "2026-11-01",
    });
    const planId = createRes.data!.plan._id;
    const plan = plansDb.find((p) => p._id === planId)!;

    const bill1 = billsDb.find((b) => b.planId === planId && b.installmentNumber === 1)!;
    const bill2 = billsDb.find((b) => b.planId === planId && b.installmentNumber === 2)!;

    // Pay installment 1 of 2
    simulatePayInstallmentBill(USER_ALICE, bill1._id, 300);
    expect(bill1.status).toBe("paid");
    expect(bill2.status).toBe("pending");
    expect(plan.totalPaid).toBe(300);
    expect(plan.remainingBalance).toBe(300);
    expect(plan.status).toBe("active");

    // Pay installment 2 of 2
    simulatePayInstallmentBill(USER_ALICE, bill2._id, 300);
    expect(bill2.status).toBe("paid");
    expect(plan.totalPaid).toBe(600);
    expect(plan.remainingBalance).toBe(0);
    expect(plan.status).toBe("completed");

    // Completed plan cannot be cancelled
    expect(simulateCancelInstallmentPlan(USER_ALICE, planId).status).toBe(400);

    // Completed plan cannot be updated
    expect(simulateUpdateInstallmentPlan(USER_ALICE, planId, { name: "Cannot edit" }).status).toBe(400);
  });

  it("filters plan list by status active vs completed vs cancelled", () => {
    resetDatabases();
    const p1 = simulateCreateInstallmentPlan(USER_ALICE, {
      name: "Active Plan",
      principalAmount: 400,
      totalInstallments: 2,
      startDate: "2026-11-01",
    });

    const p2 = simulateCreateInstallmentPlan(USER_ALICE, {
      name: "To Complete Plan",
      principalAmount: 200,
      totalInstallments: 2,
      startDate: "2026-11-01",
    });
    // Pay off p2
    const p2Bills = billsDb.filter((b) => b.planId === p2.data!.plan._id);
    simulatePayInstallmentBill(USER_ALICE, p2Bills[0]._id, 100);
    simulatePayInstallmentBill(USER_ALICE, p2Bills[1]._id, 100);

    const p3 = simulateCreateInstallmentPlan(USER_ALICE, {
      name: "To Cancel Plan",
      principalAmount: 500,
      totalInstallments: 2,
      startDate: "2026-11-01",
    });
    simulateCancelInstallmentPlan(USER_ALICE, p3.data!.plan._id);

    // Check filters
    const allPlans = simulateGetInstallmentPlans(USER_ALICE).data;
    expect(allPlans).toHaveLength(3);

    const activePlans = simulateGetInstallmentPlans(USER_ALICE, "active").data;
    expect(activePlans).toHaveLength(1);
    expect(activePlans![0].name).toBe("Active Plan");

    const completedPlans = simulateGetInstallmentPlans(USER_ALICE, "completed").data;
    expect(completedPlans).toHaveLength(1);
    expect(completedPlans![0].name).toBe("To Complete Plan");

    const cancelledPlans = simulateGetInstallmentPlans(USER_ALICE, "cancelled").data;
    expect(cancelledPlans).toHaveLength(1);
    expect(cancelledPlans![0].name).toBe("To Cancel Plan");
  });

  it("rejects duplicate plan creation with same idempotency key with 409 Conflict", () => {
    resetDatabases();
    const payload = {
      name: "Appliance EMI",
      principalAmount: 1000,
      totalInstallments: 4,
      startDate: "2026-11-01",
      idempotencyKey: "plan-key-unique-998877",
    };

    const firstRes = simulateCreateInstallmentPlan(USER_ALICE, payload);
    expect(firstRes.status).toBe(201);
    expect(plansDb).toHaveLength(1);

    // Duplicate submission attempt with same key
    const duplicateRes = simulateCreateInstallmentPlan(USER_ALICE, payload);
    expect(duplicateRes.status).toBe(409);
    expect(duplicateRes.error).toMatch(/Duplicate installment plan creation detected/);
    expect(plansDb).toHaveLength(1);

    // Distinct submission with new key succeeds
    const newRes = simulateCreateInstallmentPlan(USER_ALICE, {
      ...payload,
      idempotencyKey: "plan-key-unique-112233",
    });
    expect(newRes.status).toBe(201);
    expect(plansDb).toHaveLength(2);
  });

  it("simulates standalone rollback cleanup when installment bill insertion fails", () => {
    resetDatabases();
    const payload = {
      name: "Failover Plan",
      principalAmount: 1000,
      totalInstallments: 4,
      startDate: "2026-11-01",
    };

    // Simulate bill insertion failure during standalone fallback
    const failRes = simulateCreateInstallmentPlan(USER_ALICE, payload, {
      simulateInsertFailure: true,
    });
    expect(failRes.status).toBe(500);

    // Verify atomic compensation cleaned up any partially created plan and bills
    expect(plansDb).toHaveLength(0);
    expect(billsDb).toHaveLength(0);
  });

  it("prevents generic PATCH /api/bills/:id on installment bills and returns 400", () => {
    resetDatabases();
    const createRes = simulateCreateInstallmentPlan(USER_ALICE, {
      name: "Electronics Plan",
      principalAmount: 600,
      totalInstallments: 3,
      startDate: "2026-11-01",
    });
    const installmentBill = billsDb.find((b) => b.planId === createRes.data!.plan._id)!;

    // Direct modification via generic PATCH endpoint rejected with 400
    const patchRes = simulatePatchBill(USER_ALICE, installmentBill._id, { amount: 999 });
    expect(patchRes.status).toBe(400);
    expect(patchRes.error).toMatch(/Individual installment bills cannot be directly modified/);
    expect(installmentBill.amount).toBe(200); // Unchanged
  });

  it("prevents generic DELETE /api/bills/:id on installment bills and returns 400 while permitting generic deletion of standard bills", () => {
    resetDatabases();
    // 1. Create a standard standalone bill
    const standardBill: MockBill = {
      _id: "bill_standalone_123",
      userId: USER_ALICE,
      name: "Gym Membership",
      amount: 50,
      dueDate: new Date(),
      status: "pending",
      category: "utilities",
      isSubscription: false,
      recurrenceType: "one_time",
    };
    billsDb.push(standardBill);

    // 2. Create an installment plan
    const createRes = simulateCreateInstallmentPlan(USER_ALICE, {
      name: "Laptop Plan",
      principalAmount: 1200,
      totalInstallments: 4,
      startDate: "2026-11-01",
    });
    const installmentBill = billsDb.find((b) => b.planId === createRes.data!.plan._id)!;

    // 3. Deleting installment bill directly rejected with 400
    const deleteInstallmentRes = simulateDeleteBill(USER_ALICE, installmentBill._id);
    expect(deleteInstallmentRes.status).toBe(400);
    expect(deleteInstallmentRes.error).toMatch(/Individual installment bills cannot be deleted directly/);
    expect(billsDb.find((b) => b._id === installmentBill._id)).toBeDefined();

    // 4. Deleting standard bill succeeds with 204
    const deleteStandardRes = simulateDeleteBill(USER_ALICE, standardBill._id);
    expect(deleteStandardRes.status).toBe(204);
    expect(billsDb.find((b) => b._id === standardBill._id)).toBeUndefined();
  });

  it("cleans up reminder notifications for unpaid bills when cancelling an installment plan, while preserving paid bills and notifications", () => {
    resetDatabases();
    const createRes = simulateCreateInstallmentPlan(USER_ALICE, {
      name: "Car Loan",
      principalAmount: 900,
      totalInstallments: 3,
      startDate: "2026-11-01",
    });
    const planId = createRes.data!.plan._id;
    const planBills = billsDb.filter((b) => b.planId === planId);

    // Pay installment #1
    simulatePayInstallmentBill(USER_ALICE, planBills[0]._id, 300);
    expect(planBills[0].status).toBe("paid");

    // Create notifications: one for paid bill #1, one for unpaid bill #2
    notificationsDb.push({
      _id: "notif_bill_1",
      userId: USER_ALICE,
      billId: planBills[0]._id,
      isRead: true,
    });
    notificationsDb.push({
      _id: "notif_bill_2",
      userId: USER_ALICE,
      billId: planBills[1]._id,
      isRead: false,
    });
    expect(notificationsDb).toHaveLength(2);

    // Cancel plan
    const cancelRes = simulateCancelInstallmentPlan(USER_ALICE, planId);
    expect(cancelRes.status).toBe(200);

    // Paid bill #1 remains
    const remainingBills = billsDb.filter((b) => b.planId === planId);
    expect(remainingBills).toHaveLength(1);
    expect(remainingBills[0]._id).toBe(planBills[0]._id);

    // Notification for unpaid bill #2 was purged, notification for paid bill #1 was preserved
    expect(notificationsDb).toHaveLength(1);
    expect(notificationsDb[0].billId).toBe(planBills[0]._id);
  });

  it("preserves cancelled status on an installment plan even if subsequent payment satisfies remaining balance", () => {
    resetDatabases();
    const createRes = simulateCreateInstallmentPlan(USER_ALICE, {
      name: "Device EMI",
      principalAmount: 400,
      totalInstallments: 2,
      startDate: "2026-11-01",
    });
    const planId = createRes.data!.plan._id;
    const planBills = billsDb.filter((b) => b.planId === planId);

    // Pay installment #1 ($200)
    simulatePayInstallmentBill(USER_ALICE, planBills[0]._id, 200);

    // Cancel plan (unpaid bill #2 is deleted)
    simulateCancelInstallmentPlan(USER_ALICE, planId);
    const plan = plansDb.find((p) => p._id === planId)!;
    expect(plan.status).toBe("cancelled");
    expect(plan.remainingBalance).toBe(200);

    // Historical payment or adjustment of $200 on preserved paid bill #1
    simulatePayInstallmentBill(USER_ALICE, planBills[0]._id, 200);

    // Balance recalculation reaches 0, but status remains 'cancelled'
    expect(plan.totalPaid).toBe(400);
    expect(plan.remainingBalance).toBe(0);
    expect(plan.status).toBe("cancelled"); // MUST NOT BE OVERWRITTEN TO 'completed'
  });
});
