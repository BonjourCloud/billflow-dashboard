import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiRequest } from '@/lib/api';
import type { Goal } from '@/data/goals';

export const GOALS_KEY = ['goals'] as const;

export interface GoalInput {
  name: string;
  targetAmount: number;
  /** ISO date; only the month matters. */
  targetDate: string;
  monthlyAmount?: number;
}

export interface GoalUpdate {
  name?: string;
  targetAmount?: number;
  targetDate?: string;
  monthlyAmount?: number;
  isActive?: boolean;
}

export interface ContributionInput {
  amount: number;
  date?: string;
  note?: string;
}

const errorMessage = (err: unknown, fallback: string) =>
  err instanceof Error && err.message ? err.message : fallback;

export function useGoals() {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: GOALS_KEY });

  const { data, isLoading } = useQuery<Goal[]>({
    queryKey: GOALS_KEY,
    queryFn: () => apiRequest<Goal[]>('/api/goals'),
  });

  const create = useMutation({
    mutationFn: (input: GoalInput) =>
      apiRequest<Goal>('/api/goals', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => {
      toast.success('Goal added');
      void refresh();
    },
    onError: (err) => toast.error(errorMessage(err, 'Failed to add goal')),
  });

  const update = useMutation({
    mutationFn: ({ id, updates, quiet }: { id: string; updates: GoalUpdate; quiet?: boolean }) =>
      apiRequest<Goal>(`/api/goals/${id}`, { method: 'PATCH', body: JSON.stringify(updates) }).then((r) => {
        if (!quiet) toast.success('Goal updated');
        return r;
      }),
    onSuccess: () => void refresh(),
    onError: (err) => toast.error(errorMessage(err, 'Failed to update goal')),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiRequest<void>(`/api/goals/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Goal removed');
      void refresh();
    },
    onError: (err) => toast.error(errorMessage(err, 'Failed to remove goal')),
  });

  const addContribution = useMutation({
    mutationFn: ({ id, input }: { id: string; input: ContributionInput }) =>
      apiRequest<Goal>(`/api/goals/${id}/contributions`, { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => {
      toast.success('Saved towards your goal');
      void refresh();
    },
    onError: (err) => toast.error(errorMessage(err, 'Failed to add money')),
  });

  const removeContribution = useMutation({
    mutationFn: ({ id, contributionId }: { id: string; contributionId: string }) =>
      apiRequest<Goal>(`/api/goals/${id}/contributions/${contributionId}`, { method: 'DELETE' }),
    onSuccess: () => void refresh(),
    onError: (err) => toast.error(errorMessage(err, 'Failed to remove entry')),
  });

  return { goals: data ?? [], isLoading, create, update, remove, addContribution, removeContribution };
}
