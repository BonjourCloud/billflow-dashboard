import { Bill, BillCategory } from '@/data/bills';
import { PaymentRecord } from '@/data/billDetails';
import { InstallmentPlan } from '@/data/installments';

export interface InsightItem {
  id: string;
  type: 'warning' | 'info';
  text: string;
}

export interface InsightOptions {
  payments?: PaymentRecord[];
  plans?: InstallmentPlan[];
}

/**
 * Normalizes any string date or Date object to a UTC midnight Date.
 * Avoids any timezone-shift or daylight-saving discrepancies.
 */
export function parseDateUtc(dateInput: string | Date): Date {
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (Number.isNaN(d.getTime())) {
    return new Date(0);
  }
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

export function formatCurrency(amount: number): string {
  return `$${amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatCategory(category: string): string {
  if (!category) return '';
  return category.charAt(0).toUpperCase() + category.slice(1);
}

/**
 * Identifies overdue bills and their total outstanding amount.
 * Paid bills are strictly excluded from being marked overdue or outstanding.
 */
export function getOverdueBills(
  bills: Bill[],
  referenceDate: Date = new Date(),
): {
  count: number;
  totalAmount: number;
  bills: Bill[];
} {
  const refMidnight = parseDateUtc(referenceDate);

  const overdue = bills.filter((b) => {
    // Invariant: paid bills are never overdue or outstanding
    if (b.status === 'paid') {
      return false;
    }

    if (b.status === 'overdue') {
      return true;
    }

    if (b.status === 'pending') {
      const billDate = parseDateUtc(b.dueDate);
      return billDate.getTime() < refMidnight.getTime();
    }

    return false;
  });

  const totalAmount = overdue.reduce(
    (sum, b) => sum + (typeof b.amount === 'number' && b.amount > 0 ? b.amount : 0),
    0,
  );

  return {
    count: overdue.length,
    totalAmount,
    bills: overdue,
  };
}

/**
 * Identifies upcoming pending bills due within the specified window (inclusive),
 * counting from referenceDate (day 0) through referenceDate + daysWindow.
 * Paid bills and overdue bills are excluded.
 */
export function getUpcomingBills(
  bills: Bill[],
  referenceDate: Date = new Date(),
  daysWindow: number = 5,
): {
  count: number;
  totalAmount: number;
  bills: Bill[];
} {
  const refMidnight = parseDateUtc(referenceDate);
  const windowEnd = new Date(refMidnight.getTime() + daysWindow * 86400000);

  const upcoming = bills.filter((b) => {
    if (b.status !== 'pending') {
      return false;
    }

    const billDate = parseDateUtc(b.dueDate);
    const time = billDate.getTime();
    return time >= refMidnight.getTime() && time <= windowEnd.getTime();
  });

  const totalAmount = upcoming.reduce(
    (sum, b) => sum + (typeof b.amount === 'number' && b.amount > 0 ? b.amount : 0),
    0,
  );

  return {
    count: upcoming.length,
    totalAmount,
    bills: upcoming,
  };
}

/**
 * Calculates dominant category only when sufficient data exists:
 * - At least 3 bills recorded
 * - Total spending > 0
 * - Top category accounts for >= 40% of total spending
 * - No tie for the top category
 */
export function getDominantCategory(bills: Bill[]): {
  category: BillCategory;
  amount: number;
  percentage: number;
} | null {
  if (!bills || bills.length < 3) {
    return null;
  }

  const categoryTotals = new Map<BillCategory, number>();
  let totalSpend = 0;

  for (const bill of bills) {
    if (typeof bill.amount === 'number' && bill.amount > 0) {
      totalSpend += bill.amount;
      categoryTotals.set(
        bill.category,
        (categoryTotals.get(bill.category) || 0) + bill.amount,
      );
    }
  }

  if (totalSpend <= 0) {
    return null;
  }

  let topCategory: BillCategory | null = null;
  let topAmount = 0;
  let isTie = false;

  for (const [cat, amt] of categoryTotals.entries()) {
    if (amt > topAmount) {
      topAmount = amt;
      topCategory = cat;
      isTie = false;
    } else if (amt === topAmount && amt > 0) {
      isTie = true;
    }
  }

  if (!topCategory || isTie) {
    return null;
  }

  const percentage = (topAmount / totalSpend) * 100;
  if (percentage < 40) {
    return null;
  }

  return {
    category: topCategory,
    amount: topAmount,
    percentage: Math.round(percentage),
  };
}

/**
 * Computes deterministic, real-data insights from the user's bills.
 *
 * Scoped strictly to authoritative fields present on Bill occurrences:
 * - Overdue obligations and outstanding amounts
 * - Upcoming bills due in the near term
 * - Dominant spend category distribution
 * - Helpful onboarding guidance when data is insufficient
 *
 * NOTE: Subscription run-rate, annualized commitments, and active recurring-category
 * overlaps are deliberately excluded here because `RecurringSeries.isActive` and `endDate`
 * are stored separately in MongoDB and not authoritatively available on Bill occurrences alone.
 * Those metrics will be backed by authoritative series queries in Phase 2.
 */
export function calculateInsights(
  bills: Bill[],
  referenceDate: Date = new Date(),
  options?: InsightOptions,
): InsightItem[] {
  const insights: InsightItem[] = [];

  // 1. Overdue bills insight
  const overdue = getOverdueBills(bills, referenceDate);
  if (overdue.count > 0) {
    const formattedAmount = formatCurrency(overdue.totalAmount);
    insights.push({
      id: 'overdue-bills',
      type: 'warning',
      text: `Action required: You have ${overdue.count} overdue ${
        overdue.count === 1 ? 'bill' : 'bills'
      } totaling ${formattedAmount}. Settle ${
        overdue.count === 1 ? 'it' : 'them'
      } promptly to avoid late penalties.`,
    });
  }

  // 2. Upcoming bills due in the next 5 days
  const upcoming = getUpcomingBills(bills, referenceDate, 5);
  if (upcoming.count > 0) {
    const formattedAmount = formatCurrency(upcoming.totalAmount);
    insights.push({
      id: 'upcoming-bills-5d',
      type: 'info',
      text: `Cash flow note: ${upcoming.count} ${
        upcoming.count === 1 ? 'bill is' : 'bills are'
      } due in the next 5 days, totaling ${formattedAmount}.`,
    });
  }

  // 3. Active installment financing insight (if plans provided)
  if (options?.plans && options.plans.length > 0) {
    const activePlans = options.plans.filter((p) => p.status === 'active');
    if (activePlans.length > 0) {
      const totalRemaining = activePlans.reduce(
        (sum, p) => sum + (p.remainingBalance || 0),
        0,
      );
      const monthlyCommitment = activePlans.reduce(
        (sum, p) => sum + (p.installmentAmount || 0),
        0,
      );
      insights.push({
        id: 'installment-financing',
        type: 'info',
        text: `Financing overview: You have ${activePlans.length} active installment ${
          activePlans.length === 1 ? 'plan' : 'plans'
        } with ${formatCurrency(totalRemaining)} remaining balance (${formatCurrency(
          monthlyCommitment,
        )}/mo commitment).`,
      });
    }
  }

  // 4. Dominant spending category
  const dominant = getDominantCategory(bills);
  if (dominant) {
    const formattedCat = formatCategory(dominant.category);
    const formattedAmount = formatCurrency(dominant.amount);
    insights.push({
      id: 'dominant-category',
      type: 'info',
      text: `${formattedCat} accounts for ${dominant.percentage}% (${formattedAmount}) of your total tracked expenses.`,
    });
  }

  // 5. Helpful onboarding guidance when insufficient data exists
  const hasPlans = options?.plans && options.plans.length > 0;
  if (bills.length === 0 && !hasPlans) {
    insights.push({
      id: 'onboarding-empty',
      type: 'info',
      text: 'No bills recorded yet. Add your one-time and recurring bills to unlock real-time spending insights, upcoming payment alerts, and category analytics.',
    });
  } else if (insights.length === 0) {
    insights.push({
      id: 'onboarding-guidance',
      type: 'info',
      text: 'Keep adding your regular bills and recurring subscriptions to unlock category spend distribution and cash flow insights.',
    });
  }

  return insights;
}
