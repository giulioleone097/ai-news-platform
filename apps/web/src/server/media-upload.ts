import "server-only";

import { redirect } from "next/navigation";
import { MediaCommandService } from "@atlasnews/core/editorial/application/media-commands";
import { maxMediaBytes } from "@atlasnews/core/editorial/domain/editorial-image";
import type { MediaAsset } from "@atlasnews/core/editorial/domain/editorial-operations";
import { EditorialRuleError } from "@atlasnews/core/editorial/domain/errors";
import type { Locale } from "@/i18n";
import { authorizeEditorCapability } from "@/server/capabilities";
import { getStudioAdminEditorialRepository } from "@/server/composition";

export type MediaUploadFailure = "type" | "size" | "configuration" | "upload";

export type MediaUploadOutcome = { ok: true; asset: MediaAsset } | { ok: false; error: MediaUploadFailure };

/** What a refused upload tells the person: the file is not an accepted image, is too big, or storage is not set up. */
const failureOfCode: Partial<Record<NonNullable<EditorialRuleError["code"]>, MediaUploadFailure>> = {
  "media.unsupportedType": "type",
  "media.signatureMismatch": "type",
  "media.tooLarge": "size",
  "media.notWritable": "configuration",
};

/**
 * Stores one image that an editor sent from the Studio. It is `admin_upload_media` without the base64:
 * the capability carries an image as text of up to 160 KiB, which suits an agent, and the Studio takes
 * files of up to `maxMediaBytes` from the browser. So the rules stay in one place, `MediaCommandService`
 * (type, size, signature, storage), and the same editor and scope check as the capability runs first;
 * only the way the bytes arrive differs. Nobody signed in goes to the login page.
 */
export async function uploadStudioMedia(locale: Locale, file: unknown): Promise<MediaUploadOutcome> {
  const access = await authorizeEditorCapability("admin_upload_media", { locale });
  if (!access.ok) {
    if (access.status === 401) redirect(`/${locale}/login`);
    return { ok: false, error: "upload" };
  }

  if (!(file instanceof File)) return { ok: false, error: "type" };
  // Checked before the file is read, so a huge one is never held in memory.
  if (!file.size || file.size > maxMediaBytes) return { ok: false, error: "size" };

  try {
    const repository = await getStudioAdminEditorialRepository();
    const asset = await new MediaCommandService(repository).uploadOne({
      name: file.name.slice(0, 160),
      mimeType: file.type,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
    return { ok: true, asset };
  } catch (error) {
    if (error instanceof EditorialRuleError && error.code) return { ok: false, error: failureOfCode[error.code] ?? "upload" };
    console.error("studio: media upload failed", error);
    return { ok: false, error: "upload" };
  }
}
