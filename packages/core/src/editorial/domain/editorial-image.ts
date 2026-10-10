const localMediaPath = /^\/media\/[a-zA-Z0-9][a-zA-Z0-9._/-]*$/;
const storagePathPrefix = "/storage/v1/object/public/editorial-media/";

export function getEditorialMediaReferenceKey(value: string) {
  const source = value.trim();
  if (localMediaPath.test(source) && !source.split("/").includes("..")) {
    return source.slice(1);
  }

  try {
    const candidate = new URL(source);
    if (!candidate.pathname.startsWith(storagePathPrefix)) return null;
    const encodedKey = candidate.pathname.slice(storagePathPrefix.length);
    return encodedKey ? decodeURIComponent(encodedKey) : null;
  } catch {
    return null;
  }
}

export function isAllowedEditorialImageSource(value: string) {
  const source = value.trim();
  if (localMediaPath.test(source) && !source.split("/").includes("..")) return true;

  const configured = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!configured) return false;
  try {
    const candidate = new URL(source);
    const supabase = new URL(configured);
    return candidate.protocol === supabase.protocol
      && (candidate.protocol === "https:" || candidate.protocol === "http:")
      && candidate.origin === supabase.origin
      && candidate.pathname.startsWith(storagePathPrefix)
      && candidate.pathname.length > storagePathPrefix.length;
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
