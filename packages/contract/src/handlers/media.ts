import { MediaCommandService } from "@atlasnews/core/editorial/application/media-commands";

import { CapabilityFailure, implement } from "../capability";
import {
  adminDeleteMedia,
  adminDeleteMediaAssets,
  adminListMedia,
  adminUploadMedia,
  adminUploadMediaAssets,
} from "../specs/media";

/** The MCP carries images as base64 of up to 160 KiB each; the Studio takes larger files. */
const maxBytes = 163_840;

function decode(dataBase64: string, index: number, name: string) {
  const bytes = Uint8Array.from(Buffer.from(dataBase64, "base64"));
  if (!bytes.byteLength || bytes.byteLength > maxBytes) {
    throw new CapabilityFailure(`Media payload of item #${index} (${name}) exceeds 160 KiB.`);
  }
  return bytes;
}

export const mediaCapabilities = [
  implement(adminListMedia, async (ports) => {
    const repository = await ports.editorial();
    return { writable: repository.writable, items: (await repository.listAssets()).map((asset) => ({ ...asset })) };
  }),

  implement(adminUploadMedia, async (ports, { name, mimeType, dataBase64 }) => {
    const commands = new MediaCommandService(await ports.editorial());
    const asset = await commands.uploadOne({ name, mimeType, bytes: decode(dataBase64, 0, name) });
    return { asset: { ...asset } };
  }),

  implement(adminDeleteMedia, async (ports, { path }) => {
    await new MediaCommandService(await ports.editorial()).deleteOne(path);
    return { deletedPath: path };
  }),

  implement(adminUploadMediaAssets, async (ports, { items }) => {
    const commands = new MediaCommandService(await ports.editorial());
    const assets = await commands.uploadMany(items.map((item, index) => ({
      name: item.name,
      mimeType: item.mimeType,
      bytes: decode(item.dataBase64, index, item.name),
    })));
    return {
      count: assets.length,
      items: assets.map((asset, index) => ({ index, action: "uploaded" as const, path: asset.path, url: asset.url, name: asset.name })),
    };
  }),

  implement(adminDeleteMediaAssets, async (ports, { paths }) => {
    await new MediaCommandService(await ports.editorial()).deleteMany(paths);
    return { count: paths.length, items: paths.map((path, index) => ({ index, action: "deleted" as const, path })) };
  }),
];
