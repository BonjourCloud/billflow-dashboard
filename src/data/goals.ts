export interface GoalContribution {
  _id: string;
  amount: number;
  /** ISO date. */
  date: string;
  note: string | null;
}

export interface Goal {
  _id: string;
  name: string;
  targetAmount: number;
  /** ISO date; only the month matters for planning. */
  targetDate: string;
  /** First day (UTC) of the month the plan starts in. */
  startDate: string;
  /** Planned monthly set-aside. */
  monthlyAmount: number;
  isActive: boolean;
  /** Sum of contributions, worked out by the server. */
  savedAmount: number;
  contributions: GoalContribution[];
}
