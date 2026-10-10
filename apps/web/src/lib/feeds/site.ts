import { getPublicSiteUrl } from "@atlasnews/adapters/config/env";
import { localizedPath, type Locale } from "@/i18n";

/** The public brand, used where a page names the publication itself (llms.txt, news sitemap). */
export const brandName = "AtlasNews";

export function siteUrl(path: string) {
  return new URL(path, getPublicSiteUrl()).toString();
}

export function localizedSiteUrl(path: string, locale: Locale) {
  return siteUrl(localizedPath(path, locale));
}

export function storyUrl(locale: Locale, slug: string) {
  return localizedSiteUrl(`/articles/${slug}`, locale);
}

export function entityUrl(locale: Locale, slug: string) {
  return localizedSiteUrl(`/entities/${slug}`, locale);
}
