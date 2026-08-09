import "server-only";

import { revalidatePath, revalidateTag } from "next/cache";
import type { EditorialCacheInvalidation } from "@/modules/editorial/application/cache-port";

export const articlesCacheTag = "articles";

export function invalidatePublicEditorialCache({
  locale,
  slugs,
}: EditorialCacheInvalidation) {
  revalidateTag(articlesCacheTag, { expire: 0 });
  revalidatePath(`/${locale}`);
  revalidatePath(`/${locale}/latest`);
  revalidatePath(`/${locale}/search`);
  revalidatePath(`/${locale}/articles/[slug]`, "page");
  revalidatePath(`/${locale}/categories/[slug]`, "page");
  for (const slug of new Set(slugs)) revalidatePath(`/${locale}/articles/${slug}`);
  revalidatePath("/api/articles");
  revalidatePath(`/${locale}/feed.xml`);
  revalidatePath("/sitemap.xml");
}
