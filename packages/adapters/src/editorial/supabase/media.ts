import type { SupabaseClient } from "@supabase/supabase-js";
import type { MediaRepository } from "@atlasnews/core/editorial/domain/article-repository";
import type { MediaUpload } from "@atlasnews/core/editorial/domain/editorial-operations";
import { throwIfError } from "../../supabase/errors";

const mediaBucket = "editorial-media";

/** The uploads in the `editorial-media` Storage bucket. */
export class SupabaseMediaRepository implements MediaRepository {
  readonly writable = true;

  constructor(private readonly client: SupabaseClient) {}

  async listAssets() {
    const { data, error } = await this.client.storage
      .from(mediaBucket)
      .list("", { limit: 100, sortBy: { column: "created_at", order: "desc" } });
    throwIfError(error, "Unable to list media assets");
    return (data ?? []).filter((item) => item.id && item.name).map((item) => this.mapAsset(item));
  }

  async findAsset(path: string) {
    const { data, error } = await this.client.storage.from(mediaBucket).list("", { search: path });
    throwIfError(error, "Unable to load media asset");
    const item = (data ?? []).find((candidate) => candidate.id && candidate.name === path);
    return item ? this.mapAsset(item) : null;
  }

  private mapAsset(item: { name: string; created_at?: string | null; metadata?: Record<string, unknown> | null }) {
    return {
      path: item.name,
      url: this.client.storage.from(mediaBucket).getPublicUrl(item.name).data.publicUrl,
      name: typeof item.metadata?.originalName === "string" ? item.metadata.originalName : item.name,
      mimeType: typeof item.metadata?.mimetype === "string" ? item.metadata.mimetype : "application/octet-stream",
      size: typeof item.metadata?.size === "number" ? item.metadata.size : 0,
      createdAt: item.created_at ?? new Date(0).toISOString(),
    };
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
    return this.deleteAssets([path]);
  }

  async deleteAssets(paths: string[]) {
    const { data, error } = await this.client.storage.from(mediaBucket).remove(paths);
    throwIfError(error, "Unable to delete media assets");
    if (data && data.length !== paths.length) throw new Error("Unable to delete media assets");
  }
}
