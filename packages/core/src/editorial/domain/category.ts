import type { Locale } from "../../locale";
import { slugify, slugPattern } from "./article";
import { EditorialRuleError } from "./errors";

export const categoryLimits = {
  name: { min: 2, max: 80 },
  slug: { max: 80 },
  description: { max: 280 },
  position: { max: 999 },
} as const;

/** One locale of a category. */
export interface CategoryTranslation {
  id: string;
  slug: string;
  name: string;
  description: string;
}

/**
 * A category as an editor manages it: one translation key and one row per locale. The key is the
 * English slug at creation and never changes, so articles and links stay attached when a slug is
 * renamed. `position` orders the categories on the site.
 */
export interface CategoryRecord {
  translationKey: string;
  position: number;
  translations: Partial<Record<Locale, CategoryTranslation>>;
}

/** One locale of a new category. The slug defaults to the slugified name; the description to "". */
export interface CategoryTextInput {
  name: string;
  slug?: string;
  description?: string;
}

/** A new category needs both locales, because every locale of the site lists its categories. */
export interface CategoryCreate {
  /** Defaults to the next free position. */
  position?: number;
  translations: Record<Locale, CategoryTextInput>;
}

/** Omitted fields keep their value. Only `description: ""` clears; name, slug and position cannot be cleared. */
export interface CategoryTextPatch {
  name?: string;
  slug?: string;
  description?: string;
}

export interface CategoryPatch {
  translationKey: string;
  position?: number;
  translations?: Partial<Record<Locale, CategoryTextPatch>>;
}

/** What the repository writes: complete values, never a patch. */
export interface CategoryWrite {
  translationKey: string;
  position: number;
  translations: Partial<Record<Locale, { slug: string; name: string; description: string }>>;
}

export interface CategoryAdminRepository {
  listCategoryRecords(): Promise<CategoryRecord[]>;
  /** One transaction: every category is written, or none. */
  createCategories(items: CategoryWrite[]): Promise<CategoryRecord[]>;
  updateCategories(items: CategoryWrite[]): Promise<CategoryRecord[]>;
  deleteCategories(translationKeys: string[]): Promise<void>;
  /** Articles of every locale that use each category. */
  countCategoryArticles(translationKeys: string[]): Promise<Map<string, number>>;
}

export function normalizeCategoryText(
  locale: Locale,
  text: { name: string; slug?: string; description?: string },
) {
  const name = text.name.trim();
  const description = (text.description ?? "").trim();
  const slug = (text.slug ?? "").trim() || slugify(name);
  const where = `(${locale})`;
  if (name.length < categoryLimits.name.min || name.length > categoryLimits.name.max) {
    throw new EditorialRuleError(
      `Category name ${where} must be ${categoryLimits.name.min}-${categoryLimits.name.max} characters.`,
      "category.invalidName",
      { locale, ...categoryLimits.name },
    );
  }
  if (!slug || slug.length > categoryLimits.slug.max || !slugPattern.test(slug)) {
    throw new EditorialRuleError(
      `Category slug ${where} must be lowercase letters, numbers and hyphens, at most ${categoryLimits.slug.max} characters.`,
      "category.invalidSlug",
      { locale, max: categoryLimits.slug.max },
    );
  }
  if (description.length > categoryLimits.description.max) {
    throw new EditorialRuleError(
      `Category description ${where} is at most ${categoryLimits.description.max} characters.`,
      "category.descriptionTooLong",
      { locale, max: categoryLimits.description.max },
    );
  }
  return { slug, name, description };
}

export function assertCategoryPosition(position: number) {
  if (!Number.isInteger(position) || position < 0 || position > categoryLimits.position.max) {
    throw new EditorialRuleError(
      `Category position must be a whole number from 0 to ${categoryLimits.position.max}.`,
      "category.invalidPosition",
      { max: categoryLimits.position.max },
    );
  }
}
