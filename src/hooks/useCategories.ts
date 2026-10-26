import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api';
import {
  Category,
  DEFAULT_CATEGORIES,
  FALLBACK_COLOR,
  prettifyCategorySlug,
} from '@/data/categories';

export const CATEGORIES_QUERY_KEY = ['categories'] as const;

/**
 * Categories from the API (cached), falling back to the built-in defaults
 * while loading or on error. `categories` includes inactive ones so old bills
 * still resolve a label; `activeCategories` is what dropdowns should offer.
 */
export function useCategories() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: CATEGORIES_QUERY_KEY,
    queryFn: () => apiRequest<Category[]>('/api/categories'),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const categories = data && data.length > 0 ? data : DEFAULT_CATEGORIES;

  const activeCategories = useMemo(
    () => categories.filter((c) => c.is_active),
    [categories],
  );

  const getLabel = useCallback(
    (slug: string) =>
      categories.find((c) => c.slug === slug)?.label ?? prettifyCategorySlug(slug),
    [categories],
  );

  const getColor = useCallback(
    (slug: string) => categories.find((c) => c.slug === slug)?.color ?? FALLBACK_COLOR,
    [categories],
  );

  /** Dropdown options: active categories plus `current` (even if since deactivated or removed). */
  const optionsFor = useCallback(
    (current?: string): Pick<Category, 'slug' | 'label'>[] => {
      const options: Pick<Category, 'slug' | 'label'>[] = activeCategories.map(
        ({ slug, label }) => ({ slug, label }),
      );
      if (current && !options.some((o) => o.slug === current)) {
        options.push({ slug: current, label: getLabel(current) });
      }
      return options;
    },
    [activeCategories, getLabel],
  );

  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: CATEGORIES_QUERY_KEY }),
    [queryClient],
  );

  return { categories, activeCategories, optionsFor, getLabel, getColor, loading: isLoading, refresh };
}
