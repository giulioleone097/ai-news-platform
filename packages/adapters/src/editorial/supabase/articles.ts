import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  articleStatuses,
  claimStatuses,
  currentCoverImage,
  defaultCoverImage,
  estimateReadingMinutes,
  normalizeStoryFields,
  orderEntityRefs,
  slugify,
  socialChannels,
  type Article,
  type ArticleDraftInput,
  type ArticleQuery,
  type SocialChannel,
  type StudioArticleFilter,
} from "@atlasnews/core/editorial/domain/article";
import type { ArticleRepository } from "@atlasnews/core/editorial/domain/article-repository";
import { entityKinds } from "@atlasnews/core/editorial/domain/entity";
import { distributionStatuses } from "@atlasnews/core/editorial/domain/editorial-operations";
import { locales, type Locale } from "@atlasnews/core/locale";
import { isUuid, throwIfError } from "../../supabase/errors";
import { categorySchema, relationOne, type EditorialRepositoryOptions } from "./shared";

const authorSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  initials: z.string(),
  avatar_url: z.string().nullable(),
});

const linkedEntitySchema = z.object({
  kind: z.enum(entityKinds),
  slug: z.string(),
  name: z.string(),
});

const sourceNoteSchema = z.object({
  title: z.string(),
  url: z.string(),
  supports: z.string(),
});

const rawArticleSchema = z.object({
  id: z.string(),
  translation_key: z.string(),
  locale: z.enum(locales),
  slug: z.string(),
  title: z.string(),
  excerpt: z.string(),
  content: z.string(),
  cover_image: z.string(),
  cover_alt: z.string(),
  status: z.enum(articleStatuses),
  featured: z.boolean(),
  reading_minutes: z.number(),
  published_at: z.string().nullable(),
  scheduled_for: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  category: z.union([categorySchema, z.array(categorySchema)]),
  author: z.union([authorSchema, z.array(authorSchema)]),
  distribution: z
    .array(z.object({ channel: z.enum(socialChannels) }))
    .nullable()
    .optional(),
  claim_status: z.enum(claimStatuses),
  key_points: z.array(z.string()),
  sources: z.array(sourceNoteSchema),
  entities: z
    .array(z.object({
      is_primary: z.boolean(),
      entity: z.union([linkedEntitySchema, z.array(linkedEntitySchema)]),
    }))
    .nullable()
    .optional(),
});

const publicArticleSelect = `
  id, translation_key, locale, slug, title, excerpt, content, cover_image, cover_alt, status,
  featured, reading_minutes, published_at, scheduled_for, created_at, updated_at,
  category:categories!inner(id, translation_key, locale, slug, name, description),
  author:authors!inner(id, name, role, initials, avatar_url),
  claim_status, key_points, sources,
  entities:article_entities(is_primary, entity:entities(kind, slug, name))
`;

// Distribution channels are editorial workflow state: social_publications is readable by editors
// and the service role only, so the public (anon) repository must not embed it.
const editorialArticleSelect = `${publicArticleSelect}, distribution:social_publications(channel)`;

// An inner join on a second embed keeps the articles of one entity without narrowing `entities`.
const entityFilterEmbed = "entity_filter:article_entities!inner(entity:entities!inner(slug))";

const supabaseCursorSchema = z.object({
  publishedAt: z.iso.datetime(),
  id: z.uuid(),
});

function mapArticle(value: unknown): Article {
  const row = rawArticleSchema.parse(value);
  const category = relationOne(row.category);
  const author = relationOne(row.author);

  return {
    id: row.id,
    translationKey: row.translation_key,
    locale: row.locale,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    content: row.content,
    coverImage: currentCoverImage(row.cover_image),
    coverAlt: row.cover_alt,
    status: row.status,
    featured: row.featured,
    readingMinutes: row.reading_minutes,
    publishedAt: row.published_at,
    scheduledFor: row.scheduled_for,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    category: {
      id: category.id,
      translationKey: category.translation_key,
      locale: category.locale,
      slug: category.slug,
      name: category.name,
      description: category.description ?? "",
    },
    author: {
      id: author.id,
      name: author.name,
      role: author.role,
      initials: author.initials,
      avatarUrl: author.avatar_url ?? undefined,
    },
    distribution: row.distribution?.map((item) => item.channel) ?? [],
    claimStatus: row.claim_status,
    keyPoints: row.key_points,
    sources: row.sources,
    entities: orderEntityRefs(
      (row.entities ?? []).map((link) => ({ ...relationOne(link.entity), isPrimary: link.is_primary })),
    ),
  };
}

/** Articles, their category list, publication state and distribution channels. */
export class SupabaseArticleRepository implements ArticleRepository {
  private readonly articleSelect: string;
  private readonly actorAuthorId: string | undefined;

  constructor(
    private readonly client: SupabaseClient,
    options: EditorialRepositoryOptions,
  ) {
    this.articleSelect = options.audience === "public" ? publicArticleSelect : editorialArticleSelect;
    this.actorAuthorId = options.authorId;
  }

  private async getActorAuthorId() {
    if (this.actorAuthorId) return this.actorAuthorId;

    const { data: authData, error: authError } = await this.client.auth.getUser();
    throwIfError(authError, "Unable to identify editor");
    if (!authData.user) throw new Error("An authenticated editor is required");

    const { data: profile, error: profileError } = await this.client
      .from("profiles")
      .select("author_id")
      .eq("id", authData.user.id)
      .single();
    throwIfError(profileError, "Editor profile is incomplete");
    return profile.author_id;
  }

  async listPublished(input: ArticleQuery) {
    const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);
    let query = this.client
      .from("articles")
      .select(input.entity ? `${this.articleSelect}, ${entityFilterEmbed}` : this.articleSelect)
      .eq("locale", input.locale)
      .eq("status", "published")
      .lte("published_at", new Date().toISOString())
      .order("published_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit + 1);

    if (input.category) query = query.eq("category.slug", input.category);
    if (input.entity) query = query.eq("entity_filter.entity.slug", input.entity);
    if (input.claimStatus) query = query.eq("claim_status", input.claimStatus);
    if (input.query?.trim()) {
      query = query.textSearch("search_vector", input.query.trim(), {
        config: input.locale === "it" ? "italian" : "english",
        type: "websearch",
      });
    }
    if (input.cursor) {
      const cursor = supabaseCursorSchema.parse(input.cursor);
      query = query.or(
        `published_at.lt.${cursor.publishedAt},and(published_at.eq.${cursor.publishedAt},id.lt.${cursor.id})`,
      );
    }

    const { data, error } = await query;
    throwIfError(error, "Unable to list published articles");
    const parsed = (data ?? []).map(mapArticle);
    const items = parsed.slice(0, limit);
    const last = items.at(-1);

    return {
      items,
      nextCursor:
        parsed.length > limit && last?.publishedAt
          ? { id: last.id, publishedAt: last.publishedAt }
          : null,
    };
  }

  async listForStudio(locale: Locale, filter: StudioArticleFilter = {}) {
    let query = this.client
      .from("articles")
      .select(filter.entity ? `${this.articleSelect}, ${entityFilterEmbed}` : this.articleSelect)
      .eq("locale", locale)
      .order("updated_at", { ascending: false })
      .limit(100);
    if (filter.status) query = query.eq("status", filter.status);
    if (filter.category) query = query.eq("category.slug", filter.category);
    if (filter.entity) query = query.eq("entity_filter.entity.slug", filter.entity);
    if (filter.claimStatus) query = query.eq("claim_status", filter.claimStatus);
    if (filter.query?.trim()) {
      query = query.textSearch("search_vector", filter.query.trim(), {
        config: locale === "it" ? "italian" : "english",
        type: "websearch",
      });
    }
    const { data, error } = await query;
    throwIfError(error, "Unable to list studio articles");
    return (data ?? []).map(mapArticle);
  }

  private async findByIds(ids: string[]) {
    const { data, error } = await this.client.from("articles").select(this.articleSelect).in("id", ids);
    throwIfError(error, "Unable to read articles");
    const byId = new Map((data ?? []).map(mapArticle).map((article) => [article.id, article]));
    return ids.map((id) => {
      const article = byId.get(id);
      if (!article) throw new Error("Saved article could not be read back");
      return article;
    });
  }

  async findBySlug(slug: string, locale: Locale) {
    const { data, error } = await this.client
      .from("articles")
      .select(this.articleSelect)
      .eq("locale", locale)
      .eq("slug", slug)
      .maybeSingle();
    throwIfError(error, "Unable to read article");
    return data ? mapArticle(data) : null;
  }

  async findById(id: string, locale: Locale) {
    if (!isUuid(id)) return null;
    const { data, error } = await this.client
      .from("articles")
      .select(this.articleSelect)
      .eq("locale", locale)
      .eq("id", id)
      .maybeSingle();
    throwIfError(error, "Unable to read article");
    return data ? mapArticle(data) : null;
  }

  async findByTranslationKey(translationKey: string, locale: Locale) {
    const { data, error } = await this.client
      .from("articles")
      .select(this.articleSelect)
      .eq("locale", locale)
      .eq("translation_key", translationKey)
      .maybeSingle();
    throwIfError(error, "Unable to read article");
    return data ? mapArticle(data) : null;
  }

  async listCategories(locale: Locale) {
    const { data, error } = await this.client
      .from("categories")
      .select("id, translation_key, locale, slug, name, description")
      .eq("locale", locale)
      .order("position");
    throwIfError(error, "Unable to list categories");
    return z.array(categorySchema).parse(data ?? []).map((item) => ({
      id: item.id,
      translationKey: item.translation_key,
      locale: item.locale,
      slug: item.slug,
      name: item.name,
      description: item.description ?? "",
    }));
  }

  /** The columns of `save_article_with_distribution`, without the `p_` prefix, for one article. */
  private articleRow(
    input: ArticleDraftInput,
    categoryId: string,
    authorId: string,
    existing: Article | null,
  ) {
    const story = normalizeStoryFields(input);
    const entityLinks = story.entities ?? existing?.entities.map(({ slug, isPrimary }) => ({ slug, isPrimary })) ?? [];
    const timestamp = new Date().toISOString();
    const status = input.status;
    return {
      id: input.id ?? null,
      // A key the caller names links the article to its translation; without one the article keeps its own.
      translation_key: input.translationKey ?? existing?.translationKey ?? crypto.randomUUID(),
      locale: input.locale,
      slug: slugify(input.slug || input.title),
      title: input.title.trim(),
      excerpt: input.excerpt.trim(),
      content: input.content.trim(),
      cover_image: input.coverImage || existing?.coverImage || defaultCoverImage,
      cover_alt:
        input.coverAlt ||
        existing?.coverAlt ||
        (input.locale === "it" ? `Immagine per ${input.title}` : `Image for ${input.title}`),
      status,
      category_id: categoryId,
      author_id: authorId,
      featured: Boolean(input.featured),
      reading_minutes: estimateReadingMinutes(input.content),
      published_at: status === "published" ? existing?.publishedAt ?? timestamp : existing?.publishedAt ?? null,
      scheduled_for: status === "scheduled" ? input.scheduledFor ?? null : null,
      distribution: input.distribution ?? [],
      claim_status: story.claimStatus ?? existing?.claimStatus ?? "analysis",
      key_points: story.keyPoints ?? existing?.keyPoints ?? [],
      sources: story.sources ?? existing?.sources ?? [],
      entities: entityLinks.map((link) => ({ slug: link.slug, is_primary: link.isPrimary })),
    };
  }

  async save(input: ArticleDraftInput) {
    const [{ data: category, error: categoryError }, authorId] = await Promise.all([
        this.client
          .from("categories")
          .select("id")
          .eq("locale", input.locale)
          .eq("slug", input.categorySlug)
          .single(),
        this.getActorAuthorId(),
      ]);
    throwIfError(categoryError, "Unknown article category");

    const existing = input.id ? await this.findById(input.id, input.locale) : null;
    if (input.id && !existing) {
      throw new Error(`Article ${input.id} does not exist in locale ${input.locale}`);
    }
    const row = this.articleRow(input, category.id, authorId, existing);
    const { data, error } = await this.client.rpc(
      "save_article_with_distribution",
      Object.fromEntries(Object.entries(row).map(([column, value]) => [`p_${column}`, value])),
    );
    throwIfError(error, "Unable to save article");
    const articleId = z.string().uuid().parse(data);
    const article = await this.findById(articleId, input.locale);
    if (!article) throw new Error("Saved article could not be read back");
    return article;
  }

  async saveMany(inputs: ArticleDraftInput[]) {
    const authorId = await this.getActorAuthorId();
    const { data: categories, error: categoryError } = await this.client
      .from("categories")
      .select("id, locale, slug")
      .in("locale", [...new Set(inputs.map((input) => input.locale))])
      .in("slug", [...new Set(inputs.map((input) => input.categorySlug))]);
    throwIfError(categoryError, "Unable to read article categories");
    const categoryIds = new Map(
      z.array(z.object({ id: z.string(), locale: z.string(), slug: z.string() })).parse(categories ?? [])
        .map((row) => [`${row.locale}/${row.slug}`, row.id]),
    );
    const existing = await Promise.all(inputs.map((input) => (input.id ? this.findById(input.id, input.locale) : null)));
    const rows = inputs.map((input, index) => {
      const categoryId = categoryIds.get(`${input.locale}/${input.categorySlug}`);
      if (!categoryId) throw new Error(`Unknown article category ${input.categorySlug}`);
      if (input.id && !existing[index]) throw new Error(`Article ${input.id} does not exist in locale ${input.locale}`);
      return this.articleRow(input, categoryId, authorId, existing[index]);
    });
    const { data, error } = await this.client.rpc("save_articles_batch", { p_items: rows });
    throwIfError(error, "Unable to save articles");
    return this.findByIds(z.array(z.string().uuid()).parse(data));
  }

  async setPublished(ids: string[], published: boolean) {
    const { data, error } = await this.client.rpc("publish_articles_batch", {
      p_ids: ids,
      p_published: published,
    });
    throwIfError(error, published ? "Unable to publish articles" : "Unable to unpublish articles");
    return this.findByIds(z.array(z.string().uuid()).parse(data));
  }

  async deleteMany(ids: string[]) {
    const { data, error } = await this.client.rpc("delete_articles_batch", { p_ids: ids });
    throwIfError(error, "Unable to delete articles");
    if (data !== new Set(ids).size) throw new Error("Unable to delete articles");
  }

  async delete(id: string) {
    const { error } = await this.client.from("articles").delete().eq("id", id);
    throwIfError(error, "Unable to delete article");
  }

  async setDistributionChannels(id: string, channels: SocialChannel[]) {
    const desired = new Set(channels);
    const { data: existingRows, error: existingError } = await this.client
      .from("social_publications")
      .select("channel, status")
      .eq("article_id", id);
    throwIfError(existingError, "Unable to read distribution channels");
    const existing = z.array(z.object({
      channel: z.enum(socialChannels),
      status: z.enum(distributionStatuses),
    })).parse(existingRows ?? []);

    const removable = existing
      .filter((item) => item.status !== "published" && !desired.has(item.channel))
      .map((item) => item.channel);
    if (removable.length) {
      const { error } = await this.client
        .from("social_publications")
        .delete()
        .eq("article_id", id)
        .in("channel", removable);
      throwIfError(error, "Unable to reset distribution channels");
    }

    const existingChannels = new Set(existing.map((item) => item.channel));
    const insertable = [...desired].filter((channel) => !existingChannels.has(channel));
    if (!insertable.length) return;
    const { error } = await this.client.from("social_publications").insert(
      insertable.map((channel) => ({ article_id: id, channel, status: "ready" })),
    );
    throwIfError(error, "Unable to save distribution channels");
  }
}
