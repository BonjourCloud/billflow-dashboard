import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

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

interface RawPricingTierRow {
  id: string;
  slug: string;
  name: string;
  price_monthly: number | string;
  price_yearly: number | string;
  billing_period: string;
  cta_label: string;
  is_highlighted: boolean;
  is_visible: boolean;
  sort_order: number;
  features?: unknown;
  updated_at: string;
}

export function usePricingTiers(opts?: { includeHidden?: boolean }) {
  const [tiers, setTiers] = useState<PricingTier[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase.from('pricing_tiers').select('*').order('sort_order', { ascending: true });
    if (!opts?.includeHidden) q = q.eq('is_visible', true);
    const { data, error } = await q;
    if (!error && data) {
      setTiers(
        (data as unknown as RawPricingTierRow[]).map((t) => ({
          ...t,
          features: Array.isArray(t.features) ? (t.features as string[]) : [],
          price_monthly: Number(t.price_monthly),
          price_yearly: Number(t.price_yearly),
        }))
      );
    }
    setLoading(false);
  }, [opts?.includeHidden]);

  useEffect(() => { load(); }, [load]);

  return { tiers, loading, refresh: load };
}
