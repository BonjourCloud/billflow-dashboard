import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bill, BillStatus, BillCategory } from '@/data/bills';
import { apiRequest } from '@/lib/api';
import { toast } from 'sonner';

export function useBillStore() {
  const queryClient = useQueryClient();

  const {
    data: billsData,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<Bill[]>({
    queryKey: ['bills'],
    queryFn: () => apiRequest<Bill[]>('/api/bills'),
  });

  const bills = useMemo(() => billsData ?? [], [billsData]);

  const [filterStatus, setFilterStatus] = useState<BillStatus | 'all'>('all');
  const [filterCategory, setFilterCategory] = useState<BillCategory | 'all'>('all');
  const [sortBy, setSortBy] = useState<'dueDate' | 'amount'>('dueDate');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [searchQuery, setSearchQuery] = useState('');

  const addMutation = useMutation({
    mutationFn: (newBill: Omit<Bill, '_id'>) =>
      apiRequest<Bill>('/api/bills', {
        method: 'POST',
        body: JSON.stringify(newBill),
      }),
    onSuccess: () => {
      toast.success('Bill added successfully');
      queryClient.invalidateQueries({ queryKey: ['bills'] });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to add bill');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Bill> }) =>
      apiRequest<Bill>(`/api/bills/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      }),
    onSuccess: () => {
      toast.success('Bill updated successfully');
      queryClient.invalidateQueries({ queryKey: ['bills'] });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to update bill');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest<void>(`/api/bills/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      toast.success('Bill deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['bills'] });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to delete bill');
    },
  });

  const filteredBills = useMemo(() => {
    let result = [...bills];
    if (filterStatus !== 'all') result = result.filter(b => b.status === filterStatus);
    if (filterCategory !== 'all') result = result.filter(b => b.category === filterCategory);
    if (searchQuery) result = result.filter(b => b.name.toLowerCase().includes(searchQuery.toLowerCase()));
    result.sort((a, b) => {
      const mul = sortOrder === 'asc' ? 1 : -1;
      if (sortBy === 'dueDate') return mul * (new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
      return mul * (a.amount - b.amount);
    });
    return result;
  }, [bills, filterStatus, filterCategory, sortBy, sortOrder, searchQuery]);

  const stats = useMemo(() => {
    const totalAmount = bills.reduce((s, b) => s + b.amount, 0);
    const paidAmount = bills.filter(b => b.status === 'paid').reduce((s, b) => s + b.amount, 0);
    const pendingAmount = bills.filter(b => b.status === 'pending').reduce((s, b) => s + b.amount, 0);
    const overdueAmount = bills.filter(b => b.status === 'overdue').reduce((s, b) => s + b.amount, 0);
    const paidCount = bills.filter(b => b.status === 'paid').length;
    const pendingCount = bills.filter(b => b.status === 'pending').length;
    const overdueCount = bills.filter(b => b.status === 'overdue').length;
    const paidPercent = totalAmount > 0 ? (paidAmount / totalAmount) * 100 : 0;
    return { totalAmount, paidAmount, pendingAmount, overdueAmount, paidCount, pendingCount, overdueCount, paidPercent };
  }, [bills]);

  const upcomingBills = useMemo(() =>
    bills.filter(b => b.status === 'pending').sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()).slice(0, 3),
    [bills]
  );

  const addBill = useCallback((bill: Omit<Bill, '_id'>) => {
    addMutation.mutate(bill);
  }, [addMutation]);

  const updateBill = useCallback((id: string, updates: Partial<Bill>) => {
    updateMutation.mutate({ id, updates });
  }, [updateMutation]);

  const deleteBill = useCallback((id: string) => {
    deleteMutation.mutate(id);
  }, [deleteMutation]);

  return {
    bills: filteredBills,
    allBills: bills,
    stats,
    upcomingBills,
    filterStatus,
    setFilterStatus,
    filterCategory,
    setFilterCategory,
    sortBy,
    setSortBy,
    sortOrder,
    setSortOrder,
    searchQuery,
    setSearchQuery,
    addBill,
    updateBill,
    deleteBill,
    isLoading,
    isError,
    error,
    refetch,
    isAdding: addMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
