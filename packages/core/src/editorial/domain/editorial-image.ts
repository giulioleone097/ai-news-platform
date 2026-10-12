/** The image types and the size a media upload may have: the one list that the media service and the Studio share. */
export const mediaImageTypes = ["image/avif", "image/gif", "image/jpeg", "image/png", "image/webp"] as const;
export const maxMediaBytes = 8_388_608;

const localMediaPath = /^\/media\/[a-zA-Z0-9][a-zA-Z0-9._/-]*$/;
const storagePathPrefix = "/storage/v1/object/public/editorial-media/";
/** Uploads on ChatGPT Sites live in R2 and are served by the site itself, from its own origin. */
const siteMediaPrefix = "/media-store/";
const siteMediaPath = /^\/media-store\/[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

function isSiteMediaPath(source: string) {
  return siteMediaPath.test(source) && !source.includes("..");
}

export function getEditorialMediaReferenceKey(value: string) {
  const source = value.trim();
  if (localMediaPath.test(source) && !source.split("/").includes("..")) {
    return source.slice(1);
  }
  if (isSiteMediaPath(source)) return source.slice(siteMediaPrefix.length);

  try {
    const candidate = new URL(source);
    if (!candidate.pathname.startsWith(storagePathPrefix)) return null;
    const encodedKey = candidate.pathname.slice(storagePathPrefix.length);
    return encodedKey ? decodeURIComponent(encodedKey) : null;
  } catch {
    return null;
  }
}

/** The origin of an object in the public editorial bucket (`/storage/v1/object/public/editorial-media/...`), whoever hosts it. */
function storageOriginOf(source: string) {
  try {
    const candidate = new URL(source);
    return (candidate.protocol === "https:" || candidate.protocol === "http:")
      && candidate.pathname.startsWith(storagePathPrefix)
      && candidate.pathname.length > storagePathPrefix.length
      ? candidate
      : null;
  } catch {
    return null;
  }
}

function isBundledOrSiteMedia(source: string) {
  return (localMediaPath.test(source) && !source.split("/").includes("..")) || isSiteMediaPath(source);
}

/**
 * Whether an address can be an editorial image at all: bundled media, an upload the site serves, or an object
 * of a public editorial bucket. It does not know which bucket this deployment uses; see `isAllowedEditorialImageSource`.
 */
export function hasEditorialImageShape(value: string) {
  const source = value.trim();
  return isBundledOrSiteMedia(source) || storageOriginOf(source) !== null;
}

/**
 * Whether this deployment accepts the image. `storageUrl` is the URL of the Supabase project whose public bucket
 * it uses, handed in by the caller (core reads no environment); without one only bundled and site media pass.
 */
export function isAllowedEditorialImageSource(value: string, storageUrl?: string) {
  const source = value.trim();
  if (isBundledOrSiteMedia(source)) return true;

  const candidate = storageOriginOf(source);
  if (!candidate || !storageUrl?.trim()) return false;
  try {
    const supabase = new URL(storageUrl.trim());
    return candidate.protocol === supabase.protocol && candidate.origin === supabase.origin;
  } catch {
    return false;
  }
}

function ascii(bytes: Uint8Array, start: number, length: number) {
  return String.fromCharCode(...bytes.slice(start, start + length));
}

export function hasExpectedImageSignature(bytes: Uint8Array, mimeType: string) {
  if (mimeType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mimeType === "image/png") {
    return bytes.length >= 8
      && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
        .every((value, index) => bytes[index] === value);
  }
  if (mimeType === "image/gif") {
    const signature = ascii(bytes, 0, 6);
    return signature === "GIF87a" || signature === "GIF89a";
  }
  if (mimeType === "image/webp") {
    return bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP";
  }
  if (mimeType === "image/avif") {
    const brand = ascii(bytes, 8, 4);
    return bytes.length >= 12 && ascii(bytes, 4, 4) === "ftyp" && (brand === "avif" || brand === "avis");
  }
  return false;
}
