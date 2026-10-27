import { describe, it, expect } from 'vitest';
import type { Goal } from '@/data/goals';
import { computeCashFlow, incomeOccurrencesForMonth } from '@/lib/cashFlow';
import {
  goalMonths,
  goalProgress,
  goalReserveForMonth,
  remainingAmount,
  suggestedMonthly,
  totalGoalReserve,
} from '@/lib/goals';
import {
  MAX_CONTRIBUTIONS,
  createContributionSchema,
  createGoalSchema,
  defaultMonthlyAmount,
  goalMonths as serverGoalMonths,
  startOfMonthUtc,
  updateGoalSchema,
} from '../../server/src/models/Goal';

const OCT = { year: 2026, month: 9 };
const NOV = { year: 2026, month: 10 };
const JAN_27 = { year: 2027, month: 0 };

function goal(overrides: Partial<Goal> = {}): Goal {
  return {
    _id: 'g1',
    name: 'School fee fund',
    targetAmount: 135000,
    startDate: '2026-10-01T00:00:00.000Z',
    targetDate: '2027-01-05T00:00:00.000Z',
    monthlyAmount: 33750,
    isActive: true,
    savedAmount: 0,
    contributions: [],
    ...overrides,
  };
}

describe('goal planning', () => {
  it('counts months from the start month to the target month, both included', () => {
    expect(goalMonths('2026-10-01T00:00:00.000Z', '2027-01-05T00:00:00.000Z')).toBe(4);
    expect(goalMonths('2026-10-01T00:00:00.000Z', '2026-10-31T00:00:00.000Z')).toBe(1);
    // A target before the start month still plans one month.
    expect(goalMonths('2026-10-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z')).toBe(1);
  });

  it('works out ₹33,750 a month for a ₹1,35,000 school-fee fund over four months', () => {
    expect(suggestedMonthly(135000, '2026-10-01T00:00:00.000Z', '2027-01-05T00:00:00.000Z')).toBe(33750);
  });

  it('rounds the monthly amount up so the plan never falls short', () => {
    expect(suggestedMonthly(100000, '2026-10-01T00:00:00.000Z', '2027-01-05T00:00:00.000Z')).toBe(25000);
    expect(suggestedMonthly(100001, '2026-10-01T00:00:00.000Z', '2027-01-05T00:00:00.000Z')).toBe(25001);
  });

  it('gives the browser and the server the same answer', () => {
    const start = new Date('2026-10-01T00:00:00.000Z');
    for (const target of ['2026-10-20', '2027-01-05', '2028-02-29', '2026-12-31']) {
      expect(serverGoalMonths(start, new Date(target))).toBe(
        goalMonths(start.toISOString(), new Date(target).toISOString()),
      );
      expect(defaultMonthlyAmount(87654, start, new Date(target))).toBe(
        suggestedMonthly(87654, start.toISOString(), new Date(target).toISOString()),
      );
    }
  });

  it('starts planning in the first day of the month, in UTC', () => {
    expect(startOfMonthUtc(new Date('2026-10-27T23:30:00.000Z')).toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });
});

describe('goal reserve in a month', () => {
  it('reserves the monthly amount from the start month to the target month', () => {
    const g = goal();
    expect(goalReserveForMonth(g, { year: 2026, month: 8 })).toBe(0); // before the start
    expect(goalReserveForMonth(g, OCT)).toBe(33750);
    expect(goalReserveForMonth(g, NOV)).toBe(33750);
    expect(goalReserveForMonth(g, JAN_27)).toBe(33750);
    expect(goalReserveForMonth(g, { year: 2027, month: 1 })).toBe(0); // after the target
  });

  it('never reserves more than is still missing', () => {
    expect(goalReserveForMonth(goal({ savedAmount: 120000 }), OCT)).toBe(15000);
  });

  it('reserves nothing for a funded or switched-off goal', () => {
    expect(goalReserveForMonth(goal({ savedAmount: 135000 }), OCT)).toBe(0);
    expect(goalReserveForMonth(goal({ savedAmount: 200000 }), OCT)).toBe(0);
    expect(goalReserveForMonth(goal({ isActive: false }), OCT)).toBe(0);
  });

  it('adds goals together', () => {
    const second = goal({ _id: 'g2', targetAmount: 24000, monthlyAmount: 4000, targetDate: '2027-03-20T00:00:00.000Z' });
    expect(totalGoalReserve([goal(), second], OCT)).toBe(37750);
    expect(totalGoalReserve([], OCT)).toBe(0);
  });

  it('is taken out of free money on the cash-flow card', () => {
    const income = incomeOccurrencesForMonth(
      [
        {
          _id: 'i1', name: 'Salary', amount: 100000, frequency: 'monthly', recurringDay: 1,
          startDate: '2026-01-01T00:00:00.000Z', endDate: null, isActive: true, countInPlan: true, receivedCycles: [],
        },
      ],
      OCT,
    );
    const without = computeCashFlow(income, [], []);
    const withGoal = computeCashFlow(income, [], [], 33750);
    expect(without.free).toBe(100000);
    expect(without.goals).toBe(0);
    expect(withGoal.goals).toBe(33750);
    expect(withGoal.free).toBe(66250);
    // Goals do not count as bills or as the savings category.
    expect(withGoal.bills).toBe(0);
    expect(withGoal.saved).toBe(0);
  });
});

describe('goal progress', () => {
  it('is on track at the start: nothing is expected until a month has passed', () => {
    const p = goalProgress(goal(), OCT);
    expect(p.state).toBe('on_track');
    expect(p.expectedByNow).toBe(0);
    expect(p.monthsLeft).toBe(4);
    expect(p.remaining).toBe(135000);
  });

  it('falls behind once a full month has passed without the set-aside', () => {
    const p = goalProgress(goal({ savedAmount: 10000 }), NOV);
    expect(p.state).toBe('behind');
    expect(p.expectedByNow).toBe(33750);
    expect(p.behindBy).toBe(23750);
    expect(p.monthsLeft).toBe(3);
  });

  it('is on track when saved is at or above the plan', () => {
    expect(goalProgress(goal({ savedAmount: 33750 }), NOV).state).toBe('on_track');
    expect(goalProgress(goal({ savedAmount: 90000 }), NOV).behindBy).toBe(0);
  });

  it('reports funded, paused, overdue and upcoming goals', () => {
    expect(goalProgress(goal({ savedAmount: 135000 }), NOV).state).toBe('funded');
    expect(goalProgress(goal({ isActive: false }), NOV).state).toBe('paused');
    expect(goalProgress(goal(), { year: 2027, month: 1 }).state).toBe('overdue');
    expect(goalProgress(goal(), { year: 2026, month: 8 }).state).toBe('upcoming');
  });

  it('caps what the plan expected at the target and reports the fraction saved', () => {
    expect(goalProgress(goal({ savedAmount: 0 }), { year: 2028, month: 5 }).expectedByNow).toBe(135000);
    expect(goalProgress(goal({ savedAmount: 67500 }), NOV).fraction).toBe(0.5);
    expect(remainingAmount(goal({ savedAmount: 140000 }))).toBe(0);
  });
});

describe('goal request validation', () => {
  const valid = { name: 'Trip', targetAmount: 24000, targetDate: '2027-03-20' };

  it('accepts a goal with or without a monthly amount', () => {
    expect(createGoalSchema.safeParse(valid).success).toBe(true);
    expect(createGoalSchema.safeParse({ ...valid, monthlyAmount: 4000 }).success).toBe(true);
  });

  it('rejects bad amounts, dates, names and unknown fields', () => {
    expect(createGoalSchema.safeParse({ ...valid, targetAmount: 0 }).success).toBe(false);
    expect(createGoalSchema.safeParse({ ...valid, targetAmount: -5 }).success).toBe(false);
    expect(createGoalSchema.safeParse({ ...valid, targetDate: 'soon' }).success).toBe(false);
    expect(createGoalSchema.safeParse({ ...valid, name: '   ' }).success).toBe(false);
    expect(createGoalSchema.safeParse({ ...valid, name: 'x'.repeat(101) }).success).toBe(false);
    expect(createGoalSchema.safeParse({ ...valid, userId: 'user_other' }).success).toBe(false);
    expect(createGoalSchema.safeParse({ ...valid, targetAmount: 2_000_000_000 }).success).toBe(false);
  });

  it('requires at least one field to update and rejects unknown ones', () => {
    expect(updateGoalSchema.safeParse({}).success).toBe(false);
    expect(updateGoalSchema.safeParse({ isActive: false }).success).toBe(true);
    expect(updateGoalSchema.safeParse({ startDate: '2026-01-01' }).success).toBe(false);
  });

  it('validates contributions', () => {
    expect(createContributionSchema.safeParse({ amount: 5000 }).success).toBe(true);
    expect(createContributionSchema.safeParse({ amount: 5000, date: '2026-10-05', note: 'Oct' }).success).toBe(true);
    expect(createContributionSchema.safeParse({ amount: 0 }).success).toBe(false);
    expect(createContributionSchema.safeParse({ amount: 5, note: 'x'.repeat(101) }).success).toBe(false);
    expect(createContributionSchema.safeParse({ amount: 5, goalId: 'x' }).success).toBe(false);
    expect(MAX_CONTRIBUTIONS).toBe(500);
  });
});
