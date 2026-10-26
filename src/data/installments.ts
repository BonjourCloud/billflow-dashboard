import { DEFAULT_CATEGORIES } from './categories';
import { Bill, BillCategory } from './bills';

export const PLAN_TYPES = [
  'car_loan',
  'credit_card_emi',
  'personal_loan',
  'other',
] as const;

export type PlanType = (typeof PLAN_TYPES)[number];

export const PLAN_STATUSES = [
  'active',
  'completed',
  'cancelled',
] as const;

export type PlanStatus = (typeof PLAN_STATUSES)[number];

export type PlanCategory = BillCategory;

export const PLAN_CATEGORIES: PlanCategory[] = DEFAULT_CATEGORIES.map((c) => c.slug);

export const PLAN_TYPE_LABELS: Record<PlanType, string> = {
  car_loan: 'Car Loan',
  credit_card_emi: 'Credit Card EMI',
  personal_loan: 'Personal Loan',
  other: 'Other EMI',
};

export const PLAN_STATUS_LABELS: Record<PlanStatus, string> = {
  active: 'Active',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export interface InstallmentPlan {
  _id: string;
  userId: string;
  name: string;
  planType: PlanType;
  category: PlanCategory;
  principalAmount: number;
  downPayment: number;
  financedAmount: number;
  totalInstallments: number;
  interestRate: number;
  totalInterest: number;
  scheduledTotal: number;
  installmentAmount: number;
  startDate: string;
  recurringDay: number;
  totalPaid: number;
  remainingBalance: number;
  status: PlanStatus;
  idempotencyKey?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InstallmentPlanDetailResponse {
  plan: InstallmentPlan;
  installments: Bill[];
}

export interface CreateInstallmentPlanInput {
  name: string;
  planType?: PlanType;
  category?: PlanCategory;
  principalAmount: number;
  downPayment?: number;
  totalInstallments: number;
  interestRate?: number;
  startDate: string;
  recurringDay?: number;
  idempotencyKey?: string | null;
}

export interface UpdateInstallmentPlanInput {
  name?: string;
  category?: PlanCategory;
  planType?: PlanType;
}

export type InstallmentFilterStatus = 'all' | PlanStatus;

/**
 * Calculates installment plan financial metrics using a simple flat-interest
 * calculation (I = P * r * t), which is standard for consumer retail EMIs
 * and credit card installment conversions.
 *
 * NOTE: This is a flat-interest calculation, NOT reducing-balance loan amortization.
 * Rounding is performed with 2-decimal-place precision to eliminate floating-point drift:
 *
 * 1. financedAmount = principalAmount - downPayment
 * 2. totalInterest = financedAmount * (interestRate / 100) * (totalInstallments / 12)
 * 3. scheduledTotal = financedAmount + totalInterest
 * 4. baseInstallmentAmount = floor((scheduledTotal / totalInstallments) * 100) / 100
 * 5. roundingDifference = scheduledTotal - (baseInstallmentAmount * totalInstallments)
 */
export function calculateInstallmentPlanTotals(params: {
  principalAmount: number;
  downPayment?: number;
  totalInstallments: number;
  interestRate?: number;
}): {
  financedAmount: number;
  totalInterest: number;
  scheduledTotal: number;
  baseInstallmentAmount: number;
  roundingDifference: number;
} {
  const principal = Math.round(params.principalAmount * 100) / 100;
  const down = Math.round((params.downPayment ?? 0) * 100) / 100;
  const financedAmount = Math.round((principal - down) * 100) / 100;

  if (financedAmount <= 0) {
    throw new Error(
      'Down payment cannot be greater than or equal to the principal amount.',
    );
  }

  const rate = params.interestRate ?? 0;
  const totalInterest =
    rate > 0
      ? Math.round(
          financedAmount * (rate / 100) * (params.totalInstallments / 12) * 100,
        ) / 100
      : 0;

  const scheduledTotal = Math.round((financedAmount + totalInterest) * 100) / 100;
  const baseInstallmentAmount =
    Math.floor((scheduledTotal / params.totalInstallments) * 100) / 100;
  const roundingDifference =
    Math.round(
      (scheduledTotal - baseInstallmentAmount * params.totalInstallments) * 100,
    ) / 100;

  return {
    financedAmount,
    totalInterest,
    scheduledTotal,
    baseInstallmentAmount,
    roundingDifference,
  };
}
