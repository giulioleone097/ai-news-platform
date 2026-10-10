import { getPublicSiteUrl } from "@atlasnews/adapters/config/env";
import type { EditorialCacheInvalidator } from "@atlasnews/core/editorial/application/cache-port";

const requestTimeoutMs = 5_000;

/**
 * Purges the reader site's Next cache from this separate process. Without a shared secret it
 * does nothing, and a failed call never fails the edit: the site then refreshes on its own
 * revalidate windows.
 */
export function createWebCacheInvalidator(
  options: { origin?: URL; secret?: string | undefined; fetchImpl?: typeof fetch } = {},
): EditorialCacheInvalidator {
  const { fetchImpl = fetch } = options;
  return async (invalidation) => {
    const secret = (options.secret ?? process.env.ATLASNEWS_REVALIDATE_SECRET)?.trim();
    if (!secret) return;
    try {
      const response = await fetchImpl(new URL("/api/revalidate", options.origin ?? getPublicSiteUrl()), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
        body: JSON.stringify({ locale: invalidation.locale, slugs: [...new Set(invalidation.slugs)] }),
        signal: AbortSignal.timeout(requestTimeoutMs),
      });
      if (!response.ok) console.warn(`mcp: web cache revalidation answered ${response.status}`);
    } catch {
      console.warn("mcp: web cache revalidation failed");
    }
  };
}
