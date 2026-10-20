import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  InstallmentPlan,
  InstallmentPlanDetailResponse,
  CreateInstallmentPlanInput,
  UpdateInstallmentPlanInput,
  InstallmentFilterStatus,
} from '@/data/installments';
import { BillCategory } from '@/data/bills';
import { apiRequest } from '@/lib/api';
import { toast } from 'sonner';

export type InstallmentSortField =
  | 'createdAt'
  | 'name'
  | 'remainingBalance'
  | 'installmentAmount'
  | 'totalPaid';

export function useInstallmentStore() {
  const queryClient = useQueryClient();

  const {
    data: plansData,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<InstallmentPlan[]>({
    queryKey: ['installments'],
    queryFn: () => apiRequest<InstallmentPlan[]>('/api/installments'),
  });

  const plans = useMemo(() => plansData ?? [], [plansData]);

  const [filterStatus, setFilterStatus] =
    useState<InstallmentFilterStatus>('all');
  const [filterCategory, setFilterCategory] = useState<BillCategory | 'all'>(
    'all',
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<InstallmentSortField>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const createPlanMutation = useMutation({
    mutationFn: (newPlan: CreateInstallmentPlanInput) =>
      apiRequest<InstallmentPlanDetailResponse>('/api/installments', {
        method: 'POST',
        body: JSON.stringify(newPlan),
      }),
    onSuccess: (data) => {
      toast.success(
        `Installment plan "${data.plan.name}" created with ${data.installments.length} scheduled installments.`,
      );
      queryClient.invalidateQueries({ queryKey: ['installments'] });
      queryClient.invalidateQueries({ queryKey: ['bills'] });
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
    onError: (err: Error) => {
      const isDuplicate =
        err.message?.includes('Duplicate installment plan') ||
        err.message?.includes('409');
      if (isDuplicate) {
        toast.info(
          'This installment plan was already submitted. Refreshing list...',
        );
        queryClient.invalidateQueries({ queryKey: ['installments'] });
        queryClient.invalidateQueries({ queryKey: ['bills'] });
        queryClient.invalidateQueries({ queryKey: ['notifications'] });
      } else {
        toast.error(err.message || 'Failed to create installment plan.');
      }
    },
  });

  const updatePlanMutation = useMutation({
    mutationFn: ({
      id,
      updates,
    }: {
      id: string;
      updates: UpdateInstallmentPlanInput;
    }) =>
      apiRequest<InstallmentPlan>(`/api/installments/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      }),
    onSuccess: (updatedPlan) => {
      toast.success(`Plan "${updatedPlan.name}" updated successfully.`);
      queryClient.invalidateQueries({ queryKey: ['installments'] });
      queryClient.invalidateQueries({ queryKey: ['installments', updatedPlan._id] });
      queryClient.invalidateQueries({ queryKey: ['bills'] });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to update installment plan.');
    },
  });

  const cancelPlanMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest<{ message: string; plan: InstallmentPlan }>(
        `/api/installments/${id}/cancel`,
        {
          method: 'POST',
        },
      ),
    onSuccess: (res) => {
      toast.success(
        res.message || 'Installment plan cancelled. Unpaid installments removed.',
      );
      queryClient.invalidateQueries({ queryKey: ['installments'] });
      queryClient.invalidateQueries({ queryKey: ['installments', res.plan._id] });
      queryClient.invalidateQueries({ queryKey: ['bills'] });
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to cancel installment plan.');
    },
  });

  // Authoritative computed summaries derived from real API response
  const summaryMetrics = useMemo(() => {
    const activePlans = plans.filter((p) => p.status === 'active');
    const completedPlans = plans.filter((p) => p.status === 'completed');
    const cancelledPlans = plans.filter((p) => p.status === 'cancelled');

    // Remaining balance is only owed on active plans (unpaid future bills of cancelled plans are deleted, and completed are 0)
    const totalRemainingBalance = activePlans.reduce(
      (sum, p) => sum + (p.remainingBalance || 0),
      0,
    );

    // Total paid is historical cash paid across all plans
    const totalPaid = plans.reduce((sum, p) => sum + (p.totalPaid || 0), 0);

    // Monthly commitment is sum of monthly installment amounts across currently active plans
    const monthlyCommitment = activePlans.reduce(
      (sum, p) => sum + (p.installmentAmount || 0),
      0,
    );

    // Total financed amount across active plans
    const totalFinancedDebt = activePlans.reduce(
      (sum, p) => sum + (p.financedAmount || 0),
      0,
    );

    return {
      activeCount: activePlans.length,
      completedCount: completedPlans.length,
      cancelledCount: cancelledPlans.length,
      totalRemainingBalance,
      totalPaid,
      monthlyCommitment,
      totalFinancedDebt,
    };
  }, [plans]);

  // Filtered and sorted plan list
  const filteredPlans = useMemo(() => {
    return plans
      .filter((plan) => {
        if (filterStatus !== 'all' && plan.status !== filterStatus) {
          return false;
        }
        if (filterCategory !== 'all' && plan.category !== filterCategory) {
          return false;
        }
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchName = plan.name.toLowerCase().includes(q);
          const matchType = plan.planType.toLowerCase().includes(q);
          const matchCategory = plan.category.toLowerCase().includes(q);
          if (!matchName && !matchType && !matchCategory) {
            return false;
          }
        }
        return true;
      })
      .sort((a, b) => {
        let comparison = 0;
        if (sortBy === 'name') {
          comparison = a.name.localeCompare(b.name);
        } else if (sortBy === 'remainingBalance') {
          comparison = a.remainingBalance - b.remainingBalance;
        } else if (sortBy === 'installmentAmount') {
          comparison = a.installmentAmount - b.installmentAmount;
        } else if (sortBy === 'totalPaid') {
          comparison = a.totalPaid - b.totalPaid;
        } else {
          // 'createdAt'
          comparison =
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        }
        return sortOrder === 'asc' ? comparison : -comparison;
      });
  }, [plans, filterStatus, filterCategory, searchQuery, sortBy, sortOrder]);

  const resetFilters = useCallback(() => {
    setFilterStatus('all');
    setFilterCategory('all');
    setSearchQuery('');
    setSortBy('createdAt');
    setSortOrder('desc');
  }, []);

  return {
    allPlans: plans,
    filteredPlans,
    summaryMetrics,
    isLoading,
    isError,
    error,
    refetch,
    filterStatus,
    setFilterStatus,
    filterCategory,
    setFilterCategory,
    searchQuery,
    setSearchQuery,
    sortBy,
    setSortBy,
    sortOrder,
    setSortOrder,
    resetFilters,
    createPlan: createPlanMutation.mutateAsync,
    isCreating: createPlanMutation.isPending,
    createError: createPlanMutation.error,
    updatePlan: updatePlanMutation.mutateAsync,
    isUpdating: updatePlanMutation.isPending,
    cancelPlan: cancelPlanMutation.mutateAsync,
    isCancelling: cancelPlanMutation.isPending,
  };
}

export function useInstallmentPlan(id: string | undefined) {
  return useQuery<InstallmentPlanDetailResponse>({
    queryKey: ['installments', id],
    queryFn: () => {
      if (!id) throw new Error('Installment plan ID is required');
      return apiRequest<InstallmentPlanDetailResponse>(`/api/installments/${id}`);
    },
    enabled: Boolean(id),
  });
}
