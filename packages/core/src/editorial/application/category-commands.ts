import type { Locale } from "../../locale";
import type {
  CategoryAdminRepository,
  CategoryCreate,
  CategoryPatch,
  CategoryRecord,
  CategoryWrite,
} from "../domain/category";
import { assertCategoryPosition, normalizeCategoryText } from "../domain/category";
import {
  assertBatchSize,
  asSingle,
  batchLimit,
  EditorialRuleError,
  rejectRepeats,
  validateEach,
} from "../domain/errors";
import { locales } from "../../locale";

type Taken = Map<string, string>;

const notFound = (key: string) => new EditorialRuleError(`Category "${key}" not found.`, "category.notFound", { key });
const slugTaken = (locale: Locale, slug: string, owner: string) =>
  new EditorialRuleError(`The ${locale} slug "${slug}" is already used by category "${owner}".`, "category.slugTaken", { locale, slug, owner });

/** Which category key owns each slug in each locale; the base of every uniqueness check. */
function slugOwners(records: readonly CategoryRecord[]) {
  const owners = new Map<Locale, Taken>(locales.map((locale) => [locale, new Map()]));
  for (const record of records) {
    for (const locale of locales) {
      const translation = record.translations[locale];
      if (translation) owners.get(locale)!.set(translation.slug, record.translationKey);
    }
  }
  return owners;
}

/**
 * Categories are bilingual: one translation key and one row per locale. Every write is a batch
 * of one or more, checked in full first (so every invalid item is reported by index) and written
 * in one transaction.
 */
export class CategoryCommandService {
  constructor(private readonly repository: CategoryAdminRepository) {}

  createOne(input: CategoryCreate) {
    return asSingle(async () => (await this.createMany([input]))[0]);
  }

  updateOne(input: CategoryPatch) {
    return asSingle(async () => (await this.updateMany([input]))[0]);
  }

  deleteOne(translationKey: string) {
    return asSingle(async () => (await this.deleteMany([translationKey]))[0]);
  }

  async createMany(inputs: CategoryCreate[]) {
    assertBatchSize(inputs.length, batchLimit, "category");
    const records = await this.repository.listCategoryRecords();
    const owners = slugOwners(records);
    const keys = new Set(records.map((record) => record.translationKey));
    let next = Math.max(-1, ...records.map((record) => record.position)) + 1;

    const writes = await validateEach(
      inputs,
      (input) => {
        const translations: CategoryWrite["translations"] = {};
        for (const locale of locales) translations[locale] = normalizeCategoryText(locale, input.translations[locale]);
        const translationKey = translations.en?.slug ?? "";
        if (keys.has(translationKey)) {
          throw new EditorialRuleError(`The category "${translationKey}" already exists.`, "category.exists", { key: translationKey });
        }
        for (const locale of locales) {
          const owner = owners.get(locale)!.get(translations[locale]!.slug);
          if (owner) throw slugTaken(locale, translations[locale]!.slug, owner);
        }
        const position = input.position ?? next;
        assertCategoryPosition(position);
        // State changes only once the item is known to be valid.
        keys.add(translationKey);
        for (const locale of locales) owners.get(locale)!.set(translations[locale]!.slug, translationKey);
        next = Math.max(next, position + 1);
        return { translationKey, position, translations };
      },
      (input) => input.translations.en?.slug ?? input.translations.en?.name,
    );
    return this.repository.createCategories(writes);
  }

  async updateMany(patches: CategoryPatch[]) {
    assertBatchSize(patches.length, batchLimit, "category");
    rejectRepeats(patches, (patch) => patch.translationKey, (key) => `The category "${key}" appears twice`);
    const records = new Map((await this.repository.listCategoryRecords()).map((record) => [record.translationKey, record]));
    const owners = slugOwners([...records.values()]);

    const writes = await validateEach(
      patches,
      (patch) => {
        const current = records.get(patch.translationKey);
        if (!current) throw notFound(patch.translationKey);
        const texts = Object.entries(patch.translations ?? {}).filter(([, text]) => text && Object.values(text).some((value) => value !== undefined));
        if (patch.position === undefined && !texts.length) {
          throw new EditorialRuleError("Nothing to change: pass a position or a translation field.", "category.nothingToChange");
        }

        const translations: CategoryWrite["translations"] = {};
        for (const locale of locales) {
          const stored = current.translations[locale];
          if (!stored) continue;
          const change = patch.translations?.[locale] ?? {};
          const merged = normalizeCategoryText(locale, {
            name: change.name ?? stored.name,
            slug: change.slug ?? stored.slug,
            description: change.description ?? stored.description,
          });
          const owner = owners.get(locale)!.get(merged.slug);
          if (owner && owner !== current.translationKey) {
            throw slugTaken(locale, merged.slug, owner);
          }
          translations[locale] = merged;
        }
        for (const [locale] of texts) {
          if (!current.translations[locale as Locale]) {
            throw new EditorialRuleError(
              `Category "${patch.translationKey}" has no ${locale} translation to change.`,
              "category.noTranslation",
              { key: patch.translationKey, locale },
            );
          }
        }
        const position = patch.position ?? current.position;
        assertCategoryPosition(position);
        for (const locale of locales) {
          const stored = current.translations[locale];
          if (stored) owners.get(locale)!.delete(stored.slug);
          if (translations[locale]) owners.get(locale)!.set(translations[locale]!.slug, current.translationKey);
        }
        return { translationKey: current.translationKey, position, translations };
      },
      (patch) => patch.translationKey,
    );
    return this.repository.updateCategories(writes);
  }

  /** Returns the keys deleted. A category that articles still use is refused. */
  async deleteMany(translationKeys: string[]) {
    assertBatchSize(translationKeys.length, batchLimit, "category");
    rejectRepeats(translationKeys, (key) => key, (key) => `The category "${key}" appears twice`);
    const [records, counts] = await Promise.all([
      this.repository.listCategoryRecords(),
      this.repository.countCategoryArticles(translationKeys),
    ]);
    const known = new Set(records.map((record) => record.translationKey));
    await validateEach(
      translationKeys,
      (key) => {
        if (!known.has(key)) throw notFound(key);
        const used = counts.get(key) ?? 0;
        if (used > 0) {
          throw new EditorialRuleError(
            `Category "${key}" is used by ${used} article${used === 1 ? "" : "s"}. Move them to another category first.`,
            "category.inUse",
            { key, count: used },
          );
        }
      },
      (key) => key,
    );
    await this.repository.deleteCategories(translationKeys);
    return translationKeys;
  }
}
