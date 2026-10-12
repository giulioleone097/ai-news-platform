import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { EntityAdminRepository, EntityWrite } from "@atlasnews/core/editorial/domain/entity";
import { throwIfError } from "../../supabase/errors";
import { entitySelect, mapEntityRecord } from "./entity-rows";

/** The entities as editors manage them. */
export class SupabaseEntityAdminRepository implements EntityAdminRepository {
  constructor(private readonly client: SupabaseClient) {}

  async listEntityRecords() {
    const { data, error } = await this.client.from("entities").select(entitySelect).order("name");
    throwIfError(error, "Unable to list entities");
    return (data ?? []).map(mapEntityRecord);
  }

  private async entityRecords(slugs: string[]) {
    const { data, error } = await this.client.from("entities").select(entitySelect).in("slug", slugs);
    throwIfError(error, "Unable to read entities");
    const bySlug = new Map((data ?? []).map(mapEntityRecord).map((record) => [record.slug, record]));
    return slugs.map((slug) => {
      const record = bySlug.get(slug);
      if (!record) throw new Error("Saved entity could not be read back");
      return record;
    });
  }

  private entityRows(items: EntityWrite[]) {
    return items.map((item) => ({
      kind: item.kind,
      slug: item.slug,
      name: item.name,
      official_url: item.officialUrl,
      parent_slug: item.parentSlug,
      descriptions: item.descriptions,
    }));
  }

  async createEntities(items: EntityWrite[]) {
    const { error } = await this.client.rpc("create_entities_batch", { p_items: this.entityRows(items) });
    throwIfError(error, "Unable to create entities");
    return this.entityRecords(items.map((item) => item.slug));
  }

  async updateEntities(items: EntityWrite[]) {
    const { error } = await this.client.rpc("update_entities_batch", { p_items: this.entityRows(items) });
    throwIfError(error, "Unable to update entities");
    return this.entityRecords(items.map((item) => item.slug));
  }

  async deleteEntities(slugs: string[]) {
    const { error } = await this.client.rpc("delete_entities_batch", { p_slugs: slugs });
    throwIfError(error, "Unable to delete entities");
  }

  async countEntityStories(slugs: string[]) {
    const { data, error } = await this.client.from("entities").select("id, slug").in("slug", slugs);
    throwIfError(error, "Unable to read entities");
    const idBySlug = new Map(z.array(z.object({ id: z.string(), slug: z.string() })).parse(data ?? [])
      .map((row) => [row.slug, row.id]));
    return new Map(await Promise.all(slugs.map(async (slug) => {
      const { count, error: countError } = await this.client
        .from("article_entities")
        .select("article_id", { count: "exact", head: true })
        .eq("entity_id", idBySlug.get(slug) ?? "");
      throwIfError(countError, "Unable to count entity stories");
      return [slug, count ?? 0] as const;
    })));
  }
}
