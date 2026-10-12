import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { CategoryAdminRepository, CategoryRecord, CategoryWrite } from "@atlasnews/core/editorial/domain/category";
import { throwIfError } from "../../supabase/errors";
import { categorySchema } from "./shared";

const categoryRowSchema = categorySchema.extend({ position: z.number() });

/** The categories as editors manage them: one record per translation key, with its translations. */
export class SupabaseCategoryAdminRepository implements CategoryAdminRepository {
  constructor(private readonly client: SupabaseClient) {}

  async listCategoryRecords(): Promise<CategoryRecord[]> {
    const { data, error } = await this.client
      .from("categories")
      .select("id, translation_key, locale, slug, name, description, position")
      .order("position")
      .order("translation_key");
    throwIfError(error, "Unable to list categories");
    const records = new Map<string, CategoryRecord>();
    for (const row of z.array(categoryRowSchema).parse(data ?? [])) {
      const record = records.get(row.translation_key)
        ?? { translationKey: row.translation_key, position: row.position, translations: {} };
      record.translations[row.locale] = {
        id: row.id,
        slug: row.slug,
        name: row.name,
        description: row.description ?? "",
      };
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

  private categoryRows(items: CategoryWrite[]) {
    return items.map((item) => ({
      translation_key: item.translationKey,
      position: item.position,
      translations: item.translations,
    }));
  }

  async createCategories(items: CategoryWrite[]) {
    const { error } = await this.client.rpc("create_categories_batch", { p_items: this.categoryRows(items) });
    throwIfError(error, "Unable to create categories");
    return this.categoryRecords(items.map((item) => item.translationKey));
  }

  async updateCategories(items: CategoryWrite[]) {
    const { error } = await this.client.rpc("update_categories_batch", { p_items: this.categoryRows(items) });
    throwIfError(error, "Unable to update categories");
    return this.categoryRecords(items.map((item) => item.translationKey));
  }

  async deleteCategories(translationKeys: string[]) {
    const { error } = await this.client.rpc("delete_categories_batch", { p_keys: translationKeys });
    throwIfError(error, "Unable to delete categories");
  }

  async countCategoryArticles(translationKeys: string[]) {
    const { data, error } = await this.client
      .from("categories")
      .select("id, translation_key")
      .in("translation_key", translationKeys);
    throwIfError(error, "Unable to read categories");
    const idsByKey = new Map<string, string[]>();
    for (const row of z.array(z.object({ id: z.string(), translation_key: z.string() })).parse(data ?? [])) {
      idsByKey.set(row.translation_key, [...(idsByKey.get(row.translation_key) ?? []), row.id]);
    }
    return new Map(await Promise.all(translationKeys.map(async (key) => {
      const { count, error: countError } = await this.client
        .from("articles")
        .select("id", { count: "exact", head: true })
        .in("category_id", idsByKey.get(key) ?? []);
      throwIfError(countError, "Unable to count category articles");
      return [key, count ?? 0] as const;
    })));
  }
}
