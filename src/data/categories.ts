/**
 * Bill categories are managed in the database (Admin → Categories). These
 * defaults mirror the server's built-in list and are only used while the real
 * list is loading, or if the request fails, so dropdowns are never empty.
 */
export interface Category {
  id: string;
  slug: string;
  label: string;
  color: string;
  sort_order: number;
  is_active: boolean;
}

export const FALLBACK_COLOR = '#3c83f6';

export const DEFAULT_CATEGORIES: Category[] = [
  { slug: 'utilities', label: 'Utilities', color: '#3c83f6' },
  { slug: 'entertainment', label: 'Entertainment', color: '#b055dd' },
  { slug: 'software', label: 'Software', color: '#21c45d' },
  { slug: 'finance', label: 'Finance', color: '#f59f0a' },
  { slug: 'insurance', label: 'Insurance', color: '#ef486f' },
  { slug: 'housing', label: 'Housing', color: '#26bbd9' },
  { slug: 'loans', label: 'Loans & EMI', color: '#f47825' },
  { slug: 'transport', label: 'Transport', color: '#2badee' },
  { slug: 'health', label: 'Health', color: '#28bd98' },
  { slug: 'education', label: 'Education', color: '#f9ce1f' },
  { slug: 'groceries', label: 'Groceries', color: '#68c639' },
].map((c, i) => ({ ...c, id: `default-${c.slug}`, sort_order: i + 1, is_active: true }));

/** "pet-care" -> "Pet care"; used when a bill's category is no longer in the list. */
export function prettifyCategorySlug(slug: string): string {
  if (!slug) return '';
  const text = slug.replace(/-/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}
