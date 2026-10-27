import { describe, it, expect } from "vitest";
import {
  CATEGORY_COLOR_PALETTE,
  CATEGORY_SLUG_PATTERN,
  DEFAULT_CATEGORIES,
  categorySlugSchema,
  createCategorySchema,
  slugifyCategoryLabel,
  updateCategorySchema,
} from "../../server/src/models/Category";
import { prettifyCategorySlug, DEFAULT_CATEGORIES as UI_DEFAULTS } from "@/data/categories";

describe("slugifyCategoryLabel", () => {
  it.each([
    ["Car EMI", "car-emi"],
    ["  Pet Care!  ", "pet-care"],
    ["Loans & EMI", "loans-emi"],
    ["Café", "cafe"],
    ["--A--B--", "a-b"],
  ])("turns %j into %j", (label, slug) => {
    expect(slugifyCategoryLabel(label)).toBe(slug);
  });

  it("falls back to 'category' when no latin characters remain", () => {
    expect(slugifyCategoryLabel("पालतू")).toBe("category");
    expect(slugifyCategoryLabel("!!!")).toBe("category");
  });

  it("always produces a valid, bounded slug", () => {
    const slug = slugifyCategoryLabel("a".repeat(30) + " " + "b".repeat(30));
    expect(slug.length).toBeLessThanOrEqual(34);
    expect(CATEGORY_SLUG_PATTERN.test(slug)).toBe(true);
  });
});

describe("category schemas", () => {
  it("accepts well-formed slugs and rejects malformed ones", () => {
    expect(categorySlugSchema.safeParse("car-emi").success).toBe(true);
    for (const bad of ["", "Car", "a b", "-a", "a-", "a--b", "x".repeat(41)]) {
      expect(categorySlugSchema.safeParse(bad).success, bad).toBe(false);
    }
  });

  it("validates create input and normalises color", () => {
    const ok = createCategorySchema.safeParse({ label: " Pets ", color: "#AABBCC" });
    expect(ok.success).toBe(true);
    if (ok.success) {
      expect(ok.data.label).toBe("Pets");
      expect(ok.data.color).toBe("#aabbcc");
    }
    expect(createCategorySchema.safeParse({ label: "" }).success).toBe(false);
    expect(createCategorySchema.safeParse({ label: "x".repeat(31) }).success).toBe(false);
    expect(createCategorySchema.safeParse({ label: "A", color: "blue" }).success).toBe(false);
    expect(createCategorySchema.safeParse({ label: "A", slug: "a" }).success).toBe(false);
  });

  it("requires at least one field on update and forbids changing the slug", () => {
    expect(updateCategorySchema.safeParse({}).success).toBe(false);
    expect(updateCategorySchema.safeParse({ slug: "x" }).success).toBe(false);
    expect(updateCategorySchema.safeParse({ is_active: false }).success).toBe(true);
    expect(updateCategorySchema.safeParse({ sort_order: -1 }).success).toBe(false);
  });
});

describe("default categories", () => {
  it("have unique, valid slugs and colors", () => {
    const slugs = DEFAULT_CATEGORIES.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const c of DEFAULT_CATEGORIES) {
      expect(CATEGORY_SLUG_PATTERN.test(c.slug)).toBe(true);
      expect(c.color).toMatch(/^#[0-9a-f]{6}$/);
    }
    for (const color of CATEGORY_COLOR_PALETTE) expect(color).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("match the frontend fallback list", () => {
    expect(UI_DEFAULTS.map((c) => [c.slug, c.label, c.color])).toEqual(
      DEFAULT_CATEGORIES.map((c) => [c.slug, c.label, c.color]),
    );
    expect(UI_DEFAULTS.map((c) => [c.slug, c.kind])).toEqual(
      DEFAULT_CATEGORIES.map((c) => [c.slug, c.kind]),
    );
  });

  it("classify leisure as wants and savings as savings", () => {
    const kind = (slug: string) => DEFAULT_CATEGORIES.find((c) => c.slug === slug)?.kind;
    expect(kind("entertainment")).toBe("want");
    expect(kind("savings")).toBe("savings");
    expect(kind("housing")).toBe("need");
  });

  it("prettifies unknown slugs for display", () => {
    expect(prettifyCategorySlug("pet-care")).toBe("Pet care");
    expect(prettifyCategorySlug("")).toBe("");
  });
});
