import {
  defaultCoverImage,
  estimateReadingMinutes,
  normalizeStoryFields,
  slugify,
  type Article,
  type ArticleDraftInput,
  type ArticleQuery,
  type SocialChannel,
  type StoryFields,
  type StudioArticleFilter,
} from "@atlasnews/core/editorial/domain/article";
import type { ArticleRepository } from "@atlasnews/core/editorial/domain/article-repository";
import type { Locale } from "@atlasnews/core/locale";
import type { D1Database, D1PreparedStatement } from "../../sites/cloudflare";
import { D1EditorialAccess, type D1EditorialRepositoryOptions } from "./access";
import {
  articleApplied,
  articleSelect,
  assertBatchSize,
  distributionStatements,
  editorialDistribution,
  inList,
  insertInto,
  jsonList,
  mapArticle,
  toFtsQuery,
  toTimestamp,
  Where,
  type ArticleRow,
} from "./sql";

/** Articles, their category list, publication state and distribution channels. */
export class D1ArticleRepository extends D1EditorialAccess implements ArticleRepository {
  private readonly articleSql: string;

  constructor(database: D1Database, options: D1EditorialRepositoryOptions) {
    super(database, options);
    // Distribution channels are editorial workflow state: the public repository must not read them.
    this.articleSql = articleSelect(options.audience === "public" ? "'[]'" : editorialDistribution);
  }

  private async queryArticles(where: Where, tail = "", ...tailBinds: unknown[]) {
    if (this.options.audience === "public") {
      where.add("a.status = 'published' AND a.published_at <= ?", new Date().toISOString());
    }
    const rows = await this.rows<ArticleRow>(`${this.articleSql} ${where.sql} ${tail}`, ...where.binds, ...tailBinds);
    return rows.map(mapArticle);
  }

  private filterArticles(
    where: Where,
    filter: { category?: string; entity?: string; claimStatus?: string; query?: string },
  ) {
    if (filter.category) where.add("c.slug = ?", filter.category);
    if (filter.entity) {
      where.add(
        "EXISTS (SELECT 1 FROM article_entities l JOIN entities e ON e.id = l.entity_id WHERE l.article_id = a.id AND e.slug = ?)",
        filter.entity,
      );
    }
    if (filter.claimStatus) where.add("a.claim_status = ?", filter.claimStatus);
    const text = filter.query?.trim();
    if (text) {
      const match = toFtsQuery(text);
      if (match) where.add("a.id IN (SELECT article_id FROM article_search WHERE article_search MATCH ?)", match);
      else where.add("0");
    }
  }

  async listPublished(input: ArticleQuery) {
    const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);
    const where = new Where()
      .add("a.locale = ?", input.locale)
      .add("a.status = 'published' AND a.published_at <= ?", new Date().toISOString());
    this.filterArticles(where, input);
    if (input.cursor) {
      const { publishedAt, id } = input.cursor;
      where.add("a.published_at < ? OR (a.published_at = ? AND a.id < ?)", publishedAt, publishedAt, id);
    }
    const rows = await this.queryArticles(where, "ORDER BY a.published_at DESC, a.id DESC LIMIT ?", limit + 1);
    const items = rows.slice(0, limit);
    const last = items.at(-1);

    return {
      items,
      nextCursor: rows.length > limit && last?.publishedAt ? { id: last.id, publishedAt: last.publishedAt } : null,
    };
  }

  async listForStudio(locale: Locale, filter: StudioArticleFilter = {}) {
    const where = new Where().add("a.locale = ?", locale);
    if (filter.status) where.add("a.status = ?", filter.status);
    this.filterArticles(where, filter);
    return this.queryArticles(where, "ORDER BY a.updated_at DESC, a.id DESC LIMIT 100");
  }

  async findBySlug(slug: string, locale: Locale) {
    const [article] = await this.queryArticles(new Where().add("a.locale = ?", locale).add("a.slug = ?", slug));
    return article ?? null;
  }

  async findById(id: string, locale: Locale) {
    const [article] = await this.queryArticles(new Where().add("a.locale = ?", locale).add("a.id = ?", id));
    return article ?? null;
  }

  async findByTranslationKey(translationKey: string, locale: Locale) {
    const [article] = await this.queryArticles(new Where().add("a.locale = ?", locale).add("a.translation_key = ?", translationKey));
    return article ?? null;
  }

  /** The articles that exist among `ids`, by id. */
  private async articlesById(ids: string[]) {
    if (!ids.length) return new Map<string, Article>();
    const articles = await this.queryArticles(new Where().add(`a.id ${inList}`, jsonList(ids)));
    return new Map(articles.map((article) => [article.id, article]));
  }

  private async findByIds(ids: string[]) {
    const byId = await this.articlesById(ids);
    return ids.map((id) => {
      const article = byId.get(id);
      if (!article) throw new Error("Saved article could not be read back");
      return article;
    });
  }

  async listCategories(locale: Locale) {
    const rows = await this.rows<{
      id: string;
      translation_key: string;
      locale: Locale;
      slug: string;
      name: string;
      description: string;
    }>(
      "SELECT id, translation_key, locale, slug, name, description FROM categories WHERE locale = ? ORDER BY position, translation_key",
      locale,
    );
    return rows.map((row) => ({
      id: row.id,
      translationKey: row.translation_key,
      locale: row.locale,
      slug: row.slug,
      name: row.name,
      description: row.description,
    }));
  }

  /** The columns of one article write, as `save_article_with_distribution` took them. */
  private articleRecord(
    input: ArticleDraftInput,
    story: StoryFields,
    categoryId: string,
    authorId: string,
    existing: Article | null,
    timestamp: string,
  ) {
    return {
      // A key the caller names links the article to its translation; without one the article keeps its own.
      translation_key: input.translationKey ?? existing?.translationKey ?? crypto.randomUUID(),
      locale: input.locale,
      slug: slugify(input.slug || input.title),
      title: input.title.trim(),
      excerpt: input.excerpt.trim(),
      content: input.content.trim(),
      cover_image: input.coverImage || existing?.coverImage || defaultCoverImage,
      cover_alt:
        input.coverAlt
        || existing?.coverAlt
        || (input.locale === "it" ? `Immagine per ${input.title}` : `Image for ${input.title}`),
      status: input.status,
      category_id: categoryId,
      author_id: authorId,
      featured: input.featured ? 1 : 0,
      reading_minutes: estimateReadingMinutes(input.content),
      published_at: input.status === "published" ? existing?.publishedAt ?? timestamp : existing?.publishedAt ?? null,
      scheduled_for: input.status === "scheduled" ? toTimestamp(input.scheduledFor) : null,
      updated_at: timestamp,
      claim_status: story.claimStatus ?? existing?.claimStatus ?? "analysis",
      key_points: jsonList(story.keyPoints ?? existing?.keyPoints ?? []),
      sources: jsonList(story.sources ?? existing?.sources ?? []),
    };
  }

  private async categoryIds(inputs: ArticleDraftInput[]) {
    const rows = await this.rows<{ id: string; locale: string; slug: string }>(
      `SELECT id, locale, slug FROM categories WHERE locale ${inList} AND slug ${inList}`,
      jsonList([...new Set(inputs.map((input) => input.locale))]),
      jsonList([...new Set(inputs.map((input) => input.categorySlug))]),
    );
    return new Map(rows.map((row) => [`${row.locale}/${row.slug}`, row.id]));
  }

  private async entityIds(slugs: string[]) {
    const unique = [...new Set(slugs)];
    if (!unique.length) return new Map<string, string>();
    const rows = await this.rows<{ id: string; slug: string }>(`SELECT id, slug FROM entities WHERE slug ${inList}`, jsonList(unique));
    return new Map(rows.map((row) => [row.slug, row.id]));
  }

  /**
   * Writes the articles in one batch. Every read the write depends on happens first; the UPDATE of an
   * existing article is conditional (`guardPublication` also on its publication state), and the statements
   * after it only apply when it did, so a lost race changes nothing and is reported.
   */
  private async writeArticles(inputs: ArticleDraftInput[], guardPublication: boolean, context: string) {
    this.assertEditorial();
    const [authorId, categoryIds, current] = await Promise.all([
      this.getActorAuthorId(),
      this.categoryIds(inputs),
      this.articlesById(inputs.flatMap((input) => (input.id ? [input.id] : []))),
    ]);
    const timestamp = new Date().toISOString();

    const items = inputs.map((input) => {
      const found = input.id ? current.get(input.id) : undefined;
      const existing = found && found.locale === input.locale ? found : null;
      if (input.id && !existing) throw new Error(`Article ${input.id} does not exist in locale ${input.locale}`);
      const categoryId = categoryIds.get(`${input.locale}/${input.categorySlug}`);
      if (!categoryId) throw new Error(`Unknown article category ${input.categorySlug}`);
      if (guardPublication && (input.status === "published") !== (existing?.status === "published")) {
        throw new Error("Saving cannot publish or unpublish an article; use setPublished");
      }
      const story = normalizeStoryFields(input);
      const record = this.articleRecord(input, story, categoryId, authorId, existing, timestamp);
      const links = story.entities
        ?? existing?.entities.map(({ slug, isPrimary }) => ({ slug, isPrimary }))
        ?? [];
      if (links.length > 8) throw new Error("An article links at most 8 entities");
      if (links.length && links.filter((link) => link.isPrimary).length !== 1) {
        throw new Error("An article with entities needs exactly one primary entity");
      }
      return { id: existing?.id ?? crypto.randomUUID(), existing, record, links, channels: input.distribution ?? [] };
    });

    const entityIds = await this.entityIds(items.flatMap((item) => item.links.map((link) => link.slug)));
    const statements: D1PreparedStatement[] = [];
    const updates: Array<{ index: number; id: string }> = [];
    for (const { id, existing, record, links, channels } of items) {
      if (existing) {
        const columns = Object.keys(record);
        updates.push({ index: statements.length, id });
        statements.push(
          this.database
            .prepare(
              `UPDATE articles SET ${columns.map((column) => `${column} = ?`).join(", ")} WHERE id = ?${
                guardPublication ? " AND (status = 'published') = (? = 'published')" : ""
              } RETURNING id`,
            )
            .bind(...Object.values(record), id, ...(guardPublication ? [record.status] : [])),
        );
      } else {
        statements.push(insertInto(this.database, "articles", { ...record, id, created_at: timestamp }));
      }
      statements.push(
        this.database.prepare(`DELETE FROM article_entities WHERE article_id = ? AND ${articleApplied}`).bind(id, id, timestamp),
      );
      for (const link of links) {
        const entityId = entityIds.get(link.slug);
        if (!entityId) throw new Error(`Unknown entity ${link.slug}`);
        statements.push(
          this.database
            .prepare(`INSERT INTO article_entities (article_id, entity_id, is_primary) SELECT ?, ?, ? WHERE ${articleApplied}`)
            .bind(id, entityId, link.isPrimary ? 1 : 0, id, timestamp),
        );
      }
      statements.push(...distributionStatements(this.database, id, channels, timestamp, true));
    }

    const results = await this.batch(context, statements);
    for (const { index, id } of updates) {
      if (results[index].results.length) continue;
      const [stored] = await this.rows<{ status: string }>("SELECT status FROM articles WHERE id = ?", id);
      throw new Error(stored ? "Saving cannot publish or unpublish an article; use setPublished" : "Article not found");
    }
    return this.findByIds(items.map((item) => item.id));
  }

  async save(input: ArticleDraftInput) {
    const [article] = await this.writeArticles([input], false, "Unable to save article");
    return article;
  }

  async saveMany(inputs: ArticleDraftInput[]) {
    assertBatchSize(inputs.length);
    return this.writeArticles(inputs, true, "Unable to save articles");
  }

  async setPublished(ids: string[], published: boolean) {
    this.assertEditorial();
    const context = published ? "Unable to publish articles" : "Unable to unpublish articles";
    assertBatchSize(ids.length);
    const targets = [...new Set(ids)];
    const found = new Set((await this.rows<{ id: string }>(`SELECT id FROM articles WHERE id ${inList}`, jsonList(targets))).map((row) => row.id));
    const missing = targets.find((id) => !found.has(id));
    if (missing) throw new Error(`${context}: Article ${missing} not found`);

    const timestamp = new Date().toISOString();
    await this.batch(context, [
      this.database
        .prepare(
          `UPDATE articles SET status = ?, scheduled_for = NULL, updated_at = ?,
             published_at = CASE WHEN ? THEN COALESCE(published_at, ?) ELSE published_at END
           WHERE id ${inList}`,
        )
        .bind(published ? "published" : "draft", timestamp, published ? 1 : 0, timestamp, jsonList(targets)),
    ]);
    return this.findByIds(targets);
  }

  async delete(id: string) {
    this.assertEditorial();
    await this.batch("Unable to delete article", [this.database.prepare("DELETE FROM articles WHERE id = ?").bind(id)]);
  }

  async deleteMany(ids: string[]) {
    this.assertEditorial();
    assertBatchSize(ids.length);
    const targets = [...new Set(ids)];
    const found = new Set((await this.rows<{ id: string }>(`SELECT id FROM articles WHERE id ${inList}`, jsonList(targets))).map((row) => row.id));
    const missing = ids.find((id) => !found.has(id));
    if (missing) throw new Error(`Unable to delete articles: Article ${missing} not found`);
    const [deleted] = await this.batch("Unable to delete articles", [
      this.database.prepare(`DELETE FROM articles WHERE id ${inList} RETURNING id`).bind(jsonList(targets)),
    ]);
    if (deleted.results.length !== targets.length) throw new Error("Unable to delete articles");
  }

  async setDistributionChannels(id: string, channels: SocialChannel[]) {
    this.assertEditorial();
    await this.batch(
      "Unable to save distribution channels",
      distributionStatements(this.database, id, channels, new Date().toISOString(), false),
    );
  }
}
