import { describe, it, expect } from "vitest";
import type { Bill } from "@/data/bills";
import type { IncomeSource } from "@/data/budget";
import { DEFAULT_CATEGORIES } from "@/data/categories";
import { currentMonthKey, scopeBillsToMonth, shiftMonth } from "@/lib/billMonth";
import type { Goal } from "@/data/goals";
import { goalProgress, totalGoalReserve } from "@/lib/goals";
import {
  budgetRows,
  computeCashFlow,
  incomeOccurrencesForMonth,
} from "@/lib/cashFlow";
import { Bill as BillModel } from "../../server/src/models/Bill";
import { BillNote } from "../../server/src/models/BillNote";
import { Budget, BudgetSettings } from "../../server/src/models/Budget";
import { Goal as GoalModel } from "../../server/src/models/Goal";
import { IncomeSource as IncomeModel } from "../../server/src/models/IncomeSource";
import { InstallmentPlan } from "../../server/src/models/InstallmentPlan";
import { Payment } from "../../server/src/models/Payment";
import { RecurringSeries } from "../../server/src/models/RecurringSeries";
import {
  buildDemoDataset,
  getDemoUserId,
  isDemoUser,
} from "../../server/src/services/demoService";

const USER = "user_demo123";

// A spread of dates: month start, mid-month, month end, year end, leap day.
const DATES = [
  new Date(Date.UTC(2026, 9, 1)),
  new Date(Date.UTC(2026, 9, 27)),
  new Date(Date.UTC(2026, 0, 31)),
  new Date(Date.UTC(2026, 11, 31)),
  new Date(Date.UTC(2028, 1, 29)),
];

function asClientBills(now: Date): Bill[] {
  return buildDemoDataset(USER, now).bills.map((b) => ({
    _id: String(b._id),
    name: b.name,
    amount: b.amount,
    dueDate: b.dueDate.toISOString(),
    status: b.status,
    category: b.category,
    isSubscription: b.isSubscription,
    recurrenceType: b.recurrenceType,
    seriesId: b.seriesId ? String(b.seriesId) : null,
    billingCycle: b.billingCycle ?? null,
    planId: b.planId ? String(b.planId) : null,
    installmentNumber: b.installmentNumber ?? null,
    totalInstallments: b.totalInstallments ?? null,
  }));
}

function asClientGoals(now: Date): Goal[] {
  return buildDemoDataset(USER, now).goals.map((g) => ({
    _id: String(g._id),
    name: String(g.name),
    targetAmount: Number(g.targetAmount),
    targetDate: (g.targetDate as Date).toISOString(),
    startDate: (g.startDate as Date).toISOString(),
    monthlyAmount: Number(g.monthlyAmount),
    isActive: Boolean(g.isActive),
    savedAmount: (g.contributions as Array<{ amount: number }>).reduce((t, c) => t + c.amount, 0),
    contributions: [],
  }));
}

function asClientIncome(now: Date): IncomeSource[] {
  return buildDemoDataset(USER, now).income.map((i, n) => ({
    _id: `inc${n}`,
    name: String(i.name),
    amount: Number(i.amount),
    frequency: i.frequency as IncomeSource["frequency"],
    recurringDay: Number(i.recurringDay),
    startDate: (i.startDate as Date).toISOString(),
    endDate: null,
    isActive: Boolean(i.isActive),
    countInPlan: Boolean(i.countInPlan),
    receivedCycles: i.receivedCycles as string[],
  }));
}

describe("demo account helpers", () => {
  it("reads the demo user id only when it looks like a Clerk id", () => {
    expect(getDemoUserId({ DEMO_CLERK_USER_ID: " user_abc123 " })).toBe("user_abc123");
    expect(getDemoUserId({ DEMO_CLERK_USER_ID: "not-a-user" })).toBeNull();
    expect(getDemoUserId({})).toBeNull();
  });

  it("recognises only the configured user", () => {
    const env = { DEMO_CLERK_USER_ID: "user_abc123" };
    expect(isDemoUser("user_abc123", env)).toBe(true);
    expect(isDemoUser("user_other", env)).toBe(false);
    expect(isDemoUser(null, env)).toBe(false);
    expect(isDemoUser("user_abc123", {})).toBe(false);
  });
});

describe.each(DATES)("demo dataset on %s", (now) => {
  const data = buildDemoDataset(USER, now);
  const month = currentMonthKey(now);
  const bills = asClientBills(now);
  const monthBills = scopeBillsToMonth(bills, month, now).bills;
  const goals = asClientGoals(now);
  const flow = computeCashFlow(
    incomeOccurrencesForMonth(asClientIncome(now), month),
    monthBills,
    DEFAULT_CATEGORIES,
    totalGoalReserve(goals, month),
  );

  it("starts from ₹1,00,000 counted income", () => {
    expect(flow.income).toBe(100000);
    expect(flow.incomeCount).toBe(1);
  });

  it("spends at least half of income on bills and savings, yet leaves money free", () => {
    expect((flow.bills + flow.saved) / flow.income).toBeGreaterThanOrEqual(0.5);
    expect(flow.free).toBeGreaterThan(0);
    expect(flow.saved).toBe(15000);
    // Goal set-asides come out of what is free, and the plan still balances.
    expect(flow.goals).toBe(15250);
    expect(flow.free).toBe(flow.income - flow.bills - flow.saved - flow.goals);
  });

  it("has one goal in each state", () => {
    const states = goals.map((g) => goalProgress(g, month).state);
    expect(states).toContain("on_track");
    expect(states).toContain("behind");
    expect(states).toContain("funded");
    expect(states).toContain("paused");
    const school = goals.find((g) => g.name === "School fee fund")!;
    expect(school.targetAmount).toBe(135000);
    expect(school.monthlyAmount).toBe(11250);
    expect(school.savedAmount).toBe(22500);
  });

  it("includes rent of ₹20,000 and an EMI", () => {
    expect(monthBills.some((b) => b.name === "Rent" && b.amount === 20000)).toBe(true);
    expect(flow.emiRatio).toBeGreaterThan(0);
    expect(flow.emiRatio).toBeLessThan(0.4);
  });

  it("shows every budget status", () => {
    const rows = budgetRows(
      monthBills,
      DEFAULT_CATEGORIES.map((c) => ({ ...c, is_active: true })),
      data.budgets.map((b) => ({ category: b.category, limit: b.limit })),
    );
    const statuses = new Set(rows.map((r) => r.status));
    expect(statuses.has("ok")).toBe(true);
    expect(statuses.has("warn")).toBe(true);
    expect(statuses.has("over")).toBe(true);
  });

  it("is internally consistent", () => {
    const slugs = new Set(DEFAULT_CATEGORIES.map((c) => c.slug));
    for (const bill of data.bills) {
      expect(slugs.has(bill.category), bill.name).toBe(true);
      expect(bill.amount).toBeGreaterThan(0);
    }

    const ids = new Set(data.bills.map((b) => String(b._id)));
    expect(ids.size).toBe(data.bills.length);
    for (const payment of data.payments) expect(ids.has(String(payment.billId))).toBe(true);

    // One occurrence per series and month, one bill per installment number.
    const cycleKeys = data.bills
      .filter((b) => b.seriesId)
      .map((b) => `${b.seriesId}|${b.billingCycle}`);
    expect(new Set(cycleKeys).size).toBe(cycleKeys.length);
    const installmentKeys = data.bills
      .filter((b) => b.planId)
      .map((b) => `${b.planId}|${b.installmentNumber}`);
    expect(new Set(installmentKeys).size).toBe(installmentKeys.length);

    // Every paid bill has a payment; every payment is for a non-pending-only bill.
    const paidIds = new Set(data.payments.map((p) => String(p.billId)));
    for (const bill of data.bills.filter((b) => b.status === "paid")) {
      expect(paidIds.has(String(bill._id)), bill.name).toBe(true);
    }
  });

  it("covers plans, a cancelled subscription, uncounted and one-time income", () => {
    const statuses = data.plans.map((p) => p.status);
    expect(statuses).toContain("active");
    expect(statuses).toContain("completed");
    for (const plan of data.plans) {
      const planBills = data.bills.filter((b) => String(b.planId) === String(plan._id));
      expect(planBills).toHaveLength(Number(plan.totalInstallments));
      const scheduled = planBills.reduce((s, b) => s + b.amount, 0);
      expect(Math.round(scheduled * 100) / 100).toBe(plan.scheduledTotal);
    }
    expect(data.series.some((s) => s.isActive === false)).toBe(true);
    expect(data.income.some((i) => i.countInPlan === false)).toBe(true);
    expect(data.income.some((i) => i.frequency === "one_time")).toBe(true);
  });

  it("has an overdue bill, a bill due soon, and a part-paid bill", () => {
    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    expect(data.bills.some((b) => b.name === "Water tanker" && b.status === "overdue")).toBe(true);
    const soon = data.bills.find((b) => b.name === "Credit card bill");
    expect(soon?.status).toBe("pending");
    expect(soon!.dueDate.getTime() - today).toBe(2 * 24 * 60 * 60 * 1000);

    const electricity = data.bills.find(
      (b) => b.name === "Electricity" && b.billingCycle === `${month.year}-${String(month.month + 1).padStart(2, "0")}`,
    );
    const paidSoFar = data.payments
      .filter((p) => String(p.billId) === String(electricity?._id))
      .reduce((s, p) => s + Number(p.amount), 0);
    expect(paidSoFar).toBeGreaterThan(0);
    expect(paidSoFar).toBeLessThan(electricity!.amount);
    expect(electricity!.status).not.toBe("paid");
  });

  it("has next month's bills so projections and Upcoming have content", () => {
    const next = shiftMonth(month, 1);
    const nextBills = scopeBillsToMonth(bills, next, now).bills;
    expect(nextBills.length).toBeGreaterThan(5);
    expect(nextBills.some((b) => b.name === "Rent")).toBe(true);
  });
});

describe("demo documents pass the real Mongoose validation", () => {
  it.each(DATES)("on %s", async (now) => {
    const data = buildDemoDataset(USER, now);
    const check = async (Model: { new (doc: unknown): { validate(): Promise<unknown> } }, docs: unknown[]) => {
      for (const doc of docs) {
        await expect(new Model(doc).validate(), JSON.stringify(doc)).resolves.toBeUndefined();
      }
    };
    await check(BillModel, data.bills);
    await check(Payment, data.payments);
    await check(BillNote, data.notes);
    await check(RecurringSeries, data.series);
    await check(InstallmentPlan, data.plans);
    await check(IncomeModel, data.income);
    await check(Budget, data.budgets);
    await check(GoalModel, data.goals);
    await check(BudgetSettings, [data.settings]);
  });
});

describe("demo settings", () => {
  it("uses the 50/30/20 split with a 40% EMI warning", () => {
    const { settings } = buildDemoDataset(USER, new Date());
    expect(settings).toMatchObject({
      method: "50-30-20",
      needsPct: 50,
      wantsPct: 30,
      savingsPct: 20,
      emiRatioWarnPct: 40,
    });
  });
});
