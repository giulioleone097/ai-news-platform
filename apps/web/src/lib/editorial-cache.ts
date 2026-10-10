import "server-only";

import { revalidatePath, revalidateTag } from "next/cache";
import type { EditorialCacheInvalidation } from "@atlasnews/core/editorial/application/cache-port";

export const articlesCacheTag = "articles";

/**
 * Dynamic pages are matched by their route pattern: a page's cache tag carries the literal
 * `[locale]` segment, so a concrete locale would not reach it.
 * The md/ and entity-feed routes read entity data tagged with `articlesCacheTag`, which expires them.
 */
export function invalidatePublicEditorialCache({
  locale,
  slugs,
}: EditorialCacheInvalidation) {
  revalidateTag(articlesCacheTag, { expire: 0 });
  revalidatePath(`/${locale}`);
  revalidatePath(`/${locale}/latest`);
  revalidatePath(`/${locale}/search`);
  revalidatePath(`/${locale}/entities`);
  revalidatePath("/[locale]/articles/[slug]", "page");
  revalidatePath("/[locale]/categories/[slug]", "page");
  revalidatePath("/[locale]/entities/[slug]", "page");
  revalidatePath("/[locale]/status/[status]", "page");
  for (const slug of new Set(slugs)) {
    revalidatePath(`/${locale}/articles/${slug}`);
    revalidatePath(`/${locale}/md/articles/${slug}`);
  }
  revalidatePath("/api/articles");
  revalidatePath(`/${locale}/feed.xml`);
  revalidatePath(`/${locale}/feed.json`);
  revalidatePath("/sitemap.xml");
  revalidatePath("/news-sitemap.xml");
  revalidatePath("/llms.txt");
}
