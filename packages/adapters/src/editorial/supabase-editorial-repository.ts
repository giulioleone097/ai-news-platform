import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  articleStatuses,
  claimStatuses,
  estimateReadingMinutes,
  normalizeStoryFields,
  orderEntityRefs,
  slugify,
  socialChannels,
  type Article,
  type ArticleDraftInput,
  type ArticleQuery,
  type SocialChannel,
} from "@atlasnews/core/editorial/domain/article";
import { entityKinds } from "@atlasnews/core/editorial/domain/entity";
import type {
  EntityDetail,
  EntityKind,
  EntityRepository,
  EntitySummary,
  EntityTimelineItem,
} from "@atlasnews/core/editorial/domain/entity";
import type {
  ArticleRepository,
  DistributionRepository,
  MediaRepository,
  NewsletterRepository,
} from "@atlasnews/core/editorial/domain/article-repository";
import {
  distributionStatuses,
  isEditorSettableNewsletterStatus,
  newsletterStatuses,
  type DistributionPublication,
  type DistributionUpdate,
  type MediaUpload,
  type NewsletterQuery,
  type NewsletterStatus,
} from "@atlasnews/core/editorial/domain/editorial-operations";
import { locales, type Locale } from "@atlasnews/core/locale";

const categorySchema = z.object({
  id: z.string(),
  translation_key: z.string(),
  locale: z.enum(locales),
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
});

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

const entityRowSchema = z.object({
  id: z.string(),
  kind: z.enum(entityKinds),
  slug: z.string(),
  name: z.string(),
  official_url: z.string().nullable(),
  parent: z.union([
    z.object({ slug: z.string(), name: z.string() }),
    z.array(z.object({ slug: z.string(), name: z.string() })),
  ]).nullable(),
  descriptions: z.array(z.object({ locale: z.enum(locales), description: z.string() })),
});

const entitySelect = `
  id, kind, slug, name, official_url,
  parent:parent_id(slug, name),
  descriptions:entity_descriptions(locale, description)
`;

const supabaseCursorSchema = z.object({
  publishedAt: z.iso.datetime(),
  id: z.uuid(),
});

const publicationSchema = z.object({
  id: z.string(),
  channel: z.enum(socialChannels),
  status: z.enum(distributionStatuses),
  message: z.string().nullable(),
  external_url: z.string().nullable(),
  scheduled_for: z.string().nullable(),
  published_at: z.string().nullable(),
  updated_at: z.string(),
  article: z.union([
    z.object({
      id: z.string(),
      locale: z.enum(locales),
      slug: z.string(),
      title: z.string(),
    }),
    z.array(z.object({
      id: z.string(),
      locale: z.enum(locales),
      slug: z.string(),
      title: z.string(),
    })),
  ]),
});

const newsletterSubscriptionSchema = z.object({
  id: z.string(),
  email: z.string(),
  source: z.string(),
  locale: z.enum(locales),
  status: z.enum(newsletterStatuses),
  consented_at: z.string(),
  unsubscribed_at: z.string().nullable(),
  created_at: z.string(),
});

const mediaBucket = "editorial-media";

function relationOne<T>(value: T | T[]) {
  return Array.isArray(value) ? value[0] : value;
}

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
    coverImage: row.cover_image,
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

function mapEntity(value: unknown, locale: Locale): EntityDetail {
  const row = entityRowSchema.parse(value);
  const parent = row.parent ? relationOne(row.parent) : null;
  return {
    id: row.id,
    kind: row.kind,
    slug: row.slug,
    name: row.name,
    officialUrl: row.official_url,
    parent: parent ? { slug: parent.slug, name: parent.name } : null,
    description: row.descriptions.find((item) => item.locale === locale)?.description ?? "",
  };
}

function mapPublication(value: unknown): DistributionPublication {
  const row = publicationSchema.parse(value);
  const article = relationOne(row.article);
  return {
    id: row.id,
    articleId: article.id,
    articleLocale: article.locale,
    articleSlug: article.slug,
    articleTitle: article.title,
    channel: row.channel,
    status: row.status,
    message: row.message ?? "",
    externalUrl: row.external_url,
    scheduledFor: row.scheduled_for,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
  };
}

function throwIfError(error: { message: string } | null, context: string): asserts error is null {
  if (error) throw new Error(`${context}: ${error.message}`);
}

export type EditorialRepositoryOptions = {
  /** `public` serves the anonymous site and omits editor-only data; `editorial` serves Studio and admin MCP. */
  audience: "public" | "editorial";
  /** Author recorded for writes made with a service-role client, which has no signed-in editor. */
  authorId?: string;
};

export class SupabaseEditorialRepository
  implements ArticleRepository, EntityRepository, NewsletterRepository, DistributionRepository, MediaRepository
{
  readonly writable = true;
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

  async listForStudio(locale: Locale) {
    const { data, error } = await this.client
      .from("articles")
      .select(this.articleSelect)
      .eq("locale", locale)
      .order("updated_at", { ascending: false })
      .limit(100);
    throwIfError(error, "Unable to list studio articles");
    return (data ?? []).map(mapArticle);
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
    const { data, error } = await this.client
      .from("articles")
      .select(this.articleSelect)
      .eq("locale", locale)
      .eq("id", id)
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
    const story = normalizeStoryFields(input);
    const entityLinks = story.entities ?? existing?.entities.map(({ slug, isPrimary }) => ({ slug, isPrimary })) ?? [];
    const timestamp = new Date().toISOString();
    const payload = {
      translation_key: existing?.translationKey ?? input.translationKey ?? crypto.randomUUID(),
      locale: input.locale,
      slug: slugify(input.slug || input.title),
      title: input.title.trim(),
      excerpt: input.excerpt.trim(),
      content: input.content.trim(),
      cover_image: input.coverImage || existing?.coverImage || "/media/neura-agents-hero.webp",
      cover_alt:
        input.coverAlt ||
        existing?.coverAlt ||
        (input.locale === "it" ? `Immagine per ${input.title}` : `Image for ${input.title}`),
      status: input.status,
      category_id: category.id,
      author_id: authorId,
      featured: Boolean(input.featured),
      reading_minutes: estimateReadingMinutes(input.content),
      published_at:
        input.status === "published" ? existing?.publishedAt ?? timestamp : existing?.publishedAt,
      scheduled_for: input.status === "scheduled" ? input.scheduledFor ?? null : null,
    };

    const { data, error } = await this.client.rpc("save_article_with_distribution", {
      p_id: input.id ?? null,
      p_translation_key: payload.translation_key,
      p_locale: payload.locale,
      p_slug: payload.slug,
      p_title: payload.title,
      p_excerpt: payload.excerpt,
      p_content: payload.content,
      p_cover_image: payload.cover_image,
      p_cover_alt: payload.cover_alt,
      p_status: payload.status,
      p_category_id: payload.category_id,
      p_author_id: payload.author_id,
      p_featured: payload.featured,
      p_reading_minutes: payload.reading_minutes,
      p_published_at: payload.published_at ?? null,
      p_scheduled_for: payload.scheduled_for,
      p_distribution: input.distribution ?? [],
      p_claim_status: story.claimStatus ?? existing?.claimStatus ?? "analysis",
      p_key_points: story.keyPoints ?? existing?.keyPoints ?? [],
      p_sources: story.sources ?? existing?.sources ?? [],
      p_entities: entityLinks.map((link) => ({ slug: link.slug, is_primary: link.isPrimary })),
    });
    throwIfError(error, "Unable to save article");
    const articleId = z.string().uuid().parse(data);
    const article = await this.findById(articleId, input.locale);
    if (!article) throw new Error("Saved article could not be read back");
    return article;
  }

  async listEntities(locale: Locale, kind?: EntityKind): Promise<EntitySummary[]> {
    let query = this.client.from("entities").select(entitySelect).order("name");
    if (kind) query = query.eq("kind", kind);
    const [{ data, error }, counts] = await Promise.all([query, this.publishedStoryCounts(locale)]);
    throwIfError(error, "Unable to list entities");
    return (data ?? []).map((row) => {
      const entity = mapEntity(row, locale);
      return { ...entity, storyCount: counts.get(entity.id) ?? 0 };
    });
  }

  private async publishedStoryCounts(locale: Locale) {
    const { data, error } = await this.client.rpc("entity_story_counts", { p_locale: locale });
    throwIfError(error, "Unable to count entity stories");
    return new Map(
      z.array(z.object({ entity_id: z.string(), story_count: z.coerce.number() })).parse(data ?? [])
        .map((row) => [row.entity_id, row.story_count]),
    );
  }

  async findEntityBySlug(slug: string, locale: Locale) {
    const { data, error } = await this.client
      .from("entities")
      .select(entitySelect)
      .eq("slug", slug)
      .maybeSingle();
    throwIfError(error, "Unable to read entity");
    return data ? mapEntity(data, locale) : null;
  }

  async listEntityTimeline(slug: string, locale: Locale): Promise<EntityTimelineItem[]> {
    const { data, error } = await this.client
      .from("articles")
      .select("slug, title, claim_status, published_at, entity_filter:article_entities!inner(entity:entities!inner(slug))")
      .eq("entity_filter.entity.slug", slug)
      .eq("locale", locale)
      .eq("status", "published")
      .lte("published_at", new Date().toISOString())
      .order("published_at", { ascending: true })
      .order("id", { ascending: true });
    throwIfError(error, "Unable to read entity timeline");
    return z.array(z.object({
      slug: z.string(),
      title: z.string(),
      claim_status: z.enum(claimStatuses),
      published_at: z.string(),
    })).parse(data ?? []).map((row) => ({
      slug: row.slug,
      title: row.title,
      claimStatus: row.claim_status,
      publishedAt: row.published_at,
    }));
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

  async subscribe(email: string, source: string, locale: Locale) {
    const { error } = await this.client.rpc("subscribe_newsletter", {
      p_email: email,
      p_source: source,
      p_locale: locale,
    });
    throwIfError(error, "Unable to subscribe");
  }

  async listSubscriptions(input: NewsletterQuery) {
    const limit = Math.min(Math.max(input.limit ?? 100, 1), 1_000);
    const offset = Math.max(input.offset ?? 0, 0);
    let query = this.client
      .from("newsletter_subscriptions")
      .select(
        "id, email, source, locale, status, consented_at, unsubscribed_at, created_at",
        { count: "exact" },
      )
      .eq("locale", input.locale)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });
    if (input.status) query = query.eq("status", input.status);
    if (input.query?.trim()) query = query.ilike("email", `%${input.query.trim()}%`);
    const { count, data, error } = await query.range(offset, offset + limit - 1);
    throwIfError(error, "Unable to list newsletter subscriptions");
    if (count === null) throw new Error("Unable to count newsletter subscriptions");
    const items = z.array(newsletterSubscriptionSchema).parse(data ?? []).map((item) => ({
      id: item.id,
      email: item.email,
      source: item.source,
      locale: item.locale,
      status: item.status,
      consentedAt: item.consented_at,
      unsubscribedAt: item.unsubscribed_at,
      createdAt: item.created_at,
    }));
    return {
      items,
      total: count,
      offset,
      limit,
      hasMore: offset + items.length < count,
    };
  }

  async updateSubscriptionStatus(id: string, status: NewsletterStatus) {
    // The function below only unsubscribes (and refuses suppressed rows), whatever status is asked for.
    if (!isEditorSettableNewsletterStatus(status)) {
      throw new Error("Newsletter reactivation requires double opt-in");
    }
    const { data, error } = await this.client.rpc(
      "admin_unsubscribe_newsletter_subscription",
      { p_subscription_id: id },
    );
    throwIfError(error, "Unable to update newsletter subscription");
    if (data !== true) throw new Error("Unable to update newsletter subscription");
  }

  async listPublications(locale: Locale) {
    const { data, error } = await this.client
      .from("social_publications")
      .select(`
        id, channel, status, message, external_url, scheduled_for, published_at, updated_at,
        article:articles!inner(id, locale, slug, title)
      `)
      .eq("article.locale", locale)
      .order("updated_at", { ascending: false })
      .limit(200);
    throwIfError(error, "Unable to list distribution publications");
    return (data ?? []).map(mapPublication);
  }

  async updatePublication(input: DistributionUpdate) {
    const { error: updateError } = await this.client.rpc("update_distribution_publication", {
      p_id: input.id,
      p_status: input.status,
      p_message: input.message?.trim() || null,
      p_external_url: input.externalUrl || null,
      p_scheduled_for: input.scheduledFor || null,
    });
    throwIfError(updateError, "Unable to update distribution publication");

    const { data, error } = await this.client
      .from("social_publications")
      .select(`
        id, channel, status, message, external_url, scheduled_for, published_at, updated_at,
        article:articles!inner(id, locale, slug, title)
      `)
      .eq("id", input.id)
      .single();
    throwIfError(error, "Unable to update distribution publication");
    return mapPublication(data);
  }

  async listAssets() {
    const { data, error } = await this.client.storage
      .from(mediaBucket)
      .list("", { limit: 100, sortBy: { column: "created_at", order: "desc" } });
    throwIfError(error, "Unable to list media assets");
    return (data ?? [])
      .filter((item) => item.id && item.name)
      .map((item) => ({
        path: item.name,
        url: this.client.storage.from(mediaBucket).getPublicUrl(item.name).data.publicUrl,
        name: typeof item.metadata?.originalName === "string"
          ? item.metadata.originalName
          : item.name,
        mimeType: typeof item.metadata?.mimetype === "string" ? item.metadata.mimetype : "application/octet-stream",
        size: typeof item.metadata?.size === "number" ? item.metadata.size : 0,
        createdAt: item.created_at ?? new Date(0).toISOString(),
      }));
  }

  async isAssetReferenced(path: string) {
    const { data, error } = await this.client.rpc("is_editorial_media_referenced", {
      p_name: path,
    });
    throwIfError(error, "Unable to check media references");
    if (typeof data !== "boolean") throw new Error("Unable to resolve media references");
    return data;
  }

  async uploadAsset(input: MediaUpload) {
    const extension = input.mimeType.split("/")[1]?.replace("jpeg", "jpg") || "bin";
    const path = `${crypto.randomUUID()}.${extension}`;
    const { error } = await this.client.storage.from(mediaBucket).upload(path, input.bytes, {
      cacheControl: "31536000",
      contentType: input.mimeType,
      metadata: { originalName: input.name },
      upsert: false,
    });
    throwIfError(error, "Unable to upload media asset");
    return {
      path,
      url: this.client.storage.from(mediaBucket).getPublicUrl(path).data.publicUrl,
      name: input.name,
      mimeType: input.mimeType,
      size: input.bytes.byteLength,
      createdAt: new Date().toISOString(),
    };
  }

  async deleteAsset(path: string) {
    const { error } = await this.client.storage.from(mediaBucket).remove([path]);
    throwIfError(error, "Unable to delete media asset");
  }
}
