import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bill } from '@/data/bills';
import type { Subscription } from '@/data/subscriptions';
import { apiRequest } from '@/lib/api';
import { MonthKey, projectRecurringBills, scopeBillsToMonth } from '@/lib/billMonth';

/**
 * The bills that make up a month (real ones, unpaid carry-over for the current
 * month, and expected recurring bills for later months). Shares the cache with
 * the dashboard and Subscriptions page, so it adds no extra requests.
 */
export function useMonthBills(selected: MonthKey) {
  const bills = useQuery<Bill[]>({
    queryKey: ['bills'],
    queryFn: () => apiRequest<Bill[]>('/api/bills'),
  });
  const series = useQuery<Subscription[]>({
    queryKey: ['subscriptions'],
    queryFn: () => apiRequest<Subscription[]>('/api/subscriptions'),
  });

  const scoped = useMemo(() => {
    const all = bills.data ?? [];
    const scope = scopeBillsToMonth(all, selected);
    const projected = projectRecurringBills(series.data ?? [], all, selected);
    return {
      bills: [...scope.bills, ...projected],
      carriedOverCount: scope.carriedOverCount,
      projectedCount: projected.length,
    };
  }, [bills.data, series.data, selected]);

  return { ...scoped, isLoading: bills.isLoading };
}
