import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { socialChannels } from "@atlasnews/core/editorial/domain/article";
import type { DistributionRepository } from "@atlasnews/core/editorial/domain/article-repository";
import {
  distributionStatuses,
  type DistributionPublication,
  type DistributionUpdate,
} from "@atlasnews/core/editorial/domain/editorial-operations";
import { locales, type Locale } from "@atlasnews/core/locale";
import { throwIfError } from "../../supabase/errors";
import { relationOne } from "./shared";

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

/** The social publications of the articles. */
export class SupabaseDistributionRepository implements DistributionRepository {
  constructor(private readonly client: SupabaseClient) {}

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
}
