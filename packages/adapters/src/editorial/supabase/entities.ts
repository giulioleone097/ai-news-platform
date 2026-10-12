import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { claimStatuses } from "@atlasnews/core/editorial/domain/article";
import type {
  EntityKind,
  EntityRepository,
  EntitySummary,
  EntityTimelineItem,
} from "@atlasnews/core/editorial/domain/entity";
import type { Locale } from "@atlasnews/core/locale";
import { throwIfError } from "../../supabase/errors";
import { entitySelect, mapEntity } from "./entity-rows";

/** What the site shows of the entities: the list, one entity and its published timeline. */
export class SupabaseEntityRepository implements EntityRepository {
  constructor(private readonly client: SupabaseClient) {}

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
}
