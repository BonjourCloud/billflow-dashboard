import { useState, useMemo, useCallback } from 'react';
import { Bill, MOCK_BILLS, BillStatus, BillCategory } from '@/data/bills';

export function useBillStore() {
  const [bills, setBills] = useState<Bill[]>(MOCK_BILLS);
  const [filterStatus, setFilterStatus] = useState<BillStatus | 'all'>('all');
  const [filterCategory, setFilterCategory] = useState<BillCategory | 'all'>('all');
  const [sortBy, setSortBy] = useState<'dueDate' | 'amount'>('dueDate');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [searchQuery, setSearchQuery] = useState('');

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

  const addBill = useCallback((bill: Omit<Bill, 'id'>) => {
    setBills(prev => [...prev, { ...bill, id: crypto.randomUUID() }]);
  }, []);

  const updateBill = useCallback((id: string, updates: Partial<Bill>) => {
    setBills(prev => prev.map(b => b.id === id ? { ...b, ...updates } : b));
  }, []);

  const deleteBill = useCallback((id: string) => {
    setBills(prev => prev.filter(b => b.id !== id));
  }, []);

  return {
    bills: filteredBills, allBills: bills, stats, upcomingBills,
    filterStatus, setFilterStatus, filterCategory, setFilterCategory,
    sortBy, setSortBy, sortOrder, setSortOrder, searchQuery, setSearchQuery,
    addBill, updateBill, deleteBill,
  };
}
