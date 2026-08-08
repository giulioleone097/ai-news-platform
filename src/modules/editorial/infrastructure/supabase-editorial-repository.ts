import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  articleStatuses,
  estimateReadingMinutes,
  slugify,
  socialChannels,
  type Article,
  type ArticleDraftInput,
  type ArticleQuery,
  type SocialChannel,
} from "../domain/article";
import type {
  ArticleRepository,
  NewsletterRepository,
} from "../domain/article-repository";
import { locales, type Locale } from "@/i18n";

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
});

const articleSelect = `
  id, translation_key, locale, slug, title, excerpt, content, cover_image, cover_alt, status,
  featured, reading_minutes, published_at, scheduled_for, created_at, updated_at,
  category:categories!inner(id, translation_key, locale, slug, name, description),
  author:authors!inner(id, name, role, initials, avatar_url),
  distribution:social_publications(channel)
`;

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
  };
}

function throwIfError(error: { message: string } | null, context: string): asserts error is null {
  if (error) throw new Error(`${context}: ${error.message}`);
}

export class SupabaseEditorialRepository
  implements ArticleRepository, NewsletterRepository
{
  constructor(private readonly client: SupabaseClient) {}

  async listPublished(input: ArticleQuery) {
    const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);
    let query = this.client
      .from("articles")
      .select(articleSelect)
      .eq("locale", input.locale)
      .eq("status", "published")
      .lte("published_at", new Date().toISOString())
      .order("published_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit + 1);

    if (input.category) query = query.eq("category.slug", input.category);
    if (input.query?.trim()) {
      query = query.textSearch("search_vector", input.query.trim(), {
        config: input.locale === "it" ? "italian" : "english",
        type: "websearch",
      });
    }
    if (input.cursor) query = query.lt("published_at", input.cursor.publishedAt);

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
      .select(articleSelect)
      .eq("locale", locale)
      .order("updated_at", { ascending: false })
      .limit(100);
    throwIfError(error, "Unable to list studio articles");
    return (data ?? []).map(mapArticle);
  }

  async findBySlug(slug: string, locale: Locale) {
    const { data, error } = await this.client
      .from("articles")
      .select(articleSelect)
      .eq("locale", locale)
      .eq("slug", slug)
      .maybeSingle();
    throwIfError(error, "Unable to read article");
    return data ? mapArticle(data) : null;
  }

  async findById(id: string, locale: Locale) {
    const { data, error } = await this.client
      .from("articles")
      .select(articleSelect)
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
    const [{ data: category, error: categoryError }, { data: authData, error: authError }] =
      await Promise.all([
        this.client
          .from("categories")
          .select("id")
          .eq("locale", input.locale)
          .eq("slug", input.categorySlug)
          .single(),
        this.client.auth.getUser(),
      ]);
    throwIfError(categoryError, "Unknown article category");
    throwIfError(authError, "Unable to identify editor");
    if (!authData.user) throw new Error("An authenticated editor is required");

    const { data: profile, error: profileError } = await this.client
      .from("profiles")
      .select("author_id")
      .eq("id", authData.user.id)
      .single();
    throwIfError(profileError, "Editor profile is incomplete");

    const existing = input.id ? await this.findById(input.id, input.locale) : null;
    if (input.id && !existing) {
      throw new Error(`Article ${input.id} does not exist in locale ${input.locale}`);
    }
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
      author_id: profile.author_id,
      featured: Boolean(input.featured),
      reading_minutes: estimateReadingMinutes(input.content),
      published_at:
        input.status === "published" ? existing?.publishedAt ?? timestamp : existing?.publishedAt,
      scheduled_for: input.status === "scheduled" ? input.scheduledFor ?? null : null,
    };

    const mutation = input.id
      ? this.client.from("articles").update(payload).eq("id", input.id)
      : this.client.from("articles").insert(payload);
    const { data, error } = await mutation.select(articleSelect).single();
    throwIfError(error, "Unable to save article");
    const article = mapArticle(data);
    await this.setDistributionChannels(article.id, input.distribution ?? []);
    return (await this.findById(article.id, input.locale)) ?? article;
  }

  async delete(id: string) {
    const { error } = await this.client.from("articles").delete().eq("id", id);
    throwIfError(error, "Unable to delete article");
  }

  async setDistributionChannels(id: string, channels: SocialChannel[]) {
    const { error: deleteError } = await this.client
      .from("social_publications")
      .delete()
      .eq("article_id", id)
      .neq("status", "published");
    throwIfError(deleteError, "Unable to reset distribution channels");

    if (!channels.length) return;
    const { error } = await this.client.from("social_publications").insert(
      channels.map((channel) => ({
        article_id: id,
        channel,
        status: "ready",
      })),
    );
    throwIfError(error, "Unable to save distribution channels");
  }

  async subscribe(email: string, source: string, locale: Locale) {
    const { error } = await this.client.from("newsletter_subscriptions").insert({
      email: email.trim().toLowerCase(),
      source,
      locale,
    });
    if (error?.code === "23505") return "existing" as const;
    throwIfError(error, "Unable to subscribe");
    return "created" as const;
  }
}
