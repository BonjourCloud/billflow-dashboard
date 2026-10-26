import { describe, it, expect } from 'vitest';
import {
  calculateInstallmentPlanTotals as frontendCalculate,
  InstallmentPlan,
} from '@/data/installments';
import { calculateInstallmentPlanTotals as backendCalculate } from '../../server/src/models/InstallmentPlan';

describe('Installments Frontend — Financial Calculation Parity & Rounding Rules', () => {
  it('matches backend calculation exactly for a standard vehicle loan with down payment', () => {
    const params = {
      principalAmount: 25000,
      downPayment: 5000,
      totalInstallments: 36,
      interestRate: 7.5,
    };

    const frontendResult = frontendCalculate(params);
    const backendResult = backendCalculate(params);

    expect(frontendResult).toEqual(backendResult);
    expect(frontendResult.financedAmount).toBe(20000);
    // 20000 * 0.075 * (36/12) = 4500
    expect(frontendResult.totalInterest).toBe(4500);
    expect(frontendResult.scheduledTotal).toBe(24500);
    // 24500 / 36 = 680.5555... -> base 680.55
    expect(frontendResult.baseInstallmentAmount).toBe(680.55);
    // 680.55 * 36 = 24499.80 -> roundingDifference = 0.20
    expect(frontendResult.roundingDifference).toBe(0.2);
    // Total sum verification with final month adjustment
    const totalWithFinalMonth =
      frontendResult.baseInstallmentAmount * (params.totalInstallments - 1) +
      (frontendResult.baseInstallmentAmount + frontendResult.roundingDifference);
    expect(Math.round(totalWithFinalMonth * 100) / 100).toBe(frontendResult.scheduledTotal);
  });

  it('matches backend calculation for a zero-interest (0% APR) installment purchase', () => {
    const params = {
      principalAmount: 1200,
      downPayment: 0,
      totalInstallments: 12,
      interestRate: 0,
    };

    const frontendResult = frontendCalculate(params);
    const backendResult = backendCalculate(params);

    expect(frontendResult).toEqual(backendResult);
    expect(frontendResult.financedAmount).toBe(1200);
    expect(frontendResult.totalInterest).toBe(0);
    expect(frontendResult.scheduledTotal).toBe(1200);
    expect(frontendResult.baseInstallmentAmount).toBe(100);
    expect(frontendResult.roundingDifference).toBe(0);
  });

  it('handles repeating decimal remainder adjustments cleanly without floating drift', () => {
    // $1,000 over 3 months at 0% interest
    const params = {
      principalAmount: 1000,
      downPayment: 0,
      totalInstallments: 3,
      interestRate: 0,
    };

    const frontendResult = frontendCalculate(params);
    const backendResult = backendCalculate(params);

    expect(frontendResult).toEqual(backendResult);
    expect(frontendResult.financedAmount).toBe(1000);
    expect(frontendResult.scheduledTotal).toBe(1000);
    expect(frontendResult.baseInstallmentAmount).toBe(333.33);
    expect(frontendResult.roundingDifference).toBe(0.01);

    // Month 1: 333.33, Month 2: 333.33, Month 3: 333.34 = 1000.00
    const finalMonthAmount =
      frontendResult.baseInstallmentAmount + frontendResult.roundingDifference;
    expect(finalMonthAmount).toBe(333.34);
    expect(333.33 + 333.33 + 333.34).toBe(1000);
  });

  it('handles fractional currency input precision correctly', () => {
    const params = {
      principalAmount: 999.99,
      downPayment: 199.99,
      totalInstallments: 6,
      interestRate: 12.5,
    };

    const frontendResult = frontendCalculate(params);
    const backendResult = backendCalculate(params);

    expect(frontendResult).toEqual(backendResult);
    expect(frontendResult.financedAmount).toBe(800.0);
    // 800 * 0.125 * (6/12) = 50.00
    expect(frontendResult.totalInterest).toBe(50.0);
    expect(frontendResult.scheduledTotal).toBe(850.0);
    expect(frontendResult.baseInstallmentAmount).toBe(141.66);
    // 141.66 * 6 = 849.96 -> remainder 0.04
    expect(frontendResult.roundingDifference).toBe(0.04);
  });

  it('throws an error when down payment is greater than or equal to principal amount', () => {
    expect(() =>
      frontendCalculate({
        principalAmount: 1000,
        downPayment: 1000,
        totalInstallments: 12,
        interestRate: 5,
      }),
    ).toThrow('Down payment cannot be greater than or equal to the principal amount.');

    expect(() =>
      frontendCalculate({
        principalAmount: 500,
        downPayment: 600,
        totalInstallments: 6,
      }),
    ).toThrow('Down payment cannot be greater than or equal to the principal amount.');
  });
});

describe('Installments Frontend — Authoritative Summary Metrics & Filtering Logic', () => {
  const samplePlans: InstallmentPlan[] = [
    {
      _id: 'plan-1',
      userId: 'user-1',
      name: 'Tesla Model Y Loan',
      planType: 'car_loan',
      category: 'finance',
      principalAmount: 45000,
      downPayment: 5000,
      financedAmount: 40000,
      totalInstallments: 48,
      interestRate: 5.0,
      totalInterest: 8000,
      scheduledTotal: 48000,
      installmentAmount: 1000.0,
      startDate: '2026-01-01T00:00:00.000Z',
      recurringDay: 1,
      totalPaid: 12000,
      remainingBalance: 36000,
      status: 'active',
      createdAt: '2026-01-01T10:00:00.000Z',
      updatedAt: '2026-01-01T10:00:00.000Z',
    },
    {
      _id: 'plan-2',
      userId: 'user-1',
      name: 'MacBook Pro EMI',
      planType: 'credit_card_emi',
      category: 'software',
      principalAmount: 2400,
      downPayment: 0,
      financedAmount: 2400,
      totalInstallments: 12,
      interestRate: 0,
      totalInterest: 0,
      scheduledTotal: 2400,
      installmentAmount: 200.0,
      startDate: '2026-02-15T00:00:00.000Z',
      recurringDay: 15,
      totalPaid: 2400,
      remainingBalance: 0,
      status: 'completed',
      createdAt: '2026-02-15T10:00:00.000Z',
      updatedAt: '2026-02-15T10:00:00.000Z',
    },
    {
      _id: 'plan-3',
      userId: 'user-1',
      name: 'Home Renovation Loan',
      planType: 'personal_loan',
      category: 'housing',
      principalAmount: 10000,
      downPayment: 1000,
      financedAmount: 9000,
      totalInstallments: 18,
      interestRate: 8.0,
      totalInterest: 1080,
      scheduledTotal: 10080,
      installmentAmount: 560.0,
      startDate: '2026-03-01T00:00:00.000Z',
      recurringDay: 1,
      totalPaid: 1680,
      remainingBalance: 8400,
      status: 'active',
      createdAt: '2026-03-01T10:00:00.000Z',
      updatedAt: '2026-03-01T10:00:00.000Z',
    },
    {
      _id: 'plan-4',
      userId: 'user-1',
      name: 'Cancelled Appliance EMI',
      planType: 'other',
      category: 'utilities',
      principalAmount: 1500,
      downPayment: 0,
      financedAmount: 1500,
      totalInstallments: 6,
      interestRate: 0,
      totalInterest: 0,
      scheduledTotal: 1500,
      installmentAmount: 250.0,
      startDate: '2025-10-01T00:00:00.000Z',
      recurringDay: 1,
      totalPaid: 500,
      remainingBalance: 1000, // Stored historically, but plan is cancelled and unpaid bills deleted
      status: 'cancelled',
      createdAt: '2025-10-01T10:00:00.000Z',
      updatedAt: '2025-10-01T10:00:00.000Z',
    },
  ];

  it('calculates summary metrics accurately without double-counting', () => {
    const activePlans = samplePlans.filter((p) => p.status === 'active');
    const completedPlans = samplePlans.filter((p) => p.status === 'completed');
    const cancelledPlans = samplePlans.filter((p) => p.status === 'cancelled');

    expect(activePlans).toHaveLength(2);
    expect(completedPlans).toHaveLength(1);
    expect(cancelledPlans).toHaveLength(1);

    // Remaining balance is only owed on active plans:
    // Plan 1: 36,000 + Plan 3: 8,400 = 44,400
    const totalRemainingBalance = activePlans.reduce(
      (sum, p) => sum + p.remainingBalance,
      0,
    );
    expect(totalRemainingBalance).toBe(44400);

    // Monthly commitment is sum of active plan installments:
    // Plan 1: 1,000 + Plan 3: 560 = 1,560 / mo
    const monthlyCommitment = activePlans.reduce(
      (sum, p) => sum + p.installmentAmount,
      0,
    );
    expect(monthlyCommitment).toBe(1560);

    // Total paid is historical total across all plans:
    // 12000 (Tesla) + 2400 (MacBook) + 1680 (Reno) + 500 (Appliance) = 16580
    const totalPaid = samplePlans.reduce((sum, p) => sum + p.totalPaid, 0);
    expect(totalPaid).toBe(16580);

    // Financed debt across active plans:
    // 40000 + 9000 = 49000
    const totalFinancedDebt = activePlans.reduce(
      (sum, p) => sum + p.financedAmount,
      0,
    );
    expect(totalFinancedDebt).toBe(49000);
  });

  it('filters plans by status (active vs completed vs cancelled)', () => {
    const active = samplePlans.filter((p) => p.status === 'active');
    expect(active.map((p) => p.name)).toEqual([
      'Tesla Model Y Loan',
      'Home Renovation Loan',
    ]);

    const completed = samplePlans.filter((p) => p.status === 'completed');
    expect(completed.map((p) => p.name)).toEqual(['MacBook Pro EMI']);

    const cancelled = samplePlans.filter((p) => p.status === 'cancelled');
    expect(cancelled.map((p) => p.name)).toEqual(['Cancelled Appliance EMI']);
  });

  it('filters plans by category', () => {
    const housing = samplePlans.filter((p) => p.category === 'housing');
    expect(housing).toHaveLength(1);
    expect(housing[0].name).toBe('Home Renovation Loan');

    const software = samplePlans.filter((p) => p.category === 'software');
    expect(software).toHaveLength(1);
    expect(software[0].name).toBe('MacBook Pro EMI');
  });

  it('filters plans by search query across name, type, and category', () => {
    // Search by name
    const tesla = samplePlans.filter((p) =>
      p.name.toLowerCase().includes('tesla'),
    );
    expect(tesla).toHaveLength(1);
    expect(tesla[0]._id).toBe('plan-1');

    // Search by type
    const carLoans = samplePlans.filter((p) =>
      p.planType.toLowerCase().includes('car_loan'),
    );
    expect(carLoans).toHaveLength(1);
    expect(carLoans[0]._id).toBe('plan-1');
  });

  it('sorts plans correctly by remaining balance and monthly payment', () => {
    // Sort by remaining balance descending
    const sortedByBalanceDesc = [...samplePlans].sort(
      (a, b) => b.remainingBalance - a.remainingBalance,
    );
    expect(sortedByBalanceDesc[0].name).toBe('Tesla Model Y Loan'); // 36000
    expect(sortedByBalanceDesc[sortedByBalanceDesc.length - 1].name).toBe(
      'MacBook Pro EMI',
    ); // 0

    // Sort by installment amount ascending
    const sortedByAmountAsc = [...samplePlans].sort(
      (a, b) => a.installmentAmount - b.installmentAmount,
    );
    expect(sortedByAmountAsc[0].name).toBe('MacBook Pro EMI'); // 200
    expect(sortedByAmountAsc[sortedByAmountAsc.length - 1].name).toBe(
      'Tesla Model Y Loan',
    ); // 1000
  });

  it('returns zeroes when user has no installment plans', () => {
    const emptyPlans: InstallmentPlan[] = [];
    const active = emptyPlans.filter((p) => p.status === 'active');
    expect(active).toHaveLength(0);
    expect(active.reduce((s, p) => s + p.remainingBalance, 0)).toBe(0);
    expect(active.reduce((s, p) => s + p.installmentAmount, 0)).toBe(0);
    expect(emptyPlans.reduce((s, p) => s + p.totalPaid, 0)).toBe(0);
  });
});
