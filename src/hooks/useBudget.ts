import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiRequest } from '@/lib/api';
import {
  BudgetLimit,
  BudgetSettings,
  DEFAULT_BUDGET_SETTINGS,
  IncomeFrequency,
  IncomeSource,
} from '@/data/budget';

export const INCOME_KEY = ['income'] as const;
export const BUDGETS_KEY = ['budgets'] as const;
export const BUDGET_SETTINGS_KEY = ['budget-settings'] as const;

export interface IncomeInput {
  name: string;
  amount: number;
  frequency: IncomeFrequency;
  startDate: string;
  endDate?: string | null;
  countInPlan?: boolean;
}

const errorMessage = (err: unknown, fallback: string) =>
  err instanceof Error && err.message ? err.message : fallback;

export function useIncome() {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: INCOME_KEY });

  const { data, isLoading } = useQuery<IncomeSource[]>({
    queryKey: INCOME_KEY,
    queryFn: () => apiRequest<IncomeSource[]>('/api/income'),
  });

  const create = useMutation({
    mutationFn: (input: IncomeInput) =>
      apiRequest<IncomeSource>('/api/income', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => {
      toast.success('Income added');
      void refresh();
    },
    onError: (err) => toast.error(errorMessage(err, 'Failed to add income')),
  });

  const update = useMutation({
    mutationFn: ({ id, updates, quiet }: { id: string; updates: Partial<IncomeInput> & { isActive?: boolean }; quiet?: boolean }) =>
      apiRequest<IncomeSource>(`/api/income/${id}`, { method: 'PATCH', body: JSON.stringify(updates) }).then((r) => {
        if (!quiet) toast.success('Income updated');
        return r;
      }),
    onSuccess: () => void refresh(),
    onError: (err) => toast.error(errorMessage(err, 'Failed to update income')),
  });

  const markReceived = useMutation({
    mutationFn: ({ id, cycle, received }: { id: string; cycle: string; received: boolean }) =>
      apiRequest<IncomeSource>(`/api/income/${id}/received`, {
        method: 'PUT',
        body: JSON.stringify({ cycle, received }),
      }),
    onSuccess: () => void refresh(),
    onError: (err) => toast.error(errorMessage(err, 'Failed to update')),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiRequest<void>(`/api/income/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Income removed');
      void refresh();
    },
    onError: (err) => toast.error(errorMessage(err, 'Failed to remove income')),
  });

  return { sources: data ?? [], isLoading, create, update, markReceived, remove };
}

export function useBudgets() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery<BudgetLimit[]>({
    queryKey: BUDGETS_KEY,
    queryFn: () => apiRequest<BudgetLimit[]>('/api/budgets'),
  });

  const save = useMutation<unknown, Error, { category: string; limit: number | null }>({
    mutationFn: ({ category, limit }) =>
      limit === null
        ? apiRequest<void>(`/api/budgets/${category}`, { method: 'DELETE' })
        : apiRequest<BudgetLimit>(`/api/budgets/${category}`, {
            method: 'PUT',
            body: JSON.stringify({ limit }),
          }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: BUDGETS_KEY }),
    onError: (err) => toast.error(errorMessage(err, 'Failed to save budget')),
  });

  const setLimit = useCallback(
    (category: string, limit: number | null) => save.mutate({ category, limit }),
    [save],
  );

  return { limits: data ?? [], isLoading, setLimit };
}

export function useBudgetSettings() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery<BudgetSettings>({
    queryKey: BUDGET_SETTINGS_KEY,
    queryFn: () => apiRequest<BudgetSettings>('/api/budget-settings'),
  });

  const save = useMutation({
    mutationFn: (settings: BudgetSettings) =>
      apiRequest<BudgetSettings>('/api/budget-settings', {
        method: 'PUT',
        body: JSON.stringify(settings),
      }),
    onSuccess: () => {
      toast.success('Budget settings saved');
      void queryClient.invalidateQueries({ queryKey: BUDGET_SETTINGS_KEY });
    },
    onError: (err) => toast.error(errorMessage(err, 'Failed to save settings')),
  });

  return { settings: data ?? DEFAULT_BUDGET_SETTINGS, isLoading, save };
}
