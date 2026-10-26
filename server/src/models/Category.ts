import mongoose from "mongoose";
import { z } from "zod";

/**
 * Bill categories are stored in MongoDB so admins can add, rename, recolor and
 * deactivate them from the Admin → Categories page. Bills, subscriptions and
 * installment plans reference a category by its immutable `slug`.
 */

export const CATEGORY_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const CATEGORY_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
export const CATEGORY_LABEL_MAX = 30;

/**
 * Shape check only. Whether the category actually exists and is active is
 * checked against the database by `getCategoryProblem` in categoryService.
 */
export const categorySlugSchema = z
  .string()
  .trim()
  .min(1, "Category is required.")
  .max(40, "Invalid category.")
  .regex(CATEGORY_SLUG_PATTERN, "Invalid category.");

export interface DefaultCategory {
  slug: string;
  label: string;
  color: string;
  sort_order: number;
}

/** Seeded into an empty collection at startup; also the fallback list when the collection is empty. */
export const DEFAULT_CATEGORIES: readonly DefaultCategory[] = [
  { slug: "utilities", label: "Utilities", color: "#3c83f6", sort_order: 1 },
  { slug: "entertainment", label: "Entertainment", color: "#b055dd", sort_order: 2 },
  { slug: "software", label: "Software", color: "#21c45d", sort_order: 3 },
  { slug: "finance", label: "Finance", color: "#f59f0a", sort_order: 4 },
  { slug: "insurance", label: "Insurance", color: "#ef486f", sort_order: 5 },
  { slug: "housing", label: "Housing", color: "#26bbd9", sort_order: 6 },
  { slug: "loans", label: "Loans & EMI", color: "#f47825", sort_order: 7 },
  { slug: "transport", label: "Transport", color: "#2badee", sort_order: 8 },
  { slug: "health", label: "Health", color: "#28bd98", sort_order: 9 },
  { slug: "education", label: "Education", color: "#f9ce1f", sort_order: 10 },
  { slug: "groceries", label: "Groceries", color: "#68c639", sort_order: 11 },
];

export const DEFAULT_CATEGORY_SLUGS: readonly string[] = DEFAULT_CATEGORIES.map(
  (c) => c.slug,
);

/** Colors handed to new categories in turn when the admin does not pick one. */
export const CATEGORY_COLOR_PALETTE: readonly string[] = [
  "#3c83f6",
  "#b055dd",
  "#21c45d",
  "#f59f0a",
  "#ef486f",
  "#26bbd9",
  "#f47825",
  "#2badee",
  "#28bd98",
  "#f9ce1f",
  "#68c639",
  "#8b5cf6",
];

const categorySchema = new mongoose.Schema(
  {
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      maxlength: 40,
      match: CATEGORY_SLUG_PATTERN,
    },
    label: {
      type: String,
      required: true,
      trim: true,
      maxlength: CATEGORY_LABEL_MAX,
    },
    color: {
      type: String,
      required: true,
      default: "#3c83f6",
      match: CATEGORY_COLOR_PATTERN,
    },
    sort_order: { type: Number, default: 0, index: true },
    is_active: { type: Boolean, default: true },
  },
  { timestamps: true, versionKey: false },
);

export const Category =
  mongoose.models.Category || mongoose.model("Category", categorySchema);

const labelSchema = z
  .string()
  .trim()
  .min(1, "Category name is required.")
  .max(CATEGORY_LABEL_MAX, `Category name must not exceed ${CATEGORY_LABEL_MAX} characters.`);

const colorSchema = z
  .string()
  .trim()
  .regex(CATEGORY_COLOR_PATTERN, "Color must be a hex value like #3c83f6.")
  .transform((value) => value.toLowerCase());

export const createCategorySchema = z
  .object({
    label: labelSchema,
    color: colorSchema.optional(),
  })
  .strict();

export const updateCategorySchema = z
  .object({
    label: labelSchema.optional(),
    color: colorSchema.optional(),
    is_active: z.boolean().optional(),
    sort_order: z.number().int().min(0).max(999).optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "No fields to update.",
  });

export function isValidCategoryId(id: string): boolean {
  return mongoose.Types.ObjectId.isValid(id) && /^[0-9a-fA-F]{24}$/.test(id);
}

/**
 * Turns a display name into a URL-safe slug, e.g. "Pet Care!" -> "pet-care".
 * Names with no latin letters or digits fall back to "category".
 */
export function slugifyCategoryLabel(label: string): string {
  const slug = label
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 34)
    .replace(/-+$/g, "");
  return slug || "category";
}

/**
 * Seeds the default categories into an empty collection. Upserting by the
 * unique slug keeps concurrent starts from inserting duplicates; existing
 * categories are never modified, so admin edits and deletions stick.
 */
export async function seedCategoriesIfEmpty(): Promise<void> {
  const count = await Category.countDocuments();
  if (count > 0) return;

  await Category.bulkWrite(
    DEFAULT_CATEGORIES.map((category) => ({
      updateOne: {
        filter: { slug: category.slug },
        update: { $setOnInsert: { ...category, is_active: true } },
        upsert: true,
      },
    })),
    { ordered: false },
  );
}
