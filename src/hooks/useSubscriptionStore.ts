import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Subscription, SubscriptionFilterStatus } from '@/data/subscriptions';
import { BillCategory } from '@/data/bills';
import { apiRequest } from '@/lib/api';
import { toast } from 'sonner';

export function useSubscriptionStore() {
  const queryClient = useQueryClient();

  const {
    data: subscriptionsData,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<Subscription[]>({
    queryKey: ['subscriptions'],
    queryFn: () => apiRequest<Subscription[]>('/api/subscriptions'),
  });

  const subscriptions = useMemo(
    () => subscriptionsData ?? [],
    [subscriptionsData],
  );

  const [filterStatus, setFilterStatus] =
    useState<SubscriptionFilterStatus>('all');
  const [filterCategory, setFilterCategory] = useState<BillCategory | 'all'>(
    'all',
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'amount' | 'recurringDay'>(
    'name',
  );
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const addMutation = useMutation({
    mutationFn: (newSubscription: {
      name: string;
      amount: number;
      category: BillCategory;
      startDate: string;
      recurringDay?: number;
    }) =>
      apiRequest<Subscription>('/api/subscriptions', {
        method: 'POST',
        body: JSON.stringify(newSubscription),
      }),
    onSuccess: () => {
      toast.success('Subscription added successfully');
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
      queryClient.invalidateQueries({ queryKey: ['bills'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to add subscription');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      updates,
    }: {
      id: string;
      updates: {
        name?: string;
        amount?: number;
        category?: BillCategory;
        recurringDay?: number;
      };
    }) =>
      apiRequest<Subscription>(`/api/subscriptions/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      }),
    onSuccess: () => {
      toast.success('Subscription updated successfully');
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
      queryClient.invalidateQueries({ queryKey: ['bills'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to update subscription');
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest<Subscription>(`/api/subscriptions/${id}/cancel`, {
        method: 'PATCH',
      }),
    onSuccess: () => {
      toast.success('Subscription cancelled. Future renewals stopped.');
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
      queryClient.invalidateQueries({ queryKey: ['bills'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to cancel subscription');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: ({
      id,
      scope = 'future',
    }: {
      id: string;
      scope?: 'future' | 'all';
    }) =>
      apiRequest<void>(`/api/subscriptions/${id}?scope=${scope}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      toast.success('Subscription deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
      queryClient.invalidateQueries({ queryKey: ['bills'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to delete subscription');
    },
  });

  const filteredSubscriptions = useMemo(() => {
    let result = [...subscriptions];

    if (filterStatus === 'active') {
      result = result.filter((s) => s.isActive);
    } else if (filterStatus === 'inactive') {
      result = result.filter((s) => !s.isActive);
    }

    if (filterCategory !== 'all') {
      result = result.filter((s) => s.category === filterCategory);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((s) => s.name.toLowerCase().includes(q));
    }

    result.sort((a, b) => {
      const mul = sortOrder === 'asc' ? 1 : -1;
      if (sortBy === 'name') {
        return mul * a.name.localeCompare(b.name);
      }
      if (sortBy === 'amount') {
        return mul * (a.amount - b.amount);
      }
      return mul * (a.recurringDay - b.recurringDay);
    });

    return result;
  }, [
    subscriptions,
    filterStatus,
    filterCategory,
    searchQuery,
    sortBy,
    sortOrder,
  ]);

  const stats = useMemo(() => {
    const activeList = subscriptions.filter((s) => s.isActive);
    const activeCount = activeList.length;
    const endedCount = subscriptions.length - activeCount;
    const monthlyRunRate = activeList.reduce((sum, s) => sum + s.amount, 0);
    const annualRunRate = monthlyRunRate * 12;

    return {
      activeCount,
      endedCount,
      totalCount: subscriptions.length,
      monthlyRunRate,
      annualRunRate,
    };
  }, [subscriptions]);

  const addSubscription = useCallback(
    (data: {
      name: string;
      amount: number;
      category: BillCategory;
      startDate: string;
      recurringDay?: number;
    }) => {
      addMutation.mutate(data);
    },
    [addMutation],
  );

  const updateSubscription = useCallback(
    (
      id: string,
      updates: {
        name?: string;
        amount?: number;
        category?: BillCategory;
        recurringDay?: number;
      },
    ) => {
      updateMutation.mutate({ id, updates });
    },
    [updateMutation],
  );

  const cancelSubscription = useCallback(
    (id: string) => {
      cancelMutation.mutate(id);
    },
    [cancelMutation],
  );

  const deleteSubscription = useCallback(
    (id: string, scope?: 'future' | 'all') => {
      deleteMutation.mutate({ id, scope });
    },
    [deleteMutation],
  );

  return {
    subscriptions: filteredSubscriptions,
    allSubscriptions: subscriptions,
    stats,
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
    addSubscription,
    updateSubscription,
    cancelSubscription,
    deleteSubscription,
    isLoading,
    isError,
    error,
    refetch,
    isAdding: addMutation.isPending,
    isUpdating: updateMutation.isPending,
    isCancelling: cancelMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
