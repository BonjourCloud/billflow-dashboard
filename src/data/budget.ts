export type IncomeFrequency = 'monthly' | 'one_time';

export interface IncomeSource {
  _id: string;
  name: string;
  amount: number;
  frequency: IncomeFrequency;
  recurringDay: number;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
  countInPlan: boolean;
  receivedCycles: string[];
}

export interface BudgetLimit {
  category: string;
  limit: number;
}

export type BudgetMethod = 'limits' | '50-30-20';

export interface BudgetSettings {
  method: BudgetMethod;
  needsPct: number;
  wantsPct: number;
  savingsPct: number;
  emiRatioWarnPct: number;
}

export const DEFAULT_BUDGET_SETTINGS: BudgetSettings = {
  method: 'limits',
  needsPct: 50,
  wantsPct: 30,
  savingsPct: 20,
  emiRatioWarnPct: 40,
};
