import type { Category } from "@atlasnews/core/editorial/domain/article";
import type { CategoryAdminRepository, CategoryRecord, CategoryWrite } from "@atlasnews/core/editorial/domain/category";
import { locales } from "@atlasnews/core/locale";
import type { MemoryEditorialStore } from "./store";

/** The categories as editors manage them. */
export class MemoryCategoryAdminRepository implements CategoryAdminRepository {
  constructor(private readonly store: MemoryEditorialStore) {}

  private categoryRecord(translationKey: string): CategoryRecord {
    const translations: CategoryRecord["translations"] = {};
    for (const category of this.store.categories.filter((item) => item.translationKey === translationKey)) {
      const { id, slug, name, description } = category;
      translations[category.locale] = { id, slug, name, description };
    }
    return { translationKey, position: this.store.positionOf(translationKey), translations };
  }

  async listCategoryRecords() {
    return [...this.store.categoryPositions.keys()]
      .sort((left, right) => this.store.positionOf(left) - this.store.positionOf(right))
      .map((key) => this.categoryRecord(key));
  }

  private writeCategory(item: CategoryWrite, create: boolean) {
    this.store.categoryPositions.set(item.translationKey, item.position);
    for (const locale of locales) {
      const text = item.translations[locale];
      if (!text) continue;
      const index = this.store.categories.findIndex((category) => category.translationKey === item.translationKey && category.locale === locale);
      if (create === (index >= 0)) throw new Error(`Category ${item.translationKey}/${locale} ${create ? "already exists" : "does not exist"}`);
      const category: Category = {
        id: this.store.categories[index]?.id ?? `cat-${item.translationKey}-${locale}`,
        translationKey: item.translationKey,
        locale,
        ...text,
      };
      if (index >= 0) this.store.categories[index] = category;
      else this.store.categories.push(category);
      for (const article of this.store.articles) {
        if (article.category.id === category.id) article.category = { ...category };
      }
    }
  }

  async createCategories(items: CategoryWrite[]) {
    return this.store.atomic(() => {
      for (const item of items) this.writeCategory(item, true);
      return items.map((item) => this.categoryRecord(item.translationKey));
    });
  }

  async updateCategories(items: CategoryWrite[]) {
    return this.store.atomic(() => {
      for (const item of items) this.writeCategory(item, false);
      return items.map((item) => this.categoryRecord(item.translationKey));
    });
  }

  async deleteCategories(translationKeys: string[]) {
    await this.store.atomic(() => {
      for (const key of translationKeys) {
        if (this.countArticlesIn(key)) throw new Error(`Category ${key} is in use`);
        if (!this.store.categoryPositions.delete(key)) throw new Error(`Category ${key} not found`);
        this.store.categories = this.store.categories.filter((category) => category.translationKey !== key);
      }
    });
  }

  private countArticlesIn(translationKey: string) {
    return this.store.articles.filter((article) => article.category.translationKey === translationKey).length;
  }

  async countCategoryArticles(translationKeys: string[]) {
    return new Map(translationKeys.map((key) => [key, this.countArticlesIn(key)]));
  }
}
