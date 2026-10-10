import * as z from "zod/v4";

import { mediaBatchLimit } from "@atlasnews/core/editorial/domain/errors";

import { destructive, readOnly, write } from "../annotations";
import { defineSpec } from "../capability";
import { editorialUnavailable, mediaBatchNote, record } from "./editorial";
import { batchOutput } from "./shared";

const mediaTypeSchema = z.enum(["image/avif", "image/gif", "image/jpeg", "image/png", "image/webp"]);
const mediaPathSchema = z.string().trim().min(1).max(256).regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/);

const uploadItem = z.object({
  name: z.string().trim().min(1).max(160),
  mimeType: mediaTypeSchema,
  dataBase64: z.string().min(4).max(220_000).regex(/^[A-Za-z0-9+/]+={0,2}$/),
});

const immutable =
  "Media assets are immutable files: they can be uploaded and deleted but not edited. To change one, upload the new file and point the article's cover at it.";
const uploadRule = "Each image is base64, up to 160 KiB; use AtlasNews Studio for larger files.";
const deleteRule = "An asset that an article uses as its cover cannot be deleted.";

const base = { surfaces: ["mcp", "page"], unavailableMessage: editorialUnavailable } as const;

export const adminListMedia = defineSpec({
  ...base,
  name: "admin_list_media",
  title: "List newsroom media",
  description: `List the assets in the configured editorial media store. ${immutable}`,
  input: z.object({}),
  output: z.object({ writable: z.boolean(), items: z.array(record) }),
  annotations: readOnly,
  scopes: ["newsroom.read"],
});

export const adminUploadMedia = defineSpec({
  ...base,
  name: "admin_upload_media",
  title: "Upload newsroom media",
  description: `Upload one image. ${uploadRule}`,
  input: uploadItem,
  output: z.object({ asset: record }),
  annotations: write,
  scopes: ["newsroom.write"],
});

export const adminDeleteMedia = defineSpec({
  ...base,
  name: "admin_delete_media",
  title: "Delete newsroom media",
  description: `Delete one unused media asset. ${deleteRule}`,
  input: z.object({ path: mediaPathSchema }),
  output: z.object({ deletedPath: z.string() }),
  annotations: destructive,
  scopes: ["newsroom.publish"],
  confirmation: { question: ({ path }) => `Permanently delete the media asset “${path}”?` },
});

export const adminUploadMediaAssets = defineSpec({
  ...base,
  name: "admin_upload_media_assets",
  title: "Upload many newsroom media assets",
  description: `Upload several images in one call. ${uploadRule}${mediaBatchNote}`,
  input: z.object({ items: z.array(uploadItem).min(1).max(mediaBatchLimit) }),
  output: batchOutput(z.literal("uploaded"), { path: z.string(), url: z.string(), name: z.string() }),
  annotations: write,
  scopes: ["newsroom.write"],
});

export const adminDeleteMediaAssets = defineSpec({
  ...base,
  name: "admin_delete_media_assets",
  title: "Delete many newsroom media assets",
  description: `Delete several unused media assets. ${deleteRule}${mediaBatchNote}`,
  input: z.object({ paths: z.array(mediaPathSchema).min(1).max(mediaBatchLimit) }),
  output: batchOutput(z.literal("deleted"), { path: z.string() }),
  annotations: destructive,
  scopes: ["newsroom.publish"],
  confirmation: {
    question: ({ paths }) => `Permanently delete ${paths.length} media asset${paths.length === 1 ? "" : "s"}: ${paths.join(", ")}?`,
  },
});

export const mediaSpecs = [
  adminListMedia,
  adminUploadMedia,
  adminDeleteMedia,
  adminUploadMediaAssets,
  adminDeleteMediaAssets,
] as const;
