import { defaultCoverImage } from "@atlasnews/core/editorial/domain/article";
import type { MediaRepository } from "@atlasnews/core/editorial/domain/article-repository";
import { getEditorialMediaReferenceKey } from "@atlasnews/core/editorial/domain/editorial-image";
import type { MediaUpload } from "@atlasnews/core/editorial/domain/editorial-operations";
import { seedArticles } from "../seed";
import type { MemoryEditorialStore } from "./store";

/** The demo has one bundled asset and no storage to upload to. */
export class MemoryMediaRepository implements MediaRepository {
  readonly writable = false;

  constructor(private readonly store: MemoryEditorialStore) {}

  async listAssets() {
    return [{
      path: defaultCoverImage.slice(1),
      url: defaultCoverImage,
      name: defaultCoverImage.split("/").at(-1) ?? defaultCoverImage,
      mimeType: "image/webp",
      size: 129_262,
      createdAt: seedArticles.at(-1)?.createdAt ?? new Date(0).toISOString(),
    }];
  }

  async findAsset(path: string) {
    return (await this.listAssets()).find((asset) => asset.path === path) ?? null;
  }

  async isAssetReferenced(path: string) {
    return this.store.articles.some(
      (article) => getEditorialMediaReferenceKey(article.coverImage) === path,
    );
  }

  async uploadAsset(input: MediaUpload): Promise<never> {
    void input;
    throw new Error("Media uploads require media storage");
  }

  async deleteAsset(path: string): Promise<never> {
    void path;
    throw new Error("Bundled demo assets cannot be deleted");
  }

  async deleteAssets(paths: string[]): Promise<never> {
    void paths;
    throw new Error("Bundled demo assets cannot be deleted");
  }
}
