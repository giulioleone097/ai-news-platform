import type { MediaRepository } from "@atlasnews/core/editorial/domain/article-repository";
import { maxMediaBytes, mediaImageTypes } from "@atlasnews/core/editorial/domain/editorial-image";
import type { MediaAsset, MediaUpload } from "@atlasnews/core/editorial/domain/editorial-operations";
import type { D1Database, R2Bucket, R2Object } from "../../sites/cloudflare";
import { D1EditorialAccess, type D1EditorialRepositoryOptions } from "./access";
import { errorMessage } from "./sql";

const mediaPrefix = "editorial-media/";
/** Where the site serves an asset from, same origin; the web app's `/media-store/[...path]` route reads it from R2. */
const mediaUrlPrefix = "/media-store/";
const listedAssets = 100;
const mediaPathPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function isMediaPath(path: string) {
  return mediaPathPattern.test(path) && !path.includes("..");
}

/** The R2 object of an uploaded asset, or null when the path is not one an upload can produce or nothing is stored there. */
export async function readSitesMediaObject(bucket: R2Bucket, path: string) {
  return isMediaPath(path) ? bucket.get(`${mediaPrefix}${path}`) : null;
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

/** The uploads on R2 and the check, in D1, of which articles still use them. */
export class D1MediaRepository extends D1EditorialAccess implements MediaRepository {
  readonly writable: boolean;

  constructor(database: D1Database, options: D1EditorialRepositoryOptions) {
    super(database, options);
    this.writable = options.media !== null;
  }

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

  async findAsset(path: string) {
    const bucket = this.options.media;
    if (!bucket || this.options.audience !== "editorial" || !isMediaPath(path)) return null;
    const object = await bucket.head(`${mediaPrefix}${path}`);
    return object ? mapAsset(object) : null;
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
    if (!(mediaImageTypes as readonly string[]).includes(input.mimeType)) throw new Error("Unable to upload media asset: mime type is not supported");
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
