import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bill, BillStatus, BillCategory } from '@/data/bills';
import { PaymentRecord } from '@/data/billDetails';
import type { Subscription } from '@/data/subscriptions';
import { apiRequest } from '@/lib/api';
import { toast } from 'sonner';
import {
  MonthKey,
  currentMonthKey,
  formatMonthLabel,
  isSameMonth,
  projectRecurringBills,
  scopeBillsToMonth,
  scopePaymentsToBills,
  shiftMonth,
} from '@/lib/billMonth';

export interface BillStoreStats {
  totalAmount: number;
  paidAmount: number;
  pendingAmount: number;
  overdueAmount: number;
  paidCount: number;
  pendingCount: number;
  overdueCount: number;
  paidPercent: number;
}

/**
 * Computes authoritative aggregate bill stats from active bills and payment records.
 *
 * Rules:
 * 1. Only payment records with status === 'completed' contribute to paid totals.
 *    Failed and refunded payment records are strictly excluded.
 * 2. If a bill has ANY payment records in the database, its paid total is governed
 *    solely by its completed payments. Its bill.amount is NEVER added as a legacy fallback,
 *    even if the bill has status === 'paid'. This prevents double-counting and prevents
 *    failed/refunded payments from erroneously triggering a legacy fallback.
 * 3. A legacy fallback (adding bill.amount) applies ONLY to bills marked 'paid' that have
 *    zero payment records whatsoever.
 */
export function calculateBillStats(
  bills: Bill[],
  payments: PaymentRecord[],
): BillStoreStats {
  const totalAmount = bills.reduce(
    (s, b) => s + (typeof b.amount === 'number' ? b.amount : 0),
    0,
  );

  // Set of all bill IDs that have payment records in the system
  const billsWithPaymentRecords = new Set(
    payments.map((p) => (p.billId ? String(p.billId) : '')).filter(Boolean),
  );

  // 1. Authoritative payment records: sum completed payments (failed/refunded strictly excluded)
  const completedPayments = payments.filter((p) => p.status === 'completed');
  const totalPaidFromPayments = completedPayments.reduce(
    (s, p) => s + (typeof p.amount === 'number' ? p.amount : 0),
    0,
  );

  // 2. Fallback only for pure legacy bills marked 'paid' that have NO payment records whatsoever
  const legacyPaid = bills
    .filter(
      (b) => b.status === 'paid' && !billsWithPaymentRecords.has(String(b._id)),
    )
    .reduce((s, b) => s + (typeof b.amount === 'number' ? b.amount : 0), 0);

  const paidAmount = Math.round((totalPaidFromPayments + legacyPaid) * 100) / 100;
  const pendingAmount = bills
    .filter((b) => b.status === 'pending')
    .reduce((s, b) => s + (typeof b.amount === 'number' ? b.amount : 0), 0);
  const overdueAmount = bills
    .filter((b) => b.status === 'overdue')
    .reduce((s, b) => s + (typeof b.amount === 'number' ? b.amount : 0), 0);
  const paidCount = bills.filter((b) => b.status === 'paid').length;
  const pendingCount = bills.filter((b) => b.status === 'pending').length;
  const overdueCount = bills.filter((b) => b.status === 'overdue').length;
  const paidPercent =
    totalAmount > 0 ? Math.min(100, (paidAmount / totalAmount) * 100) : 0;

  return {
    totalAmount,
    paidAmount,
    pendingAmount,
    overdueAmount,
    paidCount,
    pendingCount,
    overdueCount,
    paidPercent,
  };
}

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

  const { data: paymentsData } = useQuery<PaymentRecord[]>({
    queryKey: ['payments'],
    queryFn: () => apiRequest<PaymentRecord[]>('/api/payments'),
  });

  // Shares the cache with the Subscriptions page; used to project future months.
  const { data: seriesData } = useQuery<Subscription[]>({
    queryKey: ['subscriptions'],
    queryFn: () => apiRequest<Subscription[]>('/api/subscriptions'),
  });

  const bills = useMemo(() => billsData ?? [], [billsData]);
  const recurringSeries = useMemo(() => seriesData ?? [], [seriesData]);
  const payments = useMemo(() => paymentsData ?? [], [paymentsData]);

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
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['installments'] });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to add bill');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<Bill> & { updateScope?: 'this' | 'future' };
    }) =>
      apiRequest<Bill>(`/api/bills/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      }),
    onSuccess: () => {
      toast.success('Bill updated successfully');
      queryClient.invalidateQueries({ queryKey: ['bills'] });
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['installments'] });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to update bill');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: ({
      id,
      scope = 'this',
    }: {
      id: string;
      scope?: 'this' | 'future' | 'all';
    }) =>
      apiRequest<void>(`/api/bills/${id}?scope=${scope}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      toast.success('Bill deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['bills'] });
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['installments'] });
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

  // The hero card shows one month at a time (default: the current month).
  const [selectedMonth, setSelectedMonth] = useState<MonthKey>(() => currentMonthKey());

  const monthScope = useMemo(() => {
    const scope = scopeBillsToMonth(bills, selectedMonth);
    const projected = projectRecurringBills(recurringSeries, bills, selectedMonth);
    return {
      bills: [...scope.bills, ...projected],
      carriedOverCount: scope.carriedOverCount,
      projectedCount: projected.length,
    };
  }, [bills, recurringSeries, selectedMonth]);

  const stats = useMemo(
    () =>
      calculateBillStats(
        monthScope.bills,
        scopePaymentsToBills(payments, monthScope.bills),
      ),
    [monthScope, payments],
  );

  const month = useMemo(
    () => ({
      monthLabel: formatMonthLabel(selectedMonth),
      isCurrentMonth: isSameMonth(selectedMonth, currentMonthKey()),
      carriedOverCount: monthScope.carriedOverCount,
      projectedCount: monthScope.projectedCount,
      onPrevMonth: () => setSelectedMonth((m) => shiftMonth(m, -1)),
      onNextMonth: () => setSelectedMonth((m) => shiftMonth(m, 1)),
      onCurrentMonth: () => setSelectedMonth(currentMonthKey()),
    }),
    [selectedMonth, monthScope.carriedOverCount, monthScope.projectedCount],
  );

  // Upcoming follows the month selected on the hero card (includes expected recurring bills).
  const upcomingBills = useMemo(
    () =>
      monthScope.bills
        .filter((b) => b.status === 'pending')
        .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
        .slice(0, 3),
    [monthScope],
  );

  const addBill = useCallback((bill: Omit<Bill, '_id'>) => {
    addMutation.mutate(bill);
  }, [addMutation]);

  const updateBill = useCallback(
    (
      id: string,
      updates: Partial<Bill> & { updateScope?: 'this' | 'future' },
    ) => {
      updateMutation.mutate({ id, updates });
    },
    [updateMutation],
  );

  const deleteBill = useCallback(
    (id: string, scope?: 'this' | 'future' | 'all') => {
      deleteMutation.mutate({ id, scope });
    },
    [deleteMutation],
  );

  return {
    bills: filteredBills,
    allBills: bills,
    stats,
    month,
    selectedMonth,
    monthBills: monthScope.bills,
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
