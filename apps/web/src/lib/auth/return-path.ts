import { defaultLocale, isLocale, type Locale } from "@atlasnews/core/locale";

/** Platform-owned paths on Sites, and our own auth routes: never a place to come back to. */
const reservedPaths = new Set(["/signin-with-chatgpt", "/signout-with-chatgpt", "/callback"]);

/**
 * A same-origin path to come back to after signing in or out; anything else (another origin, a protocol-
 * relative or backslash trick, a platform or auth path) becomes `/`. The result is the re-serialized
 * path, never the input.
 */
export function safeReturnPath(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  try {
    const url = new URL(value, "https://site.invalid");
    if (url.origin !== "https://site.invalid") return "/";
    if (reservedPaths.has(url.pathname) || url.pathname === "/api/auth" || url.pathname.startsWith("/api/auth/")) return "/";
    // Dot segments and encoded slashes can normalize to `//host`, which a redirect would take as another origin.
    const path = `${url.pathname}${url.search}${url.hash}`;
    return path.startsWith("//") ? "/" : path;
  } catch {
    return "/";
  }
}

/** The language of a site path (`/it/articles/x` is Italian), else the default. */
export function localeOfPath(path: string): Locale {
  const segment = path.split("/")[1]?.split(/[?#]/)[0];
  return isLocale(segment) ? segment : defaultLocale;
}
