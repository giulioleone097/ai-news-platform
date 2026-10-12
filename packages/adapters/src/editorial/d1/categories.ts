import type { CategoryAdminRepository, CategoryRecord, CategoryWrite } from "@atlasnews/core/editorial/domain/category";
import type { Locale } from "@atlasnews/core/locale";
import { D1EditorialAccess } from "./access";
import { assertBatchSize, inList, insertInto, itemError, jsonList } from "./sql";

/** The categories as editors manage them: one record per translation key, with its translations. */
export class D1CategoryAdminRepository extends D1EditorialAccess implements CategoryAdminRepository {
  async listCategoryRecords(): Promise<CategoryRecord[]> {
    const rows = await this.rows<{
      id: string;
      translation_key: string;
      locale: Locale;
      slug: string;
      name: string;
      description: string;
      position: number;
    }>("SELECT id, translation_key, locale, slug, name, description, position FROM categories ORDER BY position, translation_key, locale");
    const records = new Map<string, CategoryRecord>();
    for (const row of rows) {
      const record = records.get(row.translation_key)
        ?? { translationKey: row.translation_key, position: row.position, translations: {} };
      record.translations[row.locale] = { id: row.id, slug: row.slug, name: row.name, description: row.description };
      records.set(row.translation_key, record);
    }
    return [...records.values()];
  }

  private async categoryRecords(translationKeys: string[]) {
    const wanted = new Set(translationKeys);
    const records = (await this.listCategoryRecords()).filter((record) => wanted.has(record.translationKey));
    return translationKeys.map((key) => {
      const record = records.find((item) => item.translationKey === key);
      if (!record) throw new Error("Saved category could not be read back");
      return record;
    });
  }

  async createCategories(items: CategoryWrite[]) {
    this.assertEditorial();
    const context = "Unable to create categories";
    assertBatchSize(items.length);
    const timestamp = new Date().toISOString();
    const statements = items.flatMap((item, index) => {
      const translations = Object.entries(item.translations);
      if (!translations.length) throw itemError(context, index, "A category needs at least one translation");
      return translations.map(([locale, text]) =>
        insertInto(this.database, "categories", {
          id: crypto.randomUUID(),
          translation_key: item.translationKey,
          locale,
          slug: text.slug,
          name: text.name,
          description: text.description,
          position: item.position,
          created_at: timestamp,
        }),
      );
    });
    await this.batch(context, statements);
    return this.categoryRecords(items.map((item) => item.translationKey));
  }

  async updateCategories(items: CategoryWrite[]) {
    this.assertEditorial();
    const context = "Unable to update categories";
    assertBatchSize(items.length);
    const existing = await this.rows<{ translation_key: string; locale: string }>(
      `SELECT translation_key, locale FROM categories WHERE translation_key ${inList}`,
      jsonList(items.map((item) => item.translationKey)),
    );
    const stored = new Set(existing.map((row) => `${row.translation_key}/${row.locale}`));
    const statements = items.flatMap((item, index) => {
      const translations = Object.entries(item.translations);
      for (const [locale] of translations) {
        if (!stored.has(`${item.translationKey}/${locale}`)) {
          throw itemError(context, index, `Category "${item.translationKey}" has no "${locale}" translation`);
        }
      }
      if (!existing.some((row) => row.translation_key === item.translationKey)) {
        throw itemError(context, index, `Category "${item.translationKey}" not found`);
      }
      return [
        ...translations.map(([locale, text]) =>
          this.database
            .prepare("UPDATE categories SET slug = ?, name = ?, description = ? WHERE translation_key = ? AND locale = ?")
            .bind(text.slug, text.name, text.description, item.translationKey, locale),
        ),
        this.database.prepare("UPDATE categories SET position = ? WHERE translation_key = ?").bind(item.position, item.translationKey),
      ];
    });
    await this.batch(context, statements);
    return this.categoryRecords(items.map((item) => item.translationKey));
  }

  async deleteCategories(translationKeys: string[]) {
    this.assertEditorial();
    const context = "Unable to delete categories";
    assertBatchSize(translationKeys.length);
    const usage = await this.countCategoryArticles(translationKeys, true);
    const stored = new Set(
      (await this.rows<{ translation_key: string }>(`SELECT translation_key FROM categories WHERE translation_key ${inList}`, jsonList(translationKeys)))
        .map((row) => row.translation_key),
    );
    const removed = new Set<string>();
    translationKeys.forEach((key, index) => {
      if (usage.get(key)) throw itemError(context, index, `Category "${key}" is used by ${usage.get(key)} articles`);
      if (!stored.has(key) || removed.has(key)) throw itemError(context, index, `Category "${key}" not found`);
      removed.add(key);
    });
    await this.batch(
      context,
      translationKeys.map((key) => this.database.prepare("DELETE FROM categories WHERE translation_key = ?").bind(key)),
    );
  }

  /** `all` counts articles of every status; otherwise only those the audience can read. */
  async countCategoryArticles(translationKeys: string[], all = this.options.audience === "editorial") {
    const rows = await this.rows<{ translation_key: string; total: number }>(
      `SELECT c.translation_key, count(a.id) AS total
       FROM categories c LEFT JOIN articles a ON a.category_id = c.id${
         all ? "" : " AND a.status = 'published' AND a.published_at <= ?"
       }
       WHERE c.translation_key ${inList} GROUP BY c.translation_key`,
      ...(all ? [] : [new Date().toISOString()]),
      jsonList(translationKeys),
    );
    const totals = new Map(rows.map((row) => [row.translation_key, row.total]));
    return new Map(translationKeys.map((key) => [key, totals.get(key) ?? 0]));
  }
}
