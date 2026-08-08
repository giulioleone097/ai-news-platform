import type { MetadataRoute } from "next";
import { getPublicSiteUrl } from "@/config/env";
import { locales, localizedPath } from "@/i18n";
import {
  getPublicCategories,
  searchPublishedArticles,
} from "@/modules/editorial/application/queries";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getPublicSiteUrl();
  const localizedData = await Promise.all(
    locales.map(async (locale) => {
      const [page, categories] = await Promise.all([
        searchPublishedArticles({ locale, limit: 100 }),
        getPublicCategories(locale),
      ]);
      return { locale, articles: page.items, categories };
    }),
  );

  const absolute = (path: string) => new URL(path, base).toString();
  const withDefault = (languages: Record<string, string>) => ({
    ...languages,
    "x-default": languages.en,
  });
  const homeLanguages = withDefault(Object.fromEntries(
    locales.map((locale) => [locale, absolute(localizedPath("/", locale))]),
  ));
  const latestLanguages = withDefault(Object.fromEntries(
    locales.map((locale) => [locale, absolute(localizedPath("/latest", locale))]),
  ));

  return [
    ...localizedData.flatMap(({ locale, articles, categories }) => [
      {
        url: absolute(localizedPath("/", locale)),
        changeFrequency: "daily" as const,
        priority: locale === "en" ? 1 : 0.9,
        alternates: { languages: homeLanguages },
      },
      {
        url: absolute(localizedPath("/latest", locale)),
        changeFrequency: "hourly" as const,
        priority: 0.9,
        alternates: { languages: latestLanguages },
      },
      ...categories.map((category) => {
        const languages = withDefault(Object.fromEntries(
          localizedData.map((localized) => {
            const peer = localized.categories.find(
              (item) => item.translationKey === category.translationKey,
            );
            return [
              localized.locale,
              absolute(localizedPath(`/categories/${peer?.slug ?? category.slug}`, localized.locale)),
            ];
          }),
        ));
        return {
          url: absolute(localizedPath(`/categories/${category.slug}`, locale)),
          changeFrequency: "daily" as const,
          priority: 0.7,
          alternates: { languages },
        };
      }),
      ...articles.map((article) => {
        const languages = withDefault(Object.fromEntries(
          localizedData.map((localized) => {
            const peer = localized.articles.find(
              (item) => item.translationKey === article.translationKey,
            );
            return [
              localized.locale,
              absolute(localizedPath(`/articles/${peer?.slug ?? article.slug}`, localized.locale)),
            ];
          }),
        ));
        return {
          url: absolute(localizedPath(`/articles/${article.slug}`, locale)),
          lastModified: article.updatedAt,
          changeFrequency: "weekly" as const,
          priority: article.featured ? 0.9 : 0.7,
          alternates: { languages },
        };
      }),
    ]),
  ];
}
