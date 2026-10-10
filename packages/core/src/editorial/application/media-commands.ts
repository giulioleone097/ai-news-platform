import { hasExpectedImageSignature } from "../domain/editorial-image";
import type { MediaRepository } from "../domain/article-repository";
import type { MediaAsset, MediaUpload } from "../domain/editorial-operations";
import {
  assertBatchSize,
  asSingle,
  EditorialRuleError,
  mediaBatchLimit,
  rejectRepeats,
  validateEach,
} from "../domain/errors";

/**
 * Media assets are immutable files: they are uploaded and deleted, never edited. Storage is not a
 * database, so a batch upload that fails halfway removes what it had already stored.
 */
export class MediaCommandService {
  constructor(private readonly repository: MediaRepository) {}

  uploadOne(upload: MediaUpload) {
    return asSingle(async () => (await this.uploadMany([upload]))[0]);
  }

  deleteOne(path: string) {
    return asSingle(async () => (await this.deleteMany([path]))[0]);
  }

  async uploadMany(uploads: MediaUpload[]): Promise<MediaAsset[]> {
    assertBatchSize(uploads.length, mediaBatchLimit, "image");
    this.assertWritable("Media uploads require Supabase Storage.");
    await validateEach(
      uploads,
      (upload) => {
        if (!hasExpectedImageSignature(upload.bytes, upload.mimeType)) {
          throw new EditorialRuleError("Media bytes do not match the declared image type.");
        }
      },
      (upload) => upload.name,
    );
    const stored: MediaAsset[] = [];
    try {
      for (const upload of uploads) stored.push(await this.repository.uploadAsset(upload));
    } catch (error) {
      if (stored.length) await this.repository.deleteAssets(stored.map((asset) => asset.path)).catch(() => undefined);
      throw error;
    }
    return stored;
  }

  /** Returns the paths deleted. An asset that an article still uses as its cover is refused. */
  async deleteMany(paths: string[]) {
    assertBatchSize(paths.length, mediaBatchLimit, "asset");
    this.assertWritable("Media deletion requires Supabase Storage.");
    rejectRepeats(paths, (path) => path, (path) => `The asset "${path}" appears twice`);
    const assets = await this.repository.listAssets();
    await validateEach(
      paths,
      async (path) => {
        if (!assets.some((asset) => asset.path === path)) throw new EditorialRuleError("Media asset not found.");
        if (await this.repository.isAssetReferenced(path)) {
          throw new EditorialRuleError("Media asset is referenced by an article.");
        }
      },
      (path) => path,
    );
    await this.repository.deleteAssets(paths);
    return paths;
  }

  private assertWritable(message: string) {
    if (!this.repository.writable) throw new EditorialRuleError(message);
  }
}
