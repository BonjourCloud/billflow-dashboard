import { Bill } from "../models/Bill.js";
import { InstallmentPlan } from "../models/InstallmentPlan.js";
import { RecurringSeries } from "../models/RecurringSeries.js";
import {
  CATEGORY_COLOR_PALETTE,
  Category,
  DEFAULT_CATEGORIES,
  slugifyCategoryLabel,
} from "../models/Category.js";

export interface CategoryDto {
  id: string;
  slug: string;
  label: string;
  color: string;
  sort_order: number;
  is_active: boolean;
}

interface CategoryLean {
  _id: { toString(): string };
  slug: string;
  label: string;
  color?: string;
  sort_order?: number;
  is_active?: boolean;
}

export function toCategoryDto(category: CategoryLean): CategoryDto {
  return {
    id: category._id.toString(),
    slug: category.slug,
    label: category.label,
    color: category.color ?? "#3c83f6",
    sort_order: category.sort_order ?? 0,
    is_active: category.is_active !== false,
  };
}

/**
 * All categories for dropdowns and labels, active and inactive (old bills may
 * still use an inactive one). An empty collection (fresh database before the
 * startup seed) falls back to the built-in defaults so validation and the UI
 * keep working.
 */
export async function listCategories(): Promise<CategoryDto[]> {
  const categories = await Category.find()
    .sort({ sort_order: 1, createdAt: 1 })
    .lean();

  if (categories.length === 0) {
    return DEFAULT_CATEGORIES.map((c) => ({
      id: `default-${c.slug}`,
      slug: c.slug,
      label: c.label,
      color: c.color,
      sort_order: c.sort_order,
      is_active: true,
    }));
  }

  return categories.map(toCategoryDto);
}

/**
 * Returns a user-facing message when `slug` may not be assigned, otherwise
 * null. `undefined` (field not sent) and an unchanged value (`current`) are
 * always fine, so editing an old bill never fails just because its category
 * has since been deactivated.
 */
export async function getCategoryProblem(
  slug: string | undefined,
  current?: string,
): Promise<string | null> {
  if (slug === undefined || slug === current) return null;

  const categories = await listCategories();
  const match = categories.find((c) => c.slug === slug);
  if (!match) return `Category '${slug}' does not exist.`;
  if (!match.is_active) return `Category '${match.label}' is no longer available.`;
  return null;
}

/** Category used when a request does not pick one (installment plans). */
export async function resolveDefaultCategorySlug(): Promise<string> {
  const categories = await listCategories();
  const active = categories.filter((c) => c.is_active);
  return active.find((c) => c.slug === "finance")?.slug ?? active[0]?.slug ?? "finance";
}

export async function isCategoryInUse(slug: string): Promise<boolean> {
  const [bill, series, plan] = await Promise.all([
    Bill.exists({ category: slug }),
    RecurringSeries.exists({ category: slug }),
    InstallmentPlan.exists({ category: slug }),
  ]);
  return Boolean(bill || series || plan);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** True when another category already uses this name (case-insensitive). */
export async function categoryLabelTaken(
  label: string,
  excludeId?: string,
): Promise<boolean> {
  const filter: Record<string, unknown> = {
    label: new RegExp(`^${escapeRegExp(label.trim())}$`, "i"),
  };
  if (excludeId) filter._id = { $ne: excludeId };
  return Boolean(await Category.exists(filter));
}

/** How many active categories exist besides `excludeId`. */
export async function countOtherActiveCategories(excludeId: string): Promise<number> {
  return Category.countDocuments({ is_active: true, _id: { $ne: excludeId } });
}

async function uniqueSlug(label: string): Promise<string> {
  const base = slugifyCategoryLabel(label);
  let candidate = base;
  for (let n = 2; n < 100; n++) {
    if (!(await Category.exists({ slug: candidate }))) return candidate;
    candidate = `${base}-${n}`;
  }
  // Practically unreachable; keeps the slug unique even then.
  return `${base}-${Date.now().toString(36)}`;
}

export async function createCategory(
  label: string,
  color?: string,
): Promise<CategoryDto> {
  const slug = await uniqueSlug(label);
  const last = await Category.findOne().sort({ sort_order: -1 }).lean();
  const count = await Category.countDocuments();

  const created = await Category.create({
    slug,
    label,
    color: color ?? CATEGORY_COLOR_PALETTE[count % CATEGORY_COLOR_PALETTE.length],
    sort_order: (last?.sort_order ?? 0) + 1,
    is_active: true,
  });

  return toCategoryDto(created.toObject());
}
