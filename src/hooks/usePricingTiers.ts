import { useEffect, useState, useCallback } from 'react';
import { apiRequest } from '@/lib/api';

export interface PricingTier {
  id: string;
  slug: string;
  name: string;
  price_monthly: number;
  price_yearly: number;
  billing_period: string;
  cta_label: string;
  is_highlighted: boolean;
  is_visible: boolean;
  sort_order: number;
  features: string[];
  updated_at: string;
}

export function usePricingTiers(opts?: { includeHidden?: boolean }) {
  const [tiers, setTiers] = useState<PricingTier[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const url = opts?.includeHidden
        ? '/api/pricing-tiers?includeHidden=true'
        : '/api/pricing-tiers';
      const data = await apiRequest<PricingTier[]>(url, {
        authenticated: Boolean(opts?.includeHidden),
      });
      setTiers(data ?? []);
    } catch (error) {
      console.error('Failed to load pricing tiers:', error);
      setTiers([]);
    } finally {
      setLoading(false);
    }
  }, [opts?.includeHidden]);

  useEffect(() => {
    void load();
  }, [load]);

  return { tiers, loading, refresh: load };
}
