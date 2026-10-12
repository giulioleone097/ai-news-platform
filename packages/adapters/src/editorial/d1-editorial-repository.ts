import {
  estimateReadingMinutes,
  normalizeStoryFields,
  orderEntityRefs,
  slugify,
  type Article,
  type ArticleDraftInput,
  type ArticleQuery,
  type ArticleStatus,
  type ClaimStatus,
  type SocialChannel,
  type StoryFields,
  type StudioArticleFilter,
} from "@atlasnews/core/editorial/domain/article";
import type {
  CategoryAdminRepository,
  CategoryRecord,
  CategoryWrite,
} from "@atlasnews/core/editorial/domain/category";
import type {
  EntityAdminRepository,
  EntityDetail,
  EntityKind,
  EntityRecord,
  EntityRepository,
  EntitySummary,
  EntityTimelineItem,
  EntityWrite,
} from "@atlasnews/core/editorial/domain/entity";
import type {
  ArticleRepository,
  DistributionRepository,
  MediaRepository,
  NewsletterRepository,
} from "@atlasnews/core/editorial/domain/article-repository";
import {
  distributionStatuses,
  type DistributionPublication,
  type DistributionUpdate,
  type MediaAsset,
  type MediaUpload,
  type NewsletterQuery,
} from "@atlasnews/core/editorial/domain/editorial-operations";
import { batchLimit } from "@atlasnews/core/editorial/domain/errors";
import type { Locale } from "@atlasnews/core/locale";
import type { D1Database, D1PreparedStatement, R2Bucket, R2Object } from "../sites/cloudflare";

/**
 * The editorial content of a Site on D1 (articles, categories, entities, distribution) and its media on R2.
 * It follows `SupabaseEditorialRepository` together with the Postgres functions that one calls: the batch
 * writes of `content_batches`, `save_article_with_distribution`, `update_distribution_publication` and
 * `is_editorial_media_referenced`. D1 has no interactive transactions, so a multi-statement write is one
 * `batch()`; whatever a statement needs from earlier reads is checked first, and the statements that follow an
 * article UPDATE only apply when that UPDATE did. The adapter runs with full access: for the `public` audience
 * it reproduces what row-level security left to the anonymous reader and refuses every write.
 */

export type D1EditorialRepositoryOptions = {
  /** `public` serves the anonymous site: published stories only, no distribution; `editorial` serves Studio and admin MCP. */
  audience: "public" | "editorial";
  /** The R2 bucket for media; without one the repository is not `writable` and lists no assets. */
  media: R2Bucket | null;
  /** Subscribers live in the newsletter adapter; the newsletter methods of this repository delegate to it. */
  newsletter: NewsletterRepository;
  /** The signed-in editor's author id; writes that record an author need it. */
  actorAuthorId?: () => Promise<string | null>;
};

const mediaPrefix = "editorial-media/";
/** Where the site serves an asset from, same origin; the web app's `/media-store/[...path]` route reads it from R2. */
const mediaUrlPrefix = "/media-store/";
/** The limits of the Supabase `editorial-media` bucket. */
const allowedMediaTypes = new Set(["image/avif", "image/gif", "image/jpeg", "image/png", "image/webp"]);
const maxMediaBytes = 8_388_608;
const listedAssets = 100;
const mediaPathPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function isMediaPath(path: string) {
  return mediaPathPattern.test(path) && !path.includes("..");
}

/** The R2 object of an uploaded asset, or null when the path is not one an upload can produce or nothing is stored there. */
export async function readSitesMediaObject(bucket: R2Bucket, path: string) {
  return isMediaPath(path) ? bucket.get(`${mediaPrefix}${path}`) : null;
}

interface ArticleRow {
  id: string;
  translation_key: string;
  locale: Locale;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  cover_image: string;
  cover_alt: string;
  status: ArticleStatus;
  featured: number;
  reading_minutes: number;
  published_at: string | null;
  scheduled_for: string | null;
  created_at: string;
  updated_at: string;
  claim_status: ClaimStatus;
  key_points: string;
  sources: string;
  category_id: string;
  category_translation_key: string;
  category_locale: Locale;
  category_slug: string;
  category_name: string;
  category_description: string;
  author_id: string;
  author_name: string;
  author_role: string;
  author_initials: string;
  author_avatar_url: string | null;
  entities: string;
  distribution: string;
}

interface EntityRow {
  id: string;
  kind: EntityKind;
  slug: string;
  name: string;
  official_url: string | null;
  parent_slug: string | null;
  parent_name: string | null;
  descriptions: string;
  story_count?: number;
}

interface PublicationRow {
  id: string;
  channel: SocialChannel;
  status: DistributionPublication["status"];
  message: string | null;
  external_url: string | null;
  scheduled_for: string | null;
  published_at: string | null;
  updated_at: string;
  article_id: string;
  article_locale: Locale;
  article_slug: string;
  article_title: string;
}

/** Entities and distribution channels travel as JSON aggregates, so one query reads an article with all it links. */
const articleSelect = (distribution: string) => `
  SELECT a.id, a.translation_key, a.locale, a.slug, a.title, a.excerpt, a.content, a.cover_image, a.cover_alt,
    a.status, a.featured, a.reading_minutes, a.published_at, a.scheduled_for, a.created_at, a.updated_at,
    a.claim_status, a.key_points, a.sources,
    c.id AS category_id, c.translation_key AS category_translation_key, c.locale AS category_locale,
    c.slug AS category_slug, c.name AS category_name, c.description AS category_description,
    u.id AS author_id, u.name AS author_name, u.role AS author_role, u.initials AS author_initials,
    u.avatar_url AS author_avatar_url,
    (SELECT json_group_array(json_object('kind', e.kind, 'slug', e.slug, 'name', e.name, 'isPrimary', l.is_primary))
       FROM article_entities l JOIN entities e ON e.id = l.entity_id WHERE l.article_id = a.id) AS entities,
    ${distribution} AS distribution
  FROM articles a
  JOIN categories c ON c.id = a.category_id
  JOIN authors u ON u.id = a.author_id`;

const editorialDistribution = "(SELECT json_group_array(channel) FROM (SELECT channel FROM social_publications WHERE article_id = a.id ORDER BY rowid))";

const entitySelect = (extra = "") => `
  SELECT e.id, e.kind, e.slug, e.name, e.official_url, p.slug AS parent_slug, p.name AS parent_name,
    (SELECT json_group_array(json_object('locale', d.locale, 'description', d.description))
       FROM entity_descriptions d WHERE d.entity_id = e.id) AS descriptions${extra}
  FROM entities e LEFT JOIN entities p ON p.id = e.parent_id`;

const publicationSelect = `
  SELECT s.id, s.channel, s.status, s.message, s.external_url, s.scheduled_for, s.published_at, s.updated_at,
    a.id AS article_id, a.locale AS article_locale, a.slug AS article_slug, a.title AS article_title
  FROM social_publications s JOIN articles a ON a.id = s.article_id`;

const jsonList = (values: readonly unknown[]) => JSON.stringify(values);
const inList = "IN (SELECT value FROM json_each(?))";
/** True for the statements that follow an article write once that write has applied (its `updated_at` is this batch's). */
const articleApplied = "EXISTS (SELECT 1 FROM articles WHERE id = ? AND updated_at = ?)";

function mapArticle(row: ArticleRow): Article {
  return {
    id: row.id,
    translationKey: row.translation_key,
    locale: row.locale,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    content: row.content,
    coverImage: row.cover_image,
    coverAlt: row.cover_alt,
    status: row.status,
    featured: row.featured === 1,
    readingMinutes: row.reading_minutes,
    publishedAt: row.published_at,
    scheduledFor: row.scheduled_for,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    category: {
      id: row.category_id,
      translationKey: row.category_translation_key,
      locale: row.category_locale,
      slug: row.category_slug,
      name: row.category_name,
      description: row.category_description,
    },
    author: {
      id: row.author_id,
      name: row.author_name,
      role: row.author_role,
      initials: row.author_initials,
      avatarUrl: row.author_avatar_url ?? undefined,
    },
    distribution: JSON.parse(row.distribution),
    claimStatus: row.claim_status,
    keyPoints: JSON.parse(row.key_points),
    sources: JSON.parse(row.sources),
    entities: orderEntityRefs(
      (JSON.parse(row.entities) as Array<{ kind: EntityKind; slug: string; name: string; isPrimary: number }>)
        .map((link) => ({ ...link, isPrimary: link.isPrimary === 1 })),
    ),
  };
}

function mapEntity(row: EntityRow): EntityRecord {
  const descriptions = JSON.parse(row.descriptions) as Array<{ locale: Locale; description: string }>;
  return {
    id: row.id,
    kind: row.kind,
    slug: row.slug,
    name: row.name,
    officialUrl: row.official_url,
    parent: row.parent_slug && row.parent_name ? { slug: row.parent_slug, name: row.parent_name } : null,
    descriptions: Object.fromEntries(descriptions.map((item) => [item.locale, item.description])),
  };
}

function mapPublication(row: PublicationRow): DistributionPublication {
  return {
    id: row.id,
    articleId: row.article_id,
    articleLocale: row.article_locale,
    articleSlug: row.article_slug,
    articleTitle: row.article_title,
    channel: row.channel,
    status: row.status,
    message: row.message ?? "",
    externalUrl: row.external_url,
    scheduledFor: row.scheduled_for,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
  };
}

function mapAsset(object: R2Object): MediaAsset {
  const path = object.key.slice(mediaPrefix.length);
  return {
    path,
    url: `${mediaUrlPrefix}${path}`,
    name: object.customMetadata?.originalName ?? path,
    mimeType: object.httpMetadata?.contentType ?? "application/octet-stream",
    size: object.size,
    createdAt: object.uploaded.toISOString(),
  };
}

/** The ISO form that sorts as text; Postgres normalized timestamptz input the same way. */
function toTimestamp(value: string | null | undefined) {
  if (!value) return null;
  const time = Date.parse(value);
  if (Number.isNaN(time)) throw new Error(`Invalid timestamp ${value}`);
  return new Date(time).toISOString();
}

/** The SQL conditions of one query and the values they bind, in order. */
class Where {
  private readonly clauses: string[] = [];
  readonly binds: unknown[] = [];

  add(clause: string, ...binds: unknown[]) {
    this.clauses.push(`(${clause})`);
    this.binds.push(...binds);
    return this;
  }

  get sql() {
    return this.clauses.length ? `WHERE ${this.clauses.join(" AND ")}` : "";
  }
}

/**
 * A websearch-style text (words, "exact phrases", -excluded, a or b) as an FTS5 query, or null when it has no
 * words. Words match by prefix, which stands in for the stemming that Postgres applied.
 */
function toFtsQuery(text: string) {
  const parts: string[] = [];
  const excluded: string[] = [];
  for (const [, minus, phrase, word] of text.matchAll(/(-?)(?:"([^"]*)"|([^\s"]+))/g)) {
    if (!minus && phrase === undefined && word.toLowerCase() === "or" && parts.length && parts.at(-1) !== "OR") {
      parts.push("OR");
      continue;
    }
    const words = (phrase ?? word).match(/[\p{L}\p{N}]+/gu) ?? [];
    if (!words.length) continue;
    const term = phrase === undefined ? words.map((item) => `"${item}"*`).join(" ") : `"${words.join(" ")}"`;
    if (minus) excluded.push(term);
    else parts.push(term);
  }
  if (parts.at(-1) === "OR") parts.pop();
  if (!parts.length) return null;
  return excluded.length ? `(${parts.join(" ")}) NOT (${excluded.join(" OR ")})` : parts.join(" ");
}

function insertInto(database: D1Database, table: string, record: Record<string, unknown>) {
  const columns = Object.keys(record);
  return database
    .prepare(`INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`)
    .bind(...Object.values(record));
}

function assertBatchSize(count: number) {
  if (count < 1 || count > batchLimit) throw new Error(`A batch holds between 1 and ${batchLimit} items`);
}

/** Errors that name the item of a batch, like the Postgres batch functions' "Item <n>: <message>". */
function itemError(context: string, index: number, message: string) {
  return new Error(`${context}: Item ${index + 1}: ${message}`);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export class D1EditorialRepository
  implements
    ArticleRepository,
    CategoryAdminRepository,
    EntityRepository,
    EntityAdminRepository,
    NewsletterRepository,
    DistributionRepository,
    MediaRepository
{
  readonly writable: boolean;
  private readonly articleSql: string;

  constructor(
    private readonly database: D1Database,
    private readonly options: D1EditorialRepositoryOptions,
  ) {
    this.writable = options.media !== null;
    // Distribution channels are editorial workflow state: the public repository must not read them.
    this.articleSql = articleSelect(options.audience === "public" ? "'[]'" : editorialDistribution);
  }

  /** What the anonymous role could not do in Postgres: every write except subscribing. */
  private assertEditorial() {
    if (this.options.audience !== "editorial") throw new Error("Editorial access is required");
  }

  private async getActorAuthorId() {
    const authorId = await this.options.actorAuthorId?.();
    if (!authorId) throw new Error("An authenticated editor is required");
    return authorId;
  }

  private async rows<T>(sql: string, ...binds: unknown[]) {
    return (await this.database.prepare(sql).bind(...binds).all<T>()).results;
  }

  /** Runs the statements as one transaction; a failure says what could not be done, then why. */
  private async batch(context: string, statements: D1PreparedStatement[]) {
    try {
      return await this.database.batch(statements);
    } catch (error) {
      throw new Error(`${context}: ${errorMessage(error)}`, { cause: error });
    }
  }

  // Articles

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
      cover_image: input.coverImage || existing?.coverImage || "/media/neura-agents-hero.webp",
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

  /** The reconciliation of an article's distribution channels with the desired set; published ones stay. */
  private distributionStatements(articleId: string, channels: SocialChannel[], timestamp: string, gated: boolean) {
    const gate = gated ? ` AND ${articleApplied}` : "";
    const gateBinds = gated ? [articleId, timestamp] : [];
    return [
      this.database
        .prepare(
          `DELETE FROM social_publications WHERE article_id = ? AND status <> 'published' AND channel NOT ${inList}${gate}`,
        )
        .bind(articleId, jsonList(channels), ...gateBinds),
      ...[...new Set(channels)].map((channel) =>
        this.database
          .prepare(
            `INSERT INTO social_publications (id, article_id, channel, status, created_at, updated_at)
             SELECT ?, ?, ?, 'ready', ?, ? WHERE 1 = 1${gate} ON CONFLICT (article_id, channel) DO NOTHING`,
          )
          .bind(crypto.randomUUID(), articleId, channel, timestamp, timestamp, ...gateBinds),
      ),
    ];
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
      statements.push(...this.distributionStatements(id, channels, timestamp, true));
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
      this.distributionStatements(id, channels, new Date().toISOString(), false),
    );
  }

  // Categories

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

  // Entities

  async listEntities(locale: Locale, kind?: EntityKind): Promise<EntitySummary[]> {
    const where = new Where();
    if (kind) where.add("e.kind = ?", kind);
    const rows = await this.rows<EntityRow>(
      `${entitySelect(`,
        (SELECT count(*) FROM article_entities l JOIN articles a ON a.id = l.article_id
          WHERE l.entity_id = e.id AND a.locale = ? AND a.status = 'published' AND a.published_at <= ?) AS story_count`)}
       ${where.sql} ORDER BY e.name COLLATE NOCASE, e.slug`,
      locale,
      new Date().toISOString(),
      ...where.binds,
    );
    return rows.map((row) => ({ ...this.toDetail(row, locale), storyCount: row.story_count ?? 0 }));
  }

  private toDetail(row: EntityRow, locale: Locale): EntityDetail {
    const { descriptions, ...entity } = mapEntity(row);
    return { ...entity, description: descriptions[locale] ?? "" };
  }

  async findEntityBySlug(slug: string, locale: Locale) {
    const [row] = await this.rows<EntityRow>(`${entitySelect()} WHERE e.slug = ?`, slug);
    return row ? this.toDetail(row, locale) : null;
  }

  async listEntityTimeline(slug: string, locale: Locale): Promise<EntityTimelineItem[]> {
    const rows = await this.rows<{ slug: string; title: string; claim_status: ClaimStatus; published_at: string }>(
      `SELECT a.slug, a.title, a.claim_status, a.published_at
       FROM articles a
       WHERE a.locale = ? AND a.status = 'published' AND a.published_at <= ?
         AND EXISTS (SELECT 1 FROM article_entities l JOIN entities e ON e.id = l.entity_id WHERE l.article_id = a.id AND e.slug = ?)
       ORDER BY a.published_at, a.id`,
      locale,
      new Date().toISOString(),
      slug,
    );
    return rows.map((row) => ({
      slug: row.slug,
      title: row.title,
      claimStatus: row.claim_status,
      publishedAt: row.published_at,
    }));
  }

  async listEntityRecords() {
    return (await this.rows<EntityRow>(`${entitySelect()} ORDER BY e.name COLLATE NOCASE, e.slug`)).map(mapEntity);
  }

  private async entityRecords(slugs: string[]) {
    const rows = await this.rows<EntityRow>(`${entitySelect()} WHERE e.slug ${inList}`, jsonList(slugs));
    const bySlug = new Map(rows.map(mapEntity).map((record) => [record.slug, record]));
    return slugs.map((slug) => {
      const record = bySlug.get(slug);
      if (!record) throw new Error("Saved entity could not be read back");
      return record;
    });
  }

  /**
   * One entity per item, in order. The parent is looked up when its item is written, so it may be an
   * earlier item of the same batch (`create`); an unknown parent is refused before anything is written.
   */
  private async writeEntities(items: EntityWrite[], create: boolean, context: string) {
    this.assertEditorial();
    assertBatchSize(items.length);
    const stored = new Set(
      (await this.rows<{ slug: string }>(
        `SELECT slug FROM entities WHERE slug ${inList}`,
        jsonList([...items.map((item) => item.slug), ...items.flatMap((item) => (item.parentSlug ? [item.parentSlug] : []))]),
      )).map((row) => row.slug),
    );
    const timestamp = new Date().toISOString();
    const statements = items.flatMap((item, index) => {
      if (item.parentSlug && !stored.has(item.parentSlug)) {
        throw itemError(context, index, `Unknown parent entity ${item.parentSlug}`);
      }
      const parent = "(SELECT id FROM entities WHERE slug = ?)";
      const descriptions = Object.entries(item.descriptions);
      if (create) {
        const id = crypto.randomUUID();
        stored.add(item.slug);
        return [
          this.database
            .prepare(
              `INSERT INTO entities (id, kind, slug, name, official_url, parent_id, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ${parent}, ?, ?)`,
            )
            .bind(id, item.kind, item.slug, item.name, item.officialUrl, item.parentSlug, timestamp, timestamp),
          ...descriptions.map(([locale, description]) =>
            insertInto(this.database, "entity_descriptions", { entity_id: id, locale, description }),
          ),
        ];
      }
      if (!stored.has(item.slug)) throw itemError(context, index, `Entity "${item.slug}" not found`);
      return [
        this.database
          .prepare(`UPDATE entities SET kind = ?, name = ?, official_url = ?, parent_id = ${parent}, updated_at = ? WHERE slug = ?`)
          .bind(item.kind, item.name, item.officialUrl, item.parentSlug, timestamp, item.slug),
        // A locale absent from the item loses its description.
        this.database
          .prepare(
            `DELETE FROM entity_descriptions WHERE locale NOT ${inList} AND entity_id = (SELECT id FROM entities WHERE slug = ?)`,
          )
          .bind(jsonList(descriptions.map(([locale]) => locale)), item.slug),
        ...descriptions.map(([locale, description]) =>
          this.database
            .prepare(
              `INSERT INTO entity_descriptions (entity_id, locale, description) SELECT id, ?, ? FROM entities WHERE slug = ?
               ON CONFLICT (entity_id, locale) DO UPDATE SET description = excluded.description`,
            )
            .bind(locale, description, item.slug),
        ),
      ];
    });
    await this.batch(context, statements);
    return this.entityRecords(items.map((item) => item.slug));
  }

  async createEntities(items: EntityWrite[]) {
    return this.writeEntities(items, true, "Unable to create entities");
  }

  async updateEntities(items: EntityWrite[]) {
    return this.writeEntities(items, false, "Unable to update entities");
  }

  async deleteEntities(slugs: string[]) {
    this.assertEditorial();
    const context = "Unable to delete entities";
    assertBatchSize(slugs.length);
    const rows = await this.rows<{ slug: string; stories: number; children: string }>(
      `SELECT e.slug, (SELECT count(*) FROM article_entities WHERE entity_id = e.id) AS stories,
         (SELECT json_group_array(c.slug) FROM entities c WHERE c.parent_id = e.id) AS children
       FROM entities e WHERE e.slug ${inList}`,
      jsonList(slugs),
    );
    const info = new Map(rows.map((row) => [row.slug, row]));
    // Items are removed in order, so a company may follow its own models and products in one batch.
    const removed = new Set<string>();
    slugs.forEach((slug, index) => {
      const row = info.get(slug);
      if (!row || removed.has(slug)) throw itemError(context, index, `Entity "${slug}" not found`);
      if (row.stories > 0) throw itemError(context, index, `Entity "${slug}" is linked to ${row.stories} stories`);
      const children = (JSON.parse(row.children) as string[]).filter((child) => !removed.has(child));
      if (children.length) {
        throw itemError(context, index, `Entity "${slug}" is the parent of ${children.length} entities`);
      }
      removed.add(slug);
    });
    await this.batch(
      context,
      slugs.map((slug) => this.database.prepare("DELETE FROM entities WHERE slug = ?").bind(slug)),
    );
  }

  async countEntityStories(slugs: string[]) {
    const editorial = this.options.audience === "editorial";
    const rows = await this.rows<{ slug: string; total: number }>(
      `SELECT e.slug, count(a.id) AS total
       FROM entities e
       LEFT JOIN article_entities l ON l.entity_id = e.id
       LEFT JOIN articles a ON a.id = l.article_id${editorial ? "" : " AND a.status = 'published' AND a.published_at <= ?"}
       WHERE e.slug ${inList} GROUP BY e.slug`,
      ...(editorial ? [] : [new Date().toISOString()]),
      jsonList(slugs),
    );
    const totals = new Map(rows.map((row) => [row.slug, row.total]));
    return new Map(slugs.map((slug) => [slug, totals.get(slug) ?? 0]));
  }

  // Newsletter: subscribers live in the newsletter adapter.

  subscribe(email: string, source: string, locale: Locale) {
    return this.options.newsletter.subscribe(email, source, locale);
  }

  async listSubscriptions(query: NewsletterQuery) {
    this.assertEditorial();
    return this.options.newsletter.listSubscriptions(query);
  }

  async updateSubscriptionStatus(id: string, status: "unsubscribed") {
    this.assertEditorial();
    return this.options.newsletter.updateSubscriptionStatus(id, status);
  }

  // Distribution

  async listPublications(locale: Locale) {
    // social_publications was readable by editors and the service role only.
    if (this.options.audience !== "editorial") return [];
    const rows = await this.rows<PublicationRow>(
      `${publicationSelect} WHERE a.locale = ? ORDER BY s.updated_at DESC, s.id DESC LIMIT 200`,
      locale,
    );
    return rows.map(mapPublication);
  }

  async updatePublication(input: DistributionUpdate) {
    this.assertEditorial();
    if (!distributionStatuses.includes(input.status)) throw new Error("Unable to update distribution publication: Invalid distribution status");
    const timestamp = new Date().toISOString();
    const [updated] = await this.batch("Unable to update distribution publication", [
      this.database
        .prepare(
          `UPDATE social_publications SET status = ?, message = nullif(trim(?), ''), external_url = nullif(trim(?), ''),
             scheduled_for = ?, updated_at = ?,
             published_at = CASE WHEN ? = 'published' THEN COALESCE(published_at, ?) ELSE NULL END
           WHERE id = ? RETURNING id`,
        )
        .bind(
          input.status,
          input.message?.trim() || null,
          input.externalUrl || null,
          toTimestamp(input.scheduledFor),
          timestamp,
          input.status,
          timestamp,
          input.id,
        ),
    ]);
    if (!updated.results.length) throw new Error("Unable to update distribution publication: Distribution publication not found");
    const [row] = await this.rows<PublicationRow>(`${publicationSelect} WHERE s.id = ?`, input.id);
    return mapPublication(row);
  }

  // Media

  private requireBucket() {
    if (!this.options.media) throw new Error("Media storage is not configured");
    return this.options.media;
  }

  async listAssets() {
    const bucket = this.options.media;
    if (!bucket || this.options.audience !== "editorial") return [];
    const objects: R2Object[] = [];
    let cursor: string | undefined;
    do {
      // `include` makes R2 return the content type and the original name along with each key.
      const page = await bucket.list({ prefix: mediaPrefix, cursor, include: ["httpMetadata", "customMetadata"] });
      objects.push(...page.objects.filter((object) => isMediaPath(object.key.slice(mediaPrefix.length))));
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
    return objects
      .sort((left, right) => right.uploaded.getTime() - left.uploaded.getTime())
      .slice(0, listedAssets)
      .map(mapAsset);
  }

  async isAssetReferenced(path: string) {
    const rows = await this.rows<{ cover_image: string }>("SELECT cover_image FROM articles WHERE instr(cover_image, ?) > 0", path);
    return rows.some(({ cover_image: cover }) => {
      const source = cover.replace(/[?#][\s\S]*$/, "");
      return source === path || source.endsWith(`${mediaUrlPrefix}${path}`);
    });
  }

  async uploadAsset(input: MediaUpload) {
    this.assertEditorial();
    const bucket = this.requireBucket();
    if (!allowedMediaTypes.has(input.mimeType)) throw new Error("Unable to upload media asset: mime type is not supported");
    if (input.bytes.byteLength > maxMediaBytes) {
      throw new Error("Unable to upload media asset: the object exceeded the maximum allowed size");
    }
    const extension = input.mimeType.split("/")[1].replace("jpeg", "jpg");
    const path = `${crypto.randomUUID()}.${extension}`;
    try {
      await bucket.put(`${mediaPrefix}${path}`, input.bytes, {
        httpMetadata: { contentType: input.mimeType, cacheControl: "public, max-age=31536000, immutable" },
        customMetadata: { originalName: input.name.slice(0, 200) },
      });
    } catch (error) {
      throw new Error(`Unable to upload media asset: ${errorMessage(error)}`, { cause: error });
    }
    return {
      path,
      url: `${mediaUrlPrefix}${path}`,
      name: input.name,
      mimeType: input.mimeType,
      size: input.bytes.byteLength,
      createdAt: new Date().toISOString(),
    };
  }

  async deleteAsset(path: string) {
    return this.deleteAssets([path]);
  }

  /** Like the storage policy: an asset that does not exist, or that an article still uses as its cover, is not removed. */
  async deleteAssets(paths: string[]) {
    this.assertEditorial();
    const bucket = this.requireBucket();
    const failure = new Error("Unable to delete media assets");
    if (!paths.every(isMediaPath)) throw failure;
    const stored = await Promise.all(paths.map((path) => bucket.head(`${mediaPrefix}${path}`)));
    if (stored.some((object) => object === null)) throw failure;
    const referenced = await Promise.all(paths.map((path) => this.isAssetReferenced(path)));
    if (referenced.some(Boolean)) throw failure;
    try {
      await bucket.delete(paths.map((path) => `${mediaPrefix}${path}`));
    } catch (error) {
      throw new Error(`Unable to delete media assets: ${errorMessage(error)}`, { cause: error });
    }
  }
}
