import type { Goal } from '@/data/goals';
import type { MonthKey } from '@/lib/billMonth';

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Month number since year 0 for a stored (UTC) date. */
function utcMonthIndex(iso: string): number {
  const d = new Date(iso);
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
}

const keyIndex = (key: MonthKey) => key.year * 12 + key.month;

/** Calendar months from start to target, both included (at least 1). */
export function goalMonths(startDate: string, targetDate: string): number {
  return Math.max(1, utcMonthIndex(targetDate) - utcMonthIndex(startDate) + 1);
}

/** Monthly amount that reaches the target by the target month, rounded up to a whole rupee. */
export function suggestedMonthly(targetAmount: number, startDate: string, targetDate: string): number {
  return Math.ceil(targetAmount / goalMonths(startDate, targetDate));
}

export function remainingAmount(goal: Goal): number {
  return round2(Math.max(0, goal.targetAmount - goal.savedAmount));
}

export function isFunded(goal: Goal): boolean {
  return goal.savedAmount >= goal.targetAmount;
}

/**
 * Money a goal reserves in a month: its monthly amount from the start month to
 * the target month, never more than what is still missing. Inactive and funded
 * goals reserve nothing.
 */
export function goalReserveForMonth(goal: Goal, month: MonthKey): number {
  if (!goal.isActive || isFunded(goal)) return 0;
  const index = keyIndex(month);
  if (index < utcMonthIndex(goal.startDate) || index > utcMonthIndex(goal.targetDate)) return 0;
  return round2(Math.min(goal.monthlyAmount, remainingAmount(goal)));
}

export function totalGoalReserve(goals: Goal[], month: MonthKey): number {
  return round2(goals.reduce((sum, g) => sum + goalReserveForMonth(g, month), 0));
}

export type GoalState = 'funded' | 'paused' | 'overdue' | 'behind' | 'on_track' | 'upcoming';

export interface GoalProgress {
  state: GoalState;
  /** saved / target, 0 to 1. */
  fraction: number;
  remaining: number;
  /** Whole months left including the current one, 0 once the target month has passed. */
  monthsLeft: number;
  /** Amount the plan expected to be saved by now (months already completed × monthly), at most the target. */
  expectedByNow: number;
  /** Positive when saved is below the plan; 0 when on track or ahead. */
  behindBy: number;
}

/**
 * Where a goal stands. The plan is counted in completed months, so in the
 * month a goal starts nothing is expected yet and a goal is only "behind"
 * once a full month has passed without the planned amount.
 */
export function goalProgress(goal: Goal, now: MonthKey): GoalProgress {
  const remaining = remainingAmount(goal);
  const fraction = goal.targetAmount > 0 ? Math.min(1, goal.savedAmount / goal.targetAmount) : 0;
  const nowIndex = keyIndex(now);
  const startIndex = utcMonthIndex(goal.startDate);
  const targetIndex = utcMonthIndex(goal.targetDate);

  const completedMonths = Math.max(0, nowIndex - startIndex);
  const expectedByNow = round2(Math.min(goal.targetAmount, goal.monthlyAmount * completedMonths));
  const behindBy = round2(Math.max(0, expectedByNow - goal.savedAmount));
  const monthsLeft = Math.max(0, targetIndex - Math.max(nowIndex, startIndex) + 1);

  let state: GoalState;
  if (isFunded(goal)) state = 'funded';
  else if (!goal.isActive) state = 'paused';
  else if (nowIndex > targetIndex) state = 'overdue';
  else if (nowIndex < startIndex) state = 'upcoming';
  else if (behindBy > 0) state = 'behind';
  else state = 'on_track';

  return { state, fraction, remaining, monthsLeft, expectedByNow, behindBy };
}
